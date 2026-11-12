<script setup lang="ts">
/**
 * The travel map: the world around the party at three fixed scales, with roads, places and the
 * route; choose a destination, travel with the clock running, stop, or zoom in to the local map.
 */
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import WorldView from './WorldView.vue';
import { SPEEDS, type LL, type Travel } from '../game/travel';
import { TILE_M } from '@worldforge/core/local/chunk';
import type { PlanImage, StartSite, TravelArea, ViewLayer } from '../worker/protocol';

const props = defineProps<{
  travel: Travel;
  starts: StartSite[];
  requestTile: (z: number, x: number, y: number, layer: ViewLayer) => Promise<ImageBitmap | null>;
  requestArea: (box: { west: number; south: number; east: number; north: number }, fine: boolean) => Promise<TravelArea>;
  requestPlan: (id: string, o: { mpp: number; radius: number; illustrated: boolean; lon?: number; lat?: number }) => Promise<PlanImage | null>;
}>();
const emit = defineEmits<{ zoomIn: [] }>();

/** The three scales: country, realm, world (km across the view). */
const LEVELS = [10, 200, 40000];
const LEVEL_NAMES = ['Country', 'Realm', 'World'];
const level = ref(0);
const mapRef = ref<InstanceType<typeof WorldView> | null>(null);
const layer = ref<ViewLayer>('fantasy');
const area = shallowRef<TravelArea | null>(null);
/** Settlements' plans drawn close in (Country scale), once discovered. */
const plans = shallowRef<PlanImage[]>([]);
const asked = new Set<string>();

function loadPlans(a: TravelArea): void {
  for (const p of a.places) {
    if (!p.radiusM || p.tier === 'lair' || asked.has(p.id) || fog(p.lon, p.lat) === 0) continue;
    asked.add(p.id);
    void props.requestPlan(p.id, { mpp: p.tier === 'village' ? 2 : 4, radius: p.radiusM * 1.05, illustrated: false, lon: p.lon, lat: p.lat }).then((img) => {
      if (img) plans.value = [...plans.value, img];
    });
  }
}
/** Bumped whenever the journey changes, so the view recomputes. */
const tick = ref(0);
props.travel.onChange = () => tick.value++;

const party = computed<LL>(() => (tick.value, props.travel.party()));
const route = computed<LL[]>(() => (tick.value, props.travel.ahead()));
const dest = computed<LL | null>(() => (tick.value, props.travel.dest));
const status = computed(() => {
  void tick.value;
  const t = props.travel;
  if (t.planning) return 'Finding the way…';
  if (!t.dest) return 'Click the map (or a place) to choose where to go.';
  if (!t.steps.length) return 'No way found.';
  const left = t.minutesLeft() / 60;
  const km = ((t.steps.length - t.i) * 96) / 1000;
  const eta = left < 1 ? `${Math.round(left * 60)} min` : `${left.toFixed(1)} h`;
  return `${t.destName || 'Destination'}: ${km.toFixed(1)} km, about ${eta}${t.partial ? ' this leg' : ''}`;
});
const running = computed(() => (tick.value, props.travel.running));

/** Clouds over what has not been discovered; dimmed what is out of sight. */
function fog(lon: number, lat: number): number {
  const g = props.travel.game;
  const p = props.travel.frame.fromLL(lon, lat);
  const tx = Math.floor(p[0] / TILE_M), ty = Math.floor(-p[1] / TILE_M);
  if (!g.discovery.known(tx, ty)) return 0;
  const dx = (tx - g.px) * TILE_M, dy = (ty - g.py) * TILE_M;
  const r = props.travel.sightM;
  return dx * dx + dy * dy <= r * r ? 2 : 1;
}
const fogVersion = computed(() => (tick.value, props.travel.game.discovery.version * 100000 + props.travel.game.px + props.travel.game.py));

