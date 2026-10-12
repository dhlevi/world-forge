import { Biome } from '../gen/biomes';
import { NB_BIOME, NB_CULTURE, type RealmStats } from '../gen/politics';
import { hashString, mulberry32, type Rng } from '../gen/rng';

/**
 * A realm's land and trade. Its land is summed from its baronies' statistics; what it grows,
 * mines and makes follows from its biomes, climate, coast and uplands, scaled by its people; its
 * crafts come from its culture and its towns. What it makes far more of than the world does is
 * its exports; staples and luxuries it lacks are its imports. Partners are the realms whose
 * exports meet its imports, nearer (by sea, much nearer) counting for more.
 */

export interface Land {
  areaKm2: number;
  biome: Float64Array;
  culture: Float64Array;
  coastKm: number;
  highKm2: number;
  temp: number;
  precip: number;
}

export function emptyLand(): Land {
  return { areaKm2: 0, biome: new Float64Array(NB_BIOME), culture: new Float64Array(NB_CULTURE), coastKm: 0, highKm2: 0, temp: 0, precip: 0 };
}

/** Adds a barony's land to a sum (temperature and rain weighted by area; divide with `finishLand`). */
export function addLand(l: Land, s: RealmStats, b: number): void {
  let a = 0;
  for (let k = 0; k < NB_BIOME; k++) {
    const v = s.biome[b * NB_BIOME + k];
    l.biome[k] += v;
    a += v;
  }
  for (let k = 0; k < NB_CULTURE; k++) l.culture[k] += s.culture[b * NB_CULTURE + k];
  l.areaKm2 += a;
  l.coastKm += s.coastKm[b];
  l.highKm2 += s.highKm2[b];
  l.temp += s.temp[b] * a;
  l.precip += s.precip[b] * a;
}
export function finishLand(l: Land): Land {
  if (l.areaKm2 > 0) {
    l.temp /= l.areaKm2;
    l.precip /= l.areaKm2;
  }
  return l;
}

export type GoodKind = 'staple' | 'material' | 'luxury';
interface GoodDef {
  name: string;
  kind: GoodKind;
  /** Output per km² (or per km of coast), before people are counted. */
  make: (l: Land, cul: string) => number;
}

const B = (l: Land, ...bs: Biome[]) => bs.reduce((a, b) => a + l.biome[b], 0);
const band = (v: number, lo: number, hi: number) => (v >= lo && v <= hi ? 1 : 0);
const EAST = new Set(['sinic', 'japonic', 'koreanic']);

