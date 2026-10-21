import { hashString, mulberry32, type Rng } from '../gen/rng';
import { Simplex3, fbm } from '../gen/noise';
import { type KeyNote, hookTail, roomNotes, senseDetail } from '../keys/flavour';
import { buildPass } from './pass';

/**
 * Caves and glades in the manner of Watabou's Cave / Glade Generator: a cave is a set of
 * chambers joined by winding passages, carved from a noisy field and traced as smooth walls,
 * with pools, boulders and stalagmites; a glade is a clearing in the forest ringed by tree
 * canopies, with a feature or two at its heart (a great tree, a pond, standing stones, a
 * stream, a camp, ruins); a mountain pass (pass.ts) is a trail climbing by switchbacks to a
 * saddle between cliffs. All are deterministic from their seed and drawn on a 5 ft grid.
 *
 * Coordinates are local metres with x east and y south (canvas order), origin at the top-left
 * corner of the map.
 */
export type LairKind = 'cave' | 'glade' | 'pass';
export type Pt = [number, number];

export interface LairSite {
  id: string;
  kind: LairKind;
  name: string;
  /** The name in English. */
  en?: string;
  seed: number;
  /** Size (small, medium, large) and character tags, e.g. ['large', 'sealed', 'wet']. */
  tags: string[];
  lon: number;
  lat: number;
  /** Passes: the way the road runs over the saddle (radians, map x east and y south). */
  dir?: number;
}

export interface LairMap {
  site: LairSite;
  /** Map size (m). */
  W: number;
  H: number;
  /** Floor (cave) or clearing (glade) outlines: closed loops. */
  outlines: Pt[][];
  /** Outline points lying on the map's edge (cave mouths run off the map there). */
  onEdge: (p: Pt) => boolean;
  /** Is a point open floor / clearing? */
  open: (p: Pt) => boolean;
  water: Pt[][];
  /** Cave mouths (where a passage leaves the map), with the inward direction. */
  mouths: { p: Pt; dir: number }[];
  rocks: Pt[][];
  dots: { p: Pt; r: number }[];
  /** Glades. */
  trees: { p: Pt; r: number; shade: number }[];
  bigTree: { p: Pt; r: number } | null;
  stones: { p: Pt; w: number; h: number; a: number }[];
  stream: { pts: Pt[]; w: number } | null;
  camp: { fire: Pt; tents: { p: Pt; a: number }[] } | null;
  ruins: Pt[][];
  tufts: Pt[];
  flowers: { p: Pt; c: number }[];
  /** Cave levels: this map is level 0 (the entrance level); `levels` lists every level, itself first. */
  level: number;
  levels: LairMap[];
  /** Ways between levels on this level: down to the next or up to the one above, at the same spot on both. */
  links: LairLink[];
  /** Level name for the tabs ("Inside the hollow oak"); levels without one are numbered. */
  levelName?: string;
  /** Drawn as a hollow (cave style) whatever the site's kind: the inside of a great tree. */
  interior?: boolean;
  /** Groves: paths between the clearings (centre lines), huts and shrines, and the numbered key. */
  paths: Pt[][];
  things: { kind: 'hut' | 'shrine' | 'altar' | 'well'; p: Pt; a: number; w: number; h: number }[];
  rooms: LairRoom[];
  /** Groves: the adventure hook printed above the key. */
  hook?: string;
  /** Passes: bridges and fords over the stream, tunnels through a spur, snow fields and cairns. */
  bridges?: { a: Pt; b: Pt; rope: boolean }[];
  fords?: Pt[];
  tunnels?: Pt[][];
  snow?: Pt[][];
  cairns?: Pt[];
  /** Passes: the trail's centre line (drawn as a worn track). */
  trail?: Pt[];
}

export interface LairRoom {
  /** Creature, hazard and treasure notes. */
  notes?: KeyNote[];
  n: number;
  p: Pt;
  name: string;
  text: string;
}

export type LinkStyle = 'stairs' | 'shaft' | 'slope';
export interface LairLink {
  p: Pt;
  dir: 'up' | 'down';
  /** The level it leads to. */
  to: number;
  style: LinkStyle;
}

/** Number of cave levels, from the site's tags ("3 levels"); 1 when not tagged. */
export function lairLevels(site: LairSite): number {
  for (const t of site.tags) {
    const m = /^(\d) levels$/.exec(t);
    if (m) return Math.max(1, Math.min(4, +m[1]));
  }
  return 1;
}

/** Battlemap squares (5 ft). */
export const LAIR_CELL = 1.5;
/** Field sample spacing (m). */
const STEP = 0.75;

const SIZES: Record<LairKind, Record<string, [number, number]>> = {
  cave: { small: [54, 42], medium: [78, 60], large: [114, 84] },
  glade: { small: [60, 45], medium: [84, 63], large: [114, 84] },
  pass: { small: [84, 84], medium: [108, 102], large: [132, 120] },
};

const cache = new Map<string, LairMap>();

