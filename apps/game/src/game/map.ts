/**
 * The map as the game sees it: the baseline chunks from the worker, with the player's changes
 * (doors opened, later things moved or built) laid over them, and what the player has seen.
 */
import { CHUNK } from '@worldforge/core/local/chunk';
import { GROUND_TILES, OBJECT_TILES } from '@worldforge/core/local/tiles';
import type { ChunkData } from '../worker/protocol';

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

  add(c: ChunkData): void {
    const k = key(c.cx, c.cy);
    this.chunks.set(k, c);
    this.pending.delete(k);
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

  wasSeen(tx: number, ty: number): boolean {
    const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
    const s = this.seen.get(key(cx, cy));
    return !!s && s[(ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK)] === 1;
  }
}
