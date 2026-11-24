/**
 * The base senses of every actor, the wanderer among them (docs/design/npcs.md, Senses, noise and
 * tracks; Stage 1 step 4): noises and tracks.
 *
 * - **Noise.** An action makes a noise with a loudness at a tile from it (a step on stone 30, on
 *   soft ground 18, in water 40; a door 45; speech 50; a smith's hammering 75; a shout 75). It falls
 *   by about 6 a doubling of the distance, by 15 a level between floors, and by 6 for each wall or
 *   shut door in the way (to 30 at most). Whoever hears it above their threshold (by their Hearing:
 *   15, less 1.5 for each point above 10) hears it.
 * - **Tracks.** Moving over soft ground (mud, sand, snow, earth, fields and yards; grass and paths
 *   too when wet) leaves tracks on the tile: whose (by kind and size), which way, when. They fade
 *   in two days; rain washes out, and falling snow covers, any older than an hour. Reading them is
 *   the Tracking skill: what made them, how many, how old, which way.
 */
import { GROUND_TILES } from '@worldforge/core/local/tiles';
import type { Facing } from '@worldforge/core/local/tiles';
import type { Spot } from '../worker/protocol';
import { SPECIES_BY_ID } from '@worldforge/core/local/fauna';

export type NoiseKind = 'step' | 'door' | 'work' | 'speech' | 'shout';

/** A noise: where, how loud a tile from it, what, and who made it ('player', or a resident's id). */
export interface Noise extends Spot {
  loud: number;
  kind: NoiseKind;
  by: string;
  /** What it is, in words, for the log ("hammering", "a door"). */
  what: string;
}

/** What hearing needs of the map. */
export interface HearMap {
  transparentAt(x: number, y: number, z: number | null): boolean;
  level(x: number, y: number): number;
}

/** Loudness a tile away, by kind. */
export const LOUD = { stepHard: 30, stepSoft: 18, stepWater: 40, door: 45, speech: 50, work: 60, hammer: 75, shout: 75 };

/** The threshold of hearing for a Hearing of `hearing` (10 the common run). */
export function hearingThreshold(hearing: number): number {
  return 15 - (hearing - 10) * 1.5;
}

/** How loud a noise is where a listener stands (minus infinity: not at all). */
export function heardLevel(map: HearMap, n: Noise, at: Spot): number {
  const dx = at.x - n.x, dy = at.y - n.y;
  const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  let level = n.loud - 20 * Math.log10(d);
  const lz = (s: Spot) => s.z ?? map.level(s.x, s.y);
  if (n.z !== at.z) level -= 15 * Math.max(1, Math.abs(lz(n) - lz(at)));
  // Walls and shut doors between (on the noise's floor): a line from one to the other.
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  let walls = 0;
  for (let i = 1; i < steps && walls < 5; i++) {
    const x = Math.round(n.x + (dx * i) / steps), y = Math.round(n.y + (dy * i) / steps);
    if (!map.transparentAt(x, y, n.z)) walls++;
  }
  return level - 6 * walls;
}

/** The way from one tile to another in words ("to the north-east"), or "close by". */
export function directionWords(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) <= 1) return 'close by';
  const a = Math.atan2(-dy, dx);
  const names = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'];
  return `to the ${names[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]}`;
}

// ---- Tracks ------------------------------------------------------------------------------------------

/** A track on a tile. */
export interface Track {
  /** When it was made (game seconds). */
  t: number;
  /** Who made it ('player', or a resident's id), their kind of people, and whether a child. */
  by: string;
  kind: string;
  young?: boolean;
  dir: Facing;
  /** Blood, not a print: left by the wounded on any ground (combat.md, stage 2). */
  blood?: boolean;
  /** Pressed into lying snow (backlog W2): plain to anyone, and kept until fresh snow or a thaw. */
  snow?: boolean;
  /** Not a print but a sign on firm ground (bent grass, a scuff, droppings; fieldcraft.md, stage 2): not drawn, and read only by a tracker. */
  faint?: boolean;
}

