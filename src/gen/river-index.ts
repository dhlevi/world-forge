import type { RiverCollection } from './rivers';
import { riverWidthM } from './rivers';
import { Simplex3 } from './noise';
import { hashString, mulberry32 } from './rng';

const M_PER_DEG = (Math.PI * 6371000) / 180;
const BIN_DEG = 0.5;
const NX = Math.round(360 / BIN_DEG);
const R_M = 6371000;
/** Meander octaves: [wavelength m, amplitude as a fraction of the wavelength]. */
const MEANDER = [[9000, 0.085], [3600, 0.07], [1400, 0.05], [520, 0.035]];
/** Largest meander offset (m). */
export const MEANDER_MAX_M = MEANDER.reduce((a, [l, f]) => a + l * f, 0);

/** Nearest-river result for a point query. */
export interface RiverHit {
  /** Signed distance (m) from the nearest bank; negative inside the channel. */
  bankM: number;
  /** Half-width (m) of the river at its closest point. */
  halfM: number;
  /** Discharge order of that river. */
  order: number;
}

/**
 * Spatial index of river segments with widths that taper smoothly downstream. Each river feature
 * spans one discharge doubling, so its width grows from riverWidthM(order) to riverWidthM(order + 1)
 * along its length and there is no step where two features meet. Shared by the tile renderer
 * (drawing and valley carving), the detail sampler and the town plans so they all agree.
 */
export class RiverIndex {
  /** Per segment: ax, ay, bx, by (deg; bx unwrapped next to ax), halfA, halfB (m), order. */
  readonly seg: Float64Array;
  readonly count: number;
  private bins = new Map<number, number[]>();
  private stamp: Uint32Array;
  private tick = 0;
  private noise: Simplex3;

