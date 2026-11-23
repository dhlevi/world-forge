/**
 * Dirty and stained clothes (docs/backlog.md, C4; characters.md, Keeping clean). What is worn takes
 * the dirt and blood the wanderer takes (actors/needs.ts): the outer layers most, what is worn
 * beneath least. Dirt washes out; fresh blood washes out too if washed soon, but as the hours pass
 * it sets into a stain that stays for good. Washing clothes takes water (with soap, all the dirt
 * and fresh blood; without, most of it, and what blood is left sets). Dirty clothes sell for less,
 * and stained ones less for good (actors/items/item.ts, `itemValue`); dirty, bloodied or stained
 * clothes put people off (actors/checks.ts).
 *
 * Proposed numbers, to tune in play.
 */
import { defOf, type Item } from './item';
import type { Inventory } from './inventory';
import type { Layer } from './defs';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Dirt a garment can have and still need no wash. */
const CLEAN_ENOUGH = 12;

/** How much of what gets on the wearer each layer takes. */
const SHARE: Record<Layer, number> = { cloak: 1, outer: 1, armour: 0.9, main: 0.8, padding: 0.4, under: 0.3 };

/** Clothing that takes dirt (worn things that are not jewellery). */
export function isGarment(it: Item): boolean {
  const w = defOf(it).wear;
  return !!w && !w.jewel && !!w.layer;
}

const worn = (inv: Inventory) => inv.worn().filter(isGarment);

/** Dirt and blood get on what is worn (`dirt`, `blood`: what got on the wearer). */
export function soilWorn(inv: Inventory, dirt: number, blood: number): void {
  if (dirt <= 0 && blood <= 0) return;
  for (const it of worn(inv)) {
    const k = SHARE[defOf(it).wear!.layer!] ?? 0.5;
    if (dirt > 0) it.dirt = clamp((it.dirt ?? 0) + dirt * 1.2 * k, 0, 100);
    if (blood > 0) it.blood = clamp((it.blood ?? 0) + blood * k, 0, 100);
  }
}

/**
 * The hours pass for what is worn: a swim rinses out much of the dirt and the fresh blood, rain a
 * little of the blood (`rinse`: mm of rain that reached it), and blood left sets into stains.
 */
export function ageClothes(inv: Inventory, hours: number, o: { swim?: boolean; rinse?: number } = {}): void {
  for (const it of worn(inv)) {
    if (o.swim) {
      it.dirt = Math.min(it.dirt ?? 0, Math.max(30, (it.dirt ?? 0) - 200 * hours));
      it.blood = Math.max(0, (it.blood ?? 0) - 300 * hours);
    }
    if (o.rinse) it.blood = Math.max(0, (it.blood ?? 0) - o.rinse * 4);
    const b = it.blood ?? 0;
    if (b > 0) {
      const sets = b * Math.min(1, 0.05 * hours);
      it.blood = b - sets;
      it.stain = clamp((it.stain ?? 0) + sets * 0.6, 0, 100);
    }
    tidy(it);
  }
}

/** Washes a garment: with soap, the dirt and fresh blood all out; without, most, and what blood is left sets. Returns whether there was anything to wash out. */
export function washGarment(it: Item, soap: boolean): boolean {
  const was = (it.dirt ?? 0) > CLEAN_ENOUGH || (it.blood ?? 0) > 1;
  it.dirt = soap ? 0 : (it.dirt ?? 0) * 0.15;
  const left = soap ? 0 : (it.blood ?? 0) * 0.2;
  it.stain = clamp((it.stain ?? 0) + left * 0.6, 0, 100);
  it.blood = 0;
  tidy(it);
  return was;
}

/** Drops the marks too small to matter, so clean things carry none. */
function tidy(it: Item): void {
  for (const k of ['dirt', 'blood', 'stain'] as const) {
    const v = it[k];
    if (v === undefined) continue;
    if (v < 0.01) delete it[k];
  }
}

/** A garment's state in words ("dirty, bloodstained"), or ''. */
export function soilWords(it: Item): string {
  const out: string[] = [];
  const d = it.dirt ?? 0, b = it.blood ?? 0, s = it.stain ?? 0;
  if (d >= 60) out.push('filthy');
  else if (d >= 25) out.push('dirty');
  if (b >= 10) out.push('bloodied');
  if (s >= 40) out.push('badly stained');
  else if (s >= 10) out.push('stained');
  return out.join(', ');
}

/** How the clothes worn look, for what people make of them (the worst of the outer garments): '' clean enough. */
export function clothesLook(inv: Inventory): '' | 'dirty' | 'filthy' | 'bloodied' | 'stained' {
  const outer = worn(inv).filter((i) => (SHARE[defOf(i).wear!.layer!] ?? 0) >= 0.8);
  if (!outer.length) return '';
  const most = (k: 'dirt' | 'blood' | 'stain') => Math.max(...outer.map((i) => i[k] ?? 0));
  if (most('blood') >= 20) return 'bloodied';
  if (most('dirt') >= 60) return 'filthy';
  if (most('stain') >= 30) return 'stained';
  if (most('dirt') >= 30) return 'dirty';
  return '';
}

/** Garments carried or worn that a wash would help. */
export function soiled(inv: Inventory): Item[] {
  return inv.d.items.filter((i) => isGarment(i) && ((i.dirt ?? 0) > CLEAN_ENOUGH || (i.blood ?? 0) > 1));
}
