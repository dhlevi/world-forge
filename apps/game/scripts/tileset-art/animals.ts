/**
 * The animals (core local/fauna.ts; TILESET.md, Animals), each in its own colours and in the
 * figures' manner: flat shades lit from the top-left, a dark line about it, a shadow at the feet.
 * Facing each way, standing, in two strides, and (birds) flying in three wingbeats. The small ones
 * fill a tile; the large are painted 32 pixels square and stand on their tile.
 */
import type { Facing } from '@worldforge/core/local/tiles';
import { SPECIES_BY_ID } from '@worldforge/core/local/fauna';
import { Sprite, hex, tone, type RGB } from './paint';

type Px = [number, number];
type View = 'n' | 'e' | 's';

/** Shades of a colour, lightest first (as the figures' grey levels). */
const SHADES = [0.16, 0, -0.14, -0.28, -0.44];
const INK: RGB = [24, 20, 24];
const key = (x: number, y: number) => (y + 32) * 256 + x + 32;

const box = (x0: number, y0: number, x1: number, y1: number): Px[] => {
  const out: Px[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
};
const row = (y: number, x0: number, x1: number) => box(x0, y, x1, y);
const col = (x: number, y0: number, y1: number) => box(x, y0, x, y1);
/** A box with r pixels off each corner. */
const rbox = (x0: number, y0: number, x1: number, y1: number, r = 1): Px[] =>
  box(x0, y0, x1, y1).filter(([x, y]) => Math.min(x - x0, x1 - x) + Math.min(y - y0, y1 - y) >= r);
const oval = (cx: number, cy: number, rx: number, ry: number): Px[] =>
  box(Math.floor(cx - rx), Math.floor(cy - ry), Math.ceil(cx + rx), Math.ceil(cy + ry)).filter(([x, y]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
const seg = (x0: number, y0: number, x1: number, y1: number): Px[] => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1), out: Px[] = [];
  for (let i = 0; i <= n; i++) out.push([Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n)]);
  return out;
};
/** The same pixels on the other side of a middle line between x0 and x1. */
const across = (pts: Px[], x0: number, x1: number): Px[] => pts.map(([x, y]) => [x0 + x1 - x, y]);
/** One pixel in n, scattered. */
const speck = (x: number, y: number, n: number) => ((Math.imul(x + 7, 73856093) ^ Math.imul(y + 3, 19349663)) >>> 4) % n === 0;
const spotted = (pts: Px[], big: boolean) => pts.filter(([x, y]) => speck(x, y, big ? 7 : 6));
const dappled = (pts: Px[]) => pts.filter(([x, y]) => speck(Math.floor(x / 3), y >> 1, 3));

/** A picture being painted: parts in a colour, shaded by where their edges are. */
class Art {
  readonly s: Sprite;
  private lv = new Map<number, [RGB, number]>();
  /** Painted to the edge or past it: no room for the line about it. */
  cramped = false;

  /** `big`: a large beast (thicker legs, longer tails), whatever the canvas. */
  constructor(readonly n: number, readonly big = false) {
    this.s = new Sprite(n, n);
  }

  private put(x: number, y: number, c: RGB, l: number): void {
    if (x < 1 || y < 1 || x >= this.n - 1 || y >= this.n - 1) this.cramped = true;
    if (x < 0 || y < 0 || x >= this.n || y >= this.n) return;
    l = Math.max(0, Math.min(SHADES.length - 1, l));
    this.lv.set(key(x, y), [c, l]);
    this.s.set(x, y, tone(c, SHADES[l]));
  }

  /** A part lit from the top-left: its top rim lighter, its right and bottom darker. */
  part(pts: Px[], c: RGB, l = 1): void {
    const has = new Set(pts.map(([x, y]) => key(x, y)));
    const in_ = (x: number, y: number) => has.has(key(x, y));
    for (const [x, y] of pts) this.put(x, y, c, l - (in_(x, y - 1) ? 0 : 1) + (in_(x + 1, y) ? 0 : 1) + (in_(x, y + 1) ? 0 : 1));
  }

  dot(pts: Px[], c: RGB, l = 1): void {
    for (const [x, y] of pts) this.put(x, y, c, l);
  }

  /** Recolours painted pixels, keeping their shade (markings). */
  mark(pts: Px[], c: RGB): void {
    for (const [x, y] of pts) {
      const p = this.lv.get(key(x, y));
      if (p) this.put(x, y, c, p[1]);
    }
  }

  shift(pts: Px[], d: number): void {
    for (const [x, y] of pts) {
      const p = this.lv.get(key(x, y));
      if (p) this.put(x, y, p[0], p[1] + d);
    }
  }

  eye(x: number, y: number, c: RGB = INK): void {
    if (!this.lv.has(key(x, y))) return;
    this.lv.set(key(x, y), [c, 1]);
    this.s.set(x, y, c);
  }

  private fine: [number, number, RGB][] = [];

  /** Lines too fine to take a dark line about them (antlers). */
  thin(pts: Px[], c: RGB): void {
    for (const [x, y] of pts) this.fine.push([x, y, c]);
  }

  /** A dark line about the whole, and (standing on the ground) a shadow at the feet. */
  finish(shadow = true): Sprite {
    const n = this.n, ring: [number, number, RGB][] = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (this.lv.has(key(x, y))) continue;
      const by = [[x, y + 1], [x - 1, y], [x + 1, y], [x, y - 1]].map(([a, b]) => this.lv.get(key(a, b))).find(Boolean);
      if (by) ring.push([x, y, by[0].map((v) => Math.round(v * 0.3)) as RGB]);
    }
    for (const [x, y, c] of ring) this.s.set(x, y, c);
    for (const [x, y, c] of this.fine) if (!this.lv.has(key(x, y))) this.s.set(x, y, c);
    if (shadow) {
      const feet = [...this.lv.keys()].filter((k) => (k >> 8) - 32 >= n - 4).map((k) => (k & 255) - 32);
      for (let x = Math.min(...feet) - 1; x <= Math.max(...feet) + 1; x++) if (!this.s.alpha(x, n - 1)) this.s.set(x, n - 1, [0, 0, 0], 70);
    }
    return this.s;
  }
}

// ---- Four-legged beasts (and the small ones that crouch) -----------------------------------------

type Ears = 'point' | 'prick' | 'round' | 'tall' | 'long' | 'flop' | 'tuft';
type Tail = 'stub' | 'scut' | 'low' | 'brush' | 'whip' | 'up' | 'horse' | 'cow' | 'curl' | 'flat' | 'thin' | 'over';
type Horns = 'short' | 'lyre' | 'bison' | 'goat' | 'spike' | 'antlers' | 'palm' | 'tusk';
type Mark = 'belly' | 'rump' | 'stripes' | 'spots' | 'dapple' | 'mask' | 'band' | 'cross' | 'wool' | 'beard' | 'nose';

interface Quad {
  /** Seen from the side: the body's length and depth, the legs' length (and thickness). */
  body: [number, number];
  leg: number;
  legW?: number;
  /** The body's width seen from in front (its depth and one more if left out). */
  wide?: number;
  /** The skull: how far past the chest it starts, how far its top is above the back, its length and height. */
  head: [number, number, number, number];
  /** The muzzle beyond the skull: its length and height, and how far below the skull's top it starts. */
  snout?: [number, number, number?];
  /** A neck this thick from the shoulders up to the skull. */
  neck?: number;
  ears?: Ears;
  earLen?: number;
  tail?: Tail;
  horns?: Horns;
  /** A camel's hump, or a hump this high over the shoulders. */
  hump?: 'camel' | number;
  mane?: 'horse' | 'lion' | 'ridge' | 'shag';
  marks?: Mark[];
  trunk?: boolean;
  c: string;
  pale?: string;
  dark?: string;
  legs?: string;
  face?: string;
  muzzle?: string;
  horn?: string;
}

