/**
 * The animals of the local map (docs/design/npcs.md, Animals; Stage 2): the species that live
 * about a place, wild, kept and in the streets, with what the game needs to bring them to life:
 * their body plan, size, temperament, diet, how they go about (alone, in pairs, herds, packs or
 * flocks), when they are about, how fast they go, how keen their senses are and how near they let
 * anything come before they flee; where they live (the bestiary's habitats, nature/habitat.ts);
 * and what can be taken from them.
 *
 * Wild species that the regional bestiary names (nature/bestiary.ts) come only where the bestiary
 * has them; the everyday ones (hares, foxes, crows, sparrows) wherever their habitats are.
 * Deterministic: no Math.random.
 */
import type { Habitat, Region } from '../nature/habitat';
import { fit } from '../nature/habitat';
import { FACINGS } from './tiles';

export type BodyPlan = 'quad' | 'small' | 'bird' | 'serpent';
export type AnimalSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge';
/** How it takes to people and other beasts: tame (lets people near), timid and skittish (flee early), wary (keeps away), aggressive (holds its ground, threatens). */
export type Temper = 'tame' | 'timid' | 'skittish' | 'wary' | 'aggressive';
export type Diet = 'grazer' | 'browser' | 'seeds' | 'omnivore' | 'predator' | 'scavenger';
export type Active = 'day' | 'night' | 'dusk' | 'any';
export type Home = 'wild' | 'kept' | 'street';

export interface Species {
  id: string;
  name: string;
  plural: string;
  plan: BodyPlan;
  size: AnimalSize;
  temper: Temper;
  diet: Diet;
  /** How many go about together (1, 1: alone), and whether they keep together as a herd or flock. */
  group: [number, number];
  herd?: boolean;
  /** When it is about (asleep in cover the rest of the time). */
  active: Active;
  /** Seconds a step takes walking; running is twice as fast. */
  step: number;
  /** How far (tiles) it sees, hears (as a hearing to compare with a noise's loudness) and smells. */
  sight: number;
  hearing: number;
  smell: number;
  /** How near (tiles) it lets a person come before it moves off. */
  flee: number;
  /** Birds: flies, perches in trees. Others: climbs trees, swims. */
  fly?: boolean;
  perch?: boolean;
  climbs?: boolean;
  swims?: boolean;
  /** Sleeps through the winter. */
  winters?: boolean;
  /** What a hunter of it takes (predators): prey sizes. */
  prey?: AnimalSize[];
  /** Where it lives (wild), and how many groups to a chunk where it fits well. */
  habitats: Habitat[];
  home: Home;
  density: number;
  /** Taken in a snare. */
  snared?: boolean;
  /** What butchery gives: item ids from the game's item data, with how many. */
  yields: [string, number][];
  /** The bestiary's name for it, where it is the bestiary's (it lives only where the bestiary has it). */
  bestiary?: string;
  /** Its colour (placeholder and art tint), and its noise in words. */
  colour: string;
  call?: string;
  /** For the artist (TILESET.md). */
  art: string;
}

const S = (id: string, name: string, plural: string, plan: BodyPlan, size: AnimalSize, temper: Temper, diet: Diet, group: [number, number], active: Active, step: number, senses: [number, number, number], flee: number, habitats: Habitat[], home: Home, density: number, yields: [string, number][], colour: string, art: string, o: Partial<Species> = {}): Species => ({
  id, name, plural, plan, size, temper, diet, group, active, step, sight: senses[0], hearing: senses[1], smell: senses[2], flee, habitats, home, density, yields, colour, art, ...o,
});

const SMALL_MEAT: [string, number][] = [['raw_meat', 1], ['hide', 1]];
const DEER: [string, number][] = [['raw_meat', 8], ['hide', 1], ['antler', 1]];

