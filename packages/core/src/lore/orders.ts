import { hashString, mulberry32, type Rng } from '../gen/rng';
import type { LabelFeature } from '../gen/features';
import type { CurseHeart } from '../gen/special';
import type { Underworld } from '../gen/underworld';
import type { Settlement } from '../gen/settlements';
import { CULTURES } from '../names/cultures';
import { namePhrase, type Named } from '../names/names';
import { fantasyRaces } from '../names/world-cultures';
import { cultureFolk, personName } from './names';
import { type Ctx, realmDetails } from './realm';

/**
 * The world's organisations: monster-hunter schools, assassins' brotherhoods, knightly orders, a
 * secret society, mercenary companies, chartered trading companies, the thieves' guilds of the
 * great cities, druid circles, bards' colleges and an explorers' society. Each has a name in its
 * founders' tongue, a founding year, a seat (a city, or a stronghold of its own on the map),
 * chapter houses in other cities, a leader, notable members, contracts or deeds drawn from the
 * world (its wars, rulers, pretenders, faiths, cursed lands, horrors of the deep, trade and
 * colonies) and a short chronicle.
 *
 * Built from the world's lore (the same on every thread, on random streams of its own), so the
 * page (the order window, search) and the towns worker (chapter houses on plans, strongholds as
 * sites) agree. Nothing else in the world changes.
 */

export type OrderKind = 'hunters' | 'assassins' | 'knights' | 'society' | 'mercenaries' | 'traders' | 'thieves' | 'druids' | 'bards' | 'explorers';
/** A stronghold of an order's own, built by the towns worker as a site with a plan and a keyed map. */
export type HoldKind = 'school' | 'commandery' | 'retreat' | 'camp' | 'circle';

export const ORDER_KIND_LABEL: Record<OrderKind, string> = {
  hunters: 'Monster-hunter school', assassins: 'Assassins\' brotherhood', knights: 'Knightly order', society: 'Secret society', mercenaries: 'Mercenary company',
  traders: 'Trading company', thieves: 'Thieves\' guild', druids: 'Druid circle', bards: 'Bards\' college', explorers: 'Explorers\' society',
};
export const HOLD_LABEL: Record<HoldKind, string> = { school: 'Hunters\' school', commandery: 'Commandery', retreat: 'Retreat', camp: 'Winter camp', circle: 'Druid circle' };

export interface OrderMember {
  name: string;
  female: boolean;
  /** Their people ("Varskish dwarf"). */
  people: string;
  culture: number;
  rank: string;
  note: string;
}
export interface OrderContract {
  title: string;
  text: string;
  /** Open, taken, done, failed; or a deed of the past. */
  status: string;
  lon?: number;
  lat?: number;
}
export interface OrderChapter {
  /** The settlement id of the city it stands in, and the city's name. */
  sid: string;
  city: string;
  /** The house's name on the plan ("the Commandery of X", "Rosewater's, perfumers"). */
  house: string;
  /** A front: a business that hides it. */
  front?: boolean;
}
export interface OrderSeat {
  kind: 'city' | 'hold' | 'hidden';
  name: string;
  lon: number;
  lat: number;
  sid?: string;
  hold?: HoldKind;
  /** Where the stronghold stands, for its title ("in the mountains of X"). */
  where?: string;
}
export interface Order {
  id: number;
  key: string;
  kind: OrderKind;
  name: string;
  en: string;
  motto: string;
  founded: number;
  culture: number;
  about: string;
  secret: boolean;
  seat: OrderSeat;
  chapters: OrderChapter[];
  leader: OrderMember;
  members: OrderMember[];
  contracts: OrderContract[];
  chronicle: { year: number; text: string }[];
  /** Knightly orders: the faith they serve. */
  faith?: number;
  /** The realm that charters or shelters it, if any. */
  realm?: number;
}

export interface OrderInputs {
  seed: string;
  features: LabelFeature[];
  curses?: CurseHeart[];
  underworld?: Underworld;
}

const cache = new WeakMap<object, Order[]>();

const FOLK_ONE: Record<string, string> = {
  Elves: 'elf', Dwarves: 'dwarf', Halflings: 'halfling', Orcs: 'orc', Lizardfolk: 'lizardfolk',
  'Shadow elves': 'shadow elf', 'Deep gnomes': 'deep gnome', 'Fungus folk': 'fungus folk', 'Grey dwarves': 'grey dwarf',
};
const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const the = (n: string) => (/^the /i.test(n) || !/ of /.test(n) ? n : `the ${n}`);
const distKm = (a: number, b: number, c: number, d: number) => {
  const dl = ((((c - a) % 360) + 540) % 360) - 180;
  return Math.hypot(dl * 111.32 * Math.cos((((b + d) / 2) * Math.PI) / 180), (d - b) * 110.57);
};

// ---- Names, ranks, notes ------------------------------------------------------------------------

