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
import { Knowledge, Skills, type Moodlet } from '../actors/components';
import { check, DC } from '../actors/checks';
import { Inventory } from '../actors/items/inventory';
import { defOf } from '../actors/items/item';
import { Needs } from '../actors/needs';
import { airWord } from '../game/calendar';
import { WeatherService, type Sky } from '../game/weather';
import { SHELTERS } from '../game/camp';
import { SIGHT } from '../game/game';
import { RainLayer } from '../game/rain';
import type { Item } from '../actors/items/item';
import { GROUND_TILES, OBJECT_TILES } from '@worldforge/core/local/tiles';
import type { PlayScreen } from '../screens/play';
import { Practice } from '../game/practice';

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
// ---- Needs, fatigue and the air (actors/needs.ts, game/calendar.ts) ------------------------------

/** The weather where the party is (game/weather.ts), from the climate the worker gives as it moves. */
const weather = new WeatherService(o.settings.seed, o.site.lon, o.site.lat);
let climateAt: [number, number] | null = null;
function updateClimate(): void {
  const [lon, lat] = travel.party();
  if (climateAt && Math.abs(climateAt[0] - lon) < 0.05 && Math.abs(climateAt[1] - lat) < 0.05) return;
  climateAt = [lon, lat];
  void app.worker.climate(lon, lat).then((c) => {
    weather.setPlace(lon, lat, c);
    applySky(weather.sky(game.time));
  });
}
const indoors = () => GROUND_TILES[game.map.ground(game.px, game.py)]?.name.startsWith('floor_') ?? false;
const needs = () => screen.player?.get(Needs);
const invSlow = () => screen.player?.get(Inventory)?.loadInfo().slow ?? 1;

/** The sky as it was when last looked at (for what has changed). */
let sky: Sky = weather.sky(game.time);
let lastSky: Sky | null = null;
/** How dark it is out of doors (for the travel map). */
const darkness = ref(0);
/** Light carried: a torch or candle in hand, by night, burns down an hour a use. */
let torchS = 0;
function heldLight(): Item | undefined {
  const inv = screen.player?.get(Inventory);
  const h = inv?.hands();
  return [h?.left, h?.right, h?.both].find((i) => i && (i.def === 'torch' || i.def === 'candle') && (i.uses ?? 1) > 0);
}
game.carriedLight = () => {
  const it = heldLight();
  return it ? (it.def === 'torch' ? 7 : 3) : 0;
};
/** The sky's colour on the map by the hour. */
function skyTint(s: Sky): number {
  if (s.sun.phase === 'night') return 0x7484bc;
  if (s.sun.phase === 'dawn' || s.sun.phase === 'dusk') return s.w.cloud > 0.8 ? 0xb0a8b8 : 0xffc29a;
  return s.w.fog > 0.4 ? 0xd8dce2 : s.w.cloud > 0.8 ? 0xdde2ea : 0xffffff;
}
/** Puts the sky on the map, the panel and sight. */
function applySky(s: Sky): void {
  sky = s;
  darkness.value = Math.round((1 - s.light) * 20) / 20;
  const w = s.w;
  const inside = indoors();
  let range = s.light >= 0.9 ? SIGHT : Math.round(3 + 27 * Math.pow(s.light, 0.8));
  range = Math.round(range * (1 - w.fog * 0.75) * (w.rainMm > 3 ? 0.6 : w.kind.includes('snow') ? 0.7 : 1));
  game.ambient = inside ? { light: Math.max(0.15, s.light * 0.75), range: Math.max(4, range) } : { light: s.light, range: Math.max(2, range) };
  renderer.look = { sky: inside ? 0xffffff : skyTint(s), snowCm: s.snowCm, season: s.season, light: inside ? Math.max(0.4, s.light) : s.light };
  const n = needs();
  const felt = n?.d.feltC;
  screen.state.weather = {
    when: `${WeatherService.partOfDay(s)[0].toUpperCase()}${WeatherService.partOfDay(s).slice(1)}; ${WeatherService.skyWords(s)}`,
    wind: inside ? 'Indoors' : `${WeatherService.windWords(w)[0].toUpperCase()}${WeatherService.windWords(w).slice(1)}`,
    air: `${Math.round(n?.d.airC ?? w.tempC)}°C${felt !== undefined && Math.abs(felt - (n?.d.airC ?? 0)) >= 3 ? ` (feels ${Math.round(felt)}°C)` : ''}, ${airWord(n?.d.airC ?? w.tempC)}; ${s.season}${s.snowCm >= 2 ? `; snow ${s.snowCm} cm deep` : s.mud > 0.5 ? '; the ground is muddy' : ''}`,
    sun: weather.sunWords(s.t),
  };
  rain.set(mode.value === 'local' && !inside ? w : null);
}

