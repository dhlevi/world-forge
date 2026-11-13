/**
 * Weather, the sun and the moon (docs/design/survival.md, Weather; Day, night and light).
 *
 * Weather is a function of the place, the hour and the world's seed, worked out on demand and
 * never stored, so that any place can be asked about at any hour and always gives the same answer.
 *
 * - **The baseline** is the place's climate: the day's expected temperature moves between the
 *   coldest and warmest month through the year (the hemispheres opposite), and swings through the
 *   day, less under cloud.
 * - **Weather systems** (fronts and storms) are born on a lattice of space (500 km) and time (12
 *   hours), each by chance from the seed, more often where the season is wet. Each lives one to
 *   three and a half days, grows and fades, and drifts along the place's prevailing wind, so that
 *   weather comes from upwind and passes on. A system brings cloud, rain or snow (by the
 *   temperature), wind, and a change of temperature; the strongest in the warm season, thunder.
 *   How much rain a system gives follows the place's seasonal rainfall, so that dry lands stay
 *   mostly dry and wet ones are often wet.
 * - **The ground** remembers: snow lying and mud are worked out from the weather of the last
 *   fortnight (snow falls and melts; rain soaks in and dries).
 * - **The sun** rises and sets by the latitude and the day of the year (with twilight; polar days
 *   and nights); **the moon** has phases on its own 29.5-day cycle.
 *
 * Hours are counted from the start of the game (`hour` 0 is midnight on its first day); `startDoy`
 * is the day of the year on which the game began. Deterministic: no Math.random, DMath only.
 * Proposed numbers, to tune in play (apps/game/scripts/weather-test.ts prints a year).
 */
import { DMath } from '../dmath';
import { hash32 } from '../gen/rng';

export const YEAR_DAYS = 365;

/** What the weather needs to know of a place (from the generated world, gen/world.ts). */
export interface ClimatePoint {
  lon: number;
  lat: number;
  /** Warmest and coldest month (°C, at the place's elevation). */
  warm: number;
  cold: number;
  /** Rain in the summer and winter half-years (mm a year). */
  precipSummer: number;
  precipWinter: number;
  /** Prevailing wind, east- and north-positive (the generator's units: about 0 to 1.2). */
  windU: number;
  windV: number;
}

export interface WeatherClock {
  /** Day of the year (0-364) on the game's first day. */
  startDoy: number;
}

export type PrecipKind = 'none' | 'drizzle' | 'rain' | 'heavy rain' | 'sleet' | 'snow' | 'heavy snow';

