import type { Language, Token } from './language';
import { LEX } from './lexicon';
import { isEnglishNumber, numberSystem, numberTokens, readEnglishNumber } from './numbers';
import { hashString, mulberry32 } from '../gen/rng';

/**
 * Translates simple English into a language: noun phrases (articles, adjectives, plurals,
 * possession with "of" or "'s"), numbers (as digits or words, "3" and "three" alike, in the
 * language's own way of counting), pronouns, one verb with its tense, negation and subject
 * agreement, and phrases with prepositions, put in the language's word order. Words outside the
 * core vocabulary get words of their own, made the same way, so anything can be translated.
 */

/** Possessive words, by the person of the owner (as the pronouns: I, you, he, she, it, we, you all, they). */
const POSSESSIVE: Record<string, number> = { my: 0, thy: 1, your: 1, his: 2, her: 3, its: 4, our: 5, their: 7 };
const PRONOUN: Record<string, number> = { i: 0, me: 0, you: 1, he: 2, him: 2, she: 3, her: 3, it: 4, we: 5, us: 5, they: 7, them: 7 };
const PREPS = new Set(['in', 'on', 'at', 'to', 'from', 'by', 'with', 'near', 'under', 'over', 'into', 'through', 'for', 'across', 'beyond', 'behind', 'before', 'after', 'among', 'beside', 'upon', 'towards', 'against', 'within', 'without']);
const DETS = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'some']);
const IRREG_PAST: Record<string, string> = {
  saw: 'see', went: 'go', came: 'come', gave: 'give', took: 'take', made: 'make', ate: 'eat', spoke: 'speak', said: 'say', knew: 'know', sang: 'sing', fought: 'fight',
  built: 'build', slept: 'sleep', fell: 'fall', stood: 'stand', sat: 'sit', grew: 'grow', found: 'find', lost: 'lose', held: 'hold', rode: 'ride', ran: 'run',
  flew: 'fly', fled: 'flee', swam: 'swim', drank: 'drink', thought: 'think', heard: 'hear', was: 'be', were: 'be', had: 'have', did: 'do', burnt: 'burn', brought: 'bring', told: 'tell',
};
const IRREG_PLURAL: Record<string, string> = { men: 'man', women: 'woman', children: 'child', teeth: 'tooth', feet: 'foot', geese: 'goose', mice: 'mouse', wolves: 'wolf', knives: 'knife', lives: 'life', elves: 'elf', dwarves: 'dwarf', leaves: 'leaf', thieves: 'thief', oxen: 'ox' };
const BE = new Set(['is', 'are', 'am']);

interface NP {
  tokens: Token[];
  person: number;
}
type Part = { k: 'np'; np: NP } | { k: 'v'; v: string; tense: 'past' | 'present' | 'future'; neg: boolean } | { k: 'pp'; prep: string; np: NP };

const isVerb = (w: string) => LEX.get(w)?.pos === 'v';
function verbOf(w: string): { v: string; tense: 'past' | 'present' } | null {
  if (IRREG_PAST[w]) return { v: IRREG_PAST[w], tense: 'past' };
  if (BE.has(w)) return { v: 'be', tense: 'present' };
  if (isVerb(w)) return { v: w, tense: 'present' };
  if (w.endsWith('ed')) {
    for (const s of [w.slice(0, -2), w.slice(0, -1), w.slice(0, -3)]) if (isVerb(s)) return { v: s, tense: 'past' };
    if (w.endsWith('ied') && isVerb(`${w.slice(0, -3)}y`)) return { v: `${w.slice(0, -3)}y`, tense: 'past' };
  }
  if (w.endsWith('s')) {
    for (const s of [w.slice(0, -1), w.slice(0, -2)]) if (isVerb(s)) return { v: s, tense: 'present' };
  }
  return null;
}
function nounOf(w: string): { n: string; plural: boolean } {
  if (IRREG_PLURAL[w]) return { n: IRREG_PLURAL[w], plural: true };
  if (LEX.has(w) || w.length < 4) return { n: w, plural: false };
  if (w.endsWith('ies') && LEX.has(`${w.slice(0, -3)}y`)) return { n: `${w.slice(0, -3)}y`, plural: true };
  if (w.endsWith('es') && LEX.has(w.slice(0, -2))) return { n: w.slice(0, -2), plural: true };
  if (w.endsWith('s') && !w.endsWith('ss')) return { n: w.slice(0, -1), plural: true };
  return { n: w, plural: false };
}

