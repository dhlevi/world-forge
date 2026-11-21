/**
 * Hunting without bows (docs/design/npcs.md, Animals: Hunting; Stage 2): snares set on the ground
 * for small game, and butchery. The spear and the blade are combat's (game/combat.ts; combat.md,
 * stage 2); shooting waits for stage 3.
 *
 * - **Snares.** A length of snare wire set on a tile (P). Small game (core local/fauna.ts,
 *   `snared`) that steps on it is caught; out of sight, each hour, a snare in the range of a group of
 *   small game catches one with a chance that grows with Survival. Walking onto a snare with a catch
 *   takes it (a carcass); P on a snare lifts it and gives the wire back.
 * - **Butchery.** A carcass and a blade give the beast's yields (core local/fauna.ts): fewer with a
 *   poor Survival check, more with a fine one.
 */
import { SPECIES, SPECIES_BY_ID, type Species } from '@worldforge/core/local/fauna';
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import type { Actor } from '../actors/actor';
import { check, DC, type Grade } from '../actors/checks';
import type { Inventory } from '../actors/items/inventory';
import { makeItem, type Item } from '../actors/items/item';
import { ITEM } from '../actors/items/defs';
import { Needs } from '../actors/needs';
import { BRUSH_TOOLS } from '../rules/tasks';
import { fightOf } from '../rules/beasts';
import type { Fauna, FaunaView } from './fauna';

export interface Snare {
  x: number;
  y: number;
  /** When it was set; when it was last tried (out of sight, by the hour). */
  set: number;
  tried: number;
  /** What it has caught (a species id), and when. */
  caught?: string;
  at?: number;
}

/** A snare's chance an hour (out of sight, in the range of small game), by Survival 0 to 100. */
const PER_HOUR = (survival: number) => 0.06 + survival / 900;

export class Snares {
  list: Snare[] = [];

  at(x: number, y: number): Snare | undefined {
    return this.list.find((s) => s.x === x && s.y === y);
  }

  set(x: number, y: number, t: number): Snare {
    const s: Snare = { x, y, set: t, tried: t };
    this.list.push(s);
    return s;
  }

  lift(x: number, y: number): Snare | undefined {
    const s = this.at(x, y);
    if (s) this.list = this.list.filter((o) => o !== s);
    return s;
  }

  /**
   * The snares catch: small game on a snare's tile is caught at once; out of sight, each hour, a
   * snare in the range of small game catches one by chance. Returns the snares that caught.
   */
  run(fauna: Fauna, g: FaunaView, survival: number): Snare[] {
    const out: Snare[] = [];
    for (const s of this.list) {
      if (s.caught) continue;
      const a = fauna.at(s.x, s.y);
      if (a && a.s.snared && a.alt === 0) {
        fauna.remove(a);
        s.caught = a.s.id;
        s.at = g.time;
        out.push(s);
        continue;
      }
      if (g.isVisible(s.x, s.y)) {
        s.tried = g.time;
        continue;
      }
      while (g.time - s.tried >= 3600 && !s.caught) {
        s.tried += 3600;
        const r = mulberry32(hashString(`snare#${s.x},${s.y}#${s.tried}`));
        for (const m of fauna.all()) {
          const h = m.g;
          if (!m.s.snared || Math.hypot(h.home.x - s.x, h.home.y - s.y) > h.home.r + 4) continue;
          if (r() < PER_HOUR(survival)) {
            fauna.remove(m);
            s.caught = m.s.id;
            s.at = s.tried;
            out.push(s);
          }
          break;
        }
      }
    }
    return out;
  }

  export(): Snare[] {
    return this.list.map((s) => ({ ...s }));
  }

  import(list: Snare[] | undefined): void {
    this.list = (list ?? []).filter((s) => s && typeof s.x === 'number' && typeof s.y === 'number' && typeof s.set === 'number').map((s) => ({ ...s, tried: typeof s.tried === 'number' ? s.tried : s.set }));
  }
}

/** A carcass of a species, to carry home or butcher: as heavy as the beast (a deer is no load to carry far). */
export function carcassOf(s: Species): Item {
  const it = makeItem('carcass', { name: `dead ${s.name}` });
  const kg = fightOf(s).kg;
  if (Math.abs(kg - 2.5) > 0.2) it.kg = Math.round(kg * 10) / 10;
  return it;
}

/** The species a carcass is of (by its name). */
export function speciesOfCarcass(it: Item): Species | undefined {
  const n = it.name?.replace(/^dead /, '');
  return SPECIES.find((s) => s.name === n);
}

const YIELD: Record<Grade, number> = { fumble: 0.3, fail: 0.6, near: 0.8, success: 1, fine: 1.25 };

/**
 * Butchers a carcass with a blade (Survival): its yields, fewer for a poor job (a fumble spoils
 * the hide), more for a fine one. Returns what it gives, in words, and how long it took; null with
 * no blade.
 */
export function butcher(a: Actor, inv: Inventory, it: Item, now: number): { items: Item[]; text: string; seconds: number } | null {
  const carried = new Set(inv.d.items.map((i) => i.def));
  const blade = BRUSH_TOOLS.find(([id]) => carried.has(id));
  if (!blade) return null;
  const s = speciesOfCarcass(it) ?? SPECIES_BY_ID.get('hare')!;
  const grade = check(a, 'survival', { difficulty: DC.easy, now }).grade;
  const items: Item[] = [];
  for (const [id, n] of s.yields) {
    if (!ITEM.has(id)) continue;
    if (id === 'hide' && grade === 'fumble') continue;
    const qty = id === 'raw_meat' ? Math.max(1, Math.round(n * YIELD[grade])) : n;
    items.push(makeItem(id, { qty, name: id === 'hide' ? `${s.name} hide` : undefined }));
  }
  const words: Record<Grade, string> = {
    fumble: `You make a mess of the ${s.name}: the hide is ruined, and much of the meat with it.`,
    fail: `You butcher the ${s.name}, clumsily; some of the meat is wasted.`,
    near: `You butcher the ${s.name}, not too badly.`,
    success: `You butcher the ${s.name} cleanly.`,
    fine: `You butcher the ${s.name} quickly and well, wasting nothing.`,
  };
  // A big beast takes longer: a deer most of an hour, a bear the better part of a morning.
  const kg = fightOf(s).kg;
  // Bloody work, the more of it on a big beast.
  const n = a.get(Needs);
  n?.stain(Math.min(40, 8 + kg * 0.25));
  n?.soil(5);
  return { items, text: words[grade], seconds: Math.round(15 * 60 * Math.max(1, Math.pow(kg / 10, 0.55))) };
}
