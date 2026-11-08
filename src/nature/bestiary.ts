import { hashString, mulberry32, type Rng } from '../gen/rng';
import { type Habitat, type Region, fit } from './habitat';

/**
 * The regional bestiary: the beasts, monsters, spirits and dead of the world, each with where it
 * lives, how dangerous it is, its temper, its gifts and what can be taken from it. A region's
 * bestiary is drawn from the country about it (nature/habitat.ts): the creatures that fit its
 * habitats, the common ones always and the rarer by luck, each with a local name in the language
 * of the land and something of its own in these parts.
 */

export type CreatureKind = 'beast' | 'bird' | 'reptile' | 'insect' | 'fish' | 'monster' | 'dragon' | 'giant' | 'fey' | 'spirit' | 'undead' | 'aberration' | 'humanoid';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type Size = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';

export interface Creature {
  name: string;
  kind: CreatureKind;
  /** Where it lives (any of these), and where it must (all of these). */
  tags: Habitat[];
  needs?: Habitat[];
  /** 1 (harmless) to 5 (deadly). */
  danger: number;
  size: Size;
  rarity: Rarity;
  /** How it meets people. */
  temper: string;
  text: string;
  /** What it can do. */
  traits: string[];
  /** What can be taken from it. */
  yields: string[];
  /** Hunts or walks by night. */
  night?: boolean;
}

const B = (name: string, kind: CreatureKind, tags: Habitat[], danger: number, size: Size, rarity: Rarity, temper: string, text: string, traits: string[], yields: string[], o: { needs?: Habitat[]; night?: boolean } = {}): Creature => ({ name, kind, tags, danger, size, rarity, temper, text, traits, yields, ...o });

