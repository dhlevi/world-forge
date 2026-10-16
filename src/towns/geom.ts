/** Planar geometry in local metres (x east, y north). Polygons are CCW without a closing vertex. */

export type Pt = [number, number];
export type Poly = Pt[];

export function area(p: Poly): number {
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return s / 2;
}

/** Isoperimetric ratio 4πA/P²: 1 for a circle, ~0.79 for a square, small for slivers. */
export function compactness(p: Poly): number {
  let per = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    per += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return per > 0 ? (4 * Math.PI * Math.abs(area(p))) / (per * per) : 0;
}

export function centroid(p: Poly): Pt {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const f = p[j][0] * p[i][1] - p[i][0] * p[j][1];
    cx += (p[j][0] + p[i][0]) * f;
    cy += (p[j][1] + p[i][1]) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) return [p[0][0], p[0][1]];
  return [cx / (3 * a), cy / (3 * a)];
}

export function ccw(p: Poly): Poly {
  return area(p) < 0 ? [...p].reverse() : p;
}

/** Keeps the part of p where (x - o)·n >= off (n need not be unit length if off is 0). */
export function clipHalf(p: Poly, ox: number, oy: number, nx: number, ny: number, off: number): Poly {
  const out: Poly = [];
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    const da = (a[0] - ox) * nx + (a[1] - oy) * ny - off;
    const db = (b[0] - ox) * nx + (b[1] - oy) * ny - off;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Shrinks a convex CCW polygon by a per-edge distance (edge i runs p[i] → p[i+1]). */
export function inset(p: Poly, offsets: number[] | number): Poly | null {
  let r = p;
  const n = p.length;
  for (let i = 0; i < n && r.length >= 3; i++) {
    const off = typeof offsets === 'number' ? offsets : offsets[i];
    if (off <= 0) continue;
    const a = p[i], b = p[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    r = clipHalf(r, a[0], a[1], -(b[1] - a[1]) / len, (b[0] - a[0]) / len, off);
  }
  return r.length >= 3 && area(r) > 1 ? r : null;
}

/** Cuts a convex polygon into strips perpendicular to unit vector n (e.g. terraces along contours), with gaps. */
export function strips(p: Poly, n: Pt, width: number, gap: number): Poly[] {
  let lo = Infinity, hi = -Infinity;
  for (const q of p) {
    const v = q[0] * n[0] + q[1] * n[1];
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const count = Math.max(1, Math.round((hi - lo) / width));
  const w = (hi - lo) / count;
  const out: Poly[] = [];
  for (let k = 0; k < count; k++) {
    const a = lo + k * w + (k > 0 ? gap / 2 : 0), b = lo + (k + 1) * w - (k < count - 1 ? gap / 2 : 0);
    const s = clipHalf(clipHalf(p, 0, 0, n[0], n[1], a), 0, 0, -n[0], -n[1], -b);
    if (s.length >= 3 && area(s) > 4) out.push(s);
  }
  return out;
}

/** Irregular rounded blob (spoil heaps, ponds). */
export function blob(c: Pt, r: number, rnd: () => number, n = 10): Poly {
  const ph = rnd() * 6, a1 = 0.15 + rnd() * 0.15, a2 = rnd() * 0.12;
  const out: Poly = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * 2 * Math.PI;
    const rr = r * (1 + a1 * Math.sin(2 * t + ph) + a2 * Math.sin(3 * t - ph));
    out.push([c[0] + rr * Math.cos(t), c[1] + rr * Math.sin(t)]);
  }
  return out;
}

/** Pointed boat hull of length l and beam w, bow towards `angle`. */
export function hull(c: Pt, angle: number, l: number, w: number): Poly {
  const shape: Pt[] = [[l / 2, 0], [l * 0.25, w / 2], [-l * 0.4, w / 2], [-l / 2, w * 0.3], [-l / 2, -w * 0.3], [-l * 0.4, -w / 2], [l * 0.25, -w / 2]];
  const co = Math.cos(angle), si = Math.sin(angle);
  return shape.map(([x, y]) => [c[0] + x * co - y * si, c[1] + x * si + y * co] as Pt);
}

/** Joins line segments that share endpoints into polylines. */
export function joinSegments(segs: [Pt, Pt][]): Pt[][] {
  const k = (p: Pt) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
  const ends = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const p of s) {
      const list = ends.get(k(p));
      if (list) list.push(i);
      else ends.set(k(p), [i]);
    }
  });
  const used = new Uint8Array(segs.length);
  const lines: Pt[][] = [];
  const extend = (line: Pt[]) => {
    for (;;) {
      const tail = line[line.length - 1];
      const next = (ends.get(k(tail)) ?? []).find((i) => !used[i]);
      if (next === undefined) return;
      used[next] = 1;
      const [a, b] = segs[next];
      line.push(k(a) === k(tail) ? b : a);
    }
  };
  segs.forEach((s, i) => {
    if (used[i]) return;
    used[i] = 1;
    const line: Pt[] = [s[0], s[1]];
    extend(line);
    line.reverse();
    extend(line);
    lines.push(line);
  });
  return lines;
}

