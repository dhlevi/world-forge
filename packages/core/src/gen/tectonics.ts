import { type Grid, EARTH_RADIUS_KM, ORTHO, areaQuantile, blurKm, neighbor, smoothstep } from './grid';
import { MinHeap } from './heap';
import { Simplex3, fbm, ridged } from './noise';
import { type Rng, hash32, randomUnitVector } from './rng';
import { TECTONICS as T } from './config';

export interface TectonicResult {
  /** Elevation in metres, before sea level is normalised. */
  height: Float32Array;
  plate: Uint8Array;
  /**
   * Volcanism, about 0 to 1: high along the volcanic arcs behind subduction zones (on continents
   * and island arcs), lower along continental rifts and mid-ocean ridges. Derived from the same
   * plate model as the heights, without drawing on the random stream (so heights are unchanged).
   */
  volcanic: Float32Array;
}

const gauss = (u: number) => Math.exp(-u * u);

/**
 * Builds a heightfield from a simple plate model:
 * 1. Weighted, noise-warped Voronoi plates with Euler-pole rotations.
 * 2. A continental-crust field (plate bias + noise) sets land vs ocean floor.
 * 3. Relative plate motion at boundaries raises mountains, arcs and ridges or cuts trenches and rifts.
 */
export function buildTectonics(g: Grid, rng: Rng, numPlates: number, landFraction: number): TectonicResult {
  const { W, H, N } = g;
  const P = Math.max(2, Math.min(255, Math.round(numPlates)));

  const sx = new Float64Array(P), sy = new Float64Array(P), sz = new Float64Array(P);
  const wInv = new Float64Array(P);
  const ox = new Float64Array(P), oy = new Float64Array(P), oz = new Float64Array(P);
  for (let k = 0; k < P; k++) {
    [sx[k], sy[k], sz[k]] = randomUnitVector(rng);
    const w = 0.6 + 0.8 * rng();
    wInv[k] = 1 / (w * w);
    const [px, py, pz] = randomUnitVector(rng);
    const speed = T.minSpeed + (T.maxSpeed - T.minSpeed) * rng();
    ox[k] = px * speed;
    oy[k] = py * speed;
    oz[k] = pz * speed;
  }

  // Plate assignment.
  const warpX = new Simplex3(rng), warpY = new Simplex3(rng), warpZ = new Simplex3(rng);
  const plate = new Uint8Array(N);
  const plateArea = new Float64Array(P);
  const f = T.plateWarpFreq;
  for (let j = 0; j < H; j++) {
    const cl = g.cosLat[j], z = g.sinLat[j];
    for (let i = 0; i < W; i++) {
      const x = cl * g.cosLon[i], y = cl * g.sinLon[i];
      const qx = x + T.plateWarp * fbm(warpX, x * f, y * f, z * f, 4);
      const qy = y + T.plateWarp * fbm(warpY, x * f, y * f, z * f, 4);
      const qz = z + T.plateWarp * fbm(warpZ, x * f, y * f, z * f, 4);
      const qn = 1 / Math.hypot(qx, qy, qz);
      let best = 0, bestScore = Infinity;
      for (let k = 0; k < P; k++) {
        const s = (1 - (qx * sx[k] + qy * sy[k] + qz * sz[k]) * qn) * wInv[k];
        if (s < bestScore) {
          bestScore = s;
          best = k;
        }
      }
      plate[j * W + i] = best;
      plateArea[best] += g.areaKm2[j];
    }
  }

  // Pick continental plates in random order until they cover roughly the land fraction.
  const order = Array.from({ length: P }, (_, k) => k);
  for (let k = P - 1; k > 0; k--) {
    const r = Math.floor(rng() * (k + 1));
    [order[k], order[r]] = [order[r], order[k]];
  }
  const totalArea = plateArea.reduce((a, b) => a + b, 0);
  const bias = new Float64Array(P);
  let covered = 0;
  for (const k of order) {
    if (covered < landFraction * totalArea * T.continentalPlateShare) {
      bias[k] = 0.5 + 0.5 * rng();
      covered += plateArea[k];
    } else {
      bias[k] = -(0.5 + 0.5 * rng());
    }
  }

  // Continental crust field: positive = continent.
  const nCrust = new Simplex3(rng), nCrustDetail = new Simplex3(rng);
  const crust0 = new Float32Array(N);
  for (let j = 0, c = 0; j < H; j++) {
    const cl = g.cosLat[j], z = g.sinLat[j];
    for (let i = 0; i < W; i++, c++) {
      const x = cl * g.cosLon[i], y = cl * g.sinLon[i], cf = T.crustNoiseFreq;
      crust0[c] = T.plateBiasWeight * bias[plate[c]] + T.crustNoiseWeight * fbm(nCrust, x * cf, y * cf, z * cf, 5);
    }
  }
  const crust = blurKm(g, crust0, T.crustBlurKm);
  for (let j = 0, c = 0; j < H; j++) {
    const cl = g.cosLat[j], z = g.sinLat[j];
    for (let i = 0; i < W; i++, c++) {
      const x = cl * g.cosLon[i], y = cl * g.sinLon[i], df = T.crustDetailFreq;
      crust[c] += T.crustDetailWeight * fbm(nCrustDetail, x * df, y * df, z * df, 5);
    }
  }
  const threshold = areaQuantile(g, crust, 1 - landFraction);
  for (let c = 0; c < N; c++) crust[c] -= threshold;

  // Boundary stress: positive = convergent, negative = divergent.
  const stress = new Float32Array(N);
  const otherCrust = new Float32Array(N);
  const otherPlate = new Int16Array(N).fill(-1);
  const dist = new Float32Array(N).fill(Infinity);
  const src = new Int32Array(N).fill(-1);
  const heap = new MinHeap(1 << 16);
  for (let j = 0; j < H; j++) {
    const cl = g.cosLat[j], z = g.sinLat[j];
    for (let i = 0; i < W; i++) {
      const c = j * W + i;
      const a = plate[c];
      const x = cl * g.cosLon[i], y = cl * g.sinLon[i];
      let conv = 0, oc = 0, cnt = 0;
      for (const k of ORTHO) {
        const n = neighbor(g, i, j, k);
        if (n < 0) continue;
        const b = plate[n];
        if (b === a) continue;
        const ni = n % W, nj = (n / W) | 0;
        let tx = g.cosLat[nj] * g.cosLon[ni] - x;
        let ty = g.cosLat[nj] * g.sinLon[ni] - y;
        let tz = g.sinLat[nj] - z;
        const tl = 1 / Math.hypot(tx, ty, tz);
        tx *= tl; ty *= tl; tz *= tl;
        // Surface velocity v = omega × p.
        const rvx = (oy[a] - oy[b]) * z - (oz[a] - oz[b]) * y;
        const rvy = (oz[a] - oz[b]) * x - (ox[a] - ox[b]) * z;
        const rvz = (ox[a] - ox[b]) * y - (oy[a] - oy[b]) * x;
        conv += rvx * tx + rvy * ty + rvz * tz;
        oc += crust[n];
        otherPlate[c] = b;
        cnt++;
      }
      if (cnt > 0) {
        stress[c] = conv / cnt;
        otherCrust[c] = oc / cnt;
        dist[c] = 0;
        src[c] = c;
        heap.push(c, 0);
      }
    }
  }

  // Distance from each cell to the nearest boundary of its own plate.
  while (heap.size > 0) {
    const c = heap.pop();
    const d = heap.lastKey;
    if (d > dist[c] || d > T.maxInfluenceKm) continue;
    const i = c % W, j = (c / W) | 0;
    for (let k = 0; k < 8; k++) {
      const n = neighbor(g, i, j, k);
      if (n < 0 || plate[n] !== plate[c]) continue;
      const nd = d + g.nbDist[j * 8 + k];
      if (nd < dist[n]) {
        dist[n] = nd;
        src[n] = src[c];
        heap.push(n, nd);
      }
    }
  }

  const nRidge = new Simplex3(rng), nHills = new Simplex3(rng), nPlateau = new Simplex3(rng);
  new Simplex3(rng); // formerly the old-range noise; kept so existing seeds keep their continents
  const nArc = new Simplex3(rng);
  const nSeg = new Simplex3(rng), nSuture = new Simplex3(rng);
  const sutures = buildSutures(rng);
  // Where two oceanic plates converge, the denser one subducts; derived from the plate seed so no rng is consumed.
  const density = Float64Array.from({ length: P }, (_, k) => hash32(Math.floor((sx[k] + 2) * 1e6) ^ Math.floor((sy[k] + 2) * 1e6) * 31));
  const height = new Float32Array(N);
  const volcanic = new Float32Array(N);
  for (let j = 0, c = 0; j < H; j++) {
    const cl = g.cosLat[j], z = g.sinLat[j];
    for (let i = 0; i < W; i++, c++) {
      const x = cl * g.cosLon[i], y = cl * g.sinLon[i];
      const v = crust[c];

      let h: number;
      if (v >= 0) h = T.landBase + T.landPlateau * smoothstep(0, 0.4, v);
      else if (v > -T.shelfWidth) h = -T.shelfDepth * (-v / T.shelfWidth);
      else h = -T.shelfDepth - (T.abyssDepth - T.shelfDepth) * smoothstep(0, T.slopeWidth, -v - T.shelfWidth);

      let up = 0;
      const s0 = src[c];
      if (s0 >= 0) {
        const d = dist[c];
        const s = Math.max(-1, Math.min(1, stress[s0] * T.stressScale));
        const ownCont = v >= 0;
        const otherCont = otherCrust[s0] >= 0;
        if (s > 0) {
          if (ownCont) {
            // Collisions peak at the suture; subduction ranges sit inland of the trench (Andes).
            const boost = otherCont ? T.collisionBoost : 1;
            const w = T.mountainWidthKm * (0.7 + 0.5 * s) * boost;
            const offset = otherCont ? 0 : T.subductionRangeOffsetKm;
            const sf = T.rangeSegmentFreq;
            const segment = 0.15 + 0.85 * smoothstep(-0.25, 0.3, fbm(nSeg, x * sf, y * sf, z * sf, 3));
            up = s * T.mountainHeight * boost * segment *
              (gauss((d - offset) / w) + T.foothillShare * gauss(d / (T.foothillWidthFactor * w)));
            // A volcanic arc rides on the subduction range, not on a collision's suture.
            if (!otherCont) volcanic[c] = s * segment * gauss((d - offset) / (w * 0.7));
          } else if (otherCont || density[plate[c]] > density[otherPlate[s0]]) {
            up = -s * T.trenchDepth * gauss(d / T.trenchWidthKm);
          } else {
            // Overriding plate: a single arc set back from the trench, broken into island groups.
            const af = T.arcSegmentFreq;
            const segment = smoothstep(T.arcSegmentThreshold, T.arcSegmentThreshold + 0.4, fbm(nArc, x * af, y * af, z * af, 3));
            up = T.arcHeight * (0.5 + 0.5 * s) * segment * gauss((d - T.arcOffsetKm) / T.arcWidthKm);
            volcanic[c] = (0.5 + 0.5 * s) * segment * gauss((d - T.arcOffsetKm) / T.arcWidthKm);
          }
        } else if (s < 0) {
          up = ownCont
            ? s * T.riftDepth * gauss(d / T.riftWidthKm)
            : -s * T.ridgeHeight * gauss(d / T.ridgeWidthKm);
          volcanic[c] = -s * (ownCont ? 0.6 * gauss(d / (T.riftWidthKm * 1.5)) : 0.45 * gauss(d / T.ridgeWidthKm));
        }
      }
      if (v > 0) up += suturedRange(sutures, nSuture, nSeg, x, y, z) * smoothstep(0.02, 0.15, v);
      if (up > 0) {
        const rf = T.mountainRidgeFreq;
        up *= 0.5 + 0.9 * ridged(nRidge, x * rf, y * rf, z * rf, 4);
      }

      const hf = T.hillFreq, pf = T.plateauFreq;
      h += up + T.hillAmp * fbm(nHills, x * hf, y * hf, z * hf, 5);
      if (v > 0) h += T.plateauAmp * fbm(nPlateau, x * pf, y * pf, z * pf, 3);
      if (h > T.peakSoftCapM) h = T.peakSoftCapM + (h - T.peakSoftCapM) * T.peakCompression;
      height[c] = h;
    }
  }

  return { height, plate, volcanic };
}

