import { grammar, near, type TemplateBundle } from '../bundle';

/**
 * Southron: the peoples of warm, sunny coasts and islands, after the Greeks and Byzantines. Their free cities and
 * leagues trade by sea, and their towns are built on planned lines.
 */
export const SOUTHERN: TemplateBundle = {
  label: 'Southron',
  folk: 'Humans',
  world: 'old',
  stock: 'classic',
  culture: {
    id: 'southern',
    likes: (c) => near(c.temp, 14, 24) * (c.coastal ? 1.3 : 0.7) * near(c.precip, 250, 900, 300),
    starts: [
      'Kal', 'Ther', 'Ny', 'Ste', 'Phi', 'Mar', 'Dra', 'Ly', 'Ko', 'Ari', 'Hel', 'Ere', 'Mes', 'Pyr', 'Zan', 'Alo', 'Tes', 'Ira', 'Aeg', 'Arg', 'Cor',
      'Del', 'Eph', 'Gor', 'Kor', 'Lem', 'Mil', 'Nax', 'Ol', 'Par', 'Rho', 'Sam', 'Syb', 'Tha', 'Xan', 'Zak', 'Ath', 'Byz', 'Chal', 'Dod', 'Hal',
      'Kyth', 'Myk', 'Pat', 'Sest', 'Tri', 'Epi', 'Lark', 'Arc', 'Boe', 'Cal', 'Dori', 'Eleu', 'Herm', 'Ith', 'Kast', 'Meg', 'Nau', 'Olyn', 'Phok',
      'Salam', 'Ver', 'Zac', 'Amph', 'Bera', 'Chios', 'Epid', 'Kery', 'Laris', 'Mess', 'Pyl',
    ],
    mids: ['a', 'o', 'e', 'an', 'ys', 'ri', 'ar', 'ip', 'ot', 'el', 'ith', 'os', 'is', 'at', 'op', 'ic'],
    ends: [
      'opolis', 'os', 'a', 'ene', 'ion', 'aia', 'eia', 'ikos', 'ora', 'is', 'ane', 'ossa', 'ea', 'yra', 'ia', 'inthos', 'ae', 'eion', 'oupolis',
      'ymna', 'assos', 'eus', 'akis', 'ike', 'oni', 'ari', 'issa', 'ios', 'ira', 'odos', 'ena', 'ates', 'polis', 'anta', 'oria', 'ica', 'inda',
      'este', 'itis', 'onium', 'ethe', 'usa', 'ida', 'ope', 'ium', 'ete', 'ana', 'ina',
    ],
    midChance: 0.5,
    terms: {
      river: ['the {N}', 'River {N}'],
      gulf: ['Gulf of {N}', 'the {N} Gulf'],
      sea: ['the {N} Sea', 'Sea of {N}', 'the {A} Sea'],
      island: ['{N}', '{N}', 'Isle of {N}'],
    },
    realm: ['League of {N}', 'Dominion of {N}', 'Despotate of {N}', 'Republic of {N}'],
  },
  lang: {
    id: 'southern', after: 'Ancient and Byzantine Greek',
    C: { p: 4, b: 1, t: 5, d: 3, k: 5, g: 2, m: 4, n: 5, f: 2, θ: 2, x: 2, s: 6, z: 1, r: 5, l: 5 },
    V: { a: 5, e: 4, i: 4, o: 5, u: 1, y: 1.5, 'eː': 0.8, 'oː': 0.8 },
    syl: { CV: 6, CVC: 3, CCV: 1.5, V: 1 },
    onsets: ['p l', 'p r', 't r', 'k r', 'k l', 'g l', 'g r', 'p s', 'k t', 's t', 's p', 'θ r', 'x r'],
    codas: [],
    finals: ['s', 'n', 'r'],
    compound: 'final', roots: [2, 3], stress: 'penultimate',
    spell: { θ: 'th', x: 'ch', f: 'ph', y: 'y', 'eː': 'e', 'oː': 'o' },
    grammar: grammar({ order: 'SVO', adj: 'before', def: 'word', indef: 'none', poss: 'suffix', gender: 2, agree: true, tense: 'suffix' }),
    forms: { def: 'ho', poss: 'ou', past: 'sa' },
    masc: ['os', 'on', 'ias', 'ides', 'andros', 'ikos', 'eus'], fem: ['a', 'e', 'ia', 'issa', 'ope', 'ione'],
    demonym: ['ean', 'ian', 'ic', 'ot'],
    seeds: { city: 'polis', sea: 'thalassa', mountain: 'oros', river: 'potamos', island: 'nesos', new: 'nea', great: 'mega', holy: 'hagia', white: 'leuke', black: 'melas', gold: 'chrysos', light: 'phos', harbour: 'limen', cape: 'akra', temple: 'naos', king: 'basileus' },
  },
  given: [
    [
      'Andronikos', 'Basil', 'Nikephoros', 'Alexios', 'Theodoros', 'Manuel', 'Konstantinos', 'Leon', 'Demetrios', 'Isaakios',
      'Michael', 'Stephanos', 'Kallias', 'Lysander', 'Perikles', 'Timon', 'Kleon', 'Philon', 'Xenon', 'Agathon',
      'Nikandros', 'Ioannes', 'Komnenos', 'Doukas', 'Laskaris', 'Palaiologos', 'Georgios', 'Stavros', 'Constantinos', 'Anastasios',
      'Eustathios', 'Bartholomaios', 'Niketas', 'Christopher', 'Gennadios', 'Spyridon', 'Christodoulos', 'Polykarpos', 'Ignatios', 'Pantoleon',
      'Symeon', 'Cosmas', 'Damian', 'Philotheos', 'Tarchaneiotes', 'Phokas', 'Romanos', 'Skleros', 'Taronites', 'Votaneiates'
    ],
    [
      'Theodora', 'Irene', 'Zoe', 'Anna', 'Eudokia', 'Helena', 'Sophia', 'Thekla', 'Kassia', 'Theophano',
      'Maria', 'Kallisto', 'Phaedra', 'Xanthe', 'Aspasia', 'Damaris', 'Lysandra', 'Eirene', 'Ariadne', 'Euphrosyne',
      'Pulcheria', 'Marina', 'Catherine', 'Melania', 'Agatha', 'Pelagia', 'Barbara', 'Christina', 'Paraskevi', 'Styliani',
      'Despoina', 'Evdokia', 'Glykeria', 'Kallirhoe', 'Polyxeni', 'Kassandra', 'Evgenia', 'Thalia', 'Athenais', 'Sebasteia'
    ],
  ],
  house: (root, rnd) => {
    const f = `${root.replace(/[aeiou]s?$/, '')}id`;
    return rnd() < 0.5 ? { name: `the ${f} dynasty`, short: f } : { name: `House ${root}`, short: root };
  },
  epithets: ['the Peaceful', 'Porphyrogennetos', 'the Philosopher', 'the Hoplite', 'the Stoic', 'the Purple-Born'],
  ethos: { inventive: 3, egalitarian: 2, courtly: 1 },
  affinity: { seafarers: 0.8, cityBuilders: 1.6, merchantPrinces: 1, hospitality: 0.8, xenophile: 0.3 },
  architecture: 'whitewashed houses, marble temples and theatres',
  dress: 'draped chitons and sandals',
  food: 'bread, olives, fish, wine and cheese',
  planned: 1,
  rulers: ['Demarch', 'Archon', 'Despot', 'King', 'Autokrator'],
  barony: ['Deme of {S}', 'Barony of {S}'],
  county: ['Archonate of {S}', 'Nome of {S}'],
  duchy: ['Despotate of {N}', 'Duchy of {N}'],
  empire: ['Empire of {N}', 'the {N} Basileia'],
  cityRuler: 'Archon',
  republicRuler: 'Archon',
  cityState: ['Polis of {S}', 'Republic of {S}', 'Free Polis of {S}'],
  republic: ['Republic of {N}', 'the {N} Republic', 'Koinon of {N}'],
  league: ['the {N} League', 'Amphictyony of {N}'],
  leagueRuler: 'Synedrion',
  thalasso: [['Thalassocracy of {N}', 'Thalassarch']],
  cityStateP: 0.6,
  republicP: 0.4,
  indepDuchyP: 0.16,
  empireW: 0.5,
  leagueP: 0.55,
  seafaring: 0.9,
  succession: 'Hereditary; heirs are crowned co-rulers in the ruler\'s lifetime',
  femaleP: 0.12,
  court: ['Logothete', 'Domestic of the Schools', 'Sakellarios', 'Master of Offices', 'Patriarch'],
  army: 'armoured cataphracts and hoplite infantry',
  minorFolk: ['Halflings'],
  crafts: ['purple dye', 'marble statuary', 'painted pottery', 'olive oil'],
  coin: 'nomismata',
  shield: 'spanish',
  charges: ['sun', 'ship', 'anchor', 'lozenge', 'key'],
  faith: { native: 'pantheon', missionary: 'church', prophetic: 2 },
};
