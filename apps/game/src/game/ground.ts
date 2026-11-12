/**
 * Things left on the local map: on the ground, or put away in a chest, barrel, crate, wardrobe
 * or on a shelf, by tile. A container left on the ground keeps what is in it. Saved with the game.
 */
import { OBJECT_TILES } from '@worldforge/core/local/tiles';
import type { Item } from '../actors/items/item';
import { defOf, isInside } from '../actors/items/item';
import type { GameMap } from './map';

/** Furniture that things can be put away in: its room (litres). */
export const STORAGE: Record<string, number> = { chest: 120, barrel: 60, crate: 60, wardrobe: 150, shelf: 40, tomb: 200 };

const key = (x: number, y: number) => `${x},${y}`;

export class Ground {
  private m = new Map<string, Item[]>();
  /** Bumped on every change (for redrawing). */
  version = 0;

  /** Everything at a tile (top-level things and what is inside them). */
  all(x: number, y: number): Item[] {
    return this.m.get(key(x, y)) ?? [];
  }

  /** The things lying at a tile (not those inside others). */
  at(x: number, y: number): Item[] {
    return this.all(x, y).filter((i) => !isInside(i.loc));
  }

  /** What is inside a thing on the ground. */
  inside(x: number, y: number, uid: string): Item[] {
    const all = this.all(x, y);
    const out: Item[] = [];
    const walk = (p: string) => {
      for (const c of all) if ((c.loc?.at === 'in' || c.loc?.at === 'strap') && c.loc.parent === p) {
        out.push(c);
        walk(c.uid);
      }
    };
    walk(uid);
    return out;
  }

  has(x: number, y: number): boolean {
    return this.at(x, y).length > 0;
  }

  /** Room used at a tile (litres), for storage furniture. */
  bulk(x: number, y: number): number {
    return this.at(x, y).reduce((s, i) => s + defOf(i).bulk * i.qty, 0);
  }

  /** Lays things down: the first is the top one, the rest what was inside it (their places kept). */
  put(x: number, y: number, tree: Item[]): void {
    const k = key(x, y);
    const list = this.m.get(k) ?? [];
    const [top, ...rest] = tree;
    top.loc = undefined;
    list.push(top, ...rest);
    this.m.set(k, list);
    this.version++;
  }

  /** Takes a thing (and all inside it) up from a tile; returns them, the top one first. */
  take(x: number, y: number, uid: string): Item[] {
    const k = key(x, y);
    const list = this.m.get(k) ?? [];
    const top = list.find((i) => i.uid === uid);
    if (!top) return [];
    const inner = this.inside(x, y, uid);
    const gone = new Set([uid, ...inner.map((i) => i.uid)]);
    const left = list.filter((i) => !gone.has(i.uid));
    if (left.length) this.m.set(k, left);
    else this.m.delete(k);
    this.version++;
    return [top, ...inner];
  }

  export(): [number, number, Item[]][] {
    return [...this.m].map(([k, v]) => {
      const [x, y] = k.split(',').map(Number);
      return [x, y, v.map((i) => ({ ...i, loc: i.loc ? { ...i.loc } : undefined }))];
    });
  }

  import(d: [number, number, Item[]][]): void {
    this.m.clear();
    for (const [x, y, v] of d) this.m.set(key(x, y), v);
    this.version++;
  }
}

/** The storage furniture at a tile, if any: its name and room. */
export function storageAt(map: GameMap, x: number, y: number): { look: string; litres: number } | null {
  const o = map.object(x, y);
  if (!o) return null;
  const def = OBJECT_TILES[o];
  const litres = STORAGE[def.name];
  return litres ? { look: def.look, litres } : null;
}