const BEASTS = ['Heron', 'Stag', 'Raven', 'Boar', 'Hound', 'Owl', 'Badger', 'Falcon', 'Hare', 'Ram', 'Pike', 'Crane'];
const ASSASSINS = ['the Quiet Hand', 'the Brotherhood of the Last Breath', 'the Hollow Knives', 'the Sisterhood of the Red Thread', 'the Order of the Silent Bell', 'the Unseen'];
const SOCIETIES = ['the Lantern', 'the Unseen Council', 'the Compass and Key', 'the Ninefold Circle', 'the Gilded Eye', 'the Quiet Accord'];
const COMPANIES = ['the Iron Company', 'the White Company', 'the Ashen Company', 'the Company of the Rose', 'the Lean Wolves', 'the Grey Lances', 'the Free Spears', 'the Black Band', 'the Company of the Broken Wheel'];
const GUILDS = ['the Guild of Shadows', 'the Night Market', 'the Rat Court', 'the Brotherhood of the Lamp', 'the Gutter Kings', 'the Velvet Hand', 'the Hidden Fraternity', 'the Lantern Lane Boys'];
const MOTTOES: Record<OrderKind, string[]> = {
  hunters: ['For coin, not for glory.', 'What hunts the dark, the dark fears.', 'Steel for men, silver for the rest.', 'We walk where others run.'],
  assassins: ['Nothing is owed that is not paid.', 'The quiet word ends all quarrels.', 'Unseen, unheard, unforgiven.', 'One cut, no more.'],
  knights: ['Faith before blood.', 'We hold the road.', 'Not unto us.', 'Shield of the faithful.'],
  society: ['Light is kept for those who can bear it.', 'Ordo ab chao.', 'The hand moves; the hand is not seen.', 'All roads, one map.'],
  mercenaries: ['Paid in full.', 'Hire us before your enemy does.', 'No banner but our own.', 'We do not lose; we renegotiate.'],
  traders: ['Profit and peril.', 'By sea, by right, by charter.', 'Every port a purse.', 'Weight, measure and trust.'],
  thieves: ['What is locked is only waiting.', 'Take from the fat.', 'Silence is the price of the night.', 'Everything has an owner, for now.'],
  druids: ['The forest remembers.', 'Root and stone endure.', 'Nothing grows that was not first buried.', 'We keep the old ways.'],
  bards: ['A song outlives a king.', 'Truth, sweetly told.', 'Remember, and be remembered.', 'The last word is ours.'],
  explorers: ['Beyond the last map.', 'Go and see.', 'Every coast has another side.', 'Knowledge by footsteps.'],
};
const LEADER: Record<OrderKind, (f: boolean) => string> = {
  hunters: () => 'Master of the School', assassins: (f) => (f ? 'the Mother of Knives' : 'the Nameless Master'), knights: () => 'Grandmaster',
  society: () => 'the First Voice', mercenaries: () => 'Captain-General', traders: () => 'Governor', thieves: (f) => (f ? 'Queen of Rats' : 'King of Rats'),
  druids: () => 'Archdruid', bards: () => 'Master of the College', explorers: () => 'President of the Society',
};
const RANKS: Record<OrderKind, string[]> = {
  hunters: ['hunter', 'journeyman hunter', 'master-at-arms', 'alchemist', 'trainee', 'tracker'],
  assassins: ['blade', 'whisper', 'poisoner', 'novice', 'informant', 'keeper of the ledger'],
  knights: ['Marshal', 'Commander', 'knight-brother', 'chaplain', 'sergeant', 'Draper'],
  society: [],
  mercenaries: ['lieutenant', 'paymaster', 'standard-bearer', 'sergeant', 'surgeon', 'master of horse'],
  traders: ['treasurer', 'ship\'s master', 'agent', 'chief clerk', 'factor'],
  thieves: ['fence', 'cutpurse', 'second-storey man', 'fixer', 'lookout', 'forger'],
  druids: ['druid', 'ovate', 'warden of the grove', 'seer', 'herbalist'],
  bards: ['loremaster', 'minstrel', 'satirist', 'herald', 'student'],
  explorers: ['fellow', 'cartographer', 'navigator', 'naturalist', 'patron'],
};
const NOTES: Record<OrderKind, string[]> = {
  hunters: ['Carries the scars of a basilisk on one arm and will not speak of it.', 'Has never failed a contract, and charges accordingly.', 'Brews the school\'s potions; half of them are poison to anyone untrained.', 'Was a farm child taken in payment for a contract twenty years ago.', 'Keeps a bestiary in a cipher of her own.', 'Drinks too much between contracts.'],
  assassins: ['Has a face no one remembers, which is the point.', 'Poisons with flowers, and keeps a garden for it.', 'Trained as a priest before the brotherhood found a better use for him.', 'Has refused one contract, and is watched for it.', 'Keeps the ledger of every debt the brotherhood is owed.', 'Was the target of a contract once, and talked the blade into recruiting her.'],
  knights: ['Took the vows after killing a man in a duel.', 'The best lance of the order, and its proudest.', 'Keeps the order\'s accounts and lends to kings.', 'Has seen a miracle, and has not been the same since.', 'Speaks for the order at the court of the faith\'s head.', 'Doubts, quietly.'],
  society: ['Has been a member for thirty years and never seen the First Voice\'s face.', 'Joined to save a brother, and stays out of fear.', 'Passes the society\'s letters in the diplomatic pouch.', 'Believes the society\'s aim is noble; it may be.', 'Is about to be asked to betray their own ruler.'],
  mercenaries: ['Has changed sides twice in one war and been paid both times.', 'Keeps the company\'s accounts and its secrets.', 'A disinherited heir fighting for a name.', 'Has the best eye for ground in the company.', 'Owes money to half the company.', 'Sews up the wounded and buries the rest.'],
  traders: ['Has a monopoly on the pepper trade and an enemy in every port.', 'Bribes customs officers as a matter of routine.', 'Lost three ships last year, and blames the company\'s rivals.', 'Keeps two ledgers.', 'Is courting a ruler for a new charter.'],
  thieves: ['Can open any lock in the city, and has.', 'Sells to the watch as readily as to the guild.', 'Runs the begging trade on the cathedral steps.', 'Forges seals and signatures, and once a royal pardon.', 'Is quietly planning to take the guildmaster\'s seat.', 'Was a noble\'s daughter once.'],
  druids: ['Speaks with the oaks, or says so.', 'Keeps the calendar of the stones.', 'Has cursed a lord who felled a sacred grove.', 'Heals any who come to the circle, and asks nothing.', 'Has not spoken a word in seven years.'],
  bards: ['Wrote the satire that cost a duke his marriage.', 'Knows four hundred songs and the true story behind each.', 'Is paid by a foreign court for what she hears.', 'Has the best voice in the realm and the worst temper.', 'Is collecting the old ballads before they are lost.'],
  explorers: ['Crossed the great desert with three camels and came back with one.', 'Maps coasts no one else has seen.', 'Collects strange beasts, living and stuffed.', 'Is raising money for the next expedition.', 'Came back from the last one alone.'],
};

