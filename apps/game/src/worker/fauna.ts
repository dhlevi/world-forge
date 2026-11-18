/**
 * The animals about the wanderer (docs/design/npcs.md, Animals: Where animals come from; Stage 2):
 * - **Wild:** each chunk has a seeded population by the region's species (core local/fauna.ts,
 *   from its habitats and bestiary), thinned in and near settlements, renewed week by week (so
 *   that a hunted chunk fills again). Each group has a home range and, where there is any near,
 *   water to drink at.
 * - **Kept:** horses at stables and inns; hens, pigs and geese about farmhouses; flocks and herds
 *   of sheep, cattle and goats on the grass about villages.
 * - **Streets:** dogs and cats about the houses of towns, rats by night, pigeons at the markets.
 *
 * The same world, place and week give the same animals (no Math.random).
 */
import type { GeneratedWorld } from '@worldforge/core/gen/world';
import { CHUNK, TILE_M, type LocalWorld } from '@worldforge/core/local/chunk';
import { GROUND_TILES } from '@worldforge/core/local/tiles';
import { SPECIES_BY_ID, wildSpecies, type Species } from '@worldforge/core/local/fauna';
import { regionAt, type Region } from '@worldforge/core/nature/habitat';
import { bestiary } from '@worldforge/core/nature/bestiary';
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import type { AnimalGroup, Spot } from './protocol';
import { STALLS, openGround, tilesBeside } from './people';

/** How far (tiles) a group ranges from its home, by size (birds farther). */
const RANGE = { tiny: 8, small: 12, medium: 20, large: 28, huge: 32 };
/** How much of the wild there is in a settlement, and near one. */
const IN_TOWN = 0.05, NEAR_TOWN = 0.4;

const regions = new Map<string, { region: Region; names: Set<string> }>();
let forWorld: GeneratedWorld | null = null;

function regionFor(w: GeneratedWorld, lon: number, lat: number): { region: Region; names: Set<string> } {
  const k = `${Math.floor(lon * 2)},${Math.floor(lat * 2)}`;
  let hit = regions.get(k);
  if (!hit) {
    const region = regionAt(w.raster, lon, lat);
    hit = { region, names: new Set(bestiary(w.raster.seed, region).map((c) => c.name)) };
    regions.set(k, hit);
  }
  return hit;
}

/** A free tile of open ground (or, for swimmers, water) near a point, by a seeded search. */
function groundNear(local: LocalWorld, x: number, y: number, r: () => number, water = false, tries = 30, spread = 6): Spot | null {
  for (let i = 0; i < tries; i++) {
    const tx = Math.round(x + (r() - 0.5) * 2 * spread), ty = Math.round(y + (r() - 0.5) * 2 * spread);
    if (water) {
      const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
      const g = GROUND_TILES[local.chunk(cx, cy).ground[(ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK)]];
      if (g?.water) return { x: tx, y: ty, z: null };
    }
    if (openGround(local, tx, ty)) return { x: tx, y: ty, z: null };
  }
  return null;
}

/** Water near a place (within `d` tiles), for drinking at: the nearest found on a coarse scan. */
function waterNear(local: LocalWorld, x: number, y: number, d: number): Spot | null {
  let best: Spot | null = null, bd = Infinity;
  for (let ty = y - d; ty <= y + d; ty += 2) for (let tx = x - d; tx <= x + d; tx += 2) {
    const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
    const g = GROUND_TILES[local.chunk(cx, cy).ground[(ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK)]];
    if (!g?.water) continue;
    const dd = (tx - x) * (tx - x) + (ty - y) * (ty - y);
    if (dd < bd) {
      bd = dd;
      best = { x: tx, y: ty, z: null };
    }
  }
  return best;
}

/** A group of a species about a place: its members spread a little about it, its range and water. */
function group(local: LocalWorld, id: string, s: Species, at: Spot, r: () => number, range?: number): AnimalGroup | null {
  const n = s.group[0] + Math.floor(r() * (s.group[1] - s.group[0] + 1));
  const members: Spot[] = [];
  const taken = new Set<string>();
  for (let i = 0; i < n * 3 && members.length < n; i++) {
    const m = i === 0 ? at : groundNear(local, at.x, at.y, r, !!s.swims && !s.fly && s.plan === 'serpent', 6, 2 + Math.floor(n / 3));
    if (!m || taken.has(`${m.x},${m.y}`)) continue;
    taken.add(`${m.x},${m.y}`);
    members.push(m);
  }
  if (!members.length) return null;
  const rr = range ?? (s.fly ? 30 : RANGE[s.size]);
  return { id, species: s.id, members, home: { x: at.x, y: at.y, r: rr }, water: s.fly && s.home !== 'wild' ? null : waterNear(local, at.x, at.y, Math.min(24, rr)) };
}