export function lairMap(site: LairSite): LairMap {
  // Ids repeat between worlds; the seed tells them apart.
  const key = `${site.id}:${site.seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = site.kind === 'cave' ? buildCave(site) : site.kind === 'pass' ? buildPass(site) : buildGlade(site);
  cache.set(key, m);
  if (cache.size > 60) cache.delete(cache.keys().next().value!);
  return m;
}

export function lairSize(site: LairSite): [number, number] {
  const size = site.tags.find((t) => t in SIZES[site.kind]) ?? 'medium';
  return SIZES[site.kind][size];
}

// ---- Scalar fields and contours --------------------------------------------------------------

export class Field {
  readonly nx: number;
  readonly ny: number;
  readonly v: Float32Array;
  constructor(readonly W: number, readonly H: number, f: ((x: number, y: number) => number) | null) {
    this.nx = Math.round(W / STEP) + 1;
    this.ny = Math.round(H / STEP) + 1;
    this.v = new Float32Array(this.nx * this.ny);
    if (f) for (let j = 0; j < this.ny; j++) for (let i = 0; i < this.nx; i++) this.v[j * this.nx + i] = f(i * STEP, j * STEP);
  }

  /** Raises the field to f within a box (for stamping shapes cheaply). */
  stamp(x0: number, y0: number, x1: number, y1: number, f: (x: number, y: number) => number): void {
    const i0 = Math.max(0, Math.floor(x0 / STEP)), i1 = Math.min(this.nx - 1, Math.ceil(x1 / STEP));
    const j0 = Math.max(0, Math.floor(y0 / STEP)), j1 = Math.min(this.ny - 1, Math.ceil(y1 / STEP));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const v = f(i * STEP, j * STEP), n = j * this.nx + i;
        if (v > this.v[n]) this.v[n] = v;
      }
    }
  }

  at(p: Pt): number {
    const fx = Math.max(0, Math.min(this.nx - 1.001, p[0] / STEP)), fy = Math.max(0, Math.min(this.ny - 1.001, p[1] / STEP));
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, n = this.nx;
    const v = this.v;
    return (v[j * n + i] * (1 - tx) + v[j * n + i + 1] * tx) * (1 - ty) + (v[(j + 1) * n + i] * (1 - tx) + v[(j + 1) * n + i + 1] * tx) * ty;
  }

  /** Removes open specks and fills closed pockets smaller than the given node counts. */
  clean(minOpen: number, minSolid: number): void {
    const { nx, ny, v } = this;
    const seen = new Uint8Array(nx * ny);
    for (let s = 0; s < nx * ny; s++) {
      if (seen[s]) continue;
      const open = v[s] > 0;
      const comp = [s];
      seen[s] = 1;
      let edge = false;
      for (let q = 0; q < comp.length; q++) {
        const c = comp[q], i = c % nx, j = (c / nx) | 0;
        if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) edge = true;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
          const n = b * nx + a;
          if (!seen[n] && v[n] > 0 === open) {
            seen[n] = 1;
            comp.push(n);
          }
        }
      }
      if (open && comp.length < minOpen) for (const c of comp) v[c] = -0.05;
      if (!open && !edge && comp.length < minSolid) for (const c of comp) v[c] = 0.05;
    }
  }

  /** Closed iso-lines at level 0 (the grid is treated as surrounded by negative values). */
  contours(): Pt[][] {
    const { nx, ny, v } = this;
    const val = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= ny ? -1 : v[j * nx + i]);
    // Edge ids: horizontal edge (i,j)-(i+1,j) and vertical edge (i,j)-(i,j+1), on a grid padded by one.
    const pos = (i: number, j: number, horiz: boolean): Pt => {
      const a = val(i, j), b = horiz ? val(i + 1, j) : val(i, j + 1);
      const t = Math.abs(a - b) < 1e-9 ? 0.5 : a / (a - b);
      const x = (i + (horiz ? t : 0)) * STEP, y = (j + (horiz ? 0 : t)) * STEP;
      return [Math.max(0, Math.min(this.W, x)), Math.max(0, Math.min(this.H, y))];
    };
    const key = (i: number, j: number, h: boolean) => `${i},${j},${h ? 1 : 0}`;
    const next = new Map<string, string>();
    const point = new Map<string, Pt>();
    for (let j = -1; j < ny; j++) {
      for (let i = -1; i < nx; i++) {
        const a = val(i, j) > 0, b = val(i + 1, j) > 0, c = val(i + 1, j + 1) > 0, d = val(i, j + 1) > 0;
        const code = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const T = key(i, j, true), R = key(i + 1, j, false), B = key(i, j + 1, true), L = key(i, j, false);
        const P: Record<string, () => Pt> = {
          [T]: () => pos(i, j, true), [R]: () => pos(i + 1, j, false), [B]: () => pos(i, j + 1, true), [L]: () => pos(i, j, false),
        };
        // Segments oriented with the open side on the left.
        const segs: [string, string][] = [];
        switch (code) {
          case 1: segs.push([L, B]); break;
          case 2: segs.push([B, R]); break;
          case 3: segs.push([L, R]); break;
          case 4: segs.push([R, T]); break;
          case 5: segs.push([R, T], [L, B]); break;
          case 6: segs.push([B, T]); break;
          case 7: segs.push([L, T]); break;
          case 8: segs.push([T, L]); break;
          case 9: segs.push([T, B]); break;
          case 10: segs.push([T, L], [B, R]); break;
          case 11: segs.push([T, R]); break;
          case 12: segs.push([R, L]); break;
          case 13: segs.push([R, B]); break;
          case 14: segs.push([B, L]); break;
        }
        for (const [s0, s1] of segs) {
          next.set(s0, s1);
          if (!point.has(s0)) point.set(s0, P[s0]());
          if (!point.has(s1)) point.set(s1, P[s1]());
        }
      }
    }
    const loops: Pt[][] = [];
    const used = new Set<string>();
    for (const start of next.keys()) {
      if (used.has(start)) continue;
      const loop: Pt[] = [];
      let k: string | undefined = start;
      for (let guard = 0; k && !used.has(k) && guard < 100000; guard++) {
        used.add(k);
        loop.push(point.get(k)!);
        k = next.get(k);
      }
      if (loop.length >= 4) loops.push(smoothLoop(loop));
    }
    return loops;
  }
}

/** One pass of Chaikin smoothing on a closed loop, keeping points on the map edge in place. */
export function smoothLoop(p: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k < p.length; k++) {
    const a = p[k], b = p[(k + 1) % p.length];
    out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
  }
  return out;
}

export function distSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** A wandering line from a to b (midpoint displacement). */
export function wander(a: Pt, b: Pt, rnd: Rng, amount: number, levels = 3): Pt[] {
  let pts: Pt[] = [a, b];
  let amp = amount;
  for (let l = 0; l < levels; l++) {
    const out: Pt[] = [pts[0]];
    for (let k = 1; k < pts.length; k++) {
      const p = pts[k - 1], q = pts[k];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const nx = -(q[1] - p[1]) / (len || 1), ny = (q[0] - p[0]) / (len || 1);
      const o = (rnd() - 0.5) * 2 * amp * len;
      out.push([(p[0] + q[0]) / 2 + nx * o, (p[1] + q[1]) / 2 + ny * o], q);
    }
    pts = out;
    amp *= 0.55;
  }
  return pts;
}

export function blob(c: Pt, r: number, rnd: Rng, n = 7, rough = 0.35): Pt[] {
  const a0 = rnd() * Math.PI * 2;
  const out: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * Math.PI * 2, rr = r * (1 - rough / 2 + rough * rnd());
    out.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]);
  }
  return out;
}

export const empty = (site: LairSite, W: number, H: number): Omit<LairMap, 'outlines' | 'onEdge' | 'open'> => ({
  site, W, H, water: [], mouths: [], rocks: [], dots: [], trees: [], bigTree: null, stones: [], stream: null, camp: null, ruins: [], tufts: [], flowers: [],
  level: 0, levels: [], links: [], paths: [], things: [], rooms: [],
});

// ---- Caves -----------------------------------------------------------------------------------

/**
 * A cave of one to four levels. Each level is its own set of chambers and passages on the same
 * footprint; the ways down from one level (stairs, a shaft or a steep slope, in a chamber far
 * from the entrance) open into a chamber at the same spot on the level below, where the way up
 * is marked. Only the top level has entrances; deeper levels are wetter.
 */
function buildCave(site: LairSite): LairMap {
  const n = lairLevels(site);
  const levels: LairMap[] = [];
  const allChambers: { c: Pt; r: number }[][] = [];
  let anchors: { p: Pt; style: LinkStyle }[] = [];
  for (let L = 0; L < n; L++) {
    const rnd = mulberry32(site.seed + L * 7919);
    const { map, chambers } = buildCaveLevel(site, L, anchors.map((a) => a.p), rnd);
    allChambers.push(chambers);
    for (const a of anchors) map.links.push({ p: a.p, dir: 'up', to: L - 1, style: a.style });
    if (L + 1 < n) {
      // Ways down: chambers far from the entrance (or the way in from above), not those already linked.
      const start = map.mouths[0]?.p ?? anchors[0]?.p ?? [map.W / 2, map.H / 2];
      const taken = (c: Pt) => anchors.some((a) => Math.hypot(a.p[0] - c[0], a.p[1] - c[1]) < 6) ||
        map.mouths.some((mo) => Math.hypot(mo.p[0] - c[0], mo.p[1] - c[1]) < 16);
      const nearWater = (c: Pt) => inLoops(map.water, c) || map.water.some((w) => w.some((q) => Math.hypot(q[0] - c[0], q[1] - c[1]) < 2.5));
      const cands = chambers.filter((c) => !taken(c.c) && c.c[0] > 4 && c.c[1] > 4 && c.c[0] < map.W - 4 && c.c[1] < map.H - 4 && map.open(c.c) && !nearWater(c.c))
        .sort((a, b) => Math.hypot(b.c[0] - start[0], b.c[1] - start[1]) - Math.hypot(a.c[0] - start[0], a.c[1] - start[1]));
      const nDown = site.tags.includes('large') && rnd() < 0.4 && cands.length > 2 ? 2 : 1;
      const next: { p: Pt; style: LinkStyle }[] = [];
      for (const c of cands.slice(0, nDown)) {
        // Off the chamber's centre a little, so the marker sits on the floor beside its middle.
        const a = rnd() * Math.PI * 2, p: Pt = [c.c[0] + Math.cos(a) * c.r * 0.3, c.c[1] + Math.sin(a) * c.r * 0.3];
        const style: LinkStyle = rnd() < 0.45 ? 'stairs' : rnd() < 0.6 ? 'shaft' : 'slope';
        const at: Pt = map.open(p) && !nearWater(p) ? p : c.c;
        // Clear the boulders and stalagmites from around it.
        map.rocks = map.rocks.filter((r) => Math.hypot(r[0][0] - at[0], r[0][1] - at[1]) > 3);
        map.dots = map.dots.filter((d) => Math.hypot(d.p[0] - at[0], d.p[1] - at[1]) > 2.5);
        next.push({ p: at, style });
        map.links.push({ p: at, dir: 'down', to: L + 1, style });
      }
      anchors = next;
    }
    map.level = L;
    levels.push(map);
  }
  for (const m of levels) m.levels = levels;
  caveKey(site, levels, allChambers);
  annotate(levels, 'cave', mulberry32(site.seed ^ 0xf1a));
  return levels[0];
}

const CAVE_HOOKS = [
  'Shepherds have lost sheep near the cave mouth, and last night a shepherd boy as well.',
  'A dwarf prospector swears there is a vein of mithril somewhere in the deepest chamber.',
  'The cave was a smugglers\' store in the old days; their last cargo was never collected.',
  'Villagers leave offerings at the mouth to keep whatever lives inside from coming out.',
  'A hunting party chased a wounded beast into the cave. Only their dogs came back.',
  'Strange carvings at the entrance match those on a ring found in a dead traveller\'s pack.',
  'Local children claim a spectral white wolf dares them to step inside, but none who cross the threshold return before sundown.',
  'A ruined shrine just inside the cavern was defaced recently, and fresh boot prints lead into the dark.',
  'The local miller\'s water wheel jammed because old bones and silt washed down from the cave\'s subterranean stream.',
  'A band of desperate outlaws took refuge from a royal patrol inside the cavern, but haven\'t been seen leaving.',
  'The cave floor is littered with peculiar, heavy iron shackles that don\'t match standard local smithing.',
  'A frantic merchant claims his runaway mule bolted into the dark cave carrying a crate of expensive tax records.',
  'An eccentric hermit claims the cave echoes with a human voice reciting coordinates to a lost trade route.',
  'Deep underground, a muffled ringing sound, like a heavy bronze bell struck underwater, can be heard at midnight.',
  'The local tavern keeper\’s grandfather swore he hid his life savings behind a loose stone wall in the shallow damp.',
  'Smoke drifted from a supposedly abandoned fissure yesterday, smelling faintly of rendered animal fat and herbs.',
  'A squad of militia members entered to scout for deserters two days ago, leaving only a bloodstained shield by the rocks.',
  'Stolen grain keeps disappearing from nearby barns, and the tracks lead straight into the yawning cave mouth.',
  'An itinerant herbalist dropped his rare leather satchel of rare mountain roots while fleeing an aggressive bear near the ledge.',
  'A rusted iron gate, locked from the outside, was recently found blown off its hinges by an unknown force.',
  'The local blacksmith lost his favorite heirloom hammer when a thief dove into the dark crevice to escape justice.',
  'A pack of rabid wild dogs made their den inside, and they have acquired a taste for human livestock.',
  'Strange, oily black footprints lead out of the cave every morning, disappearing halfway across the muddy pasture.',
  'A disgraced knight rode into the caves seeking atonement or a glorious end, and his riderless horse wanders the hills.',
  'Villagers avoid the ridge entirely because the wind blowing through the cave vents sounds eerily like weeping women.', 
  'An old map bought from a traveling tinker marks this specific cave as the entrance to an abandoned silver prospect.',
  'A band of tax collectors went missing near the ridge; their empty carriage sits abandoned with the horses unhitched.',
  'Unusually heavy seasonal rains have washed away a mudslide, exposing a previously hidden, sealed stone portal.',
  'A flock of crows circles endlessly above the chimney vent, refusing to roost anywhere else in the valley.',
  'The local lord\’s prize hunting hound bolted into the cavern after something small, scaly, and unnatural.'
];

const CAVE_ROOMS: Record<string, [string, string[]]> = {
  mouth: ['Cave mouth', ['Daylight fades a few paces in. Old ashes mark where travellers have sheltered.', 'The entrance is choked with dead leaves and the bones of small animals.']],
  great: ['Great cavern', ['The roof rises out of the lamplight; every sound returns doubled.', 'A vast hall of stone, its floor broken by fallen blocks the size of carts.', 'Fallen slabs lie heaped in the middle of the hall, as if the roof once came down all at once.']],
  pool: ['Pool chamber', ['A still black pool fills much of the floor. Pale fish turn in its depths.', 'Water has gathered here in a deep, cold pool fed by a trickle from the roof.', 'A shallow pool with a floor of white pebbles; the water is warmer than it should be.']],
  spires: ['Stalagmite hall', ['A forest of stalagmites crowds the chamber, some taller than a man.', 'Columns of dripstone join floor and roof, glistening when the light catches them.', 'Stalactites hang like teeth over a floor ribbed with flowstone.']],
  descent: ['The way down', ['The floor drops away to the level below.', 'A steep way leads down into deeper darkness, and the air from it is colder.']],
  arrival: ['Foot of the way', ['The way from above ends here, in a chamber of damp stone.', 'Scratches on the rock mark where others have climbed down before.']],
  grotto: ['Grotto', ['A low side chamber; one must stoop to enter.', 'A small grotto with a smooth, sandy floor.', 'A cramped alcove where the walls press in on either side.', 'A side pocket of the cave, its floor heaped with old leaves blown in from outside.', 'A round niche in the rock, smoothed by water long gone.']],
  chamber: ['Chamber', ['A rough chamber of broken rock.', 'An irregular chamber with a sloping floor and a low roof.', 'A chamber where the floor is cracked into great plates.', 'A long chamber with a ledge running along one wall.', 'A chamber of pale limestone, streaked with rust-red stains.', 'A wide, low chamber where the roof comes down almost to head height.']],
  squeeze: ['Narrow crawl', ['The passage pinches down, forcing travelers to drop to their hands and knees.', 'A tight fissure that requires squeezing through sideways in total dark.']],
  rubble: ['Rubble pile', ['A massive collapse blocks half the chamber with jagged boulders.', 'Loose scree covers the floor, shifting treacherously underfoot with every step.']],
  nest: ['Beast den', ['The floor is thick with chewed bones, matted fur, and a pungent, musky odor.', 'A sheltered corner heaped with shredded leaves and scraps of old hides.']],
  mine: ['Old workings', ['Tool marks scar the walls where ancient picks bit into the stone.', 'A rusted ore cart sits abandoned beside a low, shored-up timber tunnel.']],
  shrine: ['Forgotten shrine', ['A crude stone altar stands against the back wall, stained with old, dark residue.', 'Niches carved into the damp rock hold the remnants of weathered clay figurines.']],
  bone: ['Ossuary alcove', ['The walls are stacked neatly with old human bones, undisturbed for centuries.', 'A pile of mismatched skeletons lies half-buried in the silt.']],
};

/** Numbers the chambers of every cave level (from the way in) and writes a heading and a description for each. */
function caveKey(site: LairSite, levels: LairMap[], chambers: { c: Pt; r: number }[][]): void {
  const rnd = mulberry32(site.seed ^ 0xca7e);
  const usedText = new Set<string>();
  let n = 1;
  levels.forEach((m, L) => {
    const start = m.mouths[0]?.p ?? m.links.find((l) => l.dir === 'up')?.p ?? [m.W / 2, m.H / 2];
    const ch = chambers[L].filter((c) => m.open(c.c) || m.open([c.c[0] + c.r * 0.3, c.c[1]]))
      .sort((a, b) => Math.hypot(a.c[0] - start[0], a.c[1] - start[1]) - Math.hypot(b.c[0] - start[0], b.c[1] - start[1]));
    // Sizes relative to this cave: the largest fifth are great caverns, the smallest third grottoes.
    const rs = ch.map((c) => c.r).sort((a, b) => a - b);
    const big = rs[Math.floor(rs.length * 0.8)] ?? 99, small = rs[Math.floor(rs.length * 0.33)] ?? 0;
    ch.forEach((c, i) => {
      const near = (p: Pt, d: number) => Math.hypot(p[0] - c.c[0], p[1] - c.c[1]) < d;
      const down = m.links.find((l) => l.dir === 'down' && near(l.p, c.r + 1));
      const up = m.links.find((l) => l.dir === 'up' && near(l.p, c.r + 1));
      const spires = m.dots.filter((d) => near(d.p, c.r)).length;
      let kind = 'chamber';
      if (L === 0 && m.mouths.length && (i === 0 || m.mouths.some((mo) => near(mo.p, c.r + 6)))) kind = 'mouth';
      else if (down) kind = 'descent';
      else if (up) kind = 'arrival';
      else if (m.water.length && inLoops(m.water, c.c)) kind = 'pool';
      else if (c.r >= big && ch.length > 2) kind = 'great';
      else if (spires >= 6) kind = 'spires';
      else if (c.r <= small) kind = 'grotto';
      const [name, all] = CAVE_ROOMS[kind];
      const texts = all.filter((t) => !usedText.has(t));
      let text = (texts.length ? texts : all)[Math.floor(rnd() * (texts.length || all.length))];
      usedText.add(text);
      if (down) text += down.style === 'shaft' ? ' A shaft drops sheer; a rope ladder hangs into it.' : down.style === 'slope' ? ' A slope of loose scree runs down to the level below.' : ' Rough steps are cut down into the rock.';
      // The number: the chamber's middle, unless a way up or down stands there.
      let p: Pt = c.c;
      const link = down ?? up;
      if (link && Math.hypot(link.p[0] - p[0], link.p[1] - p[1]) < 3) {
        const a = Math.atan2(p[1] - link.p[1], p[0] - link.p[0]) || 0;
        const q: Pt = [link.p[0] + Math.cos(a) * 3.2, link.p[1] + Math.sin(a) * 3.2];
        p = m.open(q) ? q : [link.p[0] - 3.2, link.p[1]];
      }
      m.rooms.push({ n: n++, p, name, text, tag: kind } as LairRoom & { tag: string });
    });
  });
  levels[0].hook = [CAVE_HOOKS[Math.floor(rnd() * CAVE_HOOKS.length)], hookTail(rnd)].filter(Boolean).join(' ');
}

/** Creatures, hazards, treasure and a detail for the senses, for every numbered place on every level. */
export function annotate(levels: LairMap[], kind: 'cave' | 'grove' | 'pass', rnd: Rng): void {
  const used = new Set<string>();
  levels.forEach((m, L) => {
    for (const r of m.rooms) {
      const tag = (r as LairRoom & { tag?: string }).tag ?? (r.name === 'Hoard' ? 'hollow' : '');
      // A detail for the senses, each used at most twice in a site.
      const sense = senseDetail(kind, rnd);
      if (sense && !used.has(`2:${sense}`)) {
        used.add(used.has(`1:${sense}`) ? `2:${sense}` : `1:${sense}`);
        r.text += ` ${sense}`;
      }
      r.notes = roomNotes(kind, rnd, { tag, entry: tag === 'mouth' || (L === 0 && r.n === 1), depth: L, used });
    }
  });
}

function buildCaveLevel(site: LairSite, level: number, anchors: Pt[], rnd: Rng): { map: LairMap; chambers: { c: Pt; r: number }[] } {
  const noise = new Simplex3(mulberry32(hashString(`cave#${site.seed}#${level}`)));
  const [W, H] = lairSize(site);
  const has = (t: string) => site.tags.includes(t);
  const k = W / 78;
  // Chambers, kept apart; the ways down from the level above open into the first ones.
  const nCh = Math.round((has('small') ? 5 : has('large') ? 12 : 8) * (level ? 0.75 + 0.3 * rnd() : 0.85 + 0.3 * rnd()));
  const ch: { c: Pt; r: number }[] = anchors.map((c) => ({ c, r: (4 + 2.5 * rnd()) * Math.sqrt(k) }));
  for (let t = 0; t < 400 && ch.length < nCh; t++) {
    const r = (3.8 + 7 * rnd() ** 1.4) * Math.sqrt(k);
    const c: Pt = [r + 3 + rnd() * (W - 2 * r - 6), r + 3 + rnd() * (H - 2 * r - 6)];
    if (ch.every((o) => Math.hypot(o.c[0] - c[0], o.c[1] - c[1]) > (o.r + r) * 1.15 + 3)) ch.push({ c, r });
  }
  // Passages: a spanning tree over the chambers plus the odd loop.
  const tunnels: { pts: Pt[]; w: number }[] = [];
  const inTree = [0];
  const linked = new Set<string>();
  const link = (a: number, b: number) => {
    const kk = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (linked.has(kk)) return;
    linked.add(kk);
    tunnels.push({ pts: wander(ch[a].c, ch[b].c, rnd, 0.22), w: 1.0 + 1.8 * rnd() ** 1.5 });
  };
  while (inTree.length < ch.length) {
    let best: [number, number] | null = null, bd = Infinity;
    for (const a of inTree) {
      for (let b = 0; b < ch.length; b++) {
        if (inTree.includes(b)) continue;
        const d = Math.hypot(ch[a].c[0] - ch[b].c[0], ch[a].c[1] - ch[b].c[1]);
        if (d < bd) {
          bd = d;
          best = [a, b];
        }
      }
    }
    if (!best) break;
    link(best[0], best[1]);
    inTree.push(best[1]);
  }
  for (let a = 0; a < ch.length; a++) {
    if (rnd() > 0.25) continue;
    const order = ch.map((_, b) => b).filter((b) => b !== a).sort((p, q) => Math.hypot(ch[p].c[0] - ch[a].c[0], ch[p].c[1] - ch[a].c[1]) - Math.hypot(ch[q].c[0] - ch[a].c[0], ch[q].c[1] - ch[a].c[1]));
    if (order[1] !== undefined) link(a, order[1]);
  }
  // Mouths: passages from the chambers nearest the map edge out past it (none if sealed).
  const mouths: { p: Pt; dir: number }[] = [];
  if (!has('sealed') && level === 0) {
    const n = has('large') && rnd() < 0.5 ? 2 : 1;
    const sides = [0, 1, 2, 3].sort(() => rnd() - 0.5).slice(0, n);
    for (const side of sides) {
      const edgeD = (c: Pt) => [c[1], W - c[0], H - c[1], c[0]][side];
      const near = ch.reduce((a, b) => (edgeD(b.c) < edgeD(a.c) ? b : a));
      const out: Pt = side === 0 ? [near.c[0], -3] : side === 1 ? [W + 3, near.c[1]] : side === 2 ? [near.c[0], H + 3] : [-3, near.c[1]];
      tunnels.push({ pts: wander(near.c, out, rnd, 0.15, 2), w: 1.3 + 0.8 * rnd() });
      const edgeP: Pt = [Math.max(0, Math.min(W, out[0])), Math.max(0, Math.min(H, out[1]))];
      mouths.push({ p: edgeP, dir: [Math.PI / 2, Math.PI, -Math.PI / 2, 0][side] });
    }
  }
  // Chambers are lumps of two or three overlapping round halls; passages swell and narrow.
  const field = new Field(W, H, null);
  field.v.fill(-1);
  for (const c of ch) {
    const parts: { c: Pt; r: number }[] = [c];
    for (let q = 0; q < Math.floor(rnd() * 3); q++) {
      const a = rnd() * Math.PI * 2;
      parts.push({ c: [c.c[0] + Math.cos(a) * c.r * 0.6, c.c[1] + Math.sin(a) * c.r * 0.6], r: c.r * (0.5 + 0.3 * rnd()) });
    }
    for (const pp of parts) {
      field.stamp(pp.c[0] - pp.r, pp.c[1] - pp.r, pp.c[0] + pp.r, pp.c[1] + pp.r, (x, y) => 1 - Math.hypot(x - pp.c[0], y - pp.c[1]) / pp.r);
    }
  }
  for (const t of tunnels) {
    for (let q = 1; q < t.pts.length; q++) {
      const a = t.pts[q - 1], b = t.pts[q];
      const w = t.w * (0.75 + 0.5 * rnd());
      field.stamp(Math.min(a[0], b[0]) - w, Math.min(a[1], b[1]) - w, Math.max(a[0], b[0]) + w, Math.max(a[1], b[1]) + w, (x, y) => 1 - distSeg([x, y], a, b) / w);
    }
  }
  // Roughen everything; the floor is where the field stays above zero.
  for (let j = 0; j < field.ny; j++) {
    for (let i = 0; i < field.nx; i++) {
      const x = i * STEP, y = j * STEP, n = j * field.nx + i;
      if (field.v[n] < -0.6) continue;
      field.v[n] += 0.38 * fbm(noise, x / 8, y / 8, 0.5, 3) + 0.09 * noise.noise(x / 1.6, y / 1.6, 3.3);
    }
  }
  field.clean(40, 10);
  const open = (p: Pt) => field.at(p) > 0;
  const m: LairMap = { ...empty(site, W, H), outlines: field.contours(), open, onEdge: (p) => p[0] < 0.05 || p[1] < 0.05 || p[0] > W - 0.05 || p[1] > H - 0.05, mouths, level };

  // Pools: low noise hollows well inside the floor (more of them the deeper the level).
  const wetLevel = has('wet') || has('flooded') || has('volcanic') || (level > 0 && rnd() < 0.3 * level && !has('dry'));
  if (wetLevel) {
    const lvl = has('flooded') ? 0.05 : Math.max(0.12, 0.32 - 0.06 * level);
    const wf = new Field(W, H, (x, y) => Math.min(fbm(noise, x / 13 + 40, y / 13, 1.7, 2) - lvl, field.at([x, y]) - 0.18));
    wf.clean(20, 6);
    m.water = wf.contours();
  }
  const dry = (p: Pt) => !m.water.length || !inLoops(m.water, p);
  // Boulders near the walls, stalagmites in clusters, rubble (kept clear of the ways between levels).
  const area = W * H;
  const nearLink = (p: Pt) => anchors.some((a) => Math.hypot(a[0] - p[0], a[1] - p[1]) < 2.5);
  for (let t = 0; t < area / 18; t++) {
    const p: Pt = [rnd() * W, rnd() * H];
    const v = field.at(p);
    if (v <= 0.06 || !dry(p) || nearLink(p)) continue;
    if (v < 0.35 && rnd() < 0.09) m.rocks.push(blob(p, 0.45 + 1.0 * rnd() ** 2, rnd, 6 + Math.floor(rnd() * 3)));
    else if (v < 0.3 && rnd() < 0.12) {
      for (let q = 0; q < 1 + Math.floor(rnd() * 4); q++) m.dots.push({ p: [p[0] + (rnd() - 0.5) * 1.6, p[1] + (rnd() - 0.5) * 1.6], r: 0.12 + 0.22 * rnd() });
    } else if (rnd() < 0.04) m.dots.push({ p, r: 0.06 + 0.06 * rnd() });
  }
  m.dots = m.dots.filter((d) => field.at(d.p) > 0.05 && dry(d.p));
  // The way up must not stand in a pool.
  if (m.water.length) m.water = m.water.filter((w) => !anchors.some((a) => inLoops([w], a) || w.some((q) => Math.hypot(q[0] - a[0], q[1] - a[1]) < 3)));
  return { map: m, chambers: ch };
}

