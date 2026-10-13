import { grammar, near, type TemplateBundle } from '../bundle';

const TOTEMS = ['Bear', 'Wolf', 'Turtle', 'Hawk', 'Deer', 'Heron', 'Beaver', 'Snipe', 'Eel', 'Crane', 'Otter', 'Eagle'];

/**
 * Woodland: the peoples of the temperate forests of the New World, after the peoples of the eastern woodlands. Their
 * clans are named for totems, the clan mothers choose their chiefs, and their rulers take no epithets.
 */
export const WOODLAND: TemplateBundle = {
  label: 'Woodland',
  folk: 'Humans',
  world: 'new',
  peoples: 'woodland peoples',
  culture: {
    id: 'woodland',
    likes: (c) => near(c.temp, -2, 16, 6) * (c.forest ? 1.3 : 0.8) * (c.dry ? 0.7 : 1),
    starts: [
      'Ota', 'Wena', 'Kesa', 'Mishi', 'Nako', 'Tawa', 'Sena', 'Owa', 'Kana', 'Pemi', 'Wabi', 'Chena', 'Oki', 'Mani', 'Seka', 'Tolo', 'Ahna', 'Kito',
      'Wasa', 'Neko', 'Ishpi', 'Mato', 'Hono', 'Kawi', 'Tesa', 'Yona', 'Alo', 'Pawa', 'Minu', 'Shawa', 'Ketu', 'Namo', 'Sopa', 'Wita', 'Ekwa',
    ],
    mids: ['ka', 'na', 'wa', 'sa', 'ta', 'mi', 'qua'],
    ends: [
      'gan', 'tawa', 'wick', 'see', 'nee', 'mak', 'poka', 'wan', 'ka', 'tuk', 'sha', 'neka', 'wa', 'naw', 'gamee', 'hela', 'tonka', 'kee', 'sota',
      'wanee', 'ock', 'muk', 'quin', 'sippi', 'nock', 'tic',
    ],
    midChance: 0.35,
    terms: {
      river: ['the {N}', 'the {N} River', 'River {N}'],
      lake: ['Lake {N}', '{N} Water'],
      forest: ['the {N} Woods', 'the {A} Woods', '{N} Forest'],
      mountains: ['the {N} Mountains', 'the {A} Ridges'],
      hills: ['the {N} Hills', 'the {A} Knobs'],
      plains: ['the {N} Prairie', 'the {A} Grasslands'],
      peak: ['{N} Peak', 'Mount {N}'],
    },
    realm: ['the {N} Nation', 'the {N} Confederacy'],
  },
  lang: {
    id: 'woodland', after: 'the Algonquian and Iroquoian languages of the eastern woodlands',
    C: { p: 2, t: 3, k: 5, m: 4, n: 5, s: 3, ʃ: 2, h: 2, w: 4, j: 1, tʃ: 2 },
    V: { a: 6, e: 3, i: 4, o: 4, u: 1, 'aː': 1, 'iː': 1 },
    syl: { CV: 6, CVC: 3, V: 1.2 },
    onsets: ['s k', 'k w', 'm w'],
    codas: [],
    finals: ['k', 'n', 'm', 's', 't'],
    compound: 'final', roots: [2, 3], stress: 'penultimate',
    spell: { ʃ: 'sh', tʃ: 'ch', 'aː': 'aa', 'iː': 'ee', j: 'y' },
    grammar: grammar({ order: 'SOV', adj: 'before', def: 'none', indef: 'none', plural: 'suffix', poss: 'prefix', gender: 2, genderKind: 'animacy', tense: 'prefix', agree: true }),
    forms: { plural: 'ak', poss: 'o' },
    masc: ['ok', 'an', 'is', 'aw', 'ee'], fem: ['a', 'ee', 'ah', 'wa', 'ka'],
    demonym: ['ee', 'ic', 'an'],
    seeds: {},
  },
  given: [
    [
      'Grey Owl', 'Black Hawk', 'Red Cloud', 'Running Elk', 'Two Rivers', 'Tall Pine', 'Swift Otter', 'Stands-in-Fire',
      'White Bear', 'Thunder Voice', 'Lone Wolf', 'Many Horses', 'Quiet Fox', 'Iron Shell', 'Broken Bow', 'Far Walker',
      'Sitting Bull', 'Crazy Horse', 'Tecumseh', 'Geronimo', 'Cochise', 'Pontiac', 'Osceola', 'Red Jacket', 'Little Turtle',
      'Ten Bears', 'Gall', 'Spotted Tail', 'Rain-in-the-Face', 'Crow Dog', 'Kicking Bear', 'American Horse', 'Two Strike',
      'Chief Joseph', 'White Antelope', 'Left Hand', 'Black Kettle', 'Roman Nose', 'Duluth', 'Brave Bear'
    ],
    [
      'Morning Star', 'Bright Water', 'White Doe', 'Singing Wind', 'Blue Heron', 'Little Dove', 'Falling Leaf', 'Moon Rising',
      'Sweet Grass', 'Red Willow', 'Spotted Fawn', 'Snow Bird', 'Laughing Brook', 'Wild Rose', 'Dawn Light', 'Corn Tassel',
      'Sacagawea', 'Pocahontas', 'Lozen', 'Dahteste', 'Pine Leaf', 'Buffalo Calf Road', 'Pretty Nose', 'Running Eagle',
      'Moving Robe', 'Minnehaha', 'Golden Rod', 'Silver Willow', 'Sun Flower', 'Cloud Dancer', 'Whispering Pines', 'Star Flower',
      'Winter Moon', 'Summer Rain', 'Spring Blossom', 'Autumn Sky', 'Quiet Lake', 'Dancing Feather', 'Soft Breeze', 'Gentle Rain'
    ],
  ],
  numerals: false,
  house: (_root, rnd) => {
    const totem = TOTEMS[Math.floor(rnd() * TOTEMS.length)];
    return { name: `the ${totem} Clan`, short: totem };
  },
  epithets: [],
  noEpithets: true,
  ethos: { communal: 3, egalitarian: 2, spiritual: 1 },
  affinity: { forestFolk: 1.2, clanTies: 0.9, storytellers: 0.9 },
  architecture: 'bark longhouses inside palisades',
  dress: 'buckskin, beadwork and feathers',
  food: 'maize, beans, squash, venison and fish',
  equalArms: 0.5,
  league: ['the {N} Confederacy', 'League of the {N} Nations'],
  leagueRuler: 'Council of Chiefs',
  tribal: [
    [['Village of {S}', '{S} Band'], 'Headman'], [['Chiefdom of {S}', '{S} Clan'], 'Chief'], [['the {N} Tribe', 'the {N} People'], 'Paramount Chief'],
    [['the {N} Nation'], 'Great Chief'], [['Empire of {N}'], 'Great Sun'],
  ],
  tribalCharges: ['feather', 'bird', 'sun', 'serpent', 'tree'],
  empireW: 0.3,
  leagueP: 0.85,
  succession: 'Chosen by the clan mothers',
  tribalSuccession: 'Chosen by the clan mothers from the ruling clan',
  tribalGov: 'A union of clans',
  femaleP: 0.3,
  court: ['Speaker', 'War Chief', 'Keeper of the Stores', 'Scout', 'Medicine Keeper'],
  army: 'woodland warriors and canoe parties',
  crafts: ['furs', 'wampum', 'maple sugar', 'birchbark canoes'],
  coin: 'strings of wampum',
  goods: { maize: true },
  shield: 'round',
  charges: ['feather', 'bird', 'sun', 'crescent', 'tree', 'serpent'],
  emblem: 'hide',
  faith: { native: 'spirits' },
};
