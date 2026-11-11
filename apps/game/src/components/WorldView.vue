<script setup lang="ts">
/**
 * The world before play begins: a map of the whole generated world, drawn tile by tile by the
 * core's renderer in the worker (the atlas's styles), to pan and zoom, with its cities and towns
 * marked. Clicking a place chooses where to begin.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { StartSite, ViewLayer, TravelArea } from '../worker/protocol';

type LL = [number, number];

const props = withDefaults(defineProps<{
  starts: StartSite[];
  chosen?: string;
  layer: ViewLayer;
  requestTile: (z: number, x: number, y: number, layer: ViewLayer) => Promise<ImageBitmap | null>;
  /** Travel map: the party, its route and destination, roads and lesser places to draw. */
  party?: LL | null;
  route?: LL[];
  dest?: LL | null;
  area?: TravelArea | null;
  /** Fixed zoom levels, as kilometres across the view (the travel map); free zoom if absent. */
  levels?: number[];
  /** Index into `levels`. */
  level?: number;
  /** Follow the party as it moves (while travelling). */
  follow?: boolean;
  /**
   * Fog of the undiscovered: for a point, 0 undiscovered (cloud), 1 discovered but out of sight
   * (dimmed), 2 in sight. None: everything shows.
   */
  fog?: ((lon: number, lat: number) => number) | null;
  /** Changes whenever the fog does, to redraw. */
  fogVersion?: number;
}>(), { chosen: '', party: null, route: () => [], dest: null, area: null, levels: () => [], level: 0, follow: false, fog: null, fogVersion: 0 });
const emit = defineEmits<{ choose: [id: string]; pick: [ll: LL]; view: [box: { west: number; south: number; east: number; north: number; km: number }]; level: [i: number] }>();

const box = ref<HTMLDivElement>();
const cv = ref<HTMLCanvasElement>();
const hover = ref<StartSite | null>(null);
const TILE = 256, MIN_Z = 1;
const maxZ = () => (props.levels.length ? 14 : 9);

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

// ---- Fog of the undiscovered: clouds over what has not been seen ---------------------------------

let cloud: HTMLCanvasElement | null = null;
/** A seamless field of soft cloud, made once. */
function cloudTexture(): HTMLCanvasElement {
  if (cloud) return cloud;
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e9e4d6';
  g.fillRect(0, 0, S, S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S, y = rnd() * S, r = 18 + rnd() * 70, light = rnd() < 0.55;
    // Drawn at each wrap so the texture tiles without seams.
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, light ? 'rgba(255,255,255,0.55)' : 'rgba(170,165,160,0.28)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r);
    }
  }
  cloud = c;
  return c;
}

const fogCanvas = document.createElement('canvas');
const maskCanvas = document.createElement('canvas');
const dimCanvas = document.createElement('canvas');
const FOG_STEP = 4;

/** The fog state at a screen point. */
function fogAt(px: number, py: number): number {
  if (!props.fog) return 2;
  const s = worldPx();
  const mx = cx + (px - W / 2) / s, my = cy + (py - H / 2) / s;
  const lon = (((mx % 1) + 1) % 1) * 360 - 180, lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * Math.max(0, Math.min(1, my))))) * 180) / Math.PI;
  return props.fog(lon, lat);
}

function drawFog(g: CanvasRenderingContext2D): void {
  if (!props.fog) return;
  const mw = Math.ceil(W / FOG_STEP) + 1, mh = Math.ceil(H / FOG_STEP) + 1;
  for (const c of [maskCanvas, dimCanvas]) {
    if (c.width !== mw || c.height !== mh) {
      c.width = mw;
      c.height = mh;
    }
  }
  const mg = maskCanvas.getContext('2d')!, dg = dimCanvas.getContext('2d')!;
  const m = mg.createImageData(mw, mh), d = dg.createImageData(mw, mh);
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    const st = fogAt(i * FOG_STEP, j * FOG_STEP), o = (j * mw + i) * 4;
    if (st === 0) m.data[o + 3] = 255;
    else if (st === 1) {
      d.data[o] = 24;
      d.data[o + 1] = 22;
      d.data[o + 2] = 30;
      d.data[o + 3] = 80;
    }
  }
  mg.putImageData(m, 0, 0);
  dg.putImageData(d, 0, 0);
  // Discovered but out of sight: a little darker.
  g.save();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(dimCanvas, 0, 0, mw * FOG_STEP, mh * FOG_STEP);
  // The clouds: the texture, kept to the undiscovered by the mask (soft at its edges), fixed to
  // the world so they do not slide as the map is panned.
  if (fogCanvas.width !== c0w() || fogCanvas.height !== c0h()) {
    fogCanvas.width = c0w();
    fogCanvas.height = c0h();
  }
  const fg = fogCanvas.getContext('2d')!;
  fg.setTransform(1, 0, 0, 1, 0, 0);
  fg.globalCompositeOperation = 'source-over';
  fg.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
  const pat = fg.createPattern(cloudTexture(), 'repeat')!;
  const ox = -((cx * worldPx()) % 512) + W / 2, oy = -((cy * worldPx()) % 512) + H / 2;
  fg.setTransform(dpr, 0, 0, dpr, 0, 0);
  fg.translate(ox, oy);
  fg.fillStyle = pat;
  fg.fillRect(-ox, -oy, W, H);
  fg.setTransform(dpr, 0, 0, dpr, 0, 0);
  fg.globalCompositeOperation = 'destination-in';
  fg.imageSmoothingEnabled = true;
  fg.drawImage(maskCanvas, 0, 0, mw * FOG_STEP, mh * FOG_STEP);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(fogCanvas, 0, 0);
  g.restore();
}
const c0w = () => Math.round(W * dpr), c0h = () => Math.round(H * dpr);

