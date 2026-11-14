/**
 * Trees across levels, as the game draws and tells them (core local/trees.ts gives the shapes).
 * For an area of the map: on the ground, which tiles are trunks (and which quarter of a wide
 * trunk), where roots show and which ground lies in the shade of leaves; on a level above the
 * ground, which tiles hold a tree's trunk, branches or leaves.
 *
 * A tree's parts are worked out once and kept (they depend only on the tree and its place).
 */
import { OBJECT_TILES, objectId } from '@worldforge/core/local/tiles';
import { TREE_KINDS, TRUNK_PART, treeKind, treePartAt, treeShape, type TreePart, type TreeShape } from '@worldforge/core/local/trees';
import type { GameMap } from './map';

/** A tree on the map: where its trunk is, its shape, and whether the map gives it a wide trunk. */
export interface Tree {
  x: number;
  y: number;
  kind: number;
  shape: TreeShape;
  wide: boolean;
}

/** One part of a tree above the ground: the tile from the trunk, the level above the ground, and what it is. */
interface Part {
  dx: number;
  dy: number;
  level: number;
  part: TreePart;
}

const TRUNK_ID = objectId(TRUNK_PART)!;
const KIND_OF = Int8Array.from(OBJECT_TILES, (d) => {
  const k = treeKind(d.name);
  return k ? TREE_KINDS.indexOf(k) : -1;
});
const PART_CODE: Record<TreePart, number> = { leaves: 1, branch: 2, trunk: 3 };
export const PART_NAMES = ['', 'leaves', 'branch', 'trunk'] as const;

/** Whether an object tile is a tree, and of which kind (its index in TREE_KINDS), else -1. */
export function treeKindOf(objectId: number): number {
  return KIND_OF[objectId] ?? -1;
}

/** The tree standing on a tile (its trunk's tile, or a part of a wide trunk), if any. */
export function treeAt(map: GameMap, x: number, y: number): Tree | null {
  let id = map.object(x, y);
  if (id === TRUNK_ID) {
    // The rest of a wide trunk: its tree is to the west, the north or the north-west.
    for (const [dx, dy] of [[-1, 0], [0, -1], [-1, -1]]) {
      if (treeKindOf(map.object(x + dx, y + dy)) >= 0) {
        x += dx;
        y += dy;
        id = map.object(x, y);
        break;
      }
    }
  }
  const kind = treeKindOf(id);
  if (kind < 0) return null;
  const wide = map.object(x + 1, y) === TRUNK_ID && map.object(x, y + 1) === TRUNK_ID && map.object(x + 1, y + 1) === TRUNK_ID;
  return { x, y, kind, shape: treeShape(TREE_KINDS[kind], x, y), wide };
}

const partsCache = new Map<string, Part[]>();

/** A tree's parts above the ground (worked out once). */
function partsOf(t: Tree): Part[] {
  const key = `${t.x},${t.y},${t.kind},${t.wide ? 1 : 0}`;
  let out = partsCache.get(key);
  if (out) return out;
  out = [];
  const R = Math.ceil(Math.max(...t.shape.reach)) + 1;
  for (let level = 1; level <= t.shape.levels; level++) {
    for (let dy = -R; dy <= R + 1; dy++) for (let dx = -R; dx <= R + 1; dx++) {
      const part = treePartAt(t.shape, t.x, t.y, t.wide, level, dx, dy);
      if (part) out.push({ dx, dy, level, part });
    }
  }
  if (partsCache.size > 6000) partsCache.clear();
  partsCache.set(key, out);
  return out;
}

/** The trees of a screen of the map, laid out for drawing. */
export class TreeView {
  /** Per screen tile: under leaves (1) or not. */
  readonly shade: Uint8Array;
  /** Per screen tile: the sides roots reach in from (north 1, east 2, south 4, west 8), and the kind. */
  readonly roots: Uint8Array;
  readonly rootKind: Int8Array;
  /** Per screen tile, on the level drawn: the part there (1 leaves, 2 branch, 3 trunk; 0 none) and its kind. */
  readonly part: Uint8Array;
  readonly partKind: Int8Array;
  /** Per screen tile: the trunk's quarter for a wide trunk (north-west 1, north-east 2, south-east 4, south-west 8), 0 if not. */
  readonly quarter: Uint8Array;

