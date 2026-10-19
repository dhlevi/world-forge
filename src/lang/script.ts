import { hashString, mulberry32, type Rng } from '../gen/rng';
import type { Language } from './language';
import { CONS, VOW, isVowel } from './phonemes';
import { numberSystem } from './numbers';

/**
 * Writing systems. Every language has a script, chosen from its template (Nordic runes, Celtic
 * ogham, a Latin-like alphabet, Tengwar-like elvish letters ordered by series and grade, a
 * flowing right-to-left abjad, a square Phags-pa-like script stacked in columns,
 * a Sanskrit-like abugida hanging from its headline, kana-like brush syllables, Sinic-like
 * characters built from radicals, Hangul-like syllable blocks whose letters show where the sound
 * is made, Maya-like glyph blocks, or cuneiform wedges pressed in clay), with drift sometimes
 * giving a people another kind. The glyphs are generated from the language's seed, one for each
 * of its sounds (or syllables, or letter parts), and words are written from their sounds.
 *
 * Glyphs are lists of strokes in a box 100 high (and `w` wide), drawn as SVG.
 */

export type ScriptStyle = 'runes' | 'ogham' | 'latin' | 'elvish' | 'abjad' | 'devanagari' | 'kana' | 'hanzi' | 'hangul' | 'glyphs' | 'cuneiform' | 'phagspa';
export type ScriptKind = 'alphabet' | 'abjad' | 'abugida' | 'syllabary' | 'logosyllabary' | 'featural';

/** line: a polyline [x0, y0, x1, y1, ...]; quad: [x0, y0, cx, cy, x1, y1]; circ: an outlined circle [cx, cy, r]; dot: a filled circle; poly: a filled polygon. */
type Prim = { k: 'line' | 'quad' | 'circ' | 'dot' | 'poly'; p: number[] };
export interface Glyph {
  prims: Prim[];
  /** Advance width (the box is 100 high). */
  w: number;
  /** Extra space before it (a syllable break within a word), in the same units. */
  gap?: number;
  /** Joined to the glyph before it in a column (the letters of a stacked syllable). */
  join?: boolean;
}

/**
 * How numbers are written: positional (a digit for each place, and a sign for an empty place),
 * additive (signs for one, five and each power, repeated as needed, as Roman numerals), or
 * multiplicative (a digit before the sign of each power, as Chinese numerals).
 */
export type NumeralKind = 'positional' | 'additive' | 'multiplicative';
export interface NumeralInfo {
  kind: NumeralKind;
  base: number;
  /** Digits built from bars or wedges counting this many (5 or 10), 0 for one sign per digit. */
  group: number;
  /** For the culture window. */
  note: string;
}

export interface ScriptInfo {
  style: ScriptStyle;
  kind: ScriptKind;
  /** ttb: columns from the top down, running right to left; ttbl: running left to right. */
  direction: 'ltr' | 'rtl' | 'ttb' | 'ttbl';
  /** English description of the kind ("an alphabet of runes"). */
  label: string;
  /** How it works, for the culture window. */
  notes: string[];
  ink: string;
  paper: string;
  stroke: number;
}

const STYLE_OF: Record<string, ScriptStyle> = {
  anglo: 'latin', german: 'latin', latin: 'latin', southern: 'latin', slavic: 'latin', halfling: 'latin', sahelian: 'abjad',
  norse: 'runes', dwarven: 'runes', orcish: 'runes', steppe: 'runes', celtic: 'ogham', elvish: 'elvish',
  desert: 'abjad', zanji: 'abjad', indic: 'devanagari', sinic: 'hanzi', japonic: 'kana', koreanic: 'hangul',
  jungle: 'glyphs', highland: 'glyphs', islander: 'kana', woodland: 'kana', lizardfolk: 'cuneiform',
};
/** Peoples of these templates now and then write in Tengwar-like letters instead. */
const TENGWAR_SOMETIMES = new Set(['anglo', 'german', 'latin', 'southern', 'slavic', 'celtic', 'norse']);
const KIND: Record<ScriptStyle, ScriptKind> = {
  runes: 'alphabet', ogham: 'alphabet', latin: 'alphabet', elvish: 'abugida', abjad: 'abjad', devanagari: 'abugida', kana: 'syllabary', hanzi: 'logosyllabary',
  hangul: 'featural', glyphs: 'syllabary', cuneiform: 'syllabary', phagspa: 'abugida',
};
const LABEL: Record<ScriptStyle, string> = {
  runes: 'an alphabet of runes, cut in straight strokes for wood and stone', ogham: 'an alphabet of notches and strokes along a stem line, cut on the edges of standing stones',
  latin: 'an alphabet of rounded letters, written with a pen', elvish: 'Tengwar-like letters of stems and bows, ordered in series by where each sound is made and in grades by how it is made',
  phagspa: 'a square script of blocky letters, written in columns from the top down, each syllable a stack of joined letters',
  abjad: 'a flowing abjad, its letters joined along the line, written from right to left; short vowels are not written',
  devanagari: 'an abugida hanging from a headline: each letter carries a vowel unless a mark changes or silences it',
  kana: 'a syllabary of brush strokes, one sign for each syllable', hanzi: 'characters built from radicals, one for each syllable, written in columns',
  hangul: 'an alphabet written in syllable blocks, its letters drawn from the shape of the mouth', glyphs: 'glyph blocks carved in stone, one for each syllable',
  cuneiform: 'wedges pressed into clay with a reed, one sign for each syllable',
};
const LOOK: Record<ScriptStyle, { ink: string; paper: string; stroke: number }> = {
  runes: { ink: '#2b2420', paper: '#f3ead3', stroke: 6 }, ogham: { ink: '#2b2420', paper: '#f3ead3', stroke: 6 }, latin: { ink: '#2b2420', paper: '#f3ead3', stroke: 6 },
  elvish: { ink: '#2b2420', paper: '#f3ead3', stroke: 5 }, phagspa: { ink: '#2b2420', paper: '#f3ead3', stroke: 5.5 }, abjad: { ink: '#2b2420', paper: '#f3ead3', stroke: 6 }, devanagari: { ink: '#2b2420', paper: '#f3ead3', stroke: 6 },
  kana: { ink: '#1f1a17', paper: '#f5efe2', stroke: 8 }, hanzi: { ink: '#1f1a17', paper: '#f5efe2', stroke: 6 }, hangul: { ink: '#1f1a17', paper: '#f5efe2', stroke: 6 },
  glyphs: { ink: '#3d3328', paper: '#ddd3bf', stroke: 4 }, cuneiform: { ink: '#4b3a2a', paper: '#d7b98d', stroke: 3 },
};

const PLACE_ORDER_S = ['dental', 'alveolar', 'postalveolar', 'retroflex', 'bilabial', 'labiodental', 'alveolo-palatal', 'palatal', 'velar', 'uvular', 'pharyngeal', 'glottal'];
const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];
const DIGIT_EN = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const L_ = (...p: number[]): Prim => ({ k: 'line', p });
const Q_ = (...p: number[]): Prim => ({ k: 'quad', p });
const C_ = (...p: number[]): Prim => ({ k: 'circ', p });
const D_ = (...p: number[]): Prim => ({ k: 'dot', p });
const P_ = (...p: number[]): Prim => ({ k: 'poly', p });

/** Latin-like letter bodies on the x-height (40 to 100), and the marks that tell them apart. */
const LT_BODIES: Prim[][] = [
  [C_(28, 72, 24)],
  [Q_(48, 52, -2, 72, 48, 94)],
  [Q_(8, 52, 58, 72, 8, 94)],
  [L_(8, 100, 8, 46), Q_(8, 62, 28, 30, 48, 62), L_(48, 62, 48, 100)],
  [L_(8, 46, 8, 78), Q_(8, 78, 28, 112, 48, 78), L_(48, 78, 48, 46)],
  [L_(6, 46, 28, 100, 50, 46)],
  [L_(6, 100, 28, 46, 50, 100)],
  [L_(6, 46, 50, 100), L_(50, 46, 6, 100)],
  [Q_(48, 48, 2, 46, 26, 70), Q_(26, 70, 52, 96, 6, 96)],
  [L_(8, 46, 48, 46, 8, 100, 48, 100)],
  [L_(30, 46, 30, 86), Q_(30, 86, 30, 104, 8, 96)],
  [L_(10, 100, 10, 46, 46, 46)],
  [L_(10, 100, 10, 46, 44, 60, 10, 74)],
  [L_(8, 72, 48, 72), Q_(48, 72, 44, 42, 20, 48), Q_(20, 48, 2, 62, 10, 86), Q_(10, 86, 22, 102, 46, 94)],
];
/** Bodies round and small enough for vowels. */
const LT_ROUND = new Set([0, 1, 2, 4, 5, 6, 13]);
const LT_MARKS: Prim[][] = [[], [L_(8, 6, 8, 50)], [L_(48, 96, 48, 128)], [L_(2, 72, 54, 72)], [D_(28, 26, 4.5)], [Q_(46, 98, 56, 106, 62, 92)]];

/** Abjad skeletons on the joining line (y 80), each drawn about its middle `m`. */
const AB_SKEL: { w: number; draw: (m: number) => Prim[] }[] = [
  { w: 30, draw: (m) => [L_(m, 80, m, 58)] },
  { w: 44, draw: (m) => [L_(m - 12, 80, m - 12, 64), L_(m, 80, m, 64), L_(m + 12, 80, m + 12, 64)] },
  { w: 22, draw: (m) => [L_(m, 80, m + 1, 16)] },
  { w: 32, draw: (m) => [C_(m, 67, 11)] },
  { w: 40, draw: (m) => [Q_(m + 18, 80, m, 110, m - 18, 82)] },
  { w: 36, draw: (m) => [Q_(m - 10, 80, m - 12, 50, m + 12, 56)] },
  { w: 30, draw: (m) => [Q_(m + 6, 80, m + 6, 98, m - 14, 104)] },
  { w: 30, draw: (m) => [L_(m - 6, 60, m + 6, 72, m - 4, 80)] },
  { w: 46, draw: (m) => [Q_(m - 16, 80, m - 2, 56, m + 18, 70), L_(m + 18, 70, m + 12, 80)] },
  { w: 40, draw: (m) => [L_(m - 8, 80, m - 8, 20), Q_(m - 8, 76, m + 14, 52, m + 16, 80)] },
  { w: 30, draw: (m) => [Q_(m + 10, 58, m - 10, 52, m - 4, 68), L_(m - 4, 68, m + 6, 80)] },
  { w: 28, draw: (m) => [C_(m, 88, 7)] },
  { w: 40, draw: (m) => [C_(m + 8, 66, 9), Q_(m + 16, 76, m, 112, m - 16, 86)] },
  { w: 36, draw: (m) => [L_(m - 8, 80, m - 8, 24), L_(m - 8, 52, m + 10, 40)] },
];
/** Dot patterns: positions 1-3 (positive above the line, negative below). */
const AB_DOTS: number[][] = [[], [1], [1, 2], [1, 2, 3], [-1], [-1, -2], [-1, -2, -3]];
/** Combinations kept for the long vowels (the tall stroke alone; the bowl with two dots below). */
const AB_RESERVED = { alif: 2 * AB_DOTS.length, ya: 4 * AB_DOTS.length + 5 };

