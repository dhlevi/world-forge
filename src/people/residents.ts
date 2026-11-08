import { hashString, mulberry32, type Rng } from '../gen/rng';
import { type House, familyFirst, familyNameOf, personName, traits as pickTraits } from '../lore/names';
import { CULTURES } from '../names/cultures';
import { type TownCtx, type TownStats, minorityShare } from './town';

/**
 * Who lives in a building: its households, each with its members (names in their own language,
 * people, sex, age, trade and place in the family) and a few ties to the households about them
 * (friends, rivals, debts, feuds, sweethearts, kin by marriage). A household is worked out from
 * the building's id and kind alone, so a neighbour's household (and so both ends of every tie)
 * comes out the same whichever building is opened first.
 */

export type Means = 'destitute' | 'poor' | 'middling' | 'comfortable' | 'rich';
const MEANS: Means[] = ['destitute', 'poor', 'middling', 'comfortable', 'rich'];

export interface Tie {
  kind: 'friend' | 'rival' | 'owes' | 'owed' | 'feud' | 'sweetheart' | 'kin' | 'partner';
  /** "Friends with Aldo Venn, next door to the east." */
  text: string;
}

export interface Person {
  name: string;
  given: string;
  female: boolean;
  age: number;
  culture: number;
  people: string;
  /** What they do. */
  trade: string;
  /** Their place in the household ("head", "wife", "son", "lodger", "cook"...). */
  role: string;
  traits: string[];
  /** Something worth knowing (ill health, a secret). */
  note?: string;
  ties: Tie[];
}

export interface Household {
  name: string;
  means: Means;
  members: Person[];
  /** More of them than are named (a barracks, a monastery). */
  more?: number;
}

/** What residents need to know of a building: its plan properties and size. */
export interface ResidentBuilding {
  bid: string;
  role?: string;
  use?: string;
  ctx: string;
  tier: string;
  areaM2: number;
  /** Its name, for notable buildings. */
  label?: string;
  /** The trade room of its ground floor, where its floor plan has one ('Smithy', 'Shop'...). */
  shop?: string;
}

/** The trade a ground-floor room tells of. */
const SHOP_TRADE: Record<string, string> = { Smithy: 'smith', Bakery: 'baker', Taproom: 'tavern keeper', Shop: 'shopkeeper', Butcher: 'butcher', Tailor: 'tailor', Apothecary: 'apothecary', Chandlery: 'chandler', Pawnshop: 'pawnbroker', Foundry: 'founder' };

type RKind = 'home' | 'mansion' | 'slum' | 'trade' | 'inn' | 'temple' | 'shrine' | 'monks' | 'keep' | 'barracks' | 'prison' | 'guild' | 'civic'
  | 'library' | 'university' | 'bank' | 'tower' | 'store' | 'mill' | 'stables' | 'hall' | 'witch' | 'warehouse';

const TRADE_OF_ROLE: Record<string, string> = {
  tavern: 'tavern keeper', smithy: 'smith', bakery: 'baker', apothecary: 'apothecary', pawnshop: 'pawnbroker', tailor: 'tailor', butcher: 'butcher',
  chandlery: 'chandler', foundry: 'founder', winepress: 'vintner', bathhouse: 'bathkeeper',
};

function kindOf(b: ResidentBuilding): RKind {
  const r = b.role ?? '';
  if (r === 'inn') return 'inn';
  if (r === 'tavern' || TRADE_OF_ROLE[r]) return 'trade';
  if (r === 'townhall' || r === 'guildhall' || r === 'delvegate') return 'civic';
  if (r === 'library') return 'library';
  if (r === 'barracks') return 'barracks';
  if (r === 'stables') return 'stables';
  if (r === 'university' || r === 'college') return 'university';
  if (r === 'prison') return 'prison';
  if (r.startsWith('guild:') || r.startsWith('order:')) return 'guild';
  if (r === 'magetower') return 'tower';
  if (r === 'countinghouse') return 'bank';
  if (r === 'shrine') return 'shrine';
  if (r === 'witch' || b.use === 'witch') return 'witch';
  switch (b.use) {
    case 'temple': return 'temple';
    case 'keep': return 'keep';
    case 'hall': return 'hall';
    case 'store': return 'store';
    case 'mill': return 'mill';
  }
  if (b.ctx === 'monastery') return 'monks';
  if (b.ctx === 'rich') return 'mansion';
  if (b.ctx === 'harbour') return 'warehouse';
  if (b.ctx === 'slum') return 'slum';
  if (b.ctx === 'garrison' || b.ctx === 'castle') return 'barracks';
  return 'home';
}

