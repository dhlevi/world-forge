import { hashString, mulberry32, type Rng } from '../gen/rng';
import type { Language } from './language';
import { CONS, VOW, isVowel } from './phonemes';
import { numberSystem } from './numbers';

/**
 * Writing systems. Every language has a script, chosen from its template (Nordic runes, Celtic
 * ogham, a Latin-like alphabet, elvish letters with vowel marks, a flowing right-to-left abjad,
 * a Sanskrit-like abugida hanging from its headline, kana-like brush syllables, Sinic-like
 * characters built from radicals, Hangul-like syllable blocks whose letters show where the sound
 * is made, Maya-like glyph blocks, or cuneiform wedges pressed in clay), with drift sometimes
 * giving a people another kind. The glyphs are generated from the language's seed, one for each
 * of its sounds (or syllables, or letter parts), and words are written from their sounds.
 *
 * Glyphs are lists of strokes in a box 100 high (and `w` wide), drawn as SVG.
 */

export type ScriptStyle = 'runes' | 'ogham' | 'latin' | 'elvish' | 'abjad' | 'devanagari' | 'kana' | 'hanzi' | 'hangul' | 'glyphs' | 'cuneiform';
export type ScriptKind = 'alphabet' | 'abjad' | 'abugida' | 'syllabary' | 'logosyllabary' | 'featural';

/** line: a polyline [x0, y0, x1, y1, ...]; quad: [x0, y0, cx, cy, x1, y1]; circ: an outlined circle [cx, cy, r]; dot: a filled circle; poly: a filled polygon. */
type Prim = { k: 'line' | 'quad' | 'circ' | 'dot' | 'poly'; p: number[] };
export interface Glyph {
  prims: Prim[];
  /** Advance width (the box is 100 high). */
  w: number;
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
  direction: 'ltr' | 'rtl' | 'ttb';
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
const KIND: Record<ScriptStyle, ScriptKind> = {
  runes: 'alphabet', ogham: 'alphabet', latin: 'alphabet', elvish: 'abugida', abjad: 'abjad', devanagari: 'abugida', kana: 'syllabary', hanzi: 'logosyllabary',
  hangul: 'featural', glyphs: 'syllabary', cuneiform: 'syllabary',
};
const LABEL: Record<ScriptStyle, string> = {
  runes: 'an alphabet of runes, cut in straight strokes for wood and stone', ogham: 'an alphabet of notches and strokes along a stem line, cut on the edges of standing stones',
  latin: 'an alphabet of rounded letters, written with a pen', elvish: 'letters of stems and bows, with the vowels written as marks above them',
  abjad: 'a flowing abjad, its letters joined along the line, written from right to left; short vowels are not written',
  devanagari: 'an abugida hanging from a headline: each letter carries a vowel unless a mark changes or silences it',
  kana: 'a syllabary of brush strokes, one sign for each syllable', hanzi: 'characters built from radicals, one for each syllable, written in columns',
  hangul: 'an alphabet written in syllable blocks, its letters drawn from the shape of the mouth', glyphs: 'glyph blocks carved in stone, one for each syllable',
  cuneiform: 'wedges pressed into clay with a reed, one sign for each syllable',
};
const LOOK: Record<ScriptStyle, { ink: string; paper: string; stroke: number }> = {
  runes: { ink: '#2b2420', paper: '#f3ead3', stroke: 6 }, ogham: { ink: '#2b2420', paper: '#f3ead3', stroke: 6 }, latin: { ink: '#2b2420', paper: '#f3ead3', stroke: 6 },
  elvish: { ink: '#2b2420', paper: '#f3ead3', stroke: 5 }, abjad: { ink: '#2b2420', paper: '#f3ead3', stroke: 6 }, devanagari: { ink: '#2b2420', paper: '#f3ead3', stroke: 6 },
  kana: { ink: '#1f1a17', paper: '#f5efe2', stroke: 8 }, hanzi: { ink: '#1f1a17', paper: '#f5efe2', stroke: 6 }, hangul: { ink: '#1f1a17', paper: '#f5efe2', stroke: 6 },
  glyphs: { ink: '#3d3328', paper: '#ddd3bf', stroke: 4 }, cuneiform: { ink: '#4b3a2a', paper: '#d7b98d', stroke: 3 },
};

const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];
const DIGIT_EN = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const L_ = (...p: number[]): Prim => ({ k: 'line', p });
const Q_ = (...p: number[]): Prim => ({ k: 'quad', p });
const C_ = (...p: number[]): Prim => ({ k: 'circ', p });
const D_ = (...p: number[]): Prim => ({ k: 'dot', p });
const P_ = (...p: number[]): Prim => ({ k: 'poly', p });