/** Cuts a convex polygon by the line through m with unit normal n, leaving a gap of 2·halfGap. */
export function split(p: Poly, m: Pt, n: Pt, halfGap = 0): [Poly, Poly] {
  return [clipHalf(p, m[0], m[1], n[0], n[1], halfGap), clipHalf(p, m[0], m[1], -n[0], -n[1], halfGap)];
}

export function longestEdge(p: Poly): number {
  let best = 0, bestLen = -1;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > bestLen) {
      bestLen = l;
      best = i;
    }
  }
  return best;
}

export function pointInPoly(p: Poly, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSeg(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) : 0;
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}

export function distToLine(pts: Pt[], x: number, y: number): number {
  let d = Infinity;
  for (let k = 0; k + 1 < pts.length; k++) d = Math.min(d, distToSeg(x, y, pts[k], pts[k + 1]));
  return d;
}

function segsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

export function segHitsPoly(p: Poly, a: Pt, b: Pt): boolean {
  if (pointInPoly(p, a[0], a[1]) || pointInPoly(p, b[0], b[1])) return true;
  for (let i = 0; i < p.length; i++) if (segsCross(a, b, p[i], p[(i + 1) % p.length])) return true;
  return false;
}

export function rect(cx: number, cy: number, angle: number, w: number, h: number): Poly {
  const c = Math.cos(angle), s = Math.sin(angle);
  return ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as Pt[]).map(
    ([x, y]) => [cx + x * c - y * s, cy + x * s + y * c] as Pt,
  );
}

/** Rectangle aligned with p's longest edge, centred on its centroid, covering about `frac` of its bounding box, clipped to p. */
export function rectIn(p: Poly, frac: number): Poly | null {
  const e = longestEdge(p);
  const a = p[e], b = p[(e + 1) % p.length];
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const [cx, cy] = centroid(p);
  const c = Math.cos(ang), s = Math.sin(ang);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, y] of p) {
    const u = (x - cx) * c + (y - cy) * s, v = -(x - cx) * s + (y - cy) * c;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const k = Math.sqrt(frac);
  let r = rect(cx, cy, ang, (u1 - u0) * k, (v1 - v0) * k);
  for (let i = 0; i < p.length && r.length >= 3; i++) {
    const q0 = p[i], q1 = p[(i + 1) % p.length];
    r = clipHalf(r, q0[0], q0[1], -(q1[1] - q0[1]), q1[0] - q0[0], 0);
  }
  return r.length >= 3 && area(r) > 4 ? r : null;
}

/**
 * Recursive lot subdivision: cut perpendicular to the longest edge near its middle until lots
 * are small, sometimes leaving an alley (the chance falls by `decay` at each level; 1 keeps an
 * alley at every cut). Gives Watabou-style blocks of terraced buildings; `skew` tilts the cuts.
 */
export function subdivide(
  p: Poly, minArea: number, rnd: () => number, alley = 0, alleyChance = 0, out: Poly[] = [], depth = 0, decay = 0.7, skew = 0.25,
): Poly[] {
  const a = area(p);
  if (a < minArea * (1 + rnd()) || depth > 14) {
    if (a > minArea * 0.25) out.push(p);
    return out;
  }
  const e = longestEdge(p);
  const q0 = p[e], q1 = p[(e + 1) % p.length];
  const len = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]);
  const t = 0.4 + 0.2 * rnd();
  const m: Pt = [q0[0] + (q1[0] - q0[0]) * t, q0[1] + (q1[1] - q0[1]) * t];
  // Slight skew keeps blocks from looking like a grid.
  const sk = (rnd() - 0.5) * skew;
  let nx = (q1[0] - q0[0]) / len, ny = (q1[1] - q0[1]) / len;
  [nx, ny] = [nx - ny * sk, ny + nx * sk];
  const nl = Math.hypot(nx, ny);
  const gap = rnd() < alleyChance ? alley / 2 : 0;
  const [l, r] = split(p, m, [nx / nl, ny / nl], gap);
  if (l.length >= 3) subdivide(l, minArea, rnd, alley, alleyChance * decay, out, depth + 1, decay, skew);
  if (r.length >= 3) subdivide(r, minArea, rnd, alley, alleyChance * decay, out, depth + 1, decay, skew);
  return out;
}

