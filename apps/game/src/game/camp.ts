/**
 * Camps (docs/design/navigation.md, Camping; survival.md, Shelter): a place chosen for the night
 * by its shelter, wood, water and how hidden it is, laid out on the local map (a fire, a woodpile,
 * a bed, a shelter, snares about), kept in the save, and returned to.
 *
 * - **The site** is rated from the local map around it: shelter from the wind (trees, rocks and
 *   walls close by), wood (trees and brush within a stone's throw), water (the nearest, in metres)
 *   and how hidden it is (how little can be seen from it, and how far from a road or path).
 * - **The fire** burns its fuel (an armful of firewood, about 3 kg, burns about three hours); it
 *   warms everyone within a few steps, more in a sheltered spot and less in deep cold. Tended
 *   through the night it takes from the woodpile; untended it burns out.
 * - **Shelter:** a tent (carried), a lean-to or a windbreak (built) adds warmth and better sleep;
 *   the tent and lean-to keep off the rain.
 *
 * Everything here works on the camp as data and on the map; what the wanderer does at a camp is
 * game/camping/. Proposed numbers, to tune in play.
 */
import { FOV } from 'rot-js';
import { GROUND_TILES, OBJECT_TILES, objectId } from '@worldforge/core/local/tiles';
import { TILE_M } from '@worldforge/core/local/chunk';
import type { Game } from './game';
import type { Item } from '../actors/items/item';
import type { Grade } from '../actors/checks';

export type ShelterKind = 'tent' | 'lean_to' | 'windbreak';

export const SHELTERS: Record<ShelterKind, { name: string; warmth: number; sleep: number; rain: boolean }> = {
  tent: { name: 'a tent', warmth: 5, sleep: 0.15, rain: true },
  lean_to: { name: 'a lean-to', warmth: 3, sleep: 0.1, rain: true },
  windbreak: { name: 'a windbreak', warmth: 2, sleep: 0.05, rain: false },
};

/** Within this many tiles of its fire, the wanderer is at the camp. */
export const CAMP_R = 4;
/** Kilograms of wood the fire burns an hour, and in an armful. */
export const BURN_KG_H = 1, ARMFUL_KG = 3;
/** A fire's warmth (°C) to those beside it, at best. */
export const FIRE_WARMTH = 10;

export interface SiteRating {
  /** 0 (open to the wind) to 1 (well sheltered). */
  shelter: number;
  /** 0 (nothing to burn) to 1 (plenty). */
  wood: number;
  /** Metres to the nearest water (Infinity: none found near). */
  waterM: number;
  /** 0 (in plain view) to 1 (well hidden). */
  hidden: number;
  /** All together (for choosing). */
  score: number;
}

export interface Snare {
  x: number;
  y: number;
  /** When set, and how well (Trapping). */
  set: number;
  grade: Grade;
  /** Something caught, waiting. */
  caught?: string;
  /** When last looked at. */
  checked: number;
}

export interface CampData {
  id: string;
  /** The fire's tile. */
  x: number;
  y: number;
  made: number;
  site: SiteRating;
  fire: { lit: boolean; fuelH: number; tend: boolean };
  /** Kilograms of firewood gathered and stacked. */
  wood: number;
  woodAt: [number, number];
  bedAt: [number, number];
  shelter?: { kind: ShelterKind; x: number; y: number; tent?: Item };
  snares: Snare[];
  /** Objects laid over the map, with what was there before (to put back when the camp is struck). */
  placed: [number, number, number][];
}

// ---- Rating a site ---------------------------------------------------------------------------------

const TREES = new Set(['tree_broadleaf', 'tree_conifer', 'tree_palm', 'tree_jungle', 'tree_dead', 'tree_mangrove', 'tree_birch', 'great_trunk', 'tree_trunk']);
const BRUSH = new Set(['bush', 'scrub', 'ferns', 'reeds']);
const WAYS = new Set(['road', 'track', 'path', 'street']);

