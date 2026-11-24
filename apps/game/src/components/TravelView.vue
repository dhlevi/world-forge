<script setup lang="ts">
/**
 * The travel map: the world around the party at three fixed scales, with roads, places and the
 * route; choose a destination, travel with the clock running, stop, or zoom in to the local map.
 */
import { background } from '../app/errors';
import { cap } from '../util';
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import WorldView from './WorldView.vue';
import { SPEEDS, type LL, type Travel } from '../game/travel';
import { TILE_M } from '@worldforge/core/local/chunk';
import type { PlanImage, StartSite, TravelArea, ViewLayer } from '../worker/protocol';
import type { Actor } from '../actors/actor';
import { whyNoRaft } from '../rules/crossing';
import type { Hunting } from '../game/hunt';

const props = defineProps<{
  travel: Travel;
  starts: StartSite[];
  /** How dark it is (0 day to 1 night), to dim the map. */
  dark?: number;
  requestTile: (z: number, x: number, y: number, layer: ViewLayer) => Promise<ImageBitmap | null>;
  requestArea: (box: { west: number; south: number; east: number; north: number }, fine: boolean) => Promise<TravelArea>;
  requestPlan: (id: string, o: { mpp: number; radius: number; illustrated: boolean; lon?: number; lat?: number }) => Promise<PlanImage | null>;
  /** The wanderer (what they carry decides whether a raft can be built). */
  player?: Actor | null;
  /** Hunting: signs of game found, Hunt, taking up a trail (game/hunt.ts). */
  hunt?: Hunting | null;
}>();
/** The journey (game/travel.ts): the game's own object, driven from here, not data a parent view owns. */
const journey = props.travel;
const emit = defineEmits<{ zoomIn: []; camp: [] }>();

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
    background(props.requestPlan(p.id, { mpp: p.tier === 'village' ? 2 : 4, radius: p.radiusM * 1.05, illustrated: false, lon: p.lon, lat: p.lat }).then((img) => {
      if (img) plans.value = [...plans.value, img];
    }), 'the travel map');
  }
}
/** Bumped whenever the journey changes, so the view recomputes. */
const tick = ref(0);
journey.onChange = () => tick.value++;

const party = computed<LL>(() => (tick.value, journey.party()));
const route = computed<LL[]>(() => (tick.value, journey.ahead()));
/** At the bank of a deep river (backlog T3), and why a raft cannot be built there, if not. */
const atRiver = computed(() => (tick.value, journey.atRiver));
/** Signs of game marked, and the one chosen (game/hunt.ts). */
const signs = computed(() => (tick.value, props.hunt?.live().map((x) => ({ id: x.id, lon: x.lon, lat: x.lat })) ?? []));
const signId = ref('');
const sign = computed(() => (tick.value, props.hunt?.live().find((x) => x.id === signId.value) ?? null));
function search(): void {
  if (props.hunt) background(props.hunt.search(), 'the hunt');
}
function takeUp(): void {
  if (props.hunt && sign.value) props.hunt.takeUp(sign.value);
  tick.value++;
}
const noRaft = computed(() => {
  void tick.value;
  const st = journey.steps[journey.i], a = props.player;
  return st && a ? whyNoRaft(a, st.biome) : null;
});
const dest = computed<LL | null>(() => (tick.value, journey.dest));
const status = computed(() => {
  void tick.value;
  const t = journey;
  if (t.planning) return 'Finding the way…';
  if (!t.dest) return 'Click the map (or a place) to choose where to go.';
  if (!t.steps.length) return 'No way found.';
  const left = t.minutesLeft() / 60;
  const km = ((t.steps.length - t.i) * 96) / 1000;
  const eta = left < 1 ? `${Math.round(left * 60)} min` : `${left.toFixed(1)} h`;
  return `${t.destName || 'Destination'}: ${km.toFixed(1)} km, about ${eta}${t.partial ? ' this leg' : ''}`;
});
const running = computed(() => (tick.value, journey.running));

/** Clouds over what has not been discovered; dimmed what is out of sight. */
function fog(lon: number, lat: number): number {
  const g = journey.game;
  const p = journey.frame.fromLL(lon, lat);
  const tx = Math.floor(p[0] / TILE_M), ty = Math.floor(-p[1] / TILE_M);
  if (!g.discovery.known(tx, ty)) return 0;
  const dx = (tx - g.px) * TILE_M, dy = (ty - g.py) * TILE_M;
  const r = journey.sightM;
  return dx * dx + dy * dy <= r * r ? 2 : 1;
}
/**
 * A road is seen further than the land about it (docs/backlog.md, W8): within half again the
 * sight, and at least 1.5 km, of the party, even where the land is not yet discovered.
 */
