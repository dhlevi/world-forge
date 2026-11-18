/**
 * Caves, dungeons and delves on the local map (docs/design/navigation.md, step 11): their plans
 * (dungeons/kinds.ts on 5 ft squares, lairs/lair.ts in metres) laid on the tile grid as floors
 * below the land (local/chunk.ts, `layers`), at their true places under their entrances.
 *
 * - **Depth.** A place below the land lies under the lowest ground over it, two levels down
 *   (three under a town, clear of the cellars); its lower levels follow a level apart. The way in
 *   from the surface (a cave mouth, a dungeon's stair, a sewer grate, a well's shaft) drops
 *   straight down to it, however deep: a way down always meets the way up at the same tile.
 * - **Walls** are whole tiles: the rock (or masonry) next to any open square. A door on the edge
 *   between two squares stands on whichever of them has wall on both sides.
 * - **Above the land**, a tower is a building: its ground floor on the surface (its floor levelled,
 *   walls round, a door), its storeys and roof as floors above it, its cellar below. A ruin's
 *   ground is drawn on the surface as broken walls (in the wild); a prison's and a stronghold's are
 *   the buildings of their plans; their lower levels lie below.
 * - **Delves** are laid out whole: the gate halls behind the great gate, a great avenue running
 *   east from them with the districts along it, north and south, each joined to it by a tunnel at
 *   the same depth, and the deeps a level below the first forge district.
 * - The Underworld (the caverns deep caves lead down to) is not laid out yet: its ways down lead
 *   nowhere for now.
 *
 * Pure and deterministic: a place is laid out from its site and the land's height alone, so every
 * chunk that holds a part of it agrees.
 */
import { type DLevel, type Dungeon, type DungeonKind, type DungeonSite, CHANNEL, FLOOR, GROUND, PIT, RUBBLE, VOID, WATER } from '../dungeons/core';
import { dungeon } from '../dungeons/kinds';
import { lairMap } from '../lairs/lair';
import { inLoops, type LairSite, type LairMap } from '../lairs/base';
import type { Roof } from './roofs';
import { G, O, OBJECT_TILES } from './tiles';

/** Metres in a level (as local/chunk.ts: the land's height and floors go up in these). */
const LEVEL_M = 3;
const TILE = 1.5;

/** One level of a place, on its own box of tiles (absolute), at a level. */
export interface PlacedLevel {
  z: number;
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** Ground tile per tile (0: nothing of this place), object, and area label (index into `areas`, -1 none). */
  ground: Uint8Array;
  object: Uint8Array;
  area: Int16Array;
  areas: string[];
}

/** A change to the land's surface: a way in, or a tower's ground floor. */
export interface SurfaceEdit {
  x: number;
  y: number;
  ground?: number;
  object?: number;
  /** The tile's height (m): a tower stands on a level floor. */
  elevM?: number;
  area?: string;
}

export interface UnderPlan {
  id: string;
  /** What it is: a dungeon's kind, or 'cave'. */
  kind: string;
  levels: PlacedLevel[];
  surface: SurfaceEdit[];
  /** A tower's roof, as the buildings' (local/roofs.ts). */
  roof: Roof | null;
}

/** What the land tells the plans. */
export interface UnderLand {
  /** The lowest level (LEVEL_M steps) of the ground over a box of tiles (inclusive). */
  lowest(x0: number, y0: number, x1: number, y1: number): number;
  /** The ground's height (m) at a tile. */
  heightAt(x: number, y: number): number;
}

/** How each kind is built: its floor, its walls, its way in from the surface. */
interface Style {
  floor: string;
  wall: string;
  entrance: string;
  /** Lived in and lit: torches in sconces along the walls. */
  lit?: boolean;
}
const STYLE: Record<DungeonKind, Style> = {
  crypt: { floor: 'floor_flags', wall: 'wall_stone', entrance: 'dungeon_entrance' },
  catacomb: { floor: 'floor_flags', wall: 'wall_stone', entrance: 'dungeon_entrance' },
  mine: { floor: 'cave_floor', wall: 'rock_wall', entrance: 'mine_entrance' },
  sewer: { floor: 'floor_flags', wall: 'wall_brick', entrance: 'grate' },
  well: { floor: 'cave_floor', wall: 'rock_wall', entrance: 'well' },
  ruin: { floor: 'floor_flags', wall: 'wall_stone', entrance: 'dungeon_entrance' },
  tower: { floor: 'floor_flags', wall: 'wall_stone', entrance: 'dungeon_entrance' },
  prison: { floor: 'floor_flags', wall: 'wall_stone', entrance: 'stairs_down', lit: true },
  hold: { floor: 'floor_flags', wall: 'wall_stone', entrance: 'stairs_down', lit: true },
  delve: { floor: 'floor_flags', wall: 'wall_stone', entrance: 'stairs_down', lit: true },
};
/** The deeps and the rough cellars below a ruin are rock. */
const ROCK: Style = { floor: 'cave_floor', wall: 'rock_wall', entrance: 'dungeon_entrance' };

