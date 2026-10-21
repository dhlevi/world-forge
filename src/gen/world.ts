import { type Grid, makeGrid, areaQuantile } from './grid';
import { type Rng, hashString, mulberry32 } from './rng';
import { Simplex3 } from './noise';
import { buildTectonics, drainInlandSeas } from './tectonics';
import { type CurseHeart, specialFeatures } from './special';
import { computeClimate } from './climate';
import { accumulate, erode, fillShallowPits, precipWeight, routeFlow } from './hydrology';
import { classifyBiomes } from './biomes';
import { classifyKoppen } from './koppen';
import { extractRivers, type RiverCollection } from './rivers';
import { traceStreamlines, type StreamCollection } from './streamlines';
import { buildSettlements, type RoadCollection, type Settlement } from './settlements';
import { DetailSampler } from './detail';
import { RiverIndex } from './river-index';
import { type LabelCollection, nameWorld } from './features';
import { type Politics, type PolUnit, buildPolitics } from './politics';
import { cultureMap } from '../names/culture-map';
import { type CultureSet, setWorldCultures } from '../names/world-cultures';
import { newWorldMask, type SpreadTrace } from './oldworld';
import { chooseColonies } from './colonies';
import { NameBank } from '../names/names';
import { CLIMATE, HYDROLOGY } from './config';

export interface WorldParams {
  seed: string;
  /** Fraction of the surface above sea level, 0..1. */
  landFraction: number;
  plates: number;
  /** Erosion strength, 0..1. */
  erosion: number;
  /** Grid width in cells; height is width / 2. */
  resolution: number;
  /** Share of the land that is the settled Old World (0.2..1; 1 = all of it); the rest is the sparse, tribal New World. */
  settled?: number;
  /** How far each culture's language strays from its template (0..1; default 0.3). */
  drift?: number;
  /** Fantasy races (elves, dwarves, halflings, orcs, lizardfolk) besides humans (default true). */
  races?: boolean;
  /** Optional elevation (m, W×H row-major from the north-west) replacing tectonics and erosion, e.g. real Earth. */
  heightmap?: Float32Array;
}

/** Everything the tile renderer and probe need; plain typed arrays so it can be posted between workers. */
export interface RasterWorld {
  seed: string;
  W: number;
  H: number;
  numPlates: number;
  height: Float32Array;
  tempSea: Float32Array;
  precip: Float32Array;
  biome: Uint8Array;
  plate: Uint8Array;
  lakeDepth: Float32Array;
  /** Depression-filled surface (m); lake surface where lakeDepth > 0. */
  waterLevel: Float32Array;
  /** Prevailing surface wind, east- and north-positive. */
  windU: Float32Array;
  windV: Float32Array;
  /** Surface ocean current (0 on land), east- and north-positive. */
  currentU: Float32Array;
  currentV: Float32Array;
  /** Temperature anomaly from ocean currents, °C (included in tempSea). */
  tempAnomaly: Float32Array;
  /** Warmest/coldest-month temperature (°C, at the cell's elevation). */
  tempWarm: Float32Array;
  tempCold: Float32Array;
  /** Local summer / winter half-year precipitation rates, mm/yr. */
  precipSummer: Float32Array;
  precipWinter: Float32Array;
  /** Index into KOPPEN_CLASSES. */
  koppen: Uint8Array;
  /** Index into CULTURES (names/cultures.ts): whose names the land and nearby sea bear. */
  culture: Uint8Array;
  /** The world's cultures, from which every thread rebuilds `CULTURES` (names/world-cultures.ts). */
  cultures: CultureSet;
  /** 1 on New World land (sparse, tribal), 0 elsewhere (gen/oldworld.ts). */
  newWorld: Uint8Array;
  /** How the Old World spread from its heartland (for the Old & New World layer; see `SpreadTrace`). */
  spread: SpreadTrace;
  /** Special ground on each cell (an `SP` value: ash, lava, glacier, mushroom forest, canyon, cliffs; gen/special.ts). */
  special: Uint8Array;
  /** Volcanoes: lon, lat, height (m) and activity (2 active, 1 dormant, 0 extinct), four numbers each. */
  vents: Float32Array;
  /** Fantasy worlds: the hearts of the cursed lands (gen/special.ts). */
  curses?: CurseHeart[];
}

