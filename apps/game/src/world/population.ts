/**
 * The people of the bubble about the wanderer (docs/design/npcs.md, How much is simulated; Time;
 * Stage 1): the residents the worker finds with their day plans (worker/people.ts), each made an
 * Actor (who they are, their looks, their belongings) when first met, and kept while they stay near.
 *
 * **The agents' queue.** After each of the wanderer's actions the clock has moved on, and each
 * person acts up to the new time: when their plan's block changes they set out for its place.
 * - Near the wanderer (within ACTIVE tiles) or in sight, they walk tile by tile on a path (world/
 *   paths.ts): a step 1.2 s, a diagonal 1.7 s, a door 2 s to open (and shut behind them), a stair
 *   3 s; they wait for, or step round, whoever is in the way, and a person standing about steps
 *   aside for them.
 * - Farther off, out of sight, they move in one go: they arrive when the walk would have taken
 *   them there (about a step a tile), so long as neither end is in sight.
 * - Rain sends those bound for the square or the fields home; the plans themselves keep people
 *   indoors after dark (core people/routine.ts).
 * - Those whose place lies beyond the bubble walk off out of sight and are gone; those coming in
 *   appear out of sight and walk in.
 *
 * Nothing is ever seen to happen that could not: a person in sight is never moved but by walking,
 * and appears or vanishes only out of sight.
 */
import { CULTURES } from '@worldforge/core/names/cultures';
import { WEAR_SHAPE, type FigureSpec } from '@worldforge/core/local/figures';
import { GROUND_TILES, OBJECT_TILES, objectId, type Facing } from '@worldforge/core/local/tiles';
import { blockAt } from '@worldforge/core/people/routine';
import { Actor } from '../actors/actor';
import { Body, Identity, type StandingId } from '../actors/components';
import { figureOf } from '../game/figure';
import type { PlacedPerson, PlanStop, Spot } from '../worker/protocol';
import { belongingsOf } from './belongings';
import { Inventory } from '../actors/items/inventory';
import { makeItem } from '../actors/items/item';
import { ITEM } from '../actors/items/defs';
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import { findPath, OPENABLE, walkable, type PathMap, type Step } from './paths';
import { LOUD, Tracks, heardLevel, hearingThreshold, takesTracks, type Noise, type NoiseKind } from './senses';
import { Opinions } from './opinions';

/** Within this many tiles of the wanderer, people walk tile by tile. */
export const ACTIVE = 40;
/** At most this many walk tile by tile at once (the nearest); the rest move in one go out of sight. */
export const MAX_WALKERS = 150;
/** Seconds a step takes: straight, on the slant, through a door, up or down a stair. */
const STEP_S = 1.2, DIAG_S = 1.7, DOOR_S = 2, STAIR_S = 3;
/** Seconds to wait for someone in the way before trying again, and how many tries before going round. */
const WAIT_S = 1.5, WAITS = 3;
/** A way longer than this (tiles) is walked in legs of this length. */
const LEG = 30;
/** Tiles looked at, at most, in finding one path. */
const PATH_LIMIT = 4000;
/** Paths found at most per run of the queue. */
const PATHS_PER_RUN = 8;
/** A clock jump longer than this (sleeping, a long wait) puts the people out of sight where their plans have them at once. */
const JUMP_S = 600;
/** At most so many steps per person per action (a long wait in sight is walked in part). */
const MAX_STEPS = 400;

/** What the people need of the game: the wanderer, the clock, sight, and the map. */
export interface PopulationView {
  px: number;
  py: number;
  z: number | null;
  time: number;
  isVisible(x: number, y: number): boolean;
  map: PathMap & {
    groundAt(x: number, y: number, z: number | null): number;
    setObjectAt(x: number, y: number, z: number | null, id: number): void;
    transparentAt(x: number, y: number, z: number | null): boolean;
  };
}

/** A resident in the bubble. */
export interface Resident {
  p: PlacedPerson;
  actor: Actor;
  /** On the map (false: away beyond the bubble, or yet to come in). */
  present: boolean;
  x: number;
  y: number;
  z: number | null;
  facing: Facing;
  /** What they are about, for drawing and for looking at them: 'asleep', 'walking', or the block's act. */
  where: string;
  /** Their figure for where they are (dressed for bed, the cloak left off indoors). */
  figure: FigureSpec;
  /** Where their plan has them now (null: beyond the bubble; undefined: not yet looked at). */
  want: Spot | null | undefined;
  /** Where they are going (the plan's place, or a free tile beside it), the block it is for, and the way there. */
  goal: Spot | null;
  stop: PlanStop | null;
  path: Step[] | null;
  /** Game time at which they next act; when a move in one go lands. */
  nextAt: number;
  eta: number;
  /** A door they opened and will shut behind them. */
  door: Spot | null;
  waits: number;
  /** Ways round tried and not found, in a row. */
  stuck: number;
  /** No path was found to the place they are going: they move in one go, out of sight. */
  noPath: boolean;
  /** The last errand they bought on (day and block), so that one errand buys once. */
  bought?: string;
  /** When they next make the noise of their work (game seconds). */
  noiseAt?: number;
  /** When they last greeted the wanderer, or stirred in their sleep (game seconds). */
  greetedAt?: number;
  stirredAt?: number;
  /** The tile out of sight they walk to on leaving the bubble, or come in from. */
  exit: Spot | null;
  /** Gone from the bubble for good (to be dropped once out of sight). */
  gone: boolean;
}

