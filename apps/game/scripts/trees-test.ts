/**
 * Trees across levels (core local/trees.ts, game/trees.ts): shapes by kind and age, the parts on
 * each level, wide trunks in the generator, and how a screen of trees is laid out for drawing.
 * npx tsx apps/game/scripts/trees-test.ts (exits non-zero on a failure).
 */
import { CHUNK } from '@worldforge/core/local/chunk';
import { G, O, OBJECT_TILES } from '@worldforge/core/local/tiles';
import { TREE_KINDS, treeKind, treePartAt, treeShape, widenTrunks } from '@worldforge/core/local/trees';
import { GameMap } from '../src/game/map';
import { Game, type Hud } from '../src/game/game';
import { TreeView, treeAt, treeWords } from '../src/game/trees';
import type { ChunkData } from '../src/worker/protocol';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};
const kind = (name: string) => treeKind(`tree_${name}`)!;

// ---- Shapes ---------------------------------------------------------------------------------------
ok(TREE_KINDS.every((k) => OBJECT_TILES.some((o) => o.name === k.object)), 'every tree kind is a tile');
const s = treeShape(kind('broadleaf'), 40, -12);
ok(JSON.stringify(s) === JSON.stringify(treeShape(kind('broadleaf'), 40, -12)), 'a tree at a place always has the same shape');
const ages = { young: 0, grown: 0, old: 0 };
let tallest = 0, lowest = 99;
for (let i = 0; i < 2000; i++) {
  const t = treeShape(kind('broadleaf'), i * 7, i * 13);
  ages[t.ageWord]++;
  tallest = Math.max(tallest, t.heightM);
  lowest = Math.min(lowest, t.heightM);
  if (t.reach.length !== t.levels + 1) failures++;
}
console.log(`  broadleaf of 2000: ${ages.young} young, ${ages.grown} grown, ${ages.old} old; ${lowest} to ${tallest} m`);
ok(ages.young > 300 && ages.old > 150 && ages.grown > 1000, 'young, grown and old trees');
ok(lowest >= 6 && tallest <= 30, 'heights as the kind says, less for the young');
const cone = treeShape(kind('conifer'), 3, 3);
ok(cone.reach[cone.levels] < cone.reach[Math.ceil(cone.levels * 0.3)], `a conifer narrows upward (${cone.reach.join(' ')})`);
const palm = treeShape(kind('palm'), 5, 9);
ok(palm.reach.slice(1, -1).every((r) => r <= 1) && palm.reach[palm.levels] >= 1.5, `a palm's fronds are at the top (${palm.reach.join(' ')})`);

// ---- Parts on each level -----------------------------------------------------------------------------
ok(treePartAt(s, 40, -12, false, 1, 0, 0) === 'trunk' && treePartAt(s, 40, -12, false, s.levels, 0, 0) === 'leaves', 'the trunk rises to the level below the top, which is leaves');
ok(treePartAt(s, 40, -12, false, 0, 0, 0) === null && treePartAt(s, 40, -12, false, s.levels + 1, 0, 0) === null, 'nothing on the ground (the map has the trunk) or above the top');
ok(treePartAt(s, 40, -12, true, 1, 1, 1) === 'trunk' && treePartAt(s, 40, -12, false, 1, 1, 1) !== 'trunk', 'a wide trunk fills four tiles');
let leaves = 0, branches = 0;
for (let level = 1; level <= s.levels; level++) for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
  const p = treePartAt(s, 40, -12, false, level, dx, dy);
  if (p === 'leaves') leaves++;
  if (p === 'branch') branches++;
}
ok(leaves > 20 && branches > 0, `a crown of leaves with branches in it (${leaves} leaves, ${branches} branches)`);
const dead = treeShape(kind('dead'), 1, 2);
let deadLeaves = 0;
for (let level = 1; level < dead.levels; level++) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (treePartAt(dead, 1, 2, false, level, dx, dy) === 'leaves') deadLeaves++;
ok(deadLeaves === 0, 'a dead tree has no leaves');

