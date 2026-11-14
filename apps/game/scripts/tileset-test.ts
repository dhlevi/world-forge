/**
 * The tileset's index (game/tileset-format.ts) and the decorations (game/decor.ts): every form a
 * frame may be given in, animations, stand-ins, what is refused, and where decorations lie.
 * npx tsx apps/game/scripts/tileset-test.ts (exits non-zero on a failure).
 */
import { DECOR, FACINGS, FIGURES, G, GROUND_TILES, O, OBJECT_TILES, TERRAINS, joinsWith, standsTall } from '@worldforge/core/local/tiles';
import { lookKeys, readTileset, type FrameLayer } from '../src/game/tileset-format';
import { decorAt } from '../src/game/decor';
import { TERRAIN_OF, blendsAt, edgeInside } from '../src/game/terrain';
import { TREE_KINDS } from '@worldforge/core/local/trees';
import { ROOF_MATERIALS, ROOF_PLANES } from '@worldforge/core/local/roofs';
import { TREE_FRAMES } from '../src/game/tileset';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

const layers = new Map<string, FrameLayer>([
  ...GROUND_TILES.map((d) => [d.name, 'ground'] as const),
  ...OBJECT_TILES.map((d) => [d.name, 'object'] as const),
  ...DECOR.map((d) => [d.name, 'decor'] as const),
  ...TERRAINS.map((t) => [`edge_${t.name}`, 'edge'] as const),
  ...TREE_KINDS.flatMap((k) => TREE_FRAMES.map((f) => [`${f}_${k.name}`, 'tree'] as const)),
  ...FIGURES.flatMap((f) => FACINGS.flatMap((d) => [[`${f.name}_${d}`, 'figure'] as const, [`${f.name}_walk_${d}`, 'figure'] as const])),
  ...Object.keys(ROOF_MATERIALS).flatMap((m) => ROOF_PLANES.map((pl) => [`roof_${m}_${pl}`, 'roof'] as const)),
]);
const read = (json: unknown) => readTileset(json, (n) => layers.get(n));

// ---- The registry -------------------------------------------------------------------------------
const names = [...GROUND_TILES, ...OBJECT_TILES].map((d) => d.name);
ok(layers.size === names.length + DECOR.length + TERRAINS.length + TREE_KINDS.length * TREE_FRAMES.length + FIGURES.length * FACINGS.length * 2 + Object.keys(ROOF_MATERIALS).length * ROOF_PLANES.length, 'every tile, decoration, terrain edge, tree part, figure frame and roof plane has a name of its own (one layer each)');
const walk = read({ tiles: { person_walk_e: { at: [0, 8], frames: 4, ms: 90 }, person_e: [0, 9] } });
ok(walk.frames.find((f) => f.key === 'figure:person_walk_e')?.pictures.length === 4 && walk.warnings.length === 0, 'a figure\'s walk is an animation like any other');

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

// ---- Seasons ------------------------------------------------------------------------------------------
const sea = read({ tiles: { grass: [0, 0], 'grass@winter': [1, 0], 'grass@snow.1': [2, 0], 'leaves_broadleaf@autumn#5': [3, 0], 'grass@monsoon': [4, 0] } });
const keys = sea.frames.map((f) => `${f.key}/${f.variant}`);
ok(keys.includes('ground:grass@winter/0') && keys.includes('ground:grass@snow/1') && keys.includes('tree:leaves_broadleaf@autumn#5/0'), `frames for a season or snow, with variants and joins (${keys.join(', ')})`);
ok(sea.warnings.some((w) => w.includes('monsoon')), 'an unknown season is refused');
ok(lookKeys('ground', 'grass', -1, ['snow', 'winter']).join() === 'ground:grass@snow,ground:grass@winter,ground:grass', 'snow lying first, then the season, then the plain frame');
ok(lookKeys('tree', 'leaves_birch', 5, ['autumn']).join() === 'tree:leaves_birch@autumn#5,tree:leaves_birch@autumn,tree:leaves_birch#5,tree:leaves_birch', 'a join: the season\'s join frame, its one picture, then the plain ones');

