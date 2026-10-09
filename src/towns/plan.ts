import type { Pt } from './geom';
import type { LocalTerrain } from './terrain';
import type { RoadClass, Settlement } from '../gen/settlements';

const M_PER_DEG = (Math.PI * 6371000) / 180;

/** Local tangent-plane frame (metres east/north) around a settlement. */
export class LocalFrame {
  readonly mLon: number;

  constructor(readonly lon0: number, readonly lat0: number) {
    this.mLon = M_PER_DEG * Math.max(0.01, Math.cos((lat0 * Math.PI) / 180));
  }

  toLL(p: Pt): number[] {
    return [this.lon0 + p[0] / this.mLon, this.lat0 + p[1] / M_PER_DEG];
  }

  fromLL(lon: number, lat: number): Pt {
    const dLon = ((((lon - this.lon0) % 360) + 540) % 360) - 180;
    return [dLon * this.mLon, (lat - this.lat0) * M_PER_DEG];
  }
}

export interface PlanFeature {
  type: 'Feature';
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'LineString'; coordinates: number[][] }
    | { type: 'Point'; coordinates: number[] };
  properties: Record<string, string | number>;
}

/** Collects plan geometry in local metres and emits lon/lat GeoJSON features tagged with `kind`. */
export class PlanOut {
  readonly features: PlanFeature[] = [];

  constructor(private frame: LocalFrame, private ppm20: number) {}

  poly(kind: string, p: Pt[], props: Record<string, string | number> = {}): void {
    const ring = p.map((q) => this.frame.toLL(q));
    ring.push(ring[0]);
    this.features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { kind, ppm20: this.ppm20, ...props } });
  }

  line(kind: string, pts: Pt[], props: Record<string, string | number> = {}): void {
    if (pts.length < 2) return;
    this.features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: pts.map((q) => this.frame.toLL(q)) },
      properties: { kind, ppm20: this.ppm20, ...props },
    });
  }

  point(kind: string, p: Pt, props: Record<string, string | number> = {}): void {
    this.features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: this.frame.toLL(p) }, properties: { kind, ppm20: this.ppm20, ...props } });
  }
}

export interface PlanInput {
  s: Settlement;
  /** Where roads and tracks reach the plan edge, in local metres. */
  exits: { p: Pt; cls: RoadClass }[];
  water: (p: Pt) => boolean;
  terrain: LocalTerrain;
  out: PlanOut;
}
