<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { openDungeon } from '../store';
import { CELL_M, KIND_NAME } from '../dungeons/core';
import { dungeon, dungeonTags } from '../dungeons/view';
import { drawLevel, dungeonPage } from '../dungeons/render';

/**
 * A dungeon in the manner of the One Page Dungeon: the level's map with numbered rooms and, beside
 * it (below on narrow screens), the key: the hook, then each room's heading and description.
 * Tabs switch levels; clicking a stair, ladder or shaft goes to the level it leads to.
 */
const PAPER = '#f3ead3';
const canvas = ref<HTMLCanvasElement>();
const stage = ref<HTMLDivElement>();
const grid = ref(true);
const marks = ref(true);
const level = ref(0);
let observer: ResizeObserver | null = null;
let linkSpots: { x: number; y: number; to: number }[] = [];

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
  nextTick(draw);
  document.fonts?.load("italic 14px 'IM Fell English'").then(() => draw()).catch(() => {});
});
watch([grid, marks, level], () => nextTick(draw));

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
  const scale = Math.min((W - 2 * margin) / lv.W, (H - 2 * margin) / lv.H);
  const ox = (W - lv.W * scale) / 2, oy = (H - lv.H * scale) / 2;
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
  return linkSpots.find((s) => Math.hypot(s.x - x, s.y - y) < 22);
}
function onCanvasClick(e: MouseEvent): void {
  const hit = spotAt(e);
  if (hit) level.value = hit.to;
}
function onCanvasMove(e: MouseEvent): void {
  (e.currentTarget as HTMLElement).style.cursor = spotAt(e) ? 'pointer' : '';
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
</script>

<template>
  <div v-if="site && d" class="dungeon" role="dialog" aria-modal="true" :aria-label="d.title">
    <header>
      <div class="title">
        <h2>{{ d.title }}</h2>
        <p>{{ subtitle }}</p>
      </div>
      <div class="actions">
        <label class="chip"><input v-model="grid" type="checkbox" /> Grid</label>
        <label class="chip"><input v-model="marks" type="checkbox" /> Numbers</label>
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
        <canvas ref="canvas" @click="onCanvasClick" @mousemove="onCanvasMove" />
      </div>
      <aside class="key">
        <p class="hook">{{ d.hook }}</p>
        <ol>
          <li v-for="r in rooms" :key="r.n" :value="r.n">
            <strong>{{ r.name }}.</strong> {{ r.text }}
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
