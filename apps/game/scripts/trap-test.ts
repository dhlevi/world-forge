/**
 * Traps (docs/design/fieldcraft.md, stage 3; world/traps.ts, game/trapping.ts): felling a tree for
 * poles, cutting stakes, digging, spiking and covering a pit; the wanderer stepping round their own
 * pitfall; a frightened deer steered along a drive fence into it and held there; a pit out of sight
 * catching by the hour; a person falling into a pitfall in a town (a crime); and a catch waiting in a
 * snare taken by a predator.
 * npx tsx apps/game/scripts/trap-test.ts (exits non-zero on a failure).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHUNK, TILE_M } from '@worldforge/core/local/chunk';
import { G, O, OBJECT_TILES } from '@worldforge/core/local/tiles';
import { MessageDispatcher } from '../src/engine/messages';
import '../src/actors/cast';
import { Inventory } from '../src/actors/items/inventory';
import { makeItem } from '../src/actors/items/item';
import { Skills } from '../src/actors/components';
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

const person = (id: string, trade: string, dx: number, dy: number, to: [number, number]): PlacedPerson => {
  const at = { x: X + dx, y: Y + dy, z: null };
  return {
    id, name: `${id} Holt`, given: id, female: false, age: 30, culture: 0, people: 'the folk', trade, role: 'head', traits: [], means: 'middling',
    household: `the household of ${id}`, homeId: `h-${id}`, ties: [], template: 'craft', day: 0,
    plan: [{ from: 0, to: 24, act: 'work', place: 'out', at: { x: X + to[0], y: Y + to[1], z: null } }], home: at, at, facing: 's',
    look: { kind: 'human', skin: '#d8b090', hair: '#5a3a20', hairStyle: 'short', beard: 'none', cloth: ['#7a6a50', '#6a5a46', '#4e5a3e'] },
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
const host = { openCity: async () => {}, toTitle() {}, mercy() {} } satisfies SessionHost;
const site = { id: 's12', name: 'Onson', tier: 'city', population: 40000, lon: 10, lat: 50 } as StartSite;

/** A session on open grass (in a town if `town`), with these people about. */
async function play(people: PlacedPerson[] = [], town = false): Promise<PlaySession> {
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
const inv = (s: PlaySession) => s.player!.need(Inventory);
const give = (s: PlaySession, def: string, qty = 1) => inv(s).d.items.push({ ...makeItem(def, { qty }), loc: { at: 'pack' } } as never);
const has = (s: PlaySession, def: string) => inv(s).d.items.filter((i) => i.def === def).reduce((n, i) => n + i.qty, 0);
const objAt = (s: PlaySession, x: number, y: number) => OBJECT_TILES[s.map.objectAt(x, y, null)].name;
const ids = (s: PlaySession, x: number, y: number) => s.field.actions(x, y).map((a) => `${a.id}${a.why ? '!' : ''}`);
const last = (s: PlaySession) => s.hud.log[s.hud.log.length - 1]?.text ?? '';

console.log('felling, stakes and pits');
{
  const s = await play();
  s.map.setObject(X + 1, Y, O('tree_birch'));
  ok(ids(s, X + 1, Y).includes('fell!'), 'a tree cannot be felled without an axe or a hatchet');
  give(s, 'axe');
  const t0 = s.game.time;
  await s.field.act('fell', X + 1, Y);
  ok(objAt(s, X + 1, Y) === 'stump' && has(s, 'pole') >= 1 && s.game.time - t0 >= 10 * 60, `felled with an axe: a stump, ${has(s, 'pole')} poles, in ${Math.round((s.game.time - t0) / 60)} minutes ("${last(s)}")`);
  give(s, 'knife');
  const poles = has(s, 'pole');
  await s.field.act('stakes', s.game.px, s.game.py);
  ok(has(s, 'stake') === poles * 4 && has(s, 'pole') === 0, `a pole cuts into four stakes (${has(s, 'stake')} from ${poles})`);
  // Digging.
  const sticks = inv(s).d.items.filter((i) => i.def === 'stick');
  inv(s).d.items = inv(s).d.items.filter((i) => i.def !== 'stick');
  ok(ids(s, X + 2, Y + 2).includes('dig!'), 'a pit cannot be dug with nothing to dig with');
  inv(s).d.items.push(...sticks);
  give(s, 'shovel');
  const t1 = s.game.time;
  await s.field.act('dig', X + 2, Y + 2);
  const hours = (s.game.time - t1) / 3600;
  ok(objAt(s, X + 2, Y + 2) === 'pit_dug' && hours >= 1.5 && hours <= 3.5 && !!s.pits.at(X + 2, Y + 2), `a pit dug with a shovel in ${hours.toFixed(1)} hours`);
  s.map.setObject(X + 4, Y - 3, 0);
  const rock = s.field.actions(X + 4, Y - 3).find((a) => a.id === 'dig');
  ok(!!rock && !rock.why, `and grass can be dug (${rock?.why ?? 'yes'})`);
  // Spiked and covered.
  give(s, 'stake', 4);
  await s.field.act('spike', X + 2, Y + 2);
  give(s, 'stick', 2);
  await s.field.act('cover', X + 2, Y + 2);
  const p = s.pits.at(X + 2, Y + 2)!;
  ok(objAt(s, X + 2, Y + 2) === 'pit_covered' && !!p.spiked && !!p.covered && (p.hide ?? 0) > 0, `spiked and covered: a pitfall (${Math.round((p.hide ?? 0) * 100)} in a hundred would miss it)`);
  // The wanderer knows their own pitfall.
  s.game.px = X + 1;
  s.game.py = Y + 2;
  ok(!s.game.move(1, 0) && s.game.px === X + 1 && /your pitfall/.test(last(s)), 'the wanderer will not step onto their own pitfall');
  // Fences.
  give(s, 'stake', 3);
  const st0 = has(s, 'stake');
  await s.field.act('fence', X - 3, Y);
  ok(objAt(s, X - 3, Y) === 'stake_fence' && !s.map.passable(X - 3, Y), 'a fence of stakes is driven in, and blocks the way');
  await s.field.act('unfence', X - 3, Y);
  ok(objAt(s, X - 3, Y) === 'none' && has(s, 'stake') === st0, 'and pulled up, the stakes kept');
  // A spade digs slower than a shovel; a stick much slower.
  inv(s).d.items = inv(s).d.items.filter((i) => i.def !== 'shovel');
  give(s, 'stick', 1);
  s.game.px = X;
  s.game.py = Y;
  const t2 = s.game.time;
  await s.field.act('dig', X - 2, Y - 2);
  ok((s.game.time - t2) / 3600 >= 5, `with a stout stick and bare hands it takes ${((s.game.time - t2) / 3600).toFixed(1)} hours`);
  s.dispose();
}

console.log('\nwork that can be stopped and taken up again');
{
  const s = await play();
  give(s, 'shovel');
  // Shown a minute at a time (as in play), stopped part way by the player.
  s.field.stepMs = 1;
  s.field.workMs = 1;
  const t0 = s.game.time;
  const job = s.field.act('dig', X + 2, Y - 2);
  await new Promise((r) => setTimeout(r, 40));
  ok(s.field.busy && !!s.game.hud.task, `while digging the wanderer is busy, and it says so ("${s.game.hud.task}")`);
  s.field.cancelWalk();
  await job;
  const spent = s.game.time - t0;
  ok(objAt(s, X + 2, Y - 2) === 'none' && spent > 0 && spent < 2 * 3600 && s.field.progress.has(`dig:${X + 2},${Y - 2}`), `stopped after ${Math.round(spent / 60)} minutes: no pit yet, the work kept`);
  ok(!s.game.hud.task && !s.field.busy, 'and no longer busy');
  s.field.stepMs = 0;
  const t1 = s.game.time;
  await s.field.act('dig', X + 2, Y - 2);
  ok(objAt(s, X + 2, Y - 2) === 'pit_dug' && !s.field.progress.has(`dig:${X + 2},${Y - 2}`), `taken up again, the pit is finished in ${Math.round((s.game.time - t1) / 60)} more minutes`);
  // Danger stops it: a wild boar close by.
  s.fauna.pin({ id: 'hunt:boar', species: 'boar', members: [{ x: X - 3, y: Y + 3, z: null }], home: { x: X - 3, y: Y + 3, r: 2 }, water: null }, s.game);
  s.game.refresh();
  const t2 = s.game.time;
  await s.field.act('dig', X - 2, Y);
  ok(objAt(s, X - 2, Y) === 'none' && s.game.time - t2 < 10 * 60 && /boar is close by/.test(s.hud.log.map((l) => l.text).join(' ')), 'a wild boar close by stops the work at once');
  s.dispose();
}

console.log('\na drive fence and a pitfall');
{
  const s = await play();
  // A chute of fence running east, a covered pit at its end; a red deer in its mouth.
  const PX = X + 12, PY = Y;
  for (let x = X + 4; x <= PX + 1; x++) {
    s.map.setObject(x, Y - 2, O('stake_fence'));
    s.map.setObject(x, Y + 2, O('stake_fence'));
  }
  s.map.setObject(PX, PY, O('pit_covered'));
  const p = s.pits.dig(PX, PY, s.game.time);
  p.covered = true;
  p.hide = 0.9;
  s.fauna.pin({ id: 'hunt:chute', species: 'red_deer', members: [{ x: X + 5, y: Y - 1, z: null }], home: { x: X + 5, y: Y, r: 4 }, water: null }, s.game);
  const deer = [...s.fauna.all()][0];
  s.game.refresh();
  s.fauna.provoke(deer, s.game);
  for (let i = 0; i < 40 && objAt(s, PX, PY) !== 'pit_sprung'; i++) {
    s.game.time += 2;
    s.fauna.run(s.game, s.presence());
  }
  ok(objAt(s, PX, PY) === 'pit_sprung', `the frightened deer runs along the fence into the pitfall (it is at ${deer.x - X}, ${deer.y - Y})`);
  const held = s.fauna.at(PX, PY);
  ok(!!held && held.s.id === 'red_deer', 'and is in the pit');
  for (let i = 0; i < 20; i++) {
    s.game.time += 5;
    s.fauna.run(s.game, s.presence());
  }
  ok(!held || held.health?.dead || (held.x === PX && held.y === PY), 'it cannot climb out');
  ok((held?.health?.d.wounds.length ?? 1) > 0, 'hurt by the fall (and the stakes, if spiked)');
  s.dispose();
}

console.log('\nout of sight');
{
  const s = await play();
  const PX = X + 60, PY = Y;
  s.map.setObject(PX, PY, O('pit_covered'));
  const p = s.pits.dig(PX, PY, s.game.time);
  p.covered = true;
  p.hide = 0.8;
  s.fauna.pin({ id: 'w:pit:0:roe_deer:0', species: 'roe_deer', members: [{ x: PX + 5, y: PY, z: null }, { x: PX + 6, y: PY + 1, z: null }], home: { x: PX + 3, y: PY, r: 10 }, water: null }, s.game);
  const before = [...s.fauna.all()].length;
  s.game.refresh();
  s.game.time += 200 * 3600;
  s.traps.run();
  ok(objAt(s, PX, PY) === 'pit_sprung', 'a pitfall out of sight in the range of a herd is sprung within days');
  const caught = s.fauna.at(PX, PY) ?? null;
  const items = s.game.ground.at(PX, PY);
  ok(!!caught || items.length > 0 || !!s.pits.at(PX, PY)?.robbed, `with a beast in it${caught ? ' (alive)' : items.length ? ' (dead)' : ', or taken from it by a predator'}`);
  ok([...s.fauna.all()].length <= before, 'and the herd one the fewer');
  s.dispose();
}

console.log('\na person and a pitfall');
{
  // Walking east through a town street, over a pitfall dug where they go.
  const s = await play([person('Ned', 'cooper', 2, 0, [12, 0])], true);
  const ned = [...s.people.everyone()].find((r) => r.p.id === 'Ned') as Resident;
  s.map.setObject(X + 6, Y, O('pit_covered'));
  const p = s.pits.dig(X + 6, Y, s.game.time);
  p.covered = true;
  p.hide = 1;
  p.seen = true;
  s.traps.personSteps(ned, X + 6, Y);
  ok(objAt(s, X + 6, Y) === 'pit_sprung' && ned.where === 'in a pit', `a cooper who does not see it falls in ("${last(s)}")`);
  ok(s.law.wanted('c1'), 'a known man-trap in a town is a crime on its record');
  // A hunter sees a poorly covered one in time.
  s.map.setObject(X + 8, Y, O('pit_covered'));
  const q = s.pits.dig(X + 8, Y, s.game.time);
  q.covered = true;
  q.hide = 0;
  ned.p.trade = 'hunter';
  s.traps.personSteps(ned, X + 8, Y);
  ok(objAt(s, X + 8, Y) === 'pit_dug', 'a hunter spots a poorly covered pitfall and drags the cover off');
  s.dispose();
}

console.log('\npredators');
{
  const s = await play();
  const SX = X + 50;
  s.snares.set(SX, Y, s.game.time);
  s.snares.list[0].caught = 'hare';
  s.snares.list[0].tried = s.game.time;
  s.fauna.pin({ id: 'w:fox:0:fox:0', species: 'fox', members: [{ x: SX + 8, y: Y, z: null }], home: { x: SX + 8, y: Y, r: 10 }, water: null }, s.game);
  s.game.refresh();
  s.game.time += 120 * 3600;
  const sk = s.player!.get(Skills);
  s.snares.run(s.fauna, s.game, sk?.effective('trapping') ?? 0);
  const sn = s.snares.list[0];
  ok(!sn.caught && sn.robbed?.by === 'fox', `a hare left days in a snare is taken by a fox (${sn.robbed ? 'taken' : 'still there'})`);
  s.game.px = SX - 1;
  s.game.py = Y;
  s.game.move(1, 0);
  ok(/fox tracks/.test(s.hud.log.map((l) => l.text).join(' ')), 'and coming to the snare says so');
  s.dispose();
}

console.log('\nbait');
{
  const s = await play();
  const SX = X + 4, SY = Y;
  s.snares.set(SX, SY, s.game.time);
  give(s, 'raw_meat');
  give(s, 'apple', 2);
  const menu = ids(s, SX, SY);
  ok(menu.includes('baitmeat') && menu.includes('baitplant'), `a snare can be baited with meat or plant food (${menu.join(', ')})`);
  await s.field.act('baitplant', SX, SY);
  const sn = s.snares.at(SX, SY)!;
  ok(sn.bait?.kind === 'plant' && has(s, 'apple') === 1 && s.game.snareAt(SX, SY) === 'baited', 'baited with an apple, one used, and the snare marked so');
  ok(!ids(s, SX, SY).some((i) => i.startsWith('bait')), 'and not baited twice');
  s.dispose();
}
{
  // In sight: a hare smells the apple, comes to it, and is caught (or takes it and gets away).
  const s = await play();
  const SX = X + 25, SY = Y;
  s.snares.set(SX, SY, s.game.time);
  s.snares.at(SX, SY)!.bait = { def: 'apple', kind: 'plant', at: s.game.time };
  s.fauna.pin({ id: 'hunt:hare', species: 'hare', members: [{ x: SX + 8, y: SY + 2, z: null }], home: { x: SX + 8, y: SY + 2, r: 2 }, water: null }, s.game);
  s.game.refresh();
  const sk = s.player!.get(Skills)?.effective('trapping') ?? 0;
  let caught = false;
  for (let i = 0; i < 300 && !caught && s.snares.at(SX, SY)!.bait; i++) {
    s.game.time += 3;
    s.fauna.run(s.game, s.presence());
    caught = s.snares.run(s.fauna, s.game, sk).length > 0;
  }
  const sn = s.snares.at(SX, SY)!;
  ok(caught || !!sn.baitTaken, `a hare eight tiles off smells the apple and comes to it (${caught ? 'caught' : sn.baitTaken ? 'took the bait and got away' : 'never came'})`);
  s.dispose();
}
{
  // A fox at a snare baited with meat: the snare does not hold it, and it eats the bait.
  const s = await play();
  const SX = X + 25, SY = Y;
  s.snares.set(SX, SY, s.game.time);
  s.snares.at(SX, SY)!.bait = { def: 'raw_meat', kind: 'meat', at: s.game.time };
  s.fauna.pin({ id: 'hunt:fox', species: 'fox', members: [{ x: SX + 5, y: SY, z: null }], home: { x: SX + 5, y: SY, r: 2 }, water: null }, s.game);
  s.game.refresh();
  for (let i = 0; i < 300 && s.snares.at(SX, SY)!.bait; i++) {
    s.game.time += 3;
    s.fauna.run(s.game, s.presence());
    s.snares.run(s.fauna, s.game, 0);
  }
  const sn = s.snares.at(SX, SY)!;
  ok(!sn.bait && !sn.caught && sn.baitTaken?.by === 'fox', `a fox eats the meat from a snare too slight to hold it (${sn.baitTaken ? 'eaten' : 'untouched'})`);
  s.dispose();
}
{
  // Out of sight: bait draws a herd from beyond the snare's own reach; without it, nothing comes.
  const trial = async (baited: boolean) => {
    const s = await play();
    const SX = X + 60, SY = Y;
    s.snares.set(SX, SY, s.game.time);
    if (baited) s.snares.at(SX, SY)!.bait = { def: 'apple', kind: 'plant', at: s.game.time };
    s.fauna.pin({ id: 'w:bait:0:rabbit:0', species: 'rabbit', members: [{ x: SX + 16, y: SY, z: null }], home: { x: SX + 16, y: SY, r: 4 }, water: null }, s.game);
    s.game.refresh();
    s.game.time += 96 * 3600;
    s.snares.run(s.fauna, s.game, 30);
    const sn = s.snares.at(SX, SY)!;
    s.dispose();
    return sn;
  };
  const plain = await trial(false), bait = await trial(true);
  ok(!plain.caught && (!!bait.caught || !!bait.baitTaken), `a rabbit warren sixteen tiles off: nothing in four days unbaited; baited, ${bait.caught ? `a ${bait.caught} caught` : 'the bait taken'}`);
}
{
  // A roe deer smells apples on a covered pit, comes to them, and falls in.
  const s = await play();
  const PX = X + 30, PY = Y;
  s.map.setObject(PX, PY, O('pit_covered'));
  const p = s.pits.dig(PX, PY, s.game.time);
  p.covered = true;
  p.hide = 0.9;
  p.bait = { def: 'apple', kind: 'plant', at: s.game.time };
  s.fauna.pin({ id: 'hunt:roe', species: 'roe_deer', members: [{ x: PX + 9, y: PY + 1, z: null }], home: { x: PX + 9, y: PY + 1, r: 2 }, water: null }, s.game);
  s.game.refresh();
  for (let i = 0; i < 300 && objAt(s, PX, PY) !== 'pit_sprung'; i++) {
    s.game.time += 3;
    s.fauna.run(s.game, s.presence());
    s.traps.run();
  }
  ok(objAt(s, PX, PY) === 'pit_sprung' && s.fauna.at(PX, PY)?.s.id === 'roe_deer', 'a roe deer drawn by apples on a covered pit falls in');
  s.dispose();
}
{
  // Bait goes off.
  const s = await play();
  s.snares.set(X + 3, Y, s.game.time);
  s.snares.at(X + 3, Y)!.bait = { def: 'raw_meat', kind: 'meat', at: s.game.time };
  s.game.time += 4 * 86400;
  ok(s.game.snareAt(X + 3, Y) === 'set' && s.traps.baits(X + 3, Y, 5).length === 0, 'meat bait goes off after three days and draws no more');
  s.dispose();
}

console.log(failures ? `\n${failures} failed` : '\nall trap tests passed');
process.exit(failures ? 1 : 0);