export interface WorldSummary {
  W: number;
  H: number;
  landPercent: number;
  maxElevation: number;
  minElevation: number;
  riverSegments: number;
  cities: number;
  towns: number;
  genMs: number;
}

export interface GeneratedWorld {
  raster: RasterWorld;
  rivers: RiverCollection;
  wind: StreamCollection;
  currents: StreamCollection;
  /** Cities and towns; villages are generated on demand per region (src/towns). */
  settlements: Settlement[];
  roads: RoadCollection;
  /** Named geographic features (labels). */
  labels: LabelCollection;
  /** Counties, duchies, kingdoms and empires, with borders and arms. */
  politics: Politics;
  /** Index (into labels) of the land region label over each cell (range, forest…), or -1. */
  regionOf: Int32Array;
  summary: WorldSummary;
}

export type ProgressFn = (stage: string, pct: number) => void;

/** Tectonics, sea level, erosion and coastal shaping. */
function buildTerrain(
  g: Grid, rng: Rng, climateNoise: Simplex3, params: WorldParams, landFraction: number, progress: ProgressFn,
) {
  progress('Tectonic plates', 0.05);
  const { height, plate, volcanic } = buildTectonics(g, rng, params.plates, landFraction);
  const seaLevel = areaQuantile(g, height, 1 - landFraction);
  for (let c = 0; c < g.N; c++) height[c] -= seaLevel;
  drainInlandSeas(g, height);
  const relevel = areaQuantile(g, height, 1 - landFraction);
  for (let c = 0; c < g.N; c++) height[c] -= relevel;
  // Re-leveling can re-flood the new basins; drain once more and accept the tiny land excess.
  drainInlandSeas(g, height);

  progress('Initial climate', 0.35);
  const pre = computeClimate(g, height, climateNoise, false, false);

  progress('Erosion', 0.45);
  erode(g, height, pre.precip, params.erosion);
  const sedimentFill = fillShallowPits(g, height, HYDROLOGY.pitFillDepthM);
  for (let c = 0; c < g.N; c++) {
    const h = height[c];
    height[c] = h > 0
      ? h + HYDROLOGY.coastStepLandM + HYDROLOGY.coastLiftM * (1 - Math.exp(-h / HYDROLOGY.coastScaleM))
      : h - HYDROLOGY.coastStepSeaM - HYDROLOGY.coastDropM * (1 - Math.exp(h / HYDROLOGY.coastScaleM));
  }
  return { height, plate, sedimentFill, volcanic };
}

