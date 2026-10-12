import { type Grid, distKm, neighbor } from './grid';
import { MinHeap } from './heap';
import { hashString, mulberry32 } from './rng';
import type { RiverCollection } from './rivers';
import type { Settlement } from './settlements';
import type { LabelFeature } from './features';
import { CULTURES } from '../names/cultures';
import type { CultureMods } from '../names/traits';
import { Biome } from './biomes';
import type { NameBank } from '../names/names';
import { type Arms, type Charge, cadetArms, newArms, vassalArms } from '../heraldry/arms';

/**
 * The political map, built from the bottom up in five tiers. Every city and town seats a
 * **barony** over the land nearest it by travel cost (mountains, big rivers and culture changes
 * count as distance; the sea cannot be crossed), so borders follow ranges and rivers. Baronies
 * gather into **counties**, counties into **duchies**, duchies (and counties left over) into
 * **kingdoms**, and a few great kingdoms, with the duchies and counties around them, into
 * **empires** (two or three in a world, likelier among Latin and desert peoples). At any tier a
 * realm may stand alone: city-states, prince-bishoprics, free counties, grand duchies and
 * independent kingdoms, the commonest. Independent realms take a government by culture and
 * place: republics (above all in the south), theocracies, sea realms on islands
 * (thalassocracies), and leagues or confederacies of small neighbours. Land far from any town is
 * left unclaimed.
 */
export type PolLevel = 0 | 1 | 2 | 3 | 4;
export const LEVEL_NAME = ['Barony', 'County', 'Duchy', 'Kingdom', 'Empire'] as const;
export type Gov = 'feudal' | 'city-state' | 'republic' | 'theocracy' | 'thalassocracy' | 'league' | 'tribal' | 'colony';

export interface PolUnit {
  id: number;
  level: PolLevel;
  /** Government. Leagues are unions of independent members (which keep `parent` -1 and set `league`). */
  gov: Gov;
  /** Display kind: "Barony", "City", "Grand Duchy", "City-state", "Republic", "Theocracy", "League". */
  title: string;
  /** Full style, e.g. "Duchy of Anterina", "the Ragndal Empire". */
  name: string;
  /** The ruler's title ("Duke", "Sultan", "Doge", "Council"). */
  ruler: string;
  /** Seat (capital) settlement. */
  seat: string;
  seatName: string;
  /** The seat is a city (not a town). */
  city: boolean;
  lon: number;
  lat: number;
  /** Liege unit id, or -1 (independent). */
  parent: number;
  /** League or confederacy this independent realm belongs to, or -1. */
  league: number;
  culture: number;
  arms: Arms;
  /** People in its cities and towns (town-dwellers). */
  pop: number;
  /** Estimated people in all, countryside included (from its land's habitability). */
  people: number;
  /** In the New World. */
  nw: boolean;
  areaKm2: number;
  /** Direct vassals (members, for a league). */
  vassals: number;
}

export interface BorderFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: number[][] };
  /** Level 0 to 4 (barony to empire; between independent realms, the higher of the two, at least 2), or 5 for a league's edge. */
  properties: { level: PolLevel | 5 };
}

export interface Politics {
  /** Size of the grid `baronyOf` is on (at most 1024 × 512, whatever the world's detail). */
  W: number;
  H: number;
  /** Barony id per grid cell, or -1. */
  baronyOf: Int32Array;
  units: PolUnit[];
  borders: { type: 'FeatureCollection'; features: BorderFeature[] };
  /** Land statistics per barony, for realm details (see `RealmStats`). */
  stats: RealmStats;
}

/**
 * Land statistics per barony (unit ids 0 to `nb` - 1 are the baronies), summed up the tiers on
 * demand for a realm's details: its land by biome, its people by culture, coast, uplands and
 * climate, and which baronies border which.
 */
export interface RealmStats {
  nb: number;
  /** Biome count per barony: km² of each biome (`nb` × `NB_BIOME`). */
  biome: Float32Array;
  /** Habitable km² by culture (`nb` × `NB_CULTURE`), for the mix of peoples. */
  culture: Float32Array;
  /** Coastline, km (land cells on the open sea, times the cell size). */
  coastKm: Float32Array;
  /** Land above 1200 m, km². */
  highKm2: Float32Array;
  /** Mean annual temperature (°C) and precipitation (mm) over the barony's land. */
  temp: Float32Array;
  precip: Float32Array;
  /** Bordering barony pairs, flattened (a, b, a, b, ...), each pair once with a < b. */
  adj: Int32Array;
}
export const NB_BIOME = 18;
export const NB_CULTURE = 24;

/** The chain of lieges from a unit up to its independent realm, then its league if it has one. */
export function chainOf(units: PolUnit[], id: number): PolUnit[] {
  const out: PolUnit[] = [];
  let u: PolUnit | null = id >= 0 ? units[id] : null;
  while (u) {
    out.push(u);
    if (u.parent >= 0) u = units[u.parent];
    else {
      if (u.league >= 0) out.push(units[u.league]);
      u = null;
    }
  }
  return out;
}

