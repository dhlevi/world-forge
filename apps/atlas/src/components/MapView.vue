<script setup lang="ts">
import {
  GlobeControl, MapLibreMap, NavigationControl, ScaleControl,
  type FilterSpecification, type GeoJSONSource, type ImageSource, type LngLat, type MapMouseEvent, type PointLike, type RasterTileSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import IllusFrame from './IllusFrame.vue';
import { type CartoucheSite, Cartouches } from './cartouche';
import { townArms } from './town-arms';
import type { Household } from '@worldforge/core/people/residents';
import { householdsFor } from '@worldforge/core/people/plan-residents';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { savePref, faithLegend, flyTarget, groupLegend, openCulture, openDeepRealm, openFaith, openBuilding, openDungeon, openLair, openRealm, search, searchState, store, world } from '../store';
import { blockEntry, faithEntries, orderEntries, planEntries, themeEntries, worldEntries } from '../search/index';
import { currentOrders } from './orders';
import { ORDER_KIND_LABEL } from '@worldforge/core/lore/orders';
import { THEME_LABEL, worldThemes } from '@worldforge/core/lore/themes';
import { INTERIOR_ZOOM, buildingView } from '@worldforge/core/interiors/building';
import { previewImage } from '../interiors/preview';
import type { PlanFeature } from '@worldforge/core/towns/plan';
import { probeWorld } from '@worldforge/core/world/probe';
import { TOWN_PLAN_ZOOM, siteFeatures } from '@worldforge/core/towns/manager';
import { LAYOUT_LABEL } from '@worldforge/core/towns/layout';
import type { TownsRequest, TownsResponse } from '../worker/protocol';
import {
  BORDER_LAYERS, LAIR_LAYERS, MARKER_LAYERS, PLAN_GROUND_LAYERS, RIVER_WIDTH, SETTLEMENT_LAYERS, SETTLEMENT_SOURCES, lairIcons, specialIcons,
  ILL_ZOOM, ILLUSTRATED_LAYERS, PLAIN_ONLY_LAYERS,
} from './map-style';
import type { LairSite } from '@worldforge/core/lairs/lair';
import { armsImageData } from '../heraldry/draw';
import { KIND_LABEL, lairFromFeature, lairMap, lairOverlay, lairTags, lairThumb, onLair } from '../lairs/view';
import type { DungeonSite } from '@worldforge/core/dungeons/core';
import { KIND_NAME, dungeon, dungeonFromFeature, dungeonTags, dungeonThumb } from '../dungeons/view';
import { ITALIC, PLAN_LABEL_LAYERS, POLITICAL_LABEL_LAYERS, SETTLEMENT_LABEL_LAYERS, SPECIAL_LINE_LAYERS, WORLD_LABEL_LAYERS, fontFaces, textField } from './label-style';
import { type GroupKey, prepareFaithMap, prepareGroupMap, preparePolitical, registerPoliticalProtocol, setRelations } from '../world/political';
import { CULTURES } from '@worldforge/core/names/cultures';
import { templateFolk } from '@worldforge/core/names/bundles/index';
import { relationsForMap } from '@worldforge/core/lore/realm';
import { currentLore } from './realm-lore';
import { UNDER_LAYERS, UNDER_SOURCES, deepSite, underFeatures } from './under-style';

const container = ref<HTMLDivElement>();
let map: MapLibreMap | null = null;
let ready = false;
let probeFrame = 0;
let townsWorker: Worker | null = null;
let townsGen = -1;
/** Plan buildings by id, from the latest plans the towns worker sent. */
let planIndex = new Map<string, PlanFeature>();
let hoverBid: string | null = null;
/** The villages the towns worker sent last (for their title cartouches). */
let lastVillages: { type: 'Feature'; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> }[] = [];
let cartouches: Cartouches | null = null;
/** The latitude of the northern edge of each drawn plan's houses, by settlement id. */
let planNorth = new Map<string, number>();
/** Whether an illustrated plan is in view: its border and title cartouches are drawn. */
const illusOn = ref(false);
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
  // The political overlay: a wash of realm colours, drawn on the main thread (render/political.ts).
  preparePolitical(world.value.gen, world.value.politics);
  const polUrl = `politics://${world.value.gen}/{z}/{x}/{y}`;
  const pol = map.getSource('political') as RasterTileSource | undefined;
  if (!pol) {
    map.addSource('political', { type: 'raster', tiles: [polUrl], tileSize: 256, maxzoom: 9 });
    map.addLayer(
      {
        id: 'political', type: 'raster', source: 'political',
        layout: { visibility: store.showPolitical ? 'visible' : 'none' },
        paint: {
          'raster-fade-duration': 0, 'raster-resampling': 'linear',
          'raster-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.85, 4, 0.8, 6.5, 0.55, 9, 0.25, 11.5, 0],
        },
      },
      PLAN_GROUND_LAYERS[0].id,
    );
  } else pol.setTiles([polUrl]);
  bigArmsGen = -1;
  setVisibility('political', store.showPolitical);
  updateRelations();
  faithGen = -1;
  updateFaithMap();
  groupGen = -1;
  updateGroupMap();
  if (store.labelMode !== 'native') applyLabelMode();
  setVisibility('rivers', store.showRivers);
  (map.getSource('rivers') as GeoJSONSource).setData(world.value.rivers);
  (map.getSource('wind') as GeoJSONSource).setData(world.value.wind);
  (map.getSource('currents') as GeoJSONSource).setData(world.value.currents);
  registerArms();
  (map.getSource('labels') as GeoJSONSource).setData(world.value.labels);
  (map.getSource('borders') as GeoJSONSource).setData(world.value.politics.borders);
  updateUnderworld();
  if (townsGen !== world.value.gen) {
    townsGen = world.value.gen;
    const { raster, settlements, roads, rivers, politics, labels } = world.value;
    // Politics and labels let the towns worker build the world's lore and camp armies on the fronts of its wars.
    postTowns({ type: 'init', gen: townsGen, world: { raster, settlements, roads, rivers, politics, labels } });
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
    // Faiths come from the world's lore: built when the page is idle, then searchable.
    const w0 = world.value;
    const idle = (cb: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 1500));
    idle(() => {
      if (world.value !== w0) return;
      const c = currentLore();
      if (!c) return;
      search.add(faithEntries(c.L.faiths.faiths));
      search.add(themeEntries(w0.settlements, worldThemes(c, w0.raster.seed).themes, THEME_LABEL));
      search.add(orderEntries(currentOrders(), ORDER_KIND_LABEL));
      searchState.version++;
    });
    searchState.done = 0;
    searchState.total = 0;
    searchState.version++;
    runTowns();
  }
}

