import type { Language } from '../lang/language';
import type { CultureEnv, CultureMods, Customs } from './traits';
import { BUNDLES } from './bundles';

/**
 * Naming cultures. Each has its own phonology (curated start, middle and end syllables, plus
 * compound words for the cultures that build names that way) and its own habits for naming
 * places and features, so neighbouring lands sound different. Feature words stay in English
 * (the map's language) while the proper names come from the local culture.
 */

export type FeatureKind =
  | 'settlement' | 'river' | 'lake' | 'inlandSea' | 'sea' | 'ocean' | 'gulf' | 'bay' | 'bight' | 'strait' | 'channel'
  | 'island' | 'isles' | 'continent' | 'mountains' | 'hills' | 'peak' | 'forest' | 'desert' | 'marsh' | 'plains'
  | 'realm' | 'road'
  | 'volcano' | 'ashland' | 'geysers' | 'hotLake' | 'glacier' | 'fungalForest' | 'canyon' | 'cliffs' | 'cursedWood' | 'cursedMire';

export interface Culture {
  id: string;
  /** Climate preference used to place cultures: returns a suitability score for a seed site. */
  likes: (c: SiteClimate) => number;
  starts: string[];
  mids: string[];
  ends: string[];
  /** Chance of a middle syllable. */
  midChance: number;
  /** Compound names: root + suffix (e.g. Ash + ford), with this chance. */
  roots?: string[];
  suffixes?: string[];
  compoundChance?: number;
  /** Separate prefix words (e.g. Aber-, Kil-) placed before a generated name. */
  prefixes?: string[];
  prefixChance?: number;
  /** Feature templates by kind: {N} a generated name, {A} an English adjective, {M} a poetic noun. */
  terms: Partial<Record<FeatureKind, string[]>>;
  realm: string[];
}

/**
 * A culture of this world: one per culture hearth, grown from a template (several cultures may
 * share one). It keeps the template's fields (so `id` is the template's id, and code that keys
 * tables by it still works) and adds its own name, language and traits. `CULTURES` holds the
 * current world's cultures (set by `setWorldCultures` in names/world-cultures.ts); until a world
 * is made it holds one plain culture per template.
 */
export interface WorldCulture extends Culture {
  index: number;
  template: number;
  /** English name ("Varskish"), also the language's name. */
  name: string;
  /** The people ("the Varskish"). */
  people: string;
  /** Their own name for themselves, and its sound. */
  endonym: string;
  endonymIpa: string;
  language: Language | null;
  ethos: string;
  traditions: string[];
  customs: Customs | null;
  mods: CultureMods;
  nw: boolean;
  hearth: [number, number];
  env: CultureEnv | null;
  /** Index into FAMILIES: the language family this people's tongue belongs to (-1 without a world). */
  family: number;
  /** A neighbouring family whose older tongue left names in this people's lands (-1 if none). */
  substrate: number;
}

/**
 * A language family: the cultures whose tongues descend from one proto-language. A people whose
 * tongue has no living kin still has a family of one, with its older form as the proto-language.
 */
export interface LangFamily {
  index: number;
  /** English name ("Varskic"), or the one member's name for a lone tongue. */
  name: string;
  /** "Proto-Varskic", or "Old Varskish" for a lone tongue. */
  protoName: string;
  proto: Language;
  /** Culture indices, the founder (the largest) first. */
  members: number[];
}
/** The current world's language families. */
export const FAMILIES: LangFamily[] = [];

export interface SiteClimate {
  temp: number;
  tempCold: number;
  precip: number;
  heightM: number;
  forest: boolean;
  dry: boolean;
  coastal: boolean;
}

/**
 * The templates every world's cultures grow from (see `WorldCulture`): one per bundle in
 * names/bundles, in the bundles' order.
 */
export const TEMPLATES: Culture[] = BUNDLES.map((b) => b.culture);