// ---- Wide trunks in the generator --------------------------------------------------------------------
// Find old broadleaf trees that would be wide, and plant them on a small plot.
const wideAt: [number, number][] = [];
for (let y = 0; y < 60 && wideAt.length < 3; y += 3) for (let x = 0; x < 60 && wideAt.length < 3; x += 3) if (treeShape(kind('broadleaf'), x, y).wide) wideAt.push([x, y]);
const size = 64, plot = new Uint8Array(size * size);
for (const [x, y] of wideAt) plot[y * size + x] = O('tree_broadleaf');
const [bx, by] = wideAt[1];
plot[by * size + bx + 1] = O('boulder');
widenTrunks(plot, size, 0, 0, O, (id) => OBJECT_TILES[id].name, (k) => plot[k] === 0);
const isPart = (x: number, y: number) => plot[y * size + x] === O('tree_trunk');
ok(isPart(wideAt[0][0] + 1, wideAt[0][1]) && isPart(wideAt[0][0], wideAt[0][1] + 1) && isPart(wideAt[0][0] + 1, wideAt[0][1] + 1), 'an old tree with room gets a trunk two tiles across');
ok(!isPart(bx, by + 1), 'one without room (a boulder beside it) keeps its one tile');

// ---- A screen of trees ----------------------------------------------------------------------------------
const [wx, wy] = wideAt[0];
const map = new GameMap(() => {});
for (let cy = -1; cy <= 1; cy++) for (let cx = -1; cx <= 1; cx++) {
  const N = CHUNK * CHUNK, object = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    const x = cx * CHUNK + (k % CHUNK), y = cy * CHUNK + Math.floor(k / CHUNK);
    if (x >= 0 && y >= 0 && x < size && y < size) object[k] = plot[y * size + x];
  }
  const c: ChunkData = { cx, cy, ground: new Uint8Array(N).fill(G('grass')), object, area: new Uint16Array(N), areas: [''], elev: new Int16Array(N).fill(30), sites: [], roofs: [], ms: 0 };
  map.add(c);
}
const t = treeAt(map, wx + 1, wy + 1)!;
ok(!!t && t.x === wx && t.y === wy && t.wide, 'the tree is found from any tile of its wide trunk');
ok(/^an old broadleaf tree, about \d+ m tall, its trunk two paces across$/.test(treeWords(t)), `told in words: "${treeWords(t)}"`);
const x0 = wx - 10, y0 = wy - 10, W = 22;
const ground = new TreeView(map, x0, y0, W, W, null);
const i = (x: number, y: number) => (y - y0) * W + (x - x0);
ok(ground.quarter[i(wx, wy)] === 1 && ground.quarter[i(wx + 1, wy + 1)] === 4, 'the trunk is drawn in quarters');
ok(ground.roots[i(wx, wy - 1)] === 4 && ground.roots[i(wx - 1, wy)] === 2, 'roots reach in from the trunk\'s side');
const shaded = ground.shade.reduce((n, v) => n + v, 0);
ok(shaded > 10, `the ground under the leaves is in shade (${shaded} tiles)`);
const top = 10 + t.shape.levels;
const slice = new TreeView(map, x0, y0, W, W, top);
ok(slice.part[i(wx, wy)] === 1, 'at the top level, leaves over the trunk');
const mid = new TreeView(map, x0, y0, W, W, 11);
ok(mid.part[i(wx, wy)] === 3 && mid.part[i(wx + 1, wy + 1)] === 3, 'a level up, the trunk');
let joined = 0;
for (let k = 0; k < W * W; k++) if (slice.part[k] === 1 && slice.mask(k)) joined++;
ok(joined > 0, 'leaves join their neighbours');
const hud: Hud = { place: '', where: '', clock: '', log: [], look: [], mode: 'play', loading: 0 };
const g = new Game(map, [wx - 2, wy], [], 'the test', hud);
g.refresh();
ok(/^An old broadleaf tree, about \d+ m tall/.test(g.describe(wx, wy)[0]), `looking at it: "${g.describe(wx, wy)[0]}"`);
g.px = wx + 2;
g.refresh();
ok(/^The trunk of an old broadleaf tree/.test(g.describe(wx + 1, wy)[0]), `and at the rest of its trunk: "${g.describe(wx + 1, wy)[0]}"`);

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
if (failures) process.exitCode = 1;
