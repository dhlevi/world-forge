<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { flyTarget, openRegion, world } from '../store';
import { CULTURES } from '../names/cultures';
import { personName } from '../lore/names';
import { HABITAT_LABEL, regionAt } from '../nature/habitat';
import { DANGER_WORD, bestiary } from '../nature/bestiary';
import { floraOf } from '../nature/flora';
import { curseOfHeart, curseRumours, signText } from '../nature/curses';

/**
 * The nature of the country about a place: its creatures (nature/bestiary.ts), its plants
 * (nature/flora.ts) and its curses (nature/curses.ts), with what the local people call them.
 */
type Tab = 'creatures' | 'plants' | 'curses';
const tab = ref<Tab>('creatures');
const panel = ref<HTMLElement | null>(null);
watch(world, () => (openRegion.value = null));

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const cellOf = (W: number, H: number, lon: number, lat: number) => {
  const i = ((Math.floor(((lon + 180) / 360) * W) % W) + W) % W, j = Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H)));
  return j * W + i;
};
const kmTo = (lon1: number, lat1: number, lon2: number, lat2: number) => Math.hypot((((lon2 - lon1 + 540) % 360) - 180) * 111.3 * Math.cos((lat1 * Math.PI) / 180), (lat2 - lat1) * 111.3);

/** The compass direction from one point to another, in words. */
const DIRS = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'];
const dirTo = (lon1: number, lat1: number, lon2: number, lat2: number) =>
  DIRS[(Math.round(Math.atan2(lat2 - lat1, (((lon2 - lon1 + 540) % 360) - 180) * Math.cos((lat1 * Math.PI) / 180)) / (Math.PI / 4)) + 8) % 8];
/** Fly the map to a place; the window stays open, so the place lands in the middle of the map left uncovered. */
const go = (lon: number, lat: number, zoom: number, name: string) => {
  const wide = panel.value?.offsetWidth ?? 0;
  const offsetX = wide < window.innerWidth * 0.9 ? -wide / 2 : 0;
  flyTarget.value = { lon, lat, zoom, name, t: performance.now(), offsetX };
};

const data = computed(() => {
  const w = world.value, at = openRegion.value;
  if (!w || !at) return null;
  const r = w.raster;
  const region = regionAt(r, at.lon, at.lat);
  const c = cellOf(r.W, r.H, at.lon, at.lat);
  const culture = r.culture[c];
  const L = CULTURES[culture]?.language;
  const local = (en: string) => (L ? L.word(en).spell : en);
  // The region's name: the named country it lies in, or the lands about its nearest town.
  const ri = w.regionOf[c];
  const named = ri >= 0 ? w.labels.features[ri]?.properties.name : undefined;
  let near = w.settlements[0], best = Infinity;
  for (const s of w.settlements) {
    const d = kmTo(at.lon, at.lat, s.lon, s.lat);
    if (d < best) {
      best = d;
      near = s;
    }
  }
  const place = near?.name ?? 'these parts';
  const title = named ? cap(named) : `The country about ${place}`;
  const lands = (r.curses ?? []).map((h) => ({ h, km: kmTo(at.lon, at.lat, h.lon, h.lat), dir: dirTo(at.lon, at.lat, h.lon, h.lat), type: curseOfHeart(h) })).filter((x) => x.km < 350).sort((a, b) => a.km - b.km);
  const rumours = curseRumours(r.seed, region.key, (rr, female) => personName(culture, female, rr).full, place);
  return {
    title, people: CULTURES[culture]?.people ?? '', region,
    habitats: region.main.slice(0, 5).map((h) => HABITAT_LABEL[h]),
    creatures: bestiary(r.seed, region, local),
    plants: floraOf(r.seed, region, local),
    lands, rumours, near,
  };
});
const USES: [keyof import('../nature/flora').Uses, string][] = [['food', 'Food'], ['medicine', 'Medicine'], ['poison', 'Poison'], ['timber', 'Timber'], ['dye', 'Dye'], ['craft', 'Craft'], ['magic', 'Lore']];
</script>