/** Scripts that write positional digits with pen-made figures. */
const ALPHA_DIGITS = new Set(['abjad', 'latin', 'elvish', 'devanagari']);
/** Digit forms: Eastern-Arabic-like for the abjad, and pen-written ones for the other alphabets (in a box about 50 wide). */
const DIGIT_FORMS: Record<'abjad' | 'pen', Prim[][]> = {
  abjad: [
    [Q_(24, 12, 20, 52, 26, 90)],
    [Q_(22, 90, 20, 50, 22, 26), Q_(22, 26, 30, 12, 42, 18)],
    [Q_(22, 90, 20, 50, 22, 28), Q_(22, 28, 26, 16, 32, 22), Q_(32, 22, 36, 12, 44, 18)],
    [Q_(40, 14, 12, 22, 28, 38), Q_(28, 38, 10, 50, 40, 64)],
    [Q_(25, 40, 4, 62, 25, 76), Q_(25, 76, 46, 62, 25, 40)],
    [Q_(12, 14, 38, 20, 34, 90)],
    [L_(10, 14, 25, 90, 40, 14)],
    [L_(10, 90, 25, 14, 40, 90)],
    [C_(22, 26, 10), Q_(30, 32, 32, 60, 26, 90)],
    [L_(26, 12, 26, 78), Q_(26, 78, 24, 92, 10, 86)],
    [L_(12, 22, 38, 22, 20, 90)],
    [C_(25, 30, 9), C_(25, 64, 13)],
  ],
  pen: [
    [L_(26, 12, 26, 90)],
    [L_(14, 26, 28, 12, 28, 90), L_(14, 90, 42, 90)],
    [Q_(10, 26, 30, 2, 40, 30), Q_(40, 30, 40, 52, 10, 90), L_(10, 90, 42, 90)],
    [Q_(10, 18, 44, 10, 26, 46), Q_(26, 46, 52, 64, 12, 88)],
    [L_(34, 90, 34, 12, 8, 64, 44, 64)],
    [L_(40, 12, 14, 12, 12, 46), Q_(12, 46, 50, 36, 38, 80), Q_(38, 80, 26, 94, 10, 84)],
    [Q_(38, 14, 6, 34, 14, 70), C_(26, 72, 14)],
    [L_(8, 12, 42, 12, 18, 90)],
    [C_(26, 32, 12), C_(26, 70, 16)],
    [C_(26, 32, 14), Q_(40, 34, 40, 70, 18, 90)],
    [L_(10, 12, 40, 12, 10, 90, 40, 90)],
    [Q_(40, 16, 6, 18, 26, 48), Q_(26, 48, 46, 78, 8, 88)],
    [L_(26, 12, 26, 90), L_(10, 46, 42, 46)],
    [L_(10, 12, 26, 52, 42, 12), L_(26, 52, 26, 90)],
  ],
};

/**
 * A pen-written figure that owes nothing to our own digits. Quadrant figures (after the old
 * monks' ciphers): an upright stem with marks off its top on one side, a bar (1), a lower bar (2),
 * a falling stroke (3), a rising stroke (4), a side stroke (6), and their sums (5 = 1 + 4, 7 = 6 + 1,
 * 8 = 6 + 2, 9 = 6 + 1 + 2). Zigzag figures (after a counting of fives and ones): a bar for five
 * across the top, under it one to four strokes zigzagging down. Elvish figures are drawn curved.
 */
function penDigit(d: number, fam: { kind: 'quadrant' | 'zigzag'; left: boolean }, curved: boolean): Prim[] {
  const out: Prim[] = [];
  const line = (x0: number, y0: number, x1: number, y1: number) => out.push(curved ? Q_(x0, y0, (x0 + x1) / 2 + (y1 - y0) * 0.12, (y0 + y1) / 2 - (x1 - x0) * 0.12, x1, y1) : L_(x0, y0, x1, y1));
  if (fam.kind === 'quadrant') {
    const sx = fam.left ? 40 : 14, s = fam.left ? -1 : 1, ex = sx + s * 26;
    line(sx, 12, sx, 92);
    const has = (k: number) => ({ 1: [1], 2: [2], 3: [3], 4: [4], 5: [1, 4], 6: [6], 7: [6, 1], 8: [6, 2], 9: [6, 1, 2] } as Record<number, number[]>)[d]?.includes(k);
    if (has(1)) line(sx, 12, ex, 12);
    if (has(2)) line(sx, 38, ex, 38);
    if (has(3)) line(sx, 12, ex, 38);
    if (has(4)) line(sx, 38, ex, 12);
    if (has(6)) line(ex, 12, ex, 38);
    return out;
  }
  const fives = Math.floor(d / 5), ones = d % 5;
  for (let k = 0; k < fives; k++) line(8, 12 + k * 10, 44, 12 + k * 10);
  const y0 = 12 + fives * 10 + (fives ? 6 : 0);
  if (!ones) {
    if (fives) line(26, y0 - 6, 26, 90);
    return out;
  }
  // The ones zigzag down from the top left: \ then / then \ then /.
  const n = ones, step = (90 - y0) / n;
  let x = 10, y = y0;
  for (let k = 0; k < n; k++) {
    const nx = k % 2 ? 10 : 42;
    line(x, y, nx, y + step);
    x = nx;
    y += step;
  }
  return out;
}

/** Parts of Phags-pa-like letters, in a box 60 wide: heads, bodies hanging from them, feet. */
const PH_HEADS: Prim[][] = [
  [L_(4, 8, 56, 8)],
  [L_(4, 20, 4, 8, 56, 8)],
  [L_(4, 20, 4, 8, 56, 8, 56, 20)],
  [L_(16, 2, 44, 2), L_(4, 12, 56, 12)],
];
const PH_BODIES: Prim[][] = [
  [L_(30, 8, 30, 30, 56, 30, 56, 52, 4, 52, 4, 74, 56, 74)],
  [L_(30, 8, 30, 30, 4, 30, 4, 52, 56, 52, 56, 74, 4, 74)],
  [L_(4, 8, 4, 74, 56, 74), L_(4, 41, 46, 41)],
  [L_(56, 8, 56, 74, 4, 74), L_(56, 41, 14, 41)],
  [L_(30, 8, 30, 34), L_(10, 34, 50, 34, 50, 70, 10, 70, 10, 34)],
  [L_(30, 8, 30, 80), L_(12, 36, 48, 36, 48, 60, 12, 60, 12, 36)],
  [L_(30, 8, 30, 62, 52, 62, 52, 40)],
  [L_(14, 8, 14, 74), L_(46, 8, 46, 74), L_(14, 41, 46, 41)],
  [L_(30, 8, 30, 24, 56, 24, 56, 74, 4, 74, 4, 40, 40, 40, 40, 58)],
  [L_(30, 8, 30, 26, 4, 26, 4, 50, 56, 50, 56, 74)],
  [L_(4, 8, 4, 40, 56, 40, 56, 74), L_(30, 40, 30, 74)],
  [L_(30, 8, 30, 74), L_(30, 30, 52, 30), L_(30, 54, 8, 54)],
];
const PH_FEET: Prim[][] = [[], [L_(4, 92, 56, 92)], [L_(30, 74, 30, 92, 12, 92)], [L_(30, 74, 30, 92, 48, 92)]];
/** Moves and scales primitives (radii scale with the smaller factor). */
function tf(prims: Prim[], sx: number, sy: number, tx: number, ty: number): Prim[] {
  const sr = Math.min(sx, sy);
  return prims.map((q) => ({
    k: q.k,
    p: q.k === 'circ' || q.k === 'dot' ? [q.p[0] * sx + tx, q.p[1] * sy + ty, q.p[2] * sr] : q.p.map((v, i) => (i % 2 ? v * sy + ty : v * sx + tx)),
  }));
}
const sig = (prims: Prim[]) => [...new Set(prims.map((q) => `${q.k}${q.p.map((v) => Math.round(v / 4)).join(',')}`))].sort().join('|');

/**
 * A language's script: which kind, and its glyphs (made on demand from the language's seed and
 * kept, so the same sound is always written the same way).
 */
export class Script {
  readonly info: ScriptInfo;
  private readonly cache = new Map<string, Glyph>();
  private readonly used = new Set<string>();
  readonly seed: number;

  constructor(readonly L: Language, force?: ScriptStyle) {
    this.seed = hashString(`script#${L.key}`);
    const r = mulberry32(this.seed);
    let style = STYLE_OF[L.t.id] ?? 'latin';
    // Halflings keep elvish letters; steppe peoples write runes or a square script; some human
    // peoples took up elvish letters (on a stream of its own, so other scripts are unchanged).
    const rx = mulberry32(hashString(`script-extra#${L.key}`));
    const x1 = rx(), x2 = rx();
    this.tengMode = x2 < (L.t.id === 'elvish' || L.t.id === 'halfling' ? 0.7 : 0.25) ? 'tehta' : 'full';
    if (L.t.id === 'halfling') style = 'elvish';
    else if (L.t.id === 'steppe' && x1 < 0.5) style = 'phagspa';
    else if (TENGWAR_SOMETIMES.has(L.t.id) && x1 < 0.12) style = 'elvish';
    // A drifting people may have taken up another kind of writing.
    if (r() < L.drift * 0.4) style = pick(r, Object.keys(KIND) as ScriptStyle[]);
    if (force) style = force;
    const direction = style === 'phagspa' ? 'ttbl' : style === 'abjad' ? 'rtl' : style === 'hanzi' || (style === 'kana' && r() < 0.5) ? 'ttb' : style === 'runes' && r() < 0.2 ? 'rtl' : 'ltr';
    const kind = KIND[style];
    const notes: string[] = [];
    if (style === 'devanagari') notes.push(`Every consonant carries the vowel ${this.inherentSpell()} unless a mark gives it another; a stroke beneath silences it.`);
    if (style === 'elvish') {
      notes.push('Each letter is a stem and one or two bows. The bow shows where the sound is made: open for the teeth, closed for the lips, hanging for the back of the mouth, hanging and closed for the throat. The stem shows how: lowered for stops, raised for hissing and breathy sounds, short for nasals and glides; a doubled bow makes the sound voiced. R, l, s and h have letters of their own.');
      notes.push(this.tengMode === 'tehta' ? 'Each vowel is a mark above the consonant before it, or above a carrier where no consonant comes first (a short carrier for a short vowel, a long one for a long vowel).' : 'Vowels are written as letters of their own, in full.');
    }
    if (style === 'phagspa') notes.push('The vowel a after a consonant is not written; every other vowel is a letter. The letters of a syllable are joined top to bottom into one stack, and syllables stand apart.');
    if (style === 'abjad') notes.push('Only consonants and long vowels are written, and a vowel that begins a word stands on a carrier stroke.');
    if (kind === 'syllabary' || kind === 'logosyllabary') notes.push('A consonant with no vowel of its own (a cluster, or a closing consonant) takes a sign of its own.');
    if (style === 'hangul') notes.push('Consonants are drawn from where they are made: a lip-box for sounds made with the lips, an angle for those at the back of the mouth, a corner for the tongue tip, a roof for hissing sounds, a ring for the throat, with strokes added for each other manner. Vowels are long bars with short ticks.');
    if (style === 'ogham') notes.push('The letters are groups of one to five strokes on one side of the stem, on the other, across it, or as notches on it for the vowels.');
    if (direction === 'ttb') notes.push('It is written in columns, from the top down, the columns running from right to left.');
    else if (direction === 'ttbl') notes.push('It is written in columns, from the top down, the columns running from left to right.');
    else if (direction === 'rtl') notes.push('It is written from right to left.');
    this.info = { style, kind, direction, label: LABEL[style], notes, ...LOOK[style] };
  }

  /** Tengwar-like writing: vowels as marks over the consonants (tehta), or as letters (full). */
  private tengMode: 'tehta' | 'full' = 'tehta';

  private inherentSpell(): string {
    return this.L.vowels[0]?.spell ?? 'a';
  }
  private get inherent(): string {
    return this.L.vowels.find((v) => v.ipa === 'a')?.ipa ?? this.L.vowels[0]?.ipa ?? 'a';
  }
  private rng(key: string): Rng {
    return mulberry32(this.seed ^ hashString(key));
  }
  /** A glyph made once for a key and kept; tries again until it differs from every other. */
  private make(key: string, gen: (r: Rng, t: number) => Glyph): Glyph {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const r = this.rng(key);
    let g = gen(r, 0);
    for (let t = 1; t < 30 && this.used.has(sig(g.prims)); t++) g = gen(r, t);
    this.used.add(sig(g.prims));
    this.cache.set(key, g);
    return g;
  }

  // ---- Glyph makers ------------------------------------------------------------------------------

