/**
 * The people of the bubble walking their days (world/population.ts, world/paths.ts), on a made-up
 * map: a house with a bedroom upstairs and a door to the street, and a workshop across the way.
 * A person wakes, comes down the stairs, opens the door (and shuts it behind them), walks to work
 * and back; out of reach and out of sight they move in one go when the walk would have ended; two
 * meet in a doorway and both get through; one standing about steps aside; the rain sends them home
 * from the square; leaving the bubble and coming into it happen out of sight; and the queue's cost.
 * npx tsx apps/game/scripts/agents-test.ts (exits non-zero on a failure).
 */
import { CHUNK } from '@worldforge/core/local/chunk';
import { G, O, OBJECT_TILES } from '@worldforge/core/local/tiles';
import { GameMap } from '../src/game/map';
import { findPath, stairTo } from '../src/world/paths';
import { ACTIVE, Population, type PopulationView } from '../src/world/population';
import type { ChunkData, PlacedPerson, PlanStop, Spot } from '../src/worker/protocol';
import '../src/actors/cast';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

// ---- The map: ground at level 10; the house (walls x 4..10, y 4..10, door at (7, 10), stair at (6, 6)
// up to a first floor at level 11 with a bed at (8, 8)); the workshop (walls x 20..26, y 4..10, door at (23, 10)).
const N = CHUNK * CHUNK, at = (x: number, y: number) => y * CHUNK + x;
const map = new GameMap(() => {});
const wallOf = (x: number, y: number, x0: number, x1: number) => x === x0 || x === x1 || y === 4 || y === 10;
for (let cy = -1; cy <= 1; cy++) for (let cx = -1; cx <= 2; cx++) {
  const home = cx === 0 && cy === 0;
  const ground = new Uint8Array(N).fill(G('grass')), object = new Uint8Array(N), area = new Uint16Array(N);
  const first = { ground: new Uint8Array(N), object: new Uint8Array(N), area: new Uint16Array(N) };
  if (home) {
    for (const [x0, x1, door] of [[4, 10, 7], [20, 26, 23]] as [number, number, number][]) for (let y = 4; y <= 10; y++) for (let x = x0; x <= x1; x++) {
      ground[at(x, y)] = G('floor_boards');
      area[at(x, y)] = 1;
      if (wallOf(x, y, x0, x1)) object[at(x, y)] = x === door && y === 10 ? O('door')! : O('wall_plank')!;
    }
    object[at(6, 6)] = O('stairs_up')!;
    // A square: flagstones at x 4..12, y 20..26.
    for (let y = 20; y <= 26; y++) for (let x = 4; x <= 12; x++) ground[at(x, y)] = G('flagstones');
    for (let y = 4; y <= 10; y++) for (let x = 4; x <= 10; x++) {
      first.ground[at(x, y)] = G('floor_boards');
      first.area[at(x, y)] = 2;
      first.object[at(x, y)] = wallOf(x, y, 4, 10) ? O('wall_plank')! : x === 6 && y === 6 ? O('stairs_down')! : x === 8 && (y === 8 || y === 9) ? O('bed')! : 0;
    }
  }
  const c: ChunkData = { cx, cy, ground, object, area, areas: ['', 'House: hall', 'House, first floor: bedroom'], elev: new Int16Array(N).fill(30), sites: [], roofs: [], layers: home ? [{ z: 11, ...first }] : [], ms: 0 };
  map.add(c);
}

// ---- Paths ---------------------------------------------------------------------------------------------
const bed: Spot = { x: 8, y: 8, z: 11 }, hall: Spot = { x: 8, y: 6, z: null }, work: Spot = { x: 23, y: 7, z: null }, square: Spot = { x: 8, y: 23, z: null };
ok(stairTo(map, 6, 6, null, true) === 11 && stairTo(map, 6, 6, 11, false) === null, 'the stair leads up to the first floor and back down');
const p0 = findPath(map, bed, work);
ok(!!p0 && p0.some((s) => s.stairs) && p0.some((s) => s.door && s.x === 7 && s.y === 10) && p0.some((s) => s.door && s.x === 23 && s.y === 10), 'a path from the bed upstairs to the workshop: down the stair, out of one door, in at the other');
ok(!!p0 && p0[p0.length - 1].x === work.x && p0[p0.length - 1].y === work.y && p0[p0.length - 1].z === null, 'and it ends at the place');
ok(findPath(map, hall, { x: 5, y: 5, z: 12 }) === null, 'no path to a floor that is not there');

// ---- People --------------------------------------------------------------------------------------------
const H = 3600;
const person = (id: string, plan: [number, number, PlanStop['act'], PlanStop['place'], Spot | null][], here: Spot | null, home: Spot = hall): PlacedPerson => ({
  id, name: `P ${id}`, given: 'P', female: false, age: 30, culture: 0, people: 'the folk', trade: 'cooper', role: 'head', traits: [], means: 'middling',
  household: 'the household of P', homeId: 'b', template: 'craft', day: 0, plan: plan.map(([from, to, act, place, a]) => ({ from, to, act, place, at: a })), home, at: here, facing: 's',
  look: { kind: 'human', skin: '#d8b090', hair: '#5a3a20', hairStyle: 'short', beard: 'none', cloth: ['#7a6a50', '#6a5a46', '#4e5a3e'] },
});
const day = (id: string, here: Spot | null) => person(id, [[0, 7, 'sleep', 'bed', bed], [7, 17, 'work', 'work', work], [17, 24, 'home', 'home', hall]], here);

