import { hash32, hashString } from '../gen/rng';
import { Biome, BIOME_COLORS } from '../gen/biomes';
import { CLIMATE } from '../gen/config';
import type { RasterWorld } from '../gen/world';
import { hexToRgb, type RGB } from './palette';

/** Hand-drawn "fantasy map" styling: parchment, inked coasts with ripple lines, and map symbols. */
export const FANTASY = {
  /** Tile render margin (px) so coast distances and symbols match across tile edges. */
  marginPx: 16,
  /** Mountain and hill symbols are drawn up to this zoom; beyond it contours and rock stipple take over. */
  maxIconZoom: 11,
  /** Trees and marsh tufts keep going (growing a little) up to the deepest tile zoom. */
  maxTreeZoom: 18,
  rippleRadiiPx: [4, 8, 13],
  rippleAlpha: [0.6, 0.4, 0.22],
  grain: 0.07,
};

export const PARCHMENT = hexToRgb('#ede0bd');
export const SEPIA = hexToRgb('#7a5c3a');
export const INK = hexToRgb('#3f3126');
export const WATER = hexToRgb('#b6ccd0');
export const WATER_DEEP = hexToRgb('#9cb8c1');
export const RIPPLE = hexToRgb('#5f7f88');
export const FANTASY_SNOW = hexToRgb('#f7f5ef');
export const FANTASY_ICE = hexToRgb('#e4ecee');
const MOUNTAIN_LIGHT = hexToRgb('#f3ead2');
const MOUNTAIN_SHADE = hexToRgb('#c8b289');
const SNOW_SHADE = hexToRgb('#d9dde0');
const HILL_FILL = hexToRgb('#e7d9b1');
const TREE = hexToRgb('#a2b77c');
const TREE_SHADE = hexToRgb('#80975f');
const CONIFER = hexToRgb('#7f9c74');
const CONIFER_SHADE = hexToRgb('#62805b');
const MARSH = hexToRgb('#5d7c6b');
export const RIVER_FILL = hexToRgb('#adc6cd');
export const RIVER_INK = hexToRgb('#34505e');
export const RIVER_THIN = hexToRgb('#46687a');
export const CONTOUR = hexToRgb('#8a6a46');

const lerpStops = (stops: number[][], z: number, k: number) => {
  if (z <= stops[0][0]) return stops[0][k];
  for (let i = 1; i < stops.length; i++) {
    if (z <= stops[i][0]) {
      const t = (z - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      return stops[i - 1][k] + (stops[i][k] - stops[i - 1][k]) * t;
    }
  }
  return stops[stops.length - 1][k];
};
/** [zoom, base px, px per discharge order]: rivers grow bolder to zoom 11, then hand over to their true width. */
const RIVER_MIN_W = [[2, 0.7, 0.25], [5, 1.2, 0.45], [8, 1.9, 0.6], [11, 2.6, 0.75], [13, 2.2, 0.5], [15, 1.5, 0.2], [17, 1, 0.05]];

/** Narrowest a river of this order is drawn (px, full width) at an effective tile zoom. */
export function riverMinWidthPx(z: number, order: number): number {
  return lerpStops(RIVER_MIN_W, z, 1) + lerpStops(RIVER_MIN_W, z, 2) * order;
}

/** Only the big rivers show on the globe; the rest appear as you zoom in. */
export function riverVisibility(z: number, order: number): number {
  return Math.min(1, Math.max(0, order + 1 - (5 - z)));
}

const CONTOUR_STEPS = [2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500];

/** Contour interval (m) for an effective tile zoom: about one line per ~6 px on an 8% slope. */
export function contourInterval(z: number): number {
  const target = 0.5 * (40075016 / (256 * 2 ** z));
  return CONTOUR_STEPS.find((v) => v >= target) ?? 1000;
}

/** Biome colours washed toward parchment. */
export const FANTASY_BIOME_RGB = new Float32Array(
  Object.values(BIOME_COLORS).flatMap((c) => {
    const rgb = hexToRgb(c);
    return rgb.map((v, k) => v + (PARCHMENT[k] - v) * 0.6);
  }),
);

/**
 * Chamfer distance (px) from every pixel whose mask equals `from` to the nearest pixel where it
 * doesn't; 0 on the other side. Two passes, ~exact for small distances.
 */
export function maskDistance(mask: Uint8Array, W: number, H: number, from: number): Float32Array {
  const d = new Float32Array(W * H);
  for (let c = 0; c < W * H; c++) d[c] = mask[c] === from ? 1e6 : 0;
  const D = Math.SQRT2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = y * W + x;
      if (d[c] === 0) continue;
      let v = d[c];
      if (x > 0) v = Math.min(v, d[c - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[c - W] + 1);
        if (x > 0) v = Math.min(v, d[c - W - 1] + D);
        if (x < W - 1) v = Math.min(v, d[c - W + 1] + D);
      }
      d[c] = v;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const c = y * W + x;
      if (d[c] === 0) continue;
      let v = d[c];
      if (x < W - 1) v = Math.min(v, d[c + 1] + 1);
      if (y < H - 1) {
        v = Math.min(v, d[c + W] + 1);
        if (x < W - 1) v = Math.min(v, d[c + W + 1] + D);
        if (x > 0) v = Math.min(v, d[c + W - 1] + D);
      }
      d[c] = v;
    }
  }
  return d;
}