const QUADS: Record<string, Quad> = {
  hare: { body: [6, 4], leg: 1, head: [-1, 2, 3, 3], snout: [1, 2], ears: 'long', tail: 'scut', marks: ['belly'], c: '#9a7a52', pale: '#dccbaa' },
  rabbit: { body: [5, 4], leg: 1, head: [-1, 1, 3, 3], snout: [1, 2], ears: 'long', earLen: 2, tail: 'scut', c: '#8c7a62', pale: '#f2eee2' },
  squirrel: { body: [4, 3], leg: 1, head: [-1, 1, 2, 2], snout: [1, 1], ears: 'point', tail: 'over', marks: ['belly'], c: '#b05a2a', pale: '#ecdcc4' },
  beaver: { body: [8, 4], leg: 1, head: [-1, 0, 3, 3], snout: [1, 2], ears: 'round', tail: 'flat', marks: ['nose'], c: '#6e4c2a', dark: '#34302e' },
  cat: { body: [7, 3], leg: 3, head: [0, 1, 3, 3], snout: [1, 1, 1], ears: 'point', tail: 'up', marks: ['belly'], c: '#8e887a', pale: '#d8d2c4' },
  rat: { body: [5, 2], leg: 1, head: [-1, 0, 2, 2], snout: [1, 1, 1], ears: 'round', tail: 'thin', c: '#6a5e54', pale: '#c09a90' },
  fox: { body: [7, 3], leg: 3, head: [0, 2, 3, 3], snout: [2, 1, 1], ears: 'point', tail: 'brush', marks: ['belly', 'nose'], c: '#c8642a', pale: '#f2eada', legs: '#4a3226', dark: '#2e2420' },
  badger: { body: [8, 4], leg: 2, head: [0, -1, 3, 3], snout: [1, 2], ears: 'round', tail: 'stub', marks: ['mask', 'nose'], c: '#808084', pale: '#ecece4', dark: '#26262a', legs: '#2e2e32' },
  wolverine: { body: [8, 4], leg: 2, head: [0, -1, 3, 3], snout: [1, 2], ears: 'round', tail: 'low', marks: ['band'], c: '#3e2e24', pale: '#b89a68' },
  lynx: { body: [8, 4], leg: 3, head: [0, 1, 3, 3], snout: [1, 2], ears: 'tuft', tail: 'stub', marks: ['spots', 'belly'], c: '#b09a70', pale: '#e4d8bc', dark: '#3a3028' },
  roe_deer: { body: [8, 4], leg: 5, head: [1, 4, 2, 2], snout: [2, 2], neck: 2, ears: 'tall', earLen: 1, tail: 'stub', horns: 'spike', marks: ['rump', 'belly'], c: '#a8743e', pale: '#ecdcc0', horn: '#d8c8a0' },
  red_deer: { body: [13, 6], leg: 8, head: [2, 6, 3, 3], snout: [3, 2, 1], neck: 3, ears: 'tall', tail: 'stub', horns: 'antlers', marks: ['rump', 'belly', 'nose'], c: '#9a5e34', pale: '#e2caa2', horn: '#b8a47a' },
  elk: { body: [14, 7], leg: 9, head: [1, 4, 4, 4], snout: [3, 4, 1], neck: 4, ears: 'tall', hump: 1, horns: 'palm', marks: ['beard'], c: '#5a4630', legs: '#8e7e6a', horn: '#c4b492' },
  wild_horse: { body: [12, 6], leg: 6, head: [3, 5, 3, 4], snout: [3, 3, 2], neck: 4, ears: 'prick', tail: 'horse', mane: 'horse', marks: ['belly'], c: '#b0905c', pale: '#d8c49a', dark: '#3a2c20', legs: '#5a4632' },
  bison: { body: [15, 8], leg: 5, head: [-1, -3, 4, 5], snout: [1, 3, 2], ears: 'round', tail: 'cow', horns: 'bison', hump: 3, mane: 'shag', marks: ['beard'], c: '#7e5836', dark: '#3e2a1c', horn: '#2a2420' },
  aurochs: { body: [15, 7], leg: 6, head: [0, -1, 4, 4], snout: [2, 3, 1], ears: 'flop', tail: 'cow', horns: 'lyre', marks: ['cross'], c: '#322a26', dark: '#b8a888', muzzle: '#c8b898', horn: '#e4dcc4' },
  camel: { body: [13, 6], leg: 9, head: [3, 7, 3, 3], snout: [2, 2, 1], neck: 3, ears: 'round', tail: 'cow', hump: 'camel', c: '#b89260' },
  mountain_goat: { body: [8, 5], leg: 3, head: [0, 2, 3, 3], snout: [1, 2], ears: 'point', tail: 'stub', horns: 'goat', marks: ['beard'], c: '#dcd6c8', dark: '#2e2a28', horn: '#2e2a28' },
  boar: { body: [9, 5], leg: 3, head: [0, -1, 3, 4], snout: [2, 2, 2], ears: 'point', tail: 'cow', horns: 'tusk', mane: 'ridge', c: '#52423a', dark: '#2a2220', horn: '#ece4d4' },
  wolf: { body: [8, 4], leg: 4, head: [0, 2, 3, 3], snout: [3, 2, 1], ears: 'prick', tail: 'low', marks: ['belly', 'nose'], c: '#8c8c88', pale: '#cfcdc4', dark: '#3a3a3e' },
  mountain_lion: { body: [9, 4], leg: 4, head: [0, 1, 3, 3], snout: [1, 2, 1], ears: 'round', tail: 'whip', marks: ['belly'], c: '#b8925a', pale: '#ead9b8' },
  brown_bear: { body: [14, 8], leg: 4, legW: 3, head: [0, -1, 4, 5], snout: [2, 3, 2], ears: 'round', tail: 'stub', hump: 1, marks: ['nose'], c: '#6a4526', muzzle: '#a88458', dark: '#2a1e18' },
  lion: { body: [13, 6], leg: 5, head: [0, 2, 4, 4], snout: [2, 3, 1], ears: 'round', tail: 'whip', mane: 'lion', marks: ['belly', 'nose'], c: '#c8a060', pale: '#e8d4a8', dark: '#7a4e26' },
  tiger: { body: [14, 6], leg: 5, head: [0, 1, 4, 4], snout: [2, 3, 1], ears: 'round', tail: 'whip', marks: ['stripes', 'belly', 'nose'], c: '#d47c2c', pale: '#f4ead8', dark: '#2a2220', muzzle: '#f4ead8' },
  hyena: { body: [8, 4], leg: 4, head: [0, 1, 3, 3], snout: [2, 2, 1], ears: 'round', tail: 'low', hump: 1, marks: ['spots'], c: '#a08e6c', dark: '#3e342c', muzzle: '#3e342c' },
  elephant: { body: [16, 12], leg: 7, legW: 4, head: [0, 2, 6, 8], tail: 'cow', trunk: true, c: '#8c8a88', horn: '#ece4d0' },
  cattle: { body: [14, 7], leg: 5, head: [0, -1, 4, 4], snout: [1, 3, 1], ears: 'flop', tail: 'cow', horns: 'short', marks: ['dapple'], c: '#8e6844', pale: '#ece4d4', muzzle: '#d8b0a8', horn: '#e4dcc4' },
  sheep: { body: [8, 5], leg: 3, head: [0, 0, 3, 3], snout: [1, 2, 1], ears: 'flop', tail: 'stub', marks: ['wool'], c: '#e4e0d2', face: '#4e443c', legs: '#4e443c' },
  goat: { body: [8, 4], leg: 4, head: [0, 2, 3, 3], snout: [1, 2, 1], ears: 'flop', tail: 'stub', horns: 'goat', marks: ['beard'], c: '#c8b89a', horn: '#8a7a66', dark: '#6a5a48' },
  pig: { body: [9, 5], leg: 2, head: [0, -1, 3, 4], snout: [1, 2, 2], ears: 'point', tail: 'curl', c: '#dca4a0', muzzle: '#c47c7c' },
  horse: { body: [13, 7], leg: 7, head: [3, 6, 3, 4], snout: [3, 3, 2], neck: 4, ears: 'prick', tail: 'horse', mane: 'horse', c: '#7c5230', dark: '#2a1e18', legs: '#3a2a20' },
  donkey: { body: [9, 4], leg: 5, head: [1, 3, 3, 3], snout: [2, 2, 1], neck: 2, ears: 'tall', earLen: 3, tail: 'cow', marks: ['cross', 'belly'], c: '#8e8474', pale: '#d8d0c0', muzzle: '#d8d0c0', dark: '#3a3430' },
  dog: { body: [8, 4], leg: 4, head: [0, 2, 3, 3], snout: [2, 2, 1], ears: 'flop', tail: 'up', marks: ['nose'], c: '#8a6238', dark: '#2e2420' },
};

