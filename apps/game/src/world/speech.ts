/**
 * What people say, in the language they speak (docs/backlog.md, N2; characters.md, languages).
 * Everyone speaks their own people's language, and the language of the town they live in; those
 * whose work brings them strangers (merchants, innkeepers, the watch, sailors, pedlars) often speak
 * another. A speaker uses the one of their languages the wanderer knows best.
 *
 * In the log (decided: both): the speaker's name and the language, then the words. Fluent (60 and
 * over), the wanderer reads the line in plain English; a little (20 to 59), the words as said, and
 * what the wanderer catches of them; not at all, only the words as said. The wanderer's own native
 * language needs no note. Hearing a language teaches a little of it.
 *
 * The words as said are the line translated into the language (core lang/translate.ts).
 */
import { CULTURES } from '@worldforge/core/names/cultures';
import { translateText, joinTokens } from '@worldforge/core/lang/translate';
import { hashString } from '@worldforge/core/gen/rng';
import type { Skills } from '../actors/components';
import type { Resident } from './population';

/** Trades that bring strangers, whose people often speak a second language. */
const WORLDLY = /merchant|innkeeper|tavern|tapster|sailor|pedlar|hawker|factor|guard|soldier|captain|sergeant|ferryman|carter|priest|scholar|money-lender/;

/** Speaking well enough to follow everything, and enough to catch something. */
const FLUENT = 60, SOME = 20;

/** The languages a person speaks (indices into CULTURES): their own, the town's, and for the worldly, often the wanderer's own. */
export function tongues(r: Resident, townCulture: number | null, wanderersNative: number | null): number[] {
  const out = [r.p.culture];
  if (townCulture !== null && !out.includes(townCulture)) out.push(townCulture);
  if (wanderersNative !== null && !out.includes(wanderersNative) && WORLDLY.test(r.p.trade.toLowerCase()) && hashString(`${r.p.id}#tongue`) % 100 < 45) out.push(wanderersNative);
  return out.filter((c) => !!CULTURES[c]);
}

/** The wanderer's native language (the one spoken best, if 90 or over), or null. */
export function nativeOf(sk: Skills | undefined): number | null {
  let best: [string, number] | null = null;
  for (const [k, l] of Object.entries(sk?.d.languages ?? {})) if (!best || l.speak > best[1]) best = [k, l.speak];
  return best && best[1] >= 90 ? Number(best[0]) : null;
}

/**
 * A line said by a person to the wanderer, for the log: `Ana: "…"` in the wanderer's native
 * tongue; else `Ana (in Varskish): "…"`, with the words as said and what is caught of them.
 */
export function speech(r: Resident, line: string, sk: Skills | undefined, townCulture: number | null, name = r.p.name): string {
  const native = nativeOf(sk);
  const langs = tongues(r, townCulture, native);
  const level = (c: number) => sk?.d.languages[String(c)]?.speak ?? 0;
  const c = langs.reduce((a, b) => (level(b) > level(a) ? b : a), langs[0]);
  const L = CULTURES[c]?.language;
  const known = level(c);
  if (c === native || !L) return `${name}: "${line}"`;
  const tongue = CULTURES[c]?.name ?? 'a strange tongue';
  // Hearing it teaches a little (more for one who already knows some).
  if (sk && known < 90) sk.language(String(c), tongue, known + (known >= SOME ? 0.05 : 0.02));
  if (known >= FLUENT) return `${name} (in ${tongue}): "${line}"`;
  const tokens = translateText(L, line);
  const said = joinTokens(tokens);
  if (known < SOME) return `${name} (in ${tongue}): "${said}"`;
  const caught = caughtWords(tokens, c, known);
  return `${name} (in ${tongue}): "${said}" You catch: "${caught}".`;
}

/** What is caught of words in a language known so well (0 to 100): each word known by its sense, or "…". */
export function caughtWords(tokens: { punct?: string; gloss: string }[], c: number, known: number): string {
  const caught: string[] = [];
  for (const t of tokens) {
    if (t.punct || !t.gloss) continue;
    // The word's sense, without its marks of grammar (want.PL: want).
    const sense = t.gloss.split(/[-.]/)[0].replace(/_/g, ' ');
    // Marks of grammar (PL, PST) are not words to catch.
    if (/^[^a-z]*[A-Z][^a-z]*$/.test(sense)) continue;
    const knows = hashString(`${c}#${sense}`) % 100 < known * 1.4;
    const word = knows ? sense : '…';
    if (word === '…' && caught[caught.length - 1] === '…') continue;
    caught.push(word);
  }
  return caught.join(' ');
}
