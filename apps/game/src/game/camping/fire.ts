/** Wood and fire. */
import { check, DC, type Grade } from '../../actors/checks';
import { ARMFUL_KG, BURN_KG_H, type CampData } from '../camp';
import { done, has, inv, pass, type CampCtx, type Result } from './context';

// ---- Wood and fire -------------------------------------------------------------------------------

export function gatherWood(c: CampCtx, camp: CampData): Result {
  const r = check(c.actor, 'survival', { difficulty: DC.easy - 5 + Math.round((1 - camp.site.wood) * 25), now: c.game.time + 3600 });
  const axe = inv(c).d.items.some((i) => i.def === 'axe' || i.def === 'hatchet');
  const kg = Math.round(({ fine: 9, success: 6, near: 4, fail: 2, fumble: 1 } as Record<Grade, number>)[r.grade] * (0.3 + 0.7 * camp.site.wood) * (axe ? 1.4 : 1) * 10) / 10;
  pass(c, 3600);
  camp.wood += kg;
  c.game.camps.showWood(c.game, camp);
  const hours = (camp.wood / BURN_KG_H).toFixed(0);
  return done(c, kg >= 2, kg >= 5 ? `You gather a good pile of deadwood: enough for ${hours} hours of fire.` : kg >= 2 ? `You gather some wood: enough for ${hours} hours of fire.` : `You find little worth burning: ${hours} hours of fire, at most.`);
}

/** Why the fire cannot be lit, or null. */
export function whyNoFire(c: CampCtx, camp: CampData): string | null {
  if (camp.fire.lit) return 'The fire is already burning.';
  if (!has(c, 'flint')) return 'You have nothing to light a fire with.';
  if (camp.wood < 0.5) return 'You have no wood to burn.';
  return null;
}

export function lightFire(c: CampCtx, camp: CampData): Result {
  const why = whyNoFire(c, camp);
  if (why) return { ok: false, text: why };
  const wind = camp.site.shelter < 0.3 ? [{ why: 'the wind', value: -10 }] : [];
  const r = check(c.actor, 'survival', { difficulty: DC.trivial + 10, mods: wind, now: c.game.time });
  pass(c, r.ok ? 600 : 1200);
  if (r.grade === 'fail' || r.grade === 'fumble') {
    if (r.grade === 'fumble') camp.wood = Math.max(0, camp.wood - 0.5);
    return done(c, false, r.grade === 'fumble' ? 'You waste your kindling; the fire will not take.' : 'The tinder smoulders and dies. You could try again.');
  }
  const kg = Math.min(ARMFUL_KG, camp.wood);
  camp.wood -= kg;
  camp.fire.fuelH = kg / BURN_KG_H;
  c.game.camps.setFire(c.game, camp, true);
  c.game.camps.showWood(c.game, camp);
  return done(c, true, r.grade === 'fine' ? 'The fire catches at the first spark.' : 'You coax a fire into life.');
}

export function feedFire(c: CampCtx, camp: CampData): Result {
  if (!camp.fire.lit) return { ok: false, text: 'The fire is out.' };
  if (camp.wood < 0.5) return { ok: false, text: 'There is no wood left.' };
  const kg = Math.min(ARMFUL_KG, camp.wood);
  camp.wood -= kg;
  camp.fire.fuelH += kg / BURN_KG_H;
  pass(c, 60);
  c.game.camps.showWood(c.game, camp);
  return done(c, true, 'You build up the fire.');
}

export function putOutFire(c: CampCtx, camp: CampData): Result {
  if (!camp.fire.lit) return { ok: false, text: 'The fire is out.' };
  // What is left unburnt goes back on the pile.
  camp.wood += Math.max(0, camp.fire.fuelH * BURN_KG_H * 0.5);
  camp.fire.fuelH = 0;
  c.game.camps.setFire(c.game, camp, false);
  c.game.camps.showWood(c.game, camp);
  pass(c, 120);
  return done(c, true, 'You put out the fire.');
}
