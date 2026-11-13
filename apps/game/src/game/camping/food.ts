/** Food from the land: foraging and snares. */
import { check, DC, type Grade } from '../../actors/checks';
import { Skills } from '../../actors/components';
import { itemName, makeItem } from '../../actors/items/item';
import { campable, type CampData } from '../camp';
import type { Game } from '../game';
import { OBJECT_TILES } from '@worldforge/core/local/tiles';
import { done, give, inv, pass, type CampCtx, type Result } from './context';

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