/** Deterministic paper grain in [-1, 1] for a global pixel. */
export function grain(gx: number, gy: number): number {
  return (hash32((gx * 1973) ^ (gy * 9277) ^ 0x5bd1e995) / 4294967296) * 2 - 1;
}

// ---------------------------------------------------------------------------------------------
// Map symbols

export interface IconContext {
  z: number;
  /** Global pixel of the tile's top-left corner at this zoom. */
  originX: number;
  originY: number;
  size: number;
}

const DEG = Math.PI / 180;
const LAPSE = CLIMATE.lapseRateCPerKm / 1000;
const FORESTS: Partial<Record<Biome, { density: number; conifer: boolean }>> = {
  [Biome.TropicalRainforest]: { density: 0.95, conifer: false },
  [Biome.TemperateRainforest]: { density: 0.9, conifer: true },
  [Biome.TemperateForest]: { density: 0.8, conifer: false },
  [Biome.TropicalDryForest]: { density: 0.55, conifer: false },
  [Biome.BorealForest]: { density: 0.8, conifer: true },
  [Biome.MontaneForest]: { density: 0.75, conifer: true },
  [Biome.Mangrove]: { density: 0.7, conifer: false },
  [Biome.Riparian]: { density: 0.35, conifer: false },
  [Biome.Savanna]: { density: 0.1, conifer: false },
  [Biome.Shrubland]: { density: 0.18, conifer: false },
};

class WorldSampler {
  constructor(private w: RasterWorld) {}

  private coords(lon: number, lat: number) {
    const { W, H } = this.w;
    const fx = ((lon + 180) / 360) * W - 0.5;
    const fy = Math.min(H - 1.001, Math.max(0, ((90 - lat) / 180) * H - 0.5));
    const i0 = Math.floor(fx), j0 = Math.floor(fy);
    const a = ((i0 % W) + W) % W;
    return { a, b: (a + 1) % W, r0: j0 * W, r1: Math.min(H - 1, j0 + 1) * W, tx: fx - i0, ty: fy - j0 };
  }

  bilinear(f: Float32Array, lon: number, lat: number): number {
    const { a, b, r0, r1, tx, ty } = this.coords(lon, lat);
    return (f[r0 + a] * (1 - tx) + f[r0 + b] * tx) * (1 - ty) + (f[r1 + a] * (1 - tx) + f[r1 + b] * tx) * ty;
  }

  nearest(lon: number, lat: number): number {
    const { a, b, r0, r1, tx, ty } = this.coords(lon, lat);
    return (ty < 0.5 ? r0 : r1) + (tx < 0.5 ? a : b);
  }
}

type Draw = () => void;