/** The plan's props, as object tiles (none: left out). */
const PROP_TILE: Record<string, string> = {
  sarcophagus: 'tomb', pillar: 'pillar', altar: 'altar', statue: 'statue', chest: 'chest', barrel: 'barrel', crate: 'crate', bones: 'bones',
  bed: 'bed', table: 'table', well: 'well', tree: 'bush', bush: 'bush', brazier: 'brazier', throne: 'throne', bookcase: 'bookcase', cart: 'cart',
  support: 'support', ore: 'ore', rubble: 'rubble', urn: 'urn', skull: 'bones',
};
/** Doors by kind (an arch is an opening). */
const DOOR_TILE: Record<string, string> = { door: 'door', locked: 'door_locked', secret: 'door_secret', portcullis: 'portcullis', bars: 'bars' };

const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** A level of a dungeon on tiles (cells are tiles), with a tile of margin all round for its walls. */
interface Raster {
  w: number;
  h: number;
  ground: Uint8Array;
  object: Uint8Array;
  area: Int16Array;
  areas: string[];
}

/** Doors of every kind, and pieces that can be walked over (bones, rubble, pit props). */
const DOOR_IDS = new Set(['door', 'door_open', 'door_locked', 'door_secret', 'portcullis', 'portcullis_up', 'bars', 'bars_open'].map((n) => O(n)));
const PASS_IDS = new Set(['rubble', 'bones', 'support', 'stones', 'stairs_up', 'stairs_down', 'ladder_up', 'ladder_down', 'stairs_spiral'].map((n) => O(n)));
/** A piece of furniture or a prop that stands in the way (not a wall, a door, or what can be walked over). */
const blockingPiece = (o: number | undefined) => !!o && !WALLS.has(o) && !DOOR_IDS.has(o) && !PASS_IDS.has(o) && !(OBJECT_TILES[o]?.pass);

/**
 * Makes every open tile of a level reachable from one tile (its first way in): a piece standing
 * between what is reached and what is not is taken away; failing that, a passage is cut through
 * the rock from what is reached to the nearest open tile that is not, walled on either side.
 */
function joinUp(ground: Uint8Array, object: Uint8Array, w: number, h: number, seed: number, floor: number, wall: number): void {
  const N = w * h;
  const nbs = (k: number) => {
    const x = k % w, out: number[] = [];
    if (x + 1 < w) out.push(k + 1);
    if (x > 0) out.push(k - 1);
    if (k + w < N) out.push(k + w);
    if (k - w >= 0) out.push(k - w);
    return out;
  };
  const free = (k: number) => ground[k] > 0 && !WALLS.has(object[k]) && !blockingPiece(object[k]);
  if (seed < 0 || seed >= N || !ground[seed]) return;
  if (!free(seed)) object[seed] = 0;
  for (let guard = 0; guard < 600; guard++) {
    const seen = new Uint8Array(N), st = [seed];
    seen[seed] = 1;
    while (st.length) {
      const k = st.pop()!;
      for (const n of nbs(k)) if (!seen[n] && free(n)) {
        seen[n] = 1;
        st.push(n);
      }
    }
    let lost = false;
    for (let k = 0; k < N && !lost; k++) if (free(k) && !seen[k]) lost = true;
    if (!lost) return;
    // A piece between what is reached and what is not.
    let cut = -1;
    for (let k = 0; k < N && cut < 0; k++) {
      if (!blockingPiece(object[k]) || !ground[k]) continue;
      const ns = nbs(k);
      if (ns.some((n) => seen[n]) && ns.some((n) => free(n) && !seen[n])) cut = k;
    }
    if (cut >= 0) {
      object[cut] = 0;
      continue;
    }
    // A passage through the rock to the nearest open tile not reached (inside the box's margin).
    const prev = new Int32Array(N).fill(-2), q: number[] = [];
    for (let k = 0; k < N; k++) if (seen[k]) {
      prev[k] = -1;
      q.push(k);
    }
    let end = -1;
    for (let qi = 0; qi < q.length && end < 0; qi++) {
      for (const n of nbs(q[qi])) {
        if (prev[n] !== -2) continue;
        const x = n % w, y = Math.floor(n / w);
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        prev[n] = q[qi];
        if (free(n)) {
          end = n;
          break;
        }
        q.push(n);
      }
    }
    if (end < 0) return;
    const path: number[] = [];
    for (let k = prev[end]; k >= 0 && !seen[k]; k = prev[k]) path.push(k);
    for (const k of path) {
      ground[k] = ground[k] || floor;
      object[k] = 0;
    }
    for (const k of path) {
      const x = k % w, y = Math.floor(k / w);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const n = yy * w + xx;
        if (!ground[n]) {
          ground[n] = floor;
          object[n] = wall;
        }
      }
    }
  }
}

