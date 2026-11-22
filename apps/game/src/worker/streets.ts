/**
 * The people of the streets who belong to no house there (docs/backlog.md, N3 and N4), by the
 * town's figures (core people/town.ts): passers-by going about the town by day (more in a larger
 * and busier place); beggars at the market, the temple steps and the squares, who sleep rough in
 * the streets at night (more where the town is poor); cutpurses working the crowds by day; and
 * brigands lurking in the streets after dark where the town is lawless.
 *
 * Each is placed on the town's open ground (streets, squares, the market) within the bubble, with a
 * day's plan of a few places. The same town, day and place always give the same people.
 *
 * Proposed numbers, to tune in play.
 */
import type { GeneratedWorld } from '@worldforge/core/gen/world';
import { CHUNK, TILE_M, type LocalWorld } from '@worldforge/core/local/chunk';
import { GROUND_TILES } from '@worldforge/core/local/tiles';
import { townContext } from '@worldforge/core/people/town-context';
import { CULTURES } from '@worldforge/core/names/cultures';
import { personName } from '@worldforge/core/lore/names';
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import { cultureOf } from './catalogue';
import { lookFor, openGround } from './people';
import type { PlacedPerson, PlanStop, Spot } from './protocol';

/** Ground of the streets and squares. */
const STREET = new Set(['cobbles', 'flagstones', 'road', 'street', 'path', 'track', 'lawn', 'dirt']);

/** How many of each are out in a bubble of a town, at most. */
const MAX = { passers: 26, beggars: 8, cutpurses: 3, brigands: 4 };

/** Open street tiles in the bubble about (x, y): a sample, in a fixed order. */
function streetsNear(local: LocalWorld, x: number, y: number, radius: number, r: () => number, n: number): Spot[] {
  const out: Spot[] = [];
  for (let tries = 0; tries < n * 12 && out.length < n; tries++) {
    const tx = Math.round(x + (r() * 2 - 1) * radius), ty = Math.round(y + (r() * 2 - 1) * radius);
    const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
    const k = (ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK);
    const g = GROUND_TILES[local.chunk(cx, cy).ground[k]]?.name ?? '';
    if (STREET.has(g) && openGround(local, tx, ty)) out.push({ x: tx, y: ty, z: null });
  }
  return out;
}