/** How the ground slows going: deep snow and mud. */
const groundSlow = () => 1 + Math.min(1.2, Math.max(0, sky.snowCm - 5) / 40) + sky.mud * 0.2;

const rain = new RainLayer();
const practice = new Practice(screen, game);
let lastT = game.time;
game.onTime = (t) => {
  updateClimate();
  const dt = t - lastT;
  lastT = t;
  const s = weather.sky(t);
  const w = s.w;
  const inside = indoors();
  const camp = game.camps.at(game.px, game.py);
  // Camp fires burn down (game/camp.ts); heavy rain puts out an open fire.
  for (const c of game.camps.burn(game, Math.max(0, dt))) if (camp === c) game.say('Your fire has burnt down to ashes.');
  if (!inside && w.rainMm > 2 && !w.kind.includes('snow')) {
    for (const c of game.camps.list) if (c.fire.lit && Math.hypot(c.x - game.px, c.y - game.py) < 400) {
      game.camps.setFire(game, c, false);
      c.fire.fuelH = 0;
      if (c === camp) game.say('The rain puts out your fire.');
    }
  }
  // The air, out of doors or in; a camp's fire and shelter warm it.
  const air = inside ? w.tempC + (16 - w.tempC) * 0.6 : w.tempC;
  const resting = game.activity === 'sleep' || game.activity === 'rest';
  const shelter = camp?.shelter && resting ? SHELTERS[camp.shelter.kind] : null;
  const cover = inside ? 1 : shelter?.rain ? 0.95 : 0;
  const windCover = inside ? 1 : shelter ? (shelter.rain ? 0.9 : 0.6) : camp ? camp.site.shelter * 0.5 : 0;
  const sun = !inside && s.sun.altitude > 0 ? (1 - w.cloud) * Math.min(1, s.sun.altitude / 40) : 0;
  const fireBy = !!camp?.fire.lit || (inside && LIGHTS_NEAR(['hearth', 'forge', 'oven']));
  screen.cast.clock(t, {
    activity: game.activity, ambientC: air + game.camps.warmth(game.px, game.py, air), loadSlow: invSlow(), sleepQuality: game.sleepQuality,
    weather: inside ? undefined : { rainMm: w.rainMm, snow: w.kind.includes('snow'), windMs: w.windMs, sun }, cover, windCover, fire: fireBy,
  });
  // Weather in the log (not while asleep, but a season or snow noticed on waking).
  const changed = WeatherService.changes(lastSky, s);
  lastSky = s;
  if (game.activity !== 'sleep') for (const line of changed) game.say(line);
  // A storm stops a journey.
  if (travel.running && (w.windMs >= 20 || (w.thunder && w.rainMm > 3) || w.kind === 'heavy snow')) {
    travel.stop();
    game.say(w.kind === 'heavy snow' ? 'The snow is too thick to go on in; you stop.' : 'The storm is too fierce to travel in; you stop and take what shelter you can.');
  }
  // A torch held by night burns down.
  const lamp = heldLight();
  if (lamp && s.light < 0.5) {
    torchS += Math.max(0, dt);
    while (torchS >= 3600 && (lamp.uses ?? 0) > 0) {
      torchS -= 3600;
      lamp.uses = (lamp.uses ?? 1) - 1;
      if (lamp.uses <= 0) game.say(`Your ${lamp.def === 'torch' ? 'torch gutters out' : 'candle burns down'}.`);
    }
  }
  // Skills at work: swimming, hard going, wear on the feet (game/practice.ts).
  practice.time(dt, game.activity, invSlow());
  practice.flush();
  game.activity = 'rest';
  screen.describe(t);
  applySky(s);
  const n = needs();
  if (!n) return;
  for (const note of n.takeNotes()) {
    game.say(note.text);
    // A need growing worse stops a journey, as dusk does.
    if (note.worse && travel.running && note.word !== 'Winded') {
      travel.stop();
      game.say('You stop.');
    }
  }
  if (n.collapse && !collapsing) {
    collapsing = true;
    setTimeout(() => collapse(), 0);
  }
};
/** Reading the sky for what is coming (Survival): once an hour gives one reading. */
let lastReading: { hour: number; text: string } | null = null;
function readSky(): void {
  const a = screen.player;
  if (!a) return;
  if (indoors()) {
    game.say('You cannot see the sky from in here.');
    return;
  }
  const hour = Math.floor(game.time / 3600);
  if (lastReading && lastReading.hour === hour) {
    game.say(lastReading.text);
    return;
  }
  game.time += 5 * 60;
  const r = check(a, 'survival', { difficulty: DC.routine - 10, now: game.time, mods: sky.light < 0.2 ? [{ why: 'the dark', value: -10 }] : [] });
  const text = weather.forecast(game.time, r.grade, () => a.need(Skills).random());
  lastReading = { hour, text };
  game.say(text);
  practice.flush();
  game.updateHud();
}