/** How far a tail reaches behind the rump (small beasts, large ones). */
const TAIL_REACH: Record<Tail, [number, number]> = { stub: [1, 1], scut: [1, 1], low: [2, 3], brush: [4, 4], whip: [3, 6], up: [2, 2], horse: [2, 2], cow: [1, 1], curl: [2, 2], flat: [3, 3], thin: [4, 4], over: [2, 2] };

interface Palette {
  main: RGB;
  pale: RGB;
  dark: RGB;
  legs: RGB;
  face: RGB;
  horn: RGB;
}
const paletteOf = (q: Quad): Palette => {
  const main = hex(q.c);
  return { main, pale: q.pale ? hex(q.pale) : tone(main, 0.35), dark: q.dark ? hex(q.dark) : tone(main, -0.5), legs: hex(q.legs ?? q.c), face: hex(q.face ?? q.c), horn: hex(q.horn ?? '#d8ccb0') };
};
/** An eye that shows: dark, or pale on a dark face. */
const eyeOn = (c: RGB): RGB => (c[0] + c[1] + c[2] < 200 ? [196, 170, 110] : INK);

/** Horns from the side, from the skull's top-left corner: the horn, and its tip. */
function hornsSide(h: Horns, x: number, y: number): [Px[], Px[]] {
  switch (h) {
    case 'short': return [[[x + 1, y - 1], [x + 2, y - 2]], []];
    case 'lyre': return [[[x + 1, y - 1], [x + 2, y - 2], [x + 3, y - 3]], [[x + 4, y - 4]]];
    case 'bison': return [[[x + 1, y - 1]], [[x + 2, y - 2]]];
    case 'goat': return [[[x + 1, y - 1], [x, y - 2]], [[x - 1, y - 2]]];
    case 'spike': return [[[x + 1, y - 1], [x + 1, y - 2]], []];
    case 'antlers': return [[[x + 1, y - 1], [x, y - 2], [x, y - 3], [x - 1, y - 4], [x - 1, y - 5], [x, y - 6], [x + 1, y - 3], [x + 2, y - 4], [x + 1, y - 6], [x - 2, y - 5]], []];
    case 'palm': return [[[x + 1, y - 1], [x, y - 2], ...box(x - 3, y - 4, x + 1, y - 3), [x - 3, y - 5], [x - 1, y - 5], [x + 1, y - 5]], []];
    default: return [[], []];
  }
}

/** Horns from in front or behind, on the left of a head from x0: the horn, and its tip. */
function hornsFront(h: Horns, x0: number, y: number): [Px[], Px[]] {
  switch (h) {
    case 'short': return [[[x0 - 1, y], [x0 - 2, y - 1]], []];
    case 'lyre': return [[[x0 - 1, y], [x0 - 2, y - 1], [x0 - 3, y - 2], [x0 - 3, y - 3]], [[x0 - 2, y - 4]]];
    case 'bison': return [[[x0 - 1, y + 1], [x0 - 2, y]], [[x0 - 2, y - 1]]];
    case 'goat': return [[[x0, y - 1], [x0, y - 2]], [[x0 - 1, y - 3]]];
    case 'spike': return [[[x0, y - 1], [x0, y - 2]], []];
    case 'antlers': return [[[x0, y - 1], [x0 - 1, y - 2], [x0 - 1, y - 3], [x0 - 2, y - 4], [x0 - 2, y - 5], [x0 - 1, y - 6], [x0 - 3, y - 3], [x0, y - 4], [x0 - 3, y - 6]], []];
    case 'palm': return [[[x0 - 1, y - 1], ...box(x0 - 5, y - 3, x0 - 2, y - 2), [x0 - 5, y - 4], [x0 - 3, y - 4], [x0 - 2, y - 4]], []];
    default: return [[], []];
  }
}

