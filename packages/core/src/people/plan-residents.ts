import type { WorldData } from '../lore/current';
import { buildingView } from '../interiors/building';
import { LocalFrame, type PlanFeature } from '../towns/plan';
import { townContext } from './town-context';
import { type Household, type Neighbour, type ResidentBuilding, residents } from './residents';
import { DMath } from '../dmath';

/**
 * The households of a plan building (people/residents.ts), worked out from the drawn plan: the
 * building, the town about it and the buildings nearest it. The map's building window and the
 * game-data export both use this, so they give the same people.
 */

/** A village, known only by its marker. */
export interface VillageMarker {
  lon: number;
  lat: number;
  kind: string;
  population: number;
  name: string;
}

const SHOP_ROOMS = new Set(['Smithy', 'Bakery', 'Taproom', 'Shop', 'Workshop', 'Butcher', 'Tailor', 'Apothecary', 'Chandlery', 'Pawnshop', 'Foundry']);
const shops = new Map<string, string | null>();
let shopSeed = '';

/** The trade room on a building's ground floor (from its floor plan, made on first need and kept). */
export function shopOf(f: PlanFeature, seed: string): string | undefined {
  if (f.properties.role || f.properties.use) return undefined;
  if (shopSeed !== seed) {
    shops.clear();
    shopSeed = seed;
  }
  const bid = String(f.properties.bid);
  let s = shops.get(bid);
  if (s === undefined) {
    const v = buildingView(f, seed);
    s = v?.d.floors[v.d.ground]?.rooms.find((rm) => SHOP_ROOMS.has(rm.name))?.name ?? null;
    shops.set(bid, s);
  }
  return s ?? undefined;
}

/** A plan building as people/residents.ts needs it: its properties, floor area and centre. */
export function residentBuilding(f: PlanFeature, frame: LocalFrame, seed: string): ResidentBuilding & { c: number[] } {
  const p = f.properties;
  const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0].slice(0, -1).map((q) => frame.fromLL(q[0], q[1])) : [];
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  for (const q of ring) {
    cx += q[0] / ring.length;
    cy += q[1] / ring.length;
  }
  const shop = shopOf(f, seed);
  return {
    bid: String(p.bid), ctx: String(p.ctx ?? 'ward'), tier: String(p.tier ?? 'town'), areaM2: Math.abs(a) / 2, c: [cx, cy],
    ...(typeof p.role === 'string' ? { role: p.role } : {}), ...(typeof p.use === 'string' ? { use: p.use } : {}), ...(typeof p.label === 'string' ? { label: p.label } : {}),
    ...(shop ? { shop } : {}),
  };
}

const DIRS = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'];

/**
 * The households of a building, with ties to the households of the buildings nearest it.
 * `others` are the plan's other buildings (any of the same settlement within 70 m count).
 */
export function householdsFor(w: WorldData, f: PlanFeature, others: Iterable<PlanFeature>, village?: VillageMarker): Household[] {
  const seed = w.raster.seed;
  const sid = String(f.properties.sid ?? '');
  const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : [];
  const lon0 = ring.reduce((a, q) => a + q[0], 0) / Math.max(1, ring.length), lat0 = ring.reduce((a, q) => a + q[1], 0) / Math.max(1, ring.length);
  const frame = new LocalFrame(lon0, lat0);
  const vc = village ? [village.lon, village.lat] : [lon0, lat0];
  const { ctx, stats } = townContext(w, sid, { lon: vc[0], lat: vc[1], kind: village?.kind ?? String(f.properties.ctx ?? 'farming'), population: village?.population ?? 150, name: village?.name ?? '' });
  const me = residentBuilding(f, frame, seed);
  const near: Neighbour[] = [];
  for (const g of others) {
    if (g === f || String(g.properties.sid ?? '') !== sid || g.geometry.type !== 'Polygon') continue;
    const q = g.geometry.coordinates[0][0];
    const loc = frame.fromLL(q[0], q[1]);
    const d = DMath.hypot2(loc[0] - me.c[0], loc[1] - me.c[1]);
    if (d > 70) continue;
    const nb = residentBuilding(g, frame, seed);
    const dist = DMath.hypot2(nb.c[0] - me.c[0], nb.c[1] - me.c[1]);
    const ang = DMath.atan2(nb.c[1] - me.c[1], nb.c[0] - me.c[0]);
    near.push({ ...nb, dist, dir: DIRS[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8] });
  }
  near.sort((a, b) => a.dist - b.dist);
  return residents(ctx, me, near.slice(0, 8), stats);
}
