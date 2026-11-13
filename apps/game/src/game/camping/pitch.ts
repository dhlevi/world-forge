/** Choosing where, making camp and striking it. */
import { defOf } from '../../actors/items/item';
import { type CampData, type SiteChoice } from '../camp';
import { done, give, has, inv, pass, type CampCtx, type Result } from './context';
import { takeUpSnares } from './food';

// ---- Making and striking camp -------------------------------------------------------------------

/** Walks to a chosen site and lays a camp out there. */
export function makeCamp(c: CampCtx, s: SiteChoice): CampData {
  const g = c.game;
  if (s.m > 0) {
    g.time += Math.round(s.m / 1.25);
    g.activity = 'walk';
  }
  const camp = g.camps.make(g, s.x, s.y, s.rating);
  g.px = camp.bedAt[0];
  g.py = camp.bedAt[1];
  if (has(c, 'blanket')) g.camps.place(g, camp, camp.bedAt[0], camp.bedAt[1], 'bedroll');
  stackFirewood(c, camp);
  g.updateHud();
  c.say(`You make camp${s.m > 10 ? ` ${s.why === 'where you stand' ? 'here' : `${s.m} m off`}` : ''}.`);
  return camp;
}

/** Firewood carried goes on the woodpile. */
export function stackFirewood(c: CampCtx, camp: CampData): number {
  let kg = 0;
  for (const it of [...inv(c).d.items]) if (it.def === 'firewood') {
    kg += defOf(it).weight * it.qty;
    inv(c).drop(it.uid);
  }
  camp.wood += kg;
  c.game.camps.showWood(c.game, camp);
  return kg;
}

/** Strikes the camp: the tent packed, snares taken up, the fire put out. */
export function strikeCamp(c: CampCtx, camp: CampData): Result {
  const g = c.game;
  if (camp.shelter?.tent) give(c, camp, camp.shelter.tent);
  const wires = camp.snares.length;
  takeUpSnares(c, camp, true);
  pass(c, (camp.shelter?.kind === 'tent' ? 15 : 5) * 60 + wires * 5 * 60);
  g.camps.strike(g, camp);
  return done(c, true, `You strike camp${camp.shelter?.tent ? ' and pack the tent' : ''}${wires ? `, taking up your snares` : ''}.`);
}