const objName = (g: Game, x: number, y: number) => OBJECT_TILES[g.map.object(x, y)]?.name ?? 'none';
const groundOf = (g: Game, x: number, y: number) => GROUND_TILES[g.map.ground(x, y)];

/** Whether a tile is somewhere to lay a camp: open, dry ground out of doors, nothing on it. */
export function campable(g: Game, x: number, y: number): boolean {
  if (!g.map.loaded(x, y) || !g.map.passable(x, y)) return false;
  const gr = groundOf(g, x, y);
  if (!gr || gr.water || gr.name.startsWith('floor_') || WAYS.has(gr.name)) return false;
  const o = objName(g, x, y);
  return o === 'none' || o === 'tall_grass' || o === 'flowers' || o === 'stones' || o === 'fire_out';
}

/** Free tiles about a point, nearest first (for laying out a camp). */
function freeAround(g: Game, x: number, y: number, r: number, taken: Set<string>): [number, number][] {
  const out: [number, number, number][] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (!dx && !dy) continue;
    const k = `${x + dx},${y + dy}`;
    if (!taken.has(k) && campable(g, x + dx, y + dy)) out.push([x + dx, y + dy, dx * dx + dy * dy]);
  }
  return out.sort((a, b) => a[2] - b[2]).map(([a, b]) => [a, b]);
}

function nearestWaterM(g: Game, x: number, y: number, reach: number): number {
  for (let r = 1; r <= reach; r++) {
    let best = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !g.map.loaded(x + dx, y + dy)) continue;
      const o = objName(g, x + dx, y + dy);
      if (groundOf(g, x + dx, y + dy)?.water || o === 'well' || o === 'fountain') best = Math.min(best, Math.hypot(dx, dy));
    }
    if (best < Infinity) return Math.round(best * TILE_M);
  }
  return Infinity;
}

/** Rates a spot for a camp. */
export function rateSite(g: Game, x: number, y: number): SiteRating {
  let block = 0, wood = 0, way = false;
  for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) {
    const tx = x + dx, ty = y + dy;
    if (!g.map.loaded(tx, ty)) continue;
    const o = objName(g, tx, ty);
    const d2 = dx * dx + dy * dy;
    if (d2 <= 9 && (dx || dy) && (!OBJECT_TILES[g.map.object(tx, ty)].pass || TREES.has(o) || groundOf(g, tx, ty)?.opaque)) block++;
    if (TREES.has(o)) wood += o === 'tree_dead' ? 2 : 1;
    else if (BRUSH.has(o)) wood += 0.3;
    if (d2 <= 64 && WAYS.has(groundOf(g, tx, ty)?.name ?? '')) way = true;
  }
  // How much can be seen from it (and so, how much can see it).
  let seen = 0;
  const fov = new FOV.PreciseShadowcasting((tx: number, ty: number) => g.map.transparent(tx, ty));
  fov.compute(x, y, 12, () => seen++);
  const open = seen / (Math.PI * 144);
  const hidden = Math.max(0, Math.min(1, 1.15 - open - (way ? 0.35 : 0)));
  const waterM = nearestWaterM(g, x, y, 60);
  const shelter = Math.min(1, block / 10);
  const woodR = Math.min(1, wood / 35);
  const water = waterM < 50 ? 1 : waterM < 150 ? 0.6 : waterM < 400 ? 0.25 : 0;
  return { shelter, wood: woodR, waterM, hidden, score: shelter + woodR + water + hidden * 0.7 };
}