function inLoops(loops: Pt[][], p: Pt): boolean {
  let inside = false;
  for (const poly of loops) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
  }
  return inside;
}


// ---- Groves ----------------------------------------------------------------------------------

type GroveFeat = 'tree' | 'hollow' | 'stones' | 'camp' | 'ruins' | 'rocks' | 'pond' | 'flowers' | 'shrine' | 'hut' | 'spring' | 'stream' | 'clearing';

const GROVE_KEY: Record<GroveFeat, [string, string[]]> = {
  tree: ['The great tree', ['An ancient oak spreads over the clearing; ribbons and charms hang from its lower boughs.', 'A vast tree, older than any kingdom, its roots heaving up the turf.']],
  hollow: ['The hollow tree', ['A giant tree split by lightning long ago. A gap in the trunk opens on darkness, and a rope hangs down inside.', 'The trunk of the great tree is hollow; worn handholds lead down among its roots.']],
  stones: ['Standing stones', ['A ring of weathered stones, each carved with spirals. The grass inside never grows long.', 'Lichen-covered menhirs stand in a circle; one has fallen across the centre.']],
  camp: ['Camp', ['A fire pit, still warm, and tents of patched canvas. Someone left in a hurry.', 'Hunters (or outlaws) camp here: a firepit, a drying rack and two tents.']],
  ruins: ['Ruined walls', ['The tumbled walls of an old chapel, overgrown with ivy.', 'Moss-grown foundations of a forester\'s lodge; a cellar hatch lies half buried.']],
  rocks: ['Boulders', ['Great mossy boulders lie scattered as if dropped by giants.', 'A tumble of rocks makes a natural shelter; animal bones lie in its shade.']],
  pond: ['Pond', ['A still, dark pond. Coins glint on the bottom, beyond easy reach.', 'Reeds ring a quiet pool; frogs fall silent as anyone approaches.']],
  flowers: ['Meadow', ['A sunlit meadow thick with wildflowers. Bees drone among them.', 'Flowers grow here out of season, in rings that are almost too regular.']],
  shrine: ['Shrine', ['A small stone shrine to a forest spirit, heaped with offerings of nuts and feathers.', 'An old wayside shrine; the carved face on it has been freshly painted.']],
  hut: ["Druid's hut", ['A low hut of wattle and turf. Herbs hang drying from the rafters.', 'A hermit\'s hut with a smoking chimney and a tidy vegetable patch.']],
  spring: ['Spring', ['Clear water bubbles from the ground into a mossy basin. It is said to heal.', 'A spring rises among stones; a wooden cup hangs on a peg beside it.']],
  stream: ['Ford', ['The path crosses a stream on stepping stones.', 'A shallow ford; tracks of many animals mark the mud.']],
  clearing: ['Clearing', ['A quiet clearing carpeted in moss and bracken.', 'An open glade where deer graze at dusk.']],
};

