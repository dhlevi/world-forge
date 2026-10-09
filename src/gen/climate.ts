import { type Grid, blurKm, makeGrid, smoothstep } from './grid';
import { Simplex3, fbm } from './noise';
import { buildUpstream, sampleUpstream } from './advect';
import { computeOcean } from './ocean';
import { CLIMATE as C } from './config';

export interface Climate {
  /** Sea-level-equivalent annual mean temperature, °C. */
  tempSea: Float32Array;
  /** Surface temperature including lapse rate, °C. */
  temp: Float32Array;
  /** Annual precipitation, mm/yr. */
  precip: Float32Array;
  /** Prevailing surface wind per cell: east-positive and north-positive, ~1 at trade/westerly peaks. */
  windU: Float32Array;
  windV: Float32Array;
  /** Surface ocean current (0 on land), east/north-positive. */
  currentU: Float32Array;
  currentV: Float32Array;
  /** Temperature anomaly from ocean currents, °C (already included in tempSea/temp). */
  tempAnomaly: Float32Array;
  /** Mean temperature of the warmest and coldest month, °C (including lapse rate). */
  tempWarm: Float32Array;
  tempCold: Float32Array;
  /** Precipitation rate during the local summer and winter half-years, mm/yr. */
  precipSummer: Float32Array;
  precipWinter: Float32Array;
}

/** Relative saturation vapour capacity (Clausius–Clapeyron), 1 at 25 °C. */
const saturation = (t: number) => Math.exp(C.saturationPerC * (t - 25));

/** Three-cell circulation: trades, westerlies, polar easterlies. */
function prevailingWind(latDeg: number): [number, number] {
  const a = Math.abs(latDeg);
  const phi = (latDeg * Math.PI) / 180;
  const u = a <= 60 ? -Math.cos(3 * phi) : -0.6 * Math.sin(((a - 60) * 3 * Math.PI) / 180);
  const v = -C.meridionalWind * Math.sin(6 * phi);
  return [u, v];
}

/**
 * Global wind bands, rotated by low-frequency noise so flow meanders, deflected around
 * high terrain (the uphill component is removed) and slowed by land friction.
 * `season` +1 = northern summer, -1 = northern winter, 0 = annual mean: the bands shift toward
 * the summer hemisphere and a monsoon term blows onshore in summer, offshore in winter.
 */
export function computeWind(
  g: Grid, h: Float32Array, noise: Simplex3, season = 0, landSmooth?: Float32Array,
): { windU: Float32Array; windV: Float32Array } {
  const { W, H, N } = g;
  const windU = new Float32Array(N);
  const windV = new Float32Array(N);
  const relief = new Float32Array(N);
  for (let c = 0; c < N; c++) relief[c] = Math.max(0, h[c]);
  const hs = blurKm(g, relief, C.windTerrainBlurKm);
  const f = C.windMeanderFreq;

  for (let j = 0; j < H; j++) {
    const lat = g.latDeg[j];
    const [u0, v0] = prevailingWind(lat - season * C.seasonalBandShiftDeg);
    const localSummer = season * Math.sign(lat);
    const a = Math.abs(lat);
    const monsoon = landSmooth && season !== 0
      ? localSummer * C.monsoonStrength * C.monsoonScaleKm * smoothstep(0, 8, a) * (1 - smoothstep(C.monsoonMaxLatDeg - 10, C.monsoonMaxLatDeg, a))
      : 0;
    const cl = g.cosLat[j], z = g.sinLat[j];
    const jn = Math.max(0, j - 1) * W, js = Math.min(H - 1, j + 1) * W;
    const dyKm = g.dyKm * (Math.min(H - 1, j + 1) - Math.max(0, j - 1));
    for (let i = 0; i < W; i++) {
      const c = j * W + i;
      const x = cl * g.cosLon[i], y = cl * g.sinLon[i];
      const ang = C.windMeanderRad * fbm(noise, x * f + 50, y * f, z * f, 3);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      let u = u0 * ca - v0 * sa;
      let v = u0 * sa + v0 * ca;
      const ie = i + 1 === W ? 0 : i + 1, iw = i === 0 ? W - 1 : i - 1;

      if (monsoon !== 0 && landSmooth) {
        // Up the smoothed land-fraction gradient = onshore.
        u += monsoon * (landSmooth[j * W + ie] - landSmooth[j * W + iw]) / (2 * g.dxKm[j]);
        v += monsoon * (landSmooth[jn + i] - landSmooth[js + i]) / dyKm;
      }

      const gx = (hs[j * W + ie] - hs[j * W + iw]) / (2 * g.dxKm[j]);
      const gy = (hs[jn + i] - hs[js + i]) / dyKm;
      const gm = Math.hypot(gx, gy);
      if (gm > 1e-6) {
        const nx = gx / gm, ny = gy / gm;
        const uphill = u * nx + v * ny;
        if (uphill > 0) {
          const k = C.windDeflect * smoothstep(0, C.windDeflectSlopeMPerKm, gm);
          u -= uphill * nx * k;
          v -= uphill * ny * k;
        }
      }
      if (h[c] > 0) {
        u *= C.landWindFactor;
        v *= C.landWindFactor;
      }
      windU[c] = u;
      windV[c] = v;
    }
  }
  return { windU, windV };
}

