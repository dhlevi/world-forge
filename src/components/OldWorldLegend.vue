<script setup lang="ts">
import { computed, ref } from 'vue';
import { openRealm, store, world } from '../store';
import { NEW_REACHED_RGB, NEW_WORLD_RGB, OLD_UNREACHED_RGB } from '../render/tiles';

/**
 * The Old & New World layer's key, with figures for tuning the Settled world slider: how much
 * land the spread reached, how much is Old World after whole landmasses go one way or the other,
 * and how the towns and colonies fall. Hidden while another key (faiths, a realm's) holds the spot.
 */
const open = ref(true);
const rgb = (c: ArrayLike<number>) => `rgb(${c[0]},${c[1]},${c[2]})`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

const stats = computed(() => {
  const w = world.value;
  if (!w) return null;
  const { W, H, height, newWorld, spread } = w.raster;
  let land = 0, old = 0, reached = 0, oldUnreached = 0, newReached = 0;
  for (let j = 0, c = 0; j < H; j++) {
    const a = Math.cos(((90 - ((j + 0.5) * 180) / H) * Math.PI) / 180);
    for (let i = 0; i < W; i++, c++) {
      if (height[c] <= 0) continue;
      land += a;
      const r = spread.reach[c] > 0, o = newWorld[c] === 0;
      if (o) old += a;
      if (r) reached += a;
      if (o && !r) oldUnreached += a;
      if (!o && r) newReached += a;
    }
  }
  let settled = 0.6;
  try {
    settled = JSON.parse(store.madeWith).settled ?? settled;
  } catch {
    // The world's settings are unknown until it is made; the default stands.
  }
  const s = w.settlements;
  const big = (x: (typeof s)[number]) => x.tier === 'city' || x.tier === 'town';
  return {
    settled,
    land: land || 1,
    old, reached, oldUnreached, newReached,
    oldTowns: s.filter((x) => big(x) && !x.newWorld).length,
    newTowns: s.filter((x) => big(x) && x.newWorld && !x.colony).length,
    colonies: s.filter((x) => x.colony).length,
    whole: spread.heartland < 0,
  };
});
</script>

<template>
  <div v-if="store.layer === 'oldworld' && stats && !store.showFaiths && openRealm === null" class="legend">
    <button class="head" :title="open ? 'Hide the key' : 'Show the key'" @click="open = !open">Old &amp; New World {{ open ? '▾' : '▸' }}</button>
    <template v-if="open">
      <ul>
        <li><span class="sw ramp" />Old World, by when the spread reached it (dark first, pale last)</li>
        <li><span class="sw" :style="{ background: rgb(OLD_UNREACHED_RGB) }" />Old World the spread missed (its landmass went Old)</li>
        <li><span class="sw" :style="{ background: rgb(NEW_WORLD_RGB) }" />New World</li>
        <li><span class="sw" :style="{ background: rgb(NEW_REACHED_RGB) }" />New World the spread reached (its landmass went New)</li>
      </ul>
      <p class="note">The ringed dot is the heartland; thin lines mark each tenth of the spread, and the dark line the frontier.</p>
      <table>
        <tr><td>Settled world (setting)</td><td>{{ pct(stats.settled) }}</td></tr>
        <tr><td>Land reached by the spread</td><td>{{ pct(stats.reached / stats.land) }}</td></tr>
        <tr><td>Old World land</td><td>{{ pct(stats.old / stats.land) }}</td></tr>
        <tr><td>Gained / lost by whole landmasses</td><td>+{{ pct(stats.oldUnreached / stats.land) }} / −{{ pct(stats.newReached / stats.land) }}</td></tr>
        <tr><td>Old World cities and towns</td><td>{{ stats.oldTowns }}</td></tr>
        <tr><td>New World towns</td><td>{{ stats.newTowns }}</td></tr>
        <tr><td>Colonies</td><td>{{ stats.colonies }}</td></tr>
      </table>
      <p v-if="stats.whole" class="note">At 100% the whole world is Old, and there is no spread to show.</p>
    </template>
  </div>
</template>

<style scoped>
.legend {
  position: absolute;
  left: 302px;
  bottom: 34px;
  z-index: 5;
  max-width: 320px;
  max-height: 55vh;
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
}
.sw {
  flex: none;
  width: 14px;
  height: 14px;
  border: 1px solid rgba(43, 36, 32, 0.6);
  border-radius: 3px;
}
.sw.ramp {
  background: linear-gradient(90deg, #6e2f10, #b8591f, #e3a04a, #f7e2a6);
  width: 28px;
}
.note {
  margin: 5px 0 0;
  font-size: 12px;
  font-style: italic;
  opacity: 0.75;
}
table {
  margin-top: 6px;
  border-collapse: collapse;
  width: 100%;
  font-size: 12.5px;
}
td {
  padding: 1px 0;
}
td:last-child {
  text-align: right;
  padding-left: 10px;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 768px) {
  .legend {
    left: 10px;
    bottom: 10px;
    max-width: 70vw;
    max-height: 35vh;
  }
  .head {
    min-height: 44px;
  }
}
</style>
