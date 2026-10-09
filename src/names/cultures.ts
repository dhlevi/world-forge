/**
 * Naming cultures. Each has its own phonology (curated start, middle and end syllables, plus
 * compound words for the cultures that build names that way) and its own habits for naming
 * places and features, so neighbouring lands sound different. Feature words stay in English
 * (the map's language) while the proper names come from the local culture.
 */

export type FeatureKind =
  | 'settlement' | 'river' | 'lake' | 'inlandSea' | 'sea' | 'ocean' | 'gulf' | 'bay' | 'bight' | 'strait' | 'channel'
  | 'island' | 'isles' | 'continent' | 'mountains' | 'hills' | 'peak' | 'forest' | 'desert' | 'marsh' | 'plains'
  | 'realm' | 'road';

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

export interface SiteClimate {
  temp: number;
  tempCold: number;
  precip: number;
  heightM: number;
  forest: boolean;
  dry: boolean;
  coastal: boolean;
}

const near = (v: number, lo: number, hi: number, soft = 6) =>
  v < lo ? Math.max(0, 1 - (lo - v) / soft) : v > hi ? Math.max(0, 1 - (v - hi) / soft) : 1;

export const CULTURES: Culture[] = [
  {
    id: 'anglo',
    likes: (c) => near(c.temp, 6, 13) * near(c.precip, 500, 1400, 400),
    starts: ['Ash', 'Bram', 'Cal', 'Dun', 'Elm', 'Fen', 'Gar', 'Hal', 'Kel', 'Lang', 'Mar', 'Nor', 'Ped', 'Ral', 'Sel', 'Tam', 'Wen', 'Wil', 'Ald', 'Brad', 'Cold', 'Ox', 'Harl', 'Thur'],
    mids: ['er', 'ing', 'el', 'en', 'an'],
    ends: ['ton', 'ford', 'wick', 'ham', 'by', 'stead', 'well', 'field', 'mere', 'dale', 'ley', 'worth', 'cott', 'bury', 'sey', 'holm', 'den', 'combe'],
    midChance: 0.25,
    roots: ['Ash', 'Thorn', 'Black', 'Grey', 'Elder', 'Oak', 'Red', 'Stone', 'Wolf', 'Raven', 'Hollow', 'Bramble', 'Mill', 'Fen', 'Cold', 'High', 'Kings', 'Wych', 'Hart', 'Swan', 'Holly', 'Briar', 'Marsh', 'Sheep', 'Salt', 'Iron', 'Wither', 'Ember', 'Moss', 'Rook'],
    suffixes: ['ford', 'wick', 'ton', 'ham', 'bridge', 'field', 'mere', 'dale', 'well', 'wood', 'brook', 'stead', 'gate', 'hollow', 'moor', 'cross', 'bury', 'ley', 'haven', 'thorpe'],
    compoundChance: 0.6,
    terms: {
      river: ['the {N}', 'the {N}', '{N} Water', 'River {N}'],
      lake: ['{N} Mere', 'Lake {N}', '{N} Water'],
      hills: ['{N} Downs', '{N} Hills', 'the {A} Hills', '{N} Wolds'],
      forest: ['{N} Wood', '{N} Forest', 'the {A} Wood', '{N} Chase'],
      marsh: ['{N} Fens', 'the {A} Fens', '{N} Marsh'],
      peak: ['{N} Pike', 'Mount {N}', '{N} Tor'],
    },
    realm: ['Kingdom of {N}', 'Duchy of {N}', 'the {N} March', 'Earldom of {N}'],
  },
  {
    id: 'norse',
    likes: (c) => near(c.temp, -8, 5, 5) * (c.coastal ? 1.2 : 0.9),
    starts: ['Thor', 'Skar', 'Hrav', 'Jarn', 'Kald', 'Svart', 'Isa', 'Grim', 'Bjorn', 'Ask', 'Ulf', 'Ragn', 'Sig', 'Hal', 'Vik', 'Eir', 'Frey', 'Gud', 'Hel', 'Kol', 'Orm', 'Stein', 'Tor', 'Vald'],
    mids: ['a', 'e', 'ar', 'ing'],
    ends: ['vik', 'heim', 'by', 'dal', 'stad', 'holm', 'gard', 'nes', 'fjord', 'berg', 'havn', 'sund', 'vald', 'ey', 'strand'],
    midChance: 0.2,
    roots: ['Frost', 'Ice', 'Storm', 'Wolf', 'Raven', 'Iron', 'Grim', 'Bear', 'Elk', 'Whale', 'Skull', 'Rime', 'Ash', 'Thunder'],
    suffixes: ['fjord', 'heim', 'vik', 'holm', 'gard', 'fell', 'ness', 'havn', 'by', 'stad'],
    compoundChance: 0.25,
    terms: {
      river: ['the {N}', '{N} Elv', 'the {N} Water'],
      lake: ['{N} Vatn', 'Lake {N}', '{N} Water'],
      hills: ['the {N} Fells', '{N} Fells', 'the {A} Fells'],
      mountains: ['the {N} Fjells', '{N} Mountains', 'the {A} Peaks'],
      peak: ['{N} Horn', '{N}tind', 'Mount {N}'],
      bay: ['{N} Fjord', 'Bay of {N}', '{N} Vik'],
      gulf: ['{N} Fjord', 'Gulf of {N}'],
      strait: ['{N} Sund', 'the {N} Sound', '{N} Strait'],
    },
    realm: ['Jarldom of {N}', 'Kingdom of {N}', '{N} Hold'],
  },
  {
    id: 'latin',
    likes: (c) => near(c.temp, 10, 18) * near(c.precip, 300, 1200, 400),
    starts: ['Val', 'Cor', 'Aur', 'Max', 'Sev', 'Cal', 'Ter', 'Ost', 'Ven', 'Lav', 'Num', 'Ser', 'Tal', 'Vor', 'Luc', 'Mag', 'Pal', 'Sal', 'Ant', 'Fel'],
    mids: ['en', 'er', 'an', 'in', 'ar', 'ul', 'or'],
    ends: ['ium', 'ia', 'ona', 'um', 'ara', 'ica', 'anum', 'entum', 'ova', 'ina', 'ensis', 'aria', 'ium'],
    midChance: 0.55,
    terms: {
      river: ['the {N}', 'River {N}'],
      lake: ['Lake {N}', 'Lacus {N}'],
      mountains: ['the {N} Mountains', 'Montes {N}', 'the {A} Mountains'],
      peak: ['Mount {N}', 'Mons {N}'],
      sea: ['Mare {N}', 'the {N} Sea', 'Sea of {N}'],
      ocean: ['the {N} Ocean', 'Oceanus {N}'],
    },
    realm: ['Province of {N}', 'Principality of {N}', 'Imperium of {N}', 'Republic of {N}'],
  },
  {
    id: 'celtic',
    likes: (c) => near(c.temp, 4, 12) * (c.precip > 900 ? 1.2 : 0.6) * (c.coastal ? 1.1 : 0.9),
    starts: ['Bryn', 'Dun', 'Glen', 'Mor', 'Rhos', 'Tre', 'Pen', 'Caer', 'Ard', 'Bal', 'Kil', 'Cor', 'Fion', 'Gwyn', 'Lla', 'Tir', 'Aed', 'Bran', 'Cael', 'Dor'],
    mids: ['an', 'en', 'wy', 'ach', 'ol'],
    ends: ['wyn', 'more', 'dun', 'loch', 'garth', 'mor', 'ael', 'och', 'an', 'agh', 'rin', 'nant', 'hir', 'aed', 'ys'],
    midChance: 0.3,
    prefixes: ['Aber', 'Llan', 'Kil', 'Dun', 'Inver', 'Glen', 'Pen', 'Caer', 'Ard', 'Bal'],
    prefixChance: 0.35,
    terms: {
      river: ['the {N}', 'Afon {N}', 'the {N} Water'],
      lake: ['Loch {N}', 'Llyn {N}', 'Lough {N}'],
      hills: ['the {N} Hills', 'Bryn {N}', 'the {A} Hills'],
      mountains: ['the {N} Mountains', 'the {A} Mountains', 'Beinn {N}'],
      peak: ['Ben {N}', 'Carn {N}', 'Mount {N}'],
      marsh: ['the {N} Moss', '{N} Bog', 'the {A} Moss'],
      forest: ['Coed {N}', '{N} Wood', 'the {A} Wood'],
    },
    realm: ['Kingdom of {N}', 'Clan Lands of {N}', 'the High Kingdom of {N}'],
  },
  {
    id: 'elvish',
    likes: (c) => (c.forest ? 1.3 : 0.5) * near(c.temp, 6, 20) * (c.precip > 800 ? 1.1 : 0.7),
    starts: ['Ael', 'Eld', 'Sil', 'Thal', 'Lor', 'Gal', 'Mir', 'Ith', 'Cel', 'Nim', 'Ara', 'Fae', 'Lin', 'Ere', 'Iss', 'Quel', 'Ven', 'Aes', 'Lia', 'Myr'],
    mids: ['an', 'en', 'ir', 'ae', 'il', 'or', 'ith', 'ar'],
    ends: ['ion', 'wen', 'dor', 'las', 'thil', 'ond', 'iel', 'oth', 'ath', 'ian', 'ren', 'ost', 'lin', 'nor', 'mir', 'ael'],
    midChance: 0.55,
    terms: {
      river: ['the {N}', 'the {N}', 'River {N}'],
      lake: ['Lake {N}', 'the Mere of {N}', 'Lake {N}'],
      forest: ['the Woods of {N}', '{N} Forest', 'the {A} Wood', '{N}'],
      mountains: ['the {N} Mountains', 'the {A} Peaks', '{N}'],
      sea: ['the {N} Sea', 'the Sea of {M}', 'Sea of {N}'],
    },
    realm: ['Realm of {N}', 'the Elvenhold of {N}', '{N}'],
  },
  {
    id: 'desert',
    likes: (c) => (c.dry ? 1.2 : 0.2) * near(c.temp, 16, 30, 8),
    starts: ['Qas', 'Zar', 'Sul', 'Mar', 'Khal', 'Bir', 'Har', 'Nas', 'Tar', 'Rash', 'Jah', 'Dar', 'Saf', 'Kaz', 'Mir', 'Ham', 'Azz'],
    mids: ['a', 'i', 'ar', 'im', 'ab', 'u'],
    ends: ['abad', 'ar', 'im', 'esh', 'ah', 'un', 'ira', 'and', 'oum', 'eya', 'iz', 'ad', 'an', 'is'],
    midChance: 0.4,
    prefixes: ['Al ', 'Bir ', 'Qasr ', 'Ras '],
    prefixChance: 0.08,
    terms: {
      river: ['Wadi {N}', 'the {N}', 'River {N}'],
      desert: ['the {N} Sands', '{N} Desert', 'the {A} Waste', 'the Erg {N}'],
      mountains: ['the {N} Mountains', 'Jebel {N}', 'the {A} Mountains'],
      peak: ['Jebel {N}', 'Mount {N}'],
      lake: ['Lake {N}', 'the Oasis of {N}', 'Lake {N}'],
      sea: ['the Sea of {N}', '{N} Sea'],
    },
    realm: ['Sultanate of {N}', 'Emirate of {N}', 'Caliphate of {N}'],
  },
  {
    id: 'slavic',
    likes: (c) => near(c.temp, 0, 9, 5) * (c.tempCold < -6 ? 1.2 : 0.7) * (c.coastal ? 0.8 : 1.1),
    starts: ['Bel', 'Zar', 'Vol', 'Mir', 'Dra', 'Kos', 'Sta', 'Pol', 'Gor', 'Vel', 'Bor', 'Rad', 'Sve', 'Yar', 'Lub', 'Kras', 'Dob', 'Vys', 'Tver', 'Chor'],
    mids: ['o', 'e', 'an', 'is', 'ov'],
    ends: ['grad', 'ov', 'ovo', 'ice', 'sk', 'in', 'ava', 'na', 'ets', 'ograd', 'ny', 'ka', 'ow', 'avl', 'ich'],
    midChance: 0.35,
    terms: {
      river: ['the {N}', 'River {N}'],
      lake: ['Lake {N}', '{N} Ozero'],
      forest: ['the {N} Forest', '{N} Woods', 'the {A} Forest', 'the {N} Taiga'],
      marsh: ['the {N} Marshes', '{N} Bog', 'the {A} Marshes'],
      plains: ['the {N} Steppe', '{N} Plains', 'the {A} Steppe'],
    },
    realm: ['Voivodeship of {N}', 'Tsardom of {N}', 'Principality of {N}', 'Grand Duchy of {N}'],
  },
  {
    id: 'dwarven',
    likes: (c) => (c.heightM > 900 ? 1.4 : 0.15) * near(c.temp, -6, 16, 6),
    starts: ['Khaz', 'Dur', 'Bar', 'Grun', 'Thra', 'Kar', 'Zir', 'Mor', 'Bal', 'Dol', 'Gim', 'Thor', 'Bor', 'Nar', 'Dwal', 'Krag'],
    mids: ['a', 'u', 'in', 'ak'],
    ends: ['dum', 'grim', 'dur', 'hold', 'dek', 'zad', 'gol', 'rak', 'mir', 'bek', 'dun', 'thar', 'ghor'],
    midChance: 0.25,
    roots: ['Iron', 'Stone', 'Hammer', 'Anvil', 'Deep', 'Grey', 'Gold', 'Copper', 'Flint', 'Forge', 'Coal', 'Granite'],
    suffixes: ['hold', 'delve', 'hall', 'deep', 'peak', 'gate', 'forge', 'mount'],
    compoundChance: 0.35,
    terms: {
      mountains: ['the {N} Mountains', 'the {A} Peaks', 'the {N} Spires', 'the {N} Crags'],
      peak: ['{N} Peak', 'Mount {N}', '{N} Spire'],
      hills: ['the {N} Hills', 'the {A} Tors'],
    },
    realm: ['Kingdom under {N}', '{N} Hold', 'Thanedom of {N}'],
  },
  {
    id: 'southern',
    likes: (c) => near(c.temp, 14, 24) * (c.coastal ? 1.3 : 0.7) * near(c.precip, 250, 900, 300),
    starts: ['Kal', 'Ther', 'Ny', 'Ste', 'Phi', 'Mar', 'Dra', 'Ly', 'Ko', 'Ari', 'Hel', 'Ere', 'Mes', 'Pyr', 'Zan', 'Alo', 'Tes', 'Ira'],
    mids: ['a', 'o', 'e', 'an', 'ys', 'ri'],
    ends: ['opolis', 'os', 'a', 'ene', 'ion', 'aia', 'eia', 'ikos', 'ora', 'is', 'ane', 'ossa', 'ea', 'yra'],
    midChance: 0.45,
    terms: {
      river: ['the {N}', 'River {N}'],
      gulf: ['Gulf of {N}', 'the {N} Gulf'],
      sea: ['the {N} Sea', 'Sea of {N}', 'the {A} Sea'],
      island: ['{N}', '{N}', 'Isle of {N}'],
    },
    realm: ['League of {N}', 'Thalassocracy of {N}', 'Despotate of {N}', 'Republic of {N}'],
  },
  {
    id: 'steppe',
    likes: (c) => (c.dry ? 1.1 : 0.4) * near(c.temp, -2, 14, 6) * (c.forest ? 0.4 : 1.2) * (c.coastal ? 0.6 : 1.2),
    starts: ['Kar', 'Tem', 'Ur', 'Bat', 'Sar', 'Oz', 'Gul', 'Al', 'Tuk', 'Kes', 'Bor', 'Ak', 'Kyz', 'Ord', 'Tol', 'Yes'],
    mids: ['a', 'u', 'i', 'ar', 'ul'],
    ends: ['tai', 'ur', 'al', 'an', 'yk', 'kent', 'tash', 'gol', 'tug', 'bek', 'sai', 'kul', 'dar'],
    midChance: 0.3,
    terms: {
      plains: ['the {N} Steppe', 'the {A} Steppe', '{N} Plains'],
      lake: ['{N} Kul', 'Lake {N}'],
      desert: ['the {N} Desert', 'the {A} Waste'],
      hills: ['the {N} Hills', 'the {A} Hills'],
    },
    realm: ['Khaganate of {N}', 'Horde of {N}', 'Khanate of {N}'],
  },
  {
    id: 'jungle',
    likes: (c) => (c.temp > 22 ? 1.3 : 0.1) * (c.precip > 1200 ? 1.2 : 0.4),
    starts: ['Ta', 'Ma', 'Ka', 'Lu', 'Zo', 'Ni', 'Pa', 'Wa', 'Ix', 'Ch', 'Yo', 'Te', 'Ha', 'Mo', 'Ku', 'Oa'],
    mids: ['la', 'ma', 'ka', 'tli', 'ru', 'pa', 'na', 'ya'],
    ends: ['lan', 'tec', 'co', 'an', 'ua', 'ka', 'mal', 'pan', 'tla', 'mu', 'ri', 'nai', 'ko'],
    midChance: 0.6,
    terms: {
      forest: ['the {N} Jungle', '{N} Forest', 'the {A} Jungle'],
      river: ['the {N}', 'River {N}'],
      marsh: ['the {N} Swamp', 'the {A} Mire', '{N} Marsh'],
      island: ['{N}', '{N}', '{N} Island'],
    },
    realm: ['Empire of {N}', 'Kingdom of {N}', 'the {N} Confederacy'],
  },
];

