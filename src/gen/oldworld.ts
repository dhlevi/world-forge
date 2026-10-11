import { type Grid, neighbor } from './grid';
import { MinHeap } from './heap';
import { hashString, mulberry32 } from './rng';

export interface OldWorldFields {
  height: Float32Array;
  lakeDepth: Float32Array;
  temp: Float32Array;
  precip: Float32Array;
}

/**
 * Which land is the settled **Old World** and which the sparse **New World** (1 in the result).
 * Settlement spreads from a heartland (the most welcoming land of the largest landmass) by travel
 * cost: over land, dearer through mountains; across the sea at six times the cost, so a continent
 * fills before the next is reached. The first `settled` share of the world's land to be reached
 * is the Old World. Other landmasses then go wholly one way or the other (by which side holds
 * most of them); only the heartland's own landmass may be split, along a frontier that tends to
 * follow its ranges. `settled` of 1 makes the whole world Old.
 */
export function newWorldMask(g: Grid, f: OldWorldFields, settled: number, seed: string): Uint8Array {
  const { W, H, N } = g;
  const out = new Uint8Array(N);
  if (settled >= 0.999) return out;
  const land = (c: number) => f.height[c] > 0;
  // Landmasses.
  const mass = new Int32Array(N).fill(-1);
  const massArea: number[] = [];
  const q = new Int32Array(N);
  let total = 0;
  for (let s0 = 0; s0 < N; s0++) {
    if (mass[s0] >= 0 || !land(s0)) continue;
    const id = massArea.length;
    let a = 0, qn = 0;
    q[qn++] = s0;
    mass[s0] = id;
    for (let k = 0; k < qn; k++) {
      const c = q[k], i = c % W, j = (c / W) | 0;
      a += g.areaKm2[j];
      for (let d = 0; d < 8; d++) {
        const n = neighbor(g, i, j, d);
        if (n >= 0 && mass[n] < 0 && land(n)) {
          mass[n] = id;
          q[qn++] = n;
        }
      }
    }
    massArea.push(a);
    total += a;
  }
  if (!massArea.length) return out;
  const biggest = massArea.indexOf(Math.max(...massArea));
  // The heartland: temperate, watered land of the largest landmass (a seeded pick among the best).
  const rnd = mulberry32(hashString(`${seed}#oldworld`));
  const near = (v: number, lo: number, hi: number, soft: number) => (v < lo ? Math.max(0, 1 - (lo - v) / soft) : v > hi ? Math.max(0, 1 - (v - hi) / soft) : 1);
  let origin = -1, best = -1;
  for (let c = 0; c < N; c++) {
    if (mass[c] !== biggest || f.lakeDepth[c] > 0) continue;
    const s = near(f.temp[c], 8, 20, 8) * near(f.precip[c], 450, 1600, 400) * (f.height[c] < 1500 ? 1 : 0.3) * (0.7 + 0.3 * rnd());
    if (s > best) {
      best = s;
      origin = c;
    }
  }
  if (origin < 0) return out;
  // Spread by travel cost until the settled share of land is reached.
  const cost = new Float64Array(N).fill(Infinity);
  const old = new Uint8Array(N);
  const heap = new MinHeap(8192);
  cost[origin] = 0;
  heap.push(origin, 0);
  const target = settled * total;
  let got = 0;
  while (heap.size && got < target) {
    const c = heap.pop(), dc = heap.lastKey;
    if (dc > cost[c] || old[c]) continue;
    old[c] = 1;
    const j = (c / W) | 0, i = c % W;
    if (land(c)) got += g.areaKm2[j];
    for (let d = 0; d < 8; d++) {
      const n = neighbor(g, i, j, d);
      if (n < 0 || old[n]) continue;
      const dist = g.nbDist[j * 8 + d];
      const h = Math.max(0, f.height[n]);
      const step = land(n) ? dist * (1 + Math.abs(h - Math.max(0, f.height[c])) / 300 + (h > 1500 ? (h - 1500) / 800 : 0)) : dist * 6;
      const nd = dc + step;
      if (nd < cost[n]) {
        cost[n] = nd;
        heap.push(n, nd);
      }
    }
  }
  // Whole landmasses (other than the heartland's) go the way most of their land went.
  const oldArea = new Float64Array(massArea.length);
  for (let c = 0; c < N; c++) if (mass[c] >= 0 && old[c]) oldArea[mass[c]] += g.areaKm2[(c / W) | 0];
  for (let c = 0; c < N; c++) {
    const m = mass[c];
    if (m < 0) continue;
    const isOld = m === biggest ? old[c] === 1 : oldArea[m] >= 0.5 * massArea[m];
    out[c] = isOld ? 0 : 1;
  }
  return out;
}
