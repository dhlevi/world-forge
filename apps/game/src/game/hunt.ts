/**
 * Hunting by tracking (docs/design/fieldcraft.md, stage 2).
 *
 * - **Signs on the travel map.** Now and then as the party travels, a tracker notices signs of game
 *   off to the side (Tracking): the tracks of a herd of deer, a boar's rooting. Each is marked on the
 *   travel map for half a day. **Hunt** (an hour) searches the country about for more. Which game,
 *   and how much, follows the region's wild beasts (worker/fauna.ts, `gameAt`).
 * - **Taking up a trail.** At a sign, the party goes onto the local map: the beasts are placed some
 *   way off, and their trail runs from them back past where the hunter stands (world/fauna.ts,
 *   `pin`; world/senses.ts, `layTrail`). Every wild herd on the local map has its trail too.
 * - **Following a trail** (the skill menu on a track): a Tracking check reads it ahead (further on a
 *   good read, harder when it is old, faint on firm ground or in the dark, easy in snow); the trail
 *   read is marked on the map, and the hunter follows it, stopping when the beasts come in sight.
 *
 * Signs are not saved with the game. Proposed numbers, to tune in play.
 */
import { CHUNK, TILE_M } from '@worldforge/core/local/chunk';
import { SPECIES_BY_ID } from '@worldforge/core/local/fauna';
import { GROUND_TILES } from '@worldforge/core/local/tiles';
import { check, DC, type Grade, type Mod } from '../actors/checks';
import { Skills } from '../actors/components';
import type { AnimalGroup, RouteStep } from '../worker/protocol';
import { bearing, compassWord } from '../util';
import type { PlaySession } from './session';

/** Signs of game marked on the travel map. */
export interface GameSign {
  id: string;
  /** Where (local tiles, and lon/lat for the map). */
  x: number;
  y: number;
  lon: number;
  lat: number;
  species: string;
  /** How many beasts. */
  n: number;
  /** When the tracks were made, and when they were found. */
  made: number;
  found: number;
}

/** How long a sign is marked (s). */
const SIGN_S = 12 * 3600;
/** The chance a step of travel brings a look for signs. */
const PER_STEP = 0.05;
/** Near enough to a sign to take up its trail (m). */
const NEAR_M = 400;
/** How far a trail is read ahead, by the grade of the Tracking check (tiles); a skilled tracker reads further (`readAhead`). */
const READ: Record<Grade, number> = { fine: 100, success: 70, near: 35, fail: 0, fumble: 0 };
/** Tiles read ahead: by the grade, and a half more for a master (Tracking 100). */
export const readAhead = (grade: Grade, level: number) => Math.round(READ[grade] * (1 + Math.max(0, Math.min(100, level)) / 200));
/** How far about the hunter a trail taken up from the travel map is read at once (tiles), by Tracking. */
export const takenUpRead = (level: number) => 8 + Math.round(Math.max(0, Math.min(100, level)) * 0.4);

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** Which way an offset (tiles east and south) lies, in words. */
const way = (dx: number, dy: number) => compassWord(bearing(dx, -dy));
const hoursWords = (s: number) => (s < 5400 ? 'about an hour old' : s < 3 * 3600 ? 'a couple of hours old' : `some ${Math.round(s / 3600)} hours old`);

/** Snares this near one another (tiles) are one site on the travel map. */
const TRAP_NEAR = 40;

/** A site of the wanderer's snares, for the travel map: its middle, how many, how many have caught. */
export interface TrapSite {
  id: string;
  x: number;
  y: number;
  lon: number;
  lat: number;
  n: number;
  caught: number;
}

export class Hunting {
  signs: GameSign[] = [];
  /** The trail read and marked on the local map: tiles, until when, and whose. */
  trail: { by: string; species: string; tiles: Set<string>; until: number } | null = null;
  private cache = new Map<string, { id: string; density: number }[]>();
  /** A sign whose trail is being taken up, once the local map is ready. */
  private pending: GameSign | null = null;
  private count = 0;

  constructor(private readonly s: PlaySession) {}

  private get g() {
    return this.s.game;
  }

  /** The signs still fresh. */
  live(): GameSign[] {
    const now = this.g.time;
    this.signs = this.signs.filter((x) => now - x.found < SIGN_S);
    return this.signs;
  }