/** A site in words: "well sheltered; plenty of wood about; water 40 m off; hidden from sight". */
export function siteWords(r: SiteRating): string {
  const sh = r.shelter >= 0.6 ? 'well sheltered' : r.shelter >= 0.3 ? 'some shelter from the wind' : 'open to the wind';
  const wd = r.wood >= 0.6 ? 'plenty of wood about' : r.wood >= 0.25 ? 'some wood about' : 'little wood to burn';
  const wt = r.waterM === Infinity ? 'no water near' : r.waterM < 30 ? 'water close by' : `water ${Math.round(r.waterM / 10) * 10} m off`;
  const hd = r.hidden >= 0.6 ? 'hidden from sight' : r.hidden >= 0.3 ? 'out of the way' : 'in plain view';
  return `${sh}; ${wd}; ${wt}; ${hd}`;
}

export interface SiteChoice {
  x: number;
  y: number;
  rating: SiteRating;
  /** Why it is offered ("the best all round", "the most sheltered"...). */
  why: string;
  /** Metres from where the party stands. */
  m: number;
}

/** Sites worth choosing about a point: the best all round, the most sheltered, the nearest water, the most hidden (and here, if it will do). */
export function findSites(g: Game, x: number, y: number, radius: number, here = true): SiteChoice[] {
  const rated: { x: number; y: number; r: SiteRating }[] = [];
  const step = radius > 50 ? 5 : radius > 30 ? 4 : 3;
  for (let dy = -radius; dy <= radius; dy += step) for (let dx = -radius; dx <= radius; dx += step) {
    if (dx * dx + dy * dy > radius * radius) continue;
    const tx = x + dx, ty = y + dy;
    if (!campable(g, tx, ty) || freeAround(g, tx, ty, 2, new Set()).length < 4) continue;
    rated.push({ x: tx, y: ty, r: rateSite(g, tx, ty) });
  }
  const out: SiteChoice[] = [];
  const add = (c: { x: number; y: number; r: SiteRating } | undefined, why: string) => {
    if (!c || out.some((o) => Math.abs(o.x - c.x) + Math.abs(o.y - c.y) < 6)) return;
    out.push({ x: c.x, y: c.y, rating: c.r, why, m: Math.round(Math.hypot(c.x - x, c.y - y) * TILE_M) });
  };
  const best = (f: (r: SiteRating) => number) => [...rated].sort((a, b) => f(b.r) - f(a.r))[0];
  if (here && campable(g, x, y)) add({ x, y, r: rateSite(g, x, y) }, 'where you stand');
  add(best((r) => r.score), 'the best all round');
  add(best((r) => r.shelter + r.score * 0.1), 'the most sheltered');
  add(best((r) => (r.waterM === Infinity ? -1 : -r.waterM) + r.score), 'by water');
  add(best((r) => r.hidden + r.score * 0.1), 'the most hidden');
  return out;
}

// ---- The camps -------------------------------------------------------------------------------------

export class Camps {
  list: CampData[] = [];

  /** The camp the wanderer is at (within CAMP_R of its fire), if any. */
  at(x: number, y: number): CampData | undefined {
    return this.list.find((c) => Math.max(Math.abs(c.x - x), Math.abs(c.y - y)) <= CAMP_R);
  }

  /** The nearest camp, and how far (tiles). */
  nearest(x: number, y: number): { camp: CampData; d: number } | null {
    let best: { camp: CampData; d: number } | null = null;
    for (const c of this.list) {
      const d = Math.hypot(c.x - x, c.y - y);
      if (!best || d < best.d) best = { camp: c, d };
    }
    return best;
  }

  /** Lays out a new camp with its fire at a tile (the fire unlit). */
  make(g: Game, x: number, y: number, site: SiteRating): CampData {
    const taken = new Set([`${x},${y}`]);
    const free = freeAround(g, x, y, 3, taken);
    const pick = (minD: number): [number, number] => {
      const i = free.findIndex(([a, b]) => Math.max(Math.abs(a - x), Math.abs(b - y)) >= minD);
      const p = free.splice(i >= 0 ? i : 0, 1)[0] ?? [x + 1, y];
      return p;
    };
    const bedAt = pick(2), woodAt = pick(1);
    const c: CampData = { id: `c${g.time.toString(36)}${this.list.length}`, x, y, made: g.time, site, fire: { lit: false, fuelH: 0, tend: false }, wood: 0, woodAt, bedAt, snares: [], placed: [] };
    this.place(g, c, x, y, 'fire_out');
    this.list.push(c);
    return c;
  }

