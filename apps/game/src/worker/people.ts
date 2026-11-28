/**
 * The residents about the wanderer (docs/design/npcs.md, Stage 1): the households of the plans'
 * buildings near a tile (core people/plan-residents.ts), each with their day's plan (core
 * people/routine.ts) and every place of it found on the map: their bed, a place at home and at
 * the table, their workplace (their own building, the nearest of its kind, or out of doors near
 * home), the nearest tavern or inn, the nearest temple, a square near home. Places beyond the
 * bubble's reach are left unnamed (the person is away there).
 *
 * The same world, place and time always give the same people in the same places.
 */
import type { GeneratedWorld } from '@worldforge/core/gen/world';
import { CHUNK, TILE_M, type LocalWorld, type PlanBuilding, type BuildingSpot } from '@worldforge/core/local/chunk';
import { GROUND_TILES, OBJECT_TILES } from '@worldforge/core/local/tiles';
import { LocalFrame } from '@worldforge/core/towns/plan';
import { householdsFor, residentBuilding } from '@worldforge/core/people/plan-residents';
import { kindOf, type Household, type RKind } from '@worldforge/core/people/residents';
import { blockAt, dayBlocks, templateOf, workOf, type Work } from '@worldforge/core/people/routine';
import { LOOKS, lookOf, type Look } from '@worldforge/core/people/appearance';
import { CULTURES } from '@worldforge/core/names/cultures';
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import { DMath } from '@worldforge/core/dmath';
import type { PlacedPerson, PlanStop, Spot } from './protocol';
import { tieOf, withTies } from './ties';

/** The bubble's reach (tiles) in open country, in a town and in a city (docs/design/npcs.md). */
export const BUBBLE = { open: 128, town: 96, city: 64 };
/** How far beyond the bubble homes are looked at, for those who work out of doors near them. */
const MARGIN = 16;

/** Rooms a building's work is done in (lower case, as LocalWorld.buildingsIn gives them). */
const WORK_ROOMS = new Set([
  'smithy', 'bakery', 'taproom', 'shop', 'workshop', 'butcher', 'tailor', 'apothecary', 'chandlery', 'pawnshop', 'foundry', 'kitchen', 'hall', 'common room',
  'nave', 'chapel', 'sanctuary', 'office', 'counting room', 'library', 'study', 'guardroom', 'workroom', 'mill', 'store', 'storeroom', 'stable', 'stables',
]);
/** Rooms that make a house a shop or a workshop, whose household works in it. */
const TRADE_ROOMS = new Set(['smithy', 'bakery', 'taproom', 'shop', 'workshop', 'butcher', 'tailor', 'apothecary', 'chandlery', 'pawnshop', 'foundry']);
/** Headwear of a people's common dress, as garment shapes (core local/figures.ts). */
const HEAD_SHAPE: Record<string, string> = {
  hood: 'hood', cap: 'cap', kerchief: 'cap', fez: 'cap', turban: 'cap', furhat: 'hat', wide: 'hat', conical: 'hat', tallhat: 'hat', veil: 'veil',
};

interface Home {
  b: PlanBuilding;
  kind: RKind;
  households: Household[];
}

let forWorld: GeneratedWorld | null = null;
let forLocal: LocalWorld | null = null;
const homes = new Map<string, Home>();
const looks = new Map<number, Look | null>();

/** Forgets what was worked out (a new world or a new game). */
export function forgetPeople(): void {
  homes.clear();
  besideCache.clear();
  squareCache.clear();
  looks.clear();
  roomyMemo.clear();
  forWorld = null;
  forLocal = null;
}

function homeOf(w: GeneratedWorld, b: PlanBuilding): Home {
  let h = homes.get(b.bid);
  if (h) return h;
  const v = b.site.tier === 'village' ? { lon: b.site.lon, lat: b.site.lat, kind: String(b.site.kind ?? 'farming'), population: b.site.population, name: b.site.name ?? '' } : undefined;
  let households: Household[] = [];
  let kind: RKind = 'home';
  try {
    households = withTies(b.bid, householdsFor(w, b.f, b.plan, v));
    const ring = b.f.geometry.type === 'Polygon' ? b.f.geometry.coordinates[0] : [[b.site.lon, b.site.lat]];
    kind = kindOf(residentBuilding(b.f, new LocalFrame(ring[0][0], ring[0][1]), w.raster.seed));
  } catch (err) {
    console.warn('residents', b.bid, err);
  }
  h = { b, kind, households };
  homes.set(b.bid, h);
  if (homes.size > 4000) homes.delete(homes.keys().next().value!);
  return h;
}

