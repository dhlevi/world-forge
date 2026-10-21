import { type Grid, distKm, neighbor } from './grid';
import { Biome } from './biomes';
import { hashString, mulberry32, type Rng } from './rng';
import type { FlowRouting } from './hydrology';
import type { RiverCollection } from './rivers';
import type { Settlement } from './settlements';
import type { LabelFeature } from './features';
import { type NameBank, type Named, dungeonName } from '../names/names';
import { CULTURES, type FeatureKind } from '../names/cultures';

/**
 * Special features of the land, found after the world is made (on random streams of their own,
 * so nothing made before them changes):
 *
 * - **Volcanoes** along the volcanic arcs behind subduction zones and over a few hotspots (from the
 *   plate model's volcanism), active, dormant or extinct, with dark volcanic ground about them and
 *   fresh lava fields about the active ones.
 * - **Ash lands** spread downwind of the most active volcanoes.
 * - **Geysers** and **rainbow pools** (sulphur and hot-spring pools) in volcanic country, and
 *   mineral lakes of many colours in the deserts.
 * - **Glaciers** in high, cold, snowy mountains, with tongues reaching down their valleys.
 * - **Mushroom forests** (in fantasy worlds) in warm, wet country, best of all on volcanic soil.
 * - **Canyons** where large rivers cut through dry uplands, and **cliffs** along high coasts and
 *   great escarpments.
 * - **Cursed lands** (in fantasy worlds): a few woods and mires blighted by an old curse, each
 *   with an abandoned village, a ruin or a crypt at its heart and a story of how it came about.
 * - **Mages' towers** in some cities: a college of magic in about half the university cities and,
 *   in fantasy worlds, a tower in some other great cities.
 *
 * Each cell gets one special value (for the map tiles and the probe); named features become
 * labels; volcanoes are kept as vents for the map's icons; and towns near them take note.
 */

export const SP = { none: 0, ash: 1, lava: 2, glacier: 3, fungal: 4, canyon: 5, cliff: 6, volcanic: 7, geothermal: 8, cursed: 9 } as const;
export const SP_NAMES = ['', 'Ash land', 'Lava field', 'Glacier', 'Mushroom forest', 'Canyon', 'Cliffs', 'Volcanic ground', 'Geothermal field', 'Cursed land'];

/** The heart of a cursed land: what stands there, its name, and the story of the curse. */
export interface CurseHeart {
  lon: number;
  lat: number;
  kind: 'village' | 'ruin' | 'crypt';
  name: string;
  en: string;
  /** The cursed land's name. */
  region: string;
  regionEn: string;
  /** A cursed mire (else a wood). */
  mire: boolean;
  /** How the curse came about and what it does now (English). */
  story: string;
  culture: number;
}

export interface SpecialInputs {
  height: Float32Array;
  lakeDepth: Float32Array;
  temp: Float32Array;
  tempWarm: Float32Array;
  precip: Float32Array;
  windU: Float32Array;
  windV: Float32Array;
  biome: Uint8Array;
  culture: Uint8Array;
  volcanic: Float32Array;
  flow: FlowRouting;
  /** 1 where the land is New World. */
  newWorld?: Uint8Array;
}

/** A volcano: where, how high, and how active (2 active, 1 dormant, 0 extinct). */
export interface Vent {
  lon: number;
  lat: number;
  h: number;
  activity: 0 | 1 | 2;
  name: string;
  en?: string;
}

export interface SpecialResult {
  special: Uint8Array;
  vents: Vent[];
  labels: LabelFeature[];
  curses: CurseHeart[];
}

const ACTIVITY = ['extinct', 'dormant', 'active'];

