import { grammar, near, type TemplateBundle } from '../bundle';

/**
 * Slavic: the peoples of the cold forests and broad rivers of the east, after the Slavs. Their princes are voivodes
 * and boyars, their houses end in -ovich, and they keep bees for honey and wax.
 */
export const SLAVIC: TemplateBundle = {
  label: 'Slavic',
  folk: 'Humans',
  world: 'old',
  culture: {
    id: 'slavic',
    likes: (c) => near(c.temp, 0, 9, 5) * (c.tempCold < -6 ? 1.2 : 0.7) * (c.coastal ? 0.8 : 1.1),
    starts: [
      'Bel', 'Zar', 'Vol', 'Mir', 'Dra', 'Kos', 'Sta', 'Pol', 'Gor', 'Vel', 'Bor', 'Rad', 'Sve', 'Yar', 'Lub', 'Kras', 'Dob', 'Vys', 'Tver', 'Chor',
      'Bog', 'Brat', 'Ces', 'Cher', 'Dub', 'Glin', 'Gost', 'Iv', 'Jar', 'Kam', 'Lip', 'Lis', 'Mog', 'Nov', 'Ozer', 'Pech', 'Pskov', 'Ros', 'Sel',
      'Smol', 'Stav', 'Tor', 'Ug', 'Vlad', 'Yas', 'Zel', 'Zvon', 'Bych', 'Gniez', 'Kol', 'Prze', 'Suz', 'Brod', 'Grod', 'Karp', 'Lom', 'Miech', 'Ned',
      'Svar', 'Tarn', 'Vran', 'Zat', 'Brest', 'Dnep', 'Krak', 'Lviv', 'Plock', 'Ryb', 'Sjed', 'Tvar', 'Vary',
    ],
    mids: ['o', 'e', 'an', 'is', 'ov', 'a', 'i', 'ol', 'uk', 'ev', 'ic', 'in'],
    ends: [
      'grad', 'ov', 'ovo', 'ice', 'sk', 'in', 'ava', 'na', 'ets', 'ograd', 'ny', 'ka', 'ow', 'avl', 'ich', 'ovka', 'ino', 'evo', 'insk', 'nik', 'ica',
      'any', 'ovice', 'sko', 'yn', 'ishche', 'ubov', 'ec', 'ok', 'ach', 'ensk', 'ichi', 'omir', 'oslav', 'ozero', 'opol', 'ovets', 'ichev', 'ishte',
      'nica', 'aya', 'ostok', 'orsk', 'ovsk', 'yov', 'ina', 'uga', 'el', 'bor', 'gora', 'brod', 'vici', 'pol', 'yan', 'avie', 'ovtsy', 'lya',
      ' slovo', ' mizo', ' mir', ' lypa', ' yar', ' glade', ' lug', ' kut',
    ],
    midChance: 0.5,
    terms: {
      river: ['the {N}', 'River {N}'],
      lake: ['Lake {N}', '{N} Ozero'],
      forest: ['the {N} Forest', '{N} Woods', 'the {A} Forest', 'the {N} Taiga'],
      marsh: ['the {N} Marshes', '{N} Bog', 'the {A} Marshes'],
      plains: ['the {N} Steppe', '{N} Plains', 'the {A} Steppe'],
    },
    realm: ['Voivodeship of {N}', 'Tsardom of {N}', 'Principality of {N}', 'Grand Duchy of {N}'],
    prefixes: ['Nova ', 'Stara ', 'Velika ', 'Mala ', 'Gorna ', 'Dolna ', 'Sveti ', 'Krasna ', 'Bela ', 'Cerna ', 'Verkhnya ', 'Nizhnya '],
    prefixChance: 0.1,
  },
  lang: {
    id: 'slavic', after: 'Old Slavic and Russian',
    C: { p: 2, b: 3, t: 4, d: 4, k: 4, g: 3, m: 4, n: 5, ɲ: 0.5, f: 0.5, v: 5, s: 4, z: 3, ʃ: 2, ʒ: 1.5, x: 1.5, ts: 1, tʃ: 1.5, r: 5, l: 5, j: 2 },
    V: { a: 5, e: 4, i: 3, o: 6, u: 3, ɨ: 1.5 },
    syl: { CV: 5, CVC: 4, CCV: 2, CCVC: 1.4 },
    onsets: ['s t', 's v', 'v l', 'v r', 's l', 'z v', 'k r', 'g r', 'p r', 'b r', 'd r', 't r', 'z d', 's m', 'g l', 'k n'],
    codas: ['s k', 's t'],
    finals: ['v', 'k', 'n', 'd', 'l', 'r', 'ts', 's', 'tʃ', 'j', 'm', 'z'],
    compound: 'final', roots: [1, 2], stress: 'penultimate',
    spell: { x: 'kh', ʒ: 'zh', ts: 'ts', tʃ: 'ch', ʃ: 'sh', ɨ: 'y', j: 'y', ɲ: 'n' },
    grammar: grammar({ order: 'SVO', adj: 'before', def: 'none', indef: 'none', poss: 'suffix', gender: 2, agree: true, tense: 'suffix' }),
    forms: { poss: 'a', past: 'l', fem: 'a', neg: 'ne' },
    masc: ['slav', 'mir', 'gost', 'mysl', 'dan', 'vlad', 'or'], fem: ['a', 'slava', 'mira', 'ka', 'ena', 'ina', 'ava'],
    demonym: ['ian', 'ic', 'ish', 'ovan'],
    seeds: { town: 'grad', river: 'reka', lake: 'ozero', forest: 'les', mountain: 'gora', field: 'pole', white: 'bel', black: 'chern', new: 'nov', old: 'star', fortress: 'kreml', village: 'selo', island: 'ostrov', glory: 'slav', peace: 'mir', wolf: 'volk', oak: 'dub', birch: 'bereza' },
  },
  given: [
    [
      'Mstislav', 'Yaroslav', 'Vladimir', 'Sviatoslav', 'Boleslav', 'Vsevolod', 'Rostislav', 'Izyaslav', 'Dobrynya', 'Bogdan',
      'Casimir', 'Vratislav', 'Zbigniew', 'Radomir', 'Stanimir', 'Borislav', 'Miroslav', 'Lyubomir', 'Svetopolk', 'Dragomir',
      'Vyacheslav', 'Gleb', 'Igor', 'Oleg', 'Premysl', 'Wladyslaw', 'Kazimierz', 'Jaromir', 'Leszek', 'Mezadir',
      'Branislav', 'Sudislav', 'Radoslav', 'Velimir', 'Vojtech', 'Ratibor', 'Miloslav', 'Dushi', 'Stanislav', 'Blagoy',
      'Tichomir', 'Vecheslav', 'Boledar', 'Cestmir', 'Kresimir', 'Svetozar', 'Zdenek', 'Zlatko', 'Vladislav', 'Goran'
    ],
    [
      'Olga', 'Lyudmila', 'Dobrava', 'Rogneda', 'Zoria', 'Milena', 'Vesna', 'Dragomira', 'Svetlana', 'Bozena',
      'Radmila', 'Zlata', 'Miroslava', 'Yaroslava', 'Desislava', 'Kseniya', 'Libusa', 'Wanda', 'Svetlana', 'Danica',
      'Svyatoslava', 'Bogdana', 'Stanislava', 'Milica', 'Zdenka', 'Radoslava', 'Daria', 'Vlada', 'Jadwiga', 'Kinga',
      'Kazimiera', 'Boleslawa', 'Miloslava', 'Premyslava', 'Vjera', 'Slavica', 'Branislava', 'Svetozara', 'Marzena', 'Mira'
    ],
  ],
  house: (root) => {
    const f = `${root.replace(/[aeiouy]$/, '')}ovich`;
    return { name: `the ${f}i`, short: f };
  },
  epithets: ['the Terrible', 'the Wise', 'Long-Arm', 'Big Nest', 'the Bold', 'the Brave'],
  ethos: { stoic: 3, communal: 2, bellicose: 1 },
  architecture: 'log houses, onion domes and timber stockades',
  dress: 'embroidered linen shirts and fur hats',
  gladeNouns: ['Polana', 'Glade'],
  hilly: true,
  rulers: ['Boyar', 'Zhupan', 'Voivode', 'Tsar', 'Emperor'],
  barony: ['Volost of {S}', 'Barony of {S}'],
  county: ['Zhupa of {S}', 'County of {S}'],
  duchy: ['Voivodeship of {N}', 'Principality of {N}'],
  empire: ['Empire of {N}', 'the {N} Tsardom'],
  cityRuler: 'Burgomaster',
  republicRuler: 'Posadnik',
  cityState: ['Free City of {S}', 'Republic of {S}'],
  cityStateP: 0.06,
  republicP: 0.03,
  indepDuchyP: 0.015,
  empireW: 0.6,
  seafaring: 0.3,
  succession: 'Seniority: the eldest of the dynasty inherits',
  femaleP: 0.1,
  court: ['Chancellor', 'Voivode of the Host', 'Treasurer', 'Master of Secrets', 'Metropolitan'],
  army: 'boyar cavalry and town militias',
  minorFolk: ['Gnomes', 'Half-orcs'],
  crafts: ['sable furs', 'honey mead', 'painted icons', 'linen'],
  coin: 'grivnas',
  goods: { honey: 1.6 },
  shield: 'french',
  charges: ['cross', 'crown', 'eagle', 'tower', 'sword'],
  faith: { native: 'oldgods', missionary: 'church', prophetic: 1 },
};