export const CREATURES: Creature[] = [
  // ---- Beasts --------------------------------------------------------------------------------
  B('wolf', 'beast', ['forest', 'boreal', 'grass', 'mountain', 'arctic'], 2, 'medium', 'common', 'wary; bold in packs and in hard winters', 'Grey hunters that run in packs of five to twelve, following the herds and the snow.', ['hunts in packs', 'keen nose', 'tireless runner'], ['pelt', 'teeth', 'meat']),
  B('dire wolf', 'beast', ['boreal', 'arctic', 'mountain'], 3, 'large', 'uncommon', 'aggressive', 'Wolves the size of ponies, with a bite that cracks bone. Their packs follow armies for the dead.', ['hunts in packs', 'crushing bite', 'trips its prey'], ['great pelt', 'fangs']),
  B('brown bear', 'beast', ['forest', 'boreal', 'mountain'], 3, 'large', 'common', 'shy; terrible when cornered or with cubs', 'A great shaggy bear that fishes the rivers and raids beehives and orchards in autumn.', ['mauling claws', 'climbs', 'sleeps through the winter'], ['bear hide', 'bear fat', 'claws', 'meat']),
  B('cave bear', 'beast', ['mountain', 'boreal', 'arctic'], 4, 'huge', 'rare', 'territorial', 'A hulking bear of the high caves, twice the bulk of its forest kin, worshipped by some hill-folk.', ['mauling claws', 'sleeps through the winter', 'shakes off wounds'], ['great hide', 'skull', 'claws']),
  B('ice bear', 'beast', ['ice', 'arctic', 'coast'], 4, 'large', 'uncommon', 'stalks men as prey', 'A white bear of the ice and the frozen shore that hunts seals and, when hungry, men.', ['stalks unseen on snow', 'swims', 'mauling claws'], ['white hide', 'fat', 'claws'], { needs: ['arctic'] }),
  B('boar', 'beast', ['forest', 'temperate', 'farmland'], 2, 'medium', 'common', 'short-tempered', 'Bristled wild pigs that root in the oak woods and gore hunters who press them.', ['goring tusks', 'charges'], ['tusks', 'hide', 'pork']),
  B('red deer', 'beast', ['forest', 'temperate', 'grass', 'boreal'], 1, 'large', 'common', 'shy', 'Herds of deer in the clearings; the stags bell and fight in the autumn rut.', ['swift', 'keen ears'], ['venison', 'antler', 'hide']),
  B('elk', 'beast', ['boreal', 'wetland', 'arctic'], 2, 'large', 'common', 'shy; dangerous in the rut', 'A towering deer of the northern bogs with broad flat antlers.', ['kicks', 'swims'], ['meat', 'antler', 'hide']),
  B('aurochs', 'beast', ['grass', 'forest', 'temperate'], 3, 'large', 'uncommon', 'proud, quick to charge', 'Wild cattle black as soot with lyre-shaped horns; a young man\'s first aurochs is a rite in some lands.', ['charges', 'goring horns'], ['horns', 'hide', 'beef']),
  B('bison', 'beast', ['grass', 'arid'], 3, 'large', 'common', 'placid in the herd, deadly when it stampedes', 'Great humped cattle in herds that blacken the plains.', ['stampedes', 'thick hide'], ['hide', 'meat', 'horns'], { needs: ['grass'] }),
  B('wild horse', 'beast', ['grass', 'arid'], 1, 'large', 'common', 'skittish', 'Herds of small, tough horses; the plains-folk catch and break them.', ['swift', 'kicks'], ['horsehair', 'hide']),
  B('lynx', 'beast', ['boreal', 'forest', 'mountain'], 1, 'small', 'uncommon', 'shy', 'A tufted-eared cat of the deep woods, seldom seen, whose pelt fetches silver.', ['climbs', 'stalks'], ['fine fur']),
  B('mountain lion', 'beast', ['mountain', 'forest', 'arid'], 3, 'medium', 'uncommon', 'stalks lone travellers', 'A tawny cat of the crags that drops on goats and, now and then, shepherds.', ['pounces from above', 'climbs'], ['pelt', 'claws']),
  B('lion', 'beast', ['grass', 'arid', 'tropical'], 4, 'large', 'common', 'bold', 'Maned cats of the dry grass that hunt in prides and take cattle from the herds.', ['hunts in prides', 'roar that panics beasts', 'mauling claws'], ['mane pelt', 'claws'], { needs: ['tropical'] }),
  B('tiger', 'beast', ['jungle', 'tropical', 'wetland'], 4, 'large', 'uncommon', 'man-eater when old', 'Striped killers of the jungle and the reed beds; a man-eating tiger can empty a village.', ['stalks unseen', 'swims', 'mauling claws'], ['striped pelt', 'claws', 'bones for medicine'], { needs: ['tropical'] }),
  B('elephant', 'beast', ['tropical', 'grass', 'jungle'], 3, 'huge', 'uncommon', 'gentle until provoked', 'Great grey beasts with trunk and tusks; tamed, they carry kings to war.', ['tramples', 'long memory'], ['ivory', 'hide'], { needs: ['tropical'] }),
  B('crocodile', 'reptile', ['river', 'wetland'], 4, 'large', 'common', 'waits, then strikes', 'Armoured reptiles that lie like logs at the ford and drag drinkers under.', ['ambush from the water', 'death roll', 'armoured hide'], ['crocodile leather', 'teeth'], { needs: ['tropical'] }),
  B('great serpent', 'reptile', ['jungle', 'wetland'], 3, 'huge', 'uncommon', 'patient', 'A constrictor thick as a man\'s waist that hangs from the trees over the water.', ['constricts', 'swallows prey whole'], ['snakeskin'], { needs: ['tropical'] }),
  B('viper', 'reptile', ['arid', 'grass', 'temperate', 'tropical'], 2, 'tiny', 'common', 'strikes when stepped on', 'Small venomous snakes that bask on warm stones and sleep in boots left outside.', ['venomous bite'], ['venom']),
  B('scorpion', 'insect', ['arid'], 1, 'tiny', 'common', 'hides', 'Pale scorpions that shelter under stones by day and in bedding by night.', ['venomous sting'], ['venom']),
  B('giant scorpion', 'insect', ['arid'], 4, 'large', 'rare', 'aggressive', 'A scorpion the size of a cart horse, its sting able to drop a camel.', ['venomous sting', 'crushing claws', 'burrows'], ['venom gland', 'chitin plates'], { night: true }),
  B('camel', 'beast', ['arid'], 1, 'large', 'common', 'bad-tempered, spits', 'Humped beasts of burden that carry the desert trade.', ['goes days without water'], ['camel hair', 'milk', 'meat']),
  B('hyena', 'beast', ['grass', 'arid', 'tropical'], 2, 'medium', 'common', 'cowardly, bold in numbers', 'Laughing scavengers that dig up graves and follow the lions.', ['bone-crushing jaws', 'hunts in packs'], ['hide'], { night: true }),
  B('mammoth', 'beast', ['arctic', 'grass'], 3, 'gargantuan', 'rare', 'placid', 'Shaggy elephants of the cold steppe, hunted by the tundra peoples for meat, ivory and bone for their huts.', ['tramples', 'thick wool'], ['ivory', 'wool', 'meat'], { needs: ['arctic'] }),
  B('wolverine', 'beast', ['boreal', 'arctic'], 2, 'small', 'uncommon', 'fearless', 'A squat, savage weasel that drives bears from their kills and robs traplines.', ['ferocious', 'musk'], ['fur']),
  B('beaver', 'beast', ['river', 'boreal', 'temperate'], 1, 'small', 'common', 'shy', 'Dam-builders of the forest streams; their pelts are the wealth of the north.', ['builds dams', 'swims'], ['fur', 'castoreum']),
  B('mountain goat', 'beast', ['mountain'], 1, 'medium', 'common', 'shy', 'Sure-footed goats on cliffs no man can climb.', ['climbs sheer rock'], ['wool', 'horns', 'meat']),
  B('giant eagle', 'bird', ['mountain'], 3, 'large', 'rare', 'proud', 'Eagles with a wingspan of three spears that take lambs and, it is said, children. Some speak.', ['flies', 'stoops from a height', 'keen sight'], ['great feathers']),
  B('raven', 'bird', ['forest', 'boreal', 'mountain', 'temperate', 'farmland'], 1, 'tiny', 'common', 'curious', 'Clever black birds that follow wolves and armies; some say they carry news to the gods.', ['flies', 'mimics speech'], ['feathers']),
  B('crow swarm', 'bird', ['farmland', 'grass'], 1, 'tiny', 'common', 'bold', 'Clouds of crows that strip the fields; a scarecrow means nothing to them.', ['flies', 'flocks'], []),
  B('giant spider', 'insect', ['forest', 'jungle', 'cursed'], 3, 'large', 'uncommon', 'lurks', 'Spiders the size of dogs that web the dark woods between the trees and wrap travellers for later.', ['webs', 'venomous bite', 'climbs'], ['spider silk', 'venom'], { night: true }),
  B('swamp leech', 'insect', ['wetland'], 1, 'small', 'common', 'clings', 'Fat leeches a hand long that drop from the reeds; physicians buy them live.', ['drains blood'], ['live leeches']),
  B('marsh mosquito swarm', 'insect', ['wetland', 'jungle'], 1, 'tiny', 'common', 'relentless', 'Whining clouds over the standing water that bring the marsh fever.', ['spreads fever'], []),
  B('giant crab', 'beast', ['coast'], 2, 'medium', 'uncommon', 'territorial', 'Crabs the size of shields that come up the beaches at night.', ['crushing claws', 'armoured'], ['crab meat', 'shell']),
  B('seal', 'beast', ['coast', 'arctic'], 1, 'medium', 'common', 'shy', 'Seals basking on the skerries; some are said to shed their skins and walk as people.', ['swims'], ['sealskin', 'oil', 'meat']),
  B('walrus', 'beast', ['coast', 'ice'], 2, 'large', 'uncommon', 'short-tempered', 'Tusked giants of the ice floes, hunted for ivory and oil.', ['goring tusks', 'swims'], ['ivory', 'oil', 'hide'], { needs: ['arctic'] }),
  B('pike', 'fish', ['river', 'wetland'], 1, 'small', 'common', 'ravenous', 'Long green pike that lurk in the weed and take ducklings.', ['swims'], ['fish']),
  B('salmon run', 'fish', ['river', 'boreal'], 1, 'small', 'common', 'harmless', 'Each autumn the salmon crowd up the rivers; bears and men gather for them.', ['swims'], ['fish']),
  // ---- Monsters ------------------------------------------------------------------------------
  B('troll', 'giant', ['mountain', 'forest', 'boreal'], 4, 'large', 'uncommon', 'hungry and dull', 'Grey, warty giants of the hills that eat anything and turn to stone in the sunlight. They mend their wounds.', ['regrows its wounds', 'stone in sunlight', 'great strength'], ['troll blood'], { night: true }),
  B('ogre', 'giant', ['forest', 'mountain', 'grass'], 3, 'large', 'uncommon', 'greedy', 'Brutish man-eaters twice a man\'s height who take tolls at bridges and carry off sheep.', ['great strength', 'thrown boulders'], []),
  B('hill giant', 'giant', ['mountain', 'grass'], 4, 'huge', 'rare', 'quarrelsome', 'Giants of the high moors who herd mammoths and quarrel over stones.', ['great strength', 'thrown boulders'], []),
  B('frost giant', 'giant', ['arctic', 'ice', 'mountain'], 5, 'huge', 'rare', 'warlike', 'Pale giants of the ice who raid in the long nights and keep their halls in the glaciers.', ['great strength', 'unfeeling of cold', 'frost-rimed axe'], [], { needs: ['arctic'] }),
  B('wyvern', 'dragon', ['mountain', 'arid', 'forest'], 4, 'large', 'rare', 'savage', 'A two-legged lesser dragon with a venomous tail sting; it nests on crags and takes cattle.', ['flies', 'venomous tail', 'swoops'], ['wyvern venom', 'scales']),
  B('dragon', 'dragon', ['mountain', 'volcanic', 'arid', 'forest', 'ice'], 5, 'gargantuan', 'legendary', 'proud, cunning and greedy', 'An ancient wyrm that sleeps on its hoard for years at a time; when it wakes, the country burns.', ['flies', 'breath of fire (or frost)', 'speaks', 'scales turn blades'], ['dragon scales', 'dragon blood', 'the hoard']),
  B('wyrm of the deep lake', 'dragon', ['wetland', 'river'], 4, 'huge', 'legendary', 'slumbering', 'A long serpent-dragon said to sleep at the bottom of the deepest lake; fishermen leave it a share of the catch.', ['swims', 'coils', 'drags boats under'], ['scales']),
  B('basilisk', 'monster', ['arid', 'mountain'], 4, 'medium', 'rare', 'lurks', 'An eight-legged lizard whose gaze turns flesh to stone; its lair is ringed by statues.', ['gaze of stone', 'venomous bite'], ['basilisk eye']),
  B('cockatrice', 'monster', ['farmland', 'grass', 'arid'], 3, 'small', 'rare', 'vicious', 'A cock with a serpent\'s tail, hatched (they say) from a cock\'s egg brooded by a toad. Its touch stiffens flesh to stone.', ['stony touch', 'flies a little'], ['cockatrice feathers']),
  B('manticore', 'monster', ['arid', 'mountain', 'grass'], 4, 'large', 'rare', 'cruel', 'A lion with a man\'s face and a tail of iron spines it flings like darts.', ['flung tail spines', 'flies', 'speaks'], ['tail spines']),
  B('griffon', 'monster', ['mountain', 'grass'], 3, 'large', 'rare', 'proud', 'Eagle-headed lions that nest on the peaks; their eggs are worth a knight\'s ransom, for tamed griffons can be ridden.', ['flies', 'mauling claws'], ['griffon feathers', 'eggs']),
  B('harpy', 'monster', ['mountain', 'coast'], 2, 'medium', 'uncommon', 'spiteful', 'Shrieking bird-women that foul what they cannot carry off and lure sailors onto the rocks with song.', ['flies', 'luring song'], ['feathers']),
  B('owlbear', 'monster', ['forest', 'boreal'], 3, 'large', 'uncommon', 'savage', 'A bear with an owl\'s head and hunger, hooting in the night woods.', ['mauling claws', 'hugs'], ['feathers', 'hide'], { night: true }),
  B('basking sea serpent', 'monster', ['coast'], 4, 'gargantuan', 'rare', 'indifferent', 'Sea serpents long as longships that bask in the summer swell; a ship that strikes one is lost.', ['swims', 'coils', 'capsizes boats'], ['scales', 'oil']),
  B('kraken', 'monster', ['coast'], 5, 'gargantuan', 'legendary', 'hungry', 'A many-armed thing of the deep water that drags ships under; its back is taken for an island.', ['many arms', 'drags ships under', 'ink cloud'], ['ink', 'beak']),
  B('bog hag', 'monster', ['wetland', 'cursed'], 3, 'medium', 'uncommon', 'cunning', 'A green-skinned crone of the fens who trades in curses and children.', ['curses', 'casts spells', 'shape-shifts'], ['hag\'s eye'], { night: true }),
  B('werewolf', 'monster', ['forest', 'boreal', 'farmland', 'cursed'], 4, 'medium', 'rare', 'a neighbour by day', 'A man or woman who becomes a wolf under the full moon; its bite passes the curse on.', ['changes at the full moon', 'harmed only by silver', 'bite passes the curse'], ['wolfskin belt'], { night: true }),
  B('gnoll pack', 'humanoid', ['grass', 'arid'], 3, 'medium', 'uncommon', 'raiding', 'Hyena-headed raiders that fall on caravans and outlying farms.', ['hunts in packs', 'bows'], ['loot']),
  B('goblin band', 'humanoid', ['forest', 'mountain', 'grass', 'temperate'], 2, 'small', 'common', 'thieving', 'Small, sly raiders that steal livestock and children and set traps on the forest paths.', ['ambushes', 'traps', 'flees when beaten'], ['loot']),
  B('kobold warren', 'humanoid', ['mountain', 'volcanic'], 2, 'small', 'common', 'cowardly, cunning', 'Little dog-faced trappers of the mines who serve dragons and dig where the miners do not look.', ['traps', 'tunnels'], ['loot']),
  B('lizardfolk raiders', 'humanoid', ['wetland', 'jungle'], 2, 'medium', 'uncommon', 'territorial', 'Scaled hunters of the deep swamps who take boats that stray into their waters.', ['swims', 'spears'], ['loot'], { needs: ['wetland'] }),
  B('giant ant colony', 'insect', ['arid', 'grass', 'tropical'], 3, 'medium', 'uncommon', 'swarming', 'Ants the size of dogs whose mounds rise like hills; the soldiers fight to the last.', ['swarms', 'acid bite', 'tunnels'], ['chitin', 'honeypot ants']),
  B('fire salamander', 'monster', ['volcanic'], 3, 'medium', 'uncommon', 'territorial', 'Lizards of living flame that swim in the lava and set fire to all they touch.', ['burns', 'lives in fire'], ['salamander scales (fireproof)']),
  B('ash wraith', 'spirit', ['volcanic', 'cursed'], 3, 'medium', 'rare', 'hateful', 'The choking ghosts of those buried by the ash, drifting over the grey fields.', ['passes through walls', 'chokes the breath'], [], { night: true }),
  B('myconid circle', 'fey', ['fungal'], 1, 'medium', 'common', 'peaceful', 'Walking mushrooms that share dreams through their spores; they trade with any who come gently.', ['spores of sleep or of dreams', 'shared mind'], ['rare spores']),
  B('spore husk', 'undead', ['fungal', 'cursed'], 3, 'medium', 'uncommon', 'mindless', 'Those overtaken by the mushroom forest, walking on with fungus for a mind.', ['spreads spores', 'feels no pain'], ['spores']),
  // ---- Fey and spirits ------------------------------------------------------------------------
  B('sprite', 'fey', ['forest', 'temperate', 'river'], 1, 'tiny', 'uncommon', 'mischievous', 'Tiny winged folk that sour milk, tangle hair and lead lost children home, or astray.', ['flies', 'turns invisible', 'charms'], ['sprite dust']),
  B('dryad', 'fey', ['forest', 'temperate'], 2, 'medium', 'rare', 'wary of axes', 'The spirit of an old tree, in the shape of a woman with bark-brown skin; she dies if her tree is felled.', ['steps from tree to tree', 'charms', 'bound to her tree'], ['heartwood'], { needs: ['forest'] }),
  B('will-o\'-the-wisp', 'spirit', ['wetland', 'cursed'], 3, 'tiny', 'uncommon', 'luring', 'Pale lights over the marsh that lead travellers into the deep mud.', ['lures', 'turns invisible', 'shocks'], [], { night: true }),
  B('river spirit', 'spirit', ['river'], 2, 'medium', 'uncommon', 'moody', 'The spirit of a river, honoured with gifts at every ford; slighted, it drowns a traveller a year.', ['commands the current', 'shape-shifts'], [], {}),
  B('kelpie', 'fey', ['river', 'wetland', 'coast'], 3, 'large', 'uncommon', 'treacherous', 'A water-horse that offers a ride to the weary, then gallops into the deep water with its rider stuck fast.', ['shape-shifts', 'sticky hide', 'drowns'], ['kelpie bridle']),
  B('selkie', 'fey', ['coast'], 1, 'medium', 'rare', 'shy', 'Seal-folk who come ashore and shed their skins; whoever holds the skin holds the selkie.', ['shape-shifts', 'swims'], ['sealskin']),
  B('wendigo', 'spirit', ['boreal', 'arctic'], 5, 'large', 'rare', 'always hungry', 'A gaunt spirit of winter famine; those who eat human flesh in the hungry months become one.', ['cannot be sated', 'mimics voices', 'unfeeling of cold'], [], { night: true }),
  B('jinn', 'spirit', ['arid'], 4, 'medium', 'rare', 'proud and capricious', 'Spirits of smokeless fire that dwell in ruins and wells; bound, they grant wishes, freed, they take revenge.', ['shape-shifts', 'turns invisible', 'grants wishes'], [], { needs: ['arid'] }),
  B('yeti', 'beast', ['mountain', 'arctic', 'ice'], 3, 'large', 'rare', 'reclusive', 'A white-furred ape of the high snows, seen only by its footprints.', ['unfeeling of cold', 'great strength'], ['white fur']),
  B('nymph of the spring', 'fey', ['temperate', 'mountain', 'forest'], 1, 'medium', 'rare', 'gentle', 'The spirit of a holy spring, who heals those who come with gifts.', ['heals', 'charms'], ['spring water']),
  // ---- The dead -------------------------------------------------------------------------------
  B('barrow-wight', 'undead', ['grass', 'mountain', 'temperate', 'arctic'], 4, 'medium', 'rare', 'hateful', 'A dead chieftain who walks in his grave-mound, cold hands on his grave-goods; his touch chills the life away.', ['life-draining touch', 'commands the dead'], ['grave-goods'], { night: true }),
  B('ghoul', 'undead', ['farmland', 'arid', 'cursed', 'temperate'], 3, 'medium', 'uncommon', 'ravenous', 'Grave-robbing eaters of the dead whose claws numb the flesh.', ['paralysing claws'], [], { night: true }),
  B('restless dead', 'undead', ['cursed', 'farmland', 'temperate'], 2, 'medium', 'uncommon', 'mindless', 'Corpses that will not lie still, walking where the dead were not buried as they should have been.', ['feels no pain', 'slow'], [], { night: true }),
  B('banshee', 'spirit', ['wetland', 'cursed', 'forest'], 3, 'medium', 'rare', 'grieving', 'A wailing woman whose cry foretells death in the house that hears it.', ['wail that kills the weak', 'passes through walls'], [], { night: true }),
  B('vampire', 'undead', ['forest', 'mountain', 'cursed', 'temperate'], 5, 'medium', 'legendary', 'charming, cruel', 'A noble dead who drinks the blood of the living from an old castle above the valley.', ['drinks blood', 'turns to mist', 'charms', 'harmed by sunlight'], [], { night: true }),
  B('bog body', 'undead', ['wetland', 'cursed'], 3, 'medium', 'rare', 'vengeful', 'A sacrifice of the old times, preserved in the peat, that rises when the bog is cut.', ['drags into the mud', 'feels no pain'], ['ancient torc'], { night: true }),
  B('shadow', 'undead', ['cursed'], 3, 'medium', 'uncommon', 'hungry', 'A shadow with no one to cast it, that drinks the strength of those it touches.', ['strength-draining touch', 'hides in darkness'], [], { night: true, needs: ['cursed'] }),
  B('blighted stag', 'monster', ['cursed'], 3, 'large', 'uncommon', 'maddened', 'A deer gone wrong in the cursed wood: antlers like dead branches, eyes like embers.', ['charges', 'spreads blight'], ['blighted antler'], { needs: ['cursed'] }),
];

