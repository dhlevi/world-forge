/**
 * Language templates: the familiar starting points that every generated language grows from.
 * Each gives a sound inventory (IPA, weighted by how common each sound is), syllable shapes,
 * consonant clusters, how sounds are spelled, a sketch of grammar, a few word endings for
 * given names and demonyms, and seed words (mostly the place-name elements the old naming
 * cultures used) so that a language with little drift still sounds like its template.
 */

export type Order = 'SVO' | 'SOV' | 'VSO' | 'VOS' | 'OVS' | 'OSV';
export interface GrammarBias {
  order: Order;
  adj: 'before' | 'after';
  def: 'none' | 'word' | 'prefix' | 'suffix';
  indef: 'none' | 'word';
  plural: 'suffix' | 'prefix' | 'none' | 'reduplication';
  /** Possession: a suffix or prefix on the possessor, an "of" word, a particle after the possessor, or the construct (possessed first, possessor after, unmarked). */
  poss: 'suffix' | 'prefix' | 'of' | 'particle' | 'construct';
  gender: 0 | 2;
  genderKind?: 'sex' | 'animacy';
  /** Verbs agree with their subject's person and number. */
  agree: boolean;
  tense: 'suffix' | 'prefix' | 'particle';
  adposition: 'pre' | 'post';
}
export type FormKey = 'def' | 'indef' | 'plural' | 'poss' | 'of' | 'past' | 'future' | 'neg' | 'fem' | 'masc';

export interface LangTemplate {
  id: string;
  /** Shown as "after …": the real languages the template recalls. */
  after: string;
  C: Record<string, number>;
  V: Record<string, number>;
  /** Syllable shapes: C consonant, V vowel, N nasal coda, G glide (j, w). CC is an onset or coda cluster. */
  syl: Record<string, number>;
  /** Allowed onset and coda clusters, as space-separated IPA. */
  onsets: string[];
  codas: string[];
  /** Consonants allowed to end a word (default: any but glides and h). */
  finals?: string[];
  /** Root length in syllables. */
  roots: [number, number];
  stress: 'initial' | 'penultimate' | 'final' | 'none';
  harmony?: boolean;
  tones?: number;
  /** IPA → spelling, overriding the defaults. */
  spell?: Record<string, string>;
  /** Spelling rules applied to the spelled word: [pattern, replacement, what it means]. */
  rules?: [string, string, string][];
  grammar: GrammarBias;
  forms?: Partial<Record<FormKey, string>>;
  /** Endings for given names. */
  masc: string[];
  fem: string[];
  /** Suffixes making a people's name from a root ("Varsk" → "Varskish"). */
  demonym: string[];
  /** Seed words by English concept, spelled. */
  seeds: Record<string, string>;
}

const g = (o: Partial<GrammarBias>): GrammarBias => ({
  order: 'SVO', adj: 'before', def: 'word', indef: 'word', plural: 'suffix', poss: 'of', gender: 0, agree: false, tense: 'suffix', adposition: 'pre', ...o,
});

