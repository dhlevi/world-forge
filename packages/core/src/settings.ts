/**
 * The generator settings (the seed, land, plates, erosion, settled world, language drift, races and
 * detail) and their text form, a query string like `?seed=forge&land=0.3&plates=14&erosion=0.5&settled=0.6&drift=0.3&races=1&res=1024`.
 * The atlas keeps them in the page address (url-params.ts there) and world files hold them
 * (export/worldfile.ts); every reader checks each setting and snaps it to its slider.
 */

/** The generator settings. */
export interface WorldSettings {
  seed: string;
  landFraction: number;
  plates: number;
  erosion: number;
  settled: number;
  drift: number;
  races: boolean;
  resolution: number;
}
/** The same settings, by the name the atlas has always used for them. */
export type UrlParams = WorldSettings;
const RESOLUTIONS = [512, 1024, 2048, 4096];

/** Each numeric setting: its key in the address, its range and its step (as on the sliders). */
const NUM: { key: string; field: 'landFraction' | 'plates' | 'erosion' | 'settled' | 'drift'; min: number; max: number; step: number }[] = [
  { key: 'land', field: 'landFraction', min: 0.1, max: 0.8, step: 0.01 },
  { key: 'plates', field: 'plates', min: 3, max: 40, step: 1 },
  { key: 'erosion', field: 'erosion', min: 0, max: 1, step: 0.05 },
  { key: 'settled', field: 'settled', min: 0.2, max: 1, step: 0.05 },
  { key: 'drift', field: 'drift', min: 0, max: 1, step: 0.05 },
];

const snap = (v: number, min: number, max: number, step: number) => {
  const s = Math.round((Math.min(max, Math.max(min, v)) - min) / step) * step + min;
  return Number(s.toFixed(4));
};

/** Reads the settings in a query string into `params` (leaving out any that are missing or invalid); true if any were found. */
export function readSettingsQuery(params: WorldSettings, search: string): boolean {
  const q = new URLSearchParams(search);
  let found = false;
  const seed = q.get('seed')?.trim();
  if (seed) {
    params.seed = seed.slice(0, 80);
    found = true;
  }
  for (const n of NUM) {
    const raw = q.get(n.key);
    const v = raw === null || raw.trim() === '' ? NaN : Number(raw);
    if (!Number.isFinite(v)) continue;
    params[n.field] = snap(v, n.min, n.max, n.step);
    found = true;
  }
  const races = q.get('races');
  if (races !== null && /^(0|1|true|false|on|off)$/i.test(races)) {
    params.races = /^(1|true|on)$/i.test(races);
    found = true;
  }
  const res = Number(q.get('res'));
  if (RESOLUTIONS.includes(res)) {
    params.resolution = res;
    found = true;
  }
  return found;
}

/** The query string for the settings. */
export function settingsQuery(p: WorldSettings): string {
  const q = new URLSearchParams();
  q.set('seed', p.seed);
  for (const n of NUM) q.set(n.key, String(Number(p[n.field].toFixed(4))));
  q.set('races', p.races ? '1' : '0');
  q.set('res', String(p.resolution));
  return `?${q.toString()}`;
}

