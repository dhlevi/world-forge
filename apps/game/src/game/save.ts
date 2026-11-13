/**
 * Saved games. A save holds only what the player has changed or learnt, never the world itself:
 * the world's settings (so it is made again, the same, from its seed), where the game began, and
 * the game's state over that baseline (the wanderer, the clock, objects moved or opened, what has
 * been seen, the message log).
 *
 * Saves are kept in the desktop app's data folder (saves/<id>.json) or, in a browser, in the
 * page's local storage; either can be exported to a file and imported again.
 */
import type { CampData } from './camp';
import type { WorldSettings } from '@worldforge/core/settings';
import { GENERATOR_VERSION } from '@worldforge/core/version';
import { LOCAL_MAP_VERSION } from '@worldforge/core/local/chunk';
import { desktop } from '../desktop';
import { checkSave, migrateSave, pruneUnknown, SAVE_VERSION } from './migrate';
import { ITEM } from '../actors/items/defs';
import type { Game } from './game';
import type { ActorData } from '../actors/actor';
import type { Item } from '../actors/items/item';

export const SAVE_FORMAT = 'world-forge.save';
export { SAVE_VERSION };

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  /** The generator and local-map versions the world was made with (version.ts, local/chunk.ts). */
  generator: number;
  localMap: number;
  /** One id per game, kept across its saves. */
  id: string;
  /** A short title for the list: the place begun and the world. */
  title: string;
  savedAt: string;
  settings: WorldSettings;
  start: { siteId: string; siteName: string };
  /** Where the wanderer is now (for the list). */
  place: string;
  player: { x: number; y: number };
  /** Game time, seconds. */
  time: number;
  /** Objects changed over the baseline: [tx, ty, object id]. */
  changes: [number, number, number][];
  /** Explored tiles per chunk ("cx,cy"), bit-packed and base64. */
  seen: Record<string, string>;
  log: { t: string; text: string }[];
  zoom?: number;
  /** Discovered cells of the travel map (x0, y0, x1, y1, ...; game/discovery.ts). */
  discovered?: number[];
  /** Things left on the local map: [tx, ty, items] (game/ground.ts). */
  ground: [number, number, Item[]][];
  /** Camps made and kept (game/camp.ts). */
  camps: CampData[];
  /** The state of the game's own stream of chance (game/game.ts); a game saved without it seeds it from its id. */
  dice?: number;
  /** The player's character (actors/actor.ts); none in games saved before characters. */
  character?: ActorData;
  /** Not saved: what reading it had to say (things left out); shown when the game is loaded. */
  loadNotes?: string[];
}

/** The short form shown in the list of saves. */
export type SaveSummary = Pick<SaveFile, 'id' | 'title' | 'savedAt' | 'place' | 'time' | 'settings' | 'generator' | 'localMap'>;

export function newGameId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function packBits(a: Uint8Array): string {
  const out = new Uint8Array(Math.ceil(a.length / 8));
  for (let i = 0; i < a.length; i++) if (a[i]) out[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (let i = 0; i < out.length; i++) s += String.fromCharCode(out[i]);
  return btoa(s);
}

export function unpackBits(b64: string, n: number): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return out;
}

/** A save of the game as it stands. */
export function makeSave(game: Game, meta: { id: string; settings: WorldSettings; siteId: string; siteName: string; zoom?: number; character?: ActorData }): SaveFile {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    generator: GENERATOR_VERSION,
    localMap: LOCAL_MAP_VERSION,
    id: meta.id,
    title: meta.character ? `${(meta.character.components.identity as { full?: string })?.full ?? 'The wanderer'} of ${meta.siteName}, world "${meta.settings.seed}"` : `${meta.siteName}, world "${meta.settings.seed}"`,
    savedAt: new Date().toISOString(),
    settings: { ...meta.settings },
    start: { siteId: meta.siteId, siteName: meta.siteName },
    place: game.hud.place || meta.siteName,
    player: { x: game.px, y: game.py },
    time: game.time,
    changes: [...game.map.changes].map(([k, v]) => {
      const [x, y] = k.split(',').map(Number);
      return [x, y, v] as [number, number, number];
    }),
    seen: game.map.exportSeen(),
    log: game.hud.log.slice(-40),
    zoom: meta.zoom,
    discovered: game.discovery.export(),
    ground: game.ground.export(),
    camps: game.camps.export(),
    dice: game.dice.state,
    ...(meta.character ? { character: meta.character } : {}),
  };
}

