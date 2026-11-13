/**
 * The weather where the wanderer is (packages/core/src/weather/weather.ts): the sky, the wind,
 * the sun and moon, snow and mud underfoot, how much light there is, and the season; what has
 * changed (for the log); the weather in words (for the panel); and reading the sky for what is
 * coming (Survival).
 */
import { hashString } from '@worldforge/core/gen/rng';
import { dayOfYear, groundAt, lightAt, moonAt, seasonAt, sunAt, sunTimes, weatherAt, type ClimatePoint, type Moon, type Sun, type Weather } from '@worldforge/core/weather/weather';
import { START_DAY_OF_YEAR, type PlaceClimate } from './calendar';
import type { Grade } from '../actors/checks';

export interface Sky {
  /** Game time (s). */
  t: number;
  w: Weather;
  sun: Sun;
  moon: Moon;
  snowCm: number;
  mud: number;
  /** Light out of doors, 0 dark to 1 full day. */
  light: number;
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  doy: number;
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/** The wind in words (after Beaufort). */
export function windWord(ms: number): string {
  return ms < 0.5 ? 'calm' : ms < 3.3 ? 'a light breeze' : ms < 5.5 ? 'a gentle breeze' : ms < 8 ? 'a moderate breeze' : ms < 10.8 ? 'a fresh wind' : ms < 13.9 ? 'a strong wind' : ms < 17.2 ? 'a near gale' : ms < 24.5 ? 'a gale' : 'a storm';
}
const windRank = (ms: number) => (ms < 8 ? 0 : ms < 13.9 ? 1 : ms < 17.2 ? 2 : 3);

export class WeatherService {
  readonly clock = { startDoy: START_DAY_OF_YEAR };
  readonly seed: number;
  private place: ClimatePoint;
  private wCache = new Map<number, Weather>();
  private gCache = new Map<number, { snowCm: number; mud: number }>();

  constructor(seed: string, lon: number, lat: number) {
    this.seed = hashString(`weather|${seed}`);
    // Until the worker says, a mild middling climate.
    this.place = { lon, lat, warm: 18, cold: 2, precipSummer: 700, precipWinter: 700, windU: 0.5, windV: 0 };
  }

  get lat(): number {
    return this.place.lat;
  }

  /** The climate where the wanderer now is. */
  setPlace(lon: number, lat: number, c: PlaceClimate): void {
    const p = this.place;
    if (p.lon === lon && p.lat === lat && p.warm === c.warm && p.precipSummer === c.precipSummer) return;
    this.place = { lon, lat, ...c };
    this.wCache.clear();
    this.gCache.clear();
  }

  /** The weather at an hour of the game (whole hours, here). */
  weather(hour: number): Weather {
    const h = Math.floor(hour);
    let w = this.wCache.get(h);
    if (!w) {
      w = weatherAt(this.seed, this.place, this.clock, h);
      if (this.wCache.size > 400) this.wCache.clear();
      this.wCache.set(h, w);
    }
    return w;
  }

  private ground(hour: number): { snowCm: number; mud: number } {
    const k = Math.floor(hour / 3);
    let g = this.gCache.get(k);
    if (!g) {
      g = groundAt(this.seed, this.place, this.clock, k * 3);
      if (this.gCache.size > 100) this.gCache.clear();
      this.gCache.set(k, g);
    }
    return g;
  }

  /** Everything about the sky at a game time. */
  sky(t: number): Sky {
    const hour = t / 3600;
    const w = this.weather(hour);
    const doy = dayOfYear(this.clock, hour);
    const sun = sunAt(this.place.lat, doy, hour % 24);
    const moon = moonAt(this.seed, hour);
    const g = this.ground(hour);
    return { t, w, sun, moon, snowCm: g.snowCm, mud: g.mud, light: lightAt(sun, moon, w, g.snowCm), season: seasonAt(this.place.lat, doy), doy };
  }

