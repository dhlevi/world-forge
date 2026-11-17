/**
 * The game's rules for Phase 2: one wanderer on the local map, moving a tile at a time. Every
 * action takes time on the game clock; sight is worked out after each one (rot.js shadowcasting).
 */
import { FOV } from 'rot-js';
import { CHUNK, TILE_M } from '@worldforge/core/local/chunk';
import { GROUND_TILES, OBJECT_TILES, objectId, type Facing, type TileDef } from '@worldforge/core/local/tiles';
import { GameMap } from './map';
import { Ground } from './ground';
import { Camps } from './camp';
import type { Activity } from '../actors/components';
import { itemName } from '../actors/items/item';
import { Discovery, FOOT_SIGHT_M } from './discovery';
import type { LocalSite } from '../worker/protocol';
import { bearing, compassWord, Dice } from '../util';
import { levelWords, overGround, stepBetween } from './levels';
import { treeAt, treeWords } from './trees';
import type { FigureSpec } from '@worldforge/core/local/figures';

/** Seconds an action takes. */
export const STEP_S = 1.2;
export const DIAG_S = 1.7;
export const DOOR_S = 2;
export const WAIT_S = 5;
/** Seconds to swim a tile of deep water. */
export const SWIM_S = 4;
/** Seconds to go up or down a flight of stairs or a ladder (a level). */
export const STAIRS_S = 4;
/** Seconds more to slip diagonally between two trees (or bushes, or boulders). */
export const SQUEEZE_S = 2;
/** Seconds more to go up a ramp (a level), and down one. */
export const RAMP_UP_S = 1.5;
export const RAMP_DOWN_S = 0.4;

/** How a climb went (game/practice.ts): whether the wanderer got there, and the seconds it took. */
export interface Climb {
  ok: boolean;
  seconds: number;
}
/** How far the wanderer sees by day, in tiles. */
export const SIGHT = 30;
/** Things that give light, and how far it reaches (tiles). */
export const LIGHTS: Record<string, number> = { campfire: 7, hearth: 6, forge: 6, oven: 3, candle: 3, brazier: 5, wall_torch: 5 };

export interface Hud {
  place: string;
  where: string;
  clock: string;
  log: { t: string; text: string }[];
  look: string[];
  mode: 'play' | 'look' | 'open' | 'close' | 'cut' | 'talk';
  loading: number;
  /** The town or city the wanderer is in (for its city view), if any. */
  town?: { id: string; name: string; tier: string } | null;
}

const vkey = (x: number, y: number) => (x + 1048576) * 2097152 + (y + 1048576);
/**
 * Ways up and down, by the way they lead: stairs and ladders, and the ways down into caves,
 * dungeons and sewers from the surface. A way up always meets a way down at the same tile above
 * (local/under.ts), however many levels lie between.
 */
export const STAIRS_UP = new Set(['stairs_up', 'ladder_up', 'stairs_spiral']);
export const STAIRS_DOWN = new Set(['stairs_down', 'ladder_down', 'stairs_spiral', 'dungeon_entrance', 'mine_entrance', 'cave_mouth', 'grate', 'well']);
/** Ways in from the land, pointed out when first seen (and marked on the map). */
export const WAYS_IN = new Set(['dungeon_entrance', 'mine_entrance', 'cave_mouth']);
/** How far up or down (levels) a way may lead. */
const WAY_REACH = 48;
/** A way down, in words (for "You go down ..."). */
const WAY_WORDS: Record<string, string> = {
  stairs_up: 'the stairs', stairs_down: 'the stairs', stairs_spiral: 'the spiral stair', ladder_up: 'the ladder', ladder_down: 'the ladder',
  dungeon_entrance: 'the steps', mine_entrance: 'the mine shaft', cave_mouth: 'the cave passage', grate: 'the ladder under the grate', well: 'the well rope',
};
const DIRS8: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

/** A person on the map, as drawn: where, facing which way, awake or asleep, and their figure. */
export interface ShownPerson {
  x: number;
  y: number;
  z: number | null;
  facing: Facing;
  where: string;
  figure: FigureSpec;
}