/** Ruler titles by culture: [barony, county, duchy, kingdom, empire]. */
const RULERS: Record<string, [string, string, string, string, string]> = {
  anglo: ['Baron', 'Earl', 'Duke', 'King', 'Emperor'], norse: ['Hersir', 'Jarl', 'Duke', 'King', 'High King'],
  latin: ['Baron', 'Count', 'Duke', 'King', 'Emperor'], celtic: ['Lord', 'Chieftain', 'Prince', 'King', 'High King'],
  elvish: ['Warden', 'Lord', 'Prince', 'King', 'High King'], desert: ['Sipahi', 'Bey', 'Emir', 'Sultan', 'Caliph'],
  slavic: ['Boyar', 'Zhupan', 'Voivode', 'Tsar', 'Emperor'], dwarven: ['Thane', 'Lord', 'Lord', 'King', 'High King'],
  southern: ['Demarch', 'Archon', 'Despot', 'King', 'Autokrator'], steppe: ['Noyan', 'Bey', 'Khan', 'Khan', 'Khagan'],
  jungle: ['Lord', 'Lord', 'Prince', 'King', 'Emperor'],
  sinic: ['Magistrate', 'Prefect', 'Governor', 'King', 'Emperor'], japonic: ['Lord', 'Daimyo', 'Shugo', 'Shogun', 'Emperor'],
  koreanic: ['Magistrate', 'Gunsu', 'Governor', 'King', 'Emperor'],
};
const BARONY_STYLE: Record<string, string[]> = {
  anglo: ['Barony of {S}', 'Manor of {S}'], norse: ['Herad of {S}', 'Barony of {S}'], latin: ['Barony of {S}', 'Signory of {S}'],
  celtic: ['Tuath of {S}', 'Lordship of {S}'], elvish: ['Demesne of {S}', 'Wardenry of {S}'], desert: ['Timar of {S}', 'Iqta of {S}'],
  slavic: ['Volost of {S}', 'Barony of {S}'], dwarven: ['Thanedom of {S}', 'Hall of {S}'], southern: ['Deme of {S}', 'Barony of {S}'],
  steppe: ['Ulus of {S}', 'Aul of {S}'], jungle: ['Lordship of {S}', 'Barony of {S}'],
  sinic: ['County of {S}', 'Xian of {S}'], japonic: ['Fief of {S}', '{S} Fief'], koreanic: ['Hyeon of {S}', 'County of {S}'],
};
const COUNTY_STYLE: Record<string, string[]> = {
  anglo: ['County of {S}', '{S}shire', 'Earldom of {S}'], norse: ['Jarldom of {S}', 'County of {S}'],
  latin: ['County of {S}', 'March of {S}'], celtic: ['Cantref of {S}', 'Chiefdom of {S}'],
  elvish: ['March of {S}', 'Lordship of {S}'], desert: ['Beylik of {S}', 'Sanjak of {S}'], slavic: ['Zhupa of {S}', 'County of {S}'],
  dwarven: ['Hold of {S}', 'Delving of {S}'], southern: ['Archonate of {S}', 'Nome of {S}'], steppe: ['Beylik of {S}', 'Tumen of {S}'],
  jungle: ['Lordship of {S}', 'County of {S}'],
  sinic: ['Prefecture of {S}', '{S} Prefecture'], japonic: ['{S} Domain', 'Domain of {S}'], koreanic: ['Gun of {S}', 'Prefecture of {S}'],
};
const DUCHY_STYLE: Record<string, string[]> = {
  anglo: ['Duchy of {N}', 'Dukedom of {N}'], norse: ['Duchy of {N}', '{N} Lands'], latin: ['Duchy of {N}', 'Principality of {N}'],
  celtic: ['Principality of {N}', 'Province of {N}'], elvish: ['Principality of {N}', 'Duchy of {N}'], desert: ['Emirate of {N}'],
  slavic: ['Voivodeship of {N}', 'Principality of {N}'], dwarven: ['Lordship of {N}', 'Deep of {N}'], southern: ['Despotate of {N}', 'Duchy of {N}'],
  steppe: ['Khanate of {N}', 'Horde of {N}', 'the {A} Horde'], jungle: ['Principality of {N}', 'Duchy of {N}'],
  sinic: ['Province of {N}', '{N} Province'], japonic: ['Province of {N}', '{N} Province'], koreanic: ['Province of {N}', '{N}-do'],
};
const EMPIRE_STYLE: Record<string, string[]> = {
  anglo: ['United Kingdom of {N}', 'the {N} Empire', 'Empire of {N}'], norse: ['High Kingdom of {N}', 'the {N} Empire'], latin: ['Imperium of {N}', 'the {N} Empire'],
  celtic: ['High Kingdom of {N}'], elvish: ['High Kingdom of {N}', 'the {N} Dominion'], desert: ['Caliphate of {N}', 'the {N} Caliphate'],
  slavic: ['Empire of {N}', 'the {N} Tsardom'], dwarven: ['High Kingdom under {N}', 'the {N} Throne'], southern: ['Empire of {N}', 'the {N} Basileia'],
  steppe: ['Khaganate of {N}', 'the Great {N} Horde'], jungle: ['Empire of {N}', 'the {N} Empire'],
  sinic: ['the {N} Empire', 'the {N} Dynasty', 'Middle Kingdom of {N}'], japonic: ['Empire of {N}', 'the {N} Empire'], koreanic: ['Great {N} Empire', 'the {N} Empire'],
};
/** Kingdom names come from each culture's `realm` list, less the styles that now belong to a government or another tier. */
const NOT_KINGDOM = /republic|league|confedera|empire|imperium|county|duchy|earldom|caliphate|dominion|province/i;

const CITY_RULER: Record<string, string> = {
  anglo: 'Lord Mayor', latin: 'Podesta', norse: 'Burgomaster', slavic: 'Burgomaster', desert: 'Wali', southern: 'Archon',
  celtic: 'Provost', elvish: 'Steward', dwarven: 'Steward', steppe: 'Governor', jungle: 'Governor', sinic: 'Magistrate', japonic: 'Machi-bugyo', koreanic: 'Magistrate',
};
const REPUBLIC_RULER: Record<string, string> = { sinic: 'Chancellor', japonic: 'Council Elder', koreanic: 'Chancellor',
  anglo: 'Lord Protector', latin: 'Doge', norse: 'Lawspeaker', slavic: 'Posadnik', desert: 'Grand Vizier', southern: 'Archon',
  celtic: 'Speaker', elvish: 'Speaker', dwarven: 'High Steward', steppe: 'Khan', jungle: 'Speaker',
};
const CITY_STATE_STYLE: Record<string, string[]> = {
  southern: ['Polis of {S}', 'Republic of {S}', 'Free Polis of {S}'], latin: ['Most Serene Republic of {S}', 'Commune of {S}', 'Republic of {S}'],
  slavic: ['Free City of {S}', 'Republic of {S}'], norse: ['Free City of {S}'], desert: ['City-state of {S}', 'Free City of {S}'],
};
const REPUBLIC_STYLE: Record<string, string[]> = {
  southern: ['Republic of {N}', 'the {N} Republic', 'Koinon of {N}'], latin: ['Republic of {N}', 'the Serene Republic of {N}'],
  anglo: ['Commonwealth of {N}', 'Republic of {N}', 'United Provinces of {N}'], dwarven: ['Commonwealth of the {N} Holds', 'Republic of {N}'],
};
const THEOCRACY_SMALL: Record<string, [string, string][]> = {
  desert: [['Imamate of {S}', 'Imam']], celtic: [['Druidry of {S}', 'Archdruid']], elvish: [['Sanctuary of {S}', 'High Priestess']],
  norse: [['Temple-lands of {S}', 'Godi']], steppe: [['Ordu of {S}', 'Shaman-Khan']],
};
const THEOCRACY_BIG: Record<string, [string, string][]> = {
  desert: [['Imamate of {N}', 'Imam']], celtic: [['Holy Isle of {N}', 'Archdruid']], elvish: [['Sacred Realm of {N}', 'High Priestess']],
  norse: [['Holy Realm of {N}', 'High Godi']], southern: [['Hierocracy of {N}', 'Hierarch']],
};
const THALASSO_STYLE: Record<string, [string, string][]> = {
  norse: [['Sea Kingdom of {N}', 'Sea King'], ['the {N} Isles', 'Sea King']], southern: [['Thalassocracy of {N}', 'Thalassarch']],
  latin: [['Maritime Republic of {N}', 'Doge'], ['Thalassocracy of {N}', 'Thalassarch']],
};
const LEAGUE_STYLE: Record<string, string[]> = {
  woodland: ['the {N} Confederacy', 'League of the {N} Nations'], jungle: ['the {N} League', 'Triple Alliance of {N}'], highland: ['the {N} Confederation'],
  southern: ['the {N} League', 'Amphictyony of {N}'], norse: ['Hanse of {N}', 'the {N} League'], anglo: ['the {N} Confederation', 'League of {N}'],
  steppe: ['Confederacy of {N}', 'the {N} Confederacy'], celtic: ['Confederacy of {N}'], latin: ['League of {N}', 'the {N} League'],
};
const LEAGUE_RULER: Record<string, string> = { woodland: 'Council of Chiefs', jungle: 'Council of Lords', highland: 'Council of Lords', norse: 'Allthing', steppe: 'Kurultai', anglo: 'Diet', southern: 'Synedrion', celtic: 'Council of Chiefs' };
const ADJ = ['Golden', 'White', 'Blue', 'Black', 'Red', 'Great', 'Silver', 'Grey'];

