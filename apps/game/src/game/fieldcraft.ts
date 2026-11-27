/**
 * Fieldcraft on the local map (docs/design/fieldcraft.md, stage 1): the skill menu, a fire
 * anywhere, and roasting.
 *
 * - **The skill menu.** A right-click on the local map asks what can be done at that tile, each
 *   thing with the skill it uses and, where it cannot be done, why not. Choosing a thing out of
 *   reach walks there first, round what is in the way, stopping if something comes up.
 * - **A fire anywhere** (Survival): on open ground out of doors, with flint and steel and wood: the
 *   firewood and sticks carried, else kindling and deadwood gathered about (a quarter of an hour;
 *   none where nothing grows). A fire is a small camp (game/camp.ts): it burns its fuel, warms,
 *   cooks, and can be made into a full camp (the camp screen tends it).
 * - **Roasting** (Cooking): beside a fire, the raw meat and game carried are roasted whole to carry
 *   and eat later; a fine roasting is a fine dish, a poor one charred, a failure half burnt away,
 *   and a fumble burnt to nothing.
 *
 * Proposed numbers, to tune in play.
 */
import { GROUND_TILES, OBJECT_TILES } from '@worldforge/core/local/tiles';
import { check, DC, type Grade } from '../actors/checks';
import { Health } from '../actors/health';
import { Inventory } from '../actors/items/inventory';
import { Needs } from '../actors/needs';
import { defOf, itemName, makeItem, type Item } from '../actors/items/item';
import { findPath } from '../world/paths';
import { CAMP_R, campable, rateSite, townAt, type CampData } from './camp';
import { bankFire, feedFire, lightFire, rakeFire } from './camping/fire';
import { stackFirewood } from './camping/pitch';
import type { CampCtx } from './camping/context';
import { FISH } from '../actors/data/fish';
import { fishIds } from '../actors/items/defs';
import type { PlaySession } from './session';
import { Trapping } from './trapping';
import { Woodcraft } from './woodcraft';
import { Fishing } from './fishing';

/** A thing that can be done at a tile, and why not, if it cannot. */
export interface TileAction {
  id: string;
  label: string;
  why?: string | null;
}

/** Fires to roast at (lit). */
const FIRES = new Set(['campfire', 'hearth', 'oven', 'brazier']);

/** What each raw food roasts into. */
export const ROASTS: Readonly<Record<string, string>> = {
  raw_meat: 'roast_meat',
  rabbit: 'roast_rabbit',
  // Fish (stage 4): gutted, or roasted whole and the poorer for it.
  ...Object.fromEntries(FISH.flatMap((f) => { const ids = fishIds(f.id); return [[ids.gutted, ids.roast], [ids.raw, ids.roast]]; })),
};

/** Minutes to roast: to set up the spit, and for each piece. */
const ROAST_MIN = 20, ROAST_EACH_MIN = 10;

/** How a roasting turns out: the dish's quality, and the share of it left. */
const ROASTED: Record<Grade, { quality: Item['quality']; keep: number; text: string }> = {
  fine: { quality: 'fine', keep: 1, text: 'roasted to a turn, crisp and juicy' },
  success: { quality: 'common', keep: 1, text: 'roasted through' },
  near: { quality: 'poor', keep: 1, text: 'roasted, if somewhat charred' },
  fail: { quality: 'poor', keep: 0.5, text: 'half burnt away before it is done' },
  fumble: { quality: 'poor', keep: 0, text: 'burnt to cinders' },
};

/** Kilograms of firewood a stout stick gives. */
const STICK_KG = 0.6;

export class Fieldcraft {
  constructor(private readonly s: PlaySession) {}

  private get g() {
    return this.s.game;
  }

  private get inv(): Inventory | undefined {
    return this.s.player?.get(Inventory);
  }

  /** The camp's context for the camping rules (game/camping/). */
  private ctx(): CampCtx | null {
    const a = this.s.player;
    if (!a) return null;
    return {
      game: this.g,
      actor: a,
      say: (t) => this.s.say(t),
      mood: (m, hours) => this.s.world.bus.send('actor.moodlet', { ...m, until: this.g.time + hours * 3600 }, { to: a.id }),
      season: () => (this.s.sky.snowCm >= 10 ? 'winter' : this.s.sky.season),
      sleep: (hours, quality, onHour) => this.s.sleep(hours, quality, { onHour }),
    };
  }

  /** Steps from the wanderer to a tile (king's moves). */
  private dist(x: number, y: number): number {
    return Math.max(Math.abs(x - this.g.px), Math.abs(y - this.g.py));
  }

