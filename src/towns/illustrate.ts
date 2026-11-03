import { KOPPEN_CLASSES } from '../gen/koppen';
import { hashString, mulberry32 } from '../gen/rng';
import { type BuildStyle, ROOF_COLOURS, buildStyle } from '../interiors/style';
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
const BEAM = '#5d4733';
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

/** Width of the ink edge round each face (m). */
const RIM_M = 0.12;

/**
 * A polygon moved in by d on every side (each edge offset inward, neighbouring offsets met at
 * their crossing); null where it is too small or too thin for that.
 */
function inset(p: Pt[], d: number): Pt[] | null {
  const n = p.length;
  const sgn = area(p) > 0 ? 1 : -1;
  const lines: { px: number; py: number; dx: number; dy: number; at: Pt }[] = [];
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;
    // Inward normal: to the left of the edge for a counter-clockwise ring.
    const nx = (-dy / L) * sgn, ny = (dx / L) * sgn;
    lines.push({ px: a[0] + nx * d, py: a[1] + ny * d, dx, dy, at: a });
  }
  if (lines.length < 3) return null;
  let cx = 0, cy = 0;
  for (const v of p) {
    cx += v[0] / n;
    cy += v[1] / n;
  }
  const out: Pt[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l1 = lines[(i + lines.length - 1) % lines.length], l2 = lines[i];
    const den = l1.dx * l2.dy - l1.dy * l2.dx;
    let q: Pt = [l2.px, l2.py];
    if (Math.abs(den) > 1e-9) {
      const t = ((l2.px - l1.px) * l2.dy - (l2.py - l1.py) * l2.dx) / den;
      q = [l1.px + l1.dx * t, l1.py + l1.dy * t];
    }
    // At a sharp corner the mitre runs far out: pull the corner in toward the middle instead.
    const v = l2.at;
    if (Math.hypot(q[0] - v[0], q[1] - v[1]) > 4 * d) {
      const toC = Math.hypot(cx - v[0], cy - v[1]) || 1, k = Math.min(4 * d, toC * 0.5) / toC;
      q = [v[0] + (cx - v[0]) * k, v[1] + (cy - v[1]) * k];
    }
    out.push(q);
  }
  const ai = area(out);
  // Too thin: the inset turned inside out, collapsed or grew.
  if (Math.sign(ai) !== sgn || Math.abs(ai) < Math.abs(area(p)) * 0.15 || Math.abs(ai) >= Math.abs(area(p))) return null;
  return out;
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
    const a = area(flat);
    if (Math.abs(a) < 0.01) return;
    // The ink edge is drawn as a face of its own just under the face (the face inset over it),
    // so a nearer face hides the edges behind it as it hides the faces (a fill layer's own
    // outlines would all be drawn last, over everything).
    const inner = o !== c ? inset(flat, RIM_M) : null;
    if (inner) {
      this.out.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [this.ring(flat)] }, properties: { kind: 'ill', c: o, o, z: this.seq++, ppm20: this.ppm20, ...(extra ?? {}) } });
      this.out.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [this.ring(inner)] }, properties: { kind: 'ill', c, o: c, z: this.seq++, ppm20: this.ppm20, ...(extra ?? {}) } });
      return;
    }
    this.out.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [this.ring(flat)] }, properties: { kind: 'ill', c, o: c, z: this.seq++, ppm20: this.ppm20, ...(extra ?? {}) } });
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
  /** Timber-framed: dark beams over the walls. */
  timber?: boolean;
  /** Where roads pass through the building (a gatehouse, a house built over a road). */
  arches?: Arch[];
}

/** A road's way through a building: where it meets the outline, and how wide it is (m). */
interface Arch {
  p: Pt;
  w: number;
}

/**
 * The walls of the edges of `p` that face south (toward the viewer), from the ground to `h`,
 * shaded by the way they face. With `ends`, an edge's wall reaches up to a ridge point.
 */