/**
 * Temperature from latitude, altitude and ocean currents. Precipitation from moisture carried by
 * the 2D wind field (semi-Lagrangian advection): air picks up moisture over sea, rains out over
 * land and condenses when lifted over mountains, leaving rain shadows downwind. Air chilled by
 * cold currents is stable and rains less, producing coastal deserts.
 *
 * With `withSeasons`, temperature swings by a latitude- and continentality-dependent amplitude,
 * and precipitation is simulated separately for northern summer and winter (shifted wind bands
 * plus monsoons); annual precipitation is their mean.
 */
export function computeClimate(
  g: Grid, h: Float32Array, noise: Simplex3, withOceans = true, withSeasons = true,
): Climate {
  const { W, H, N } = g;
  const tempSea = new Float32Array(N);
  const temp = new Float32Array(N);
  const lapse = C.lapseRateCPerKm / 1000;

  const rowBase = new Float32Array(N);
  for (let j = 0, c = 0; j < H; j++) {
    const cl = g.cosLat[j], z = g.sinLat[j];
    const rowT = C.poleTempC + (C.equatorTempC - C.poleTempC) * cl;
    for (let i = 0; i < W; i++, c++) {
      const x = cl * g.cosLon[i], y = cl * g.sinLon[i];
      rowBase[c] = rowT;
      tempSea[c] = rowT + C.tempNoiseC * fbm(noise, x * 3, y * 3, z * 3, 3);
    }
  }

  const { windU, windV } = computeWind(g, h, noise);
  const ocean = withOceans
    ? computeOcean(g, h, rowBase, windU, windV)
    : { currentU: new Float32Array(N), currentV: new Float32Array(N), tempAnomaly: new Float32Array(N) };
  for (let c = 0; c < N; c++) {
    tempSea[c] += ocean.tempAnomaly[c];
    temp[c] = tempSea[c] - lapse * Math.max(0, h[c]);
  }

  if (!withSeasons) {
    const precip = precipitationField(g, h, tempSea, temp, windU, windV, ocean.tempAnomaly);
    return {
      tempSea, temp, precip, windU, windV, ...ocean,
      tempWarm: temp, tempCold: temp, precipSummer: precip, precipWinter: precip,
    };
  }

  // Seasonal half-amplitude: grows with latitude and with distance from the sea along the wind.
  const cont = continentality(g, h, windU, windV);
  const amp = new Float32Array(N);
  for (let j = 0, c = 0; j < H; j++) {
    const latF = Math.pow(Math.abs(g.sinLat[j]), C.seasonalAmpLatExponent);
    for (let i = 0; i < W; i++, c++) {
      amp[c] = latF * (C.oceanSeasonalAmpC + (C.landSeasonalAmpC - C.oceanSeasonalAmpC) * cont[c]);
    }
  }

  const land = new Float32Array(N);
  for (let c = 0; c < N; c++) land[c] = h[c] > 0 ? 1 : 0;
  const landSmooth = blurKm(g, land, C.monsoonLandBlurKm);
  const seasonal: Float32Array[] = [];
  for (const season of [1, -1]) {
    const w = computeWind(g, h, noise, season, landSmooth);
    const tSea = new Float32Array(N), t = new Float32Array(N);
    for (let j = 0, c = 0; j < H; j++) {
      const s = season * Math.sign(g.latDeg[j]);
      for (let i = 0; i < W; i++, c++) {
        tSea[c] = tempSea[c] + s * amp[c];
        t[c] = temp[c] + s * amp[c];
      }
    }
    seasonal.push(precipitationField(g, h, tSea, t, w.windU, w.windV, ocean.tempAnomaly));
  }
  const [northSummer, northWinter] = seasonal;

  const precip = new Float32Array(N), precipSummer = new Float32Array(N), precipWinter = new Float32Array(N);
  const tempWarm = new Float32Array(N), tempCold = new Float32Array(N);
  for (let j = 0, c = 0; j < H; j++) {
    const north = g.latDeg[j] > 0;
    for (let i = 0; i < W; i++, c++) {
      precipSummer[c] = north ? northSummer[c] : northWinter[c];
      precipWinter[c] = north ? northWinter[c] : northSummer[c];
      precip[c] = 0.5 * (northSummer[c] + northWinter[c]);
      tempWarm[c] = temp[c] + amp[c];
      tempCold[c] = temp[c] - amp[c];
    }
  }

  return { tempSea, temp, precip, windU, windV, ...ocean, tempWarm, tempCold, precipSummer, precipWinter };
}

