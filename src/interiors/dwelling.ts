import { type BuildStyle, buildStyle } from './style';
import { hash32, hashString, mulberry32 } from '../gen/rng';

/**
 * Building interiors in the manner of Watabou's Dwellings: a building footprint from the
 * town plan is laid on a 1.5 m (5 ft) grid, split into rooms by a binary partition that
 * every storey shares (load-bearing walls line up), and fitted out by building type with
 * stairs, doors, windows and furniture. Deterministic per building id.
 *
 * Grid space: u to the right, v down; the street front faces +v (the bottom of the plan).
 */

export type Pt = [number, number];
/** A cell edge: the east ('e') or south ('s') side of cell (i, j); i or j may be -1. */
export type EdgeSide = 'e' | 's';
/** Which side of a cell a wall-mounted item backs onto. */
export type WallSide = 'n' | 'e' | 's' | 'w';

export interface DwellingInput {
  id: string;
  /** World seed (mixed into the building's own seed). */
  seed: string;
  /** Footprint in local metres (x east, y north). */
  footprint: Pt[];
  use?: string;
  /** Ward kind in towns ('ward', 'rich', 'harbour', 'suburb', 'farm'), or the village kind. */
  ctx: string;
  tier: string;
  /** Outward direction (radians, local frame) of the street front. */
  front?: number;
  /** A notable building's role ('inn', 'smithy', 'library'...) and its sign or name. */
  role?: string;
  name?: string;
  /** The culture template of the people who built it ('anglo', 'desert'...), for its walls and roof. */
  culture?: string;
  /** A burrow dug into a grassy mound (a burrowing people's house). */
  burrow?: boolean;
}

export interface Opening {
  i: number;
  j: number;
  side: EdgeSide;
  kind: 'door' | 'entrance' | 'window' | 'slit';
}

export interface Stair {
  i: number;
  j: number;
  w: number;
  h: number;
  /** Climbing direction in grid space (unit vector), for drawing the steps and arrow. */
  dir: Pt;
  kind: 'stair' | 'ladder' | 'spiral';
  up: boolean;
  down: boolean;
}

export interface Item {
  type: string;
  /** Axis-aligned box in cell units. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Wall the item backs onto, if any. */
  wall?: WallSide;
}

export interface Room {
  name: string;
  cells: number[];
}

export interface Floor {
  level: number;
  name: string;
  /** Cell → room index, -1 outside this floor. */
  room: Int16Array;
  rooms: Room[];
  openings: Opening[];
  stairs: Stair[];
  items: Item[];
  surface: 'flags' | 'boards' | 'earth';
}

export interface Roof {
  type: 'gable' | 'hip' | 'flat' | 'mound';
  /** Rise per metre of run. */
  pitch: number;
  /** For gables, the ridge runs along this axis. */
  axis: 'u' | 'v';
}

export interface Dwelling {
  id: string;
  /** Type label, e.g. "Town house". */
  label: string;
  /** Its own name, for notable buildings ("The Drunken Goose"). */
  title?: string;
  nx: number;
  ny: number;
  /** Cell size (m) along u and v. */
  cw: number;
  ch: number;
  /** Local-frame position of grid corner (0, 0), and the u and v axes as local unit vectors. */
  origin: Pt;
  eu: Pt;
  ev: Pt;
  /** Ground-floor footprint mask. */
  mask: Uint8Array;
  /** Cells wholly inside the footprint (furniture and stairs stay on these). */
  full: Uint8Array;
  /**
   * The true footprint (cell units) when it is convex: plans are clipped to it and its edges are
   * the outer walls, so slanted lots keep their shape. Absent for other shapes, which follow the grid.
   */
  poly?: Pt[];
  floors: Floor[];
  /** Index of the ground floor in `floors`. */
  ground: number;
  /** Storeys above ground (excluding the attic) and their height (m). */
  storeys: number;
  storeyH: number;
  roof: Roof;
  /** How its people build it (walls, roof covering and form), if its culture is known. */
  style?: BuildStyle | null;
  /** Chimneys: cell and the wall side the hearth stands against. */
  chimneys: { i: number; j: number; side: WallSide }[];
}

export const CELL_M = 1.5;

type Kind =
  | 'cottage' | 'farmhouse' | 'townhouse' | 'mansion' | 'warehouse' | 'temple' | 'keep'
  | 'hall' | 'store' | 'mill' | 'range' | 'cabin' | 'hut' | 'inn' | 'civic' | 'library' | 'barracks' | 'stables' | 'bathhouse'
  | 'university' | 'guild' | 'witch' | 'tower' | 'bank' | 'shrine' | 'burrow' | 'prison';

const LABELS: Record<Kind, string> = {
  cottage: 'Cottage', farmhouse: 'Farmhouse', townhouse: 'Town house', mansion: 'Mansion', warehouse: 'Warehouse',
  tower: 'Mages\' tower', bank: 'Counting house', shrine: 'Shrine', burrow: 'Burrow',
  temple: 'Temple', keep: 'Keep', hall: 'Hall', store: 'Storehouse', mill: 'Mill', range: 'Monastic range',
  cabin: 'Cabin', hut: 'Miner\'s hut', inn: 'Inn', civic: 'Hall', library: 'Library', barracks: 'Barracks',
  stables: 'Stables', bathhouse: 'Bathhouse', university: 'University', guild: 'Guildhall', witch: "Witch's hut", prison: 'Prison',
};

/** Roles that turn a town house into a trade: the shop floor's name. */
const TRADE_ROLE: Record<string, string> = {
  tavern: 'Taproom', smithy: 'Smithy', bakery: 'Bakery', apothecary: 'Apothecary', pawnshop: 'Pawnshop', tailor: 'Tailor',
  butcher: 'Butcher', chandlery: 'Chandlery', foundry: 'Foundry', winepress: 'Press room',
};
const ROLE_LABEL: Record<string, string> = {
  tavern: 'Tavern', smithy: 'Smithy', bakery: 'Bakery', apothecary: 'Apothecary', pawnshop: 'Pawnshop', tailor: 'Tailor',
  butcher: 'Butcher', chandlery: 'Chandlery', foundry: 'Foundry', townhall: 'Town hall', delvegate: 'Gatehouse', guildhall: 'Guildhall', mill: 'Mill',
  university: 'University', college: 'College', 'guild:adventurers': 'Adventurers\' guild', 'guild:warriors': 'Warriors\' guild',
  'guild:cartographers': 'Cartographers\' guild', 'guild:alchemists': 'Alchemists\' guild', 'guild:mages': 'Mages\' guild', 'guild:masons': 'Masons\' guild',
  'guild:smiths': 'Smiths\' guild', 'guild:weavers': 'Weavers\' guild', 'guild:physicians': 'Physicians\' guild',
  'order:knights': 'Commandery', 'order:hunters': 'Hunters\' lodge', 'order:assassins': 'Shop', 'order:mercenaries': 'Recruiting house',
  'guild:vintners': 'Vintners\' hall', winepress: 'Press house',
  'order:traders': 'Company house', 'order:bards': 'College', 'order:explorers': 'Society rooms',
};

function pointInPoly(p: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function classify(inp: DwellingInput, areaM2: number, rnd: () => number): Kind {
  switch (inp.role) {
    case 'inn': return 'inn';
    case 'townhall': case 'guildhall': return 'civic';
    case 'library': return 'library';
    case 'barracks': return 'barracks';
    case 'stables': return 'stables';
    case 'bathhouse': return 'bathhouse';
    case 'university': case 'college': return 'university';
    case 'prison': return 'prison';
  }
  if (inp.role?.startsWith('guild:') || inp.role?.startsWith('order:')) return 'guild';
  if (inp.burrow && !inp.role && !inp.use) return 'burrow';
  if (inp.role === 'magetower') return 'tower';
  if (inp.role === 'countinghouse') return 'bank';
  if (inp.role === 'shrine') return 'shrine';
  if (inp.role === 'witch' || inp.use === 'witch') return 'witch';
  if (inp.role && TRADE_ROLE[inp.role]) return 'townhouse';
  switch (inp.use) {
    case 'temple': return 'temple';
    case 'keep': return 'keep';
    case 'hall': return 'hall';
    case 'store': return 'store';
    case 'mill': return 'mill';
  }
  switch (inp.ctx) {
    case 'rich': return 'mansion';
    case 'harbour': return 'warehouse';
    case 'ward': return 'townhouse';
    // A rookery's houses: tenements, or a single room for the poorest.
    case 'slum': return areaM2 > 55 ? 'townhouse' : 'cottage';
    case 'suburb': return areaM2 > 90 && rnd() < 0.5 ? 'townhouse' : 'cottage';
    case 'farm': return 'farmhouse';
    case 'logging': return 'cabin';
    case 'mining': return 'hut';
    case 'monastery': return 'range';
    default: return areaM2 > 75 ? 'farmhouse' : 'cottage';
  }
}

// ---------------------------------------------------------------------------------------------
// Grid helpers

class Grid {
  constructor(readonly nx: number, readonly ny: number, readonly mask: Uint8Array, readonly full: Uint8Array) {}
  in(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.nx && j < this.ny && this.mask[j * this.nx + i] === 1;
  }
}

const NB: [number, number, WallSide][] = [[0, -1, 'n'], [1, 0, 'e'], [0, 1, 's'], [-1, 0, 'w']];

/** Canonical edge for the side of cell (i, j). */
function edgeOf(i: number, j: number, side: WallSide): Opening {
  switch (side) {
    case 'e': return { i, j, side: 'e', kind: 'door' };
    case 's': return { i, j, side: 's', kind: 'door' };
    case 'w': return { i: i - 1, j, side: 'e', kind: 'door' };
    default: return { i, j: j - 1, side: 's', kind: 'door' };
  }
}
const edgeKey = (e: { i: number; j: number; side: EdgeSide }) => `${e.i},${e.j},${e.side}`;

// ---------------------------------------------------------------------------------------------
// Partition

interface Leaf {
  i0: number;
  j0: number;
  i1: number;
  j1: number;
  cells: number[];
}

function leafCells(g: Grid, i0: number, j0: number, i1: number, j1: number): number[] {
  const out: number[] = [];
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) if (g.in(i, j)) out.push(j * g.nx + i);
  return out;
}

