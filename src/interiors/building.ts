import { LocalFrame, type PlanFeature } from '../towns/plan';
import { type Dwelling, type Pt, generateDwelling } from './dwelling';
import { type Ctx2D, drawPlan } from './render';

/** Zoom from which hovering a building previews its ground floor. */
export const INTERIOR_ZOOM = 17;

export interface BuildingView {
  d: Dwelling;
  frame: LocalFrame;
  /** Short description of where the building stands. */
  place: string;
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
  });
  const ctx = String(p.ctx ?? '');
  const view: BuildingView = { d, frame, place: PLACES[ctx] ?? (p.tier === 'city' ? 'in the city' : 'in town') };
  cache.set(key, view);
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return view;
}

/**
 * The ground floor drawn into a canvas in the building's own frame, with the four lon/lat corners
 * (top-left, top-right, bottom-right, bottom-left) that place it on the map as an image source.
 */
export function previewImage(v: BuildingView): { url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]] } {
  const { d, frame } = v;
  const W = d.nx * d.cw, Hh = d.ny * d.ch;
  const marginM = 0.6;
  const scale = Math.min(48, 900 / Math.max(W, Hh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((W + 2 * marginM) * scale);
  canvas.height = Math.ceil((Hh + 2 * marginM) * scale);
  const g = canvas.getContext('2d') as Ctx2D;
  drawPlan(g, d, d.ground, { scale, ox: marginM * scale, oy: marginM * scale, labels: scale > 30, grid: true, overlay: true });
  const wM = canvas.width / scale, hM = canvas.height / scale;
  const at = (u: number, w: number): [number, number] => {
    const x = d.origin[0] + (u - marginM) * d.eu[0] + (w - marginM) * d.ev[0];
    const y = d.origin[1] + (u - marginM) * d.eu[1] + (w - marginM) * d.ev[1];
    const ll = frame.toLL([x, y]);
    return [ll[0], ll[1]];
  };
  return { url: canvas.toDataURL('image/png'), coordinates: [at(0, 0), at(wM, 0), at(wM, hM), at(0, hM)] };
}
