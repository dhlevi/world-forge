/**
 * Puddles, mud and ice in places (docs/backlog.md, W1; survival.md, weather). The weather keeps
 * how wet the ground is over the last fortnight (core weather/weather.ts, `groundAt`): the water
 * standing in the hollows, how muddy the soil is, and whether it is frozen. Which tiles hold a
 * puddle or a patch of mud follows from that and the place: rain stands first in the ruts of roads
 * and tracks and on trodden earth, less on paving and turf; low spots and the same places each time
 * (a smooth noise over the map, so puddles lie in clumps and runs); and as the ground dries, the
 * puddles shrink back to the deepest of them. Frozen, a puddle is ice. Snow lying hides them all.
 *
 * Nothing is stored: like the decorations, a tile's state is worked out from its place and the sky.
 */
import { DECOR, MUD_GROUND, PUDDLE_GROUND, type DecorDef } from '@worldforge/core/local/tiles';
import { hash2 } from '../util';

export type Wet = 'puddle' | 'puddle_ice' | 'mud_patch';

/** What the weather has left on the ground (from the sky, game/weather.ts). */
export interface GroundWet {
  pool: number;
  mud: number;
  frozen: boolean;
  snowCm: number;
  /** Ice on still fresh water (cm). */
  iceCm: number;
}

/** The share of the most puddled ground (road ruts) under water when the hollows are full, and of the muddiest in mud. */
const MOST_PUDDLED = 0.3, MOST_MUD = 0.25;

/** A smooth value noise over the map, 0 to 1, in cells of `cell` tiles. */
function smooth(x: number, y: number, cell: number, salt: number): number {
  const fx = x / cell, fy = y / cell;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const v = (a: number, b: number) => (hash2(a, b, salt) % 10_000) / 10_000;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const top = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
  const bottom = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
}

const rawHollow = (x: number, y: number) => smooth(x, y, 5, 0x9a11) * 0.75 + ((hash2(x, y, 0x9a12) % 1000) / 1000) * 0.25;

/** The spread of the raw hollows, measured once, to make them even (a share `t` of tiles lies below `t`). */
const KNOTS = (() => {
  const n = 20_000, v: number[] = [];
  for (let i = 0; i < n; i++) v.push(rawHollow((i * 7919) % 1013, Math.floor(i / 7) * 3));
  v.sort((a, b) => a - b);
  return Array.from({ length: 33 }, (_, k) => v[Math.min(n - 1, Math.round((k / 32) * (n - 1)))]);
})();

/** How low a tile lies for water to gather (0 the first to fill, 1 the last), evenly spread: clumped, with a little of each tile's own. */
export function hollow(x: number, y: number): number {
  const r = rawHollow(x, y);
  let k = 0;
  while (k < 31 && KNOTS[k + 1] < r) k++;
  const a = KNOTS[k], b = KNOTS[k + 1];
  return Math.max(0, Math.min(1, (k + (b > a ? (r - a) / (b - a) : 0)) / 32));
}

/** The puddle, ice or mud on a tile of this ground (by name) out of doors, if any. */
export function wetAt(ground: string, x: number, y: number, g: GroundWet): Wet | null {
  if (g.snowCm >= 2) return null;
  const p = PUDDLE_GROUND[ground];
  const h = hollow(x, y);
  if (p && g.pool > 0 && h < g.pool * MOST_PUDDLED * p) return g.frozen ? 'puddle_ice' : 'puddle';
  const m = MUD_GROUND[ground];
  // Mud lies about the puddles, and in its own places as the soil grows wet.
  if (m && g.mud > 0 && !g.frozen && Math.min(h, smooth(x, y, 4, 0x3d2c) * 1.4 - 0.2) < g.mud * MOST_MUD * m) return 'mud_patch';
  return null;
}

/** The decoration drawn for each (core local/tiles.ts). */
export const WET_DECOR: Readonly<Record<Wet, DecorDef>> = {
  puddle: DECOR.find((d) => d.name === 'puddle')!,
  puddle_ice: DECOR.find((d) => d.name === 'puddle_ice')!,
  mud_patch: DECOR.find((d) => d.name === 'mud_patch')!,
};

// ---- Frozen water (backlog W3) ------------------------------------------------------------------

/** Ice this thick shows, and bears a person (it may still give way); this thick, it is safe. */
export const ICE_SHOWS = 3, ICE_SAFE = 10;

/** How each water freezes against a still lake: the shallows first, rivers slower for their flow, the sea least. */
const FREEZES: Readonly<Record<string, number>> = { water_shallow: 1.4, water_deep: 1, river: 0.55, river_deep: 0.3 };

/**
 * The ice on a tile of water (cm): the lake's ice (the weather's), by how this water freezes, a
 * little more or less from place to place; the sea (open water at or below the sea's level) only a
 * quarter as much.
 */
export function iceOn(ground: string, elev: number, x: number, y: number, iceCm: number): number {
  const f = FREEZES[ground];
  if (!f || iceCm <= 0) return 0;
  const sea = !ground.startsWith('river') && elev <= 0 ? 0.25 : 1;
  const v = 0.85 + ((hash2(x, y, 0x1ce) % 1000) / 1000) * 0.3;
  return Math.round(iceCm * f * sea * v * 10) / 10;
}

/** The decoration drawn over frozen water. */
export const ICE_DECOR = { thick: DECOR.find((d) => d.name === 'ice_sheet')!, thin: DECOR.find((d) => d.name === 'ice_thin')! };
