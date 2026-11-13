/**
 * The local map: the world at the scale of a person, in 1.5 m tiles (the floor-plan cell), made a
 * chunk of 64 × 64 tiles at a time from what the generator already holds: the terrain and rivers
 * at full detail (gen/detail.ts), the biome, the roads and tracks, the town and village plans
 * (towns/), and every building's ground floor (interiors/dwelling.ts).
 *
 * A chunk depends only on the world and its position, never on which chunks were made before it,
 * and uses only deterministic arithmetic (dmath.ts, integer hashes), so the same world gives the
 * same tiles in Node and in any browser: the baseline a game's saved changes are laid over.
 *
 * Tile (tx, ty) covers x in [tx, tx + 1) × 1.5 m east and y in [ty, ty + 1) × 1.5 m south of the
 * local origin: the frame's centre (Phase 2 anchors the frame at the starting settlement).
 */
import { LocalFrame, type PlanFeature } from '../towns/plan';
import { TownManager, type TownWorld } from '../towns/manager';
import { buildingView } from '../interiors/building';
import type { Settlement, RoadFeature } from '../gen/settlements';
import { Biome } from '../gen/biomes';
import { hash32, hashString } from '../gen/rng';
import { G, O, OBJECT_TILES, GROUND_TILES } from './tiles';
import { DMath } from '../dmath';

/**
 * The local map's own version: raised whenever the same world would give different tiles (a game
 * saves its changes over the baseline of one version).
 */
export const LOCAL_MAP_VERSION = 2;

export const TILE_M = 1.5;
export const CHUNK = 64;
/** Coarse terrain samples every this many tiles, interpolated between. */
const STEP = 4;
/** Tiles of terrain worked out beyond the chunk's edge (for shores). */
const PAD = 4;

export interface ChunkSite {
  tx: number;
  ty: number;
  kind: string;
  name: string;
  id: string;
}

export interface Chunk {
  cx: number;
  cy: number;
  /** Ground tile ids (tiles.ts), row-major, CHUNK × CHUNK. */
  ground: Uint8Array;
  /** Object tile ids (0: none). */
  object: Uint8Array;
  /** Index into `areas` (0: none): the building and room, or the place, a tile belongs to. */
  area: Uint16Array;
  areas: string[];
  /** Elevation (m). */
  elev: Int16Array;
  /** Ways down (caves, crypts, mines) and other marked places in this chunk. */
  sites: ChunkSite[];
  /** Milliseconds it took. */
  ms: number;
}

// ---- Deterministic noise ---------------------------------------------------------------------

function rnd01(seed: number, x: number, y: number, salt: number): number {
  return hash32(seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(salt + 1, 0x9e3779b1)) / 4294967296;
}

/** Value noise in [0, 1] with a lattice every `scale` tiles. */
function vnoise(seed: number, x: number, y: number, scale: number, salt: number): number {
  const fx = x / scale, fy = y / scale;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  let tx = fx - ix, ty = fy - iy;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const a = rnd01(seed, ix, iy, salt), b = rnd01(seed, ix + 1, iy, salt);
  const c = rnd01(seed, ix, iy + 1, salt), d = rnd01(seed, ix + 1, iy + 1, salt);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// ---- Biome cover -----------------------------------------------------------------------------

interface Cover {
  ground: string;
  /** Ground under the trees. */
  under?: string;
  trees: [string, number][];
  /** Tree chance in the thick of a wood, and in the open. */
  dense: number;
  open: number;
  /** Share of the land that is wooded. */
  wooded: number;
  /** Small things: [object, chance]. */
  small: [string, number][];
}

const COVER: Record<number, Cover> = {
  [Biome.IceSheet]: { ground: 'snow', trees: [], dense: 0, open: 0, wooded: 0, small: [['stones', 0.004]] },
  [Biome.Tundra]: { ground: 'tundra', trees: [['tree_birch', 1]], dense: 0.04, open: 0.001, wooded: 0.1, small: [['stones', 0.02], ['flowers', 0.01], ['boulder', 0.003]] },
  [Biome.BorealForest]: { ground: 'grass', under: 'needle_floor', trees: [['tree_conifer', 0.85], ['tree_birch', 0.15]], dense: 0.35, open: 0.01, wooded: 0.65, small: [['bush', 0.02], ['ferns', 0.03], ['mushrooms', 0.002], ['boulder', 0.002]] },
  [Biome.ColdDesert]: { ground: 'dry_earth', trees: [], dense: 0, open: 0, wooded: 0, small: [['scrub', 0.05], ['stones', 0.03], ['boulder', 0.004]] },
  [Biome.Grassland]: { ground: 'grass', under: 'forest_floor', trees: [['tree_broadleaf', 1]], dense: 0.3, open: 0.003, wooded: 0.1, small: [['tall_grass', 0.08], ['flowers', 0.04], ['bush', 0.01]] },
  [Biome.Shrubland]: { ground: 'grass_dry', trees: [['tree_broadleaf', 1]], dense: 0.08, open: 0.004, wooded: 0.1, small: [['scrub', 0.12], ['bush', 0.04], ['stones', 0.01]] },
  [Biome.TemperateForest]: { ground: 'grass', under: 'forest_floor', trees: [['tree_broadleaf', 0.8], ['tree_conifer', 0.1], ['tree_birch', 0.1]], dense: 0.3, open: 0.01, wooded: 0.65, small: [['bush', 0.04], ['ferns', 0.04], ['flowers', 0.01], ['mushrooms', 0.002]] },
  [Biome.TemperateRainforest]: { ground: 'grass_lush', under: 'moss', trees: [['tree_conifer', 0.7], ['tree_broadleaf', 0.3]], dense: 0.38, open: 0.02, wooded: 0.75, small: [['ferns', 0.15], ['bush', 0.04], ['mushrooms', 0.004]] },
  [Biome.HotDesert]: { ground: 'desert_sand', trees: [['tree_palm', 1]], dense: 0, open: 0, wooded: 0, small: [['cactus', 0.004], ['boulder', 0.003], ['stones', 0.01], ['scrub', 0.01]] },
  [Biome.Savanna]: { ground: 'grass_dry', trees: [['tree_broadleaf', 1]], dense: 0.08, open: 0.006, wooded: 0.08, small: [['tall_grass', 0.1], ['scrub', 0.03]] },
  [Biome.TropicalDryForest]: { ground: 'grass_dry', under: 'forest_floor', trees: [['tree_broadleaf', 0.7], ['tree_palm', 0.3]], dense: 0.2, open: 0.01, wooded: 0.5, small: [['scrub', 0.05], ['bush', 0.03]] },
  [Biome.TropicalRainforest]: { ground: 'jungle_floor', trees: [['tree_jungle', 0.8], ['tree_palm', 0.2]], dense: 0.4, open: 0.05, wooded: 0.85, small: [['ferns', 0.2], ['bush', 0.08], ['flowers', 0.01]] },
  [Biome.Alpine]: { ground: 'rock', trees: [['tree_conifer', 1]], dense: 0.02, open: 0.002, wooded: 0.1, small: [['boulder', 0.03], ['stones', 0.05]] },
  [Biome.MontaneForest]: { ground: 'grass', under: 'needle_floor', trees: [['tree_conifer', 0.9], ['tree_broadleaf', 0.1]], dense: 0.3, open: 0.01, wooded: 0.6, small: [['boulder', 0.01], ['ferns', 0.03]] },
  [Biome.Wetland]: { ground: 'marsh', trees: [['tree_broadleaf', 0.6], ['tree_dead', 0.4]], dense: 0.05, open: 0.005, wooded: 0.15, small: [['reeds', 0.25]] },
  [Biome.Mangrove]: { ground: 'mud', trees: [['tree_mangrove', 1]], dense: 0.3, open: 0.05, wooded: 0.7, small: [['reeds', 0.05]] },
  [Biome.Riparian]: { ground: 'grass_lush', under: 'forest_floor', trees: [['tree_broadleaf', 0.7], ['tree_birch', 0.3]], dense: 0.15, open: 0.01, wooded: 0.4, small: [['reeds', 0.03], ['tall_grass', 0.06], ['flowers', 0.03]] },
  [Biome.SaltFlat]: { ground: 'salt', trees: [], dense: 0, open: 0, wooded: 0, small: [['stones', 0.003]] },
};

/** Biomes cold enough for gravel rather than reeds along rivers. */
const COLD = new Set<number>([Biome.IceSheet, Biome.Tundra, Biome.Alpine, Biome.ColdDesert]);

// ---- Plans in local metres -------------------------------------------------------------------

interface LocalItem {
  i: number;
  kind: string;
  p: Record<string, string | number>;
  type: 'Polygon' | 'LineString' | 'Point';
  /** x, y pairs in local metres (y north). */
  xy: number[];
  f: PlanFeature;
}

interface LocalPlan {
  site: Settlement;
  items: LocalItem[];
  /** Items by chunk key. */
  byChunk: Map<number, number[]>;
}

interface Seg {
  ax: number; ay: number; bx: number; by: number;
  /** Half-width, m. */
  hw: number;
  ground: string;
}

/** Road widths (m) by class, as the illustrated plans draw them. */
const ROAD_W: Record<string, number> = { major: 7, minor: 5, track: 3.5 };

const ckey = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);

