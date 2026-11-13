/**
 * What the wanderer does at a camp (docs/design/navigation.md, Camping): choosing the site and
 * laying it out, gathering wood and lighting the fire, putting up a shelter, foraging and setting
 * snares, and the night: its tasks (cooking, mending, keeping watch, tending the fire), sleep, and
 * what may happen in the dark.
 *
 * The same on the local map and from the travel map: on the travel map the camp is still laid out
 * on the local map about the party, and the night is worked out in summary.
 *
 * - **Wood** (Survival): an hour gathers an armful or more where there is wood, more with an axe.
 * - **Fire** (Survival): flint and steel and a little wood; harder in an exposed spot.
 * - **Shelter:** pitch a carried tent; build a windbreak (Survival) or a lean-to (Survival, with
 *   Carpentry helping, and a blade) where there is wood to build with.
 * - **Foraging** (the better of Survival and Herbalism): what the season and the land give:
 *   greens and roots in spring, berries in summer, nuts, mushrooms and berries in autumn, little
 *   in winter; now and then healing herbs.
 * - **Snares** (Trapping): set on runs about the camp; each may hold a rabbit when checked, by how
 *   well it was set, the land, and how long it has been.
 * - **The night's events** (placeholders until there are creatures and people about): animals at
 *   the food, rain, a stranger, wolves. Keeping watch, a fire, a shelter and a hidden site each
 *   turn them aside.
 *
 * Proposed numbers, to tune in play.
 */
import type { Actor } from '../actors/actor';
import { check, DC, type Grade } from '../actors/checks';
import { Skills, type Moodlet } from '../actors/components';
import { Inventory } from '../actors/items/inventory';
import { defOf, itemName, makeItem, type Item } from '../actors/items/item';
import { Needs } from '../actors/needs';
import { ARMFUL_KG, BURN_KG_H, SHELTERS, campable, type CampData, type ShelterKind, type SiteChoice } from './camp';
import type { Game } from './game';
import { cookPortion, mendNeeds, mendThing } from './tasks';
import { OBJECT_TILES } from '@worldforge/core/local/tiles';
import { TILE_M } from '@worldforge/core/local/chunk';

/** What camping needs of the game around it. */
export interface CampCtx {
  game: Game;
  actor: Actor;
  say(t: string): void;
  mood(m: Moodlet, hours: number): void;
  season(): string;
  /** Sleeps (game hours), with something to run after each hour; returns hours slept. */
  sleep(hours: number, quality: number, onHour: (h: number) => void): number;
}

export interface Result {
  ok: boolean;
  text: string;
}

const inv = (c: CampCtx) => c.actor.need(Inventory);
const has = (c: CampCtx, id: string) => inv(c).d.items.find((i) => i.def === id);
const pass = (c: CampCtx, s: number) => {
  c.game.time += Math.round(s);
  c.game.activity = 'work';
  c.game.updateHud();
};
const notes = (c: CampCtx) => {
  for (const n of c.actor.get(Skills)?.takeNotes() ?? []) c.say(n.text);
};
const done = (c: CampCtx, ok: boolean, text: string): Result => {
  c.say(text);
  notes(c);
  return { ok, text };
};

/** Gives a thing to the wanderer (where it best fits), or lays it at the camp's bed if there is no room. */
function give(c: CampCtx, camp: CampData, it: Item): void {
  if (inv(c).stow(it)) c.game.ground.put(camp.bedAt[0], camp.bedAt[1], [it]);
}

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

/** Snare wire carried. */
export const wires = (c: CampCtx): number => inv(c).d.items.filter((i) => i.def === 'snares').reduce((t, i) => t + i.qty, 0);

