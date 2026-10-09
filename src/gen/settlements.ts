import { type Grid, distKm, neighbor, pxPerMeterZ20, smoothstep } from './grid';
import { MinHeap } from './heap';
import { hash32 } from './rng';
import { Biome } from './biomes';
import { HYDROLOGY, SETTLEMENTS as S } from './config';
import type { FlowRouting } from './hydrology';
import type { DetailSampler } from './detail';
import { chaikin, riverVertex, riverWidthM } from './rivers';

export type Tier = 'city' | 'town' | 'village';
export type VillageKind = 'farming' | 'fishing' | 'logging' | 'mining' | 'monastery' | 'keep';

export interface Settlement {
  id: string;
  tier: Tier;
  /** Villages only. */
  kind?: VillageKind;
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
}

export type RoadClass = 'major' | 'minor' | 'track';

export interface RoadFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: number[][] };
  /** a/b: settlement ids at the start/end ('' where a track joins another road). */
  properties: { cls: RoadClass; a: string; b: string; ppm20: number };
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
  for (const c of cand) {
    if (score[c] < S.cityMinScore || nearCity[c] || nearTown[c]) continue;
    sites.push({ c, tier: 'city' });
    stamp(nearCity, c, S.citySpacingKm);
    stamp(nearTown, c, S.townSpacingKm);
  }
  for (const c of cand) {
    if (nearTown[c]) continue;
    sites.push({ c, tier: 'town' });
    stamp(nearTown, c, S.townSpacingKm);
  }

  let nCity = 0, nTown = 0;
  const settlements: Settlement[] = sites.map(({ c, tier }) => {
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
    return s;
  });
  const cells = sites.map((s) => s.c);
  const roads = buildRoads(g, f, seed, isRiver, settlements, cells);
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
  g: Grid, f: SettlementFields, seed: number, isRiver: Uint8Array, sts: Settlement[], cells: number[],
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
  const features: RoadFeature[] = [];
  let search = 0;

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
    const line = trimEnds(chaikin(pts, S.roadSmoothing), sa.radiusM / 1000, sb.radiusM / 1000);
    if (!line) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: line },
      properties: { cls: job.cls, a: sa.id, b: sb.id, ppm20: pxPerMeterZ20(line[line.length >> 1][1]) },
    });
  }
  return { type: 'FeatureCollection', features };
}