// ---- Buildings on the tile grid ----------------------------------------------------------------

/** What a building puts on each tile of its box. */
const B_OUT = 0, B_FLOOR = 1, B_WALL = 2, B_DOOR = 3, B_WINDOW = 4, B_DOORWAY = 5;

interface BuildingRaster {
  /** Order among the buildings (lower: older, keeps its interior where two meet). */
  order: string;
  x0: number; y0: number; w: number; h: number;
  kind: Uint8Array;
  /** Object on interior tiles (furniture, stairs). */
  obj: Uint8Array;
  /** Room per tile, -1 none. */
  room: Int16Array;
  floor: number;
  wall: number;
  /** Area label per room (and the last: the building itself). */
  areas: string[];
}

/** Lines that are ways through (half-widths, m; roads by class). */
const WAY_HW: Record<string, number> = { street: 3, road: 2.5, trodden: 0.8 };
/** Hedges and fences have a gap of GAP_M metres every GAP_EVERY metres. */
const GAP_EVERY = 24, GAP_M = 3;

/** Rooms of fewer tiles than this do not give up a row to a wall. */
const MIN_ROOM = 6;

const SURFACE: Record<string, string> = { flags: 'floor_flags', boards: 'floor_boards', earth: 'floor_earth' };

const ITEM_TILE: Record<string, string> = { well: 'well', logs: 'logs' };

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export class LocalWorld {
  readonly frame: LocalFrame;
  readonly towns: TownManager;
  private seed: number;
  private plans = new Map<string, LocalPlan | null>();
  private buildings = new Map<string, BuildingRaster | null>();
  private roadIndex: Map<number, Seg[]> | null = null;

  constructor(readonly world: TownWorld, readonly start: Settlement, towns?: TownManager) {
    this.frame = new LocalFrame(start.lon, start.lat);
    this.towns = towns ?? new TownManager(world);
    this.seed = hashString(world.raster.seed + '#local');
  }

  /** Local metres (x east, y north) at a tile's centre. */
  tileCentre(tx: number, ty: number): [number, number] {
    return [(tx + 0.5) * TILE_M, -(ty + 0.5) * TILE_M];
  }

  /** Lon/lat of a tile's centre. */
  tileLL(tx: number, ty: number): number[] {
    return this.frame.toLL(this.tileCentre(tx, ty));
  }

  /** The tile at a lon/lat. */
  tileAt(lon: number, lat: number): [number, number] {
    const p = this.frame.fromLL(lon, lat);
    return [Math.floor(p[0] / TILE_M), Math.floor(-p[1] / TILE_M)];
  }

  private sitesByBlock: Map<number, Settlement[]> | null = null;

  /** The settlements (towns and cities, and the villages of its block) in a 1° block. */
  private blockSites(bx: number, by: number): Settlement[] {
    if (!this.sitesByBlock) {
      this.sitesByBlock = new Map();
      for (const s of this.world.settlements) {
        const k = (Math.floor(s.lon) + 400) * 1000 + Math.floor(s.lat) + 200;
        let l = this.sitesByBlock.get(k);
        if (!l) this.sitesByBlock.set(k, (l = []));
        l.push(s);
      }
    }
    return [...(this.sitesByBlock.get((bx + 400) * 1000 + by + 200) ?? []), ...this.towns.blockAt(bx, by).villages];
  }

  /** Whether a point (lon/lat) is within a settlement's built-up core. */
  inSettlement(lon: number, lat: number): boolean {
    const mLon = 111320 * DMath.cos((lat * Math.PI) / 180);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const s of this.blockSites(Math.floor(lon) + dx, Math.floor(lat) + dy)) {
        const ex = (s.lon - lon) * mLon, ey = (s.lat - lat) * 110540, r = Math.max(60, s.coreM);
        if (ex * ex + ey * ey < r * r) return true;
      }
    }
    return false;
  }

  /** The settlements whose plans reach within `marginM` of a box of local metres. */
  sitesNear(x0: number, y0: number, x1: number, y1: number, marginM: number): Settlement[] {
    const a = this.frame.toLL([x0 - marginM - 5000, y0 - marginM - 5000]), b = this.frame.toLL([x1 + marginM + 5000, y1 + marginM + 5000]);
    const near = this.towns.regionSites({ west: a[0], south: a[1], east: b[0], north: b[1] }, 64);
    return near.filter((s) => {
      const c = this.frame.fromLL(s.lon, s.lat);
      const dx = Math.max(x0 - c[0], 0, c[0] - x1), dy = Math.max(y0 - c[1], 0, c[1] - y1);
      const r = s.radiusM + marginM + 30;
      return dx * dx + dy * dy < r * r;
    });
  }

  /** A settlement's plan in local metres, bucketed by chunk. */
  private planOf(s: Settlement): LocalPlan | null {
    if (this.plans.has(s.id)) return this.plans.get(s.id)!;
    const feats = this.towns.planOf(s);
    const items: LocalItem[] = [];
    const byChunk = new Map<number, number[]>();
    const span = CHUNK * TILE_M;
    feats.forEach((f, i) => {
      const kind = String(f.properties.kind);
      let ring: number[][];
      if (f.geometry.type === 'Polygon') ring = f.geometry.coordinates[0];
      else if (f.geometry.type === 'LineString') ring = f.geometry.coordinates;
      else ring = [f.geometry.coordinates];
      const xy: number[] = [];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of ring) {
        const q = this.frame.fromLL(c[0], c[1]);
        xy.push(q[0], q[1]);
        if (q[0] < x0) x0 = q[0];
        if (q[0] > x1) x1 = q[0];
        if (q[1] < y0) y0 = q[1];
        if (q[1] > y1) y1 = q[1];
      }
      // Buildings are turned square to the grid (squared()), which can reach a little past their box.
      const pad = 12 + Number(f.properties.r ?? 0) + Number(f.properties.w ?? 0) + (kind === 'building' ? 0.25 * Math.max(x1 - x0, y1 - y0) : 0);
      const k = items.length;
      items.push({ i, kind, p: f.properties, type: f.geometry.type, xy, f });
      // Chunks run south as y grows; local metres run north.
      for (let cy = Math.floor((-y1 - pad) / span); cy <= Math.floor((-y0 + pad) / span); cy++) {
        for (let cx = Math.floor((x0 - pad) / span); cx <= Math.floor((x1 + pad) / span); cx++) {
          const key = ckey(cx, cy);
          let l = byChunk.get(key);
          if (!l) byChunk.set(key, (l = []));
          l.push(k);
        }
      }
    });
    const lp: LocalPlan = { site: s, items, byChunk };
    this.plans.set(s.id, lp);
    return lp;
  }

  /** World roads (major and minor) by 0.25° bucket, in lon/lat (converted per chunk). */
  private roads(): Map<number, Seg[]> {
    if (this.roadIndex) return this.roadIndex;
    const idx = new Map<number, Seg[]>();
    for (const f of this.world.roads.features) this.indexRoad(idx, f);
    this.roadIndex = idx;
    return idx;
  }

  private indexRoad(idx: Map<number, Seg[]>, f: RoadFeature): void {
    const c = f.geometry.coordinates;
    const hw = (ROAD_W[f.properties.cls] ?? 3.5) / 2;
    const ground = f.properties.cls === 'track' ? 'track' : 'road';
    for (let i = 0; i + 1 < c.length; i++) {
      const s: Seg = { ax: c[i][0], ay: c[i][1], bx: c[i + 1][0], by: c[i + 1][1], hw, ground };
      const k0x = Math.floor(Math.min(s.ax, s.bx) * 4), k1x = Math.floor(Math.max(s.ax, s.bx) * 4);
      const k0y = Math.floor(Math.min(s.ay, s.by) * 4), k1y = Math.floor(Math.max(s.ay, s.by) * 4);
      if (k1x - k0x > 8) continue; // wraps the date line
      for (let ky = k0y; ky <= k1y; ky++) for (let kx = k0x; kx <= k1x; kx++) {
        const key = (kx + 1000) * 2000 + (ky + 1000);
        let l = idx.get(key);
        if (!l) idx.set(key, (l = []));
        l.push(s);
      }
    }
  }

  /** A building's ground floor on the tile grid (cached). */
  private buildingRaster(f: PlanFeature, order: string, lp: LocalPlan): BuildingRaster | null {
    const bid = String(f.properties.bid);
    if (this.buildings.has(bid)) return this.buildings.get(bid)!;
    const r = this.rasterise(f, order, lp);
    this.buildings.set(bid, r);
    return r;
  }

  private rasterise(f: PlanFeature, order: string, lp: LocalPlan): BuildingRaster | null {
    if (f.geometry.type !== 'Polygon' || f.properties.tree === 'top') return null;
    const bv = buildingView(f, this.world.raster.seed);
    if (!bv) return null;
    const d = bv.d;
    const fl = d.floors[d.ground];
    if (!fl) return null;
    const self = lp.items.find((it) => it.f === f);
    if (!self) return null;
    const sq = squared(self);
    const xy = sq.xy;
    // Box of the footprint in tiles, with a margin.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < xy.length; i += 2) {
      const tx = xy[i] / TILE_M, ty = -xy[i + 1] / TILE_M;
      x0 = Math.min(x0, tx);
      x1 = Math.max(x1, tx);
      y0 = Math.min(y0, ty);
      y1 = Math.max(y1, ty);
    }
    const bx0 = Math.floor(x0) - 1, by0 = Math.floor(y0) - 1;
    const w = Math.floor(x1) + 2 - bx0, h = Math.floor(y1) + 2 - by0;
    if (w * h > 40000) return null;
    const N = w * h;
    const cx = (k: number) => (bx0 + (k % w) + 0.5) * TILE_M, cy = (k: number) => -(by0 + Math.floor(k / w) + 0.5) * TILE_M;

    // The plan's buildings near this one (older and newer) and its streets.
    const near: LocalItem[] = [], streets: number[][] = [], ways: { xy: number[]; hw: number }[] = [];
    const seenIt = new Set<number>();
    for (let ky = Math.floor((by0 - 8) / CHUNK); ky <= Math.floor((by0 + h + 8) / CHUNK); ky++) {
      for (let kx = Math.floor((bx0 - 8) / CHUNK); kx <= Math.floor((bx0 + w + 8) / CHUNK); kx++) {
        for (const k of lp.byChunk.get(ckey(kx, ky)) ?? []) {
          if (seenIt.has(k)) continue;
          seenIt.add(k);
          const it = lp.items[k];
          if (it === self) continue;
          if (it.kind === 'building' && it.p.tree !== 'top' && it.type === 'Polygon') near.push(it);
          else if (it.type === 'LineString' && WAY_HW[it.kind]) {
            streets.push(it.xy);
            ways.push({ xy: it.xy, hw: it.kind === 'road' ? (ROAD_W[String(it.p.cls ?? '')] ?? 3.5) / 2 : WAY_HW[it.kind] });
          }
        }
      }
    }
    /** Who stands on a tile: 0 open ground, 1 this building, 2 an older one, 3 a newer one. */
    const who = new Uint8Array(N);
    for (let k = 0; k < N; k++) {
      const px = cx(k), py = cy(k);
      let older = false, newer = false;
      for (const o of near) {
        if (!pointInPoly(squared(o).xy, px, py)) continue;
        if (o.i < self.i) older = true;
        else newer = true;
      }
      // Turned square, a corner may poke into the street: the street keeps it.
      const onWay = ways.some((wv) => {
        const r = Math.max(0.6, wv.hw - 0.3);
        for (let i = 0; i + 3 < wv.xy.length; i += 2) if (segDist2(px, py, wv.xy[i], wv.xy[i + 1], wv.xy[i + 2], wv.xy[i + 3]) < r * r) return true;
        return false;
      });
      who[k] = older ? 2 : pointInPoly(xy, px, py) && !onWay ? 1 : newer ? 3 : 0;
    }

    // The building's own tiles: the edge is wall, except along a newer neighbour, which walls
    // the join itself (one wall between two houses, not two).
    const kind = new Uint8Array(N), obj = new Uint8Array(N), room = new Int16Array(N).fill(-1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (who[k] !== 1) continue;
      let edge = false, wallIt = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        const o = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : who[yy * w + xx];
        if (o === 1) continue;
        edge = true;
        if (o !== 3) wallIt = true;
      }
      kind[k] = edge && wallIt ? B_WALL : B_FLOOR;
    }

    // Floor-plan cell coordinates (u, v) of a point (local metres).
    const uvOf = (px0: number, py0: number): [number, number] => {
      // Back from the squared building to the plan's.
      const [px, py] = sq.unturn(px0, py0);
      const ll = this.frame.toLL([px, py]);
      const q = bv.frame.fromLL(ll[0], ll[1]);
      const qx = q[0] - d.origin[0], qy = q[1] - d.origin[1];
      return [(qx * d.eu[0] + qy * d.eu[1]) / d.cw, (qx * d.ev[0] + qy * d.ev[1]) / d.ch];
    };
    // Affine: worked out at three points.
    const A = uvOf(cx(0), cy(0)), B = uvOf(cx(0) + TILE_M, cy(0)), C = uvOf(cx(0), cy(0) - TILE_M);
    const ux = B[0] - A[0], vx = B[1] - A[1], uy = C[0] - A[0], vy = C[1] - A[1];
    const det = ux * vy - uy * vx;
    const U = new Float64Array(N), V = new Float64Array(N);
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (let k = 0; k < N; k++) {
      const x = k % w, y = Math.floor(k / w);
      U[k] = A[0] + ux * x + uy * y;
      V[k] = A[1] + vx * x + vy * y;
      if (kind[k] !== B_FLOOR) continue;
      uMin = Math.min(uMin, U[k]);
      uMax = Math.max(uMax, U[k]);
      vMin = Math.min(vMin, V[k]);
      vMax = Math.max(vMax, V[k]);
    }
    if (uMin === Infinity) return null;
    // The plan stretched over the floor inside the walls: (P, Q) are plan cells.
    const ku = uMax > uMin ? (d.nx - 1) / (uMax - uMin) : 0, kv = vMax > vMin ? (d.ny - 1) / (vMax - vMin) : 0;
    const P = (k: number) => 0.5 + (U[k] - uMin) * ku, Q = (k: number) => 0.5 + (V[k] - vMin) * kv;
    /** Tile nearest a point given in plan cells. */
    const tileOfPlan = (p: number, q: number): [number, number] => {
      const u = ku ? uMin + (p - 0.5) / ku : uMin, v = kv ? vMin + (q - 0.5) / kv : vMin;
      const du = u - A[0], dv = v - A[1];
      return [(du * vy - dv * uy) / det, (dv * ux - du * vx) / det];
    };
    const roomCount = new Map<number, number>();
    for (let k = 0; k < N; k++) {
      if (kind[k] !== B_FLOOR) continue;
      const i = Math.min(d.nx - 1, Math.max(0, Math.floor(P(k)))), j = Math.min(d.ny - 1, Math.max(0, Math.floor(Q(k))));
      room[k] = d.mask[j * d.nx + i] ? fl.room[j * d.nx + i] : -1;
      roomCount.set(room[k], (roomCount.get(room[k]) ?? 0) + 1);
    }
    // Walls between rooms: the larger room gives up the row of tiles; small rooms stay open.
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (kind[k] !== B_FLOOR) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx >= w || yy >= h) continue;
        const k2 = yy * w + xx;
        if (kind[k2] !== B_FLOOR || room[k2] === room[k]) continue;
        const na = roomCount.get(room[k])!, nb = roomCount.get(room[k2])!;
        if (Math.max(na, nb) < MIN_ROOM) continue;
        const lose = na > nb || (na === nb && room[k] > room[k2]) ? k : k2;
        kind[lose] = B_WALL;
        roomCount.set(room[lose], roomCount.get(room[lose])! - 1);
      }
    }

    // Doors and windows: the wall tile nearest where the plan has one, between floor and the
    // open air (outer) or between two rooms (inner).
    const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const nb4 = (k: number, test: (k2: number) => boolean) => {
      const x = k % w, y = Math.floor(k / w);
      for (const [dx, dy] of D4) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) {
          if (test(-1)) return true;
          continue;
        }
        if (test(yy * w + xx)) return true;
      }
      return false;
    };
    const isFloor = (k2: number) => k2 >= 0 && kind[k2] === B_FLOOR;
    const isOpen = (k2: number) => k2 < 0 || who[k2] === 0;
    const outerOK = (k: number) => kind[k] === B_WALL && nb4(k, isFloor) && nb4(k, isOpen);
    const innerOK = (k: number, ra: number, rb: number) => kind[k] === B_WALL && nb4(k, (k2) => isFloor(k2) && room[k2] === ra) && nb4(k, (k2) => isFloor(k2) && room[k2] === rb);
    const nearest = (p: number, q: number, ok: (k: number) => boolean, maxT: number) => {
      const [fx, fy] = tileOfPlan(p, q);
      let best = -1, bd = maxT * maxT;
      for (let y = Math.max(0, Math.floor(fy - maxT)); y <= Math.min(h - 1, Math.ceil(fy + maxT)); y++) {
        for (let x = Math.max(0, Math.floor(fx - maxT)); x <= Math.min(w - 1, Math.ceil(fx + maxT)); x++) {
          const dd = (x - fx) * (x - fx) + (y - fy) * (y - fy);
          if (dd < bd && ok(y * w + x)) {
            bd = dd;
            best = y * w + x;
          }
        }
      }
      return best;
    };
    const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < d.nx && j < d.ny && d.mask[j * d.nx + i] === 1;
    const sorted = [...fl.openings].sort((a, b) => (a.kind === 'window' || a.kind === 'slit' ? 0 : 1) - (b.kind === 'window' || b.kind === 'slit' ? 0 : 1));
    let outerDoors = 0;
    for (const op of sorted) {
      const i2 = op.side === 'e' ? op.i + 1 : op.i, j2 = op.side === 'e' ? op.j : op.j + 1;
      const inA = inside(op.i, op.j), inB = inside(i2, j2);
      if (!inA && !inB) continue;
      const mp = op.side === 'e' ? op.i + 1 : op.i + 0.5, mq = op.side === 'e' ? op.j + 0.5 : op.j + 1;
      const door = op.kind === 'door' || op.kind === 'entrance';
      if (inA && inB) {
        if (!door) continue;
        const ra = fl.room[op.j * d.nx + op.i], rb = fl.room[j2 * d.nx + i2];
        const k = nearest(mp, mq, (k) => innerOK(k, ra, rb), 2.2);
        if (k >= 0) kind[k] = B_DOOR;
      } else {
        const k = nearest(mp, mq, (k) => outerOK(k) && (door || kind[k] === B_WALL), door ? 2.2 : 1.2);
        if (k < 0) continue;
        kind[k] = door ? B_DOOR : B_WINDOW;
        if (door) outerDoors++;
      }
    }
    // No way in where the plan has one (its front faces a neighbour): a door nearest a street.
    if (!outerDoors) {
      let best = -1, bestD = Infinity;
      for (let k = 0; k < N; k++) {
        if ((kind[k] !== B_WALL && kind[k] !== B_WINDOW) || !nb4(k, isFloor) || !nb4(k, isOpen)) continue;
        let dd = 0;
        for (const s of streets) for (let i = 0; i + 3 < s.length; i += 2) dd = Math.min(dd || Infinity, segDist2(cx(k), cy(k), s[i], s[i + 1], s[i + 2], s[i + 3]));
        if (dd < bestD) {
          bestD = dd;
          best = k;
        }
      }
      // Hemmed in on every side: through the wall of the house next door.
      if (best < 0) for (let k = 0; k < N && best < 0; k++) if (kind[k] === B_WALL && nb4(k, isFloor) && nb4(k, (k2) => k2 >= 0 && who[k2] >= 2)) best = k;
      if (best >= 0) kind[best] = B_DOOR;
    }
    // Rooms with no door at all (the plan's door fell on a merged or eaten wall): one into the next room.
    const reach = new Uint8Array(N);
    const stack: number[] = [];
    for (let k = 0; k < N; k++) if (kind[k] === B_DOOR && nb4(k, isOpen)) {
      reach[k] = 1;
      stack.push(k);
    }
    const flood = () => {
      while (stack.length) {
        const k = stack.pop()!;
        const x = k % w, y = Math.floor(k / w);
        for (const [dx, dy] of D4) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const k2 = yy * w + xx;
          if (reach[k2] || (kind[k2] !== B_FLOOR && kind[k2] !== B_DOOR)) continue;
          reach[k2] = 1;
          stack.push(k2);
        }
      }
    };
    flood();
    for (let guard = 0; guard < 12; guard++) {
      // A wall tile between a reached floor and an unreached one becomes a door.
      let made = -1;
      for (let k = 0; k < N && made < 0; k++) {
        if (kind[k] !== B_WALL || !nb4(k, (k2) => isFloor(k2) && reach[k2] === 1) || !nb4(k, (k2) => isFloor(k2) && !reach[k2])) continue;
        made = k;
      }
      if (made < 0) break;
      kind[made] = B_DOOR;
      reach[made] = 1;
      stack.push(made);
      flood();
    }

    // Furniture and stairs, by plan cell.
    const place = (p0: number, q0: number, p1: number, q1: number, t: number, under = false) => {
      let n = 0, best = -1, bestD = Infinity;
      const pc = (p0 + p1) / 2, qc = (q0 + q1) / 2;
      for (let k = 0; k < N; k++) {
        if (kind[k] !== B_FLOOR) continue;
        const p = P(k), q = Q(k);
        const dd = (p - pc) * (p - pc) + (q - qc) * (q - qc);
        if (dd < bestD) {
          bestD = dd;
          best = k;
        }
        if (p < p0 || p >= p1 || q < q0 || q >= q1 || (under && obj[k])) continue;
        obj[k] = t;
        n++;
      }
      // Small things between tile centres still show, on the nearest free floor tile.
      if (!n && best >= 0 && !obj[best] && bestD < 2.5) obj[best] = t;
    };
    const items = [...fl.items].sort((a, b) => (a.type === 'rug' ? 0 : 1) - (b.type === 'rug' ? 0 : 1));
    for (const it of items) {
      const name = ITEM_TILE[it.type] ?? it.type;
      const id = OBJECT_TILES.findIndex((t) => t.name === name);
      if (id <= 0) continue;
      place(it.x0, it.y0, it.x1, it.y1, id, it.type === 'rug');
    }
    for (const s of fl.stairs) {
      const t = s.kind === 'ladder' ? (s.up ? 'ladder_up' : 'ladder_down') : s.kind === 'spiral' ? 'stairs_spiral' : s.up ? 'stairs_up' : 'stairs_down';
      place(s.i, s.j, s.i + s.w, s.j + s.h, O(t));
    }
    // Keep the way through: nothing that blocks stands just inside a door.
    for (let k = 0; k < N; k++) {
      if (kind[k] !== B_DOOR) continue;
      const x = k % w, y = Math.floor(k / w);
      for (const [dx, dy] of D4) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const k2 = yy * w + xx;
        if (kind[k2] === B_FLOOR && obj[k2] && !OBJECT_TILES[obj[k2]].pass) obj[k2] = 0;
      }
    }
    // Nor does furniture shut off part of the floor: clear the piece in the way until every free
    // floor tile can be walked to from a way in.
    const free = (k2: number) => (kind[k2] === B_FLOOR && (!obj[k2] || OBJECT_TILES[obj[k2]].pass)) || kind[k2] === B_DOOR;
    for (let guard = 0; guard < 24; guard++) {
      reach.fill(0);
      for (let k = 0; k < N; k++) if (kind[k] === B_DOOR && nb4(k, isOpen)) {
        reach[k] = 1;
        stack.push(k);
      }
      while (stack.length) {
        const k = stack.pop()!;
        const x = k % w, y = Math.floor(k / w);
        for (const [dx, dy] of D4) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const k2 = yy * w + xx;
          if (reach[k2] || !free(k2)) continue;
          reach[k2] = 1;
          stack.push(k2);
        }
      }
      let cut = -1;
      for (let k = 0; k < N && cut < 0; k++) {
        if (kind[k] !== B_FLOOR || !obj[k] || OBJECT_TILES[obj[k]].pass) continue;
        if (nb4(k, (k2) => k2 >= 0 && reach[k2] === 1) && nb4(k, (k2) => k2 >= 0 && free(k2) && !reach[k2])) cut = k;
      }
      if (cut < 0) break;
      obj[cut] = 0;
    }
    const title = d.title ? `${d.title} (${d.label.toLowerCase()})` : cap(d.label);
    const areas = fl.rooms.map((r) => `${title}: ${r.name.toLowerCase()}`);
    areas.push(title);
    const mat = d.style?.wall ?? 'timber';
    return {
      order, x0: bx0, y0: by0, w, h, kind, obj, room,
      floor: G(SURFACE[fl.surface] ?? 'floor_boards'), wall: O(`wall_${mat}`), areas,
    };
  }

  // ---- The chunk ------------------------------------------------------------------------------

  private cache = new Map<number, Chunk>();

  /** The chunk at (cx, cy), from a small cache of the latest made. */
  chunk(cx: number, cy: number): Chunk {
    const key = ckey(cx, cy);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const c = this.makeChunk(cx, cy);
    this.cache.set(key, c);
    if (this.cache.size > 48) this.cache.delete(this.cache.keys().next().value!);
    return c;
  }

  private makeChunk(cx: number, cy: number): Chunk {
    const t0 = performance.now();
    const N = CHUNK * CHUNK;
    const tx0 = cx * CHUNK, ty0 = cy * CHUNK;
    const ground = new Uint8Array(N), object = new Uint8Array(N), area = new Uint16Array(N), elev = new Int16Array(N);
    const areas = [''];
    const areaIds = new Map<string, number>();
    const areaOf = (s: string) => {
      let i = areaIds.get(s);
      if (i === undefined) {
        i = areas.length;
        areas.push(s);
        areaIds.set(s, i);
      }
      return i;
    };
    /** Made ground (roads, plans, buildings): no wild plants. */
    const built = new Uint8Array(N);
    const sites: ChunkSite[] = [];
    const sampler = this.towns.sampler;
    const { raster } = this.world;
    const seed = this.seed;

    // ---- Terrain: coarse samples, interpolated, over the chunk and a margin.
    const P = CHUNK + 2 * PAD, n = P / STEP + 1;
    const hS = new Float64Array(n * n), bS = new Float64Array(n * n), wS = new Float64Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const ll = this.tileLL(tx0 - PAD + i * STEP, ty0 - PAD + j * STEP);
      const hh = sampler.height(ll[0], ll[1], 0.004);
      const rb = sampler.riverBank(ll[0], ll[1], 120);
      hS[j * n + i] = hh;
      bS[j * n + i] = rb ? rb.bankM : 120;
      wS[j * n + i] = rb ? rb.halfM : 0;
    }
    const lerp = (S: Float64Array, px: number, py: number) => {
      const fi = px / STEP, fj = py / STEP;
      const i = Math.min(n - 2, Math.floor(fi)), j = Math.min(n - 2, Math.floor(fj));
      const a = fi - i, b = fj - j;
      return (S[j * n + i] * (1 - a) + S[j * n + i + 1] * a) * (1 - b) + (S[(j + 1) * n + i] * (1 - a) + S[(j + 1) * n + i + 1] * a) * b;
    };
    // Water over the padded area: 0 land, 1 sea or lake, 2 river.
    const water = new Uint8Array(P * P), hP = new Float64Array(P * P), bank = new Float64Array(P * P), half = new Float64Array(P * P);
    for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
      const k = y * P + x;
      const hh = lerp(hS, x, y), bm = lerp(bS, x, y);
      hP[k] = hh;
      bank[k] = bm;
      half[k] = lerp(wS, x, y);
      if (hh <= 0) water[k] = 1;
      else if (bm < 0) water[k] = 2;
      else if (raster.lakeDepth) {
        const ll = this.tileLL(tx0 - PAD + x, ty0 - PAD + y);
        if (sampler.isWater(ll[0], ll[1], hh)) water[k] = 1;
      }
    }
    // Distance to land (in tiles, up to PAD) for shallows along shores.
    const shoreDist = (x: number, y: number) => {
      for (let r = 1; r <= PAD; r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= P || yy >= P) continue;
          if (!water[yy * P + xx]) return r;
        }
      }
      return PAD + 1;
    };

    // Biome: the world's cells blend into one another over a whole cell, as the map draws them
    // (render/tiles.ts blends the four nearest cells' colours); here each tile takes one of the
    // four, in proportion to its share, in patches (value noise), along a wandering line.
    const { W, H } = raster;
    const biomeAt = (tx: number, ty: number, lon: number, lat: number) => {
      const jx = (vnoise(seed, tx, ty, 2048, 1) - 0.5) * 0.5, jy = (vnoise(seed, tx, ty, 2048, 3) - 0.5) * 0.5;
      const fx = ((lon + 180) / 360) * W - 0.5 + jx, fy = Math.min(H - 1.001, Math.max(0, ((90 - lat) / 180) * H - 0.5 + jy));
      const i0 = Math.floor(fx), j0 = Math.floor(fy), ax = fx - i0, ay = fy - j0;
      const ia = ((i0 % W) + W) % W, ib = (ia + 1) % W, ja = j0 * W, jb = Math.min(H - 1, j0 + 1) * W;
      // A patchy, roughly even draw in [0, 1).
      const v = Math.min(0.9999, Math.max(0, (0.7 * vnoise(seed, tx, ty, 56, 2) + 0.3 * vnoise(seed, tx, ty, 13, 4) - 0.5) * 1.7 + 0.5));
      let acc = (1 - ax) * (1 - ay);
      if (v < acc) return raster.biome[ja + ia];
      acc += ax * (1 - ay);
      if (v < acc) return raster.biome[ja + ib];
      acc += (1 - ax) * ay;
      if (v < acc) return raster.biome[jb + ia];
      return raster.biome[jb + ib];
    };

    const covers: Cover[] = new Array(N);
    const biomes = new Uint8Array(N);
    const forest = new Float64Array(N);
    for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
      const k = y * CHUNK + x, kp = (y + PAD) * P + x + PAD;
      const tx = tx0 + x, ty = ty0 + y;
      const hh = hP[kp];
      elev[k] = Math.round(hh);
      const wt = water[kp];
      if (wt === 1) {
        ground[k] = G(hh < -2.5 && shoreDist(x + PAD, y + PAD) > 2 ? 'water_deep' : 'water_shallow');
        continue;
      }
      if (wt === 2) {
        ground[k] = G(bank[kp] < -2 && half[kp] > 6 ? 'river_deep' : 'river');
        continue;
      }
      const ll = this.tileLL(tx, ty);
      const b = biomeAt(tx, ty, ll[0], ll[1]);
      biomes[k] = b;
      const cv = COVER[b] ?? COVER[Biome.Grassland];
      covers[k] = cv;
      // Slope from the neighbouring heights (m per m).
      const gx = (hP[kp + 1] - hP[kp - 1]) / (2 * TILE_M), gy = (hP[kp + P] - hP[kp - P]) / (2 * TILE_M);
      const slope = gx * gx + gy * gy;
      let gname = cv.ground;
      const wood = smooth(1 - cv.wooded - 0.08, 1 - cv.wooded + 0.08, 0.65 * vnoise(seed, tx, ty, 40, 5) + 0.35 * vnoise(seed, tx, ty, 11, 6));
      forest[k] = cv.wooded > 0 ? wood : 0;
      if (cv.under && wood > 0.5) gname = cv.under;
      if (b === Biome.Alpine) gname = hh > 3800 || vnoise(seed, tx, ty, 30, 7) > 0.72 ? 'snow' : slope > 0.3 ? 'scree' : 'rock';
      if (b === Biome.Tundra && vnoise(seed, tx, ty, 20, 8) > 0.8) gname = 'snow';
      if (b === Biome.Wetland && vnoise(seed, tx, ty, 9, 9) > 0.7) gname = 'water_shallow';
      if (b === Biome.Mangrove && vnoise(seed, tx, ty, 8, 9) > 0.62) gname = 'water_shallow';
      if (slope > 0.8 && b !== Biome.IceSheet) gname = 'rock';
      else if (slope > 0.45 && (b === Biome.Alpine || b === Biome.MontaneForest)) gname = 'scree';
      // Beaches and river banks.
      if (hh < 1.6 && gname !== 'water_shallow' && b !== Biome.Wetland && b !== Biome.Mangrove && shoreDist(x + PAD, y + PAD) <= 3) gname = b === Biome.IceSheet ? 'snow' : 'sand';
      else if (bank[kp] < 1.5 && half[kp] > 0) gname = COLD.has(b) ? 'gravel' : 'mud';
      else if (bank[kp] < 5 && half[kp] > 0 && !COLD.has(b) && gname === 'grass') gname = 'grass_lush';
      ground[k] = G(gname);
    }

    // ---- Roads and tracks.
    const mx0 = tx0 * TILE_M, mx1 = (tx0 + CHUNK) * TILE_M, my1 = -ty0 * TILE_M, my0 = -(ty0 + CHUNK) * TILE_M;
    const segs: Seg[] = [];
    const llA = this.frame.toLL([mx0 - 20, my0 - 20]), llB = this.frame.toLL([mx1 + 20, my1 + 20]);
    const roadIdx = this.roads();
    const seen = new Set<Seg>();
    for (let ky = Math.floor(llA[1] * 4); ky <= Math.floor(llB[1] * 4); ky++) for (let kx = Math.floor(llA[0] * 4); kx <= Math.floor(llB[0] * 4); kx++) {
      for (const s of roadIdx.get((kx + 1000) * 2000 + (ky + 1000)) ?? []) if (!seen.has(s)) {
        seen.add(s);
        segs.push(s);
      }
    }
    const blocks: [number, number][] = [];
    for (let by = Math.floor(llA[1] - 0.02); by <= Math.floor(llB[1] + 0.02); by++) for (let bx = Math.floor(llA[0] - 0.02); bx <= Math.floor(llB[0] + 0.02); bx++) blocks.push([bx, by]);
    for (const [bx, by] of blocks) {
      for (const f of this.towns.blockAt(bx, by).tracks) {
        const c = f.geometry.coordinates;
        for (let i = 0; i + 1 < c.length; i++) segs.push({ ax: c[i][0], ay: c[i][1], bx: c[i + 1][0], by: c[i + 1][1], hw: (ROAD_W[f.properties.cls] ?? 3.5) / 2, ground: f.properties.cls === 'track' ? 'track' : 'road' });
      }
    }
    const isWaterTile = (k: number) => GROUND_TILES[ground[k]].water !== undefined;
    /** Paints the tiles within `hw` of a segment; `fn` also gets the distance along it (m). */
    const paintSeg = (ax: number, ay: number, bx: number, by: number, hw: number, fn: (k: number, along: number) => void, minHw = 0.8) => {
      const r = Math.max(hw, minHw);
      const tA = Math.floor((Math.min(ax, bx) - r) / TILE_M) - tx0, tB = Math.floor((Math.max(ax, bx) + r) / TILE_M) - tx0;
      const sA = Math.floor(-(Math.max(ay, by) + r) / TILE_M) - ty0, sB = Math.floor(-(Math.min(ay, by) - r) / TILE_M) - ty0;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      for (let y = Math.max(0, sA); y <= Math.min(CHUNK - 1, sB); y++) for (let x = Math.max(0, tA); x <= Math.min(CHUNK - 1, tB); x++) {
        const px = (tx0 + x + 0.5) * TILE_M, py = -(ty0 + y + 0.5) * TILE_M;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
        const ex = ax + dx * t - px, ey = ay + dy * t - py;
        if (ex * ex + ey * ey <= r * r) fn(y * CHUNK + x, t * Math.sqrt(l2));
      }
    };
    for (const s of segs) {
      const a = this.frame.fromLL(s.ax, s.ay), b = this.frame.fromLL(s.bx, s.by);
      if (Math.max(a[0], b[0]) < mx0 - 10 || Math.min(a[0], b[0]) > mx1 + 10 || Math.max(a[1], b[1]) < my0 - 10 || Math.min(a[1], b[1]) > my1 + 10) continue;
      const gid = G(s.ground), bridge = G('bridge');
      paintSeg(a[0], a[1], b[0], b[1], s.hw, (k) => {
        if (isWaterTile(k)) {
          // Roads bridge water; tracks ford shallows and stop at deep water.
          if (s.ground === 'road' || GROUND_TILES[ground[k]].water === 'shallow') ground[k] = s.ground === 'road' ? bridge : ground[k];
          built[k] = 1;
          return;
        }
        ground[k] = gid;
        object[k] = 0;
        built[k] = 1;
      });
    }

    // ---- Town and village plans.
    const sitesHere = this.sitesNear(mx0, my0, mx1, my1, 40);
    sitesHere.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const brs: BuildingRaster[] = [];
    const nearSite: { x: number; y: number; r: number }[] = [];
    const inPoly = pointInPoly;
    const fillPoly = (xy: number[], fn: (k: number) => void) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < xy.length; i += 2) {
        x0 = Math.min(x0, xy[i]);
        x1 = Math.max(x1, xy[i]);
        y0 = Math.min(y0, xy[i + 1]);
        y1 = Math.max(y1, xy[i + 1]);
      }
      const tA = Math.max(0, Math.floor(x0 / TILE_M) - tx0), tB = Math.min(CHUNK - 1, Math.floor(x1 / TILE_M) - tx0);
      const sA = Math.max(0, Math.floor(-y1 / TILE_M) - ty0), sB = Math.min(CHUNK - 1, Math.floor(-y0 / TILE_M) - ty0);
      for (let y = sA; y <= sB; y++) for (let x = tA; x <= tB; x++) {
        if (inPoly(xy, (tx0 + x + 0.5) * TILE_M, -(ty0 + y + 0.5) * TILE_M)) fn(y * CHUNK + x);
      }
    };
    const line = (xy: number[], hw: number, fn: (k: number, along: number) => void, minHw?: number) => {
      let s0 = 0;
      for (let i = 0; i + 3 < xy.length; i += 2) {
        const base = s0;
        paintSeg(xy[i], xy[i + 1], xy[i + 2], xy[i + 3], hw, (k, a) => fn(k, base + a), minHw);
        const dx = xy[i + 2] - xy[i], dy = xy[i + 3] - xy[i + 1];
        s0 += Math.sqrt(dx * dx + dy * dy);
      }
    };
    // Every way through the plans and the country in this chunk (streets, roads, tracks, paths),
    // in local metres: walls get gates where they cross one, hedges and fences a gap.
    const ways: { ax: number; ay: number; bx: number; by: number; hw: number }[] = [];
    for (const s of segs) {
      const a = this.frame.fromLL(s.ax, s.ay), b = this.frame.fromLL(s.bx, s.by);
      ways.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], hw: s.hw });
    }
    for (const st of sitesHere) {
      const lp = this.planOf(st);
      for (const idx of lp?.byChunk.get(ckey(cx, cy)) ?? []) {
        const it = lp!.items[idx];
        if (it.type !== 'LineString' || !WAY_HW[it.kind]) continue;
        const hw = it.kind === 'road' ? (ROAD_W[String(it.p.cls ?? '')] ?? 3.5) / 2 : WAY_HW[it.kind];
        for (let i = 0; i + 3 < it.xy.length; i += 2) ways.push({ ax: it.xy[i], ay: it.xy[i + 1], bx: it.xy[i + 2], by: it.xy[i + 3], hw });
      }
    }
    /** Where a line (a wall, a hedge) crosses a way: the points, with the width of the opening. */
    const crossings = (xy: number[]) => {
      const out: { x: number; y: number; r: number }[] = [];
      for (let i = 0; i + 3 < xy.length; i += 2) {
        for (const wv of ways) {
          const q = segCross(xy[i], xy[i + 1], xy[i + 2], xy[i + 3], wv.ax, wv.ay, wv.bx, wv.by);
          if (q) out.push({ x: q[0], y: q[1], r: wv.hw + 1.2 });
        }
      }
      return out;
    };
    const atCrossing = (cr: { x: number; y: number; r: number }[], k: number) => {
      const px = (tx0 + (k % CHUNK) + 0.5) * TILE_M, py = -(ty0 + Math.floor(k / CHUNK) + 0.5) * TILE_M;
      return cr.some((c) => (c.x - px) * (c.x - px) + (c.y - py) * (c.y - py) <= c.r * c.r);
    };
    /** Whether a tile lies on a way (within its half-width less `inset` metres). */
    const nearWay = (k: number, inset: number) => {
      const px = (tx0 + (k % CHUNK) + 0.5) * TILE_M, py = -(ty0 + Math.floor(k / CHUNK) + 0.5) * TILE_M;
      return ways.some((wv) => {
        const r = Math.max(0.6, wv.hw - inset);
        return segDist2(px, py, wv.ax, wv.ay, wv.bx, wv.by) < r * r;
      });
    };
    /** A hedge or fence with a gap every so often (a field gate), and where a way crosses it. */
    const gapped = (xy: number[], name: string, phase: number) => {
      const id = O(name), cr = crossings(xy);
      // A short run (one side of a field) gets its gap in the middle.
      let len = 0;
      for (let i = 0; i + 3 < xy.length; i += 2) len += Math.sqrt((xy[i + 2] - xy[i]) * (xy[i + 2] - xy[i]) + (xy[i + 3] - xy[i + 1]) * (xy[i + 3] - xy[i + 1]));
      const mid = len >= 8 && len < 2 * GAP_EVERY ? len / 2 : -1e9;
      line(xy, 0.4, (k, along) => {
        if (isWaterTile(k)) return;
        built[k] = 1;
        if (atCrossing(cr, k) || Math.abs(along - mid) < GAP_M / 2 || (len >= 2 * GAP_EVERY && (along + phase) % GAP_EVERY < GAP_M)) return;
        object[k] = id;
      }, 1.07);
    };
    const disc = (x: number, y: number, r: number, fn: (k: number) => void) => paintSeg(x, y, x, y, r, fn, 0.75);
    const setG = (name: string) => {
      const id = G(name);
      return (k: number) => {
        ground[k] = id;
        object[k] = 0;
        built[k] = 1;
      };
    };
    const setO = (name: string, clearGround = false) => {
      const id = O(name);
      return (k: number) => {
        if (clearGround && isWaterTile(k)) return;
        object[k] = id;
        built[k] = 1;
      };
    };
    const treeName = (k: number, tx: number, ty: number) => {
      const cv = covers[k];
      if (!cv || !cv.trees.length) return 'tree_broadleaf';
      return pick(cv.trees, rnd01(seed, tx, ty, 21));
    };

    for (const s of sitesHere) {
      const lp = this.planOf(s);
      const c = this.frame.fromLL(s.lon, s.lat);
      nearSite.push({ x: c[0], y: c[1], r: s.radiusM });
      if (!lp) continue;
      const list = lp.byChunk.get(ckey(cx, cy));
      if (!list) continue;
      const village = s.tier === 'village';
      const townName = s.name ?? '';
      const townArea = townName ? areaOf(townName) : 0;
      const mark = (fn: (k: number) => void) => (k: number) => {
        fn(k);
        if (townArea && !area[k]) area[k] = townArea;
      };
      for (const idx of list) {
        const it = lp.items[idx];
        const { kind, p, xy } = it;
        if (it.type === 'Polygon') {
          const surface = String(p.surface ?? '');
          switch (kind) {
            case 'building': {
              const br = this.buildingRaster(it.f, `${s.id}/${String(it.i).padStart(6, '0')}`, lp);
              if (br) brs.push(br);
              break;
            }
            case 'field': fillPoly(xy, mark(setG('field'))); break;
            case 'vineyard': fillPoly(xy, mark(setG('vineyard'))); break;
            case 'garden': fillPoly(xy, mark(setG('garden_bed'))); break;
            case 'yard': fillPoly(xy, mark(setG(surface === 'cobbles' ? 'cobbles' : surface === 'garden' ? 'garden_bed' : 'yard'))); break;
            case 'paving': fillPoly(xy, mark(setG(surface === 'dirt' ? 'yard' : 'cobbles'))); break;
            case 'plaza': case 'square': fillPoly(xy, mark(setG(village && kind === 'square' ? 'lawn' : 'flagstones'))); break;
            case 'green': fillPoly(xy, mark(setG('lawn'))); break;
            case 'graveyard': fillPoly(xy, mark(setG('grave_ground'))); break;
            case 'pier': fillPoly(xy, mark(setG('planks'))); break;
            case 'bridge': fillPoly(xy, mark(setG('bridge'))); break;
            case 'mound': fillPoly(xy, mark(setG('mound'))); break;
            case 'spoil': fillPoly(xy, mark(setG('spoil'))); break;
            case 'ditch': fillPoly(xy, mark(setG('ditch'))); break;
            case 'canal': fillPoly(xy, mark(setG('water_shallow'))); break;
            case 'ruin': fillPoly(xy, mark((k) => {
              ground[k] = G('dirt');
              object[k] = rnd01(seed, tx0 + (k % CHUNK), ty0 + Math.floor(k / CHUNK), 31) < 0.35 ? O('rubble') : 0;
              built[k] = 1;
            }));
              line(xy, 0.4, setO('ruin_wall'), 1.07);
              break;
            case 'pyramid': fillPoly(xy, mark(setO('pyramid'))); break;
            case 'trunk': fillPoly(xy, mark(setO('great_trunk'))); break;
            case 'boat': fillPoly(xy, setO('boat')); break;
            case 'stall': fillPoly(xy, setO('stall')); break;
            case 'tent': fillPoly(xy, setO('tent')); break;
            case 'wagon': fillPoly(xy, setO('wagon')); break;
            case 'horse': fillPoly(xy, setO('horse')); break;
            case 'grave': fillPoly(xy, setO('grave')); break;
            default: break; // canopy, platform, walkway, underhall: above or below the ground
          }
        } else if (it.type === 'LineString') {
          switch (kind) {
            case 'street': line(xy, 3, mark(setG('cobbles'))); break;
            case 'road': line(xy, (ROAD_W[String(p.cls ?? '')] ?? 3.5) / 2, mark(setG(village ? 'road' : p.cls === 'track' ? 'track' : 'road'))); break;
            case 'trodden': line(xy, 0.8, mark(setG('path'))); break;
            case 'wall': {
              const w = Number(p.w ?? 2);
              const wallId = O(village && w < 2 ? 'palisade' : 'town_wall'), gate = O('gate_open');
              const onWay = new Set([G('road'), G('cobbles'), G('track'), G('path'), G('bridge')]);
              // Where a street, road or path runs through the wall, a gate (open by day).
              const cr = crossings(xy);
              line(xy, w / 2, (k) => {
                if (isWaterTile(k)) return;
                object[k] = onWay.has(ground[k]) || atCrossing(cr, k) || nearWay(k, 0.5) ? gate : wallId;
                built[k] = 1;
              }, 1.07);
              break;
            }
            case 'hedge': gapped(xy, 'hedge', (it.i * 7.3) % GAP_EVERY); break;
            case 'picket': gapped(xy, 'fence', (it.i * 5.1) % GAP_EVERY); break;
            case 'furrow': line(xy, 0.3, setO('crops', true), 0.5); break;
            case 'vinerow': line(xy, 0.3, setO('vines', true), 0.5); break;
            case 'ditch': line(xy, 1, setG('ditch')); break;
            case 'canal': line(xy, 2, setG('water_shallow')); break;
            default: break; // contours and sails
          }
        } else {
          const x = xy[0], y = xy[1], r = Number(p.r ?? 0);
          switch (kind) {
            case 'tree': disc(x, y, 0, (k) => {
              object[k] = O(treeName(k, tx0 + (k % CHUNK), ty0 + Math.floor(k / CHUNK)));
              built[k] = 1;
            }); break;
            case 'well': disc(x, y, 0, setO('well')); break;
            case 'fountain': disc(x, y, Math.min(r, 4), setO('fountain')); break;
            case 'tower': {
              // Towers stand either side of a gate: they do not close the way through it.
              const id = O('tower'), onWay = new Set([G('road'), G('cobbles'), G('track'), G('path')]);
              disc(x, y, Math.min(r, 6), (k) => {
                if (isWaterTile(k) || onWay.has(ground[k]) || nearWay(k, 0.3)) return;
                object[k] = id;
                built[k] = 1;
              });
              break;
            }
            case 'menhir': disc(x, y, 0, setO('menhir')); break;
            case 'totem': disc(x, y, 0, setO('totem')); break;
            case 'fire': disc(x, y, 0, setO('campfire')); break;
            case 'logs': disc(x, y, 0, setO('woodpile')); break;
            case 'millwheel': disc(x, y, 0, setO('millwheel')); break;
            case 'mine': disc(x, y, 0, setO('mine_entrance')); break;
            case 'dentry': {
              const tx = Math.floor(x / TILE_M), ty = Math.floor(-y / TILE_M);
              if (tx >= tx0 && ty >= ty0 && tx < tx0 + CHUNK && ty < ty0 + CHUNK) {
                const k = (ty - ty0) * CHUNK + (tx - tx0);
                object[k] = O('dungeon_entrance');
                built[k] = 1;
                sites.push({ tx, ty, kind: String(p.dkind ?? 'dungeon'), name: String(p.name ?? ''), id: String(p.did ?? '') });
              }
              break;
            }
            default: break; // labels
          }
        }
      }
    }

    // ---- Buildings: interiors first, then walls (an older building keeps its rooms where two
    // meet), then doors and windows.
    brs.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
    const owner = new Int32Array(N).fill(-1);
    const each = (br: BuildingRaster, fn: (k: number, bk: number) => void) => {
      const xA = Math.max(0, br.x0 - tx0), xB = Math.min(CHUNK, br.x0 + br.w - tx0);
      const yA = Math.max(0, br.y0 - ty0), yB = Math.min(CHUNK, br.y0 + br.h - ty0);
      for (let y = yA; y < yB; y++) for (let x = xA; x < xB; x++) fn(y * CHUNK + x, (y + ty0 - br.y0) * br.w + (x + tx0 - br.x0));
    };
    brs.forEach((br, bi) => each(br, (k, bk) => {
      if (br.kind[bk] !== B_FLOOR) return;
      ground[k] = br.floor;
      object[k] = br.obj[bk];
      area[k] = areaOf(br.room[bk] >= 0 ? br.areas[br.room[bk]] : br.areas[br.areas.length - 1]);
      built[k] = 1;
      owner[k] = bi;
    }));
    brs.forEach((br, bi) => each(br, (k, bk) => {
      const t = br.kind[bk];
      if (t === B_OUT || t === B_FLOOR) return;
      // An outer wall does not cut into an older neighbour's rooms; walls between rooms always stand.
      const inner = br.room[bk] >= 0 || owner[k] === bi;
      if (!inner && owner[k] >= 0 && owner[k] < bi) return;
      if (owner[k] < 0) area[k] = areaOf(br.areas[br.areas.length - 1]);
      ground[k] = br.floor;
      object[k] = br.wall;
      built[k] = 1;
    }));
    brs.forEach((br, bi) => each(br, (k, bk) => {
      const t = br.kind[bk];
      if (t === B_OUT || t === B_FLOOR || t === B_WALL) return;
      if (br.room[bk] < 0 && owner[k] >= 0 && owner[k] < bi) return;
      if (t === B_DOOR) object[k] = O('door');
      else if (t === B_WINDOW) object[k] = O('window');
      else if (t === B_DOORWAY) object[k] = 0;
      else return;
      ground[k] = br.floor;
    }));

    // ---- Caves, crypts and ruins in the wild.
    for (const [bx, by] of blocks) {
      const blk = this.towns.blockAt(bx, by);
      const marks: { lon: number; lat: number; kind: string; name: string; id: string; obj: string }[] = [];
      for (const l of blk.lairs) if (l.kind === 'cave' || l.kind === 'deep') marks.push({ lon: l.lon, lat: l.lat, kind: l.kind, name: l.en ?? l.name, id: l.id, obj: 'cave_mouth' });
      for (const dg of blk.dungeons) if (!dg.town) marks.push({ lon: dg.lon, lat: dg.lat, kind: dg.kind, name: dg.en ?? dg.name, id: dg.id, obj: dg.kind === 'mine' ? 'mine_entrance' : 'dungeon_entrance' });
      for (const m of marks) {
        const [tx, ty] = this.tileAt(m.lon, m.lat);
        // A ring of rock round a cave, broken walls round a ruin's way down.
        const ring = m.obj === 'cave_mouth' ? O('boulder') : m.obj === 'dungeon_entrance' ? O('ruin_wall') : O('woodpile');
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const x = tx + dx - tx0, y = ty + dy - ty0;
          if (x < 0 || y < 0 || x >= CHUNK || y >= CHUNK) continue;
          const k = y * CHUNK + x;
          if (isWaterTile(k)) continue;
          const r = Math.max(Math.abs(dx), Math.abs(dy));
          object[k] = r === 0 ? O(m.obj) : r === 2 && rnd01(seed, tx + dx, ty + dy, 41) < 0.45 ? ring : 0;
          built[k] = 1;
          if (r === 0) area[k] = areaOf(m.name);
        }
        if (tx >= tx0 && ty >= ty0 && tx < tx0 + CHUNK && ty < ty0 + CHUNK) sites.push({ tx, ty, kind: m.kind, name: m.name, id: m.id });
      }
    }

    // ---- Wild plants on unmade ground.
    for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
      const k = y * CHUNK + x;
      if (built[k] || object[k]) continue;
      const cv = covers[k];
      const gd = GROUND_TILES[ground[k]];
      if (!cv || gd.water) continue;
      const tx = tx0 + x, ty = ty0 + y;
      const px = (tx + 0.5) * TILE_M, py = -(ty + 0.5) * TILE_M;
      // Cleared land round settlements.
      let near = 1;
      for (const s of nearSite) {
        const dx = px - s.x, dy = py - s.y, r = s.r * 1.15;
        if (dx * dx + dy * dy < r * r) near = 0.12;
      }
      const r1 = rnd01(seed, tx, ty, 11);
      const pTree = (cv.open + (cv.dense - cv.open) * forest[k]) * near;
      if (cv.trees.length && r1 < pTree && gd.name !== 'rock' && gd.name !== 'scree' && gd.name !== 'snow') {
        object[k] = O(pick(cv.trees, rnd01(seed, tx, ty, 12)));
        continue;
      }
      const r2 = rnd01(seed, tx, ty, 13);
      let acc = 0;
      const bankK = (y + PAD) * P + x + PAD;
      const small: [string, number][] = bank[bankK] < 4 && half[bankK] > 0 && !COLD.has(biomes[k]) ? [['reeds', 0.15], ...cv.small] : cv.small;
      for (const [nm, pr] of small) {
        acc += pr * (near < 1 ? 0.5 : 1);
        if (r2 < acc) {
          object[k] = O(nm);
          break;
        }
      }
    }

    return { cx, cy, ground, object, area, areas, elev, sites, ms: performance.now() - t0 };
  }

  /**
   * Where a game starts: the open tile on a street or square nearest the settlement's centre
   * (the frame's origin), searched chunk by chunk outwards.
   */
  startTile(): [number, number] {
    const good = new Set(['cobbles', 'flagstones', 'road', 'track', 'path', 'lawn', 'yard', 'grass', 'dirt']);
    let best: [number, number] | null = null, bestD = Infinity;
    for (let r = 0; r <= 3 && !best; r++) {
      for (let cy = -1 - r; cy <= r; cy++) for (let cx = -1 - r; cx <= r; cx++) {
        if (Math.max(Math.abs(cx + 0.5), Math.abs(cy + 0.5)) !== r + 0.5) continue;
        const c = this.chunk(cx, cy);
        for (let k = 0; k < CHUNK * CHUNK; k++) {
          if (c.object[k] || !good.has(GROUND_TILES[c.ground[k]].name)) continue;
          const tx = cx * CHUNK + (k % CHUNK), ty = cy * CHUNK + Math.floor(k / CHUNK);
          const d = tx * tx + ty * ty + (GROUND_TILES[c.ground[k]].name === 'grass' ? 4e4 : 0);
          if (d < bestD) {
            bestD = d;
            best = [tx, ty];
          }
        }
      }
    }
    return best ?? [0, 0];
  }
}

