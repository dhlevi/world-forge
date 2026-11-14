/**
 * Caves, dungeons and delves on the local map (core local/under.ts), on flat land at 33 m (level
 * 11): every kind laid out below the land (a tower above it), every way up meeting a way down at the
 * same tile on the nearest level above that has one (the way in on the surface for the first
 * level), every open tile reached on foot from the ways in on the surface, and the same layout every time.
 * npx tsx apps/game/scripts/under-test.ts (exits non-zero on a failure).
 */
import { DUNGEON_KINDS, type DungeonKind, type DungeonSite } from '@worldforge/core/dungeons/core';
import type { LairSite } from '@worldforge/core/lairs/base';
import { OBJECT_TILES, GROUND_TILES } from '@worldforge/core/local/tiles';
import { planCave, planDungeon, type UnderLand, type UnderPlan } from '@worldforge/core/local/under';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

const GROUND_LEVEL = 11;
const land: UnderLand = { lowest: () => GROUND_LEVEL, heightAt: () => 33 };
const UP = new Set(['stairs_up', 'ladder_up', 'stairs_spiral']);
const DOWN = new Set(['stairs_down', 'ladder_down', 'stairs_spiral', 'dungeon_entrance', 'mine_entrance', 'cave_mouth', 'grate', 'well']);
const WALLS = new Set(['wall_stone', 'wall_brick', 'rock_wall', 'ruin_wall']);

/** A plan's levels laid one over another as a chunk lays them (open floor breaking through walls), and its surface. */
function composite(p: UnderPlan) {
  const tiles = new Map<string, { g: number; o: number }>();
  for (const l of p.levels) for (let j = 0; j < l.h; j++) for (let i = 0; i < l.w; i++) {
    const q = j * l.w + i;
    if (!l.ground[q]) continue;
    const k = `${l.x0 + i},${l.y0 + j},${l.z}`, had = tiles.get(k);
    if (had && !(WALLS.has(OBJECT_TILES[had.o].name) && !WALLS.has(OBJECT_TILES[l.object[q]].name))) continue;
    tiles.set(k, { g: l.ground[q], o: l.object[q] });
  }
  const surface = new Map<string, number>();
  for (const e of p.surface) if (e.object !== undefined) surface.set(`${e.x},${e.y}`, e.object);
  const nameAt = (x: number, y: number, z: number) => {
    const t = tiles.get(`${x},${y},${z}`);
    if (t) return OBJECT_TILES[t.o].name;
    return z === GROUND_LEVEL ? OBJECT_TILES[surface.get(`${x},${y}`) ?? 0].name : '';
  };
  return { tiles, nameAt };
}

