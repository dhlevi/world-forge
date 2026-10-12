import type { Rng } from '../gen/rng';
import { CULTURES } from '../names/cultures';
import type { NameBank } from '../names/names';
import { GIVEN, JAPONIC_A, JAPONIC_B, KOREANIC_FAMILY, SINIC_FAMILY } from '../lang/given';

/**
 * People's names for the realms' rulers, heirs, courts and houses: given names by culture and
 * sex, name order (family name first in the East), patronymics, epithets and house names.
 */

const pick = <T>(rnd: Rng, a: readonly T[]): T => a[Math.floor(rnd() * a.length)];

/** The folk a template's people are (humans unless elves or dwarves). */
const FOLK: Record<string, string> = { elvish: 'Elves', dwarven: 'Dwarves' };
export const cultureId = (c: number) => CULTURES[c]?.id ?? 'anglo';
/** A culture's name ("Varskish"). */
export const cultureLabel = (c: number) => CULTURES[c]?.name ?? 'Unknown';
export const cultureFolk = (c: number) => FOLK[cultureId(c)] ?? 'Humans';
const SURNAME_FIRST = new Set(['sinic', 'japonic', 'koreanic']);

export interface PersonName {
  given: string;
  /** Family or clan name, where the culture uses one in speech. */
  family?: string;
  /** "Ragnar Haraldsson", "Harun ibn Yusuf", "Takeda Harunobu". */
  full: string;
}

/** A given name for someone of this culture (index into CULTURES), in its language. */
export function givenName(ci: number, female: boolean, rnd: Rng): string {
  const c = CULTURES[ci] ?? CULTURES[0];
  if (c.language) return c.language.givenName(rnd, female);
  const g = GIVEN[c.id] ?? GIVEN.anglo;
  return pick(rnd, female ? g[1] : g[0]);
}

/**
 * A person's name: given name, then the culture's surname form (a patronymic, a clan name, or
 * the house name in the family-name-first cultures).
 */
export function personName(ci: number, female: boolean, rnd: Rng, house?: House, father?: string): PersonName {
  const cul = cultureId(ci);
  const L = CULTURES[ci]?.language;
  // Patronymic words, as the language now says them.
  const w = (s: string) => (L ? L.respell(s) : s);
  const given = givenName(ci, female, rnd);
  const fa = father ?? givenName(ci, false, rnd);
  if (SURNAME_FIRST.has(cul) && house) return { given, family: house.short, full: `${house.short} ${given}` };
  switch (cul) {
    case 'norse': {
      const stem = fa.replace(/r$/, '').replace(/ ?$/, '');
      return { given, full: `${given} ${stem}${w(female ? 'sdottir' : 'sson')}` };
    }
    case 'desert':
      return { given, full: `${given} ${w(female ? 'bint' : 'ibn')} ${fa}` };
    case 'celtic':
      return { given, full: `${given} ${w(female ? 'ferch' : rnd() < 0.5 ? 'mac' : 'ap')} ${fa}` };
    case 'dwarven':
      return { given, full: `${given} ${female ? 'daughter' : 'son'} of ${fa}` };
    case 'slavic':
      return { given, full: given };
    default:
      return { given, full: given };
  }
}

export interface House {
  id: number;
  /** "House Ashford", "the Banu Rashid", "the Zhao clan". */
  name: string;
  /** The bare name ("Ashford", "Zhao"). */
  short: string;
  culture: number;
  /** House this one is a cadet branch of, or -1. */
  cadetOf: number;
  /** Year founded. */
  founded: number;
  motto: string;
  /** Seat of the house (where its founder held land). */
  seatName: string;
}

const MOTTO = [
  'We Do Not Kneel', 'Faith and Steel', 'Ever Vigilant', 'By Right of Blood', 'Honour Above All', 'The Tide Rises', 'From Ash, Fire', 'Steadfast',
  'None Shall Pass', 'Light in Darkness', 'We Endure', 'Strength Through Unity', 'Fortune Favours the Bold', 'Our Word Is Iron', 'The Crown Remembers',
  'Root and Branch', 'First to Ride', 'Glory to the Faithful', 'Patience Wins', 'Through Storm', 'Ours Is the Harvest', 'Silent and Sure',
  'The Stars Guide Us', 'Hold Fast', 'Blood Will Tell', 'Without Fear', 'Sword and Plough', 'Wisdom Before Wrath', 'The Old Ways', 'Watch and Wait',
];

