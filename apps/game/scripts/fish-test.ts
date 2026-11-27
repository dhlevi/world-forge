/**
 * Fishing (docs/design/fieldcraft.md, stage 4; world/fishing.ts, game/fishing.ts): the skill menu at
 * a river, a lake and the sea's shore; fishing with a rod for a time and until a catch, the fish of
 * each water; a spear in the shallows only; stopping when a wolf comes near; a baited set line left
 * a day and lifted; gutting, roasting gutted and whole; digging for worms; fish as trap bait; and
 * fishing through the ice.
 * npx tsx apps/game/scripts/fish-test.ts (exits non-zero on a failure).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHUNK, TILE_M } from '@worldforge/core/local/chunk';
import { G } from '@worldforge/core/local/tiles';
import { MessageDispatcher } from '../src/engine/messages';
import '../src/actors/cast';
import { Inventory } from '../src/actors/items/inventory';
import { makeItem } from '../src/actors/items/item';
import { Skills } from '../src/actors/components';
import { readSave } from '../src/game/save';
import { PlaySession, type PlayOptions, type SessionHost, type SessionWorld } from '../src/game/session';
import type { ChunkData, LocalSite, PlacedPerson, StartSite } from '../src/worker/protocol';

import { baitKind } from '../src/world/traps';
import { FISH_BY_ID } from '../src/actors/data/fish';
import { defOf } from '../src/actors/items/item';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/save-v1-camps.json', import.meta.url)), 'utf8');
const start = readSave(fixture);
const [X, Y] = [start.player.x, start.player.y];

function world(people: PlacedPerson[]): SessionWorld {
  return {
    bus: new MessageDispatcher(),
    requestChunk: () => {},
    climate: async () => ({ warm: 18, cold: 2, precipSummer: 700, precipWinter: 700, windU: 0.6, windV: 0 }),
    requestRoute: async () => ({ steps: null, partial: false }),
    requestPeople: async () => ({ people, radius: 96 }),
    site: async () => ({ site: null, gates: [] }),
    starts: () => [],
  };
}
const host = { openCity: async () => {}, toTitle() {}, mercy() {} } satisfies SessionHost;
const site = { id: 's12', name: 'Onson', tier: 'city', population: 40000, lon: 10, lat: 50 } as StartSite;

/** A session on open grass (in a town if `town`), with these people about. */
type Water = 'river' | 'lake' | 'sea';
async function play(people: PlacedPerson[] = [], town = false, water: Water = 'river'): Promise<PlaySession> {
  const restore = readSave(fixture);
  const sites: LocalSite[] = town ? [{ id: 'c1', name: 'Onson', tier: 'town', x: (X + 0.5) * TILE_M, y: -(Y + 0.5) * TILE_M, radiusM: 400 }] : [];
  const o: PlayOptions = { site, tile: [restore.player.x, restore.player.y], sites, gameId: restore.id, settings: restore.settings, restore, character: null };
  const s = new PlaySession(world(people), host, o);
  const N = CHUNK * CHUNK;
  const [cx0, cy0] = [Math.floor(X / CHUNK), Math.floor(Y / CHUNK)];
  for (let cy = cy0 - 3; cy <= cy0 + 3; cy++) for (let cx = cx0 - 3; cx <= cx0 + 3; cx++) {
    const ground = new Uint8Array(N).fill(G('grass')), salt = new Uint8Array(N);
    const [shallow, deep] = water === 'river' ? ['river', 'river_deep'] : ['water_shallow', 'water_deep'];
    for (let i = 0; i < N; i++) {
      const x = cx * CHUNK + (i % CHUNK);
      if (x >= X + 3) {
        ground[i] = G(x >= X + 6 ? deep : shallow);
        if (water === 'sea') salt[i] = 1;
      }
    }
    s.map.add({ cx, cy, ground, object: new Uint8Array(N), area: new Uint16Array(N), areas: [''], elev: new Int16Array(N).fill(water === 'sea' ? 0 : 30), sites: [], roofs: [], layers: [], ms: 0, ...(water === 'sea' ? { salt } : {}) } as ChunkData);
  }
  s.game.z = null;
  s.state.mode = 'local';
  s.game.ambient = { light: 1, range: 30 };
  s.field.stepMs = 0;
  s.advance(1);
  for (let i = 0; i < 20 && s.people.size < people.length; i++) await new Promise((r) => setTimeout(r, 5));
  s.advance(1);
  return s;
}
const inv = (s: PlaySession) => s.player!.need(Inventory);
const give = (s: PlaySession, def: string, qty = 1) => inv(s).d.items.push({ ...makeItem(def, { qty }), loc: { at: 'pack' } } as never);
const has = (s: PlaySession, def: string) => inv(s).d.items.filter((i) => i.def === def).reduce((n, i) => n + i.qty, 0);
const ids = (s: PlaySession, x: number, y: number) => s.field.actions(x, y).map((a) => `${a.id}${a.why ? '!' : ''}`);