/** Recursive binary split of the footprint into about n leaves, at least 2 cells wide each. */
function partition(g: Grid, n: number, cw: number, ch: number, rnd: () => number): Leaf[] {
  const leaves: Leaf[] = [{ i0: 0, j0: 0, i1: g.nx, j1: g.ny, cells: leafCells(g, 0, 0, g.nx, g.ny) }];
  for (let guard = 0; leaves.length < n && guard < 60; guard++) {
    leaves.sort((a, b) => b.cells.length - a.cells.length);
    let done = false;
    for (let li = 0; li < leaves.length && !done; li++) {
      const L = leaves[li];
      const wU = (L.i1 - L.i0) * cw, wV = (L.j1 - L.j0) * ch;
      const axes: ('u' | 'v')[] = wU > wV * (0.8 + 0.4 * rnd()) ? ['u', 'v'] : ['v', 'u'];
      for (const ax of axes) {
        const dim = ax === 'u' ? L.i1 - L.i0 : L.j1 - L.j0;
        if (dim < 4) continue;
        const cuts: number[] = [];
        for (let k = 2; k <= dim - 2; k++) cuts.push(k);
        // Prefer cuts near the middle, with some variety.
        cuts.sort((a, b) => Math.abs(a / dim - 0.5) - Math.abs(b / dim - 0.5) + (rnd() - 0.5) * 0.3);
        for (const k of cuts) {
          const A = ax === 'u'
            ? { i0: L.i0, j0: L.j0, i1: L.i0 + k, j1: L.j1 }
            : { i0: L.i0, j0: L.j0, i1: L.i1, j1: L.j0 + k };
          const B = ax === 'u'
            ? { i0: L.i0 + k, j0: L.j0, i1: L.i1, j1: L.j1 }
            : { i0: L.i0, j0: L.j0 + k, i1: L.i1, j1: L.j1 };
          const ca = leafCells(g, A.i0, A.j0, A.i1, A.j1), cb = leafCells(g, B.i0, B.j0, B.i1, B.j1);
          if (ca.length < 4 || cb.length < 4) continue;
          leaves.splice(li, 1, { ...A, cells: ca }, { ...B, cells: cb });
          done = true;
          break;
        }
        if (done) break;
      }
    }
    if (!done) break;
  }
  return leaves;
}

// ---------------------------------------------------------------------------------------------
// Programs: room names for each floor, assigned to the shared leaves by preference.

type Pref = 'stair' | 'front' | 'back' | 'large' | 'small' | 'any';
interface Role {
  name: string;
  pref: Pref;
}
const R = (name: string, pref: Pref = 'any'): Role => ({ name, pref });

interface Program {
  roles: Role[];
  fallback: string;
  /** Merge all leaves into one room. */
  merge?: boolean;
  surface: Floor['surface'];
}

function programs(kind: Kind, inp: DwellingInput, storeys: number, rnd: () => number): {
  basement: Program; floors: Program[]; attic: Program;
} {
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const cellar: Program = { roles: [R('Cellar', 'stair'), R('Storage')], fallback: 'Storage', surface: 'earth' };
  const loft: Program = { roles: [R('Attic', 'large')], fallback: 'Attic', merge: true, surface: 'boards' };
  switch (kind) {
    case 'inn':
      return {
        basement: { ...cellar, roles: [R('Wine cellar', 'stair')] },
        floors: [
          { roles: [R('Taproom', 'front'), R('Kitchen', 'back'), R('Hall', 'stair'), R('Pantry', 'small'), R('Snug')], fallback: 'Storeroom', surface: 'flags' },
          ...Array.from({ length: storeys - 1 }, (): Program => ({ roles: [R('Landing', 'stair'), R('Best room', 'large')], fallback: 'Guest room', surface: 'boards' })),
        ],
        attic: { ...loft, roles: [R('Servants\' garret', 'large')] },
      };
    case 'civic':
      return {
        basement: { ...cellar, roles: [R('Strongroom', 'stair')] },
        floors: [
          { roles: [R('Great hall', 'large'), R('Hall', 'stair'), R('Clerks\' office', 'front'), R('Strongroom', 'small')], fallback: 'Clerks\' office', surface: 'flags' },
          ...Array.from({ length: storeys - 1 }, (): Program => ({ roles: [R('Landing', 'stair'), R('Council chamber', 'large')], fallback: 'Archive', surface: 'boards' })),
        ],
        attic: loft,
      };
    case 'university':
      return inp.role === 'college'
        ? {
            basement: cellar,
            floors: [
              { roles: [R('Hall', 'stair'), R('Refectory', 'large'), R('Kitchen', 'back'), R('Library')], fallback: 'Study', surface: 'flags' },
              ...Array.from({ length: storeys - 1 }, (): Program => ({ roles: [R('Landing', 'stair'), R('Master\'s lodging', 'large')], fallback: 'Scholars\' room', surface: 'boards' })),
            ],
            attic: { ...loft, roles: [R('Dormitory', 'large')] },
          }
        : {
            basement: { ...cellar, roles: [R('Archive', 'stair')] },
            floors: [
              { roles: [R('Lecture hall', 'large'), R('Hall', 'stair'), R('Disputation hall'), R('Library')], fallback: 'Lecture room', surface: 'flags' },
              ...Array.from({ length: storeys - 1 }, (): Program => ({ roles: [R('Landing', 'stair'), R('Library', 'large'), R('Observatory')], fallback: 'Study', surface: 'boards' })),
            ],
            attic: loft,
          };
    case 'guild': {
      const g = (inp.role ?? '').slice(6);
      const GROUND: Record<string, Program['roles']> = {
        adventurers: [R('Common room', 'large'), R('Hall', 'stair'), R('Notice hall', 'front'), R('Kitchen', 'back'), R('Armoury', 'small')],
        warriors: [R('Training hall', 'large'), R('Hall', 'stair'), R('Armoury', 'small'), R('Mess hall')],
        cartographers: [R('Map room', 'large'), R('Hall', 'stair'), R('Drafting room', 'front'), R('Archive', 'small')],
        alchemists: [R('Laboratory', 'large'), R('Hall', 'stair'), R('Shop', 'front'), R('Store', 'small')],
        mages: [R('Lecture hall', 'large'), R('Hall', 'stair'), R('Laboratory'), R('Library')],
        physicians: [R('Infirmary', 'large'), R('Hall', 'stair'), R('Apothecary', 'front'), R('Laboratory')],
        // Organisations' chapter houses (lore/orders.ts; roles 'order:kind').
        knights: [R('Chapter hall', 'large'), R('Hall', 'stair'), R('Chapel'), R('Armoury', 'small')],
        hunters: [R('Trophy hall', 'large'), R('Hall', 'stair'), R('Armoury', 'small'), R('Still room')],
        assassins: [R('Shop', 'front'), R('Hall', 'stair'), R('Workshop', 'back'), R('Store', 'small')],
        mercenaries: [R('Recruiting hall', 'large'), R('Hall', 'stair'), R('Paymaster\'s office', 'front'), R('Armoury', 'small')],
        traders: [R('Counting room', 'large'), R('Hall', 'stair'), R('Clerks\' office', 'front'), R('Strongroom', 'small')],
        bards: [R('Music room', 'large'), R('Hall', 'stair'), R('Library'), R('Practice room', 'small')],
        explorers: [R('Lecture hall', 'large'), R('Hall', 'stair'), R('Map room'), R('Cabinet of curiosities')],
        vintners: [R('Tasting hall', 'large'), R('Hall', 'stair'), R('Counting room', 'front'), R('Store', 'small')],
      };
      const UPPER: Record<string, Program['roles']> = {
        adventurers: [R('Landing', 'stair'), R('Bunk room', 'large')], warriors: [R('Landing', 'stair'), R('Barrack room', 'large')],
        cartographers: [R('Landing', 'stair'), R('Stacks', 'large')], alchemists: [R('Landing', 'stair'), R('Library', 'large')],
        mages: [R('Landing', 'stair'), R('Library', 'large'), R('Study')], physicians: [R('Landing', 'stair'), R('Ward', 'large')],
        knights: [R('Landing', 'stair'), R('Dormitory', 'large')], hunters: [R('Landing', 'stair'), R('Bunk room', 'large')],
        assassins: [R('Landing', 'stair'), R('Training hall', 'large'), R('Study')], mercenaries: [R('Landing', 'stair'), R('Barrack room', 'large')],
        traders: [R('Landing', 'stair'), R('Council chamber', 'large')], bards: [R('Landing', 'stair'), R('Guest room', 'large')],
        explorers: [R('Landing', 'stair'), R('Library', 'large'), R('Map room')],
      };
      return {
        basement: g === 'mages' ? { ...cellar, roles: [R('Summoning chamber', 'stair')] } : g === 'vintners' ? { ...cellar, roles: [R('Wine cellar', 'stair'), R('Wine cellar')] } : g === 'alchemists' ? { ...cellar, roles: [R('Still room', 'stair')] } : { ...cellar, roles: [R('Strongroom', 'stair')] },
        floors: [
          { roles: GROUND[g] ?? [R('Great hall', 'large'), R('Hall', 'stair'), R('Clerks\' office', 'front'), R('Workshop')], fallback: g === 'mages' ? 'Study' : 'Clerks\' office', surface: 'flags' },
          ...Array.from({ length: storeys - 1 }, (): Program => ({ roles: UPPER[g] ?? [R('Landing', 'stair'), R('Council chamber', 'large')], fallback: g === 'adventurers' ? 'Guest room' : 'Study', surface: 'boards' })),
        ],
        attic: loft,
      };
    }
    case 'tower': {
      // A mage's tower: library and hall below, a laboratory and studies above, and an
      // observatory at the top; a summoning chamber in the cellar.
      const upper = (k: number): Program => k === storeys - 1
        ? { roles: [R('Observatory', 'large'), R('Landing', 'stair')], fallback: 'Observatory', merge: true, surface: 'boards' }
        : k % 2 ? { roles: [R('Laboratory', 'large'), R('Landing', 'stair')], fallback: 'Study', surface: 'flags' }
          : { roles: [R('Study', 'large'), R('Landing', 'stair'), R('Chamber')], fallback: 'Library', surface: 'boards' };
      return {
        basement: { roles: [R('Summoning chamber', 'stair')], fallback: 'Summoning chamber', merge: true, surface: 'flags' },
        floors: [{ roles: [R('Hall', 'stair'), R('Library', 'large')], fallback: 'Library', surface: 'flags' }, ...Array.from({ length: storeys - 1 }, (_, k) => upper(k + 1))],
        attic: loft,
      };
    }
    case 'bank':
      return {
        basement: { roles: [R('Vault', 'stair')], fallback: 'Vault', merge: true, surface: 'flags' },
        floors: [
          { roles: [R('Counting room', 'front'), R('Hall', 'stair'), R('Strongroom', 'small'), R('Clerks\' office')], fallback: 'Clerks\' office', surface: 'flags' },
          ...Array.from({ length: storeys - 1 }, (): Program => ({ roles: [R('Landing', 'stair'), R('Master bedroom', 'large'), R('Parlour')], fallback: 'Chamber', surface: 'boards' })),
        ],
        attic: { ...loft, roles: [R('Servants\' garret', 'large')] },
      };
    case 'burrow':
      // The rooms come from burrowLeaves; the program covers the cellars.
      return {
        basement: { roles: [R('Root cellar', 'large')], fallback: 'Root cellar', merge: true, surface: 'earth' },
        floors: [{ roles: [], fallback: 'Passage', surface: 'boards' }],
        attic: loft,
      };
    case 'shrine':
      return {
        basement: { roles: [R('Crypt', 'large')], fallback: 'Crypt', merge: true, surface: 'flags' },
        floors: [{ roles: [R('Shrine', 'large')], fallback: 'Shrine', merge: true, surface: 'flags' }],
        attic: loft,
      };
    case 'library':
      return {
        basement: { ...cellar, roles: [R('Archive', 'stair')] },
        floors: [
          { roles: [R('Reading room', 'large'), R('Hall', 'stair'), R('Scriptorium')], fallback: 'Stacks', surface: 'boards' },
          ...Array.from({ length: storeys - 1 }, (): Program => ({ roles: [R('Landing', 'stair'), R('Stacks', 'large')], fallback: 'Stacks', surface: 'boards' })),
        ],
        attic: loft,
      };
    case 'barracks':
      return {
        basement: cellar,
        floors: [
          { roles: [R('Mess hall', 'large'), R('Guardroom', 'stair'), R('Armoury', 'small')], fallback: 'Barrack room', surface: 'flags' },
          ...Array.from({ length: storeys - 1 }, (): Program => ({ roles: [R('Barrack room', 'large')], fallback: 'Barrack room', merge: true, surface: 'boards' })),
        ],
        attic: loft,
      };
    case 'stables':
      return {
        basement: cellar,
        floors: [{ roles: [R('Stalls', 'large'), R('Tack room', 'small')], fallback: 'Stalls', surface: 'earth' }],
        attic: { ...loft, roles: [R('Hayloft', 'large')] },
      };
    case 'bathhouse':
      return {
        basement: { ...cellar, roles: [R('Cistern', 'stair')] },
        floors: [{ roles: [R('Bath hall', 'large'), R('Changing room', 'front'), R('Boiler room', 'back')], fallback: 'Changing room', surface: 'flags' }],
        attic: loft,
      };
    case 'townhouse': {
      const trade = (inp.role && TRADE_ROLE[inp.role]) || pick(['Shop', 'Shop', 'Workshop', 'Workshop', 'Taproom', 'Smithy', 'Bakery']);
      const ground: Program = {
        roles: [R('Hall', 'stair'), R(trade, 'front'), R('Kitchen', 'back'), R('Pantry', 'small'), R('Parlour')],
        fallback: 'Storeroom', surface: 'flags',
      };
      const upper = (k: number): Program => ({
        roles: k === 1
          ? [R('Landing', 'stair'), R('Bedroom', 'large'), R('Parlour', 'front'), R('Bedroom'), R('Closet', 'small')]
          : [R('Landing', 'stair'), R('Bedroom'), R('Bedroom'), R('Servants\' room', 'small')],
        fallback: 'Bedroom', surface: 'boards',
      });
      return {
        basement: { ...cellar, roles: [R('Cellar', 'stair'), R(trade === 'Taproom' || trade === 'Press room' ? 'Wine cellar' : 'Storage')] },
        floors: [ground, ...Array.from({ length: storeys - 1 }, (_, k) => upper(k + 1))],
        attic: { ...loft, roles: [R(pick(['Attic', 'Servants\' garret', 'Attic store']), 'large')] },
      };
    }
    case 'mansion':
      return {
        basement: { roles: [R('Cellar', 'stair'), R('Wine cellar'), R('Storage')], fallback: 'Storage', surface: 'earth' },
        floors: [
          {
            roles: [R('Entrance hall', 'stair'), R('Dining room', 'large'), R('Kitchen', 'back'), R('Pantry', 'small'), R('Parlour', 'front'), R('Study'), R('Servants\' hall', 'back')],
            fallback: 'Storeroom', surface: 'flags',
          },
          {
            roles: [R('Gallery', 'stair'), R('Master bedroom', 'large'), R('Dressing room', 'small'), R('Library'), R('Bedroom')],
            fallback: 'Bedroom', surface: 'boards',
          },
          ...Array.from({ length: storeys - 2 }, (): Program => ({
            roles: [R('Landing', 'stair'), R('Bedroom'), R('Nursery', 'small'), R('Bedroom')], fallback: 'Bedroom', surface: 'boards',
          })),
        ],
        attic: { ...loft, roles: [R('Servants\' garret', 'large')] },
      };
    case 'warehouse':
      return {
        basement: cellar,
        floors: [
          { roles: [R('Warehouse', 'large'), R('Counting room', 'front'), R('Office', 'small')], fallback: 'Warehouse', surface: 'flags' },
          ...Array.from({ length: storeys - 1 }, (): Program => ({ roles: [R('Storage loft', 'large')], fallback: 'Storage loft', merge: true, surface: 'boards' })),
        ],
        attic: loft,
      };
    case 'farmhouse':
      return {
        basement: { ...cellar, roles: [R('Root cellar', 'stair')] },
        floors: [{ roles: [R('Kitchen', 'large'), R('Common room', 'front'), R('Bedroom'), R('Larder', 'small'), R('Byre', 'back')], fallback: 'Storeroom', surface: 'flags' }],
        attic: { ...loft, roles: [R('Loft', 'large')] },
      };
    case 'cottage':
      return {
        basement: { ...cellar, roles: [R('Root cellar', 'stair')] },
        floors: [{ roles: [R('Main room', 'large'), R('Bedroom'), R('Storeroom', 'small')], fallback: 'Bedroom', surface: 'earth' }],
        attic: { ...loft, roles: [R('Loft', 'large')] },
      };
    case 'cabin':
      return { basement: cellar, floors: [{ roles: [R('Cabin', 'large'), R('Store', 'small')], fallback: 'Bunk room', surface: 'boards' }], attic: loft };
    case 'hut':
      return { basement: cellar, floors: [{ roles: [R('Hut', 'large'), R('Store', 'small')], fallback: 'Bunk room', surface: 'earth' }], attic: loft };
    case 'mill': {
      // A village's watermill or windmill grinds corn: millstones below, the grain bins over them.
      if (inp.ctx !== 'logging' && inp.ctx !== 'mining') {
        return {
          basement: cellar,
          floors: [
            { roles: [R('Millstones', 'large'), R('Store', 'small')], fallback: 'Store', surface: 'boards' },
            ...Array.from({ length: Math.max(0, storeys - 1) }, (): Program => ({ roles: [R('Grain floor', 'large')], fallback: 'Grain floor', merge: true, surface: 'boards' })),
          ],
          attic: { ...loft, roles: [R('Sail loft', 'large')] },
        };
      }
      const work = inp.ctx === 'logging' ? 'Sawmill' : 'Smelter';
      return { basement: cellar, floors: [{ roles: [R(work, 'large'), R('Store', 'small'), R('Office')], fallback: 'Store', surface: 'earth' }], attic: loft };
    }
    case 'witch':
      // Herbs drying from the beams, a cauldron on the hearth, and things best not asked about in the cellar.
      return {
        basement: { ...cellar, roles: [R('Root cellar', 'stair')] },
        floors: [{ roles: [R('Hearth room', 'large'), R('Herb room', 'small'), R('Bedroom')], fallback: 'Herb room', surface: 'earth' }],
        attic: { ...loft, roles: [R('Drying loft', 'large')] },
      };
    case 'store':
      return { basement: cellar, floors: [{ roles: [R('Storehouse', 'large')], fallback: 'Storehouse', merge: true, surface: 'earth' }], attic: loft };
    case 'hall':
      return { basement: cellar, floors: [{ roles: [R('Great hall', 'large'), R('Buttery', 'small'), R('Kitchen', 'back')], fallback: 'Pantry', surface: 'flags' }], attic: loft };
    case 'range':
      return {
        basement: cellar,
        floors: [
          { roles: [R('Refectory', 'large'), R('Kitchen', 'back'), R('Chapter house'), R('Warming room')], fallback: 'Storeroom', surface: 'flags' },
          ...Array.from({ length: storeys - 1 }, (): Program => ({ roles: [R('Dormitory', 'large')], fallback: 'Dormitory', merge: true, surface: 'boards' })),
        ],
        attic: loft,
      };
    case 'keep':
      return {
        basement: { roles: [R('Dungeon', 'stair'), R('Cell', 'small'), R('Cell', 'small'), R('Cell', 'small'), R('Cell', 'small'), R('Cell', 'small'), R('Gaoler\'s room')], fallback: 'Storeroom', surface: 'earth' },
        floors: [
          { roles: [R('Guardroom', 'stair'), R('Armoury'), R('Storeroom'), R('Well room', 'small'), R('Kitchen', 'back')], fallback: 'Storeroom', surface: 'flags' },
          { roles: [R('Great hall', 'large')], fallback: 'Great hall', merge: true, surface: 'flags' },
          ...Array.from({ length: storeys - 2 }, (): Program => ({
            roles: [R('Lord\'s chamber', 'large'), R('Solar'), R('Garderobe', 'small')], fallback: 'Chamber', surface: 'boards',
          })),
        ],
        attic: loft,
      };
    case 'prison':
      // The prison block: the guardroom and the gaoler by the door, cells on every floor, the
      // warden's lodging at the top, and the pit below.
      return {
        basement: { roles: [R('Stair foot', 'stair'), R('Oubliette', 'small'), R('Question room'), R('Deep cell', 'small'), R('Deep cell', 'small')], fallback: 'Deep cell', surface: 'earth' },
        floors: [
          { roles: [R('Guardroom', 'stair'), R("Gaoler's room", 'front'), R('Common cell', 'large'), R('Kitchen', 'back')], fallback: 'Cell', surface: 'flags' },
          ...Array.from({ length: storeys - 2 }, (): Program => ({ roles: [R("Turnkeys' post", 'stair'), R("Debtors' ward", 'large')], fallback: 'Cell', surface: 'flags' })),
          { roles: [R('Landing', 'stair'), R("Warden's lodging", 'large'), R("Warden's study")], fallback: 'Cell', surface: 'boards' },
        ],
        attic: loft,
      };
    case 'temple':
      // Temples get a fixed layout (see templeRooms); this program covers the crypt.
      return {
        basement: { roles: [R('Crypt', 'large')], fallback: 'Crypt', merge: true, surface: 'flags' },
        floors: [{ roles: [], fallback: 'Nave', surface: 'flags' }],
        attic: loft,
      };
  }
}

