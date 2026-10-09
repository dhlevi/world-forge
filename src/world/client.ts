import { addProtocol, setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { GeneratedWorld, WorldParams } from '../gen/world';
import type { LayerId } from '../render/tiles';
import type { WorkerRequest, WorkerResponse } from '../worker/protocol';

// MapLibre locates its worker relative to import.meta.url, which breaks under Vite's dep bundling.
// The worker bundle is self-contained, so serve it as a plain asset.
setWorkerUrl(maplibreWorkerUrl);

export interface ClientWorld extends GeneratedWorld {
  gen: number;
}

interface Pending {
  worker: number;
  isTile: boolean;
  resolve: (msg: WorkerResponse) => void;
  reject: (err: Error) => void;
  onProgress?: (stage: string, pct: number) => void;
}

interface QueuedTile {
  id: number;
  msg: WorkerRequest;
  signal: AbortSignal;
  resolve: (bitmap: ImageBitmap) => void;
  reject: (err: Error) => void;
}

const MAX_IN_FLIGHT = 2;

/** MapLibre silently ignores errors named AbortError. */
const abortError = () => new DOMException('Tile request cancelled', 'AbortError');

/**
 * Pool of world workers. Worker 0 generates and then shares the world with the others;
 * every worker renders tiles. Tile requests queue on the main thread so ones MapLibre
 * aborts (e.g. while zooming fast) are dropped before costing any render time.
 */
export class WorldClient {
  private workers: Worker[] = [];
  private inFlight: number[] = [];
  private pending = new Map<number, Pending>();
  private queue: QueuedTile[] = [];
  private nextId = 1;
  private generating = false;
  latestGen = 0;

  constructor(size = Math.min(6, Math.max(2, (navigator.hardwareConcurrency || 4) - 1))) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('../worker/world.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<WorkerResponse>) => this.onMessage(e.data);
      this.workers.push(w);
      this.inFlight.push(0);
    }
  }

  async generate(params: WorldParams, onProgress?: (stage: string, pct: number) => void): Promise<ClientWorld> {
    const gen = ++this.latestGen;
    const id = this.nextId++;
    this.generating = true;
    try {
      const res = await new Promise<WorkerResponse>((resolve, reject) => {
        this.pending.set(id, { worker: 0, isTile: false, resolve, reject, onProgress });
        this.workers[0].postMessage({ type: 'generate', id, gen, params } satisfies WorkerRequest);
      });
      if (res.type !== 'generated') throw new Error('Unexpected worker response');
      for (let i = 1; i < this.workers.length; i++) {
        this.workers[i].postMessage({ type: 'setWorld', gen, raster: res.raster, rivers: res.rivers } satisfies WorkerRequest);
      }
      return {
        gen, raster: res.raster, rivers: res.rivers, wind: res.wind, currents: res.currents,
        settlements: res.settlements, roads: res.roads, labels: res.labels, summary: res.summary,
      };
    } finally {
      if (gen === this.latestGen) this.generating = false;
      this.pump();
    }
  }

  renderTile(gen: number, layer: LayerId, rivers: boolean, z: number, x: number, y: number, signal: AbortSignal): Promise<ImageBitmap> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.queue.push({ id, msg: { type: 'tile', id, gen, layer, rivers, z, x, y }, signal, resolve, reject });
      this.pump();
    });
  }

  /** Registers the `world://` protocol used by the map's raster source. */
  registerProtocol(): void {
    addProtocol('world', async (params, abort) => {
      // world://gen/layer/flags/z/x/y; flags: 'r' draws rivers into the tile, '-' leaves them out.
      const m = /^world:\/\/(\d+)\/(\w+)\/([\w-]+)\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
      if (!m) throw new Error(`Bad world tile URL: ${params.url}`);
      const bitmap = await this.renderTile(+m[1], m[2] as LayerId, m[3].includes('r'), +m[4], +m[5], +m[6], abort.signal);
      // A render that finishes after MapLibre cancelled the request (layer/world switch) must not be shown.
      if (abort.signal.aborted) {
        bitmap.close();
        throw abortError();
      }
      return { data: bitmap };
    });
  }

  private pump(): void {
    while (this.queue.length > 0) {
      let best = -1;
      for (let i = 0; i < this.workers.length; i++) {
        if (i === 0 && this.generating) continue;
        if (this.inFlight[i] < MAX_IN_FLIGHT && (best < 0 || this.inFlight[i] < this.inFlight[best])) best = i;
      }
      if (best < 0) return;
      const job = this.queue.shift()!;
      if (job.signal.aborted) {
        job.reject(abortError());
        continue;
      }
      this.inFlight[best]++;
      this.pending.set(job.id, {
        worker: best,
        isTile: true,
        resolve: (msg) => (msg.type === 'tile' ? job.resolve(msg.bitmap) : job.reject(new Error('Unexpected response'))),
        reject: job.reject,
      });
      this.workers[best].postMessage(job.msg);
    }
  }

  private onMessage(msg: WorkerResponse): void {
    const p = this.pending.get(msg.id);
    if (!p) return;
    if (msg.type === 'progress') {
      p.onProgress?.(msg.stage, msg.pct);
      return;
    }
    this.pending.delete(msg.id);
    if (p.isTile) this.inFlight[p.worker] = Math.max(0, this.inFlight[p.worker] - 1);
    if (msg.type === 'error') p.reject(msg.message === 'stale' ? abortError() : new Error(msg.message));
    else p.resolve(msg);
    this.pump();
  }
}