/** The fish carried, by species. */
const fishCarried = (s: PlaySession) => inv(s).d.items.filter((i) => /^(fish|gutted|roast)_/.test(i.def) && i.def !== 'fish_guts' && i.def !== 'fish_spear');
const speciesOf = (def: string) => FISH_BY_ID.get(def.replace(/^(fish|gutted|roast)_/, ''));
const setSkill = (s: PlaySession, id: string, n: number) => (s.player!.need(Skills).d.levels[id] = n);

console.log('the skill menu at the water');
{
  const s = await play();
  const menu = ids(s, X + 3, Y);
  ok(menu.includes('fishhour!') && menu.includes('setline!'), `at a river with no gear, fishing is offered but cannot be done (${menu.join(', ')})`);
  give(s, 'fishing_rod');
  give(s, 'set_line');
  const m2 = ids(s, X + 3, Y);
  ok(['fishhour', 'fishtwo', 'fishlight', 'fishone', 'setline'].every((i) => m2.includes(i)), 'with a rod: an hour, two, until dusk or dawn, until a catch; and a set line');
  ok(!ids(s, X + 1, Y).some((i) => i.startsWith('fish')), 'no fishing on dry land');
  s.dispose();
}

console.log('\nwith a rod');
{
  const s = await play();
  setSkill(s, 'fishing', 50);
  give(s, 'fishing_rod');
  give(s, 'worms', 10);
  const t0 = s.game.time;
  for (let i = 0; i < 4; i++) await s.field.act('fishtwo', X + 3, Y);
  const caught = fishCarried(s);
  const hours = (s.game.time - t0) / 3600;
  ok(caught.length >= 1 && hours >= 7 && hours <= 9, `eight hours on a river bank with worms: ${caught.length} fish (${caught.map((i) => `${defOf(i).name} ${i.kg} kg`).join(', ')})`);
  ok(caught.every((i) => speciesOf(i.def)?.waters.includes('river')), 'all of them river fish');
  ok(has(s, 'worms') < 10, `bait used as they bite (${10 - has(s, 'worms')} handfuls)`);
  ok(caught.every((i) => (i.uses ?? 0) >= 1 && (i.kg ?? 0) > 0), 'each its own weight and portions');
  const before = fishCarried(s).length, t1 = s.game.time;
  await s.field.act('fishone', X + 3, Y);
  ok(fishCarried(s).length === before + 1 || s.game.time - t1 >= 4 * 3600 - 1, `until a catch: stops at the first (${Math.round((s.game.time - t1) / 60)} minutes)`);
  s.dispose();
}
{
  const s = await play(undefined, false, 'sea');
  setSkill(s, 'fishing', 60);
  give(s, 'fishing_rod');
  give(s, 'fish_guts', 10);
  for (let i = 0; i < 5; i++) await s.field.act('fishtwo', X + 3, Y);
  const caught = fishCarried(s);
  ok(caught.length >= 1 && caught.every((i) => speciesOf(i.def)?.waters.includes('shore')), `on the sea's shore, sea fish (${caught.map((i) => defOf(i).name).join(', ')})`);
  s.dispose();
}

console.log('\nwith a spear');
{
  const s = await play();
  setSkill(s, 'fishing', 50);
  give(s, 'fish_spear');
  ok(ids(s, X + 7, Y).includes('spearhour!'), 'not in deep water');
  ok(ids(s, X + 3, Y).includes('spearhour'), 'in the shallows, yes');
  for (let i = 0; i < 6; i++) await s.field.act('spearhour', X + 3, Y);
  const caught = fishCarried(s);
  ok(caught.every((i) => speciesOf(i.def)?.shallows), `only the fish of the shallows (${caught.map((i) => defOf(i).name).join(', ') || 'none in six hours'})`);
  s.dispose();
}

console.log('\nstopping, and needs');
{
  const s = await play();
  give(s, 'fishing_rod');
  s.fauna.pin({ id: 'hunt:boar', species: 'boar', members: [{ x: X - 3, y: Y + 2, z: null }], home: { x: X - 3, y: Y + 2, r: 2 }, water: null }, s.game);
  s.game.refresh();
  const t0 = s.game.time;
  await s.field.act('fishtwo', X + 3, Y);
  ok(s.game.time - t0 < 2 * 3600 && /boar is close by|set upon/.test(s.hud.log.map((l) => l.text).join(' ')), `a wild boar close by stops it (${Math.round((s.game.time - t0) / 60)} minutes)`);
  s.dispose();
}

