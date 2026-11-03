import { KOPPEN_CLASSES } from '../gen/koppen';
import { hashString, mulberry32 } from '../gen/rng';
import type { Pt } from './geom';
import type { LocalFrame, PlanFeature } from './plan';

/**
 * Illustrates a town drawn as an old bird's-eye map style, each building raised on
 * its footprint with its front walls and its roof seen from the south and above. A point at
 * height z is drawn `K * z` metres north of where it stands, so the map must face north while
 * the style is on. Everything here is drawn from the finished plan (its footprints, walls,
 * towers and trees) and takes nothing from the plan's random streams, so the plan itself and
 * every id in it stay exactly as they are.
 *
 * Faces are `ill` polygons with a colour (`c`), an outline (`o`) and their place in the drawing
 * order (`z`, which a click uses to find the frontmost): the farther north a solid stands, the
 * earlier its faces come, so nearer roofs overlap those behind them (the map draws a layer's
 * features in the order they are given). Shadows on the ground are `ills` polygons, drawn beneath all the faces.
 */
export const ILL_K = 0.55;

const INK = '#3f3126';
type V = [number, number, number];
type Roof = 'gable' | 'hip' | 'flat' | 'spire' | 'cone' | 'dome';

interface Mat {
  roof: string;
  wall: string;
}

const ROOFS: Record<string, string[]> = {
  tile: ['#a35f45', '#985640', '#ad6a4e', '#8f5240', '#a8654c', '#9b5c47'],
  slate: ['#77746f', '#6d6b68', '#817d76', '#72716e'],
  shingle: ['#7d6550', '#735c48', '#87705a', '#6a5644', '#806852'],
  thatch: ['#bba070', '#ae9465', '#c2a878', '#a68d62'],
  flat: ['#d9c7a0', '#cfbd94', '#e0d0ad', '#d4c19a'],
  turf: ['#7f8f5a', '#748553', '#8a9a62'],
};
const WALLS: Record<string, string[]> = {
  plaster: ['#e8dfc6', '#e2d6b8', '#ddd0ae', '#eae2cd', '#e4dac0'],
  white: ['#efe9da', '#ebe3d0', '#f1ecdf'],
  timber: ['#d8c8a4', '#cfbd98', '#d3c19c'],
  stone: ['#c2baa8', '#b8b09e', '#cbc3b0', '#bdb5a2'],
  mud: ['#d4bb8e', '#cdb183', '#d9c299'],
  wood: ['#a88a64', '#9c7f5a', '#b09270'],
};

/** Climate group of a Köppen class: what the houses are roofed and walled with. */
function climate(kp: number): 'tropic' | 'desert' | 'steppe' | 'med' | 'temperate' | 'cold' | 'polar' {
  const code = KOPPEN_CLASSES[kp]?.code ?? 'Cfb';
  if (code.startsWith('A')) return 'tropic';
  if (code.startsWith('BW')) return 'desert';
  if (code.startsWith('B')) return 'steppe';
  if (code.startsWith('Cs')) return 'med';
  if (code.startsWith('C')) return 'temperate';
  if (code.startsWith('D')) return 'cold';
  return 'polar';
}

function pick<T>(r: () => number, xs: T[]): T {
  return xs[Math.floor(r() * xs.length) % xs.length];
}

function weighted(r: () => number, ws: [string, number][]): string {
  const t = ws.reduce((a, w) => a + w[1], 0) * r();
  let acc = 0;
  for (const [k, w] of ws) {
    acc += w;
    if (t < acc) return k;
  }
  return ws[ws.length - 1][0];
}

/** A colour lightened (f > 1) or darkened (f < 1). */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

const area = (p: Pt[]) => p.reduce((a, q, k) => a + q[0] * p[(k + 1) % p.length][1] - p[(k + 1) % p.length][0] * q[1], 0) / 2;
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const at = (p: Pt, z: number): V => [p[0], p[1], z];

