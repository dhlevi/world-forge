/**
 * The residents about the wanderer (docs/design/npcs.md, Placed residents): the households of the
 * plans' buildings near a tile (core people/plan-residents.ts), each person placed where their
 * first, simple day plan (core people/routine.ts) puts them at the hour: in bed at night, at work
 * by day, at home in the morning and the evening. Those away from the place are left out.
 *
 * The same world, place and time always give the same people in the same places.
 */
import type { GeneratedWorld } from '@worldforge/core/gen/world';
import { CHUNK, TILE_M, type LocalWorld, type PlanBuilding, type BuildingSpot } from '@worldforge/core/local/chunk';
import { GROUND_TILES, OBJECT_TILES } from '@worldforge/core/local/tiles';
import { LocalFrame } from '@worldforge/core/towns/plan';
import { householdsFor, residentBuilding } from '@worldforge/core/people/plan-residents';
import { kindOf, type Household, type RKind } from '@worldforge/core/people/residents';
import { dayPlan, whereabouts, workOf, type Work } from '@worldforge/core/people/routine';
import { LOOKS, lookOf, type Look } from '@worldforge/core/people/appearance';
import { CULTURES } from '@worldforge/core/names/cultures';
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import { DMath } from '@worldforge/core/dmath';
import type { PlacedPerson } from './protocol';

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
const homes = new Map<string, Home>();
const looks = new Map<number, Look | null>();

/** Forgets what was worked out (a new world or a new game). */
export function forgetPeople(): void {
  homes.clear();
  looks.clear();
  forWorld = null;
}