function pointInPoly(xy: number[], px: number, py: number): boolean {
  let c = false;
  const m = xy.length / 2;
  for (let i = 0, j = m - 1; i < m; j = i++) {
    const xi = xy[2 * i], yi = xy[2 * i + 1], xj = xy[2 * j], yj = xy[2 * j + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const squaredCache = new WeakMap<LocalItem, { xy: number[]; unturn: (x: number, y: number) => [number, number] }>();

/**
 * A building's footprint turned about its centre so that its longest wall runs along the tile
 * grid: on 1.5 m tiles a slanting wall is a staircase that is hard to walk along and to find the
 * doors in. The floor plan turns with it (`unturn` maps a point back to the plan).
 */
function squared(it: LocalItem): { xy: number[]; unturn: (x: number, y: number) => [number, number] } {
  const hit = squaredCache.get(it);
  if (hit) return hit;
  const xy = it.xy;
  // The ring repeats its first point at the end.
  const m = xy.length / 2 - (xy[0] === xy[xy.length - 2] && xy[1] === xy[xy.length - 1] ? 1 : 0);
  let cx = 0, cy = 0;
  for (let i = 0; i < m; i++) {
    cx += xy[2 * i] / m;
    cy += xy[2 * i + 1] / m;
  }
  let ux = 1, uy = 0, best = 0;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const dx = xy[2 * j] - xy[2 * i], dy = xy[2 * j + 1] - xy[2 * i + 1], l2 = dx * dx + dy * dy;
    if (l2 > best) {
      best = l2;
      const l = Math.sqrt(l2);
      ux = dx / l;
      uy = dy / l;
    }
  }
  // The turn (c, s) that takes the wall's direction to the nearest axis.
  let c = 1, s = 0, bd = -2;
  for (const [ax, ay] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    const dot = ux * ax + uy * ay;
    if (dot > bd) {
      bd = dot;
      c = dot;
      s = ux * ay - uy * ax;
    }
  }
  const out: number[] = [];
  for (let i = 0; i < xy.length; i += 2) {
    const dx = xy[i] - cx, dy = xy[i + 1] - cy;
    out.push(cx + c * dx - s * dy, cy + s * dx + c * dy);
  }
  const r = { xy: out, unturn: (x: number, y: number): [number, number] => [cx + c * (x - cx) + s * (y - cy), cy - s * (x - cx) + c * (y - cy)] };
  squaredCache.set(it, r);
  return r;
}

/** Where segments ab and cd cross, if they do. */
function segCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): [number, number] | null {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (den === 0) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den, u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [ax + rx * t, ay + ry * t] : null;
}

function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  const ex = ax + dx * t - px, ey = ay + dy * t - py;
  return ex * ex + ey * ey;
}

function pick(list: [string, number][], r: number): string {
  let tot = 0;
  for (const [, w] of list) tot += w;
  let acc = 0;
  for (const [nm, w] of list) {
    acc += w / tot;
    if (r < acc) return nm;
  }
  return list[list.length - 1][0];
}

/** A short hash of a chunk's tiles (for the determinism check across engines). */
export function chunkHash(c: Chunk): string {
  let h = 0x811c9dc5;
  const mix = (b: number) => {
    h ^= b & 0xff;
    h = Math.imul(h, 16777619);
  };
  for (const a of [c.ground, c.object]) for (let i = 0; i < a.length; i++) mix(a[i]);
  for (let i = 0; i < c.area.length; i++) {
    mix(c.area[i]);
    mix(c.area[i] >> 8);
  }
  for (let i = 0; i < c.elev.length; i++) {
    mix(c.elev[i]);
    mix(c.elev[i] >> 8);
  }
  const s = c.areas.join('|') + JSON.stringify(c.sites);
  for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i));
  return (h >>> 0).toString(16).padStart(8, '0');
}
