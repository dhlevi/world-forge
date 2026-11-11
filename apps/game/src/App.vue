<script setup lang="ts">
/**
 * The way into the game: the title (new game, continue, load, options, quit), making or loading a
 * world, viewing it and choosing where to begin, and then the game itself.
 */
import { computed, ref, shallowRef } from 'vue';
import { type WorldSettings, settingsQuery } from '@worldforge/core/settings';
import { readWorldFile } from '@worldforge/core/export/worldfile';
import { GENERATOR_VERSION } from '@worldforge/core/version';
import type { FromWorker, LocalSite, StartSite, ToWorker, ChunkData, ViewLayer, WorldSummary } from './worker/protocol';
import PlayView from './components/PlayView.vue';
import WorldView from './components/WorldView.vue';
import { desktop, readJson, writeJson, type DesktopInfo } from './desktop';
import { deleteSave, exportSave, listSaves, loadSave, newGameId, readSave, versionNote, writeSave, type SaveFile, type SaveSummary } from './game/save';

/** The published atlas, to open the same world in for a closer look. */
const ATLAS_URL = 'https://dhlevi.github.io/world-forge/';

const worker = new Worker(new URL('./worker/game.worker.ts', import.meta.url), { type: 'module' });
const send = (m: ToWorker) => worker.postMessage(m);

type Stage = 'title' | 'load' | 'setup' | 'making' | 'view' | 'starting' | 'play';
const stage = ref<Stage>('title');
const settings = ref<WorldSettings>({ seed: 'forge', landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 512 });
const showMore = ref(false);
const progress = ref({ stage: '', pct: 0 });
const error = ref('');
const note = ref('');
const starts = ref<StartSite[]>([]);
const summary = ref<WorldSummary | null>(null);
const filter = ref('');
const chosen = ref('');
const layer = ref<ViewLayer>('fantasy');
const viewCentre = ref<[number, number] | null>(null);
/** The settings the current world was made with (the form may have changed since). */
const worldSettings = ref<WorldSettings | null>(null);
const begun = shallowRef<{ site: StartSite; tile: [number, number]; sites: LocalSite[]; gameId: string; settings: WorldSettings; restore: SaveFile | null } | null>(null);
const saves = ref<SaveSummary[]>([]);
/** A saved game being loaded: the world is made from its settings, then it is started and restored. */
const loading = shallowRef<SaveFile | null>(null);
const chunkSink = shallowRef<(c: ChunkData) => void>(() => {});

// ---- Map tiles for the world view -----------------------------------------------------------------

let tileId = 0;
const tileWaits = new Map<number, (b: ImageBitmap | null) => void>();
function requestTile(z: number, x: number, y: number, l: ViewLayer): Promise<ImageBitmap | null> {
  const id = ++tileId;
  return new Promise((res) => {
    tileWaits.set(id, res);
    send({ type: 'tile', id, z, x, y, layer: l });
  });
}

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const m = e.data;
  if (m.type === 'progress') progress.value = { stage: m.stage, pct: m.pct };
  else if (m.type === 'tile') {
    tileWaits.get(m.id)?.(m.bitmap);
    tileWaits.delete(m.id);
  } else if (m.type === 'error') {
    error.value = m.message;
    loading.value = null;
    if (stage.value !== 'play') stage.value = starts.value.length ? 'view' : 'setup';
  } else if (m.type === 'world') {
    starts.value = m.starts;
    summary.value = m.summary;
    const ld = loading.value;
    if (ld) {
      // Carrying on a saved game: straight back to where it began.
      if (!m.starts.some((s) => s.id === ld.start.siteId)) {
        error.value = `The saved game began in ${ld.start.siteName}, which this world no longer has.`;
        loading.value = null;
        stage.value = 'load';
        return;
      }
      chosen.value = ld.start.siteId;
      stage.value = 'starting';
      progress.value = { stage: `Returning to ${ld.place}`, pct: 0.5 };
      send({ type: 'start', id: ld.start.siteId });
      return;
    }
    // A world file saved with a view: start at the town nearest where the atlas was looking;
    // otherwise, on the desktop, where this seed was last begun; otherwise the largest city.
    const vc = viewCentre.value;
    const near = vc ? [...m.starts].sort((a, b) => Math.hypot(a.lon - vc[0], a.lat - vc[1]) - Math.hypot(b.lon - vc[0], b.lat - vc[1]))[0] : m.starts[0];
    const last = remembered.value.start;
    const again = !vc && last && last.seed === settings.value.seed ? m.starts.find((s) => s.id === last.id) : undefined;
    chosen.value = (again ?? near)?.id ?? '';
    filter.value = '';
    stage.value = 'view';
  } else if (m.type === 'started') {
    const ld = loading.value;
    begun.value = { site: m.site, tile: m.tile, sites: m.sites, gameId: ld?.id ?? newGameId(), settings: { ...(worldSettings.value ?? settings.value) }, restore: ld };
    loading.value = null;
    stage.value = 'play';
  } else if (m.type === 'chunk') chunkSink.value(m.chunk);
};

