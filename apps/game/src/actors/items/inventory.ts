/**
 * What a person carries (docs/design/characters.md, Carrying and inventory): every item with
 * its place (worn, held, on the back, on the belt, or inside a container), the rules for where a
 * thing can go, and how much is carried against what the person can bear.
 *
 * - **Hands:** two; a thing needing both takes both.
 * - **The back:** one pack (or a shield, bow or lute slung).
 * - **The belt:** a worn belt has loops; knives, satchels, pouches and waterskins hang from it.
 * - **Containers** hold things up to their room (litres), their strength (kg) and the biggest
 *   size that goes in: a statue goes in no pack, however strong the bearer.
 * - **Worn:** one item per body region and layer (undershirt, shirt, padding, armour, outer,
 *   cloak); under layers go on before, and come off after, what covers them. Jewellery has its
 *   own places, a few pieces each.
 * - **Load:** worn things weigh less on a person than carried ones. The load is light,
 *   burdened, heavy or overloaded against Strength and body weight; nothing more can be taken up
 *   past the most one can bear.
 */
import { Component } from '../actor';
import { Body, Traits } from '../components';
import { GEAR_ANIMALS, GEAR_ITEMS, ITEM, JEWEL_SLOTS, LAYERS, REGION_NAMES, sizeRank, type ItemDef, type Layer, type Quality } from './defs';
import { cloneItem, defOf, fitsSize, isInside, itemName, makeItem, ownBulk, ownWeight, stacksWith, type Item, type Loc } from './item';

export interface InventoryData {
  /** Money, in copper (10 copper to a silver, 10 silver to a gold, 10 gold to a platinum). */
  copper: number;
  items: Item[];
  /** Animals owned (a horse, a hound): led, not carried. */
  animals: string[];
}

export type Load = 'light' | 'burdened' | 'heavy' | 'overloaded';

export interface LoadInfo {
  kg: number;
  /** Up to `comfortable` is light; then burdened, heavy, overloaded up to `max`. */
  comfortable: number;
  max: number;
  load: Load;
  /** How much slower moving is. */
  slow: number;
}

/** Where things can go, for the screen. */
export type Dest = Loc;

const WORN_SHARE = 0.6;
/** A pack proper (worn on the back, with room), as against a thing slung there (a quiver, a shield). */
const isPack = (d: ItemDef) => !!d.container && !!d.back && d.container.litres >= 10;
const layerRank = (l: Layer) => LAYERS.indexOf(l);

export class Inventory extends Component {
  static readonly key = 'inventory';
  constructor(public d: InventoryData) {
    super();
    d.items ??= [];
    d.animals ??= [];
  }

  // ---- Looking things up ---------------------------------------------------------------------

  get(uid: string): Item | undefined {
    return this.d.items.find((i) => i.uid === uid);
  }

  children(uid: string): Item[] {
    return this.d.items.filter((i) => i.loc?.at === 'in' && i.loc.parent === uid);
  }

  /** What is strapped to the outside of a pack. */
  strapped(uid: string): Item[] {
    return this.d.items.filter((i) => i.loc?.at === 'strap' && i.loc.parent === uid);
  }

  /** Everything inside or strapped on, all the way down. */
  descendants(uid: string): Item[] {
    const out: Item[] = [];
    for (const c of [...this.children(uid), ...this.strapped(uid)]) out.push(c, ...this.descendants(c.uid));
    return out;
  }

  worn(): Item[] {
    return this.d.items.filter((i) => i.loc?.at === 'worn');
  }

  held(hand: 'left' | 'right'): Item | undefined {
    return this.d.items.find((i) => i.loc?.at === 'hand' && (i.loc.hand === hand || i.loc.hand === 'both'));
  }

  /** The pack on the back (or, without one, what is slung there). */
  onBack(): Item | undefined {
    const all = this.backItems();
    return all.find((i) => isPack(defOf(i))) ?? all[0];
  }

  /** Everything on the back: a pack, and one thing slung across it besides. */
  backItems(): Item[] {
    return this.d.items.filter((i) => i.loc?.at === 'back');
  }

  onBelt(): Item[] {
    return this.d.items.filter((i) => i.loc?.at === 'belt');
  }

  belt(): Item | undefined {
    return this.worn().find((i) => defOf(i).loops);
  }

