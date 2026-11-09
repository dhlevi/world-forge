import type { Grid } from './grid';

/** Precomputed upstream (departure) points for semi-Lagrangian transport along a fixed velocity field. */
export interface Upstream {
  W: number;
  i: Int32Array;
  j: Int32Array;
  tx: Float32Array;
  ty: Float32Array;
}

/** Velocities are east/north-positive; a speed of 1 moves `stepKm` per iteration. */
export function buildUpstream(g: Grid, u: Float32Array, v: Float32Array, stepKm: number): Upstream {
  const { W, H, N } = g;
  const up: Upstream = {
    W,
    i: new Int32Array(N),
    j: new Int32Array(N),
    tx: new Float32Array(N),
    ty: new Float32Array(N),
  };
  for (let j = 0, c = 0; j < H; j++) {
    for (let i = 0; i < W; i++, c++) {
      const fx = i - (u[c] * stepKm) / g.dxKm[j];
      const fy = Math.min(H - 1, Math.max(0, j + (v[c] * stepKm) / g.dyKm));
      const i0 = Math.floor(fx), j0 = Math.min(H - 2, Math.floor(fy));
      up.i[c] = ((i0 % W) + W) % W;
      up.tx[c] = fx - i0;
      up.j[c] = j0;
      up.ty[c] = fy - j0;
    }
  }
  return up;
}

export function sampleUpstream(up: Upstream, f: Float32Array, c: number): number {
  const W = up.W;
  const i0 = up.i[c], i1 = i0 + 1 === W ? 0 : i0 + 1;
  const r0 = up.j[c] * W, r1 = r0 + W;
  const tx = up.tx[c], ty = up.ty[c];
  return (f[r0 + i0] * (1 - tx) + f[r0 + i1] * tx) * (1 - ty) + (f[r1 + i0] * (1 - tx) + f[r1 + i1] * tx) * ty;
}
