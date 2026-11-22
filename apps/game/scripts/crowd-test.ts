/**
 * Getting past people (docs/backlog.md, N1 and B2): one who steps aside keeps out of the way for a
 * while instead of walking straight back; with no room to step aside, the wanderer squeezes past;
 * inside buildings, people are given places that leave the doors and passages clear, and a
 * building holds only so many at once (worker/people.ts); and on a real world, nobody the worker
 * places stands beside a door or in a passage one tile wide.
 * npx tsx apps/game/scripts/crowd-test.ts (exits non-zero on a failure).
 */
import { CHUNK, LocalWorld, type PlanBuilding } from '@worldforge/core/local/chunk';
import { G, O } from '@worldforge/core/local/tiles';
import { generateWorld } from '@worldforge/core/gen/world';
import { GameMap } from '../src/game/map';
import { Population, type PopulationView } from '../src/world/population';
import { peopleIn, bubbleAt, roomy, roomFor } from '../src/worker/people';
import type { ChunkData, PlacedPerson } from '../src/worker/protocol';
import '../src/actors/cast';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

const N = CHUNK * CHUNK;
const map = new GameMap(() => {});
for (let cy = -1; cy <= 1; cy++) for (let cx = -1; cx <= 1; cx++) {
  map.add({ cx, cy, ground: new Uint8Array(N).fill(G('grass')), object: new Uint8Array(N), area: new Uint16Array(N), areas: [''], elev: new Int16Array(N).fill(30), sites: [], roofs: [], layers: [], ms: 0 } as ChunkData);
}
const view: PopulationView & { time: number; px: number; py: number } = { px: 10, py: 10, z: null, time: 12 * 3600, map, isVisible: (x, y) => Math.hypot(x - view.px, y - view.py) <= 30 };
const person = (id: string, at: [number, number]): PlacedPerson => ({
  id, name: `${id} Holt`, given: id, female: false, age: 30, culture: 0, people: 'the folk', trade: 'cooper', role: 'head', traits: [], means: 'middling',
  household: `the household of ${id}`, homeId: `h-${id}`, ties: [], template: 'craft', day: 0,
  plan: [{ from: 0, to: 24, act: 'work', place: 'out', at: { x: at[0], y: at[1], z: null } }], home: { x: at[0], y: at[1], z: null }, at: null, facing: 's',
  look: { kind: 'human', skin: '#d8b090', hair: '#5a3a20', hairStyle: 'short', beard: 'none', cloth: ['#7a6a50', '#6a5a46', '#4e5a3e'] },
});
function bubble(list: PlacedPerson[]) {
  const pop = new Population(() => Promise.resolve({ people: [], radius: 0 }), 'seed');
  view.px = 400;
  pop.take(list.map((p) => ({ ...p, at: p.plan[0].at })), view);
  view.px = 10;
  pop.run(view);
  return { pop, byId: (id: string) => [...pop.everyone()].find((r) => r.p.id === id)! };
}

console.log('stepping aside');
{
  const { pop, byId } = bubble([person('Ana', [11, 10])]);
  const ana = byId('Ana');
  const said = pop.bumped(view, ana);
  const moved = ana.x !== 11 || ana.y !== 10;
  ok(/steps aside/.test(said) && moved, `walked into, she steps aside (${said})`);
  for (let i = 0; i < 6; i++) {
    view.time += 2;
    pop.run(view);
  }
  ok(ana.x !== 11 || ana.y !== 10, 'and keeps out of the way, rather than walking straight back to her place');
  view.px = 40;
  for (let i = 0; i < 40; i++) {
    view.time += 2;
    pop.run(view);
  }
  ok(ana.x === 11 && ana.y === 10, 'once the wanderer has gone on, she goes back to her place');
  view.px = 10;
}

