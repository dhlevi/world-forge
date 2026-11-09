<script setup lang="ts">
import { ref } from 'vue';
import { faithLegend, openFaith, openRealm, store } from '../store';

/** The faith map's key: each faith's colour; a click opens the faith. Hidden while a realm is open (its own key shows then). */
const open = ref(true);
const rgb = (c: [number, number, number]) => `rgb(${c.join(',')})`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
</script>

<template>
  <div v-if="store.showFaiths && faithLegend.length && openRealm === null" class="legend">
    <button class="head" :title="open ? 'Hide the key' : 'Show the key'" @click="open = !open">Faiths {{ open ? '▾' : '▸' }}</button>
    <ul v-if="open">
      <li v-for="f in faithLegend" :key="f.id" title="Open the faith" @click="openFaith = f.id">
        <span class="sw" :style="{ background: rgb(f.rgb) }" />{{ cap(f.name) }}
      </li>
    </ul>
    <p v-if="open" class="note">Lighter and darker shades are sects; dots are holy places.</p>
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