// ---------------------------------------------------------------------------------------------
// Generator

interface Ctx {
  g: Grid;
  nx: number;
  ny: number;
  cw: number;
  ch: number;
  rnd: () => number;
}

export function generateDwelling(inp: DwellingInput): Dwelling {
  const rnd = mulberry32(hash32(hashString(inp.seed) ^ hashString(inp.id)));
  const fp = inp.footprint;
  let cx = 0, cy = 0;
  for (const p of fp) {
    cx += p[0] / fp.length;
    cy += p[1] / fp.length;
  }
  // Orientation: the street front (or, for temples and halls, a short end) faces +v.
  let F: Pt;
  const edges = fp.map((a, k) => {
    const b = fp[(k + 1) % fp.length];
    const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let n: Pt = [(b[1] - a[1]) / (len || 1), -(b[0] - a[0]) / (len || 1)];
    if ((m[0] - cx) * n[0] + (m[1] - cy) * n[1] < 0) n = [-n[0], -n[1]];
    return { len, n };
  });
  const longest = edges.reduce((a, b) => (b.len > a.len ? b : a));
  const shortest = edges.filter((e) => e.len > 1).reduce((a, b) => (b.len < a.len ? b : a), longest);
  if (inp.use === 'temple' || inp.use === 'hall') F = shortest.n;
  else if (inp.front !== undefined) {
    // Snap the street direction to the nearest edge normal so the grid lines up with the walls.
    const f: Pt = [Math.cos(inp.front), Math.sin(inp.front)];
    F = edges.filter((e) => e.len > 1).reduce((a, b) => (b.n[0] * f[0] + b.n[1] * f[1] > a.n[0] * f[0] + a.n[1] * f[1] ? b : a), longest).n;
  } else F = longest.n;
  const ev: Pt = F, eu: Pt = [-F[1], F[0]];
  const uv = fp.map((p): Pt => [(p[0] - cx) * eu[0] + (p[1] - cy) * eu[1], (p[0] - cx) * ev[0] + (p[1] - cy) * ev[1]]);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [u, v] of uv) {
    u0 = Math.min(u0, u); u1 = Math.max(u1, u);
    v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const nx = Math.max(2, Math.round((u1 - u0) / CELL_M)), ny = Math.max(2, Math.round((v1 - v0) / CELL_M));
  const cw = (u1 - u0) / nx, ch = (v1 - v0) / ny;
  const mask = new Uint8Array(nx * ny);
  const full = new Uint8Array(nx * ny);
  const convex = isConvex(uv);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      // Coverage from a 3×3 sample of the cell.
      let n = 0;
      for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) if (pointInPoly(uv, u0 + (i + (a + 0.5) / 3) * cw, v0 + (j + (b + 0.5) / 3) * ch)) n++;
      mask[j * nx + i] = (convex ? n >= 2 : n >= 5) ? 1 : 0;
      full[j * nx + i] = n === 9 || (!convex && n >= 5) ? 1 : 0;
    }
  }
  cleanMask(mask, nx, ny);
  for (let k = 0; k < nx * ny; k++) if (!mask[k]) full[k] = 0;
  const poly: Pt[] | undefined = convex ? uv.map(([u, v]): Pt => [(u - u0) / cw, (v - v0) / ch]) : undefined;
  const g = new Grid(nx, ny, mask, full);
  const cells = mask.reduce((a, b) => a + b, 0);
  const areaM2 = cells * cw * ch;
  const kind = classify(inp, areaM2, rnd);
  const c: Ctx = { g, nx, ny, cw, ch, rnd };

  // Storeys, basement and roof by type.
  const STOREYS: Record<Kind, () => number> = {
    townhouse: () => (areaM2 < 45 ? 2 : 2 + (rnd() < 0.45 ? 1 : 0)), mansion: () => 3, warehouse: () => 2, cottage: () => 1,
    farmhouse: () => 1, cabin: () => 1, hut: () => 1, temple: () => 1, keep: () => 3 + (rnd() < 0.4 ? 1 : 0),
    hall: () => 1, store: () => 1, mill: () => (inp.ctx === 'logging' || inp.ctx === 'mining' ? 1 : 2), range: () => 2, inn: () => (areaM2 < 60 ? 2 : 3), civic: () => 2,
    library: () => 2, barracks: () => 2, stables: () => 1, bathhouse: () => 1, university: () => 2 + (areaM2 > 160 ? 1 : 0), guild: () => 2 + (rnd() < 0.35 ? 1 : 0), witch: () => 1,
    tower: () => 4 + (rnd() < 0.5 ? 1 : 0), bank: () => 2 + (rnd() < 0.4 ? 1 : 0), shrine: () => 1, burrow: () => 1, prison: () => 3,
  };
  const BASEMENT: Record<Kind, number> = {
    townhouse: 0.5, mansion: 0.85, warehouse: 0.6, cottage: 0.12, farmhouse: 0.25, cabin: 0, hut: 0, temple: 0.6,
    keep: 0.9, hall: 0.3, store: 0.2, mill: 0, range: 0.3, inn: 0.85, civic: 0.6, library: 0.4, barracks: 0.3, stables: 0,
    bathhouse: 0.5, university: 0.6, guild: 0.75, witch: 0.7, tower: 0.8, bank: 1, shrine: 0.5, burrow: 0.8, prison: 1,
  };
  const storeys = STOREYS[kind]();
  const storeyH = kind === 'temple' ? 8 : kind === 'hall' || kind === 'mill' ? 5 : kind === 'keep' || kind === 'prison' ? 4 : kind === 'burrow' ? 2.4 : 3;
  const style = buildStyle(inp.culture, kind);
  const fill = poly ? Math.abs(polyArea(poly)) / (nx * ny) : cells / (nx * ny);
  const pitchK = style?.form === 'steep' ? 1.45 : style?.form === 'low' || style?.form === 'upturned' ? 0.7 : 1;
  const roof: Roof = kind === 'keep' || kind === 'prison' || (style?.form === 'flat' && kind !== 'burrow')
    ? { type: 'flat', pitch: 0, axis: 'u' }
    : kind === 'burrow'
      ? { type: 'mound', pitch: 0.55, axis: nx * cw >= ny * ch ? 'u' : 'v' }
    : {
        // Upturned eaves sweep round hipped roofs.
        type: fill > 0.88 && kind !== 'mansion' && style?.form !== 'upturned' ? 'gable' : 'hip',
        pitch: (kind === 'warehouse' ? 0.75 : kind === 'temple' ? 0.9 : 1.05) * pitchK,
        axis: nx * cw >= ny * ch ? 'u' : 'v',
      };
  const d: Dwelling = {
    id: inp.id, label: (inp.role && ROLE_LABEL[inp.role]) || LABELS[kind], title: inp.name, nx, ny, cw, ch,
    origin: [cx + u0 * eu[0] + v0 * ev[0], cy + u0 * eu[1] + v0 * ev[1]], eu, ev,
    mask, full, poly, floors: [], ground: 0, storeys, storeyH, roof, chimneys: [], style,
  };
  if (cells < 4) {
    // Too small to partition: a single room.
    const room = new Int16Array(nx * ny).fill(-1);
    const all: number[] = [];
    mask.forEach((m, k) => {
      if (m) {
        room[k] = 0;
        all.push(k);
      }
    });
    d.floors.push({ level: 0, name: 'Ground floor', room, rooms: [{ name: LABELS[kind], cells: all }], openings: [], stairs: [], items: [], surface: 'earth' });
    return d;
  }

  const roomArea: Record<Kind, number> = {
    townhouse: 14, mansion: 20, warehouse: 45, cottage: 16, farmhouse: 15, cabin: 18, hut: 14, temple: 1, keep: 45,
    hall: 30, store: 999, mill: 35, range: 30, inn: 13, civic: 30, library: 25, barracks: 30, stables: 40, bathhouse: 25, university: 28, guild: 22, witch: 12,
    tower: 30, bank: 18, shrine: 999, burrow: 1, prison: 9,
  };
  const maxRooms: Record<Kind, number> = {
    townhouse: 5, mansion: 8, warehouse: 3, cottage: 3, farmhouse: 5, cabin: 2, hut: 2, temple: 1, keep: 6,
    hall: 3, store: 1, mill: 3, range: 4, inn: 6, civic: 4, library: 3, barracks: 3, stables: 2, bathhouse: 3, university: 5, guild: 5, witch: 3,
    tower: 3, bank: 5, shrine: 1, burrow: 1, prison: 14,
  };
  const nRooms = Math.max(1, Math.min(maxRooms[kind], Math.round(areaM2 / roomArea[kind])));
  const leaves = kind === 'temple' ? templeLeaves(c) : kind === 'burrow' ? burrowLeaves(c) : partition(g, nRooms, cw, ch, rnd);
  const progs = programs(kind, inp, storeys, rnd);

  // Which floors exist.
  const hasBasement = rnd() < (inp.role === 'winepress' ? 1 : BASEMENT[kind]);
  const atticMask = roof.type === 'flat' ? null : atticCells(d);
  const atticCount = atticMask ? atticMask.reduce((a, b) => a + b, 0) : 0;
  const wantAttic = atticCount >= 4 && kind !== 'temple' && kind !== 'burrow' && kind !== 'store' && kind !== 'hut' && (storeys > 1 || rnd() < 0.6);
  const needStairs = storeys > 1 || hasBasement || wantAttic;

  // Stairs: one stairwell shared by every floor (a ladder in cottages, a spiral stair in keeps).
  const stairKind: Stair['kind'] = kind === 'keep' ? 'spiral' : storeys === 1 ? 'ladder' : 'stair';
  let stairLeaf = -1;
  let stairCells: number[] = [];
  let stair: Stair | null = null;
  if (needStairs) {
    const found = placeStair(c, leaves, stairKind, wantAttic ? atticMask : null);
    if (found) ({ leaf: stairLeaf, cells: stairCells, stair } = found);
  }
  const attic = wantAttic && stair !== null;
  const basement = hasBasement && stair !== null;
  const upper = stair !== null ? storeys : 1;

  const levels: number[] = [];
  if (basement) levels.push(-1);
  for (let l = 0; l < upper; l++) levels.push(l);
  if (attic) levels.push(upper);
  for (const level of levels) {
    const isAttic = attic && level === upper;
    let prog = level < 0 ? progs.basement : isAttic ? progs.attic : progs.floors[Math.min(level, progs.floors.length - 1)];
    // Cellars are one open vault (keeps keep their dungeon cells).
    if (level < 0 && kind !== 'keep') {
      const nm = prog.roles.some((x) => x.name === 'Wine cellar') ? 'Wine cellar' : prog.roles[0]?.name ?? 'Cellar';
      prog = { ...prog, merge: true, roles: [R(nm, 'large')] };
    }
    const floorMask = isAttic ? atticMask! : mask;
    const f = buildFloor(c, d, kind, level, isAttic, floorMask, leaves, prog, stairLeaf, (kind === 'temple' || kind === 'burrow') && level === 0);
    if (stair) {
      const top = level === levels[levels.length - 1], bottom = level === levels[0];
      f.stairs.push({ ...stair, up: !top, down: !bottom });
    }
    d.floors.push(f);
  }
  d.ground = levels.indexOf(0);
  for (const f of d.floors) {
    openings(c, d, kind, f, stairCells, inp);
    furnish(c, d, kind, f, stairCells);
  }
  return d;
}

function polyArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return a / 2;
}

function isConvex(p: Pt[]): boolean {
  let sign = 0;
  for (let k = 0; k < p.length; k++) {
    const a = p[k], b = p[(k + 1) % p.length], c = p[(k + 2) % p.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cr);
    else if (Math.sign(cr) !== sign) return false;
  }
  return p.length >= 3;
}

/** Drops spur cells (fewer than two neighbours) and keeps the largest connected piece. */
function cleanMask(mask: Uint8Array, nx: number, ny: number): void {
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && mask[j * nx + i] === 1;
  for (let changed = true; changed;) {
    changed = false;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (!at(i, j)) continue;
        const n = NB.filter(([di, dj]) => at(i + di, j + dj)).length;
        if (n < 2) {
          mask[j * nx + i] = 0;
          changed = true;
        }
      }
    }
  }
  const comp = new Int32Array(nx * ny).fill(-1);
  let best = -1, bestN = 0;
  for (let k = 0, id = 0; k < nx * ny; k++) {
    if (!mask[k] || comp[k] >= 0) continue;
    const stack = [k];
    comp[k] = id;
    let n = 0;
    while (stack.length) {
      const q = stack.pop()!;
      n++;
      const i = q % nx, j = (q / nx) | 0;
      for (const [di, dj] of NB) {
        if (!at(i + di, j + dj)) continue;
        const r = (j + dj) * nx + i + di;
        if (comp[r] < 0) {
          comp[r] = id;
          stack.push(r);
        }
      }
    }
    if (n > bestN) {
      bestN = n;
      best = id;
    }
    id++;
  }
  for (let k = 0; k < nx * ny; k++) if (comp[k] !== best) mask[k] = 0;
}

