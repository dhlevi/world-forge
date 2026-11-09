export const EARTH_RADIUS_KM = 6371;

const DEG = Math.PI / 180;

/** Great-circle distance in km. */
export function distKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const s1 = Math.sin(((lat2 - lat1) * DEG) / 2), s2 = Math.sin(((lon2 - lon1) * DEG) / 2);
  const a = s1 * s1 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * s2 * s2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Web Mercator pixels per metre at zoom 20 (256-px tiles); halves with each zoom level below. */
export function pxPerMeterZ20(latDeg: number): number {
  return (256 * 2 ** 20) / (40075016.686 * Math.max(0.01, Math.cos(latDeg * DEG)));
}

/** 8-neighbourhood offsets. Index k is shared by DI/DJ and Grid.nbDist. */
export const DI = [-1, 0, 1, -1, 1, -1, 0, 1] as const;
export const DJ = [-1, -1, -1, 0, 0, 1, 1, 1] as const;
export const ORTHO = [1, 3, 4, 6] as const;

/**
 * Equirectangular lon/lat grid wrapping east-west. Row 0 is the north pole edge.
 * All physical quantities are expressed in km so results are resolution independent.
 */
export interface Grid {
  W: number;
  H: number;
  N: number;
  sinLat: Float64Array;
  cosLat: Float64Array;
  latDeg: Float64Array;
  sinLon: Float64Array;
  cosLon: Float64Array;
  lonDeg: Float64Array;
  dxKm: Float64Array;
  dyKm: number;
  areaKm2: Float64Array;
  /** Distance (km) to neighbour k from a cell in row j, at [j * 8 + k]. */
  nbDist: Float64Array;
}

export function makeGrid(W: number, H: number): Grid {
  const R = EARTH_RADIUS_KM;
  const dyKm = (Math.PI * R) / H;
  const sinLat = new Float64Array(H), cosLat = new Float64Array(H), latDeg = new Float64Array(H);
  const dxKm = new Float64Array(H), areaKm2 = new Float64Array(H);
  for (let j = 0; j < H; j++) {
    const lat = Math.PI / 2 - ((j + 0.5) * Math.PI) / H;
    latDeg[j] = (lat * 180) / Math.PI;
    sinLat[j] = Math.sin(lat);
    cosLat[j] = Math.cos(lat);
    dxKm[j] = (2 * Math.PI * R * cosLat[j]) / W;
    areaKm2[j] = dxKm[j] * dyKm;
  }
  const sinLon = new Float64Array(W), cosLon = new Float64Array(W), lonDeg = new Float64Array(W);
  for (let i = 0; i < W; i++) {
    const lon = -Math.PI + ((i + 0.5) * 2 * Math.PI) / W;
    lonDeg[i] = (lon * 180) / Math.PI;
    sinLon[i] = Math.sin(lon);
    cosLon[i] = Math.cos(lon);
  }
  const nbDist = new Float64Array(H * 8);
  for (let j = 0; j < H; j++) {
    for (let k = 0; k < 8; k++) {
      const nj = j + DJ[k];
      if (nj < 0 || nj >= H) nbDist[j * 8 + k] = Infinity;
      else if (DJ[k] === 0) nbDist[j * 8 + k] = dxKm[j];
      else if (DI[k] === 0) nbDist[j * 8 + k] = dyKm;
      else nbDist[j * 8 + k] = Math.hypot((dxKm[j] + dxKm[nj]) / 2, dyKm);
    }
  }
  return { W, H, N: W * H, sinLat, cosLat, latDeg, sinLon, cosLon, lonDeg, dxKm, dyKm, areaKm2, nbDist };
}

/** Index of neighbour k of cell (i, j), or -1 past the poles. */
export function neighbor(g: Grid, i: number, j: number, k: number): number {
  const nj = j + DJ[k];
  if (nj < 0 || nj >= g.H) return -1;
  let ni = i + DI[k];
  if (ni < 0) ni += g.W;
  else if (ni >= g.W) ni -= g.W;
  return nj * g.W + ni;
}

export function cellAt(g: Grid, lonDeg: number, latDeg: number): number {
  let i = Math.floor(((lonDeg + 180) / 360) * g.W) % g.W;
  if (i < 0) i += g.W;
  const j = Math.min(g.H - 1, Math.max(0, Math.floor(((90 - latDeg) / 180) * g.H)));
  return j * g.W + i;
}

/** Value below which `fraction` of the sphere's surface area lies. */
export function areaQuantile(g: Grid, field: Float32Array, fraction: number): number {
  let min = Infinity, max = -Infinity;
  for (let c = 0; c < g.N; c++) {
    const v = field[c];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max <= min) return min;
  const BINS = 16384;
  const hist = new Float64Array(BINS);
  const scale = BINS / (max - min);
  let total = 0;
  for (let j = 0; j < g.H; j++) {
    const a = g.areaKm2[j];
    for (let i = 0, c = j * g.W; i < g.W; i++, c++) {
      hist[Math.min(BINS - 1, Math.floor((field[c] - min) * scale))] += a;
      total += a;
    }
  }
  const target = fraction * total;
  let acc = 0;
  for (let b = 0; b < BINS; b++) {
    if (acc + hist[b] >= target) {
      const f = hist[b] > 0 ? (target - acc) / hist[b] : 0;
      return min + (b + f) / scale;
    }
    acc += hist[b];
  }
  return max;
}

/** Separable box blur with a physical radius; repeated passes approximate a gaussian. */
export function blurKm(g: Grid, src: Float32Array, radiusKm: number, passes = 2): Float32Array {
  const { W, H } = g;
  let a = Float32Array.from(src);
  const b = new Float32Array(g.N);
  const rv = Math.round(radiusKm / g.dyKm);
  const wrap = (k: number) => ((k % W) + W) % W;
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < H; j++) {
      const off = j * W;
      const r = Math.min(Math.floor((W - 1) / 2), Math.round(radiusKm / g.dxKm[j]));
      if (r <= 0) {
        b.set(a.subarray(off, off + W), off);
        continue;
      }
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += a[off + wrap(k)];
      const inv = 1 / (2 * r + 1);
      for (let i = 0; i < W; i++) {
        b[off + i] = sum * inv;
        sum += a[off + wrap(i + r + 1)] - a[off + wrap(i - r)];
      }
    }
    if (rv <= 0) {
      a.set(b);
      continue;
    }
    const clampJ = (j: number) => (j < 0 ? 0 : j >= H ? H - 1 : j);
    const inv = 1 / (2 * rv + 1);
    for (let i = 0; i < W; i++) {
      let sum = 0;
      for (let k = -rv; k <= rv; k++) sum += b[clampJ(k) * W + i];
      for (let j = 0; j < H; j++) {
        a[j * W + i] = sum * inv;
        sum += b[clampJ(j + rv + 1) * W + i] - b[clampJ(j - rv) * W + i];
      }
    }
  }
  return a;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