/**
 * While a realm's details are open, tint its allies, rivals and enemies on the map
 * (`relations://` tiles, see world/political.ts) and draw its trade routes.
 */
let faithGen = -1;
/**
 * The faith map: built from the world's lore when first shown (and again for each new world),
 * with its holy places as marked points and a key (`faithLegend`).
 */
function updateFaithMap(): void {
  if (!map || !ready || !world.value) return;
  const show = store.showFaiths;
  for (const id of ['faithmap', 'holy-dot', 'holy-lbl']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none');
  if (!show) return;
  const w = world.value;
  if (faithGen === w.gen && map.getLayer('faithmap')) return;
  const c = currentLore();
  if (!c) return;
  faithGen = w.gen;
  const units = w.politics.units;
  const cols = prepareFaithMap(w.gen, (b) => {
    const u = units[b];
    if (!u) return null;
    const s = c.L.faiths.sectOf(u.culture, u.lon, u.lat);
    return [s.faith.id, s.sect.id];
  });
  faithLegend.value = [...cols].map(([id, rgb]) => ({ id, name: c.L.faiths.faiths[id].name, rgb }));
  const url = `faiths://${w.gen}/{z}/{x}/{y}`;
  const src = map.getSource('faithmap') as RasterTileSource | undefined;
  if (!src) {
    map.addSource('faithmap', { type: 'raster', tiles: [url], tileSize: 256, maxzoom: 9 });
    map.addLayer(
      {
        id: 'faithmap', type: 'raster', source: 'faithmap',
        paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear', 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.85, 4, 0.8, 6.5, 0.55, 9, 0.25, 11.5, 0] },
      },
      PLAN_GROUND_LAYERS[0].id,
    );
  } else src.setTiles([url]);
  // Holy places: the first of each faith (its holiest) larger.
  const holy = c.L.faiths.faiths.filter((f) => cols.has(f.id) || f.cultures.length).flatMap((f) => f.holySites.map((h, k) => ({
    type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [h.lon, h.lat] },
    properties: { name: h.name, faith: f.id, major: k === 0 ? 1 : 0, rgb: `rgb(${(cols.get(f.id) ?? [120, 90, 60]).join(',')})` },
  })));
  const data = { type: 'FeatureCollection' as const, features: holy };
  const hs = map.getSource('holy') as GeoJSONSource | undefined;
  if (!hs) {
    map.addSource('holy', { type: 'geojson', data });
    map.addLayer({
      id: 'holy-dot', type: 'circle', source: 'holy', minzoom: 1.5,
      paint: { 'circle-color': ['get', 'rgb'], 'circle-stroke-color': '#2b2420', 'circle-stroke-width': 1.2, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, ['case', ['==', ['get', 'major'], 1], 4, 2.5], 8, ['case', ['==', ['get', 'major'], 1], 7, 5]] },
    });
    map.addLayer({
      id: 'holy-lbl', type: 'symbol', source: 'holy', minzoom: 3.5,
      filter: ['any', ['==', ['get', 'major'], 1], ['>=', ['zoom'], 5.5]],
      layout: { 'text-field': ['get', 'name'], 'text-font': [ITALIC], 'text-size': 12, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true },
      paint: { 'text-color': '#2b2420', 'text-halo-color': 'rgba(243,234,211,0.85)', 'text-halo-width': 1.4 },
    });
    map.on('click', 'holy-dot', (e) => {
      const f = e.features?.[0];
      if (f) openFaith.value = Number(f.properties?.faith);
    });
    map.on('mouseenter', 'holy-dot', () => map && (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'holy-dot', () => map && (map.getCanvas().style.cursor = ''));
  } else hs.setData(data);
}

let groupGen = -1;
let groupKind: GroupKey | null = null;
/** Each race's colour on the race map. */
const RACE_RGB: Record<string, [number, number, number]> = {
  Humans: [204, 142, 104], Elves: [88, 150, 96], Dwarves: [112, 124, 150], Halflings: [214, 186, 72], Orcs: [176, 72, 58], Lizardfolk: [52, 140, 140],
};
const RACES = Object.keys(RACE_RGB);
/**
 * The culture and race maps: each barony washed in the colour of its people (or their race,
 * shaded by people from zoom 5), with each people's name at the middle of its lands, and a key
 * (`groupLegend`). Built from the world's politics and cultures alone, so they show at once.
 */
