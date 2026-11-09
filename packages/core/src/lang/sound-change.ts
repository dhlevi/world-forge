import type { Rng } from '../gen/rng';
import { CONS, VOW } from './phonemes';

/**
 * Sound changes: the regular shifts that turn a parent language's words into its daughters'
 * (Latin "aqua" to Spanish "agua", Old English "stān" to "stone"). Each daughter of a language
 * family goes through a handful of these, chosen by chance, in order; because the same changes
 * apply to every word, sister languages keep recognisable cognates ("water", "Wasser", "vatn").
 *
 * Words are arrays of IPA segments; a change maps one array to another.
 */

export interface SoundChange {
  id: string;
  /** In plain words, e.g. "p, t and k between vowels became b, d and g". */
  note: string;
  apply: (w: string[]) => string[];
}

const isV = (s?: string) => !!s && VOW.has(s);
const isC = (s?: string) => !!s && CONS.has(s);
const isFront = (s?: string) => !!s && VOW.get(s)?.back === 'front';
const isStop = (s?: string) => !!s && CONS.get(s)?.manner === 'plosive';
const place = (s?: string) => (s ? CONS.get(s)?.place : undefined);

type When = (w: string[], i: number) => boolean;
const anywhere: When = () => true;
const between: When = (w, i) => isV(w[i - 1]) && isV(w[i + 1]);
const final: When = (w, i) => i === w.length - 1;
const initial: When = (w, i) => i === 0;
const beforeFront: When = (w, i) => isFront(w[i + 1]) || w[i + 1] === 'j';

/** Adds the long vowels to a vowel map (e > i also makes eː > iː). */
function withLong(m: Record<string, string>): Record<string, string> {
  const out = { ...m };
  for (const [a, b] of Object.entries(m)) if (isV(a) && VOW.has(`${a}ː`)) out[`${a}ː`] = b ? (VOW.has(`${b}ː`) ? `${b}ː` : b) : '';
  return out;
}
/** Each segment in the map, where the test holds, rewritten ('' deletes it). */
function rewrite(map: Record<string, string>, when: When): (w: string[]) => string[] {
  return (w) => {
    const out: string[] = [];
    w.forEach((s, i) => {
      const to = map[s];
      if (to === undefined || !when(w, i)) out.push(s);
      else if (to) out.push(to);
    });
    return out;
  };
}

/** Drops middle vowels between single consonants until the word has at most `max` vowels. */
export function syncope(w: string[], max: number): string[] {
  let out = [...w];
  for (let guard = 0; guard < 6; guard++) {
    const vs = out.map((s, i) => (isV(s) ? i : -1)).filter((i) => i >= 0);
    if (vs.length <= max) break;
    // The first middle vowel with a lone consonant on each side.
    const k = vs.slice(1, -1).find((i) => isC(out[i - 1]) && isC(out[i + 1]) && !isC(out[i - 2]) && !isC(out[i + 2]));
    if (k === undefined) {
      // No clean place: drop a whole middle syllable.
      const m = vs[1];
      out = [...out.slice(0, m - (isC(out[m - 1]) && isV(out[m - 2]) ? 1 : 0)), ...out.slice(m + 1)];
      continue;
    }
    out.splice(k, 1);
  }
  return out;
}