/** A family name in the cultures that put it first. */
function family(c: (typeof CULTURES)[number], rnd: Rng): string {
  if (c.language) return c.language.familyName(rnd);
  return c.id === 'sinic' ? pick(rnd, SINIC_FAMILY) : c.id === 'koreanic' ? pick(rnd, KOREANIC_FAMILY) : pick(rnd, JAPONIC_A) + pick(rnd, JAPONIC_B);
}

/** A house name in the manner of a culture, from a root in its phonology. */
export function houseName(cul: string, culture: number, rnd: Rng, bank: NameBank, seatName: string): { name: string; short: string } {
  const c = CULTURES[culture] ?? CULTURES[0];
  const root = rnd() < 0.35 && seatName ? seatName : bank.proper(c, rnd);
  switch (cul) {
    case 'sinic': {
      const f = family(c, rnd);
      return { name: `the ${f} clan`, short: f };
    }
    case 'koreanic': {
      const f = family(c, rnd);
      return { name: `the ${f} clan of ${seatName || root}`, short: f };
    }
    case 'japonic': {
      const f = family(c, rnd);
      return { name: `the ${f} clan`, short: f };
    }
    case 'norse': {
      const f = rnd() < 0.5 ? `${root.replace(/[aeiou]$/, '')}ing` : root;
      return { name: rnd() < 0.5 ? `the ${f}s` : `House ${f}`, short: f };
    }
    case 'desert':
      return rnd() < 0.5 ? { name: `the Banu ${root}`, short: root } : { name: `the ${root}id dynasty`, short: `${root}id` };
    case 'slavic': {
      const f = `${root.replace(/[aeiouy]$/, '')}ovich`;
      return { name: `the ${f}i`, short: f };
    }
    case 'celtic':
      return rnd() < 0.5 ? { name: `Clann ${root}`, short: root } : { name: `the Ui ${root}`, short: root };
    case 'dwarven':
      return rnd() < 0.5 ? { name: `Clan ${root}`, short: root } : { name: `the Line of ${root}`, short: root };
    case 'steppe':
      return { name: `the ${root} clan`, short: root };
    case 'southern':
      return rnd() < 0.5 ? { name: `the ${root.replace(/[aeiou]s?$/, '')}id dynasty`, short: `${root.replace(/[aeiou]s?$/, '')}id` } : { name: `House ${root}`, short: root };
    case 'latin':
      return rnd() < 0.5 ? { name: `House of ${root}`, short: root } : { name: `the ${root.replace(/[aeiou]$/, '')}i family`, short: `${root.replace(/[aeiou]$/, '')}i` };
    case 'elvish':
      return { name: `House ${root}`, short: root };
    case 'jungle':
    case 'highland':
      return { name: `the ${root} lineage`, short: root };
    case 'woodland': {
      const totem = pick(rnd, ['Bear', 'Wolf', 'Turtle', 'Hawk', 'Deer', 'Heron', 'Beaver', 'Snipe', 'Eel', 'Crane', 'Otter', 'Eagle']);
      return { name: `the ${totem} Clan`, short: totem };
    }
    default:
      return { name: `House ${root}`, short: root };
  }
}

export const houseMotto = (rnd: Rng) => pick(rnd, MOTTO);

