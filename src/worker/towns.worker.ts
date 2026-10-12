import { TownManager, type Bounds } from '../towns/manager';
import { setWorldCultures } from '../names/world-cultures';
import type { TownsRequest, TownsResponse } from './protocol';
import type { IndexEntry } from '../towns/manager';

let towns: TownManager | null = null;
let gen = -1;
let view: { bounds: Bounds; zoom: number } | null = null;
let scheduled = false;

function post(msg: TownsResponse): void {
  self.postMessage(msg);
}

/** Works toward the latest view in slices, so a newer view supersedes an older one between slices. */
function step(): void {
  scheduled = false;
  if (!towns || !view) return;
  const res = towns.update(view.bounds, view.zoom, 60);
  if (res.villagesChanged || res.plansChanged) {
    post({
      type: 'data',
      gen,
      villages: res.villagesChanged ? towns.villageFeatures() : null,
      plans: res.plansChanged ? towns.planFeatures() : null,
    });
  }
  if (res.pending) schedule();
  else scheduleIndex();
}

/**
 * The search index runs only while the view needs nothing: a short slice at a time, so a new
 * view is answered between slices. Batches are posted a few times a second.
 */
let indexTimer: ReturnType<typeof setTimeout> | null = null;
let indexDone = false;
let batch: IndexEntry[] = [];
let lastPost = 0;
function scheduleIndex(): void {
  if (indexTimer || indexDone || !towns) return;
  indexTimer = setTimeout(indexSlice, 4);
}
function indexSlice(): void {
  indexTimer = null;
  if (!towns || scheduled) return;
  const b = view?.bounds;
  const center: [number, number] = b ? [(b.west + b.east) / 2, (b.south + b.north) / 2] : [0, 20];
  const r = towns.indexStep(40, center);
  batch.push(...r.entries);
  const finished = r.done >= r.total;
  if (finished || performance.now() - lastPost > 400) {
    self.postMessage({ type: 'index', gen, entries: batch, done: r.done, total: r.total } satisfies TownsResponse);
    batch = [];
    lastPost = performance.now();
  }
  if (finished) indexDone = true;
  else scheduleIndex();
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(step, 0);
}

self.onmessage = (e: MessageEvent<TownsRequest>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    // The world's cultures and languages, rebuilt here for naming villages, plans and lairs.
    if (msg.world.raster.cultures) setWorldCultures(msg.world.raster.cultures);
    towns = new TownManager(msg.world);
    gen = msg.gen;
    view = null;
    indexDone = false;
    batch = [];
    scheduleIndex();
  } else if (msg.gen === gen) {
    view = { bounds: msg.bounds, zoom: msg.zoom };
    schedule();
  }
};
