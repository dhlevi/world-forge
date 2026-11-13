/**
 * What every kind of lair shares (lair.ts, pass.ts, deep.ts): the types of a lair and its map, the
 * size of a site, the scalar field that is carved and traced into walls, the small geometry
 * helpers, the blank map, and the notes for each numbered place. Kept apart from the builders so
 * that they can all use it without importing one another.
 */
import type { Rng } from '../gen/rng';
import { type KeyNote, roomNotes, senseDetail } from '../keys/flavour';
import { DMath } from '../dmath';

export type LairKind = 'cave' | 'glade' | 'pass' | 'deep';
export type Pt = [number, number];

export interface LairSite {
  id: string;
  kind: LairKind;
  name: string;
  /** The name in English. */
  en?: string;
  seed: number;
  /** Size (small, medium, large) and character tags, e.g. ['large', 'sealed', 'wet']. */
  tags: string[];
  lon: number;
  lat: number;
  /** Passes: the way the road runs over the saddle (radians, map x east and y south). */
  dir?: number;
  /** Deep caves: the cavern of the Underworld their deepest passage leads down to (and its node). */
  deepTo?: string;
  deepNode?: number;
  /** Caverns of the Underworld: what kind, which tier, where its tunnels lead, its shafts, its city or its horror. */
  deep?: DeepInfo;
  /** A druid circle's sacred grove: the circle's key (lore/orders.ts). */
  order?: string;
}

/** A way out of a cavern: to another cavern (node) or up to the surface (lon, lat). */
export interface DeepWay {
  name: string;
  node?: number;
  lon?: number;
  lat?: number;
}

export interface DeepInfo {
  kind: string;
  tier: 0 | 1;
  exits: DeepWay[];
  up?: DeepWay;
  down?: DeepWay;
  /** A city of the deep in the cavern (gen/deep-peoples.ts). */
  city?: { name: string; en: string; kind: string; pop: number; capital: boolean; template: string; people: string; realm?: string; realmId?: number; ruler?: string; title?: string };
  /** What lurks here, in the lowest deep. */
  horror?: string;
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
  /** Cave levels: this map is level 0 (the entrance level); `levels` lists every level, itself first. */
  level: number;
  levels: LairMap[];
  /** Ways between levels on this level: down to the next or up to the one above, at the same spot on both. */
  links: LairLink[];
  /** Level name for the tabs ("Inside the hollow oak"); levels without one are numbered. */
  levelName?: string;
  /** Drawn as a hollow (cave style) whatever the site's kind: the inside of a great tree. */
  interior?: boolean;
  /** Groves: paths between the clearings (centre lines), huts and shrines, and the numbered key. */
  paths: Pt[][];
  things: { kind: 'hut' | 'shrine' | 'altar' | 'well'; p: Pt; a: number; w: number; h: number }[];
  rooms: LairRoom[];
  /** Groves: the adventure hook printed above the key. */
  hook?: string;
  /** Passes: bridges and fords over the stream, tunnels through a spur, snow fields and cairns. */
  bridges?: { a: Pt; b: Pt; rope: boolean }[];
  fords?: Pt[];
  tunnels?: Pt[][];
  snow?: Pt[][];
  cairns?: Pt[];
  /** Passes: the trail's centre line (drawn as a worn track). */
  trail?: Pt[];
  /** Caverns: chasms (dark pits), crystal clusters, and lava in place of water. */
  chasms?: Pt[][];
  crystals?: Pt[][];
  lava?: boolean;
  /** Caverns: the buildings of a city of the deep (by kind: spire, compound, temple, burrow, workshop, hall, forge, pen, gate, tower, ring). */
  blds?: { kind: string; p: Pt; w: number; h: number; a: number }[];
  /** Places on the map that lead elsewhere when clicked: a tunnel's mouth, a shaft, a deep cave's way down. */
  gotos?: { p: Pt; r: number; to: DeepWay }[];
}

export interface LairRoom {
  /** Creature, hazard and treasure notes. */
  notes?: KeyNote[];
  n: number;
  p: Pt;
  name: string;
  text: string;
}

export type LinkStyle = 'stairs' | 'shaft' | 'slope';
export interface LairLink {
  p: Pt;
  dir: 'up' | 'down';
  /** The level it leads to. */
  to: number;
  style: LinkStyle;
  /** Its caption, where not "Down to level n" (a cavern's shafts name where they lead). */
  caption?: string;
}