/** Culture leanings (0 to 1, or a weight). */
const CITY_STATE_P: Record<string, number> = { sinic: 0.02, japonic: 0.03, koreanic: 0.02, southern: 0.6, latin: 0.14, anglo: 0.06, norse: 0.06, slavic: 0.06, desert: 0.08, jungle: 0.06, elvish: 0.05, dwarven: 0.05, celtic: 0.02, steppe: 0 };
const REPUBLIC_P: Record<string, number> = { sinic: 0.01, japonic: 0.01, koreanic: 0.01, southern: 0.4, latin: 0.12, anglo: 0.1, dwarven: 0.12, elvish: 0.06, jungle: 0.05, desert: 0.03, slavic: 0.03, norse: 0.03, celtic: 0.02, steppe: 0 };
const INDEP_DUCHY_P: Record<string, number> = { japonic: 0.12, sinic: 0.03, koreanic: 0.04, southern: 0.16, latin: 0.08, elvish: 0.08, dwarven: 0.08, jungle: 0.08, steppe: 0.1, anglo: 0.05, desert: 0.05, norse: 0.015, slavic: 0.015, celtic: 0.015 };
const EMPIRE_W: Record<string, number> = { latin: 3, desert: 3, sinic: 3, steppe: 1.4, anglo: 1, jungle: 1.5, highland: 3, japonic: 0.8, koreanic: 0.6, slavic: 0.6, southern: 0.5, elvish: 0.7, dwarven: 0.6, norse: 0.4, celtic: 0.4, woodland: 0.3 };
const LEAGUE_P: Record<string, number> = { southern: 0.55, norse: 0.4, steppe: 0.4, celtic: 0.35, anglo: 0.3, latin: 0.3, woodland: 0.85, jungle: 0.45, highland: 0.2, sinic: 0.1, japonic: 0.15 };

const STYLE_RULER: [RegExp, string][] = [
  [/Sultanate/i, 'Sultan'], [/Emirate/i, 'Emir'], [/Caliphate/i, 'Caliph'], [/Principality/i, 'Prince'], [/Grand Duchy/i, 'Grand Duke'],
  [/Tsardom/i, 'Tsar'], [/Khaganate/i, 'Khagan'], [/Khanate|Horde/i, 'Khan'], [/Voivodeship/i, 'Voivode'], [/Despotate/i, 'Despot'],
  [/Jarldom/i, 'Jarl'], [/Earldom|shire$/i, 'Earl'], [/Barony/i, 'Baron'], [/^(the )?March/i, 'Margrave'], [/Beylik|Sanjak/i, 'Bey'],
  [/Thanedom/i, 'Thane'], [/Herad/i, 'Hersir'], [/Timar|Iqta/i, 'Sipahi'], [/Signory/i, 'Signore'], [/Tuath/i, 'Lord'], [/Deme of/i, 'Demarch'],
  [/Ulus|Aul of/i, 'Noyan'], [/Tumen/i, 'Noyan'], [/Zhupa/i, 'Zhupan'], [/Cantref|Chiefdom/i, 'Chieftain'], [/Wardenry/i, 'Warden'],
  [/Lordship/i, 'Lord'], [/Dukedom|Duchy/i, 'Duke'], [/^County/i, 'Count'], [/Archonate/i, 'Archon'], [/Nome of/i, 'Nomarch'],
  [/Shogunate/i, 'Shogun'], [/Domain/i, 'Daimyo'], [/Fief/i, 'Lord'], [/Prefecture/i, 'Prefect'], [/Xian of|Hyeon of/i, 'Magistrate'], [/^Gun of/i, 'Gunsu'],
  [/Dynasty|Middle Kingdom|Imperium|Empire/i, 'Emperor'], [/High Kingdom/i, 'High King'], [/^(the )?Kingdom/i, 'King'],
];
/** Lesser titles a kingdom or empire never takes from its style. */
const LESSER = new Set(['Thane', 'Lord', 'Baron', 'Count', 'Jarl', 'Earl', 'Bey', 'Margrave', 'Voivode', 'Despot', 'Hersir', 'Sipahi', 'Signore', 'Demarch', 'Noyan', 'Zhupan', 'Chieftain', 'Warden', 'Archon', 'Nomarch', 'Daimyo', 'Prefect', 'Magistrate', 'Gunsu']);

export interface PoliticsFields {
  height: Float32Array;
  lakeDepth: Float32Array;
  culture: Uint8Array;
  /** 1 on New World land. */
  newWorld?: Uint8Array;
  biome?: Uint8Array;
  temp?: Float32Array;
  precip?: Float32Array;
}

/** Country people per km² of fully habitable land, by world, for the population estimate. */
const RURAL_DENSITY = { old: 8, new: 1 };
const BIOME_HAB: Record<number, number> = {
  [Biome.IceSheet]: 0, [Biome.Tundra]: 0.05, [Biome.BorealForest]: 0.35, [Biome.ColdDesert]: 0.15, [Biome.Grassland]: 1, [Biome.Shrubland]: 0.6,
  [Biome.TemperateForest]: 1, [Biome.TemperateRainforest]: 0.7, [Biome.HotDesert]: 0.05, [Biome.Savanna]: 0.6, [Biome.TropicalDryForest]: 0.6,
  [Biome.TropicalRainforest]: 0.4, [Biome.Alpine]: 0.2, [Biome.MontaneForest]: 0.4, [Biome.Wetland]: 0.4, [Biome.Mangrove]: 0.3, [Biome.Riparian]: 1.2, [Biome.SaltFlat]: 0,
};

/** New World (tribal) styles by culture: [band, chiefdom, tribe, nation, empire] with their rulers. */
const TRIBAL_STYLE: Record<string, [string[], string][]> = {
  woodland: [[['Village of {S}', '{S} Band'], 'Headman'], [['Chiefdom of {S}', '{S} Clan'], 'Chief'], [['the {N} Tribe', 'the {N} People'], 'Paramount Chief'], [['the {N} Nation'], 'Great Chief'], [['Empire of {N}'], 'Great Sun']],
  highland: [[['Village of {S}', 'Valley of {S}'], 'Headman'], [['Lordship of {S}', 'Chiefdom of {S}'], 'Lord'], [['the {N} Realm', 'Kingdom of {N}'], 'High Lord'], [['Kingdom of {N}', 'the {N} Realm'], 'Sun King'], [['Empire of the {N} Sun', 'the Four Quarters of {N}'], 'Child of the Sun']],
  jungle: [[['Village of {S}', 'Hamlet of {S}'], 'Headman'], [['City of {S}', 'Lordship of {S}'], 'Holy Lord'], [['Kingdom of {N}', 'the {N} Kingdom'], 'Holy Lord'], [['Kingdom of {N}', 'the {N} Overkingdom'], 'Overking'], [['Empire of {N}', 'the {N} Empire'], 'Great Speaker']],
};
const TRIBAL_DEFAULT: [string[], string][] = [[['Village of {S}', '{S} Band'], 'Headman'], [['Chiefdom of {S}'], 'Chief'], [['the {N} Tribe', 'the {N} People'], 'Paramount Chief'], [['the {N} Nation'], 'Great Chief'], [['Empire of {N}'], 'Great Sun']];
const TRIBAL_TITLE = ['Band', 'Chiefdom', 'Tribe', 'Nation', 'Empire'];
const COLONY_STYLE: Record<string, [string, string, string]> = {
  colony: ['Colony of {S}', 'Governor', 'Colony'], fort: ['Garrison of {S}', 'Commander', 'Fort'], post: ['Trading Post of {S}', 'Factor', 'Trading post'],
};

