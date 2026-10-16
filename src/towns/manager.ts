import { distKm, pxPerMeterZ20, smoothstep } from '../gen/grid';
import { hash32, hashString, mulberry32 } from '../gen/rng';
import { CLIMATE, SETTLEMENTS as S } from '../gen/config';
import { DetailSampler } from '../gen/detail';
import { Biome } from '../gen/biomes';
import { chaikin } from '../gen/rivers';
import { RiverIndex } from '../gen/river-index';
import {
  type RoadClass, type RoadFeature, type Settlement, type VillageKind, habitability, makeSettlement, trimEnds,
} from '../gen/settlements';
import type { GeneratedWorld } from '../gen/world';
import type { Pt } from './geom';
import { LocalFrame, type PlanFeature, PlanOut } from './plan';
import { LAND, LocalTerrain, RIVER, SEA } from './terrain';
import { buildCity } from './city';
import { buildVillage, secretWell } from './village';
import { Ground } from './ground';
import { NameBank, type Named, dungeonName, lairName } from '../names/names';
import { type DungeonSite, packLines, sewerScale, townUnderground } from '../dungeons/core';
import type { LairSite } from '../lairs/lair';
import { loreFor } from '../lore/realm';
import { CULTURES } from '../names/cultures';

/** Zoom from which regional villages are generated, and town / village plans. */
export const VILLAGE_ZOOM = 7.5;
export const TOWN_PLAN_ZOOM = 11.5;
export const VILLAGE_PLAN_ZOOM = 12.5;
const MAX_PLANS = 40;
const LAPSE = CLIMATE.lapseRateCPerKm / 1000;
const FOREST_BIOMES = new Set([
  Biome.BorealForest, Biome.TemperateForest, Biome.TemperateRainforest, Biome.TropicalRainforest, Biome.TropicalDryForest, Biome.MontaneForest,
]);

const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** Lon/lat point bins for radius queries in km (wraps east-west). */
class PointIndex<T> {
  private bins = new Map<number, { lon: number; lat: number; v: T }[]>();
  private nX: number;

  constructor(private cellDeg: number) {
    this.nX = Math.round(360 / cellDeg);
  }

  private key(ix: number, iy: number) {
    return iy * this.nX + ((ix % this.nX) + this.nX) % this.nX;
  }

  add(lon: number, lat: number, v: T): void {
    lon = wrapLon(lon);
    const k = this.key(Math.floor((lon + 180) / this.cellDeg), Math.floor((lat + 90) / this.cellDeg));
    const b = this.bins.get(k);
    if (b) b.push({ lon, lat, v });
    else this.bins.set(k, [{ lon, lat, v }]);
  }

  forEach(lon: number, lat: number, km: number, cb: (v: T, d: number, lon: number, lat: number) => void): void {
    const dLat = km / 111.2;
    const maxLat = Math.min(89, Math.abs(lat) + dLat);
    const dLon = Math.min(180, km / (111.2 * Math.cos((maxLat * Math.PI) / 180)));
    const iy0 = Math.floor((lat - dLat + 90) / this.cellDeg), iy1 = Math.floor((lat + dLat + 90) / this.cellDeg);
    const lonW = wrapLon(lon);
    const ix0 = Math.floor((lonW - dLon + 180) / this.cellDeg), ix1 = Math.min(ix0 + this.nX - 1, Math.floor((lonW + dLon + 180) / this.cellDeg));
    for (let iy = iy0; iy <= iy1; iy++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        for (const e of this.bins.get(this.key(ix, iy)) ?? []) {
          const d = distKm(lon, lat, e.lon, e.lat);
          if (d <= km) cb(e.v, d, e.lon, e.lat);
        }
      }
    }
  }

  nearest(lon: number, lat: number, km: number, filter?: (v: T) => boolean) {
    let best: { v: T; d: number; lon: number; lat: number } | null = null;
    this.forEach(lon, lat, km, (v, d, x, y) => {
      if ((!best || d < best.d) && (!filter || filter(v))) best = { v, d, lon: x, lat: y };
    });
    return best as { v: T; d: number; lon: number; lat: number } | null;
  }
}

interface Block {
  villages: Settlement[];
  tracks: RoadFeature[];
  /** Caves and glades. */
  lairs: LairSite[];
  /** Towers, crypts, ruins and mines. */
  dungeons: DungeonSite[];
}

/** A searchable village, cave or glade (sent from the towns worker). */
export interface IndexEntry {
  id: string;
  name: string;
  tier: 'village' | 'lair';
  kind: string;
  lon: number;
  lat: number;
  info?: string;
  /** The name in English, where it differs. */
  en?: string;
}

/** Spacing (km) of cave and glade candidates; only suitable ground keeps one (about one per 30–40 km there). */
const LAIR_SPACING_KM = 30;
/** Spacing (km) of tower, crypt and ruin candidates (most are kept on land, so roughly one per 45 km). */
const DUNGEON_SPACING_KM = 45;

export interface TownUpdate {
  villagesChanged: boolean;
  plansChanged: boolean;
  pending: boolean;
}

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

type FC<F> = { type: 'FeatureCollection'; features: F[] };

/** The parts of a generated world the town manager needs (posted to its worker). */
/** What the towns need of the world; with `politics` (and `labels`), army camps stand on the borders of realms at war. */
export type TownWorld = Pick<GeneratedWorld, 'raster' | 'settlements' | 'roads' | 'rivers'> & Partial<Pick<GeneratedWorld, 'politics' | 'labels'>>;

/** A stretch of a front between realms at war, and the camp of one side's army behind it. */
interface FrontCamp {
  lon: number;
  lat: number;
  realm: string;
  war: string;
  culture: number;
  /** Strength of the host, by the realm's size. */
  men: number;
  seed: number;
}

/** City and town markers. */
export function siteFeatures(settlements: Settlement[]): FC<PlanFeature> {
  return {
    type: 'FeatureCollection',
    features: settlements.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: { id: s.id, tier: s.tier, population: s.population, name: s.name ?? '', ...(s.nameEn && s.nameEn !== s.name ? { en: s.nameEn } : {}) },
    })),
  };
}

/**
 * Everything below world scale, run in the towns worker: villages and their tracks
 * (generated per 1° block on demand, deterministically) and town / village plans for
 * settlements in view at high zoom.
 */
export class TownManager {
  readonly sampler: DetailSampler;
  readonly names: NameBank;
  private sites = new PointIndex<Settlement>(1);
  private roadPts = new PointIndex<null>(0.25);
  private exits = new Map<string, { ll: number[]; cls: RoadClass }[]>();
  private blocks = new Map<number, Block>();
  private plans = new Map<string, PlanFeature[]>();
  /** Villages' names before they were dressed ("Ashby" of "Ashby Mine"). */
  private baseNames = new Map<string, Named>();
  /** Army camps behind the fronts of today's wars, by 1° block key (made on first use). */
  private camps: Map<number, FrontCamp[]> | null = null;

  constructor(private world: TownWorld) {
    this.sampler = new DetailSampler(world.raster, new RiverIndex(world.rivers, world.raster.seed));
    this.names = new NameBank(world.raster.seed, false);
    for (const s of world.settlements) this.sites.add(s.lon, s.lat, s);
    for (const f of world.roads.features) {
      const c = f.geometry.coordinates;
      for (const p of c) this.roadPts.add(p[0], p[1], null);
      this.addExit(f.properties.a, c[0], f.properties.cls);
      this.addExit(f.properties.b, c[c.length - 1], f.properties.cls);
    }
  }

