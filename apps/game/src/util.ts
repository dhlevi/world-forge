/**
 * Small helpers used across the game, with no dependencies of their own (so that anything may
 * import them without pulling in more).
 */

/** A number held between two bounds. */
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const SHORT = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** The point of the compass nearest a bearing (degrees clockwise from north): "north-east", or "NE" short. */
export function compassWord(deg: number, short = false): string {
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return (short ? SHORT : POINTS)[i];
}

/** The bearing (degrees clockwise from north) of an offset east and north. */
export function bearing(east: number, north: number): number {
  return (((Math.atan2(east, north) * 180) / Math.PI) + 360) % 360;
}

/** One step of a saved stream of random numbers (mulberry32): the next state, and a number in [0, 1). */
export function diceStep(state: number): [number, number] {
  let s = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  s |= 0;
  return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

/** A small string hash (FNV-1a), for seeding a stream from a name. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h | 0;
}

/**
 * A stream of random numbers whose state is kept (and saved), so that a game replays the same:
 * the same save, the same rolls.
 */
export class Dice {
  constructor(public state: number) {}
  /** A number in [0, 1). */
  random(): number {
    const [s, r] = diceStep(this.state);
    this.state = s;
    return r;
  }
}
