<script setup lang="ts">
/**
 * The game screen: the map (game/renderer.ts) with the side panel (where, when, what is under the
 * pointer) and the message log; keys move the wanderer.
 */
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { GameMap } from '../game/map';
import { Game, type Hud } from '../game/game';
import { Renderer } from '../game/renderer';
import { Tileset } from '../game/tileset';
import type { ChunkData, LocalSite, RouteStep, StartSite, TravelArea, ViewLayer } from '../worker/protocol';
import TravelView from './TravelView.vue';
import { Travel, type LL } from '../game/travel';
import { HOME_KNOWN_M } from '../game/discovery';
import type { WorldSettings } from '@worldforge/core/settings';
import { applySave, exportSave, makeSave, writeSave, type SaveFile } from '../game/save';
import { desktop } from '../desktop';

const props = defineProps<{
  site: StartSite; start: [number, number]; sites: LocalSite[]; request: (cx: number, cy: number) => void;
  /** The game's id and world, for saving. */
  gameId: string; settings: WorldSettings;
  /** A saved game to carry on from. */
  restore?: SaveFile | null;
  /** For the travel map. */
  starts: StartSite[];
  requestTile: (z: number, x: number, y: number, layer: ViewLayer) => Promise<ImageBitmap | null>;
  requestArea: (box: { west: number; south: number; east: number; north: number }, fine: boolean) => Promise<TravelArea>;
  requestRoute: (from: [number, number], to: LL) => Promise<{ steps: RouteStep[] | null; partial: boolean }>;
}>();
const emit = defineEmits<{ sink: [f: (c: ChunkData) => void]; quit: [] }>();

const el = ref<HTMLDivElement>();
const hud = reactive<Hud>({ place: '', where: '', clock: '', log: [], look: [], mode: 'play', loading: 0 });
const tilesetNote = ref('');
const showHelp = ref(false);

let renderer_zoom = 2;
const map = new GameMap((cx, cy) => props.request(cx, cy));
const game = new Game(map, props.start, props.sites, props.site.name, hud);
if (!props.restore || !props.restore.discovered) {
  // A new game knows the country about home (older saves: about where they stand).
  game.discovery.reveal(game.px, game.py, HOME_KNOWN_M);
}
if (props.restore) {
  applySave(game, props.restore);
  if (!props.restore.discovered) game.discovery.reveal(game.px, game.py, HOME_KNOWN_M);
  if (props.restore.zoom) renderer_zoom = props.restore.zoom;
  game.say('You take up where you left off.');
}
const tiles = new Tileset();
/** On foot (the local map) or travelling (the travel map). */
const mode = ref<'local' | 'travel'>('local');
const travel = new Travel(game, [props.site.lon, props.site.lat], props.requestRoute);
/** After travelling, the wanderer is set on open ground once the chunks there have come. */
let needFooting = false;

function toTravel(): void {
  hud.mode = 'play';
  game.cursor = null;
  mode.value = 'travel';
  game.say('You take to the road.');
}

function toLocal(): void {
  travel.stop();
  mode.value = 'local';
  needFooting = true;
  game.refresh();
  if (game.ensureFooting()) needFooting = false;
  redraw();
}
const renderer = new Renderer(tiles);
renderer.zoom = renderer_zoom;
let frame = 0;
const redraw = () => {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    renderer.draw(game);
  });
};
game.onChange = redraw;
// For poking at in the browser console while developing.
if (import.meta.env.DEV) Object.assign(window, { __game: game, __renderer: renderer });

emit('sink', (c: ChunkData) => {
  map.add(c);
  if (needFooting && game.ensureFooting()) needFooting = false;
  if (mode.value === 'local') game.refresh();
});

/** Key to direction: arrows, the number pad (with or without Num Lock) and vi keys. */
const DIR: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  Numpad8: [0, -1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0],
  Numpad7: [-1, -1], Numpad9: [1, -1], Numpad1: [-1, 1], Numpad3: [1, 1],
  Home: [-1, -1], PageUp: [1, -1], End: [-1, 1], PageDown: [1, 1],
  KeyK: [0, -1], KeyJ: [0, 1], KeyH: [-1, 0], KeyL: [1, 0], KeyY: [-1, -1], KeyU: [1, -1], KeyB: [-1, 1], KeyN: [1, 1],
};

function onKey(e: KeyboardEvent): void {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
  if (e.code === 'KeyT' && !e.ctrlKey && !e.metaKey && hud.mode === 'play') {
    if (mode.value === 'local') toTravel();
    else toLocal();
    e.preventDefault();
    return;
  }
  // The travel map has keys of its own.
  if (mode.value === 'travel') {
    if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void save();
    }
    return;
  }
  const dir = DIR[e.code];
  if (hud.mode === 'look') {
    if (dir && game.cursor) {
      game.cursor = [game.cursor[0] + dir[0] * (e.shiftKey ? 5 : 1), game.cursor[1] + dir[1] * (e.shiftKey ? 5 : 1)];
      hud.look = game.describe(game.cursor[0], game.cursor[1]);
    } else if (e.code === 'Escape' || e.code === 'KeyX' || e.code === 'Enter') {
      hud.mode = 'play';
      game.cursor = null;
    } else return;
    e.preventDefault();
    redraw();
    return;
  }
  if (hud.mode === 'open' || hud.mode === 'close') {
    if (dir) {
      game.toggle(game.px + dir[0], game.py + dir[1], hud.mode === 'open');
      game.refresh();
    }
    hud.mode = 'play';
    e.preventDefault();
    return;
  }
  if (dir) {
    if (e.shiftKey) game.run(dir[0], dir[1]);
    else if (game.move(dir[0], dir[1])) game.refresh();
    else game.updateHud();
  } else if (e.code === 'Period' || e.code === 'Numpad5' || e.code === 'Clear') {
    game.wait();
    game.refresh();
  } else if (e.code === 'KeyO') {
    hud.mode = 'open';
    game.say('Open in which direction?');
  } else if (e.code === 'KeyC') {
    hud.mode = 'close';
    game.say('Close in which direction?');
  } else if (e.code === 'KeyX') {
    hud.mode = 'look';
    game.cursor = [game.px, game.py];
    hud.look = game.describe(game.px, game.py);
  } else if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
    renderer.zoom = Math.min(4, renderer.zoom + 1);
  } else if (e.key === '-' || e.code === 'NumpadSubtract') {
    renderer.zoom = Math.max(1, renderer.zoom - 1);
  } else if (e.key === '?') {
    showHelp.value = !showHelp.value;
  } else if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
    void save();
  } else return;
  e.preventDefault();
  redraw();
}