/** 1 at sea and on windward coasts, decaying toward 0 with distance travelled inland by the wind. */
function continentality(g: Grid, h: Float32Array, windU: Float32Array, windV: Float32Array): Float32Array {
  const { N } = g;
  const step = Math.max(C.oceanStepKm, g.dyKm);
  const up = buildUpstream(g, windU, windV, step);
  const decay = Math.exp(-step / C.continentalityKm);
  let m = new Float32Array(N), next = new Float32Array(N);
  for (let c = 0; c < N; c++) m[c] = h[c] <= 0 ? 1 : 0;
  for (let it = 0, n = Math.ceil((3 * C.continentalityKm) / step); it < n; it++) {
    for (let c = 0; c < N; c++) next[c] = h[c] <= 0 ? 1 : sampleUpstream(up, m, c) * decay;
    [m, next] = [next, m];
  }
  // Even downwind coasts feel some sea influence, so also blend in plain proximity.
  const near = blurKm(g, Float32Array.from(h, (v) => (v <= 0 ? 1 : 0)), C.continentalityKm / 3);
  const out = new Float32Array(N);
  for (let c = 0; c < N; c++) out[c] = h[c] <= 0 ? 0 : 1 - Math.max(m[c], Math.min(1, 2 * near[c]));
  return out;
}

/** Precipitation transport, run on a grid capped at advectMaxWidth (it is smoothed over ~150 km anyway). */
function precipitationField(
  g: Grid, h: Float32Array, tempSea: Float32Array, temp: Float32Array,
  windU: Float32Array, windV: Float32Array, anomaly: Float32Array,
): Float32Array {
  const { W, H } = g;
  const k = Math.max(1, Math.ceil(W / C.advectMaxWidth));
  let raw: Float32Array;
  if (k === 1) {
    raw = advectMoisture(g, h, tempSea, temp, windU, windV, anomaly);
  } else {
    const gc = makeGrid(W / k, H / k);
    const down = (f: Float32Array) => downsample(g, f, k);
    raw = upsample(g, gc, advectMoisture(gc, down(h), down(tempSea), down(temp), down(windU), down(windV), down(anomaly)), k);
  }
  return blurKm(g, raw, C.precipBlurKm);
}

function downsample(g: Grid, f: Float32Array, k: number): Float32Array {
  const Wc = g.W / k, Hc = g.H / k;
  const out = new Float32Array(Wc * Hc);
  for (let j = 0; j < g.H; j++) {
    const row = ((j / k) | 0) * Wc;
    for (let i = 0; i < g.W; i++) out[row + ((i / k) | 0)] += f[j * g.W + i];
  }
  const inv = 1 / (k * k);
  for (let c = 0; c < out.length; c++) out[c] *= inv;
  return out;
}

