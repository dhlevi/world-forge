<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { flyTarget, openLair, openOrder, store, world } from '../store';
import { currentOrders } from './orders';
import { deepSite } from './under-style';
import type { DeepWay } from '../lairs/lair';
import { LAIR_CELL, lairMap } from '../lairs/lair';
import { type Ctx2D, drawLair, lairPage } from '../lairs/render';
import { KIND_LABEL, lairTags } from '../lairs/view';
import { usePanZoom } from './pan-zoom';

const PAPER = '#f3ead3';
const canvas = ref<HTMLCanvasElement>();
const stage = ref<HTMLDivElement>();
const grid = ref(true);
const marks = ref(true);
let observer: ResizeObserver | null = null;
/** Zoom (1 = the whole map) and pan: the wheel, a pinch, dragging, the buttons and keys. */
const pz = usePanZoom(stage);
const { zoom, pan, maxZoom: MAX_ZOOM, zoomAt, onWheel, onPointerDown, onPointerMove, onPointerUp } = pz;

const site = computed(() => openLair.value);
/** A druid circle's grove: the circle (lore/orders.ts). */
const order = computed(() => (site.value?.order ? currentOrders().find((o) => o.key === site.value!.order) ?? null : null));
const top = computed(() => (site.value ? lairMap(site.value) : null));
/** The level shown (caves of several levels have a tab per level). */
const level = ref(0);
const map = computed(() => top.value?.levels[level.value] ?? top.value);
const levelTabs = computed(() => (top.value?.levels.length ?? 1) > 1
  ? top.value!.levels.map((lv, k) => lv.levelName ?? (k === 0 ? 'Level 1 · entrance' : `Level ${k + 1}`)) : []);
/** Groves have a numbered key (rooms on every level, listed for the level shown). */
const keyed = computed(() => !!top.value?.levels.some((lv) => lv.rooms.length) || !!top.value?.rooms.length);
/** Screen positions of the ways between levels, for clicking through. */
let linkSpots: { x: number; y: number; to: number }[] = [];
/** Places that lead elsewhere (a cavern's tunnels and shafts, a deep cave's way down), on screen. */
let gotoSpots: { x: number; y: number; r: number; to: DeepWay }[] = [];
const subtitle = computed(() => {
  const m = map.value;
  if (!m) return '';
  const lv = m.levels.length > 1 ? ` · ${m.levelName ?? `level ${m.level + 1} of ${m.levels.length}`}` : '';
  const kind = m.site.kind === 'glade' && keyed.value ? 'Grove' : m.site.kind === 'deep' ? 'The Underworld' : KIND_LABEL[m.site.kind];
  return `${kind} · ${lairTags(m.site)}${lv} · ${m.W} × ${m.H} m · grid squares 5 ft (${LAIR_CELL} m)`;
});

watch(site, () => {
  level.value = 0;
  pz.reset();
  nextTick(() => draw());
  document.fonts?.load("italic 14px 'IM Fell English'").then(() => draw()).catch(() => {});
});
watch(level, () => pz.reset());
watch([grid, marks, level, zoom, pan], () => nextTick(() => draw()), { deep: true });

/** Draws the map at the zoom and pan (or, with `whole`, the whole map, for a download). */
function draw(whole = false): void {
  const cv = canvas.value, st = stage.value, m = map.value;
  if (!cv || !st || !m) return;
  const dpr = window.devicePixelRatio || 1;
  const W = st.clientWidth, H = st.clientHeight;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  cv.style.width = `${W}px`;
  cv.style.height = `${H}px`;
  const g = cv.getContext('2d') as Ctx2D;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  if (!W || !H) return;
  const margin = 40;
  const base = Math.min((W - 2 * margin) / m.W, (H - 2 * margin) / m.H);
  const fit = { scale: base, ox: (W - m.W * base) / 2, oy: (H - m.H * base) / 2 };
  const { scale, ox, oy } = whole ? fit : pz.view(fit);
  drawLair(g, m, { scale, ox, oy, grid: grid.value, labels: marks.value });
  linkSpots = m.site.kind === 'deep' ? [] : m.links.map((l) => ({ x: ox + l.p[0] * scale, y: oy + l.p[1] * scale, to: l.to }));
  gotoSpots = (m.gotos ?? []).map((q) => ({ x: ox + q.p[0] * scale, y: oy + q.p[1] * scale, r: Math.max(18, q.r * scale), to: q.to }));
  // A thin frame, a north arrow (the map is north-up) and a scale bar.
  g.strokeStyle = '#2b2420';
  g.lineWidth = 1.5;
  g.strokeRect(ox, oy, m.W * scale, m.H * scale);
  drawNorth(g, W - 34, 34);
  drawScale(g, scale, 22, H - 16);
}

