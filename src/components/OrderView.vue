<script setup lang="ts">
import { computed, watch } from 'vue';
import { flyTarget, openFaith, openOrder, world } from '../store';
import { HOLD_LABEL, ORDER_KIND_LABEL, type OrderMember } from '../lore/orders';
import { currentLore } from './realm-lore';
import { currentOrders } from './orders';

/**
 * An organisation (lore/orders.ts): what it is, its motto, its seat (a stronghold or a city) and
 * chapter houses, its leader and notable members, its contracts or deeds, and its chronicle.
 */
const o = computed(() => (openOrder.value ? currentOrders().find((x) => x.key === openOrder.value) ?? null : null));
watch(world, () => (openOrder.value = null));

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const year = computed(() => currentLore()?.L.year ?? 0);
const era = computed(() => currentLore()?.L.eraShort ?? '');
const faith = computed(() => (o.value?.faith !== undefined ? currentLore()?.L.faiths.faiths.find((f) => f.id === o.value!.faith) ?? null : null));
const seatLine = computed(() => {
  const s = o.value?.seat;
  if (!s) return '';
  if (s.kind === 'hold') return `${cap(s.name)}, a ${HOLD_LABEL[s.hold!].toLowerCase()} ${s.where ?? ''}`.trim();
  if (s.kind === 'hidden') return `Hidden: ${s.name}`;
  return s.name;
});
const CONTRACTS: Record<string, string> = {
  hunters: 'Contracts', assassins: 'Contracts', knights: 'Deeds', society: 'Rumours', mercenaries: 'Contracts', traders: 'Charters and voyages',
  thieves: 'Jobs', druids: 'Causes', bards: 'Commissions', explorers: 'Expeditions',
};
const who = (m: OrderMember) => `${m.people}`;

function fly(lon: number, lat: number, zoom: number, name: string): void {
  flyTarget.value = { lon, lat, zoom, name, t: performance.now() };
}
function goSeat(): void {
  const s = o.value?.seat;
  if (!s || s.kind === 'hidden') return;
  fly(s.lon, s.lat, s.kind === 'hold' ? 13 : 12, s.name);
}
function goCity(sid: string): void {
  const s = world.value?.settlements.find((q) => q.id === sid);
  if (s) fly(s.lon, s.lat, 12, s.name ?? '');
}
</script>

<template>
  <aside v-if="o" class="order" role="dialog" :aria-label="o.en">
    <header>
      <div class="title">
        <h2>{{ cap(o.name) }}<span v-if="o.en !== o.name" class="en">{{ cap(o.en) }}</span></h2>
        <p>{{ ORDER_KIND_LABEL[o.kind] }}<template v-if="o.secret"> · secret</template> · founded {{ o.founded }} {{ era }} ({{ year - o.founded }} years ago)</p>
        <p class="motto">“{{ o.motto }}”</p>
      </div>
      <button class="close" @click="openOrder = null">Close</button>
    </header>
    <div class="body">
      <p>{{ o.about }}</p>
      <dl class="facts">
        <div><dt>Seat</dt><dd><a v-if="o.seat.kind !== 'hidden'" href="#" @click.prevent="goSeat">{{ seatLine }}</a><span v-else>{{ seatLine }}</span></dd></div>
        <div><dt>{{ cap(o.leader.rank) }}</dt><dd>{{ o.leader.name }} <span class="dim">({{ who(o.leader) }}). {{ o.leader.note }}</span></dd></div>
        <div v-if="faith"><dt>Faith</dt><dd><a href="#" @click.prevent="openFaith = faith.id">{{ cap(faith.name) }}</a></dd></div>
      </dl>
      <template v-if="o.chapters.length">
        <h3>{{ o.kind === 'assassins' ? 'Fronts' : 'Chapter houses' }}</h3>
        <ul class="plain">
          <li v-for="(c, i) in o.chapters" :key="i"><a href="#" @click.prevent="goCity(c.sid)">{{ c.city }}</a> <span class="dim">· {{ c.house }}</span></li>
        </ul>
      </template>
      <template v-if="o.members.length">
        <h3>Notable members</h3>
        <ul class="plain">
          <li v-for="(m, i) in o.members" :key="i"><strong>{{ m.name }}</strong> <span class="dim">({{ who(m) }}), {{ m.rank }}.</span> {{ m.note }}</li>
        </ul>
      </template>
      <template v-if="o.contracts.length">
        <h3>{{ CONTRACTS[o.kind] }}</h3>
        <ul class="plain">
          <li v-for="(c, i) in o.contracts" :key="i">
            <a v-if="c.lon !== undefined" href="#" @click.prevent="fly(c.lon!, c.lat!, 9, c.title)"><strong>{{ cap(c.title) }}</strong></a><strong v-else>{{ cap(c.title) }}</strong>
            <span class="status">[{{ c.status }}]</span> {{ c.text }}
          </li>
        </ul>
      </template>
      <h3>Chronicle</h3>
      <ol class="chron">
        <li v-for="(e, i) in o.chronicle" :key="i"><span class="y">{{ e.year }} {{ era }}</span> {{ e.text }}</li>
      </ol>
    </div>
  </aside>
</template>

<style scoped>
.order {
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
.motto {
  font-style: italic;
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
.status {
  font-style: italic;
  opacity: 0.7;
}
.facts div {
  display: flex;
  gap: 8px;
  margin: 2px 0;
}
.facts dt {
  flex: none;
  width: 110px;
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
  margin: 4px 0;
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
  min-width: 80px;
  font-style: italic;
  opacity: 0.75;
}
@media (max-width: 700px) {
  .order {
    width: 100vw;
  }
}
</style>
