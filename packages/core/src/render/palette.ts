export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export interface Ramp {
  min: number;
  max: number;
  lut: Float32Array;
  size: number;
}

/** Piecewise-linear colour ramp baked into a lookup table. */
export function makeRamp(stops: [number, string][], size = 512): Ramp {
  const min = stops[0][0], max = stops[stops.length - 1][0];
  const cols = stops.map(([, c]) => hexToRgb(c));
  const lut = new Float32Array(size * 3);
  for (let s = 0; s < size; s++) {
    const v = min + ((max - min) * s) / (size - 1);
    let k = 0;
    while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
    const span = stops[k + 1][0] - stops[k][0];
    const t = span > 0 ? Math.min(1, Math.max(0, (v - stops[k][0]) / span)) : 0;
    for (let ch = 0; ch < 3; ch++) lut[s * 3 + ch] = cols[k][ch] + (cols[k + 1][ch] - cols[k][ch]) * t;
  }
  return { min, max, lut, size };
}

export function sampleRamp(r: Ramp, v: number, out: Float64Array): void {
  let k = Math.round(((v - r.min) / (r.max - r.min)) * (r.size - 1));
  if (k < 0) k = 0;
  else if (k >= r.size) k = r.size - 1;
  out[0] = r.lut[k * 3];
  out[1] = r.lut[k * 3 + 1];
  out[2] = r.lut[k * 3 + 2];
}

export const OCEAN_RAMP = makeRamp([
  [-7000, '#0d2240'],
  [-3500, '#16365e'],
  [-1200, '#245482'],
  [-150, '#3b7aa3'],
  [0, '#5a9bb8'],
]);

export const ELEVATION_RAMP = makeRamp([
  [0, '#3f7a44'],
  [300, '#86ad5b'],
  [800, '#d4c87c'],
  [1600, '#bf8a4d'],
  [2600, '#8c5a3c'],
  [4000, '#d9d2ca'],
  [6500, '#ffffff'],
]);

export const TEMPERATURE_RAMP = makeRamp([
  [-35, '#2b0f6b'],
  [-18, '#3b5ec9'],
  [0, '#a7d3f0'],
  [10, '#f3efb0'],
  [20, '#f6a24a'],
  [30, '#c42a1f'],
  [40, '#6b0010'],
]);

export const PRECIP_RAMP = makeRamp([
  [0, '#9c5a2e'],
  [250, '#e0bf6c'],
  [500, '#d8df8a'],
  [1000, '#8cc66a'],
  [2000, '#3a9a5a'],
  [3000, '#1c6aa8'],
  [4500, '#12307a'],
]);

export const LAKE_RGB = hexToRgb('#4f8db6');
export const ROCK_RGB = hexToRgb('#857a6e');
export const SNOW_RGB = hexToRgb('#f4f6f9');
export const SEA_ICE_RGB = hexToRgb('#dfe9f0');

/** Distinct plate colours via golden-ratio hue spacing. */
export function plateColor(k: number): RGB {
  const hue = (k * 0.618033988749895) % 1;
  const s = 0.55, l = 0.55;
  const f = (n: number) => {
    const kk = (n + hue * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(kk - 3, 9 - kk, 1));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
