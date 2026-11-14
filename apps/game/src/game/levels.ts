/**
 * Levels (docs/design/navigation.md, How the local map is drawn): the land's height in steps of
 * 3 m, one storey. The map stores each tile's height in metres; its level is worked out from it.
 *
 * - Between two neighbouring tiles a level apart, the ground is a **ramp**: it can be walked, a
 *   little more slowly uphill.
 * - Two levels or more apart is a **cliff**: it blocks the way, unless it is climbed.
 * - **Sight follows height:** a tile is seen only if no ground between rises above the line from
 *   the wanderer's eyes to it (by more than the metre heights are rounded to).
 */

/** Metres in a level. */
export const LEVEL_M = 3;
/** The wanderer's eyes above the ground (m). */
export const EYE_M = 1.6;
/** How far above a tile's ground the eye must see to see the tile (m). */
const SEEN_M = 0.4;
/**
 * How far the ground between may rise above the line of sight and still not hide what is behind
 * (m): heights are kept to the metre, so a metre's rounding must not hide the ground just past a
 * gentle fold.
 */
const SLACK_M = 1;

export type Step = 'level' | 'ramp' | 'cliff';

/** The level of ground at a height (m). */
export function levelOf(elevM: number): number {
  return Math.floor(elevM / LEVEL_M);
}

/** What lies between two neighbouring tiles of these levels. */
export function stepBetween(fromLevel: number, toLevel: number): Step {
  const d = Math.abs(toLevel - fromLevel);
  return d === 0 ? 'level' : d === 1 ? 'ramp' : 'cliff';
}

/**
 * Whether the ground of (x1, y1) can be seen from eyes standing on (x0, y0), over the ground
 * between, whose height (m) `elevAt` gives. Neighbouring tiles are always seen.
 */
export function overGround(x0: number, y0: number, x1: number, y1: number, elevAt: (x: number, y: number) => number): boolean {
  const dx = x1 - x0, dy = y1 - y0;
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  if (n <= 1) return true;
  const eye = elevAt(x0, y0) + EYE_M, top = elevAt(x1, y1) + SEEN_M;
  for (let i = 1; i < n; i++) {
    const f = i / n;
    const h = elevAt(Math.round(x0 + dx * f), Math.round(y0 + dy * f));
    if (h > eye + (top - eye) * f + SLACK_M) return false;
  }
  return true;
}

/** A level's difference in words: "a level below you", "two levels above you". */
export function levelWords(d: number): string {
  if (!d) return '';
  const n = Math.abs(d);
  const count = n === 1 ? 'a level' : `${['', '', 'two', 'three', 'four', 'five', 'six'][n] ?? n} levels`;
  return `${count} ${d > 0 ? 'above' : 'below'} you`;
}
