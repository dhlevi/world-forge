import { hash32, hashString, mulberry32, type Rng } from '../gen/rng';
import { ADJECTIVES, CULTURES, type Culture, DEFAULT_TERMS, type FeatureKind, MOTIFS } from './cultures';

const pick = <T>(rnd: Rng, a: T[]): T => a[Math.floor(rnd() * a.length)];
const VOWEL = /[aeiouy]/i;

/** Joins name parts, softening awkward vowel seams. */
function join(a: string, b: string): string {
  if (!a) return b;
  const last = a[a.length - 1].toLowerCase(), first = b[0].toLowerCase();
  // Doubled vowels across the seam, or three vowels in a row, read badly ("Liaost"); drop from the second part.
  const tailV = (a.match(/[aeiouy]+$/i)?.[0].length ?? 0);
  if (VOWEL.test(last) && last === first) b = b.slice(1);
  while (tailV > 0 && b.length > 2 && VOWEL.test(b[0]) && tailV + (b.match(/^[aeiouy]+/i)?.[0].length ?? 0) > 2) b = b.slice(1);
  return a + b;
}

function tidy(s: string): string {
  return s.replace(/([a-z])\1\1+/gi, '$1$1').replace(/^./, (c) => c.toUpperCase());
}

/**
 * Remembers the names given out in one world so features don't repeat each other, and makes
 * every name deterministic from the world seed and a per-feature key.
 */
export class NameBank {
  private used = new Set<string>();
  private seed: number;

  /**
   * With `unique` off, names never depend on what was named before (for things generated
   * lazily in view order, like villages and town plans), at the cost of rare repeats.
   */
  constructor(seed: string, private unique = true) {
    this.seed = hashString(seed + '#names');
  }

  rng(key: string): Rng {
    return mulberry32(hash32(this.seed ^ hashString(key)));
  }

  /** A proper name in the culture's phonology. */
  proper(cul: Culture, rnd: Rng): string {
    for (let t = 0; t < 16; t++) {
      let s: string;
      if (cul.roots && cul.suffixes && rnd() < (cul.compoundChance ?? 0)) {
        s = join(pick(rnd, cul.roots), pick(rnd, cul.suffixes));
      } else {
        s = pick(rnd, cul.starts);
        if (rnd() < cul.midChance) s = join(s, pick(rnd, cul.mids));
        s = join(s, pick(rnd, cul.ends));
      }
      s = tidy(s);
      if (cul.prefixes && rnd() < (cul.prefixChance ?? 0)) {
        const p = pick(rnd, cul.prefixes);
        s = p.endsWith(' ') ? p + s : tidy(join(p, s.toLowerCase()));
      }
      if (s.length < 3 || s.length > 14) continue;
      if (this.unique && this.used.has(s) && t < 15) continue;
      if (this.unique) this.used.add(s);
      return s;
    }
    return 'Nameless';
  }

  /** A name for a feature of the given kind in a culture, from a stable key. */
  feature(kind: FeatureKind, cultureIdx: number, key: string, base?: string): string {
    const cul = CULTURES[cultureIdx] ?? CULTURES[0];
    const rnd = this.rng(`${kind}:${key}`);
    const templates = kind === 'realm' ? cul.realm : cul.terms[kind] ?? DEFAULT_TERMS[kind];
    for (let t = 0; t < 8; t++) {
      const tpl = pick(rnd, templates);
      const name = tpl
        .replace('{N}', () => base ?? this.proper(cul, rnd))
        .replace('{A}', () => pick(rnd, ADJECTIVES))
        .replace('{M}', () => pick(rnd, MOTIFS));
      if (this.unique && !tpl.includes('{N}') && this.used.has(name)) continue;
      if (this.unique) this.used.add(name);
      return name;
    }
    return this.proper(cul, rnd);
  }

  /** A settlement name. */
  place(cultureIdx: number, key: string): string {
    return this.proper(CULTURES[cultureIdx] ?? CULTURES[0], this.rng(`place:${key}`));
  }
}

const INN_ADJ = ['Golden', 'Black', 'Red', 'Silver', 'Copper', 'Green', 'Prancing', 'Drunken', 'Rusty', 'Laughing', 'Sleeping', 'Red', 'Silver', 'Crooked', 'Jolly', 'Wandering', 'Green', 'Black', 'Blind', 'Merry', 'Leaping', 'Gilded', 'Weary', 'Salty', 'Three-Legged', 'Horned', 'Dead', 'Broken'];
const INN_NOUN = ['Goose', 'Stag', 'Boar', 'Lantern', 'Anchor', 'Crown', 'Dragon', 'Barrel', 'Rose', 'Ox', 'Hound', 'Raven', 'Cup', 'Kettle', 'Plough', 'Wheel', 'Fiddle', 'Mermaid', 'Unicorn', 'Swan', 'Bell', 'Griffin', 'Pony', 'Owl', 'Tankard', 'Pig', 'Hart', 'Ferret', 'Mare', 'Wyvern', 'Maid', 'Fox', 'Hound'];

/** A tavern or inn sign, e.g. "The Drunken Goose" or "The Crown and Anchor". */
export function innName(rnd: Rng): string {
  const r = rnd();
  if (r < 0.55) return `The ${pick(rnd, INN_ADJ)} ${pick(rnd, INN_NOUN)}`;
  if (r < 0.85) {
    const a = pick(rnd, INN_NOUN);
    let b = pick(rnd, INN_NOUN);
    if (b === a) b = 'Crown';
    return `The ${a} and ${b}`;
  }
  return `The ${pick(rnd, INN_NOUN)}'s Rest`;
}

/** A god or saint for a temple, in the local culture's phonology. */
export function deityName(bank: NameBank, cultureIdx: number, key: string): string {
  const cul = CULTURES[cultureIdx] ?? CULTURES[0];
  const rnd = bank.rng(`deity:${key}`);
  const n = bank.proper(cul, rnd);
  const r = rnd();
  return r < 0.4 ? `Temple of ${n}` : r < 0.7 ? `Shrine of ${n}` : cul.id === 'anglo' || cul.id === 'celtic' ? `St ${n}'s` : `House of ${n}`;
}
