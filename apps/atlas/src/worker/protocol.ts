import type { GeneratedWorld, RasterWorld, WorldParams } from '@worldforge/core/gen/world';
import type { RiverCollection } from '@worldforge/core/gen/rivers';
import type { RoadFeature } from '@worldforge/core/gen/settlements';
import type { LayerId } from '@worldforge/core/render/tiles';
import type { Bounds, IndexEntry, TownWorld } from '@worldforge/core/towns/manager';
import type { PlanFeature } from '@worldforge/core/towns/plan';

export type WorkerRequest =
  | { type: 'generate'; id: number; gen: number; params: WorldParams }
  | { type: 'setWorld'; gen: number; raster: RasterWorld; rivers: RiverCollection }
  | { type: 'tile'; id: number; gen: number; layer: LayerId; rivers: boolean; z: number; x: number; y: number };

export type WorkerResponse =
  | { type: 'progress'; id: number; stage: string; pct: number }
  | ({ type: 'generated'; id: number; gen: number } & GeneratedWorld)
  | { type: 'tile'; id: number; bitmap: ImageBitmap }
  | { type: 'error'; id: number; message: string };

export type TownsRequest =
  | { type: 'init'; gen: number; world: TownWorld }
  | { type: 'view'; gen: number; bounds: Bounds; zoom: number; illustrated?: boolean };

type FC<F> = { type: 'FeatureCollection'; features: F[] };

/** Collections that changed (null means unchanged), or a batch of the background search index. */
export type TownsResponse =
  | {
    type: 'data';
    gen: number;
    villages: FC<PlanFeature | RoadFeature> | null;
    plans: FC<PlanFeature> | null;
  }
  | { type: 'index'; gen: number; entries: IndexEntry[]; done: number; total: number };
