/**
 * Residents and their days (docs/design/npcs.md, Stage 1): the people of a city's and a town's
 * plans about a tile with their day plans and every place of them found on the map (core
 * people/routine.ts, worker/people.ts), their belongings (world/belongings.ts), and the day
 * plans of every kind of life, day of the week and season.
 * npx tsx apps/game/scripts/people-test.ts (exits non-zero on a failure).
 */
import { generateWorld } from '@worldforge/core/gen/world';
import { CHUNK, LocalWorld } from '@worldforge/core/local/chunk';
import { GROUND_TILES, OBJECT_TILES } from '@worldforge/core/local/tiles';
import { WEAR_SHAPE } from '@worldforge/core/local/figures';
import { dayBlocks, restDay, templateOf, workOf } from '@worldforge/core/people/routine';
import { bubbleAt, forgetPeople, peopleIn } from '../src/worker/people';
import { belongingsOf } from '../src/world/belongings';
import { Population } from '../src/world/population';
import { GameMap } from '../src/game/map';
import { defOf } from '../src/actors/items/item';
import { ITEM } from '../src/actors/items/defs';
import type { PlacedPerson, Spot } from '../src/worker/protocol';
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
  const night = peopleIn(w, local, x, y, r, DAY + 3 * H, 7, 17);
  const t1 = performance.now();
  const day = peopleIn(w, local, x, y, r, DAY + 10.5 * H, 7, 17);
  const evening = peopleIn(w, local, x, y, r, DAY + 20 * H, 7, 17);
  const t2 = performance.now();
  const here = (ps: PlacedPerson[]) => ps.filter((p) => p.at);
  console.log(`  ${night.length} residents (${(t1 - t0).toFixed(0)} ms the first time, ${((t2 - t1) / 2).toFixed(0)} ms after); about: ${here(night).length} at 03:00, ${here(day).length} at 10:30, ${here(evening).length} at 20:00`);
  ok(night.length > 50, 'the bubble holds the residents of its buildings');

  // The same world, place and time give the same people, plans and places, with or without what was kept.
  const again = JSON.stringify(peopleIn(w, local, x, y, r, DAY + 10.5 * H, 7, 17));
  forgetPeople();
  const fresh = JSON.stringify(peopleIn(w, local, x, y, r, DAY + 10.5 * H, 7, 17));
  ok(again === JSON.stringify(day) && fresh === again, 'placing is the same every time');

  // Plans: whole days, every block with a place found, on the same day for all.
  const whole = day.every((p) => p.plan.length > 0 && p.plan[0].from === 0 && p.plan[p.plan.length - 1].to === 24 && p.plan.every((k, i) => i === 0 || k.from === p.plan[i - 1].to));
  ok(whole, 'every plan covers the day from midnight to midnight, without gaps');
  const stops = day.flatMap((p) => p.plan);
  const unplaced = stops.filter((k) => !k.at);
  ok(unplaced.length < stops.length * 0.05, `nearly every block's place is found on the map (${unplaced.length} of ${stops.length} beyond the bubble: ${[...new Set(unplaced.map((k) => k.place))].join(', ') || 'none'})`);
  ok(day.every((p) => p.plan.some((k) => k.place === 'bed' && k.at)), 'everyone has a bed (or a place to sleep)');
  const kinds = new Set(day.map((p) => p.template));
  ok(['craft', 'child', 'elder', 'merchant'].every((t) => kinds.has(t)), `many kinds of day are kept (${[...kinds].join(', ')})`);

  const actAt = (p: PlacedPerson, h: number) => p.plan.find((k) => h >= k.from && h < k.to)!.act;
  const asleep = here(night).filter((p) => actAt(p, 3) === 'sleep').length;
  ok(asleep > here(night).length * 0.9, `at 03:00 nearly everyone is asleep (${asleep} of ${here(night).length}; the watch and the night trades about)`);
  const BEDS = new Set(['bed', 'straw', 'bedroll']);
  const objAt = (t: Spot) => {
    const c = local.chunk(Math.floor(t.x / CHUNK), Math.floor(t.y / CHUNK));
    const k = (t.y - c.cy * CHUNK) * CHUNK + (t.x - c.cx * CHUNK);
    const L = t.z === null ? c : c.layers.find((l) => l.z === t.z);
    return L ? { g: GROUND_TILES[L.ground[k]], o: OBJECT_TILES[L.object[k]], id: L.object[k] } : null;
  };
  const inBed = here(night).filter((p) => BEDS.has(objAt(p.at!)?.o?.name ?? '')).length;
  ok(inBed > here(night).length * 0.3, `many sleepers are in a bed (${inBed} of ${here(night).length}; the rest on the floor of a full house)`);
  const working = here(day).filter((p) => actAt(p, 10.5) === 'work').length;
  ok(working > here(day).length * 0.25, `by day many are at work (${working} of ${here(day).length})`);
  const atHome = here(evening).filter((p) => ['home', 'meal', 'sleep'].includes(actAt(p, 20))).length;
  ok(atHome > here(evening).length * 0.7, `in the evening most are at home (${atHome} of ${here(evening).length})`);
  // Errands and rounds: the marketing, the supplies of the trades, the carters' loads, the beggars at the market.
  const marketGoers = day.filter((p) => p.plan.some((k) => k.place === 'market' && k.at)).length;
  ok(marketGoers > day.length * 0.15, `many go to the market in a day (${marketGoers} of ${day.length})`);
  ok(day.some((p) => p.plan.some((k) => k.act === 'errand' && k.at)), 'errands are run');
  const carters = day.filter((p) => p.template === 'carter');
  if (carters.length) ok(carters.every((p) => new Set(p.plan.filter((k) => k.act === 'work').map((k) => k.place)).size >= 2), `carters and porters go round between places (${carters.length})`);
  const drinking = here(evening).filter((p) => actAt(p, 20) === 'leisure').length;
  ok(drinking > 0, `some are out of an evening (${drinking})`);

  for (const [name, ps] of [['03:00', night], ['10:30', day], ['20:00', evening]] as const) {
    const placed = here(ps);
    const tiles = new Set(placed.map((p) => `${p.at!.x},${p.at!.y},${p.at!.z}`));
    ok(tiles.size === placed.length, `${name}: no two people on one tile`);
    ok(placed.every((p) => Math.abs(p.at!.x - x) <= r + 48 && Math.abs(p.at!.y - y) <= r + 48), `${name}: everyone about is within the bubble's reach`);
    // Each stands where one can stand: on the ground floor's or the ground's tiles, or a floor above or below.
    const bad = placed.filter((p) => {
      const t = objAt(p.at!);
      return !t || !t.g || !t.g.pass || !!t.g.water || (t.id !== 0 && !t.o.pass);
    });
    ok(bad.length <= Math.max(1, placed.length * 0.01), `${name}: everyone stands on open floor or ground (${bad.length} not)`);
  }
  // Every place of every plan is a place one can stand.
  const badStops = stops.filter((k) => k.at && (() => {
    const t = objAt(k.at);
    return !t || !t.g || !t.g.pass || (t.id !== 0 && !t.o.pass);
  })());
  ok(badStops.length <= stops.length * 0.01, `every place in the plans can be stood on (${badStops.length} not)`);
  ok(day.some((p) => p.plan.some((k) => k.at && k.at.z !== null)), 'some places are on the floors above or below');

  // Belongings: dressed, a purse and a knife and a key for the grown, all from the item list.
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

