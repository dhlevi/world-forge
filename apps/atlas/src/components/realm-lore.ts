import { world } from '../store';
import { worldLore } from '@worldforge/core/lore/current';

/** The current world's lore (made on first use, kept until the world changes). */
export function currentLore() {
  const w = world.value;
  return w ? worldLore(w) : null;
}