/** Ways up. */
const UPS = new Set(['stairs_up', 'ladder_up', 'stairs_spiral'].map((n) => O(n)));
/** Whether an object is a wall (of masonry or rock). */
const WALLS = new Set(['wall_stone', 'wall_brick', 'rock_wall', 'ruin_wall', 'wall_torch'].map((n) => O(n)));

/**
 * A dungeon level on tiles: its open squares as floor (water, rubble and pits as they are), wall
 * next to every open square, partitions and doors, the props, and the ways up and down.
 */
function rasterDLevel(L: DLevel, style: Style, title: string): Raster {
  const w = L.W + 2, h = L.H + 2, N = w * h;
  const ground = new Uint8Array(N), object = new Uint8Array(N), area = new Int16Array(N).fill(-1);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= L.W || y >= L.H ? VOID : L.t[y * L.W + x]);
  const ix = (x: number, y: number) => (y + 1) * w + x + 1;
  const floor = G(style.floor), wall = O(style.wall);
  const isOpen = (v: number) => v !== VOID;
  for (let y = -1; y <= L.H; y++) for (let x = -1; x <= L.W; x++) {
    const v = at(x, y), k = ix(x, y);
    if (L.outdoor && v === GROUND) continue;
    if (isOpen(v)) {
      ground[k] = v === WATER || v === CHANNEL ? G('water_shallow') : v === GROUND ? G('dirt') : floor;
      if (v === RUBBLE) object[k] = O('rubble');
      if (v === PIT) object[k] = O('pit');
      continue;
    }
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) {
      const u = at(x + dx, y + dy);
      if (isOpen(u) && !(L.outdoor && u === GROUND)) near = true;
    }
    if (near) {
      ground[k] = floor;
      object[k] = wall;
    }
  }
  // Partitions (a tower's inner walls): the squares along the line, east of a north-south line
  // and south of an east-west one.
  for (const [x0, y0, x1, y1] of L.walls) {
    if (Math.abs(x0 - x1) < 1e-6) {
      const g = Math.round(x0);
      for (let y = Math.floor(Math.min(y0, y1)); y < Math.ceil(Math.max(y0, y1)); y++) if (ground[ix(g, y)] && !object[ix(g, y)]) object[ix(g, y)] = wall;
    } else if (Math.abs(y0 - y1) < 1e-6) {
      const g = Math.round(y0);
      for (let x = Math.floor(Math.min(x0, x1)); x < Math.ceil(Math.max(x0, x1)); x++) if (ground[ix(x, g)] && !object[ix(x, g)]) object[ix(x, g)] = wall;
    }
  }
  const blocks = (x: number, y: number) => !ground[ix(x, y)] || WALLS.has(object[ix(x, y)]) || x < -1 || y < -1 || x > L.W || y > L.H;
  // Doors: on the square of the two beside the edge that has wall on both sides.
  for (const d of L.doors) {
    const a: [number, number] = [d.x, d.y], b: [number, number] = d.vertical ? [d.x - 1, d.y] : [d.x, d.y - 1];
    const frame = ([x, y]: [number, number]) => ground[ix(x, y)] > 0 && (d.vertical ? blocks(x, y - 1) && blocks(x, y + 1) : blocks(x - 1, y) && blocks(x + 1, y));
    const c = frame(a) ? a : frame(b) ? b : WALLS.has(object[ix(a[0], a[1])]) ? a : b;
    const k = ix(c[0], c[1]);
    if (!ground[k]) continue;
    object[k] = d.kind === 'arch' ? 0 : O(DOOR_TILE[d.kind] ?? 'door');
  }
  // Props, one tile each, on open floor.
  for (const p of L.props) {
    const name = PROP_TILE[p.kind];
    const x = Math.floor(p.x), y = Math.floor(p.y), k = ix(x, y);
    if (!name || ground[k] !== floor || object[k]) continue;
    object[k] = O(name);
  }
  // The ways up and down (a spiral stair goes both ways).
  for (const l of L.links) {
    if (l.style === 'passage') continue;
    const k = ix(l.x, l.y);
    if (!ground[k] || ground[k] === G('water_shallow')) ground[k] = floor;
    object[k] = l.style === 'spiral' ? O('stairs_spiral') : l.style === 'ladder' || l.style === 'shaft' ? O(l.dir === 'up' ? 'ladder_up' : 'ladder_down') : O(l.dir === 'up' ? 'stairs_up' : 'stairs_down');
  }
  // Nothing that blocks the way just inside a door; every open tile reached from the level's first
  // way (joinUp).
  for (let k = 0; k < N; k++) if (DOOR_IDS.has(object[k])) for (const d of [1, -1, w, -w]) if (blockingPiece(object[k + d])) object[k + d] = 0;
  const first = L.links[0] ?? L.entrances[0];
  if (first) joinUp(ground, object, w, h, ix(Math.max(0, Math.min(L.W - 1, Math.floor(first.x))), Math.max(0, Math.min(L.H - 1, Math.floor(first.y)))), floor, wall);
  // A lived-in place is lit: a torch in a sconce every few paces along its walls.
  if (style.lit) {
    const torch = O('wall_torch');
    for (let y = -1; y <= L.H; y++) for (let x = -1; x <= L.W; x++) {
      const k = ix(x, y);
      if (object[k] !== wall || ((x * 3 + y * 5) % 9 + 9) % 9 !== 0) continue;
      // On a straight run of wall, facing a floor (not in a corner, not beside a door).
      const side = (dx: number, dy: number) => x + dx >= -1 && y + dy >= -1 && x + dx <= L.W && y + dy <= L.H ? object[ix(x + dx, y + dy)] : 0;
      const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const q = ix(x + dx, y + dy); return x + dx >= -1 && y + dy >= -1 && x + dx <= L.W && y + dy <= L.H && ground[q] === floor && !object[q]; });
      const straight = (side(1, 0) === wall && side(-1, 0) === wall) || (side(0, 1) === wall && side(0, -1) === wall);
      if (faces && straight) object[k] = torch;
    }
  }
  // Areas: the numbered rooms (and the unnumbered spaces) by name, the rest the level's.
  const areas = [`${title}, ${lower(L.name)}`];
  for (let y = -1; y <= L.H; y++) for (let x = -1; x <= L.W; x++) if (ground[ix(x, y)]) area[ix(x, y)] = 0;
  for (const r of L.rooms) {
    if (!r.name) continue;
    const ai = areas.push(`${title}: ${lower(r.name)}`) - 1;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (ground[ix(x, y)] && !WALLS.has(object[ix(x, y)])) area[ix(x, y)] = ai;
  }
  return { w, h, ground, object, area, areas };
}