// ---- Street life: a town's morning walked, with the wanderer in its middle -------------------------------
{
  const s = w.settlements.filter((x) => x.tier === 'town').sort((a, b) => b.population - a.population)[0];
  if (s) {
    console.log('\nstreet life');
    const local = new LocalWorld(w, s);
    const [x, y] = local.startTile();
    const r = bubbleAt(local, x, y);
    const map = new GameMap(() => {});
    const C = Math.ceil((r + 64) / CHUNK);
    for (let cy = Math.floor(y / CHUNK) - C; cy <= Math.floor(y / CHUNK) + C; cy++) for (let cx = Math.floor(x / CHUNK) - C; cx <= Math.floor(x / CHUNK) + C; cx++) map.add(local.chunk(cx, cy) as never);
    const view = { px: x, py: y, z: null as number | null, time: DAY + 9.5 * H, map, isVisible: (a: number, b: number) => Math.max(Math.abs(a - x), Math.abs(b - y)) <= 10 };
    const pop = new Population(() => Promise.resolve({ people: [], radius: r }), seed);
    pop.take(peopleIn(w, local, x, y, r, view.time, 7, 17), view);
    const outside = () => [...pop.all()].filter((p) => p.z === null && !GROUND_TILES[map.groundAt(p.x, p.y, null)]?.name.startsWith('floor_')).length;
    const before = outside();
    let worst = 0, total = 0, n = 0;
    for (; view.time < DAY + 10.5 * H; view.time += 1.2) {
      const t0 = performance.now();
      pop.run(view);
      const dt = performance.now() - t0;
      worst = Math.max(worst, dt);
      total += dt;
      n++;
    }
    const after = outside();
    const atMarket = [...pop.all()].filter((p) => p.stop?.place === 'market' && p.where !== 'walking').length;
    console.log(`  ${pop.size} people; out of doors ${before} at 09:30, ${after} at 10:30 (${atMarket} at the market); ${(total / n).toFixed(2)} ms a step, ${worst.toFixed(1)} ms at worst; ${pop.searched} paths, ${pop.failed} not found`);
    ok(after > pop.size * 0.1, 'a town\'s streets and market are busy of a morning');
    ok(atMarket > 20, 'the market draws a crowd');
    ok(total / n < 2, 'the queue keeps within its budget (under 2 ms a step on average)');
    ok(pop.failed < pop.searched * 0.1, 'nearly every path is found');
  }
}

