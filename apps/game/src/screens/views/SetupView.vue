<script setup lang="ts">
/** A new world: the seed, detail and the generator's main settings, or a world file. */
import { desktop } from '../../desktop';
import type { SetupScreen } from '../menus';

const props = defineProps<{ screen: SetupScreen }>();
const app = props.screen.app;
const st = app.state;
const ui = props.screen.state;

const SLIDERS: { field: 'landFraction' | 'plates' | 'erosion' | 'settled' | 'drift'; label: string; min: number; max: number; step: number }[] = [
  { field: 'landFraction', label: 'Land', min: 0.1, max: 0.8, step: 0.01 },
  { field: 'plates', label: 'Tectonic plates', min: 3, max: 40, step: 1 },
  { field: 'erosion', label: 'Erosion', min: 0, max: 1, step: 0.05 },
  { field: 'settled', label: 'Settled', min: 0.2, max: 1, step: 0.05 },
  { field: 'drift', label: 'Language drift', min: 0, max: 1, step: 0.05 },
];

async function loadFile(e: Event): Promise<void> {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) app.useWorldText(await f.text());
}
</script>

<template>
  <div class="start">
    <h2 class="screen-title">A new world</h2>
    <section class="card">
      <label>Seed
        <span class="row"><input v-model="st.settings.seed" class="grow" @keyup.enter="app.makeWorld()" /><button @click="screen.randomSeed()">Random</button></span>
      </label>
      <label>Detail
        <select v-model.number="st.settings.resolution">
          <option :value="512">512 (quick)</option>
          <option :value="1024">1024</option>
          <option :value="2048">2048 (slow)</option>
        </select>
      </label>
      <a href="#" class="more" @click.prevent="ui.showMore = !ui.showMore">{{ ui.showMore ? 'Fewer settings' : 'More settings' }}</a>
      <div v-if="ui.showMore" class="sliders">
        <label v-for="s in SLIDERS" :key="s.field">{{ s.label }} <b>{{ st.settings[s.field] }}</b>
          <input v-model.number="st.settings[s.field]" type="range" :min="s.min" :max="s.max" :step="s.step" />
        </label>
        <label class="check"><input v-model="st.settings.races" type="checkbox" /> Elves, dwarves and other peoples</label>
      </div>
      <div class="row">
        <button class="primary" @click="app.makeWorld()">Make the world</button>
        <button v-if="desktop" @click="app.openWorldFile()">Load a world file…</button>
        <label v-else class="file">Load a world file<input type="file" accept=".world,.json,application/json" @change="loadFile" /></label>
        <button @click="app.toTitle()">Back</button>
      </div>
      <p class="hint">A world file saved from the atlas brings its own settings, and the game begins near where the atlas was looking.</p>
    </section>
    <p v-if="st.error" class="error">{{ st.error }}</p>
  </div>
</template>
