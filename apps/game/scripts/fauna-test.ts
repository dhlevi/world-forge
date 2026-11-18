/**
 * The animals (Stage 2; core local/fauna.ts, worker/fauna.ts, world/fauna.ts, world/hunting.ts):
 * on a made-up meadow by a pond with a copse, herds keep together and drink, take fright at the
 * wanderer (less when sneaking, and by scent downwind), a flock rises and lands; a fox hunts hens;
 * a boar bluffs; snares catch small game, and a carcass is butchered; animal tracks are read; and on
 * a real world, the worker's animals are the same every time, wild in the country and kept and in the
 * streets in settlements. And the cost of the animals' turn.
 * npx tsx apps/game/scripts/fauna-test.ts (exits non-zero on a failure).
 */
import { CHUNK, LocalWorld } from '@worldforge/core/local/chunk';
import { G, O } from '@worldforge/core/local/tiles';
import { SPECIES, SPECIES_BY_ID, awake, wildSpecies } from '@worldforge/core/local/fauna';
import { generateWorld } from '@worldforge/core/gen/world';
import { GameMap } from '../src/game/map';
import { Fauna, animalLines, type FaunaView, type Presence } from '../src/world/fauna';
import { Tracks, readTracks } from '../src/world/senses';
import { Snares, butcher, carcassOf } from '../src/world/hunting';
import { animalsIn } from '../src/worker/fauna';
import { bubbleAt } from '../src/worker/people';
import { Actor } from '../src/actors/actor';
import { Skills } from '../src/actors/components';
import { Inventory } from '../src/actors/items/inventory';
import { makeItem } from '../src/actors/items/item';
import { ITEM } from '../src/actors/items/defs';
import type { AnimalGroup, ChunkData } from '../src/worker/protocol';
import '../src/actors/cast';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

// ---- The species --------------------------------------------------------------------------------------
console.log('species');
ok(SPECIES.every((s) => s.group[0] >= 1 && s.group[1] >= s.group[0] && s.step > 0 && s.flee >= 1), 'every species is whole');
ok(SPECIES.every((s) => s.yields.every(([id]) => ITEM.has(id))), 'every yield is an item');
const forest = { hab: { forest: 1, temperate: 1 }, key: 'k', newWorld: false, main: ['forest', 'temperate'] } as never;
const withDeer = wildSpecies(forest, (n) => n === 'red deer', false).map((x) => x.s.id), without = wildSpecies(forest, () => false, false).map((x) => x.s.id);
ok(withDeer.includes('red_deer') && !without.includes('red_deer') && without.includes('fox') && without.includes('hare'), 'the bestiary\'s beasts only where the bestiary has them; the everyday ones where their country is');
ok(!wildSpecies(forest, () => true, false).some((x) => x.s.home !== 'wild'), 'no kept or street animals in the wild');
const fox = SPECIES_BY_ID.get('fox')!, deer = SPECIES_BY_ID.get('roe_deer')!;
ok(!awake(fox, 12, 6, 18) && awake(fox, 23, 6, 18) && awake(deer, 18.5, 6, 18) && awake(SPECIES_BY_ID.get('crow')!, 12, 6, 18), 'about by their hours: the fox by night, the deer at dusk, the crow by day');

// ---- A meadow: grass, a pond (x 40..46, y 10..16), a copse of trees (x 10..14, y 40..44) ------------
const N = CHUNK * CHUNK, at = (x: number, y: number) => y * CHUNK + x;
const map = new GameMap(() => {});
for (let cy = -1; cy <= 2; cy++) for (let cx = -1; cx <= 2; cx++) {
  const ground = new Uint8Array(N).fill(G('grass')), object = new Uint8Array(N), area = new Uint16Array(N);
  if (cx === 0 && cy === 0) {
    for (let y = 10; y <= 16; y++) for (let x = 40; x <= 46; x++) ground[at(x, y)] = G('water_shallow');
    for (let y = 40; y <= 44; y++) for (let x = 10; x <= 14; x++) if ((x + y) % 2 === 0) object[at(x, y)] = O('tree_broadleaf')!;
    for (let x = 0; x < 30; x++) ground[at(x, 30)] = G('mud');
  }
  map.add({ cx, cy, ground, object, area, areas: [''], elev: new Int16Array(N).fill(30), sites: [], roofs: [], layers: [], ms: 0 } as ChunkData);
}
let seenAll = false;
const view: FaunaView & { px: number; py: number; time: number } = { px: 0, py: 0, z: null, time: 86400 + 10 * 3600, map, isVisible: (x, y) => seenAll || Math.hypot(x - view.px, y - view.py) <= 12 };
const who: Presence = { sneaking: false, sneak: 0, light: 1, wind: { x: 1, y: 0, strength: 0 }, winter: false, rise: 6, set: 18 };
const grp = (id: string, species: string, members: [number, number][], home: [number, number, number], water: [number, number] | null = null): AnimalGroup => ({
  id, species, members: members.map(([x, y]) => ({ x, y, z: null })), home: { x: home[0], y: home[1], r: home[2] }, water: water ? { x: water[0], y: water[1], z: null } : null,
});
const fresh = () => new Fauna(() => Promise.resolve({ groups: [], radius: 64 }), new Tracks());
const runFor = (f: Fauna, secs: number, step = 1.2) => {
  for (const end = view.time + secs; view.time < end; view.time += step) f.run(view, who);
};

