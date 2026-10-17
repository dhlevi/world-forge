import { hashString, mulberry32 } from '../gen/rng';
import type { Language, Token } from './language';
import { join } from './text';

/**
 * Counting: each language counts in a base (ten for most; twenty, sixty, twelve, or ten with
 * fives counted on the hand for some), and builds its number words from a few roots: the units,
 * a word for the sub-base (ten, or "hand" for five), and words for the powers of the base. The
 * same number always has the same words, whether typed as "23" or "twenty-three". Everything is
 * drawn on a random stream of its own, so adding numbers changed no word, name or grammar.
 */

export type NumKind = 'decimal' | 'quinary' | 'vigesimal' | 'sexagesimal' | 'duodecimal';

export interface NumberSystem {
  kind: NumKind;
  base: number;
  /** Below the base, numbers are counted in this (5 on the hand, or 10), or not at all (0). */
  sub: number;
  /** English description ("counts in tens"). */
  label: string;
  /** Larger parts first ("twenty-three") or the units before the tens ("three-and-twenty"). */
  bigFirst: boolean;
  /** "Three hundred" (multiplier first) or "hundred three". */
  multFirst: boolean;
  /** The tens and units joined into one word. */
  fuse: boolean;
  /** "And" between all parts, before the last only, or none. */
  link: 'none' | 'and' | 'last';
  /** Numbers stand after the noun ("ships three"). */
  after: boolean;
  /** Nouns stay singular after a number ("three ship"). */
  noPlural: boolean;
}

const DEFAULT_KIND: Record<string, NumKind> = { celtic: 'vigesimal', jungle: 'vigesimal', highland: 'vigesimal', lizardfolk: 'sexagesimal', dwarven: 'duodecimal', orcish: 'quinary' };
const BASES: Record<NumKind, [number, number, string]> = {
  decimal: [10, 0, 'counts in tens'],
  quinary: [10, 5, 'counts in tens, and in fives below ten: the five is a hand, and six is "hand and one"'],
  vigesimal: [20, 10, 'counts in twenties (scores), with tens below twenty'],
  sexagesimal: [60, 10, 'counts in sixties, with tens below sixty'],
  duodecimal: [12, 0, 'counts in twelves (dozens)'],
};
/** The English gloss of each root, and the key of its word in the language. */
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
const POWER_KEYS: Record<NumKind, string[]> = {
  decimal: ['ten', 'hundred', 'thousand'],
  quinary: ['ten', 'hundred', 'thousand'],
  vigesimal: ['number:score', 'number:four hundred', 'number:eight thousand'],
  sexagesimal: ['number:sixty', 'number:three thousand six hundred', 'number:great sixty'],
  duodecimal: ['number:dozen', 'number:gross', 'number:great gross'],
};

const cache = new WeakMap<Language, NumberSystem>();

/** A language's way of counting (made once). */
export function numberSystem(L: Language): NumberSystem {
  const hit = cache.get(L);
  if (hit) return hit;
  const r = mulberry32(hashString(`${L.key}#numbers`));
  let kind: NumKind = DEFAULT_KIND[L.t.id] ?? 'decimal';
  // A drifting tongue may count another way (most often in tens).
  if (r() < L.drift * 0.3) {
    const x = r() * 10;
    kind = x < 6 ? 'decimal' : x < 7.6 ? 'vigesimal' : x < 8.6 ? 'quinary' : x < 9.5 ? 'duodecimal' : 'sexagesimal';
  }
  const [base, sub, label] = BASES[kind];
  const g = L.grammar;
  const sys: NumberSystem = {
    kind, base, sub, label,
    bigFirst: r() < 0.72,
    multFirst: g.adj === 'before' || r() < 0.6,
    fuse: r() < 0.5,
    link: r() < 0.5 ? 'none' : r() < 0.5 ? 'and' : 'last',
    after: g.adj === 'after' && r() < 0.4,
    noPlural: g.plural === 'none' || r() < 0.25,
  };
  cache.set(L, sys);
  return sys;
}

interface Part {
  /** The words (most parts are one word; "three hundred" is two). */
  toks: Token[];
  /** Value of the part. */
  v: number;
  /** Arithmetic, for the structure ("3×20"). */
  s: string;
}

const atomKey = (d: number) => (d <= 10 ? DIGITS[d] : d === 11 ? 'number:eleven' : `number:${d}`);

