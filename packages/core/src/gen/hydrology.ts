import { type Grid, neighbor } from './grid';
import { MinHeap } from './heap';
import { EROSION } from './config';

export interface FlowRouting {
  /** Land cells (plus coastal outlets) ordered from outlet upstream; receivers precede donors. */
  order: Int32Array;
  count: number;
  /** Downstream cell; equals the cell itself for sea outlets. */
  recv: Int32Array;
  recvDist: Float32Array;
  /** Depression-filled surface; filled - height = lake depth. */
  filled: Float32Array;
}

const FLAT_EPS = 0.01;

/**
 * Priority-flood from the coast fills depressions, then each land cell drains to its
 * steepest lower neighbour on the filled surface. The pop order is a valid topological order.
 */
export function routeFlow(g: Grid, h: Float32Array): FlowRouting {
  const { W, H, N } = g;
  const filled = Float32Array.from(h);
  const recv = new Int32Array(N);
  const recvDist = new Float32Array(N);
  const visited = new Uint8Array(N);
  const order = new Int32Array(N);
  const heap = new MinHeap(1 << 16);
  for (let c = 0; c < N; c++) recv[c] = c;

  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const c = j * W + i;
      if (h[c] > 0) continue;
      visited[c] = 1;
      for (let k = 0; k < 8; k++) {
        const n = neighbor(g, i, j, k);
        if (n >= 0 && h[n] > 0) {
          heap.push(c, h[c]);
          break;
        }
      }
    }
  }
  if (heap.size === 0) {
    let lowest = 0;
    for (let c = 1; c < N; c++) if (h[c] < h[lowest]) lowest = c;
    visited[lowest] = 1;
    heap.push(lowest, h[lowest]);
  }

  let count = 0;
  while (heap.size > 0) {
    const c = heap.pop();
    order[count++] = c;
    const i = c % W, j = (c / W) | 0;
    const fc = filled[c];
    for (let k = 0; k < 8; k++) {
      const n = neighbor(g, i, j, k);
      if (n < 0 || visited[n]) continue;
      visited[n] = 1;
      filled[n] = Math.max(h[n], fc + FLAT_EPS);
      heap.push(n, filled[n]);
    }
  }

  for (let o = 0; o < count; o++) {
    const c = order[o];
    if (h[c] <= 0) continue;
    const i = c % W, j = (c / W) | 0;
    const fc = filled[c];
    let best = c, bestSlope = 0, bestDist = 0;
    for (let k = 0; k < 8; k++) {
      const n = neighbor(g, i, j, k);
      if (n < 0) continue;
      const d = g.nbDist[j * 8 + k];
      const s = (fc - filled[n]) / d;
      if (s > bestSlope) {
        bestSlope = s;
        best = n;
        bestDist = d;
      }
    }
    recv[c] = best;
    recvDist[c] = bestDist;
  }

  return { order, count, recv, recvDist, filled };
}

/** Upstream drainage area in km², optionally weighted per cell (e.g. by precipitation). */
export function accumulate(g: Grid, flow: FlowRouting, weight?: Float32Array): Float32Array {
  const { W } = g;
  const acc = new Float32Array(g.N);
  for (let o = 0; o < flow.count; o++) {
    const c = flow.order[o];
    acc[c] = g.areaKm2[(c / W) | 0] * (weight ? weight[c] : 1);
  }
  for (let o = flow.count - 1; o >= 0; o--) {
    const c = flow.order[o];
    const r = flow.recv[c];
    if (r !== c) acc[r] += acc[c];
  }
  return acc;
}

/** Raises land cells in shallow closed depressions to their spill level; returns the fill depth per cell. */
export function fillShallowPits(g: Grid, h: Float32Array, maxDepthM: number): Float32Array {
  const { filled } = routeFlow(g, h);
  const fill = new Float32Array(g.N);
  for (let c = 0; c < g.N; c++) {
    const d = filled[c] - h[c];
    if (h[c] > 0 && d > 0 && d < maxDepthM) {
      h[c] = filled[c];
      fill[c] = d;
    }
  }
  return fill;
}

export function precipWeight(precip: Float32Array): Float32Array {
  const w = new Float32Array(precip.length);
  for (let c = 0; c < precip.length; c++) w[c] = Math.min(4, Math.max(0.05, precip[c] / 1000));
  return w;
}

/**
 * Fluvial erosion via the implicit stream-power solver (Braun & Willett 2013):
 * dh/dt = -K A^m S, solved downstream-to-upstream so it is unconditionally stable.
 * Land never erodes below sea level.
 */
export function erode(g: Grid, h: Float32Array, precip: Float32Array, strength: number): void {
  if (strength <= 0) return;
  const K = EROSION.k * strength;
  const weight = precipWeight(precip);
  for (let it = 0; it < EROSION.iterations; it++) {
    const flow = routeFlow(g, h);
    const acc = accumulate(g, flow, weight);
    const { order, recv, recvDist, filled } = flow;
    const deposit = EROSION.deposit * strength;
    for (let o = 0; o < flow.count; o++) {
      const c = order[o];
      if (h[c] > 0) h[c] += (filled[c] - h[c]) * deposit;
    }
    for (let o = 0; o < flow.count; o++) {
      const c = order[o];
      const r = recv[c];
      if (r === c) continue;
      const base = h[r] > 0 ? h[r] : 0;
      if (h[c] <= base) continue;
      const F = (K * Math.pow(acc[c], EROSION.m)) / recvDist[c];
      h[c] = (h[c] + F * base) / (1 + F);
    }
  }
}