/** Ground that always takes tracks, and ground that takes them when wet. */
const SOFT = new Set(['mud', 'marsh', 'sand', 'desert_sand', 'snow', 'dirt', 'dry_earth', 'field', 'vineyard', 'garden_bed', 'ditch', 'yard', 'mound', 'spoil', 'grave_ground', 'floor_earth', 'cave_floor', 'forest_floor', 'jungle_floor']);
const SOFT_WET = new Set(['grass', 'grass_lush', 'grass_dry', 'lawn', 'path', 'track', 'road', 'moss', 'tundra', 'needle_floor']);
/** How long tracks last (seconds), and how long fresh ones last under rain or falling snow. */
const LAST_S = 2 * 86400, WASHED_S = 3600;
/** How long a print in snow lasts, if no fresh snow falls on it. */
const SNOW_S = 6 * 86400;
const lasts = (t: Track) => (t.snow ? SNOW_S : LAST_S);
/** At most this many tracks a tile (the newest kept). */
const PER_TILE = 6;

const key = (x: number, y: number, z: number | null) => ((x + 1048576) * 2097152 + (y + 1048576)) * 128 + (z === null ? 127 : z + 63);

/** Whether a kind of ground takes tracks (when wet, more kinds do). */
export function takesTracks(groundId: number, wet: boolean): boolean {
  const name = GROUND_TILES[groundId]?.name ?? '';
  return SOFT.has(name) || (wet && SOFT_WET.has(name));
}

export class Tracks {
  private tiles = new Map<number, Track[]>();

  get size(): number {
    return this.tiles.size;
  }

  /** Leaves a track on a tile. */
  /** Snow lies on the ground (the session sets it as the weather changes): prints out of doors are made in it. */
  snowy = false;

  add(x: number, y: number, z: number | null, tr: Track): void {
    if (this.snowy && z === null && !tr.blood) tr = { ...tr, snow: true };
    const k = key(x, y, z);
    const l = this.tiles.get(k) ?? [];
    l.push(tr);
    if (l.length > PER_TILE) l.shift();
    this.tiles.set(k, l);
  }

  /** Whether there is blood on a tile still to be seen (for drawing). */
  bloodAt(x: number, y: number, z: number | null, now: number): boolean {
    return this.at(x, y, z, now).some((t) => t.blood);
  }

  /** The tracks on a tile still to be seen at a time, newest last. */
  at(x: number, y: number, z: number | null, now: number): Track[] {
    return (this.tiles.get(key(x, y, z)) ?? []).filter((t) => now - t.t < lasts(t) && t.t <= now);
  }

  /** The tracks a maker left within `r` tiles of a place, on the ground, still to be seen: where and when, oldest first. */
  ofMaker(by: string, x: number, y: number, r: number, now: number): { x: number; y: number; t: number }[] {
    const out: { x: number; y: number; t: number }[] = [];
    for (const [k, l] of this.tiles) {
      const tz = k % 128;
      if (tz !== 127) continue;
      const rest = (k - tz) / 128, ty = (rest % 2097152) - 1048576, tx = Math.floor(rest / 2097152) - 1048576;
      if (Math.abs(tx - x) > r || Math.abs(ty - y) > r) continue;
      for (const t of l) if (t.by === by && !t.blood && now - t.t < lasts(t) && t.t <= now) out.push({ x: tx, y: ty, t: t.t });
    }
    return out.sort((a, b) => a.t - b.t);
  }

  /** Lets old tracks go; rain or falling snow wash out (or cover) all but the freshest. */
  weather(now: number, washing: boolean): void {
    for (const [k, l] of this.tiles) {
      const keep = l.filter((t) => now - t.t < (washing ? WASHED_S : lasts(t)) && (t.snow ? this.snowy : true));
      if (keep.length) this.tiles.set(k, keep);
      else this.tiles.delete(k);
    }
  }

