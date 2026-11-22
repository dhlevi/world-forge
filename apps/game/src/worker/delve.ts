/**
 * The people of a delve (docs/backlog.md, D1): a dwarven city is a gate on the mountainside and
 * halls dug below it (core towns/manager.ts, local/under.ts), and the halls are not buildings of a
 * plan, so worker/people.ts places nobody there. Here the halls' rooms are read from the local
 * map's layers (their names, "…: clan home", "…: forge"), each clan home is given a household,
 * and each grown member a trade by the workplaces the halls have: smiths at the forges, smelters,
 * merchants in the market hall, brewers, alehouse keepers, wardens in the barracks and the gate
 * hall, priests at the shrines, stablehands. Their day is home, work, a meal in the great hall or
 * the alehouse, an evening there or at home, and bed; some smiths keep the forges by night.
 *
 * The same world, delve and day always give the same people in the same places. Only the rooms
 * within the bubble's reach are read, and only when a delve is near.
 *
 * Proposed numbers, to tune in play.
 */
import type { GeneratedWorld } from '@worldforge/core/gen/world';
import { CHUNK, TILE_M, type LocalWorld } from '@worldforge/core/local/chunk';
import { GROUND_TILES, OBJECT_TILES } from '@worldforge/core/local/tiles';
import { CULTURES } from '@worldforge/core/names/cultures';
import { personName } from '@worldforge/core/lore/names';
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import { cultureOf } from './catalogue';
import { lookFor } from './people';
import type { PlacedPerson, PlanStop, Spot } from './protocol';

/** A room of the halls: its kind (from its name), its tiles, and its beds. */
interface Room {
  key: string;
  kind: string;
  tiles: Spot[];
  beds: Spot[];
}