  /**
   * The screen is `cols` × `rows` tiles from map tile (x0, y0). `level`, if given, is the level
   * whose tree parts are wanted (a slice); none for the surface.
   */
  constructor(map: GameMap, x0: number, y0: number, readonly cols: number, readonly rows: number, level: number | null) {
    const n = cols * rows;
    this.shade = new Uint8Array(n);
    this.roots = new Uint8Array(n);
    this.rootKind = new Int8Array(n).fill(-1);
    this.part = new Uint8Array(n);
    this.partKind = new Int8Array(n).fill(-1);
    this.quarter = new Uint8Array(n);
    const at = (x: number, y: number) => (x >= x0 && y >= y0 && x < x0 + cols && y < y0 + rows ? (y - y0) * cols + (x - x0) : -1);
    const M = 7;
    for (let y = y0 - M; y < y0 + rows + M; y++) for (let x = x0 - M; x < x0 + cols + M; x++) {
      if (!map.loaded(x, y) || treeKindOf(map.object(x, y)) < 0) continue;
      const t = treeAt(map, x, y);
      if (!t) continue;
      const w = t.wide ? 2 : 1;
      if (t.wide) [[0, 0, 1], [1, 0, 2], [1, 1, 4], [0, 1, 8]].forEach(([dx, dy, q]) => {
        const i = at(x + dx, y + dy);
        if (i >= 0) this.quarter[i] = q;
      });
      // Roots on the tiles beside the trunk, reaching in from its side.
      if (t.shape.roots) {
        for (let k = 0; k < w; k++) {
          for (const [rx, ry, side] of [[x + k, y - 1, 4], [x + w, y + k, 8], [x + k, y + w, 1], [x - 1, y + k, 2]]) {
            const i = at(rx, ry);
            if (i < 0 || map.object(rx, ry)) continue;
            this.roots[i] |= side;
            this.rootKind[i] = t.kind;
          }
        }
      }
      const base = map.level(x, y);
      for (const p of partsOf(t)) {
        const i = at(x + p.dx, y + p.dy);
        if (i < 0) continue;
        if (p.part !== 'trunk') this.shade[i] = 1;
        if (level !== null && base + p.level === level) {
          const c = PART_CODE[p.part];
          if (c > this.part[i]) {
            this.part[i] = c;
            this.partKind[i] = t.kind;
          }
        }
      }
    }
  }

  /** Joins for a branch or leaves tile on the level drawn: the sides with the same (a branch also joins a trunk). */
  mask(i: number): number {
    const c = this.part[i], cols = this.cols;
    const same = (j: number, ok: boolean) => ok && (this.part[j] === c || (c === 2 && this.part[j] === 3)) ? 1 : 0;
    const x = i % cols, y = Math.floor(i / cols);
    return same(i - cols, y > 0) * 1 + same(i + 1, x + 1 < cols) * 2 + same(i + cols, y + 1 < this.rows) * 4 + same(i - 1, x > 0) * 8;
  }
}

/** A tree in words, for looking at it: "an old broadleaf tree, about 24 m tall". */
export function treeWords(t: Tree): string {
  const k = TREE_KINDS[t.kind];
  const what = k.name === 'dead' ? 'dead tree' : k.name === 'jungle' ? 'jungle tree' : k.name === 'broadleaf' ? 'broadleaf tree' : k.name;
  return `${t.shape.ageWord === 'old' ? 'an old' : t.shape.ageWord === 'young' ? 'a young' : 'a'} ${what}, about ${t.shape.heightM} m tall${t.wide ? ', its trunk two paces across' : ''}`;
}