  /** Forgets those far from a place (beyond `r` tiles), for leaving the bubble. */
  keepNear(x: number, y: number, r: number): void {
    for (const k of this.tiles.keys()) {
      const tz = k % 128, rest = (k - tz) / 128, ty = (rest % 2097152) - 1048576, tx = Math.floor(rest / 2097152) - 1048576;
      if (Math.abs(tx - x) > r || Math.abs(ty - y) > r) this.tiles.delete(k);
    }
  }

  /** For saving: [x, y, z (null on the ground), tracks]. */
  export(): [number, number, number | null, Track[]][] {
    const out: [number, number, number | null, Track[]][] = [];
    for (const [k, l] of this.tiles) {
      const tz = k % 128, rest = (k - tz) / 128, ty = (rest % 2097152) - 1048576, tx = Math.floor(rest / 2097152) - 1048576;
      out.push([tx, ty, tz === 127 ? null : tz - 63, l.map((t) => ({ ...t }))]);
    }
    return out;
  }

  import(data: [number, number, number | null, Track[]][] | undefined): void {
    this.tiles.clear();
    for (const [x, y, z, l] of data ?? []) this.tiles.set(key(x, y, z), l.map((t) => ({ ...t })));
  }
}

/** Ages in words. */
function ageWords(s: number): string {
  if (s < 600) return 'fresh';
  if (s < 3 * 3600) return 'an hour or two old';
  if (s < 12 * 3600) return 'some hours old';
  if (s < 30 * 3600) return 'about a day old';
  return 'old';
}
const WAY: Record<Facing, string> = { n: 'north', s: 'south', e: 'east', w: 'west' };
const KIND_WORD: Record<string, string> = { human: 'a person', elf: 'an elf', dwarf: 'a dwarf', halfling: 'a halfling', orc: 'an orc', lizard: 'a lizard-folk', gnome: 'a gnome', fungus: 'one of the mushroom folk' };

/**
 * What the wanderer reads in the tracks on a tile, by their Tracking: that there are footprints;
 * from 15, how many and how old; from 30, which way they go; from 45, whose (a dwarf's, a child's,
 * their own).
 */
export function readTracks(ts: Track[], now: number, tracking: number): string | null {
  if (!ts.length) return null;
  // Blood: anyone sees it; Tracking reads whose, how fresh, and which way it went.
  const blood = ts.filter((t) => t.blood);
  const prints = ts.filter((t) => !t.blood);
  let bloodText = '';
  if (blood.length) {
    const b = blood[blood.length - 1];
    const sp = b.kind.startsWith('animal:') ? SPECIES_BY_ID.get(b.kind.slice(7)) : null;
    const whose = b.by === 'player' ? ' (your own)' : tracking >= 25 && sp ? ` (a wounded ${sp.name}'s)` : '';
    bloodText = `Blood on the ground${whose}${tracking >= 15 ? `, ${ageWords(now - b.t)}` : ''}${tracking >= 30 ? `, the trail going ${WAY[b.dir]}` : ''}.`;
  }
  if (!prints.length) return bloodText;
  const printText = readPrints(prints, now, tracking);
  return bloodText ? `${bloodText} ${printText}` : printText;
}

function readPrints(all: Track[], now: number, tracking: number): string {
  // Signs on firm ground are for a tracker's eye only.
  const ts = tracking >= 20 ? all : all.filter((t) => !t.faint);
  if (!ts.length) return '';
  // In snow the prints are plain: anyone reads them as a fair tracker would.
  if (ts.some((t) => t.snow)) tracking = Math.max(tracking + 30, 45);
  if (tracking < 15) return ts.every((t) => t.kind.startsWith('animal:')) ? 'Tracks in the ground.' : 'Footprints in the ground.';
  const by = new Set(ts.map((t) => t.by));
  const newest = ts[ts.length - 1];
  const beasts = ts.every((t) => t.kind.startsWith('animal:'));
  let out = `${beasts ? 'Tracks' : 'Footprints'}: ${by.size === 1 ? (beasts ? 'one beast, or one herd' : 'one walker') : by.size <= 3 ? `${by.size} ${beasts ? 'beasts or herds' : 'walkers'}` : 'many'}, the newest ${ageWords(now - newest.t)}`;
  if (tracking >= 30) {
    const ways = [...new Set(ts.slice(-3).map((t) => WAY[t.dir]))];
    out += `, going ${ways.join(' and ')}`;
  }
  if (tracking >= 45) {
    const own = ts.some((t) => t.by === 'player');
    const kinds = [...new Set(ts.filter((t) => t.by !== 'player').map((t) => {
      if (t.kind.startsWith('animal:')) {
        const sp = SPECIES_BY_ID.get(t.kind.slice(7));
        return sp ? `${/^[aeiou]/.test(sp.name) ? 'an' : 'a'} ${sp.name}` : 'a beast';
      }
      return t.young ? 'a child' : KIND_WORD[t.kind] ?? 'a person';
    }))];
    const whose = [...(own ? ['your own'] : []), ...kinds.slice(0, 3)];
    if (whose.length) out += ` (${whose.join(', ')})`;
  }
  return `${out}.`;
}

