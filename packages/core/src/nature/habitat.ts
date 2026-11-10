import { Biome } from '../gen/biomes';
import { SP } from '../gen/special';
import { DMath } from '../dmath';

/**
 * The kinds of country the bestiary and the field guide sort their creatures and plants by, and
 * how much of each a region holds (its share of the land about a place, 0 to 1).
 */
export type Habitat =
  | 'arctic' | 'boreal' | 'temperate' | 'tropical' | 'arid' | 'grass' | 'forest' | 'jungle' | 'mountain' | 'wetland' | 'coast' | 'river'
  | 'ice' | 'cursed' | 'fungal' | 'volcanic' | 'farmland';

export const HABITAT_LABEL: Record<Habitat, string> = {
  arctic: 'cold lands', boreal: 'northern forest', temperate: 'temperate lands', tropical: 'the tropics', arid: 'dry lands', grass: 'open grassland',
  forest: 'woodland', jungle: 'jungle', mountain: 'mountains', wetland: 'marsh and fen', coast: 'the coast', river: 'riverbanks', ice: 'ice fields',
  cursed: 'cursed land', fungal: 'mushroom forest', volcanic: 'volcanic ground', farmland: 'farmland',
};

const BIOME_HABITATS: Record<Biome, Partial<Record<Habitat, number>>> = {
  [Biome.IceSheet]: { ice: 1, arctic: 1 },
  [Biome.Tundra]: { arctic: 1, grass: 0.6 },
  [Biome.BorealForest]: { boreal: 1, forest: 1 },
  [Biome.ColdDesert]: { arid: 1, grass: 0.7, arctic: 0.3 },
  [Biome.Grassland]: { temperate: 1, grass: 1, farmland: 0.5 },
  [Biome.Shrubland]: { temperate: 0.8, grass: 0.6, forest: 0.4, arid: 0.3 },
  [Biome.TemperateForest]: { temperate: 1, forest: 1, farmland: 0.3 },
  [Biome.TemperateRainforest]: { temperate: 1, forest: 1, wetland: 0.2 },
  [Biome.HotDesert]: { arid: 1, tropical: 0.4 },
  [Biome.Savanna]: { tropical: 1, grass: 1, arid: 0.3 },
  [Biome.TropicalDryForest]: { tropical: 1, forest: 0.8 },
  [Biome.TropicalRainforest]: { tropical: 1, jungle: 1, forest: 0.5 },
  [Biome.Alpine]: { mountain: 1, arctic: 0.6 },
  [Biome.MontaneForest]: { mountain: 0.8, forest: 0.8, temperate: 0.4 },
  [Biome.Wetland]: { wetland: 1, temperate: 0.3 },
  [Biome.Mangrove]: { wetland: 1, coast: 0.8, tropical: 1 },
  [Biome.Riparian]: { river: 1, forest: 0.4, temperate: 0.3 },
  [Biome.SaltFlat]: { arid: 1 },
};

export interface RasterLike {
  W: number;
  H: number;
  height: Float32Array;
  biome: Uint8Array;
  special: Uint8Array;
  newWorld: Uint8Array;
}

export interface Region {
  /** Share of each kind of country about the place (0 to 1). */
  hab: Partial<Record<Habitat, number>>;
  /** A key for the region (a cell of a half-degree grid), so nearby places share their lists. */
  key: string;
  newWorld: boolean;
  /** The kinds most present, the largest first. */
  main: Habitat[];
}

/** The country about a place: land cells within ~`reachDeg` sampled on rings. */
export function regionAt(r: RasterLike, lon: number, lat: number, reachDeg = 0.6): Region {
  const { W, H } = r;
  const cell = (x: number, y: number) => {
    const i = ((Math.floor(((x + 180) / 360) * W) % W) + W) % W, j = Math.min(H - 1, Math.max(0, Math.floor(((90 - y) / 180) * H)));
    return j * W + i;
  };
  // Snap to a half-degree grid: a region is the same from anywhere within it.
  const lx = Math.floor(lon * 2) / 2 + 0.25, ly = Math.floor(lat * 2) / 2 + 0.25;
  const acc: Partial<Record<Habitat, number>> = {};
  let land = 0, sea = 0, nw = 0;
  const kLon = 1 / Math.max(0.2, DMath.cos((ly * Math.PI) / 180));
  for (const f of [0, 0.35, 0.7, 1]) {
    const n = f === 0 ? 1 : 12;
    for (let a = 0; a < n; a++) {
      const t = (a / n) * Math.PI * 2;
      const c = cell(lx + DMath.cos(t) * reachDeg * f * kLon, ly + DMath.sin(t) * reachDeg * f);
      if (r.height[c] <= 0) {
        sea++;
        continue;
      }
      land++;
      if (r.newWorld[c]) nw++;
      for (const [h, w] of Object.entries(BIOME_HABITATS[r.biome[c] as Biome] ?? {})) acc[h as Habitat] = (acc[h as Habitat] ?? 0) + (w as number);
      if (r.height[c] > 1800) acc.mountain = (acc.mountain ?? 0) + 0.8;
      const sp = r.special[c];
      if (sp === SP.cursed) acc.cursed = (acc.cursed ?? 0) + 1;
      if (sp === SP.fungal) acc.fungal = (acc.fungal ?? 0) + 1;
      if (sp === SP.ash || sp === SP.lava || sp === SP.volcanic || sp === SP.geothermal) acc.volcanic = (acc.volcanic ?? 0) + 1;
      if (sp === SP.glacier) acc.ice = (acc.ice ?? 0) + 1;
    }
  }
  const hab: Partial<Record<Habitat, number>> = {};
  for (const [h, v] of Object.entries(acc)) hab[h as Habitat] = Math.min(1, (v as number) / Math.max(1, land));
  if (sea > 0 && land > 0) hab.coast = Math.max(hab.coast ?? 0, Math.min(1, (sea / (sea + land)) * 2));
  // The tropics and the cold give no farmland of the plough, and the New World little.
  if (land && nw / land > 0.5 && hab.farmland) hab.farmland *= 0.3;
  const main = (Object.entries(hab) as [Habitat, number][]).filter(([h]) => h !== 'farmland').sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  return { hab, key: `${lx.toFixed(2)},${ly.toFixed(2)}`, newWorld: land > 0 && nw / land > 0.5, main };
}

/** How well a creature or plant of these habitats fits a region (0 to 1). */
export function fit(r: Region, tags: Habitat[], needs?: Habitat[]): number {
  if (needs && needs.some((h) => (r.hab[h] ?? 0) < 0.08)) return 0;
  let best = 0;
  for (const t of tags) best = Math.max(best, r.hab[t] ?? 0);
  return best;
}
