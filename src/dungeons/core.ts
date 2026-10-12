import type { Rng } from '../gen/rng';
import type { KeyNote } from '../keys/flavour';

/**
 * Dungeons in the manner of Watabou's One Page Dungeon: a grid of 5 ft squares carved into rooms
 * and corridors, with doors, props, numbered rooms and a written key, on one or more levels
 * joined by stairs, ladders and shafts. Each kind (mine, tower, crypt, ruin, catacomb, sewer)
 * has its own generator (kinds.ts) on this shared core.
 */
export type DungeonKind = 'mine' | 'tower' | 'crypt' | 'ruin' | 'catacomb' | 'sewer';
export const DUNGEON_KINDS: DungeonKind[] = ['mine', 'tower', 'crypt', 'ruin', 'catacomb', 'sewer'];
export const KIND_NAME: Record<DungeonKind, string> = {
  mine: 'Mine', tower: 'Tower', crypt: 'Crypt', ruin: 'Ruin', catacomb: 'Catacombs', sewer: 'Sewers',
};

export interface DungeonSite {
  id: string;
  kind: DungeonKind;
  name: string;
  /** The name in English. */
  en?: string;
  seed: number;
  tags: string[];
  lon: number;
  lat: number;
  /** Index into CULTURES. */
  culture: number;
  /** The town it lies under or beside, if any. */
  town?: string;
  /** Sewers: street centre lines around the grate (local metres, x east, y north, grate at 0,0). */
  streets?: number[][][];
  /** Sewers: where the nearest river or shore lies (local metres), for the outfall. */
  outfall?: number[];
}

/** Battlemap squares (5 ft). */
export const CELL_M = 1.5;

/** Cell types. */
export const VOID = 0, FLOOR = 1, WATER = 2, RUBBLE = 3, GROUND = 4, PIT = 5, CHANNEL = 6;

export interface DRoom {
  /** Key number (1-based), or 0 for an unnumbered space (a corridor junction). */
  n: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where its number is lettered (cells). */
  lx: number;
  ly: number;
  /** Room type (key heading) and description, filled in by key.ts. */
  name: string;
  text: string;
  /** What the generator put there, for the key: "sarcophagus", "ore", "cistern". */
  tags: string[];
  /** Creature, trap and treasure notes (key.ts). */
  notes: KeyNote[];
}

export type DoorKind = 'arch' | 'door' | 'locked' | 'secret' | 'portcullis' | 'bars';
export interface DDoor {
  /** The door lies on the edge between cell (x, y) and the cell to its west (vertical) or north (horizontal). */
  x: number;
  y: number;
  vertical: boolean;
  kind: DoorKind;
}

export type PropKind =
  | 'sarcophagus' | 'pillar' | 'niche' | 'altar' | 'statue' | 'chest' | 'barrel' | 'crate' | 'bones' | 'bed' | 'table'
  | 'well' | 'grate' | 'tree' | 'bush' | 'brazier' | 'throne' | 'bookcase' | 'cart' | 'support' | 'ore' | 'rubble' | 'urn' | 'skull';
export interface DProp {
  kind: PropKind;
  /** Centre (cells). */
  x: number;
  y: number;
  /** Rotation (radians) and size (cells) where it matters. */
  a?: number;
  w?: number;
  h?: number;
}

export type LinkStyle = 'stairs' | 'ladder' | 'shaft' | 'spiral';
export interface DLink {
  x: number;
  y: number;
  dir: 'up' | 'down';
  to: number;
  style: LinkStyle;
}

export interface DLevel {
  name: string;
  W: number;
  H: number;
  t: Uint8Array;
  rooms: DRoom[];
  doors: DDoor[];
  props: DProp[];
  links: DLink[];
  /** Ways in from outside: a cell on the edge and the inward direction. */
  entrances: { x: number; y: number; dir: number }[];
  /** Outdoors (ruins, roofs): the ground around is drawn as land, not rock. */
  outdoor: boolean;
  /** Round towers: the outer wall is this circle (cells), not the cell edges. */
  round?: { cx: number; cy: number; r: number };
  /** Extra wall lines (cells): tower partitions, broken walls. */
  walls: [number, number, number, number][];
  /** Mine rails and sewer channels: centre lines (cells). */
  rails: number[][][];
}

export interface Dungeon {
  site: DungeonSite;
  title: string;
  hook: string;
  levels: DLevel[];
}

// ---- Grid helpers ------------------------------------------------------------------------------

export function newLevel(name: string, W: number, H: number, outdoor = false): DLevel {
  return { name, W, H, t: new Uint8Array(W * H), rooms: [], doors: [], props: [], links: [], entrances: [], outdoor, walls: [], rails: [] };
}

