<script setup lang="ts">
import {
  GlobeControl, MapLibreMap, NavigationControl, ScaleControl,
  type GeoJSONSource, type ImageSource, type LngLat, type MapMouseEvent, type PointLike, type RasterTileSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { flyTarget, openBuilding, openDungeon, openLair, search, searchState, store, world } from '../store';
import { blockEntry, planEntries, worldEntries } from '../search/index';
import { INTERIOR_ZOOM, buildingView, previewImage } from '../interiors/building';
import type { PlanFeature } from '../towns/plan';
import { probeWorld } from '../world/probe';
import { siteFeatures } from '../towns/manager';
import { LAYOUT_LABEL } from '../towns/layout';
import type { TownsRequest, TownsResponse } from '../worker/protocol';
import {
  BORDER_LAYERS, LAIR_LAYERS, MARKER_LAYERS, PLAN_GROUND_LAYERS, RIVER_WIDTH, SETTLEMENT_LAYERS, SETTLEMENT_SOURCES, lairIcons,
} from './map-style';
import type { LairSite } from '../lairs/lair';
import { armsImageData } from '../heraldry/draw';
import { KIND_LABEL, lairFromFeature, lairMap, lairOverlay, lairTags, lairThumb, onLair } from '../lairs/view';
import type { DungeonSite } from '../dungeons/core';
import { KIND_NAME, dungeon, dungeonFromFeature, dungeonTags, dungeonThumb } from '../dungeons/view';
import { PLAN_LABEL_LAYERS, SETTLEMENT_LABEL_LAYERS, WORLD_LABEL_LAYERS, fontFaces } from './label-style';

const container = ref<HTMLDivElement>();
let map: MapLibreMap | null = null;
let ready = false;
let probeFrame = 0;
let townsWorker: Worker | null = null;
let townsGen = -1;
/** Plan buildings by id, from the latest plans the towns worker sent. */
let planIndex = new Map<string, PlanFeature>();
let hoverBid: string | null = null;
let hoverFrame = 0;
const touchOnly = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
/** The cave or glade being previewed: as a card by the cursor, or laid over the ground when close in. */
let hoverLair: LairSite | null = null;
let hoverDungeon: DungeonSite | null = null;
const lairCard = ref<{ x: number; y: number; name: string; sub: string; img: string } | null>(null);
/** On-screen width (px) from which a cave or glade is laid over the ground instead of carded. */
const LAIR_OVERLAY_PX = 170;

/** Layers whose tiles draw (and clip) the rivers themselves; the others use the vector river layer. */
const RASTER_RIVER_LAYERS = new Set(['fantasy', 'terrain']);
const rasterRivers = () => RASTER_RIVER_LAYERS.has(store.layer);
const tileUrl = () => `world://${world.value?.gen ?? 0}/${store.layer}/${store.showRivers ? 'r' : '-'}/{z}/{x}/{y}`;

function syncWorld(): void {
  if (!map || !ready || !world.value) return;
  const raster = map.getSource('world') as RasterTileSource | undefined;
  if (!raster) {
    map.addSource('world', { type: 'raster', tiles: [tileUrl()], tileSize: 256, maxzoom: 17 });
    map.addLayer(
      { id: 'world', type: 'raster', source: 'world', paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear' } },
      PLAN_GROUND_LAYERS[0].id,
    );
  } else {
    raster.setTiles([tileUrl()]);
  }
  setVisibility('rivers', store.showRivers);
  (map.getSource('rivers') as GeoJSONSource).setData(world.value.rivers);
  (map.getSource('wind') as GeoJSONSource).setData(world.value.wind);
  (map.getSource('currents') as GeoJSONSource).setData(world.value.currents);
  registerArms();
  (map.getSource('labels') as GeoJSONSource).setData(world.value.labels);
  (map.getSource('borders') as GeoJSONSource).setData(world.value.politics.borders);
  if (townsGen !== world.value.gen) {
    townsGen = world.value.gen;
    const { raster, settlements, roads, rivers } = world.value;
    postTowns({ type: 'init', gen: townsGen, world: { raster, settlements, roads, rivers } });
    const empty = { type: 'FeatureCollection' as const, features: [] };
    (map.getSource('roads') as GeoJSONSource).setData(roads);
    (map.getSource('sites') as GeoJSONSource).setData(siteFeatures(settlements));
    (map.getSource('regional') as GeoJSONSource).setData(empty);
    (map.getSource('plans') as GeoJSONSource).setData(empty);
    planIndex = new Map();
    hidePreview();
    hideLair();
    search.clear();
    search.add(worldEntries(world.value));
    searchState.done = 0;
    searchState.total = 0;
    searchState.version++;
    runTowns();
  }
}

/** Map images of the arms of every kingdom and empire (`arms-<unit>`), for their labels. */
let armsIds: string[] = [];
let armsGen = -1;
function registerArms(): void {
  if (!map || !world.value || armsGen === world.value.gen) return;
  armsGen = world.value.gen;
  for (const id of armsIds) if (map.hasImage(id)) map.removeImage(id);
  armsIds = [];
  for (const u of world.value.politics.units) {
    if (u.level < 2) continue;
    const id = `arms-${u.id}`;
    map.addImage(id, armsImageData(u.arms, u.level === 3 ? 30 : 24), { pixelRatio: 2 });
    armsIds.push(id);
  }
}

function postTowns(msg: TownsRequest): void {
  if (!townsWorker) {
    townsWorker = new Worker(new URL('../worker/towns.worker.ts', import.meta.url), { type: 'module' });
    townsWorker.onmessage = (e: MessageEvent<TownsResponse>) => {
      const res = e.data;
      if (!map || res.gen !== townsGen) return;
      if (res.type === 'index') {
        search.add(res.entries.map(blockEntry));
        searchState.done = res.done;
        searchState.total = res.total;
        searchState.version++;
        return;
      }
      if (res.villages) (map.getSource('regional') as GeoJSONSource).setData(res.villages);
      if (res.plans) {
        (map.getSource('plans') as GeoJSONSource).setData(res.plans);
        planIndex = new Map();
        for (const f of res.plans.features) if (f.properties.kind === 'building') planIndex.set(String(f.properties.bid), f);
        // Quarters, districts and notable buildings of drawn plans become searchable.
        search.add(planEntries(res.plans.features));
        searchState.version++;
      }
    };
  }
  townsWorker.postMessage(msg);
}

/** Asks the towns worker for the villages and plans the current view needs. */
function runTowns(): void {
  if (!map || !ready || townsGen < 0 || !store.showSettlements) return;
  const b = map.getBounds();
  postTowns({
    type: 'view', gen: townsGen, zoom: map.getZoom(),
    bounds: { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
  });
}

const OVERLAY_LAYERS = {
  rivers: ['rivers'],
  wind: ['wind-lines', 'wind-heads'],
  currents: ['current-lines', 'current-heads'],
  settlements: [...PLAN_GROUND_LAYERS, ...SETTLEMENT_LAYERS, ...MARKER_LAYERS, ...LAIR_LAYERS].map((l) => l.id),
  labels: [...WORLD_LABEL_LAYERS, ...SETTLEMENT_LABEL_LAYERS, ...PLAN_LABEL_LAYERS].map((l) => l.id),
  borders: BORDER_LAYERS.map((l) => l.id),
};

function setVisibility(overlay: keyof typeof OVERLAY_LAYERS, show: boolean): void {
  if (!map || !ready) return;
  if (overlay === 'rivers' && rasterRivers()) show = false;
  for (const id of OVERLAY_LAYERS[overlay]) {
    let vis = show;
    // Name layers also follow the overlay they belong to.
    if (overlay === 'labels') {
      if (id.startsWith('lbl-river')) vis = show && store.showRivers;
      else if (id === 'lbl-road' || SETTLEMENT_LABEL_LAYERS.some((l) => l.id === id) || PLAN_LABEL_LAYERS.some((l) => l.id === id)) vis = show && store.showSettlements;
    }
    map.setLayoutProperty(id, 'visibility', vis ? 'visible' : 'none');
  }
}

/** The plan building under a screen point, at interior zooms. */
function buildingAt(point: PointLike): PlanFeature | null {
  if (!map || !ready || map.getZoom() < INTERIOR_ZOOM || !store.showSettlements || !map.getLayer('plan-buildings')) return null;
  const hit = map.queryRenderedFeatures(point, { layers: ['plan-buildings'] })[0];
  const bid = hit?.properties?.bid;
  return bid ? planIndex.get(String(bid)) ?? null : null;
}

/** Draws a building's ground floor over its footprint on the map. */
function showPreview(f: PlanFeature | null): void {
  if (!map || !world.value) return;
  if (!f) {
    hidePreview();
    return;
  }
  const bid = String(f.properties.bid);
  if (bid === hoverBid) return;
  const v = buildingView(f, world.value.raster.seed);
  if (!v) return;
  hoverBid = bid;
  const img = previewImage(v);
  const src = map.getSource('interior') as ImageSource | undefined;
  if (!src) {
    map.addSource('interior', { type: 'image', url: img.url, coordinates: img.coordinates });
    map.addLayer(
      { id: 'interior-preview', type: 'raster', source: 'interior', paint: { 'raster-fade-duration': 0, 'raster-opacity': 0.97 } },
      'plan-walls',
    );
  } else {
    src.updateImage({ url: img.url, coordinates: img.coordinates });
    map.setLayoutProperty('interior-preview', 'visibility', 'visible');
  }
}

function hidePreview(): void {
  hoverBid = null;
  if (map?.getLayer('interior-preview')) map.setLayoutProperty('interior-preview', 'visibility', 'none');
}

function openInterior(f: PlanFeature): void {
  if (!world.value) return;
  const v = buildingView(f, world.value.raster.seed);
  if (v) openBuilding.value = v;
}

function onHover(e: MapMouseEvent): void {
  cancelAnimationFrame(hoverFrame);
  hoverFrame = requestAnimationFrame(() => {
    const f = buildingAt(e.point);
    const l = f ? null : lairAt(e.point, e.lngLat);
    const dn = f || l ? null : dungeonAt(e.point);
    if (map) map.getCanvas().style.cursor = f || l || dn ? 'pointer' : '';
    showPreview(f);
    showLair(l, e.point);
    if (!l) showDungeon(dn, e.point);
  });
}

/** The cave or glade under a screen point: its icon or name, or (when laid over the ground) its map. */
function lairAt(point: { x: number; y: number }, ll?: LngLat): LairSite | null {
  if (!map || !ready || !store.showSettlements || !map.getLayer('lair-icons')) return null;
  const pad = touchOnly ? 14 : 6;
  const hit = map.queryRenderedFeatures([[point.x - pad, point.y - pad], [point.x + pad, point.y + pad]], { layers: ['lair-icons', 'lbl-lair'] })[0];
  if (hit && hit.geometry.type === 'Point') return lairFromFeature(hit.properties ?? {}, hit.geometry.coordinates);
  // Keep a laid-over map while the cursor is on it.
  if (hoverLair && ll && lairOverlaid(hoverLair) && onLair(lairMap(hoverLair), ll.lng, ll.lat)) return hoverLair;
  return null;
}

/** The tower, crypt, ruin or mine (icon or name), or the sewer or catacomb entrance on a town plan, under a point. */
function dungeonAt(point: { x: number; y: number }): DungeonSite | null {
  if (!map || !ready || !store.showSettlements) return null;
  const layers = ['lair-icons', 'lbl-lair', 'dentry-icons', 'lbl-dentry'].filter((id) => map!.getLayer(id));
  if (!layers.length) return null;
  const pad = touchOnly ? 14 : 6;
  for (const hit of map.queryRenderedFeatures([[point.x - pad, point.y - pad], [point.x + pad, point.y + pad]], { layers })) {
    if (hit.geometry.type !== 'Point') continue;
    const d = dungeonFromFeature(hit.properties ?? {}, hit.geometry.coordinates);
    if (d) return d;
  }
  return null;
}

function showDungeon(d: DungeonSite | null, point: { x: number; y: number }): void {
  if (!map) return;
  if (!d) {
    if (hoverDungeon) lairCard.value = null;
    hoverDungeon = null;
    return;
  }
  const w = map.getContainer().clientWidth;
  const tags = dungeonTags(d);
  lairCard.value = {
    x: Math.min(point.x + 18, w - 250), y: Math.max(8, point.y - 110),
    name: d.name.charAt(0).toUpperCase() + d.name.slice(1), sub: `${KIND_NAME[d.kind]}${tags ? ` · ${tags}` : ''}`, img: dungeonThumb(dungeon(d)),
  };
  hoverDungeon = d;
}

/** Is the site big enough on screen to lay its map over the ground? */
function lairOverlaid(l: LairSite): boolean {
  if (!map) return false;
  const m = lairMap(l);
  const pxPerM = (512 * 2 ** map.getZoom()) / (40075016.686 * Math.cos((l.lat * Math.PI) / 180));
  return m.W * pxPerM >= LAIR_OVERLAY_PX;
}

function showLair(l: LairSite | null, point: { x: number; y: number }): void {
  if (!map) return;
  if (!l) {
    hideLair();
    return;
  }
  const m = lairMap(l);
  if (lairOverlaid(l)) {
    lairCard.value = null;
    if (hoverLair?.id === l.id && map.getLayer('lair-preview') && map.getLayoutProperty('lair-preview', 'visibility') !== 'none') return;
    const img = lairOverlay(m);
    const src = map.getSource('lair') as ImageSource | undefined;
    if (!src) {
      map.addSource('lair', { type: 'image', url: img.url, coordinates: img.coordinates });
      map.addLayer({ id: 'lair-preview', type: 'raster', source: 'lair', paint: { 'raster-fade-duration': 0, 'raster-opacity': 0.96 } }, 'lair-icons');
    } else {
      src.updateImage({ url: img.url, coordinates: img.coordinates });
      map.setLayoutProperty('lair-preview', 'visibility', 'visible');
    }
  } else {
    if (map.getLayer('lair-preview')) map.setLayoutProperty('lair-preview', 'visibility', 'none');
    const w = map.getContainer().clientWidth;
    lairCard.value = {
      x: Math.min(point.x + 18, w - 250), y: Math.max(8, point.y - 110),
      name: l.name, sub: `${KIND_LABEL[l.kind]} · ${lairTags(l)}`, img: lairThumb(m),
    };
  }
  hoverLair = l;
}

function hideLair(): void {
  hoverLair = null;
  lairCard.value = null;
  if (map?.getLayer('lair-preview')) map.setLayoutProperty('lair-preview', 'visibility', 'none');
}

/** The village nearest the map centre, within ~1.5 km, at close zoom (for the location title). */
function villageHere(): typeof store.here {
  if (!map || map.getZoom() < 11.5 || !map.getSource('regional')) return null;
  const c = map.getCenter();
  let best: typeof store.here = null, bd = 1.5;
  for (const f of map.querySourceFeatures('regional', { filter: ['==', ['get', 'tier'], 'village'] })) {
    if (f.geometry.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates;
    const d = Math.hypot((lon - c.lng) * 111.32 * Math.cos((c.lat * Math.PI) / 180), (lat - c.lat) * 110.57);
    if (d < bd) {
      bd = d;
      best = { name: String(f.properties.name ?? ''), kind: String(f.properties.kind ?? 'farming'), population: Number(f.properties.population ?? 0) };
    }
  }
  return best;
}

/** "Anterina · city of 12,400 · planned grid" for the town or city whose plan is under the cursor. */
function placeAt(lon: number, lat: number): string | undefined {
  const sts = world.value?.settlements ?? [];
  const kLon = Math.cos((lat * Math.PI) / 180) * 111320;
  for (const s of sts) {
    if (s.tier === 'village') continue;
    const dx = (((s.lon - lon + 540) % 360) - 180) * kLon, dy = (s.lat - lat) * 110540;
    if (dx * dx + dy * dy > s.radiusM * s.radiusM) continue;
    const layout = s.layout ? ` · ${LAYOUT_LABEL[s.layout]}` : '';
    return `${s.name ?? ''} · ${s.tier} of ${s.population.toLocaleString('en')}${layout}`;
  }
  return undefined;
}

function scheduleProbe(lngLat: LngLat): void {
  cancelAnimationFrame(probeFrame);
  probeFrame = requestAnimationFrame(() => {
    const info = world.value ? probeWorld(world.value.raster, lngLat.lng, lngLat.lat) : null;
    if (info && world.value) info.place = placeAt(lngLat.lng, lngLat.lat);
    store.probe = info;
  });
}

onMounted(() => {
  map = new MapLibreMap({
    container: container.value!,
    style: {
      version: 8,
      projection: { type: 'globe' },
      'font-faces': fontFaces(document.baseURI),
      sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
      sources: {
        rivers: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        wind: { type: 'geojson', lineMetrics: true, data: { type: 'FeatureCollection', features: [] } },
        currents: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        labels: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        'search-hit': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        borders: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        ...SETTLEMENT_SOURCES,
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#0b1626' } },
        ...PLAN_GROUND_LAYERS,
        {
          id: 'rivers',
          type: 'line',
          source: 'rivers',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#2f6e9e',
            'line-width': RIVER_WIDTH,
            'line-opacity': [
              'interpolate', ['linear'], ['zoom'],
              1, ['case', ['>=', ['get', 'order'], 4], 0.9, 0],
              3, ['case', ['>=', ['get', 'order'], 2], 0.9, 0],
              5, 0.9,
            ],
          },
        },
        ...SETTLEMENT_LAYERS,
        {
          id: 'current-lines',
          type: 'line',
          source: 'currents',
          filter: ['==', ['get', 'kind'], 'line'],
          layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
          paint: {
            // Warm currents red, cold blue, by mean temperature anomaly (°C).
            'line-color': ['interpolate', ['linear'], ['get', 'value'], -2.5, '#3d8bff', -0.3, '#cfe3f0', 0.3, '#f0ddd0', 2, '#ff5533'],
            'line-width': ['interpolate', ['linear'], ['zoom'], 1, ['+', 0.6, ['get', 'speed']], 5, ['+', 1.5, ['*', 2, ['get', 'speed']]]],
            'line-opacity': 0.9,
          },
        },
        {
          id: 'current-heads',
          type: 'line',
          source: 'currents',
          filter: ['==', ['get', 'kind'], 'head'],
          layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
          paint: {
            'line-color': ['interpolate', ['linear'], ['get', 'value'], -2.5, '#3d8bff', -0.3, '#cfe3f0', 0.3, '#f0ddd0', 2, '#ff5533'],
            'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1.2, 5, 2.5],
            'line-opacity': 0.9,
          },
        },
        {
          id: 'wind-lines',
          type: 'line',
          source: 'wind',
          filter: ['==', ['get', 'kind'], 'line'],
          layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
          paint: {
            'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1, 5, 2.5],
            'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(255,255,255,0)', 1, 'rgba(255,255,255,0.85)'],
          },
        },
        {
          id: 'wind-heads',
          type: 'line',
          source: 'wind',
          filter: ['==', ['get', 'kind'], 'head'],
          layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
          paint: {
            'line-color': 'rgba(255,255,255,0.85)',
            'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1, 5, 2.5],
          },
        },
        ...BORDER_LAYERS,
        ...MARKER_LAYERS,
        ...LAIR_LAYERS,
        // The place chosen in search: a ring that pulses for a few seconds.
        {
          id: 'search-hit', type: 'circle', source: 'search-hit',
          paint: {
            'circle-radius': ['get', 'r'], 'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-color': '#a8321e', 'circle-stroke-width': 2.5, 'circle-stroke-opacity': ['get', 'a'],
          },
        },
        ...PLAN_LABEL_LAYERS,
        ...WORLD_LABEL_LAYERS,
        ...SETTLEMENT_LABEL_LAYERS,
      ],
    },
    center: [0, 20],
    zoom: 1.6,
    maxZoom: 20,
    hash: true,
    attributionControl: false,
  });
  map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
  if (import.meta.env.DEV) (window as unknown as { __map: MapLibreMap }).__map = map;
  map.addControl(new GlobeControl(), 'top-right');
  map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');
  map.on('load', () => {
    ready = true;
    if (map) store.center = [map.getCenter().lng, map.getCenter().lat];
    // Cave and glade icons are drawn on a canvas, not fetched.
    for (const icon of lairIcons()) if (map && !map.hasImage(icon.id)) map.addImage(icon.id, icon.image, { pixelRatio: icon.pixelRatio });
    setVisibility('rivers', store.showRivers);
    setVisibility('wind', store.showWind);
    setVisibility('currents', store.showCurrents);
    setVisibility('settlements', store.showSettlements);
    setVisibility('labels', store.showLabels);
    setVisibility('borders', store.showBorders);
    syncWorld();
  });
  map.on('moveend', () => {
    runTowns();
    if (map) {
      const c = map.getCenter();
      store.center = [c.lng, c.lat];
      store.zoom = map.getZoom();
      store.here = villageHere();
    }
  });
  map.on('mousemove', (e) => {
    scheduleProbe(e.lngLat);
    onHover(e);
  });
  map.on('click', (e) => {
    scheduleProbe(e.lngLat);
    // Touch: the first tap on a building, cave or glade previews it, a second tap opens it.
    const f = buildingAt(e.point);
    if (f && touchOnly && String(f.properties.bid) === hoverBid) openInterior(f);
    else showPreview(f);
    const l = f ? null : lairAt(e.point, e.lngLat);
    if (l && touchOnly && hoverLair?.id === l.id) {
      openLair.value = l;
      hideLair();
    } else if (touchOnly) showLair(l, e.point);
    const dn = f || l ? null : dungeonAt(e.point);
    if (dn && touchOnly && hoverDungeon?.id === dn.id) {
      openDungeon.value = dn;
      showDungeon(null, e.point);
    } else if (touchOnly && !l) showDungeon(dn, e.point);
  });
  // Double-click a building to go inside, or a cave or glade to open its map (instead of zooming).
  map.on('dblclick', (e) => {
    const f = buildingAt(e.point);
    if (f) {
      e.preventDefault();
      openInterior(f);
      return;
    }
    const l = lairAt(e.point, e.lngLat);
    if (l) {
      e.preventDefault();
      openLair.value = l;
      hideLair();
      return;
    }
    const dn = dungeonAt(e.point);
    if (!dn) return;
    e.preventDefault();
    openDungeon.value = dn;
    showDungeon(null, e.point);
  });
  map.on('mouseout', () => (lairCard.value = null));
  map.on('movestart', () => (lairCard.value = null));
  map.on('zoomend', () => {
    if (map && map.getZoom() < INTERIOR_ZOOM) hidePreview();
  });
});

// Fly to a place chosen in search and ring it.
let hitFrame = 0;
watch(flyTarget, (t) => {
  if (!map || !t) return;
  map.flyTo({ center: [t.lon, t.lat], zoom: t.zoom, duration: 2200, essential: true });
  const src = map.getSource('search-hit') as GeoJSONSource | undefined;
  if (!src) return;
  cancelAnimationFrame(hitFrame);
  const t0 = performance.now();
  const tick = () => {
    const k = (performance.now() - t0) / 1000;
    const done = k > 6.5;
    // Pulses after the flight lands, fading out.
    const ph = Math.max(0, k - 2) % 1.1 / 1.1;
    const a = done ? 0 : k < 2 ? 0.9 : 0.9 * (1 - ph) * Math.min(1, (6.5 - k) / 1.5);
    src.setData({ type: 'FeatureCollection', features: done ? [] : [{ type: 'Feature', geometry: { type: 'Point', coordinates: [t.lon, t.lat] }, properties: { r: 10 + 26 * ph, a } }] });
    if (!done) hitFrame = requestAnimationFrame(tick);
  };
  tick();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(probeFrame);
  cancelAnimationFrame(hoverFrame);
  townsWorker?.terminate();
  townsWorker = null;
  map?.remove();
  map = null;
  ready = false;
});

watch([world, () => store.layer], syncWorld);
watch(() => store.showRivers, () => {
  syncWorld();
  setVisibility('labels', store.showLabels);
});
watch(() => store.showWind, (show) => setVisibility('wind', show));
watch(() => store.showCurrents, (show) => setVisibility('currents', show));
watch(() => store.showLabels, (show) => setVisibility('labels', show));
watch(() => store.showBorders, (show) => setVisibility('borders', show));
watch(() => store.showSettlements, (show) => {
  setVisibility('settlements', show);
  setVisibility('labels', store.showLabels);
  if (!show) hidePreview();
  runTowns();
});
</script>

<template>
  <div class="map-view">
    <div ref="container" class="map-canvas" />
    <div v-if="lairCard" class="lair-card" :style="{ left: `${lairCard.x}px`, top: `${lairCard.y}px` }">
      <div class="lair-name">{{ lairCard.name }}</div>
      <div class="lair-sub">{{ lairCard.sub }}</div>
      <img :src="lairCard.img" alt="" width="220" height="160" />
      <div class="lair-hint">{{ touchOnly ? 'Tap again to open' : 'Double-click to open' }}</div>
    </div>
    <div v-if="store.probe" class="probe">
      <div class="probe-title">{{ store.probe.terrain }}</div>
      <div v-if="store.probe.place" class="probe-place">{{ store.probe.place }}</div>
      <div v-if="store.probe.climate">{{ store.probe.climate }}</div>
      <div>{{ store.probe.lat.toFixed(2) }}°, {{ store.probe.lon.toFixed(2) }}°</div>
      <div>Elevation {{ Math.round(store.probe.elevation) }} m</div>
      <div>Temperature {{ store.probe.temperature.toFixed(1) }} °C</div>
      <div>
        Warmest month {{ store.probe.tempWarm.toFixed(0) }} °C · coldest {{ store.probe.tempCold.toFixed(0) }} °C
      </div>
      <div>
        Precipitation {{ Math.round(store.probe.precipitation) }} mm/yr
        ({{ Math.round(store.probe.summerRainShare * 100) }}% in summer)
      </div>
      <div>Wind {{ store.probe.wind }}</div>
      <div v-if="store.probe.current">Current {{ store.probe.current }}</div>
      <div>Plate {{ store.probe.plate + 1 }}</div>
    </div>
  </div>
</template>

<style scoped>
.map-view {
  position: absolute;
  inset: 0;
}
.map-canvas {
  position: absolute;
  inset: 0;
}
.probe {
  position: absolute;
  right: 10px;
  bottom: 36px;
  padding: 8px 12px;
  background: rgba(16, 22, 32, 0.82);
  color: #dfe6ee;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  pointer-events: none;
  min-width: 170px;
}
.lair-card {
  position: absolute;
  z-index: 5;
  width: 232px;
  padding: 8px 6px 6px;
  background: #f3ead3;
  color: #2b2420;
  border: 1px solid #2b2420;
  border-radius: 4px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  font-family: 'IM Fell English', Georgia, serif;
  pointer-events: none;
}
.lair-name {
  font-style: italic;
  font-size: 16px;
  padding: 0 4px;
}
.lair-sub,
.lair-hint {
  font-size: 12px;
  opacity: 0.75;
  padding: 0 4px 4px;
}
.lair-hint {
  padding: 4px 4px 0;
}
.lair-card img {
  display: block;
  border: 1px solid rgba(43, 36, 32, 0.35);
}
.probe-place {
  font-style: italic;
}
.probe-title {
  font-weight: 600;
  font-size: 13px;
}
@media (max-width: 768px) {
  .probe {
    /* Below the search button. */
    top: 62px;
    left: 10px;
    right: auto;
    bottom: auto;
  }
}
</style>