function quadSide(A: Art, q: Quad, fr: number): void {
  const P = paletteOf(q), B = A.n - 2, big = A.big, marks = new Set(q.marks);
  const [len, deep] = q.body, [hx, hy, hl, hh] = q.head, [sl, sh] = q.snout ?? [0, 0], sd = q.snout?.[2] ?? hh - sh;
  const lw = q.legW ?? (big ? 2 : 1);
  const fore = Math.max(0, hx + hl + sl) + (q.trunk ? 3 : 0), rear = q.tail ? TAIL_REACH[q.tail][big ? 1 : 0] : 0;
  const xl = Math.round(A.n / 2 - 0.5 - (len - 1 + fore - rear) / 2), xr = xl + len - 1;
  const top = B - q.leg - deep + 1, bot = B - q.leg;
  const hx0 = xr + 1 + hx, hy0 = top - hy, hx1 = hx0 + hl - 1, hy1 = hy0 + hh - 1;
  const sx1 = hx1 + sl, sy0 = hy0 + sd, sy1 = sy0 + sh - 1;

  const leg = (x: number, swing: number, far: boolean) => {
    const pts: Px[] = [];
    for (let y = bot + 1; y <= B; y++) for (let i = 0; i < lw; i++) pts.push([x + i + Math.round((swing * (y - bot)) / q.leg), y]);
    A.part(pts, P.legs, far ? 2 : 1);
    A.dot(row(B, x + swing, x + swing + lw - 1), P.legs, far ? 4 : 3);
  };
  const stride = fr === 0 ? 0 : (q.leg >= 5 ? 2 : 1) * (fr === 1 ? 1 : -1);
  // The far legs show a pixel inside the near ones, and swing the other way.
  const hind = xl + 1, front = xr - lw;
  if (len >= 2 * lw + 6) {
    leg(hind + 1, stride, true);
    leg(front - 1, -stride, true);
  }

  // The tail, behind the rump.
  const t = q.tail;
  if (t === 'stub' || t === 'scut') A.part([[xl - 1, top + 1]], t === 'scut' || marks.has('rump') ? P.pale : P.main);
  else if (t === 'low') A.part(big ? [[xl - 1, top + 1], [xl - 2, top + 2], [xl - 2, top + 3], [xl - 3, top + 4], [xl - 3, top + 5]] : [[xl - 1, top + 1], [xl - 2, top + 2], [xl - 2, top + 3]], P.main, 2);
  else if (t === 'brush') {
    A.part([[xl - 1, top], [xl - 1, top + 1], [xl - 2, top + 1], [xl - 2, top + 2], [xl - 3, top + 1], [xl - 3, top + 2]], P.main);
    A.part([[xl - 4, top + 2]], P.pale);
  } else if (t === 'whip') {
    A.part(big ? [[xl - 1, top + 1], [xl - 2, top + 2], [xl - 3, top + 3], [xl - 4, top + 4], [xl - 5, top + 4]] : [[xl - 1, top + 1], [xl - 2, top + 2]], P.main);
    A.part(big ? [[xl - 6, top + 3]] : [[xl - 3, top + 2]], q.dark ? P.dark : P.main);
  } else if (t === 'up') A.part([[xl - 1, top], [xl - 2, top - 1], [xl - 2, top - 2]], P.main);
  else if (t === 'horse') A.part([...col(xl - 1, top + 1, top + deep + 2), ...col(xl - 2, top + 3, top + deep + 1)], P.dark, 2);
  else if (t === 'cow') {
    A.part(col(xl - 1, top + 1, top + deep - 1), P.main, 2);
    A.part([[xl - 1, top + deep]], P.dark, 2);
  } else if (t === 'curl') A.part([[xl - 1, top + 1], [xl - 2, top]], P.main);
  else if (t === 'flat') A.part([[xl - 1, B], [xl - 2, B], [xl - 3, B], [xl - 1, B - 1], [xl - 2, B - 1]], P.dark, 2);
  else if (t === 'thin') A.dot([[xl - 1, bot], [xl - 2, B], [xl - 3, B], [xl - 4, B]], P.pale, 2);
  else if (t === 'over') A.part([[xl - 1, top + 1], [xl - 1, top], [xl - 2, top], [xl - 2, top - 1], [xl - 1, top - 1], [xl - 2, top - 2], [xl - 1, top - 2], [xl, top - 2]], P.main, 0);

  // The body, with its humps and its wool.
  const body = rbox(xl, top, xr, bot, deep >= 7 ? 2 : deep >= 3 ? 1 : 0);
  if (q.hump === 'camel') body.push(...oval(xl + len * 0.45, top, 3, 3.2).filter(([, y]) => y < top));
  else if (q.hump) body.push(...oval(xr - len * 0.25, top, len * 0.3, q.hump + 0.2).filter(([, y]) => y < top));
  if (marks.has('wool')) for (let x = xl + 1; x < xr; x += 2) body.push([x, top - 1]);
  A.part(body, P.main);
  if (marks.has('wool')) A.shift(body.filter(([x, y]) => (x * 3 + y * 5) % 7 === 0), 1);
  if (marks.has('belly')) A.mark([...row(bot, xl + 1, xr - 1), ...(deep >= 6 ? row(bot - 1, xl + 3, xr - 2) : [])], P.pale);
  if (marks.has('rump')) A.mark([...col(xl, top + 1, bot - 1), [xl + 1, top + 2]], P.pale);
  if (marks.has('stripes')) for (let x = xl + 1, i = 0; x < xr; x += big ? 3 : 2, i++) A.mark(col(x, top, bot - 1 - (i % 2)), P.dark);
  if (marks.has('spots')) A.mark(spotted(body.filter(([, y]) => y < bot), big), P.dark);
  if (marks.has('dapple')) A.mark(dappled(body), P.pale);
  if (marks.has('band')) A.mark([...row(bot - 1, xl + 1, xr - 1), [xl + 1, bot - 2], [xr - 1, bot - 2]], P.pale);
  if (marks.has('cross')) A.mark([...row(top, xl + 1, xr - 1), ...col(xr - 2, top, top + 2)], P.dark);
  if (q.mane === 'ridge') A.part(row(top - 1 - (q.hump ? 1 : 0), q.hump ? xr - 4 : xl + 2, xr - 1), P.dark, 2);
  if (q.mane === 'shag') A.mark(body.filter(([x]) => x > xr - len * 0.45), P.dark);

  leg(hind, -stride, false);
  leg(front, stride, false);
  if (q.mane === 'shag') A.mark(box(front - 2, bot + 1, front + lw + 2, B - 2), P.dark);

  // The neck and the head.
  if (q.neck) {
    const neck = seg(xr - 1, top + 1, hx0 + 1, hy1).flatMap(([x, y]) => row(y, x - (q.neck! >> 1), x - (q.neck! >> 1) + q.neck! - 1));
    A.part(neck, P.main);
    if (q.mane === 'horse') {
      const edge = new Map<number, number>();
      for (const [x, y] of neck) edge.set(y, Math.min(x, edge.get(y) ?? 99));
      A.mark([...edge].map(([y, x]) => [x, y] as Px), P.dark);
    }
  }
  if (q.mane === 'lion') A.part(oval(hx0 + 0.5, hy0 + hh / 2, 3, hh / 2 + 2), P.dark);
  const skull = box(hx0, hy0, hx1, hy1).filter(([x, y]) => !(hl >= 3 && hh >= 3 && y === hy0 && (x === hx0 || (q.trunk && x === hx1))));
  const snout = box(hx1 + 1, sy0, sx1, sy1).filter(([x, y]) => !(sl >= 2 && sh >= 2 && x === sx1 && y === sy0));
  A.part([...skull, ...snout], P.face);
  if (q.muzzle) A.mark(snout, hex(q.muzzle));
  if (q.mane === 'shag') A.mark([...skull, ...snout], P.dark);
  if (marks.has('mask')) {
    A.mark([...skull, ...snout], P.pale);
    A.mark(row(hy0 + 1, hx0, sx1 - 1), P.dark);
  }
  if (marks.has('nose') && sl) A.dot([[sx1, sy0 + (sl >= 2 && sh >= 2 ? 1 : 0)]], P.dark, 2);
  if (marks.has('beard')) A.part([[hx1, Math.max(hy1, sy1) + 1], ...(big ? [[hx1, Math.max(hy1, sy1) + 2] as Px] : [])], q.mane === 'shag' || !q.dark ? P.face : P.dark, 2);
  if (q.trunk) {
    A.part(oval(hx0 + 1, hy0 + 4.5, 2.7, 4), tone(P.main, -0.25));
    A.part([...box(hx1 - 1, hy1 + 1, hx1, hy1 + 3), ...col(hx1, hy1 + 4, B - 2), [hx1 + 1, B - 2]], P.main);
    A.part([[hx1 + 1, hy1], [hx1 + 2, hy1 + 1], [hx1 + 3, hy1 + 1]], P.horn, 0);
    A.eye(hx1 - 1, hy0 + 2);
  } else if (!marks.has('mask')) A.eye(hx1, hy0 + (hh >= 3 ? 1 : 0), eyeOn(q.mane === 'shag' ? P.dark : P.face));

  // Ears and horns.
  const e = q.ears, n = q.earLen ?? (e === 'long' ? 3 : 2);
  if (e === 'point' || e === 'tuft') {
    if (hl >= 3) A.part([[hx0 + 2, hy0 - 1]], P.face, 2);
    A.part([[hx0, hy0 - 1]], P.face);
    if (e === 'tuft') A.dot([[hx0, hy0 - 2]], P.dark, 2);
  } else if (e === 'round') A.part([[hx0, hy0 - 1]], P.face);
  else if (e === 'prick') A.part([[hx0 + 1, hy0 - 1]], P.face);
  else if (e === 'tall') A.part(col(hx0, hy0 - n, hy0 - 1), P.face);
  else if (e === 'long') {
    A.part(col(hx0 + 1, hy0 - n + 1, hy0 - 1), P.face, 2);
    A.part(col(hx0, hy0 - n, hy0 - 1), P.face);
  } else if (e === 'flop') A.shift([[hx0, hy0 + 1], ...(big ? [[hx0, hy0 + 2] as Px] : [])], 2);
  if (q.horns === 'tusk') A.dot([[sx1, sy1], [sx1 + 1, sy1 - 1]], P.horn, 0);
  else if (q.horns === 'antlers') A.thin(hornsSide(q.horns, hx0, hy0)[0], P.horn);
  else if (q.horns) {
    const [horn, tip] = hornsSide(q.horns, hx0, hy0);
    A.part(horn, P.horn);
    A.part(tip, q.horns === 'lyre' ? INK : P.horn, 2);
  }
}