const GOODS: Record<string, GoodDef> = {
  grain: { name: 'grain', kind: 'staple', make: (l) => B(l, Biome.Grassland) + 0.5 * B(l, Biome.TemperateForest) + 2 * B(l, Biome.Riparian) + 0.3 * B(l, Biome.Savanna, Biome.Shrubland) },
  rice: { name: 'rice', kind: 'staple', make: (l, c) => (l.temp > 14 && l.precip > 900 ? B(l, Biome.Wetland, Biome.Riparian, Biome.TropicalDryForest) * 3 + (EAST.has(c) ? B(l, Biome.TemperateForest, Biome.Grassland) : 0) : 0) },
  maize: { name: 'maize', kind: 'staple', make: (l, c) => (c === 'jungle' || c === 'highland' || c === 'woodland' ? B(l, Biome.Grassland, Biome.TemperateForest, Biome.TropicalDryForest, Biome.Savanna) : 0) },
  cattle: { name: 'cattle', kind: 'staple', make: (l) => B(l, Biome.Grassland, Biome.Savanna) + 0.5 * B(l, Biome.Shrubland) },
  fish: { name: 'salt fish', kind: 'staple', make: (l) => l.coastKm * 30 },
  salt: { name: 'salt', kind: 'material', make: (l) => 6 * B(l, Biome.SaltFlat) + (l.temp > 17 ? l.coastKm * 8 : 0) + 0.05 * B(l, Biome.HotDesert) },
  timber: { name: 'timber', kind: 'material', make: (l) => B(l, Biome.BorealForest, Biome.TemperateForest, Biome.TemperateRainforest, Biome.MontaneForest) },
  wool: { name: 'wool', kind: 'material', make: (l) => (l.temp < 15 ? B(l, Biome.Grassland, Biome.Shrubland) + 0.5 * B(l, Biome.Alpine) : 0) },
  horses: { name: 'horses', kind: 'material', make: (l, c) => (B(l, Biome.Grassland) + B(l, Biome.ColdDesert)) * (c === 'steppe' ? 3 : 0.4) },
  furs: { name: 'furs', kind: 'luxury', make: (l) => (l.temp < 6 ? B(l, Biome.BorealForest) + 0.5 * B(l, Biome.Tundra) : 0) },
  iron: { name: 'iron', kind: 'material', make: (l) => l.highKm2 * 0.8 + 0.05 * B(l, Biome.BorealForest, Biome.Wetland) },
  stone: { name: 'building stone', kind: 'material', make: (l) => l.highKm2 * 0.4 },
  marble: { name: 'marble', kind: 'luxury', make: (l) => (l.temp > 12 ? l.highKm2 * 0.3 : 0) },
  wine: { name: 'wine', kind: 'luxury', make: (l) => band(l.temp, 11, 20) * band(l.precip, 300, 1100) * (B(l, Biome.Shrubland) + 0.4 * B(l, Biome.Grassland, Biome.TemperateForest)) },
  olives: { name: 'olive oil', kind: 'staple', make: (l) => band(l.temp, 15, 23) * (l.precip < 900 ? 1 : 0) * B(l, Biome.Shrubland) },
  spices: { name: 'spices', kind: 'luxury', make: (l) => (l.temp > 22 ? B(l, Biome.TropicalRainforest) + 0.5 * B(l, Biome.TropicalDryForest) : 0) },
  sugar: { name: 'sugar', kind: 'luxury', make: (l) => (l.temp > 21 ? B(l, Biome.TropicalDryForest, Biome.Riparian, Biome.Savanna) * 0.5 : 0) },
  cotton: { name: 'cotton', kind: 'material', make: (l) => (l.temp > 18 ? B(l, Biome.Riparian) * 2 + 0.3 * B(l, Biome.Savanna, Biome.Shrubland) : 0) },
  dates: { name: 'dates', kind: 'staple', make: (l) => (l.temp > 19 ? B(l, Biome.Riparian) * 1.5 + 0.06 * B(l, Biome.HotDesert) : 0) },
  incense: { name: 'incense', kind: 'luxury', make: (l) => (l.temp > 20 && l.precip < 500 ? B(l, Biome.Shrubland, Biome.HotDesert) * 0.2 : 0) },
  ivory: { name: 'ivory', kind: 'luxury', make: (l) => (l.temp > 20 ? B(l, Biome.Savanna) * 0.3 : 0) },
  tea: { name: 'tea', kind: 'luxury', make: (l, c) => (EAST.has(c) && band(l.temp, 11, 23) && l.precip > 1100 ? B(l, Biome.MontaneForest, Biome.TemperateForest, Biome.TemperateRainforest) : 0) },
  silk: { name: 'silk', kind: 'luxury', make: (l, c) => (c === 'sinic' || c === 'koreanic' ? B(l, Biome.TemperateForest, Biome.Grassland, Biome.Riparian) * 0.5 : 0) },
  pearls: { name: 'pearls', kind: 'luxury', make: (l) => (l.temp > 22 ? l.coastKm * 3 : 0) },
  amber: { name: 'amber', kind: 'luxury', make: (l) => (l.temp < 9 && l.temp > 0 ? l.coastKm * 2 : 0) },
  whale: { name: 'whale oil', kind: 'material', make: (l) => (l.temp < 4 ? l.coastKm * 4 : 0) },
  honey: { name: 'honey and wax', kind: 'staple', make: (l, c) => (B(l, Biome.TemperateForest) + 0.5 * B(l, Biome.BorealForest)) * (c === 'slavic' ? 1.6 : 0.5) },
  dyes: { name: 'dyes', kind: 'luxury', make: (l) => (l.temp > 20 ? B(l, Biome.TropicalRainforest, Biome.Mangrove) * 0.5 : 0.04 * B(l, Biome.Grassland)) },
  cacao: { name: 'cacao', kind: 'luxury', make: (l, c) => (c === 'jungle' && l.temp > 21 ? B(l, Biome.TropicalRainforest, Biome.TropicalDryForest) : 0) },
  // Metals: mountains yield them by luck (see `metals`).
  silver: { name: 'silver', kind: 'luxury', make: () => 0 },
  gold: { name: 'gold', kind: 'luxury', make: () => 0 },
  copper: { name: 'copper', kind: 'material', make: () => 0 },
  tin: { name: 'tin', kind: 'material', make: () => 0 },
  gems: { name: 'gemstones', kind: 'luxury', make: () => 0 },
  // Wares of the towns.
  cloth: { name: 'cloth', kind: 'material', make: () => 0 },
  tools: { name: 'tools and arms', kind: 'material', make: () => 0 },
};
export const GOOD_IDS = Object.keys(GOODS);
export const goodName = (g: string) => GOODS[g]?.name ?? g;
export const goodKind = (g: string) => GOODS[g]?.kind ?? 'material';