{
  console.log('\nherds');
  const f = fresh();
  view.px = -10;
  view.py = -10;
  view.time = 86400 + 16 * 3600;
  f.take([grp('h1', 'red_deer', [[20, 20], [21, 20], [20, 21], [22, 22], [19, 22]], [22, 22, 14], [43, 13])], view);
  runFor(f, 20 * 60);
  const ds = [...f.all()];
  const lead = ds[0];
  ok(ds.length === 5 && ds.every((d) => Math.max(Math.abs(d.x - lead.x), Math.abs(d.y - lead.y)) <= 8), `a herd keeps together as it grazes (${ds.map((d) => `${d.x},${d.y}`).join(' ')})`);
  ok(ds.every((d) => Math.hypot(d.x - 22, d.y - 22) <= 14 + 8), 'within its home range');
  // At dusk they go down to water.
  view.time = 86400 + 17.5 * 3600;
  runFor(f, 10 * 60);
  ok(Math.hypot(lead.x - 43, lead.y - 13) <= 6, `at dusk, the leader goes down to the water (at ${lead.x},${lead.y})`);
  // Fright: the wanderer walks up in the open (at dusk, when deer are about).
  view.time = 86400 + 18.2 * 3600;
  const f2 = fresh();
  f2.take([grp('h2', 'red_deer', [[30, 30], [31, 30], [30, 31]], [30, 30, 10])], view);
  view.px = 30;
  view.py = 42;
  const told: string[] = [];
  f2.onSee = (t) => told.push(t);
  for (let i = 0; i < 6; i++) {
    view.py--;
    view.time += 1.2;
    f2.run(view, who);
  }
  runFor(f2, 20);
  const ys = [...f2.all()].map((d) => d.y);
  ok(told.some((t) => /red deer bolt/.test(t)) && ys.every((y) => y < 30 - 5), `walking up from the south, the herd bolts north together (${told.join(' | ')}; now at y ${ys.join(', ')})`);
  // Sneaking, the wanderer gets nearer before they notice.
  const closest = (sneak: boolean) => {
    const f3 = fresh();
    view.time = 86400 + 18.2 * 3600;
    view.px = 30;
    view.py = 52;
    f3.take([grp('h3', 'roe_deer', [[30, 30]], [30, 30, 2])], view);
    who.sneaking = sneak;
    who.sneak = sneak ? 40 : 0;
    let d = Infinity;
    for (let i = 0; i < 25; i++) {
      view.py--;
      view.time += 2;
      f3.run(view, who);
      const a = [...f3.all()][0];
      if (a.noticed > 0) {
        d = Math.hypot(a.x - view.px, a.y - view.py);
        break;
      }
    }
    who.sneaking = false;
    return d;
  };
  const loud = closest(false), quiet = closest(true);
  ok(quiet < loud, `sneaking, the wanderer gets nearer before a deer notices (${quiet.toFixed(0)} tiles against ${loud.toFixed(0)})`);
  // Scent on the wind: downwind of the wanderer, beyond sight, a deer smells them.
  const f4 = fresh();
  view.px = 30;
  view.py = 30;
  f4.take([grp('h4', 'roe_deer', [[45, 30]], [45, 30, 2])], view);
  const a4 = [...f4.all()][0];
  a4.s = { ...a4.s, sight: 4 };
  who.wind = { x: 1, y: 0, strength: 6 };
  f4.run(view, who);
  const smelt = a4.noticed > 0;
  const f5 = fresh();
  f5.take([grp('h5', 'roe_deer', [[15, 30]], [15, 30, 2])], view);
  const a5 = [...f5.all()][0];
  a5.s = { ...a5.s, sight: 4 };
  f5.run(view, who);
  ok(smelt && a5.noticed < 0, 'the wind carries the wanderer\'s scent downwind, not up');
  who.wind = { x: 1, y: 0, strength: 0 };
}