function cultureLook(seed: string, ci: number): Look | null {
  if (looks.has(ci)) return looks.get(ci)!;
  let lk: Look | null = null;
  try {
    lk = CULTURES[ci] ? lookOf(seed, CULTURES[ci]) : null;
  } catch {
    lk = null;
  }
  looks.set(ci, lk);
  return lk;
}

/** The bubble's reach about a tile: smaller in a town, smaller again in a city. */
export function bubbleAt(local: LocalWorld, x: number, y: number): number {
  const mx = (x + 0.5) * TILE_M, my = -(y + 0.5) * TILE_M;
  let r = BUBBLE.open;
  for (const s of local.sitesNear(mx, my, mx, my, 0)) {
    if (s.tier === 'city') r = Math.min(r, BUBBLE.city);
    else if (s.tier === 'town') r = Math.min(r, BUBBLE.town);
  }
  return r;
}

/** How far beyond the bubble places are looked for (taverns, temples, workplaces). */
const REACH = 48;

/** Where those whose work lies away from home work: the kinds of building, by trade (none: beyond the town). */
const AWAY_AT: [RegExp, RKind[]][] = [
  [/sailor|dockhand|stevedore|shipwright|sailmaker|customs|shipowner|factor/, ['warehouse', 'store']],
  [/lawyer|notary|alderman|scribe/, ['civic', 'guild', 'bank', 'library']],
  [/money-lender/, ['bank', 'civic']],
  [/miller/, ['mill', 'store']],
  [/camp follower|sutler/, ['barracks', 'keep']],
  [/merchant|pedlar|drover|courier|minstrel|pilgrim|scholar|sellsword|adventurer/, ['hall', 'civic', 'inn', 'temple']],
];
/** How far (tiles) a carter's or porter's round takes them from home. */
const ROUND = 80;
/** What a market's stalls and a town's gates stand as on the map. */
export const STALLS = new Set(['stall']);
const GATES = new Set(['gate_open', 'gate']);
/** Grounds of squares and greens. */
const SQUARE_GROUND = new Set(['flagstones', 'lawn']);
/** Rooms meals are eaten in. */
const TABLE_ROOMS = new Set(['kitchen', 'hall', 'common room', 'dining room', 'taproom', 'refectory', 'main room', 'living room']);

const spotKey = (t: Spot) => `${t.x},${t.y},${t.z ?? 'g'}`;
const asSpot = (t: BuildingSpot | Spot): Spot => ({ x: t.x, y: t.y, z: t.z });

/**
 * The residents of the bubble (`radius` tiles about (x, y)) on the day of `time` (game seconds):
 * each with their day's plan, every block's place found on the map, and where the plan has them
 * at that time. `rise` and `set` are the day's sunrise and sunset (hours).
 */