/** Noisy work: the trade, its loudness a tile away, and the noise in words. */
const NOISY: [RegExp, number, string][] = [
  [/smith|founder/, LOUD.hammer, 'hammering on an anvil'], [/cooper/, 65, 'the knock of a mallet on staves'],
  [/carpenter|joiner|wheelwright|shipwright|boatwright|sawyer/, 60, 'sawing and hammering'], [/mason/, 60, 'the chink of a chisel on stone'],
  [/hawker/, LOUD.shout, 'a hawker crying their wares'], [/tavern|innkeeper|tapster/, 55, 'voices and laughter'], [/weaver/, 50, 'the clack of a loom'],
];

/** Standing by means, for a resident's Identity. */
const STANDING: Record<PlacedPerson['means'], StandingId> = { destitute: 'peasant', poor: 'peasant', middling: 'townsfolk', comfortable: 'craftsman', rich: 'merchant' };
const OUTDOOR = new Set(['out', 'square']);
const DIRS8: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];

const tileKey = (x: number, y: number, z: number | null) => `${x},${y},${z ?? 'g'}`;
const same = (a: Spot | null, b: Spot | null) => !!a && !!b && a.x === b.x && a.y === b.y && a.z === b.z;
const cheb = (a: { x: number; y: number }, x: number, y: number) => Math.max(Math.abs(a.x - x), Math.abs(a.y - y));

export class Population {
  private byId = new Map<string, Resident>();
  private byTile = new Map<string, Resident>();
  /** The last asking: where, for which day, and the reach of the bubble given. */
  private asked: { x: number; y: number; day: number; radius: number } | null = null;
  private busy = false;
  private lastRun = -1;
  /** Paths still to be found in this run. */
  private pathBudget = 0;
  /** Paths looked for, and not found, since the start (for the tests' and the diagnostics' counts). */
  searched = 0;
  failed = 0;
  /** The first paths not found: from, to, and the block's place (for diagnostics). */
  readonly fails: [Spot, Spot, string][] = [];
  /** Whether it is raining (set by the session from the sky); whether the ground is wet (it takes more tracks). */
  raining = false;
  wet = false;
  /** What the wanderer has made of the people met (world/opinions.ts), and the tracks in the bubble (world/senses.ts). */
  readonly opinions = new Opinions();
  readonly tracks = new Tracks();
  /** Noises made by the people since the session last listened (world/senses.ts). */
  noises: Noise[] = [];
  /** Whether an animal stands on a tile (world/fauna.ts), and shooing it off. */
  animalAt: (x: number, y: number, z: number | null) => boolean = () => false;
  shoo: (x: number, y: number, z: number | null) => void = () => {};
  /** What is seen to happen among them, for the log (a greeting, a sleeper stirring). */
  onSee: (text: string) => void = () => {};
  /** Greetings between people, by pair, the day they last met. */
  private greeted = new Map<string, number>();
  /** Residents by full name (for finding the people in one another's ties). */
  private byName = new Map<string, Resident>();
  /** The day's sunrise and sunset (hours), for the plans. */
  sun = { rise: 6, set: 18 };
  /** Called when the people shown may have changed. */
  onChange: () => void = () => {};

  constructor(
    private ask: (x: number, y: number, time: number, rise: number, set: number) => Promise<{ people: PlacedPerson[]; radius: number }>,
    private seed: string,
  ) {}

  /** The resident on a tile and floor, if any. */
  at(x: number, y: number, z: number | null): Resident | null {
    return this.byTile.get(tileKey(x, y, z)) ?? null;
  }

  /** Everyone on the map, as shown. */
  *all(): Iterable<Resident> {
    for (const r of this.byId.values()) if (r.present) yield r;
  }

  /** Everyone known, on the map or away. */
  everyone(): Iterable<Resident> {
    return this.byId.values();
  }

  get size(): number {
    return this.byId.size;
  }

  /** Forgets everyone (the wanderer has left the local map). */
  clear(): void {
    this.byId.clear();
    this.byTile.clear();
    this.asked = null;
    this.lastRun = -1;
  }