  /** Containers carried, outermost first (in hands, on the back, on the belt, then those inside them). */
  containers(): Item[] {
    const top = this.d.items.filter((i) => defOf(i).container && !isInside(i.loc));
    const out: Item[] = [];
    const walk = (it: Item) => {
      out.push(it);
      for (const c of this.children(it.uid)) if (defOf(c).container) walk(c);
    };
    for (const t of top) walk(t);
    return out;
  }

  /** What a place is called ("your pack", "your left hand"). */
  where(loc: Loc | undefined): string {
    if (!loc) return 'nowhere';
    if (loc.at === 'worn') return 'worn';
    if (loc.at === 'hand') return loc.hand === 'both' ? 'in both hands' : `in your ${loc.hand} hand`;
    if (loc.at === 'back') return 'on your back';
    if (loc.at === 'belt') return 'on your belt';
    const p = this.get(loc.parent);
    if (!p) return 'nowhere';
    return loc.at === 'strap' ? `strapped to your ${itemName(p)}` : `in your ${itemName(p)}`;
  }

  // ---- Weight and room -----------------------------------------------------------------------

  /** An item's weight with all it holds. */
  weightOf(it: Item): number {
    return ownWeight(it) + [...this.children(it.uid), ...this.strapped(it.uid)].reduce((s, c) => s + this.weightOf(c), 0);
  }

  /** The room an item takes: soft containers swell with what is in them. */
  bulkOf(it: Item): number {
    const d = defOf(it);
    if (!d.container) return ownBulk(it);
    return Math.max(ownBulk(it), this.contentsBulk(it.uid) + 0.2);
  }

  contentsBulk(uid: string): number {
    return this.children(uid).reduce((s, c) => s + this.bulkOf(c), 0);
  }

  contentsWeight(uid: string): number {
    return this.children(uid).reduce((s, c) => s + this.weightOf(c), 0);
  }

  /** The load carried (kg): worn things count for less. */
  carried(): number {
    let kg = 0;
    for (const it of this.d.items) {
      if (isInside(it.loc)) continue;
      kg += this.weightOf(it) * (it.loc?.at === 'worn' ? WORN_SHARE : 1);
    }
    return Math.round(kg * 10) / 10;
  }

  /** The load against what this person can bear (Strength and body weight). */
  loadInfo(): LoadInfo {
    const str = this.actor?.get(Traits)?.get('strength') ?? 10;
    const body = this.actor?.get(Body)?.d.weightKg ?? 70;
    const comfortable = Math.round(body * (0.15 + str * 0.01) * 10) / 10;
    const max = Math.round(comfortable * 2.6 * 10) / 10;
    const kg = this.carried();
    const load: Load = kg <= comfortable ? 'light' : kg <= comfortable * 1.5 ? 'burdened' : kg <= comfortable * 2 ? 'heavy' : 'overloaded';
    const slow = { light: 1, burdened: 1.15, heavy: 1.4, overloaded: 2 }[load];
    return { kg, comfortable, max, load, slow };
  }

  // ---- Where a thing can go ------------------------------------------------------------------