export class Game {
  px: number;
  py: number;
  /**
   * The floor the wanderer is on: a level (a building's upper storey or cellar), or null on the
   * ground (whose level is the ground's own, game/levels.ts). Set with setFloor.
   */
  z: number | null = null;
  /** The way the wanderer faces (the last way they moved, or turned to). */
  facing: Facing = 's';
  /** Steps taken (a count, so that the map can show a single step as a walk from tile to tile). */
  steps = 0;
  /** Game time, seconds since the start (day 1, 08:00). */
  time = 8 * 3600;
  readonly visible = new Set<number>();
  /** What of the world has been discovered (the travel map's clouds lift from it). */
  readonly discovery = new Discovery();
  /** The look cursor (look mode). */
  cursor: [number, number] | null = null;
  private fov: InstanceType<typeof FOV.PreciseShadowcasting>;
  /** Called when something on screen changed. */
  onChange: () => void = () => {};
  /** Things left on the map (game/ground.ts). */
  readonly ground = new Ground();
  /** Camps made and kept (game/camp.ts). */
  readonly camps = new Camps();
  /** The game's own saved stream of chance (events on the road), seeded from the game's id by the session. */
  readonly dice = new Dice(0);
  /** How much slower the wanderer's load (and state) makes moving (actors/items/inventory.ts, actors/needs.ts). */
  loadSlow: () => number = () => 1;
  /** What the wanderer has been doing since the clock was last told (for needs and fatigue). */
  activity: Activity = 'rest';
  /** How well they sleep, while sleeping. */
  sleepQuality = 0.6;
  /** Called whenever the clock may have moved (after every action and travel step). */
  onTime: (time: number) => void = () => {};
  /** Climbs a rock face of so many metres, up or down (game/practice.ts); none: it cannot be climbed. */
  climb: ((metres: number, up: boolean) => Climb) | null = null;
  /** The wanderer's figure on the map (core local/figures.ts; set by the session from the character). */
  figure: () => FigureSpec = () => ({ kind: 'human', female: false, skin: '#d8b090', hair: { style: 'short', colour: '#5a3a20' }, beard: { style: 'none', colour: '#5a3a20' }, wear: [{ shape: 'trousers', colour: '#6a5a46' }, { shape: 'tunic', colour: '#5f6f86' }] });
  /** Someone standing on a tile and floor (world/population.ts): their name, and what can be told of them. */
  personAt: (x: number, y: number, z: number | null) => { name: string; lines: string[] } | null = () => null;
  /** The wanderer walks into someone (world/population.ts): what happens, in words (none: they are in the way). */
  onBump: (x: number, y: number, z: number | null) => string | null = () => null;
  /** The wanderer makes a noise (a step, a door), for those about to hear and the ground to take their tracks. */
  onNoise: (kind: 'step' | 'door', x: number, y: number, z: number | null, dir: Facing) => void = () => {};
  /** The tracks on a tile, as the wanderer reads them (none: none seen), and how many there are (for drawing). */
  tracksText: (x: number, y: number, z: number | null) => string | null = () => null;
  tracksOn: (x: number, y: number, z: number | null) => number = () => 0;
  /** The people about, to be drawn (world/population.ts). */
  people: () => Iterable<ShownPerson> = () => [];
  /** Called when thorns scratch the wanderer (a small hurt, for the mood). */
  onScratch: () => void = () => {};
  /** A rock face the wanderer has walked into once: walking into it again climbs it. */
  private face: { x: number; y: number } | null = null;

  constructor(readonly map: GameMap, start: [number, number], readonly sites: LocalSite[], readonly startName: string, readonly hud: Hud) {
    [this.px, this.py] = start;
    this.fov = new FOV.PreciseShadowcasting((x: number, y: number) => (x === this.px && y === this.py) || this.map.transparent(x, y), { topology: 8 });
    this.say(`You stand in ${startName}.`);
  }

  /** Puts the wanderer on a floor (null: the ground); the map and what lies about are read on it. */
  setFloor(z: number | null): void {
    this.z = z;
    this.map.floor = z;
    this.ground.floor = z;
  }

  /** The level the wanderer stands on: their floor's, or the ground's under them. */
  get level(): number {
    return this.z ?? this.map.level(this.px, this.py);
  }

  /** The light out of doors and how far it lets the wanderer see (tiles); set as the sky changes (game/weather.ts). */
  ambient = { light: 1, range: SIGHT };
  /** How far a light the wanderer carries reaches (tiles; 0 none). */
  carriedLight: () => number = () => 0;
  /** Ways in (cave mouths, dungeons' steps, mine shafts) already pointed out, by tile. */
  private noticed = new Set<number>();
  /** Light on each visible tile (negative: firelight). */
  private lit = new Map<number, number>();

