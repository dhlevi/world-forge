import { type Grid, distKm, neighbor, pxPerMeterZ20, smoothstep } from './grid';
import { MinHeap } from './heap';
import { hash32, hashString, mulberry32 } from './rng';
import { Simplex3 } from './noise';
import type { CityLayout } from '../towns/layout';
import { Biome } from './biomes';
import { HYDROLOGY, SETTLEMENTS as S } from './config';
import type { FlowRouting } from './hydrology';
import type { DetailSampler } from './detail';
import { chaikin, riverVertex, riverWidthM } from './rivers';

export type Tier = 'city' | 'town' | 'village';
export type VillageKind = 'farming' | 'fishing' | 'logging' | 'mining' | 'monastery' | 'keep' | 'tribal' | 'camp' | 'shrine';
/** A New World town founded by an Old World realm. */
export type ColonyKind = 'colony' | 'fort' | 'post';

export interface Settlement {
  id: string;
  /** Generated name (set once cultures are known). */
  name?: string;
  /** The name in English, where it means something ("Black Ford"). */
  nameEn?: string;
  /** For an old name: where it came from. */
  nameOld?: string;
  /** A university city (the largest cities of the richest Old World realms). */
  university?: boolean;
  tier: Tier;
  /** Villages only. */
  kind?: VillageKind;
  /** Army camps: the realm whose host is camped here, and the war it is fighting. */
  army?: { realm: string; war: string };
  /** Shrines at a faith's natural holy places: how it is built, the faith and what is holy there. */
  shrine?: { style: 'chapel' | 'stones' | 'hermitage' | 'totems' | 'pyramid'; faith: string; what: string; feature: string };
  /** In the New World (sparse, tribal lands). */
  newWorld?: boolean;
  /** New World colonies: what kind, and whose culture (index into CULTURES) names and rules it. */
  colony?: ColonyKind;
  culture?: number;
  lon: number;
  lat: number;
  population: number;
  /** Radius of the built-up core (inside the walls), m. */
  coreM: number;
  /** Extent of the town plan including fields, m; roads stop here. */
  radiusM: number;
  walls: boolean;
  citadel: boolean;
  coastal: boolean;
  river: boolean;
  seed: number;
  /** A delve: a city or town of an underground people (dwarves), its halls under the mountain behind a gate. */
  delve?: boolean;
  /** Town plan layout (cities and towns), chosen once cultures are known. */
  layout?: CityLayout;
}

export type RoadClass = 'major' | 'minor' | 'track';

export interface RoadFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: number[][] };
  /** a/b: settlement ids at the start/end ('' where a track joins another road). */
  properties: { cls: RoadClass; a: string; b: string; ppm20: number; name?: string; en?: string };
}

export interface RoadCollection {
  type: 'FeatureCollection';
  features: RoadFeature[];
}

const BIOME_HABITABILITY: Record<Biome, number> = {
  [Biome.IceSheet]: 0,
  [Biome.Tundra]: 0.2,
  [Biome.BorealForest]: 0.55,
  [Biome.ColdDesert]: 0.45,
  [Biome.Grassland]: 1,
  [Biome.Shrubland]: 0.9,
  [Biome.TemperateForest]: 1,
  [Biome.TemperateRainforest]: 0.75,
  [Biome.HotDesert]: 0.25,
  [Biome.Savanna]: 0.85,
  [Biome.TropicalDryForest]: 0.8,
  [Biome.TropicalRainforest]: 0.5,
  [Biome.Alpine]: 0.3,
  [Biome.MontaneForest]: 0.5,
  [Biome.Wetland]: 0.45,
  [Biome.Mangrove]: 0.35,
  [Biome.Riparian]: 1.1,
  [Biome.SaltFlat]: 0.05,
};

