/**
 * Work with things that both the inventory and a camp's night call on (actors/checks.ts):
 * using up a portion, eating raw food, cooking at a fire (Cooking), and mending (the thing's
 * `mend` skill with its kit).
 */
import type { Actor } from '../actors/actor';
import { check, DC, type Grade } from '../actors/checks';
import type { Moodlet } from '../actors/components/index';
import { SKILL } from '../actors/data/skills';
import { ITEM } from '../actors/items/defs';
import type { Inventory } from '../actors/items/inventory';
import { defOf, itemName, type Item } from '../actors/items/item';
import { Needs } from '../actors/needs';
import { Skills, Traits } from '../actors/components/index';
import { spoilStage, type SpoilStage } from '../actors/items/spoil';

/** What eating it raw does: half the good of it, and an unpleasant moodlet. */
export const RAW_FACTOR = 0.5;

/** How much of its good food keeps by its stage (actors/items/spoil.ts). */
const STAGE_FACTOR: Record<SpoilStage, number> = { fresh: 1, stale: 0.85, spoiling: 0.7, rotten: 0.4 };
/** Rotten food the wanderer has been warned of (by uid): eaten if they choose it again. */
const warned = new Set<string>();

/**
 * Food past its best (from play, 27 November 2026): a chance of a sick stomach from spoiling food
 * (more from raw meat and fish), a likely one from rotten; cooking halves it, and a strong
 * constitution resists. Sick, the wanderer brings up what they ate, loses water, tires, and feels
 * wretched for half a day.
 */
function spoilt(a: Actor, it: Item, cooked: boolean): { stage: SpoilStage; sick: boolean; text: string; mood?: Moodlet } {
  const stage = spoilStage(it.def, it.aged);
  if (stage === 'fresh' || stage === 'stale') return { stage, sick: false, text: stage === 'stale' ? ' It is stale.' : '' };
  const flesh = /meat|rabbit|fish|gutted_|carcass/.test(it.def) && defOf(it).food?.raw;
  const con = a.get(Traits)?.get('constitution') ?? 10;
  const p = Math.max(0.05, ((stage === 'rotten' ? 0.8 : flesh ? 0.45 : 0.3) * (cooked ? 0.5 : 1)) - (con - 10) * 0.02);
  const roll = a.get(Skills)?.random() ?? Math.random();
  if (roll >= p) return { stage, sick: false, text: stage === 'rotten' ? ' It tastes foul, but stays down.' : ' It tastes off, but stays down.' };
  const n = a.need(Needs);
  const severe = stage === 'rotten';
  n.d.stomachKcal = 0;
  n.d.stomachL = Math.max(0, n.d.stomachL * 0.3);
  n.d.hydrated = Math.max(0, n.d.hydrated - (severe ? 20 : 10));
  n.d.fatigue = Math.min(140, n.d.fatigue + (severe ? 20 : 10));
  return {
    stage, sick: true,
    text: severe ? ' Before long your stomach heaves, and you are wretchedly sick.' : ' Before long your stomach turns, and you bring it up again.',
    mood: { id: 'food-sick', text: severe ? 'Sick from rotten food' : 'Sick from bad food', value: severe ? -8 : -5 },
  };
}

/** Why rotten food is not eaten yet (a warning, the first time it is chosen), or null to go on. */
function rottenWarning(it: Item): string | null {
  if (spoilStage(it.def, it.aged) !== 'rotten' || warned.has(it.uid)) return null;
  warned.add(it.uid);
  if (warned.size > 200) warned.delete(warned.values().next().value!);
  return `The ${itemName({ ...it, qty: 1 })} stinks; eating it would likely make you sick. Choose it again to eat it all the same.`;
}

/** A portion or use gone: the last of the last one takes the thing with it. */
export function usePortion(inv: Inventory, it: Item): void {
  const d = defOf(it);
  if (d.uses) {
    it.uses = (it.uses ?? d.uses) - 1;
    if (it.uses <= 0) {
      if (it.qty > 1) {
        it.qty -= 1;
        it.uses = d.uses;
      } else inv.drop(it.uid);
    }
  } else if (it.qty > 1) it.qty -= 1;
  else inv.drop(it.uid);
}