/** Moves and scales primitives (radii scale with the smaller factor). */
function tf(prims: Prim[], sx: number, sy: number, tx: number, ty: number): Prim[] {
  const sr = Math.min(sx, sy);
  return prims.map((q) => ({
    k: q.k,
    p: q.k === 'circ' || q.k === 'dot' ? [q.p[0] * sx + tx, q.p[1] * sy + ty, q.p[2] * sr] : q.p.map((v, i) => (i % 2 ? v * sy + ty : v * sx + tx)),
  }));
}
const sig = (prims: Prim[]) => prims.map((q) => `${q.k}${q.p.map((v) => Math.round(v / 4)).join(',')}`).sort().join('|');

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
    // A drifting people may have taken up another kind of writing.
    if (r() < L.drift * 0.4) style = pick(r, Object.keys(KIND) as ScriptStyle[]);
    if (force) style = force;
    const direction = style === 'abjad' ? 'rtl' : style === 'hanzi' || (style === 'kana' && r() < 0.5) ? 'ttb' : style === 'runes' && r() < 0.2 ? 'rtl' : 'ltr';
    const kind = KIND[style];
    const notes: string[] = [];
    if (style === 'devanagari') notes.push(`Every consonant carries the vowel ${this.inherentSpell()} unless a mark gives it another; a stroke beneath silences it.`);
    if (style === 'elvish') notes.push('Consonants are written as letters; each vowel is a mark above the consonant before it, or above a short carrier where no consonant comes first.');
    if (style === 'abjad') notes.push('Only consonants and long vowels are written, and a vowel that begins a word stands on a carrier stroke.');
    if (kind === 'syllabary' || kind === 'logosyllabary') notes.push('A consonant with no vowel of its own (a cluster, or a closing consonant) takes a sign of its own.');
    if (style === 'hangul') notes.push('Consonants are drawn from where they are made: a lip-box for sounds made with the lips, an angle for those at the back of the mouth, a corner for the tongue tip, a roof for hissing sounds, a ring for the throat, with strokes added for each other manner. Vowels are long bars with short ticks.');
    if (style === 'ogham') notes.push('The letters are groups of one to five strokes on one side of the stem, on the other, across it, or as notches on it for the vowels.');
    if (direction === 'ttb') notes.push('It is written in columns, from the top down, the columns running from right to left.');
    else if (direction === 'rtl') notes.push('It is written from right to left.');
    this.info = { style, kind, direction, label: LABEL[style], notes, ...LOOK[style] };
  }

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

  private latin(key: string, vowel: boolean): Glyph {
    return this.make(`latin:${key}`, (r) => {
      const prims: Prim[] = [];
      const top = 40, base = 100, w = 56;
      const asc = r() < 0.3 ? 5 : top, desc = !vowel && r() < 0.15 ? 125 : base;
      const t = vowel ? pick(r, ['o', 'bowl', 'arch', 'v', 'curl']) : pick(r, ['stem-bowl', 'arch', 'v', 'stem-arm', 'bowl-stem', 's', 'x', 'stem-hook', 'o-tail']);
      switch (t) {
        case 'o': prims.push(C_(28, 72, 22 + r() * 6)); if (r() < 0.4) prims.push(L_(28, 50, 28, 94)); break;
        case 'bowl': prims.push(Q_(46, 48, 4, 50, 10, 80), Q_(10, 80, 18, 104, 46, 96)); break;
        case 'arch': prims.push(L_(8, desc, 8, asc), Q_(8, 62, 28, 30, 48, 62), L_(48, 62, 48, base)); break;
        case 'v': prims.push(L_(6, top, 28, base, 50, top)); if (r() < 0.4) prims.push(L_(28, base, 28, desc + 10)); break;
        case 'curl': prims.push(Q_(10, 60, 30, 30, 46, 60), Q_(46, 60, 50, 100, 12, 96)); break;
        case 'stem-bowl': prims.push(L_(8, asc, 8, desc), Q_(8, 46, 58, 50, 8, 96 - (r() < 0.5 ? 26 : 0))); break;
        case 'bowl-stem': prims.push(L_(48, asc, 48, desc), Q_(48, 46, -6, 70, 48, 96)); break;
        case 'stem-arm': prims.push(L_(14, asc, 14, desc), L_(14, pick(r, [top, 70]), 48, pick(r, [top, 70, 54]))); if (r() < 0.5) prims.push(L_(14, base, 48, base)); break;
        case 's': prims.push(Q_(48, 44, 4, 44, 26, 70), Q_(26, 70, 52, 98, 6, 96)); break;
        case 'x': prims.push(L_(6, top, 50, base), L_(50, top, 6, base)); break;
        case 'stem-hook': prims.push(L_(28, asc, 28, 84), Q_(28, 84, 28, 102, 8, 96)); if (r() < 0.6) prims.push(L_(12, top + 6, 44, top + 6)); break;
        default: prims.push(C_(26, 72, 20), L_(46, 80, 54, desc)); break;
      }
      return { prims, w };
    });
  }

  /** Elvish consonant: a stem (short, rising or falling) with one or two bows. */
  private tengwa(key: string): Glyph {
    return this.make(`teng:${key}`, (r) => {
      const prims: Prim[] = [];
      const stem = pick(r, ['short', 'up', 'down']);
      const y0 = stem === 'up' ? 2 : 42, y1 = stem === 'down' ? 132 : 100;
      prims.push(L_(10, y0, 10, y1));
      const bows = r() < 0.4 ? 2 : 1, closed = r() < 0.5, low = r() < 0.5;
      for (let b = 0; b < bows; b++) {
        const x0 = 10 + b * 28, ya = low ? 60 : 44, yb = low ? 100 : 84;
        prims.push(Q_(x0, ya, x0 + 44, ya + (yb - ya) / 2, closed ? x0 : x0 + 6, yb));
      }
      return { prims, w: 26 + bows * 28 };
    });
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

  private abjadLetter(key: string, long: boolean): Glyph {
    return this.make(`abj:${key}`, (r) => {
      const w = 28 + Math.floor(r() * 16);
      const prims: Prim[] = [L_(0, 80, w, 80)];
      const body = long ? pick(r, ['alif', 'waw', 'ya']) : pick(r, ['tooth', 'teeth', 'loop', 'bowl', 'hook', 'tall', 'tooth', 'bowl']);
      const m = w / 2;
      switch (body) {
        case 'alif': case 'tall': prims.push(L_(m, 80, m + 2, 12)); break;
        case 'waw': prims.push(C_(m, 66, 10), Q_(m - 8, 76, m - 12, 100, m - 20, 104)); break;
        case 'ya': prims.push(Q_(w - 4, 80, m, 106, 4, 92)); break;
        case 'tooth': prims.push(L_(m, 80, m, 58)); break;
        case 'teeth': prims.push(L_(m - 8, 80, m - 8, 62), L_(m + 6, 80, m + 6, 62)); break;
        case 'loop': prims.push(C_(m, 68, 11)); break;
        case 'bowl': prims.push(Q_(w - 2, 80, m, 112, 2, 82)); break;
        default: prims.push(Q_(m - 10, 80, m - 10, 46, m + 10, 54)); break;
      }
      const dots = long ? 0 : pick(r, [0, 0, 1, 1, 2, 3]);
      const below = r() < 0.4;
      for (let q = 0; q < dots; q++) prims.push(D_(m - (dots - 1) * 5 + q * 10, below ? 100 : q === 2 ? 38 : 46, 4));
      return { prims, w };
    });
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

  private brush(key: string, strokes: number): Glyph {
    return this.make(`kana:${key}`, (r) => {
      const prims: Prim[] = [];
      const g = () => 12 + Math.floor(r() * 5) * 19;
      for (let q = 0; q < strokes; q++) {
        const x0 = g(), y0 = g(), x1 = g(), y1 = g();
        prims.push(Q_(x0, y0, (x0 + x1) / 2 + (r() - 0.5) * 50, (y0 + y1) / 2 + (r() - 0.5) * 50, x1 === x0 && y1 === y0 ? x1 + 20 : x1, y1));
      }
      return { prims, w: 100 };
    });
  }

  private radicals: Prim[][] | null = null;
  private radical(k: number): Prim[] {
    if (!this.radicals) {
      const r = this.rng('radicals');
      this.radicals = [];
      for (let q = 0; q < 28; q++) {
        const prims: Prim[] = [];
        const n = 2 + Math.floor(r() * 4);
        for (let s = 0; s < n; s++) {
          const t = pick(r, ['h', 'h', 'v', 'v', 'dot', 'left', 'right', 'hook', 'box']);
          const x = 10 + Math.floor(r() * 4) * 20, y = 10 + Math.floor(r() * 4) * 20;
          if (t === 'h') prims.push(L_(Math.max(6, x - 20), y, Math.min(94, x + 20 + r() * 20), y));
          else if (t === 'v') prims.push(L_(x, Math.max(6, y - 20), x, Math.min(94, y + 30 + r() * 20)));
          else if (t === 'dot') prims.push(L_(x - 4, y - 6, x + 4, y + 6));
          else if (t === 'left') prims.push(Q_(x + 10, y - 10, x + 6, y + 20, x - 18, y + 34));
          else if (t === 'right') prims.push(Q_(x - 10, y - 6, x + 4, y + 22, x + 26, y + 34));
          else if (t === 'hook') prims.push(L_(x, y - 20, x, y + 30, x - 10, y + 22));
          else prims.push(L_(x - 14, y - 12, x + 14, y - 12, x + 14, y + 14, x - 14, y + 14, x - 14, y - 12));
        }
        this.radicals.push(prims.map((p) => ({ k: p.k, p: p.p.map((v) => Math.max(4, Math.min(96, v))) })));
      }
    }
    return this.radicals[k % this.radicals.length];
  }
  private hanzi(key: string): Glyph {
    return this.make(`hz:${key}`, (r) => {
      const a = this.radical(Math.floor(r() * 28)), b = this.radical(Math.floor(r() * 28));
      const lay = r();
      const prims = lay < 0.45 ? [...tf(a, 0.4, 1, 2, 0), ...tf(b, 0.56, 1, 42, 0)] : lay < 0.8 ? [...tf(a, 1, 0.42, 0, 2), ...tf(b, 1, 0.56, 0, 42)] : [...a, ...tf(b, 0.4, 0.4, 56, 56)];
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

  private wedges(key: string): Glyph {
    return this.make(`cun:${key}`, (r) => {
      const prims: Prim[] = [];
      const n = 2 + Math.floor(r() * 5);
      const wedge = (x: number, y: number, o: string) => {
        if (o === 'h') prims.push(P_(x, y - 8, x, y + 8, x + 16, y), L_(x + 12, y, x + 44, y));
        else if (o === 'v') prims.push(P_(x - 8, y, x + 8, y, x, y + 16), L_(x, y + 12, x, y + 44));
        else if (o === 'd') prims.push(P_(x - 4, y - 10, x - 10, y + 4, x + 10, y + 10), L_(x + 6, y + 6, x + 28, y + 28));
        else prims.push(L_(x + 18, y - 14, x, y, x + 18, y + 14));
      };
      for (let q = 0; q < n; q++) wedge(10 + Math.floor(r() * 3) * 26, 14 + Math.floor(r() * 3) * 28, pick(r, ['h', 'h', 'v', 'v', 'd', 'w']));
      return { prims, w: 100 };
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
    const group = kind !== 'positional' ? 0 : st === 'cuneiform' ? (base > 12 ? 10 : 0) : st === 'glyphs' || base > 12 ? (base === 60 ? 10 : 5) : 0;
    const composite = kind === 'positional' && (st === 'glyphs' || st === 'cuneiform' || base > 12);
    const bn = { 10: 'ten', 12: 'twelve', 20: 'twenty', 60: 'sixty' }[base] ?? `${base}`;
    let note: string;
    if (kind === 'additive') note = `Numbers are written with signs for one, ${this.addGroup === 5 ? 'five' : 'ten'} and each power of ${bn}, each repeated as often as needed and the largest first, as Roman numerals are.`;
    else if (kind === 'multiplicative') note = `Numbers are written with a digit for each of one to ${base > 12 ? 'nine' : DIGIT_EN[base - 1]} and a sign for each power of ${bn}: each power's sign follows the digit that counts it, and empty places are left out.`;
    else if (composite) note = `Numbers are written by place, in powers of ${bn}. Each digit is built ${st === 'cuneiform' ? `of wedges: ${group ? 'a corner wedge for each ten and ' : ''}an upright wedge for each one` : `of dots and bars: a dot for each one and a bar for each ${group}`}, and ${st === 'cuneiform' ? 'a pair of slanting wedges' : st === 'glyphs' ? 'a shell' : st === 'abjad' ? 'a dot' : 'a ring'} marks an empty place.`;
    else note = `Numbers are written by place, in powers of ${bn}, with ${base} digits, one of them a sign for an empty place (zero).`;
    this.numInfo = { kind, base, group, note };
    return this.numInfo;
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
    const straight = st === 'runes' || st === 'ogham' || st === 'cuneiform';
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
    if (nm.kind === 'positional' && (nm.group || this.info.style === 'cuneiform' || this.info.style === 'glyphs' || nm.base > 12)) return [this.compositeDigit(d)];
    if (d === 0) return [this.zero()];
    const st = this.info.style;
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
            if (i === vi) {
              // The vowel goes over the consonant before it, or over a carrier.
              const prev = i > 0 ? out.pop() : null;
              const base = prev ?? { prims: [L_(10, 60, 10, 100)], w: 24 };
              out.push({ prims: [...base.prims, ...this.tehta(x)], w: base.w });
            } else out.push(this.tengwa(x));
          });
        }
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
          const sign = (k: string, alone: boolean) => (s === 'kana' ? this.brush(k, alone ? 2 : 2 + (hashString(k) % 3)) : s === 'hanzi' ? this.hanzi(k) : s === 'glyphs' ? this.cartouche(k) : this.wedges(k));
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
    if (s === 'runes' || s === 'ogham' || s === 'latin') return [...vows, ...cons].map((x) => ({ label: sp(x), glyph: s === 'runes' ? this.rune(x, isVowel(x)) : s === 'ogham' ? this.ogham(x, isVowel(x)) : this.latin(x, isVowel(x)) }));
    if (s === 'abjad') return [...cons.map((x) => ({ label: sp(x), glyph: this.abjadLetter(x, false) })), ...vows.filter((v) => /ː/.test(v)).map((x) => ({ label: sp(x), glyph: this.abjadLetter(x, true) })), { label: 'carrier', glyph: this.abjadLetter('carrier', true) }];
    if (s === 'elvish') return [...cons.map((x) => ({ label: sp(x), glyph: this.tengwa(x) })), ...vows.map((x) => ({ label: `·${sp(x)}`, glyph: { prims: [L_(10, 60, 10, 100), ...this.tehta(x)], w: 40 } }))];
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
    for (const c of ['', ...cons.slice(0, 7)]) for (const v of vows.slice(0, 5)) out.push({ label: `${c ? sp(c) : ''}${sp(v)}`, glyph: this.word(`${c ? sp(c) : ''}${sp(v)}`)[0] ?? { prims: [], w: 100 } });
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
  const words = text.split(/\s+/).map((w) => (/^\d+$/.test(w) ? w : w.replace(/[^\p{L}'-]/gu, ''))).filter(Boolean).map((w) => (/^\d+$/.test(w) ? sc.numeral(parseInt(w, 10)) : sc.word(w)));
  const { style, direction, ink, paper, stroke } = sc.info;
  const parts: string[] = [];
  const stem = style === 'ogham';
  let W = 0, H = 0;
  if (direction === 'ttb') {
    const colH = Math.max(size * 3, (o.maxWidth ?? 600) * 0.6);
    let x = 0, y = 0;
    const cols: { x: number; items: [Glyph, number][] }[] = [{ x: 0, items: [] }];
    for (const w of words) {
      for (const g of w) {
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
      const cx = W - c.x - size * 1.15;
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
