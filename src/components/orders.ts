import { world } from '../store';
import { worldOrders, type Order } from '../lore/orders';
import { currentLore } from './realm-lore';

/** The current world's organisations (made on first use, kept until the world changes). */
export function currentOrders(): Order[] {
  const w = world.value;
  const c = currentLore();
  if (!w || !c) return [];
  return worldOrders(c, { seed: w.raster.seed, features: w.labels.features, curses: w.raster.curses, underworld: w.raster.underworld });
}
