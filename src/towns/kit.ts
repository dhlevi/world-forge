import { Delaunay } from 'd3-delaunay';
import { mulberry32 } from '../gen/rng';
import { type Poly, type Pt, area, ccw, centroid, distToLine, hatch, inset, pointInPoly, rect, segHitsPoly, split } from './geom';
import type { PlanInput } from './plan';

export interface Lane {
  pts: Pt[];
  w: number;
}

/** Shared building blocks for village-scale plans: lanes, houses, fields and trees that avoid each other. */
export class Kit {
  readonly rnd: () => number;
  readonly lanes: Lane[] = [];
  readonly houses: { c: Pt; r: number }[] = [];
  readonly fields: Poly[] = [];
  /** Footprints (compounds, rings) that houses, fields and trees keep out of. */
  readonly blocked: Poly[] = [];
  readonly core: number;
  readonly R: number;

  constructor(readonly inp: PlanInput) {
    this.rnd = mulberry32(inp.s.seed);
    this.core = inp.s.coreM;
    this.R = inp.s.radiusM;
  }

  polar(r: number, a: number): Pt {
    return [r * Math.cos(a), r * Math.sin(a)];
  }

  /** Gently winding polyline from a to b, vertices every ~12 m. */
  curvy(a: Pt, b: Pt, amp: number): Pt[] {
    const { rnd } = this;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const n = Math.max(2, Math.ceil(len / 12));
    const a1 = (rnd() - 0.5) * 2 * amp, a2 = (rnd() - 0.5) * amp;
    const px = -dy / len, py = dx / len;
    const pts: Pt[] = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const off = len * (a1 * Math.sin(Math.PI * t) + a2 * Math.sin(2 * Math.PI * t));
      pts.push([a[0] + dx * t + px * off, a[1] + dy * t + py * off]);
    }
    return pts;
  }

  lane(pts: Pt[], w: number, cls = 'track'): void {
    this.lanes.push({ pts, w });
    this.inp.out.line('road', pts, { cls });
  }

  /**
   * A lane from every incoming road/track to `hub`; one random approach if there are none.
   * With `clear`, later lanes join the first one beyond that radius instead (to skirt a compound).
   */
  exitLanes(hub: Pt = [0, 0], clear = 0): Pt[] {
    const ex = this.inp.exits.length ? this.inp.exits : [{ p: this.polar(this.R, this.rnd() * 2 * Math.PI), cls: 'track' as const }];
    ex.forEach((e, i) => {
      let to = hub;
      if (i > 0 && clear > 0) {
        const first = this.lanes[this.lanes.length - i].pts.filter((p) => Math.hypot(...p) >= clear);
        if (first.length) to = first.reduce((a, b) => (Math.hypot(b[0] - e.p[0], b[1] - e.p[1]) < Math.hypot(a[0] - e.p[0], a[1] - e.p[1]) ? b : a));
      }
      this.lane(this.curvy(e.p, to, 0.12), e.cls === 'track' ? 3.5 : 5, e.cls);
    });
    return ex.map((e) => e.p);
  }

  /** Side lanes branching off existing lanes within maxR of the centre. */
  branches(count: number, maxR: number, length: number): void {
    const { rnd } = this;
    for (let b = 0; b < count && this.lanes.length; b++) {
      const lane = this.lanes[Math.floor(rnd() * this.lanes.length)];
      const near = lane.pts.map((_, k) => k).filter((k) => k > 0 && k < lane.pts.length - 1 && Math.hypot(...lane.pts[k]) < maxR);
      if (!near.length) continue;
      const k = near[Math.floor(rnd() * near.length)];
      const t = [lane.pts[k + 1][0] - lane.pts[k - 1][0], lane.pts[k + 1][1] - lane.pts[k - 1][1]];
      const ang = Math.atan2(t[1], t[0]) + (rnd() < 0.5 ? 1 : -1) * (Math.PI / 2 + (rnd() - 0.5) * 0.6);
      const from = lane.pts[k], l = length * (0.6 + 0.6 * rnd());
      this.lane(this.curvy(from, [from[0] + Math.cos(ang) * l, from[1] + Math.sin(ang) * l], 0.15), 3);
    }
  }

  nearLane(p: Pt, margin: number): boolean {
    return this.lanes.some((l) => distToLine(l.pts, p[0], p[1]) < l.w / 2 + margin);
  }

  inBlocked(p: Pt): boolean {
    return this.blocked.some((b) => pointInPoly(b, p[0], p[1]));
  }

  /** Places a w×d building at c if the spot is dry and clear. */
  house(c: Pt, ang: number, w: number, d: number, use?: string): boolean {
    const r = 0.5 * Math.hypot(w, d);
    if (this.inp.water(c) || this.inBlocked(c) || this.nearLane(c, Math.min(w, d) / 2 + 1)) return false;
    if (this.houses.some((h) => Math.hypot(h.c[0] - c[0], h.c[1] - c[1]) < h.r + r - 1.5)) return false;
    this.houses.push({ c, r });
    this.inp.out.poly('building', rect(c[0], c[1], ang, w, d), use ? { use } : {});
    return true;
  }

  /** Houses facing the lanes on both sides, thinning out with distance from the centre. */
  housesAlongLanes(density: number, size: [number, number], spread = 1): void {
    const { rnd } = this;
    const reach = this.core * spread;
    for (const lane of this.lanes) {
      const pts = lane.pts;
      let along = rnd() * 6;
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], b = pts[k + 1];
        const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (segLen < 1e-6) continue;
        const ux = (b[0] - a[0]) / segLen, uy = (b[1] - a[1]) / segLen;
        for (; along < segLen; along += size[0] + rnd() * 6) {
          const p: Pt = [a[0] + ux * along, a[1] + uy * along];
          const dd = Math.hypot(...p) / reach;
          const prob = density * Math.exp(-0.9 * dd * dd);
          for (const side of [-1, 1]) {
            if (rnd() > prob) continue;
            let w = size[0] + rnd() * (size[1] - size[0]), d = size[0] + 1 + rnd() * (size[1] - size[0] + 1);
            if (rnd() < 0.3) [w, d] = [d, w];
            const off = lane.w / 2 + 2 + rnd() * 5 + d / 2;
            this.house([p[0] - uy * side * off, p[1] + ux * side * off], Math.atan2(uy, ux) + (rnd() - 0.5) * 0.15, w, d);
          }
        }
        along -= segLen;
      }
    }
  }

  /** Voronoi fields with furrows between radii r0 and r1, cut by the lanes; small cells near the centre. */
  fieldRing(r0: number, r1: number, cellArea: number, meadowProb: number): void {
    const { rnd, inp } = this;
    const nF = Math.max(6, Math.round((Math.PI * (r1 * r1 - r0 * r0)) / cellArea));
    const seeds: number[] = [];
    for (let t = 0; t < nF; t++) {
      const p = this.polar(r0 * 0.8 + rnd() * (r1 * 1.15 - r0 * 0.8), rnd() * 2 * Math.PI);
      seeds.push(p[0], p[1]);
    }
    const B = r1 * 1.3;
    const vor = new Delaunay(Float64Array.from(seeds)).voronoi([-B, -B, B, B]);
    const coarse = this.lanes.map((l) => l.pts.filter((_, k) => k % 4 === 0 || k === l.pts.length - 1));
    for (let i = 0; i < seeds.length / 2; i++) {
      const cp = vor.cellPolygon(i);
      if (!cp) continue;
      const poly = ccw(cp.slice(0, -1).map(([x, y]) => [x, y] as Pt));
      const c = centroid(poly);
      const dc = Math.hypot(...c);
      if (dc > r1 || dc < r0 || inp.water(c)) continue;
      const first = inset(poly, 2.5);
      if (!first) continue;
      let parts: Poly[] = [first];
      coarse.forEach((pts, li) => {
        for (let k = 0; k + 1 < pts.length; k++) {
          const a = pts[k], b = pts[k + 1];
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (l < 1e-6) continue;
          const n: Pt = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
          parts = parts.flatMap((q) => (segHitsPoly(q, a, b) ? split(q, a, n, this.lanes[li].w / 2 + 2.5).filter((h) => h.length >= 3) : [q]));
        }
      });
      for (const q of parts) {
        if (area(q) < 800 || inp.water(centroid(q))) continue;
        if (this.houses.some((h) => pointInPoly(q, h.c[0], h.c[1]) || distToLine([...q, q[0]], h.c[0], h.c[1]) < h.r + 3)) continue;
        if (this.blocked.some((b) => b.some((v) => pointInPoly(q, v[0], v[1])) || q.some((v) => pointInPoly(b, v[0], v[1])))) continue;
        this.fields.push(q);
        if (rnd() < meadowProb) {
          inp.out.poly('green', q);
          continue;
        }
        inp.out.poly('field', q, { tone: rnd() });
        for (const l of hatch(q, 6)) inp.out.line('furrow', l);
      }
    }
  }

  tree(p: Pt, r: number, kind = 'tree'): boolean {
    if (this.inp.water(p) || this.nearLane(p, r + 1) || this.inBlocked(p)) return false;
    if (this.houses.some((h) => Math.hypot(h.c[0] - p[0], h.c[1] - p[1]) < h.r + r)) return false;
    if (this.fields.some((f) => pointInPoly(f, p[0], p[1]))) return false;
    this.inp.out.point(kind, p, { r });
    return true;
  }

  clumps(count: number, r0: number, r1: number): void {
    const { rnd } = this;
    for (let k = 0; k < count; k++) {
      const c = this.polar(r0 + rnd() * (r1 - r0), rnd() * 2 * Math.PI);
      const n = 8 + Math.floor(rnd() * 20);
      for (let t = 0; t < n; t++) this.tree([c[0] + (rnd() - 0.5) * 60, c[1] + (rnd() - 0.5) * 60], 2.5 + rnd() * 2.5);
    }
  }

  gardenTrees(prob: number): void {
    const { rnd } = this;
    for (const h of [...this.houses]) {
      if (rnd() >= prob) continue;
      const a = rnd() * 2 * Math.PI;
      this.tree([h.c[0] + Math.cos(a) * (h.r + 4), h.c[1] + Math.sin(a) * (h.r + 4)], 2.5 + rnd() * 1.5);
    }
  }

  /** Close-set trees on a jittered grid between radii r0 and r1. */
  forest(r0: number, r1: number, spacing: number, density: number): void {
    const { rnd } = this;
    for (let y = -r1; y <= r1; y += spacing) {
      for (let x = -r1; x <= r1; x += spacing) {
        const p: Pt = [x + (rnd() - 0.5) * spacing, y + (rnd() - 0.5) * spacing];
        const d = Math.hypot(...p);
        // Ragged clearing edge.
        if (d > r1 || d < r0 * (0.85 + 0.3 * rnd()) || rnd() > density) continue;
        this.tree(p, spacing * (0.45 + 0.25 * rnd()));
      }
    }
  }
}
