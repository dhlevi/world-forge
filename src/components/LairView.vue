<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { openLair } from '../store';
import { LAIR_CELL, lairMap } from '../lairs/lair';
import { type Ctx2D, drawLair } from '../lairs/render';
import { KIND_LABEL, lairTags } from '../lairs/view';

const PAPER = '#f3ead3';
const canvas = ref<HTMLCanvasElement>();
const stage = ref<HTMLDivElement>();
const grid = ref(true);
const marks = ref(true);
let observer: ResizeObserver | null = null;

const site = computed(() => openLair.value);
const map = computed(() => (site.value ? lairMap(site.value) : null));
const subtitle = computed(() => {
  const m = map.value;
  if (!m) return '';
  return `${KIND_LABEL[m.site.kind]} · ${lairTags(m.site)} · ${m.W} × ${m.H} m · grid squares 5 ft (${LAIR_CELL} m)`;
});

watch(site, () => {
  nextTick(draw);
  document.fonts?.load("italic 14px 'IM Fell English'").then(() => draw()).catch(() => {});
});
watch([grid, marks], draw);

function draw(): void {
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
  const margin = 40;
  const scale = Math.min((W - 2 * margin) / m.W, (H - 2 * margin) / m.H);
  const ox = (W - m.W * scale) / 2, oy = (H - m.H * scale) / 2;
  drawLair(g, m, { scale, ox, oy, grid: grid.value, labels: marks.value });
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
  // Ten squares (50 ft) or five, whichever fits.
  const n = 10 * LAIR_CELL * scale < 260 ? 10 : 5;
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
  const cv = canvas.value, m = map.value;
  if (!cv || !m) return;
  cv.toBlob((b) => {
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `${m.site.name.toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '')}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

function onKey(e: KeyboardEvent): void {
  if (site.value && e.key === 'Escape') leave();
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
  <div v-if="site" class="lair" role="dialog" aria-modal="true" :aria-label="site.name">
    <header>
      <div class="title">
        <h2>{{ site.name }}</h2>
        <p>{{ subtitle }}</p>
      </div>
      <div class="actions">
        <label class="chip"><input v-model="grid" type="checkbox" /> Grid</label>
        <label v-if="site.kind === 'cave'" class="chip"><input v-model="marks" type="checkbox" /> Entrances</label>
        <button @click="download">Download PNG</button>
        <button class="leave" @click="leave">Leave {{ site.kind }}</button>
      </div>
    </header>
    <div ref="stage" class="stage">
      <canvas ref="canvas" />
    </div>
  </div>
</template>

<style scoped>
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
.stage {
  position: relative;
  flex: 1;
  min-height: 0;
}
canvas {
  position: absolute;
  inset: 0;
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
}
</style>
