import { grammar, near, type TemplateBundle } from '../bundle';

/**
 * Highland: the peoples of the high mountain valleys of the New World, after the Inca. They build terraces and roads
 * with rope bridges, keep accounts in knotted cords, and worship the sun.
 */
export const HIGHLAND: TemplateBundle = {
  label: 'Highland',
  folk: 'Humans',
  world: 'new',
  peoples: 'highland peoples',
  culture: {
    id: 'highland',
    likes: (c) => (c.heightM > 1800 ? 1.45 : c.heightM > 900 ? 0.7 : 0.2) * near(c.temp, -2, 20, 8),
    starts: [
      'Pacha', 'Inti', 'Quil', 'Huay', 'Tiwa', 'Cuz', 'Ayac', 'Kall', 'Mayu', 'Sach', 'Tupa', 'Wari', 'Chak', 'Puma', 'Kusi', 'Yaku', 'Hatun', 'Rumi',
      'Tampu', 'Qori', 'Wayra', 'Illa', 'Saqsa', 'Chaw', 'Muyu', 'Sumaq', 'Paru', 'Ankas', 'Llam', 'Ccoll',
    ],
    mids: ['ya', 'hua', 'ra', 'ri', 'ta'],
    ends: [
      'marca', 'pampa', 'bamba', 'cocha', 'huasi', 'pata', 'llacta', 'cancha', 'tambo', 'qasa', 'huay', 'rumi', 'yoc', 'mayo', 'coto', 'punku',
      'ccasa', 'urqu', 'chaca',
    ],
    midChance: 0.25,
    terms: {
      mountains: ['the {N} Cordillera', 'the {N} Range', 'the {A} Cordillera'],
      peak: ['{N} Peak', 'Mount {N}'],
      lake: ['Lake {N}', '{N}cocha'],
      plains: ['the {N} Altiplano', 'the {N} Puna'],
      river: ['the {N}', 'River {N}'],
    },
    realm: ['Kingdom of {N}', 'the {N} Realm'],
  },
  lang: {
    id: 'highland', after: 'Quechua and Aymara',
    C: { p: 3, t: 4, k: 5, q: 3, tʃ: 3, s: 4, ʃ: 1, h: 2, m: 4, n: 4, ɲ: 1, l: 2, ʎ: 1.5, r: 3, w: 3, j: 3 },
    V: { a: 7, i: 4, u: 5 },
    syl: { CV: 6, CVC: 4, V: 0.6 },
    onsets: [],
    codas: [],
    finals: ['n', 'j', 's', 'q', 'k', 'r'],
    compound: 'final', roots: [2, 3], stress: 'penultimate',
    spell: { ɲ: 'ñ', ʎ: 'll', tʃ: 'ch', ʃ: 'sh', j: 'y', w: 'hu' },
    rules: [['^hu(?=[aeiou])', 'w', 'initial /w/ before a vowel is written w']],
    grammar: grammar({ order: 'SOV', adj: 'before', def: 'none', indef: 'none', plural: 'suffix', poss: 'suffix', tense: 'suffix', adposition: 'post', agree: true }),
    forms: { plural: 'kuna', poss: 'pa', past: 'rqa' },
    masc: ['c', 'pa', 'ac', 'ui', 'ru'], fem: ['a', 'lla', 'ya', 'sa', 'cha'],
    demonym: ['an', 'ian', 'ine'],
    seeds: {},
  },
  given: [
    [
      'Huaman', 'Inti', 'Pachac', 'Tupac', 'Yupanqui', 'Atoc', 'Cusi', 'Mayta', 'Sinchi', 'Capac',
      'Amaru', 'Huascar', 'Rumi', 'Wiraq', 'Achachi', 'Paullu', 'Sayri', 'Titu', 'Urco', 'Waman',
      'Pachacuti', 'Viracocha', 'Lloque', 'Manco', 'Apu', 'Chalcuchima', 'Quizquiz', 'Rumiñahui', 'Vilca', 'Huayna',
      'Auqui', 'Tito', 'Illapa', 'Mallku', 'Kuntur', 'Anka', 'Catari', 'Puma', 'Uturuncu', 'Yawar'
    ],
    [
      'Ocllo', 'Quilla', 'Chaska', 'Coya', 'Sisa', 'Mama', 'Rawa', 'Killa', 'Tika', 'Yupay',
      'Cusi', 'Ima', 'Pacha', 'Sumaq', 'Waylla', 'Kantu', 'Nina', 'Uchu', 'Chimpu', 'Rawa',
      'Micay', 'Anahuarque', 'Chungui', 'Curi', 'Pillku', 'Kori', 'Urpi', 'Tamya', 'Sonqo', 'Aklla',
      'Iskra', 'Tiyana', 'Kushi', 'Illari', 'Allpa', 'Asiriy', 'Kukuli', 'Hawka', 'Mallki', 'Nizam'
    ],
  ],
  house: 'the {R} lineage',
  epithets: ['Earth-Shaker', 'the Reformer', 'Son of the Sun'],
  ethos: { bureaucratic: 3, spiritual: 2 },
  affinity: { mountaineers: 1.5, stargazers: 0.8 },
  architecture: 'fitted stone walls without mortar, terraces and roads with rope bridges',
  dress: 'woven tunics and alpaca cloaks in bright stripes',
  food: 'potatoes, maize, quinoa and llama meat',
  polygamy: true,
  league: ['the {N} Confederation'],
  leagueRuler: 'Council of Lords',
  tribal: [
    [['Village of {S}', 'Valley of {S}'], 'Headman'],
    [['Lordship of {S}', 'Chiefdom of {S}'], 'Lord'],
    [['the {N} Realm', 'Kingdom of {N}'], 'High Lord'],
    [['Kingdom of {N}', 'the {N} Realm'], 'Sun King'],
    [['Empire of the {N} Sun', 'the Four Quarters of {N}'], 'Child of the Sun'],
  ],
  tribalCharges: ['sun', 'bird', 'estoile', 'serpent'],
  empireW: 3,
  leagueP: 0.2,
  succession: 'The ablest son of the ruler\'s principal wife',
  femaleP: 0.06,
  court: ['Council Elder', 'Apu of the Armies', 'Keeper of the Quipu', 'Runner Chief', 'High Priest'],
  army: 'slingers, clubmen and road garrisons',
  crafts: ['alpaca wool', 'silverwork', 'woven tapestries', 'freeze-dried potatoes'],
  coin: 'bales of cloth',
  goods: { maize: true },
  shield: 'french',
  charges: ['sun', 'estoile', 'bird', 'lozenge', 'serpent'],
  emblem: 'chakana',
  faith: { native: 'sun' },
};