export function generateWorld(params: WorldParams, progress: ProgressFn = () => {}): GeneratedWorld {
  const t0 = performance.now();
  const W = Math.max(64, Math.round(params.resolution / 2) * 2);
  const H = W / 2;
  const g = makeGrid(W, H);
  const seedHash = hashString(params.seed);
  const rng = mulberry32(seedHash);
  const climateNoise = new Simplex3(rng);
  const landFraction = Math.min(0.95, Math.max(0.02, params.landFraction));

  let height: Float32Array, plate: Uint8Array, sedimentFill: Float32Array, volcanic: Float32Array;
  if (params.heightmap) {
    if (params.heightmap.length !== g.N) throw new Error(`heightmap must be ${W}×${H}`);
    height = Float32Array.from(params.heightmap);
    plate = new Uint8Array(g.N);
    sedimentFill = new Float32Array(g.N);
    volcanic = new Float32Array(g.N);
  } else {
    ({ height, plate, sedimentFill, volcanic } = buildTerrain(g, rng, climateNoise, params, landFraction, progress));
  }

  progress('Climate', 0.75);
  const climate = computeClimate(g, height, climateNoise);

  progress('Rivers & lakes', 0.85);
  const flow = routeFlow(g, height);
  const acc = accumulate(g, flow, precipWeight(climate.precip));
  const lakeDepth = new Float32Array(g.N);
  const waterLevel = new Float32Array(g.N);
  for (let c = 0; c < g.N; c++) {
    const d = flow.filled[c] - height[c];
    waterLevel[c] = flow.filled[c];
    if (height[c] > 0 && d >= HYDROLOGY.lakeMinDepthM && climate.precip[c] >= HYDROLOGY.lakeMinPrecipMm) lakeDepth[c] = d;
  }
  const rivers = extractRivers(g, height, flow, acc, seedHash);

  progress('Biomes', 0.95);
  const biome = classifyBiomes(g, {
    height, temp: climate.temp, tempWarm: climate.tempWarm, precip: climate.precip, flow, acc, lakeDepth, sedimentFill,
  });
  const koppen = classifyKoppen(climate.temp, climate.tempWarm, climate.tempCold, climate.precipSummer, climate.precipWinter);
  const streamRng = mulberry32(seedHash ^ 0x9e3779b9);
  const wind = traceStreamlines(g, climate.windU, climate.windV, streamRng, {
    spacingDeg: CLIMATE.streamlineSpacingDeg,
    stepKm: CLIMATE.streamlineStepKm,
    steps: CLIMATE.streamlineSteps,
  });
  const currents = traceStreamlines(g, climate.currentU, climate.currentV, streamRng, {
    spacingDeg: CLIMATE.currentStreamSpacingDeg,
    stepKm: CLIMATE.currentStreamStepKm,
    steps: CLIMATE.currentStreamSteps,
    seaOnly: height,
    tint: climate.tempAnomaly,
  });

  progress('Settlements & roads', 0.97);
  const sampler = new DetailSampler({ seed: params.seed, W, H, height, lakeDepth, waterLevel }, new RiverIndex(rivers, params.seed));
  const spread: SpreadTrace = { reach: new Uint8Array(W * H), heartland: -1 };
  const newWorld = newWorldMask(g, { height, lakeDepth, temp: climate.temp, precip: climate.precip }, Math.max(0.2, Math.min(1, params.settled ?? 0.6)), params.seed, spread);
  const { settlements, roads } = buildSettlements(g, {
    height, temp: climate.temp, tempWarm: climate.tempWarm, precip: climate.precip, biome, lakeDepth, acc, flow, newWorld,
  }, seedHash, sampler);

  progress('Names', 0.99);
  const cm = cultureMap(g, { height, temp: climate.temp, tempCold: climate.tempCold, precip: climate.precip, biome, newWorld }, params.seed, params.races !== false);
  const culture = cm.culture;
  const cultures: CultureSet = { seed: params.seed, drift: Math.max(0, Math.min(1, params.drift ?? 0.3)), races: params.races !== false, list: cm.specs };
  setWorldCultures(cultures);
  chooseColonies(g, settlements, culture, seedHash);
  const bank = new NameBank(params.seed);
  const regionOf = new Int32Array(W * H).fill(-1);
  const labels = nameWorld(g, { height, lakeDepth, biome, culture }, bank, settlements, rivers, roads, sampler, regionOf);
  progress('Realms', 0.995);
  // The political map works at up to 1024 × 512: realms are hundreds of km across, and the
  // borders are smoothed anyway, so finer grids only cost time.
  let pg = g, pf = { height, lakeDepth, culture, newWorld, biome, temp: climate.temp, precip: climate.precip };
  if (W > 1024) {
    const k = W / 1024;
    pg = makeGrid(1024, 512);
    const take = <T extends Float32Array | Uint8Array>(src: T, make: (n: number) => T): T => {
      const out = make(pg.N);
      for (let j = 0; j < 512; j++) {
        const sj = Math.min(H - 1, Math.floor((j + 0.5) * k)) * W;
        for (let i = 0; i < 1024; i++) out[j * 1024 + i] = src[sj + Math.min(W - 1, Math.floor((i + 0.5) * k))];
      }
      return out;
    };
    pf = {
      height: take(height, (n) => new Float32Array(n)), lakeDepth: take(lakeDepth, (n) => new Float32Array(n)), culture: take(culture, (n) => new Uint8Array(n)),
      newWorld: take(newWorld, (n) => new Uint8Array(n)), biome: take(biome, (n) => new Uint8Array(n)),
      temp: take(climate.temp, (n) => new Float32Array(n)), precip: take(climate.precip, (n) => new Float32Array(n)),
    };
  }
  const { politics, labels: realmLabels } = buildPolitics(pg, pf, settlements, rivers, bank, params.seed);
  labels.features.push(...realmLabels);
  markUniversities(politics.units, settlements);
  // Special features: volcanoes, ash lands, geysers, glaciers, mushroom forests, canyons, cliffs.
  const sf = specialFeatures(g, {
    height, lakeDepth, temp: climate.temp, tempWarm: climate.tempWarm, precip: climate.precip, windU: climate.windU, windV: climate.windV, biome, culture, volcanic, flow, newWorld,
  }, rivers, settlements, bank, params.seed, params.races !== false);
  labels.features.push(...sf.labels);
  const vents = Float32Array.from(sf.vents.flatMap((v) => [v.lon, v.lat, v.h, v.activity]));

  let land = 0, total = 0, maxE = -Infinity, minE = Infinity;
  for (let j = 0, c = 0; j < H; j++) {
    for (let i = 0; i < W; i++, c++) {
      total += g.areaKm2[j];
      if (height[c] > 0) land += g.areaKm2[j];
      if (height[c] > maxE) maxE = height[c];
      if (height[c] < minE) minE = height[c];
    }
  }

  return {
    raster: {
      seed: params.seed,
      W,
      H,
      numPlates: Math.round(params.plates),
      height,
      tempSea: climate.tempSea,
      precip: climate.precip,
      biome,
      plate,
      lakeDepth,
      waterLevel,
      windU: climate.windU,
      windV: climate.windV,
      currentU: climate.currentU,
      currentV: climate.currentV,
      tempAnomaly: climate.tempAnomaly,
      tempWarm: climate.tempWarm,
      tempCold: climate.tempCold,
      precipSummer: climate.precipSummer,
      precipWinter: climate.precipWinter,
      koppen,
      culture,
      cultures,
      newWorld,
      spread,
      special: sf.special,
      vents,
      curses: sf.curses,
    },
    rivers,
    wind,
    currents,
    settlements,
    roads,
    labels,
    politics,
    regionOf,
    summary: {
      W,
      H,
      landPercent: (100 * land) / total,
      maxElevation: maxE,
      minElevation: minE,
      riverSegments: rivers.features.length,
      cities: settlements.filter((s) => s.tier === 'city').length,
      towns: settlements.filter((s) => s.tier === 'town').length,
      genMs: performance.now() - t0,
    },
  };
}