function check(what: string, make: () => UnderPlan | null) {
  const p = make();
  ok(!!p && p.levels.length > 0, `${what}: laid out (${p?.levels.length ?? 0} levels)`);
  if (!p) return;
  const { tiles, nameAt } = composite(p);
  let ways = 0, lost = 0, open = 0, reached = 0, above = 0;
  for (const [k, t] of tiles) {
    const [x, y, z] = k.split(',').map(Number), n = OBJECT_TILES[t.o].name;
    if (z >= GROUND_LEVEL && p.kind !== 'tower') above++;
    if (n === 'well') continue;
    if (UP.has(n) || DOWN.has(n)) {
      ways++;
      const meets = (up: boolean) => {
        for (let d = 1; d <= 48; d++) if ((up ? DOWN : UP).has(nameAt(x, y, up ? z + d : z - d))) return true;
        return false;
      };
      if (n === 'stairs_spiral' ? !meets(true) && !meets(false) : UP.has(n) ? !meets(true) : !meets(false)) lost++;
    }
  }
  // The surface's ways in all lead down.
  let ins = 0, insOk = 0;
  for (const e of p.surface) {
    if (e.object === undefined || !DOWN.has(OBJECT_TILES[e.object].name) || OBJECT_TILES[e.object].name === 'stairs_spiral') continue;
    ins++;
    for (let d = 1; d <= 48; d++) if (UP.has(nameAt(e.x, e.y, GROUND_LEVEL - d))) {
      insOk++;
      break;
    }
  }
  // Reached from the surface: walking from each way in, and up and down every way met on the way.
  const pass = (k: string) => {
    const t = tiles.get(k);
    if (!t) return false;
    const o = OBJECT_TILES[t.o];
    return o.pass || !!o.toggle;
  };
  const seen = new Set<string>(), st: string[] = [];
  const visit = (k: string) => {
    if (!seen.has(k) && tiles.has(k)) {
      seen.add(k);
      st.push(k);
    }
  };
  for (const e of p.surface) {
    if (e.object === undefined || !DOWN.has(OBJECT_TILES[e.object].name)) continue;
    for (let d = 1; d <= 48; d++) if (UP.has(nameAt(e.x, e.y, GROUND_LEVEL - d))) {
      visit(`${e.x},${e.y},${GROUND_LEVEL - d}`);
      break;
    }
  }
  while (st.length) {
    const [x, y, z] = st.pop()!.split(',').map(Number);
    const n = nameAt(x, y, z);
    // Up or down the way here, to the level it meets.
    for (const up of [true, false]) {
      if (!(up ? UP : DOWN).has(n)) continue;
      for (let d = 1; d <= 48; d++) {
        const t = up ? z + d : z - d;
        if ((up ? DOWN : UP).has(nameAt(x, y, t))) {
          visit(`${x},${y},${t}`);
          break;
        }
      }
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy},${z}`;
      if (pass(k)) visit(k);
    }
  }
  for (const [k, t] of tiles) if (OBJECT_TILES[t.o].pass && !GROUND_TILES[t.g].water) {
    open++;
    if (seen.has(k)) reached++;
  }
  console.log(`  ${what}: levels ${p.levels.map((l) => l.z).join(',')}, ${ways} ways, ${ins} ways in, ${reached}/${open} open tiles reached`);
  ok(lost === 0, `${what}: every way up meets a way down above it (and back), however deep (${lost} lost)`);
  ok(ins > 0 && insOk === ins, `${what}: its ways in from the surface lead down to it (${insOk}/${ins})`);
  ok(reached >= open * 0.995, `${what}: its floors reached on foot from its ways in on the surface (${reached}/${open})`);
  ok(above === 0, `${what}: below the land, clear of the cellars (${above} tiles at the ground's level or above)`);
  ok(JSON.stringify(make()?.levels.map((l) => [l.z, l.x0, l.y0, Array.from(l.object).join('')])) === JSON.stringify(p.levels.map((l) => [l.z, l.x0, l.y0, Array.from(l.object).join('')])), `${what}: the same layout every time`);
  return p;
}

const site = (kind: DungeonKind, more: Partial<DungeonSite> = {}): DungeonSite => ({ id: `t-${kind}`, kind, name: `The ${kind}`, seed: 12345 + kind.length * 77, tags: ['medium', '2 levels', 'pop:6000'], lon: 0, lat: 0, culture: 0, ...more });
for (const kind of DUNGEON_KINDS) {
  if (kind === 'tower') continue;
  const town = kind === 'sewer' || kind === 'catacomb' || kind === 'prison' || kind === 'delve' || kind === 'hold';
  const p = check(kind, () => planDungeon(site(kind, kind === 'sewer' ? { streets: [[[-60, 0], [60, 0]], [[0, -40], [0, 40]]], grates: [[30, 0]] } : {}), [100, 200], town, land));
  if (p && town) ok(Math.max(...p.levels.map((l) => l.z)) <= GROUND_LEVEL - 3, `${kind}: under a town, three levels down at least (clear of the cellars)`);
}
// A tower stands on the land: its ground floor on the surface, storeys above.
{
  const p = planDungeon(site('tower', { tags: ['large', '3 levels'] }), [50, 50], false, land)!;
  const ground = p.surface.filter((e) => e.object !== undefined && e.elevM === 33);
  ok(ground.length > 20 && ground.some((e) => OBJECT_TILES[e.object!].name === 'door'), 'a tower\'s ground floor on the surface, levelled, with a door');
  ok(p.levels.some((l) => l.z > GROUND_LEVEL) && !!p.roof && p.roof.floorM === 33, `a tower's storeys and roof above it (levels ${p.levels.map((l) => l.z).join(',')})`);
  const spirals = p.levels.map((l) => Array.from(l.object).filter((o) => OBJECT_TILES[o].name === 'stairs_spiral').length);
  ok(spirals.every((n) => n === 1), 'one spiral stair through every floor');
}
// A cave: below the land under its mouth.
for (const [seed, tags] of [[987, ['large']], [31, ['small', 'sealed']], [4242, ['medium', 'wet', '3 levels']], [77, ['large', '2 levels']], [1234, ['small']]] as [number, string[]][]) {
  const cave: LairSite = { id: `t-cave-${seed}`, kind: 'cave', name: 'The cave', seed, tags, lon: 0, lat: 0 };
  check(`cave (${tags.join(', ')})`, () => planCave(cave, [-40, 70], land));
}

if (failures) {
  console.log(`${failures} failed`);
  process.exit(1);
}
console.log('all under tests passed');