/** A face's brightness by the way it faces: lit from the south-west, the viewer's side. */
function lit(nx: number, ny: number): number {
  const l = Math.hypot(nx, ny) || 1;
  return 0.9 + 0.13 * (-(nx / l) * 0.55 - (ny / l) * 0.8);
}

class Painter {
  readonly out: PlanFeature[] = [];
  /** Faces are drawn in the order they are made (`z` records it). */
  private seq = 0;

  constructor(private frame: LocalFrame, private ppm20: number) {}

  private ring(pts: Pt[]): number[][] {
    const r = pts.map((p) => this.frame.toLL(p));
    r.push(r[0]);
    return r;
  }

  /** A face through points in space, drawn where the oblique view puts them. */
  face(pts: V[], c: string, _order: number, o = INK, extra?: Record<string, string | number>): void {
    if (pts.length < 3) return;
    const flat = pts.map((v) => [v[0], v[1] + v[2] * ILL_K] as Pt);
    if (Math.abs(area(flat)) < 0.01) return;
    this.out.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [this.ring(flat)] }, properties: { kind: 'ill', c, o, z: this.seq++, ppm20: this.ppm20, ...(extra ?? {}) } });
  }

  shadow(pts: Pt[]): void {
    if (pts.length < 3) return;
    this.out.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [this.ring(pts)] }, properties: { kind: 'ills', ppm20: this.ppm20 } });
  }
}

/** A solid to draw: its faces are emitted later, the northernmost solids first. */
interface Solid {
  front: number;
  draw: (key: (i: number) => number) => void;
}

/** Faces of a solid in order, each with its own key just above the solid's. */
function keyer(front: number, base: number): (i: number) => number {
  return (i: number) => -front * 10 + base * 0.5 + i * 1e-3;
}

interface Opts {
  h: number;
  pitch: number;
  roof: Roof;
  mat: Mat;
  crenel?: boolean;
  extra?: Record<string, string | number>;
  /** Shade of the roof jittered a little, house by house. */
  jit: number;
  /** A stream for placing windows and a door, for buildings that have them. */
  win?: () => number;
  /** Drawn after (in front of) what shares its front edge. */
  ahead?: number;
}

/**
 * The walls of the edges of `p` that face south (toward the viewer), from the ground to `h`,
 * shaded by the way they face. With `ends`, an edge's wall reaches up to a ridge point.
 */
function walls(P: Painter, p: Pt[], h: number, wall: string, key: (i: number) => number, ends?: Map<number, V>, extra?: Record<string, string | number>, win?: () => number): number {
  let k = 0;
  const ccw = area(p) > 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const nx = ccw ? dy : -dy, ny = ccw ? -dx : dx;
    if (ny >= -1e-6) continue;
    const top = ends?.get(i);
    const pts: V[] = [at(a, 0), at(b, 0), at(b, h), ...(top ? [top] : []), at(a, h)];
    P.face(pts, shade(wall, nx < 0 ? 1 : 0.84 + 0.1 * (-ny / Math.hypot(nx, ny))), key(k++), INK, extra);
    // Windows (and a door) in walls that face the viewer.
    const len = Math.hypot(dx, dy);
    if (win && len >= 3.2 && h >= 2.6 && -ny / len > 0.6) k = openings(P, a, b, len, h, win, key, k, extra);
  }
  return k;
}

/** A door and rows of windows along a wall from a to b, by a stream of the building's own. */
function openings(P: Painter, a: Pt, b: Pt, len: number, h: number, r: () => number, key: (i: number) => number, k: number, extra?: Record<string, string | number>): number {
  const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
  const along = (t: number): Pt => [a[0] + ux * t, a[1] + uy * t];
  const pane = (t0: number, t1: number, z0: number, z1: number, col: string) => {
    const p0 = along(t0), p1 = along(t1);
    P.face([at(p0, z0), at(p1, z0), at(p1, z1), at(p0, z1)], col, key(k++), col, extra);
  };
  const n = Math.min(4, Math.floor(len / 2.6));
  const rows = h > 5.4 ? 2 : 1;
  const door = r() < 0.75 ? Math.floor(r() * n) : -1;
  for (let j = 0; j < n; j++) {
    const t = (len * (j + 0.5)) / n;
    for (let row = 0; row < rows; row++) {
      if (row === 0 && j === door) {
        pane(t - 0.55, t + 0.55, 0, Math.min(2.1, h * 0.6), '#5d4632');
        continue;
      }
      const z = rows === 2 ? (row === 0 ? h * 0.18 : h * 0.6) : h * 0.35;
      pane(t - 0.4, t + 0.4, z, z + Math.min(1.2, h * 0.22), '#4f4638');
    }
  }
  return k;
}