  /**
   * The first thing found about the wanderer, underfoot then ring by ring out to `r` tiles: `f`
   * is asked of each tile and the first answer that is not empty is returned (or null).
   */
  nearby<T>(r: number, f: (x: number, y: number) => T | null | undefined | false): T | null {
    for (let ring = 0; ring <= r; ring++) {
      for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const v = f(this.px + dx, this.py + dy);
        if (v) return v;
      }
    }
    return null;
  }

  /** A thing on the map of one of these names, underfoot or within `r` tiles (1: beside): its tile. */
  besideObject(names: string[], r = 1): TileDef | null {
    return this.nearby(r, (x, y) => {
      const o = OBJECT_TILES[this.map.object(x, y)];
      return o && names.includes(o.name) ? o : null;
    });
  }

  isVisible(x: number, y: number): boolean {
    return this.visible.has(vkey(x, y));
  }

  /** Asks for the chunks round the wanderer, and works out sight. */
  refresh(): void {
    const r = SIGHT + CHUNK / 2;
    this.map.want(this.px - r, this.py - r, this.px + r, this.py + r);
    this.discovery.reveal(this.px, this.py, FOOT_SIGHT_M);
    this.computeSight();
    this.updateHud();
    this.onChange();
  }

  /**
   * What can be seen (survival.md, Light sets sight): everything in line of sight within the range
   * the daylight (or moonlight, through cloud, fog and rain) allows, and beyond that whatever a
   * fire, hearth or carried light lights up. Each visible tile keeps how lit it is (0 to 1), and
   * whether by firelight, for drawing.
   */
  private computeSight(): void {
    this.visible.clear();
    this.lit.clear();
    const range = Math.max(1.5, Math.min(SIGHT, this.ambient.range));
    const cand: [number, number][] = [];
    const sources: [number, number, number][] = [];
    this.fov.compute(this.px, this.py, SIGHT, (x: number, y: number) => {
      if (!this.map.loaded(x, y)) return;
      cand.push([x, y]);
      const r = LIGHTS[OBJECT_TILES[this.map.object(x, y)]?.name ?? ''];
      if (r) sources.push([x, y, r]);
    });
    const carried = this.carriedLight();
    if (carried) sources.push([this.px, this.py, carried]);
    // Heights about the wanderer, once, for sight over the ground.
    const R = SIGHT + 1, Wd = 2 * R + 1, heights = new Float64Array(Wd * Wd).fill(NaN);
    const elevAt = (x: number, y: number) => {
      const i = (y - this.py + R) * Wd + (x - this.px + R);
      let h = heights[i];
      if (Number.isNaN(h)) heights[i] = h = this.map.elev(x, y);
      return h;
    };
    const z = this.z;
    const dark = z !== null && z < this.map.level(this.px, this.py);
    for (const [x, y] of cand) {
      // On the ground, sight follows its height; on a floor, the floor is level.
      if (z === null && !overGround(this.px, this.py, x, y, elevAt)) continue;
      const d = Math.hypot(x - this.px, y - this.py);
      let fire = 0;
      for (const [sx, sy, r] of sources) {
        const e = Math.hypot(x - sx, y - sy);
        if (e <= r) fire = Math.max(fire, 1 - (e / r) * 0.7);
      }
      // Below the land no daylight reaches: only fires and what the wanderer carries.
      const amb = d <= range && !dark ? this.ambient.light : 0;
      if (amb <= 0 && fire <= 0 && d > 1.5) continue;
      this.visible.add(vkey(x, y));
      // A way in seen for the first time is pointed out, with where it lies.
      if (z === null && !this.noticed.has(vkey(x, y))) {
        const o = OBJECT_TILES[this.map.objectAt(x, y, null)];
        if (o && WAYS_IN.has(o.name)) {
          this.noticed.add(vkey(x, y));
          const name = this.map.tileAt(x, y, null)?.area ?? '';
          const m = Math.round(Math.hypot(x - this.px, y - this.py) * TILE_M);
          const where = m < 1 ? 'at your feet' : `${m} m ${compassWord(bearing(x - this.px, this.py - y))}`;
          this.say(`You see ${o.look}${name && !name.includes(':') ? ` (${name})` : ''}, ${where}${m < 1 ? '; > to go in' : ''}.`);
        }
      }
      // From a floor, past its edge (through a window), the ground below is what is seen.
      this.map.markSeenAt(x, y, z !== null && !this.map.hasFloor(x, y, z) ? null : z);
      this.lit.set(vkey(x, y), fire > amb ? -fire : Math.max(amb, 0.05));
    }
  }

  /** How lit a visible tile is (0 to 1), and whether by firelight rather than the sky. */
  lightAt(x: number, y: number): { level: number; fire: boolean } {
    const v = this.lit.get(vkey(x, y)) ?? 0;
    return { level: Math.abs(v), fire: v < 0 };
  }

  say(text: string): void {
    this.hud.log.push({ t: this.clockText(), text });
    if (this.hud.log.length > 60) this.hud.log.splice(0, this.hud.log.length - 60);
  }

  clockText(): string {
    const day = Math.floor(this.time / 86400) + 1;
    const s = Math.floor(this.time % 86400);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0'), mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    return `Day ${day}, ${hh}:${mm}`;
  }

  /** Deep water can be swum (nothing on it, such as a boat, in the way). */
  private swim(x: number, y: number): boolean {
    return GROUND_TILES[this.map.ground(x, y)].water === 'deep' && this.map.object(x, y) === 0 && this.map.loaded(x, y);
  }

  private pass(x: number, y: number): boolean {
    return this.map.passable(x, y) || this.swim(x, y);
  }

  /** One step (or a bump: opening a door, or being stopped). Returns whether time passed. */
  move(dx: number, dy: number, quiet = false): boolean {
    const nx = this.px + dx, ny = this.py + dy;
    // Turn that way, whether or not the step can be taken (east or west on a diagonal).
    this.facing = dx > 0 ? 'e' : dx < 0 ? 'w' : dy < 0 ? 'n' : 's';
    if (!this.map.loaded(nx, ny)) {
      if (!quiet) this.say('The land there is still taking shape.');
      return false;
    }
    const obj = OBJECT_TILES[this.map.object(nx, ny)];
    const who = this.personAt(nx, ny, this.z);
    if (who) {
      if (!quiet) this.say(this.onBump(nx, ny, this.z) ?? `${who.name} is in the way.`);
      return false;
    }
    if (!this.pass(nx, ny)) {
      if (obj.toggle) return this.toggle(nx, ny, true, quiet);
      if (!quiet) {
        const g = GROUND_TILES[this.map.ground(nx, ny)];
        // Off the edge of a floor: the earth below the land, the open air above it.
        if (this.z !== null && !this.map.hasFloor(nx, ny, this.z)) this.say(this.z < this.map.level(nx, ny) ? 'Solid rock blocks the way.' : 'There is only open air there.');
        else this.say(`${cap(obj.name !== 'none' ? obj.look : g.look)} blocks the way.`);
      }
      return false;
    }
    // Diagonally between two things that block: no room between two walls, but one can slip
    // past a tree, a bush or a boulder (more slowly).
    let squeeze = 0;
    if (dx && dy && !this.pass(this.px + dx, this.py) && !this.pass(this.px, this.py + dy)) {
      const a = OBJECT_TILES[this.map.object(this.px + dx, this.py)], b = OBJECT_TILES[this.map.object(this.px, this.py + dy)];
      if (!a?.gap && !b?.gap) {
        if (!quiet) this.say('There is no room to slip through.');
        return false;
      }
      squeeze = SQUEEZE_S;
    }
    // A rock face: walking into it again climbs it.
    const l0 = this.map.level(this.px, this.py), l1 = this.map.level(nx, ny);
    const step = this.z === null ? stepBetween(l0, l1) : 'level';
    let extra = step === 'ramp' ? (l1 > l0 ? RAMP_UP_S : RAMP_DOWN_S) : 0;
    if (step === 'cliff') {
      if (quiet) return false;
      const up = l1 > l0, m = Math.abs(this.map.elev(nx, ny) - this.map.elev(this.px, this.py));
      if (!this.climb) {
        this.say(up ? 'A rock face blocks the way.' : 'The ground drops away sheer.');
        return false;
      }
      if (!this.face || this.face.x !== nx || this.face.y !== ny) {
        this.face = { x: nx, y: ny };
        this.say(up ? `A rock face rises ${m} m above you. Walk into it again to climb it.` : `The ground drops away ${m} m below you. Walk on again to climb down.`);
        return false;
      }
      this.face = null;
      const c = this.climb(m, up);
      this.activity = 'work';
      if (!c.ok) {
        this.time += c.seconds;
        return true;
      }
      extra = c.seconds;
    }
    this.face = null;
    const area0 = this.areaAt(this.px, this.py);
    this.px = nx;
    this.py = ny;
    this.steps++;
    const g = GROUND_TILES[this.map.ground(nx, ny)];
    const wasWet = GROUND_TILES[this.map.ground(this.px - dx, this.py - dy)].water;
    // Pushing through a bush or scrub takes longer, and thorns may scratch.
    const through = OBJECT_TILES[this.map.object(nx, ny)];
    this.time += ((g.water === 'deep' ? SWIM_S : dx && dy ? DIAG_S : STEP_S) + (step === 'cliff' ? 0 : extra) + squeeze + (through?.slow ?? 0)) * this.loadSlow() + (step === 'cliff' ? extra : 0);
    if (through?.hurt && this.dice.random() < through.hurt) {
      this.say(`The ${through.name === 'scrub' ? 'thorny scrub' : through.name} scratches you.`);
      this.onScratch();
    }
    if (step !== 'cliff') this.activity = g.water === 'deep' ? 'swim' : 'walk';
    if (g.water !== wasWet && !quiet) {
      if (g.water === 'deep') this.say('You swim out into deep water.');
      else if (g.water === 'shallow') this.say('You wade into the water.');
      else if (wasWet) this.say('You climb out onto dry ground.');
    }
    const area1 = this.areaAt(nx, ny);
    if (area1 !== area0 && area1) this.say(`${cap(area1)}.`);
    this.onNoise('step', nx, ny, this.z, dx || dy ? (dx > 0 ? 'e' : dx < 0 ? 'w' : dy < 0 ? 'n' : 's') : this.facing);
    return true;
  }

  /** Runs in a direction until something is worth stopping for. */
  run(dx: number, dy: number): void {
    let n = 0;
    while (n < 60) {
      const area = this.areaAt(this.px, this.py);
      // Running does not carry on into deep water.
      if (n > 0 && this.swim(this.px + dx, this.py + dy) && !this.swim(this.px, this.py)) break;
      if (!this.move(dx, dy, n > 0)) break;
      n++;
      this.refreshSight();
      if (this.areaAt(this.px, this.py) !== area) break;
      // Stop beside a door or a way down.
      let stop = false;
      for (const [ax, ay] of DIRS8) {
        const o = OBJECT_TILES[this.map.object(this.px + ax, this.py + ay)];
        if (o.toggle || o.name.endsWith('entrance') || o.name === 'cave_mouth' || STAIRS_UP.has(o.name) || STAIRS_DOWN.has(o.name)) stop = true;
      }
      if (stop) break;
    }
    this.refresh();
  }

  private refreshSight(): void {
    this.computeSight();
  }


  /** Opens or closes a door (or gate) at a tile. */
  toggle(x: number, y: number, wantOpen: boolean | null, quiet = false): boolean {
    const o = OBJECT_TILES[this.map.object(x, y)];
    if (!o.toggle) {
      if (!quiet) this.say('There is nothing there to open or close.');
      return false;
    }
    const opening = !o.pass;
    if (wantOpen !== null && wantOpen !== opening) {
      if (!quiet) this.say(`The ${o.name.startsWith('gate') ? 'gate' : 'door'} is already ${opening ? 'shut' : 'open'}.`);
      return false;
    }
    if (!opening && x === this.px && y === this.py) {
      this.say('You are standing in the way.');
      return false;
    }
    this.map.setObject(x, y, objectId(o.toggle)!);
    this.time += DOOR_S;
    this.onNoise('door', x, y, this.z, this.facing);
    this.say(`You ${opening ? 'open' : 'close'} the ${o.name.startsWith('gate') ? 'gate' : 'door'}.`);
    return true;
  }

  /** The way up (or down) underfoot, or a well beside the wanderer to climb down: its tile and where. */
  wayHere(up: boolean): { def: TileDef; x: number; y: number } | null {
    const ways = up ? STAIRS_UP : STAIRS_DOWN;
    const o = OBJECT_TILES[this.map.object(this.px, this.py)];
    if (o && ways.has(o.name) && o.name !== 'well') return { def: o, x: this.px, y: this.py };
    // A well's shaft goes down from the ground only (a well in a cistern below is only a well).
    if (!up && this.z === null) for (const [dx, dy] of DIRS8) {
      const w = OBJECT_TILES[this.map.object(this.px + dx, this.py + dy)];
      if (w?.name === 'well' && !w.pass) return { def: w, x: this.px + dx, y: this.py + dy };
    }
    return null;
  }

  /** The stairs or ladder underfoot (or a well beside) that lead up (or down), if any. */
  stairsHere(up: boolean): TileDef | null {
    return this.wayHere(up)?.def ?? null;
  }

  /**
   * Goes up (or down) the way underfoot (or the well beside) to the level it leads to: the nearest
   * above (or below) whose tile there is the way back down (or up), on a floor or on the ground,
   * however many levels lie between (a deep cave's passage, a sewer's ladder). Returns whether
   * the wanderer went (false if there is no such way, or it leads nowhere yet).
   */
  climbStairs(up: boolean): boolean {
    const way = this.wayHere(up);
    if (!way) return false;
    const { x, y, def } = way;
    const back = up ? STAIRS_DOWN : STAIRS_UP;
    let to: number | null | undefined;
    for (let n = 1; n <= WAY_REACH && to === undefined; n++) {
      const t = this.level + (up ? n : -n);
      const z = this.map.hasFloor(x, y, t) ? t : this.map.level(x, y) === t ? null : undefined;
      if (z === undefined) continue;
      const o = OBJECT_TILES[this.map.objectAt(x, y, z)];
      if (o && back.has(o.name)) to = z;
    }
    if (to === undefined) {
      this.say(this.map.loaded(x, y) ? `${cap(WAY_WORDS[def.name] ?? 'the way')} lead${WAY_WORDS[def.name]?.endsWith('s') ? '' : 's'} nowhere yet.` : 'The way there is still taking shape.');
      return false;
    }
    this.setFloor(to);
    this.px = x;
    this.py = y;
    // Arriving on a way that cannot be stood on (a well): beside it.
    if (!this.map.passable(x, y)) {
      for (const [dx, dy] of DIRS8) if (this.map.passable(x + dx, y + dy)) {
        this.px = x + dx;
        this.py = y + dy;
        break;
      }
    }
    this.time += STAIRS_S * this.loadSlow();
    this.activity = 'walk';
    this.steps++;
    // A building's floors by name; a cave's or a dungeon's places by their own.
    const fw = this.floorWords(), area = this.areaAt(this.px, this.py);
    const dest = /floor|cellar|basement|attic/.test(fw) ? ` to ${fw}` : '';
    this.say(`You ${up ? 'climb' : 'go down'} ${WAY_WORDS[def.name] ?? 'the way'}${dest}.`);
    if (area && !dest) this.say(`${cap(area)}.`);
    return true;
  }

  /** The floor the wanderer is on, in words ("the first floor", "the cellar"). */
  floorWords(): string {
    const area = this.areaAt(this.px, this.py);
    // The building's floor names it ("Town house, first floor: bedroom").
    const m = /, ([^:,]+):/.exec(area) ?? /, ([^:,]+)$/.exec(area);
    if (this.z !== null && m) return `the ${m[1]}`;
    if (this.z === null) return GROUND_TILES[this.map.ground(this.px, this.py)]?.name.startsWith('floor_') ? 'the ground floor' : 'the ground';
    return '';
  }

  /**
   * Sets the wanderer on open ground near where they are, if they stand somewhere they could not
   * (after travelling, the travel map puts them at a chunk's middle). False until the chunks there
   * have come.
   */
  /** Open ground: walkable and out of doors (not a building's floor). */
  private outdoors(x: number, y: number): boolean {
    return this.map.passable(x, y) && !GROUND_TILES[this.map.ground(x, y)].name.startsWith('floor_');
  }

  /**
   * Puts the wanderer on open ground out of doors near where they are (after travelling, or
   * arriving at a place in a town): never inside a building or a wall.
   */
  ensureFooting(): boolean {
    if (!this.map.loaded(this.px, this.py)) return false;
    // On a floor of a building (a saved game): stay there, if the floor is there to stand on.
    if (this.z !== null) {
      if (this.map.passable(this.px, this.py)) return true;
      this.setFloor(null);
    }
    if (this.outdoors(this.px, this.py)) return true;
    for (let r = 1; r <= 64; r++) {
      let best: [number, number] | null = null, bd = Infinity;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = this.px + dx, y = this.py + dy;
        if (!this.map.loaded(x, y) || !this.outdoors(x, y)) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = [x, y];
        }
      }
      if (best) {
        [this.px, this.py] = best;
        this.refresh();
        return true;
      }
    }
    return true;
  }

  wait(): void {
    this.time += WAIT_S;
    this.say('You wait a moment.');
  }

  areaAt(x: number, y: number): string {
    return this.map.tile(x, y)?.area ?? '';
  }

  /** Where the wanderer is: the room, the settlement, or the wilds and the nearest place. */
  updateHud(): void {
    const t = this.map.tile(this.px, this.py);
    const mx = (this.px + 0.5) * TILE_M, my = -(this.py + 0.5) * TILE_M;
    let inside: LocalSite | null = null, nearest: LocalSite | null = null, nd = Infinity;
    for (const s of this.sites) {
      const d = Math.hypot(s.x - mx, s.y - my);
      if (d < s.radiusM && (!inside || s.radiusM < inside.radiusM)) inside = s;
      if (d - s.radiusM < nd) {
        nd = d - s.radiusM;
        nearest = s;
      }
    }
    this.hud.place = t?.area ? cap(t.area) : inside ? `${inside.name}` : 'The wilds';
    this.hud.town = inside && inside.tier !== 'village' ? { id: inside.id, name: inside.name, tier: inside.tier } : null;
    if (inside) this.hud.where = `${inside.name}, a ${inside.tier}`;
    else if (nearest) {
      const dx = nearest.x - mx, dy = nearest.y - my;
      const dir = compassWord(bearing(dx, dy), true);
      const km = Math.max(0, Math.hypot(dx, dy) / 1000);
      this.hud.where = `${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} ${dir} of ${nearest.name}`;
    } else this.hud.where = '';
    if (t) this.hud.where += ` · ${GROUND_TILES[t.ground].look}, ${t.elev} m`;
    this.hud.clock = this.clockText();
    this.hud.loading = this.map.waiting;
    this.onTime(this.time);
  }

  /** What can be told of a tile. */
  describe(x: number, y: number): string[] {
    // From a floor, past its edge: the open air, and the ground below.
    if (this.z !== null && this.map.loaded(x, y) && !this.map.hasFloor(x, y, this.z)) {
      const below = this.map.tileAt(x, y, null), dl = this.z - this.map.level(x, y);
      if (dl <= 0 || !below) return ['Solid earth.'];
      if (!this.isVisible(x, y) && !this.map.wasSeenAt(x, y, null)) return ['You have not seen that.'];
      const o = OBJECT_TILES[below.object];
      return ['Open air.', `Below, ${levelWords(-dl).replace(' below you', ' down')}: ${o && o.name !== 'none' ? `${o.look} on ` : ''}${GROUND_TILES[below.ground].look}.`];
    }
    const t = this.map.tile(x, y);
    if (!t) return ['Unknown land.'];
    const seen = this.isVisible(x, y);
    if (!seen && !this.map.wasSeen(x, y)) return ['You have not seen that.'];
    const out: string[] = [];
    if (x === this.px && y === this.py) out.push('You.');
    const who = seen ? this.personAt(x, y, this.z) : null;
    if (who) out.push(...who.lines);
    const o = OBJECT_TILES[t.object];
    const tree = t.object ? treeAt(this.map, x, y) : null;
    if (tree) out.push(`${cap(o.name === 'tree_trunk' ? `the trunk of ${treeWords(tree)}` : treeWords(tree))}.`);
    else if (t.object) out.push(cap(o.look) + '.');
    out.push(`${cap(GROUND_TILES[t.ground].look)}.`);
    if (t.area) out.push(cap(t.area) + '.');
    if (this.z === null) {
      const dl = this.map.level(x, y) - this.map.level(this.px, this.py);
      if (dl) out.push(`${cap(levelWords(dl))} (${Math.abs(t.elev - this.map.elev(this.px, this.py))} m ${dl > 0 ? 'higher' : 'lower'}).`);
    }
    const tracks = seen ? this.tracksText(x, y, this.z) : null;
    if (tracks) out.push(tracks);
    const things = this.ground.at(x, y);
    if (things.length && seen) out.push(`${t.object ? 'In it' : 'Lying here'}: ${things.slice(0, 4).map((i) => itemName(i, true)).join(', ')}${things.length > 4 ? ', and more' : ''}.`);
    const d = Math.hypot(x - this.px, y - this.py) * TILE_M;
    out.push(seen ? `${d < 1 ? 'Here' : `${Math.round(d)} m away`}.` : 'As you remember it.');
    return out;
  }
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