/** Draws mountains, hills, trees and marsh tufts on a jittered grid anchored in global pixel space. */
export function drawIcons(
  out: Uint8ClampedArray, w: number, h: number, ctx: IconContext, world: RasterWorld,
  clear: (x: number, y: number, r: number) => boolean = () => true,
): void {
  if (ctx.z > FANTASY.maxTreeZoom) return;
  const terrainIcons = ctx.z <= FANTASY.maxIconZoom;
  // Past the last mountain zoom trees grow a little and spread out, so forests still read as forests.
  const grow = Math.min(1.8, 1 + 0.13 * Math.max(0, ctx.z - FANTASY.maxIconZoom));
  const sampler = new WorldSampler(world);
  const seed = hashString(world.seed + '#icons');
  const worldPx = ctx.size * 2 ** ctx.z;
  const margin = 24;
  const icons: { y: number; draw: Draw }[] = [];

  const scan = (cell: number, salt: number, place: (gx: number, gy: number, lon: number, lat: number, r: number, r2: number) => Draw | null) => {
    const nCells = worldPx / cell;
    const gx0 = Math.floor((ctx.originX - margin) / cell), gx1 = Math.floor((ctx.originX + w + margin) / cell);
    const gy0 = Math.max(0, Math.floor((ctx.originY - margin) / cell));
    const gy1 = Math.min(nCells - 1, Math.floor((ctx.originY + h + margin) / cell));
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const wrapped = ((gx % nCells) + nCells) % nCells;
        const hsh = hash32((wrapped * 73856093) ^ (gy * 19349663) ^ ((ctx.z + 1) * 83492791) ^ seed ^ salt);
        const px = (gx + 0.15 + 0.7 * ((hsh & 0xffff) / 65535)) * cell;
        const py = (gy + 0.15 + 0.7 * ((hsh >>> 16) / 65535)) * cell;
        const lon = (px / worldPx) * 360 - 180;
        const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / worldPx))) / DEG;
        const r2 = hash32(hsh ^ 0x9e3779b9);
        const draw = place(px - ctx.originX, py - ctx.originY, lon, lat, (r2 & 0xffff) / 65535, (r2 >>> 16) / 65535);
        if (draw) icons.push({ y: py, draw });
      }
    }
  };

  const landAt = (lon: number, lat: number) => {
    const c = sampler.nearest(lon, lat);
    return world.lakeDepth[c] > 0 ? -1 : sampler.bilinear(world.height, lon, lat);
  };

  if (terrainIcons) scan(16, 0x1111, (x, y, lon, lat, r, r2) => {
    const hgt = landAt(lon, lat);
    if (hgt < 1100 || r > smoothstep(1100, 2300, hgt)) return null;
    const mw = 12 + 10 * smoothstep(1800, 4500, hgt) + 3 * r2;
    const mh = mw * (0.62 + 0.3 * r2);
    const snowy = sampler.bilinear(world.tempSea, lon, lat) - LAPSE * (hgt + 900) < -2;
    if (!clear(x, y - mh * 0.3, mw * 0.35)) return null;
    return () => drawMountain(out, w, h, x, y, mw, mh, snowy);
  });

  if (terrainIcons) scan(16, 0x2222, (x, y, lon, lat, r) => {
    const hgt = landAt(lon, lat);
    if (r > 0.3 * smoothstep(450, 800, hgt) * (1 - smoothstep(1100, 1300, hgt))) return null;
    if (!clear(x, y - 1.5, 6)) return null;
    return () => drawHill(out, w, h, x, y, 5.5, 3.2);
  });

  scan(8, 0x3333, (x, y, lon, lat, r, r2) => {
    const hgt = landAt(lon, lat);
    if (hgt < 30 || hgt > 2400) return null;
    if (!clear(x, y - 2 * grow, 3 * grow + 1)) return null;
    // Dither the biome lookup by up to ±0.7 cells so forest edges don't trace the grid.
    const frac = (v: number) => v - Math.floor(v);
    const c = sampler.nearest(
      lon + (frac(r2 * 9301.7) - 0.5) * 1.4 * (360 / world.W),
      lat + (frac(r * 4271.3) - 0.5) * 1.4 * (180 / world.H),
    );
    const b = world.biome[c] as Biome;
    if (b === Biome.Wetland) {
      return r < 0.45 / grow ? () => drawTuft(out, w, h, x, y) : null;
    }
    const f = FORESTS[b];
    if (!f || r > f.density / (grow * grow)) return null;
    return f.conifer
      ? () => drawTriangle(out, w, h, x, y, (4.6 + r2) * grow, (6.5 + 1.5 * r2) * grow, CONIFER, CONIFER_SHADE, false)
      : () => drawTree(out, w, h, x, y, (2.6 + 0.8 * r2) * grow);
  });

  icons.sort((p, q) => p.y - q.y);
  for (const icon of icons) icon.draw();
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function blend(out: Uint8ClampedArray, w: number, h: number, x: number, y: number, rgb: RGB, a: number): void {
  if (a <= 0 || x < 0 || y < 0 || x >= w || y >= h) return;
  const o = (y * w + x) * 4;
  out[o] += (rgb[0] - out[o]) * a;
  out[o + 1] += (rgb[1] - out[o + 1]) * a;
  out[o + 2] += (rgb[2] - out[o + 2]) * a;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Peak with a lit left flank, hatched shaded right flank, inked outline and optional snow cap. */
function drawMountain(out: Uint8ClampedArray, w: number, h: number, cx: number, cy: number, mw: number, mh: number, snowy: boolean): void {
  drawTriangle(out, w, h, cx, cy, mw, mh, MOUNTAIN_LIGHT, MOUNTAIN_SHADE, true, snowy);
}

function drawTriangle(
  out: Uint8ClampedArray, w: number, h: number, cx: number, cy: number, tw: number, th: number,
  light: RGB, shade: RGB, hatch: boolean, snowy = false,
): void {
  const ax = cx, ay = cy - th, lx = cx - tw / 2, rx = cx + tw / 2;
  const lenL = Math.hypot(tw / 2, th), lenR = lenL;
  const x0 = Math.floor(lx - 1), x1 = Math.ceil(rx + 1), y0 = Math.floor(ay - 1), y1 = Math.ceil(cy + 0.5);
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const X = px + 0.5, Y = py + 0.5;
      // Signed distances to the two flanks, positive inside.
      const dL = ((X - lx) * th + (Y - cy) * (tw / 2)) / lenL;
      const dR = ((rx - X) * th + (Y - cy) * (tw / 2)) / lenR;
      const dB = cy - Y;
      const inside = Math.min(dL, dR, dB + 0.5);
      const fill = clamp01(inside + 0.5);
      // Shade the flank right of a ridge line running from the peak down and slightly right.
      const ridgeX = ax + (Y - ay) * 0.12;
      const shaded = X > ridgeX;
      const capped = snowy && Y < ay + th * 0.38;
      const base = capped ? (shaded ? SNOW_SHADE : FANTASY_SNOW) : shaded ? shade : light;
      blend(out, w, h, px, py, base, fill);
      if (hatch && shaded && !capped && fill > 0.5 && ((X * 0.7 + Y) % 2.6) < 0.7) blend(out, w, h, px, py, INK, 0.28 * fill);
      const edge = Math.min(Math.abs(dL), Math.abs(dR));
      if (dB > -0.3) blend(out, w, h, px, py, INK, 0.85 * clamp01(1.1 - edge) * clamp01(dB + 1));
    }
  }
}

