/** The night: its tasks, the watch, sleep, and what may happen in the dark. */
import { Skills } from '../../actors/components';
import { defOf, itemName, type Item } from '../../actors/items/item';
import { Needs } from '../../actors/needs';
import { type CampData } from '../camp';
import { cookPortion, mendNeeds, mendThing } from '../tasks';
import { inv, notes, pass, type CampCtx } from './context';
import { snareCatches } from './food';

// ---- The night -----------------------------------------------------------------------------------

export interface NightPlan {
  cook: boolean;
  mend: boolean;
  /** Hours of watch before sleeping. */
  watch: number;
  tend: boolean;
}

/** Things worth cooking (raw food first), carried. */
export function cookable(c: CampCtx): Item[] {
  return inv(c).d.items.filter((i) => defOf(i).food && defOf(i).food!.kcal > 0).sort((a, b) => Number(!!defOf(b).food!.raw) - Number(!!defOf(a).food!.raw));
}

/** The first thing carried that could be mended here and now. */
export function mendable(c: CampCtx): { it: Item; kit?: Item } | null {
  for (const it of inv(c).d.items) {
    const n = mendNeeds(inv(c), it, () => false);
    if (!n.why) return { it, kit: n.kit };
  }
  return null;
}

type NightEvent = 'animals' | 'stranger' | 'wolves';

/** Hours from now until seven in the morning (at least four, at most fourteen). */
export function hoursToMorning(time: number): number {
  const day = 86400, seven = 7 * 3600;
  let wake = Math.floor(time / day) * day + seven;
  while (wake < time + 4 * 3600) wake += day;
  return Math.min(14, Math.round((wake - time) / 3600));
}

/** The evening's tasks, the watch, sleep until morning, and what the night brings. */
export function spendNight(c: CampCtx, camp: CampData, plan: NightPlan, bedQuality: number): void {
  const g = c.game, a = c.actor;
  const s = a.get(Skills);
  // The evening.
  if (plan.cook && camp.fire.lit) {
    let meals = 0;
    for (const it of cookable(c)) {
      if (meals >= 2 || (a.get(Needs)?.room().kcal ?? 0) < 100) break;
      const o = cookPortion(a, inv(c), it, g.time);
      pass(c, o.seconds);
      c.say(o.text);
      if (o.mood) c.mood(o.mood, 8);
      meals++;
    }
    if (!meals) c.say('You have nothing to cook, or no appetite.');
  }
  if (plan.mend) {
    const m = mendable(c);
    if (m) {
      const o = mendThing(a, inv(c), m.it, g.time, m.kit);
      pass(c, o.seconds);
      c.say(o.text);
    }
  }
  notes(c);
  camp.fire.tend = plan.tend && camp.fire.lit;
  // The night's event, if any: when, and what.
  const hours = hoursToMorning(g.time);
  const watch = Math.max(0, Math.min(plan.watch, hours - 3));
  const rnd = () => s?.random() ?? 0.5;
  let event: NightEvent | null = null, at = -1;
  if (rnd() < 0.3) {
    const food = cookable(c).length > 0;
    const w: [NightEvent, number][] = [
      ['animals', food ? 3 : 0.5],
      ['stranger', (1 - camp.site.hidden) * 3 + 0.3],
      ['wolves', camp.site.wood > 0.3 ? 1.2 : 0.4],
    ];
    let x = rnd() * w.reduce((t, [, v]) => t + v, 0);
    event = w.find(([, v]) => (x -= v) < 0)?.[0] ?? 'wolves';
    at = Math.floor(rnd() * hours);
  }
  const happen = (onWatch: boolean) => {
    if (event) nightEvent(c, camp, event, onWatch);
    event = null;
  };
  if (watch) {
    c.say(`You sit up by the ${camp.fire.lit ? 'fire' : 'dark camp'} on watch for ${watch === 1 ? 'an hour' : `${watch} hours`}.`);
    for (let h = 0; h < watch; h++) {
      g.time += 3600;
      g.activity = 'rest';
      g.updateHud();
      if (h === at) happen(true);
    }
  }
  const q = Math.max(0.2, Math.min(0.98, bedQuality + g.camps.sleepBonus(g.px, g.py) - (camp.fire.tend ? 0.05 : 0)));
  c.sleep(hours - watch, q, (h) => {
    if (watch + h === at) happen(false);
  });
  camp.fire.tend = false;
  snareCatches(c, camp);
  if (camp.snares.some((x) => x.caught)) c.say('Something may be caught in your snares.');
  notes(c);
}

/** What happens in the night. */
function nightEvent(c: CampCtx, camp: CampData, e: NightEvent, onWatch: boolean): void {
  const n = c.actor.get(Needs);
  const fire = camp.fire.lit;
  switch (e) {
    case 'animals': {
      if (onWatch || fire) {
        c.say(onWatch ? 'Something snuffles at the edge of the firelight; you shout, and it slinks away.' : 'Something snuffles about the camp in the night, but keeps clear of the fire.');
        return;
      }
      const food = cookable(c);
      const it = food[food.length - 1];
      if (!it) return;
      const name = itemName({ ...it, qty: 1 });
      if (it.qty > 1) it.qty--;
      else inv(c).drop(it.uid);
      c.mood({ id: 'robbed-food', text: 'Animals at my food', value: -2 }, 12);
      c.say(`You wake to find something has been at your food: the ${name} is gone.`);
      return;
    }
    case 'stranger': {
      if (onWatch) {
        c.mood({ id: 'stranger', text: 'Shared the fire with a traveller', value: 1 }, 12);
        c.say('A traveller sees your fire and stops to share it a while before going on.');
        return;
      }
      const i = inv(c);
      if (i.d.copper > 10 && (c.actor.get(Skills)?.random() ?? 1) < 0.6) {
        const lost = Math.round(i.d.copper * (0.1 + 0.2 * (c.actor.get(Skills)?.random() ?? 0.5)));
        i.lose(lost);
        c.mood({ id: 'robbed', text: 'Robbed in my sleep', value: -4 }, 24);
        c.say('Someone has been through your things in the night: some of your money is gone.');
      } else c.say('You wake to footsteps passing in the dark, and lie still until they are gone.');
      return;
    }
    case 'wolves':
      if (fire || onWatch) {
        c.mood({ id: 'wolves', text: 'Wolves in the night', value: -1 }, 12);
        c.say('Wolves howl in the hills; the fire keeps them off.');
      } else {
        if (n) n.d.fatigue = Math.min(140, n.d.fatigue + 6);
        c.mood({ id: 'wolves', text: 'Lay awake for wolves', value: -2 }, 12);
        c.say('Wolves howl close by in the dark, and you lie awake a long while.');
      }
      return;
  }
}
