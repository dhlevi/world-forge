/**
 * The travel map's ground rules: what each travel step (one local-map chunk, 96 m) costs to cross,
 * and the best route between two places. Worked out from the world itself (terrain at full
 * detail, water, rivers, biome, roads and tracks, settlements) without making the chunks, so a
 * journey of a hundred kilometres can be planned at once.
 *
 * Cells are the local map's chunk grid (local/chunk.ts): cell (cx, cy) is chunk (cx, cy).
 */
import { CHUNK, TILE_M, type LocalWorld } from './chunk';
import { Biome } from '../gen/biomes';
import { MinHeap } from '../gen/heap';
import { DMath } from '../dmath';

export const STEP_M = CHUNK * TILE_M;

/** What a travel step is like, for costs and for the player. */
export interface TravelCell {
  /** Cannot be crossed on foot (sea, lake, a river too deep to ford). */
  blocked: boolean;
  /** The best way through: a road, a track, streets, or none. */
  way: 'road' | 'track' | 'street' | '';
  /** A river to ford (no bridge). */
  ford: boolean;
  biome: number;
  /** Elevation (m) at the centre. */
  elev: number;
  /** Minutes to walk across it (before slope). */
  baseMin: number;
}

/** Walking speed (km/h) off the road, by biome. */
const SPEED: Record<number, number> = {
  [Biome.IceSheet]: 1.5, [Biome.Tundra]: 3, [Biome.BorealForest]: 2.8, [Biome.ColdDesert]: 3.5,
  [Biome.Grassland]: 4, [Biome.Shrubland]: 3.2, [Biome.TemperateForest]: 3, [Biome.TemperateRainforest]: 2.2,
  [Biome.HotDesert]: 3, [Biome.Savanna]: 3.8, [Biome.TropicalDryForest]: 2.6, [Biome.TropicalRainforest]: 1.6,
  [Biome.Alpine]: 2, [Biome.MontaneForest]: 2.4, [Biome.Wetland]: 1.5, [Biome.Mangrove]: 1.2,
  [Biome.Riparian]: 3.5, [Biome.SaltFlat]: 4,
};
const WAY_SPEED = { road: 5, street: 4.5, track: 4.2, '': 0 };

const DEG = Math.PI / 180;

interface Seg { ax: number; ay: number; bx: number; by: number; cls: 'road' | 'track' }

export class TravelGrid {
  private cells = new Map<number, TravelCell>();
  private roadIdx: Map<number, Seg[]> | null = null;

  constructor(readonly lw: LocalWorld) {}

  private key(cx: number, cy: number): number {
    return (cx + 1048576) * 2097152 + (cy + 1048576);
  }

  /** Roads and tracks in lon/lat, by 0.05° bucket. */
  private roads(): Map<number, Seg[]> {
    if (this.roadIdx) return this.roadIdx;
    const idx = new Map<number, Seg[]>();
    const add = (c: number[][], cls: 'road' | 'track') => {
      for (let i = 0; i + 1 < c.length; i++) {
        const s: Seg = { ax: c[i][0], ay: c[i][1], bx: c[i + 1][0], by: c[i + 1][1], cls };
        if (Math.abs(s.ax - s.bx) > 2) continue;
        for (let ky = Math.floor(Math.min(s.ay, s.by) * 20); ky <= Math.floor(Math.max(s.ay, s.by) * 20); ky++) {
          for (let kx = Math.floor(Math.min(s.ax, s.bx) * 20); kx <= Math.floor(Math.max(s.ax, s.bx) * 20); kx++) {
            const k = (kx + 4000) * 8000 + (ky + 2000);
            let l = idx.get(k);
            if (!l) idx.set(k, (l = []));
            l.push(s);
          }
        }
      }
    };
    for (const f of this.lw.world.roads.features) add(f.geometry.coordinates, f.properties.cls === 'track' ? 'track' : 'road');
    this.roadIdx = idx;
    return idx;
  }

