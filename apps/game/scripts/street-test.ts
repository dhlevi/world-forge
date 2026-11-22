/**
 * The people of the streets (docs/backlog.md, N3 and N4; worker/streets.ts, world/strife.ts): on a
 * real world, a city's streets have passers-by, beggars and cutpurses by day, by the town's figures,
 * and the passers-by are gone by night; brigands come out after dark only where the town is
 * lawless; the same place and time give the same people. In play, a cutpurse beside the wanderer
 * in a crowd tries for the purse, but not when the wanderer is alone; brigands strike at one alone,
 * but not under the eyes of the watch.
 * npx tsx apps/game/scripts/street-test.ts (exits non-zero on a failure).
 */
import { CHUNK, LocalWorld } from '@worldforge/core/local/chunk';
import { G } from '@worldforge/core/local/tiles';
import { generateWorld } from '@worldforge/core/gen/world';
import { townContext } from '@worldforge/core/people/town-context';
import { streetFolkIn } from '../src/worker/streets';
import { GameMap } from '../src/game/map';
import { Population, type PopulationView } from '../src/world/population';
import { Strife } from '../src/world/strife';
import type { ChunkData, PlacedPerson } from '../src/worker/protocol';
import '../src/actors/cast';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

console.log('on a real world');
{
  const w = generateWorld({ seed: 'forge', landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 512 } as never, () => {});
  const cities = w.settlements.filter((s) => s.tier === 'city' && !s.delve);
  const stats = (id: string) => townContext(w, id).stats;
  const city = cities.sort((a, b) => b.population - a.population)[0];
  const local = new LocalWorld(w, city);
  const [x, y] = local.startTile();
  const day = 86400 * 3 + 10 * 3600, night = 86400 * 3 + 22 * 3600;
  const folk = streetFolkIn(w, local, x, y, 64, day);
  const by = (t: string) => folk.filter((p) => p.trade === t || (t === 'beggar' && p.trade === 'vagrant')).length;
  ok(by('townsfolk') >= 10 && folk.filter((p) => p.trade === 'townsfolk' && p.at).length >= 5, `by day, passers-by about ${city.name}'s streets (${by('townsfolk')})`);
  ok(by('beggar') >= 1, `and beggars (${by('beggar')}; prosperity ${stats(city.id).prosperity.value})`);
  ok(JSON.stringify(streetFolkIn(w, local, x, y, 64, day)) === JSON.stringify(folk), 'the same place and time give the same people');
  const late = streetFolkIn(w, local, x, y, 64, night);
  ok(late.filter((p) => p.trade === 'townsfolk' && p.at).length === 0 && late.filter((p) => p.trade.startsWith('beggar') || p.trade === 'vagrant').every((p) => p.plan.find((s) => s.from <= 22 && s.to > 22)?.act === 'sleep'), 'by night the passers-by are home, and the beggars sleep rough');
  const lawless = cities.find((c) => stats(c.id).crime.value >= 50), lawful = cities.find((c) => stats(c.id).crime.value < 40);
  if (lawless) {
    const ll = new LocalWorld(w, lawless);
    const [lx, ly] = ll.startTile();
    ok(streetFolkIn(w, ll, lx, ly, 64, night).some((p) => p.trade === 'brigand'), `brigands out after dark in lawless ${lawless.name} (crime ${stats(lawless.id).crime.value})`);
  }
  if (lawful) {
    const lw = new LocalWorld(w, lawful);
    const [wx, wy] = lw.startTile();
    ok(!streetFolkIn(w, lw, wx, wy, 64, night).some((p) => p.trade === 'brigand'), `none in law-abiding ${lawful.name} (crime ${stats(lawful.id).crime.value})`);
  }
}

console.log('\nin play');
{
  const N = CHUNK * CHUNK;
  const map = new GameMap(() => {});
  for (let cy = -1; cy <= 1; cy++) for (let cx = -1; cx <= 1; cx++) {
    map.add({ cx, cy, ground: new Uint8Array(N).fill(G('cobbles')), object: new Uint8Array(N), area: new Uint16Array(N), areas: [''], elev: new Int16Array(N).fill(30), sites: [], roofs: [], layers: [], ms: 0 } as ChunkData);
  }
  const view: PopulationView & { time: number; px: number; py: number } = { px: 10, py: 10, z: null, time: 86400 + 12 * 3600, map, isVisible: (a, b) => Math.hypot(a - view.px, b - view.py) <= 30 };
  const person = (id: string, trade: string, template: string, at: [number, number], homeId = `h-${id}`): PlacedPerson => ({
    id, name: `${id} Holt`, given: id, female: false, age: 30, culture: 0, people: 'the folk', trade, role: 'head', traits: [], means: 'poor',
    household: '', homeId, ties: [], template, day: 1, plan: [{ from: 0, to: 24, act: 'work', place: 'out', at: { x: at[0], y: at[1], z: null } }], home: { x: at[0], y: at[1], z: null }, at: null, facing: 's',
    look: { kind: 'human', skin: '#d8b090', hair: '#5a3a20', hairStyle: 'short', beard: 'none', cloth: ['#7a6a50', '#6a5a46', '#4e5a3e'] },
  });
  const bubble = (list: PlacedPerson[]) => {
    const pop = new Population(() => Promise.resolve({ people: [], radius: 0 }), 'seed');
    view.px = 400;
    pop.take(list.map((p) => ({ ...p, at: p.plan[0].at })), view);
    view.px = 10;
    return { pop, strife: new Strife(pop) };
  };
  const tries = (list: PlacedPerson[]) => {
    const { strife } = bubble(list);
    let n = 0;
    strife.onPickpocket = () => n++;
    for (let i = 0; i < 60; i++) {
      view.time += 60;
      strife.run(view, { helpless: false, yielded: false });
    }
    return n;
  };
  const crowd = [person('A', 'townsfolk', 'idle', [12, 10]), person('B', 'townsfolk', 'idle', [10, 12]), person('C', 'townsfolk', 'idle', [8, 9])];
  ok(tries([person('Cut', 'cutpurse', 'thief', [11, 10]), ...crowd]) >= 1, 'a cutpurse beside the wanderer in a crowd tries for the purse');
  ok(tries([person('Cut', 'cutpurse', 'thief', [11, 10])]) === 0, 'but not when the wanderer stands alone');
  const robbing = (list: PlacedPerson[]) => {
    const { pop, strife } = bubble(list);
    strife.run(view, { helpless: false, yielded: false });
    return [...pop.everyone()].some((r) => r.fight?.intent === 'rob');
  };
  const gang = [person('Br1', 'brigand', 'bandit', [16, 10], 'brigands:t:1'), person('Br2', 'brigand', 'bandit', [16, 12], 'brigands:t:1')];
  ok(robbing(gang), 'brigands come at one alone in the street');
  ok(!robbing([...gang, person('Gar', 'guard', 'guard', [6, 10])]), 'but not with the watch in sight');
}

console.log(failures ? `\n${failures} failed` : '\nall street tests passed');
process.exit(failures ? 1 : 0);