{
  console.log('\nbirds');
  const f = fresh();
  view.px = 60;
  view.py = 60;
  view.time = 86400 + 10 * 3600;
  f.take([grp('b1', 'crow', [[20, 50], [21, 50], [22, 51], [20, 52]], [14, 42, 16])], view);
  view.px = 20;
  view.py = 56;
  f.run(view, who);
  f.hearPlayer(view, { x: 20, y: 54, z: null, loud: 60, kind: 'shout', what: 'a shout' }, who);
  runFor(f, 3);
  const up = [...f.all()].filter((b) => b.alt > 0).length;
  ok(up === 4, `startled, the whole flock rises (${up} of 4 aloft)`);
  runFor(f, 120);
  const down = [...f.all()].filter((b) => b.alt === 0 || b.perched);
  ok(down.length >= 2 && down.every((b) => Math.hypot(b.x - 20, b.y - 54) > 10), `and comes down again farther off (${[...f.all()].map((b) => `${b.x},${b.y}${b.perched ? ' perched' : ''}`).join(' ')})`);
}

{
  console.log('\nhunters and bluffs');
  const f = fresh();
  const seen: string[] = [];
  f.onSee = (t) => seen.push(t);
  view.px = 60;
  view.py = 0;
  view.time = 86400 + 23 * 3600;
  f.take([grp('f1', 'fox', [[20, 20]], [20, 20, 12]), grp('k1', 'hen', [[26, 22], [27, 22], [26, 23]], [26, 22, 4])], view);
  seenAll = true;
  const fx = [...f.all()].find((a) => a.s.id === 'fox')!;
  fx.ate = view.time - 12 * 3600;
  for (const a of f.all()) if (a.s.id === 'hen') a.s = { ...a.s, active: 'any' };
  runFor(f, 15 * 60);
  const hens = [...f.all()].filter((a) => a.s.id === 'hen').length;
  ok(hens < 3 && seen.some((t) => /fox catches a hen/.test(t)), `a hungry fox takes a hen (${hens} left; ${seen.slice(-1)[0] ?? ''})`);
  ok(fx.state === 'eat' || view.time - fx.ate < 3600 * 2, 'and eats');
  // A boar bluffs, and backs off.
  const f2 = fresh();
  const said: string[] = [];
  f2.onSee = (t) => said.push(t);
  view.time = 86400 + 18.5 * 3600;
  view.px = 30;
  view.py = 36;
  seenAll = false;
  view.py = 50;
  f2.take([grp('b2', 'boar', [[30, 32]], [30, 32, 3])], view);
  view.py = 36;
  seenAll = true;
  f2.run(view, who);
  runFor(f2, 15);
  const boar = [...f2.all()][0];
  ok(said.some((t) => /boar snorts and charges, then wheels away/.test(t)), `a boar bluff-charges (${said.join(' | ')})`);
  ok(!(boar.x === view.px && boar.y === view.py) && Math.hypot(boar.x - view.px, boar.y - view.py) >= 2, 'and backs off, without harm (no combat yet)');
  seenAll = false;
}

{
  console.log('\nsnares, butchery, tracks');
  const f = fresh();
  view.px = 60;
  view.py = 60;
  view.time = 86400 + 19 * 3600;
  f.take([grp('s1', 'hare', [[20, 31]], [20, 31, 6])], view);
  const sn = new Snares();
  sn.set(20, 31, view.time);
  const hare = [...f.all()][0];
  hare.y = 31;
  const caught = sn.run(f, view, 30);
  ok(caught.length === 1 && caught[0].caught === 'hare' && f.size === 0, 'a hare on a snare is caught');
  // Out of sight, by the hour, a snare in a hare's range catches one in time.
  const f2 = fresh();
  f2.take([grp('s2', 'rabbit', [[22, 22], [23, 22], [22, 23]], [22, 22, 8])], view);
  const sn2 = new Snares();
  sn2.set(24, 24, view.time);
  let got = false;
  for (let h = 0; h < 72 && !got; h++) {
    view.time += 3600;
    got = sn2.run(f2, view, 30).length > 0;
  }
  ok(got, 'out of sight, a snare among rabbits catches one within three days');
  const a = new Actor('person');
  a.add(new Skills(Skills.empty()));
  const inv = a.add(new Inventory({ copper: 0, items: [], animals: [] }));
  const meat = butcher(a, inv, carcassOf(SPECIES_BY_ID.get('hare')!), view.time);
  ok(meat === null, 'no butchering without a blade');
  inv.put(makeItem('knife'), { at: 'hand', hand: 'right' });
  const res = butcher(a, inv, carcassOf(SPECIES_BY_ID.get('roe_deer')!), view.time)!;
  ok(!!res && res.items.some((i) => i.def === 'raw_meat' && i.qty >= 2) && res.seconds > 0, `a roe deer butchered gives meat (${res.text} ${res.items.map((i) => `${i.qty} ${i.def}`).join(', ')})`);
  // Tracks: a herd crossing the mud.
  const f3 = fresh();
  view.px = 10;
  view.py = 50;
  view.time = 86400 * 6 + 18.2 * 3600;
  f3.take([grp('t1', 'roe_deer', [[5, 33]], [5, 33, 1])], view);
  const d = [...f3.all()][0];
  d.g.home = { x: 25, y: 27, r: 1 };
  d.to = { x: 25, y: 27, z: null };
  d.state = 'walk';
  d.g.planAt = view.time + 9999;
  runFor(f3, 60);
  let text = '';
  for (let x = 0; x < 30 && !text; x++) text = readTracks(f3.tracks.at(x, 30, null, view.time), view.time, 50) ?? '';
  ok(/Tracks/.test(text) && /roe deer/.test(text), `a deer's tracks in the mud, read by a tracker ("${text}")`);
}

