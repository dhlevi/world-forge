import { hashString, mulberry32, type Rng } from '../gen/rng';
import { BUNDLE } from '../names/bundles';
import type { WorldCulture } from '../names/cultures';

/**
 * How a people look: their build, skin, hair and beards, and how a commoner, a noble and a
 * warrior of theirs dress. Each template sets the range; each culture of the world takes its own
 * colours and fashions from it (seeded by the world and the culture), and the window shows the
 * three figures as a tinted ink sketch (people/sketch.ts) with a written description.
 */

export type Body = 'tunic' | 'robe' | 'gown' | 'wrap' | 'coat' | 'kilt' | 'loin' | 'chiton' | 'none';
export type Sleeves = 'long' | 'short' | 'none' | 'wide';
export type Legs = 'trousers' | 'hose' | 'bare' | 'leggings';
export type Feet = 'bare' | 'shoes' | 'sandals' | 'boots' | 'furry';
export type Head =
  | 'none' | 'hood' | 'cap' | 'turban' | 'furhat' | 'veil' | 'circlet' | 'crown' | 'conical' | 'tallhat' | 'wide' | 'feathers' | 'headdress'
  | 'kerchief' | 'fez' | 'diadem' | 'wreath';
export type Cloak = 'cloak' | 'cape' | 'fur' | 'mantle' | 'shawl';
export type Pattern = 'plaid' | 'stripes' | 'border' | 'dots' | 'checks' | 'zigzag';
export type Armour = 'none' | 'mail' | 'scale' | 'lamellar' | 'plate' | 'leather' | 'quilted' | 'hide' | 'cotton';
export type Helm = 'none' | 'nasal' | 'kettle' | 'crested' | 'spangen' | 'kabuto' | 'great' | 'plumed' | 'feathered' | 'spiked' | 'turban' | 'skull' | 'domed' | 'hood' | 'circlet';
export type Weapon = 'spear' | 'sword' | 'axe' | 'bow' | 'club' | 'scimitar' | 'halberd' | 'hammer' | 'glaive' | 'katana' | 'macuahuitl' | 'pick' | 'staff' | 'trident';
export type Shield = 'none' | 'round' | 'kite' | 'oval' | 'tall' | 'hide' | 'small' | 'heater';
export type HairStyle = 'short' | 'long' | 'braids' | 'topknot' | 'shaved' | 'bald' | 'crest' | 'bun' | 'curly' | 'tied' | 'loose';
export type Beard = 'none' | 'short' | 'full' | 'long' | 'braided' | 'moustache' | 'forked';
export type Kind = 'human' | 'elf' | 'dwarf' | 'halfling' | 'orc' | 'lizard' | 'gnome' | 'fungus';
export type Colour = [string, string];

export interface OutfitSpec {
  body: Body | Body[];
  /** Hem height as a share of the figure's height above the feet (0 ankle-length, 0.27 the knee). */
  hem: number;
  flare?: number;
  sleeves: Sleeves | Sleeves[];
  legs: Legs | Legs[];
  feet: Feet | Feet[];
  head?: Head[];
  cloak?: (Cloak | 'none')[];
  belt?: 'belt' | 'sash';
  jewel?: 'torc' | 'chain' | 'beads' | 'collar' | 'gold' | 'jade' | 'pendant';
  pattern?: (Pattern | 'none')[];
  /** Colours from: dull (homespun), bright (dyed), white, dark. */
  col: 'dull' | 'bright' | 'white' | 'dark';
}
export interface WarriorSpec extends OutfitSpec {
  armour: Armour[];
  helm: Helm[];
  weapon: Weapon[];
  shield: Shield[];
}
export interface LookSpec {
  kind?: Kind;
  /** Height and breadth (1 for humans) and head size. */
  h?: number;
  broad?: number;
  headK?: number;
  build: string;
  skin: Colour[];
  hair: Colour[];
  hairM: HairStyle[];
  hairF: HairStyle[];
  beard: Beard[];
  /** Further marks of the people ("pointed ears", "tattooed faces"). */
  marks?: string;
  paint?: 'tattoo' | 'paint' | 'scars';
  dull: Colour[];
  bright: Colour[];
  common: OutfitSpec;
  noble: OutfitSpec;
  warrior: WarriorSpec;
}

// ---- Shared colours ----------------------------------------------------------------------------
const SK = {
  pale: ['#f2dcc8', 'pale'], fair: ['#edc9a6', 'fair'], ruddy: ['#e8b896', 'ruddy'], olive: ['#d3a878', 'olive'], tan: ['#c4915f', 'tan'],
  copper: ['#b47a4c', 'copper'], brown: ['#99673f', 'brown'], dark: ['#6f4a2f', 'dark brown'], deep: ['#533625', 'deep brown'], golden: ['#d9b07a', 'golden'],
  green: ['#8a9a62', 'grey-green'], olivegreen: ['#77864c', 'olive green'], ash: ['#8c8c96', 'ash grey'], slate: ['#5c5d6e', 'slate grey'], violet: ['#4a4058', 'violet-black'],
  stone: ['#9a948a', 'stone grey'], mushroom: ['#e6dccb', 'pale cream'],
  jade: ['#6f9a6e', 'jade green'], bronze: ['#8f7a4a', 'bronze'], scaleRed: ['#a0654a', 'rust red'],
} satisfies Record<string, Colour>;
const HR = {
  flax: ['#e2cd8c', 'flaxen'], straw: ['#d8bf7a', 'straw-fair'], red: ['#b15a2f', 'red'], auburn: ['#8a4a2b', 'auburn'], brown: ['#6b4a2e', 'brown'],
  darkbrown: ['#45301f', 'dark brown'], black: ['#1f1a17', 'black'], blueblack: ['#14161c', 'blue-black'], silver: ['#d8dde2', 'silver'], white: ['#f0ede6', 'white'],
  gold: ['#d9b54a', 'golden'], copper: ['#a9562a', 'copper'], grey: ['#9b9a96', 'iron grey'], none: ['#00000000', 'none'],
} satisfies Record<string, Colour>;
const C = (hex: string, name: string): Colour => [hex, name];
const HOMESPUN = [C('#8b7b5c', 'undyed brown'), C('#9c8e6c', 'oatmeal'), C('#6f6a52', 'drab green'), C('#7b5e45', 'russet'), C('#5e6a6e', 'blue-grey'), C('#a39272', 'fawn')];