/** Trades of the common folk, by the ward or village kind they live in. */
const TRADES: Record<string, string[]> = {
  ward: ['weaver', 'cooper', 'cobbler', 'carpenter', 'potter', 'tanner', 'glover', 'mason', 'brewer', 'fletcher', 'joiner', 'saddler', 'dyer', 'scribe', 'hatter',
    'cutler', 'locksmith', 'fuller', 'spinner', 'washerwoman', 'carter', 'porter', 'labourer', 'candlemaker', 'bookbinder', 'barber', 'tinker', 'seamstress'],
  rich: ['merchant', 'money-lender', 'lawyer', 'physician', 'goldsmith', 'spice merchant', 'wool merchant', 'alderman', 'shipowner', 'retired captain', 'notary'],
  suburb: ['labourer', 'carter', 'gardener', 'tanner', 'dyer', 'brickmaker', 'charcoal burner', 'drover', 'washerwoman', 'ropemaker', 'swineherd', 'hawker'],
  slum: ['beggar', 'rag-picker', 'labourer', 'night-soil man', 'street sweeper', 'rat-catcher', 'washerwoman', 'hawker', 'mudlark'],
  harbour: ['dockhand', 'sailor', 'fisherman', 'net-mender', 'shipwright', 'sailmaker', 'customs clerk', 'cooper', 'stevedore'],
  farm: ['farmer', 'shepherd', 'ploughman', 'cottar', 'swineherd', 'beekeeper', 'hedger', 'thatcher'],
  farming: ['farmer', 'shepherd', 'ploughman', 'cottar', 'swineherd', 'beekeeper', 'hedger', 'thatcher', 'miller\'s hand', 'smith'],
  vineyard: ['vine-dresser', 'vintner', 'cooper', 'grape-picker', 'farmer'],
  fishing: ['fisher', 'net-mender', 'boatwright', 'fishwife', 'salter'],
  logging: ['woodcutter', 'sawyer', 'charcoal burner', 'carter'],
  mining: ['miner', 'smelter', 'ore-washer', 'carter', 'smith'],
  keep: ['man-at-arms', 'groom', 'cook', 'laundress'],
  camp: ['soldier', 'camp follower', 'sutler', 'farrier'],
  tribal: ['hunter', 'gatherer', 'potter', 'basket-weaver', 'canoe-maker', 'healer'],
  prison: ['turnkey', 'guard', 'cook'],
  order: ['brother of the order', 'servant'],
  shrine: ['hermit', 'pilgrim guide'],
};
const SPOUSE_TRADES = ['spinner', 'weaver', 'brewer', 'seamstress', 'washerwoman', 'baker', 'midwife', 'dairymaid', 'laundress', 'gardener', 'hawker'];

const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];

/** A people (index into CULTURES) for a household, by the town's mix. */
function cultureFor(t: TownCtx, r: Rng): number {
  let x = r();
  for (const m of t.minorities) {
    if (x < m.share) return m.culture;
    x -= m.share;
  }
  return t.culture;
}

interface Maker {
  t: TownCtx;
  stats?: TownStats;
  r: Rng;
}