export const at = (L: DLevel, x: number, y: number) => (x < 0 || y < 0 || x >= L.W || y >= L.H ? VOID : L.t[y * L.W + x]);
export const set = (L: DLevel, x: number, y: number, v: number) => {
  if (x >= 0 && y >= 0 && x < L.W && y < L.H) L.t[y * L.W + x] = v;
};
export const open = (v: number) => v !== VOID && v !== PIT;

export function carveRect(L: DLevel, x: number, y: number, w: number, h: number, v = FLOOR): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(L, i, j, v);
}

export function carveCircle(L: DLevel, cx: number, cy: number, r: number, v = FLOOR): void {
  for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++) {
    for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) if (Math.hypot(i + 0.5 - cx, j + 0.5 - cy) <= r) set(L, i, j, v);
  }
}

/** An L-shaped corridor (width w) between two cells, horizontal leg first or not. */
export function carveCorridor(L: DLevel, x0: number, y0: number, x1: number, y1: number, hFirst: boolean, w = 1, v = FLOOR): [number, number][] {
  const path: [number, number][] = [];
  const step = (x: number, y: number) => {
    path.push([x, y]);
    for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) if (at(L, x + a, y + b) === VOID) set(L, x + a, y + b, v);
  };
  let x = x0, y = y0;
  const hor = () => {
    while (x !== x1) {
      step(x, y);
      x += Math.sign(x1 - x);
    }
  };
  const ver = () => {
    while (y !== y1) {
      step(x, y);
      y += Math.sign(y1 - y);
    }
  };
  if (hFirst) {
    hor();
    ver();
  } else {
    ver();
    hor();
  }
  step(x, y);
  return path;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const overlaps = (a: Rect, b: Rect, m = 1) => a.x - m < b.x + b.w && b.x - m < a.x + a.w && a.y - m < b.y + b.h && b.y - m < a.y + a.h;
export const centre = (r: Rect): [number, number] => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];

/** Rooms scattered without overlapping (keeping `margin` cells of rock between them). */
export function scatterRooms(W: number, H: number, n: number, rnd: Rng, size: [number, number], margin = 2, border = 2): Rect[] {
  const out: Rect[] = [];
  for (let t = 0; t < n * 60 && out.length < n; t++) {
    const w = size[0] + Math.floor(rnd() * (size[1] - size[0] + 1)), h = size[0] + Math.floor(rnd() * (size[1] - size[0] + 1));
    const r = { x: border + Math.floor(rnd() * (W - w - 2 * border)), y: border + Math.floor(rnd() * (H - h - 2 * border)), w, h };
    if (r.x < border || r.y < border) continue;
    if (out.every((o) => !overlaps(o, r, margin))) out.push(r);
  }
  return out;
}

/** Minimum spanning tree over points, plus some extra edges for loops. */
export function connectAll(pts: [number, number][], rnd: Rng, extra = 0.2): [number, number][] {
  const edges: [number, number][] = [];
  if (pts.length < 2) return edges;
  const inTree = new Set([0]);
  while (inTree.size < pts.length) {
    let best: [number, number] | null = null, bd = Infinity;
    for (const a of inTree) {
      for (let b = 0; b < pts.length; b++) {
        if (inTree.has(b)) continue;
        const d = Math.abs(pts[a][0] - pts[b][0]) + Math.abs(pts[a][1] - pts[b][1]);
        if (d < bd) {
          bd = d;
          best = [a, b];
        }
      }
    }
    if (!best) break;
    edges.push(best);
    inTree.add(best[1]);
  }
  for (let a = 0; a < pts.length; a++) {
    if (rnd() > extra) continue;
    const order = pts.map((_, b) => b).filter((b) => b !== a && !edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a)))
      .sort((p, q) => Math.abs(pts[p][0] - pts[a][0]) + Math.abs(pts[p][1] - pts[a][1]) - (Math.abs(pts[q][0] - pts[a][0]) + Math.abs(pts[q][1] - pts[a][1])));
    if (order[0] !== undefined) edges.push([a, order[0]]);
  }
  return edges;
}

/**
 * Doors where corridors meet rooms: for each room, every opening in its outline (a floor cell
 * just outside the room next to a floor cell inside) gets a door of a kind drawn from `pick`.
 */
