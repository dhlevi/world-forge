import { hashString, mulberry32, type Rng } from '../gen/rng';
import { Simplex3, fbm } from '../gen/noise';

/**
 * Caves and glades in the manner of Watabou's Cave / Glade Generator: a cave is a set of
 * chambers joined by winding passages, carved from a noisy field and traced as smooth walls,
 * with pools, boulders and stalagmites; a glade is a clearing in the forest ringed by tree
 * canopies, with a feature or two at its heart (a great tree, a pond, standing stones, a
 * stream, a camp, ruins). Both are deterministic from their seed and drawn on a 5 ft grid.
 *
 * Coordinates are local metres with x east and y south (canvas order), origin at the top-left
 * corner of the map.
 */
export type LairKind = 'cave' | 'glade';
export type Pt = [number, number];

export interface LairSite {
  id: string;
  kind: LairKind;
  name: string;
  seed: number;
  /** Size (small, medium, large) and character tags, e.g. ['large', 'sealed', 'wet']. */
  tags: string[];
  lon: number;
  lat: number;
}

export interface LairMap {
  site: LairSite;
  /** Map size (m). */
  W: number;
  H: number;
  /** Floor (cave) or clearing (glade) outlines: closed loops. */
  outlines: Pt[][];
  /** Outline points lying on the map's edge (cave mouths run off the map there). */
  onEdge: (p: Pt) => boolean;
  /** Is a point open floor / clearing? */
  open: (p: Pt) => boolean;
  water: Pt[][];
  /** Cave mouths (where a passage leaves the map), with the inward direction. */
  mouths: { p: Pt; dir: number }[];
  rocks: Pt[][];
  dots: { p: Pt; r: number }[];
  /** Glades. */
  trees: { p: Pt; r: number; shade: number }[];
  bigTree: { p: Pt; r: number } | null;
  stones: { p: Pt; w: number; h: number; a: number }[];
  stream: { pts: Pt[]; w: number } | null;
  camp: { fire: Pt; tents: { p: Pt; a: number }[] } | null;
  ruins: Pt[][];
  tufts: Pt[];
  flowers: { p: Pt; c: number }[];
}

/** Battlemap squares (5 ft). */
export const LAIR_CELL = 1.5;
/** Field sample spacing (m). */
const STEP = 0.75;

const SIZES: Record<LairKind, Record<string, [number, number]>> = {
  cave: { small: [54, 42], medium: [78, 60], large: [114, 84] },
  glade: { small: [48, 36], medium: [66, 50], large: [90, 68] },
};

const cache = new Map<string, LairMap>();

