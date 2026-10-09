<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { openBuilding } from '../store';
import { CELL_M } from '../interiors/dwelling';
import { type Ctx2D, PAPER, drawExterior, drawPlan } from '../interiors/render';

const canvas = ref<HTMLCanvasElement>();
const stage = ref<HTMLDivElement>();
/** Index into the floors, or -1 for the exterior. */
const tab = ref(0);
const labels = ref(true);
const grid = ref(true);
let observer: ResizeObserver | null = null;

const view = computed(() => openBuilding.value);
const d = computed(() => view.value?.d ?? null);
const tabs = computed(() => [
  ...(d.value?.floors.map((f, i) => ({ id: i, label: f.name })) ?? []),
  { id: -1, label: 'Exterior' },
]);
const subtitle = computed(() => {
  if (!d.value) return '';
  const w = d.value.nx * d.value.cw, h = d.value.ny * d.value.ch;
  const st = d.value.storeys === 1 ? '1 storey' : `${d.value.storeys} storeys`;
  return `${view.value!.place} · ${st} · ${w.toFixed(0)} × ${h.toFixed(0)} m · grid squares 5 ft (${CELL_M} m)`;
});

watch(view, (v) => {
  if (v) tab.value = v.d.ground;
  nextTick(draw);
  // Redraw once the lettering font has loaded (the canvas can't wait for it on its own).
  document.fonts?.load("italic 14px 'IM Fell English'").then(() => draw()).catch(() => {});
});
watch([tab, labels, grid], draw);

function draw(): void {
  const cv = canvas.value, st = stage.value, dw = d.value;
  if (!cv || !st || !dw) return;
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
  if (tab.value < 0) {
    drawExterior(g, dw, { width: W, height: H });
    return;
  }
  const m = 48;
  const scale = Math.min(64, (W - 2 * m) / (dw.nx * dw.cw), (H - 2 * m) / (dw.ny * dw.ch));
  const ox = (W - dw.nx * dw.cw * scale) / 2, oy = (H - dw.ny * dw.ch * scale) / 2;
  drawPlan(g, dw, tab.value, { scale, ox, oy, labels: labels.value, grid: grid.value });
  drawCompass(g, dw.eu, dw.ev, W - 40, 40);
  drawScaleBar(g, scale, 24, H - 24);
}

/** North arrow: the plan is turned so the street front is at the bottom. */
function drawCompass(g: Ctx2D, eu: [number, number], ev: [number, number], x: number, y: number): void {
  // North (0, 1) in the local frame, expressed in plan (u right, v down) coordinates.
  const nu = eu[1], nv = ev[1];
  const l = Math.hypot(nu, nv) || 1;
  const dx = nu / l, dy = nv / l;
  g.save();
  g.strokeStyle = '#2b2420';
  g.fillStyle = '#2b2420';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x - dx * 16, y - dy * 16);
  g.lineTo(x + dx * 16, y + dy * 16);
  g.stroke();
  g.beginPath();
  g.moveTo(x + dx * 18, y + dy * 18);
  g.lineTo(x + dx * 8 - dy * 6, y + dy * 8 + dx * 6);
  g.lineTo(x + dx * 8 + dy * 6, y + dy * 8 - dx * 6);
  g.closePath();
  g.fill();
  g.font = "italic 13px 'IM Fell English', Georgia, serif";
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('N', x + dx * 28, y + dy * 28);
  g.restore();
}

function drawScaleBar(g: Ctx2D, scale: number, x: number, y: number): void {
  const metres = 3 * CELL_M;
  g.save();
  g.strokeStyle = '#2b2420';
  g.fillStyle = '#2b2420';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x, y - 4);
  g.lineTo(x, y);
  g.lineTo(x + metres * scale, y);
  g.lineTo(x + metres * scale, y - 4);
  for (let k = 1; k < 3; k++) {
    g.moveTo(x + k * CELL_M * scale, y);
    g.lineTo(x + k * CELL_M * scale, y - 3);
  }
  g.stroke();
  g.font = "italic 12px 'IM Fell English', Georgia, serif";
  g.textBaseline = 'bottom';
  g.fillText(`${metres} m · 15 ft`, x + metres * scale + 8, y + 2);
  g.restore();
}

function leave(): void {
  openBuilding.value = null;
}

function download(): void {
  const cv = canvas.value;
  if (!cv || !d.value) return;
  const name = tab.value < 0 ? 'exterior' : d.value.floors[tab.value].name.toLowerCase().replace(/\s+/g, '-');
  cv.toBlob((b) => {
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `${d.value!.label.toLowerCase().replace(/\W+/g, '-')}-${name}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

function onKey(e: KeyboardEvent): void {
  if (!view.value) return;
  const ids = tabs.value.map((t) => t.id);
  const at = ids.indexOf(tab.value);
  if (e.key === 'Escape') leave();
  else if (e.key === 'ArrowRight' || e.key === 'PageUp') tab.value = ids[Math.min(ids.length - 1, at + 1)];
  else if (e.key === 'ArrowLeft' || e.key === 'PageDown') tab.value = ids[Math.max(0, at - 1)];
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
  <div v-if="view" class="dwelling" role="dialog" aria-modal="true" :aria-label="view.d.label">
    <header>
      <div class="title">
        <h2>{{ view.d.title ? `${view.d.title}` : view.d.label }}<span v-if="view.d.title" class="kind"> · {{ view.d.label }}</span></h2>
        <p>{{ subtitle }}</p>
      </div>
      <div class="actions">
        <label class="chip"><input v-model="labels" type="checkbox" /> Labels</label>
        <label class="chip"><input v-model="grid" type="checkbox" /> Grid</label>
        <button @click="download">Download PNG</button>
        <button class="leave" @click="leave">Leave building</button>
      </div>
    </header>
    <nav class="tabs" aria-label="Floors">
      <button
        v-for="t in tabs" :key="t.id" :class="{ active: t.id === tab }" :aria-pressed="t.id === tab" @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </nav>
    <div ref="stage" class="stage">
      <canvas ref="canvas" />
    </div>
  </div>
</template>

<style scoped>
.dwelling {
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
  padding: 12px 16px 6px;
  flex-wrap: wrap;
}
h2 {
  margin: 0;
  font-size: 22px;
  font-weight: normal;
  font-style: italic;
}
.kind {
  font-size: 15px;
  opacity: 0.7;
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
    padding: 10px 10px 4px;
  }
  h2 {
    font-size: 18px;
  }
  button,
  .chip {
    min-height: 44px;
  }
  .tabs {
    padding: 6px 10px;
  }
}
</style>