export interface Outcome {
  text: string;
  mood?: Moodlet;
  /** Seconds it took. */
  seconds: number;
  ok: boolean;
}

/** Eats a portion of a food uncooked (bread, or something better cooked). */
export function eatPortion(a: Actor, inv: Inventory, it: Item): Outcome {
  const food = defOf(it).food!;
  const n = a.need(Needs);
  const warn = rottenWarning(it);
  if (warn) return { text: warn, seconds: 0, ok: false };
  const stage = spoilStage(it.def, it.aged);
  const kcal = food.kcal * (food.raw ? RAW_FACTOR : 1) * STAGE_FACTOR[stage];
  if (n.room().kcal < Math.min(50, kcal)) return { text: 'You are too full to eat; give your stomach time to settle.', seconds: 0, ok: false };
  n.eat(kcal, food.water ?? 0);
  const bad = spoilt(a, it, false);
  usePortion(inv, it);
  const meat = it.def === 'rabbit';
  return {
    text: `${food.raw ? `You ${food.verb}, raw.` : `You ${food.verb}.`}${bad.text}`,
    mood: bad.mood ?? (food.raw ? { id: 'ate-raw', text: meat ? 'Ate raw meat' : 'Ate it raw', value: meat ? -3 : -1 } : undefined),
    seconds: 5 * 60,
    ok: true,
  };
}

const COOKED: Record<Grade, { factor: number; text: string; mood?: Moodlet }> = {
  fine: { factor: 1.3, text: 'You cook a fine hot meal of $ and eat it.', mood: { id: 'cooked', text: 'A fine hot meal', value: 3 } },
  success: { factor: 1.15, text: 'You cook $ and eat it hot.', mood: { id: 'cooked', text: 'A hot meal', value: 2 } },
  near: { factor: 1.05, text: 'You warm $ through and eat it.' },
  fail: { factor: 1, text: 'You make a poor job of cooking $, but eat it.' },
  fumble: { factor: 0.85, text: 'You burn $, and eat what you can of it.', mood: { id: 'cooked', text: 'Burnt supper', value: -1 } },
};

/** Cooks a portion at a fire and eats it (Cooking): raw food comes to its full worth and more. */
export function cookPortion(a: Actor, inv: Inventory, it: Item, now: number): Outcome {
  const food = defOf(it).food!;
  const warn = rottenWarning(it);
  if (warn) return { text: warn, seconds: 0, ok: false };
  const g = check(a, 'cooking', { difficulty: food.raw ? DC.easy + 5 : DC.easy, now }).grade;
  const c = COOKED[g];
  a.need(Needs).eat(food.kcal * c.factor * STAGE_FACTOR[spoilStage(it.def, it.aged)], food.water ?? 0);
  const name = `the ${itemName({ ...it, qty: 1 })}`;
  const bad = spoilt(a, it, true);
  usePortion(inv, it);
  return { text: `${c.text.replace('$', name)}${bad.text}`, mood: bad.mood ?? (c.mood ? { ...c.mood } : undefined), seconds: 40 * 60, ok: g !== 'fumble' };
}

/** Condition a mending gives back, by grade. */
const MENDED: Record<Grade, number> = { fine: 45, success: 30, near: 12, fail: 0, fumble: -8 };

/** What mending a thing needs that is missing (or null), and the kit to spend. `beside` says whether one of some things on the map is to hand. */
export function mendNeeds(inv: Inventory, it: Item, beside: (names: string[]) => boolean): { why: string | null; kit?: Item } {
  const d = defOf(it), m = d.mend;
  if (!m) return { why: 'It cannot be mended.' };
  if (d.durable === false) return { why: 'It does not wear.' };
  if (it.condition >= 95) return { why: 'It needs no mending.' };
  if (it.loc?.at === 'worn') return { why: 'Take it off first.' };
  if (m.at?.length && !beside(m.at)) return { why: `You need ${m.at.map((x) => `a ${x}`).join(' or ')} to work at.` };
  if (m.kit) {
    const kit = inv.d.items.find((x) => x.def === m.kit && (x.uses === undefined || x.uses > 0) && x.condition > 0);
    if (!kit) return { why: `You need ${ITEM.get(m.kit)?.name ? `a ${ITEM.get(m.kit)!.name}` : 'the tools'}.` };
    return { why: null, kit };
  }
  return { why: null };
}