/** Sets up to `n` snares on runs about the camp (a quarter of an hour each). */
export function setSnares(c: CampCtx, camp: CampData, n: number): Result {
  const g = c.game;
  const have = Math.min(n, wires(c), 6 - camp.snares.length);
  if (have <= 0) return { ok: false, text: wires(c) ? 'You have set as many snares as you can watch over.' : 'You have no snare wire.' };
  // Places with cover about them, a little way from the fire.
  const spots: [number, number, number][] = [];
  for (let dy = -14; dy <= 14; dy += 2) for (let dx = -14; dx <= 14; dx += 2) {
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    const x = camp.x + dx, y = camp.y + dy;
    if (d < 5 || !campable(g, x, y) || camp.snares.some((s) => Math.abs(s.x - x) + Math.abs(s.y - y) < 4)) continue;
    let cover = 0;
    for (let ey = -1; ey <= 1; ey++) for (let ex = -1; ex <= 1; ex++) {
      const o = OBJECT_TILES[g.map.object(x + ex, y + ey)]?.name ?? '';
      if (o.startsWith('tree') || o === 'bush' || o === 'scrub' || o === 'ferns' || o === 'tall_grass') cover++;
    }
    spots.push([x, y, cover + (s0(g) * 0.5)]);
  }
  spots.sort((a, b) => b[2] - a[2]);
  let set = 0;
  const grades: Grade[] = [];
  for (const [x, y] of spots.slice(0, have)) {
    const r = check(c.actor, 'trapping', { difficulty: DC.easy, now: g.time, learn: 0.6 });
    const w = inv(c).d.items.find((i) => i.def === 'snares');
    if (!w) break;
    if (w.qty > 1) w.qty--;
    else inv(c).drop(w.uid);
    camp.snares.push({ x, y, set: g.time, grade: r.grade, checked: g.time });
    g.camps.place(g, camp, x, y, 'snare');
    grades.push(r.grade);
    set++;
  }
  pass(c, set * 15 * 60);
  if (!set) return done(c, false, 'You find no good runs to set a snare on here.');
  const good = grades.filter((x) => x === 'success' || x === 'fine').length;
  return done(c, true, `You set ${set === 1 ? 'a snare' : `${set} snares`} on the runs about the camp${good === set ? ', and set them well' : good ? '' : ', though not with much confidence'}.`);
}
// A little variety in which spots come first, from the clock (not the dice).
const s0 = (g: Game) => ((g.time / 977) % 1);

/** How likely a snare is to hold something after half a day, by how well it was set. */
const SNARE_CATCH: Record<Grade, number> = { fine: 0.55, success: 0.4, near: 0.25, fail: 0.1, fumble: 0.02 };

/** Rolls for catches in the snares since they were last looked at (done as time passes). */
export function snareCatches(c: CampCtx, camp: CampData): void {
  const s = c.actor.get(Skills);
  for (const sn of camp.snares) {
    if (sn.caught) continue;
    const halfDays = (c.game.time - sn.checked) / 43200;
    if (halfDays < 0.25) continue;
    const p = 1 - Math.pow(1 - SNARE_CATCH[sn.grade] * (0.4 + 0.6 * camp.site.wood) * (c.season() === 'winter' ? 0.6 : 1), halfDays);
    if ((s?.random() ?? 1) < p) sn.caught = 'rabbit';
    sn.checked = c.game.time;
  }
}

/** Walks the snares and takes what is in them. */
export function checkSnares(c: CampCtx, camp: CampData): Result {
  if (!camp.snares.length) return { ok: false, text: 'You have set no snares.' };
  snareCatches(c, camp);
  pass(c, 20 * 60 + camp.snares.length * 3 * 60);
  let n = 0;
  for (const sn of camp.snares) {
    if (!sn.caught) continue;
    give(c, camp, makeItem(sn.caught));
    sn.caught = undefined;
    n++;
    c.actor.get(Skills)?.practise('trapping', 0.4, c.game.time);
  }
  return done(c, n > 0, n ? `You walk your snares and take ${n === 1 ? 'a rabbit' : `${n} rabbits`}.` : 'You walk your snares: nothing yet.');
}

