import { type Pt, hull, rect } from './geom';
import type { PlanOut } from './plan';
import { type LocalTerrain, SEA, type ShorePoint } from './terrain';

export interface DockOptions {
  /** Only shoreline within this distance of the centre gets piers. */
  maxR: number;
  spacing: number;
  pierW: number;
  /** Pier length range on the sea (river piers are short). */
  seaLen: [number, number];
  boatLen: [number, number];
  boatProb: number;
  lighthouse?: boolean;
  /** Ships riding at anchor offshore. */
  ships?: number;
}

const along = (p: Pt, n: Pt, d: number): Pt => [p[0] + n[0] * d, p[1] + n[1] * d];

/** Piers and jetties out from the shore with boats moored alongside; returns the pier roots. */
export function addDocks(t: LocalTerrain, water: (p: Pt) => boolean, out: PlanOut, rnd: () => number, o: DockOptions): ShorePoint[] {
  const used: ShorePoint[] = [];
  const clear = (p: Pt, n: Pt, from: number, to: number) => {
    for (let d = from; d <= to; d += 3) if (!water(along(p, n, d))) return false;
    return true;
  };
  let longest: { tip: Pt; L: number } | null = null;
  for (const s of t.shore(o.maxR, o.spacing, rnd)) {
    const sea = s.type === SEA;
    // Keep open water beyond the tip so river jetties never bridge the river.
    const beyond = sea ? 15 : 12;
    const L0 = sea ? o.seaLen[0] + rnd() * (o.seaLen[1] - o.seaLen[0]) : 6 + rnd() * 8;
    let L = 0, dir: Pt = s.n;
    // Try a few angles and lengths so piers find a way out past a rough shoreline.
    search: for (const f of [1, 0.6, 0.35]) {
      for (const turn of [0, 0.3, -0.3, 0.6, -0.6]) {
        const d: Pt = [s.n[0] * Math.cos(turn) - s.n[1] * Math.sin(turn), s.n[0] * Math.sin(turn) + s.n[1] * Math.cos(turn)];
        if (L0 * f >= 6 && clear(s.p, d, 4, L0 * f + beyond)) {
          L = L0 * f;
          dir = d;
          break search;
        }
      }
    }
    if (L === 0) continue;
    s.n = dir;
    const ang = Math.atan2(s.n[1], s.n[0]);
    const c = along(s.p, s.n, (L - 2) / 2);
    out.poly('pier', rect(c[0], c[1], ang, L + 2, o.pierW));
    used.push(s);
    const tip = along(s.p, s.n, L);
    if (sea && L > 30 && rnd() < 0.4) out.poly('pier', rect(tip[0], tip[1], ang + Math.PI / 2, 14, 4));
    if (rnd() < o.boatProb) {
      const side = rnd() < 0.5 ? 1 : -1;
      const bl = (o.boatLen[0] + rnd() * (o.boatLen[1] - o.boatLen[0])) * (sea ? 1 : 0.6), bw = bl * 0.3;
      const m = along(s.p, s.n, Math.max(bl / 2 + 2, Math.min(L - bl / 2, L * 0.55)));
      const bc: Pt = [m[0] - s.n[1] * side * (o.pierW / 2 + bw / 2 + 1), m[1] + s.n[0] * side * (o.pierW / 2 + bw / 2 + 1)];
      if (water(bc) && water(along(bc, s.n, bl / 2)) && water(along(bc, s.n, -bl / 2))) {
        out.poly('boat', hull(bc, ang + (rnd() < 0.5 ? 0 : Math.PI), bl, bw));
      }
    }
    if (sea && (!longest || L > longest.L)) longest = { tip, L };
  }
  if (o.lighthouse && longest) out.point('tower', longest.tip, { r: 5 });

  for (let k = 0, tries = 0; k < (o.ships ?? 0) && tries < 60; tries++) {
    const r = o.maxR * (0.6 + 0.7 * rnd()), a = rnd() * 2 * Math.PI;
    const p: Pt = [r * Math.cos(a), r * Math.sin(a)];
    if (t.typeAt(p) !== SEA) continue;
    if (![0, 1, 2, 3].every((q) => water(along(p, [Math.cos(q * 1.57), Math.sin(q * 1.57)], 35)))) continue;
    out.poly('boat', hull(p, rnd() * 2 * Math.PI, 22 + rnd() * 14, 7));
    k++;
  }
  return used;
}