/** Battlements: merlons standing on each edge of a flat top at height `h`. */
function merlons(P: Painter, p: Pt[], h: number, col: string, key: (i: number) => number, k0: number, step = 2.2, size = 1.1): void {
  let k = k0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const len = dist(a, b);
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    for (let t = step * 0.3; t + size <= len; t += step) {
      const s: Pt = [a[0] + ux * t, a[1] + uy * t], e: Pt = [a[0] + ux * (t + size), a[1] + uy * (t + size)];
      P.face([at(s, h), at(e, h), at(e, h + size), at(s, h + size)], col, key(k++));
    }
  }
}

/** A building of four corners: walls, and a gabled, hipped, flat or spired roof. */
function quadSolid(P: Painter, q0: Pt[], o: Opts): Solid {
  let q = area(q0) > 0 ? q0.slice() : q0.slice().reverse();
  // The long sides are q0-q1 and q2-q3; the short ends q1-q2 and q3-q0.
  if (dist(q[0], q[1]) + dist(q[2], q[3]) < dist(q[1], q[2]) + dist(q[3], q[0])) q = [q[1], q[2], q[3], q[0]];
  const front = Math.min(...q.map((v) => v[1])) - (o.ahead ?? 0);
  return {
    front,
    draw: (key) => {
      const { h, mat } = o;
      const m0 = mid(q[3], q[0]), m1 = mid(q[1], q[2]);
      const hw = (dist(q[1], q[2]) + dist(q[3], q[0])) / 4;
      let r0 = m0, r1 = m1;
      const L = dist(m0, m1);
      if (o.roof === 'hip' || o.roof === 'spire') {
        const ux = (m1[0] - m0[0]) / (L || 1), uy = (m1[1] - m0[1]) / (L || 1);
        if (L <= 2 * hw || o.roof === 'spire') r0 = r1 = mid(m0, m1);
        else {
          r0 = [m0[0] + ux * hw, m0[1] + uy * hw];
          r1 = [m1[0] - ux * hw, m1[1] - uy * hw];
        }
      }
      const hr = h + hw * o.pitch;
      const R0: V = at(r0, hr), R1: V = at(r1, hr);
      let k = 0;
      if (o.roof === 'flat') {
        k += walls(P, q, h, mat.wall, key, undefined, o.extra, o.win);
        P.face(q.map((v) => at(v, h)), shade(mat.roof, o.jit), key(k++), INK, o.extra);
        if (o.crenel) merlons(P, q, h, shade(mat.wall, 0.95), key, k);
        return;
      }
      // A gable's end wall rises to the ridge.
      const ends = o.roof === 'gable' ? new Map<number, V>([[1, R1], [3, R0]]) : undefined;
      k += walls(P, q, h, mat.wall, key, ends, o.extra, o.win);
      const planes: { pts: V[]; nx: number; ny: number }[] = [];
      const plane = (a: Pt, b: Pt, top: V[]) => {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        planes.push({ pts: [at(a, h), at(b, h), ...top], nx: dy, ny: -dx });
      };
      plane(q[0], q[1], [R1, R0]);
      plane(q[2], q[3], [R0, R1]);
      if (o.roof !== 'gable') {
        plane(q[1], q[2], [R1]);
        plane(q[3], q[0], [R0]);
      }
      // The roof planes facing away are drawn first.
      planes.sort((a, b) => b.ny / Math.hypot(b.nx, b.ny) - a.ny / Math.hypot(a.nx, a.ny));
      for (const pl of planes) P.face(pl.pts, shade(mat.roof, o.jit * lit(pl.nx, pl.ny)), key(k++), INK, o.extra);
    },
  };
}