/** The rooms' names (after the delve's own name) and the kind of place each is. */
const KINDS: [RegExp, string][] = [
  [/: clan home$/, 'home'], [/: forge$/, 'forge'], [/: smelter$/, 'smelter'], [/: market hall$/, 'market'],
  [/: alehouse$/, 'tavern'], [/: brewery$/, 'brewery'], [/: wardens' barracks$/, 'barracks'], [/: gate hall$/, 'gatehall'],
  [/: (great hall|clan hall|moot hall|king's hall)$/, 'hall'], [/: (hall of the ancestors|ancestor shrine)$/, 'shrine'],
  [/: pony stables$/, 'stable'], [/: armoury$/, 'armoury'], [/: store(room)?$/, 'store'],
];

/** Trades by the workplace they need, with how many of a household's grown members may take each (a weight). */
const TRADES: { trade: string; at: string[]; weight: number; template: string }[] = [
  { trade: 'smith', at: ['forge'], weight: 5, template: 'craft' },
  { trade: 'smelter', at: ['smelter'], weight: 2, template: 'craft' },
  { trade: 'armourer', at: ['armoury'], weight: 1, template: 'craft' },
  { trade: 'merchant', at: ['market'], weight: 2, template: 'merchant' },
  { trade: 'brewer', at: ['brewery'], weight: 1, template: 'craft' },
  { trade: 'alehouse keeper', at: ['tavern'], weight: 1, template: 'inn' },
  { trade: 'warden', at: ['barracks', 'gatehall'], weight: 2, template: 'guard' },
  { trade: 'priest of the ancestors', at: ['shrine'], weight: 1, template: 'priest' },
  { trade: 'stablehand', at: ['stable'], weight: 1, template: 'labour' },
  { trade: 'porter', at: ['store', 'market'], weight: 1, template: 'labour' },
];

/** At most so many of the halls' people in one bubble. */
const MAX_FOLK = 140;

/** The rooms of the halls within `radius` tiles of (x, y), read from the chunks' layers (one room per connected area of a name, per chunk). */
function roomsNear(local: LocalWorld, x: number, y: number, radius: number): Room[] {
  const out: Room[] = [];
  for (let cy = Math.floor((y - radius) / CHUNK); cy <= Math.floor((y + radius) / CHUNK); cy++) for (let cx = Math.floor((x - radius) / CHUNK); cx <= Math.floor((x + radius) / CHUNK); cx++) {
    const c = local.chunk(cx, cy);
    for (const L of c.layers) {
      const seen = new Uint8Array(CHUNK * CHUNK);
      for (let k = 0; k < CHUNK * CHUNK; k++) {
        if (seen[k] || !L.ground[k]) continue;
        const label = c.areas[L.area[k]] ?? '';
        const kind = KINDS.find(([re]) => re.test(label))?.[1];
        if (!kind) continue;
        // The connected tiles of this area: one room.
        const a = L.area[k], tiles: Spot[] = [], beds: Spot[] = [];
        const stack = [k];
        seen[k] = 1;
        while (stack.length) {
          const q = stack.pop()!;
          const qx = q % CHUNK, qy = Math.floor(q / CHUNK);
          const o = OBJECT_TILES[L.object[q]];
          const tile = { x: cx * CHUNK + qx, y: cy * CHUNK + qy, z: L.z };
          if (o?.name.includes('bed')) beds.push(tile);
          else if (GROUND_TILES[L.ground[q]]?.pass && (!L.object[q] || (o?.pass && !/^(stairs|ladder)/.test(o.name)))) tiles.push(tile);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = qx + dx, ny = qy + dy;
            if (nx < 0 || ny < 0 || nx >= CHUNK || ny >= CHUNK) continue;
            const n = ny * CHUNK + nx;
            if (!seen[n] && L.ground[n] && L.area[n] === a) {
              seen[n] = 1;
              stack.push(n);
            }
          }
        }
        if (tiles.length) out.push({ key: `${cx},${cy},${L.z},${k}`, kind, tiles, beds });
      }
    }
  }
  return out;
}

const spotKey = (t: Spot) => `${t.x},${t.y},${t.z ?? 'g'}`;

/** The people of the delve halls about (x, y) at a time, placed by their day plans; none if no delve is near. */
export function delveFolkIn(w: GeneratedWorld, local: LocalWorld, x: number, y: number, radius: number, time: number): PlacedPerson[] {
  const mx = (x + 0.5) * TILE_M, my = -(y + 0.5) * TILE_M;
  const delve = local.sitesNear(mx, my, mx, my, 1500).find((s) => s.delve);
  if (!delve) return [];
  const rooms = roomsNear(local, x, y, radius + 32);
  const homes = rooms.filter((r) => r.kind === 'home');
  if (!homes.length) return [];
  const seed = w.raster.seed, day = Math.floor(time / 86400), hour = (time % 86400) / 3600;
  const ci = cultureOf(w, delve) ?? 0;
  const byKind = new Map<string, Room[]>();
  for (const r of rooms) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
  const mid = (r: Room) => r.tiles[Math.floor(r.tiles.length / 2)];
  /** The room of some kinds nearest a home (on any level). */
  const nearest = (from: Room, kinds: string[]): Room | null => {
    const m = mid(from);
    let best: Room | null = null, bd = Infinity;
    for (const k of kinds) for (const r of byKind.get(k) ?? []) {
      const t = mid(r), d = Math.abs(t.x - m.x) + Math.abs(t.y - m.y) + Math.abs((t.z ?? 0) - (m.z ?? 0)) * 20;
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  };
  const trades = TRADES.filter((t) => t.at.some((k) => byKind.has(k)));
  const out: PlacedPerson[] = [];
  const taken = new Set<string>();
  // The homes nearest the wanderer first (so the cap leaves out the farthest), ties by their key.
  const dist = (h: Room) => Math.abs(mid(h).x - x) + Math.abs(mid(h).y - y);
  for (const home of homes.sort((a, b) => dist(a) - dist(b) || (a.key < b.key ? -1 : 1))) {
    if (out.length >= MAX_FOLK) break;
    const r = mulberry32(hashString(`${seed}#delvehome#${home.key}`));
    const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length) % xs.length];
    const spotIn = (room: Room | null): Spot | null => (room ? pick(room.tiles) : null);
    const grown = 1 + Math.floor(r() * 3), young = r() < 0.4 ? 1 + Math.floor(r() * 2) : 0;
    const head = personName(ci, false, r);
    const household = `the house of ${head.full}`;
    const hall = nearest(home, ['hall', 'tavern']) ?? home, tavern = nearest(home, ['tavern', 'hall']) ?? hall;
    for (let i = 0; i < grown + young && out.length < MAX_FOLK; i++) {
      const child = i >= grown, female = i === 0 ? false : r() < 0.45;
      const nm = i === 0 ? head : personName(ci, female, r);
      // Dwarves are long-lived: most grown ones between 20 and 70, one in five older still.
      const age = child ? 5 + Math.floor(r() * 10) : 20 + Math.floor(r() * (r() < 0.2 ? 140 : 50));
      const job = child || !trades.length ? null : pickTrade(trades, r);
      const work = job ? nearest(home, job.at) : null;
      const bed = home.beds.length ? pick(home.beds) : pick(home.tiles);
      const seat = pick(home.tiles);
      const night = job?.trade === 'smith' && r() < 0.3, wardenNight = job?.trade === 'warden' && r() < 0.35;
      const wake = 6 + Math.floor(r() * 2);
      const stop = (from: number, to: number, act: PlanStop['act'], place: PlanStop['place'], at: Spot | null): PlanStop => ({ from, to, act, place, at });
      let plan: PlanStop[];
      if (job && work && (night || wardenNight)) {
        // The forges never go cold, and the gate is never unwatched: a night's work, a day's sleep.
        plan = [stop(0, 5, 'work', 'work', spotIn(work)), stop(5, 6, 'meal', 'tavern', spotIn(tavern)), stop(6, 14, 'sleep', 'bed', bed), stop(14, 18, 'home', 'home', seat),
          stop(18, 20, 'meal', 'table', seat), stop(20, 24, 'work', 'work', spotIn(work))];
      } else if (job && work) {
        const evening = r() < 0.5 ? stop(18, 21, 'leisure', 'tavern', spotIn(tavern)) : stop(18, 21, 'home', 'home', seat);
        plan = [stop(0, wake, 'sleep', 'bed', bed), stop(wake, wake + 1, 'meal', 'table', seat), stop(wake + 1, 12, 'work', 'work', spotIn(work)),
          stop(12, 13, 'meal', 'square', spotIn(hall)), stop(13, 18, 'work', 'work', spotIn(work)), evening, stop(21, 22, 'home', 'home', seat), stop(22, 24, 'sleep', 'bed', bed)];
      } else {
        // Children and the old: home, and the great hall by day.
        plan = [stop(0, 7, 'sleep', 'bed', bed), stop(7, 8, 'meal', 'table', seat), stop(8, 12, 'leisure', 'square', spotIn(hall)), stop(12, 13, 'meal', 'table', seat),
          stop(13, 17, 'leisure', 'square', spotIn(hall)), stop(17, 21, 'home', 'home', seat), stop(21, 24, 'sleep', 'bed', bed)];
      }
      const id = `delve:${home.key}#${i}`;
      const now = plan.find((s) => hour >= s.from && hour < s.to) ?? plan[0];
      let at = now.at;
      if (at && taken.has(spotKey(at))) {
        const room = rooms.find((rm) => rm.tiles.some((t) => t.x === at!.x && t.y === at!.y && t.z === at!.z) || rm.beds.some((t) => t.x === at!.x && t.y === at!.y && t.z === at!.z));
        at = room?.tiles.find((t) => !taken.has(spotKey(t))) ?? null;
      }
      if (at) taken.add(spotKey(at));
      out.push({
        id, name: nm.full, given: nm.given, female, age, culture: ci, people: CULTURES[ci]?.people ?? 'unknown folk',
        trade: child ? 'child' : job?.trade ?? 'elder', role: i === 0 ? 'head' : child ? 'child' : 'member', traits: [], means: 'middling',
        household, homeId: `delve:${home.key}`, homeName: `a clan home of ${delve.name ?? 'the delve'}`, ties: [],
        template: child ? 'child' : job?.template ?? 'elder', day, plan, home: seat, at, facing: (['n', 'e', 's', 'w'] as const)[Math.floor(r() * 4) % 4],
        look: lookFor(seed, ci, { female, age }, 'plain', r),
      });
    }
  }
  return out;
}

/** A trade for a grown member, by the weights of those the halls have room for. */
function pickTrade(trades: typeof TRADES, r: () => number): (typeof TRADES)[number] {
  const total = trades.reduce((s, t) => s + t.weight, 0);
  let x = r() * total;
  for (const t of trades) if ((x -= t.weight) < 0) return t;
  return trades[0];
}
