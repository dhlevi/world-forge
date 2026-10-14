import { grammar, near, type TemplateBundle } from '../bundle';

/**
 * Sinic: the peoples of the great river plains of the east, after the Chinese. The family name comes first, the realm
 * runs on scholars and examinations, and its fields grow rice, tea and silk.
 */
export const SINIC: TemplateBundle = {
  label: 'Sinic',
  folk: 'Humans',
  world: 'old',
  culture: {
    id: 'sinic',
    likes: (c) => near(c.temp, 8, 22, 6) * near(c.precip, 600, 2000, 400) * (c.heightM < 1500 ? 1.05 : 0.6),
    starts: [
      'Bei', 'Nan', 'Xi', 'Dong', 'Jin', 'Lin', 'Chang', 'Lu', 'Hua', 'Yun', 'Qing', 'Shan', 'He', 'Tai', 'Ping', 'An', 'Fu', 'Guang', 'Su', 'Yang',
      'Han', 'Wu', 'Zhao', 'Song', 'Ming', 'Bai', 'Huang', 'Long', 'Feng', 'Jiang', 'Ning', 'Kai', 'Lan', 'Mei', 'Shou', 'Tian', 'Wen', 'Xing', 'Yu',
      'Zhen', 'Qi', 'Liang', 'Chen', 'Hong', 'Jing', 'Le', 'Pu', 'Rui', 'Shi', 'Tong', 'Gao', 'Hai', 'Kun', 'Luo', 'Mao', 'Qiu', 'Sui', 'Wei', 'Xu',
      'Zhu',
    ],
    mids: ['shan', 'he', 'an', 'jia', 'ling', 'ping', 'yang'],
    ends: [
      'zhou', 'jing', 'yang', 'an', 'ling', 'cheng', 'du', 'ning', 'shan', 'men', 'kou', 'ping', 'chuan', 'hai', 'tai', 'yuan', 'he', 'xi', 'ting',
      'guan', 'lin', 'qiao', 'fu', 'bao', 'dian', 'hu', 'tan', 'wan', 'zhen', 'sha', 'tang', 'yi', 'gang', 'pu', 'quan', 'shui', 'feng', 'tun',
      'kang', 'chi',
    ],
    midChance: 0.15,
    terms: {
      river: ['the {N} He', 'the {N} Jiang', '{N} River'],
      lake: ['{N} Hu', 'Lake {N}'],
      mountains: ['the {N} Shan', 'the {N} Mountains', 'the {A} Range'],
      hills: ['the {N} Hills', 'the {A} Hills'],
      peak: ['Mount {N}', '{N} Feng', '{N} Shan'],
      island: ['{N} Dao', '{N} Island'],
      plains: ['the {N} Plain', 'the {N} Yuan'],
      desert: ['the {N} Desert', 'the {A} Waste'],
      sea: ['the {N} Sea', 'the {A} Sea'],
    },
    realm: ['Kingdom of {N}', 'the {N} State', 'the {N} Kingdom', 'Kingdom of {N}'],
  },
  lang: {
    id: 'sinic', after: 'Mandarin and older Chinese',
    C: { p: 2, pʰ: 1.5, t: 3, tʰ: 2, k: 3, kʰ: 2, m: 3, n: 3, f: 2, s: 2, ʂ: 3, ʐ: 1, x: 3, ts: 1.5, tsʰ: 1, tɕ: 3, tɕʰ: 2, ɕ: 3, l: 3, j: 2, w: 2 },
    V: { a: 5, e: 2, i: 4, o: 2, u: 4, y: 1, ə: 2 },
    syl: { CV: 4, CVN: 4, CGV: 1.5, CGVN: 1, V: 0.3 },
    onsets: [],
    codas: [],
    finals: ['n', 'ŋ'],
    compound: 'final', roots: [1, 1], stress: 'none', tones: 4,
    spell: { pʰ: 'p', p: 'b', tʰ: 't', t: 'd', kʰ: 'k', k: 'g', ʂ: 'sh', ʐ: 'r', x: 'h', ts: 'z', tsʰ: 'c', tɕ: 'j', tɕʰ: 'q', ɕ: 'x', ŋ: 'ng', y: 'ü', ə: 'e', j: 'y', w: 'w' },
    rules: [['([jqx])ü', '$1u', 'ü is written u after j, q and x']],
    grammar: grammar({ order: 'SVO', adj: 'before', def: 'none', indef: 'none', plural: 'none', poss: 'particle', tense: 'particle' }),
    forms: { poss: 'de', past: 'le', neg: 'bu' },
    masc: [], fem: [],
    demonym: ['ese', 'ian'],
    seeds: { mountain: 'shan', river: 'jiang', lake: 'hu', city: 'cheng', capital: 'jing', gate: 'men', north: 'bei', south: 'nan', east: 'dong', west: 'xi', peace: 'an', great: 'da', white: 'bai', red: 'hong', gold: 'jin', dragon: 'long', jade: 'yu', bridge: 'qiao', island: 'dao', sea: 'hai', harbour: 'gang', ridge: 'ling', valley: 'gu', field: 'tian', spring: 'quan' },
  },
  given: [
    [
      'Wen', 'Jian', 'Zhen', 'Hong', 'Rui', 'Xuan', 'Yong', 'Tai', 'Shen', 'Long',
      'Ming', 'Kang', 'Heng', 'Jun', 'Qian', 'Zhao', 'Wei', 'Cheng', 'Shao', 'Yuan',
      'Feng', 'Huai', 'Bo', 'Chao', 'Guang', 'Hao', 'Jing', 'Lei', 'Peng', 'Song',
      'Tao', 'Xiang', 'Yang', 'Yi', 'Zhi', 'Zhong', 'Bao', 'De', 'Dong', 'Guo',
      'Han', 'Lian', 'Liang', 'Sheng', 'Shu', 'Tian', 'Xian', 'Zhe', 'Zhi', 'Zhuo'
    ],
    [
      'Lian', 'Mei', 'Hua', 'Yu', 'Xiu', 'Lan', 'Zhu', 'Jing', 'Ying', 'Qiao',
      'Rong', 'Shu', 'Xia', 'Yan', 'Ling', 'Fen', 'Hui', 'Zhen', 'An', 'Bao',
      'Chun', 'Fang', 'Gui', 'Hong', 'Jia', 'Ju', 'Liling', 'Min', 'Ning', 'Ping',
      'Qing', 'Ru', 'Shuang', 'Ting', 'Xiang', 'Xue', 'Ya', 'Yue', 'Yun', 'Zhi',
      'Zhen', 'Fei', 'Jiao', 'Lu', 'Niu', 'Pei', 'Shan', 'Ting', 'Wan', 'Xian'
    ],
  ],
  familyNames: [
    'Li', 'Zhao', 'Wang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhou', 'Wu', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Guo', 'He', 'Lin', 'Gao', 'Luo', 'Song',
    'Han', 'Tang', 'Feng', 'Cao', 'Xiao', 'Deng',
  ],
  familyFirst: true,
  numerals: false,
  house: (_root, _rnd, o) => {
    const f = o.family();
    return { name: `the ${f} clan`, short: f };
  },
  epithets: ['the Martial', 'the Civil', 'the Radiant', 'the Benevolent', 'the Resplendent', 'the Founder'],
  ethos: { bureaucratic: 4, inventive: 2 },
  affinity: { cityBuilders: 1.6, legalists: 0.8, monastic: 0.4, masterCraftsmen: 0.8, stargazers: 0.8 },
  architecture: 'tiled roofs with upturned eaves, walled compounds and pagodas',
  dress: 'long silk robes with wide sleeves',
  food: 'rice, noodles, pork, greens and tea',
  polygamy: true,
  rulers: ['Magistrate', 'Prefect', 'Governor', 'King', 'Emperor'],
  barony: ['County of {S}', 'Xian of {S}'],
  county: ['Prefecture of {S}', '{S} Prefecture'],
  duchy: ['Province of {N}', '{N} Province'],
  empire: ['the {N} Empire', 'the {N} Dynasty', 'Middle Kingdom of {N}'],
  cityRuler: 'Magistrate',
  republicRuler: 'Chancellor',
  cityStateP: 0.02,
  republicP: 0.01,
  indepDuchyP: 0.03,
  empireW: 3,
  leagueP: 0.1,
  seafaring: 0.5,
  succession: 'The eldest son inherits, under the Mandate of Heaven',
  femaleP: 0.04,
  court: ['Chancellor', 'Grand Marshal', 'Minister of Revenue', 'Eunuch of the Eastern Depot', 'Grand Astrologer'],
  army: 'crossbowmen and drilled infantry with banners',
  crafts: ['porcelain', 'silk', 'lacquerware', 'paper'],
  coin: 'taels',
  goods: { riceAndTea: true, silk: true },
  shield: 'round',
  charges: ['coin', 'lotus', 'taiji', 'cloud', 'serpent', 'sun'],
  emblem: 'seal',
  faith: { native: 'heaven', missionary: 'heaven', prophetic: 1.6 },
};
