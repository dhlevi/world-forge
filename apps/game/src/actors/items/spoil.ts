/**
 * Food that spoils (docs/design/survival.md, Food; from play, 27 November 2026): each perishable
 * food keeps for so many days at a mild 15 °C, faster in heat and far slower in frost (frozen food
 * keeps); its age is counted as time passes, carried or left on the ground. By its age against what
 * it keeps for, it is fresh, stale (a little less nourishing), spoiling (it may sicken) or rotten
 * (it likely will). Smoked, dried and salted foods keep for months.
 *
 * Proposed numbers, to tune in play.
 */

export type SpoilStage = 'fresh' | 'stale' | 'spoiling' | 'rotten';

/** Days each food keeps at 15 °C (before it is spoiling); none: it does not spoil. */
const KEEPS: Readonly<Record<string, number>> = {
  raw_meat: 1.5, rabbit: 1.5, carcass: 1.5, fish_guts: 1,
  roast_meat: 4, roast_rabbit: 4,
  bread: 5, cheese: 30, apple: 30, berries: 3, nuts: 180, wild_greens: 3, roots: 40, mushrooms: 3,
  dried_meat: 180, smoked_meat: 60, salt_meat: 300,
  smoked_fish: 45, dried_fish: 180, salt_fish: 300,
};

/** Days a food keeps at 15 °C before it is spoiling, or null if it does not spoil. */
export function keepsDays(def: string): number | null {
  if (def in KEEPS) return KEEPS[def];
  if (/^(fish|gutted)_/.test(def) && def !== 'fish_spear') return 1.2;
  if (/^roast_/.test(def)) return 3;
  return null;
}

/** How much faster than at 15 °C food ages in air of a temperature: twice as fast for each 10 degrees warmer; frozen, it keeps. */
export function spoilRate(airC: number): number {
  if (airC <= -2) return 0.03;
  if (airC <= 2) return 0.2;
  return Math.max(0.25, Math.min(4, 2 ** ((airC - 15) / 10)));
}

/** A food's stage, by its age (in days at 15 °C) against what it keeps for. */
export function spoilStage(def: string, aged: number | undefined): SpoilStage {
  const k = keepsDays(def);
  if (k === null || !aged) return 'fresh';
  const r = aged / k;
  return r < 0.6 ? 'fresh' : r < 1 ? 'stale' : r < 1.6 ? 'spoiling' : 'rotten';
}

/** The word put before a food's name for its stage (none when fresh). */
export const STAGE_WORD: Record<SpoilStage, string> = { fresh: '', stale: 'stale', spoiling: 'spoiling', rotten: 'rotten' };

/** Ages the perishable things among some, by hours passed in air of a temperature. Returns whether any changed stage. */
export function ageFood(items: Iterable<{ def: string; aged?: number }>, hours: number, airC: number): boolean {
  const days = (hours / 24) * spoilRate(airC);
  let turned = false;
  for (const it of items) {
    if (keepsDays(it.def) === null) continue;
    const was = spoilStage(it.def, it.aged);
    it.aged = Math.round(((it.aged ?? 0) + days) * 1000) / 1000;
    if (spoilStage(it.def, it.aged) !== was) turned = true;
  }
  return turned;
}

/** A food's age carried into what it is made into (a roasting, a smoking): the same share of its keeping. */
export function carriedAge(fromDef: string, aged: number | undefined, toDef: string): number | undefined {
  const a = keepsDays(fromDef), b = keepsDays(toDef);
  if (!aged || a === null || b === null) return undefined;
  return Math.round((aged / a) * b * 1000) / 1000;
}
