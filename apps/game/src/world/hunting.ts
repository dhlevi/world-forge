/**
 * Hunting without bows (docs/design/npcs.md, Animals: Hunting; Stage 2): snares set on the ground
 * for small game, and butchery. The spear and the blade are combat's (game/combat.ts; combat.md,
 * stage 2); shooting waits for stage 3.
 *
 * - **Snares.** A length of snare wire set on a tile (P). Small game (core local/fauna.ts,
 *   `snared`) that steps on it is caught; out of sight, each hour, a snare in the range of a group of
 *   small game catches one with a chance that grows with Trapping (fieldcraft.md, stage 3). Walking onto a snare with a catch
 *   takes it (a carcass); P on a snare lifts it and gives the wire back.
 * - **Skinning** (Hideworking; fieldcraft.md, stage 2): a carcass skinned first gives its hide or
 *   pelt, of a quality by the check; butchered unskinned, the hide is hacked off, poor at best.
 * - **Butchery.** A carcass and a blade give the beast's yields (core local/fauna.ts): fewer with a
 *   poor Survival check, more with a fine one.
 */
import { SPECIES, SPECIES_BY_ID, type Species } from '@worldforge/core/local/fauna';
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import type { Actor } from '../actors/actor';
import { check, DC, type Grade } from '../actors/checks';
import type { Inventory } from '../actors/items/inventory';
import { makeItem, type Item } from '../actors/items/item';
import { ITEM, hideId, itemDef } from '../actors/items/defs';
import { carriedAge } from '../actors/items/spoil';
import { Needs } from '../actors/needs';
import { BRUSH_TOOLS } from '../rules/tasks';
import { fightOf } from '../rules/beasts';
import type { Fauna, FaunaView } from './fauna';
import { BAIT_BOOST, BAIT_TAKEN_PER_HOUR, drawnBy, fresh, stealChance, takerOf, type Bait } from './traps';

