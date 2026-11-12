<script setup lang="ts">
/** A market's or shop's goods: what is for sale, at what price, and buying. */
import { computed } from 'vue';
import type { ShopScreen, Ware } from '../shop';
import { defOf, itemName, QUALITY_WORD } from '../../actors/items/item';
import { moneyText } from '../../actors/components';

const props = defineProps<{ screen: ShopScreen }>();
const screen = props.screen;
const ui = screen.state;

const KIND_NAMES: Record<string, string> = {
  container: 'Bags and packs', clothing: 'Clothes', armour: 'Armour', jewellery: 'Jewellery', weapon: 'Arms', tool: 'Tools', food: 'Food', drink: 'Drink',
  medicine: 'Remedies', light: 'Light', goods: 'Goods', book: 'Books', music: 'Instruments',
};
const groups = computed(() => {
  void ui.version;
  const m = new Map<string, Ware[]>();
  for (const w of screen.wares) {
    const k = defOf(w.item).kind;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(w);
  }
  return [...m].map(([k, list]) => ({ name: KIND_NAMES[k] ?? k, list }));
});
const purse = computed(() => {
  void ui.version;
  return screen.inv?.d.copper ?? 0;
});
const load = computed(() => {
  void ui.version;
  return screen.inv?.loadInfo();
});
</script>

<template>
  <div class="shop card">
    <header class="row">
      <div>
        <h2>{{ screen.place.name }}</h2>
        <div class="dim">{{ screen.place.quarter }}<span v-if="screen.make">; {{ screen.make }} goods</span></div>
      </div>
      <span class="grow" />
      <div class="dim">You have {{ moneyText(purse) }}<span v-if="load">; carrying {{ load.kg.toFixed(1) }} of {{ load.comfortable.toFixed(0) }} kg ({{ load.load }})</span></div>
      <button @click="screen.play.showInventory()">Inventory</button>
      <button @click="screen.close()">Done (Esc)</button>
    </header>
    <div class="shop-list">
      <p v-if="!screen.wares.length" class="dim">Nothing here is for sale to you today.</p>
      <div v-for="g in groups" :key="g.name">
        <div class="cc-label">{{ g.name }}</div>
        <div v-for="(w, i) in g.list" :key="i" class="ware" :class="{ gone: w.left <= 0 }">
          <span class="nm">{{ itemName(w.item) }} <span class="dim">{{ QUALITY_WORD[w.item.quality] }}</span></span>
          <span class="dim">{{ defOf(w.item).weight * w.item.qty }} kg, {{ defOf(w.item).bulk * w.item.qty }} L<span v-if="defOf(w.item).container">; holds {{ defOf(w.item).container!.litres }} L</span></span>
          <span class="price">{{ moneyText(w.price) }}</span>
          <button :disabled="w.left <= 0 || purse < w.price" @click="screen.buy(w)">{{ w.left <= 0 ? 'Sold' : 'Buy' }}</button>
        </div>
      </div>
    </div>
    <footer class="msg">{{ ui.message }}</footer>
  </div>
</template>

<style scoped>
.shop { width: min(820px, 94vw); max-height: 86vh; display: flex; flex-direction: column; gap: 8px; }
.shop header { flex-wrap: nowrap; }
.shop h2 { margin: 0; font-weight: 500; color: var(--accent); }
.shop-list { overflow: auto; flex: 1; }
.cc-label { color: var(--dim); font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 8px; }
.ware { display: grid; grid-template-columns: 1.3fr 1fr 9em 4.5em; gap: 8px; align-items: center; padding: 3px 4px; border-bottom: 1px solid #1c2130; font-size: 0.94em; }
.ware.gone { opacity: 0.5; }
.ware button { padding: 2px 8px; }
.price { text-align: right; }
.msg { color: var(--accent); min-height: 1.2em; font-size: 0.92em; }
</style>
