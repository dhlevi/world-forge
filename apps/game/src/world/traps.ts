/**
 * Traps (docs/design/fieldcraft.md, stage 3): digging and covering pits, and the drive fences that
 * steer game into them. The poles and stakes they are made of are woodcraft's (world/woodcraft.ts).
 *
 * - **Pits** are dug (Athletics) where the ground is soft enough: a shovel quickest, a spade
 *   nearly as quick, and a stout stick and bare hands slowly. A pit may be spiked with stakes, and
 *   is covered (Trapping) with a pole or sticks and litter, the better the harder to see. Game of
 *   middling size and up that steps on a covered pit falls in and is held there (hurt by the fall,
 *   and by the stakes if spiked); so do people who do not see it. Out of sight, each hour, a pit in
 *   the range of a herd catches one by chance.
 * - **Drive fences** of stakes, or brush between stakes, block game as a wall does; a frightened
 *   herd is steered along them to the trap in their gap (world/fauna.ts), and out of sight each
 *   length of fence about a trap raises its chance.
 * - **Predators** take what waits in a trap: each hour a catch waits out of sight, a fox, a wolf or
 *   whatever hunts about may take it, leaving its tracks.
 *
 * Proposed numbers, to tune in play.
 */
import { SIZE_RANK, SPECIES_BY_ID } from '@worldforge/core/local/fauna';
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import type { Actor } from '../actors/actor';
import { check, DC, type Grade } from '../actors/checks';
import type { Inventory } from '../actors/items/inventory';
import type { Animal, Fauna, FaunaView } from './fauna';

/** A catch held in a pit, not yet placed on the map (it fell in out of sight). */
export interface PitCatch {
  species: string;
  at: number;
}

/** A pit the wanderer dug. */
export interface Pit {
  x: number;
  y: number;
  /** When it was dug, and when it was last tried (out of sight, by the hour). */
  dug: number;
  tried: number;
  /** Covered (a pitfall), and how hard to see (0 to 1: the share of passers who miss it). */
  covered?: boolean;
  hide?: number;
  /** Stakes set in its floor. */
  spiked?: boolean;
  /** Someone saw it made: the law knows whose it is. */
  seen?: boolean;
  /** Fallen in out of sight, waiting to be put on the map. */
  caught?: PitCatch;
  /** Its catch taken by a predator (the species, if any was about), and when. */
  robbed?: { by: string | null; at: number };
  /** Food laid in it to draw game. */
  bait?: Bait;
  /** Its bait taken without a catch (the species, if known), and when. */
  baitTaken?: { by: string | null; at: number };
}

/** A pit's chance an hour, out of sight, in the range of a herd of middling size or larger, by Trapping 0 to 100. */
const PIT_PER_HOUR = (trapping: number) => 0.03 + trapping / 1200;
/** A waiting catch's chance an hour of being taken, out of sight: more where hunters are about. */
const ROB_PER_HOUR = (predators: boolean) => (predators ? 0.05 : 0.015);
/** How far about a trap a fence counts (tiles), and the most it can multiply the chance by. */
export const FENCE_R = 8, FENCE_MAX = 3;
/** The least size of beast a covered pit holds (a hare runs over the litter). */
export const PIT_RANK = 2;

/** The drive fences. */
export const FENCES = new Set(['stake_fence', 'brush_fence']);

export class Pits {
  list: Pit[] = [];

  at(x: number, y: number): Pit | undefined {
    return this.list.find((p) => p.x === x && p.y === y);
  }

  dig(x: number, y: number, t: number): Pit {
    const p: Pit = { x, y, dug: t, tried: t };
    this.list.push(p);
    return p;
  }

  remove(x: number, y: number): void {
    this.list = this.list.filter((p) => p.x !== x || p.y !== y);
  }