/** Trades and places said differently of a man and a woman. */
const FOR_MAN: Record<string, string> = {
  washerwoman: 'washerman', laundress: 'launderer', seamstress: 'tailor', fishwife: 'fisherman', 'serving girl': 'serving man', maid: 'manservant',
  dairymaid: 'dairyman', midwife: 'leech', 'lady\'s maid': 'valet', nurse: 'manservant', 'cunning woman': 'cunning man', prioress: 'prior', nun: 'monk', sister: 'brother',
};
const FOR_WOMAN: Record<string, string> = {
  potboy: 'potgirl', footman: 'serving maid', 'man-at-arms': 'woman-at-arms', fisherman: 'fisherwoman', 'night-soil man': 'night-soil woman', groom: 'stable girl',
  'cunning man': 'cunning woman', prior: 'prioress', monk: 'nun', brother: 'sister', ploughman: 'ploughwoman', washerman: 'washerwoman',
};
const gendered = (w: string, female: boolean) => (female ? FOR_WOMAN[w] : FOR_MAN[w]) ?? w;

/** A person of the household: named in their own language, with the family's name where it uses one. */
function person(m: Maker, culture: number, female: boolean, age: number, trade0: string, role0: string, house?: House, father?: string): Person {
  const trade = gendered(trade0, female), role = gendered(role0, female);
  const n = personName(culture, female, m.r, house, father);
  const p: Person = {
    name: n.full, given: n.given, female, age, culture, people: CULTURES[culture]?.people ?? 'unknown folk', trade, role,
    traits: age >= 14 ? pickTraits(m.r).slice(0, 2) : [], ties: [],
  };
  // Ill health where the town is foul; a secret trade where it is lawless.
  const san = m.stats?.sanitation.value ?? 60, crime = m.stats?.crime.value ?? 30;
  if (m.r() < (100 - san) / 600) p.note = pick(m.r, ['has a racking cough', 'is down with a fever', 'carries the scars of the pox', 'has the flux']);
  else if (age >= 16 && m.t.tier !== 'village' && m.r() < crime / 900) p.note = pick(m.r, ['secretly fences stolen goods', 'runs with the smugglers', 'picks pockets in the market', 'informs for the watch', 'owes the moneylenders more than can be paid']);
  return p;
}

/** A family: a couple (or a widow or widower), their children, and now and then an old parent. */
function family(m: Maker, culture: number, trade: string, o: { minAge?: number; spouseTrade?: boolean } = {}): { members: Person[]; name: string } {
  const r = m.r;
  const headFemale = r() < 0.22;
  const age = Math.round((o.minAge ?? 22) + r() * 38);
  const ci = culture;
  const house: House | undefined = familyFirst(CULTURES[ci]?.id ?? '') ? { id: -1, name: '', short: familyNameOf(ci, r), culture: ci, cadetOf: -1, founded: 0, motto: '', seatName: '' } : undefined;
  const head = person(m, ci, headFemale, age, trade, 'head', house);
  const members = [head];
  const married = r() < (age > 55 ? 0.6 : 0.82);
  let husband = headFemale ? undefined : head.given;
  if (married) {
    const sp = person(m, ci, !headFemale, Math.max(17, age + Math.round((r() - 0.6) * 12)), o.spouseTrade === false || r() < 0.45 ? trade : pick(r, SPOUSE_TRADES), headFemale ? 'husband' : 'wife', house);
    if (headFemale) husband = sp.given;
    members.push(sp);
  } else if (age > 45) head.role = headFemale ? 'head, widowed' : 'head, widower';
  const kids = married || age > 30 ? Math.floor(r() * (age < 30 ? 3 : 5)) : 0;
  for (let k = 0; k < kids; k++) {
    const ka = Math.round(age - 18 - r() * Math.max(1, age - 22));
    if (ka < 0 || ka > 30) continue;
    const f = r() < 0.5;
    const kTrade = ka < 10 ? 'child' : ka < 14 ? (r() < 0.6 ? 'helps at home' : 'apprentice') : r() < 0.6 ? trade : pick(r, TRADES[m.t.kind ?? ''] ?? TRADES.ward);
    members.push(person(m, ci, f, Math.max(0, ka), kTrade, f ? 'daughter' : 'son', house, husband));
  }
  if (r() < 0.18 && age < 60) {
    const f = r() < 0.6;
    members.push(person(m, ci, f, age + 22 + Math.round(r() * 10), 'retired', headFemale ? (f ? 'mother' : 'father') : (f ? 'mother' : 'father'), house));
  }
  return { members, name: house ? `the ${house.short} family` : `the household of ${head.name}` };
}

