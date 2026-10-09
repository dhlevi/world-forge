import { type Grid, neighbor } from './grid';
import { MinHeap } from './heap';
import type { FlowRouting } from './hydrology';
import { BIOMES as B, HYDROLOGY } from './config';

export enum Biome {
  IceSheet,
  Tundra,
  BorealForest,
  ColdDesert,
  Grassland,
  Shrubland,
  TemperateForest,
  TemperateRainforest,
  HotDesert,
  Savanna,
  TropicalDryForest,
  TropicalRainforest,
  Alpine,
  MontaneForest,
  Wetland,
  Mangrove,
  Riparian,
  SaltFlat,
}

export const BIOME_NAMES: Record<Biome, string> = {
  [Biome.IceSheet]: 'Glacier / ice sheet',
  [Biome.Tundra]: 'Tundra',
  [Biome.BorealForest]: 'Boreal forest',
  [Biome.ColdDesert]: 'Cold desert / steppe',
  [Biome.Grassland]: 'Temperate grassland',
  [Biome.Shrubland]: 'Shrubland / woodland',
  [Biome.TemperateForest]: 'Temperate forest',
  [Biome.TemperateRainforest]: 'Temperate rainforest',
  [Biome.HotDesert]: 'Hot desert',
  [Biome.Savanna]: 'Savanna',
  [Biome.TropicalDryForest]: 'Tropical dry forest',
  [Biome.TropicalRainforest]: 'Tropical rainforest',
  [Biome.Alpine]: 'Alpine meadow',
  [Biome.MontaneForest]: 'Montane forest',
  [Biome.Wetland]: 'Wetland / marsh',
  [Biome.Mangrove]: 'Mangrove',
  [Biome.Riparian]: 'River valley / oasis',
  [Biome.SaltFlat]: 'Salt flat',
};

export const BIOME_COLORS: Record<Biome, string> = {
  [Biome.IceSheet]: '#eef3f7',
  [Biome.Tundra]: '#a6aa8c',
  [Biome.BorealForest]: '#4d6948',
  [Biome.ColdDesert]: '#b9ad8c',
  [Biome.Grassland]: '#aab66c',
  [Biome.Shrubland]: '#9c9a5e',
  [Biome.TemperateForest]: '#5e8a45',
  [Biome.TemperateRainforest]: '#3e6d49',
  [Biome.HotDesert]: '#dcc38c',
  [Biome.Savanna]: '#b8a95c',
  [Biome.TropicalDryForest]: '#71993f',
  [Biome.TropicalRainforest]: '#2f6a35',
  [Biome.Alpine]: '#98a283',
  [Biome.MontaneForest]: '#3c5e4b',
  [Biome.Wetland]: '#5a7f66',
  [Biome.Mangrove]: '#3b6a52',
  [Biome.Riparian]: '#7d9c4a',
  [Biome.SaltFlat]: '#d8cfba',
};

/**
 * Whittaker-style classification from annual mean temperature (°C), warmest-month temperature
 * (°C) and precipitation (mm/yr). Trees need a warmest month of at least 10 °C (the treeline);
 * ice needs summers below freezing, or cold summers with heavy snowfall.
 */
export function classifyClimate(t: number, tWarm: number, p: number): Biome {
  if (tWarm < 0 || (t < B.glacierTempC && tWarm < B.glacierMaxWarmC && p >= B.glacierMinPrecipMm)) return Biome.IceSheet;
  if (tWarm < 10) return Biome.Tundra;
  if (t < 5) return p < 200 ? Biome.ColdDesert : Biome.BorealForest;
  if (t < 18) {
    if (p < 250) return Biome.ColdDesert;
    if (p < 500) return Biome.Grassland;
    if (p < 900) return Biome.Shrubland;
    if (p < 2000) return Biome.TemperateForest;
    return Biome.TemperateRainforest;
  }
  if (p < 300) return Biome.HotDesert;
  if (p < 900) return Biome.Savanna;
  if (p < 1800) return Biome.TropicalDryForest;
  return Biome.TropicalRainforest;
}

const FORESTS = new Set([Biome.TemperateForest, Biome.TemperateRainforest, Biome.TropicalDryForest, Biome.TropicalRainforest]);
const ARID = new Set([Biome.HotDesert, Biome.ColdDesert, Biome.Savanna, Biome.Grassland, Biome.Shrubland]);