// ---- Walls, doors and furniture (top-down) ---------------------------------------------------------------
const obj = (n: string) => OBJECT_TILES[O(n)];
ok(joinsWith(obj('wall_stone'), obj('door')) && joinsWith(obj('window'), obj('wall_timber')), 'doors and windows join the walls they stand in');
ok(joinsWith(obj('gate'), obj('fence')) && joinsWith(obj('fence'), obj('gate')) && joinsWith(obj('gate_open'), obj('palisade')), 'a gate joins town walls, palisades and fences (either way round)');
ok(!joinsWith(obj('fence'), obj('wall_stone')) && !joinsWith(obj('bed'), obj('table')), 'other things do not join');
ok(['bed', 'bench', 'pew', 'table', 'trestle', 'counter', 'workbench', 'shelf', 'rug', 'bookcase'].every((n) => obj(n).join === 'mask4' && joinsWith(obj(n), obj(n))), 'long furniture joins its own kind (a bed two tiles long, a long table)');
ok(standsTall(obj('wall_brick')) && standsTall(obj('window')) && standsTall(obj('hedge')) && standsTall(obj('wardrobe')), 'walls, windows, hedges and wardrobes stand tall (and cast shadows)');
ok(!standsTall(obj('table')) && !standsTall(obj('tree_broadleaf')) && !standsTall(obj('tree_trunk')), 'tables and trees do not (trees stand across levels)');

// ---- Ground edges -----------------------------------------------------------------------------------
const T = (n: string) => TERRAIN_OF[G(n)];
ok(T('grass') > T('dirt') && T('dirt') > T('sand') && T('sand') > T('water_shallow') && T('snow') > T('grass'), 'grass spreads over earth, earth over sand, sand over water, snow over all');
ok(T('cobbles') === -1 && T('floor_boards') === -1 && T('road') === T('dirt'), 'paving and floors keep straight edges; roads are earth');
const unplaced = GROUND_TILES.filter((d) => d.name !== 'void' && TERRAIN_OF[G(d.name)] === -1).map((d) => d.name);
console.log(`  straight-edged ground: ${unplaced.join(', ')}`);
const g4 = T('grass'), e4 = T('dirt'), s4 = T('sand');
ok(blendsAt([e4, e4, e4, e4], [3, 3, 3, 3]).length === 0, 'one kind of ground: no edges');
const one = blendsAt([g4, e4, e4, e4], [3, 3, 3, 3]);
ok(one.length === 1 && one[0].terrain === g4 && one[0].mask === 1 && one[0].from === 0, 'grass in one corner: its edge, frame 1 (north-west)');
const three = blendsAt([g4, e4, s4, s4], [3, 3, 3, 3]);
ok(three.length === 2 && three[0].terrain === e4 && three[0].mask === 3 && three[1].terrain === g4 && three[1].mask === 1, 'three kinds: earth over sand (north-west and north-east), then grass over both');
ok(blendsAt([g4, e4, e4, e4], [3, 3, 4, 3]).length === 0, 'no edges across a change of level');
ok(blendsAt([g4, e4, T('cobbles'), e4], [3, 3, 3, 3]).length === 0, 'none beside paving');
// Made edges: whole where the terrain has every corner along a side, and meeting their neighbours.
let seam = 0;
for (let m = 1; m <= 14; m++) for (let v = 0; v < 3; v++) for (let i = 0; i < 16; i++) {
  // Along the cell's west side, only the north-west and south-west corners count: the same line
  // as the east side of the cell beside it, whose north-east and south-east corners they are.
  const west = edgeInside(m, 0, i, v) > 0, east = edgeInside(((m & 1) << 1) | ((m & 8) >> 1), 15, i, (v + 1) % 3) > 0;
  if (Math.abs(edgeInside(m, 0, i, v) - edgeInside(((m & 1) << 1) | ((m & 8) >> 1), 15, i, (v + 1) % 3)) > 0.1 && west !== east) seam++;
}
ok(seam === 0, `made edges meet the cell beside them, whatever the variants (${seam} mismatches)`);
let inside = 0;
for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (edgeInside(1, x, y, 0) > 0) inside++;
ok(inside > 20 && inside < 110, `frame 1 covers about a quarter of the cell (${inside} of 256 pixels)`);

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
if (failures) process.exitCode = 1;