  private rune(key: string, vowel: boolean): Glyph {
    return this.make(`rune:${key}`, (r) => {
      const xs = [8, 30, 52], ys = [0, 25, 50, 75, 100];
      const prims: Prim[] = [];
      const two = r() < 0.12, none = !two && r() < 0.08;
      if (two) prims.push(L_(8, 0, 8, 100), L_(52, 0, 52, 100));
      else if (!none) prims.push(L_(30, 0, 30, 100));
      const n = none ? 2 + Math.floor(r() * 2) : vowel ? 1 : 1 + Math.floor(r() * 2.2);
      for (let k = 0; k < n; k++) {
        const ax = two ? pick(r, [0, 2]) : none ? Math.floor(r() * 3) : 1, ay = Math.floor(r() * 5);
        let bx = Math.floor(r() * 3);
        if (bx === ax) bx = ax === 1 ? pick(r, [0, 2]) : 1;
        const by = Math.max(0, Math.min(4, ay + pick(r, [-1, 1, -2, 2, 0])));
        prims.push(L_(xs[ax], ys[ay], xs[bx], ys[by]));
      }
      return { prims, w: 66 };
    });
  }

  private oghamIndex = new Map<string, number>();
  private ogham(key: string, vowel: boolean): Glyph {
    let i = this.oghamIndex.get(key);
    if (i === undefined) {
      i = [...this.oghamIndex.values()].filter((v) => (v >= 100) === vowel).length + (vowel ? 100 : 0);
      this.oghamIndex.set(key, i);
    }
    const grp = vowel ? 3 : (i % 15) / 5 | 0, n = 1 + ((vowel ? i - 100 : i) % 5), extra = (vowel ? i - 100 : i) >= (vowel ? 5 : 15);
    const prims: Prim[] = [];
    for (let q = 0; q < n; q++) {
      const x = 10 + q * 12;
      if (grp === 0) prims.push(L_(x, 50, x, 18));
      else if (grp === 1) prims.push(L_(x, 50, x, 82));
      else if (grp === 2) prims.push(L_(x - 6, 82, x + 6, 18));
      else prims.push(L_(x, 42, x, 58));
    }
    if (extra) prims.push(D_(10 + n * 12, vowel ? 50 : 30, 4));
    return { prims, w: 14 + n * 12 + (extra ? 10 : 0) };
  }

  /**
   * A Latin-like letter: a body on the x-height (a ring, an open curve either way, an arch, a cup,
   * a v, a caret, a cross, an s, a z, a hook, an angle, a flag or an e) with a mark of its own
   * (none, an ascender, a descender, a crossbar, a dot or a tail). Every sound gets its own
   * combination, dealt from a shuffled order of the script's own; vowels keep to the plainer
   * marks, so they stay small and round as vowels do.
   */
  private latinMap: Map<string, number> | null = null;
  private latin(key: string, vowel: boolean): Glyph {
    const hit = this.cache.get(`latin:${key}`);
    if (hit) return hit;
    const nm = LT_MARKS.length;
    if (!this.latinMap) {
      const r = this.rng('latin-order');
      const all = Array.from({ length: LT_BODIES.length * nm }, (_, i) => i).sort(() => r() - 0.5);
      const plain = all.filter((c) => [0, 3, 4].includes(c % nm) && LT_ROUND.has(Math.floor(c / nm)));
      this.latinMap = new Map();
      const used = new Set<number>();
      const vows = this.L.vowels.map((v) => v.ipa).sort(), cons = this.L.consonants.map((c) => c.ipa).sort();
      for (const v of vows) {
        const c = plain.find((x) => !used.has(x)) ?? all.find((x) => !used.has(x))!;
        used.add(c);
        this.latinMap.set(v, c);
      }
      for (const k of cons) {
        const c = all.find((x) => !used.has(x))!;
        used.add(c);
        this.latinMap.set(k, c);
      }
    }
    let combo = this.latinMap.get(key);
    if (combo === undefined) combo = hashString(key) % (LT_BODIES.length * nm);
    void vowel;
    const g = { prims: [...LT_BODIES[Math.floor(combo / nm)], ...LT_MARKS[combo % nm]], w: 56 };
    this.cache.set(`latin:${key}`, g);
    return g;
  }


  /** Elvish consonant: a stem (short, rising or falling) with one or two bows. */
  /**
   * A Tengwar-like letter for a consonant, built from its features: the series (the bow) from
   * where the sound is made, the grade (the stem, and one bow or two) from how. Liquids, sibilants
   * and h have letters of their own.
   */
  private tengwa(ipa: string): Glyph {
    return this.make(`teng:${ipa}`, (r, t) => {
      const c = CONS.get(ipa);
      const prims: Prim[] = [];
      if (!c) return { prims: [L_(12, 40, 12, 100), Q_(12, 46, 64, 71, 12, 96)], w: 46 };
      const { place, manner, voiced } = c;
      // Letters of their own.
      if (manner === 'trill' || manner === 'tap') return { prims: [L_(14, 100, 14, 56), Q_(14, 56, 20, 40, 36, 44), Q_(36, 44, 50, 52, 40, 66)], w: 50 };
      if (manner.startsWith('lateral')) return { prims: [Q_(46, 44, -2, 58, 26, 100), ...(manner === 'lateral fricative' ? [L_(30, 64, 46, 64)] : [])], w: 50 };
      const sib = manner === 'fricative' && ['alveolar', 'postalveolar', 'retroflex', 'alveolo-palatal'].includes(place);
      if (sib) {
        const flip = voiced;
        const y = (v: number) => (flip ? 140 - v : v);
        const out: Prim[] = [C_(32, y(58), 11), Q_(22, y(64), 6, y(98), 46, y(98))];
        if (place !== 'alveolar') out.push(D_(30, y(116), 4));
        return { prims: out, w: 52 };
      }
      if (place === 'glottal' && manner === 'fricative') return { prims: [L_(12, 2, 12, 100), Q_(12, 58, 46, 40, 46, 76), L_(46, 76, 46, 100)], w: 56 };
      const series = place === 'bilabial' || place === 'labiodental' ? 2 : ['dental', 'alveolar', 'postalveolar', 'retroflex'].includes(place) && manner !== 'affricate' ? 1 : ['uvular', 'pharyngeal', 'glottal'].includes(place) ? 4 : 3;
      const stem = manner === 'plosive' || manner === 'affricate' ? 'down' : manner === 'fricative' ? 'up' : 'short';
      const double = manner === 'nasal' || (voiced && (manner === 'plosive' || manner === 'affricate' || manner === 'fricative'));
      prims.push(stem === 'down' ? L_(12, 40, 12, 124) : stem === 'up' ? L_(12, 0, 12, 100) : L_(12, 40, 12, 100));
      const bow = (x: number) => {
        if (series === 1) prims.push(Q_(x, 46, x + 52, 70, x + 12, 98));
        else if (series === 2) prims.push(Q_(x, 46, x + 52, 71, x, 96));
        else if (series === 3) prims.push(Q_(x, 46, x + 40, 34, x + 30, 86));
        else prims.push(Q_(x, 46, x + 40, 34, x + 30, 86), L_(x + 30, 86, x, 86));
      };
      bow(12);
      if (double) bow(series >= 3 ? 34 : 31);
      // An affricate keeps its stop's letter with a small bar through the stem.
      if (manner === 'affricate') prims.push(L_(4, 112, 20, 112));
      // Glides take a tick on the stem.
      if (manner === 'approximant') prims.push(L_(12, 40, 4, 32));
      if (t > 0) prims.push(D_(12 + 8 * t, 30, 3));
      return { prims, w: double ? 70 : 48 };
    });
  }
  /** A vowel written as a letter of its own (full mode), by its height and backness. */
  private tengVowel(v: string): Glyph {
    const ph = VOW.get(v);
    const front = ph?.back === 'front', back = ph?.back === 'back';
    const high = ph?.height.includes('close') ?? false, low = ph?.height.includes('open') ?? false;
    const prims: Prim[] = [];
    if (low) prims.push(Q_(10, 46, 42, 71, 10, 96), Q_(26, 46, 58, 71, 26, 96));
    else if (high && front) prims.push(L_(14, 50, 14, 100), D_(14, 36, 4));
    else if (high) prims.push(Q_(40, 46, 0, 50, 10, 80), Q_(10, 80, 18, 100, 44, 96));
    else if (front) prims.push(L_(10, 50, 40, 50), Q_(40, 50, 44, 76, 14, 98));
    else if (back) prims.push(C_(26, 72, 18));
    else prims.push(Q_(10, 50, 26, 30, 42, 50), L_(26, 44, 26, 100));
    if (ph?.long) prims.push(L_(6, 30, 46, 30));
    if (ph?.rounded && !back) prims.push(D_(44, 34, 3.5));
    return { prims, w: low ? 66 : 52 };
  }

  /**
   * Phags-pa-like letters, put together as the real ones are: a head (a bar across the top, with
   * a tick down at one end or both, or doubled), a body hanging from it (a squared meander, a
   * comb, a box, a stem through a box, a hooked stem, two legs, a squared spiral...) and a foot
   * (none, a bar, or the stem turning left or right). Every letter of the language gets its own
   * combination, so no two are alike; the combinations are dealt out in a shuffled order of the
   * script's own, sounds first (in a fixed order), then digits.
   */
  private phagsMap: Map<string, number> | null = null;
  private phagsCombo(key: string): number {
    const TOTAL = PH_HEADS.length * PH_BODIES.length * PH_FEET.length;
    if (!this.phagsMap) {
      const r = this.rng('phags-order');
      const order = Array.from({ length: TOTAL }, (_, i) => i).sort(() => r() - 0.5);
      this.phagsMap = new Map();
      const keys = [...this.L.consonants.map((c) => c.ipa), ...this.L.vowels.map((v) => v.ipa)].sort();
      keys.forEach((k, i) => this.phagsMap!.set(k, order[i]));
      for (let d = 0; d < 12; d++) this.phagsMap.set(`#${d}`, order[keys.length + d]);
      this.phagsUsed = new Set(this.phagsMap.values());
      this.phagsOrder = order;
    }
    let c = this.phagsMap.get(key);
    if (c === undefined) {
      // A sound outside the inventory (a borrowing): the next free combination.
      c = this.phagsOrder.find((x) => !this.phagsUsed.has(x)) ?? hashString(key) % TOTAL;
      this.phagsUsed.add(c);
      this.phagsMap.set(key, c);
    }
    return c;
  }
  private phagsUsed = new Set<number>();
  private phagsOrder: number[] = [];
  private phags(key: string): Glyph {
    const hit = this.cache.get(`phg:${key}`);
    if (hit) return hit;
    const c = this.phagsCombo(key);
    const nb = PH_BODIES.length, nf = PH_FEET.length;
    const h = Math.floor(c / (nb * nf)), b = Math.floor(c / nf) % nb, f = c % nf;
    const g = { prims: [...PH_HEADS[h], ...PH_BODIES[b], ...PH_FEET[f]], w: 60 };
    this.cache.set(`phg:${key}`, g);
    return g;
  }




  private tehta(v: string): Prim[] {
    const r = this.rng(`tehta:${v}`);
    const kinds = ['dot', 'dots2', 'dots3', 'acute', 'circumflex', 'curl', 'ring', 'tilde'];
    const order = this.L.vowels.map((x) => x.ipa);
    const t = kinds[(order.indexOf(v) + Math.floor(r() * 0)) % kinds.length] ?? 'dot';
    switch (t) {
      case 'dot': return [D_(24, 22, 5)];
      case 'dots2': return [D_(16, 22, 5), D_(32, 22, 5)];
      case 'dots3': return [D_(14, 26, 4), D_(24, 16, 4), D_(34, 26, 4)];
      case 'acute': return [L_(16, 30, 32, 12)];
      case 'circumflex': return [L_(12, 30, 24, 14, 36, 30)];
      case 'curl': return [Q_(12, 28, 24, 8, 36, 26)];
      case 'ring': return [C_(24, 20, 7)];
      default: return [Q_(10, 24, 18, 12, 24, 22), Q_(24, 22, 30, 32, 38, 18)];
    }
  }

