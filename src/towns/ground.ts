import { type Poly, type Pt, area, centroid, hatch, pointInPoly, strips } from './geom';
import type { PlanOut } from './plan';
import { LAND, type LocalTerrain } from './terrain';

/** What a polygon must stand on: ground no steeper than maxSlope (m/m), at least marginM from water. */
export interface GroundRule {
  maxSlope: number;
  marginM: number;
}

export const FIELD_GROUND: GroundRule = { maxSlope: 0.25, marginM: 4 };
export const BUILD_GROUND: GroundRule = { maxSlope: 0.35, marginM: 1.5 };

/**
 * Buildable-ground tests over a plan's local terrain, so layout polygons (fields, lots,
 * buildings) follow shores, river banks and steep slopes instead of their Voronoi cells.
 *
 * - `barriers` gives seed points just past the edge of usable ground: added to a Voronoi
 *   diagram (and their cells discarded), they make neighbouring cells end along the shore in
 *   short irregular steps, the way a hand-drawn map does.
 * - `fit` pulls a polygon's offending vertices in toward its centre until they stand on usable
 *   ground; the polygon stays star-shaped (so simple), and a little inward wobble keeps its edges hand-drawn.
 */
export class Ground {
  /** Distance (m) from each terrain node to the nearest water node. */
  private dist: Float32Array;

  constructor(readonly terrain: LocalTerrain, readonly water: (p: Pt) => boolean) {
    const { n, w, cs } = terrain;
    const d = new Float32Array(n * n);
    for (let k = 0; k < n * n; k++) d[k] = w[k] !== LAND ? 0 : 1e9;
    const D = Math.SQRT2;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        if (d[k] === 0) continue;
        let v = d[k];
        if (i > 0) v = Math.min(v, d[k - 1] + 1);
        if (j > 0) {
          v = Math.min(v, d[k - n] + 1);
          if (i > 0) v = Math.min(v, d[k - n - 1] + D);
          if (i < n - 1) v = Math.min(v, d[k - n + 1] + D);
        }
        d[k] = v;
      }
    }
    for (let j = n - 1; j >= 0; j--) {
      for (let i = n - 1; i >= 0; i--) {
        const k = j * n + i;
        if (d[k] === 0) continue;
        let v = d[k];
        if (i < n - 1) v = Math.min(v, d[k + 1] + 1);
        if (j < n - 1) {
          v = Math.min(v, d[k + n] + 1);
          if (i < n - 1) v = Math.min(v, d[k + n + 1] + D);
          if (i > 0) v = Math.min(v, d[k + n - 1] + D);
        }
        d[k] = v;
      }
    }
    for (let k = 0; k < n * n; k++) d[k] = Math.min(1e6, d[k] * cs);
    this.dist = d;
  }

  /** Approximate distance (m) from p to the nearest water (the shore lies about half a node from a water node). */
  waterDist(p: Pt): number {
    const { n, cs, extent } = this.terrain;
    const fx = Math.min(n - 1.001, Math.max(0, (p[0] + extent) / cs));
    const fy = Math.min(n - 1.001, Math.max(0, (p[1] + extent) / cs));
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, k = j * n + i, d = this.dist;
    const v = (d[k] * (1 - tx) + d[k + 1] * tx) * (1 - ty) + (d[k + n] * (1 - tx) + d[k + n + 1] * tx) * ty;
    return v - cs / 2;
  }

  ok(p: Pt, rule: GroundRule): boolean {
    const wd = this.waterDist(p);
    if (wd < rule.marginM) return false;
    if (this.terrain.slope(p) > rule.maxSlope) return false;
    // The exact (sub-grid) shoreline only matters within about a node of the water.
    return wd > rule.marginM + this.terrain.cs || !this.water(p);
  }

  /** True if every vertex of a (small) polygon stands on usable ground. */
  allOk(poly: Poly, rule: GroundRule): boolean {
    return poly.every((v) => this.ok(v, rule)) && this.ok(centroid(poly), rule);
  }

  /** Voronoi barrier seeds: unusable nodes bordering usable ground within maxR, at least `spacing` apart. */
  barriers(maxR: number, spacing: number, rule: GroundRule): Pt[] {
    const { n } = this.terrain;
    const good = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const p = this.terrain.node(i, j);
        good[j * n + i] = Math.hypot(...p) <= maxR + spacing && this.ok(p, rule) ? 1 : 0;
      }
    }
    const out: Pt[] = [];
    const cell = new Map<number, Pt[]>();
    const key = (p: Pt) => Math.floor(p[0] / spacing) * 100003 + Math.floor(p[1] / spacing);
    for (let j = 1; j < n - 1; j++) {
      for (let i = 1; i < n - 1; i++) {
        const k = j * n + i;
        if (good[k] || !(good[k - 1] || good[k + 1] || good[k - n] || good[k + n])) continue;
        const p = this.terrain.node(i, j);
        if (Math.hypot(...p) > maxR + spacing) continue;
        let near = false;
        for (let dx = -1; dx <= 1 && !near; dx++) {
          for (let dy = -1; dy <= 1 && !near; dy++) {
            const b = cell.get((Math.floor(p[0] / spacing) + dx) * 100003 + Math.floor(p[1] / spacing) + dy);
            if (b?.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < spacing)) near = true;
          }
        }
        if (near) continue;
        out.push(p);
        const kk = key(p);
        const b = cell.get(kk);
        if (b) b.push(p);
        else cell.set(kk, [p]);
      }
    }
    return out;
  }

  /**
   * Fits a convex polygon to usable ground: edges are densified, vertices that fail are pulled
   * toward the centroid until they pass, spikes are smoothed (only ever inward) and, with `wobble`
   * (m), edges get a slight hand-drawn irregularity. Null if too little survives.
   */
  fit(poly: Poly, rule: GroundRule, rnd: () => number, wobble = 0, minKeep = 0.4): Poly | null {
    const c = centroid(poly);
    if (!this.ok(c, rule)) return null;
    const step = Math.max(5, this.terrain.cs * 0.5);
    const pts: Pt[] = [];
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      const m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let t = 0; t < m; t++) pts.push([a[0] + ((b[0] - a[0]) * t) / m, a[1] + ((b[1] - a[1]) * t) / m]);
    }
    const at = (v: Pt, s: number): Pt => [c[0] + (v[0] - c[0]) * s, c[1] + (v[1] - c[1]) * s];
    let moved = false;
    const scale = pts.map((v) => {
      if (this.ok(v, rule)) return 1;
      moved = true;
      for (let s = 0.9; s >= 0.12; s -= 0.08) if (this.ok(at(v, s), rule)) return s * 0.97;
      return 0.1;
    });
    const N = pts.length;
    if (moved) {
      // Two passes of inward-only smoothing so pulled-in stretches have soft, natural ends.
      for (let pass = 0; pass < 2; pass++) {
        const prev = scale.slice();
        for (let k = 0; k < N; k++) {
          const avg = (prev[(k + N - 1) % N] + 2 * prev[k] + prev[(k + 1) % N]) / 4;
          scale[k] = Math.min(prev[k], avg);
        }
      }
    }
    if (wobble > 0) {
      for (let k = 0; k < N; k++) {
        const r = Math.hypot(pts[k][0] - c[0], pts[k][1] - c[1]);
        if (r > 1) scale[k] *= 1 - (rnd() * wobble) / r;
      }
    }
    let out: Poly = pts.map((v, k) => at(v, scale[k]));
    // Drop nearly collinear vertices to keep feature sizes down.
    out = out.filter((v, k) => {
      const a = out[(k + N - 1) % N], b = out[(k + 1) % N];
      const cross = (v[0] - a[0]) * (b[1] - a[1]) - (v[1] - a[1]) * (b[0] - a[0]);
      return Math.abs(cross) > 0.4 * Math.hypot(b[0] - a[0], b[1] - a[1]) || scale[k] < 1;
    });
    if (out.length < 3 || area(out) < minKeep * area(poly)) return null;
    return out;
  }
}