/**
 * A building of any outline (a round tower, an octagon): its south walls, and a flat top, a
 * cone over its centre or a dome.
 */
function polySolid(P: Painter, p0: Pt[], o: Opts): Solid {
  const p = area(p0) > 0 ? p0.slice() : p0.slice().reverse();
  const front = Math.min(...p.map((v) => v[1]));
  return {
    front,
    draw: (key) => {
      const { h, mat } = o;
      let k = walls(P, p, h, mat.wall, key, undefined, o.extra);
      const c: Pt = [p.reduce((a, v) => a + v[0], 0) / p.length, p.reduce((a, v) => a + v[1], 0) / p.length];
      const rad = Math.max(...p.map((v) => dist(v, c)));
      if (o.roof === 'flat' || o.roof === 'gable' || o.roof === 'hip') {
        P.face(p.map((v) => at(v, h)), shade(mat.roof, o.jit), key(k++), INK, o.extra);
        if (o.crenel) merlons(P, p, h, shade(mat.wall, 0.95), key, k, 1.8, 0.9);
        return;
      }
      if (o.roof === 'dome') {
        const rings = [0, 0.38, 0.72, 1].map((t) => ({ s: Math.cos((t * Math.PI) / 2), z: h + rad * Math.sin((t * Math.PI) / 2) }));
        const ptAt = (v: Pt, r: { s: number; z: number }): V => [c[0] + (v[0] - c[0]) * r.s, c[1] + (v[1] - c[1]) * r.s, r.z];
        const faces: { pts: V[]; nx: number; ny: number }[] = [];
        for (let i = 0; i < p.length; i++) {
          const a = p[i], b = p[(i + 1) % p.length];
          const nx = (a[0] + b[0]) / 2 - c[0], ny = (a[1] + b[1]) / 2 - c[1];
          for (let j = 0; j < rings.length - 1; j++) {
            const lo = rings[j], hi = rings[j + 1];
            faces.push({ pts: j === rings.length - 2 ? [ptAt(a, lo), ptAt(b, lo), [c[0], c[1], hi.z]] : [ptAt(a, lo), ptAt(b, lo), ptAt(b, hi), ptAt(a, hi)], nx: nx * (1 - j * 0.3), ny: ny * (1 - j * 0.3) + (j * 0.3 * rad) });
          }
        }
        faces.sort((a, b) => b.ny / Math.hypot(b.nx, b.ny) - a.ny / Math.hypot(a.nx, a.ny));
        for (const f of faces) P.face(f.pts, shade(mat.roof, o.jit * lit(f.nx, f.ny)), key(k++), shade(mat.roof, 0.7), o.extra);
        return;
      }
      const apex: V = [c[0], c[1], h + rad * o.pitch];
      const faces: { pts: V[]; nx: number; ny: number }[] = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        faces.push({ pts: [at(a, h), at(b, h), apex], nx: (a[0] + b[0]) / 2 - c[0], ny: (a[1] + b[1]) / 2 - c[1] });
      }
      faces.sort((a, b) => b.ny / Math.hypot(b.nx, b.ny) - a.ny / Math.hypot(a.nx, a.ny));
      for (const f of faces) P.face(f.pts, shade(mat.roof, o.jit * lit(f.nx, f.ny)), key(k++), p.length > 8 ? shade(mat.roof, 0.72) : INK, o.extra);
    },
  };
}

const circle = (c: Pt, r: number, n = 14): Pt[] => {
  const p: Pt[] = [];
  for (let i = 0; i < n; i++) p.push([c[0] + Math.cos((i / n) * Math.PI * 2) * r, c[1] + Math.sin((i / n) * Math.PI * 2) * r]);
  return p;
};

