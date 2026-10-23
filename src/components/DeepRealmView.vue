<script setup lang="ts">
import { computed, watch } from 'vue';
import { flyTarget, openCulture, openDeepRealm, openFaith, openLair, store, world } from '../store';
import { CULTURES } from '../names/cultures';
import { BUNDLE } from '../names/bundles';
import { armsImage } from '../heraldry/draw';
import { currentLore } from './realm-lore';
import { deepSite, REALM_RGB } from './under-style';
import { DEEP_LABEL } from '../gen/underworld';

/**
 * A realm of the Underworld (gen/deep-peoples.ts): its arms and name, its people and how it is
 * ruled, its ruler, its cities (each opens its cavern map), its dealings with the realms about it
 * and the dwarven delves above, and its chronicle.
 */
const u = computed(() => world.value?.raster.underworld ?? null);
const rm = computed(() => (u.value && openDeepRealm.value !== null ? u.value.realms?.[openDeepRealm.value] ?? null : null));
watch(world, () => (openDeepRealm.value = null));

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const cul = computed(() => (rm.value ? CULTURES[rm.value.culture] : null));
const folk = computed(() => (cul.value ? BUNDLE.get(cul.value.id)?.folk ?? '' : ''));
const arms = computed(() => (rm.value ? armsImage(rm.value.arms, 96, `deep${rm.value.id}`) : ''));
const cities = computed(() => (rm.value && u.value ? rm.value.nodes.map((id) => ({ id, n: u.value!.nodes[id] })).filter((x) => x.n.city).sort((a, b) => b.n.city!.pop - a.n.city!.pop) : []));
const people = computed(() => cities.value.reduce((a, c) => a + c.n.city!.pop, 0));
const STANCE: Record<string, string> = { war: 'at war', feud: 'in a blood feud', truce: 'under an uneasy truce', trade: 'trading', alliance: 'allied', raids: 'raiding them', peace: 'at peace' };
const faith = computed(() => {
  if (!rm.value || !world.value) return null;
  const L = currentLore()?.L;
  const k = L?.faiths.faiths.findIndex((f) => f.cultures.includes(rm.value!.culture)) ?? -1;
  return k >= 0 ? { id: k, name: L!.faiths.faiths[k].name } : null;
});

function openCity(id: number): void {
  if (!u.value) return;
  const n = u.value.nodes[id];
  flyTarget.value = { lon: n.lon, lat: n.lat, zoom: 6.5, name: n.city?.name ?? n.name, t: performance.now() };
  openLair.value = deepSite(u.value, id);
}
function goRealm(id: number): void {
  openDeepRealm.value = id;
  if (!u.value) return;
  const c = u.value.nodes[u.value.realms![id].capital];
  flyTarget.value = { lon: c.lon, lat: c.lat, zoom: 5.5, name: u.value.realms![id].name, t: performance.now() };
}
function goDelve(sid: string, name: string): void {
  const s = world.value?.settlements.find((q) => q.id === sid);
  if (!s) return;
  store.layer = 'fantasy';
  openDeepRealm.value = null;
  flyTarget.value = { lon: s.lon, lat: s.lat, zoom: 12.5, name, t: performance.now() };
}
</script>

<template>
  <aside v-if="rm && cul" class="deeprealm" role="dialog" :aria-label="rm.name">
    <header>
      <img :src="arms" alt="" class="arms" width="72" height="86" />
      <div class="title">
        <h2>{{ cap(rm.name) }}<span v-if="rm.en !== rm.name" class="en">{{ cap(rm.en) }}</span></h2>
        <p>A realm of the Underworld · <span class="sw" :style="{ background: REALM_RGB[rm.colour] }" /> {{ cap(cul.people) }} ({{ folk.toLowerCase() }}) · about {{ people.toLocaleString('en') }} people</p>
      </div>
      <button class="close" @click="openDeepRealm = null">Close</button>
    </header>
    <div class="body">
      <p>{{ cap(rm.gov) }}.</p>
      <dl class="facts">
        <div><dt>Ruler</dt><dd>{{ rm.title }} {{ rm.ruler }}</dd></div>
        <div><dt>People</dt><dd><a href="#" @click.prevent="openCulture = rm.culture">{{ cap(cul.people) }}</a><span v-if="cul.endonym" class="dim">, who call themselves {{ cul.endonym }}</span></dd></div>
        <div v-if="faith"><dt>Faith</dt><dd><a href="#" @click.prevent="openFaith = faith.id">{{ cap(faith.name) }}</a></dd></div>
      </dl>
      <h3>Cities</h3>
      <ul class="plain">
        <li v-for="c in cities" :key="c.id"><a href="#" @click.prevent="openCity(c.id)">{{ c.n.city!.name }}</a><span v-if="c.n.city!.en !== c.n.city!.name" class="dim"> ({{ c.n.city!.en }})</span> <span class="dim">· {{ c.n.city!.kind }} of about {{ c.n.city!.pop.toLocaleString('en') }} in {{ c.n.name }}, {{ DEEP_LABEL[c.n.kind].toLowerCase() }}{{ c.n.city!.capital ? ' · the capital' : '' }}</span></li>
      </ul>
      <template v-if="rm.relations.length || rm.delves.length">
        <h3>Neighbours</h3>
        <ul class="plain">
          <li v-for="q in rm.relations" :key="q.realm"><a href="#" @click.prevent="goRealm(q.realm)">{{ cap(u!.realms![q.realm].name) }}</a> <span class="dim">· {{ STANCE[q.stance] }}</span></li>
          <li v-for="d in rm.delves" :key="d.sid">the dwarves of <a href="#" @click.prevent="goDelve(d.sid, d.name)">{{ d.name }}</a> above <span class="dim">· {{ STANCE[d.stance] }}</span></li>
        </ul>
      </template>
      <h3>Chronicle</h3>
      <ol class="chron">
        <li v-for="(e, i) in rm.chronicle" :key="i"><span class="y">{{ e.ago }} years ago</span> {{ e.text }}</li>
      </ol>
    </div>
  </aside>
</template>

<style scoped>
.deeprealm {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(480px, 46vw);
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
.arms {
  flex: none;
  width: 72px;
  height: auto;
}
.title {
  flex: 1;
  min-width: 0;
}
h2 {
  margin: 0;
  font-size: 23px;
  font-weight: normal;
  font-style: italic;
}
.en {
  display: block;
  font-size: 15px;
  opacity: 0.75;
}
.title p {
  margin: 3px 0 0;
  font-size: 13.5px;
  opacity: 0.85;
}
.sw {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1px solid rgba(43, 36, 32, 0.6);
  vertical-align: -1px;
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
.dim {
  opacity: 0.7;
}
.facts div {
  display: flex;
  gap: 8px;
  margin: 2px 0;
}
.facts dt {
  flex: none;
  width: 70px;
  font-style: italic;
  opacity: 0.75;
}
.facts dd {
  margin: 0;
}
.plain {
  margin: 0;
  padding-left: 18px;
}
.plain li {
  margin: 2px 0;
}
.chron {
  margin: 0;
  padding-left: 0;
  list-style: none;
}
.chron li {
  margin: 4px 0;
}
.chron .y {
  display: inline-block;
  min-width: 112px;
  font-style: italic;
  opacity: 0.75;
}
@media (max-width: 700px) {
  .deeprealm {
    width: 100vw;
  }
}
</style>