/** Generic templates, used when a culture has none of its own for a kind. */
export const DEFAULT_TERMS: Record<FeatureKind, string[]> = {
  settlement: ['{N}'],
  river: ['the {N}', 'River {N}', '{N} River'],
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
  realm: ['Kingdom of {N}'],
  road: ['the {N} Road', 'the {N} Way', 'the Old {N} Road'],
};

export const ADJECTIVES = [
  'Grey', 'Black', 'White', 'Red', 'Green', 'Silver', 'Iron', 'Cold', 'High', 'Long', 'Broken', 'Whispering', 'Drowned',
  'Shining', 'Weeping', 'Sunken', 'Hollow', 'Bitter', 'Golden', 'Pale', 'Misty', 'Burning', 'Lonely', 'Endless', 'Shrouded',
  'Ashen', 'Crimson', 'Howling', 'Silent', 'Wandering', 'Forgotten', 'Jagged', 'Twilight', 'Thorny', 'Amber', 'Stormy',
];

export const MOTIFS = [
  'Mists', 'Storms', 'Sorrows', 'Silence', 'Ash', 'Whispers', 'Shadows', 'Tears', 'Stars', 'Bones', 'Dreams', 'Thorns',
  'Embers', 'Kings', 'Ghosts', 'Lanterns', 'Wolves', 'Crows', 'Salt', 'Glass',
];
