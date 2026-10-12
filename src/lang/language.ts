import { hashString, mulberry32, type Rng } from '../gen/rng';
import { CONS, HEIGHTS, PLACES, VOW, isNasal, isVowel } from './phonemes';
import { type FormKey, type GrammarBias, type LangTemplate, type Order } from './templates';
import { LEX, type POS, PRONOUNS } from './lexicon';
import { awkward, cap, join, tidy } from './text';
import { type SoundChange, pickChanges, segment, syncope } from './sound-change';

const PLACE_ORDER: readonly string[] = PLACES;
const HEIGHT_ORDER: readonly string[] = HEIGHTS;

/**
 * A generated language. It grows from a template: the template's sounds, syllables, spelling
 * and grammar, changed more or less by the world's **drift** (0 keeps the template, 1 makes it
 * strange). Every word is made from the language's own sounds and spelled by its own rules, and
 * is deterministic: the word for "river" is the same wherever and whenever it is asked for.
 *
 * Names: with little drift, most names still come from the template's old naming parts
 * (respelled by the language's sound changes); with more, from the language's own words.
 */

const pick = <T>(rnd: Rng, a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const weighted = <T>(rnd: Rng, a: [T, number][]): T => {
  const tot = a.reduce((s, x) => s + x[1], 0);
  let r = rnd() * tot;
  for (const [v, w] of a) if ((r -= w) < 0) return v;
  return a[a.length - 1][0];
};

export interface Word {
  /** Spelled (lowercase). */
  spell: string;
  /** IPA with stress (and tone) marks, between slashes when shown. */
  ipa: string;
  /** Where the word came from: the parent language (through sound changes), the template's old words, or new. */
  src?: 'inherited' | 'old' | 'new';
}
export interface Token {
  form: string;
  gloss: string;
}
export interface Grammar extends GrammarBias {
  /** Labels for the two noun classes, when there are any. */
  genders: [string, string] | null;
}
export interface Phon {
  ipa: string;
  w: number;
  spell: string;
}

/** Other ways of writing a sound, for languages that drift from their template's spelling. */
const ALT_SPELL: Record<string, string[]> = {
  ʃ: ['sh', 'sch', 'sj', 'x', 's'], tʃ: ['ch', 'tch', 'c', 'tj'], dʒ: ['j', 'dj', 'g'], θ: ['th'], ð: ['dh', 'dd', 'th'],
  x: ['kh', 'ch', 'h'], ɣ: ['gh', 'g'], j: ['y', 'j', 'i'], w: ['w', 'u', 'v'], k: ['k', 'c'], ŋ: ['ng', 'n'], ts: ['ts', 'tz', 'z'], ʒ: ['zh', 'j'],
  ɲ: ['ny', 'ñ', 'nj', 'gn'], ʎ: ['ly', 'll', 'lh'], æ: ['ae', 'a', 'e'], ø: ['ö', 'oe', 'eu'], y: ['ü', 'y', 'ue'], ɨ: ['y', 'i'], ə: ['e', 'a'],
  'aː': ['aa', 'á', 'â', 'a'], 'eː': ['ee', 'é', 'ê', 'e'], 'iː': ['ii', 'í', 'ee', 'i'], 'oː': ['oo', 'ó', 'ô', 'o'], 'uː': ['uu', 'ú', 'oo', 'u'],
  v: ['v', 'w'], z: ['z', 's'], f: ['f', 'ph', 'ff'], q: ['q', 'k'], χ: ['kh', 'ch'],
};
/** Sounds a drifting language may gain. */
const ADD_C = ['p', 'b', 't', 'd', 'k', 'g', 'q', 'm', 'n', 'ŋ', 'ɲ', 'f', 'v', 'θ', 'ð', 's', 'z', 'ʃ', 'ʒ', 'x', 'ɣ', 'h', 'ts', 'tʃ', 'dʒ', 'r', 'l', 'j', 'w', 'ɬ', 'χ', 'ç'];
const ADD_V = ['a', 'e', 'i', 'o', 'u', 'y', 'ø', 'ɛ', 'ɔ', 'æ', 'ə', 'ɨ', 'aː', 'eː', 'iː', 'oː', 'uː'];
/** Sound changes a language's old names may have gone through (on spelled forms). */
const SHIFTS: [string, string][] = [
  ['th', 't'], ['th', 'd'], ['sh', 's'], ['ch', 'k'], ['c(?=[aou])', 'k'], ['k', 'c'], ['w', 'v'], ['v', 'w'], ['ph', 'f'], ['f', 'v'], ['ou', 'u'], ['ae', 'e'],
  ['ei', 'i'], ['oo', 'u'], ['y$', 'i'], ['a$', 'e'], ['o(?=[^aeiou]*$)', 'u'], ['u(?=[^aeiou]*$)', 'o'], ['e$', ''], ['ck', 'k'], ['gh', 'g'], ['([bdfgklmnprstvz])\\1', '$1'],
  ['s$', 'z'], ['^h', ''], ['ar', 'er'], ['or', 'ur'], ['en$', 'an'], ['d$', 't'], ['g$', 'k'], ['b$', 'p'], ['i(?=[aeou])', 'j'], ['ea', 'e'], ['au', 'o'], ['al', 'ol'],
  ['ss', 's'], ['st', 'sht'], ['x', 'ks'], ['qu', 'kw'], ['z', 's'], ['ll', 'l'],
];
/** How a spelled form is read when the language's own spelling does not say. */
const BASIC_READING: Record<string, string> = {
  ch: 'tʃ', sh: 'ʃ', sch: 'ʃ', th: 'θ', ph: 'f', kh: 'x', gh: 'ɣ', qu: 'kw', ng: 'ŋ', ny: 'ɲ', ll: 'l', zh: 'ʒ', tz: 'ts', tl: 'tɬ', dh: 'ð', ck: 'k',
  j: 'dʒ', y: 'j', c: 'k', x: 'ks', q: 'q', w: 'w', aa: 'aː', ee: 'iː', oo: 'uː', ae: 'æ', ei: 'ei', ou: 'u', eo: 'ʌ', eu: 'ɯ',
  a: 'a', e: 'e', i: 'i', o: 'o', u: 'u', ä: 'æ', ö: 'ø', ü: 'y', å: 'ɔ', æ: 'æ', ø: 'ø', é: 'eː', á: 'aː', í: 'iː', ó: 'oː', ú: 'uː', â: 'aː', ë: 'eː', ñ: 'ɲ',
  b: 'b', d: 'd', f: 'f', g: 'g', h: 'h', k: 'k', l: 'l', m: 'm', n: 'n', p: 'p', r: 'r', s: 's', t: 't', v: 'v', z: 'z',
};
/** English-style respellings of sounds, for "sounds like" (vowels differ in open and closed syllables). */
const SAY_C: Record<string, string> = {
  ŋ: 'ng', θ: 'th', ð: 'dh', ʃ: 'sh', ʒ: 'zh', tʃ: 'ch', tʃʰ: 'ch', dʒ: 'j', x: 'kh', ɣ: 'gh', χ: 'kh', ʁ: 'r', j: 'y', ɾ: 'r', ɬ: 'hl', tɬ: 'tl', ɲ: 'ny', ʎ: 'ly',
  ʔ: '\'', ç: 'hy', ɕ: 'sy', ʑ: 'zy', tɕ: 'ch', tɕʰ: 'ch', ʂ: 'sh', ʐ: 'zh', β: 'v', ɸ: 'f', ʋ: 'v', ħ: 'h', ʕ: '\'', tsʰ: 'ts', q: 'q',
};
const SAY_OPEN: Record<string, string> = { a: 'ah', e: 'eh', i: 'ee', o: 'oh', u: 'oo', ɛ: 'eh', ɔ: 'aw', æ: 'a', ə: 'uh', ɪ: 'ih', ʊ: 'oo', y: 'ew', ø: 'eu', œ: 'eu', ɨ: 'ih', ɯ: 'eu', ʌ: 'uh', ɑ: 'ah' };
const SAY_SHUT: Record<string, string> = { a: 'a', e: 'e', i: 'i', o: 'o', u: 'u', ɛ: 'e', ɔ: 'aw', æ: 'a', ə: 'uh', ɪ: 'i', ʊ: 'oo', y: 'ew', ø: 'eu', œ: 'eu', ɨ: 'ih', ɯ: 'eu', ʌ: 'u', ɑ: 'ah' };
/** Broad classes of consonants: a lost sound is replaced from its own class where it can be (l by r, not n). */
const CLASS: Record<string, string> = {
  plosive: 'stop', affricate: 'fricative', fricative: 'fricative', 'lateral fricative': 'fricative', nasal: 'nasal', trill: 'liquid', tap: 'liquid', 'lateral approximant': 'liquid', approximant: 'glide',
};
/** Common words, to see which sound changes would matter to a language. */
export const SAMPLE = ['water', 'fire', 'stone', 'tree', 'river', 'mountain', 'sun', 'moon', 'star', 'night', 'day', 'man', 'woman', 'mother', 'father', 'king', 'horse', 'dog', 'wolf', 'bird', 'fish', 'black', 'white', 'red', 'green', 'old', 'new', 'big', 'small', 'one', 'two', 'three', 'four', 'five', 'hand', 'head', 'eye', 'heart', 'blood', 'bone', 'house', 'city', 'field', 'road', 'sea', 'wind', 'rain', 'snow', 'gold', 'iron', 'sword', 'war', 'god', 'name', 'give', 'eat', 'see', 'go', 'come', 'die'];
const PLACE_CONCEPTS = ['town', 'fort', 'hill', 'river', 'field', 'ford', 'home', 'lake', 'valley', 'harbour', 'stone', 'wood', 'island', 'mountain', 'city', 'village', 'farm', 'spring', 'bridge', 'meadow'];
const ROOT_CONCEPTS = ['black', 'white', 'red', 'old', 'new', 'high', 'great', 'cold', 'iron', 'stone', 'wolf', 'oak', 'ash', 'raven', 'eagle', 'bear', 'sun', 'moon', 'star', 'thorn', 'gold', 'silver', 'deep', 'holy', 'king', 'storm', 'fire', 'salt', 'wild'];

/** Alternatives for each grammar feature, when drift re-rolls it. */
const GRAMMAR_OPTS: { [K in keyof GrammarBias]?: [GrammarBias[K], number][] } = {
  order: [['SOV', 45], ['SVO', 42], ['VSO', 9], ['VOS', 3], ['OVS', 1]],
  adj: [['before', 1], ['after', 1]],
  def: [['none', 3], ['word', 3], ['prefix', 1], ['suffix', 2]],
  indef: [['none', 2], ['word', 1]],
  plural: [['suffix', 5], ['prefix', 1], ['none', 1.5], ['reduplication', 0.5]],
  poss: [['suffix', 3], ['prefix', 1], ['of', 2], ['particle', 2], ['construct', 1]],
  gender: [[0, 3], [2, 2]],
  agree: [[true, 1], [false, 1]],
  tense: [['suffix', 4], ['prefix', 1.5], ['particle', 2]],
};

export interface LangSpec {
  /** Unique key (world seed and culture index). */
  key: string;
  template: LangTemplate;
  drift: number;
  /** The template's old naming parts. */
  legacy?: { starts: string[]; mids: string[]; ends: string[]; midChance: number; roots?: string[]; suffixes?: string[]; compoundChance?: number; prefixes?: string[]; prefixChance?: number };
  given?: [string[], string[]];
  families?: string[];
  /** The parent language (a family's proto-language), whose words this one inherits. */
  parent?: Language;
  /** Share of the parent's words still in use (the rest replaced by new ones). */
  retention?: number;
}

export class Language {
  readonly key: string;
  readonly t: LangTemplate;
  readonly drift: number;
  readonly seed: number;
  readonly consonants: Phon[];
  readonly vowels: Phon[];
  readonly syl: [string, number][];
  readonly onsets: string[][];
  readonly codas: string[][];
  readonly finals: Set<string>;
  readonly spelling = new Map<string, string>();
  readonly rules: { re: RegExp; to: string; note: string }[] = [];
  /** Sound changes applied to old naming parts and seed words. */
  readonly shifts: { re: RegExp; to: string; note: string }[] = [];
  /** Chance a name or word keeps the template's old form. */
  readonly pTemplate: number;
  readonly grammar: Grammar;
  readonly forms: Record<FormKey, string>;
  readonly personEndings: string[];
  readonly harmony: boolean;
  readonly tones: number;
  readonly stress: LangTemplate['stress'];
  /** How names are built (see `LangTemplate.compound`). */
  readonly compound: LangTemplate['compound'];
  /** The parent language, if any, and the sound changes since (in order). */
  readonly parent: Language | null;
  readonly changes: SoundChange[];
  readonly retention: number;
  /** True for languages whose syllables end in vowels (or nasals) only. */
  readonly open: boolean;
  /** The vowel added to break up clusters the language does not allow. */
  readonly epenthetic: string;
  private readonly spec: LangSpec;
  private readonly adaptCache = new Map<string, string>();
  private readonly cache = new Map<string, Word>();

  constructor(spec: LangSpec) {
    const t = spec.template;
    this.spec = spec;
    this.key = spec.key;
    this.t = t;
    this.drift = Math.max(0, Math.min(1, spec.drift));
    this.seed = hashString(`lang#${spec.key}`);
    const r = mulberry32(this.seed);
    const d = this.drift;
    this.pTemplate = Math.max(0, Math.min(1, 1 - 1.35 * d));
    this.harmony = !!t.harmony && r() > d * 0.5;
    this.tones = t.tones ?? 0;
    this.stress = r() < d * 0.3 ? pick(r, ['initial', 'penultimate', 'final'] as const) : t.stress;
    const rc = mulberry32(hashString(`${spec.key}#compound`));
    this.compound = rc() < d * 0.35 ? pick(rc, ['final', 'initial', false] as const) : t.compound;

    // Sounds: the template's, with some dropped, some gained and all reweighted by drift.
    const jig = () => Math.exp((r() - 0.5) * 2 * d);
    let cons = Object.entries(t.C).filter(([ipa, w]) => w > 0 && CONS.has(ipa)).map(([ipa, w]) => ({ ipa, w: w * jig(), spell: '' }));
    const core = new Set(['t', 'k', 'n', 'm', 's']);
    cons = cons.filter((c) => core.has(c.ipa) || cons.length <= 9 || r() > d * 0.22);
    const nAddC = Math.floor(d * 4 * r() + (r() < d ? 1 : 0));
    for (let k = 0; k < nAddC; k++) {
      const ipa = pick(r, ADD_C);
      if (!cons.some((c) => c.ipa === ipa)) cons.push({ ipa, w: 1 + 2 * r(), spell: '' });
    }
    let vows = Object.entries(t.V).filter(([ipa, w]) => w > 0 && VOW.has(ipa)).map(([ipa, w]) => ({ ipa, w: w * jig(), spell: '' }));
    vows = vows.filter((v) => v.ipa === 'a' || v.ipa === 'i' || v.ipa === 'u' || vows.length <= 3 || r() > d * 0.2);
    const nAddV = Math.floor(d * 3 * r());
    for (let k = 0; k < nAddV; k++) {
      const ipa = pick(r, ADD_V);
      if (!vows.some((v) => v.ipa === ipa)) vows.push({ ipa, w: 0.6 + 1.5 * r(), spell: '' });
    }
    // Spelling: the template's (or the default), sometimes another way of writing a sound.
    for (const p of [...cons, ...vows]) {
      const base = t.spell?.[p.ipa] ?? CONS.get(p.ipa)?.spell ?? VOW.get(p.ipa)?.spell ?? p.ipa;
      const alt = ALT_SPELL[p.ipa];
      p.spell = alt && r() < d * 0.45 ? pick(r, alt) : base;
      this.spelling.set(p.ipa, p.spell);
    }
    this.consonants = cons.sort((a, b) => b.w - a.w);
    this.vowels = vows.sort((a, b) => b.w - a.w);
    this.syl = Object.entries(t.syl).map(([p, w]) => [p, w * jig()] as [string, number]);
    if (r() < d * 0.5) this.syl.push([pick(r, ['CVC', 'CCV', 'CVCC', 'VC', 'CV']), 1 + 2 * r()]);
    const has = (s: string) => cons.some((c) => c.ipa === s);
    this.onsets = t.onsets.map((o) => o.split(' ')).filter((o) => o.every(has));
    this.codas = t.codas.map((o) => o.split(' ')).filter((o) => o.every(has));
    this.finals = new Set((t.finals ?? cons.map((c) => c.ipa).filter((c) => !['j', 'w', 'h', 'ʔ'].includes(c))).filter(has));
    if (!this.finals.size) this.finals.add('n');
    for (const [p, to, note] of t.rules ?? []) this.rules.push({ re: new RegExp(p, 'g'), to, note });

    // Sound changes for old forms: the language's new spellings, sounds it lost, and a few shifts.
    const tplSpell = (ipa: string) => t.spell?.[ipa] ?? CONS.get(ipa)?.spell ?? VOW.get(ipa)?.spell ?? ipa;
    for (const p of [...cons, ...vows]) {
      const old = tplSpell(p.ipa);
      if (old && p.spell !== old && old.length >= 2) this.shifts.push({ re: new RegExp(old, 'g'), to: p.spell, note: `"${old}" became "${p.spell}"` });
    }
    for (const ipa of Object.keys(t.C)) {
      if (has(ipa) || !CONS.has(ipa)) continue;
      const old = tplSpell(ipa);
      const c = CONS.get(ipa)!;
      const near = cons.find((x) => CONS.get(x.ipa)?.place === c.place) ?? cons.find((x) => CONS.get(x.ipa)?.manner === c.manner);
      if (old && near && old.length >= 2) this.shifts.push({ re: new RegExp(old, 'g'), to: near.spell, note: `"${old}" became "${near.spell}"` });
    }
    const nShift = Math.floor(d * 4 + r() * d * 2);
    const pool = [...SHIFTS];
    for (let k = 0; k < nShift && pool.length; k++) {
      const [p, to] = pool.splice(Math.floor(r() * pool.length), 1)[0];
      this.shifts.push({ re: new RegExp(p, 'g'), to, note: `"${p.replace(/\(\?=.*?\)|\$|\^|\\\\1|\(\[.*?\]\)/g, '')}" became "${to.replace('$1', '')}"` });
    }

    // Grammar: the template's, each feature re-rolled now and then by drift.
    const gb: GrammarBias = { ...t.grammar };
    for (const k of Object.keys(GRAMMAR_OPTS) as (keyof GrammarBias)[]) {
      if (r() < d * 0.5) (gb as unknown as Record<string, unknown>)[k] = weighted(r, GRAMMAR_OPTS[k] as [unknown, number][]);
    }
    if (gb.order === 'SOV' || gb.order === 'OVS' || gb.order === 'OSV') gb.adposition = r() < 0.85 ? 'post' : 'pre';
    else if (r() < d * 0.3) gb.adposition = gb.adposition === 'pre' ? 'post' : 'pre';
    this.grammar = { ...gb, genders: gb.gender === 2 ? ((gb.genderKind ?? 'sex') === 'animacy' ? ['animate', 'inanimate'] : ['masculine', 'feminine']) : null };
    // Grammatical words and endings: the template's, respelled, or new.
    const keys: FormKey[] = ['def', 'indef', 'plural', 'poss', 'of', 'past', 'future', 'neg', 'fem', 'masc'];
    this.forms = {} as Record<FormKey, string>;
    for (const k of keys) {
      const tf = t.forms?.[k];
      const rk = mulberry32(hashString(`${this.key}#form#${k}`));
      this.forms[k] = tf && rk() < this.pTemplate + 0.2 ? this.respell(tf) : this.morpheme(rk, k === 'def' || k === 'indef' || k === 'of' || k === 'neg' || k === 'future' ? 'word' : k === 'plural' && gb.plural === 'prefix' ? 'prefix' : 'suffix');
    }
    const rp = mulberry32(hashString(`${this.key}#person`));
    this.personEndings = PRONOUNS.slice(0, 6).map(() => this.morpheme(rp, 'suffix'));

    // Descent: sound changes since the parent language (more with more drift).
    this.parent = spec.parent ?? null;
    const rd = mulberry32(hashString(`${this.key}#descent`));
    // Only changes that touch some of the parent's common words (a language without x cannot lose it).
    const P = this.parent;
    const sample = P ? SAMPLE.map((g) => P.segments(P.word(g))) : [];
    const touches = (c: SoundChange) => sample.filter((w) => c.apply(w).join(' ') !== w.join(' ')).length >= 2;
    this.changes = P ? pickChanges(rd, Math.max(1, Math.round(1 + d * 4 + rd() * 2)), touches) : [];
    this.retention = Math.max(0, Math.min(1, spec.retention ?? 0.85));
    this.open = this.syl.every(([p, w]) => w < 0.3 || /[VN]$/.test(p));
    this.epenthetic = ['ə', 'e', 'u', 'i', 'a'].find((v) => this.vowels.some((x) => x.ipa === v)) ?? this.vowels[0].ipa;
  }

  // ---- Sounds to words ---------------------------------------------------------------------------

  private cons(r: Rng, not?: string): string {
    for (let t = 0; t < 6; t++) {
      const c = weighted(r, this.consonants.map((p) => [p.ipa, p.w] as [string, number]));
      if (c !== not && c !== 'ŋ') return c;
    }
    return this.consonants[0].ipa;
  }
  private vowel(r: Rng, cls?: 'front' | 'back'): string {
    const list = cls ? this.vowels.filter((v) => (VOW.get(v.ipa)?.back === 'front') === (cls === 'front') || VOW.get(v.ipa)?.back === 'central') : this.vowels;
    const l = list.length ? list : this.vowels;
    return weighted(r, l.map((p) => [p.ipa, p.w] as [string, number]));
  }

  /** A word's sounds, syllable by syllable. */
  syllables(r: Rng, n: number): string[][] {
    const out: string[][] = [];
    const cls = this.harmony ? (r() < 0.5 ? 'front' : 'back') : undefined;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      const prev = out[i - 1];
      const prevEndsV = prev ? isVowel(prev[prev.length - 1]) : false;
      let pat = weighted(r, this.syl);
      for (let t = 0; t < 4 && i > 0 && prevEndsV && pat.startsWith('V'); t++) pat = weighted(r, this.syl);
      if (i > 0 && prevEndsV && pat.startsWith('V')) pat = `C${pat}`;
      const vi = pat.indexOf('V');
      const on = pat.slice(0, vi), coda = pat.slice(vi + 1);
      const s: string[] = [];
      const prevC = prev?.[prev.length - 1];
      if (on === 'C') s.push(this.cons(r, prevC));
      else if (on === 'CC') {
        if (this.onsets.length && r() < 0.8) s.push(...pick(r, this.onsets));
        else s.push(this.cons(r, prevC));
      } else if (on === 'CG') {
        s.push(this.cons(r, prevC));
        const gl = ['j', 'w'].filter((x) => this.spelling.has(x));
        if (gl.length) s.push(pick(r, gl));
      }
      s.push(this.vowel(r, cls));
      if (coda === 'C' || coda === 'N' || coda === 'CC') {
        if (coda === 'N') {
          const ns = ['n', 'ŋ', 'm'].filter((x) => this.spelling.has(x) && (!last || this.finals.has(x)));
          if (ns.length) s.push(pick(r, ns));
        } else if (coda === 'CC' && last && this.codas.length && r() < 0.7) s.push(...pick(r, this.codas));
        else {
          const ok = last ? [...this.finals] : this.consonants.map((c) => c.ipa).filter((c) => !['j', 'w', 'h', 'ʔ'].includes(c));
          if (ok.length) s.push(weighted(r, ok.map((c) => [c, this.consonants.find((p) => p.ipa === c)?.w ?? 1] as [string, number])));
        }
      }
      // Nothing may end a word that the language does not allow there.
      if (last && !isVowel(s[s.length - 1]) && !this.finals.has(s[s.length - 1])) s.pop();
      if (this.tones) s.push(`#${1 + Math.floor(r() * this.tones)}`);
      out.push(s);
    }
    return out;
  }

  /** Spells sounds by the language's rules. */
  spellOf(syls: string[][]): string {
    let w = syls.flat().filter((x) => !x.startsWith('#')).map((x) => this.spelling.get(x) ?? CONS.get(x)?.spell ?? VOW.get(x)?.spell ?? x).join('');
    for (const rule of this.rules) w = w.replace(rule.re, rule.to);
    return w.replace(/([a-z])\1\1+/g, '$1$1');
  }

  private static TONE = ['˥', '˧˥', '˨˩˦', '˥˩', '˧'];
  /** IPA with stress or tone marks. */
  ipaOf(syls: string[][]): string {
    const n = syls.length;
    const at = this.stress === 'none' || n < 2 ? -1 : this.stress === 'initial' ? 0 : this.stress === 'final' ? n - 1 : Math.max(0, n - 2);
    return syls.map((s, i) => (i === at ? 'ˈ' : '') + s.map((x) => (x.startsWith('#') ? Language.TONE[+x.slice(1) - 1] ?? '' : x)).join('')).join(n > 1 && at < 0 ? '.' : '');
  }

  /** A new word of n syllables. */
  gen(r: Rng, n: number): Word {
    for (let t = 0; t < 8; t++) {
      const s = this.syllables(r, n);
      const spell = this.spellOf(s);
      if (spell.length < 2 || awkward(spell)) continue;
      return { spell, ipa: this.ipaOf(s) };
    }
    const s = this.syllables(r, n);
    return { spell: this.spellOf(s), ipa: this.ipaOf(s) };
  }

  /** A short grammatical word or ending. */
  private morpheme(r: Rng, kind: 'word' | 'suffix' | 'prefix'): string {
    for (let t = 0; t < 8; t++) {
      const c = this.cons(r), v = this.vowel(r);
      const shape = kind === 'suffix' ? pick(r, ['V', 'VC', 'CV', 'VC']) : kind === 'prefix' ? pick(r, ['CV', 'V', 'CV']) : pick(r, ['CV', 'VC', 'CVC', 'CV']);
      const segs = shape.split('').map((x) => (x === 'C' ? (shape.endsWith('C') && x === shape[shape.length - 1] && this.finals.size ? pick(r, [...this.finals]) : c) : v));
      const w = this.spellOf([segs]);
      if (w) return w;
    }
    return 'a';
  }

  /** Reads a spelled form back into sounds (roughly), for old forms and seed words. */
  toIpa(spell: string): string {
    const inv = [...this.spelling].filter(([, s]) => s).map(([ipa, s]) => [s, ipa] as [string, string]);
    for (const [g, ipa] of Object.entries(BASIC_READING)) inv.push([g, ipa]);
    inv.sort((a, b) => b[0].length - a[0].length);
    let out = '';
    let i = 0;
    const s = spell.toLowerCase();
    while (i < s.length) {
      const m = inv.find(([g]) => g && s.startsWith(g, i));
      if (m) {
        out += m[1];
        i += m[0].length;
      } else {
        out += s[i] === 'c' ? 'k' : s[i] === 'y' ? 'i' : s[i];
        i++;
      }
    }
    return out;
  }

  /** An old form after the language's sound changes. */
  respell(s: string): string {
    // Word by word, keeping each word's capital ("Yax Ehb").
    return s.split(/( |-)/).map((part) => {
      if (part === ' ' || part === '-' || !part) return part;
      const upper = /^[A-Z]/.test(part);
      let w = part.toLowerCase();
      for (const sh of this.shifts) w = w.replace(sh.re, sh.to);
      w = w.replace(/([a-z])\1\1+/g, '$1$1') || part.toLowerCase();
      return upper ? cap(w) : w;
    }).join('');
  }

  // ---- The lexicon -------------------------------------------------------------------------------

  /** The word for an English gloss (any word; the core vocabulary is listed in `LEXICON`). */
  word(en: string): Word {
    const key = en.toLowerCase();
    const hit = this.cache.get(key);
    if (hit) return hit;
    const r = mulberry32(hashString(`${this.key}#w#${key}`));
    const c = LEX.get(key);
    const seed = this.t.seeds[key];
    const P = this.parent;
    let w: Word | null = null;
    // A language whose parent grew from the same template inherits its old words from the parent;
    // one from another template keeps some of its own.
    if (seed && (!P || P.t.id !== this.t.id) && r() < (this.pTemplate + 0.15) * (P ? 0.5 : 1)) {
      const spell = this.respell(seed);
      w = { spell, ipa: this.toIpa(spell), src: 'old' };
    }
    if (!w && P) {
      const core = c?.pos === 'pron' || c?.pos === 'num' || /^(pronoun|adposition):/.test(key);
      if (r() < (core ? Math.min(0.97, this.retention + 0.12) : this.retention)) w = this.inherit(P.segments(P.word(key)));
    }
    if (!w) {
      const [lo, hi] = this.t.roots;
      const short = c?.short || c?.pos === 'pron' || c?.pos === 'adv' || /^(pronoun|adposition):/.test(key);
      const n = short ? 1 : Math.max(1, lo + Math.floor(r() * (hi - lo + 1)) - (c && c.pos !== 'n' && c.pos !== 'v' && r() < 0.4 ? 1 : 0));
      w = { ...this.gen(r, n), src: 'new' };
    }
    this.cache.set(key, w!);
    return w!;
  }

  pronoun(i: number): Word {
    return this.word(`pronoun:${PRONOUNS[i]}`);
  }

  /** The class of a noun, for languages with two (by meaning, or by chance). */
  genderOf(en: string): 0 | 1 {
    const g = this.grammar;
    if (!g.genders) return 0;
    const c = LEX.get(en);
    if (g.genderKind === 'animacy') return c && (c.cat === 'People' || c.cat === 'Animals') ? 0 : 1;
    if (/^(woman|mother|daughter|sister|queen|lady|girl|she)$/.test(en)) return 1;
    if (/^(man|father|son|brother|king|lord|boy|prince|he)$/.test(en)) return 0;
    return (hashString(`${this.key}#g#${en}`) & 1) as 0 | 1;
  }

  // ---- Descent -------------------------------------------------------------------------------------

  /** A word's sounds as segments. */
  segments(w: Word): string[] {
    return segment(w.ipa);
  }

  /** The nearest sound this language has to a sound (its own, if it has it). */
  private adapt(s: string): string {
    const hit = this.adaptCache.get(s);
    if (hit !== undefined) return hit;
    let out = '';
    const c = CONS.get(s), v = VOW.get(s);
    if (this.spelling.has(s)) out = s;
    else if (c) {
      let best = -1;
      for (const p of this.consonants) {
        const x = CONS.get(p.ipa);
        if (!x) continue;
        const sc = (x.place === c.place ? 3 : 0) + (x.manner === c.manner ? 4 : 0) + (CLASS[x.manner] === CLASS[c.manner] ? 2.5 : 0) + (x.voiced === c.voiced ? 1.5 : 0) - Math.abs(PLACE_ORDER.indexOf(x.place) - PLACE_ORDER.indexOf(c.place)) * 0.4 + p.w * 0.01;
        if (sc > best) {
          best = sc;
          out = p.ipa;
        }
      }
      // A glottal stop or a sound with nothing near simply goes.
      if (best < 3) out = '';
    } else if (v) {
      let best = -Infinity;
      for (const p of this.vowels) {
        const x = VOW.get(p.ipa);
        if (!x) continue;
        const sc = -Math.abs(HEIGHT_ORDER.indexOf(x.height) - HEIGHT_ORDER.indexOf(v.height)) * 1.2 - (x.back === v.back ? 0 : 1) - (x.rounded === v.rounded ? 0 : 0.6) - (!!x.long === !!v.long ? 0 : 0.5) + p.w * 0.01;
        if (sc > best) {
          best = sc;
          out = p.ipa;
        }
      }
    }
    this.adaptCache.set(s, out);
    return out;
  }

  /**
   * A parent's word (as segments) as this language says it: through its sound changes, into its
   * own sounds, its clusters and endings mended, spelled its own way. Null if nothing usable is left.
   */
  inherit(segs: string[], src: Word['src'] = 'inherited'): Word | null {
    let w = segs;
    for (const ch of this.changes) w = ch.apply(w);
    w = w.map((s) => this.adapt(s)).filter(Boolean);
    w = this.mend(w);
    if (!w.some(isVowel)) return null;
    const syls = this.syllabify(w);
    if (this.tones) {
      const h = hashString(`${this.key}#tone#${w.join('')}`);
      syls.forEach((s, i) => s.push(`#${1 + ((h >>> (i * 3)) % this.tones)}`));
    }
    const spell = this.spellOf(syls);
    if (spell.length < 1 || awkward(spell)) return null;
    return { spell, ipa: this.ipaOf(syls), src };
  }

  /**
   * How a written form is said: IPA with the language's stress, and a rough English-style
   * respelling with the stressed syllable in capitals ("VAHR-skish").
   */
  pronounce(spell: string): { ipa: string; sounds: string } {
    const segs = segment(this.toIpa(spell));
    if (!segs.some(isVowel)) return { ipa: segs.join(''), sounds: spell };
    const syls = this.syllabify(segs);
    const n = syls.length;
    const at = this.stress === 'none' || n < 2 ? -1 : this.stress === 'initial' ? 0 : this.stress === 'final' ? n - 1 : Math.max(0, n - 2);
    const ipa = syls.map((s, i) => (i === at ? 'ˈ' : '') + s.join('')).join(n > 1 && at < 0 ? '.' : '');
    const sounds = syls.map((s, i) => {
      const closed = !isVowel(s[s.length - 1]);
      const w = s.map((x) => (isVowel(x) ? (closed ? SAY_SHUT : SAY_OPEN)[x.replace('ː', '')] ?? x : SAY_C[x] ?? x.replace('ʰ', ''))).join('');
      return i === at ? w.toUpperCase() : w;
    }).join('-');
    return { ipa, sounds };
  }

  /** Mends a word to the language's patterns: no runs of three consonants, allowed clusters and endings. */
  private mend(w: string[]): string[] {
    const out: string[] = [];
    for (const s of w) {
      const prev = out[out.length - 1];
      // Doubled sounds become one (a long vowel where the language has it).
      if (s === prev) {
        if (isVowel(s) && this.spelling.has(`${s}ː`)) out[out.length - 1] = `${s}ː`;
        continue;
      }
      if (isVowel(s) && prev && isVowel(prev) && (prev.startsWith(s) || s.startsWith(prev))) continue;
      out.push(s);
    }
    const C = (s?: string) => !!s && !isVowel(s);
    // Three consonants in a row lose the middle one.
    for (let i = 1; i < out.length - 1; i++) if (C(out[i - 1]) && C(out[i]) && C(out[i + 1])) out.splice(i--, 1);
    // Onset clusters the language does not allow lose their first sound.
    if (C(out[0]) && C(out[1]) && !this.onsets.some((o) => o[0] === out[0] && o[1] === out[1])) out.shift();
    // Open-syllable languages break up clusters (but keep a nasal before a consonant if they allow one).
    if (this.open) {
      const nasalCoda = this.syl.some(([p, wt]) => wt >= 0.3 && p.endsWith('N'));
      for (let i = 0; i < out.length - 1; i++) {
        if (C(out[i]) && C(out[i + 1]) && !(nasalCoda && isNasal(out[i]))) out.splice(i + 1, 0, this.epenthetic);
      }
    }
    // A sound that may not end a word: dropped, or given a vowel after it in open languages.
    for (let t = 0; t < 2; t++) {
      const last = out[out.length - 1];
      if (!C(last) || this.finals.has(last)) break;
      if (this.open || out.length < 3) out.push(this.epenthetic);
      else out.pop();
    }
    return out;
  }

  /** Segments into syllables: each vowel a nucleus, one consonant (or an allowed pair) starting the next. */
  private syllabify(w: string[]): string[][] {
    const nuc = w.map((s, i) => (isVowel(s) ? i : -1)).filter((i) => i >= 0);
    const out: string[][] = [];
    let start = 0;
    nuc.forEach((v, k) => {
      const next = nuc[k + 1];
      let end: number;
      if (next === undefined) end = w.length;
      else {
        const run = next - v - 1;
        // ŋ never starts a syllable; it closes the one before.
        let onset = run > 0 && !(run === 1 && w[next - 1] === 'ŋ') ? 1 : 0;
        if (run >= 2 && this.onsets.some((o) => o[0] === w[next - 2] && o[1] === w[next - 1])) onset = 2;
        end = next - onset;
      }
      out.push(w.slice(start, end));
      start = end;
    });
    return out.length ? out : [w];
  }

  /**
   * An old name: English glosses said in an older language (the parent, or a neighbour's), run
   * together and worn down to two or three syllables, then through this language's changes.
   * Returns the name and the old form it came from.
   */
  oldName(glosses: string[], from: Language): { word: Word; old: string } | null {
    const parts = glosses.map((g) => from.word(g));
    let segs = parts.flatMap((p) => from.segments(p));
    segs = syncope(segs, 3);
    const w = from === this.parent || this.parent === null ? this.inherit(segs, 'old') : this.borrow(segs);
    if (!w || w.spell.length < 3 || w.spell.length > 12) return null;
    return { word: w, old: parts.map((p) => p.spell).join('-') };
  }

  /** A word taken from another language long ago: its sounds made this language's, then changed with the rest. */
  borrow(segs: string[]): Word | null {
    return this.inherit(segs.map((s) => this.adapt(s)).filter(Boolean), 'old');
  }

  // ---- Names ---------------------------------------------------------------------------------------

  /** A proper name (a place, a person's root, a house). */
  properName(r: Rng, settlement = false): string {
    const L = this.spec.legacy;
    for (let t = 0; t < 12; t++) {
      let s: string;
      if (L && r() < this.pTemplate) s = this.respell(legacyName(L, r, settlement));
      else {
        const [lo, hi] = this.t.roots;
        const m = r();
        if (m < 0.45) {
          const root = this.gen(r, Math.max(1, lo + Math.floor(r() * (hi - lo + 1)) - 1)).spell;
          const suf = L?.ends && r() < 0.5 ? this.respell(pick(r, L.ends)) : this.word(pick(r, PLACE_CONCEPTS)).spell;
          s = join(root, suf);
        } else if (m < 0.65) s = join(this.word(pick(r, ROOT_CONCEPTS)).spell, this.word(pick(r, PLACE_CONCEPTS)).spell);
        else s = this.gen(r, Math.min(3, hi + (r() < 0.4 ? 1 : 0))).spell;
      }
      s = tidy(s);
      if (s.length < 3 || s.length > (s.includes(' ') ? 20 : 14) || awkward(s)) continue;
      return s;
    }
    return tidy(this.gen(r, 2).spell);
  }

  /** A given name (`fresh`: made from the language's sounds, never a familiar one). */
  givenName(r: Rng, female: boolean, fresh = false): string {
    const list = this.spec.given?.[female ? 1 : 0];
    // Fresh names never come from the template's list of familiar names (for gods and spirits).
    if (!fresh && list?.length && r() < this.pTemplate) return this.respell(pick(r, list));
    const ends = female ? this.t.fem : this.t.masc;
    for (let t = 0; t < 8; t++) {
      const root = this.gen(r, this.t.roots[1] <= 1 ? 1 + (r() < 0.4 ? 1 : 0) : 1 + (r() < 0.35 ? 1 : 0)).spell;
      const s = tidy(ends.length ? join(root, this.respell(pick(r, ends))) : root);
      if (s.length >= 2 && s.length <= 12 && !awkward(s)) return s;
    }
    return tidy(this.gen(r, 2).spell);
  }

  /** A family or clan name (in the cultures that put it first). */
  familyName(r: Rng): string {
    const list = this.spec.families;
    if (list?.length && r() < this.pTemplate) return this.respell(pick(r, list));
    return tidy(this.gen(r, this.t.roots[1] <= 1 ? 1 : 2).spell);
  }

  // ---- Grammar ---------------------------------------------------------------------------------------

  /** A noun phrase: adjectives, articles, plural and the noun's class agreement. */
  nounPhrase(noun: string, o: { adjs?: string[]; def?: boolean; indef?: boolean; plural?: boolean } = {}): Token[] {
    const g = this.grammar;
    const f = this.forms;
    let n = this.word(noun).spell;
    let gl = noun;
    const gen = this.genderOf(noun);
    if (o.plural) {
      if (g.plural === 'suffix') n = join(n, f.plural);
      else if (g.plural === 'prefix') n = join(f.plural, n);
      else if (g.plural === 'reduplication') n = `${n.slice(0, Math.min(3, n.length))}${n}`;
      if (g.plural !== 'none') gl += '.PL';
    }
    if (o.def && g.def === 'suffix') {
      n = join(n, f.def);
      gl += '-DEF';
    } else if (o.def && g.def === 'prefix') {
      n = `${f.def}-${n}`;
      gl = `DEF-${gl}`;
    }
    const head: Token = { form: n, gloss: gl };
    const adjs: Token[] = (o.adjs ?? []).map((a) => {
      let w = this.word(a).spell;
      let ag = a;
      if (g.genders && g.genderKind !== 'animacy' && g.agree && gen === 1) {
        w = join(w, f.fem);
        ag += '.F';
      }
      return { form: w, gloss: ag };
    });
    const out = g.adj === 'before' ? [...adjs, head] : [head, ...adjs];
    if (o.def && g.def === 'word') out.unshift({ form: f.def, gloss: 'the' });
    if (o.indef && !o.def && g.indef === 'word') out.unshift({ form: f.indef, gloss: 'a' });
    return out;
  }

  /** "The thing of the owner", by the language's way of showing possession. */
  possess(thing: Token[], owner: Token[]): Token[] {
    const g = this.grammar;
    const f = this.forms;
    const last = (ts: Token[], suf: string, gl: string): Token[] => ts.map((t, i) => (i === ts.length - 1 ? { form: join(t.form, suf), gloss: `${t.gloss}-${gl}` } : t));
    const first = (ts: Token[], pre: string, gl: string): Token[] => ts.map((t, i) => (i === 0 ? { form: join(pre, t.form), gloss: `${gl}-${t.gloss}` } : t));
    switch (g.poss) {
      case 'suffix':
        return [...last(owner, f.poss, 'GEN'), ...thing];
      case 'prefix':
        return [...owner, ...first(thing, f.poss, 'POSS')];
      case 'particle':
        return [...owner, { form: f.poss, gloss: 'GEN' }, ...thing];
      case 'construct':
        return [...thing, ...owner];
      default:
        return g.adposition === 'post' ? [...owner, { form: f.of, gloss: 'of' }, ...thing] : [...thing, { form: f.of, gloss: 'of' }, ...owner];
    }
  }

  /** A verb in a tense, agreeing with its subject (person 0 to 5) where the language does that. */
  verb(v: string, tense: 'past' | 'present' | 'future', person: number, neg = false): Token[] {
    const g = this.grammar;
    const f = this.forms;
    let w = this.word(v).spell;
    let gl = v;
    const out: Token[] = [];
    if (tense !== 'present') {
      const aff = tense === 'past' ? f.past : f.future;
      const tag = tense === 'past' ? 'PST' : 'FUT';
      if (g.tense === 'suffix') {
        w = join(w, aff);
        gl += `-${tag}`;
      } else if (g.tense === 'prefix') {
        w = join(aff, w);
        gl = `${tag}-${gl}`;
      } else out.push({ form: aff, gloss: tag });
    }
    if (g.agree && person >= 0) {
      w = join(w, this.personEndings[[0, 1, 2, 2, 2, 3, 4, 5][person] ?? 2]);
      gl += `-${['1SG', '2SG', '3SG', '3SG', '3SG', '1PL', '2PL', '3PL'][person]}`;
    }
    if (neg) out.unshift({ form: f.neg, gloss: 'NEG' });
    out.push({ form: w, gloss: gl });
    return out;
  }

  /** Subject, verb and object in the language's order. */
  clause(s: Token[], v: Token[], o: Token[], extra: Token[] = []): Token[] {
    const order: Order = this.grammar.order;
    const parts: Record<string, Token[]> = { S: s, V: v, O: o };
    const seq = order.split('').flatMap((k) => parts[k]);
    // Other phrases go before the verb in verb-final languages, after the object otherwise.
    if (!extra.length) return seq;
    if (order.endsWith('V')) {
      const vi = seq.indexOf(v[0]);
      return [...seq.slice(0, vi), ...extra, ...seq.slice(vi)];
    }
    return [...seq, ...extra];
  }

  /** Whether a proper name comes before the noun it names ("Varsk Lake") or after it ("Lake Varsk"). */
  get properFirst(): boolean {
    return this.compound === 'final' || (this.compound === false && this.grammar.adj === 'before');
  }

  /** A noun phrase standing beside a proper name: "Lake Varsk", "Varsk Hills". */
  appose(head: Token[], proper: Token): Token[] {
    return this.properFirst ? [proper, ...head] : [...head, proper];
  }

  /** An adposition ("by", "in", "to") with its phrase. */
  adpose(prep: string, np: Token[]): Token[] {
    const p = { form: this.word(`adposition:${prep}`).spell, gloss: prep };
    return this.grammar.adposition === 'post' ? [...np, p] : [p, ...np];
  }

  // ---- Describing the language ---------------------------------------------------------------

  /** Syllable shapes in the usual notation, e.g. "(C)(C)V(C)". */
  syllableStructure(): string {
    const pats = this.syl.filter(([, w]) => w > 0.3).map(([p]) => p);
    const on = Math.max(...pats.map((p) => p.indexOf('V'))), co = Math.max(...pats.map((p) => p.length - p.indexOf('V') - 1));
    const optOn = pats.some((p) => p.startsWith('V')), optCo = pats.some((p) => p.endsWith('V'));
    const onset = Array.from({ length: on }, (_, i) => (optOn || i > 0 || pats.some((p) => p.indexOf('V') <= i) ? '(C)' : 'C')).join('');
    const coda = Array.from({ length: co }, (_, i) => (optCo || i > 0 ? '(C)' : 'C')).join('');
    return `${onset}V${coda}`;
  }
}

/** The old naming algorithm (curated syllables and compounds), for template-like names. */
function legacyName(c: NonNullable<LangSpec['legacy']>, rnd: Rng, settlement: boolean): string {
  let s: string;
  const r = rnd();
  const cc = c.compoundChance ?? 0;
  if (c.roots && c.suffixes && r < cc) s = join(pick(rnd, c.roots), pick(rnd, c.suffixes));
  else if (c.roots && r < cc * 1.3) s = join(pick(rnd, c.roots), pick(rnd, c.ends).toLowerCase());
  else if (c.suffixes && r < cc * 1.6) s = join(pick(rnd, c.starts), pick(rnd, c.suffixes));
  else {
    s = pick(rnd, c.starts);
    if (rnd() < c.midChance) s = join(s, pick(rnd, c.mids));
    s = join(s, pick(rnd, c.ends));
  }
  s = tidy(s);
  if (c.prefixes && rnd() < (c.prefixChance ?? 0)) {
    const p = pick(rnd, c.prefixes);
    if (p.endsWith(' ')) {
      if (settlement) s = p + s;
    } else s = tidy(join(p, s.toLowerCase()));
  }
  return s;
}

export type { POS };