/** Road travel-cost multiplier by biome. */
const BIOME_ROAD_COST: Record<Biome, number> = {
  [Biome.IceSheet]: 6,
  [Biome.Tundra]: 1.4,
  [Biome.BorealForest]: 1.3,
  [Biome.ColdDesert]: 1.2,
  [Biome.Grassland]: 1,
  [Biome.Shrubland]: 1.05,
  [Biome.TemperateForest]: 1.15,
  [Biome.TemperateRainforest]: 1.4,
  [Biome.HotDesert]: 1.4,
  [Biome.Savanna]: 1,
  [Biome.TropicalDryForest]: 1.15,
  [Biome.TropicalRainforest]: 1.8,
  [Biome.Alpine]: 1.3,
  [Biome.MontaneForest]: 1.4,
  [Biome.Wetland]: 2.2,
  [Biome.Mangrove]: 2.5,
  [Biome.Riparian]: 1,
  [Biome.SaltFlat]: 1.2,
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 0 (uninhabitable) to ~1.1, from mean/warmest-month temperature (°C, at the site's elevation), precipitation (mm/yr), elevation (m) and slope (m/km). */
export function habitability(temp: number, tempWarm: number, precip: number, heightM: number, slopeMPerKm: number, biome: Biome): number {
  if (heightM <= 0) return 0;
  const warmth = smoothstep(4, 12, tempWarm) * (1 - 0.6 * smoothstep(26, 32, temp));
  const water = biome === Biome.Riparian
    ? 0.9
    : Math.sqrt(smoothstep(120, 600, precip)) * (1 - 0.3 * smoothstep(2500, 4500, precip));
  const altitude = 1 - smoothstep(1500, 3500, heightM);
  const flat = 1 - 0.85 * smoothstep(8, 40, slopeMPerKm);
  return warmth * water * altitude * flat * BIOME_HABITABILITY[biome];
}

export function makeSettlement(
  tier: Tier, id: string, lon: number, lat: number, score: number, seed: number, coastal: boolean, river: boolean,
  kind?: VillageKind,
): Settlement {
  const r1 = hash32(seed) / 4294967296, r2 = hash32(seed ^ 0x2545f491) / 4294967296, r3 = hash32(seed ^ 0x6c8e9cf5) / 4294967296;
  const camp = kind === 'logging' || kind === 'mining' || kind === 'monastery' || kind === 'keep';
  const population = tier === 'city'
    ? Math.round(6000 + 40000 * clamp01((score - S.cityMinScore) / 0.5) * (0.4 + 0.6 * r1) + 4000 * r2)
    : tier === 'town'
      ? Math.round(500 + 5500 * (clamp01((score - S.townMinScore) / 0.8) * (0.25 + 0.75 * r1)) ** 1.5)
      : camp
        ? Math.round((kind === 'keep' ? 60 : 20) + (kind === 'keep' ? 240 : 120) * r1)
        : Math.round(40 + 500 * clamp01((score - S.villageMinScore) / 0.6) * (0.4 + 0.6 * r1));
  const density = tier === 'village' ? S.villageDensityPerHa : S.cityDensityPerHa;
  const coreM = Math.sqrt(((population / density) * 10000) / Math.PI);
  const walls = tier === 'city' || (tier === 'town' && (population > 3500 || r2 < 0.2));
  return {
    id, tier, kind, lon, lat, population, coreM,
    radiusM: tier === 'village' ? coreM * 2.6 + 120 : coreM * 2.1 + 250,
    walls,
    citadel: tier === 'city' ? r3 < 0.75 : walls && r3 < 0.2,
    coastal, river, seed,
  };
}

/** Share of a town's core (a disc of `coreM`) that is water at full shoreline detail, from 24 samples. */
function coreWater(sampler: DetailSampler, lon: number, lat: number, coreM: number): number {
  const kLat = 1 / 111200, kLon = kLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  let w = 0;
  for (let q = 0; q < 24; q++) {
    const a = q * 2.39996, r = coreM * Math.sqrt((q + 0.5) / 24);
    if (sampler.isWater(lon + Math.cos(a) * r * kLon, lat + Math.sin(a) * r * kLat)) w++;
  }
  return w / 24;
}

/**
 * Moves a town whose core is more than half water to the nearest spot (within ~3 km, or ~8 km if
 * there is no dry ground nearer) whose core is
 * mostly land, or failing that the driest spot found; towns already on enough land stay put.
 * False for a town with almost no dry ground (a land cell that is open water at full detail, or a
 * scatter of islets), which is then left out.
 */
function landfall(sampler: DetailSampler, s: Settlement): boolean {
  if (coreWater(sampler, s.lon, s.lat, s.coreM) <= 0.5) return true;
  const kmLat = 1 / 111.2, kmLon = kmLat / Math.max(0.05, Math.cos((s.lat * Math.PI) / 180));
  let best: [number, number] | null = null, bestW = Infinity;
  // Out to 3 km for a better spot, and on to 8 km while there is no dry ground at all.
  for (let d = 0.3; d <= 8; d += d < 3 ? 0.3 : 0.5) {
    if (d > 3 && best) break;
    for (let q = 0; q < 12; q++) {
      const a = (q / 12) * Math.PI * 2 + d;
      const x = s.lon + Math.cos(a) * d * kmLon, y = s.lat + Math.sin(a) * d * kmLat;
      if (sampler.isWater(x, y)) continue;
      const w = coreWater(sampler, x, y, s.coreM);
      if (w < bestW) {
        bestW = w;
        best = [x, y];
      }
    }
    if (bestW <= 0.35) break;
  }
  if (best) [s.lon, s.lat] = best;
  // No town where nearly all the ground for miles around is water.
  return best ? bestW <= 0.8 : !sampler.isWater(s.lon, s.lat) && coreWater(sampler, s.lon, s.lat, s.coreM) <= 0.8;
}

/** Moves a point off water (at full shoreline detail) to the nearest land within ~20 km. */
export function nudgeOntoLand(sampler: DetailSampler, lon: number, lat: number): [number, number] {
  if (!sampler.isWater(lon, lat)) return [lon, lat];
  const kmLat = 1 / 111.2, kmLon = kmLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  for (let r = 0.25; r <= 20; r += 0.25) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 2 * Math.PI;
      const x = lon + Math.cos(a) * r * kmLon, y = lat + Math.sin(a) * r * kmLat;
      if (!sampler.isWater(x, y)) return [x, y];
    }
  }
  return [lon, lat];
}

/** The nearest open water (sea or lake, at full shoreline detail) within `maxKm`, or null. */
export function nearestWater(sampler: DetailSampler, lon: number, lat: number, maxKm: number): [number, number] | null {
  const kmLat = 1 / 111.2, kmLon = kmLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  for (let r = 0.25; r <= maxKm; r += r < 3 ? 0.25 : 0.75) {
    const n = r < 3 ? 10 : 14;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 2 * Math.PI;
      const x = lon + Math.cos(a) * r * kmLon, y = lat + Math.sin(a) * r * kmLat;
      if (sampler.height(x, y, 0.8, false) <= 0) return [x, y];
    }
  }
  return null;
}

/** Cuts a polyline where it first leaves a circle of `rKm` around its first point; null if it never does. */
export function trimStart(pts: number[][], rKm: number): number[][] | null {
  const [lon0, lat0] = pts[0];
  let prevD = 0;
  for (let k = 1; k < pts.length; k++) {
    const d = distKm(lon0, lat0, pts[k][0], pts[k][1]);
    if (d >= rKm) {
      const t = (rKm - prevD) / Math.max(1e-9, d - prevD);
      const a = pts[k - 1], b = pts[k];
      return [[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], ...pts.slice(k)];
    }
    prevD = d;
  }
  return null;
}

export function trimEnds(pts: number[][], startKm: number, endKm: number): number[][] | null {
  const a = startKm > 0 ? trimStart(pts, startKm) : pts;
  if (!a || a.length < 2) return null;
  const b = endKm > 0 ? trimStart([...a].reverse(), endKm) : [...a].reverse();
  return b && b.length >= 2 ? b.reverse() : null;
}