<template>
  <aside v-if="data" ref="panel" class="region" role="dialog" :aria-label="data.title">
    <header>
      <div class="title">
        <h2>{{ data.title }}</h2>
        <p>{{ cap(data.habitats.join(', ')) }}<template v-if="data.people"> · named by {{ data.people }}</template></p>
      </div>
      <button class="close" @click="openRegion = null">Close</button>
    </header>
    <nav class="tabs">
      <button :class="{ active: tab === 'creatures' }" @click="tab = 'creatures'">Creatures ({{ data.creatures.length }})</button>
      <button :class="{ active: tab === 'plants' }" @click="tab = 'plants'">Plants ({{ data.plants.length }})</button>
      <button :class="{ active: tab === 'curses' }" @click="tab = 'curses'">Curses ({{ data.lands.length + data.rumours.length }})</button>
    </nav>
    <div class="body">
      <section v-if="tab === 'creatures'">
        <div v-for="c in data.creatures" :key="c.name" class="entry">
          <div class="head">
            <b>{{ cap(c.name) }}</b><i v-if="c.local" class="local"> {{ c.local }}</i>
            <span class="tag" :class="`d${c.danger}`">{{ DANGER_WORD[c.danger] }}</span>
          </div>
          <div class="meta">{{ cap(c.size) }} {{ c.kind }} · {{ c.temper }} · seen {{ c.seen }}<template v-if="c.night"> · abroad by night</template></div>
          <p>{{ c.here ? `${c.text} ${c.here}` : c.text }}</p>
          <p class="small"><span v-if="c.traits.length" class="part"><i>Can:</i> {{ c.traits.join('; ') }}.</span><span v-if="c.yields.length" class="part"><i>Yields:</i> {{ c.yields.join(', ') }}.</span></p>
        </div>
        <p v-if="!data.creatures.length" class="dim">Little lives here that anyone has written down.</p>
      </section>
      <section v-else-if="tab === 'plants'">
        <div v-for="p in data.plants" :key="p.name" class="entry">
          <div class="head">
            <b>{{ cap(p.name) }}</b><i v-if="p.local" class="local"> {{ p.local }}</i>
            <span class="tag plain">{{ p.kind }} · {{ p.found }}</span>
          </div>
          <p>{{ p.season ? `${p.text} Gathered: ${p.season}.` : p.text }}</p>
          <p class="small">
            <template v-for="[k, label] in USES" :key="k"><template v-if="p.uses[k]"><span class="part" :class="{ poison: k === 'poison' }"><i>{{ label }}:</i> {{ p.uses[k] }}.</span></template></template>
          </p>
        </div>
      </section>
      <section v-else>
        <template v-if="data.lands.length">
          <h3>Cursed lands</h3>
          <div v-for="x in data.lands" :key="x.h.name" class="entry">
            <div class="head"><a href="#" title="Show this cursed land on the map" @click.prevent="go(x.h.lon, x.h.lat, 9, x.h.region)"><b>{{ cap(x.h.region) }}</b></a><i v-if="x.h.regionEn !== x.h.region" class="local"> {{ x.h.regionEn }}</i><span class="tag d4">{{ x.type.name }}</span></div>
            <div class="meta">{{ x.km < 20 ? 'Here' : `${Math.round(x.km)} km ${x.dir}` }} · its heart is {{ x.h.kind === 'village' ? 'the village of ' : x.h.kind === 'crypt' ? 'the crypt of ' : 'the ruin of ' }}<a href="#" title="Go to the heart of the curse" @click.prevent="go(x.h.lon, x.h.lat, 12.5, x.h.name)">{{ x.h.name }}</a></div>
            <p>{{ x.h.story }}</p>
            <p class="small"><i>What it does:</i> {{ cap(x.type.effects.join('; ')) }}.</p>
            <p class="small"><i>Signs:</i> {{ cap(signText(x.type, x.type.targets.includes('land') ? 'land' : x.type.targets.includes('place') ? 'place' : 'bloodline').join('; ')) }}.</p>
            <p class="small"><i>It might be lifted by</i> {{ x.type.lifting.join(', or by ') }}.</p>
          </div>
        </template>
        <h3>Rumours<template v-if="data.near"> heard in <a href="#" title="Go to the town" @click.prevent="go(data.near.lon, data.near.lat, 13, data.near.name ?? '')">{{ data.near.name }}</a></template></h3>
        <div v-for="(x, i) in data.rumours" :key="i" class="entry">
          <div class="head"><b>{{ x.type.name }}</b><span class="tag" :class="`d${Math.min(5, x.type.severity + 1)}`">{{ ['', 'a nuisance', 'troubling', 'grave', 'dire', 'a doom'][x.type.severity] }}</span></div>
          <p>{{ x.text }}</p>
          <p class="small"><i>What it does:</i> {{ cap(x.type.effects[0]) }}. <i>It might be lifted by</i> {{ x.type.lifting[0] }}.</p>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.region {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(500px, 48vw);
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
  background: #f8f1df;
  color: #2b2420;
  cursor: pointer;
}
.close {
  background: #2b2420;
  color: #f3ead3;
}
.tabs {
  display: flex;
  gap: 4px;
  padding: 0 14px 6px;
  border-bottom: 1px solid rgba(43, 36, 32, 0.25);
}
.tabs button.active {
  background: #2b2420;
  color: #f3ead3;
}
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 16px 24px;
  font-size: 14.5px;
  line-height: 1.4;
}
h3 {
  margin: 12px 0 5px;
  font-size: 16px;
  font-weight: normal;
  font-style: italic;
  border-bottom: 1px solid rgba(43, 36, 32, 0.2);
}
.entry {
  padding: 6px 0 8px;
  border-bottom: 1px dotted rgba(43, 36, 32, 0.25);
}
.head {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.local {
  opacity: 0.75;
}
.tag {
  margin-left: auto;
  font-size: 12.5px;
  padding: 1px 7px;
  border-radius: 9px;
  background: #e2d6b8;
  white-space: nowrap;
}
.tag.d1 { background: #d6dcbf; }
.tag.d2 { background: #e5d9a8; }
.tag.d3 { background: #e7c08e; }
.tag.d4 { background: #dd9a78; }
.tag.d5 { background: #b8574a; color: #f8f1df; }
.meta {
  font-size: 13px;
  opacity: 0.75;
}
p {
  margin: 3px 0;
}
.small {
  font-size: 13.5px;
}
a {
  color: #6b2f1a;
  text-decoration: none;
  border-bottom: 1px dotted currentColor;
  cursor: pointer;
}
a:hover {
  color: #a0432a;
}
.part + .part::before {
  content: ' ';
  white-space: pre;
}
.poison {
  color: #8b2a1e;
}
.dim {
  opacity: 0.7;
}
@media (max-width: 700px) {
  .region {
    width: 100vw;
  }
}
</style>
