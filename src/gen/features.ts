import { type Grid, distKm, neighbor } from './grid';
import { MinHeap } from './heap';
import { Biome } from './biomes';
import { HYDROLOGY } from './config';
import type { RiverCollection } from './rivers';
import type { DetailSampler } from './detail';
import type { RoadCollection, Settlement } from './settlements';
import { CULTURES, type FeatureKind } from '../names/cultures';
import { chooseLayout } from '../towns/layout';
import type { NameBank, Named } from '../names/names';

/**
 * Geographic features found on the world grid and given names in the local culture:
 * continents, islands and archipelagos; oceans, seas, gulfs, bays, bights, straits and channels;
 * lakes and inland seas; mountain ranges (with peaks), hills, forests, deserts, marshes and
 * plains; realms around the great cities. Rivers, roads and settlements are named in place.
 * Labels are points, or lines along the long axis of elongated features (MapLibre bends the
 * lettering along them).
 */

export type LabelKind = FeatureKind | 'city' | 'town' | 'empire' | 'duchy' | 'county' | 'barony' | 'league';

export interface LabelFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: number[] } | { type: 'LineString'; coordinates: number[][] };
  /**
   * rank: 0 (largest) … 3 (smallest) within its kind; minz/maxz: nominal zoom range.
   * zlo/zhi (water only): whole-zoom band this anchor belongs to. A water body keeps one label
   * until it fills the screen, then is lettered from a lattice of anchors (see `waterAnchors`).
   */
  properties: { kind: LabelKind; name: string; en?: string; old?: string; rank: number; minz: number; maxz: number; zlo?: number; zhi?: number; unit?: number; arms?: number; top?: number };
}

export interface LabelCollection {
  type: 'FeatureCollection';
  features: LabelFeature[];
}

export interface FeatureFields {
  height: Float32Array;
  lakeDepth: Float32Array;
  biome: Uint8Array;
  culture: Uint8Array;
}

const FOREST = new Set<Biome>([
  Biome.BorealForest, Biome.TemperateForest, Biome.TemperateRainforest, Biome.TropicalRainforest, Biome.TropicalDryForest, Biome.MontaneForest,
]);

