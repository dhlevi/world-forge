import type { Pt } from './geom';
import { BUNDLE } from '../names/bundles';

/**
 * Town plan layouts. Every walled town starts as Voronoi wards, but where the ward seeds lie and
 * which wards make up the walled core decide its character:
 *
 * - radial: Watabou's sunflower spiral around one market (the classic round town)
 * - grid: a planned town (Roman castrum, bastide) on a rotated lattice with a rectangular core
 * - linear: a ribbon along a river, shore, valley or road, with a high street down its spine
 * - organic: an irregular, lobed hill town on uneven ground, with wards of mixed sizes
 * - twin: two cores grown together (castle town and market town, or the two banks of a river)
 */
export type CityLayout = 'radial' | 'grid' | 'linear' | 'organic' | 'twin';

export const LAYOUT_LABEL: Record<CityLayout, string> = {
  radial: 'round town', grid: 'planned grid', linear: 'ribbon town', organic: 'hill town', twin: 'twin town',
};

export interface Layout {
  style: CityLayout;
  /** Ward seeds (local metres). */
  pts: Pt[];
  /** One Lloyd step to even out ward sizes (not for lattices or deliberately uneven towns). */
  lloyd: boolean;
  /** Market centres; the ward nearest each becomes a plaza. */
  nuclei: Pt[];
  /** Shape distance (m): wards are added to the walled core in order of this (times slope). */
  metric: (p: Pt) => number;
  /** How strongly steep ground is kept out of the core, and the grade (rise/run) at which street cost doubles. */
  slopeW: number;
  gradeRef: number;
  /** Width (m) of the streets between wards that are not main streets. */
  laneW: number;
  /** Skew of lot cuts (0 for the right angles of a planned town). */
  skew: number;
}

export interface LayoutSite {
  rnd: () => number;
  /** Wards in the walled core, core radius and plan radius (m). */
  nInner: number;
  Rin: number;
  R: number;
  /** Main direction (unit vector): the river, shore, valley or road the town follows. */
  axis: Pt;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Sunflower spiral of n seeds around c, spacing sc. */
function sunflower(n: number, sc: number, c: Pt, rnd: () => number, jitterR = 0.2, jitterA = 0.4): Pt[] {
  const out: Pt[] = [c];
  const a0 = rnd() * 2 * Math.PI;
  for (let i = 1; i < n; i++) {
    const r = sc * Math.sqrt(i + 0.5) * (1 - jitterR / 2 + jitterR * rnd());
    const a = a0 + i * GOLDEN + (rnd() - 0.5) * jitterA;
    out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return out;
}

/** Keeps seeds at least `minD` apart (first come, first kept), on a hash grid. */
function thin(pts: Pt[], minD: number, keepFirst: number): Pt[] {
  const cell = new Map<string, Pt[]>();
  const k = (x: number, y: number) => `${Math.floor(x / minD)},${Math.floor(y / minD)}`;
  const out: Pt[] = [];
  pts.forEach((p, idx) => {
    const ci = Math.floor(p[0] / minD), cj = Math.floor(p[1] / minD);
    if (idx >= keepFirst) {
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          for (const q of cell.get(`${ci + di},${cj + dj}`) ?? []) if (Math.hypot(q[0] - p[0], q[1] - p[1]) < minD) return;
        }
      }
    }
    const kk = k(p[0], p[1]);
    if (!cell.has(kk)) cell.set(kk, []);
    cell.get(kk)!.push(p);
    out.push(p);
  });
  return out;
}