export const SPECIES: Species[] = [
  // ---- Small game and the small wild ----
  S('hare', 'hare', 'hares', 'small', 'small', 'timid', 'grazer', [1, 1], 'dusk', 0.6, [10, 12, 6], 9, ['grass', 'farmland', 'temperate', 'arctic', 'arid'], 'wild', 0.5, SMALL_MEAT, '#9a7a52', 'A brown hare, long ears up, crouched or bounding.', { snared: true }),
  S('rabbit', 'rabbit', 'rabbits', 'small', 'small', 'timid', 'grazer', [2, 5], 'dusk', 0.6, [8, 12, 6], 7, ['grass', 'farmland', 'temperate', 'forest'], 'wild', 0.5, SMALL_MEAT, '#8c7a62', 'A grey-brown rabbit with a white scut.', { snared: true, herd: true }),
  S('squirrel', 'squirrel', 'squirrels', 'small', 'tiny', 'timid', 'seeds', [1, 1], 'day', 0.7, [10, 10, 4], 6, ['forest', 'boreal', 'temperate'], 'wild', 0.5, [['hide', 1]], '#a0522d', 'A red squirrel, bushy tail curled over its back.', { climbs: true, snared: true }),
  S('fox', 'fox', 'foxes', 'quad', 'small', 'wary', 'predator', [1, 1], 'night', 0.8, [12, 14, 14], 12, ['forest', 'temperate', 'farmland', 'grass', 'boreal', 'arctic'], 'wild', 0.15, [['hide', 1]], '#c0602a', 'A red fox with a white-tipped brush.', { prey: ['tiny', 'small'] }),
  S('badger', 'badger', 'badgers', 'quad', 'small', 'wary', 'omnivore', [1, 1], 'night', 1.1, [6, 10, 14], 8, ['forest', 'temperate'], 'wild', 0.1, SMALL_MEAT, '#7a7a7a', 'A grey badger with a black-and-white striped face.'),
  S('roe_deer', 'roe deer', 'roe deer', 'quad', 'medium', 'timid', 'browser', [1, 3], 'dusk', 0.9, [14, 14, 12], 14, ['forest', 'temperate', 'farmland'], 'wild', 0.15, [['raw_meat', 5], ['hide', 1]], '#a0784a', 'A small reddish deer with a pale rump; the buck has short spiked antlers.', { herd: true }),
  // ---- The bestiary's beasts ----
  S('red_deer', 'red deer', 'red deer', 'quad', 'large', 'skittish', 'grazer', [3, 8], 'dusk', 0.9, [16, 14, 12], 16, ['forest', 'temperate', 'grass', 'boreal'], 'wild', 0.1, DEER, '#8a5a36', 'A red deer: the stag with branching antlers, the hinds without.', { herd: true, bestiary: 'red deer' }),
  S('elk', 'elk', 'elk', 'quad', 'large', 'wary', 'browser', [1, 3], 'dusk', 1.0, [12, 14, 12], 12, ['boreal', 'wetland', 'arctic'], 'wild', 0.06, DEER, '#5a4630', 'A towering dark deer with broad flat antlers and a hanging dewlap.', { herd: true, bestiary: 'elk', swims: true }),
  S('wild_horse', 'wild horse', 'wild horses', 'quad', 'large', 'skittish', 'grazer', [4, 10], 'day', 0.7, [18, 14, 12], 18, ['grass', 'arid'], 'wild', 0.06, [['raw_meat', 10], ['hide', 1]], '#8a6a40', 'A small, tough dun horse with a dark mane.', { herd: true, bestiary: 'wild horse' }),
  S('bison', 'bison', 'bison', 'quad', 'large', 'wary', 'grazer', [6, 14], 'day', 1.1, [12, 12, 12], 10, ['grass', 'arid'], 'wild', 0.05, [['raw_meat', 16], ['hide', 1], ['horn', 2]], '#4a3424', 'A great humped bison, shaggy at the shoulders, short curved horns.', { herd: true, bestiary: 'bison' }),
  S('aurochs', 'aurochs', 'aurochs', 'quad', 'large', 'aggressive', 'grazer', [3, 8], 'day', 1.0, [12, 12, 12], 8, ['grass', 'forest', 'temperate'], 'wild', 0.04, [['raw_meat', 16], ['hide', 1], ['horn', 2]], '#2a2420', 'Wild cattle black as soot, with lyre-shaped horns.', { herd: true, bestiary: 'aurochs' }),
  S('camel', 'camel', 'camels', 'quad', 'large', 'wary', 'browser', [2, 6], 'day', 1.0, [16, 10, 14], 10, ['arid'], 'wild', 0.04, [['raw_meat', 12], ['hide', 1]], '#b08a5a', 'A long-legged camel with a hump and a haughty face.', { herd: true, bestiary: 'camel' }),
  S('mountain_goat', 'mountain goat', 'mountain goats', 'quad', 'medium', 'skittish', 'browser', [3, 8], 'day', 0.8, [16, 12, 10], 14, ['mountain'], 'wild', 0.08, [['raw_meat', 5], ['hide', 1], ['horn', 2]], '#d8d0c0', 'A shaggy white goat with short black horns.', { herd: true, bestiary: 'mountain goat' }),
  S('boar', 'wild boar', 'wild boar', 'quad', 'medium', 'aggressive', 'omnivore', [2, 6], 'dusk', 0.9, [8, 12, 16], 6, ['forest', 'temperate', 'farmland'], 'wild', 0.07, [['raw_meat', 8], ['hide', 1], ['tusk', 2]], '#4a3a30', 'A bristled dark boar with tusks curving from its jaw.', { herd: true, bestiary: 'boar' }),
  S('beaver', 'beaver', 'beavers', 'small', 'small', 'timid', 'browser', [1, 3], 'dusk', 1.0, [6, 12, 10], 8, ['river', 'wetland', 'boreal'], 'wild', 0.08, [['raw_meat', 2], ['hide', 1]], '#6a4a2a', 'A brown beaver with a flat scaly tail.', { swims: true, bestiary: 'beaver', snared: true }),
  S('wolverine', 'wolverine', 'wolverines', 'quad', 'small', 'aggressive', 'predator', [1, 1], 'any', 1.0, [8, 12, 16], 6, ['boreal', 'arctic', 'mountain'], 'wild', 0.02, [['hide', 1]], '#3a2a20', 'A squat dark wolverine with a pale band along its flank.', { prey: ['tiny', 'small'], bestiary: 'wolverine' }),
  S('wolf', 'wolf', 'wolves', 'quad', 'medium', 'wary', 'predator', [3, 7], 'dusk', 0.7, [16, 16, 20], 16, ['forest', 'boreal', 'grass', 'mountain', 'arctic'], 'wild', 0.02, [['hide', 1], ['tooth', 2]], '#8a8a86', 'A grey wolf, lean and long-legged, its tail low.', { herd: true, prey: ['small', 'medium', 'large'], bestiary: 'wolf', call: 'a wolf howling' }),
  S('lynx', 'lynx', 'lynxes', 'quad', 'small', 'wary', 'predator', [1, 1], 'night', 0.8, [16, 14, 12], 14, ['boreal', 'forest', 'mountain'], 'wild', 0.02, [['hide', 1]], '#b09a70', 'A tufted-eared spotted lynx with a short black-tipped tail.', { prey: ['tiny', 'small'], climbs: true, bestiary: 'lynx' }),
  S('mountain_lion', 'mountain lion', 'mountain lions', 'quad', 'medium', 'wary', 'predator', [1, 1], 'dusk', 0.8, [16, 14, 12], 14, ['mountain', 'forest', 'arid'], 'wild', 0.01, [['hide', 1], ['claw', 4]], '#b8925a', 'A tawny long-tailed cat of the crags.', { prey: ['small', 'medium'], climbs: true, bestiary: 'mountain lion' }),
  S('brown_bear', 'brown bear', 'brown bears', 'quad', 'large', 'wary', 'omnivore', [1, 1], 'day', 1.2, [8, 12, 20], 10, ['forest', 'boreal', 'mountain'], 'wild', 0.015, [['raw_meat', 20], ['hide', 1], ['claw', 4]], '#5a3a22', 'A great shaggy brown bear with a hump at the shoulders.', { winters: true, prey: ['small', 'medium'], bestiary: 'brown bear', call: 'a bear grunting' }),
  S('lion', 'lion', 'lions', 'quad', 'large', 'aggressive', 'predator', [3, 6], 'dusk', 0.8, [16, 14, 14], 12, ['grass', 'arid', 'tropical'], 'wild', 0.01, [['hide', 1], ['claw', 4]], '#c8a060', 'A maned lion, or a sleek lioness.', { herd: true, prey: ['medium', 'large'], bestiary: 'lion', call: 'a lion roaring' }),
  S('tiger', 'tiger', 'tigers', 'quad', 'large', 'wary', 'predator', [1, 1], 'night', 0.8, [14, 14, 14], 12, ['jungle', 'tropical', 'wetland'], 'wild', 0.008, [['hide', 1], ['claw', 4]], '#d07a2a', 'A striped tiger, orange and black.', { prey: ['medium', 'large'], swims: true, bestiary: 'tiger' }),
  S('hyena', 'hyena', 'hyenas', 'quad', 'medium', 'wary', 'scavenger', [3, 8], 'night', 0.8, [12, 16, 18], 12, ['grass', 'arid', 'tropical'], 'wild', 0.02, [['hide', 1]], '#9a8a6a', 'A spotted hyena, high-shouldered, with a heavy jaw.', { herd: true, prey: ['small', 'medium'], bestiary: 'hyena', call: 'hyenas whooping' }),
  S('elephant', 'elephant', 'elephants', 'quad', 'huge', 'wary', 'browser', [3, 8], 'day', 1.0, [10, 16, 18], 10, ['tropical', 'grass', 'jungle'], 'wild', 0.02, [['raw_meat', 40], ['hide', 1], ['tusk', 2]], '#8a8a8a', 'A great grey elephant with trunk and tusks (a picture two tiles across).', { herd: true, bestiary: 'elephant', call: 'an elephant trumpeting' }),
  S('crocodile', 'crocodile', 'crocodiles', 'serpent', 'large', 'aggressive', 'predator', [1, 1], 'any', 1.4, [10, 10, 10], 4, ['river', 'wetland'], 'wild', 0.02, [['raw_meat', 10], ['hide', 1], ['tooth', 4]], '#4a5a30', 'A long armoured crocodile, low to the ground.', { prey: ['small', 'medium', 'large'], swims: true, bestiary: 'crocodile' }),
  S('viper', 'viper', 'vipers', 'serpent', 'tiny', 'aggressive', 'predator', [1, 1], 'day', 1.5, [4, 6, 8], 2, ['arid', 'grass', 'temperate', 'tropical'], 'wild', 0.05, [['venom', 1]], '#6a6a3a', 'A small zigzag-backed viper, coiled or gliding.', { prey: ['tiny'], bestiary: 'viper' }),
  S('seal', 'seal', 'seals', 'small', 'medium', 'timid', 'predator', [2, 6], 'day', 1.6, [10, 12, 10], 10, ['coast', 'arctic'], 'wild', 0.05, [['raw_meat', 6], ['hide', 1]], '#6a6a70', 'A sleek grey seal hauled out on the shore.', { herd: true, swims: true, bestiary: 'seal', prey: ['tiny'] }),
  // ---- Wild birds ----
  S('sparrow', 'sparrow', 'sparrows', 'bird', 'tiny', 'skittish', 'seeds', [4, 10], 'day', 0.5, [10, 10, 2], 5, ['farmland', 'temperate', 'grass', 'forest'], 'wild', 0.25, [], '#8a6a4a', 'A small brown sparrow; flying, wings out.', { fly: true, perch: true, herd: true, call: 'sparrows chirping' }),
  S('crow', 'crow', 'crows', 'bird', 'small', 'wary', 'scavenger', [3, 8], 'day', 0.6, [16, 12, 4], 10, ['farmland', 'temperate', 'forest', 'grass', 'boreal'], 'wild', 0.25, [['feathers', 1]], '#1e1e24', 'A black crow; flying, wings out.', { fly: true, perch: true, herd: true, call: 'crows cawing' }),
  S('raven', 'raven', 'ravens', 'bird', 'small', 'wary', 'scavenger', [1, 2], 'day', 0.6, [18, 12, 6], 12, ['boreal', 'mountain', 'arctic', 'forest'], 'wild', 0.08, [['feathers', 1]], '#141418', 'A great black raven with a heavy beak; flying, wings out.', { fly: true, perch: true, bestiary: 'raven', call: 'a raven croaking' }),
  S('pheasant', 'pheasant', 'pheasants', 'bird', 'small', 'timid', 'seeds', [1, 4], 'day', 0.7, [10, 12, 4], 7, ['farmland', 'temperate', 'forest'], 'wild', 0.15, [['raw_meat', 1], ['feathers', 1]], '#a0502a', 'A long-tailed pheasant, the cock bronze with a green head.', { fly: true, snared: true }),
  S('duck', 'wild duck', 'wild ducks', 'bird', 'small', 'skittish', 'seeds', [3, 10], 'day', 0.7, [12, 12, 4], 10, ['wetland', 'river', 'coast'], 'wild', 0.3, [['raw_meat', 1], ['feathers', 1]], '#5a6a3a', 'A mallard: the drake green-headed, the duck brown; swimming or flying.', { fly: true, swims: true, herd: true, call: 'ducks quacking', snared: true }),
  S('heron', 'heron', 'herons', 'bird', 'medium', 'wary', 'predator', [1, 1], 'day', 0.9, [16, 10, 4], 14, ['wetland', 'river', 'coast'], 'wild', 0.08, [['feathers', 1]], '#9a9aa4', 'A tall grey heron standing in the shallows; flying, neck drawn back.', { fly: true, prey: ['tiny'] }),
  S('gull', 'gull', 'gulls', 'bird', 'small', 'wary', 'scavenger', [4, 12], 'day', 0.6, [14, 10, 4], 8, ['coast'], 'wild', 0.4, [['feathers', 1]], '#e0e0e0', 'A white gull with grey wings; flying, wings out.', { fly: true, herd: true, call: 'gulls crying' }),
  S('owl', 'owl', 'owls', 'bird', 'small', 'wary', 'predator', [1, 1], 'night', 0.7, [18, 18, 2], 10, ['forest', 'boreal', 'temperate', 'farmland'], 'wild', 0.06, [['feathers', 1]], '#8a7a62', 'A round-faced owl; flying, wings out.', { fly: true, perch: true, prey: ['tiny'], call: 'an owl hooting' }),
  S('hawk', 'hawk', 'hawks', 'bird', 'small', 'wary', 'predator', [1, 1], 'day', 0.5, [24, 10, 2], 14, ['grass', 'farmland', 'forest', 'temperate', 'arid', 'mountain'], 'wild', 0.05, [['feathers', 1]], '#7a5a3a', 'A brown hawk; soaring, wings spread.', { fly: true, perch: true, prey: ['tiny', 'small'], call: 'a hawk screaming' }),
  // ---- Kept ----
  S('cattle', 'cow', 'cattle', 'quad', 'large', 'tame', 'grazer', [3, 10], 'day', 1.1, [10, 10, 10], 2, [], 'kept', 0, [['raw_meat', 14], ['hide', 1], ['horn', 2]], '#8a6a4a', 'A brown or dappled cow with short horns.', { herd: true, call: 'cattle lowing' }),
  S('sheep', 'sheep', 'sheep', 'quad', 'medium', 'tame', 'grazer', [5, 16], 'day', 1.0, [10, 10, 8], 3, [], 'kept', 0, [['raw_meat', 5], ['hide', 1]], '#e0dccc', 'A woolly sheep, white or brown, with a dark face.', { herd: true, call: 'sheep bleating' }),
  S('goat', 'goat', 'goats', 'quad', 'medium', 'tame', 'browser', [2, 8], 'day', 0.9, [10, 10, 8], 2, [], 'kept', 0, [['raw_meat', 4], ['hide', 1], ['horn', 2]], '#c8b89a', 'A goat with a beard and backswept horns.', { herd: true, call: 'goats bleating' }),
  S('pig', 'pig', 'pigs', 'quad', 'medium', 'tame', 'omnivore', [1, 4], 'day', 1.1, [6, 10, 14], 2, [], 'kept', 0, [['raw_meat', 8], ['hide', 1]], '#d8a0a0', 'A pink or spotted pig, snout to the ground.', { herd: true, call: 'pigs grunting' }),
  S('hen', 'hen', 'hens', 'bird', 'small', 'tame', 'seeds', [3, 10], 'day', 0.7, [8, 8, 2], 2, [], 'kept', 0, [['raw_meat', 1], ['feathers', 1]], '#c8a070', 'A brown hen pecking; a cockerel with a red comb.', { herd: true, call: 'hens clucking' }),
  S('goose', 'goose', 'geese', 'bird', 'medium', 'aggressive', 'grazer', [3, 8], 'day', 0.9, [10, 12, 4], 3, [], 'kept', 0, [['raw_meat', 3], ['feathers', 2]], '#e8e8e0', 'A white goose with an orange bill, neck out.', { herd: true, call: 'geese honking' }),
  S('horse', 'horse', 'horses', 'quad', 'large', 'tame', 'grazer', [1, 4], 'day', 0.8, [12, 12, 12], 2, [], 'kept', 0, [['raw_meat', 12], ['hide', 1]], '#6a4a2a', 'A bay, black or grey horse, saddled or not.', { call: 'a horse whinnying' }),
  S('donkey', 'donkey', 'donkeys', 'quad', 'medium', 'tame', 'grazer', [1, 2], 'day', 1.0, [10, 12, 10], 2, [], 'kept', 0, [['raw_meat', 6], ['hide', 1]], '#8a8070', 'A grey donkey with long ears and a dark cross on its back.', { call: 'a donkey braying' }),
  // ---- The streets ----
  S('dog', 'dog', 'dogs', 'quad', 'medium', 'tame', 'scavenger', [1, 1], 'any', 0.7, [12, 16, 20], 1, [], 'street', 0, [], '#7a5a3a', 'A dog: a brown mongrel, a hound, a mastiff.', { call: 'a dog barking' }),
  S('cat', 'cat', 'cats', 'small', 'small', 'wary', 'predator', [1, 1], 'any', 0.7, [14, 16, 10], 5, [], 'street', 0, [], '#8a8a80', 'A cat: tabby, black or ginger, tail up.', { climbs: true, prey: ['tiny'] }),
  S('rat', 'rat', 'rats', 'small', 'tiny', 'timid', 'scavenger', [1, 3], 'night', 0.6, [6, 14, 14], 6, [], 'street', 0, [], '#5a5048', 'A brown rat, long tail behind.', { snared: true }),
  S('pigeon', 'pigeon', 'pigeons', 'bird', 'small', 'skittish', 'seeds', [6, 18], 'day', 0.6, [10, 10, 2], 4, [], 'street', 0, [], '#9a9aa8', 'A grey pigeon with a green-purple sheen at the neck; flying, wings out.', { fly: true, perch: true, herd: true, call: 'pigeons cooing' }),
];