/** Each culture's crafts: what its towns are known for. */
const CRAFTS: Record<string, string[]> = {
  anglo: ['fine woollen cloth', 'longbows', 'pewter', 'ale'], latin: ['glassware', 'silk brocade', 'fine wine', 'painted maiolica'], norse: ['walrus ivory', 'longships', 'amber jewellery', 'mead'],
  celtic: ['whisky', 'gold torcs', 'illuminated books', 'tweed'], elvish: ['moonsilk', 'elven bows', 'starwine', 'mithral filigree'], desert: ['carpets', 'damascened steel', 'rosewater', 'astrolabes'],
  slavic: ['sable furs', 'honey mead', 'painted icons', 'linen'], dwarven: ['dwarven steel', 'cut gems', 'clockwork', 'stout ale'], southern: ['purple dye', 'marble statuary', 'painted pottery', 'olive oil'],
  steppe: ['horses', 'felt', 'composite bows', 'kumis'], jungle: ['jade', 'featherwork', 'obsidian blades', 'chocolate'], sinic: ['porcelain', 'silk', 'lacquerware', 'paper'],
  japonic: ['swords', 'lacquerware', 'woodblock prints', 'sake'], koreanic: ['celadon ware', 'ginseng', 'mulberry paper', 'printed books'], woodland: ['furs', 'wampum', 'maple sugar', 'birchbark canoes'],
  highland: ['alpaca wool', 'silverwork', 'woven tapestries', 'freeze-dried potatoes'],
};

export interface Economy {
  /** Output of each good (arbitrary units, comparable across realms). */
  out: Record<string, number>;
  exports: string[];
  imports: string[];
  /** Named specialities: "Ashford woollen cloth". */
  special: string[];
  metals: string[];
  /** Estimated yearly revenue of the ruler, in the realm's coin. */
  revenue: number;
  coin: string;
  /** Wealth score for ranking. */
  wealth: number;
}

const COIN: Record<string, string> = {
  anglo: 'crowns', latin: 'florins', norse: 'marks', celtic: 'crowns', elvish: 'leaves', desert: 'dinars', slavic: 'grivnas', dwarven: 'ingots', southern: 'nomismata',
  steppe: 'silver sukhe', jungle: 'cacao beans', sinic: 'taels', japonic: 'ryo', koreanic: 'mun', woodland: 'strings of wampum', highland: 'bales of cloth',
};

const pick = <T>(rnd: Rng, a: readonly T[]): T => a[Math.floor(rnd() * a.length)];

