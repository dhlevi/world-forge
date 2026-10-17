import type { CityTheme, HolyTown } from '../lore/themes';
import { type Pt, roundPoly } from './geom';

/** Where a burrowing people's houses are burrows (not its halls, mills or temples). */
const BURROW_CTX = new Set(['ward', 'rich', 'suburb', 'farm', 'farming', 'fishing', 'slum', 'counting']);
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
    private site: { sid: string; tier: string; ctx: string; cul?: string; burrows?: boolean } = { sid: '', tier: '', ctx: '' },
  ) {}

  poly(kind: string, p: Pt[], props: Record<string, string | number | undefined> = {}): void {
    for (const k of Object.keys(props)) if (props[k] === undefined) delete props[k];
    // A burrowing people's houses are dug into grassy mounds: the house rounded off, on its mound.
    if (kind === 'building' && this.site.burrows && !props.use && !props.role && BURROW_CTX.has(String(props.ctx ?? this.site.ctx))) {
      p = roundPoly(p, 2);
      let cx = 0, cy = 0;
      for (const q of p) {
        cx += q[0] / p.length;
        cy += q[1] / p.length;
      }
      const r = Math.max(...p.map((q) => Math.hypot(q[0] - cx, q[1] - cy)));
      const k = (r + 2.5) / Math.max(1, r);
      this.poly('mound', p.map((q) => [cx + (q[0] - cx) * k, cy + (q[1] - cy) * k] as Pt));
      props = { ...props, burrow: 1 };
    }
    const ring = p.map((q) => this.frame.toLL(q));
    ring.push(ring[0]);
    if (kind === 'building') {
      props = { bid: `${this.site.sid}/${this.nBuildings++}`, sid: this.site.sid, tier: this.site.tier, ctx: this.site.ctx, ...(this.site.cul ? { cul: this.site.cul } : {}), ...props };
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
    // Lettering carries its settlement, so search can say where a quarter or an inn is.
    if (kind.endsWith('label') && this.site.sid) props = { sid: this.site.sid, ...props };
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
  /** The city's theme, if it has one (see lore/themes.ts). */
  theme?: CityTheme;
  /** What makes the town holy, if it is a holy place of a faith. */
  holy?: HolyTown;
}
