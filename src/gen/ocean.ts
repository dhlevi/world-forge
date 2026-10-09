import { type Grid, blurKm, smoothstep } from './grid';
import { buildUpstream, sampleUpstream } from './advect';
import { CLIMATE as C } from './config';

export interface Ocean {
  /** Surface current (0 on land), east/north-positive; ~1 in strong boundary currents. */
  currentU: Float32Array;
  currentV: Float32Array;
  /** Temperature anomaly from currents, °C: sea-surface anomaly at sea, carried inland by the wind on land. */
  tempAnomaly: Float32Array;
}

/** Latitude weights of the subtropical and subpolar gyres. */
function gyreWeights(latDeg: number): [number, number] {
  const a = Math.abs(latDeg);
  const subtropical = smoothstep(5, 15, a) * (1 - smoothstep(40, 50, a));
  const subpolar = smoothstep(45, 52, a) * (1 - smoothstep(65, 75, a));
  return [subtropical, subpolar];
}

/**
 * Wind-driven gyres: zonal drift follows the wind, and where it meets a coast it turns
 * into boundary currents. Subtropical gyres run poleward along western ocean boundaries
 * (warm, Gulf Stream-like) and equatorward along eastern boundaries (cold, with upwelling);
 * subpolar gyres reverse both. Narrow seas get weak currents.
 */
function computeCurrents(g: Grid, h: Float32Array, windU: Float32Array) {
  const { W, H, N } = g;
  const distW = new Float32Array(N).fill(C.currentScanKm);
  const distE = new Float32Array(N).fill(C.currentScanKm);
  for (let j = 0; j < H; j++) {
    const off = j * W, dx = g.dxKm[j];
    let last = -Infinity;
    for (let s = 0; s < 2 * W; s++) {
      const c = off + (s % W);
      if (h[c] > 0) last = s;
      else if (s >= W) distW[c] = Math.min(C.currentScanKm, (s - last) * dx);
    }
    last = Infinity;
    for (let s = 2 * W - 1; s >= 0; s--) {
      const c = off + (s % W);
      if (h[c] > 0) last = s;
      else if (s < W) distE[c] = Math.min(C.currentScanKm, (last - s) * dx);
    }
  }

  // Row scans are noisy across rows (islands, capes), so smooth the derived proximity fields.
  const westP = new Float32Array(N), eastP = new Float32Array(N), basinW = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    if (h[c] > 0) continue;
    westP[c] = Math.exp(-distW[c] / C.westBoundaryKm);
    eastP[c] = Math.exp(-distE[c] / C.eastBoundaryKm);
    basinW[c] = smoothstep(C.minBasinKm, C.fullBasinKm, distW[c] + distE[c]);
  }
  const pWs = blurKm(g, westP, C.boundarySmoothKm);
  const pEs = blurKm(g, eastP, C.boundarySmoothKm);
  const basins = blurKm(g, basinW, C.boundarySmoothKm);

  const currentU = new Float32Array(N), currentV = new Float32Array(N);
  const upwelling = new Float32Array(N);
  for (let j = 0; j < H; j++) {
    const lat = g.latDeg[j];
    const [sT, sP] = gyreWeights(lat);
    const sg = Math.sign(lat);
    for (let i = 0; i < W; i++) {
      const c = j * W + i;
      if (h[c] > 0) continue;
      const pW = pWs[c], pE = pEs[c], basin = basins[c];
      let u = C.currentWindDrift * windU[c];
      u *= u < 0 ? 1 - pW : 1 - pE;
      let v = sg * basin * ((sT - sP) * pW * C.westBoundaryStrength + (sP - sT) * pE * C.eastBoundaryStrength);
      if (v > 0 && j > 0 && h[c - W] > 0) v = 0;
      if (v < 0 && j < H - 1 && h[c + W] > 0) v = 0;
      currentU[c] = u;
      currentV[c] = v;
      upwelling[c] = sT * pE * basin;
    }
  }
  return { currentU, currentV, upwelling };
}

/**
 * Sea-surface temperature carried along the currents and relaxed toward the latitude
 * baseline, plus coastal upwelling; the resulting anomaly is then blown inland by the wind.
 */
export function computeOcean(
  g: Grid, h: Float32Array, baseTemp: Float32Array, windU: Float32Array, windV: Float32Array,
): Ocean {
  const { N } = g;
  const { currentU, currentV, upwelling } = computeCurrents(g, h, windU);
  const step = Math.max(C.oceanStepKm, g.dyKm);

  const oceanUp = buildUpstream(g, currentU, currentV, step);
  const relax = 1 - Math.exp(-step / C.sstRelaxKm);
  let t = Float32Array.from(baseTemp), next = new Float32Array(N);
  for (let it = 0, n = Math.ceil(C.sstTravelKm / step); it < n; it++) {
    for (let c = 0; c < N; c++) {
      if (h[c] > 0) {
        next[c] = baseTemp[c];
      } else {
        const s = sampleUpstream(oceanUp, t, c);
        next[c] = s + (baseTemp[c] - s) * relax;
      }
    }
    [t, next] = [next, t];
  }
  const sea = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    if (h[c] <= 0) sea[c] = t[c] - baseTemp[c] - C.upwellingC * upwelling[c];
  }

  const windUp = buildUpstream(g, windU, windV, step);
  const decay = Math.exp(-step / C.inlandAnomalyKm);
  let a = Float32Array.from(sea), nextA = new Float32Array(N);
  for (let it = 0, n = Math.ceil((3 * C.inlandAnomalyKm) / step); it < n; it++) {
    for (let c = 0; c < N; c++) nextA[c] = h[c] <= 0 ? sea[c] : sampleUpstream(windUp, a, c) * decay;
    [a, nextA] = [nextA, a];
  }

  return { currentU, currentV, tempAnomaly: a };
}