export function peopleIn(w: GeneratedWorld, local: LocalWorld, x: number, y: number, radius: number, time: number, rise = 6, set = 18): PlacedPerson[] {
  // What is kept is kept for one world and one local map (chunks are numbered from the game's start).
  if (forWorld !== w || forLocal !== local) {
    forgetPeople();
    forWorld = w;
    forLocal = local;
  }
  const seed = w.raster.seed;
  const day = Math.floor(time / 86400), hour = (time % 86400) / 3600;
  const R = radius + MARGIN, R2 = radius + REACH;
  const out: PlacedPerson[] = [];
  const taken = new Set<string>();
  /** How many are placed in each building now (by its id). */
  const placedIn = new Map<string, number>();
  const near = (t: Spot, d: number) => Math.abs(t.x - x) <= d && Math.abs(t.y - y) <= d;
  const all = local.buildingsIn(x - R2, y - R2, x + R2, y + R2).map((b) => homeOf(w, b));
  const middle = (b: PlanBuilding) => [b.x0 + b.w / 2, b.y0 + b.h / 2];
  /** The buildings of some kind (a tavern, the temple) nearest another, of the same settlement, nearest first. */
  const nearestOf = (from: PlanBuilding, test: (h: Home) => boolean, n = 1): Home[] => {
    const [mx, my] = middle(from);
    const found: [number, Home][] = [];
    for (const h of all) {
      if (h.b.site.id !== from.site.id || !h.b.spots.length || !test(h)) continue;
      const [hx, hy] = middle(h.b);
      found.push([(hx - mx) * (hx - mx) + (hy - my) * (hy - my), h]);
    }
    found.sort((a, c) => a[0] - c[0] || (a[1].b.bid < c[1].b.bid ? -1 : 1));
    return found.slice(0, n).map((f) => f[1]);
  };
  // The markets (open ground beside the stalls) and the town gates (open ground beside them) within reach.
  const markets = tilesBeside(local, x - R2, y - R2, x + R2, y + R2, STALLS);
  const marketMemo = new Map<string, Spot[]>();
  const gates = tilesBeside(local, x - R2, y - R2, x + R2, y + R2, GATES);
  const isTavern = (h: Home) => h.kind === 'inn' || h.b.f.properties.role === 'tavern';
  const isTemple = (h: Home) => h.kind === 'temple' || h.kind === 'shrine' || h.kind === 'monks';

  for (const home of all) {
    const b = home.b;
    if (b.x0 > x + R || b.y0 > y + R || b.x0 + b.w < x - R || b.y0 + b.h < y - R) continue;
    const shop = home.kind === 'home' ? b.spots.find((s) => s.z === null && TRADE_ROOMS.has(s.room))?.room : undefined;
    const beds = bedsOf(b);
    let bedNo = 0;
    // The tavern: one of the three nearest (a house's people do not all drink in one place).
    const taverns = nearestOf(b, isTavern, 3), temple = nearestOf(b, isTemple)[0] ?? null;
    home.households.forEach((h, hi) => h.members.forEach((p, mi) => {
      const id = tieOf(p)?.key ?? `${b.bid}#${hi}#${mi}`;
      const r = mulberry32(hashString(`${seed}#place#${id}`));
      const pickOf = <T>(xs: T[]): T | null => (xs.length ? xs[Math.floor(r() * xs.length) % xs.length] : null);
      const tavern = pickOf(taverns);
      const work: Work = workOf(p, h, home.kind, shop);
      const plan = dayBlocks(seed, id, day, p, work, home.kind, { rise, set });
      // The places of the day, found once each.
      const ways = roomy(b);
      const allLiving = b.spots.filter((s) => s.obj !== 'bed' && !s.room.includes('bed'));
      const clearLiving = allLiving.filter((s) => ways.has(spotKey(s)));
      const living = clearLiving.length ? clearLiving : allLiving;
      const homeSpot = pickOf(living.filter((s) => s.z === null)) ?? pickOf(living) ?? pickOf(b.spots);
      if (!homeSpot) return;
      const bedroom = b.spots.filter((s) => s.room.includes('bed') && s.obj !== 'bed');
      const bed = beds[bedNo++] ?? pickOf(bedroom.filter((s) => ways.has(spotKey(s)))) ?? pickOf(bedroom) ?? homeSpot;
      const table = pickOf(living.filter((s) => s.z === null && TABLE_ROOMS.has(s.room))) ?? homeSpot;
      let workSpot: Spot | null = null, awayIn: PlanBuilding | null = null;
      if (work === 'shop') workSpot = inside(b, r);
      else if (work === 'home') workSpot = pickOf(living.filter((s) => s.z === null)) ?? homeSpot;
      else if (work === 'out') workSpot = outdoors(local, b, r);
      else if (work === 'away') {
        const kinds = AWAY_AT.find(([re]) => re.test(p.trade))?.[1];
        const at = kinds ? nearestOf(b, (o) => o !== home && kinds.includes(o.kind))[0] ?? null : null;
        workSpot = at ? inside(at.b, r) : null;
        awayIn = at?.b ?? null;
      }
      let workIn: PlanBuilding | null = work === 'shop' || work === 'home' ? b : null;
      if (work === 'away' && workSpot) workIn = awayIn;
      /** A block's place, and the building it lies in (none: out of doors). */
      const placeOf = (pl: PlanStop['place']): [Spot | null, PlanBuilding | null] => {
        switch (pl) {
          case 'bed': return [bed, b];
          case 'home': return [homeSpot, b];
          case 'table': return [table, b];
          case 'work': return [workSpot, workIn];
          case 'out': return [outdoors(local, b, r), null];
          case 'tavern': return tavern ? [inside(tavern.b, r), tavern.b] : [null, null];
          case 'temple': return temple ? [inside(temple.b, r), temple.b] : [null, null];
          case 'square': return [pickOf(squaresNear(local, b)) ?? outdoors(local, b, r), null];
          case 'market': {
            // A tile among the stalls of the nearest market (else a square near home).
            const m = marketNear(markets, b, r, marketMemo);
            return [m ?? pickOf(squaresNear(local, b)), null];
          }
          case 'warehouse': {
            // The nearest warehouse or store within a carter's round (else the market).
            const wh = nearestOf(b, (o) => (o.kind === 'warehouse' || o.kind === 'store') && Math.max(Math.abs(o.b.x0 - b.x0), Math.abs(o.b.y0 - b.y0)) <= ROUND)[0];
            return wh ? [inside(wh.b, r), wh.b] : [marketNear(markets, b, r, marketMemo), null];
          }
          case 'gate': return [pickOf(nearest(gates, b, 3)) ?? marketNear(markets, b, r, marketMemo), null];
        }
      };
      const found = new Map<string, [Spot | null, PlanBuilding | null]>();
      const stops: PlanStop[] = plan.map((k) => {
        if (!found.has(k.place)) {
          const [sp, inB] = placeOf(k.place);
          found.set(k.place, [sp && near(sp, R2) ? asSpot(sp) : null, inB]);
        }
        return { from: k.from, to: k.to, act: k.act, place: k.place, at: found.get(k.place)![0] };
      });
      // Those whose day never touches the bubble are left out.
      if (!near(homeSpot, radius) && !stops.some((st) => st.at && near(st.at, radius))) return;
      // Where they are now: the place of the hour's block (a free tile beside it, if it is taken).
      const now = blockAt(plan, hour);
      let at = stops[plan.indexOf(now)]?.at ?? null;
      // A building holds only so many at once (B2): the rest are elsewhere for now.
      const inB = found.get(now.place)?.[1] ?? null;
      if (at && inB && (placedIn.get(inB.bid) ?? 0) >= roomFor(inB)) at = null;
      if (at && taken.has(spotKey(at))) at = freeBeside(local, inB, at, taken);
      if (at) {
        taken.add(spotKey(at));
        if (inB) placedIn.set(inB.bid, (placedIn.get(inB.bid) ?? 0) + 1);
      }
      out.push(person(seed, id, p, h, b, work, home.kind, day, stops, asSpot(homeSpot), at, r));
    }));
  }
  return out;
}

