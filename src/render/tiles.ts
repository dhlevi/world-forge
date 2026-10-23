import { Simplex3 } from '../gen/noise';
import { hashString, mulberry32 } from '../gen/rng';
import { EARTH_RADIUS_KM, smoothstep } from '../gen/grid';
import { Biome, BIOME_COLORS } from '../gen/biomes';
import { KOPPEN_CLASSES } from '../gen/koppen';
import { CLIMATE, RENDER as RC } from '../gen/config';
import type { RasterWorld } from '../gen/world';
import type { RiverCollection } from '../gen/rivers';
import { RIVER_REACH_M } from '../gen/detail';
import { MEANDER_MAX_M, RiverIndex, carveRiver, valleyM } from '../gen/river-index';
import {
  ELEVATION_RAMP, LAKE_RGB, OCEAN_RAMP, PRECIP_RAMP, ROCK_RGB, SEA_ICE_RGB, SNOW_RGB,
  TEMPERATURE_RAMP, hexToRgb, makeRamp, plateColor, sampleRamp,
} from './palette';
import {
  CONTOUR, FANTASY, FANTASY_BIOME_RGB, FANTASY_ICE, FANTASY_SNOW, INK, RIPPLE, RIVER_FILL, RIVER_INK, RIVER_THIN,
  SEPIA, WATER, WATER_DEEP, contourInterval, drawIcons, grain, maskDistance, riverMinWidthPx, riverVisibility, type IconContext,
} from './fantasy';

export type LayerId = 'fantasy' | 'terrain' | 'biomes' | 'climate' | 'elevation' | 'temperature' | 'precipitation' | 'plates' | 'oldworld' | 'underworld';

export const LAYERS: { id: LayerId; label: string }[] = [
  { id: 'fantasy', label: 'Fantasy map' },
  { id: 'terrain', label: 'Terrain' },
  { id: 'biomes', label: 'Biomes' },
  { id: 'climate', label: 'Köppen climate' },
  { id: 'elevation', label: 'Elevation' },
  { id: 'temperature', label: 'Temperature' },
  { id: 'precipitation', label: 'Precipitation' },
  { id: 'plates', label: 'Tectonic plates' },
  { id: 'oldworld', label: 'Old & New World' },
  { id: 'underworld', label: 'Underworld' },
];

/** Underworld layer: the surface drawn dark and faint, for the caverns and tunnels above it. */
const UNDER_LOW = hexToRgb('#25211d'), UNDER_HIGH = hexToRgb('#4a4037'), UNDER_SEA = hexToRgb('#0b1016');

/**
 * Old & New World layer: Old World land shaded by when the spread from the heartland reached it
 * (dark early, pale late), New World land in teal, and the land that went the other way under the
 * whole-landmass rule in lighter tints (see gen/oldworld.ts).
 */
export const OLD_WORLD_RAMP = makeRamp([[1, '#6e2f10'], [90, '#b8591f'], [180, '#e3a04a'], [254, '#f7e2a6']]);
export const OLD_UNREACHED_RGB = hexToRgb('#d9c9a3');
export const NEW_WORLD_RGB = hexToRgb('#3d8a7c');
export const NEW_REACHED_RGB = hexToRgb('#93c9b9');
const HEARTLAND_RGB = hexToRgb('#1d1a17');

const BIOME_RGB = new Float32Array(Object.values(BIOME_COLORS).flatMap((c) => hexToRgb(c)));
const KOPPEN_RGB = new Float32Array(KOPPEN_CLASSES.flatMap((k) => hexToRgb(k.color)));
const LAPSE = CLIMATE.lapseRateCPerKm / 1000;
const DEG = Math.PI / 180;

function bilerp(f: ArrayLike<number>, o0: number, o1: number, a: number, b: number, tx: number, ty: number): number {
  return (f[o0 + a] * (1 - tx) + f[o0 + b] * tx) * (1 - ty) + (f[o1 + a] * (1 - tx) + f[o1 + b] * tx) * ty;
}

/** Special ground (gen/special.ts SP values): its colour on the map, and on the biome layer. */
const SP_RGB: number[][] = [[0, 0, 0], hexToRgb('#6f6a64'), hexToRgb('#3a312c'), hexToRgb('#e9f1f5'), hexToRgb('#8a6f9b'), hexToRgb('#b8693f'), [0, 0, 0], hexToRgb('#6b625a'), hexToRgb('#ddd59e'), hexToRgb('#66654a')];
const SP_ALPHA = [0, 0.78, 0.85, 0.9, 0.62, 0.55, 0, 0.28, 0.8, 0.68];
export const SP_LEGEND: [string, string][] = [['', ''], ['Ash land', '#77716b'], ['Lava field', '#3d302a'], ['Glacier', '#dfeaf2'], ['Mushroom forest', '#8b5fa0'], ['Canyon', '#b8693f'], ['Cliffs', '#5b4a3d'], ['Volcanic ground', '#857a70'], ['Geothermal field', '#e1d27a'], ['Cursed land', '#5e5c46']];
const SP_LEGEND_RGB = SP_LEGEND.map(([, c]) => (c ? hexToRgb(c) : [0, 0, 0]));
const BLIGHT = hexToRgb('#4f5a3a'), BLIGHT_PALE = hexToRgb('#9a9478'), LAVA_GLOW = hexToRgb('#d4541f'), CREVASSE = hexToRgb('#9ab9cf'), ASH_SPECK = hexToRgb('#3c3835'), FUNGAL_SPOT = hexToRgb('#4c9a8c'), FUNGAL_CAP = hexToRgb('#c97d54'), STRATA = hexToRgb('#e2b07a');

