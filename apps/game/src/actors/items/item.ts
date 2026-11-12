/**
 * Items as things in the world: one of a kind of item (actors/items/defs.ts), or a stack of
 * them, with its quality, who made it, its condition, the uses left, and where it is.
 */
import { itemDef, QUALITY_VALUE, sizeRank, type ItemDef, type Quality, type Size } from './defs';

/**
 * Where a carried item is: worn, held, on the back, hanging from the belt, or inside another
 * item (a container). Items on the ground are kept by the game, by tile (game/ground.ts).
 */
export type Loc =
  | { at: 'worn' }
  | { at: 'hand'; hand: 'left' | 'right' | 'both' }
  | { at: 'back' }
  | { at: 'belt' }
  | { at: 'in'; parent: string }
  /** Strapped to the outside of a pack (a shield, a bow, a staff, a bedroll). */
  | { at: 'strap'; parent: string };

/** Inside or strapped to another item (not lying or carried on its own). */
export const isInside = (l?: Loc): boolean => l?.at === 'in' || l?.at === 'strap';

export interface Item {
  /** Unique within a game. */
  uid: string;
  def: string;
  qty: number;
  quality: Quality;
  /** The people who made it ("Varskish"), if known. */
  make?: string;
  /** 0 (ruined) to 100 (new), for things that wear. */
  condition: number;
  /** Uses or portions left, for things that have them. */
  uses?: number;
  /** A name of its own ("patron's letter"). */
  name?: string;
  loc?: Loc;
}

let counter = 0;
const newUid = () => `i${Date.now().toString(36)}${(counter++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export function makeItem(id: string, o: { qty?: number; quality?: Quality; make?: string; condition?: number; name?: string } = {}): Item {
  const d = itemDef(id);
  return {
    uid: newUid(), def: id, qty: Math.max(1, Math.min(d.stack ?? 1, o.qty ?? 1)), quality: o.quality ?? 'common',
    condition: d.durable === false ? 100 : o.condition ?? 100,
    ...(d.uses ? { uses: d.uses } : {}), ...(o.make ? { make: o.make } : {}), ...(o.name ? { name: o.name } : {}),
  };
}

/** A copy of an item with a new uid (when a stack is split). */
export function cloneItem(it: Item, qty: number): Item {
  return { ...it, uid: newUid(), qty, loc: undefined };
}

export const defOf = (it: Item): ItemDef => itemDef(it.def);

/** Its name, with the count for a stack ("20 arrows", "a cloak"). */
export function itemName(it: Item, article = false): string {
  const d = defOf(it);
  const base = it.name ?? (it.qty > 1 ? d.plural ?? `${d.name}s` : d.name);
  if (it.qty > 1) return `${it.qty} ${base}`;
  if (!article || d.plural === d.name) return base;
  return `${/^[aeiou]/i.test(base) ? 'an' : 'a'} ${base}`;
}

/** Its condition in words. */
export function conditionWord(c: number): string {
  if (c >= 95) return 'new';
  if (c >= 75) return 'good';
  if (c >= 50) return 'worn';
  if (c >= 25) return 'damaged';
  if (c > 0) return 'nearly ruined';
  return 'ruined';
}

export const QUALITY_WORD: Record<Quality, string> = { poor: 'poor', common: 'common', fine: 'fine', masterwork: 'masterwork' };

/** What it is worth in copper (at common prices). */
export function itemValue(it: Item): number {
  const d = defOf(it);
  const cond = d.durable === false ? 1 : 0.3 + 0.7 * (it.condition / 100);
  const used = d.uses && it.uses !== undefined ? it.uses / d.uses : 1;
  return Math.max(0, Math.round(d.value * QUALITY_VALUE[it.quality] * cond * used * it.qty));
}

/** Its own weight (kg), without what it holds. */
export const ownWeight = (it: Item): number => defOf(it).weight * it.qty;
/** Its own room taken (litres). */
export const ownBulk = (it: Item): number => defOf(it).bulk * it.qty;
export const sizeOf = (it: Item): Size => defOf(it).size;
export const fitsSize = (it: Item, max: Size): boolean => sizeRank(sizeOf(it)) <= sizeRank(max);

/** Whether two stacks can be one (the same kind, quality and state). */
export function stacksWith(a: Item, b: Item): boolean {
  const d = defOf(a);
  return !!d.stack && a.def === b.def && a.quality === b.quality && a.make === b.make && a.condition === b.condition && a.uses === b.uses && a.name === b.name;
}