// ---- Saving ------------------------------------------------------------------------------------

const saving = ref(false);
/** Game time at the last save, to know whether there is anything new to save. */
let savedAt = props.restore ? game.time : -1;

async function save(quiet = false): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  try {
    await writeSave(makeSave(game, { id: props.gameId, settings: props.settings, siteId: props.site.id, siteName: props.site.name, zoom: renderer.zoom }));
    savedAt = game.time;
    if (!quiet) game.say('Game saved.');
  } catch (err) {
    game.say(`Could not save: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    saving.value = false;
    redraw();
  }
}

function exportNow(): void {
  exportSave(makeSave(game, { id: props.gameId, settings: props.settings, siteId: props.site.id, siteName: props.site.name, zoom: renderer.zoom }));
  game.say('Saved game exported to a file.');
}

async function leave(): Promise<void> {
  if (game.time !== savedAt) await save(true);
  emit('quit');
}

// Autosave every few minutes of real time, when something has happened.
const autosave = setInterval(() => {
  if (game.time !== savedAt) void save(true);
}, 3 * 60 * 1000);
const offMenu = desktop?.onMenu((what) => {
  if (what === 'save') void save();
});

renderer.onHover = (tx, ty) => {
  if (hud.mode === 'look') return;
  hud.look = game.describe(tx, ty);
};

const ro = new ResizeObserver(() => redraw());

onMounted(async () => {
  await renderer.init(el.value!);
  const n = await tiles.load(import.meta.env.BASE_URL);
  tilesetNote.value = n ? `Tileset: ${tiles.drawn.size} tiles drawn, the rest placeholders.` : 'Placeholder tiles (no tileset in public/tileset).';
  window.addEventListener('keydown', onKey);
  ro.observe(el.value!);
  game.refresh();
});

onBeforeUnmount(() => {
  clearInterval(autosave);
  offMenu?.();
  window.removeEventListener('keydown', onKey);
  ro.disconnect();
  renderer.app.destroy(true);
});
</script>

<template>
  <div class="play">
    <div v-show="mode === 'local'" ref="el" class="map" />
    <TravelView
      v-if="mode === 'travel'"
      class="map"
      :travel="travel"
      :starts="starts"
      :request-tile="requestTile"
      :request-area="requestArea"
      @zoom-in="toLocal"
    />
    <aside class="panel">
      <div class="place">{{ hud.place }}</div>
      <div class="where">{{ hud.where }}</div>
      <div class="clock">{{ hud.clock }}<span v-if="hud.loading"> · making {{ hud.loading }} chunk{{ hud.loading === 1 ? '' : 's' }}</span></div>
      <div class="look">
        <div class="head">{{ hud.mode === 'look' ? 'Looking (Esc to stop)' : 'Under the pointer' }}</div>
        <div v-for="(l, i) in hud.look" :key="i">{{ l }}</div>
      </div>
      <div class="keys" v-if="showHelp">
        <div><b>Move</b> arrows, number pad, or h j k l y u b n</div>
        <div><b>Run</b> Shift + direction</div>
        <div><b>Doors</b> walk into one to open it; o / c then a direction</div>
        <div><b>Wait</b> . or 5</div>
        <div><b>Look</b> x, then move the cursor</div>
        <div><b>Zoom</b> + and -</div>
        <div><b>Travel map</b> T (and T or Z to come back)</div>
        <div><b>Save</b> Ctrl+S (also saved every few minutes and on leaving)</div>
      </div>
      <div class="hint" v-else>Press ? for keys.</div>
      <button v-if="mode === 'local'" class="travel-btn" @click="toTravel">Travel map (T)</button>
      <button v-else class="travel-btn" @click="toLocal">Back on foot (T)</button>
      <div class="foot">
        <span>{{ tilesetNote }}</span>
        <span class="btns">
          <button :disabled="saving" @click="save()">Save</button>
          <button @click="exportNow">Export</button>
          <button @click="leave">Leave</button>
        </span>
      </div>
    </aside>
    <div class="log">
      <div v-for="(m, i) in hud.log.slice(-6)" :key="i" :style="{ opacity: 0.45 + (0.55 * (i + 1)) / Math.min(6, hud.log.length) }">
        <span class="t">{{ m.t.split(', ')[1] }}</span> {{ m.text }}
      </div>
    </div>
  </div>
</template>