/** A square tower set into the end of a temple, with its spire (or a dome, in hot dry lands). */
function templeTower(P: Painter, q0: Pt[], o: Opts, r: () => number, dome: boolean): Solid | null {
  let q = area(q0) > 0 ? q0.slice() : q0.slice().reverse();
  if (dist(q[0], q[1]) + dist(q[2], q[3]) < dist(q[1], q[2]) + dist(q[3], q[0])) q = [q[1], q[2], q[3], q[0]];
  const m0 = mid(q[3], q[0]), m1 = mid(q[1], q[2]);
  const L = dist(m0, m1), width = (dist(q[1], q[2]) + dist(q[3], q[0])) / 2;
  if (L < 8) return null;
  // At the southern end, where it shows best; a domed temple's dome stands over the middle.
  const southFirst = m0[1] <= m1[1];
  const end = southFirst ? m0 : m1, other = southFirst ? m1 : m0;
  const ux = (other[0] - end[0]) / L, uy = (other[1] - end[1]) / L;
  if (dome) {
    const c: Pt = [end[0] + ux * L * 0.55, end[1] + uy * L * 0.55];
    const rad = Math.min(width * 0.42, L * 0.3);
    return polySolid(P, circle(c, rad, 16), { ...o, h: o.h + 2, roof: 'dome', mat: { roof: '#c9b48a', wall: o.mat.wall } });
  }
  const s = Math.min(width * 0.8, 11, L * 0.35);
  const px = -uy, py = ux;
  const a: Pt = [end[0] + px * s / 2, end[1] + py * s / 2], b: Pt = [end[0] - px * s / 2, end[1] - py * s / 2];
  const tower: Pt[] = [a, b, [b[0] + ux * s, b[1] + uy * s], [a[0] + ux * s, a[1] + uy * s]];
  const spire = r() < 0.3 ? '#7f9e8a' : '#6b6f78';
  return quadSolid(P, tower, { ...o, h: o.h * 2.4, roof: 'spire', pitch: 4.4, win: undefined, mat: { roof: spire, wall: shade(o.mat.wall, 0.97) } });
}

export interface IllustrateSite {
  sid: string;
  tier: string;
  koppen: number;
}

