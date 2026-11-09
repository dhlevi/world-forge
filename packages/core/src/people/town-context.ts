import type { Settlement } from '../gen/settlements';
import { chainOf } from '../gen/politics';
import { realmDetails } from '../lore/realm';
import { worldThemes } from '../lore/themes';
import { type TownCtx, type TownStats, townStats } from './town';
import { townMix } from './residents';
import { type WorldData, worldLore } from '../lore/current';

/**
 * The context a town's life is worked out from (people/town.ts): its people and the peoples
 * about it, its theme, realm, wars and trade, from the world and its lore. Kept per settlement.
 */
const cache = new Map<string, { ctx: TownCtx; stats: TownStats }>();
let cacheWorld: unknown = null;

function cellOf(W: number, H: number, lon: number, lat: number): number {
  const i = ((Math.floor(((lon + 180) / 360) * W) % W) + W) % W, j = Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H)));
  return j * W + i;
}

/** The peoples of the lands about a place, the most common first (its own excluded). */
function nearPeoples(w: WorldData, lon: number, lat: number, reachDeg: number, own: number): number[] {
  const { W, H, culture, height } = w.raster;
  const count = new Map<number, number>();
  for (const f of [0.35, 0.7, 1]) {
    for (let a = 0; a < 16; a++) {
      const t = (a / 16) * Math.PI * 2;
      const x = lon + (Math.cos(t) * reachDeg * f) / Math.max(0.2, Math.cos((lat * Math.PI) / 180)), y = lat + Math.sin(t) * reachDeg * f;
      const c = cellOf(W, H, x, y);
      if (height[c] <= 0) continue;
      const cu = culture[c];
      if (cu === own) continue;
      count.set(cu, (count.get(cu) ?? 0) + 1 / f);
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
}

/** A settlement of the world map, or a village (known only by its plan), as a town context. */
export function townContext(
  w: WorldData, sid: string,
  village?: { lon: number; lat: number; kind: string; population?: number; name?: string },
): { ctx: TownCtx; stats: TownStats } {
  if (cacheWorld !== w) {
    cache.clear();
    cacheWorld = w;
  }
  const hit = cache.get(sid);
  if (hit) return hit;
  const s: Settlement | undefined = w.settlements.find((q) => q.id === sid);
  const lon = s?.lon ?? village?.lon ?? 0, lat = s?.lat ?? village?.lat ?? 0;
  const c = cellOf(w.raster.W, w.raster.H, lon, lat);
  const own = s?.culture ?? w.raster.culture[c];
  const P = w.politics;
  const chain = chainOf(P.units, P.baronyOf[cellOf(P.W, P.H, lon, lat)]);
  const top = chain.find((u) => u.parent < 0) ?? chain[chain.length - 1];
  const lore = worldLore(w);
  const th = lore && s ? worldThemes(lore, w.raster.seed) : null;
  const tier = s?.tier ?? 'village';
  const population = s?.population ?? village?.population ?? 150;
  const coastal = s?.coastal ?? false;
  const near = nearPeoples(w, lon, lat, tier === 'city' ? 2.2 : tier === 'town' ? 1.4 : 0.8, own);
  // The rulers' own people live in their towns too.
  if (top && top.culture !== own && !near.includes(top.culture)) near.unshift(top.culture);
  const atWar = !!(lore && top && lore.L.wars.some((x) => x.end === undefined && (x.attackers.includes(top.id) || x.defenders.includes(top.id))));
  let economy: TownCtx['economy'];
  if (lore && top) {
    try {
      const e = realmDetails(lore, top.id).economy;
      economy = { special: e.special, exports: e.exports, imports: e.imports, coin: e.coin, word: e.word };
    } catch {
      economy = undefined;
    }
  }
  const ctx: TownCtx = {
    seed: w.raster.seed, id: sid, name: s?.name ?? village?.name ?? '', tier, kind: s?.kind ?? village?.kind, population, coastal, river: s?.river ?? false,
    walls: s?.walls ?? false, culture: own, minorities: townMix(tier, population, coastal, own, near), theme: th?.themes.get(sid)?.theme, holy: !!th?.holy.get(sid),
    atWar, gov: top?.gov ?? 'none', capital: chain.some((u) => u.seat === sid && u.level >= 2), koppen: w.raster.koppen[c],
    roads: s ? w.roads.features.filter((f) => f.properties.a === sid || f.properties.b === sid).length : 0,
    university: s?.university, prison: !!s?.prison, delve: s?.delve, economy,
  };
  const out = { ctx, stats: townStats(ctx) };
  cache.set(sid, out);
  return out;
}