/** Staff of a building with no family to it (a temple, a guildhall): a head and some under them. */
function staff(m: Maker, culture: number, headRole: [string, string], under: [string, number, number][], more = 0): Household {
  const r = m.r;
  const members: Person[] = [];
  const hf = r() < 0.3;
  members.push(person(m, culture, hf, 35 + Math.round(r() * 30), headRole[0], headRole[1]));
  for (const [role, lo, hi] of under) {
    const n = lo + Math.floor(r() * (hi - lo + 1));
    for (let k = 0; k < n; k++) {
      const c = r() < 0.85 ? culture : cultureFor(m.t, r);
      members.push(person(m, c, r() < 0.4, 16 + Math.round(r() * 40), role, role));
    }
  }
  return { name: `the ${headRole[1]}'s people`, means: 'middling', members, ...(more ? { more } : {}) };
}

function meansFor(m: Maker, k: RKind, ctx: string): Means {
  const base = k === 'mansion' || k === 'bank' ? 4 : k === 'slum' ? 0 : ctx === 'suburb' || m.t.tier === 'village' ? 1 : ctx === 'harbour' ? 1 : 2;
  // The town's prosperity shifts a household up or down a step now and then.
  const pr = m.stats?.prosperity.value ?? 50;
  const roll = m.r();
  const shift = roll < (100 - pr) / 400 ? -1 : roll > 1 - pr / 400 ? 1 : 0;
  return MEANS[Math.max(0, Math.min(4, base + shift))];
}

