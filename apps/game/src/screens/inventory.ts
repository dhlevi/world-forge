/**
 * The inventory, over the map: the body with what is worn, the hands, back and belt, every
 * container carried with what it holds, and what lies nearby (on the ground here, or in a chest,
 * barrel, crate, wardrobe or shelf beside). Things are dragged from place to place, or chosen and
 * given an action (wear, hold, put in..., drop, take); each takes the time it takes.
 */
import { reactive } from 'vue';
import { Screen } from '../engine/screens';
import type { PlayScreen } from './play';
import type { Actor } from '../actors/actor';
import { Inventory, type Dest } from '../actors/items/inventory';
import { defOf, itemName, fitsSize, ownBulk, type Item } from '../actors/items/item';
import { storageAt } from '../game/ground';
import InventoryView from './views/InventoryView.vue';
import { Needs, NOURISH } from '../actors/needs';

/** An item, carried or lying nearby. */
export type Ref = { from: 'inv'; uid: string } | { from: 'ground'; x: number; y: number; uid: string };

/** A place things lie nearby: the ground underfoot, or furniture beside. */
export interface Spot {
  x: number;
  y: number;
  label: string;
  /** Room in furniture (litres); none for open ground. */
  litres?: number;
}

/** Where something can be sent: a place on the person, or a spot nearby. */
export type Target = Dest | { at: 'ground'; x: number; y: number };

export interface ItemAction {
  label: string;
  target: Target | 'split' | 'consume';
  why?: string | null;
}

const DIRS: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

export class InventoryScreen extends Screen {
  readonly view = InventoryView;
  popup = true;
  readonly state = reactive({
    selected: null as Ref | null,
    message: '',
    /** Bumped after every change (the items themselves are not reactive). */
    version: 0,
  });

  constructor(readonly play: PlayScreen, readonly actor: Actor) {
    super();
  }

  get inv(): Inventory {
    return this.actor.need(Inventory);
  }

  private get game() {
    return this.play.hooks!.game();
  }

  /** The ground underfoot, and furniture to put things in on this tile and beside it. */
  spots(): Spot[] {
    const g = this.game;
    const out: Spot[] = [{ x: g.px, y: g.py, label: 'On the ground here' }];
    for (const [dx, dy] of [[0, 0], ...DIRS]) {
      const st = storageAt(g.map, g.px + dx, g.py + dy);
      if (st) out.push({ x: g.px + dx, y: g.py + dy, label: st.look[0].toUpperCase() + st.look.slice(1), litres: st.litres });
    }
    // Open ground under furniture counts as the furniture.
    if (out.length > 1 && out[1].x === g.px && out[1].y === g.py) out.shift();
    return out;
  }

  groundAt(s: Spot): Item[] {
    return this.game.ground.at(s.x, s.y);
  }

  groundInside(s: Spot, uid: string): Item[] {
    return this.game.ground.inside(s.x, s.y, uid).filter((i) => (i.loc?.at === 'in' || i.loc?.at === 'strap') && i.loc.parent === uid);
  }

  item(r: Ref | null): Item | undefined {
    if (!r) return undefined;
    if (r.from === 'inv') return this.inv.get(r.uid);
    return this.game.ground.all(r.x, r.y).find((i) => i.uid === r.uid);
  }

  select(r: Ref | null): void {
    this.state.selected = r;
    this.state.message = '';
  }