  /**
   * After each action: everyone acts up to the game's time, and the worker is asked again for the
   * bubble's people when the wanderer has gone far enough, or a new day has begun.
   */
  update(g: PopulationView): void {
    if (this.run(g)) this.onChange();
    const day = Math.floor(g.time / 86400), a = this.asked;
    if (this.busy) return;
    if (a && a.day === day && Math.max(Math.abs(g.px - a.x), Math.abs(g.py - a.y)) < Math.max(8, a.radius / 4)) return;
    this.busy = true;
    const at = { x: g.px, y: g.py, day };
    this.ask(g.px, g.py, g.time, this.sun.rise, this.sun.set)
      .then((res) => {
        this.asked = { ...at, radius: res.radius };
        this.take(res.people, g);
        this.onChange();
      })
      .catch((err: unknown) => console.warn('people', err))
      .finally(() => {
        this.busy = false;
      });
  }

  /** Takes the worker's people: new ones placed (out of sight), known ones given their new plans, the rest sent off. */
  take(list: PlacedPerson[], g: PopulationView): void {
    const seen = new Set<string>();
    for (const p of list) {
      seen.add(p.id);
      const r = this.byId.get(p.id);
      if (r) {
        r.p = p;
        r.gone = false;
        continue;
      }
      const actor = this.actorOf(p);
      const nr: Resident = {
        p, actor, present: false, x: 0, y: 0, z: null, facing: p.facing, where: 'home', figure: figureOf(actor),
        want: undefined, goal: null, stop: null, path: null, nextAt: g.time, eta: g.time, door: null, waits: 0, stuck: 0, noPath: false, exit: null, gone: false,
      };
      this.byId.set(p.id, nr);
      this.byName.set(p.name, nr);
      // Placed where the plan has them, unless that is in sight (then they come in, out of sight).
      if (p.at && !this.inSight(g, p.at) && this.free(g, p.at)) this.place(nr, p.at);
    }
    for (const [id, r] of this.byId) {
      if (seen.has(id)) continue;
      if (!r.present || !this.inSight(g, r)) this.drop(r);
      else r.gone = true;
    }
    this.run(g);
  }

  private inSight(g: PopulationView, t: Spot): boolean {
    return t.z === g.z && g.isVisible(t.x, t.y);
  }

  private free(g: PopulationView, t: Spot, me?: Resident): boolean {
    const o = this.byTile.get(tileKey(t.x, t.y, t.z));
    return (!o || o === me) && !(t.x === g.px && t.y === g.py && t.z === g.z) && !this.animalAt(t.x, t.y, t.z);
  }

  private place(r: Resident, t: Spot): void {
    if (r.present) this.byTile.delete(tileKey(r.x, r.y, r.z));
    r.present = true;
    r.x = t.x;
    r.y = t.y;
    r.z = t.z;
    this.byTile.set(tileKey(t.x, t.y, t.z), r);
  }

  private drop(r: Resident): void {
    if (r.present) this.byTile.delete(tileKey(r.x, r.y, r.z));
    this.byId.delete(r.p.id);
    if (this.byName.get(r.p.name) === r) this.byName.delete(r.p.name);
  }

  private vanish(r: Resident): void {
    if (r.present) this.byTile.delete(tileKey(r.x, r.y, r.z));
    r.present = false;
    r.path = null;
    r.exit = null;
  }