/** Temple: a nave toward the entrance, a sanctuary at the far end with a vestry beside it. */
/**
 * A temple's rooms, named in order by TEMPLE_ROOMS: the nave down the middle (with aisles either
 * side in a wide temple), the sanctuary at the far end with the vestry beside it, a porch inside
 * the door of a long one, and side chapels off the aisles of a large one.
 */
function templeLeaves(c: Ctx): Leaf[] {
  const { g, nx, ny } = c;
  const back = Math.max(2, Math.round(ny * 0.24));
  const vw = nx >= 6 ? Math.max(2, Math.round(nx * 0.3)) : 0;
  const porch = ny >= 16 ? 2 : 0;
  const aisle = nx >= 10 ? Math.max(2, Math.round(nx * 0.2)) : 0;
  const chapels = aisle && ny - back - porch >= 12;
  const leaves: (Leaf & { name: string })[] = [];
  const add = (name: string, i0: number, j0: number, i1: number, j1: number) => {
    const cells = leafCells(g, i0, j0, i1, j1);
    if (cells.length) leaves.push({ i0, j0, i1, j1, cells, name });
  };
  add('Nave', aisle, back, nx - aisle, ny - porch);
  add('Sanctuary', 0, 0, nx - vw, back);
  if (vw) add('Vestry', nx - vw, 0, nx, back);
  if (porch) add('Porch', 0, ny - porch, nx, ny);
  if (aisle) {
    // Aisles, with a side chapel at the sanctuary end of each in a large temple.
    const cl = chapels ? Math.max(3, Math.round((ny - back - porch) * 0.3)) : 0;
    add('Aisle', 0, back + cl, aisle, ny - porch);
    add('Aisle', nx - aisle, back + cl, nx, ny - porch);
    if (cl) {
      add('Side chapel', 0, back, aisle, back + cl);
      add('Side chapel', nx - aisle, back, nx, back + cl);
    }
  }
  TEMPLE_ROOMS.set(c, leaves.map((l) => l.name));
  return leaves;
}
const TEMPLE_ROOMS = new WeakMap<Ctx, string[]>();

/**
 * A burrow's rooms: a passage down the long middle of the mound (the front door at one end), and
 * rooms either side of it in runs of three to five cells, named in the order a halfling would
 * want them: parlour and kitchen nearest the door, pantries and larders, then the bedrooms.
 */
function burrowLeaves(c: Ctx): Leaf[] {
  const { g, nx, ny, rnd } = c;
  const alongV = ny >= nx;
  const n = alongV ? nx : ny, m = alongV ? ny : nx;
  const pw = n >= 7 ? 2 : 1;
  const p0 = Math.floor((n - pw) / 2), p1 = p0 + pw;
  const leaves: (Leaf & { name: string })[] = [];
  const add = (name: string, a0: number, b0: number, a1: number, b1: number) => {
    // (a along the passage, b across it).
    const [i0, j0, i1, j1] = alongV ? [b0, a0, b1, a1] : [a0, b0, a1, b1];
    const cells = leafCells(g, i0, j0, i1, j1);
    if (cells.length) leaves.push({ i0, j0, i1, j1, cells, name });
  };
  add('Passage', 0, p0, m, p1);
  const NAMES = ['Parlour', 'Kitchen', 'Pantry', 'Dining room', 'Bedroom', 'Larder', 'Study', 'Bedroom', 'Pantry', 'Guest room', 'Bedroom', 'Dressing room', 'Bedroom', 'Storage'];
  // The door is at the +v end (the street front); rooms are named from there inward.
  const runs: [number, number][] = [];
  for (let a = m; a > 0;) {
    const len = Math.min(a, 3 + Math.floor(rnd() * 3));
    runs.push([a - len, a]);
    a -= len;
  }
  let k = 0;
  for (const [a0, a1] of runs) {
    for (const [b0, b1] of [[0, p0], [p1, n]] as [number, number][]) {
      if (b1 - b0 < 2) continue;
      add(NAMES[k % NAMES.length], a0, b0, a1, b1);
      k++;
    }
  }
  TEMPLE_ROOMS.set(c, leaves.map((l) => l.name));
  return leaves;
}

/** Height (m) of the roof surface above the wall plate at grid point (u, v) in cell units. */
export function roofHeight(d: Dwelling, u: number, v: number): number {
  const { roof, cw, ch } = d;
  if (roof.type === 'flat') return 0;
  const bounds = maskBounds(d);
  if (roof.type === 'gable') {
    const dist = roof.axis === 'u'
      ? Math.min(v - bounds.j0, bounds.j1 - v) * ch
      : Math.min(u - bounds.i0, bounds.i1 - u) * cw;
    return Math.max(0, dist) * roof.pitch;
  }
  // Hip: distance to the nearest outline edge (a straight-skeleton roof on a convex or rectilinear plan).
  let best = Infinity;
  const edges = d.poly ? d.poly.map((a, k) => [a[0], a[1], d.poly![(k + 1) % d.poly!.length][0], d.poly![(k + 1) % d.poly!.length][1]]) : outline(d);
  for (const e of edges) {
    const ax = e[0] * cw, ay = e[1] * ch, bx = e[2] * cw, by = e[3] * ch, px = u * cw, py = v * ch;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(px - ax - dx * t, py - ay - dy * t));
  }
  if (roof.type === 'mound') {
    // A burrow's mound: a rounded dome of turf rather than straight slopes.
    const R = Math.max(0.5, Math.min((bounds.i1 - bounds.i0) * cw, (bounds.j1 - bounds.j0) * ch) / 2);
    const t = Math.min(1, best / R);
    return R * roof.pitch * Math.sqrt(1 - (1 - t) * (1 - t));
  }
  return best * roof.pitch;
}

const boundsCache = new WeakMap<Dwelling, { i0: number; j0: number; i1: number; j1: number }>();
function maskBounds(d: Dwelling) {
  let b = boundsCache.get(d);
  if (!b) {
    b = { i0: Infinity, j0: Infinity, i1: -Infinity, j1: -Infinity };
    for (let k = 0; k < d.mask.length; k++) {
      if (!d.mask[k]) continue;
      const i = k % d.nx, j = (k / d.nx) | 0;
      b.i0 = Math.min(b.i0, i); b.j0 = Math.min(b.j0, j);
      b.i1 = Math.max(b.i1, i + 1); b.j1 = Math.max(b.j1, j + 1);
    }
    boundsCache.set(d, b);
  }
  return b;
}

const outlineCache = new WeakMap<Dwelling, number[][]>();
/** Outline edges of the footprint mask as [u0, v0, u1, v1] in cell units. */
export function outline(d: Dwelling): number[][] {
  let o = outlineCache.get(d);
  if (o) return o;
  o = [];
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < d.nx && j < d.ny && d.mask[j * d.nx + i] === 1;
  for (let j = 0; j < d.ny; j++) {
    for (let i = 0; i < d.nx; i++) {
      if (!at(i, j)) continue;
      if (!at(i, j - 1)) o.push([i, j, i + 1, j]);
      if (!at(i + 1, j)) o.push([i + 1, j, i + 1, j + 1]);
      if (!at(i, j + 1)) o.push([i, j + 1, i + 1, j + 1]);
      if (!at(i - 1, j)) o.push([i, j, i, j + 1]);
    }
  }
  outlineCache.set(d, o);
  return o;
}

/** Cells with headroom under the roof (at least 1.7 m at the cell centre). */
function atticCells(d: Dwelling): Uint8Array {
  const m = new Uint8Array(d.nx * d.ny);
  for (let k = 0; k < m.length; k++) {
    if (!d.mask[k]) continue;
    const i = k % d.nx, j = (k / d.nx) | 0;
    if (roofHeight(d, i + 0.5, j + 0.5) >= 1.7) m[k] = 1;
  }
  return m;
}

/** A stairwell inside one leaf, against a wall away from the front, under the ridge if there is an attic. */
function placeStair(c: Ctx, leaves: Leaf[], kind: Stair['kind'], attic: Uint8Array | null) {
  const { g, nx, ny, rnd } = c;
  const sizes: [number, number][] = kind === 'spiral' ? [[2, 2]] : kind === 'ladder' ? [[1, 1]] : [[1, 2], [2, 1]];
  let best: { leaf: number; cells: number[]; stair: Stair; score: number } | null = null;
  leaves.forEach((L, li) => {
    const inLeaf = new Set(L.cells);
    for (const [w, h] of sizes) {
      for (let j = L.j0; j + h <= L.j1; j++) {
        for (let i = L.i0; i + w <= L.i1; i++) {
          const cells: number[] = [];
          let ok = true;
          for (let dj = 0; dj < h && ok; dj++) {
            for (let di = 0; di < w && ok; di++) {
              const k = (j + dj) * nx + i + di;
              if (!inLeaf.has(k) || !g.full[k] || (attic && !attic[k])) ok = false;
              cells.push(k);
            }
          }
          if (!ok) continue;
          // Must leave the rest of the leaf usable and touch a wall.
          if (L.cells.length - cells.length < 2) continue;
          const touchesWall = cells.some((k) => {
            const ci = k % nx, cj = (k / nx) | 0;
            return NB.some(([di, dj]) => !inLeaf.has((cj + dj) * nx + ci + di) || !g.in(ci + di, cj + dj));
          });
          if (!touchesWall) continue;
          const frontGap = ny - (j + h);
          const centre = Math.abs(i + w / 2 - nx / 2) / nx + Math.abs(j + h / 2 - ny / 2) / ny;
          const score = Math.min(3, frontGap) - 2 * centre + rnd() * 0.8;
          if (!best || score > best.score) {
            const dir: Pt = w > h ? [1, 0] : [0, -1];
            best = { leaf: li, cells, score, stair: { i, j, w, h, dir, kind, up: true, down: true } };
          }
        }
      }
    }
  });
  return best as { leaf: number; cells: number[]; stair: Stair; score: number } | null;
}