/** The households of a building (without their ties to the neighbours). */
export function householdsOf(t: TownCtx, b: ResidentBuilding, stats?: TownStats): Household[] {
  const r = mulberry32(hashString(`${t.seed}#res#${b.bid}`));
  const m: Maker = { t, stats, r };
  const k = kindOf(b);
  const ci = cultureFor(t, r);
  const trades = TRADES[b.ctx] ?? TRADES[t.kind ?? ''] ?? TRADES.ward;
  const fam = (trade: string, means?: Means, minAge?: number): Household => {
    const f = family(m, ci, trade, { minAge });
    return { name: f.name, members: f.members, means: means ?? meansFor(m, k, b.ctx) };
  };
  switch (k) {
    case 'home': {
      // A house with a shop or workshop on its ground floor: the household keeps it.
      const own = pick(r, trades);
      const out = [fam(b.shop ? SHOP_TRADE[b.shop] ?? own : own)];
      // A large town house lets rooms to a second household upstairs.
      if (b.ctx === 'ward' && b.areaM2 > 110 && r() < 0.35) {
        const c2 = cultureFor(t, r);
        const f = family(m, c2, pick(r, trades));
        f.members.forEach((x) => { if (x.role === 'head') x.role = 'head, lodger'; });
        out.push({ name: f.name, members: f.members, means: 'poor' });
      }
      return out;
    }
    case 'slum': {
      const n = 2 + Math.floor(r() * 2);
      return Array.from({ length: n }, () => {
        const f = family(m, cultureFor(t, r), pick(r, TRADES.slum));
        return { name: f.name, members: f.members, means: r() < 0.5 ? 'destitute' : 'poor' } as Household;
      });
    }
    case 'mansion': {
      const h = fam(pick(r, TRADES.rich), 'rich', 30);
      const servants = ['steward', 'cook', 'maid', 'groom', 'footman', 'scullion', 'nurse', 'lady\'s maid', 'gardener'];
      const n = 2 + Math.floor(r() * 5);
      for (let i = 0; i < n; i++) {
        const role = servants[i % servants.length];
        h.members.push(person(m, r() < 0.8 ? ci : cultureFor(t, r), /maid|nurse|cook|scullion/.test(role) ? r() < 0.85 : r() < 0.2, 14 + Math.round(r() * 45), role, role));
      }
      return [h];
    }
    case 'trade': {
      const trade = TRADE_OF_ROLE[b.role ?? ''] ?? 'shopkeeper';
      const h = fam(trade);
      if (r() < 0.55) h.members.push(person(m, r() < 0.8 ? ci : cultureFor(t, r), r() < 0.25, 13 + Math.round(r() * 5), `${trade}'s apprentice`, 'apprentice'));
      if (r() < 0.3) h.members.push(person(m, ci, r() < 0.25, 19 + Math.round(r() * 12), `journeyman ${trade}`, 'journeyman'));
      return [h];
    }
    case 'inn': {
      const h = fam('innkeeper');
      const st = ['cook', 'serving girl', 'potboy', 'ostler', 'tapster'];
      for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) h.members.push(person(m, r() < 0.8 ? ci : cultureFor(t, r), st[i] === 'serving girl' ? true : r() < 0.3, 14 + Math.round(r() * 35), st[i], st[i]));
      // Guests, from farther afield.
      const guests: Person[] = [];
      for (let i = 0, n = 1 + Math.floor(r() * 4); i < n; i++) {
        const gc = r() < 0.5 ? Math.floor(r() * CULTURES.length) : cultureFor(t, r);
        guests.push(person(m, gc, r() < 0.3, 18 + Math.round(r() * 40), pick(r, ['merchant', 'pilgrim', 'pedlar', 'minstrel', 'sellsword', 'drover', 'courier', 'scholar', 'adventurer']), 'guest'));
      }
      return [h, { name: 'guests', means: 'middling', members: guests }];
    }
    case 'temple': return [staff(m, ci, ['priest', 'priest'], [['acolyte', 1, 3], ['sexton', 0, 1]])];
    case 'shrine': return [staff(m, ci, ['shrine keeper', 'keeper'], [['acolyte', 0, 1]])];
    case 'monks': {
      const nuns = r() < 0.35;
      const members = [person(m, ci, nuns, 45 + Math.round(r() * 25), nuns ? 'prioress' : 'prior', nuns ? 'prioress' : 'prior')];
      for (let i = 0, n = 3 + Math.floor(r() * 4); i < n; i++) members.push(person(m, ci, nuns, 18 + Math.round(r() * 50), nuns ? 'nun' : 'monk', nuns ? 'sister' : 'brother'));
      return [{ name: nuns ? 'the sisters' : 'the brothers', means: 'poor', members, more: 4 + Math.floor(r() * 10) }];
    }
    case 'keep': return [fam('castellan', 'comfortable', 30), staff(m, ci, ['captain of the guard', 'captain'], [['man-at-arms', 3, 6], ['servant', 1, 3]], 6 + Math.floor(r() * 14))];
    case 'barracks': return [staff(m, ci, ['sergeant', 'sergeant'], [['soldier', 4, 8], ['cook', 0, 1]], 6 + Math.floor(r() * 20))];
    case 'prison': return [staff(m, ci, ['warden', 'warden'], [['turnkey', 2, 4], ['guard', 2, 5]], 4 + Math.floor(r() * 8))];
    case 'guild': return [staff(m, ci, [b.role?.startsWith('order:') ? 'master of the house' : 'guildmaster', 'master'], [['member', 2, 4], ['clerk', 0, 1], ['servant', 0, 1]])];
    case 'civic': return [staff(m, ci, ['town clerk', 'clerk'], [['bailiff', 1, 1], ['beadle', 0, 1], ['scrivener', 0, 2]])];
    case 'library': return [staff(m, ci, ['librarian', 'librarian'], [['copyist', 1, 3], ['reader', 0, 2]])];
    case 'university': return [staff(m, ci, ['master', 'master'], [['scholar', 3, 6], ['porter', 0, 1]], 10 + Math.floor(r() * 30))];
    case 'bank': {
      const h = fam('banker', 'rich', 30);
      for (let i = 0, n = 1 + Math.floor(r() * 3); i < n; i++) h.members.push(person(m, ci, r() < 0.2, 18 + Math.round(r() * 30), 'clerk', 'clerk'));
      return [h];
    }
    case 'tower': return [staff(m, ci, ['archmage', 'archmage'], [['apprentice mage', 1, 4], ['servant', 0, 2]])];
    case 'store': case 'warehouse': return r() < 0.6 ? [fam(k === 'warehouse' ? pick(r, ['warehouse keeper', 'dockhand', 'merchant\'s factor']) : 'storekeeper', 'poor')] : [];
    case 'mill': return [fam('miller')];
    case 'stables': return [fam('ostler')];
    case 'hall': return [staff(m, ci, ['market reeve', 'reeve'], [['beadle', 0, 1]])];
    case 'witch': {
      const w = person(m, ci, r() < 0.8, 40 + Math.round(r() * 40), 'cunning woman', 'witch');
      w.note = pick(r, ['keeps a black cat that watches visitors', 'sells charms against the evil eye', 'is said to talk to the dead', 'brews remedies, and worse']);
      if (!w.female) w.trade = 'cunning man';
      return [{ name: `the household of ${w.name}`, means: 'poor', members: [w] }];
    }
  }
  return [];
}