function draw(): void {
  const c = cv.value;
  if (!c) return;
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#b6ccd0';
  g.fillRect(0, 0, W, H);
  g.imageSmoothingEnabled = true;
  const L = Math.max(MIN_Z, Math.min(maxZ(), Math.round(zoom)));
  const n = 2 ** L, size = worldPx() / n;
  // Only what is on screen is wanted now.
  // Tiles queued for another zoom or style are forgotten, so they are asked for again when wanted
  // (left marked as pending, they would never be drawn).
  queue = queue.filter((q) => {
    if (q.z === L && q.layer === props.layer) return true;
    if (cache.get(q.key) === 'pending') cache.delete(q.key);
    return false;
  });
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
  drawFog(g);
  // Roads and tracks (travel map), where they have been discovered.
  if (props.area) {
    for (const r of props.area.roads) {
      if (r.cls === 'track' && zoom < 10) continue;
      g.beginPath();
      let pen = false;
      r.pts.forEach((p) => {
        const [x, y] = toScreen(...merc(p[0], p[1]));
        const shown = !props.fog || props.fog(p[0], p[1]) > 0;
        if (shown && pen) g.lineTo(x, y);
        else if (shown) g.moveTo(x, y);
        pen = shown;
      });
      g.setLineDash(r.cls === 'track' ? [3, 3] : []);
      g.lineWidth = r.cls === 'major' ? 2.6 : r.cls === 'minor' ? 1.8 : 1.2;
      g.strokeStyle = r.cls === 'track' ? 'rgba(110,80,50,0.75)' : 'rgba(120,70,40,0.85)';
      g.stroke();
    }
    g.setLineDash([]);
  }
  // The route ahead.
  if (props.route.length > 1) {
    g.beginPath();
    props.route.forEach((p, i) => {
      const [x, y] = toScreen(...merc(p[0], p[1]));
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.setLineDash([6, 4]);
    g.lineWidth = 2.5;
    g.strokeStyle = '#a3261b';
    g.stroke();
    g.setLineDash([]);
  }
  // Lesser places (villages, caves, ruins) on the travel map.
  if (props.area && zoom >= 9) {
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    for (const p of props.area.places) {
      if (p.tier !== 'village' && p.tier !== 'lair') continue;
      if (props.fog && props.fog(p.lon, p.lat) === 0) continue;
      const [x, y] = toScreen(...merc(p.lon, p.lat));
      if (x < -40 || y < -20 || x > W + 40 || y > H + 20) continue;
      g.beginPath();
      if (p.tier === 'lair') g.rect(x - 3, y - 3, 6, 6);
      else g.arc(x, y, 3, 0, Math.PI * 2);
      g.fillStyle = p.tier === 'lair' ? '#4a4038' : '#5a4630';
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = '#f3ead2';
      g.stroke();
      if (zoom >= 11 && p.name) {
        g.font = `11px 'Iowan Old Style', Georgia, serif`;
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(243,234,210,0.9)';
        g.strokeText(p.name, x, y - 4);
        g.fillStyle = '#2a2018';
        g.fillText(p.name, x, y - 4);
      }
    }
  }
  // Places: cities always, towns closer in; names when there is room.
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  for (const s of props.starts) {
    const city = s.tier === 'city';
    if (!city && zoom < 3.5 && s.id !== props.chosen) continue;
    if (props.fog && props.fog(s.lon, s.lat) === 0) continue;
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

function drawParty(g: CanvasRenderingContext2D): void {
  if (props.dest) {
    const [x, y] = toScreen(...merc(props.dest[0], props.dest[1]));
    g.strokeStyle = '#a3261b';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x - 6, y - 6);
    g.lineTo(x + 6, y + 6);
    g.moveTo(x + 6, y - 6);
    g.lineTo(x - 6, y + 6);
    g.stroke();
  }
  if (props.party) {
    const [x, y] = toScreen(...merc(props.party[0], props.party[1]));
    g.beginPath();
    g.arc(x, y, 7, 0, Math.PI * 2);
    g.fillStyle = '#ffe9a8';
    g.fill();
    g.lineWidth = 2.5;
    g.strokeStyle = '#1a1408';
    g.stroke();
    g.beginPath();
    g.arc(x, y, 2.5, 0, Math.PI * 2);
    g.fillStyle = '#1a1408';
    g.fill();
  }
}

function redraw(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (!cv.value) return;
    draw();
    drawParty(cv.value.getContext('2d')!);
    tellView();
  });
}

/** The view's box in lon/lat, for the overlays the parent fetches. */
let lastBox = '';
function tellView(): void {
  const s = worldPx();
  const toLL = (mx: number, my: number): LL => [mx * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI];
  const a = toLL(cx - W / 2 / s, cy + H / 2 / s), b = toLL(cx + W / 2 / s, cy - H / 2 / s);
  const lat = toLL(cx, cy)[1];
  const km = (W / s) * 40075 * Math.cos((lat * Math.PI) / 180);
  const box = { west: a[0], south: Math.max(-85, a[1]), east: b[0], north: Math.min(85, b[1]), km };
  const key = `${box.west.toFixed(3)},${box.south.toFixed(3)},${box.east.toFixed(3)},${box.north.toFixed(3)}`;
  if (key === lastBox) return;
  lastBox = key;
  emit('view', box);
}

/** The zoom showing `km` across the view at the current latitude. */
function zoomForKm(km: number): number {
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * cy))) * 180) / Math.PI;
  const worldKm = 40075 * Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  return Math.log2((W * worldKm) / km / TILE);
}