function buildFloor(
  c: Ctx, d: Dwelling, kind: Kind, level: number, isAttic: boolean, floorMask: Uint8Array, leaves: Leaf[],
  prog: Program, stairLeaf: number, temple: boolean,
): Floor {
  const { nx, ny, rnd } = c;
  const room = new Int16Array(nx * ny).fill(-1);
  const rooms: Room[] = [];
  const name = level < 0 ? 'Basement' : isAttic ? (kind === 'cottage' || kind === 'farmhouse' ? 'Loft' : 'Attic')
    : level === 0 ? 'Ground floor' : `${ordinal(level)} floor`;
  if (temple) {
    const names = TEMPLE_ROOMS.get(c) ?? ['Nave', 'Sanctuary', 'Vestry'];
    leaves.forEach((L, li) => {
      const cells = L.cells.filter((k) => floorMask[k]);
      for (const k of cells) room[k] = rooms.length;
      rooms.push({ name: names[li] ?? 'Chapel', cells });
    });
    return { level, name, room, rooms, openings: [], stairs: [], items: [], surface: kind === 'burrow' ? 'boards' : 'flags' };
  }
  if (prog.merge || isAttic) {
    const cells: number[] = [];
    for (let k = 0; k < nx * ny; k++) if (floorMask[k]) cells.push(k);
    for (const k of cells) room[k] = 0;
    rooms.push({ name: prog.roles[0]?.name ?? prog.fallback, cells });
    return { level, name, room, rooms, openings: [], stairs: [], items: [], surface: prog.surface };
  }
  const L = leaves.map((lf, li) => ({ li, cells: lf.cells.filter((k) => floorMask[k]), lf }));
  const front = (x: (typeof L)[number]) => x.cells.some((k) => {
    const i = k % nx, j = (k / nx) | 0;
    return !c.g.in(i, j + 1);
  });
  const backness = (x: (typeof L)[number]) => 1 - x.cells.reduce((a, k) => a + ((k / nx) | 0), 0) / x.cells.length / ny;
  const names = new Array<string | null>(L.length).fill(null);
  for (const role of prog.roles) {
    let best = -1, bestS = -Infinity;
    L.forEach((x, idx) => {
      if (names[idx] !== null || !x.cells.length) return;
      let s = rnd() * 0.3;
      switch (role.pref) {
        case 'stair': s += x.li === stairLeaf ? 10 : -10; break;
        case 'front': s += front(x) ? 2 : 0; break;
        case 'back': s += backness(x) * 2 + (front(x) ? -1 : 0); break;
        case 'large': s += x.cells.length / 10; break;
        case 'small': s -= x.cells.length / 10; break;
      }
      if (role.pref !== 'stair' && x.li === stairLeaf) s -= 5;
      if (s > bestS) {
        bestS = s;
        best = idx;
      }
    });
    if (best >= 0 && (role.pref !== 'stair' || L[best].li === stairLeaf)) names[best] = role.name;
  }
  L.forEach((x, idx) => {
    if (!x.cells.length) return;
    for (const k of x.cells) room[k] = rooms.length;
    rooms.push({ name: names[idx] ?? prog.fallback, cells: x.cells });
  });
  return { level, name, room, rooms, openings: [], stairs: [], items: [], surface: prog.surface };
}

function ordinal(n: number): string {
  return n === 1 ? 'First' : n === 2 ? 'Second' : n === 3 ? 'Third' : `${n}th`;
}

// ---------------------------------------------------------------------------------------------
// Doors and windows

