import type { Rng } from '../gen/rng';
import type { DLevel, DungeonSite } from './core';
import { type PitSpec, type YardSpec, pitLevel, yardLevel } from './prison';

/**
 * The stronghold of an organisation (lore/orders.ts), on two levels laid out as a prison's are
 * (dungeons/prison.ts): a walled courtyard with ranges of rooms round it, a gate passage and two
 * corner towers, and below it an undercroft of rooms off one passage. What the rooms are follows
 * the stronghold: a monster hunters' school, a knightly order's commandery, the retreat where
 * assassins pass for monks, or a free company's winter quarters. The kind is one of the site's tags.
 */
const YARDS: Record<string, YardSpec> = {
  school: { name: 'The school', yard: 'hold-training', north: ['hold-hall', 'hold-trophy', 'hold-kitchen'], west: ['hold-lab', 'hold-library', 'hold-armoury'], east: ['hold-dorm', 'hold-kennels', 'hold-store'], gate: 'guard', tower: 'hold-watch', stair: 'hold-lab', spare: 'hold-store' },
  commandery: { name: 'The commandery', yard: 'hold-tiltyard', north: ['hold-chapterhall', 'chapel', 'hold-kitchen'], west: ['hold-gm', 'hold-library', 'hold-infirmary'], east: ['hold-dorm', 'hold-stables', 'hold-armoury'], gate: 'guard', tower: 'hold-watch', stair: 'chapel', spare: 'hold-store' },
  retreat: { name: 'The cloister', yard: 'hold-cloister', north: ['hold-hall', 'chapel', 'hold-kitchen'], west: ['hold-library', 'hold-dorm', 'hold-gm'], east: ['hold-dorm', 'hold-infirmary', 'hold-store'], gate: 'hold-porter', tower: 'hold-watch', stair: 'chapel', spare: 'hold-store' },
  camp: { name: 'Winter quarters', yard: 'hold-drill', north: ['hold-hall', 'hold-paymaster', 'hold-kitchen'], west: ['hold-dorm', 'hold-infirmary', 'hold-store'], east: ['hold-stables', 'hold-armoury', 'hold-dorm'], gate: 'guard', tower: 'hold-watch', stair: 'hold-paymaster', spare: 'hold-store' },
};
const PITS: Record<string, PitSpec> = {
  school: { name: 'The undercroft', landing: 'hold-landing', rooms: [['hold-trials', 6, 5], ['hold-cells', 4, 4], ['hold-cells', 4, 4], ['hold-crypt', 5, 4], ['hold-vault', 4, 3], ['cistern', 5, 4], ['hold-store', 4, 4]], locked: ['hold-cells', 'hold-vault'], barred: 'hold-cells' },
  commandery: { name: 'The undercroft', landing: 'hold-landing', rooms: [['hold-reliquary', 6, 5], ['hold-crypt', 5, 4], ['hold-crypt', 4, 4], ['hold-treasury', 4, 4], ['hold-cells', 3, 3], ['cistern', 5, 4], ['hold-wine', 4, 4]], locked: ['hold-treasury', 'hold-cells'] },
  retreat: { name: 'Beneath the cloister', landing: 'hold-landing', rooms: [['hold-shrine', 6, 5], ['hold-training', 7, 5], ['hold-poison', 5, 4], ['hold-archive', 5, 4], ['hold-vault', 4, 3], ['hold-cells', 3, 3], ['cistern', 4, 4]], locked: ['hold-archive', 'hold-vault', 'hold-cells'] },
  camp: { name: 'The cellars', landing: 'hold-landing', rooms: [['hold-treasury', 5, 4], ['hold-cells', 4, 3], ['hold-wine', 5, 5], ['hold-store', 5, 4], ['hold-store', 4, 4], ['cistern', 4, 4]], locked: ['hold-treasury', 'hold-cells'] },
};
export const HOLD_KINDS = Object.keys(YARDS);

export function stronghold(site: DungeonSite, rnd: Rng): DLevel[] {
  const kind = HOLD_KINDS.find((k) => site.tags.includes(k)) ?? 'commandery';
  const large = site.tags.includes('large');
  const W = large ? 44 : 38, H = large ? 34 : 30;
  const top = yardLevel(rnd, W, H, large, YARDS[kind]);
  const down = top.links[0];
  const under = pitLevel(rnd, W, H, [down.x, down.y], PITS[kind], 0);
  return [top, under];
}
