import type { Pt } from './geom';
import type { LocalTerrain } from './terrain';
import type { Ground } from './ground';
import type { NameBank } from '../names/names';
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
  private nBuildings = 0;

  /**
   * `site` tags every building with a stable id (`bid`), its settlement, tier and context
   * (ward kind, or the village kind), which the interiors use to pick a floor plan.
   */
  constructor(
    private frame: LocalFrame, private ppm20: number,
    private site: { sid: string; tier: string; ctx: string } = { sid: '', tier: '', ctx: '' },
  ) {}

  poly(kind: string, p: Pt[], props: Record<string, string | number | undefined> = {}): void {
    for (const k of Object.keys(props)) if (props[k] === undefined) delete props[k];
    const ring = p.map((q) => this.frame.toLL(q));
    ring.push(ring[0]);
    if (kind === 'building') {
      props = { bid: `${this.site.sid}/${this.nBuildings++}`, sid: this.site.sid, tier: this.site.tier, ctx: this.site.ctx, ...props };
    }
    this.features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { kind, ppm20: this.ppm20, ...(props as Record<string, string | number>) } });
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
  /** Usable-ground tests and fitting over `terrain`. */
  ground: Ground;
  out: PlanOut;
  /** Names (deterministic, not de-duplicated) and the local culture. */
  names: NameBank;
  culture: number;
}
