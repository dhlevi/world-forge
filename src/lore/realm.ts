import { Biome } from '../gen/biomes';
import { BUNDLE, fillFrom } from '../names/bundles';
import { fantasyRaces } from '../names/world-cultures';
import { LEVEL_NAME, STYLE_WORDS, NB_CULTURE, type Politics, type PolUnit, chainOf } from '../gen/politics';
import { hashString, mulberry32, type Rng } from '../gen/rng';
import type { Settlement } from '../gen/settlements';
import { CULTURES } from '../names/cultures';
import { nameCase, translate } from '../lang/translate';
import { goodName, production, tradeOf } from './economy';
import { type Faith, type Sect, toleranceOf } from './faiths';
import type { LabelFeature } from '../gen/features';
import { COURT, cultureFolk, cultureId, cultureLabel, epithet, givenName, type House, houseName, personName, roman, traits } from './names';
import { buildWorldLore, type Claim, type Relation, type War, type WorldLore } from './world';

/**
 * Everything the realm details window shows, for a unit of any tier: its rulers and their houses,
 * the line of past rulers, a chronicle, its diplomacy (allies, rivals, wars, claims), its vassals,
 * people, land, trade, armies and faith, and a short account in prose. Built on demand (and
 * cached) from the world's lore, which is made once per world on first use.
 */