/** Epithets: [general, by culture]. Some follow a ruler's traits. */
const EPITHET_ANY = [
  'the Bold', 'the Wise', 'the Just', 'the Pious', 'the Cruel', 'the Great', 'the Fat', 'the Tall', 'the Young', 'the Old', 'the Lame', 'the Fair', 'the Good',
  'the Unready', 'the Peaceful', 'the Conqueror', 'the Builder', 'the Lawgiver', 'the Mad', 'the Black', 'the Red', 'the Lion', 'the Fox', 'the Quarrelsome',
  'the Generous', 'the Stern', 'the Learned', 'the Saint', 'the Restorer', 'the Unlucky', 'the Victorious', 'the Silent', 'the Magnificent', 'the Wanderer',
  'the Avenger', 'the Usurper', 'the Elder', 'the Hunter', 'the Merciful', 'the Terrible', 'the Debonair', 'the Steadfast',
];
const EPITHET_CUL: Record<string, string[]> = {
  norse: ['Bloodaxe', 'Ironside', 'Fairhair', 'Forkbeard', 'Snake-in-the-Eye', 'the Boneless', 'Bluetooth', 'Longship', 'Wolf-Coat', 'Skull-Splitter'],
  celtic: ['of the Hundred Battles', 'Red Hand', 'the Raven', 'Long-Arm', 'of the Nine Hostages', 'the Bard'],
  desert: ['the Magnificent', 'the Lion of the Faith', 'the Thunderbolt', 'the Lawgiver', 'the Victorious', 'the Golden'],
  steppe: ['the Scourge', 'the Lame', 'Iron Khan', 'the Black Wind', 'Storm of the Steppe'],
  slavic: ['the Terrible', 'the Wise', 'Long-Arm', 'Big Nest', 'the Bold', 'the Brave'],
  dwarven: ['Ironfist', 'Stonehelm', 'Deepdelver', 'Anvilbrow', 'Firebeard', 'Hammerhand', 'Goldgrip'],
  elvish: ['the Starlit', 'Silverbough', 'the Eternal', 'Dawnbringer', 'the Fair', 'Moonsinger'],
  anglo: ['the Confessor', 'Lionheart', 'Longshanks', 'Ironside', 'Beauclerc', 'Lackland', 'Crookback'],
  latin: ['the Magnificent', 'the Elder', 'the Younger', 'Barbarossa', 'Africanus', 'the Gouty', 'the Unconquered'],
  southern: ['the Peaceful', 'Porphyrogennetos', 'the Philosopher', 'the Hoplite', 'the Stoic', 'the Purple-Born'],
  sinic: ['the Martial', 'the Civil', 'the Radiant', 'the Benevolent', 'the Resplendent', 'the Founder'],
  japonic: ['the Tiger of the Hills', 'the One-Eyed Dragon', 'the Demon', 'the Peacemaker', 'the Fox'],
  koreanic: ['the Great', 'the Wise', 'the Builder', 'the Founder', 'the Righteous'],
  woodland: [], highland: ['Earth-Shaker', 'the Reformer', 'Son of the Sun'],
  jungle: ['the Smoking Shield', 'Jaguar Paw', 'Flint Sky', 'the Obsidian Serpent'],
};
const TRAIT_EPITHET: Record<string, string[]> = {
  Brave: ['the Bold', 'the Lion', 'the Brave'], Cruel: ['the Cruel', 'the Terrible', 'the Black'], Pious: ['the Pious', 'the Saint', 'the Confessor'],
  Just: ['the Just', 'the Lawgiver', 'the Good'], Scholarly: ['the Learned', 'the Wise', 'the Philosopher'], Generous: ['the Generous', 'the Magnificent'],
  Mad: ['the Mad', 'the Strange'], Ambitious: ['the Conqueror', 'the Great'], Craven: ['the Unready', 'the Timid'], Cunning: ['the Fox', 'the Spider'],
};

export function epithet(cul: string, rnd: Rng, traits: string[]): string | undefined {
  if (cul === 'woodland') return undefined;
  if (rnd() > 0.55) return undefined;
  for (const t of traits) if (TRAIT_EPITHET[t] && rnd() < 0.6) return pick(rnd, TRAIT_EPITHET[t]);
  const own = EPITHET_CUL[cul] ?? [];
  return own.length && rnd() < 0.35 ? pick(rnd, own) : pick(rnd, EPITHET_ANY);
}