  constructor(rivers: RiverCollection, seed = '') {
    this.noise = new Simplex3(mulberry32(hashString(seed + '#meander')));
    let n = 0;
    for (const f of rivers.features) n += Math.max(0, f.geometry.coordinates.length - 1);
    this.seg = new Float64Array(n * 7);
    this.stamp = new Uint32Array(n);
    let s = 0;
    for (const f of rivers.features) {
      const c = f.geometry.coordinates;
      if (c.length < 2) continue;
      const order = f.properties.order;
      const w0 = riverWidthM(order) / 2, w1 = riverWidthM(order + 1) / 2;
      // Cumulative length for the taper.
      const cum = [0];
      for (let k = 1; k < c.length; k++) {
        const cl = Math.cos((c[k][1] * Math.PI) / 180);
        cum.push(cum[k - 1] + Math.hypot((c[k][0] - c[k - 1][0]) * cl, c[k][1] - c[k - 1][1]));
      }
      const total = cum[cum.length - 1] || 1;
      for (let k = 0; k + 1 < c.length; k++) {
        let ax = c[k][0];
        const shift = Math.floor((ax + 180) / 360) * 360;
        ax -= shift;
        const o = s * 7;
        this.seg[o] = ax;
        this.seg[o + 1] = c[k][1];
        this.seg[o + 2] = c[k + 1][0] - shift;
        this.seg[o + 3] = c[k + 1][1];
        this.seg[o + 4] = w0 + (w1 - w0) * (cum[k] / total);
        this.seg[o + 5] = w0 + (w1 - w0) * (cum[k + 1] / total);
        this.seg[o + 6] = order;
        const x0 = Math.floor((Math.min(ax, this.seg[o + 2]) + 180) / BIN_DEG), x1 = Math.floor((Math.max(ax, this.seg[o + 2]) + 180) / BIN_DEG);
        const y0 = Math.floor((Math.min(c[k][1], c[k + 1][1]) + 90) / BIN_DEG), y1 = Math.floor((Math.max(c[k][1], c[k + 1][1]) + 90) / BIN_DEG);
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const key = y * NX + (((x % NX) + NX) % NX);
            const b = this.bins.get(key);
            if (b) b.push(s);
            else this.bins.set(key, [s]);
          }
        }
        s++;
      }
    }
    this.count = s;
  }

  /** Calls cb once for each segment whose bin overlaps the box (lon may extend past ±180). */
  query(west: number, south: number, east: number, north: number, cb: (s: number) => void): void {
    if (++this.tick === 0xffffffff) {
      this.stamp.fill(0);
      this.tick = 1;
    }
    const t = this.tick;
    const x0 = Math.floor((west + 180) / BIN_DEG), x1 = Math.min(x0 + NX - 1, Math.floor((east + 180) / BIN_DEG));
    const y0 = Math.max(0, Math.floor((south + 90) / BIN_DEG)), y1 = Math.min(Math.round(180 / BIN_DEG) - 1, Math.floor((north + 90) / BIN_DEG));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const b = this.bins.get(y * NX + (((x % NX) + NX) % NX));
        if (!b) continue;
        for (const s of b) {
          if (this.stamp[s] === t) continue;
          this.stamp[s] = t;
          cb(s);
        }
      }
    }
  }

  /**
   * Meanders: the coarse river courses are straight between grid cells, so distances are measured
   * from a point displaced by a smooth noise field (domain warping), which bends every river the same
   * way wherever it is measured. Octaves shorter than minLambdaM are skipped (sub-pixel). Writes the
   * offset (m east, m north) into out.
   */
  warp(lon: number, lat: number, minLambdaM: number, out: Float64Array): void {
    out[0] = 0;
    out[1] = 0;
    const cl = Math.cos((lat * Math.PI) / 180), sl = Math.sin((lat * Math.PI) / 180);
    const x = cl * Math.cos((lon * Math.PI) / 180), y = cl * Math.sin((lon * Math.PI) / 180);
    for (let k = 0; k < MEANDER.length; k++) {
      const [lam, frac] = MEANDER[k];
      if (lam < minLambdaM) break;
      const f = R_M / lam, a = lam * frac;
      out[0] += a * this.noise.noise(x * f + 17.3 * k, y * f, sl * f);
      out[1] += a * this.noise.noise(x * f - 41.9, y * f + 9.1 * k, sl * f);
    }
  }

  private w = new Float64Array(2);

  /** Nearest river (with meanders at full detail) within maxM of a point, or null. */
  nearest(lon: number, lat: number, maxM: number): RiverHit | null {
    this.warp(lon, lat, 0, this.w);
    const cosQ = Math.max(0.02, Math.cos((lat * Math.PI) / 180));
    lon += this.w[0] / (M_PER_DEG * cosQ);
    lat += this.w[1] / M_PER_DEG;
    const dLat = maxM / M_PER_DEG;
    const cosL = Math.max(0.02, Math.cos((lat * Math.PI) / 180));
    const dLon = Math.min(180, dLat / cosL);
    const mx = M_PER_DEG * cosL;
    let best: RiverHit | null = null;
    const seg = this.seg;
    this.query(lon - dLon, lat - dLat, lon + dLon, lat + dLat, (s) => {
      const o = s * 7;
      // Shift the segment by whole turns next to the query point.
      const shift = Math.round((lon - seg[o]) / 360) * 360;
      const ax = (seg[o] + shift - lon) * mx, ay = (seg[o + 1] - lat) * M_PER_DEG;
      const bx = (seg[o + 2] + shift - lon) * mx, by = (seg[o + 3] - lat) * M_PER_DEG;
      const vx = bx - ax, vy = by - ay;
      const l2 = vx * vx + vy * vy;
      const t = l2 > 0 ? Math.min(1, Math.max(0, -(ax * vx + ay * vy) / l2)) : 0;
      const d = Math.hypot(ax + vx * t, ay + vy * t);
      const half = seg[o + 4] + (seg[o + 5] - seg[o + 4]) * t;
      const bank = d - half;
      if (bank <= maxM && (!best || bank < best.bankM)) best = { bankM: bank, halfM: half, order: seg[o + 6] };
    });
    return best as RiverHit | null;
  }
}

/** Width (m) of the floodplain either side of a river of half-width halfM, over which sub-grid relief is flattened. */
export function valleyM(halfM: number): number {
  return 150 + 4 * halfM;
}

/**
 * Carves a river valley into sub-grid terrain: the detail relief fades out across the floodplain
 * (so rivers never climb over noise ridges), the floor sinks a few metres toward the banks, and
 * the channel itself is cut below them. Land never becomes sea.
 */
export function carveRiver(hh: number, base: number, detail: number, hit: RiverHit | null): number {
  if (!hit || hh <= 0) return hh;
  const { bankM, halfM } = hit;
  const vw = valleyM(halfM);
  if (bankM >= vw) return hh;
  const t = Math.max(0, bankM) / vw;
  const v = 1 - t * t * (3 - 2 * t);
  const depth = 1.5 + 0.03 * halfM;
  let h = base + detail * (1 - 0.92 * v) - depth * v * v;
  if (bankM < 0) h -= Math.min(1, -bankM / Math.max(2, 0.3 * halfM)) * (1.5 + 0.02 * halfM);
  return Math.max(h, Math.min(hh, 0.5));
}
