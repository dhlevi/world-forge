/**
 * Holds the generated world and makes the local map's chunks (core local/chunk.ts) on request,
 * off the main thread.
 */
import { generateWorld, type GeneratedWorld } from '@worldforge/core/gen/world';
import { LocalWorld } from '@worldforge/core/local/chunk';
import type { Settlement } from '@worldforge/core/gen/settlements';
import { TileRenderer } from '@worldforge/core/render/tiles';
import { TravelGrid } from '@worldforge/core/local/travel';
import { baronyAt } from '@worldforge/core/export/gamedata';
import { CULTURES } from '@worldforge/core/names/cultures';
import { personName } from '@worldforge/core/lore/names';
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import type { FromWorker, StartSite, ToWorker, LocalSite, TravelArea } from './protocol';
import { catalogue, cultureOf, regionAt, resetCatalogue } from './catalogue';
import { findSite, forgetSites, gatesOf, planImage, planOf, rememberSites, siteInfo } from './sites';

let world: GeneratedWorld | null = null;
let local: LocalWorld | null = null;
let tiles: TileRenderer | null = null;
let travel: TravelGrid | null = null;

/** The realm a place lies in: the top of its barony's chain of lieges. */
function realmAt(w: GeneratedWorld, lon: number, lat: number): { name: string; id: number } | undefined {
  let u = w.politics.units[baronyAt(w, lon, lat)];
  for (let guard = 0; u && u.parent >= 0 && guard < 12; guard++) u = w.politics.units[u.parent];
  return u ? { name: u.name, id: u.id } : undefined;
}

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