/** A raster set at a place: its square (cx, cy) on the tile (tx, ty), at level z. */
function place(r: Raster, cx: number, cy: number, tx: number, ty: number, z: number): PlacedLevel {
  // The raster's square (cx, cy) is tile (cx + 1, cy + 1) of its box.
  return { z, x0: tx - cx - 1, y0: ty - cy - 1, w: r.w, h: r.h, ground: r.ground, object: r.object, area: r.area, areas: r.areas };
}

/** The box (tiles) a set of placed levels covers. */
function boxOf(levels: PlacedLevel[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of levels) {
    x0 = Math.min(x0, l.x0);
    y0 = Math.min(y0, l.y0);
    x1 = Math.max(x1, l.x0 + l.w - 1);
    y1 = Math.max(y1, l.y0 + l.h - 1);
  }
  return [x0, y0, x1, y1];
}

/** Sets a placed level's tile (absolute) to a way up or down on its floor. */
function putWay(l: PlacedLevel, x: number, y: number, obj: string, floor: number): void {
  const i = x - l.x0, j = y - l.y0;
  if (i < 0 || j < 0 || i >= l.w || j >= l.h) return;
  const k = j * l.w + i;
  if (!l.ground[k] || l.ground[k] === G('water_shallow')) l.ground[k] = floor;
  l.object[k] = O(obj);
  if (l.area[k] < 0) l.area[k] = 0;
  // Its neighbours open, so that it can be stepped off (a way in at a level's very edge).
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ii = i + dx, jj = j + dy;
    if (ii < 0 || jj < 0 || ii >= l.w || jj >= l.h) continue;
    const q = jj * l.w + ii;
    if (l.ground[q] && !WALLS.has(l.object[q])) return;
  }
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ii = i + dx, jj = j + dy;
    if (ii < 0 || jj < 0 || ii >= l.w || jj >= l.h) continue;
    const q = jj * l.w + ii;
    if (l.ground[q] && WALLS.has(l.object[q])) {
      l.object[q] = 0;
      return;
    }
  }
}

/**
 * Lays out a dungeon whose way in is at tile `ent` (and, for sewers, more ways in at its other
 * grates). `town`: under a town (deeper, clear of the cellars).
 */