/** A four-legged beast from in front (facing south) or behind. */
function quadFront(A: Art, q: Quad, back: boolean, fr: number): void {
  const P = paletteOf(q), B = A.n - 2, big = A.big, marks = new Set(q.marks), mid = A.n / 2;
  const [len, deep] = q.body, [, hy, , hh] = q.head, sl = q.snout?.[0] ?? 0;
  const lw = q.legW ?? (big ? 2 : 1), wide = q.wide ?? deep + (big ? 2 : 1);
  const x0 = Math.round(mid - wide / 2), x1 = x0 + wide - 1;
  const mids = wide % 2 ? [x0 + (wide >> 1)] : [x0 + wide / 2 - 1, x0 + wide / 2];
  const bt = B - q.leg - deep + 1 - Math.round(len * 0.15) - (typeof q.hump === 'number' ? q.hump : 0), bb = B - q.leg;
  let hw = Math.max(3, hh + (hh >= 4 ? 1 : 0));
  if ((hw - wide) % 2) hw += hw < wide ? 1 : -1;
  const hx0 = Math.round(mid - hw / 2), hx1 = hx0 + hw - 1;
  const hhS = hh + (sl ? Math.max(1, Math.min(3, sl - 1)) : 0);
  const ht = bt - 1 - Math.round(hy / 2), hb = ht + hhS - 1;
  const both = (pts: Px[]) => [...pts, ...across(pts, x0, x1)];
  const midCol = (y0: number, y1: number) => mids.flatMap((x) => col(x, y0, y1));

  // What shows behind the body from in front: a raised or bushy tail.
  if (!back) {
    if (q.tail === 'over') A.part([[x1 + 1, bt + 1], [x1 + 1, bt], [x1, bt - 1], [x1 + 1, bt - 1], [x1, bt - 2]], P.main, 0);
    else if (q.tail === 'brush') {
      A.part([[x1 + 1, B - 1], [x1 + 2, B - 1], [x1 + 2, B - 2]], P.main);
      A.part([[x1 + 3, B - 2]], P.pale);
    }
  }

  const inset = wide >= 6 ? 1 : 0;
  for (const [x, lift] of [[x0 + inset, fr === 1], [x1 - inset - lw + 1, fr === 2]] as [number, boolean][]) {
    const foot = B - (lift ? 1 : 0);
    A.part(box(x, bb + 1, x + lw - 1, foot), P.legs);
    if (foot > bb) A.dot(row(foot, x, x + lw - 1), P.legs, 3);
  }

  const head = () => {
    if (q.trunk) A.part(both(oval(hx0 - 1.5, ht + 3.5, 2.6, 3.6)), tone(P.main, -0.22));
    if (q.mane === 'lion' && !back) A.part(oval(mid - 0.5, (ht + hb) / 2, hw / 2 + 1.6, hhS / 2 + 1.6), P.dark);
    A.part(rbox(hx0, ht, hx1, hb, hw >= 5 ? 1 : 0), P.face);
    const e = q.ears, n = q.earLen ?? (e === 'long' ? 3 : 2);
    if (e === 'point' || e === 'prick' || e === 'round' || e === 'tuft') A.part(both([[hx0, ht - 1]]), P.face);
    if (e === 'tuft') A.dot(both([[hx0, ht - 2]]), P.dark, 2);
    if (e === 'tall' || e === 'long') A.part(both(col(hx0, ht - n, ht - 1)), P.face);
    if (e === 'flop') A.part(both([[hx0 - 1, ht + 1], ...(big ? [[hx0 - 1, ht + 2] as Px] : [])]), P.face, 2);
    if (q.horns === 'antlers') A.thin(both(hornsFront(q.horns, hx0, ht)[0]), P.horn);
    else if (q.horns && q.horns !== 'tusk') {
      const [horn, tip] = hornsFront(q.horns, hx0, ht);
      A.part(both(horn), P.horn);
      A.part(both(tip), q.horns === 'lyre' ? INK : P.horn, 2);
    }
  };

  const body = rbox(x0, bt, x1, bb, wide >= 7 ? 2 : 1);
  if (q.hump === 'camel') body.push(...oval(mid - 0.5, bt, 2.6, 2.2).filter(([, y]) => y < bt));
  if (marks.has('wool')) {
    for (let x = x0 + 1; x < x1; x += 2) body.push([x, bt - 1]);
    for (let y = bt + 1; y < bb; y += 2) body.push([x0 - 1, y], [x1 + 1, y]);
  }
  if (back) head();
  A.part(body, P.main);
  if (marks.has('wool')) A.shift(body.filter(([x, y]) => (x * 3 + y * 5) % 7 === 0), 1);
  if (marks.has('stripes')) for (let y = bt + 1; y < bb; y += 2) A.mark(back ? row(y, x0, x1).filter(([x]) => !mids.includes(x)) : both(row(y, x0, x0 + (wide >= 6 ? 1 : 0))), P.dark);
  if (marks.has('spots')) A.mark(spotted(body, big), P.dark);
  if (marks.has('dapple')) A.mark(dappled(body), P.pale);
  if (marks.has('band')) A.mark(both(col(x0, bt + 1, bb - 1)), P.pale);
  if (q.mane === 'ridge') A.part(midCol(bt - 1, bt + (back ? 2 : 0)), P.dark, 2);
  if (q.mane === 'shag') {
    A.mark(body.filter(([, y]) => (back ? y < bt + (bb - bt) * 0.4 : y > bt + 2)), P.dark);
    if (!back) A.mark(box(x0, bb + 1, x1, B - 2), P.dark);
  }

  if (back) {
    if (marks.has('rump')) A.mark(box(mids[0] - 1, bt + 1, mids[mids.length - 1] + 1, bt + 3), P.pale);
    if (marks.has('cross')) A.mark([...midCol(bt, bb - 1), ...row(bt + 2, mids[0] - 1, mids[mids.length - 1] + 1)], P.dark);
    if (q.mane === 'horse') A.mark(midCol(ht, bt + 2), P.dark);
    if (q.mane === 'lion') A.part(oval(mid - 0.5, bt, hw / 2 + 1.6, 2.6), P.dark);
    const t = q.tail, c = mids[0];
    if (t === 'stub' || t === 'scut') A.part([[c, bt + 2]], t === 'scut' || marks.has('rump') ? P.pale : P.main, 2);
    else if (t === 'low') A.part(col(c, bt + 2, bt + (big ? 6 : 4)), P.main, 2);
    else if (t === 'brush') {
      A.part([[c, bt + 2], [c, bt + 3], [c - 1, bt + 3], [c + 1, bt + 3], [c, bt + 4]], P.main, 2);
      A.part([[c, bt + 5]], P.pale);
    } else if (t === 'whip') {
      A.part(col(c, bt + 2, bt + (big ? 6 : 4)), P.main, 2);
      A.part([[c + 1, bt + (big ? 7 : 5)]], q.dark ? P.dark : P.main, 2);
    } else if (t === 'up') A.part(col(c, bt - 3, bt), P.main);
    else if (t === 'horse') A.part(mids.length > 1 ? box(mids[0], bt + 2, mids[1], bt + deep + 4) : box(c - 1, bt + 2, c + 1, bt + deep + 4), P.dark, 2);
    else if (t === 'cow') {
      A.part(col(c, bt + 2, bt + deep), P.main, 2);
      A.part([[c, bt + deep + 1]], P.dark, 2);
    } else if (t === 'curl') A.part([[c, bt + 2], [c + 1, bt + 1]], P.main, 2);
    else if (t === 'flat') A.part(box(c - 1, B - 1, c + 1, B), P.dark, 2);
    else if (t === 'thin') A.dot(col(c, bb, B), P.pale, 2);
    else if (t === 'over') A.part(oval(mid - 0.5, bt, 1.6, 2.2), P.main, 0);
    return;
  }

  // The face.
  if (marks.has('belly') && hb < bb) A.mark(box(x0 + 1 + inset, hb + 1, x1 - 1 - inset, bb), P.pale);
  head();
  const face = box(hx0 + (hw > 3 ? 1 : 0), ht + hh, hx1 - (hw > 3 ? 1 : 0), hb);
  if (q.muzzle) A.mark(face, hex(q.muzzle));
  if (q.mane === 'shag') A.mark(rbox(hx0, ht, hx1, hb, 0), P.dark);
  if (q.mane === 'horse') A.mark(midCol(ht, ht), P.dark);
  const eyeX = hx0 + (hw >= 5 ? 1 : 0), eyeY = ht + (hh >= 3 ? 1 : 0);
  if (marks.has('mask')) {
    A.mark(box(hx0, ht, hx1, hb), P.pale);
    A.mark(both(col(eyeX, ht, hb - 1)), P.dark);
  } else for (const [x, y] of both([[eyeX, eyeY]])) A.eye(x, y, eyeOn(q.mane === 'shag' ? P.dark : P.face));
  if (marks.has('nose') && sl) A.dot(midCol(ht + hh, ht + hh), P.dark, 2);
  if (marks.has('beard')) A.part(midCol(hb + 1, hb + (big ? 2 : 1)), q.mane === 'shag' || !q.dark ? P.face : P.dark, 2);
  if (q.horns === 'tusk') A.dot(both([[hx0, hb]]), P.horn, 0);
  if (q.trunk) {
    A.part(box(mids[0] - 1, hb - 1, mids[mids.length - 1] + 1, B - 1), P.main);
    A.part(both([[mids[0] - 2, hb + 1], [mids[0] - 2, hb + 2], [mids[0] - 3, hb + 3]]), P.horn, 0);
  }
}