const seen = new Set<string>();
let allSeen = false;
const view: PopulationView = {
  px: 15, py: 15, z: null, time: 6 * H, map,
  isVisible: (x, y) => allSeen || seen.has(`${x},${y}`),
};
const fresh = () => new Population(() => Promise.resolve({ people: [], radius: 64 }), 'seed');
const runTo = (pop: Population, t: number, step = 1.2) => {
  for (; view.time < t; view.time = Math.min(t, view.time + step)) pop.run(view);
  pop.run(view);
};

{
  console.log('\nA working day, walked');
  const pop = fresh();
  view.time = 6 * H;
  pop.take([day('a', bed)], view);
  const a = [...pop.all()][0];
  ok(!!a && a.x === 8 && a.y === 8 && a.z === 11 && a.where === 'asleep', 'at 06:00, in bed upstairs, asleep');
  runTo(pop, 7 * H - 1, 30);
  ok(a.x === 8 && a.y === 8 && a.z === 11, 'still abed at 06:59');
  const trail: Spot[] = [];
  let doorOpen = false, doorShutAfter = false;
  for (view.time = 7 * H; view.time < 7 * H + 120; view.time += 1.2) {
    pop.run(view);
    trail.push({ x: a.x, y: a.y, z: a.z });
    const d = OBJECT_TILES[map.objectAt(7, 10, null)].name;
    if (d === 'door_open') doorOpen = true;
    if (doorOpen && d === 'door' && a.y > 10) doorShutAfter = true;
  }
  ok(trail.some((s) => s.z === null && s.x === 6 && s.y === 6), 'came down the stair');
  ok(doorOpen && doorShutAfter, 'opened the house door, and shut it behind them');
  ok(a.x === work.x && a.y === work.y && a.z === null && a.where === 'work', `at work within two minutes (${a.where} at ${a.x},${a.y})`);
  ok(OBJECT_TILES[map.objectAt(23, 10, null)].name === 'door', 'the workshop door shut again too');
  const steps = trail.filter((s, i) => i && (s.x !== trail[i - 1].x || s.y !== trail[i - 1].y || s.z !== trail[i - 1].z)).length;
  ok(trail.every((s, i) => !i || Math.max(Math.abs(s.x - trail[i - 1].x), Math.abs(s.y - trail[i - 1].y)) <= 1), `walked tile by tile (${steps} steps), never jumping`);
}

{
  console.log('\nOut of reach and out of sight: in one go');
  const pop = fresh();
  view.px = 15 + ACTIVE + 30;
  view.time = 16.9 * H;
  pop.take([day('b', work)], view);
  const b = [...pop.all()][0];
  view.time = 17 * H + 1;
  pop.run(view);
  ok(b.x === work.x && b.y === work.y, 'not gone home the moment the block begins');
  view.time = 17 * H + 60;
  pop.run(view);
  ok(b.x === hall.x && b.y === hall.y, 'at home once the walk would have taken them there');
  view.px = 15;
}

{
  console.log('\nIn sight, always on foot');
  const pop = fresh();
  view.px = 15 + ACTIVE + 30;
  view.time = 16.99 * H;
  pop.take([day('c', work)], view);
  allSeen = true;
  const c = [...pop.all()][0];
  let jumped = false, last = { x: c.x, y: c.y };
  for (view.time = 17 * H; view.time < 17 * H + 120; view.time += 1.2) {
    pop.run(view);
    if (Math.max(Math.abs(c.x - last.x), Math.abs(c.y - last.y)) > 1) jumped = true;
    last = { x: c.x, y: c.y };
  }
  ok(!jumped && c.x === hall.x && c.y === hall.y, `one in sight walks home tile by tile, however far the wanderer (at ${c.x},${c.y}, ${c.where})`);
  allSeen = false;
  view.px = 15;
}

