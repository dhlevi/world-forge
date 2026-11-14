/**
 * Roofs (docs/design/navigation.md, Roofs): each building's roof, worked out from what the world
 * already holds (its use, its quarter, its climate, its storeys) so that nothing more is saved, and
 * how each tile of it is drawn from straight above (which plane of the roof it is on).
 *
 * The materials and shapes follow the same rules as the atlas's town pictures (towns/illustrate.ts):
 * flat roofs in deserts, tiles round the Mediterranean, thatch for the poor, slate for halls and
 * temples, cones for towers and windmills. A house's own pick is made here from its id, so the
 * atlas's picture of the same house may differ in colour.
 */
import { KOPPEN_CLASSES } from '../gen/koppen';
import { hashString } from '../gen/rng';

export type RoofShape = 'gable' | 'hip' | 'flat' | 'cone' | 'dome';
export type RoofMaterial = 'tile' | 'slate' | 'shingle' | 'thatch' | 'flat' | 'turf';

/** The materials, with a placeholder colour each (as the atlas paints them). */
export const ROOF_MATERIALS: Record<RoofMaterial, string> = {
  tile: '#a35f45', slate: '#77746f', shingle: '#7d6550', thatch: '#bba070', flat: '#d9c7a0', turf: '#7f8f5a',
};

/** The planes of a roof a tile can be on, as seen from straight above. */
export const ROOF_PLANES = ['n', 'e', 's', 'w', 'ridge_ew', 'ridge_ns', 'flat', 'peak'] as const;
export type RoofPlane = (typeof ROOF_PLANES)[number];

export interface Roof {
  /** The building's id (a building may lie across several chunks: one roof). */
  id: string;
  /** Its box (tiles), and which tiles of the box it covers (1), row by row. */
  x0: number;
  y0: number;
  w: number;
  h: number;
  cover: Uint8Array;
  /** The height of its ground floor (m), and of the roof above it (m). */
  floorM: number;
  heightM: number;
  storeys: number;
  shape: RoofShape;
  material: RoofMaterial;
  /** Which way its ridge runs: along the building's longer side. */
  ridge: 'ew' | 'ns';
}

/** What a building is, for its roof. */
export interface RoofInput {
  id: string;
  use?: string;
  role?: string;
  ctx?: string;
  tier?: string;
  koppen: number;
  storeys: number;
  storeyH: number;
  burrow?: boolean;
  tree?: string;
}

