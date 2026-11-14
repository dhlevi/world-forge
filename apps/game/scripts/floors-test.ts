/**
 * Floors above and below the ground (game/map.ts, game/game.ts) on a made-up house: a ground
 * floor with a stair up and a stair down, a first floor above it and a cellar below, each walled
 * with a window. Going up and down the stairs, walking only on a floor's own tiles, seeing out of
 * a window to the ground below, doors and things left on a floor kept apart from the ground's,
 * and a game saved upstairs coming back upstairs.
 * npx tsx apps/game/scripts/floors-test.ts (exits non-zero on a failure).
 */
import { CHUNK } from '@worldforge/core/local/chunk';
import { G, O } from '@worldforge/core/local/tiles';
import { Game, STAIRS_S, type Hud } from '../src/game/game';
import { GameMap } from '../src/game/map';
import { applySave, makeSave, readSave } from '../src/game/save';
import type { ChunkData } from '../src/worker/protocol';
import { ITEM } from '../src/actors/items/defs';
import '../src/actors/cast';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

// The ground at 30 m (level 10). The house: walls round x 4..10, y 4..10; the stairwell at (6, 6) up and (7, 6) down.
const N = CHUNK * CHUNK, at = (x: number, y: number) => y * CHUNK + x;
const house = (fill: (x: number, y: number) => [number, number] | null) => {
  const ground = new Uint8Array(N), object = new Uint8Array(N), area = new Uint16Array(N);
  for (let y = 4; y <= 10; y++) for (let x = 4; x <= 10; x++) {
    const t = fill(x, y);
    if (!t) continue;
    ground[at(x, y)] = t[0];
    object[at(x, y)] = t[1];
    area[at(x, y)] = 1;
  }
  return { ground, object, area };
};
const wall = (x: number, y: number) => x === 4 || x === 10 || y === 4 || y === 10;
const groundFloor = house((x, y) => [G('floor_boards'), wall(x, y) ? (x === 7 && y === 10 ? O('door')! : O('wall_plank')!) : x === 6 && y === 6 ? O('stairs_up')! : x === 7 && y === 6 ? O('stairs_down')! : 0]);
const first = house((x, y) => [G('floor_boards'), wall(x, y) ? (x === 10 && y === 7 ? O('window')! : O('wall_plank')!) : x === 6 && y === 6 ? O('stairs_down')! : 0]);
const cellar = house((x, y) => [G('floor_earth'), wall(x, y) ? O('wall_stone')! : x === 7 && y === 6 ? O('stairs_up')! : 0]);
const map = new GameMap(() => {});
for (let cy = -1; cy <= 1; cy++) for (let cx = -1; cx <= 1; cx++) {
  const home = cx === 0 && cy === 0;
  const ground = new Uint8Array(N).fill(G('grass')), object = new Uint8Array(N), area = new Uint16Array(N);
  if (home) for (let k = 0; k < N; k++) if (groundFloor.ground[k]) {
    ground[k] = groundFloor.ground[k];
    object[k] = groundFloor.object[k];
    area[k] = 1;
  }
  const c: ChunkData = {
    cx, cy, ground, object, area, areas: ['', 'House: hall', 'House, first floor: bedroom', 'House, cellar: store'], elev: new Int16Array(N).fill(30), sites: [], roofs: [], ms: 0,
    layers: home ? [{ z: 9, ...cellar, area: cellar.area.map((a) => (a ? 3 : 0)) }, { z: 11, ...first, area: first.area.map((a) => (a ? 2 : 0)) }] : [],
  };
  map.add(c);
}
const hud: Hud = { place: '', where: '', clock: '', log: [], look: [], mode: 'play', loading: 0 };
const g = new Game(map, [6, 6], [], 'the test', hud);
const last = () => hud.log[hud.log.length - 1].text;

// ---- Up the stairs ---------------------------------------------------------------------------------
ok(g.z === null && g.level === 10 && !!g.stairsHere(true) && !g.stairsHere(false), 'on the ground floor, standing on a stair up');
const t = g.time;
ok(g.climbStairs(true) && g.z === 11 && g.level === 11, `up the stairs to the first floor ("${last()}")`);
ok(Math.abs(g.time - t - STAIRS_S) < 1e-9, 'a flight of stairs takes its time');
ok(/first floor/.test(last()) && /first floor/.test(map.tile(g.px, g.py)?.area ?? ''), 'the floor named, and its rooms');
ok(!g.climbStairs(true) && g.z === 11, 'no stair up here: nowhere to go');

// ---- Walking a floor -------------------------------------------------------------------------------
g.move(1, 0);
ok(g.px === 7 && g.z === 11, 'walking across the first floor');
ok(!map.passable(11, 7) && !map.passableAt(3, 6, 11), 'no walking out on the open air beside a floor');
g.refresh();
ok(g.isVisible(9, 7) && g.isVisible(12, 7), 'out of the window, the ground below is seen');
ok(map.wasSeenAt(12, 7, null) && !map.wasSeenAt(12, 7, 11), 'and remembered as the ground, not as the floor');
ok(map.wasSeenAt(8, 8, 11) && !map.wasSeenAt(8, 8, null), 'the floor seen is remembered as the floor, not the ground floor under it');
ok(g.describe(12, 7)[0] === 'Open air.', `looking past the floor's edge: "${g.describe(12, 7).join(' ')}"`);

// ---- What is changed or left on a floor stays on it --------------------------------------------------
const knife = [...ITEM.keys()][0];
g.ground.put(8, 8, [{ uid: 'u1', def: knife, qty: 1 } as never]);
ok(g.ground.has(8, 8) && g.ground.hasAt(8, 8, 11) && !g.ground.hasAt(8, 8, null), 'a thing left on the first floor lies there, not on the ground floor');
map.setObject(10, 7, 0);
ok(map.objectAt(10, 7, 11) === 0 && map.objectAt(10, 7, null) === O('wall_plank'), 'a change on a floor leaves the ground floor as it was');

// ---- Saved upstairs ------------------------------------------------------------------------------------
const save = readSave(JSON.stringify(makeSave(g, { id: 'f', settings: { seed: 'x' } as never, siteId: 's', siteName: 'S' })));
ok(save.player.z === 11 && save.floors.changes.length === 1 && save.floors.ground.length === 1 && save.ground.length === 0, 'a game saved upstairs keeps the floor, its changes and its things apart');
const map2 = new GameMap(() => {});
const g2 = new Game(map2, [0, 0], [], 'the test', { ...hud, log: [] });
applySave(g2, save);
ok(g2.z === 11 && map2.floor === 11 && g2.ground.floor === 11 && map2.objectAt(10, 7, 11) === 0 && g2.ground.hasAt(8, 8, 11), 'and loads back on the same floor');

// ---- Down to the cellar --------------------------------------------------------------------------------
g.move(-1, 0);
ok(g.px === 6 && !!g.stairsHere(false), 'back on the stair down');
ok(g.climbStairs(false) && g.z === null && g.level === 10, `down to the ground floor: on the ground again ("${last()}")`);
g.move(1, 0);
ok(g.climbStairs(false) && g.z === 9 && /cellar/.test(last()), `down the other flight to the cellar ("${last()}")`);
g.refresh();
ok(!g.isVisible(12, 7) && !map.transparentAt(3, 6, 9), 'in the cellar, the earth all round: nothing beyond its walls is seen');
ok(g.climbStairs(true) && g.z === null, 'and up again to the ground floor');

if (failures) {
  console.log(`${failures} failed`);
  process.exit(1);
}
console.log('all floor tests passed');
