/** Messages between the game and its worker (worker/game.worker.ts), which holds the world. */
import type { WorldSettings } from '@worldforge/core/settings';

export interface StartSite {
  id: string;
  name: string;
  tier: string;
  population: number;
  lon: number;
  lat: number;
  /** The realm it lies in (its top liege), and its people. */
  realm?: string;
  culture?: string;
}

/** Map styles the world view can show (the core's tile renderer layers). */
export type ViewLayer = 'fantasy' | 'terrain' | 'biomes';

export interface WorldSummary {
  cities: number;
  towns: number;
  realms: number;
  ms: number;
}

/** A settlement near the local map, in local metres (x east, y north). */
export interface LocalSite {
  id: string;
  name: string;
  tier: string;
  x: number;
  y: number;
  radiusM: number;
}

export interface ChunkData {
  cx: number;
  cy: number;
  ground: Uint8Array;
  object: Uint8Array;
  area: Uint16Array;
  areas: string[];
  elev: Int16Array;
  sites: { tx: number; ty: number; kind: string; name: string; id: string }[];
  ms: number;
}

/** One step of a route on the travel map: a chunk, and what crossing it is like. */
export interface RouteStep {
  cx: number;
  cy: number;
  /** Minutes to walk into it. */
  min: number;
  way: string;
  ford: boolean;
  biome: number;
  /** How far the land can be seen from it (m). */
  sight: number;
}

/** What the travel map draws over the tiles: ways and places in an area. */
export interface TravelArea {
  roads: { cls: string; pts: [number, number][] }[];
  places: { id: string; name: string; tier: string; lon: number; lat: number; kind?: string }[];
}

export type ToWorker =
  | { type: 'world'; settings: WorldSettings }
  | { type: 'start'; id: string }
  | { type: 'chunk'; cx: number; cy: number }
  /** A 256 px map tile of the world (Web Mercator z/x/y), for the world view. */
  | { type: 'tile'; id: number; z: number; x: number; y: number; layer: ViewLayer }
  /** A route on the travel map from a chunk toward a point (lon/lat). */
  | { type: 'route'; id: number; from: [number, number]; to: [number, number] }
  /** Roads, tracks and places in a box (lon/lat), with tracks and villages only when `fine`. */
  | { type: 'area'; id: number; west: number; south: number; east: number; north: number; fine: boolean };

export type FromWorker =
  | { type: 'progress'; stage: string; pct: number }
  | { type: 'world'; ms: number; starts: StartSite[]; summary: WorldSummary }
  | { type: 'started'; site: StartSite; tile: [number, number]; sites: LocalSite[]; ms: number }
  | { type: 'chunk'; chunk: ChunkData }
  | { type: 'tile'; id: number; bitmap: ImageBitmap | null }
  | { type: 'route'; id: number; steps: RouteStep[] | null; minutes: number; partial: boolean }
  | { type: 'area'; id: number; area: TravelArea }
  | { type: 'error'; message: string };