export function takeUpSnares(c: CampCtx, camp: CampData, quiet = false): void {
  snareCatches(c, camp);
  let back = 0, caught = 0;
  for (const sn of camp.snares) {
    if (sn.caught) {
      give(c, camp, makeItem(sn.caught));
      caught++;
    }
    c.game.camps.unplace(c.game, camp, sn.x, sn.y);
    back++;
  }
  if (back) give(c, camp, makeItem('snares', { qty: back }));
  camp.snares = [];
  if (!quiet && back) c.say(`You take up your snares${caught ? `, with ${caught === 1 ? 'a rabbit' : `${caught} rabbits`}` : ''}.`);
}

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

type NightEvent = 'animals' | 'rain' | 'stranger' | 'wolves';

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
    const season = c.season();
    const food = cookable(c).length > 0;
    const w: [NightEvent, number][] = [
      ['animals', food ? 3 : 0.5],
      ['rain', season === 'summer' ? 2 : season === 'winter' ? 1 : 3],
      ['stranger', (1 - camp.site.hidden) * 3 + 0.3],
      ['wolves', camp.site.wood > 0.3 ? 1.2 : 0.4],
    ];
    let x = rnd() * w.reduce((t, [, v]) => t + v, 0);
    event = w.find(([, v]) => (x -= v) < 0)?.[0] ?? 'rain';
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
  const g = c.game;
  const n = c.actor.get(Needs);
  const fire = camp.fire.lit;
  const shelter = camp.shelter ? SHELTERS[camp.shelter.kind] : null;
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
    case 'rain':
      if (shelter?.rain) {
        c.say(`Rain comes in the night and drums on your ${camp.shelter!.kind === 'tent' ? 'tent' : 'lean-to'}; you stay dry.`);
        return;
      }
      if (n) n.d.heat = Math.max(-100, n.d.heat - 20);
      if (fire && !onWatch) {
        camp.fire.fuelH = 0;
        g.camps.setFire(g, camp, false);
      }
      c.mood({ id: 'soaked-night', text: 'Soaked in the night', value: -3 }, 12);
      c.say(onWatch ? 'Rain sets in while you sit watch, and soaks you through.' : `Rain comes in the night and soaks you through${fire ? '; the fire hisses out' : ''}.`);
      return;
    case 'stranger': {
      if (onWatch) {
        c.mood({ id: 'stranger', text: 'Shared the fire with a traveller', value: 1 }, 12);
        c.say('A traveller sees your fire and stops to share it a while before going on.');
        return;
      }
      const i = inv(c);
      if (i.d.copper > 10 && (c.actor.get(Skills)?.random() ?? 1) < 0.6) {
        const lost = Math.round(i.d.copper * (0.1 + 0.2 * (c.actor.get(Skills)?.random() ?? 0.5)));
        i.d.copper -= lost;
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

/** The camp in words, for the camp screen. */
export function campWords(camp: CampData): string[] {
  const out: string[] = [];
  const h = Math.max(1, Math.round(camp.fire.fuelH));
  out.push(camp.fire.lit ? `The fire is burning (${h === 1 ? 'about an hour' : `about ${h} hours`} left in it).` : 'The fire is out.');
  const w = Math.round(camp.wood / BURN_KG_H);
  out.push(camp.wood >= 0.5 ? `Wood stacked: ${w <= 1 ? 'about an hour' : `about ${w} hours`} of fire.` : 'No wood stacked.');
  out.push(camp.shelter ? `Shelter: ${SHELTERS[camp.shelter.kind].name}.` : 'No shelter.');
  if (camp.snares.length) out.push(`${camp.snares.length} ${camp.snares.length === 1 ? 'snare' : 'snares'} set about the camp.`);
  return out;
}

/** Metres from the wanderer to a camp. */
export const campDistance = (g: Game, camp: CampData) => Math.round(Math.hypot(camp.x - g.px, camp.y - g.py) * TILE_M);
