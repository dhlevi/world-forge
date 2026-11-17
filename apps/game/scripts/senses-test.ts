/**
 * The base senses, talk and opinions (docs/design/npcs.md, Stage 1 step 4): how loud a noise is
 * where it is heard (distance, walls, floors); tracks in soft ground, washed out by rain and read
 * by Tracking; opinions fading back to neutral, and kept in a save; what residents say.
 * npx tsx apps/game/scripts/senses-test.ts (exits non-zero on a failure).
 */
import { CHUNK } from '@worldforge/core/local/chunk';
import { G, O } from '@worldforge/core/local/tiles';
import { GameMap } from '../src/game/map';
import { heardLevel, hearingThreshold, readTracks, takesTracks, Tracks, directionWords, LOUD, type Noise } from '../src/world/senses';
import { Opinions, opinionWords } from '../src/world/opinions';
import { greeting, lineOf, tieLine } from '../src/world/talk';
import { Game, type Hud } from '../src/game/game';
import { makeSave, readSave } from '../src/game/save';
import type { ChunkData } from '../src/worker/protocol';
import type { Resident } from '../src/world/population';
import '../src/actors/cast';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

// A map: grass, a stone wall along x = 10 from y 0 to 20, a first floor (level 11) over x 30..40.
const N = CHUNK * CHUNK, at = (x: number, y: number) => y * CHUNK + x;
const map = new GameMap(() => {});
{
  const ground = new Uint8Array(N).fill(G('grass')), object = new Uint8Array(N), area = new Uint16Array(N);
  for (let y = 0; y <= 20; y++) object[at(10, y)] = O('wall_stone')!;
  for (let x = 0; x < 8; x++) ground[at(x, 30)] = G('mud');
  const first = { ground: new Uint8Array(N), object: new Uint8Array(N), area: new Uint16Array(N) };
  for (let y = 0; y < 10; y++) for (let x = 30; x <= 40; x++) first.ground[at(x, y)] = G('floor_boards');
  const c: ChunkData = { cx: 0, cy: 0, ground, object, area, areas: [''], elev: new Int16Array(N).fill(30), sites: [], roofs: [], layers: [{ z: 11, ...first }], ms: 0 };
  map.add(c);
}

console.log('noise');
const n = (x: number, y: number, loud: number, z: number | null = null): Noise => ({ x, y, z, loud, kind: 'work', by: 'r', what: 'hammering' });
const l1 = heardLevel(map, n(5, 5, 75), { x: 6, y: 5, z: null }), l2 = heardLevel(map, n(5, 5, 75), { x: 7, y: 5, z: null }), l8 = heardLevel(map, n(5, 5, 75), { x: 13, y: 5, z: null });
ok(Math.abs(l1 - 75) < 0.01 && Math.abs(l1 - l2 - 6.02) < 0.1, `about 6 quieter for each doubling of the distance (${l1.toFixed(1)}, ${l2.toFixed(1)})`);
const open8 = heardLevel(map, n(5, 25, 75), { x: 13, y: 25, z: null });
ok(Math.abs(open8 - l8 - 6) < 0.01, `a wall between takes 6 more off (${open8.toFixed(1)} in the open, ${l8.toFixed(1)} through the wall)`);
const up = heardLevel(map, n(32, 5, 75, 11), { x: 33, y: 5, z: null });
ok(up < 75 - 14, `a floor between takes 15 a level (${up.toFixed(1)})`);
ok(hearingThreshold(10) === 15 && hearingThreshold(14) < 15, 'keen ears hear quieter noises');
ok(heardLevel(map, n(5, 25, LOUD.stepHard), { x: 25, y: 25, z: null }) < hearingThreshold(10) && heardLevel(map, n(5, 25, LOUD.hammer), { x: 45, y: 25, z: null }) > hearingThreshold(10), 'a footstep is lost at 20 tiles; a smith\'s hammering carries 40');
ok(directionWords({ x: 0, y: 0 }, { x: 10, y: -10 }) === 'to the north-east' && directionWords({ x: 0, y: 0 }, { x: 1, y: 0 }) === 'close by', 'directions in words');

console.log('\ntracks');
ok(takesTracks(G('mud'), false) && !takesTracks(G('grass'), false) && takesTracks(G('grass'), true) && !takesTracks(G('cobbles'), true), 'mud always takes tracks; grass only wet; cobbles never');
const tr = new Tracks();
tr.add(3, 30, null, { t: 1000, by: 'a', kind: 'dwarf', dir: 'e' });
tr.add(3, 30, null, { t: 1200, by: 'b', kind: 'human', young: true, dir: 'e' });
tr.add(3, 30, null, { t: 1300, by: 'player', kind: 'human', dir: 'w' });
ok(tr.at(3, 30, null, 2000).length === 3 && tr.at(3, 30, 11, 2000).length === 0, 'tracks lie on their own floor');
ok(readTracks(tr.at(3, 30, null, 2000), 2000, 0) === 'Footprints in the ground.', 'no Tracking: footprints, nothing more');
const r50 = readTracks(tr.at(3, 30, null, 2000), 2000, 50)!;
ok(/3 walkers/.test(r50) && /east/.test(r50) && /your own/.test(r50) && /a dwarf/.test(r50) && /a child/.test(r50), `a tracker reads how many, which way, and whose ("${r50}")`);
ok(tr.at(3, 30, null, 1000 + 3 * 86400).length === 0, 'tracks fade in two days');
tr.weather(1300 + 7200, true);
ok(tr.size === 0, 'rain washes out tracks older than an hour');
tr.add(1, 30, null, { t: 5000, by: 'a', kind: 'human', dir: 'n' });
const tr2 = new Tracks();
tr2.import(JSON.parse(JSON.stringify(tr.export())));
ok(tr2.at(1, 30, null, 5100).length === 1 && tr2.at(1, 30, null, 5100)[0].dir === 'n', 'tracks are kept in a save');