const BEASTS_OF: string[] = ['a wyvern', 'a pack of werewolves', 'a basilisk', 'ghouls', 'a troll', 'a cockatrice', 'a wight', 'a giant spider', 'a bog hag', 'a griffin', 'a ghost', 'an ogre'];
const BEASTS_PLAIN: string[] = ['a man-eating wolf', 'a great bear', 'a pack of wild dogs', 'a rabid boar', 'a mad hermit', 'a lion'];

// ---- The world ----------------------------------------------------------------------------------

export function worldOrders(c: Ctx, inp: OrderInputs): Order[] {
  const hit = cache.get(c.L);
  if (hit) return hit;
  const { L, p, units, settlements } = c;
  const seed = inp.seed;
  const fantasy = fantasyRaces();
  const year = L.year;
  const cellOf = (lon: number, lat: number) => Math.min(p.H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * p.H))) * p.W + ((Math.floor(((lon + 180) / 360) * p.W) % p.W) + p.W) % p.W;
  const topAt = (lon: number, lat: number) => {
    const b = p.baronyOf[cellOf(lon, lat)];
    return b >= 0 ? L.topOf[b] : -1;
  };
  const cities = settlements.filter((s) => s.tier === 'city' && !s.colony && s.kind !== 'tribal').sort((a, b) => b.population - a.population || (a.id < b.id ? -1 : 1));
  const towns = settlements.filter((s) => s.tier === 'city' || s.tier === 'town');
  const farFromTowns = (lon: number, lat: number, km: number) => !towns.some((t) => distKm(lon, lat, t.lon, t.lat) < km);
  const nearestCity = (lon: number, lat: number) => cities.reduce((a, b) => (distKm(lon, lat, b.lon, b.lat) < distKm(lon, lat, a.lon, a.lat) ? b : a), cities[0]);
  const feats = (kinds: string[]) => inp.features.filter((f) => kinds.includes(f.properties.kind) && f.geometry.type === 'Point' && !f.properties.zlo);
  const ptOf = (f: LabelFeature) => (f.geometry.type === 'Point' ? f.geometry.coordinates : f.geometry.coordinates[f.geometry.coordinates.length >> 1]);
  const realmName = (id: number) => the(units[id]?.name ?? 'an unknown realm');
  /** A city's people: its own culture, else its realm's. */
  const cultureAt = (s: Settlement) => s.culture ?? units[topAt(s.lon, s.lat)]?.culture ?? 0;
  /** A city as a proper name in a phrase (its own name in English too, not its meaning). */
  const proper = (s: Settlement): Named => ({ name: s.name ?? '', en: s.name ?? '' });
  /** Old World realms only (the New World's tribes keep no such orders). */
  const oldRealm = (u: number) => u >= 0 && units[u].gov !== 'tribal' && units[u].gov !== 'colony';
  /** Names from a list, each used once (until the list runs out). */
  const takers = new Map<string[], number[]>();
  const take = (r: Rng, list: string[]) => {
    const left = takers.get(list) ?? takers.set(list, list.map((_, q) => q)).get(list)!;
    if (!left.length) return pick(r, list);
    return list[left.splice(Math.floor(r() * left.length), 1)[0]];
  };
  const plain = (t: string) => t.replace(/\s*\([^)]*\)/g, '');
  const coinOf = (id: number) => (id >= 0 ? (L.econ.get(id) as { coin?: string } | undefined)?.coin : undefined) ?? 'crowns';
  const presentWars = L.wars.filter((w) => w.end === undefined);
  const out: Order[] = [];

  const people = (ci: number) => {
    const cu = CULTURES[ci];
    const folk = cultureFolk(ci);
    return cu ? (fantasy && FOLK_ONE[folk] ? `${cu.name} ${FOLK_ONE[folk]}` : cu.name) : 'unknown';
  };
  const member = (r: Rng, ci: number, rank: string, note: string, femaleP = 0.3): OrderMember => {
    const female = r() < femaleP;
    const pn = personName(ci, female, r);
    return { name: pn.full, female, people: people(ci), culture: ci, rank, note };
  };
  /** A cast of members of mostly one people, now and then another. */
  const cast = (r: Rng, kind: OrderKind, ci: number, n: number, others: number[], femaleP = 0.3): OrderMember[] => {
    const notes = NOTES[kind].slice().sort(() => r() - 0.5);
    return Array.from({ length: n }, (_, k) => member(r, others.length && r() < 0.3 ? pick(r, others) : ci, RANKS[kind][k % RANKS[kind].length] ?? 'member', notes[k % notes.length], femaleP));
  };
  const make = (kind: OrderKind, k: number, base: Omit<Partial<Order>, 'name'> & { name: Named; culture: number; seat: OrderSeat; about: string; secret?: boolean }, r: Rng, femaleP = 0.3): Order => {
    const founded = year - 40 - Math.floor(r() * 500);
    const lf = r() < femaleP;
    const leaderTitle = LEADER[kind](lf);
    const ln = personName(base.culture, lf, r);
    const leader: OrderMember = { name: ln.full, female: lf, people: people(base.culture), culture: base.culture, rank: leaderTitle, note: pick(r, ['Rose from the lowest rank.', 'Took the seat after the last leader died in strange circumstances.', 'Has led for more than twenty years.', 'Is old, and the succession is already being fought over.', 'Was chosen young, and is still underestimated.', 'Is said never to sleep.']) };
    return {
      id: out.length, key: `${kind}${k}`, kind, name: base.name.name, en: base.name.en, motto: pick(r, MOTTOES[kind]), founded, culture: base.culture, about: base.about,
      secret: !!base.secret, seat: base.seat, chapters: base.chapters ?? [], leader, members: base.members ?? [], contracts: base.contracts ?? [],
      chronicle: [{ year: founded, text: `Founded${base.seat.kind === 'city' ? ` at ${base.seat.name}` : ''}.` }, ...(base.chronicle ?? []), { year: year - 1 - Math.floor(r() * 25), text: `${leader.name} became ${leaderTitle}.` }].sort((a, b) => a.year - b.year),
      ...(base.faith !== undefined ? { faith: base.faith } : {}), ...(base.realm !== undefined ? { realm: base.realm } : {}),
    };
  };
  const rng = (kind: string, k: number) => mulberry32(hashString(`${seed}#orders#${kind}#${k}`));
  /** A stronghold site near a point: away from the towns, else the point itself. */
  const holdSite = (r: Rng, lon: number, lat: number, km: number): [number, number] => {
    for (let t = 0; t < 24; t++) {
      const a = r() * Math.PI * 2, d = (t < 12 ? 0.5 : 1) * (km * (0.3 + 0.7 * r()));
      const x = lon + (Math.cos(a) * d) / (111.32 * Math.max(0.1, Math.cos((lat * Math.PI) / 180))), y = lat + (Math.sin(a) * d) / 110.57;
      if (topAt(x, y) >= 0 && farFromTowns(x, y, 20)) return [x, y];
    }
    return [lon, lat];
  };
  const usedHolds: [number, number][] = [];
  /** Cities already the seat of an order: the next order looks for another. */
  const seats = new Set<string>();
  const freeSeat = (list: Settlement[]) => {
    const s = list.find((x) => !seats.has(x.id)) ?? list[0];
    if (s) seats.add(s.id);
    return s;
  };
  const clearOfHolds = (lon: number, lat: number) => !usedHolds.some(([x, y]) => distKm(lon, lat, x, y) < 60);

  // ---- Monster-hunter schools (fantasy worlds) ----------------------------------------------------------
  if (fantasy) {
    const wild = feats(['mountains', 'forest', 'hills']).filter((f) => { const [x, y] = ptOf(f); return oldRealm(topAt(x, y)); });
    const n = Math.min(wild.length, Math.max(2, Math.min(5, Math.round(cities.length / 90))));
    const r0 = rng('hunters', 0);
    const picks = wild.slice().sort(() => r0() - 0.5);
    for (let k = 0, q = 0; k < n && q < picks.length; q++) {
      const f = picks[q];
      const [x0, y0] = ptOf(f);
      if (!clearOfHolds(x0, y0)) continue;
      const r = rng('hunters', k + 1);
      const [lon, lat] = holdSite(r, x0, y0, 40);
      usedHolds.push([lon, lat]);
      const top = topAt(lon, lat);
      const ci = units[top]?.culture ?? 0;
      const beast = take(r, BEASTS);
      const name = namePhrase(ci, `the School of the ${beast}`);
      const near = cities.filter((s) => distKm(lon, lat, s.lon, s.lat) < 900).slice(0, 12);
      const contracts: OrderContract[] = [];
      for (const h of (inp.curses ?? []).filter((x) => distKm(lon, lat, x.lon, x.lat) < 1500).slice(0, 2)) {
        contracts.push({ title: `The curse on ${h.region}`, text: `Find what lies at the heart of ${h.region} and end it; the villages around it are emptying.`, status: pick(r, ['open', 'open', 'taken, and the hunter has not returned']), lon: h.lon, lat: h.lat });
      }
      const uw = inp.underworld;
      for (const nd of (uw?.nodes ?? []).filter((x) => x.horror && distKm(lon, lat, x.lon, x.lat) < 2500).slice(0, 1)) {
        contracts.push({ title: `${cap(nd.horror!)}`, text: `Something called ${nd.horror} stirs in ${nd.name}, far below; the deep peoples will pay any price to see it gone.`, status: 'open, and refused by every hunter so far', lon: nd.lon, lat: nd.lat });
      }
      const fs = feats(['forest', 'mountains', 'hills', 'marsh']).filter((g) => { const [x, y] = ptOf(g); return distKm(lon, lat, x, y) < 700; });
      const fsl = fs.slice().sort(() => r() - 0.5), nearl = near.slice().sort(() => r() - 0.5);
      for (let t = 0; t < 4 && fsl.length && nearl.length; t++) {
        const g = fsl[t % fsl.length], town = nearl[t % nearl.length];
        const [gx, gy] = ptOf(g);
        contracts.push({ title: `${cap(pick(r, BEASTS_OF))} in ${g.properties.name}`, text: `Has taken ${pick(r, ['a shepherd', 'two woodcutters', 'a child', 'a tax collector and his escort', 'sheep by the dozen', 'a priest'])} on the road to ${town.name}. The town council offers ${50 + Math.floor(r() * 400)} ${coinOf(topAt(town.lon, town.lat))}.`, status: pick(r, ['open', 'taken', 'done', 'open']), lon: gx, lat: gy });
      }
      out.push(make('hunters', k, {
        name, culture: ci, seat: { kind: 'hold', hold: 'school', name: name.name, lon, lat, where: `in ${f.properties.name}` },
        about: `A school of monster hunters in ${f.properties.name}, who take in orphans and the unwanted and train them hard; few survive the training. Its hunters ride out on contract against the beasts and curses of the land, for pay and nothing else.`,
        members: cast(r, 'hunters', ci, 5 + Math.floor(r() * 3), [], 0.25), contracts,
        chronicle: [{ year: year - 60 - Math.floor(r() * 150), text: `A mob burned the school's outer buildings, blaming the hunters for the beasts they hunt.` }],
        realm: top,
      }, r, 0.25));
      k++;
    }
  }

  // ---- Knightly orders: one for each great faith ---------------------------------------------------------
  const faiths = L.faiths.faiths.filter((f) => (f.cultures.length >= 2 || f.missionary) && f.cultures.some((q) => CULTURES[q] && !CULTURES[q].nw && !CULTURES[q].deep))
    .sort((a, b) => b.cultures.length - a.cultures.length).slice(0, 5);
  faiths.forEach((f, k) => {
    const r = rng('knights', k);
    const ci = f.cultures.find((q) => CULTURES[q] && !CULTURES[q].nw && !CULTURES[q].deep) ?? f.cultures[0] ?? 0;
    const site = f.holySites[0] ?? { name: f.head.seatName, lon: f.head.lon, lat: f.head.lat, what: '' };
    const sym = f.symbol ? f.symbol.replace(/^(a|an|the) /i, '').split(' ').map(cap).join(' ') : 'Faith';
    const tpl = pick(r, [`the Knights of the ${sym}`, `the Order of the ${sym}`, `the Brethren of ${site.name}`, `the Holy Order of the ${sym}`]);
    const name = namePhrase(ci, tpl);
    const [lon, lat] = clearOfHolds(site.lon, site.lat) ? holdSite(r, site.lon, site.lat, 60) : holdSite(r, site.lon, site.lat, 150);
    usedHolds.push([lon, lat]);
    // Commanderies in the great cities of its faithful.
    const chapters: OrderChapter[] = cities.filter((s) => L.faiths.ofCulture[cultureAt(s)] === f.id).slice(0, 6)
      .map((s) => ({ sid: s.id, city: s.name ?? '', house: `the Commandery of ${s.name}` }));
    const contracts: OrderContract[] = [];
    const ofFaith = (u: number) => L.faiths.ofCulture[units[u]?.culture ?? 0] === f.id;
    for (const w of L.wars) {
      const side = w.attackers.some(ofFaith) ? w.attackers : w.defenders.some(ofFaith) ? w.defenders : null;
      if (!side) continue;
      const foes = side === w.attackers ? w.defenders : w.attackers;
      if (foes.every(ofFaith)) continue;
      const ally = side.find(ofFaith)!;
      contracts.push({ title: w.name, text: `${w.end === undefined ? 'Rides' : 'Rode'} with the host of ${realmName(ally)} against ${realmName(foes[0])}.`, status: w.end === undefined ? 'now' : `${w.start}–${w.end}` });
      if (contracts.length >= 4) break;
    }
    for (const h of f.holySites.slice(0, 2)) contracts.push({ title: `The road to ${h.name}`, text: `Keeps the pilgrims' road to ${h.name}, ${h.what}, and the hostels along it.`, status: 'held', lon: h.lon, lat: h.lat });
    out.push(make('knights', k, {
      name, culture: ci, faith: f.id, seat: { kind: 'hold', hold: 'commandery', name: `the Mother House of ${name.en}`, lon, lat, where: `near ${site.name}` },
      about: `A knightly order sworn to ${f.name}: knights who have taken vows of obedience and poverty (the order itself is rich), who guard its holy places and pilgrims, and fight in its wars. Its commanderies stand in the cities of the faithful.`,
      chapters, members: cast(r, 'knights', ci, 5 + Math.floor(r() * 3), f.cultures.slice(1), 0.15), contracts,
      chronicle: [{ year: Math.max(f.founded + 10, year - 300 - Math.floor(r() * 200)), text: `Took its vows before ${f.head.title} at ${f.head.seatName}.` }],
    }, r, 0.15));
  });

  // ---- Assassins -------------------------------------------------------------------------------------
  {
    const n = Math.max(1, Math.min(3, Math.round(cities.length / 180)));
    const mtns = feats(['mountains']);
    for (let k = 0; k < n && cities.length; k++) {
      const r = rng('assassins', k);
      const home = cities[Math.min(cities.length - 1, 3 + k * 7 + Math.floor(r() * 10))];
      const ci = cultureAt(home);
      const name = namePhrase(ci, take(r, ASSASSINS));
      let seat: OrderSeat;
      const m = mtns.filter((f) => { const [x, y] = ptOf(f); return distKm(x, y, home.lon, home.lat) < 1200 && clearOfHolds(x, y); });
      if (m.length && r() < 0.6) {
        const f = pick(r, m);
        const [x, y] = ptOf(f);
        const [lon, lat] = holdSite(r, x, y, 40);
        usedHolds.push([lon, lat]);
        seat = { kind: 'hold', hold: 'retreat', name: namePhrase(ci, pick(r, ['the Monastery of the Closed Eye', 'the House of Silence', 'the Retreat of the Quiet Brothers'])).name, lon, lat, where: `in ${f.properties.name}` };
      } else seat = { kind: 'hidden', name: `somewhere in ${home.name}`, lon: home.lon, lat: home.lat, sid: home.id };
      const FRONTS = ['a perfumer\'s shop', 'a bathhouse', 'a ferry house', 'a dyer\'s yard', 'a fencing school', 'an apothecary'];
      const chapters: OrderChapter[] = [home, ...cities.filter((s) => s !== home && distKm(s.lon, s.lat, home.lon, home.lat) < 1500).slice(0, 3)]
        .map((s, q) => ({ sid: s.id, city: s.name ?? '', house: cap(FRONTS[(q + k) % FRONTS.length]), front: true }));
      // Targets: rulers and pretenders of the realms around it; past rulers who died by the knife.
      const contracts: OrderContract[] = [];
      const realms = [...new Set(cities.filter((s) => distKm(s.lon, s.lat, home.lon, home.lat) < 1600).map((s) => topAt(s.lon, s.lat)).filter((u) => u >= 0))].slice(0, 6);
      for (const u of realms) {
        const d = realmDetails(c, u);
        for (const rg of d.reigns) if (rg.end && /murder|poison|assassin|stabbed|strangled/i.test(rg.end) && contracts.length < 3) contracts.push({ title: rg.styled, text: `${cap(rg.end)}, ${rg.to ?? ''}. The brotherhood was paid.`.replace(', .', '.'), status: 'done' });
      }
      for (const u of realms) {
        const d = realmDetails(c, u);
        if (d.ruler && contracts.length < 6 && r() < 0.5) contracts.push({ title: d.ruler.styled, text: `Of ${realmName(u)}. The client is said to be in ${pick(r, presentWars.filter((w) => w.attackers.includes(u) || w.defenders.includes(u)).map((w) => realmName((w.attackers.includes(u) ? w.defenders : w.attackers)[0])).concat([`${realmName(u)}'s own court`]))}.`, status: pick(r, ['open', 'accepted', 'refused: too dangerous']) });
        const pre = d.claimsOn.find((x) => x.claim.pretender)?.claim.pretender;
        if (pre && contracts.length < 7) contracts.push({ title: pre.name, text: `Pretender to the throne of ${realmName(u)}. Someone on that throne wants the claim to end.`, status: pick(r, ['open', 'accepted']) });
      }
      out.push(make('assassins', k, {
        name, culture: ci, secret: true, seat,
        about: `A brotherhood of assassins whose existence is denied by everyone who has hired it. It works through fronts in the cities, takes contracts by sealed letter, and has never been known to fail a paid one.`,
        chapters, members: cast(r, 'assassins', ci, 5, [], 0.45), contracts,
      }, r, 0.45));
    }
  }

  // ---- The secret society: members from the courts of several realms ---------------------------------
  {
    const r = rng('society', 0);
    const ci = cities[0] ? cultureAt(cities[0]) : 0;
    const name = namePhrase(ci, pick(r, SOCIETIES));
    const tops = units.filter((u) => u.parent < 0 && u.level >= 2 && u.gov !== 'tribal' && u.gov !== 'colony' && u.gov !== 'league').sort((a, b) => b.pop - a.pop).slice(0, 10);
    const members: OrderMember[] = [];
    for (const u of tops) {
      if (members.length >= 6 || r() < 0.35) continue;
      const d = realmDetails(c, u.id);
      const ct = d.ruler?.court?.length ? pick(r, d.ruler.court) : null;
      if (!ct?.name) continue;
      members.push({ name: ct.name, female: false, people: people(u.culture), culture: u.culture, rank: `${ct.office} of ${realmName(u.id)}`, note: pick(r, NOTES.society) });
    }
    const aims = ['to set one ruler over all the realms of the Old World', 'to keep the old knowledge from the faiths', 'to bring down the faith\'s hold on the courts', 'to prepare for something its members will only call the Return', 'to keep the peace between the great realms, whatever it costs', 'to control the coinage of every realm'];
    const aim = pick(r, aims);
    const contracts: OrderContract[] = [];
    const married = [...L.relations.entries()].flatMap(([a, m]) => [...m.entries()].filter(([b, rel]) => rel.married && a < b).map(([b]) => [a, b] as [number, number]));
    if (married.length) { const [a, b] = pick(r, married); contracts.push({ title: 'A marriage', text: `Is said to have arranged the marriage that binds ${realmName(a)} to ${realmName(b)}.`, status: 'rumour' }); }
    if (presentWars.length) { const w = pick(r, presentWars); contracts.push({ title: w.name, text: `Is said to fund both sides of the ${w.name.replace(/^the /i, '')}.`, status: 'rumour' }); }
    const cl = L.claims.find((x) => x.pretender);
    if (cl?.pretender) contracts.push({ title: cl.pretender.name, text: `Is said to be hiding ${cl.pretender.name}, who claims a throne, until the time is right.`, status: 'rumour' });
    contracts.push({ title: 'The Library', text: 'Is said to keep a library of books burned everywhere else.', status: 'rumour' });
    out.push(make('society', 0, {
      name, culture: ci, secret: true, seat: { kind: 'hidden', name: 'no one knows where', lon: cities[0]?.lon ?? 0, lat: cities[0]?.lat ?? 0 },
      about: `A secret society whose members sit in the councils of many realms. Its aim, so far as anyone outside it can tell, is ${aim}. It has no house and no banner; its members know each other by a word and a sign.`,
      members, contracts,
    }, r));
  }

  // ---- Mercenary companies -----------------------------------------------------------------------------
  {
    const n = Math.max(2, Math.min(6, presentWars.length + 1));
    for (let k = 0; k < n && cities.length; k++) {
      const r = rng('mercenaries', k);
      const home = cities[Math.min(cities.length - 1, Math.floor(r() * Math.min(cities.length, 60)))];
      const ci = cultureAt(home);
      const name = namePhrase(ci, take(r, COMPANIES));
      const w = presentWars[k % Math.max(1, presentWars.length)];
      const contracts: OrderContract[] = [];
      let camp: [number, number] = [home.lon, home.lat], where = `outside ${home.name}`;
      if (w) {
        const side = r() < 0.5 ? w.attackers : w.defenders;
        const employer = side[0];
        contracts.push({ title: w.name, text: `In the pay of ${realmName(employer)}, ${300 + Math.floor(r() * 30) * 50} men and ${50 + Math.floor(r() * 20) * 10} lances, at ${1 + Math.floor(r() * 4)} ${coinOf(employer)} a man a month.`, status: 'now' });
        const seatU = units[employer];
        if (seatU) {
          camp = [seatU.lon, seatU.lat];
          where = `near ${seatU.seatName}`;
        }
      }
      for (const pw of L.wars.filter((x) => x.end !== undefined).sort(() => r() - 0.5).slice(0, 2)) {
        contracts.push({ title: pw.name, text: r() < 0.3 ? `Deserted ${realmName(pw.attackers[0])} for better pay from ${realmName(pw.defenders[0])}.` : `Fought for ${realmName(r() < 0.5 ? pw.attackers[0] : pw.defenders[0])}.`, status: `${pw.start}–${pw.end}` });
      }
      const [lon, lat] = holdSite(r, camp[0], camp[1], 30);
      const seatOk = clearOfHolds(lon, lat);
      if (seatOk) usedHolds.push([lon, lat]);
      out.push(make('mercenaries', k, {
        name, culture: ci, seat: seatOk ? { kind: 'hold', hold: 'camp', name: `the camp of ${name.en.replace(/^the /, 'the ')}`, lon, lat, where } : { kind: 'city', name: home.name ?? '', lon: home.lon, lat: home.lat, sid: home.id },
        about: 'A free company of soldiers for hire, under its own banner and its own law. It fights for whoever pays, keeps its contracts to the letter, and winters in a camp of its own when there is no war to be had.',
        chapters: [{ sid: home.id, city: home.name ?? '', house: `the recruiting house of ${name.en}` }],
        members: cast(r, 'mercenaries', ci, 5 + Math.floor(r() * 2), CULTURES.map((_, q) => q).filter((q) => !CULTURES[q].deep).sort(() => r() - 0.5).slice(0, 4), 0.2), contracts,
      }, r, 0.15));
    }
  }

  // ---- Trading companies: chartered in the great ports --------------------------------------------------
  {
    const ports = cities.filter((s) => s.coastal);
    const n = Math.min(ports.length, Math.max(1, Math.min(4, Math.round(ports.length / 60))));
    for (let k = 0; k < n; k++) {
      const r = rng('traders', k);
      const home = freeSeat(ports.slice(k * 3));
      const ci = cultureAt(home);
      const top = topAt(home.lon, home.lat);
      const name = namePhrase(ci, pick(r, ['the {0} Company', 'the Company of Merchant Venturers of {0}', 'the Chartered Company of {0}']), [proper(home)]);
      const factors = ports.filter((s) => s !== home).sort((a, b) => distKm(a.lon, a.lat, home.lon, home.lat) - distKm(b.lon, b.lat, home.lon, home.lat)).filter((_, q) => q % 3 === 0).slice(0, 5);
      const ex = top >= 0 ? realmDetails(c, top).economy : null;
      const contracts: OrderContract[] = [];
      for (const g of (ex?.exports ?? []).slice(0, 2)) contracts.push({ title: `The ${g} trade`, text: `Holds the charter for all ${g} shipped out of ${home.name}.`, status: 'monopoly' });
      for (const f of factors.slice(0, 2)) contracts.push({ title: `${home.name} to ${f.name}`, text: `A convoy of ${3 + Math.floor(r() * 8)} ships, ${pick(r, ['due next month', 'overdue and feared lost', 'loading now', 'beset by pirates on the last run'])}.`, status: 'voyage', lon: f.lon, lat: f.lat });
      const colony = settlements.find((s) => s.colony && distKm(s.lon, s.lat, home.lon, home.lat) < 9000);
      if (colony) contracts.push({ title: `The ${colony.name} venture`, text: `Funds the colony at ${colony.name} across the sea, and expects a return.`, status: 'venture', lon: colony.lon, lat: colony.lat });
      out.push(make('traders', k, {
        name, culture: ci, realm: top, seat: { kind: 'city', name: home.name ?? '', lon: home.lon, lat: home.lat, sid: home.id },
        about: `A chartered company of merchants of ${home.name}, holding the right to trade by sea in the name of ${realmName(top)}. It keeps factor houses in the ports it trades with, its own ships and guards, and more influence at court than most lords.`,
        chapters: [{ sid: home.id, city: home.name ?? '', house: 'the Company House' }, ...factors.map((s) => ({ sid: s.id, city: s.name ?? '', house: `the factor house of ${name.en.replace(/^the /, 'the ')}` }))],
        members: cast(r, 'traders', ci, 5, [], 0.2), contracts,
      }, r, 0.2));
    }
  }

  // ---- Thieves' guilds of the greatest cities -------------------------------------------------------------
  cities.slice(0, Math.min(8, Math.max(2, Math.round(cities.length / 60)))).forEach((s, k) => {
    const r = rng('thieves', k);
    const ci = cultureAt(s);
    const name = namePhrase(ci, `${take(r, GUILDS)} of {0}`, [proper(s)]);
    const top = topAt(s.lon, s.lat);
    const d = top >= 0 ? realmDetails(c, top) : null;
    const contracts: OrderContract[] = [
      { title: 'The counting house', text: `The strongroom of the richest counting house in ${s.name}, on the night of the quarter day.`, status: pick(r, ['planned', 'planned', 'done']) },
      { title: 'The reliquary', text: 'A jewelled reliquary from the great temple, for a collector abroad who asks no questions.', status: pick(r, ['planned', 'done', 'failed']) },
      ...(d?.ruler ? [{ title: 'The seal', text: `A copy of the seal of ${d.ruler.styled}, for a forger's use.`, status: pick(r, ['planned', 'done']) }] : []),
      { title: 'The watch', text: `A captain of the watch of ${s.name}, to be bought or ruined.`, status: pick(r, ['open', 'bought']) },
    ];
    out.push(make('thieves', k, {
      name, culture: ci, secret: true, realm: top, seat: { kind: 'hidden', name: `under ${s.name}`, lon: s.lon, lat: s.lat, sid: s.id },
      about: `The thieves' guild of ${s.name}, which meets in the sewers under the city behind a secret door. It runs the city's thieving, fencing, begging and smuggling, takes its cut of all of them, and keeps the peace among its own.`,
      members: cast(r, 'thieves', ci, 5, [], 0.35), contracts,
    }, r, 0.35));
  });

  // ---- Druid circles: in the great forests ------------------------------------------------------------------
  {
    const forests = feats(['forest']).filter((f) => { const [x, y] = ptOf(f); return oldRealm(topAt(x, y)); });
    const r0 = rng('druids', 0);
    const picks = forests.slice().sort((a, b) => a.properties.rank - b.properties.rank || r0() - 0.5).slice(0, Math.min(3, forests.length));
    picks.forEach((f, k) => {
      const r = rng('druids', k + 1);
      const [x0, y0] = ptOf(f);
      if (!clearOfHolds(x0, y0)) return;
      const [lon, lat] = holdSite(r, x0, y0, 30);
      usedHolds.push([lon, lat]);
      const top = topAt(lon, lat);
      const ci = units[top]?.culture ?? 0;
      const name = namePhrase(ci, `the Circle of {0}`, [{ name: f.properties.name, en: f.properties.en ?? f.properties.name }]);
      const contracts: OrderContract[] = [
        { title: `The felling of ${f.properties.name}`, text: `Stands against the lords who would cut ${f.properties.name} for ships and charcoal.`, status: pick(r, ['ongoing', 'won, for now']) },
        { title: 'The midsummer rite', text: 'Gathers the circle at the stones at midsummer, when the old powers are near.', status: 'each year' },
      ];
      const h = (inp.curses ?? []).find((x) => distKm(x.lon, x.lat, lon, lat) < 1200);
      if (h) contracts.push({ title: h.region, text: `Seeks the root of the curse on ${h.region}, which poisons the land itself.`, status: 'open', lon: h.lon, lat: h.lat });
      out.push(make('druids', k, {
        name, culture: ci, seat: { kind: 'hold', hold: 'circle', name: namePhrase(ci, 'the Stones of {0}', [{ name: f.properties.name, en: f.properties.en ?? f.properties.name }]).name, lon, lat, where: `in ${f.properties.name}` },
        about: `A circle of druids who keep the old ways of ${f.properties.name}: its stones, its springs and its seasons. They heal, advise and curse, and answer to no faith but the forest's.`,
        members: cast(r, 'druids', ci, 4 + Math.floor(r() * 2), [], 0.5), contracts,
      }, r, 0.5));
    });
  }

  // ---- Bards' colleges ------------------------------------------------------------------------------------------
  {
    const pool = cities.filter((s) => s.university).concat(cities.slice(0, 6)).filter((s, q, a) => a.indexOf(s) === q);
    const homes = [freeSeat(pool), freeSeat(pool)].filter((s, q, a) => s && a.indexOf(s) === q);
    homes.forEach((s, k) => {
      const r = rng('bards', k);
      const ci = cultureAt(s);
      const name = namePhrase(ci, pick(r, ['the College of {0}', 'the College of the Silver Lute', 'the Fellowship of Song of {0}']), [proper(s)]);
      const top = topAt(s.lon, s.lat);
      const d = top >= 0 ? realmDetails(c, top) : null;
      const contracts: OrderContract[] = [
        ...(presentWars[k] ? [{ title: `An epic of the ${presentWars[k].name.replace(/^the /i, '')}`, text: `Commissioned by ${realmName(presentWars[k].attackers[0])}, to be sung at the victory feast (there has been no victory yet).`, status: 'commissioned' }] : []),
        ...(d?.ruler ? [{ title: `A satire of ${d.ruler.styled}`, text: 'Sung in every tavern of the city; the author is being sought.', status: 'scandal' }] : []),
        { title: 'The lost ballads', text: 'Sends students into the hills to write down the old songs before the last singers die.', status: 'ongoing' },
      ];
      out.push(make('bards', k, {
        name, culture: ci, realm: top, seat: { kind: 'city', name: s.name ?? '', lon: s.lon, lat: s.lat, sid: s.id },
        about: `A college of bards in ${s.name}, which trains singers, heralds and keepers of lore, keeps the realm's genealogies and songs, and sends its graduates to every court (where some of them listen as well as sing).`,
        chapters: [{ sid: s.id, city: s.name ?? '', house: name.en }, ...cities.filter((x) => x !== s).slice(k * 4, k * 4 + 3).map((x) => ({ sid: x.id, city: x.name ?? '', house: `the song school of ${x.name}` }))],
        members: cast(r, 'bards', ci, 5, [], 0.45), contracts,
      }, r, 0.45));
    });
  }

  // ---- The explorers' society ----------------------------------------------------------------------------------
  {
    const s = freeSeat(cities.filter((x) => x.coastal && x.university).concat(cities.filter((x) => x.coastal)));
    if (s) {
      const r = rng('explorers', 0);
      const ci = cultureAt(s);
      const name = namePhrase(ci, pick(r, ['the Society of Explorers of {0}', 'the Society of the Far Horizon', 'the Geographical Society of {0}']), [proper(s)]);
      const contracts: OrderContract[] = [];
      const peak = feats(['peak']).sort((a, b) => a.properties.rank - b.properties.rank)[0];
      if (peak) contracts.push({ title: `The summit of ${plain(peak.properties.name)}`, text: `An expedition to climb ${plain(peak.properties.name)}, which no one has stood on.`, status: pick(r, ['planned', 'under way', 'failed, with loss of life']), lon: ptOf(peak)[0], lat: ptOf(peak)[1] });
      const nw = settlements.filter((x) => x.colony).sort(() => r() - 0.5)[0];
      if (nw) contracts.push({ title: `Beyond ${nw.name}`, text: `An expedition inland from the colony at ${nw.name}, into country no map shows.`, status: pick(r, ['planned', 'under way', 'overdue']), lon: nw.lon, lat: nw.lat });
      const ab = (inp.underworld?.nodes ?? []).find((x) => x.kind === 'abyss' || x.kind === 'sea');
      if (ab) contracts.push({ title: ab.name, text: `An expedition into the deep, to ${ab.name}, whose depth no one has sounded.`, status: 'planned', lon: ab.lon, lat: ab.lat });
      const desert = feats(['desert'])[0];
      if (desert) contracts.push({ title: `Across ${desert.properties.name}`, text: `A crossing of ${desert.properties.name} from end to end.`, status: pick(r, ['done', 'planned']), lon: ptOf(desert)[0], lat: ptOf(desert)[1] });
      out.push(make('explorers', 0, {
        name, culture: ci, seat: { kind: 'city', name: s.name ?? '', lon: s.lon, lat: s.lat, sid: s.id },
        about: `A learned society in ${s.name} whose fellows travel to the ends of the world and come back to lecture about it. It funds expeditions, keeps a great library of maps and a collection of curiosities, and argues bitterly about the shape of the coasts.`,
        chapters: [{ sid: s.id, city: s.name ?? '', house: `${name.en} rooms` }],
        members: cast(r, 'explorers', ci, 5, [], 0.3), contracts,
      }, r, 0.3));
    }
  }

  // The nearest city, for holds without one.
  for (const o of out) if (o.seat.kind === 'hold' && !o.seat.sid) o.seat.sid = nearestCity(o.seat.lon, o.seat.lat)?.id;
  cache.set(c.L, out);
  return out;
}

/** The chapter houses of every order in a city (for its plan). */
export function chaptersIn(orders: Order[], sid: string): { order: Order; chapter: OrderChapter }[] {
  const outv: { order: Order; chapter: OrderChapter }[] = [];
  for (const o of orders) for (const ch of o.chapters) if (ch.sid === sid) outv.push({ order: o, chapter: ch });
  return outv;
}

export type { Settlement };
