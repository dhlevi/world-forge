import { Biome } from '../gen/biomes';
import { hashString, mulberry32 } from '../gen/rng';
import type { Settlement } from '../gen/settlements';
import { CULTURES } from '../names/cultures';
import { templateFolk } from '../names/bundles';
import type { Ctx } from './realm';

/**
 * City themes and holy places, decided from the world's lore so they fit it: a city may take one
 * theme from its realm, culture, ground and trade (a merchant city in a rich seafaring republic, a
 * forge city among the mines, a fortress city on a war front), and the faiths' holy places are
 * found on the ground (holy towns, and the peaks, lakes, groves and isles where shrines stand).
 * Built once per world from the lore context, in the main thread (for titles) and in the towns
 * worker (for the plans), with the same result in both.
 */
export type CityTheme = 'merchant' | 'canal' | 'thieves' | 'mages' | 'forge' | 'fortress' | 'pilgrim' | 'rebuilt';

export const THEME_LABEL: Record<CityTheme, string> = {
  merchant: 'a merchant city', canal: 'a city of canals', thieves: 'a thieves\' city', mages: 'a city of mages',
  forge: 'a forge city', fortress: 'a fortress city', pilgrim: 'a pilgrim city', rebuilt: 'a city rebuilt',
};

/** Why a city has its theme, for its title ("rebuilt after the War of Varsk"). */
export interface ThemeOf {
  theme: CityTheme;
  why: string;
}

/** A holy place in a town or city: what makes it holy, and the faith that keeps it. */
export interface HolyTown {
  faith: string;
  what: string;
  /** A New World people's holy town: a step pyramid (sun and serpent cults) or a ring of totems. */
  nw?: 'pyramid' | 'totems';
}

/** A holy place out in the land: a shrine on a holy peak, by a sacred lake, in a grove or on an isle. */
export interface NaturalShrine {
  id: string;
  name: string;
  faith: string;
  what: string;
  lon: number;
  lat: number;
  /** The feature it honours: peak, mountains, lake, forest or island. */
  feature: string;
  /** In the New World: a totem circle or a step pyramid; otherwise a chapel, standing stones or a hermitage. */
  style: 'chapel' | 'stones' | 'hermitage' | 'totems' | 'pyramid';
  culture: number;
  seed: number;
}

export interface WorldThemes {
  themes: Map<string, ThemeOf>;
  holy: Map<string, HolyTown>;
  shrines: NaturalShrine[];
}

const cache = new WeakMap<object, WorldThemes>();
const PYRAMID = new Set(['jungle', 'highland', 'lizardfolk']);

const distKm = (a: number, b: number, c: number, d: number) => {
  const dl = ((((c - a) % 360) + 540) % 360) - 180;
  return Math.hypot(dl * 111.32 * Math.cos((((b + d) / 2) * Math.PI) / 180), (d - b) * 110.57);
};

