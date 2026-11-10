/**
 * Holds the generated world and makes the local map's chunks (core local/chunk.ts) on request,
 * off the main thread.
 */
import { generateWorld, type GeneratedWorld } from '@worldforge/core/gen/world';
import { LocalWorld } from '@worldforge/core/local/chunk';
import type { Settlement } from '@worldforge/core/gen/settlements';
import type { FromWorker, StartSite, ToWorker, LocalSite } from './protocol';

let world: GeneratedWorld | null = null;
let local: LocalWorld | null = null;

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

const startOf = (s: Settlement): StartSite => ({ id: s.id, name: s.name ?? s.id, tier: s.tier, population: s.population, lon: s.lon, lat: s.lat });

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  try {
    if (m.type === 'world') {
      const t0 = performance.now();
      local = null;
      world = generateWorld(m.settings, (stage, pct) => post({ type: 'progress', stage, pct }));
      const starts = world.settlements.filter((s) => s.tier !== 'village').sort((a, b) => b.population - a.population).map(startOf);
      post({ type: 'world', ms: performance.now() - t0, starts });
    } else if (m.type === 'start') {
      if (!world) throw new Error('No world yet.');
      const s = world.settlements.find((x) => x.id === m.id);
      if (!s) throw new Error(`No settlement ${m.id}.`);
      const t0 = performance.now();
      post({ type: 'progress', stage: `Laying out ${s.name ?? 'the town'}`, pct: 0.5 });
      local = new LocalWorld(world, s);
      const tile = local.startTile();
      // Settlements within reach of a long walk, for the location panel.
      const half = 40000;
      const sites: LocalSite[] = local.sitesNear(-half, -half, half, half, 0).map((x) => {
        const p = local!.frame.fromLL(x.lon, x.lat);
        return { id: x.id, name: x.name ?? x.id, tier: x.tier, x: p[0], y: p[1], radiusM: x.radiusM };
      });
      post({ type: 'started', site: startOf(s), tile, sites, ms: performance.now() - t0 });
    } else if (m.type === 'chunk') {
      if (!local) throw new Error('No game started.');
      const c = local.chunk(m.cx, m.cy);
      // Copies: the worker keeps its own in its cache.
      const chunk = { ...c, ground: c.ground.slice(), object: c.object.slice(), area: c.area.slice(), elev: c.elev.slice() };
      post({ type: 'chunk', chunk }, [chunk.ground.buffer, chunk.object.buffer, chunk.area.buffer, chunk.elev.buffer]);
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