const startOf = (s: Settlement): StartSite => {
  const realm = world ? realmAt(world, s.lon, s.lat) : undefined;
  const ci = world ? cultureOf(world, s) : s.culture;
  return {
    id: s.id, name: s.name ?? s.id, tier: s.tier, population: s.population, lon: s.lon, lat: s.lat,
    realm: realm?.name, realmId: realm?.id,
    culture: ci !== undefined ? CULTURES[ci]?.name : undefined, cultureIndex: ci,
    coastal: !!s.coastal, university: !!s.university, region: world ? regionAt(world, s.lon, s.lat) : undefined,
  };
};

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  try {
    if (m.type === 'world') {
      const t0 = performance.now();
      local = null;
      tiles = null;
      resetCatalogue();
      forgetSites();
      world = generateWorld(m.settings, (stage, pct) => post({ type: 'progress', stage, pct }));
      tiles = new TileRenderer(world.raster, world.rivers);
      rememberSites(world.settlements);
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
      travel = new TravelGrid(local);
      const tile = local.startTile();
      // Settlements within reach of a long walk, for the location panel.
      const half = 40000;
      const sites: LocalSite[] = local.sitesNear(-half, -half, half, half, 0).map((x) => {
        const p = local!.frame.fromLL(x.lon, x.lat);
        return { id: x.id, name: x.name ?? x.id, tier: x.tier, x: p[0], y: p[1], radiusM: x.radiusM };
      });
      post({ type: 'started', site: startOf(s), tile, sites, ms: performance.now() - t0 });
    } else if (m.type === 'route') {
      if (!local || !travel) throw new Error('No game started.');
      const [tx, ty] = local.tileAt(m.to[0], m.to[1]);
      const CH = 64;
      const r = travel.routeToward(m.from[0], m.from[1], Math.floor(tx / CH), Math.floor(ty / CH));
      let prev = m.from;
      const steps = r ? r.cells.map(([cx, cy]) => {
        const c = travel!.cell(cx, cy);
        const st = { cx, cy, min: travel!.stepMinutes(prev[0], prev[1], cx, cy), way: c.way, ford: c.ford, biome: c.biome, sight: travel!.sightM(cx, cy) };
        prev = [cx, cy];
        return st;
      }) : null;
      post({ type: 'route', id: m.id, steps, minutes: r?.minutes ?? 0, partial: r?.partial ?? false });
    } else if (m.type === 'area') {
      if (!world || !local) throw new Error('No game started.');
      const inBox = (lon: number, lat: number) => lon >= m.west && lon <= m.east && lat >= m.south && lat <= m.north;
      const roads: { cls: string; pts: [number, number][] }[] = [];
      for (const f of world.roads.features) {
        const c = f.geometry.coordinates;
        if (!c.some((p) => inBox(p[0], p[1]))) continue;
        roads.push({ cls: f.properties.cls, pts: c.map((p) => [p[0], p[1]] as [number, number]) });
      }
      const places: TravelArea['places'] = [];
      for (const s of world.settlements) if (inBox(s.lon, s.lat)) places.push({ id: s.id, name: s.name ?? s.id, tier: s.tier, lon: s.lon, lat: s.lat, radiusM: s.radiusM });
      if (m.fine) {
        for (let by = Math.floor(m.south); by <= Math.floor(m.north); by++) for (let bx = Math.floor(m.west); bx <= Math.floor(m.east); bx++) {
          const blk = local.towns.blockAt(bx, by);
          for (const t of blk.tracks) {
            const c = t.geometry.coordinates;
            if (c.some((p) => inBox(p[0], p[1]))) roads.push({ cls: 'track', pts: c.map((p) => [p[0], p[1]] as [number, number]) });
          }
          rememberSites(blk.villages);
          for (const v of blk.villages) if (inBox(v.lon, v.lat)) places.push({ id: v.id, name: v.name ?? '', tier: 'village', lon: v.lon, lat: v.lat, kind: v.kind, radiusM: v.radiusM });
          for (const l of blk.lairs) if (inBox(l.lon, l.lat) && (l.kind === 'cave' || l.kind === 'deep')) places.push({ id: l.id, name: l.en ?? l.name, tier: 'lair', lon: l.lon, lat: l.lat, kind: l.kind });
          for (const d of blk.dungeons) if (!d.town && inBox(d.lon, d.lat)) places.push({ id: d.id, name: d.en ?? d.name, tier: 'lair', lon: d.lon, lat: d.lat, kind: d.kind });
        }
      }
      post({ type: 'area', id: m.id, area: { roads, places } });
    } else if (m.type === 'catalogue') {
      if (!world) throw new Error('No world yet.');
      post({ type: 'catalogue', id: m.id, catalogue: catalogue(world) });
    } else if (m.type === 'names') {
      const r = mulberry32(hashString(`${m.seed}#names#${m.culture}`));
      const male = [], female = [];
      for (let i = 0; i < m.count; i++) {
        male.push(personName(m.culture, false, r));
        female.push(personName(m.culture, true, r));
      }
      post({ type: 'names', id: m.id, male, female });
    } else if (m.type === 'site') {
      if (!local) throw new Error('No game started.');
      const s = findSite(local.towns, m.siteId, m.lon, m.lat);
      if (!s) {
        post({ type: 'site', id: m.id, site: null, gates: [] });
        return;
      }
      const feats = planOf(local.towns, s);
      const ci = cultureOf(world!, s);
      post({ type: 'site', id: m.id, site: { ...siteInfo(s, feats), culture: ci !== undefined ? CULTURES[ci]?.name : undefined }, gates: gatesOf(s, feats) });
    } else if (m.type === 'climate') {
      if (!world) throw new Error('No world yet.');
      const r = world.raster;
      const i = ((Math.floor(((m.lon + 180) / 360) * r.W) % r.W) + r.W) % r.W, j = Math.min(r.H - 1, Math.max(0, Math.floor(((90 - m.lat) / 180) * r.H)));
      post({ type: 'climate', id: m.id, warm: r.tempWarm[j * r.W + i], cold: r.tempCold[j * r.W + i] });
    } else if (m.type === 'plan') {
      if (!local) throw new Error('No game started.');
      const s = findSite(local.towns, m.siteId, m.lon, m.lat);
      if (!s) {
        post({ type: 'plan', id: m.id, image: null });
        return;
      }
      const image = planImage(s, local.towns, { mpp: m.mpp, radius: m.radius, illustrated: m.illustrated });
      post({ type: 'plan', id: m.id, image }, [image.bitmap]);
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