export function buildPolitics(g: Grid, f: PoliticsFields, settlements: Settlement[], rivers: RiverCollection, bank: NameBank, seed: string): { politics: Politics; labels: LabelFeature[] } {
  const { W, H, N } = g;
  const rnd = mulberry32(hashString(`${seed}#politics`));
  const land = (c: number) => f.height[c] > 0 && f.lakeDepth[c] <= 0;
  const cellOf = (lon: number, lat: number) => {
    const i = ((Math.floor(((lon + 180) / 360) * W) % W) + W) % W;
    return Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H))) * W + i;
  };
  const lonOf = (c: number) => g.lonDeg[c % W], latOf = (c: number) => g.latDeg[(c / W) | 0];
  // Big rivers make borders: crossing one costs as much as ~120 km of road.
  const bigRiver = new Uint8Array(N);
  for (const rf of rivers.features) {
    if (rf.properties.order < 5) continue;
    for (const p of rf.geometry.coordinates) bigRiver[cellOf(p[0], p[1])] = 1;
  }
  const cul = (c: number) => CULTURES[f.culture[c]]?.id ?? 'anglo';

  /**
   * Multi-source Dijkstra: each source claims the cells it reaches first. `seaKm` > 0 lets a
   * source cross that much open sea (at a high price). `within` limits the cells that count.
   */
  const claim = (sources: { c: number; w: number; max: number }[], opts: { seaKm: number; cultureCost: number; within?: (c: number) => boolean }) => {
    const owner = new Int32Array(N).fill(-1);
    const cost = new Float64Array(N).fill(Infinity);
    const sea = new Float32Array(N);
    const heap = new MinHeap(8192);
    sources.forEach((s, k) => {
      if (cost[s.c] === 0) return;
      cost[s.c] = 0;
      owner[s.c] = k;
      heap.push(s.c, 0);
    });
    while (heap.size) {
      const c = heap.pop(), dc = heap.lastKey;
      if (dc > cost[c]) continue;
      const k = owner[c], src = sources[k];
      const i = c % W, j = (c / W) | 0;
      for (let d = 0; d < 8; d++) {
        const n = neighbor(g, i, j, d);
        if (n < 0) continue;
        const isLand = land(n);
        let seaRun = 0;
        if (!isLand) {
          if (opts.seaKm <= 0 || f.lakeDepth[n] > 0) continue;
          seaRun = sea[c] + g.nbDist[j * 8 + d];
          if (seaRun > opts.seaKm) continue;
        } else if (opts.within && !opts.within(n)) continue;
        const dist = g.nbDist[j * 8 + d];
        const h = Math.max(f.height[n], 0), dh = Math.abs(h - Math.max(f.height[c], 0));
        let step = dist * (1 + dh / 400 + (h > 1200 ? (h - 1200) / 600 : 0));
        if (!isLand) step = dist * 4;
        if (bigRiver[n] && !bigRiver[c]) step += 120;
        if (opts.cultureCost && f.culture[n] !== f.culture[c]) step += opts.cultureCost;
        const nd = dc + step / src.w;
        if (nd < cost[n] && nd <= src.max) {
          cost[n] = nd;
          owner[n] = k;
          sea[n] = isLand ? 0 : seaRun;
          heap.push(n, nd);
        }
      }
    }
    return owner;
  };

  // ---- Baronies ------------------------------------------------------------------------------
  const seats = settlements.filter((s) => (s.tier === 'city' || s.tier === 'town') && land(cellOf(s.lon, s.lat)));
  const bOwner = claim(seats.map((s) => ({ c: cellOf(s.lon, s.lat), w: s.tier === 'city' ? 1.35 : 1, max: s.tier === 'city' ? 420 : 300 })), { seaKm: 0, cultureCost: 0 });
  const units: PolUnit[] = [];
  const baronyOf = new Int32Array(N).fill(-1);
  const seatUnit: number[] = [];
  const area = new Float64Array(seats.length);
  for (let c = 0; c < N; c++) if (bOwner[c] >= 0) area[bOwner[c]] += g.areaKm2[(c / W) | 0];
  const blank = (o: Partial<PolUnit> & Pick<PolUnit, 'level' | 'seat' | 'seatName' | 'lon' | 'lat' | 'culture' | 'pop' | 'areaKm2' | 'city'>): PolUnit => ({
    id: units.length, gov: 'feudal', title: '', name: '', ruler: '', parent: -1, league: -1, arms: null as unknown as Arms, vassals: 0, people: 0, nw: false, ...o,
  });
  // Habitable area per barony claim, for the population estimate.
  const habArea = new Float64Array(seats.length);
  for (let c = 0; c < N; c++) if (bOwner[c] >= 0) habArea[bOwner[c]] += g.areaKm2[(c / W) | 0] * (f.biome ? BIOME_HAB[f.biome[c]] ?? 0.5 : 0.5);
  seats.forEach((s, k) => {
    if (area[k] <= 0) {
      seatUnit.push(-1);
      return;
    }
    seatUnit.push(units.length);
    const nw = !!s.newWorld;
    units.push(blank({
      level: 0, seat: s.id, seatName: s.name ?? '', lon: s.lon, lat: s.lat, culture: s.culture ?? f.culture[cellOf(s.lon, s.lat)],
      pop: s.population, areaKm2: area[k], city: s.tier === 'city', nw,
      // Colonies are held from overseas; other New World towns are tribal.
      gov: s.colony ? 'colony' : nw ? 'tribal' : 'feudal', title: s.colony ?? '',
      people: s.population + habArea[k] * (nw && !s.colony ? RURAL_DENSITY.new : RURAL_DENSITY.old),
    }));
  });
  for (let c = 0; c < N; c++) if (bOwner[c] >= 0) baronyOf[c] = seatUnit[bOwner[c]];
  const baronies = units.slice();
  const cid = (u: PolUnit) => CULTURES[u.culture]?.id ?? 'anglo';
  const pref = (t: Record<string, number>, u: PolUnit, d = 0.05) => t[cid(u)] ?? d;
  /** A culture's trait multiplier (names/traits.ts). */
  const mod = (u: PolUnit, k: keyof CultureMods) => CULTURES[u.culture]?.mods?.[k] ?? 1;

  /** Units of `members` grouped under new lieges of `level` headed by `heads` (members themselves); groups smaller than `minVassals` stay independent. */
  const group = (level: PolLevel, members: PolUnit[], heads: PolUnit[], o: { maxCost: number; seaKm: number; cultureCost: number; minVassals: number }) => {
    if (!heads.length) return [] as PolUnit[];
    const owner = claim(heads.map((h) => ({ c: cellOf(h.lon, h.lat), w: 1, max: o.maxCost })), { seaKm: o.seaKm, cultureCost: o.cultureCost, within: (c) => baronyOf[c] >= 0 });
    const lieges = heads.map((h) => ({ head: h, members: [] as PolUnit[] }));
    for (const m of members) {
      const k = owner[cellOf(m.lon, m.lat)];
      // Old and New World realms never mix.
      if (k >= 0 && m.nw === heads[k].nw) lieges[k].members.push(m);
    }
    const made: PolUnit[] = [];
    for (const l of lieges) {
      if (l.members.length < o.minVassals || !l.members.includes(l.head)) continue;
      const u = blank({
        level, seat: l.head.seat, seatName: l.head.seatName, lon: l.head.lon, lat: l.head.lat, culture: l.head.culture, city: l.head.city,
        pop: l.members.reduce((a, m) => a + m.pop, 0), areaKm2: l.members.reduce((a, m) => a + m.areaKm2, 0), vassals: l.members.length,
        people: l.members.reduce((a, m) => a + m.people, 0), nw: l.head.nw, gov: l.head.nw ? 'tribal' : 'feudal',
      });
      units.push(u);
      made.push(u);
      for (const m of l.members) m.parent = u.id;
    }
    return made;
  };
  /** The strongest candidates at least `minKm` apart. */
  const spaced = (cands: PolUnit[], minKm: number, score: (u: PolUnit) => number) => {
    const out: PolUnit[] = [];
    for (const u of [...cands].sort((a, b) => score(b) - score(a))) if (out.every((h) => distKm(h.lon, h.lat, u.lon, u.lat) > minKm)) out.push(u);
    return out;
  };
  const free = (u: PolUnit) => u.parent < 0 && (u.gov === 'feudal' || u.gov === 'tribal');

  // City-states: some cities (most in the south) stand apart, alone or with the towns close around them.
  for (const b of baronies) {
    if (b.nw || !b.city || b.pop < 6000 || rnd() >= pref(CITY_STATE_P, b) * mod(b, 'cityState')) continue;
    b.gov = 'city-state';
  }
  for (const b of baronies) {
    if (b.gov !== 'city-state' || rnd() < 0.45) continue;
    // A contado: the free towns within 110 km.
    const near = baronies.filter((t) => t !== b && t.gov === 'feudal' && t.parent < 0 && !t.city && distKm(t.lon, t.lat, b.lon, b.lat) < 80);
    if (!near.length) continue;
    const u = blank({ level: 1, seat: b.seat, seatName: b.seatName, lon: b.lon, lat: b.lat, culture: b.culture, city: true, pop: b.pop, areaKm2: b.areaKm2, vassals: 1 + near.length, gov: 'city-state', people: b.people });
    units.push(u);
    b.parent = u.id;
    b.gov = 'feudal';
    for (const t of near) {
      t.parent = u.id;
      u.pop += t.pop;
      u.areaKm2 += t.areaKm2;
      u.people += t.people;
    }
  }

  // ---- Counties: baronies around the larger seats -----------------------------------------------
  const bFree = baronies.filter(free);
  group(1, bFree, spaced(bFree, 95, (u) => u.pop * (u.city ? 2 : 1)), { maxCost: 380, seaKm: 60, cultureCost: 0, minVassals: 1 });
  // Some counties are held by the church: prince-bishoprics, abbacies, imamates.
  const counties = units.filter((u) => u.level === 1 && u.gov === 'feudal');
  for (const c of counties) if (rnd() < (cid(c) === 'desert' ? 0.012 : 0.006) * mod(c, 'theocracy')) c.gov = 'theocracy';

  // ---- Duchies: counties around the strongest seats; a duchy needs two counties at least ---------
  const cFree = units.filter((u) => u.level <= 1 && free(u));
  group(2, cFree, spaced(cFree.filter((u) => u.level === 1), 300, (u) => u.pop), { maxCost: 800, seaKm: 220, cultureCost: 0, minVassals: 2 });
  // Some duchies keep out of any kingdom (grand duchies, and republics later), by culture.
  const dIndep = new Set<PolUnit>();
  for (const d of units.filter((u) => u.level === 2)) if (rnd() < pref(INDEP_DUCHY_P, d) * mod(d, 'indepDuchy')) dIndep.add(d);

  // ---- Kingdoms: duchies and the counties and baronies left between them -------------------------
  const kMembers = units.filter((u) => u.level <= 2 && free(u) && !dIndep.has(u));
  group(3, kMembers, spaced(kMembers.filter((u) => u.level === 2), 600, (u) => u.pop), { maxCost: 1500, seaKm: 450, cultureCost: 140, minVassals: 2 });

  // ---- Empires: two or three of the greatest kingdoms, with the realms around them ---------------
  const eMembers = units.filter((u) => u.level <= 3 && free(u) && !dIndep.has(u));
  const eScore = (u: PolUnit) => u.people * pref(EMPIRE_W, u, 1) * mod(u, 'empire');
  const chosen: PolUnit[] = [];
  // Two or three empires in the Old World (of different peoples where possible), and perhaps one in the New.
  for (const nw of [false, true]) {
    const kings = units.filter((u) => u.level === 3 && u.nw === nw);
    const cands = spaced(kings, 2000, eScore).slice(0, 6);
    if (!cands.length) continue;
    // A trial claim: which candidates would gather at least three realms, two of them kingdoms?
    const owner = claim(cands.map((h) => ({ c: cellOf(h.lon, h.lat), w: 1, max: 1500 })), { seaKm: 600, cultureCost: 260, within: (c) => baronyOf[c] >= 0 });
    const ok = cands.filter((h, k) => {
      const got = eMembers.filter((m) => m.nw === nw && owner[cellOf(m.lon, m.lat)] === k);
      return got.length >= 3 && got.filter((m) => m.level === 3).length >= 2;
    });
    const want = nw ? (ok[0] && pref(EMPIRE_W, ok[0], 1) >= 1.5 && rnd() < 0.7 ? 1 : 0) : 2 + (rnd() < 0.45 ? 1 : 0);
    const mine: PolUnit[] = [];
    for (const h of ok) if (mine.length < want && !mine.some((c) => c.culture === h.culture)) mine.push(h);
    for (const h of ok) if (mine.length < want && !mine.includes(h)) mine.push(h);
    chosen.push(...mine);
  }
  group(4, eMembers, chosen, { maxCost: 1500, seaKm: 600, cultureCost: 260, minVassals: 3 });

  // ---- Colonies: held from overseas by a realm of their founders' people ------------------------
  for (const b of baronies) {
    if (b.gov !== 'colony') continue;
    const kind = b.title || 'colony';
    const homes = units.filter((u) => u.parent < 0 && !u.nw && u.gov !== 'league' && u.level >= 2);
    const same = homes.filter((u) => u.culture === b.culture);
    const home = (same.length ? same : homes).reduce<PolUnit | null>((a, u) => (!a || (same.length ? u.people > a.people : distKm(u.lon, u.lat, b.lon, b.lat) < distKm(a.lon, a.lat, b.lon, b.lat)) ? u : a), null);
    b.gov = 'feudal';
    b.title = '';
    if (!home) continue;
    const col = blank({
      level: 1, seat: b.seat, seatName: b.seatName, lon: b.lon, lat: b.lat, culture: b.culture, city: false, pop: b.pop, areaKm2: b.areaKm2,
      vassals: 1, gov: 'colony', title: kind, people: b.people, nw: true,
    });
    units.push(col);
    b.parent = col.id;
    col.parent = home.id;
    home.vassals++;
    // Its people and land count to the realm that holds it.
    for (let u: PolUnit | null = home; u; u = u.parent >= 0 ? units[u.parent] : null) {
      u.pop += col.pop;
      u.people += col.people;
      u.areaKm2 += col.areaKm2;
    }
  }

  // ---- Governments of the independent realms ------------------------------------------------
  // Landmasses, to tell island realms.
  const mass = new Int32Array(N).fill(-1);
  const massArea: number[] = [];
  {
    const q = new Int32Array(N);
    for (let s0 = 0; s0 < N; s0++) {
      if (mass[s0] >= 0 || !land(s0)) continue;
      const id = massArea.length;
      let a0 = 0, qn = 0;
      q[qn++] = s0;
      mass[s0] = id;
      for (let k = 0; k < qn; k++) {
        const c = q[k], i = c % W, j = (c / W) | 0;
        a0 += g.areaKm2[j];
        for (let d = 0; d < 8; d++) {
          const n = neighbor(g, i, j, d);
          if (n >= 0 && mass[n] < 0 && land(n)) {
            mass[n] = id;
            q[qn++] = n;
          }
        }
      }
      massArea.push(a0);
    }
  }
  const topOfB = (b: number): PolUnit => {
    let u = units[b];
    while (u.parent >= 0) u = units[u.parent];
    return u;
  };
  // Which landmasses each realm holds (by area).
  const holds = new Map<number, Map<number, number>>();
  for (let c = 0; c < N; c++) {
    if (baronyOf[c] < 0 || mass[c] < 0) continue;
    const t = topOfB(baronyOf[c]).id;
    let m = holds.get(t);
    if (!m) holds.set(t, (m = new Map()));
    m.set(mass[c], (m.get(mass[c]) ?? 0) + g.areaKm2[(c / W) | 0]);
  }
  const islandRealm = (u: PolUnit) => {
    const h = holds.get(u.id);
    if (!h) return false;
    const seatMass = mass[cellOf(u.lon, u.lat)];
    const total = [...h.values()].reduce((a, b) => a + b, 0);
    const off = total - (h.get(seatMass) ?? 0);
    return (massArea[seatMass] ?? Infinity) < 9e5 || (h.size >= 2 && off > 0.25 * total);
  };
  const tops = units.filter((u) => u.parent < 0);
  for (const u of tops) {
    if (u.gov !== 'feudal' || u.level === 4 || u.nw) continue;
    if (u.level >= 2 && islandRealm(u) && rnd() < 0.7) u.gov = 'thalassocracy';
    else if (u.level >= 2 && rnd() < pref(REPUBLIC_P, u) * mod(u, 'republic')) u.gov = 'republic';
    else if (u.level >= 2 && rnd() < (cid(u) === 'desert' ? 0.08 : 0.04) * mod(u, 'theocracy')) u.gov = 'theocracy';
    else if (u.level <= 1 && u.city && rnd() < pref(CITY_STATE_P, u) * 0.6 * mod(u, 'cityState')) u.gov = 'city-state';
  }

  // ---- Leagues: small independent neighbours band together -------------------------------------
  const small = tops.filter((u) => u.level <= 2 && u.gov !== 'theocracy' && u.gov !== 'colony');
  const inLeague = new Set<PolUnit>();
  for (const u of [...small].sort((a, b) => b.pop - a.pop)) {
    if (inLeague.has(u)) continue;
    const band = small.filter((v) => !inLeague.has(v) && v.nw === u.nw && distKm(u.lon, u.lat, v.lon, v.lat) < (u.nw ? 900 : 650));
    if (band.length < 3 || rnd() >= pref(LEAGUE_P, u, 0.3) * mod(u, 'league')) continue;
    const lg = blank({
      level: Math.min(3, Math.max(...band.map((v) => v.level)) + 1) as PolLevel, gov: 'league', seat: u.seat, seatName: u.seatName, lon: u.lon, lat: u.lat,
      culture: u.culture, city: u.city, pop: band.reduce((a, v) => a + v.pop, 0), areaKm2: band.reduce((a, v) => a + v.areaKm2, 0), vassals: band.length,
      people: band.reduce((a, v) => a + v.people, 0), nw: u.nw,
    });
    units.push(lg);
    for (const v of band) {
      v.league = lg.id;
      inLeague.add(v);
    }
  }

  // ---- Names, rulers and arms (top down, so arms can descend) ---------------------------------
  const pickS = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const fill = (tpl: string, n: string) => tpl.replace('{N}', n).replace('{S}', n).replace('{A}', pickS(ADJ));
  const order = [...units].sort((a, b) => (a.gov === 'league' ? -1 : 0) - (b.gov === 'league' ? -1 : 0) || b.level - a.level);
  for (const u of order) {
    const c = CULTURES[u.culture] ?? CULTURES[0];
    const id = c.id;
    const r = bank.rng(`pol:${u.level}:${u.gov}:${u.seat}`);
    const own = () => bank.proper(c, r);
    const top = u.parent < 0;
    let ruler = '';
    let favour: Charge[] | undefined;
    if (u.gov === 'league') {
      u.name = fill(pickS(LEAGUE_STYLE[id] ?? ['League of {N}', 'Confederacy of {N}', 'the {N} Confederation']), r() < 0.5 ? u.seatName : own());
      ruler = LEAGUE_RULER[id] ?? 'Council';
      u.title = /Confedera/i.test(u.name) ? 'Confederacy' : 'League';
      favour = ['wheel', 'key', 'mullet', 'bell'];
    } else if (u.gov === 'city-state') {
      u.name = fill(pickS(CITY_STATE_STYLE[id] ?? ['Free City of {S}', 'Republic of {S}', 'Commune of {S}']), u.seatName);
      ruler = /Free City|City-state/.test(u.name) && rnd() < 0.5 ? 'Burgrave' : REPUBLIC_RULER[id] ?? 'Doge';
      u.title = 'City-state';
      favour = ['tower', 'key', 'wheel', 'bell'];
    } else if (u.gov === 'republic') {
      u.name = fill(pickS(REPUBLIC_STYLE[id] ?? ['Republic of {N}', 'Commonwealth of {N}']), r() < 0.5 ? u.seatName : own());
      ruler = REPUBLIC_RULER[id] ?? 'Doge';
      u.title = 'Republic';
    } else if (u.gov === 'theocracy') {
      const [tpl, rl] = u.level <= 1
        ? pickS(THEOCRACY_SMALL[id] ?? [['Prince-Bishopric of {S}', 'Prince-Bishop'], ['Abbacy of {S}', 'Abbot'], ['Holy City of {S}', 'Patriarch']])
        : pickS(THEOCRACY_BIG[id] ?? [['Theocracy of {N}', 'Hierarch'], ['Holy Realm of {N}', 'Patriarch'], ['Holy See of {S}', 'Pontiff']]);
      u.name = fill(tpl, u.level <= 1 || r() < 0.5 ? u.seatName : own());
      ruler = rl;
      u.title = u.level <= 1 ? (/Imamate/.test(u.name) ? 'Imamate' : 'Prince-bishopric') : 'Theocracy';
      favour = ['cross', 'key', 'sun', 'bell'];
    } else if (u.gov === 'colony') {
      const [tpl, rl, title] = COLONY_STYLE[u.title] ?? COLONY_STYLE.colony;
      u.name = fill(tpl, u.seatName);
      ruler = rl;
      u.title = title;
    } else if (u.gov === 'tribal') {
      const [tpls, rl] = (TRIBAL_STYLE[id] ?? TRIBAL_DEFAULT)[u.level];
      u.name = fill(pickS(tpls), u.level <= 1 || r() < 0.5 ? u.seatName : own());
      ruler = rl;
      u.title = TRIBAL_TITLE[u.level];
      favour = id === 'woodland' ? ['feather', 'bird', 'sun', 'serpent', 'tree'] : id === 'highland' ? ['sun', 'bird', 'estoile', 'serpent'] : ['serpent', 'bird', 'sun', 'estoile'];
    } else if (u.gov === 'thalassocracy') {
      const [tpl, rl] = pickS(THALASSO_STYLE[id] ?? [['Thalassocracy of {N}', 'Thalassarch'], ['Sea Kingdom of {N}', 'Sea King'], ['Admiralty of {N}', 'Lord Admiral']]);
      u.name = fill(tpl, r() < 0.4 ? u.seatName : own());
      ruler = rl;
      u.title = 'Thalassocracy';
      favour = ['ship', 'anchor', 'crescent'];
    } else {
      const lv = u.level;
      if (lv === 0) u.name = u.city ? `City of ${u.seatName}` : fill(pickS(BARONY_STYLE[id] ?? BARONY_STYLE.anglo), u.seatName);
      else if (lv === 1) u.name = fill(pickS(COUNTY_STYLE[id] ?? COUNTY_STYLE.anglo), u.seatName);
      else if (lv === 2) u.name = top && r() < 0.5 ? `Grand Duchy of ${r() < 0.55 ? u.seatName : own()}` : fill(pickS(DUCHY_STYLE[id] ?? DUCHY_STYLE.anglo), r() < 0.55 ? u.seatName : own());
      else if (lv === 3) {
        const styles = c.realm.filter((t) => !NOT_KINGDOM.test(t));
        u.name = fill(pickS(styles.length ? styles : ['Kingdom of {N}']), r() < 0.35 ? u.seatName : own());
      } else u.name = fill(pickS(EMPIRE_STYLE[id] ?? EMPIRE_STYLE.anglo), own());
      ruler = lv === 0 && u.city ? CITY_RULER[id] ?? 'Lord Mayor' : (RULERS[id] ?? RULERS.anglo)[lv];
      // A realm's style names its ruler (a Sultanate has a Sultan, a March a Margrave).
      if (!(lv === 0 && u.city)) {
        for (const [re, rl] of STYLE_RULER) {
          if (!re.test(u.name)) continue;
          if (!(lv >= 3 && LESSER.has(rl))) ruler = lv === 4 && rl === 'Khan' ? 'Khagan' : rl;
          break;
        }
      }
      u.title = lv === 0 && u.city ? 'City' : /Grand Duchy/.test(u.name) ? 'Grand Duchy' : top && lv <= 1 ? `Free ${LEVEL_NAME[lv].toLowerCase()}` : LEVEL_NAME[lv];
    }
    u.ruler = ruler;
    u.name = u.name.replace(/^The /, 'the ').replace(/^the (\w)/, (_, a) => `the ${a.toUpperCase()}`);
    // Arms: independent realms and leagues take new arms; vassals difference their liege's.
    const ar = mulberry32(hashString(`${seed}#arms#${u.level}#${u.gov}#${u.seat}`));
    const liege = u.parent >= 0 ? units[u.parent] : null;
    if (!liege || !liege.arms) u.arms = newArms(ar, id, { crowned: u.level === 4, favour, many: u.gov === 'league' });
    else if (liege.seat === u.seat) u.arms = { ...liege.arms, crowned: false };
    else if (u.level <= 1 && liege.level === u.level + 1) u.arms = cadetArms(ar, liege.arms);
    else u.arms = vassalArms(ar, liege.arms, id);
  }

  // ---- Labels ----------------------------------------------------------------------------------
  const labels: LabelFeature[] = [];
  const cellsOf = new Map<number, number[]>();
  const chains = new Map<number, PolUnit[]>();
  for (let c = 0; c < N; c++) {
    const b = baronyOf[c];
    if (b < 0) continue;
    let ch = chains.get(b);
    if (!ch) chains.set(b, (ch = chainOf(units, b)));
    for (const u of ch) {
      let a = cellsOf.get(u.id);
      if (!a) cellsOf.set(u.id, (a = []));
      a.push(c);
    }
  }
  const stamp = new Int32Array(N), depth = new Int32Array(N), queue = new Int32Array(N);
  let st = 0;
  const pole = (cells: number[]) => {
    st++;
    for (const c of cells) stamp[c] = st;
    let qn = 0;
    for (const c of cells) {
      const i = c % W, j = (c / W) | 0;
      depth[c] = -1;
      for (let k = 0; k < 8; k++) {
        const n = neighbor(g, i, j, k);
        if (n < 0 || stamp[n] !== st) {
          depth[c] = 0;
          queue[qn++] = c;
          break;
        }
      }
    }
    let best = qn ? queue[0] : cells[0], bd = 0;
    for (let q = 0; q < qn; q++) {
      const c = queue[q], i = c % W, j = (c / W) | 0;
      if (depth[c] > bd) {
        bd = depth[c];
        best = c;
      }
      for (let k = 0; k < 8; k++) {
        const n = neighbor(g, i, j, k);
        if (n >= 0 && stamp[n] === st && depth[n] < 0) {
          depth[n] = depth[c] + 1;
          queue[qn++] = n;
        }
      }
    }
    return best;
  };
  const KIND = ['barony', 'county', 'duchy', 'realm', 'empire'] as const;
  for (const u of units) {
    const cells = cellsOf.get(u.id);
    if (!cells) continue;
    const liege = u.parent >= 0 ? units[u.parent] : null;
    // A unit that is only its liege's seat is lettered once, at the liege's level; small baronies not at all.
    if (liege && (liege.vassals === 1 || (u.level === 0 && liege.seat === u.seat))) continue;
    if (u.level === 0 && u.parent >= 0 && u.areaKm2 < 1500) continue;
    // Independent small realms are lettered a size up, so a city-state or free county shows at realm scale.
    const kind = u.gov === 'league' ? 'league' : u.parent < 0 && u.level <= 2 ? (u.level === 2 ? 'realm' : 'duchy') : KIND[u.level];
    const at = pole(cells);
    const rank = u.areaKm2 > 2e6 ? 0 : u.areaKm2 > 5e5 ? 1 : u.areaKm2 > 1e5 ? 2 : 3;
    const caps = kind === 'realm' || kind === 'empire' || kind === 'league';
    labels.push({
      type: 'Feature', geometry: { type: 'Point', coordinates: [lonOf(at), latOf(at)] },
      properties: { kind: kind as LabelFeature['properties']['kind'], name: caps ? u.name.toUpperCase() : u.name, rank, minz: 0, maxz: 0, unit: u.id, arms: u.parent < 0 || u.level >= 3 ? 1 : 0, top: u.parent < 0 ? 1 : 0 } as LabelFeature['properties'],
    });
  }

  return { politics: { W, H, baronyOf, units, borders: borders(g, baronyOf, units, land), stats: realmStats(g, f, baronyOf, baronies.length, land) }, labels };
}