export interface BiomeInputs {
  height: Float32Array;
  temp: Float32Array;
  /** Warmest-month temperature, °C. */
  tempWarm: Float32Array;
  precip: Float32Array;
  flow: FlowRouting;
  /** Precipitation-weighted drainage area, km². */
  acc: Float32Array;
  lakeDepth: Float32Array;
  /** Depth (m) of sediment that filled a closed basin; arid filled basins become playas. */
  sedimentFill: Float32Array;
}

/** Distance (km) over land from the nearest source cell, up to maxKm (Infinity beyond). */
function landDistance(g: Grid, height: Float32Array, isSource: (c: number) => boolean, maxKm: number): Float32Array {
  const { W, N } = g;
  const dist = new Float32Array(N).fill(Infinity);
  const heap = new MinHeap(1 << 14);
  for (let c = 0; c < N; c++) {
    if (isSource(c)) {
      dist[c] = 0;
      heap.push(c, 0);
    }
  }
  while (heap.size > 0) {
    const c = heap.pop();
    const d = heap.lastKey;
    if (d > dist[c]) continue;
    const i = c % W, j = (c / W) | 0;
    for (let k = 0; k < 8; k++) {
      const n = neighbor(g, i, j, k);
      if (n < 0 || height[n] <= 0) continue;
      const nd = d + g.nbDist[j * 8 + k];
      if (nd <= maxKm && nd < dist[n]) {
        dist[n] = nd;
        heap.push(n, nd);
      }
    }
  }
  return dist;
}

/**
 * Climate biome per cell, refined by terrain and water: altitude zones (alpine above the
 * treeline, montane forest on wet slopes), wetlands on flat floodplains and lakeshores,
 * mangroves on hot wet coasts, green river valleys through dry land, and salt flats in
 * closed basins too dry to hold a lake. Corridor widths are in km so coverage is
 * resolution independent.
 */
export function classifyBiomes(g: Grid, inp: BiomeInputs): Uint8Array {
  const { W, H, N } = g;
  const { height, temp, tempWarm, precip, flow, acc, lakeDepth, sedimentFill } = inp;
  const riverDist = landDistance(
    g, height, (c) => height[c] > 0 && acc[c] >= B.floodplainMinAccKm2, B.floodplainHalfWidthKm,
  );
  // Measured from ocean cell centres, so subtract half a cell to approximate distance from the shore.
  const coastDist = landDistance(g, height, (c) => height[c] <= 0, B.mangroveBandKm + g.dyKm / 2);
  const out = new Uint8Array(N);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const c = j * W + i;
      const h = height[c], t = temp[c], p = precip[c];
      let b = classifyClimate(t, tempWarm[c], p);
      out[c] = b;
      if (h <= 0 || b === Biome.IceSheet) continue;

      const r = flow.recv[c];
      const slope = r !== c && flow.recvDist[c] > 0 ? Math.max(0, h - Math.max(0, height[r])) / flow.recvDist[c] : 0;
      let lakeside = false;
      for (let k = 0; k < 8; k++) {
        const n = neighbor(g, i, j, k);
        if (n >= 0 && lakeDepth[n] > 0) lakeside = true;
      }
      const flat = slope < B.wetlandMaxSlopeMPerKm;
      const floodplain = riverDist[c] <= B.floodplainHalfWidthKm;
      const coastal = coastDist[c] - g.dyKm / 2 <= B.mangroveBandKm;
      const closedBasin = flow.filled[c] - h >= HYDROLOGY.lakeMinDepthM || sedimentFill[c] >= B.saltFlatMinFillM;

      if (closedBasin && p < HYDROLOGY.lakeMinPrecipMm && t > 0) b = Biome.SaltFlat;
      else if (coastal && slope < B.mangroveMaxSlopeMPerKm && t >= B.mangroveMinTempC && p >= B.mangroveMinPrecipMm) b = Biome.Mangrove;
      else if (flat && t > 0 && p >= B.wetlandMinPrecipMm && h < B.wetlandMaxElevationM && (floodplain || lakeside)) b = Biome.Wetland;
      else if (ARID.has(b) && floodplain) b = Biome.Riparian;
      else if (b === Biome.Tundra && h >= B.alpineMinElevationM) b = Biome.Alpine;
      else if (FORESTS.has(b) && h >= B.montaneMinElevationM) b = Biome.MontaneForest;
      out[c] = b;
    }
  }
  return out;
}