export const LANG_TEMPLATES: Record<string, LangTemplate> = {
  anglo: {
    id: 'anglo', after: 'Old English and Norman French',
    C: { p: 2, b: 3, t: 5, d: 5, k: 4, g: 3, m: 4, n: 6, f: 3, v: 1, θ: 2, s: 5, ʃ: 2, tʃ: 1, dʒ: 1, h: 3, w: 3, j: 1, r: 5, l: 5 },
    V: { a: 5, æ: 2, e: 4, i: 3, o: 4, u: 2, ɪ: 2, ə: 1 },
    syl: { CV: 3, CVC: 5, CCVC: 1.4, CVCC: 1, VC: 0.6, CCV: 0.6 },
    onsets: ['s t', 's p', 's k', 't r', 'd r', 'k r', 'g r', 'b r', 'p r', 'f r', 'f l', 'b l', 'k l', 'g l', 's w', 't w', 'θ r', 's l'],
    codas: ['n d', 'l d', 'r d', 'r n', 's t', 'f t', 'r k', 'l k', 'n t', 'l m', 'r m'],
    finals: ['n', 'm', 'l', 'r', 's', 't', 'd', 'k', 'f', 'θ', 'g', 'tʃ', 'ʃ'],
    roots: [1, 2], stress: 'initial',
    spell: { æ: 'a', ə: 'e', ɪ: 'i', j: 'y', dʒ: 'j' },
    rules: [['k(?=[aou])', 'c', '/k/ is written c before a, o and u'], ['kw', 'qu', '/kw/ is written qu'], ['j$', 'dge', 'final /dʒ/ is written dge']],
    grammar: g({ order: 'SVO', adj: 'before', def: 'word', indef: 'word', poss: 'of', tense: 'suffix' }),
    forms: { def: 'the', indef: 'an', of: 'of', past: 'ed', plural: 'en' },
    masc: ['ric', 'win', 'wulf', 'mund', 'bert', 'ald', 'red', 'stan', 'ward'], fem: ['a', 'wyn', 'ith', 'gifu', 'burh', 'flaed', 'hild'],
    demonym: ['ish', 'ian', 'ic', 'en'],
    seeds: {
      ford: 'ford', town: 'ton', farm: 'ham', dwelling: 'wick', field: 'field', lake: 'mere', valley: 'dale', meadow: 'ley', enclosure: 'worth', cottage: 'cott',
      fort: 'bury', island: 'sey', bridge: 'bridge', wood: 'wood', brook: 'brook', gate: 'gate', moor: 'moor', harbour: 'haven', hill: 'down', black: 'black',
      ash: 'ash', thorn: 'thorn', grey: 'grey', old: 'eld', stone: 'stone', wolf: 'wolf', raven: 'raven', red: 'red', high: 'high', king: 'king', iron: 'iron', salt: 'salt', oak: 'oak',
    },
  },
  norse: {
    id: 'norse', after: 'Old Norse',
    C: { p: 1, b: 3, t: 4, d: 3, k: 4, g: 4, m: 3, n: 5, f: 3, v: 3, θ: 2, s: 5, h: 3, j: 2, r: 6, l: 5 },
    V: { a: 5, e: 3, i: 3, o: 3, u: 3, y: 1, ø: 1, æ: 1, 'aː': 1, 'iː': 0.5, 'ɔ': 1 },
    syl: { CV: 2, CVC: 5, CCVC: 1.6, CVCC: 1.4, VC: 0.8 },
    onsets: ['s k', 's t', 's v', 's n', 'f j', 'k n', 'h r', 'h l', 't r', 'g r', 'b r', 'b j', 'f r', 's l', 'θ r'],
    codas: ['r d', 'r n', 'l d', 'n d', 'n g', 'l l', 'n n', 's t', 'f t', 'l f', 'r k', 'r g', 'l m'],
    roots: [1, 2], stress: 'initial',
    spell: { 'aː': 'aa', 'iː': 'ii', æ: 'ae', ø: 'ø', y: 'y', ɔ: 'å', j: 'j', θ: 'th' },
    grammar: g({ order: 'SVO', adj: 'before', def: 'suffix', indef: 'word', poss: 'suffix', gender: 2, tense: 'suffix' }),
    forms: { def: 'en', indef: 'en', poss: 's', past: 'de', plural: 'ar' },
    masc: ['ar', 'ulf', 'mund', 'vald', 'stein', 'bjorn', 'geir', 'ir'], fem: ['a', 'hild', 'rid', 'dis', 'veig', 'run', 'borg'],
    demonym: ['ic', 'ish', 'ian', 'sk'],
    seeds: {
      bay: 'vik', home: 'heim', farm: 'by', valley: 'dal', town: 'stad', islet: 'holm', enclosure: 'gard', headland: 'nes', fjord: 'fjord', mountain: 'berg',
      harbour: 'havn', sound: 'sund', field: 'vald', island: 'ey', beach: 'strand', river: 'elv', lake: 'vatn', black: 'svart', wolf: 'ulf', bear: 'bjorn',
      iron: 'jarn', cold: 'kald', ice: 'is', serpent: 'orm', stone: 'stein', raven: 'hrafn', thunder: 'thor', hall: 'hall', fell: 'fjell',
    },
  },
  latin: {
    id: 'latin', after: 'Latin and Italian',
    C: { p: 3, b: 2, t: 5, d: 3, k: 4, g: 2, m: 4, n: 5, f: 2, v: 3, s: 6, r: 6, l: 5, j: 0.5 },
    V: { a: 6, e: 4, i: 4, o: 4, u: 4 },
    syl: { CV: 6, CVC: 3, V: 1, CCV: 1 },
    onsets: ['t r', 'p r', 'k r', 'g r', 'b r', 'f l', 'p l', 'k l', 's t', 's k'],
    codas: [],
    finals: ['s', 'n', 'm', 'r', 'l', 'x'],
    roots: [2, 3], stress: 'penultimate',
    rules: [['k', 'c', '/k/ is written c'], ['cs', 'x', '/ks/ is written x']],
    grammar: g({ order: 'SOV', adj: 'after', def: 'none', indef: 'none', poss: 'suffix', gender: 2, agree: true, tense: 'suffix' }),
    forms: { poss: 'i', plural: 'es', past: 'avit', fem: 'a', masc: 'us', neg: 'non' },
    masc: ['us', 'ius', 'o', 'anus', 'ian', 'inus'], fem: ['a', 'ia', 'ina', 'illa', 'ana'],
    demonym: ['an', 'ian', 'ine', 'ese'],
    seeds: {
      water: 'aqua', mountain: 'mons', sea: 'mare', lake: 'lacus', river: 'flumen', town: 'villa', fort: 'castra', city: 'urbs', bridge: 'pons', field: 'campus',
      new: 'nova', great: 'magna', old: 'vetus', holy: 'sancta', white: 'alba', black: 'nigra', red: 'rubra', gold: 'aurum', light: 'lux', king: 'rex',
      road: 'via', valley: 'vallis', island: 'insula', harbour: 'portus', forest: 'silva',
    },
  },
  celtic: {
    id: 'celtic', after: 'Welsh, Irish and Gaelic',
    C: { p: 2, b: 3, t: 3, d: 4, k: 4, g: 3, m: 4, n: 5, ŋ: 1, f: 2, v: 3, θ: 1, ð: 2, x: 2, ɬ: 1.5, s: 3, ʃ: 1, h: 1, r: 5, l: 4, w: 2 },
    V: { a: 5, e: 3, i: 3, o: 3, u: 2, ɨ: 1.5, ə: 1, 'aː': 0.6 },
    syl: { CV: 3, CVC: 5, CCVC: 1, VC: 0.8 },
    onsets: ['b r', 'k r', 'd r', 'g r', 't r', 'g l', 'b l', 'g w', 'k l'],
    codas: ['r n', 'r ð', 'l t', 'n t', 'r x'],
    roots: [1, 2], stress: 'penultimate',
    spell: { v: 'f', f: 'ff', ð: 'dd', θ: 'th', x: 'ch', ɬ: 'll', ɨ: 'y', ə: 'y', 'aː': 'â', k: 'c' },
    rules: [['^ff', 'f', 'initial /f/ is written f']],
    grammar: g({ order: 'VSO', adj: 'after', def: 'word', indef: 'none', poss: 'construct', gender: 2, agree: true, tense: 'particle' }),
    forms: { def: 'yr', past: 'do' },
    masc: ['an', 'ach', 'wyn', 'ion', 'ric', 'mor'], fem: ['wen', 'a', 'eth', 'id', 'ann', 'wyn'],
    demonym: ['ic', 'ish', 'ian'],
    seeds: { 'river mouth': 'aber', church: 'llan', fort: 'dun', hill: 'bryn', head: 'pen', town: 'tre', valley: 'glen', big: 'mor', great: 'mor', lake: 'loch', white: 'gwyn', high: 'ard', mountain: 'ben', forest: 'coed', river: 'afon', island: 'inis', black: 'du', castle: 'caer', stream: 'nant' },
  },
  elvish: {
    id: 'elvish', after: 'invented elvish tongues (liquid, vowel-rich)',
    C: { t: 3, d: 3, k: 2, g: 2, m: 3, n: 6, l: 7, r: 5, s: 4, θ: 2, ð: 1, v: 2, f: 2, h: 1, j: 1, w: 1 },
    V: { a: 5, e: 5, i: 5, o: 3, u: 1.5, 'eː': 0.6, 'iː': 0.6 },
    syl: { CV: 6, CVC: 3, V: 1.5, VC: 0.6 },
    onsets: ['t r', 'g l', 'g r', 'k l'],
    codas: ['l d', 'n d', 'r n', 'l t'],
    finals: ['l', 'n', 'r', 's', 'θ'],
    roots: [2, 3], stress: 'penultimate',
    spell: { θ: 'th', ð: 'dh', 'eː': 'ë', 'iː': 'í', k: 'c' },
    grammar: g({ order: 'SVO', adj: 'after', def: 'word', indef: 'none', poss: 'of', tense: 'suffix' }),
    forms: { def: 'i', of: 'en' },
    masc: ['ion', 'dor', 'las', 'mir', 'ren', 'thil', 'ar'], fem: ['iel', 'wen', 'ith', 'ra', 'elle', 'ia', 'is'],
    demonym: ['ian', 'ine', 'ari', 'ish'],
    seeds: { star: 'ael', moon: 'ith', silver: 'sil', river: 'lin', forest: 'thal', wind: 'fae', light: 'mir', tree: 'lor', song: 'lin', sea: 'nen', grove: 'lorien' },
  },
  desert: {
    id: 'desert', after: 'Arabic and Persian',
    C: { b: 3, t: 4, d: 3, k: 2, q: 2, m: 4, n: 4, f: 2, θ: 0.5, s: 4, z: 2, ʃ: 3, x: 2, ɣ: 1, ħ: 2, h: 2, r: 5, l: 4, j: 2, w: 2, dʒ: 2 },
    V: { a: 6, i: 4, u: 3, 'aː': 2.5, 'iː': 1.5, 'uː': 1.2 },
    syl: { CV: 4, CVC: 5 },
    onsets: [],
    codas: [],
    roots: [2, 3], stress: 'penultimate',
    spell: { x: 'kh', ɣ: 'gh', ʃ: 'sh', ħ: 'h', dʒ: 'j', 'aː': 'a', 'iː': 'i', 'uː': 'u', j: 'y', θ: 'th' },
    grammar: g({ order: 'VSO', adj: 'after', def: 'prefix', indef: 'none', poss: 'construct', gender: 2, agree: true, tense: 'prefix' }),
    forms: { def: 'al', fem: 'a', neg: 'la' },
    masc: ['id', 'ir', 'im', 'an', 'ar', 'ul'], fem: ['a', 'ah', 'iya', 'ina', 'ara'],
    demonym: ['i', 'ite', 'ian'],
    seeds: { well: 'bir', mountain: 'jebel', 'dry river': 'wadi', river: 'nahr', city: 'medina', fortress: 'qasr', sea: 'bahr', desert: 'sahra', castle: 'qala', oasis: 'waha', gate: 'bab', red: 'ahmar', white: 'abyad', black: 'aswad', great: 'kabir', new: 'jadid', sun: 'shams', moon: 'qamar', son: 'ibn', father: 'abu', market: 'suq' },
  },
  slavic: {
    id: 'slavic', after: 'Old Slavic and Russian',
    C: { p: 2, b: 3, t: 4, d: 4, k: 4, g: 3, m: 4, n: 5, ɲ: 0.5, f: 0.5, v: 5, s: 4, z: 3, ʃ: 2, ʒ: 1.5, x: 1.5, ts: 1, tʃ: 1.5, r: 5, l: 5, j: 2 },
    V: { a: 5, e: 4, i: 3, o: 6, u: 3, ɨ: 1.5 },
    syl: { CV: 5, CVC: 4, CCV: 2, CCVC: 1.4 },
    onsets: ['s t', 's v', 'v l', 'v r', 's l', 'z v', 'k r', 'g r', 'p r', 'b r', 'd r', 't r', 'z d', 's m', 'g l', 'k n'],
    codas: ['s k', 's t'],
    finals: ['v', 'k', 'n', 'd', 'l', 'r', 'ts', 's', 'tʃ', 'j', 'm', 'z'],
    roots: [1, 2], stress: 'penultimate',
    spell: { x: 'kh', ʒ: 'zh', ts: 'ts', tʃ: 'ch', ʃ: 'sh', ɨ: 'y', j: 'y', ɲ: 'n' },
    grammar: g({ order: 'SVO', adj: 'before', def: 'none', indef: 'none', poss: 'suffix', gender: 2, agree: true, tense: 'suffix' }),
    forms: { poss: 'a', past: 'l', fem: 'a', neg: 'ne' },
    masc: ['slav', 'mir', 'gost', 'mysl', 'dan', 'vlad', 'or'], fem: ['a', 'slava', 'mira', 'ka', 'ena', 'ina', 'ava'],
    demonym: ['ian', 'ic', 'ish', 'ovan'],
    seeds: { town: 'grad', river: 'reka', lake: 'ozero', forest: 'les', mountain: 'gora', field: 'pole', white: 'bel', black: 'chern', new: 'nov', old: 'star', fortress: 'kreml', village: 'selo', island: 'ostrov', glory: 'slav', peace: 'mir', wolf: 'volk', oak: 'dub', birch: 'bereza' },
  },
  dwarven: {
    id: 'dwarven', after: 'invented dwarvish tongues (hard, clipped)',
    C: { b: 3, d: 4, g: 4, k: 4, t: 3, r: 6, m: 3, n: 3, z: 2, θ: 2, ð: 1, x: 2, h: 1, l: 3, v: 1, s: 1 },
    V: { a: 5, o: 4, u: 4, i: 2, e: 2 },
    syl: { CVC: 6, CVCC: 2.5, CV: 1.5, CCVC: 1 },
    onsets: ['b r', 'd r', 'g r', 'k r', 'k l', 'θ r'],
    codas: ['r k', 'r n', 'n d', 'z d', 'r g', 'l d', 'm m', 'r m', 'r d', 'k k'],
    roots: [1, 2], stress: 'initial',
    spell: { x: 'kh', θ: 'th', ð: 'dh', k: 'k' },
    grammar: g({ order: 'SOV', adj: 'before', def: 'word', indef: 'none', poss: 'particle', tense: 'suffix', adposition: 'post' }),
    forms: { def: 'ul', poss: 'az' },
    masc: ['in', 'ur', 'ak', 'grim', 'dur', 'rik', 'ok'], fem: ['a', 'dis', 'ra', 'hild', 'ria', 'run'],
    demonym: ['ish', 'en', 'ic'],
    seeds: { hall: 'dum', hold: 'kard', deep: 'durn', stone: 'gor', iron: 'barak', gold: 'khaz', mountain: 'zarak', gate: 'drek', axe: 'kuld', hammer: 'mor', forge: 'brund' },
  },
  southern: {
    id: 'southern', after: 'Ancient and Byzantine Greek',
    C: { p: 4, b: 1, t: 5, d: 3, k: 5, g: 2, m: 4, n: 5, f: 2, θ: 2, x: 2, s: 6, z: 1, r: 5, l: 5 },
    V: { a: 5, e: 4, i: 4, o: 5, u: 1, y: 1.5, 'eː': 0.8, 'oː': 0.8 },
    syl: { CV: 6, CVC: 3, CCV: 1.5, V: 1 },
    onsets: ['p l', 'p r', 't r', 'k r', 'k l', 'g l', 'g r', 'p s', 'k t', 's t', 's p', 'θ r', 'x r'],
    codas: [],
    finals: ['s', 'n', 'r'],
    roots: [2, 3], stress: 'penultimate',
    spell: { θ: 'th', x: 'ch', f: 'ph', y: 'y', 'eː': 'e', 'oː': 'o' },
    grammar: g({ order: 'SVO', adj: 'before', def: 'word', indef: 'none', poss: 'suffix', gender: 2, agree: true, tense: 'suffix' }),
    forms: { def: 'ho', poss: 'ou', past: 'sa' },
    masc: ['os', 'on', 'ias', 'ides', 'andros', 'ikos', 'eus'], fem: ['a', 'e', 'ia', 'issa', 'ope', 'ione'],
    demonym: ['ean', 'ian', 'ic', 'ot'],
    seeds: { city: 'polis', sea: 'thalassa', mountain: 'oros', river: 'potamos', island: 'nesos', new: 'nea', great: 'mega', holy: 'hagia', white: 'leuke', black: 'melas', gold: 'chrysos', light: 'phos', harbour: 'limen', cape: 'akra', temple: 'naos', king: 'basileus' },
  },
  steppe: {
    id: 'steppe', after: 'Turkic and Mongolic',
    C: { b: 4, t: 4, d: 3, k: 5, g: 3, q: 2, m: 3, n: 5, ŋ: 1, s: 4, z: 2, ʃ: 2, x: 2, tʃ: 2, dʒ: 1.5, r: 5, l: 4, j: 2 },
    V: { a: 6, e: 3, i: 3, o: 3, u: 4, ø: 1, y: 1.2, ɨ: 1.5 },
    syl: { CV: 4, CVC: 6, VC: 1.2, V: 0.5 },
    onsets: [],
    codas: ['r t', 'l t', 'r k', 'n t'],
    roots: [2, 2], stress: 'final', harmony: true,
    spell: { x: 'kh', ʃ: 'sh', tʃ: 'ch', dʒ: 'j', ø: 'ö', y: 'ü', ɨ: 'y', j: 'y', ŋ: 'ng' },
    grammar: g({ order: 'SOV', adj: 'before', def: 'none', indef: 'word', poss: 'suffix', tense: 'suffix', adposition: 'post', agree: true }),
    forms: { indef: 'bir', plural: 'lar', poss: 'ning', past: 'di', neg: 'ma' },
    masc: ['an', 'ar', 'ai', 'tur', 'bek', 'ei', 'ur'], fem: ['a', 'ai', 'gul', 'jan', 'tai', 'un'],
    demonym: ['ic', 'i', 'ish'],
    seeds: { lake: 'kol', river: 'su', mountain: 'tau', city: 'kent', black: 'kara', white: 'ak', blue: 'kok', red: 'kyzyl', sand: 'kum', stone: 'tash', horde: 'orda', camp: 'aul', town: 'balyk', khan: 'khan', iron: 'temir', wolf: 'bori', horse: 'at' },
  },
  jungle: {
    id: 'jungle', after: 'Nahuatl and Maya',
    C: { p: 3, t: 5, k: 5, tʃ: 3, ts: 2, tɬ: 3, ʃ: 2, m: 4, n: 4, l: 3, w: 3, j: 3, ʔ: 1, h: 1, b: 1 },
    V: { a: 6, e: 3, i: 4, o: 4, u: 1 },
    syl: { CV: 5, CVC: 4, V: 0.8 },
    onsets: [],
    codas: [],
    finals: ['tɬ', 'n', 'k', 'l', 'ts', 'tʃ', 'm', 'ʃ'],
    roots: [2, 3], stress: 'penultimate',
    spell: { tɬ: 'tl', ts: 'tz', ʃ: 'x', tʃ: 'ch', w: 'hu', j: 'y', ʔ: "'", k: 'c' },
    rules: [['c(?=[ei])', 'qu', '/k/ is written qu before e and i'], ["'", '', 'the glottal stop is not written in names']],
    grammar: g({ order: 'VSO', adj: 'before', def: 'word', indef: 'none', poss: 'prefix', tense: 'prefix' }),
    forms: { def: 'in', poss: 'i', past: 'o' },
    masc: ['tl', 'atl', 'oc', 'ec', 'tzin', 'pal'], fem: ['tli', 'chel', 'tzin', 'xo', 'tal'],
    demonym: ['ec', 'an', 'ian'],
    seeds: { place: 'tlan', water: 'atl', mountain: 'tepetl', house: 'calli', serpent: 'coatl', flower: 'xochitl', stone: 'tetl', city: 'tlan', hill: 'tepec' },
  },
  sinic: {
    id: 'sinic', after: 'Mandarin and older Chinese',
    C: { p: 2, pʰ: 1.5, t: 3, tʰ: 2, k: 3, kʰ: 2, m: 3, n: 3, f: 2, s: 2, ʂ: 3, ʐ: 1, x: 3, ts: 1.5, tsʰ: 1, tɕ: 3, tɕʰ: 2, ɕ: 3, l: 3, j: 2, w: 2 },
    V: { a: 5, e: 2, i: 4, o: 2, u: 4, y: 1, ə: 2 },
    syl: { CV: 4, CVN: 4, CGV: 1.5, CGVN: 1, V: 0.3 },
    onsets: [],
    codas: [],
    finals: ['n', 'ŋ'],
    roots: [1, 1], stress: 'none', tones: 4,
    spell: { pʰ: 'p', p: 'b', tʰ: 't', t: 'd', kʰ: 'k', k: 'g', ʂ: 'sh', ʐ: 'r', x: 'h', ts: 'z', tsʰ: 'c', tɕ: 'j', tɕʰ: 'q', ɕ: 'x', ŋ: 'ng', y: 'ü', ə: 'e', j: 'y', w: 'w' },
    rules: [['([jqx])ü', '$1u', 'ü is written u after j, q and x']],
    grammar: g({ order: 'SVO', adj: 'before', def: 'none', indef: 'none', plural: 'none', poss: 'particle', tense: 'particle' }),
    forms: { poss: 'de', past: 'le', neg: 'bu' },
    masc: [], fem: [],
    demonym: ['ese', 'ian'],
    seeds: { mountain: 'shan', river: 'jiang', lake: 'hu', city: 'cheng', capital: 'jing', gate: 'men', north: 'bei', south: 'nan', east: 'dong', west: 'xi', peace: 'an', great: 'da', white: 'bai', red: 'hong', gold: 'jin', dragon: 'long', jade: 'yu', bridge: 'qiao', island: 'dao', sea: 'hai', harbour: 'gang', ridge: 'ling', valley: 'gu', field: 'tian', spring: 'quan' },
  },
  japonic: {
    id: 'japonic', after: 'Japanese',
    C: { k: 6, g: 2, s: 5, z: 1.5, t: 5, d: 2, n: 5, h: 3, b: 1.5, p: 0.3, m: 4, j: 2, r: 4, w: 1.5 },
    V: { a: 6, i: 5, u: 4, e: 3, o: 5, 'oː': 0.8, 'uː': 0.4 },
    syl: { CV: 9, V: 1, CVN: 1.2 },
    onsets: [],
    codas: [],
    finals: ['n'],
    roots: [2, 3], stress: 'none',
    spell: { 'oː': 'o', 'uː': 'u', j: 'y' },
    rules: [['si', 'shi', '/si/ is written shi'], ['ti', 'chi', '/ti/ is written chi'], ['tu', 'tsu', '/tu/ is written tsu'], ['hu', 'fu', '/hu/ is written fu'], ['zi', 'ji', '/zi/ is written ji'], ['di', 'ji', '/di/ is written ji'], ['du', 'zu', '/du/ is written zu'], ['w([iue])', '$1', '/w/ is lost before i, u and e'], ['y([ie])', '$1', '/j/ is lost before i and e'], ['n(?=[bmp])', 'm', '/n/ is written m before b, m and p']],
    grammar: g({ order: 'SOV', adj: 'before', def: 'none', indef: 'none', plural: 'none', poss: 'particle', tense: 'suffix', adposition: 'post' }),
    forms: { poss: 'no', past: 'ta', neg: 'nai' },
    masc: ['o', 'ro', 'hiko', 'nobu', 'mune', 'masa'], fem: ['ko', 'mi', 'e', 'yo', 'na', 'ka'],
    demonym: ['ese', 'ian'],
    seeds: { mountain: 'yama', river: 'kawa', island: 'shima', 'rice field': 'ta', village: 'mura', castle: 'jo', capital: 'kyo', bridge: 'hashi', sea: 'umi', lake: 'ko', black: 'kuro', white: 'shiro', big: 'o', small: 'ko', pine: 'matsu', forest: 'mori', valley: 'tani', harbour: 'minato', cape: 'saki', slope: 'saka', moon: 'tsuki', sun: 'hi', wind: 'kaze', field: 'hara' },
  },
  koreanic: {
    id: 'koreanic', after: 'Korean',
    C: { k: 5, g: 1, n: 5, t: 3, d: 2, r: 2, l: 2, m: 4, p: 2, b: 2, s: 5, j: 2, tʃ: 3, tʃʰ: 1.5, h: 3, w: 1, ŋ: 2 },
    V: { a: 5, ʌ: 3, o: 4, u: 4, ɯ: 2, i: 4, e: 2, æ: 2 },
    syl: { CV: 5, CVC: 4, CGV: 1, V: 0.8 },
    onsets: [],
    codas: [],
    finals: ['k', 'n', 'l', 'm', 'p', 'ŋ'],
    roots: [1, 2], stress: 'none',
    spell: { ʌ: 'eo', ɯ: 'eu', æ: 'ae', ŋ: 'ng', tʃ: 'j', tʃʰ: 'ch', j: 'y' },
    grammar: g({ order: 'SOV', adj: 'before', def: 'none', indef: 'none', plural: 'suffix', poss: 'particle', tense: 'suffix', adposition: 'post' }),
    forms: { poss: 'ui', plural: 'deul', past: 'eot', neg: 'an' },
    masc: [], fem: [],
    demonym: ['ian', 'ese'],
    seeds: { mountain: 'san', river: 'gang', island: 'do', sea: 'hae', lake: 'ho', city: 'seong', village: 'ri', peak: 'bong', temple: 'sa', bridge: 'gyo', valley: 'gok', gate: 'mun', north: 'buk', south: 'nam', east: 'dong', west: 'seo', great: 'dae', blue: 'cheong', white: 'baek', gold: 'geum', dragon: 'yong', peace: 'an' },
  },
  woodland: {
    id: 'woodland', after: 'the Algonquian and Iroquoian languages of the eastern woodlands',
    C: { p: 2, t: 3, k: 5, m: 4, n: 5, s: 3, ʃ: 2, h: 2, w: 4, j: 1, tʃ: 2 },
    V: { a: 6, e: 3, i: 4, o: 4, u: 1, 'aː': 1, 'iː': 1 },
    syl: { CV: 6, CVC: 3, V: 1.2 },
    onsets: ['s k', 'k w', 'm w'],
    codas: [],
    finals: ['k', 'n', 'm', 's', 't'],
    roots: [2, 3], stress: 'penultimate',
    spell: { ʃ: 'sh', tʃ: 'ch', 'aː': 'aa', 'iː': 'ee', j: 'y' },
    grammar: g({ order: 'SOV', adj: 'before', def: 'none', indef: 'none', plural: 'suffix', poss: 'prefix', gender: 2, genderKind: 'animacy', tense: 'prefix', agree: true }),
    forms: { plural: 'ak', poss: 'o' },
    masc: ['ok', 'an', 'is', 'aw', 'ee'], fem: ['a', 'ee', 'ah', 'wa', 'ka'],
    demonym: ['ee', 'ic', 'an'],
    seeds: {},
  },
  highland: {
    id: 'highland', after: 'Quechua and Aymara',
    C: { p: 3, t: 4, k: 5, q: 3, tʃ: 3, s: 4, ʃ: 1, h: 2, m: 4, n: 4, ɲ: 1, l: 2, ʎ: 1.5, r: 3, w: 3, j: 3 },
    V: { a: 7, i: 4, u: 5 },
    syl: { CV: 6, CVC: 4, V: 0.6 },
    onsets: [],
    codas: [],
    finals: ['n', 'j', 's', 'q', 'k', 'r'],
    roots: [2, 3], stress: 'penultimate',
    spell: { ɲ: 'ñ', ʎ: 'll', tʃ: 'ch', ʃ: 'sh', j: 'y', w: 'hu' },
    rules: [['^hu(?=[aeiou])', 'w', 'initial /w/ before a vowel is written w']],
    grammar: g({ order: 'SOV', adj: 'before', def: 'none', indef: 'none', plural: 'suffix', poss: 'suffix', tense: 'suffix', adposition: 'post', agree: true }),
    forms: { plural: 'kuna', poss: 'pa', past: 'rqa' },
    masc: ['c', 'pa', 'ac', 'ui', 'ru'], fem: ['a', 'lla', 'ya', 'sa', 'cha'],
    demonym: ['an', 'ian', 'ine'],
    seeds: {},
  },
};