let areaKey = '';
async function onView(box: { west: number; south: number; east: number; north: number; km: number }): Promise<void> {
  // Ask for a little more than the view, and only when it has moved enough to matter.
  const fine = box.km <= 40;
  const pad = (box.east - box.west) * 0.25;
  const q = { west: box.west - pad, south: box.south - pad, east: box.east + pad, north: box.north + pad };
  const step = fine ? 0.02 : 0.5;
  const key = [q.west, q.south, q.east, q.north].map((v) => Math.round(v / step)).join(',') + (fine ? 'f' : '');
  if (key === areaKey || box.km > 2000) return;
  areaKey = key;
  area.value = await props.requestArea(q, fine);
  if (fine) loadPlans(area.value);
}

function pick(ll: LL): void {
  const s = props.starts.find((x) => Math.abs(x.lon - ll[0]) < 1e-9 && Math.abs(x.lat - ll[1]) < 1e-9);
  const p = area.value?.places.find((x) => Math.abs(x.lon - ll[0]) < 1e-9 && Math.abs(x.lat - ll[1]) < 1e-9);
  // A settlement is entered by a gate; a lair or a point on the map is gone to directly.
  const site = s ? { id: s.id, name: s.name, tier: s.tier, lon: s.lon, lat: s.lat } : p && p.tier !== 'lair' ? { id: p.id, name: p.name, tier: p.tier, lon: p.lon, lat: p.lat } : undefined;
  void props.travel.setDest(ll, s?.name ?? p?.name ?? '', site);
}

function go(): void {
  if (props.travel.running) props.travel.stop();
  else {
    mapRef.value?.centreOnParty();
    props.travel.start();
  }
}

function onKey(e: KeyboardEvent): void {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
  if (e.code === 'Space' || e.code === 'Enter') go();
  else if (e.code === 'Escape') props.travel.stop();
  else if (e.code === 'KeyF') mapRef.value?.centreOnParty();
  else if (e.code === 'KeyZ') {
    props.travel.stop();
    emit('zoomIn');
  } else if (e.key === '+' || e.key === '=') level.value = Math.max(0, level.value - 1);
  else if (e.key === '-') level.value = Math.min(LEVELS.length - 1, level.value + 1);
  else return;
  e.preventDefault();
}

// Keys come from the play screen (engine/screens.ts sends them to the top screen only).
defineExpose({ key: onKey });
onBeforeUnmount(() => props.travel.stop());
</script>

<template>
  <div class="travelview">
    <WorldView
      ref="mapRef"
      class="travel-map"
      :starts="starts"
      :layer="layer"
      :request-tile="requestTile"
      :party="party"
      :route="route"
      :dest="dest"
      :area="area"
      :levels="LEVELS"
      :level="level"
      :follow="running"
      :fog="fog"
      :fog-version="fogVersion"
      :plans="plans"
      @pick="pick"
      @view="onView"
      @level="(i: number) => (level = i)"
    />
    <div class="travel-bar">
      <div class="row">
        <button v-for="(n, i) in LEVEL_NAMES" :key="n" :class="{ on: level === i }" @click="level = i">{{ n }}</button>
        <span class="sep" />
        <button v-for="l in (['fantasy', 'terrain', 'biomes'] as ViewLayer[])" :key="l" :class="{ on: layer === l }" @click="layer = l">{{ l[0].toUpperCase() + l.slice(1) }}</button>
      </div>
      <div class="status">{{ status }}</div>
      <div class="row">
        <button class="primary" :disabled="!travel.steps.length || travel.planning" @click="go">{{ running ? 'Stop' : 'Travel' }}</button>
        <select v-model.number="travel.speed" @change="tick++">
          <option v-for="(s, i) in SPEEDS" :key="s.label" :value="i">{{ s.label }}</option>
        </select>
        <label class="check"><input v-model="travel.stopAtDusk" type="checkbox" /> Stop at dusk</label>
        <button v-if="travel.dest" @click="travel.clear()">Clear</button>
        <span class="sep" />
        <button @click="mapRef?.centreOnParty()">Find party (F)</button>
        <button @click="emit('zoomIn')">Zoom in (Z)</button>
      </div>
    </div>
  </div>
</template>
