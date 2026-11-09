import { LocalFrame, type PlanFeature } from '../towns/plan';
import { type Dwelling, type Pt, generateDwelling } from './dwelling';

/** Zoom from which hovering a building previews its ground floor. */
export const INTERIOR_ZOOM = 17;

export interface BuildingView {
  d: Dwelling;
  frame: LocalFrame;
  /** Short description of where the building stands. */
  place: string;
  /** Who lives there (people/residents.ts), added when the building is opened. */
  residents?: import('../people/residents').Household[];
}

const PLACES: Record<string, string> = {
  ward: 'in a town ward', rich: 'in the wealthy quarter', harbour: 'on the waterfront', suburb: 'in the suburbs',
  farm: 'among the fields', farming: 'in a farming village', fishing: 'in a fishing village', logging: 'at a logging camp',
  mining: 'at a mining camp', monastery: 'within a monastery', keep: 'within a keep',
};

const cache = new Map<string, BuildingView>();

/** Floor plans for a plan building feature (cached; deterministic per world seed and building id). */
export function buildingView(f: PlanFeature, seed: string): BuildingView | null {
  const p = f.properties;
  if (f.geometry.type !== 'Polygon' || typeof p.bid !== 'string') return null;
  const key = `${seed}|${p.bid}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const ring = f.geometry.coordinates[0].slice(0, -1);
  let lon = 0, lat = 0;
  for (const c of ring) {
    lon += c[0] / ring.length;
    lat += c[1] / ring.length;
  }
  const frame = new LocalFrame(lon, lat);
  let footprint: Pt[] = ring.map((c) => frame.fromLL(c[0], c[1]) as Pt);
  // Counter-clockwise, as the plan geometry is.
  let a = 0;
  for (let i = 0, j = footprint.length - 1; i < footprint.length; j = i++) a += footprint[j][0] * footprint[i][1] - footprint[i][0] * footprint[j][1];
  if (a < 0) footprint = footprint.reverse();
  const d = generateDwelling({
    id: p.bid, seed, footprint,
    use: typeof p.use === 'string' ? p.use : undefined,
    ctx: String(p.ctx ?? 'ward'), tier: String(p.tier ?? 'town'),
    front: typeof p.front === 'number' ? p.front : undefined,
    role: typeof p.role === 'string' ? p.role : undefined,
    name: typeof p.label === 'string' ? p.label : undefined,
    culture: typeof p.cul === 'string' ? p.cul : undefined,
    burrow: !!p.burrow,
  });
  const ctx = String(p.ctx ?? '');
  const town = PLACES[ctx] ?? (p.tier === 'city' ? 'in the city' : 'in town');
  // An elven tree town's houses (towns/treetown.ts).
  const place = p.tree === 'top' ? `high in the boughs of a great tree, ${p.z ?? 11} m up, ${town}` : p.tree === 'home' ? `built against the trunk of a great tree, ${town}` : town;
  const view: BuildingView = { d, frame, place };
  cache.set(key, view);
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return view;
}