// ---- Templates ---------------------------------------------------------------------------------
export const LOOKS: Record<string, LookSpec> = {
  anglo: {
    build: 'of middling height and sturdy', skin: [SK.fair, SK.ruddy, SK.pale], hair: [HR.brown, HR.straw, HR.darkbrown, HR.red],
    hairM: ['short', 'short', 'long'], hairF: ['long', 'braids', 'bun'], beard: ['short', 'full', 'none', 'moustache'],
    dull: HOMESPUN, bright: [C('#2f5d8c', 'woad blue'), C('#9e2b25', 'madder red'), C('#3c6b3a', 'Lincoln green'), C('#c49a2c', 'weld yellow'), C('#5b3a6b', 'murrey')],
    common: { body: 'tunic', hem: 0.27, sleeves: 'long', legs: 'hose', feet: 'shoes', head: ['hood', 'none', 'cap'], cloak: ['none', 'cloak'], belt: 'belt', col: 'dull' },
    noble: { body: ['gown', 'robe'], hem: 0, flare: 0.1, sleeves: ['wide', 'long'], legs: 'hose', feet: 'shoes', head: ['circlet', 'veil', 'none'], cloak: ['mantle', 'cloak'], belt: 'belt', jewel: 'chain', pattern: ['none', 'border'], col: 'bright' },
    warrior: { body: 'tunic', hem: 0.24, sleeves: 'long', legs: 'hose', feet: 'boots', armour: ['mail'], helm: ['nasal', 'kettle', 'great'], weapon: ['sword', 'spear', 'axe'], shield: ['kite', 'heater'], col: 'bright' },
  },
  norse: {
    build: 'tall and big-boned', skin: [SK.pale, SK.fair, SK.ruddy], hair: [HR.flax, HR.straw, HR.red, HR.brown],
    hairM: ['long', 'braids', 'tied'], hairF: ['braids', 'long', 'bun'], beard: ['full', 'braided', 'long', 'forked'],
    dull: HOMESPUN, bright: [C('#2b4f7a', 'blue'), C('#8f2a22', 'red'), C('#5a6b2e', 'green'), C('#6b4a2e', 'brown')],
    common: { body: 'tunic', hem: 0.3, sleeves: 'long', legs: ['trousers', 'leggings'], feet: 'boots', head: ['none', 'cap'], cloak: ['cloak', 'fur'], belt: 'belt', col: 'dull' },
    noble: { body: ['tunic', 'gown'], hem: 0.12, sleeves: 'long', legs: 'trousers', feet: 'boots', head: ['none', 'kerchief'], cloak: ['fur', 'cloak'], belt: 'belt', jewel: 'torc', pattern: ['border', 'zigzag'], col: 'bright' },
    warrior: { body: 'tunic', hem: 0.27, sleeves: 'long', legs: 'trousers', feet: 'boots', armour: ['mail', 'leather', 'quilted'], helm: ['spangen', 'domed', 'nasal'], weapon: ['axe', 'spear', 'sword'], shield: ['round'], col: 'bright' },
  },
  latin: {
    build: 'of middling height and wiry', skin: [SK.olive, SK.tan, SK.fair], hair: [HR.darkbrown, HR.black, HR.brown],
    hairM: ['short', 'curly'], hairF: ['bun', 'long', 'curly'], beard: ['none', 'short', 'none'],
    dull: [C('#a8967a', 'undyed linen'), C('#8a6a4a', 'brown'), C('#9c8e6c', 'oatmeal'), C('#7a6e5a', 'grey')], bright: [C('#7a2335', 'purple'), C('#b8462e', 'red'), C('#d8c08a', 'saffron'), C('#2e5a7a', 'blue')],
    common: { body: 'tunic', hem: 0.28, sleeves: 'short', legs: 'bare', feet: 'sandals', head: ['none', 'wide'], belt: 'belt', col: 'dull' },
    noble: { body: ['robe', 'gown'], hem: 0, flare: 0.08, sleeves: ['short', 'long'], legs: 'bare', feet: 'shoes', head: ['none', 'wreath', 'veil'], cloak: ['mantle'], jewel: 'gold', pattern: ['border'], col: 'white' },
    warrior: { body: 'tunic', hem: 0.3, sleeves: 'short', legs: 'bare', feet: 'sandals', armour: ['lamellar', 'mail', 'plate'], helm: ['crested', 'plumed'], weapon: ['sword', 'spear'], shield: ['tall', 'oval'], col: 'bright' },
  },
  celtic: {
    build: 'tall and lean', skin: [SK.pale, SK.fair, SK.ruddy], hair: [HR.red, HR.auburn, HR.copper, HR.darkbrown, HR.flax],
    hairM: ['long', 'tied', 'braids'], hairF: ['long', 'braids', 'loose'], beard: ['moustache', 'full', 'none'], paint: 'tattoo', marks: 'blue woad patterns on the skin, many of them',
    dull: HOMESPUN, bright: [C('#2e6b3a', 'green'), C('#9e2b25', 'red'), C('#c49a2c', 'saffron'), C('#2f4d7a', 'blue')],
    common: { body: 'tunic', hem: 0.27, sleeves: 'long', legs: 'trousers', feet: 'shoes', cloak: ['cloak', 'shawl'], belt: 'belt', pattern: ['plaid', 'checks'], col: 'dull' },
    noble: { body: ['gown', 'tunic'], hem: 0.05, sleeves: 'long', legs: 'trousers', feet: 'shoes', head: ['circlet', 'none'], cloak: ['cloak'], belt: 'belt', jewel: 'torc', pattern: ['plaid', 'checks'], col: 'bright' },
    warrior: { body: 'tunic', hem: 0.3, sleeves: 'none', legs: 'trousers', feet: 'shoes', armour: ['none', 'mail', 'leather'], helm: ['none', 'domed'], weapon: ['sword', 'spear'], shield: ['oval', 'tall'], jewel: 'torc', pattern: ['plaid'], col: 'bright' },
  },
  elvish: {
    kind: 'elf', h: 1.07, broad: 0.86, build: 'tall and slender, long-limbed and light of step', skin: [SK.pale, SK.fair, SK.golden], hair: [HR.silver, HR.gold, HR.blueblack, HR.copper, HR.flax],
    hairM: ['long', 'loose', 'braids'], hairF: ['long', 'loose', 'braids'], beard: ['none'], marks: 'pointed ears, large bright eyes and no beards; they look young until great age',
    dull: [C('#6e7d5a', 'moss green'), C('#8a8a74', 'grey-green'), C('#7a6a52', 'bark brown'), C('#9aa38c', 'willow grey')], bright: [C('#3d6b52', 'leaf green'), C('#c9c4b0', 'moon white'), C('#5a6e8c', 'twilight blue'), C('#b39a52', 'autumn gold')],
    common: { body: 'tunic', hem: 0.24, sleeves: 'long', legs: 'leggings', feet: 'boots', head: ['none', 'hood'], cloak: ['cloak'], belt: 'sash', col: 'dull' },
    noble: { body: ['gown', 'robe'], hem: 0, flare: 0.12, sleeves: ['wide'], legs: 'leggings', feet: 'shoes', head: ['diadem', 'circlet', 'wreath'], cloak: ['mantle', 'none'], belt: 'sash', pattern: ['border', 'none'], col: 'bright' },
    warrior: { body: 'tunic', hem: 0.22, sleeves: 'long', legs: 'leggings', feet: 'boots', armour: ['scale', 'leather'], helm: ['crested', 'circlet', 'none'], weapon: ['bow', 'glaive', 'sword'], shield: ['none', 'kite'], cloak: ['cloak'], col: 'bright' },
  },
  desert: {
    build: 'lean and of middling height', skin: [SK.olive, SK.tan, SK.copper, SK.brown], hair: [HR.black, HR.darkbrown],
    hairM: ['short', 'curly'], hairF: ['long', 'braids'], beard: ['full', 'short', 'full'],
    dull: [C('#cfc3a8', 'undyed cotton'), C('#a8916a', 'camel'), C('#8a7a62', 'dun'), C('#e3dccb', 'white')], bright: [C('#2b4a8c', 'indigo'), C('#9e2b25', 'crimson'), C('#2e6b5a', 'green'), C('#c49a2c', 'gold')],
    common: { body: 'robe', hem: 0.04, sleeves: 'long', legs: 'trousers', feet: 'sandals', head: ['turban', 'kerchief'], belt: 'sash', col: 'dull' },
    noble: { body: 'robe', hem: 0, flare: 0.1, sleeves: 'wide', legs: 'trousers', feet: 'shoes', head: ['turban', 'veil'], cloak: ['mantle'], belt: 'sash', jewel: 'gold', pattern: ['border', 'stripes'], col: 'bright' },
    warrior: { body: 'coat', hem: 0.2, sleeves: 'long', legs: 'trousers', feet: 'boots', armour: ['mail', 'lamellar'], helm: ['turban', 'spiked'], weapon: ['scimitar', 'spear', 'bow'], shield: ['round', 'small'], belt: 'sash', col: 'bright' },
  },
  slavic: {
    build: 'tall and broad', skin: [SK.pale, SK.fair, SK.ruddy], hair: [HR.straw, HR.brown, HR.darkbrown, HR.flax],
    hairM: ['short', 'long'], hairF: ['braids', 'long'], beard: ['full', 'long', 'short'],
    dull: HOMESPUN, bright: [C('#9e2b25', 'red'), C('#2f5d8c', 'blue'), C('#d8cbb0', 'white linen'), C('#c49a2c', 'gold')],
    common: { body: 'tunic', hem: 0.3, sleeves: 'long', legs: 'trousers', feet: ['boots', 'shoes'], head: ['furhat', 'kerchief', 'none'], belt: 'sash', pattern: ['border'], col: 'white' },
    noble: { body: ['coat', 'gown'], hem: 0, flare: 0.08, sleeves: 'long', legs: 'trousers', feet: 'boots', head: ['furhat', 'crown', 'kerchief'], cloak: ['fur'], belt: 'sash', jewel: 'chain', pattern: ['border'], col: 'bright' },
    warrior: { body: 'coat', hem: 0.24, sleeves: 'long', legs: 'trousers', feet: 'boots', armour: ['mail', 'scale', 'lamellar'], helm: ['spiked', 'domed'], weapon: ['axe', 'spear', 'sword'], shield: ['kite', 'round'], col: 'bright' },
  },
  dwarven: {
    kind: 'dwarf', h: 0.68, broad: 1.35, headK: 1.25, build: 'short, broad and enormously strong', skin: [SK.ruddy, SK.fair, SK.tan], hair: [HR.red, HR.brown, HR.black, HR.grey, HR.copper],
    hairM: ['long', 'braids'], hairF: ['braids', 'long'], beard: ['long', 'braided', 'forked'], marks: 'long beards, which the men braid and bind with rings (and some of the women too)',
    dull: [C('#6b5a46', 'leather brown'), C('#5e5e58', 'soot grey'), C('#7b5e45', 'russet'), C('#4a4a3e', 'dark olive')], bright: [C('#8f2a22', 'deep red'), C('#2b4a6b', 'blue'), C('#b38a2c', 'gold'), C('#3c5a3a', 'green')],
    common: { body: 'tunic', hem: 0.27, sleeves: 'long', legs: 'trousers', feet: 'boots', head: ['hood', 'cap', 'none'], belt: 'belt', col: 'dull' },
    noble: { body: 'robe', hem: 0.02, sleeves: 'long', legs: 'trousers', feet: 'boots', head: ['crown', 'circlet'], cloak: ['cape', 'fur'], belt: 'belt', jewel: 'chain', pattern: ['border', 'zigzag'], col: 'bright' },
    warrior: { body: 'tunic', hem: 0.24, sleeves: 'long', legs: 'trousers', feet: 'boots', armour: ['plate', 'mail', 'scale'], helm: ['great', 'domed', 'nasal'], weapon: ['axe', 'hammer', 'pick'], shield: ['round', 'heater'], col: 'bright' },
  },
  southern: {
    build: 'of middling height and well-made', skin: [SK.olive, SK.tan, SK.fair], hair: [HR.black, HR.darkbrown, HR.brown],
    hairM: ['curly', 'short'], hairF: ['bun', 'curly', 'long'], beard: ['full', 'short', 'none'],
    dull: [C('#cfc3a8', 'undyed linen'), C('#a8967a', 'oatmeal'), C('#8a7a62', 'dun')], bright: [C('#3a5a8c', 'sea blue'), C('#b8462e', 'red'), C('#c49a2c', 'saffron'), C('#6b2e5a', 'purple')],
    common: { body: 'chiton', hem: 0.3, sleeves: 'none', legs: 'bare', feet: 'sandals', head: ['none', 'wide'], belt: 'belt', col: 'dull' },
    noble: { body: ['chiton', 'gown'], hem: 0, flare: 0.08, sleeves: 'short', legs: 'bare', feet: 'sandals', head: ['wreath', 'diadem', 'veil'], cloak: ['mantle'], jewel: 'gold', pattern: ['border'], col: 'white' },
    warrior: { body: 'chiton', hem: 0.32, sleeves: 'none', legs: 'bare', feet: 'sandals', armour: ['plate', 'quilted'], helm: ['crested', 'plumed'], weapon: ['spear', 'sword'], shield: ['round'], col: 'bright' },
  },
  steppe: {
    build: 'stocky, short-legged and hardy', skin: [SK.golden, SK.tan, SK.olive, SK.copper], hair: [HR.black, HR.darkbrown],
    hairM: ['braids', 'topknot', 'shaved'], hairF: ['braids', 'long'], beard: ['moustache', 'short', 'none'],
    dull: [C('#8a7a5c', 'felt brown'), C('#a39272', 'fawn'), C('#6b6a5a', 'grey'), C('#7b5e45', 'russet')], bright: [C('#2b5a8c', 'sky blue'), C('#9e2b25', 'red'), C('#2e6b3a', 'green'), C('#c49a2c', 'gold')],
    common: { body: 'coat', hem: 0.25, sleeves: 'long', legs: 'trousers', feet: 'boots', head: ['furhat', 'conical'], belt: 'sash', col: 'dull' },
    noble: { body: 'coat', hem: 0.05, flare: 0.06, sleeves: 'long', legs: 'trousers', feet: 'boots', head: ['furhat', 'conical', 'tallhat'], cloak: ['fur'], belt: 'sash', jewel: 'gold', pattern: ['border'], col: 'bright' },
    warrior: { body: 'coat', hem: 0.22, sleeves: 'long', legs: 'trousers', feet: 'boots', armour: ['lamellar', 'leather', 'scale'], helm: ['spiked', 'domed', 'turban'], weapon: ['bow', 'scimitar', 'spear'], shield: ['small', 'none'], belt: 'sash', col: 'bright' },
  },
  jungle: {
    build: 'compact and strong', skin: [SK.copper, SK.brown, SK.tan], hair: [HR.black, HR.blueblack],
    hairM: ['long', 'tied', 'topknot'], hairF: ['braids', 'long', 'bun'], beard: ['none'], paint: 'paint', marks: 'painted or tattooed faces, many of them',
    dull: [C('#d8cbb0', 'white cotton'), C('#a8916a', 'undyed cotton'), C('#8a6a4a', 'brown')], bright: [C('#2e7a6b', 'quetzal green'), C('#b8462e', 'cochineal red'), C('#2b4a8c', 'Maya blue'), C('#d8a02c', 'yellow')],
    common: { body: ['loin', 'kilt'], hem: 0.36, sleeves: 'none', legs: 'bare', feet: ['sandals', 'bare'], head: ['none', 'kerchief'], cloak: ['mantle', 'none'], col: 'white' },
    noble: { body: ['gown', 'kilt'], hem: 0.08, sleeves: 'none', legs: 'bare', feet: 'sandals', head: ['headdress'], cloak: ['cape'], jewel: 'jade', pattern: ['zigzag', 'border'], col: 'bright' },
    warrior: { body: 'kilt', hem: 0.34, sleeves: 'none', legs: 'bare', feet: 'sandals', armour: ['cotton', 'quilted'], helm: ['feathered', 'skull'], weapon: ['macuahuitl', 'spear', 'club'], shield: ['round'], jewel: 'jade', col: 'bright' },
  },
  sinic: {
    build: 'slight and of middling height', skin: [SK.fair, SK.golden, SK.olive], hair: [HR.black, HR.blueblack],
    hairM: ['topknot', 'bun'], hairF: ['bun', 'long'], beard: ['none', 'moustache', 'short'],
    dull: [C('#5e6a72', 'indigo-grey'), C('#8a7a5c', 'hemp brown'), C('#3e4a5a', 'dark blue'), C('#9c9478', 'hemp')], bright: [C('#9e2b25', 'vermilion'), C('#c49a2c', 'imperial yellow'), C('#2e6b5a', 'jade'), C('#2b3a6b', 'deep blue')],
    common: { body: 'coat', hem: 0.28, sleeves: 'long', legs: 'trousers', feet: 'shoes', head: ['wide', 'kerchief', 'none'], belt: 'sash', col: 'dull' },
    noble: { body: 'robe', hem: 0, flare: 0.1, sleeves: 'wide', legs: 'trousers', feet: 'shoes', head: ['tallhat', 'diadem', 'crown'], belt: 'sash', jewel: 'jade', pattern: ['border', 'none'], col: 'bright' },
    warrior: { body: 'coat', hem: 0.2, sleeves: 'long', legs: 'trousers', feet: 'boots', armour: ['lamellar', 'scale'], helm: ['plumed', 'domed'], weapon: ['glaive', 'sword', 'spear'], shield: ['oval', 'round'], col: 'bright' },
  },
  japonic: {
    build: 'slight and of middling height', skin: [SK.fair, SK.golden], hair: [HR.black, HR.blueblack],
    hairM: ['topknot'], hairF: ['bun', 'long'], beard: ['none', 'moustache'],
    dull: [C('#3e4a5a', 'indigo'), C('#8a7a5c', 'hemp brown'), C('#6b6a5a', 'grey')], bright: [C('#9e2b25', 'red'), C('#2b3a6b', 'deep blue'), C('#6b2e5a', 'purple'), C('#c4a02c', 'gold')],
    common: { body: 'coat', hem: 0.3, sleeves: 'long', legs: ['bare', 'trousers'], feet: 'sandals', head: ['wide', 'kerchief'], belt: 'sash', col: 'dull' },
    noble: { body: 'robe', hem: 0, flare: 0.14, sleeves: 'wide', legs: 'trousers', feet: 'sandals', head: ['tallhat', 'none'], belt: 'sash', pattern: ['dots', 'none'], col: 'bright' },
    warrior: { body: 'coat', hem: 0.2, sleeves: 'wide', legs: 'trousers', feet: 'sandals', armour: ['lamellar'], helm: ['kabuto'], weapon: ['katana', 'glaive', 'bow'], shield: ['none'], col: 'bright' },
  },
  koreanic: {
    build: 'of middling height', skin: [SK.fair, SK.golden], hair: [HR.black],
    hairM: ['topknot'], hairF: ['bun', 'braids'], beard: ['short', 'moustache', 'none'],
    dull: [C('#e3dccb', 'white hemp'), C('#cfc3a8', 'undyed cloth'), C('#9c9478', 'hemp')], bright: [C('#2e5a8c', 'blue'), C('#b8462e', 'red'), C('#c49a2c', 'yellow'), C('#2e6b3a', 'green')],
    common: { body: 'coat', hem: 0.3, sleeves: 'long', legs: 'trousers', feet: 'shoes', head: ['none', 'kerchief'], belt: 'sash', col: 'white' },
    noble: { body: ['robe', 'gown'], hem: 0, flare: 0.14, sleeves: 'wide', legs: 'trousers', feet: 'shoes', head: ['tallhat'], belt: 'sash', col: 'bright' },
    warrior: { body: 'coat', hem: 0.2, sleeves: 'long', legs: 'trousers', feet: 'boots', armour: ['lamellar', 'quilted'], helm: ['plumed', 'domed'], weapon: ['bow', 'sword', 'spear'], shield: ['none', 'round'], col: 'bright' },
  },
  woodland: {
    build: 'tall and strong', skin: [SK.copper, SK.tan, SK.brown], hair: [HR.black, HR.blueblack],
    hairM: ['crest', 'long', 'braids'], hairF: ['braids', 'long'], beard: ['none'], paint: 'paint', marks: 'faces painted for war and for mourning',
    dull: [C('#b39a72', 'buckskin'), C('#8a6a4a', 'smoked hide'), C('#a8916a', 'tan')], bright: [C('#9e2b25', 'red'), C('#2b2b2b', 'black'), C('#d8cbb0', 'white'), C('#2e6b5a', 'blue-green')],
    common: { body: 'tunic', hem: 0.3, sleeves: ['none', 'long'], legs: 'leggings', feet: 'shoes', head: ['none', 'feathers'], belt: 'belt', pattern: ['dots', 'border'], col: 'dull' },
    noble: { body: ['tunic', 'gown'], hem: 0.14, sleeves: 'long', legs: 'leggings', feet: 'shoes', head: ['feathers', 'headdress'], cloak: ['mantle', 'fur'], jewel: 'beads', pattern: ['border', 'zigzag'], col: 'dull' },
    warrior: { body: 'loin', hem: 0.38, sleeves: 'none', legs: 'leggings', feet: 'shoes', armour: ['none', 'hide'], helm: ['feathered', 'none'], weapon: ['club', 'bow', 'spear'], shield: ['round', 'none'], jewel: 'beads', col: 'dull' },
  },
  highland: {
    build: 'short, broad-chested and tireless in the thin air', skin: [SK.copper, SK.tan, SK.brown], hair: [HR.black],
    hairM: ['short', 'long'], hairF: ['braids'], beard: ['none'],
    dull: [C('#a8916a', 'alpaca brown'), C('#cfc3a8', 'undyed cloth'), C('#6b5a46', 'dark brown')], bright: [C('#b8462e', 'red'), C('#d8a02c', 'yellow'), C('#2e6b5a', 'green'), C('#6b2e5a', 'purple')],
    common: { body: 'tunic', hem: 0.3, sleeves: 'none', legs: 'bare', feet: 'sandals', head: ['cap', 'kerchief'], cloak: ['mantle', 'shawl'], pattern: ['stripes', 'zigzag'], col: 'bright' },
    noble: { body: ['tunic', 'gown'], hem: 0.1, sleeves: 'none', legs: 'bare', feet: 'sandals', head: ['crown', 'feathers'], cloak: ['mantle'], jewel: 'gold', pattern: ['checks', 'zigzag'], col: 'bright' },
    warrior: { body: 'tunic', hem: 0.3, sleeves: 'none', legs: 'bare', feet: 'sandals', armour: ['quilted', 'cotton'], helm: ['domed', 'feathered'], weapon: ['club', 'spear', 'staff'], shield: ['round', 'small'], pattern: ['checks'], col: 'bright' },
  },
  indic: {
    build: 'slender and of middling height', skin: [SK.tan, SK.copper, SK.brown, SK.dark], hair: [HR.black, HR.blueblack],
    hairM: ['long', 'bun'], hairF: ['braids', 'bun', 'long'], beard: ['moustache', 'full', 'none'],
    dull: [C('#e3dccb', 'white cotton'), C('#cfc3a8', 'undyed cloth'), C('#b39a72', 'tan')], bright: [C('#c46a1e', 'saffron'), C('#9e2b5a', 'magenta'), C('#2e6b5a', 'green'), C('#b8462e', 'red')],
    common: { body: ['wrap', 'kilt'], hem: 0.08, sleeves: 'none', legs: 'bare', feet: ['bare', 'sandals'], head: ['turban', 'none'], col: 'white' },
    noble: { body: ['wrap', 'gown'], hem: 0, flare: 0.08, sleeves: ['short', 'none'], legs: 'bare', feet: 'sandals', head: ['turban', 'crown', 'veil'], belt: 'sash', jewel: 'gold', pattern: ['border'], col: 'bright' },
    warrior: { body: 'coat', hem: 0.24, sleeves: 'long', legs: 'trousers', feet: 'shoes', armour: ['quilted', 'mail', 'lamellar'], helm: ['turban', 'spiked'], weapon: ['scimitar', 'spear', 'bow'], shield: ['round'], belt: 'sash', col: 'bright' },
  },
  sahelian: {
    build: 'tall and long-limbed', skin: [SK.dark, SK.deep, SK.brown], hair: [HR.black],
    hairM: ['short', 'braids'], hairF: ['braids', 'bun'], beard: ['short', 'none', 'full'],
    dull: [C('#e3dccb', 'white cotton'), C('#cfc3a8', 'undyed cloth'), C('#8a6a4a', 'brown')], bright: [C('#2b3a7a', 'indigo'), C('#c49a2c', 'gold'), C('#b8462e', 'red'), C('#2e6b5a', 'green')],
    common: { body: 'robe', hem: 0.06, sleeves: 'wide', legs: 'trousers', feet: 'sandals', head: ['cap', 'kerchief'], col: 'white' },
    noble: { body: 'robe', hem: 0, flare: 0.16, sleeves: 'wide', legs: 'trousers', feet: 'sandals', head: ['turban', 'fez', 'kerchief'], jewel: 'gold', pattern: ['border', 'zigzag'], col: 'bright' },
    warrior: { body: 'robe', hem: 0.2, sleeves: 'long', legs: 'trousers', feet: 'sandals', armour: ['quilted', 'mail'], helm: ['turban', 'domed'], weapon: ['spear', 'sword'], shield: ['tall', 'round'], col: 'bright' },
  },
  zanji: {
    build: 'tall and lean', skin: [SK.dark, SK.brown, SK.deep, SK.copper], hair: [HR.black],
    hairM: ['short', 'curly'], hairF: ['braids', 'curly', 'bun'], beard: ['short', 'none', 'full'],
    dull: [C('#e3dccb', 'white cotton'), C('#cfc3a8', 'undyed cloth'), C('#b39a72', 'tan')], bright: [C('#b8462e', 'red'), C('#c49a2c', 'gold'), C('#2b5a8c', 'blue'), C('#2e6b3a', 'green')],
    common: { body: ['wrap', 'robe'], hem: 0.1, sleeves: ['none', 'long'], legs: 'bare', feet: 'sandals', head: ['cap', 'kerchief', 'none'], cloak: ['shawl', 'none'], col: 'white' },
    noble: { body: ['robe', 'gown'], hem: 0, flare: 0.08, sleeves: 'long', legs: 'trousers', feet: 'sandals', head: ['fez', 'turban', 'kerchief'], cloak: ['shawl'], jewel: 'gold', pattern: ['border', 'stripes'], col: 'white' },
    warrior: { body: 'wrap', hem: 0.26, sleeves: 'none', legs: 'bare', feet: 'sandals', armour: ['quilted', 'hide', 'mail'], helm: ['none', 'domed'], weapon: ['spear', 'sword'], shield: ['hide', 'round'], col: 'bright' },
  },
  islander: {
    build: 'tall and powerfully built', skin: [SK.copper, SK.brown, SK.tan], hair: [HR.black, HR.darkbrown],
    hairM: ['tied', 'long', 'topknot'], hairF: ['long', 'loose'], beard: ['none', 'short'], paint: 'tattoo', marks: 'tattoos that tell a person\'s rank and lineage',
    dull: [C('#b39a72', 'bark cloth'), C('#a8916a', 'flax'), C('#8a6a4a', 'brown')], bright: [C('#b8462e', 'red'), C('#d8a02c', 'yellow'), C('#2b2b2b', 'black'), C('#d8cbb0', 'white')],
    common: { body: ['kilt', 'wrap'], hem: 0.3, sleeves: 'none', legs: 'bare', feet: 'bare', head: ['none', 'wreath'], pattern: ['zigzag', 'none'], col: 'dull' },
    noble: { body: ['kilt', 'gown'], hem: 0.2, sleeves: 'none', legs: 'bare', feet: 'bare', head: ['headdress', 'wreath'], cloak: ['cape'], jewel: 'pendant', pattern: ['zigzag', 'checks'], col: 'bright' },
    warrior: { body: 'kilt', hem: 0.34, sleeves: 'none', legs: 'bare', feet: 'bare', armour: ['none'], helm: ['feathered', 'none'], weapon: ['club', 'spear'], shield: ['none'], jewel: 'pendant', col: 'dull' },
  },
  halfling: {
    kind: 'halfling', h: 0.56, broad: 1.05, headK: 1.2, build: 'small, round-faced and comfortably plump', skin: [SK.ruddy, SK.fair, SK.tan], hair: [HR.brown, HR.auburn, HR.darkbrown, HR.straw],
    hairM: ['curly'], hairF: ['curly', 'braids'], beard: ['none'], marks: 'large feet with hairy tops, which go bare most of the year',
    dull: HOMESPUN, bright: [C('#c49a2c', 'mustard'), C('#3c6b3a', 'green'), C('#9e4a25', 'rust'), C('#5a7a9c', 'cornflower')],
    common: { body: 'tunic', hem: 0.3, sleeves: 'long', legs: 'trousers', feet: 'furry', head: ['none', 'kerchief'], belt: 'belt', col: 'dull' },
    noble: { body: ['coat', 'gown'], hem: 0.2, sleeves: 'long', legs: 'trousers', feet: 'furry', head: ['none', 'cap'], belt: 'belt', jewel: 'chain', pattern: ['none', 'checks'], col: 'bright' },
    warrior: { body: 'tunic', hem: 0.28, sleeves: 'long', legs: 'trousers', feet: 'furry', armour: ['leather', 'quilted'], helm: ['none', 'domed'], weapon: ['bow', 'sword', 'spear'], shield: ['small', 'none'], col: 'bright' },
  },
  orcish: {
    kind: 'orc', h: 1.04, broad: 1.25, build: 'tall, heavy-shouldered and long-armed', skin: [SK.green, SK.olivegreen, SK.ash], hair: [HR.black, HR.darkbrown],
    hairM: ['crest', 'shaved', 'topknot', 'long'], hairF: ['braids', 'long'], beard: ['none', 'short'], paint: 'scars', marks: 'jutting lower tusks, heavy brows and ritual scars',
    dull: [C('#6b5a46', 'hide'), C('#4a4a3e', 'dark olive'), C('#7b5e45', 'leather'), C('#5e5e58', 'soot')], bright: [C('#8f2a22', 'blood red'), C('#2b2b2b', 'black'), C('#b38a2c', 'bone yellow')],
    common: { body: 'tunic', hem: 0.3, sleeves: 'none', legs: 'trousers', feet: 'boots', head: ['none'], cloak: ['fur', 'none'], belt: 'belt', col: 'dull' },
    noble: { body: 'tunic', hem: 0.22, sleeves: 'none', legs: 'trousers', feet: 'boots', head: ['crown', 'none'], cloak: ['fur'], belt: 'belt', jewel: 'collar', col: 'bright' },
    warrior: { body: 'tunic', hem: 0.28, sleeves: 'none', legs: 'trousers', feet: 'boots', armour: ['leather', 'hide', 'scale'], helm: ['spiked', 'skull', 'none'], weapon: ['axe', 'club', 'glaive'], shield: ['round', 'none'], col: 'bright' },
  },
  lizardfolk: {
    kind: 'lizard', h: 1.02, broad: 1.05, build: 'scaled, long-tailed and cold-blooded, sluggish in the cold and quick in the heat', skin: [SK.jade, SK.olivegreen, SK.bronze, SK.scaleRed], hair: [HR.none],
    hairM: ['bald'], hairF: ['bald'], beard: ['none'], marks: 'a crest of spines along the head and back, and slit-pupilled eyes',
    dull: [C('#a8916a', 'reed'), C('#8a7a5c', 'woven grass')], bright: [C('#2e7a6b', 'green'), C('#b8462e', 'red'), C('#d8a02c', 'yellow'), C('#2b4a8c', 'blue')],
    common: { body: 'loin', hem: 0.38, sleeves: 'none', legs: 'bare', feet: 'bare', head: ['none'], col: 'dull' },
    noble: { body: ['kilt', 'loin'], hem: 0.32, sleeves: 'none', legs: 'bare', feet: 'bare', head: ['headdress', 'feathers'], cloak: ['cape', 'mantle'], jewel: 'jade', col: 'bright' },
    warrior: { body: 'loin', hem: 0.38, sleeves: 'none', legs: 'bare', feet: 'bare', armour: ['none', 'hide'], helm: ['feathered', 'none'], weapon: ['macuahuitl', 'trident', 'spear'], shield: ['hide', 'round'], jewel: 'jade', col: 'bright' },
  },
  german: {
    build: 'tall and solidly built', skin: [SK.fair, SK.ruddy, SK.pale], hair: [HR.straw, HR.brown, HR.flax, HR.darkbrown],
    hairM: ['short', 'long'], hairF: ['braids', 'bun'], beard: ['full', 'short', 'none'],
    dull: HOMESPUN, bright: [C('#2f4d7a', 'blue'), C('#8f2a22', 'red'), C('#2e5a3a', 'green'), C('#2b2b2b', 'black'), C('#c49a2c', 'yellow')],
    common: { body: 'tunic', hem: 0.27, sleeves: 'long', legs: 'hose', feet: 'shoes', head: ['hood', 'cap', 'kerchief'], belt: 'belt', col: 'dull' },
    noble: { body: ['coat', 'gown'], hem: 0, flare: 0.1, sleeves: ['long', 'wide'], legs: 'hose', feet: 'shoes', head: ['cap', 'veil', 'circlet'], cloak: ['mantle', 'fur'], belt: 'belt', jewel: 'chain', pattern: ['stripes', 'none'], col: 'bright' },
    warrior: { body: 'tunic', hem: 0.24, sleeves: 'long', legs: 'hose', feet: 'boots', armour: ['plate', 'mail'], helm: ['kettle', 'great', 'plumed'], weapon: ['halberd', 'sword'], shield: ['heater', 'none'], pattern: ['stripes'], col: 'bright' },
  },
  shadowelf: {
    kind: 'elf', h: 1.04, broad: 0.86, build: 'slender and graceful, quick and silent', skin: [SK.slate, SK.violet, SK.ash], hair: [HR.white, HR.silver],
    hairM: ['long', 'loose'], hairF: ['long', 'loose', 'braids'], beard: ['none'], marks: 'pointed ears and pale eyes that shine in the dark; daylight pains them',
    dull: [C('#3a3a44', 'charcoal'), C('#4a4058', 'dusk purple'), C('#2b2b30', 'black')], bright: [C('#5a2e6b', 'violet'), C('#c9c4d0', 'silver'), C('#7a2335', 'wine'), C('#2b3a4a', 'midnight')],
    common: { body: 'tunic', hem: 0.24, sleeves: 'long', legs: 'leggings', feet: 'boots', head: ['hood', 'none'], cloak: ['cloak'], belt: 'sash', col: 'dark' },
    noble: { body: 'gown', hem: 0, flare: 0.12, sleeves: 'wide', legs: 'leggings', feet: 'shoes', head: ['diadem', 'circlet'], cloak: ['cape'], jewel: 'chain', col: 'bright' },
    warrior: { body: 'tunic', hem: 0.22, sleeves: 'long', legs: 'leggings', feet: 'boots', armour: ['scale', 'leather'], helm: ['hood', 'circlet'], weapon: ['sword', 'bow', 'glaive'], shield: ['small', 'none'], cloak: ['cloak'], col: 'dark' },
  },
  deepgnome: {
    kind: 'gnome', h: 0.55, broad: 0.95, headK: 1.3, build: 'small and wiry, with big noses and bigger ears', skin: [SK.stone, SK.ash, SK.slate], hair: [HR.none, HR.white, HR.grey],
    hairM: ['bald'], hairF: ['bald', 'short'], beard: ['none', 'short'], marks: 'hairless heads, large dark eyes and stone-grey skin that hides them against the rock',
    dull: [C('#5e5e58', 'grey'), C('#6b5a46', 'leather'), C('#4a4a3e', 'dark felt')], bright: [C('#2b5a6b', 'slate blue'), C('#8a6a2c', 'ochre'), C('#5a3a2e', 'rust')],
    common: { body: 'coat', hem: 0.28, sleeves: 'long', legs: 'trousers', feet: 'boots', head: ['cap', 'none'], belt: 'belt', col: 'dull' },
    noble: { body: 'robe', hem: 0.05, sleeves: 'long', legs: 'trousers', feet: 'boots', head: ['circlet', 'cap'], belt: 'belt', jewel: 'pendant', col: 'bright' },
    warrior: { body: 'coat', hem: 0.26, sleeves: 'long', legs: 'trousers', feet: 'boots', armour: ['leather', 'scale'], helm: ['domed', 'none'], weapon: ['pick', 'spear', 'hammer'], shield: ['small', 'none'], col: 'dull' },
  },
  fungusfolk: {
    kind: 'fungus', h: 0.9, broad: 0.9, build: 'soft-bodied, slow and silent, with caps instead of heads', skin: [SK.mushroom, C('#cdb89a', 'tan'), C('#b8a8c0', 'lilac')], hair: [HR.none],
    hairM: ['bald'], hairF: ['bald'], beard: ['none'], marks: 'broad caps in place of heads, and gills that breathe out spores to speak',
    dull: [C('#9a8a6a', 'loam')], bright: [C('#c46a1e', 'orange'), C('#8a2e5a', 'purple'), C('#c9b44a', 'yellow')],
    common: { body: 'none', hem: 1, sleeves: 'none', legs: 'bare', feet: 'bare', head: ['none'], col: 'dull' },
    noble: { body: 'none', hem: 1, sleeves: 'none', legs: 'bare', feet: 'bare', head: ['none'], jewel: 'pendant', col: 'bright' },
    warrior: { body: 'none', hem: 1, sleeves: 'none', legs: 'bare', feet: 'bare', armour: ['none'], helm: ['none'], weapon: ['staff', 'club'], shield: ['none'], col: 'dull' },
  },
  greydwarf: {
    kind: 'dwarf', h: 0.68, broad: 1.35, headK: 1.25, build: 'short, broad and gaunt-faced', skin: [SK.ash, SK.stone, SK.slate], hair: [HR.none, HR.grey, HR.white],
    hairM: ['bald'], hairF: ['bald', 'braids'], beard: ['long', 'forked', 'braided'], marks: 'bald heads, grey skin and long iron-grey beards',
    dull: [C('#4a4a4a', 'iron grey'), C('#3a3530', 'soot'), C('#5e5448', 'leather')], bright: [C('#6b2a22', 'rust red'), C('#2b2b2b', 'black'), C('#8a8a8a', 'steel')],
    common: { body: 'tunic', hem: 0.27, sleeves: 'long', legs: 'trousers', feet: 'boots', head: ['none', 'hood'], belt: 'belt', col: 'dull' },
    noble: { body: 'robe', hem: 0.02, sleeves: 'long', legs: 'trousers', feet: 'boots', head: ['crown'], cloak: ['cape'], belt: 'belt', jewel: 'chain', col: 'dark' },
    warrior: { body: 'tunic', hem: 0.24, sleeves: 'long', legs: 'trousers', feet: 'boots', armour: ['plate', 'mail'], helm: ['great', 'spiked'], weapon: ['hammer', 'pick', 'axe'], shield: ['heater', 'round'], col: 'dark' },
  },
};

