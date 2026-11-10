<script setup lang="ts">
/**
 * The start screen (make or load a world, choose where to begin) and then the game itself.
 */
import { computed, ref, shallowRef } from 'vue';
import type { WorldSettings } from '@worldforge/core/settings';
import { readWorldFile } from '@worldforge/core/export/worldfile';
import { GENERATOR_VERSION } from '@worldforge/core/version';
import type { FromWorker, LocalSite, StartSite, ToWorker, ChunkData } from './worker/protocol';
import PlayView from './components/PlayView.vue';
import { desktop, readJson, writeJson, type DesktopInfo } from './desktop';

const worker = new Worker(new URL('./worker/game.worker.ts', import.meta.url), { type: 'module' });
const send = (m: ToWorker) => worker.postMessage(m);

const settings = ref<WorldSettings>({ seed: 'forge', landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 512 });
const stage = ref<'setup' | 'making' | 'choose' | 'starting' | 'play'>('setup');
const progress = ref({ stage: '', pct: 0 });
const error = ref('');
const note = ref('');
const starts = ref<StartSite[]>([]);
const filter = ref('');
const chosen = ref('');
const viewCentre = ref<[number, number] | null>(null);
const begun = shallowRef<{ site: StartSite; tile: [number, number]; sites: LocalSite[] } | null>(null);
/** Chunks arriving from the worker go to the game. */
const chunkSink = shallowRef<(c: ChunkData) => void>(() => {});

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const m = e.data;
  if (m.type === 'progress') progress.value = { stage: m.stage, pct: m.pct };
  else if (m.type === 'error') {
    error.value = m.message;
    if (stage.value !== 'play') stage.value = starts.value.length ? 'choose' : 'setup';
  } else if (m.type === 'world') {
    starts.value = m.starts;
    // A world file saved with a view: start at the town nearest where the atlas was looking.
    const vc = viewCentre.value;
    const near = vc ? [...m.starts].sort((a, b) => Math.hypot(a.lon - vc[0], a.lat - vc[1]) - Math.hypot(b.lon - vc[0], b.lat - vc[1]))[0] : m.starts[0];
    // Otherwise, on the desktop, where this seed was last begun.
    const last = remembered.value.start;
    const again = !vc && last && last.seed === settings.value.seed ? m.starts.find((s) => s.id === last.id) : undefined;
    chosen.value = (again ?? near)?.id ?? '';
    stage.value = 'choose';
  } else if (m.type === 'started') {
    begun.value = { site: m.site, tile: m.tile, sites: m.sites };
    stage.value = 'play';
  } else if (m.type === 'chunk') chunkSink.value(m.chunk);
};

/** What the desktop app remembers between runs (data/settings.json). */
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
    if (what !== 'open-world') return;
    if (stage.value === 'making' || stage.value === 'starting') return;
    stage.value = 'setup';
    void openNative();
  });
}

function makeWorld(): void {
  if (desktop) {
    remembered.value = { ...remembered.value, settings: { ...settings.value } };
    void writeJson('settings.json', remembered.value);
  }
  error.value = '';
  progress.value = { stage: 'Starting', pct: 0 };
  stage.value = 'making';
  send({ type: 'world', settings: { ...settings.value } });
}

async function loadFile(e: Event): Promise<void> {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) useWorldText(await f.text());
}

/** The desktop app's own file dialog. */
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

function begin(): void {
  if (!chosen.value) return;
  stage.value = 'starting';
  if (desktop) {
    remembered.value = { ...remembered.value, start: { seed: settings.value.seed, id: chosen.value } };
    void writeJson('settings.json', remembered.value);
  }
  progress.value = { stage: 'Laying out the town', pct: 0.5 };
  send({ type: 'start', id: chosen.value });
}

const shown = computed(() => {
  const q = filter.value.trim().toLowerCase();
  const list = q ? starts.value.filter((s) => s.name.toLowerCase().includes(q)) : starts.value;
  return list.slice(0, 60);
});

function requestChunk(cx: number, cy: number): void {
  send({ type: 'chunk', cx, cy });
}
</script>

<template>
  <div v-if="stage !== 'play'" class="start">
    <h1>World Forge <span>Wanderer</span></h1>
    <p class="sub">Walk a generated world on foot, a pace and a half at a time.</p>

    <section v-if="stage === 'setup'" class="card">
      <label>Seed <input v-model="settings.seed" @keyup.enter="makeWorld" /></label>
      <label>Detail
        <select v-model.number="settings.resolution">
          <option :value="512">512 (quick)</option>
          <option :value="1024">1024</option>
          <option :value="2048">2048 (slow)</option>
        </select>
      </label>
      <div class="row">
        <button class="primary" @click="makeWorld">Make the world</button>
        <button v-if="desktop" @click="openNative">Load a world file…</button>
        <label v-else class="file">Load a world file<input type="file" accept=".world,.json,application/json" @change="loadFile" /></label>
      </div>
      <p class="hint">Other settings keep their atlas defaults; a world file saved from the atlas brings its own.</p>
    </section>

    <section v-else-if="stage === 'making' || stage === 'starting'" class="card">
      <p>{{ progress.stage }}…</p>
      <div class="bar"><div :style="{ width: `${Math.round(progress.pct * 100)}%` }" /></div>
    </section>

    <section v-else-if="stage === 'choose'" class="card">
      <p v-if="note" class="note">{{ note }}</p>
      <label>Where to begin <input v-model="filter" placeholder="Filter by name" /></label>
      <ul class="sites">
        <li v-for="s in shown" :key="s.id" :class="{ on: s.id === chosen }" @click="chosen = s.id" @dblclick="begin">
          <b>{{ s.name }}</b> <span>{{ s.tier }}, {{ s.population.toLocaleString() }} people</span>
        </li>
      </ul>
      <div class="row">
        <button class="primary" :disabled="!chosen" @click="begin">Begin</button>
        <button @click="stage = 'setup'">Another world</button>
      </div>
    </section>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="info" class="hint desk">
      Desktop {{ info.version }} · Electron {{ info.electron }} ·
      <a href="#" @click.prevent="desktop!.data.show()">data folder</a>
    </p>
  </div>

  <PlayView
    v-else-if="begun"
    :site="begun.site"
    :start="begun.tile"
    :sites="begun.sites"
    :request="requestChunk"
    @sink="(f: (c: ChunkData) => void) => (chunkSink = f)"
    @quit="stage = 'choose'"
  />
</template>
