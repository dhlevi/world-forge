/**
 * Skills at work on the map and the road (actors/checks.ts): what the wanderer does calls for
 * checks now and then, and each check teaches a little.
 *
 * - **Swimming:** every two minutes in deep water, harder with a load and in the cold. A failure
 *   costs breath and strength; a fumble more. (Skill also eases the cost of swimming, needs.ts.)
 * - **Athletics:** every hour of going laden or worn out, and at each ford. A failure tires; a
 *   fine success finds a stride. (Skill also eases the cost of a load, needs.ts.)
 * - **Climbing:** at each steep step of a journey. A failure slows the step; a fumble is a fall.
 * - **Survival:** sleeping rough (a better or worse bed of it), and searching for water.
 * - **Wear:** boots and shoes wear with the distance walked (mending them is the inventory's).
 *
 * Messages are kept few: successes pass quietly, and like failures are told at most once an hour.
 */
import type { Actor } from '../actors/actor';
import type { MessageDispatcher } from '../engine/messages';
import type { Game } from './game';
import type { RouteStep } from '../worker/protocol';
import { check, DC, type Mod } from '../actors/checks';
import { Skills, type Activity, type Moodlet } from '../actors/components';
import { Needs } from '../actors/needs';
import { Inventory } from '../actors/items/inventory';
import { conditionWord, defOf, itemName, type Item } from '../actors/items/item';
import { GROUND_TILES, OBJECT_TILES } from '@worldforge/core/local/tiles';
import { TILE_M } from '@worldforge/core/local/chunk';
import { STEP_M } from '@worldforge/core/local/travel';
import { bearing, compassWord } from '../util';

/** Seconds of swimming between checks, and of hard going. */
const SWIM_EVERY = 120, HARD_EVERY = 3600;
/** A pair of boots lasts this far (m) at common quality, before mending. */
const BOOT_LIFE_M = 1_500_000;
const QUALITY_WEAR: Record<string, number> = { poor: 1.5, common: 1, fine: 0.7, masterwork: 0.5 };
/** Steps at least this steep (rise over run) call for climbing. */
export const STEEP = 0.2;

export class Practice {
  private swimS = 0;
  private hardS = 0;
  /** When each kind of message was last told (game seconds). */
  private told = new Map<string, number>();

  constructor(private who: () => Actor | null, private bus: MessageDispatcher, private game: Game) {}

  private get actor() {
    return this.who();
  }
  private say(t: string): void {
    this.game.say(t);
  }
  /** Says something at most once an hour of a kind. */
  private sayOnce(kind: string, t: string): void {
    const last = this.told.get(kind);
    if (last !== undefined && this.game.time - last < 3600) return;
    this.told.set(kind, this.game.time);
    this.say(t);
  }
  private mood(m: Moodlet): void {
    const a = this.actor;
    if (a) this.bus.send('actor.moodlet', m, { to: a.id });
  }
  private loadMods(load: number): Mod[] {
    return load > 1.02 ? [{ why: 'your load', value: -Math.round((load - 1) * 40) }] : [];
  }

  /** What the skills have noticed (getting better, rust), for the log. */
  flush(): void {
    for (const n of this.actor?.get(Skills)?.takeNotes() ?? []) this.say(n.text);
  }

