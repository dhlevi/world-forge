import type { Grid } from './grid';
import { pxPerMeterZ20 } from './grid';
import type { FlowRouting } from './hydrology';
import { hash32 } from './rng';
import { HYDROLOGY } from './config';

export interface RiverFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: number[][] };
  /**
   * order = log2(flow / threshold); flow = precipitation-weighted drainage area (km²);
   * widthM = physical width; ppm20 = map pixels per metre at zoom 20 (for physical line widths).
   */
  properties: { order: number; flow: number; widthM: number; ppm20: number };
}

export interface RiverCollection {
  type: 'FeatureCollection';
  features: RiverFeature[];
}

export function chaikin(pts: number[][], iterations: number): number[][] {
  for (let it = 0; it < iterations && pts.length > 2; it++) {
    const out: number[][] = [pts[0]];
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      out.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by], [0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

/** Jittered polyline vertex of river cell c. Smoothed rivers pass exactly through the midpoint of consecutive vertices. */
export function riverVertex(g: Grid, c: number, seed: number): number[] {
  const jitter = HYDROLOGY.riverJitter;
  const hsh = hash32(c ^ seed);
  const jx = ((hsh & 0xffff) / 0xffff - 0.5) * jitter;
  const jy = ((hsh >>> 16) / 0xffff - 0.5) * jitter;
  return [g.lonDeg[c % g.W] + (jx * 360) / g.W, g.latDeg[(c / g.W) | 0] + (jy * 180) / g.H];
}

export function riverWidthM(order: number): number {
  return HYDROLOGY.riverWidthM * HYDROLOGY.riverWidthGrowth ** order;
}

/**
 * Traces river polylines down the drainage tree. Lines split wherever discharge doubles
 * so they can be styled with increasing width downstream. Cell centres are jittered
 * deterministically and smoothed to hide the grid.
 */
export function extractRivers(g: Grid, h: Float32Array, flow: FlowRouting, acc: Float32Array, seed: number): RiverCollection {
  const { N } = g;
  const thr = HYDROLOGY.riverThresholdKm2;
  const { recv } = flow;
  const isRiver = new Uint8Array(N);
  const hasDonor = new Uint8Array(N);
  for (let c = 0; c < N; c++) {
    if (h[c] > 0 && acc[c] >= thr && recv[c] !== c) isRiver[c] = 1;
  }
  for (let c = 0; c < N; c++) if (isRiver[c]) hasDonor[recv[c]] = 1;

  const point = (c: number) => riverVertex(g, c, seed);
  const bucket = (c: number) => Math.max(0, Math.floor(Math.log2(acc[c] / thr)));

  const features: RiverFeature[] = [];
  const emit = (cells: number[], order: number) => {
    if (cells.length < 2) return;
    const pts: number[][] = [];
    let prevLon = 0;
    for (let k = 0; k < cells.length; k++) {
      const p = point(cells[k]);
      if (k > 0) {
        while (p[0] - prevLon > 180) p[0] -= 360;
        while (p[0] - prevLon < -180) p[0] += 360;
      }
      prevLon = p[0];
      pts.push(p);
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: chaikin(pts, HYDROLOGY.riverSmoothing) },
      properties: { order, flow: thr * 2 ** order, widthM: riverWidthM(order), ppm20: pxPerMeterZ20(pts[pts.length >> 1][1]) },
    });
  };

  const visited = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (!isRiver[s] || hasDonor[s]) continue;
    let cur = s;
    let cells = [cur];
    let order = bucket(cur);
    for (;;) {
      visited[cur] = 1;
      const r = recv[cur];
      cells.push(r);
      if (!isRiver[r] || visited[r]) break;
      const b = bucket(r);
      if (b > order) {
        emit(cells, order);
        cells = [r];
        order = b;
      }
      cur = r;
    }
    emit(cells, order);
  }
  return { type: 'FeatureCollection', features };
}
