/**
 * Trees across levels (docs/design/navigation.md, How the local map is drawn): a tree's shape,
 * worked out from its kind and its position, so nothing more about it is stored. On the ground
 * level a tree is its trunk (two tiles across for some old trees) and its roots; on the levels
 * above, its trunk going up, its branches and its leaves, a level (3 m) at a time.
 *
 * Used by the map generator (old trees' wide trunks, local/chunk.ts) and the game (drawing the
 * levels, telling a tree's size).
 */

/** The kinds of tree, by their object tile, and what their shapes are like. */
export interface TreeKind {
  /** The object tile ("tree_broadleaf"). */
  object: string;
  /** The kind's short name, used in frame names ("trunk_broadleaf"). */
  name: string;
  /** Height when grown (m): least and most. */
  heightM: [number, number];
  /** The widest crown's reach from the trunk (tiles): least and most. */
  crown: [number, number];
  /** Where the crown begins, as a share of the height. */
  crownFrom: number;
  /** The crown's shape: round, a cone narrowing upward, or a tuft at the top (palms). */
  shape: 'round' | 'cone' | 'tuft' | 'bare';
  /** Whether its oldest trees have trunks two tiles across. */
  wide: boolean;
  /** Placeholder colours: bark and leaves. */
  bark: string;
  leaves: string;
  /** What the art should show (for TILESET.md). */
  art: string;
}

export const TREE_KINDS: readonly TreeKind[] = [
  { object: 'tree_broadleaf', name: 'broadleaf', heightM: [14, 26], crown: [2, 4], crownFrom: 0.35, shape: 'round', wide: true, bark: '#6a4c30', leaves: '#3f7a32', art: 'Oak, beech or ash: grey-brown bark, broad leaves.' },
  { object: 'tree_conifer', name: 'conifer', heightM: [15, 30], crown: [2, 3], crownFrom: 0.15, shape: 'cone', wide: false, bark: '#5a4028', leaves: '#2f6a3a', art: 'Spruce or pine: red-brown bark, dark needles.' },
  { object: 'tree_birch', name: 'birch', heightM: [10, 18], crown: [1, 2], crownFrom: 0.4, shape: 'round', wide: false, bark: '#d8d4c8', leaves: '#7fa050', art: 'White bark with dark marks, small light leaves.' },
  { object: 'tree_palm', name: 'palm', heightM: [8, 15], crown: [2, 3], crownFrom: 0.9, shape: 'tuft', wide: false, bark: '#8a7050', leaves: '#5a8a3a', art: 'A ringed trunk, fronds at the top.' },
  { object: 'tree_jungle', name: 'jungle', heightM: [24, 40], crown: [3, 5], crownFrom: 0.6, shape: 'round', wide: true, bark: '#5a4a34', leaves: '#2c6a2a', art: 'Huge buttressed trunk with vines, a broad high crown.' },
  { object: 'tree_mangrove', name: 'mangrove', heightM: [6, 10], crown: [2, 2], crownFrom: 0.3, shape: 'round', wide: false, bark: '#5a4a3a', leaves: '#3c6c3c', art: 'Stilt roots, a low dense crown.' },
  { object: 'tree_dead', name: 'dead', heightM: [8, 15], crown: [1, 2], crownFrom: 0.4, shape: 'bare', wide: false, bark: '#7a6a55', leaves: '#7a6a55', art: 'Bare grey branches, no leaves.' },
];

const BY_OBJECT = new Map(TREE_KINDS.map((k) => [k.object, k]));

/** The tree kind of an object tile, if it is a tree. */
export function treeKind(objectName: string): TreeKind | undefined {
  return BY_OBJECT.get(objectName);
}

/** The object tile for the rest of a wide trunk (local/tiles.ts). */
export const TRUNK_PART = 'tree_trunk';

/** One of a tree's parts on one tile of one level. */
export type TreePart = 'trunk' | 'branch' | 'leaves';

export interface TreeShape {
  kind: TreeKind;
  /** 0 a sapling to 1 the oldest. */
  age: number;
  /** In words: young, grown, old. */
  ageWord: 'young' | 'grown' | 'old';
  heightM: number;
  /** Levels above the ground the tree reaches (its top is on the last). */
  levels: number;
  /** Whether it would have a trunk two tiles across (if there is room: the map says). */
  wide: boolean;
  /** Its crown's reach (tiles) on each level above the ground (0: none). */
  reach: number[];
  /** Whether it has roots showing about its foot. */
  roots: boolean;
}

