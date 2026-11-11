<script setup lang="ts">
/**
 * The world before play begins: a map of the whole generated world, drawn tile by tile by the
 * core's renderer in the worker (the atlas's styles), to pan and zoom, with its cities and towns
 * marked. Clicking a place chooses where to begin.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { StartSite, ViewLayer } from '../worker/protocol';

const props = defineProps<{
  starts: StartSite[];
  chosen: string;
  layer: ViewLayer;
  requestTile: (z: number, x: number, y: number, layer: ViewLayer) => Promise<ImageBitmap | null>;
}>();
const emit = defineEmits<{ choose: [id: string] }>();

const box = ref<HTMLDivElement>();
const cv = ref<HTMLCanvasElement>();
const hover = ref<StartSite | null>(null);
const TILE = 256, MIN_Z = 1, MAX_Z = 9;

/** View: the centre in Web Mercator units (0 to 1) and a fractional zoom. */
let cx = 0.5, cy = 0.5, zoom = 2;
let W = 0, H = 0, dpr = 1;
const cache = new Map<string, ImageBitmap | 'pending'>();
let queue: { key: string; z: number; x: number; y: number; layer: ViewLayer }[] = [];
let inFlight = 0;
let frame = 0;

const merc = (lon: number, lat: number): [number, number] => {
  const l = Math.max(-85.05, Math.min(85.05, lat)) * (Math.PI / 180);
  return [(lon + 180) / 360, (1 - Math.asinh(Math.tan(l)) / Math.PI) / 2];
};
const worldPx = () => TILE * 2 ** zoom;
const toScreen = (mx: number, my: number): [number, number] => {
  const s = worldPx();
  let dx = (mx - cx) * s;
  // The shortest way round the world.
  if (dx > s / 2) dx -= s;
  if (dx < -s / 2) dx += s;
  return [W / 2 + dx, H / 2 + (my - cy) * s];
};

function pump(): void {
  while (inFlight < 2 && queue.length) {
    const t = queue.shift()!;
    if (cache.get(t.key) !== 'pending') continue;
    inFlight++;
    props.requestTile(t.z, t.x, t.y, t.layer).then((bm) => {
      inFlight--;
      if (bm) cache.set(t.key, bm);
      else cache.delete(t.key);
      redraw();
      pump();
    });
  }
}

function tileAt(z: number, x: number, y: number): ImageBitmap | null {
  const key = `${props.layer}/${z}/${x}/${y}`;
  const hit = cache.get(key);
  if (hit && hit !== 'pending') return hit;
  if (!hit) {
    cache.set(key, 'pending');
    queue.push({ key, z, x, y, layer: props.layer });
  }
  return null;
}

function draw(): void {
  const c = cv.value;
  if (!c) return;
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#b6ccd0';
  g.fillRect(0, 0, W, H);
  g.imageSmoothingEnabled = true;
  const L = Math.max(MIN_Z, Math.min(MAX_Z, Math.round(zoom)));
  const n = 2 ** L, size = worldPx() / n;
  // Only what is on screen is wanted now.
  queue = queue.filter((q) => q.z === L && q.layer === props.layer);
  const x0 = Math.floor((cx - W / 2 / worldPx()) * n), x1 = Math.floor((cx + W / 2 / worldPx()) * n);
  const y0 = Math.max(0, Math.floor((cy - H / 2 / worldPx()) * n)), y1 = Math.min(n - 1, Math.floor((cy + H / 2 / worldPx()) * n));
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const wx = ((tx % n) + n) % n;
      const sx = W / 2 + (tx / n - cx) * worldPx(), sy = H / 2 + (ty / n - cy) * worldPx();
      const bm = tileAt(L, wx, ty);
      if (bm) {
        g.drawImage(bm, sx, sy, size + 0.5, size + 0.5);
        continue;
      }
      // While it is made, the coarser tile above it, enlarged.
      for (let up = 1; up <= 3 && L - up >= MIN_Z; up++) {
        const k = 2 ** up, px = Math.floor(wx / k), py = Math.floor(ty / k);
        const p = cache.get(`${props.layer}/${L - up}/${px}/${py}`);
        if (p && p !== 'pending') {
          const part = TILE / k;
          g.drawImage(p, (wx % k) * part, (ty % k) * part, part, part, sx, sy, size + 0.5, size + 0.5);
          break;
        }
      }
    }
  }
  pump();
  // Places: cities always, towns closer in; names when there is room.
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  for (const s of props.starts) {
    const city = s.tier === 'city';
    if (!city && zoom < 3.5 && s.id !== props.chosen) continue;
    const [x, y] = toScreen(...merc(s.lon, s.lat));
    if (x < -40 || y < -20 || x > W + 40 || y > H + 20) continue;
    const on = s.id === props.chosen, r = on ? 5 : city ? (zoom < 3 ? 2.2 : 4.5) : 3;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = on ? '#e0b25c' : city ? '#7a2f22' : '#3f3126';
    g.fill();
    g.lineWidth = on ? 2.5 : zoom < 3 ? 0.8 : 1.2;
    g.strokeStyle = on ? '#1a1408' : '#f3ead2';
    g.stroke();
    if (on || hover.value?.id === s.id || (city && zoom >= 3) || zoom >= 5) {
      g.font = `${on ? 'bold ' : ''}${city ? 13 : 11}px 'Iowan Old Style', Georgia, serif`;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(243,234,210,0.9)';
      g.strokeText(s.name, x, y - r - 2);
      g.fillStyle = '#2a2018';
      g.fillText(s.name, x, y - r - 2);
    }
  }
}

