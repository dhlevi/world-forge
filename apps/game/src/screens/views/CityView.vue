<script setup lang="ts">
import { cap } from '../../util';
/**
 * The city view: the illustrated plan to pan (drag) and zoom (wheel), with the places of note
 * marked; the places by kind beside it, the chosen one's details, and the scene where the party
 * stands.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { CityScreen } from '../city';
import { KIND_NAMES, KIND_ORDER } from '../places';
import type { SitePlace } from '../../worker/protocol';
import { PACES } from '../stroll';

const props = defineProps<{ screen: CityScreen }>();
const screen = props.screen;
const ui = screen.state;
const site = screen.site;

const box = ref<HTMLDivElement>();
const cv = ref<HTMLCanvasElement>();
let W = 0, H = 0, dpr = 1;
/** View: the image point at the centre, and screen pixels per image pixel. */
let vx = 0, vy = 0, scale = 1;

const groups = computed(() => KIND_ORDER.map((k) => ({ kind: k, name: KIND_NAMES[k], list: site.places.filter((p) => p.kind === k) })).filter((g) => g.list.length));
const here = computed(() => screen.place(ui.at));
const goal = computed(() => screen.place(ui.walking));
const chosen = computed(() => screen.place(ui.selected));
const actions = computed(() => {
  void ui.at;
  void ui.scene;
  return screen.actions();
});

const COLOUR: Record<SitePlace['kind'], string> = {
  gate: '#7a2f22', market: '#c9902f', inn: '#8a5a2b', tavern: '#8a5a2b', temple: '#4f5f8a', keep: '#3f3126', civic: '#5f5040',
  guild: '#6a4a7a', shop: '#4f6a3a', dock: '#2f6a7a', district: '#806040',
};
const LETTER: Record<SitePlace['kind'], string> = { gate: 'G', market: 'M', inn: 'I', tavern: 'T', temple: '+', keep: 'K', civic: 'H', guild: 'g', shop: 's', dock: 'D', district: 'Q' };

function imgPt(lon: number, lat: number): [number, number] {
  const im = screen.image.value!;
  const w = im.bitmap.width, h = im.bitmap.height;
  return [((lon - im.west) / (im.east - im.west)) * w, ((im.north - lat) / (im.north - im.south)) * h];
}
const toScreen = (ix: number, iy: number): [number, number] => [W / 2 + (ix - vx) * scale, H / 2 + (iy - vy) * scale];

function fit(): void {
  const im = screen.image.value;
  if (!im) return;
  scale = Math.min(W / im.bitmap.width, H / im.bitmap.height) * 1.6;
  const at = here.value;
  [vx, vy] = at ? imgPt(at.lon, at.lat) : [im.bitmap.width / 2, im.bitmap.height / 2];
}

/**
 * The party's marker (docs/backlog.md, I3): a pennant on a pole over a gold token, drawn above the
 * places and their names. Standing at a place, it stands just beside the place's own mark.
 */
function drawParty(g: CanvasRenderingContext2D): void {
  const p = ui.pos ?? here.value;
  if (!p) return;
  let [x, y] = toScreen(...imgPt(p.lon, p.lat));
  if (!ui.pos) {
    x += 12;
    y += 9;
  }
  g.beginPath();
  g.ellipse(x, y + 3, 11, 4.5, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(20, 14, 8, 0.35)';
  g.fill();
  g.lineCap = 'round';
  g.strokeStyle = '#2a2018';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y - 36);
  g.stroke();
  g.beginPath();
  g.moveTo(x + 1, y - 36);
  g.lineTo(x + 21, y - 30);
  g.lineTo(x + 1, y - 23);
  g.closePath();
  g.fillStyle = '#b8322a';
  g.fill();
  g.lineWidth = 1.2;
  g.stroke();
  g.beginPath();
  g.arc(x, y, 7.5, 0, Math.PI * 2);
  g.fillStyle = '#e0b25c';
  g.fill();
  g.lineWidth = 2.5;
  g.strokeStyle = '#2a2018';
  g.stroke();
  g.beginPath();
  g.arc(x, y, 2.5, 0, Math.PI * 2);
  g.fillStyle = '#2a2018';
  g.fill();
  g.lineCap = 'butt';
}

/** The way being walked: a dashed line from the marker to the place. */
function drawWay(g: CanvasRenderingContext2D): void {
  const to = goal.value;
  if (!ui.pos || !to) return;
  const [ax, ay] = toScreen(...imgPt(ui.pos.lon, ui.pos.lat)), [bx, by] = toScreen(...imgPt(to.lon, to.lat));
  g.setLineDash([6, 5]);
  g.lineWidth = 2.5;
  g.strokeStyle = 'rgba(42, 32, 24, 0.75)';
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.stroke();
  g.setLineDash([]);
}