console.log('\nsqueezing past');
{
  // A dead end one tile wide: nowhere to step aside.
  for (let x = 8; x <= 14; x++) {
    map.setObjectAt(x, 9, null, O('wall_stone')!);
    map.setObjectAt(x, 11, null, O('wall_stone')!);
  }
  map.setObjectAt(12, 10, null, O('wall_stone')!);
  const { pop, byId } = bubble([person('Bo', [11, 10])]);
  const bo = byId('Bo');
  view.px = 10;
  view.py = 10;
  const said = pop.bumped(view, bo);
  ok(/squeeze past Bo/.test(said) && bo.x === 10 && bo.y === 10 && !pop.at(11, 10, null), `in a narrow way, the wanderer squeezes past (${said})`);
  map.setObjectAt(12, 10, null, 0);
  for (let x = 8; x <= 14; x++) {
    map.setObjectAt(x, 9, null, 0);
    map.setObjectAt(x, 11, null, 0);
  }
}

console.log('\nplaces that keep the ways clear');
{
  // A hall 6 by 4 with a door on the south wall at (3, 4), and a passage one tile wide to the east.
  const spots: PlanBuilding['spots'] = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) spots.push({ x, y, z: null, obj: '', room: 'hall' });
  for (let x = 6; x < 10; x++) spots.push({ x, y: 1, z: null, obj: '', room: 'passage' });
  const b = { bid: 'hall', spots, doors: [[3, 4]], x0: 0, y0: 0, w: 10, h: 5 } as unknown as PlanBuilding;
  const ways = roomy(b);
  ok(!ways.has('3,3,g') && !ways.has('2,3,g') && !ways.has('4,3,g'), 'nobody is placed beside the door');
  ok(!ways.has('7,1,g') && !ways.has('8,1,g'), 'nor in a passage one tile wide');
  ok(ways.has('0,0,g') && ways.has('2,1,g'), 'corners and the middle of the room are fine');
  ok(roomFor(b) < ways.size && roomFor(b) >= 2, `the hall holds ${roomFor(b)} at once, of ${ways.size} places`);
}

console.log('\non a real world');
{
  const w = generateWorld({ seed: 'forge', landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 512 } as never, () => {});
  const town = w.settlements.filter((s) => s.tier === 'city').sort((a, b) => b.population - a.population)[0];
  const local = new LocalWorld(w, town);
  const [x, y] = local.startTile();
  const r = bubbleAt(local, x, y);
  // Midday on a rest day and an evening: the temples and taverns are full.
  for (const t of [86400 * 6 + 10 * 3600, 86400 * 2 + 20 * 3600]) {
    const people = peopleIn(w, local, x, y, r, t);
    const buildings = local.buildingsIn(x - r - 48, y - r - 48, x + r + 48, y + r + 48);
    let blocking = 0, over = 0, homeOdd = 0;
    const count = new Map<string, number>();
    for (const p of people) {
      if (!p.at) continue;
      const b = buildings.find((bb) => bb.spots.some((s) => s.x === p.at!.x && s.y === p.at!.y && s.z === p.at!.z));
      if (!b) continue;
      count.set(b.bid, (count.get(b.bid) ?? 0) + 1);
      const ways = roomy(b);
      // In public buildings (a tavern, a temple, a workplace), never; at home, only where a home has no clear place at all (B1).
      const place = p.plan.find((st) => st.at && st.at.x === p.at!.x && st.at.y === p.at!.y && st.at.z === p.at!.z)?.place;
      const athome = place === 'home' || place === 'bed' || place === 'table';
      if (ways.size && !ways.has(`${p.at.x},${p.at.y},${p.at.z ?? 'g'}`) && !athome) blocking++;
      if (athome && ways.size && !ways.has(`${p.at.x},${p.at.y},${p.at.z ?? 'g'}`)) homeOdd++;
    }
    for (const [bid, n] of count) {
      const b = buildings.find((bb) => bb.bid === bid)!;
      if (n > roomFor(b)) over++;
    }
    ok(blocking === 0 && over === 0, `at ${Math.round((t % 86400) / 3600)}:00, ${people.filter((p) => p.at).length} placed, none in a public building beside a door or in a passage (${blocking}), no building over its room (${over}); ${homeOdd} at home in a cramped house`);
  }
}

console.log(failures ? `\n${failures} failed` : '\nall crowd tests passed');
process.exit(failures ? 1 : 0);
