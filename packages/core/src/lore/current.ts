import type { GeneratedWorld } from '../gen/world';
import { loreFor } from './realm';

/**
 * A generated world as the rest of the code passes it about: the generator's output, with the
 * generation number the app gives each world it makes (absent in a game or a script).
 */
export type WorldData = GeneratedWorld & { gen?: number };

/**
 * The world's lore (its history, faiths, houses, wars and economies), made on first use and kept
 * until another world asks: the atlas, the town context and the game-data export all share it.
 */
export function worldLore(w: Pick<WorldData, 'raster' | 'politics' | 'settlements' | 'labels' | 'gen'>) {
  return loreFor(String(w.gen ?? `seed:${w.raster.seed}`), w.raster.seed, w.politics, w.settlements, w.labels.features);
}