  private objName(x: number, y: number): string {
    return OBJECT_TILES[this.g.map.objectAt(x, y, this.g.z)]?.name ?? 'none';
  }

  /** A lit fire at a tile or beside the wanderer. */
  private fireBeside(): [number, number] | null {
    const g = this.g;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (FIRES.has(this.objName(g.px + dx, g.py + dy))) return [g.px + dx, g.py + dy];
    return null;
  }

  /** The raw food carried that can be roasted. */
  roastable(): Item[] {
    return (this.inv?.d.items ?? []).filter((i) => ROASTS[i.def]);
  }

  /** What can be done at a tile, for the skill menu. */
  actions(x: number, y: number): TileAction[] {
    const g = this.g, s = this.s;
    if (s.state.mode !== 'local' || !g.map.loaded(x, y)) return [];
    const out: TileAction[] = [];
    const d = this.dist(x, y);
    const gd = GROUND_TILES[g.map.groundAt(x, y, g.z)];
    const on = this.objName(x, y);
    const outdoors = g.z === null && !!gd && !gd.name.startsWith('floor_');
    const seen = g.isVisible(x, y);
    if (d > 0 && g.map.passable(x, y)) out.push({ id: 'walk', label: 'Walk here' });
    // Fire: a camp's fire there, or a new one.
    const camp = g.z === null ? g.camps.at(x, y) : undefined;
    if (camp && camp.x === x && camp.y === y) {
      if (camp.fire.banked) out.push({ id: 'rake', label: 'Rake up the banked fire' });
      else if (camp.fire.lit) {
        out.push({ id: 'feed', label: 'Build up the fire', why: camp.wood < 0.5 && !this.fuelCarried() ? 'There is no wood stacked, and you carry none.' : null });
        out.push({ id: 'bank', label: 'Bank the fire' });
      }
      else out.push({ id: 'relight', label: 'Light the fire (Survival)', why: this.whyNoFireKit() });
      out.push({ id: 'camp', label: 'Tend the camp' });
    } else if (outdoors && !gd.water) {
      out.push({ id: 'fire', label: 'Light a fire here (Survival)', why: this.whyNoNewFire(x, y) });
    }
    // Roasting beside a fire.
    if (FIRES.has(on) || (camp && camp.x === x && camp.y === y && camp.fire.lit)) {
      const n = this.roastable().length;
      out.push({ id: 'roast', label: 'Roast the raw meat and game you carry (Cooking)', why: n ? null : 'You carry nothing raw to roast.' });
    }
    // Gathering about it, tracks on it, a snare on it, water.
    if (outdoors) out.push({ id: 'gather', label: 'Gather sticks and stones (Survival)' });
    if (seen && g.tracksText(x, y, g.z)) out.push({ id: 'tracks', label: 'Read the tracks (Tracking)' });
    if (seen && s.hunt.beastTrack(x, y)) out.push({ id: 'follow', label: 'Follow the trail (Tracking)' });
    if (outdoors && !gd.water && g.map.passable(x, y)) out.push({ id: 'snare', label: s.snares.at(x, y) ? 'Take up the snare' : 'Set a snare here (Trapping)', why: s.snares.at(x, y) || this.inv?.d.items.some((i) => i.def === 'snares') ? null : 'You have no snare wire.' });
    if (gd?.water || on === 'well' || on === 'fountain') {
      out.push({ id: 'drink', label: 'Drink, and fill your waterskins' });
      out.push({ id: 'wash', label: 'Wash' });
    }
    // Felling and stakes (game/woodcraft.ts), pits and fences (game/trapping.ts; stage 3).
    out.push(...s.wood.actions(x, y), ...s.traps.actions(x, y), ...s.fishing.actions(x, y));
    return out;
  }