function updateGroupMap(): void {
  if (!map || !ready || !world.value) return;
  const kind: GroupKey | null = store.showCultures ? 'cultures' : store.showRaces ? 'races' : null;
  for (const k of ['cultures', 'races'] as const) if (map.getLayer(`${k}map`)) map.setLayoutProperty(`${k}map`, 'visibility', kind === k ? 'visible' : 'none');
  for (const id of ['group-lbl']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', kind ? 'visible' : 'none');
  if (!kind) return;
  const w = world.value;
  if (groupGen === w.gen && groupKind === kind && map.getLayer(`${kind}map`)) return;
  groupGen = w.gen;
  groupKind = kind;
  const units = w.politics.units;
  const raceOf = (ci: number) => Math.max(0, RACES.indexOf(templateFolk(CULTURES[ci]?.id ?? '')));
  const cols = prepareGroupMap(kind, w.gen, (b) => {
    const u = units[b];
    if (!u || u.level !== 0 || !CULTURES[u.culture]) return null;
    return kind === 'cultures' ? [u.culture, 0] : [raceOf(u.culture), u.culture + 1];
  }, kind === 'races' ? (id) => RACE_RGB[RACES[id]] ?? [150, 150, 150] : undefined);
  // Each people's lands: their baronies, and the one nearest the middle of them for the name.
  const lands = new Map<number, { lon: number; lat: number; n: number; x: number; y: number; z: number }[]>();
  for (const u of units) {
    if (u.level !== 0 || !CULTURES[u.culture]) continue;
    (lands.get(u.culture) ?? lands.set(u.culture, []).get(u.culture)!).push({ lon: u.lon, lat: u.lat, n: 1, x: 0, y: 0, z: 0 });
  }
  const rad = Math.PI / 180;
  const features = [...lands].map(([ci, bs]) => {
    let x = 0, y = 0, z = 0;
    for (const b of bs) {
      x += Math.cos(b.lat * rad) * Math.cos(b.lon * rad);
      y += Math.cos(b.lat * rad) * Math.sin(b.lon * rad);
      z += Math.sin(b.lat * rad);
    }
    const lon = Math.atan2(y, x) / rad, lat = Math.atan2(z, Math.hypot(x, y)) / rad;
    let best = bs[0], bd = Infinity;
    for (const b of bs) {
      const d = Math.hypot(((b.lon - lon + 540) % 360) - 180, b.lat - lat);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    const c = CULTURES[ci];
    return {
      type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [best.lon, best.lat] },
      properties: { name: kind === 'cultures' ? c.name : `${c.name}`, sub: kind === 'races' ? templateFolk(c.id) : '', culture: ci, size: bs.length },
    };
  });
  if (kind === 'cultures') {
    groupLegend.value = {
      title: 'Peoples', note: 'Each people\u2019s lands in its own colour; a click opens the people.',
      items: [...cols].sort((a, b) => (lands.get(b[0])?.length ?? 0) - (lands.get(a[0])?.length ?? 0)).map(([id, rgb]) => ({ id, name: CULTURES[id].name, rgb, culture: id, sub: templateFolk(CULTURES[id].id) !== 'Humans' ? templateFolk(CULTURES[id].id) : '' })),
    };
  } else {
    groupLegend.value = {
      title: 'Races', note: 'Lighter and darker shades are the peoples of each race; a click opens the largest of them.',
      items: [...cols].sort((a, b) => [...lands].filter(([ci]) => raceOf(ci) === b[0]).length - [...lands].filter(([ci]) => raceOf(ci) === a[0]).length).map(([id, rgb]) => {
        const peoples = [...lands.keys()].filter((ci) => raceOf(ci) === id).sort((a, b) => (lands.get(b)?.length ?? 0) - (lands.get(a)?.length ?? 0));
        return { id, name: RACES[id], rgb, culture: peoples[0], sub: peoples.length === 1 ? '1 people' : `${peoples.length} peoples` };
      }),
    };
  }
  const url = `${kind}://${w.gen}/{z}/{x}/{y}`;
  const layerId = `${kind}map`;
  const src = map.getSource(layerId) as RasterTileSource | undefined;
  if (!src) {
    map.addSource(layerId, { type: 'raster', tiles: [url], tileSize: 256, maxzoom: 9 });
    map.addLayer(
      {
        id: layerId, type: 'raster', source: layerId,
        paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear', 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.85, 4, 0.8, 6.5, 0.55, 9, 0.25, 11.5, 0] },
      },
      PLAN_GROUND_LAYERS[0].id,
    );
  } else src.setTiles([url]);
  const data = { type: 'FeatureCollection' as const, features };
  const gs = map.getSource('grouplbl') as GeoJSONSource | undefined;
  if (!gs) {
    map.addSource('grouplbl', { type: 'geojson', data });
    map.addLayer({
      id: 'group-lbl', type: 'symbol', source: 'grouplbl', minzoom: 1.5,
      filter: ['any', ['>=', ['get', 'size'], 6], ['>=', ['zoom'], 4]],
      layout: {
        'text-field': ['case', ['!=', ['get', 'sub'], ''], ['format', ['get', 'name'], {}, '\n', {}, ['get', 'sub'], { 'font-scale': 0.75 }], ['get', 'name']],
        'text-font': [ITALIC], 'text-size': ['interpolate', ['linear'], ['zoom'], 2, ['min', 15, ['+', 10, ['/', ['get', 'size'], 12]]], 6, ['min', 22, ['+', 13, ['/', ['get', 'size'], 8]]]],
        'text-letter-spacing': 0.08, 'text-max-width': 9, 'symbol-sort-key': ['-', 0, ['get', 'size']], 'text-optional': true,
      },
      paint: { 'text-color': '#2b2420', 'text-halo-color': 'rgba(243,234,211,0.9)', 'text-halo-width': 1.6 },
    });
    map.on('click', 'group-lbl', (e) => {
      const f = e.features?.[0];
      if (f) openCulture.value = Number(f.properties?.culture);
    });
    map.on('mouseenter', 'group-lbl', () => map && (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'group-lbl', () => map && (map.getCanvas().style.cursor = ''));
  } else gs.setData(data);
  if (map.getLayer('group-lbl')) map.moveLayer('group-lbl');
}

function updateRelations(): void {
  if (!map || !ready || !world.value) return;
  const w = world.value;
  const id = openRealm.value;
  const c = id !== null ? currentLore() : null;
  const sel = c && id !== null ? relationsForMap(c, id) : null;
  const ver = setRelations(w.gen, sel ? { unit: id!, top: sel.self, rel: sel.rel } : null);
  const url = `relations://${w.gen}/${Math.max(0, ver)}/{z}/{x}/{y}`;
  const src = map.getSource('relations') as RasterTileSource | undefined;
  if (!src) {
    map.addSource('relations', { type: 'raster', tiles: [url], tileSize: 256, maxzoom: 9 });
    map.addLayer(
      {
        id: 'relations', type: 'raster', source: 'relations', layout: { visibility: 'none' },
        paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear', 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.95, 8, 0.7, 11, 0.25, 13, 0] },
      },
      PLAN_GROUND_LAYERS[0].id,
    );
  } else src.setTiles([url]);
  map.setLayoutProperty('relations', 'visibility', ver >= 0 ? 'visible' : 'none');
  // Trade routes: from the realm's seat to each partner's, the short way round.
  const links = (map.getSource('realm-links') as GeoJSONSource | undefined);
  if (!links) return;
  const features: { type: 'Feature'; geometry: { type: 'LineString'; coordinates: number[][] }; properties: Record<string, never> }[] = [];
  if (sel && sel.self >= 0) {
    const u = w.politics.units;
    const a = u[sel.self];
    for (const pId of sel.partners) {
      const b = u[pId];
      let lon = b.lon;
      while (lon - a.lon > 180) lon -= 360;
      while (lon - a.lon < -180) lon += 360;
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[a.lon, a.lat], [lon, b.lat]] }, properties: {} });
    }
  }
  links.setData({ type: 'FeatureCollection', features });
}