export function specialFeatures(
  g: Grid, f: SpecialInputs, rivers: RiverCollection, settlements: Settlement[], bank: NameBank, seed: string, fantasy: boolean,
): SpecialResult {
  const { W, H, N } = g;
  const sp = new Uint8Array(N);
  const labels: LabelFeature[] = [];
  const lon = (c: number) => g.lonDeg[c % W], lat = (c: number) => g.latDeg[(c / W) | 0];
  const area = (c: number) => g.areaKm2[(c / W) | 0];
  const land = (c: number) => f.height[c] > 0 && f.lakeDepth[c] <= 0;
  const rng = (k: string): Rng => mulberry32(hashString(`${seed}#special#${k}`));
  const cellAt = (lo: number, la: number) => {
    const i = ((Math.floor(((lo + 180) / 360) * W) % W) + W) % W;
    return Math.min(H - 1, Math.max(0, Math.floor(((90 - la) / 180) * H))) * W + i;
  };
  const push = (kind: FeatureKind, n: Named, geom: LabelFeature['geometry'], rank: number, minz: number, maxz: number) => {
    labels.push({ type: 'Feature', geometry: geom, properties: { kind, name: n.name, ...(n.en !== n.name ? { en: n.en } : {}), rank, minz, maxz } } as LabelFeature);
  };
  const pt = (c: number) => ({ type: 'Point' as const, coordinates: [lon(c), lat(c)] });
  /** Cells within `km` of a cell (a small breadth-first disc). */
  const disc = (c0: number, km: number, fn: (c: number, d: number) => void) => {
    const lo0 = lon(c0), la0 = lat(c0);
    const rj = Math.ceil(km / g.dyKm) + 1;
    const j0 = (c0 / W) | 0, i0 = c0 % W;
    for (let dj = -rj; dj <= rj; dj++) {
      const j = j0 + dj;
      if (j < 0 || j >= H) continue;
      const ri = Math.min(W / 2, Math.ceil(km / Math.max(1, g.dxKm[j])) + 1);
      for (let di = -ri; di <= ri; di++) {
        const c = j * W + (((i0 + di) % W) + W) % W;
        const d = distKm(lo0, la0, lon(c), lat(c));
        if (d <= km) fn(c, d);
      }
    }
  };
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
    return list;
  };
  /** The cell of a set nearest its middle (a spherical mean, then the nearest member). */
  const middle = (cells: number[]) => {
    let x = 0, y = 0, z = 0;
    for (const c of cells) {
      const j = (c / W) | 0, i = c % W;
      x += g.cosLat[j] * g.cosLon[i];
      y += g.cosLat[j] * g.sinLon[i];
      z += g.sinLat[j];
    }
    const lo = (Math.atan2(y, x) * 180) / Math.PI, la = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
    let best = cells[0], bd = Infinity;
    for (const c of cells) {
      const d = distKm(lo, la, lon(c), lat(c));
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  };
  const areaOf = (cells: number[]) => cells.reduce((a, c) => a + area(c), 0);
  /** A label line through a chain of points (thinned to at most `max` points), or a point for short chains. */
  const lineOf = (pts: number[][], max = 14): LabelFeature['geometry'] => {
    if (pts.length < 2) return { type: 'Point', coordinates: pts[0] };
    const step = Math.max(1, Math.ceil(pts.length / max));
    const out = pts.filter((_, k) => k % step === 0);
    if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
    // Unwrap longitudes across the date line.
    for (let k = 1; k < out.length; k++) {
      while (out[k][0] - out[k - 1][0] > 180) out[k] = [out[k][0] - 360, out[k][1]];
      while (out[k][0] - out[k - 1][0] < -180) out[k] = [out[k][0] + 360, out[k][1]];
    }
    if (out[0][0] > out[out.length - 1][0]) out.reverse();
    return { type: 'LineString', coordinates: out };
  };
  let landArea = 0;
  for (let c = 0; c < N; c++) if (f.height[c] > 0) landArea += area(c);

  // ---- Volcanoes ------------------------------------------------------------------------------
  let vmax = 0;
  for (let c = 0; c < N; c++) if (f.height[c] > 0) vmax = Math.max(vmax, f.volcanic[c]);
  const r = rng('volcanoes');
  type Cand = { c: number; score: number; hot: boolean };
  const cands: Cand[] = [];
  if (vmax > 0) {
    for (let c = 0; c < N; c++) {
      if (!land(c)) continue;
      const v = f.volcanic[c] / vmax;
      if (v < 0.3) continue;
      cands.push({ c, score: v * (0.55 + 0.45 * Math.min(1, f.height[c] / 3000)) + 0.25 * r(), hot: false });
    }
  }
  // Hotspots: a few plumes rising wherever they happen to be, making volcanoes where they meet land.
  const rh = rng('hotspots');
  const nHot = 2 + Math.floor(rh() * 4);
  for (let k = 0; k < nHot; k++) {
    const z = 2 * rh() - 1, a = rh() * 2 * Math.PI;
    const la = (Math.asin(z) * 180) / Math.PI * 0.85, lo = (a * 180) / Math.PI - 180;
    let c = cellAt(lo, la);
    if (!land(c)) {
      let found = -1;
      disc(c, 120, (n) => {
        if (found < 0 && land(n)) found = n;
      });
      c = found;
    }
    if (c >= 0) cands.push({ c, score: 2, hot: true });
  }
  cands.sort((a, b) => b.score - a.score);
  const maxV = Math.max(5, Math.min(13, Math.round(landArea / 4e6))) + nHot;
  const chosen: Cand[] = [];
  for (const cd of cands) {
    if (chosen.length >= maxV) break;
    if (chosen.some((o) => distKm(lon(o.c), lat(o.c), lon(cd.c), lat(cd.c)) < 320)) continue;
    // The cone stands on the highest ground close by.
    let best = cd.c;
    disc(cd.c, 60, (n) => {
      if (land(n) && f.height[n] > f.height[best]) best = n;
    });
    chosen.push({ ...cd, c: best });
  }
  const vents: Vent[] = [];
  const ventCells: { c: number; activity: 0 | 1 | 2; score: number }[] = [];
  chosen.forEach((cd, k) => {
    const x = r();
    const activity: 0 | 1 | 2 = x < (cd.hot ? 0.5 : 0.32) ? 2 : x < 0.72 ? 1 : 0;
    const n = bank.featureNamed('volcano', f.culture[cd.c], `volcano${k}`);
    const hm = Math.round(Math.max(f.height[cd.c], 400 + 1200 * r()));
    vents.push({ lon: lon(cd.c), lat: lat(cd.c), h: hm, activity, name: n.name, ...(n.en !== n.name ? { en: n.en } : {}) });
    ventCells.push({ c: cd.c, activity, score: cd.score });
    const tag = ` (${hm} m, ${ACTIVITY[activity]})`;
    push('volcano', { name: n.name + tag, en: n.en + tag }, pt(cd.c), activity === 2 ? 1 : 2, activity === 2 ? 4.2 : 5.2, 12);
  });
  // Volcanic ground about every volcano; fresh lava about the active ones.
  for (const v of ventCells) {
    const rr = rng(`vent${v.c}`);
    disc(v.c, v.activity === 0 ? 70 : 120, (c, d) => {
      if (land(c) && sp[c] === SP.none && d < (v.activity === 0 ? 70 : 120) * (0.75 + 0.25 * rr())) sp[c] = SP.volcanic;
    });
    if (v.activity === 2) {
      const R = 40 + 35 * rr();
      disc(v.c, R, (c, d) => {
        if (land(c) && d < R * (0.6 + 0.4 * rr())) sp[c] = SP.lava;
      });
    }
  }

  // ---- Ash lands --------------------------------------------------------------------------------
  const ashSources = ventCells.filter((v) => v.activity === 2).sort((a, b) => b.score - a.score).slice(0, 4);
  for (const v of ashSources) {
    const ra = rng(`ash${v.c}`);
    let u = f.windU[v.c], w = f.windV[v.c];
    const m = Math.hypot(u, w);
    if (m < 0.5) {
      const a = ra() * 2 * Math.PI;
      u = Math.cos(a);
      w = Math.sin(a);
    } else {
      u /= m;
      w /= m;
    }
    const L = 260 + 380 * ra(), half = L * (0.28 + 0.12 * ra());
    const lo0 = lon(v.c), la0 = lat(v.c), cl = Math.max(0.1, Math.cos((la0 * Math.PI) / 180));
    const phase = ra() * 10;
    disc(v.c, L + 40, (c) => {
      if (!land(c) || sp[c] === SP.lava) return;
      let dlo = lon(c) - lo0;
      dlo = ((dlo + 540) % 360) - 180;
      const x = dlo * 111.2 * cl, y = (lat(c) - la0) * 111.2;
      const along = x * u + y * w, across = -x * w + y * u;
      if (along < -50 || along > L) return;
      const widthHere = half * (0.35 + 0.65 * Math.min(1, Math.max(0, along) / (L * 0.5))) * (along > L * 0.7 ? (L - along) / (L * 0.3) : 1);
      const wob = 1 + 0.25 * Math.sin(along / 37 + phase) + 0.15 * Math.sin(across / 23 + phase * 1.7);
      if (Math.abs(across) < widthHere * wob) sp[c] = SP.ash;
    });
  }
  components((c) => sp[c] === SP.ash).forEach((cells, id) => {
    const a = areaOf(cells);
    if (a < 12000) return;
    const at = middle(cells);
    push('ashland', bank.featureNamed('ashland', f.culture[at], `ash${id}`), pt(at), a > 1e5 ? 1 : 2, a > 1e5 ? 4.4 : 5.2, 10);
  });

  // ---- Geysers and rainbow pools -------------------------------------------------------------------
  const pois: { c: number }[] = [];
  const freeSpot = (c0: number, minKm: number, maxKm: number, rr: Rng, ok: (c: number) => boolean) => {
    for (let t = 0; t < 30; t++) {
      const a = rr() * 2 * Math.PI, d = minKm + (maxKm - minKm) * rr();
      const la = lat(c0) + (Math.sin(a) * d) / 111.2;
      if (la > 84 || la < -84) continue;
      const lo = lon(c0) + (Math.cos(a) * d) / (111.2 * Math.max(0.1, Math.cos((lat(c0) * Math.PI) / 180)));
      const c = cellAt(lo, la);
      if (!land(c) || !ok(c)) continue;
      if (pois.some((p) => distKm(lon(p.c), lat(p.c), lon(c), lat(c)) < 90)) continue;
      return c;
    }
    return -1;
  };
  let nGey = 0, nPool = 0;
  ventCells.forEach((v) => {
    if (v.activity === 0) return;
    const rr = rng(`geo${v.c}`);
    const ok = (c: number) => f.height[c] < 3200 && f.biome[c] !== Biome.IceSheet;
    if (rr() < 0.6) {
      const c = freeSpot(v.c, 50, 220, rr, ok);
      if (c >= 0) {
        pois.push({ c });
        sp[c] = SP.geothermal;
        push('geysers', bank.featureNamed('geysers', f.culture[c], `geyser${nGey++}`), pt(c), 2, 5.6, 12);
      }
    }
    if (rr() < 0.5) {
      const c = freeSpot(v.c, 40, 200, rr, ok);
      if (c >= 0) {
        pois.push({ c });
        sp[c] = SP.geothermal;
        push('hotLake', bank.featureNamed('hotLake', f.culture[c], `pool${nPool++}`), pt(c), 2, 5.6, 12);
      }
    }
  });
  // Mineral lakes of many colours in the dry lands: salt flats and the lakes of desert basins.
  {
    const rr = rng('mineral');
    const dry: number[] = [];
    for (let c = 0; c < N; c++) {
      const b = f.biome[c] as Biome;
      if (land(c) && (b === Biome.SaltFlat || ((b === Biome.HotDesert || b === Biome.ColdDesert) && f.height[c] > 500))) dry.push(c);
    }
    const want = Math.min(dry.length, 1 + Math.floor(rr() * 3));
    for (let t = 0; t < 60 && want > 0 && nPool < 40; t++) {
      const c = dry[Math.floor(rr() * dry.length)];
      if (pois.some((p) => distKm(lon(p.c), lat(p.c), lon(c), lat(c)) < 600)) continue;
      pois.push({ c });
      push('hotLake', bank.featureNamed('hotLake', f.culture[c], `pool${nPool++}`), pt(c), 2, 5.6, 12);
      if (pois.filter((p) => f.biome[p.c] === Biome.SaltFlat || f.biome[p.c] === Biome.HotDesert || f.biome[p.c] === Biome.ColdDesert).length >= want) break;
    }
  }

  // ---- Glaciers ------------------------------------------------------------------------------------
  for (let c = 0; c < N; c++) {
    if (!land(c) || f.biome[c] === Biome.IceSheet || sp[c] !== SP.none) continue;
    if (f.height[c] > 1500 && f.tempWarm[c] < 6 && f.precip[c] > 350) sp[c] = SP.glacier;
  }
  // Tongues down the valleys.
  for (let c = 0; c < N; c++) {
    if (sp[c] !== SP.glacier) continue;
    let x = c;
    for (let s = 0; s < 3; s++) {
      const n = f.flow.recv[x];
      if (n === x || n < 0 || !land(n) || f.tempWarm[n] > 10 || f.height[n] < 600) break;
      if (sp[n] === SP.none) sp[n] = SP.glacier;
      x = n;
    }
  }
  components((c) => sp[c] === SP.glacier || (land(c) && f.biome[c] === Biome.IceSheet && f.height[c] > 1200))
    .map((cells) => ({ cells, a: areaOf(cells) }))
    .filter((x) => x.a >= 2500 && x.cells.some((c) => sp[c] === SP.glacier))
    .sort((a, b) => b.a - a.a)
    .slice(0, 18)
    .forEach(({ cells, a }, id) => {
      const at = middle(cells);
      push('glacier', bank.featureNamed('glacier', f.culture[at], `glacier${id}`), pt(at), a > 40000 ? 1 : 2, a > 40000 ? 4.6 : 5.6, 11);
    });

  // ---- Mushroom forests (fantasy) -----------------------------------------------------------------
  if (fantasy) {
    const rf = rng('fungal');
    const WET = new Set([Biome.TemperateRainforest, Biome.TropicalRainforest, Biome.Wetland, Biome.TemperateForest, Biome.MontaneForest]);
    const seeds: { c: number; s: number }[] = [];
    for (let c = 0; c < N; c++) {
      if (!land(c) || !WET.has(f.biome[c] as Biome) || f.precip[c] < 1000 || f.temp[c] < 5 || f.temp[c] > 27) continue;
      seeds.push({ c, s: rf() + (sp[c] === SP.volcanic || sp[c] === SP.ash ? 1.2 : 0) });
    }
    seeds.sort((a, b) => b.s - a.s);
    const n = 1 + Math.floor(rf() * 2.6);
    const picked: number[] = [];
    for (const s of seeds) {
      if (picked.length >= n) break;
      if (picked.some((p) => distKm(lon(p), lat(p), lon(s.c), lat(s.c)) < 1500)) continue;
      picked.push(s.c);
    }
    picked.forEach((c0, id) => {
      const target = 25000 + 70000 * rf();
      const cells = [c0];
      const seen = new Set([c0]);
      let a = 0;
      for (let q = 0; q < cells.length && a < target; q++) {
        const c = cells[q];
        if (sp[c] !== SP.lava && sp[c] !== SP.glacier) {
          sp[c] = SP.fungal;
          a += area(c);
        }
        const i = c % W, j = (c / W) | 0;
        for (let k = 0; k < 8; k++) {
          const nb = neighbor(g, i, j, k);
          if (nb < 0 || seen.has(nb) || !land(nb)) continue;
          seen.add(nb);
          const b = f.biome[nb] as Biome;
          if (f.precip[nb] < 700 || b === Biome.IceSheet || b === Biome.HotDesert || b === Biome.SaltFlat || rf() < 0.18) continue;
          cells.push(nb);
        }
      }
      const fc = cells.filter((c) => sp[c] === SP.fungal);
      if (!fc.length) return;
      const at = middle(fc);
      push('fungalForest', bank.featureNamed('fungalForest', f.culture[at], `fungal${id}`), pt(at), 1, 4.6, 10.5);
    });
  }

  // ---- Canyons -------------------------------------------------------------------------------------
  {
    const runs: { rid: number; pts: number[][]; cells: number[]; km: number }[] = [];
    for (const rf of rivers.features) {
      if (rf.properties.order < 2) continue;
      let cur: { pts: number[][]; cells: number[]; km: number } | null = null;
      const flush = () => {
        if (cur && cur.km >= 120) runs.push({ rid: rf.properties.rid, ...cur });
        cur = null;
      };
      const co = rf.geometry.coordinates;
      for (let k = 0; k < co.length; k++) {
        const c = cellAt(co[k][0], co[k][1]);
        const i = c % W, j = (c / W) | 0;
        let rim = 0;
        for (let q = 0; q < 8; q++) {
          const n = neighbor(g, i, j, q);
          if (n >= 0) rim = Math.max(rim, f.height[n] - f.height[c]);
        }
        const ok = f.height[c] > 350 && f.precip[c] < 800 && (rim > 50 || f.height[c] > 900) && f.biome[c] !== Biome.IceSheet;
        if (!ok) {
          flush();
          continue;
        }
        if (!cur) cur = { pts: [], cells: [], km: 0 };
        const c2: { pts: number[][]; cells: number[]; km: number } = cur;
        if (c2.pts.length) c2.km += distKm(c2.pts[c2.pts.length - 1][0], c2.pts[c2.pts.length - 1][1], co[k][0], co[k][1]);
        c2.pts.push(co[k]);
        if (!c2.cells.includes(c)) c2.cells.push(c);
      }
      flush();
    }
    const byRid = new Map<number, (typeof runs)[number]>();
    for (const run of runs) if (!byRid.has(run.rid) || byRid.get(run.rid)!.km < run.km) byRid.set(run.rid, run);
    [...byRid.values()].sort((a, b) => b.km - a.km).slice(0, 12).forEach((run, id) => {
      for (const c of run.cells) if (sp[c] === SP.none || sp[c] === SP.volcanic) sp[c] = SP.canyon;
      const mid = run.cells[Math.floor(run.cells.length / 2)];
      push('canyon', bank.featureNamed('canyon', f.culture[mid], `canyon${id}`), lineOf(run.pts, 40), run.km > 400 ? 1 : 2, run.km > 400 ? 4.8 : 5.8, 12);
    });
  }

  // ---- Cliffs --------------------------------------------------------------------------------------
  {
    const cliff = new Uint8Array(N);
    for (let c = 0; c < N; c++) {
      if (!land(c) || f.height[c] < 300) continue;
      const i = c % W, j = (c / W) | 0;
      let sea = false, drop = 0;
      for (let k = 0; k < 8; k++) {
        const n = neighbor(g, i, j, k);
        if (n < 0) continue;
        if (f.height[n] <= 0) sea = true;
        else drop = Math.max(drop, f.height[c] - f.height[n]);
      }
      if ((sea && f.height[c] >= 350) || (drop >= 900 && f.height[c] > 600)) cliff[c] = 1;
    }
    const chains = components((c) => cliff[c] === 1).filter((cells) => cells.length >= 6);
    const lines = chains.map((cells) => {
      // Order the cells into a chain: from the cell furthest from the middle, always to the nearest unvisited one.
      const m = middle(cells);
      let start = cells[0], sd = -1;
      for (const c of cells) {
        const d = distKm(lon(m), lat(m), lon(c), lat(c));
        if (d > sd) {
          sd = d;
          start = c;
        }
      }
      const left = new Set(cells);
      const order = [start];
      left.delete(start);
      let km = 0;
      while (left.size) {
        const last = order[order.length - 1];
        let best = -1, bd = Infinity;
        for (const c of left) {
          const d = distKm(lon(last), lat(last), lon(c), lat(c));
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
        if (bd > g.dyKm * 2.6) break;
        order.push(best);
        left.delete(best);
        km += bd;
      }
      return { order, km };
    }).filter((l) => l.km >= 150).sort((a, b) => b.km - a.km).slice(0, 16);
    lines.forEach((l, id) => {
      for (const c of l.order) if (sp[c] === SP.none) sp[c] = SP.cliff;
      const mid = l.order[Math.floor(l.order.length / 2)];
      push('cliffs', bank.featureNamed('cliffs', f.culture[mid], `cliffs${id}`), lineOf(l.order.map((c) => [lon(c), lat(c)]), 30), l.km > 500 ? 1 : 2, l.km > 500 ? 5 : 6, 12);
    });
  }

  // ---- Cursed lands (fantasy) -----------------------------------------------------------------------
  const curses: CurseHeart[] = [];
  if (fantasy) {
    const rc = rng('curse');
    const WOOD = new Set([Biome.BorealForest, Biome.TemperateForest, Biome.TemperateRainforest, Biome.TropicalDryForest, Biome.TropicalRainforest, Biome.MontaneForest]);
    const MIRE = new Set([Biome.Wetland, Biome.Mangrove, Biome.Riparian]);
    // Cursed lands begin far from cities and towns (the people left them long ago), and spread
    // round the towns' own fields.
    const nearTown = new Uint8Array(N), farTown = new Uint8Array(N);
    for (const s of settlements) {
      if (s.tier !== 'city' && s.tier !== 'town') continue;
      const c0 = cellAt(s.lon, s.lat);
      disc(c0, s.tier === 'city' ? 70 : 45, (c) => (farTown[c] = 1));
      disc(c0, s.tier === 'city' ? 25 : 12, (c) => (nearTown[c] = 1));
    }
    const free = (c: number) => land(c) && !nearTown[c] && sp[c] !== SP.lava && sp[c] !== SP.glacier && sp[c] !== SP.fungal && sp[c] !== SP.ash;
    const seeds: { c: number; s: number; mire: boolean }[] = [];
    for (let c = 0; c < N; c++) {
      const b = f.biome[c] as Biome;
      if (!free(c) || farTown[c] || !(WOOD.has(b) || MIRE.has(b))) continue;
      seeds.push({ c, s: rc() + (f.newWorld?.[c] ? 0 : 0.6), mire: MIRE.has(b) });
    }
    seeds.sort((a, b) => b.s - a.s);
    const n = Math.min(6, Math.max(2, Math.round(landArea / 2.5e7)) + Math.floor(rc() * 2.5));
    // About a third are mires, the rest woods.
    const picked: { c: number; mire: boolean }[] = [];
    for (let k = 0; k < n; k++) {
      const mire = rc() < 0.35;
      const s = seeds.find((q) => q.mire === mire && !picked.some((p) => distKm(lon(p.c), lat(p.c), lon(q.c), lat(q.c)) < 1200))
        ?? seeds.find((q) => !picked.some((p) => distKm(lon(p.c), lat(p.c), lon(q.c), lat(q.c)) < 1200));
      if (s) picked.push(s);
    }
    picked.forEach(({ c: c0, mire }, id) => {
      const target = 15000 + 35000 * rc();
      const cells = [c0];
      const seen = new Set([c0]);
      let a = 0;
      const mine: number[] = [];
      for (let q = 0; q < cells.length && a < target; q++) {
        const c = cells[q];
        if (sp[c] === SP.none || sp[c] === SP.volcanic || sp[c] === SP.canyon || sp[c] === SP.cliff) {
          sp[c] = SP.cursed;
          mine.push(c);
          a += area(c);
        }
        const i = c % W, j = (c / W) | 0;
        for (let k = 0; k < 8; k++) {
          const nb = neighbor(g, i, j, k);
          if (nb < 0 || seen.has(nb) || !free(nb)) continue;
          seen.add(nb);
          const b = f.biome[nb] as Biome;
          // A cursed wood spreads through the woods; a cursed mire through wet, low ground.
          const ok = mire ? MIRE.has(b) || (f.height[nb] < 400 && f.precip[nb] > 600 && b !== Biome.HotDesert) : WOOD.has(b);
          if (!ok || rc() < 0.15) continue;
          cells.push(nb);
        }
      }
      if (!mine.length) return;
      const at = middle(mine);
      const cul = f.culture[at];
      const region = bank.featureNamed(mire ? 'cursedMire' : 'cursedWood', cul, `curse${id}`);
      push(mire ? 'cursedMire' : 'cursedWood', region, pt(at), 1, 4.8, 11);
      const r = rc();
      const kind: CurseHeart['kind'] = r < 0.45 ? 'village' : r < 0.72 ? 'ruin' : 'crypt';
      const hr = mulberry32(hashString(`${seed}#special#curseheart${id}`));
      const heart = kind === 'village' ? bank.opaque(CULTURES[cul] ?? CULTURES[0], hr, true) : dungeonName(bank, kind, cul, `curseheart${id}`);
      const story = curseStory(hr, { heart: heart.name, region: region.name, kind, mire });
      curses.push({ lon: lon(at), lat: lat(at), kind, name: heart.name, en: heart.en, region: region.name, regionEn: region.en, mire, story, culture: cul });
    });
  }

  // ---- Mages' towers ----------------------------------------------------------------------------------
  {
    const rt = rng('towers');
    const ADJ = ['Violet', 'Silver', 'Azure', 'Grey', 'Star', 'Moon', 'High', 'Black', 'White', 'Crystal', 'Amber', 'Twilight', 'Seventh', 'Sapphire'];
    for (const s of settlements) {
      if (s.tier !== 'city') continue;
      const x = rt(), pick = rt(), k = rt();
      const want = s.university ? x < 0.55 : fantasy && s.population >= 20000 && x < 0.12;
      if (!want) continue;
      const c = cellAt(s.lon, s.lat);
      const tpl = s.university && k < 0.5
        ? (pick < 0.4 ? "the Astronomers' Tower" : pick < 0.75 ? 'the Tower of the Magi' : `the ${ADJ[Math.floor(pick * ADJ.length) % ADJ.length]} College`)
        : `the ${ADJ[Math.floor(pick * ADJ.length) % ADJ.length]} Tower`;
      const n = bank.named(s.culture ?? f.culture[c], tpl);
      s.tower = { name: n.name, en: n.en, college: !!s.university };
    }
  }

  // ---- Towns take note ------------------------------------------------------------------------------
  const named = labels.map((l) => ({ kind: l.properties.kind, name: l.properties.name, coords: l.geometry.type === 'Point' ? [l.geometry.coordinates] : l.geometry.coordinates }));
  const near = (s: Settlement, kinds: string[], km: number) => named.find((n) => kinds.includes(n.kind) && n.coords.some((p) => distKm(s.lon, s.lat, p[0], p[1]) < km));
  for (const s of settlements) {
    if (s.tier !== 'city' && s.tier !== 'town') continue;
    const c = cellAt(s.lon, s.lat);
    const spa = near(s, ['geysers', 'hotLake'], 70);
    const fire = vents.find((v) => v.activity > 0 && distKm(s.lon, s.lat, v.lon, v.lat) < 110);
    const gorge = near(s, ['canyon'], 45);
    if (sp[c] === SP.ash || sp[c] === SP.lava) {
      s.special = 'ashen';
      s.population = Math.max(300, Math.round(s.population * 0.6));
      s.specialNear = fire?.name ?? near(s, ['ashland'], 400)?.name;
    } else if (spa) {
      s.special = 'spa';
      s.specialNear = spa.name;
    } else if (fire || gorge) {
      s.special = 'mining';
      s.specialNear = fire?.name ?? gorge?.name;
    }
    if (s.specialNear) s.specialNear = s.specialNear.replace(/\s*\(.*\)$/, '');
  }

  return { special: sp, vents, labels, curses };
}

/** The tale of a curse: how it came about at its heart, and what it does to the land now. */
function curseStory(r: Rng, o: { heart: string; region: string; kind: CurseHeart['kind']; mire: boolean }): string {
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const when = pick(['Three hundred years ago', 'In the days of the old kings', 'Within the memory of the oldest folk', 'Long ago', 'Before the last great war', 'A hundred winters past']);
  const land = o.mire ? 'fens' : 'woods';
  const place = o.kind === 'village' ? `the village of ${o.heart}` : o.heart;
  const causes = [
    `${when}, the people of ${o.kind === 'village' ? o.heart : 'the country round'} burned a woman they called a witch. Before she died she cursed them and all the ${land} about`,
    `${when}, a necromancer came to ${place} and worked a great spell there that went wrong`,
    `${when}, the lord of ${place} broke an oath sworn on the altar of the old gods, and the gods turned their faces from the ${land}`,
    `${when}, a great wyrm was slain at ${place}, and its black blood soaked into the ground`,
    `${when}, a star fell into the ${land} near ${place} on a winter night; those who went to see it came back changed`,
    `${when}, when the plague came to ${place}, the priest bargained with something below the earth to spare its people. They were spared, for a while`,
    `${when}, a hag of the ${land} was cheated of the firstborn she was promised at ${place}`,
  ];
  const fate = o.kind === 'village'
    ? pick(['Within a year the village stood empty', 'The villagers fled, and the houses have stood empty ever since', 'One by one the families left or died, and no one has lived there since'])
    : o.kind === 'ruin'
      ? pick(['The hall burned, and its ruins were never rebuilt', 'The house fell into ruin, and no one will live in it', 'Its walls stand roofless still, and no one will go near them'])
      : pick(['The dead in its crypt do not rest', 'Since then the crypt has been sealed, but the seals do not hold', 'The tomb stands open, and something walks out of it on moonless nights']);
  const now = o.mire
    ? pick(['The water turned black and the reeds died', 'Lights move over the water at night and lead travellers into the deep pools', 'The mist never lifts, and voices call from it in the voices of the drowned'])
    : pick(['The trees died where they stood and never fell', 'Nothing green grows there now, and no bird sings', 'The paths twist back on themselves, and travellers lose their way among the dead trees']);
  const end = pick([
    `The curse spreads a little every year, and no one has found the way to lift it.`,
    `It is said the curse will lift only when what was taken at ${o.heart} is given back.`,
    `Some say the curse could be broken at its heart, but those who went to try did not return.`,
    `The folk of the nearest villages leave offerings at the edge of ${o.region}, and do not go further.`,
  ]);
  return `${pick(causes)}. ${fate}. ${now}. ${end}`;
}
