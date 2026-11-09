import type { Grid } from './grid';
import type { Rng } from './rng';

export interface StreamFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: number[][] };
  /** kind 'line' = streamline body, 'head' = arrowhead; value = mean of the optional tint field. */
  properties: { kind: 'line' | 'head'; speed: number; value: number };
}

export interface StreamCollection {
  type: 'FeatureCollection';
  features: StreamFeature[];
}

export interface StreamOptions {
  spacingDeg: number;
  stepKm: number;
  steps: number;
  /** When given, seeds only start where height <= 0 and lines stop on reaching land. */
  seaOnly?: Float32Array;
  /** Field averaged along each line into properties.value (e.g. temperature anomaly). */
  tint?: Float32Array;
}

const KM_PER_DEG = 111.2;
const DEG = Math.PI / 180;

function sample(g: Grid, f: Float32Array, lon: number, lat: number): number {
  const fx = ((lon + 180) / 360) * g.W - 0.5;
  const fy = Math.min(g.H - 1.001, Math.max(0, ((90 - lat) / 180) * g.H - 0.5));
  const i0 = Math.floor(fx), j0 = Math.floor(fy);
  const tx = fx - i0, ty = fy - j0;
  const a = ((i0 % g.W) + g.W) % g.W, b = (a + 1) % g.W;
  const r0 = j0 * g.W, r1 = Math.min(g.H - 1, j0 + 1) * g.W;
  return (f[r0 + a] * (1 - tx) + f[r0 + b] * tx) * (1 - ty) + (f[r1 + a] * (1 - tx) + f[r1 + b] * tx) * ty;
}

function nearest(g: Grid, f: Float32Array, lon: number, lat: number): number {
  const i = ((Math.floor(((lon + 180) / 360) * g.W) % g.W) + g.W) % g.W;
  const j = Math.min(g.H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * g.H)));
  return f[j * g.W + i];
}

/** Evenly spaced streamlines traced through a velocity field, each ending in an arrowhead. */
export function traceStreamlines(g: Grid, u: Float32Array, v: Float32Array, rng: Rng, opts: StreamOptions): StreamCollection {
  const features: StreamFeature[] = [];
  const { spacingDeg: spacing, stepKm, steps, seaOnly, tint } = opts;
  for (let lat0 = -90 + spacing / 2; lat0 < 90; lat0 += spacing) {
    const lonSpacing = spacing / Math.max(0.15, Math.cos(lat0 * DEG));
    for (let lon0 = -180; lon0 < 180; lon0 += lonSpacing) {
      let lon = lon0 + (rng() - 0.5) * lonSpacing * 0.8;
      let lat = lat0 + (rng() - 0.5) * spacing * 0.8;
      if (seaOnly && nearest(g, seaOnly, lon, lat) > 0) continue;
      const pts: number[][] = [[lon, lat]];
      let speedSum = 0, tintSum = 0;
      for (let s = 0; s < steps; s++) {
        const su = sample(g, u, lon, lat), sv = sample(g, v, lon, lat);
        const speed = Math.hypot(su, sv);
        if (speed < 0.05) break;
        const nlat = Math.max(-89, Math.min(89, lat + (sv * stepKm) / KM_PER_DEG));
        const nlon = lon + (su * stepKm) / (KM_PER_DEG * Math.max(0.05, Math.cos(nlat * DEG)));
        if (seaOnly && nearest(g, seaOnly, nlon, nlat) > 0) break;
        speedSum += speed;
        if (tint) tintSum += sample(g, tint, lon, lat);
        lon = nlon;
        lat = nlat;
        pts.push([lon, lat]);
      }
      if (pts.length < 4) continue;
      const n = pts.length - 1;
      const props = { speed: speedSum / n, value: tintSum / n };
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts }, properties: { kind: 'line', ...props } });

      const [ex, ey] = pts[n], [px, py] = pts[n - 1];
      const kx = KM_PER_DEG * Math.cos(ey * DEG);
      const dx = (ex - px) * kx, dy = (ey - py) * KM_PER_DEG;
      const len = Math.hypot(dx, dy) || 1;
      const head = 2.5 * stepKm;
      const wing = (rot: number): number[] => {
        const c = Math.cos(rot), s = Math.sin(rot);
        const bx = (-dx / len) * c - (-dy / len) * s, by = (-dx / len) * s + (-dy / len) * c;
        return [ex + (bx * head) / Math.max(1e-3, kx), ey + (by * head) / KM_PER_DEG];
      };
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [wing(0.45), [ex, ey], wing(-0.45)] },
        properties: { kind: 'head', ...props },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