  /** Everyone acts up to the game's time. Returns whether anyone shown changed. */
  run(g: PopulationView): boolean {
    const T = g.time;
    this.pathBudget = PATHS_PER_RUN;
    const jump = this.lastRun >= 0 && T - this.lastRun > JUMP_S;
    this.lastRun = T;
    // The nearest walk tile by tile (up to MAX_WALKERS); those in sight always do.
    const near: [number, Resident][] = [];
    for (const r of this.byId.values()) {
      if (!r.present) continue;
      const d = cheb(r, g.px, g.py);
      if (d <= ACTIVE || this.inSight(g, r)) near.push([this.inSight(g, r) ? -1 : d, r]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const walkers = new Set(near.slice(0, MAX_WALKERS).filter(([d]) => d < 0 || !jump).map(([, r]) => r));
    let changed = false;
    for (const r of [...this.byId.values()]) if (this.act(r, g, walkers.has(r))) changed = true;
    this.workNoises(g, near);
    if (this.greetings(g, near)) changed = true;
    return changed;
  }

  private noise(r: Resident | null, at: Spot, kind: NoiseKind, loud: number, what: string): void {
    this.noises.push({ x: at.x, y: at.y, z: at.z, loud, kind, by: r ? r.p.id : 'player', what });
    if (this.noises.length > 400) this.noises.splice(0, this.noises.length - 400);
  }

  /** The noises of work about the wanderer: a smith's hammering, a cooper's mallet, a carpenter's saw. */
  private workNoises(g: PopulationView, near: [number, Resident][]): void {
    for (const [, r] of near) {
      if (r.where !== 'work' || r.path) continue;
      const w = NOISY.find(([re]) => re.test(r.p.trade));
      if (!w) continue;
      if (r.noiseAt !== undefined && g.time < r.noiseAt) continue;
      r.noiseAt = g.time + 20 + (r.p.id.length % 7) * 4;
      this.noise(r, r, 'work', w[1], w[2]);
    }
  }

  /**
   * Greetings among those in sight: friends, kin and sweethearts who pass close greet one another
   * (once a day); rivals and feuding neighbours pass in silence; those who think well of the wanderer
   * nod to them in passing.
   */
  private greetings(g: PopulationView, near: [number, Resident][]): boolean {
    const day = Math.floor(g.time / 86400);
    let any = false;
    for (const [d, r] of near) {
      if (d >= 0 || r.where === 'asleep') continue;
      // Ties are kept on a household's head, by the other head's name.
      for (const tie of r.p.ties ?? []) {
        const m = /(?:with|to|by|on) (.+?) \(/.exec(tie.text);
        const o = m ? this.byName.get(m[1]) : undefined;
        if (!o || !o.present || o.where === 'asleep' || o.z !== r.z || cheb(o, r.x, r.y) > 2) continue;
        const pair = r.p.id < o.p.id ? `${r.p.id}|${o.p.id}` : `${o.p.id}|${r.p.id}`;
        if (this.greeted.get(pair) === day) continue;
        this.greeted.set(pair, day);
        const words: Record<string, string> = {
          friend: `${r.p.given} and ${o.p.given} greet each other like old friends.`, kin: `${r.p.given} greets ${o.p.given}, kin by marriage.`,
          sweetheart: `${r.p.given} and ${o.p.given} exchange a shy smile.`, partner: `${r.p.given} and ${o.p.given} stop to talk business.`,
          rival: `${r.p.given} and ${o.p.given} pass each other with a cold look.`, feud: `${r.p.given} and ${o.p.given} pass without a word, scowling.`,
          owes: `${r.p.given} hurries past ${o.p.given}, eyes down.`, owed: `${r.p.given} gives ${o.p.given} a pointed look.`,
        };
        if (words[tie.kind]) {
          this.onSee(words[tie.kind]);
          if (tie.kind !== 'feud' && tie.kind !== 'rival' && tie.kind !== 'owes') this.noise(r, r, 'speech', LOUD.speech, 'voices');
          any = true;
        }
      }
      // A nod to the wanderer from those who think well of them.
      if (cheb(r, g.px, g.py) <= 2 && r.z === g.z && this.opinions.of(r.p.id, g.time) >= 12 && (r.greetedAt === undefined || g.time - r.greetedAt > 4 * 3600)) {
        r.greetedAt = g.time;
        this.onSee(`${r.p.given} nods to you.`);
        any = true;
      }
    }
    return any;
  }

  /**
   * A noise the wanderer makes: those awake who hear it look toward it; a loud one near a sleeper
   * makes them stir.
   */
  hearPlayer(g: PopulationView, n: Omit<Noise, 'by'>): void {
    const T = g.time;
    for (const r of this.byId.values()) {
      if (!r.present || cheb(r, n.x, n.y) > 24) continue;
      const level = heardLevel(g.map, { ...n, by: 'player' }, r);
      const thr = hearingThreshold(10);
      if (level < thr) continue;
      if (r.where === 'asleep') {
        if (level >= thr + 30 && (r.stirredAt === undefined || T - r.stirredAt > 1800)) {
          r.stirredAt = T;
          if (this.inSight(g, r)) this.onSee(`${r.p.given} stirs in their sleep.`);
        }
        continue;
      }
      if (r.path?.length) continue;
      const dx = n.x - r.x, dy = n.y - r.y;
      if (!dx && !dy) continue;
      r.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n';
    }
  }

  /**
   * The wanderer walks into a resident: one standing about steps aside if they can; else they say
   * so, and being jostled again and again sours them a little. Returns what is said.
   */
  bumped(g: PopulationView, r: Resident): string {
    if (!r.path?.length && r.where !== 'asleep' && this.stepAside(r, g, { x: g.px, y: g.py, path: null })) return `${r.p.given} steps aside.`;
    if (r.where === 'asleep') return `${r.p.name} is asleep there.`;
    if (this.opinions.recent(r.p.id, 'jostled me', g.time, 600) >= 2) {
      this.opinions.add(r.p.id, r.p.name, 'jostled me', -3, g.time, 2);
      return `"Watch where you are going!" ${r.p.given} snaps.`;
    }
    this.opinions.add(r.p.id, r.p.name, 'jostled me', -0.5, g.time, 1);
    return `"Mind your step," says ${r.p.given}.`;
  }

  /** The block of a person's plan at a game time, and its place (the rain sends them home from out of doors). */
  private goalOf(r: Resident, T: number): { stop: PlanStop; goal: Spot | null } {
    const p = r.p;
    const day = Math.floor(T / 86400);
    // A plan is for its day; past it (until the worker gives the next), its last block holds.
    const hour = day === p.day ? (T % 86400) / 3600 : day > p.day ? 23.99 : 0;
    const stop = blockAt(p.plan, hour) as PlanStop;
    let goal = stop.at;
    if (goal && this.raining && OUTDOOR.has(stop.place)) goal = p.home;
    if (r.gone) goal = null;
    return { stop, goal };
  }

  /** One person acts up to the game's time. Returns whether they changed on the map. */
  private act(r: Resident, g: PopulationView, walking: boolean): boolean {
    const T = g.time;
    const { stop, goal: want } = this.goalOf(r, T);
    if (r.want === undefined || (want === null ? r.want !== null : !same(want, r.want))) {
      r.want = want;
      r.goal = want;
      r.stop = stop;
      r.path = null;
      r.exit = null;
      r.waits = 0;
      r.noPath = false;
      // They set out when the block began (or now, if they were busy until now).
      const began = (stop.from >= 23.99 ? T : Math.floor(T / 86400) * 86400 + stop.from * 3600);
      r.nextAt = Math.max(r.nextAt, Math.min(T, began));
      // A move in one go lands when the walk would have: about a step a tile.
      r.eta = T + (r.present && want ? Math.max(Math.abs(want.x - r.x), Math.abs(want.y - r.y)) * STEP_S + (want.z !== r.z ? 20 : 0) : 300);
    }
    r.stop = stop;
    const goal = r.goal;

    if (!r.present) {
      if (r.gone && !r.goal) {
        this.drop(r);
        return false;
      }
      if (!goal || T < r.eta) return false;
      // Coming in: straight to the place if it is out of sight; else from a tile out of sight nearby, on foot.
      if (!this.inSight(g, goal) && this.free(g, goal) && !(walking && cheb(goal, g.px, g.py) <= ACTIVE)) {
        this.place(r, goal);
        this.dress(r, g);
        return true;
      }
      const from = this.outOfSight(g, goal, r);
      if (!from) return false;
      this.place(r, from);
      r.nextAt = T;
      this.dress(r, g);
      return true;
    }

    // Leaving for somewhere beyond the bubble: walk off out of sight, and be gone.
    if (!goal) {
      if (!this.inSight(g, r) && (!walking || (r.exit && same(r.exit, r)))) {
        this.vanish(r);
        if (r.gone) this.drop(r);
        return true;
      }
      if (!walking) return false;
      r.exit ??= this.outOfSight(g, r, r);
      if (!r.exit) return false;
      return this.walk(r, g, r.exit);
    }

    if (same(goal, r)) return this.settle(r, g);
    if (!walking || r.noPath) {
      if (T < r.eta || this.inSight(g, r) || this.inSight(g, goal)) return false;
      const to = this.free(g, goal, r) ? goal : this.freeNear(g, goal, r);
      if (!to) return false;
      this.place(r, to);
      if (!same(to, goal)) r.goal = to;
      return this.settle(r, g) || true;
    }
    return this.walk(r, g, goal);
  }

  /** At their place: dressed for it, facing a little about. */
  private settle(r: Resident, g: PopulationView): boolean {
    const was = r.where;
    r.path = null;
    this.shut(r, g);
    r.where = r.stop?.act === 'sleep' ? 'asleep' : r.stop?.act ?? 'home';
    if (r.where === 'errand' && r.stop?.place === 'market') this.buy(r);
    if (was !== r.where) {
      this.dress(r, g);
      return true;
    }
    return false;
  }

  /** Walks a person along their way up to the game's time. Returns whether they moved. */
  private walk(r: Resident, g: PopulationView, to: Spot): boolean {
    const T = g.time;
    let moved = false;
    for (let n = 0; n < MAX_STEPS && r.nextAt <= T; n++) {
      if (same(to, r)) break;
      if (!r.path || !r.path.length) {
        // Paths are found a few at a time (a crowd setting out at once waits its turn, and catches up).
        if (this.pathBudget <= 0) break;
        this.pathBudget--;
        // A long way is walked a leg at a time: to a tile of open ground some way toward the place.
        const far = cheb(r, to.x, to.y) > LEG;
        const leg = far ? this.waypoint(g, r, to) : null;
        r.path = findPath(g.map, r, leg ?? to, PATH_LIMIT);
        this.searched++;
        if (!r.path) {
          // No way there (yet, or not one short enough to look for): wait a while; out of sight, take the place in one go.
          this.failed++;
          if (this.fails.length < 40) this.fails.push([{ x: r.x, y: r.y, z: r.z }, { ...to }, r.stop?.place ?? '']);
          // A failed search is the costly kind: none more this run, and none more for this place (they get
          // there in one go, out of sight, when the walk would have ended).
          this.pathBudget = 0;
          r.noPath = true;
          break;
        }
        if (!r.path.length) break;
      }
      const s = r.path[0];
      const other = this.byTile.get(tileKey(s.x, s.y, s.z));
      const player = s.x === g.px && s.y === g.py && s.z === g.z;
      // An animal in the way is shooed off, and the walker waits a moment.
      if (!other && !player && this.animalAt(s.x, s.y, s.z)) {
        this.shoo(s.x, s.y, s.z);
        r.nextAt += WAIT_S;
        if (this.animalAt(s.x, s.y, s.z)) continue;
      }
      if ((other && other !== r) || player) {
        // The last tile taken: settle beside it instead.
        if (r.path.length === 1 && !player) {
          const alt = this.freeNear(g, s, r);
          if (alt && cheb(alt, r.x, r.y) <= 1 && alt.z === r.z) {
            r.path = [{ ...alt }];
            r.goal = alt;
            to = alt;
            continue;
          }
        }
        // Nearly there, and the way is full of people standing about (a crowded market, a full taproom): this will do.
        if (other && !other.path?.length && cheb(r, to.x, to.y) <= 4 && r.goal && same(to, r.goal)) {
          r.goal = { x: r.x, y: r.y, z: r.z };
          to = r.goal;
          break;
        }
        // Someone standing about steps aside; two meeting head on squeeze past each other; else wait, and in time go round.
        if (other && other.path === null && this.stepAside(other, g, r)) continue;
        if (other && other.path?.length && same(other.path[0], r)) {
          this.swap(r, other, g);
          moved = true;
          continue;
        }
        r.waits++;
        r.nextAt += WAIT_S;
        // Someone on the move will be gone in a moment; one standing still (or the wanderer) is gone round.
        const still = player || !other?.path?.length;
        if (r.waits > WAITS && still && this.pathBudget > 0) {
          this.pathBudget--;
          r.waits = 0;
          const before = r.path;
          r.path = this.goRound(g, r, to, s);
          if (r.path === before) {
            // No way round: wait longer; after a few tries, near enough will do (or, out of sight, there in one go).
            r.stuck++;
            r.nextAt += 10 * r.stuck;
            if (r.stuck >= 3) {
              r.stuck = 0;
              if (!this.inSight(g, r) && !this.inSight(g, to) && this.free(g, to, r)) {
                this.place(r, to);
                moved = true;
              } else if (cheb(r, to.x, to.y) <= 8) {
                r.goal = { x: r.x, y: r.y, z: r.z };
                to = r.goal;
              }
              r.path = null;
              break;
            }
          } else r.stuck = 0;
        }
        continue;
      }
      r.waits = 0;
      // A shut door on the way: open it (and shut it behind, once through).
      if (s.door && !g.map.passableAt(s.x, s.y, s.z)) {
        const o = OBJECT_TILES[g.map.objectAt(s.x, s.y, s.z)];
        if (o && OPENABLE.has(o.name) && o.toggle) {
          g.map.setObjectAt(s.x, s.y, s.z, objectId(o.toggle)!);
          r.door = { x: s.x, y: s.y, z: s.z };
          this.noise(r, s, 'door', LOUD.door, o.name.startsWith('gate') ? 'a gate' : 'a door');
          r.nextAt += DOOR_S;
          moved = true;
          continue;
        }
        r.path = null;
        r.nextAt += WAIT_S;
        continue;
      }
      r.path.shift();
      const dx = s.x - r.x, dy = s.y - r.y;
      r.facing = dx > 0 ? 'e' : dx < 0 ? 'w' : dy < 0 ? 'n' : 's';
      this.place(r, s);
      // Footsteps (heard nearby), and tracks in soft ground.
      const gid = g.map.groundAt(s.x, s.y, s.z), gd = GROUND_TILES[gid];
      if (cheb(s, g.px, g.py) <= 20) this.noise(r, s, 'step', gd?.water ? LOUD.stepWater : takesTracks(gid, true) ? LOUD.stepSoft : LOUD.stepHard, 'footsteps');
      if (takesTracks(gid, this.wet)) this.tracks.add(s.x, s.y, s.z, { t: r.nextAt, by: r.p.id, kind: r.p.look.kind, ...(r.p.age < 13 ? { young: true } : {}), dir: r.facing });
      r.nextAt += s.stairs ? STAIR_S : dx && dy ? DIAG_S : STEP_S;
      r.where = 'walking';
      this.shut(r, g);
      moved = true;
    }
    if (moved) this.dress(r, g);
    if (same(to, r) && r.goal && same(to, r.goal)) this.settle(r, g);
    return moved;
  }

  /**
   * At the market on an errand: a token purchase, once an errand (food for the household, the
   * supplies of a trade, a traveller's bread), paid from the purse and carried home in the basket.
   */
  buy(r: Resident): boolean {
    const st = r.stop, inv = r.actor.get(Inventory);
    if (!st || !inv) return false;
    const key = `${r.p.day}:${st.from}`;
    if (r.bought === key) return false;
    r.bought = key;
    const rnd = mulberry32(hashString(`${r.p.id}#buy#${key}`));
    const wants: [string, number][] = [];
    if (r.p.template === 'craft' || r.p.template === 'merchant') wants.push(['supplies', 1 + Math.floor(rnd() * 2)]);
    else {
      const food = ['bread', 'bread', 'cheese', 'apple', 'dried_meat', 'nuts', 'roots', 'wild_greens'];
      for (let i = 0, n = r.p.template === 'guest' || r.p.template === 'elder' ? 1 : 2 + Math.floor(rnd() * 2); i < n; i++) {
        wants.push([food[Math.floor(rnd() * food.length)], 1 + Math.floor(rnd() * 3)]);
      }
    }
    const make = CULTURES[r.p.culture]?.name;
    const basket = inv.d.items.find((i) => i.def === 'basket');
    let got = false;
    for (const [id, qty] of wants) {
      if (!ITEM.has(id)) continue;
      const price = Math.max(1, (ITEM.get(id)!.value ?? 1) * qty);
      if (inv.d.copper < price) continue;
      const it = makeItem(id, { qty, make });
      if (basket ? inv.put(it, { at: 'in', parent: basket.uid }) && inv.stow(it) : inv.stow(it)) continue;
      inv.pay(price);
      got = true;
    }
    return got;
  }

  /** Two walking into each other squeeze past: each takes the other's tile, a step on for both. */
  private swap(a: Resident, b: Resident, g: PopulationView): void {
    const ta = { x: a.x, y: a.y, z: a.z }, tb = { x: b.x, y: b.y, z: b.z };
    this.byTile.delete(tileKey(ta.x, ta.y, ta.z));
    this.byTile.delete(tileKey(tb.x, tb.y, tb.z));
    a.path!.shift();
    b.path!.shift();
    this.place(a, tb);
    this.place(b, ta);
    a.nextAt += STEP_S * 1.5;
    b.nextAt = Math.max(b.nextAt, a.nextAt);
    a.where = b.where = 'walking';
    a.waits = b.waits = 0;
    this.dress(a, g);
    this.dress(b, g);
  }

  /** A tile of open ground on the way to a far place, about LEG tiles toward it (null if none near the line). */
  private waypoint(g: PopulationView, r: Resident, to: Spot): Spot | null {
    const d = Math.max(Math.abs(to.x - r.x), Math.abs(to.y - r.y));
    const px = Math.round(r.x + ((to.x - r.x) * LEG) / d), py = Math.round(r.y + ((to.y - r.y) * LEG) / d);
    for (let rr = 0; rr <= 6; rr++) for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
      const x = px + dx, y = py + dy;
      if (!g.map.loaded(x, y) || !g.map.passableAt(x, y, null)) continue;
      if (GROUND_TILES[g.map.groundAt(x, y, null)]?.name.startsWith('floor_')) continue;
      return { x, y, z: null };
    }
    return null;
  }

  /** Shuts the door a person opened, once they are through it and nobody stands in it. */
  private shut(r: Resident, g: PopulationView): void {
    const d = r.door;
    if (!d || same(d, r)) return;
    if (this.byTile.has(tileKey(d.x, d.y, d.z)) || (g.px === d.x && g.py === d.y && g.z === d.z)) return;
    const o = OBJECT_TILES[g.map.objectAt(d.x, d.y, d.z)];
    if (o?.pass && o.toggle) {
      g.map.setObjectAt(d.x, d.y, d.z, objectId(o.toggle)!);
      this.noise(r, d, 'door', LOUD.door, o.name.startsWith('gate') ? 'a gate' : 'a door');
    }
    r.door = null;
  }

  /** One standing about steps to a free tile beside them, off the way of the one coming. */
  private stepAside(o: Resident, g: PopulationView, by: { x: number; y: number; path: Step[] | null }): boolean {
    const next = by.path?.[1];
    for (const [dx, dy] of DIRS8) {
      const t = { x: o.x + dx, y: o.y + dy, z: o.z };
      if ((t.x === by.x && t.y === by.y) || (next && same(next, t)) || !this.free(g, t) || !g.map.passableAt(t.x, t.y, t.z)) continue;
      this.place(o, t);
      o.facing = dx > 0 ? 'e' : dx < 0 ? 'w' : dy < 0 ? 'n' : 's';
      return true;
    }
    return false;
  }

  /** A way round someone in the way (or the same way again, if there is none). */
  private goRound(g: PopulationView, r: Resident, to: Spot, blocked: Spot): Step[] | null {
    const map: PathMap = {
      loaded: (x, y) => g.map.loaded(x, y),
      passableAt: (x, y, z) => !(x === blocked.x && y === blocked.y && z === blocked.z) && g.map.passableAt(x, y, z),
      objectAt: (x, y, z) => g.map.objectAt(x, y, z),
      hasFloor: (x, y, z) => g.map.hasFloor(x, y, z),
      level: (x, y) => g.map.level(x, y),
    };
    if (same(blocked, to)) return r.path;
    return findPath(map, r, to, 600) ?? r.path;
  }

  /** A free tile one can stand on near another, on its floor (null if none within two tiles). */
  private freeNear(g: PopulationView, t: Spot, me: Resident): Spot | null {
    for (let d = 1; d <= 2; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      const s = { x: t.x + dx, y: t.y + dy, z: t.z };
      if (this.free(g, s, me) && g.map.passableAt(s.x, s.y, s.z)) return s;
    }
    return null;
  }

  /**
   * A tile out of sight on the ground, some way from a place (for coming in to it, or walking off
   * from it): open, free, and not where the wanderer can see. Null if none is found.
   */
  private outOfSight(g: PopulationView, t: Spot, r: Resident): Spot | null {
    const base = (r.p.id.length * 7 + r.p.id.charCodeAt(r.p.id.length - 1)) % 16;
    for (const d of [18, 24, 30, 36]) for (let i = 0; i < 16; i++) {
      const a = ((base + i * 5) % 16) * (Math.PI / 8);
      const s = { x: Math.round(t.x + Math.cos(a) * d), y: Math.round(t.y + Math.sin(a) * d), z: null };
      if (!g.map.loaded(s.x, s.y) || this.inSight(g, s) || !this.free(g, s) || !walkable(g.map, s.x, s.y, null).ok) continue;
      if (GROUND_TILES[g.map.groundAt(s.x, s.y, null)]?.name.startsWith('floor_')) continue;
      return s;
    }
    return null;
  }

  /** Dressed for where they are: for bed, indoors (no cloak), or out of doors. */
  private dress(r: Resident, g: PopulationView): void {
    const indoors = r.z !== null || !!GROUND_TILES[g.map.groundAt(r.x, r.y, r.z)]?.name.startsWith('floor_');
    r.figure = dressFor(figureOf(r.actor), r.where === 'asleep' ? 'asleep' : indoors ? 'home' : 'out');
  }

  /** A resident as an Actor: who they are, their body and looks, their belongings. */
  private actorOf(p: PlacedPerson): Actor {
    const a = new Actor('person');
    const c = CULTURES[p.culture];
    const space = p.name.indexOf(' ');
    a.add(new Identity({
      given: p.given, family: space > 0 ? p.name.slice(space + 1) : undefined, full: p.name, female: p.female, age: p.age, year: 0,
      folk: '', culture: p.culture, cultureName: c?.name ?? '', people: p.people, homeId: p.homeId, homeName: p.homeName ?? p.household, standing: STANDING[p.means],
    }));
    // A height and weight for their age, sex and kind (what they can carry follows from it).
    const grown = Math.min(1, Math.max(0.3, (p.age + 2) / 20)), short = { dwarf: 0.75, halfling: 0.6, gnome: 0.58, fungus: 0.85 }[p.look.kind] ?? 1;
    a.add(new Body({
      heightCm: Math.round((p.female ? 162 : 174) * short * (0.55 + 0.45 * grown)), weightKg: Math.round((p.female ? 60 : 72) * (p.look.kind === 'dwarf' ? 1 : short) * grown * grown), build: '', skin: '', skinHex: p.look.skin, hair: '', hairHex: p.look.hair, hairStyle: p.look.hairStyle, beard: p.look.beard,
      kind: p.look.kind, wounds: [],
    }));
    a.add(belongingsOf(p, this.seed));
    return a;
  }
}

/** A figure dressed for where its person is: for bed (no more than the body garment), or indoors (no cloak). */
export function dressFor(f: FigureSpec, where: 'asleep' | 'home' | 'out'): FigureSpec {
  if (where === 'out') return f;
  const keep = where === 'asleep' ? new Set(['legs', 'body']) : null;
  return { ...f, wear: f.wear.filter((w) => {
    const slot = WEAR_SHAPE.get(w.shape)?.slot;
    return keep ? !!slot && keep.has(slot) : slot !== 'cloak';
  }) };
}

/** What a person is about, in words (for looking at them). */
export function doingWords(r: Resident): string | null {
  const st = r.stop;
  if (r.where === 'walking') {
    if (!r.goal) return 'On their way out of the quarter.';
    const to: Record<string, string> = { bed: 'home', home: 'home', table: 'home', work: 'work', out: 'work', tavern: 'the tavern', square: 'the square', temple: 'the temple', market: 'the market', warehouse: 'the warehouse', gate: 'the gate' };
    return `On their way to ${st ? to[st.place] ?? 'somewhere' : 'somewhere'}.`;
  }
  if (r.where === 'asleep') return 'Asleep.';
  if (!st) return null;
  switch (st.act) {
    case 'work':
      if (r.p.template === 'beggar') return /beggar/.test(r.p.trade) ? 'Begging.' : 'Crying their wares.';
      if (r.p.template === 'carter') return st.place === 'market' ? 'Unloading at the market.' : st.place === 'gate' ? 'Waiting at the gate with a load.' : 'Loading at the warehouse.';
      return 'At work.';
    case 'errand': return st.place === 'market' ? 'Shopping at the market.' : 'On an errand.';
    case 'meal': return 'At a meal.';
    case 'worship': return 'At prayer.';
    case 'leisure': return st.place === 'tavern' ? 'Drinking.' : st.place === 'out' ? 'At play.' : 'Taking the air.';
    default: return null;
  }
}
