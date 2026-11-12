/**
 * The game's side of the world worker (worker/game.worker.ts): requests that answer (tiles,
 * routes, areas, the catalogue, names) as promises, and the worker's own news (progress, a world
 * made, a game started, chunks, errors) as messages on the bus.
 */
import type { MessageDispatcher } from '../engine/messages';
import type { WorldSettings } from '@worldforge/core/settings';
import type { Catalogue, ChunkData, FromWorker, Gate, LocalSite, PersonName, PlanImage, RouteStep, SiteInfo, StartSite, ToWorker, TravelArea, ViewLayer, WorldSummary } from '../worker/protocol';

declare module '../engine/messages' {
  interface MessageTypes {
    'world.progress': { stage: string; pct: number };
    'world.ready': { starts: StartSite[]; summary: WorldSummary };
    'world.started': { site: StartSite; tile: [number, number]; sites: LocalSite[] };
    'world.chunk': ChunkData;
    'world.error': { message: string };
  }
}

export type Box = { west: number; south: number; east: number; north: number };
export type RouteResult = { steps: RouteStep[] | null; partial: boolean };

export class WorkerClient {
  private worker = new Worker(new URL('../worker/game.worker.ts', import.meta.url), { type: 'module' });
  private nextId = 0;
  private waits = new Map<number, (m: FromWorker) => void>();

  constructor(private bus: MessageDispatcher) {
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
  }

  private send(m: ToWorker): void {
    this.worker.postMessage(m);
  }

  private ask<T>(make: (id: number) => ToWorker, take: (m: FromWorker) => T): Promise<T> {
    const id = ++this.nextId;
    return new Promise((res) => {
      this.waits.set(id, (m) => res(take(m)));
      this.send(make(id));
    });
  }

  private receive(m: FromWorker): void {
    if ('id' in m && typeof m.id === 'number' && this.waits.has(m.id)) {
      const w = this.waits.get(m.id)!;
      this.waits.delete(m.id);
      w(m);
      return;
    }
    if (m.type === 'progress') this.bus.send('world.progress', { stage: m.stage, pct: m.pct });
    else if (m.type === 'world') this.bus.send('world.ready', { starts: m.starts, summary: m.summary });
    else if (m.type === 'started') this.bus.send('world.started', { site: m.site, tile: m.tile, sites: m.sites });
    else if (m.type === 'chunk') this.bus.send('world.chunk', m.chunk);
    else if (m.type === 'error') this.bus.send('world.error', { message: m.message });
  }

  makeWorld(settings: WorldSettings): void {
    this.send({ type: 'world', settings: { ...settings } });
  }

  start(siteId: string): void {
    this.send({ type: 'start', id: siteId });
  }

  requestChunk = (cx: number, cy: number): void => {
    this.send({ type: 'chunk', cx, cy });
  };

  requestTile = (z: number, x: number, y: number, layer: ViewLayer): Promise<ImageBitmap | null> =>
    this.ask((id) => ({ type: 'tile', id, z, x, y, layer }), (m) => (m.type === 'tile' ? m.bitmap : null));

  requestRoute = (from: [number, number], to: [number, number]): Promise<RouteResult> =>
    this.ask((id) => ({ type: 'route', id, from, to }), (m) => (m.type === 'route' ? { steps: m.steps, partial: m.partial } : { steps: null, partial: false }));

  requestArea = (box: Box, fine: boolean): Promise<TravelArea> =>
    this.ask((id) => ({ type: 'area', id, ...box, fine }), (m) => (m.type === 'area' ? m.area : { roads: [], places: [] }));

  catalogue(): Promise<Catalogue> {
    return this.ask((id) => ({ type: 'catalogue', id }), (m) => {
      if (m.type !== 'catalogue') throw new Error('The world could not describe its peoples.');
      return m.catalogue;
    });
  }

  /** A settlement's places of note and gates (lon/lat help find a village). */
  site = (siteId: string, at?: { lon: number; lat: number }): Promise<{ site: SiteInfo | null; gates: Gate[] }> =>
    this.ask((id) => ({ type: 'site', id, siteId, lon: at?.lon, lat: at?.lat }), (m) => (m.type === 'site' ? { site: m.site, gates: m.gates } : { site: null, gates: [] }));

  private plans = new Map<string, Promise<PlanImage | null>>();

  /** A settlement's plan as an image (kept once drawn). */
  plan = (siteId: string, o: { mpp: number; radius: number; illustrated: boolean; lon?: number; lat?: number }): Promise<PlanImage | null> => {
    const key = `${siteId}|${o.mpp}|${Math.round(o.radius)}|${o.illustrated}`;
    let p = this.plans.get(key);
    if (!p) {
      p = this.ask((id) => ({ type: 'plan', id, siteId, lon: o.lon, lat: o.lat, mpp: o.mpp, radius: o.radius, illustrated: o.illustrated }), (m) => (m.type === 'plan' ? m.image : null));
      this.plans.set(key, p);
    }
    return p;
  };

  /** Forgets kept plan images (a new world). */
  clearPlans(): void {
    this.plans.clear();
  }

  names(culture: number, seed: string, count = 24): Promise<{ male: PersonName[]; female: PersonName[] }> {
    return this.ask((id) => ({ type: 'names', id, culture, seed, count }), (m) => (m.type === 'names' ? { male: m.male, female: m.female } : { male: [], female: [] }));
  }
}
