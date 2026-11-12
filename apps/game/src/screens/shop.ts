/**
 * Buying in town: a market's or a shop's goods, over the city view. What is for sale comes from
 * the place (a market sells most everyday things; a smithy blades, tools and armour; a tailor
 * clothes; an apothecary remedies), made by the town's people, in a range of qualities, the
 * same through a day. Bought things go where they best fit (a pack, a bag, the belt, a hand),
 * and cannot be bought with nowhere to carry them. (Selling, haggling and prices that move with
 * the market are to come with the economy.)
 */
import { reactive } from 'vue';
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import { Screen } from '../engine/screens';
import type { PlayScreen } from './play';
import type { SitePlace } from '../worker/protocol';
import { ITEMS, type Quality } from '../actors/items/defs';
import { itemName, itemValue, makeItem, type Item } from '../actors/items/item';
import { Inventory } from '../actors/items/inventory';
import { moneyText } from '../actors/components';
import ShopView from './views/ShopView.vue';

export interface Ware {
  item: Item;
  price: number;
  /** How many are for sale. */
  left: number;
}

/** What a place's role sells beyond its own list (a store and a pawnshop sell much). */
const ROLE_ALIAS: Record<string, string[]> = { pawnshop: ['market', 'store'], store: ['store'], stables: ['market'] };

export class ShopScreen extends Screen {
  readonly view = ShopView;
  popup = true;
  readonly state = reactive({ message: '', version: 0 });
  readonly wares: Ware[];

  constructor(readonly play: PlayScreen, readonly place: SitePlace, readonly make: string | undefined) {
    super();
    this.wares = this.stock();
  }

  get inv(): Inventory | undefined {
    return this.play.player?.get(Inventory);
  }

  /** The day's goods: each kind sold here, in one or two qualities. */
  private stock(): Ware[] {
    const day = Math.floor(this.play.now() / 86400);
    const r = mulberry32(hashString(`${this.place.id}|${day}`));
    const tags = new Set([this.place.kind, this.place.role ?? '', ...(ROLE_ALIAS[this.place.role ?? ''] ?? [])]);
    const fine = this.place.kind === 'shop';
    const out: Ware[] = [];
    for (const d of ITEMS) {
      if (!d.sold?.some((t) => tags.has(t))) continue;
      if (this.place.kind === 'market' && r() < 0.25) continue;
      const qs: Quality[] = [r() < 0.25 ? 'poor' : 'common'];
      if (fine && r() < 0.35) qs.push(r() < 0.12 ? 'masterwork' : 'fine');
      for (const q of qs) {
        const item = makeItem(d.id, { quality: q, make: this.make, qty: d.stack ? Math.min(d.stack, d.id === 'arrows' ? 20 : 1) : 1 });
        out.push({ item, price: Math.max(1, itemValue(item)), left: d.stack ? 6 : 1 + Math.floor(r() * 3) });
      }
    }
    return out;
  }

  buy(w: Ware): void {
    const inv = this.inv;
    if (!inv || w.left <= 0) return;
    if (inv.d.copper < w.price) {
      this.state.message = `You have only ${moneyText(inv.d.copper)}.`;
      return;
    }
    const it = makeItem(w.item.def, { quality: w.item.quality, make: w.item.make, qty: w.item.qty });
    const why = inv.stow(it);
    if (why) {
      this.state.message = why;
      return;
    }
    inv.d.copper -= w.price;
    w.left--;
    this.play.advance(60);
    const placed = inv.get(it.uid);
    const msg = `You buy ${itemName(it, true)} for ${moneyText(w.price)}; it goes ${placed ? inv.where(placed.loc) : 'in with the others like it'}.`;
    this.state.message = msg;
    this.play.say(msg);
    this.state.version++;
  }

  key(e: KeyboardEvent): boolean {
    if (e.code !== 'Escape') return false;
    this.close();
    return true;
  }
}