export interface Weather {
  /** Air temperature outdoors (°C). */
  tempC: number;
  /** Cloud cover, 0 clear to 1 overcast. */
  cloud: number;
  /** Precipitation, mm of water an hour, and its kind. */
  rainMm: number;
  kind: PrecipKind;
  /** Wind speed (m/s) and the direction it blows from (degrees, 0 north, 90 east). */
  windMs: number;
  windFrom: number;
  /** Fog, 0 none to 1 thick. */
  fog: number;
  thunder: boolean;
  /** How strongly weather systems lie over the place (0 none). */
  front: number;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (t: number) => t * t * (3 - 2 * t);
const KM_PER_DEG = 111.32;
/** Tuning (apps/game/scripts/weather-test.ts): how often systems are born, and how much rain they give. */
export const WEATHER_TUNE = { birthBase: 0.06, birthK: 0.4, yieldExp: 0.45, yieldK: 2.9 };
const LATTICE_KM = 500, SLOT_H = 12, LIFE_MAX_H = 84;

/** A number in [0, 1) from integers. */
function rnd(seed: number, a: number, b: number, c: number, salt: number): number {
  let h = hash32(seed ^ Math.imul(a, 73856093));
  h = hash32(h ^ Math.imul(b, 19349663));
  h = hash32(h ^ Math.imul(c, 83492791));
  h = hash32(h ^ Math.imul(salt + 1, 2654435761));
  return h / 4294967296;
}

/** Day of the year (fractional) at an hour of the game. */
export function dayOfYear(clock: WeatherClock, hour: number): number {
  const d = clock.startDoy + hour / 24;
  return ((d % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
}

/** How far into summer (1) or winter (0) a day is, at a latitude (the hemispheres opposite). */
export function summerness(lat: number, doy: number): number {
  const peak = lat >= 0 ? 200 : 17;
  return 0.5 + 0.5 * DMath.cos((2 * Math.PI * (doy - peak)) / YEAR_DAYS);
}

/** The season by name. */
export function seasonAt(lat: number, doy: number): 'spring' | 'summer' | 'autumn' | 'winter' {
  let d = doy;
  if (lat < 0) d = (d + 182) % YEAR_DAYS;
  return d < 59 || d >= 334 ? 'winter' : d < 151 ? 'spring' : d < 243 ? 'summer' : 'autumn';
}

/** Rain the season brings (mm a year at this time of year). */
export function seasonalPrecip(c: ClimatePoint, doy: number): number {
  const s = summerness(c.lat, doy);
  return c.precipWinter + (c.precipSummer - c.precipWinter) * s;
}

/** The prevailing wind's speed (m/s) and direction of travel (unit vector, east and north). */
function prevailing(c: ClimatePoint): { ms: number; ex: number; ey: number } {
  const w = DMath.hypot(c.windU, c.windV);
  if (w < 0.05) {
    // Calm in the climate: a weak drift, westerly in the middle latitudes, easterly in the tropics.
    const ex = Math.abs(c.lat) > 30 ? 1 : -1;
    return { ms: 2, ex, ey: 0 };
  }
  return { ms: 1.5 + 4.5 * w, ex: c.windU / w, ey: c.windV / w };
}

/** Smooth noise over time for a place (for the day-to-day cloud and wind between systems). */
function timeNoise(seed: number, c: ClimatePoint, hour: number, salt: number, spanH: number): number {
  const ci = Math.floor(c.lon), cj = Math.floor(c.lat);
  const k = Math.floor(hour / spanH), f = smooth(hour / spanH - k);
  const a = rnd(seed, ci, cj, k, salt), b = rnd(seed, ci, cj, k + 1, salt);
  return a + (b - a) * f;
}

interface System {
  /** Influence over the place now (0 to 1). */
  infl: number;
  dT: number;
  strength: number;
  /** A twist to the wind (degrees). */
  veer: number;
}

/** The weather systems over a place at an hour. */
function systemsAt(seed: number, c: ClimatePoint, clock: WeatherClock, hour: number): System[] {
  const doy = dayOfYear(clock, hour);
  const wet = seasonalPrecip(c, doy);
  // More systems in the wet season and wet lands; even deserts see some cloud pass. Aimed at about
  // 0.15 systems over a place at a time in a desert, 0.55 at 800 mm a year, more in the wettest.
  const pBirth = clamp((WEATHER_TUNE.birthBase + WEATHER_TUNE.birthK * Math.sqrt(wet / 800)) / 9, 0.01, 0.25);
  const p = prevailing(c);
  const speedKmH = 12 + p.ms * 3.5;
  const coslat = Math.max(0.2, DMath.cos((c.lat * Math.PI) / 180));
  const px = c.lon * KM_PER_DEG * coslat, py = c.lat * KM_PER_DEG;
  const out: System[] = [];
  const k1 = Math.floor(hour / SLOT_H), k0 = Math.floor((hour - LIFE_MAX_H) / SLOT_H);
  for (let k = k0; k <= k1; k++) {
    const age0 = hour - (k + 0.5) * SLOT_H;
    // Where a system born in this slot would have to have begun to be here now.
    const bx = px - p.ex * speedKmH * age0, by = py - p.ey * speedKmH * age0;
    const gi = Math.floor(bx / LATTICE_KM), gj = Math.floor(by / LATTICE_KM);
    for (let j = gj - 2; j <= gj + 2; j++) for (let i = gi - 2; i <= gi + 2; i++) {
      if (rnd(seed, i, j, k, 1) >= pBirth) continue;
      const born = k * SLOT_H + rnd(seed, i, j, k, 2) * SLOT_H;
      const age = hour - born;
      const life = 30 + rnd(seed, i, j, k, 3) * (LIFE_MAX_H - 30);
      if (age < 0 || age > life) continue;
      const x = (i + rnd(seed, i, j, k, 4)) * LATTICE_KM + p.ex * speedKmH * age;
      const y = (j + rnd(seed, i, j, k, 5)) * LATTICE_KM + p.ey * speedKmH * age;
      const r = 200 + rnd(seed, i, j, k, 6) * 300;
      const d = DMath.hypot(x - px, y - py);
      if (d >= r) continue;
      const t = age / life;
      const grow = t < 0.2 ? smooth(t / 0.2) : t > 0.7 ? smooth((1 - t) / 0.3) : 1;
      const strength = 0.35 + 0.65 * rnd(seed, i, j, k, 7);
      const fall = 1 - (d / r) * (d / r);
      out.push({ infl: grow * fall * strength, strength, dT: -5 + rnd(seed, i, j, k, 8) * 8, veer: -60 + rnd(seed, i, j, k, 9) * 120 });
    }
  }
  return out;
}

/** The season's and the day's temperature without weather (°C). */
export function baseTemp(c: ClimatePoint, clock: WeatherClock, hour: number, cloud = 0.3): number {
  const doy = dayOfYear(clock, hour);
  const mid = (c.warm + c.cold) / 2, amp = (c.warm - c.cold) / 2;
  const season = mid + amp * (2 * summerness(c.lat, doy) - 1);
  const hod = ((hour % 24) + 24) % 24;
  // Coldest before dawn, warmest mid-afternoon; a wider swing where it is dry and continental, less under cloud.
  const swing = (4 + Math.min(4, amp / 6)) * (1.25 - 0.8 * cloud);
  return season + swing * DMath.cos((2 * Math.PI * (hod - 15)) / 24);
}

/** The weather at a place and hour. */
export function weatherAt(seed: number, c: ClimatePoint, clock: WeatherClock, hour: number): Weather {
  const doy = dayOfYear(clock, hour);
  const wet = seasonalPrecip(c, doy);
  const moist = clamp(wet / 900, 0.04, 4);
  // How much rain a system wrings out here (sublinear: wetter lands also see more systems).
  const yieldK = DMath.pow(moist, WEATHER_TUNE.yieldExp);
  const sys = systemsAt(seed, c, clock, hour);
  // Cloud: a background that wanders, and the systems overhead.
  let clear = 1 - clamp((0.08 + 0.32 * Math.sqrt(Math.min(1, moist))) * (0.4 + 1.2 * timeNoise(seed, c, hour, 11, 9)), 0, 0.85);
  let pot = 0, dT = 0, gust = 0, veer = 0, top = 0;
  for (const s of sys) {
    clear *= 1 - clamp(s.infl * 1.4, 0, 0.98);
    pot += s.infl;
    dT += s.dT * s.infl;
    gust += s.infl * s.strength;
    veer += s.veer * s.infl;
    top = Math.max(top, s.infl);
  }
  const cloud = clamp(1 - clear, 0, 1);
  const tempC = baseTemp(c, clock, hour, cloud) + dT - (pot > 0.3 ? 1 : 0);
  // Rain from the systems, by how wet the season is.
  // Dry air takes a stronger system to rain at all.
  const thresh = 0.28 + 0.3 * (1 - Math.min(1, moist * 1.6));
  let rainMm = pot > thresh ? (pot - thresh) * WEATHER_TUNE.yieldK * yieldK : 0;
  // A drizzle from heavy background cloud in wet lands.
  if (rainMm === 0 && cloud > 0.85 && moist > 0.8 && timeNoise(seed, c, hour, 13, 5) > 0.75) rainMm = 0.15;
  rainMm = Math.round(rainMm * 100) / 100;
  const kind: PrecipKind = rainMm <= 0 ? 'none' : tempC <= -0.5 ? (rainMm > 2 ? 'heavy snow' : 'snow') : tempC <= 1.5 ? 'sleet' : rainMm < 0.4 ? 'drizzle' : rainMm > 3.5 ? 'heavy rain' : 'rain';
  const p = prevailing(c);
  const hod = ((hour % 24) + 24) % 24;
  // Wind: the prevailing breeze, freshening by day, and the systems' gales.
  const day = 0.5 + 0.8 * clamp(DMath.cos((2 * Math.PI * (hod - 14)) / 24) * 0.5 + 0.5, 0, 1);
  const windMs = Math.round((p.ms * day * (0.6 + 0.8 * timeNoise(seed, c, hour, 12, 7)) + gust * 14) * 10) / 10;
  const toward = (DMath.atan2(p.ex, p.ey) * 180) / Math.PI + veer;
  const windFrom = (((toward + 180) % 360) + 360) % 360;
  const thunder = top > 0.65 && tempC > 14 && rainMm > 2;
  // Fog: still, damp mornings and evenings, not under rain.
  const still = clamp((4.5 - windMs) / 3.5, 0, 1);
  const dawn = hod >= 3 && hod <= 9 ? 1 - Math.abs(hod - 6) / 3.5 : hod >= 19 ? 0.3 : 0;
  const fogN = timeNoise(seed, c, hour, 14, 11);
  const fog = rainMm > 0.5 ? 0 : clamp(still * dawn * Math.min(1, moist * 1.3) * (fogN * 2.2 - 0.7), 0, 1);
  return { tempC: Math.round(tempC * 10) / 10, cloud, rainMm, kind, windMs, windFrom, fog: Math.round(fog * 100) / 100, thunder, front: top };
}

/** Snow lying (cm) and how muddy the ground is (0 to 1), from the last fortnight's weather. */
export function groundAt(seed: number, c: ClimatePoint, clock: WeatherClock, hour: number): { snowCm: number; mud: number } {
  const STEP = 3, DAYS = 14;
  const h0 = Math.floor(hour / STEP) * STEP - DAYS * 24;
  // A start from the climate: a cold place in its winter already has some snow down.
  const s0 = 1 - summerness(c.lat, dayOfYear(clock, h0));
  let snow = c.cold < -2 ? clamp((-c.cold - 2) * 3 * clamp((s0 - 0.45) * 3, 0, 1), 0, 90) : 0;
  let soil = 0;
  for (let h = h0; h <= hour; h += STEP) {
    const w = weatherAt(seed, c, clock, h);
    const snowing = w.kind === 'snow' || w.kind === 'heavy snow' || (w.kind === 'sleet' && w.tempC < 0.5);
    if (snowing) snow += w.rainMm * STEP;
    else soil += w.rainMm * STEP;
    if (w.tempC > 0) {
      const melt = Math.min(snow, w.tempC * 0.25 * STEP + (snowing ? 0 : w.rainMm * STEP * 0.5));
      snow -= melt;
      soil += melt * 0.3;
      soil = Math.max(0, soil - (0.15 + 0.03 * w.tempC) * STEP * (1 - w.cloud * 0.5));
    }
  }
  const frozen = weatherAt(seed, c, clock, hour).tempC < -2;
  return { snowCm: Math.round(snow), mud: frozen ? 0 : Math.round(clamp(soil / 15, 0, 1) * 100) / 100 };
}

// ---- The sun and the moon --------------------------------------------------------------------------

export interface Sun {
  /** Altitude above the horizon (degrees). */
  altitude: number;
  /** Day, dusk, night or dawn. */
  phase: 'day' | 'dusk' | 'night' | 'dawn';
  /** Light from the sky, 0 dark to 1 full day (before cloud). */
  light: number;
}

const RAD = Math.PI / 180;

function declination(doy: number): number {
  return -23.44 * DMath.cos((2 * Math.PI * (doy + 10)) / YEAR_DAYS);
}

/** The sun at a latitude, day of the year and hour of the day (local solar time). */
export function sunAt(lat: number, doy: number, hod: number): Sun {
  const dec = declination(doy) * RAD, phi = lat * RAD;
  const ha = ((hod - 12) * 15) * RAD;
  const s = DMath.sin(phi) * DMath.sin(dec) + DMath.cos(phi) * DMath.cos(dec) * DMath.cos(ha);
  const altitude = (DMath.asin(clamp(s, -1, 1)) * 180) / Math.PI;
  const light = altitude >= 6 ? 1 : altitude <= -12 ? 0 : altitude >= 0 ? 0.55 + 0.45 * (altitude / 6) : 0.55 * smooth((altitude + 12) / 12);
  const phase = altitude >= 0 ? 'day' : altitude <= -10 ? 'night' : hod < 12 ? 'dawn' : 'dusk';
  return { altitude, phase, light };
}

/** Sunrise and sunset (hours, local solar time), or a polar day or night. */
export function sunTimes(lat: number, doy: number): { rise: number; set: number } | { polar: 'day' | 'night' } {
  const dec = declination(doy) * RAD, phi = lat * RAD;
  const x = (DMath.sin(-0.83 * RAD) - DMath.sin(phi) * DMath.sin(dec)) / (DMath.cos(phi) * DMath.cos(dec));
  if (x <= -1) return { polar: 'day' };
  if (x >= 1) return { polar: 'night' };
  const h = (DMath.acos(x) * 180) / Math.PI / 15;
  return { rise: 12 - h, set: 12 + h };
}

export interface Moon {
  /** 0 new, 0.5 full. */
  phase: number;
  /** How much of it is lit (0 to 1). */
  lit: number;
  name: string;
}

const SYNODIC_H = 29.53 * 24;

export function moonAt(seed: number, hour: number): Moon {
  const offset = (hash32(seed ^ 0x6d6f6f6e) / 4294967296) * SYNODIC_H;
  const phase = ((((hour + offset) % SYNODIC_H) + SYNODIC_H) % SYNODIC_H) / SYNODIC_H;
  const lit = 0.5 - 0.5 * DMath.cos(2 * Math.PI * phase);
  const name = phase < 0.03 || phase > 0.97 ? 'new moon' : phase < 0.22 ? 'waxing crescent' : phase < 0.28 ? 'first quarter' : phase < 0.47 ? 'waxing gibbous' : phase < 0.53 ? 'full moon' : phase < 0.72 ? 'waning gibbous' : phase < 0.78 ? 'last quarter' : 'waning crescent';
  return { phase, lit, name };
}

/**
 * How much light there is out of doors (0 dark to 1 full day): the sun's, dimmed by cloud, fog and
 * falling rain or snow; at night the moon's (more on snow).
 */
export function lightAt(sun: Sun, moon: Moon, w: Weather, snowCm: number): number {
  const murk = (1 - w.cloud * 0.35) * (1 - w.fog * 0.3) * (w.rainMm > 2 ? 0.8 : 1);
  const night = (0.02 + 0.16 * moon.lit) * (1 - w.cloud * 0.85) * (snowCm > 2 ? 1.6 : 1);
  return clamp(Math.max(sun.light * murk, night), 0, 1);
}
