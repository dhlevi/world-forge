<script setup lang="ts">
import { ref } from 'vue';
import { LAYERS } from '../render/tiles';
import { randomSeed, regenerate, store } from '../store';
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
</script>

<template>
  <aside class="panel" :class="{ collapsed }">
    <header>
      <h1>Map Forge</h1>
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
            <input v-model.trim="store.params.seed" type="text" spellcheck="false" @change="regenerate" />
            <button @click="randomize">Random</button>
          </div>
        </label>
        <RangeField
          v-model="store.params.landFraction" label="Land mass" :min="0.1" :max="0.8" :step="0.01"
          :format="pct" hint="Share of the surface above sea level" @commit="regenerate"
        />
        <RangeField
          v-model="store.params.plates" label="Tectonic plates" :min="3" :max="40" :step="1"
          hint="More plates = more, smaller continents and more mountain belts" @commit="regenerate"
        />
        <RangeField
          v-model="store.params.erosion" label="Erosion" :min="0" :max="1" :step="0.05"
          :format="pct" hint="Strength of river erosion carving valleys" @commit="regenerate"
        />
        <RangeField
          v-model="store.params.settled" label="Settled world" :min="0.2" :max="1" :step="0.05"
          :format="pct" hint="Share of the land that is the settled Old World; the rest is a sparse, tribal New World with a few colonies" @commit="regenerate"
        />
        <label class="field">
          <span>Detail</span>
          <select v-model.number="store.params.resolution" @change="regenerate">
            <option v-for="r in RESOLUTIONS" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
        </label>
        <button class="primary" :disabled="store.generating" @click="regenerate">
          {{ store.generating ? 'Generating…' : 'Generate' }}
        </button>
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
          <label v-for="l in LAYERS" :key="l.id" class="layer" :class="{ active: store.layer === l.id }">
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
        <label class="check">
          <input v-model="store.showLabels" type="checkbox" />
          Place names
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
          <input v-model="store.showWind" type="checkbox" />
          Prevailing winds
        </label>
        <label class="check">
          <input v-model="store.showCurrents" type="checkbox" />
          Ocean currents
        </label>
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
.summary {
  margin: 0;
  color: #8195a8;
  font-size: 11px;
}
.error {
  margin: 0;
  color: #f08a7a;
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
