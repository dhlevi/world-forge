/**
 * The tile registry: every tile the local map (local/chunk.ts) can place, with how it behaves
 * in play and what its art should show. It is the single source of truth for the tile list:
 * the game's placeholder art is drawn from it, a tileset's frames are matched to it by name,
 * and TILESET.md (scripts/tileset-doc.ts) is generated from it.
 *
 * A tile is 1.5 m square (the floor-plan cell, interiors/dwelling.ts). Each map position has a
 * ground tile and, optionally, an object tile on top (a wall, a door, a tree, a bed).
 *
 * Ids are positions in these lists, kept per layer and below 256 (chunks store them as bytes).
 * New tiles go at the end of their list, so saved maps keep their meaning.
 */

export type TileLayer = 'ground' | 'object';

/**
 * How a tile's art joins its neighbours:
 * - none: one picture (variants, if any, are chosen at random per position);
 * - mask4: 16 frames by which of the four sides (N, E, S, W) join a tile of the same group
 *   (walls, fences, hedges, water edges).
 */
export type TileJoin = 'none' | 'mask4';

export interface TileDef {
  /** Stable name: the key a tileset uses for the tile's frame. */
  name: string;
  layer: TileLayer;
  /** What the art should show (for TILESET.md and the artist). */
  art: string;
  /** Shown when the player looks at the tile. */
  look: string;
  /** Can be walked through (ground: can be stood on). */
  pass: boolean;
  /** Blocks sight. */
  opaque: boolean;
  /** Placeholder colour (ground: the fill; object: the glyph). */
  colour: string;
  /** Placeholder glyph (objects). */
  glyph?: string;
  /** Tiles of one group join one another (TileJoin mask4), such as all the walls. */
  group?: string;
  join?: TileJoin;
  /** Suggested number of variants to draw (default 1). */
  variants?: number;
  /** Water: deep (swim) or shallow (wade). */
  water?: 'shallow' | 'deep';
  /** A door: the name of the tile it turns into when opened or closed. */
  toggle?: string;
}

type Def = Omit<TileDef, 'layer'>;

const g = (name: string, colour: string, look: string, art: string, more: Partial<Def> = {}): Def =>
  ({ name, colour, look, art, pass: true, opaque: false, ...more });
const o = (name: string, glyph: string, colour: string, look: string, art: string, more: Partial<Def> = {}): Def =>
  ({ name, glyph, colour, look, art, pass: false, opaque: false, ...more });