  /** Does a thing at a tile, walking there first if need be. */
  async act(id: string, x: number, y: number): Promise<void> {
    const s = this.s, g = this.g;
    // Onto the tile itself for a snare or a walk; beside it for the rest.
    const onto = id === 'walk' || id === 'snare' || id === 'stakes' || id === 'gut' || id === 'fishspear';
    if (id !== 'tracks' && id !== 'follow' && !(await this.reach(x, y, onto))) return;
    if (Woodcraft.IDS.has(id)) await s.wood.act(id, x, y);
    if (Trapping.IDS.has(id)) await s.traps.act(id, x, y);
    if (Fishing.IDS.has(id)) await s.fishing.act(id, x, y);
    switch (id) {
      case 'walk':
        break;
      case 'fire':
        await this.newFire(x, y);
        break;
      case 'relight':
      case 'feed': {
        const c = this.ctx(), camp = g.camps.at(x, y);
        if (!c || !camp) return;
        stackFirewood(c, camp);
        this.burnSticks(camp);
        s.say((id === 'feed' ? feedFire(c, camp) : lightFire(c, camp)).text);
        break;
      }
      case 'camp':
        s.host.showCamp?.();
        break;
      case 'bank':
      case 'rake': {
        const c = this.ctx(), camp = g.camps.at(x, y);
        if (!c || !camp) return;
        s.say((id === 'bank' ? bankFire(c, camp) : rakeFire(c, camp)).text);
        break;
      }
      case 'roast':
        await this.roast();
        break;
      case 'gather':
        s.gather();
        break;
      case 'follow':
        await s.hunt.follow(x, y);
        break;
      case 'tracks':
        s.say(g.tracksText(x, y, g.z) || 'You make out no tracks there.');
        break;
      case 'snare':
        s.snareHere();
        break;
      case 'drink':
        s.drinkHere();
        break;
      case 'wash':
        s.washHere();
        break;
    }
    g.updateHud();
    g.refresh();
    s.redraw();
  }

  /**
   * Walks to a tile (`onto`) or beside it, on a way found round what is in the way: step by step,
   * stopping if a step cannot be taken. Returns whether the wanderer got there.
   */
  /** A walk under way (the skill menu's): stopped by any key or click. */
  private walking: { cancel: boolean } | null = null;
  /** Milliseconds between the steps of a walk, so that each is seen (none in the tests). */
  stepMs = 110;

  /** Whether a walk or a spell of work is under way. */
  get busy(): boolean {
    return !!this.walking;
  }

  /** Game seconds a step of work (longer for a long spell, so that it does not drag), and the least milliseconds a step is shown (none when walks take none: the tests). */
  static stepFor(seconds: number): number {
    return seconds > 4 * 3600 ? 300 : seconds > 90 * 60 ? 120 : 60;
  }
  workMs = 35;
  /** Work begun and stopped part way, to go on with (by what and where: "dig:12,40"), in game seconds done. */
  readonly progress = new Map<string, number>();

  /**
   * A spell of work taking game time (fieldcraft.md, from play, 27 November 2026): a minute at a
   * time (two or five in a long spell), the world going on about the wanderer and shown, until it is done, `each` says to stop,
   * the player stops it (any key or click), or danger does (a beast or a person set on harm close
   * by, hunger, thirst, cold or weariness past bearing, bleeding, falling senseless). Work with a
   * `key` stopped part way is kept, to go on with later from where it was left.
   */
  async work(seconds: number, label: string, o: { key?: string; each?: (done: number) => boolean | void } = {}): Promise<{ done: boolean; spent: number; why: string | null }> {
    const g = this.g, s = this.s;
    this.cancelWalk();
    const job = { cancel: false };
    this.walking = job;
    const from = o.key ? Math.min(seconds, this.progress.get(o.key) ?? 0) : 0;
    let done = from, why: string | null = null, stopped = false;
    g.hud.task = label;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const pause = (ms: number) => new Promise<void>((r) => (this.stepMs > 0 && ms > 0 ? setTimeout(r, ms) : this.stepMs > 0 ? setTimeout(r, 0) : r()));
    const per = Fieldcraft.stepFor(seconds);
    try {
      while (done < seconds) {
        const t0 = now();
        const step = Math.min(per, seconds - done);
        g.time += step;
        g.activity = 'work';
        done += step;
        g.updateHud();
        s.redraw();
        if (o.each?.(done) === false) {
          stopped = true;
          break;
        }
        why = this.danger();
        if (why || job.cancel || s.state.dead) break;
        // Shown at least so long; a step that took longer to work out is not held back more.
        await pause(this.workMs - (now() - t0));
        if (job.cancel) break;
      }
    } finally {
      if (this.walking === job) this.walking = null;
      g.hud.task = null;
    }
    const finished = done >= seconds || stopped;
    if (o.key) {
      if (finished) this.progress.delete(o.key);
      else this.progress.set(o.key, done);
    }
    if (!finished) {
      const mins = Math.round((done - from) / 60);
      s.say(`${why ? `${why} ` : ''}You stop after ${mins >= 90 ? `${Math.round(mins / 30) / 2} hours` : `${mins} minute${mins === 1 ? '' : 's'}`}${o.key ? '; the work can be taken up again where you left it' : ''}.`);
    }
    return { done: finished, spent: done - from, why };
  }

