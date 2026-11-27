/**
 * Fishing (docs/design/fieldcraft.md, stage 4): what a water holds, the chance of a bite each
 * quarter hour with a rod or a spear, landing what bites, gutting the catch, digging for worms, and
 * the lines and nets set and left.
 *
 * - **Waters.** Rivers, lakes (fresh water standing) and the sea's shore each hold their own fish,
 *   by the climate (actors/data/fish.ts). A small pond holds few; a river or a broad lake many.
 * - **A bite** each quarter hour, by Fishing, the gear (a rod anywhere it reaches; a spear only in
 *   the shallows, by day), the hour (dawn and dusk best; eels and catfish at night), the season
 *   (winter slow), rain (a little better), and the bait (worms best for most, guts or meat for the
 *   fish that hunt others; none, slowly).
 * - **Landing** it is a Fishing check, harder for a bigger fish: a fine or a plain success lands
 *   it, a near miss loses it at the bank, a failure loses it and the bait, a fumble the hook too.
 * - **Gutting** (Survival, with a blade) gives the cleaned fish and its guts, bait for a hook or a
 *   trap. A fish roasted ungutted comes out poorer.
 * - **Worms** are dug from soft, damp ground (half an hour; more with a spade or a shovel, and
 *   after rain; none from frozen, sandy or stony ground).
 * - **Set lines and nets** are left in the water from the bank: each hour a line takes a fish by
 *   chance (far better baited; three hooks), a net more often and up to six; a heron or whatever
 *   hunts about may take what waits.
 *
 * Proposed numbers, to tune in play.
 */
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import type { Actor } from '../actors/actor';
import { check, DC, type Grade } from '../actors/checks';
import { FISH, FISH_BY_ID, type Fish, type FishClimate, type FishWater } from '../actors/data/fish';
import { fishIds, fishPortions } from '../actors/items/defs';
import type { Inventory } from '../actors/items/inventory';
import { makeItem, type Item } from '../actors/items/item';
import { usePortion } from '../rules/tasks';
import { blade } from './woodcraft';

/** A water as the fish see it: which kind, whether deep, and how much of it there is (0 to 1). */
export interface FishingWater {
  water: FishWater;
  deep: boolean;
  plenty: number;
}

/** The climate's band, by the warmest and coldest months' mean (°C). */
export function climateBand(warm: number, cold: number): FishClimate {
  if (warm < 14 || cold < -8) return 'cold';
  if (cold >= 8) return 'warm';
  return 'temperate';
}

/** The fish a water holds in a climate. */
export function fishOf(water: FishWater, climate: FishClimate): Fish[] {
  return FISH.filter((f) => f.waters.includes(water) && f.climates.includes(climate));
}

/** What a tile's water is, for fishing: by its ground and whether it is salt; null if it is not water. */
export function fishingWater(groundName: string, waterKind: 'shallow' | 'deep' | undefined, salt: boolean, waterTilesNear: number): FishingWater | null {
  if (!waterKind) return null;
  const river = /^river/.test(groundName);
  const water: FishWater = river ? 'river' : salt ? 'shore' : 'lake';
  // A river or the sea is never short of fish; a lake or pond by its size.
  const plenty = water === 'lake' ? Math.min(1, waterTilesNear / 60) : 1;
  return { water, deep: waterKind === 'deep', plenty };
}

/** The bait for a hook, best first: what it is, and which fish it suits. */
export const HOOK_BAIT: [string, 'worm' | 'flesh' | 'bread'][] = [['worms', 'worm'], ['fish_guts', 'flesh'], ['raw_meat', 'flesh'], ['cheese', 'bread'], ['bread', 'bread']];

export type Gear = 'rod' | 'spear' | 'line' | 'net';

export interface BiteOdds {
  fishing: number;
  gear: Gear;
  /** The hour (0 to 24), and sunrise and sunset. */
  hour: number;
  rise: number;
  set: number;
  winter: boolean;
  raining: boolean;
  bait: 'worm' | 'flesh' | 'bread' | null;
  w: FishingWater;
}

/** Dawn and dusk (within an hour and a half of sunrise or sunset), day, or night. */
export function timeOfDay(hour: number, rise: number, set: number): 'dusk' | 'day' | 'night' {
  if (Math.abs(hour - rise) <= 1.5 || Math.abs(hour - set) <= 1.5) return 'dusk';
  return hour > rise && hour < set ? 'day' : 'night';
}