const rootCache = new WeakMap<Language, Map<string, string>>();
/**
 * The roots of counting (units, the hand or ten, the powers, "and"), each different from the
 * others: a root that sounds like another already taken gives way to a new word.
 */
function root(L: Language, key: string): string {
  let m = rootCache.get(L);
  if (!m) {
    m = new Map();
    rootCache.set(L, m);
    const sys = numberSystem(L);
    const keys = ['and', sys.sub === 5 ? 'hand' : 'ten', ...DIGITS.slice(1, sys.sub || sys.base).map((_, i) => atomKey(i + 1)), ...POWER_KEYS[sys.kind], 'number:zero'];
    const taken = new Set<string>();
    for (const k of keys) {
      if (m.has(k)) continue;
      let w = L.word(k).spell;
      for (let t = 1; t < 8 && taken.has(w); t++) w = L.word(`number:${k}#${t}`).spell;
      taken.add(w);
      m.set(k, w);
    }
  }
  return m.get(key) ?? L.word(key).spell;
}
const one = (form: string, v: number, s = `${v}`): Part => ({ toks: [{ form, gloss: `${v}` }], v, s });

/** A word for a digit below the base (made of the sub-base and units where the language counts so). */
function digit(L: Language, sys: NumberSystem, d: number): Part {
  const atom = (x: number) => one(root(L, atomKey(x)), x);
  if (!sys.sub || d < sys.sub) return atom(d);
  const q = Math.floor(d / sys.sub), u = d % sys.sub;
  const subW = root(L, sys.sub === 5 ? 'hand' : 'ten');
  let head = one(subW, sys.sub);
  if (q > 1) {
    const m = root(L, atomKey(q));
    head = one(sys.multFirst ? join(m, subW) : join(subW, m), q * sys.sub, `${q}×${sys.sub}`);
  }
  if (!u) return head;
  const a = root(L, atomKey(u)), hf = head.toks[0].form;
  return one(sys.bigFirst ? join(hf, a) : join(a, hf), d, sys.bigFirst ? `${head.s}+${u}` : `${u}+${head.s}`);
}

function parts(L: Language, sys: NumberSystem, n: number): Part[] {
  const b = sys.base;
  if (n === 0) return [one(root(L, 'number:zero'), 0)];
  const out: Part[] = [];
  const b3 = b ** 3;
  let rest = n;
  const pow = (p: number) => root(L, POWER_KEYS[sys.kind][p - 1]);
  // The largest power is counted with a whole number of its own ("twenty-one thousand").
  if (rest >= b3) {
    const q = Math.floor(rest / b3);
    rest %= b3;
    const pw = { form: pow(3), gloss: `${b3}` };
    if (q === 1) out.push({ toks: [pw], v: b3, s: `${b3}` });
    else {
      const m = numberTokens(L, q);
      const ms = parts(L, sys, q).map((x) => x.s).join('+');
      out.push({ toks: sys.multFirst ? [...m, pw] : [pw, ...m], v: q * b3, s: `${q > b ? `(${ms})` : ms}×${b3}` });
    }
  }
  for (let p = 2; p >= 0; p--) {
    const bp = b ** p;
    const d = Math.floor(rest / bp);
    rest %= bp;
    if (!d) continue;
    if (p === 0) {
      out.push(digit(L, sys, d));
      continue;
    }
    const pw = pow(p);
    if (d === 1) {
      out.push(one(pw, bp));
      continue;
    }
    const m = digit(L, sys, d);
    const ms = `${m.s.includes('+') ? `(${m.s})` : m.s}×${bp}`;
    const mf = m.toks[0].form;
    // Tens (the first power) join their multiplier in one word ("thirty"); hundreds stand apart.
    if (p === 1) out.push(one(sys.multFirst ? join(mf, pw) : join(pw, mf), d * bp, ms));
    else {
      const pt = { form: pw, gloss: `${bp}` };
      out.push({ toks: sys.multFirst ? [m.toks[0], pt] : [pt, m.toks[0]], v: d * bp, s: ms });
    }
  }
  // Units before the tens in some tongues ("three-and-twenty").
  const last = out[out.length - 1], prev = out[out.length - 2];
  if (!sys.bigFirst && prev && last && prev.v < b * b && last.v < b) [out[out.length - 2], out[out.length - 1]] = [last, prev];
  return out;
}