  /**
   * What makes the wanderer stop work: a beast fighting or one that could hurt them close by and
   * seen, a person fighting them, hunger, thirst, cold or weariness past bearing, bad bleeding.
   */
  danger(): string | null {
    const g = this.g, s = this.s;
    if ([...s.people.all()].some((r) => r.fight?.foe === 'player' && Math.max(Math.abs(r.x - g.px), Math.abs(r.y - g.py)) <= 12)) return 'You are set upon!';
    if (g.z === null) for (const b of s.fauna.all()) {
      const d = Math.hypot(b.x - g.px, b.y - g.py);
      if (b.fight || (d <= 10 && g.isVisible(b.x, b.y) && !b.health?.dead && (b.s.temper === 'aggressive' || (b.s.diet === 'predator' && b.s.size !== 'small' && b.s.size !== 'tiny')))) return `A ${b.s.name} is close by.`;
    }
    const n = s.player?.get(Needs), h = s.player?.get(Health);
    if (h && (h.bleeding() > 150 || h.senseless())) return 'You are bleeding badly.';
    if (n) {
      if (n.d.fatigue >= 95) return 'You are worn out.';
      if (n.d.heat <= -45) return 'You are chilled through.';
      if (n.d.hydrated < 15) return 'You are parched.';
      if (n.d.nourish < 15 && n.d.stomachKcal < 50) return 'You are faint with hunger.';
    }
    return null;
  }

  /** Stops a walk under way (a key pressed, a click). */
  cancelWalk(): void {
    if (this.walking) this.walking.cancel = true;
  }