/** Puts a saved game's state into a freshly started game. */
export function applySave(game: Game, s: SaveFile): void {
  game.px = s.player.x;
  game.py = s.player.y;
  game.time = s.time;
  game.map.changes.clear();
  for (const [x, y, v] of s.changes) game.map.changes.set(`${x},${y}`, v);
  game.map.importSeen(s.seen);
  game.hud.log.splice(0, game.hud.log.length, ...s.log);
  if (s.discovered) game.discovery.import(s.discovered);
  game.ground.import(s.ground);
  game.camps.import(s.camps);
  if (typeof s.dice === 'number') game.dice.state = s.dice;
}

/**
 * Reads a save from a file or storage: brings it up to date (game/migrate.ts), checks its shape,
 * and leaves out things of kinds this game does not know. Throws with a plain message if it is not
 * a save, is from a newer game, or is damaged.
 */
export function readSave(text: string): SaveFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not a saved game (it is not JSON).');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || (raw as { format?: unknown }).format !== SAVE_FORMAT) throw new Error('This file is not a saved game.');
  const s = raw as Record<string, unknown>;
  if (typeof s.version === 'number' && s.version > SAVE_VERSION) throw new Error('This game was saved by a newer version of the game.');
  migrateSave(s);
  const bad = checkSave(s);
  if (bad.length) throw new Error(`This saved game is damaged: ${bad.join('; ')}.`);
  const notes = pruneUnknown(s, (id) => ITEM.has(id));
  const save = s as unknown as SaveFile;
  if (notes.length) save.loadNotes = notes;
  return save;
}

/** A warning when the save was made with another generator or local-map version, else ''. */
export function versionNote(s: SaveFile): string {
  const notes: string[] = [];
  if (s.generator !== GENERATOR_VERSION) notes.push(`its world was made by generator version ${s.generator} (this game makes ${GENERATOR_VERSION})`);
  if (s.localMap !== LOCAL_MAP_VERSION) notes.push(`its map tiles by local-map version ${s.localMap} (this game makes ${LOCAL_MAP_VERSION})`);
  const out = notes.length ? [`This game was saved when ${notes.join(' and ')}, so places may have changed a little.`] : [];
  return [...out, ...(s.loadNotes ?? [])].join(' ');
}

const summary = (s: SaveFile): SaveSummary => ({ id: s.id, title: s.title, savedAt: s.savedAt, place: s.place, time: s.time, settings: s.settings, generator: s.generator, localMap: s.localMap });

// ---- Where saves are kept ---------------------------------------------------------------------

const LS = 'wf-save:';
const fileOf = (id: string) => `saves/${id.replace(/[^a-z0-9-]/gi, '')}.json`;

export async function writeSave(s: SaveFile): Promise<void> {
  const { loadNotes: _notes, ...kept } = s;
  const text = JSON.stringify(kept);
  if (desktop) {
    await desktop.data.write(fileOf(s.id), text);
    return;
  }
  try {
    localStorage.setItem(LS + s.id, text);
  } catch {
    throw new Error('The browser would not store the save (storage full or blocked); export it to a file instead.');
  }
}

export async function loadSave(id: string): Promise<SaveFile | null> {
  let text: string | null = null;
  if (desktop) text = await desktop.data.read(fileOf(id));
  else {
    try {
      text = localStorage.getItem(LS + id);
    } catch {
      text = null;
    }
  }
  return text ? readSave(text) : null;
}

export async function listSaves(): Promise<SaveSummary[]> {
  const out: SaveSummary[] = [];
  if (desktop) {
    for (const name of await desktop.data.list('saves')) {
      if (!name.endsWith('.json')) continue;
      try {
        const t = await desktop.data.read(`saves/${name}`);
        if (t) out.push(summary(readSave(t)));
      } catch {
        // A damaged file is left out of the list.
      }
    }
  } else {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k?.startsWith(LS)) continue;
        try {
          out.push(summary(readSave(localStorage.getItem(k) ?? '')));
        } catch {
          // Left out.
        }
      }
    } catch {
      // No storage in this browser.
    }
  }
  return out.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

export async function deleteSave(id: string): Promise<void> {
  if (desktop) await desktop.data.remove(fileOf(id));
  else {
    try {
      localStorage.removeItem(LS + id);
    } catch {
      // Nothing to remove.
    }
  }
}

/** Offers the save as a file to keep (a download in a browser, a save dialog in the desktop app). */
export function exportSave(s: SaveFile): void {
  const blob = new Blob([JSON.stringify(s, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${s.start.siteName.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'wanderer'}-${s.savedAt.slice(0, 10)}.save.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