// ---- Birds ---------------------------------------------------------------------------------------

type BirdExtra = 'comb' | 'collar' | 'crest' | 'disc' | 'bars' | 'sheen' | 'speckle';

interface Bird {
  /** From the side: the body's length and height, the legs' length. */
  body: [number, number];
  leg: number;
  wide?: number;
  /** The head: how far past the breast it starts, how far its top is above the back, its length and height. */
  head: [number, number, number, number];
  neck?: boolean;
  beak: [number, string];
  /** The tail's length, and how far its tip droops (or rises, below 0). */
  tail: [number, number];
  /** A wing's length, flying. */
  span: number;
  c: string;
  wing?: string;
  pale?: string;
  face?: string;
  legs?: string;
  tailC?: string;
  /** The wingtips. */
  tip?: string;
  extra?: BirdExtra[];
}

const BIRDS: Record<string, Bird> = {
  sparrow: { body: [4, 3], leg: 1, wide: 4, head: [-1, 1, 2, 2], beak: [1, '#3a3028'], tail: [2, 0], span: 3, c: '#9a7650', wing: '#6e5038', pale: '#dcd0bc', face: '#7a5a40', extra: ['speckle'] },
  crow: { body: [6, 4], leg: 2, head: [-1, 2, 3, 3], beak: [2, '#3c3c46'], tail: [3, 1], span: 6, c: '#2c2c36', wing: '#22222a' },
  raven: { body: [7, 4], leg: 2, head: [-1, 2, 3, 3], beak: [2, '#44444e'], tail: [3, 1], span: 6, c: '#24242c', wing: '#1c1c24' },
  pheasant: { body: [6, 4], leg: 2, head: [0, 2, 2, 2], beak: [1, '#dccc94'], tail: [6, 1], span: 4, c: '#a8562c', wing: '#8a4424', face: '#2a6a4a', tailC: '#b89058', extra: ['collar', 'bars', 'speckle'] },
  duck: { body: [7, 4], leg: 1, head: [-1, 2, 3, 3], beak: [2, '#dcb440'], tail: [1, -1], span: 5, c: '#9a8a74', wing: '#6e5e4c', pale: '#d0c8b8', face: '#2a6a44', legs: '#d08030', extra: ['collar'] },
  heron: { body: [6, 4], leg: 5, head: [1, 5, 2, 2], neck: true, beak: [3, '#dcbc4c'], tail: [2, 1], span: 6, c: '#9a9aa4', wing: '#787886', face: '#e4e4e8', legs: '#8a8460', extra: ['crest'] },
  gull: { body: [7, 4], leg: 2, head: [-1, 2, 3, 3], beak: [2, '#e4b430'], tail: [2, 0], span: 6, c: '#ecece8', wing: '#a0a4ac', legs: '#d09040', tip: '#2a2a30' },
  owl: { body: [5, 6], leg: 1, wide: 5, head: [-5, 3, 5, 4], beak: [0, '#dcb464'], tail: [1, 2], span: 6, c: '#8a7a62', wing: '#6e604c', pale: '#dcd0b4', extra: ['disc', 'speckle'] },
  hawk: { body: [6, 4], leg: 2, head: [-1, 2, 3, 3], beak: [1, '#e4c454'], tail: [3, 1], span: 6, c: '#80603e', wing: '#5e4630', pale: '#e4d4b4', tailC: '#8e6e4c', legs: '#dcb440', extra: ['bars'] },
  hen: { body: [6, 5], leg: 2, head: [-1, 2, 2, 3], beak: [1, '#e4b444'], tail: [2, -2], span: 3, c: '#c8a070', wing: '#a88456', legs: '#dca838', extra: ['comb', 'speckle'] },
  goose: { body: [8, 5], leg: 2, head: [0, 4, 2, 2], neck: true, beak: [2, '#e48a30'], tail: [1, -1], span: 6, c: '#ecece4', wing: '#d0d0c8', legs: '#e48a30' },
  pigeon: { body: [6, 4], leg: 1, head: [-1, 2, 3, 3], beak: [1, '#4a4448'], tail: [2, 1], span: 5, c: '#9a9aa8', wing: '#7e7e90', tailC: '#5a5a68', legs: '#c46464', extra: ['sheen'] },
};

const RED: RGB = [200, 48, 40], WHITE: RGB = [240, 240, 232];