const GROUND: Def[] = [
  g('void', '#000000', 'nothing', 'Unused (id 0).'),
  // ---- Natural ground
  g('grass', '#6f9a4a', 'grass', 'Short meadow grass, a few tufts.', { variants: 4 }),
  g('grass_lush', '#5c9142', 'lush grass', 'Deep green, thick grass by water and in wet country.', { variants: 3 }),
  g('grass_dry', '#a8a25a', 'dry grass', 'Yellowed steppe or savanna grass, patches of bare earth.', { variants: 4 }),
  g('forest_floor', '#5f5a36', 'leaf litter', 'Brown leaf litter with moss under broadleaf trees.', { variants: 4 }),
  g('needle_floor', '#5b5638', 'pine needles', 'Rust-brown needle litter under conifers.', { variants: 3 }),
  g('moss', '#4f7a45', 'moss', 'Wet green moss and ferns (rainforest floor).', { variants: 3 }),
  g('jungle_floor', '#4a6a34', 'jungle floor', 'Dark damp earth, roots and broad fallen leaves.', { variants: 3 }),
  g('tundra', '#8b9a72', 'tundra', 'Low moss, lichen and sedge, grey-green.', { variants: 3 }),
  g('dirt', '#8a7350', 'bare earth', 'Packed brown earth.', { variants: 3 }),
  g('dry_earth', '#b79a6a', 'dry earth', 'Cracked pale earth with stones (cold desert, scrub).', { variants: 3 }),
  g('sand', '#d9c48a', 'sand', 'Beach or dune sand, light and fine.', { variants: 3 }),
  g('desert_sand', '#e0b878', 'desert sand', 'Warm orange desert sand with ripples.', { variants: 3 }),
  g('gravel', '#9a948a', 'gravel', 'Grey stones and grit (riverbeds, scree foot).', { variants: 3 }),
  g('rock', '#80786e', 'bare rock', 'Bare rock with cracks (steep ground, mountains).', { variants: 4 }),
  g('scree', '#958c80', 'scree', 'Loose broken stones on a slope.', { variants: 3 }),
  g('snow', '#eef2f4', 'snow', 'Clean snow with faint blue shadows.', { variants: 3 }),
  g('ice', '#cfe3ec', 'ice', 'Blue-white glacial ice.', { variants: 2 }),
  g('mud', '#6b5a3e', 'mud', 'Wet dark mud with puddles (mangrove, marsh edge).', { variants: 3 }),
  g('marsh', '#5d7451', 'marsh', 'Waterlogged ground, sedge and standing water.', { variants: 3 }),
  g('salt', '#e8e4d8', 'salt crust', 'White salt crust in polygons.', { variants: 2 }),
  // ---- Water
  g('water_shallow', '#5b8fb0', 'shallow water', 'Clear shallow water, the bottom showing. Joins with deep water and the shore.', { water: 'shallow', group: 'water', join: 'mask4', variants: 2 }),
  g('water_deep', '#2f5f86', 'deep water', 'Dark deep water (sea, lake, wide river).', { water: 'deep', pass: false, group: 'water', join: 'mask4', variants: 2 }),
  g('river', '#4f86a8', 'river', 'Flowing river water with ripples, shallow enough to ford.', { water: 'shallow', group: 'water', join: 'mask4', variants: 2 }),
  g('river_deep', '#3a6f95', 'deep river', 'A deep river channel with current lines.', { water: 'deep', pass: false, group: 'water', join: 'mask4', variants: 2 }),
  // ---- Made ground outdoors
  g('road', '#a08a62', 'a road', 'A beaten earth road with wheel ruts.', { variants: 3 }),
  g('track', '#94845f', 'a track', 'A narrow grassy track, two worn lines.', { variants: 2 }),
  g('path', '#9c8b66', 'a path', 'A footpath of trodden earth.', { variants: 2 }),
  g('cobbles', '#9a958a', 'cobbles', 'Rounded cobblestones (town streets and paved roads).', { variants: 3 }),
  g('flagstones', '#b0a998', 'flagstones', 'Large square paving stones (squares, plazas).', { variants: 3 }),
  g('lawn', '#7aa552', 'a green', 'Mown common grass (village greens, town gardens).', { variants: 2 }),
  g('garden_bed', '#6f6036', 'a garden bed', 'Dug earth in rows with vegetables or herbs.', { variants: 3 }),
  g('field', '#8c7a46', 'a field', 'Ploughed field with rows of crop (grain colour varies).', { variants: 4 }),
  g('vineyard', '#7a7040', 'a vineyard', 'Earth between rows of vines.', { variants: 2 }),
  g('yard', '#8f7c58', 'a yard', 'Trampled earth yard with straw.', { variants: 2 }),
  g('grave_ground', '#6d8a4c', 'a graveyard', 'Rough grass among graves.', { variants: 2 }),
  g('planks', '#8c6a43', 'planks', 'Weathered wooden planking (piers, jetties, walkways).', { variants: 2 }),
  g('bridge', '#9a7a52', 'a bridge', 'Bridge deck over water: planks or stone, edges on the sides.', { variants: 2 }),
  g('ditch', '#5f5236', 'a ditch', 'A muddy ditch.'),
  g('mound', '#7d9a52', 'a grassy mound', 'Raised turf of a burrow-house mound.'),
  g('spoil', '#7b7262', 'spoil', 'Heaped mine spoil and rubble.'),
  // ---- Floors indoors
  g('floor_flags', '#a59f92', 'a flagstone floor', 'Indoor stone flags, darker joints than outdoor flagstones.', { variants: 2 }),
  g('floor_boards', '#9b7650', 'a board floor', 'Indoor wooden floorboards.', { variants: 2 }),
  g('floor_earth', '#7f6a4a', 'an earth floor', 'Indoor beaten earth with rushes.', { variants: 2 }),
  // Added after the first release go below.
  // Camps (apps/game/src/game/camp.ts).
  o('bedroll', '=', '#8a7a5a', 'a bedroll', 'A blanket laid out to sleep on.', { pass: true }),
  o('fire_out', '*', '#6a6058', 'a dead fire', 'A ring of stones with cold ashes.', { pass: true }),
  o('windbreak', '#', '#7a6a45', 'a windbreak', 'A low wall of woven branches against the wind.'),
  o('lean_to', '^', '#7a6a45', 'a lean-to', 'A slope of branches and bark to lie under.', { pass: true }),
  o('snare', ',', '#b0a080', 'a snare', 'A wire noose set on an animal run.', { pass: true }),
];

