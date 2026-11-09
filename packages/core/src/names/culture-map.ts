import { type Grid, distKm, neighbor } from '../gen/grid';
import { MinHeap } from '../gen/heap';
import { hashString, mulberry32 } from '../gen/rng';
import { Biome } from '../gen/biomes';
import { TEMPLATES, type SiteClimate } from './cultures';
import type { CultureSpec } from './world-cultures';
import { BUNDLE, templateFolk } from './bundles';

export interface CultureFields {
  height: Float32Array;
  temp: Float32Array;
  tempCold: Float32Array;
  precip: Float32Array;
  biome: Uint8Array;
  /** 1 on New World land: its hearths take New World cultures, the Old World's the others. */
  newWorld?: Uint8Array;
}

/** Where a template's homelands may lie: the Old World, the New World or either (from its bundle). */
export const worldOf = (id: string): 'old' | 'new' | 'both' | 'deep' => BUNDLE.get(id)?.world ?? 'old';
const fits = (id: string, nw: boolean) => {
  const w = worldOf(id);
  return w !== 'deep' && (w === 'both' || (w === 'new') === nw);
};

const FOREST = new Set<Biome>([
  Biome.BorealForest, Biome.TemperateForest, Biome.TemperateRainforest, Biome.TropicalRainforest, Biome.TropicalDryForest, Biome.MontaneForest,
]);
const DRY = new Set<Biome>([Biome.HotDesert, Biome.ColdDesert, Biome.Shrubland, Biome.SaltFlat, Biome.Savanna, Biome.Grassland]);

/**
 * Culture of every grid cell. Culture hearths are spread over the land (at least ~1200 km apart);
 * each takes the culture that best suits its climate (with a penalty for repeats so a world has
 * variety), then spreads outward. Mountains and sea crossings are slow to spread over, so
 * borders tend to follow ranges and coasts. Sea cells take the culture of the nearest shore.
 */
/**
 * With `races` off, only human peoples are chosen (no elves, dwarves, halflings, orcs or
 * lizardfolk).
 */