/** A small stream of chance from a building's id. */
function stream(id: string): () => number {
  let s = hashString(`roof|${id}`) | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted<T>(r: () => number, items: [T, number][]): T {
  const total = items.reduce((n, [, w]) => n + w, 0);
  let x = r() * total;
  for (const [v, w] of items) if ((x -= w) < 0) return v;
  return items[items.length - 1][0];
}

/** The climate of a Köppen class, for roofing (as towns/illustrate.ts). */
function climate(kp: number): 'tropic' | 'desert' | 'steppe' | 'med' | 'temperate' | 'cold' | 'polar' {
  const code = KOPPEN_CLASSES[kp]?.code ?? 'Cfb';
  if (code.startsWith('A')) return 'tropic';
  if (code.startsWith('BW')) return 'desert';
  if (code.startsWith('B')) return 'steppe';
  if (code.startsWith('Cs')) return 'med';
  if (code.startsWith('C')) return 'temperate';
  if (code.startsWith('D')) return 'cold';
  return 'polar';
}

/** A building's roof shape and material. */
export function roofKind(b: RoofInput): { shape: RoofShape; material: RoofMaterial } {
  const r = stream(b.id), cl = climate(b.koppen), ctx = b.ctx ?? '', role = b.role ?? '', use = b.use ?? '';
  if (b.burrow) return { shape: 'dome', material: 'turf' };
  if (b.tree === 'home') return { shape: 'cone', material: 'shingle' };
  if (role === 'magetower' || (use === 'mill' && role !== 'watermill' && r() < 0.5)) return { shape: 'cone', material: 'slate' };
  if (use === 'keep' || role === 'delvegate') return { shape: 'flat', material: 'flat' };
  if (use === 'temple') return cl === 'desert' ? { shape: 'flat', material: 'flat' } : { shape: 'gable', material: cl === 'med' ? 'tile' : 'slate' };
  if (role === 'prison') return { shape: 'hip', material: 'slate' };
  const poor = b.tier === 'village' || ['suburb', 'slum', 'farm', 'farming', 'fishing', 'logging', 'mining', 'tribal', 'camp'].includes(ctx);
  let material: RoofMaterial;
  switch (cl) {
    case 'desert': material = weighted<RoofMaterial>(r, [['flat', 9], ['tile', 1]]); break;
    case 'steppe': material = weighted<RoofMaterial>(r, [['flat', 5], ['tile', 3], ['thatch', poor ? 3 : 1]]); break;
    case 'tropic': material = weighted<RoofMaterial>(r, [['thatch', poor ? 7 : 4], ['tile', poor ? 2 : 5]]); break;
    case 'med': material = weighted<RoofMaterial>(r, [['tile', 9], ['flat', 1], ['thatch', poor ? 1 : 0]]); break;
    case 'cold': material = weighted<RoofMaterial>(r, [['shingle', 5], ['slate', poor ? 1 : 3], ['thatch', poor ? 3 : 1]]); break;
    case 'polar': material = weighted<RoofMaterial>(r, [['turf', 5], ['shingle', 4]]); break;
    default: material = poor ? weighted<RoofMaterial>(r, [['thatch', 5], ['shingle', 3], ['tile', 3]]) : weighted<RoofMaterial>(r, [['tile', 5], ['slate', 2], ['shingle', 2], ['thatch', 1]]);
  }
  const hall = ['townhall', 'guildhall', 'library', 'university', 'college', 'countinghouse'].includes(role) || role.startsWith('guild:') || role.startsWith('order:');
  const shape: RoofShape = material === 'flat' ? 'flat' : hall || ((ctx === 'rich' || ctx === 'counting') && r() < 0.35) ? 'hip' : 'gable';
  return { shape, material };
}

/**
 * The plane of a roof a tile of it is on (tx, ty in tiles), for drawing it from above: the slopes
 * facing north, east, south and west, the ridge, a flat roof, or the peak of a cone or dome.
 */
export function roofPlane(roof: Roof, tx: number, ty: number): RoofPlane {
  if (roof.shape === 'flat') return 'flat';
  // Distances (tiles) from the tile's middle to the box's sides, the box being the covered tiles' extent.
  const x = tx - roof.x0 + 0.5, y = ty - roof.y0 + 0.5;
  const dN = y, dS = roof.h - y, dW = x, dE = roof.w - x;
  if (roof.shape === 'cone' || roof.shape === 'dome') {
    const cx = roof.w / 2, cy = roof.h / 2, ax = x - cx, ay = y - cy;
    if (Math.abs(ax) < 0.75 && Math.abs(ay) < 0.75) return 'peak';
    return Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'e' : 'w') : ay > 0 ? 's' : 'n';
  }
  if (roof.ridge === 'ew') {
    // The ridge runs east and west along the middle row (or rows).
    if (Math.abs(dN - dS) < 1) {
      if (roof.shape === 'hip' && Math.min(dE, dW) < roof.h / 2) return dE < dW ? 'e' : 'w';
      return 'ridge_ew';
    }
    if (roof.shape === 'hip' && Math.min(dE, dW) < Math.min(dN, dS)) return dE < dW ? 'e' : 'w';
    return dN < dS ? 'n' : 's';
  }
  if (Math.abs(dW - dE) < 1) {
    if (roof.shape === 'hip' && Math.min(dN, dS) < roof.w / 2) return dN < dS ? 'n' : 's';
    return 'ridge_ns';
  }
  if (roof.shape === 'hip' && Math.min(dN, dS) < Math.min(dE, dW)) return dN < dS ? 'n' : 's';
  return dW < dE ? 'w' : 'e';
}

/** Whether a roof covers a tile. */
export function covers(roof: Roof, tx: number, ty: number): boolean {
  const x = tx - roof.x0, y = ty - roof.y0;
  return x >= 0 && y >= 0 && x < roof.w && y < roof.h && roof.cover[y * roof.w + x] === 1;
}
