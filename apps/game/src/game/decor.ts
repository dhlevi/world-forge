/**
 * Decorations (the registry's DECOR, core local/tiles.ts): tufts of grass, pebbles, fallen leaves
 * and the like, scattered over open ground. They are drawn only: where one lies is worked out from
 * the position, so nothing is stored, and they block nothing.
 */
import { DECOR, GROUND_TILES, type DecorDef, type Season } from '@worldforge/core/local/tiles';
import { hash2 } from '../util';

/** The decorations that can lie on each ground tile, by its id. */
const BY_GROUND: readonly DecorDef[][] = GROUND_TILES.map((g) => DECOR.filter((d) => d.on.includes(g.name)));

/**
 * The decoration lying on a tile of this ground, if any. A tile keeps its place in the scatter
 * through the year: in a season a decoration does not show, its tiles are simply bare.
 */
export function decorAt(ground: number, x: number, y: number, season: Season): DecorDef | null {
  const list = BY_GROUND[ground];
  if (!list?.length) return null;
  let u = (hash2(x, y, 0x5eed) % 100_000) / 100_000;
  for (const d of list) {
    if (u < d.chance) return d.seasons && !d.seasons.includes(season) ? null : d;
    u -= d.chance;
  }
  return null;
}
