import { table } from '../names/bundles';

/**
 * Language templates: the familiar starting points that every generated language grows from
 * (each kept in its culture's bundle, names/bundles). Each gives a sound inventory (IPA,
 * weighted by how common each sound is), syllable shapes, consonant clusters, how sounds are
 * spelled, a sketch of grammar, a few word endings for given names and demonyms, and seed words
 * (mostly the place-name elements the old naming cultures used) so that a language with little
 * drift still sounds like its template.
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
  /**
   * "My", "your", "their": a word of its own before (or after) the noun, a person ending on the
   * thing owned ("house-my"), a person prefix ("my-house"), or the pronoun as an ordinary owner
   * ("house of me", "me-GEN house"). Unset: chosen from the way the language shows possession.
   */
  possPron?: 'word' | 'suffix' | 'prefix' | 'pronoun';
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
  /** How names are built: one word with the head last ("Blackford"), one word with the head first ("Penbryn"), or a phrase ("Villa Nigra"). */
  compound: 'final' | 'initial' | false;
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

/** Each template's language template (from names/bundles). */
export const LANG_TEMPLATES: Record<string, LangTemplate> = table((b) => b.lang);
