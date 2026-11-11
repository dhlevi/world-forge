/**
 * Holds the generated world and makes the local map's chunks (core local/chunk.ts) on request,
 * off the main thread.
 */
import { generateWorld, type GeneratedWorld } from '@worldforge/core/gen/world';
import { LocalWorld } from '@worldforge/core/local/chunk';
import type { Settlement } from '@worldforge/core/gen/settlements';
import { TileRenderer } from '@worldforge/core/render/tiles';
import { baronyAt } from '@worldforge/core/export/gamedata';
import { CULTURES } from '@worldforge/core/names/cultures';
import type { FromWorker, StartSite, ToWorker, LocalSite } from './protocol';

let world: GeneratedWorld | null = null;
let local: LocalWorld | null = null;
let tiles: TileRenderer | null = null;

/** The realm a place lies in: the top of its barony's chain of lieges. */
function realmAt(w: GeneratedWorld, lon: number, lat: number): string | undefined {
  let u = w.politics.units[baronyAt(w, lon, lat)];
  for (let guard = 0; u && u.parent >= 0 && guard < 12; guard++) u = w.politics.units[u.parent];
  return u?.name;
}

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

const startOf = (s: Settlement): StartSite => ({
  id: s.id, name: s.name ?? s.id, tier: s.tier, population: s.population, lon: s.lon, lat: s.lat,
  realm: world ? realmAt(world, s.lon, s.lat) : undefined,
  culture: s.culture !== undefined ? CULTURES[s.culture]?.name : undefined,
});

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  try {
    if (m.type === 'world') {
      const t0 = performance.now();
      local = null;
      tiles = null;
      world = generateWorld(m.settings, (stage, pct) => post({ type: 'progress', stage, pct }));
      tiles = new TileRenderer(world.raster, world.rivers);
      const starts = world.settlements.filter((s) => s.tier !== 'village').sort((a, b) => b.population - a.population).map(startOf);
      const summary = {
        cities: starts.filter((s) => s.tier === 'city').length,
        towns: starts.filter((s) => s.tier === 'town').length,
        realms: world.politics.units.filter((u) => u.parent < 0).length,
        ms: performance.now() - t0,
      };
      post({ type: 'world', ms: summary.ms, starts, summary });
    } else if (m.type === 'tile') {
      if (!tiles) {
        post({ type: 'tile', id: m.id, bitmap: null });
        return;
      }
      const px = tiles.renderTile(m.z, m.x, m.y, m.layer, 256);
      void createImageBitmap(new ImageData(new Uint8ClampedArray(px.buffer as ArrayBuffer, px.byteOffset, px.length), 256, 256)).then((bitmap) => post({ type: 'tile', id: m.id, bitmap }, [bitmap]));
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