  /** Village markers and tracks generated so far. */
  villageFeatures(): FC<PlanFeature | RoadFeature> {
    const features: (PlanFeature | RoadFeature)[] = [];
    for (const b of this.blocks.values()) {
      features.push(...b.tracks);
      for (const l of b.lairs) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [l.lon, l.lat] },
          properties: { id: l.id, tier: 'lair', kind: l.kind, name: l.name, ...(l.en && l.en !== l.name ? { en: l.en } : {}), seed: l.seed, tags: l.tags.join(',') },
        });
      }
      for (const d of b.dungeons) {
        // Mines are drawn on their camp's plan, not as a site of their own.
        if (d.town) continue;
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [d.lon, d.lat] },
          properties: { id: d.id, tier: 'lair', kind: d.kind, name: d.name, ...(d.en && d.en !== d.name ? { en: d.en } : {}), seed: d.seed, tags: d.tags.join(','), culture: d.culture },
        });
      }
      for (const v of b.villages) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
          properties: {
            id: v.id, tier: 'village', kind: v.kind ?? 'farming', population: v.population, name: v.name ?? '', ...(v.nameEn && v.nameEn !== v.name ? { en: v.nameEn } : {}),
            ...(v.army ? { realm: v.army.realm, war: v.army.war } : {}),
          },
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }

  planFeatures(): FC<PlanFeature> {
    const features: PlanFeature[] = [];
    for (const f of this.plans.values()) features.push(...f);
    return { type: 'FeatureCollection', features };
  }

  /** Generates what the view needs, for up to `budgetMs`; `pending` means call again. */
  update(b: Bounds, zoom: number, budgetMs = 30): TownUpdate {
    const t0 = performance.now();
    const res: TownUpdate = { villagesChanged: false, plansChanged: false, pending: false };
    const overBudget = () => performance.now() - t0 > budgetMs;
    if (zoom < VILLAGE_ZOOM || b.east - b.west > 60) return res;

    for (let by = Math.floor(b.south); by <= Math.floor(b.north); by++) {
      for (let bx = Math.floor(b.west); bx <= Math.floor(b.east); bx++) {
        if (this.hasBlock(bx, by)) continue;
        if (overBudget()) return { ...res, pending: true };
        this.block(bx, by);
        res.villagesChanged = true;
      }
    }
    if (zoom < TOWN_PLAN_ZOOM) return res;

    const cLon = (b.west + b.east) / 2, cLat = (b.south + b.north) / 2;
    const want: Settlement[] = [];
    const inView = (s: Settlement) => {
      const padLat = s.radiusM / 111200, padLon = padLat / Math.max(0.05, Math.cos((s.lat * Math.PI) / 180));
      const lon = wrapLon(s.lon - cLon) + cLon;
      return lon + padLon > b.west && lon - padLon < b.east && s.lat + padLat > b.south && s.lat - padLat < b.north;
    };
    const radiusKm = distKm(b.west, b.south, b.east, b.north) / 2 + 5;
    this.sites.forEach(cLon, cLat, radiusKm, (s) => inView(s) && want.push(s));
    if (zoom >= VILLAGE_PLAN_ZOOM) {
      for (let by = Math.floor(b.south); by <= Math.floor(b.north); by++) {
        for (let bx = Math.floor(b.west); bx <= Math.floor(b.east); bx++) {
          for (const v of this.block(bx, by).villages) if (inView(v)) want.push(v);
        }
      }
    }
    for (const s of want) {
      if (this.plans.has(s.id)) continue;
      if (overBudget()) return { ...res, pending: true };
      // Tracks from neighbouring blocks may end at this settlement; generate them first.
      const bx = Math.floor(s.lon), by = Math.floor(s.lat);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.block(bx + dx, by + dy);
      this.plans.set(s.id, this.plan(s));
      res.plansChanged = true;
      res.villagesChanged = true;
    }
    if (this.plans.size > MAX_PLANS) {
      const keep = new Set(want.map((s) => s.id));
      for (const id of this.plans.keys()) {
        if (this.plans.size <= MAX_PLANS) break;
        if (!keep.has(id)) this.plans.delete(id);
      }
    }
    return res;
  }

  // ---- Search index -------------------------------------------------------------------------

  private indexQueue: number[] | null = null;
  private indexTotal = 0;
  private indexCenter: [number, number] = [0, 0];

  /**
   * Indexes villages, caves and glades across the world for search, a slice at a time, the
   * blocks nearest `center` first. Blocks are generated without their tracks and not kept
   * (they come out the same when the map later needs them).
   */
  indexStep(budgetMs: number, center: [number, number]): { entries: IndexEntry[]; done: number; total: number } {
    const t0 = performance.now();
    if (!this.indexQueue) {
      this.indexQueue = this.landBlocks();
      this.indexTotal = this.indexQueue.length;
      this.indexCenter = [Infinity, 0];
    }
    const q = this.indexQueue;
    // Re-sort what is left when the view has moved well away.
    if (Math.abs(center[0] - this.indexCenter[0]) + Math.abs(center[1] - this.indexCenter[1]) > 4) {
      this.indexCenter = center;
      const d = (k: number) => {
        const bx = (k % 360) - 180 + 0.5, by = Math.floor(k / 360) - 90 + 0.5;
        return distKm(center[0], center[1], bx, by);
      };
      q.sort((a, b) => d(b) - d(a));
    }
    const entries: IndexEntry[] = [];
    while (q.length && performance.now() - t0 < budgetMs) {
      const k = q.pop()!;
      const bx = (k % 360) - 180, by = Math.floor(k / 360) - 90;
      const key = this.blockKey(bx + 180, by + 90);
      const blk = this.blocks.get(key) ?? this.generateBlock(wrapLon(bx + 0.5) - 0.5, by, key, false);
      for (const v of blk.villages) {
        const info = v.army ? `${v.population.toLocaleString('en')} soldiers of ${v.army.realm}` : `${v.population.toLocaleString('en')} people`;
        entries.push({ id: v.id, name: v.name ?? '', tier: 'village', kind: v.kind ?? 'farming', lon: v.lon, lat: v.lat, info, ...(v.nameEn && v.nameEn !== v.name ? { en: v.nameEn } : {}) });
      }
      for (const l of blk.lairs) entries.push({ id: l.id, name: l.name, tier: 'lair', kind: l.kind, lon: l.lon, lat: l.lat, info: l.tags.join(' · '), ...(l.en && l.en !== l.name ? { en: l.en } : {}) });
      for (const d of blk.dungeons) entries.push({ id: d.id, name: d.name, tier: 'lair', kind: d.kind, lon: d.lon, lat: d.lat, info: d.tags.join(' · '), ...(d.en && d.en !== d.name ? { en: d.en } : {}) });
    }
    return { entries, done: this.indexTotal - q.length, total: this.indexTotal };
  }

  /** 1° blocks with any land, as by*360 + bx (both offset to start at 0). */
  private landBlocks(): number[] {
    const { W, H, height } = this.world.raster;
    const out: number[] = [];
    for (let by = 0; by < 180; by++) {
      for (let bx = 0; bx < 360; bx++) {
        let land = false;
        for (let a = 0; a < 4 && !land; a++) {
          for (let b = 0; b < 4 && !land; b++) {
            const lon = bx - 180 + (a + 0.5) / 4, lat = by - 90 + (b + 0.5) / 4;
            const i = Math.min(W - 1, Math.floor(((lon + 180) / 360) * W)), j = Math.min(H - 1, Math.floor(((90 - lat) / 180) * H));
            if (height[j * W + i] > 0) land = true;
          }
        }
        if (land) out.push(by * 360 + bx);
      }
    }
    return out;
  }

  private addExit(id: string, ll: number[], cls: RoadClass): void {
    if (!id) return;
    const list = this.exits.get(id);
    if (list) list.push({ ll, cls });
    else this.exits.set(id, [{ ll, cls }]);
    // A plan drawn before this road existed is stale.
    this.plans.delete(id);
  }

  private blockKey(bx: number, by: number) {
    return by * 360 + (((bx % 360) + 360) % 360);
  }

  private hasBlock(bx: number, by: number): boolean {
    return by < -90 || by >= 90 || this.blocks.has(this.blockKey(bx + 180, by + 90));
  }

  /** Villages of the 1° block whose south-west corner is (bx, by) degrees. */
  private block(bx: number, by: number): Block {
    if (by < -90 || by >= 90) return { villages: [], tracks: [], lairs: [], dungeons: [] };
    const key = this.blockKey(bx + 180, by + 90);
    let blk = this.blocks.get(key);
    if (!blk) {
      blk = this.generateBlock(wrapLon(bx + 0.5) - 0.5, by, key);
      this.blocks.set(key, blk);
    }
    return blk;
  }

  private generateBlock(lon0: number, lat0: number, key: number, withTracks = true): Block {
    const { raster } = this.world;
    const { W, H } = raster;
    const seed = hash32(hashString(raster.seed) ^ Math.imul(key + 1, 0x9e3779b1));
    const nLat = Math.max(1, Math.round(111.2 / S.villageSpacingKm));
    const nLon = Math.max(1, Math.round((111.2 * Math.cos(((lat0 + 0.5) * Math.PI) / 180)) / S.villageSpacingKm));
    const villages: Settlement[] = [];
    const tracks: RoadFeature[] = [];
    // Names given out in this block: neighbours never share one (later ones draw again).
    const used = new Set<string>();
    const sample = (f: Float32Array, lon: number, lat: number) => {
      const fx = ((lon + 180) / 360) * W - 0.5, fy = Math.min(H - 1.001, Math.max(0, ((90 - lat) / 180) * H - 0.5));
      const i0 = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i0, ty = fy - j0;
      const a = ((i0 % W) + W) % W, b2 = (a + 1) % W, r0 = j0 * W, r1 = Math.min(H - 1, j0 + 1) * W;
      return (f[r0 + a] * (1 - tx) + f[r0 + b2] * tx) * (1 - ty) + (f[r1 + a] * (1 - tx) + f[r1 + b2] * tx) * ty;
    };
    const cellOf = (lon: number, lat: number) => {
      const i = ((Math.floor(((lon + 180) / 360) * W) % W) + W) % W;
      return Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H))) * W + i;
    };

    for (let a = 0; a < nLon; a++) {
      for (let b = 0; b < nLat; b++) {
        const h0 = hash32(seed ^ ((a * 31 + b) * 0x9e3779b1));
        const rr = (k: number) => hash32(h0 ^ k) / 4294967296;
        const lon = lon0 + (a + 0.15 + 0.7 * rr(1)) / nLon;
        const lat = lat0 + (b + 0.15 + 0.7 * rr(2)) / nLat;
        const hGrid = sample(raster.height, lon, lat);
        if (hGrid < -50) continue;
        const h = this.sampler.height(lon, lat, 2);
        if (h <= 0) continue;
        const c = cellOf(lon, lat);
        if (raster.lakeDepth[c] > 0) continue;
        const dKm = 111.2 * (180 / H);
        const dLon = 180 / H / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
        const gx = (sample(raster.height, lon + dLon, lat) - sample(raster.height, lon - dLon, lat)) / (2 * dKm);
        const gy = (sample(raster.height, lon, lat + 180 / H) - sample(raster.height, lon, lat - 180 / H)) / (2 * dKm);
        const tMean = sample(raster.tempSea, lon, lat) - LAPSE * Math.max(0, h);
        const tWarm = sample(raster.tempWarm, lon, lat) - LAPSE * (h - Math.max(0, hGrid));
        const biome = raster.biome[c] as Biome;
        const base = habitability(tMean, tWarm, sample(raster.precip, lon, lat), h, Math.hypot(gx, gy), biome);
        const road = this.roadPts.nearest(lon, lat, S.villageLinkKm);
        const riverHit = this.sampler.riverBank(lon, lat, 12000);
        const river = riverHit ? { d: Math.max(0, riverHit.bankM) / 1000 } : null;
        // Camps go where ordinary villages can't: mines in the mountains, loggers in the forest.
        const mountain = biome === Biome.IceSheet ? 0 : smoothstep(800, 2000, h) * smoothstep(-2, 6, tWarm);
        // Sea or lake within ~8 km (coarse grid test; the fine shoreline is found later).
        const coastal = [3, 6, 8].some((km) => [0, 1, 2, 3, 4, 5, 6, 7].some((q) => {
          const kLat = km / 111.2, kLon = kLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
          const x = lon + Math.cos(q * 0.785) * kLon, y = lat + Math.sin(q * 0.785) * kLat;
          return sample(raster.height, x, y) < 20 || raster.lakeDepth[cellOf(x, y)] > 0;
        }));
        let kind: VillageKind;
        let score = base;
        let minePos: [number, number] | null = null;
        // The New World: fewer villages, and tribal ones, except round the Old World's colonies.
        const nwCell = raster.newWorld?.[c] === 1;
        let colonial = false;
        if (nwCell) {
          if (rr(9) > S.newWorldVillageShare) continue;
          this.sites.forEach(lon, lat, 60, (s) => {
            if (s.colony) colonial = true;
          });
        }
        if (nwCell && !colonial) {
          if (base <= 0) continue;
          score = base * (1 + 0.4 * Math.exp(-(river?.d ?? 99) / 4)) * (coastal ? 1.3 : 1);
          if (rr(3) > smoothstep(S.villageMinScore, S.villageMinScore + 0.5, score)) continue;
          kind = 'tribal';
        } else if (mountain > 0 && rr(5) < 0.35 * mountain && (minePos = this.mineSite(lon, lat))) kind = 'mining';
        else if (FOREST_BIOMES.has(biome) && base > 0.05 && rr(5) < 0.3) kind = 'logging';
        else {
          if (base <= 0) continue;
          score = base * (1 + 0.5 * Math.exp(-(road?.d ?? 99) / 6)) * (1 + 0.35 * Math.exp(-(river?.d ?? 99) / 4));
          if (coastal) score *= 1.6;
          if (rr(3) > smoothstep(S.villageMinScore, S.villageMinScore + 0.5, score)) continue;
          kind = 'farming';
        }
        let blocked = false;
        this.sites.forEach(lon, lat, 15, (s, d) => {
          if (d < s.radiusM / 1000 + 2.5) blocked = true;
        });
        if (blocked || villages.some((v) => distKm(lon, lat, v.lon, v.lat) < 4)) continue;
        if (this.sampler.isWater(lon, lat)) continue;
        let pos: [number, number] = minePos ?? [lon, lat];
        if (kind === 'farming') {
          const r6 = rr(6);
          const shore = r6 < 0.9 && coastal ? this.shoreline(lon, lat) : null;
          if (shore) {
            kind = 'fishing';
            pos = shore;
          } else if (r6 < 0.5 && this.isHighGround(lon, lat)) {
            kind = 'keep';
            pos = this.climb(lon, lat);
          } else if (r6 >= 0.72 && r6 < 0.75 && (road?.d ?? 99) < 3) {
            // A lowland keep guarding the road.
            kind = 'keep';
          } else if (r6 >= 0.75 && r6 < 0.77 + 0.04 * smoothstep(300, 1200, h)) {
            kind = 'monastery';
            // A quiet terrace or knoll: higher ground that is still level enough to build on.
            pos = this.bestNear(lon, lat, 1200, (x, y, hh, sl) => hh * 0.004 - 6 * Math.max(0, sl - 0.08));
          }
        }
        if (kind === 'farming' || kind === 'tribal' || (kind === 'keep' && pos[0] === lon && pos[1] === lat)) {
          // Farmers settle the flattest ground nearby; too steep everywhere and there is no village.
          pos = this.bestNear(lon, lat, 900, (x, y, hh, sl) => -sl - 0.00002 * distKm(lon, lat, x, y) * 1000);
          if (this.slopeAt(pos[0], pos[1]) > 0.16) continue;
        } else if (kind === 'logging') {
          pos = this.bestNear(lon, lat, 600, (x, y, hh, sl) => -Math.max(0, sl - 0.12));
          if (this.slopeAt(pos[0], pos[1]) > 0.35) continue;
        }
        if (this.sampler.isWater(pos[0], pos[1])) continue;
        const v = makeSettlement(
          'village', `v${key}_${villages.length}`, pos[0], pos[1], score, hash32(h0 ^ 7), kind === 'fishing', (river?.d ?? 99) < 1.5, kind,
        );
        const vn = this.villageName(v, cellOf(lon, lat), used);
        v.name = vn.name;
        v.nameEn = vn.en;
        villages.push(v);
        const track = withTracks ? this.track(v, road, villages, rr(4)) : null;
        if (track) tracks.push(track);
      }
    }
    for (const fc of this.frontCamps().get(key) ?? []) {
      // Camps keep clear of towns and villages, on level, dry ground.
      let blocked = false;
      this.sites.forEach(fc.lon, fc.lat, 15, (s, d) => {
        if (d < s.radiusM / 1000 + 2) blocked = true;
      });
      if (blocked || villages.some((v) => distKm(fc.lon, fc.lat, v.lon, v.lat) < 3)) continue;
      const pos = this.bestNear(fc.lon, fc.lat, 1500, (_x, _y, _h, sl) => -sl);
      if (this.sampler.isWater(pos[0], pos[1]) || this.slopeAt(pos[0], pos[1]) > 0.14) continue;
      const v = makeSettlement('village', `c${key}_${villages.length}`, pos[0], pos[1], 0, fc.seed, false, false, 'camp');
      v.population = fc.men;
      v.coreM = Math.sqrt(fc.men * 7.5) / 2;
      v.radiusM = v.coreM * 2.4 + 120;
      v.army = { realm: fc.realm, war: fc.war };
      const adj = CULTURES[fc.culture]?.name ?? '';
      v.name = v.nameEn = `the ${adj ? `${adj} ` : ''}War Camp`;
      villages.push(v);
      const track = withTracks ? this.track(v, this.roadPts.nearest(pos[0], pos[1], S.villageLinkKm), villages, hash32(fc.seed ^ 0x7ac) / 4294967296) : null;
      if (track) tracks.push(track);
    }
    const lairs = this.lairs(lon0, lat0, key, seed, villages, sample, cellOf, used);
    return { villages, tracks, lairs, dungeons: this.dungeons(lon0, lat0, key, seed, villages, lairs, cellOf, used) };
  }

  /**
   * Towers, crypts and ruins on a jittered ~45 km grid (towers on high ground, crypts and ruins
   * anywhere habitable), and a mine beside every mining camp, 1 to 4 levels deep.
   */
  private dungeons(
    lon0: number, lat0: number, key: number, seed: number, villages: Settlement[], lairs: LairSite[],
    cellOf: (lon: number, lat: number) => number, used: Set<string>,
  ): DungeonSite[] {
    const { raster } = this.world;
    const out: DungeonSite[] = [];
    const add = (kind: DungeonSite['kind'], lon: number, lat: number, h0: number, tags: string[], near?: Named) => {
      const c = cellOf(lon, lat);
      const culture = raster.culture[c] ?? 0;
      const id = `d${key}_${out.length}`;
      let nm: Named = { name: '', en: '' };
      for (let t = 0; t < 6 && (!nm.name || used.has(nm.name)); t++) nm = dungeonName(this.names, kind, culture, t ? `${id}#${t}` : id, t ? undefined : near);
      used.add(nm.name);
      out.push({ id, kind, name: nm.name, en: nm.en, seed: hash32(h0 ^ 0xd0d0), tags, lon, lat, culture });
    };
    // A well that leads down to something hidden: drawn on the village's plan, entered from its well.
    for (const v of villages) {
      if (!secretWell(v)) continue;
      const h0 = hash32(v.seed ^ 0x3e12);
      const rr = (k: number) => hash32(h0 ^ k) / 4294967296;
      const levels = rr(3) < 0.55 ? 1 : 2;
      add('well', v.lon, v.lat, h0, [rr(4) < 0.5 ? 'small' : 'medium', ...(rr(5) < 0.5 ? ['wet'] : []), ...(levels > 1 ? ['2 levels'] : [])], this.baseNames.get(v.id));
      out[out.length - 1].town = v.id;
    }
    for (const v of villages) {
      if (v.kind !== 'mining') continue;
      const h0 = hash32(v.seed ^ 0x313e);
      const rr = (k: number) => hash32(h0 ^ k) / 4294967296;
      // The mine opens at the camp itself: its plan draws the adit, and the entrance is marked there.
      const r = rr(3);
      const levels = r < 0.25 ? 1 : r < 0.6 ? 2 : r < 0.88 ? 3 : 4;
      const base = this.baseNames.get(v.id);
      add('mine', v.lon, v.lat, h0, [rr(4) < 0.3 ? 'abandoned' : 'worked', ...(rr(5) < 0.3 ? ['wet'] : []), ...(levels > 1 ? [`${levels} levels`] : [])], base);
      out[out.length - 1].town = v.id;
    }
    const nLat = Math.max(1, Math.round(111.2 / DUNGEON_SPACING_KM));
    const nLon = Math.max(1, Math.round((111.2 * Math.cos(((lat0 + 0.5) * Math.PI) / 180)) / DUNGEON_SPACING_KM));
    for (let a = 0; a < nLon; a++) {
      for (let b = 0; b < nLat; b++) {
        const h0 = hash32(seed ^ ((a * 71 + b + 9011) * 0x27d4eb2d));
        const rr = (k: number) => hash32(h0 ^ k) / 4294967296;
        if (rr(0) < 0.3) continue;
        const lon = lon0 + (a + 0.15 + 0.7 * rr(1)) / nLon;
        const lat = lat0 + (b + 0.15 + 0.7 * rr(2)) / nLat;
        const c = cellOf(lon, lat);
        if (raster.height[c] <= 0 || raster.lakeDepth[c] > 0 || (raster.biome[c] as Biome) === Biome.IceSheet) continue;
        const h = this.sampler.height(lon, lat, 2);
        if (h <= 0) continue;
        const hilly = smoothstep(200, 1200, h);
        const r = rr(3);
        // The New World has no towers or crypts, only the odd ruin of an older people.
        const nw = raster.newWorld?.[c] === 1;
        if (nw && rr(11) < 0.6) continue;
        const kind: DungeonSite['kind'] = nw ? 'ruin' : r < 0.2 + 0.25 * hilly ? 'tower' : r < 0.68 ? 'ruin' : 'crypt';
        let blocked = false;
        this.sites.forEach(lon, lat, 15, (s, d) => {
          if (d < s.radiusM / 1000 + 1.5) blocked = true;
        });
        if (blocked || villages.some((v) => distKm(lon, lat, v.lon, v.lat) < 2) || lairs.some((l) => distKm(lon, lat, l.lon, l.lat) < 3)) continue;
        // Towers on a rise; crypts and ruins on gentle ground.
        const [x, y] = kind === 'tower'
          ? this.bestNear(lon, lat, 1200, (_x, _y, hh, sl) => hh * 0.002 - 2 * Math.max(0, sl - 0.3))
          : this.bestNear(lon, lat, 900, (_x, _y, _h, sl) => -sl);
        if (this.sampler.isWater(x, y)) continue;
        const size = rr(6) < 0.35 ? 'small' : rr(6) < 0.8 ? 'medium' : 'large';
        const tags = [size];
        const lv = rr(7);
        if (kind === 'tower') {
          const floors = size === 'small' ? 2 + Math.floor(lv * 2) : size === 'medium' ? 3 + Math.floor(lv * 2) : 4 + Math.floor(lv * 2);
          tags.push(`${floors} floors`);
          if (rr(8) < 0.3) tags.push('ruined');
        } else if (kind === 'crypt') {
          const levels = size === 'large' ? (lv < 0.5 ? 2 : 3) : lv < 0.65 ? 1 : 2;
          if (levels > 1) tags.push(`${levels} levels`);
        } else {
          const levels = lv < 0.45 ? 1 : lv < 0.85 ? 2 : 3;
          if (levels > 1) tags.push(`${levels} levels`, 'cellars');
        }
        add(kind, x, y, h0, tags);
      }
    }
    return out;
  }

  /**
   * Caves and glades of a block on a jittered ~30 km grid: caves in hill and mountain country
   * (in the face of a slope), glades in the forests (on level ground). Each gets size and
   * character tags from its surroundings and a name in the local culture.
   */
  private lairs(
    lon0: number, lat0: number, key: number, seed: number, villages: Settlement[],
    sample: (f: Float32Array, lon: number, lat: number) => number, cellOf: (lon: number, lat: number) => number, used: Set<string>,
  ): LairSite[] {
    const { raster } = this.world;
    const out: LairSite[] = [];
    const nLat = Math.max(1, Math.round(111.2 / LAIR_SPACING_KM));
    const nLon = Math.max(1, Math.round((111.2 * Math.cos(((lat0 + 0.5) * Math.PI) / 180)) / LAIR_SPACING_KM));
    for (let a = 0; a < nLon; a++) {
      for (let b = 0; b < nLat; b++) {
        const h0 = hash32(seed ^ ((a * 53 + b + 7001) * 0x85ebca6b));
        const rr = (k: number) => hash32(h0 ^ k) / 4294967296;
        let lon = lon0 + (a + 0.1 + 0.8 * rr(1)) / nLon;
        let lat = lat0 + (b + 0.1 + 0.8 * rr(2)) / nLat;
        const c = cellOf(lon, lat);
        if (raster.height[c] <= 0 || raster.lakeDepth[c] > 0) continue;
        const h = this.sampler.height(lon, lat, 2);
        if (h <= 0) continue;
        const biome = raster.biome[c] as Biome;
        const precip = sample(raster.precip, lon, lat);
        const tWarm = sample(raster.tempWarm, lon, lat) - LAPSE * Math.max(0, h - Math.max(0, raster.height[c]));
        const forest = FOREST_BIOMES.has(biome);
        const hilly = smoothstep(250, 1400, h);
        // Woods along rivers and in scrub and savanna hold the odd glade too.
        const woods = forest ? 0.75 : biome === Biome.Riparian || biome === Biome.Shrubland || biome === Biome.Savanna ? 0.2 : 0;
        let kind: 'cave' | 'glade';
        if (rr(3) < woods) kind = 'glade';
        else if (biome !== Biome.IceSheet && rr(4) < 0.15 + 0.7 * hilly) kind = 'cave';
        else continue;
        let blocked = false;
        this.sites.forEach(lon, lat, 15, (s, d) => {
          if (d < s.radiusM / 1000 + 1.5) blocked = true;
        });
        if (blocked || villages.some((v) => distKm(lon, lat, v.lon, v.lat) < 2.5)) continue;
        // A cave opens in a hillside; a glade lies on level ground.
        [lon, lat] = kind === 'cave'
          ? this.bestNear(lon, lat, 1500, (x, y, hh, sl) => Math.min(sl, 0.6) - 2 * Math.max(0, sl - 0.9))
          : this.bestNear(lon, lat, 900, (x, y, hh, sl) => -sl);
        if (this.sampler.isWater(lon, lat)) continue;
        const size = rr(6) < 0.42 ? 'small' : rr(6) < 0.86 ? 'medium' : 'large';
        const tags = [size];
        const dry = precip < (kind === 'cave' ? 350 : 450) || tWarm > 30;
        if (kind === 'cave') {
          if (rr(7) < 0.15) tags.push('sealed');
          if (!dry && precip > 600 && rr(8) < 0.6) tags.push(rr(9) < 0.15 ? 'flooded' : 'wet');
          if (dry) tags.push('dry');
          // Levels: small caves one or two, medium up to three, large two to four.
          const r = rr(12);
          const levels = size === 'small' ? (r < 0.7 ? 1 : 2) : size === 'medium' ? (r < 0.4 ? 1 : r < 0.8 ? 2 : 3) : r < 0.35 ? 2 : r < 0.75 ? 3 : 4;
          if (levels > 1) tags.push(`${levels} levels`);
        } else {
          const river = this.sampler.riverBank(lon, lat, 3000);
          const options: [string, number][] = [
            ['tree', 3], ['stones', 1.5], ['camp', 1], ['ruins', 1], ['rocks', 1],
            ...(dry ? [] : [['pond', 2], ['stream', river ? 3 : 1], ['flowers', 1.5]] as [string, number][]),
          ];
          const nFeat = rr(10) < 0.6 ? 1 : 2;
          for (let q = 0; q < nFeat; q++) {
            const total = options.reduce((t, [, w]) => t + w, 0);
            let t = rr(20 + q) * total;
            const k = options.findIndex(([, w]) => (t -= w) < 0);
            if (k >= 0) tags.push(options.splice(k, 1)[0][0]);
          }
          if (dry) tags.push('dry');
        }
        const id = `l${key}_${out.length}`;
        let nm: Named = { name: '', en: '' };
        for (let t = 0; t < 6 && (!nm.name || used.has(nm.name)); t++) nm = lairName(this.names, kind, raster.culture[c] ?? 0, t ? `${id}#${t}` : id, tags);
        used.add(nm.name);
        out.push({ id, kind, name: nm.name, en: nm.en, seed: hash32(h0 ^ 0x1a17), tags, lon, lat });
      }
    }
    return out;
  }

  private cell(lon: number, lat: number): number {
    const { W, H } = this.world.raster;
    const i = ((Math.floor(((lon + 180) / 360) * W) % W) + W) % W;
    return Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H))) * W + i;
  }

  /**
   * Entrances below a town, drawn on its plan: sewer grates on the streets (near the centre under
   * a town; under a city, in each of the quarters its several sewers drain), and a catacomb stair
   * in the graveyard or beside the temple.
   */
  private underground(s: Settlement, out: PlanOut, frame: LocalFrame, water: (p: Pt) => boolean, culture: number): void {
    const under = townUnderground(s, (tpl) => this.names.named(culture, tpl, [{ name: s.name ?? '', en: s.nameEn ?? s.name ?? '' }]));
    if (!under.length) return;
    const rnd = mulberry32(s.seed ^ 0x5e3e);
    const local = (f: PlanFeature) => (f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : [f.geometry.coordinates])
      .map((c) => frame.fromLL(c[0], c[1]) as Pt);
    const streets = out.features.filter((f) => f.properties.kind === 'street').map(local);
    const centroid = (p: Pt[]): Pt => [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length];
    // Main grates of the sewers placed so far: each sewer's map keeps clear of the others.
    const mains: Pt[] = [];
    for (const u of under) {
      const seed = hash32(s.seed ^ (u.dkind === 'sewer' ? 0x5e3 + (u.k ?? 0) * 0x1001 : 0xca7));
      const props = { did: u.did, dkind: u.dkind, name: u.name, ...(u.en !== u.name ? { en: u.en } : {}), seed, tags: u.tags.join(','), culture, sid: s.id, ...(u.thieves ? { thieves: 1 } : {}) };
      if (u.dkind === 'sewer') {
        // The main grate: under a town, a street vertex 25 to 45 m from the centre; under a city,
        // the street vertex nearest the middle of the sewer's quarter. On dry ground.
        let g: Pt = [0, 0], bd = Infinity;
        const want = 25 + rnd() * 20;
        const r = s.coreM * (0.45 + 0.15 * rnd());
        const target: Pt | null = u.angle === undefined ? null : [Math.cos(u.angle) * r, Math.sin(u.angle) * r];
        const clear = 1.4 * 100 * sewerScale(s.tier, s.population);
        for (const pass of [0, 1]) {
          for (const l of streets) {
            for (const p of l) {
              if (water(p)) continue;
              // First pass: away from the other sewers' maps; failing that, as far from them as can be.
              const apart = mains.length ? Math.min(...mains.map((m) => Math.hypot(p[0] - m[0], p[1] - m[1]))) : Infinity;
              if (pass === 0 && apart < clear) continue;
              const d = pass === 1 ? -apart : target ? Math.hypot(p[0] - target[0], p[1] - target[1]) : Math.abs(Math.hypot(p[0], p[1]) - want);
              if (d < bd) {
                bd = d;
                g = p;
              }
            }
          }
          if (bd < Infinity) break;
        }
        mains.push(g);
        // Streets around it (relative to the grate, clipped to the sewer map: 96 x 72 m for a small
        // town, up to 1.8 times that for each of a great city's sewers).
        const sc = sewerScale(s.tier, s.population);
        const box = (p: Pt) => Math.abs(p[0] - g[0]) < 50 * sc && Math.abs(p[1] - g[1]) < 38 * sc;
        // More grates down from the streets under larger towns, spread over the map.
        const nGrates = s.tier === 'city' ? 1 + Math.floor(sc * 1.2) : s.population >= 6000 ? 1 : 0;
        const grates: Pt[] = [];
        const cand: Pt[] = [];
        for (const l of streets) {
          for (let q = 0; q + 1 < l.length; q++) {
            const a = l[q], b = l[q + 1];
            const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8));
            for (let t = 0; t <= n; t++) {
              const p: Pt = [a[0] + ((b[0] - a[0]) * t) / n, a[1] + ((b[1] - a[1]) * t) / n];
              if (Math.abs(p[0] - g[0]) < 42 * sc && Math.abs(p[1] - g[1]) < 30 * sc && !water(p)) cand.push(p);
            }
          }
        }
        for (let t = 0; t < nGrates; t++) {
          let best: Pt | null = null, bd = 22 * sc;
          for (const p of cand) {
            const d = Math.min(Math.hypot(p[0] - g[0], p[1] - g[1]), ...grates.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])));
            if (d > bd) {
              bd = d;
              best = p;
            }
          }
          if (!best) break;
          grates.push(best);
        }
        const near: number[][][] = [];
        for (const l of streets) {
          let run: number[][] = [];
          for (let k = 0; k < l.length; k++) {
            // Densify so clipping keeps the parts that cross the box.
            const a = l[k], b = l[k + 1] ?? l[k];
            const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4));
            for (let q = 0; q < (k + 1 < l.length ? n : 1); q++) {
              const p: Pt = [a[0] + ((b[0] - a[0]) * q) / n, a[1] + ((b[1] - a[1]) * q) / n];
              if (box(p)) run.push([p[0] - g[0], p[1] - g[1]]);
              else if (run.length) {
                if (run.length > 1) near.push(run);
                run = [];
              }
            }
          }
          if (run.length > 1) near.push(run);
        }
        // The outfall: the nearest water within 150 m (further under large towns).
        let outfall = '';
        for (let r = 10; r <= 150 * sc && !outfall; r += 10) {
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2;
            if (water([g[0] + Math.cos(a) * r, g[1] + Math.sin(a) * r])) {
              outfall = `${Math.round(Math.cos(a) * r)},${Math.round(Math.sin(a) * r)}`;
              break;
            }
          }
        }
        const more = { streets: packLines(near), outfall, scale: Math.round(sc * 100) / 100, grates: grates.map((p) => `${Math.round(p[0] - g[0])},${Math.round(p[1] - g[1])}`).join(';') };
        out.point('dentry', g, { ...props, ...more });
        // Every grate opens the same sewers.
        for (const p of grates) out.point('dentry', p, { ...props, ...more });
      } else {
        // Catacombs: under the graveyard, else beside the temple, else in the market.
        const yard = out.features.find((f) => f.properties.kind === 'graveyard');
        const temple = out.features.find((f) => f.properties.kind === 'building' && f.properties.use === 'temple');
        const plaza = out.features.find((f) => f.properties.kind === 'plaza');
        const f = yard ?? temple ?? plaza;
        out.point('dentry', f ? centroid(local(f)) : [0, 0], props);
      }
    }
  }

  /** The way into a mining camp's mine, marked at the mouth of its first adit on the camp's plan. */
  private mineEntry(s: Settlement, out: PlanOut, frame: LocalFrame, culture: number): void {
    let site: DungeonSite | undefined;
    for (const b of this.blocks.values()) {
      site = b.dungeons.find((d) => d.town === s.id);
      if (site) break;
    }
    if (!site) return;
    const adit = out.features.find((f) => f.properties.kind === 'mine');
    let p: Pt = [0, 0];
    if (adit && adit.geometry.type === 'Polygon') {
      const ring = adit.geometry.coordinates[0].slice(0, -1).map((c) => frame.fromLL(c[0], c[1]) as Pt);
      p = [ring.reduce((a, q) => a + q[0], 0) / ring.length, ring.reduce((a, q) => a + q[1], 0) / ring.length];
    }
    out.point('dentry', p, { did: site.id, dkind: 'mine', name: site.name, seed: site.seed, tags: site.tags.join(','), culture, sid: s.id });
  }

  /** The way down a village's secret well, marked at the well on its plan. */
  private wellEntry(s: Settlement, out: PlanOut, frame: LocalFrame, culture: number): void {
    let site: DungeonSite | undefined;
    for (const b of this.blocks.values()) {
      site = b.dungeons.find((d) => d.town === s.id && d.kind === 'well');
      if (site) break;
    }
    const well = out.features.find((f) => f.properties.kind === 'well');
    if (!site || !well || well.geometry.type !== 'Point') return;
    const c = well.geometry.coordinates;
    out.point('dentry', frame.fromLL(c[0], c[1]), { did: site.id, dkind: 'well', name: site.name, ...(site.en && site.en !== site.name ? { en: site.en } : {}), seed: site.seed, tags: site.tags.join(','), culture, sid: s.id });
  }

  /**
   * Army camps behind the fronts of today's wars: wherever two realms at war share a border,
   * each side camps a host every 40 km or so along it, some 8 km back from the line. Needs the
   * world's lore (its wars), which is built here on first use.
   */
  private frontCamps(): Map<number, FrontCamp[]> {
    if (this.camps) return this.camps;
    this.camps = new Map();
    const { politics, settlements, labels, raster } = this.world;
    if (!politics) return this.camps;
    const ctx = loreFor(`towns#${raster.seed}`, raster.seed, politics, settlements, labels?.features ?? []);
    const { L } = ctx;
    const units = politics.units;
    // Today's foes of each realm.
    const foes = new Map<number, Map<number, string>>();
    for (const w of L.wars) {
      if (w.end !== undefined) continue;
      for (const a of w.attackers) for (const d of w.defenders) {
        for (const [x, y] of [[a, d], [d, a]]) (foes.get(x) ?? foes.set(x, new Map()).get(x)!).set(y, w.name);
      }
    }
    if (!foes.size) return this.camps;
    const { W, H, baronyOf } = politics;
    const top = (c: number) => (baronyOf[c] >= 0 ? L.topOf[baronyOf[c]] : -1);
    const lonOf = (i: number) => ((i + 0.5) / W) * 360 - 180, latOf = (j: number) => 90 - ((j + 0.5) / H) * 180;
    // Border cells of each side, binned along the front in ~40 km stretches.
    const bins = new Map<string, { side: number; foe: number; n: number; lon: number; lat: number; dx: number; dy: number }>();
    const add = (c: number, n: number, side: number, foe: number) => {
      const i = c % W, j = (c / W) | 0, ni = n % W, nj = (n / W) | 0;
      const lon = lonOf(i), lat = latOf(j);
      const cosL = Math.max(0.1, Math.cos((lat * Math.PI) / 180));
      const key = `${side}:${foe}:${Math.floor(lat / 0.36)}:${Math.floor((lon * cosL) / 0.36)}`;
      const b = bins.get(key) ?? bins.set(key, { side, foe, n: 0, lon: 0, lat: 0, dx: 0, dy: 0 }).get(key)!;
      b.n++;
      b.lon += lon;
      b.lat += lat;
      let dI = i - ni;
      if (dI > W / 2) dI -= W;
      if (dI < -W / 2) dI += W;
      b.dx += dI * cosL;
      b.dy += nj - j;
    };
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const c = j * W + i, ta = top(c);
        const fa = ta >= 0 ? foes.get(ta) : undefined;
        if (!fa) continue;
        for (const n of [j * W + ((i + 1) % W), j + 1 < H ? c + W : -1]) {
          if (n < 0) continue;
          const tb = top(n);
          if (tb < 0 || !fa.has(tb)) continue;
          add(c, n, ta, tb);
          add(n, c, tb, ta);
        }
      }
    }
    for (const [key, b] of bins) {
      const h = hash32(hashString(`${raster.seed}#camp#${key}`));
      if (b.n < 2 || h / 4294967296 > 0.65) continue;
      // Back from the line, into the side's own land.
      const lat0 = b.lat / b.n, lon0 = b.lon / b.n, l = Math.hypot(b.dx, b.dy) || 1;
      const kLat = 8 / 111.2, kLon = kLat / Math.max(0.1, Math.cos((lat0 * Math.PI) / 180));
      const lon = wrapLon(lon0 + (b.dx / l) * kLon), lat = lat0 - (b.dy / l) * kLat;
      const u = units[b.side];
      const realmBaronies = L.baronies(b.side).length;
      const men = Math.round((400 + Math.min(2600, realmBaronies * 60) * (0.5 + (hash32(h ^ 1) / 4294967296))) / 50) * 50;
      const bk = this.blockKey(Math.floor(lon) + 180, Math.floor(lat) + 90);
      const list = this.camps.get(bk) ?? this.camps.set(bk, []).get(bk)!;
      list.push({ lon, lat, realm: u?.name ?? '', war: foes.get(b.side)?.get(b.foe) ?? '', culture: u?.culture ?? 0, men, seed: h });
    }
    return this.camps;
  }

  /** A village name in the local culture, dressed for its kind ("Ashby Keep", "Thorn Abbey"). */
  private villageName(v: Settlement, cell: number, used: Set<string>): Named {
    const { raster } = this.world;
    const ci = raster.culture[cell] ?? 0;
    const bi = raster.biome[cell] as Biome;
    const site = {
      coastal: v.coastal, river: v.river, high: raster.height[cell] > 800, forest: FOREST_BIOMES.has(bi), grass: bi === Biome.Grassland || bi === Biome.Savanna || bi === Biome.ColdDesert,
      marsh: bi === Biome.Wetland || bi === Biome.Mangrove, walls: false, city: false, kind: v.kind,
    };
    let n: Named = { name: '', en: '' };
    for (let t = 0; t < 6 && (!n.name || used.has(n.name)); t++) n = this.names.placeNamed(ci, t ? `${v.id}#${t}` : v.id, site);
    used.add(n.name);
    this.baseNames.set(v.id, n);
    const r = this.names.rng(`vk:${v.id}`)();
    const dress = (tpl: string) => this.names.named(ci, tpl, [n]);
    switch (v.kind) {
      case 'keep': return dress(r < 0.5 ? '{0} Keep' : r < 0.8 ? 'Castle {0}' : '{0} Tower');
      case 'monastery': return dress(r < 0.5 ? '{0} Abbey' : r < 0.8 ? '{0} Priory' : 'the Monastery of {0}');
      case 'mining': return r < 0.55 ? dress('{0} Mine') : r < 0.75 ? dress('{0} Diggings') : n;
      case 'logging': return r < 0.45 ? dress('{0} Camp') : n;
      default: return n;
    }
  }

  /** A point ~80 m back from the nearest sea or lake shore within 8 km, or null. */
  private shoreline(lon: number, lat: number): [number, number] | null {
    const kmLat = 1 / 111.2, kmLon = kmLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    const at = (a: number, d: number): [number, number] => [lon + Math.cos(a) * d * kmLon, lat + Math.sin(a) * d * kmLat];
    for (let d = 0.5; d <= 8; d += 0.5) {
      for (let q = 0; q < 16; q++) {
        const a = (q / 16) * 2 * Math.PI;
        if (!this.sampler.isWater(...at(a, d))) continue;
        for (let t = d; t >= 0; t -= 0.05) {
          if (!this.sampler.isWater(...at(a, t))) return at(a, Math.max(0, t - 0.08));
        }
        return null;
      }
    }
    return null;
  }

  /** Ground slope (m/m) over ~60 m, at full terrain detail (including carved river valleys). */
  private slopeAt(lon: number, lat: number, m = 60): number {
    const d = m / 111200, dx = d / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    const h = (x: number, y: number) => this.sampler.height(x, y, 0.02);
    return Math.hypot(h(lon + dx, lat) - h(lon - dx, lat), h(lon, lat + d) - h(lon, lat - d)) / (2 * m);
  }

  /** The best-scoring dry point on rings out to radiusM (the centre included). */
  private bestNear(
    lon: number, lat: number, radiusM: number, score: (lon: number, lat: number, h: number, slope: number) => number,
  ): [number, number] {
    const kLat = 1 / 111200, kLon = kLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    let best: [number, number] = [lon, lat];
    let bestS = -Infinity;
    for (const f of [0, 0.5, 1]) {
      const n = f === 0 ? 1 : 8;
      for (let q = 0; q < n; q++) {
        const a = (q / 8) * 2 * Math.PI + f * 0.6;
        const x = lon + Math.cos(a) * f * radiusM * kLon, y = lat + Math.sin(a) * f * radiusM * kLat;
        const hh = this.sampler.height(x, y, 0.02);
        if (hh <= 0 || this.sampler.isWater(x, y, hh)) continue;
        const sc = score(x, y, hh, this.slopeAt(x, y));
        if (sc > bestS) {
          bestS = sc;
          best = [x, y];
        }
      }
    }
    return best;
  }

  /**
   * A mining camp site within ~1.5 km: workable ground (slope under ~25%) right below the
   * steepest rise, so the adits can climb the hillside. Null if there is no real relief.
   */
  private mineSite(lon: number, lat: number): [number, number] | null {
    const kLat = 1 / 111200, kLon = kLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    const rise = (x: number, y: number, hh: number) => {
      let r = 0;
      for (let q = 0; q < 8; q++) {
        const a = (q / 8) * 2 * Math.PI;
        r = Math.max(r, this.sampler.height(x + Math.cos(a) * 400 * kLon, y + Math.sin(a) * 400 * kLat, 0.02) - hh);
      }
      return r;
    };
    let best: [number, number] | null = null;
    let bestS = 30;
    for (const f of [0, 0.5, 1]) {
      const n = f === 0 ? 1 : 8;
      for (let q = 0; q < n; q++) {
        const a = (q / 8) * 2 * Math.PI + f;
        const x = lon + Math.cos(a) * f * 1500 * kLon, y = lat + Math.sin(a) * f * 1500 * kLat;
        const hh = this.sampler.height(x, y, 0.02);
        if (hh <= 0 || this.sampler.isWater(x, y, hh)) continue;
        const sc = rise(x, y, hh) - 400 * Math.max(0, this.slopeAt(x, y) - 0.25);
        if (sc > bestS) {
          bestS = sc;
          best = [x, y];
        }
      }
    }
    return best;
  }

  /** Noticeably higher than the ground 3 km around (a hill or spur worth fortifying). */
  private isHighGround(lon: number, lat: number): boolean {
    const kmLat = 3 / 111.2, kmLon = kmLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    const hc = this.sampler.height(lon, lat, 0.05);
    let sum = 0;
    for (let q = 0; q < 8; q++) {
      const a = (q / 8) * 2 * Math.PI;
      sum += this.sampler.height(lon + Math.cos(a) * kmLon, lat + Math.sin(a) * kmLat, 0.05);
    }
    return hc - sum / 8 > 12;
  }

  /** Hill-climbs to the local summit in 250 m steps. */
  private climb(lon: number, lat: number): [number, number] {
    const kmLat = 0.25 / 111.2, kmLon = kmLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    let best = this.sampler.height(lon, lat, 0.05);
    for (let it = 0; it < 12; it++) {
      let moved = false;
      for (let q = 0; q < 8; q++) {
        const a = (q / 8) * 2 * Math.PI;
        const x = lon + Math.cos(a) * kmLon, y = lat + Math.sin(a) * kmLat;
        const hh = this.sampler.height(x, y, 0.05);
        if (hh > best) {
          best = hh;
          [lon, lat] = [x, y];
          moved = true;
        }
      }
      if (!moved) break;
    }
    return [lon, lat];
  }

  /** A winding track from a village to the nearest road, town or earlier village in its block. */
  private track(
    v: Settlement, road: { d: number; lon: number; lat: number } | null, blockVillages: Settlement[], r: number,
  ): RoadFeature | null {
    let target: { lon: number; lat: number; cost: number; s: Settlement | null } | null = road
      ? { lon: road.lon, lat: road.lat, cost: road.d, s: null }
      : null;
    const site = this.sites.nearest(v.lon, v.lat, S.villageLinkKm);
    if (site) {
      const cost = Math.max(0, site.d - site.v.radiusM / 1000) * 0.9;
      if (!target || cost < target.cost) target = { lon: site.v.lon, lat: site.v.lat, cost, s: site.v };
    }
    for (const o of blockVillages) {
      if (o === v) continue;
      const cost = distKm(v.lon, v.lat, o.lon, o.lat) * 1.1;
      if (cost <= S.villageLinkKm && (!target || cost < target.cost)) target = { lon: o.lon, lat: o.lat, cost, s: o };
    }
    if (!target) return null;

    const tLon = wrapLon(target.lon - v.lon) + v.lon;
    const dKm = distKm(v.lon, v.lat, target.lon, target.lat);
    const n = Math.max(2, Math.ceil(dKm / 0.4));
    const a1 = (r - 0.5) * 0.25, a2 = (hash32(Math.floor(r * 4294967296)) / 4294967296 - 0.5) * 0.12;
    const cosL = Math.max(0.05, Math.cos((v.lat * Math.PI) / 180));
    const ex = (tLon - v.lon) * cosL, ny = target.lat - v.lat;
    const len = Math.hypot(ex, ny) || 1;
    const pts: number[][] = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const off = len * (a1 * Math.sin(Math.PI * t) + a2 * Math.sin(2 * Math.PI * t));
      const lon = v.lon + (tLon - v.lon) * t + ((-ny / len) * off) / cosL;
      const lat = v.lat + ny * t + (ex / len) * off;
      const fromEnd = Math.min(t, 1 - t) * dKm;
      if (fromEnd > 0.3 && this.sampler.isWater(lon, lat)) return null;
      pts.push([lon, lat]);
    }
    const line = trimEnds(pts, v.radiusM / 1000, target.s ? target.s.radiusM / 1000 : 0);
    if (!line) return null;
    this.addExit(v.id, line[0], 'track');
    if (target.s) this.addExit(target.s.id, line[line.length - 1], 'track');
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: line },
      properties: { cls: 'track', a: v.id, b: target.s?.id ?? '', ppm20: pxPerMeterZ20(v.lat) },
    };
  }

  private plan(s: Settlement): PlanFeature[] {
    const frame = new LocalFrame(s.lon, s.lat);
    const out = new PlanOut(frame, pxPerMeterZ20(s.lat), { sid: s.id, tier: s.tier, ctx: s.tier === 'village' ? s.kind ?? 'farming' : 'ward' });
    const exits = (this.exits.get(s.id) ?? []).map((e) => ({ p: frame.fromLL(e.ll[0], e.ll[1]), cls: e.cls }));
    // Plans keep 8 m clear of the true river bank (the same tapered width the tiles draw).
    const inRiver = (p: Pt) => {
      const ll = frame.toLL(p);
      const hit = this.sampler.riverBank(ll[0], ll[1], 8);
      return !!hit && hit.bankM < 8;
    };
    const water = (p: Pt) => {
      if (inRiver(p)) return true;
      const ll = frame.toLL(p);
      return this.sampler.isWater(ll[0], ll[1]);
    };
    const cs = s.tier === 'city' ? 20 : s.tier === 'town' ? 15 : 10;
    const terrain = new LocalTerrain(
      s.radiusM * 1.15, cs,
      (p) => {
        const ll = frame.toLL(p);
        return this.sampler.height(ll[0], ll[1]);
      },
      (p, h) => {
        if (inRiver(p)) return RIVER;
        const ll = frame.toLL(p);
        return this.sampler.isWater(ll[0], ll[1], h) ? SEA : LAND;
      },
    );
    const ground = new Ground(terrain, water);
    const culture = this.world.raster.culture[this.cell(s.lon, s.lat)] ?? 0;
    const inp = { s, exits, water, terrain, ground, out, names: this.names, culture };
    if (s.tier === 'village' || s.kind === 'tribal') {
      // Villages, and the New World's tribal towns, are built as villages.
      buildVillage(inp);
      if (s.kind === 'mining') this.mineEntry(s, out, frame, culture);
      if (secretWell(s)) this.wellEntry(s, out, frame, culture);
    } else {
      buildCity(inp);
      this.underground(s, out, frame, water, culture);
    }

    // Contours show the lie of the land; the interval adapts to the relief.
    let lo = Infinity, hi = -Infinity;
    terrain.h.forEach((h, k) => {
      if (terrain.w[k] === LAND) {
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    });
    const relief = hi - lo;
    if (relief > 3) {
      const interval = relief < 30 ? 2.5 : relief < 120 ? 5 : relief < 300 ? 10 : 20;
      for (const line of terrain.contours(interval, s.radiusM)) {
        if (line.length >= 3) out.line('contour', chaikin(line, 2) as Pt[]);
      }
    }
    return out.features;
  }
}
