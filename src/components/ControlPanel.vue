<script setup lang="ts">
import { reactive, ref } from 'vue';
import { LAYERS, type LayerId } from '../render/tiles';
import { flyTarget, randomSeed, regenerate, settingsChanged, store, world } from '../store';
import { downloadBlob, readWorldFile, worldFileName, worldFileText } from '../export/worldfile';
import type { UrlParams } from '../url-params';
import RangeField from './RangeField.vue';

const collapsed = ref(false);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const RESOLUTIONS = [
  { value: 512, label: 'Low (512 × 256)' },
  { value: 1024, label: 'Medium (1024 × 512)' },
  { value: 2048, label: 'High (2048 × 1024)' },
  { value: 4096, label: 'Ultra (4096 × 2048)' },
];

function randomize(): void {
  store.params.seed = randomSeed();
  regenerate();
}

// ---- Save, load and export (export/worldfile.ts, export/zip.ts) ----
const fileIn = ref<HTMLInputElement | null>(null);
const exp = reactive({ busy: false, stage: '', pct: 0, error: '', max: 25, residents: true });
/** The settings the shown world was made with (not those changed since). */
const madeParams = (): UrlParams => (store.madeWith ? JSON.parse(store.madeWith) : { ...store.params });

function saveWorld(): void {
  const p = madeParams();
  const text = worldFileText(p, { center: store.center, zoom: store.zoom, layer: store.layer });
  downloadBlob(new Blob([text], { type: 'application/json' }), worldFileName(p.seed));
}
async function loadWorld(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  exp.error = '';
  try {
    const { view } = readWorldFile(await file.text(), store.params);
    await regenerate();
    if (view) {
      if (view.layer && LAYERS.some((l) => l.id === view.layer)) store.layer = view.layer as LayerId;
      flyTarget.value = { lon: view.center[0], lat: view.center[1], zoom: view.zoom, name: '', t: performance.now(), quiet: true };
    }
  } catch (err) {
    exp.error = err instanceof Error ? err.message : String(err);
  }
}
async function exportData(): Promise<void> {
  const w = world.value;
  if (!w || exp.busy) return;
  exp.busy = true;
  exp.error = '';
  try {
    // Loaded on first use: the export code stays out of the page until it is wanted.
    const { exportGameData } = await import('../export/zip');
    const p = madeParams();
    const blob = await exportGameData(w, p, { bounds: store.bounds, maxTowns: exp.max, residents: exp.residents }, (stage, pct) => {
      exp.stage = stage;
      exp.pct = pct;
    });
    downloadBlob(blob, `${worldFileName(p.seed).replace(/\.world\.json$/, '')}.gamedata.zip`);
  } catch (err) {
    exp.error = err instanceof Error ? err.message : String(err);
  } finally {
    exp.busy = false;
  }
}
</script>