/** Metals in a realm's mountains, by luck seeded from its seat (dwarves find more). */
function metals(l: Land, cul: string, rnd: Rng): string[] {
  const out: string[] = [];
  if (l.highKm2 < 400) return out;
  const k = Math.min(1, l.highKm2 / 30000) * (cul === 'dwarven' ? 1.8 : 1);
  if (rnd() < 0.55 * k + 0.1) out.push('copper');
  if (rnd() < 0.45 * k + 0.05) out.push('silver');
  if (rnd() < 0.25 * k + 0.03) out.push('gold');
  if (rnd() < 0.3 * k) out.push('tin');
  if (rnd() < 0.2 * k + (cul === 'dwarven' ? 0.2 : 0)) out.push('gems');
  return out;
}

export interface EconInput {
  key: string;
  land: Land;
  cul: string;
  people: number;
  townPop: number;
  /** Trait multiplier for crafts (Master Craftsmen, Inventive). */
  crafts?: number;
  seatName: string;
}

/** Raw output of each good for a realm (exports and imports need the world totals; see `tradeOf`). */
export function production(seed: string, x: EconInput): { out: Record<string, number>; metals: string[]; special: string[] } {
  const rnd = mulberry32(hashString(`${seed}#econ#${x.key}`));
  const l = x.land;
  const out: Record<string, number> = {};
  // The land yields as much as its people work: output per km² times the share of land worked.
  const worked = Math.min(1, (x.people / Math.max(1, l.areaKm2)) / 12) * 0.7 + 0.3;
  for (const g of GOOD_IDS) out[g] = Math.max(0, GOODS[g].make(l, x.cul)) * worked;
  const mt = metals(l, x.cul, rnd);
  for (const m of mt) out[m] = l.highKm2 * (m === 'gold' || m === 'gems' ? 0.08 : 0.25) * worked;
  out.cloth = x.townPop * 0.6;
  out.tools = x.townPop * 0.3 + out.iron * 0.2;
  const crafts = CRAFTS[x.cul] ?? ['fine cloth'];
  const special = [`${x.seatName} ${pick(rnd, crafts)}`];
  if ((x.townPop > 60000 || (x.crafts ?? 1) > 1.3) && rnd() < 0.6 * (x.crafts ?? 1)) {
    const c2 = pick(rnd, crafts);
    if (!special[0].endsWith(c2)) special.push(c2);
  }
  return { out, metals: mt, special };
}

export function coinOf(cul: string): string {
  return COIN[cul] ?? 'crowns';
}

const NEEDS = ['grain', 'timber', 'salt', 'iron', 'cloth'];
const LUXURIES = ['wine', 'spices', 'silk', 'furs', 'incense', 'sugar', 'tea', 'pearls', 'ivory', 'dyes', 'amber', 'marble', 'gold', 'silver', 'gems', 'cacao'];

/**
 * Exports and imports from location quotients: a good is exported when the realm's share of the
 * world's output of it is well above its share of the world's people; a staple well below is
 * imported, and a rich realm imports the luxuries it lacks.
 */
export function tradeOf(out: Record<string, number>, people: number, world: Record<string, number>, worldPeople: number, rich: boolean): { exports: string[]; imports: string[] } {
  const share = people / Math.max(1, worldPeople);
  const lq = (g: string) => (world[g] > 0 ? out[g] / world[g] / Math.max(1e-9, share) : 0);
  const exports = GOOD_IDS.filter((g) => out[g] > 0 && lq(g) > 1.6 && g !== 'cloth' && g !== 'tools').sort((a, b) => lq(b) - lq(a)).slice(0, 5);
  const imports: string[] = [];
  for (const g of NEEDS) if (lq(g) < 0.45) imports.push(g);
  // Rice or maize lands do not need grain.
  if (imports.includes('grain') && (lq('rice') > 0.8 || lq('maize') > 0.8 || lq('dates') > 1)) imports.splice(imports.indexOf('grain'), 1);
  if (rich) for (const g of LUXURIES) if (imports.length < 6 && lq(g) < 0.2 && world[g] > 0) imports.push(g);
  return { exports, imports };
}
