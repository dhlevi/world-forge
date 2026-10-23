<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { flyTarget, openDungeon, openLair, store, world } from '../store';
import { deepSite } from './under-style';
import { CELL_M, KIND_NAME } from '../dungeons/core';
import { dungeon, dungeonTags } from '../dungeons/view';
import { drawLevel, dungeonPage } from '../dungeons/render';

/**
 * A dungeon in the manner of the One Page Dungeon: the level's map with numbered rooms and, beside
 * it (below on narrow screens), the key: the hook, then each room's heading and description.
 * Tabs switch levels; clicking a stair, ladder or shaft goes to the level it leads to. The map
 * zooms (wheel, pinch or the buttons) and pans (drag); clicking a room in the key brings it into view.
 */
const PAPER = '#f3ead3';
const canvas = ref<HTMLCanvasElement>();
const stage = ref<HTMLDivElement>();
const grid = ref(true);
const marks = ref(true);
const level = ref(0);
let observer: ResizeObserver | null = null;
let linkSpots: { x: number; y: number; to: number }[] = [];
/** Zoom over the fitted view (1 = the whole level), and the pan in screen pixels. */
const zoom = ref(1);
const pan = ref({ x: 0, y: 0 });
const MAX_ZOOM = 8;
/** The fitted view's scale and origin, kept for turning screen points into map cells. */
let fit = { scale: 1, ox: 0, oy: 0 };

const site = computed(() => openDungeon.value);
const d = computed(() => (site.value ? dungeon(site.value) : null));
const L = computed(() => d.value?.levels[level.value] ?? null);
const rooms = computed(() => (L.value?.rooms ?? []).filter((r) => r.n));
const subtitle = computed(() => {
  const s = site.value, l = L.value;
  if (!s || !l) return '';
  const tags = dungeonTags(s);
  return `${KIND_NAME[s.kind]}${tags ? ` · ${tags}` : ''} · ${Math.round(l.W * CELL_M)} × ${Math.round(l.H * CELL_M)} m · squares 5 ft`;
});

watch(site, () => {
  // Open on the way in (the ground floor of a tower, not its cellar).
  level.value = Math.max(0, d.value?.levels.findIndex((l) => l.entrances.length) ?? 0);
  resetView();
  nextTick(draw);
  document.fonts?.load("italic 14px 'IM Fell English'").then(() => draw()).catch(() => {});
});
watch(level, resetView);
watch([grid, marks, level, zoom, pan], () => nextTick(draw), { deep: true });

function resetView(): void {
  zoom.value = 1;
  pan.value = { x: 0, y: 0 };
}

function draw(): void {
  const cv = canvas.value, st = stage.value, dd = d.value, lv = L.value;
  if (!cv || !st || !dd || !lv) return;
  const dpr = window.devicePixelRatio || 1;
  const W = st.clientWidth, H = st.clientHeight;
  if (!W || !H) return;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  cv.style.width = `${W}px`;
  cv.style.height = `${H}px`;
  const g = cv.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  const margin = 24;
  const base = Math.min((W - 2 * margin) / lv.W, (H - 2 * margin) / lv.H);
  fit = { scale: base, ox: (W - lv.W * base) / 2, oy: (H - lv.H * base) / 2 };
  // Zoomed about the middle of the stage, then panned.
  const scale = base * zoom.value;
  const ox = W / 2 - (W / 2 - fit.ox) * zoom.value + pan.value.x, oy = H / 2 - (H / 2 - fit.oy) * zoom.value + pan.value.y;
  drawLevel(g, dd, lv, { scale, ox, oy, grid: grid.value, labels: marks.value });
  g.strokeStyle = '#2b2420';
  g.lineWidth = 1.5;
  g.strokeRect(ox, oy, lv.W * scale, lv.H * scale);
  linkSpots = lv.links.filter((l) => l.to >= 0).map((l) => ({ x: ox + (l.x + 0.5) * scale, y: oy + (l.y + 0.5) * scale, to: l.to }));
}

function leave(): void {
  openDungeon.value = null;
}

