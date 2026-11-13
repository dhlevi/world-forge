/**
 * Work with things that both the inventory and a camp's night call on (actors/checks.ts):
 * using up a portion, eating raw food, cooking at a fire (Cooking), and mending (the thing's
 * `mend` skill with its kit).
 */
import type { Actor } from '../actors/actor';
import { check, DC, type Grade } from '../actors/checks';
import type { Moodlet } from '../actors/components';
import { SKILL } from '../actors/data/skills';
import { ITEM } from '../actors/items/defs';
import type { Inventory } from '../actors/items/inventory';
import { defOf, itemName, type Item } from '../actors/items/item';
import { Needs } from '../actors/needs';

/** What eating it raw does: half the good of it, and an unpleasant moodlet. */
export const RAW_FACTOR = 0.5;

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
  const took = n.eat(food.kcal * (food.raw ? RAW_FACTOR : 1), food.water ?? 0);
  if (took < 20) return { text: 'You are too full to eat.', seconds: 0, ok: false };
  usePortion(inv, it);
  const meat = it.def === 'rabbit';
  return {
    text: food.raw ? `You ${food.verb}, raw.` : `You ${food.verb}.`,
    mood: food.raw ? { id: 'ate-raw', text: meat ? 'Ate raw meat' : 'Ate it raw', value: meat ? -3 : -1 } : undefined,
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
  const g = check(a, 'cooking', { difficulty: food.raw ? DC.easy + 5 : DC.easy, now }).grade;
  const c = COOKED[g];
  a.need(Needs).eat(food.kcal * c.factor, food.water ?? 0);
  const name = `the ${itemName({ ...it, qty: 1 })}`;
  usePortion(inv, it);
  return { text: c.text.replace('$', name), mood: c.mood ? { ...c.mood } : undefined, seconds: 40 * 60, ok: g !== 'fumble' };
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