  /**
   * An abjad letter, made as Arabic letters are: a skeleton on the joining line (a tooth, three
   * teeth, a tall stroke, a loop, a bowl, a hook, a descending tail, an angle, a long loop, a tall
   * stroke with a loop, a small open curve, a loop below, a loop with a bowl, a tall stroke with an
   * arm) told apart by dots above or below. Each sound gets its own combination, dealt from a
   * shuffled order of the script's own; long vowels take the plain tall stroke, the loop with a
   * tail and the bowl with two dots below, and the carrier a tall stroke with a small mark.
   */
  private abjadMap: Map<string, number> | null = null;
  private abjadLetter(key: string, long: boolean): Glyph {
    const hit = this.cache.get(`abj:${key}`);
    if (hit) return hit;
    if (!this.abjadMap) {
      const r = this.rng('abjad-order');
      const total = AB_SKEL.length * AB_DOTS.length;
      const reserved = new Set([AB_RESERVED.alif, AB_RESERVED.ya]);
      const order = Array.from({ length: total }, (_, i) => i).filter((i) => !reserved.has(i)).sort(() => r() - 0.5);
      // Commoner looks first: few dots, and the plain skeletons shared by several letters.
      order.sort((x, y) => AB_DOTS[x % AB_DOTS.length].length - AB_DOTS[y % AB_DOTS.length].length + (r() - 0.5) * 2.2);
      this.abjadMap = new Map();
      [...this.L.consonants.map((c) => c.ipa)].sort().forEach((k, i) => this.abjadMap!.set(k, order[i % order.length]));
      const longs = this.L.vowels.map((v) => v.ipa).filter((v) => /ː/.test(v)).sort();
      longs.forEach((v, i) => this.abjadMap!.set(v, i === 0 ? AB_RESERVED.alif : i === 1 ? -1 : i === 2 ? AB_RESERVED.ya : order[(this.L.consonants.length + i) % order.length]));
    }
    let combo = this.abjadMap.get(key);
    if (combo === undefined) combo = key === 'carrier' ? -2 : (hashString(key) % (AB_SKEL.length * AB_DOTS.length));
    let g: Glyph;
    if (combo === -2) g = { prims: [L_(0, 80, 20, 80), L_(10, 80, 12, 24), Q_(4, 18, 14, 4, 22, 14)], w: 20 };
    else if (combo === -1) g = { prims: [L_(0, 80, 28, 80), C_(16, 66, 10), Q_(10, 74, 6, 100, -6, 104)], w: 28 };
    else {
      const sk = AB_SKEL[Math.floor(combo / AB_DOTS.length)], dots = AB_DOTS[combo % AB_DOTS.length];
      const w = sk.w, m = w / 2;
      const prims: Prim[] = [L_(0, 80, w, 80), ...sk.draw(m)];
      for (const [dx, above] of dots.map((d) => [d, d >= 0] as [number, boolean])) prims.push(D_(m + (Math.abs(dx) - 1) * 9 - (dots.length - 1) * 4.5 + (Math.abs(dx) === 3 && dots.length === 3 ? -4.5 : 0), above ? (Math.abs(dx) === 3 && dots.length === 3 ? 36 : 46) : 100, 4));
      g = { prims, w };
    }
    void long;
    this.cache.set(`abj:${key}`, g);
    return g;
  }


  private deva(key: string, vowel: boolean): Glyph {
    return this.make(`deva:${key}`, (r) => {
      const w = 52 + Math.floor(r() * 14);
      const prims: Prim[] = [L_(0, 20, w, 20)];
      const bar = !vowel && r() < 0.8;
      if (bar) prims.push(L_(w - 10, 20, w - 10, 100));
      const xr = bar ? w - 10 : w - 4;
      switch (pick(r, ['loop', 'hook', 's', 'angle', 'double'])) {
        case 'loop': prims.push(Q_(xr, 52, 4, 30, 10, 62), Q_(10, 62, 20, 90, xr, 70)); break;
        case 'hook': prims.push(Q_(10, 20, 6, 60, 30, 64), Q_(30, 64, 46, 66, xr, 56)); break;
        case 's': prims.push(Q_(xr, 34, 4, 40, 22, 60), Q_(22, 60, 40, 80, 8, 96)); break;
        case 'angle': prims.push(L_(12, 20, 12, 60, xr, 60)); if (r() < 0.5) prims.push(L_(12, 60, 26, 96)); break;
        default: prims.push(C_(22, 46, 12), C_(22, 78, 12)); break;
      }
      if (vowel) prims.push(Q_(w - 10, 20, w + 4, 50, w - 14, 80));
      return { prims, w };
    });
  }
  private matra(v: string, w: number): { prims: Prim[]; w: number } {
    const order = this.L.vowels.map((x) => x.ipa).filter((x) => x !== this.inherent);
    const i = Math.max(0, order.indexOf(v));
    const k = ['bar', 'above', 'below', 'stroke', 'barAbove', 'belowHook', 'ring'][i % 7];
    switch (k) {
      case 'bar': return { prims: [L_(w + 6, 20, w + 6, 100)], w: 12 };
      case 'above': return { prims: [Q_(w - 30, 20, w - 20, -6, w - 6, 20)], w: 0 };
      case 'below': return { prims: [Q_(w - 30, 104, w - 18, 124, w - 6, 104)], w: 0 };
      case 'stroke': return { prims: [L_(w - 24, 20, w - 10, 0)], w: 0 };
      case 'barAbove': return { prims: [L_(w + 6, 20, w + 6, 100), L_(w + 6, 20, w - 6, 2)], w: 12 };
      case 'belowHook': return { prims: [L_(w - 18, 100, w - 18, 118, w - 4, 118)], w: 0 };
      default: return { prims: [C_(w - 18, 4, 7)], w: 0 };
    }
  }

  /**
   * A kana-like sign: one main stroke (a bar, an upright, a turning stroke like \u30d5, a hook like
   * \u3057, a loop like \u306e, a long sweep like \u30ce, or a cross), with one or two lesser strokes
   * (a sweep, a dot, a bar or a drop) joined to it or crossing it, sized to fill the square. Signs
   * for lone consonants are simpler.
   */
  private brush(key: string, strokes: number): Glyph {
    return this.make(`kana:${key}`, (r) => {
      const prims: Prim[] = [];
      let anchors: [number, number][] = [];
      const spine = pick(r, strokes <= 1 ? ['H', 'V', 'T', 'C', 'L', 'K', 'T'] : ['H', 'V', 'T', 'C', 'O', 'L', 'X', 'T', 'V', 'K', 'A', 'L', 'C', 'K', 'A']);
      const j = () => (r() - 0.5) * 10;
      switch (spine) {
        case 'H': prims.push(L_(16, 46 + j(), 84, 42 + j())); anchors = [[24, 46], [50, 44], [76, 43]]; break;
        case 'V': {
          const x = 46 + j();
          prims.push(L_(x, 12, x + 2, 84));
          if (r() < 0.5) prims.push(L_(x + 2, 84, x - 8, 74));
          anchors = [[x, 22], [x + 1, 48], [x + 2, 72]];
          break;
        }
        case 'T': prims.push(L_(18, 24 + j(), 76, 20), Q_(76, 20, 74 + j(), 60, 34, 86)); anchors = [[20, 24], [48, 22], [70, 50], [50, 74]]; break;
        case 'C': prims.push(Q_(36 + j(), 14, 32, 92, 82, 62)); anchors = [[36, 26], [38, 56], [62, 70]]; break;
        case 'O': prims.push(Q_(52, 24, 54, 74, 26, 76), Q_(26, 76, 8, 32, 52, 24), Q_(52, 24, 94, 30 + j() * 2, 70 + j(), 84)); anchors = [[52, 24], [30, 60], [76, 54]]; break;
        case 'L': prims.push(Q_(68 + j(), 12, 66, 62, 20, 86)); anchors = [[64, 26], [56, 54], [36, 76]]; break;
        case 'K': prims.push(L_(66, 12, 32 + j(), 50, 68, 86)); anchors = [[52, 28], [32, 50], [52, 70]]; break;
        case 'A': prims.push(L_(16, 30 + j(), 80, 28, 72, 46)); anchors = [[30, 30], [50, 29], [72, 44]]; break;
        default: {
          const y = 36 + j();
          prims.push(L_(16, y + 2, 84, y - 2), L_(52, 12, 50, 86));
          anchors = [[30, y + 1], [52, y], [51, 62], [72, y - 1]];
        }
      }
      const extra = strokes <= 1 ? (r() < 0.5 ? 1 : 0) : 1 + (r() < 0.35 ? 1 : 0);
      const used = new Set<number>();
      for (let q = 0; q < extra; q++) {
        let k = Math.floor(r() * anchors.length);
        if (used.has(k)) k = (k + 1) % anchors.length;
        used.add(k);
        const [ax, ay] = anchors[k];
        switch (pick(r, ['sweepL', 'sweepR', 'dot', 'bar', 'drop', 'sweepL', 'dot'].filter((x) => !(spine === 'V' && x === 'drop') && !(spine === 'O' && (x === 'dot' || x === 'drop')) && !(spine === 'H' && x === 'bar')))) {
          case 'sweepL': prims.push(Q_(ax, ay, ax - 4, ay + 22, ax - 26, ay + 32)); break;
          case 'sweepR': prims.push(Q_(ax, ay, ax + 6, ay + 18, ax + 26, ay + 28)); break;
          case 'dot': prims.push(L_(ax + 10, ay - 16, ax + 17, ay - 7)); break;
          case 'bar': prims.push(L_(ax - 22, ay + 2, ax + 22, ay - 2)); break;
          default: prims.push(L_(ax, ay, ax - 1, ay + 30)); break;
        }
      }
      // Fit the sign to the square, keeping its proportions.
      const xs = prims.flatMap((p) => p.p.filter((_, i) => i % 2 === 0)), ys = prims.flatMap((p) => p.p.filter((_, i) => i % 2 === 1));
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const sc = Math.min(76 / Math.max(20, x1 - x0), 76 / Math.max(20, y1 - y0), 1.15);
      const tx = 50 - ((x0 + x1) / 2) * sc, ty = 50 - ((y0 + y1) / 2) * sc;
      return { prims: prims.map((p) => ({ k: p.k, p: p.p.map((v, i) => (i % 2 ? v * sc + ty : v * sc + tx)) })), w: 100 };
    });
  }

