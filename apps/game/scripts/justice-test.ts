/**
 * The law as the session plays it (game/session.ts with world/strife.ts and world/law.ts), in Node
 * with stand-ins for the worker: a cooper struck in a town street; bystanders come to help or
 * scatter; the watch come; the wanderer yields, is arrested and fined, and is no longer wanted; the
 * mercy choices (rob, kill) and the crimes they make; the law's record, the town's regard and the
 * dead saved and carried on; and robbers lying in wait on the road.
 * npx tsx apps/game/scripts/justice-test.ts (exits non-zero on a failure).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHUNK, TILE_M } from '@worldforge/core/local/chunk';
import { G } from '@worldforge/core/local/tiles';
import { MessageDispatcher } from '../src/engine/messages';
import '../src/actors/cast';
import { Inventory } from '../src/actors/items/inventory';
import { readSave } from '../src/game/save';
import { PlaySession, type PlayOptions, type SessionHost, type SessionWorld } from '../src/game/session';
import type { Resident } from '../src/world/population';
import type { ChunkData, LocalSite, PlacedPerson, StartSite } from '../src/worker/protocol';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/save-v1-camps.json', import.meta.url)), 'utf8');
const start = readSave(fixture);
const [X, Y] = [start.player.x, start.player.y];

/** People of the street about the wanderer (the worker's stand-in places them). */
const person = (id: string, trade: string, dx: number, dy: number, o: Partial<PlacedPerson> = {}): PlacedPerson => {
  const at = { x: X + dx, y: Y + dy, z: null };
  return {
    id, name: `${id} Holt`, given: id, female: false, age: 30, culture: 0, people: 'the folk', trade, role: 'head', traits: [], means: 'middling',
    household: `the household of ${id}`, homeId: `h-${id}`, ties: [], template: /guard/.test(trade) ? 'guard' : 'craft', day: 0,
    plan: [{ from: 0, to: 24, act: 'work', place: 'out', at }], home: at, at, facing: 's',
    look: { kind: 'human', skin: '#d8b090', hair: '#5a3a20', hairStyle: 'short', beard: 'none', cloth: ['#7a6a50', '#6a5a46', '#4e5a3e'] }, ...o,
  };
};

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
const host = { mercies: 0, openCity: async () => {}, toTitle() {}, mercy() { this.mercies++; } } satisfies SessionHost & { mercies: number };
const site = { id: 's12', name: 'Onson', tier: 'city', population: 40000, lon: 10, lat: 50 } as StartSite;
/** The town about the wanderer. */
const town: LocalSite = { id: 'c1', name: 'Onson', tier: 'town', x: (X + 0.5) * TILE_M, y: -(Y + 0.5) * TILE_M, radiusM: 400 };

/** A session in a grassy town square, with these people about. */
async function play(people: PlacedPerson[], text = fixture): Promise<PlaySession> {
  const restore = readSave(text);
  const o: PlayOptions = { site, tile: [restore.player.x, restore.player.y], sites: [town], gameId: restore.id, settings: restore.settings, restore, character: null };
  const s = new PlaySession(world(people), host, o);
  const N = CHUNK * CHUNK;
  const [cx0, cy0] = [Math.floor(X / CHUNK), Math.floor(Y / CHUNK)];
  for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
    s.map.add({ cx, cy, ground: new Uint8Array(N).fill(G('grass')), object: new Uint8Array(N), area: new Uint16Array(N), areas: [''], elev: new Int16Array(N).fill(30), sites: [], roofs: [], layers: [], ms: 0 } as ChunkData);
  }
  s.game.z = null;
  s.advance(1);
  // The people come from the worker's stand-in: wait for them, then let them be placed.
  for (let i = 0; i < 20 && s.people.size < people.length; i++) await new Promise((r) => setTimeout(r, 5));
  s.advance(1);
  return s;
}
const byId = (s: PlaySession, id: string) => [...s.people.everyone()].find((r) => r.p.id === id) as Resident;
const log = (s: PlaySession) => s.hud.log.map((l) => l.text).join(' / ');
const copper = (s: PlaySession) => s.player!.need(Inventory).d.copper;

