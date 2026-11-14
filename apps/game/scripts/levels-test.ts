/**
 * Levels (game/levels.ts) on a made-up map: a lowland, a terrace a level up (a ramp), a plateau two
 * levels higher (a rock face), and a ridge on it. Walking up a ramp, being stopped by a rock face
 * and climbing it, sight over the ground, and climbing by skill (game/practice.ts).
 * npx tsx apps/game/scripts/levels-test.ts (exits non-zero on a failure).
 */
import { CHUNK } from '@worldforge/core/local/chunk';
import { G } from '@worldforge/core/local/tiles';
import { MessageDispatcher } from '../src/engine/messages';
import { Actor } from '../src/actors/actor';
import { Cast } from '../src/actors/cast';
import { Body, Identity, Mood, Pools, Skills, Traits, type IdentityData } from '../src/actors/components';
import { startingInventory } from '../src/actors/items/inventory';
import { Needs } from '../src/actors/needs';
import { Game, RAMP_UP_S, STEP_S, type Hud } from '../src/game/game';
import { GameMap } from '../src/game/map';
import { Practice } from '../src/game/practice';
import { levelOf, levelWords, overGround, stepBetween } from '../src/game/levels';
import type { ChunkData } from '../src/worker/protocol';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

// ---- The rules ------------------------------------------------------------------------------------
ok(levelOf(0) === 0 && levelOf(2.9) === 0 && levelOf(3) === 1 && levelOf(-1) === -1, 'a level is 3 m (and below the sea, negative)');
ok(stepBetween(4, 4) === 'level' && stepBetween(4, 5) === 'ramp' && stepBetween(5, 4) === 'ramp' && stepBetween(4, 6) === 'cliff', 'one level apart: a ramp; two: a cliff');
ok(levelWords(1) === 'a level above you' && levelWords(-2) === 'two levels below you', 'levels in words');

// ---- A made-up land ------------------------------------------------------------------------------
// West to east: lowland (100 m, level 33), from x = 10 a terrace (103 m, level 34), from x = 20 a
// plateau (109 m, level 36) with a ridge at x = 30 (140 m), and the plateau again beyond.
const heightAt = (x: number) => (x >= 30 && x <= 31 ? 140 : x >= 20 ? 109 : x >= 10 ? 103 : 100);
const map = new GameMap(() => {});
for (let cy = -1; cy <= 1; cy++) for (let cx = -1; cx <= 1; cx++) {
  const N = CHUNK * CHUNK, elev = new Int16Array(N);
  for (let k = 0; k < N; k++) elev[k] = heightAt(cx * CHUNK + (k % CHUNK));
  const c: ChunkData = { cx, cy, ground: new Uint8Array(N).fill(G('grass')), object: new Uint8Array(N), area: new Uint16Array(N), areas: [''], elev, sites: [], roofs: [], ms: 0 };
  map.add(c);
}
const hud: Hud = { place: '', where: '', clock: '', log: [], look: [], mode: 'play', loading: 0 };
const g = new Game(map, [8, 5], [], 'the test', hud);
const last = () => hud.log[hud.log.length - 1].text;

// ---- Walking --------------------------------------------------------------------------------------
let t = g.time;
g.move(1, 0);
ok(g.px === 9 && Math.abs(g.time - t - STEP_S) < 1e-9, 'a step on the level takes a step');
t = g.time;
g.move(1, 0);
ok(g.px === 10 && Math.abs(g.time - t - STEP_S - RAMP_UP_S) < 1e-9, 'up a ramp, a little longer');
g.px = 19;
ok(!g.move(1, 0) && g.px === 19, 'with no way to climb, a rock face blocks the way');
ok(/rock face blocks/.test(last()), `and says so ("${last()}")`);
let climbed: [number, boolean] | null = null;
g.climb = (m, up) => {
  climbed = [m, up];
  return { ok: true, seconds: 120 };
};
ok(!g.move(1, 0) && g.px === 19 && /rises 6 m above you. Walk into it again/.test(last()), 'walking into a rock face says how high it is, and how to climb');
t = g.time;
ok(g.move(1, 0) && g.px === 20 && climbed?.[0] === 6 && climbed[1] === true, 'walking into it again climbs it (6 m, up)');
ok(g.time - t >= 120, 'and the climb takes its time');
g.move(-1, 0);
ok(g.px === 20 && /drops away 6 m below you/.test(last()), 'going back over the edge asks first');
g.climb = () => ({ ok: false, seconds: 60 });
t = g.time;
g.move(-1, 0);
ok(g.px === 20 && g.time - t === 60, 'a failed climb takes time and gets nowhere');
g.px = 14;
g.climb = null;
g.run(1, 0);
ok(g.px === 19, `running stops at the foot of a rock face (at ${g.px})`);

