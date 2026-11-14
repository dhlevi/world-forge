/**
 * The tileset's index (public/tileset/tileset.json, see TILESET.md) read into plain data: which
 * picture, on which sheet, each frame of each tile is; how big it is and where it sits; how it is
 * animated; and which tiles stand in for others that have no art yet. No drawing here (that is
 * game/tileset.ts), so that the format can be checked in Node (scripts/tileset-test.ts).
 *
 * A frame is given in one of these ways:
 *
 * - `[column, row]`: one tile-sized cell of the default sheet;
 * - `{ "sheet": "nature", "at": [column, row], "size": [w, h] }`: cells of a named sheet, `size` in
 *   cells (1 × 1 if left out);
 * - `{ "sheet": "nature", "rect": [x, y, w, h] }`: a rectangle in pixels;
 *
 * with, for any of the object forms:
 *
 * - `"offset": [dx, dy]`: where the picture's top-left corner sits from the tile's, in pixels.
 *   Left out, a picture larger than a tile stands on the tile: centred across it, its foot on the
 *   tile's foot, rising above it;
 * - `"frames": n` (with `"step": [dx, dy]` in cells, one picture's width to the right if left out)
 *   or `"at": [[c, r], [c, r], ...]`: the frames of an animation, each shown `"ms"` milliseconds
 *   (200 if left out).
 */

export type FrameLayer = 'ground' | 'object' | 'decor' | 'edge' | 'tree' | 'figure' | 'roof';

/** One picture: a rectangle of a sheet, and where it sits over the tile (pixels). */
export interface Picture {
  sheet: string;
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
}

/** One frame name's art: its pictures (more than one when animated). */
export interface FrameArt {
  /** The tile's layer and name ("ground:grass"), with the join after a hash ("object:wall_stone#5"). */
  key: string;
  /** The variant (0 for the plain name, 1 for "grass.1"). */
  variant: number;
  pictures: Picture[];
  /** Milliseconds each picture of an animation is shown. */
  ms: number;
}

export interface StandIn {
  /** The tile drawn with another's art ("grass_lush"), and that other ("grass"). */
  name: string;
  as: string;
  /** A colour the borrowed art is multiplied by (0xffffff: as it is). */
  tint: number;
}

export interface TilesetIndex {
  tileSize: number;
  /** Sheet name to image file (the default sheet is ""). */
  sheets: Record<string, string>;
  frames: FrameArt[];
  standIns: StandIn[];
  /** What was not understood, for the developer console. */
  warnings: string[];
}

/** Says which layer a name belongs to (or undefined if it is no tile or decoration). */
export type LayerOf = (name: string) => FrameLayer | undefined;

/**
 * Frames may be drawn for a season, or for snow lying ("grass@winter", "tree_broadleaf@autumn",
 * "grass@snow"): used in place of the plain frame then, and not tinted for the season.
 */
export const SEASON_KEYS = ['spring', 'summer', 'autumn', 'winter', 'snow'] as const;
export type SeasonKey = (typeof SEASON_KEYS)[number];