export function planDungeon(site: DungeonSite, ent: [number, number], town: boolean, land: UnderLand): UnderPlan | null {
  const d = dungeon(site);
  if (!d.levels.length) return null;
  const style = STYLE[site.kind];
  const title = site.en ?? site.name;
  const out: UnderPlan = { id: site.id, kind: site.kind, levels: [], surface: [], roof: null };
  const below = town ? 3 : 2;
  switch (site.kind) {
    case 'tower': return planTower(d, ent, land, style, title);
    case 'delve': return planDelve(d, ent, land, title);
    case 'ruin': case 'prison': case 'hold': {
      // The first level is on the ground (the ruin, the prison's yard, the stronghold's court);
      // the rest lie below, under its way down.
      const L0 = d.levels[0], down = L0.links.find((l) => l.dir === 'down');
      if (!down || d.levels.length < 2) return null;
      const rs = d.levels.slice(1).map((L) => rasterDLevel(L, site.kind === 'ruin' ? ROCK : style, title));
      const probe = rs.map((r, i) => place(r, down.x, down.y, ent[0], ent[1], -i));
      const z0 = land.lowest(...boxOf(probe)) - below;
      out.levels = rs.map((r, i) => place(r, down.x, down.y, ent[0], ent[1], z0 - i));
      // The first level's way up (from its link to the ground level) is under the way in.
      const top = out.levels[0], k0 = (ent[1] - top.y0) * top.w + ent[0] - top.x0;
      if (!UPS.has(top.object[k0])) putWay(top, ent[0], ent[1], 'stairs_up', G(site.kind === 'ruin' ? ROCK.floor : style.floor));
      out.surface.push({ x: ent[0], y: ent[1], object: O(site.kind === 'ruin' ? 'dungeon_entrance' : 'stairs_down') });
      if (site.kind === 'ruin' && !site.village && !town) out.surface.push(...ruinSurface(L0, down.x, down.y, ent, title));
      return out;
    }
    default: {
      // Every level below the land: the first under its way in.
      const L0 = d.levels[0];
      let anchor: [number, number];
      if (site.kind === 'sewer') anchor = [Math.round(L0.W / 2), Math.round(L0.H / 2)];
      else {
        const up = L0.links.find((l) => l.dir === 'up' && l.to < 0);
        const e = L0.entrances[0];
        anchor = up ? [up.x, up.y] : e ? [Math.max(0, Math.min(L0.W - 1, Math.floor(e.x))), Math.max(0, Math.min(L0.H - 1, Math.floor(e.y)))] : [Math.floor(L0.W / 2), Math.floor(L0.H / 2)];
      }
      const rs = d.levels.map((L) => rasterDLevel(L, style, title));
      const probe = rs.map((r, i) => place(r, anchor[0], anchor[1], ent[0], ent[1], -i));
      const z0 = land.lowest(...boxOf(probe)) - below;
      out.levels = rs.map((r, i) => place(r, anchor[0], anchor[1], ent[0], ent[1], z0 - i));
      const top = out.levels[0], floor = G(style.floor);
      // The ways up to the surface: every ladder up to it (a sewer's grates), or the way in.
      const ups = L0.links.filter((l) => l.dir === 'up' && l.to < 0).map((l) => [l.x + ent[0] - anchor[0], l.y + ent[1] - anchor[1]] as [number, number]);
      if (!ups.length) ups.push(ent);
      for (const [x, y] of ups) {
        putWay(top, x, y, site.kind === 'sewer' || site.kind === 'well' ? 'ladder_up' : 'stairs_up', floor);
        out.surface.push({ x, y, object: O(style.entrance) });
      }
      return out;
    }
  }
}

/** A wild ruin's ground on the surface: its floors, broken walls round them, rubble. */
function ruinSurface(L: DLevel, ax: number, ay: number, ent: [number, number], title: string): SurfaceEdit[] {
  const out: SurfaceEdit[] = [];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= L.W || y >= L.H ? VOID : L.t[y * L.W + x]);
  const ox = ent[0] - ax, oy = ent[1] - ay;
  // A small stream of chance from the place, for the gaps in the walls.
  let s = (L.W * 7919 + L.H * 104729 + ent[0] * 31 + ent[1] * 17) | 0;
  const rnd = () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0;
    return ((s ^ (s >>> 13)) >>> 0) / 4294967296;
  };
  for (let y = -1; y <= L.H; y++) for (let x = -1; x <= L.W; x++) {
    if (x + ox === ent[0] && y + oy === ent[1]) continue;
    const v = at(x, y);
    if (v === FLOOR || v === RUBBLE) {
      out.push({ x: x + ox, y: y + oy, ground: G('flagstones'), object: v === RUBBLE || rnd() < 0.08 ? O('rubble') : 0, area: title });
      continue;
    }
    let near = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(x + dx, y + dy) === FLOOR || at(x + dx, y + dy) === RUBBLE) near = true;
    if (near && rnd() < 0.7) out.push({ x: x + ox, y: y + oy, object: O('ruin_wall') });
  }
  return out;
}