{
  console.log('\nMeeting in a doorway, and stepping aside');
  const pop = fresh();
  view.time = 16.99 * H;
  // One leaves the workshop for home as another comes from home to the workshop.
  const out = person('d', [[0, 17, 'work', 'work', work], [17, 24, 'home', 'home', hall]], work);
  const inn = person('e', [[0, 17, 'home', 'home', { x: 7, y: 7, z: null }], [17, 24, 'work', 'work', { x: 22, y: 6, z: null }]], { x: 7, y: 7, z: null });
  // One stands about in the street on the way.
  const idle = person('f', [[0, 24, 'leisure', 'square', { x: 15, y: 12, z: null }]], { x: 15, y: 12, z: null });
  pop.take([out, inn, idle], view);
  runTo(pop, 17 * H + 180);
  const [d, e] = [pop.at(hall.x, hall.y, null), pop.at(22, 6, null)];
  ok(d?.p.id === 'd' && e?.p.id === 'e', 'both got where they were going');
  const f = [...pop.all()].find((r) => r.p.id === 'f')!;
  ok(!!f && f.present, `the one standing about is still about (at ${f.x},${f.y})`);
  // One stands just inside the house door (the only way out); another comes out past them.
  const pop2 = fresh();
  view.time = 7.99 * H;
  const blocker = person('i', [[0, 24, 'home', 'home', { x: 7, y: 9, z: null }]], { x: 7, y: 9, z: null });
  const leaver = person('j', [[0, 8, 'home', 'home', hall], [8, 24, 'leisure', 'square', square]], hall);
  pop2.take([blocker, leaver], view);
  runTo(pop2, 8 * H + 120);
  const j = [...pop2.all()].find((r) => r.p.id === 'j')!, i = [...pop2.all()].find((r) => r.p.id === 'i')!;
  ok(j.x === square.x && j.y === square.y, 'one standing in the way inside the door: the other still gets out');
  ok(i.x !== 7 || i.y !== 9 ? Math.max(Math.abs(i.x - 7), Math.abs(i.y - 9)) <= 1 : true, `the one in the way stepped aside, no farther than a tile (at ${i.x},${i.y})`);
}

{
  console.log('\nThe rain');
  const pop = fresh();
  view.time = 9.99 * H;
  pop.take([person('g', [[0, 10, 'home', 'home', hall], [10, 24, 'leisure', 'square', square]], hall)], view);
  const g = [...pop.all()][0];
  pop.raining = true;
  runTo(pop, 10 * H + 120);
  ok(g.x === hall.x && g.y === hall.y, 'in the rain, the square is put off: they stay in');
  pop.raining = false;
  runTo(pop, 10 * H + 240);
  ok(g.x === square.x && g.y === square.y && g.where === 'leisure', 'the rain stopped, they go out to the square');
  pop.raining = true;
  runTo(pop, 10 * H + 400);
  ok(g.x === hall.x && g.y === hall.y, 'and come home when it rains again');
}

{
  console.log('\nLeaving the bubble, and coming in');
  const pop = fresh();
  view.time = 7.99 * H;
  pop.take([person('h', [[0, 8, 'home', 'home', hall], [8, 24, 'work', 'work', null]], hall)], view);
  // The wanderer sees the house and the street about it.
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) seen.add(`${x},${y}`);
  const h = [...pop.all()][0];
  ok(!!h && h.present, 'at home before work');
  runTo(pop, 8 * H + 200);
  ok(!h.present || h.where === 'walking', 'off to work beyond the bubble: walking off, or gone');
  ok(!h.present || !view.isVisible(h.x, h.y) || h.where === 'walking', 'never vanishing in sight');
  runTo(pop, 8 * H + 600);
  ok(!h.present, 'gone, once out of sight');
  // Someone coming in to a place in sight appears out of sight and walks in.
  const k = person('k', [[0, 24, 'home', 'home', hall]], hall);
  pop.take([person('h', [[0, 8, 'home', 'home', hall], [8, 24, 'work', 'work', null]], null), k], view);
  const kr = [...pop.everyone()].find((r) => r.p.id === 'k')!;
  ok(!kr.present, 'one placed in sight is not put there');
  view.time += 300;
  pop.run(view);
  ok(kr.present && !view.isVisible(kr.x, kr.y), `they appear out of sight (at ${kr.x},${kr.y})`);
  runTo(pop, view.time + 120);
  ok(kr.x === hall.x && kr.y === hall.y, 'and walk in');
  seen.clear();
}

{
  console.log('\nThe queue\'s cost');
  const pop = fresh();
  view.time = 6.99 * H;
  const many: PlacedPerson[] = [];
  for (let i = 0; i < 150; i++) {
    const a: Spot = { x: 30 + (i % 30), y: 20 + Math.floor(i / 30) * 3, z: null }, b: Spot = { x: 30 + ((i * 7) % 30), y: 40 + Math.floor(i / 30) * 3, z: null };
    many.push(person(`m${i}`, [[0, 7, 'home', 'home', a], [7, 24, 'work', 'work', b]], a));
  }
  view.px = 45;
  view.py = 32;
  pop.take(many, view);
  let worst = 0, total = 0, n = 0;
  for (view.time = 7 * H; view.time < 7 * H + 90; view.time += 1.2) {
    const t0 = performance.now();
    pop.run(view);
    const dt = performance.now() - t0;
    worst = Math.max(worst, dt);
    total += dt;
    n++;
  }
  const arrived = [...pop.all()].filter((r) => r.where === 'work').length;
  console.log(`    ${(total / n).toFixed(2)} ms a step on average, ${worst.toFixed(1)} ms at worst (paths found in the first steps)`);
  ok(total / n < 4 && worst < 20, '150 walkers within 4 ms a step on average, and no step over 20 ms');
  ok(arrived > 140, `nearly all reached work (${arrived} of 150)`);
}

console.log(failures ? `\n${failures} failed` : '\nall agent tests passed');
process.exit(failures ? 1 : 0);