function realmStats(g: Grid, f: PoliticsFields, baronyOf: Int32Array, nb: number, land: (c: number) => boolean): RealmStats {
  const { W, N } = g;
  const biome = new Float32Array(nb * NB_BIOME), culture = new Float32Array(nb * NB_CULTURE);
  const coastKm = new Float32Array(nb), highKm2 = new Float32Array(nb), temp = new Float32Array(nb), precip = new Float32Array(nb), area = new Float32Array(nb);
  const pairs = new Set<number>();
  for (let c = 0; c < N; c++) {
    const b = baronyOf[c];
    if (b < 0 || b >= nb) continue;
    const j = (c / W) | 0, i = c % W, a = g.areaKm2[j];
    const bi = f.biome ? f.biome[c] : 4;
    biome[b * NB_BIOME + Math.min(NB_BIOME - 1, bi)] += a;
    culture[b * NB_CULTURE + Math.min(NB_CULTURE - 1, f.culture[c])] += a * (BIOME_HAB[bi] ?? 0.5);
    if (f.height[c] > 1200) highKm2[b] += a;
    temp[b] += (f.temp?.[c] ?? 12) * a;
    precip[b] += (f.precip?.[c] ?? 700) * a;
    area[b] += a;
    let shore = false;
    for (const d of [1, 3, 4, 6]) {
      const n = neighbor(g, i, j, d);
      if (n < 0) continue;
      if (f.height[n] <= 0 && f.lakeDepth[n] <= 0) shore = true;
      const o = baronyOf[n];
      if (o >= 0 && o !== b && o < nb && land(n)) pairs.add(Math.min(o, b) * 1048576 + Math.max(o, b));
    }
    if (shore) coastKm[b] += Math.sqrt(a);
  }
  for (let b = 0; b < nb; b++) {
    if (area[b] > 0) {
      temp[b] /= area[b];
      precip[b] /= area[b];
    }
  }
  const adj = new Int32Array(pairs.size * 2);
  let k = 0;
  for (const p of pairs) {
    adj[k++] = Math.floor(p / 1048576);
    adj[k++] = p % 1048576;
  }
  return { nb, biome, culture, coastKm, highKm2, temp, precip, adj };
}