/** A tower: its ground floor on the surface, storeys and roof above, its cellar below. */
function planTower(d: Dungeon, ent: [number, number], land: UnderLand, style: Style, title: string): UnderPlan {
  const g = d.levels.findIndex((L) => L.name === 'Ground floor');
  const G0 = d.levels[g], c = Math.floor(G0.W / 2);
  const floorM = Math.round(land.heightAt(ent[0], ent[1]));
  const zg = Math.floor(floorM / LEVEL_M);
  const out: UnderPlan = { id: d.site.id, kind: d.site.kind, levels: [], surface: [], roof: null };
  const rs = d.levels.map((L) => rasterDLevel(L, style, title));
  // The door: in the outer wall (a wall square with the open land on one side), the nearest to the
  // way in that leads straight to the floor within; where the wall is thick, a passage is cut through
  // it to the floor (a door on an inner partition, or into the thickness of the wall, leads nowhere).
  const e = G0.entrances[0], r0 = rs[g];
  if (e) {
    const W = r0.w, H = r0.h;
    const out = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || !r0.ground[y * W + x];
    let best: number[] | null = null, bd = Infinity;
    for (let k = 0; k < W * H; k++) {
      if (!WALLS.has(r0.object[k])) continue;
      const x = k % W, y = Math.floor(k / W);
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        if (!out(x + dx, y + dy)) continue;
        // Inward from the open side: through the wall to the first open floor.
        const run = [k];
        let ix = x - dx, iy = y - dy, reached = false;
        for (let n = 0; n < 4 && !out(ix, iy); n++) {
          const q = iy * W + ix;
          if (!WALLS.has(r0.object[q])) {
            reached = !r0.object[q] || !!OBJECT_TILES[r0.object[q]]?.pass;
            break;
          }
          run.push(q);
          ix -= dx;
          iy -= dy;
        }
        if (!reached) continue;
        const cx = x - 1 + 0.5, cy = y - 1 + 0.5, dd = Math.sqrt((cx - e.x) * (cx - e.x) + (cy - e.y) * (cy - e.y)) + 4 * (run.length - 1);
        if (dd < bd) {
          bd = dd;
          best = run;
        }
      }
    }
    if (best) {
      r0.object[best[0]] = O('door');
      for (const q of best.slice(1)) r0.object[q] = 0;
    }
  }
  d.levels.forEach((L, k) => {
    const p = place(rs[k], c, c, ent[0], ent[1], zg + (g - k) * -1);
    // Levels are listed cellar first, then up from the ground floor (the roof last).
    p.z = zg + (k - g);
    if (k !== g) {
      out.levels.push(p);
      return;
    }
    // The ground floor on the surface, the floor levelled.
    for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
      const q = j * p.w + i;
      if (!p.ground[q]) continue;
      out.surface.push({ x: p.x0 + i, y: p.y0 + j, ground: p.ground[q], object: p.object[q], elevM: floorM, area: p.area[q] >= 0 ? p.areas[p.area[q]] : title });
    }
  });
  // The roof, over the ground floor's tiles, at the roof's level (the battlements walked on).
  const p0 = place(r0, c, c, ent[0], ent[1], zg);
  const cover = new Uint8Array(p0.w * p0.h);
  for (let q = 0; q < cover.length; q++) cover[q] = p0.ground[q] ? 1 : 0;
  const storeys = d.levels.length - g - 1;
  out.roof = { id: d.site.id, x0: p0.x0, y0: p0.y0, w: p0.w, h: p0.h, cover, floorM, heightM: Math.max(1, storeys) * LEVEL_M, storeys, shape: 'flat', material: 'slate', ridge: 'ew' };
  return out;
}

/**
 * A delve laid out whole: the gate halls behind the gate (their way in at the gate), a great
 * avenue running east from them, the districts along it to the north and south, each joined to it
 * by a tunnel to the passage at its west end, all at one depth; the deeps a level below the first
 * forge district, under its way down.
 */