  /** Tracks of the villages' blocks are added as the blocks are reached. */
  private blocksDone = new Set<number>();
  private ensureBlock(lon: number, lat: number): void {
    const bx = Math.floor(lon), by = Math.floor(lat), k = (bx + 400) * 1000 + by + 200;
    if (this.blocksDone.has(k)) return;
    this.blocksDone.add(k);
    const idx = this.roads();
    for (const f of this.lw.towns.blockAt(bx, by).tracks) {
      const c = f.geometry.coordinates;
      for (let i = 0; i + 1 < c.length; i++) {
        const s: Seg = { ax: c[i][0], ay: c[i][1], bx: c[i + 1][0], by: c[i + 1][1], cls: 'track' };
        const kk = (Math.floor(s.ax * 20) + 4000) * 8000 + (Math.floor(s.ay * 20) + 2000);
        let l = idx.get(kk);
        if (!l) idx.set(kk, (l = []));
        l.push(s);
      }
    }
  }

  /** The best way within reach of a point (lon/lat), if any. */
  private wayAt(lon: number, lat: number): 'road' | 'track' | '' {
    this.ensureBlock(lon, lat);
    const idx = this.roads();
    const mLon = 111320 * DMath.cos(lat * DEG), mLat = 110540;
    const reach = STEP_M * 0.6;
    let best: 'road' | 'track' | '' = '';
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const s of idx.get((Math.floor(lon * 20) + dx + 4000) * 8000 + (Math.floor(lat * 20) + dy + 2000)) ?? []) {
        // Distance from the point to the segment, in metres.
        const ax = (s.ax - lon) * mLon, ay = (s.ay - lat) * mLat, bx = (s.bx - lon) * mLon, by = (s.by - lat) * mLat;
        const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
        const t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / l2)) : 0;
        const ex = ax + vx * t, ey = ay + vy * t;
        if (ex * ex + ey * ey > reach * reach) continue;
        if (s.cls === 'road') return 'road';
        best = 'track';
      }
    }
    return best;
  }

  /** A travel cell (cached). */
  cell(cx: number, cy: number): TravelCell {
    const k = this.key(cx, cy);
    const hit = this.cells.get(k);
    if (hit) return hit;
    const lw = this.lw;
    const ll = lw.tileLL(cx * CHUNK + CHUNK / 2, cy * CHUNK + CHUNK / 2);
    const s = lw.towns.sampler;
    const h = s.height(ll[0], ll[1], 0.2);
    const { raster } = lw.world;
    const i = ((Math.floor(((ll[0] + 180) / 360) * raster.W) % raster.W) + raster.W) % raster.W;
    const j = Math.min(raster.H - 1, Math.max(0, Math.floor(((90 - ll[1]) / 180) * raster.H)));
    const biome = raster.biome[j * raster.W + i];
    let way: TravelCell['way'] = this.wayAt(ll[0], ll[1]);
    if (!way && lw.inSettlement(ll[0], ll[1])) way = 'street';
    const water = s.isWater(ll[0], ll[1], h);
    const rb = s.riverBank(ll[0], ll[1], STEP_M / 2);
    const river = !!rb && rb.bankM < 0;
    // Roads bridge rivers; elsewhere a narrow river is forded and a wide one blocks.
    const blocked = (water && way !== 'road') || (river && !way && rb!.halfM > 12);
    const ford = river && !blocked && way !== 'road';
    const speed = way ? WAY_SPEED[way] : SPEED[biome] ?? 3;
    const c: TravelCell = { blocked, way, ford, biome, elev: Math.round(h), baseMin: (STEP_M / 1000 / speed) * 60 + (ford ? 15 : 0) };
    this.cells.set(k, c);
    if (this.cells.size > 400000) this.cells.clear();
    return c;
  }

  /**
   * Minutes to step from one cell into a neighbour (diagonal steps are longer), with Tobler's
   * hiking rule for the slope; Infinity if the step cannot be made.
   */
  stepMinutes(ax: number, ay: number, bx: number, by: number): number {
    const a = this.cell(ax, ay), b = this.cell(bx, by);
    if (b.blocked) return Infinity;
    const diag = ax !== bx && ay !== by ? Math.SQRT2 : 1;
    const run = STEP_M * diag;
    const slope = (b.elev - a.elev) / run;
    // Tobler: speed falls off either side of a gentle downhill.
    const tobler = DMath.exp(-3.5 * Math.abs(slope + 0.05)) / DMath.exp(-3.5 * 0.05);
    const factor = b.way === 'road' || b.way === 'street' ? Math.max(0.5, tobler) : Math.max(0.15, tobler);
    return (b.baseMin * diag) / Math.min(1.1, factor);
  }

  /**
   * A route toward cell b: all the way if it is near enough, otherwise one leg of about `legCells`
   * steps toward it (ending on open ground near the straight line), to be followed by the next
   * when it is walked. `partial` says whether b is still ahead.
   */
  routeToward(ax: number, ay: number, bx: number, by: number, legCells = 600): { cells: [number, number][]; minutes: number; partial: boolean } | null {
    const d = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    if (d <= legCells) {
      const r = this.route(ax, ay, bx, by);
      return r ? { ...r, partial: false } : null;
    }
    const f = legCells / d;
    const mx = Math.round(ax + (bx - ax) * f), my = Math.round(ay + (by - ay) * f);
    // The nearest open cell to the leg's end, searched outward.
    for (let r = 0; r <= 40; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || this.cell(mx + dx, my + dy).blocked) continue;
        const leg = this.route(ax, ay, mx + dx, my + dy);
        if (leg) return { ...leg, partial: true };
      }
      if (r >= 2) r += 3;
    }
    return null;
  }

  /**
   * The quickest route from cell a to cell b: the cells in order (without a), and the minutes.
   * Searches at most `maxNodes` cells; null if there is no way within that.
   */
  route(ax: number, ay: number, bx: number, by: number, maxNodes = 250000): { cells: [number, number][]; minutes: number } | null {
    if (this.cell(bx, by).blocked) return null;
    const span = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    const pad = Math.max(24, Math.ceil(span * 0.35));
    const x0 = Math.min(ax, bx) - pad, y0 = Math.min(ay, by) - pad;
    const w = Math.abs(bx - ax) + 2 * pad + 1, h = Math.abs(by - ay) + 2 * pad + 1;
    if (w * h > 9e6) return null;
    const g = new Float64Array(w * h).fill(Infinity);
    const from = new Int32Array(w * h).fill(-1);
    const closed = new Uint8Array(w * h);
    const idx = (x: number, y: number) => (y - y0) * w + (x - x0);
    // Fastest possible pace (a road on the flat), so the estimate never overshoots.
    const best = (STEP_M / 1000 / WAY_SPEED.road) * 60 / 1.1;
    const hEst = (x: number, y: number) => {
      const dx = Math.abs(x - bx), dy = Math.abs(y - by);
      return best * (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy));
    };
    const heap = new MinHeap(4096);
    const s = idx(ax, ay), t = idx(bx, by);
    g[s] = 0;
    heap.push(s, hEst(ax, ay));
    let n = 0;
    while (heap.size) {
      const k = heap.pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (k === t) break;
      if (++n > maxNodes) return null;
      const x = x0 + (k % w), y = y0 + Math.floor(k / w);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < x0 || ny < y0 || nx >= x0 + w || ny >= y0 + h) continue;
        const k2 = idx(nx, ny);
        if (closed[k2]) continue;
        const m = this.stepMinutes(x, y, nx, ny);
        if (m === Infinity) continue;
        const ng = g[k] + m;
        if (ng >= g[k2]) continue;
        g[k2] = ng;
        from[k2] = k;
        heap.push(k2, ng + hEst(nx, ny));
      }
    }
    if (!closed[t]) return null;
    const cells: [number, number][] = [];
    for (let k = t; k !== s; k = from[k]) cells.push([x0 + (k % w), y0 + Math.floor(k / w)]);
    cells.reverse();
    return { cells, minutes: g[t] };
  }
}
