/**
 * The game's rules for Phase 2: one wanderer on the local map, moving a tile at a time. Every
 * action takes time on the game clock; sight is worked out after each one (rot.js shadowcasting).
 */
import { FOV } from 'rot-js';
import { CHUNK, TILE_M } from '@worldforge/core/local/chunk';
import { GROUND_TILES, OBJECT_TILES, objectId } from '@worldforge/core/local/tiles';
import { GameMap } from './map';
import { Discovery, FOOT_SIGHT_M } from './discovery';
import type { LocalSite } from '../worker/protocol';

/** Seconds an action takes. */
export const STEP_S = 1.2;
export const DIAG_S = 1.7;
export const DOOR_S = 2;
export const WAIT_S = 5;
/** Seconds to swim a tile of deep water. */
export const SWIM_S = 4;
/** How far the wanderer sees by day, in tiles. */
export const SIGHT = 30;

export interface Hud {
  place: string;
  where: string;
  clock: string;
  log: { t: string; text: string }[];
  look: string[];
  mode: 'play' | 'look' | 'open' | 'close';
  loading: number;
  /** The town or city the wanderer is in (for its city view), if any. */
  town?: { id: string; name: string; tier: string } | null;
}

const vkey = (x: number, y: number) => (x + 1048576) * 2097152 + (y + 1048576);
const DIRS8: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class Game {
  px: number;
  py: number;
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
  /** Called whenever the clock may have moved (after every action and travel step). */
  onTime: (time: number) => void = () => {};

  constructor(readonly map: GameMap, start: [number, number], readonly sites: LocalSite[], readonly startName: string, readonly hud: Hud) {
    [this.px, this.py] = start;
    this.fov = new FOV.PreciseShadowcasting((x: number, y: number) => (x === this.px && y === this.py) || this.map.transparent(x, y), { topology: 8 });
    this.say(`You stand in ${startName}.`);
  }

  isVisible(x: number, y: number): boolean {
    return this.visible.has(vkey(x, y));
  }

  /** Asks for the chunks round the wanderer, and works out sight. */
  refresh(): void {
    const r = SIGHT + CHUNK / 2;
    this.map.want(this.px - r, this.py - r, this.px + r, this.py + r);
    this.discovery.reveal(this.px, this.py, FOOT_SIGHT_M);
    this.visible.clear();
    this.fov.compute(this.px, this.py, SIGHT, (x: number, y: number) => {
      if (!this.map.loaded(x, y)) return;
      this.visible.add(vkey(x, y));
      this.map.markSeen(x, y);
    });
    this.updateHud();
    this.onChange();
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
    if (!this.map.loaded(nx, ny)) {
      if (!quiet) this.say('The land there is still taking shape.');
      return false;
    }
    const obj = OBJECT_TILES[this.map.object(nx, ny)];
    if (!this.pass(nx, ny)) {
      if (obj.toggle) return this.toggle(nx, ny, true, quiet);
      if (!quiet) {
        const g = GROUND_TILES[this.map.ground(nx, ny)];
        this.say(`${cap(obj.name !== 'none' ? obj.look : g.look)} blocks the way.`);
      }
      return false;
    }
    // No squeezing diagonally between two things that block.
    if (dx && dy && !this.pass(this.px + dx, this.py) && !this.pass(this.px, this.py + dy)) {
      if (!quiet) this.say('There is no room to slip through.');
      return false;
    }
    const area0 = this.areaAt(this.px, this.py);
    this.px = nx;
    this.py = ny;
    const g = GROUND_TILES[this.map.ground(nx, ny)];
    const wasWet = GROUND_TILES[this.map.ground(this.px - dx, this.py - dy)].water;
    this.time += g.water === 'deep' ? SWIM_S : dx && dy ? DIAG_S : STEP_S;
    if (g.water !== wasWet && !quiet) {
      if (g.water === 'deep') this.say('You swim out into deep water.');
      else if (g.water === 'shallow') this.say('You wade into the water.');
      else if (wasWet) this.say('You climb out onto dry ground.');
    }
    const area1 = this.areaAt(nx, ny);
    if (area1 !== area0 && area1) this.say(`${cap(area1)}.`);
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
        if (o.toggle || o.name.endsWith('entrance') || o.name === 'cave_mouth') stop = true;
      }
      if (stop) break;
    }
    this.refresh();
  }

  private refreshSight(): void {
    this.visible.clear();
    this.fov.compute(this.px, this.py, SIGHT, (x: number, y: number) => {
      if (this.map.loaded(x, y)) {
        this.visible.add(vkey(x, y));
        this.map.markSeen(x, y);
      }
    });
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
    this.say(`You ${opening ? 'open' : 'close'} the ${o.name.startsWith('gate') ? 'gate' : 'door'}.`);
    return true;
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
      const dir = COMPASS[Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) / 45) % 8];
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
    const t = this.map.tile(x, y);
    if (!t) return ['Unknown land.'];
    const seen = this.isVisible(x, y);
    if (!seen && !this.map.wasSeen(x, y)) return ['You have not seen that.'];
    const out: string[] = [];
    if (x === this.px && y === this.py) out.push('You.');
    const o = OBJECT_TILES[t.object];
    if (t.object) out.push(cap(o.look) + '.');
    out.push(`${cap(GROUND_TILES[t.ground].look)}.`);
    if (t.area) out.push(cap(t.area) + '.');
    const d = Math.hypot(x - this.px, y - this.py) * TILE_M;
    out.push(seen ? `${d < 1 ? 'Here' : `${Math.round(d)} m away`}.` : 'As you remember it.');
    return out;
  }
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