/** A number in words, as tokens (each glossed with its value). */
export function numberTokens(L: Language, n: number): Token[] {
  const sys = numberSystem(L);
  const ps = parts(L, sys, Math.max(0, Math.floor(n)));
  const and = root(L, 'and');
  // The last two parts below the base squared may be one word ("twentythree"; "threeandtwenty").
  if (sys.fuse && ps.length >= 2) {
    const a = ps[ps.length - 2], c = ps[ps.length - 1];
    const af = a.toks[0].form, cf = c.toks[0].form;
    // Only a short "and" goes inside the word; a joined number stays a manageable length.
    const form = sys.link !== 'none' && and.length <= 3 ? join(join(af, and), cf) : join(af, cf);
    if (a.v + c.v < sys.base * sys.base && a.toks.length === 1 && c.toks.length === 1 && form.length <= 13) {
      ps.splice(ps.length - 2, 2, { toks: [{ form, gloss: `${a.v + c.v}` }], v: a.v + c.v, s: `${a.s}+${c.s}` });
    }
  }
  const out: Token[] = [];
  ps.forEach((p, i) => {
    if (i > 0 && (sys.link === 'and' || (sys.link === 'last' && i === ps.length - 1))) out.push({ form: and, gloss: 'and' });
    out.push(...p.toks);
  });
  return out.map((t, i) => (i === 0 ? { form: t.form, gloss: t.gloss, num: Math.max(0, Math.floor(n)) } : { form: t.form, gloss: t.gloss, inNum: true }));
}

/** Tokens as text to write: each number as its digits (written in the script's numerals), the rest as spelled. */
export function writable(tokens: Token[]): string {
  return tokens.map((t) => (t.num !== undefined ? `${t.num}` : t.inNum ? '' : t.form)).filter(Boolean).join(' ');
}

/** A number in words, as one string. */
export function numberWord(L: Language, n: number): string {
  return numberTokens(L, n).map((t) => t.form).join(' ');
}

/** How a number is built, as arithmetic in the language's order ("3×20 + 10+3"). */
export function numberStructure(L: Language, n: number): string {
  const sys = numberSystem(L);
  return parts(L, sys, Math.max(0, Math.floor(n))).map((p) => p.s).join(' + ');
}

/** Numbers to show in the culture window. */
export function numberExamples(L: Language): number[] {
  const b = numberSystem(L).base;
  return [...new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 20, 23, b, b + 7, 60, 100, b * b, 365, 1000, 1234])].sort((x, y) => x - y);
}

// ---- English ----------------------------------------------------------------------------------

const EN_UNITS: Record<string, number> = {
  zero: 0, nought: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const EN_MULT: Record<string, number> = { hundred: 100, score: 20, dozen: 12, gross: 144 };
const EN_BIG: Record<string, number> = { thousand: 1000, million: 1e6 };

export const isEnglishNumber = (w: string) => /^\d+$/.test(w) || w in EN_UNITS || w in EN_MULT || w in EN_BIG;

/**
 * Reads an English number from `words` at `i` ("23", "twenty three", "three hundred and five",
 * "4 thousand", "a dozen" is left to the article). Returns its value and the index after it.
 */
export function readEnglishNumber(words: string[], i: number): { n: number; next: number } | null {
  let total = 0, cur = 0, seen = false, j = i;
  while (j < words.length) {
    const w = words[j];
    if (/^\d+$/.test(w)) {
      if (seen && cur) break;
      cur += parseInt(w, 10);
    } else if (w in EN_UNITS) {
      // "Twenty three" adds; "three twenty" does not.
      if (seen && cur % 10 !== 0 && cur < 100 && EN_UNITS[w] < 100) break;
      if (seen && cur && cur % 100 !== 0 && EN_UNITS[w] >= 20) break;
      cur += EN_UNITS[w];
    } else if (w in EN_MULT) cur = (cur || 1) * EN_MULT[w];
    else if (w in EN_BIG) {
      total += (cur || 1) * EN_BIG[w];
      cur = 0;
    } else if (w === 'and' && seen && (words[j - 1] in EN_MULT || words[j - 1] in EN_BIG) && words[j + 1] && isEnglishNumber(words[j + 1]) && !/^\d+$/.test(words[j + 1])) {
      j++;
      continue;
    } else break;
    seen = true;
    j++;
  }
  if (!seen) return null;
  return { n: total + cur, next: j };
}