// ---- One culture's look ------------------------------------------------------------------------
export interface Outfit {
  body: Body;
  hem: number;
  flare: number;
  sleeves: Sleeves;
  legs: Legs;
  feet: Feet;
  head: Head;
  cloak: Cloak | 'none';
  belt?: 'belt' | 'sash';
  jewel?: string;
  pattern: Pattern | 'none';
  main: Colour;
  trim: Colour;
  legCol: Colour;
  cloakCol: Colour;
  armour: Armour;
  helm: Helm;
  weapon?: Weapon;
  shield: Shield;
  shieldCol: Colour;
}
export interface Figure {
  role: 'Commoner' | 'Noble' | 'Warrior';
  female: boolean;
  skin: Colour;
  hair: Colour;
  hairStyle: HairStyle;
  beard: Beard;
  outfit: Outfit;
}
export interface Look {
  kind: Kind;
  h: number;
  broad: number;
  headK: number;
  paint?: LookSpec['paint'];
  figures: Figure[];
  /** The description, a paragraph per part. */
  text: string[];
}

const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];
const one = <T>(r: Rng, x: T | T[]): T => (Array.isArray(x) ? pick(r, x) : x);
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const uniq = <T>(xs: T[]) => [...new Set(xs)];

const BODY_WORD: Record<Body, string> = {
  tunic: 'tunics', robe: 'robes', gown: 'gowns', wrap: 'draped wraps', coat: 'wrapped coats', kilt: 'kilts', loin: 'loincloths', chiton: 'belted chitons', none: 'nothing at all',
};
const HEAD_WORD: Record<Head, string> = {
  none: '', hood: 'hoods', cap: 'caps', turban: 'turbans', furhat: 'fur hats', veil: 'veils', circlet: 'circlets', crown: 'crowns', conical: 'tall pointed hats',
  tallhat: 'tall hats of black gauze', wide: 'broad straw hats', feathers: 'feathers in the hair', headdress: 'great headdresses of feathers', kerchief: 'kerchiefs',
  fez: 'embroidered caps', diadem: 'diadems', wreath: 'wreaths of leaves',
};
const ARMOUR_WORD: Record<Armour, string> = {
  none: 'no armour', mail: 'mail shirts', scale: 'scale coats', lamellar: 'lamellar of laced plates', plate: 'plate breastplates', leather: 'boiled leather',
  quilted: 'quilted coats', hide: 'hide jerkins', cotton: 'quilted cotton armour',
};
const HELM_WORD: Record<Helm, string> = {
  none: '', nasal: 'conical helms with nose-guards', kettle: 'broad-brimmed kettle hats', crested: 'crested helms', spangen: 'round helms with spectacle guards',
  kabuto: 'helms with broad neck-guards and horn-like crests', great: 'closed great helms', plumed: 'plumed helms', feathered: 'feathered war-bonnets', spiked: 'spiked helms',
  turban: 'helms wound with turbans', skull: 'helms made from the skulls of beasts', domed: 'domed iron caps', hood: 'deep hoods', circlet: 'circlets of steel',
};
const WEAPON_WORD: Record<Weapon, string> = {
  spear: 'spears', sword: 'swords', axe: 'axes', bow: 'bows', club: 'war clubs', scimitar: 'curved swords', halberd: 'halberds', hammer: 'war hammers', glaive: 'glaives',
  katana: 'long curved swords', macuahuitl: 'wooden swords edged with obsidian', pick: 'war picks', staff: 'staves', trident: 'tridents',
};
const SHIELD_WORD: Record<Shield, string> = {
  none: '', round: 'round shields', kite: 'kite shields', oval: 'oval shields', tall: 'tall shields', hide: 'tall hide shields', small: 'small bucklers', heater: 'heater shields',
};
const HAIR_WORD: Record<HairStyle, string> = {
  short: 'short', long: 'long', braids: 'braided', topknot: 'in a topknot', shaved: 'shaved', bald: 'bald', crest: 'shaved but for a crest', bun: 'pinned up', curly: 'curly',
  tied: 'tied back', loose: 'long and loose',
};
const BEARD_WORD: Record<Beard, string> = {
  none: 'clean-shaven', short: 'short beards', full: 'full beards', long: 'long beards', braided: 'braided beards', moustache: 'moustaches', forked: 'forked beards',
};

