/**
 * Crossing a river too deep to ford on the travel map (docs/backlog.md, T3; navigation.md, The
 * travel map). The route goes round by a bridge where there is one within a day's detour; where
 * there is none, the party stops at the bank and the player chooses:
 *
 * - **Swim it** (Swimming, harder with a load and in the cold): across, soaked through; a near miss
 *   gets across downstream, spent; a failure turns back to the near bank, soaked and spent; a
 *   fumble is swept away, swallows water and is bruised, and the river takes what was held in the
 *   hands or strapped to the pack.
 * - **Build a raft** (Survival, with Carpentry): needs an axe or a hatchet and wood about; rope
 *   makes it quicker and surer, withies and bark slower. About two hours, then poled across with
 *   the load kept dry. A failure wastes the work; a fumble breaks up midstream, soaking all.
 *
 * Proposed numbers, to tune in play.
 */
import { Biome } from '@worldforge/core/gen/biomes';
import type { Actor } from '../actors/actor';
import { check, DC, type Mod } from '../actors/checks';
import { Skills } from '../actors/components';
import { Health } from '../actors/health';
import { Inventory } from '../actors/items/inventory';
import { itemName } from '../actors/items/item';
import { Needs } from '../actors/needs';

export type CrossBy = 'swim' | 'raft';

export interface Crossing {
  /** Across (or still on the near bank). */
  ok: boolean;
  /** Seconds it took. */
  seconds: number;
  text: string;
}

/** Lands with no wood to build from, and those with little. */
const NO_WOOD = new Set<number>([Biome.IceSheet, Biome.SaltFlat]);
const LITTLE_WOOD = new Set<number>([Biome.HotDesert, Biome.ColdDesert, Biome.Tundra, Biome.Alpine]);

/** Building a raft: hours, by the grade of the Survival check. */
const RAFT_H = { fine: 1.5, success: 2, near: 3, fail: 2, fumble: 2 } as const;

const loadMods = (load: number): Mod[] => (load > 1.02 ? [{ why: 'your load', value: -Math.round((load - 1) * 60) }] : []);

/** Why a raft cannot be built here, or null. */
export function whyNoRaft(a: Actor, biome: number): string | null {
  const items = a.get(Inventory)?.d.items ?? [];
  if (!items.some((i) => i.def === 'axe' || i.def === 'hatchet')) return 'You need an axe or a hatchet to cut the logs for a raft.';
  if (NO_WOOD.has(biome)) return 'There is no wood here to build a raft from.';
  return null;
}

/** Crosses a deep river by swimming or by raft, from the near bank (`airC`: the cold of the day). */
export function crossRiver(a: Actor, by: CrossBy, o: { now: number; load: number; biome: number; airC: number; random: () => number }): Crossing {
  const n = a.get(Needs), h = a.get(Health), inv = a.get(Inventory);
  const soak = (to: number) => {
    if (n) n.d.wet = Math.max(n.d.wet ?? 0, to);
  };
  const spend = (k: number) => {
    const P = n?.pools();
    if (P) P.physBurst.value = Math.max(0, P.physBurst.value - k);
    if (n) n.d.fatigue = Math.min(140, n.d.fatigue + k / 8);
  };
  if (by === 'raft') {
    const why = whyNoRaft(a, o.biome);
    if (why) return { ok: false, seconds: 0, text: why };
    const rope = inv?.d.items.some((i) => i.def === 'rope');
    const carp = Math.round((a.get(Skills)?.effective('carpentry') ?? 0) / 4);
    const mods: Mod[] = [];
    if (rope) mods.push({ why: 'rope to lash it', value: 10 });
    else mods.push({ why: 'withies and bark for lashing', value: -5 });
    if (carp >= 1) mods.push({ why: 'carpentry', value: carp });
    if (LITTLE_WOOD.has(o.biome)) mods.push({ why: 'little wood to hand', value: -10 });
    const r = check(a, 'survival', { difficulty: DC.trivial + 5, mods, now: o.now });
    const hours = RAFT_H[r.grade] + (rope ? 0 : 0.5) + (LITTLE_WOOD.has(o.biome) ? 1 : 0);
    const seconds = Math.round(hours * 3600) + 15 * 60;
    spend(15);
    if (r.grade === 'fail') return { ok: false, seconds, text: 'You work for hours, but the logs will not hold together; the raft comes apart in the shallows.' };
    if (r.grade === 'fumble') {
      soak(100);
      return { ok: false, seconds, text: 'Your raft breaks up in the current midstream, and you struggle back to the near bank, soaked through.' };
    }
    soak(25);
    return { ok: true, seconds, text: r.grade === 'fine' ? 'You lash a sound raft together and pole it across, your load kept dry.' : r.grade === 'near' ? 'Your raft is a poor, wallowing thing, but it carries you across, your load mostly dry.' : 'You build a raft of cut logs and pole it across, your load kept dry.' };
  }
  const cold: Mod[] = o.airC < 8 ? [{ why: 'the cold water', value: -Math.round((8 - o.airC) * 1.5) }] : [];
  const r = check(a, 'swimming', { difficulty: DC.trivial + 10, mods: [...loadMods(o.load), ...cold], now: o.now });
  soak(100);
  if (r.grade === 'fine' || r.grade === 'success') {
    spend(25);
    return { ok: true, seconds: 10 * 60, text: 'You swim the river and haul yourself out on the far bank, soaked through.' };
  }
  if (r.grade === 'near') {
    spend(45);
    return { ok: true, seconds: 25 * 60, text: 'The current carries you far downstream before you crawl out on the far bank, spent and soaked.' };
  }
  if (r.grade === 'fail') {
    spend(45);
    return { ok: false, seconds: 20 * 60, text: o.load > 1.1 ? 'Your load drags you down; you turn back and struggle out on the near bank, soaked and spent.' : 'The current is too strong; you turn back and struggle out on the near bank, soaked and spent.' };
  }
  spend(70);
  h?.choke(0.35);
  h?.hurt({ kind: 'bruise', sev: 2 + o.random() * 4, cause: 'a river in spate', now: o.now });
  // The river takes something not packed away: held, then strapped to the pack.
  const loose = inv?.d.items.find((i) => i.loc?.at === 'hand') ?? inv?.d.items.find((i) => i.loc?.at === 'strap');
  const lost = loose ? inv!.drop(loose.uid)[0] : undefined;
  return { ok: false, seconds: 30 * 60, text: `You are swept away and go under, and drag yourself out on the near bank half drowned${lost ? `; the river has taken your ${itemName(lost)}` : ''}.` };
}
