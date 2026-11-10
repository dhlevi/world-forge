/** Messages between the game and its worker (worker/game.worker.ts), which holds the world. */
import type { WorldSettings } from '@worldforge/core/settings';

export interface StartSite {
  id: string;
  name: string;
  tier: string;
  population: number;
  lon: number;
  lat: number;
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

export type ToWorker =
  | { type: 'world'; settings: WorldSettings }
  | { type: 'start'; id: string }
  | { type: 'chunk'; cx: number; cy: number };

export type FromWorker =
  | { type: 'progress'; stage: string; pct: number }
  | { type: 'world'; ms: number; starts: StartSite[] }
  | { type: 'started'; site: StartSite; tile: [number, number]; sites: LocalSite[]; ms: number }
  | { type: 'chunk'; chunk: ChunkData }
  | { type: 'error'; message: string };