  /** After time passes on the local map: swimming, hard going, and wear on the feet. */
  time(dt: number, activity: Activity, load: number): void {
    const a = this.actor, n = a?.get(Needs);
    if (!a || !n || dt <= 0) return;
    const now = this.game.time;
    if (activity === 'swim') {
      this.swimS += dt;
      while (this.swimS >= SWIM_EVERY) {
        this.swimS -= SWIM_EVERY;
        const cold = n.d.airC < 10 ? [{ why: 'the cold water', value: -10 }] : [];
        const r = check(a, 'swimming', { difficulty: DC.easy - 10, mods: [...this.loadMods(load), ...cold], now });
        const P = n.pools();
        if (r.grade === 'fumble') {
          if (P) P.physBurst.value = Math.max(0, P.physBurst.value * 0.4);
          n.d.fatigue = Math.min(140, n.d.fatigue + 4);
          this.say('You go under, and come up choking.');
        } else if (!r.ok) {
          if (P) P.physBurst.value = Math.max(0, P.physBurst.value - 15);
          this.sayOnce('swim', load > 1.3 ? 'Your load drags at you; you struggle to keep your head up.' : 'You struggle to keep your head above the water.');
        }
      }
    } else this.swimS = 0;
    if (activity === 'walk' || activity === 'travel') {
      if (activity === 'walk') this.wearFeet(dt * 1.25);
      if (load > 1.1 || n.tiredness() >= 65) {
        this.hardS += dt;
        while (this.hardS >= HARD_EVERY) {
          this.hardS -= HARD_EVERY;
          this.hardGoing(load);
        }
      }
    }
  }

  private hardGoing(load: number): void {
    const a = this.actor!, n = a.get(Needs)!;
    const r = check(a, 'athletics', { difficulty: DC.easy + Math.round((load - 1) * 60), now: this.game.time, noBody: true, mods: n.tiredness() >= 85 ? [{ why: 'worn out', value: -10 }] : [] });
    if (r.grade === 'fine') {
      n.d.fatigue = Math.max(0, n.d.fatigue - 2);
      this.sayOnce('stride', 'You find your stride.');
    } else if (r.grade === 'fumble') {
      n.d.fatigue = Math.min(140, n.d.fatigue + 6);
      this.mood({ id: 'turned-ankle', text: 'Turned an ankle', value: -2, until: this.game.time + 12 * 3600 });
      this.say('You turn your ankle on the rough going.');
    } else if (!r.ok) {
      n.d.fatigue = Math.min(140, n.d.fatigue + 3);
      this.sayOnce('hard', load > 1.1 ? 'The going under your load wears you down.' : 'Every step is an effort.');
    }
  }

  /** A step of a journey: fords and steep ground. Returns extra seconds it took. */
  travelStep(st: RouteStep, load: number): number {
    const a = this.actor, n = a?.get(Needs);
    if (!a || !n) return 0;
    const now = this.game.time;
    let extra = 0;
    this.wearFeet(STEP_M);
    if (st.ford) {
      const r = check(a, 'athletics', { difficulty: DC.trivial + 5, mods: this.loadMods(load), now });
      if (!r.ok && r.grade !== 'near') {
        n.d.heat = Math.max(-100, n.d.heat - 15);
        extra += r.grade === 'fumble' ? 1200 : 600;
        this.say(r.grade === 'fumble' ? 'You are swept off your feet in the ford, and drag yourself out soaked and shaken.' : 'You lose your footing in the ford and are soaked through.');
        if (r.grade === 'fumble') this.mood({ id: 'soaked', text: 'Soaked in a river', value: -2, until: now + 6 * 3600 });
      }
    }
    if ((st.slope ?? 0) >= STEEP) {
      const r = check(a, 'climbing', { difficulty: DC.easy + Math.round(((st.slope ?? 0) - STEEP) * 150), mods: this.loadMods(load), now });
      const P = n.pools();
      if (r.grade === 'fumble') {
        extra += st.min * 60;
        n.d.fatigue = Math.min(140, n.d.fatigue + 3);
        if (P) P.physBurst.value = Math.max(0, P.physBurst.value - 25);
        this.mood({ id: 'fall', text: 'Took a fall', value: -2, until: now + 12 * 3600 });
        const torn = this.tear();
        this.say(`You slip on the steep ground and fall${torn ? `, tearing your ${torn}` : ''}.`);
      } else if (!r.ok) {
        extra += st.min * 30;
        if (P) P.physBurst.value = Math.max(0, P.physBurst.value - 8);
        this.sayOnce('steep', 'The ground is steep, and you pick your way slowly.');
      }
    }
    return extra;
  }