/** Groves in a mushroom forest: the same places, grown of fungus. */
const FUNGAL_KEY: Partial<Record<GroveFeat, [string, string[]]>> = {
  tree: ['The great mushroom', ['A mushroom as tall as a tower spreads its cap over the clearing; spores drift down from its gills like slow snow.', 'An ancient fungus, its stalk wider than a house, ringed by smaller caps like courtiers.']],
  hollow: ['The hollow stalk', ['The stalk of a giant mushroom has rotted hollow. A gap in it opens on darkness, and a rope hangs down inside.', 'The great mushroom is hollow at the root; spongy handholds lead down into the dark.']],
  flowers: ['Toadstool ring', ['Toadstools of every colour grow in rings here, and the air tastes of earth and honey.', 'A carpet of small bright caps; those who sit among them dream deeply and wake late.']],
  clearing: ['Clearing', ['A quiet clearing carpeted in pale moss, lit by the soft glow of the caps around it.', 'Open ground where puffballs burst underfoot in clouds of yellow spores.']],
  hut: ["Spore-witch's hut", ['A hut built inside a fallen cap, its door cut through the gills. Strings of dried fungi hang from the eaves.', 'A low hut of mushroom-flesh and mud, warm and sweet-smelling; jars of spores line its shelves.']],
  pond: ['Pool', ['A still pool, faintly luminous; tiny glowing caps grow along its rim.', 'Dark water under a canopy of caps; the reflections glow even at noon.']],
  shrine: ['Shrine', ['A stone shrine half swallowed by fungus, its offerings sprouting with mould.', 'A carved figure stands in a ring of violet caps; its eyes have been filled with spores.']],
};
/** Groves in cursed land: dying trees, and an air of wrongness. */
const CURSED_KEY: Partial<Record<GroveFeat, [string, string[]]>> = {
  tree: ['The dead tree', ['A vast tree, long dead, its bark black and its boughs bare. Nothing nests in it.', 'A blasted oak at the heart of the curse; things are nailed to its trunk, and some of them still move.']],
  hollow: ['The hollow tree', ['A dead giant split by lightning. A gap in the trunk breathes cold air, and a rope hangs down inside.', 'The trunk of the black tree is hollow; claw marks lead down among its roots.']],
  flowers: ['Withered meadow', ['A meadow of grey grass and flowers that wilted the day they opened.', 'Flowers grow here in rings, pale as bone, and smell of the grave.']],
  clearing: ['Clearing', ['A silent clearing; no birds sing here, and the moss is grey.', 'Open ground where the grass has died in the shape of a figure lying down.']],
  pond: ['Black pool', ['A pool of still, black water that shows no reflection.', 'A stagnant pond, oily and cold; the frogs that live in it have too many eyes.']],
  spring: ['Bitter spring', ['A spring that once healed now runs brackish and red.', 'The holy spring is fouled; a broken cup lies beside it.']],
  shrine: ['Defiled shrine', ['A forest shrine overturned and smeared with soot; its carved face has been gouged out.', 'An old shrine heaped with offerings that have all rotted at once.']],
};
const FUNGAL_HOOKS = [
  'Pickers who gather the rare caps of the grove have begun to sleep for days, and wake speaking a language no one knows.',
  'A spore-witch trades potions at the forest edge, but her prices have changed: she now asks for names.',
  'The glowing caps have spread to the nearest village\u2019s granary, and the bread tastes of earth.',
  'Something vast moves beneath the mycelium; the ground of the grove rises and falls like breathing.',
];
const CURSED_HOOKS = [
  'Since the curse fell, the woods have crept toward the village by a field each year, and the trees they take do not grow back green.',
  'A hermit swears the curse can be broken at the heart of the grove, but no one who has tried has come back.',
  'Lights are seen in the dead grove on moonless nights, and the dogs of the village will not stop howling.',
  'A knight sworn to lift the curse rode into the woods a month ago; his horse came back alone, its coat turned white.',
];
const GROVE_HOOKS = [
  'Woodcutters will not work near the grove since one of them came back unable to speak.',
  'A druid who tends the grove has asked for help: something is poisoning its spring.',
  'Children from the nearest village have gone missing, and their trail leads into these woods.',
  'Each midsummer, lights dance among the stones; this year they came early.',
  'A noble\'s hunting party chased a white hart into the grove and has not returned.',
  'A local alderman promises a bag of crowns to anyone who can rid the ancient oak of a corpse-eating monster.',
  'A grieving mother left a swaddled infant at the hollow tree as a tribute, but the creature rejected the offering.',
  'Travelers on the trade road hear a weeping woman from the thicket, but locals warn it is just a monster luring prey.',
  'A village maiden vanished on her wedding eve; blood on the moss suggests a wedding gift was exacted by old forest pacts.',
  'An herbalist seeking rare wolfsbane found a witch\'s altar draped in fresh offal and sheep skulls.',
  'A cursed soldier who turned into a creature of the wood haunts the clearing, begging travelers for a mercy kill.',
  'The local ealdorman posted a bounty on the grove\'s lessee after three tax collectors were found hung by their ankles from the boughs.',
  'Poachers set iron snares near the sacred mound, only to find their own legs caught in crude bone traps the next dawn.',
  'A traveling adventurer\'s silver medallion spun wildly near the treeline before he vanished into the fog without his sword.',
  'The village priest desecrated an old wooden idol in the glade, and now the wells in town run red with pig\'s blood.',
  'Rebels hiding from the king\'s cavalry took shelter in the grove, but their commander was found drained of blood in his tent.',
  'A gnarled leshy-mark was freshly carved into the boundary post, warning all who enter that human steel is forbidden.',
  'A local cobbler found his dead wife wandering the grove at dusk, dressed in leaves and unable to recognize her own name.',
  'A striga-like howl echoes from the sunken hollow whenever the crescent moon hangs low over the canopy.',
  'An old war hero buried his cursed relic beneath the heart-tree, but the dark magic has begun seeping into the groundwater.',
];
/**
 * A grove: several clearings in the forest joined by winding paths, each with its own feature
 * (a great or hollow tree, standing stones, a pond or spring, a shrine, a druid's hut, a camp,
 * ruins, a meadow), numbered and described in a key. A hollow tree opens on a second level,
 * the hollow among its roots.
 */
