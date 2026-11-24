/**
 * The map as the game sees it: the baseline chunks from the worker, with the player's changes
 * (doors opened, later things moved or built) laid over them, and what the player has seen.
 *
 * Floors above and below the ground (buildings' upper storeys and cellars; later caves, dungeons
 * and delves) are layers of a chunk by level (core local/chunk.ts, `layers`). A tile of a floor
 * is that floor's where the layer has one; elsewhere there is nothing on that floor: open air
 * above the ground there, solid earth below it.
 *
 * The map is read on a floor (`floor`: a level, or null for the ground), which the game keeps to
 * the wanderer's: `ground`, `object`, `passable` and the like answer for that floor. The drawing,
 * which shows more than one floor, names its floor with `groundAt`, `objectAt` and the like.
 */
import { CHUNK } from '@worldforge/core/local/chunk';
import { GROUND_TILES, OBJECT_TILES } from '@worldforge/core/local/tiles';
import type { ChunkData } from '../worker/protocol';
import { packBits, unpackBits } from './save';
import { levelOf } from './levels';
import type { Roof } from '@worldforge/core/local/roofs';

export interface Tile {
  ground: number;
  object: number;
  area: string;
  elev: number;
}

/** A level: a floor's, or null for the ground. */
export type Floor = number | null;

const key = (cx: number, cy: number) => `${cx},${cy}`;
/** A chunk's key as a number (for the lookups made many times a step: paths, sight). */
const nkey = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);
/** A tile's key in the changes: on the ground "x,y", on a floor "x,y,z". */
const tileKey = (x: number, y: number, z: Floor) => (z === null ? `${x},${y}` : `${x},${y},${z}`);
/** A chunk's key in what has been seen: on the ground "cx,cy", on a floor "cx,cy@z". */
const seenKey = (cx: number, cy: number, z: Floor) => (z === null ? key(cx, cy) : `${cx},${cy}@${z}`);

interface Layer {
  ground: Uint8Array;
  object: Uint8Array;
  area: Uint16Array;
}

export class GameMap {
  private chunks = new Map<string, ChunkData>();
  /** The same chunks and their floors by numeric key, for fast lookups. */
  private fast = new Map<number, ChunkData>();
  private fastLayers = new Map<number, Map<number, Layer>>();
  /** How many changes each chunk has (by numeric key): a chunk with none needs no lookup in `changes`. */
  private changedIn = new Map<number, number>();
  /** Each chunk's floors, by level. */
  private layers = new Map<string, Map<number, Layer>>();
  private pending = new Set<string>();
  /** Explored tiles, per chunk (and floor). */
  private seen = new Map<string, Uint8Array>();
  /** Object changes over the baseline, by "tx,ty" (on the ground) or "tx,ty,z" (on a floor). */
  readonly changes = new Map<string, number>();
  /** The floor the map is read on: the wanderer's (null: the ground). */
  floor: Floor = null;

  constructor(private request: (cx: number, cy: number) => void) {}

  /** The roofs of the buildings on the map so far, by building (core local/roofs.ts). */
  readonly roofs = new Map<string, Roof>();

  add(c: ChunkData): void {
    const k = key(c.cx, c.cy);
    this.chunks.set(k, c);
    const ls = new Map((c.layers ?? []).map((l) => [l.z, l] as [number, Layer]));
    this.layers.set(k, ls);
    this.fast.set(nkey(c.cx, c.cy), c);
    this.fastLayers.set(nkey(c.cx, c.cy), ls);
    this.pending.delete(k);
    for (const r of c.roofs ?? []) if (!this.roofs.has(r.id)) this.roofs.set(r.id, r);
  }

  /** The roofs over any part of a box of tiles. */
  roofsIn(x0: number, y0: number, x1: number, y1: number): Roof[] {
    const out: Roof[] = [];
    for (const r of this.roofs.values()) if (r.x0 <= x1 && r.y0 <= y1 && r.x0 + r.w > x0 && r.y0 + r.h > y0) out.push(r);
    return out;
  }

  /** Asks for the chunks covering a box of tiles that are not here yet. */
  want(tx0: number, ty0: number, tx1: number, ty1: number): void {
    for (let cy = Math.floor(ty0 / CHUNK); cy <= Math.floor(ty1 / CHUNK); cy++) {
      for (let cx = Math.floor(tx0 / CHUNK); cx <= Math.floor(tx1 / CHUNK); cx++) {
        const k = key(cx, cy);
        if (this.chunks.has(k) || this.pending.has(k)) continue;
        this.pending.add(k);
        this.request(cx, cy);
      }
    }
  }