/** Mends a worn thing (its mend skill): most of an hour, and a use of the kit. */
export function mendThing(a: Actor, inv: Inventory, it: Item, now: number, kit?: Item): Outcome {
  const m = defOf(it).mend!;
  const qual = { poor: -5, common: 0, fine: 10, masterwork: 25 }[it.quality];
  const res = check(a, m.skill, { difficulty: 15 + Math.round((100 - it.condition) * 0.3) + qual, now });
  const before = it.condition;
  it.condition = Math.max(0, Math.min(100, it.condition + MENDED[res.grade]));
  if (kit) {
    if (defOf(kit).uses) usePortion(inv, kit);
    else kit.condition = Math.max(0, kit.condition - 1);
  }
  const name = itemName(it);
  const skill = SKILL.get(m.skill)?.name.toLowerCase() ?? m.skill;
  const text = it.condition > before + 20 ? `You mend your ${name} well.` : it.condition > before ? `You patch up your ${name} as best you can.`
    : it.condition < before ? `You make your ${name} worse; ${skill} is harder than it looks.` : `Your work on the ${name} comes to nothing.`;
  return { text, seconds: 45 * 60, ok: it.condition > before };
}

/**
 * Blades for cutting brush, best first, and the seconds each takes to clear a bush (a machete is
 * made for it; an axe or a hatchet does well; a sword or a sickle less so; a knife slowly).
 */
export const BRUSH_TOOLS: [string, number][] = [['machete', 30], ['axe', 40], ['hatchet', 45], ['sickle', 50], ['sword', 60], ['dagger', 110], ['knife', 120]];

/** How clearing goes, by grade: a share of the time it takes, firewood got, and a cut to the hand. */
const CLEARED: Record<Grade, { time: number; wood: boolean; text: string; mood?: Moodlet }> = {
  fine: { time: 0.6, wood: true, text: 'With a few sure strokes of your $ you clear the $b, and gather the wood.' },
  success: { time: 0.8, wood: true, text: 'You hack through the $b with your $, and gather the wood.' },
  near: { time: 1, wood: false, text: 'You hack through the $b with your $.' },
  fail: { time: 1.4, wood: false, text: 'It is slow, tangled work, but you clear the $b with your $.' },
  fumble: { time: 1.6, wood: false, text: 'Your $ glances off a stem and nicks your hand; at last the $b is cleared.', mood: { id: 'cut-hand', text: 'Nicked my hand clearing brush', value: -2 } },
};

/**
 * Cuts away a bush or scrub (Survival, with the best blade carried): how long it took, and what
 * came of it. Null if there is no blade to cut with.
 */
export function clearBrush(a: Actor, inv: Inventory, what: 'bush' | 'scrub', now: number): (Outcome & { tool: string; wood: boolean }) | null {
  const carried = new Set(inv.d.items.map((i) => i.def));
  const tool = BRUSH_TOOLS.find(([id]) => carried.has(id));
  if (!tool) return null;
  const g = check(a, 'survival', { difficulty: what === 'scrub' ? DC.easy : DC.easy + 5, now }).grade;
  const c = CLEARED[g];
  const base = tool[1] * (what === 'scrub' ? 0.5 : 1);
  return {
    text: c.text.replace('$b', what === 'scrub' ? 'scrub' : 'bush').replace('$', ITEM.get(tool[0])?.name ?? tool[0]),
    mood: c.mood ? { ...c.mood, until: now + 4 * 3600 } : undefined,
    seconds: Math.round(base * c.time),
    ok: true,
    tool: tool[0],
    wood: c.wood && what === 'bush',
  };
}
