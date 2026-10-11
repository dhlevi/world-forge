import { world } from '../store';
import { loreFor } from '../lore/realm';

/** The current world's lore (made on first use, kept until the world changes). */
export function currentLore() {
  const w = world.value;
  return w ? loreFor(String(w.gen), w.raster.seed, w.politics, w.settlements) : null;
}