function walls(P: Painter, p: Pt[], h: number, wall: string, key: (i: number) => number, ends?: Map<number, V>, extra?: Record<string, string | number>, win?: () => number, timber = false, arches?: Arch[]): number {
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
    const len = Math.hypot(dx, dy);
    // A timber frame: posts at the corners, a rail at each floor and a beam under the eaves.
    if (timber && len >= 2) {
      const ux = dx / len, uy = dy / len;
      const along = (t: number): Pt => [a[0] + ux * t, a[1] + uy * t];
      const band = (t0: number, t1: number, z0: number, z1: number) => {
        const p0 = along(t0), p1 = along(t1);
        P.face([at(p0, z0), at(p1, z0), at(p1, z1), at(p0, z1)], BEAM, key(k++), BEAM, extra);
      };
      band(0, 0.3, 0, h);
      band(len - 0.3, len, 0, h);
      band(0, len, h - 0.3, h);
      if (h > 4.5) band(0, len, h * 0.5 - 0.15, h * 0.5 + 0.15);
      // Posts between the windows (which stand in the middle of each bay).
      const bays = Math.min(4, Math.floor(len / 2.6));
      for (let j = 1; j < bays; j++) band((len * j) / bays - 0.12, (len * j) / bays + 0.12, 0, h);
    }
    // Windows (and a door) in walls that face the viewer.
    if (win && len >= 3.2 && h >= 2.6 && -ny / len > 0.6) k = openings(P, a, b, len, h, win, key, k, extra);
    // A passage through the building where a road runs under it.
    for (const ar of arches ?? []) {
      const ux = dx / len, uy = dy / len;
      const t = (ar.p[0] - a[0]) * ux + (ar.p[1] - a[1]) * uy;
      const off = Math.abs((ar.p[0] - a[0]) * uy - (ar.p[1] - a[1]) * ux);
      if (off > 0.8 || t < -0.5 || t > len + 0.5) continue;
      const w = Math.min(ar.w, len - 0.8), t0 = Math.max(0.4, Math.min(len - 0.4 - w, t - w / 2));
      const rise = Math.min(h * 0.78, w * 0.5 + h * 0.4);
      const pts: V[] = [];
      const along = (tt: number, z: number): V => [a[0] + ux * tt, a[1] + uy * tt, z];
      pts.push(along(t0, 0), along(t0 + w, 0));
      for (let q = 0; q <= 8; q++) {
        const ang = (q / 8) * Math.PI;
        pts.push(along(t0 + w / 2 + (Math.cos(ang) * w) / 2, rise - w / 2 + (Math.sin(ang) * w) / 2));
      }
      P.face(pts, '#3a2e24', key(k++), INK, extra);
    }
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
        k += walls(P, q, h, mat.wall, key, undefined, o.extra, o.win, o.timber, o.arches);
        P.face(q.map((v) => at(v, h)), shade(mat.roof, o.jit), key(k++), INK, o.extra);
        if (o.crenel) merlons(P, q, h, shade(mat.wall, 0.95), key, k);
        return;
      }
      // A gable's end wall rises to the ridge.
      const ends = o.roof === 'gable' ? new Map<number, V>([[1, R1], [3, R0]]) : undefined;
      k += walls(P, q, h, mat.wall, key, ends, o.extra, o.win, o.timber, o.arches);
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
      let k = walls(P, p, h, mat.wall, key, undefined, o.extra, undefined, false, o.arches);
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

/** Wall colours by material, where a people's style gives none (as the exterior view draws them). */
const WALL_MAT: Record<string, string> = {
  timber: '#efe4c8', stone: '#d8d0bf', plaster: '#efe4c8', whitewash: '#f4f0e6', adobe: '#dfc49c', log: '#a8845c',
  plank: '#a68a68', turf: '#a8b77c', brick: '#b98a6e',
};