/** Number of cave levels, from the site's tags ("3 levels"); 1 when not tagged. */
export function lairLevels(site: LairSite): number {
  for (const t of site.tags) {
    const m = /^(\d) levels$/.exec(t);
    if (m) return Math.max(1, Math.min(4, +m[1]));
  }
  return 1;
}

/** Battlemap squares (5 ft). */
export const LAIR_CELL = 1.5;
/** Field sample spacing (m). */
export const STEP = 0.75;

const SIZES: Record<LairKind, Record<string, [number, number]>> = {
  cave: { small: [54, 42], medium: [78, 60], large: [114, 84] },
  glade: { small: [60, 45], medium: [84, 63], large: [114, 84] },
  pass: { small: [84, 84], medium: [108, 102], large: [132, 120] },
  deep: { small: [120, 90], medium: [138, 104], large: [156, 118] },
};

export function lairSize(site: LairSite): [number, number] {
  const size = site.tags.find((t) => t in SIZES[site.kind]) ?? 'medium';
  return SIZES[site.kind][size];
}

// ---- Scalar fields and contours --------------------------------------------------------------

export class Field {
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
export function smoothLoop(p: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k < p.length; k++) {
    const a = p[k], b = p[(k + 1) % p.length];
    out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
  }
  return out;
}

export function distSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return DMath.hypot2(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** A wandering line from a to b (midpoint displacement). */
export function wander(a: Pt, b: Pt, rnd: Rng, amount: number, levels = 3): Pt[] {
  let pts: Pt[] = [a, b];
  let amp = amount;
  for (let l = 0; l < levels; l++) {
    const out: Pt[] = [pts[0]];
    for (let k = 1; k < pts.length; k++) {
      const p = pts[k - 1], q = pts[k];
      const len = DMath.hypot2(q[0] - p[0], q[1] - p[1]);
      const nx = -(q[1] - p[1]) / (len || 1), ny = (q[0] - p[0]) / (len || 1);
      const o = (rnd() - 0.5) * 2 * amp * len;
      out.push([(p[0] + q[0]) / 2 + nx * o, (p[1] + q[1]) / 2 + ny * o], q);
    }
    pts = out;
    amp *= 0.55;
  }
  return pts;
}

export function blob(c: Pt, r: number, rnd: Rng, n = 7, rough = 0.35): Pt[] {
  const a0 = rnd() * Math.PI * 2;
  const out: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * Math.PI * 2, rr = r * (1 - rough / 2 + rough * rnd());
    out.push([c[0] + DMath.cos(a) * rr, c[1] + DMath.sin(a) * rr]);
  }
  return out;
}

export const empty = (site: LairSite, W: number, H: number): Omit<LairMap, 'outlines' | 'onEdge' | 'open'> => ({
  site, W, H, water: [], mouths: [], rocks: [], dots: [], trees: [], bigTree: null, stones: [], stream: null, camp: null, ruins: [], tufts: [], flowers: [],
  level: 0, levels: [], links: [], paths: [], things: [], rooms: [],
});

/** Creatures, hazards, treasure and a detail for the senses, for every numbered place on every level. */
export function annotate(levels: LairMap[], kind: 'cave' | 'grove' | 'pass' | 'deep', rnd: Rng): void {
  const used = new Set<string>();
  levels.forEach((m, L) => {
    for (const r of m.rooms) {
      const tag = (r as LairRoom & { tag?: string }).tag ?? (r.name === 'Hoard' ? 'hollow' : '');
      // A detail for the senses, each used at most twice in a site.
      const sense = senseDetail(kind, rnd);
      if (sense && !used.has(`2:${sense}`)) {
        used.add(used.has(`1:${sense}`) ? `2:${sense}` : `1:${sense}`);
        r.text += ` ${sense}`;
      }
      r.notes = roomNotes(kind, rnd, { tag, entry: tag === 'mouth' || (L === 0 && r.n === 1), depth: L, used });
    }
  });
}

export function inLoops(loops: Pt[][], p: Pt): boolean {
  let inside = false;
  for (const poly of loops) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
  }
  return inside;
}