export function makeLayout(style: CityLayout, site: LayoutSite): Layout {
  const { rnd, nInner, Rin, R, axis } = site;
  const sc = Rin / Math.sqrt(nInner);
  const nTotal = Math.ceil(nInner * ((R * 1.2) / Rin) ** 2);
  const [ax, ay] = axis;
  // Axis frame: u along the axis, v across it.
  const uv = (p: Pt): Pt => [p[0] * ax + p[1] * ay, -p[0] * ay + p[1] * ax];
  const xy = (u: number, v: number): Pt => [u * ax - v * ay, u * ay + v * ax];
  const base = { slopeW: 8, gradeRef: 0.06, laneW: 2, skew: 0.25 };

  switch (style) {
    case 'grid': {
      // A lattice turned to the main road, slightly sheared, a little irregular; the core is a
      // rectangle (a squared-off superellipse) of about the right number of wards.
      // Spiral wards average π·sc² each; lattice wards match that.
      const g = sc * Math.sqrt(Math.PI) * (0.95 + 0.1 * rnd());
      const asp = 1 + 0.45 * rnd();
      const shear = (rnd() - 0.5) * 0.16;
      const pts: Pt[] = [];
      const n = Math.ceil((R * 1.25) / g);
      for (let i = -n; i <= n; i++) {
        for (let j = -n; j <= n; j++) {
          // Regular in the town, looser out in the fields (old field boundaries drift).
          const far = Math.min(1, Math.max(0, (Math.hypot(i * Math.sqrt(asp), j / Math.sqrt(asp)) * g - Rin * 1.3) / Rin));
          const jit = 0.08 + 0.3 * far;
          const u = (i + (rnd() - 0.5) * jit) * g * Math.sqrt(asp), v = (j + (rnd() - 0.5) * jit) * (g / Math.sqrt(asp));
          const p = xy(u + shear * v, v);
          if (Math.hypot(p[0], p[1]) <= R * 1.25) pts.push(p);
        }
      }
      // The seed nearest the centre first (the market square).
      pts.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
      return {
        ...base, style, pts, lloyd: false, nuclei: [pts[0]], laneW: 3, skew: 0, slopeW: 4,
        metric: (p) => {
          const [u, v] = uv(p);
          const a = Math.abs(u) / Math.sqrt(asp), b = Math.abs(v) * Math.sqrt(asp);
          return (a ** 6 + b ** 6) ** (1 / 6);
        },
      };
    }
    case 'linear': {
      // Two rows of seeds either side of a gently bowed spine (the high street), then the usual
      // spiral for everything else; the core is a long ellipse along the axis.
      const bow = (rnd() - 0.5) * 0.5 / Rin;
      const spineV = (u: number) => bow * u * u;
      const rows: Pt[] = [];
      const step = sc * (1.5 + 0.3 * rnd());
      const half = Rin * 1.9;
      for (let u = -half; u <= half; u += step) {
        for (const side of [-1, 1]) rows.push(xy(u + (rnd() - 0.5) * step * 0.2, spineV(u) + side * sc * (0.85 + 0.15 * rnd())));
      }
      const pts = thin([...rows, ...sunflower(nTotal, sc, [0, 0], rnd).slice(1)], sc * 1.25, rows.length);
      const ka = 1.65, kc = 0.55;
      return {
        ...base, style, pts, lloyd: false, nuclei: [[0, 0]],
        metric: (p) => {
          const [u, v] = uv(p);
          return Math.hypot(u / ka, (v - spineV(u)) / kc);
        },
      };
    }
    case 'organic': {
      // Uneven spiral without relaxation (wards of mixed sizes) and a lobed outline from a few
      // random harmonics; steep ground is kept out more strongly, and streets wind more.
      const pts = sunflower(nTotal, sc * 0.97, [0, 0], rnd, 0.6, 1.4);
      const harm = [2, 3, 5].map((k) => ({ k, a: (0.12 + 0.18 * rnd()) / (k / 2), ph: rnd() * 2 * Math.PI }));
      return {
        ...base, style, pts, lloyd: false, nuclei: [[0, 0]], slopeW: 22, gradeRef: 0.045,
        metric: (p) => {
          const ang = Math.atan2(p[1], p[0]);
          let f = 1;
          for (const h of harm) f += h.a * Math.sin(h.k * ang + h.ph);
          return Math.hypot(p[0], p[1]) / Math.max(0.45, f);
        },
      };
    }
    case 'twin': {
      // Two spirals either side of the axis' normal (across a river when there is one), the
      // second core a little smaller; overlapping seeds are thinned out.
      const D = Rin * 1.25;
      const c1 = xy(0, -D / 2), c2 = xy(0, D / 2);
      const pts = thin([c1, c2, ...sunflower(Math.ceil(nTotal * 0.62), sc, c1, rnd).slice(1), ...sunflower(Math.ceil(nTotal * 0.62), sc, c2, rnd).slice(1)], sc * 1.2, 2);
      return {
        ...base, style, pts, lloyd: true, nuclei: [c1, c2],
        metric: (p) => Math.min(Math.hypot(p[0] - c1[0], p[1] - c1[1]), 1.15 * Math.hypot(p[0] - c2[0], p[1] - c2[1])) * 1.25,
      };
    }
    default: {
      const pts = sunflower(nTotal, sc, [0, 0], rnd);
      return { ...base, style: 'radial', pts, lloyd: true, nuclei: [[0, 0]], metric: (p) => Math.hypot(p[0], p[1]) };
    }
  }
}

/**
 * Picks a layout from what the world knows of the site: planned towns in the cultures that
 * built them and on flat ground, ribbons along rivers and shores, hill towns on rough ground,
 * twin towns for big river cities. `relief` is the local relief of the site (m).
 */
export function chooseLayout(o: { tier: string; population: number; river: boolean; coastal: boolean; relief: number; culture: string; r: number }): CityLayout {
  const town = o.tier !== 'city';
  const flat = o.relief < 120 ? 1 : o.relief < 300 ? 0.5 : 0.15;
  const b = BUNDLE.get(o.culture);
  const planned = b?.planned ?? 0.15;
  const hilly = b?.hilly ? 0.35 : 0;
  const w: [CityLayout, number][] = [
    ['radial', 1],
    ['grid', (0.15 + planned) * flat * (town ? 0.8 : 1)],
    ['linear', (0.2 + (o.river ? 0.55 : 0) + (o.coastal ? 0.45 : 0) + (o.relief > 200 ? 0.25 : 0)) * (town ? 1.4 : 0.7)],
    ['organic', 0.2 + Math.min(1.6, o.relief / 350) + hilly],
    ['twin', !town && o.population > 6000 ? 0.15 + (o.river ? 0.7 : 0) : 0],
  ];
  const total = w.reduce((a, [, v]) => a + v, 0);
  let t = o.r * total;
  for (const [k, v] of w) {
    if ((t -= v) < 0) return k;
  }
  return 'radial';
}