function upsample(g: Grid, gc: Grid, f: Float32Array, k: number): Float32Array {
  const out = new Float32Array(g.N);
  for (let j = 0; j < g.H; j++) {
    const fy = Math.min(gc.H - 1, Math.max(0, (j + 0.5) / k - 0.5));
    const j0 = Math.min(gc.H - 2, Math.floor(fy)), ty = fy - j0;
    for (let i = 0; i < g.W; i++) {
      const fx = (i + 0.5) / k - 0.5;
      const i0 = Math.floor(fx), tx = fx - i0;
      const a = (i0 + gc.W) % gc.W, b = (a + 1) % gc.W;
      const r0 = j0 * gc.W, r1 = r0 + gc.W;
      out[j * g.W + i] = (f[r0 + a] * (1 - tx) + f[r0 + b] * tx) * (1 - ty) + (f[r1 + a] * (1 - tx) + f[r1 + b] * tx) * ty;
    }
  }
  return out;
}

/** Semi-Lagrangian moisture transport; returns unsmoothed precipitation in mm/yr. */
function advectMoisture(
  g: Grid, h: Float32Array, tempSea: Float32Array, temp: Float32Array,
  windU: Float32Array, windV: Float32Array, anomaly: Float32Array,
): Float32Array {
  const { W, H, N } = g;
  const step = Math.max(C.advectStepKm, g.dyKm);
  const up = buildUpstream(g, windU, windV, step);

  const evap = 1 - Math.exp(-step / C.evapLengthKm);
  const rainLand = 1 - Math.exp(-step / C.rainLengthLandKm);
  const rainSea = 1 - Math.exp(-step / C.rainLengthSeaKm);
  const satSea = new Float32Array(N), cap = new Float32Array(N), stability = new Float32Array(N);
  let m = new Float32Array(N), next = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    satSea[c] = saturation(tempSea[c]);
    cap[c] = saturation(temp[c]);
    stability[c] = Math.exp(Math.min(0, anomaly[c]) / C.coldStabilityC);
    m[c] = 0.5 * satSea[c];
  }

  const iterations = Math.ceil(C.advectDistanceKm / step);
  const recordFrom = Math.floor(iterations * 0.6);
  const acc = new Float32Array(N);
  for (let it = 0; it < iterations; it++) {
    const record = it >= recordFrom;
    for (let c = 0; c < N; c++) {
      let mu = sampleUpstream(up, m, c);
      let p: number;
      if (h[c] <= 0) {
        mu += (satSea[c] - mu) * evap;
        p = mu * rainSea * stability[c];
        mu -= p;
      } else {
        p = mu * rainLand * stability[c];
        if (mu - p > cap[c]) p += (mu - p - cap[c]) * C.condenseRate;
        mu -= p * (1 - C.recycle);
      }
      next[c] = mu;
      if (record) acc[c] += p;
    }
    [m, next] = [next, m];
  }

  const norm = C.precipScale / ((iterations - recordFrom) * step);
  const conv = windConvergence(g, windU, windV);
  for (let c = 0; c < N; c++) {
    acc[c] *= norm * Math.max(C.rainFactorMin, C.rainFactorBase + C.rainFactorConvergence * conv[c]);
  }
  return acc;
}

/**
 * Horizontal wind convergence (−divergence on the sphere), smoothed and normalised to ~1 at the
 * ITCZ. Converging air rises and rains (ITCZ, polar front, onshore flow slowing over land);
 * diverging air sinks and dries (subtropical and polar highs).
 */
function windConvergence(g: Grid, u: Float32Array, v: Float32Array): Float32Array {
  const { W, H, N } = g;
  const conv = new Float32Array(N);
  for (let j = 0; j < H; j++) {
    const jn = Math.max(0, j - 1), js = Math.min(H - 1, j + 1);
    const cosJ = Math.max(0.05, g.cosLat[j]);
    const cosN = Math.max(0.05, g.cosLat[jn]), cosS = Math.max(0.05, g.cosLat[js]);
    const dy = g.dyKm * (js - jn);
    for (let i = 0; i < W; i++) {
      const ie = i + 1 === W ? 0 : i + 1, iw = i === 0 ? W - 1 : i - 1;
      const dudx = (u[j * W + ie] - u[j * W + iw]) / (2 * g.dxKm[j]);
      const dvdy = (v[jn * W + i] * cosN - v[js * W + i] * cosS) / (dy * cosJ);
      conv[j * W + i] = Math.max(-1.5, Math.min(1.5, -(dudx + dvdy) / C.convergenceRefPerKm));
    }
  }
  return blurKm(g, conv, C.convergenceBlurKm);
}