interface SettlementFields {
  height: Float32Array;
  temp: Float32Array;
  tempWarm: Float32Array;
  precip: Float32Array;
  biome: Uint8Array;
  lakeDepth: Float32Array;
  acc: Float32Array;
  flow: FlowRouting;
  /** 1 on New World land (gen/oldworld.ts). */
  newWorld: Uint8Array;
}

/**
 * Founds cities and towns on the most habitable sites (rivers, coasts, mild climate, flat
 * ground) with minimum spacings in km, then links them with roads routed by A* over the grid
 * (slope, biome and bridge costs; reusing existing roads is cheap so routes merge into trunks).
 */
export function buildSettlements(g: Grid, f: SettlementFields, seed: number, sampler: DetailSampler) {
  const { W, H, N } = g;
  const thr = HYDROLOGY.riverThresholdKm2;
  const isRiver = new Uint8Array(N);
  for (let c = 0; c < N; c++) if (f.height[c] > 0 && f.acc[c] >= thr && f.flow.recv[c] !== c) isRiver[c] = 1;

  const score = new Float32Array(N);
  const coastal = new Uint8Array(N);
  for (let j = 0, c = 0; j < H; j++) {
    for (let i = 0; i < W; i++, c++) {
      const h = f.height[c];
      if (h <= 0 || f.lakeDepth[c] > 0) continue;
      let slope = 0, sea = false, lake = false;
      for (let k = 0; k < 8; k++) {
        const n = neighbor(g, i, j, k);
        if (n < 0) continue;
        if (f.height[n] <= 0) sea = true;
        else if (f.lakeDepth[n] > 0) lake = true;
        slope = Math.max(slope, Math.abs(Math.max(0, f.height[n]) - h) / g.nbDist[j * 8 + k]);
      }
      const s = habitability(f.temp[c], f.tempWarm[c], f.precip[c], h, slope, f.biome[c] as Biome);
      if (s <= 0) continue;
      let bonus = 1;
      if (isRiver[c]) bonus += S.riverBonus * (1 + 0.15 * Math.min(4, Math.log2(f.acc[c] / thr)));
      if (sea) bonus += S.coastBonus;
      if (lake) bonus += S.lakeBonus;
      score[c] = s * bonus;
      coastal[c] = sea ? 1 : 0;
    }
  }

  const cand: number[] = [];
  const prio = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    if (score[c] < S.townMinScore) continue;
    cand.push(c);
    prio[c] = score[c] * (0.55 + (0.45 * hash32(c ^ seed ^ 0x51ed27)) / 4294967296);
  }
  cand.sort((a, b) => prio[b] - prio[a]);

  const stamp = (arr: Uint8Array, c: number, km: number) => {
    const i = c % W, j = (c / W) | 0;
    const dj = Math.ceil(km / g.dyKm);
    for (let jj = Math.max(0, j - dj); jj <= Math.min(H - 1, j + dj); jj++) {
      const di = Math.min(W >> 1, Math.ceil(km / Math.max(1e-3, g.dxKm[jj])));
      for (let k = -di; k <= di; k++) {
        const ii = (((i + k) % W) + W) % W;
        if (distKm(g.lonDeg[i], g.latDeg[j], g.lonDeg[ii], g.latDeg[jj]) < km) arr[jj * W + ii] = 1;
      }
    }
  };
  const nearCity = new Uint8Array(N), nearTown = new Uint8Array(N);
  const sites: { c: number; tier: Tier }[] = [];
  // Cities only in the Old World; New World towns stand far apart.
  for (const c of cand) {
    if (f.newWorld[c] || score[c] < S.cityMinScore || nearCity[c] || nearTown[c]) continue;
    sites.push({ c, tier: 'city' });
    stamp(nearCity, c, S.citySpacingKm);
    stamp(nearTown, c, S.townSpacingKm);
  }
  for (const c of cand) {
    if (nearTown[c]) continue;
    sites.push({ c, tier: 'town' });
    stamp(nearTown, c, f.newWorld[c] ? S.newWorldTownSpacingKm : S.townSpacingKm);
  }

  let nCity = 0, nTown = 0;
  const drowned = new Set<string>();
  const placed: Settlement[] = sites.map(({ c, tier }) => {
    const sseed = hash32(c ^ seed ^ 0x7a11);
    const i = c % W, j = (c / W) | 0;
    const id = tier === 'city' ? `c${nCity++}` : `t${nTown++}`;
    let lon: number, lat: number;
    let s: Settlement;
    if (isRiver[c]) {
      // On the river, shifted to one bank so the river runs through the town rather than its centre.
      const p = riverVertex(g, c, seed), q = riverVertex(g, f.flow.recv[c], seed);
      let qx = q[0];
      while (qx - p[0] > 180) qx -= 360;
      while (qx - p[0] < -180) qx += 360;
      lon = (p[0] + qx) / 2;
      lat = (p[1] + q[1]) / 2;
      s = makeSettlement(tier, id, lon, lat, score[c], sseed, coastal[c] === 1, true);
      const cosL = Math.cos((lat * Math.PI) / 180);
      const ex = (qx - p[0]) * cosL, ny = q[1] - p[1];
      const len = Math.hypot(ex, ny) || 1;
      const side = sseed & 1 ? 1 : -1;
      const offKm = (riverWidthM(Math.log2(f.acc[c] / thr)) / 2 + s.coreM * 0.3) / 1000;
      s.lon += ((-ny / len) * side * offKm) / (111.2 * Math.max(0.05, cosL));
      s.lat += ((ex / len) * side * offKm) / 111.2;
    } else {
      const jx = (hash32(sseed ^ 1) / 4294967296 - 0.5) * 0.7, jy = (hash32(sseed ^ 2) / 4294967296 - 0.5) * 0.7;
      lon = g.lonDeg[i] + (jx * 360) / W;
      lat = g.latDeg[j] + (jy * 180) / H;
      s = makeSettlement(tier, id, lon, lat, score[c], sseed, coastal[c] === 1, false);
    }
    [s.lon, s.lat] = nudgeOntoLand(sampler, s.lon, s.lat);
    // A grid cell by the sea may still lie kilometres from the true shore: a coastal town moves to
    // the water's edge (up to 25 km, so its plan has a harbour), or is not coastal after all.
    if (s.coastal) {
      const w = nearestWater(sampler, s.lon, s.lat, s.river ? (s.coreM * 1.4) / 1000 : 25);
      if (!w) s.coastal = false;
      else if (!s.river) {
        const kmLat = 1 / 111.2, kmLon = kmLat / Math.max(0.05, Math.cos((s.lat * Math.PI) / 180));
        const dx = (s.lon - w[0]) / kmLon, dy = (s.lat - w[1]) / kmLat;
        const d = Math.hypot(dx, dy);
        const want = (s.coreM * 0.55) / 1000;
        if (d > want) {
          const t = want / d;
          const p = nudgeOntoLand(sampler, w[0] + dx * t * kmLon, w[1] + dy * t * kmLat);
          [s.lon, s.lat] = p;
        }
      }
    }
    // A site on a sliver of land (an islet or spit only the fine shoreline shows) would leave
    // the town no ground to build on: it moves to the nearest spot whose core is mostly land.
    {
      // Coastal towns, and any with water at two of four points around the core (lake towns).
      const kLat = s.coreM * 0.5 / 111200, kLon = kLat / Math.max(0.05, Math.cos((s.lat * Math.PI) / 180));
      const wet = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([x, y]) => sampler.isWater(s.lon + x * kLon, s.lat + y * kLat)).length;
      if ((s.coastal || wet >= 2) && !landfall(sampler, s)) drowned.add(s.id);
    }
    if (f.newWorld[c]) {
      // New World towns are tribal towns (smaller), until some are chosen as colonies.
      s.newWorld = true;
      s.kind = 'tribal';
      s.population = Math.round(s.population * 0.45);
      s.coreM = Math.sqrt(((s.population / S.villageDensityPerHa) * 10000) / Math.PI);
      s.radiusM = s.coreM * 2.6 + 160;
      s.walls = false;
      s.citadel = false;
    }
    return s;
  });
  // Towns with no dry ground at all are left out (sites and settlements stay in step).
  const keep = placed.map((s) => !drowned.has(s.id));
  const settlements = placed.filter((_, k) => keep[k]);
  const cells = sites.filter((_, k) => keep[k]).map((s) => s.c);
  const roads = buildRoads(g, f, seed, isRiver, settlements, cells, sampler);
  return { settlements, roads };
}

