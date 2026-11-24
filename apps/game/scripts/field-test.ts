/**
 * Fieldcraft, stage 1 (docs/design/fieldcraft.md; game/fieldcraft.ts): the skill menu lists what can
 * be done at a tile, with why not; a thing out of reach is walked to first, round what is in the
 * way; a fire is made anywhere on open ground with flint and wood carried or gathered about, as a
 * small camp; and raw meat and game are roasted at a fire, to carry.
 * npx tsx apps/game/scripts/field-test.ts (exits non-zero on a failure).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHUNK } from '@worldforge/core/local/chunk';
import { G, objectId } from '@worldforge/core/local/tiles';
import { MessageDispatcher } from '../src/engine/messages';
import '../src/actors/cast';
import { Inventory } from '../src/actors/items/inventory';
import { makeItem } from '../src/actors/items/item';
import { readSave } from '../src/game/save';
import { PlaySession, type PlayOptions, type SessionWorld } from '../src/game/session';
import type { ChunkData, StartSite } from '../src/worker/protocol';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

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

/** A meadow with a wood to the north, a wall across the way east, and a road to the south. */
function session(): PlaySession {
  const o: PlayOptions = { site: { id: 's12', name: 'Onson', tier: 'city', population: 40000, lon: 10, lat: 50 } as StartSite, tile: [X, Y], sites: [], gameId: restore.id, settings: restore.settings, restore, character: null };
  const s = new PlaySession(world, { openCity: async () => {}, toTitle() {} }, o);
  const N = CHUNK * CHUNK;
  const [cx0, cy0] = [Math.floor(X / CHUNK), Math.floor(Y / CHUNK)];
  const tree = objectId('tree_broadleaf')!, wall = objectId('wall_stone')!;
  for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
    const ground = new Uint8Array(N), object = new Uint8Array(N);
    for (let k = 0; k < N; k++) {
      const x = cx * CHUNK + (k % CHUNK), y = cy * CHUNK + Math.floor(k / CHUNK);
      ground[k] = G(y === Y + 6 ? 'road' : 'grass');
      if (y < Y - 3 && y > Y - 12 && (x + y) % 3 === 0) object[k] = tree;
      if (x === X + 4 && y >= Y - 2 && y <= Y + 2) object[k] = wall;
    }
    s.map.add({ cx, cy, ground, object, area: new Uint16Array(N), areas: [''], elev: new Int16Array(N).fill(30), sites: [], roofs: [], layers: [], ms: 0 } as ChunkData);
  }
  s.game.z = null;
  s.field.stepMs = 0;
  s.game.px = X;
  s.game.py = Y;
  s.game.camps.import([]);
  const inv = s.player!.need(Inventory);
  for (const i of [...inv.d.items]) if (i.def === 'flint' || i.def === 'firewood' || i.def === 'stick') inv.drop(i.uid);
  return s;
}
const ids = (s: PlaySession, x: number, y: number) => s.field.actions(x, y).map((a) => a.id);

console.log('the skill menu');
{
  const s = session();
  const acts = s.field.actions(X + 2, Y - 2);
  ok(acts.some((a) => a.id === 'walk') && acts.some((a) => a.id === 'gather') && acts.some((a) => a.id === 'snare'), `a meadow tile offers walking, gathering and a snare (${acts.map((a) => a.id).join(', ')})`);
  ok(acts.find((a) => a.id === 'fire')?.why === 'You have nothing to light a fire with.', 'and a fire, but not without flint and steel');
  s.player!.need(Inventory).stow(makeItem('flint'));
  ok(!s.field.actions(X + 2, Y - 2).find((a) => a.id === 'fire')?.why, 'with it, a fire there');
  ok(/open, dry ground/.test(s.field.actions(X, Y + 6).find((a) => a.id === 'fire')?.why ?? ''), 'but none on the road');
  ok(!ids(s, X + 4, Y).includes('walk'), 'and a wall cannot be walked onto');
  await s.field.act('walk', X + 6, Y);
  ok(s.game.px === X + 6 && s.game.py === Y, `walking there goes round the wall (now at ${s.game.px - X}, ${s.game.py - Y})`);
  // Walking is a step at a time, each shown, and stopped by the player.
  s.field.stepMs = 20;
  const walk = s.field.act('walk', X - 10, Y);
  await new Promise((r) => setTimeout(r, 70));
  const mid = s.game.px;
  ok(s.field.busy && mid < X + 6 && mid > X - 10, `the walk goes a step at a time (part way, at ${mid - X})`);
  s.field.cancelWalk();
  await walk;
  ok(!s.field.busy && s.game.px > X - 10, `and stops when the player stops it (at ${s.game.px - X})`);
  s.field.stepMs = 0;
  s.dispose();
}

