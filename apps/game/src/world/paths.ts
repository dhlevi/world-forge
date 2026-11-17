/**
 * Paths for the people of the bubble (docs/design/npcs.md, The mind: Plans and actions): A* over
 * the tiles of the map's floors, through doors and gates (opened on the way) and up and down stairs
 * and ladders, by the same rule as the wanderer's (game/game.ts): a way up meets a way down at the
 * same tile on the nearest level above or below.
 *
 * Paths ignore the people standing about (they step aside, or are waited for, as they are met).
 */
import { OBJECT_TILES } from '@worldforge/core/local/tiles';
import { STAIRS_DOWN, STAIRS_UP } from '../game/game';
import type { Spot } from '../worker/protocol';

/** What a path needs of the map (game/map.ts). */
export interface PathMap {
  loaded(x: number, y: number): boolean;
  passableAt(x: number, y: number, z: number | null): boolean;
  objectAt(x: number, y: number, z: number | null): number;
  hasFloor(x: number, y: number, z: number): boolean;
  level(x: number, y: number): number;
}

/** A step of a path: a tile, and how it is reached (through a door, up or down a stair). */
export interface Step extends Spot {
  door?: boolean;
  stairs?: boolean;
}

/** Doors and gates people open as they go (not the locked, the hidden, the portcullis). */
export const OPENABLE = new Set(['door', 'gate']);
/** Stairs and ladders people use (not a cave's passage, a well or a grate). */
const CLIMB = new Set(['stairs_up', 'stairs_down', 'stairs_spiral', 'ladder_up', 'ladder_down']);
/** How far up or down a stair may lead (levels). */
const REACH = 12;

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Whether a tile can be stepped onto by a person on their way (an openable door counts). */
export function walkable(map: PathMap, x: number, y: number, z: number | null): { ok: boolean; door: boolean } {
  if (map.passableAt(x, y, z)) return { ok: true, door: false };
  const o = OBJECT_TILES[map.objectAt(x, y, z)];
  if (o && OPENABLE.has(o.name) && (z === null || map.hasFloor(x, y, z))) return { ok: true, door: true };
  return { ok: false, door: false };
}

/** The floor a stair here leads to, up or down (undefined: none, or it leads nowhere yet). */
export function stairTo(map: PathMap, x: number, y: number, z: number | null, up: boolean): number | null | undefined {
  const o = OBJECT_TILES[map.objectAt(x, y, z)];
  if (!o || !CLIMB.has(o.name) || !(up ? STAIRS_UP : STAIRS_DOWN).has(o.name)) return undefined;
  const back = up ? STAIRS_DOWN : STAIRS_UP;
  const level = z ?? map.level(x, y);
  for (let n = 1; n <= REACH; n++) {
    const t = level + (up ? n : -n);
    const to = map.hasFloor(x, y, t) ? t : map.level(x, y) === t ? null : undefined;
    if (to === undefined) continue;
    const b = OBJECT_TILES[map.objectAt(x, y, to)];
    if (b && back.has(b.name)) return to;
  }
  return undefined;
}

const key = (x: number, y: number, z: number | null) => `${x},${y},${z ?? 'g'}`;

/**
 * The cheapest way from one tile to another (null if none within `limit` tiles looked at): a
 * step 1, a diagonal 1.4 (not between two things that block), a door 1.5 more, a stair 2.5.
 */
export function findPath(map: PathMap, from: Spot, to: Spot, limit = 6000): Step[] | null {
  if (from.x === to.x && from.y === to.y && from.z === to.z) return [];
  const goal = key(to.x, to.y, to.z);
  const h = (x: number, y: number, z: number | null) => {
    const dx = Math.abs(x - to.x), dy = Math.abs(y - to.y);
    return Math.max(dx, dy) + 0.4 * Math.min(dx, dy) + (z === to.z ? 0 : 3);
  };
  interface Node { x: number; y: number; z: number | null; g: number; f: number; parent: Node | null; door: boolean; stairs: boolean }
  const open = new Heap<Node>((a, b) => a.f - b.f);
  const best = new Map<string, number>();
  const start: Node = { x: from.x, y: from.y, z: from.z, g: 0, f: h(from.x, from.y, from.z), parent: null, door: false, stairs: false };
  open.push(start);
  best.set(key(from.x, from.y, from.z), 0);
  let looked = 0;
  while (open.size) {
    const n = open.pop()!;
    const k = key(n.x, n.y, n.z);
    if (k === goal) {
      const out: Step[] = [];
      for (let p: Node | null = n; p && p !== start; p = p.parent) out.push({ x: p.x, y: p.y, z: p.z, ...(p.door ? { door: true } : {}), ...(p.stairs ? { stairs: true } : {}) });
      return out.reverse();
    }
    if ((best.get(k) ?? Infinity) < n.g) continue;
    if (++looked > limit) return null;
    const visit = (x: number, y: number, z: number | null, cost: number, door: boolean, stairs: boolean) => {
      const kk = key(x, y, z), g = n.g + cost;
      if ((best.get(kk) ?? Infinity) <= g) return;
      best.set(kk, g);
      open.push({ x, y, z, g, f: g + h(x, y, z), parent: n, door, stairs });
    };
    for (const [dx, dy] of DIRS) {
      const x = n.x + dx, y = n.y + dy;
      if (!map.loaded(x, y)) continue;
      const wk = walkable(map, x, y, n.z);
      if (!wk.ok) continue;
      if (dx && dy) {
        // No slipping between two things that block, nor through a door on the slant.
        if (wk.door || !map.passableAt(n.x + dx, n.y, n.z) || !map.passableAt(n.x, n.y + dy, n.z)) continue;
      }
      visit(x, y, n.z, (dx && dy ? 1.4 : 1) + (wk.door ? 1.5 : 0), wk.door, false);
    }
    for (const up of [true, false]) {
      const z = stairTo(map, n.x, n.y, n.z, up);
      if (z !== undefined) visit(n.x, n.y, z, 2.5, false, true);
    }
  }
  return null;
}

/** A binary heap (least first). */
class Heap<T> {
  private a: T[] = [];
  constructor(private less: (x: T, y: T) => number) {}
  get size(): number {
    return this.a.length;
  }
  push(v: T): void {
    const a = this.a;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): T | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0], last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.less(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}