function drawNorth(g: Ctx2D, x: number, y: number): void {
  g.save();
  g.fillStyle = '#2b2420';
  g.beginPath();
  g.moveTo(x, y - 14);
  g.lineTo(x + 6, y + 6);
  g.lineTo(x, y + 2);
  g.lineTo(x - 6, y + 6);
  g.closePath();
  g.fill();
  g.font = "italic 13px 'IM Fell English', Georgia, serif";
  g.textAlign = 'center';
  g.fillText('N', x, y + 20);
  g.restore();
}

function drawScale(g: Ctx2D, scale: number, x: number, y: number): void {
  // Ten squares (50 ft) or the most of five, two or one that fits (fewer as the map is zoomed in).
  const n = [10, 5, 2, 1].find((k) => k * LAIR_CELL * scale <= 260) ?? 1;
  const len = n * LAIR_CELL * scale;
  g.save();
  g.strokeStyle = '#2b2420';
  g.fillStyle = '#2b2420';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x, y - 4);
  g.lineTo(x, y);
  g.lineTo(x + len, y);
  g.lineTo(x + len, y - 4);
  g.stroke();
  g.font = "italic 12px 'IM Fell English', Georgia, serif";
  g.textBaseline = 'bottom';
  g.fillText(`${n * 5} ft · ${n * LAIR_CELL} m`, x + len + 8, y + 2);
  g.restore();
}

function leave(): void {
  openLair.value = null;
}