/** What kind of building a plan building is, in the terms of the interiors' styles. */
function styleKind(ctx: string, use: string, role: string, village: boolean): string {
  if (use === 'temple') return 'temple';
  if (use === 'keep') return 'keep';
  if (ctx === 'monastery') return 'range';
  if (role === 'magetower') return 'tower';
  if (role === 'countinghouse') return 'bank';
  if (role === 'shrine') return 'shrine';
  if (role === 'library') return 'library';
  if (role === 'university' || role === 'college') return 'university';
  if (role === 'townhall' || role === 'guildhall') return 'civic';
  if (village || ['suburb', 'slum', 'farm', 'farming', 'fishing', 'logging', 'mining', 'tribal'].includes(ctx)) return 'cottage';
  return 'townhouse';
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

  // Walls that run alongside one another (a citadel's wall inside the town wall, an outer
  // ring) would be drawn one over the other: a stretch alongside a wider wall (or an earlier
  // one as wide) is left to that wall. Towers standing on one another are drawn once.
  const wallSegs: { a: Pt; b: Pt; f: number; w: number }[] = [];
  features.forEach((f, fi) => {
    if (f.properties.kind !== 'wall' || f.geometry.type !== 'LineString') return;
    const pts = f.geometry.coordinates.map((c) => frame.fromLL(c[0], c[1]));
    for (let i = 0; i + 1 < pts.length; i++) wallSegs.push({ a: pts[i], b: pts[i + 1], f: fi, w: Number(f.properties.w ?? 2) });
  });
  const segDist = (p: Pt, a: Pt, b: Pt) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
  };
  const alongside = (a: Pt, b: Pt, fi: number, w: number): boolean => {
    const m = mid(a, b), len = dist(a, b) || 1;
    for (const o of wallSegs) {
      if (o.f === fi || o.w < w || (o.w === w && o.f > fi)) continue;
      if (segDist(m, o.a, o.b) > (w + o.w) * 0.8 + 3) continue;
      const ol = dist(o.a, o.b) || 1;
      const cos = Math.abs(((b[0] - a[0]) * (o.b[0] - o.a[0]) + (b[1] - a[1]) * (o.b[1] - o.a[1])) / (len * ol));
      if (cos > 0.87) return true;
    }
    return false;
  };
  const towersAt: { c: Pt; r: number }[] = [];

  // Roads (their centre lines and widths), for gates in the walls and passages under buildings.
  const roadSegs: { a: Pt; b: Pt; w: number; street: boolean }[] = [];
  for (const f of features) {
    if ((f.properties.kind !== 'road' && f.properties.kind !== 'street') || f.geometry.type !== 'LineString') continue;
    const w = f.properties.kind === 'street' ? 6 : ROAD_W[String(f.properties.cls ?? '')] ?? 3.5;
    if (w < 2) continue;
    const pts = f.geometry.coordinates.map((c) => frame.fromLL(c[0], c[1]));
    for (let i = 0; i + 1 < pts.length; i++) roadSegs.push({ a: pts[i], b: pts[i + 1], w, street: f.properties.kind === 'street' });
  }
  /** Where roads cross a building's outline. */
  const archesIn = (p: Pt[]): Arch[] => {
    const out: Arch[] = [];
    for (const r of roadSegs) {
      for (let i = 0; i < p.length; i++) {
        const x = crossing(r.a, r.b, p[i], p[(i + 1) % p.length]);
        if (x) out.push({ p: x, w: r.w });
      }
    }
    return out;
  };
  gatehouses(P, features, frame, wallSegs, roadSegs, solids, village, cl);

  for (const [fi, f] of features.entries()) {
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
      let wall = wallOf(r, ctx);
      const jit = 0.93 + r() * 0.14;
      // The people's own way of building (interiors/style.ts, as the exterior view draws it),
      // for most of their houses; the rest keep the climate's materials, for variety.
      const kindS = styleKind(ctx, use, role, village);
      const st: BuildStyle | null = typeof pr.cul === 'string' ? buildStyle(pr.cul, kindS) : null;
      const own = !!st && (kindS !== 'cottage' && kindS !== 'townhouse' ? true : r() < 0.82);
      if (st && own) {
        base.roof = shade(ROOF_COLOURS[st.roof]?.[0] ?? base.roof, 0.86 + r() * 0.16);
        wall = shade(st.colour?.[0] ?? WALL_MAT[st.wall] ?? wall, 0.95 + r() * 0.07);
        base.kind = st.form === 'flat' ? 'flat' : st.form === 'upturned' ? 'hip' : 'gable';
        base.pitch = st.form === 'steep' ? 1.3 : st.form === 'low' || st.form === 'upturned' ? 0.55 : 0.9;
      }
      const timber = own && st?.wall === 'timber' && base.kind !== 'flat';
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
        if (st) {
          o.mat.roof = shade(ROOF_COLOURS[st.roof]?.[0] ?? o.mat.roof, 0.85);
          o.roof = st.form === 'flat' ? 'flat' : 'gable';
          if (st.form === 'steep') o.pitch = 1.3;
          if (st.form === 'low' || st.form === 'upturned') o.pitch = 0.55;
        }
        if (p.length === 4) {
          const t = templeTower(P, p, o, r, st ? st.form === 'flat' || st.roof === 'mud' : cl === 'desert' || cl === 'steppe');
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
      if (timber && !o.crenel && o.h <= 9 && use !== 'temple') o.timber = true;
      // A building standing over a road (the plan leaves few: halls and shops built across a
      // road out of town) has a passage through it.
      const arches = archesIn(p);
      if (arches.length) o.arches = arches;
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
      const w0 = Number(pr.w ?? 2);
      const w = w0 * 1.6;
      const palisade = village && w0 < 2;
      const Hh = palisade ? 3 : w0 >= 2.4 ? 9 : w0 >= 2 ? 7 : 4;
      const col = palisade ? '#9c7f5a' : '#c4bcaa';
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = dist(a, b);
        if (len < 0.2 || alongside(a, b, fi, w0)) continue;
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
      if (towersAt.some((t) => dist(t.c, c) < (t.r + rr) * 0.9)) continue;
      towersAt.push({ c, r: rr });
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
  staffage(P, features, frame, solids, cl, site);
  // The northernmost solids first, so the nearer overlap them.
  solids.sort((a, b) => b.front - a.front);
  for (const s of solids) s.draw(keyer(s.front, 0));
  return P.out;
}

// ---- Staffage --------------------------------------------------------------------------------

/** Figures are drawn larger than life, as the old maps draw them. */
const FIG = 2.8;
const FIGX = { fig: 1 };
/** How much taller figures are drawn than the oblique view would foreshorten them. */
const FIG_UP = 1.6;
type FigPainter = Pick<Painter, 'face'>;
const SKIN = '#e6c39a';
const CLOTHES = ['#9b3b2e', '#b5763a', '#3b5a7a', '#6f8a45', '#8a6a4a', '#c9b37a', '#7a4a5a', '#e9e1cc', '#5f6d7a'];

function inPoly(p: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
  }
  return inside;
}