function planDelve(d: Dungeon, ent: [number, number], land: UnderLand, title: string): UnderPlan {
  const out: UnderPlan = { id: d.site.id, kind: d.site.kind, levels: [], surface: [], roof: null };
  // Levels: the overview (not to scale, not laid out), the gate halls, the districts, the deeps.
  const gate = d.levels[1];
  if (!gate) return out;
  const districts = d.levels.slice(2).filter((L) => L.name !== 'The deeps');
  const deeps = d.levels.find((L) => L.name === 'The deeps');
  const style = STYLE.delve;
  const e = gate.entrances[0] ?? { x: 0, y: Math.floor(gate.H / 2) };
  const anchor: [number, number] = [Math.max(0, Math.floor(e.x)), Math.floor(e.y)];
  // Positions (tiles of each map's square 0, 0).
  const gx = ent[0] - anchor[0], gy = ent[1] - anchor[1];
  const ay = gy + Math.floor(gate.H / 2);
  const maxW = Math.max(0, ...districts.map((L) => L.W));
  const pos = districts.map((L, k) => {
    const col = Math.floor(k / 2), north = k % 2 === 0;
    const x = gx + gate.W + 6 + col * (maxW + 8);
    const y = north ? ay - 4 - L.H : ay + 5;
    return [x, y] as [number, number];
  });
  // The avenue and the tunnels, as a level of their own.
  const ax0 = gx + gate.W - 4, ax1 = Math.max(ax0 + 6, ...pos.map(([x]) => x - 2));
  let minX = ax0 - 2, maxX = ax1 + 2, minY = ay - 3, maxY = ay + 3;
  const tunnels: [number, number, number, number][] = [];
  districts.forEach((L, k) => {
    const pass = L.links.find((l) => l.style === 'passage');
    const py = pos[k][1] + (pass ? pass.y : Math.floor(L.H / 2)), px = pos[k][0] + (pass ? pass.x : 1);
    const tx = pos[k][0] - 3;
    tunnels.push([tx, ay, tx, py], [tx, py, px, py]);
    minY = Math.min(minY, py - 2);
    maxY = Math.max(maxY, py + 2);
    minX = Math.min(minX, tx - 2);
    maxX = Math.max(maxX, px + 2);
  });
  const W = maxX - minX + 1, H = maxY - minY + 1;
  const av: DLevel = { name: 'The great avenue', W, H, t: new Uint8Array(W * H), rooms: [], doors: [], props: [], links: [], entrances: [], outdoor: false, walls: [], rails: [] };
  const open = (x: number, y: number) => {
    const i = x - minX, j = y - minY;
    if (i >= 0 && j >= 0 && i < W && j < H) av.t[j * W + i] = FLOOR;
  };
  for (let x = ax0; x <= ax1; x++) for (let dy = -1; dy <= 1; dy++) open(x, ay + dy);
  for (let x = ax0 + 4; x < ax1; x += 6) for (const dy of [-2, 2]) av.props.push({ kind: 'statue', x: x - minX + 0.5, y: ay + dy - minY + 0.5 });
  for (const [x0, y0, x1, y1] of tunnels) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      open(x, y);
      if (x0 === x1) open(x + 1, y);
      else open(x, y + 1);
    }
  }
  const rGate = rasterDLevel(gate, style, title);
  const rAv = rasterDLevel(av, style, title);
  const rDs = districts.map((L) => rasterDLevel(L, style, title));
  const probe = [place(rGate, 0, 0, gx, gy, 0), place(rAv, 0, 0, minX, minY, 0), ...rDs.map((r, k) => place(r, 0, 0, pos[k][0], pos[k][1], 0))];
  const z0 = land.lowest(...boxOf(probe)) - 3;
  // The maps first, the avenue and tunnels after (they open their way into the maps' ends).
  out.levels.push(place(rGate, 0, 0, gx, gy, z0), ...rDs.map((r, k) => place(r, 0, 0, pos[k][0], pos[k][1], z0)), place(rAv, 0, 0, minX, minY, z0));
  if (deeps) {
    const fk = districts.findIndex((L) => L.links.some((l) => l.dir === 'down' && l.style !== 'passage'));
    if (fk >= 0) out.levels.push(place(rasterDLevel(deeps, ROCK, title), 0, 0, pos[fk][0], pos[fk][1], z0 - 1));
  }
  putWay(out.levels[0], ent[0], ent[1], 'stairs_up', G(style.floor));
  out.surface.push({ x: ent[0], y: ent[1], object: O('stairs_down') });
  return out;
}

/**
 * Lays out a cave (lairs/lair.ts) whose mouth is at tile `ent`: every level below the land, the
 * first under the mouth; any other mouth opens on the surface above it. A deep cave's way down to
 * the Underworld is a stair down that leads nowhere yet.
 */