/** Letters every name layer in the chosen language mode (local names, English, or both). */
function applyLabelMode(): void {
  if (!map || !ready) return;
  for (const l of map.getStyle().layers ?? []) {
    if (l.type !== 'symbol') continue;
    const field = map.getLayoutProperty(l.id, 'text-field');
    if (!field) continue;
    const upper = JSON.stringify(field).includes('upcase');
    const line = (map.getLayoutProperty(l.id, 'symbol-placement') ?? 'point') !== 'point';
    map.setLayoutProperty(l.id, 'text-field', textField(store.labelMode, upper, line));
  }
}

/** The Underworld layer: its drawing and lettering, and the surface's overlays hidden while it is shown. */
let underGen = -1;
function updateUnderworld(): void {
  if (!map || !ready || !world.value) return;
  const u = world.value.raster.underworld;
  if (u && underGen !== world.value.gen) {
    underGen = world.value.gen;
    const f = underFeatures(u);
    (map.getSource('uw-areas') as GeoJSONSource).setData(f.areas as never);
    (map.getSource('uw-lines') as GeoJSONSource).setData(f.lines as never);
    (map.getSource('uw-points') as GeoJSONSource).setData(f.points as never);
  }
  const show = store.layer === 'underworld' && !!u;
  for (const l of UNDER_LAYERS) if (map.getLayer(l.id)) map.setLayoutProperty(l.id, 'visibility', show ? 'visible' : 'none');
  for (const k of ['settlements', 'labels', 'borders', 'political', 'wind', 'currents', 'rivers'] as const) {
    const on = { settlements: store.showSettlements, labels: store.showLabels, borders: store.showBorders, political: store.showPolitical, wind: store.showWind, currents: store.showCurrents, rivers: store.showRivers }[k];
    setVisibility(k, on);
  }
}

/** The cavern of the Underworld under a screen point, when that layer is shown. */
function deepAt(point: { x: number; y: number }): LairSite | null {
  const u = world.value?.raster.underworld;
  if (!map || !u || store.layer !== 'underworld' || !map.getLayer('uw-fill')) return null;
  // A city's marker, or the cavern itself.
  const city = map.queryRenderedFeatures([point.x, point.y], { layers: ['uw-city'] })[0];
  if (city) return deepSite(u, Number(city.properties?.id));
  const hits = map.queryRenderedFeatures([point.x, point.y], { layers: ['uw-fill'] });
  // The upper deep before the lower, where both are under the point.
  hits.sort((a, b) => Number(a.properties?.tier) - Number(b.properties?.tier));
  const id = hits[0]?.properties?.id;
  return id === undefined ? null : deepSite(u, Number(id));
}