/** A point well inside a polygon (tried at random; null if none is found). */
function inside(p: Pt[], r: () => number, margin: number): Pt | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const v of p) {
    x0 = Math.min(x0, v[0]); y0 = Math.min(y0, v[1]); x1 = Math.max(x1, v[0]); y1 = Math.max(y1, v[1]);
  }
  for (let t = 0; t < 12; t++) {
    const x = x0 + (x1 - x0) * r(), y = y0 + (y1 - y0) * r();
    if (inPoly(p, x, y) && [[margin, 0], [-margin, 0], [0, margin], [0, -margin]].every(([dx, dy]) => inPoly(p, x + dx, y + dy))) return [x, y];
  }
  return null;
}

/** A round shape in the upright plane through y (facing the viewer). */
function blobV(cx: number, y: number, cz: number, rx: number, rz: number, n = 9): V[] {
  const out: V[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(t) * rx, y, cz + Math.sin(t) * rz]);
  }
  return out;
}

type Pose = 'walk' | 'stand' | 'bend' | 'plough';

/** A person seen from the side, facing `m` (1 east, -1 west). */
function person(P: FigPainter, x: number, y: number, m: number, col: string, pose: Pose, k: () => number): void {
  const H = 1.75 * FIG;
  const q = (pts: [number, number][], c: string) => P.face(pts.map(([dx, z]) => [x + dx * m, y, z] as V), c, k(), INK, FIGX);
  const bend = pose === 'bend' ? 0.2 * H : pose === 'plough' ? 0.08 * H : 0;
  const stride = pose === 'walk' || pose === 'plough' ? 0.1 * H : 0.03 * H;
  q([[-0.1 * H - stride, 0], [-0.02 * H - stride, 0], [0.0, 0.45 * H], [-0.08 * H, 0.45 * H]], '#5a4636');
  q([[0.02 * H + stride, 0], [0.1 * H + stride, 0], [0.08 * H, 0.45 * H], [0.0, 0.45 * H]], '#4c3b2e');
  const top = pose === 'bend' ? 0.7 * H : 0.8 * H;
  q([[-0.19 * H, 0.36 * H], [0.19 * H, 0.36 * H], [0.13 * H + bend, top], [-0.13 * H + bend, top]], col);
  // An arm reaching forward (to the plough, a hoe or a sickle) or hanging.
  const reach = pose === 'stand' ? 0.12 : 0.3;
  q([[0.04 * H + bend, top - 0.04 * H], [0.1 * H + bend, top - 0.06 * H], [reach * H + bend, 0.5 * H], [(reach - 0.06) * H + bend, 0.47 * H]], shade(col, 0.85));
  if (pose === 'bend') q([[(reach - 0.03) * H + bend, 0.5 * H], [(reach + 0.01) * H + bend, 0.5 * H], [(reach + 0.1) * H + bend, 0], [(reach + 0.06) * H + bend, 0]], '#7a5c40');
  const hz = top + 0.1 * H;
  P.face(blobV(x + bend * m, y, hz, 0.085 * H, 0.09 * H, 8), SKIN, k(), INK, FIGX);
}