/** The chance of a bite in a quarter hour (a rod or a spear), or in an hour (a set line or a net). */
export function biteChance(o: BiteOdds): number {
  const gear = { rod: 0.16, spear: 0.1, line: 0.12, net: 0.3 }[o.gear];
  const skill = o.gear === 'net' || o.gear === 'line' ? 0.8 + o.fishing / 250 : 0.45 + o.fishing / 90;
  const tod = timeOfDay(o.hour, o.rise, o.set);
  const when = tod === 'dusk' ? 1.5 : tod === 'day' ? 0.85 : 0.6;
  const bait = o.gear === 'spear' || o.gear === 'net' ? 1 : o.bait === 'worm' ? 1.7 : o.bait ? 1.4 : o.gear === 'line' ? 0.3 : 0.6;
  return gear * skill * when * bait * (o.winter ? 0.5 : 1) * (o.raining ? 1.15 : 1) * o.w.plenty;
}

/** Which fish bites: by how common each is there, the hour, the gear and the bait. */
export function whichFish(list: Fish[], o: BiteOdds, r: () => number): Fish | null {
  const night = timeOfDay(o.hour, o.rise, o.set) === 'night';
  const weights = list.map((f) => {
    if (o.gear === 'spear' && (!f.shallows || o.w.deep)) return 0;
    let wt = f.common;
    if (f.night) wt *= night ? 3 : 0.3;
    if (o.bait === 'flesh') wt *= f.hunter ? 2.5 : 0.7;
    else if (o.bait && f.hunter) wt *= 0.6;
    return wt;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let u = r() * total;
  for (let i = 0; i < list.length; i++) {
    u -= weights[i];
    if (u <= 0) return list[i];
  }
  return list[list.length - 1];
}

/** The weight of a fish caught (kg): mostly toward the small end. */
export function fishWeight(f: Fish, r: () => number): number {
  const t = r() * r();
  return Math.round((f.kg[0] + (f.kg[1] - f.kg[0]) * t) * 100) / 100;
}

/** A fish as an item: its own kind, weighing what it does. */
export function fishItem(f: Fish, kg: number): Item {
  const it = makeItem(fishIds(f.id).raw);
  it.kg = kg;
  it.uses = fishPortions(kg);
  return it;
}

/** How landing a fish goes: whether it is landed, and what is lost. */
export const LANDED: Record<Grade, { landed: boolean; bait: boolean; hook: boolean }> = {
  fine: { landed: true, bait: true, hook: false },
  success: { landed: true, bait: true, hook: false },
  near: { landed: false, bait: true, hook: false },
  fail: { landed: false, bait: true, hook: false },
  fumble: { landed: false, bait: true, hook: true },
};

/** Lands a fish that has bitten (Fishing): harder the bigger it is. */
export function land(a: Actor, f: Fish, kg: number, gear: Gear, now: number): Grade {
  const big = Math.round(Math.min(25, Math.log2(Math.max(0.1, kg) * 4) * 4));
  return check(a, 'fishing', { difficulty: DC.easy + big + (gear === 'spear' ? 5 : 0), now }).grade;
}

/** The bait carried for a hook, best first, and what it suits. */
export function hookBait(inv: Inventory): { it: Item; kind: 'worm' | 'flesh' | 'bread' } | null {
  for (const [def, kind] of HOOK_BAIT) {
    const it = inv.d.items.find((i) => i.def === def);
    if (it) return { it, kind };
  }
  return null;
}

/** Uses up one bait. */
export function useBait(inv: Inventory, it: Item): void {
  usePortion(inv, it);
}

const GUTTED: Record<Grade, { guts: boolean; text: string }> = {
  fine: { guts: true, text: 'neatly' },
  success: { guts: true, text: '' },
  near: { guts: true, text: 'roughly' },
  fail: { guts: false, text: 'messily, the guts spilt and spoilt' },
  fumble: { guts: false, text: 'clumsily, nicking your thumb' },
};

/** Guts the raw fish carried (Survival, with a blade): each becomes a gutted fish, and gives its guts. */
export function gutAll(a: Actor, inv: Inventory, now: number): { gutted: number; guts: number; seconds: number; text: string; cut: boolean } | null {
  if (!blade(inv)) return null;
  const raw = inv.d.items.filter((i) => i.def.startsWith('fish_') && i.def !== 'fish_guts' && i.def !== 'fish_spear');
  if (!raw.length) return null;
  let gutted = 0, guts = 0, cut = false;
  const how: string[] = [];
  for (const it of raw) {
    const g = check(a, 'survival', { difficulty: DC.trivial + 5, now }).grade;
    const res = GUTTED[g];
    it.def = it.def.replace(/^fish_/, 'gutted_');
    if (it.kg !== undefined) it.kg = Math.round(it.kg * 0.85 * 100) / 100;
    gutted += it.qty;
    if (res.guts) guts += it.qty;
    if (g === 'fumble') cut = true;
    if (res.text) how.push(res.text);
  }
  const text = how.length ? `You gut ${gutted === 1 ? 'the fish' : `${gutted} fish`}, ${how[0]}.` : `You gut ${gutted === 1 ? 'the fish' : `${gutted} fish`}.`;
  return { gutted, guts, seconds: 5 * 60 * gutted, text, cut };
}

/** Ground that worms can be dug from, and how many it gives (handfuls in half an hour). */
export function wormsIn(groundName: string, frozen: boolean, damp: boolean, tool: boolean): number {
  if (frozen || /sand|dune|rock|stone|cobble|paved|scree|gravel|snow|ice|road|floor|plank|bridge|water|river/.test(groundName)) return 0;
  const rich = /forest|mud|marsh|meadow|field|soil|farm|garden|loam/.test(groundName) ? 1 : 0;
  return Math.max(0, 1 + rich + (damp ? 2 : 0) + (tool ? 1 : 0));
}

// ---- Set lines and nets -----------------------------------------------------------------------------

/** A line or a net set in the water from the bank. */
export interface SetLine {
  x: number;
  y: number;
  kind: 'line' | 'net';
  /** When it was set, and when last tried (by the hour). */
  set: number;
  tried: number;
  /** The bait on a line's hooks, if any. */
  bait?: 'worm' | 'flesh' | 'bread';
  /** What it holds: each fish and its weight. */
  catch: { fish: string; kg: number }[];
  /** A fish taken from it by a heron or the like (the species, if any was about), and when. */
  robbed?: { by: string | null; at: number };
}

/** How many a line's hooks or a net can hold. */
export const HOLDS = { line: 3, net: 6 } as const;

export class Lines {
  list: SetLine[] = [];

  at(x: number, y: number): SetLine | undefined {
    return this.list.find((l) => l.x === x && l.y === y);
  }

  set(x: number, y: number, kind: 'line' | 'net', t: number, bait?: SetLine['bait']): SetLine {
    const l: SetLine = { x, y, kind, set: t, tried: t, catch: [], bait };
    this.list.push(l);
    return l;
  }

  lift(x: number, y: number): SetLine | undefined {
    const l = this.at(x, y);
    if (l) this.list = this.list.filter((o) => o !== l);
    return l;
  }

  /**
   * By the hour, in sight or not (the fish do not care who watches): each line or net takes a fish
   * by chance, and what waits may be taken by a heron or the like. `odds` gives the water and the
   * hour's odds for a line, or null where the water cannot be told (not loaded).
   */
  run(now: number, odds: (l: SetLine, t: number) => { o: BiteOdds; list: Fish[] } | null, thieves: (l: SetLine) => string | null): SetLine[] {
    const out: SetLine[] = [];
    for (const l of this.list) {
      while (now - l.tried >= 3600) {
        l.tried += 3600;
        const r = mulberry32(hashString(`line#${l.x},${l.y}#${l.tried}`));
        if (l.catch.length && r() < 0.03 * l.catch.length) {
          l.robbed = { by: thieves(l), at: l.tried };
          l.catch.pop();
          continue;
        }
        if (l.catch.length >= HOLDS[l.kind]) continue;
        const od = odds(l, l.tried);
        if (!od) continue;
        if (r() < biteChance(od.o)) {
          const f = whichFish(od.list, od.o, r);
          if (!f) continue;
          l.catch.push({ fish: f.id, kg: fishWeight(f, r) });
          // A line's bait goes with the fish that took it.
          if (l.kind === 'line' && r() < 0.6) l.bait = undefined;
          out.push(l);
        }
      }
    }
    return out;
  }

  export(): SetLine[] {
    return this.list.map((l) => ({ ...l, catch: l.catch.map((c) => ({ ...c })) }));
  }

  import(list: SetLine[] | undefined): void {
    this.list = (list ?? []).filter((l) => l && typeof l.x === 'number' && typeof l.y === 'number' && (l.kind === 'line' || l.kind === 'net')).map((l) => ({ ...l, catch: (l.catch ?? []).filter((c) => FISH_BY_ID.has(c.fish)), tried: typeof l.tried === 'number' ? l.tried : l.set }));
  }
}
