<script setup lang="ts">
import { computed, watch } from 'vue';
import { openCulture, openTown, world } from '../store';
import { townContext } from './town-context';
import type { Stat } from '../people/town';

/**
 * A town's life (people/town.ts): how prosperous, clean and lawful it is and why, its watch,
 * how its folk stand for means, the peoples who live there, and its realm's trade.
 */
const t = computed(() => {
  const w = world.value, id = openTown.value;
  if (!w || !id || !w.settlements.some((s) => s.id === id)) return null;
  return townContext(w, id);
});
watch(world, () => (openTown.value = null));

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const MEANS = ['destitute', 'poor', 'middling', 'comfortable', 'rich'];
const MEANS_COL = ['#7a4a3a', '#a07850', '#b8a070', '#8a9a5a', '#c9a227'];
const stats = computed(() => {
  const s = t.value?.stats;
  if (!s) return [];
  // For crime, a high value is bad: the bar is drawn in red.
  return [['Prosperity', s.prosperity, '#8a9a5a'], ['Sanitation', s.sanitation, '#5d7f8f'], ['Crime', s.crime, '#9b3b2e']] as [string, Stat, string][];
});
</script>

<template>
  <aside v-if="t" class="town" role="dialog" :aria-label="t.ctx.name">
    <header>
      <div class="title">
        <h2>{{ t.ctx.name }}</h2>
        <p>{{ cap(t.ctx.tier) }} of {{ t.ctx.population.toLocaleString('en') }} · life in the town</p>
      </div>
      <button class="close" @click="openTown = null">Close</button>
    </header>
    <div class="body">
      <div v-for="[label, st, col] in stats" :key="label" class="stat">
        <div class="row"><b>{{ label }}</b><span>{{ cap(st.word) }}</span></div>
        <div class="bar"><span :style="{ width: `${st.value}%`, background: col }" /></div>
        <p class="why">{{ st.why.length ? cap(st.why.join('; ')) + '.' : '' }}</p>
      </div>
      <h3>The watch</h3>
      <p>{{ t.stats.watch.text }}</p>
      <h3>Means</h3>
      <div class="means">
        <span v-for="(m, i) in t.stats.means" :key="i" :style="{ flex: m, background: MEANS_COL[i] }" :title="`${MEANS[i]}: ${pct(m)}`" />
      </div>
      <p class="dim">{{ t.stats.means.map((m, i) => `${MEANS[i]} ${pct(m)}`).join(' · ') }}</p>
      <h3>Peoples</h3>
      <ul class="plain">
        <li v-for="p in t.stats.peoples" :key="p.culture"><a href="#" @click.prevent="openCulture = p.culture">{{ cap(p.people) }}</a> <span class="dim">· {{ pct(p.share) }}</span></li>
      </ul>
      <template v-if="t.ctx.economy">
        <h3>Trade</h3>
        <p v-if="t.ctx.economy.special.length">Known for {{ t.ctx.economy.special.join(' and ') }}.</p>
        <p v-if="t.ctx.economy.exports.length">The realm sends out {{ t.ctx.economy.exports.join(', ') }}<template v-if="t.ctx.economy.imports.length">, and buys in {{ t.ctx.economy.imports.join(', ') }}</template>. Prices are in {{ t.ctx.economy.coin }}.</p>
      </template>
      <template v-if="t.stats.notes.length">
        <h3>A visitor notices</h3>
        <ul class="plain"><li v-for="n in t.stats.notes" :key="n">{{ n }}</li></ul>
      </template>
      <p class="dim small">Open a building (double-click it at close zoom) to meet who lives there.</p>
    </div>
  </aside>
</template>

<style scoped>
.town {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(440px, 46vw);
  z-index: 17;
  display: flex;
  flex-direction: column;
  background: #f3ead3;
  color: #2b2420;
  border-left: 1px solid #2b2420;
  box-shadow: -4px 0 18px rgba(0, 0, 0, 0.25);
  font-family: 'IM Fell English', Georgia, 'Times New Roman', serif;
}
header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 14px 8px;
  border-bottom: 1px solid rgba(43, 36, 32, 0.25);
}
.title {
  flex: 1;
}
h2 {
  margin: 0;
  font-size: 23px;
  font-weight: normal;
  font-style: italic;
}
.title p {
  margin: 3px 0 0;
  font-size: 13.5px;
  opacity: 0.85;
}
button {
  font: inherit;
  font-size: 13.5px;
  padding: 4px 10px;
  border: 1px solid #2b2420;
  border-radius: 4px;
  cursor: pointer;
}
.close {
  background: #2b2420;
  color: #f3ead3;
}
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 16px 24px;
  font-size: 14.5px;
  line-height: 1.4;
}
h3 {
  margin: 14px 0 5px;
  font-size: 16px;
  font-weight: normal;
  font-style: italic;
  border-bottom: 1px solid rgba(43, 36, 32, 0.2);
}
p {
  margin: 4px 0;
}
a {
  color: #6e2a1e;
}
.stat {
  margin: 8px 0 10px;
}
.row {
  display: flex;
  justify-content: space-between;
}
.bar {
  height: 8px;
  background: rgba(43, 36, 32, 0.12);
  border-radius: 4px;
  overflow: hidden;
  margin: 3px 0;
}
.bar span {
  display: block;
  height: 100%;
}
.why {
  font-size: 13.5px;
  opacity: 0.8;
}
.means {
  display: flex;
  height: 12px;
  border-radius: 4px;
  overflow: hidden;
}
.dim {
  opacity: 0.7;
}
.small {
  font-size: 13px;
  margin-top: 14px;
}
.plain {
  margin: 0;
  padding-left: 18px;
}
@media (max-width: 700px) {
  .town {
    width: 100vw;
  }
}
</style>