  private radicals: Prim[][] | null = null;
  /**
   * The script's stock of radicals: forms like those of real characters (a mouth, a sun, a tree, a
   * person, water, earth, a roof, grass, a knife, a gate, fire...), each drawn with its own slight
   * differences of proportion, plus a few of the script's own built from a bar, an upright and a
   * sweep. Every character is made of them, so the same parts recur as in a real script.
   */
  private radical(k: number): Prim[] {
    if (!this.radicals) {
      const r = this.rng('radicals');
      const j = (n = 6) => (r() - 0.5) * n;
      const forms: (() => Prim[])[] = [
        () => [L_(22, 24, 22, 80), L_(22, 24, 78, 24, 78, 80), L_(22, 78, 78, 78)],
        () => [L_(26, 12, 26, 88), L_(26, 12, 74, 12, 74, 88), L_(26, 50, 74, 50), L_(26, 86, 74, 86)],
        () => [L_(14, 34 + j(), 86, 34), L_(50, 10, 50, 92), Q_(48, 38, 36, 66, 14, 80), Q_(52, 38, 66, 64, 88, 80)],
        () => [Q_(62, 8, 48, 30, 22, 46), L_(42, 34, 42, 92)],
        () => [L_(30, 14, 40, 24), L_(24, 38, 34, 48), Q_(18, 86, 30, 74, 40, 58)],
        () => [L_(20, 40 + j(), 80, 40), L_(50, 14, 50, 82), L_(10, 84, 90, 84)],
        () => [L_(50, 12, 50, 92), L_(30, 30, 36, 46), L_(70, 28, 64, 42)],
        () => [L_(16, 34, 84, 32), L_(52, 10, 52, 86, 40, 78), L_(18, 70, 84, 50)],
        () => [L_(48, 6, 52, 18), L_(14, 40, 14, 28, 86, 28, 86, 40)],
        () => [L_(10, 30, 90, 30), L_(32, 14, 32, 46), L_(68, 14, 68, 46)],
        () => [L_(30, 24, 30, 62), L_(68, 10, 68, 90, 56, 82)],
        () => [L_(16, 10, 22, 20), L_(16, 30, 16, 92), L_(16, 26, 84, 26, 84, 92, 74, 86)],
        () => [L_(28, 16, 22, 30), L_(72, 16, 78, 30), Q_(50, 10, 48, 60, 12, 90), Q_(50, 50, 62, 76, 88, 90)],
        () => [L_(24, 12, 24, 88), L_(24, 12, 76, 12, 76, 84, 66, 78), L_(24, 38, 76, 38), L_(24, 62, 76, 62)],
        () => [L_(16, 16, 84, 16, 84, 84, 16, 84, 16, 16), L_(16, 50, 84, 50), L_(50, 16, 50, 84)],
        () => [Q_(56, 10, 40, 50, 18, 84), L_(16, 46, 84, 46), Q_(30, 50, 64, 74, 84, 88)],
        () => [L_(50, 8, 50, 20), L_(14, 26, 86, 26), L_(26, 44, 74, 44), L_(26, 60, 74, 60), L_(26, 74, 26, 92, 74, 92, 74, 74, 26, 74)],
        () => [Q_(58, 10, 40, 30, 30, 34), L_(30, 34, 66, 52, 30, 70), L_(30, 70, 70, 74), L_(50, 74, 50, 92)],
        () => [L_(14, 50, 86, 50), Q_(50, 12, 52, 50, 30, 88), L_(54, 54, 82, 86)],
        () => [L_(20, 16, 80, 16), L_(50, 16, 50, 88), L_(20, 88, 80, 88), L_(30, 52, 70, 52)],
        () => [L_(12, 30, 88, 30), Q_(50, 30, 44, 66, 20, 88), Q_(50, 30, 58, 66, 82, 88), L_(70, 10, 76, 20)],
        () => [L_(18, 22, 18, 60, 82, 60, 82, 22), L_(50, 10, 50, 92)],
      ];
      // The script's own forms: a bar, an upright and a sweep or dot, joined.
      for (let q = 0; q < 8; q++) forms.push(() => {
        const y = 24 + Math.floor(r() * 3) * 22, x = 28 + Math.floor(r() * 3) * 22;
        const out: Prim[] = [L_(14, y, 86, y + j(4)), L_(x, 10, x + j(4), 90)];
        const t = pick(r, ['sweep', 'dot', 'bar', 'hook']);
        if (t === 'sweep') out.push(Q_(x, y + 6, x - 10, y + 34, x - 30, y + 44));
        else if (t === 'dot') out.push(L_(x + 16, y - 16, x + 22, y - 8));
        else if (t === 'bar') out.push(L_(20, y + 32, 80, y + 30));
        else out.push(L_(x + 2, 90, x - 10, 80));
        return out;
      });
      // Shuffle, take 28, and give each its own small differences of proportion.
      const order = forms.map((_, i) => i).sort(() => r() - 0.5);
      this.radicals = order.slice(0, 28).map((i) => {
        const sx = 0.92 + r() * 0.12, sy = 0.92 + r() * 0.12;
        return forms[i]().map((p) => ({ k: p.k, p: p.p.map((v, n) => Math.max(4, Math.min(96, n % 2 ? 50 + (v - 50) * sy : 50 + (v - 50) * sx))) }));
      });
    }
    return this.radicals[k % this.radicals.length];
  }
  /** A character of two radicals: side by side (the left one narrow), one above the other, or one enclosing the other; now and then one alone. */
  private hanzi(key: string): Glyph {
    return this.make(`hz:${key}`, (r) => {
      const n = this.radicals?.length ?? 28;
      const a = this.radical(Math.floor(r() * n)), b = this.radical(Math.floor(r() * n));
      const lay = r();
      const prims =
        lay < 0.5 ? [...tf(a, 0.36, 0.94, 2, 3), ...tf(b, 0.56, 0.94, 42, 3)]
        : lay < 0.78 ? [...tf(a, 0.9, 0.38, 5, 2), ...tf(b, 0.9, 0.56, 5, 42)]
        : lay < 0.9 ? [L_(10, 10, 10, 92), L_(10, 10, 90, 10, 90, 92, 82, 86), ...tf(b, 0.56, 0.58, 22, 26)]
        : lay < 0.96 ? [...tf(a, 0.36, 0.94, 2, 3), ...tf(b, 0.56, 0.44, 42, 3), ...tf(this.radical(Math.floor(r() * n)), 0.56, 0.44, 42, 52)]
        : a;
      return { prims, w: 100 };
    });
  }

  /** A Hangul-like letter: its shape from where the sound is made, strokes added by manner. */
  private jamo(ipa: string): Prim[] {
    const c = CONS.get(ipa);
    if (!c) return [C_(50, 50, 30)];
    const prims: Prim[] = [];
    const place = c.place;
    if (place === 'bilabial' || place === 'labiodental') prims.push(L_(18, 18, 82, 18, 82, 82, 18, 82, 18, 18));
    else if (place === 'velar' || place === 'uvular') prims.push(L_(14, 18, 82, 18, 82, 88));
    else if (place === 'glottal' || place === 'pharyngeal') prims.push(C_(50, 54, 30));
    else if (c.manner === 'fricative' || c.manner === 'affricate') prims.push(L_(12, 88, 50, 16, 88, 88));
    else prims.push(L_(18, 14, 18, 82, 86, 82));
    if (c.manner === 'nasal') prims.push(L_(18, 50, 82, 50));
    if (c.manner === 'affricate' || (c.manner === 'plosive' && !c.voiced && place !== 'velar')) prims.push(L_(30, 6, 70, 6));
    if (c.manner === 'trill' || c.manner === 'tap' || c.manner.startsWith('lateral')) prims.push(L_(18, 50, 70, 50, 70, 30));
    if (c.voiced && c.manner === 'plosive') prims.push(L_(50, 18, 50, 50));
    if (c.manner === 'approximant') prims.push(L_(40, 30, 60, 30));
    return prims;
  }
  private jamoVowel(ipa: string): { prims: Prim[]; vertical: boolean } {
    const v = VOW.get(ipa);
    const vertical = !v || v.back === 'front' || (v.back === 'central' && !v.rounded) || ipa.startsWith('a');
    const ticks = v ? (v.height.includes('close') ? 1 : v.height.includes('open') ? 2 : 1) + (v.long ? 1 : 0) : 1;
    const side = v && (v.back === 'back' || v.rounded) ? -1 : 1;
    const prims: Prim[] = [];
    if (vertical) {
      prims.push(L_(50, 4, 50, 96));
      for (let t = 0; t < ticks; t++) prims.push(L_(50, 36 + t * 24, 50 + side * 30, 36 + t * 24));
    } else {
      prims.push(L_(4, 60, 96, 60));
      for (let t = 0; t < ticks; t++) prims.push(L_(36 + t * 26, 60, 36 + t * 26, 60 - side * 34));
    }
    return { prims, vertical };
  }

  private cartouche(key: string): Glyph {
    return this.make(`car:${key}`, (r) => {
      const prims: Prim[] = [L_(12, 6, 88, 6), Q_(88, 6, 98, 6, 98, 16), L_(98, 16, 98, 84), Q_(98, 84, 98, 94, 88, 94), L_(88, 94, 12, 94), Q_(12, 94, 2, 94, 2, 84), L_(2, 84, 2, 16), Q_(2, 16, 2, 6, 12, 6)];
      const n = 1 + Math.floor(r() * 3);
      for (let q = 0; q < n; q++) {
        const cx = n === 1 ? 50 : 26 + (q * 48) / Math.max(1, n - 1), cy = n === 3 && q === 1 ? 36 : 56;
        switch (pick(r, ['dots', 'circle', 'crescent', 'bars', 'comb', 'spiral', 'cross', 'eye'])) {
          case 'dots': for (let d = 0; d < 3; d++) prims.push(D_(cx - 12 + d * 12, cy, 4)); break;
          case 'circle': prims.push(C_(cx, cy, 13)); break;
          case 'crescent': prims.push(Q_(cx - 16, cy - 8, cx, cy + 22, cx + 16, cy - 8)); break;
          case 'bars': prims.push(L_(cx - 12, cy - 12, cx + 12, cy - 12), L_(cx - 12, cy, cx + 12, cy), L_(cx - 12, cy + 12, cx + 12, cy + 12)); break;
          case 'comb': for (let d = 0; d < 4; d++) prims.push(L_(cx - 12 + d * 8, cy - 12, cx - 12 + d * 8, cy + 12)); break;
          case 'spiral': prims.push(Q_(cx, cy, cx + 14, cy - 14, cx + 4, cy + 12), Q_(cx + 4, cy + 12, cx - 16, cy + 10, cx - 10, cy - 12)); break;
          case 'cross': prims.push(L_(cx - 12, cy, cx + 12, cy), L_(cx, cy - 12, cx, cy + 12)); break;
          default: prims.push(C_(cx, cy, 12), D_(cx, cy, 4)); break;
        }
      }
      if (r() < 0.3) prims.push(L_(-14, 30, -4, 30), L_(-14, 50, -4, 50), L_(-14, 70, -4, 70));
      return { prims, w: 100 };
    });
  }

  /**
   * A cuneiform-like sign: wedges pressed in order, left to right, in up to three groups: a stack
   * of horizontal wedges, a row of upright wedges, a pair of corner wedges, or a slanting wedge,
   * often strung on a long horizontal wedge through the middle of the sign. The sign is as wide
   * as its wedges need.
   */
  private wedges(key: string): Glyph {
    return this.make(`cun:${key}`, (r) => {
      const prims: Prim[] = [];
      const H = (x: number, y: number, len: number) => prims.push(P_(x, y - 7, x, y + 7, x + 14, y), L_(x + 11, y, x + len, y));
      const V = (x: number, y: number, len: number) => prims.push(P_(x - 7, y, x + 7, y, x, y + 14), L_(x, y + 11, x, y + len));
      const W = (x: number, y: number) => prims.push(L_(x + 16, y - 12, x, y, x + 16, y + 12), P_(x, y, x + 8, y - 5, x + 8, y + 5));
      const D = (x: number, y: number) => prims.push(P_(x - 3, y - 9, x - 9, y + 3, x + 9, y + 9), L_(x + 5, y + 5, x + 24, y + 24));
      let x = 6;
      const groups = 1 + Math.floor(r() * 2.6);
      const spine = r() < 0.5;
      const start = x;
      for (let g = 0; g < groups; g++) {
        const t = pick(r, ['hs', 'vs', 'vs', 'w', 'hs', 'd']);
        if (t === 'hs') {
          const n = 1 + Math.floor(r() * 3);
          const ys = n === 1 ? [50] : n === 2 ? [34, 66] : [22, 50, 78];
          for (const y of ys) H(x, y, 34);
          x += 42;
        } else if (t === 'vs') {
          const n = 1 + Math.floor(r() * 3);
          for (let k = 0; k < n; k++) V(x + 8 + k * 16, spine ? 30 : 22, spine ? 44 : 58);
          x += 16 * n + 6;
        } else if (t === 'w') {
          const n = 1 + Math.floor(r() * 2);
          for (let k = 0; k < n; k++) W(x, n === 1 ? 50 : 36 + k * 28);
          x += 24;
        } else {
          D(x + 8, 28);
          x += 30;
        }
      }
      if (spine) H(start - 2, 50, Math.max(40, x - start));
      return { prims, w: Math.max(44, Math.min(130, x + 4)) };
    });
  }

  // ---- Numerals ---------------------------------------------------------------------------------

  private numInfo: NumeralInfo | null = null;
  private readonly numCache = new Map<string, Glyph>();
  private readonly numUsed = new Set<string>();