/** The animals within `radius` tiles of (x, y) in the week of `time` (winter: the cold months). */
export function animalsIn(w: GeneratedWorld, local: LocalWorld, x: number, y: number, radius: number, time: number, winter: boolean): AnimalGroup[] {
  if (forWorld !== w) {
    regions.clear();
    forWorld = w;
  }
  const seed = w.raster.seed, week = Math.floor(time / (7 * 86400));
  const out: AnimalGroup[] = [];
  const inBox = (t: Spot) => Math.abs(t.x - x) <= radius && Math.abs(t.y - y) <= radius;

  // ---- The wild, chunk by chunk.
  for (let cy = Math.floor((y - radius) / CHUNK); cy <= Math.floor((y + radius) / CHUNK); cy++) for (let cx = Math.floor((x - radius) / CHUNK); cx <= Math.floor((x + radius) / CHUNK); cx++) {
    const mx = (cx + 0.5) * CHUNK * TILE_M, my = -(cy + 0.5) * CHUNK * TILE_M;
    const [lon, lat] = local.frame.toLL([mx, my]);
    const { region, names } = regionFor(w, lon, lat);
    const thin = local.inSettlement(lon, lat) ? IN_TOWN : local.sitesNear(mx, my, mx, my, 150).length ? NEAR_TOWN : 1;
    for (const { s, density } of wildSpecies(region, (n) => names.has(n), winter)) {
      const r = mulberry32(hashString(`${seed}#fauna#${cx},${cy}#${week}#${s.id}`));
      const want = density * thin;
      const n = Math.floor(want) + (r() < want - Math.floor(want) ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const at = groundNear(local, cx * CHUNK + CHUNK / 2, cy * CHUNK + CHUNK / 2, r, !!s.swims && s.plan === 'serpent', 40, CHUNK / 2);
        if (!at || !inBox(at)) continue;
        const g = group(local, `w:${cx},${cy}:${week}:${s.id}:${i}`, s, at, r);
        if (g) out.push(g);
      }
    }
  }

  // ---- Kept and street animals, by the buildings of the plans.
  const R = radius;
  const buildings = local.buildingsIn(x - R, y - R, x + R, y + R);
  for (const b of buildings) {
    const p = b.f.properties, door = b.doors[0];
    if (!door) continue;
    const r = mulberry32(hashString(`${seed}#kept#${b.bid}`));
    const near = (spread: number) => groundNear(local, door[0], door[1], r, false, 30, spread);
    const add = (sid: string, at: Spot | null, range?: number) => {
      const s = SPECIES_BY_ID.get(sid);
      if (!s || !at || !inBox(at)) return;
      const g = group(local, `${s.home === 'street' ? 's' : 'k'}:${b.bid}:${sid}`, s, at, r, range);
      if (g) out.push(g);
    };
    const role = String(p.role ?? ''), ctx = String(p.ctx ?? ''), village = b.site.tier === 'village';
    if (role === 'stables') add('horse', near(5), 8);
    else if (role === 'inn') {
      add('horse', near(4), 6);
      if (r() < 0.4) add('donkey', near(4), 6);
    }
    if (village || ctx === 'farm' || ctx === 'farming' || ctx === 'suburb') {
      if (r() < 0.55) add('hen', near(4), 6);
      if (r() < 0.25) add('pig', near(4), 5);
      if (r() < 0.12) add('goose', near(5), 8);
      const herd = r();
      // Flocks and herds out on the grass about the village.
      if (herd < 0.18) add('sheep', groundNear(local, door[0], door[1], r, false, 40, 24), 24);
      else if (herd < 0.28) add('cattle', groundNear(local, door[0], door[1], r, false, 40, 24), 24);
      else if (herd < 0.36) add('goat', groundNear(local, door[0], door[1], r, false, 40, 20), 18);
    }
    if (!village) {
      // A town's dogs and cats about the houses.
      if (r() < 0.1) add('dog', near(3), 14);
      if (r() < 0.12) add('cat', near(3), 12);
    }
  }
  // Rats about the houses of a town, and pigeons at its markets.
  const town = buildings.filter((b) => b.site.tier !== 'village');
  if (town.length) {
    const r = mulberry32(hashString(`${seed}#street#${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}#${week}`));
    for (let i = 0, n = Math.round(town.length / 12); i < n; i++) {
      const b = town[Math.floor(r() * town.length)], door = b.doors[0];
      if (!door) continue;
      const s = SPECIES_BY_ID.get('rat')!, at = groundNear(local, door[0], door[1], r, false, 20, 4);
      if (at && inBox(at)) {
        const g = group(local, `s:${b.bid}:rat:${i}`, s, at, r, 10);
        if (g) out.push(g);
      }
    }
    const stalls = tilesBeside(local, x - R, y - R, x + R, y + R, STALLS);
    const seenMarkets: Spot[] = [];
    for (const t of stalls) {
      if (seenMarkets.some((m) => Math.abs(m.x - t.x) < 20 && Math.abs(m.y - t.y) < 20)) continue;
      seenMarkets.push(t);
      const g = group(local, `s:market:${t.x},${t.y}:pigeon`, SPECIES_BY_ID.get('pigeon')!, t, r, 16);
      if (g) out.push(g);
    }
  }
  return out;
}