  /** The wild game where the party is (asked of the worker, kept by place and season). */
  private async gameHere(): Promise<{ id: string; density: number }[]> {
    const [lon, lat] = this.s.travel.party();
    const winter = this.s.sky.season === 'winter';
    const k = `${Math.round(lon * 8)},${Math.round(lat * 8)},${winter}`;
    let hit = this.cache.get(k);
    if (!hit) {
      hit = (await this.s.world.game?.(lon, lat, winter)) ?? [];
      if (this.cache.size > 200) this.cache.clear();
      this.cache.set(k, hit);
    }
    return hit;
  }

  /** A step of travel: now and then, a look about for signs of game. */
  onTravelStep(_st: RouteStep): void {
    if (this.g.dice.random() < PER_STEP) void this.lookForSigns('travel');
  }

  /**
   * Looks about for signs of game (Tracking): on the road in passing, or searching (Hunt), which
   * finds more and further. Returns how many were found.
   */
  async lookForSigns(how: 'travel' | 'search'): Promise<number> {
    const a = this.s.player;
    if (!a) return 0;
    const list = await this.gameHere();
    const total = list.reduce((s, x) => s + x.density, 0);
    if (!total) return 0;
    const g = this.g, sky = this.s.sky;
    const mods: Mod[] = [];
    if (sky.snowCm >= 2) mods.push({ why: 'tracks in the snow', value: 15 });
    if (sky.w.rainMm > 1) mods.push({ why: 'the rain', value: -10 });
    if (sky.light < 0.2) mods.push({ why: 'the dark', value: -20 });
    // Rich country has more to find.
    mods.push({ why: total >= 1 ? 'game is plentiful' : total < 0.3 ? 'game is scarce' : 'game', value: Math.round(Math.max(-15, Math.min(10, (total - 0.6) * 15))) });
    const r = check(a, 'tracking', { difficulty: how === 'travel' ? DC.easy + 5 : DC.easy - 5, mods, now: g.time });
    const n = how === 'travel' ? (r.ok ? 1 : 0) : ({ fine: 2, success: 1, near: 0, fail: 0, fumble: 0 } as Record<Grade, number>)[r.grade];
    const found: GameSign[] = [];
    for (let i = 0; i < n; i++) {
      // Which beast, by how many of each there are.
      let u = g.dice.random() * total, pick = list[0];
      for (const x of list) {
        u -= x.density;
        if (u <= 0) {
          pick = x;
          break;
        }
      }
      const sp = SPECIES_BY_ID.get(pick.id);
      if (!sp) continue;
      const ang = g.dice.random() * Math.PI * 2, cells = how === 'travel' ? 2 + g.dice.random() * 4 : 1.5 + g.dice.random() * 6;
      const x = Math.round(g.px + Math.cos(ang) * cells * CHUNK), y = Math.round(g.py + Math.sin(ang) * cells * CHUNK);
      const [lon, lat] = this.s.travel.frame.toLL([(x + 0.5) * TILE_M, -(y + 0.5) * TILE_M]);
      const age = (0.5 + g.dice.random() * (how === 'travel' ? 4 : 6)) * 3600;
      const sign: GameSign = { id: `sign${g.time.toString(36)}${this.count++}`, x, y, lon, lat, species: sp.id, n: sp.group[0] + Math.floor(g.dice.random() * (sp.group[1] - sp.group[0] + 1)), made: g.time - age, found: g.time };
      this.signs.push(sign);
      found.push(sign);
    }
    for (const sg of found) this.s.say(`You come upon ${this.signWords(sg)}, ${way(sg.x - g.px, sg.y - g.py)} of you (marked on the travel map).`);
    if (how === 'search' && !found.length) this.s.say(r.grade === 'near' ? 'You find old signs of game, too old to follow.' : 'You search the country about, but find no sign of game worth following.');
    this.s.travel.onChange();
    return found.length;
  }

  /**
   * The wanderer's snares, gathered into sites for the travel map (fieldcraft.md, stage 3): those
   * within 40 tiles (60 m) of one another are one site, marked at their middle.
   */
  trapSites(): TrapSite[] {
    const left = [...this.s.snares.list], out: TrapSite[] = [];
    while (left.length) {
      const group = [left.shift()!];
      for (let i = 0; i < group.length; i++) {
        for (let j = left.length - 1; j >= 0; j--) {
          if (Math.hypot(left[j].x - group[i].x, left[j].y - group[i].y) <= TRAP_NEAR) group.push(...left.splice(j, 1));
        }
      }
      const x = Math.round(group.reduce((a, s) => a + s.x, 0) / group.length), y = Math.round(group.reduce((a, s) => a + s.y, 0) / group.length);
      const [lon, lat] = this.s.travel.frame.toLL([(x + 0.5) * TILE_M, -(y + 0.5) * TILE_M]);
      out.push({ id: `trap:${group[0].x},${group[0].y}`, x, y, lon, lat, n: group.length, caught: group.filter((s) => s.caught).length });
    }
    return out;
  }