  /** How this people writes numbers (on a random stream of its own). */
  get numerals(): NumeralInfo {
    if (this.numInfo) return this.numInfo;
    const r = this.rng('numerals');
    const st = this.info.style;
    const base = numberSystem(this.L).base;
    const kind: NumeralKind = st === 'runes' || st === 'ogham' ? 'additive' : st === 'hanzi' || st === 'kana' || st === 'hangul' ? 'multiplicative' : st === 'latin' && r() < 0.35 ? 'additive' : 'positional';
    const pen = ALPHA_DIGITS.has(st);
    const group = kind !== 'positional' ? 0 : st === 'cuneiform' ? (base > 12 ? 10 : 0) : st === 'glyphs' || (base > 12 && !pen) ? (base === 60 ? 10 : 5) : 0;
    const composite = kind === 'positional' && (st === 'glyphs' || st === 'cuneiform' || (base > 12 && !pen));
    const bn = { 10: 'ten', 12: 'twelve', 20: 'twenty', 60: 'sixty' }[base] ?? `${base}`;
    let note: string;
    if (kind === 'additive') note = `Numbers are written with signs for one, ${this.addGroup === 5 ? 'five' : 'ten'} and each power of ${bn}, each repeated as often as needed and the largest first, as Roman numerals are.`;
    else if (kind === 'multiplicative') note = `Numbers are written with a digit for each of one to ${base > 12 ? 'nine' : DIGIT_EN[base - 1]} and a sign for each power of ${bn}: each power's sign follows the digit that counts it, and empty places are left out.`;
    else if (composite) note = `Numbers are written by place, in powers of ${bn}. Each digit is built ${st === 'cuneiform' ? `of wedges: ${group ? 'a corner wedge for each ten and ' : ''}an upright wedge for each one` : `of dots and bars: a dot for each one and a bar for each ${group}`}, and ${st === 'cuneiform' ? 'a pair of slanting wedges' : st === 'glyphs' ? 'a shell' : st === 'abjad' ? 'a dot' : 'a ring'} marks an empty place.`;
    else if (pen && st !== 'abjad' && this.digitFamily.kind === 'zigzag') note = `Numbers are written by place, in powers of ${bn}. Each figure counts its fives as bars across the top and its ones as strokes zigzagging down beneath them, and a ring marks an empty place${base > 20 ? '; a place worth more than nineteen is written as two figures under a bar' : ''}.`;
    else if (pen && st !== 'abjad') note = `Numbers are written by place, in powers of ${bn}. Each figure is an upright stem with marks off its top: a bar, a lower bar, a falling or a rising stroke, a side stroke, or two or three of these together; a ring marks an empty place${base > 12 ? ', and a place worth more than nine is written as two figures under a bar' : ''}.`;
    else if (pen && base > 12) note = `Numbers are written by place, in powers of ${bn}, with ten figures, one of them a sign for an empty place (zero); a place worth more than nine is written as two figures under a bar.`;
    else note = `Numbers are written by place, in powers of ${bn}, with ${base} digits, one of them a sign for an empty place (zero).`;
    this.numInfo = { kind, base, group, note };
    return this.numInfo;
  }
  /** How the pen-written alphabets make their figures (see `penDigit`). */
  private get digitFamily(): { kind: 'quadrant' | 'zigzag'; left: boolean } {
    const r = this.rng('digit-family');
    return { kind: r() < 0.55 ? 'quadrant' : 'zigzag', left: r() < 0.5 };
  }
  private get addGroup(): number {
    return numberSystem(this.L).base === 60 ? 10 : 5;
  }

  /** A numeral sign made once for a key, different from the other numeral signs. */
  private makeNum(key: string, gen: (r: Rng, t: number) => Glyph): Glyph {
    const hit = this.numCache.get(key);
    if (hit) return hit;
    const r = this.rng(`num:${key}`);
    let g = gen(r, 0);
    for (let t = 1; t < 30 && this.numUsed.has(sig(g.prims)); t++) g = gen(r, t);
    this.numUsed.add(sig(g.prims));
    this.numCache.set(key, g);
    return g;
  }

  /** A pen-drawn sign (for digits and number signs), in the feel of the script. */
  private numSign(key: string): Glyph {
    const st = this.info.style;
    if (st === 'hanzi' || st === 'kana' || st === 'hangul') return this.makeNum(key, (r) => {
      const a = this.radical(Math.floor(r() * 28));
      return { prims: r() < 0.5 ? a : [...tf(a, 1, 0.5, 0, 0), ...tf(this.radical(Math.floor(r() * 28)), 1, 0.45, 0, 52)], w: 100 };
    });
    const straight = st === 'runes' || st === 'ogham' || st === 'cuneiform' || st === 'phagspa';
    return this.makeNum(key, (r) => {
      const prims: Prim[] = [];
      const n = 1 + Math.floor(r() * 2.4);
      const P = () => [8 + Math.floor(r() * 3) * 22, (st === 'devanagari' ? 26 : 10) + Math.floor(r() * 4) * 28];
      let [x, y] = P();
      for (let q = 0; q < n; q++) {
        let [x1, y1] = P();
        if (x1 === x && y1 === y) y1 = y1 > 50 ? y1 - 56 : y1 + 56;
        if (straight || r() < 0.4) prims.push(L_(x, y, x1, y1));
        else prims.push(Q_(x, y, (x + x1) / 2 + (r() - 0.5) * 70, (y + y1) / 2 + (r() - 0.5) * 50, x1, y1));
        [x, y] = [x1, y1];
      }
      if (st === 'devanagari') prims.push(L_(4, 20, 58, 20));
      return { prims: prims.map((q) => ({ k: q.k, p: q.p.map((v, i) => (i % 2 ? Math.max(0, Math.min(100, v)) : Math.max(0, Math.min(60, v)))) })), w: 62 };
    });
  }

  /** The sign for an empty place. */
  private zero(): Glyph {
    const st = this.info.style;
    if (st === 'abjad') return { prims: [D_(18, 64, 7)], w: 36 };
    if (st === 'glyphs') return { prims: [Q_(8, 60, 50, 20, 92, 60), Q_(8, 60, 50, 96, 92, 60), L_(30, 50, 40, 66), L_(50, 46, 50, 70), L_(70, 50, 60, 66)], w: 100 };
    if (st === 'cuneiform') return { prims: [P_(10, 30, 26, 24, 22, 40), L_(22, 34, 40, 56), P_(36, 50, 52, 44, 48, 60), L_(48, 54, 66, 76)], w: 70 };
    if (st === 'devanagari') return { prims: [L_(4, 20, 58, 20), C_(30, 62, 20)], w: 62 };
    return { prims: [C_(30, 64, st === 'elvish' ? 16 : 24)], w: 62 };
  }

  /** A digit built of dots and bars, or of wedges. */
  private compositeDigit(d: number): Glyph {
    const G = this.numerals.group, st = this.info.style;
    if (d === 0) return this.zero();
    const g = G ? Math.floor(d / G) : 0, u = G ? d % G : d;
    const prims: Prim[] = [];
    if (st === 'cuneiform') {
      for (let k = 0; k < g; k++) {
        const x = 6 + (k % 3) * 22, y = 30 + Math.floor(k / 3) * 34;
        prims.push(P_(x, y, x + 18, y - 12, x + 18, y + 12), L_(x + 14, y - 9, x + 22, y - 14), L_(x + 14, y + 9, x + 22, y + 14));
      }
      const ox = g ? 6 + Math.min(3, g) * 22 + 6 : 6;
      for (let k = 0; k < u; k++) {
        const x = ox + (k % 3) * 18, y = 8 + Math.floor(k / 3) * 32;
        prims.push(P_(x - 8, y, x + 8, y, x, y + 14), L_(x, y + 10, x, y + 30));
      }
      return { prims, w: ox + Math.min(3, u) * 18 + 4 };
    }
    // Bars from the bottom up, dots in a row above them.
    const step = g > 3 ? 12 : 16;
    for (let k = 0; k < g; k++) prims.push(L_(10, 92 - k * step, 90, 92 - k * step));
    const top = 92 - g * step - (g ? 4 : -4);
    // Dots in rows of five.
    for (let k = 0; k < u; k++) {
      const row = Math.floor(k / 5), inRow = Math.min(5, u - row * 5), col = k % 5;
      prims.push(D_(50 - (inRow - 1) * 9 + col * 18, top - 6 - row * 16, 6));
    }
    return { prims, w: 100 };
  }

  /** A digit (below the base). */
  private digit(d: number): Glyph[] {
    const nm = this.numerals;
    if (nm.kind === 'positional' && (nm.group || this.info.style === 'cuneiform' || this.info.style === 'glyphs' || (nm.base > 12 && !ALPHA_DIGITS.has(this.info.style)))) return [this.compositeDigit(d)];
    const st = this.info.style;
    // The square script's digits are letters of its own kind, and its zero a hollow square.
    if (st === 'phagspa') return [d === 0 ? { prims: [L_(14, 30, 46, 30, 46, 70, 14, 70, 14, 30)], w: 60 } : this.phags(`#${d}`)];
    if (d === 0) return [this.zero()];
    // Alphabets write their digits with a set of forms of their own (one is always a stroke).
    if (nm.kind === 'positional' && ALPHA_DIGITS.has(st)) {
      const set = DIGIT_FORMS.abjad;
      const r = this.rng('digit-forms');
      const order = [0, ...Array.from({ length: set.length - 1 }, (_, i) => i + 1).sort(() => r() - 0.5)];
      const fam = this.digitFamily;
      const form = (x: number): Prim[] => (x === 0 ? this.zero().prims.filter((p) => !(p.k === 'line' && p.p[1] === 20)) : st === 'abjad' ? set[order[x - 1]] : penDigit(x, fam, st === 'elvish'));
      const head = st === 'devanagari' ? [L_(4, 20, 50, 20)] : [];
      // Zigzag figures count fives as bars, so they write up to nineteen as one figure.
      if (d < 10 || (nm.base === 12 && d < 12) || (st !== 'abjad' && fam.kind === 'zigzag' && d < 20)) return [{ prims: [...form(d), ...head], w: 52 }];
      // A place worth more than nine: two figures, smaller, under a bar.
      const q = Math.floor(d / 10), u = d % 10;
      return [{ prims: [L_(2, 4, 70, 4), ...tf(form(q), 0.62, 0.8, 2, 18), ...tf(form(u), 0.62, 0.8, 38, 18)], w: 72 }];
    }
    // Ideographic one, two and three are so many strokes.
    if (nm.kind === 'multiplicative' && d <= 3) return [{ prims: Array.from({ length: d }, (_, k) => L_(18, 50 - (d - 1) * 14 + k * 28, 82, 50 - (d - 1) * 14 + k * 28)), w: 100 }];
    if (st !== 'cuneiform' && d === 1 && nm.kind === 'positional' && this.rng('one')() < 0.6) return [{ prims: [L_(30, st === 'devanagari' ? 20 : 10, 30, 100), ...(st === 'devanagari' ? [L_(4, 20, 58, 20)] : [])], w: 62 }];
    if (d < 10 || nm.base <= 12) return [this.numSign(`d${d}`)];
    // Digits past nine in a multiplicative script: tens and units ("two ten three").
    const q = Math.floor(d / 10), u = d % 10;
    return [...(q > 1 ? this.digit(q) : []), this.numSign('d10'), ...(u ? this.digit(u) : [])];
  }

  /** A number in the script's numerals, in reading order. */
  numeral(n: number): Glyph[] {
    n = Math.max(0, Math.floor(n));
    const nm = this.numerals, b = nm.base;
    const places: number[] = [];
    for (let x = n; x > 0 || !places.length; x = Math.floor(x / b)) places.unshift(x % b);
    if (nm.kind === 'positional') return places.flatMap((d) => this.digit(d));
    const out: Glyph[] = [];
    const P = places.length;
    if (nm.kind === 'multiplicative') {
      if (n === 0) return [this.zero()];
      places.forEach((d, i) => {
        const p = P - 1 - i;
        if (!d) return;
        if (p === 0) out.push(...this.digit(d));
        else {
          if (d > 1 || p > 1) out.push(...this.digit(d));
          out.push(this.numSign(`p${p}`));
        }
      });
      return out;
    }
    // Additive: groups and units of each power, the largest first (fives as Roman V, L, D).
    if (n === 0) return [this.zero()];
    const G = this.addGroup;
    const unit = (p: number): Glyph => (p === 0 ? { prims: [L_(20, 14, 20, 96)], w: 40 } : this.numSign(`p${p}`));
    const grp = (p: number): Glyph => this.numSign(`g${p}`);
    places.forEach((d, i) => {
      const p = P - 1 - i;
      for (let k = 0; k < Math.floor(d / G); k++) out.push(grp(p));
      for (let k = 0; k < d % G; k++) out.push(unit(p));
    });
    return out;
  }