/** A beast seen from the side: an ox, a cow, a horse or a sheep. */
function beast(P: FigPainter, x: number, y: number, m: number, kind: 'ox' | 'cow' | 'horse' | 'sheep', col: string, k: () => number): void {
  const S = kind === 'sheep' ? FIG * 0.75 : FIG * 0.95;
  const at2 = (dx: number, z: number): V => [x + dx * S * m, y, z * S];
  const leg = (dx: number, top: number) => P.face([at2(dx - 0.07, 0), at2(dx + 0.07, 0), at2(dx + 0.07, top), at2(dx - 0.07, top)], kind === 'sheep' ? '#3f3530' : shade(col, 0.8), k(), INK, FIGX);
  if (kind === 'sheep') {
    leg(-0.3, 0.4); leg(0.3, 0.4);
    P.face(blobV(x, y, 0.6 * S, 0.55 * S, 0.33 * S), col, k(), INK, FIGX);
    P.face(blobV(x + 0.6 * S * m, y, 0.72 * S, 0.17 * S, 0.14 * S, 7), '#3f3530', k(), INK, FIGX);
    return;
  }
  const horse = kind === 'horse';
  const bodyZ = horse ? 1.25 : 1.05, legTop = horse ? 1.0 : 0.85;
  leg(-0.9, legTop); leg(-0.65, legTop); leg(0.65, legTop); leg(0.9, legTop);
  P.face(blobV(x, y, bodyZ * S, 1.15 * S, (horse ? 0.38 : 0.45) * S, 10), col, k(), INK, FIGX);
  if (horse) {
    // A tail, a stout neck with its mane, and a long head held low.
    P.face([at2(-1.1, 1.45), at2(-1.0, 1.3), at2(-1.3, 0.75), at2(-1.42, 0.82)], shade(col, 0.7), k(), INK, FIGX);
    P.face([at2(0.6, 1.5), at2(1.15, 1.2), at2(1.55, 1.85), at2(1.25, 2.1)], col, k(), INK, FIGX);
    P.face([at2(0.6, 1.5), at2(0.72, 1.6), at2(1.3, 2.18), at2(1.25, 2.1)], shade(col, 0.6), k(), INK, FIGX);
    P.face([at2(1.25, 2.1), at2(1.55, 1.85), at2(1.95, 1.6), at2(2.02, 1.72), at2(1.6, 2.08)], col, k(), INK, FIGX);
  } else {
    P.face(blobV(x + 1.3 * S * m, y, 1.15 * S, 0.3 * S, 0.24 * S, 8), shade(col, 0.92), k(), INK, FIGX);
    if (kind === 'ox') P.face([at2(1.25, 1.35), at2(1.32, 1.35), at2(1.45, 1.6), at2(1.4, 1.62)], '#e9e1cc', k(), INK, FIGX);
  }
}

/** A cart of hay, sacks or barrels, drawn by a horse or an ox, with its carter walking beside. */
function cart(P: FigPainter, x: number, y: number, m: number, r: () => number, k: () => number): void {
  const S = FIG * 0.95;
  const at2 = (dx: number, z: number): V => [x + dx * S * m, y, z * S];
  const load = r();
  if (load < 0.45) P.face(blobV(x - 0.1 * S * m, y, 1.45 * S, 1.35 * S, 0.55 * S, 10), '#d6bf72', k(), INK, FIGX);
  else P.face([at2(-1.3, 1.2), at2(1.1, 1.2), at2(0.9, 1.75), at2(-1.1, 1.75)], load < 0.75 ? '#c9b48a' : '#8a6a4a', k(), INK, FIGX);
  P.face([at2(-1.45, 0.75), at2(1.25, 0.75), at2(1.25, 1.25), at2(-1.45, 1.25)], '#9c7a52', k(), INK, FIGX);
  P.face(blobV(x - 0.3 * S * m, y, 0.6 * S, 0.6 * S, 0.6 * S, 10), '#5d4733', k(), INK, FIGX);
  P.face(blobV(x - 0.3 * S * m, y, 0.6 * S, 0.36 * S, 0.36 * S, 8), '#a88a64', k(), '#5d4733', FIGX);
  P.face([at2(1.2, 1.0), at2(2.1, 1.05), at2(2.1, 1.12), at2(1.2, 1.08)], '#5d4733', k(), INK, FIGX);
  const ox = r() < 0.3;
  beast(P, x + 3.3 * S * m, y, m, ox ? 'ox' : 'horse', ox ? pick(r, ['#8a6a4a', '#a88660']) : pick(r, ['#8a5a3a', '#6b4a33', '#c9b49a', '#4f3f33']), k);
  if (r() < 0.7) person(P, x + 4.6 * S * m, y - 1.2, m, pick(r, CLOTHES), 'walk', k);
}

