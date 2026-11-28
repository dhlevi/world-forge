/**
 * Things written (from play, 27 November 2026; docs/design/quests.md, notice boards): words written
 * in a people's language and in its script (core lang/script.ts), and what the wanderer makes of
 * them. Reading it (25 and over in that language: a plain notice needs no scholar), they read it
 * all; a little (10 to 24), the words they know; less, nothing but the letters. One who cannot read
 * at all (no language read at 20) makes nothing of any writing. Reading teaches a little.
 */
import { CULTURES } from '@worldforge/core/names/cultures';
import { translateText, joinTokens } from '@worldforge/core/lang/translate';
import { scriptOf, textSvg } from '@worldforge/core/lang/script';
import type { Skills } from '../actors/components';
import { caughtWords } from '../world/speech';

/** Reading well enough to read it all, and enough to make out some. */
export const READ_FLUENT = 25, READ_SOME = 10;

export interface Written {
  /** The language's name ("Varskish"), or null if it has none (then it is read as plain words). */
  tongue: string | null;
  /** The words as written (spelled in the language), and drawn in its script (SVG). */
  said: string;
  svg: string;
  /** How well the wanderer reads that language (0 to 100). */
  level: number;
  /** What they make of it: all of it, some words, or nothing. */
  reading: 'all' | 'some' | 'none';
  /** The words they read (the text, or the words they know), if any. */
  read: string | null;
}

/** Writing in a people's language (an index into CULTURES), and what the wanderer makes of it. */
export function written(text: string, culture: number | null | undefined, sk: Skills | undefined, o: { size?: number; maxWidth?: number } = {}): Written {
  const c = culture ?? null, L = c !== null ? CULTURES[c]?.language : null;
  const literate = !!sk?.literate();
  if (!L || c === null) return { tongue: null, said: text, svg: '', level: literate ? 100 : 0, reading: literate ? 'all' : 'none', read: literate ? text : null };
  const tokens = translateText(L, text);
  const said = joinTokens(tokens);
  const svg = textSvg(scriptOf(L), said, { size: o.size ?? 22, maxWidth: o.maxWidth ?? 520 });
  const level = literate ? sk?.d.languages[String(c)]?.read ?? 0 : 0;
  const reading = level >= READ_FLUENT ? 'all' : level >= READ_SOME ? 'some' : 'none';
  return { tongue: CULTURES[c]?.name ?? null, said, svg, level, reading, read: reading === 'all' ? text : reading === 'some' ? caughtWords(tokens, c, level) : null };
}

/** Reading a thing in a language teaches a little more of it (as hearing it does for speech). */
export function readIn(sk: Skills | undefined, culture: number | null | undefined): void {
  if (!sk || culture === null || culture === undefined || !CULTURES[culture]) return;
  const cur = sk.d.languages[String(culture)];
  if (!cur || cur.read < READ_SOME || cur.read >= 90) return;
  sk.language(String(culture), cur.name, cur.speak, cur.read + 0.05);
}
