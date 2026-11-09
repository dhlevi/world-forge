<script setup lang="ts">
import { ref } from 'vue';
import { groupLegend, openCulture, openRealm, store } from '../store';

/** The culture or race map's key: each people's (or race's) colour; a click opens the people (or the race's largest). Hidden while a realm is open. */
const open = ref(true);
const rgb = (c: [number, number, number]) => `rgb(${c.join(',')})`;
function go(culture: number | undefined): void {
  if (culture !== undefined) openCulture.value = culture;
}
</script>

<template>
  <div v-if="(store.showCultures || store.showRaces) && groupLegend.items.length && openRealm === null" class="legend">
    <button class="head" :title="open ? 'Hide the key' : 'Show the key'" @click="open = !open">{{ groupLegend.title }} {{ open ? '▾' : '▸' }}</button>
    <ul v-if="open">
      <li v-for="g in groupLegend.items" :key="g.id" :title="g.culture !== undefined ? 'Open the people' : ''" @click="go(g.culture)">
        <span class="sw" :style="{ background: rgb(g.rgb) }" />{{ g.name }}<span v-if="g.sub" class="sub">{{ g.sub }}</span>
      </li>
    </ul>
    <p v-if="open" class="note">{{ groupLegend.note }}</p>
  </div>
</template>

<style scoped>
.legend {
  position: absolute;
  left: 302px;
  bottom: 34px;
  z-index: 5;
  max-width: 280px;
  max-height: 45vh;
  overflow-y: auto;
  padding: 6px 10px 8px;
  background: rgba(243, 234, 211, 0.95);
  color: #2b2420;
  border: 1px solid #2b2420;
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  font-family: 'IM Fell English', Georgia, serif;
  font-size: 13.5px;
}
.head {
  font: inherit;
  font-style: italic;
  font-size: 14.5px;
  background: none;
  border: none;
  padding: 0;
  color: inherit;
  cursor: pointer;
}
ul {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
}
li {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 2px 0;
  cursor: pointer;
}
li:hover {
  text-decoration: underline;
}
.sw {
  flex: none;
  width: 14px;
  height: 14px;
  border: 1px solid rgba(43, 36, 32, 0.6);
  border-radius: 3px;
}
.sub {
  margin-left: auto;
  padding-left: 8px;
  font-size: 12px;
  opacity: 0.7;
}
.note {
  margin: 5px 0 0;
  font-size: 12px;
  font-style: italic;
  opacity: 0.75;
}
@media (max-width: 768px) {
  .legend {
    left: 10px;
    bottom: 10px;
    max-width: 60vw;
    max-height: 35vh;
  }
  .head,
  li {
    min-height: 44px;
  }
}
</style>