function birdOnGround(A: Art, b: Bird, view: View, fr: number): void {
  const B = A.n - 2, mid = A.n / 2, extra = new Set(b.extra);
  const main = hex(b.c), wing = hex(b.wing ?? b.c), face = hex(b.face ?? b.c), tailC = hex(b.tailC ?? b.wing ?? b.c), legs = hex(b.legs ?? '#3a3430'), beak = hex(b.beak[1]);
  const [len, h] = b.body, [hx, hy, hl, hh] = b.head, bl = b.beak[0], [tl, droop] = b.tail;
  const bot = B - b.leg, top = bot - h + 1, swing = fr === 1 ? 1 : fr === 2 ? -1 : 0;

  if (view === 'e') {
    const fore = Math.max(0, hx + hl + bl), xl = Math.round(mid - 0.5 - (len - 1 + fore - tl) / 2), xr = xl + len - 1;
    const hx0 = xr + 1 + hx, hy0 = top - hy, hx1 = hx0 + hl - 1, hy1 = hy0 + hh - 1;
    const tail = Array.from({ length: tl }, (_, i) => [xl - 1 - i, top + 1 + Math.round(((i + 1) * droop) / tl)] as Px);
    A.part(tail, tailC, 2);
    if (extra.has('bars')) A.shift(tail.filter((_, i) => i % 2 === 1), 2);
    const lx = xl + (len >> 1);
    for (const [x, s, far] of [[lx - 1, -swing, true], [lx + 1, swing, false]] as [number, number, boolean][]) {
      A.dot(col(x + (b.leg > 2 ? 0 : s), bot + 1, B), legs, far ? 3 : 2);
      if (b.leg > 2) A.dot([[x + s, B]], legs, far ? 3 : 2);
      A.dot([[x + s + 1, B]], legs, far ? 3 : 2);
    }
    A.part(rbox(xl, top, xr, bot, h >= 3 ? 1 : 0), main);
    const fold = xl + Math.round(len * 0.6);
    A.mark(box(xl, top, fold, bot - 1), wing);
    A.shift(row(bot - 1, xl + 1, fold), 1);
    if (b.tip) A.mark([[xl, top + 1], [xl + 1, top + 1], [xl, top + 2]], hex(b.tip));
    if (b.pale) A.mark([...row(bot, xl + 1, xr - 1), ...col(xr, top + 1, bot - 1)], hex(b.pale));
    if (extra.has('speckle')) A.shift(box(xl, top, xr, bot).filter(([x, y]) => (x * 5 + y * 3) % 7 === 0), 1);
    if (extra.has('sheen')) {
      A.mark([[xr, top], [xr - 1, top]], [74, 138, 96]);
      A.mark([[xr, top + 1]], [134, 96, 150]);
      A.shift(row(bot - 2, xl + 1, fold - 1), 2);
    }
    if (b.neck) A.part(seg(xr - 1, top, hx0, hy1 + 1), face);
    A.part(box(hx0, hy0, hx1, hy1).filter(([x, y]) => !(hl >= 3 && hh >= 3 && y === hy0 && (x === hx0 || x === hx1))), face);
    if (extra.has('collar')) A.mark([[hx0, hy1 + 1], [hx0 + 1, hy1 + 1], [xr, top]], WHITE);
    A.dot(row(hy0 + (hh >> 1), hx1 + 1, hx1 + bl), beak, 1);
    if (extra.has('disc')) {
      A.mark(box(hx0 + 1, hy0 + 1, hx1, hy1), hex(b.pale ?? b.c));
      A.dot([[hx1, hy0 + 2]], beak, 1);
      A.eye(hx1 - 2, hy0 + 1);
      A.eye(hx1, hy0 + 1);
    } else A.eye(hx1, hy0 + (hh >= 3 ? 1 : 0), eyeOn(face));
    if (extra.has('comb')) {
      A.dot(row(hy0 - 1, hx0, hx1), RED, 1);
      A.dot([[hx1, hy1 + 1]], RED, 2);
    }
    if (extra.has('crest')) A.dot([[hx0 - 1, hy0], [hx0 - 2, hy0 + 1]], INK, 1);
    return;
  }

  // From in front or behind: the body, the head over it (on its neck), the wings at the sides.
  const back = view === 'n', wide = b.wide ?? (h % 2 ? h : h + 1);
  const x0 = Math.round(mid - wide / 2), x1 = x0 + wide - 1, bt = top - 1;
  const mids = wide % 2 ? [x0 + (wide >> 1)] : [x0 + wide / 2 - 1, x0 + wide / 2];
  const hw = wide % 2 ? (hl > 3 ? 5 : 3) : 2;
  const hx0 = Math.round(mid - hw / 2), hx1 = hx0 + hw - 1, ht = Math.min(top - hy, bt - 1), hb = ht + hh - 1;
  const inset = wide >= 5 ? 1 : 0;
  for (const [x, lift] of [[x0 + inset, fr === 1], [x1 - inset, fr === 2]] as [number, boolean][]) A.dot(col(x, bot + 1, B - (lift ? 1 : 0)), legs, 2);
  if (back) A.part(mids.flatMap((x) => col(x, bot, Math.min(B, bot + tl - 1))), tailC, 2);
  const body = rbox(x0, bt, x1, bot, 1);
  A.part(body, main);
  A.mark(back ? box(x0, bt + 1, x1, bot - 1) : [...col(x0, bt + 1, bot - 1), ...col(x1, bt + 1, bot - 1)], wing);
  if (back && b.tip) A.mark(row(bot - 1, x0, x1), hex(b.tip));
  if (!back && b.pale) A.mark(box(x0 + 1, bt + 2, x1 - 1, bot), hex(b.pale));
  if (extra.has('speckle')) A.shift(body.filter(([x, y]) => (x * 5 + y * 3) % 7 === 0), 1);
  if (hb < bt) A.part(mids.flatMap((x) => col(x, hb + 1, bt)), face);
  A.part(box(hx0, ht, hx1, hb).filter(([x, y]) => !(hw >= 5 && y === ht && (x === hx0 || x === hx1))), face);
  if (extra.has('collar')) A.mark(row(hb + 1, x0, x1), WHITE);
  if (extra.has('sheen')) A.mark(row(bt, x0, x1), [74, 138, 96]);
  if (extra.has('comb')) A.dot(mids.map((x) => [x, ht - 1] as Px), RED, 1);
  if (back) {
    if (extra.has('crest')) A.dot(mids.map((x) => [x, ht + 1] as Px), INK, 1);
    return;
  }
  const eyeY = ht + (hh >= 3 ? 1 : 0);
  if (extra.has('disc')) A.mark(box(hx0, ht + 1, hx1, hb), hex(b.pale ?? b.c));
  if (hw >= 3) {
    A.eye(hx0 + (hw >= 5 ? 1 : 0), eyeY, eyeOn(face));
    A.eye(hx1 - (hw >= 5 ? 1 : 0), eyeY, eyeOn(face));
  }
  A.dot(mids.map((x) => [x, hw >= 3 ? eyeY + (hh >= 3 || hw >= 5 ? 1 : 0) : hb] as Px), beak, 1);
  if (extra.has('comb')) A.dot(mids.map((x) => [x, hb + 1] as Px), RED, 2);
}

/** Things seen from straight above: along the way they face, and to their right. */
type Lay = (f: number, r: number) => Px;
const layOf = (d: View, cx: number, cy: number): Lay => (f, r) => (d === 'n' ? [cx + r, cy - f] : d === 's' ? [cx - r, cy + f] : [cx + f, cy + r]);

function birdFlying(A: Art, b: Bird, d: View, fr: number): void {
  const at = layOf(d, A.n / 2 - 1, A.n - 8);
  const main = hex(b.c), wing = hex(b.wing ?? b.c), face = hex(b.face ?? b.c), tailC = hex(b.tailC ?? b.wing ?? b.c);
  const [len, h] = b.body, tl = Math.min(3, b.tail[0]), bw = h >= 5 ? 2 : 1;
  const f1 = len >> 1, f0 = f1 - len + 1;
  const tail: Px[] = [];
  for (let i = 1; i <= tl; i++) for (let r = -Math.min(bw, i); r <= Math.min(bw, i); r++) tail.push(at(f0 - i, r));
  A.part(tail, tailC, 2);
  // The beat: wings out, half drawn, and swept back.
  const sweep = [0.35, 0.7, 1.4][fr], reach = Math.max(2, Math.round(b.span * [1, 0.85, 0.6][fr])), chord = Math.max(2, Math.round(len * 0.5));
  const feathers: Px[] = [], tips: Px[] = [];
  for (let i = 1; i <= reach; i++) {
    const c = Math.max(1, Math.round(chord * (1 - (i - 1) / (reach + 1)))), lead = f1 - 1 - Math.round(i * sweep);
    for (let j = 0; j < c; j++) for (const side of [-1, 1]) (i > reach - 2 ? tips : feathers).push(at(lead - j, side * (bw + i)));
  }
  A.part([...feathers, ...tips], wing);
  if (b.tip) A.mark(tips, hex(b.tip));
  const body: Px[] = [];
  for (let f = f0; f <= f1; f++) for (let r = -bw; r <= bw; r++) if (!((f === f0 || f === f1) && Math.abs(r) === bw && bw > 1)) body.push(at(f, r));
  A.part(body, main);
  const nl = b.neck ? 2 : 0;
  A.part([...Array.from({ length: nl }, (_, i) => at(f1 + 1 + i, 0)), at(f1 + nl + 1, 0), ...(b.head[2] >= 3 ? [at(f1 + nl + 1, -1), at(f1 + nl + 1, 1), at(f1 + nl + 2, 0)] : [])], face);
  A.dot([at(f1 + nl + (b.head[2] >= 3 ? 3 : 2), 0)], hex(b.beak[1]), 1);
}