  /**
   * Why an item cannot go to a place, or null. The item is carried already, or new (from the
   * ground or a shop), with `tree` what is inside it.
   */
  why(it: Item, dest: Dest, tree: Item[] = []): string | null {
    const d = defOf(it);
    const mine = !!this.get(it.uid);
    const name = itemName(it);
    const kgOf = (x: Item) => (mine ? this.weightOf(x) : ownWeight(x) + tree.reduce((s, c) => s + ownWeight(c), 0));
    const bulkOf = (x: Item) => (mine ? this.bulkOf(x) : defOf(x).container ? Math.max(ownBulk(x), tree.reduce((s, c) => s + ownBulk(c), 0) + 0.2) : ownBulk(x));
    // Taking up something new: can it be borne at all?
    if (!mine) {
      const li = this.loadInfo();
      const add = kgOf(it) * (dest.at === 'worn' ? WORN_SHARE : 1);
      if (li.kg + add > li.max) return `You cannot carry any more: the ${name} would be too much to bear.`;
    }
    if (mine) {
      if ((dest.at === 'in' || dest.at === 'strap') && (dest.parent === it.uid || this.descendants(it.uid).some((x) => x.uid === dest.parent))) return `The ${name} cannot go inside itself.`;
      const off = dest.at === 'worn' ? null : this.whyRemove(it);
      if (off) return off;
    }
    switch (dest.at) {
      case 'hand': {
        const both = dest.hand === 'both' || d.hands === 2;
        const hands: ('left' | 'right')[] = both ? ['left', 'right'] : [dest.hand as 'left' | 'right'];
        for (const h of hands) {
          const x = this.held(h);
          if (x && x.uid !== it.uid) return `Your ${h} hand holds the ${itemName(x)}.`;
        }
        return null;
      }
      case 'back': {
        if (!d.back) return `The ${name} is not something to carry on your back.`;
        // One pack, and one thing slung across the back besides.
        const others = this.backItems().filter((x) => x.uid !== it.uid);
        const same = others.find((x) => isPack(defOf(x)) === isPack(d));
        if (same) return `You already carry the ${itemName(same)} on your back.`;
        if (others.length >= 2) return 'Your back is full.';
        return null;
      }
      case 'strap': {
        const p = this.get(dest.parent);
        const pc = p && defOf(p).container;
        if (!p || !pc?.straps) return 'There is nothing to strap it to.';
        if (!d.strap) return `The ${name} is not something to strap to a pack.`;
        const on = this.strapped(p.uid).filter((x) => x.uid !== it.uid);
        if (on.length >= pc.straps) return `The straps of the ${itemName(p)} are full.`;
        const kg = on.reduce((s, x) => s + this.weightOf(x), 0);
        if (kg + kgOf(it) > (pc.strapKg ?? 0) + 1e-6) return `The straps of the ${itemName(p)} would not bear the ${name}.`;
        return null;
      }
      case 'belt': {
        if (!d.belt) return `The ${name} cannot hang from a belt.`;
        const b = this.belt();
        if (!b) return 'You are not wearing a belt.';
        const on = this.onBelt().filter((x) => x.uid !== it.uid);
        if (on.length >= (defOf(b).loops ?? 0)) return `Your ${itemName(b)} has nothing free to hang it from.`;
        return null;
      }
      case 'in': {
        const p = this.get(dest.parent);
        if (!p) return 'There is no such container.';
        const pc = defOf(p).container;
        if (!pc) return `The ${itemName(p)} holds nothing.`;
        if (pc.only && !pc.only.includes(it.def)) return `Only ${pc.only.join(' and ')} go in the ${itemName(p)}.`;
        if (!fitsSize(it, pc.maxSize)) return `The ${name} is too big for the ${itemName(p)}.`;
        const merge = this.children(p.uid).find((c) => c.uid !== it.uid && stacksWith(c, it) && c.qty + it.qty <= (d.stack ?? 1));
        const roomNow = this.contentsBulk(p.uid) - (mine && it.loc?.at === 'in' && it.loc.parent === p.uid ? this.bulkOf(it) : 0);
        if (!merge && roomNow + bulkOf(it) > pc.litres + 1e-6) return `There is not room for the ${name} in the ${itemName(p)}.`;
        if (merge && roomNow + ownBulk(it) > pc.litres + 1e-6) return `There is not room for the ${name} in the ${itemName(p)}.`;
        const kgNow = this.contentsWeight(p.uid) - (mine && it.loc?.at === 'in' && it.loc.parent === p.uid ? this.weightOf(it) : 0);
        if (kgNow + kgOf(it) > pc.maxKg + 1e-6) return `The ${itemName(p)} would not bear the weight of the ${name}.`;
        return null;
      }
      case 'worn':
        return this.whyNotWear(it);
    }
  }

  /** Why an item cannot be taken from where it is (worn under something, or a belt with things on it), or null. */
  whyRemove(it: Item): string | null {
    if (it.loc?.at !== 'worn') return null;
    const w = defOf(it).wear!;
    if (w.regions && w.layer) {
      for (const o of this.worn()) {
        const ow = defOf(o).wear!;
        if (o.uid === it.uid || !ow.regions || !ow.layer) continue;
        if (ow.regions.some((r) => w.regions!.includes(r)) && layerRank(ow.layer) > layerRank(w.layer)) return `Take off the ${itemName(o)} first.`;
      }
    }
    if (defOf(it).loops && this.onBelt().length) return `Take off what hangs from the ${itemName(it)} first.`;
    return null;
  }