console.log('\nset lines and nets');
{
  const s = await play();
  setSkill(s, 'fishing', 40);
  give(s, 'set_line');
  give(s, 'worms', 2);
  await s.field.act('setline', X + 3, Y);
  const l = s.lines.at(X + 3, Y)!;
  ok(!!l && l.bait === 'worm' && has(s, 'set_line') === 0 && s.game.lineAt(X + 3, Y) === 'line', 'a baited line is set, and marked');
  s.game.time += 36 * 3600;
  s.fishing.run();
  ok(l.catch.length >= 1 || !!l.robbed, `a day and a half later it holds ${l.catch.length} fish`);
  const n = fishCarried(s).length;
  s.game.px = X + 2;
  await s.field.act('liftline', X + 3, Y);
  ok(!s.lines.at(X + 3, Y) && has(s, 'set_line') === 1 && fishCarried(s).length === n + l.catch.length, 'lifted: the line back and the fish in the pack');
  ok(s.hunt.trapSites().length === 0, 'and no longer marked on the travel map');
  give(s, 'net');
  s.game.px = X + 2;
  s.game.py = Y + 2;
  await s.field.act('setnet', X + 3, Y + 2);
  ok(s.hunt.trapSites().some((t) => t.kinds.line === 1) && /set line or net/.test(s.hunt.trapWords(s.hunt.trapSites()[0])), `a net set is marked on the travel map ("${s.hunt.trapWords(s.hunt.trapSites()[0])}")`);
  s.dispose();
}

console.log('\ngutting, roasting and worms');
{
  const s = await play();
  give(s, 'knife');
  give(s, 'flint');
  give(s, 'firewood', 2);
  inv(s).d.items.push({ ...makeItem('fish_trout'), kg: 0.8, uses: 2, loc: { at: 'pack' } } as never, { ...makeItem('fish_perch'), kg: 0.3, uses: 1, loc: { at: 'pack' } } as never);
  ok(ids(s, s.game.px, s.game.py).includes('gut'), 'carrying fish and a blade, they can be gutted');
  await s.field.act('gut', s.game.px, s.game.py);
  ok(has(s, 'gutted_trout') === 1 && has(s, 'gutted_perch') === 1 && has(s, 'fish_trout') === 0, 'gutted, each its own');
  ok(has(s, 'fish_guts') >= 0 && baitKind('fish_guts') === 'meat' && baitKind('gutted_trout') === 'meat' && baitKind('fish_spear') === null, `the guts kept (${has(s, 'fish_guts')}), and fish and guts are bait for traps`);
  inv(s).d.items.push({ ...makeItem('fish_pike'), kg: 2, uses: 6, loc: { at: 'pack' } } as never);
  await s.field.act('fire', X - 2, Y);
  s.game.px = X - 1;
  s.game.py = Y;
  s.field.roast();
  const trout = inv(s).d.items.find((i) => i.def === 'roast_trout'), pike = inv(s).d.items.find((i) => i.def === 'roast_pike');
  ok(!!trout && !!pike, `roasted at the fire: ${[trout, pike].filter(Boolean).map((i) => `${defOf(i!).name} (${i!.quality})`).join(', ')}`);
  ok(!pike || pike.quality !== 'fine', 'the pike roasted whole, the poorer for it');
  // Worms near the water.
  const menu = ids(s, X + 1, Y + 1);
  ok(menu.includes('worms'), 'worms can be dug on grass near the water');
  await s.field.act('worms', X + 1, Y + 1);
  ok(has(s, 'worms') >= 1, `half an hour's digging: ${has(s, 'worms')} handful${has(s, 'worms') === 1 ? '' : 's'}`);
  s.dispose();
}

console.log('\nice');
{
  const s = await play(undefined, false, 'lake');
  give(s, 'fishing_rod');
  // The weather is made afresh each turn: hold the lake frozen.
  (s.fishing as unknown as { frozen: () => boolean }).frozen = () => true;
  ok(ids(s, X + 3, Y).includes('fishhour!'), 'a frozen lake cannot be fished without something to cut the ice');
  give(s, 'axe');
  ok(ids(s, X + 3, Y).includes('fishhour') && ids(s, X + 3, Y).includes('setline!'), 'with an axe a hole can be cut for a rod, but no line set');
  const t0 = s.game.time;
  await s.field.act('fishhour', X + 3, Y);
  ok(s.game.time - t0 >= 80 * 60 && /hole through the ice/.test(s.hud.log.map((l) => l.text).join(' ')), 'cutting the hole takes its time');
  s.dispose();
}

console.log(failures ? `\n${failures} failed` : '\nall fishing tests passed');
process.exit(failures ? 1 : 0);