  /** Why a thing cannot go somewhere, or null. */
  why(r: Ref, t: Target): string | null {
    const it = this.item(r);
    if (!it) return 'It is gone.';
    if (t.at === 'ground') {
      if (r.from === 'ground' && r.x === t.x && r.y === t.y) return 'It is there already.';
      if (r.from === 'inv') {
        const off = this.inv.whyRemove(it);
        if (off) return off;
      }
      const st = storageAt(this.game.map, t.x, t.y);
      if (st) {
        if (!fitsSize(it, 'large')) return `The ${itemName(it)} will not go in the ${st.look}.`;
        if (this.game.ground.bulk(t.x, t.y) + ownBulk(it) > st.litres) return `There is no room for the ${itemName(it)} in the ${st.look}.`;
      }
      return null;
    }
    if (r.from === 'inv') return this.inv.why(it, t);
    // From the ground: only from the tile underfoot or beside.
    const g = this.game;
    if (Math.max(Math.abs(r.x - g.px), Math.abs(r.y - g.py)) > 1) return 'It is out of reach.';
    if (it.loc?.at === 'in' || it.loc?.at === 'strap') return 'Take what holds it first, or take it out onto the ground.';
    return this.inv.why(it, t, g.ground.inside(r.x, r.y, r.uid));
  }

  /** Sends a thing somewhere: on the person, into a container, or down nearby. */
  move(r: Ref, t: Target): boolean {
    const why = this.why(r, t);
    if (why) {
      this.state.message = why;
      return false;
    }
    const it = this.item(r)!;
    const g = this.game;
    let secs = 3;
    let said = '';
    if (t.at === 'ground') {
      const st = storageAt(g.map, t.x, t.y);
      if (r.from === 'inv') {
        secs = it.loc?.at === 'worn' ? defOf(it).wear?.seconds ?? 5 : 2;
        const tree = this.inv.drop(it.uid);
        g.ground.put(t.x, t.y, tree);
      } else {
        const tree = g.ground.take(r.x, r.y, r.uid);
        g.ground.put(t.x, t.y, tree);
      }
      said = st ? `You put the ${itemName(it)} in the ${st.look}.` : `You put down the ${itemName(it)}.`;
    } else if (r.from === 'inv') {
      secs = this.inv.seconds(it, t);
      const wasWorn = it.loc?.at === 'worn';
      this.inv.put(it, t);
      said = t.at === 'worn' ? `You put on the ${itemName(it)}.` : wasWorn ? `You take off the ${itemName(it)}.` : `You move the ${itemName(it)} ${this.inv.where(this.inv.get(it.uid)?.loc ?? t)}.`;
    } else {
      const tree = g.ground.take(r.x, r.y, r.uid);
      const [top, ...rest] = tree;
      const err = this.inv.put(top, t, rest);
      if (err) {
        g.ground.put(r.x, r.y, tree);
        this.state.message = err;
        return false;
      }
      secs = t.at === 'worn' ? defOf(top).wear?.seconds ?? 5 : 3;
      said = t.at === 'worn' ? `You pick up the ${itemName(top)} and put it on.` : `You pick up the ${itemName(top)}.`;
    }
    this.play.advance(secs);
    this.state.message = said;
    this.play.say(said);
    this.state.version++;
    this.play.hooks?.redraw();
    if (r.from === 'ground' && t.at !== 'ground') this.state.selected = { from: 'inv', uid: it.uid };
    else if (r.from === 'inv' && t.at === 'ground') this.state.selected = { from: 'ground', x: t.x, y: t.y, uid: it.uid };
    return true;
  }

  /** Takes one off a stack, into the best place (or a hand). */
  splitOne(r: Ref): void {
    const it = this.item(r);
    if (!it || it.qty < 2 || r.from !== 'inv') return;
    const one = this.inv.split(it.uid, 1)!;
    const err = this.inv.stow(one);
    if (err) {
      it.qty += 1;
      this.state.message = err;
      return;
    }
    this.state.message = `You take out one ${defOf(one).name}.`;
    this.state.version++;
  }