/**
 * Turns enclosed seas larger than inlandSeaMaxKm2 (not connected to the world ocean) into low
 * basin plains, keeping a little of their relief. Small ones stay as Caspian-like seas.
 */
export function drainInlandSeas(g: Grid, h: Float32Array): void {
  const { W, N } = g;
  const label = new Int32Array(N).fill(-1);
  const comps: { cells: number[]; area: number; min: number }[] = [];
  for (let c0 = 0; c0 < N; c0++) {
    if (label[c0] >= 0 || h[c0] > 0) continue;
    const id = comps.length;
    const cells: number[] = [];
    let area = 0, min = Infinity;
    const stack = [c0];
    label[c0] = id;
    while (stack.length > 0) {
      const c = stack.pop()!;
      cells.push(c);
      const i = c % W, j = (c / W) | 0;
      area += g.areaKm2[j];
      min = Math.min(min, h[c]);
      for (let k = 0; k < 8; k++) {
        const n = neighbor(g, i, j, k);
        if (n >= 0 && label[n] < 0 && h[n] <= 0) {
          label[n] = id;
          stack.push(n);
        }
      }
    }
    comps.push({ cells, area, min });
  }
  let ocean = 0;
  for (let k = 1; k < comps.length; k++) if (comps[k].area > comps[ocean].area) ocean = k;
  for (let k = 0; k < comps.length; k++) {
    const sea = comps[k];
    if (k === ocean || sea.area <= T.inlandSeaMaxKm2) continue;
    for (const c of sea.cells) h[c] = T.inlandBasinFloorM + 0.05 * (h[c] - sea.min);
  }
}