/** Relative-neighbourhood graph: keeps a–b unless some c is closer to both. Gives a sparse, natural network. */
function neighbourhoodEdges(sts: Settlement[], idx: number[], maxKm: number): [number, number, number][] {
  const D = (a: number, b: number) => distKm(sts[a].lon, sts[a].lat, sts[b].lon, sts[b].lat);
  // Bin by latitude bands of maxKm, and longitude in degrees wide enough for the band's widest point.
  const binDeg = maxKm / 111.2;
  const nLat = Math.ceil(180 / binDeg);
  const bins = new Map<number, number[]>();
  const latBin = (lat: number) => Math.min(nLat - 1, Math.floor((lat + 90) / binDeg));
  idx.forEach((s, x) => {
    const key = latBin(sts[s].lat);
    const list = bins.get(key);
    if (list) list.push(x);
    else bins.set(key, [x]);
  });
  const near: { b: number; d: number }[][] = idx.map(() => []);
  for (let x = 0; x < idx.length; x++) {
    const lb = latBin(sts[idx[x]].lat);
    for (let b = lb; b <= Math.min(nLat - 1, lb + 1); b++) {
      for (const y of bins.get(b) ?? []) {
        if (b === lb && y <= x) continue;
        const dLon = Math.abs((((sts[idx[y]].lon - sts[idx[x]].lon) % 360) + 540) % 360 - 180);
        const cosMin = Math.cos((Math.min(89.9, Math.max(Math.abs(sts[idx[x]].lat), Math.abs(sts[idx[y]].lat))) * Math.PI) / 180);
        if (dLon * 111.2 * cosMin > maxKm) continue;
        const d = D(idx[x], idx[y]);
        if (d > maxKm) continue;
        near[x].push({ b: y, d });
        near[y].push({ b: x, d });
      }
    }
  }
  const edges: [number, number, number][] = [];
  for (let x = 0; x < idx.length; x++) {
    for (const { b: y, d } of near[x]) {
      if (y < x) continue;
      const blocked = near[x].some(({ b: z, d: dxz }) => z !== y && dxz < d && D(idx[y], idx[z]) < d);
      if (!blocked) edges.push([idx[x], idx[y], d]);
    }
  }
  return edges.sort((p, q) => p[2] - q[2]);
}

