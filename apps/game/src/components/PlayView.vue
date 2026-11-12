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
import type { ChunkData } from '../worker/protocol';
import TravelView from './TravelView.vue';
import { Travel } from '../game/travel';
import { HOME_KNOWN_M } from '../game/discovery';
import { applySave, exportSave, makeSave, writeSave } from '../game/save';
import { desktop } from '../desktop';
import { CHUNK, TILE_M } from '@worldforge/core/local/chunk';
import { Knowledge, type Moodlet } from '../actors/components';
import type { PlayScreen } from '../screens/play';

const props = defineProps<{ screen: PlayScreen }>();
const screen = props.screen;
const app = screen.app;
const o = screen.o;

const el = ref<HTMLDivElement>();
const hud = reactive<Hud>({ place: '', where: '', clock: '', log: [], look: [], mode: 'play', loading: 0 });
const tilesetNote = ref('');
const showHelp = ref(false);

let renderer_zoom = 2;
const map = new GameMap((cx, cy) => app.worker.requestChunk(cx, cy));
const game = new Game(map, o.tile, o.sites, o.site.name, hud);
const knowledge = screen.player?.get(Knowledge);
if (!o.restore || !o.restore.discovered) {
  // A new game knows the country about home (older saves: about where they stand).
  game.discovery.reveal(game.px, game.py, knowledge?.d.homeRadiusM ?? HOME_KNOWN_M);
}
if (o.restore) {
  applySave(game, o.restore);
  if (!o.restore.discovered) game.discovery.reveal(game.px, game.py, HOME_KNOWN_M);
  if (o.restore.zoom) renderer_zoom = o.restore.zoom;
  game.say('You take up where you left off.');
}
game.onTime = (t) => {
  screen.cast.clock(t);
  screen.describe(t);
};
screen.describe(game.time);
const tiles = new Tileset();
/** On foot (the local map) or travelling (the travel map). */
const mode = ref<'local' | 'travel'>('local');
const travel = new Travel(game, [o.site.lon, o.site.lat], app.worker.requestRoute);
const travelRef = ref<InstanceType<typeof TravelView> | null>(null);

/**
 * What the character knew of the world before setting out (their occupations and standing,
 * actors/creation/resolve.ts): the roads walked and the places seen, laid on the travel map once,
 * at the start of a new game.
 */
async function applyKnowledge(): Promise<void> {
  const k = knowledge;
  if (!k || k.d.applied) return;
  k.d.applied = true;
  const from: [number, number] = [Math.floor(game.px / CHUNK), Math.floor(game.py / CHUNK)];
  const byId = new Map(app.state.starts.map((s) => [s.id, s]));
  for (const p of k.d.places) {
    const s = byId.get(p.id);
    if (!s) continue;
    const q = travel.frame.fromLL(s.lon, s.lat);
    game.discovery.reveal(Math.floor(q[0] / TILE_M), Math.floor(-q[1] / TILE_M), p.radiusM);
  }
  for (const id of k.d.roads) {
    const s = byId.get(id);
    if (!s) continue;
    const r = await app.worker.requestRoute(from, [s.lon, s.lat]);
    for (const st of r.steps ?? []) game.discovery.reveal(st.cx * CHUNK + CHUNK / 2, st.cy * CHUNK + CHUNK / 2, 1200);
    const q = travel.frame.fromLL(s.lon, s.lat);
    game.discovery.reveal(Math.floor(q[0] / TILE_M), Math.floor(-q[1] / TILE_M), 2000);
  }
  if (k.d.roads.length || k.d.places.length) game.say('You know something of the country beyond: see the travel map (T).');
}
if (!o.restore) {
  void applyKnowledge();
  // Setting out: a moodlet for the first day, sent through the messaging service.
  const p = screen.player;
  if (p) app.bus.send('actor.moodlet', { id: 'setting-out', text: 'Setting out on the road', value: 3, until: game.time + 86400 } satisfies Moodlet, { to: p.id });
}
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
let gone = false;
const redraw = () => {
  if (frame || gone) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    renderer.draw(game);
  });
};
game.onChange = redraw;
// For poking at in the browser console while developing.
if (import.meta.env.DEV) Object.assign(window, { __game: game, __renderer: renderer });

screen.onChunk = (c: ChunkData) => {
  map.add(c);
  if (needFooting && game.ensureFooting()) needFooting = false;
  if (mode.value === 'local') game.refresh();
};

/** Key to direction: arrows, the number pad (with or without Num Lock) and vi keys. */
const DIR: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  Numpad8: [0, -1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0],
  Numpad7: [-1, -1], Numpad9: [1, -1], Numpad1: [-1, 1], Numpad3: [1, 1],
  Home: [-1, -1], PageUp: [1, -1], End: [-1, 1], PageDown: [1, 1],
  KeyK: [0, -1], KeyJ: [0, 1], KeyH: [-1, 0], KeyL: [1, 0], KeyY: [-1, -1], KeyU: [1, -1], KeyB: [-1, 1], KeyN: [1, 1],
};

function onKey(e: KeyboardEvent): void {
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
    } else travelRef.value?.key(e);
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
let savedAt = o.restore ? game.time : -1;

const saveMeta = () => ({ id: o.gameId, settings: o.settings, siteId: o.site.id, siteName: o.site.name, zoom: renderer.zoom, character: screen.player?.toJSON() });

async function save(quiet = false): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  try {
    await writeSave(makeSave(game, saveMeta()));
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
  exportSave(makeSave(game, saveMeta()));
  game.say('Saved game exported to a file.');
}

async function leave(): Promise<void> {
  if (game.time !== savedAt) await save(true);
  app.toTitle();
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
  screen.onKey = (e) => {
    onKey(e);
    return false;
  };
  screen.onResume = () => redraw();
  ro.observe(el.value!);
  game.refresh();
});

onBeforeUnmount(() => {
  gone = true;
  if (frame) cancelAnimationFrame(frame);
  clearInterval(autosave);
  offMenu?.();
  screen.onKey = () => false;
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
      ref="travelRef"
      :travel="travel"
      :starts="app.state.starts"
      :request-tile="app.worker.requestTile"
      :request-area="app.worker.requestArea"
      @zoom-in="toLocal"
    />
    <aside class="panel">
      <div v-if="screen.state.name" class="who">
        <a href="#" @click.prevent="screen.showSheet()">{{ screen.state.name }}</a>
        <span class="dim">{{ screen.state.line }}</span>
      </div>
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
        <div><b>Character</b> @</div>
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