<template>
  <aside class="panel" :class="{ collapsed }">
    <header>
      <h1>World Forge</h1>
      <button class="icon" :aria-label="collapsed ? 'Expand panel' : 'Collapse panel'" @click="collapsed = !collapsed">
        {{ collapsed ? '+' : '−' }}
      </button>
    </header>

    <div v-show="!collapsed" class="body">
      <section>
        <h2>World</h2>
        <label class="field">
          <span>Seed</span>
          <div class="row">
            <input v-model.trim="store.params.seed" type="text" spellcheck="false" @keydown.enter="regenerate" />
            <button title="A new seed, and a new world" @click="randomize">Random</button>
          </div>
        </label>
        <RangeField
          v-model="store.params.landFraction" label="Land mass" :min="0.1" :max="0.8" :step="0.01"
          :format="pct" hint="Share of the surface above sea level"
        />
        <RangeField
          v-model="store.params.plates" label="Tectonic plates" :min="3" :max="40" :step="1"
          hint="More plates = more, smaller continents and more mountain belts"
        />
        <RangeField
          v-model="store.params.erosion" label="Erosion" :min="0" :max="1" :step="0.05"
          :format="pct" hint="Strength of river erosion carving valleys"
        />
        <RangeField
          v-model="store.params.settled" label="Settled world" :min="0.2" :max="1" :step="0.05"
          :format="pct" hint="Share of the land that is the settled Old World; the rest is a sparse, tribal New World with a few colonies"
        />
        <RangeField
          v-model="store.params.drift" label="Language drift" :min="0" :max="1" :step="0.05"
          :format="pct" hint="How far each culture's language strays from its familiar template: low keeps names familiar, high makes them strange"
        />
        <label class="check" title="Elves, dwarves, halflings, orcs and lizardfolk besides humans; off, every people is human">
          <input v-model="store.params.races" type="checkbox" />
          Fantasy races
        </label>
        <label class="field">
          <span>Detail</span>
          <select v-model.number="store.params.resolution">
            <option v-for="r in RESOLUTIONS" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
        </label>
        <button class="primary" :class="{ pending: settingsChanged() }" :disabled="store.generating" @click="regenerate">
          {{ store.generating ? 'Generating…' : 'Generate' }}
        </button>
        <p v-if="!store.generating && settingsChanged()" class="pending-note">Settings changed: press Generate to make the world anew.</p>
        <div v-if="store.generating" class="progress">
          <div class="bar" :style="{ width: `${Math.round(store.progress * 100)}%` }" />
          <span>{{ store.stage }}</span>
        </div>
        <p v-else-if="store.summary" class="summary">
          {{ store.summary.W }}×{{ store.summary.H }} in {{ (store.summary.genMs / 1000).toFixed(1) }}s ·
          land {{ store.summary.landPercent.toFixed(0) }}% · peak {{ Math.round(store.summary.maxElevation) }} m ·
          {{ store.summary.cities }} cities, {{ store.summary.towns }} towns
        </p>
        <p v-if="store.error" class="error">{{ store.error }}</p>
      </section>

      <section>
        <h2>Map layer</h2>
        <div class="layers">
          <label v-for="l in LAYERS.filter((q) => q.id !== 'underworld' || world?.raster.underworld)" :key="l.id" class="layer" :class="{ active: store.layer === l.id }">
            <input v-model="store.layer" type="radio" name="layer" :value="l.id" />
            {{ l.label }}
          </label>
        </div>
        <label class="check">
          <input v-model="store.showRivers" type="checkbox" />
          Rivers
        </label>
        <label class="check">
          <input v-model="store.showSettlements" type="checkbox" />
          Settlements &amp; roads
        </label>
        <label class="check" title="Draw town plans as an old bird's-eye map: raised buildings, roofs, walls and trees. The map turns to face north at plan zoom.">
          <input v-model="store.illustratedTowns" type="checkbox" :disabled="!store.showSettlements" />
          Illustrated towns
        </label>
        <label class="check">
          <input v-model="store.showLabels" type="checkbox" />
          Place names
        </label>
        <label class="field names-in">
          <span>Names in</span>
          <select v-model="store.labelMode" title="Letter places in their own languages, in English (their meanings), or both">
            <option value="native">Local languages</option>
            <option value="english">English</option>
            <option value="both">Both</option>
          </select>
        </label>
        <label class="check">
          <input v-model="store.showBorders" type="checkbox" />
          Borders
        </label>
        <label class="check">
          <input v-model="store.showPolitical" type="checkbox" />
          Political map
        </label>
        <label class="check">
          <input v-model="store.showFaiths" type="checkbox" />
          Faith map
        </label>
        <label class="check">
          <input v-model="store.showCultures" type="checkbox" />
          Culture map
        </label>
        <label class="check">
          <input v-model="store.showRaces" type="checkbox" />
          Race map
        </label>
        <label class="check">
          <input v-model="store.showWind" type="checkbox" />
          Prevailing winds
        </label>
        <label class="check">
          <input v-model="store.showCurrents" type="checkbox" />
          Ocean currents
        </label>
      </section>

      <section>
        <h2>Save &amp; export</h2>
        <div class="row">
          <button :disabled="!world || store.generating" title="Save the seed, the settings and the view in a small file that makes this world again" @click="saveWorld">Save world</button>
          <button :disabled="store.generating" title="Open a saved world file and make its world" @click="fileIn?.click()">Load world</button>
          <input ref="fileIn" type="file" accept=".json,application/json" hidden @change="loadWorld" />
        </div>
        <label class="field">
          <span>Towns in full</span>
          <select v-model.number="exp.max" title="How many cities, towns and villages of the map view to export with every building">
            <option :value="0">None</option>
            <option :value="10">Up to 10</option>
            <option :value="25">Up to 25</option>
            <option :value="60">Up to 60</option>
          </select>
        </label>
        <label class="check" title="The households of every building: names, ages, trades and ties">
          <input v-model="exp.residents" type="checkbox" :disabled="exp.max === 0" />
          Residents of each building
        </label>
        <button class="primary" :disabled="!world || store.generating || exp.busy" @click="exportData">
          {{ exp.busy ? 'Exporting…' : 'Export game data (.zip)' }}
        </button>
        <div v-if="exp.busy" class="progress">
          <div class="bar" :style="{ width: `${Math.round(exp.pct * 100)}%` }" />
          <span>{{ exp.stage }}</span>
        </div>
        <p v-else class="summary">World data, height and climate grids, and the towns of the map view (the largest first). Zoom to the region you want in full.</p>
        <p v-if="exp.error" class="error">{{ exp.error }}</p>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.panel {
  position: absolute;
  top: 10px;
  left: 10px;
  width: 280px;
  max-height: calc(100% - 20px);
  overflow-y: auto;
  background: rgba(16, 22, 32, 0.88);
  backdrop-filter: blur(6px);
  color: #dfe6ee;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  font-size: 13px;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
}
h1 {
  margin: 0;
  font-size: 17px;
  letter-spacing: 0.04em;
  color: #e9c37a;
}
h2 {
  margin: 0 0 8px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #8195a8;
}
.body {
  padding: 0 14px 14px;
}
section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.row {
  display: flex;
  gap: 6px;
}
.row input {
  flex: 1;
  min-width: 0;
}
input[type='text'],
select {
  background: #1d2735;
  color: inherit;
  border: 1px solid #334256;
  border-radius: 4px;
  padding: 6px 8px;
  font: inherit;
}
button {
  background: #2a3647;
  color: inherit;
  border: 1px solid #3a4a60;
  border-radius: 4px;
  padding: 6px 10px;
  font: inherit;
  cursor: pointer;
}
button:hover:not(:disabled) {
  background: #344358;
}
button.primary {
  background: #b9842f;
  border-color: #d9a54a;
  color: #1a1206;
  font-weight: 600;
}
button.primary:hover:not(:disabled) {
  background: #d09538;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
button.icon {
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 16px;
}
.progress {
  position: relative;
  height: 20px;
  background: #1d2735;
  border-radius: 4px;
  overflow: hidden;
}
.progress .bar {
  position: absolute;
  inset: 0 auto 0 0;
  background: #5b4520;
  transition: width 0.2s;
}
.progress span {
  position: relative;
  padding-left: 8px;
  line-height: 20px;
  font-size: 11px;
}
.pending-note {
  margin: 0;
  color: #e9c37a;
  font-size: 11px;
}
button.primary.pending {
  box-shadow: 0 0 0 2px rgba(233, 195, 122, 0.55);
}
.summary {
  margin: 0;
  color: #8195a8;
  font-size: 11px;
}
.error {
  margin: 0;
  color: #f08a7a;
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.layers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.layer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  background: #1d2735;
  cursor: pointer;
  font-size: 12px;
}
.layer input {
  display: none;
}
.layer.active {
  background: #3a4a60;
  color: #fff;
}
.check {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

@media (max-width: 768px) {
  .panel {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    max-height: 55vh;
    border-radius: 12px 12px 0 0;
  }
  button,
  input[type='text'],
  select,
  .layer,
  .check {
    min-height: 44px;
  }
  button.icon {
    width: 44px;
    height: 44px;
  }
}
</style>
