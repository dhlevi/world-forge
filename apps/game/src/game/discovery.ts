/**
 * What of the world the wanderer has discovered: cells of 768 m (8 × 8 chunks of the local map)
 * seen on the way. The travel map covers the rest in cloud, and dims the parts discovered but not
 * in sight now.
 */
import { CHUNK, TILE_M } from '@worldforge/core/local/chunk';

/** Tiles on a side of one discovery cell. */
export const DCELL = CHUNK * 8;
export const DCELL_M = DCELL * TILE_M;
/** How far the land is seen from the travel map (m): a few kilometres in open country. */
export const TRAVEL_SIGHT_M = 3000;
/** How far around the wanderer counts as discovered when on foot. */
export const FOOT_SIGHT_M = 400;
/** What a new game begins knowing: the country about home. */
export const HOME_KNOWN_M = 8000;

const key = (x: number, y: number) => (x + 1048576) * 2097152 + (y + 1048576);

export class Discovery {
  private cells = new Set<number>();
  /** Bumped on every change, so views know to redraw. */
  version = 0;

  /** Marks everything within `radiusM` of a tile as discovered. */
  reveal(tx: number, ty: number, radiusM: number): void {
    const cx = Math.floor(tx / DCELL), cy = Math.floor(ty / DCELL);
    const r = Math.ceil(radiusM / DCELL_M);
    const r2 = (radiusM / DCELL_M) ** 2;
    let added = false;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2 + 0.5) continue;
      const k = key(cx + dx, cy + dy);
      if (this.cells.has(k)) continue;
      this.cells.add(k);
      added = true;
    }
    if (added) this.version++;
  }

  /** Whether the cell holding a tile has been discovered. */
  known(tx: number, ty: number): boolean {
    return this.cells.has(key(Math.floor(tx / DCELL), Math.floor(ty / DCELL)));
  }

  get size(): number {
    return this.cells.size;
  }

  /** For saving: cell coordinates as a flat list (x0, y0, x1, y1, ...). */
  export(): number[] {
    const out: number[] = [];
    for (const k of this.cells) out.push(Math.floor(k / 2097152) - 1048576, (k % 2097152) - 1048576);
    return out;
  }

  import(list: number[]): void {
    this.cells.clear();
    for (let i = 0; i + 1 < list.length; i += 2) this.cells.add(key(list[i], list[i + 1]));
    this.version++;
  }
}
