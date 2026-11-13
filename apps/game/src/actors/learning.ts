/**
 * Learning beyond practice (docs/design/characters.md, Skills): teachers in towns and books.
 * Both speed learning, but only up to a point; past it, only practice teaches.
 *
 * - **Teachers** are found at the places whose work it is (a smithy teaches smithing, a guild
 *   of warriors the arms, a temple medicine and persuasion). A teacher's own level comes from the
 *   size of the town; lessons go no further than 10 below it, and never past 50 (journeyman):
 *   mastery is learnt by doing. A teacher can start a skill that must be taught (lockpicking,
 *   spellcraft). An hour's lesson teaches about three uses' worth, and counts against the day.
 * - **Books** that teach say what and how far (`teaches` in the item data). Reading one needs
 *   letters in some script, and an hour teaches about two uses' worth.
 *
 * Proposed numbers, to tune in play.
 */
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import type { Actor } from './actor';
import { Skills } from './components';
import { SKILL } from './data/skills';

/** The most a teacher can take anyone, and how far below their own level they can. */
export const LESSON_MAX = 50, LESSON_BELOW = 10;
/** Learning from an hour's lesson and an hour's reading (a use of fair difficulty is about 0.5). */
const LESSON_XP = 1.5, BOOK_XP = 1;

export interface LearnResult {
  gained: number;
  /** Why nothing could be learnt, if so. */
  why?: string;
}

/** A teacher's level at a skill, from the size of the place (the same for the same place and skill). */
export function teacherLevel(tier: string, placeId: string, skill: string): number {
  const r = mulberry32(hashString(`${placeId}|teach|${skill}`));
  const [lo, hi] = tier === 'city' ? [52, 72] : tier === 'town' ? [42, 58] : [30, 42];
  return Math.round(lo + (hi - lo) * r());
}

/** How far a teacher of a level can take a pupil. */
export const lessonLimit = (teacher: number) => Math.min(LESSON_MAX, teacher - LESSON_BELOW);

/** One hour's lesson. */
export function lesson(a: Actor, skill: string, teacher: number, now: number): LearnResult {
  const s = a.need(Skills);
  const limit = Math.min(lessonLimit(teacher), s.cap(skill));
  if (s.level(skill) >= limit - 0.05) return { gained: 0, why: s.level(skill) >= s.cap(skill) - 0.05 ? 'You have gone as far as you can at it.' : 'They have nothing more to teach you; the rest comes with practice.' };
  return { gained: s.practise(skill, LESSON_XP, now, limit) };
}

export interface Teaches {
  skill: string;
  upTo: number;
}

/** One hour with a book that teaches. */
export function readBook(a: Actor, t: Teaches, now: number): LearnResult {
  const s = a.need(Skills);
  if (!s.literate()) return { gained: 0, why: 'You cannot read.' };
  if (!SKILL.has(t.skill)) return { gained: 0, why: 'It teaches nothing you could use.' };
  const limit = Math.min(t.upTo, s.cap(t.skill));
  if (s.level(t.skill) >= limit - 0.05) return { gained: 0, why: 'It has nothing more to teach you.' };
  return { gained: s.practise(t.skill, BOOK_XP, now, limit) };
}

/** What each kind of place teaches, by its role (or kind). */
const TEACHING: Record<string, string[]> = {
  smithy: ['smithing', 'weaponsmith', 'armorsmith'], foundry: ['smithing', 'mining'], tailor: ['tailoring'], apothecary: ['herbalism', 'alchemy'],
  butcher: ['cooking', 'hideworking'], bakery: ['cooking'], stables: ['riding', 'animals'], witch: ['herbalism', 'alchemy'], winepress: ['agriculture'],
  temple: ['medicine', 'persuasion', 'leadership'], shrine: ['medicine'], keep: ['longblades', 'shield', 'riding', 'leadership'],
  library: ['cartography', 'stewardship'], university: ['medicine', 'cartography', 'stewardship', 'alchemy'], college: ['stewardship', 'cartography'],
  countinghouse: ['stewardship', 'trading'], magetower: ['spell.abjuration', 'spell.divination', 'spell.evocation', 'spell.transmutation'],
  inn: ['storytelling', 'music'], tavern: ['music', 'dance', 'storytelling'], dock: ['sailing', 'swimming', 'fishing'], market: ['trading'],
  'guild:adventurers': ['climbing', 'survival', 'athletics', 'tracking'], 'guild:warriors': ['longblades', 'shortblades', 'shield', 'polearms', 'unarmed', 'dodge'],
  'guild:cartographers': ['cartography'], 'guild:alchemists': ['alchemy', 'herbalism'], 'guild:mages': ['spell.abjuration', 'spell.conjuration', 'spell.divination', 'spell.evocation', 'spell.illusion', 'spell.transmutation', 'spell.enchantment'],
  'guild:masons': ['masonry', 'carpentry'], 'guild:smiths': ['smithing', 'weaponsmith', 'armorsmith', 'jewelsmith'], 'guild:weavers': ['tailoring', 'hideworking'],
  'guild:physicians': ['medicine', 'herbalism'], 'guild:vintners': ['agriculture', 'trading'], 'order:hunters': ['archery', 'tracking', 'trapping', 'survival'],
  'order:knights': ['riding', 'longblades', 'shield', 'leadership'], 'order:mercenaries': ['polearms', 'shield', 'crossbow', 'athletics'],
};

/** The skills taught at a place (none where nobody teaches). */
export function taughtAt(kind: string, role?: string): string[] {
  const list = (role && TEACHING[role]) || TEACHING[kind] || (role?.startsWith('guild:') || role?.startsWith('order:') ? ['leadership', 'persuasion'] : []);
  return list.filter((id) => SKILL.has(id));
}

/** Copper for an hour's lesson from a teacher of a level. */
export const lessonPrice = (teacher: number, trained: boolean) => Math.round((3 + teacher / 6) * (trained ? 2 : 1));