export function worldThemes(c: Ctx, seed: string): WorldThemes {
  const hit = cache.get(c.L);
  if (hit) return hit;
  const { L, p, units, settlements } = c;
  const { W, H, baronyOf } = p;
  const cellOf = (lon: number, lat: number) => {
    const i = ((Math.floor(((lon + 180) / 360) * W) % W) + W) % W, j = Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H)));
    return j * W + i;
  };
  const baronyAt = (s: { lon: number; lat: number }) => baronyOf[cellOf(s.lon, s.lat)];
  const tpl = (ci: number) => CULTURES[ci]?.id ?? 'anglo';
  const has = (ci: number, k: string) => CULTURES[ci]?.ethos === k || !!CULTURES[ci]?.traditions.includes(k);
  const seedKey = seed;

  // ---- Holy towns and natural shrines ---------------------------------------------------------
  const holy = new Map<string, HolyTown>();
  const shrines: NaturalShrine[] = [];
  const byName = new Map<string, Settlement[]>();
  for (const s of settlements) if (s.name && s.tier !== 'village') (byName.get(s.name) ?? byName.set(s.name, []).get(s.name)!).push(s);
  for (const f of L.faiths.faiths) {
    if (!f.cultures.length && !f.former.length) continue;
    for (const h of f.holySites) {
      const town = (byName.get(h.name) ?? []).find((s) => distKm(s.lon, s.lat, h.lon, h.lat) < 60);
      if (town) {
        if (holy.has(town.id)) continue;
        const ci = town.culture ?? 0;
        holy.set(town.id, { faith: f.name, what: h.what, ...(town.newWorld && !town.colony ? { nw: PYRAMID.has(tpl(ci)) ? 'pyramid' : 'totems' } : {}) });
        continue;
      }
      // A natural holy place: what kind of feature, from the words used of it.
      const feature = /mountains/.test(h.what) ? 'mountains' : /lake/.test(h.what) ? 'lake' : /forest|grove/.test(h.what) ? 'forest'
        : /isle|island/.test(h.what) ? 'island' : /mountain|peak|fasted|received/.test(h.what) ? 'peak' : '';
      if (!feature) continue;
      const b = baronyAt(h);
      const ci = b >= 0 ? units[b].culture : f.cultures[0] ?? 0;
      const nw = b >= 0 ? units[b].nw : !!CULTURES[ci]?.nw;
      const r = mulberry32(hashString(`${seedKey}#shrine#${f.id}#${h.name}`));
      const mono = f.family === 'church' || f.family === 'crescent';
      const style: NaturalShrine['style'] = nw ? (PYRAMID.has(tpl(ci)) ? 'pyramid' : 'totems')
        : mono ? (feature === 'peak' || feature === 'island' || r() < 0.4 ? 'hermitage' : 'chapel')
          : r() < 0.6 ? 'stones' : 'chapel';
      shrines.push({ id: `shrine:${f.id}:${shrines.length}`, name: h.name, faith: f.name, what: h.what, lon: h.lon, lat: h.lat, feature, style, culture: ci, seed: hashString(`${seedKey}#shrine#${h.name}`) });
    }
  }

  // ---- City themes ------------------------------------------------------------------------------
  // Today's foes of each realm, and the counties won or lost in past wars.
  const foes = new Map<number, Set<number>>();
  for (const w of L.wars) {
    if (w.end !== undefined) continue;
    for (const a of w.attackers) for (const d of w.defenders) {
      (foes.get(a) ?? foes.set(a, new Set()).get(a)!).add(d);
      (foes.get(d) ?? foes.set(d, new Set()).get(d)!).add(a);
    }
  }
  const fought = new Map<number, { name: string; end: number }>();
  for (const w of L.wars) {
    if (w.prize === undefined || w.end === undefined || L.year - w.end > 400) continue;
    for (const b of L.baronies(w.prize)) if (!fought.has(b) || fought.get(b)!.end < w.end) fought.set(b, { name: w.name, end: w.end });
  }
  const topAt = (cell: number) => (baronyOf[cell] >= 0 ? L.topOf[baronyOf[cell]] : -1);
  /** The nearest foe's land within about 120 km of a city, if its realm is at war. */
  const nearFront = (s: Settlement, top: number) => {
    const fs = foes.get(top);
    if (!fs) return false;
    const c0 = cellOf(s.lon, s.lat), i0 = c0 % W, j0 = (c0 / W) | 0;
    const cellKm = (40075 / W) * Math.max(0.2, Math.cos((s.lat * Math.PI) / 180));
    const ri = Math.ceil(120 / cellKm), rj = Math.ceil(120 / (20004 / H));
    for (let dj = -rj; dj <= rj; dj++) {
      const j = j0 + dj;
      if (j < 0 || j >= H) continue;
      for (let di = -ri; di <= ri; di++) {
        const t = topAt(j * W + (((i0 + di) % W) + W) % W);
        if (t >= 0 && fs.has(t)) return true;
      }
    }
    return false;
  };
  const wet = (b: number) => {
    const land = L.land(b);
    const a = land.areaKm2 || 1;
    return (land.biome[Biome.Wetland] + land.biome[Biome.Mangrove]) / a;
  };
  const themes = new Map<string, ThemeOf>();
  // Delves are their halls under the mountain: they take no theme of the streets above.
  const cities = settlements.filter((s) => s.tier === 'city' && !s.newWorld && !s.colony && !s.delve && s.name);
  const universities = cities.filter((s) => s.university).length;
  for (const s of cities) {
    const b = baronyAt(s);
    if (b < 0) continue;
    const top = L.topOf[b], tu = units[top], bu = units[b];
    const ci = s.culture ?? bu.culture;
    const t = tpl(ci), folk = templateFolk(t);
    const econ = L.econ.get(top);
    const rank = L.wealthRank(top), nTops = L.tops.length || 1;
    const rich = 1 - Math.min(1, (rank - 1) / Math.max(1, nTops * 0.4));
    const r = mulberry32(hashString(`${seedKey}#theme#${s.id}`));
    const land = L.land(b);
    const score: [CityTheme, number, string][] = [];
    const big = Math.min(1, s.population / 30000);
    // Merchant: rich trading cities on the water, above all in republics and city-states.
    {
      const gov = tu.gov === 'republic' || tu.gov === 'city-state' || tu.gov === 'thalassocracy' || tu.league >= 0 ? 1 : 0;
      const v = (s.coastal ? 1 : s.river ? 0.6 : 0.15) * (0.5 + rich) * (0.7 + gov * 1 + (has(ci, 'merchantPrinces') ? 0.7 : 0) + (has(ci, 'seafarers') ? 0.3 : 0));
      score.push(['merchant', v, gov ? `a trading ${tu.title.toLowerCase()}` : 'a rich trading port']);
    }
    // Canals: river mouths among marshes and lagoons.
    {
      const w = wet(b);
      const v = s.river && (s.coastal ? w > 0.05 : w > 0.25) ? (s.coastal ? 0.5 : 0.3) + Math.min(1.2, w * 3) + (has(ci, 'riverFolk') ? 0.3 : 0) : 0;
      score.push(['canal', v, 'built on the marshes of a river mouth']);
    }
    // Thieves: great cities, poorer, unruly or at war, without a stern faith or law.
    {
      const lawful = tu.gov === 'theocracy' || has(ci, 'legalists') || has(ci, 'bureaucratic') ? 0.4 : 1;
      const v = s.population >= 20000 ? (0.2 + big * 0.5 + (1 - rich) * 0.5 + (foes.has(top) ? 0.2 : 0)) * lawful : 0;
      score.push(['thieves', v, 'its guild of thieves is older than its walls']);
    }
    // Mages: university cities, elves, and inventive or star-reading peoples.
    {
      const v = (s.university ? 1.3 : 0.25) + (folk === 'Elves' ? 0.8 : 0) + (has(ci, 'inventive') ? 0.35 : 0) + (has(ci, 'stargazers') ? 0.45 : 0) + (has(ci, 'courtly') ? 0.15 : 0) + (has(ci, 'monastic') ? 0.2 : 0);
      score.push(['mages', universities ? v : v * 0.8, s.university ? 'its university is famed for the arcane' : 'a seat of the arcane arts']);
    }
    // Forge: mines in the hills about it, and dwarven realms.
    {
      const metal = econ?.metals.length ?? 0;
      const high = Math.min(1, land.highKm2 / Math.max(1, land.areaKm2) * 2);
      const v = (folk === 'Dwarves' ? 1.4 : 0) + Math.min(3, metal) * 0.3 * (0.3 + high * 1.5) + (has(ci, 'masterCraftsmen') ? 0.5 : 0) + (has(ci, 'deepDelvers') ? 0.4 : 0);
      score.push(['forge', v, metal ? `smelting the ${econ!.metals.slice(0, 2).join(' and ')} of the hills` : 'its forges never cool']);
    }
    // Fortress: walled cities near today's fronts, and among warlike peoples.
    {
      const front = nearFront(s, top);
      const v = !s.walls ? 0 : (front ? 1.5 : 0) + (has(ci, 'bellicose') ? 0.4 : 0) + (has(ci, 'warriorCulture') ? 0.4 : 0) + (s.citadel ? 0.2 : 0);
      score.push(['fortress', v, front ? 'it guards the front of a war' : 'a stronghold of a warlike people']);
    }
    // Pilgrim: the holy cities.
    {
      const h = holy.get(s.id);
      score.push(['pilgrim', h ? 1.6 + (has(ci, 'spiritual') ? 0.4 : 0) : 0, h ? `pilgrims come to ${h.what.replace(/^the /, 'its ')}` : '']);
    }
    // Rebuilt: taken in a past war.
    {
      const f = fought.get(b);
      const v = f ? 1.1 + Math.max(0, 0.6 - (L.year - f.end) / 400) : 0;
      score.push(['rebuilt', v, f ? `rebuilt after ${f.name} (${f.end})` : '']);
    }
    // The strongest claim wins if it is strong enough; chance varies it a little.
    let best: [CityTheme, number, string] | null = null;
    for (const x of score) {
      const v = x[1] * (0.75 + 0.5 * r());
      if (!best || v > best[1]) best = [x[0], v, x[2]];
    }
    if (best && best[1] >= 1.15) themes.set(s.id, { theme: best[0], why: best[2] });
  }
  const out = { themes, holy, shrines };
  cache.set(c.L, out);
  return out;
}
