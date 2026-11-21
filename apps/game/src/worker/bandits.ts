/**
 * Robber bands in the wilds (docs/design/combat.md, stage 4; decided: bands in the wilds). Small
 * bands camp away from the towns, more where the nearest town is lawless or poor, and more by the
 * roads, where travellers pass. Each band holds its camp for a week, then moves on (or is gone).
 *
 * The country is cut into band cells (three chunks square); each week each cell may hold a band,
 * with a chance from its danger (banditry(); world/bands.ts). The same world, cell and week always give the same
 * band in the same camp. They are met on foot in the bubble (world/strife.ts: they see the
 * wanderer and come to rob them), and as ambushes on the road (game/justice.ts, from each route
 * step's danger).
 *
 * Proposed numbers, to tune in play.
 */
import type { GeneratedWorld } from '@worldforge/core/gen/world';
import { CHUNK, TILE_M, type LocalWorld } from '@worldforge/core/local/chunk';
import { townContext } from '@worldforge/core/people/town-context';
import { CULTURES } from '@worldforge/core/names/cultures';
import { personName } from '@worldforge/core/lore/names';
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import { BAND_CELL, bandId, bandRoll } from '../rules/bands';
import { cultureOf } from './catalogue';
import { lookFor, openGround } from './people';
import type { PlacedPerson, PlanStop, Spot } from './protocol';

/** The chance of a band in a cell in a week, at the usual danger. */
const BASE = 0.02;
/** How far (m) the watch of a town or city keep the roads clear, and a village's folk. */
const TOWN_CLEAR = 1500, VILLAGE_CLEAR = 600;
/** How far (m) a town's lawlessness reaches into the country about it. */
const TOWN_REACH = 25000;

const memo = new Map<string, number>();
let memoFor: LocalWorld | null = null;

/**
 * The chance of a robber band camped in a band cell in any week (0 to 0.6): none near a town or
 * a village; more as the nearest town is lawless, and in the wilds far from any; more by a road.
 * `way` is the travel grid's way through the cell's middle chunk ('road', 'track', or none).
 */
