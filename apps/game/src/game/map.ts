/**
 * The map as the game sees it: the baseline chunks from the worker, with the player's changes
 * (doors opened, later things moved or built) laid over them, and what the player has seen.
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

const key = (cx: number, cy: number) => `${cx},${cy}`;

export class GameMap {
  private chunks = new Map<string, ChunkData>();
  private pending = new Set<string>();
  /** Explored tiles, per chunk. */
  private seen = new Map<string, Uint8Array>();
  /** Object changes over the baseline, by "tx,ty". */
  readonly changes = new Map<string, number>();

  constructor(private request: (cx: number, cy: number) => void) {}

  /** The roofs of the buildings on the map so far, by building (core local/roofs.ts). */
  readonly roofs = new Map<string, Roof>();

  add(c: ChunkData): void {
    const k = key(c.cx, c.cy);
    this.chunks.set(k, c);
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
    return this.chunks.has(key(Math.floor(tx / CHUNK), Math.floor(ty / CHUNK)));
  }

  private at(tx: number, ty: number): [ChunkData, number] | null {
    const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
    const c = this.chunks.get(key(cx, cy));
    if (!c) return null;
    return [c, (ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK)];
  }

  ground(tx: number, ty: number): number {
    const a = this.at(tx, ty);
    return a ? a[0].ground[a[1]] : 0;
  }

  object(tx: number, ty: number): number {
    const ch = this.changes.get(`${tx},${ty}`);
    if (ch !== undefined) return ch;
    const a = this.at(tx, ty);
    return a ? a[0].object[a[1]] : 0;
  }

  setObject(tx: number, ty: number, id: number): void {
    const a = this.at(tx, ty);
    if (a && a[0].object[a[1]] === id) this.changes.delete(`${tx},${ty}`);
    else this.changes.set(`${tx},${ty}`, id);
  }

  tile(tx: number, ty: number): Tile | null {
    const a = this.at(tx, ty);
    if (!a) return null;
    const [c, k] = a;
    return { ground: c.ground[k], object: this.object(tx, ty), area: c.areas[c.area[k]] ?? '', elev: c.elev[k] };
  }

  /** The ground's height (m; 0 where the map is not made yet). */
  elev(tx: number, ty: number): number {
    const a = this.at(tx, ty);
    return a ? a[0].elev[a[1]] : 0;
  }

  /** The ground's level (game/levels.ts). */
  level(tx: number, ty: number): number {
    return levelOf(this.elev(tx, ty));
  }

  /** Can be walked into (unloaded tiles cannot). */
  passable(tx: number, ty: number): boolean {
    const a = this.at(tx, ty);
    if (!a) return false;
    return GROUND_TILES[a[0].ground[a[1]]].pass && OBJECT_TILES[this.object(tx, ty)].pass;
  }

  /** Lets light through (unloaded tiles do not). */
  transparent(tx: number, ty: number): boolean {
    const a = this.at(tx, ty);
    if (!a) return false;
    return !GROUND_TILES[a[0].ground[a[1]]].opaque && !OBJECT_TILES[this.object(tx, ty)].opaque;
  }

  markSeen(tx: number, ty: number): void {
    const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
    const k = key(cx, cy);
    let s = this.seen.get(k);
    if (!s) this.seen.set(k, (s = new Uint8Array(CHUNK * CHUNK)));
    s[(ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK)] = 1;
  }

  /** What has been seen, bit-packed per chunk (for saving). */
  exportSeen(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of this.seen) out[k] = packBits(v);
    return out;
  }

  importSeen(data: Record<string, string>): void {
    this.seen.clear();
    for (const [k, v] of Object.entries(data)) if (/^-?\d+,-?\d+$/.test(k)) this.seen.set(k, unpackBits(v, CHUNK * CHUNK));
  }

  wasSeen(tx: number, ty: number): boolean {
    const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
    const s = this.seen.get(key(cx, cy));
    return !!s && s[(ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK)] === 1;
  }
}