/** Proper names in a phrase are marked ‹like this› and kept as they are. */
export const PROPER = (s: string) => `\u2039${s}\u203A`;
export const unmark = (s: string) => s.replace(/[\u2039\u203A]/g, '');

/** Words that stay lowercase in a name ("Lac de Belle", "al-Medina"). */
const FUNCTION_GLOSS = new Set(['the', 'a', 'of', 'GEN', 'DEF', 'NEG', 'PST', 'FUT', 'and']);

/** A translated name, capitalized like one: content words capitalized, particles and articles not. */
export function nameCase(tokens: Token[]): string {
  return tokens
    .map((t, k) => {
      if (k > 0 && (FUNCTION_GLOSS.has(t.gloss) || /^(in|on|at|to|from|by|with|near|under|over|for)$/.test(t.gloss))) return t.form;
      // "al-medina" → "al-Medina"; "medina" → "Medina".
      return t.form.replace(/(^|-)(\p{L})/gu, (m, a: string, c: string) => (a && /^DEF/.test(t.gloss) ? a + c.toUpperCase() : a ? m : c.toUpperCase()));
    })
    .join(' ')
    .replace(/^./, (c) => c.toUpperCase());
}

export function translate(L: Language, text: string, o: { capitalsProper?: boolean; known?: Set<string> } = {}): Token[] {
  // Proper names become placeholders, so they pass through untouched.
  const propers: string[] = [];
  let src = text.replace(/\u2039([^\u203A]+)\u203A/g, (_, p: string) => ` zzp${propers.push(p) - 1}zz `);
  if (o.capitalsProper) {
    src = src.replace(/(^|[^\p{L}'])(\p{Lu}[\p{L}']*)/gu, (m, pre: string, w: string, off: number) => {
      const first = src.slice(0, off).trim() === '' || /[.!?]\s*$/.test(src.slice(0, off));
      const lw = w.toLowerCase();
      if (o.known?.has(lw) || LEX.has(lw) || isEnglishNumber(lw) || PRONOUN[lw] !== undefined || DETS.has(lw) || PREPS.has(lw) || verbOf(lw) || (nounOf(lw).plural && LEX.has(nounOf(lw).n))) return m;
      if (first && lw.length < 3) return m;
      return `${pre} zzp${propers.push(w) - 1}zz `;
    });
  }
  const isProper = (w: string) => /^zzp\d+zz$/.test(w);
  const properTok = (w: string): Token => {
    const p = propers[+w.slice(3, -2)];
    return { form: p, gloss: p };
  };
  const words = src.replace(/(\d),(?=\d{3}\b)/g, '$1').toLowerCase().replace(/n't\b/g, ' not').replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean);
  let i = 0;
  const parts: Part[] = [];

  const parseNP = (): NP | null => {
    if (i >= words.length) return null;
    const w = words[i];
    // A proper name, alone or naming the noun after it ("Varsk Caves").
    if (isProper(w)) {
      i++;
      const p = properTok(w);
      const nx = words[i];
      if (nx && !PREPS.has(nx) && nx !== 'of' && !DETS.has(nx) && !isProper(nx) && PRONOUN[nx] === undefined && !verbOf(nx)) {
        const head = parseNP();
        if (head) return { tokens: L.appose(head.tokens, p), person: head.person };
      }
      return { tokens: [p], person: 2 };
    }
    // "My", "your", "her" before a noun ("her" alone is the pronoun); "your all" for the plural.
    let poss = -1;
    if (POSSESSIVE[w] !== undefined) {
      const nx = words[i + 1];
      const possible = !!nx && !PREPS.has(nx) && nx !== 'of' && !DETS.has(nx) && PRONOUN[nx] === undefined && (w !== 'her' || !verbOf(nx) || LEX.get(nx)?.pos === 'n');
      if (possible || w !== 'her') {
        poss = POSSESSIVE[w];
        i++;
        if (poss === 1 && (words[i] === 'all' || words[i] === "y'all")) {
          poss = 6;
          i++;
        }
      }
    }
    if (poss < 0 && PRONOUN[w] !== undefined) {
      i++;
      const p = PRONOUN[w];
      return { tokens: [{ form: L.pronoun(p).spell, gloss: ['I', 'you', 'he', 'she', 'it', 'we', 'you.PL', 'they'][p] }], person: p };
    }
    let def = false, indef = false;
    if (poss < 0 && DETS.has(w)) {
      def = w !== 'a' && w !== 'an' && w !== 'some';
      indef = w === 'a' || w === 'an';
      i++;
    }
    // A number ("3", "three", "three hundred and five"), counting the noun after it or standing alone.
    let num: number | null = null;
    const rn = readEnglishNumber(words, i);
    if (rn) {
      num = rn.n;
      i = rn.next;
      // "One" after an article is a pronoun-like noun ("the one"): left to the noun parser.
    }
    const numToks = () => (num === null ? undefined : { toks: numberTokens(L, num), after: numberSystem(L).after });
    const nPlural = (pl: boolean) => (num === null ? pl : num !== 1 && !numberSystem(L).noPlural);
    if (num !== null && (i >= words.length || PREPS.has(words[i]) || words[i] === 'of' || verbOf(words[i]) || DETS.has(words[i]) || PRONOUN[words[i]] !== undefined || words[i] === 'and')) {
      // A number alone ("the 3 of them", "in 1240").
      return { tokens: numberTokens(L, num), person: num === 1 ? 2 : 7 };
    }
    const adjs: string[] = [];
    while (i < words.length - 1 && LEX.get(words[i])?.pos === 'adj' && !PREPS.has(words[i + 1])) adjs.push(words[i++]);
    if (i >= words.length || PREPS.has(words[i]) || words[i] === 'of') {
      if (!adjs.length) return null;
      const last = adjs.pop()!;
      return { tokens: L.nounPhrase(last, { adjs, def, indef, plural: nPlural(false), num: numToks(), ...(poss >= 0 ? { poss } : {}) }), person: 2 };
    }
    // Adjectives before a proper name ("New ‹Ashford›"), perhaps naming a noun after it ("the Old ‹Ashford› Road").
    let pre: Token | null = null;
    if (isProper(words[i])) {
      pre = properTok(words[i++]);
      const nx = words[i];
      if (!nx || PREPS.has(nx) || nx === 'of' || DETS.has(nx) || isProper(nx) || verbOf(nx)) {
        const adjToks = adjs.map((a) => ({ form: L.word(a).spell, gloss: a }));
        return { tokens: L.grammar.adj === 'before' ? [...adjToks, pre] : [pre, ...adjToks], person: 2 };
      }
    }
    let raw = words[i++];
    let possessive = false;
    if (raw.endsWith("'s")) {
      raw = raw.slice(0, -2);
      possessive = true;
    }
    const { n, plural } = nounOf(raw.replace(/'$/, ''));
    let np: NP = { tokens: L.nounPhrase(n, { adjs, def, indef, plural: nPlural(plural), num: numToks(), ...(poss >= 0 ? { poss } : {}) }), person: plural || (num ?? 1) > 1 ? 7 : 2 };
    if (pre) np = { tokens: L.appose(np.tokens, pre), person: np.person };
    // A noun naming the proper name after it ("Castle Varsk", "Lake Kethvik").
    if (words[i] && isProper(words[i])) np = { tokens: L.appose(np.tokens, properTok(words[i++])), person: np.person };
    if (possessive) {
      const thing = parseNP();
      if (thing) np = { tokens: L.possess(thing.tokens, np.tokens), person: thing.person };
    }
    if (words[i] === 'of') {
      i++;
      const owner = parseNP();
      if (owner) np = { tokens: L.possess(np.tokens, owner.tokens), person: np.person };
    }
    return np;
  };

  while (i < words.length) {
    const w = words[i];
    if (w === 'will' || w === 'shall') {
      i++;
      let neg = false;
      if (words[i] === 'not') {
        neg = true;
        i++;
      }
      const v = words[i] && verbOf(words[i]);
      if (v) {
        i++;
        parts.push({ k: 'v', v: v.v, tense: 'future', neg });
      }
      continue;
    }
    if (w === 'do' || w === 'does' || w === 'did') {
      const past = w === 'did';
      i++;
      let neg = false;
      if (words[i] === 'not') {
        neg = true;
        i++;
      }
      const v = words[i] && verbOf(words[i]);
      if (v) {
        i++;
        parts.push({ k: 'v', v: v.v, tense: past ? 'past' : 'present', neg });
      } else parts.push({ k: 'v', v: 'do', tense: past ? 'past' : 'present', neg });
      continue;
    }
    if (PREPS.has(w)) {
      i++;
      const np = parseNP();
      if (np) parts.push({ k: 'pp', prep: w, np });
      continue;
    }
    const hasVerb = parts.some((p) => p.k === 'v');
    const v = verbOf(w);
    // A word that may be a verb is one when a subject came first (or nothing did) and no verb yet.
    if (v && !hasVerb && (parts.some((p) => p.k === 'np') || PRONOUN[words[i - 1] ?? ''] !== undefined || i === 0) && !DETS.has(words[i - 1] ?? '')) {
      i++;
      let neg = false;
      if (words[i] === 'not') {
        neg = true;
        i++;
      }
      parts.push({ k: 'v', v: v.v, tense: v.tense, neg });
      continue;
    }
    if (w === 'not' || w === 'and') {
      i++;
      if (w === 'and') parts.push({ k: 'np', np: { tokens: [{ form: L.word('and').spell, gloss: 'and' }], person: -1 } });
      continue;
    }
    const np = parseNP();
    if (np) parts.push({ k: 'np', np });
    else i++;
  }

  const vi = parts.findIndex((p) => p.k === 'v');
  if (vi < 0) return parts.flatMap((p) => (p.k === 'np' ? p.np.tokens : p.k === 'pp' ? L.adpose(p.prep, p.np.tokens) : []));
  const vp = parts[vi] as Extract<Part, { k: 'v' }>;
  const subj = parts.slice(0, vi).reverse().find((p) => p.k === 'np') as Extract<Part, { k: 'np' }> | undefined;
  const obj = parts.slice(vi + 1).find((p) => p.k === 'np') as Extract<Part, { k: 'np' }> | undefined;
  const extra = parts.filter((p) => p.k === 'pp' || (p.k === 'np' && p !== subj && p !== obj)).flatMap((p) => (p.k === 'pp' ? L.adpose(p.prep, p.np.tokens) : p.k === 'np' ? p.np.tokens : []));
  const verb = L.verb(vp.v, vp.tense, subj?.np.person ?? 2, vp.neg);
  return L.clause(subj?.np.tokens ?? [], verb, obj?.np.tokens ?? [], extra);
}

// ---- Sentences, punctuation and emphasis ---------------------------------------------------

/**
 * How a language asks and exclaims: a yes-or-no question is marked by a particle at the start of
 * the sentence (as Polish "czy") or at its end (as Japanese "ka"), by a particle fixed to its
 * first word (as Latin "-ne"), or by the voice alone; an exclamation may open with an
 * interjection ("O ...!") or close with an emphatic particle. Some languages open questions and
 * exclamations with turned marks too (¿ ¡), as Spanish does.
 */
export interface Speech {
  question: 'start' | 'end' | 'enclitic' | 'none';
  exclaim: 'start' | 'end' | 'none';
  turned: boolean;
}
const speechCache = new WeakMap<Language, Speech>();
export function speechOf(L: Language): Speech {
  let sp = speechCache.get(L);
  if (sp) return sp;
  const r = mulberry32(hashString(`${L.key}#speech`));
  const order = L.grammar.order;
  // Verb-final languages lean to a closing particle, verb-first ones to an opening one.
  const w: [Speech['question'], number][] = order.endsWith('V')
    ? [['end', 6], ['enclitic', 1.5], ['start', 1], ['none', 1.5]]
    : order.startsWith('V') ? [['start', 6], ['enclitic', 1.5], ['end', 1], ['none', 1.5]] : [['start', 2.5], ['end', 2.5], ['enclitic', 2], ['none', 3]];
  let t = r() * w.reduce((a, x) => a + x[1], 0), question: Speech['question'] = 'none';
  for (const [k, x] of w) {
    t -= x;
    if (t < 0) {
      question = k;
      break;
    }
  }
  const e = r();
  sp = { question, exclaim: e < 0.5 ? 'none' : e < 0.8 ? 'start' : 'end', turned: r() < (question === 'none' ? 0.45 : 0.12) };
  speechCache.set(L, sp);
  return sp;
}

const WH = new Set(['who', 'what', 'where', 'when', 'why', 'how', 'which', 'whom', 'whose']);
const AUX = new Set(['do', 'does', 'did', 'is', 'are', 'am', 'was', 'were', 'will', 'shall']);
/** Marks that close up to the word before them, and those that open onto the word after. */
export const CLOSING = new Set(['.', ',', ';', ':', '?', '!', '”']);
export const OPENING = new Set(['“', '¿', '¡']);

/** The question particle fixed to a word: its first syllable or so ("-ne", "-ka"). */
function enclitic(L: Language): string {
  const sp = L.word('question:enclitic').spell.toLowerCase();
  return sp.match(/^[^aeiouyäöüáéíóúâêîôûåæøë]*[aeiouyäöüáéíóúâêîôûåæøë]+/)?.[0] ?? sp.slice(0, 2);
}

/**
 * Turns a yes-or-no question's word order back to a statement's, for the translator: "is the
 * king old" → "the king is old", "will you come" → "you will come" (a question word stays first).
 */
function unInvert(words: string[]): string[] {
  const k = WH.has(words[0]) ? 1 : 0;
  if (!AUX.has(words[k] ?? '')) return words;
  let j = k + 1;
  const np: string[] = [];
  if (PRONOUN[words[j]] !== undefined) np.push(words[j++]);
  else {
    while (j < words.length && (DETS.has(words[j]) || POSSESSIVE[words[j]] !== undefined || LEX.get(words[j])?.pos === 'adj' || isEnglishNumber(words[j]))) np.push(words[j++]);
    if (j < words.length) np.push(words[j++]);
  }
  if (!np.length) return words;
  return [...words.slice(0, k), ...np, words[k], ...words.slice(j)];
}

/**
 * Translates English text of one or more sentences with their punctuation: each clause between
 * commas, semicolons and colons is translated as `translate` does, and the marks are kept as
 * tokens of their own. A sentence ending in "?" is asked in the language's way (see Speech), its
 * question word put first; one ending in "!" is exclaimed in its way; words written *so* are
 * stressed. Quotation marks are kept. Each sentence begins with a capital.
 */
export function translateText(L: Language, text: string): Token[] {
  const sp = speechOf(L);
  const out: Token[] = [];
  const mark = (m: string): Token => ({ form: m, gloss: '', punct: m });
  // Sentences, each with its clauses and the marks after them.
  const re = /([^.!?;:,"“”«»]+)|([.!?]+|[;:,]|["“”«»])/g;
  let sentence: { text: string; after: string }[] = [];
  let quoteOpen = false;
  const flush = (end: string) => {
    if (!sentence.length && !end) return;
    const q = end.includes('?'), x = !q && end.includes('!');
    const start = out.length;
    sentence.forEach((cl, ci) => {
      let src = cl.text;
      const emph = new Set<string>();
      src = src.replace(/\*([^*]+)\*|_([^_]+)_/g, (_, a: string, b: string) => {
        // Each stressed word and its stem ("wolves" → "wolf", "fled" → "flee"), to find its tokens by their gloss.
        for (const wd0 of (a ?? b).toLowerCase().split(/\s+/)) {
          const wd = wd0.replace(/[^a-z']/g, '');
          if (!wd) continue;
          emph.add(wd);
          emph.add(nounOf(wd).n);
          const v = verbOf(wd);
          if (v) emph.add(v.v);
        }
        return a ?? b;
      });
      if (q && ci === 0) {
        const words = src.trim().split(/\s+/);
        const lower = words.map((wd) => wd.toLowerCase());
        const re2 = unInvert(lower);
        if (re2 !== lower) src = re2.map((wd) => words[lower.indexOf(wd)] ?? wd).join(' ');
      }
      // A clause opening with "and", "but" or the like keeps it first.
      const conj = src.trim().match(/^(and|but|or|so|then|yet)\s+/i);
      if (conj) src = src.trim().slice(conj[0].length);
      let toks = src.trim() ? translate(L, src, { capitalsProper: true, known: WH }) : [];
      if (conj) toks.unshift({ form: L.word(conj[1].toLowerCase()).spell, gloss: conj[1].toLowerCase() });
      // A question word goes first.
      if (q) {
        const wi = toks.findIndex((t) => WH.has(t.gloss.toLowerCase()));
        if (wi > 0) toks = [toks[wi], ...toks.slice(0, wi), ...toks.slice(wi + 1)];
      }
      if (emph.size) {
        for (const t of toks) {
          const parts = t.gloss.toLowerCase().split(/[-.]/);
          if (parts.some((g) => emph.has(g))) t.emph = true;
        }
      }
      out.push(...toks);
      if (cl.after) out.push(mark(cl.after));
    });
    const words = out.slice(start).filter((t) => !t.punct);
    const yesNo = q && !words.some((t) => WH.has(t.gloss.toLowerCase()));
    if (yesNo && words.length) {
      if (sp.question === 'start') out.splice(start, 0, { form: L.word('question:particle').spell, gloss: 'Q' });
      else if (sp.question === 'end') out.push({ form: L.word('question:particle').spell, gloss: 'Q' });
      else if (sp.question === 'enclitic') {
        const first = out.slice(start).find((t) => !t.punct)!;
        first.form += enclitic(L);
        first.gloss += '-Q';
      }
    }
    if (x && words.length) {
      if (sp.exclaim === 'start') out.splice(start, 0, { form: L.word('exclamation:interjection').spell, gloss: 'EXCL' });
      else if (sp.exclaim === 'end') out.push({ form: L.word('exclamation:particle').spell, gloss: 'EMPH' });
    }
    // The opening turned mark, and a capital for the first word.
    if (sp.turned && (q || x) && words.length) out.splice(start, 0, mark(q ? '¿' : '¡'));
    const first = out.slice(start).find((t) => !t.punct);
    if (first) first.form = first.form.replace(/^\p{Ll}/u, (c) => c.toUpperCase());
    if (end) out.push(mark(q ? '?' : x ? '!' : '.'));
    sentence = [];
  };
  let m: RegExpExecArray | null;
  let pending = '';
  while ((m = re.exec(text))) {
    if (m[1] !== undefined) {
      if (m[1].trim()) pending += m[1];
      continue;
    }
    const p = m[2];
    if (/^[.!?]+$/.test(p)) {
      if (pending.trim()) sentence.push({ text: pending, after: '' });
      pending = '';
      flush(p);
    } else if (p === ',' || p === ';' || p === ':') {
      sentence.push({ text: pending, after: p });
      pending = '';
    } else {
      // A quotation mark: open or close, by turns.
      if (pending.trim()) sentence.push({ text: pending, after: '' });
      pending = '';
      if (!quoteOpen) {
        flush('');
        out.push(mark('“'));
      } else {
        flush('');
        out.push(mark('”'));
      }
      quoteOpen = !quoteOpen;
    }
  }
  if (pending.trim()) sentence.push({ text: pending, after: '' });
  flush('');
  // Marks never stand twice in a row (a comma before a full stop, say): the later one stays.
  return out.filter((t, k) => !(t.punct && CLOSING.has(t.punct) && out[k + 1]?.punct && CLOSING.has(out[k + 1].punct!) && out[k + 1].punct !== '”'));
}

/** Tokens as one line of text, the marks closed up to their words. */
export function joinTokens(tokens: Token[]): string {
  let s = '';
  for (const t of tokens) {
    const f = t.form;
    if (!s) s = f;
    else if (t.punct && CLOSING.has(t.punct)) s += f;
    else if (/[“¿¡]$/.test(s)) s += f;
    else s += ` ${f}`;
  }
  return s;
}