/**
 * Special ground over the biome colour: blended from the four surrounding cells (`sp`, weights
 * `wt`), with a texture of its own drawn in world coordinates (so it runs on across tiles): speckled
 * ash, lava with glowing veins, glacier ice with crevasses, mottled mushroom forest, banded canyon walls.
 */
function paintSpecial(col: Float64Array, sp: number[], wt: number[], lon: number, lat: number, hh: number, gx: number, gy: number): void {
  const acc = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let k = 0; k < 4; k++) if (sp[k]) acc[sp[k]] += wt[k];
  for (let t = 1; t < 10; t++) {
    const a = acc[t];
    if (a <= 0.02 || !SP_ALPHA[t]) continue;
    mix(col, SP_RGB[t], a * SP_ALPHA[t]);
    if (t === 1) {
      const n = Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453;
      if (n - Math.floor(n) > 0.82) mix(col, ASH_SPECK, 0.45 * a);
    } else if (t === 2) {
      const v = Math.abs(Math.sin(lon * 23 + 2 * Math.sin(lat * 31) + Math.sin(lon * 7 + lat * 11)));
      mix(col, LAVA_GLOW, a * 0.85 * Math.max(0, 1 - v / 0.09));
    } else if (t === 3) {
      const v = Math.abs(Math.sin(lon * 61 + lat * 17 + Math.sin(lat * 23)));
      mix(col, CREVASSE, a * 0.6 * Math.max(0, 1 - v / 0.07));
    } else if (t === 4) {
      const v = Math.sin(lon * 47) * Math.sin(lat * 53) + 0.5 * Math.sin(lon * 131 + lat * 97);
      if (v > 0.75) mix(col, FUNGAL_SPOT, a * 0.55);
      else if (v < -0.85) mix(col, FUNGAL_CAP, a * 0.5);
    } else if (t === 5) {
      mix(col, STRATA, a * 0.45 * (0.5 + 0.5 * Math.sin(hh / 45)));
    } else if (t === 9) {
      // Blight: sickly mottling, dark and pale by turns.
      const v = Math.sin(lon * 37 + Math.sin(lat * 29)) * Math.sin(lat * 41 + Math.sin(lon * 19));
      if (v > 0.45) mix(col, BLIGHT, a * 0.45);
      else if (v < -0.55) mix(col, BLIGHT_PALE, a * 0.35);
    }
  }
}

/**
 * A patch of special ground `t` for the map key, painted over grassland as the `layer` paints it
 * (the textures run at the scale of zoom 7); RGBA, `w` × `h` pixels.
 */
export function specialSwatch(t: number, w: number, h: number, layer: 'fantasy' | 'terrain' | 'biomes'): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  const col = new Float64Array(3);
  const tbl = layer === 'fantasy' ? FANTASY_BIOME_RGB : BIOME_RGB;
  const b = Biome.Grassland * 3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      col[0] = tbl[b]; col[1] = tbl[b + 1]; col[2] = tbl[b + 2];
      if (layer === 'biomes') {
        if (SP_LEGEND[t]?.[1] && t !== 6) mix(col, SP_LEGEND_RGB[t], t === 7 ? 0.5 : 1);
      } else {
        paintSpecial(col, [t, 0, 0, 0], [1, 0, 0, 0], 20 + x * 0.011, 10 - y * 0.011, 300 + y * 9, x, y);
      }
      const o = (y * w + x) * 4;
      out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; out[o + 3] = 255;
    }
  }
  return out;
}

function mix(col: Float64Array, rgb: ArrayLike<number>, t: number, offset = 0): void {
  col[0] += (rgb[offset] - col[0]) * t;
  col[1] += (rgb[offset + 1] - col[1]) * t;
  col[2] += (rgb[offset + 2] - col[2]) * t;
}

/** Per-pixel distances to the nearest river (see TileRenderer.riverField). */
interface RiverField {
  /** Signed distance (px) to the drawn bank (display width, never thinner than riverMinWidthPx). */
  bankPx: Float32Array;
  /** Drawn half-width (px) of that river, and its zoom visibility (0..1). */
  halfPx: Float32Array;
  vis: Float32Array;
  /** Signed distance (m) to the true bank, and the true half-width (m), for valley carving. */
  bankM: Float32Array;
  halfM: Float32Array;
}

/** Options for one render: which raster rivers to draw. */
export interface RenderOptions {
  rivers?: boolean;
}

const RIVER_TERRAIN = hexToRgb('#4a86b0');
const RIVER_TERRAIN_THIN = hexToRgb('#2f6e9e');

function catmullRom(t: number, out: Float64Array, o: number): void {
  const t2 = t * t, t3 = t2 * t;
  out[o] = (-t3 + 2 * t2 - t) / 2;
  out[o + 1] = (3 * t3 - 5 * t2 + 2) / 2;
  out[o + 2] = (-3 * t3 + 4 * t2 + t) / 2;
  out[o + 3] = (t3 - t2) / 2;
}

/**
 * Renders map tiles from the generated grid. Below the grid resolution, fractal detail
 * noise is added (more octaves at higher zoom) so coastlines and mountains keep revealing
 * structure as you zoom in. The detail is a pure function of position, so tiles agree
 * across zoom levels.
 */
export class TileRenderer {
  private noise: Simplex3;
  private lambda0Km: number;
  private plateRgb: Float32Array;
  private rivers: RiverIndex | null;

  constructor(private world: RasterWorld, rivers: RiverCollection | null = null) {
    this.rivers = rivers ? new RiverIndex(rivers, world.seed) : null;
    this.noise = new Simplex3(mulberry32(hashString(world.seed + '#detail')));
    this.lambda0Km = (2 * (2 * Math.PI * EARTH_RADIUS_KM)) / world.W;
    this.plateRgb = new Float32Array(256 * 3);
    for (let k = 0; k < 256; k++) this.plateRgb.set(plateColor(k), k * 3);
  }

