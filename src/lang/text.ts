/** Small helpers for building names from parts. */

const VOWEL = /[aeiouyäöüáéíóúâêîôûåæøë]/i;
const VOWELS = '[aeiouyäöüáéíóúâêîôûåæøë]';

/** Joins name parts, softening awkward vowel seams. */
export function join(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  const last = a[a.length - 1].toLowerCase(), first = b[0].toLowerCase();
  // Doubled vowels across the seam, or three vowels in a row, read badly ("Liaost"); drop from the second part.
  const tailV = a.match(new RegExp(`${VOWELS}+$`, 'i'))?.[0].length ?? 0;
  if (VOWEL.test(last) && last === first) b = b.slice(1);
  while (tailV > 0 && b.length > 2 && VOWEL.test(b[0]) && tailV + (b.match(new RegExp(`^${VOWELS}+`, 'i'))?.[0].length ?? 0) > 2) b = b.slice(1);
  // Doubled consonants across the seam become one ("Varsk" + "kol" → "Varskol").
  if (!VOWEL.test(last) && last === first && b.length > 1) b = b.slice(1);
  return a + b;
}

/** Seams that read badly: four consonants in a row ("Chtlan"), or a chunk said twice ("Drumaonaindrum"). */
export function awkward(s: string): boolean {
  const w = s.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  if (/[^aeiouy]{4,}/.test(w)) return true;
  for (let i = 0; i + 4 <= w.length; i++) if (w.indexOf(w.slice(i, i + 4), i + 1) >= 0) return true;
  return false;
}

export function tidy(s: string): string {
  return s.replace(/([a-z])\1\1+/gi, '$1$1').replace(/^./, (c) => c.toUpperCase());
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