/** The illustrated faces and shadows for a finished plan. */
export function illustrate(features: PlanFeature[], frame: LocalFrame, ppm20: number, site: IllustrateSite): PlanFeature[] {
  const P = new Painter(frame, ppm20);
  const cl = climate(site.koppen);
  const solids: Solid[] = [];
  const local = (f: PlanFeature): Pt[] => {
    if (f.geometry.type !== 'Polygon') return [];
    const r = f.geometry.coordinates[0];
    return r.slice(0, -1).map((c) => frame.fromLL(c[0], c[1]));
  };
  const village = site.tier === 'village';

  const roofOf = (r: () => number, ctx: string): { roof: string; kind: Roof; pitch: number } => {
    const poor = village || ['suburb', 'slum', 'farm', 'farming', 'fishing', 'logging', 'mining', 'tribal', 'camp'].includes(ctx);
    let mat: string;
    switch (cl) {
      case 'desert': mat = weighted(r, [['flat', 9], ['tile', 1]]); break;
      case 'steppe': mat = weighted(r, [['flat', 5], ['tile', 3], ['thatch', poor ? 3 : 1]]); break;
      case 'tropic': mat = weighted(r, [['thatch', poor ? 7 : 4], ['tile', poor ? 2 : 5]]); break;
      case 'med': mat = weighted(r, [['tile', 9], ['flat', 1], ['thatch', poor ? 1 : 0]]); break;
      case 'cold': mat = weighted(r, [['shingle', 5], ['slate', poor ? 1 : 3], ['thatch', poor ? 3 : 1]]); break;
      case 'polar': mat = weighted(r, [['turf', 5], ['shingle', 4]]); break;
      default: mat = poor ? weighted(r, [['thatch', 5], ['shingle', 3], ['tile', 3]]) : weighted(r, [['tile', 5], ['slate', 2], ['shingle', 2], ['thatch', 1]]);
    }
    const pitch = mat === 'thatch' ? 1.15 : mat === 'tile' ? (cl === 'med' ? 0.5 : 0.8) : mat === 'turf' ? 0.7 : 0.95;
    return { roof: pick(r, ROOFS[mat]), kind: mat === 'flat' ? 'flat' : 'gable', pitch };
  };
  const wallOf = (r: () => number, ctx: string): string => {
    switch (cl) {
      case 'desert': case 'steppe': return pick(r, WALLS[r() < 0.75 ? 'mud' : 'plaster']);
      case 'med': return pick(r, WALLS[r() < 0.7 ? 'white' : 'plaster']);
      case 'cold': case 'polar': return pick(r, WALLS[r() < 0.5 ? 'wood' : r() < 0.6 ? 'timber' : 'plaster']);
      case 'tropic': return pick(r, WALLS[r() < 0.5 ? 'mud' : 'plaster']);
      default: return pick(r, WALLS[ctx === 'rich' ? (r() < 0.5 ? 'stone' : 'plaster') : r() < 0.35 ? 'timber' : 'plaster']);
    }
  };

  for (const f of features) {
    const pr = f.properties;
    const kind = pr.kind;
    if (kind === 'building') {
      if (pr.burrow) continue;
      const p = local(f);
      if (p.length < 3) continue;
      const bid = String(pr.bid ?? '');
      const r = mulberry32(hashString(`ill#${bid}`));
      const ctx = String(pr.ctx ?? '');
      const use = String(pr.use ?? ''), role = String(pr.role ?? '');
      const a = Math.abs(area(p));
      const base = roofOf(r, ctx);
      const wall = wallOf(r, ctx);
      const jit = 0.93 + r() * 0.14;
      const extra = bid ? { bid } : undefined;
      const stone = pick(r, WALLS.stone);
      let o: Opts = { h: 5, pitch: base.pitch, roof: base.kind, mat: { roof: base.roof, wall }, jit, extra, win: mulberry32(hashString(`win#${bid}`)) };
      const H: Record<string, number> = { ward: 6.2, rich: 7.4, counting: 7, slum: 4.2, suburb: 3.9, monastery: 6.2, garrison: 6, harbour: 5.6 };
      o.h = (H[ctx] ?? (village ? 3.3 : 5)) * (0.85 + r() * 0.3);
      if (a < 30) o.h = Math.min(o.h, 2.8);
      if (o.roof === 'gable' && !village && (ctx === 'rich' || ctx === 'counting') && r() < 0.35) o.roof = 'hip';
      const extras: Solid[] = [];
      if (use === 'temple') {
        o = { ...o, win: undefined, h: pr.great ? 16 : 11, pitch: cl === 'med' || cl === 'desert' || cl === 'steppe' ? 0.55 : 1.05, roof: 'gable', mat: { roof: cl === 'desert' ? pick(r, ROOFS.flat) : cl === 'med' ? pick(r, ROOFS.tile) : pick(r, ROOFS.slate), wall: stone } };
        if (cl === 'desert') o.roof = 'flat';
        if (p.length === 4) {
          const t = templeTower(P, p, o, r, cl === 'desert' || cl === 'steppe');
          // Drawn just after the nave it stands in.
          if (t) {
            t.front = Math.min(...p.map((v) => v[1])) - 0.05;
            extras.push(t);
          }
        }
      } else if (role === 'prison') {
        o = { ...o, h: 10, roof: 'hip', pitch: 0.6, win: undefined, mat: { roof: pick(r, ROOFS.slate), wall: stone } };
      } else if (use === 'keep') {
        o = { ...o, h: 17, roof: 'flat', crenel: true, win: undefined, mat: { roof: '#a89f8c', wall: stone } };
        if (use === 'keep' && p.length === 4) {
          const ext = Math.sqrt(a);
          for (const v of p) {
            const tr = Math.min(3.6, ext * 0.16);
            extras.push(polySolid(P, circle(v, tr, 12), { ...o, h: o.h + 4, roof: 'cone', pitch: 2.2, crenel: false, mat: { roof: pick(r, ROOFS.slate), wall: stone } }));
          }
        }
      } else if (role === 'magetower') {
        o = { ...o, h: 24, roof: 'cone', pitch: 2.6, mat: { roof: '#5b5276', wall: '#b9b0c2' } };
      } else if (use === 'mill' && pr.mill === 'wind') {
        o = { ...o, h: 9, roof: 'cone', pitch: 1.3, mat: { roof: pick(r, ROOFS.shingle), wall: pick(r, WALLS.plaster) } };
      } else if (use === 'mill') {
        o.h = 5;
      } else if (['townhall', 'guildhall', 'library', 'university', 'college', 'countinghouse'].includes(role) || role.startsWith('guild:') || role.startsWith('order:')) {
        o = { ...o, h: Math.max(o.h, 8.5), roof: o.roof === 'flat' ? 'flat' : 'hip', mat: { ...o.mat, wall: r() < 0.5 ? stone : wall } };
      } else if (role === 'barracks') {
        o = { ...o, h: 7, mat: { ...o.mat, wall: stone } };
      } else if (role === 'shrine') {
        o = { ...o, h: 4, pitch: 1.2 };
      } else if (role === 'delvegate') {
        o = { ...o, h: 9, roof: 'flat', crenel: true, mat: { roof: '#9d9586', wall: stone } };
      }
      // Shadows fall to the east, a little south, by the building's height.
      const sh = o.h * 0.4;
      P.shadow(p.map((v) => [v[0] + sh, v[1] - sh * 0.3] as Pt));
      const solid = p.length === 4 && o.roof !== 'cone' ? quadSolid(P, p, o) : polySolid(P, p, o);
      solids.push(solid, ...extras);
      // A windmill's sails, turned to face the viewer, on its cap.
      if (use === 'mill' && pr.mill === 'wind') {
        const c: Pt = [p.reduce((s, v) => s + v[0], 0) / p.length, p.reduce((s, v) => s + v[1], 0) / p.length];
        const rad = Math.max(...p.map((v) => dist(v, c)));
        const hub: V = [c[0], c[1] - rad, o.h * 0.95];
        const turn = r() * Math.PI;
        solids.push({
          front: c[1] - rad - 0.5,
          draw: (key) => {
            for (let i = 0; i < 4; i++) {
              const t = turn + (i * Math.PI) / 2, ux = Math.cos(t), uz = Math.sin(t), wx = -uz, wz = ux;
              const pt = (d: number, w: number): V => [hub[0] + ux * d + wx * w, hub[1], hub[2] + uz * d + wz * w];
              P.face([pt(1, 0), pt(8.5, 0), pt(8.5, 1.8), pt(1.6, 1.8)], '#ece4d0', key(i));
            }
          },
        });
      }
    } else if (kind === 'wall' && f.geometry.type === 'LineString') {
      // Town walls: a face of stone with a walk and battlements on top; a village's palisade of stakes.
      const pts = f.geometry.coordinates.map((c) => frame.fromLL(c[0], c[1]));
      // Drawn a little thicker than the plan's line, as the old maps draw them.
      const w = Number(pr.w ?? 2) * 1.6;
      const palisade = village && Number(pr.w ?? 2) < 2;
      const w0 = Number(pr.w ?? 2), Hh = palisade ? 3 : w0 >= 2.4 ? 9 : w0 >= 2 ? 7 : 4;
      const col = palisade ? '#9c7f5a' : '#c4bcaa';
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = dist(a, b);
        if (len < 0.2) continue;
        const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
        // The face toward the south, offset half the wall's width that way.
        let nx = uy, ny = -ux;
        if (ny > 0 || (ny === 0 && nx < 0)) {
          nx = -nx;
          ny = -ny;
        }
        const off = (s: Pt, d: number): Pt => [s[0] + nx * d, s[1] + ny * d];
        solids.push({
          front: Math.min(a[1], b[1]) - w / 2,
          draw: (key) => {
            const fa = off(a, w / 2), fb = off(b, w / 2), ba = off(a, -w / 2), bb = off(b, -w / 2);
            P.face([at(fa, 0), at(fb, 0), at(fb, Hh), at(fa, Hh)], shade(col, 0.9 + 0.08 * Math.abs(ux)), key(0));
            P.face([at(fa, Hh), at(fb, Hh), at(bb, Hh), at(ba, Hh)], shade(col, 1.06), key(1));
            if (!palisade) merlons(P, [fa, fb], Hh, shade(col, 0.97), key, 2, 2.4, 1.2);
          },
        });
      }
    } else if (kind === 'tower' && f.geometry.type === 'Point') {
      const c = frame.fromLL(f.geometry.coordinates[0], f.geometry.coordinates[1]);
      const rr = Number(pr.r ?? 3);
      const r = mulberry32(hashString(`ill#${site.sid}#t${Math.round(c[0])},${Math.round(c[1])}`));
      const cone = cl !== 'desert' && cl !== 'steppe' && r() < 0.75;
      const o: Opts = { h: village ? 6 : 12, pitch: 1.8, roof: cone ? 'cone' : 'flat', crenel: !cone, mat: { roof: cone ? pick(r, ROOFS[cl === 'med' ? 'tile' : 'slate']) : '#a89f8c', wall: pick(r, WALLS.stone) }, jit: 1 };
      P.shadow(circle([c[0] + o.h * 0.4, c[1] - o.h * 0.12], rr, 10));
      solids.push(polySolid(P, circle(c, rr, 12), o));
    } else if (kind === 'tree' && f.geometry.type === 'Point') {
      const c = frame.fromLL(f.geometry.coordinates[0], f.geometry.coordinates[1]);
      const rr = Math.max(0.8, Number(pr.r ?? 2));
      const r = mulberry32(hashString(`ill#${site.sid}#${c[0].toFixed(1)},${c[1].toFixed(1)}`));
      const conifer = (cl === 'cold' || cl === 'polar') ? r() < 0.7 : cl === 'temperate' ? r() < 0.12 : false;
      const green = pick(r, conifer ? ['#5f7a4c', '#55704a', '#68835a'] : ['#7f9a5c', '#738e52', '#8aa364', '#7a9458']);
      P.shadow(circle([c[0] + rr * 0.7, c[1] - rr * 0.25], rr * 0.9, 9));
      solids.push({
        front: c[1] - rr * 0.3,
        draw: (key) => {
          const trunk = rr * 0.7;
          P.face([[c[0] - rr * 0.14, c[1], 0], [c[0] + rr * 0.14, c[1], 0], [c[0] + rr * 0.14, c[1], trunk + rr * 0.4], [c[0] - rr * 0.14, c[1], trunk + rr * 0.4]], '#7a5c40', key(0));
          if (conifer) {
            for (let t = 0; t < 2; t++) {
              const z0 = trunk * 0.6 + t * rr * 1.1, w = rr * (1 - t * 0.3);
              P.face([[c[0] - w, c[1], z0], [c[0] + w, c[1], z0], [c[0], c[1], z0 + rr * 1.9]], shade(green, 1 + t * 0.06), key(1 + t), '#3f5232');
            }
            return;
          }
          // A bushy crown: a lumpy round of leaves with a lit side.
          const cz = trunk + rr;
          const lump = (cx: number, cy: number, rad: number, col: string, ol: string, kk: number) => {
            const pts: V[] = [];
            for (let i = 0; i < 11; i++) {
              const t = (i / 11) * Math.PI * 2, wob = 1 + 0.12 * Math.sin(t * 3 + c[0]) + 0.06 * Math.cos(t * 5 + c[1]);
              pts.push([cx + Math.cos(t) * rad * wob, cy + Math.sin(t) * rad * wob, cz]);
            }
            P.face(pts, col, key(kk), ol);
          };
          lump(c[0], c[1], rr, green, '#4d5e36', 1);
          lump(c[0] - rr * 0.28, c[1] + rr * 0.26, rr * 0.55, shade(green, 1.16), shade(green, 1.16), 2);
        },
      });
    }
  }
  // The northernmost solids first, so the nearer overlap them.
  solids.sort((a, b) => b.front - a.front);
  for (const s of solids) s.draw(keyer(s.front, 0));
  return P.out;
}