  get waiting(): number {
    return this.pending.size;
  }

  loaded(tx: number, ty: number): boolean {
    return this.fast.has(nkey(Math.floor(tx / CHUNK), Math.floor(ty / CHUNK)));
  }

  private at(tx: number, ty: number): [ChunkData, number] | null {
    const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
    const c = this.fast.get(nkey(cx, cy));
    if (!c) return null;
    return [c, (ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK)];
  }

  /** A floor's tile, where the floor has one: its layer and index (null: nothing on that floor there). */
  private onFloor(tx: number, ty: number, z: number): [Layer, number] | null {
    const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
    const l = this.fastLayers.get(nkey(cx, cy))?.get(z);
    if (!l) return null;
    const k = (ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK);
    return l.ground[k] ? [l, k] : null;
  }

  /** Whether a floor (a level) has a tile here: a building's upper storey or cellar. */
  hasFloor(tx: number, ty: number, z: number): boolean {
    return !!this.onFloor(tx, ty, z);
  }

  // ---- On a named floor (null: the ground) ---------------------------------------------------------

  groundAt(tx: number, ty: number, z: Floor): number {
    if (z !== null) {
      const f = this.onFloor(tx, ty, z);
      return f ? f[0].ground[f[1]] : 0;
    }
    const a = this.at(tx, ty);
    return a ? a[0].ground[a[1]] : 0;
  }

  objectAt(tx: number, ty: number, z: Floor): number {
    const ch = this.changedIn.has(nkey(Math.floor(tx / CHUNK), Math.floor(ty / CHUNK))) ? this.changes.get(tileKey(tx, ty, z)) : undefined;
    if (ch !== undefined) return ch;
    if (z !== null) {
      const f = this.onFloor(tx, ty, z);
      return f ? f[0].object[f[1]] : 0;
    }
    const a = this.at(tx, ty);
    return a ? a[0].object[a[1]] : 0;
  }

  setObjectAt(tx: number, ty: number, z: Floor, id: number): void {
    let base = -1;
    if (z !== null) {
      const f = this.onFloor(tx, ty, z);
      if (f) base = f[0].object[f[1]];
    } else {
      const a = this.at(tx, ty);
      if (a) base = a[0].object[a[1]];
    }
    const k = tileKey(tx, ty, z), had = this.changes.has(k);
    if (base === id) this.changes.delete(k);
    else this.changes.set(k, id);
    if (had !== this.changes.has(k)) this.count(tx, ty, had ? -1 : 1);
  }

  tileAt(tx: number, ty: number, z: Floor): Tile | null {
    const a = this.at(tx, ty);
    if (!a) return null;
    const [c, k] = a;
    if (z !== null) {
      const f = this.onFloor(tx, ty, z);
      if (!f) return null;
      return { ground: f[0].ground[f[1]], object: this.objectAt(tx, ty, z), area: c.areas[f[0].area[f[1]]] ?? '', elev: c.elev[k] };
    }
    return { ground: c.ground[k], object: this.objectAt(tx, ty, null), area: c.areas[c.area[k]] ?? '', elev: c.elev[k] };
  }

  /**
   * Can be walked into on a floor (unloaded tiles cannot): on a floor above or below the ground,
   * only its own tiles (there is no walking on open air, or into the earth).
   */
  passableAt(tx: number, ty: number, z: Floor): boolean {
    const a = this.at(tx, ty);
    if (!a) return false;
    if (z !== null) {
      const f = this.onFloor(tx, ty, z);
      return !!f && GROUND_TILES[f[0].ground[f[1]]].pass && OBJECT_TILES[this.objectAt(tx, ty, z)].pass;
    }
    return GROUND_TILES[a[0].ground[a[1]]].pass && OBJECT_TILES[this.objectAt(tx, ty, null)].pass;
  }

  /**
   * Lets light through on a floor (unloaded tiles do not). Where a floor has no tile, the open
   * air above lower ground lets it through, and earth at or above the floor's level does not.
   */
  transparentAt(tx: number, ty: number, z: Floor): boolean {
    const a = this.at(tx, ty);
    if (!a) return false;
    if (z !== null) {
      const f = this.onFloor(tx, ty, z);
      if (!f) return levelOf(a[0].elev[a[1]]) < z;
      return !GROUND_TILES[f[0].ground[f[1]]].opaque && !OBJECT_TILES[this.objectAt(tx, ty, z)].opaque;
    }
    return !GROUND_TILES[a[0].ground[a[1]]].opaque && !OBJECT_TILES[this.objectAt(tx, ty, null)].opaque;
  }

