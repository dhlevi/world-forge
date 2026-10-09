import { distKm, pxPerMeterZ20, smoothstep } from '../gen/grid';
import { hash32, hashString } from '../gen/rng';
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
import { buildVillage } from './village';
import { Ground } from './ground';

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
}

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
export type TownWorld = Pick<GeneratedWorld, 'raster' | 'settlements' | 'roads' | 'rivers'>;

/** City and town markers. */
export function siteFeatures(settlements: Settlement[]): FC<PlanFeature> {
  return {
    type: 'FeatureCollection',
    features: settlements.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: { id: s.id, tier: s.tier, population: s.population },
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
  private sites = new PointIndex<Settlement>(1);
  private roadPts = new PointIndex<null>(0.25);
  private exits = new Map<string, { ll: number[]; cls: RoadClass }[]>();
  private blocks = new Map<number, Block>();
  private plans = new Map<string, PlanFeature[]>();

  constructor(private world: TownWorld) {
    this.sampler = new DetailSampler(world.raster, new RiverIndex(world.rivers, world.raster.seed));
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
      for (const v of b.villages) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
          properties: { id: v.id, tier: 'village', kind: v.kind ?? 'farming', population: v.population },
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
    if (by < -90 || by >= 90) return { villages: [], tracks: [] };
    const key = this.blockKey(bx + 180, by + 90);
    let blk = this.blocks.get(key);
    if (!blk) {
      blk = this.generateBlock(wrapLon(bx + 0.5) - 0.5, by, key);
      this.blocks.set(key, blk);
    }
    return blk;
  }

  private generateBlock(lon0: number, lat0: number, key: number): Block {
    const { raster } = this.world;
    const { W, H } = raster;
    const seed = hash32(hashString(raster.seed) ^ Math.imul(key + 1, 0x9e3779b1));
    const nLat = Math.max(1, Math.round(111.2 / S.villageSpacingKm));
    const nLon = Math.max(1, Math.round((111.2 * Math.cos(((lat0 + 0.5) * Math.PI) / 180)) / S.villageSpacingKm));
    const villages: Settlement[] = [];
    const tracks: RoadFeature[] = [];
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
        // Mines need real relief: a camp at the foot of a steep slope, not on a high plateau.
        if (mountain > 0 && rr(5) < 0.35 * mountain && (minePos = this.mineSite(lon, lat))) kind = 'mining';
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
        if (kind === 'farming' || (kind === 'keep' && pos[0] === lon && pos[1] === lat)) {
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
        villages.push(v);
        const track = this.track(v, road, villages, rr(4));
        if (track) tracks.push(track);
      }
    }
    return { villages, tracks };
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
    if (s.tier === 'village') buildVillage({ s, exits, water, terrain, ground, out });
    else buildCity({ s, exits, water, terrain, ground, out });

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