  /** A site of snares in words. */
  trapWords(t: TrapSite): string {
    const n = t.n === 1 ? 'a snare' : `${NUM[t.n] ?? t.n} snares`;
    return `${n} you set${t.caught ? ` (${t.caught === t.n && t.n > 1 ? 'all' : NUM[t.caught] ?? t.caught} with a catch, if nothing has taken it)` : ''}`;
  }

  /** Goes to a site of snares: onto the local map at its middle when near enough, else the way there is planned. */
  goToTraps(t: TrapSite): void {
    if (this.metresTo(t) > NEAR_M) {
      void this.s.travel.setDest([t.lon, t.lat], 'your snares');
      return;
    }
    this.s.toLocalAt(t.lon, t.lat);
    this.s.say(`You come to ${this.trapWords(t)}.`);
  }

  /** A sign in words: "the tracks of three red deer, a couple of hours old". */
  signWords(sg: GameSign): string {
    const sp = SPECIES_BY_ID.get(sg.species);
    const who = !sp ? 'some beast' : sg.n === 1 ? `a ${sp.name}` : `${NUM[sg.n] ?? sg.n} ${sp.plural}`;
    return `the tracks of ${who}, ${hoursWords(this.g.time - sg.made)}`;
  }

  /** Hunt: an hour searching the country about for signs of game (travel map). */
  async search(): Promise<void> {
    const g = this.g;
    this.s.travel.stop();
    g.time += 3600;
    g.activity = 'travel';
    await this.lookForSigns('search');
    g.updateHud();
    this.s.redraw();
  }

  /** Metres from the party to a sign. */
  metresTo(sg: { x: number; y: number }): number {
    return Math.hypot(sg.x - this.g.px, sg.y - this.g.py) * TILE_M;
  }

  /** Takes up a sign's trail: onto the local map there, if near enough; else the way there is planned. */
  takeUp(sg: GameSign): void {
    if (this.metresTo(sg) > NEAR_M) {
      const sp = SPECIES_BY_ID.get(sg.species);
      void this.s.travel.setDest([sg.lon, sg.lat], `the ${sp?.name ?? 'beast'} tracks`);
      return;
    }
    this.signs = this.signs.filter((x) => x !== sg);
    this.pending = sg;
    this.s.toLocal();
    this.update();
  }

  /** Each turn on the local map: a trail being taken up is laid once the map about is made. */
  update(): void {
    const sg = this.pending, g = this.g;
    if (!sg || this.s.state.mode !== 'local' || g.z !== null) return;
    if (!g.map.loaded(g.px + 40, g.py) || !g.map.loaded(g.px - 40, g.py) || !g.map.loaded(g.px, g.py + 40) || !g.map.loaded(g.px, g.py - 40)) return;
    const sp = SPECIES_BY_ID.get(sg.species);
    this.pending = null;
    if (!sp) return;
    // The beasts some way off, on open ground; their trail back past the hunter.
    const open = (x: number, y: number) => g.map.loaded(x, y) && g.map.passableAt(x, y, null) && !GROUND_TILES[g.map.groundAt(x, y, null)]?.water && !this.s.fauna.at(x, y);
    let at: [number, number] | null = null;
    for (let i = 0; i < 60 && !at; i++) {
      const ang = g.dice.random() * Math.PI * 2, d = 26 + g.dice.random() * 14;
      const x = Math.round(g.px + Math.cos(ang) * d), y = Math.round(g.py + Math.sin(ang) * d);
      if (open(x, y)) at = [x, y];
    }
    if (!at) {
      this.s.say('The trail is lost on stony ground.');
      return;
    }
    const members = [{ x: at[0], y: at[1], z: null }];
    for (let i = 0; i < 40 && members.length < sg.n; i++) {
      const x = at[0] + Math.round((g.dice.random() - 0.5) * 6), y = at[1] + Math.round((g.dice.random() - 0.5) * 6);
      if (open(x, y) && !members.some((m) => m.x === x && m.y === y)) members.push({ x, y, z: null });
    }
    // The trail starts a few steps from the hunter, toward the beasts.
    const ang = Math.atan2(at[1] - g.py, at[0] - g.px);
    const from = { x: Math.round(g.px + Math.cos(ang) * 2), y: Math.round(g.py + Math.sin(ang) * 2), z: null };
    const gr: AnimalGroup = { id: `hunt:${sg.id}`, species: sp.id, members, home: { x: at[0], y: at[1], r: 16 }, water: null, trailFrom: from };
    this.s.fauna.pin(gr, g);
    // Read at once about the hunter, the further the better the tracker (any age: the trail is older at this end).
    this.mark(`animal:${gr.id}`, sp.id, g.px, g.py, takenUpRead(this.level()), 0);
    this.s.say(`You take up the trail of ${sg.n === 1 ? `a ${sp.name}` : `the ${sp.plural}`}: it leads off ${way(at[0] - g.px, at[1] - g.py)}. (Right-click a track to follow it.)`);
    this.s.redraw();
  }