  /**
   * Out of sight, by the hour: covered pits in the range of a herd of middling size or larger catch
   * one by chance (more with fences about), and catches waiting are taken by predators. Returns the
   * pits that caught.
   */
  run(fauna: Fauna, g: FaunaView, trapping: number, fenceBoost: (x: number, y: number) => number): Pit[] {
    const out: Pit[] = [];
    const predators = [...fauna.all()].filter((m) => m.s.diet === 'predator');
    for (const p of this.list) {
      // Watched, or with nothing to catch or lose: the hours start again from now.
      if (g.isVisible(p.x, p.y) || (!p.covered && !p.caught)) {
        p.tried = g.time;
        continue;
      }
      while (g.time - p.tried >= 3600) {
        p.tried += 3600;
        const r = mulberry32(hashString(`pit#${p.x},${p.y}#${p.tried}`));
        if (p.caught) {
          const near = predators.find((m) => Math.hypot(m.x - p.x, m.y - p.y) < 80 && SIZE_RANK[m.s.size] >= 2);
          if (r() < ROB_PER_HOUR(!!near)) {
            p.robbed = { by: near?.s.id ?? null, at: p.tried };
            p.caught = undefined;
          }
          continue;
        }
        if (!p.covered) break;
        const bait = fresh(p.bait, p.tried) ? p.bait : undefined;
        // Bait out of sight is taken now and then by a beast the pit does not hold.
        if (bait && r() < BAIT_TAKEN_PER_HOUR) {
          const thief = [...fauna.all()].find((m) => SIZE_RANK[m.s.size] < PIT_RANK && drawnBy(m.s.diet, bait.kind) && Math.hypot(m.x - p.x, m.y - p.y) < 60);
          p.baitTaken = { by: thief?.s.id ?? null, at: p.tried };
          p.bait = undefined;
          continue;
        }
        const m = takerOf(fauna, p, bait, (b) => !b.s.fly && SIZE_RANK[b.s.size] >= PIT_RANK);
        if (m && r() < PIT_PER_HOUR(trapping) * (p.hide ?? 0.5) * 1.6 * fenceBoost(p.x, p.y) * (bait && drawnBy(m.s.diet, bait.kind) ? BAIT_BOOST : 1)) {
          fauna.remove(m);
          p.caught = { species: m.s.id, at: p.tried };
          p.covered = false;
          p.hide = undefined;
          p.bait = undefined;
          out.push(p);
        }
      }
    }
    return out;
  }

  export(): Pit[] {
    return this.list.map((p) => ({ ...p }));
  }

  import(list: Pit[] | undefined): void {
    this.list = (list ?? []).filter((p) => p && typeof p.x === 'number' && typeof p.y === 'number').map((p) => ({ ...p, tried: typeof p.tried === 'number' ? p.tried : p.dug }));
  }
}

/**
 * The beast a trap out of sight might take this hour: of the herds whose range it lies in (or, if it
 * is baited, a little beyond for those the bait draws), those the bait draws first.
 */
export function takerOf(fauna: Fauna, t: { x: number; y: number }, bait: Bait | undefined, holds: (m: Animal) => boolean): Animal | null {
  let best: Animal | null = null;
  for (const m of fauna.all()) {
    if (!holds(m) || m.s.home !== 'wild') continue;
    const drawn = !!bait && drawnBy(m.s.diet, bait.kind);
    if (Math.hypot(m.g.home.x - t.x, m.g.home.y - t.y) > m.g.home.r + 4 + (drawn ? BAIT_R : 0)) continue;
    if (drawn) return m;
    best ??= m;
  }
  return best;
}

/** A snare's or pit's chance multiplied by the drive fences about it: each length counts a sixth, to at most three times. */
export function fenceBoostOf(map: FaunaView['map'], names: (id: number) => string, x: number, y: number): number {
  let n = 0;
  for (let dy = -FENCE_R; dy <= FENCE_R; dy++) for (let dx = -FENCE_R; dx <= FENCE_R; dx++) {
    if (map.loaded(x + dx, y + dy) && FENCES.has(names(map.objectAt(x + dx, y + dy, null)))) n++;
  }
  return Math.min(FENCE_MAX, 1 + n / 6);
}

/** Bait taken without a catch, in words. */
export function baitWords(by: string | null, where: string): string {
  const s = by ? SPECIES_BY_ID.get(by) : undefined;
  return `The bait in your ${where} is gone${s ? `, and ${s.name} tracks lead away from it` : ''}.`;
}

/** A predator's catch, in words, and who took it. */
export function robbedWords(by: string | null, what: string): string {
  const s = by ? SPECIES_BY_ID.get(by) : undefined;
  return s ? `Something has taken the ${what}: ${s.name} tracks about it, and a little blood and fur.` : `Something has taken the ${what}: there is a little blood and fur, and nothing more.`;
}

// ---- Digging ----------------------------------------------------------------------------------------

/** The diggers, best first, and the hours a pit takes with each. */
export const DIGGERS: [string, number][] = [['shovel', 2], ['spade', 2.5], ['stick', 7]];

