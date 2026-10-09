import { Simplex3 } from './noise';
import { hashString, mulberry32 } from './rng';
import { EARTH_RADIUS_KM, smoothstep } from './grid';
import { RENDER as RC } from './config';
import type { RasterWorld } from './world';

const DEG = Math.PI / 180;

function catmullRom(t: number, out: Float64Array): void {
  const t2 = t * t, t3 = t2 * t;
  out[0] = (-t3 + 2 * t2 - t) / 2;
  out[1] = (3 * t3 - 5 * t2 + 2) / 2;
  out[2] = (-3 * t3 + 4 * t2 + t) / 2;
  out[3] = (t3 - t2) / 2;
}

export type DetailWorld = Pick<RasterWorld, 'seed' | 'W' | 'H' | 'height' | 'lakeDepth' | 'waterLevel'>;

/**
 * Point sampler for the tile renderer's sub-grid terrain (same noise, same maths as
 * TileRenderer pass 1), so things placed with it agree with the drawn coastline.
 */
export class DetailSampler {
  private noise: Simplex3;
  private lambda0Km: number;
  private cw = new Float64Array(4);
  private rw = new Float64Array(4);

  constructor(private world: DetailWorld) {
    this.noise = new Simplex3(mulberry32(hashString(world.seed + '#detail')));
    this.lambda0Km = (2 * (2 * Math.PI * EARTH_RADIUS_KM)) / world.W;
  }

  /** Elevation (m) including detail octaves down to a pixel size of `pxKm` (default: all). */
  height(lon: number, lat: number, pxKm = 1e-3): number {
    const { W, H, height } = this.world;
    const fx = ((lon + 180) / 360) * W - 0.5;
    const fy = ((90 - lat) / 180) * H - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy);
    const { cw, rw } = this;
    catmullRom(fx - i0, cw);
    catmullRom(fy - j0, rw);
    let base = 0;
    for (let kr = 0; kr < 4; kr++) {
      const ro = Math.min(H - 1, Math.max(0, j0 - 1 + kr)) * W;
      for (let kc = 0; kc < 4; kc++) base += rw[kr] * cw[kc] * height[ro + ((((i0 - 1 + kc) % W) + W) % W)];
    }
    const a = ((i0 % W) + W) % W, b = (a + 1) % W;
    const o0 = Math.min(H - 1, Math.max(0, j0)) * W, o1 = Math.min(H - 1, Math.max(0, j0 + 1)) * W;
    const h00 = height[o0 + a], h10 = height[o0 + b], h01 = height[o1 + a], h11 = height[o1 + b];
    base = Math.min(Math.max(h00, h10, h01, h11), Math.max(Math.min(h00, h10, h01, h11), base));

    const octF = Math.min(RC.maxOctaves, Math.max(0, Math.log2(this.lambda0Km / (2 * pxKm)) + 1));
    const nOct = Math.ceil(octF);
    if (nOct === 0) return base;
    const cosLat = Math.cos(lat * DEG), sinLat = Math.sin(lat * DEG);
    const x = cosLat * Math.cos(lon * DEG), y = cosLat * Math.sin(lon * DEG);
    const rough = base > 0 ? Math.min(RC.maxRough, RC.baseRough + (RC.mountainRoughPerKm * base) / 1000) : RC.oceanRough;
    const coast = Math.exp(-((base / RC.coastWidthM) ** 2));
    const ridge = smoothstep(RC.ridgeStartM, RC.ridgeFullM, base);
    let sum = 0;
    for (let k = 0; k < nOct; k++) {
      const lam = this.lambda0Km / 2 ** k;
      const f = EARTH_RADIUS_KM / lam;
      const amp = RC.detailAmpM * Math.pow(lam / this.lambda0Km, RC.detailHurst);
      const coastAmp = RC.coastAmpM * Math.pow(lam / this.lambda0Km, RC.coastHurst);
      let v = this.noise.noise(x * f + k * 31.7, y * f, sinLat * f);
      if (ridge > 0) v += (0.6 - 1.6 * Math.abs(v) - v) * ridge;
      sum += Math.min(1, octF - k) * v * (rough * amp + coast * coastAmp);
    }
    return base + sum;
  }

  /** Sea or lake at full detail, matching the drawn shoreline; pass the height if already known. */
  isWater(lon: number, lat: number, hh = this.height(lon, lat)): boolean {
    if (hh <= 0) return true;
    const { W, H, lakeDepth, waterLevel } = this.world;
    const fx = ((lon + 180) / 360) * W - 0.5;
    const fy = ((90 - lat) / 180) * H - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy);
    const tx = fx - i0, ty = Math.min(1, Math.max(0, fy - j0));
    const a = ((i0 % W) + W) % W, b = (a + 1) % W;
    const o0 = Math.min(H - 1, Math.max(0, j0)) * W, o1 = Math.min(H - 1, Math.max(0, j0 + 1)) * W;
    const bl = (f: Float32Array) =>
      (f[o0 + a] * (1 - tx) + f[o0 + b] * tx) * (1 - ty) + (f[o1 + a] * (1 - tx) + f[o1 + b] * tx) * ty;
    return bl(lakeDepth) > 1 && hh < bl(waterLevel);
  }
}