export const SPECIES_BY_ID = new Map(SPECIES.map((s) => [s.id, s]));
export const SIZE_RANK: Record<AnimalSize, number> = { tiny: 0, small: 1, medium: 2, large: 3, huge: 4 };

/**
 * The wild species of a region and how many groups of each to a chunk: the everyday ones where
 * their habitats are, the bestiary's only where the region's bestiary has them; the density by how
 * well the habitats fit, fewer in winter for the birds that leave.
 */
export function wildSpecies(region: Region, inBestiary: (name: string) => boolean, winter: boolean): { s: Species; density: number }[] {
  const out: { s: Species; density: number }[] = [];
  for (const s of SPECIES) {
    if (s.home !== 'wild') continue;
    if (s.bestiary && !inBestiary(s.bestiary)) continue;
    const f = fit(region, s.habitats);
    if (f < 0.1) continue;
    let d = s.density * Math.min(1, f * 1.4);
    if (winter && s.plan === 'bird' && s.id !== 'crow' && s.id !== 'raven' && s.id !== 'owl' && s.id !== 'sparrow') d *= 0.4;
    out.push({ s, density: d });
  }
  return out;
}

/** Whether a species is about at an hour (dusk: two hours either side of dawn and dusk, and the night's edges). */
export function awake(s: Species, hour: number, rise: number, set: number): boolean {
  const day = hour >= rise && hour < set;
  const dusk = Math.abs(hour - rise) < 2 || Math.abs(hour - set) < 2;
  switch (s.active) {
    case 'day': return day;
    case 'night': return !day || dusk;
    case 'dusk': return dusk || (day ? hour < rise + 3 || hour > set - 3 : true);
    default: return true;
  }
}

/** An animal's frames (TILESET.md, Animals): standing and moving each way; birds also flying, and perched. */
export function animalFrameNames(): string[] {
  return SPECIES.flatMap((s) => FACINGS.flatMap((d) => [`animal_${s.id}_${d}`, `animal_${s.id}_walk_${d}`, ...(s.fly ? [`animal_${s.id}_fly_${d}`] : [])]));
}