  /** A fall tears the outermost thing worn on the body or legs. */
  private tear(): string {
    const inv = this.actor?.get(Inventory);
    const it = inv?.worn().filter((i) => defOf(i).durable !== false && defOf(i).wear?.regions?.some((r) => r === 'torso' || r === 'legs')).pop();
    if (!it) return '';
    it.condition = Math.max(0, it.condition - 8);
    return itemName(it);
  }

  private wearFeet(m: number): void {
    const inv = this.actor?.get(Inventory);
    for (const it of inv?.worn() ?? []) {
      const d = defOf(it);
      if (d.durable === false || !d.wear?.regions?.includes('feet') || d.wear.layer === 'under') continue;
      const before = it.condition;
      it.condition = Math.max(0, it.condition - (m / BOOT_LIFE_M) * 100 * (QUALITY_WEAR[it.quality] ?? 1));
      const w0 = conditionWord(before), w1 = conditionWord(it.condition);
      if (w0 !== w1 && (w1 === 'worn' || w1 === 'damaged' || w1 === 'nearly ruined' || w1 === 'ruined')) this.say(this.footNote(it, w1));
    }
  }
  private footNote(it: Item, w: string): string {
    const name = itemName(it);
    return w === 'worn' ? `Your ${name} are showing wear.` : w === 'damaged' ? `Your ${name} are wearing thin.` : w === 'ruined' ? `Your ${name} have worn through.` : `Your ${name} are nearly worn through.`;
  }

  /** Sleeping rough: Survival makes a better (or worse) bed of it. Returns the quality. */
  roughSleep(quality: number): number {
    const a = this.actor, n = a?.get(Needs);
    if (!a || quality >= 1) return quality;
    const cold = (n?.d.airC ?? 15) < 5 ? [{ why: 'the cold', value: -10 }] : [];
    const r = check(a, 'survival', { difficulty: DC.easy, mods: cold, now: this.game.time });
    const delta = { fine: 0.2, success: 0.1, near: 0, fail: 0, fumble: -0.1 }[r.grade];
    if (r.grade === 'fine') this.say('You find a sheltered hollow and make a good bed of it.');
    else if (r.grade === 'success') this.say('You find a fair place to lie, out of the wind.');
    else if (r.grade === 'fumble') this.say('You choose a poor spot: stones and roots all night.');
    return Math.max(0.2, Math.min(0.95, quality + delta));
  }

  /** Searching about for water (Survival): twenty minutes, and a direction if anything is found. */
  findWater(): void {
    const a = this.actor;
    if (!a) return;
    const g = this.game;
    g.time += 20 * 60;
    const r = check(a, 'survival', { difficulty: DC.easy + 5, now: g.time });
    const reach = { fine: 220, success: 140, near: 60, fail: 0, fumble: 0 }[r.grade];
    const at = reach ? this.nearestWater(reach) : null;
    if (at) {
      const dx = at[0] - g.px, dy = at[1] - g.py;
      const m = Math.round((Math.hypot(dx, dy) * TILE_M) / 10) * 10;
      // Map rows run south: north is -y.
      const dir = compassWord(bearing(dx, -dy));
      g.say(`You look for signs of water, and find ${at[2]} about ${m} m to the ${dir}.`);
    } else g.say(r.ok ? 'You search the land about, but there is no water within reach.' : 'You search about, but find no sign of water.');
    g.updateHud();
  }

  /** The nearest water in reach (tiles), searched in rings outward over what has been made of the map. */
  private nearestWater(reach: number): [number, number, string] | null {
    const g = this.game, map = g.map;
    for (let rad = 2; rad <= reach; rad++) {
      let best: [number, number, string] | null = null, bd = Infinity;
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
        const x = g.px + dx, y = g.py + dy;
        if (!map.loaded(x, y)) continue;
        const od = OBJECT_TILES[map.object(x, y)];
        const what = od?.name === 'well' ? 'a well' : od?.name === 'fountain' ? 'a fountain' : GROUND_TILES[map.ground(x, y)]?.water ? 'water' : '';
        const d = dx * dx + dy * dy;
        if (what && d < bd) {
          bd = d;
          best = [x, y, what];
        }
      }
      if (best) return best;
    }
    return null;
  }
}