/** Whether one of some things is beside the wanderer. */
function LIGHTS_NEAR(names: string[]): boolean {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (names.includes(OBJECT_TILES[game.map.object(game.px + dx, game.py + dy)]?.name ?? '')) return true;
  return false;
}

let collapsing = false;
/** The body gives out: hours pass senseless, then the wanderer comes round, worse for it. */
function collapse(): void {
  const n = needs();
  if (!n?.collapse) {
    collapsing = false;
    return;
  }
  const why = { thirst: 'Your legs give way: you have had nothing to drink for too long.', hunger: 'You faint from hunger.', sleep: 'You can stay awake no longer and drop where you stand.', heat: n.d.heat < 0 ? 'The cold takes you, and the world goes dark.' : 'The heat overcomes you, and you fall.', stamina: 'You collapse.', wet: 'You collapse.' }[n.collapse];
  travel.stop();
  game.say(why);
  game.sleepQuality = 0.3;
  for (let h = 0; h < 6; h++) {
    game.time += 3600;
    game.activity = 'sleep';
    game.updateHud();
  }
  game.sleepQuality = 0.6;
  n.recover();
  const p = screen.player;
  if (p) app.bus.send('actor.moodlet', { id: 'collapsed', text: 'Collapsed', value: -8, until: game.time + 86400 } satisfies Moodlet, { to: p.id });
  game.say('You come round hours later, weak and shaken.');
  collapsing = false;
  redraw();
}

/** Sleeps or rests in hours, waking early when rested (or something needs seeing to). */
function sleep(hours: number, quality: number, o: { untilRested?: boolean; awake?: boolean; onHour?: (h: number) => void } = {}): number {
  const n = needs();
  travel.stop();
  game.say(o.awake ? 'You sit and rest.' : 'You lie down to sleep.');
  // Sleeping rough, Survival makes a better or worse bed of it.
  if (!o.awake && quality < 1) quality = practice.roughSleep(quality);
  game.sleepQuality = quality;
  let slept = 0;
  for (let h = 0; h < hours; h++) {
    game.time += 3600;
    game.activity = o.awake ? 'rest' : 'sleep';
    game.updateHud();
    slept++;
    o.onHour?.(h);
    if (o.untilRested && n && n.d.fatigue <= 2 && n.d.debt < 0.5) break;
    if (n?.collapse) break;
  }
  game.sleepQuality = 0.6;
  if (!o.awake && slept > 0) {
    const p = screen.player;
    const cold = (n?.d.airC ?? 15) < 8;
    const mood: Moodlet = quality >= 1 ? { id: 'slept', text: 'Slept in a bed', value: 3, until: game.time + 12 * 3600 }
      : quality >= 0.8 ? { id: 'slept', text: 'Slept rough', value: 0, until: game.time + 12 * 3600 }
      : { id: 'slept', text: cold ? 'Slept on the cold ground' : 'Slept on the ground', value: cold ? -4 : -2, until: game.time + 12 * 3600 };
    if (p && mood.value) app.bus.send('actor.moodlet', mood, { to: p.id });
    game.say(`You wake after ${slept} hour${slept === 1 ? '' : 's'}${quality < 0.8 ? ', stiff from the ground' : ''}.`);
  } else if (o.awake) game.say(`You rest ${slept} hour${slept === 1 ? '' : 's'}.`);
  game.refresh();
  return slept;
}