  /** Web Mercator (XYZ) tile. */
  renderTile(z: number, x: number, y: number, layer: LayerId, size = 256, opts: RenderOptions = {}) {
    const n = 2 ** z;
    const B = layer === 'fantasy' ? FANTASY.marginPx : 1;
    const S = size + 2 * B;
    const lons = new Float64Array(S), lats = new Float64Array(S), px = new Float64Array(S);
    const equatorPxKm = (2 * Math.PI * EARTH_RADIUS_KM) / (size * n);
    for (let c = 0; c < S; c++) lons[c] = ((x + (c - B + 0.5) / size) / n) * 360 - 180;
    for (let r = 0; r < S; r++) {
      const my = (y + (r - B + 0.5) / size) / n;
      const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) / DEG;
      lats[r] = lat;
      px[r] = equatorPxKm * Math.cos(lat * DEG);
    }
    const proj = (lon: number, lat: number): [number, number] => {
      const my = ((1 - Math.asinh(Math.tan(Math.max(-85.06, Math.min(85.06, lat)) * DEG)) / Math.PI) / 2) * n;
      return [(((lon + 180) / 360) * n - x) * size + B - 0.5, (my - y) * size + B - 0.5];
    };
    const zEff = z + Math.log2(size / 256);
    return this.render(lons, lats, px, px, size, size, layer, B, { z, originX: x * size, originY: y * size, size }, proj, zEff, opts);
  }

  /** Whole-world equirectangular image (used by the preview script). */
  renderEquirect(width: number, height: number, layer: LayerId, opts: RenderOptions = { rivers: true }) {
    const B = layer === 'fantasy' ? FANTASY.marginPx : 1;
    const lons = new Float64Array(width + 2 * B), lats = new Float64Array(height + 2 * B);
    const pxX = new Float64Array(height + 2 * B), pxY = new Float64Array(height + 2 * B);
    for (let c = 0; c < width + 2 * B; c++) lons[c] = ((c - B + 0.5) / width) * 360 - 180;
    for (let r = 0; r < height + 2 * B; r++) {
      lats[r] = Math.max(-90, Math.min(90, 90 - ((r - B + 0.5) / height) * 180));
      pxX[r] = Math.max(1e-3, (2 * Math.PI * EARTH_RADIUS_KM * Math.abs(Math.cos(lats[r] * DEG))) / width);
      pxY[r] = (Math.PI * EARTH_RADIUS_KM) / height;
    }
    const proj = (lon: number, lat: number): [number, number] =>
      [((lon + 180) / 360) * width + B - 0.5, ((90 - lat) / 180) * height + B - 0.5];
    return this.render(lons, lats, pxX, pxY, width, height, layer, B, null, proj, Math.log2(width / 256), opts);
  }

  private render(
    lons: Float64Array, lats: Float64Array, pxX: Float64Array, pxY: Float64Array,
    w: number, h: number, layer: LayerId, B: number, icons: IconContext | null,
    proj: (lon: number, lat: number) => [number, number], zEff: number, opts: RenderOptions,
  ) {
    const { W, H, height, tempSea, precip, biome, plate, lakeDepth, waterLevel, koppen, newWorld } = this.world;
    const special = this.world.special as Uint8Array | undefined;
    const SW = w + 2 * B, SH = h + 2 * B;
    const fantasy = layer === 'fantasy';
    const reach = this.world.spread.reach;
    const hc = this.world.spread.heartland;
    const heart = layer === 'oldworld' && hc >= 0 ? [((hc % W) + 0.5) / W * 360 - 180, 90 - (Math.floor(hc / W) + 0.5) / H * 180] : null;

    const ci0 = new Int32Array(SW), ci1 = new Int32Array(SW), ctx = new Float64Array(SW);
    const cols4 = new Int32Array(SW * 4), colW = new Float64Array(SW * 4);
    const cosLon = new Float64Array(SW), sinLon = new Float64Array(SW);
    for (let c = 0; c < SW; c++) {
      const fx = ((lons[c] + 180) / 360) * W - 0.5;
      const i0 = Math.floor(fx);
      ctx[c] = fx - i0;
      ci0[c] = ((i0 % W) + W) % W;
      ci1[c] = (ci0[c] + 1) % W;
      catmullRom(ctx[c], colW, c * 4);
      for (let k = 0; k < 4; k++) cols4[c * 4 + k] = (((i0 - 1 + k) % W) + W) % W;
      cosLon[c] = Math.cos(lons[c] * DEG);
      sinLon[c] = Math.sin(lons[c] * DEG);
    }
    const ro0 = new Int32Array(SH), ro1 = new Int32Array(SH), rty = new Float64Array(SH);
    const rows4 = new Int32Array(SH * 4), rowW = new Float64Array(SH * 4);
    for (let r = 0; r < SH; r++) {
      const fy = ((90 - lats[r]) / 180) * H - 0.5;
      const j0 = Math.floor(fy);
      rty[r] = Math.min(1, Math.max(0, fy - j0));
      ro0[r] = Math.min(H - 1, Math.max(0, j0)) * W;
      ro1[r] = Math.min(H - 1, Math.max(0, j0 + 1)) * W;
      catmullRom(fy - j0, rowW, r * 4);
      for (let k = 0; k < 4; k++) rows4[r * 4 + k] = Math.min(H - 1, Math.max(0, j0 - 1 + k)) * W;
    }

    const octAmp = new Float64Array(RC.maxOctaves), octCoast = new Float64Array(RC.maxOctaves);
    const octFreq = new Float64Array(RC.maxOctaves);
    for (let k = 0; k < RC.maxOctaves; k++) {
      const lam = this.lambda0Km / 2 ** k;
      octFreq[k] = EARTH_RADIUS_KM / lam;
      octAmp[k] = RC.detailAmpM * Math.pow(lam / this.lambda0Km, RC.detailHurst);
      octCoast[k] = RC.coastAmpM * Math.pow(lam / this.lambda0Km, RC.coastHurst);
    }
    const warpFreq = EARTH_RADIUS_KM / this.lambda0Km;
    const warpAmp = RC.biomeWarpCells;
    const needWarp = layer === 'terrain' || fantasy;
    const warpX = needWarp ? new Float32Array(SW * SH) : null;
    const warpY = needWarp ? new Float32Array(SW * SH) : null;
    const water = fantasy ? new Uint8Array(SW * SH) : null;

    const rf = this.riverField(lons, lats, pxX, pxY, SW, SH, proj, zEff);
    const drawRivers = !!rf && opts.rivers !== false && (fantasy || layer === 'terrain');

    // Pass 1: heights with sub-grid detail, including a 1px border for shading.
    const hs = new Float32Array(SW * SH);
    const nearest = layer === 'plates' || layer === 'biomes' || layer === 'climate' || layer === 'oldworld' ? new Int32Array(SW * SH) : null;
    const noise = this.noise;
    for (let r = 0; r < SH; r++) {
      const cosLat = Math.cos(lats[r] * DEG), sinLat = Math.sin(lats[r] * DEG);
      const pxKm = Math.max(1e-4, Math.min(pxX[r], pxY[r]));
      const octF = Math.min(RC.maxOctaves, Math.max(0, Math.log2(this.lambda0Km / (2 * pxKm)) + 1));
      const nOct = Math.ceil(octF);
      const o0 = ro0[r], o1 = ro1[r], ty = rty[r];
      for (let c = 0; c < SW; c++) {
        const a = ci0[c], b = ci1[c], tx = ctx[c];
        let base = 0;
        for (let kr = 0; kr < 4; kr++) {
          const ro = rows4[r * 4 + kr];
          base += rowW[r * 4 + kr] * (
            colW[c * 4] * height[ro + cols4[c * 4]] + colW[c * 4 + 1] * height[ro + cols4[c * 4 + 1]] +
            colW[c * 4 + 2] * height[ro + cols4[c * 4 + 2]] + colW[c * 4 + 3] * height[ro + cols4[c * 4 + 3]]);
        }
        // Clamp cubic overshoot so steep coast-to-abyss jumps don't ring into speckled shores.
        const h00 = height[o0 + a], h10 = height[o0 + b], h01 = height[o1 + a], h11 = height[o1 + b];
        base = Math.min(Math.max(h00, h10, h01, h11), Math.max(Math.min(h00, h10, h01, h11), base));
        let hh = base, sum = 0;
        const x = cosLat * cosLon[c], y = cosLat * sinLon[c];
        if (nOct > 0) {
          const rough = base > 0
            ? Math.min(RC.maxRough, RC.baseRough + (RC.mountainRoughPerKm * base) / 1000)
            : RC.oceanRough;
          const coast = Math.exp(-((base / RC.coastWidthM) ** 2));
          const ridge = smoothstep(RC.ridgeStartM, RC.ridgeFullM, base);
          for (let k = 0; k < nOct; k++) {
            const f = octFreq[k];
            let v = noise.noise(x * f + k * 31.7, y * f, sinLat * f);
            if (ridge > 0) v += (0.6 - 1.6 * Math.abs(v) - v) * ridge;
            sum += Math.min(1, octF - k) * v * (rough * octAmp[k] + coast * octCoast[k]);
          }
          hh += sum;
        }
        if (rf) {
          const bm = rf.bankM[r * SW + c];
          if (bm < RIVER_REACH_M) hh = carveRiver(hh, base, sum, { bankM: bm, halfM: rf.halfM[r * SW + c], order: 0 });
        }
        if (warpX && warpY) {
          warpX[r * SW + c] = warpAmp * noise.noise(x * warpFreq + 101.3, y * warpFreq, sinLat * warpFreq);
          warpY[r * SW + c] = warpAmp * noise.noise(x * warpFreq - 77.9, y * warpFreq, sinLat * warpFreq);
        }
        hs[r * SW + c] = hh;
        if (nearest) nearest[r * SW + c] = (ty < 0.5 ? o0 : o1) + (tx < 0.5 ? a : b);
        if (water) {
          const lake = bilerp(lakeDepth, o0, o1, a, b, tx, ty) > 1 && hh < bilerp(waterLevel, o0, o1, a, b, tx, ty);
          water[r * SW + c] = hh <= 0 || lake ? 1 : 0;
        }
      }
    }

    // Fantasy style: pixel distances to the shoreline drive the inked coast and ripple lines.
    const seaDist = water ? maskDistance(water, SW, SH, 1) : null;
    const landDist = water ? maskDistance(water, SW, SH, 0) : null;

    // Pass 2: colour + hillshade.
    const out = new Uint8ClampedArray(w * h * 4);
    const col = new Float64Array(3);
    const az = RC.sunAzimuthDeg * DEG, alt = RC.sunAltitudeDeg * DEG;
    const Lx = Math.sin(az) * Math.cos(alt), Ly = Math.cos(az) * Math.cos(alt), Lz = Math.sin(alt);
    const lakeMin = 1;
    const cInterval = contourInterval(zEff);
    const cFade = smoothstep(8.6, 9.6, zEff);

    for (let r = B; r < B + h; r++) {
      const pxKm = Math.max(1e-4, Math.min(pxX[r], pxY[r]));
      const ex = RC.hillshadeScale * Math.pow(pxKm, RC.hillshadeExp);
      const gx = ex / (2 * pxX[r] * 1000), gy = ex / (2 * pxY[r] * 1000);
      const o0 = ro0[r], o1 = ro1[r], ty = rty[r];
      for (let c = B; c < B + w; c++) {
        const s = r * SW + c;
        const hh = hs[s];
        const nx = -(hs[s + 1] - hs[s - 1]) * gx;
        const ny = (hs[s + SW] - hs[s - SW]) * gy;
        const rel = (nx * Lx + ny * Ly + Lz) / (Math.sqrt(nx * nx + ny * ny + 1) * Lz);
        const a = ci0[c], b = ci1[c], tx = ctx[c];
        const isLand = hh > 0;
        let light = 1;

        switch (layer) {
          case 'fantasy': {
            const ts = bilerp(tempSea, o0, o1, a, b, tx, ty);
            // Coverage of a river drawn over this pixel; river mouths open into the sea without an inked coast.
            let rCov = drawRivers ? rf!.vis[s] * Math.min(1, Math.max(0, 0.5 - rf!.bankPx[s])) : 0;
            if (water![s]) {
              // Only at the mouth itself, not where a river's course crosses a lake.
              if (seaDist![s] > 4) rCov = 0;
              col[0] = WATER[0]; col[1] = WATER[1]; col[2] = WATER[2];
              if (hh <= 0) mix(col, WATER_DEEP, 0.7 * smoothstep(200, 3000, -hh));
              if (ts < RC.seaIceC + 4) mix(col, FANTASY_ICE, smoothstep(RC.seaIceC + 4, RC.seaIceC - 4, ts));
              const d = seaDist![s];
              for (let k = 0; k < FANTASY.rippleRadiiPx.length; k++) {
                mix(col, RIPPLE, (1 - rCov) * FANTASY.rippleAlpha[k] * Math.exp(-(((d - FANTASY.rippleRadiiPx[k]) / 0.55) ** 2)));
              }
              mix(col, INK, (1 - rCov) * 0.9 * Math.min(1, Math.max(0, 2 - d)));
            } else {
              const fx = ((lons[c] + 180) / 360) * W - 0.5 + warpX![s];
              const fy = Math.min(H - 1.001, Math.max(0, ((90 - lats[r]) / 180) * H - 0.5 + warpY![s]));
              const wi0 = Math.floor(fx), wj0 = Math.floor(fy);
              const wtx = fx - wi0, wty = fy - wj0;
              const ia = ((wi0 % W) + W) % W, ib = (ia + 1) % W;
              const ja = wj0 * W, jb = Math.min(H - 1, wj0 + 1) * W;
              const w00 = (1 - wtx) * (1 - wty), w10 = wtx * (1 - wty), w01 = (1 - wtx) * wty, w11 = wtx * wty;
              const b00 = biome[ja + ia] * 3, b10 = biome[ja + ib] * 3, b01 = biome[jb + ia] * 3, b11 = biome[jb + ib] * 3;
              for (let ch = 0; ch < 3; ch++) {
                col[ch] = FANTASY_BIOME_RGB[b00 + ch] * w00 + FANTASY_BIOME_RGB[b10 + ch] * w10 +
                  FANTASY_BIOME_RGB[b01 + ch] * w01 + FANTASY_BIOME_RGB[b11 + ch] * w11;
              }
              if (special && (special[ja + ia] | special[ja + ib] | special[jb + ia] | special[jb + ib])) {
                paintSpecial(col, [special[ja + ia], special[ja + ib], special[jb + ia], special[jb + ib]], [w00, w10, w01, w11], lons[c], lats[r], hh, (icons ? icons.originX : 0) + c, (icons ? icons.originY : 0) + r);
              }
              const snowSupply = smoothstep(RC.snowMinPrecipMm, RC.snowFullPrecipMm, bilerp(precip, o0, o1, a, b, tx, ty));
              mix(col, FANTASY_SNOW, snowSupply * smoothstep(RC.snowStartC, RC.snowFullC, ts - LAPSE * hh));
              // Soft sepia hillshade rather than realistic lighting.
              mix(col, SEPIA, 0.22 * Math.min(1, Math.max(0, 1 - rel)));
              light = Math.min(1.08, Math.max(0.85, 1 + 0.25 * (rel - 1)));
              if (cFade > 0 && hh > 0) this.contour(col, hs, s, SW, cInterval, cFade, pxX[r] * 1000, zEff, icons ? icons.originX + c - B : c, icons ? icons.originY + r - B : r);
              if (rCov > 0 || (drawRivers && rf!.bankPx[s] < 1.5)) {
                light += (1 - light) * Math.min(1, Math.max(0, 1 - rf!.bankPx[s]));
                drawRiver(col, rf!.bankPx[s], rf!.halfPx[s], rf!.vis[s]);
              }
              mix(col, INK, (1 - rCov) * 0.85 * Math.min(1, Math.max(0, 1.5 - landDist![s])));
            }
            const gxp = (icons ? icons.originX : 0) + c - B, gyp = (icons ? icons.originY : 0) + r - B;
            light *= 1 + FANTASY.grain * 0.5 * grain(gxp, gyp);
            break;
          }
          case 'terrain': {
            const ts = bilerp(tempSea, o0, o1, a, b, tx, ty);
            const isLake = bilerp(lakeDepth, o0, o1, a, b, tx, ty) > lakeMin && hh < bilerp(waterLevel, o0, o1, a, b, tx, ty);
            if (isLake) {
              col[0] = LAKE_RGB[0]; col[1] = LAKE_RGB[1]; col[2] = LAKE_RGB[2];
              if (ts < RC.seaIceC + 4) mix(col, SEA_ICE_RGB, smoothstep(RC.seaIceC + 4, RC.seaIceC - 4, ts));
            } else if (!isLand) {
              sampleRamp(OCEAN_RAMP, hh, col);
              if (ts < RC.seaIceC + 4) mix(col, SEA_ICE_RGB, smoothstep(RC.seaIceC + 4, RC.seaIceC - 4, ts));
              light = 1 + 0.2 * (rel - 1);
            } else {
              // Domain-warped bilinear biome blend so climate zones have organic edges.
              const fx = ((lons[c] + 180) / 360) * W - 0.5 + warpX![s];
              const fy = Math.min(H - 1.001, Math.max(0, ((90 - lats[r]) / 180) * H - 0.5 + warpY![s]));
              const wi0 = Math.floor(fx), wj0 = Math.floor(fy);
              const wtx = fx - wi0, wty = fy - wj0;
              const ia = ((wi0 % W) + W) % W, ib = (ia + 1) % W;
              const ja = wj0 * W, jb = Math.min(H - 1, wj0 + 1) * W;
              const w00 = (1 - wtx) * (1 - wty), w10 = wtx * (1 - wty), w01 = (1 - wtx) * wty, w11 = wtx * wty;
              const b00 = biome[ja + ia] * 3, b10 = biome[ja + ib] * 3, b01 = biome[jb + ia] * 3, b11 = biome[jb + ib] * 3;
              for (let ch = 0; ch < 3; ch++) {
                col[ch] = BIOME_RGB[b00 + ch] * w00 + BIOME_RGB[b10 + ch] * w10 + BIOME_RGB[b01 + ch] * w01 + BIOME_RGB[b11 + ch] * w11;
              }
              if (special && (special[ja + ia] | special[ja + ib] | special[jb + ia] | special[jb + ib])) {
                paintSpecial(col, [special[ja + ia], special[ja + ib], special[jb + ia], special[jb + ib]], [w00, w10, w01, w11], lons[c], lats[r], hh, c, r);
              }
              mix(col, ROCK_RGB, 0.7 * smoothstep(RC.rockStartM, RC.rockFullM, hh));
              const snowSupply = smoothstep(RC.snowMinPrecipMm, RC.snowFullPrecipMm, bilerp(precip, o0, o1, a, b, tx, ty));
              mix(col, SNOW_RGB, snowSupply * smoothstep(RC.snowStartC, RC.snowFullC, ts - LAPSE * hh));
              light = Math.min(1.4, Math.max(0.35, 0.3 + 0.7 * rel));
              if (drawRivers && rf!.bankPx[s] < 0.5) {
                const cov = rf!.vis[s] * Math.min(1, 0.5 - rf!.bankPx[s]);
                const thin = 1 - smoothstep(1, 2.2, rf!.halfPx[s]);
                mix(col, RIVER_TERRAIN_THIN, cov * thin);
                mix(col, RIVER_TERRAIN, cov * (1 - thin));
                light += (1 - light) * cov;
              }
            }
            break;
          }
          case 'biomes': {
            if (!isLand) {
              sampleRamp(OCEAN_RAMP, -2000, col);
            } else {
              const bi = biome[nearest![s]] * 3;
              col[0] = BIOME_RGB[bi]; col[1] = BIOME_RGB[bi + 1]; col[2] = BIOME_RGB[bi + 2];
              const spv = special ? special[nearest![s]] : 0;
              if (spv && spv !== 6) mix(col, SP_LEGEND_RGB[spv], spv === 7 ? 0.5 : 1);
              light = Math.min(1.25, Math.max(0.6, 1 + 0.35 * (rel - 1)));
            }
            break;
          }
          case 'climate': {
            if (!isLand) {
              sampleRamp(OCEAN_RAMP, -3500, col);
            } else {
              const ki = koppen[nearest![s]] * 3;
              col[0] = KOPPEN_RGB[ki]; col[1] = KOPPEN_RGB[ki + 1]; col[2] = KOPPEN_RGB[ki + 2];
              light = Math.min(1.2, Math.max(0.65, 1 + 0.3 * (rel - 1)));
            }
            break;
          }
          case 'underworld': {
            if (!isLand) {
              col[0] = UNDER_SEA[0]; col[1] = UNDER_SEA[1]; col[2] = UNDER_SEA[2];
            } else {
              const k = Math.min(1, Math.max(0, hh / 3500));
              col[0] = UNDER_LOW[0] + (UNDER_HIGH[0] - UNDER_LOW[0]) * k;
              col[1] = UNDER_LOW[1] + (UNDER_HIGH[1] - UNDER_LOW[1]) * k;
              col[2] = UNDER_LOW[2] + (UNDER_HIGH[2] - UNDER_LOW[2]) * k;
              light = Math.min(1.3, Math.max(0.6, 0.7 + 0.4 * rel));
            }
            break;
          }
          case 'elevation': {
            if (!isLand) {
              sampleRamp(OCEAN_RAMP, hh, col);
              light = 1 + 0.2 * (rel - 1);
            } else {
              sampleRamp(ELEVATION_RAMP, hh, col);
              light = Math.min(1.35, Math.max(0.45, 0.45 + 0.55 * rel));
            }
            break;
          }
          case 'temperature': {
            const t = bilerp(tempSea, o0, o1, a, b, tx, ty) - LAPSE * Math.max(0, hh);
            sampleRamp(TEMPERATURE_RAMP, t, col);
            light = isLand ? Math.min(1.25, Math.max(0.6, 1 + 0.4 * (rel - 1))) : 0.75;
            break;
          }
          case 'precipitation': {
            sampleRamp(PRECIP_RAMP, bilerp(precip, o0, o1, a, b, tx, ty), col);
            light = isLand ? Math.min(1.25, Math.max(0.6, 1 + 0.4 * (rel - 1))) : 0.65;
            break;
          }
          case 'oldworld': {
            let n = nearest![s];
            // Land drawn over a sea cell at the coast takes the colour of the land beside it.
            if (isLand && height[n] <= 0) for (const k of [n + 1, n - 1, n + W, n - W]) if (k >= 0 && k < W * H && height[k] > 0) { n = k; break; }
            if (!isLand) {
              sampleRamp(OCEAN_RAMP, -2500, col);
              light = 0.85;
            } else {
              const rc = reach[n], nw = newWorld[n] === 1;
              if (!nw && rc > 0) sampleRamp(OLD_WORLD_RAMP, rc, col);
              else {
                const rgb = nw ? (rc > 0 ? NEW_REACHED_RGB : NEW_WORLD_RGB) : OLD_UNREACHED_RGB;
                col[0] = rgb[0]; col[1] = rgb[1]; col[2] = rgb[2];
              }
              light = Math.min(1.2, Math.max(0.7, 1 + 0.3 * (rel - 1)));
              // Contours every tenth of the spread, and the line between Old and New.
              const band = (k: number) => (height[k] > 0 && reach[k] > 0 && newWorld[k] === 0 ? Math.floor((reach[k] - 1) / 25.4) : -1);
              const b0 = band(n), nr = nearest![s + 1], nd = nearest![s + SW];
              if ((newWorld[nr] !== newWorld[n] && height[nr] > 0) || (newWorld[nd] !== newWorld[n] && height[nd] > 0)) light *= 0.35;
              else if (b0 >= 0 && ((band(nr) >= 0 && band(nr) !== b0) || (band(nd) >= 0 && band(nd) !== b0))) light *= 0.72;
            }
            if (heart) {
              // The heartland: a ringed dot.
              const dx = (((lons[c] - heart[0] + 540) % 360) - 180) * Math.cos(lats[r] * DEG) * 111.32 / pxX[r];
              const dy = (lats[r] - heart[1]) * 111.32 / pxY[r];
              const d = Math.hypot(dx, dy);
              if (d < 3.5 || Math.abs(d - 7) < 1.2) {
                col[0] = HEARTLAND_RGB[0]; col[1] = HEARTLAND_RGB[1]; col[2] = HEARTLAND_RGB[2];
                light = 1;
              } else if (d < 9) light = Math.max(light, 1.05);
            }
            break;
          }
          case 'plates': {
            const p = plate[nearest![s]];
            const pi = p * 3;
            col[0] = this.plateRgb[pi]; col[1] = this.plateRgb[pi + 1]; col[2] = this.plateRgb[pi + 2];
            if (isLand) mix(col, [255, 255, 255], 0.3);
            light = isLand ? Math.min(1.25, Math.max(0.6, 1 + 0.4 * (rel - 1))) : 0.7;
            if (plate[nearest![s + 1]] !== p || plate[nearest![s + SW]] !== p) light *= 0.25;
            break;
          }
        }

        const o = ((r - B) * w + (c - B)) * 4;
        out[o] = col[0] * light;
        out[o + 1] = col[1] * light;
        out[o + 2] = col[2] * light;
        out[o + 3] = 255;
      }
    }
    if (fantasy && icons) {
      // Keep symbols off the rivers, and off water at the fine shoreline (symbols are placed on the coarse grid).
      const clear = (x: number, y: number, rad: number) => {
        const xi = Math.round(x) + B, yi = Math.round(y) + B;
        if (xi < 0 || yi < 0 || xi >= SW || yi >= SH) return true;
        const k = yi * SW + xi;
        if (water![k] || landDist![k] < 1.5) return false;
        return !drawRivers || rf!.vis[k] < 0.3 || rf!.bankPx[k] > rad;
      };
      drawIcons(out, w, h, icons, this.world, clear);
    }
    return out;
  }

  /**
   * Distances from every pixel to the nearest river: in pixels to the drawn bank (rivers are never
   * drawn thinner than a zoom-dependent minimum) and in metres to the true bank (for carving).
   * Each nearby segment is rasterised over its bounding box, so the cost follows the river length in view.
   */
  private riverField(
    lons: Float64Array, lats: Float64Array, pxX: Float64Array, pxY: Float64Array, SW: number, SH: number,
    proj: (lon: number, lat: number) => [number, number], zEff: number,
  ): RiverField | null {
    const idx = this.rivers;
    if (!idx) return null;
    const N = SW * SH;
    const f: RiverField = {
      bankPx: new Float32Array(N).fill(1e9), halfPx: new Float32Array(N), vis: new Float32Array(N),
      bankM: new Float32Array(N).fill(1e9), halfM: new Float32Array(N),
    };
    const west = lons[0], east = lons[SW - 1], north = lats[0], south = lats[SH - 1];
    const lonC = (west + east) / 2;
    const pxKmMax = Math.max(pxX[0], pxX[SH - 1], pxY[0]);
    const padKm = RIVER_REACH_M / 1000 + 12 * pxKmMax;
    const padLat = padKm / 111.2;
    const padLon = Math.min(180, padLat / Math.max(0.05, Math.cos(Math.min(85, Math.max(Math.abs(north), Math.abs(south))) * DEG)));
    const seg = idx.seg;
    let any = false;
    // Meander offsets per pixel (m east, m north), computed lazily; none below ~zoom 8 where they are sub-pixel.
    const pxMEq = 40075016 / (256 * 2 ** zEff);
    const warpOn = zEff >= 7.5;
    const wE = warpOn ? new Float32Array(N).fill(NaN) : null, wN = warpOn ? new Float32Array(N) : null;
    const wtmp = new Float64Array(2);
    const minLam = 2.5 * pxMEq;
    idx.query(west - padLon, south - padLat, east + padLon, north + padLat, (sg) => {
      const o = sg * 7;
      const order = seg[o + 6];
      const vis = riverVisibility(zEff, order);
      const shift = Math.round((lonC - seg[o]) / 360) * 360;
      const [ca, ra] = proj(seg[o] + shift, seg[o + 1]);
      const [cb, rb] = proj(seg[o + 2] + shift, seg[o + 3]);
      const rm = Math.min(SH - 1, Math.max(0, Math.round((ra + rb) / 2)));
      const sx = pxX[rm] * 1000, sy = pxY[rm] * 1000, pxM = Math.min(sx, sy);
      const hA = seg[o + 4], hB = seg[o + 5];
      const minHalf = riverMinWidthPx(zEff, order) / 2;
      const valley = valleyM(Math.max(hA, hB));
      const carve = valley / pxM > 0.3;
      if (vis <= 0 && !carve) return;
      const reachM = Math.max(carve ? valley : 0, (Math.max(hA, hB, minHalf * pxM) + 2 * pxM)) + (warpOn ? MEANDER_MAX_M : 0);
      const Rc = reachM / sx + 1, Rr = reachM / sy + 1;
      const c0 = Math.max(0, Math.floor(Math.min(ca, cb) - Rc)), c1 = Math.min(SW - 1, Math.ceil(Math.max(ca, cb) + Rc));
      const r0 = Math.max(0, Math.floor(Math.min(ra, rb) - Rr)), r1 = Math.min(SH - 1, Math.ceil(Math.max(ra, rb) + Rr));
      if (c0 > c1 || r0 > r1) return;
      any = true;
      const vx = (cb - ca) * sx, vy = (rb - ra) * sy;
      const l2 = vx * vx + vy * vy;
      for (let r = r0; r <= r1; r++) {
        const dy0 = (r - ra) * sy;
        for (let c = c0; c <= c1; c++) {
          let dx = (c - ca) * sx, dy = dy0;
          if (wE) {
            const k = r * SW + c;
            if (Number.isNaN(wE[k])) {
              idx.warp(lons[c], lats[r], minLam, wtmp);
              wE[k] = wtmp[0];
              wN![k] = wtmp[1];
            }
            dx += wE[k];
            dy -= wN![k];
          }
          const t = l2 > 0 ? Math.min(1, Math.max(0, (dx * vx + dy * vy) / l2)) : 0;
          const dM = Math.hypot(dx - vx * t, dy - vy * t);
          const half = hA + (hB - hA) * t;
          const k = r * SW + c;
          const bm = dM - half;
          if (bm < f.bankM[k]) {
            f.bankM[k] = bm;
            f.halfM[k] = half;
          }
          if (vis > 0) {
            const hd = Math.max(half / pxM, minHalf);
            const sb = dM / pxM - hd;
            if (sb < f.bankPx[k]) {
              f.bankPx[k] = sb;
              f.halfPx[k] = hd;
              f.vis[k] = vis;
            }
          }
        }
      }
    });
    return any ? f : null;
  }

  /** Fantasy contours (index line every fifth) and rock stipple on steep ground at close zoom. */
  private contour(
    col: Float64Array, hs: Float32Array, s: number, SW: number, interval: number, fade: number, pxM: number, zEff: number,
    gx: number, gy: number,
  ): void {
    const dhx = (hs[s + 1] - hs[s - 1]) / 2, dhy = (hs[s + SW] - hs[s - SW]) / 2;
    const g = Math.hypot(dhx, dhy) / interval;
    if (g > 1e-4) {
      const f = hs[s] / interval;
      const n = Math.round(f);
      if (n > 0) {
        const dl = Math.abs(f - n) / g;
        const crowd = 1 - smoothstep(0.18, 0.4, g);
        const index = n % 5 === 0;
        const a = Math.min(1, Math.max(0, (index ? 1.05 : 0.8) - dl)) * crowd * fade * (index ? 0.62 : 0.42);
        if (a > 0) mix(col, CONTOUR, a);
      }
    }
    if (zEff > 11.3) {
      const slope = Math.hypot(dhx, dhy) / pxM;
      const dens = smoothstep(0.3, 0.9, slope) * 0.3 * smoothstep(11.3, 12, zEff);
      if (dens > 0 && (grain(gx * 7 + 3, gy * 13 + 5) + 1) / 2 < dens) mix(col, INK, 0.5);
    }
  }
}

/** Inked river: a single ink-blue line when thin, a pale channel between inked banks when wide. */
function drawRiver(col: Float64Array, sb: number, hd: number, vis: number): void {
  const cov = vis * Math.min(1, Math.max(0, 0.5 - sb));
  const thin = 1 - smoothstep(1.1, 2.4, hd);
  if (thin > 0) mix(col, RIVER_THIN, cov * thin);
  if (thin < 1) {
    const wide = (1 - thin) * vis;
    mix(col, RIVER_FILL, cov * (1 - thin));
    if (hd > 4) {
      // A ripple line just inside each bank on broad rivers.
      mix(col, RIPPLE, wide * 0.35 * smoothstep(4, 7, hd) * Math.exp(-(((-sb - 3) / 0.6) ** 2)));
    }
    mix(col, RIVER_INK, wide * 0.85 * Math.min(1, Math.max(0, 1 - Math.abs(sb) / 0.75)));
  }
}
