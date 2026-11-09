import { hashString, mulberry32, type Rng } from '../gen/rng';
import type { Politics } from '../gen/politics';
import { CULTURES } from '../names/cultures';
import { fantasyRaces } from '../names/world-cultures';
import { cultureFolk, personName } from '../lore/names';
import { type Ctx, realmDetails, type RealmDetails } from '../lore/realm';
import type { Dungeon, DRoom, Inmate } from './core';
import { isHeld } from './prison';

/**
 * The notable inmates of a prison, one for each numbered cell (and the condemned cell and the
 * oubliette): a name in their own tongue, their people, a crime, a sentence and a hook. The
 * crimes draw on the realm the prison stands in: plots against its ruler, spies and captains of
 * the realms it is at war with, heretics of other faiths and sects, the sworn men of pretenders
 * to its throne, smugglers of its trade goods, outlaws on the roads to its towns. Made on the
 * page from the world's lore (the same every time for the same world), and written into the
 * cells' key as a "Prisoner" note.
 */

const FOLK_ONE: Record<string, string> = {
  Humans: 'human', Elves: 'elf', Dwarves: 'dwarf', Halflings: 'halfling', Orcs: 'orc', Lizardfolk: 'lizardfolk',
  'Shadow elves': 'shadow elf', 'Deep gnomes': 'deep gnome', 'Fungus folk': 'fungus folk', 'Grey dwarves': 'grey dwarf',
};

const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];
/** What the gallery calls those known by a single name. */
const BYNAMES = ['the Knife', 'Halfhand', 'the Rat', 'Longshanks', 'the Quiet', 'Crow', 'Ninefingers', 'the Fox', 'Blackteeth', 'the Scholar', 'the Butcher', 'Lucky',
  'One-Eye', 'the Weasel', 'Redhand', 'the Saint', 'Ashes', 'the Owl', 'Tallow', 'the Smiler'];
const NUM = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'fifteen', 'twenty'];
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen', 'twenty'];
/** A realm's name as it reads in a sentence ("the Tsardom of Duzi"). */
const realmName = (n: string) => (/^the /i.test(n) || !/ of /.test(n) ? n : `the ${n}`);

interface Scene {
  r: Rng;
  det: RealmDetails | null;
  c: Ctx | null;
  /** Towns of the realm (the nearest first), for places in the crimes. */
  towns: string[];
  ruler: string;
  coin: string;
  goods: string[];
  enemies: { name: string; culture: number; war?: string }[];
  /** Faiths and sects other than the realm's: their name and a people who keep them. */
  heresies: { name: string; culture: number }[];
  pretender?: string;
  local: number;
  others: number[];
  fantasy: boolean;
  tunnelCell: number;
  /** Peoples of the deep, now and then taken in raids on the delves. */
  deep: number[];
  /** The inmate being made is a woman (for the crimes' pronouns). */
  female: boolean;
}

type Crime = { w: (s: Scene) => number; capital?: boolean; make: (s: Scene) => { crime: string; culture?: number } };