/** The cavern below a sinkhole under a screen point (its icon or name on the surface). */
function sinkholeAt(point: { x: number; y: number }): LairSite | null {
  const u = world.value?.raster.underworld;
  if (!map || !u || store.layer === 'underworld' || !map.getLayer('lbl-sinkhole')) return null;
  const f = map.queryRenderedFeatures([point.x, point.y], { layers: ['lbl-sinkhole'] })[0];
  if (!f || f.geometry.type !== 'Point') return null;
  const [lon, lat] = f.geometry.coordinates;
  const e = u.entrances.filter((x) => x.kind === 'sinkhole').sort((a, b) => Math.hypot(a.lon - lon, a.lat - lat) - Math.hypot(b.lon - lon, b.lat - lat))[0];
  return e ? deepSite(u, e.node) : null;
}

/** The realm whose label or arms is under a screen point. */
function realmLabelAt(point: { x: number; y: number }): number | null {
  if (!map || !ready) return null;
  const ids = ['pol-realm', 'pol-league', 'lbl-empire', 'lbl-realm', 'lbl-league', 'lbl-duchy', 'lbl-county', 'lbl-barony'].filter((x) => map!.getLayer(x) && map!.getLayoutProperty(x, 'visibility') !== 'none');
  if (!ids.length) return null;
  const pad = touchOnly ? 10 : 4;
  const hit = map.queryRenderedFeatures([[point.x - pad, point.y - pad], [point.x + pad, point.y + pad]], { layers: ids }).find((f) => f.properties?.unit !== undefined);
  return hit ? Number(hit.properties!.unit) : null;
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
    // Arms for the labels that carry them: empires, kingdoms, leagues and every independent realm.
    if (u.level < 3 && u.parent >= 0) continue;
    const id = `arms-${u.id}`;
    map.addImage(id, armsImageData(u.arms, u.level === 4 ? 30 : u.level === 3 || u.gov === 'league' ? 24 : 20), { pixelRatio: 2 });
    armsIds.push(id);
  }
}