// ---- Day plans: every trade, every kind of building, every day of the week ----------------------------
{
  console.log('\nday plans');
  const P = (trade: string, age: number, role: string, traits: string[] = []) => ({ name: 'X', given: 'X', female: false, age, culture: 0, people: '', trade, role, traits, ties: [] });
  const trades = ['carter', 'porter', 'cook', 'cooper', 'farmer', 'labourer', 'lawyer', 'soldier', 'priest', 'innkeeper', 'maid', 'child', 'retired', 'beggar', 'night-soil man', 'merchant', 'miner', 'hawker', 'smith', 'guildmaster'];
  const roles: Record<string, string> = { cook: 'cook', soldier: 'soldier', maid: 'maid', child: 'son', merchant: 'guest' };
  const kinds: Record<string, string> = { cook: 'mansion', soldier: 'barracks', priest: 'temple', innkeeper: 'inn', maid: 'mansion', merchant: 'inn', smith: 'trade', guildmaster: 'guild' };
  let bad = 0, n = 0;
  const seenKinds = new Set<string>();
  for (const t of trades) for (let d = 0; d < 7; d++) for (const [rise, set] of [[4.5, 21], [8.5, 16]]) {
    const p = P(t, t === 'child' ? 8 : t === 'retired' ? 70 : 35, roles[t] ?? 'head', d % 2 ? ['Diligent'] : ['Slothful', 'Gregarious']);
    const h = { name: '', means: 'middling', members: [p] };
    const kind = (kinds[t] ?? 'home') as never;
    const wk = workOf(p as never, h as never, kind);
    seenKinds.add(templateOf(p as never, wk, kind));
    const plan = dayBlocks(seed, `t#${t}`, d, p as never, wk, kind, { rise, set });
    const again = dayBlocks(seed, `t#${t}`, d, p as never, wk, kind, { rise, set });
    n++;
    if (JSON.stringify(plan) !== JSON.stringify(again)) bad++;
    if (plan[0].from !== 0 || plan[plan.length - 1].to !== 24 || plan.some((k, i) => k.to <= k.from || (i && k.from !== plan[i - 1].to))) bad++;
    // Out of doors only by daylight (the night trades apart).
    if (t !== 'night-soil man' && plan.some((k) => ['out', 'square', 'market', 'gate'].includes(k.place) && (k.from < rise || k.to > set))) bad++;
    if (!plan.some((k) => k.act === 'sleep')) bad++;
  }
  ok(bad === 0, `${n} plans: whole, the same every time, out of doors only by daylight, with sleep in them`);
  ok(seenKinds.size >= 12, `the templates are all kept (${[...seenKinds].join(', ')})`);
  const rest = dayBlocks(seed, 'r', 6, P('cooper', 35, 'head', ['Pious']) as never, 'home', 'home' as never, { rise: 7, set: 17 });
  const work = dayBlocks(seed, 'r', 5, P('cooper', 35, 'head', ['Pious']) as never, 'home', 'home' as never, { rise: 7, set: 17 });
  ok(restDay(6) && !restDay(5) && !rest.some((k) => k.act === 'work') && rest.some((k) => k.place === 'temple') && work.some((k) => k.act === 'work'), 'the rest day: no work, the temple in the morning');
  const farm = (rise: number, set: number) => dayBlocks(seed, 'f', 1, P('farmer', 35, 'head') as never, 'out', 'home' as never, { rise, set }).filter((k) => k.place === 'out').reduce((a, k) => a + k.to - k.from, 0);
  ok(farm(4.5, 21) > farm(8.5, 16) + 3, `a farmer works longer in summer than in winter (${farm(4.5, 21).toFixed(1)} h against ${farm(8.5, 16).toFixed(1)} h)`);
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