/** A building's beds: the pillow ends first (no bed to the north or west), then straw and bedrolls. */
function bedsOf(b: PlanBuilding): BuildingSpot[] {
  const beds = b.spots.filter((s) => s.obj === 'bed');
  const head = beds.filter((s) => !beds.some((o) => o.z === s.z && ((o.x === s.x && o.y === s.y - 1) || (o.x === s.x - 1 && o.y === s.y))));
  return [...head, ...b.spots.filter((s) => s.obj === 'straw' || s.obj === 'bedroll')];
}

/** A spot in a building to work or sit in: its work rooms first (on the ground floor), else its ground floor. */
function inside(b: PlanBuilding, r: () => number): BuildingSpot | null {
  const ways = roomy(b);
  const all = b.spots.filter((s) => s.obj !== 'bed');
  const clear = all.filter((s) => ways.has(spotKey(s)));
  const open = clear.length ? clear : all;
  const pickOf = (xs: BuildingSpot[]) => (xs.length ? xs[Math.floor(r() * xs.length) % xs.length] : null);
  return pickOf(open.filter((s) => s.z === null && WORK_ROOMS.has(s.room))) ?? pickOf(open.filter((s) => s.z === null)) ?? pickOf(open);
}

const roomyMemo = new Map<string, Set<string>>();