export interface Snare {
  x: number;
  y: number;
  /** When it was set; when it was last tried (out of sight, by the hour). */
  set: number;
  tried: number;
  /** What it has caught (a species id), and when. */
  caught?: string;
  at?: number;
  /** Its catch taken by a predator (the species, if any was about), and when (fieldcraft.md, stage 3). */
  robbed?: { by: string | null; at: number };
  /** Food laid in it to draw game, and its bait taken without a catch (world/traps.ts). */
  bait?: Bait;
  baitTaken?: { by: string | null; at: number };
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
  run(fauna: Fauna, g: FaunaView, survival: number, fenceBoost: (x: number, y: number) => number = () => 1): Snare[] {
    const out: Snare[] = [];
    const predators = [...fauna.all()].filter((m) => m.s.diet === 'predator');
    for (const s of this.list) {
      // A catch waiting out of sight may be taken, by the hour (fieldcraft.md, stage 3).
      if (s.caught) {
        if (g.isVisible(s.x, s.y)) s.tried = g.time;
        while (s.caught && g.time - s.tried >= 3600) {
          s.tried += 3600;
          const r = mulberry32(hashString(`snare-rob#${s.x},${s.y}#${s.tried}`));
          const near = predators.find((m) => Math.hypot(m.x - s.x, m.y - s.y) < 80);
          if (r() < (near ? 0.06 : 0.02)) {
            s.robbed = { by: near?.s.id ?? null, at: s.tried };
            s.caught = undefined;
          }
        }
        continue;
      }
      const a = fauna.at(s.x, s.y);
      const bait = fresh(s.bait, g.time) ? s.bait : undefined;
      // A beast at the bait that the snare does not hold eats it; one it holds may take it and get away.
      if (a && a.alt === 0 && bait && drawnBy(a.s.diet, bait.kind)) {
        const r = mulberry32(hashString(`snare-bait#${s.x},${s.y}#${Math.floor(g.time)}`));
        if (!a.s.snared || r() < stealChance(survival, a.s.temper === 'wary' || a.s.temper === 'skittish')) {
          s.bait = undefined;
          s.baitTaken = { by: a.s.id, at: g.time };
          continue;
        }
      }
      if (a && a.s.snared && a.alt === 0) {
        fauna.remove(a);
        s.caught = a.s.id;
        s.at = g.time;
        s.tried = g.time;
        s.robbed = undefined;
        s.bait = undefined;
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
        const b = fresh(s.bait, s.tried) ? s.bait : undefined;
        // Bait out of sight is taken now and then by a beast the snare does not hold.
        if (b && r() < BAIT_TAKEN_PER_HOUR) {
          const thief = [...fauna.all()].find((m) => drawnBy(m.s.diet, b.kind) && Math.hypot(m.x - s.x, m.y - s.y) < 60);
          s.baitTaken = { by: thief?.s.id ?? null, at: s.tried };
          s.bait = undefined;
          continue;
        }
        const m = takerOf(fauna, s, b, (x) => !!x.s.snared);
        if (m && r() < PER_HOUR(survival) * fenceBoost(s.x, s.y) * (b && drawnBy(m.s.diet, b.kind) ? BAIT_BOOST : 1)) {
          fauna.remove(m);
          s.caught = m.s.id;
          s.at = s.tried;
          s.robbed = undefined;
          s.bait = undefined;
          out.push(s);
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


/** How a skinning turns out: the hide's quality, or spoilt. */
const SKINNED: Record<Grade, Item['quality'] | null> = { fine: 'fine', success: 'common', near: 'poor', fail: 'poor', fumble: null };

/**
 * Skins a carcass with a blade (Hideworking; fieldcraft.md, stage 2): the hide or pelt, its quality
 * by the check (a fumble spoils it), before it is butchered. Null with no blade, or nothing to skin.
 */
export function skin(a: Actor, it: Item, inv: Inventory, now: number): { items: Item[]; text: string; seconds: number } | null {
  const carried = new Set(inv.d.items.map((i) => i.def));
  if (!BRUSH_TOOLS.some(([id]) => carried.has(id)) || it.skinned) return null;
  const s = speciesOfCarcass(it) ?? SPECIES_BY_ID.get('hare')!;
  if (!s.yields.some(([id]) => id === 'hide')) return null;
  const grade = check(a, 'hideworking', { difficulty: DC.easy, now }).grade;
  const q = SKINNED[grade];
  it.skinned = true;
  const kg = fightOf(s).kg;
  a.get(Needs)?.stain(Math.min(25, 4 + kg * 0.12));
  const id = hideId(s), name = itemDef(id).name;
  const text: Record<Grade, string> = {
    fine: `You skin the ${s.name} neatly, without a nick: a fine ${name}.`,
    success: `You skin the ${s.name}: a sound ${name}.`,
    near: `You skin the ${s.name}, with a few nicks in the ${name}.`,
    fail: `You skin the ${s.name} badly; the ${name} is torn and scored.`,
    fumble: `You make a ruin of skinning the ${s.name}: the ${name} is cut to pieces.`,
  };
  return { items: q ? [makeItem(id, { quality: q })] : [], text: text[grade], seconds: Math.round(10 * 60 * Math.max(1, Math.pow(kg / 10, 0.5))) };
}

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
    // Skinned first, the hide is taken already; else it is hacked off as the meat is cut, poor at best.
    if (id === 'hide' && (it.skinned || grade === 'fumble')) continue;
    const qty = id === 'raw_meat' ? Math.max(1, Math.round(n * YIELD[grade])) : n;
    items.push(id === 'hide' ? makeItem(hideId(s), { quality: 'poor' }) : makeItem(id, { qty }));
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
  // The meat is as old as the carcass it came from (actors/items/spoil.ts).
  for (const out of items) {
    const aged = carriedAge(it.def, it.aged, out.def);
    if (aged !== undefined) out.aged = aged;
  }
  return { items, text: words[grade], seconds: Math.round(15 * 60 * Math.max(1, Math.pow(kg / 10, 0.55))) };
}