  /** The numerals to show in a chart: digits, or each sign with its value. */
  numeralChart(): { label: string; glyph: Glyph[] }[] {
    const nm = this.numerals, b = nm.base;
    const row = (n: number, label = `${n}`) => ({ label, glyph: this.numeral(n) });
    if (nm.kind === 'positional') {
      const ds = b <= 20 ? Array.from({ length: b }, (_, i) => i) : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 19, 20, 30, 40, 50, 59];
      return [...ds.map((d) => ({ label: `${d}`, glyph: this.digit(d) })), row(b), row(b + 1), row(b * b)];
    }
    if (nm.kind === 'multiplicative') return [...Array.from({ length: Math.min(b, 10) - 1 }, (_, i) => row(i + 1)), ...(b > 10 ? [row(10)] : []), row(b), row(b * b), row(b ** 3), row(3 * b + 4)];
    const G = this.addGroup;
    return [row(1), row(G), row(b), row(G * b), row(b * b), row(G * b * b), row(b ** 3)];
  }

  // ---- Writing words -----------------------------------------------------------------------------

  /** A word (spelled in the Latin transcription) as glyphs, in reading order. */
  word(spell: string): Glyph[] {
    const L = this.L;
    const syls = L.syllablesOf(spell.toLowerCase());
    const segs = syls.flat().filter((s) => !s.startsWith('#'));
    const s = this.info.style;
    const out: Glyph[] = [];
    switch (s) {
      case 'runes': for (const x of segs) out.push(this.rune(x, isVowel(x))); break;
      case 'ogham': for (const x of segs) out.push(this.ogham(x, isVowel(x))); break;
      case 'latin': for (const x of segs) out.push(this.latin(x, isVowel(x))); break;
      case 'abjad':
        segs.forEach((x, i) => {
          const long = /ː/.test(x);
          if (isVowel(x) && !long && i > 0) return;
          out.push(this.abjadLetter(isVowel(x) && !long ? 'carrier' : x, isVowel(x)));
        });
        break;
      case 'elvish':
        for (const syl of syls) {
          const sy = syl.filter((q) => !q.startsWith('#'));
          const vi = sy.findIndex(isVowel);
          sy.forEach((x, i) => {
            if (i === vi && this.tengMode === 'full') out.push(this.tengVowel(x));
            else if (i === vi) {
              // The vowel goes over the consonant before it, or over a carrier (long for a long vowel).
              const long = /ː/.test(x);
              const prev = i > 0 && !long ? out.pop() : null;
              const base = prev ?? { prims: [long ? L_(10, 60, 10, 124) : L_(10, 60, 10, 100)], w: 24 };
              out.push({ prims: [...base.prims, ...this.tehta(x.replace('ː', ''))], w: base.w });
            } else out.push(this.tengwa(x));
          });
        }
        break;
      case 'phagspa':
        // Each syllable a stack of joined letters; a after a consonant is not written.
        syls.forEach((syl, si) => {
          const sy = syl.filter((q) => !q.startsWith('#'));
          const letters = sy.filter((x, i) => !(x === this.inherent && i > 0 && !isVowel(sy[i - 1])));
          letters.forEach((x, i) => {
            const g = this.phags(x);
            out.push({ prims: i > 0 ? [...g.prims, L_(30, -12, 30, 8)] : g.prims, w: g.w, gap: i === 0 && si > 0 ? 30 : 0, join: i > 0 });
          });
        });
        break;
      case 'devanagari':
        for (const syl of syls) {
          const sy = syl.filter((q) => !q.startsWith('#'));
          const vi = sy.findIndex(isVowel);
          sy.forEach((x, i) => {
            if (i === vi) {
              if (i === 0) out.push(this.deva(`v:${x}`, true));
              else if (x !== this.inherent) {
                const prev = out.pop()!;
                const m = this.matra(x, prev.w);
                out.push({ prims: [...prev.prims, ...m.prims, ...(m.w ? [L_(prev.w, 20, prev.w + m.w, 20)] : [])], w: prev.w + m.w });
              }
            } else {
              const g = this.deva(x, false);
              // A consonant with no vowel after it takes the silencing stroke.
              const silent = i > vi || sy[i + 1] === undefined || !isVowel(sy[i + 1]);
              out.push(silent ? { prims: [...g.prims, L_(g.w - 16, 102, g.w - 2, 116)], w: g.w } : g);
            }
          });
        }
        break;
      case 'hangul':
        for (const syl of syls) {
          const sy = syl.filter((q) => !q.startsWith('#'));
          const vi = sy.findIndex(isVowel);
          const on = sy.slice(0, Math.max(0, vi)), v = sy[vi], co = sy.slice(vi + 1);
          const V = this.jamoVowel(v ?? 'a');
          const prims: Prim[] = [];
          const onset = on.length ? on : ['ʔ'];
          const onP = onset.length > 1 ? [...tf(this.jamo(onset[0]), 0.5, 1, 0, 0), ...tf(this.jamo(onset[1]), 0.5, 1, 50, 0)] : this.jamo(onset[0]);
          const coP = co.length ? (co.length > 1 ? [...tf(this.jamo(co[0]), 0.5, 1, 0, 0), ...tf(this.jamo(co[1]), 0.5, 1, 50, 0)] : this.jamo(co[0])) : [];
          const h = co.length ? 0.62 : 1;
          if (V.vertical) prims.push(...tf(onP, 0.55, 0.5 * h, 2, 22 * h), ...tf(V.prims, 0.4, h, 58, 0));
          else prims.push(...tf(onP, 0.8, 0.45 * h, 10, 0), ...tf(V.prims, 1, 0.5 * h, 0, 44 * h));
          if (co.length) prims.push(...tf(coP, 0.7, 0.34, 15, 64));
          out.push({ prims, w: 100 });
        }
        break;
      default:
        // Syllabaries: one sign for each consonant and vowel together; a consonant with no vowel of its own, a sign alone.
        for (const syl of syls) {
          const sy = syl.filter((q) => !q.startsWith('#'));
          const vi = sy.findIndex(isVowel);
          const sign = (k: string, alone: boolean) => (s === 'kana' ? this.brush(k, alone ? 1 : 2) : s === 'hanzi' ? this.hanzi(k) : s === 'glyphs' ? this.cartouche(k) : this.wedges(k));
          sy.forEach((x, i) => {
            if (i === vi) out.push(sign(`${sy[i - 1] && !isVowel(sy[i - 1]) ? sy[i - 1] : ''}${x}`, false));
            else if (!(i === vi - 1)) out.push(sign(`${x}-`, true));
          });
        }
    }
    return out;
  }

  /** The glyphs to show in a chart: each letter or sign with what it says. */
  chart(): { label: string; glyph: Glyph }[] {
    const L = this.L;
    const s = this.info.style;
    const cons = L.consonants.map((c) => c.ipa), vows = L.vowels.map((v) => v.ipa);
    const sp = (ipa: string) => L.spelling.get(ipa) ?? ipa;
    // Two sounds spelled alike are told apart by their IPA.
    const twice = new Set([...vows, ...cons].map(sp).filter((x, i, a) => a.indexOf(x) !== i));
    const lab = (x: string) => (twice.has(sp(x)) ? `${sp(x)} /${x}/` : sp(x));
    if (s === 'runes' || s === 'ogham' || s === 'latin') return [...vows, ...cons].map((x) => ({ label: lab(x), glyph: s === 'runes' ? this.rune(x, isVowel(x)) : s === 'ogham' ? this.ogham(x, isVowel(x)) : this.latin(x, isVowel(x)) }));
    if (s === 'abjad') return [...cons.map((x) => ({ label: sp(x), glyph: this.abjadLetter(x, false) })), ...vows.filter((v) => /ː/.test(v)).map((x) => ({ label: sp(x), glyph: this.abjadLetter(x, true) })), { label: 'carrier', glyph: this.abjadLetter('carrier', true) }];
    if (s === 'elvish') {
      // Letters in their series and grades (by place, then manner), then the vowels.
      const ORDER = ['plosive', 'affricate', 'fricative', 'nasal', 'approximant', 'trill', 'tap', 'lateral approximant', 'lateral fricative'];
      const sorted = [...cons].sort((a, b) => {
        const A = CONS.get(a), B = CONS.get(b);
        return ORDER.indexOf(A?.manner ?? '') - ORDER.indexOf(B?.manner ?? '') || PLACE_ORDER_S.indexOf(A?.place ?? '') - PLACE_ORDER_S.indexOf(B?.place ?? '') || Number(A?.voiced) - Number(B?.voiced);
      });
      return [...sorted.map((x) => ({ label: sp(x), glyph: this.tengwa(x) })), ...vows.map((x) => ({ label: this.tengMode === 'full' ? sp(x) : `\u00b7${sp(x)}`, glyph: this.tengMode === 'full' ? this.tengVowel(x) : { prims: [/ː/.test(x) ? L_(10, 60, 10, 124) : L_(10, 60, 10, 100), ...this.tehta(x.replace('ː', ''))], w: 40 } }))];
    }
    if (s === 'phagspa') return [...cons.map((x) => ({ label: `${sp(x)}${sp(this.inherent)}`, glyph: this.phags(x) })), ...vows.filter((v) => v !== this.inherent).map((x) => ({ label: sp(x), glyph: this.phags(x) })), { label: `${sp(this.inherent)} (alone)`, glyph: this.phags(this.inherent) }];
    if (s === 'devanagari') {
      const k0 = cons[0] ?? 'k';
      return [...cons.map((x) => ({ label: `${sp(x)}${sp(this.inherent)}`, glyph: this.deva(x, false) })), ...vows.map((x) => ({ label: sp(x), glyph: this.deva(`v:${x}`, true) })),
        ...vows.filter((v) => v !== this.inherent).map((x) => {
          const g = this.deva(k0, false), m = this.matra(x, g.w);
          return { label: `${sp(k0)}${sp(x)}`, glyph: { prims: [...g.prims, ...m.prims], w: g.w + m.w } };
        })];
    }
    if (s === 'hangul') {
      return [...cons.map((x) => ({ label: sp(x), glyph: { prims: this.jamo(x), w: 100 } })), ...vows.map((x) => ({ label: sp(x), glyph: { prims: this.jamoVowel(x).prims, w: 100 } }))];
    }
    // Syllabaries: the commoner consonants with each vowel.
    const out: { label: string; glyph: Glyph }[] = [];
    const seen = new Set<string>();
    for (const c of ['', ...cons.slice(0, 7)]) for (const v of vows.slice(0, 5)) {
      const label = `${c ? sp(c) : ''}${sp(v)}`;
      if (seen.has(label)) continue;
      seen.add(label);
      out.push({ label, glyph: this.word(label)[0] ?? { prims: [], w: 100 } });
    }
    return out;
  }
}

const scripts = new WeakMap<Language, Script>();
/** A language's script (made once). */
export function scriptOf(L: Language): Script {
  let s = scripts.get(L);
  if (!s) {
    s = new Script(L);
    scripts.set(L, s);
  }
  return s;
}

// ---- SVG -----------------------------------------------------------------------------------------

function primSvg(q: Prim, ox: number, oy: number, k: number): string {
  const P = (i: number) => `${(q.p[i] * k + ox).toFixed(1)},${(q.p[i + 1] * k + oy).toFixed(1)}`;
  switch (q.k) {
    case 'line': {
      let d = `M${P(0)}`;
      for (let i = 2; i < q.p.length; i += 2) d += `L${P(i)}`;
      return `<path d="${d}"/>`;
    }
    case 'quad': return `<path d="M${P(0)}Q${P(2)} ${P(4)}"/>`;
    case 'circ': return `<circle cx="${(q.p[0] * k + ox).toFixed(1)}" cy="${(q.p[1] * k + oy).toFixed(1)}" r="${(q.p[2] * k).toFixed(1)}"/>`;
    case 'dot': return `<circle class="f" cx="${(q.p[0] * k + ox).toFixed(1)}" cy="${(q.p[1] * k + oy).toFixed(1)}" r="${(q.p[2] * k).toFixed(1)}"/>`;
    default: {
      let d = `M${P(0)}`;
      for (let i = 2; i < q.p.length; i += 2) d += `L${P(i)}`;
      return `<path class="f" d="${d}Z"/>`;
    }
  }
}