function download(): void {
  const m = map.value;
  // A map without a key saves what the stage shows, as a whole (the bitmap is copied at once).
  if (m && !keyed.value) draw(true);
  const cv = m && keyed.value ? lairPage(m, { grid: grid.value, labels: marks.value, subtitle: subtitle.value }) : canvas.value;
  if (!cv || !m) return;
  cv.toBlob((b) => {
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    const lv = m.levels.length > 1 ? `-level-${m.level + 1}` : '';
    a.download = `${m.site.name.toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '')}${lv}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  if (!keyed.value) draw();
}

function onKey(e: KeyboardEvent): void {
  if (!site.value) return;
  const n = top.value?.levels.length ?? 1;
  if (e.key === 'Escape') leave();
  else if (pz.onZoomKey(e)) return;
  else if (e.key === 'ArrowRight' || e.key === 'PageDown') level.value = Math.min(n - 1, level.value + 1);
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') level.value = Math.max(0, level.value - 1);
}

/**
 * Goes where a way leads: another cavern of the Underworld (its map opens, on the Underworld
 * layer), or up to the surface (the map flies there on the surface layer).
 */
function goWay(to: DeepWay): void {
  const u = world.value?.raster.underworld;
  if (to.node !== undefined && u) {
    if (store.layer !== 'underworld') store.layer = 'underworld';
    const n = u.nodes[to.node];
    flyTarget.value = { lon: n.lon, lat: n.lat, zoom: 6.5, name: to.name, t: performance.now() };
    openLair.value = deepSite(u, to.node);
    return;
  }
  if (to.lon !== undefined && to.lat !== undefined) {
    if (store.layer === 'underworld') store.layer = 'fantasy';
    openLair.value = null;
    flyTarget.value = { lon: to.lon, lat: to.lat, zoom: 12.5, name: to.name, t: performance.now() };
  }
}

/** Clicking a way up or down goes to that level; clicking a way elsewhere goes there. */
function onCanvasClick(e: MouseEvent): void {
  // A drag is not a click.
  if (pz.wasDrag()) return;
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const go = gotoSpots.find((s) => Math.hypot(s.x - x, s.y - y) < s.r);
  if (go) {
    goWay(go.to);
    return;
  }
  const hit = linkSpots.find((s) => Math.hypot(s.x - x, s.y - y) < linkR());
  if (hit) level.value = hit.to;
}

/** How near a way between levels a click must fall (the ways grow as the map is zoomed in). */
const linkR = () => Math.max(22, 10 * zoom.value);

function onCanvasMove(e: MouseEvent): void {
  if (pz.busy()) return;
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const el = e.currentTarget as HTMLElement;
  const go = gotoSpots.find((s) => Math.hypot(s.x - x, s.y - y) < s.r);
  el.style.cursor = pz.cursor(!!go || linkSpots.some((s) => Math.hypot(s.x - x, s.y - y) < linkR()));
  el.title = go ? (go.to.node !== undefined ? `Go to ${go.to.name}` : `Up to the surface at ${go.to.name}`) : '';
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  observer = new ResizeObserver(() => draw());
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
</script>

<template>
  <div v-if="site" class="lair" role="dialog" aria-modal="true" :aria-label="site.name">
    <header>
      <div class="title">
        <h2>{{ site.name }}<span v-if="site.en && site.en !== site.name" class="en">{{ site.en }}</span></h2>
        <p>{{ subtitle }}</p>
      </div>
      <div class="actions">
        <label class="chip"><input v-model="grid" type="checkbox" /> Grid</label>
        <label class="chip"><input v-model="marks" type="checkbox" /> Labels</label>
        <span class="zoom" role="group" aria-label="Zoom">
          <button title="Zoom out (-)" aria-label="Zoom out" :disabled="zoom <= 1" @click="zoomAt(1 / 1.5)">&minus;</button>
          <button title="Fit the whole map (0)" @click="pz.reset()">Fit</button>
          <button title="Zoom in (+)" aria-label="Zoom in" :disabled="zoom >= MAX_ZOOM" @click="zoomAt(1.5)">+</button>
        </span>
        <button v-if="order" :title="`Open the window of ${order.en}`" @click="openOrder = order.key; leave()">Order ▸</button>
        <button @click="download">Download PNG</button>
        <button class="leave" @click="leave">Leave {{ site.kind === 'glade' ? 'grove' : site.kind === 'deep' ? 'cavern' : site.kind }}</button>
      </div>
    </header>
    <nav v-if="levelTabs.length" class="tabs" aria-label="Levels">
      <button v-for="(t, k) in levelTabs" :key="k" :class="{ active: k === level }" :aria-pressed="k === level" @click="level = k">{{ t }}</button>
    </nav>
    <div class="body">
      <div ref="stage" class="stage">
        <canvas
          ref="canvas" @click="onCanvasClick" @mousemove="onCanvasMove" @wheel="onWheel"
          @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp"
        />
      </div>
      <aside v-if="keyed && map" class="key">
        <p v-if="top?.hook" class="hook">{{ top.hook }}</p>
        <ol>
          <li v-for="r in map.rooms" :key="r.n" :value="r.n">
            <strong>{{ r.name }}.</strong> {{ r.text }}
            <div v-for="(nt, k) in r.notes ?? []" :key="k" class="note" :class="nt.label.toLowerCase()"><em>{{ nt.label }}.</em> {{ nt.text }}</div>
          </li>
        </ol>
      </aside>
    </div>
  </div>
</template>

<style scoped>
h2 .en {
  margin-left: 10px;
  font-size: 15px;
  font-style: normal;
  opacity: 0.7;
}
.lair {
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
.key {
  width: 320px;
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
    flex: 1 1 60%;
    min-height: 0;
  }
  .key {
    width: auto;
    flex: 1 1 40%;
    border-left: none;
    border-top: 1px solid rgba(43, 36, 32, 0.2);
    padding: 10px 14px;
  }
}
</style>