function roadSeen(lon: number, lat: number): boolean {
  const g = journey.game;
  const p = journey.frame.fromLL(lon, lat);
  const dx = p[0] / TILE_M - g.px - 0.5, dy = -p[1] / TILE_M - g.py - 0.5;
  const r = Math.max(1500, journey.sightM * 1.5) / TILE_M;
  return dx * dx + dy * dy <= r * r;
}
const fogVersion = computed(() => (tick.value, journey.game.discovery.version * 100000 + journey.game.px + journey.game.py));

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
  background(journey.setDest(ll, s?.name ?? p?.name ?? '', site), 'the travel map');
}

/** The route's choices changed: find the way again. */
function replan(): void {
  tick.value++;
  background(journey.replan(), 'the travel map');
}

function go(): void {
  if (journey.running) journey.stop();
  else {
    mapRef.value?.centreOnParty();
    journey.start();
  }
}

function onKey(e: KeyboardEvent): void {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
  if (e.code === 'Space' || e.code === 'Enter') go();
  else if (e.code === 'Escape') journey.stop();
  else if (e.code === 'KeyF') mapRef.value?.centreOnParty();
  else if (e.code === 'KeyZ') {
    journey.stop();
    emit('zoomIn');
  } else if (e.key === '+' || e.key === '=') level.value = Math.max(0, level.value - 1);
  else if (e.key === '-') level.value = Math.min(LEVELS.length - 1, level.value + 1);
  else return;
  e.preventDefault();
}

// Keys come from the play screen (engine/screens.ts sends them to the top screen only).
defineExpose({ key: onKey });
onBeforeUnmount(() => journey.stop());
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
      :road-seen="roadSeen"
      :level="level"
      :follow="running"
      :fog="fog"
      :fog-version="fogVersion"
      :plans="plans"
      :signs="signs"
      :sign="signId"
      @sign="(id: string) => (signId = id)"
      @pick="pick"
      @view="onView"
      @level="(i: number) => (level = i)"
    />
    <div class="night" :style="{ opacity: Math.max(0, Math.min(0.7, ((dark ?? 0) - 0.35) * 1.1)) }" />
    <div class="travel-dock">
      <!-- What sits above the bar (the log). -->
      <slot />
      <div class="travel-bar">
        <div class="row">
          <button v-for="(n, i) in LEVEL_NAMES" :key="n" :class="{ on: level === i }" @click="level = i">{{ n }}</button>
          <span class="sep" />
          <button v-for="l in (['fantasy', 'terrain', 'biomes'] as ViewLayer[])" :key="l" :class="{ on: layer === l }" @click="layer = l">{{ l[0].toUpperCase() + l.slice(1) }}</button>
        </div>
        <div class="status">{{ status }}</div>
        <div v-if="sign && hunt" class="row river">
          <span>{{ cap(hunt.signWords(sign)) }}, {{ (hunt.metresTo(sign) / 1000).toFixed(1) }} km off.</span>
          <button @click="takeUp">{{ hunt.metresTo(sign) <= 400 ? 'Take up the trail' : 'Go there' }}</button>
          <button @click="signId = ''">Close</button>
        </div>
        <div v-if="atRiver" class="row river">
          <span>A deep river bars the way.</span>
          <button @click="journey.cross('swim')">Swim across</button>
          <button :disabled="!!noRaft" :title="noRaft ?? 'About two hours with an axe or hatchet; rope helps'" @click="journey.cross('raft')">Build a raft (about 2 h)</button>
        </div>
        <div class="row">
          <button class="primary" :disabled="!journey.steps.length || journey.planning" @click="go">{{ running ? 'Stop' : 'Travel' }}</button>
          <select v-model.number="journey.speed" @change="tick++">
            <option v-for="(s, i) in SPEEDS" :key="s.label" :value="i">{{ s.label }}</option>
          </select>
          <label class="check"><input v-model="journey.stopAtDusk" type="checkbox" /> Stop at dusk</label>
          <select v-model="journey.routeMode" title="How the way is chosen" @change="replan">
            <option value="fastest">Fastest</option>
            <option value="direct">Direct</option>
            <option value="roads">Keep to roads</option>
          </select>
          <label class="check" title="Go round rivers to be forded where there is a way, and never swim one"><input v-model="journey.avoidFords" type="checkbox" @change="replan" /> Avoid rivers</label>
          <button v-if="journey.dest" @click="journey.clear()">Clear</button>
          <span class="sep" />
          <button @click="mapRef?.centreOnParty()">Find party (F)</button>
          <button @click="emit('zoomIn')">Zoom in (Z)</button>
          <button @click="journey.stop(); emit('camp')">Camp (Shift+C)</button>
          <button v-if="hunt" title="Spend an hour searching the country about for signs of game (Tracking)" @click="journey.stop(); search()">Hunt (an hour)</button>
        </div>
      </div>
    </div>
  </div>
</template>
