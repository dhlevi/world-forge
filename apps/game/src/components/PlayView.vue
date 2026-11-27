<script setup lang="ts">
/**
 * The game screen: draws the game (game/session.ts): the local map (game/renderer.ts) with rain
 * and snow falling over it, or the travel map, with the log over its corner, a note of what is
 * under the pointer, and the side panel; and maps keys to what the wanderer does. Everything that
 * is the game itself is the session's.
 */
import { background } from '../app/errors';
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Renderer } from '../game/renderer';
import { Tileset } from '../game/tileset';
import { RainLayer } from '../game/rain';
import TravelView from './TravelView.vue';
import SkyDial from './SkyDial.vue';
import Portrait from './Portrait.vue';
import MessageLog from './MessageLog.vue';
import { ROOF_MODES, ROOF_WORDS } from '../game/roofs-mode';
import type { PlayScreen } from '../screens/play';
import type { TileAction } from '../game/fieldcraft';

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

const tiles = new Tileset();
const renderer = new Renderer(tiles);
const rain = new RainLayer();
let frame = 0;
let gone = false;
/** Whether the renderer is set up (a redraw asked for sooner waits for the first one). */
let ready = false;

/** The pointer over the local map (CSS pixels from its corner), while it is there. */
let pointer: [number, number] | null = null;
/** The note of what is under the pointer (or the look cursor): where it hangs, and to which side. */
const tip = reactive({ show: false, x: 0, y: 0, left: false, up: false });
/** The skill menu (right-click on the local map; game/fieldcraft.ts): what can be done at a tile. */
const menu = reactive({ show: false, x: 0, y: 0, tx: 0, ty: 0, left: false, up: false, items: [] as TileAction[] });

function onContext(e: MouseEvent): void {
  e.preventDefault();
  menu.show = false;
  if (hud.mode !== 'play' || st.mode !== 'local' || !screen.active) return;
  const r = el.value!.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  const [tx, ty] = renderer.tileAt(px, py);
  const items = session.field.actions(tx, ty);
  if (!items.length) return;
  Object.assign(menu, { show: true, x: px, y: py, tx, ty, items, left: px > r.width - 340, up: py > r.height - 40 - items.length * 34 });
}

function pickAction(a: TileAction): void {
  menu.show = false;
  if (a.why) {
    session.say(a.why);
    redraw();
    return;
  }
  background(session.field.act(a.id, menu.tx, menu.ty).then(() => redraw()), 'the skill menu');
}

function closeMenu(): void {
  menu.show = false;
  // A click stops a walk under way.
  session.field.cancelWalk();
}

/** Hangs the note by the look cursor's tile, else by the pointer, turned inward near the map's edges. */
function placeTip(): void {
  if (st.mode !== 'local') pointer = null;
  const box = el.value, cursor = hud.mode === 'look' ? game.cursor : null;
  if (!box || (!cursor && !pointer)) {
    tip.show = false;
    return;
  }
  // What the note keeps clear of: the cursor's tile, or the pointer's arrow.
  let x0: number, y0: number, x1: number, y1: number;
  if (cursor) {
    const p = renderer.screenOf(cursor[0], cursor[1]);
    [x0, y0, x1, y1] = [p.x - 4, p.y - 4, p.x + p.size + 4, p.y + p.size + 4];
  } else {
    const [x, y] = pointer!;
    hud.look = game.describe(...renderer.tileAt(x, y));
    [x0, y0, x1, y1] = [x - 8, y - 8, x + 14, y + 18];
  }
  tip.left = x1 > box.clientWidth - 300;
  tip.up = y1 > box.clientHeight - 200;
  tip.x = tip.left ? x0 : x1;
  tip.y = tip.up ? y0 : y1;
  tip.show = true;
}

function onPointer(e: PointerEvent): void {
  const r = el.value!.getBoundingClientRect();
  pointer = [e.clientX - r.left, e.clientY - r.top];
  placeTip();
}

function onPointerOut(): void {
  pointer = null;
  placeTip();
}

/** Draws the local map at the next frame (once, however often asked). */
const redraw = () => {
  if (frame || gone || !ready) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    renderer.zoom = st.zoom;
    renderer.view = st.view;
    renderer.roofs = st.roofs;
    renderer.look = session.look;
    rain.set(session.falling);
    renderer.draw(game);
    // The map may have moved under the pointer.
    placeTip();
  });
};
session.onRedraw = redraw;