/** A frame's name: the tile, a season, a variant, a join ("leaves_broadleaf@autumn.1#5"). */
const FRAME_NAME = /^([a-z0-9_]+)(?:@(spring|summer|autumn|winter|snow))?(?:\.(\d+))?(?:#(\d+))?$/;

/**
 * The frames to look for, best first, for a tile with a join (-1: none) in these seasons (best
 * first, such as snow lying, then the season): each season's join frame, then its plain frame,
 * then the plain join frame and the plain frame.
 */
export function lookKeys(layer: FrameLayer, name: string, mask: number, seasons: readonly string[]): string[] {
  const out: string[] = [];
  for (const s of [...seasons.map((x) => `@${x}`), '']) {
    if (mask >= 0) out.push(`${layer}:${name}${s}#${mask}`);
    out.push(`${layer}:${name}${s}`);
  }
  return out;
}
const isPair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
const isQuad = (v: unknown): v is [number, number, number, number] => Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** A colour written "#rrggbb" as a number (white if it is not one). */
export function colourOf(v: unknown): number {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? parseInt(v.slice(1), 16) : 0xffffff;
}

/** Reads a tileset index. Anything it does not understand is left out and noted in `warnings`. */
export function readTileset(raw: unknown, layerOf: LayerOf): TilesetIndex {
  const warnings: string[] = [];
  const json = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const T = typeof json.tileSize === 'number' && json.tileSize > 0 ? json.tileSize : 16;
  const sheets: Record<string, string> = { '': typeof json.image === 'string' ? json.image : 'tileset.png' };
  if (json.sheets && typeof json.sheets === 'object') {
    for (const [name, file] of Object.entries(json.sheets as Record<string, unknown>)) {
      if (typeof file === 'string') sheets[name] = file;
      else warnings.push(`sheet ${name}: the file name should be a string`);
    }
  }

  const frames: FrameArt[] = [];
  const tiles = (json.tiles && typeof json.tiles === 'object' ? json.tiles : {}) as Record<string, unknown>;
  for (const [frame, spec] of Object.entries(tiles)) {
    const m = FRAME_NAME.exec(frame);
    const layer = m ? layerOf(m[1]) : undefined;
    if (!m || !layer) {
      warnings.push(`${frame}: no tile or decoration of that name`);
      continue;
    }
    const pictures = readPictures(frame, spec, T, sheets, warnings);
    if (!pictures) continue;
    const ms = spec && typeof spec === 'object' && !Array.isArray(spec) && typeof (spec as { ms?: unknown }).ms === 'number' ? Math.max(16, (spec as { ms: number }).ms) : 200;
    frames.push({ key: `${layer}:${m[1]}${m[2] ? `@${m[2]}` : ''}${m[4] !== undefined ? `#${m[4]}` : ''}`, variant: m[3] ? Number(m[3]) : 0, pictures, ms });
  }

  const standIns: StandIn[] = [];
  const aliases = (json.standIns ?? {}) as Record<string, unknown>;
  for (const [name, v] of Object.entries(aliases && typeof aliases === 'object' ? aliases : {})) {
    const as = typeof v === 'string' ? v : v && typeof v === 'object' ? (v as { as?: unknown }).as : undefined;
    if (!layerOf(name) || typeof as !== 'string' || !layerOf(as)) {
      warnings.push(`stand-in ${name}: both it and what it stands in for must be tiles or decorations`);
      continue;
    }
    standIns.push({ name, as, tint: typeof v === 'object' ? colourOf((v as { tint?: unknown }).tint) : 0xffffff });
  }
  return { tileSize: T, sheets, frames, standIns, warnings };
}

function readPictures(frame: string, spec: unknown, T: number, sheets: Record<string, string>, warnings: string[]): Picture[] | null {
  // The first form: [column, row] on the default sheet.
  if (isPair(spec)) return [{ sheet: '', x: spec[0] * T, y: spec[1] * T, w: T, h: T, dx: 0, dy: 0 }];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    warnings.push(`${frame}: expected [column, row] or an object`);
    return null;
  }
  const o = spec as { sheet?: unknown; at?: unknown; size?: unknown; rect?: unknown; offset?: unknown; frames?: unknown; step?: unknown };
  const sheet = typeof o.sheet === 'string' ? o.sheet : '';
  if (!(sheet in sheets)) {
    warnings.push(`${frame}: no sheet named ${sheet}`);
    return null;
  }
  let w: number, h: number;
  const at: [number, number][] = [];
  if (isQuad(o.rect)) {
    [, , w, h] = o.rect;
    at.push([o.rect[0], o.rect[1]]);
  } else {
    const size = isPair(o.size) ? o.size : [1, 1];
    w = size[0] * T;
    h = size[1] * T;
    if (isPair(o.at)) at.push([o.at[0] * T, o.at[1] * T]);
    else if (Array.isArray(o.at) && o.at.length && o.at.every(isPair)) for (const p of o.at as [number, number][]) at.push([p[0] * T, p[1] * T]);
    else {
      warnings.push(`${frame}: give "at" ([column, row], or a list of them) or "rect" ([x, y, w, h])`);
      return null;
    }
  }
  if (!(w > 0 && h > 0)) {
    warnings.push(`${frame}: the picture has no size`);
    return null;
  }
  // An animation laid out in a row (or along "step").
  const n = typeof o.frames === 'number' ? Math.max(1, Math.min(64, Math.floor(o.frames))) : 1;
  if (n > 1 && at.length === 1) {
    const step = isPair(o.step) ? [o.step[0] * T, o.step[1] * T] : [w, 0];
    for (let i = 1; i < n; i++) at.push([at[0][0] + step[0] * i, at[0][1] + step[1] * i]);
  }
  // Standing on the tile unless told otherwise: centred across it, its foot on the tile's foot.
  const [dx, dy] = isPair(o.offset) ? o.offset : [-(w - T) / 2, -(h - T)];
  return at.map(([x, y]) => ({ sheet, x, y, w, h, dx, dy }));
}