function buildRoads(
  g: Grid, f: SettlementFields, seed: number, isRiver: Uint8Array, sts: Settlement[], cells: number[], sampler: DetailSampler,
): RoadCollection {
  const { W, N } = g;
  const cities = sts.map((s, k) => (s.tier === 'city' ? k : -1)).filter((k) => k >= 0);
  const all = sts.map((_, k) => k);
  const done = new Set<string>();
  const jobs: { a: number; b: number; cls: RoadClass }[] = [];
  for (const [a, b] of neighbourhoodEdges(sts, cities, S.cityLinkKm)) {
    done.add(`${a}-${b}`);
    jobs.push({ a, b, cls: 'major' });
  }
  for (const [a, b] of neighbourhoodEdges(sts, all, S.townLinkKm)) {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (done.has(key)) continue;
    jobs.push({ a, b, cls: 'minor' });
  }

  const xyz = (c: number) => {
    const i = c % W, j = (c / W) | 0;
    return [g.cosLat[j] * g.cosLon[i], g.cosLat[j] * g.sinLon[i], g.sinLat[j]];
  };
  const vertex = (c: number) => {
    const hsh = hash32(c ^ seed ^ 0x40adb33f);
    const jx = ((hsh & 0xffff) / 0xffff - 0.5) * S.roadJitter, jy = ((hsh >>> 16) / 0xffff - 0.5) * S.roadJitter;
    return [g.lonDeg[c % W] + (jx * 360) / W, g.latDeg[(c / W) | 0] + (jy * 180) / g.H];
  };

  const gScore = new Float64Array(N), from = new Int32Array(N);
  const seen = new Int32Array(N), closed = new Int32Array(N);
  const onRoad = new Uint8Array(N);
  const heap = new MinHeap(4096);
  // Low land next to the sea or a lake (or water itself): only there can the detailed shoreline
  // differ from the grid, so only there are roads checked against it.
  const shore = new Uint8Array(N);
  for (let j = 0, c = 0; j < g.H; j++) {
    for (let i = 0; i < W; i++, c++) {
      const wetCell = (n: number) => f.height[n] <= 0 || f.lakeDepth[n] > 0;
      if (wetCell(c)) { shore[c] = f.lakeDepth[c] > 0 ? 2 : 1; continue; }
      // Low land can dip below sea level at full detail (lagoons, marshy inlets).
      if (f.height[c] < 220) shore[c] = 1;
      for (let k = 0; k < 8; k++) {
        const n = neighbor(g, i, j, k);
        if (n >= 0 && wetCell(n)) shore[c] = Math.max(shore[c], f.lakeDepth[n] > 0 ? 2 : 1);
      }
    }
  }
  const features: RoadFeature[] = [];
  let search = 0;
  const route = new FineRoute(sampler, seed, g, isRiver, shore);

  for (const job of jobs) {
    const start = cells[job.a], goal = cells[job.b];
    if (start === goal) continue;
    search++;
    heap.size = 0;
    const [gx, gy, gz] = xyz(goal);
    const sa = sts[job.a], sb = sts[job.b];
    const budget = 3 * distKm(sa.lon, sa.lat, sb.lon, sb.lat) + 300;
    seen[start] = search;
    gScore[start] = 0;
    heap.push(start, 0);
    let found = false;
    while (heap.size > 0) {
      const c = heap.pop();
      if (closed[c] === search) continue;
      closed[c] = search;
      if (c === goal) {
        found = true;
        break;
      }
      const gc = gScore[c];
      if (gc > budget) break;
      const i = c % W, j = (c / W) | 0;
      const hc = Math.max(0, f.height[c]);
      for (let k = 0; k < 8; k++) {
        const n = neighbor(g, i, j, k);
        if (n < 0 || closed[n] === search) continue;
        if (f.height[n] <= 0 || f.lakeDepth[n] > 0) continue;
        const d = g.nbDist[j * 8 + k];
        const slope = Math.abs(Math.max(0, f.height[n]) - hc) / d;
        let cost = d * (1 + (slope / S.roadSlopeRefMPerKm) ** 2) * BIOME_ROAD_COST[f.biome[n] as Biome];
        if (onRoad[n] && onRoad[c]) cost *= S.roadReuseFactor;
        if (isRiver[n] !== isRiver[c]) cost += S.roadBridgeKm / 2;
        const ng = gc + cost;
        if (seen[n] !== search || ng < gScore[n]) {
          seen[n] = search;
          gScore[n] = ng;
          from[n] = c;
          const [nx, ny, nz] = xyz(n);
          const chordKm = Math.hypot(nx - gx, ny - gy, nz - gz) * 6371;
          heap.push(n, ng + S.roadReuseFactor * chordKm);
        }
      }
    }
    if (!found) continue;

    const path: number[] = [];
    for (let c = goal; ; c = from[c]) {
      path.push(c);
      onRoad[c] = 1;
      if (c === start) break;
    }
    path.reverse();
    const pts = path.map(vertex);
    pts[0] = [sa.lon, sa.lat];
    pts[pts.length - 1] = [sb.lon, sb.lat];
    for (let k = 1; k < pts.length; k++) {
      while (pts[k][0] - pts[k - 1][0] > 180) pts[k][0] -= 360;
      while (pts[k][0] - pts[k - 1][0] < -180) pts[k][0] += 360;
    }
    // The grid route only knows grid cells; at full detail it can cut across bays and lakes.
    // Fit the whole line (it starts and ends on land, at the town centres), then trim the ends
    // back to the town edges, so the road also reaches each town over land.
    const line0 = chaikin(route.line(pts, job.cls === 'major'), S.roadSmoothing);
    route.wobble(line0);
    simplifyInPlace(line0, ROUTE.simplifyKm);
    const first = line0[0], last = line0[line0.length - 1];
    for (const pc of fitRoadToLand(line0, sampler, g, shore, sa.radiusM / 1000, sb.radiusM / 1000)) {
      // Pieces keep the original end points (by reference) where they reach a town.
      const atA = pc[0] === first, atB = pc[pc.length - 1] === last;
      let t = trimEnds(pc, atA ? sa.radiusM / 1000 : 0, atB ? sb.radiusM / 1000 : 0);
      if (!t) continue;
      // Where the town edge falls in the water, start the road at the shore instead (the town
      // plan carries it on from there).
      const dry = (p: number[]) => !sampler.isWater(p[0], p[1], sampler.height(p[0], p[1], 0.05, false));
      if (atA) {
        let k = 0;
        while (k < t.length - 2 && !dry(t[k])) k++;
        t = t.slice(k);
      }
      if (atB) {
        let k = t.length - 1;
        while (k > 1 && !dry(t[k])) k--;
        t = t.slice(0, k + 1);
      }
      if (t.length < 2) continue;
      // The shoreline fitting samples densely; straight runs need far fewer points.
      simplifyInPlace(t, ROUTE.simplifyKm * 0.5);
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: t },
        properties: { cls: job.cls, a: atA ? sa.id : '', b: atB ? sb.id : '', ppm20: pxPerMeterZ20(t[t.length >> 1][1]) },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Lays a road out between the vertices of its grid route at a ~2 km step, so it follows the
 * ground the tiles draw instead of running straight from one grid cell to the next: it bends
 * round spurs and hills, keeps to valley floors and runs beside rivers, and wanders a little
 * where the land is open. Each stretch between two grid vertices is a dynamic programme over a
 * strip of lanes either side of the straight line (the road moves at most one lane per step, so
 * it stays smooth and never doubles back). Stretches are cached by their end points, so roads that
 * share part of a route share exactly the same line there.
 */
class FineRoute {
  private cache = new Map<string, number[][]>();
  private noise: Simplex3;
  /** Grid cells on or next to a river: only there is the (costly) river distance looked up. */
  private riverNear: Uint8Array;
  constructor(private sampler: DetailSampler, seed: number, private g: Grid, isRiver: Uint8Array, private shore: Uint8Array) {
    this.noise = new Simplex3(mulberry32(hashString(`road-route#${seed}`)));
    const { W, H } = g;
    this.riverNear = new Uint8Array(W * H);
    for (let c = 0; c < W * H; c++) {
      if (!isRiver[c]) continue;
      const i = c % W, j = (c / W) | 0;
      this.riverNear[c] = 1;
      for (let k = 0; k < 8; k++) {
        const n = neighbor(g, i, j, k);
        if (n >= 0) this.riverNear[n] = 1;
      }
    }
  }

  private cell(lon: number, lat: number): number {
    const { W, H } = this.g;
    return Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H))) * W + ((Math.floor(((lon + 180) / 360) * W) % W) + W) % W;
  }

  line(pts: number[][], major: boolean): number[][] {
    const out: number[][] = [pts[0]];
    const strip = major ? ROUTE.major : ROUTE.minor;
    for (let k = 1; k < pts.length; k++) out.push(...this.stretch(pts[k - 1], pts[k], strip), pts[k]);
    return out;
  }

  /**
   * A slight hand-drawn waver across the line (a smooth noise field of position, so shared
   * stretches waver alike), fading out over the first and last kilometres.
   */
  wobble(line: number[][]): void {
    const { wobbleKm, wobbleM } = ROUTE;
    const n = line.length;
    if (n < 3) return;
    const fq = 6371 / wobbleKm;
    const orig = line.map((p) => [p[0], p[1]]);
    let along = 0;
    const total = (() => {
      let t = 0;
      for (let k = 1; k < n; k++) t += Math.hypot((orig[k][0] - orig[k - 1][0]) * 111.2 * Math.cos((orig[k][1] * Math.PI) / 180), (orig[k][1] - orig[k - 1][1]) * 111.2);
      return t;
    })();
    for (let k = 1; k < n - 1; k++) {
      const p = orig[k], a = orig[k - 1], b = orig[k + 1];
      const cl = Math.max(0.05, Math.cos((p[1] * Math.PI) / 180));
      along += Math.hypot((p[0] - a[0]) * 111.2 * cl, (p[1] - a[1]) * 111.2);
      const fade = Math.min(1, along / 1.5, (total - along) / 1.5);
      if (fade <= 0) continue;
      const tx = (b[0] - a[0]) * cl, ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
      const la = (p[1] * Math.PI) / 180, lo = (p[0] * Math.PI) / 180;
      const v = this.noise.noise(Math.cos(la) * Math.cos(lo) * fq + 17.3, Math.cos(la) * Math.sin(lo) * fq, Math.sin(la) * fq);
      const off = (v * wobbleM * fade) / 1000 / 111.2;
      line[k][0] = p[0] + ((-ty / tl) * off) / cl;
      line[k][1] = p[1] + (tx / tl) * off;
    }
  }

  /** Points strictly between a and b. */
  private stretch(a: number[], b: number[], strip: Strip): number[][] {
    const ka = `${a[0].toFixed(4)},${a[1].toFixed(4)}`, kb = `${b[0].toFixed(4)},${b[1].toFixed(4)}`;
    const fwd = ka < kb;
    const key = fwd ? `${ka}|${kb}` : `${kb}|${ka}`;
    let mid = this.cache.get(key);
    if (!mid) {
      mid = fwd ? this.solve(a, b, strip) : this.solve(b, a, strip);
      this.cache.set(key, mid);
    }
    return fwd ? mid : [...mid].reverse();
  }

  private solve(a: number[], b: number[], strip: Strip): number[][] {
    const { slopeRefMPerKm, wanderKm, wander, valley } = ROUTE;
    const { stepKm, laneKm, lanes } = strip;
    const la = (a[1] + b[1]) / 2, cl = Math.max(0.05, Math.cos((la * Math.PI) / 180));
    const dx = (b[0] - a[0]) * 111.2 * cl, dy = (b[1] - a[1]) * 111.2;
    const L = Math.hypot(dx, dy);
    if (L < stepKm * 1.5) return [];
    const nS = Math.max(2, Math.round(L / stepKm)), st = L / nS;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const K = lanes, T = 2 * K + 1;
    const pos = (i: number, t: number): number[] => {
      const along = (i / nS) * L, off = (t - K) * laneKm;
      return [a[0] + (ux * along + nx * off) / (111.2 * cl), a[1] + (uy * along + ny * off) / 111.2];
    };
    // Height and cost factor of each reachable node (the ends are pinned to the centre lane).
    const h = new Float64Array((nS + 1) * T), fac = new Float64Array((nS + 1) * T), add = new Float64Array((nS + 1) * T);
    const reach = (i: number, t: number) => Math.abs(t - K) <= Math.min(i, nS - i);
    const sp = this.sampler;
    for (let i = 0; i <= nS; i++) {
      for (let t = 0; t < T; t++) {
        if (!reach(i, t)) continue;
        const [lon, lat] = pos(i, t), n = i * T + t;
        const c = this.cell(lon, lat);
        const hh = sp.height(lon, lat, ROUTE.pxKm, false);
        h[n] = Math.max(0, hh);
        if (i > 0 && i < nS && this.shore[c] && sp.isWater(lon, lat, hh)) {
          fac[n] = 60;
          continue;
        }
        let f = 1;
        const bank = this.riverNear[c] ? sp.riverBank(lon, lat, valley.reachM) : null;
        if (bank !== null) {
          // Bigger rivers cost more to bridge.
          if (bank.bankM < 0) add[n] = valley.bridgeKm * Math.min(2, 0.5 + bank.order / 4);
          else if (bank.bankM > valley.nearM) f *= valley.factor;
        }
        // Gentle wander: a smooth noise field makes open ground a little cheaper in places.
        const x = Math.cos((lat * Math.PI) / 180) * Math.cos((lon * Math.PI) / 180), y = Math.cos((lat * Math.PI) / 180) * Math.sin((lon * Math.PI) / 180), z = Math.sin((lat * Math.PI) / 180);
        const fq = 6371 / wanderKm;
        f *= 1 + wander * this.noise.noise(x * fq, y * fq, z * fq);
        fac[n] = f;
      }
    }
    const cost = new Float64Array((nS + 1) * T).fill(Infinity), back = new Int8Array((nS + 1) * T);
    cost[K] = 0;
    for (let i = 1; i <= nS; i++) {
      for (let t = 0; t < T; t++) {
        if (!reach(i, t)) continue;
        const n = i * T + t;
        for (let dt = -1; dt <= 1; dt++) {
          const tp = t + dt;
          if (tp < 0 || tp >= T || !reach(i - 1, tp)) continue;
          const p = (i - 1) * T + tp;
          if (cost[p] === Infinity) continue;
          const d = Math.hypot(st, dt * laneKm);
          const slope = Math.abs(h[n] - h[p]) / d;
          const c = cost[p] + d * (1 + (slope / slopeRefMPerKm) ** 2) * 0.5 * (fac[n] + fac[p]) + add[n];
          if (c < cost[n]) {
            cost[n] = c;
            back[n] = dt;
          }
        }
      }
    }
    const lanesOf: number[] = new Array(nS + 1);
    for (let i = nS, t = K; i >= 0; i--) {
      lanesOf[i] = t;
      t -= back[i * T + t];
    }
    const out: number[][] = [];
    for (let i = 1; i < nS; i++) out.push(pos(i, lanesOf[i]));
    return out;
  }
}