  /** Eats a portion, or drinks one's fill, from a carried thing. */
  consume(r: Ref): void {
    const it = this.item(r);
    const n = this.actor.get(Needs);
    const food = it && NOURISH[it.def];
    if (!it || !n || !food || r.from !== 'inv') return;
    const d = defOf(it);
    let msg = '';
    if (food.kcal === 0) {
      // Drinking: sip after sip, until slaked or the skin is empty.
      let sips = 0;
      while ((it.uses ?? 0) > 0 && n.room().litres >= (food.water ?? 0.1) * 0.5) {
        n.drink(food.water ?? 0.1);
        it.uses = (it.uses ?? 1) - 1;
        sips++;
      }
      msg = sips ? `You ${food.verb}${(it.uses ?? 0) <= 0 ? ', and empty it' : ''}.` : 'You could not drink any more.';
      this.play.advance(10 + sips * 4);
    } else {
      const took = n.eat(food.kcal, food.water ?? 0);
      if (took < 50) {
        this.state.message = 'You are too full to eat.';
        return;
      }
      msg = `You ${food.verb}.`;
      // A portion gone: the last portion of the last one takes the thing with it.
      if (d.uses) {
        it.uses = (it.uses ?? d.uses) - 1;
        if (it.uses <= 0) {
          if (it.qty > 1) {
            it.qty -= 1;
            it.uses = d.uses;
          } else this.inv.drop(it.uid);
        }
      } else if (it.qty > 1) it.qty -= 1;
      else this.inv.drop(it.uid);
      this.play.advance(5 * 60);
    }
    this.state.message = msg;
    this.play.say(msg);
    this.state.version++;
  }

  /** Picks up a thing nearby into wherever it best goes. */
  take(r: Ref): boolean {
    const it = this.item(r);
    if (!it || r.from !== 'ground') return false;
    const tree = this.game.ground.inside(r.x, r.y, r.uid);
    const p = this.inv.bestPlace(it, tree);
    if (!p) {
      this.state.message = this.inv.why(it, { at: 'hand', hand: 'right' }, tree) ?? `You have nowhere to carry the ${itemName(it)}.`;
      return false;
    }
    return this.move(r, p);
  }

  /** What can be done with the chosen thing. */
  actions(): ItemAction[] {
    const r = this.state.selected;
    const it = this.item(r);
    if (!r || !it) return [];
    const d = defOf(it);
    const out: ItemAction[] = [];
    const add = (label: string, target: Target) => out.push({ label, target, why: this.why(r, target) });
    const here = this.spots()[0];
    if (r.from === 'ground') {
      const p = this.inv.bestPlace(it, this.game.ground.inside(r.x, r.y, r.uid));
      if (p) add('Take', p);
      else out.push({ label: 'Take', target: { at: 'hand', hand: 'right' }, why: this.why(r, { at: 'hand', hand: 'right' }) ?? 'You have nowhere to carry it.' });
    }
    if (d.wear) {
      if (it.loc?.at === 'worn' && r.from === 'inv') {
        // Taking off: into a free hand, or the best place.
        const p = this.inv.held('right') ? (this.inv.held('left') ? null : ({ at: 'hand', hand: 'left' } as Target)) : ({ at: 'hand', hand: 'right' } as Target);
        add('Take off (into a hand)', p ?? { at: 'ground', x: here.x, y: here.y });
      } else add('Wear', { at: 'worn' });
    }
    if (!(it.loc?.at === 'hand')) {
      add(d.hands === 2 ? 'Hold in both hands' : 'Hold in right hand', { at: 'hand', hand: 'right' });
      if (d.hands !== 2) add('Hold in left hand', { at: 'hand', hand: 'left' });
    }
    if (d.back && it.loc?.at !== 'back') add(d.container ? 'Carry on your back' : 'Sling across your back', { at: 'back' });
    if (d.strap) for (const c of this.inv.containers()) {
      if (!defOf(c).container?.straps || c.uid === it.uid || (it.loc?.at === 'strap' && it.loc.parent === c.uid)) continue;
      add(`Strap to your ${itemName(c)}`, { at: 'strap', parent: c.uid });
    }
    if (d.belt && it.loc?.at !== 'belt') add('Hang on your belt', { at: 'belt' });
    for (const c of this.inv.containers()) {
      if (c.uid === it.uid || (it.loc?.at === 'in' && it.loc.parent === c.uid)) continue;
      add(`Put in your ${itemName(c)}`, { at: 'in', parent: c.uid });
    }
    for (const s of this.spots()) {
      if (r.from === 'ground' && r.x === s.x && r.y === s.y) continue;
      add(s.litres ? `Put in the ${s.label.toLowerCase()}` : 'Drop', { at: 'ground', x: s.x, y: s.y });
    }
    if (it.qty > 1 && r.from === 'inv') out.push({ label: 'Take out one', target: 'split', why: null });
    const food = NOURISH[it.def];
    if (food && r.from === 'inv') {
      const n = this.actor.get(Needs);
      const drink = food.kcal === 0;
      const empty = d.uses !== undefined && (it.uses ?? 0) <= 0;
      const room = n?.room();
      const why = empty ? 'It is empty.' : room && (drink ? room.litres < 0.05 : room.kcal < 50) ? (drink ? 'You could not drink any more.' : 'You are too full to eat.') : null;
      out.unshift({ label: drink ? 'Drink' : 'Eat', target: 'consume', why });
    }
    return out;
  }

