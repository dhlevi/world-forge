<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { flyTarget, openCulture, openFaith, openRealm, search, searchState, store } from '../store';
import { CAT_LABEL, type SearchCat, type SearchHit, bearing } from '../search/index';

const q = ref('');
const cat = ref<SearchCat | 'all'>('all');
const open = ref(false);
/** Mobile: the bar is a button until tapped. */
const expanded = ref(false);
const active = ref(0);
const input = ref<HTMLInputElement>();
const hits = ref<SearchHit[]>([]);
const CATS: (SearchCat | 'all')[] = ['all', 'settlement', 'water', 'region', 'lair', 'road', 'place'];

let timer = 0;
function run(): void {
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    hits.value = search.search(q.value, cat.value === 'all' ? null : new Set([cat.value]), store.center, 40);
    active.value = 0;
  }, 60);
}
watch([q, cat], run);
// New index batches refresh an open result list (at most a few times a second).
let lastVersion = 0;
watch(() => searchState.version, (v) => {
  if (!open.value || !q.value || v - lastVersion < 1) return;
  lastVersion = v;
  run();
});

const indexing = computed(() => searchState.total > 0 && searchState.done < searchState.total);
const pct = computed(() => Math.floor((100 * searchState.done) / Math.max(1, searchState.total)));

function detail(h: SearchHit): string {
  const e = h.e;
  const parts = [e.type];
  if (e.info) parts.push(e.info);
  if (e.sid && search.places.has(e.sid)) parts.push(`in ${search.places.get(e.sid)}`);
  if (h.km >= 1) parts.push(`${h.km < 10 ? h.km.toFixed(1) : Math.round(h.km).toLocaleString('en')} km ${bearing(store.center[0], store.center[1], e.lon, e.lat)}`);
  else parts.push('here');
  return parts.join(' · ');
}

function choose(h: SearchHit | undefined): void {
  if (!h) return;
  flyTarget.value = { lon: h.e.lon, lat: h.e.lat, zoom: h.e.zoom, name: h.e.name, t: performance.now() };
  // A realm also opens its details.
  if (/^pol\d+$/.test(h.e.id)) openRealm.value = Number(h.e.id.slice(3));
  if (/^cul\d+$/.test(h.e.id)) openCulture.value = Number(h.e.id.slice(3));
  if (/^fai\d+$/.test(h.e.id)) openFaith.value = Number(h.e.id.slice(3));
  open.value = false;
  input.value?.blur();
  if (window.matchMedia('(max-width: 768px)').matches) expanded.value = false;
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') {
    active.value = Math.min(hits.value.length - 1, active.value + 1);
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    active.value = Math.max(0, active.value - 1);
    e.preventDefault();
  } else if (e.key === 'Enter') choose(hits.value[active.value]);
  else if (e.key === 'Escape') {
    if (q.value) q.value = '';
    else {
      open.value = false;
      input.value?.blur();
    }
  }
}

function focusSearch(): void {
  expanded.value = true;
  open.value = true;
  nextTick(() => input.value?.focus());
}

// "/" or Ctrl/Cmd+K focuses the search box from anywhere on the map.
function onGlobalKey(e: KeyboardEvent): void {
  const t = e.target as HTMLElement | null;
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
    e.preventDefault();
    focusSearch();
  }
}
onMounted(() => window.addEventListener('keydown', onGlobalKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey));

function blurLater(): void {
  // Let a click on a result land first.
  setTimeout(() => {
    open.value = false;
    if (!q.value) expanded.value = false;
  }, 150);
}

const ICON: Record<SearchCat, string> = {
  settlement: 'M3 11 L10 5 L17 11 M5 10 V16 H15 V10 M9 16 V12 H11 V16',
  water: 'M2 9 Q5 6 8 9 T14 9 T20 9 M2 14 Q5 11 8 14 T14 14 T20 14',
  region: 'M2 16 L8 6 L11 11 L13 8 L18 16 Z',
  lair: 'M3 16 Q4 5 10 5 Q16 5 17 16 M7 16 Q7 10 10 10 Q13 10 13 16',
  road: 'M6 17 Q9 11 7 3 M14 17 Q11 11 13 3',
  place: 'M10 3 A5 5 0 0 1 15 8 C15 12 10 17 10 17 C10 17 5 12 5 8 A5 5 0 0 1 10 3 M10 6.5 A1.5 1.5 0 1 0 10 9.5 A1.5 1.5 0 1 0 10 6.5',
};
</script>

