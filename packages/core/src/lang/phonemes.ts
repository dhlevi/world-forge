/**
 * The sounds languages are built from, in the International Phonetic Alphabet, with their place
 * and manner of articulation (for the consonant chart), and a default spelling in the Latin
 * alphabet (languages override it: /ʃ/ may be written sh, sch, sj, x or sz).
 */

export const PLACES = ['bilabial', 'labiodental', 'dental', 'alveolar', 'postalveolar', 'retroflex', 'alveolo-palatal', 'palatal', 'velar', 'uvular', 'pharyngeal', 'glottal'] as const;
export const MANNERS = ['plosive', 'nasal', 'trill', 'tap', 'fricative', 'lateral fricative', 'affricate', 'approximant', 'lateral approximant'] as const;
export type Place = (typeof PLACES)[number];
export type Manner = (typeof MANNERS)[number];

export interface Consonant {
  ipa: string;
  place: Place;
  manner: Manner;
  voiced: boolean;
  spell: string;
}

const C = (ipa: string, place: Place, manner: Manner, voiced: boolean, spell: string): Consonant => ({ ipa, place, manner, voiced, spell });

export const CONSONANTS: Consonant[] = [
  C('p', 'bilabial', 'plosive', false, 'p'), C('b', 'bilabial', 'plosive', true, 'b'), C('pʰ', 'bilabial', 'plosive', false, 'p'),
  C('m', 'bilabial', 'nasal', true, 'm'), C('ɸ', 'bilabial', 'fricative', false, 'f'), C('β', 'bilabial', 'fricative', true, 'v'),
  C('w', 'bilabial', 'approximant', true, 'w'),
  C('f', 'labiodental', 'fricative', false, 'f'), C('v', 'labiodental', 'fricative', true, 'v'), C('ʋ', 'labiodental', 'approximant', true, 'v'),
  C('θ', 'dental', 'fricative', false, 'th'), C('ð', 'dental', 'fricative', true, 'dh'),
  C('t', 'alveolar', 'plosive', false, 't'), C('d', 'alveolar', 'plosive', true, 'd'), C('tʰ', 'alveolar', 'plosive', false, 't'),
  C('n', 'alveolar', 'nasal', true, 'n'), C('r', 'alveolar', 'trill', true, 'r'), C('ɾ', 'alveolar', 'tap', true, 'r'),
  C('s', 'alveolar', 'fricative', false, 's'), C('z', 'alveolar', 'fricative', true, 'z'), C('ɬ', 'alveolar', 'lateral fricative', false, 'll'),
  C('ts', 'alveolar', 'affricate', false, 'ts'), C('tsʰ', 'alveolar', 'affricate', false, 'c'), C('dz', 'alveolar', 'affricate', true, 'dz'), C('tɬ', 'alveolar', 'affricate', false, 'tl'),
  C('l', 'alveolar', 'lateral approximant', true, 'l'),
  C('ʃ', 'postalveolar', 'fricative', false, 'sh'), C('ʒ', 'postalveolar', 'fricative', true, 'zh'),
  C('tʃ', 'postalveolar', 'affricate', false, 'ch'), C('tʃʰ', 'postalveolar', 'affricate', false, 'ch'), C('dʒ', 'postalveolar', 'affricate', true, 'j'),
  C('ʂ', 'retroflex', 'fricative', false, 'sh'), C('ʐ', 'retroflex', 'fricative', true, 'r'),
  C('ɕ', 'alveolo-palatal', 'fricative', false, 'x'), C('ʑ', 'alveolo-palatal', 'fricative', true, 'zh'),
  C('tɕ', 'alveolo-palatal', 'affricate', false, 'j'), C('tɕʰ', 'alveolo-palatal', 'affricate', false, 'q'),
  C('j', 'palatal', 'approximant', true, 'y'), C('ɲ', 'palatal', 'nasal', true, 'ny'), C('ʎ', 'palatal', 'lateral approximant', true, 'll'), C('ç', 'palatal', 'fricative', false, 'ch'),
  C('k', 'velar', 'plosive', false, 'k'), C('g', 'velar', 'plosive', true, 'g'), C('kʰ', 'velar', 'plosive', false, 'k'),
  C('ŋ', 'velar', 'nasal', true, 'ng'), C('x', 'velar', 'fricative', false, 'kh'), C('ɣ', 'velar', 'fricative', true, 'gh'),
  C('q', 'uvular', 'plosive', false, 'q'), C('χ', 'uvular', 'fricative', false, 'kh'), C('ʁ', 'uvular', 'fricative', true, 'r'),
  C('ħ', 'pharyngeal', 'fricative', false, 'h'), C('ʕ', 'pharyngeal', 'fricative', true, ''),
  C('ʔ', 'glottal', 'plosive', false, ''), C('h', 'glottal', 'fricative', false, 'h'),
];
export const CONS = new Map(CONSONANTS.map((c) => [c.ipa, c]));

export const HEIGHTS = ['close', 'near-close', 'close-mid', 'mid', 'open-mid', 'near-open', 'open'] as const;
export const BACKS = ['front', 'central', 'back'] as const;
export type Height = (typeof HEIGHTS)[number];
export type Back = (typeof BACKS)[number];

export interface Vowel {
  ipa: string;
  height: Height;
  back: Back;
  rounded: boolean;
  long?: boolean;
  spell: string;
}
const V = (ipa: string, height: Height, back: Back, rounded: boolean, spell: string): Vowel => ({ ipa, height, back, rounded, spell });

const BASE_VOWELS: Vowel[] = [
  V('i', 'close', 'front', false, 'i'), V('y', 'close', 'front', true, 'ü'), V('ɨ', 'close', 'central', false, 'y'), V('ɯ', 'close', 'back', false, 'eu'), V('u', 'close', 'back', true, 'u'),
  V('ɪ', 'near-close', 'front', false, 'i'), V('ʊ', 'near-close', 'back', true, 'u'),
  V('e', 'close-mid', 'front', false, 'e'), V('ø', 'close-mid', 'front', true, 'ö'), V('o', 'close-mid', 'back', true, 'o'),
  V('ə', 'mid', 'central', false, 'e'),
  V('ɛ', 'open-mid', 'front', false, 'e'), V('œ', 'open-mid', 'front', true, 'ö'), V('ʌ', 'open-mid', 'back', false, 'eo'), V('ɔ', 'open-mid', 'back', true, 'o'),
  V('æ', 'near-open', 'front', false, 'ae'),
  V('a', 'open', 'central', false, 'a'), V('ɑ', 'open', 'back', false, 'a'),
];
/** Plain vowels and their long forms (aː, written double by default). */
export const VOWELS: Vowel[] = [...BASE_VOWELS, ...BASE_VOWELS.map((v) => ({ ...v, ipa: `${v.ipa}ː`, long: true, spell: v.spell.length === 1 ? v.spell + v.spell : v.spell }))];
export const VOW = new Map(VOWELS.map((v) => [v.ipa, v]));

export const isVowel = (s: string) => VOW.has(s);
export const isNasal = (s: string) => CONS.get(s)?.manner === 'nasal';
export const isFrontVowel = (s: string) => VOW.get(s)?.back === 'front';
export const isBackVowel = (s: string) => VOW.get(s)?.back === 'back';
export const isSonorant = (s: string) => {
  const c = CONS.get(s);
  return !!c && (c.manner === 'nasal' || c.manner === 'trill' || c.manner === 'tap' || c.manner === 'approximant' || c.manner === 'lateral approximant');
};
