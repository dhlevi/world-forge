import type { GeneratedWorld, RasterWorld, WorldParams } from '../gen/world';
import type { RiverCollection } from '../gen/rivers';
import type { RoadFeature } from '../gen/settlements';
import type { LayerId } from '../render/tiles';
import type { Bounds, TownWorld } from '../towns/manager';
import type { PlanFeature } from '../towns/plan';

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
  | { type: 'view'; gen: number; bounds: Bounds; zoom: number };

type FC<F> = { type: 'FeatureCollection'; features: F[] };

/** Collections that changed; null means unchanged. */
export interface TownsResponse {
  type: 'data';
  gen: number;
  villages: FC<PlanFeature | RoadFeature> | null;
  plans: FC<PlanFeature> | null;
}