export function lairMap(site: LairSite): LairMap {
  // Ids repeat between worlds; the seed tells them apart.
  const key = `${site.id}:${site.seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = site.kind === 'cave' ? buildCave(site) : buildGlade(site);
  cache.set(key, m);
  if (cache.size > 60) cache.delete(cache.keys().next().value!);
  return m;
}

export function lairSize(site: LairSite): [number, number] {
  const size = site.tags.find((t) => t in SIZES[site.kind]) ?? 'medium';
  return SIZES[site.kind][size];
}

// ---- Scalar fields and contours --------------------------------------------------------------

class Field {
  readonly nx: number;
  readonly ny: number;
  readonly v: Float32Array;
  constructor(readonly W: number, readonly H: number, f: ((x: number, y: number) => number) | null) {
    this.nx = Math.round(W / STEP) + 1;
    this.ny = Math.round(H / STEP) + 1;
    this.v = new Float32Array(this.nx * this.ny);
    if (f) for (let j = 0; j < this.ny; j++) for (let i = 0; i < this.nx; i++) this.v[j * this.nx + i] = f(i * STEP, j * STEP);
  }

  /** Raises the field to f within a box (for stamping shapes cheaply). */
  stamp(x0: number, y0: number, x1: number, y1: number, f: (x: number, y: number) => number): void {
    const i0 = Math.max(0, Math.floor(x0 / STEP)), i1 = Math.min(this.nx - 1, Math.ceil(x1 / STEP));
    const j0 = Math.max(0, Math.floor(y0 / STEP)), j1 = Math.min(this.ny - 1, Math.ceil(y1 / STEP));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const v = f(i * STEP, j * STEP), n = j * this.nx + i;
        if (v > this.v[n]) this.v[n] = v;
      }
    }
  }

  at(p: Pt): number {
    const fx = Math.max(0, Math.min(this.nx - 1.001, p[0] / STEP)), fy = Math.max(0, Math.min(this.ny - 1.001, p[1] / STEP));
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, n = this.nx;
    const v = this.v;
    return (v[j * n + i] * (1 - tx) + v[j * n + i + 1] * tx) * (1 - ty) + (v[(j + 1) * n + i] * (1 - tx) + v[(j + 1) * n + i + 1] * tx) * ty;
  }

  /** Removes open specks and fills closed pockets smaller than the given node counts. */
  clean(minOpen: number, minSolid: number): void {
    const { nx, ny, v } = this;
    const seen = new Uint8Array(nx * ny);
    for (let s = 0; s < nx * ny; s++) {
      if (seen[s]) continue;
      const open = v[s] > 0;
      const comp = [s];
      seen[s] = 1;
      let edge = false;
      for (let q = 0; q < comp.length; q++) {
        const c = comp[q], i = c % nx, j = (c / nx) | 0;
        if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) edge = true;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
          const n = b * nx + a;
          if (!seen[n] && v[n] > 0 === open) {
            seen[n] = 1;
            comp.push(n);
          }
        }
      }
      if (open && comp.length < minOpen) for (const c of comp) v[c] = -0.05;
      if (!open && !edge && comp.length < minSolid) for (const c of comp) v[c] = 0.05;
    }
  }

  /** Closed iso-lines at level 0 (the grid is treated as surrounded by negative values). */
  contours(): Pt[][] {
    const { nx, ny, v } = this;
    const val = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= ny ? -1 : v[j * nx + i]);
    // Edge ids: horizontal edge (i,j)-(i+1,j) and vertical edge (i,j)-(i,j+1), on a grid padded by one.
    const pos = (i: number, j: number, horiz: boolean): Pt => {
      const a = val(i, j), b = horiz ? val(i + 1, j) : val(i, j + 1);
      const t = Math.abs(a - b) < 1e-9 ? 0.5 : a / (a - b);
      const x = (i + (horiz ? t : 0)) * STEP, y = (j + (horiz ? 0 : t)) * STEP;
      return [Math.max(0, Math.min(this.W, x)), Math.max(0, Math.min(this.H, y))];
    };
    const key = (i: number, j: number, h: boolean) => `${i},${j},${h ? 1 : 0}`;
    const next = new Map<string, string>();
    const point = new Map<string, Pt>();
    for (let j = -1; j < ny; j++) {
      for (let i = -1; i < nx; i++) {
        const a = val(i, j) > 0, b = val(i + 1, j) > 0, c = val(i + 1, j + 1) > 0, d = val(i, j + 1) > 0;
        const code = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const T = key(i, j, true), R = key(i + 1, j, false), B = key(i, j + 1, true), L = key(i, j, false);
        const P: Record<string, () => Pt> = {
          [T]: () => pos(i, j, true), [R]: () => pos(i + 1, j, false), [B]: () => pos(i, j + 1, true), [L]: () => pos(i, j, false),
        };
        // Segments oriented with the open side on the left.
        const segs: [string, string][] = [];
        switch (code) {
          case 1: segs.push([L, B]); break;
          case 2: segs.push([B, R]); break;
          case 3: segs.push([L, R]); break;
          case 4: segs.push([R, T]); break;
          case 5: segs.push([R, T], [L, B]); break;
          case 6: segs.push([B, T]); break;
          case 7: segs.push([L, T]); break;
          case 8: segs.push([T, L]); break;
          case 9: segs.push([T, B]); break;
          case 10: segs.push([T, L], [B, R]); break;
          case 11: segs.push([T, R]); break;
          case 12: segs.push([R, L]); break;
          case 13: segs.push([R, B]); break;
          case 14: segs.push([B, L]); break;
        }
        for (const [s0, s1] of segs) {
          next.set(s0, s1);
          if (!point.has(s0)) point.set(s0, P[s0]());
          if (!point.has(s1)) point.set(s1, P[s1]());
        }
      }
    }
    const loops: Pt[][] = [];
    const used = new Set<string>();
    for (const start of next.keys()) {
      if (used.has(start)) continue;
      const loop: Pt[] = [];
      let k: string | undefined = start;
      for (let guard = 0; k && !used.has(k) && guard < 100000; guard++) {
        used.add(k);
        loop.push(point.get(k)!);
        k = next.get(k);
      }
      if (loop.length >= 4) loops.push(smoothLoop(loop));
    }
    return loops;
  }
}

/** One pass of Chaikin smoothing on a closed loop, keeping points on the map edge in place. */
function smoothLoop(p: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k < p.length; k++) {
    const a = p[k], b = p[(k + 1) % p.length];
    out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
  }
  return out;
}

function distSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** A wandering line from a to b (midpoint displacement). */
function wander(a: Pt, b: Pt, rnd: Rng, amount: number, levels = 3): Pt[] {
  let pts: Pt[] = [a, b];
  let amp = amount;
  for (let l = 0; l < levels; l++) {
    const out: Pt[] = [pts[0]];
    for (let k = 1; k < pts.length; k++) {
      const p = pts[k - 1], q = pts[k];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const nx = -(q[1] - p[1]) / (len || 1), ny = (q[0] - p[0]) / (len || 1);
      const o = (rnd() - 0.5) * 2 * amp * len;
      out.push([(p[0] + q[0]) / 2 + nx * o, (p[1] + q[1]) / 2 + ny * o], q);
    }
    pts = out;
    amp *= 0.55;
  }
  return pts;
}

function blob(c: Pt, r: number, rnd: Rng, n = 7, rough = 0.35): Pt[] {
  const a0 = rnd() * Math.PI * 2;
  const out: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * Math.PI * 2, rr = r * (1 - rough / 2 + rough * rnd());
    out.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]);
  }
  return out;
}

const empty = (site: LairSite, W: number, H: number): Omit<LairMap, 'outlines' | 'onEdge' | 'open'> => ({
  site, W, H, water: [], mouths: [], rocks: [], dots: [], trees: [], bigTree: null, stones: [], stream: null, camp: null, ruins: [], tufts: [], flowers: [],
});

// ---- Caves -----------------------------------------------------------------------------------

function buildCave(site: LairSite): LairMap {
  const rnd = mulberry32(site.seed);
  const noise = new Simplex3(mulberry32(hashString(`cave#${site.seed}`)));
  const [W, H] = lairSize(site);
  const has = (t: string) => site.tags.includes(t);
  const k = W / 78;
  // Chambers, kept apart.
  const nCh = Math.round((has('small') ? 5 : has('large') ? 12 : 8) * (0.85 + 0.3 * rnd()));
  const ch: { c: Pt; r: number }[] = [];
  for (let t = 0; t < 400 && ch.length < nCh; t++) {
    const r = (3.8 + 7 * rnd() ** 1.4) * Math.sqrt(k);
    const c: Pt = [r + 3 + rnd() * (W - 2 * r - 6), r + 3 + rnd() * (H - 2 * r - 6)];
    if (ch.every((o) => Math.hypot(o.c[0] - c[0], o.c[1] - c[1]) > (o.r + r) * 1.15 + 3)) ch.push({ c, r });
  }
  // Passages: a spanning tree over the chambers plus the odd loop.
  const tunnels: { pts: Pt[]; w: number }[] = [];
  const inTree = [0];
  const linked = new Set<string>();
  const link = (a: number, b: number) => {
    const kk = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (linked.has(kk)) return;
    linked.add(kk);
    tunnels.push({ pts: wander(ch[a].c, ch[b].c, rnd, 0.22), w: 1.0 + 1.8 * rnd() ** 1.5 });
  };
  while (inTree.length < ch.length) {
    let best: [number, number] | null = null, bd = Infinity;
    for (const a of inTree) {
      for (let b = 0; b < ch.length; b++) {
        if (inTree.includes(b)) continue;
        const d = Math.hypot(ch[a].c[0] - ch[b].c[0], ch[a].c[1] - ch[b].c[1]);
        if (d < bd) {
          bd = d;
          best = [a, b];
        }
      }
    }
    if (!best) break;
    link(best[0], best[1]);
    inTree.push(best[1]);
  }
  for (let a = 0; a < ch.length; a++) {
    if (rnd() > 0.25) continue;
    const order = ch.map((_, b) => b).filter((b) => b !== a).sort((p, q) => Math.hypot(ch[p].c[0] - ch[a].c[0], ch[p].c[1] - ch[a].c[1]) - Math.hypot(ch[q].c[0] - ch[a].c[0], ch[q].c[1] - ch[a].c[1]));
    if (order[1] !== undefined) link(a, order[1]);
  }
  // Mouths: passages from the chambers nearest the map edge out past it (none if sealed).
  const mouths: { p: Pt; dir: number }[] = [];
  if (!has('sealed')) {
    const n = has('large') && rnd() < 0.5 ? 2 : 1;
    const sides = [0, 1, 2, 3].sort(() => rnd() - 0.5).slice(0, n);
    for (const side of sides) {
      const edgeD = (c: Pt) => [c[1], W - c[0], H - c[1], c[0]][side];
      const near = ch.reduce((a, b) => (edgeD(b.c) < edgeD(a.c) ? b : a));
      const out: Pt = side === 0 ? [near.c[0], -3] : side === 1 ? [W + 3, near.c[1]] : side === 2 ? [near.c[0], H + 3] : [-3, near.c[1]];
      tunnels.push({ pts: wander(near.c, out, rnd, 0.15, 2), w: 1.3 + 0.8 * rnd() });
      const edgeP: Pt = [Math.max(0, Math.min(W, out[0])), Math.max(0, Math.min(H, out[1]))];
      mouths.push({ p: edgeP, dir: [Math.PI / 2, Math.PI, -Math.PI / 2, 0][side] });
    }
  }
  // Chambers are lumps of two or three overlapping round halls; passages swell and narrow.
  const field = new Field(W, H, null);
  field.v.fill(-1);
  for (const c of ch) {
    const parts: { c: Pt; r: number }[] = [c];
    for (let q = 0; q < Math.floor(rnd() * 3); q++) {
      const a = rnd() * Math.PI * 2;
      parts.push({ c: [c.c[0] + Math.cos(a) * c.r * 0.6, c.c[1] + Math.sin(a) * c.r * 0.6], r: c.r * (0.5 + 0.3 * rnd()) });
    }
    for (const pp of parts) {
      field.stamp(pp.c[0] - pp.r, pp.c[1] - pp.r, pp.c[0] + pp.r, pp.c[1] + pp.r, (x, y) => 1 - Math.hypot(x - pp.c[0], y - pp.c[1]) / pp.r);
    }
  }
  for (const t of tunnels) {
    for (let q = 1; q < t.pts.length; q++) {
      const a = t.pts[q - 1], b = t.pts[q];
      const w = t.w * (0.75 + 0.5 * rnd());
      field.stamp(Math.min(a[0], b[0]) - w, Math.min(a[1], b[1]) - w, Math.max(a[0], b[0]) + w, Math.max(a[1], b[1]) + w, (x, y) => 1 - distSeg([x, y], a, b) / w);
    }
  }
  // Roughen everything; the floor is where the field stays above zero.
  for (let j = 0; j < field.ny; j++) {
    for (let i = 0; i < field.nx; i++) {
      const x = i * STEP, y = j * STEP, n = j * field.nx + i;
      if (field.v[n] < -0.6) continue;
      field.v[n] += 0.38 * fbm(noise, x / 8, y / 8, 0.5, 3) + 0.09 * noise.noise(x / 1.6, y / 1.6, 3.3);
    }
  }
  field.clean(40, 10);
  const open = (p: Pt) => field.at(p) > 0;
  const m: LairMap = { ...empty(site, W, H), outlines: field.contours(), open, onEdge: (p) => p[0] < 0.05 || p[1] < 0.05 || p[0] > W - 0.05 || p[1] > H - 0.05, mouths };

  // Pools: low noise hollows well inside the floor.
  if (has('wet') || has('flooded')) {
    const lvl = has('flooded') ? 0.05 : 0.32;
    const wf = new Field(W, H, (x, y) => Math.min(fbm(noise, x / 13 + 40, y / 13, 1.7, 2) - lvl, field.at([x, y]) - 0.18));
    wf.clean(20, 6);
    m.water = wf.contours();
  }
  const dry = (p: Pt) => !m.water.length || !inLoops(m.water, p);
  // Boulders near the walls, stalagmites in clusters, rubble.
  const area = W * H;
  for (let t = 0; t < area / 18; t++) {
    const p: Pt = [rnd() * W, rnd() * H];
    const v = field.at(p);
    if (v <= 0.06 || !dry(p)) continue;
    if (v < 0.35 && rnd() < 0.09) m.rocks.push(blob(p, 0.45 + 1.0 * rnd() ** 2, rnd, 6 + Math.floor(rnd() * 3)));
    else if (v < 0.3 && rnd() < 0.12) {
      for (let q = 0; q < 1 + Math.floor(rnd() * 4); q++) m.dots.push({ p: [p[0] + (rnd() - 0.5) * 1.6, p[1] + (rnd() - 0.5) * 1.6], r: 0.12 + 0.22 * rnd() });
    } else if (rnd() < 0.04) m.dots.push({ p, r: 0.06 + 0.06 * rnd() });
  }
  m.dots = m.dots.filter((d) => field.at(d.p) > 0.05 && dry(d.p));
  return m;
}