/**
 * The tiles of a building where someone may stand and still leave the ways clear (docs/backlog.md,
 * B2): not beside a door, and not in a passage one tile wide (a tile whose only open sides are two
 * opposite ones). Corners, the middle of rooms and seats are fine.
 */
export function roomy(b: PlanBuilding): Set<string> {
  const hit = roomyMemo.get(b.bid);
  if (hit) return hit;
  const keys = new Set(b.spots.map(spotKey));
  const open = (x: number, y: number, z: number | null) => keys.has(spotKey({ x, y, z }));
  const out = new Set<string>();
  for (const s of b.spots) {
    if (s.z === null && b.doors.some(([dx, dy]) => Math.max(Math.abs(dx - s.x), Math.abs(dy - s.y)) <= 1)) continue;
    const n = open(s.x, s.y - 1, s.z), so = open(s.x, s.y + 1, s.z), e = open(s.x + 1, s.y, s.z), w = open(s.x - 1, s.y, s.z);
    const passage = (n && so && !e && !w) || (e && w && !n && !so);
    if (passage && !s.obj) continue;
    out.add(spotKey(s));
  }
  if (roomyMemo.size > 4000) roomyMemo.clear();
  roomyMemo.set(b.bid, out);
  return out;
}

/** How many may be in a building at once: about two in three of the tiles that leave the ways clear (at least two). */
export const roomFor = (b: PlanBuilding): number => Math.max(2, Math.ceil(roomy(b).size * 0.66));

/** A free tile near a taken one: of its building (keeping the ways clear), or (out of doors) of open ground within a few tiles (null if none). */
function freeBeside(local: LocalWorld, b: PlanBuilding | null, at: Spot, taken: Set<string>): Spot | null {
  if (b) {
    // The free tile of the building nearest it (on its floor, else any) that leaves the ways clear.
    const ways = roomy(b);
    let best: BuildingSpot | null = null, bd = Infinity;
    for (const s of b.spots) {
      if (taken.has(spotKey(s)) || s.obj === 'bed' || (ways.size && !ways.has(spotKey(s)))) continue;
      const d = Math.max(Math.abs(s.x - at.x), Math.abs(s.y - at.y)) + (s.z === at.z ? 0 : 1000);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best ? asSpot(best) : null;
  }
  for (let d = 1; d <= 3; d++) {
    for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      const t = { x: at.x + dx, y: at.y + dy, z: null };
      if (!taken.has(spotKey(t)) && openGround(local, t.x, t.y)) return t;
    }
  }
  return null;
}

/** Open ground one may stand on (not a floor, not water, nothing in the way). */
export function openGround(local: LocalWorld, tx: number, ty: number): boolean {
  const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
  const c = local.chunk(cx, cy), k = (ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK);
  const g = GROUND_TILES[c.ground[k]], o = OBJECT_TILES[c.object[k]];
  return !!g && g.pass && !g.water && !g.name.startsWith('floor_') && (!c.object[k] || !!o?.pass);
}

/**
 * The open ground beside things of some kinds (stalls, gates) in a box of tiles, on the ground: a
 * tile one can stand on, next to one of them.
 */
export function tilesBeside(local: LocalWorld, x0: number, y0: number, x1: number, y1: number, names: Set<string>): Spot[] {
  const out: Spot[] = [];
  for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
    for (const t of besideIn(local, cx, cy, names)) if (t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1) out.push(t);
  }
  return out;
}

const besideCache = new Map<string, Spot[]>();