function draw(): void {
  const c = cv.value, im = screen.image.value;
  if (!c) return;
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#e9e0c6';
  g.fillRect(0, 0, W, H);
  if (!im) return;
  const [x0, y0] = toScreen(0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(im.bitmap, x0, y0, im.bitmap.width * scale, im.bitmap.height * scale);
  drawWay(g);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const p of site.places) {
    const [x, y] = toScreen(...imgPt(p.lon, p.lat));
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    const on = p.id === ui.selected, at = p.id === ui.at;
    const r = at ? 11 : on ? 10 : 8;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = COLOUR[p.kind];
    g.fill();
    g.lineWidth = at || on ? 3 : 1.5;
    g.strokeStyle = at ? '#e0b25c' : on ? '#ffffff' : '#f3ead2';
    g.stroke();
    g.fillStyle = '#f3ead2';
    g.font = `bold 11px Georgia, serif`;
    g.fillText(LETTER[p.kind], x, y + 0.5);
    if (on || at || scale > 1.4) {
      g.font = `${on || at ? 'bold ' : ''}12px 'Iowan Old Style', Georgia, serif`;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(243,234,210,0.92)';
      g.strokeText(p.name, x, y - r - 9);
      g.fillStyle = '#2a2018';
      g.fillText(p.name, x, y - r - 9);
    }
  }
  drawParty(g);
}

let frame = 0;
const redraw = () => {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    draw();
  });
};

function resize(): void {
  const b = box.value, c = cv.value;
  if (!b || !c) return;
  dpr = window.devicePixelRatio || 1;
  W = b.clientWidth;
  H = b.clientHeight;
  c.width = Math.round(W * dpr);
  c.height = Math.round(H * dpr);
  c.style.width = `${W}px`;
  c.style.height = `${H}px`;
  redraw();
}