console.log('\na fire anywhere');
{
  let lit = 0, tries = 0, fromSticks = false;
  for (let k = 0; k < 6; k++) {
    const s = session();
    const inv = s.player!.need(Inventory);
    inv.stow(makeItem('flint'));
    await s.field.act('fire', X + 1, Y - 5);
    for (let i = 0; i < 4 && !s.game.camps.at(X + 1, Y - 5)?.fire.lit; i++) await s.field.act('relight', X + 1, Y - 5);
    tries++;
    const camp = s.game.camps.at(X + 1, Y - 5);
    if (camp?.fire.lit && camp.x === X + 1) lit++;
    if (k === 0) ok(!!camp && Math.max(Math.abs(s.game.px - camp.x), Math.abs(s.game.py - camp.y)) <= 1, 'the wanderer walks to the place and lays a fire there, a small camp');
    s.dispose();
  }
  ok(lit >= tries - 1, `by the wood, with wood gathered about, it lights (${lit} of ${tries})`);
  // In the open meadow, far from the wood: only with sticks carried.
  const s = session();
  s.game.py = Y + 3;
  const inv = s.player!.need(Inventory);
  inv.stow(makeItem('flint'));
  inv.stow(makeItem('stick', { qty: 4 }));
  const why = s.field.whyNoNewFire(X - 6, Y + 3);
  await s.field.act('fire', X - 6, Y + 3);
  for (let i = 0; i < 4 && !s.game.camps.at(X - 6, Y + 3)?.fire.lit; i++) await s.field.act('relight', X - 6, Y + 3);
  fromSticks = !inv.d.items.some((i) => i.def === 'stick') && !!s.game.camps.at(X - 6, Y + 3);
  ok(!why && fromSticks, 'the sticks carried feed it');
  ok(/close by already/.test(s.field.whyNoNewFire(X - 5, Y + 3) ?? ''), 'and a second fire is not laid beside the first');
  s.dispose();
}

console.log('\nroasting');
{
  let roasted = 0, burnt = 0;
  for (let k = 0; k < 8; k++) {
    const s = session();
    const inv = s.player!.need(Inventory);
    inv.stow(makeItem('flint'));
    await s.field.act('fire', X + 1, Y - 5);
    for (let i = 0; i < 4 && !s.game.camps.at(X + 1, Y - 5)?.fire.lit; i++) await s.field.act('relight', X + 1, Y - 5);
    inv.stow(makeItem('raw_meat', { qty: 2 }));
    inv.stow(makeItem('rabbit'));
    if (k === 0) ok(ids(s, X + 1, Y - 5).includes('roast'), 'the fire offers roasting what is carried raw');
    const t0 = s.game.time;
    await s.field.act('roast', X + 1, Y - 5);
    if (k === 0) ok(s.game.time - t0 >= 30 * 60, `which takes a while (${Math.round((s.game.time - t0) / 60)} min)`);
    const left = inv.d.items.filter((i) => i.def === 'raw_meat' || i.def === 'rabbit').length;
    if (left) failures++;
    const got = inv.d.items.filter((i) => i.def.startsWith('roast_'));
    if (got.length) roasted++;
    if (got.length < 2) burnt++;
    s.dispose();
  }
  ok(roasted >= 6, `raw meat and game come out roasted, to carry (${roasted} of 8 times)`);
  console.log(`  (some burnt or lost in ${burnt} of 8)`);
}

console.log(failures ? `\n${failures} failed` : '\nall fieldcraft tests passed');
process.exit(failures ? 1 : 0);