  /**
   * Walks to a tile (`onto`) or beside it, on a way found round what is in the way: a step at a
   * time, each shown, stopping if a step cannot be taken, `stop` says so, or the player stops it.
   * Returns whether the wanderer got there.
   */
  async reach(x: number, y: number, onto: boolean, stop?: () => boolean): Promise<boolean> {
    const g = this.g;
    const there = () => (onto ? g.px === x && g.py === y : this.dist(x, y) <= 1);
    if (there()) return true;
    this.cancelWalk();
    // The tile itself, or the open tiles about it, nearest the wanderer first.
    const goals: [number, number][] = [];
    if (g.map.passableAt(x, y, g.z)) goals.push([x, y]);
    if (!onto) {
      const about: [number, number, number][] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && g.map.passableAt(x + dx, y + dy, g.z)) about.push([x + dx, y + dy, Math.hypot(x + dx - g.px, y + dy - g.py)]);
      goals.push(...about.sort((a, b) => a[2] - b[2]).map(([a, b]): [number, number] => [a, b]));
    }
    const job = { cancel: false };
    this.walking = job;
    const pause = () => new Promise<void>((r) => (this.stepMs > 0 ? setTimeout(r, this.stepMs) : r()));
    try {
      for (const [gx, gy] of goals.slice(0, 4)) {
        const path = findPath(g.map, { x: g.px, y: g.py, z: g.z }, { x: gx, y: gy, z: g.z }, 4000);
        if (!path) continue;
        for (const st of path) {
          if (st.z !== g.z || job.cancel || this.s.state.dead) break;
          const dx = st.x - g.px, dy = st.y - g.py;
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) break;
          // A shut door on the way is opened by walking into it, and then walked through.
          if (!g.move(dx, dy)) break;
          if (g.px !== st.x || g.py !== st.y) {
            if (!g.move(dx, dy) || g.px !== st.x || g.py !== st.y) break;
          }
          g.refresh();
          this.s.redraw();
          if (there() || stop?.()) break;
          await pause();
        }
        if (there() || stop?.() || job.cancel) return there();
        break;
      }
      if (!there()) g.say('You cannot find a way there.');
      return there();
    } finally {
      if (this.walking === job) this.walking = null;
    }
  }

  // ---- Fire ----------------------------------------------------------------------------------------

  private fuelCarried(): boolean {
    return !!this.inv?.d.items.some((i) => i.def === 'firewood' || i.def === 'stick');
  }

  private whyNoFireKit(): string | null {
    return this.inv?.d.items.some((i) => i.def === 'flint') ? null : 'You have nothing to light a fire with.';
  }

  /** Why a new fire cannot be made at a tile, or null. */
  whyNoNewFire(x: number, y: number): string | null {
    const g = this.g;
    if (g.z !== null) return 'Fires are for making out of doors, on the ground.';
    const town = townAt(g, x, y);
    if (town) return `No fires are made in the streets of ${town.name}: go beyond its walls.`;
    if (!campable(g, x, y)) return 'There is no room for a fire there: it needs open, dry ground off the road.';
    if (g.camps.list.some((c) => Math.max(Math.abs(c.x - x), Math.abs(c.y - y)) <= CAMP_R)) return 'You have a fire-place close by already.';
    const kit = this.whyNoFireKit();
    if (kit) return kit;
    if (!this.fuelCarried() && rateSite(g, x, y).wood < 0.05) return 'There is nothing here to burn, and you carry no wood.';
    return null;
  }

  /** Puts the sticks carried on a camp's woodpile. */
  private burnSticks(camp: CampData): void {
    const inv = this.inv;
    if (!inv) return;
    for (const it of [...inv.d.items]) if (it.def === 'stick') {
      camp.wood += STICK_KG * it.qty;
      inv.drop(it.uid);
    }
    this.g.camps.showWood(this.g, camp);
  }

  /** Makes a fire at a tile: a small camp, with the wood carried or gathered about, and lights it. */
  private async newFire(x: number, y: number): Promise<void> {
    const why = this.whyNoNewFire(x, y), c = this.ctx();
    if (why || !c) {
      if (why) this.s.say(why);
      return;
    }
    const g = this.g;
    const site = rateSite(g, x, y);
    // Kindling and deadwood from about the place, first, if too little is carried.
    const carried = (this.inv?.d.items ?? []).reduce((kg, i) => kg + (i.def === 'firewood' ? 3 * i.qty : i.def === 'stick' ? STICK_KG * i.qty : 0), 0);
    const gather = carried < 2 && site.wood >= 0.05;
    if (gather && !(await this.work(15 * 60, 'Gathering kindling and deadwood')).done) return;
    const camp = g.camps.make(g, x, y, site);
    stackFirewood(c, camp);
    this.burnSticks(camp);
    if (gather) {
      const r = check(c.actor, 'survival', { difficulty: DC.trivial + Math.round((1 - site.wood) * 20), now: g.time });
      const kg = Math.round(({ fine: 4, success: 3, near: 2, fail: 1.2, fumble: 0.6 } as Record<Grade, number>)[r.grade] * (0.4 + 0.6 * site.wood) * 10) / 10;
      camp.wood += kg;
      g.camps.showWood(g, camp);
    }
    const r = lightFire(c, camp);
    this.s.say(r.ok ? `You make a fire here. ${r.text}` : `You lay a fire here, but cannot get it to light. ${r.text}`);
  }

  // ---- Roasting --------------------------------------------------------------------------------------

  /** Roasts the raw food carried at a fire beside: each piece by a Cooking check. */
  async roast(): Promise<void> {
    const g = this.g, a = this.s.player, inv = this.inv;
    if (!a || !inv) return;
    if (!this.fireBeside() && !g.camps.at(g.px, g.py)?.fire.lit) {
      g.say('You need a fire to roast over.');
      return;
    }
    const list = this.roastable();
    if (!list.length) {
      g.say('You carry nothing raw to roast.');
      return;
    }
    const pieces = list.reduce((n, it) => n + it.qty, 0);
    if (!(await this.work((ROAST_MIN + ROAST_EACH_MIN * Math.min(pieces, 10)) * 60, 'Roasting at the fire')).done) return;
    const said: string[] = [];
    for (const it of list) {
      const r = check(a, 'cooking', { difficulty: DC.easy, now: g.time });
      const how = ROASTED[r.grade];
      const name = itemName(it);
      inv.drop(it.uid);
      const keep = how.keep >= 1 ? it.qty : Math.floor(it.qty * how.keep);
      const uses = it.uses ?? defOf(it).uses;
      if (keep > 0 || (how.keep > 0 && (uses ?? 1) > 1)) {
        // A fish roasted ungutted is the poorer for it.
        const whole = /^fish_/.test(it.def);
        const out = makeItem(ROASTS[it.def], { qty: Math.max(1, keep), quality: whole && how.quality !== 'poor' ? (how.quality === 'fine' ? 'common' : 'poor') : how.quality });
        if (it.kg !== undefined) out.kg = Math.round(it.kg * 0.75 * 100) / 100;
        if (it.qty === 1 && how.keep < 1 && uses) out.uses = Math.max(1, Math.floor(uses * how.keep));
        else if (uses !== undefined && it.qty === 1) out.uses = uses;
        if (inv.stow(out)) g.ground.put(g.px, g.py, [out]);
      }
      said.push(`the ${name}, ${how.text}`);
    }
    this.s.say(`You roast ${said.join('; ')}.`);
    this.s.player?.changed();
  }
}
