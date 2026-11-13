/**
 * Buying in town: a market's or a shop's goods, over the city view. What is for sale comes from
 * the place (a market sells most everyday things; a smithy blades, tools and armour; a tailor
 * clothes; an apothecary remedies), made by the town's people, in a range of qualities, the
 * same through a day. Bought things go where they best fit (a pack, a bag, the belt, a hand),
 * and cannot be bought with nowhere to carry them.
 *
 * **Haggling** (Trading): the first visit to a place each day makes one check, and its grade sets
 * the prices there for the day, both ways. **Selling:** a shop buys what it deals in (a market,
 * store or pawnshop most things), at a share of the value; things worn, or bags with things in
 * them, must be taken off or emptied first. (Prices that move with the market are to come with
 * the economy.)
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
import { check, DC, type Grade } from '../actors/checks';
import { defOf } from '../actors/items/item';

/** What the day's haggling does to prices: what they ask, and the share of the value they pay. */
export const BUY_FACTOR: Record<Grade, number> = { fine: 0.82, success: 0.9, near: 1, fail: 1.06, fumble: 1.15 };
export const SELL_FACTOR: Record<Grade, number> = { fine: 0.55, success: 0.5, near: 0.45, fail: 0.4, fumble: 0.35 };
const DEAL_WORDS: Record<Grade, string> = {
  fine: 'You strike a hard bargain; they give you their best prices.',
  success: 'You haggle well, and the prices come down.',
  near: 'You haggle, and get the usual prices.',
  fail: 'They see you coming, and ask a little over the odds.',
  fumble: 'You put their backs up; the prices go up.',
};

export interface Offer {
  item: Item;
  price: number;
}

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
  readonly state = reactive({ message: '', version: 0, tab: 'buy' as 'buy' | 'sell' });
  readonly wares: Ware[];
  /** The day's haggling here, and what it said. */
  readonly deal: Grade;
  readonly dealText: string;
  private tags: Set<string>;

  constructor(readonly play: PlayScreen, readonly place: SitePlace, readonly make: string | undefined) {
    super();
    this.tags = new Set([place.kind, place.role ?? '', ...(ROLE_ALIAS[place.role ?? ''] ?? [])]);
    this.deal = this.haggle();
    this.dealText = DEAL_WORDS[this.deal];
    this.wares = this.stock();
  }

  /** Trading, once a day at a place: the grade holds for the day. */
  private haggle(): Grade {
    const day = Math.floor(this.play.now() / 86400);
    const key = `${this.place.id}|${day}|trading`;
    let g = this.play.dealings.get(key);
    if (!g) {
      const a = this.play.player;
      g = a ? check(a, 'trading', { difficulty: DC.routine, now: this.play.now() }).grade : 'near';
      this.play.dealings.set(key, g);
    }
    return g;
  }

  /** Whether this place buys a kind of thing. */
  deals(it: Item): boolean {
    const d = defOf(it);
    if (this.place.kind === 'market' || this.tags.has('store') || this.tags.has('pawnshop')) return d.value > 0;
    return !!d.sold?.some((t) => this.tags.has(t));
  }

  /** What they would pay for a thing (0: nothing). */
  offerFor(it: Item): number {
    return Math.floor(itemValue(it) * SELL_FACTOR[this.deal]);
  }

  /** What the wanderer carries that could be sold here, and why not where not. */
  offers(): (Offer & { why: string | null })[] {
    void this.state.version;
    const inv = this.inv;
    if (!inv) return [];
    return inv.d.items
      .filter((it) => this.deals(it))
      .map((it) => {
        const price = this.offerFor(it);
        const why = it.loc?.at === 'worn' ? 'Take it off first.' : inv.descendants(it.uid).length || inv.strapped(it.uid).length ? 'Empty it first.' : price <= 0 ? 'They would give nothing for it.' : null;
        return { item: it, price, why };
      })
      // What can be sold now first.
      .sort((a, b) => Number(!!a.why) - Number(!!b.why));
  }

  sell(o: Offer): void {
    const inv = this.inv;
    if (!inv || !inv.get(o.item.uid)) return;
    const price = this.offerFor(o.item);
    inv.drop(o.item.uid);
    inv.d.copper += price;
    this.play.advance(60);
    const msg = `You sell ${itemName(o.item, true)} for ${moneyText(price)}.`;
    this.state.message = msg;
    this.play.say(msg);
    this.state.version++;
  }

  get inv(): Inventory | undefined {
    return this.play.player?.get(Inventory);
  }

  /** The day's goods: each kind sold here, in one or two qualities. */
  private stock(): Ware[] {
    const day = Math.floor(this.play.now() / 86400);
    const r = mulberry32(hashString(`${this.place.id}|${day}`));
    const tags = this.tags;
    const fine = this.place.kind === 'shop';
    const out: Ware[] = [];
    for (const d of ITEMS) {
      if (!d.sold?.some((t) => tags.has(t))) continue;
      if (this.place.kind === 'market' && r() < 0.25) continue;
      const qs: Quality[] = [r() < 0.25 ? 'poor' : 'common'];
      if (fine && r() < 0.35) qs.push(r() < 0.12 ? 'masterwork' : 'fine');
      for (const q of qs) {
        const item = makeItem(d.id, { quality: q, make: this.make, qty: d.stack ? Math.min(d.stack, d.id === 'arrows' ? 20 : 1) : 1 });
        out.push({ item, price: Math.max(1, Math.round(itemValue(item) * BUY_FACTOR[this.deal])), left: d.stack ? 6 : 1 + Math.floor(r() * 3) });
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