const CRIMES: Crime[] = [
  { w: () => 3, capital: true, make: (s) => ({ crime: `murdered ${pick(s.r, ['a tax collector', s.female ? 'her husband' : 'his wife', s.female ? 'her brother' : 'his brother', 'a guild master', 'a moneylender', 'a magistrate', 'a rival suitor', 'a ferryman'])} in ${pick(s.r, s.towns)}` }) },
  { w: () => 3, make: (s) => ({ crime: `stole ${pick(s.r, ['the plate of a temple', 'a merchant\'s strongbox', 'horses from the lord\'s stables', 'a reliquary', 'the tolls of a bridge', 'grain from the town granary'])} in ${pick(s.r, s.towns)}` }) },
  { w: (s) => (s.goods.length ? 2 : 0.5), make: (s) => ({ crime: `smuggled ${s.goods.length ? pick(s.r, s.goods) : 'contraband'} past the customs of ${pick(s.r, s.towns)}` }) },
  { w: () => 2, make: (s) => ({ crime: `led a band of outlaws on the road to ${pick(s.r, s.towns)}` }) },
  { w: () => 1.2, make: (s) => ({ crime: `owes ${pick(s.r, ['three hundred', 'a thousand', 'four thousand', 'eighty'])} ${s.coin} to a counting house in ${pick(s.r, s.towns)}` }) },
  { w: (s) => (s.ruler ? 1.6 : 0), capital: true, make: (s) => ({ crime: `plotted against ${s.ruler}` }) },
  { w: (s) => (s.ruler ? 0.8 : 0), make: (s) => ({ crime: `forged the seal of ${s.ruler}` }) },
  { w: (s) => (s.enemies.length ? 2 : 0), capital: true, make: (s) => { const e = pick(s.r, s.enemies); return { crime: `spied for ${e.name}`, culture: e.culture }; } },
  { w: (s) => (s.enemies.some((e) => e.war) ? 2.5 : 0), make: (s) => { const e = pick(s.r, s.enemies.filter((x) => x.war)); return { crime: `a captain of ${e.name}, taken in ${e.war}`, culture: e.culture }; } },
  { w: (s) => (s.heresies.length ? 2 : 0), make: (s) => { const h = pick(s.r, s.heresies); return { crime: `preached ${h.name} in the streets of ${pick(s.r, s.towns)}`, culture: s.r() < 0.6 ? h.culture : undefined }; } },
  { w: (s) => (s.pretender ? 1.5 : 0), capital: true, make: (s) => ({ crime: `swore an oath to ${s.pretender}, who claims the throne` }) },
  { w: (s) => (s.enemies.some((e) => e.war) ? 1 : 0.3), make: (s) => { const e = s.enemies.find((x) => x.war); return { crime: e ? `deserted the army in ${e.war}` : 'deserted the army' }; } },
  { w: (s) => (s.ruler ? 1 : 0), make: (s) => ({ crime: `poached deer in the forests of ${s.ruler}` }) },
  { w: () => 1, capital: true, make: (s) => ({ crime: `set fire to the granary of ${pick(s.r, s.towns)}` }) },
  { w: (s) => (s.fantasy ? 1.2 : 0), capital: true, make: () => ({ crime: 'practised forbidden sorcery' }) },
];

const HOOKS: ((s: Scene, i: Inmate) => string)[] = [
  (s) => `Innocent: the true culprit still walks free in ${pick(s.r, s.towns)}, and pays the warden to keep it so.`,
  (s, i) => `Knows where ${i.female ? 'her' : 'his'} share of the spoils is hidden, and will trade it for a way out.`,
  (s, i) => `The true heir of a noble house, hidden here under another name by ${i.female ? 'her' : 'his'} own kin.`,
  (s) => `Sends letters out with a bribed guard to someone in ${pick(s.r, s.towns)}; the letters are in cipher.`,
  (s, i) => `Would do anything to see ${i.female ? 'her' : 'his'} children once more before the end.`,
  () => 'An informer for the warden, trusted by no one on the gallery and with good reason.',
  (s, i) => `Has a ${i.female ? 'brother' : 'sister'} among the guards, who has not yet found the nerve to help.`,
  () => "Knows the warden's secret, and the warden knows it; the food has started to taste strange.",
  () => 'Has scratched a map of the old drains on the underside of the bunk.',
  () => 'Was taken wearing a ring that no one can name, and a stranger has twice asked to buy it from the warden.',
  () => 'Runs the gallery\'s trade in candles, ale and news, and can get anything for a price.',
  (s) => `Is owed a great favour by someone powerful in ${pick(s.r, s.towns)}, who has not yet paid it.`,
];