/** Parallel lines across a convex polygon (ploughed furrows), spaced `gap` m along its longest edge. */
export function hatch(p: Poly, gap: number): Pt[][] {
  const e = longestEdge(p);
  const a = p[e], b = p[(e + 1) % p.length];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
  // Lines run parallel to the edge; step along its normal.
  const nx = -uy, ny = ux;
  let lo = Infinity, hi = -Infinity;
  for (const [x, y] of p) {
    const v = (x - a[0]) * nx + (y - a[1]) * ny;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const lines: Pt[][] = [];
  for (let v = lo + gap / 2; v < hi; v += gap) {
    let t0 = Infinity, t1 = -Infinity;
    for (let i = 0; i < p.length; i++) {
      const q0 = p[i], q1 = p[(i + 1) % p.length];
      const d0 = (q0[0] - a[0]) * nx + (q0[1] - a[1]) * ny - v, d1 = (q1[0] - a[0]) * nx + (q1[1] - a[1]) * ny - v;
      if ((d0 >= 0) === (d1 >= 0)) continue;
      const s = d0 / (d0 - d1);
      const x = q0[0] + (q1[0] - q0[0]) * s, y = q0[1] + (q1[1] - q0[1]) * s;
      const t = (x - a[0]) * ux + (y - a[1]) * uy;
      t0 = Math.min(t0, t);
      t1 = Math.max(t1, t);
    }
    if (t1 - t0 < 2) continue;
    const bx = a[0] + nx * v, by = a[1] + ny * v;
    lines.push([[bx + ux * t0, by + uy * t0], [bx + ux * t1, by + uy * t1]]);
  }
  return lines;
}

/**
 * How rectangular a polygon is: its area over that of the smallest rectangle around it (with a
 * side along one of its edges); 1 for a rectangle, 0.5 for a triangle.
 */
export function rectangularity(p: Poly): number {
  const A = area(p);
  let best = Infinity;
  for (let k = 0; k < p.length; k++) {
    const a = p[k], b = p[(k + 1) % p.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(ang), s = Math.sin(ang);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, y] of p) {
      const u = x * c + y * s, v = -x * s + y * c;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    best = Math.min(best, (u1 - u0) * (v1 - v0));
  }
  return best > 0 ? A / best : 0;
}

/**
 * The largest rectangle inside a convex polygon with one side on edge `e` (a house fronting the
 * street on an odd-shaped lot), or null if none is at least `minSide` m on each side.
 */
export function frontRect(p: Poly, e: number, minSide = 3.5): Poly | null {
  const a = p[e], b = p[(e + 1) % p.length];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < minSide) return null;
  const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
  // Inward normal: toward the centroid.
  const c = centroid(p);
  let nx = -uy, ny = ux;
  if ((c[0] - a[0]) * nx + (c[1] - a[1]) * ny < 0) [nx, ny] = [-nx, -ny];
  const local = p.map(([x, y]): Pt => [(x - a[0]) * ux + (y - a[1]) * uy, (x - a[0]) * nx + (y - a[1]) * ny]);
  let depth = 0;
  for (const [, v] of local) depth = Math.max(depth, v);
  // The polygon's extent along the front at depth v (convex: one interval).
  const span = (v: number): [number, number] => {
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < local.length; k++) {
      const [u0, v0] = local[k], [u1, v1] = local[(k + 1) % local.length];
      if ((v0 - v) * (v1 - v) > 0 || v0 === v1) {
        if (Math.abs(v0 - v) < 1e-9) { lo = Math.min(lo, u0); hi = Math.max(hi, u0); }
        continue;
      }
      const u = u0 + ((u1 - u0) * (v - v0)) / (v1 - v0);
      lo = Math.min(lo, u);
      hi = Math.max(hi, u);
    }
    return [lo, hi];
  };
  let best: [number, number, number] | null = null, bestA = 0;
  const steps = 24;
  for (let q = 1; q <= steps; q++) {
    const h = (depth * q) / steps;
    if (h < minSide) continue;
    const [a0, b0] = span(0.01), [a1, b1] = span(h - 0.01);
    const lo = Math.max(a0, a1), hi = Math.min(b0, b1);
    const w = hi - lo;
    // A slight preference for deeper houses over long thin sheds along the street.
    const score = w * h * Math.min(1, h / 5);
    if (w >= minSide && score > bestA) {
      bestA = score;
      best = [lo, hi, h];
    }
  }
  if (!best) return null;
  const [lo, hi, h] = best;
  const at = (u: number, v: number): Pt => [a[0] + ux * u + nx * v, a[1] + uy * u + ny * v];
  return [at(lo, 0), at(hi, 0), at(hi, h), at(lo, h)];
}