  private whyNotWear(it: Item): string | null {
    const d = defOf(it);
    const w = d.wear;
    if (!w) return `The ${itemName(it)} is not something to wear.`;
    if (it.qty > 1) return 'Wear one at a time.';
    if (w.jewel) {
      const n = this.worn().filter((o) => o.uid !== it.uid && defOf(o).wear?.jewel === w.jewel).length;
      return n >= JEWEL_SLOTS[w.jewel] ? `You have no room for more there.` : null;
    }
    for (const o of this.worn()) {
      if (o.uid === it.uid) continue;
      const ow = defOf(o).wear!;
      if (!ow.regions || !ow.layer) continue;
      const shared = ow.regions.filter((r) => w.regions!.includes(r));
      if (!shared.length) continue;
      if (ow.layer === w.layer) return `You are already wearing the ${itemName(o)} (${REGION_NAMES[shared[0]].toLowerCase()}).`;
      if (layerRank(ow.layer) > layerRank(w.layer!)) return `Take off the ${itemName(o)} first; the ${itemName(it)} goes under it.`;
    }
    return null;
  }

  /** How long a move takes (s): dressing, digging into a pack, or a moment. */
  seconds(it: Item, dest: Dest): number {
    const w = defOf(it).wear;
    if (dest.at === 'worn' || it.loc?.at === 'worn') return w?.seconds ?? 5;
    const deep = (l?: Loc) => l?.at === 'in' && this.get(l.parent)?.loc?.at === 'back';
    if (it.loc?.at === 'strap' || dest.at === 'strap') return 8;
    return deep(it.loc) || deep(dest) ? 6 : 2;
  }

  /**
   * Puts an item (carried, or new) in a place. Returns why not, or null; a stack put into a
   * container with a like stack joins it.
   */
  put(it: Item, dest: Dest, tree: Item[] = []): string | null {
    const why = this.why(it, dest, tree);
    if (why) return why;
    const d = defOf(it);
    let place: Loc = dest;
    if (dest.at === 'hand' && d.hands === 2) place = { at: 'hand', hand: 'both' };
    if (dest.at === 'in') {
      const merge = this.children(dest.parent).find((c) => c.uid !== it.uid && stacksWith(c, it) && c.qty + it.qty <= (d.stack ?? 1));
      if (merge) {
        merge.qty += it.qty;
        this.drop(it.uid);
        return null;
      }
    }
    it.loc = place;
    if (!this.get(it.uid)) this.d.items.push(it, ...tree);
    return null;
  }

  /** Takes an item (and all inside it) out of the inventory, and returns them (to put on the ground). */
  drop(uid: string): Item[] {
    const it = this.get(uid);
    if (!it) return [];
    const inside = this.descendants(uid);
    const gone = new Set([uid, ...inside.map((x) => x.uid)]);
    this.d.items = this.d.items.filter((x) => !gone.has(x.uid));
    return [it, ...inside];
  }

  /** Splits `n` off a stack, left where it is; returns the new stack (not yet placed). */
  split(uid: string, n: number): Item | null {
    const it = this.get(uid);
    if (!it || n <= 0 || n >= it.qty) return null;
    it.qty -= n;
    return cloneItem(it, n);
  }

  /** Where a new thing would best go: a container, the belt, the back, or a hand. Null if nowhere. */
  bestPlace(it: Item, tree: Item[] = []): Dest | null {
    const d = defOf(it);
    const tries: Dest[] = [];
    if (d.belt && !d.container) tries.push({ at: 'belt' });
    if (d.back) tries.push({ at: 'back' });
    for (const c of this.containers()) tries.push({ at: 'in', parent: c.uid });
    if (d.strap) for (const c of this.containers()) if (defOf(c).container?.straps) tries.push({ at: 'strap', parent: c.uid });
    if (d.belt) tries.push({ at: 'belt' });
    tries.push({ at: 'hand', hand: 'right' }, { at: 'hand', hand: 'left' });
    return tries.find((t) => !this.why(it, t, tree)) ?? null;
  }

  /** Puts a new thing wherever it best goes; returns why not, or null. */
  stow(it: Item, tree: Item[] = []): string | null {
    const p = this.bestPlace(it, tree);
    if (!p) {
      const li = this.loadInfo();
      if (li.kg + ownWeight(it) > li.max) return `You cannot carry any more: the ${itemName(it)} would be too much to bear.`;
      return `You have nowhere to carry the ${itemName(it)}; free a hand or make room in a bag.`;
    }
    return this.put(it, p, tree);
  }