/** The best thing carried to dig with, if any. */
export function diggingTool(inv: Inventory): [string, number] | null {
  const c = new Set(inv.d.items.map((i) => i.def));
  return DIGGERS.find(([id]) => c.has(id)) ?? null;
}

/** How a pit's digging goes: a share of the time. */
const DUG: Record<Grade, number> = { fine: 0.8, success: 1, near: 1.15, fail: 1.3, fumble: 1.45 };

/** Ground too hard, too loose or too wet to dig a pit in. */
export function undiggable(groundName: string, water: boolean): string | null {
  if (water || /marsh|swamp|bog|mud|shallow/.test(groundName)) return 'The ground there is too wet to dig a pit in.';
  if (/rock|stone|cobble|paved|flag|scree|gravel|ice|snowfield|floor|road|bridge|plank/.test(groundName)) return 'The ground there is too hard to dig.';
  if (/sand|dune/.test(groundName)) return 'The sand runs back in as fast as you dig.';
  return null;
}

/** Digs a pit (Athletics): the seconds it takes with the tool, by the check. */
export function digSeconds(a: Actor, hours: number, now: number): { seconds: number; grade: Grade } {
  const r = check(a, 'athletics', { difficulty: DC.easy, now });
  return { seconds: Math.round(hours * 3600 * DUG[r.grade]), grade: r.grade };
}

/** How well a pit is covered (Trapping): the share of those who pass that miss it. */
const COVER: Record<Grade, number> = { fine: 0.92, success: 0.78, near: 0.6, fail: 0.4, fumble: 0.2 };

export function coverPit(a: Actor, now: number): { hide: number; grade: Grade } {
  const r = check(a, 'trapping', { difficulty: DC.easy, now });
  return { hide: COVER[r.grade], grade: r.grade };
}

/** Whether a passer sees a covered pit before stepping on it: hunters and trappers better. */
export function spotsPit(p: Pit, keen: boolean, roll: number): boolean {
  const hide = p.hide ?? 0.5;
  return roll < (1 - hide) * (keen ? 1.8 : 0.7);
}

// ---- Bait ---------------------------------------------------------------------------------------------

/**
 * Bait (fieldcraft.md, stage 3): food left in a snare or a pit draws the beasts that eat it, meat
 * the hunters, scavengers and omnivores, and plant food the grazers, browsers, seed-eaters and
 * omnivores. It goes off and stops drawing after some days, and can be taken without a catch.
 */
export type BaitKind = 'meat' | 'plant';

export interface Bait {
  def: string;
  kind: BaitKind;
  /** When it was laid. */
  at: number;
}

const MEAT = /^(raw_meat|rabbit|dried_meat|roast_meat|roast_rabbit|cheese)$|fish/;
const PLANT = /^(apple|berries|nuts|wild_greens|roots|bread|grain|oats|turnip|carrot)$/;

/** The kind of bait a food is, if it is bait at all. */
export function baitKind(def: string): BaitKind | null {
  return MEAT.test(def) ? 'meat' : PLANT.test(def) ? 'plant' : null;
}

/** Whether a diet is drawn by a kind of bait. */
export function drawnBy(diet: string, kind: BaitKind): boolean {
  return kind === 'meat' ? diet === 'predator' || diet === 'scavenger' || diet === 'omnivore' : diet === 'grazer' || diet === 'browser' || diet === 'seeds' || diet === 'omnivore';
}

/** How long bait draws (s): meat three days, plant food five. */
export const BAIT_S: Record<BaitKind, number> = { meat: 3 * 86400, plant: 5 * 86400 };

/** Whether bait still draws. */
export function fresh(b: Bait | undefined, now: number): b is Bait {
  return !!b && now - b.at < BAIT_S[b.kind];
}

/** How much further off bait draws a beast (tiles), and how much it raises a trap's chance an hour. */
export const BAIT_R = 10, BAIT_BOOST = 2;
/** Bait's chance an hour of being taken out of sight, by a beast the trap does not hold. */
export const BAIT_TAKEN_PER_HOUR = 0.03;

/**
 * The chance a beast that comes to the bait takes it and gets away: a wary or a clumsy trap more
 * often, a good trapper's less (Trapping 0 to 100).
 */
export function stealChance(trapping: number, wary: boolean): number {
  return Math.max(0.05, (wary ? 0.35 : 0.2) - trapping / 400);
}
