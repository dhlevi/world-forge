<script setup lang="ts">
import {
  GlobeControl, MapLibreMap, NavigationControl, ScaleControl,
  type GeoJSONSource, type LngLat, type RasterTileSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { store, world } from '../store';
import { probeWorld } from '../world/probe';
import { siteFeatures } from '../towns/manager';
import type { TownsRequest, TownsResponse } from '../worker/protocol';
import {
  MARKER_LAYERS, PLAN_GROUND_LAYERS, RIVER_WIDTH, SETTLEMENT_LAYERS, SETTLEMENT_SOURCES,
} from './map-style';

const container = ref<HTMLDivElement>();
let map: MapLibreMap | null = null;
let ready = false;
let probeFrame = 0;
let townsWorker: Worker | null = null;
let townsGen = -1;

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
  if (townsGen !== world.value.gen) {
    townsGen = world.value.gen;
    const { raster, settlements, roads, rivers } = world.value;
    postTowns({ type: 'init', gen: townsGen, world: { raster, settlements, roads, rivers } });
    const empty = { type: 'FeatureCollection' as const, features: [] };
    (map.getSource('roads') as GeoJSONSource).setData(roads);
    (map.getSource('sites') as GeoJSONSource).setData(siteFeatures(settlements));
    (map.getSource('regional') as GeoJSONSource).setData(empty);
    (map.getSource('plans') as GeoJSONSource).setData(empty);
    runTowns();
  }
}

function postTowns(msg: TownsRequest): void {
  if (!townsWorker) {
    townsWorker = new Worker(new URL('../worker/towns.worker.ts', import.meta.url), { type: 'module' });
    townsWorker.onmessage = (e: MessageEvent<TownsResponse>) => {
      const res = e.data;
      if (!map || res.gen !== townsGen) return;
      if (res.villages) (map.getSource('regional') as GeoJSONSource).setData(res.villages);
      if (res.plans) (map.getSource('plans') as GeoJSONSource).setData(res.plans);
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
  settlements: [...PLAN_GROUND_LAYERS, ...SETTLEMENT_LAYERS, ...MARKER_LAYERS].map((l) => l.id),
};

function setVisibility(overlay: keyof typeof OVERLAY_LAYERS, show: boolean): void {
  if (!map || !ready) return;
  if (overlay === 'rivers' && rasterRivers()) show = false;
  for (const id of OVERLAY_LAYERS[overlay]) map.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none');
}

function scheduleProbe(lngLat: LngLat): void {
  cancelAnimationFrame(probeFrame);
  probeFrame = requestAnimationFrame(() => {
    store.probe = world.value ? probeWorld(world.value.raster, lngLat.lng, lngLat.lat) : null;
  });
}

onMounted(() => {
  map = new MapLibreMap({
    container: container.value!,
    style: {
      version: 8,
      projection: { type: 'globe' },
      sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
      sources: {
        rivers: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        wind: { type: 'geojson', lineMetrics: true, data: { type: 'FeatureCollection', features: [] } },
        currents: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
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
        ...MARKER_LAYERS,
      ],
    },
    center: [0, 20],
    zoom: 1.6,
    maxZoom: 19,
    hash: true,
    attributionControl: false,
  });
  map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
  if (import.meta.env.DEV) (window as unknown as { __map: MapLibreMap }).__map = map;
  map.addControl(new GlobeControl(), 'top-right');
  map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');
  map.on('load', () => {
    ready = true;
    setVisibility('rivers', store.showRivers);
    setVisibility('wind', store.showWind);
    setVisibility('currents', store.showCurrents);
    setVisibility('settlements', store.showSettlements);
    syncWorld();
  });
  map.on('moveend', runTowns);
  map.on('mousemove', (e) => scheduleProbe(e.lngLat));
  map.on('click', (e) => scheduleProbe(e.lngLat));
});

onBeforeUnmount(() => {
  cancelAnimationFrame(probeFrame);
  townsWorker?.terminate();
  townsWorker = null;
  map?.remove();
  map = null;
  ready = false;
});

watch([world, () => store.layer], syncWorld);
watch(() => store.showRivers, syncWorld);
watch(() => store.showWind, (show) => setVisibility('wind', show));
watch(() => store.showCurrents, (show) => setVisibility('currents', show));
watch(() => store.showSettlements, (show) => {
  setVisibility('settlements', show);
  runTowns();
});
</script>

<template>
  <div class="map-view">
    <div ref="container" class="map-canvas" />
    <div v-if="store.probe" class="probe">
      <div class="probe-title">{{ store.probe.terrain }}</div>
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
.probe-title {
  font-weight: 600;
  font-size: 13px;
}
@media (max-width: 768px) {
  .probe {
    top: 10px;
    left: 10px;
    right: auto;
    bottom: auto;
  }
}
</style>