// A click on a person looks them over; on the stairs or ladder the wanderer stands on, goes up them (or down, if they lead only down).
renderer.onClick = (tx, ty) => {
  if ((hud.mode !== 'play' && hud.mode !== 'look') || st.mode !== 'local') return;
  if ((tx !== game.px || ty !== game.py) && screen.inspect([tx, ty])) return;
  if (hud.mode !== 'play' || tx !== game.px || ty !== game.py) return;
  const up = !!game.stairsHere(true);
  if (!up && !game.stairsHere(false)) return;
  st.view = 0;
  if (game.climbStairs(up)) game.refresh();
  else game.updateHud();
  redraw();
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
  // Any key stops a walk under way (the skill menu's), and does nothing else.
  if (session.field.busy) {
    session.field.cancelWalk();
    e.preventDefault();
    return;
  }
  if (menu.show && e.code === 'Escape') {
    menu.show = false;
    e.preventDefault();
    return;
  }
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
  // Sneaking (Shift+S), and setting or lifting a snare (P).
  if (hud.mode === 'play' && ((e.shiftKey && e.code === 'KeyS') || (!e.shiftKey && e.code === 'KeyP')) && !e.ctrlKey && !e.metaKey) {
    if (e.code === 'KeyS') session.toggleSneak();
    else session.snareHere();
    e.preventDefault();
    redraw();
    return;
  }
  // Roofs: shown unless inside, always, or never (Shift+R, in turn).
  if (hud.mode === 'play' && e.code === 'KeyR' && e.shiftKey) {
    st.roofs = ROOF_MODES[(ROOF_MODES.indexOf(st.roofs) + 1) % ROOF_MODES.length];
    game.say(ROOF_WORDS[st.roofs]);
    e.preventDefault();
    redraw();
    return;
  }
  // On stairs or a ladder, < and > go up and down them (when not already looking up or down).
  if (hud.mode === 'play' && !st.view && (e.key === '<' || e.key === '>') && game.stairsHere(e.key === '<')) {
    if (game.climbStairs(e.key === '<')) game.refresh();
    else game.updateHud();
    e.preventDefault();
    redraw();
    return;
  }
  // Looking up and down the levels (a slice of the map); moving, or Esc, comes back.
  if (hud.mode === 'play' && (e.key === '<' || e.key === '>')) {
    st.view = Math.max(-4, Math.min(4, st.view + (e.key === '<' ? 1 : -1)));
    e.preventDefault();
    redraw();
    return;
  }
  if (st.view && hud.mode === 'play' && (dir || e.code === 'Escape')) {
    st.view = 0;
    if (!dir) {
      e.preventDefault();
      redraw();
      return;
    }
  }
  if (hud.mode === 'look') {
    if (dir && game.cursor) {
      game.cursor = [game.cursor[0] + dir[0] * (e.shiftKey ? 5 : 1), game.cursor[1] + dir[1] * (e.shiftKey ? 5 : 1)];
      hud.look = game.describe(game.cursor[0], game.cursor[1]);
    } else if (e.code === 'Enter' && game.cursor && screen.inspect(game.cursor)) {
      // Enter on a person looks them over (and the looking goes on).
    } else if (e.code === 'Escape' || e.code === 'KeyX' || e.code === 'Enter') {
      hud.mode = 'play';
      game.cursor = null;
    } else return;
    e.preventDefault();
    redraw();
    return;
  }
  if (hud.mode === 'talk') {
    if (dir) session.talk(dir[0], dir[1]);
    else game.say('You say nothing.');
    hud.mode = 'play';
    e.preventDefault();
    redraw();
    return;
  }
  if (hud.mode === 'cut') {
    if (dir) session.cutBrush(dir[0], dir[1]);
    else game.say('You put your blade away.');
    hud.mode = 'play';
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
  } else if (e.code === 'KeyA' && !e.shiftKey) {
    session.startCut();
  } else if (e.code === 'KeyE' && !e.ctrlKey && !e.metaKey) {
    session.startTalk();
  } else if (e.code === 'KeyO') {
    hud.mode = 'open';
    game.say('Open in which direction?');
  } else if (e.code === 'KeyC') {
    hud.mode = 'close';
    game.say('Close in which direction?');
  } else if (e.code === 'KeyQ') {
    session.drinkHere();
  } else if (e.code === 'KeyW' && !e.ctrlKey && !e.metaKey) {
    session.washHere();
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
  ready = true;
  game.refresh();
  redraw();
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
    <div v-show="st.mode === 'local'" ref="el" class="map" @pointermove="onPointer" @pointerleave="onPointerOut" @contextmenu="onContext" @pointerdown="closeMenu" />
    <!-- A spell of work under way (game/fieldcraft.ts, work): what, and a way to stop it. -->
    <div v-if="hud.task && st.mode === 'local'" class="task-banner">
      <span>{{ hud.task }}...</span>
      <button @click="session.field.cancelWalk()">Stop (any key)</button>
    </div>
    <div
      v-if="menu.show && st.mode === 'local' && screen.active"
      class="skill-menu"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px`, transform: `translate(${menu.left ? '-100%' : '0'}, ${menu.up ? '-100%' : '0'})` }"
      @contextmenu.prevent
    >
      <button v-for="a in menu.items" :key="a.id" :class="{ off: !!a.why }" :title="a.why ?? ''" @click="pickAction(a)">
        {{ a.label }}<span v-if="a.why" class="why">{{ a.why }}</span>
      </button>
    </div>
    <TravelView
      v-if="st.mode === 'travel'"
      class="map"
      ref="travelRef"
      :travel="session.travel"
      :starts="app.state.starts"
      :request-tile="app.worker.requestTile"
      :request-area="app.worker.requestArea"
      :request-plan="app.worker.plan"
      :player="session.player"
      :hunt="session.hunt"
      :camps="session.campsAway"
      @zoom-in="session.toLocal()"
      @camp="screen.showCamp()"
      :dark="st.darkness"
    >
      <MessageLog :log="hud.log" />
    </TravelView>
    <MessageLog v-else :log="hud.log" />
    <div
      v-if="tip.show && !menu.show && st.mode === 'local' && screen.active"
      class="tile-tip"
      :style="{ left: `${tip.x}px`, top: `${tip.y}px`, transform: `translate(${tip.left ? '-100%' : '0'}, ${tip.up ? '-100%' : '0'})` }"
    >
      <div v-if="hud.mode === 'look'" class="head">Looking (Esc to stop)</div>
      <div v-for="(l, i) in hud.look" :key="i">{{ l }}</div>
    </div>
    <aside class="panel">
      <div v-if="st.name" class="who">
        <Portrait v-if="st.portrait" :spec="st.portrait" title="Your character (@)" @click="screen.showSheet()" />
        <div>
          <a href="#" @click.prevent="screen.showSheet()">{{ st.name }}</a>
          <span class="dim">{{ st.line }}</span>
        </div>
      </div>
      <SkyDial v-if="st.sky" :sky="st.sky" :clock="hud.clock" :words="st.weather" />
      <div v-else class="clock">{{ hud.clock }}</div>
      <div v-if="st.needs.length" class="needs">
        <div v-for="n in st.needs" :key="n.id" class="need" :class="{ bad: n.bar < 0.35, warn: n.bar < 0.6, link: n.id === 'health' }" :title="n.id === 'health' ? 'Your wounds and first aid (D)' : ''" @click="n.id === 'health' && !st.dead && screen.showHealth()">
          <span class="nl">{{ n.label }}</span>
          <span class="nb"><span :style="{ width: `${Math.round(n.bar * 100)}%` }" /></span>
          <span class="nw">{{ n.word }}</span>
        </div>
      </div>
      <div class="place">{{ hud.place }}</div>
      <div class="where">{{ hud.where }}</div>
      <div v-if="st.view" class="clock">Looking {{ Math.abs(st.view) === 1 ? 'a level' : `${Math.abs(st.view)} levels` }} {{ st.view > 0 ? 'up' : 'down' }} (&lt; and &gt;; Esc to come back)</div>
      <div v-if="hud.loading" class="clock">Making {{ hud.loading }} chunk{{ hud.loading === 1 ? '' : 's' }} of the map</div>
      <div v-if="st.dead" class="actions">
        <div class="dead">{{ st.dead.name }} is dead, of {{ st.dead.cause }}.</div>
        <button class="primary" @click="screen.app.toTitle()">Return to the title</button>
      </div>
      <div v-else class="actions">
        <button v-if="st.mode === 'local'" @click="session.toTravel()">Travel map <kbd>T</kbd></button>
        <button v-else @click="session.toLocal()">Back on foot <kbd>T</kbd></button>
        <button v-if="screen.player" @click="screen.showInventory()">Inventory <kbd>I</kbd></button>
        <button v-if="screen.player" @click="screen.showHealth()">Health <kbd>D</kbd></button>
        <button v-if="screen.player && st.mode === 'local'" @click="screen.showCamp()">Camp <kbd>Shift+C</kbd></button>
        <button v-if="st.mode === 'local' && hud.town" @click="screen.openCity(hud.town.id)">View {{ hud.town.name }} <kbd>V</kbd></button>
        <button @click="screen.showKeys()">Keys <kbd>?</kbd></button>
      </div>
      <div class="foot">
        <span>{{ tilesetNote }}</span>
        <span class="btns">
          <button :disabled="st.saving || !!st.dead" @click="session.save()">Save</button>
          <button @click="session.exportNow()">Export</button>
          <button @click="session.leave()">Leave</button>
        </span>
      </div>
    </aside>
  </div>
</template>
