<script setup lang="ts">
/**
 * The game screen: draws the game (game/session.ts): the local map (game/renderer.ts) with rain
 * and snow falling over it, or the travel map, with the side panel and the message log; and maps
 * keys to what the wanderer does. Everything that is the game itself is the session's.
 */
import { background } from '../app/errors';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { Renderer } from '../game/renderer';
import { Tileset } from '../game/tileset';
import { RainLayer } from '../game/rain';
import TravelView from './TravelView.vue';
import type { PlayScreen } from '../screens/play';

const props = defineProps<{ screen: PlayScreen }>();
const screen = props.screen;
const app = screen.app;
const session = screen.session;
const game = session.game;
const hud = session.hud;
const st = session.state;

const el = ref<HTMLDivElement>();
const travelRef = ref<InstanceType<typeof TravelView> | null>(null);
const tilesetNote = ref('');
const showHelp = ref(false);

const tiles = new Tileset();
const renderer = new Renderer(tiles);
const rain = new RainLayer();
let frame = 0;
let gone = false;
/** Draws the local map at the next frame (once, however often asked). */
const redraw = () => {
  if (frame || gone) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    renderer.zoom = st.zoom;
    renderer.look = session.look;
    rain.set(session.falling);
    renderer.draw(game);
  });
};
session.onRedraw = redraw;

renderer.onHover = (tx, ty) => {
  if (hud.mode === 'look') return;
  hud.look = game.describe(tx, ty);
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
    if (st.mode === 'local') session.toTravel();
    else session.toLocal();
    e.preventDefault();
    return;
  }
  // The travel map has keys of its own.
  if (st.mode === 'travel') {
    if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      background(session.save(), 'the game');
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
  } else if (e.code === 'KeyQ') {
    session.drinkHere();
  } else if (e.code === 'KeyV' && hud.town) {
    background(screen.openCity(hud.town.id), 'the game');
  } else if (e.code === 'KeyX') {
    hud.mode = 'look';
    game.cursor = [game.px, game.py];
    hud.look = game.describe(game.px, game.py);
  } else if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
    st.zoom = Math.min(4, st.zoom + 1);
  } else if (e.key === '-' || e.code === 'NumpadSubtract') {
    st.zoom = Math.max(1, st.zoom - 1);
  } else if (e.key === '?') {
    showHelp.value = !showHelp.value;
  } else if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
    background(session.save(), 'the game');
  } else return;
  e.preventDefault();
  redraw();
}

const ro = new ResizeObserver(() => redraw());

onMounted(async () => {
  await renderer.init(el.value!);
  rain.mount(el.value!);
  const n = await tiles.load(import.meta.env.BASE_URL);
  tilesetNote.value = n
    ? `Tileset: ${tiles.drawn.size} drawn${tiles.standIns.size ? `, ${tiles.standIns.size} stood in for` : ''}, the rest placeholders.`
    : 'Placeholder tiles (no tileset in public/tileset).';
  screen.onKey = (e) => {
    onKey(e);
    return false;
  };
  ro.observe(el.value!);
  game.refresh();
  if (import.meta.env.DEV) Object.assign(window, { __renderer: renderer });
});

onBeforeUnmount(() => {
  gone = true;
  if (frame) cancelAnimationFrame(frame);
  session.onRedraw = () => {};
  screen.onKey = () => false;
  ro.disconnect();
  renderer.app.destroy(true);
  rain.destroy();
});
</script>

<template>
  <div class="play">
    <div v-show="st.mode === 'local'" ref="el" class="map" />
    <TravelView
      v-if="st.mode === 'travel'"
      class="map"
      ref="travelRef"
      :travel="session.travel"
      :starts="app.state.starts"
      :request-tile="app.worker.requestTile"
      :request-area="app.worker.requestArea"
      :request-plan="app.worker.plan"
      @zoom-in="session.toLocal()"
      @camp="screen.showCamp()"
      :dark="st.darkness"
    />
    <aside class="panel">
      <div v-if="st.name" class="who">
        <a href="#" @click.prevent="screen.showSheet()">{{ st.name }}</a>
        <span class="dim">{{ st.line }}</span>
      </div>
      <div v-if="st.needs.length" class="needs">
        <div v-for="n in st.needs" :key="n.id" class="need" :class="{ bad: n.bar < 0.35, warn: n.bar < 0.6 }">
          <span class="nl">{{ n.label }}</span>
          <span class="nb"><span :style="{ width: `${Math.round(n.bar * 100)}%` }" /></span>
          <span class="nw">{{ n.word }}</span>
        </div>
        <div v-if="st.weather" class="dim air">
          <div>{{ st.weather.when }}</div>
          <div>{{ st.weather.wind }}</div>
          <div>{{ st.weather.air }}</div>
          <div>{{ st.weather.sun }}</div>
        </div>
        <div v-else class="dim air">{{ st.air }}</div>
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
        <div><b>Inventory</b> I (G to pick up; eat and drink from it)</div>
        <div><b>Drink</b> Q at water or a well (fills waterskins too)</div>
        <div><b>Sleep or rest</b> Shift+Z</div>
        <div><b>Camp</b> Shift+C: choose a site, fire, shelter, food, the night</div>
        <div><b>Read the sky</b> Shift+W: what weather is coming (Survival)</div>
        <div><b>Town view</b> V, in a town or city</div>
        <div><b>Save</b> Ctrl+S (also saved every few minutes and on leaving)</div>
      </div>
      <div class="hint" v-else>Press ? for keys.</div>
      <button v-if="st.mode === 'local'" class="travel-btn" @click="session.toTravel()">Travel map (T)</button>
      <button v-if="screen.player" class="travel-btn" @click="screen.showInventory()">Inventory (I)</button>
      <button v-if="screen.player && st.mode === 'local'" class="travel-btn" @click="screen.showCamp()">Camp (Shift+C)</button>
      <button v-if="st.mode === 'local' && hud.town" class="travel-btn" @click="screen.openCity(hud.town.id)">View {{ hud.town.name }} (V)</button>
      <button v-else class="travel-btn" @click="session.toLocal()">Back on foot (T)</button>
      <div class="foot">
        <span>{{ tilesetNote }}</span>
        <span class="btns">
          <button :disabled="st.saving" @click="session.save()">Save</button>
          <button @click="session.exportNow()">Export</button>
          <button @click="session.leave()">Leave</button>
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