/** Clips polylines (e.g. furrows) to a simple, possibly non-convex polygon. */
export function clipLines(lines: Pt[][], poly: Poly): Pt[][] {
  const res: Pt[][] = [];
  for (const line of lines) {
    for (let s = 0; s + 1 < line.length; s++) {
      const a = line[s], b = line[s + 1];
      const ts = [0, 1];
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        const rx = b[0] - a[0], ry = b[1] - a[1], sx = q[0] - p[0], sy = q[1] - p[1];
        const den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((p[0] - a[0]) * sy - (p[1] - a[1]) * sx) / den;
        const u = ((p[0] - a[0]) * ry - (p[1] - a[1]) * rx) / den;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
      }
      ts.sort((x, y) => x - y);
      for (let k = 0; k + 1 < ts.length; k++) {
        const t0 = ts[k], t1 = ts[k + 1];
        if (t1 - t0 < 1e-6) continue;
        const tm = (t0 + t1) / 2;
        if (!pointInPoly(poly, a[0] + (b[0] - a[0]) * tm, a[1] + (b[1] - a[1]) * tm)) continue;
        const p0: Pt = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
        const p1: Pt = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
        if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 1.5) res.push([p0, p1]);
      }
    }
  }
  return res;
}

/** Slope (m/m) above which fields are cut into strips along the contour (terraces). */
export const TERRACE_SLOPE = 0.06;

/**
 * On a gentle slope, cuts a convex field into strips running along the contour (terraced,
 * contour-ploughed fields); on the flat it is returned whole.
 */
export function contourStrips(q: Poly, terrain: LocalTerrain, rnd: () => number, maxSlope: number): Poly[] {
  const g = terrain.grad(centroid(q)), sl = Math.hypot(...g);
  if (sl < TERRACE_SLOPE || sl > maxSlope) return [q];
  const width = 14 + 12 * rnd() - 30 * (sl - TERRACE_SLOPE);
  return strips(q, [g[0] / sl, g[1] / sl], Math.max(9, width), 2).filter((s) => area(s) > 120);
}

/**
 * Emits a field (with furrows) or meadow fitted to the ground. Furrows are hatched on the
 * convex field (along its longest edge, which on terraces runs with the contour) and clipped
 * to the fitted outline. Some fields get a hedgerow outline. Returns the fitted polygon or null.
 */
export function plantField(
  f: Poly, kind: 'field' | 'green', ground: Ground, out: PlanOut, rnd: () => number, hedgeProb = 0,
): Poly | null {
  const fit = ground.fit(f, FIELD_GROUND, rnd, 1.2);
  if (!fit) return null;
  if (kind === 'field') {
    out.poly('field', fit, { tone: rnd() });
    for (const l of clipLines(hatch(f, 6), fit)) out.line('furrow', l);
  } else {
    out.poly('green', fit);
  }
  if (rnd() < hedgeProb) out.line('hedge', [...fit, fit[0]]);
  return fit;
}