function buildGlade(site: LairSite): LairMap {
  const rnd = mulberry32(site.seed);
  const noise = new Simplex3(mulberry32(hashString(`glade#${site.seed}`)));
  const [W, H] = lairSize(site);
  const has = (t: string) => site.tags.includes(t);
  const dry = has('dry');
  // Clearings, kept apart.
  const nCl = has('small') ? 2 + Math.floor(rnd() * 2) : has('large') ? 4 + Math.floor(rnd() * 2) : 3 + Math.floor(rnd() * 2);
  const base = Math.min(W, H) * 0.17;
  const cl: { c: Pt; r: number; asp: number; rot: number }[] = [];
  for (let t = 0; t < 600 && cl.length < nCl; t++) {
    const r = base * (cl.length ? 0.65 + 0.5 * rnd() : 1.05 + 0.2 * rnd());
    const c: Pt = [r + 4 + rnd() * (W - 2 * r - 8), r + 4 + rnd() * (H - 2 * r - 8)];
    if (cl.every((o) => Math.hypot(o.c[0] - c[0], o.c[1] - c[1]) > (o.r + r) * 1.25 + 4)) cl.push({ c, r, asp: 0.75 + 0.45 * rnd(), rot: rnd() * Math.PI });
  }
  // Paths: a spanning tree over the clearings, one loop for larger groves, and a way in from the edge.
  const pathLines: Pt[][] = [];
  const inTree = [0];
  while (inTree.length < cl.length) {
    let best: [number, number] | null = null, bd = Infinity;
    for (const a of inTree) {
      for (let b = 0; b < cl.length; b++) {
        if (inTree.includes(b)) continue;
        const d = Math.hypot(cl[a].c[0] - cl[b].c[0], cl[a].c[1] - cl[b].c[1]);
        if (d < bd) {
          bd = d;
          best = [a, b];
        }
      }
    }
    if (!best) break;
    pathLines.push(wander(cl[best[0]].c, cl[best[1]].c, rnd, 0.25, 4));
    inTree.push(best[1]);
  }
  if (cl.length >= 4 && rnd() < 0.6) pathLines.push(wander(cl[cl.length - 1].c, cl[1].c, rnd, 0.25, 4));
  {
    const side = Math.floor(rnd() * 4);
    const edgeD = (c: Pt) => [c[1], W - c[0], H - c[1], c[0]][side];
    const near = cl.reduce((a, b) => (edgeD(b.c) < edgeD(a.c) ? b : a));
    const out: Pt = side === 0 ? [near.c[0], -4] : side === 1 ? [W + 4, near.c[1]] : side === 2 ? [near.c[0], H + 4] : [-4, near.c[1]];
    pathLines.push(wander(near.c, out, rnd, 0.2, 3));
  }
  const ellipse = (q: (typeof cl)[number], x: number, y: number) => {
    const dx = x - q.c[0], dy = y - q.c[1];
    const u = dx * Math.cos(q.rot) + dy * Math.sin(q.rot), v = (-dx * Math.sin(q.rot) + dy * Math.cos(q.rot)) / q.asp;
    return 1 - Math.hypot(u, v) / q.r;
  };
  const field = new Field(W, H, (x, y) => Math.max(...cl.map((q) => ellipse(q, x, y))) + 0.3 * fbm(noise, x / 9, y / 9, 0.2, 3));
  for (const l of pathLines) {
    for (let k = 1; k < l.length; k++) {
      const a = l[k - 1], b = l[k], w = 1.5;
      field.stamp(Math.min(a[0], b[0]) - w, Math.min(a[1], b[1]) - w, Math.max(a[0], b[0]) + w, Math.max(a[1], b[1]) + w, (x, y) => 0.6 * (1 - distSeg([x, y], a, b) / w));
    }
  }
  field.clean(60, 30);
  const open = (p: Pt) => field.at(p) > 0;
  const m: LairMap = { ...empty(site, W, H), outlines: field.contours(), open, onEdge: () => false, paths: pathLines };
  m.levels = [m];

  // Features: the site's tags first (in the largest clearings), then a pick from the rest.
  const feats: GroveFeat[] = [];
  const tagFeats = (['tree', 'stones', 'camp', 'ruins', 'pond', 'flowers', 'rocks'] as GroveFeat[]).filter((t) => has(t));
  for (const t of tagFeats) feats.push(t === 'tree' && rnd() < 0.55 ? 'hollow' : t);
  const pool: [GroveFeat, number][] = [
    ['shrine', 2], ['hut', 1.6], ['stones', 1.4], ['ruins', 1.2], ['hollow', 1.1], ['tree', 0.8], ['camp', 0.9], ['rocks', 0.8],
    ...(dry ? [] : [['spring', 1.2], ['flowers', 1.2], ['pond', 1]] as [GroveFeat, number][]),
  ];
  while (feats.length < cl.length) {
    const opts = pool.filter(([f]) => !feats.includes(f) && !(f === 'tree' && feats.includes('hollow')) && !(f === 'hollow' && feats.includes('tree')));
    if (!opts.length) {
      feats.push('clearing');
      continue;
    }
    const total = opts.reduce((a, [, w]) => a + w, 0);
    let t = rnd() * total;
    feats.push(opts.find(([, w]) => (t -= w) < 0)?.[0] ?? opts[0][0]);
  }
  feats.length = cl.length;

  if (has('stream')) {
    const a = rnd() * Math.PI;
    const d: Pt = [Math.cos(a), Math.sin(a)];
    const L = Math.hypot(W, H) * 0.6;
    const k = Math.floor(rnd() * cl.length);
    const mid: Pt = [cl[k].c[0] + (rnd() - 0.5) * cl[k].r, cl[k].c[1] + (rnd() - 0.5) * cl[k].r];
    m.stream = { pts: [...wander([mid[0] - d[0] * L, mid[1] - d[1] * L], mid, rnd, 0.18, 4), ...wander(mid, [mid[0] + d[0] * L, mid[1] + d[1] * L], rnd, 0.18, 4).slice(1)], w: 0.7 + 0.6 * rnd() };
  }
  // Ponds and springs first, so the rest keeps out of the water.
  const pools: Pt[][] = [];
  cl.forEach((q, i) => {
    const f = feats[i];
    if (f !== 'pond' && f !== 'spring') return;
    const pc = q.c, pr = f === 'pond' ? q.r * (0.42 + 0.12 * rnd()) : 1.6 + 0.6 * rnd();
    const pf = new Field(W, H, (x, y) => Math.min(1 - Math.hypot(x - pc[0], y - pc[1]) / pr + 0.3 * fbm(noise, x / 4, y / 4, 4.1 + i, 2), field.at([x, y]) - 0.1));
    pf.clean(6, 6);
    pools.push(...pf.contours());
    if (f === 'spring') {
      const n = 6 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        m.rocks.push(blob([pc[0] + Math.cos(a) * (pr + 0.5), pc[1] + Math.sin(a) * (pr + 0.5)], 0.35 + 0.2 * rnd(), rnd, 6));
      }
    }
  });
  m.water = pools;
  const wet = (p: Pt, pad = 0) => (m.water.length && inLoops(m.water, p)) || (m.stream ? m.stream.pts.some((q, k) => k > 0 && distSeg(p, m.stream!.pts[k - 1], q) < m.stream!.w + pad) : false);

  let hollowAt: Pt | null = null;
  cl.forEach((q, i) => {
    const c = q.c, R = q.r, rot = q.rot;
    switch (feats[i]) {
      case 'tree':
      case 'hollow':
        m.bigTree = { p: c, r: Math.min(R * 0.7, 4.5 + 2.5 * rnd()) };
        if (feats[i] === 'hollow') hollowAt = c;
        break;
      case 'stones': {
        const rr = Math.min(R * 0.6, 3.5 + 3 * rnd()), n = 7 + Math.floor(rnd() * 5);
        for (let k = 0; k < n; k++) {
          if (rnd() < 0.12) continue;
          const a = (k / n) * Math.PI * 2;
          const p: Pt = [c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr];
          if (!wet(p, 0.5)) m.stones.push({ p, w: 0.8 + 0.5 * rnd(), h: 0.45 + 0.25 * rnd(), a: a + Math.PI / 2 + (rnd() - 0.5) * 0.4 });
        }
        if (rnd() < 0.6 && !wet(c, 1)) m.things.push({ kind: 'altar', p: c, a: rnd() * Math.PI, w: 1.6, h: 0.9 });
        break;
      }
      case 'camp': {
        const fire: Pt = [c[0] + (rnd() - 0.5) * R * 0.3, c[1] + (rnd() - 0.5) * R * 0.3];
        const tents: { p: Pt; a: number }[] = [];
        for (let k = 0; k < 2 + Math.floor(rnd() * 3); k++) {
          const a = rnd() * Math.PI * 2, d = 3.2 + 1.8 * rnd();
          const p: Pt = [fire[0] + Math.cos(a) * d, fire[1] + Math.sin(a) * d];
          if (field.at(p) > 0.1 && !wet(p, 1)) tents.push({ p, a: a + Math.PI });
        }
        m.camp = { fire, tents };
        break;
      }
      case 'ruins': {
        const w = Math.min(R, 4 + 4 * rnd()), h = Math.min(R * 0.8, 3.5 + 3 * rnd()), a = rnd() * Math.PI;
        const corner = (u: number, v: number): Pt => [c[0] + u * Math.cos(a) - v * Math.sin(a), c[1] + u * Math.sin(a) + v * Math.cos(a)];
        const cs = [corner(-w / 2, -h / 2), corner(w / 2, -h / 2), corner(w / 2, h / 2), corner(-w / 2, h / 2)];
        for (let k = 0; k < 4; k++) {
          const p = cs[k], r = cs[(k + 1) % 4];
          const t0 = rnd() * 0.3, t1 = 0.5 + rnd() * 0.5;
          if (rnd() < 0.85) m.ruins.push([[p[0] + (r[0] - p[0]) * t0, p[1] + (r[1] - p[1]) * t0], [p[0] + (r[0] - p[0]) * t1, p[1] + (r[1] - p[1]) * t1]]);
        }
        if (rnd() < 0.5) m.things.push({ kind: 'well', p: corner(w / 2 + 2, 0), a: 0, w: 1.2, h: 1.2 });
        break;
      }
      case 'shrine':
        m.things.push({ kind: 'shrine', p: [c[0] + Math.cos(rot) * R * 0.2, c[1] + Math.sin(rot) * R * 0.2], a: rot, w: 2.2, h: 1.6 });
        break;
      case 'hut': {
        // On dry ground: the centre, or the first dry spot round it.
        let p: Pt = c;
        for (let k = 0; k < 9 && wet(p, 3.5); k++) p = [c[0] + Math.cos(k * 0.7) * R * 0.45, c[1] + Math.sin(k * 0.7) * R * 0.45];
        m.things.push({ kind: 'hut', p, a: rot, w: 5 + 1.5 * rnd(), h: 3.8 + rnd() });
        break;
      }
      case 'rocks':
        for (let k = 0; k < 4 + Math.floor(rnd() * 5); k++) {
          const p: Pt = [c[0] + (rnd() - 0.5) * R * 1.2, c[1] + (rnd() - 0.5) * R * 1.2];
          if (field.at(p) > 0.05 && !wet(p, 0.5)) m.rocks.push(blob(p, 0.5 + 1.3 * rnd() ** 2, rnd, 6));
        }
        break;
    }
  });
  const busy = (p: Pt, pad: number) =>
    (m.bigTree && Math.hypot(p[0] - m.bigTree.p[0], p[1] - m.bigTree.p[1]) < m.bigTree.r + pad) ||
    m.stones.some((s) => Math.hypot(p[0] - s.p[0], p[1] - s.p[1]) < 1 + pad) ||
    m.things.some((t) => Math.hypot(p[0] - t.p[0], p[1] - t.p[1]) < Math.max(t.w, t.h) / 2 + 0.6 + pad) ||
    (m.camp && Math.hypot(p[0] - m.camp.fire[0], p[1] - m.camp.fire[1]) < 6 + pad) || wet(p, pad) ||
    m.paths.some((l) => l.some((q, k) => k > 0 && distSeg(p, l[k - 1], q) < 0.8 + pad));

  // The forest: canopies packed on a jittered grid outside the clearings, a few stragglers inside.
  const sp = 3.3;
  for (let y = -2; y < H + 3; y += sp * 0.87) {
    for (let x = -2 + (Math.round(y / sp) % 2) * sp * 0.5; x < W + 3; x += sp) {
      const p: Pt = [x + (rnd() - 0.5) * sp * 0.7, y + (rnd() - 0.5) * sp * 0.7];
      const f = field.at([Math.max(0, Math.min(W, p[0])), Math.max(0, Math.min(H, p[1]))]);
      if (f > 0.2 || (f > -0.05 && rnd() < 0.6) || (f > 0 && rnd() < 0.9)) continue;
      if (wet(p, 1.2)) continue;
      const r = 2 + 1.8 * rnd();
      // Paths stay open to the sky, if narrowly: crowns may overhang them only a little.
      if (m.paths.some((l) => l.some((q, k) => k > 0 && distSeg(p, l[k - 1], q) < r * 0.75 + 0.6))) continue;
      m.trees.push({ p, r, shade: rnd() });
    }
  }
  // Grass tufts, flowers in the meadow (and here and there elsewhere if the site is flowery).
  const meadow = cl.findIndex((_, i) => feats[i] === 'flowers');
  for (let t = 0; t < (W * H) / 6; t++) {
    const p: Pt = [rnd() * W, rnd() * H];
    if (field.at(p) <= 0.04 || busy(p, 0.3)) continue;
    const inMeadow = meadow >= 0 && ellipse(cl[meadow], p[0], p[1]) > -0.1;
    if ((inMeadow && rnd() < 0.5) || (has('flowers') && rnd() < 0.06)) {
      const c = Math.floor(fbm(noise, p[0] / 6, p[1] / 6, 7, 1) * 3 + 3) % 3;
      for (let q = 0; q < 3; q++) m.flowers.push({ p: [p[0] + (rnd() - 0.5), p[1] + (rnd() - 0.5)], c });
    } else if (rnd() < (dry ? 0.35 : 0.6)) m.tufts.push(p);
  }

  // The key: one entry per clearing, numbered from the way in; the ford if a stream crosses a path.
  const entry = pathLines[pathLines.length - 1][pathLines[pathLines.length - 1].length - 1];
  const order = cl.map((_, i) => i).sort((a, b) => Math.hypot(cl[a].c[0] - entry[0], cl[a].c[1] - entry[1]) - Math.hypot(cl[b].c[0] - entry[0], cl[b].c[1] - entry[1]));
  const fungal = has('fungal') || has('mushrooms'), cursed = has('cursed');
  const keyFor = (f: GroveFeat) => (fungal ? FUNGAL_KEY[f] : cursed ? CURSED_KEY[f] : undefined) ?? GROVE_KEY[f];
  for (const i of order) {
    const [name, texts] = keyFor(feats[i]);
    const q = cl[i];
    // The number sits off the feature, toward the clearing's rim, on dry open ground.
    let lp: Pt = q.c;
    for (let k = 0; k < 12; k++) {
      const a = q.rot + Math.PI / 2 + (k * Math.PI * 2) / 12, d = q.r * (k < 6 ? 0.6 : 0.45);
      const c: Pt = [q.c[0] + Math.cos(a) * d, q.c[1] + Math.sin(a) * d * q.asp];
      if (field.at(c) > 0.12 && !busy(c, 0.6)) {
        lp = c;
        break;
      }
    }
    m.rooms.push({ n: m.rooms.length + 1, p: lp, name, text: texts[Math.floor(rnd() * texts.length)] });
  }
  if (m.stream) {
    for (const l of m.paths) {
      const st = m.stream;
      const hit = l.find((p) => st.pts.some((q, k) => k > 0 && distSeg(p, st.pts[k - 1], q) < st.w + 0.2) && p[0] > 2 && p[1] > 2 && p[0] < W - 2 && p[1] < H - 2);
      if (hit) {
        const [name, texts] = GROVE_KEY.stream;
        m.rooms.push({ n: m.rooms.length + 1, p: [hit[0] + 1.8, hit[1] + 1.8], name, text: texts[Math.floor(rnd() * texts.length)] });
        break;
      }
    }
  }
  m.mouths = [{ p: [Math.max(0, Math.min(W, entry[0])), Math.max(0, Math.min(H, entry[1]))], dir: Math.atan2(cl[order[0]].c[1] - entry[1], cl[order[0]].c[0] - entry[0]) }];
  const hooks = fungal ? FUNGAL_HOOKS : cursed ? CURSED_HOOKS : GROVE_HOOKS;
  m.hook = hooks[Math.floor(rnd() * hooks.length)];

  if (hollowAt) {
    const inside = buildHollow(site, rnd, m.rooms.length + 1);
    const at: Pt = [hollowAt[0] + 0.6, hollowAt[1] + 0.6];
    m.links.push({ p: at, dir: 'down', to: 1, style: 'shaft' });
    m.levelName = 'The grove';
    m.levels = [m, inside];
    inside.levels = m.levels;
  }
  // Flavour from its own stream of numbers, so the map stays as it was.
  const frnd = mulberry32(site.seed ^ 0xf1a);
  m.hook = [m.hook, hookTail(frnd)].filter(Boolean).join(' ');
  annotate(m.levels, 'grove', frnd);
  return m;
}

