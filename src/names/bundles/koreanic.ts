import { grammar, near, type TemplateBundle } from '../bundle';

/**
 * Koreanic: the peoples of a mountainous eastern peninsula, after Korea. The family name comes first, their kings rule
 * through councillors and inspectors, and their potters make celadon ware.
 */
export const KOREANIC: TemplateBundle = {
  label: 'Koreanic',
  folk: 'Humans',
  world: 'old',
  culture: {
    id: 'koreanic',
    likes: (c) => near(c.temp, 2, 14, 6) * (c.coastal ? 1.25 : 0.8) * near(c.precip, 600, 1600, 400),
    starts: [
      'Han', 'Gyeong', 'Jeon', 'Cheong', 'Gwang', 'Dae', 'Sang', 'Mun', 'Yeong', 'Pyeong', 'Ham', 'Chung', 'Gang', 'Seo', 'Nam', 'Bu', 'Hwa', 'Il',
      'Jin', 'Su', 'An', 'Bo', 'Dong', 'Geum', 'Hae', 'Hong', 'Jang', 'Mok', 'Ok', 'Sin', 'Tae', 'Ui', 'Wol', 'Yang', 'Chil', 'Gok', 'Nae', 'Sa',
      'Song', 'Myeong',
    ],
    mids: ['an', 'eun', 'o', 'yeo', 'ha'],
    ends: [
      'ju', 'san', 'won', 'do', 'seong', 'yang', 'cheon', 'pyeong', 'gang', 'hae', 'nam', 'gok', 'dong', 'ri', 'ryeong', 'po', 'jin', 'am', 'bong',
      'gu', 'mun', 'dang', 'chon', 'hwa', 'ul', 'sil', 'gye', 'ak',
    ],
    midChance: 0.15,
    terms: {
      river: ['the {N} River', 'the {N}-gang'],
      lake: ['Lake {N}', '{N} Lake'],
      mountains: ['the {N} Mountains', 'the {N}-san Range', 'the {A} Ridges'],
      peak: ['Mount {N}', '{N}-san', '{N}-bong'],
      island: ['{N}-do', '{N} Island'],
      bay: ['{N} Bay', '{N}-man'],
    },
    realm: ['Kingdom of {N}', 'the {N} Kingdom'],
  },
  lang: {
    id: 'koreanic', after: 'Korean',
    C: { k: 5, g: 1, n: 5, t: 3, d: 2, r: 2, l: 2, m: 4, p: 2, b: 2, s: 5, j: 2, tʃ: 3, tʃʰ: 1.5, h: 3, w: 1, ŋ: 2 },
    V: { a: 5, ʌ: 3, o: 4, u: 4, ɯ: 2, i: 4, e: 2, æ: 2 },
    syl: { CV: 5, CVC: 4, CGV: 1, V: 0.8 },
    onsets: [],
    codas: [],
    finals: ['k', 'n', 'l', 'm', 'p', 'ŋ'],
    compound: 'final', roots: [1, 2], stress: 'none',
    spell: { ʌ: 'eo', ɯ: 'eu', æ: 'ae', ŋ: 'ng', tʃ: 'j', tʃʰ: 'ch', j: 'y' },
    grammar: grammar({ order: 'SOV', adj: 'before', def: 'none', indef: 'none', plural: 'suffix', poss: 'particle', tense: 'suffix', adposition: 'post', possPron: 'pronoun' }),
    forms: { poss: 'ui', plural: 'deul', past: 'eot', neg: 'an' },
    masc: [], fem: [],
    demonym: ['ian', 'ese'],
    seeds: { mountain: 'san', river: 'gang', island: 'do', sea: 'hae', lake: 'ho', city: 'seong', village: 'ri', peak: 'bong', temple: 'sa', bridge: 'gyo', valley: 'gok', gate: 'mun', north: 'buk', south: 'nam', east: 'dong', west: 'seo', great: 'dae', blue: 'cheong', white: 'baek', gold: 'geum', dragon: 'yong', peace: 'an' },
  },
  given: [
    [
      'Seon', 'Jun', 'Hwan', 'Taejo', 'Wang', 'Myeong', 'Gyeong', 'Hyeon', 'Seok', 'Yong',
      'Jeong', 'Cheol', 'Ho', 'Min', 'Sung', 'Jin', 'Hyeok', 'Taek', 'Kwang', 'Il',
      'Gwanggaeto', 'Sejong', 'Eulji', 'Gim', 'Yi', 'Chae', 'Gang', 'Ryu', 'Jang', 'Song',
      'Yun', 'Choe', 'Suh', 'Bae', 'Goo', 'Gyu', 'Beom', 'Sang', 'Won', 'Woo',
      'Dae', 'Dong', 'Do', 'Chan', 'Geon', 'Ha', 'Hyun', 'Jae', 'Seung', 'Kyung'
    ],
    [
      'Seonhwa', 'Myeongseong', 'Deokman', 'Jindeok', 'Hyeon', 'Sunjeong', 'Yeong', 'Mi', 'Jiwon', 'Haeun',
      'Soyeon', 'Eunbi', 'Hwaseon', 'Nari', 'Sora', 'Yuna', 'Bora', 'Ara', 'Inhyeon', 'Janghui',
      'Sindo', 'Wongyeong', 'Insu', 'Ansun', 'Jeonghyun', 'Munjeong', 'Insun', 'Inwon', 'Jeongsun', 'Sunwon',
      'Inryeong', 'Hyegyeong', 'Danui', 'Seonui', 'Myeongui', 'Geum', 'Chae', 'Aeri', 'Eun', 'Min'
    ],
  ],
  familyNames: [
    'Kim', 'Yi', 'Pak', 'Choe', 'Jeong', 'Kang', 'Jo', 'Yun', 'Jang', 'Im', 'Han', 'Shin', 'Seo', 'Gwon', 'Hwang', 'Ahn', 'Song', 'Yu', 'Hong',
    'Jeon',
  ],
  familyFirst: true,
  numerals: false,
  house: (root, _rnd, o) => {
    const f = o.family();
    return { name: `the ${f} clan of ${o.seatName || root}`, short: f };
  },
  epithets: ['the Great', 'the Wise', 'the Builder', 'the Founder', 'the Righteous'],
  ethos: { bureaucratic: 3, inventive: 2, stoic: 1 },
  affinity: { legalists: 0.8, monastic: 0.4, xenophobe: 0.4 },
  architecture: 'tiled hanok houses with heated floors and mountain fortresses',
  dress: 'flowing robes and tall horsehair hats',
  food: 'rice, pickled cabbage, fish and barley tea',
  rulers: ['Magistrate', 'Gunsu', 'Governor', 'King', 'Emperor'],
  barony: ['Hyeon of {S}', 'County of {S}'],
  county: ['Gun of {S}', 'Prefecture of {S}'],
  duchy: ['Province of {N}', '{N}-do'],
  empire: ['Great {N} Empire', 'the {N} Empire'],
  cityRuler: 'Magistrate',
  republicRuler: 'Chancellor',
  cityStateP: 0.02,
  republicP: 0.01,
  indepDuchyP: 0.04,
  empireW: 0.6,
  seafaring: 0.3,
  femaleP: 0.07,
  court: ['Chief State Councillor', 'Commander of the Army', 'Minister of Taxation', 'Royal Inspector', 'Royal Shaman'],
  army: 'archers and fortress garrisons',
  crafts: ['celadon ware', 'ginseng', 'mulberry paper', 'printed books'],
  coin: 'mun',
  goods: { riceAndTea: true, silk: true },
  shield: 'round',
  charges: ['taiji', 'blossom', 'lotus', 'bird', 'mullet', 'cloud'],
  emblem: 'banner',
  faith: { native: 'heaven', missionary: 'heaven', prophetic: 0.7 },
};
