/** Shelter: a tent, a windbreak or a lean-to. */
import { check, DC } from '../../actors/checks';
import { Skills } from '../../actors/components';
import { type Item } from '../../actors/items/item';
import { SHELTERS, campable, type CampData, type ShelterKind } from '../camp';
import { done, give, has, inv, pass, type CampCtx, type Result } from './context';

// ---- Shelter -------------------------------------------------------------------------------------

/** Why a shelter cannot be put up, or null. */
export function whyNoShelter(c: CampCtx, camp: CampData, kind: ShelterKind): string | null {
  if (camp.shelter?.kind === kind) return `You already have ${SHELTERS[kind].name} here.`;
  if (kind === 'tent' && !has(c, 'tent')) return 'You have no tent.';
  if (kind === 'windbreak' && camp.site.wood < 0.12) return 'There is nothing here to build one from.';
  if (kind === 'lean_to') {
    if (camp.site.wood < 0.25) return 'There is too little wood about to build one.';
    if (!inv(c).d.items.some((i) => ['axe', 'hatchet', 'knife', 'dagger'].includes(i.def))) return 'You need a blade to cut the branches.';
  }
  return null;
}

export function putUpShelter(c: CampCtx, camp: CampData, kind: ShelterKind): Result {
  const why = whyNoShelter(c, camp, kind);
  if (why) return { ok: false, text: why };
  const g = c.game, now = g.time;
  if (kind !== 'tent') {
    const carp = (c.actor.get(Skills)?.effective('carpentry') ?? 0) / 4;
    const r = check(c.actor, 'survival', { difficulty: kind === 'windbreak' ? DC.easy - 5 : DC.routine - 5, mods: kind === 'lean_to' && carp >= 1 ? [{ why: 'carpentry', value: Math.round(carp) }] : [], now: now + (kind === 'windbreak' ? 2400 : 7200) });
    pass(c, kind === 'windbreak' ? 2400 : 7200);
    if (!r.ok && r.grade !== 'near') return done(c, false, kind === 'windbreak' ? 'Your windbreak sags and falls; it will need doing again.' : 'Your lean-to will not stand; the work is wasted.');
  } else pass(c, 20 * 60);
  takeDownShelter(c, camp, true);
  let at: [number, number] = camp.bedAt;
  if (kind === 'windbreak') {
    // Beside the bed, on open ground.
    const [bx, by] = camp.bedAt;
    const spot = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([dx, dy]) => [bx + dx, by + dy] as [number, number]).find(([x, y]) => (x !== camp.x || y !== camp.y) && campable(g, x, y));
    if (!spot) return done(c, false, 'There is no room to build it.');
    at = spot;
  }
  let tent: Item | undefined;
  if (kind === 'tent') {
    tent = has(c, 'tent')!;
    inv(c).drop(tent.uid);
  }
  g.camps.place(g, camp, at[0], at[1], kind);
  camp.shelter = { kind, x: at[0], y: at[1], ...(tent ? { tent } : {}) };
  // The bed moves out from under a pitched tent, to its mouth (one stands beside it).
  if (kind !== 'windbreak') {
    const mouth = [[0, 1], [1, 0], [-1, 0], [0, -1]].map(([dx, dy]) => [at[0] + dx, at[1] + dy] as [number, number]).find(([x, y]) => (x !== camp.x || y !== camp.y) && campable(g, x, y));
    if (mouth && kind === 'tent') {
      g.px = mouth[0];
      g.py = mouth[1];
    }
  }
  return done(c, true, kind === 'tent' ? 'You pitch your tent.' : kind === 'windbreak' ? 'You weave a windbreak of branches beside your bed.' : 'You build a lean-to of branches and bark over your bed.');
}

/** Takes down the shelter (the tent packed back up). */
export function takeDownShelter(c: CampCtx, camp: CampData, quiet = false): void {
  const s = camp.shelter;
  if (!s) return;
  c.game.camps.unplace(c.game, camp, s.x, s.y);
  if (s.tent) give(c, camp, s.tent);
  if (s.x === camp.bedAt[0] && s.y === camp.bedAt[1] && has(c, 'blanket')) c.game.camps.place(c.game, camp, s.x, s.y, 'bedroll');
  camp.shelter = undefined;
  if (!quiet) c.say(s.tent ? 'You strike the tent and pack it.' : 'You pull down the shelter.');
}