console.log('a crime in the street');
{
  const s = await play([
    person('Cob', 'cooper', 1, 0), person('Bram', 'smith', 3, 1, { traits: ['Brave', 'Wrathful'] }), person('Clem', 'clerk', -4, 2),
    person('Gar', 'guard', 10, 0),
  ]);
  const cob = byId(s, 'Cob');
  ok(!!cob?.present && s.justice.settlement()?.id === 'c1', 'the street has its people, and the wanderer is in a town');
  s.fights.attack({ kind: 'person', r: cob });
  // The first blow may only draw the wanderer's weapon: strike again if so.
  if (!s.law.wanted('c1')) s.fights.attack({ kind: 'person', r: cob });
  ok(s.law.wanted('c1'), 'striking a cooper in the street is a crime on the town\'s record');
  ok(byId(s, 'Bram').fight?.rescue === 'Cob', 'a brave, hot-tempered smith comes to help him, though the wanderer has a blade');
  ok(byId(s, 'Clem').plight === 'fleeing', 'a clerk runs, crying for the watch');
  ok(byId(s, 'Gar').fight?.intent === 'arrest', 'and the guard comes to arrest the wanderer');
  ok(s.law.places(s.now()).some((p) => p.id === 'c1' && p.standing < 0), 'the town thinks the worse of the wanderer');
  // Yield, and wait for the guard to take the wanderer.
  const purse = copper(s);
  s.fights.yieldUp();
  for (let i = 0; i < 40 && s.law.wanted('c1'); i++) s.advance(3);
  ok(!s.law.wanted('c1') && /under arrest/.test(log(s)) && /magistrate of Onson/.test(log(s)), 'yielding, the wanderer is arrested and brought before the magistrate');
  ok(copper(s) < purse || /cells/.test(log(s)), `and fined (${purse} copper before, ${copper(s)} after)`);
  ok(![...s.people.all()].some((r) => r.fight?.foe === 'player'), 'and every fight with the wanderer ends');
}

console.log('\nat the wanderer\'s mercy');
{
  const s = await play([person('Rob', 'robber', 1, 0, { template: 'bandit', homeId: 'band:t' }), person('Wit', 'weaver', 4, 0)]);
  const rob = byId(s, 'Rob');
  rob.plight = 'yielded';
  rob.plightAt = s.now();
  rob.where = 'yielded';
  const opts = s.justice.mercyOptions(rob).map((o) => o.act);
  ok(['spare', 'rob', 'bind', 'tend', 'kill'].every((a) => opts.includes(a as never)), `a yielded robber can be spared, robbed, bound, tended or killed (${opts.join(', ')})`);
  const purse = copper(s), theirs = rob.actor.need(Inventory).d.copper;
  s.justice.mercy(rob, 'rob');
  ok(copper(s) === purse + theirs, 'robbing takes their coin');
  ok(!s.law.wanted('c1'), 'robbing a robber is no crime');
  s.justice.mercy(rob, 'kill');
  ok(s.people.dead.has('Rob') && [...s.game.ground.at(rob.x, rob.y)].some((i) => i.def === 'corpse'), 'killed, a body is left where they knelt');
  ok(s.law.places(s.now()).some((p) => p.id === 'c1'), 'and the deed is known in the town');
  // Saved and carried on: the dead stay dead, and the record stands.
  const again = await play([person('Rob', 'robber', 1, 0, { template: 'bandit', homeId: 'band:t' })], JSON.stringify(s.snapshot()));
  ok(again.people.dead.has('Rob') && !byId(again, 'Rob'), 'the dead are saved, and never placed again');
  ok(JSON.stringify(again.law.export()) === JSON.stringify(s.law.export()), 'the law\'s record and the town\'s regard are saved');
}

console.log('\nthe innocent at mercy');
{
  const s = await play([person('Ann', 'weaver', 1, 0, { female: true }), person('Wit', 'baker', 3, 0)]);
  const ann = byId(s, 'Ann');
  ann.plight = 'yielded';
  ann.plightAt = s.now();
  ann.where = 'yielded';
  s.justice.mercy(ann, 'rob');
  ok(s.law.wanted('c1') && s.law.unserved('c1').some((c) => c.kind === 'theft'), 'robbing a townswoman before a witness is theft on the record');
}

console.log('\nrobbers on the road');
{
  const band = [0, 1, 2].map((i) => person(`B${i}`, i ? 'robber' : 'robber chief', 60 + i, 60, { template: 'bandit', homeId: 'band:x' }));
  const s = await play(band);
  s.strife.ambush = { band: 'band:x', until: s.now() + 600 };
  s.advance(2);
  const near = band.map((p) => byId(s, p.id)).filter((r) => r?.fight?.intent === 'rob' && Math.max(Math.abs(r.x - s.game.px), Math.abs(r.y - s.game.py)) <= 8);
  ok(near.length === 3 && /rise from the cover/.test(log(s)), 'an ambush: the band rises about the wanderer');
  const purse = copper(s);
  s.fights.yieldUp();
  for (let i = 0; i < 20 && copper(s) === purse; i++) s.advance(2);
  ok(purse > 0 && copper(s) === 0 && /takes your purse/.test(log(s)), 'yielding, the wanderer is robbed of their purse');
}

console.log(failures ? `\n${failures} failed` : '\nall justice tests passed');
process.exit(failures ? 1 : 0);