{
  console.log('\nthe cost of the animals\' turn');
  const f = fresh();
  view.px = 32;
  view.py = 32;
  view.time = 86400 + 10 * 3600;
  const groups: AnimalGroup[] = [];
  for (let i = 0; i < 40; i++) groups.push(grp(`p${i}`, i % 3 ? 'sparrow' : 'rabbit', Array.from({ length: 8 }, (_, k) => [2 + (i % 8) * 8 + (k % 3), 2 + Math.floor(i / 8) * 12 + Math.floor(k / 3)] as [number, number]), [2 + (i % 8) * 8, 2 + Math.floor(i / 8) * 12, 10]));
  f.take(groups, view);
  let worst = 0, total = 0, n = 0;
  for (let k = 0; k < 300; k++) {
    view.time += 1.2;
    const t0 = performance.now();
    f.run(view, who);
    const dt = performance.now() - t0;
    worst = Math.max(worst, dt);
    total += dt;
    n++;
  }
  console.log(`    ${f.size} animals: ${(total / n).toFixed(2)} ms a step, ${worst.toFixed(1)} ms at worst`);
  ok(total / n < 3, 'some 300 animals within 3 ms a step');
}

// ---- On a real world: the worker's animals ------------------------------------------------------------
{
  console.log('\nthe worker');
  const w = generateWorld({ seed: 'forge', landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 512 } as never, () => {});
  const town = w.settlements.filter((s) => s.tier === 'town').sort((a, b) => b.population - a.population)[0];
  const local = new LocalWorld(w, town);
  const [x, y] = local.startTile();
  const r = bubbleAt(local, x, y);
  const T = 86400 * 3 + 10 * 3600;
  const a = animalsIn(w, local, x, y, r, T, false), b = animalsIn(w, local, x, y, r, T, false);
  ok(JSON.stringify(a) === JSON.stringify(b), 'the same animals every time');
  const kinds = new Set(a.map((g) => SPECIES_BY_ID.get(g.species)!.home));
  ok(kinds.has('street'), `a town has its street animals (${[...new Set(a.map((g) => g.species))].join(', ')})`);
  const wild = animalsIn(w, local, x + 1200, y + 300, 128, T, false);
  const wk = new Set(wild.map((g) => SPECIES_BY_ID.get(g.species)!.home));
  ok(wild.length > 5 && wk.has('wild'), `the open country has its wild animals (${wild.length} groups: ${[...new Set(wild.map((g) => g.species))].join(', ')})`);
  const nextWeek = animalsIn(w, local, x + 1200, y + 300, 128, T + 7 * 86400, false);
  ok(JSON.stringify(nextWeek.map((g) => g.id)) !== JSON.stringify(wild.map((g) => g.id)), 'the wild is renewed week by week');
  ok(a.every((g) => g.members.length >= 1) && wild.every((g) => g.members.every((m) => Math.abs(m.x - (x + 1200)) <= 140)), 'every group has its members, within the bubble');
  ok(animalLines([...(() => { const f = fresh(); f.take([wild[0]], view); return f.all(); })()][0] ?? ({ s: SPECIES_BY_ID.get('hare'), g: { members: [1] }, state: 'idle', alt: 0, perched: false, noticed: -1 } as never), 0).length >= 1, 'an animal can be looked at');
}

console.log(failures ? `\n${failures} failed` : '\nall fauna tests passed');
process.exit(failures ? 1 : 0);