const wall = (mat: string, colour: string, look: string, art: string): Def =>
  o(`wall_${mat}`, '#', colour, look, art, { opaque: true, group: 'wall', join: 'mask4' });

const OBJECT: Def[] = [
  o('none', ' ', '#000000', '', 'Unused (id 0).', { pass: true }),
  // ---- Walls (all join each other)
  wall('timber', '#8a6a48', 'a timber-framed wall', 'Dark timber frame with pale wattle-and-daub panels.'),
  wall('stone', '#8c8780', 'a stone wall', 'Coursed grey stone.'),
  wall('plaster', '#d9cbb0', 'a plastered wall', 'Smooth cream plaster.'),
  wall('whitewash', '#efece4', 'a whitewashed wall', 'Bright white limewash.'),
  wall('adobe', '#c9a274', 'an adobe wall', 'Mud brick, rounded edges, warm ochre.'),
  wall('log', '#8a6440', 'a log wall', 'Horizontal round logs with notched ends.'),
  wall('plank', '#9a7a56', 'a plank wall', 'Vertical boards.'),
  wall('turf', '#7f9250', 'a turf wall', 'Earth and turf, grass on top (burrows, turf houses).'),
  wall('brick', '#a65c45', 'a brick wall', 'Red-brown brick courses.'),
  o('town_wall', '#', '#7a756c', 'the town wall', 'Massive stone curtain wall, crenellated top seen from above.', { opaque: true, group: 'townwall', join: 'mask4' }),
  o('palisade', '#', '#7d5c3a', 'a palisade', 'Sharpened stakes side by side.', { opaque: true, group: 'palisade', join: 'mask4' }),
  o('tower', 'O', '#6e6961', 'a tower', 'Solid round stone tower base from above (one tile of a larger disc).', { opaque: true, group: 'townwall', join: 'mask4' }),
  // ---- Doors and openings
  o('door', '+', '#b0784a', 'a closed door', 'Wooden door, closed, seen from above in the wall line.', { opaque: true, toggle: 'door_open', group: 'wall', join: 'mask4' }),
  o('door_open', "'", '#b0784a', 'an open door', 'Wooden door swung open against the jamb.', { pass: true, toggle: 'door', group: 'wall', join: 'mask4' }),
  o('window', '=', '#9fc3d6', 'a window', 'Wall with glazing or shutters: blocks the way, not the view.', { group: 'wall', join: 'mask4' }),
  o('gate', '+', '#8a6a48', 'a gate', 'Heavy gate in a town wall or fence, closed.', { opaque: true, toggle: 'gate_open', group: 'townwall', join: 'mask4' }),
  o('gate_open', "'", '#8a6a48', 'an open gate', 'The gate swung open.', { pass: true, toggle: 'gate', group: 'townwall', join: 'mask4' }),
  // ---- Stairs
  o('stairs_up', '<', '#d8c8a0', 'stairs leading up', 'Wooden steps rising (arrow up hint).', { pass: true }),
  o('stairs_down', '>', '#d8c8a0', 'stairs leading down', 'Steps going down into darkness.', { pass: true }),
  o('ladder_up', '<', '#b89060', 'a ladder leading up', 'A wooden ladder against the wall.', { pass: true }),
  o('ladder_down', '>', '#b89060', 'a ladder down through a hatch', 'A trapdoor with a ladder below.', { pass: true }),
  o('stairs_spiral', '<', '#cfc4aa', 'a spiral stair', 'Stone spiral stair (round).', { pass: true }),
  // ---- Vegetation
  o('tree_broadleaf', 'T', '#3f7a32', 'a broadleaf tree', 'Oak, beech or ash: round crown from above, trunk at the base. Fits one tile.', { opaque: true, variants: 4 }),
  o('tree_conifer', 'A', '#2f6a3a', 'a conifer', 'Spruce or pine: pointed dark crown.', { opaque: true, variants: 3 }),
  o('tree_palm', 'Y', '#5a8a3a', 'a palm', 'Palm with fronds radiating.', { opaque: true, variants: 2 }),
  o('tree_jungle', 'T', '#2c6a2a', 'a jungle tree', 'Huge buttressed tree with vines.', { opaque: true, variants: 3 }),
  o('tree_dead', 'T', '#7a6a55', 'a dead tree', 'Bare grey branches.', { opaque: false, variants: 2 }),
  o('tree_mangrove', 'T', '#3c6c3c', 'a mangrove', 'Tangle of stilt roots under a low crown.', { opaque: true }),
  o('tree_birch', 'T', '#7fa050', 'a birch', 'White trunk, light airy crown.', { opaque: true, variants: 2 }),
  o('great_trunk', 'O', '#5d4a32', 'the trunk of a great tree', 'Part of a huge trunk (tree towns): bark, several tiles across.', { opaque: true, group: 'trunk', join: 'mask4' }),
  o('bush', '*', '#4c7a38', 'a bush', 'A round shrub; slows but does not stop sight.', { variants: 3 }),
  o('scrub', '*', '#8a8a4a', 'scrub', 'Dry thorny scrub.', { pass: true, variants: 2 }),
  o('tall_grass', '"', '#8aa64e', 'tall grass', 'Waist-high grass stems.', { pass: true, variants: 2 }),
  o('ferns', '"', '#4a8a44', 'ferns', 'Clump of ferns.', { pass: true, variants: 2 }),
  o('reeds', '"', '#8a9a52', 'reeds', 'Reeds and bulrushes (marsh, water edges).', { pass: true, variants: 2 }),
  o('flowers', '.', '#d8a0c0', 'wildflowers', 'Small scattered flowers.', { pass: true, variants: 3 }),
  o('cactus', 'I', '#5a8a4a', 'a cactus', 'A column cactus.', { variants: 2 }),
  o('mushrooms', ',', '#c8b8a0', 'mushrooms', 'A ring of pale mushrooms.', { pass: true }),
  o('crops', '"', '#c8b060', 'crops', 'Standing crop in rows (grain).', { pass: true, variants: 3 }),
  o('vines', '%', '#6a8a3a', 'vines', 'A row of vines on stakes.', { variants: 2 }),
  o('hedge', '%', '#3f6a30', 'a hedge', 'Clipped hedge.', { opaque: true, group: 'hedge', join: 'mask4' }),
  // ---- Stones and earthworks
  o('boulder', 'o', '#8c8680', 'a boulder', 'A large rounded stone.', { variants: 3 }),
  o('stones', '.', '#9a948a', 'loose stones', 'A few small stones on the ground.', { pass: true, variants: 2 }),
  o('menhir', 'I', '#8c8a84', 'a standing stone', 'A tall rough standing stone with lichen.'),
  o('totem', 'I', '#a06a3a', 'a carved totem pole', 'A painted carved pole.'),
  o('pyramid', '^', '#c2b08a', 'a pyramid', 'Stepped stone of a pyramid (one tile of the mass).', { opaque: true, group: 'pyramid', join: 'mask4' }),
  o('rubble', ':', '#8a8478', 'rubble', 'Fallen masonry of a ruin.', { pass: true, variants: 2 }),
  o('ruin_wall', '#', '#7a766c', 'a broken wall', 'A broken stub of old wall.', { opaque: true, group: 'wall', join: 'mask4' }),
  // ---- Town things
  o('fence', '-', '#9a7a52', 'a fence', 'A picket fence.', { group: 'fence', join: 'mask4' }),
  o('well', 'o', '#7a8a9a', 'a well', 'Stone well ring with a winch.'),
  o('fountain', 'o', '#7aa0c0', 'a fountain', 'A stone basin with water.'),
  o('grave', '+', '#a8a49a', 'a grave', 'A headstone or wooden cross on a low mound.', { pass: true, variants: 3 }),
  o('tomb', '=', '#a8a49a', 'a tomb', 'A stone chest tomb.'),
  o('stall', '&', '#c8784a', 'a market stall', 'Trestle under a striped awning, seen from above (one tile of it). You can duck under the awning.', { pass: true, variants: 3 }),
  o('tent', '^', '#c8b48a', 'a tent', 'Canvas tent from above.', { variants: 2 }),
  o('wagon', '&', '#8a6a48', 'a wagon', 'Wooden cart (one tile of it).', { variants: 2 }),
  o('boat', 'u', '#8a6a48', 'a boat', 'A small boat drawn up or moored.', { variants: 2 }),
  o('horse', 'h', '#8a5a3a', 'a tethered horse', 'A horse from above (a placeholder until creatures arrive).'),
  o('campfire', '*', '#e07a30', 'a fire', 'A ring of stones with flames.'),
  o('woodpile', '=', '#8a6a48', 'a woodpile', 'Stacked split logs.'),
  o('millwheel', 'O', '#8a6a48', 'a mill wheel', 'A wooden water wheel.'),
  o('mine_entrance', '>', '#5a5048', 'a mine entrance', 'A timbered mine adit going down.', { pass: true }),
  o('cave_mouth', '>', '#4a4038', 'a cave mouth', 'A dark opening in rock.', { pass: true }),
  o('dungeon_entrance', '>', '#6a5a4a', 'a way down', 'Steps or a hatch going down (crypt, cellar, sewer).', { pass: true }),
  o('signpost', '!', '#b08a5a', 'a signpost', 'A wooden fingerpost.'),
  // ---- Furniture (from the floor plans, interiors/dwelling.ts)
  o('altar', '_', '#e0d0a0', 'an altar', 'A stone altar with a cloth.'),
  o('anvil', 'n', '#5a5a60', 'an anvil', 'An iron anvil on a stump.'),
  o('barrel', 'o', '#9a6a3a', 'a barrel', 'A wooden barrel from above.', { variants: 2 }),
  o('bath', 'u', '#a0b0b8', 'a bathtub', 'A wooden or copper tub.'),
  o('bed', '=', '#c87a6a', 'a bed', 'A bed with blanket and pillow (one tile; long beds use two).', { pass: true, variants: 3 }),
  o('bench', '-', '#9a7048', 'a bench', 'A wooden bench.', { pass: true }),
  o('bin', 'u', '#8a6a48', 'a bin', 'A wooden storage bin.'),
  o('bookcase', '#', '#7a4a2a', 'a bookcase', 'Shelves of books against a wall.'),
  o('bucket', 'u', '#8a7a6a', 'a bucket', 'A wooden bucket.', { pass: true }),
  o('candle', '!', '#f0d080', 'a candlestand', 'A tall iron candlestand.', { pass: true }),
  o('cauldron', 'u', '#4a4a4a', 'a cauldron', 'A black iron pot.'),
  o('chair', 'h', '#9a7048', 'a chair', 'A wooden chair.', { pass: true, variants: 2 }),
  o('chest', '=', '#8a5a2a', 'a chest', 'A banded wooden chest.'),
  o('counter', '=', '#8a6038', 'a counter', 'A shop or tavern counter.'),
  o('crate', 'x', '#a0804a', 'a crate', 'A wooden crate.', { variants: 2 }),
  o('desk', '=', '#7a5030', 'a desk', 'A writing desk with papers.'),
  o('font', 'o', '#c0bcb0', 'a font', 'A stone font of holy water.'),
  o('forge', '&', '#d06030', 'a forge', 'A brick forge with glowing coals.'),
  o('furnace', '&', '#b05030', 'a furnace', 'A kiln or furnace.'),
  o('hatstand', 'Y', '#7a5030', 'a coat stand', 'A wooden coat stand.'),
  o('hearth', '&', '#e07a30', 'a hearth', 'An open fire in a hearth.'),
  o('logs', '=', '#8a6a48', 'firewood', 'Stacked firewood.'),
  o('millstone', 'O', '#9a948a', 'a millstone', 'A round millstone.'),
  o('oven', '&', '#a05a3a', 'an oven', 'A domed bread oven.'),
  o('pew', '-', '#8a6038', 'a pew', 'A long church bench.', { pass: true }),
  o('privy', 'u', '#8a7a5a', 'a privy', 'A privy seat.', { pass: true }),
  o('rack', '#', '#7a6048', 'a rack', 'A rack of tools or weapons.'),
  o('rug', '~', '#a04a4a', 'a rug', 'A woven rug (lies under other things).', { pass: true, variants: 2 }),
  o('sack', 'o', '#c0a878', 'sacks', 'Sacks of grain.', { pass: true }),
  o('sawbench', 'n', '#9a7048', 'a sawbench', 'A sawhorse with a log.'),
  o('shelf', '#', '#8a6038', 'a shelf', 'Shelves with jars against a wall.'),
  o('sideboard', '=', '#7a5030', 'a sideboard', 'A sideboard with plates.'),
  o('straw', '"', '#d8c070', 'straw', 'A heap of straw bedding.', { pass: true }),
  o('table', '=', '#9a6a3a', 'a table', 'A wooden table.', { variants: 2 }),
  o('trestle', '=', '#9a7a52', 'a trestle table', 'Boards on trestles.'),
  o('wardrobe', '#', '#6a4020', 'a wardrobe', 'A tall cupboard.', { opaque: true }),
  o('workbench', '=', '#8a6a48', 'a workbench', 'A bench with tools.'),
  o('stool', 'h', '#9a7048', 'a stool', 'A three-legged stool.', { pass: true }),
  // Added after the first release go below.
  // Camps (apps/game/src/game/camp.ts).
  o('bedroll', '=', '#8a7a5a', 'a bedroll', 'A blanket laid out to sleep on.', { pass: true }),
  o('fire_out', '*', '#6a6058', 'a dead fire', 'A ring of stones with cold ashes.', { pass: true }),
  o('windbreak', '#', '#7a6a45', 'a windbreak', 'A low wall of woven branches against the wind.'),
  o('lean_to', '^', '#7a6a45', 'a lean-to', 'A slope of branches and bark to lie under.', { pass: true }),
  o('snare', ',', '#b0a080', 'a snare', 'A wire noose set on an animal run.', { pass: true }),
];