  /** Sunrise and sunset today, in words. */
  sunWords(t: number): string {
    const st = sunTimes(this.place.lat, dayOfYear(this.clock, t / 3600));
    if ('polar' in st) return st.polar === 'day' ? 'The sun does not set.' : 'The sun does not rise.';
    const f = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
    return `Sunrise ${f(st.rise)}, sunset ${f(st.set)}`;
  }

  // ---- In words ----------------------------------------------------------------------------------

  /** The time of day in a word. */
  static partOfDay(s: Sky): string {
    const hod = (s.t / 3600) % 24;
    if (s.sun.phase === 'dawn') return 'dawn';
    if (s.sun.phase === 'dusk') return 'dusk';
    if (s.sun.phase === 'night') return hod >= 12 && hod < 23 ? 'evening' : 'night';
    return hod < 11 ? 'morning' : hod < 14 ? 'midday' : hod < 17 ? 'afternoon' : 'evening';
  }

  /** The sky in words: "overcast, light rain", "clear and starlit, a waxing moon". */
  static skyWords(s: Sky): string {
    const w = s.w;
    const day = s.sun.phase === 'day' || s.sun.phase === 'dawn' || s.sun.phase === 'dusk';
    const cover = w.cloud < 0.15 ? (day ? 'clear' : 'clear and starlit') : w.cloud < 0.45 ? 'a few clouds' : w.cloud < 0.8 ? 'cloudy' : 'overcast';
    const fall = w.thunder ? 'a thunderstorm' : w.kind === 'none' ? '' : w.kind === 'rain' && w.rainMm < 1 ? 'light rain' : w.kind;
    const fog = w.fog > 0.5 ? 'thick fog' : w.fog > 0.2 ? 'mist' : '';
    const moon = !day && w.cloud < 0.6 && s.moon.lit > 0.1 ? `a ${s.moon.name.replace(/ moon$/, '')} moon` : '';
    return [fall ? (w.cloud > 0.8 ? fall : `${cover}, ${fall}`) : cover, fog, moon].filter(Boolean).join('; ');
  }

  static windWords(w: Weather): string {
    const word = windWord(w.windMs);
    return w.windMs < 0.5 ? 'no wind' : `${word} from the ${compass(w.windFrom)}`;
  }

  /** What has changed between two skies, for the log. */
  static changes(a: Sky | null, b: Sky): string[] {
    if (!a) return [];
    const out: string[] = [];
    const pa = a.sun.phase, pb = b.sun.phase;
    if (pa !== pb) {
      if (pb === 'day' && (pa === 'dawn' || pa === 'night')) out.push(b.w.cloud > 0.8 ? 'Day breaks, grey under the cloud.' : 'The sun rises.');
      else if (pb === 'dusk') out.push(b.w.cloud > 0.8 ? 'The light begins to fail.' : 'The sun sets.');
      else if (pb === 'night') out.push('Night falls.');
      else if (pb === 'dawn') out.push('The sky grows light in the east.');
    }
    const ka = a.w.kind, kb = b.w.kind;
    const snowy = (k: string) => k === 'snow' || k === 'heavy snow';
    if (ka !== kb) {
      if (kb === 'none') out.push(snowy(ka) ? 'The snow stops falling.' : ka === 'sleet' ? 'The sleet stops.' : 'The rain stops.');
      else if (ka === 'none' || (snowy(kb) && !snowy(ka)) || (kb === 'sleet' && ka !== 'sleet')) {
        out.push(kb === 'drizzle' ? 'A drizzle sets in.' : kb === 'rain' ? 'It begins to rain.' : kb === 'heavy rain' ? 'Rain pours down.' : kb === 'sleet' ? 'Sleet begins to fall.' : kb === 'snow' ? 'It begins to snow.' : 'Snow falls thick and fast.');
      } else if (kb === 'heavy rain') out.push('The rain grows heavy.');
      else if (kb === 'heavy snow') out.push('The snow comes thicker.');
      else if (ka === 'heavy rain' || ka === 'heavy snow') out.push(`The ${snowy(kb) ? 'snow' : 'rain'} eases.`);
    }
    if (b.w.thunder && !a.w.thunder) out.push('Thunder rolls overhead.');
    const ra = windRank(a.w.windMs), rb = windRank(b.w.windMs);
    if (rb > ra) out.push(`The wind rises to ${windWord(b.w.windMs)}.`);
    else if (rb < ra && rb === 0) out.push('The wind drops.');
    if (b.w.fog > 0.4 && a.w.fog <= 0.4) out.push('A fog comes down.');
    else if (b.w.fog <= 0.2 && a.w.fog > 0.4) out.push('The fog lifts.');
    if (b.snowCm >= 2 && a.snowCm < 2) out.push('Snow lies on the ground.');
    else if (b.snowCm < 2 && a.snowCm >= 2) out.push('The last of the snow has melted.');
    if (a.season !== b.season) out.push({ spring: 'Spring has come.', summer: 'It is summer now.', autumn: 'Autumn has come.', winter: 'Winter has come.' }[b.season]);
    return out;
  }