/** just straight up rip from CK3, maybe I should modify a bit! */
export const TRAITS = [
  'Brave', 'Craven', 'Just', 'Cruel', 'Pious', 'Cynical', 'Ambitious', 'Content', 'Generous', 'Greedy', 'Scholarly', 'Unlettered', 'Cunning', 'Honest',
  'Wrathful', 'Patient', 'Diligent', 'Slothful', 'Paranoid', 'Trusting', 'Charming', 'Shy', 'Sickly', 'Robust', 'Mad', 'Melancholy', 'Gregarious', 'Zealous',
];
const OPPOSED: Record<string, string> = {
  Brave: 'Craven', Craven: 'Brave', Just: 'Cruel', Cruel: 'Just', Pious: 'Cynical', Cynical: 'Pious', Ambitious: 'Content', Content: 'Ambitious',
  Generous: 'Greedy', Greedy: 'Generous', Scholarly: 'Unlettered', Unlettered: 'Scholarly', Cunning: 'Honest', Honest: 'Cunning', Wrathful: 'Patient',
  Patient: 'Wrathful', Diligent: 'Slothful', Slothful: 'Diligent', Paranoid: 'Trusting', Trusting: 'Paranoid', Charming: 'Shy', Shy: 'Charming',
  Sickly: 'Robust', Robust: 'Sickly', Melancholy: 'Gregarious', Gregarious: 'Melancholy',
};

/** Two or three traits that do not contradict each other. */
export function traits(rnd: Rng): string[] {
  const out: string[] = [];
  const n = 2 + (rnd() < 0.5 ? 1 : 0);
  for (let t = 0; t < 12 && out.length < n; t++) {
    const x = pick(rnd, TRAITS);
    if (x === 'Mad' && rnd() < 0.8) continue;
    if (out.includes(x) || out.includes(OPPOSED[x])) continue;
    out.push(x);
  }
  return out;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
export const roman = (n: number) => ROMAN[n] ?? String(n);

/** Court offices by culture: [chancellor, marshal, steward, spymaster, priest]. */
export const COURT: Record<string, string[]> = {
  anglo: ['Chancellor', 'Lord Marshal', 'Lord Steward', 'Master of Whispers', 'Archbishop'],
  latin: ['Chancellor', 'Constable', 'Chamberlain', 'Master of Secrets', 'Cardinal'],
  norse: ['Lawspeaker', 'Marshal', 'Steward', 'Skald', 'Godi'], 
  celtic: ['Brehon', 'Champion', 'Steward', 'Ollam', 'Archdruid'],
  elvish: ['High Counsellor', 'Warden of the Bows', 'Keeper of the Halls', 'Master of Shadows', 'Star-reader'],
  desert: ['Grand Vizier', 'Pasha of the Army', 'Defterdar', 'Master of Eyes', 'Grand Mufti'],
  slavic: ['Chancellor', 'Voivode of the Host', 'Treasurer', 'Master of Secrets', 'Metropolitan'],
  dwarven: ['Loremaster', 'Marshal of the Halls', 'Hoardwarden', 'Tunnelwatcher', 'Forgepriest'],
  southern: ['Logothete', 'Domestic of the Schools', 'Sakellarios', 'Master of Offices', 'Patriarch'],
  steppe: ['Chief Scribe', 'Noyan', 'Treasurer', 'Master', 'Shaman'],
  jungle: ['Speaker', 'Jaguar Captain', 'Tribute Master', 'Night Watcher', 'High Priest'],
  sinic: ['Chancellor', 'Grand Marshal', 'Minister of Revenue', 'Eunuch of the Eastern Depot', 'Grand Astrologer'],
  japonic: ['Regent', 'Constable', 'Commissioner of Finance', 'Master of the Night', 'Abbot of the Great Temple'],
  koreanic: ['Chief State Councillor', 'Commander of the Army', 'Minister of Taxation', 'Royal Inspector', 'Royal Shaman'],
  woodland: ['Speaker', 'War Chief', 'Keeper of the Stores', 'Scout', 'Medicine Keeper'],
  highland: ['Council Elder', 'Apu of the Armies', 'Keeper of the Quipu', 'Runner Chief', 'High Priest'],
};