  /** The wanderer's Tracking. */
  level(): number {
    return this.s.player?.get(Skills)?.effective('tracking') ?? 0;
  }

  /** Marks the trail a maker left within `r` tiles of a place, newer than `after`, for an hour. */
  private mark(by: string, species: string, x: number, y: number, r: number, after: number): { x: number; y: number; t: number }[] {
    const ahead = this.s.people.tracks.ofMaker(by, x, y, r, this.g.time).filter((t) => t.t > after);
    this.trail = { by, species, tiles: new Set(ahead.map((t) => `${t.x},${t.y}`)), until: this.g.time + 3600 };
    return ahead;
  }

  /** Whether a tile is on the trail marked. */
  onTrail(x: number, y: number): boolean {
    const t = this.trail;
    if (!t || this.g.time > t.until) return false;
    return t.tiles.has(`${x},${y}`);
  }

  /** The freshest beast's tracks on a tile (not the wanderer's, nor people's), if any. */
  beastTrack(x: number, y: number): { by: string; species: string; t: number; faint: boolean } | null {
    const ts = this.s.people.tracks.at(x, y, this.g.z, this.g.time).filter((t) => t.kind.startsWith('animal:') && !t.blood);
    const t = ts[ts.length - 1];
    return t ? { by: t.by, species: t.kind.slice(7), t: t.t, faint: !!t.faint } : null;
  }

  /**
   * Follows the trail from a tile (Tracking): reads it ahead, marks it, and walks along it to the
   * furthest point read, stopping when the beasts come in sight.
   */
  async follow(x: number, y: number): Promise<void> {
    const a = this.s.player, g = this.g;
    const tr = this.beastTrack(x, y);
    if (!a || !tr) {
      this.s.say('There is no trail there to follow.');
      return;
    }
    const sp = SPECIES_BY_ID.get(tr.species);
    const ageH = (g.time - tr.t) / 3600;
    const mods: Mod[] = [];
    if (tr.faint) mods.push({ why: 'firm ground', value: -10 });
    if (this.s.sky.snowCm >= 2) mods.push({ why: 'the snow', value: 20 });
    if (g.ambient.light < 0.2) mods.push({ why: 'the dark', value: -15 });
    const r = check(a, 'tracking', { difficulty: DC.easy + Math.round(Math.min(30, ageH * 4)), mods, now: g.time });
    g.time += 60;
    const reach = readAhead(r.grade, this.level());
    if (!reach) {
      this.s.say(r.grade === 'fumble' ? 'You lose the trail entirely, and cannot tell which way it went.' : 'You cannot make out which way the trail goes from here.');
      return;
    }
    const ahead = this.mark(tr.by, tr.species, x, y, reach, tr.t - 1);
    const last = ahead[ahead.length - 1];
    if (!last || (last.x === x && last.y === y)) {
      this.s.say('The trail ends here, or goes where you cannot read it.');
      return;
    }
    const name = sp?.plural ?? 'beasts';
    this.s.say(`You read the trail of the ${name} ${r.grade === 'fine' ? 'clearly' : r.grade === 'near' ? 'with difficulty' : ''} for ${Math.round(Math.hypot(last.x - x, last.y - y) * TILE_M)} m, going ${way(last.x - x, last.y - y)}.`.replace('  ', ' '));
    // Follow it, quietly if sneaking, until they are seen.
    const herd = tr.by.slice(7);
    const seen = () => [...this.s.fauna.all()].some((b) => b.g.id === herd && g.isVisible(b.x, b.y));
    if (seen()) {
      this.s.say(`The ${name} are in sight.`);
      return;
    }
    await this.s.field.reach(last.x, last.y, true, seen);
    const b = [...this.s.fauna.all()].find((m) => m.g.id === herd && g.isVisible(m.x, m.y));
    if (b) this.s.say(`There: the ${name}, ${Math.round(Math.hypot(b.x - g.px, b.y - g.py) * TILE_M)} m ${way(b.x - g.px, b.y - g.py)} of you.`);
  }
}