/**
 * Small figures at work and on the move, as on the old maps: ploughmen with their teams,
 * reapers and hoers in the fields, flocks and herds with their herders on the greens, carts
 * and travellers on the roads, and townsfolk in the streets and the market. Placed by the
 * settlement's own stream, apart from the plan's.
 */
function staffage(P0: Painter, features: PlanFeature[], frame: LocalFrame, solids: Solid[], cl: string, site: IllustrateSite): void {
  const r = mulberry32(hashString(`fig#${site.sid}`));
  // Figures stand taller than the walls are drawn (which the oblique view foreshortens), so
  // they read at a glance, as on the old maps.
  const P: FigPainter = { face: (pts, c, order, o, extra) => P0.face(pts.map((v) => [v[0], v[1], v[2] * FIG_UP] as V), c, order, o, extra) };
  const add = (x: number, y: number, draw: (k: () => number) => void) => {
    solids.push({ front: y - 0.5, draw: (key) => {
      let i = 0;
      draw(() => key(i++));
    } });
  };
  const local = (f: PlanFeature): Pt[] => {
    if (f.geometry.type === 'Polygon') return f.geometry.coordinates[0].slice(0, -1).map((c) => frame.fromLL(c[0], c[1]));
    if (f.geometry.type === 'LineString') return f.geometry.coordinates.map((c) => frame.fromLL(c[0], c[1]));
    return [];
  };
  const herd = cl === 'cold' || cl === 'temperate' || cl === 'polar' ? 'cow' : 'sheep';
  for (const f of features) {
    const kind = f.properties.kind;
    if (kind === 'field') {
      if (r() >= 0.14) continue;
      const p = local(f);
      if (Math.abs(area(p)) < 1500) continue;
      const c = inside(p, r, 8);
      if (!c) continue;
      const m = r() < 0.5 ? 1 : -1;
      const job = r();
      if (job < 0.4) {
        // A ploughman behind his team.
        add(c[0], c[1], (k) => {
          const col = pick(r, ['#8a6a4a', '#a88660', '#e6dfcf', '#6f563f']);
          P.face([[c[0] - 1.2 * m, c[1], 0], [c[0] - 1.0 * m, c[1], 0], [c[0] + 1.6 * m, c[1], 0.9], [c[0] + 1.5 * m, c[1], 1.0]], '#5d4733', k(), INK, FIGX);
          beast(P, c[0] + 4.2 * m, c[1], m, 'ox', col, k);
          beast(P, c[0] + 8.4 * m, c[1], m, 'ox', shade(col, 0.92), k);
          person(P, c[0] - 1.6 * m, c[1], m, pick(r, CLOTHES), 'plough', k);
        });
      } else {
        // Reapers or hoers, two or three in a row.
        const n = 2 + Math.floor(r() * 2);
        for (let i = 0; i < n; i++) {
          const x = c[0] + (i - n / 2) * 4.5, y = c[1] + (r() - 0.5) * 3;
          if (!inPoly(p, x, y)) continue;
          const col = pick(r, CLOTHES), mm = r() < 0.7 ? m : -m;
          add(x, y, (k) => person(P, x, y, mm, col, 'bend', k));
        }
      }
    } else if (kind === 'green') {
      if (r() >= 0.35) continue;
      const p = local(f);
      if (Math.abs(area(p)) < 700) continue;
      const animal = r() < 0.6 ? 'sheep' : herd;
      const n = animal === 'sheep' ? 4 + Math.floor(r() * 6) : 2 + Math.floor(r() * 3);
      const c0 = inside(p, r, 10);
      if (!c0) continue;
      for (let i = 0; i < n; i++) {
        const x = c0[0] + (r() - 0.5) * 22, y = c0[1] + (r() - 0.5) * 16;
        if (!inPoly(p, x, y)) continue;
        const m = r() < 0.5 ? 1 : -1;
        const col = animal === 'sheep' ? pick(r, ['#efeadc', '#e6dfcf', '#f2eee2', '#4f453d']) : pick(r, ['#8a6a4a', '#a88660', '#e6dfcf', '#5f4a3a']);
        add(x, y, (k) => beast(P, x, y, m, animal, col, k));
      }
      if (r() < 0.6) {
        const x = c0[0] + 9, y = c0[1] - 6, col = pick(r, CLOTHES);
        if (inPoly(p, x, y)) add(x, y, (k) => person(P, x, y, -1, col, 'stand', k));
      }
    } else if (kind === 'road' || kind === 'street' || kind === 'plaza' || kind === 'square') {
      if (kind === 'plaza' || kind === 'square') {
        const p = local(f);
        const n = Math.min(12, Math.floor(Math.abs(area(p)) / (kind === 'square' ? 300 : 500)));
        for (let i = 0; i < n; i++) {
          const c = inside(p, r, 2);
          if (!c) continue;
          const m = r() < 0.5 ? 1 : -1, col = pick(r, CLOTHES), pose: Pose = r() < 0.6 ? 'stand' : 'walk';
          add(c[0], c[1], (k) => person(P, c[0], c[1], m, col, pose, k));
        }
        continue;
      }
      const pts = local(f);
      const step = kind === 'road' ? 170 : 85;
      let carry = step * r();
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = dist(a, b);
        while (carry < len) {
          const t = carry / len;
          const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
          const m = b[0] >= a[0] ? 1 : -1;
          const roll = r();
          if (kind === 'road' && roll < 0.3) add(x, y, (k) => cart(P, x, y, m, r, k));
          else if (kind === 'road' && roll < 0.42) add(x, y, (k) => beast(P, x, y, m, 'horse', pick(r, ['#8a5a3a', '#6b4a33', '#c9b49a']), k));
          else if (roll < 0.62) {
            const col = pick(r, CLOTHES);
            add(x, y, (k) => person(P, x, y, m, col, 'walk', k));
          }
          carry += step * (0.6 + r() * 0.8);
        }
        carry -= len;
      }
    }
  }
}

