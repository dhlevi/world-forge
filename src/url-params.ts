/**
 * The world settings in the page address (`?seed=forge&land=0.3&plates=14&erosion=0.5&settled=0.6&drift=0.3&races=1&res=1024`),
 * so a world can be bookmarked, shared or reloaded. The address follows the world that was last
 * generated (not settings changed since), and each new world is a step in the browser history:
 * Back and Forward return to the worlds made before.
 */

/** The generator settings, as kept in `store.params`. */
export interface UrlParams {
  seed: string;
  landFraction: number;
  plates: number;
  erosion: number;
  settled: number;
  drift: number;
  races: boolean;
  resolution: number;
}

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

/** Reads the settings in an address into `params` (leaving out any that are missing or invalid); true if any were found. */
export function readUrlParams(params: UrlParams, search = window.location.search): boolean {
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

/** The address query for the settings. */
export function urlQuery(p: UrlParams): string {
  const q = new URLSearchParams();
  q.set('seed', p.seed);
  for (const n of NUM) q.set(n.key, String(Number(p[n.field].toFixed(4))));
  q.set('races', p.races ? '1' : '0');
  q.set('res', String(p.resolution));
  return `?${q.toString()}`;
}

/**
 * Puts the settings of a newly made world in the address: a new history step when they differ from
 * the address's (`replace` keeps the current step, for the first world and for Back / Forward).
 */
export function writeUrlParams(p: UrlParams, replace: boolean): void {
  const query = urlQuery(p);
  if (query === window.location.search) return;
  const url = `${window.location.pathname}${query}${window.location.hash}`;
  try {
    if (replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
  } catch {
    // Some embedded or sandboxed pages forbid changing the address; the world still works.
  }
}