function redraw(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    draw();
  });
}

function resize(): void {
  const b = box.value!, c = cv.value!;
  dpr = window.devicePixelRatio || 1;
  W = b.clientWidth;
  H = b.clientHeight;
  c.width = Math.round(W * dpr);
  c.height = Math.round(H * dpr);
  c.style.width = `${W}px`;
  c.style.height = `${H}px`;
  // Never zoomed out past the whole world.
  zoom = Math.max(zoom, Math.log2(Math.max(W, 1) / TILE));
  redraw();
}

function nearest(px: number, py: number): StartSite | null {
  let best: StartSite | null = null, bd = 14 * 14;
  for (const s of props.starts) {
    if (s.tier !== 'city' && zoom < 3.5) continue;
    const [x, y] = toScreen(...merc(s.lon, s.lat));
    const d = (x - px) ** 2 + (y - py) ** 2;
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

// ---- Pointer: drag to pan, wheel to zoom, click to choose ----------------------------------------

let drag: { x: number; y: number; moved: boolean } | null = null;
function down(e: PointerEvent): void {
  drag = { x: e.clientX, y: e.clientY, moved: false };
  cv.value!.setPointerCapture(e.pointerId);
}
function move(e: PointerEvent): void {
  const r = cv.value!.getBoundingClientRect();
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.moved) {
      cx = (((cx - dx / worldPx()) % 1) + 1) % 1;
      cy = Math.max(0, Math.min(1, cy - dy / worldPx()));
      drag.x = e.clientX;
      drag.y = e.clientY;
      redraw();
    }
    return;
  }
  const h = nearest(e.clientX - r.left, e.clientY - r.top);
  if (h?.id !== hover.value?.id) {
    hover.value = h;
    redraw();
  }
}
function up(e: PointerEvent): void {
  const r = cv.value!.getBoundingClientRect();
  if (drag && !drag.moved) {
    const s = nearest(e.clientX - r.left, e.clientY - r.top);
    if (s) emit('choose', s.id);
  }
  drag = null;
}
function zoomAt(f: number, px = W / 2, py = H / 2): void {
  const before = [cx + (px - W / 2) / worldPx(), cy + (py - H / 2) / worldPx()];
  zoom = Math.max(Math.max(MIN_Z, Math.log2(W / TILE)), Math.min(MAX_Z + 0.5, zoom + f));
  cx = before[0] - (px - W / 2) / worldPx();
  cy = Math.max(0, Math.min(1, before[1] - (py - H / 2) / worldPx()));
  redraw();
}
function wheel(e: WheelEvent): void {
  e.preventDefault();
  const r = cv.value!.getBoundingClientRect();
  zoomAt(-Math.sign(e.deltaY) * 0.5, e.clientX - r.left, e.clientY - r.top);
}

/** Brings a place into view (when chosen from the list). */
function show(id: string): void {
  const s = props.starts.find((x) => x.id === id);
  if (!s) return;
  const [x, y] = toScreen(...merc(s.lon, s.lat));
  if (x > 60 && y > 60 && x < W - 60 && y < H - 60) return;
  [cx, cy] = merc(s.lon, s.lat);
  zoom = Math.max(zoom, 4);
  redraw();
}

watch(() => props.chosen, (id) => {
  show(id);
  redraw();
});
watch(() => props.layer, () => redraw());

const ro = new ResizeObserver(resize);
onMounted(() => {
  ro.observe(box.value!);
  resize();
  // The whole world first, turned so the proposed starting place is in the middle.
  const s = props.starts.find((x) => x.id === props.chosen);
  if (s) cx = merc(s.lon, s.lat)[0];
  cy = 0.5;
  zoom = Math.max(MIN_Z, Math.log2(Math.max(W, 1) / TILE));
  redraw();
});
onBeforeUnmount(() => {
  ro.disconnect();
  for (const v of cache.values()) if (v !== 'pending') v.close();
});

defineExpose({ zoomIn: () => zoomAt(1), zoomOut: () => zoomAt(-1) });
</script>

<template>
  <div ref="box" class="worldview">
    <canvas ref="cv" @pointerdown="down" @pointermove="move" @pointerup="up" @wheel="wheel" />
    <div v-if="hover" class="tip">
      <b>{{ hover.name }}</b>, a {{ hover.tier }} of {{ hover.population.toLocaleString() }}
      <span v-if="hover.realm"><br />{{ hover.realm }}</span>
    </div>
    <div class="zoom">
      <button @click="zoomAt(1)">+</button>
      <button @click="zoomAt(-1)">-</button>
    </div>
  </div>
</template>