/** Fine road layout (see FineRoute). */
/** Douglas–Peucker in place (local flat km), keeping the first and last points by reference. */
function simplifyInPlace(line: number[][], tolKm: number): void {
  if (line.length < 3) return;
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const cl = Math.max(0.05, Math.cos((line[line.length >> 1][1] * Math.PI) / 180));
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    const ax = line[i0][0] * cl, ay = line[i0][1], bx = line[i1][0] * cl, by = line[i1][1];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let best = -1, bd = (tolKm / 111.2) ** 2;
    for (let k = i0 + 1; k < i1; k++) {
      const px = line[k][0] * cl - ax, py = line[k][1] - ay;
      const t = l2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / l2)) : 0;
      const ex = px - t * dx, ey = py - t * dy, d = ex * ex + ey * ey;
      if (d > bd) {
        bd = d;
        best = k;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([i0, best], [best, i1]);
    }
  }
  let w = 0;
  for (let k = 0; k < line.length; k++) if (keep[k]) line[w++] = line[k];
  line.length = w;
}

interface Strip {
  stepKm: number;
  laneKm: number;
  /** Lanes either side of the straight line (so up to lanes × laneKm off it). */
  lanes: number;
}
const ROUTE = {
  /** Douglas–Peucker tolerance after smoothing (km): invisible at road zooms, far fewer points. */
  simplifyKm: 0.06,
  /** Major roads get a wider, finer strip than the many minor roads. */
  major: { stepKm: 3, laneKm: 2, lanes: 4 } as Strip,
  minor: { stepKm: 5, laneKm: 2.5, lanes: 3 } as Strip,
  /** Terrain detail the layout sees (km per pixel): hills and spurs of ten kilometres and more. */
  pxKm: 10,
  /** Fine-scale slope at which the cost of a step doubles (m/km). */
  slopeRefMPerKm: 45,
  /** Wander: noise wavelength (km) and strength (± fraction of cost). */
  wanderKm: 11,
  wander: 0.5,
  /** Hand-drawn waver after smoothing: noise wavelength (km) and largest offset (m). */
  wobbleKm: 5,
  wobbleM: 320,
  /** Rivers: roads like to run beside them (cheaper beyond nearM of the bank, within reachM) and pay to cross. */
  valley: { reachM: 2500, nearM: 150, factor: 0.8, bridgeKm: 2.5 },
};