console.log('\nopinions');
const ops = new Opinions();
const D = 86400;
ops.add('a', 'Aldo', 'spoke civilly', 20, 0, 5);
ok(Math.abs(ops.of('a', 0) - 20) < 1e-9 && Math.abs(ops.of('a', 5 * D) - 10) < 1e-9, 'a cause fades by half in its half-life');
ok(ops.of('a', 60 * D) < 0.01 && ops.of('nobody', 0) === 0, 'and in time the opinion is back to neutral; strangers are neutral');
ops.add('a', 'Aldo', 'jostled me', -1, D, 1);
ops.add('a', 'Aldo', 'jostled me', -1, D + 60, 1);
ok(ops.recent('a', 'jostled me', D + 100, 600) === 2, 'how often lately');
ops.prune(90 * D);
ok(ops.knows('a') && ops.causes('a', 90 * D).length === 0, 'faded causes are let go, the meeting remembered');
ops.add('b', 'Brena', 'saved my life', 80, 0, 60);
const back = new Opinions();
back.import(JSON.parse(JSON.stringify(ops.export())));
ok(Math.abs(back.of('b', 10 * D) - ops.of('b', 10 * D)) < 1e-9 && back.knows('a'), 'opinions are kept in a save');
ok(opinionWords(50) === 'warmly disposed toward you' && opinionWords(-50) === 'hostile toward you' && opinionWords(0).startsWith('neither'), 'opinions in words');

// The save carries both.
{
  const g = new Game(map, [2, 2], [], 'the test', { place: '', where: '', clock: '', log: [], look: [], mode: 'play', loading: 0 } as Hud);
  const s = readSave(JSON.stringify(makeSave(g, { id: 's', settings: { seed: 'x' } as never, siteId: 'a', siteName: 'A', people: { opinions: ops.export(), tracks: tr.export() } })));
  const o2 = new Opinions();
  o2.import(s.people?.opinions);
  ok(!!s.people && o2.knows('b') && s.people.tracks.length === 1, 'a saved game keeps the people\'s opinions and the tracks');
}

console.log('\ntalk');
const resident = (o: Partial<Resident['p']> = {}, r: Partial<Resident> = {}): Resident => ({
  p: { id: 'x', name: 'Aldo Venn', given: 'Aldo', female: false, age: 40, culture: 0, people: 'the folk', trade: 'smith', role: 'head', traits: [], means: 'middling', household: 'h', homeId: 'b',
    ties: [{ kind: 'friend', text: 'Old friends with Brena Holt (baker), next door to the east.' }], template: 'craft', day: 0, plan: [], home: { x: 0, y: 0, z: null }, at: null, facing: 's',
    look: { kind: 'human', skin: '#fff', hair: '#000', hairStyle: 'short', beard: 'none', cloth: ['#111111', '#222222', '#333333'] }, ...o },
  where: 'work', stop: { from: 8, to: 17, act: 'work', place: 'work', at: null }, ...r,
} as Resident);
ok(tieLine('friend', 'Old friends with Brena Holt (baker), next door to the east.') === 'Brena Holt, the baker next door to the east, is an old friend of mine.', 'a tie in their own words');
ok(/the dead pig/.test(tieLine('feud', 'In a bitter feud with Cobb Fenn (tanner), across the way to the north, over the dead pig.') ?? ''), 'a feud names its cause');
const kinds = ['friend', 'rival', 'owes', 'owed', 'feud', 'sweetheart', 'kin', 'partner'];
ok(kinds.every((k) => !!tieLine(k, 'At odds with Cobb Fenn (tanner), across the way to the north.')), 'every kind of tie can be told');
ok(greeting(resident(), -50, true, 9, 'Wen') === 'What do you want?' && greeting(resident(), 50, true, 9, 'Wen').startsWith('Wen!') && /stranger/.test(greeting(resident(), 0, false, 20, 'Wen')), 'greetings by opinion and acquaintance');
ok(lineOf(resident(), 3, 0, false) === lineOf(resident(), 3, 0, false), 'what is said is the same for the same day and asking');
ok(lineOf(resident({}, { where: 'walking', stop: { from: 9, to: 10, act: 'errand', place: 'market', at: null } }), 3, 0, false).includes('market'), 'one on the way says where they are going');
const lines = new Set(Array.from({ length: 12 }, (_, i) => lineOf(resident(), 3, i, false)));
ok(lines.size >= 3, `a smith at work has several things to say (${lines.size})`);
ok([...lines].every((l) => !/n't|'re|'ll|'ve|'m\b/.test(l)), 'in plain words, without contractions');

console.log(failures ? `\n${failures} failed` : '\nall senses tests passed');
process.exit(failures ? 1 : 0);
