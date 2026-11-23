/**
 * Deep rivers (docs/backlog.md, T3; core local/travel.ts, rules/crossing.ts, game/travel.ts): on a
 * real world, rivers too deep to ford but not too wide are swum or rafted on the travel map, and a
 * route goes round by a bridge where it can, never swims when told to avoid rivers, and pays for a
 * swim in time. The party waits at the bank for the player's choice; swimming soaks, a load makes
 * it harder, and a raft needs an axe and wood and keeps the load dry.
 * npx tsx apps/game/scripts/river-test.ts (exits non-zero on a failure).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHUNK, LocalWorld } from '@worldforge/core/local/chunk';
import { TravelGrid } from '@worldforge/core/local/travel';
import { generateWorld } from '@worldforge/core/gen/world';
import { Biome } from '@worldforge/core/gen/biomes';
import { MessageDispatcher } from '../src/engine/messages';
import '../src/actors/cast';
import { Needs } from '../src/actors/needs';
import { Health } from '../src/actors/health';
import { Inventory } from '../src/actors/items/inventory';
import { makeItem } from '../src/actors/items/item';
import { readSave } from '../src/game/save';
import { PlaySession, type PlayOptions, type SessionWorld } from '../src/game/session';
import { crossRiver, whyNoRaft } from '../src/rules/crossing';
import type { RouteStep, StartSite } from '../src/worker/protocol';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

console.log('on a real world');
{
  const w = generateWorld({ seed: 'forge', landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 512 } as never, () => {});
  let found = 0, routes = 0, round = 0, swam = 0, dryOk = true, paid = true, detourOk = true;
  for (const city of w.settlements.filter((s) => s.tier === 'city' || s.tier === 'town').slice(0, 12)) {
    const local = new LocalWorld(w, city);
    const grid = new TravelGrid(local);
    const [sx, sy] = local.startTile();
    const c0 = [Math.floor(sx / CHUNK), Math.floor(sy / CHUNK)];
    for (let y = c0[1] - 120; y <= c0[1] + 120 && routes < 12; y += 3) for (let x = c0[0] - 120; x <= c0[0] + 120 && routes < 12; x += 3) {
      if (!grid.cell(x, y).swim) continue;
      found++;
      // Each side of the river: open land a few steps off either way.
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const a: [number, number] = [x - dx * 4, y - dy * 4], b: [number, number] = [x + dx * 4, y + dy * 4];
        const ca = grid.cell(...a), cb = grid.cell(...b);
        if (ca.blocked || cb.blocked || ca.swim || cb.swim) continue;
        const r = grid.route(a[0], a[1], b[0], b[1], 300000, {});
        if (!r) continue;
        routes++;
        const swims = r.cells.filter(([cx, cy]) => grid.cell(cx, cy).swim).length;
        if (swims) swam++;
        else round++;
        // Straight across, swimming: the way the route would take if it did not seek a bridge.
        let across = 0;
        for (let k = 1; k <= 8; k++) across += grid.stepMinutes(a[0] + dx * (k - 1), a[1] + dy * (k - 1), a[0] + dx * k, a[1] + dy * k);
        if (swims && r.minutes < 30) paid = false;
        if (!swims && r.minutes > across + 480) detourOk = false;
        const dry = grid.route(a[0], a[1], b[0], b[1], 300000, { avoidFords: true });
        if (dry && dry.cells.some(([cx, cy]) => grid.cell(cx, cy).swim)) dryOk = false;
        break;
      }
    }
  }
  ok(found > 0 && routes >= 3, `deep rivers to swim about the towns (${found} cells seen, ${routes} crossings tried)`);
  ok(swam + round === routes, `a route swims where there is no way round near (${swam}), and goes round by a bridge or a ford where there is (${round})`);
  ok(detourOk, 'never going round by more than a swim would cost it');
  ok(paid, 'a swim costs its time');
  ok(dryOk, 'avoiding rivers never swims one');
}

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/save-v1-camps.json', import.meta.url)), 'utf8');
const restore = readSave(fixture);
const world: SessionWorld = {
  bus: new MessageDispatcher(),
  requestChunk: () => {},
  climate: async () => ({ warm: 18, cold: 2, precipSummer: 700, precipWinter: 700, windU: 0.6, windV: 0 }),
  requestRoute: async () => ({ steps: null, partial: false }),
  requestPeople: async () => ({ people: [], radius: 96 }),
  site: async () => ({ site: null, gates: [] }),
  starts: () => [],
};
const session = () => {
  const o: PlayOptions = { site: { id: 's12', name: 'Onson', tier: 'city', population: 40000, lon: 10, lat: 50 } as StartSite, tile: [restore.player.x, restore.player.y], sites: [], gameId: restore.id, settings: restore.settings, restore, character: null };
  return new PlaySession(world, { openCity: async () => {}, toTitle() {} }, o);
};

console.log('\ncrossing');
{
  const s = session();
  const a = s.player!;
  const inv = a.need(Inventory);
  for (const i of [...inv.d.items]) if (i.def === 'axe' || i.def === 'hatchet') inv.drop(i.uid);
  ok(!!whyNoRaft(a, Biome.TemperateForest), 'no raft without an axe or a hatchet');
  inv.d.items.push({ ...makeItem('hatchet'), loc: { at: 'belt' } });
  ok(!whyNoRaft(a, Biome.TemperateForest) && !!whyNoRaft(a, Biome.IceSheet), 'with one, a raft where there is wood, and none on the ice');
  // Each try from the same state (a fumble's bruises and swallowed water would pile up).
  const h = a.need(Health), n = a.need(Needs);
  const hd = JSON.stringify(h.d), nd = JSON.stringify(n.d);
  const tally = (by: 'swim' | 'raft', load: number) => {
    let across = 0, secs = 0;
    for (let i = 0; i < 200; i++) {
      h.d = JSON.parse(hd);
      n.d = JSON.parse(nd);
      n.d.wet = 0;
      const r = crossRiver(a, by, { now: s.game.time, load, biome: Biome.TemperateForest, airC: 15, random: Math.random });
      if (r.ok) across++;
      secs += r.seconds;
    }
    return { across, mean: secs / 200, wet: n.d.wet ?? 0 };
  };
  const light = tally('swim', 1), heavy = tally('swim', 1.6), raft = tally('raft', 1.6);
  ok(light.across > heavy.across, `swimming laden is harder (${light.across} of 200 across light, ${heavy.across} laden)`);
  ok(light.wet === 100, 'and soaks the swimmer');
  ok(raft.mean > 2 * 3600 && raft.wet < 100 && raft.across > heavy.across, `a raft takes hours (${(raft.mean / 3600).toFixed(1)} h on average) and keeps the load dry, and gets a load across more surely (${raft.across} of 200)`);
  s.dispose();
}

console.log('\nat the bank');
{
  const s = session();
  const t = s.travel;
  const step = (cx: number, swim = false): RouteStep => ({ cx, cy: 0, min: 1, way: '', ford: false, swim, biome: Biome.TemperateForest, sight: 1000 });
  t.steps = [step(1), step(2, true), step(3, true), step(4)];
  t.i = 0;
  t.stopAtDusk = false;
  let called = 0;
  t.onCross = () => (called++, { ok: true, seconds: 600, text: 'Across.' });
  t.start = () => {
    t.running = true;
  };
  // No timer here: the test takes the steps itself.
  (t as unknown as { tick(): void }).tick = () => {};
  // The steps one by one, as the timer would take them.
  const walk = async (n: number) => {
    // (The wanderer's needs may call a halt on the way; that is not what is tried here.)
    for (let k = 0; k < n && !t.atRiver; k++) {
      t.running = true;
      await (t as unknown as { step(): Promise<void> }).step();
    }
  };
  t.running = true;
  await walk(3);
  ok(t.atRiver && t.i === 1 && !t.running, 'the party stops at the bank of a deep river');
  t.cross('swim');
  await walk(2);
  t.running = false;
  ok(called === 1 && t.i === 3 && !t.atRiver, 'and crosses it once chosen, all of its width at once');
  t.stop();
  s.dispose();
}

console.log(failures ? `\n${failures} failed` : '\nall river tests passed');
process.exit(failures ? 1 : 0);
