import { hashString, mulberry32 } from '../gen/rng';
import { type Habitat, type Region, fit } from './habitat';
import type { Rarity } from './bestiary';

/**
 * A field guide to the trees, shrubs, herbs, fungi and grasses of the world: where each grows,
 * and what it is good for (food, medicine, poison, timber, dyes, crafts and the uncanny). A
 * region's guide is drawn from the country about it, as the bestiary is.
 */

export type PlantKind = 'tree' | 'shrub' | 'herb' | 'fungus' | 'vine' | 'grass' | 'water plant';
export interface Uses {
  food?: string;
  medicine?: string;
  poison?: string;
  timber?: string;
  dye?: string;
  craft?: string;
  magic?: string;
}
export interface Plant {
  name: string;
  kind: PlantKind;
  tags: Habitat[];
  needs?: Habitat[];
  rarity: Rarity;
  text: string;
  uses: Uses;
  /** When it can be gathered. */
  season?: string;
}

const P = (name: string, kind: PlantKind, tags: Habitat[], rarity: Rarity, text: string, uses: Uses, o: { needs?: Habitat[]; season?: string } = {}): Plant => ({ name, kind, tags, rarity, text, uses, ...o });

export const PLANTS: Plant[] = [
  // ---- Trees ---------------------------------------------------------------------------------
  P('oak', 'tree', ['temperate', 'forest', 'farmland'], 'common', 'Broad old oaks that live five hundred years; acorns feed the swine in autumn.', { timber: 'hard, strong: beams, ships and barrels', dye: 'oak galls give a black ink', food: 'acorns (for swine, or bitter flour in famine)', magic: 'sacred to the sky-gods; lightning-struck oak wards off evil' }),
  P('ash', 'tree', ['temperate', 'forest', 'river'], 'common', 'Tall, pale-barked ash with keys that spin on the wind.', { timber: 'springy and tough: spear shafts, tool handles, wheels', magic: 'the world-tree of the old tales' }),
  P('yew', 'tree', ['temperate', 'forest', 'mountain'], 'uncommon', 'Dark, slow yews that grow in churchyards and live a thousand years.', { timber: 'the best wood for longbows', poison: 'every part but the red flesh of the berry; a few leaves kill a horse', magic: 'a tree of death and rebirth' }),
  P('beech', 'tree', ['temperate', 'forest'], 'common', 'Smooth grey beeches whose shade lets little else grow.', { timber: 'fine-grained: furniture, bowls, charcoal', food: 'beechmast nuts' }),
  P('birch', 'tree', ['boreal', 'temperate', 'arctic', 'forest'], 'common', 'White-barked birches, first to grow where the forest has burned.', { craft: 'bark for canoes, baskets and writing; tar for glue', medicine: 'sap tonic in spring; bark tea for aches', food: 'birch sap' }),
  P('pine', 'tree', ['boreal', 'mountain', 'forest', 'temperate'], 'common', 'Resinous pines that stand straight on poor soil.', { timber: 'straight masts and planks', craft: 'pitch and tar for ships; resin torches', food: 'pine nuts' }),
  P('spruce', 'tree', ['boreal', 'mountain'], 'common', 'Dark spruce of the north, crowding the slopes.', { timber: 'light and resonant: building, and the bellies of lutes', medicine: 'needle tea against the scurvy' }),
  P('larch', 'tree', ['boreal', 'mountain'], 'uncommon', 'A conifer that turns gold and drops its needles in autumn.', { timber: 'durable outdoors: posts, shingles, boats' }),
  P('willow', 'tree', ['river', 'wetland', 'temperate'], 'common', 'Weeping willows along every stream.', { medicine: 'bark tea against pain and fever', craft: 'withies for baskets, hurdles and coracles', magic: 'tree of grief and of the moon' }),
  P('alder', 'tree', ['river', 'wetland'], 'common', 'Alders with their feet in the water; their wood turns orange when cut.', { timber: 'lasts under water: piles and sluices', dye: 'bark gives red, yellow and black' }),
  P('elm', 'tree', ['temperate', 'farmland'], 'common', 'Tall elms in the hedgerows and on the village greens.', { timber: 'wet-proof: coffins, water pipes, keels' }),
  P('rowan', 'tree', ['mountain', 'boreal', 'temperate'], 'common', 'Mountain ash with bright red berries.', { food: 'berries for jelly', magic: 'a sprig over the door wards off witches' }),
  P('holly', 'tree', ['temperate', 'forest'], 'common', 'Evergreen holly with spiny leaves and red berries.', { poison: 'berries, mildly', magic: 'protection in midwinter', timber: 'white wood for inlay' }),
  P('chestnut', 'tree', ['temperate', 'forest'], 'common', 'Sweet chestnuts in warm woods; their nuts are a staple in hard winters.', { food: 'chestnuts, roasted or ground to flour', timber: 'rot-proof posts and staves' }, { season: 'autumn' }),
  P('walnut', 'tree', ['temperate', 'farmland'], 'uncommon', 'Walnut trees planted by farms.', { food: 'walnuts and their oil', dye: 'husks give a deep brown', timber: 'prized for gunstocks and fine furniture' }),
  P('olive', 'tree', ['temperate', 'arid', 'farmland'], 'common', 'Silver-grey olive trees on the dry hills of the warm lands.', { food: 'olives and oil', craft: 'oil for lamps and soap' }, { needs: ['arid'] }),
  P('cork oak', 'tree', ['arid', 'temperate'], 'uncommon', 'An oak whose thick bark is stripped every few years.', { craft: 'cork for stoppers, floats and soles' }, { needs: ['arid'] }),
  P('cedar', 'tree', ['mountain', 'arid', 'temperate'], 'uncommon', 'Great spreading cedars of the warm mountains, fragrant and long-lived.', { timber: 'fragrant, rot-proof: temples, chests, ships', magic: 'incense of the gods' }),
  P('date palm', 'tree', ['arid', 'tropical'], 'common', 'Palms of the oases, the wealth of the desert.', { food: 'dates', craft: 'fronds for thatch and mats; fibre for rope' }, { needs: ['arid'] }),
  P('acacia', 'tree', ['arid', 'grass', 'tropical'], 'common', 'Flat-topped, thorny trees of the dry grasslands.', { craft: 'gum arabic', timber: 'hard, for tool handles', food: 'pods for herds' }),
  P('baobab', 'tree', ['tropical', 'grass', 'arid'], 'uncommon', 'Swollen-trunked giants that store water and live for ages.', { food: 'fruit and leaves', craft: 'bark fibre for rope', magic: 'spirits live in old baobabs' }, { needs: ['tropical'] }),
  P('mahogany', 'tree', ['jungle', 'tropical'], 'uncommon', 'Tall red-wooded trees of the rainforest.', { timber: 'red, fine-grained: the finest furniture and ships' }, { needs: ['tropical'] }),
  P('teak', 'tree', ['tropical', 'forest'], 'uncommon', 'Oily teak of the monsoon forests.', { timber: 'resists rot and worm: ship decks' }, { needs: ['tropical'] }),
  P('rubber tree', 'tree', ['jungle'], 'rare', 'Trees that bleed a white milk when cut, which sets into an elastic gum.', { craft: 'rubber for balls, boots and waterproofing' }),
  P('cacao', 'tree', ['jungle'], 'uncommon', 'Small trees with pods on their trunks, sacred to the jungle peoples.', { food: 'cacao, ground for a bitter drink', craft: 'beans used as coin' }),
  P('banyan', 'tree', ['jungle', 'tropical'], 'uncommon', 'A fig that drops roots from its branches until one tree is a grove.', { food: 'figs', magic: 'shrines are made at its roots' }, { needs: ['tropical'] }),
  P('mangrove', 'tree', ['coast', 'wetland'], 'common', 'Trees on stilt roots in the salt shallows.', { timber: 'charcoal and poles', dye: 'bark tannin' }, { needs: ['tropical'] }),
  P('bamboo', 'grass', ['tropical', 'jungle', 'mountain'], 'common', 'Giant grass that grows a span in a day.', { craft: 'building, scaffolds, pipes, paper', food: 'young shoots' }, { needs: ['tropical'] }),
  P('silverbark', 'tree', ['forest', 'temperate', 'boreal'], 'rare', 'A tall tree with bark like beaten silver and leaves that ring in the wind; elves plant them by their halls.', { timber: 'light and strong: elven bows', magic: 'its leaves keep their green a year, and lend a draught clear sight' }),
  P('ironwood', 'tree', ['mountain', 'forest'], 'rare', 'A dense dark tree whose wood sinks in water and turns axe-blades.', { timber: 'as hard as bronze: clubs, gears, bearings' }),
  P('gallows tree', 'tree', ['cursed'], 'uncommon', 'Twisted, leafless trees of the cursed land that creak with no wind.', { poison: 'its sap blisters skin', magic: 'its wood carries curses well; hangmen\'s rope is twined from its bark' }, { needs: ['cursed'] }),
  // ---- Shrubs and vines -----------------------------------------------------------------------
  P('hawthorn', 'shrub', ['temperate', 'farmland'], 'common', 'Thorny hedges white with may blossom in spring.', { food: 'haws', medicine: 'for the heart', magic: 'a fairy tree: never cut a lone hawthorn' }),
  P('blackthorn', 'shrub', ['temperate', 'farmland'], 'common', 'Dense, spiny thickets with bitter sloes.', { food: 'sloes for wine', craft: 'cudgels and walking sticks' }, { season: 'after the first frost' }),
  P('elder', 'shrub', ['temperate', 'farmland', 'forest'], 'common', 'Elder bushes by the houses, white-flowered, black-berried.', { food: 'flowers and berries for cordial and wine', medicine: 'for colds and fevers', magic: 'the elder mother guards the bush' }),
  P('bramble', 'shrub', ['temperate', 'forest', 'farmland'], 'common', 'Brambles that take every waste corner.', { food: 'blackberries', dye: 'purple' }, { season: 'late summer' }),
  P('juniper', 'shrub', ['boreal', 'mountain', 'arid'], 'common', 'Low, prickly juniper on the heaths.', { food: 'berries to flavour meat and spirits', medicine: 'smoke cleanses the sickroom' }),
  P('heather', 'shrub', ['arctic', 'mountain', 'grass'], 'common', 'Purple heather on the moors.', { craft: 'thatch, brooms and bedding', food: 'heather honey and ale' }),
  P('cranberry', 'shrub', ['boreal', 'wetland'], 'common', 'Low shrubs on the bogs with sour red berries.', { food: 'berries that keep through winter', medicine: 'for the bladder' }),
  P('grapevine', 'vine', ['temperate', 'farmland', 'arid'], 'common', 'Wild vines climbing the trees, and tended vineyards on the warm slopes.', { food: 'grapes, raisins and wine' }),
  P('tea bush', 'shrub', ['tropical', 'mountain'], 'uncommon', 'An evergreen shrub of the misty hills whose leaves are dried for drink.', { food: 'tea' }, { needs: ['tropical'] }),
  P('coca', 'shrub', ['mountain', 'tropical'], 'uncommon', 'A shrub of the warm mountains; its leaves are chewed against hunger and the thin air.', { medicine: 'eases hunger, cold and the mountain sickness' }, { needs: ['mountain'] }),
  P('creosote bush', 'shrub', ['arid'], 'common', 'A pungent shrub that grows where nothing else will.', { medicine: 'a salve for wounds' }),
  P('thornbush', 'shrub', ['arid', 'grass', 'tropical'], 'common', 'Dense thorny scrub; herders pile it into kraals.', { craft: 'thorn fences' }),
  P('strangler vine', 'vine', ['jungle', 'cursed'], 'uncommon', 'A vine that tightens slowly around what it climbs, tree or traveller.', { poison: 'its sap numbs', craft: 'strong cord' }),
  // ---- Herbs --------------------------------------------------------------------------------
  P('yarrow', 'herb', ['grass', 'temperate', 'farmland'], 'common', 'Feathery leaves and flat white flowers in the meadows.', { medicine: 'staunches bleeding; soldiers carry it' }),
  P('feverfew', 'herb', ['temperate', 'farmland'], 'common', 'Small daisy-like flowers in cottage gardens.', { medicine: 'against fevers and headaches' }),
  P('comfrey', 'herb', ['temperate', 'wetland', 'river'], 'common', 'Hairy-leaved knitbone of the damp places.', { medicine: 'poultice to knit broken bones and heal wounds' }),
  P('valerian', 'herb', ['temperate', 'wetland', 'grass'], 'common', 'Pale pink flowers with a root that smells of old socks.', { medicine: 'a draught for sleep; cats love it' }),
  P('sage', 'herb', ['temperate', 'arid', 'farmland'], 'common', 'Grey-leaved sage on the dry hillsides.', { food: 'flavouring', medicine: 'for sore throats', magic: 'smoke clears a place of spirits' }),
  P('thyme', 'herb', ['arid', 'grass', 'mountain'], 'common', 'Low, scented thyme on the stony slopes.', { food: 'flavouring', medicine: 'for coughs' }),
  P('garlic', 'herb', ['temperate', 'farmland', 'forest'], 'common', 'Wild garlic carpets the spring woods.', { food: 'flavouring', medicine: 'cleans wounds', magic: 'wards off the dead that drink blood' }, { season: 'spring' }),
  P('mint', 'herb', ['river', 'wetland', 'temperate'], 'common', 'Mint along the ditches and streams.', { food: 'flavouring, tea', medicine: 'for the stomach' }),
  P('poppy', 'herb', ['farmland', 'grass', 'arid'], 'common', 'Red and white poppies among the grain.', { medicine: 'milk of the poppy against pain', poison: 'in excess, a sleep that does not end' }),
  P('foxglove', 'herb', ['forest', 'temperate'], 'common', 'Tall spikes of purple bells at the woods\' edge.', { poison: 'stops the heart', medicine: 'in tiny doses, strengthens a failing heart' }),
  P('wolfsbane', 'herb', ['mountain', 'forest', 'boreal'], 'uncommon', 'Hooded blue flowers of the mountain meadows.', { poison: 'deadly: once used on wolf-bait and arrowheads', magic: 'drives off werewolves' }),
  P('deadly nightshade', 'herb', ['temperate', 'forest', 'cursed'], 'uncommon', 'Glossy black berries that look good enough to eat.', { poison: 'a handful of berries kills', medicine: 'widens the eyes (for beauty or the physician)' }),
  P('hemlock', 'herb', ['temperate', 'river', 'wetland'], 'common', 'Purple-spotted stems and lacy white flowers, like wild parsley.', { poison: 'a cold paralysis creeping up from the feet' }),
  P('mandrake', 'herb', ['temperate', 'arid', 'cursed'], 'rare', 'A root shaped like a little man that screams when pulled from the earth.', { medicine: 'a sleep for surgery', poison: 'in excess', magic: 'its scream kills; a dog is used to pull it' }),
  P('belladonna lily', 'herb', ['wetland'], 'uncommon', 'Pale lilies of the fens, closed by day.', { poison: 'the bulb', magic: 'used in sleeping draughts' }),
  P('saffron crocus', 'herb', ['arid', 'farmland'], 'rare', 'Purple crocus whose red threads are worth more than silver.', { food: 'spice', dye: 'golden yellow', medicine: 'cheers the spirits' }, { season: 'autumn' }),
  P('woad', 'herb', ['temperate', 'farmland'], 'uncommon', 'Yellow-flowered woad, grown in fields for its leaves.', { dye: 'blue, for cloth and war-paint' }),
  P('madder', 'herb', ['temperate', 'farmland', 'arid'], 'uncommon', 'A trailing herb whose root gives red.', { dye: 'turkey red' }),
  P('indigo', 'herb', ['tropical', 'farmland'], 'uncommon', 'A pea-like shrub fermented in vats.', { dye: 'deep blue' }, { needs: ['tropical'] }),
  P('flax', 'herb', ['temperate', 'farmland'], 'common', 'Blue-flowered flax in the fields.', { craft: 'linen thread and linseed oil' }),
  P('hemp', 'herb', ['temperate', 'farmland', 'grass'], 'common', 'Tall hemp along the field edges.', { craft: 'rope, sailcloth and sacking', medicine: 'smoke eases pain' }),
  P('cotton', 'shrub', ['tropical', 'arid', 'farmland'], 'uncommon', 'Bolls of soft white fibre.', { craft: 'cotton cloth' }, { needs: ['tropical'] }),
  P('aloe', 'herb', ['arid', 'tropical'], 'common', 'Fleshy-leaved aloe of the dry lands.', { medicine: 'sap soothes burns and wounds' }),
  P('kingsfoil', 'herb', ['temperate', 'forest', 'grass'], 'rare', 'A plain-leaved herb that smells of rain on warm stone when crushed.', { medicine: 'draws out poison and darkness from wounds', magic: 'its scent wakes those under a spell' }),
  P('moonpetal', 'herb', ['forest', 'mountain', 'river'], 'rare', 'A white flower that opens only by moonlight.', { magic: 'a key part of potions of seeing; dew from it reveals the hidden' }, { season: 'full moon' }),
  P('fireweed', 'herb', ['boreal', 'volcanic', 'arctic'], 'common', 'Tall magenta spikes on burned ground.', { food: 'young shoots', medicine: 'tea for the stomach' }),
  P('emberbloom', 'herb', ['volcanic'], 'rare', 'A red flower that grows in warm ash and glows faintly at night.', { magic: 'a pinch makes a fire burn without fuel for an hour', medicine: 'warms the frozen' }, { needs: ['volcanic'] }),
  P('snow lotus', 'herb', ['mountain', 'arctic', 'ice'], 'rare', 'A white lotus of the highest snows.', { medicine: 'cures fevers and the mountain sickness', magic: 'said to lengthen life' }),
  P('desert rose', 'herb', ['arid'], 'uncommon', 'A swollen-stemmed shrub with pink flowers.', { poison: 'sap for arrow poison' }),
  P('sweetgrass', 'grass', ['grass', 'wetland'], 'common', 'A fragrant grass braided and burned.', { craft: 'baskets', magic: 'its smoke draws good spirits' }),
  P('wild wheat', 'grass', ['grass', 'arid', 'farmland'], 'common', 'The wild grass from which grain was first sown.', { food: 'grain' }),
  P('wild rice', 'grass', ['wetland', 'river'], 'common', 'Rice growing wild in the shallows.', { food: 'grain, gathered by canoe' }),
  // ---- Water plants ---------------------------------------------------------------------------
  P('reed', 'water plant', ['wetland', 'river', 'coast'], 'common', 'Reed beds taller than a man.', { craft: 'thatch, mats, pens and paper' }),
  P('water lily', 'water plant', ['wetland', 'river'], 'common', 'Broad pads and white flowers on still water.', { food: 'roots in famine', medicine: 'calms' }),
  P('sphagnum moss', 'water plant', ['wetland', 'boreal'], 'common', 'Sponge-like bog moss that holds twenty times its weight in water.', { medicine: 'wound dressing that keeps clean', craft: 'peat for fuel' }),
  P('kelp', 'water plant', ['coast'], 'common', 'Brown seaweed in forests off the rocky shores.', { food: 'eaten, and spread on fields', craft: 'burned for soda ash' }),
  P('drowning weed', 'water plant', ['wetland', 'cursed'], 'uncommon', 'Long pale weed that tangles swimmers.', { magic: 'a strand tied round a wrist lets one breathe a little under water' }),
  // ---- Fungi -------------------------------------------------------------------------------
  P('chanterelle', 'fungus', ['forest', 'temperate', 'boreal'], 'common', 'Golden, apricot-scented mushrooms in the mossy woods.', { food: 'excellent' }, { season: 'late summer and autumn' }),
  P('fly agaric', 'fungus', ['boreal', 'forest'], 'common', 'Red-capped, white-spotted toadstools under birch and pine.', { poison: 'raving, then sleep', magic: 'the shamans\' mushroom of visions' }),
  P('death cap', 'fungus', ['forest', 'temperate'], 'uncommon', 'A pale green mushroom that tastes pleasant.', { poison: 'deadly; the sickness comes a day later, when it is too late' }),
  P('morel', 'fungus', ['forest', 'temperate'], 'uncommon', 'Honeycombed mushrooms of the spring woods.', { food: 'prized' }, { season: 'spring' }),
  P('truffle', 'fungus', ['temperate', 'forest'], 'rare', 'Black truffles under the oaks, found by pigs and dogs.', { food: 'worth its weight in silver' }),
  P('glowcap', 'fungus', ['fungal', 'forest', 'cursed'], 'common', 'Mushrooms that glow green in the dark.', { craft: 'light for miners and thieves', magic: 'ink that shows only in darkness' }),
  P('giant shelf fungus', 'fungus', ['fungal'], 'common', 'Shelf fungi broad enough to walk on, climbing the stalks of the mushroom forest.', { craft: 'tinder and leather-like hide', food: 'young edges' }, { needs: ['fungal'] }),
  P('dreamspore puffball', 'fungus', ['fungal'], 'uncommon', 'Puffballs that burst into clouds of sweet spores.', { magic: 'shared dreams', poison: 'a sleep of days' }, { needs: ['fungal'] }),
  P('blight mould', 'fungus', ['cursed', 'wetland'], 'common', 'Grey mould on everything in the cursed land.', { poison: 'rots grain and lungs', magic: 'gathered by those who make curses' }, { needs: ['cursed'] }),
  // ---- Cold lands --------------------------------------------------------------------------
  P('reindeer moss', 'herb', ['arctic', 'boreal'], 'common', 'Pale grey lichen carpeting the tundra.', { food: 'winter fodder for reindeer; famine food' }),
  P('cloudberry', 'shrub', ['arctic', 'wetland', 'boreal'], 'uncommon', 'Amber berries of the northern bogs.', { food: 'berries rich against the scurvy' }, { season: 'late summer' }),
  P('arctic willow', 'shrub', ['arctic', 'ice'], 'common', 'Willow trees a hand high, creeping over the tundra.', { medicine: 'bark for pain', food: 'shoots' }),
];

export interface RegionPlant extends Plant {
  local?: string;
  /** How easily found here. */
  found: 'everywhere' | 'common' | 'in places' | 'rare';
}

/** The plants of a region, by kind, with their local names. */
export function floraOf(seed: string, region: Region, localName?: (en: string) => string): RegionPlant[] {
  const r = mulberry32(hashString(`${seed}#flora#${region.key}`));
  const out: RegionPlant[] = [];
  for (const p of PLANTS) {
    const f = fit(region, p.tags, p.needs);
    const roll = r();
    if (f < 0.1) continue;
    const chance = p.rarity === 'common' ? 0.95 : p.rarity === 'uncommon' ? 0.6 : 0.25;
    if (roll > chance * Math.min(1, f * 1.7)) continue;
    const found = p.rarity === 'rare' ? 'rare' : p.rarity === 'uncommon' ? 'in places' : f > 0.55 ? 'everywhere' : 'common';
    out.push({ ...p, found, ...(localName ? { local: localName(p.name) } : {}) });
  }
  const order: PlantKind[] = ['tree', 'shrub', 'vine', 'herb', 'grass', 'water plant', 'fungus'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