/**
 * Keeps a road on land at full terrain detail: the line is resampled about every 200 m, points
 * that fall in the sea or a lake move to the nearest shore (a little inland) and the line is
 * eased again. Short remaining water crossings become bridges or causeways; a crossing longer
 * than S.roadMaxBridgeM breaks the road there (the two halves end at the shore), so roads never
 * stride across open water.
 */
export function fitRoadToLand(
  line: number[][], sampler: DetailSampler, g: Grid, shore: Uint8Array, startKm = 0, endKm = 0,
): number[][][] {
  const { W, H } = g;
  const stepKm = 0.15;
  const cellOf = (lon: number, lat: number) =>
    Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H))) * W + ((Math.floor(((lon + 180) / 360) * W) % W) + W) % W;
  // Detail sampling only matters near coasts and lakes; elsewhere the answer is always land.
  const wet = (lon: number, lat: number) => {
    const c = shore[cellOf(lon, lat)];
    if (c === 0) return false;
    // The smooth grid surface settles most points: sub-grid relief never reaches ±250 m.
    const base = sampler.height(lon, lat, Infinity, false);
    if (c === 1 && base > 250) return false;
    if (c === 1 && base < -250) return true;
    return sampler.isWater(lon, lat, sampler.height(lon, lat, 0.3, false));
  };
  const kmLat = 1 / 111.2;

  // Resample the stretches that come near water every 500 m, then every 125 m around wet samples.
  const coarse: number[][] = [line[0]];
  for (let k = 1; k < line.length; k++) {
    const a = line[k - 1], b = line[k];
    if (!shore[cellOf(a[0], a[1])] && !shore[cellOf(b[0], b[1])] && !shore[cellOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)]) {
      coarse.push(b);
      continue;
    }
    const cl = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
    const d = Math.hypot((b[0] - a[0]) * cl, b[1] - a[1]) * 111.2;
    const n = Math.max(1, Math.ceil(d / (4 * stepKm)));
    for (let t = 1; t <= n; t++) coarse.push(t === n ? b : [a[0] + ((b[0] - a[0]) * t) / n, a[1] + ((b[1] - a[1]) * t) / n]);
  }
  const cw = coarse.map((p) => wet(p[0], p[1]));
  const pts: number[][] = [coarse[0]];
  // Known wetness of each point (the coarse samples), so the first pass need not test them again.
  const known: (boolean | undefined)[] = [cw[0]];
  for (let k = 1; k < coarse.length; k++) {
    const a = coarse[k - 1], b = coarse[k];
    if (cw[k - 1] || cw[k] || (k + 1 < coarse.length && cw[k + 1]) || (k > 1 && cw[k - 2])) {
      for (let t = 1; t <= 4; t++) {
        pts.push(t === 4 ? b : [a[0] + ((b[0] - a[0]) * t) / 4, a[1] + ((b[1] - a[1]) * t) / 4]);
        known.push(t === 4 ? cw[k] : undefined);
      }
    } else {
      pts.push(b);
      known.push(cw[k]);
    }
  }

  // Within the towns at either end the town plan routes the streets; only the open country counts.
  const s0 = line[0], s1 = line[line.length - 1];
  const kmFrom = (p: number[], q: number[]) => Math.hypot((p[0] - q[0]) * Math.cos((p[1] * Math.PI) / 180), p[1] - q[1]) * 111.2;
  const inTown = pts.map((p) => kmFrom(p, s0) < startKm || kmFrom(p, s1) < endKm);
  const wetAt = (k: number) => !inTown[k] && wet(pts[k][0], pts[k][1]);

  // Nudge wet points to the nearest land within maxKm, then 60 m further inland.
  const nudge = (p: number[], maxKm: number): boolean => {
    const kmLon = kmLat / Math.max(0.05, Math.cos((p[1] * Math.PI) / 180));
    for (let r = 0.05; r <= maxKm; r *= 1.4) {
      for (let q = 0; q < 12; q++) {
        const a = (q / 12) * 2 * Math.PI;
        const x = p[0] + Math.cos(a) * r * kmLon, y = p[1] + Math.sin(a) * r * kmLat;
        if (wet(x, y)) continue;
        const x2 = p[0] + Math.cos(a) * (r + 0.06) * kmLon, y2 = p[1] + Math.sin(a) * (r + 0.06) * kmLat;
        const inland = !wet(x2, y2);
        p[0] = inland ? x2 : x;
        p[1] = inland ? y2 : y;
        return true;
      }
    }
    return false;
  };
  // Only short wet runs (a bay or a cut corner) are worth pulling ashore; a long one is open
  // water, where the road will break instead.
  for (let pass = 0; pass < 2; pass++) {
    const isWet = pts.map((_, k) => k > 0 && k < pts.length - 1 && !inTown[k] && (pass === 0 && known[k] !== undefined ? known[k]! : wetAt(k)));
    let moved = false;
    for (let k = 1; k < pts.length - 1;) {
      if (!isWet[k]) {
        k++;
        continue;
      }
      let e = k;
      while (e + 1 < pts.length - 1 && isWet[e + 1]) e++;
      const runKm = (e - k + 1) * stepKm;
      if (runKm <= 4) {
        for (let q = k; q <= e; q++) if (nudge(pts[q], Math.min(3, 0.6 + runKm))) moved = true;
      }
      k = e + 1;
    }
    if (!moved) break;
    // Ease the nudged line (endpoints fixed); the second pass catches anything eased back out.
    for (let k = 1; k < pts.length - 1; k++) {
      pts[k] = [(pts[k - 1][0] + 2 * pts[k][0] + pts[k + 1][0]) / 4, (pts[k - 1][1] + 2 * pts[k][1] + pts[k + 1][1]) / 4];
    }
  }

  // Break the road at any long water crossing that is left.
  const finalWet = pts.map((_, k) => k > 0 && k < pts.length - 1 && wetAt(k));
  const pieces: number[][][] = [];
  const segKm = (k: number) => {
    const a = pts[k - 1], b = pts[k];
    return Math.hypot((b[0] - a[0]) * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180), b[1] - a[1]) * 111.2;
  };
  // A crossing spans from the first wet point until 300 m of dry land, so hopping across an
  // archipelago by its islets still counts as one long crossing.
  const ISLET_KM = 0.3;
  let cur: number[][] = [pts[0]];
  let span = 0, dryKm = 0, runStart = -1;
  for (let k = 1; k < pts.length; k++) {
    const d = segKm(k);
    if (k < pts.length - 1 && finalWet[k]) {
      if (span === 0) runStart = cur.length - 1;
      span += d;
      dryKm = 0;
    } else if (span > 0) {
      dryKm += d;
      span += d;
      if (dryKm >= ISLET_KM) span = dryKm = 0;
    }
    cur.push(pts[k]);
    if ((span - dryKm) * 1000 > S.roadMaxBridgeM) {
      // Close the piece at the shore where this crossing began; resume once back on solid land.
      const head = cur.slice(0, runStart + 1);
      if (head.length >= 2) pieces.push(head);
      let acc = 0;
      while (k + 1 < pts.length && acc < ISLET_KM) {
        k++;
        acc = finalWet[k] ? 0 : acc + segKm(k);
      }
      cur = [pts[k]];
      span = dryKm = 0;
    }
  }
  if (cur.length >= 2) pieces.push(cur);
  // Drop stubs too short to matter.
  return pieces.filter((pc) => pc.length >= 3);
}