/** The street folk of the town or city about (x, y) at a time; none in the wilds or a village. */
export function streetFolkIn(w: GeneratedWorld, local: LocalWorld, x: number, y: number, radius: number, time: number): PlacedPerson[] {
  const mx = (x + 0.5) * TILE_M, my = -(y + 0.5) * TILE_M;
  const town = local.sitesNear(mx, my, mx, my, 0).find((s) => s.tier === 'town' || s.tier === 'city');
  if (!town || town.delve || !w.settlements.some((s) => s.id === town.id)) return [];
  let crime = 30, prosperity = 50;
  try {
    const st = townContext(w, town.id).stats;
    crime = st.crime.value;
    prosperity = st.prosperity.value;
  } catch {
    // The usual figures.
  }
  const seed = w.raster.seed, day = Math.floor(time / 86400), hour = (time % 86400) / 3600;
  // The bubble's own draw, by the town, the day and a coarse place (so it does not change with every step).
  const cell = `${Math.floor(x / 64)},${Math.floor(y / 64)}`;
  const r = mulberry32(hashString(`${seed}#streets#${town.id}#${day}#${cell}`));
  const spots = streetsNear(local, x, y, radius, r, 120);
  if (spots.length < 8) return [];
  const ci = cultureOf(w, town) ?? 0;
  const busy = town.tier === 'city' ? 1 : 0.6;
  const poor = Math.max(0, (60 - prosperity) / 60), lawless = Math.max(0, (crime - 35) / 65);
  const count = {
    passers: Math.round(MAX.passers * busy),
    beggars: Math.round(MAX.beggars * (0.2 + poor) * busy),
    cutpurses: Math.round(MAX.cutpurses * Math.min(1, crime / 60) * busy),
    brigands: crime >= 50 ? Math.max(1, Math.round(MAX.brigands * lawless)) : 0,
  };
  const pick = () => spots[Math.floor(r() * spots.length) % spots.length];
  const out: PlacedPerson[] = [];
  const taken = new Set<string>();
  const make = (kind: keyof typeof count, i: number, trade: string, template: string, means: PlacedPerson['means'], plan: PlanStop[], dress: 'plain' | 'rough') => {
    const female = kind === 'brigands' ? r() < 0.1 : r() < 0.45;
    const nm = personName(ci, female, r);
    const age = kind === 'beggars' ? 14 + Math.floor(r() * 60) : 16 + Math.floor(r() * 44);
    const now = plan.find((s) => hour >= s.from && hour < s.to) ?? plan[0];
    let at = now.at;
    if (at && taken.has(`${at.x},${at.y}`)) at = spots.find((s) => !taken.has(`${s.x},${s.y}`)) ?? null;
    if (at) taken.add(`${at.x},${at.y}`);
    out.push({
      id: `street:${town.id}:${day}:${cell}:${kind}:${i}`, name: nm.full, given: nm.given, female, age, culture: ci, people: CULTURES[ci]?.people ?? 'unknown folk',
      trade, role: 'head', traits: kind === 'brigands' && r() < 0.4 ? ['Wrathful'] : [], means, household: kind === 'passers' ? `a household of ${town.name ?? 'the town'}` : 'no household',
      homeId: kind === 'brigands' ? `brigands:${town.id}:${day}` : `street:${town.id}`, homeName: kind === 'passers' ? `a house in ${town.name ?? 'the town'}` : 'the streets', ties: [],
      template, day, plan, home: plan[0].at ?? pick(), at, facing: 's', look: lookFor(seed, ci, { female, age }, dress, r),
    });
  };
  const stop = (from: number, to: number, act: PlanStop['act'], place: PlanStop['place'], at: Spot | null): PlanStop => ({ from, to, act, place, at });
  // Passers-by: about the town by day, from place to place each hour or so; at home (away) by night.
  for (let i = 0; i < count.passers; i++) {
    const plan: PlanStop[] = [stop(0, 7 + Math.floor(r() * 2), 'home', 'home', null)];
    for (let h = plan[0].to; h < 19; h += 1 + Math.floor(r() * 2)) plan.push(stop(h, Math.min(19, h + 1 + Math.floor(r() * 2)), 'errand', 'out', pick()));
    plan.push(stop(plan[plan.length - 1].to, 24, 'home', 'home', null));
    make('passers', i, 'townsfolk', 'idle', 'middling', plan.filter((s) => s.to > s.from), 'plain');
  }
  // Beggars: at their begging spot by day, moving once at midday; sleeping rough where they begged.
  for (let i = 0; i < count.beggars; i++) {
    const a = pick(), b = pick();
    make('beggars', i, r() < 0.3 ? 'vagrant' : 'beggar', 'beggar', 'destitute', [stop(0, 7, 'sleep', 'bed', a), stop(7, 12, 'work', 'out', a), stop(12, 18, 'work', 'out', b), stop(18, 24, 'sleep', 'bed', b)], 'rough');
  }
  // Cutpurses: in the busy streets by day, and away by night.
  for (let i = 0; i < count.cutpurses; i++) {
    const plan: PlanStop[] = [stop(0, 9, 'home', 'home', null)];
    for (let h = 9; h < 18; h += 2) plan.push(stop(h, h + 2, 'work', 'out', pick()));
    plan.push(stop(18, 24, 'home', 'home', null));
    make('cutpurses', i, 'cutpurse', 'thief', 'poor', plan, 'plain');
  }
  // Brigands: out after dark in a lawless town, lurking in the streets; gone by day.
  for (let i = 0; i < count.brigands; i++) {
    const a = pick(), b = pick();
    make('brigands', i, 'brigand', 'bandit', 'poor', [stop(0, 3, 'work', 'out', a), stop(3, 21, 'home', 'home', null), stop(21, 24, 'work', 'out', b)], 'rough');
  }
  return out;
}