// ---- What the desktop app remembers ------------------------------------------------------------------

interface Remembered { settings?: WorldSettings; start?: { seed: string; id: string } }
const remembered = ref<Remembered>({});
const info = ref<DesktopInfo | null>(null);
if (desktop) {
  void desktop.info().then((i) => (info.value = i));
  void readJson<Remembered>('settings.json', {}).then((r) => {
    remembered.value = r;
    if (r.settings) settings.value = { ...settings.value, ...r.settings };
  });
  desktop.onMenu((what) => {
    if (what !== 'open-world' || stage.value === 'play' || stage.value === 'making' || stage.value === 'starting') return;
    stage.value = 'setup';
    void openNative();
  });
}

async function refreshSaves(): Promise<void> {
  saves.value = await listSaves();
}
void refreshSaves();

// ---- Title -------------------------------------------------------------------------------------------

function newGame(): void {
  error.value = '';
  note.value = '';
  viewCentre.value = null;
  stage.value = 'setup';
}

function quitApp(): void {
  void desktop?.quit();
}

// ---- A new world -------------------------------------------------------------------------------------

const SLIDERS: { field: 'landFraction' | 'plates' | 'erosion' | 'settled' | 'drift'; label: string; min: number; max: number; step: number }[] = [
  { field: 'landFraction', label: 'Land', min: 0.1, max: 0.8, step: 0.01 },
  { field: 'plates', label: 'Tectonic plates', min: 3, max: 40, step: 1 },
  { field: 'erosion', label: 'Erosion', min: 0, max: 1, step: 0.05 },
  { field: 'settled', label: 'Settled', min: 0.2, max: 1, step: 0.05 },
  { field: 'drift', label: 'Language drift', min: 0, max: 1, step: 0.05 },
];

const WORDS = ['ash', 'brook', 'crown', 'dusk', 'ember', 'fern', 'gale', 'heath', 'iron', 'moor', 'oak', 'raven', 'salt', 'thorn', 'vale', 'wold'];
function randomSeed(): void {
  const w = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  settings.value.seed = `${w()}-${w()}-${Math.floor(Math.random() * 100)}`;
}

function makeWorld(): void {
  if (desktop) {
    remembered.value = { ...remembered.value, settings: { ...settings.value } };
    void writeJson('settings.json', remembered.value);
  }
  error.value = '';
  progress.value = { stage: 'Starting', pct: 0 };
  stage.value = 'making';
  worldSettings.value = { ...settings.value };
  send({ type: 'world', settings: { ...settings.value } });
}

async function loadFile(e: Event): Promise<void> {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) useWorldText(await f.text());
}

