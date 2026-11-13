/**
 * Skill checks (docs/design/characters.md, Skills): a graded d100 roll from the person's own dice
 * (saved, so a game replays the same) against the chance their skill gives them at a task.
 *
 * - **The score** is the skill as it stands now (less rust), plus a little for the traits that
 *   govern it, plus modifiers (tools, quality, load, the state of the body), each with its reason.
 * - **The chance** is 50% when the score meets the difficulty, 1.5 points per point between them,
 *   kept between 2% and 98% (nothing is certain). A skill that must be taught (`trained`) cannot
 *   be tried at all untaught.
 * - **The grade** comes from the roll against the chance: a fine success (the best fifth of the
 *   successes), a success, a narrow failure (within 10 of the chance), a failure, or a fumble (the
 *   worst rolls).
 * - **Learning:** every check teaches a little (unless told not to). Harder tasks teach more,
 *   whether they succeed or narrowly fail; easy ones almost nothing; a fumble little. The pace,
 *   the daily limit and rust are the Skills component's (actors/components.ts).
 *
 * Proposed numbers, to tune in play.
 */
import type { Actor } from './actor';
import { Mood, Skills, Traits } from './components';
import { SKILL } from './data/skills';
import { Needs } from './needs';

/** Difficulties, as the skill level that gives an even chance. */
export const DC = { trivial: 0, easy: 20, routine: 35, hard: 50, veryHard: 65, heroic: 80 } as const;

export type Grade = 'fumble' | 'fail' | 'near' | 'success' | 'fine';
export const GRADES: Grade[] = ['fumble', 'fail', 'near', 'success', 'fine'];

export interface Mod {
  why: string;
  value: number;
}

export interface CheckOpts {
  /** The level that gives an even chance (see DC). */
  difficulty: number;
  /** Modifiers to the score, with their reasons. */
  mods?: Mod[];
  /** How much it teaches, as a share of a normal use (default 1; 0 for none). */
  learn?: number;
  /** Game time now (for learning today, and rust). */
  now: number;
  /** Leave out the body's state (hunger, cold, tiredness) from the modifiers. */
  noBody?: boolean;
}

export interface CheckResult {
  skill: string;
  grade: Grade;
  /** Succeeded (a success or a fine success). */
  ok: boolean;
  /** The chance of success (%), the roll (1 to 100) and the score that gave the chance. */
  chance: number;
  roll: number;
  score: number;
  mods: Mod[];
  /** Levels learnt from it. */
  gained: number;
}

/** Learning from one use of fair difficulty (before the pace, the day and the cap). */
export const BASE_LEARN = 0.35;
const GRADE_LEARN: Record<Grade, number> = { fumble: 0.3, fail: 0.5, near: 1.1, success: 1, fine: 1.2 };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** The chance of success (%) for a score against a difficulty. */
export function chanceOf(score: number, difficulty: number): number {
  return clamp(Math.round(50 + 1.5 * (score - difficulty)), 2, 98);
}

/** The grade a roll makes against a chance. */
export function gradeOf(roll: number, chance: number): Grade {
  if (roll <= chance) return roll <= Math.max(1, Math.round(chance * 0.2)) ? 'fine' : 'success';
  if (roll >= Math.max(96, chance + 1 + Math.round((100 - chance) * 0.75))) return 'fumble';
  return roll <= chance + 10 ? 'near' : 'fail';
}

/**
 * How much a task teaches for its difficulty against the level: about 1.3 at a fair challenge,
 * nearly 2 well above it, falling away to almost nothing for what is long since easy.
 */
export function teachFactor(level: number, difficulty: number): number {
  return 2 / (1 + Math.exp(-(difficulty - level + 5) / 7));
}

/** The body's state as modifiers: tiredness, hunger and thirst, cold and heat, and mood. */
export function bodyMods(a: Actor, skill: string): Mod[] {
  const out: Mod[] = [];
  const n = a.get(Needs);
  const physical = ['Physical', 'Crafting', 'Combat'].includes(SKILL.get(skill)?.group ?? '');
  if (n) {
    const w = n.words();
    const tired: Record<string, number> = { Tired: -3, 'Very tired': -7, Exhausted: -15, Collapsing: -25 };
    const hunger: Record<string, number> = { Ravenous: -3, Underfed: -3, Malnourished: -8, Starving: -15 };
    const thirst: Record<string, number> = { Parched: -3, Dehydrated: -8, 'Badly dehydrated': -15 };
    const heat: Record<string, number> = { Shivering: -8, Hypothermic: -20, Hot: -2, Overheating: -12 };
    const stamina: Record<string, number> = { Winded: -5, Weary: -4, Spent: -12 };
    if (tired[w.sleep]) out.push({ why: w.sleep.toLowerCase(), value: tired[w.sleep] });
    if (hunger[w.hunger]) out.push({ why: w.hunger.toLowerCase(), value: hunger[w.hunger] });
    if (thirst[w.thirst]) out.push({ why: w.thirst.toLowerCase(), value: thirst[w.thirst] });
    if (heat[w.heat]) out.push({ why: w.heat.toLowerCase(), value: physical ? heat[w.heat] : Math.round(heat[w.heat] / 2) });
    if (physical && stamina[w.stamina]) out.push({ why: w.stamina.toLowerCase(), value: stamina[w.stamina] });
  }
  const mood = a.get(Mood)?.value ?? 0;
  if (Math.abs(mood) >= 6) out.push({ why: mood > 0 ? 'in good heart' : 'low in spirit', value: clamp(Math.round(mood / 4), -5, 3) });
  return out;
}

/** What the governing traits add (or take away): 1.5 per point from 10. */
export function traitBonus(a: Actor, skill: string): number {
  const def = SKILL.get(skill);
  const t = a.get(Traits);
  return def && t ? Math.round((t.mean(def.traits) - 10) * 1.5) : 0;
}

/** The chance a person has at a task now, without rolling (for menus and the sheet). */
export function chanceFor(a: Actor, skill: string, o: Omit<CheckOpts, 'now' | 'learn'>): { chance: number; score: number; mods: Mod[] } {
  const s = a.get(Skills);
  const def = SKILL.get(skill);
  const mods = [...(o.mods ?? []), ...(o.noBody ? [] : bodyMods(a, skill))].filter((m) => m.value);
  const level = s?.effective(skill) ?? 0;
  if (def?.trained && level <= 0) return { chance: 0, score: 0, mods };
  const score = level + traitBonus(a, skill) + mods.reduce((t, m) => t + m.value, 0);
  return { chance: chanceOf(score, o.difficulty), score, mods };
}

/** Rolls a check, and learns from it. */
export function check(a: Actor, skill: string, o: CheckOpts): CheckResult {
  const s = a.need(Skills);
  const { chance, score, mods } = chanceFor(a, skill, o);
  const roll = s.d100();
  const grade: Grade = chance <= 0 ? 'fail' : gradeOf(roll, chance);
  const ok = grade === 'success' || grade === 'fine';
  let gained = 0;
  const learn = o.learn ?? 1;
  if (learn > 0 && chance > 0) {
    const raw = BASE_LEARN * learn * teachFactor(s.level(skill), o.difficulty) * GRADE_LEARN[grade];
    gained = s.practise(skill, raw, o.now);
  }
  return { skill, grade, ok, chance, roll, score, mods, gained };
}

/** Picks by grade (a table of outcomes). */
export function byGrade<T>(g: Grade, t: Record<Grade, T>): T {
  return t[g];
}