/** The hollow among a great tree's roots: a chamber or two of earth and wood, entered from above. */
function buildHollow(site: LairSite, rnd: Rng, n0: number): LairMap {
  const W = 30, H = 25;
  const noise = new Simplex3(mulberry32(hashString(`hollow#${site.seed}`)));
  const c: Pt = [W / 2, H / 2];
  const lobes: { c: Pt; r: number }[] = [{ c, r: 4.6 }];
  const nL = 2 + Math.floor(rnd() * 2), a0 = rnd() * Math.PI * 2;
  for (let k = 0; k < nL; k++) {
    // Spread round the hollow, each down its own root tunnel.
    const a = a0 + (k / nL) * Math.PI * 2 + (rnd() - 0.5) * 0.8;
    lobes.push({ c: [c[0] + Math.cos(a) * 9, c[1] + Math.sin(a) * 7], r: 2.4 + 1.1 * rnd() });
  }
  const field = new Field(W, H, (x, y) => Math.max(...lobes.map((l) => 1 - Math.hypot(x - l.c[0], y - l.c[1]) / l.r)) + 0.18 * fbm(noise, x / 3, y / 3, 0.4, 2));
  for (const l of lobes.slice(1)) {
    field.stamp(Math.min(c[0], l.c[0]) - 1.2, Math.min(c[1], l.c[1]) - 1.2, Math.max(c[0], l.c[0]) + 1.2, Math.max(c[1], l.c[1]) + 1.2, (x, y) => 1 - distSeg([x, y], c, l.c) / 1.2);
  }
  field.clean(10, 6);
  const open = (p: Pt) => field.at(p) > 0;
  const m: LairMap = { ...empty(site, W, H), outlines: field.contours(), open, onEdge: () => false, interior: true, level: 1, levelName: 'Inside the hollow tree' };
  // Roots across the walls and floor.
  for (let k = 0; k < 14; k++) {
    const a = rnd() * Math.PI * 2, r = 2 + rnd() * 6;
    const p: Pt = [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
    if (field.at(p) > 0.05 && Math.hypot(p[0] - c[0], p[1] - c[1]) > 2) m.dots.push({ p, r: 0.12 + 0.18 * rnd() });
  }
  m.links.push({ p: [c[0] + 0.6, c[1] + 0.6], dir: 'up', to: 0, style: 'shaft' });
  const what = [
    ['Root hollow', 'Roots twist through the earthen walls. Bones and trinkets are wedged among them, gifts or trophies.'],
    ['Hoard', 'A cache hidden under a root: a rotted satchel, a few coins and a silver brooch.'],
    ['Nest', 'Something large has made a nest of leaves and fur here. It is still warm.'],
    ['Spring', 'Water seeps from the roots into a small, cold pool.'],
  ];
  m.rooms.push({ n: n0, p: [c[0] - 2.2, c[1] - 2], name: 'The hollow', text: 'The rope drops into a dry, round chamber in the heart of the roots. The smell of earth and old leaves is thick.' });
  lobes.slice(1).forEach((l, k) => {
    const [name, text] = what[(k + Math.floor(rnd() * what.length)) % what.length];
    m.rooms.push({ n: n0 + 1 + k, p: l.c, name, text });
  });
  return m;
}
