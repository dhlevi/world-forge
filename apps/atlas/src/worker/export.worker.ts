import { TownManager, type Bounds, type TownWorld } from '@worldforge/core/towns/manager';
import { setWorldCultures } from '@worldforge/core/names/world-cultures';
import type { Settlement } from '@worldforge/core/gen/settlements';
import type { PlanFeature } from '@worldforge/core/towns/plan';

/**
 * Makes the town plans of an area for the game-data export (export/gamedata.ts), apart from the
 * map's own towns worker so the map stays responsive. Each plan is sent as it is made.
 */
export type ExportRequest = { type: 'region'; world: TownWorld; bounds: Bounds; max: number };
export type ExportResponse =
  | { type: 'sites'; sites: Settlement[] }
  | { type: 'plan'; index: number; site: Settlement; features: PlanFeature[] }
  | { type: 'done' }
  | { type: 'error'; message: string };

self.onmessage = (e: MessageEvent<ExportRequest>) => {
  const msg = e.data;
  try {
    if (msg.world.raster.cultures) setWorldCultures(msg.world.raster.cultures);
    const towns = new TownManager(msg.world);
    const sites = towns.regionSites(msg.bounds, msg.max);
    self.postMessage({ type: 'sites', sites } satisfies ExportResponse);
    sites.forEach((s, index) => {
      // Plans carry no illustrated faces (towns.illustrated stays off).
      const features = towns.planOf(s).filter((f) => f.properties.kind !== 'ill' && f.properties.kind !== 'ills');
      self.postMessage({ type: 'plan', index, site: s, features } satisfies ExportResponse);
    });
    self.postMessage({ type: 'done' } satisfies ExportResponse);
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies ExportResponse);
  }
};
