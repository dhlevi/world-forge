import { type Grid, makeGrid, areaQuantile } from './grid';
import { type Rng, hashString, mulberry32 } from './rng';
import { Simplex3 } from './noise';
import { buildTectonics, drainInlandSeas } from './tectonics';
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
import { type Politics, buildPolitics } from './politics';
import { cultureMap } from '../names/culture-map';
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
  const { height, plate } = buildTectonics(g, rng, params.plates, landFraction);
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
  return { height, plate, sedimentFill };
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

  let height: Float32Array, plate: Uint8Array, sedimentFill: Float32Array;
  if (params.heightmap) {
    if (params.heightmap.length !== g.N) throw new Error(`heightmap must be ${W}×${H}`);
    height = Float32Array.from(params.heightmap);
    plate = new Uint8Array(g.N);
    sedimentFill = new Float32Array(g.N);
  } else {
    ({ height, plate, sedimentFill } = buildTerrain(g, rng, climateNoise, params, landFraction, progress));
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
  const { settlements, roads } = buildSettlements(g, {
    height, temp: climate.temp, tempWarm: climate.tempWarm, precip: climate.precip, biome, lakeDepth, acc, flow,
  }, seedHash, sampler);

  progress('Names', 0.99);
  const culture = cultureMap(g, { height, temp: climate.temp, tempCold: climate.tempCold, precip: climate.precip, biome }, params.seed);
  const bank = new NameBank(params.seed);
  const regionOf = new Int32Array(W * H).fill(-1);
  const labels = nameWorld(g, { height, lakeDepth, biome, culture }, bank, settlements, rivers, roads, sampler, regionOf);
  progress('Realms', 0.995);
  // The political map works at up to 1024 × 512: realms are hundreds of km across, and the
  // borders are smoothed anyway, so finer grids only cost time.
  let pg = g, pf = { height, lakeDepth, culture };
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
    pf = { height: take(height, (n) => new Float32Array(n)), lakeDepth: take(lakeDepth, (n) => new Float32Array(n)), culture: take(culture, (n) => new Uint8Array(n)) };
  }
  const { politics, labels: realmLabels } = buildPolitics(pg, pf, settlements, rivers, bank, params.seed);
  labels.features.push(...realmLabels);

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