  markSeenAt(tx: number, ty: number, z: Floor): void {
    const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
    const k = seenKey(cx, cy, z);
    let s = this.seen.get(k);
    if (!s) this.seen.set(k, (s = new Uint8Array(CHUNK * CHUNK)));
    s[(ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK)] = 1;
  }

  wasSeenAt(tx: number, ty: number, z: Floor): boolean {
    const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
    const s = this.seen.get(seenKey(cx, cy, z));
    return !!s && s[(ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK)] === 1;
  }

  // ---- On the floor the map is read on (the wanderer's) ------------------------------------------

  ground(tx: number, ty: number): number {
    return this.groundAt(tx, ty, this.floor);
  }

  object(tx: number, ty: number): number {
    return this.objectAt(tx, ty, this.floor);
  }

  setObject(tx: number, ty: number, id: number): void {
    this.setObjectAt(tx, ty, this.floor, id);
  }

  tile(tx: number, ty: number): Tile | null {
    return this.tileAt(tx, ty, this.floor);
  }

  /** Can be walked into (unloaded tiles cannot). */
  passable(tx: number, ty: number): boolean {
    return this.passableAt(tx, ty, this.floor);
  }

  /** Lets light through (unloaded tiles do not). */
  transparent(tx: number, ty: number): boolean {
    return this.transparentAt(tx, ty, this.floor);
  }

  markSeen(tx: number, ty: number): void {
    this.markSeenAt(tx, ty, this.floor);
  }

  wasSeen(tx: number, ty: number): boolean {
    return this.wasSeenAt(tx, ty, this.floor);
  }

  // ---- The ground's shape (the same on every floor) ----------------------------------------------

  /** The ground's height (m; 0 where the map is not made yet). */
  elev(tx: number, ty: number): number {
    const a = this.at(tx, ty);
    return a ? a[0].elev[a[1]] : 0;
  }

  /**
   * Fresh water to drink on a ground tile (docs/backlog.md, W4): rivers, and lakes standing above
   * the sea, are fresh; the sea (open water at or below the sea's level) is salt. Null if no water.
   */
  waterAt(tx: number, ty: number): 'fresh' | 'salt' | null {
    const g = GROUND_TILES[this.ground(tx, ty)];
    if (!g?.water) return null;
    if (g.name.startsWith('river')) return 'fresh';
    // The worker says which water is the sea; an older chunk, by its height alone.
    const at = this.at(tx, ty);
    const salt = at?.[0].salt;
    if (salt) return salt[at[1]] ? 'salt' : 'fresh';
    return this.elev(tx, ty) <= 0 ? 'salt' : 'fresh';
  }

  /** The ground's level (game/levels.ts). */
  level(tx: number, ty: number): number {
    return levelOf(this.elev(tx, ty));
  }

  /** What has been seen, bit-packed per chunk and floor (for saving). */
  exportSeen(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of this.seen) out[k] = packBits(v);
    return out;
  }

  importSeen(data: Record<string, string>): void {
    this.seen.clear();
    for (const [k, v] of Object.entries(data)) if (/^-?\d+,-?\d+(@-?\d+)?$/.test(k)) this.seen.set(k, unpackBits(v, CHUNK * CHUNK));
  }

  /** Object changes on the ground ([x, y, id]) and on the floors ([x, y, z, id]), for saving. */
  exportChanges(): { ground: [number, number, number][]; floors: [number, number, number, number][] } {
    const ground: [number, number, number][] = [], floors: [number, number, number, number][] = [];
    for (const [k, v] of this.changes) {
      const p = k.split(',').map(Number);
      if (p.length === 2) ground.push([p[0], p[1], v]);
      else floors.push([p[0], p[1], p[2], v]);
    }
    return { ground, floors };
  }

  importChanges(ground: [number, number, number][], floors: [number, number, number, number][] = []): void {
    this.changes.clear();
    this.changedIn.clear();
    for (const [x, y, v] of ground) {
      this.changes.set(tileKey(x, y, null), v);
      this.count(x, y, 1);
    }
    for (const [x, y, z, v] of floors) {
      this.changes.set(tileKey(x, y, z), v);
      this.count(x, y, 1);
    }
  }

  /** Counts a change in or out of its chunk's tally. */
  private count(tx: number, ty: number, d: number): void {
    const k = nkey(Math.floor(tx / CHUNK), Math.floor(ty / CHUNK));
    const n = (this.changedIn.get(k) ?? 0) + d;
    if (n > 0) this.changedIn.set(k, n);
    else this.changedIn.delete(k);
  }
}