/**
 * Universities: in the richest Old World realms (by the people of their cities), the largest
 * city has one, and a second great city in the very richest. A realm's wealth in the lore follows
 * trade and land as well, but city people are the heart of it, and this is known in the worker.
 */
function markUniversities(units: PolUnit[], settlements: Settlement[]): void {
  const byId = new Map(settlements.map((s) => [s.id, s]));
  const topOf = (u: PolUnit) => {
    while (u.parent >= 0) u = units[u.parent];
    return u;
  };
  const cities = new Map<number, Settlement[]>();
  for (const u of units) {
    if (u.level !== 0) continue;
    const s = byId.get(u.seat);
    if (!s || s.tier !== 'city' || s.newWorld || s.colony) continue;
    const t = topOf(u);
    if (t.gov === 'tribal' || t.gov === 'colony' || t.nw) continue;
    (cities.get(t.id) ?? cities.set(t.id, []).get(t.id)!).push(s);
  }
  const ranked = [...cities.values()].map((list) => ({ list: list.sort((a, b) => b.population - a.population), pop: list.reduce((a, s) => a + s.population, 0) }))
    .filter((r) => r.pop >= 30000).sort((a, b) => b.pop - a.pop);
  const n = Math.max(1, Math.min(10, Math.round(ranked.length * 0.06)));
  ranked.slice(0, n).forEach((r, k) => {
    r.list[0].university = true;
    if (k < Math.ceil(n / 3) && r.list[1] && r.list[1].population >= 20000) r.list[1].university = true;
  });
}
