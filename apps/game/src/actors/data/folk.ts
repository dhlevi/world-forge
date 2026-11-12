/**
 * What each folk (race) brings at birth: trait and sense leanings, size, how fast they age, and
 * the skills they are known for (docs/design/creation.md, skills.md). Proposed values.
 */
import type { Attribute } from './traits';

export interface FolkDef {
  name: string;
  /** Added to the human average of 10. */
  traits: Partial<Record<Attribute, number>>;
  /** Base height (cm) and weight (kg) of a man and a woman, before the culture's own build. */
  height: [number, number];
  weight: [number, number];
  /** Age at the first occupation term, years per term, and the end of their prime. */
  adult: number;
  termYears: number;
  prime: number;
  /** Skills the folk is known for. */
  skills: Record<string, number>;
}

const HUMANS: FolkDef = { name: 'Humans', traits: {}, height: [172, 160], weight: [72, 60], adult: 16, termYears: 4, prime: 35, skills: {} };

export const FOLK: Record<string, FolkDef> = {
  Humans: HUMANS,
  Elves: {
    name: 'Elves', traits: { agility: 2, intelligence: 1, wisdom: 1, strength: -1, constitution: -1, eyesight: 3, hearing: 2 },
    height: [178, 170], weight: [64, 55], adult: 40, termYears: 10, prime: 300, skills: { archery: 10, tracking: 5, music: 5 },
  },
  Dwarves: {
    name: 'Dwarves', traits: { constitution: 2, strength: 1, willpower: 1, agility: -1, charm: -1, touch: 1, eyesight: -1 },
    height: [135, 128], weight: [70, 62], adult: 25, termYears: 6, prime: 120, skills: { mining: 10, smithing: 10, masonry: 5 },
  },
  Halflings: {
    name: 'Halflings', traits: { agility: 2, charm: 1, strength: -3, constitution: 1, taste: 2 },
    height: [100, 95], weight: [32, 28], adult: 20, termYears: 4, prime: 45, skills: { sneak: 10, cooking: 10, agriculture: 5 },
  },
  Orcs: {
    name: 'Orcs', traits: { strength: 3, constitution: 2, intelligence: -1, charm: -2, aura: -1, smell: 2 },
    height: [182, 172], weight: [90, 75], adult: 14, termYears: 3, prime: 30, skills: { survival: 5, axes: 5 },
  },
  Lizardfolk: {
    name: 'Lizardfolk', traits: { constitution: 2, strength: 1, charm: -2, smell: 3, hearing: -1 },
    height: [175, 170], weight: [80, 72], adult: 12, termYears: 3, prime: 30, skills: { swimming: 20, fishing: 10 },
  },
  'Shadow elves': {
    name: 'Shadow elves', traits: { agility: 2, intelligence: 1, willpower: 1, strength: -1, constitution: -1, eyesight: 3, hearing: 3 },
    height: [172, 166], weight: [60, 52], adult: 40, termYears: 10, prime: 300, skills: { sneak: 10, shortblades: 5 },
  },
  'Deep gnomes': {
    name: 'Deep gnomes', traits: { intelligence: 2, agility: 1, strength: -2, touch: 2 },
    height: [95, 90], weight: [30, 27], adult: 25, termYears: 6, prime: 100, skills: { jewelsmith: 10, mining: 5 },
  },
  'Fungus folk': {
    name: 'Fungus folk', traits: { constitution: 3, wisdom: 1, agility: -2, charm: -2, smell: 4, eyesight: -3 },
    height: [150, 150], weight: [60, 60], adult: 5, termYears: 3, prime: 25, skills: { herbalism: 15, agriculture: 5 },
  },
  'Grey dwarves': {
    name: 'Grey dwarves', traits: { constitution: 2, strength: 1, willpower: 1, agility: -1, charm: -1, touch: 1 },
    height: [132, 126], weight: [68, 60], adult: 25, termYears: 6, prime: 120, skills: { mining: 15, smithing: 10 },
  },
};

export const folkOf = (name: string): FolkDef => FOLK[name] ?? HUMANS;

/** Skills a culture's traditions and ethos lean toward (names/traits.ts keys). */
export const TRADITION_SKILLS: Record<string, Record<string, number>> = {
  seafarers: { sailing: 15, swimming: 10, fishing: 10 },
  horseLords: { riding: 20, animals: 10, archery: 5 },
  mountaineers: { climbing: 15, athletics: 5 },
  forestFolk: { tracking: 10, survival: 10, archery: 5 },
  desertWanderers: { survival: 10, riding: 10, trading: 5 },
  jungleDwellers: { survival: 10, herbalism: 10 },
  winterHardened: { survival: 10 },
  riverFolk: { swimming: 10, fishing: 5, trading: 5 },
  cityBuilders: { masonry: 5, trading: 5 },
  merchantPrinces: { trading: 15 },
  warriorCulture: { dodge: 5, shield: 5, polearms: 5 },
  clanTies: { leadership: 5 },
  masterCraftsmen: { artistry: 5 },
  storytellers: { storytelling: 15, music: 5 },
  hospitality: { cooking: 5 },
  stargazers: { cartography: 5 },
  deepDelvers: { mining: 15 },
  pastoralists: { animals: 15, riding: 5 },
  raiders: { axes: 5, shield: 5, sailing: 5 },
  bellicose: { dodge: 5, polearms: 5 },
  courtly: { persuasion: 5, dance: 5 },
  inventive: { carpentry: 5 },
  stoic: { athletics: 5 },
};

/** Traditions that make reading more common, and those that know their law or their faith well. */
export const LETTERED = new Set(['bureaucratic', 'monastic', 'legalists', 'merchantPrinces', 'stargazers']);
