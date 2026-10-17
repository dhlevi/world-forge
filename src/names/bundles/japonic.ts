import { grammar, near, type TemplateBundle } from '../bundle';

/**
 * Japonic: the island peoples of the east, after Japan. The family name comes first, their warriors ride, and their
 * clans honour the spirits of place.
 */
export const JAPONIC: TemplateBundle = {
  label: 'Japonic',
  folk: 'Humans',
  world: 'old',
  culture: {
    id: 'japonic',
    likes: (c) => near(c.temp, 6, 18, 6) * (c.coastal ? 1.5 : 0.45) * near(c.precip, 900, 2500, 500),
    starts: [
      'Aki', 'Kiri', 'Naga', 'Taka', 'Yama', 'Kawa', 'Shima', 'Hiro', 'Matsu', 'Kita', 'Minami', 'Asa', 'Ise', 'Oka', 'Fuji', 'Kuro', 'Shira', 'Tsu',
      'Mori', 'Sakura', 'Hana', 'Ume', 'Ao', 'Ishi', 'Kami', 'Mizu', 'Nishi', 'Higashi', 'Sawa', 'Tomo', 'Yoshi', 'Hoshi', 'Kaze', 'Iwa', 'Kiyo',
      'Sato', 'Toyo', 'Wata', 'Furu', 'Hida', 'Kane', 'Nara', 'Sugi', 'Take', 'Uta', 'Yuki', 'Haru', 'Natsu', 'Fuyu', 'Tama',
    ],
    mids: ['no', 'ga', 'ka', 'ta', 'mi', 'ri', 'ki'],
    ends: [
      'saki', 'moto', 'yama', 'gawa', 'shima', 'hara', 'zawa', 'oka', 'mura', 'kawa', 'ta', 'da', 'be', 'tsu', 'kura', 'no', 'ura', 'hama', 'sato',
      'mori', 'zaki', 'iwa', 'tani', 'numa', 'hashi', 'sawa', 'kubo', 'ike', 'mine', 'zuka',
    ],
    midChance: 0.25,
    terms: {
      river: ['the {N} River', 'the {N}-gawa'],
      lake: ['Lake {N}', '{N}-ko'],
      mountains: ['the {N} Mountains', 'the {N} Range', 'the {A} Peaks'],
      hills: ['the {N} Hills', 'the {A} Hills'],
      peak: ['Mount {N}', '{N}-san', '{N}-dake'],
      island: ['{N}-jima', '{N}-shima', '{N} Island'],
      bay: ['{N} Bay', '{N}-wan'],
      strait: ['{N} Strait', 'the {N} Narrows'],
      sea: ['the {N} Sea', 'the {A} Sea'],
    },
    realm: ['Shogunate of {N}', 'Kingdom of {N}', 'the {N} Shogunate'],
  },
  lang: {
    id: 'japonic', after: 'Japanese',
    C: { k: 6, g: 2, s: 5, z: 1.5, t: 5, d: 2, n: 5, h: 3, b: 1.5, p: 0.3, m: 4, j: 2, r: 4, w: 1.5 },
    V: { a: 6, i: 5, u: 4, e: 3, o: 5, 'oː': 0.8, 'uː': 0.4 },
    syl: { CV: 9, V: 1, CVN: 1.2 },
    onsets: [],
    codas: [],
    finals: ['n'],
    compound: 'final', roots: [2, 3], stress: 'none',
    spell: { 'oː': 'o', 'uː': 'u', j: 'y' },
    rules: [['si', 'shi', '/si/ is written shi'], ['ti', 'chi', '/ti/ is written chi'], ['tu', 'tsu', '/tu/ is written tsu'], ['hu', 'fu', '/hu/ is written fu'], ['zi', 'ji', '/zi/ is written ji'], ['di', 'ji', '/di/ is written ji'], ['du', 'zu', '/du/ is written zu'], ['w([iue])', '$1', '/w/ is lost before i, u and e'], ['y([ie])', '$1', '/j/ is lost before i and e'], ['n(?=[bmp])', 'm', '/n/ is written m before b, m and p']],
    grammar: grammar({ order: 'SOV', adj: 'before', def: 'none', indef: 'none', plural: 'none', poss: 'particle', tense: 'suffix', adposition: 'post', possPron: 'pronoun' }),
    forms: { poss: 'no', past: 'ta', neg: 'nai' },
    masc: ['o', 'ro', 'hiko', 'nobu', 'mune', 'masa'], fem: ['ko', 'mi', 'e', 'yo', 'na', 'ka'],
    demonym: ['ese', 'ian'],
    seeds: { mountain: 'yama', river: 'kawa', island: 'shima', 'rice field': 'ta', village: 'mura', castle: 'jo', capital: 'kyo', bridge: 'hashi', sea: 'umi', lake: 'ko', black: 'kuro', white: 'shiro', big: 'o', small: 'ko', pine: 'matsu', forest: 'mori', valley: 'tani', harbour: 'minato', cape: 'saki', slope: 'saka', moon: 'tsuki', sun: 'hi', wind: 'kaze', field: 'hara' },
  },
  given: [
    [
      'Harunobu', 'Kagetora', 'Masamune', 'Nobuhide', 'Takauji', 'Yoshitsune', 'Kiyomori', 'Ujimasa', 'Terumoto', 'Motonari',
      'Hidetada', 'Ietsuna', 'Katsuyori', 'Mitsuhide', 'Nagamasa', 'Sadamori', 'Tadakatsu', 'Yorimasa', 'Kanetsugu', 'Toshiie',
      'Nobunaga', 'Ieyasu', 'Hideyoshi', 'Shingen', 'Kenshin', 'Masayuki', 'Yukimura', 'Yoshitsugu', 'Ujiyasu', 'Muneshige',
      'Miyamoto', 'Sakon', 'Ranmaru', 'Naomasa', 'Yasumasa', 'Kagekatsu', 'Katsuie', 'Nagahide', 'Kazumasu', 'Mitsunari',
      'Ujisato', 'Hideaki', 'Kiyomasa', 'Masanori', 'Yoshitaka', 'Tadamasa', 'Tadatsugu', 'Mochitora', 'Norisada', 'Tameyoshi'
    ],
    [
      'Tomoe', 'Nene', 'Oichi', 'Kasuga', 'Masako', 'Hisako', 'Chiyo', 'Ginchiyo', 'Kiyohime', 'Murasaki',
      'Sakura', 'Akiko', 'Haru', 'Yodo', 'Teruko', 'Fusako', 'Sen', 'Komatsu', 'Nohime', 'Aya',
      'Naotora', 'Gotoku', 'Tachibana', 'Sena', 'Kasa', 'Yuki', 'Tshedo', 'Izumi', 'Katsuko', 'Sayo',
      'Tama', 'Matsu', 'Kaede', 'Kiku', 'Ume', 'Ina', 'Gou', 'Daimyo', 'Suwo', 'Ren'
    ],
  ],
  familyParts: [
    [
      'Taka', 'Masa', 'Naga', 'Hosa', 'Ota', 'Mina', 'Hata', 'Asa', 'Kuro', 'Shima', 'Mori', 'Kita', 'Ima', 'Oda', 'Toku', 'Uesu', 'Sana', 'Hoji',
      'Kiyo', 'Fuji',
    ],
    ['da', 'kawa', 'moto', 'mura', 'gawa', 'zu', 'yama', 'hara', 'sugi', 'no', 'ta', 'saki', 'hashi', 'mori', 'naga', 'jo'],
  ],
  familyFirst: true,
  numerals: false,
  house: (_root, _rnd, o) => {
    const f = o.family();
    return { name: `the ${f} clan`, short: f };
  },
  epithets: ['the Tiger of the Hills', 'the One-Eyed Dragon', 'the Demon', 'the Peacemaker', 'the Fox'],
  ethos: { courtly: 2, stoic: 2, bellicose: 2 },
  affinity: { seafarers: 0.8, warriorCulture: 0.7, masterCraftsmen: 0.8, xenophobe: 0.4 },
  architecture: 'wooden halls with deep eaves, castles on stone bases and shrine gates',
  dress: 'layered robes tied with sashes',
  food: 'rice, fish, pickles, miso and tea',
  rulers: ['Lord', 'Daimyo', 'Shugo', 'Shogun', 'Emperor'],
  barony: ['Fief of {S}', '{S} Fief'],
  county: ['{S} Domain', 'Domain of {S}'],
  duchy: ['Province of {N}', '{N} Province'],
  empire: ['Empire of {N}', 'the {N} Empire'],
  cityRuler: 'Machi-bugyo',
  republicRuler: 'Council Elder',
  cityStateP: 0.03,
  republicP: 0.01,
  indepDuchyP: 0.12,
  empireW: 0.8,
  leagueP: 0.15,
  seafaring: 0.5,
  succession: 'Hereditary in the clan; the heir is adopted if need be',
  femaleP: 0.05,
  court: ['Regent', 'Constable', 'Commissioner of Finance', 'Master of the Night', 'Abbot of the Great Temple'],
  army: 'mounted samurai and spear-armed foot',
  horseShare: 0.3,
  crafts: ['swords', 'lacquerware', 'woodblock prints', 'sake'],
  coin: 'ryo',
  goods: { riceAndTea: true },
  shield: 'round',
  charges: ['tomoe', 'blossom', 'fan', 'leaves', 'wave', 'feather', 'wheel', 'lozenge'],
  emblem: 'mon',
  faith: { native: 'kami', missionary: 'heaven', prophetic: 0.6, open: 0.6 },
};