/** Large arms (`parms-<unit>`) for the political map's labels: every independent realm and league. */
let bigArmsIds: string[] = [];
let bigArmsGen = -1;
function registerBigArms(): void {
  if (!map || !world.value || bigArmsGen === world.value.gen) return;
  bigArmsGen = world.value.gen;
  for (const id of bigArmsIds) if (map.hasImage(id)) map.removeImage(id);
  bigArmsIds = [];
  for (const u of world.value.politics.units) {
    if (u.parent >= 0) continue;
    const id = `parms-${u.id}`;
    map.addImage(id, armsImageData(u.arms, u.level >= 3 || u.gov === 'league' ? 46 : 38), { pixelRatio: 2 });
    bigArmsIds.push(id);
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
      if (res.villages) {
        (map.getSource('regional') as GeoJSONSource).setData(res.villages);
        lastVillages = res.villages.features as typeof lastVillages;
        updateCartouches();
      }
      if (res.plans) {
        (map.getSource('plans') as GeoJSONSource).setData(res.plans);
        planIndex = new Map();
        // The northern edge of each plan's houses (past the odd outlying farm), where its
        // title cartouche stands.
        const lats = new Map<string, number[]>();
        for (const f of res.plans.features) {
          if (f.properties.kind !== 'building') continue;
          planIndex.set(String(f.properties.bid), f);
          if (f.geometry.type === 'Polygon') {
            const sid = String(f.properties.sid);
            const l = lats.get(sid) ?? [];
            l.push(f.geometry.coordinates[0][0][1]);
            lats.set(sid, l);
          }
        }
        planNorth = new Map();
        for (const [sid, l] of lats) {
          l.sort((a, b) => a - b);
          planNorth.set(sid, l[Math.min(l.length - 1, Math.floor(l.length * 0.96))]);
        }
        updateCartouches();
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
    type: 'view', gen: townsGen, zoom: map.getZoom(), illustrated: store.illustratedTowns,
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
  political: ['political', ...POLITICAL_LABEL_LAYERS.map((l) => l.id)],
};
/** Realm labels the political map letters larger instead (independent realms, kingdoms, empires, leagues). */
const REPLACED_BY_POLITICAL = new Set(['lbl-empire', 'lbl-realm', 'lbl-league']);

function setVisibility(overlay: keyof typeof OVERLAY_LAYERS, show: boolean): void {
  if (!map || !ready) return;
  if (overlay === 'labels' && map.getLayer('lbl-duchy')) {
    // Independent small realms are lettered by the political map instead, when it is on.
    const base = (WORLD_LABEL_LAYERS.find((l) => l.id === 'lbl-duchy') as { filter: unknown }).filter;
    map.setFilter('lbl-duchy', (store.showPolitical ? ['all', base, ['!=', ['get', 'top'], 1]] : base) as FilterSpecification);
  }
  if (overlay === 'political' && show) registerBigArms();
  if (overlay === 'rivers' && rasterRivers()) show = false;
  // The Underworld layer shows the deep alone: everything of the surface is hidden.
  if (store.layer === 'underworld') show = false;
  for (const id of OVERLAY_LAYERS[overlay]) {
    let vis = show;
    // The illustrated plan style replaces some of the plain style's layers.
    if (ILLUSTRATED_LAYERS.has(id)) vis = show && store.illustratedTowns;
    // Name layers also follow the overlay they belong to.
    if (overlay === 'political') vis = show && (id === 'political' || store.showLabels);
    if (overlay === 'labels') {
      if (REPLACED_BY_POLITICAL.has(id)) vis = show && !store.showPolitical;
      else if (id.startsWith('lbl-river')) vis = show && store.showRivers;
      else if (id === 'lbl-road' || SETTLEMENT_LABEL_LAYERS.some((l) => l.id === id) || PLAN_LABEL_LAYERS.some((l) => l.id === id)) vis = show && store.showSettlements;
    }
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis ? 'visible' : 'none');
  }
}

/**
 * The plan style: in the illustrated style the plain footprints, walls, towers and trees give
 * way to raised ones at ILL_ZOOM, and the map faces north and lies flat there, since the
 * raised buildings are drawn as seen from the south.
 */
function applyPlanStyle(): void {
  if (!map || !ready || !map.getLayer('plan-buildings')) return;
  const ill = store.illustratedTowns;
  // The plain footprints give way to the raised buildings at ILL_ZOOM (but for burrows, which keep their mounds).
  const fade = ['interpolate', ['linear'], ['zoom'], TOWN_PLAN_ZOOM, 0, 12.3, 1];
  map.setPaintProperty('plan-buildings', 'fill-opacity', (ill ? ['interpolate', ['linear'], ['zoom'], TOWN_PLAN_ZOOM, 0, 12.3, 1, ILL_ZOOM + 0.2, 1, ILL_ZOOM + 0.4, ['case', ['has', 'burrow'], 1, 0]] : fade) as never);
  for (const id of PLAIN_ONLY_LAYERS) {
    const l = SETTLEMENT_LAYERS.find((q) => q.id === id);
    if (l && map.getLayer(id)) map.setLayerZoomRange(id, l.minzoom ?? 0, ill ? ILL_ZOOM + 0.4 : 24);
  }
  map.setPaintProperty('plan-furrows', 'line-color', ill ? '#ad9c6b' : '#c2b385');
  setVisibility('settlements', store.showSettlements);
  northLock(true);
  updateIllus();
}

let rotationLocked = false;
/** Faces the map north (and flat) and stops it turning while an illustrated plan is in view. */
function northLock(settle: boolean): void {
  if (!map) return;
  const lock = store.illustratedTowns && store.showSettlements && store.layer !== 'underworld' && map.getZoom() >= ILL_ZOOM - 0.6;
  if (lock !== rotationLocked) {
    rotationLocked = lock;
    if (lock) {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
    } else {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
      map.keyboard.enableRotation();
    }
  }
  if (lock && settle && (Math.abs(map.getBearing()) > 0.01 || map.getPitch() > 0.01) && !map.isMoving()) {
    map.easeTo({ bearing: 0, pitch: 0, duration: 600 });
  }
}

/** Turns the illustrated map's border and cartouches on or off by the zoom. */
function updateIllus(): void {
  if (!map) return;
  const on = store.illustratedTowns && store.showSettlements && store.layer !== 'underworld' && map.getZoom() >= ILL_ZOOM;
  if (on !== illusOn.value) {
    illusOn.value = on;
    updateCartouches();
  }
}

/**
 * Title cartouches over the towns and villages whose plans are in view, nearest the centre
 * first (a few at most), in the lettering chosen for place names.
 */
function updateCartouches(): void {
  if (!map || !cartouches) return;
  const w = world.value;
  if (!illusOn.value || !w || !store.showLabels) {
    cartouches.clear();
    return;
  }
  const b = map.getBounds(), c = map.getCenter();
  const padLat = (b.getNorth() - b.getSouth()) * 0.6, padLon = (b.getEast() - b.getWest()) * 0.3;
  const inView = (lon: number, lat: number) => lon > b.getWest() - padLon && lon < b.getEast() + padLon && lat > b.getSouth() - padLat && lat < b.getNorth() + padLat * 0.2;
  const naming = (name: string, en?: string) => {
    if (!en || en === name) return { name, alt: undefined };
    if (store.labelMode === 'english') return { name: en, alt: undefined };
    return { name, alt: store.labelMode === 'both' ? en : undefined };
  };
  // Just above the plan's northernmost roof (once the plan is drawn).
  const northOf = (id: string, lat: number, fallbackM: number) => {
    const n = planNorth.get(id);
    return n !== undefined ? (n - lat) * 110540 + 22 : fallbackM;
  };
  const sites: (CartoucheSite & { d: number })[] = [];
  const d = (lon: number, lat: number) => Math.hypot((lon - c.lng) * Math.cos((c.lat * Math.PI) / 180), lat - c.lat);
  for (const s of w.settlements) {
    if (s.tier === 'village' || !s.name || !inView(s.lon, s.lat)) continue;
    sites.push({ id: s.id, ...naming(s.name, s.nameEn), lon: s.lon, lat: s.lat, northM: northOf(s.id, s.lat, s.coreM * 0.7), arms: townArms(w, s), small: false, d: d(s.lon, s.lat) });
  }
  for (const f of lastVillages) {
    const p = f.properties;
    if (p.tier !== 'village' || f.geometry.type !== 'Point' || !p.name || p.kind === 'abandoned') continue;
    const [lon, lat] = f.geometry.coordinates as number[];
    if (!inView(lon, lat)) continue;
    sites.push({ id: String(p.id), ...naming(String(p.name), p.en ? String(p.en) : undefined), lon, lat, northM: northOf(String(p.id), lat, 60 + Math.sqrt(Number(p.population ?? 100)) * 3), arms: null, small: true, d: d(lon, lat) });
  }
  sites.sort((x, y) => x.d - y.d);
  cartouches.set(sites.slice(0, 6));
}

/** The plan building under a screen point, at interior zooms. */
function buildingAt(point: PointLike): PlanFeature | null {
  if (!map || !ready || map.getZoom() < INTERIOR_ZOOM || !store.showSettlements || !map.getLayer('plan-buildings')) return null;
  // In the illustrated style a building is found by its walls and roof (the frontmost face).
  let bid: unknown = null;
  if (store.illustratedTowns && map.getLayer('ill-faces')) {
    let top = -Infinity;
    for (const f of map.queryRenderedFeatures(point, { layers: ['ill-faces'] })) {
      const z = Number(f.properties?.z ?? -Infinity);
      if (f.properties?.bid && z > top) {
        top = z;
        bid = f.properties.bid;
      }
    }
  }
  bid ??= map.queryRenderedFeatures(point, { layers: ['plan-buildings'] })[0]?.properties?.bid;
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
  if (!v) return;
  try {
    v.residents = residentsFor(f);
  } catch (err) {
    console.error('residents', err);
  }
  openBuilding.value = { ...v };
}

/** The households of a building (people/plan-residents.ts), a village's from its marker. */
function residentsFor(f: PlanFeature): Household[] {
  const sid = String(f.properties.sid ?? '');
  const vf = lastVillages.find((x) => x.properties.id === sid);
  const village = vf && vf.geometry.type === 'Point'
    ? { lon: (vf.geometry.coordinates as number[])[0], lat: (vf.geometry.coordinates as number[])[1], kind: String(vf.properties.kind ?? f.properties.ctx ?? 'farming'), population: Number(vf.properties.population ?? 150), name: String(vf.properties.name ?? '') }
    : undefined;
  return householdsFor(world.value!, f, planIndex.values(), village);
}

function onHover(e: MapMouseEvent): void {
  cancelAnimationFrame(hoverFrame);
  hoverFrame = requestAnimationFrame(() => {
    const f = buildingAt(e.point);
    const l = f ? null : lairAt(e.point, e.lngLat);
    const dn = f || l ? null : dungeonAt(e.point);
    if (map) map.getCanvas().style.cursor = f || l || dn || realmLabelAt(e.point) !== null || deepAt(e.point) || sinkholeAt(e.point) ? 'pointer' : '';
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
      best = { name: String(f.properties.name ?? ''), ...(f.properties.en ? { en: String(f.properties.en) } : {}), kind: String(f.properties.kind ?? 'farming'), population: Number(f.properties.population ?? 0), ...(f.properties.realm ? { realm: String(f.properties.realm), war: String(f.properties.war ?? '') } : {}), ...(f.properties.faith || f.properties.what ? { faith: String(f.properties.faith ?? ''), what: String(f.properties.what ?? '') } : {}), ...(f.properties.cause ? { cause: String(f.properties.cause), ago: String(f.properties.ago ?? ''), ...(f.properties.curse ? { curse: String(f.properties.curse) } : {}) } : {}), ...(f.properties.order ? { order: String(f.properties.order) } : {}) };
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
    // Hidden from the panel (Location details): nothing is worked out.
    if (!store.showProbe) return;
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
        'realm-links': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        borders: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        ...SETTLEMENT_SOURCES,
        ...UNDER_SOURCES,
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
        // An open realm's trade routes to its partners.
        {
          id: 'realm-links', type: 'line', source: 'realm-links',
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': '#7a5418', 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1.2, 6, 2.4], 'line-dasharray': [2, 2], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.85, 8, 0.6, 10, 0] },
        },
        ...SPECIAL_LINE_LAYERS,
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
        ...UNDER_LAYERS,
        ...PLAN_LABEL_LAYERS,
        ...WORLD_LABEL_LAYERS,
        ...POLITICAL_LABEL_LAYERS.map((l) => ({ ...l, layout: { ...(l as { layout: object }).layout, visibility: 'none' } }) as typeof l),
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
    for (const icon of [...lairIcons(), ...specialIcons()]) if (map && !map.hasImage(icon.id)) map.addImage(icon.id, icon.image, { pixelRatio: icon.pixelRatio });
    setVisibility('rivers', store.showRivers);
    setVisibility('wind', store.showWind);
    setVisibility('currents', store.showCurrents);
    setVisibility('settlements', store.showSettlements);
    setVisibility('labels', store.showLabels);
    setVisibility('borders', store.showBorders);
    setVisibility('political', store.showPolitical);
    applyPlanStyle();
    syncWorld();
  });
  map.on('zoom', () => {
    northLock(false);
    updateIllus();
  });
  cartouches = new Cartouches(map);
  map.on('moveend', () => {
    northLock(true);
    updateIllus();
    updateCartouches();
    runTowns();
    if (map) {
      const c = map.getCenter();
      store.center = [c.lng, c.lat];
      store.zoom = map.getZoom();
      const b = map.getBounds();
      store.bounds = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      store.here = villageHere();
    }
  });
  map.on('mousemove', (e) => {
    scheduleProbe(e.lngLat);
    onHover(e);
  });
  map.on('click', (e) => {
    scheduleProbe(e.lngLat);
    // In the Underworld, a click on a realm's name opens it; on a cavern or city, its map.
    if (store.layer === 'underworld' && map) {
      const rl = map.queryRenderedFeatures([e.point.x, e.point.y], { layers: ['uw-label-realm'].filter((id) => map!.getLayer(id)) })[0];
      if (rl) {
        openDeepRealm.value = Number(rl.properties?.realm);
        return;
      }
    }
    const deep = deepAt(e.point);
    if (deep) {
      openLair.value = deep;
      return;
    }
    // A sinkhole on the surface opens the cavern it leads down to.
    const sink = sinkholeAt(e.point);
    if (sink) {
      openLair.value = sink;
      return;
    }
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
    // A realm's name or arms opens its details.
    if (!f && !l && !dn) {
      const r = realmLabelAt(e.point);
      if (r !== null) openRealm.value = r;
    }
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
  // Flying in to an illustrated plan turns the map to face north on the way.
  const north = store.illustratedTowns && store.showSettlements && t.zoom >= ILL_ZOOM - 0.6;
  map.flyTo({ center: [t.lon, t.lat], zoom: t.zoom, duration: 2200, essential: true, offset: [t.offsetX ?? 0, 0], ...(north ? { bearing: 0, pitch: 0 } : {}) });
  const src = map.getSource('search-hit') as GeoJSONSource | undefined;
  // A quiet flight (a loaded world file's view) has no pulse.
  if (!src || t.quiet) return;
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
watch(openRealm, updateRelations);
watch(() => store.labelMode, () => {
  applyLabelMode();
  updateCartouches();
});
watch(() => store.showLabels, () => updateCartouches());
watch(() => store.layer, () => updateIllus());
watch(world, () => {
  lastVillages = [];
  cartouches?.clear();
});
watch(() => store.showRivers, () => {
  syncWorld();
  setVisibility('labels', store.showLabels);
});
watch(() => store.showWind, (show) => setVisibility('wind', show));
watch(() => store.showCurrents, (show) => setVisibility('currents', show));
watch(() => store.showLabels, (show) => setVisibility('labels', show));
watch(() => store.showBorders, (show) => setVisibility('borders', show));
watch(() => store.showFaiths, (show) => {
  if (show) Object.assign(store, { showPolitical: false, showCultures: false, showRaces: false });
  updateFaithMap();
});
watch(() => store.showCultures, (show) => {
  if (show) Object.assign(store, { showPolitical: false, showFaiths: false, showRaces: false });
  updateGroupMap();
});
watch(() => store.showRaces, (show) => {
  if (show) Object.assign(store, { showPolitical: false, showFaiths: false, showCultures: false });
  updateGroupMap();
});
watch(() => store.showPolitical, (show) => {
  if (show) Object.assign(store, { showFaiths: false, showCultures: false, showRaces: false });
  setVisibility('political', show);
  setVisibility('labels', store.showLabels);
});
watch(() => store.showProbe, (show) => {
  savePref('showProbe', show);
  if (!show) store.probe = null;
});
watch(() => store.illustratedTowns, (ill) => {
  savePref('illustratedTowns', ill);
  applyPlanStyle();
  runTowns();
});
watch(() => store.showSettlements, (show) => {
  northLock(true);
  updateIllus();
  setVisibility('settlements', show);
  setVisibility('labels', store.showLabels);
  if (!show) hidePreview();
  runTowns();
});
</script>

<template>
  <div class="map-view">
    <div ref="container" class="map-canvas" />
    <IllusFrame :show="illusOn" />
    <div v-if="lairCard" class="lair-card" :style="{ left: `${lairCard.x}px`, top: `${lairCard.y}px` }">
      <div class="lair-name">{{ lairCard.name }}</div>
      <div class="lair-sub">{{ lairCard.sub }}</div>
      <img :src="lairCard.img" alt="" width="220" height="160" />
      <div class="lair-hint">{{ touchOnly ? 'Tap again to open' : 'Double-click to open' }}</div>
    </div>
    <div v-if="store.probe && store.showProbe" class="probe">
      <button class="probe-close" title="Hide location details (show them again from the panel)" aria-label="Hide location details" @click="store.showProbe = false">×</button>
      <div class="probe-title">{{ store.probe.terrain }}</div>
      <div v-if="store.probe.place" class="probe-place">{{ store.probe.place }}</div>
      <div v-if="store.probe.climate">{{ store.probe.climate }}</div>
      <div v-if="store.layer === 'oldworld' && store.probe.settledWorld">{{ store.probe.settledWorld }}</div>
      <div v-if="store.layer === 'underworld'">{{ store.probe.under ? `Below: ${store.probe.under}` : 'Solid rock below' }}</div>
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
.probe-close {
  position: absolute;
  top: 4px;
  right: 5px;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #9fb0c2;
  font-size: 15px;
  line-height: 20px;
  cursor: pointer;
  pointer-events: auto;
}
.probe-close:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}
.probe-title {
  padding-right: 18px;
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