function openings(c: Ctx, d: Dwelling, kind: Kind, f: Floor, stairCells: number[], inp: DwellingInput): void {
  const { nx, ny, g, rnd } = c;
  if (!f.rooms.length) return;
  const stair = new Set(stairCells);
  const inFloor = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && f.room[j * nx + i] >= 0;
  // Shared edges between rooms.
  const pairs = new Map<string, { a: number; b: number; edges: Opening[] }>();
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const ra = f.room[j * nx + i];
      if (ra < 0) continue;
      for (const [di, dj, side] of [[1, 0, 'e'], [0, 1, 's']] as [number, number, EdgeSide][]) {
        if (!inFloor(i + di, j + dj)) continue;
        const rb = f.room[(j + dj) * nx + i + di];
        if (rb === ra) continue;
        const key = `${Math.min(ra, rb)}|${Math.max(ra, rb)}`;
        let p = pairs.get(key);
        if (!p) pairs.set(key, (p = { a: Math.min(ra, rb), b: Math.max(ra, rb), edges: [] }));
        p.edges.push({ i, j, side, kind: 'door' });
      }
    }
  }
  const edgeCells = (e: Opening): number[] => [e.j * nx + e.i, e.side === 'e' ? e.j * nx + e.i + 1 : (e.j + 1) * nx + e.i];
  const pickEdge = (edges: Opening[]): Opening => {
    const clear = edges.filter((e) => !edgeCells(e).some((k) => stair.has(k) || !g.full[k]));
    const pool = clear.length ? clear : edges;
    const sorted = [...pool].sort((x, y) => x.i + x.j - (y.i + y.j));
    const m = (sorted.length - 1) / 2;
    return sorted[Math.max(0, Math.min(sorted.length - 1, Math.round(m + (rnd() - 0.5) * (sorted.length - 1) * 0.6)))];
  };

  // Root: the entrance room on the ground floor, the stairwell elsewhere.
  const stairRoom = stairCells.length ? f.room[stairCells[0]] : -1;
  const frontEdges = (r: number): Opening[] => {
    const out: Opening[] = [];
    for (const k of f.rooms[r].cells) {
      const i = k % nx, j = (k / nx) | 0;
      if (!g.in(i, j + 1) && !stair.has(k)) out.push({ i, j, side: 's', kind: 'entrance' });
    }
    return out;
  };
  let root = stairRoom >= 0 ? stairRoom : 0;
  if (f.level === 0) {
    const pref = /Hall|Entrance|Shop|Taproom|Bakery|Workshop|Smithy|Main room|Common room|Nave|Kitchen|Warehouse|Guardroom|Cabin|Hut|Refectory|Sawmill|Smelter|Storehouse/;
    let best = -1, bestS = -Infinity;
    f.rooms.forEach((rm, r) => {
      const fe = frontEdges(r).length;
      if (!fe) return;
      const s = (pref.test(rm.name) ? 3 : 0) + (r === stairRoom ? 1.5 : 0) + Math.min(fe, 3) * 0.3 + rnd() * 0.5;
      if (s > bestS) {
        bestS = s;
        best = r;
      }
    });
    if (best >= 0) {
      root = best;
      const fe = frontEdges(best);
      const e = kind === 'temple' ? fe.reduce((a, b) => (Math.abs(b.i + 0.5 - nx / 2) < Math.abs(a.i + 0.5 - nx / 2) ? b : a)) : pickEdge(fe);
      f.openings.push({ ...e, kind: 'entrance' });
    }
  }

  // Doors: a spanning tree from the root, plus the odd extra door to make loops.
  const connected = new Set([root]);
  const used = new Set<string>();
  for (let guard = 0; guard < f.rooms.length * 2; guard++) {
    const cand = [...pairs.values()].filter((p) => connected.has(p.a) !== connected.has(p.b));
    if (!cand.length) break;
    // Prefer joining from the root or stair room so circulation stays short.
    cand.sort((x, y) => Number(y.a === root || y.b === root) - Number(x.a === root || x.b === root) + (rnd() - 0.5) * 0.8);
    const p = cand[0];
    f.openings.push(pickEdge(p.edges));
    used.add(`${p.a}|${p.b}`);
    connected.add(p.a);
    connected.add(p.b);
  }
  for (const p of pairs.values()) {
    if (used.has(`${p.a}|${p.b}`) || p.edges.length < 2 || rnd() > 0.15) continue;
    f.openings.push(pickEdge(p.edges));
  }

  // A back door from the kitchen or workshop.
  if (f.level === 0 && kind !== 'temple' && kind !== 'keep' && rnd() < 0.4) {
    const r = f.rooms.findIndex((rm) => /Kitchen|Workshop|Byre|Warehouse|Main room|Smithy/.test(rm.name));
    if (r >= 0) {
      const back = f.rooms[r].cells.filter((k) => !g.in(k % nx, ((k / nx) | 0) - 1) && !stair.has(k));
      if (back.length) {
        const k = back[Math.floor(rnd() * back.length)];
        f.openings.push({ i: k % nx, j: ((k / nx) | 0) - 1, side: 's', kind: 'entrance' });
      }
    }
  }

  // Windows on outside walls (none underground). Terraced town houses only light front and back.
  if (f.level < 0) return;
  const isAttic = f.level >= d.storeys;
  const terraced = (inp.ctx === 'ward' || inp.ctx === 'rich' || inp.ctx === 'harbour') && kind !== 'temple';
  const prob = kind === 'keep' ? 0.35 : kind === 'temple' ? 0.75 : kind === 'warehouse' || kind === 'store' ? 0.25 : kind === 'mansion' ? 0.75 : 0.55;
  const taken = new Set(f.openings.map(edgeKey));
  let last = '';
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!inFloor(i, j)) continue;
      for (const [di, dj, side] of NB) {
        if (g.in(i + di, j + dj)) continue;
        if (isAttic) {
          // Attics are lit only through the gable ends.
          if (d.roof.type !== 'gable' || (d.roof.axis === 'u' ? dj !== 0 : di !== 0)) continue;
        } else if (terraced && di !== 0) continue;
        const e = edgeOf(i, j, side);
        const key = edgeKey(e);
        if (taken.has(key)) continue;
        // Keep a solid pier beside corners and between windows.
        const along: [number, number] = di === 0 ? [1, 0] : [0, 1];
        const corner = !g.in(i + along[0], j + along[1]) || !g.in(i - along[0], j - along[1])
          || g.in(i + along[0] + di, j + along[1] + dj) || g.in(i - along[0] + di, j - along[1] + dj);
        if (corner && rnd() < 0.7) continue;
        const prevKey = edgeKey(edgeOf(i - along[0], j - along[1], side));
        if (prevKey === last || taken.has(prevKey)) continue;
        if (rnd() > prob) continue;
        f.openings.push({ ...e, kind: kind === 'keep' ? 'slit' : 'window' });
        taken.add(key);
        last = key;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Furniture

interface Spec {
  t: string;
  /** wall: against a wall; deep: against a wall, reaching two cells into the room; hearth: on an
   * outside wall; long: two cells along a wall; table: free-standing with chairs; grid: fills the room. */
  at: 'wall' | 'deep' | 'hearth' | 'long' | 'table' | 'grid' | 'rug';
  w: number;
  d: number;
  n?: number;
}
const S = (t: string, at: Spec['at'], w: number, d: number, n = 1): Spec => ({ t, at, w, d, n });

const BED = S('bed', 'deep', 0.95, 1.9), DBED = S('bed2', 'deep', 1.5, 2.0);
const CHEST = S('chest', 'wall', 0.9, 0.5), WARDROBE = S('wardrobe', 'wall', 1.2, 0.55), SHELF = S('shelf', 'wall', 1.3, 0.4);
const BARREL = S('barrel', 'wall', 0.7, 0.7), CRATE = S('crate', 'wall', 0.8, 0.8), SACK = S('sack', 'wall', 0.6, 0.5);
const HEARTH = S('hearth', 'hearth', 1.4, 0.65), TABLE = S('table', 'table', 0, 0), RUG = S('rug', 'rug', 0, 0);
const DESK = S('desk', 'wall', 1.2, 0.6), BOOKS = S('bookcase', 'long', 2.4, 0.45), BENCH = S('bench', 'long', 2.4, 0.45);
const WORKBENCH = S('workbench', 'long', 2.4, 0.8), COUNTER = S('counter', 'long', 2.6, 0.65);

const FURNITURE: [RegExp, Spec[]][] = [
  [/^(Hall|Entrance hall|Landing|Gallery)$/, [BENCH, CHEST, RUG]],
  [/^Bakery$/, [S('oven', 'hearth', 1.6, 1.0), COUNTER, SHELF, SACK, SACK, TABLE]],
  [/^(Shop|Apothecary|Pawnshop|Tailor|Butcher|Chandlery)$/, [COUNTER, SHELF, SHELF, CRATE, BARREL, CHEST]],
  [/Guest room|Best room/, [BED, CHEST, S('chair', 'wall', 0.6, 0.6)]],
  [/^Snug$/, [HEARTH, TABLE, BENCH]],
  [/Clerks' office|Scriptorium/, [DESK, DESK, BOOKS, CHEST]],
  [/Strongroom/, [CHEST, CHEST, CHEST, S('rack', 'long', 2.4, 0.5)]],
  [/Council chamber/, [HEARTH, S('table', 'table', 0, 0, 2), RUG, BOOKS]],
  [/Reading room/, [BOOKS, BOOKS, BOOKS, TABLE, TABLE, RUG]],
  [/^(Stacks|Archive)$/, [BOOKS, BOOKS, BOOKS, BOOKS, BOOKS, BOOKS]],
  [/Lecture (hall|room)|Disputation hall/, [DESK, S('bench', 'long', 2.4, 0.45, 4)]],
  [/^Map room$/, [S('table', 'table', 0, 0, 2), BOOKS, DESK, CHEST]],
  [/Drafting room/, [DESK, DESK, DESK, BOOKS]],
  [/^Laboratory$|Still room/, [S('furnace', 'hearth', 1.4, 1.0), WORKBENCH, WORKBENCH, SHELF, BOOKS]],
  [/Summoning chamber/, [RUG, S('altar', 'wall', 1.8, 0.8), S('candle', 'wall', 0.35, 0.35, 4)]],
  [/Observatory/, [DESK, BOOKS, TABLE]],
  [/Training hall/, [S('rack', 'long', 2.4, 0.5), S('rack', 'long', 2.4, 0.5), RUG, BENCH]],
  [/Notice hall/, [COUNTER, BENCH, BENCH, TABLE]],
  [/Infirmary|^Ward$/, [S('bed', 'deep', 0.9, 1.9, 6), CHEST, SHELF]],
  [/Master's lodging/, [DBED, HEARTH, DESK, BOOKS, RUG]],
  [/Warden's lodging/, [DBED, HEARTH, RUG, WARDROBE, CHEST]],
  [/^Question room$/, [TABLE, HEARTH, S('rack', 'long', 2.4, 0.5), CHEST]],
  [/Turnkeys' post|^Stair foot$/, [TABLE, BENCH, CHEST]],
  [/Scholars' room/, [BED, DESK, BOOKS, CHEST]],
  [/Barrack room/, [S('bed', 'deep', 0.9, 1.9, 10), CHEST, CHEST]],
  [/^Stalls$|Hayloft/, [S('straw', 'grid', 0, 0)]],
  [/Tack room/, [S('rack', 'long', 2.4, 0.5), CHEST, BARREL]],
  [/Bath hall/, [S('bath', 'grid', 0, 0)]],
  [/Changing room/, [BENCH, BENCH, CHEST]],
  [/Boiler room|Cistern/, [S('furnace', 'hearth', 1.8, 1.2), BARREL, BARREL]],
  [/^Workshop$/, [WORKBENCH, WORKBENCH, SHELF, CRATE, BARREL]],
  [/^Smithy$/, [S('forge', 'hearth', 1.5, 1.1), S('anvil', 'table', 0, 0), WORKBENCH, BARREL, CRATE]],
  [/^Taproom$/, [COUNTER, HEARTH, TABLE, TABLE, TABLE, BARREL, BARREL]],
  [/Kitchen/, [HEARTH, TABLE, SHELF, BARREL, SACK, SHELF]],
  [/Pantry|Larder|Buttery/, [SHELF, SHELF, BARREL, SACK, BARREL]],
  [/Armoury/, [S('rack', 'long', 2.4, 0.5), S('rack', 'long', 2.4, 0.5), CHEST, CHEST]],
  [/^(Store|Storeroom|Storage|Storehouse|Attic store)$/, [S('crate', 'grid', 0.85, 0.85)]],
  [/Parlour|Common room|Main room|Solar|Warming room/, [HEARTH, RUG, TABLE, S('chair', 'wall', 0.6, 0.6), BOOKS, CHEST]],
  [/Master bedroom|Lord's chamber/, [DBED, HEARTH, RUG, WARDROBE, CHEST, DESK]],
  [/^(Bedroom|Chamber)$/, [BED, CHEST, WARDROBE]],
  [/Closet|Dressing room/, [WARDROBE, WARDROBE, CHEST]],
  [/Nursery/, [BED, BED, CHEST, RUG]],
  [/Servants' (room|garret)|Dormitory|Bunk room|Garret|^Loft$/, [S('bed', 'deep', 0.9, 1.9, 6), CHEST, CHEST]],
  [/^Well room$/, [S('well', 'table', 0, 0), BARREL, BARREL, S('bucket', 'wall', 0.4, 0.4)]],
  [/Gaoler's room/, [TABLE, BED, CHEST, S('rack', 'long', 2.4, 0.5)]],
  [/Guardroom/, [TABLE, S('bed', 'deep', 0.9, 1.9, 2), S('rack', 'long', 2.4, 0.5), CHEST]],
  [/Great hall|Refectory|Mess hall/, [HEARTH, S('sideboard', 'long', 2.4, 0.55), S('trestle', 'grid', 0, 0)]],
  [/Dining room|^Hall$|Servants' hall/, [HEARTH, S('table', 'table', 0, 0, 2), S('sideboard', 'long', 2.4, 0.55)]],
  [/Study|Office|Counting room/, [DESK, BOOKS, CHEST]],
  [/Library/, [BOOKS, BOOKS, BOOKS, BOOKS, TABLE, RUG]],
  [/Cellar/, [S('barrel', 'wall', 0.75, 0.75, 8), CRATE, CRATE]],
  [/Warehouse|Storage loft|^Attic$/, [S('crate', 'grid', 0.9, 0.9)]],
  [/^Nave$/, [S('pew', 'grid', 0, 0)]],
  [/^Passage$/, [BENCH, CHEST, S('rug', 'rug', 0, 0), S('hatstand', 'wall', 0.5, 0.5)]],
  [/^Counting room$/, [COUNTER, DESK, DESK, BOOKS, CHEST]],
  [/^Vault$/, [S('chest', 'wall', 0.9, 0.5, 6), S('rack', 'long', 2.4, 0.5)]],
  [/^Shrine$/, [S('altar', 'wall', 1.8, 0.8), S('tomb', 'wall', 0.9, 2), S('candle', 'wall', 0.35, 0.35, 4), BENCH]],
  [/^Sanctuary$/, [S('altar', 'wall', 1.8, 0.8), S('candle', 'wall', 0.35, 0.35, 2)]],
  [/^Vestry$/, [WARDROBE, CHEST, DESK]],
  [/^Porch$/, [BENCH, BENCH, S('font', 'table', 0, 0)]],
  [/^Aisle$/, [S('candle', 'wall', 0.35, 0.35, 3), BENCH]],
  [/^Side chapel$/, [S('altar', 'wall', 1.2, 0.6), S('candle', 'wall', 0.35, 0.35, 2), S('tomb', 'wall', 0.9, 2)]],
  [/^Crypt$/, [S('tomb', 'grid', 0, 0)]],
  [/Chapter house/, [BENCH, BENCH, BENCH, S('chair', 'wall', 0.7, 0.7)]],
  [/Dungeon|^Cell$|^Deep cell$|^Oubliette$/, [S('straw', 'wall', 1.0, 1.4), S('bucket', 'wall', 0.4, 0.4)]],
  [/^Common cell$|Debtors' ward/, [S('straw', 'wall', 1.0, 1.4, 4), S('bucket', 'wall', 0.4, 0.4)]],
  [/Byre/, [S('straw', 'grid', 0, 0)]],
  [/Cabin|^Hut$/, [HEARTH, BED, TABLE, CHEST, BARREL]],
  [/^Millstones$/, [S('millstone', 'table', 0, 0), SACK, SACK, SACK, S('bin', 'wall', 1.2, 0.8)]],
  [/^Grain floor$/, [S('sack', 'grid', 0.8, 0.8)]],
  [/^Hearth room$/, [S('cauldron', 'hearth', 1.2, 1.2), TABLE, SHELF, BOOKS, CHEST, RUG]],
  [/^Herb room$|Drying loft/, [SHELF, SHELF, SHELF, WORKBENCH, SACK]],
  [/^Root cellar$/, [SHELF, BARREL, SACK, CHEST]],
  [/Sawmill/, [S('sawbench', 'long', 3.0, 1.0), S('logs', 'long', 2.8, 1.0), CRATE]],
  [/Smelter|^Foundry$/, [S('furnace', 'hearth', 1.8, 1.4), S('anvil', 'table', 0, 0), CRATE, BARREL]],
  [/Garderobe/, [S('privy', 'wall', 0.8, 0.6)]],
];

function furnish(c: Ctx, d: Dwelling, kind: Kind, f: Floor, stairCells: number[]): void {
  const { nx, ny, g, rnd, cw, ch } = c;
  const occupied = new Set<number>(stairCells);
  for (let k = 0; k < nx * ny; k++) if (f.room[k] >= 0 && !g.full[k]) occupied.add(k);
  const blocked = new Set<string>();
  for (const o of f.openings) {
    if (o.kind === 'window' || o.kind === 'slit') {
      blocked.add(`w:${edgeKey(o)}`);
      continue;
    }
    // Keep doorways clear on both sides.
    occupied.add(o.j * nx + o.i);
    occupied.add(o.side === 'e' ? o.j * nx + o.i + 1 : (o.j + 1) * nx + o.i);
    blocked.add(`d:${edgeKey(o)}`);
  }
  const inRoom = (r: number, i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && f.room[j * nx + i] === r;
  const isDoorEdge = (i: number, j: number, side: WallSide) => blocked.has(`d:${edgeKey(edgeOf(i, j, side))}`);
  const isWindowEdge = (i: number, j: number, side: WallSide) => blocked.has(`w:${edgeKey(edgeOf(i, j, side))}`);
  const T = 0.12; // wall clearance, cells

  /** Box against wall `side` of cell (i, j), w metres along the wall and dd metres deep. */
  const wallBox = (i: number, j: number, side: WallSide, w: number, dd: number, span = 1): Item => {
    const horiz = side === 'n' || side === 's';
    const wl = horiz ? w / cw : w / ch, dl = horiz ? dd / ch : dd / cw;
    const ca = horiz ? i + span / 2 : j + span / 2;
    const a0 = ca - wl / 2, a1 = ca + wl / 2;
    switch (side) {
      case 'n': return { type: '', x0: a0, x1: a1, y0: j + T, y1: j + T + dl, wall: side };
      case 's': return { type: '', x0: a0, x1: a1, y0: j + 1 - T - dl, y1: j + 1 - T, wall: side };
      case 'w': return { type: '', y0: a0, y1: a1, x0: i + T, x1: i + T + dl, wall: side };
      default: return { type: '', y0: a0, y1: a1, x0: i + 1 - T - dl, x1: i + 1 - T, wall: side };
    }
  };
  const shuffle = <T>(a: T[]) => {
    for (let k = a.length - 1; k > 0; k--) {
      const r = Math.floor(rnd() * (k + 1));
      [a[k], a[r]] = [a[r], a[k]];
    }
    return a;
  };

  f.rooms.forEach((room, r) => {
    const specs = FURNITURE.find(([re]) => re.test(room.name))?.[1] ?? [CHEST, CRATE];
    const free = () => room.cells.filter((k) => !occupied.has(k));
    const walls = (k: number) => {
      const i = k % nx, j = (k / nx) | 0;
      return NB.filter(([di, dj, side]) => !inRoom(r, i + di, j + dj) && !isDoorEdge(i, j, side)).map(([, , s]) => s);
    };
    for (const sp of specs) {
      // Rows of beds fill a dormitory or barrack room however long it is.
      const count = sp.t === 'bed' && (sp.n ?? 1) > 1 ? Math.max(sp.n ?? 1, Math.round(room.cells.length / 5)) : sp.n ?? 1;
      for (let n = 0; n < count; n++) {
        const cells = shuffle(free());
        let placed = false;
        switch (sp.at) {
          case 'wall':
          case 'hearth': {
            for (const k of cells) {
              const i = k % nx, j = (k / nx) | 0;
              const sides = walls(k).filter((s) => {
                if (sp.at !== 'hearth') return true;
                const [di, dj] = NB.find((x) => x[2] === s)!;
                return !g.in(i + di, j + dj) && !isWindowEdge(i, j, s);
              });
              if (!sides.length) continue;
              const side = sides[Math.floor(rnd() * sides.length)];
              f.items.push({ ...wallBox(i, j, side, sp.w, sp.d), type: sp.t });
              occupied.add(k);
              if (sp.at === 'hearth' && f.level >= 0) d.chimneys.push({ i, j, side });
              placed = true;
              break;
            }
            break;
          }
          case 'deep':
          case 'long': {
            for (const k of cells) {
              const i = k % nx, j = (k / nx) | 0;
              for (const side of shuffle(walls(k))) {
                const [di, dj] = NB.find((x) => x[2] === side)!;
                // deep: the next cell into the room; long: the next cell along the wall.
                const [oi, oj] = sp.at === 'deep' ? [-di, -dj] : [Math.abs(dj), Math.abs(di)];
                const k2 = (j + oj) * nx + i + oi;
                if (!inRoom(r, i + oi, j + oj) || occupied.has(k2)) continue;
                if (sp.at === 'long' && !walls(k2).includes(side)) continue;
                let it: Item;
                if (sp.at === 'deep') {
                  const depthCells = side === 'n' || side === 's' ? sp.d / ch : sp.d / cw;
                  if (depthCells > 2 - 2 * T) continue;
                  it = { ...wallBox(i, j, side, sp.w, sp.d), type: sp.t };
                } else {
                  const span = Math.min(sp.w, 2 * (side === 'n' || side === 's' ? cw : ch) - 0.3);
                  it = { ...wallBox(Math.min(i, i + oi), Math.min(j, j + oj), side, span, sp.d, 2), type: sp.t };
                }
                f.items.push(it);
                occupied.add(k);
                occupied.add(k2);
                placed = true;
                break;
              }
              if (placed) break;
            }
            break;
          }
          case 'table': {
            // Free-standing: prefer cells with the room on all four sides.
            const inner = cells.filter((k) => {
              const i = k % nx, j = (k / nx) | 0;
              return NB.every(([di, dj]) => inRoom(r, i + di, j + dj));
            });
            const pool = inner.length ? inner : cells.filter((k) => walls(k).length <= 1);
            for (const k of pool) {
              const i = k % nx, j = (k / nx) | 0;
              if (sp.t === 'anvil') {
                f.items.push({ type: 'anvil', x0: i + 0.3, x1: i + 0.7, y0: j + 0.38, y1: j + 0.62 });
                occupied.add(k);
                placed = true;
                break;
              }
              if (sp.t !== 'table') {
                // A round object standing alone (a millstone, a font, a well head), in its cell.
                const m = sp.t === 'millstone' ? 0.08 : 0.2;
                f.items.push({ type: sp.t, x0: i + m, x1: i + 1 - m, y0: j + m, y1: j + 1 - m });
                occupied.add(k);
                placed = true;
                break;
              }
              // A long table over two cells when there is room.
              const horiz = rnd() < 0.5 ? [1, 0] : [0, 1];
              const k2 = (j + horiz[1]) * nx + i + horiz[0];
              const two = inRoom(r, i + horiz[0], j + horiz[1]) && !occupied.has(k2) && pool.includes(k2);
              const x1 = i + 1 + (two ? horiz[0] : 0), y1 = j + 1 + (two ? horiz[1] : 0);
              const m = 0.28;
              const tb: Item = { type: 'table', x0: i + m, y0: j + m, x1: x1 - m, y1: y1 - m };
              f.items.push(tb);
              // Chairs along the long sides.
              const alongU = x1 - i >= y1 - j;
              const len = alongU ? tb.x1 - tb.x0 : tb.y1 - tb.y0;
              const nc = Math.max(1, Math.floor((len * (alongU ? cw : ch)) / 0.75));
              for (let q = 0; q < nc; q++) {
                const t = (alongU ? tb.x0 : tb.y0) + ((q + 0.5) * len) / nc;
                const s = 0.14;
                if (alongU) {
                  f.items.push({ type: 'chair', x0: t - s, x1: t + s, y0: tb.y0 - 0.22 - s, y1: tb.y0 - 0.22 + s });
                  f.items.push({ type: 'chair', x0: t - s, x1: t + s, y0: tb.y1 + 0.22 - s, y1: tb.y1 + 0.22 + s });
                } else {
                  f.items.push({ type: 'chair', y0: t - s, y1: t + s, x0: tb.x0 - 0.22 - s, x1: tb.x0 - 0.22 + s });
                  f.items.push({ type: 'chair', y0: t - s, y1: t + s, x0: tb.x1 + 0.22 - s, x1: tb.x1 + 0.22 + s });
                }
              }
              occupied.add(k);
              if (two) occupied.add(k2);
              placed = true;
              break;
            }
            break;
          }
          case 'rug': {
            const inner = room.cells.filter((k) => {
              const i = k % nx, j = (k / nx) | 0;
              return NB.every(([di, dj]) => inRoom(r, i + di, j + dj));
            });
            if (inner.length < 2) break;
            let i0 = Infinity, j0 = Infinity, i1 = -Infinity, j1 = -Infinity;
            for (const k of inner) {
              const i = k % nx, j = (k / nx) | 0;
              i0 = Math.min(i0, i); j0 = Math.min(j0, j); i1 = Math.max(i1, i + 1); j1 = Math.max(j1, j + 1);
            }
            f.items.unshift({ type: 'rug', x0: i0 + 0.15, y0: j0 + 0.15, x1: i1 - 0.15, y1: j1 - 0.15 });
            placed = true;
            break;
          }
          case 'grid': {
            fillGrid(c, f, r, room, sp.t, occupied, rnd);
            placed = true;
            break;
          }
        }
        if (!placed) break;
      }
    }
  });
  void kind;
}

/** Rows of pews with a central aisle, rows of tombs, or stacked goods filling a room. */
function fillGrid(c: Ctx, f: Floor, r: number, room: Room, t: string, occupied: Set<number>, rnd: () => number): void {
  const { nx } = c;
  let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
  for (const k of room.cells) {
    const i = k % nx, j = (k / nx) | 0;
    i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
  }
  const mid = (i0 + i1) / 2;
  for (const k of room.cells) {
    if (occupied.has(k)) continue;
    const i = k % nx, j = (k / nx) | 0;
    switch (t) {
      case 'pew':
        // Leave the aisle, the front row by the altar and the entrance row clear.
        if (Math.abs(i - mid) < 0.75 || j <= j0 || j >= j1) continue;
        f.items.push({ type: 'pew', x0: i + 0.05, x1: i + 0.95, y0: j + 0.3, y1: j + 0.62 });
        break;
      case 'trestle': {
        // Long tables with benches down the hall in runs of up to five cells, a cell between the
        // runs, and the high table across the top.
        const run = (j - j0 - 3) % 6;
        if (j === j0 + 1 && i > i0 && i < i1) {
          f.items.push({ type: 'table', x0: i, x1: i + 1, y0: j + 0.2, y1: j + 0.75 });
          if ((i - i0) % 2) f.items.push({ type: 'chair', x0: i + 0.36, x1: i + 0.64, y0: j - 0.2, y1: j + 0.08 });
          break;
        }
        if ((i - i0) % 3 !== 2 || i >= i1 || j < j0 + 3 || j >= j1 || run === 5) continue;
        f.items.push({ type: 'table', x0: i + 0.22, x1: i + 0.78, y0: j + (run === 0 ? 0.1 : 0), y1: j + (run === 4 || j === j1 - 1 ? 0.9 : 1) });
        f.items.push({ type: 'bench', x0: i - 0.2, x1: i + 0.06, y0: j + 0.1, y1: j + 0.9 });
        f.items.push({ type: 'bench', x0: i + 0.94, x1: i + 1.2, y0: j + 0.1, y1: j + 0.9 });
        break;
      }
      case 'tomb':
        if ((i - i0) % 2 === 1 || (j - j0) % 3 === 2) continue;
        f.items.push({ type: 'tomb', x0: i + 0.18, x1: i + 0.82, y0: j + 0.15, y1: j + 1.85 > j1 + 1 ? j + 0.85 : j + 1.7 });
        break;
      case 'bath':
        if ((i - i0) % 2 || (j - j0) % 2) continue;
        f.items.push({ type: 'bath', x0: i + 0.12, x1: i + 0.88, y0: j + 0.2, y1: j + 0.8 });
        break;
      case 'straw':
        if (rnd() < 0.5) continue;
        f.items.push({ type: 'straw', x0: i + 0.1, x1: i + 0.9, y0: j + 0.1, y1: j + 0.9 });
        break;
      default: {
        // Goods stacked in bays with walkways: keep every third row and column clear.
        if ((i - i0) % 3 === 2 || (j - j0) % 3 === 2 || rnd() < 0.25) continue;
        const types = ['crate', 'crate', 'barrel', 'sack'];
        const ty = types[Math.floor(rnd() * types.length)];
        const s = ty === 'barrel' ? 0.42 : ty === 'sack' ? 0.36 : 0.44;
        f.items.push({ type: ty, x0: i + 0.5 - s, x1: i + 0.5 + s, y0: j + 0.5 - s, y1: j + 0.5 + s });
      }
    }
    occupied.add(k);
  }
  void r;
}

/**
 * Where an outside opening on the cell grid sits on the true footprint: the nearest point of the
 * nearest footprint edge (edge index k, parameter t along it), for buildings with `poly`.
 */
export function polyAnchor(d: Dwelling, o: { i: number; j: number; side: EdgeSide }): { k: number; t: number; p: Pt } | null {
  if (!d.poly) return null;
  const mx = (o.side === 'e' ? o.i + 1 : o.i + 0.5) * d.cw, my = (o.side === 'e' ? o.j + 0.5 : o.j + 1) * d.ch;
  let best: { k: number; t: number; p: Pt } | null = null, bd = Infinity;
  const P = d.poly;
  for (let k = 0; k < P.length; k++) {
    const a = P[k], b = P[(k + 1) % P.length];
    const ax = a[0] * d.cw, ay = a[1] * d.ch, bx = b[0] * d.cw, by = b[1] * d.ch;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    if (l2 < 1e-6) continue;
    // Keep openings clear of the corners.
    const L = Math.sqrt(l2), m = Math.min(0.45, 0.8 / L);
    const t = Math.max(m, Math.min(1 - m, ((mx - ax) * dx + (my - ay) * dy) / l2));
    const dist = Math.hypot(ax + dx * t - mx, ay + dy * t - my);
    if (dist < bd) {
      bd = dist;
      best = { k, t, p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] };
    }
  }
  return best;
}
