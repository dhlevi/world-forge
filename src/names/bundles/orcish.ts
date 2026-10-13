import { Biome } from '../../gen/biomes';
import { near, type TemplateBundle } from '../bundle';

/** Deep forests, which orcs are slow to spread through. */
const FOREST = new Set<Biome>([
  Biome.BorealForest, Biome.TemperateForest, Biome.TemperateRainforest, Biome.TropicalRainforest, Biome.TropicalDryForest, Biome.MontaneForest,
]);

/**
 * Orcs: hardy, proud warrior clans of the cold steppe, the badlands, the scrub and the mountain
 * foothills. Their speech is deep and guttural, their realms are warbands bound by clan oaths,
 * and their old gods are gods of war, storm and the hunt.
 */
export const ORCISH: TemplateBundle = {
  label: 'Orcish',
  folk: 'Orcs',
  world: 'old',
  rarity: 0.8,
  spread: (_height, biome) => (FOREST.has(biome) ? 1.6 : 1),
  culture: {
    id: 'orcish',
    likes: (c) => (c.dry ? 1.2 : 0.6) * near(c.temp, -4, 14, 8) * (c.forest ? 0.6 : 1.1),
    starts: [
      'Grak', 'Thuk', 'Ugr', 'Zog', 'Murg', 'Gash', 'Ghor', 'Brug', 'Durg', 'Rukh', 'Skar', 'Varg', 'Ogh', 'Zhar', 'Gruk', 'Nazh', 'Khor', 'Ruz', 'Ush', 'Dakh',
      'Morg', 'Tagh', 'Zul', 'Hrug', 'Kul', 'Bash', 'Goz', 'Yagh', 'Drak', 'Shak', 'Urz', 'Agh', 'Rog', 'Torg', 'Vrok', 'Zakh', 'Krul', 'Bur',
    ],
    mids: ['a', 'u', 'o', 'ag', 'uk', 'ar', 'ush', 'oz'],
    ends: [
      'gash', 'dur', 'mog', 'rakh', 'zul', 'grak', 'ush', 'tor', 'gul', 'nak', 'rog', 'bur', 'dakh', 'gor', 'rum', 'zag', 'ruk', 'tuk', 'mar', 'kar',
      'dush', 'oth', 'ugh', 'gaz',
    ],
    midChance: 0.3,
    roots: ['Blood', 'Bone', 'Iron', 'Skull', 'Red', 'Black', 'Ash', 'Fang', 'Scar', 'Tusk', 'Grim', 'Burnt', 'Broken', 'Spear', 'Wolf', 'Boar', 'Crag', 'Ember', 'Rust', 'Howl', 'Storm', 'Flint', 'Thorn', 'Slag'],
    suffixes: ['fang', 'crag', 'hold', 'pit', 'rock', 'scar', 'gorge', 'tooth', 'wall', 'spire', 'fort', 'camp', 'ridge', 'gulch', 'tusk', 'grave'],
    compoundChance: 0.35,
    terms: {
      plains: ['the {N} Steppe', 'the {A} Waste', 'the {N} Barrens'],
      hills: ['the {N} Crags', 'the {A} Badlands', '{N} Ridge'],
      mountains: ['the {N} Teeth', 'the {A} Fangs', 'the {N} Mountains'],
      peak: ['{N} Fang', 'Mount {N}', '{N} Tusk'],
      desert: ['the {N} Barrens', 'the {A} Waste'],
      river: ['the {N}', 'the {N}', '{N} Water', 'the {A} Torrent'],
      lake: ['{N} Pool', 'Lake {N}', 'the {A} Tarn'],
      forest: ['the {N} Thicket', 'the {A} Wood'],
      marsh: ['the {N} Mire', 'the {A} Bog'],
      sea: ['the {A} Sea', 'the {N} Sea'],
    },
    realm: ['the {N} Warhold', 'the Banner of {N}', 'the Clanhold of {N}', 'the Warbands of {N}', '{N} Warhold'],
  },
  lang: {
    id: 'orcish', after: 'invented orcish tongues (deep, guttural, clipped)',
    C: { k: 5, g: 6, q: 2, x: 3, ɣ: 2, ʁ: 2, r: 6, z: 4, ʃ: 4, ʒ: 1, d: 3, t: 2, b: 3, m: 2, n: 3, ŋ: 1, l: 1.5, h: 1, s: 1, dʒ: 1 },
    V: { u: 5, a: 5, o: 4, ʊ: 1.5, ɑ: 2, i: 1.5, e: 1 },
    syl: { CVC: 6, CVCC: 2, CV: 1.5, CCVC: 1.2, VC: 0.5 },
    onsets: ['g r', 'k r', 'b r', 'd r', 'g n', 'z g', 's k', 'ʃ k', 'g l'],
    codas: ['r k', 'r g', 'z g', 'g ʃ', 'k ʃ', 'r z', 'n g', 'r d', 'l g', 'x t', 'ʃ k'],
    finals: ['k', 'g', 'x', 'ɣ', 'q', 'r', 'z', 'ʃ', 'd', 't', 'b', 'm', 'n', 'l', 'ʁ'],
    compound: 'final', roots: [1, 2], stress: 'initial',
    spell: { x: 'kh', ɣ: 'gh', ʁ: 'rr', ʃ: 'sh', ʒ: 'zh', ɑ: 'a', ʊ: 'u', dʒ: 'j', ŋ: 'ng' },
    rules: [['^rr', 'r', 'initial uvular /ʁ/ is written r']],
    grammar: { order: 'SOV', adj: 'after', def: 'none', indef: 'none', plural: 'suffix', poss: 'suffix', gender: 0, agree: true, tense: 'particle', adposition: 'post' },
    forms: { plural: 'uk', poss: 'ash', past: 'gor', future: 'zag', neg: 'nakh' },
    masc: ['ak', 'ug', 'ash', 'ar', 'oz', 'rukh', 'dush'], fem: ['a', 'ha', 'ka', 'zha', 'ra'],
    demonym: ['ish', 'i', 'ak'],
    seeds: {
      war: 'grakh', blood: 'ruz', iron: 'dush', fortress: 'gorzag', mountain: 'krug', river: 'ugrum', king: 'zhakar', father: 'dakh', mother: 'mogha',
      god: 'ghor', sky: 'ush', fire: 'bakh', black: 'mogh', red: 'ruzg', great: 'ulg', stone: 'gor', wolf: 'vurg', boar: 'krukh', bone: 'zogh',
      sword: 'shakh', axe: 'drukh', clan: 'ugum', hill: 'tuz', field: 'bazg', water: 'ubu', city: 'durz', camp: 'gul', strong: 'groz',
    },
  },
  given: [
    [
      'Grashnak', 'Thrug', 'Urzog', 'Mograk', 'Durzag', 'Krull', 'Rukhar', 'Zagnor', 'Brugash', 'Varzug',
      'Takhra', 'Hrolg', 'Gnashk', 'Dazrak', 'Murzhul', 'Kurzan', 'Yagdush', 'Bargul', 'Drokh', 'Uzgar',
      'Gorzak', 'Ruzgo', 'Tharg', 'Zhukar', 'Molgur', 'Krathak', 'Ushnar', 'Grozdak', 'Bolzug', 'Narkhul',
      'Dagrun', 'Vorgash', 'Hakthur', 'Rognak', 'Zurdush', 'Gakhul', 'Ozgar', 'Trugmar', 'Skagh', 'Burzan',
      'Khordak', 'Mazrug',
    ],
    [
      'Ghasha', 'Urzha', 'Morgha', 'Durza', 'Shagra', 'Kazha', 'Vashka', 'Rugha', 'Zogra', 'Bazha',
      'Ozra', 'Thraka', 'Nazhra', 'Yagra', 'Ushka', 'Gorza', 'Mukha', 'Drazha', 'Harzha', 'Lagra',
      'Ruzha', 'Takha', 'Zhurka', 'Bulgra', 'Kurza', 'Murzha', 'Ogdra', 'Shazra', 'Vurga', 'Agrush',
      'Gashka', 'Uzdra', 'Khezra', 'Drogha', 'Zaghna',
    ],
  ],
  ethos: { bellicose: 4, communal: 2, stoic: 1 },
  traditions: { warriorCulture: 2, raiders: 1.5, clanTies: 1.5, pastoralists: 1, xenophobe: 1 },
  architecture: 'earth-and-timber stockades, hide tents and squat towers of black fieldstone',
  dress: 'boiled-leather armour, furs and tusk ornaments; warriors bear ritual scars',
  food: 'roast boar, blood sausage, millet porridge and soured milk',
  equalArms: 0.5,
  rulers: ['War-Captain', 'Chieftain', 'Warlord', 'Warchief', 'Overlord'],
  barony: ['Camp of {S}', 'Steading of {S}'],
  county: ['Chiefdom of {S}', 'Warband of {S}'],
  duchy: ['Warlordship of {N}', 'the {N} Clans'],
  empire: ['the Overlordship of {N}', 'the Great Warhost of {N}', 'the {N} Dominion'],
  cityRuler: 'Fort-Warden',
  empireW: 0.4,
  leagueP: 0.45,
  republicP: 0,
  house: 'the {R} clan',
  epithets: ['Bloodtusk', 'the Unbroken', 'Skullsplitter', 'Ironjaw', 'the Scarred', 'Wolfrider', 'Many-Scars', 'the Unyielding', 'Stonefist', 'the Howler'],
  court: ['Speaker of the Clans', 'War-Master', 'Keeper of the Spoils', 'Night-Runner', 'Bone-Seer'],
  succession: "The strongest of the chief's kin, proven by challenge before the clan moot",
  army: 'wolf- and boar-riders leading roaring warbands of axemen',
  femaleP: 0.25,
  minorFolk: ['Goblins', 'Half-orcs', 'Ogres'],
  crafts: ['black-iron axes', 'war-wolves', 'tanned hides', 'carved bone'],
  coin: 'iron teeth',
  shield: 'round',
  charges: ['axe', 'sword', 'horn', 'crescent', 'sun', 'hammer'],
  emblem: 'tamga',
  faith: { native: 'oldgods', open: 0.3 },
};
