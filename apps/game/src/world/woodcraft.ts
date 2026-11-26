/**
 * Woodcraft (docs/design/fieldcraft.md, stage 3; Survival): felling trees and cutting their wood,
 * for traps, fences, shelters and fires alike.
 *
 * - **Felling** (Survival, with an axe or a hatchet): any tree that stands on one tile, slower the
 *   taller it is and with a hatchet, leaves a stump and gives poles, sticks and firewood. The great
 *   old trees with trunks two tiles across are beyond felling.
 * - **Stakes** are cut from a pole (four) or a stout stick (one), with any blade.
 *
 * Proposed numbers, to tune in play.
 */
import { treeKind, treeShape } from '@worldforge/core/local/trees';
import type { Actor } from '../actors/actor';
import { check, DC, type Grade } from '../actors/checks';
import type { Inventory } from '../actors/items/inventory';
import { makeItem, type Item } from '../actors/items/item';
import { BRUSH_TOOLS } from '../rules/tasks';

/** The axes, best first, and how much longer each takes to fell. */
export const FELLING: [string, number][] = [['axe', 1], ['hatchet', 1.6]];
/** Stakes cut from a pole, and the minutes each pole takes; from a stout stick, one in five minutes. */
export const STAKES_PER_POLE = 4, POLE_MIN = 15, STICK_MIN = 5;

const carried = (inv: Inventory) => new Set(inv.d.items.map((i) => i.def));

/** The axe or hatchet carried, if any. */
export function fellingTool(inv: Inventory): [string, number] | null {
  const c = carried(inv);
  return FELLING.find(([id]) => c.has(id)) ?? null;
}

/** The best blade carried (to cut stakes or brush), if any. */
export function blade(inv: Inventory): string | null {
  const c = carried(inv);
  return BRUSH_TOOLS.find(([id]) => c.has(id))?.[0] ?? null;
}

/** How long a tree takes to fell (minutes) with a tool that takes `slow` times as long, or null if it cannot be felled. */
export function fellMinutes(objectName: string, x: number, y: number, slow: number): number | null {
  const k = treeKind(objectName);
  if (!k) return null;
  const sh = treeShape(k, x, y);
  return Math.round((8 + sh.heightM * 2.5) * (sh.ageWord === 'young' ? 0.5 : sh.ageWord === 'old' ? 1.4 : 1) * slow);
}

const FELLED: Record<Grade, { time: number; text: string; hurt?: boolean }> = {
  fine: { time: 0.8, text: 'It comes down cleanly where you meant it to fall.' },
  success: { time: 1, text: 'It comes down with a creak and a crash.' },
  near: { time: 1.2, text: 'It is hard going, but at last it comes down.' },
  fail: { time: 1.5, text: 'It twists as it falls and takes the work of an hour to trim.' },
  fumble: { time: 1.6, text: 'It kicks back off the stump as it falls and catches you a blow.', hurt: true },
};

/**
 * Fells a tree (Survival): the time it takes and what it gives. Young trees give a pole and sticks;
 * grown ones poles (more of the straight kinds) and firewood; old ones more firewood than poles.
 */
export function fell(a: Actor, objectName: string, x: number, y: number, slow: number, now: number): { items: Item[]; seconds: number; text: string; hurt: boolean; name: string } | null {
  const mins = fellMinutes(objectName, x, y, slow);
  const k = treeKind(objectName);
  if (mins === null || !k) return null;
  const sh = treeShape(k, x, y);
  const r = check(a, 'survival', { difficulty: DC.easy + (sh.ageWord === 'old' ? 10 : 0), now });
  const f = FELLED[r.grade];
  const straight = k.name === 'conifer' || k.name === 'birch';
  const poles = sh.ageWord === 'young' ? 1 : sh.ageWord === 'old' ? 1 : straight ? 3 : 2;
  const wood = sh.ageWord === 'young' ? 0 : Math.min(5, Math.round(sh.heightM / (sh.ageWord === 'old' ? 4 : 7)));
  const items: Item[] = [makeItem('pole', { qty: poles }), makeItem('stick', { qty: sh.ageWord === 'young' ? 2 : 3 })];
  if (wood) items.push(makeItem('firewood', { qty: wood }));
  const name = `${sh.ageWord === 'young' ? 'young ' : sh.ageWord === 'old' ? 'old ' : ''}${k.name === 'broadleaf' ? 'tree' : k.name}`;
  return { items, seconds: Math.round(mins * f.time * 60), text: f.text, hurt: !!f.hurt, name };
}
