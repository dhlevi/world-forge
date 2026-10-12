<script setup lang="ts">
import { computed, ref } from 'vue';
import { openRealm, world } from '../store';
import { relationsForMap } from '../lore/realm';
import { REL_TINT } from '../world/political';
import { currentLore } from './realm-lore';

/**
 * The key to the colours an open realm puts on the map: its own lands, the rest of its realm,
 * allies, friends, truces, rivals and enemies (with the realms in each), and its trade routes.
 */
const open = ref(!window.matchMedia('(max-width: 768px)').matches);
const LABEL: Record<string, string> = {
  self: 'This realm', realm: 'The rest of its realm', league: 'League members', alliance: 'Allies', friendly: 'Friendly', truce: 'At truce', rival: 'Rivals', war: 'At war',
};
const ORDER = ['self', 'realm', 'league', 'alliance', 'friendly', 'truce', 'rival', 'war'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const rows = computed(() => {
  const id = openRealm.value, w = world.value;
  if (id === null || !w) return [];
  const c = currentLore();
  if (!c) return [];
  const sel = relationsForMap(c, id);
  const u = w.politics.units;
  const byKind = new Map<string, number[]>();
  for (const [r, k] of sel.rel) if (k !== 'neutral') (byKind.get(k) ?? byKind.set(k, []).get(k)!).push(r);
  const out: { kind: string; label: string; realms: number[] }[] = [];
  if (sel.self >= 0) {
    const vassal = sel.self !== id;
    out.push({ kind: 'self', label: vassal ? 'This lordship' : LABEL.self, realms: [] });
    if (vassal) out.push({ kind: 'realm', label: `The rest of ${u[sel.self].name}`, realms: [] });
  }
  for (const k of ORDER.slice(2)) {
    const list = byKind.get(k);
    if (list?.length) out.push({ kind: k, label: LABEL[k], realms: list.sort((a, b) => u[b].people - u[a].people) });
  }
  return out;
});
const partners = computed(() => {
  const id = openRealm.value, c = id !== null ? currentLore() : null;
  return c && id !== null ? relationsForMap(c, id).partners.length : 0;
});
const units = computed(() => world.value?.politics.units ?? []);
function swatch(kind: string): Record<string, string> {
  const [r, g, b, a] = REL_TINT[kind];
  // The map tint is laid over parchment; the key shows it a little stronger.
  const fill = `rgba(${r},${g},${b},${Math.min(1, a * 1.6)})`;
  return kind === 'war' ? { background: `repeating-linear-gradient(45deg, ${fill} 0 3px, rgba(${r},${g},${b},0.25) 3px 6px)` } : { background: fill };
}
</script>

<template>
  <div v-if="rows.length" class="legend">
    <button class="head" :title="open ? 'Hide the key' : 'Show the key'" @click="open = !open">On the map {{ open ? '▾' : '▸' }}</button>
    <ul v-if="open">
      <li v-for="r in rows" :key="r.kind">
        <span class="sw" :style="swatch(r.kind)" />
        <span>
          {{ r.label }}<template v-if="r.realms.length"> ({{ r.realms.length }}):
            <template v-for="(id, i) in r.realms.slice(0, 4)" :key="id"><a href="#" @click.prevent="openRealm = id">{{ cap(units[id].name) }}</a><span v-if="i < Math.min(4, r.realms.length) - 1">, </span></template><template v-if="r.realms.length > 4"> and {{ r.realms.length - 4 }} more</template>
          </template>
        </span>
      </li>
      <li v-if="partners"><span class="sw line" /><span>Trade routes to its {{ partners }} partner{{ partners === 1 ? '' : 's' }}</span></li>
    </ul>
  </div>
</template>

<style scoped>
.legend {
  position: absolute;
  left: 302px;
  bottom: 34px;
  z-index: 5;
  max-width: 320px;
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
  align-items: flex-start;
  gap: 7px;
  padding: 2px 0;
  line-height: 1.3;
}
a {
  color: #6e2a1e;
}
.sw {
  flex: none;
  width: 14px;
  height: 14px;
  margin-top: 1px;
  border: 1px solid rgba(43, 36, 32, 0.6);
  border-radius: 3px;
}
.sw.line {
  border: none;
  border-radius: 0;
  height: 0;
  margin-top: 8px;
  border-top: 2px dashed #7a5418;
}
@media (max-width: 768px) {
  .legend {
    left: 10px;
    top: 104px;
    bottom: auto;
    max-width: calc(100vw - 80px);
    max-height: 22vh;
  }
  .head {
    min-height: 44px;
  }
}
</style>