// Dragging pans; a click without a drag chooses the nearest place.
let drag: { x: number; y: number; moved: boolean } | null = null;
function down(e: PointerEvent): void {
  drag = { x: e.clientX, y: e.clientY, moved: false };
  cv.value?.setPointerCapture(e.pointerId);
}
function move(e: PointerEvent): void {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
  vx -= dx / scale;
  vy -= dy / scale;
  drag.x = e.clientX;
  drag.y = e.clientY;
  redraw();
}
function up(e: PointerEvent): void {
  const d = drag;
  drag = null;
  if (!d || d.moved || !screen.image.value) return;
  const r = cv.value!.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  let best: SitePlace | null = null, bd = 18 * 18;
  for (const p of site.places) {
    const [x, y] = toScreen(...imgPt(p.lon, p.lat));
    const dd = (x - mx) ** 2 + (y - my) ** 2;
    if (dd < bd) {
      bd = dd;
      best = p;
    }
  }
  if (best) screen.select(best.id);
}
function wheel(e: WheelEvent): void {
  e.preventDefault();
  scale = Math.max(0.15, Math.min(6, scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
  redraw();
}

function centreOn(p: SitePlace | undefined): void {
  if (!p || !screen.image.value) return;
  [vx, vy] = imgPt(p.lon, p.lat);
  redraw();
}
function choose(p: SitePlace): void {
  screen.select(p.id);
  centreOn(p);
}

const ro = new ResizeObserver(() => resize());
onMounted(() => {
  ro.observe(box.value!);
  resize();
  if (screen.image.value) fit();
});
onBeforeUnmount(() => {
  ro.disconnect();
  if (frame) cancelAnimationFrame(frame);
});
watch(screen.image, () => {
  fit();
  redraw();
});
watch(() => [ui.selected, ui.at], () => redraw());
// The marker on the way: kept in view as it walks.
watch(() => ui.pos, (p) => {
  if (p && screen.image.value) {
    const [x, y] = toScreen(...imgPt(p.lon, p.lat));
    if (x < W * 0.12 || x > W * 0.88 || y < H * 0.12 || y > H * 0.88) [vx, vy] = imgPt(p.lon, p.lat);
  }
  redraw();
});
</script>

<template>
  <div class="city">
    <div ref="box" class="city-map">
      <canvas ref="cv" @pointerdown="down" @pointermove="move" @pointerup="up" @wheel="wheel" />
      <div v-if="ui.loading" class="city-wait">Drawing {{ site.name }}…</div>
      <div v-if="ui.arrival.length" class="city-arrive">
        <h3>{{ site.name }}</h3>
        <p v-for="(l, i) in ui.arrival" :key="i">{{ l }}</p>
        <div class="row"><button class="primary" @click="screen.dismiss()">Go on into {{ site.name }}</button></div>
      </div>
    </div>
    <aside class="city-panel">
      <h2>{{ site.name }}</h2>
      <div class="dim">{{ cap(site.tier) }} of {{ site.population.toLocaleString() }}<span v-if="site.walls">, walled</span><span v-if="site.quarters.length">; {{ site.quarters.map((q) => q.name).join(', ') }}</span></div>
      <section v-if="goal" class="city-here">
        <div class="cc-label">Walking to</div>
        <p><b>{{ goal.name }}</b>{{ screen.minutesTo(goal) >= 1 ? `, about ${screen.minutesTo(goal)} ${screen.minutesTo(goal) === 1 ? 'minute' : 'minutes'} more.` : ', close by now.' }}</p>
        <div class="city-pace">
          <span class="dim">Pace</span>
          <button v-for="p in PACES" :key="p.id" :class="{ primary: ui.pace === p.id }" @click="screen.setPace(p.id)">{{ p.label }}</button>
        </div>
        <div class="row"><button @click="screen.stop()">Stop here</button><button @click="screen.hurry()">Hurry on (skip)</button></div>
      </section>
      <section v-else-if="here" class="city-here">
        <div class="cc-label">You are at</div>
        <p v-for="(l, i) in ui.scene" :key="i">{{ l }}</p>
        <div class="city-acts">
          <button v-for="a in actions" :key="a.id" :disabled="!!a.disabled" :title="a.disabled" @click="screen.act(a.id)">{{ a.label }}</button>
        </div>
      </section>
      <section v-if="chosen && chosen.id !== ui.at && chosen.id !== ui.walking" class="city-chosen">
        <div class="cc-label">Chosen</div>
        <p><b>{{ chosen.name }}</b><span v-if="chosen.quarter" class="dim">, {{ chosen.quarter }}</span></p>
        <p class="dim">{{ chosen.about }} About {{ screen.minutesTo(chosen) }} minutes on foot.</p>
        <div class="row"><button class="primary" @click="screen.go(chosen.id)">Go there</button><button @click="centreOn(chosen)">Show on the plan</button></div>
      </section>
      <div class="city-list">
        <div v-for="g in groups" :key="g.kind">
          <div class="cc-label">{{ g.name }}</div>
          <div v-for="p in g.list" :key="p.id" class="city-place" :class="{ on: p.id === ui.selected, at: p.id === ui.at }" @click="choose(p)">
            <span>{{ p.name }}</span><span class="dim">{{ p.id === ui.at && !ui.walking ? 'here' : `${screen.minutesTo(p)} min` }}</span>
          </div>
        </div>
      </div>
      <div class="row city-foot"><button @click="screen.leaveTown()">Leave {{ site.name }}</button></div>
    </aside>
  </div>
</template>

<style scoped>
.city { position: fixed; inset: 0; display: grid; grid-template-columns: 1fr 360px; }
.city-map { position: relative; overflow: hidden; min-width: 0; }
.city-map canvas { display: block; cursor: grab; touch-action: none; }
.city-wait { position: absolute; left: 16px; top: 16px; background: rgba(21, 25, 34, 0.9); border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; }
.city-panel { background: var(--panel); border-left: 1px solid var(--line); padding: 14px; display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
.city-panel h2 { margin: 0; font-weight: 500; color: var(--accent); }
.city-panel p { margin: 2px 0; }
.cc-label { color: var(--dim); font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 6px; }
.city-here, .city-chosen { border-top: 1px solid var(--line); padding-top: 6px; }
.city-acts { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.city-acts button { text-align: left; padding: 4px 10px; }
.city-list { flex: 1; overflow: auto; border-top: 1px solid var(--line); padding-top: 4px; min-height: 80px; }
.city-place { display: flex; justify-content: space-between; gap: 8px; padding: 3px 6px; border-radius: 4px; cursor: pointer; font-size: 0.94em; }
.city-place:hover { background: #222836; }
.city-place.on { background: #2b2618; }
.city-place.at span:first-child { color: var(--accent); }
.city-pace { display: flex; align-items: center; gap: 4px; margin: 4px 0; }
.city-pace button { padding: 2px 8px; }
.city-arrive { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(520px, calc(100% - 32px)); max-height: calc(100% - 32px); overflow: auto; background: rgba(21, 25, 34, 0.96); border: 1px solid var(--line); border-radius: 8px; padding: 16px 18px; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45); }
.city-arrive h3 { margin: 0 0 8px; font-weight: 500; color: var(--accent); }
.city-arrive p { margin: 4px 0; line-height: 1.4; }
.city-arrive .row { margin-top: 12px; }
.city-foot { border-top: 1px solid var(--line); padding-top: 8px; }
@media (max-width: 900px) {
  .city { grid-template-columns: 1fr; grid-template-rows: 55vh 1fr; }
  .city-panel { border-left: none; border-top: 1px solid var(--line); }
}
</style>