/** Drinking from water beside (a river, a lake, a well, a fountain), and filling waterskins. */
function drinkHere(): void {
  const n = needs();
  const inv = screen.player?.get(Inventory);
  if (!n) return;
  let found = '';
  for (let dy = -1; dy <= 1 && !found; dy++) for (let dx = -1; dx <= 1 && !found; dx++) {
    const x = game.px + dx, y = game.py + dy;
    const gd = GROUND_TILES[game.map.ground(x, y)];
    const od = OBJECT_TILES[game.map.object(x, y)];
    if (od?.name === 'well' || od?.name === 'fountain') found = od.look;
    else if (gd?.water) found = 'the water';
  }
  if (!found) {
    game.say('There is no water here to drink.');
    // Search the land about for some (Survival).
    if (!indoors()) practice.findWater();
    return;
  }
  const took = n.drink(n.room().litres);
  let filled = 0;
  for (const it of inv?.d.items ?? []) {
    const d = defOf(it);
    if (d.id === 'waterskin' && d.uses && (it.uses ?? 0) < d.uses) {
      it.uses = d.uses;
      filled++;
    }
  }
  game.time += 30 + took * 60 + filled * 60;
  game.say(`${took > 0.05 ? `You drink from ${found}` : `You are not thirsty, but you wet your lips at ${found}`}${filled ? `, and fill ${filled === 1 ? 'your waterskin' : `${filled} waterskins`}` : ''}.`);
  game.updateHud();
}
screen.describe(game.time);
const tiles = new Tileset();
/** On foot (the local map) or travelling (the travel map). */
const mode = ref<'local' | 'travel'>('local');
const travel = new Travel(game, [o.site.lon, o.site.lat], app.worker.requestRoute);
const travelRef = ref<InstanceType<typeof TravelView> | null>(null);
travel.requestSite = app.worker.site;
travel.onStep = (st) => practice.travelStep(st, invSlow());
// Arriving at a town or city opens its city view; a village opens straight onto the local map.
travel.onArrive = (site) => {
  if (!site) return;
  const at = site.gate ? { lon: site.gate.lon, lat: site.gate.lat } : { lon: site.lon, lat: site.lat };
  if (site.tier === 'town' || site.tier === 'city') void screen.openCity(site.id, at);
  else toLocal();
};
screen.hooks = {
  now: () => game.time,
  advance: (sec) => {
    game.time += Math.max(0, Math.round(sec));
    game.updateHud();
  },
  say: (t) => game.say(t),
  party: () => travel.party(),
  toLocalAt: (lon, lat) => {
    travel.placeAt(lon, lat);
    toLocal();
  },
  toTravelAt: (lon, lat) => {
    travel.placeAt(lon, lat);
    if (mode.value !== 'travel') toTravel();
  },
  game: () => game,
  redraw: () => redraw(),
  sleep: (h, q, opts) => sleep(h, q, opts),
  mode: () => mode.value,
  sky: () => sky,
  readSky: () => readSky(),
  loadAround: (r) => loadAround(r),
};

/** Asks for the local map about the wanderer and waits until it is made (at most half a minute). */
async function loadAround(r: number): Promise<boolean> {
  map.want(game.px - r, game.py - r, game.px + r, game.py + r);
  const ready = () => [[-r, -r], [r, -r], [-r, r], [r, r], [0, 0]].every(([dx, dy]) => map.loaded(game.px + dx, game.py + dy));
  for (let i = 0; i < 300 && !ready(); i++) await new Promise((res) => setTimeout(res, 100));
  return ready();
}
// The load carried, and hunger, thirst, fatigue and cold, slow the wanderer.
game.loadSlow = () => invSlow() * (needs()?.slow() ?? 1) * groundSlow();
// Weather on the road: deep snow and mud slow it (in loadSlow), and the dark, fog and rain shorten sight.
travel.sightFactor = () => {
  const w = sky.w;
  return Math.max(0.1, Math.min(1, 0.15 + sky.light)) * (1 - w.fog * 0.7) * (w.rainMm > 3 ? 0.5 : w.kind.includes('snow') ? 0.6 : 1);
};

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
if (import.meta.env.DEV) Object.assign(window, { __game: game, __renderer: renderer, __travel: travel, __play: screen, __practice: practice });

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
  } else if (e.code === 'KeyQ') {
    drinkHere();
  } else if (e.code === 'KeyV' && hud.town) {
    void screen.openCity(hud.town.id);
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
  rain.mount(el.value!);
  applySky(weather.sky(game.time));
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
  rain.destroy();
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
      :request-plan="app.worker.plan"
      @zoom-in="toLocal"
      @camp="screen.showCamp()"
      :dark="darkness"
    />
    <aside class="panel">
      <div v-if="screen.state.name" class="who">
        <a href="#" @click.prevent="screen.showSheet()">{{ screen.state.name }}</a>
        <span class="dim">{{ screen.state.line }}</span>
      </div>
      <div v-if="screen.state.needs.length" class="needs">
        <div v-for="n in screen.state.needs" :key="n.id" class="need" :class="{ bad: n.bar < 0.35, warn: n.bar < 0.6 }">
          <span class="nl">{{ n.label }}</span>
          <span class="nb"><span :style="{ width: `${Math.round(n.bar * 100)}%` }" /></span>
          <span class="nw">{{ n.word }}</span>
        </div>
        <div v-if="screen.state.weather" class="dim air">
          <div>{{ screen.state.weather.when }}</div>
          <div>{{ screen.state.weather.wind }}</div>
          <div>{{ screen.state.weather.air }}</div>
          <div>{{ screen.state.weather.sun }}</div>
        </div>
        <div v-else class="dim air">{{ screen.state.air }}</div>
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
      <button v-if="mode === 'local'" class="travel-btn" @click="toTravel">Travel map (T)</button>
      <button v-if="screen.player" class="travel-btn" @click="screen.showInventory()">Inventory (I)</button>
      <button v-if="screen.player && mode === 'local'" class="travel-btn" @click="screen.showCamp()">Camp (Shift+C)</button>
      <button v-if="mode === 'local' && hud.town" class="travel-btn" @click="screen.openCity(hud.town.id)">View {{ hud.town.name }} (V)</button>
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