  /** Hand items for showing: what is in each hand (a two-handed thing in both). */
  hands(): { left?: Item; right?: Item; both?: Item } {
    const both = this.d.items.find((i) => i.loc?.at === 'hand' && i.loc.hand === 'both');
    if (both) return { both };
    return { left: this.held('left'), right: this.held('right') };
  }

  toJSON(): InventoryData {
    return { copper: this.d.copper, items: this.d.items.map((i) => ({ ...i, loc: i.loc ? { ...i.loc } : undefined })), animals: [...this.d.animals] };
  }

  static fromJSON(d: InventoryData | { copper: number; items: { name: string }[] }): Inventory {
    // Older saves kept a list of names: dress and pack the character again from it.
    const items = (d as InventoryData).items ?? [];
    if (items.length && !(items[0] as Item).uid) {
      return startingInventory((d.items as { name: string; qty?: number }[]).map((x) => x.name), d.copper, {});
    }
    return new Inventory({ copper: d.copper, items: items as Item[], animals: (d as InventoryData).animals ?? [] });
  }
}

// ---- A new character's belongings ---------------------------------------------------------------

export interface StartOpts {
  female?: boolean;
  make?: string;
  /** Poorer folk wear poorer things. */
  quality?: Quality;
  /** Called with things there was no room for (left behind at the start). */
  leftBehind?: Item[];
}

/**
 * Dresses and packs a new character: the clothes of every day (undershirt, tunic or dress,
 * trousers, socks, boots, belt, cloak), a pouch, knife and waterskin on the belt, a small pack on
 * the back (or the pack their life gave them), and then the gear of their life, each where it
 * best goes. Anything with no room is left behind.
 */
export function startingInventory(gear: string[], copper: number, o: StartOpts): Inventory {
  const inv = new Inventory({ copper, items: [], animals: [] });
  const q = o.quality ?? 'common';
  const mk = (id: string, x: { qty?: number; quality?: Quality; name?: string } = {}) => makeItem(id, { quality: x.quality ?? q, make: o.make, qty: x.qty, name: x.name });
  const wear = (id: string, quality?: Quality) => {
    const it = mk(id, { quality });
    if (inv.put(it, { at: 'worn' })) o.leftBehind?.push(it);
  };
  // Everyday clothes, inside out.
  const fine = gear.includes('good clothes');
  wear('undershirt');
  wear('braies');
  if (fine) {
    wear('doublet', 'fine');
    wear('hose', 'fine');
  } else if (o.female) wear('dress');
  else {
    wear('tunic');
    wear('trousers');
  }
  wear('socks');
  wear('boots');
  wear(gear.includes('sword') ? 'sword_belt' : 'belt');
  wear('cloak');
  inv.put(mk('pouch'), { at: 'belt' });
  inv.put(mk('knife'), { at: 'belt' });
  inv.put(mk(gear.includes('pack') ? 'pack' : 'pack_small'), { at: 'back' });
  // Every traveller carries needle and thread.
  inv.stow(makeItem('sewing_kit', { make: o.make }));

  for (const g of gear) {
    if (GEAR_ANIMALS.has(g)) {
      inv.d.animals.push(g);
      continue;
    }
    for (const spec of GEAR_ITEMS[g] ?? []) {
      if (spec.id === 'knife' || spec.id === 'sword_belt' || spec.id === 'pack' || (fine && (spec.id === 'doublet' || spec.id === 'hose'))) continue;
      if (!ITEM.has(spec.id)) continue;
      const it = mk(spec.id, { qty: spec.qty, quality: spec.quality, name: spec.name });
      const d: ItemDef = defOf(it);
      // Clothes and armour are worn if they can be; the rest goes where it best goes.
      if (d.wear && !inv.why(it, { at: 'worn' })) {
        inv.put(it, { at: 'worn' });
        continue;
      }
      if (inv.stow(it)) o.leftBehind?.push(it);
    }
  }
  return inv;
}

/** Sizes in words, for the screen. */
export const SIZE_WORD = (s: string) => ({ tiny: 'tiny', small: 'small', medium: 'middling', large: 'large', huge: 'huge' })[s] ?? s;
export { sizeRank };