export function banditry(w: GeneratedWorld, local: LocalWorld, bx: number, by: number, way?: string): number {
  if (memoFor !== local) {
    memo.clear();
    memoFor = local;
  }
  const key = `${bx},${by},${way ?? ''}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const mx = (bx + 0.5) * BAND_CELL * CHUNK * TILE_M, my = -(by + 0.5) * BAND_CELL * CHUNK * TILE_M;
  let p = 0;
  const near = local.sitesNear(mx, my, mx, my, TOWN_CLEAR);
  const clear = near.some((s) => {
    const c = local.frame.fromLL(s.lon, s.lat);
    const d = Math.hypot(c[0] - mx, c[1] - my) - s.radiusM;
    return d < (s.tier === 'village' ? VILLAGE_CLEAR : TOWN_CLEAR);
  });
  if (!clear) {
    // The nearest town or city within reach: its lawlessness (crime, 0 to 100) spills over.
    let best: { d: number; crime: number; poor: number } | null = null;
    for (const s of local.sitesNear(mx, my, mx, my, TOWN_REACH)) {
      if (s.tier === 'village' || !w.settlements.some((x) => x.id === s.id)) continue;
      const c = local.frame.fromLL(s.lon, s.lat);
      const d = Math.hypot(c[0] - mx, c[1] - my);
      if (best && best.d <= d) continue;
      try {
        const st = townContext(w, s.id).stats;
        best = { d, crime: st.crime.value, poor: st.prosperity.value };
      } catch {
        best = { d, crime: 30, poor: 50 };
      }
    }
    const lawless = best ? 0.4 + best.crime / 50 + Math.max(0, 45 - best.poor) / 60 : 0.8;
    const road = way === 'road' ? 1.6 : way === 'track' ? 1.2 : 0.7;
    p = Math.min(0.6, BASE * lawless * road);
  }
  memo.set(key, p);
  return p;
}

/** The robbers camped within `radius` tiles of (x, y) in the week of `time`. */
export function banditsIn(w: GeneratedWorld, local: LocalWorld, x: number, y: number, radius: number, time: number, wayAt?: (cx: number, cy: number) => string | undefined, ambush?: [number, number]): PlacedPerson[] {
  const seed = w.raster.seed, week = Math.floor(time / (7 * 86400));
  const S = BAND_CELL * CHUNK, out: PlacedPerson[] = [];
  for (let by = Math.floor((y - radius) / S); by <= Math.floor((y + radius) / S); by++) for (let bx = Math.floor((x - radius) / S); bx <= Math.floor((x + radius) / S); bx++) {
    const mid = [bx * BAND_CELL + 1, by * BAND_CELL + 1];
    const p = banditry(w, local, bx, by, wayAt?.(mid[0], mid[1]));
    if (p <= 0) continue;
    const { here, r } = bandRoll(seed, bx, by, week, p);
    if (!here) continue;
    // Lying in wait for the wanderer on the road (game/justice.ts): they wait beside them, not at the camp.
    const waiting = ambush && ambush[0] === bx && ambush[1] === by;
    const camp = waiting ? coverNear(local, x, y, r) : campIn(local, bx, by, r);
    if (!camp || (!waiting && Math.max(Math.abs(camp.x - x), Math.abs(camp.y - y)) > radius + 16)) continue;
    out.push(...band(w, local, bandId(bx, by, week), camp));
  }
  return out;
}

/** A camp: open ground in the cell, off any made way. */
function campIn(local: LocalWorld, bx: number, by: number, r: () => number): Spot | null {
  const S = BAND_CELL * CHUNK;
  for (let i = 0; i < 40; i++) {
    const tx = bx * S + 8 + Math.floor(r() * (S - 16)), ty = by * S + 8 + Math.floor(r() * (S - 16));
    if (openGround(local, tx, ty) && openGround(local, tx + 1, ty) && openGround(local, tx, ty + 1)) return { x: tx, y: ty, z: null };
  }
  return null;
}

/** Open ground a few tiles from the wanderer, where a band lies in wait. */
function coverNear(local: LocalWorld, x: number, y: number, r: () => number): Spot | null {
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2, d = 5 + r() * 4;
    const tx = Math.round(x + Math.cos(a) * d), ty = Math.round(y + Math.sin(a) * d);
    if (openGround(local, tx, ty)) return { x: tx, y: ty, z: null };
  }
  return null;
}

/** A band of two to five, by the camp: a chief and the rest, of the land's people. */
function band(w: GeneratedWorld, local: LocalWorld, id: string, camp: Spot): PlacedPerson[] {
  // Its own draw, so the band is the same people at the camp or lying in wait.
  const r = mulberry32(hashString(`${w.raster.seed}#${id}#folk`));
  const [lon, lat] = local.frame.toLL([(camp.x + 0.5) * TILE_M, -(camp.y + 0.5) * TILE_M]);
  const ci = cultureOf(w, { lon, lat }) ?? 0;
  const n = 2 + Math.floor(r() * 4);
  const out: PlacedPerson[] = [];
  const taken = new Set<string>();
  let chief = '';
  for (let i = 0; i < n; i++) {
    let at: Spot = camp;
    for (let k = 0; k < 20; k++) {
      const t = { x: camp.x + Math.round((r() - 0.5) * 8), y: camp.y + Math.round((r() - 0.5) * 8), z: null };
      if (!taken.has(`${t.x},${t.y}`) && openGround(local, t.x, t.y)) {
        at = t;
        break;
      }
    }
    taken.add(`${at.x},${at.y}`);
    const female = r() < 0.12;
    const nm = personName(ci, female, r);
    if (!i) chief = nm.given;
    out.push(robber(w.raster.seed, `${id}#${i}`, nm, female, 17 + Math.floor(r() * 28), ci, i === 0 ? 'robber chief' : 'robber', `the band of ${chief}`, id, at, r));
  }
  return out;
}

function robber(seed: string, id: string, nm: { given: string; full: string }, female: boolean, age: number, ci: number, trade: string, household: string, homeId: string, at: Spot, r: () => number): PlacedPerson {
  // The day: sleeping at the camp by night, idling about it by day (and watching the road).
  const plan: PlanStop[] = [
    { from: 0, to: 6, act: 'sleep', place: 'bed', at },
    { from: 6, to: 22, act: 'leisure', place: 'out', at },
    { from: 22, to: 24, act: 'sleep', place: 'bed', at },
  ];
  return {
    id, name: nm.full, given: nm.given, female, age, culture: ci, people: CULTURES[ci]?.people ?? 'unknown folk', trade, role: 'head', traits: r() < 0.3 ? ['Wrathful'] : [],
    means: 'poor', household, homeId, homeName: 'a robbers\' camp', ties: [], template: 'bandit', day: 0, plan, home: at, at, facing: 's',
    look: lookFor(seed, ci, { female, age }, 'rough', r),
  };
}
