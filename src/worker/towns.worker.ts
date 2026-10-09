import { TownManager, type Bounds } from '../towns/manager';
import type { TownsRequest, TownsResponse } from './protocol';

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
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(step, 0);
}

self.onmessage = (e: MessageEvent<TownsRequest>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    towns = new TownManager(msg.world);
    gen = msg.gen;
    view = null;
  } else if (msg.gen === gen) {
    view = { bounds: msg.bounds, zoom: msg.zoom };
    schedule();
  }
};
