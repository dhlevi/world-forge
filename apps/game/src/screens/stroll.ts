/**
 * A walk across a town in the city view (docs/backlog.md, I4): the party's marker goes from where
 * it stands to a place, a game minute at a time, while the clock runs. The pace says how many game
 * minutes pass in a second of play; the walk can be stopped or finished at once.
 */

export interface LonLat {
  lon: number;
  lat: number;
}

/** How fast the clock runs while walking: game minutes for each second of play. */
export const PACES = [
  { id: 'slow', label: 'Slow', perSecond: 2 },
  { id: 'steady', label: 'Steady', perSecond: 6 },
  { id: 'brisk', label: 'Brisk', perSecond: 20 },
] as const;
export type PaceId = (typeof PACES)[number]['id'];

export function perSecond(pace: PaceId): number {
  return PACES.find((p) => p.id === pace)?.perSecond ?? 6;
}

export class Stroll {
  /** Minutes walked so far. */
  done = 0;

  constructor(
    readonly from: LonLat,
    readonly to: LonLat,
    /** Minutes the whole walk takes. */
    readonly minutes: number,
  ) {}

  /** Walks on by up to `min` minutes; gives the minutes walked. */
  step(min: number): number {
    const m = Math.max(0, Math.min(min, this.minutes - this.done));
    this.done += m;
    return m;
  }

  /** Walks the rest of the way; gives the minutes walked. */
  finish(): number {
    return this.step(Infinity);
  }

  get finished(): boolean {
    return this.done >= this.minutes;
  }

  /** Where the party is now, on the straight line between the two (the plan has no streets to follow). */
  get at(): LonLat {
    const f = this.minutes > 0 ? Math.min(1, this.done / this.minutes) : 1;
    return { lon: this.from.lon + (this.to.lon - this.from.lon) * f, lat: this.from.lat + (this.to.lat - this.from.lat) * f };
  }
}