function inLoops(loops: Pt[][], p: Pt): boolean {
  let inside = false;
  for (const poly of loops) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
  }
  return inside;
}

// ---- Glades ----------------------------------------------------------------------------------

function buildGlade(site: LairSite): LairMap {
  const rnd = mulberry32(site.seed);
  const noise = new Simplex3(mulberry32(hashString(`glade#${site.seed}`)));
  const [W, H] = lairSize(site);
  const has = (t: string) => site.tags.includes(t);
  const c0: Pt = [W * (0.45 + 0.1 * rnd()), H * (0.45 + 0.1 * rnd())];
  const R = Math.min(W, H) * (0.3 + 0.06 * rnd());
  const asp = 0.8 + 0.4 * rnd(), rot = rnd() * Math.PI;
  // A second lobe for some clearings.
  const lobe = rnd() < 0.5 ? { c: [c0[0] + Math.cos(rot) * R * 0.9, c0[1] + Math.sin(rot) * R * 0.6] as Pt, r: R * (0.45 + 0.2 * rnd()) } : null;
  const clearing = (x: number, y: number) => {
    const dx = x - c0[0], dy = y - c0[1];
    const u = dx * Math.cos(rot) + dy * Math.sin(rot), v = (-dx * Math.sin(rot) + dy * Math.cos(rot)) / asp;
    let f = 1 - Math.hypot(u, v) / R;
    if (lobe) f = Math.max(f, 1 - Math.hypot(x - lobe.c[0], y - lobe.c[1]) / lobe.r);
    return f + 0.3 * fbm(noise, x / 9, y / 9, 0.2, 3);
  };
  const field = new Field(W, H, clearing);
  field.clean(60, 30);
  const open = (p: Pt) => field.at(p) > 0;
  const m: LairMap = { ...empty(site, W, H), outlines: field.contours(), open, onEdge: () => false };

  // Water first, so the rest keeps out of it.
  if (has('pond')) {
    const pc: Pt = has('tree') ? [c0[0] + R * 0.35 * Math.cos(rot + 2), c0[1] + R * 0.35 * Math.sin(rot + 2)] : c0;
    const pr = R * (0.28 + 0.12 * rnd());
    const pf = new Field(W, H, (x, y) => Math.min(1 - Math.hypot(x - pc[0], y - pc[1]) / pr + 0.35 * fbm(noise, x / 4, y / 4, 4.1, 2), field.at([x, y]) - 0.12));
    pf.clean(10, 6);
    m.water = pf.contours();
  }
  if (has('stream')) {
    const a = rnd() * Math.PI;
    const d: Pt = [Math.cos(a), Math.sin(a)];
    const L = Math.hypot(W, H) * 0.6;
    const mid: Pt = m.water.length ? c0 : [c0[0] + (rnd() - 0.5) * R * 0.6, c0[1] + (rnd() - 0.5) * R * 0.6];
    m.stream = { pts: [...wander([mid[0] - d[0] * L, mid[1] - d[1] * L], mid, rnd, 0.18, 4), ...wander(mid, [mid[0] + d[0] * L, mid[1] + d[1] * L], rnd, 0.18, 4).slice(1)], w: 0.8 + 0.7 * rnd() };
  }
  const wet = (p: Pt, pad = 0) => (m.water.length && inLoops(m.water, p)) || (m.stream ? m.stream.pts.some((q, k) => k > 0 && distSeg(p, m.stream!.pts[k - 1], q) < m.stream!.w + pad) : false);

  if (has('tree')) m.bigTree = { p: c0, r: 4.5 + 2.5 * rnd() };
  if (has('stones')) {
    const sc: Pt = m.bigTree || m.water.length ? [c0[0] - Math.cos(rot) * R * 0.45, c0[1] - Math.sin(rot) * R * 0.45] : c0;
    const rr = 3.5 + 3 * rnd(), n = 7 + Math.floor(rnd() * 5);
    for (let q = 0; q < n; q++) {
      if (rnd() < 0.12) continue;
      const a = (q / n) * Math.PI * 2;
      const p: Pt = [sc[0] + Math.cos(a) * rr, sc[1] + Math.sin(a) * rr];
      if (!wet(p, 0.5)) m.stones.push({ p, w: 0.8 + 0.5 * rnd(), h: 0.45 + 0.25 * rnd(), a: a + Math.PI / 2 + (rnd() - 0.5) * 0.4 });
    }
    if (!m.bigTree && rnd() < 0.6 && !wet(sc, 1)) m.stones.push({ p: sc, w: 1.4, h: 0.8, a: rnd() * Math.PI });
  }
  if (has('camp')) {
    const fire: Pt = [c0[0] + (rnd() - 0.5) * R * 0.4, c0[1] + (rnd() - 0.5) * R * 0.4];
    const tents: { p: Pt; a: number }[] = [];
    for (let q = 0; q < 2 + Math.floor(rnd() * 3); q++) {
      const a = rnd() * Math.PI * 2, d = 3.5 + 2 * rnd();
      const p: Pt = [fire[0] + Math.cos(a) * d, fire[1] + Math.sin(a) * d];
      if (field.at(p) > 0.1 && !wet(p, 1)) tents.push({ p, a: a + Math.PI });
    }
    m.camp = { fire, tents };
  }
  if (has('ruins')) {
    const rc: Pt = [c0[0] + Math.cos(rot + 1) * R * 0.3, c0[1] + Math.sin(rot + 1) * R * 0.3];
    const w = 4 + 4 * rnd(), h = 3.5 + 3 * rnd(), a = rnd() * Math.PI;
    const corner = (u: number, v: number): Pt => [rc[0] + u * Math.cos(a) - v * Math.sin(a), rc[1] + u * Math.sin(a) + v * Math.cos(a)];
    const cs = [corner(-w / 2, -h / 2), corner(w / 2, -h / 2), corner(w / 2, h / 2), corner(-w / 2, h / 2)];
    for (let q = 0; q < 4; q++) {
      const p = cs[q], r = cs[(q + 1) % 4];
      // Broken walls: each side keeps one or two stretches.
      const t0 = rnd() * 0.3, t1 = 0.5 + rnd() * 0.5;
      if (rnd() < 0.85) m.ruins.push([[p[0] + (r[0] - p[0]) * t0, p[1] + (r[1] - p[1]) * t0], [p[0] + (r[0] - p[0]) * t1, p[1] + (r[1] - p[1]) * t1]]);
    }
  }
  const busy = (p: Pt, pad: number) =>
    (m.bigTree && Math.hypot(p[0] - m.bigTree.p[0], p[1] - m.bigTree.p[1]) < m.bigTree.r + pad) ||
    m.stones.some((s) => Math.hypot(p[0] - s.p[0], p[1] - s.p[1]) < 1 + pad) ||
    (m.camp && Math.hypot(p[0] - m.camp.fire[0], p[1] - m.camp.fire[1]) < 6 + pad) || wet(p, pad);

  // The forest: canopies packed on a jittered grid outside the clearing, a few stragglers inside.
  const sp = 3.3;
  for (let y = -2; y < H + 3; y += sp * 0.87) {
    for (let x = -2 + (Math.round(y / sp) % 2) * sp * 0.5; x < W + 3; x += sp) {
      const p: Pt = [x + (rnd() - 0.5) * sp * 0.7, y + (rnd() - 0.5) * sp * 0.7];
      const f = clearing(p[0], p[1]);
      if (f > 0.2 || (f > -0.05 && rnd() < 0.6) || (f > 0 && rnd() < 0.9)) continue;
      if (wet(p, 1.2)) continue;
      m.trees.push({ p, r: 2 + 1.8 * rnd(), shade: rnd() });
    }
  }
  if (has('rocks') || rnd() < 0.4) {
    for (let q = 0; q < 3 + Math.floor(rnd() * 6); q++) {
      const p: Pt = [c0[0] + (rnd() - 0.5) * R * 1.6, c0[1] + (rnd() - 0.5) * R * 1.6];
      if (field.at(p) > 0.05 && !busy(p, 1)) m.rocks.push(blob(p, 0.4 + 1.1 * rnd() ** 2, rnd, 6));
    }
  }
  // Grass tufts and flowers in the open.
  for (let t = 0; t < (W * H) / 6; t++) {
    const p: Pt = [rnd() * W, rnd() * H];
    if (field.at(p) <= 0.04 || busy(p, 0.3)) continue;
    if (has('flowers') && rnd() < 0.25) {
      const c = Math.floor(fbm(noise, p[0] / 6, p[1] / 6, 7, 1) * 3 + 3) % 3;
      for (let q = 0; q < 3; q++) m.flowers.push({ p: [p[0] + (rnd() - 0.5), p[1] + (rnd() - 0.5)], c });
    } else if (rnd() < (has('dry') ? 0.35 : 0.6)) m.tufts.push(p);
  }
  return m;
}