/** Generic templates, used when a culture has none of its own for a kind. */
export const DEFAULT_TERMS: Record<FeatureKind, string[]> = {
  settlement: ['{N}'],
  river: ['the {N}', 'River {N}', '{N} River', '{N}flow', '{A}flow'],
  lake: ['Lake {N}', '{N} Lake'],
  inlandSea: ['the {N} Sea', 'Sea of {N}', 'the Sea of {M}'],
  sea: ['the {N} Sea', 'Sea of {N}', 'the {A} Sea', 'the Sea of {M}'],
  ocean: ['the {N} Ocean', 'the {A} Ocean', 'the Ocean of {M}'],
  gulf: ['Gulf of {N}', 'the {N} Gulf'],
  bay: ['Bay of {N}', '{N} Bay', '{A} Bay'],
  bight: ['the {N} Bight', 'the {A} Bight', '{N} Bight'],
  strait: ['the {N} Strait', 'Strait of {N}', 'the {N} Sound', 'the {A} Narrows'],
  channel: ['the {N} Channel', 'the {A} Channel'],
  island: ['{N}', 'Isle of {N}', '{N} Island', '{N} Isle'],
  isles: ['the {N} Isles', 'the {N} Islands', 'the {A} Isles'],
  continent: ['{N}'],
  mountains: ['the {N} Mountains', 'the {A} Mountains', 'the {N} Range', 'the {A} Peaks'],
  hills: ['the {N} Hills', 'the {A} Hills'],
  peak: ['Mount {N}', '{N} Peak'],
  forest: ['the {N} Forest', '{N} Wood', 'the {A} Wood', 'the Forest of {M}'],
  desert: ['the {N} Desert', 'the {A} Waste', 'the {N} Sands'],
  marsh: ['the {N} Marshes', 'the {A} Fens', '{N} Mire'],
  plains: ['the {N} Plains', 'the {A} Plains'],
  realm: ['Kingdom of {N}', 'Archduchy of {N}'],
  road: ['the {N} Road', 'the {N} Way', 'the Old {N} Road', 'the {A} Road', 'the {A} Way', 'the Old {A} Road'],
  volcano: ['Mount {N}', '{N} Volcano', 'the {A} Mountain'],
  ashland: ['the {N} Ashes', 'the {A} Ashlands', 'the {A} Waste'],
  geysers: ['the {N} Geysers', 'the {A} Springs'],
  hotLake: ['the {N} Pools', 'the {A} Pools', 'Lake {N}'],
  glacier: ['the {N} Glacier', 'the {A} Ice'],
  fungalForest: ['the {N} Mushroom Forest', 'the {A} Fungal Wood'],
  canyon: ['the {N} Canyon', 'the {N} Gorge', 'the {A} Canyon'],
  cliffs: ['the {N} Cliffs', 'the {A} Cliffs', 'the {N} Scarp'],
  cursedWood: ['the {A} Wood', 'the Cursed Wood of {N}'],
  cursedMire: ['the {A} Mire', 'the Cursed Fens of {N}'],
};

export const ADJECTIVES = [
  'Grey', 'Black', 'White', 'Red', 'Green', 'Silver', 'Iron', 'Cold', 'High', 'Long', 'Broken', 'Whispering', 'Drowned',
  'Shining', 'Weeping', 'Sunken', 'Hollow', 'Bitter', 'Golden', 'Pale', 'Misty', 'Burning', 'Lonely', 'Endless', 'Shrouded',
  'Ashen', 'Crimson', 'Howling', 'Silent', 'Wandering', 'Forgotten', 'Jagged', 'Twilight', 'Thorny', 'Amber', 'Stormy',
  'Hallowed', 'Sacred', 'Defiled', 'Cursed', 'Blessed', 'Accursed', 'Enchanted', 'Forsaken', 'Golden', 'Divine', 'Glorious'
];

export const MOTIFS = [
  'Mists', 'Storms', 'Sorrows', 'Silence', 'Ash', 'Whispers', 'Shadows', 'Tears', 'Stars', 'Bones', 'Dreams', 'Thorns',
  'Embers', 'Kings', 'Ghosts', 'Lanterns', 'Wolves', 'Crows', 'Ravens', 'Eagles', 'Salt', 'Glass', 'Flames', 'Ice'
];

/** Template names shown before a world gives its cultures their own. */
export const TEMPLATE_LABEL: Record<string, string> = Object.fromEntries(BUNDLES.map((b) => [b.culture.id, b.label]));
const NO_MODS_C = { cityState: 1, republic: 1, theocracy: 1, empire: 1, league: 1, indepDuchy: 1, seafaring: 1, colonies: 1, levy: 1, cavalry: 1, fleet: 1, revenue: 1, crafts: 1, diversity: 1 };

/** A plain culture for a template (no language yet). */
export function plainCulture(t: Culture, index: number, template: number): WorldCulture {
  const name = TEMPLATE_LABEL[t.id] ?? t.id;
  return {
    ...t, index, template, name, people: `the ${name}`, endonym: name, endonymIpa: '', language: null, ethos: '', traditions: [], customs: null, mods: { ...NO_MODS_C }, nw: false, hearth: [0, 0], env: null, family: -1, substrate: -1,
  };
}

/** The current world's cultures (see `WorldCulture`). */
export const CULTURES: WorldCulture[] = TEMPLATES.map((t, k) => plainCulture(t, k, k));