function setLevel(i: number): void {
  const n = props.levels.length;
  if (!n) return;
  const k = Math.max(0, Math.min(n - 1, i));
  // Zooms about the middle of the view, wherever the player has panned it.
  zoom = Math.max(Math.log2(Math.max(W, 1) / TILE), Math.min(maxZ() + 0.5, zoomForKm(props.levels[k])));
  redraw();
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
  const lesser = props.area && zoom >= 9 ? props.area.places.filter((p) => p.tier === 'village' || p.tier === 'lair').map((p) => ({ ...p, population: 0 }) as StartSite) : [];
  for (const s of [...props.starts, ...lesser]) {
    if (props.fog && props.fog(s.lon, s.lat) === 0) continue;
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
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const s = nearest(px, py);
    if (s) {
      emit('choose', s.id);
      emit('pick', [s.lon, s.lat]);
    } else {
      const sw = worldPx();
      const mx = cx + (px - W / 2) / sw, my = cy + (py - H / 2) / sw;
      emit('pick', [(((mx % 1) + 1) % 1) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI]);
    }
  }
  drag = null;
}
function zoomAt(f: number, px = W / 2, py = H / 2): void {
  if (props.levels.length) {
    emit('level', Math.max(0, Math.min(props.levels.length - 1, props.level + (f > 0 ? -1 : 1))));
    return;
  }
  const before = [cx + (px - W / 2) / worldPx(), cy + (py - H / 2) / worldPx()];
  zoom = Math.max(Math.max(MIN_Z, Math.log2(W / TILE)), Math.min(maxZ() + 0.5, zoom + f));
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
watch(() => props.level, (i) => setLevel(i));
watch(() => [props.route, props.dest, props.area, props.fogVersion], () => redraw());
// While travelling, the view follows the party when it walks near the edge; otherwise the view
// stays where the player has panned it.
watch(() => props.party, (p, old) => {
  const moved = !!p && (!old || p[0] !== old[0] || p[1] !== old[1]);
  if (p && moved && props.follow && props.levels.length) {
    const [x, y] = toScreen(...merc(p[0], p[1]));
    if (x < W * 0.2 || y < H * 0.2 || x > W * 0.8 || y > H * 0.8) [cx, cy] = merc(p[0], p[1]);
  }
  redraw();
});

/** Brings the party back to the middle of the view. */
function centreOnParty(): void {
  if (!props.party) return;
  [cx, cy] = merc(props.party[0], props.party[1]);
  redraw();
}

const ro = new ResizeObserver(resize);
onMounted(() => {
  ro.observe(box.value!);
  resize();
  if (props.party && props.levels.length) {
    [cx, cy] = merc(props.party[0], props.party[1]);
    setLevel(props.level);
    return;
  }
  // The whole world first, turned so the proposed starting place is in the middle.
  const s = props.starts.find((x) => x.id === props.chosen);
  if (s) cx = merc(s.lon, s.lat)[0];
  cy = 0.5;
  zoom = Math.max(MIN_Z, Math.log2(Math.max(W, 1) / TILE));
  redraw();
});
onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  ro.disconnect();
  for (const v of cache.values()) if (v !== 'pending') v.close();
});

defineExpose({ zoomIn: () => zoomAt(1), zoomOut: () => zoomAt(-1), centreOnParty });
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
