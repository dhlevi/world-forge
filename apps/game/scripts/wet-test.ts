/**
 * Puddles, mud and ice in places, and frozen water (docs/backlog.md, W1 and W3; game/wet.ts, core
 * weather/weather.ts): the
 * weather fills the hollows in rain and they dry within days, sooner than the mud; frozen, they are
 * ice. Which tiles hold water follows the ground (ruts before turf) and shrinks back to the deepest
 * as it dries; snow hides it. In play, mud slows a step, a puddle soils, and ice may throw the
 * wanderer down (Acrobatics). Still water freezes over in a hard frost, the shallows first and
 * rivers last; thick ice bears the wanderer, and thin ice may give way.
 * npx tsx apps/game/scripts/wet-test.ts (exits non-zero on a failure).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHUNK } from '@worldforge/core/local/chunk';
import { G } from '@worldforge/core/local/tiles';
import { groundAt, type ClimatePoint } from '@worldforge/core/weather/weather';
import { MessageDispatcher } from '../src/engine/messages';
import '../src/actors/cast';
import { Needs } from '../src/actors/needs';
import { readSave } from '../src/game/save';
import { PlaySession, type PlayOptions, type SessionWorld } from '../src/game/session';
import { ICE_SAFE, iceOn, wetAt, type GroundWet } from '../src/game/wet';
import type { ChunkData, StartSite } from '../src/worker/protocol';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

console.log('the weather on the ground');
{
  const mild: ClimatePoint = { lon: 0, lat: 50, warm: 18, cold: 3, precipSummer: 800, precipWinter: 900, windU: 0.5, windV: 0 };
  const clock = { startDoy: 80 };
  const days = Array.from({ length: 24 * 120 / 3 }, (_, i) => groundAt(1234, mild, clock, i * 3));
  const wet = days.filter((g) => g.pool >= 0.3).length, dry = days.filter((g) => g.pool === 0).length;
  ok(wet > 20 && dry > 20, `in a wet temperate spring, puddles come and go (full ${wet}, none ${dry} of ${days.length} watches)`);
  ok(days.filter((g) => g.mud >= 0.3 && g.pool === 0).length > 0, 'the puddles dry before the mud does');
  // Once the rain stops, the puddles are gone within a few days.
  let longest = 0, run = 0;
  for (const g of days) {
    run = g.pool > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  ok(longest < 8 * 24 / 3 || wet > days.length * 0.6, `no puddle lasts long without more rain (longest wet run ${Math.round((longest * 3) / 24)} days)`);
  const cold: ClimatePoint = { lon: 0, lat: 52, warm: 16, cold: -4, precipSummer: 600, precipWinter: 700, windU: 0.5, windV: 0 };
  const winter = Array.from({ length: 24 * 150 / 3 }, (_, i) => groundAt(99, cold, { startDoy: 300 }, i * 3));
  ok(winter.some((g) => g.frozen && g.pool > 0.1 && g.snowCm < 2), 'in a cold winter, puddles freeze over');
  const most = Math.max(...winter.map((g) => g.iceCm));
  ok(most >= ICE_SAFE * 1.5, `and the lakes freeze hard (${most.toFixed(0)} cm at most)`);
  const firstHard = winter.findIndex((g) => g.iceCm >= ICE_SAFE);
  ok(firstHard > 8 && winter.slice(0, firstHard).some((g) => g.iceCm > 0 && g.iceCm < ICE_SAFE), `over days of frost, thin first (hard after ${Math.round((firstHard * 3) / 24)} days)`);
  ok(winter[winter.length - 1].iceCm < most, `and thaw in the spring (${winter[winter.length - 1].iceCm} cm at the end)`);
  ok(days.every((g) => g.iceCm < 3), 'none to speak of in a mild spring');
}

console.log('\nwhere the water lies');
{
  const share = (ground: string, g: GroundWet, kind = 'puddle') => {
    let n = 0;
    for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) if (wetAt(ground, x, y, g) === kind) n++;
    return n / 14400;
  };
  const full: GroundWet = { pool: 1, mud: 0, frozen: false, snowCm: 0, iceCm: 0 };
  const some: GroundWet = { pool: 0.35, mud: 0, frozen: false, snowCm: 0, iceCm: 0 };
  const road = share('road', full), grass = share('grass', full), little = share('road', some);
  ok(road > 0.08 && road < 0.4, `after heavy rain, ${Math.round(road * 100)}% of a road stands in puddles`);
  ok(grass < road / 2 && grass > 0, `fewer on grass (${Math.round(grass * 100)}%)`);
  ok(little < road && little > 0, `fewer as it dries (${Math.round(little * 100)}%)`);
  let subset = true;
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) if (wetAt('road', x, y, some) && !wetAt('road', x, y, full)) subset = false;
  ok(subset, 'and those left are the deepest, where they were');
  ok(share('road', { ...full, frozen: true }, 'puddle_ice') === road, 'frozen, every puddle is ice');
  ok(share('road', { ...full, snowCm: 5 }) === 0 && share('road', { ...full, snowCm: 5 }, 'puddle_ice') === 0, 'snow lying hides them');
  ok(share('floor_wood', full) === 0 && share('sand', full) === 0, 'none indoors or on sand');
  const muddy: GroundWet = { pool: 0, mud: 1, frozen: false, snowCm: 0, iceCm: 0 };
  ok(share('track', muddy, 'mud_patch') > 0.1 && share('cobbles', muddy, 'mud_patch') === 0, `mud on the track (${Math.round(share('track', muddy, 'mud_patch') * 100)}%), none on cobbles`);
}

console.log('\nwhich water freezes');
{
  const at = (g: string, elev = 20) => iceOn(g, elev, 5, 5, 10);
  ok(at('water_shallow') > at('water_deep') && at('water_deep') > at('river') && at('river') > at('river_deep'), `the shallows first, then still deep water, then rivers (${['water_shallow', 'water_deep', 'river', 'river_deep'].map((g) => at(g)).join(', ')} cm)`);
  ok(at('water_deep', -2) < at('water_deep') / 3, 'the sea hardly at all');
  ok(at('grass') === 0 && iceOn('water_deep', 20, 5, 5, 0) === 0, 'and nothing else, nor in a thaw');
}

console.log('\nunderfoot');
{
  const fixture = readFileSync(fileURLToPath(new URL('./fixtures/save-v1-camps.json', import.meta.url)), 'utf8');
  const restore = readSave(fixture);
  const [X, Y] = [restore.player.x, restore.player.y];
  const world: SessionWorld = {
    bus: new MessageDispatcher(),
    requestChunk: () => {},
    climate: async () => ({ warm: 18, cold: 2, precipSummer: 700, precipWinter: 700, windU: 0.6, windV: 0 }),
    requestRoute: async () => ({ steps: null, partial: false }),
    requestPeople: async () => ({ people: [], radius: 96 }),
    site: async () => ({ site: null, gates: [] }),
    starts: () => [],
  };
  const site = { id: 's12', name: 'Onson', tier: 'city', population: 40000, lon: 10, lat: 50 } as StartSite;
  const session = (paint: (x: number, y: number) => string = () => 'road') => {
    const o: PlayOptions = { site, tile: [X, Y], sites: [], gameId: restore.id, settings: restore.settings, restore, character: null };
    const s = new PlaySession(world, { openCity: async () => {}, toTitle() {} }, o);
    const N = CHUNK * CHUNK;
    const [cx0, cy0] = [Math.floor(X / CHUNK), Math.floor(Y / CHUNK)];
    for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
      const ground = new Uint8Array(N);
      for (let k = 0; k < N; k++) ground[k] = G(paint(cx * CHUNK + (k % CHUNK), cy * CHUNK + Math.floor(k / CHUNK)));
      s.map.add({ cx, cy, ground, object: new Uint8Array(N), area: new Uint16Array(N), areas: [''], elev: new Int16Array(N).fill(30), sites: [], roofs: [], layers: [], ms: 0 } as ChunkData);
    }
    s.game.z = null;
    return s;
  };
  /** Seconds to walk ten steps east and back, on this footing. */
  const walk = (s: PlaySession, n = 10) => {
    const t0 = s.game.time;
    for (let i = 0; i < n; i++) s.game.move(i % 2 ? -1 : 1, 0);
    return s.game.time - t0;
  };
  const dry = session();
  dry.game.wetAt = () => null;
  const muddy = session();
  muddy.game.wetAt = () => 'mud_patch';
  ok(walk(muddy) > walk(dry) * 1.4, `mud slows the going (${walk(muddy).toFixed(0)} s against ${walk(dry).toFixed(0)} s for ten steps)`);
  const puddly = session();
  puddly.game.wetAt = () => 'puddle';
  const g0 = puddly.player!.need(Needs).d.grime ?? 0;
  walk(puddly, 20);
  ok((puddly.player!.need(Needs).d.grime ?? 0) > g0, 'puddles splash and soil the wanderer');
  ok(puddly.hud.log.filter((l) => /puddle/.test(l.text)).length === 1, 'and are told once, not at every step');
  const icy = session();
  icy.game.wetAt = () => 'puddle_ice';
  walk(icy, 200);
  const falls = icy.hud.log.filter((l) => /fall|come down hard/.test(l.text)).length;
  ok(falls >= 1 && falls < 35, `on ice the wanderer falls now and then (${falls} in 200 steps)`);
  for (const s of [dry, muddy, puddly, icy]) s.dispose();
  // A frozen lake: water to the east of the wanderer.
  const lake = (iceCm: number) => {
    const s = session((x, y) => (x > X && x < X + 40 && Math.abs(y - Y) <= 3 ? 'water_deep' : 'road'));
    // Clear of anything the save left standing there.
    for (let dx = 0; dx < 40; dx++) for (let dy = -3; dy <= 3; dy++) if (s.map.object(X + dx, Y + dy)) s.map.setObject(X + dx, Y + dy, 0);
    s.wetNow = () => ({ pool: 0, mud: 0, frozen: true, snowCm: 0, iceCm });
    s.game.wetAt = () => null;
    return s;
  };
  const open = lake(0);
  open.game.move(1, 0);
  ok(open.game.inDeep() && open.game.activity === 'swim', 'open water is swum');
  const hard = lake(30);
  for (let i = 0; i < 10; i++) hard.game.move(1, 0);
  ok(hard.game.px === X + 10 && !hard.game.inDeep() && hard.game.activity === 'walk', 'thick ice is walked on');
  const thin = lake(4);
  let broke = -1;
  for (let i = 0; i < 30 && broke < 0; i++) {
    thin.game.move(1, 0);
    if (thin.game.inDeep()) broke = i;
  }
  ok(broke >= 0 && (thin.player!.need(Needs).d.wet ?? 0) === 100, `thin ice gives way (after ${broke + 1} steps), and the water soaks the wanderer`);
  ok(thin.hud.log.some((l) => /ice gives way/.test(l.text)), 'which is told');
  for (const s of [open, hard, thin]) s.dispose();
}

console.log(failures ? `\n${failures} failed` : '\nall wet-ground and ice tests passed');
process.exit(failures ? 1 : 0);