function homeOf(w: GeneratedWorld, b: PlanBuilding): Home {
  let h = homes.get(b.bid);
  if (h) return h;
  const v = b.site.tier === 'village' ? { lon: b.site.lon, lat: b.site.lat, kind: String(b.site.kind ?? 'farming'), population: b.site.population, name: b.site.name ?? '' } : undefined;
  let households: Household[] = [];
  let kind: RKind = 'home';
  try {
    households = householdsFor(w, b.f, b.plan, v);
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

/** The residents within `radius` tiles of (x, y) at a time (game seconds), placed. */
export function peopleIn(w: GeneratedWorld, local: LocalWorld, x: number, y: number, radius: number, time: number): PlacedPerson[] {
  if (forWorld !== w) {
    forgetPeople();
    forWorld = w;
  }
  const seed = w.raster.seed;
  const day = Math.floor(time / 86400), hour = (time % 86400) / 3600;
  const R = radius + MARGIN;
  const out: PlacedPerson[] = [];
  const taken = new Set<string>();
  const keyOf = (t: { x: number; y: number; z: number | null }) => `${t.x},${t.y},${t.z ?? 'g'}`;
  const inside = (t: { x: number; y: number }) => Math.abs(t.x - x) <= radius && Math.abs(t.y - y) <= radius;

  for (const b of local.buildingsIn(x - R, y - R, x + R, y + R)) {
    const home = homeOf(w, b);
    const shop = home.kind === 'home' ? b.spots.find((s) => s.z === null && TRADE_ROOMS.has(s.room))?.room : undefined;
    home.households.forEach((h, hi) => h.members.forEach((p, mi) => {
      const id = `${b.bid}#${hi}#${mi}`;
      const work: Work = workOf(p, h, home.kind, shop);
      const where = whereabouts(dayPlan(seed, id, day, p, work), work, hour);
      if (where === 'away') return;
      const r = mulberry32(hashString(`${seed}#place#${id}#${day}#${where}`));
      const spot = where === 'out' ? outdoors(local, b, r, taken) : indoors(b.spots, where, r, taken, keyOf);
      if (!spot || !inside(spot)) return;
      taken.add(keyOf(spot));
      out.push(placed(seed, id, p, h, b, spot, where === 'out' ? 'out' : where, r));
    }));
  }
  return out;
}

/** A spot inside the building for a person at home, at work or asleep. */
function indoors(spots: BuildingSpot[], where: 'asleep' | 'home' | 'work', r: () => number, taken: Set<string>, keyOf: (t: BuildingSpot) => string): BuildingSpot | null {
  const free = spots.filter((s) => !taken.has(keyOf(s)));
  if (!free.length) return null;
  const pickOf = (xs: BuildingSpot[]) => (xs.length ? xs[Math.floor(r() * xs.length) % xs.length] : null);
  if (where === 'asleep') {
    // A bed's pillow end (no bed to its north or west), else any bed, else a bedroom, else the floor.
    const beds = free.filter((s) => s.obj === 'bed');
    const head = beds.filter((s) => !spots.some((o) => o.obj === 'bed' && o.z === s.z && ((o.x === s.x && o.y === s.y - 1) || (o.x === s.x - 1 && o.y === s.y))));
    return pickOf(head) ?? pickOf(beds) ?? pickOf(free.filter((s) => s.room.includes('bed') || s.obj === 'straw' || s.obj === 'bedroll')) ?? pickOf(free);
  }
  const open = free.filter((s) => s.obj !== 'bed');
  if (where === 'work') return pickOf(open.filter((s) => s.z === null && WORK_ROOMS.has(s.room))) ?? pickOf(open.filter((s) => s.z === null)) ?? pickOf(open);
  // At home: the rooms lived in by day, the ground floor first.
  return pickOf(open.filter((s) => s.z === null && !s.room.includes('bed'))) ?? pickOf(open.filter((s) => !s.room.includes('bed'))) ?? pickOf(open) ?? pickOf(free);
}

/** Open ground near a building's door, for those who work out of doors (on the ground). */
function outdoors(local: LocalWorld, b: PlanBuilding, r: () => number, taken: Set<string>): BuildingSpot | null {
  const door = b.doors.length ? b.doors[Math.floor(r() * b.doors.length) % b.doors.length] : [b.x0 + (b.w >> 1), b.y0 + b.h];
  const want = 3 + Math.floor(r() * 12);
  for (let tries = 0; tries < 24; tries++) {
    const a = r() * Math.PI * 2, d = want + tries * 0.5;
    const tx = Math.round(door[0] + DMath.cos(a) * d), ty = Math.round(door[1] + DMath.sin(a) * d);
    if (taken.has(`${tx},${ty},g`)) continue;
    const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
    const c = local.chunk(cx, cy), k = (ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK);
    const g = GROUND_TILES[c.ground[k]], o = OBJECT_TILES[c.object[k]];
    if (!g || !g.pass || g.water || g.name.startsWith('floor_') || (c.object[k] && !o?.pass)) continue;
    return { x: tx, y: ty, z: null, obj: '', room: '' };
  }
  return null;
}

/** A resident as the game gets them: who they are, their looks, where they stand. */
function placed(seed: string, id: string, p: Household['members'][number], h: Household, b: PlanBuilding, spot: BuildingSpot, where: PlacedPerson['where'], r: () => number): PlacedPerson {
  const lr = mulberry32(hashString(`${seed}#looks#${id}`));
  const pick = <T>(xs: readonly T[], fb: T): T => (xs.length ? xs[Math.floor(lr() * xs.length) % xs.length] : fb);
  const lk = cultureLook(seed, p.culture);
  const spec = LOOKS[CULTURES[p.culture]?.id ?? ''] ?? LOOKS.anglo;
  const skins = lk ? [...new Set(lk.figures.map((f) => f.skin[0]))] : [];
  const hairs = lk ? [...new Set(lk.figures.map((f) => f.hair[0]).filter((c) => c !== '#00000000'))] : [];
  const skin = pick(skins, spec.skin[0]?.[0] ?? '#d3a878');
  const hair = p.age > 55 ? (lr() < 0.5 ? '#9b9a96' : '#d8dde2') : pick(hairs, spec.hair[0]?.[0] ?? '#45301f');
  const hairStyle = pick(p.female ? spec.hairF : spec.hairM, 'short');
  const beard = p.female || p.age < 17 ? 'none' : pick(spec.beard, 'none');
  // Cloth: dyed for those with the means, homespun for the rest.
  const rich = h.means === 'rich' || h.means === 'comfortable';
  const cloth = (rich ? spec.bright : spec.dull).map((c) => c[0]);
  const dull = spec.dull.map((c) => c[0]);
  const outfit = lk?.figures[rich ? 1 : 0]?.outfit;
  let head = outfit ? HEAD_SHAPE[outfit.head] : undefined;
  if (head === 'veil' && !p.female) head = undefined;
  if (p.age < 12 || lr() < 0.35) head = undefined;
  const facings = ['n', 'e', 's', 'w'] as const;
  return {
    id, name: p.name, given: p.given, female: p.female, age: p.age, culture: p.culture, people: p.people, trade: p.trade, role: p.role, traits: [...p.traits],
    ...(p.note ? { note: p.note } : {}), means: h.means, household: h.name, homeId: b.bid,
    ...(typeof b.f.properties.label === 'string' ? { homeName: b.f.properties.label } : {}),
    x: spot.x, y: spot.y, z: spot.z, where, facing: where === 'asleep' ? 's' : facings[Math.floor(r() * 4) % 4],
    look: {
      kind: lk?.kind ?? 'human', skin, hair, hairStyle, beard,
      cloth: [pick(cloth, '#7a6a50'), pick(dull, '#6a5a46'), pick(dull, '#4e5a3e')],
      ...(head ? { head } : {}),
    },
  };
}
