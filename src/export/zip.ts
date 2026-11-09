import { zipSync, strToU8 } from 'fflate';
import type { ClientWorld } from '../world/client';
import type { Settlement } from '../gen/settlements';
import type { PlanFeature } from '../towns/plan';
import type { Household } from '../people/residents';
import type { UrlParams } from '../url-params';
import type { ExportRequest, ExportResponse } from '../worker/export.worker';
import { householdsFor, type VillageMarker } from '../people/plan-residents';
import { townContext } from '../components/town-context';
import { type RasterImage, rasterFiles, townJson, worldJson } from './gamedata';
import { gameDataReadme } from './readme';

/**
 * Gathers the game-data export into one zip (see export/gamedata.ts and the README written into
 * it): world.json, the grids as raw files and PNG images, and region.json with the towns of the
 * map view in full. Runs in steps, reporting progress, so the page stays responsive.
 */
export interface ExportOptions {
  /** The area whose towns are exported in full: [west, south, east, north] in degrees. */
  bounds: [number, number, number, number] | null;
  maxTowns: number;
  residents: boolean;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** A PNG of an RGBA grid. */
async function png(im: RasterImage): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = im.width;
  canvas.height = im.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(im.rgba as unknown as Uint8ClampedArray<ArrayBuffer>, im.width, im.height), 0, 0);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG failed'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** The plans of the towns in an area, from a worker of their own. */
function regionPlans(w: ClientWorld, bounds: [number, number, number, number], max: number, onSite: (n: number) => void): Promise<{ site: Settlement; features: PlanFeature[] }[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../worker/export.worker.ts', import.meta.url), { type: 'module' });
    const out: { site: Settlement; features: PlanFeature[] }[] = [];
    let total = 0;
    worker.onmessage = (e: MessageEvent<ExportResponse>) => {
      const m = e.data;
      if (m.type === 'sites') total = m.sites.length;
      else if (m.type === 'plan') {
        out[m.index] = { site: m.site, features: m.features };
        onSite(total ? (m.index + 1) / total : 1);
      } else if (m.type === 'done') {
        worker.terminate();
        resolve(out.filter(Boolean));
      } else {
        worker.terminate();
        reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'The export worker failed.'));
    };
    const { raster, settlements, roads, rivers, politics, labels } = w;
    const [west, south, east, north] = bounds;
    worker.postMessage({ type: 'region', world: { raster, settlements, roads, rivers, politics, labels }, bounds: { west, south, east, north }, max } satisfies ExportRequest);
  });
}

/** The households of every building of a plan (buildings near each other found through a grid). */
async function planHouseholds(w: ClientWorld, s: Settlement, features: PlanFeature[], onPart: (k: number) => void): Promise<Map<string, Household[]>> {
  const bs = features.filter((f) => f.properties.kind === 'building' && f.geometry.type === 'Polygon');
  const cellLat = 0.0012, cellLon = cellLat / Math.max(0.1, Math.cos((s.lat * Math.PI) / 180));
  const grid = new Map<string, PlanFeature[]>();
  const keyOf = (lon: number, lat: number) => `${Math.floor(lon / cellLon)},${Math.floor(lat / cellLat)}`;
  for (const f of bs) {
    const q = (f.geometry as { coordinates: number[][][] }).coordinates[0][0];
    const k = keyOf(q[0], q[1]);
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(f);
  }
  const village: VillageMarker | undefined = s.tier === 'village' ? { lon: s.lon, lat: s.lat, kind: s.kind ?? 'farming', population: s.population, name: s.name ?? '' } : undefined;
  const out = new Map<string, Household[]>();
  let t0 = performance.now();
  for (let i = 0; i < bs.length; i++) {
    const f = bs[i];
    const ring = (f.geometry as { coordinates: number[][][] }).coordinates[0];
    const lon = ring.reduce((a, q) => a + q[0], 0) / ring.length, lat = ring.reduce((a, q) => a + q[1], 0) / ring.length;
    const cx = Math.floor(lon / cellLon), cy = Math.floor(lat / cellLat);
    const near: PlanFeature[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near.push(...(grid.get(`${cx + dx},${cy + dy}`) ?? []));
    try {
      out.set(String(f.properties.bid), householdsFor(w, f, near, village));
    } catch {
      // A building whose people cannot be worked out is exported without them.
    }
    if (performance.now() - t0 > 40) {
      onPart(i / bs.length);
      await tick();
      t0 = performance.now();
    }
  }
  return out;
}

/** The game-data zip for a world. */
export async function exportGameData(w: ClientWorld, params: UrlParams, opts: ExportOptions, progress: (stage: string, pct: number) => void): Promise<Blob> {
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 | 6 }]> = {};
  progress('Writing the world', 0.02);
  await tick();
  files['world.json'] = strToU8(JSON.stringify(worldJson(w, params)));
  progress('Writing the grids', 0.15);
  await tick();
  const rf = rasterFiles(w);
  for (const f of rf.files) files[f.name] = f.data;
  for (let i = 0; i < rf.images.length; i++) {
    progress('Drawing the images', 0.2 + (i / rf.images.length) * 0.1);
    files[rf.images[i].name] = [await png(rf.images[i]), { level: 0 }];
  }
  const towns: Record<string, unknown>[] = [];
  if (opts.bounds && opts.maxTowns > 0) {
    progress('Planning the towns of the view', 0.32);
    const plans = await regionPlans(w, opts.bounds, opts.maxTowns, (k) => progress('Planning the towns of the view', 0.32 + k * 0.2));
    for (let i = 0; i < plans.length; i++) {
      const { site, features } = plans[i];
      const base = 0.52 + (i / Math.max(1, plans.length)) * 0.38;
      progress(`Town ${i + 1} of ${plans.length}: ${site.name ?? site.id}`, base);
      await tick();
      let stats;
      try {
        stats = townContext(w, site.id, site.tier === 'village' ? { lon: site.lon, lat: site.lat, kind: site.kind ?? 'farming', population: site.population, name: site.name ?? '' } : undefined).stats;
      } catch {
        stats = undefined;
      }
      const households = opts.residents ? await planHouseholds(w, site, features, (k) => progress(`Town ${i + 1} of ${plans.length}: ${site.name ?? site.id}, its people`, base + (k * 0.38) / plans.length)) : undefined;
      towns.push(townJson(w, site, features, { stats, households }));
    }
  }
  const [west, south, east, north] = opts.bounds ?? [0, 0, 0, 0];
  files['region.json'] = strToU8(JSON.stringify({ format: 'world-forge.region', bounds: opts.bounds ? { west, south, east, north } : null, residents: opts.residents, towns }));
  files['README.md'] = strToU8(gameDataReadme(rf.meta, towns.length));
  progress('Packing the zip', 0.93);
  await tick();
  const zipped = zipSync(files, { level: 6 });
  progress('Done', 1);
  return new Blob([zipped as unknown as BlobPart], { type: 'application/zip' });
}