interface Sutures {
  sx: Float64Array;
  sy: Float64Array;
  sz: Float64Array;
  /** Uplift (m) of the suture between seeds a and b at [a * n + b]; 0 = inactive. */
  amp: Float32Array;
}

/** Seeds of an older, finer plate pattern whose (partly) surviving boundaries are worn interior ranges. */
function buildSutures(rng: Rng): Sutures {
  const n = T.sutureSeeds;
  const sx = new Float64Array(n), sy = new Float64Array(n), sz = new Float64Array(n);
  for (let k = 0; k < n; k++) [sx[k], sy[k], sz[k]] = randomUnitVector(rng);
  const amp = new Float32Array(n * n);
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const active = rng() < T.sutureActiveShare;
      amp[a * n + b] = amp[b * n + a] = active ? T.sutureHeight * (0.4 + 0.6 * rng()) : 0;
    }
  }
  return { sx, sy, sz, amp };
}

/**
 * Uplift from the nearest ancient suture: the great-circle bisector between the two nearest
 * (domain-warped) seeds. Gives linear, branching interior ranges (Appalachians, Urals).
 */
function suturedRange(su: Sutures, warp: Simplex3, seg: Simplex3, x: number, y: number, z: number): number {
  const wf = T.sutureWarpFreq;
  const qx = x + T.sutureWarp * warp.noise(x * wf, y * wf, z * wf);
  const qy = y + T.sutureWarp * warp.noise(y * wf + 17, z * wf, x * wf);
  const qz = z + T.sutureWarp * warp.noise(z * wf - 31, x * wf, y * wf);
  let b1 = -Infinity, b2 = -Infinity, i1 = 0, i2 = 0;
  for (let k = 0; k < su.sx.length; k++) {
    const dot = qx * su.sx[k] + qy * su.sy[k] + qz * su.sz[k];
    if (dot > b1) {
      b2 = b1; i2 = i1;
      b1 = dot; i1 = k;
    } else if (dot > b2) {
      b2 = dot; i2 = k;
    }
  }
  const amp = su.amp[i1 * su.sx.length + i2];
  if (amp === 0) return 0;
  const nx = su.sx[i1] - su.sx[i2], ny = su.sy[i1] - su.sy[i2], nz = su.sz[i1] - su.sz[i2];
  const qn = Math.hypot(qx, qy, qz);
  const distKm = (Math.abs(qx * nx + qy * ny + qz * nz) / (Math.hypot(nx, ny, nz) * qn)) * EARTH_RADIUS_KM;
  if (distKm > 3 * T.sutureWidthKm) return 0;
  const sf = T.rangeSegmentFreq;
  const segment = smoothstep(-0.15, 0.35, seg.noise(x * sf + 40, y * sf, z * sf));
  return amp * segment * gauss(distKm / T.sutureWidthKm);
}