/**
 * Border lines between cells of different realms, stitched into lines along the cell edges and
 * smoothed. Within a realm each line is drawn once at the highest level that differs (duchy,
 * county, barony); between independent realms at the higher of the two realms' levels (at least
 * a duchy's line); around a league, a league line as well. Coasts are not borders; the edge of
 * claimed land is.
 */
function borders(g: Grid, baronyOf: Int32Array, units: PolUnit[], land: (c: number) => boolean): Politics['borders'] {
  const { W, H } = g;
  const chains = new Map<number, number[]>();
  /** Unit ids by level (-1 where the chain has none), then the realm at the top, then its league. */
  const ch = (b: number) => {
    let c = chains.get(b);
    if (!c) {
      c = [-1, -1, -1, -1, -1, -1, -1];
      let u: PolUnit = units[b];
      c[u.level] = u.id;
      while (u.parent >= 0) {
        u = units[u.parent];
        c[u.level] = u.id;
      }
      c[5] = u.id;
      c[6] = u.league;
      chains.set(b, c);
    }
    return c;
  };
  const levelBetween = (a: number, b: number): number => {
    if (a === b) return -1;
    if (a < 0 || b < 0) return Math.max(2, units[ch(a < 0 ? b : a)[5]].level);
    const x = ch(a), y = ch(b);
    if (x[5] !== y[5]) return Math.max(2, units[x[5]].level, units[y[5]].level);
    for (let l = 4; l >= 0; l--) if (x[l] !== y[l]) return l;
    return 0;
  };
  const leagueEdge = (a: number, b: number) => {
    const la = a >= 0 ? ch(a)[6] : -1, lb = b >= 0 ? ch(b)[6] : -1;
    return la !== lb && (la >= 0 || lb >= 0);
  };
  // Edges between grid corners (i, j) .. on a W × (H+1) corner lattice (i wraps).
  const edges: Map<string, number>[] = [new Map(), new Map(), new Map(), new Map(), new Map(), new Map()];
  const vkey = (i: number, j: number) => `${((i % W) + W) % W},${j}`;
  const addEdge = (l: number, a: string, b: string) => {
    edges[l].set(a < b ? `${a}|${b}` : `${b}|${a}`, 1);
  };
  const consider = (c: number, n: number, a: string, b: string) => {
    if (!land(c) || !land(n) || (baronyOf[c] < 0 && baronyOf[n] < 0)) return;
    const l = levelBetween(baronyOf[c], baronyOf[n]);
    if (l >= 0) addEdge(l, a, b);
    if (leagueEdge(baronyOf[c], baronyOf[n])) addEdge(5, a, b);
  };
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const c = j * W + i;
      // East neighbour: shared vertical edge at x = i + 1; south neighbour: horizontal edge at y = j + 1.
      consider(c, j * W + ((i + 1) % W), vkey(i + 1, j), vkey(i + 1, j + 1));
      if (j + 1 < H) consider(c, c + W, vkey(i, j + 1), vkey(i + 1, j + 1));
    }
  }
  const features: BorderFeature[] = [];
  const toLL = (k: string): number[] => {
    const [i, j] = k.split(',').map(Number);
    return [-180 + (i * 360) / W, 90 - (j * 180) / H];
  };
  edges.forEach((set, level) => {
    const adj = new Map<string, string[]>();
    for (const e of set.keys()) {
      const [a, b] = e.split('|');
      (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
      (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
    }
    const used = new Set<string>();
    const walk = (start: string, next: string) => {
      const pts = [start, next];
      used.add(start < next ? `${start}|${next}` : `${next}|${start}`);
      let prev = start, cur = next;
      while ((adj.get(cur)?.length ?? 0) === 2) {
        const nx = adj.get(cur)!.find((v) => v !== prev)!;
        const ek = cur < nx ? `${cur}|${nx}` : `${nx}|${cur}`;
        if (used.has(ek)) break;
        used.add(ek);
        pts.push(nx);
        prev = cur;
        cur = nx;
        if (cur === start) break;
      }
      return pts;
    };
    // Start at line ends and junctions first, then whatever loops remain.
    const starts = [...adj.keys()].sort((a, b) => Number((adj.get(a)!.length === 2)) - Number((adj.get(b)!.length === 2)));
    for (const s of starts) {
      for (const n of adj.get(s)!) {
        const ek = s < n ? `${s}|${n}` : `${n}|${s}`;
        if (used.has(ek)) continue;
        let line = walk(s, n).map(toLL);
        // Unwrap across the antimeridian, then smooth (ends stay put so lines still meet).
        for (let k = 1; k < line.length; k++) {
          while (line[k][0] - line[k - 1][0] > 180) line[k][0] -= 360;
          while (line[k][0] - line[k - 1][0] < -180) line[k][0] += 360;
        }
        // The cell edges make a staircase; relax it into the diagonal it stands for (a closed
        // loop relaxes all round, an open line keeps its ends so it still meets the others).
        const closed = line.length > 3 && line[0][0] === line[line.length - 1][0] && line[0][1] === line[line.length - 1][1];
        for (let it = 0; it < 10 && line.length > 2; it++) {
          const n = line.length, m = closed ? n - 1 : n;
          const next = line.map((p) => [p[0], p[1]]);
          for (let k = closed ? 0 : 1; k < (closed ? m : n - 1); k++) {
            const pa = line[(k - 1 + m) % m], pb = line[(k + 1) % m];
            next[k] = [0.5 * line[k][0] + 0.25 * (pa[0] + pb[0]), 0.5 * line[k][1] + 0.25 * (pa[1] + pb[1])];
          }
          if (closed) next[n - 1] = next[0];
          line = next;
        }
        for (let pass = 0; pass < 2 && line.length > 2; pass++) {
          const out = [line[0]];
          for (let k = 0; k + 1 < line.length; k++) {
            const a = line[k], b = line[k + 1];
            out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
          }
          out.push(line[line.length - 1]);
          line = out;
        }
        line = simplify(line, 0.03);
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: line.map((p) => [Math.round(p[0] * 1e3) / 1e3, Math.round(p[1] * 1e3) / 1e3]) }, properties: { level: level as PolLevel | 5 } });
      }
    }
  });
  return { type: 'FeatureCollection', features };
}

/** Douglas–Peucker (degrees), keeping the end points. */
function simplify(line: number[][], tol: number): number[][] {
  if (line.length < 3) return line;
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = line[a], [bx, by] = line[b];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let best = -1, bd = tol * tol;
    for (let k = a + 1; k < b; k++) {
      const px = line[k][0] - ax, py = line[k][1] - ay;
      const t = l2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / l2)) : 0;
      const d = (px - t * dx) ** 2 + (py - t * dy) ** 2;
      if (d > bd) {
        bd = d;
        best = k;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return line.filter((_, k) => keep[k]);
}