/** The roster of a prison (made once per dungeon), with a note in each of their cells. */
export function prisonRoster(d: Dungeon, c: Ctx | null, politics: Politics | null): Inmate[] {
  if (d.roster) return d.roster;
  // Wait for the world's lore: the crimes are told from it.
  if (!c || !politics) return [];
  const r = mulberry32(hashString(`${d.site.id}#inmates#${d.site.seed}`));
  const s = scene(d, c, politics, r);
  const out: Inmate[] = [];
  const usedHooks = new Set<number>();
  const usedNames = new Set<string>();
  d.levels.forEach((L, level) => {
    for (const room of L.rooms) {
      if (!room.n || !isHeld(room)) continue;
      const inmate = make(s, room, level, usedHooks, usedNames);
      out.push(inmate);
      room.notes.unshift({ label: 'Prisoner', text: `${inmate.name} (${inmate.people}), who ${inmate.crime}. ${inmate.sentence}.` });
    }
  });
  d.roster = out;
  return out;
}

function make(s: Scene, room: DRoom, level: number, usedHooks: Set<number>, usedNames: Set<string>): Inmate {
  const { r } = s;
  const tag = room.tags[0];
  const female = r() < 0.3;
  s.female = female;
  let crime: string, culture: number | undefined, capital = false;
  if (tag === 'prison-oubliette') {
    crime = pick(r, ['is held for a crime no one now remembers; the ledger gives only a number', 'was put down here by the last warden, and the new one has never asked why', 'knew too much about a death at court']);
  } else {
    const pool = CRIMES.filter((x) => x.w(s) > 0 && (tag !== 'prison-condemned' || x.capital));
    let t = r() * pool.reduce((a, x) => a + x.w(s), 0);
    const cr = pool.find((x) => (t -= x.w(s)) < 0) ?? pool[pool.length - 1];
    const m = cr.make(s);
    crime = m.crime;
    culture = m.culture;
    capital = !!cr.capital;
  }
  if (culture === undefined) {
    const x = r();
    culture = s.deep.length && x < 0.06 ? pick(r, s.deep) : x < 0.7 || !s.others.length ? s.local : pick(r, s.others);
  }
  let name = '';
  for (let t = 0; t < 6 && (!name || usedNames.has(name)); t++) {
    const pn = personName(culture, female, r);
    // Those with one name are known on the gallery by a second: their town, or a byname.
    name = pn.full !== pn.given ? pn.full : r() < 0.4 ? `${pn.given} of ${pick(r, s.towns)}` : `${pn.given} ${pick(r, BYNAMES)}`;
  }
  usedNames.add(name);
  const folk = cultureFolk(culture);
  const cu = CULTURES[culture];
  const people = cu ? (folk && folk !== 'Humans' && s.fantasy ? `${cu.name} ${FOLK_ONE[folk] ?? folk.toLowerCase()}` : cu.name) : 'unknown';
  const yrs = 2 + Math.floor(r() * 18), served = 1 + Math.floor(r() * yrs * 0.8);
  const fest = cu?.customs?.festivals?.length ? pick(r, cu.customs.festivals).english : '';
  const sentence = tag === 'prison-condemned'
    ? `To hang ${fest ? `on the morning of ${fest}` : pick(r, ['at the next assize', 'at midsummer', 'at the turn of the year', 'within the month'])}`
    : tag === 'prison-oubliette' ? 'No sentence was ever recorded'
    : crime.startsWith('a captain of') ? `Held until a ransom of ${pick(r, NUM)} thousand ${s.coin} is paid`
    : crime.startsWith('owes') ? 'Held until the debt is paid'
    : capital && r() < 0.5 ? (r() < 0.5 ? 'For life' : `At the pleasure of ${s.ruler || 'the crown'}`)
    : r() < 0.2 ? `Awaiting trial these ${pick(r, NUM.slice(0, 6))} years`
    : `${cap(WORDS[Math.min(20, yrs)])} years, ${served} served`;
  const inmate: Inmate = { name, female, people, culture, crime, sentence, cell: room.n, level, hook: '' };
  // A hook of its own; the digger is whoever holds the cell with the tunnel.
  if (room.n === s.tunnelCell) inmate.hook = 'Has been digging a way out behind a loose stone for years, and is nearly there.';
  else {
    let k = Math.floor(r() * HOOKS.length);
    for (let t = 0; t < HOOKS.length && usedHooks.has(k); t++) k = (k + 1) % HOOKS.length;
    usedHooks.add(k);
    inmate.hook = HOOKS[k](s, inmate);
  }
  return inmate;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function scene(d: Dungeon, c: Ctx | null, p: Politics | null, r: Rng): Scene {
  const { lon, lat } = d.site;
  let det: RealmDetails | null = null;
  if (c && p) {
    const i = ((Math.floor(((lon + 180) / 360) * p.W) % p.W) + p.W) % p.W, j = Math.min(p.H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * p.H)));
    const b = p.baronyOf[j * p.W + i];
    if (b >= 0) det = realmDetails(c, c.L.topOf[b]);
  }
  const km = (a: { lon: number; lat: number }) => Math.hypot((a.lon - lon) * Math.cos((lat * Math.PI) / 180), a.lat - lat);
  const towns = det ? det.people.settlements.slice().sort((a, b) => km(a) - km(b)).slice(0, 6).map((x) => x.name) : [];
  const enemies: Scene['enemies'] = [];
  if (det && c) {
    for (const w of det.wars) for (const e of w.enemies) enemies.push({ name: realmName(c.units[e].name), culture: c.units[e].culture, war: `the ${w.war.name}`.replace(/^the the /, 'the ') });
    for (const w of det.pastWars.filter((x) => det!.year - (x.war.end ?? x.war.start) < 25)) {
      for (const e of w.enemies) if (!enemies.some((x) => x.name === realmName(c.units[e].name))) enemies.push({ name: realmName(c.units[e].name), culture: c.units[e].culture, war: `the ${w.war.name}`.replace(/^the the /, 'the ') });
    }
    for (const rv of det.rivals) if (!enemies.some((x) => x.name === realmName(rv.name))) enemies.push({ name: realmName(rv.name), culture: c.units[rv.id].culture });
  }
  const heresies: Scene['heresies'] = [];
  if (det && c) {
    const own = det.faith.faith;
    for (const sect of own.sects) if (sect.id !== det.faith.sect.id) heresies.push({ name: `the teachings of ${sect.name}`, culture: sect.culture });
    for (const f of c.L.faiths.faiths) if (f.id !== own.id && f.cultures.length && f.missionary) heresies.push({ name: f.name, culture: f.cultures[0] });
  }
  const local = d.site.culture;
  const others = det ? det.people.cultures.filter((x) => x.idx >= 0 && x.idx !== local).map((x) => x.idx) : [];
  const fantasy = fantasyRaces();
  // Now and then someone from the deep, taken in a raid on the delves.
  const deep = fantasy ? CULTURES.map((cu, k) => (cu.deep ? k : -1)).filter((k) => k >= 0) : [];
  // The digger: whoever holds the cell nearest the escape tunnel, on its level.
  let tunnelCell = -1;
  for (const L of d.levels) {
    const t = L.rooms.find((x) => x.tags[0] === 'prison-tunnel');
    if (!t) continue;
    const near = L.rooms.filter((x) => x.tags[0] === 'prison-held' && x.n).sort((a, b) => Math.hypot(a.lx - t.lx, a.ly - t.ly) - Math.hypot(b.lx - t.lx, b.ly - t.ly))[0];
    if (near) tunnelCell = near.n;
  }
  return {
    r, det, c, towns: towns.length ? towns : ['the town'], ruler: det?.ruler?.styled ?? '', coin: det?.economy.coin ?? 'crowns',
    goods: det ? [...det.economy.imports, ...det.economy.exports].slice(0, 8) : [], enemies, heresies,
    pretender: det?.claimsOn.find((x) => x.claim.pretender)?.claim.pretender?.name, local, others, fantasy, tunnelCell, deep, female: false,
  };
}
