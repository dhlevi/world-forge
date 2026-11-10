import { type UrlParams, readSettingsQuery, settingsQuery } from '../settings';
import { GENERATOR_VERSION } from '../version';

/**
 * The world file: a small JSON file holding everything needed to make a world again (the seed and
 * the generator settings), and where the map was looking. Worlds are made wholly from their
 * settings, so this is the whole world in a few hundred bytes; loading it makes the same world
 * and returns to the same view.
 */
export const WORLD_FILE_FORMAT = 'world-forge.world';
export const WORLD_FILE_VERSION = 1;

export interface WorldFile {
  format: typeof WORLD_FILE_FORMAT;
  version: number;
  /** The generator version that made the world (version.ts); absent in files saved before it was recorded (version 1). */
  generator?: number;
  /** The generator settings: the seed, land, plates, erosion, settled, drift, races and detail. */
  settings: UrlParams;
  /** Where the map was looking, if saved with a view. */
  view?: { center: [number, number]; zoom: number; layer?: string };
  savedAt: string;
}

/** The world file for the settings and the view, as pretty-printed JSON. */
export function worldFileText(settings: UrlParams, view?: WorldFile['view']): string {
  const f: WorldFile = {
    format: WORLD_FILE_FORMAT, version: WORLD_FILE_VERSION, generator: GENERATOR_VERSION,
    settings: { seed: settings.seed, landFraction: settings.landFraction, plates: settings.plates, erosion: settings.erosion, settled: settings.settled, drift: settings.drift, races: settings.races, resolution: settings.resolution },
    ...(view ? { view: { center: [Number(view.center[0].toFixed(5)), Number(view.center[1].toFixed(5))] as [number, number], zoom: Number(view.zoom.toFixed(2)), ...(view.layer ? { layer: view.layer } : {}) } } : {}),
    savedAt: new Date().toISOString(),
  };
  return JSON.stringify(f, null, 2);
}

/** A file name for a world (its seed, made safe). */
export const worldFileName = (seed: string) => `${seed.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'world'}.world.json`;

/**
 * Reads a world file into `params` (each setting checked and snapped to its slider, as from a page
 * address). Throws with a plain message when the file is not a world file.
 */
/**
 * Reads a world file into `params`; `generator` is the version that saved it, which differs from
 * GENERATOR_VERSION when this code makes a slightly different world from the same settings.
 */
export function readWorldFile(text: string, params: UrlParams): { view?: WorldFile['view']; generator: number } {
  let f: Partial<WorldFile>;
  try {
    f = JSON.parse(text);
  } catch {
    throw new Error('This file is not a world file (it is not JSON).');
  }
  if (!f || typeof f !== 'object' || f.format !== WORLD_FILE_FORMAT || typeof f.settings !== 'object' || !f.settings) {
    throw new Error('This file is not a world file.');
  }
  if (typeof f.version === 'number' && f.version > WORLD_FILE_VERSION) throw new Error('This world file was saved by a newer version of World Forge.');
  const s = f.settings as Partial<UrlParams>;
  if (typeof s.seed !== 'string' || !s.seed.trim()) throw new Error('This world file has no seed.');
  // The settings reader checks and snaps each setting, and keeps the current one where a setting is missing.
  const merged: UrlParams = { ...params, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && v !== null)) } as UrlParams;
  readSettingsQuery(params, settingsQuery(merged));
  const v = f.view;
  const view = v && Array.isArray(v.center) && v.center.length === 2 && v.center.every((x) => Number.isFinite(x)) && Number.isFinite(v.zoom)
    ? { center: [Math.max(-180, Math.min(180, v.center[0])), Math.max(-85, Math.min(85, v.center[1]))] as [number, number], zoom: Math.max(0, Math.min(22, v.zoom)), ...(typeof v.layer === 'string' ? { layer: v.layer } : {}) }
    : undefined;
  return { view, generator: typeof f.generator === 'number' ? f.generator : 1 };
}