const CATALOGUE: [SoundChange, number][] = [
  [{ id: 'lenition', note: 'p, b, t, d, k and g between vowels became f, v, θ, ð, x and ɣ', apply: rewrite({ p: 'f', b: 'v', t: 'θ', d: 'ð', k: 'x', g: 'ɣ' }, between) }, 1.6],
  [{ id: 'voicing', note: 'p, t, k and s between vowels became b, d, g and z', apply: rewrite({ p: 'b', t: 'd', k: 'g', s: 'z' }, between) }, 2],
  [{ id: 'devoicing', note: 'b, d, g, v and z lost their voice at the end of a word', apply: rewrite({ b: 'p', d: 't', g: 'k', v: 'f', z: 's', ʒ: 'ʃ', ð: 'θ', dʒ: 'tʃ', ɣ: 'x' }, final) }, 2],
  [{
    id: 'apocope', note: 'final vowels after a consonant were lost in longer words',
    apply: (w) => (w.filter(isV).length >= 2 && isV(w[w.length - 1]) && isC(w[w.length - 2]) ? w.slice(0, -1) : w),
  }, 2],
  [{ id: 'syncope', note: 'middle vowels were lost in words of three syllables or more', apply: (w) => syncope(w, 2) }, 1.2],
  [{ id: 'palatal', note: 'k and g became tʃ and dʒ before front vowels', apply: rewrite({ k: 'tʃ', g: 'dʒ' }, beforeFront) }, 1.5],
  [{ id: 'assibilation', note: 'k became s and g became ʒ before front vowels', apply: rewrite({ k: 's', g: 'ʒ' }, beforeFront) }, 0.7],
  [{ id: 'sh', note: 's became ʃ before i and j', apply: rewrite({ s: 'ʃ' }, (w, i) => /^(i|iː|j)$/.test(w[i + 1] ?? '')) }, 0.8],
  [{ id: 'h-loss', note: 'h was lost', apply: rewrite({ h: '' }, anywhere) }, 1],
  [{ id: 'raising', note: 'e and o rose to i and u', apply: rewrite(withLong({ e: 'i', o: 'u' }), anywhere) }, 0.9],
  [{ id: 'lowering', note: 'i and u fell to e and o', apply: rewrite(withLong({ i: 'e', u: 'o' }), anywhere) }, 0.6],
  [{
    id: 'umlaut', note: 'a, o and u became e, ø and y before an i in the next syllable',
    apply: (w) => w.map((s, i) => {
      const m: Record<string, string> = { a: 'e', o: 'ø', u: 'y', 'aː': 'eː', 'oː': 'øː', 'uː': 'yː' };
      if (!(s in m)) return s;
      let j = i + 1;
      while (j < w.length && isC(w[j])) j++;
      return j < w.length && j > i + 1 && (w[j] === 'i' || w[j] === 'iː') ? m[s] : s;
    }),
  }, 0.9],
  [{ id: 'a-rounding', note: 'long a became o', apply: rewrite({ 'aː': 'oː' }, anywhere) }, 0.5],
  [{ id: 'a-backing', note: 'a became o before a nasal', apply: rewrite({ a: 'o' }, (w, i) => CONS.get(w[i + 1] ?? '')?.manner === 'nasal') }, 0.5],
  [{ id: 'shortening', note: 'long vowels became short', apply: (w) => w.map((s) => (isV(s) && s.endsWith('ː') ? s.slice(0, -1) : s)) }, 1],
  [{
    id: 'assimilation', note: 'n became m before p and b, and ŋ before k and g',
    apply: (w) => w.map((s, i) => (s !== 'n' ? s : place(w[i + 1]) === 'bilabial' && isStop(w[i + 1]) ? 'm' : place(w[i + 1]) === 'velar' && isStop(w[i + 1]) ? 'ŋ' : s)),
  }, 1],
  [{ id: 'clusters', note: 'of two stops together only the second remained (kt > t)', apply: (w) => w.filter((s, i) => !(isStop(s) && isStop(w[i + 1]))) }, 1],
  [{ id: 'w-to-v', note: 'w became v', apply: rewrite({ w: 'v' }, anywhere) }, 0.8],
  [{ id: 'fortition', note: 'θ and ð became t and d', apply: rewrite({ θ: 't', ð: 'd' }, anywhere) }, 1],
  [{ id: 'rhotacism', note: 's and z between vowels became r', apply: rewrite({ s: 'r', z: 'r' }, between) }, 0.6],
  [{ id: 'spirants', note: 'p, t and k at the start of a word became f, θ and h', apply: rewrite({ p: 'f', t: 'θ', k: 'h' }, initial) }, 0.6],
  [{ id: 'deaffrication', note: 'ts, tʃ and dʒ became s, ʃ and ʒ', apply: rewrite({ ts: 's', tʃ: 'ʃ', dʒ: 'ʒ', dz: 'z' }, anywhere) }, 0.8],
  [{ id: 'prothesis', note: 'an e grew before s and a consonant at the start of a word', apply: (w) => (w[0] === 's' && isC(w[1]) ? ['e', ...w] : w) }, 0.4],
  [{ id: 'final-m', note: 'final m became n', apply: rewrite({ m: 'n' }, final) }, 0.5],
  [{ id: 'final-s', note: 'final s was lost', apply: rewrite({ s: '' }, (w, i) => final(w, i) && w.length > 3) }, 0.5],
  [{ id: 'r-to-l', note: 'r became l', apply: rewrite({ r: 'l', ɾ: 'l' }, anywhere) }, 0.3],
  [{ id: 'l-to-r', note: 'l between vowels became r', apply: rewrite({ l: 'r' }, between) }, 0.4],
  [{ id: 'f-to-h', note: 'f at the start of a word became h', apply: rewrite({ f: 'h' }, initial) }, 0.5],
  [{ id: 'yod', note: 'j at the start of a word became dʒ', apply: rewrite({ j: 'dʒ' }, initial) }, 0.5],
  [{ id: 'x-to-h', note: 'x and χ became h', apply: rewrite({ x: 'h', χ: 'h' }, anywhere) }, 0.6],
  [{ id: 'mergers', note: 'the open and lax vowels merged (ɛ, ɔ, æ and ə with e, o, a and e)', apply: rewrite({ ɛ: 'e', ɔ: 'o', æ: 'a', ə: 'e', ɪ: 'i', ʊ: 'u' }, anywhere) }, 0.7],
];
/** Changes that undo or fight each other; a language takes one of each pair at most. */
const CLASH = [['raising', 'lowering'], ['r-to-l', 'l-to-r'], ['palatal', 'assibilation'], ['lenition', 'voicing'], ['lenition', 'fortition']];

/** A daughter language's changes: `n` of them, in the order they happened. */
export function pickChanges(r: Rng, n: number, matters: (c: SoundChange) => boolean = () => true): SoundChange[] {
  const pool = [...CATALOGUE];
  const out: SoundChange[] = [];
  while (out.length < n && pool.length) {
    const tot = pool.reduce((s, x) => s + x[1], 0);
    let x = r() * tot;
    let k = 0;
    for (; k < pool.length - 1; k++) if ((x -= pool[k][1]) < 0) break;
    const [c] = pool.splice(k, 1)[0];
    if (out.some((o) => CLASH.some((p) => p.includes(o.id) && p.includes(c.id))) || !matters(c)) continue;
    out.push(c);
  }
  return out;
}

/** Every IPA segment, longest first, for reading an IPA string back into segments. */
const SEGS = [...CONS.keys(), ...VOW.keys()].sort((a, b) => b.length - a.length);
/** An IPA transcription as segments (stress, tone and syllable marks dropped). */
export function segment(ipa: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < ipa.length) {
    const m = SEGS.find((s) => ipa.startsWith(s, i));
    if (m) {
      out.push(m);
      i += m.length;
    } else i++;
  }
  return out;
}