/** A neighbouring building: its properties and where it stands from this one. */
export interface Neighbour extends ResidentBuilding {
  /** Distance (m) and compass bearing from the building. */
  dist: number;
  dir: string;
}

const TIE_KINDS: [Tie['kind'], number][] = [['friend', 30], ['rival', 18], ['owes', 9], ['owed', 9], ['feud', 7], ['sweetheart', 6], ['kin', 12], ['partner', 9]];

/**
 * The households of a building with their ties to the neighbours. A tie between two buildings
 * depends only on the pair (so it shows from both ends, the other way about: a debt owed one way
 * is owed the other).
 */
export function residents(t: TownCtx, b: ResidentBuilding, neighbours: Neighbour[], stats?: TownStats): Household[] {
  const hs = householdsOf(t, b, stats);
  const head = hs[0]?.members[0];
  if (!head) return hs;
  for (const n of neighbours) {
    const [a, c] = b.bid < n.bid ? [b.bid, n.bid] : [n.bid, b.bid];
    const h = hashString(`${t.seed}#tie#${a}|${c}`);
    if (h % 100 >= 24) continue;
    const other = householdsOf(t, n, stats)[0]?.members[0];
    if (!other) continue;
    let x = (h >>> 8) % 100;
    let kind: Tie['kind'] = 'friend';
    for (const [k, w] of TIE_KINDS) {
      if (x < w) {
        kind = k;
        break;
      }
      x -= w;
    }
    // A debt reads from each end: the first of the pair owes the second.
    if (kind === 'owes' || kind === 'owed') kind = (b.bid === a) === (kind === 'owes') ? 'owes' : 'owed';
    const where = n.dist < 14 ? `next door to the ${n.dir}` : n.dist < 35 ? `across the way to the ${n.dir}` : `a little way off to the ${n.dir}`;
    const who = `${other.name} (${other.trade})`;
    const text: Record<Tie['kind'], string> = {
      friend: `Old friends with ${who}, ${where}.`, rival: `At odds with ${who}, ${where}.`, owes: `Owes money to ${who}, ${where}.`,
      owed: `Is owed money by ${who}, ${where}.`, feud: `In a bitter feud with ${who}, ${where}, over ${pick(mulberry32(h), ['a boundary', 'an insult', 'a broken betrothal', 'a dead pig', 'an inheritance', 'a stolen cart'])}.`,
      sweetheart: `Secretly sweet on ${who}, ${where}.`, kin: `Kin by marriage to ${who}, ${where}.`, partner: `In business with ${who}, ${where}.`,
    };
    head.ties.push({ kind, text: text[kind] });
  }
  return hs;
}

/** The town's mix of peoples: its own, and those of the lands about it (the nearest first). */
export function townMix(tier: string, population: number, coastal: boolean, main: number, near: number[]): { culture: number; share: number }[] {
  const total = minorityShare(tier, population, coastal);
  const others = [...new Set(near.filter((c) => c !== main))].slice(0, 4);
  if (!others.length) return [];
  const w = others.map((_, i) => 1 / (i + 1));
  const sw = w.reduce((a, b) => a + b, 0);
  return others.map((c, i) => ({ culture: c, share: (total * w[i]) / sw }));
}