export const GROUND_TILES: readonly TileDef[] = GROUND.map((d) => ({ ...d, layer: 'ground' as const }));
export const OBJECT_TILES: readonly TileDef[] = OBJECT.map((d) => ({ ...d, layer: 'object' as const }));

const gIndex = new Map(GROUND_TILES.map((d, i) => [d.name, i]));
const oIndex = new Map(OBJECT_TILES.map((d, i) => [d.name, i]));
if (gIndex.size !== GROUND_TILES.length || oIndex.size !== OBJECT_TILES.length || GROUND_TILES.length > 255 || OBJECT_TILES.length > 255) {
  throw new Error('Tile registry: duplicate names or too many tiles.');
}

/** Ground tile id by name (throws on a misspelt name, so mistakes show at once). */
export function G(name: string): number {
  const i = gIndex.get(name);
  if (i === undefined) throw new Error(`Unknown ground tile ${name}`);
  return i;
}

/** Object tile id by name. */
export function O(name: string): number {
  const i = oIndex.get(name);
  if (i === undefined) throw new Error(`Unknown object tile ${name}`);
  return i;
}

/** Object tile id by name, or undefined. */
export function objectId(name: string): number | undefined {
  return oIndex.get(name);
}

/** Whether a position with these tiles can be walked into. */
export function passable(ground: number, object: number): boolean {
  return GROUND_TILES[ground].pass && OBJECT_TILES[object].pass;
}

/** Whether a position with these tiles blocks sight. */
export function opaque(ground: number, object: number): boolean {
  return GROUND_TILES[ground].opaque || OBJECT_TILES[object].opaque;
}