export function doorsForRooms(L: DLevel, rooms: Rect[], rnd: Rng, pick: () => DoorKind): void {
  const seen = new Set<string>();
  for (const r of rooms) {
    const add = (x: number, y: number, vertical: boolean) => {
      const k = `${x},${y},${vertical}`;
      if (seen.has(k)) return;
      seen.add(k);
      L.doors.push({ x, y, vertical, kind: pick() });
    };
    for (let i = r.x; i < r.x + r.w; i++) {
      if (open(at(L, i, r.y - 1)) && open(at(L, i, r.y)) && !open(at(L, i - 1, r.y - 1)) && !open(at(L, i + 1, r.y - 1))) add(i, r.y, false);
      if (open(at(L, i, r.y + r.h)) && open(at(L, i, r.y + r.h - 1)) && !open(at(L, i - 1, r.y + r.h)) && !open(at(L, i + 1, r.y + r.h))) add(i, r.y + r.h, false);
    }
    for (let j = r.y; j < r.y + r.h; j++) {
      if (open(at(L, r.x - 1, j)) && open(at(L, r.x, j)) && !open(at(L, r.x - 1, j - 1)) && !open(at(L, r.x - 1, j + 1))) add(r.x, j, true);
      if (open(at(L, r.x + r.w, j)) && open(at(L, r.x + r.w - 1, j)) && !open(at(L, r.x + r.w, j - 1)) && !open(at(L, r.x + r.w, j + 1))) add(r.x + r.w, j, true);
    }
  }
  void rnd;
}

export function roomOf(r: Rect, n: number, tags: string[] = []): DRoom {
  return { n, x: r.x, y: r.y, w: r.w, h: r.h, lx: r.x + r.w / 2, ly: r.y + r.h / 2, name: '', text: '', tags, notes: [] };
}

/** Cells reachable from (x, y) through open cells. */
export function reach(L: DLevel, x: number, y: number): Uint8Array {
  const seen = new Uint8Array(L.W * L.H);
  const q = [y * L.W + x];
  seen[q[0]] = 1;
  for (let k = 0; k < q.length; k++) {
    const c = q[k], i = c % L.W, j = (c / L.W) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= L.W || b >= L.H) continue;
      const n = b * L.W + a;
      if (!seen[n] && open(L.t[n])) {
        seen[n] = 1;
        q.push(n);
      }
    }
  }
  return seen;
}

export const pickW = <T>(rnd: Rng, items: [T, number][]): T => {
  let t = rnd() * items.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of items) if ((t -= w) < 0) return v;
  return items[items.length - 1][0];
};
export const pick = <T>(rnd: Rng, a: T[]): T => a[Math.floor(rnd() * a.length)];

/** Street lines packed as "x,y x,y|x,y x,y" (local metres, rounded), for a plan feature property. */
export function packLines(lines: number[][][]): string {
  return lines.map((l) => l.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(' ')).join('|');
}

/**
 * What lies under a town (decided from the town alone, so search can list it before the plan is
 * drawn): sewers under cities and towns of 4,000 or more, catacombs under every city and about
 * half the towns. The plan then places the entrances (a grate on a main street; a stair in the
 * graveyard, by the temple, or in the market).
 */
export function townUnderground(
  s: { id: string; tier: string; population: number; seed: number; name?: string; kind?: string },
  /** Names from an English pattern ({0} the town), in the local language and in English. */
  named: (tpl: string) => { name: string; en: string } = (tpl) => ({ name: tpl.replace('{0}', s.name ?? ''), en: tpl.replace('{0}', s.name ?? '') }),
): { dkind: 'sewer' | 'catacomb'; did: string; name: string; en: string; tags: string[] }[] {
  if ((s.tier !== 'city' && s.tier !== 'town') || s.kind === 'tribal') return [];
  const out: { dkind: 'sewer' | 'catacomb'; did: string; name: string; en: string; tags: string[] }[] = [];
  const u = (k: number) => hash(s.seed ^ k) / 4294967296;
  const size = s.tier === 'city' ? 'large' : 'medium';
  if (s.tier === 'city' || s.population >= 4000) {
    const levels = s.tier === 'city' && u(0x5e1) < 0.6 ? 2 : 1;
    out.push({ dkind: 'sewer', did: `${s.id}/sewer`, ...named('the Sewers of {0}'), tags: [size, ...(levels > 1 ? ['2 levels'] : [])] });
  }
  if (s.tier === 'city' || u(0xca7a) < 0.55) {
    const r = u(0xca7b);
    const levels = s.tier === 'city' ? (r < 0.4 ? 2 : r < 0.8 ? 3 : 1) : r < 0.6 ? 1 : 2;
    const nm = named(u(0xca7c) < 0.6 ? 'the Catacombs of {0}' : 'the Undercroft of {0}');
    out.push({ dkind: 'catacomb', did: `${s.id}/catacomb`, ...nm, tags: [size, ...(levels > 1 ? [`${levels} levels`] : [])] });
  }
  return out;
}

/** Integer hash (as gen/rng hash32, repeated here to keep this module free of imports with side effects). */
function hash(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}