function download(): void {
  const dd = d.value;
  if (!dd) return;
  const c = dungeonPage(dd, level.value, { grid: grid.value, labels: marks.value });
  c.toBlob((b) => {
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    const lv = dd.levels.length > 1 ? `-level-${level.value + 1}` : '';
    a.download = `${dd.title.toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '')}${lv}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

function onKey(e: KeyboardEvent): void {
  if (!site.value) return;
  const n = d.value?.levels.length ?? 1;
  if (e.key === 'Escape') leave();
  else if (e.key === 'ArrowRight' || e.key === 'PageDown') level.value = Math.min(n - 1, level.value + 1);
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') level.value = Math.max(0, level.value - 1);
}

function spotAt(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  return linkSpots.find((s) => Math.hypot(s.x - x, s.y - y) < Math.max(22, 10 * zoom.value));
}
function onCanvasClick(e: MouseEvent): void {
  // A drag is not a click.
  if (dragged) return;
  const hit = spotAt(e);
  if (hit) level.value = hit.to;
}
function onCanvasMove(e: MouseEvent): void {
  if (pointers.size) return;
  (e.currentTarget as HTMLElement).style.cursor = spotAt(e) ? 'pointer' : zoom.value > 1 ? 'grab' : '';
}

/** Zoom by `k` about a screen point (stage pixels), keeping that point of the map still. */
function zoomAt(k: number, px?: number, py?: number): void {
  const st = stage.value;
  if (!st) return;
  const W = st.clientWidth, H = st.clientHeight;
  const z0 = zoom.value, z1 = Math.max(1, Math.min(MAX_ZOOM, z0 * k));
  if (z1 === z0) return;
  const x = px ?? W / 2, y = py ?? H / 2;
  // The map point under (x, y) before and after must agree.
  const ox0 = W / 2 - (W / 2 - fit.ox) * z0 + pan.value.x, oy0 = H / 2 - (H / 2 - fit.oy) * z0 + pan.value.y;
  const mx = (x - ox0) / (fit.scale * z0), my = (y - oy0) / (fit.scale * z0);
  const ox1 = x - mx * fit.scale * z1, oy1 = y - my * fit.scale * z1;
  zoom.value = z1;
  pan.value = z1 === 1 ? { x: 0, y: 0 } : { x: ox1 - (W / 2 - (W / 2 - fit.ox) * z1), y: oy1 - (H / 2 - (H / 2 - fit.oy) * z1) };
}
function onWheel(e: WheelEvent): void {
  e.preventDefault();
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
}

// Dragging pans; two fingers pinch to zoom.
const pointers = new Map<number, { x: number; y: number }>();
let dragged = false;
let pinch0 = 0;
function onPointerDown(e: PointerEvent): void {
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  dragged = false;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
  }
}
function onPointerMove(e: PointerEvent): void {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  if (pointers.size === 2) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (pinch0 > 0) zoomAt(d / pinch0, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    pinch0 = d;
    dragged = true;
    return;
  }
  if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (zoom.value > 1) {
    pan.value = { x: pan.value.x + dx, y: pan.value.y + dy };
    (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
  }
}
function onPointerUp(e: PointerEvent): void {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch0 = 0;
}

/** Bring a room of the key into view, zoomed in on it. */
function showRoom(r: { x: number; y: number; w: number; h: number }): void {
  const st = stage.value;
  if (!st) return;
  const W = st.clientWidth, H = st.clientHeight;
  const z = Math.max(zoom.value, Math.min(MAX_ZOOM, 2.5));
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  // Where the room's centre would be at zoom z with no pan, moved to the middle of the stage.
  const ox = W / 2 - (W / 2 - fit.ox) * z, oy = H / 2 - (H / 2 - fit.oy) * z;
  zoom.value = z;
  pan.value = { x: W / 2 - (ox + cx * fit.scale * z), y: H / 2 - (oy + cy * fit.scale * z) };
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  observer = new ResizeObserver(draw);
  if (stage.value) observer.observe(stage.value);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  observer?.disconnect();
});
watch(stage, (el, old) => {
  if (old) observer?.unobserve(old);
  if (el) observer?.observe(el);
});

/** A delve's deep gate: its deep road down to a hall of the Underworld (opened on that layer). */
const deepGate = computed(() => {
  const s = site.value;
  const u = world.value?.raster.underworld;
  if (!s || s.kind !== 'delve' || !s.town || !u) return null;
  const e = u.entrances.find((x) => x.kind === 'delve' && x.sid === s.town);
  return e ? { node: e.node, name: u.nodes[e.node].name } : null;
});
function goDeepGate(): void {
  const u = world.value?.raster.underworld;
  const g = deepGate.value;
  if (!u || !g) return;
  openDungeon.value = null;
  store.layer = 'underworld';
  const n = u.nodes[g.node];
  flyTarget.value = { lon: n.lon, lat: n.lat, zoom: 6.5, name: n.name, t: performance.now() };
  openLair.value = deepSite(u, g.node);
}
</script>

<template>
  <div v-if="site && d" class="dungeon" role="dialog" aria-modal="true" :aria-label="d.title">
    <header>
      <div class="title">
        <h2>{{ d.title }}<span v-if="site?.en && site.en !== site.name" class="en">{{ site.en }}</span></h2>
        <p>{{ subtitle }}</p>
      </div>
      <div class="actions">
        <label class="chip"><input v-model="grid" type="checkbox" /> Grid</label>
        <label class="chip"><input v-model="marks" type="checkbox" /> Numbers</label>
        <span class="zoom" role="group" aria-label="Zoom">
          <button title="Zoom out" aria-label="Zoom out" :disabled="zoom <= 1" @click="zoomAt(1 / 1.5)">&minus;</button>
          <button title="Fit the whole level" @click="resetView">Fit</button>
          <button title="Zoom in" aria-label="Zoom in" :disabled="zoom >= MAX_ZOOM" @click="zoomAt(1.5)">+</button>
        </span>
        <button v-if="deepGate" :title="`The deep gate: down the deep road to ${deepGate.name}`" @click="goDeepGate">Deep gate ▸</button>
        <button @click="download">Download PNG</button>
        <button class="leave" @click="leave">Leave</button>
      </div>
    </header>
    <nav v-if="d.levels.length > 1" class="tabs" aria-label="Levels">
      <button v-for="(lv, k) in d.levels" :key="k" :class="{ active: k === level }" :aria-pressed="k === level" @click="level = k">
        {{ k + 1 }} · {{ lv.name }}
      </button>
    </nav>
    <div class="body">
      <div ref="stage" class="stage">
        <canvas
          ref="canvas" @click="onCanvasClick" @mousemove="onCanvasMove" @wheel="onWheel"
          @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp"
        />
      </div>
      <aside class="key">
        <p class="hook">{{ d.hook }}</p>
        <ol>
          <li v-for="r in rooms" :key="r.n" :value="r.n">
            <button class="room" :title="`Show room ${r.n} on the map`" @click="showRoom(r)"><strong>{{ r.name }}.</strong></button> {{ r.text }}
            <div v-for="(nt, k) in r.notes" :key="k" class="note" :class="nt.label.toLowerCase()"><em>{{ nt.label }}.</em> {{ nt.text }}</div>
          </li>
        </ol>
        <p v-if="!rooms.length" class="none">No numbered rooms on this level.</p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.dungeon {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  background: #f3ead3;
  color: #2b2420;
  font-family: 'IM Fell English', Georgia, 'Times New Roman', serif;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px 8px;
  flex-wrap: wrap;
  border-bottom: 1px solid rgba(43, 36, 32, 0.25);
}
h2 {
  margin: 0;
  font-size: 22px;
  font-weight: normal;
  font-style: italic;
}
h2 .en {
  margin-left: 10px;
  font-size: 15px;
  font-style: normal;
  opacity: 0.7;
}
h2::first-letter {
  text-transform: uppercase;
}
.title p {
  margin: 2px 0 0;
  font-size: 13px;
  opacity: 0.75;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
button,
.chip {
  font: inherit;
  font-size: 14px;
  padding: 6px 12px;
  border: 1px solid #2b2420;
  border-radius: 4px;
  background: #f8f1df;
  color: #2b2420;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
button:hover {
  background: #ebdfc2;
}
.leave {
  background: #2b2420;
  color: #f3ead3;
}
.leave:hover {
  background: #4a3d33;
}
.tabs {
  display: flex;
  gap: 4px;
  padding: 6px 16px;
  overflow-x: auto;
  border-bottom: 1px solid rgba(43, 36, 32, 0.25);
}
.tabs button {
  border-radius: 4px 4px 0 0;
  white-space: nowrap;
}
.tabs button.active {
  background: #2b2420;
  color: #f3ead3;
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.stage {
  position: relative;
  flex: 1;
  min-width: 0;
}
canvas {
  position: absolute;
  inset: 0;
  touch-action: none;
}
.zoom {
  display: inline-flex;
  gap: 2px;
}
.zoom button {
  min-width: 34px;
  justify-content: center;
}
.zoom button:disabled {
  opacity: 0.4;
  cursor: default;
}
button.room {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: inherit;
  display: inline;
  cursor: pointer;
  color: inherit;
  text-decoration: underline dotted rgba(43, 36, 32, 0.45);
}
button.room:hover {
  background: none;
  text-decoration-color: #2b2420;
}
.key {
  width: 340px;
  flex: none;
  overflow-y: auto;
  padding: 12px 18px 18px 8px;
  border-left: 1px solid rgba(43, 36, 32, 0.2);
  font-size: 14.5px;
  line-height: 1.35;
}
.hook {
  font-style: italic;
  margin: 0 0 10px;
}
ol {
  margin: 0;
  padding-left: 26px;
}
li {
  margin-bottom: 8px;
}
.note {
  margin-top: 3px;
  padding-left: 8px;
  border-left: 2px solid rgba(43, 36, 32, 0.25);
  font-size: 13.5px;
}
.note em {
  font-weight: bold;
}
.note.creature {
  border-left-color: #8a3b2e;
}
.note.trap,
.note.hazard {
  border-left-color: #b07a1f;
}
.note.treasure {
  border-left-color: #4f6b3a;
}
li::marker {
  font-weight: bold;
}
.none {
  opacity: 0.7;
}
@media (max-width: 768px) {
  header {
    padding: 10px 10px 6px;
  }
  h2 {
    font-size: 18px;
  }
  button,
  .chip {
    min-height: 44px;
  }
  .body {
    flex-direction: column;
  }
  .stage {
    flex: 1 1 55%;
    min-height: 0;
  }
  .key {
    width: auto;
    flex: 1 1 45%;
    border-left: none;
    border-top: 1px solid rgba(43, 36, 32, 0.2);
    padding: 10px 14px;
  }
}
</style>