function drawHill(out: Uint8ClampedArray, w: number, h: number, cx: number, cy: number, rx: number, ry: number): void {
  for (let py = Math.floor(cy - ry - 1); py <= Math.ceil(cy); py++) {
    for (let px = Math.floor(cx - rx - 1); px <= Math.ceil(cx + rx + 1); px++) {
      const X = px + 0.5, Y = py + 0.5;
      if (Y > cy + 0.5) continue;
      const e = Math.hypot((X - cx) / rx, (Y - cy) / ry);
      blend(out, w, h, px, py, HILL_FILL, clamp01((1 - e) * Math.min(rx, ry) + 0.5) * 0.9);
      blend(out, w, h, px, py, INK, 0.75 * clamp01(1 - Math.abs(e - 1) * Math.min(rx, ry)));
    }
  }
}

function drawTree(out: Uint8ClampedArray, w: number, h: number, cx: number, cy: number, r: number): void {
  const ccy = cy - r;
  for (let py = Math.floor(ccy - r - 1); py <= Math.ceil(cy + 1); py++) {
    for (let px = Math.floor(cx - r - 1); px <= Math.ceil(cx + r + 1); px++) {
      const X = px + 0.5, Y = py + 0.5;
      const d = Math.hypot(X - cx, Y - ccy);
      const fill = clamp01(r - d + 0.5);
      blend(out, w, h, px, py, X > cx + r * 0.2 ? TREE_SHADE : TREE, fill);
      blend(out, w, h, px, py, INK, 0.7 * clamp01(1 - Math.abs(d - r) * 1.2));
      // Short trunk below the canopy.
      if (Math.abs(X - cx) < 0.6 && Y > ccy + r && Y < cy + 1) blend(out, w, h, px, py, INK, 0.7);
    }
  }
}

function drawTuft(out: Uint8ClampedArray, w: number, h: number, cx: number, cy: number): void {
  const x = Math.round(cx), y = Math.round(cy);
  for (const dx of [-2, 0, 2]) {
    const len = dx === 0 ? 3 : 2;
    for (let k = 0; k < len; k++) blend(out, w, h, x + dx, y - k, MARSH, 0.75);
  }
  for (let dx = -3; dx <= 3; dx++) blend(out, w, h, x + dx, y + 1, MARSH, 0.45);
}
