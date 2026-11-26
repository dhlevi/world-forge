/**
 * What the skill menu's kinds of work share (game/woodcraft.ts, game/trapping.ts): the things
 * carried, counted, used up and stowed, and the time the work takes.
 */
import { OBJECT_TILES } from '@worldforge/core/local/tiles';
import { Inventory } from '../actors/items/inventory';
import type { Item } from '../actors/items/item';
import type { PlaySession } from './session';

export abstract class FieldWork {
  constructor(protected readonly s: PlaySession) {}

  protected get g() {
    return this.s.game;
  }

  protected get inv(): Inventory | undefined {
    return this.s.player?.get(Inventory);
  }

  /** The object on a tile, by name (on the ground). */
  protected objName(x: number, y: number): string {
    return OBJECT_TILES[this.g.map.objectAt(x, y, null)]?.name ?? 'none';
  }

  /** Counts the items of a kind carried. */
  protected count(def: string): number {
    return (this.inv?.d.items ?? []).filter((i) => i.def === def).reduce((n, i) => n + i.qty, 0);
  }

  /** Uses up so many of a kind carried. */
  protected use(def: string, n: number): void {
    const inv = this.inv;
    if (!inv) return;
    for (const it of [...inv.d.items]) {
      if (n <= 0) break;
      if (it.def !== def) continue;
      const take = Math.min(n, it.qty);
      n -= take;
      if (take >= it.qty) inv.drop(it.uid);
      else it.qty -= take;
    }
    this.s.player?.changed();
  }

  /** Puts things in the pack, and what will not go on the ground at the wanderer's feet. Returns what was left. */
  protected stow(items: Item[]): Item[] {
    const inv = this.inv, left: Item[] = [];
    for (const it of items) if (!inv || inv.stow(it)) left.push(it);
    if (left.length) this.g.ground.put(this.g.px, this.g.py, left);
    this.s.player?.changed();
    return left;
  }

  /** Time spent at work. */
  protected spend(seconds: number): void {
    this.g.time += seconds;
    this.g.activity = 'work';
  }
}
