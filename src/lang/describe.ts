import type { Language, Token } from './language';
import { BACKS, CONS, HEIGHTS, MANNERS, PLACES, VOW } from './phonemes';
import { PRONOUNS } from './lexicon';
import { translate } from './translate';

/** Tables and notes describing a language, for the culture window. */

export interface Cell {
  ipa: string;
  spell: string;
}
export function consonantChart(L: Language): { places: string[]; rows: { manner: string; cells: Cell[][] }[] } {
  const cons = L.consonants.map((c) => ({ c: CONS.get(c.ipa)!, spell: c.spell })).filter((x) => x.c);
  const places = PLACES.filter((p) => cons.some((x) => x.c.place === p));
  const rows = MANNERS.filter((m) => cons.some((x) => x.c.manner === m)).map((m) => ({
    manner: m,
    cells: places.map((p) => cons.filter((x) => x.c.manner === m && x.c.place === p).sort((a, b) => Number(a.c.voiced) - Number(b.c.voiced)).map((x) => ({ ipa: x.c.ipa, spell: x.spell }))),
  }));
  return { places, rows };
}

export function vowelChart(L: Language): { backs: string[]; rows: { height: string; cells: Cell[][] }[] } {
  const vs = L.vowels.map((v) => ({ v: VOW.get(v.ipa)!, spell: v.spell })).filter((x) => x.v);
  const backs = BACKS.filter((b) => vs.some((x) => x.v.back === b));
  const rows = HEIGHTS.filter((h) => vs.some((x) => x.v.height === h)).map((h) => ({
    height: h,
    cells: backs.map((b) => vs.filter((x) => x.v.height === h && x.v.back === b).map((x) => ({ ipa: x.v.ipa, spell: x.spell }))),
  }));
  return { backs, rows };
}

const ORDER_TEXT: Record<string, string> = {
  SVO: 'subject, verb, object (“the king rules the city”)', SOV: 'subject, object, verb (“the king the city rules”)', VSO: 'verb, subject, object (“rules the king the city”)',
  VOS: 'verb, object, subject (“rules the city the king”)', OVS: 'object, verb, subject', OSV: 'object, subject, verb',
};

/** The grammar in plain sentences. */
export function grammarNotes(L: Language): string[] {
  const g = L.grammar, f = L.forms;
  const out: string[] = [];
  out.push(`Word order: ${ORDER_TEXT[g.order]}.`);
  out.push(`Adjectives come ${g.adj} the noun.`);
  out.push(g.def === 'none' ? 'There is no word for “the”.' : g.def === 'word' ? `“The” is a separate word, ${f.def}.` : g.def === 'prefix' ? `“The” is a prefix, ${f.def}-.` : `“The” is a suffix, -${f.def}.`);
  out.push(g.indef === 'word' ? `“A” is a separate word, ${f.indef}.` : 'There is no word for “a”.');
  out.push(g.plural === 'none' ? 'Nouns do not mark the plural; number words or context show it.' : g.plural === 'suffix' ? `Plurals take the suffix -${f.plural}.` : g.plural === 'prefix' ? `Plurals take the prefix ${f.plural}-.` : 'Plurals repeat the first syllable of the noun.');
  out.push(g.poss === 'suffix' ? `Possession: the owner takes the suffix -${f.poss} and comes first.` : g.poss === 'prefix' ? `Possession: the thing owned takes the prefix ${f.poss}- and follows its owner.` : g.poss === 'particle' ? `Possession: owner, then the particle ${f.poss}, then the thing owned.` : g.poss === 'construct' ? 'Possession: the thing owned comes first, then its owner, with no word between.' : `Possession: a word for “of”, ${f.of}.`);
  if (g.genders) out.push(`Nouns are ${g.genders[0]} or ${g.genders[1]}${g.genderKind !== 'animacy' && g.agree ? `; adjectives take -${f.fem} with ${g.genders[1]} nouns` : ''}.`);
  out.push(g.tense === 'particle' ? `Tense is shown by particles before the verb: ${f.past} (past), ${f.future} (future).` : g.tense === 'prefix' ? `Tense is shown by prefixes: ${f.past}- (past), ${f.future}- (future).` : `Tense is shown by suffixes: -${f.past} (past), -${f.future} (future).`);
  if (g.agree) out.push(`Verbs agree with their subject: ${L.personEndings.map((e, i) => `-${e} (${['I', 'you', 'he, she, it', 'we', 'you all', 'they'][i]})`).join(', ')}.`);
  out.push(`It uses ${g.adposition === 'pre' ? 'prepositions (“by the river”)' : 'postpositions (“the river by”)'}; “not” is ${f.neg}.`);
  return out;
}

export function pronounTable(L: Language): { en: string; word: string; ipa: string }[] {
  return PRONOUNS.map((en, i) => ({ en, word: L.pronoun(i).spell, ipa: L.pronoun(i).ipa }));
}

export const EXAMPLES = [
  'the old king', 'the kings', "the king's sword", 'the city of the river', 'The king rules the great city.', 'We saw a white horse by the river.',
  'The warriors will fight the giants of the north.', 'I do not know the way.', "The queen's daughter sang a sweet song.",
];

export function examples(L: Language): { en: string; tokens: Token[] }[] {
  return EXAMPLES.map((en) => ({ en, tokens: translate(L, en) }));
}

/** How sounds are written (where it is not obvious), and the spelling rules. */
export function spellingNotes(L: Language): string[] {
  const out: string[] = [];
  for (const [ipa, sp] of L.spelling) if (sp && sp !== ipa) out.push(`/${ipa}/ is written ${sp}`);
  for (const r of L.rules) out.push(r.note);
  return out;
}