/** One glyph as a small SVG (for charts). */
export function glyphSvg(sc: Script, g: Glyph, size = 40): string {
  const k = size / 140, pad = 20 * k;
  const W = Math.max(g.w, 60) * k + 2 * pad, H = size;
  const ox = (W - g.w * k) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${H}" viewBox="0 0 ${W.toFixed(1)} ${H}"><g fill="none" stroke="${sc.info.ink}" stroke-width="${(sc.info.stroke * k).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" style="--ink:${sc.info.ink}">${g.prims.map((q) => primSvg(q, ox, pad, k)).join('')}</g><style>.f{fill:${sc.info.ink};stroke:none}</style></svg>`;
}

/** Text in the script set around a ring (SVG markup for a 100 by 100 box, centred), for seals and emblems. */
export function ringText(sc: Script, text: string, radius = 40, ink = sc.info.ink, glyphSize = 7): string {
  const gl = text.split(/\s+/).filter(Boolean).flatMap((w) => sc.word(w)).slice(0, 24);
  const k = glyphSize / 100;
  const parts: string[] = [];
  gl.forEach((g, i) => {
    const t = -Math.PI / 2 + ((i + 0.5) / Math.max(10, gl.length)) * Math.PI * 2;
    const gx = 50 + Math.cos(t) * radius - (g.w * k) / 2, gy = 50 + Math.sin(t) * radius - 50 * k;
    for (const q of g.prims) parts.push(primSvg(q, gx, gy, k));
  });
  return `<g fill="none" stroke="${ink}" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round">${parts.join('').replace(/class="f"/g, `fill="${ink}" stroke="none"`)}</g>`;
}

/** Several glyphs side by side (a numeral), as a small SVG. */
export function glyphsSvg(sc: Script, gs: Glyph[], size = 40): string {
  const w = gs.reduce((a, g) => a + g.w + 8, -8);
  return glyphSvg(sc, { prims: gs.flatMap((g, i) => tf(g.prims, 1, 1, gs.slice(0, i).reduce((a, x) => a + x.w + 8, 0), 0)), w: Math.max(w, 1) }, size);
}

/**
 * Text (spelled words, as the transcription shows them, and numbers in digits) written in the script, as an SVG. Lines
 * break at `maxWidth` pixels; scripts written in columns run top to bottom, right to left.
 */
export function textSvg(sc: Script, text: string, o: { size?: number; maxWidth?: number } = {}): string {
  const size = o.size ?? 36, k = size / 100, gap = 26 * k;
  // Words are spelled out; a run of digits is written in the script's numerals.
  const words = text.split(/\s+/).map((w) => (/^\d+$/.test(w) ? w : w.replace(/[^\p{L}'-]/gu, ''))).filter(Boolean).map((w) => {
    if (!/^\d+$/.test(w)) return sc.word(w);
    // Numbers read from left to right even in a script written from right to left (as Arabic's do).
    const g = sc.numeral(parseInt(w, 10));
    return sc.info.direction === 'rtl' ? [...g].reverse() : g;
  });
  const { style, direction, ink, paper, stroke } = sc.info;
  const parts: string[] = [];
  const stem = style === 'ogham';
  let W = 0, H = 0;
  if (direction === 'ttb' || direction === 'ttbl') {
    const colH = Math.max(size * 3, (o.maxWidth ?? 600) * 0.6);
    let x = 0, y = 0;
    const cols: { x: number; items: [Glyph, number][] }[] = [{ x: 0, items: [] }];
    for (const w of words) {
      for (const g of w) {
        if (g.gap) y += g.gap * k;
        // The letters of a stacked syllable sit close, joined by their stems.
        if (g.join && y > 0) y -= size * 0.1;
        if (y + size > colH && y > 0) {
          x += size * 1.25;
          y = 0;
          cols.push({ x, items: [] });
        }
        cols[cols.length - 1].items.push([g, y]);
        y += size * 1.05;
      }
      y += gap;
    }
    W = x + size * 1.25;
    H = Math.max(...cols.map((c) => (c.items.length ? c.items[c.items.length - 1][1] + size : 0))) + 10;
    for (const c of cols) {
      const cx = direction === 'ttbl' ? c.x + size * 0.1 : W - c.x - size * 1.15;
      for (const [g, gy] of c.items) for (const q of g.prims) parts.push(primSvg(q, cx + (100 - g.w) * k / 2, gy + 6, k * 0.95));
    }
  } else {
    const maxW = o.maxWidth ?? 640;
    const lines: Glyph[][][] = [[]];
    let lw = 0;
    for (const w of words) {
      const ww = w.reduce((a, g) => a + g.w * k + (stem ? 0 : 4 * k), 0);
      if (lw + ww > maxW && lines[lines.length - 1].length) {
        lines.push([]);
        lw = 0;
      }
      lines[lines.length - 1].push(w);
      lw += ww + gap;
    }
    const lineH = size * 1.7;
    W = Math.min(maxW, Math.max(...lines.map((l) => l.reduce((a, w) => a + w.reduce((b, g) => b + g.w * k + (stem ? 0 : 4 * k), 0) + gap, 0)))) + 20;
    H = lines.length * lineH + 10;
    lines.forEach((line, li) => {
      let x = direction === 'rtl' ? W - 10 : 10;
      const y = 10 + li * lineH + size * 0.2;
      for (const w of line) {
        const ww = w.reduce((a, g) => a + g.w * k + (stem ? 0 : 4 * k), 0);
        if (stem) parts.push(`<path d="M${(direction === 'rtl' ? x - ww - 6 : x - 6).toFixed(1)},${(y + 50 * k).toFixed(1)}h${(ww + 12).toFixed(1)}"/>`);
        // Runes part their words with a pair of dots.
        if (style === 'runes' && w !== line[0]) {
          const sx = x - (direction === 'rtl' ? -1 : 1) * gap * 0.5;
          parts.push(`<circle class="f" cx="${sx.toFixed(1)}" cy="${(y + 38 * k).toFixed(1)}" r="${(4 * k).toFixed(1)}"/>`, `<circle class="f" cx="${sx.toFixed(1)}" cy="${(y + 62 * k).toFixed(1)}" r="${(4 * k).toFixed(1)}"/>`);
        }
        for (const g of direction === 'rtl' ? w : w) {
          if (g.gap) x += (direction === 'rtl' ? -1 : 1) * g.gap * k;
          const gx = direction === 'rtl' ? x - g.w * k : x;
          for (const q of g.prims) parts.push(primSvg(q, gx, y, k));
          x += (direction === 'rtl' ? -1 : 1) * (g.w * k + (stem ? 0 : 4 * k));
        }
        x += (direction === 'rtl' ? -1 : 1) * gap;
      }
    });
  }
  W = Math.ceil(Math.max(W, 40));
  H = Math.ceil(Math.max(H, size));
  const bg = style === 'cuneiform' ? `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="${paper}" stroke="#a88a62"/>` : style === 'glyphs' ? `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="4" fill="${paper}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bg}<g fill="none" stroke="${ink}" stroke-width="${(stroke * k).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</g><style>.f{fill:${ink};stroke:none}</style></svg>`;
}

/**
 * A sigil made from a name, after the old way of making them: the name's letters become points
 * on three rings (each letter's point is fixed for the script), joined in order (some strokes
 * bowed) from a small ring to a closing bar or ring, and mirrored so the figure stands balanced,
 * inside a double ring lettered with the name in the script itself.
 */
export function sigilSvg(sc: Script, name: string, size = 140): string {
  // Each letter has its place on one of three rings, fixed for the script (so two names in the same
  // script share their points); the name's letters, repeats included, are joined in order.
  const letters = name.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '').split('').filter((ch, i, a) => ch !== a[i - 1]);
  const cx = size / 2, cy = size / 2, R = size * 0.3;
  const at = (ch: string): [number, number] => {
    const h = hashString(`${sc.seed}:sigil:${ch}`);
    const ring = h % 3, k = (h >>> 3) % 9;
    const a = -Math.PI / 2 + (k / 8) * Math.PI;
    const rr = R * [0.35, 0.7, 1][ring];
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  };
  const pts = (letters.length > 1 ? letters : [...letters, 'n', 'a']).map(at).filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1);
  if (pts.length < 2) pts.push([cx, cy + R]);
  const hn = hashString(`${sc.seed}:sigil:${name}`);
  const rnd = mulberry32(hn);
  // Some strokes bow outward (the bend is the name's own, so each sigil differs).
  const bows = pts.slice(1).map(() => (rnd() < 0.35 ? (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 0.3) : 0));
  const dot = rnd() < 0.5, bar = rnd() < 0.5;
  const ink = sc.info.ink;
  const parts: string[] = [];
  const f = (n: number) => n.toFixed(1);
  const path = (ps: [number, number][], flip: number) => {
    let d = `M${f(ps[0][0])},${f(ps[0][1])}`;
    for (let i = 1; i < ps.length; i++) {
      const [x0, y0] = ps[i - 1], [x1, y1] = ps[i], bw = bows[i - 1] * flip;
      if (!bw) d += `L${f(x1)},${f(y1)}`;
      else d += `Q${f((x0 + x1) / 2 - (y1 - y0) * bw)},${f((y0 + y1) / 2 + (x1 - x0) * bw)} ${f(x1)},${f(y1)}`;
    }
    return `<path d="${d}"/>`;
  };
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${(R + size * 0.15).toFixed(1)}"/>`, `<circle cx="${cx}" cy="${cy}" r="${(R + size * 0.05).toFixed(1)}" stroke-width="1"/>`);
  const mirror = pts.map(([x, y]) => [2 * cx - x, y] as [number, number]);
  for (const [ps, flip] of [[pts, 1], [mirror, -1]] as [[number, number][], number][]) {
    parts.push(path(ps, flip));
    if (dot && ps.length > 2) parts.push(`<circle cx="${f(ps[1][0])}" cy="${f(ps[1][1])}" r="${f(size * 0.018)}" class="f"/>`);
    const [sx, sy] = ps[0];
    parts.push(`<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${(size * 0.028).toFixed(1)}"/>`);
    const [ex, ey] = ps[ps.length - 1];
    const [px, py] = ps[ps.length - 2];
    const a = Math.atan2(ey - py, ex - px) + Math.PI / 2, b = size * 0.04;
    if (bar) parts.push(`<path d="M${f(ex + Math.cos(a) * b)},${f(ey + Math.sin(a) * b)}L${f(ex - Math.cos(a) * b)},${f(ey - Math.sin(a) * b)}"/>`);
    else parts.push(`<circle cx="${f(ex)}" cy="${f(ey)}" r="${f(size * 0.03)}"/>`);
  }
  parts.push(`<path d="M${cx},${(cy - R - size * 0.05).toFixed(1)}V${(cy + R + size * 0.05).toFixed(1)}" stroke-width="1" stroke-dasharray="2 3"/>`);
  // The name in the script, small, between the rings.
  const gl = sc.word(name).slice(0, 10);
  const k = size / 1000;
  gl.forEach((g, i) => {
    const t = -Math.PI / 2 + ((i + 0.5) / Math.max(6, gl.length)) * Math.PI * 2;
    const gx = cx + Math.cos(t) * (R + size * 0.1) - (g.w * k) / 2, gy = cy + Math.sin(t) * (R + size * 0.1) - 50 * k;
    for (const q of g.prims) parts.push(primSvg(q, gx, gy, k).replace(/^<(path|circle)/, '<$1 stroke-width="1"'));
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><g fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</g><style>.f{fill:${ink};stroke:none}</style></svg>`;
}
