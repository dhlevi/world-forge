/**
 * Camps left standing (docs/design/fieldcraft.md, stage 5; game/camp.ts, game/camping/away.ts): a
 * fire banked and raked up; a banked fire keeping half a day; food left at a camp taken while the
 * wanderer is away, and told on coming back; the camps on the travel map, and going back to one;
 * and a camp left a month falling into ruin.
 * npx tsx apps/game/scripts/camp-test.ts (exits non-zero on a failure).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHUNK, TILE_M } from '@worldforge/core/local/chunk';
import { G, OBJECT_TILES } from '@worldforge/core/local/tiles';
import { MessageDispatcher } from '../src/engine/messages';
import '../src/actors/cast';
import { makeItem } from '../src/actors/items/item';
import { readSave } from '../src/game/save';
import { campable } from '../src/game/camp';
import { PlaySession, type PlayOptions, type SessionHost, type SessionWorld } from '../src/game/session';
import type { ChunkData, LocalSite, StartSite } from '../src/worker/protocol';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/save-v1-camps.json', import.meta.url)), 'utf8');
const start = readSave(fixture);
const [X, Y] = [start.player.x, start.player.y];

function world(people: never[]): SessionWorld {
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
async function play(people: never[] = [], town = false): Promise<PlaySession> {
  const restore = readSave(fixture);
  const sites: LocalSite[] = town ? [{ id: 'c1', name: 'Onson', tier: 'town', x: (X + 0.5) * TILE_M, y: -(Y + 0.5) * TILE_M, radiusM: 400 }] : [];
  const o: PlayOptions = { site, tile: [restore.player.x, restore.player.y], sites, gameId: restore.id, settings: restore.settings, restore, character: null };
  const s = new PlaySession(world(people), host, o);
  const N = CHUNK * CHUNK;
  const [cx0, cy0] = [Math.floor(X / CHUNK), Math.floor(Y / CHUNK)];
  for (let cy = cy0 - 3; cy <= cy0 + 3; cy++) for (let cx = cx0 - 3; cx <= cx0 + 3; cx++) {
    s.map.add({ cx, cy, ground: new Uint8Array(N).fill(G('grass')), object: new Uint8Array(N), area: new Uint16Array(N), areas: [''], elev: new Int16Array(N).fill(30), sites: [], roofs: [], layers: [], ms: 0 } as ChunkData);
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
const objAt = (s: PlaySession, x: number, y: number) => OBJECT_TILES[s.map.objectAt(x, y, null)].name;
const ids = (s: PlaySession, x: number, y: number) => s.field.actions(x, y).map((a) => `${a.id}${a.why ? '!' : ''}`);
const last = (s: PlaySession) => s.hud.log[s.hud.log.length - 1]?.text ?? '';


/** A camp laid out some way east (clear of the fixture's own), its fire lit with some hours in it. */
function campBy(s: PlaySession) {
  const g = s.game;
  const c = g.camps.make(g, X + 16, Y, { shelter: 0.5, wood: 0.5, waterM: 50, hidden: 0.3, score: 0.5 });
  c.wood = 6;
  c.fire.fuelH = 3;
  g.camps.setFire(g, c, true);
  return c;
}

console.log('not in a town');
{
  const s = await play([], true);
  ok(!campable(s.game, X + 5, Y + 5) && /beyond its walls/.test(s.field.whyNoNewFire(X + 5, Y + 5) ?? ''), `no camp or fire within a town ("${s.field.whyNoNewFire(X + 5, Y + 5)}")`);
  s.dispose();
}
{
  const s = await play();
  ok(campable(s.game, X + 5, Y + 5), 'out in the country, yes');
  s.dispose();
}

console.log('\nbanking the fire');
{
  const s = await play();
  const c = campBy(s);
  ok(ids(s, c.x, c.y).includes('bank'), 'a burning camp fire can be banked from the skill menu');
  await s.field.act('bank', c.x, c.y);
  ok(!!c.fire.banked && objAt(s, c.x, c.y) === 'fire_banked' && c.wood < 6, `banked under its ashes, an armful laid on ("${last(s)}")`);
  s.game.time += 10 * 3600;
  s.advance(1);
  ok(c.fire.lit && !!c.fire.banked, 'ten hours later the embers still keep');
  await s.field.act('rake', c.x, c.y);
  ok(c.fire.lit && !c.fire.banked && objAt(s, c.x, c.y) === 'campfire', 'raked back to flame, no flint needed');
  await s.field.act('bank', c.x, c.y);
  s.game.time += 13 * 3600;
  s.advance(1);
  ok(!c.fire.lit && objAt(s, c.x, c.y) === 'fire_out', 'but not past half a day');
  s.dispose();
}

console.log('\naway from the camp');
{
  const s = await play();
  const c = campBy(s);
  s.game.ground.put(c.x + 1, c.y + 1, [makeItem('raw_meat', { qty: 2 }), makeItem('rope')]);
  // Away (on the travel map), for a long while.
  s.game.px = X - 200;
  s.state.mode = 'travel';
  s.game.time += 200 * 3600;
  s.advance(1);
  const left = s.game.ground.at(c.x + 1, c.y + 1);
  ok(!left.some((i) => i.def === 'raw_meat'), `food left at the camp is taken in eight days away (left: ${left.map((i) => i.def).join(', ') || 'nothing'})`);
  ok((c.news?.length ?? 0) > 0 && /fire burnt out/.test(c.news!.join(' ')), 'and the camp keeps what happened, the fire burnt out among it');
  // The travel map.
  const sites = s.campsAway.sites().filter((t) => t.id === `camp:${c.id}`);
  ok(sites.length === 1 && sites[0].fire === 'cold' && sites[0].days >= 8, `the camp is on the travel map ("${s.campsAway.words(sites[0])}")`);
  s.game.px = X + 2;
  s.game.py = Y;
  s.campsAway.goTo(sites[0]);
  ok((s.state.mode as string) === 'local' && Math.max(Math.abs(s.game.px - c.bedAt[0]), Math.abs(s.game.py - c.bedAt[1])) <= 1, 'going to it from near by puts the wanderer at its bed');
  s.advance(1);
  ok(/been at the food/.test(s.hud.log.map((l) => l.text).join(' ')) && !c.news, 'coming back, the wanderer is told what happened');
  s.dispose();
}

console.log('\na month away');
{
  const s = await play();
  const c = campBy(s);
  s.game.px = X - 200;
  s.state.mode = 'travel';
  s.game.time += 31 * 86400;
  s.advance(1);
  ok(!s.game.camps.list.includes(c) && !s.campsAway.sites().some((t) => t.id === `camp:${c.id}`) && objAt(s, c.x, c.y) === 'fire_out', 'a camp left a month falls into ruin: gone from the map, a cold ring of stones');
  s.dispose();
}

console.log(failures ? `\n${failures} failed` : '\nall camp tests passed');
process.exit(failures ? 1 : 0);
