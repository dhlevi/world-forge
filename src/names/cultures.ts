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
    realm: ['Kingdom of {N}', 'Duchy of {N}', 'The {N} March', 'Earldom of {N}', 'The Principality of {N}', 'The county of {N}', 'The Republic of {N}', 'The {N} Empire', 'The {N} Republic'],
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
    realm: ['Sultanate of {N}', 'Emirate of {N}', 'Caliphate of {N}', 'The {N} Caliphate', 'The {N} Sultanate'],
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
    realm: ['Kingdom under {N}', '{N} Hold', 'Thanedom of {N}', '{N}s Deep'],
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
    realm: ['League of {N}', 'Dominion of {N}', 'Despotate of {N}', 'Republic of {N}'],
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
    realm: ['Khaganate of {N}', 'The {N} Horde', 'Horde of {N}', 'Khanate of {N}'],
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

/**
 * More syllables and compound parts for every culture, merged into the sets above (duplicates
 * dropped). Villages are named one by one without checking the rest of the world, so the
 * number of possible names per culture has to be large (tens of thousands) to keep repeats rare.
 */
const EXTRA: Record<string, Partial<Pick<Culture, 'starts' | 'mids' | 'ends' | 'roots' | 'suffixes' | 'prefixes'>>> = {
  anglo: {
    starts: ['Ab', 'Bar', 'Bex', 'Chad', 'Chip', 'Dor', 'Eg', 'Ful', 'God', 'Hart', 'Hem', 'Ick', 'Kir', 'Lod', 'Lym', 'Mel', 'Nut', 'Ock', 'Pen', 'Quar', 'Rud', 'Shap', 'Stan', 'Tad', 'Ux', 'Wal', 'Wim', 'Yar', 'Brom', 'Cran', 'Ded', 'Ever', 'Graf', 'Hind', 'Mal', 'Sut', 'Thack', 'Wark', 'Buck', 'Chis'],
    mids: ['es', 'ow', 'ing', 'ers'],
    ends: ['ington', 'ock', 'hurst', 'stow', 'wold', 'ridge', 'thwaite', 'bourne', 'cester', 'leigh', 'marsh', 'minster', 'mouth', 'hope', 'ness', 'ey', 'hall', 'wich', 'ham', 'side', 'over', 'nor', 'burn'],
    roots: ['Birch', 'Crane', 'Dove', 'Ember', 'Fox', 'Gold', 'Hare', 'Kettle', 'Lark', 'Maple', 'Nettle', 'Otter', 'Pike', 'Quarry', 'Rush', 'Sedge', 'Thistle', 'Willow', 'Yew', 'Badger', 'Barley', 'Clay', 'Flax', 'Hazel', 'Heath', 'Lime', 'Mire', 'Oat', 'Rye', 'Wheat', 'Copper', 'Chalk', 'Bell', 'Church', 'Bishop', 'Knight', 'Abbot', 'Steeple'],
    suffixes: ['hurst', 'stow', 'wold', 'ridge', 'bourne', 'leigh', 'mouth', 'hope', 'worth', 'cott', 'combe', 'holt', 'shaw', 'den', 'by', 'fold', 'mead', 'pool', 'wick', 'end', 'heath', 'barrow', 'green', 'stoke'],
  },
  norse: {
    starts: ['Arn', 'Bal', 'Brand', 'Dag', 'Ein', 'Finn', 'Gunn', 'Hak', 'Hild', 'Ing', 'Jor', 'Knut', 'Leif', 'Mjol', 'Njal', 'Odd', 'Rol', 'Sten', 'Thrym', 'Ulv', 'Vest', 'Ygg', 'Ald', 'Bors', 'Ey', 'Gaut', 'Hjal', 'Lund', 'Nor', 'Os', 'Sol', 'Trond', 'Aur', 'Brei', 'Dyr', 'Fjall', 'Hrafn', 'Kvik'],
    mids: ['ar', 'en', 'u', 'ol', 'is', 'ed'],
    ends: ['vin', 'land', 'skog', 'hus', 'tun', 'rud', 'set', 'voll', 'stein', 'hamn', 'vag', 'dalen', 'nesset', 'oy', 'fell', 'borg', 'lund', 'tveit', 'aker', 'bu', 'mo', 'sjo', 'eid', 'haug'],
    roots: ['Salt', 'Seal', 'Gull', 'Pine', 'Birch', 'Elm', 'Boar', 'Hawk', 'Snow', 'Black', 'White', 'Red', 'Long', 'High', 'Old', 'Grey', 'Sea', 'Horn', 'Shield', 'Axe', 'Elder', 'Moss', 'Rock', 'Fish'],
    suffixes: ['vik', 'nes', 'dal', 'berg', 'sund', 'strand', 'skog', 'tun', 'borg', 'lund', 'oy', 'hamn', 'set', 'haug', 'eid', 'fell', 'land'],
  },
  latin: {
    starts: ['Aem', 'Alb', 'Arv', 'Bri', 'Cap', 'Clau', 'Dec', 'Div', 'Emer', 'Fab', 'Flav', 'Gall', 'Hel', 'Ital', 'Jul', 'Lat', 'Lib', 'Marc', 'Nerv', 'Oct', 'Pon', 'Quin', 'Rom', 'Sab', 'Sulp', 'Tib', 'Ulp', 'Vesp', 'Vit', 'Aqu', 'Bon', 'Cort', 'Fid', 'Laur', 'Pom', 'Sulm', 'Trev', 'Verc'],
    mids: ['il', 'ac', 'ur', 'av', 'et', 'ost'],
    ends: ['acum', 'ula', 'etum', 'ium', 'onia', 'ana', 'ensis', 'inum', 'avia', 'ella', 'ana', 'esia', 'ero', 'ano', 'ino', 'one', 'ia', 'ura', 'ago', 'unum', 'ita', 'orum', 'ae', 'ica'],
    prefixes: ['Porta ', 'Castra ', 'Forum ', 'Aquae ', 'Villa ', 'Pons '],
  },
  celtic: {
    starts: ['Ath', 'Bedd', 'Bla', 'Carr', 'Cnoc', 'Crai', 'Derr', 'Dryn', 'Ell', 'Fear', 'Gar', 'Hen', 'Inis', 'Lis', 'Mael', 'Nev', 'Olla', 'Por', 'Ros', 'Strath', 'Tal', 'Tul', 'Ys', 'Aon', 'Bry', 'Cwm', 'Dinas', 'Eil', 'Gor', 'Kel', 'Mona', 'Rhyd', 'Sgur', 'Taf'],
    mids: ['ar', 'ain', 'og', 'ell', 'ro'],
    ends: ['ross', 'more', 'beg', 'lin', 'carn', 'fach', 'fawr', 'goch', 'gwyn', 'craig', 'drum', 'esk', 'ilt', 'uist', 'wen', 'ford', 'ochrie', 'aven', 'allt', 'ach', 'aig', 'ery'],
    prefixes: ['Strath', 'Bally', 'Tre', 'Dol', 'Ros', 'Inis', 'Drum', 'Achna'],
  },
  elvish: {
    starts: ['Alf', 'Bel', 'Cir', 'Dae', 'Ear', 'Fin', 'Gil', 'Hal', 'Ilm', 'Lae', 'Mel', 'Nar', 'Oro', 'Pel', 'Rhi', 'Sae', 'Tin', 'Ul', 'Vae', 'Yav', 'Aer', 'Elen', 'Ilth', 'Lith', 'Naer', 'Syl', 'Tae', 'Ves', 'Aran', 'Cael', 'Ilu', 'Mith'],
    mids: ['iel', 'al', 'en', 'ue', 'ra', 'li', 'ae'],
    ends: ['dil', 'loth', 'nas', 'rien', 'thas', 'vae', 'wyn', 'driel', 'lond', 'mar', 'neth', 'ril', 'sir', 'tar', 'uin', 'viel', 'ador', 'eth', 'ithil', 'orn', 'aen', 'alas'],
  },
  desert: {
    starts: ['Ab', 'Bah', 'Dah', 'Fal', 'Ghad', 'Haf', 'Ism', 'Jaz', 'Kar', 'Lat', 'Mak', 'Nab', 'Om', 'Qat', 'Ruw', 'Sab', 'Tam', 'Wad', 'Yaz', 'Zah', 'Ash', 'Bad', 'Dum', 'Kuf', 'Man', 'Nuz', 'Shar', 'Taf', 'Ubay', 'Zab'],
    mids: ['an', 'ul', 'ir', 'ash', 'al'],
    ends: ['iyah', 'ra', 'an', 'oun', 'aba', 'ar', 'ein', 'ul', 'ira', 'aya', 'oud', 'ash', 'ma', 'una', 'id', 'af', 'out', 'eh', 'at'],
    prefixes: ['Wadi ', 'Bab ', 'Dar ', 'Tell ', 'Ain '],
  },
  slavic: {
    starts: ['Bog', 'Brat', 'Ces', 'Cher', 'Dub', 'Glin', 'Gost', 'Iv', 'Jar', 'Kam', 'Lip', 'Lis', 'Mog', 'Nov', 'Ozer', 'Pech', 'Pskov', 'Ros', 'Sel', 'Smol', 'Stav', 'Tor', 'Ug', 'Vel', 'Vlad', 'Yas', 'Zel', 'Zvon', 'Bych', 'Gniez', 'Kol', 'Prze', 'Suz'],
    mids: ['a', 'i', 'ol', 'uk', 'ev'],
    ends: ['ograd', 'ovka', 'ino', 'evo', 'insk', 'ets', 'nik', 'ica', 'ow', 'any', 'ice', 'ovice', 'sko', 'yn', 'ishche', 'ubov', 'ava', 'ec', 'ok', 'ach', 'ensk', 'ichi', 'omir', 'oslav', 'ozero', 'opol', 'ovets', 'ichev', 'ishte', 'nica', 'ovo', 'aya', 'ostok', 'orsk', 'ovsk', 'yov', 'ina', 'uga', 'el'],
    prefixes: ['Nova ', 'Stara ', 'Velika ', 'Mala ', 'Gorna ', 'Dolna '],
  },
  dwarven: {
    starts: ['Ad', 'Bif', 'Bru', 'Dag', 'Dain', 'Fal', 'Fun', 'Gar', 'Gund', 'Hor', 'Kel', 'Kil', 'Lok', 'Mag', 'Mun', 'Nor', 'Orn', 'Rur', 'Skor', 'Tor', 'Ul', 'Vor', 'Zar', 'Bram', 'Dor', 'Gor', 'Har', 'Khel', 'Thur', 'Grim', 'Brok', 'Durn'],
    mids: ['ar', 'or', 'um', 'ek', 'il'],
    ends: ['dar', 'gund', 'heim', 'kar', 'lok', 'mund', 'nar', 'rim', 'tok', 'vald', 'zul', 'baraz', 'bul', 'gar', 'hal', 'kun', 'mek', 'nul', 'thrum', 'dor', 'grund', 'rak'],
    roots: ['Silver', 'Mithril', 'Ruby', 'Garnet', 'Slate', 'Basalt', 'Obsidian', 'Bronze', 'Pick', 'Axe', 'Shield', 'Beard', 'Ember', 'Ash', 'Black', 'Red', 'High', 'Low', 'Under', 'Rune', 'Gem', 'Lode', 'Tin', 'Salt'],
    suffixes: ['home', 'crag', 'barrow', 'vault', 'shaft', 'rock', 'stone', 'mine', 'heart', 'helm', 'spire', 'cleft', 'pit', 'rest'],
  },
  southern: {
    starts: ['Aeg', 'Arg', 'Cor', 'Del', 'Eph', 'Gor', 'Kor', 'Lem', 'Mil', 'Nax', 'Ol', 'Par', 'Rho', 'Sam', 'Syb', 'Tha', 'Xan', 'Zak', 'Ath', 'Byz', 'Chal', 'Dod', 'Hal', 'Kyth', 'Myk', 'Pat', 'Sest', 'Tri', 'Epi', 'Lark'],
    mids: ['an', 'ar', 'ip', 'ot', 'el', 'ith'],
    ends: ['ia', 'os', 'ene', 'inthos', 'ae', 'ia', 'eion', 'oupolis', 'ymna', 'assos', 'eus', 'akis', 'ike', 'oni', 'ari', 'issa', 'ios', 'ira', 'odos', 'ena', 'ates'],
  },
  steppe: {
    starts: ['Ab', 'Ay', 'Bal', 'Bek', 'Chag', 'Er', 'Il', 'Jal', 'Kab', 'Kur', 'Mang', 'Nar', 'Ot', 'Qar', 'Shu', 'Tal', 'Tur', 'Uch', 'Yal', 'Zhan', 'Aral', 'Bor', 'Dom', 'Kum', 'Sary', 'Tash', 'Ust', 'Bay', 'Kok'],
    mids: ['ar', 'ak', 'ug', 'in', 'yl'],
    ends: ['abad', 'aral', 'bulak', 'chi', 'dag', 'gan', 'iz', 'kala', 'kum', 'lik', 'mak', 'or', 'su', 'tau', 'tobe', 'uk', 'yr', 'zhar', 'kol', 'bay', 'kan', 'ty'],
    prefixes: ['Kara ', 'Ak ', 'Kyzyl ', 'Sary ', 'Ulan '],
  },
  jungle: {
    starts: ['Ah', 'Che', 'Ek', 'Hu', 'Itz', 'Ki', 'La', 'Mi', 'Na', 'Oc', 'Pe', 'Qu', 'Sa', 'Tu', 'Ux', 'Xa', 'Ya', 'Za', 'Coa', 'Hue', 'Tla', 'Yax', 'Ato', 'Iza'],
    mids: ['hu', 'xi', 'to', 'ca', 'ni', 'lo', 'tz'],
    ends: ['tzin', 'huac', 'pec', 'tlan', 'kal', 'mul', 'ten', 'chac', 'lum', 'xan', 'ba', 'pa', 'tun', 'ac', 'ich', 'il', 'oc', 'uy'],
  },
};
/** A middle syllable more often in the cultures with the smaller sets. */
const MID_CHANCE: Record<string, number> = { norse: 0.3, slavic: 0.5, dwarven: 0.35, steppe: 0.45, desert: 0.5, southern: 0.5, celtic: 0.4 };
for (const c of CULTURES) {
  if (MID_CHANCE[c.id] !== undefined) c.midChance = Math.max(c.midChance, MID_CHANCE[c.id]);
  const x = EXTRA[c.id];
  if (!x) continue;
  for (const k of ['starts', 'mids', 'ends', 'roots', 'suffixes', 'prefixes'] as const) {
    if (x[k]) c[k] = [...new Set([...(c[k] ?? []), ...x[k]!])];
  }
  // Two-word names ("Stara Volovka", "Castra Felium") for cultures that gained prefixes here.
  if (x.prefixes && !c.prefixChance) c.prefixChance = 0.1;
}

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
  'Hallowed', 'Sacred', 'Defiled', 'Cursed', 'Blessed', 'Accursed', 'Enchanted', 'Forsaken', 'Golden', 'Divine', 'Glorious'
];

export const MOTIFS = [
  'Mists', 'Storms', 'Sorrows', 'Silence', 'Ash', 'Whispers', 'Shadows', 'Tears', 'Stars', 'Bones', 'Dreams', 'Thorns',
  'Embers', 'Kings', 'Ghosts', 'Lanterns', 'Wolves', 'Crows', 'Ravens', 'Eagles', 'Salt', 'Glass', 'Flames', 'Ice'
];
