import { type Language, SAMPLE, type Token, type Word } from './language';
import { BACKS, CONS, HEIGHTS, MANNERS, PLACES, VOW } from './phonemes';
import { PRONOUNS } from './lexicon';
import { translate } from './translate';
import { numberExamples, numberStructure, numberSystem, numberWord } from './numbers';

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
  const pp = g.possPron;
  out.push(pp === 'word' ? `“My”, “your”, “their” and the rest are words of their own${g.poss === 'suffix' ? ' (the pronoun with its possessive ending)' : ''}, ${g.adj === 'before' || g.def === 'word' ? 'before' : 'after'} the noun.`
    : pp === 'suffix' ? `“My”, “your”, “their” and the rest are endings on the thing owned: ${L.possEndings.map((e, i) => `-${e} (${POSS_EN[i]})`).join(', ')}.`
      : pp === 'prefix' ? `“My”, “your”, “their” and the rest are prefixes on the thing owned: ${L.possEndings.map((e, i) => `${e}- (${POSS_EN[i]})`).join(', ')}.`
        : '“My”, “your” and “their” are the pronouns, owning the thing as any owner does (“house of me”).');
  if (g.genders) out.push(`Nouns are ${g.genders[0]} or ${g.genders[1]}${g.genderKind !== 'animacy' && g.agree ? `; adjectives take -${f.fem} with ${g.genders[1]} nouns` : ''}.`);
  out.push(g.tense === 'particle' ? `Tense is shown by particles before the verb: ${f.past} (past), ${f.future} (future).` : g.tense === 'prefix' ? `Tense is shown by prefixes: ${f.past}- (past), ${f.future}- (future).` : `Tense is shown by suffixes: -${f.past} (past), -${f.future} (future).`);
  if (g.agree) out.push(`Verbs agree with their subject: ${L.personEndings.map((e, i) => `-${e} (${['I', 'you', 'he, she, it', 'we', 'you all', 'they'][i]})`).join(', ')}.`);
  out.push(`It uses ${g.adposition === 'pre' ? 'prepositions (“by the river”)' : 'postpositions (“the river by”)'}; “not” is ${f.neg}.`);
  return out;
}

const POSS_EN = ['my', 'your', 'his', 'her', 'its', 'our', 'your (plural)', 'their'];
export function pronounTable(L: Language): { en: string; word: string; ipa: string; poss: string; possEn: string; example: string }[] {
  return PRONOUNS.map((en, i) => ({
    en, word: L.pronoun(i).spell, ipa: L.pronoun(i).ipa, possEn: POSS_EN[i],
    // "My house", written out in the language's own way.
    poss: L.grammar.possPron === 'word' ? L.possessiveWord(i) : L.grammar.possPron === 'suffix' ? `-${L.possEndings[i]}` : L.grammar.possPron === 'prefix' ? `${L.possEndings[i]}-` : L.pronoun(i).spell,
    example: L.nounPhrase('house', { poss: i }).map((t) => t.form).join(' '),
  }));
}

export const EXAMPLES = [
  'the old king', 'the kings', 'three ships', 'twenty-three swords', "the king's sword", 'our father', 'their great city', 'the city of the river', 'The king rules the great city.', 'We saw a white horse by the river.',
  'The warriors will fight the giants of the north.', 'I do not know the way.', "The queen's daughter sang a sweet song.",
];

/** How the language counts, in plain sentences. */
export function countingNotes(L: Language): string[] {
  const n = numberSystem(L);
  const out = [`It ${n.label}.`];
  const w = (x: number) => `${numberWord(L, x)} (${x})`;
  if (n.base === 20) out.push(`Twenty is ${w(20)}, and forty is two twenties, ${w(40)}; four hundred, ${w(400)}, is a score of scores.`);
  if (n.base === 60) out.push(`Sixty is ${w(60)}, and the next power is sixty sixties, ${w(3600)}.`);
  if (n.base === 12) out.push(`Twelve is ${w(12)}, and a dozen dozens, ${w(144)}; ten and eleven have words of their own.`);
  if (n.sub === 5) out.push(`Six to nine are counted on the second hand: six is ${w(6)}, nine is ${w(9)}.`);
  out.push(n.bigFirst ? 'The larger part comes first (“twenty-three”).' : 'The units come before the tens (“three-and-twenty”).');
  out.push(n.multFirst ? 'A multiplier comes before the power it counts (“three hundred”).' : 'A multiplier comes after the power it counts (“hundred three”).');
  out.push(n.fuse ? 'Tens and units are joined in one word.' : 'Tens and units are separate words.');
  out.push(n.link === 'and' ? `The parts of a number are joined by “and” (${L.word('and').spell}).` : n.link === 'last' ? 'The last part of a number follows “and”.' : 'The parts of a number stand side by side, with no “and”.');
  out.push(`Numbers come ${n.after ? 'after' : 'before'} the noun they count${n.noPlural ? ', which stays singular (“three ship”)' : ''}.`);
  return out;
}

/** Numbers in words, with how each is built. */
export function numberTable(L: Language): { n: number; word: string; ipa: string; structure: string }[] {
  return numberExamples(L).map((n) => {
    const word = numberWord(L, n);
    return { n, word, ipa: word.split(' ').map((x) => L.pronounce(x).ipa).join(' '), structure: numberStructure(L, n) };
  });
}

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

/**
 * The sound changes from the parent language, in order, each with an example word where one
 * shows it ("*aqua > acma ‘water’").
 */
export function soundChangeNotes(L: Language): { note: string; example: string }[] {
  const P = L.parent;
  if (!P) return [];
  const words = SAMPLE.filter((g) => L.word(g).src === 'inherited').map((g) => ({ g, segs: P.segments(P.word(g)) }));
  const used = new Set<string>();
  return L.changes.map((ch, k) => {
    for (const { g, segs } of words) {
      if (used.has(g)) continue;
      let cur = segs;
      for (let i = 0; i < k; i++) cur = L.changes[i].apply(cur);
      if (ch.apply(cur).join(' ') === cur.join(' ')) continue;
      used.add(g);
      return { note: ch.note, example: `*${P.word(g).spell} > ${L.word(g).spell} ‘${g}’` };
    }
    return { note: ch.note, example: '' };
  });
}

/** Words of a family side by side: the proto-language's and each member's (with whether it was inherited). */
export const COGNATES = ['water', 'fire', 'stone', 'sun', 'night', 'mother', 'king', 'horse', 'river', 'black', 'two', 'three', 'eat', 'die'];
export function cognates(proto: Language, langs: Language[]): { en: string; proto: string; words: (Word & { kin: boolean })[] }[] {
  return COGNATES.map((en) => ({ en, proto: proto.word(en).spell, words: langs.map((L) => ({ ...L.word(en), kin: L.word(en).src === 'inherited' })) }));
}
