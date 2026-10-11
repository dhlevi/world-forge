import { type Grid, distKm, neighbor } from '../gen/grid';
import { MinHeap } from '../gen/heap';
import { hashString, mulberry32 } from '../gen/rng';
import { Biome } from '../gen/biomes';
import { CULTURES, type SiteClimate } from './cultures';

export interface CultureFields {
  height: Float32Array;
  temp: Float32Array;
  tempCold: Float32Array;
  precip: Float32Array;
  biome: Uint8Array;
  /** 1 on New World land: its hearths take New World cultures, the Old World's the others. */
  newWorld?: Uint8Array;
}

/** Cultures of the New World (tribal lands); the rest belong to the Old World. */
export const NEW_WORLD_CULTURES = new Set(['jungle', 'woodland', 'highland']);

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
export function cultureMap(g: Grid, f: CultureFields, seed: string): Uint8Array {
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
  if (!land.length) return out;
  const want = Math.max(5, Math.min(24, Math.round(landArea / 4e6)));
  const seeds: number[] = [];
  const ll = (c: number) => [g.lonDeg[c % W], g.latDeg[(c / W) | 0]];
  for (let t = 0; t < want * 60 && seeds.length < want; t++) {
    const c = land[Math.floor(rnd() * land.length)];
    const [lon, lat] = ll(c);
    if (seeds.every((s) => distKm(lon, lat, ll(s)[0], ll(s)[1]) > 1200)) seeds.push(c);
  }
  const uses = new Array<number>(CULTURES.length).fill(0);
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
    CULTURES.forEach((cu, k) => {
      if (f.newWorld && NEW_WORLD_CULTURES.has(cu.id) !== nw) return;
      const s = cu.likes(site) + 0.35 * rnd() - 0.5 * uses[k];
      if (s > bestS) {
        bestS = s;
        best = k;
      }
    });
    uses[best]++;
    return best;
  });

  const dist = new Float64Array(N).fill(Infinity);
  const heap = new MinHeap(4096);
  seeds.forEach((c, k) => {
    dist[c] = 0;
    out[c] = seedCulture[k];
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
      let cost = d * (sea ? 4 : 1 + (f.height[n] > 1500 ? 2.5 : f.height[n] > 800 ? 0.8 : 0));
      // Old World cultures hardly reach New World land, and the other way about.
      if (!sea && f.newWorld && NEW_WORLD_CULTURES.has(CULTURES[out[c]]?.id ?? '') !== (f.newWorld[n] === 1)) cost += 4000;
      if (dc + cost < dist[n]) {
        dist[n] = dc + cost;
        out[n] = out[c];
        heap.push(n, dist[n]);
      }
    }
  }
  return out;
}