/** The look of a culture of the world (the same every time for one world and culture). */
export function lookOf(seed: string, c: WorldCulture): Look {
  const spec = LOOKS[c.id] ?? LOOKS.anglo;
  const r = mulberry32(hashString(`${seed}#look#${c.index}`));
  const env = c.env;
  const cold = (env?.cold ?? 0) > 0.35, hot = (env?.hot ?? 0) > 0.45;
  // The culture's own range: two or three of the template's skins, hairs and colours.
  const take = <T>(a: T[], n: number) => {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b.slice(0, Math.max(1, Math.min(n, b.length)));
  };
  const skins = take(spec.skin, 2), hairs = take(spec.hair, spec.hair.length > 3 ? 3 : 2);
  const dull = take(spec.dull, 3), bright = take(spec.bright, 3);
  const equal = BUNDLE.get(c.id)?.equalArms ?? 0.08;

  const colOf = (k: OutfitSpec['col']): Colour[] => (k === 'dull' ? dull : k === 'bright' ? bright : k === 'white' ? [C('#e6dfcc', 'white'), C('#d8cbb0', 'undyed cloth')] : [C('#2e2c30', 'black'), C('#3a3540', 'charcoal')]);
  const outfit = (o: OutfitSpec, w?: WarriorSpec): Outfit => {
    const cols = colOf(o.col);
    const main = pick(r, cols);
    const trim = pick(r, [...bright, ...dull].filter((x) => x !== main));
    let cloak = o.cloak ? pick(r, o.cloak) : 'none';
    if (cold && cloak === 'none' && r() < 0.6) cloak = 'fur';
    if (hot && (cloak === 'fur' || cloak === 'cloak') && r() < 0.7) cloak = 'none';
    return {
      body: one(r, o.body), hem: o.hem, flare: o.flare ?? 0.03, sleeves: one(r, o.sleeves), legs: one(r, o.legs), feet: one(r, o.feet),
      head: o.head ? pick(r, o.head) : 'none', cloak, belt: o.belt, jewel: o.jewel, pattern: o.pattern ? pick(r, o.pattern) : 'none',
      main, trim, legCol: pick(r, dull), cloakCol: pick(r, [...dull, ...bright]),
      armour: w ? pick(r, w.armour) : 'none', helm: w ? pick(r, w.helm) : 'none', weapon: w ? pick(r, w.weapon) : undefined, shield: w ? pick(r, w.shield) : 'none',
      shieldCol: pick(r, bright),
    };
  };
  const person = (role: Figure['role'], female: boolean, o: Outfit): Figure => ({
    role, female, skin: pick(r, skins), hair: pick(r, hairs), hairStyle: pick(r, female ? spec.hairF : spec.hairM), beard: female ? 'none' : pick(r, spec.beard), outfit: o,
  });
  const fCommon = r() < 0.5;
  const figures: Figure[] = [
    person('Commoner', fCommon, outfit(spec.common)),
    person('Noble', !fCommon, outfit(spec.noble)),
    person('Warrior', r() < equal, outfit(spec.warrior, spec.warrior)),
  ];
  // Women's gowns run to the ankle; men in a gown wear it as a robe.
  for (const f of figures) {
    const o = f.outfit;
    // A bow takes both hands: no shield.
    if (o.weapon === 'bow') o.shield = 'none';
    if (o.body === 'gown' && !f.female) o.body = 'robe';
    if (f.female && f.role !== 'Warrior' && (o.body === 'tunic' || o.body === 'coat' || o.body === 'kilt') && spec.kind !== 'fungus') {
      o.hem = Math.min(o.hem, 0.06);
      if (o.body === 'kilt') o.body = 'wrap';
    }
    if (f.female && o.head === 'tallhat') o.head = 'none';
    if (!f.female && o.head === 'veil' && c.id !== 'desert') o.head = 'none';
  }

  // ---- The description ----
  const name = c.people || `the ${c.name}`;
  const Name = name.charAt(0).toUpperCase() + name.slice(1);
  const text: string[] = [];
  const skinW = uniq(skins.map((x) => x[1]));
  const hairW = uniq(hairs.filter((x) => x[1] !== 'none').map((x) => x[1]));
  let body = `${Name} are ${spec.build}, with ${list(skinW)} skin`;
  body += hairW.length ? ` and ${list(hairW)} hair.` : '.';
  text.push(body);
  const styles: string[] = [];
  const hairWords = (xs: HairStyle[]) => {
    let w = uniq(xs).filter((x) => x !== 'bald');
    if (w.includes('loose')) w = w.filter((x) => x !== 'long');
    return w.slice(0, 2).map((x) => HAIR_WORD[x]);
  };
  const hm = hairWords(spec.hairM), hf = hairWords(spec.hairF);
  const or = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs[0]} or ${xs[1]}`);
  const kinded = spec.kind === 'lizard' || spec.kind === 'fungus';
  if (!kinded) {
    styles.push(hm.length ? `Men wear their hair ${or(hm)}` : 'The men go bald');
    styles.push(hf.length ? `${hm.length ? 'women theirs' : 'the women wear theirs'} ${or(hf)}` : 'the women too');
  }
  const beards = uniq(spec.beard);
  let hairText = styles.join(', and ');
  if (!kinded) {
    hairText += beards.length === 1 && beards[0] === 'none' ? '; the men are beardless.' : `; the men favour ${list(beards.filter((b) => b !== 'none').slice(0, 2).map((b) => BEARD_WORD[b]))}${beards.includes('none') ? ', though many shave' : ''}.`;
  }
  if (spec.marks) hairText += `${hairText ? ' ' : ''}They have ${spec.marks}.`;
  if (hairText) text.push(hairText.charAt(0).toUpperCase() + hairText.slice(1));

  const dressOf = (f: Figure) => {
    const o = f.outfit;
    if (o.body === 'none') return o.jewel ? 'nothing but a pendant' : 'nothing at all';
    const len = o.hem < 0.05 ? 'long ' : o.hem > 0.33 ? 'short ' : o.hem > 0.24 && o.body !== 'kilt' && o.body !== 'loin' ? 'knee-length ' : '';
    const pat = o.pattern !== 'none' ? ({ plaid: 'plaid ', stripes: 'striped ', border: 'embroidered ', dots: 'spotted ', checks: 'checked ', zigzag: 'zigzag-patterned ' } as const)[o.pattern] : '';
    const parts = [`${pat}${len}${BODY_WORD[o.body]} of ${o.main[1]}`];
    if (o.legs === 'trousers') parts.push('trousers');
    if (o.legs === 'hose') parts.push('hose');
    if (o.legs === 'leggings') parts.push('leggings');
    if (o.cloak !== 'none') parts.push({ cloak: 'cloaks', cape: 'short capes', fur: 'furs', mantle: 'mantles', shawl: 'shawls' }[o.cloak]);
    if (o.belt) parts.push(o.belt === 'sash' ? `${o.trim[1]} sashes` : 'belts');
    if (o.head !== 'none' && HEAD_WORD[o.head]) parts.push(HEAD_WORD[o.head]);
    if (o.feet === 'bare' || o.feet === 'furry') parts.push('bare feet');
    else parts.push(o.feet);
    if (o.jewel) parts.push({ torc: 'gold torcs', chain: 'chains of office', beads: 'beadwork', collar: 'collars of teeth and gold', gold: 'gold jewellery', jade: 'jade ornaments', pendant: 'pendants' }[o.jewel] ?? o.jewel);
    return list(parts);
  };
  const [cm, nb, wr] = figures;
  const customs = c.customs?.dress;
  text.push(`${customs ? `They dress in ${customs}. ` : ''}Commoners wear ${dressOf(cm)}; ${nb.female ? 'noblewomen' : 'noblemen'} wear ${dressOf(nb)}.`);
  const wo = wr.outfit;
  const kit = [wo.armour !== 'none' ? ARMOUR_WORD[wo.armour] : 'no armour but their courage', HELM_WORD[wo.helm]].filter(Boolean);
  const arms = [WEAPON_WORD[wo.weapon ?? 'spear'], SHIELD_WORD[wo.shield]].filter(Boolean);
  text.push(`Their warriors${wr.female ? ', women as well as men,' : ''} go to war in ${list(kit)}, and fight with ${list(arms)}.${spec.paint === 'paint' ? ' They paint themselves for battle.' : spec.paint === 'scars' ? ' Each scar is a deed remembered.' : ''}`);
  return { kind: spec.kind ?? 'human', h: spec.h ?? 1, broad: spec.broad ?? 1, headK: spec.headK ?? 1, paint: spec.paint, figures, text };
}
