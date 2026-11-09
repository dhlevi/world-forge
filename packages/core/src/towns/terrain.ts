import { type Pt, joinSegments } from './geom';

export const LAND = 0, SEA = 1, RIVER = 2;

export interface ShorePoint {
  p: Pt;
  /** Unit vector pointing into the water. */
  n: Pt;
  type: number;
}

/** Height and water grid over a plan (local metres), for slope-aware layout, shorelines and contours. */
export class LocalTerrain {
  readonly n: number;
  readonly h: Float32Array;
  readonly w: Uint8Array;

  constructor(readonly extent: number, readonly cs: number, height: (p: Pt) => number, water: (p: Pt, h: number) => number) {
    this.n = Math.ceil((2 * extent) / cs) + 1;
    this.h = new Float32Array(this.n * this.n);
    this.w = new Uint8Array(this.n * this.n);
    for (let j = 0, k = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++, k++) {
        const p: Pt = [-extent + i * cs, -extent + j * cs];
        this.h[k] = height(p);
        this.w[k] = water(p, this.h[k]);
      }
    }
  }

  node(i: number, j: number): Pt {
    return [-this.extent + i * this.cs, -this.extent + j * this.cs];
  }

  height(p: Pt): number {
    const { n, cs, h } = this;
    const fx = Math.min(n - 1.001, Math.max(0, (p[0] + this.extent) / cs));
    const fy = Math.min(n - 1.001, Math.max(0, (p[1] + this.extent) / cs));
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
    const k = j * n + i;
    return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - ty) + (h[k + n] * (1 - tx) + h[k + n + 1] * tx) * ty;
  }

  /** Uphill gradient (m per m). */
  grad(p: Pt): Pt {
    const d = this.cs;
    return [
      (this.height([p[0] + d, p[1]]) - this.height([p[0] - d, p[1]])) / (2 * d),
      (this.height([p[0], p[1] + d]) - this.height([p[0], p[1] - d])) / (2 * d),
    ];
  }

  slope(p: Pt): number {
    return Math.hypot(...this.grad(p));
  }

  typeAt(p: Pt): number {
    const i = Math.round((p[0] + this.extent) / this.cs), j = Math.round((p[1] + this.extent) / this.cs);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return LAND;
    return this.w[j * this.n + i];
  }

  /** Land nodes next to water within maxR of the centre, at least minSep apart. */
  shore(maxR: number, minSep: number, rnd: () => number): ShorePoint[] {
    const { n, w } = this;
    const found: ShorePoint[] = [];
    for (let j = 1; j < n - 1; j++) {
      for (let i = 1; i < n - 1; i++) {
        const k = j * n + i;
        if (w[k] !== LAND) continue;
        const p = this.node(i, j);
        if (Math.hypot(...p) > maxR) continue;
        let nx = 0, ny = 0, type = LAND, adjacent = false;
        // Normal from a 5×5 neighbourhood so piers point out across the water, not along a rough shore.
        for (let dj = -2; dj <= 2; dj++) {
          for (let di = -2; di <= 2; di++) {
            const jj = j + dj, ii = i + di;
            if (jj < 0 || ii < 0 || jj >= n || ii >= n) continue;
            const t = w[jj * n + ii];
            if (t === LAND) continue;
            if (Math.abs(di) <= 1 && Math.abs(dj) <= 1) adjacent = true;
            const wgt = 1 / Math.hypot(di, dj);
            nx += di * wgt;
            ny += dj * wgt;
            type = Math.max(type, t);
          }
        }
        const l = Math.hypot(nx, ny);
        if (adjacent && l > 0) found.push({ p, n: [nx / l, ny / l], type });
      }
    }
    for (let k = found.length - 1; k > 0; k--) {
      const r = Math.floor(rnd() * (k + 1));
      [found[k], found[r]] = [found[r], found[k]];
    }
    const kept: ShorePoint[] = [];
    for (const s of found) {
      if (kept.every((q) => Math.hypot(q.p[0] - s.p[0], q.p[1] - s.p[1]) >= minSep)) kept.push(s);
    }
    return kept;
  }

  /** Contour polylines every `interval` m over land within maxR (marching squares). */
  contours(interval: number, maxR: number): Pt[][] {
    const { n, h, w } = this;
    const segs: [Pt, Pt][] = [];
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const k = j * n + i;
        if (w[k] || w[k + 1] || w[k + n] || w[k + n + 1]) continue;
        const c0 = this.node(i, j);
        if (Math.hypot(c0[0] + this.cs / 2, c0[1] + this.cs / 2) > maxR) continue;
        const corners: [Pt, number][] = [
          [c0, h[k]], [this.node(i + 1, j), h[k + 1]], [this.node(i + 1, j + 1), h[k + n + 1]], [this.node(i, j + 1), h[k + n]],
        ];
        const lo = Math.min(h[k], h[k + 1], h[k + n], h[k + n + 1]), hi = Math.max(h[k], h[k + 1], h[k + n], h[k + n + 1]);
        for (let L = Math.ceil(lo / interval) * interval; L < hi; L += interval) {
          const pts: Pt[] = [];
          for (let e = 0; e < 4; e++) {
            const [pa, ha] = corners[e], [pb, hb] = corners[(e + 1) % 4];
            if ((ha - L) * (hb - L) >= 0) continue;
            const t = (L - ha) / (hb - ha);
            pts.push([pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t]);
          }
          if (pts.length >= 2) segs.push([pts[0], pts[1]]);
          if (pts.length === 4) segs.push([pts[2], pts[3]]);
        }
      }
    }
    return joinSegments(segs);
  }
}