export function cultureMap(g: Grid, f: CultureFields, seed: string, races = true): { culture: Uint8Array; specs: CultureSpec[] } {
  const { N, W } = g;
  const rnd = mulberry32(hashString(seed + '#cultures'));
  let landArea = 0;
  const land: number[] = [];
  for (let c = 0; c < N; c++) {
    if (f.height[c] > 0) {
      land.push(c);
      landArea += g.areaKm2[(c / W) | 0];
    }
  }
  const out = new Uint8Array(N);
  if (!land.length) return { culture: out, specs: [] };
  const want = Math.max(5, Math.min(24, Math.round(landArea / 4e6)));
  const seeds: number[] = [];
  const ll = (c: number) => [g.lonDeg[c % W], g.latDeg[(c / W) | 0]];
  for (let t = 0; t < want * 60 && seeds.length < want; t++) {
    const c = land[Math.floor(rnd() * land.length)];
    const [lon, lat] = ll(c);
    if (seeds.every((s) => distKm(lon, lat, ll(s)[0], ll(s)[1]) > 1200)) seeds.push(c);
  }
  const uses = new Array<number>(TEMPLATES.length).fill(0);
  const coastal = (c: number) => {
    const i = c % W, j = (c / W) | 0;
    for (let k = 0; k < 8; k++) {
      const n = neighbor(g, i, j, k);
      if (n >= 0 && f.height[n] <= 0) return true;
    }
    return false;
  };
  const seedCulture = seeds.map((c) => {
    const site: SiteClimate = {
      temp: f.temp[c], tempCold: f.tempCold[c], precip: f.precip[c], heightM: f.height[c],
      forest: FOREST.has(f.biome[c] as Biome), dry: DRY.has(f.biome[c] as Biome) || f.precip[c] < 400, coastal: coastal(c),
    };
    let best = 0, bestS = -Infinity;
    const nw = f.newWorld ? f.newWorld[c] === 1 : false;
    TEMPLATES.forEach((cu, k) => {
      // The peoples of the Underworld have no hearths on the surface (and draw nothing here).
      if (worldOf(cu.id) === 'deep') return;
      if (f.newWorld && !fits(cu.id, nw)) return;
      if (!races && templateFolk(cu.id) !== 'Humans') return;
      // Peoples of either world settle only where they truly belong (islanders on warm shores).
      if (worldOf(cu.id) === 'both' && cu.likes(site) < 0.3) return;
      const s = cu.likes(site) * (BUNDLE.get(cu.id)?.rarity ?? 1) + 0.35 * rnd() - 0.5 * uses[k];
      if (s > bestS) {
        bestS = s;
        best = k;
      }
    });
    uses[best]++;
    return best;
  });

  // How hard each hearth's people spread over a cell (dwarves keep to the mountains; see `spread` in names/bundle.ts).
  const spread = TEMPLATES.map((t) => BUNDLE.get(t.id)?.spread);
  const dist = new Float64Array(N).fill(Infinity);
  const heap = new MinHeap(4096);
  // Each hearth is a culture of its own (cells hold the hearth's index); several may share a template.
  seeds.forEach((c, k) => {
    dist[c] = 0;
    out[c] = k;
    heap.push(c, 0);
  });
  while (heap.size) {
    const c = heap.pop();
    const dc = heap.lastKey;
    if (dc > dist[c]) continue;
    const i = c % W, j = (c / W) | 0;
    for (let k = 0; k < 8; k++) {
      const n = neighbor(g, i, j, k);
      if (n < 0) continue;
      const d = g.nbDist[j * 8 + k];
      const sea = f.height[n] <= 0;
      const tid = TEMPLATES[seedCulture[out[c]]]?.id ?? '';
      let cost = d * (sea ? 4 : 1 + (f.height[n] > 1500 ? 2.5 : f.height[n] > 800 ? 0.8 : 0)) * (spread[seedCulture[out[c]]]?.(f.height[n], f.biome[n] as Biome, sea) ?? 1);
      // Old World cultures hardly reach New World land, and the other way about. Except for colonies if age of sail flag is set.
      if (!sea && f.newWorld && !fits(tid, f.newWorld[n] === 1)) cost += 4000;
      if (dc + cost < dist[n]) {
        dist[n] = dc + cost;
        out[n] = out[c];
        heap.push(n, dist[n]);
      }
    }
  }
  // What each culture's lands are like, for its traits.
  const K = seeds.length;
  const acc = Array.from({ length: K }, () => ({ area: 0, coast: 0, high: 0, forest: 0, grass: 0, desert: 0, cold: 0, hot: 0, wet: 0, jungle: 0, river: 0 }));
  for (const c of land) {
    const k = out[c];
    const a = g.areaKm2[(c / W) | 0];
    const e = acc[k];
    const b = f.biome[c] as Biome;
    e.area += a;
    if (coastal(c)) e.coast += a;
    if (f.height[c] > 1200) e.high += a;
    if (FOREST.has(b) && b !== Biome.TropicalRainforest) e.forest += a;
    if (b === Biome.Grassland || b === Biome.ColdDesert || b === Biome.Savanna) e.grass += a;
    if (b === Biome.HotDesert || b === Biome.SaltFlat || (b === Biome.ColdDesert && f.precip[c] < 250)) e.desert += a;
    if (f.temp[c] < 0) e.cold += a;
    if (f.temp[c] > 22) e.hot += a;
    if (f.precip[c] > 1500) e.wet += a;
    if (b === Biome.TropicalRainforest || b === Biome.TropicalDryForest || b === Biome.Mangrove) e.jungle += a;
    if (b === Biome.Riparian || b === Biome.Wetland) e.river += a;
  }
  const specs: CultureSpec[] = seeds.map((c, k) => {
    const e = acc[k], A = Math.max(1, e.area);
    return {
      template: seedCulture[k], lon: ll(c)[0], lat: ll(c)[1], nw: f.newWorld ? f.newWorld[c] === 1 : false,
      env: { areaKm2: Math.round(e.area), coast: e.coast / A, high: e.high / A, forest: e.forest / A, grass: e.grass / A, desert: e.desert / A, cold: e.cold / A, hot: e.hot / A, wet: e.wet / A, jungle: e.jungle / A, river: e.river / A },
    };
  });
  return { culture: out, specs };
}