// ---- Facing ----------------------------------------------------------------------------------------
g.px = 3;
g.py = 5;
const s0 = g.steps;
g.move(0, -1);
ok(g.facing === 'n' && g.steps === s0 + 1, 'a step north faces north, and counts');
g.move(-1, 1);
ok(g.facing === 'w', 'a step south-west faces west (east or west on a diagonal)');
g.px = 19;
g.py = 5;
const s1 = g.steps;
g.move(1, 0);
ok(g.facing === 'e' && g.steps === s1 && g.px === 19, 'walking into a rock face turns to face it, without a step');

// ---- Sight ----------------------------------------------------------------------------------------
const elevAt = (x: number) => heightAt(x);
ok(overGround(5, 5, 20, 5, elevAt), 'from the lowland, the edge of the plateau is in sight');
ok(!overGround(5, 5, 26, 5, elevAt), 'but not the plateau beyond its edge');
ok(overGround(21, 5, 29, 5, elevAt) && !overGround(21, 5, 36, 5, elevAt), 'on the plateau: up to the ridge, and nothing behind it');
ok(overGround(31, 5, 50, 5, elevAt), 'from the ridge, far over the plateau');
g.px = 21;
g.refresh();
ok(g.isVisible(29, 5) && !g.isVisible(36, 5), 'the game sees as the rule says');
g.px = 5;
g.refresh();
ok(g.isVisible(10, 5) && g.isVisible(14, 5), 'from below, a 3 m bank hides nothing behind it');
ok(g.isVisible(20, 5) && !g.isVisible(26, 5), 'a 6 m rock face shows its edge, not the top beyond it');
ok(overGround(0, 0, 0, 3, (x, y) => [190, 190, 190, 189][y]), 'a metre of rounding hides nothing just past a fold');
ok(g.describe(20, 5).some((l) => /three levels above you \(9 m higher\)/i.test(l)), `looking says how much higher ("${g.describe(20, 5).join(' ')}")`);

// ---- Climbing by skill -------------------------------------------------------------------------------
function climber(level: number): { a: Actor; p: Practice } {
  const bus = new MessageDispatcher();
  const cast = new Cast(bus);
  const a = new Actor('person');
  a.add(new Identity({ given: 'Test', full: 'Test', female: false, age: 25, year: 1000, folk: 'Human', culture: 0, cultureName: 'Test', people: 'Test', homeId: 'h', homeName: 'Home', standing: 'peasant' } as IdentityData));
  const tr = a.add(new Traits(Traits.average()));
  const b = a.add(new Body({ heightCm: 175, weightKg: 75, build: 'average', skin: '', skinHex: '', hair: '', hairHex: '', hairStyle: 'short', beard: 'none', wounds: [] }));
  a.add(new Pools(Pools.fromTraits(tr, b)));
  a.add(new Mood([]));
  a.add(startingInventory([], 0, {}));
  a.add(new Needs(Needs.fresh()));
  a.add(new Skills({ ...Skills.empty(), levels: { climbing: level }, languages: {} }));
  cast.setPlayer(a);
  cast.setClock(0);
  return { a, p: new Practice(() => a, bus, g) };
}
const tries = (level: number, m: number) => {
  const { p } = climber(level);
  let got = 0;
  for (let i = 0; i < 300; i++) {
    g.time += 7200;
    if (p.climb(m, true, 1).ok) got++;
  }
  return got / 300;
};
const novice = tries(0, 6), skilled = tries(60, 6), high = tries(60, 15);
console.log(`  climbing 6 m: a novice gets up ${(novice * 100).toFixed(0)}% of the time, a skilled climber ${(skilled * 100).toFixed(0)}%; 15 m, the skilled ${(high * 100).toFixed(0)}%`);
ok(skilled > novice + 0.2, 'skill makes the climb');
ok(high < skilled, 'a higher face is harder');
const { a, p } = climber(0);
const before = a.need(Skills).level('climbing');
for (let i = 0; i < 20; i++) {
  g.time += 7200;
  p.climb(6, true, 1);
}
ok(a.need(Skills).level('climbing') > before, 'and climbing teaches climbing');

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
if (failures) process.exitCode = 1;
