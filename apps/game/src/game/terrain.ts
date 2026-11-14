/**
 * Soft edges between kinds of ground (the registry's TERRAINS, core local/tiles.ts). Edges are
 * drawn on a second grid, offset by half a tile, whose cells sit on the corners where four tiles
 * meet (a "dual grid"): for each terrain in a cell above the lowest there, one edge frame, chosen
 * by which of the four tiles are of it or a terrain after it.
 *
 * Corners are numbered as in TILESET.md: north-west 1, north-east 2, south-east 4, south-west 8.
 */
import { GROUND_TILES, TERRAINS } from '@worldforge/core/local/tiles';

/** Each ground tile's terrain (its index in TERRAINS), by id; -1 for none (paving, floors). */
export const TERRAIN_OF: Int8Array = (() => {
  const by = new Map<string, number>();
  TERRAINS.forEach((t, i) => t.tiles.forEach((n) => by.set(n, i)));
  return Int8Array.from(GROUND_TILES, (d) => by.get(d.name) ?? -1);
})();

/** One edge to draw in a cell: the terrain, its frame (1 to 14), and which of the four tiles it comes from. */
export interface Blend {
  terrain: number;
  mask: number;
  /** The corner (0 north-west, 1 north-east, 2 south-east, 3 south-west) whose tile is of that terrain. */
  from: number;
}

/**
 * The edges in one cell, from the terrains of its four tiles (north-west, north-east, south-east,
 * south-west; -1 for none) and their levels: none where a tile has no terrain, or where the four
 * are not all on one level (a change of level has its own line, game/renderer.ts). Lowest first.
 */
export function blendsAt(terrains: readonly number[], levels: readonly number[]): Blend[] {
  if (terrains.some((t) => t < 0) || levels.some((l) => l !== levels[0])) return [];
  const lo = Math.min(...terrains);
  const out: Blend[] = [];
  for (const t of [...new Set(terrains)].sort((a, b) => a - b)) {
    if (t === lo) continue;
    let mask = 0;
    terrains.forEach((u, i) => {
      if (u >= t) mask |= 1 << i;
    });
    out.push({ terrain: t, mask, from: terrains.indexOf(t) });
  }
  return out;
}

/**
 * Whether a pixel (x, y, 0 to 15) of an edge frame belongs to the terrain, for frames made from a
 * tile's own art: the corners' share of it, blended across the cell, with a ragged line where it
 * meets the other ground that is straight at the cell's sides (so neighbouring cells meet).
 * Returns how far inside it the pixel is (more than 0: inside; small: on the rim).
 */
export function edgeInside(mask: number, x: number, y: number, variant: number): number {
  const u = (x + 0.5) / 16, v = (y + 0.5) / 16;
  const c = (bit: number) => ((mask >> bit) & 1);
  const f = c(0) * (1 - u) * (1 - v) + c(1) * u * (1 - v) + c(2) * u * v + c(3) * (1 - u) * v;
  // Ragged where the edge runs, fading to nothing at the cell's sides.
  const fade = Math.sqrt(16 * u * (1 - u) * v * (1 - v));
  return f - 0.5 + 0.7 * fade * (noise(x, y, variant) - 0.5);
}

/** Smooth value noise over a pixel grid (cells of 4 pixels), for ragged edges. */
function noise(x: number, y: number, salt: number): number {
  const h = (i: number, j: number) => {
    let n = Math.imul(i + 31 * salt, 0x27d4eb2d) ^ Math.imul(j - 17 * salt, 0x165667b1);
    n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
    return ((n ^ (n >>> 12)) >>> 0) / 4294967296;
  };
  const fx = x / 4, fy = y / 4, i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j;
  const s = (t: number) => t * t * (3 - 2 * t);
  const top = h(i, j) * (1 - s(a)) + h(i + 1, j) * s(a), bot = h(i, j + 1) * (1 - s(a)) + h(i + 1, j + 1) * s(a);
  return 0.75 * (top * (1 - s(b)) + bot * s(b)) + 0.25 * h(x * 7 + 3, y * 5 + 1);
}