  act(a: ItemAction): void {
    const r = this.state.selected;
    if (!r) return;
    if (a.target === 'split') this.splitOne(r);
    else if (a.target === 'consume') this.consume(r);
    else this.move(r, a.target);
  }

  // ---- Keys ----------------------------------------------------------------------------------

  /** Every item in the order shown, for moving the choice with the keys. */
  order(): Ref[] {
    const inv = this.inv;
    const refs: Ref[] = [];
    const seen = new Set<string>();
    const push = (i: Item) => {
      if (seen.has(i.uid)) return;
      seen.add(i.uid);
      refs.push({ from: 'inv', uid: i.uid });
    };
    for (const i of inv.worn()) push(i);
    for (const h of ['left', 'right'] as const) {
      const x = inv.held(h);
      if (x) push(x);
    }
    for (const b of inv.backItems()) push(b);
    for (const i of inv.onBelt()) push(i);
    for (const c of inv.containers()) for (const i of [...inv.strapped(c.uid), ...inv.children(c.uid)]) push(i);
    for (const s of this.spots()) for (const i of this.groundAt(s)) refs.push({ from: 'ground', x: s.x, y: s.y, uid: i.uid });
    return refs;
  }

  key(e: KeyboardEvent): boolean {
    if (e.code === 'Escape' || e.code === 'KeyI') {
      this.close();
      return true;
    }
    const list = this.order();
    const cur = this.state.selected;
    const i = cur ? list.findIndex((x) => x.uid === cur.uid) : -1;
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp' || e.code === 'KeyJ' || e.code === 'KeyK') {
      if (!list.length) return true;
      const d = e.code === 'ArrowDown' || e.code === 'KeyJ' ? 1 : -1;
      this.select(list[(i + d + list.length) % list.length]);
      return true;
    }
    const acts = this.actions();
    const find = (re: RegExp) => acts.find((a) => re.test(a.label) && !a.why);
    let a: ItemAction | undefined;
    if (e.code === 'KeyW') a = find(/^Wear|^Take off/);
    else if (e.code === 'KeyH') a = find(/^Hold in right|^Hold in both/) ?? find(/^Hold in left/);
    else if (e.code === 'KeyB') a = find(/^Carry on your back|^Sling across/);
    else if (e.code === 'KeyS') a = find(/^Strap to/);
    else if (e.code === 'KeyL') a = find(/^Hang on your belt/);
    else if (e.code === 'KeyD') a = find(/^Drop/);
    else if (e.code === 'KeyT' || e.code === 'KeyG' || e.code === 'Enter') a = find(/^Take$/) ?? (e.code === 'Enter' ? acts.find((x) => !x.why) : undefined);
    else if (e.code === 'KeyP') a = find(/^Put in your/);
    else if (e.code === 'KeyE') a = find(/^Eat$|^Drink$/);
    else return false;
    if (a) this.act(a);
    else if (cur) this.state.message = acts.find((x) => /^(Wear|Take|Hold|Carry|Hang|Drop|Put)/.test(x.label))?.why ?? 'That cannot be done with it.';
    return true;
  }
}