async function openNative(): Promise<void> {
  try {
    const f = await desktop!.openWorldFile();
    if (f) useWorldText(f.text);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

function useWorldText(text: string): void {
  error.value = '';
  try {
    const s = { ...settings.value };
    const r = readWorldFile(text, s);
    settings.value = s;
    viewCentre.value = r.view?.center ?? null;
    note.value = r.generator !== GENERATOR_VERSION ? `This file was saved by generator version ${r.generator}; this game makes version ${GENERATOR_VERSION}, so the world may differ slightly.` : '';
    makeWorld();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

// ---- The world view: choosing where to begin ----------------------------------------------------------

const shown = computed(() => {
  const q = filter.value.trim().toLowerCase();
  const list = q ? starts.value.filter((s) => s.name.toLowerCase().includes(q) || (s.realm ?? '').toLowerCase().includes(q)) : starts.value;
  return list.slice(0, 80);
});
const chosenSite = computed(() => starts.value.find((s) => s.id === chosen.value) ?? null);
const atlasLink = computed(() => {
  const s = worldSettings.value;
  if (!s) return ATLAS_URL;
  const c = chosenSite.value;
  return `${ATLAS_URL}?${settingsQuery(s)}${c ? `#9/${c.lat.toFixed(4)}/${c.lon.toFixed(4)}` : ''}`;
});

function begin(): void {
  if (!chosen.value) return;
  stage.value = 'starting';
  if (desktop) {
    remembered.value = { ...remembered.value, start: { seed: settings.value.seed, id: chosen.value } };
    void writeJson('settings.json', remembered.value);
  }
  progress.value = { stage: `Laying out ${chosenSite.value?.name ?? 'the town'}`, pct: 0.5 };
  send({ type: 'start', id: chosen.value });
}

// ---- Saved games ------------------------------------------------------------------------------------

async function continueGame(id: string): Promise<void> {
  error.value = '';
  try {
    const s = await loadSave(id);
    if (!s) throw new Error('That saved game could not be read.');
    startFromSave(s);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

function startFromSave(s: SaveFile): void {
  loading.value = s;
  settings.value = { ...settings.value, ...s.settings };
  viewCentre.value = null;
  note.value = versionNote(s);
  makeWorld();
}

async function importSaveFile(e: Event): Promise<void> {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  error.value = '';
  try {
    const s = readSave(await f.text());
    await writeSave(s);
    await refreshSaves();
    startFromSave(s);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

async function exportOne(id: string): Promise<void> {
  const s = await loadSave(id);
  if (s) exportSave(s);
}

async function removeSave(s: SaveSummary): Promise<void> {
  if (!window.confirm(`Delete the saved game "${s.place}" (${s.title})? This cannot be undone.`)) return;
  await deleteSave(s.id);
  await refreshSaves();
}

function quitGame(): void {
  stage.value = 'title';
  void refreshSaves();
}

function requestChunk(cx: number, cy: number): void {
  send({ type: 'chunk', cx, cy });
}

const when = (iso: string) => new Date(iso).toLocaleString();
const gameDay = (t: number) => `day ${Math.floor(t / 86400) + 1}`;
const goTitle = () => {
  error.value = '';
  stage.value = 'title';
};
</script>

<template>
  <!-- Title -->
  <div v-if="stage === 'title'" class="title-screen">
    <div class="title-card">
      <h1>World Forge</h1>
      <div class="subtitle">Wanderer</div>
      <nav class="menu">
        <button class="primary" @click="newGame">New game</button>
        <button v-if="saves.length" @click="continueGame(saves[0].id)">
          Continue <span class="dim">{{ saves[0].place }}, {{ gameDay(saves[0].time) }}</span>
        </button>
        <button :disabled="!saves.length" @click="stage = 'load'">Load game</button>
        <button disabled title="Not yet">Options</button>
        <button v-if="desktop" @click="quitApp">Quit</button>
      </nav>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
    <p v-if="info" class="hint desk">
      Desktop {{ info.version }} · Electron {{ info.electron }} ·
      <a href="#" @click.prevent="desktop!.data.show()">data folder</a>
    </p>
  </div>

  <!-- Load game -->
  <div v-else-if="stage === 'load'" class="start">
    <h2 class="screen-title">Load game</h2>
    <section class="card saves">
      <ul class="sites">
        <li v-for="s in saves" :key="s.id">
          <div class="save-row">
            <span><b>{{ s.place }}</b> <span>{{ s.title }}, {{ gameDay(s.time) }}; saved {{ when(s.savedAt) }}</span></span>
            <span class="btns">
              <button class="primary" @click="continueGame(s.id)">Continue</button>
              <button @click="exportOne(s.id)">Export</button>
              <button @click="removeSave(s)">Delete</button>
            </span>
          </div>
        </li>
      </ul>
      <p v-if="!saves.length" class="hint">No saved games yet.</p>
      <div class="row">
        <label class="file">Import a saved game<input type="file" accept=".json,application/json" @change="importSaveFile" /></label>
        <button @click="goTitle">Back</button>
      </div>
    </section>
    <p v-if="error" class="error">{{ error }}</p>
  </div>

  <!-- A new world -->
  <div v-else-if="stage === 'setup'" class="start">
    <h2 class="screen-title">A new world</h2>
    <section class="card">
      <label>Seed
        <span class="row"><input v-model="settings.seed" class="grow" @keyup.enter="makeWorld" /><button @click="randomSeed">Random</button></span>
      </label>
      <label>Detail
        <select v-model.number="settings.resolution">
          <option :value="512">512 (quick)</option>
          <option :value="1024">1024</option>
          <option :value="2048">2048 (slow)</option>
        </select>
      </label>
      <a href="#" class="more" @click.prevent="showMore = !showMore">{{ showMore ? 'Fewer settings' : 'More settings' }}</a>
      <div v-if="showMore" class="sliders">
        <label v-for="s in SLIDERS" :key="s.field">{{ s.label }} <b>{{ settings[s.field] }}</b>
          <input v-model.number="settings[s.field]" type="range" :min="s.min" :max="s.max" :step="s.step" />
        </label>
        <label class="check"><input v-model="settings.races" type="checkbox" /> Elves, dwarves and other peoples</label>
      </div>
      <div class="row">
        <button class="primary" @click="makeWorld">Make the world</button>
        <button v-if="desktop" @click="openNative">Load a world file…</button>
        <label v-else class="file">Load a world file<input type="file" accept=".world,.json,application/json" @change="loadFile" /></label>
        <button @click="goTitle">Back</button>
      </div>
      <p class="hint">A world file saved from the atlas brings its own settings, and the game begins near where the atlas was looking.</p>
    </section>
    <p v-if="error" class="error">{{ error }}</p>
  </div>

  <!-- Making a world, starting a game -->
  <div v-else-if="stage === 'making' || stage === 'starting'" class="start">
    <section class="card">
      <p>{{ progress.stage }}…</p>
      <div class="bar"><div :style="{ width: `${Math.round(progress.pct * 100)}%` }" /></div>
    </section>
  </div>

  <!-- The world: where to begin -->
  <div v-else-if="stage === 'view'" class="viewer">
    <WorldView class="viewer-map" :starts="starts" :chosen="chosen" :layer="layer" :request-tile="requestTile" @choose="(id: string) => (chosen = id)" />
    <aside class="viewer-panel">
      <h2>World "{{ worldSettings?.seed }}"</h2>
      <p v-if="summary" class="dim">{{ summary.cities }} cities, {{ summary.towns }} towns, {{ summary.realms }} realms; made in {{ (summary.ms / 1000).toFixed(1) }} s</p>
      <p v-if="note" class="note">{{ note }}</p>
      <div class="row layers">
        <button v-for="l in (['fantasy', 'terrain', 'biomes'] as ViewLayer[])" :key="l" :class="{ on: layer === l }" @click="layer = l">{{ l[0].toUpperCase() + l.slice(1) }}</button>
      </div>
      <a :href="atlasLink" target="_blank" rel="noopener" class="more">Open this world in the atlas</a>
      <label>Where to begin <input v-model="filter" placeholder="Filter by name or realm" /></label>
      <ul class="sites">
        <li v-for="s in shown" :key="s.id" :class="{ on: s.id === chosen }" @click="chosen = s.id" @dblclick="begin">
          <b>{{ s.name }}</b> <span>{{ s.tier }}, {{ s.population.toLocaleString() }}</span>
        </li>
      </ul>
      <div v-if="chosenSite" class="chosen">
        <b>{{ chosenSite.name }}</b>, a {{ chosenSite.tier }} of {{ chosenSite.population.toLocaleString() }} people
        <div v-if="chosenSite.realm" class="dim">{{ chosenSite.realm }}</div>
        <div v-if="chosenSite.culture" class="dim">The {{ chosenSite.culture }} people</div>
      </div>
      <p class="hint">Character creation will come in here, before the first step.</p>
      <div class="row">
        <button class="primary" :disabled="!chosen" @click="begin">Begin</button>
        <button @click="stage = 'setup'">Another world</button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </aside>
  </div>

  <PlayView
    v-else-if="stage === 'play' && begun"
    :site="begun.site"
    :start="begun.tile"
    :sites="begun.sites"
    :request="requestChunk"
    :game-id="begun.gameId"
    :settings="begun.settings"
    :restore="begun.restore"
    @sink="(f: (c: ChunkData) => void) => (chunkSink = f)"
    @quit="quitGame"
  />
</template>