  /** Puts an object at a tile for a camp, remembering what was there. */
  place(g: Game, c: CampData, x: number, y: number, name: string): void {
    const id = objectId(name);
    if (id === undefined) return;
    if (!c.placed.some(([a, b]) => a === x && b === y)) c.placed.push([x, y, g.map.object(x, y)]);
    g.map.setObject(x, y, id);
  }

  /** Puts back what a camp laid over a tile. */
  unplace(g: Game, c: CampData, x: number, y: number): void {
    const i = c.placed.findIndex(([a, b]) => a === x && b === y);
    if (i < 0) return;
    g.map.setObject(x, y, c.placed[i][2]);
    c.placed.splice(i, 1);
  }

  /** Strikes a camp: everything taken up but the ashes of the fire. */
  strike(g: Game, c: CampData): void {
    for (const [x, y, was] of c.placed) if (x !== c.x || y !== c.y) g.map.setObject(x, y, was);
    g.map.setObject(c.x, c.y, objectId('fire_out')!);
    this.list = this.list.filter((x) => x !== c);
  }

  /** Shows the woodpile while there is wood. */
  showWood(g: Game, c: CampData): void {
    if (c.wood > 0.5) this.place(g, c, c.woodAt[0], c.woodAt[1], 'woodpile');
    else this.unplace(g, c, c.woodAt[0], c.woodAt[1]);
  }

  setFire(g: Game, c: CampData, lit: boolean): void {
    c.fire.lit = lit;
    if (!lit) c.fire.fuelH = Math.max(0, c.fire.fuelH);
    this.place(g, c, c.x, c.y, lit ? 'campfire' : 'fire_out');
  }

  /**
   * Fires burn down as time passes: a tended fire is fed from the woodpile; an untended one goes
   * out when its fuel is spent. Returns the camps whose fires went out.
   */
  burn(g: Game, dt: number): CampData[] {
    const out: CampData[] = [];
    for (const c of this.list) {
      if (!c.fire.lit) continue;
      c.fire.fuelH -= dt / 3600;
      while (c.fire.fuelH <= 0 && c.fire.tend && c.wood >= 1) {
        const kg = Math.min(ARMFUL_KG, c.wood);
        c.wood -= kg;
        c.fire.fuelH += kg / BURN_KG_H;
      }
      if (c.fire.fuelH <= 0) {
        c.fire.fuelH = 0;
        this.setFire(g, c, false);
        out.push(c);
      }
      this.showWood(g, c);
    }
    return out;
  }

  /** Degrees of warmth the camp gives one standing at a tile, in air of a temperature. */
  warmth(x: number, y: number, airC: number): number {
    const c = this.at(x, y);
    if (!c) return 0;
    let w = 0;
    if (c.fire.lit) {
      const d = Math.max(Math.abs(c.x - x), Math.abs(c.y - y));
      w += FIRE_WARMTH * (d <= 2 ? 1 : 0.5) * (0.6 + 0.4 * c.site.shelter) * (airC < -10 ? 0.6 : 1);
    }
    if (c.shelter) w += SHELTERS[c.shelter.kind].warmth;
    return w;
  }

  /** How much better one sleeps at a camp (shelter and fire), added to the bedding's quality. */
  sleepBonus(x: number, y: number): number {
    const c = this.at(x, y);
    if (!c) return 0;
    return (c.shelter ? SHELTERS[c.shelter.kind].sleep : 0) + (c.fire.lit ? 0.05 : 0);
  }

  export(): CampData[] {
    return JSON.parse(JSON.stringify(this.list));
  }

  import(d: CampData[] | undefined): void {
    this.list = d ? JSON.parse(JSON.stringify(d)) : [];
  }
}