/** The open tiles beside things of some kinds in a chunk (kept per chunk). */
function besideIn(local: LocalWorld, cx: number, cy: number, names: Set<string>): Spot[] {
  const key = `${cx},${cy},${[...names].join('/')}`;
  const hit = besideCache.get(key);
  if (hit) return hit;
  const c = local.chunk(cx, cy);
  const out: Spot[] = [];
  for (let k = 0; k < CHUNK * CHUNK; k++) {
    if (!names.has(OBJECT_TILES[c.object[k]]?.name ?? '')) continue;
    const x = k % CHUNK, y = Math.floor(k / CHUNK);
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= CHUNK || yy >= CHUNK) continue;
      const kk = yy * CHUNK + xx;
      const g = GROUND_TILES[c.ground[kk]];
      if (c.object[kk] || !g?.pass || g.water || g.name.startsWith('floor_')) continue;
      const t = { x: cx * CHUNK + xx, y: cy * CHUNK + yy, z: null };
      if (!out.some((o) => o.x === t.x && o.y === t.y)) out.push(t);
    }
  }
  besideCache.set(key, out);
  if (besideCache.size > 2000) besideCache.delete(besideCache.keys().next().value!);
  return out;
}

/** The `n` tiles of a list nearest a building's middle (nearest first). */
function nearest(tiles: Spot[], b: PlanBuilding, n: number): Spot[] {
  const mx = b.x0 + b.w / 2, my = b.y0 + b.h / 2;
  return tiles.map((t) => [(t.x - mx) * (t.x - mx) + (t.y - my) * (t.y - my), t] as const).sort((a, c) => a[0] - c[0]).slice(0, n).map((e) => e[1]);
}

/** A tile of the market nearest a building: one of the stalls' tiles about the nearest (worked out once per building). */
function marketNear(markets: Spot[], b: PlanBuilding, r: () => number, memo: Map<string, Spot[]>): Spot | null {
  let about = memo.get(b.bid);
  if (!about) {
    const near = nearest(markets, b, 1)[0];
    about = near ? markets.filter((t) => Math.abs(t.x - near.x) <= 24 && Math.abs(t.y - near.y) <= 24) : [];
    memo.set(b.bid, about);
  }
  return about.length ? about[Math.floor(r() * about.length) % about.length] : null;
}

const squareCache = new Map<string, Spot[]>();

/** Open tiles of squares and greens within reach of a building's door (kept per building). */
function squaresNear(local: LocalWorld, b: PlanBuilding): Spot[] {
  const hit = squareCache.get(b.bid);
  if (hit) return hit;
  const door = b.doors[0] ?? [b.x0 + (b.w >> 1), b.y0 + b.h];
  const out: Spot[] = [];
  const D = 40;
  for (let cy = Math.floor((door[1] - D) / CHUNK); cy <= Math.floor((door[1] + D) / CHUNK); cy++) for (let cx = Math.floor((door[0] - D) / CHUNK); cx <= Math.floor((door[0] + D) / CHUNK); cx++) {
    const c = local.chunk(cx, cy);
    for (let k = 0; k < CHUNK * CHUNK; k += 3) {
      const tx = cx * CHUNK + (k % CHUNK), ty = cy * CHUNK + Math.floor(k / CHUNK);
      if (Math.abs(tx - door[0]) > D || Math.abs(ty - door[1]) > D || c.object[k]) continue;
      if (SQUARE_GROUND.has(GROUND_TILES[c.ground[k]]?.name ?? '')) out.push({ x: tx, y: ty, z: null });
    }
  }
  squareCache.set(b.bid, out);
  if (squareCache.size > 4000) squareCache.delete(squareCache.keys().next().value!);
  return out;
}

/** Open ground near a building's door, for those who work out of doors (on the ground). */
function outdoors(local: LocalWorld, b: PlanBuilding, r: () => number): BuildingSpot | null {
  const door = b.doors.length ? b.doors[Math.floor(r() * b.doors.length) % b.doors.length] : [b.x0 + (b.w >> 1), b.y0 + b.h];
  const want = 3 + Math.floor(r() * 12);
  for (let tries = 0; tries < 24; tries++) {
    const a = r() * Math.PI * 2, d = want + tries * 0.5;
    const tx = Math.round(door[0] + DMath.cos(a) * d), ty = Math.round(door[1] + DMath.sin(a) * d);
    if (!openGround(local, tx, ty)) continue;
    return { x: tx, y: ty, z: null, obj: '', room: '' };
  }
  return null;
}