// ---- Trails ------------------------------------------------------------------------------------------

/** What laying a trail needs of the map. */
export interface TrailMap {
  loaded(x: number, y: number): boolean;
  passableAt(x: number, y: number, z: number | null): boolean;
  groundAt(x: number, y: number, z: number | null): number;
}

/**
 * Lays the trail a beast (or a herd) left on its way to where it is now (fieldcraft.md, stage 2):
 * from `to` back along a wandering way of `steps` tiles, bending toward `toward` if given (so that
 * it passes near there), the newest track at `to` (made at `newest`) and each step back older by
 * `perStep` seconds. Prints where the ground takes them, faint signs elsewhere; none on water or
 * indoors. `r` is the trail's own draw (seeded, so the same beast lays the same trail).
 */
export function layTrail(tracks: Tracks, map: TrailMap, o: { by: string; kind: string; to: Spot; steps: number; newest: number; perStep: number; toward?: Spot; r: () => number }): number {
  let x = o.to.x, y = o.to.y, t = o.newest, laid = 0;
  // A heading to walk back along, changing a little each step.
  let hx = o.toward ? o.toward.x - x : o.r() * 2 - 1, hy = o.toward ? o.toward.y - y : o.r() * 2 - 1;
  const seen = new Set<string>([`${x},${y}`]);
  const facing = (dx: number, dy: number): Facing => (Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n');
  let lastDir: Facing = 's';
  for (let i = 0; i < o.steps; i++) {
    // The tile the beast came from: the open neighbour most along the heading, with a little wander.
    if (o.toward) {
      hx = hx * 0.7 + (o.toward.x - x) * 0.3;
      hy = hy * 0.7 + (o.toward.y - y) * 0.3;
    }
    hx += (o.r() - 0.5) * 0.8;
    hy += (o.r() - 0.5) * 0.8;
    const len = Math.hypot(hx, hy) || 1;
    let best: [number, number] | null = null, bs = -Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (seen.has(`${nx},${ny}`) || !map.loaded(nx, ny) || !map.passableAt(nx, ny, null)) continue;
      const sc = (dx * hx + dy * hy) / len / Math.hypot(dx, dy) + o.r() * 0.3;
      if (sc > bs) {
        bs = sc;
        best = [nx, ny];
      }
    }
    // Its track here, facing the way it went (from there to here).
    const dir: Facing = best ? facing(x - best[0], y - best[1]) : lastDir;
    const g = GROUND_TILES[map.groundAt(x, y, null)];
    if (g && !g.water && !g.name.startsWith('floor_')) {
      tracks.add(x, y, null, { t: Math.round(t), by: o.by, kind: o.kind, dir, ...(takesTracks(map.groundAt(x, y, null), false) ? {} : { faint: true }) });
      laid++;
    }
    lastDir = dir;
    if (!best || (o.toward && Math.abs(x - o.toward.x) <= 1 && Math.abs(y - o.toward.y) <= 1)) break;
    [x, y] = best;
    seen.add(`${x},${y}`);
    t -= o.perStep;
  }
  return laid;
}
