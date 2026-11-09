import { Biome } from '../../gen/biomes';
import { near, type TemplateBundle } from '../bundle';

/** Where lizardfolk spread easily. */
const WET = new Set<Biome>([Biome.Wetland, Biome.Mangrove, Biome.TropicalRainforest, Biome.Riparian]);

/**
 * Lizardfolk: reptilian peoples of hot swamps, mangroves, river deltas and jungle marshes. Having
 * no lips, they speak in hisses and clicks with hardly a p, b, m or f; their elders read the stars
 * from stepped pyramids, and the great serpent coils beneath their faith.
 */
export const LIZARDFOLK: TemplateBundle = {
  label: 'Saurian',
  folk: 'Lizardfolk',
  world: 'both',
  rarity: 0.7,
  spread: (height, biome, sea) => (sea ? 1 : WET.has(biome) ? 0.7 : height > 500 ? 6 : 2.5),
  culture: {
    id: 'lizardfolk',
    likes: (c) => near(c.temp, 22, 32) * (c.precip > 1500 ? 1.4 : 0.3) * (c.heightM < 500 ? 1.2 : 0.3) * (c.coastal ? 1.1 : 1),
    starts: [
      'Ss', 'Sa', 'Ssi', 'Sha', 'Ksa', 'Zi', 'Xe', 'Tsa', 'Ish', 'Ka', 'Sek', 'Tik', 'Zas', 'Xi', 'Ske', 'Kssa', 'Tza', 'Szi', 'Ixa', 'Asha',
      'Esk', 'Khe', 'Ssa', 'Tes', 'Zhe', 'Kix', 'Sax', 'Tchi', 'Yss', 'Qas', 'Thes', 'Sez', 'Zek', 'Isk',
    ],
    mids: ['a', 'i', 'ss', 'ik', 'ess', 'ka', 'zi', 'ix', 'sha'],
    ends: [
      'ath', 'ess', 'ix', 'iss', 'ka', 'sek', 'zar', 'shan', 'ket', 'tuk', 'ssa', 'ax', 'eth', 'uun', 'ish', 'kal', 'tess', 'zek', 'saa', 'xal',
      'ith', 'oss', 'tak', 'kesh',
    ],
    midChance: 0.5,
    roots: ['Sun', 'Jade', 'Scale', 'Fang', 'Mire', 'Reed', 'Coil', 'Egg', 'Moss', 'Ember', 'Obsidian', 'Venom', 'Fern', 'Shell', 'Tide', 'Glyph', 'Mud', 'Serpent', 'Green', 'Star'],
    suffixes: ['pool', 'mire', 'mound', 'coil', 'nest', 'fen', 'steps', 'spire', 'shallows', 'hatch', 'basin', 'pyramid'],
    compoundChance: 0.2,
    terms: {
      marsh: ['the {N} Swamp', 'the {A} Mire', 'the Fens of {N}', '{N} Bayou'],
      river: ['the {N}', 'the {N}', '{N} Water', 'River {N}'],
      forest: ['the {N} Jungle', 'the {A} Tangle', 'the {N} Mangroves'],
      lake: ['{N} Pool', 'Lake {N}', 'the {A} Lagoon'],
      bay: ['{N} Bay', 'the {A} Lagoon'],
      island: ['{N}', '{N}', '{N} Isle'],
      isles: ['the {N} Keys', 'the {N} Isles'],
      sea: ['the {A} Sea', 'the Sea of {N}'],
      hills: ['the {N} Mounds', 'the {A} Hills'],
      peak: ['{N} Spire', 'Mount {N}'],
    },
    realm: ['the {N} Brood', 'Sun-Throne of {N}', 'the {N} Nesting', 'Realm of {N}', 'the Coil of {N}'],
  },
  lang: {
    id: 'lizardfolk', after: 'invented saurian tongues (hissing, sibilant, lipless)',
    C: {
      s: 7, ʃ: 4, z: 4, k: 5, t: 5, x: 3, ts: 2, tʃ: 1, ʒ: 1, θ: 2, h: 2, n: 3, ŋ: 1, r: 2, l: 2, j: 2, g: 1, d: 1.5, q: 1,
      p: 0.2, b: 0.2, m: 0.3, f: 0.1, v: 0.1, w: 0.5,
    },
    V: { a: 4, i: 4, e: 2, o: 2, u: 2, 'aː': 2, 'iː': 2, 'eː': 1, 'oː': 1, 'uː': 1 },
    syl: { CV: 4, CVC: 5, CCV: 1, VC: 1, V: 0.5 },
    onsets: ['s k', 's t', 'ʃ k', 's x', 'k s', 'θ s'],
    codas: ['s k', 's t', 'k s', 'ʃ k', 'x s'],
    finals: ['s', 'ʃ', 'k', 'x', 't', 'z', 'n', 'θ', 'ts'],
    compound: 'final', roots: [2, 3], stress: 'penultimate',
    spell: { ʃ: 'sh', x: 'x', ts: 'tz', tʃ: 'ch', ʒ: 'zh', θ: 'th', j: 'y', ŋ: 'ng', 'aː': 'aa', 'iː': 'ii', 'eː': 'ee', 'oː': 'oo', 'uː': 'uu' },
    rules: [['^s(?=[aeiou])', 'ss', 'initial /s/ before a vowel is written ss'], ['s$', 'ss', 'final /s/ is written ss']],
    grammar: { order: 'OSV', adj: 'after', def: 'suffix', indef: 'none', plural: 'reduplication', poss: 'construct', gender: 2, genderKind: 'animacy', agree: true, tense: 'prefix', adposition: 'post' },
    forms: { def: 'ss', past: 'ka', neg: 'sha' },
    masc: ['ak', 'ith', 'ex', 'ar', 'ass', 'ik'], fem: ['a', 'issa', 'iya', 'ith', 'aa'],
    demonym: ['i', 'ian', 'ish', 'ese'],
    seeds: {
      water: 'saa', river: 'sseth', marsh: 'kesh', sun: 'ixa', moon: 'siri', star: 'tiss', serpent: 'zassa', king: 'shaak', mother: 'issa', father: 'tsek',
      god: 'ssaath', blood: 'xith', stone: 'tak', jade: 'zekka', city: 'kaasith', home: 'nesh', great: 'saak', red: 'kix', black: 'ssek', white: 'iiza',
      sea: 'shaal', fire: 'ixat', war: 'kazat', tree: 'tsiik', death: 'sethka', egg: 'akkiss', temple: 'tezhaal',
    },
  },
  given: [
    [
      'Ssekath', 'Ixtaal', 'Zassik', 'Keshtar', 'Tsarrik', 'Shaakix', 'Sizzek', 'Kaasith', 'Ezzar', 'Thessak',
      'Xetuk', 'Issaak', 'Saakhet', 'Zhekiss', 'Tikaas', 'Sessith', 'Kezzat', 'Ssarath', 'Axitak', 'Yessik',
      'Tazzek', 'Skaarith', 'Xissak', 'Haskaar', 'Sithek', 'Ziikath', 'Ksathan', 'Esskar', 'Thakiss', 'Saruk',
      'Kiaxess', 'Tessekh', 'Zhaasar', 'Ixxar', 'Shessik', 'Kaazath', 'Iskhet', 'Sazzat', 'Tiaxen',
    ],
    [
      'Ssaria', 'Ixalla', 'Zessa', 'Shiissa', 'Kaasha', 'Tessiri', 'Aashira', 'Sissaya', 'Xiala', 'Esseth',
      'Zhaari', 'Ikessa', 'Saalith', 'Tsiraa', 'Kessiya', 'Yssaya', 'Ssethi', 'Naashi', 'Xessiri', 'Iskaa',
      'Sheeza', 'Tikessa', 'Zaasha', 'Aksiya', 'Hessaa', 'Thiessa', 'Siixa', 'Kaziri', 'Esska', 'Ixaari',
      'Zessith', 'Saiya', 'Shasska', 'Isthaa', 'Kiaressa',
    ],
  ],
  ethos: { spiritual: 3, stoic: 3, bureaucratic: 0.5 },
  traditions: { jungleDwellers: 2, riverFolk: 1.5, stargazers: 1.5, xenophobe: 1 },
  architecture: 'stepped pyramids of mud-brick and stone rising from the swamp, and reed houses on stilts',
  dress: 'little but jade, painted scales, feathered crests and woven reed mantles',
  food: 'raw fish, eels, turtle eggs, frogs and fermented swamp fruit',
  equalArms: 0.6,
  rulers: ['Nest-Elder', 'Clutch-Warden', 'Sun-Speaker', 'Scale-King', 'Coil-Sovereign'],
  barony: ['Nest of {S}', 'Clutch of {S}'],
  county: ['Wardship of {S}', 'the {S} Mounds'],
  duchy: ['Sun-Seat of {N}', 'the {N} Coil'],
  empire: ['the {N} Ascendancy', 'the Great Coil of {N}', 'the Sun-Throne of {N}'],
  cityRuler: 'Glyph-Warden',
  empireW: 1,
  leagueP: 0.3,
  republicP: 0.02,
  house: 'the {R} brood',
  epithets: ['the Patient', 'Many-Moults', 'Jade-Eye', 'the Unblinking', 'Old-Scale', 'Sun-Basker', 'the Coiled', 'Swiftjaw', 'Egg-of-Stars', 'the Cold-Eyed'],
  court: ['Glyph-Keeper', 'Fang-Marshal', 'Keeper of the Clutches', 'Silent Tongue', 'Serpent-Priest'],
  succession: 'The eldest of the senior clutch, once the priests have read the omens',
  army: 'spear-armed scale warriors, blowpipe skirmishers and riders on great swamp-beasts',
  femaleP: 0.4,
  minorFolk: ['Kobolds', 'Frogfolk'],
  crafts: ['obsidian blades', 'dragon-turtle shell', 'swamp herbs', 'glyph-carved jade'],
  coin: 'jade scales',
  shield: 'round',
  charges: ['serpent', 'sun', 'lozenge', 'roundel', 'crescent', 'mullet'],
  emblem: 'glyph',
  faith: { native: 'serpent', open: 0.3 },
};
