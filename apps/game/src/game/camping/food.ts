/** Food from the land: foraging. (Snares are the wanderer's own, set from the skill menu: world/hunting.ts.) */
import { check, DC, type Grade } from '../../actors/checks';
import { Skills } from '../../actors/components';
import { itemName, makeItem } from '../../actors/items/item';
import { type CampData } from '../camp';
import { done, give, pass, type CampCtx, type Result } from './context';

// ---- Food from the land -----------------------------------------------------------------------------

const SEASON_FOOD: Record<string, number> = { spring: 0.6, summer: 1, autumn: 1.3, winter: 0.15 };
const FINDS: Record<string, [string, number][]> = {
  spring: [['wild_greens', 4], ['roots', 2], ['mushrooms', 1]],
  summer: [['berries', 4], ['wild_greens', 2], ['roots', 2], ['mushrooms', 1]],
  autumn: [['berries', 2], ['nuts', 3], ['mushrooms', 3], ['roots', 2]],
  winter: [['roots', 2], ['nuts', 1]],
};

export function forage(c: CampCtx, camp: CampData): Result {
  const s = c.actor.get(Skills);
  const skill = (s?.effective('herbalism') ?? 0) > (s?.effective('survival') ?? 0) ? 'herbalism' : 'survival';
  const season = c.season();
  const r = check(c.actor, skill, { difficulty: DC.easy + (season === 'winter' ? 20 : 0), now: c.game.time + 3600 });
  pass(c, 3600);
  const base = ({ fine: 5, success: 3, near: 2, fail: 1, fumble: 0 } as Record<Grade, number>)[r.grade];
  const n = Math.round(base * (SEASON_FOOD[season] ?? 0.6) * (0.25 + 0.75 * camp.site.wood) * (0.7 + 0.6 * (s?.random() ?? 0.5)));
  const got = new Map<string, number>();
  const table = FINDS[season] ?? FINDS.summer;
  const total = table.reduce((t, [, w]) => t + w, 0);
  for (let i = 0; i < n; i++) {
    let x = (s?.random() ?? 0.5) * total;
    const pick = table.find(([, w]) => (x -= w) < 0)?.[0] ?? table[0][0];
    got.set(pick, (got.get(pick) ?? 0) + 1);
  }
  if ((s?.effective('herbalism') ?? 0) >= 10 && r.ok && season !== 'winter' && (s?.random() ?? 1) < 0.3) got.set('herbs', 1);
  for (const [id, q] of got) give(c, camp, makeItem(id, { qty: q }));
  if (!got.size) return done(c, false, season === 'winter' ? 'You search the frozen ground for an hour and find nothing to eat.' : 'You search for an hour, but find nothing worth eating.');
  const list = [...got].map(([id, q]) => itemName(makeItem(id, { qty: q }), q === 1));
  return done(c, true, `You forage for an hour and find ${list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0]}.`);
}
