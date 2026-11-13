/**
 * The tileset's index (game/tileset-format.ts) and the decorations (game/decor.ts): every form a
 * frame may be given in, animations, stand-ins, what is refused, and where decorations lie.
 * npx tsx apps/game/scripts/tileset-test.ts (exits non-zero on a failure).
 */
import { DECOR, G, GROUND_TILES, OBJECT_TILES } from '@worldforge/core/local/tiles';
import { readTileset, type FrameLayer } from '../src/game/tileset-format';
import { decorAt } from '../src/game/decor';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

const layers = new Map<string, FrameLayer>([
  ...GROUND_TILES.map((d) => [d.name, 'ground'] as const),
  ...OBJECT_TILES.map((d) => [d.name, 'object'] as const),
  ...DECOR.map((d) => [d.name, 'decor'] as const),
]);
const read = (json: unknown) => readTileset(json, (n) => layers.get(n));

// ---- The registry -------------------------------------------------------------------------------
const names = [...GROUND_TILES, ...OBJECT_TILES].map((d) => d.name);
ok(layers.size === names.length + DECOR.length, 'every tile and decoration has a name of its own (one layer each)');

// ---- The first format: one sheet, [column, row] --------------------------------------------------
const old = read({ tileSize: 16, image: 'tileset.png', tiles: { grass: [0, 0], 'grass.1': [1, 0], 'wall_stone#5': [2, 3], bedroll: [4, 4] } });
const f = (key: string, v = 0) => old.frames.find((x) => x.key === key && x.variant === v);
ok(f('ground:grass')?.pictures[0].x === 0 && f('ground:grass', 1)?.pictures[0].x === 16, 'the first format still reads: a name and its variants');
ok(f('object:wall_stone#5')?.pictures[0].y === 48, 'join frames are read with their mask');
ok(!!f('object:bedroll'), 'the camp things are objects (no longer listed as ground as well)');
ok(old.warnings.length === 0 && old.sheets[''] === 'tileset.png', 'no warnings, and the default sheet');

// ---- Several sheets, sizes, offsets, animation -----------------------------------------------------
const idx = read({
  tileSize: 16,
  sheets: { nature: 'nature.png', water: 'water.png' },
  tiles: {
    tree_broadleaf: { sheet: 'nature', at: [2, 0], size: [2, 3] },
    boulder: { sheet: 'nature', rect: [0, 64, 20, 18], offset: [-2, -2] },
    'water_shallow#15': { sheet: 'water', at: [0, 0], frames: 4, ms: 150 },
    campfire: { at: [[0, 5], [1, 5], [3, 5]] },
    'river.2': { sheet: 'water', at: [0, 2], frames: 3, step: [0, 1] },
    pebbles: { sheet: 'nature', at: [6, 6] },
  },
});
const g = (key: string, v = 0) => idx.frames.find((x) => x.key === key && x.variant === v)!;
const tree = g('object:tree_broadleaf').pictures[0];
ok(tree.sheet === 'nature' && tree.x === 32 && tree.w === 32 && tree.h === 48, 'a picture of 2 × 3 cells on a named sheet');
ok(tree.dx === -8 && tree.dy === -32, 'a large picture stands on its tile: centred across it, rising above');
const b = g('object:boulder').pictures[0];
ok(b.w === 20 && b.h === 18 && b.dx === -2 && b.dy === -2, 'a rectangle in pixels, with its own offset');
const w = g('ground:water_shallow#15');
ok(w.pictures.length === 4 && w.pictures[3].x === 48 && w.ms === 150, 'an animation laid out in a row, with its timing');
ok(g('object:campfire').pictures.map((p) => p.x).join() === '0,16,48' && g('object:campfire').ms === 200, 'an animation from a list of cells');
ok(g('ground:river', 2).pictures.map((p) => p.y).join() === '32,48,64', 'an animation laid out down a column (step)');
ok(g('decor:pebbles').pictures[0].sheet === 'nature', 'decorations are read too');

// ---- Stand-ins ------------------------------------------------------------------------------------
const st = read({ tiles: { grass: [0, 0] }, standIns: { grass_lush: 'grass', needle_floor: { as: 'forest_floor', tint: '#e0d0b0' }, nothing: 'grass' } });
ok(st.standIns.length === 2 && st.standIns[1].tint === 0xe0d0b0 && st.standIns[0].tint === 0xffffff, 'stand-ins, with or without a tint');
ok(st.warnings.some((x) => x.includes('nothing')), 'a stand-in for no tile is refused');

// ---- What is refused ---------------------------------------------------------------------------------
const bad = read({ tiles: { gras: [0, 0], grass: 'x', rock: { sheet: 'missing', at: [0, 0] }, sand: { sheet: '' }, dirt: { rect: [0, 0, 0, 16] } } });
ok(bad.frames.length === 0 && bad.warnings.length === 5, `five mistakes, five warnings, nothing read (${bad.warnings.join('; ')})`);

// ---- Decorations ----------------------------------------------------------------------------------
const grass = G('grass'), forest = G('forest_floor'), deep = G('water_deep');
const count = (ground: number, season: Parameters<typeof decorAt>[3], name?: string) => {
  let n = 0;
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
    const d = decorAt(ground, x, y, season);
    if (d && (!name || d.name === name)) n++;
  }
  return n / 40_000;
};
const tufts = count(grass, 'summer', 'grass_tuft');
ok(Math.abs(tufts - 0.14) < 0.01, `tufts lie on about the share of grass asked for (${(tufts * 100).toFixed(1)}%)`);
ok(count(grass, 'winter', 'wildflowers') === 0 && count(grass, 'summer', 'wildflowers') > 0.04, 'flowers in summer, none in winter');
ok(count(forest, 'autumn', 'toadstools') > 0.02 && count(forest, 'spring', 'toadstools') === 0, 'toadstools in autumn only');
ok(count(deep, 'summer') === 0, 'nothing lies on deep water');
ok(decorAt(grass, 12, -40, 'summer') === decorAt(grass, 12, -40, 'summer'), 'a place keeps its decoration');
ok(decorAt(grass, 12, -40, 'winter') === null || decorAt(grass, 12, -40, 'winter') === decorAt(grass, 12, -40, 'summer'), 'and only loses it, never changes it, with the season');

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
if (failures) process.exitCode = 1;