/** A resident as the game gets them: who they are, their looks, where they stand. */
function person(seed: string, id: string, p: Household['members'][number], h: Household, b: PlanBuilding, work: Work, kind: RKind, day: number, plan: PlanStop[], home: Spot, at: Spot | null, r: () => number): PlacedPerson {
  const rich = h.means === 'rich' || h.means === 'comfortable';
  const tf = tieOf(p);
  const base = lookFor(seed, p.culture, p, rich ? 'fine' : 'plain', mulberry32(hashString(`${seed}#looks#${id}`)));
  // One of the wanderer's people looks as the wanderer remembers them.
  const look = tf?.look ? { ...base, skin: tf.look.skin, hair: tf.look.hair, hairStyle: tf.look.hairStyle, beard: tf.look.beard, cloth: [tf.look.cloth, base.cloth[1], base.cloth[2]] as [string, string, string] } : base;
  const facings = ['n', 'e', 's', 'w'] as const;
  return {
    id, name: p.name, given: p.given, female: p.female, age: p.age, culture: p.culture, people: p.people, trade: p.trade, role: p.role, traits: [...p.traits],
    ...(p.note ? { note: p.note } : {}), means: h.means, household: h.name, homeId: b.bid,
    ...(typeof b.f.properties.label === 'string' ? { homeName: b.f.properties.label } : {}),
    ties: p.ties.map((t) => ({ kind: t.kind, text: t.text })),
    template: templateOf(p, work, kind), day, plan, home, at, facing: facings[Math.floor(r() * 4) % 4],
    ...(tf ? { tie: tf.kind } : {}),
    look,
  };
}

/**
 * How a person of a people looks (every resident, robber and stranger the worker places): skin
 * and hair from the people's figures, grey past 55, their hair and beard styles, their cloth (dyed
 * for those with the means, homespun for the rest, and drab for the rough), and the people's
 * headwear on some (never on the rough, who wear what they have). `lr` draws in a fixed order, so
 * the same person always looks the same.
 */
export function lookFor(seed: string, ci: number, who: { female: boolean; age: number }, dress: 'fine' | 'plain' | 'rough', lr: () => number): PlacedPerson['look'] {
  const pick = <T>(xs: readonly T[], fb: T): T => (xs.length ? xs[Math.floor(lr() * xs.length) % xs.length] : fb);
  const lk = cultureLook(seed, ci);
  const spec = LOOKS[CULTURES[ci]?.id ?? ''] ?? LOOKS.anglo;
  const skins = lk ? [...new Set(lk.figures.map((f) => f.skin[0]))] : [];
  const hairs = lk ? [...new Set(lk.figures.map((f) => f.hair[0]).filter((c) => c !== '#00000000'))] : [];
  const skin = pick(skins, spec.skin[0]?.[0] ?? '#d3a878');
  const hair = who.age > 55 ? (lr() < 0.5 ? '#9b9a96' : '#d8dde2') : pick(hairs, spec.hair[0]?.[0] ?? '#45301f');
  const hairStyle = pick(who.female ? spec.hairF : spec.hairM, 'short');
  const beard = who.female || who.age < 17 ? 'none' : pick(spec.beard, 'none');
  const fine = dress === 'fine';
  const cloth = (fine ? spec.bright : spec.dull).map((c) => c[0]);
  const dull = spec.dull.map((c) => c[0]);
  let head: string | undefined;
  if (dress !== 'rough') {
    const outfit = lk?.figures[fine ? 1 : 0]?.outfit;
    head = outfit ? HEAD_SHAPE[outfit.head] : undefined;
    if (head === 'veil' && !who.female) head = undefined;
    if (who.age < 12 || lr() < 0.35) head = undefined;
  }
  return {
    kind: lk?.kind ?? 'human', skin, hair, hairStyle, beard,
    cloth: [pick(cloth, '#7a6a50'), pick(dull, '#6a5a46'), pick(dull, '#4e5a3e')],
    ...(head ? { head } : {}),
  };
}
