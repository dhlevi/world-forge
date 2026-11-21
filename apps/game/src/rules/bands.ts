/**
 * Where robber bands camp (worker/bandits.ts places them; game/justice.ts meets them on the road):
 * the country in band cells, and whether a cell holds a band in a week, by its banditry.
 */
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';

/** A band cell's side, in chunks. */
export const BAND_CELL = 3;

/** The band cell of a chunk. */
export const bandCell = (cx: number, cy: number): [number, number] => [Math.floor(cx / BAND_CELL), Math.floor(cy / BAND_CELL)];

/** A band's id (its camp, for the week). */
export const bandId = (bx: number, by: number, week: number) => `band:${bx},${by}:${week}`;

/** A cell's roll for a band in a week (the same for the worker and the session): the generator, after the first draw says whether there is one. */
export function bandRoll(seed: string, bx: number, by: number, week: number, banditry: number): { here: boolean; r: () => number } {
  const r = mulberry32(hashString(`${seed}#band#${bx},${by}#${week}`));
  return { here: banditry > 0 && r() < banditry, r };
}