// ---- Gates -----------------------------------------------------------------------------------

/** Plan road widths (m), as the map draws them. */
const ROAD_W: Record<string, number> = { major: 7, minor: 5, street: 6, path: 1.6, track: 3.5 };

/** Distance from p to segment ab. */
function ptSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
}

/** Where segment ab crosses segment cd (null if it does not). */
function crossing(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a[0] + rx * t, a[1] + ry * t];
}

/**
 * Gatehouses where roads pass the walls: across each gap left in a wall for a road (between
 * the ends of two runs), and wherever a road crosses a wall that has no gap for it (a citadel's
 * wall, a walled ward's). Each is a tower of stone (a timber gate in a palisade) astride the
 * wall, with an arch for the road.
 */
function gatehouses(
  P: Painter, features: PlanFeature[], frame: LocalFrame, wallSegs: { a: Pt; b: Pt; f: number; w: number }[],
  roadSegs: { a: Pt; b: Pt; w: number; street: boolean }[], solids: Solid[], village: boolean, cl: string,
): void {
  const gates: { c: Pt; u: Pt; half: number; w: number; road: number; wood: boolean }[] = [];
  const add = (c: Pt, u: Pt, half: number, w: number, road: number, wood: boolean) => {
    if (gates.some((g) => dist(g.c, c) < Math.max(10, g.half + half))) return;
    gates.push({ c, u, half, w, road, wood });
  };
  // Gaps between the ends of wall runs that a road passes through.
  const ends: { p: Pt; f: number; w: number }[] = [];
  features.forEach((f, fi) => {
    if (f.properties.kind !== 'wall' || f.geometry.type !== 'LineString') return;
    const c = f.geometry.coordinates;
    if (c.length < 2) return;
    const w = Number(f.properties.w ?? 2);
    ends.push({ p: frame.fromLL(c[0][0], c[0][1]), f: fi, w }, { p: frame.fromLL(c[c.length - 1][0], c[c.length - 1][1]), f: fi, w });
  });
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const e1 = ends[i], e2 = ends[j];
      const gap = dist(e1.p, e2.p);
      if (gap < 2 || gap > 22) continue;
      // A road through the gap, or ending in it (where the town's streets take over).
      const m = mid(e1.p, e2.p);
      const road = roadSegs.find((r) => crossing(r.a, r.b, e1.p, e2.p) || ptSeg(m, r.a, r.b) < Math.min(4, gap / 2));
      if (!road) continue;
      const u: Pt = [(e2.p[0] - e1.p[0]) / gap, (e2.p[1] - e1.p[1]) / gap];
      add(mid(e1.p, e2.p), u, gap / 2 + 2.5, Math.max(e1.w, e2.w), road.w, village && Math.max(e1.w, e2.w) < 2);
    }
  }
  // Roads (not the streets that run inside the walls) that cross a wall with no gap.
  for (const s of wallSegs) {
    for (const r of roadSegs) {
      if (r.street) continue;
      const x = crossing(r.a, r.b, s.a, s.b);
      if (!x) continue;
      const L = dist(s.a, s.b) || 1, Lr = dist(r.a, r.b) || 1;
      // Only a road that goes through the wall, not one that runs along it and wavers across.
      const sin = Math.abs(((s.b[0] - s.a[0]) * (r.b[1] - r.a[1]) - (s.b[1] - s.a[1]) * (r.b[0] - r.a[0])) / (L * Lr));
      if (sin < 0.5) continue;
      add(x, [(s.b[0] - s.a[0]) / L, (s.b[1] - s.a[1]) / L], r.w / 2 + 3, s.w, r.w, village && s.w < 2);
    }
  }
  for (const g of gates) {
    const n: Pt = [-g.u[1], g.u[0]];
    const depth = g.w * 1.6 / 2 + (g.wood ? 1 : 2.2);
    const corner = (su: number, sn: number): Pt => [g.c[0] + g.u[0] * g.half * su + n[0] * depth * sn, g.c[1] + g.u[1] * g.half * su + n[1] * depth * sn];
    const q: Pt[] = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    // The arch on each long face, where the road passes.
    const arches: Arch[] = [{ p: [g.c[0] - n[0] * depth, g.c[1] - n[1] * depth], w: Math.min(g.road + 0.6, g.half * 2 - 1.6) }, { p: [g.c[0] + n[0] * depth, g.c[1] + n[1] * depth], w: Math.min(g.road + 0.6, g.half * 2 - 1.6) }];
    const r = mulberry32(hashString(`gate#${g.c[0].toFixed(1)},${g.c[1].toFixed(1)}`));
    const wallH = g.wood ? 3 : g.w >= 2.4 ? 9 : g.w >= 2 ? 7 : 4;
    const o: Opts = g.wood
      ? { h: wallH + 1.5, pitch: 0.9, roof: 'gable', mat: { roof: pick(r, ROOFS.shingle), wall: '#9c7f5a' }, jit: 1, arches }
      : r() < 0.55 || cl === 'desert' || cl === 'steppe'
        ? { h: wallH + 4, pitch: 0, roof: 'flat', crenel: true, mat: { roof: '#a89f8c', wall: '#c4bcaa' }, jit: 1, arches }
        : { h: wallH + 4, pitch: 0.9, roof: 'hip', mat: { roof: pick(r, ROOFS[cl === 'med' ? 'tile' : 'slate']), wall: '#c4bcaa' }, jit: 1, arches };
    P.shadow(q.map((v) => [v[0] + o.h * 0.4, v[1] - o.h * 0.12] as Pt));
    // Drawn over the wall it stands astride (every piece of wall that reaches it).
    const sol = quadSolid(P, q, o);
    for (const ws of wallSegs) {
      const dx = ws.b[0] - ws.a[0], dy = ws.b[1] - ws.a[1], l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((g.c[0] - ws.a[0]) * dx + (g.c[1] - ws.a[1]) * dy) / l2)) : 0;
      if (Math.hypot(ws.a[0] + dx * t - g.c[0], ws.a[1] + dy * t - g.c[1]) > g.half + depth) continue;
      sol.front = Math.min(sol.front, Math.min(ws.a[1], ws.b[1]) - (ws.w * 1.6) / 2);
    }
    sol.front -= 0.5;
    solids.push(sol);
  }
}