<template>
  <div class="search" :class="{ expanded }">
    <button v-if="!expanded" class="search-btn" aria-label="Search places" @click="focusSearch">
      <svg viewBox="0 0 20 20" width="20" height="20"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13 L18 18" /></svg>
    </button>
    <div class="box">
      <svg class="lens" viewBox="0 0 20 20" width="18" height="18"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13 L18 18" /></svg>
      <input
        ref="input" v-model="q" type="search" placeholder="Search places, rivers, caves, inns…" aria-label="Search places"
        autocomplete="off" spellcheck="false" @focus="open = true" @blur="blurLater" @keydown="onKey"
      />
      <span class="hint">/</span>
    </div>
    <div v-if="open" class="panel" @mousedown.prevent>
      <div class="chips" role="radiogroup" aria-label="Kind of place">
        <button v-for="c in CATS" :key="c" :class="{ on: cat === c }" role="radio" :aria-checked="cat === c" @click="cat = c">
          {{ c === 'all' ? 'All' : CAT_LABEL[c] }}
        </button>
      </div>
      <ul v-if="hits.length" class="results" role="listbox">
        <li
          v-for="(h, i) in hits" :key="h.e.id" :class="{ active: i === active }" role="option" :aria-selected="i === active"
          @mouseenter="active = i" @click="choose(h)"
        >
          <svg class="ico" viewBox="0 0 20 20" width="20" height="20"><path :d="ICON[h.e.cat]" /></svg>
          <div class="text">
            <div class="name">{{ h.e.name }}<span v-if="h.e.alt" class="alt">{{ h.e.alt }}</span></div>
            <div class="sub">{{ detail(h) }}</div>
          </div>
        </li>
      </ul>
      <div v-else-if="q" class="empty">No places match “{{ q }}”.</div>
      <div v-else class="empty">Type a name, or a kind of place such as “cave”, “inn” or “lake”.</div>
      <div v-if="indexing" class="progress">Indexing villages, caves and glades: {{ pct }}% (nearest first)</div>
    </div>
  </div>
</template>

<style scoped>
.alt {
  margin-left: 7px;
  font-style: italic;
  font-size: 0.88em;
  opacity: 0.7;
}
.search {
  position: absolute;
  top: 10px;
  left: 302px;
  width: 360px;
  max-width: calc(100% - 302px - 60px);
  z-index: 6;
  font-family: 'IM Fell English', Georgia, serif;
  color: #2b2420;
}
.search-btn {
  display: none;
}
.box {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f3ead3;
  border: 1px solid #2b2420;
  border-radius: 6px;
  padding: 0 10px;
  height: 40px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
}
svg {
  fill: none;
  stroke: #2b2420;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 16px;
  color: inherit;
  outline: none;
}
.hint {
  font-size: 12px;
  border: 1px solid rgba(43, 36, 32, 0.4);
  border-radius: 3px;
  padding: 0 5px;
  opacity: 0.6;
}
.panel {
  margin-top: 4px;
  background: #f3ead3;
  border: 1px solid #2b2420;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid rgba(43, 36, 32, 0.2);
}
.chips button {
  font: inherit;
  font-size: 13px;
  padding: 3px 9px;
  border: 1px solid rgba(43, 36, 32, 0.5);
  border-radius: 12px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.chips button.on {
  background: #2b2420;
  color: #f3ead3;
}
.results {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  max-height: min(60vh, 460px);
  overflow-y: auto;
}
.results li {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 10px;
  cursor: pointer;
}
.results li.active {
  background: #e6dabd;
}
.ico {
  flex: none;
  stroke-width: 1.4;
}
.text {
  min-width: 0;
}
.name {
  font-size: 16px;
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sub {
  font-size: 12px;
  opacity: 0.75;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty,
.progress {
  padding: 10px 12px;
  font-size: 13px;
  opacity: 0.8;
}
.progress {
  border-top: 1px solid rgba(43, 36, 32, 0.2);
  font-style: italic;
}
@media (max-width: 768px) {
  .search {
    left: 10px;
    width: auto;
    right: 56px;
    max-width: none;
  }
  .search:not(.expanded) {
    right: auto;
  }
  .search:not(.expanded) .box,
  .search:not(.expanded) .panel {
    display: none;
  }
  .search-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: #f3ead3;
    border: 1px solid #2b2420;
    border-radius: 6px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  }
  .box {
    height: 44px;
  }
  .hint {
    display: none;
  }
  .chips button,
  .results li {
    min-height: 44px;
  }
}
</style>