const pick = <T>(rnd: Rng, a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface Person {
  given: string;
  full: string;
  female: boolean;
  born: number;
  house: House | null;
  traits: string[];
  epithet?: string;
  numeral: string;
}
export interface Reign {
  person: Person;
  title: string;
  from: number;
  to?: number;
  /** How they came to rule ("son of the last", "seized the throne"). */
  how: string;
  /** How the reign ended. */
  end?: string;
  /** Styled: "King Edric II the Bold". */
  styled: string;
}
export interface RulerView {
  styled: string;
  full: string;
  title: string;
  house: House | null;
  age: number;
  since: number;
  traits: string[];
  female: boolean;
  spouse?: string;
  heir?: string;
  regent?: string;
  children: number;
  succession: string;
  court: { office: string; name: string; note: string }[];
  /** Held in person by the liege (this unit has no ruler of its own). */
  heldBy?: number;
  council?: string;
}
export interface ChronEntry {
  year: number;
  text: string;
  kind: 'founding' | 'succession' | 'war' | 'peace' | 'marriage' | 'alliance' | 'disaster' | 'faith' | 'building' | 'vassal' | 'wonder';
}
export interface RelView {
  id: number;
  name: string;
  rel: Relation;
}
export interface WarView {
  war: War;
  side: 0 | 1;
  allies: number[];
  enemies: number[];
  ongoing: boolean;
  outcome: string;
}
export interface ClaimView {
  claim: Claim;
  text: string;
}
export interface VassalNode {
  id: number;
  name: string;
  title: string;
  ruler: string;
  people: number;
  joined: string;
  /** Unrest: a vassal of another people, or a claimant. */
  unrest?: string;
  kids: number;
}
export interface RealmDetails {
  id: number;
  unit: PolUnit;
  chain: PolUnit[];
  top: PolUnit;
  year: number;
  era: string;
  founded: number;
  government: string;
  ruler: RulerView | null;
  reigns: Reign[];
  earlier: number;
  houses: { house: House; from: number; to: number; how: string }[];
  cadets: { house: House; holds: string[] }[];
  chronicle: ChronEntry[];
  allies: RelView[];
  friends: RelView[];
  rivals: RelView[];
  truces: RelView[];
  wars: WarView[];
  pastWars: WarView[];
  claims: ClaimView[];
  claimsOn: ClaimView[];
  members: number[];
  vassals: VassalNode[];
  people: {
    total: number;
    towns: number;
    urban: number;
    density: number;
    area: number;
    /** idx: index into CULTURES, or -1 for native peoples. */
    cultures: { name: string; pct: number; idx: number }[];
    folk: { name: string; pct: number }[];
    faiths: { name: string; pct: number }[];
    settlements: { name: string; pop: number; tier: string; walls: boolean; coastal: boolean; seat: boolean; lon: number; lat: number }[];
    nCities: number;
    nTowns: number;
    nVillages: number;
  };
  land: { terrain: { name: string; pct: number }[]; coastKm: number; highPct: number; climate: string };
  economy: {
    exports: string[];
    imports: string[];
    special: string[];
    partners: { id: number; name: string; buys: string[]; sells: string[] }[];
    revenue: number;
    coin: string;
    rank: number;
    of: number;
    word: string;
  };
  military: { levy: number; standing: number; horse: number; ships: number; style: string; order?: string; fortresses: number };
  faith: { faith: Faith; sect: Sect; tolerance: string };
  overview: string;
  /** The realm's name and its ruler's title in its rulers' language. */
  nativeName: string;
  nativeRuler: string;
}

export interface Ctx {
  L: WorldLore;
  p: Politics;
  units: PolUnit[];
  settlements: Settlement[];
  seed: string;
  details: Map<number, RealmDetails>;
  reigns: Map<number, Reign[]>;
}
let ctx: Ctx | null = null;

/** The world's lore (built on first use, kept for the world). */
export function loreFor(key: string, seed: string, p: Politics, settlements: Settlement[], features: LabelFeature[] = []): Ctx {
  if (ctx && ctx.seed === key) return ctx;
  const L = buildWorldLore(seed, p, settlements, features);
  ctx = { L, p, units: p.units, settlements, seed: key, details: new Map(), reigns: new Map() };
  return ctx;
}

const FEMALE_P: Record<string, number> = {
  anglo: 0.14, norse: 0.1, latin: 0.1, celtic: 0.18, elvish: 0.45, desert: 0.03, slavic: 0.1, dwarven: 0.15, southern: 0.12, steppe: 0.08, jungle: 0.12,
  sinic: 0.04, japonic: 0.05, koreanic: 0.07, woodland: 0.3, highland: 0.06,
};
fillFrom(FEMALE_P, (b) => b.femaleP);
const FEM: Record<string, string> = {
  King: 'Queen', Emperor: 'Empress', Duke: 'Duchess', Count: 'Countess', Earl: 'Countess', Baron: 'Baroness', Prince: 'Princess', Tsar: 'Tsarina', Khan: 'Khatun',
  Khagan: 'Khatun', Sultan: 'Sultana', Emir: 'Emira', Lord: 'Lady', 'Grand Duke': 'Grand Duchess', Margrave: 'Margravine', 'High King': 'High Queen', 'Sea King': 'Sea Queen',
  Voivode: 'Voivodess', Despot: 'Despotess', Autokrator: 'Autokratorissa', Caliph: 'Caliph', 'Prince-Bishop': 'Princess-Abbess', Abbot: 'Abbess', Patriarch: 'Matriarch',
  'High Godi': 'High Volva', Godi: 'Gydja', 'High Priest': 'High Priestess', Hierarch: 'Hierarch', 'Rune-priest': 'Rune-priestess', 'Shaman-Khan': 'Shaman-Khatun', 'Celestial Master': 'Celestial Mistress', Imam: 'Imam', Warden: 'Warden', Thane: 'Thane', Shogun: 'Shogun', Headman: 'Headwoman', Chief: 'Chief', 'Lord Mayor': 'Lady Mayor', Overking: 'Overqueen',
};
const NO_NUMERAL = new Set(['sinic', 'japonic', 'koreanic', 'woodland']);
const SURNAME_FIRST = new Set(['sinic', 'japonic', 'koreanic']);

function styledName(cul: string, title: string, p: Person): string {
  const t = p.female ? FEM[title] ?? title : title;
  const name = SURNAME_FIRST.has(cul) ? p.full : p.given;
  return `${t} ${name}${p.numeral ? ` ${p.numeral}` : ''}${p.epithet ? ` ${p.epithet}` : ''}`;
}

const ELECTED = new Set(['republic', 'city-state', 'theocracy']);

/** The line of rulers of a unit, oldest first; the last rules now (none for leagues, or for units the liege holds in person). */
function reignsOf(c: Ctx, id: number): Reign[] {
  const cached = c.reigns.get(id);
  if (cached) return cached;
  const { L, units } = c;
  const u = units[id];
  const cul = cultureId(u.culture);
  const r = mulberry32(hashString(`${c.seed}#reigns#${id}`));
  const out: Reign[] = [];
  const liege = u.parent >= 0 ? units[u.parent] : null;
  if (u.gov === 'league' || (liege && liege.seat === u.seat)) {
    c.reigns.set(id, out);
    return out;
  }
  const Y = L.year;
  const f = L.founded(id);
  const plagues = L.events.filter((e) => e.oldWorld && /Death|Plague|Pox|Fever|Sickness|Wasting|Cough/.test(e.name));
  const mk = (house: House | null, female: boolean, born: number, father?: string, regnalName?: string): Person => {
    const nm = personName(u.culture, female, r, house ?? undefined, father);
    const given = regnalName ?? nm.given;
    const tr = traits(r);
    return { given, full: regnalName ? `${given} (born ${nm.full})` : nm.full, female, born, house, traits: tr, epithet: epithet(cul, r, tr), numeral: '' };
  };
  if (ELECTED.has(u.gov) || u.gov === 'colony') {
    // Elected (or, for colonies, appointed) rulers: terms, from the leading families.
    // The leading families (patricians, priestly or colonial families) the rulers come from.
    const families: House[] = Array.from({ length: 5 }, (_, k) => {
      const nm = houseName(cul, u.culture, r, L.bank, k === 0 ? u.seatName : '');
      return { id: -1 - k, name: nm.name, short: nm.short, culture: u.culture, cadetOf: -1, founded: f, motto: '', seatName: u.seatName };
    });
    const fam = (k: number) => families[k];
    let t = f;
    while (t < Y) {
      const life = u.gov === 'theocracy' || (u.gov === 'republic' && /Doge/.test(u.ruler));
      const len = life ? 3 + Math.floor(r() * 18) : u.gov === 'colony' ? 3 + Math.floor(r() * 9) : 2 + Math.floor(r() * 7);
      const end = t + len;
      // A faith served by priestesses is ruled by them; an open priesthood lets either serve.
      const clergy = u.gov === 'theocracy' ? L.faiths.faiths[L.faiths.ofCulture[u.culture]]?.doctrines.clergy : undefined;
      const female = clergy === 'priestesses' ? (r(), true) : r() < (clergy === 'open' ? 0.4 : (FEMALE_P[cul] ?? 0.1) * (u.gov === 'theocracy' ? 0.5 : 1));
      const age = 38 + Math.floor(r() * 30);
      // Priests take a holy name; others keep their own.
      const holy = u.gov === 'theocracy' ? givenName(u.culture, female, r) : undefined;
      const person = mk(fam(Math.floor(r() * 5)), female, t - age, undefined, holy);
      const how = u.gov === 'colony' ? 'appointed from overseas' : u.gov === 'theocracy' ? 'elected by the high clergy' : 'elected by the council';
      const endT = end >= Y ? undefined : life ? pick(r, ['died in office', 'died in office', 'abdicated', 'deposed']) : pick(r, ['served the term', 'served the term', 'served the term', 'removed from office', 'died in office']);
      out.push({ person, title: u.ruler, from: t, to: end >= Y ? undefined : end, how, end: endT, styled: '' });
      t = end;
    }
  } else {
    const dyn = L.pastHouses(id);
    let k = 0;
    let t = f;
    let prev: Person | null = null;
    while (t < Y) {
      const cur = dyn[k];
      const change = k + 1 < dyn.length ? dyn[k + 1].from : Infinity;
      let len = 2 + Math.floor(r() ** 1.15 * 40);
      let end = t + len;
      let endText = '';
      let nextHow = '';
      if (end >= change) {
        end = change;
        const how = dyn[k + 1].how;
        endText = how === 'usurpation' ? 'was overthrown by a usurper' : how === 'conquest' ? 'lost the realm to a conqueror' : how === 'the old line died out' ? 'died without heirs' : how === 'rebellion' ? 'was deposed by rebels' : how === 'election by the nobles' ? 'died; the nobles chose a new house' : 'died; the crown passed by marriage';
        nextHow = how === 'usurpation' ? 'seized the throne' : how === 'conquest' ? 'took the realm by conquest' : how === 'rebellion' ? 'raised by the rebels' : how === 'election by the nobles' ? 'elected by the nobles' : how === 'the old line died out' ? 'a distant kinsman, chosen when the old line died out' : 'inherited through marriage';
      } else {
        const q = r();
        const pl = plagues.find((e) => e.year > t && e.year <= end && !u.nw);
        if (pl && q < 0.35) {
          end = pl.year;
          endText = `died of ${pl.name}`;
        } else endText = q < 0.58 ? 'died in old age' : q < 0.68 ? 'fell in battle' : q < 0.74 ? 'murdered' : q < 0.8 ? 'abdicated' : q < 0.86 ? 'died of a fever' : q < 0.9 ? (L.land(id).coastKm > 40 ? 'lost at sea' : 'died of a fever') : q < 0.94 ? 'deposed' : 'died in a hunting accident';
      }
      len = end - t;
      const female = r() < (FEMALE_P[cul] ?? 0.1);
      const accAge = prev ? Math.max(1, Math.floor(8 + r() * 42)) : 22 + Math.floor(r() * 25);
      let born = t - accAge;
      const alive = end >= Y;
      if (alive && Y - born > 84) born = Y - 60 - Math.floor(r() * 24);
      if (alive && t - born < 1) born = t - 1;
      const rel = !prev ? 'founded the realm' : nextHow && k > 0 && out.length && dyn[k].from === t ? nextHow : pick(r, female ? ['daughter of the last', 'daughter of the last', 'sister of the last', 'niece of the last'] : ['son of the last', 'son of the last', 'son of the last', 'brother of the last', 'grandson of the last', 'nephew of the last', 'cousin of the last']);
      const person = mk(cur.house, female, born, prev && !female ? prev.given : undefined);
      out.push({ person, title: u.ruler, from: t, to: alive ? undefined : end, how: rel, end: alive ? undefined : endText, styled: '' });
      prev = person;
      if (end >= change) k++;
      t = end;
    }
    // Fix the "how" of each house's first ruler.
    for (let i = 1; i < out.length; i++) {
      if (out[i].person.house !== out[i - 1].person.house) {
        const d = dyn.find((x) => x.house === out[i].person.house);
        const how = d?.how ?? '';
        out[i].how = how === 'usurpation' ? 'seized the throne' : how === 'conquest' ? 'took the realm by conquest' : how === 'rebellion' ? 'raised by the rebels' : how === 'election by the nobles' ? 'elected by the nobles' : how === 'the old line died out' ? 'a distant kinsman, chosen when the old line died out' : 'inherited through marriage';
      }
    }
  }
  // Regnal numbers: the second of a name is "II", and the first becomes "I".
  if (!NO_NUMERAL.has(cul) && (!ELECTED.has(u.gov) || u.gov === 'theocracy') && u.gov !== 'colony') {
    const seen = new Map<string, Reign[]>();
    for (const x of out) (seen.get(x.person.given) ?? seen.set(x.person.given, []).get(x.person.given)!).push(x);
    for (const list of seen.values()) if (list.length > 1) list.forEach((x, k) => (x.person.numeral = roman(k + 1)));
  }
  for (const x of out) x.styled = styledName(cul, x.title, x.person);
  c.reigns.set(id, out);
  return out;
}

function rulerAt(c: Ctx, id: number, year: number): Reign | undefined {
  const top = c.units[id];
  const rs = reignsOf(c, top.parent >= 0 && c.units[top.parent].seat === top.seat ? top.parent : id);
  return rs.find((x) => x.from <= year && (x.to === undefined || x.to >= year));
}

function succession(u: PolUnit, cul: string, home?: PolUnit): string {
  if (u.gov === 'republic') return /Doge/.test(u.ruler) ? 'The Great Council elects a Doge for life' : 'Elected by the council from the leading families, for a term of years';
  if (u.gov === 'city-state') return 'Elected by the guilds and the patrician families';
  if (u.gov === 'theocracy') return 'Elected by a conclave of the high clergy';
  if (u.gov === 'league') return 'A council of the members\' envoys; the presidency passes in turn';
  if (u.gov === 'colony') return home ? `Appointed by ${home.ruler === 'King' ? 'the crown' : `the ${home.ruler}`} of ${home.name}` : 'Appointed from overseas';
  if (u.gov === 'tribal') return cul === 'woodland' ? 'Chosen by the clan mothers from the ruling clan' : 'Chosen by the elders from the ruling lineage';
  const table: Record<string, string> = {
    celtic: 'Tanistry: the heir is chosen from the ruler\'s kin', slavic: 'Seniority: the eldest of the dynasty inherits', steppe: 'Elected by a kurultai from the khan\'s kin',
    desert: 'The ruler names an heir from among his sons', elvish: 'The eldest child inherits, son or daughter', dwarven: 'The eldest of the line, by consent of the elders',
    sinic: 'The eldest son inherits, under the Mandate of Heaven', japonic: 'Hereditary in the clan; the heir is adopted if need be', woodland: 'Chosen by the clan mothers',
    highland: 'The ablest son of the ruler\'s principal wife', jungle: 'Father to son, confirmed by the priests', southern: 'Hereditary; heirs are crowned co-rulers in the ruler\'s lifetime',
  };
  if (u.level === 4 && cul === 'latin') return 'Elective: the greatest vassals choose the emperor';
  return table[cul] ?? BUNDLE.get(cul)?.succession ?? 'The eldest son inherits, then the eldest daughter';
}


const TERRAIN: [string, Biome[]][] = [
  ['farmland and meadows', [Biome.Grassland, Biome.Riparian]], ['forest', [Biome.TemperateForest, Biome.TemperateRainforest, Biome.MontaneForest]], ['pine forest', [Biome.BorealForest]],
  ['steppe', [Biome.ColdDesert]], ['desert', [Biome.HotDesert, Biome.SaltFlat]], ['savanna', [Biome.Savanna]], ['jungle', [Biome.TropicalRainforest, Biome.TropicalDryForest, Biome.Mangrove]],
  ['marsh', [Biome.Wetland]], ['tundra and ice', [Biome.Tundra, Biome.IceSheet]], ['mountains', [Biome.Alpine]], ['scrubland', [Biome.Shrubland]],
];
const MINOR_FOLK: Record<string, string[]> = {
  anglo: ['Halflings', 'Half-elves'], latin: ['Halflings'], celtic: ['Half-elves', 'Halflings'], dwarven: ['Gnomes'], slavic: ['Gnomes', 'Half-orcs'], steppe: ['Half-orcs'],
  norse: ['Half-orcs', 'Half-giants'], elvish: ['Half-elves'], jungle: ['Lizardfolk'], desert: ['Gnolls'], southern: ['Halflings'],
};
fillFrom(MINOR_FOLK, (b) => b.minorFolk);
const ARMY: Record<string, string> = {
  anglo: 'longbowmen and armoured men-at-arms', latin: 'heavy knights and crossbowmen', norse: 'huscarls and raiders in longships', celtic: 'warbands of spearmen and light horse',
  elvish: 'archers and wardens of the woods', desert: 'mailed horsemen, archers and slave-soldiers', slavic: 'boyar cavalry and town militias', dwarven: 'shield-walls of axemen and crossbowmen',
  southern: 'armoured cataphracts and hoplite infantry', steppe: 'horse archers in great numbers', jungle: 'jaguar and eagle warriors with obsidian clubs', sinic: 'crossbowmen and drilled infantry with banners',
  japonic: 'mounted samurai and spear-armed foot', koreanic: 'archers and fortress garrisons', woodland: 'woodland warriors and canoe parties', highland: 'slingers, clubmen and road garrisons',
};
fillFrom(ARMY, (b) => b.army);

/** Details for one unit. */
export function realmDetails(c: Ctx, id: number): RealmDetails {
  const cached = c.details.get(id);
  if (cached) return cached;
  const { L, units } = c;
  const u = units[id];
  const cul = cultureId(u.culture);
  const r = mulberry32(hashString(`${c.seed}#details#${id}`));
  const chain = chainOf(units, id);
  const top = units[L.topOf[id]];
  const isTop = u.parent < 0;
  const relKey = u.gov === 'league' ? -1 : top.id;
  const f = L.founded(id);
  const liege = u.parent >= 0 ? units[u.parent] : null;

  // ---- Rulers ------------------------------------------------------------------------------------
  const reigns = reignsOf(c, id);
  const now = reigns.at(-1);
  let ruler: RulerView | null = null;
  const home = u.gov === 'colony' ? liege ?? undefined : undefined;
  if (u.gov === 'league') {
    ruler = { styled: u.ruler, full: '', title: u.ruler, house: null, age: 0, since: f, traits: [], female: false, children: 0, succession: succession(u, cul), court: [], council: `${u.ruler} of ${L.kids[id].length || units.filter((v) => v.league === id).length} members, meeting at ${u.seatName}` };
  } else if (liege && liege.seat === u.seat) {
    const lr = rulerAt(c, liege.id, L.year);
    ruler = { styled: lr?.styled ?? liege.ruler, full: lr?.person.full ?? '', title: liege.ruler, house: lr?.person.house ?? null, age: lr ? L.year - lr.person.born : 0, since: lr?.from ?? f, traits: lr?.person.traits ?? [], female: !!lr?.person.female, children: 0, succession: 'Held in person by the liege', court: [], heldBy: liege.id };
  } else if (now) {
    const p = now.person;
    const age = L.year - p.born;
    // A spouse from an allied house, a vassal house, or the realm's own nobility.
    const married = [...(L.relations.get(relKey) ?? [])].find(([, v]) => v.married);
    let spouse: string | undefined;
    if (!ELECTED.has(u.gov) && age >= 16 && r() < 0.85) {
      const sf = !p.female;
      const other = married && isTop ? units[married[0]] : null;
      const sh = other ? L.houseOf(other.id) : null;
      const scul = other ? other.culture : u.culture;
      const sn = personName(scul, sf, r, sh ?? undefined);
      const living = r() < 0.85 ? '' : ' (died)';
      spouse = other && sh ? `${sn.full} of ${sh.name}, of ${other.name}${living}` : `${sn.full}${r() < 0.5 ? `, of a noble house of ${u.seatName}` : ''}${living}`;
    }
    const children = ELECTED.has(u.gov) ? 0 : age < 18 ? 0 : Math.floor(r() * Math.min(7, (age - 14) / 4));
    let heir: string | undefined;
    if (!ELECTED.has(u.gov) && u.gov !== 'colony') {
      if (children > 0) {
        const hf = cul === 'elvish' ? r() < 0.5 : r() < 0.15;
        const ha = Math.max(0, age - 18 - Math.floor(r() * 18));
        heir = `${personName(u.culture, hf, r, p.house ?? undefined, p.female ? undefined : p.given).full}, ${hf ? 'daughter' : 'son'}, aged ${ha}`;
      } else {
        const hf = r() < 0.2;
        heir = `${personName(u.culture, hf, r, p.house ?? undefined).full}, ${pick(r, hf ? ['sister', 'niece', 'cousin'] : ['brother', 'nephew', 'cousin', 'uncle'])} (heir presumptive)`;
      }
    }
    const regent = age < 16 ? `${personName(u.culture, r() < 0.6, r).full}, ${pick(r, ['the ruler\'s mother', 'an uncle', 'the chancellor', 'a council of lords'])}` : undefined;
    const offices = COURT[cul] ?? COURT.anglo;
    const court = (u.level >= 2 || isTop ? [0, 1, 2, 3, 4] : [1, 2]).map((k) => {
      const tr = traits(r);
      return { office: offices[k], name: personName(u.culture, r() < (FEMALE_P[cul] ?? 0.1) * 1.5, r).full, note: tr.slice(0, 2).join(', ').toLowerCase() };
    });
    ruler = {
      styled: now.styled, full: p.full, title: now.title, house: p.house, age, since: now.from, traits: p.traits, female: p.female, spouse, heir, regent, children,
      succession: succession(u, cul, home), court,
    };
  }

  // ---- Houses ------------------------------------------------------------------------------------
  const houses = u.gov === 'league' || ELECTED.has(u.gov) || u.gov === 'colony' ? [] : L.pastHouses(liege && liege.seat === u.seat ? liege.id : id);
  const cadets: { house: House; holds: string[] }[] = [];
  if (houses.length) {
    const mine = houses.at(-1)!.house;
    const under = (x: number): number[] => L.kids[x].flatMap((k) => [k, ...under(k)]);
    const by = new Map<House, string[]>();
    for (const k of under(id).slice(0, 4000)) {
      const v = units[k];
      if (v.level === 0 || (units[v.parent] && units[v.parent].seat === v.seat)) continue;
      const h = L.pastHouses(k).at(-1)?.house;
      if (h && h !== mine && h.cadetOf === mine.id) (by.get(h) ?? by.set(h, []).get(h)!).push(v.name);
    }
    for (const [h, holds] of by) cadets.push({ house: h, holds });
  }

  // ---- Diplomacy ---------------------------------------------------------------------------------
  const rels = [...(L.relations.get(relKey) ?? [])].map(([b, rel]) => ({ id: b, name: units[b].name, rel }));
  const byPeople = (a: RelView, b: RelView) => units[b.id].people - units[a.id].people;
  const allies = rels.filter((x) => x.rel.kind === 'alliance' || x.rel.kind === 'league').sort(byPeople);
  const friends = rels.filter((x) => x.rel.kind === 'friendly').sort(byPeople);
  const rivals = rels.filter((x) => x.rel.kind === 'rival').sort(byPeople);
  const truces = rels.filter((x) => x.rel.kind === 'truce').sort(byPeople);
  const warView = (w: War): WarView => {
    const side: 0 | 1 = w.attackers.includes(relKey) ? 0 : 1;
    const mine = side === 0 ? w.attackers : w.defenders, theirs = side === 0 ? w.defenders : w.attackers;
    const ongoing = w.end === undefined;
    let outcome = w.status ?? '';
    if (!ongoing) {
      const won = w.winner === side, lost = w.winner === (1 - side);
      const prize = w.prize !== undefined ? units[w.prize].name : '';
      outcome = w.winner === -1 ? `ended in ${w.peace} with nothing gained` : won ? `won${prize ? ` ${prize}` : ''} by ${w.peace}` : lost ? `lost${prize ? ` ${prize}` : ''} by ${w.peace}` : '';
      if (!prize && !(w.winner === -1)) outcome = won ? `victory, sealed by ${w.peace}` : `defeat, sealed by ${w.peace}`;
    }
    return { war: w, side, allies: mine.filter((x) => x !== relKey), enemies: theirs, ongoing, outcome };
  };
  const myWars = isTop || u.gov === 'league' ? L.wars.filter((w) => w.attackers.includes(relKey) || w.defenders.includes(relKey)) : [];
  const wars = myWars.filter((w) => w.end === undefined).map(warView);
  const pastWars = myWars.filter((w) => w.end !== undefined).sort((a, b) => b.start - a.start).map(warView);
  const claimText = (cl: Claim) => cl.kind === 'throne'
    ? `${cl.pretender?.name ?? 'A pretender'}, aged ${cl.pretender?.age ?? '?'}, claims the throne of ${units[cl.on].name} for the house overthrown in ${cl.since}; ${cl.text}`
    : `${units[cl.by].name} claims ${units[cl.on].name}, ${cl.text}`;
  const myIds = new Set<number>([id, ...(u.gov === 'league' ? [] : chain.map((x) => x.id))]);
  const under = new Set<number>();
  if (isTop) {
    const walk = (x: number) => {
      under.add(x);
      for (const k of L.kids[x]) walk(k);
    };
    walk(id);
  }
  const claims = L.claims.filter((cl) => cl.by === relKey && isTop).map((cl) => ({ claim: cl, text: claimText(cl) }));
  const claimsOn = L.claims.filter((cl) => (isTop ? under.has(cl.on) : myIds.has(cl.on) && cl.on === id) && cl.by !== relKey || (cl.kind === 'throne' && cl.on === id && cl.by === id)).map((cl) => ({ claim: cl, text: claimText(cl) }));

  // ---- Vassals -----------------------------------------------------------------------------------
  const kidsIds = u.gov === 'league' ? units.filter((v) => v.league === id).map((v) => v.id) : L.kids[id];
  const vassals: VassalNode[] = kidsIds.map((k) => {
    const v = units[k];
    const j = L.joined(k);
    const vr = v.seat === u.seat ? null : reignsOf(c, k).at(-1);
    let unrest: string | undefined;
    if (v.culture !== u.culture && u.gov !== 'league') unrest = `its ${cultureLabel(v.culture)} people chafe under ${cultureLabel(u.culture)} rule`;
    if (L.claims.some((cl) => cl.on === k)) unrest = 'claimed by a foreign power';
    return {
      id: k, name: v.name, title: v.title || LEVEL_NAME[v.level], ruler: v.seat === u.seat && u.gov !== 'league' ? `held in person by the ${u.ruler}` : vr?.styled ?? v.ruler,
      people: v.people, joined: u.gov === 'league' ? 'member' : j.how === 'held by the ruler in person' ? 'the ruler\'s own lands' : `${j.how}, ${j.year}`, unrest,
      kids: (u.gov === 'league' ? [] : L.kids[k]).length,
    };
  }).sort((a, b) => b.people - a.people);

  // ---- People ------------------------------------------------------------------------------------
  const land = L.land(id);
  const area = land.areaKm2 || u.areaKm2;
  const totalC = land.culture.reduce((a, b) => a + b, 0) || 1;
  const cultures: { name: string; pct: number; idx: number }[] = [];
  for (let k = 0; k < NB_CULTURE; k++) if (land.culture[k] / totalC > 0.01) cultures.push({ idx: k, name: cultureLabel(k), pct: (100 * land.culture[k]) / totalC });
  cultures.sort((a, b) => b.pct - a.pct);
  // Colonies are of their founders' people, with the native peoples around them.
  if (u.gov === 'colony' || (cultures.length && cultures[0].idx !== u.culture && u.gov !== 'league' && units[u.id].level === 0)) {
    const own = cultures.find((x) => x.idx === u.culture);
    const share = u.gov === 'colony' ? 60 + r() * 25 : 50;
    for (const x of cultures) x.pct *= (100 - share) / 100;
    if (own) own.pct += share;
    else cultures.unshift({ idx: u.culture, name: cultureLabel(u.culture), pct: share });
    cultures.sort((a, b) => b.pct - a.pct);
  }
  if (u.gov === 'colony' && cultures.length === 1) {
    cultures[0].pct = 60 + r() * 25;
    cultures.push({ idx: -1, name: 'Native peoples', pct: 100 - cultures[0].pct });
  }
  const folkMap = new Map<string, number>();
  for (const x of cultures) {
    const fk = x.idx < 0 ? 'Humans' : cultureFolk(x.idx);
    folkMap.set(fk, (folkMap.get(fk) ?? 0) + x.pct);
  }
  // Other folk living among them: a few of the usual minorities, many more (and from all over
  // the world) among open peoples, hardly any among insular ones; none in a world of humans only.
  const div = CULTURES[u.culture]?.mods?.diversity ?? 1;
  if (fantasyRaces() && div >= 0.5) {
    const own = cultureFolk(u.culture);
    const pool = [...(MINOR_FOLK[cul] ?? [])];
    if (div > 1.5) for (const f of new Set(CULTURES.map((x) => cultureFolk(x.index)))) if (f !== own && !pool.includes(f)) pool.push(f);
    const chance = div > 1.5 ? 0.7 : 0.55;
    for (const m of pool) {
      if (r() >= chance || folkMap.has(m)) continue;
      const pct = div > 1.5 ? 2 + r() * 9 : 0.5 + r() * 4;
      for (const k of folkMap.keys()) folkMap.set(k, folkMap.get(k)! * (1 - pct / 100));
      folkMap.set(m, pct);
    }
  }
  const folk = [...folkMap].map(([name, pct]) => ({ name, pct })).sort((a, b) => b.pct - a.pct);
  const state = L.faiths.sectOf(u.culture, top.lon, top.lat);
  const fmap = new Map<string, number>();
  for (const x of cultures) {
    if (x.idx < 0) {
      fmap.set('Native faiths', (fmap.get('Native faiths') ?? 0) + x.pct);
      continue;
    }
    const s = L.faiths.sectOf(x.idx, u.lon, u.lat);
    const nm = cap(s.faith.id === state.faith.id ? s.sect.name : s.faith.name);
    // A converted people keeps some of its old believers.
    const old = L.faiths.formerOf.get(x.idx);
    const keep = old !== undefined ? (0.04 + 0.16 * r()) * (L.faiths.faiths[s.faith.id].doctrines.others === 'fundamentalist' ? 0.4 : 1) : 0;
    fmap.set(nm, (fmap.get(nm) ?? 0) + x.pct * (1 - keep));
    if (keep) {
      const on = cap(L.faiths.faiths[old!].name);
      fmap.set(on, (fmap.get(on) ?? 0) + x.pct * keep);
    }
  }
  // A dissenting sect of the state faith, here and there.
  const others = state.faith.sects.filter((s) => s.id !== state.sect.id);
  if (others.length && r() < 0.5) {
    const s = pick(r, others);
    const pct = 2 + r() * 9;
    for (const k of fmap.keys()) fmap.set(k, fmap.get(k)! * (1 - pct / 100));
    const nm = cap(s.name);
    fmap.set(nm, (fmap.get(nm) ?? 0) + pct);
  }
  const faithsMix = [...fmap].map(([name, pct]) => ({ name, pct })).sort((a, b) => b.pct - a.pct);
  const bs = L.baronies(id);
  const towns = bs.flatMap((b) => L.townsOf[b]).sort((a, b) => b.population - a.population);
  const seatIds = new Set(chain.map((x) => x.seat));

  // ---- Land ------------------------------------------------------------------------------------
  const terrain = TERRAIN.map(([name, list]) => ({ name, pct: (100 * list.reduce((a, b) => a + land.biome[b], 0)) / Math.max(1, area) })).filter((x) => x.pct >= 3).sort((a, b) => b.pct - a.pct);
  const t = land.temp, pr = land.precip;
  const climate = `${t < -2 ? 'Bitterly cold' : t < 5 ? 'Cold' : t < 11 ? 'Cool' : t < 17 ? 'Mild' : t < 23 ? 'Warm' : 'Hot'} and ${pr < 250 ? 'arid' : pr < 500 ? 'dry' : pr < 1000 ? 'moderately wet' : pr < 1800 ? 'wet' : 'very wet'}: about ${Math.round(t)} °C on average, ${Math.round(pr / 10) * 10} mm of rain a year`;

  // ---- Economy ---------------------------------------------------------------------------------
  const topE = L.econ.get(top.id);
  let econ = topE;
  if (!isTop || !econ) {
    const pr2 = production(c.seed, { key: `${id}`, land, cul, people: u.people, townPop: u.pop, seatName: u.seatName });
    const tr = tradeOf(pr2.out, u.people, L.worldOut, L.worldPeople, u.pop / Math.max(1, u.people) > 0.2);
    econ = { out: pr2.out, exports: tr.exports, imports: tr.imports, special: pr2.special, metals: pr2.metals, revenue: Math.round(((u.people - u.pop) * 0.12 + u.pop * 1.4) * 0.3 / 10) * 10, coin: topE?.coin ?? 'crowns', wealth: 0 };
  }
  const rank = L.wealthRank(id);
  const nTop = L.tops.length;
  const word = rank <= nTop * 0.05 ? 'very rich' : rank <= nTop * 0.25 ? 'rich' : rank <= nTop * 0.6 ? 'prosperous' : rank <= nTop * 0.85 ? 'modest' : 'poor';
  const plist = u.gov === 'league' ? kidsIds.flatMap((k) => L.partners.get(k) ?? []).filter((x, k, a) => a.findIndex((y) => y.id === x.id) === k && !kidsIds.includes(x.id)).slice(0, 5) : L.partners.get(top.id) ?? [];
  const partners = plist.map((x) => ({
    id: x.id, name: units[x.id].name,
    buys: x.goods.filter((g) => !g.startsWith('>')).map(goodName), sells: x.goods.filter((g) => g.startsWith('>')).map((g) => goodName(g.slice(1))),
  }));

  // ---- Armies ----------------------------------------------------------------------------------
  const levyRate = u.gov === 'tribal' ? 0.04 : u.gov === 'republic' || u.gov === 'city-state' ? 0.006 : 0.012;
  const cm = CULTURES[u.culture]?.mods;
  const levy = Math.round((u.people * levyRate * (cm?.levy ?? 1)) / 100) * 100;
  const standing = Math.round((u.pop * (u.level === 4 ? 0.025 : u.gov === 'republic' || u.gov === 'city-state' ? 0.02 : 0.01)) / 50) * 50;
  const horse = Math.round(Math.min(levy * 0.9, levy * (cul === 'steppe' ? 0.8 : cul === 'desert' || cul === 'japonic' ? 0.3 : u.nw ? 0 : 0.12) * (u.nw ? 1 : cm?.cavalry ?? 1)) / 50) * 50;
  const ships = Math.round(Math.min(600, (land.coastKm / (u.gov === 'thalassocracy' ? 8 : 35)) * Math.min(1, u.pop / 20000 + 0.2) * (cm?.fleet ?? 1)));
  const charge: string | undefined = u.arms?.charge?.kind;
  const order = (u.level >= 3 || isTop) && u.gov !== 'tribal' && r() < 0.7 && charge
    ? `${pick(r, ['the Order of the', 'the Knights of the', 'the Brotherhood of the', 'the Company of the'])} ${cap(charge === 'mullet' ? 'Star' : charge === 'estoile' ? 'Star' : charge === 'roundel' ? 'Golden Disc' : charge === 'fleur' ? 'Lily' : charge === 'lozenge' ? 'Diamond' : charge === 'tomoe' ? 'Three Commas' : charge)}`
    : undefined;
  const fortresses = towns.filter((s) => s.walls).length;

  // ---- Faith -------------------------------------------------------------------------------------
  const tolerance = toleranceOf(state.faith, r);

  // ---- Chronicle ---------------------------------------------------------------------------------
  const chronicle = buildChronicle(c, id, reigns, wars.concat(pastWars), r);

  // ---- Prose -------------------------------------------------------------------------------------
  const govWord = u.gov === 'feudal' ? (u.parent >= 0 ? `${(u.title || LEVEL_NAME[u.level]).toLowerCase()} of ${liege!.name}` : (u.title || LEVEL_NAME[u.level]).toLowerCase()) : u.gov === 'tribal' ? (u.title || 'tribe').toLowerCase() : (u.title || u.gov).toLowerCase();
  const tn = terrain.slice(0, 2).map((x) => x.name);
  const lands = tn.length ? `a land of ${tn.join(' and ')}${land.coastKm > 250 ? ' with a long coast' : land.coastKm > 40 ? ' by the sea' : ''}${land.highKm2 / area > 0.2 && !tn.includes('mountains') ? ', hemmed by mountains' : ''}` : '';
  const sents: string[] = [];
  sents.push(`${cap(u.name)} is a ${word} ${govWord} of about ${fmtPeople(u.people)} people${lands ? `, ${lands}` : ''}.`);
  if (ruler && !ruler.heldBy && !ruler.council && now) sents.push(`${cap(ELECTED.has(u.gov) ? 'It has been led' : 'It has been ruled')} since ${now.from} by the ${listAnd(ruler.traits.map((x) => x.toLowerCase()))} ${now.styled}${ruler.house && !SURNAME_FIRST.has(cul) ? ` of ${ruler.house.name}` : ''}.`);
  else if (ruler?.heldBy !== undefined) sents.push(`It is held in person by the ${liege!.ruler} of ${liege!.name}.`);
  if (cultures.length) sents.push(`Its people are mostly ${cultures[0].name}${cultures[1] && cultures[1].pct > 12 ? `, with many ${cultures[1].name}` : ''}, and keep ${state.sect.name}.`);
  if (wars.length && isTop) sents.push(`It is at war with ${listAnd(wars.flatMap((w) => w.enemies).slice(0, 3).map((x) => units[x].name))}.`);
  else if (rivals.length && isTop) sents.push(`Its old rival is ${rivals[0].name}.`);
  if (allies.length && isTop) sents.push(`It stands allied with ${listAnd(allies.slice(0, 3).map((x) => x.name))}.`);
  if (econ.exports.length) sents.push(`It sends ${listAnd(econ.exports.slice(0, 3).map(goodName))} abroad, and is known for ${econ.special[0]}.`);

  const d: RealmDetails = {
    id, unit: u, chain, top, year: L.year, era: L.era, founded: f,
    government: governmentText(u, liege, cul),
    ruler, reigns: reigns.length > 40 ? reigns.slice(-40) : reigns, earlier: Math.max(0, reigns.length - 40), houses, cadets, chronicle,
    allies, friends, rivals, truces, wars, pastWars, claims, claimsOn, members: u.gov === 'league' ? kidsIds : [], vassals,
    people: {
      total: u.people, towns: u.pop, urban: (100 * u.pop) / Math.max(1, u.people), density: u.people / Math.max(1, area), area,
      cultures: cultures.map(({ name, pct, idx }) => ({ name, pct, idx })), folk, faiths: faithsMix,
      settlements: towns.slice(0, 12).map((s) => ({ name: s.name ?? '', pop: s.population, tier: s.colony ? (s.colony === 'post' ? 'trading post' : s.colony) : s.kind === 'tribal' ? 'tribal town' : s.tier, walls: s.walls, coastal: s.coastal, seat: seatIds.has(s.id), lon: s.lon, lat: s.lat })),
      nCities: towns.filter((s) => s.tier === 'city').length, nTowns: towns.filter((s) => s.tier === 'town').length, nVillages: Math.round((u.people - u.pop) / (u.nw ? 120 : 280)),
    },
    land: { terrain, coastKm: land.coastKm, highPct: (100 * land.highKm2) / Math.max(1, area), climate },
    economy: { exports: econ.exports.map(goodName), imports: econ.imports.map(goodName), special: econ.special, partners, revenue: econ.revenue, coin: econ.coin, rank, of: nTop, word },
    military: { levy, standing, horse, ships, style: ARMY[cul] ?? 'levies of foot and horse', order, fortresses },
    faith: { faith: state.faith, sect: state.sect, tolerance },
    overview: sents.join(' '),
    ...nativeTitles(u),
  };
  c.details.set(id, d);
  return d;
}

function nativeTitles(u: PolUnit): { nativeName: string; nativeRuler: string } {
  const L = CULTURES[u.culture]?.language;
  if (!L) return { nativeName: '', nativeRuler: '' };
  return { nativeName: nameCase(translate(L, u.name, { capitalsProper: true, known: STYLE_WORDS })), nativeRuler: nameCase(translate(L, u.ruler.toLowerCase())) };
}

function governmentText(u: PolUnit, liege: PolUnit | null, cul: string): string {
  const v = liege ? ` Vassal of ${liege.name}.` : '';
  switch (u.gov) {
    case 'republic': return `A republic of merchant families, led by a ${u.ruler}.${v}`;
    case 'city-state': return `A free city ruling itself and its hinterland, led by a ${u.ruler}.${v}`;
    case 'theocracy': return `Ruled by the faith: its ${u.ruler} is both lord and priest at once.${v}`;
    case 'thalassocracy': return `A sea power whose strength is its fleets and island ports, ruled by a ${u.ruler}.${v}`;
    case 'league': return `A loose union of independent realms for trade and defence, governed by a ${u.ruler}.`;
    case 'tribal': return `${cul === 'woodland' ? 'A union of clans' : 'A chiefdom of kin and lineages'} under a ${u.ruler}.${v}`;
    case 'colony': return `A colony established across the sea or land, governed by a ${u.ruler} for its masters.${v}`;
    default: return u.level === 4 ? `An empire of many realms under a ${u.ruler}.` : liege ? `A fief held from ${liege.name} by its ${u.ruler}.` : `An independent ${LEVEL_NAME[u.level].toLowerCase()} under a ${u.ruler}.`;
  }
}

function buildChronicle(c: Ctx, id: number, reigns: Reign[], wars: WarView[], r: Rng): ChronEntry[] {
  const { L, units } = c;
  const u = units[id];
  const out: ChronEntry[] = [];
  const f = L.founded(id);
  const liege = u.parent >= 0 ? units[u.parent] : null;
  const first = reigns[0];
  const kidsNames = L.kids[id].map((k) => units[k]).filter((v) => v.seat !== u.seat).sort((a, b) => b.people - a.people);
  const name = u.name;
  // Founding.
  const founding = u.gov === 'league' ? `${cap(name)} was founded by the Treaty of ${u.seatName}`
    : u.gov === 'republic' ? `The people of ${u.seatName} cast out their lord and declared ${name}`
    : u.gov === 'city-state' ? `${u.seatName} bought its freedom from its overlord and became ${name}`
    : u.gov === 'theocracy' ? `The ${u.ruler} took the rule of ${u.seatName} in the name of the faith`
    : u.gov === 'colony' ? `Settlers from ${liege?.name ?? 'overseas'} founded ${u.seatName}`
    : u.gov === 'tribal' ? `The clans gathered under ${first?.styled ?? 'a great chief'} at ${u.seatName}`
    : u.level === 4 ? `${first?.styled ?? 'The first emperor'} was proclaimed ${u.ruler}${kidsNames.length >= 2 ? ` after uniting ${kidsNames[0].name} and ${kidsNames[1].name}` : ''}`
    : u.level === 3 ? `${first?.styled ?? 'The first king'} was crowned at ${u.seatName}, founding ${name}`
    : `${first?.styled ?? 'The first lord'} was granted ${name}`;
  out.push({ year: f, text: founding, kind: 'founding' });
  // Reigns of note.
  for (let i = 1; i < reigns.length; i++) {
    const x = reigns[i], prev = reigns[i - 1];
    const age = x.from - x.person.born;
    if (x.person.house !== prev.person.house && x.person.house && !ELECTED.has(u.gov) && u.gov !== 'colony') out.push({ year: x.from, text: `${x.styled} ${x.how}, the first of ${x.person.house.name}${prev.end && !prev.end.startsWith('died;') ? `, after ${prev.styled} ${prev.end}` : ''}`, kind: 'succession' });
    else if (prev.end && /murdered|battle|deposed|overthrown|sea|hunting/.test(prev.end)) out.push({ year: x.from, text: `${prev.styled} ${prev.end === 'murdered' || prev.end === 'deposed' ? `was ${prev.end}` : prev.end}; ${x.styled} succeeded`, kind: 'succession' });
    else if (age < 14) out.push({ year: x.from, text: `${x.styled} came to the throne aged ${age}; a regency ruled`, kind: 'succession' });
    else if (x.person.female && !ELECTED.has(u.gov) && r() < 0.6) out.push({ year: x.from, text: `${x.styled} succeeded as the realm's ${pick(r, ['first', 'second', 'next'])} ruling ${x.title === 'King' ? 'queen' : 'lady'}`, kind: 'succession' });
    else if (prev.end && /plague|Death|Pox|Fever|Sickness|Wasting|Cough/.test(prev.end)) out.push({ year: x.from, text: `${prev.styled} ${prev.end}`, kind: 'disaster' });
  }
  // Wars and peace.
  for (const w of wars) {
    const foes = w.enemies.map((e) => units[e].name);
    const ra = rulerAt(c, L.topOf[id], w.war.start);
    const why = w.ongoing ? `: ${w.war.cause}` : /holy war/.test(w.war.cause) ? ', in a holy war' : ` over ${w.war.cause}`;
    out.push({ year: w.war.start, text: `${cap(w.war.name)} began: ${ra ? `${ra.styled} ` : ''}${w.side === 0 ? 'went to war with' : 'was attacked by'} ${listAnd(foes)}${why}${w.allies.length ? `, with ${listAnd(w.allies.map((a) => units[a].name))} as allies` : ''}`, kind: 'war' });
    if (!w.ongoing && w.war.end !== undefined) out.push({ year: w.war.end, text: `${cap(w.war.name)} ended: ${w.outcome}`, kind: 'peace' });
  }
  // Marriages and alliances of today.
  const isTop = u.parent < 0;
  for (const [b, rel] of isTop || u.gov === 'league' ? L.relations.get(u.gov === 'league' ? -1 : id) ?? [] : []) {
    if (rel.kind === 'alliance') out.push({ year: rel.since, text: `${rel.married ? 'A marriage sealed an alliance' : `An alliance (${rel.note})`} with ${units[b].name}`, kind: 'alliance' });
  }
  // Vassals gained.
  for (const v of kidsNames.slice(0, 6)) {
    const j = L.joined(v.id);
    if (j.how === 'held by the ruler in person' || j.year <= f) continue;
    const verb = j.how === 'conquest' ? `${cap(v.name)} was conquered` : j.how === 'marriage' ? `${cap(v.name)} came to the crown by marriage` : j.how === 'inheritance' ? `${cap(v.name)} was inherited` : j.how === 'submission' ? `${cap(v.name)} submitted to the ${u.ruler}` : j.how === 'founded as a colony' ? `The colony of ${v.seatName} was founded across the sea` : `${cap(v.name)} swore fealty`;
    out.push({ year: j.year, text: verb, kind: 'vassal' });
  }
  if (liege) {
    const j = L.joined(id);
    if (j.how !== 'held by the ruler in person' && j.year > f) out.push({ year: j.year, text: `Came under ${liege.name} by ${j.how}`, kind: 'vassal' });
  }
  if (u.league >= 0) out.push({ year: Math.max(f, L.founded(u.league)), text: `Joined ${units[u.league].name}`, kind: 'alliance' });
  // The world's great events.
  for (const e of L.events) {
    if (e.year < f || (e.oldWorld && u.nw && u.gov !== 'colony')) continue;
    if (e.name === 'the Age of Sail' && !L.kids[id].some((k) => units[k].gov === 'colony')) continue;
    out.push({ year: e.year, text: cap(e.text), kind: e.name === 'the Great Comet' ? 'wonder' : 'disaster' });
  }
  // Faith.
  const conv = L.faiths.converted.get(u.culture);
  const nowFaith = L.faiths.faiths[L.faiths.ofCulture[u.culture]];
  const oldFaith = L.faiths.faiths[L.faiths.formerOf.get(u.culture) ?? -1];
  if (conv !== undefined && conv > f && nowFaith) {
    const ra = rulerAt(c, id, conv);
    const who = ra ? ra.styled : 'The ruler';
    const fate = nowFaith.doctrines.others === 'pluralist' ? 'the old shrines were left to those who kept the old ways'
      : nowFaith.doctrines.others === 'fundamentalist' ? `the shrines of ${oldFaith?.name ?? 'the old gods'} were thrown down and their priests driven out`
      : 'the old shrines were closed';
    const how = nowFaith.doctrines.conversion === 'sword' && r() < 0.6 ? `was brought to ${nowFaith.name} by the sword` : pick(r, [`was won to ${nowFaith.name} by its missionaries`, `took up ${nowFaith.name}`, `was baptised into ${nowFaith.name}`.replace('baptised into', nowFaith.family === 'church' ? 'baptised into' : 'received into')]);
    out.push({ year: conv, text: `${who} ${how}, and ${fate}`, kind: 'faith' });
  }
  // The birth of a missionary faith in its founders' realm.
  if (nowFaith?.missionary && nowFaith.sects[0]?.culture === u.culture && nowFaith.founded > f && L.baronies(id).some((b) => units[b].seatName === nowFaith.sects[0].originName)) {
    out.push({ year: nowFaith.founded, text: `The prophet ${nowFaith.prophet} began to preach at ${nowFaith.sects[0].originName}, and ${nowFaith.name} was born`, kind: 'faith' });
  }
  const st = L.faiths.sectOf(u.culture, u.lon, u.lat);
  if (st.sect.id > 0 && st.sect.founded > f) out.push({ year: st.sect.founded + Math.floor(r() * 30), text: `The realm took up ${st.sect.name}, which ${st.sect.note}`, kind: 'faith' });
  if (st.faith.tenets.includes('pilgrimage') && r() < 0.5) {
    const site = st.faith.holySites.find((h) => L.baronies(id).some((b) => units[b].seatName === h.name));
    if (site) out.push({ year: f + 1 + Math.floor(r() * Math.max(1, L.year - f - 2)), text: `Pilgrims began to come to ${site.name} in great numbers, and the town grew rich on them`, kind: 'faith' });
  }
  // Building, ruin and wonders.
  const span = Math.max(1, L.year - f - 2);
  // Universities in the realm's lands (the richest realms' great cities).
  for (const b of L.baronies(id)) {
    for (const t of L.townsOf[b] ?? []) {
      if (t.university && t.name) out.push({ year: f + 1 + Math.floor(r() * span), text: `The University of ${t.nameEn ?? t.name} was founded, and scholars came from far lands to study there`, kind: 'building' });
    }
  }
  const at = () => f + 1 + Math.floor(r() * span);
  const fam = st.faith.family;
  const temple = fam === 'church' ? 'cathedral' : fam === 'crescent' ? 'great mosque' : fam === 'serpent' ? 'great pyramid' : fam === 'kami' ? 'great shrine' : 'great temple';
  const pool: [string, ChronEntry['kind']][] = [
    // --- Original Entries ---
    [`The ${temple} of ${u.seatName} was consecrated`, 'building'],
    [`The walls of ${u.seatName} were raised in stone`, 'building'],
    [`A great fire burned half of ${u.seatName}`, 'disaster'],
    ['The harvest failed for three years running, and many starved', 'disaster'],
    [`A school of learning was founded at ${u.seatName}`, 'building'],
    ['A great flood drowned the lowlands', 'disaster'],
    [`A dragon laid waste the country around ${u.seatName} until it was slain`, 'wonder'],
    ['The peasants rose in revolt and were put down', 'disaster'],
    ['An earthquake threw down towers and temples', 'disaster'],
    [`A wizard raised a tower in the hills near ${u.seatName}`, 'wonder'],
    ['The dead walked in the far marches, until the priests laid them to rest', 'wonder'],
    ['Giants came down from the mountains and burned the upland villages', 'wonder'],
    ['New laws were written down and proclaimed in every town', 'building'],
    [`The great bridge at ${u.seatName} was finished`, 'building'],

    // --- Disasters & Hardships ---
    ['A bitter frost locked the realm in winter for ten straight months', 'disaster'],
    ['The Red Ague swept through the realm, emptying half the villages', 'disaster'],
    ['A cloud of locusts stripped the fields bare before the autumn reaping', 'disaster'],
    [`A murrain killed the cattle and horses throughout the province of ${u.seatName}`, 'disaster'],
    ['A sinkhole opened in the market square, swallowing ancient stone foundations', 'disaster'],
    [`Looting mercenaries put the countryside around ${u.seatName} to the sword`, 'disaster'],
    ['Drought turned the royal river to a trickle of foul, stagnant mud', 'disaster'],
    [`An explosion of black powder destroyed the royal armory at ${u.seatName}`, 'disaster'],
    ['A wave of mad dancing sickness afflicted the common folk for weeks', 'disaster'],
    ['The mines collapsed, entombing a generation of local miners below ground', 'disaster'],
    [`A swarm of bloated corpse-flies infected the wells of ${u.seatName}`, 'disaster'],
    ['A night-long hail of burning cinders rained down from the northern sky', 'disaster'],
    ['Rogue inquisitors burned suspected hedge-witches and herbalists on the commons', 'disaster'],

    // --- Buildings, Works & Reforms ---
    [`The royal mint was established at ${u.seatName}, striking the first silver crowns`, 'building'],
    ['A great stone canal was dug to link the inland trade routes', 'building'],
    [`An ancient library was restored in the shadow of ${u.seatName}`, 'building'],
    [`The high granaries of ${u.seatName} were constructed against lean years`, 'building'],
    ['A treaty of trade was signed, bringing foreign merchants to every port', 'building'],
    [`A paved king’s highway was laid through the dark forests around ${u.seatName}`, 'building'],
    ['The gild of stonemasons was chartered by royal decree', 'building'],
    [`The iron gates of ${u.seatName} were cast and hung in the gatehouse`, 'building'],
    ['A vast lighthouse was erected upon the jagged sea-cliffs', 'building'],
    [`An order of warrior-monks established their chapter house near ${u.seatName}`, 'building'],
    ['The old wooden palisades were replaced with heavy mortared bastions', 'building'],
    [`A royal observatory was built atop the high ridge above ${u.seatName}`, 'building'],
    ['A subterranean aqueduct was carved to bring mountain water to the populace', 'building'],

    // --- Wonders, Curses & Folklore ---
    ['A spectral army fought in the clouds above the hills for three suns', 'wonder'],
    [`A curse fell upon the house of a noble family from ${u.seatName}, turning their bloodline mad`, 'wonder'],
    ['A great comet with a blood-red tail hung in the night sky for forty days', 'wonder'],
    ['The forest grew ten leagues in a single night, swallowing three border forts', 'wonder'],
    [`A striga tormented the court of ${u.seatName} until an itinerant witcher laid it low`, 'wonder'],
    ['An ancient monolith uncovered in the peat bogs began to hum a low drone', 'wonder'],
    ['The sun turned pitch-black at midday, and the livestock refused to graze for a year', 'wonder'],
    ['A beast of shadow roamed the countryside, leaving only empty armor behind', 'wonder'],
    ['A spring of sweet silver oil bubbled out of the ground, curing all rot', 'wonder'],
    [`A coven of hags bound the weather of ${u.seatName} until their idol was shattered`, 'wonder'],
    ['An elder leshy awoke, driving every woodsman from the deep forest', 'wonder'],
    ['A wandering prophet spoke three true doom-omens before turning to salt', 'wonder'],
    ['A sea-monster was washed ashore, its stomach filled with ancient gold coins', 'wonder'],
    ['A ring of towering menhirs burst up through the soil during a lightning storm', 'wonder'],
    [`The bell of ${temple} rang forty times on its own, foretelling a king’s fall`, 'wonder'],
    ['A plague of ghastly wailing ghosts rose from the sunken battlefield at dusk', 'wonder'],
    ['A fallen star crushed the high chapel, leaving behind a stone that never cools', 'wonder'],
    ['Unnatural fog enveloped the valley, causing all who entered to lose their memories', 'wonder'],
    [`A dark idol was unearthed in the cellars beneath ${u.seatName} and cast into the sea`, 'wonder'],
  ];
  if (L.land(id).coastKm > 40) pool.push([`The great harbour of ${u.seatName} was built`, 'building'], ['Raiders from the sea burned the coastal towns', 'disaster']);
  const n = Math.min(pool.length, u.level >= 3 || isTop ? 4 : 2);
  for (let k = 0; k < n; k++) {
    const i = Math.floor(r() * pool.length);
    const [text, kind] = pool.splice(i, 1)[0];
    out.push({ year: at(), text, kind });
  }
  return out.filter((e) => e.year <= L.year).sort((a, b) => a.year - b.year);
}

export function fmtPeople(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} million`;
  if (n >= 1e4) return (Math.round(n / 1000) * 1000).toLocaleString('en');
  return (Math.round(n / 10) * 10).toLocaleString('en');
}

export function listAnd(a: string[]): string {
  if (a.length <= 1) return a[0] ?? '';
  return `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
}

/** Relations of a realm's independent realm, for the map: unit id to relation kind. */
export function relationsForMap(c: Ctx, id: number): { self: number; rel: Map<number, string>; partners: number[] } {
  const { L, units } = c;
  const top = units[id].gov === 'league' ? id : L.topOf[id];
  const rel = new Map<number, string>();
  if (units[id].gov === 'league') {
    for (const v of units) if (v.league === id) rel.set(v.id, 'league');
    return { self: -1, rel, partners: [] };
  }
  for (const [b, r] of L.relations.get(top) ?? []) rel.set(b, r.kind);
  for (const w of L.wars) {
    if (w.end !== undefined) continue;
    const mine = w.attackers.includes(top) ? w.attackers : w.defenders.includes(top) ? w.defenders : null;
    if (!mine) continue;
    const theirs = mine === w.attackers ? w.defenders : w.attackers;
    for (const x of theirs) rel.set(x, 'war');
    for (const x of mine) if (x !== top) rel.set(x, 'alliance');
  }
  return { self: top, rel, partners: (L.partners.get(top) ?? []).map((x) => x.id) };
}