export interface RegionCreature extends Creature {
  /** What the local people call it, in their language. */
  local?: string;
  /** Something of its own in these parts. */
  here?: string;
  /** How often met here. */
  seen: 'often' | 'sometimes' | 'seldom' | 'in tales';
}

const VARIANTS = [
  'Here they run larger than elsewhere.', 'Those of these parts are smaller and quicker.', 'Here they are darker, nearly black.', 'Those here are paler, almost white.',
  'Here they are bolder with people than elsewhere.', 'They are seldom seen by day here.', 'The local kind is said to be cleverer than most.',
  'Here a reward is paid for every one killed.', 'The local folk will not hunt them, holding them sacred.', 'Here they are fewer than they were, hunted hard.',
  'A white one is said to lead them here.', 'Here they gather in numbers before winter.',
];

/** The creatures of a region, the most dangerous last, with their local names. */
export function bestiary(seed: string, region: Region, localName?: (en: string) => string): RegionCreature[] {
  const r: Rng = mulberry32(hashString(`${seed}#bestiary#${region.key}`));
  const out: RegionCreature[] = [];
  for (const c of CREATURES) {
    const f = fit(region, c.tags, c.needs);
    const roll = r(), vroll = r(), vpick = r();
    if (f < 0.1) continue;
    const chance = c.rarity === 'common' ? 0.95 : c.rarity === 'uncommon' ? 0.55 : c.rarity === 'rare' ? 0.25 : 0.08;
    if (roll > chance * Math.min(1, f * 1.6)) continue;
    const seen = c.rarity === 'legendary' ? 'in tales' : c.rarity === 'rare' ? 'seldom' : f > 0.5 && c.rarity === 'common' ? 'often' : 'sometimes';
    out.push({ ...c, seen, ...(localName ? { local: localName(c.name) } : {}), ...(vroll < 0.35 ? { here: VARIANTS[Math.floor(vpick * VARIANTS.length)] } : {}) });
  }
  const order: CreatureKind[] = ['beast', 'bird', 'fish', 'reptile', 'insect', 'humanoid', 'fey', 'spirit', 'monster', 'giant', 'undead', 'aberration', 'dragon'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.danger - b.danger);
}

export const DANGER_WORD = ['', 'harmless', 'wary', 'dangerous', 'deadly', 'lethal'];