// ---- The seal, and those that go on their bellies ------------------------------------------------

function seal(A: Art, view: View, fr: number): void {
  const main = hex('#74747c'), pale = hex('#b4b4b0'), dark = hex('#4a4a52'), up = fr === 1 ? 1 : 0;
  if (view === 'e') {
    A.part([[2, 12], [1, 11], [1, 13], [2, 13]], dark, 2);
    const body = [...row(10 - up, 5, 10), ...box(3, 11 - up, 11, 14).filter(([x, y]) => !(x < 5 && y < 12 - up) && !(x === 3 && y === 14))];
    A.part(body, main);
    A.mark([...row(14, 4, 11), ...row(13, 8, 11)], pale);
    A.part(box(10, 7 - up, 13, 10 - up).filter(([x, y]) => !(x === 10 && y === 7 - up) && !(x === 13 && y === 7 - up)), main);
    A.part([[14, 9 - up]], main);
    A.mark([[11, 10 - up], [12, 10 - up], [13, 10 - up]], pale);
    A.part([[7, 14], [8, 14], [9, 14 - (fr === 2 ? 1 : 0)]], dark, 2);
    A.shift(body.filter(([x, y]) => y < 13 && (x * 7 + y * 3) % 6 === 0), 1);
    A.eye(12, 8 - up);
    A.dot([[14, 9 - up]], INK, 1);
    return;
  }
  const back = view === 'n';
  A.part([...col(3, 12, 14 - (fr === 1 ? 1 : 0)), ...col(12, 12, 14 - (fr === 2 ? 1 : 0))], dark, 2);
  const body = rbox(4, 7 - up, 11, 14, 2);
  A.part(body, main);
  A.shift(body.filter(([x, y]) => (x * 7 + y * 3) % 6 === 0), 1);
  if (back) {
    A.part(rbox(5, 5 - up, 10, 8 - up, 1), main);
    A.part([[5, 14], [6, 14], [9, 14], [10, 14]], dark, 2);
    return;
  }
  A.mark(box(6, 10, 9, 14), pale);
  A.part(rbox(5, 5 - up, 10, 9 - up, 1), main);
  A.mark(box(6, 8 - up, 9, 9 - up), pale);
  A.eye(6, 7 - up);
  A.eye(9, 7 - up);
  A.dot([[7, 8 - up], [8, 8 - up]], INK, 1);
}

function viper(A: Art, d: View, fr: number): void {
  const at = layOf(d, A.n / 2 - 1, A.n - (d === 'e' ? 4 : 8)), main = hex('#8a8a4a'), dark = hex('#3e3a22');
  const wave = [0, 1, 1, 0, -1, -1];
  const body = Array.from({ length: 10 }, (_, i) => at(i - 5, wave[(i + fr * 2) % 6]));
  A.part(body, main);
  A.mark(body.filter((_, i) => i % 2 === 0), dark);
  const r = wave[(10 + fr * 2) % 6];
  A.part([at(5, r), at(6, r), at(5, r + (r > 0 ? -1 : 1))], main, 0);
  A.eye(...at(5, r));
}

function crocodile(A: Art, d: View, fr: number): void {
  const at = layOf(d, 16, 16), main = hex('#5c6c3a'), dark = hex('#36421f'), pale = hex('#a8a878');
  const sway = fr === 1 ? 1 : fr === 2 ? -1 : 0;
  const half = (f: number) => (f >= 13 ? 0 : f >= 10 ? 1 : f >= 4 ? 2 : f >= -4 ? 3 : f >= -8 ? 2 : f >= -12 ? 1 : 0);
  const bend = (f: number) => (f < -5 ? Math.round((sway * (-5 - f)) / 4) : 0);
  for (const [f, side, step] of [[3, -1, sway], [3, 1, -sway], [-4, -1, -sway], [-4, 1, sway]]) {
    A.part([at(f + step, side * 4), at(f + step, side * 5), at(f + step - 1, side * 4), at(f + step - 1, side * 5), at(f + step + 1, side * 6), at(f + step, side * 6)], main, 2);
  }
  const body: Px[] = [], ridge: Px[] = [], flank: Px[] = [];
  for (let f = -14; f <= 13; f++) for (let r = -half(f); r <= half(f); r++) {
    body.push(at(f, r + bend(f)));
    if (f < 9 && (f & 1) === 0 && (r === 0 || Math.abs(r) === 2)) ridge.push(at(f, r + bend(f)));
    if (f > -5 && f < 4 && Math.abs(r) === 3) flank.push(at(f, r));
  }
  A.part(body, main);
  A.mark(ridge, dark);
  A.mark(flank, pale);
  A.eye(...at(8, -2), [220, 190, 80]);
  A.eye(...at(8, 2), [220, 190, 80]);
  A.dot([at(12, -1), at(12, 1)], dark, 2);
}

// ---- Every species -------------------------------------------------------------------------------

/** Whether its pictures lie centred on the tile (those seen from above) rather than standing on it. */
export const animalLies = (id: string): boolean => id === 'crocodile';

function mirror(s: Sprite): Sprite {
  const out = new Sprite(s.w, s.h);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) out.set(s.w - 1 - x, y, s.get(x, y), s.alpha(x, y));
  return out;
}

/** One picture on a canvas n pixels square, or null for a species with no art here. */
function paint(id: string, d: View, fr: number, flying: boolean, n: number): Art | null {
  const size = SPECIES_BY_ID.get(id)?.size, A = new Art(n, size === 'large' || size === 'huge');
  const q = QUADS[id], b = BIRDS[id];
  if (q) {
    if (d === 'e') quadSide(A, q, fr);
    else quadFront(A, q, d === 'n', fr);
  } else if (b) {
    if (flying) birdFlying(A, b, d, fr);
    else birdOnGround(A, b, d, fr);
  } else if (id === 'seal') seal(A, d, fr);
  else if (id === 'viper') viper(A, d, fr);
  else if (id === 'crocodile') crocodile(A, d, fr);
  else return null;
  return A;
}

const cells = new Map<string, 1 | 2>();

/** The cells across (and down) an animal's pictures take: one, or two where any of them needs the room. */
export function animalCells(id: string): 1 | 2 {
  let n = cells.get(id);
  if (!n) {
    const s = SPECIES_BY_ID.get(id);
    const all = (['n', 'e', 's'] as View[]).flatMap((d) => [0, 1, 2].flatMap((fr) => [paint(id, d, fr, false, 16), ...(s?.fly ? [paint(id, d, fr, true, 16)] : [])]));
    n = animalLies(id) || all.some((a) => a?.cramped) ? 2 : 1;
    cells.set(id, n);
  }
  return n;
}

/**
 * An animal facing a way: frame 0 standing, 1 and 2 the strides of its walk; or flying, frames 0
 * to 2 of the wingbeat. Null for a species with no art here.
 */
export function paintAnimal(id: string, d: Facing, fr: number, flying = false): Sprite | null {
  if (d === 'w') {
    const e = paintAnimal(id, 'e', fr, flying);
    return e && mirror(e);
  }
  return paint(id, d, fr, flying, animalCells(id) * 16)?.finish(!flying && !animalLies(id)) ?? null;
}