  // ---- Reading the sky --------------------------------------------------------------------------

  /**
   * A forecast from reading the sky (by a Survival grade): how far ahead it sees, and how true it is.
   * A failure guesses the timing wrongly; a fumble reads the sky the wrong way round.
   */
  forecast(t: number, g: Grade, rnd: () => number): string {
    const ahead = ({ fine: 24, success: 12, near: 6, fail: 6, fumble: 6 } as Record<Grade, number>)[g];
    const shift = g === 'fail' ? Math.round((rnd() - 0.5) * 12) : 0;
    const h0 = t / 3600;
    const now = this.weather(h0);
    const wet = (w: Weather) => w.rainMm > 0.1;
    const parts: string[] = [];
    let first: { h: number; w: Weather } | null = null, stop: { h: number } | null = null;
    for (let h = 1; h <= ahead; h++) {
      const w = this.weather(h0 + h + shift);
      if (!first && wet(w) !== wet(now)) first = { h, w };
      else if (first && !stop && wet(w) === wet(now)) stop = { h };
    }
    const when = (h: number) => {
      const hod = (h0 + h) % 24, day = Math.floor((h0 + h) / 24) - Math.floor(h0 / 24);
      const part = hod < 5 ? 'in the small hours' : hod < 12 ? 'in the morning' : hod < 17 ? 'in the afternoon' : hod < 21 ? 'in the evening' : 'tonight';
      if (h <= 2) return 'soon';
      return day === 0 ? (part === 'tonight' ? 'tonight' : `${part.replace('in the', 'this')}`) : day === 1 && hod < 12 ? `tomorrow ${part.replace('in the ', '')}` : part === 'tonight' ? 'tonight' : `by ${part.replace('in the ', '')}`;
    };
    let wetSoon = first ? wet(first.w) : wet(now);
    if (g === 'fumble') wetSoon = !wetSoon;
    if (first || g === 'fumble') {
      const kind = first && !wet(first.w) ? '' : first?.w.kind.includes('snow') || (now.tempC < 1 && !first) ? 'snow' : 'rain';
      if (wetSoon) parts.push(`${kind || 'rain'} ${first ? when(first.h) : 'soon'}${stop ? `, passing ${when(stop.h)}` : ''}`);
      else parts.push(`${wet(now) ? 'clearing' : 'fair'} ${first ? when(first.h) : 'soon'}`);
    } else parts.push(wet(now) ? `no end to the ${now.kind.includes('snow') ? 'snow' : 'rain'} yet` : 'fair weather holding');
    // The wind and the cold.
    const later = this.weather(h0 + Math.min(ahead, 8) + shift);
    if (g !== 'fumble') {
      if (later.windMs - now.windMs > 5) parts.push('the wind rising');
      if (later.tempC - now.tempC < -5) parts.push('turning colder');
      else if (later.tempC - now.tempC > 5) parts.push('turning warmer');
    }
    const sure = g === 'fine' ? 'You read the sky with confidence' : g === 'success' ? 'You read the sky' : g === 'near' ? 'You read what you can in the sky' : 'You study the sky';
    return `${sure}: ${parts.join('; ')}.`;
  }
}