export function planCave(site: LairSite, ent: [number, number], land: UnderLand): UnderPlan | null {
  const m: LairMap = lairMap(site);
  const levels = m.levels?.length ? m.levels : [m];
  const title = site.en ?? site.name;
  const mouth = m.mouths[0]?.p ?? [m.W / 2, m.H / 2];
  const tileOf = (p: number[]): [number, number] => [Math.floor(p[0] / TILE), Math.floor(p[1] / TILE)];
  const [ax, ay] = tileOf(mouth);
  const floor = G('cave_floor'), wall = O('rock_wall'), water = G('water_shallow');
  const rs = levels.map((L): Raster => {
    const tw = Math.ceil(L.W / TILE) + 2, th = Math.ceil(L.H / TILE) + 2, N = tw * th;
    const ground = new Uint8Array(N), object = new Uint8Array(N), area = new Int16Array(N).fill(-1);
    const isOpen = (i: number, j: number) => i >= 0 && j >= 0 && i < tw - 2 && j < th - 2 && L.open([(i + 0.5) * TILE, (j + 0.5) * TILE]);
    const areas = [title];
    const roomArea = L.rooms.map((r) => (r.name ? areas.push(`${title}: ${lower(r.name)}`) - 1 : 0));
    for (let j = -1; j < th - 1; j++) for (let i = -1; i < tw - 1; i++) {
      const k = (j + 1) * tw + i + 1;
      if (isOpen(i, j)) {
        const p: [number, number] = [(i + 0.5) * TILE, (j + 0.5) * TILE];
        ground[k] = inLoops(L.water, p) ? water : floor;
        // The nearest numbered place within 8 m names the tile.
        let best = 0, bd = 64;
        L.rooms.forEach((r, q) => {
          const dd = (r.p[0] - p[0]) * (r.p[0] - p[0]) + (r.p[1] - p[1]) * (r.p[1] - p[1]);
          if (dd < bd) {
            bd = dd;
            best = roomArea[q];
          }
        });
        area[k] = best;
        continue;
      }
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) if (isOpen(i + dx, j + dy)) near = true;
      if (near) {
        ground[k] = floor;
        object[k] = wall;
        area[k] = 0;
      }
    }
    const put = (p: number[], name: string, onlyFloor = true) => {
      const [i, j] = tileOf(p), k = (j + 1) * tw + i + 1;
      if (i < -1 || j < -1 || i >= tw - 1 || j >= th - 1) return;
      if (onlyFloor && (ground[k] !== floor || object[k])) return;
      object[k] = O(name);
    };
    for (const r of L.rocks) if (r.length) put([r.reduce((a, q) => a + q[0], 0) / r.length, r.reduce((a, q) => a + q[1], 0) / r.length], 'boulder');
    for (const dt of L.dots) put(dt.p, 'stones');
    for (const l of L.links ?? []) {
      const [i, j] = tileOf(l.p), k = (j + 1) * tw + i + 1;
      if (i < -1 || j < -1 || i >= tw - 1 || j >= th - 1) continue;
      if (!ground[k] || ground[k] === water) ground[k] = floor;
      object[k] = O(l.style === 'shaft' ? (l.dir === 'up' ? 'ladder_up' : 'ladder_down') : l.dir === 'up' ? 'stairs_up' : 'stairs_down');
    }
    // The way into the deep, down to the Underworld (not laid out yet).
    for (const gt of L.gotos ?? []) put(gt.p, 'stairs_down', false);
    // Every mouth and way (the first mouth on the entrance level, else the way down to it) joined
    // to the whole of the level: a mouth on the map's edge may end short of the caves.
    const first = L === levels[0] ? (m.mouths[0]?.p ?? [m.W / 2, m.H / 2]) : (L.links?.find((l) => l.dir === 'up')?.p ?? L.links?.[0]?.p);
    if (first) {
      const [i, j] = tileOf(first);
      const ci = Math.max(0, Math.min(tw - 3, i)), cj = Math.max(0, Math.min(th - 3, j)), k = (cj + 1) * tw + ci + 1;
      if (!ground[k] || object[k] === wall) {
        ground[k] = floor;
        object[k] = 0;
        area[k] = 0;
      }
      // Every other mouth's tile open too, so each joins the rest.
      if (L === levels[0]) for (const mo of m.mouths) {
        const [a, b] = tileOf(mo.p), q = (Math.max(0, Math.min(th - 3, b)) + 1) * tw + Math.max(0, Math.min(tw - 3, a)) + 1;
        if (!ground[q] || object[q] === wall) {
          ground[q] = floor;
          object[q] = 0;
          area[q] = 0;
        }
      }
      joinUp(ground, object, tw, th, k, floor, wall);
      for (let q = 0; q < ground.length; q++) if (ground[q] && area[q] < 0) area[q] = 0;
    }
    return { w: tw, h: th, ground, object, area, areas };
  });
  const probe = rs.map((r, i) => place(r, ax, ay, ent[0], ent[1], -i));
  const z0 = land.lowest(...boxOf(probe)) - 2;
  const out: UnderPlan = { id: site.id, kind: 'cave', levels: rs.map((r, i) => place(r, ax, ay, ent[0], ent[1], z0 - i)), surface: [], roof: null };
  out.levels[0].areas[0] = title;
  m.mouths.forEach((mo, q) => {
    const [i, j] = tileOf(mo.p);
    const x = ent[0] + i - ax, y = ent[1] + j - ay;
    putWay(out.levels[0], x, y, 'stairs_up', floor);
    out.surface.push({ x, y, object: O('cave_mouth'), ...(q ? { area: title } : {}) });
  });
  if (!m.mouths.length) {
    putWay(out.levels[0], ent[0], ent[1], 'stairs_up', floor);
    out.surface.push({ x: ent[0], y: ent[1], object: O('cave_mouth') });
  }
  return out;
}

/** How far (tiles) a place of a kind may reach from its way in: chunks further off need not lay it out. */
export function reachOf(kind: DungeonKind | 'cave'): number {
  switch (kind) {
    case 'delve': return 900;
    case 'sewer': return 160;
    case 'cave': return 110;
    case 'mine': case 'crypt': case 'catacomb': case 'prison': case 'hold': return 80;
    default: return 50;
  }
}
