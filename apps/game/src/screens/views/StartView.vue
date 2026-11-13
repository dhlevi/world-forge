<script setup lang="ts">
/** The world, and where to begin: the start site chosen here is the character's home town. */
import { computed } from 'vue';
import { settingsQuery } from '@worldforge/core/settings';
import WorldView from '../../components/WorldView.vue';
import { ATLAS_URL } from '../../app/config';
import type { ViewLayer } from '../../worker/protocol';
import type { StartScreen } from '../menus';

const props = defineProps<{ screen: StartScreen }>();
const app = props.screen.app;
const st = app.state;
const ui = props.screen.state;

const shown = computed(() => {
  const q = ui.filter.trim().toLowerCase();
  const list = q ? st.starts.filter((s) => s.name.toLowerCase().includes(q) || (s.realm ?? '').toLowerCase().includes(q)) : st.starts;
  return list.slice(0, 80);
});
const chosenSite = computed(() => st.starts.find((s) => s.id === ui.chosen) ?? null);
const atlasLink = computed(() => {
  const s = st.worldSettings;
  if (!s) return ATLAS_URL;
  const c = chosenSite.value;
  return `${ATLAS_URL}?${settingsQuery(s)}${c ? `#9/${c.lat.toFixed(4)}/${c.lon.toFixed(4)}` : ''}`;
});
</script>

<template>
  <div class="viewer">
    <WorldView class="viewer-map" :starts="st.starts" :chosen="ui.chosen" :layer="ui.layer" :request-tile="app.worker.requestTile" @choose="(id: string) => (ui.chosen = id)" />
    <aside class="viewer-panel">
      <h2>World "{{ st.worldSettings?.seed }}"</h2>
      <p v-if="st.summary" class="dim">{{ st.summary.cities }} cities, {{ st.summary.towns }} towns, {{ st.summary.realms }} realms; made in {{ (st.summary.ms / 1000).toFixed(1) }} s</p>
      <p v-if="st.note" class="note">{{ st.note }}</p>
      <div class="row layers">
        <button v-for="l in (['fantasy', 'terrain', 'biomes'] as ViewLayer[])" :key="l" :class="{ on: ui.layer === l }" @click="ui.layer = l">{{ l[0].toUpperCase() + l.slice(1) }}</button>
      </div>
      <a :href="atlasLink" target="_blank" rel="noopener" class="more">Open this world in the atlas</a>
      <label>Where to begin <input v-model="ui.filter" placeholder="Filter by name or realm" /></label>
      <ul class="sites">
        <li v-for="s in shown" :key="s.id" :class="{ on: s.id === ui.chosen }" @click="ui.chosen = s.id" @dblclick="screen.begin()">
          <b>{{ s.name }}</b> <span>{{ s.tier }}, {{ s.population.toLocaleString() }}</span>
        </li>
      </ul>
      <div v-if="chosenSite" class="chosen">
        <b>{{ chosenSite.name }}</b>, a {{ chosenSite.tier }} of {{ chosenSite.population.toLocaleString() }} people
        <div v-if="chosenSite.realm" class="dim">{{ chosenSite.realm }}</div>
        <div v-if="chosenSite.culture" class="dim">The {{ chosenSite.culture }} people</div>
      </div>
      <p class="hint">The place chosen here is your character's home; the next step makes the character.</p>
      <div class="row">
        <button class="primary" :disabled="!ui.chosen" @click="screen.begin()">Make a character</button>
        <button @click="app.newGame()">Another world</button>
      </div>
      <p v-if="st.error" class="error">{{ st.error }}</p>
    </aside>
  </div>
</template>
