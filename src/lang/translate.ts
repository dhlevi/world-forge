import type { Language, Token } from './language';
import { LEX } from './lexicon';

/**
 * Translates simple English into a language: noun phrases (articles, adjectives, plurals,
 * possession with "of" or "'s"), pronouns, one verb with its tense, negation and subject
 * agreement, and phrases with prepositions, put in the language's word order. Words outside the
 * core vocabulary get words of their own, made the same way, so anything can be translated.
 */

const PRONOUN: Record<string, number> = { i: 0, me: 0, you: 1, he: 2, him: 2, she: 3, her: 3, it: 4, we: 5, us: 5, they: 7, them: 7 };
const PREPS = new Set(['in', 'on', 'at', 'to', 'from', 'by', 'with', 'near', 'under', 'over', 'into', 'through', 'for', 'across', 'beyond', 'behind', 'before', 'after', 'among', 'beside', 'upon', 'towards', 'against', 'within', 'without']);
const DETS = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'some']);
const IRREG_PAST: Record<string, string> = {
  saw: 'see', went: 'go', came: 'come', gave: 'give', took: 'take', made: 'make', ate: 'eat', spoke: 'speak', said: 'say', knew: 'know', sang: 'sing', fought: 'fight',
  built: 'build', slept: 'sleep', fell: 'fall', stood: 'stand', sat: 'sit', grew: 'grow', found: 'find', lost: 'lose', held: 'hold', rode: 'ride', ran: 'run',
  flew: 'fly', swam: 'swim', drank: 'drink', thought: 'think', heard: 'hear', was: 'be', were: 'be', had: 'have', did: 'do', burnt: 'burn', brought: 'bring', told: 'tell',
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
      if (o.known?.has(lw) || LEX.has(lw) || PRONOUN[lw] !== undefined || DETS.has(lw) || PREPS.has(lw) || verbOf(lw) || (nounOf(lw).plural && LEX.has(nounOf(lw).n))) return m;
      if (first && lw.length < 3) return m;
      return `${pre} zzp${propers.push(w) - 1}zz `;
    });
  }
  const isProper = (w: string) => /^zzp\d+zz$/.test(w);
  const properTok = (w: string): Token => {
    const p = propers[+w.slice(3, -2)];
    return { form: p, gloss: p };
  };
  const words = src.toLowerCase().replace(/n't\b/g, ' not').replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean);
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
    if (PRONOUN[w] !== undefined) {
      i++;
      const p = PRONOUN[w];
      return { tokens: [{ form: L.pronoun(p).spell, gloss: ['I', 'you', 'he', 'she', 'it', 'we', 'you.PL', 'they'][p] }], person: p };
    }
    let def = false, indef = false;
    if (DETS.has(w)) {
      def = w !== 'a' && w !== 'an' && w !== 'some';
      indef = w === 'a' || w === 'an';
      i++;
    }
    const adjs: string[] = [];
    while (i < words.length - 1 && LEX.get(words[i])?.pos === 'adj' && !PREPS.has(words[i + 1])) adjs.push(words[i++]);
    if (i >= words.length || PREPS.has(words[i]) || words[i] === 'of') {
      if (!adjs.length) return null;
      const last = adjs.pop()!;
      return { tokens: L.nounPhrase(last, { adjs, def, indef }), person: 2 };
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
    let np: NP = { tokens: L.nounPhrase(n, { adjs, def, indef, plural }), person: plural ? 7 : 2 };
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