export function nameWorld(
  g: Grid, f: FeatureFields, bank: NameBank, settlements: Settlement[], rivers: RiverCollection, roads: RoadCollection, sampler?: DetailSampler,
  /** Filled with the index of the land region label (range, forest, desert…) over each cell. */
  regionOf?: Int32Array,
): LabelCollection {
  const { W, H, N } = g;
  const labels: LabelFeature[] = [];
  const lon = (c: number) => g.lonDeg[c % W], lat = (c: number) => g.latDeg[(c / W) | 0];
  const area = (c: number) => g.areaKm2[(c / W) | 0];
  const isLand = (c: number) => f.height[c] > 0;
  const isSea = (c: number) => f.height[c] <= 0;
  const point = (c: number): number[] => [lon(c), lat(c)];
  /** A label: its name in the local language, and in English where that differs. */
  const push = (kind: LabelKind, n: Named, geom: LabelFeature['geometry'], rank: number, minz: number, maxz: number) =>
    labels.push({ type: 'Feature', geometry: geom, properties: { kind, name: n.name, ...(n.en !== n.name ? { en: n.en } : {}), ...(n.old ? { old: n.old } : {}), rank, minz, maxz } }) - 1;
  /** Water bodies to letter at close zoom: a set of cells (lakes, enclosed seas) or a seed with a reach on the open sea. */
  const waters: WaterBody[] = [];

  // ---- Settlements -------------------------------------------------------------------------
  for (const s of settlements) {
    const c = cellOf(g, s.lon, s.lat);
    const bi = f.biome[c] as Biome;
    const nm = bank.placeNamed(s.culture ?? f.culture[c], s.id, {
      coastal: s.coastal, river: s.river, high: f.height[c] > 800, forest: FOREST.has(bi), grass: bi === Biome.Grassland || bi === Biome.Savanna || bi === Biome.ColdDesert,
      marsh: bi === Biome.Wetland || bi === Biome.Mangrove, walls: s.walls, city: s.tier === 'city', kind: s.kind,
    });
    s.name = nm.name;
    s.nameEn = nm.en;
    if (nm.old) s.nameOld = nm.old;
    if (s.tier === 'city' || s.tier === 'town') {
      // Local relief: the largest height step to a neighbouring cell.
      const i = c % W, j = (c / W) | 0;
      let relief = 0;
      for (let k = 0; k < 8; k++) {
        const n = neighbor(g, i, j, k);
        if (n >= 0 && f.height[n] > 0) relief = Math.max(relief, Math.abs(f.height[n] - f.height[c]));
      }
      s.layout = chooseLayout({
        tier: s.tier, population: s.population, river: s.river, coastal: s.coastal, relief,
        culture: CULTURES[s.culture ?? f.culture[c]]?.id ?? '', r: bank.rng(`layout:${s.id}`)(),
      });
    }
  }
  // Colonies are named after their founders' towns ("New Ashford"), or as forts and landings.
  const homeTowns = (cul: number) => settlements.filter((t) => !t.newWorld && t.name && (t.culture ?? f.culture[cellOf(g, t.lon, t.lat)]) === cul);
  for (const s of settlements) {
    if (!s.colony || !s.name) continue;
    const r = bank.rng(`colony:${s.id}`);
    const home = homeTowns(s.culture ?? 0);
    const x = r();
    const ci = s.culture ?? 0;
    const self: Named = { name: s.name, en: s.nameEn ?? s.name };
    let nm: Named | null = null;
    if (s.colony === 'fort') nm = bank.named(ci, 'Fort {0}', [self]);
    else if (s.colony === 'post') nm = bank.named(ci, x < 0.5 ? '{0} Landing' : '{0} Post', [self]);
    else if (home.length && x < 0.55) {
      const h = home[Math.floor(r() * home.length)];
      nm = bank.named(ci, 'New {0}', [{ name: h.name ?? '', en: h.nameEn ?? h.name ?? '' }]);
    } else if (x < 0.75) nm = bank.named(ci, 'Port {0}', [self]);
    if (nm) {
      s.name = nm.name;
      s.nameEn = nm.en;
      delete s.nameOld;
    }
  }
  const named = (lo: number, la: number, km: number) => {
    let best: Settlement | null = null, bd = km;
    for (const s of settlements) {
      if (s.tier !== 'city' && s.tier !== 'town') continue;
      const d = distKm(lo, la, s.lon, s.lat);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  };
  /** Sometimes a feature takes the name of a nearby town ("Bay of Hollyford"). */
  const baseFrom = (c: number, km: number, chance: number, key: string): Named | undefined => {
    const r = bank.rng(`base:${key}`)();
    if (r > chance) return undefined;
    const t = named(lon(c), lat(c), km);
    return t?.name ? { name: t.name, en: t.nameEn ?? t.name } : undefined;
  };

  // ---- Components --------------------------------------------------------------------------
  const components = (mask: (c: number) => boolean) => {
    const comp = new Int32Array(N).fill(-1);
    const list: number[][] = [];
    for (let s = 0; s < N; s++) {
      if (comp[s] >= 0 || !mask(s)) continue;
      const id = list.length, cells = [s];
      comp[s] = id;
      for (let q = 0; q < cells.length; q++) {
        const c = cells[q], i = c % W, j = (c / W) | 0;
        for (let k = 0; k < 8; k++) {
          const n = neighbor(g, i, j, k);
          if (n >= 0 && comp[n] < 0 && mask(n)) {
            comp[n] = id;
            cells.push(n);
          }
        }
      }
      list.push(cells);
    }
    return { comp, list };
  };
  const areaOf = (cells: number[]) => cells.reduce((a, c) => a + area(c), 0);

  /** The cell deepest inside a set of cells (furthest from its edge), by breadth-first layers from the edge. */
  const stampArr = new Int32Array(N), depthArr = new Int32Array(N), queueArr = new Int32Array(N);
  let stamp = 0;
  const pole = (cells: number[]): number => {
    stamp++;
    for (const c of cells) stampArr[c] = stamp;
    let qn = 0;
    for (const c of cells) {
      const i = c % W, j = (c / W) | 0;
      depthArr[c] = -1;
      for (let k = 0; k < 8; k++) {
        const n = neighbor(g, i, j, k);
        if (n < 0 || stampArr[n] !== stamp) {
          depthArr[c] = 0;
          queueArr[qn++] = c;
          break;
        }
      }
    }
    let best = qn ? queueArr[0] : cells[0], bd = 0;
    for (let q = 0; q < qn; q++) {
      const c = queueArr[q], i = c % W, j = (c / W) | 0, d = depthArr[c];
      if (d > bd) {
        bd = d;
        best = c;
      }
      for (let k = 0; k < 8; k++) {
        const n = neighbor(g, i, j, k);
        if (n >= 0 && stampArr[n] === stamp && depthArr[n] < 0) {
          depthArr[n] = d + 1;
          queueArr[qn++] = n;
        }
      }
    }
    return best;
  };

  /** A label geometry: a gently curved line along the long axis of an elongated set, else a point. */
  const shape = (cells: number[], at: number, maxLenKm = 2500): LabelFeature['geometry'] => {
    const lat0 = lat(at), lon0 = lon(at), cl = Math.max(0.05, Math.cos((lat0 * Math.PI) / 180));
    let sxx = 0, syy = 0, sxy = 0, n = 0;
    const xs: number[] = [], ys: number[] = [];
    const step = Math.max(1, Math.floor(cells.length / 4000));
    for (let k = 0; k < cells.length; k += step) {
      const c = cells[k];
      let dl = lon(c) - lon0;
      dl = ((dl + 540) % 360) - 180;
      const x = dl * 111.2 * cl, y = (lat(c) - lat0) * 111.2;
      xs.push(x);
      ys.push(y);
      sxx += x * x; syy += y * y; sxy += x * y; n++;
    }
    sxx /= n; syy /= n; sxy /= n;
    const tr = sxx + syy, det = sxx * syy - sxy * sxy;
    const l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det)), l2 = tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    if (l2 > 0 && l1 / l2 < 2.4) return { type: 'Point', coordinates: point(at) };
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const proj = xs.map((x, k) => x * ux + ys[k] * uy).sort((a, b) => a - b);
    const lo = proj[Math.floor(proj.length * 0.12)], hi = proj[Math.floor(proj.length * 0.88)];
    const half = Math.min(maxLenKm, (hi - lo) * 0.85) / 2;
    // Short features keep straight lettering: a curved label only shows once its line is long enough on screen.
    if (half < 300) return { type: 'Point', coordinates: point(at) };
    // A slight bow, like hand lettering along a range.
    const bow = half * 0.12 * (bank.rng(`bow:${at}`)() < 0.5 ? -1 : 1);
    const coords: number[][] = [];
    for (let k = 0; k <= 8; k++) {
      const t = -1 + (2 * k) / 8;
      const x = t * half * ux - (1 - t * t) * bow * uy, y = t * half * uy + (1 - t * t) * bow * ux;
      coords.push([lon0 + x / (111.2 * cl), Math.max(-85, Math.min(85, lat0 + y / 111.2))]);
    }
    if (coords[0][0] > coords[coords.length - 1][0]) coords.reverse();
    return { type: 'LineString', coordinates: coords };
  };

  // ---- Land: continents, islands, archipelagos ----------------------------------------------
  const landC = components(isLand);
  const smallIslands: { c: number; cells: number[] }[] = [];
  landC.list.forEach((cells, id) => {
    const a = areaOf(cells);
    const at = pole(cells);
    if (a > 1.5e6) {
      push('continent', bank.featureNamed('continent', f.culture[at], `cont${id}`), shape(cells, at, 5000), a > 2e7 ? 0 : 1, 0.6, 3.2);
    } else if (a > 15000) {
      push('island', bank.featureNamed('island', f.culture[at], `isl${id}`), { type: 'Point', coordinates: point(at) }, a > 3e5 ? 0 : a > 6e4 ? 1 : 2, a > 3e5 ? 2.5 : a > 6e4 ? 3.5 : 4.5, 10);
    } else smallIslands.push({ c: at, cells });
  });
  // Archipelagos: clusters of three or more small islands within ~300 km of each other.
  const parent = smallIslands.map((_, k) => k);
  const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  for (let a = 0; a < smallIslands.length; a++) {
    for (let b = a + 1; b < smallIslands.length; b++) {
      if (distKm(lon(smallIslands[a].c), lat(smallIslands[a].c), lon(smallIslands[b].c), lat(smallIslands[b].c)) < 300) parent[find(a)] = find(b);
    }
  }
  const groups = new Map<number, number[]>();
  smallIslands.forEach((_, k) => {
    const r = find(k);
    groups.set(r, [...(groups.get(r) ?? []), k]);
  });
  for (const [r, members] of groups) {
    const all = members.flatMap((k) => smallIslands[k].cells);
    if (members.length >= 3) {
      // Label at the member nearest the group's centre.
      let x = 0, y = 0, z = 0;
      for (const c of all) {
        const la = (lat(c) * Math.PI) / 180, lo = (lon(c) * Math.PI) / 180;
        x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la);
      }
      const cLon = (Math.atan2(y, x) * 180) / Math.PI, cLat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
      push('isles', bank.featureNamed('isles', f.culture[smallIslands[members[0]].c], `isles${r}`), { type: 'Point', coordinates: [cLon, cLat] }, 1, 4, 9);
    } else if (areaOf(all) > 3000) {
      for (const k of members) {
        const c = smallIslands[k].c;
        push('island', bank.featureNamed('island', f.culture[c], `isl-s${k}`), { type: 'Point', coordinates: point(c) }, 3, 6, 11);
      }
    }
  }

  // ---- Water -------------------------------------------------------------------------------
  // Distance to land (km) for every sea cell.
  const distLand = new Float64Array(N).fill(Infinity);
  const heap = new MinHeap(4096);
  for (let c = 0; c < N; c++) {
    if (!isLand(c)) continue;
    distLand[c] = 0;
    // Only shore cells can seed distances into the sea.
    const i = c % W, j = (c / W) | 0;
    for (let k = 0; k < 8; k++) {
      const n = neighbor(g, i, j, k);
      if (n >= 0 && isSea(n)) {
        heap.push(c, 0);
        break;
      }
    }
  }
  while (heap.size) {
    const c = heap.pop(), dc = heap.lastKey;
    if (dc > distLand[c]) continue;
    const i = c % W, j = (c / W) | 0;
    for (let k = 0; k < 8; k++) {
      const n = neighbor(g, i, j, k);
      if (n < 0 || !isSea(n)) continue;
      const nd = dc + g.nbDist[j * 8 + k];
      if (nd < distLand[n]) {
        distLand[n] = nd;
        heap.push(n, nd);
      }
    }
  }
  const water: { lon: number; lat: number; km: number }[] = [];
  const clear = (c: number, km: number) => water.every((w) => distKm(w.lon, w.lat, lon(c), lat(c)) > Math.max(km, w.km));
  const claim = (c: number, km: number) => water.push({ lon: lon(c), lat: lat(c), km });

  const seaC = components(isSea);
  let main = 0;
  seaC.list.forEach((cells, id) => {
    if (cells.length > seaC.list[main].length) main = id;
  });
  // Enclosed seas (not joined to the world ocean).
  seaC.list.forEach((cells, id) => {
    if (id === main) return;
    const a = areaOf(cells);
    if (a < 300) return;
    const at = pole(cells);
    if (a < 25000) {
      // A small landlocked body of salt water reads as a lake.
      const li = push('lake', bank.featureNamed('lake', f.culture[at], `slake${id}`), { type: 'Point', coordinates: point(at) }, a > 1e4 ? 2 : 3, 5, 11);
      waters.push({ label: li, at, cells, field: 'sea' });
      return;
    }
    const si = push(a > 4e5 ? 'sea' : 'inlandSea', bank.featureNamed(a > 4e5 ? 'sea' : 'inlandSea', f.culture[at], `esea${id}`), shape(cells, at, 1500), a > 4e5 ? 1 : 2, a > 4e5 ? 2.5 : 3.5, 8);
    waters.push({ label: si, at, cells, field: 'sea' });
    claim(at, 600);
  });
  const mainCells = seaC.list[main] ?? [];
  const mainArea = areaOf(mainCells);
  // Oceans: the open water furthest from land, about 5000 km apart.
  const byDepth = mainCells.filter((c) => distLand[c] > 700).sort((a, b) => distLand[b] - distLand[a]);
  const maxOceans = Math.max(1, Math.min(7, Math.round(mainArea / 2.5e7)));
  let nOcean = 0;
  for (const c of byDepth) {
    if (nOcean >= maxOceans) break;
    if (!clear(c, 4500)) continue;
    waters.push({ label: push('ocean', bank.featureNamed('ocean', f.culture[c], `ocean${nOcean}`), { type: 'Point', coordinates: point(c) }, 0, 1, 5.5), at: c, reach: REACH.ocean, field: 'sea' });
    claim(c, 4500);
    nOcean++;
  }
  // Seas: open water a few hundred km off the coasts, between the ocean labels.
  const jit = bank.rng('sea-jitter');
  const seaCand = mainCells.filter((c) => distLand[c] > 220 && distLand[c] < 650)
    .map((c) => ({ c, k: distLand[c] + jit() * 200 })).sort((a, b) => b.k - a.k).map((x) => x.c);
  let nSea = 0;
  for (const c of seaCand) {
    if (nSea >= 40) break;
    if (!clear(c, 1900)) continue;
    const si = push('sea', bank.featureNamed('sea', f.culture[c], `sea${nSea}`, baseFrom(c, 900, 0.25, `sea${nSea}`)), { type: 'Point', coordinates: point(c) }, 1, 2.5, 7);
    waters.push({ label: si, at: c, reach: REACH.sea, field: 'sea' });
    claim(c, 1900);
    nSea++;
  }

  // Coastline shapes from rays cast across the sea: how much of the horizon is land, and how near.
  const R = 720, DIRS = 16;
  type Probe = { c: number; hit: Float64Array };
  const probes: Probe[] = [];
  const bigSea = (c: number) => seaC.comp[c] === main || areaOf(seaC.list[seaC.comp[c]]) >= 25000;
  const bigSeaCache = new Uint8Array(seaC.list.length + 1);
  seaC.list.forEach((_, id) => (bigSeaCache[id] = bigSea(seaC.list[id][0]) ? 1 : 0));
  for (let c = 0; c < N; c++) {
    if (!isSea(c) || distLand[c] > 450 || distLand[c] < 25 || !bigSeaCache[seaC.comp[c]]) continue;
    const i = c % W, j = (c / W) | 0;
    if ((i + j) % 2) continue;
    const hit = new Float64Array(DIRS).fill(Infinity);
    const la0 = lat(c), lo0 = lon(c);
    const stepKm = Math.max(15, g.dyKm * 0.9);
    // Local flat approximation (fine over 700 km away from the poles).
    const kLon = 1 / (111.2 * Math.max(0.2, Math.cos((la0 * Math.PI) / 180))), fx = W / 360, fy = H / 180;
    for (let d = 0; d < DIRS; d++) {
      const a = (d / DIRS) * 2 * Math.PI, dlo = Math.cos(a) * stepKm * kLon, dla = (Math.sin(a) * stepKm) / 111.2;
      let lo = lo0, la = la0;
      for (let t = stepKm; t <= R; t += stepKm) {
        lo += dlo;
        la += dla;
        if (la > 89 || la < -89) break;
        const ci = ((Math.floor((lo + 180) * fx) % W) + W) % W, cj = Math.floor((90 - la) * fy);
        if (f.height[cj * W + ci] > 0) {
          hit[d] = t;
          break;
        }
      }
    }
    probes.push({ c, hit });
  }
  const within = (h: Float64Array, km: number) => h.reduce((a, v) => a + (v <= km ? 1 : 0), 0) / DIRS;
  type Cand = { kind: FeatureKind; c: number; score: number; spacing: number; geom?: LabelFeature['geometry']; rank: number; minz: number };
  const cands: Cand[] = [];
  for (const { c, hit } of probes) {
    const dl = distLand[c];
    const e700 = within(hit, 700), e300 = within(hit, 300), e450 = within(hit, 450);
    if (e700 >= 0.69 && dl >= 90) cands.push({ kind: 'gulf', c, score: e700 + dl / 600, spacing: 1100, rank: 1, minz: 3.2 });
    else if (e300 >= 0.69 && dl >= 30) cands.push({ kind: 'bay', c, score: e300 + dl / 400, spacing: 380, rank: 2, minz: 4.5 });
    else if (e450 >= 0.38 && e450 <= 0.6 && dl >= 50 && dl <= 260) {
      // A bight: one long, shallow arc of coast.
      let runs = 0;
      for (let d = 0; d < DIRS; d++) if (hit[d] <= 450 && hit[(d + DIRS - 1) % DIRS] > 450) runs++;
      if (runs === 1) cands.push({ kind: 'bight', c, score: 0.5 + dl / 500, spacing: 650, rank: 2, minz: 4 });
    }
    for (let d = 0; d < DIRS / 2; d++) {
      const a = hit[d], b = hit[d + DIRS / 2], p = hit[(d + DIRS / 4) % DIRS], q = hit[(d + (3 * DIRS) / 4) % DIRS];
      if (a + b > 460 || p < 500 || q < 500) continue;
      const channel = a + b > 230;
      // The label runs along the passage, across the land-to-land direction.
      const along = ((d + DIRS / 4) / DIRS) * 2 * Math.PI;
      const half = Math.min(260, channel ? 260 : 170);
      const la0 = lat(c), lo0 = lon(c), cl = Math.max(0.05, Math.cos((la0 * Math.PI) / 180));
      const coords = [-1, -0.5, 0, 0.5, 1].map((t) => [lo0 + (Math.cos(along) * half * t) / (111.2 * cl), la0 + (Math.sin(along) * half * t) / 111.2]);
      if (coords[0][0] > coords[4][0]) coords.reverse();
      cands.push({
        kind: channel ? 'channel' : 'strait', c, score: 2 + (p === Infinity ? 1 : 0) + (q === Infinity ? 1 : 0) - (a + b) / 460,
        spacing: channel ? 800 : 450, rank: 2, minz: channel ? 3.8 : 4.5, geom: { type: 'LineString', coordinates: coords },
      });
      break;
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const kindCount = new Map<string, number>();
  for (const cd of cands) {
    if (!clear(cd.c, cd.spacing)) continue;
    const k = kindCount.get(cd.kind) ?? 0;
    if (k >= 80) continue;
    kindCount.set(cd.kind, k + 1);
    const name = bank.featureNamed(cd.kind, f.culture[cd.c], `${cd.kind}${k}`, baseFrom(cd.c, 350, 0.4, `${cd.kind}${k}`));
    const ci = push(cd.kind, name, cd.geom ?? { type: 'Point', coordinates: point(cd.c) }, cd.rank, cd.minz, 10);
    waters.push({ label: ci, at: cd.c, reach: REACH[cd.kind] ?? 300, field: 'sea' });
    claim(cd.c, cd.spacing * 0.6);
  }

  // ---- Lakes -------------------------------------------------------------------------------
  const lakeC = components((c) => f.lakeDepth[c] > 0);
  lakeC.list.forEach((cells, id) => {
    const a = areaOf(cells);
    if (a < 300) return;
    const at = pole(cells);
    const kind: FeatureKind = a > 6e4 ? 'inlandSea' : 'lake';
    const li = push(kind, bank.featureNamed(kind, f.culture[at], `lake${id}`), shape(cells, at, 800), a > 6e4 ? 1 : a > 1e4 ? 2 : 3, a > 6e4 ? 3.5 : a > 1e4 ? 5 : 6.5, 11);
    waters.push({ label: li, at, cells, field: 'lake' });
  });
  labels.push(...waterAnchors(g, labels, waters, { sea: isSea, lake: (c) => f.lakeDepth[c] > 0 }, distLand, sampler));

  // ---- Rivers ------------------------------------------------------------------------------
  const riverName = new Map<number, Named>();
  for (const sys of rivers.systems ?? []) {
    // Name rivers that are long or large enough to matter on the map.
    if (sys.order < 2 && sys.cells < 6) continue;
    const c = sys.mouth;
    riverName.set(sys.rid, bank.featureNamed('river', f.culture[c], `river${sys.rid}`));
  }
  for (const rf of rivers.features) {
    const n = riverName.get(rf.properties.rid);
    if (n) {
      rf.properties.name = n.name;
      if (n.en !== n.name) rf.properties.en = n.en;
      if (n.old) rf.properties.old = n.old;
    }
  }

  // ---- Terrain regions ---------------------------------------------------------------------
  /** Majority-smoothed mask so regions have clean shapes. */
  const smooth = (raw: Uint8Array) => {
    const out = new Uint8Array(N);
    for (let c = 0; c < N; c++) {
      if (!isLand(c)) continue;
      const i = c % W, j = (c / W) | 0;
      let n = raw[c];
      for (let k = 0; k < 8; k++) {
        const nb = neighbor(g, i, j, k);
        if (nb >= 0) n += raw[nb];
      }
      out[c] = n >= 5 ? 1 : 0;
    }
    return out;
  };
  const region = (kind: FeatureKind, raw: (c: number) => boolean, minArea: number, minz: number, maxz: number, key: string) => {
    const m = new Uint8Array(N);
    for (let c = 0; c < N; c++) m[c] = isLand(c) && raw(c) ? 1 : 0;
    const sm = smooth(m);
    const comps = components((c) => sm[c] === 1);
    const out: { cells: number[]; at: number }[] = [];
    comps.list.forEach((cells, id) => {
      const a = areaOf(cells);
      if (a < minArea) return;
      const at = pole(cells);
      const big = a > minArea * 8;
      const li = push(kind, bank.featureNamed(kind, f.culture[at], `${key}${id}`), shape(cells, at), big ? 0 : 1, big ? minz - 0.8 : minz, maxz);
      // Smaller, more specific regions (forests, marshes) win over the broad ones drawn first.
      if (regionOf) for (const c of cells) regionOf[c] = li;
      out.push({ cells, at });
    });
    return out;
  };
  const ranges = region('mountains', (c) => f.height[c] > 1300, 35000, 4.2, 9.5, 'mtn');
  // Peaks: the highest points of the larger ranges, a few hundred km apart.
  ranges.forEach(({ cells }, r) => {
    if (areaOf(cells) < 80000) return;
    const sorted = [...cells].sort((a, b) => f.height[b] - f.height[a]);
    const chosen: number[] = [];
    for (const c of sorted) {
      if (chosen.length >= Math.min(4, Math.ceil(areaOf(cells) / 3e5))) break;
      if (chosen.every((p) => distKm(lon(p), lat(p), lon(c), lat(c)) > 350)) chosen.push(c);
    }
    chosen.forEach((c, k) => {
      const n = bank.featureNamed('peak', f.culture[c], `peak${r}_${k}`);
      const h = ` (${Math.round(f.height[c])} m)`;
      push('peak', { name: n.name + h, en: n.en + h }, { type: 'Point', coordinates: point(c) }, 2, 6, 12);
    });
  });
  region('hills', (c) => f.height[c] > 550 && f.height[c] <= 1300, 50000, 5.2, 10, 'hill');
  region('forest', (c) => FOREST.has(f.biome[c] as Biome), 70000, 4.8, 10, 'forest');
  region('desert', (c) => f.biome[c] === Biome.HotDesert || f.biome[c] === Biome.SaltFlat || f.biome[c] === Biome.IceSheet, 150000, 3.8, 8.5, 'desert');
  region('marsh', (c) => f.biome[c] === Biome.Wetland || f.biome[c] === Biome.Mangrove, 12000, 5.5, 10.5, 'marsh');
  region('plains', (c) => f.biome[c] === Biome.Grassland || f.biome[c] === Biome.Savanna || f.biome[c] === Biome.ColdDesert, 300000, 4, 8.5, 'plains');

  // Realms come from the political map (politics.ts).

  // ---- Roads -------------------------------------------------------------------------------
  const byId = new Map(settlements.map((s) => [s.id, s]));
  roads.features.forEach((rf, k) => {
    if (rf.properties.cls !== 'major') return;
    const a = byId.get(rf.properties.a), b = byId.get(rf.properties.b);
    const to = b ?? a;
    if (!to?.name) return;
    const r = bank.rng(`road${k}`)();
    const ci = to.culture ?? f.culture[cellOf(g, to.lon, to.lat)];
    const nm = bank.named(ci, r < 0.12 ? "the King's Road" : r < 0.3 ? 'the Old {0} Road' : 'the {0} Road', [{ name: to.name, en: to.nameEn ?? to.name }]);
    rf.properties.name = nm.name;
    if (nm.en !== nm.name) rf.properties.en = nm.en;
  });

  void H;
  void HYDROLOGY;
  return { type: 'FeatureCollection', features: labels };
}

// ---- Water lettering at close zoom ---------------------------------------------------------------

interface WaterBody {
  /** Index of the body's main label. */
  label: number;
  /** Pole (or seed) cell. */
  at: number;
  /** All its cells (lakes and enclosed seas) … */
  cells?: number[];
  /** … or, on the open sea, how far (km) its name carries from the seed. */
  reach?: number;
  field: 'sea' | 'lake';
}

/** How far (km) each kind of open-sea name reaches; nearer, smaller features win (weighted territories). */
const REACH: Partial<Record<string, number>> = { ocean: 2600, sea: 1100, gulf: 560, bight: 380, bay: 260, strait: 240, channel: 300 };
/** The closest zoom (exclusive) at which each kind is still lettered. */
const ZCAP: Partial<Record<string, number>> = { ocean: 8, sea: 10, inlandSea: 11, gulf: 11, bight: 12, bay: 12, strait: 12, channel: 12, lake: 13 };
/** Screen spacing (px) of the anchor lattice; at the end of a band (one zoom in) it has doubled. */
const LATTICE_PX = 360;
/** Most anchors one body may have in a band; past that its lettering stops. */
const MAX_PER_BAND = 250;
const EARTH_KM = 40075.017;
/** Points of a label's footprint (in half-widths and half-heights) that must all be water. */
const FOOT: [number, number][] = [[0, 0], [-1, 0], [1, 0], [-0.5, 1], [0.5, -1], [-0.5, -1], [0.5, 1]];

/**
 * Close-zoom lettering for water bodies. MapLibre shows a point label only while its anchor is on
 * screen, so a single anchor vanishes as soon as one zooms into a large lake or bay. Instead each
 * body keeps its main label until it spans about one screen, and from then on is lettered from a
 * lattice of anchors fixed in Web Mercator space (a few per screen), one lattice per whole zoom
 * band. Anchors well inside the water (on an interpolated distance-to-shore field) are kept as
 * they are; near the shore the label's footprint is tested against the coastline as the tiles
 * draw it at that zoom (the detail sampler), so close-in labels can sit in narrow water too.
 */
function waterAnchors(g: Grid, labels: LabelFeature[], waters: WaterBody[], masks: { sea: (c: number) => boolean; lake: (c: number) => boolean }, distLand: Float64Array, sampler?: DetailSampler): LabelFeature[] {
  const { W, H, N } = g;
  const half = g.dyKm * 0.5;
  // Distance (km) from each wet cell centre to the nearest dry cell centre.
  const edge = (mask: (c: number) => boolean) => {
    const d = new Float32Array(N).fill(-half);
    const dist = new Float64Array(N).fill(Infinity);
    const heap = new MinHeap(4096);
    // Seeds: dry cells next to the water.
    for (let c = 0; c < N; c++) {
      if (!mask(c)) continue;
      const i = c % W, j = (c / W) | 0;
      for (let k = 0; k < 8; k++) {
        const n = neighbor(g, i, j, k);
        if (n >= 0 && !mask(n) && dist[n] > 0) {
          dist[n] = 0;
          heap.push(n, 0);
        }
      }
    }
    while (heap.size) {
      const c = heap.pop(), dc = heap.lastKey;
      if (dc > dist[c]) continue;
      const i = c % W, j = (c / W) | 0;
      for (let k = 0; k < 8; k++) {
        const n = neighbor(g, i, j, k);
        if (n < 0 || !mask(n)) continue;
        const nd = dc + g.nbDist[j * 8 + k];
        if (nd < dist[n]) {
          dist[n] = nd;
          heap.push(n, nd);
        }
      }
    }
    // Shore lies about half a cell out from the last wet centre.
    for (let c = 0; c < N; c++) if (mask(c) && dist[c] < Infinity) d[c] = dist[c] - half;
    return d;
  };
  // The sea's distance to land is already known (cell centres to the nearest land cell).
  const seaF = new Float32Array(N);
  for (let c = 0; c < N; c++) seaF[c] = masks.sea(c) && distLand[c] < Infinity ? distLand[c] - half : -half;
  const fields = { sea: seaF, lake: edge(masks.lake) };
  const sample = (fld: Float32Array, lon: number, lat: number) => {
    const fx = ((lon + 180) / 360) * W - 0.5, fy = ((90 - lat) / 180) * H - 0.5;
    const i0 = Math.floor(fx), j0 = Math.max(0, Math.min(H - 2, Math.floor(fy)));
    const tx = fx - i0, ty = Math.max(0, Math.min(1, fy - j0));
    const a = ((i0 % W) + W) % W, b = (a + 1) % W;
    const r0 = j0 * W, r1 = r0 + W;
    return (fld[r0 + a] * (1 - tx) + fld[r0 + b] * tx) * (1 - ty) + (fld[r1 + a] * (1 - tx) + fld[r1 + b] * tx) * ty;
  };

  // Territories: whole components for lakes and enclosed seas; on the open sea, a Dijkstra in which
  // each name's cost grows with distance over its reach, so a bay holds its own water against the sea.
  const owner = new Int32Array(N).fill(-1);
  const cost = new Float64Array(N).fill(Infinity);
  const heap = new MinHeap(4096);
  waters.forEach((w, k) => {
    if (w.cells) for (const c of w.cells) owner[c] = k;
  });
  waters.forEach((w, k) => {
    if (w.cells || owner[w.at] >= 0) return;
    cost[w.at] = 0;
    owner[w.at] = k;
    heap.push(w.at, 0);
  });
  while (heap.size) {
    const c = heap.pop(), dc = heap.lastKey;
    if (dc > cost[c]) continue;
    const k = owner[c], reach = waters[k].reach!;
    const i = c % W, j = (c / W) | 0;
    for (let d = 0; d < 8; d++) {
      const n = neighbor(g, i, j, d);
      if (n < 0 || !masks.sea(n) || (owner[n] >= 0 && waters[owner[n]].cells)) continue;
      const nd = dc + g.nbDist[j * 8 + d] / reach;
      if (nd < cost[n] && nd <= 1) {
        cost[n] = nd;
        owner[n] = k;
        heap.push(n, nd);
      }
    }
  }
  const cellsOf: number[][] = waters.map(() => []);
  for (let c = 0; c < N; c++) if (owner[c] >= 0) cellsOf[owner[c]].push(c);

  const lonOf = (c: number) => g.lonDeg[c % W], latOf = (c: number) => g.latDeg[(c / W) | 0];
  const mercY = (lat: number) => 0.5 - Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360)) / (2 * Math.PI);
  const latOfY = (y: number) => (Math.atan(Math.sinh((0.5 - y) * 2 * Math.PI)) * 180) / Math.PI;
  const out: LabelFeature[] = [];
  waters.forEach((w, k) => {
    const main = labels[w.label];
    const p = main.properties;
    const cells = cellsOf[k];
    const fld = fields[w.field];
    const cap = ZCAP[p.kind] ?? 11;
    if (!cells.length) return;
    // Size and extent (longitude unwrapped about the seed).
    const lon0 = lonOf(w.at);
    let areaKm = 0, lo = Infinity, hi = -Infinity, la0 = Infinity, la1 = -Infinity;
    for (const c of cells) {
      areaKm += g.areaKm2[(c / W) | 0];
      const dl = ((lonOf(c) - lon0 + 540) % 360) - 180, la = latOf(c);
      if (dl < lo) lo = dl;
      if (dl > hi) hi = dl;
      if (la < la0) la0 = la;
      if (la > la1) la1 = la;
    }
    const pad = (180 / H) * 0.6;
    lo -= pad * 2; hi += pad * 2; la0 -= pad; la1 += pad;
    const latC = latOf(w.at), cosC = Math.max(0.05, Math.cos((latC * Math.PI) / 180));
    // Zoom at which the body is about 700 px across: below it the main label alone does.
    // Elongated bodies count by their length, not just their area.
    const diam = Math.max(2 * Math.sqrt(areaKm / Math.PI), Math.min((hi - lo) * 111.2 * cosC, (la1 - la0) * 111.2) * 0.5, Math.max((hi - lo) * 111.2 * cosC, (la1 - la0) * 111.2) * 0.7);
    const zFill = Math.log2((EARTH_KM * cosC * 700) / (512 * Math.max(1, diam)));
    const zStart = Math.max(Math.ceil(p.minz), Math.round(zFill));
    if (zStart >= cap) {
      p.zlo = 0;
      p.zhi = cap;
      return;
    }
    p.zlo = 0;
    p.zhi = zStart;
    let zEnd = zStart;
    for (let z = zStart; z < cap; z++) {
      const step = LATTICE_PX / (512 * 2 ** z);
      const y0 = mercY(la1), y1 = mercY(la0);
      const x0 = (lon0 + lo + 180) / 360, x1 = (lon0 + hi + 180) / 360;
      const rows = Math.ceil((y1 - y0) / step) + 1, cols = Math.ceil((x1 - x0) / step) + 1;
      if (rows * cols > 400000) break;
      // Skip the work for a band that would clearly be over budget.
      const sKm = (LATTICE_PX * EARTH_KM * cosC) / (512 * 2 ** z);
      if (areaKm / (sKm * sKm) > MAX_PER_BAND * 1.6) break;
      const band: LabelFeature[] = [];
      const spare: [number, number, number][] = [];
      for (let r = Math.floor(y0 / step); r * step <= y1 + step; r++) {
        const y = r * step;
        const lat = latOfY(y);
        if (lat < la0 || lat > la1) continue;
        const kmpp = (EARTH_KM * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** z);
        // Label footprint (km): about 75 px either side, 12 px above and below.
        const hw = 75 * kmpp, hh = 12 * kmpp;
        const safe = hw + 22;
        const off = (r & 1) * 0.5 * step;
        for (let q = Math.floor((x0 - off) / step); q * step + off <= x1; q++) {
          const lon = (q * step + off) * 360 - 180;
          const lonW = ((lon + 540) % 360) - 180;
          const c = cellOfLL(W, H, lonW, lat);
          if (owner[c] !== k) continue;
          const dep = sample(fld, lonW, lat);
          if (dep > 0) spare.push([lonW, lat, dep]);
          if (dep < (sampler ? Math.min(safe, -half * 0.3) : Math.max(14, hw))) continue;
          if (dep < safe) {
            // Near the shore: the drawn coastline at this zoom decides.
            if (!sampler || dep < hw * 0.5) continue;
            const kLon = 1 / (111.2 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
            let wet = true;
            for (const [dx, dy] of FOOT) {
              const lo = lonW + dx * hw * kLon, la = lat + (dy * hh) / 111.2;
              if (!sampler.isWater(lo, la, sampler.height(lo, la, kmpp * 3, false))) {
                wet = false;
                break;
              }
            }
            if (!wet) continue;
          }
          band.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [Math.round(lonW * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4] }, properties: { kind: p.kind, name: p.name, ...(p.en ? { en: p.en } : {}), rank: p.rank, zlo: z, zhi: z + 1 } as LabelFeature['properties'] });
        }
      }
      if (band.length > MAX_PER_BAND) break;
      // Too narrow for a whole label at this zoom: use the lattice points deepest in the water
      // (along the middle of a long lake or inlet), or failing that the main anchor.
      if (!band.length) {
        const top = spare.reduce((m, q) => Math.max(m, q[2]), 0);
        for (const [x, y, dep] of spare) {
          if (dep >= top * 0.7) band.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4] }, properties: { kind: p.kind, name: p.name, ...(p.en ? { en: p.en } : {}), rank: p.rank, zlo: z, zhi: z + 1 } as LabelFeature['properties'] });
        }
        if (!band.length) band.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lonOf(w.at), latOf(w.at)] }, properties: { kind: p.kind, name: p.name, ...(p.en ? { en: p.en } : {}), rank: p.rank, zlo: z, zhi: z + 1 } as LabelFeature['properties'] });
      }
      out.push(...band);
      zEnd = z + 1;
    }
    // If the lattice never took over, the main label carries on to the cap.
    if (zEnd === zStart) p.zhi = cap;
  });
  return out;
}

function cellOfLL(W: number, H: number, lon: number, lat: number): number {
  const i = ((Math.floor(((lon + 180) / 360) * W) % W) + W) % W;
  const j = Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H)));
  return j * W + i;
}

export function cellOf(g: Grid, lon: number, lat: number): number {
  const i = ((Math.floor(((lon + 180) / 360) * g.W) % g.W) + g.W) % g.W;
  const j = Math.min(g.H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * g.H)));
  return j * g.W + i;
}
