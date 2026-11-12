/**
 * The calendar and the air's temperature (docs/design/survival.md, Day, night and light; Body
 * heat). A game begins on the 110th day of the year (late spring in the north, late autumn in
 * the south). The temperature follows the place's warmest and coldest months (the generator's
 * climate) through the year, and the hour through the day; indoors it is milder.
 */

export const START_DAY_OF_YEAR = 110;
const YEAR = 365;

/** The place's climate: its warmest and coldest months (°C) and latitude. */
export interface Climate {
  warm: number;
  cold: number;
  lat: number;
}

/** Day of the year (0 to 364) at a game time (s). */
export function dayOfYear(time: number): number {
  return (START_DAY_OF_YEAR + Math.floor(time / 86400)) % YEAR;
}

export function seasonOf(time: number, lat: number): string {
  let d = dayOfYear(time);
  if (lat < 0) d = (d + 182) % YEAR;
  return d < 59 || d >= 334 ? 'winter' : d < 151 ? 'spring' : d < 243 ? 'summer' : 'autumn';
}

/** The air's temperature (°C) at a game time, outdoors or in. */
export function airTemp(c: Climate, time: number, indoors = false): number {
  const mid = (c.warm + c.cold) / 2, amp = (c.warm - c.cold) / 2;
  // Warmest about the 200th day in the north, half a year later in the south.
  const peak = c.lat >= 0 ? 200 : 17;
  const d = dayOfYear(time) + (time % 86400) / 86400;
  const season = mid + amp * Math.cos((2 * Math.PI * (d - peak)) / YEAR);
  // Coldest before dawn, warmest mid-afternoon; a wider swing where it is dry and continental.
  const hour = (time % 86400) / 3600;
  const swing = 4 + Math.min(4, amp / 6);
  const t = season + swing * Math.cos((2 * Math.PI * (hour - 15)) / 24);
  return indoors ? t + (16 - t) * 0.6 : t;
}

/** A temperature in words. */
export function airWord(t: number): string {
  if (t < -15) return 'bitter cold';
  if (t < -2) return 'freezing';
  if (t < 6) return 'cold';
  if (t < 13) return 'cool';
  if (t < 21) return 'mild';
  if (t < 28) return 'warm';
  if (t < 34) return 'hot';
  return 'scorching';
}