/** A hash of a position and a salt, in [0, 1). */
function rnd(x: number, y: number, salt: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(salt + 7, 0x1b873593);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The shape of the tree of this kind standing at (tx, ty). */
export function treeShape(kind: TreeKind, tx: number, ty: number): TreeShape {
  const age = rnd(tx, ty, 1);
  const grow = age < 0.25 ? 0.45 + age * 1.6 : age > 0.85 ? 1.1 : 0.85 + (age - 0.25) * 0.25;
  const heightM = Math.round((kind.heightM[0] + (kind.heightM[1] - kind.heightM[0]) * rnd(tx, ty, 2)) * grow);
  const levels = Math.max(2, Math.round(heightM / 3));
  const R = (kind.crown[0] + (kind.crown[1] - kind.crown[0]) * rnd(tx, ty, 3)) * Math.min(1.2, grow);
  const from = Math.max(1, Math.round(levels * kind.crownFrom));
  const reach: number[] = [0];
  for (let k = 1; k <= levels; k++) {
    let r = 0;
    if (k >= from) {
      const t = levels === from ? 1 : (k - from) / (levels - from);
      if (kind.shape === 'cone') r = R * (1 - t) + 0.6;
      else if (kind.shape === 'tuft') r = k === levels ? R : 1;
      else {
        // An ellipse through the crown's levels, widest a little below the middle.
        const c = 2 * (t - 0.42);
        r = R * Math.sqrt(Math.max(0.12, 1 - c * c));
      }
    }
    reach.push(Math.round(r * 10) / 10);
  }
  return {
    kind, age, heightM, levels, reach,
    ageWord: age < 0.25 ? 'young' : age > 0.85 ? 'old' : 'grown',
    wide: kind.wide && age > 0.85 && rnd(tx, ty, 4) < 0.7,
    roots: age >= 0.25,
  };
}

/**
 * The tree's part on a tile at `level` levels above its ground (1 and up), the trunk being at
 * (0, 0) (its north-west tile if it is wide) and the tile at (dx, dy) from it, or null.
 * The trunk rises to the level below the top; the top and the crown are leaves, with branches
 * running out from the trunk along a few directions.
 */
export function treePartAt(s: TreeShape, tx: number, ty: number, wide: boolean, level: number, dx: number, dy: number): TreePart | null {
  if (level < 1 || level > s.levels) return null;
  const onTrunk = wide ? (dx === 0 || dx === 1) && (dy === 0 || dy === 1) : dx === 0 && dy === 0;
  if (onTrunk) return level < s.levels ? 'trunk' : 'leaves';
  const r = s.reach[level];
  if (!r) return null;
  // Distance from the trunk (its middle, if wide).
  const cx = wide ? dx - 0.5 : dx, cy = wide ? dy - 0.5 : dy;
  const d = Math.sqrt(cx * cx + cy * cy);
  // A ragged edge: each tile's own share of the reach.
  const edge = r + (rnd(tx + dx, ty + dy, 10 + level) - 0.5) * 0.9;
  if (d > edge) return null;
  // Branches: along two to four of the eight directions, a direction per level.
  if (d <= r - 0.5 && s.kind.shape !== 'tuft') {
    const dirs = 2 + Math.floor(rnd(tx, ty, 20 + level) * 3);
    const turn = Math.floor(rnd(tx, ty, 30 + level) * 8);
    // The tile's direction from the trunk, one of eight (east 0, then clockwise as the map runs south).
    const ax = Math.abs(cx), ay = Math.abs(cy);
    const a = ay <= ax * 0.4142 ? (cx > 0 ? 0 : 4) : ax <= ay * 0.4142 ? (cy > 0 ? 2 : 6) : cx > 0 ? (cy > 0 ? 1 : 7) : cy > 0 ? 3 : 5;
    for (let i = 0; i < dirs; i++) {
      if (a === (turn + Math.round((i * 8) / dirs)) % 8) {
        // On the line of the branch itself.
        const ux = [1, 1, 0, -1, -1, -1, 0, 1][a], uy = [0, 1, 1, 1, 0, -1, -1, -1][a];
        if (Math.abs(cx * uy - cy * ux) <= 0.71) return 'branch';
      }
    }
  }
  return s.kind.shape === 'bare' ? null : 'leaves';
}

/**
 * Old trees of the wide kinds take a trunk two tiles across, where there is room: the tree's tile
 * becomes the north-west of the four, and the other three `TRUNK_PART`. `free(k)` says whether a
 * tile of the chunk may be taken (open ground, nothing on it but small plants). Only within the
 * chunk, so that chunks never depend on one another.
 */
export function widenTrunks(object: Uint8Array, size: number, tx0: number, ty0: number, idOf: (name: string) => number, nameOf: (id: number) => string, free: (k: number) => boolean): void {
  const part = idOf(TRUNK_PART);
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const k = y * size + x;
    const kind = treeKind(nameOf(object[k]));
    if (!kind?.wide || !treeShape(kind, tx0 + x, ty0 + y).wide) continue;
    const others = [k + 1, k + size, k + size + 1];
    if (!others.every(free)) continue;
    for (const o of others) object[o] = part;
  }
}
