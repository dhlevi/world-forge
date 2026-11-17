/**
 * Placed residents (docs/design/npcs.md, Stage 1 step 2): the people of a city's and a town's
 * plans about a tile, placed by their first day plan (core people/routine.ts, worker/people.ts);
 * their belongings (world/belongings.ts) and figures; and the bubble's rule that nobody is seen to
 * move, come or go (world/population.ts).
 * npx tsx apps/game/scripts/people-test.ts (exits non-zero on a failure).
 */
import { generateWorld } from '@worldforge/core/gen/world';
import { CHUNK, LocalWorld } from '@worldforge/core/local/chunk';
import { GROUND_TILES, OBJECT_TILES } from '@worldforge/core/local/tiles';
import { WEAR_SHAPE } from '@worldforge/core/local/figures';
import { dayPlan, whereabouts, workOf } from '@worldforge/core/people/routine';
import { bubbleAt, forgetPeople, peopleIn } from '../src/worker/people';
import { belongingsOf } from '../src/world/belongings';
import { Population } from '../src/world/population';
import { defOf } from '../src/actors/items/item';
import { ITEM } from '../src/actors/items/defs';
import type { PlacedPerson } from '../src/worker/protocol';
import '../src/actors/cast';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

const seed = process.argv[2] ?? 'forge';
const w = generateWorld({ seed, landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 512 } as never, () => {});
const H = 3600, DAY = 86400;

for (const tier of ['city', 'town'] as const) {
  const s = w.settlements.filter((x) => x.tier === tier).sort((a, b) => b.population - a.population)[0];
  if (!s) continue;
  const local = new LocalWorld(w, s);
  const [x, y] = local.startTile();
  const r = bubbleAt(local, x, y);
  console.log(`\n${tier} ${s.name}: bubble ${r} tiles`);
  ok(r === (tier === 'city' ? 64 : 96), `the bubble is smaller in a ${tier}`);
  const t0 = performance.now();
  const night = peopleIn(w, local, x, y, r, DAY + 3 * H);
  const t1 = performance.now();
  const day = peopleIn(w, local, x, y, r, DAY + 10.5 * H);
  const evening = peopleIn(w, local, x, y, r, DAY + 20 * H);
  const t2 = performance.now();
  console.log(`  ${night.length} at 03:00 (${(t1 - t0).toFixed(0)} ms, the first), ${day.length} at 10:30, ${evening.length} at 20:00 (${((t2 - t1) / 2).toFixed(0)} ms each after)`);
  ok(night.length > 50, 'the bubble holds the residents of its buildings');

  // The same world, place and time give the same people in the same places, with or without what was kept.
  const again = JSON.stringify(peopleIn(w, local, x, y, r, DAY + 10.5 * H));
  forgetPeople();
  const fresh = JSON.stringify(peopleIn(w, local, x, y, r, DAY + 10.5 * H));
  ok(again === JSON.stringify(day) && fresh === again, 'placing is the same every time');

  const count = (ps: PlacedPerson[], where: string) => ps.filter((p) => p.where === where).length;
  ok(count(night, 'asleep') === night.length, 'at 03:00 everyone placed is asleep');
  const BEDS = new Set(['bed', 'straw', 'bedroll']);
  const inBed = night.filter((p) => {
    const c = local.chunk(Math.floor(p.x / CHUNK), Math.floor(p.y / CHUNK));
    const k = (p.y - c.cy * CHUNK) * CHUNK + (p.x - c.cx * CHUNK);
    const L = p.z === null ? c : c.layers.find((l) => l.z === p.z);
    return !!L && BEDS.has(OBJECT_TILES[L.object[k]]?.name ?? '');
  }).length;
  ok(inBed > night.length * 0.3, `many sleepers are in a bed (${inBed} of ${night.length}; the rest on the floor of a full house)`);
  ok(count(day, 'work') + count(day, 'out') > day.length * 0.2, `by day many are at work (${count(day, 'work')} indoors, ${count(day, 'out')} out of doors, ${count(day, 'home')} at home)`);
  ok(count(evening, 'home') > evening.length * 0.5, `in the evening most are at home (${count(evening, 'home')} of ${evening.length})`);

  for (const [name, ps] of [['03:00', night], ['10:30', day], ['20:00', evening]] as const) {
    const tiles = new Set(ps.map((p) => `${p.x},${p.y},${p.z}`));
    ok(tiles.size === ps.length, `${name}: no two people on one tile`);
    ok(ps.every((p) => Math.abs(p.x - x) <= r && Math.abs(p.y - y) <= r), `${name}: everyone placed is within the bubble`);
    // Each stands where one can stand: on the ground floor's or the ground's tiles (chunks), or a floor above or below.
    const bad = ps.filter((p) => {
      const c = local.chunk(Math.floor(p.x / CHUNK), Math.floor(p.y / CHUNK));
      const k = (p.y - c.cy * CHUNK) * CHUNK + (p.x - c.cx * CHUNK);
      const L = p.z === null ? c : c.layers.find((l) => l.z === p.z);
      if (!L) return true;
      const g = GROUND_TILES[L.ground[k]], o = OBJECT_TILES[L.object[k]];
      return !g || !g.pass || !!g.water || (L.object[k] !== 0 && !o.pass);
    });
    ok(bad.length <= Math.max(1, ps.length * 0.01), `${name}: everyone stands on open floor or ground (${bad.length} not)`);
    if (bad.length) console.log('   ', bad.slice(0, 3).map((p) => `${p.name} at ${p.x},${p.y},${p.z}`).join('; '));
  }
  ok(day.some((p) => p.z !== null) || night.some((p) => p.z !== null), 'some are placed on the floors above or below');

  // Every person of every building in the bubble has a plan: a work, waking before sleeping, the work within the day.
  let planned = 0, badPlan = 0;
  for (const p of day) {
    const hh = { name: p.household, means: p.means, members: [p as never] };
    const wk = workOf(p as never, hh as never, 'home');
    const pl = dayPlan(seed, p.id, 1, p as never, wk);
    planned++;
    if (!(pl.wake < pl.sleep && pl.sleep < 24 && (!pl.work || (pl.work[0] >= pl.wake && pl.work[1] <= pl.sleep)))) badPlan++;
    for (const h of [0, 6, 12, 18, 23.9]) if (!['asleep', 'home', 'work', 'out', 'away'].includes(whereabouts(pl, wk, h))) badPlan++;
  }
  ok(planned > 0 && badPlan === 0, `every day plan is whole (${planned} looked at)`);

  // Belongings: dressed, shod (most), a purse and a knife and a key for the grown, all from the item list.
  let badKit = 0, keys = 0, grown = 0;
  for (const p of day) {
    const inv = belongingsOf(p, seed);
    const worn = inv.worn().map((i) => defOf(i));
    if (!inv.d.items.every((i) => ITEM.has(i.def))) badKit++;
    if (!worn.some((d) => d.figure && WEAR_SHAPE.get(d.figure)?.slot === 'body')) badKit++;
    if (p.age >= 12) {
      grown++;
      if (inv.d.items.some((i) => i.def === 'key')) keys++;
      if (!inv.d.items.some((i) => i.def === 'knife')) badKit++;
    }
  }
  ok(badKit === 0, 'everyone is dressed, and the grown carry a knife');
  ok(keys === grown, `the grown carry a key to their home (${keys} of ${grown})`);
  const rich = day.filter((p) => p.means === 'rich'), poor = day.filter((p) => p.means === 'poor' || p.means === 'destitute');
  if (rich.length && poor.length) {
    const avg = (ps: PlacedPerson[]) => ps.reduce((a, p) => a + belongingsOf(p, seed).d.copper, 0) / ps.length;
    ok(avg(rich) > avg(poor), `the rich carry more coin than the poor (${avg(rich).toFixed(0)} against ${avg(poor).toFixed(0)} copper)`);
  }
}

// ---- The bubble: nobody is seen to move, come or go -----------------------------------------------
{
  const person = (id: string, x: number, where: PlacedPerson['where'] = 'home'): PlacedPerson => ({
    id, name: `P ${id}`, given: 'P', female: false, age: 30, culture: 0, people: 'the folk', trade: 'cooper', role: 'head', traits: [], means: 'middling',
    household: 'the household of P', homeId: 'b', x, y: 0, z: null, where, facing: 's',
    look: { kind: 'human', skin: '#d8b090', hair: '#5a3a20', hairStyle: 'short', beard: 'none', cloth: ['#7a6a50', '#6a5a46', '#4e5a3e'] },
  });
  let reply: PlacedPerson[] = [person('a', 1), person('b', 5)];
  const pop = new Population(() => Promise.resolve({ people: reply, radius: 64 }), seed);
  const seen = new Set<number>([1, 2, 3]);
  const view = { px: 0, py: 0, z: null as number | null, time: 0, isVisible: (x: number) => seen.has(x) };
  const settle = () => new Promise((res) => setTimeout(res, 0));
  console.log('\nthe bubble');
  pop.update(view);
  await settle();
  ok(!pop.at(1, 0, null), 'one placed in sight does not appear there');
  ok(!!pop.at(5, 0, null), 'one placed out of sight is there');
  seen.delete(1);
  pop.update(view);
  ok(!!pop.at(1, 0, null), '... and appears once that tile is out of sight');
  seen.add(1);
  reply = [person('a', 8), person('c', 2, 'out')];
  view.time = 3600;
  pop.update(view);
  await settle();
  ok(!!pop.at(1, 0, null) && !pop.at(8, 0, null), 'one in sight who should be elsewhere stays put');
  ok(!pop.at(5, 0, null) && !pop.at(2, 0, null), 'one gone out of sight is gone; one to come in sight waits');
  seen.clear();
  pop.update(view);
  ok(!!pop.at(8, 0, null) && !pop.at(1, 0, null) && !!pop.at(2, 0, null), 'out of sight, all is put right');
  ok(pop.at(2, 0, null)!.figure.wear.length > pop.at(8, 0, null)!.figure.wear.length, 'out of doors in a cloak, at home without');
  ok(pop.at(8, 0, null)!.actor.get !== undefined && [...pop.all()].length === 2, 'each is an actor, and only those placed are kept');
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
