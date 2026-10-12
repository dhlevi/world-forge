<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { flyTarget, openCulture, openFaith, openRealm, world } from '../store';
import { CULTURES, FAMILIES } from '../names/cultures';
import { ARCHETYPE_LABEL, DOCTRINES, type DoctrineGroup, TENETS, godly } from '../lore/faiths';
import { cultureInfo } from '../lore/culture';
import { fmtPeople } from '../lore/realm';
import { armsImage } from '../heraldry/draw';
import { currentLore } from './realm-lore';

/**
 * The faith window: a faith of the world, its name in its own holy tongue, the peoples and
 * realms that keep it, its doctrines and tenets, its gods, clergy and scripture, its holy places
 * (each flies to the map), its sects, and its history of founding, schism and conversion.
 */
type Tab = 'overview' | 'doctrine' | 'gods' | 'history';
const tab = ref<Tab>('overview');
const TABS: [Tab, string][] = [['overview', 'Overview'], ['doctrine', 'Doctrine'], ['gods', 'Gods and sects'], ['history', 'History']];
const GROUP_LABEL: Record<DoctrineGroup, string> = { head: 'Head of faith', clergy: 'Clergy', conversion: 'Conversion', others: 'Other faiths', death: 'The dead', marriage: 'Marriage' };

const ctx = computed(() => (openFaith.value !== null && world.value ? currentLore() : null));
const f = computed(() => (ctx.value && openFaith.value !== null ? ctx.value.L.faiths.faiths[openFaith.value] ?? null : null));
watch(openFaith, () => (tab.value = 'overview'));
watch(world, () => (openFaith.value = null));

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const units = computed(() => world.value?.politics.units ?? []);
const arms = (id: number) => armsImage(units.value[id].arms, 16, `u${id}`);
const yr = (y: number) => (y < 0 ? `${-y} before the reckoning` : `${y}`);

const people = computed(() => (ctx.value && f.value ? f.value.cultures.reduce((s, k) => s + cultureInfo(ctx.value!, k).people, 0) : 0));
const realms = computed(() => {
  const c = ctx.value, x = f.value;
  if (!c || !x) return [];
  return c.units.filter((u) => u.parent < 0 && u.gov !== 'league' && c.L.faiths.ofCulture[u.culture] === x.id).sort((a, b) => b.people - a.people).map((u) => u.id);
});
const zeal = computed(() => {
  const z = f.value?.zeal ?? 0;
  return z < 0.4 ? 'peaceable toward other faiths' : z < 1 ? 'firm in its ways' : z < 1.5 ? 'zealous' : 'fanatical';
});
const list = (a: string[]) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const prose = computed(() => {
  const x = f.value, c = ctx.value;
  if (!x || !c) return '';
  const now = list(x.cultures.map((k) => CULTURES[k].name));
  const fam = FAMILIES[x.langFamily];
  const origin = x.sects[0];
  const birth = x.missionary
    ? `${cap(x.name)} is a ${x.kind}, founded by the prophet ${x.prophet} among the ${CULTURES[origin?.culture ?? 0]?.name} at ${origin?.originName} in ${yr(x.founded)}.`
    : `${cap(x.name)} is the ancient ${x.kind} of the ${fam && fam.members.length > 1 ? `${fam.name} peoples` : CULTURES[x.former[0] ?? x.cultures[0]]?.name ?? ''}, older than their memory; its holy words are in ${x.tongue}.`;
  const held = x.cultures.length ? `It is kept by the ${now}, about ${fmtPeople(people.value)} souls${realms.value.length ? ` in ${realms.value.length === 1 ? 'one realm' : `${realms.value.length} realms`}` : ''}.` : `None of its peoples keep it now; it lives on among a few holdouts in the remote places of its homeland.`;
  const lost = x.former.length ? ` The ${list(x.former.map((k) => CULTURES[k].name))} once kept it, until they turned to ${list([...new Set(x.former.map((k) => c.L.faiths.faiths[c.L.faiths.ofCulture[k]]?.name ?? ''))])}.` : '';
  return `${birth} ${held}${lost} It is ${zeal.value}.`;
});
const history = computed(() => {
  const x = f.value, c = ctx.value;
  if (!x || !c) return [];
  const out: { year: number; text: string }[] = [];
  out.push({ year: x.founded, text: x.missionary ? `The prophet ${x.prophet} begins to preach at ${x.sects[0]?.originName}.` : `The faith takes shape among the ancestors of the ${list(FAMILIES[x.langFamily]?.members.map((k) => CULTURES[k].name) ?? [])}.` });
  for (const s of x.sects.slice(1)) out.push({ year: s.founded, text: `${cap(s.name)} arises at ${s.originName}: it ${s.note}.` });
  for (const k of x.cultures) {
    const y = c.L.faiths.converted.get(k);
    if (y !== undefined && c.L.faiths.formerOf.get(k) !== x.id) out.push({ year: y, text: `The ${CULTURES[k].name} take up the faith, leaving ${c.L.faiths.faiths[c.L.faiths.formerOf.get(k)!]?.name ?? 'their old gods'}.` });
  }
  for (const k of x.former) out.push({ year: c.L.faiths.converted.get(k) ?? x.founded, text: `The ${CULTURES[k].name} turn to ${c.L.faiths.faiths[c.L.faiths.ofCulture[k]]?.name}.` });
  return out.sort((a, b) => a.year - b.year);
});

function close(): void {
  openFaith.value = null;
}
function goCulture(k: number): void {
  openFaith.value = null;
  openCulture.value = k;
}
function goRealm(id: number): void {
  openFaith.value = null;
  openCulture.value = null;
  openRealm.value = id;
}
function flyTo(lon: number, lat: number, name: string): void {
  flyTarget.value = { lon, lat, zoom: 9, name, t: performance.now() };
}
</script>

<template>
  <aside v-if="f" class="faith">
    <header>
      <div class="title">
        <h2>{{ cap(f.name) }}</h2>
        <p><i>{{ f.native }}</i> · {{ cap(f.kind) }}<template v-if="f.missionary"> · a missionary faith</template> · symbol: {{ f.symbol }}</p>
      </div>
      <div class="actions">
        <button v-if="f.holySites.length" title="Fly to its holiest place" @click="flyTo(f.holySites[0].lon, f.holySites[0].lat, f.holySites[0].name)">Holy city</button>
        <button class="close" title="Close" @click="close">✕</button>
      </div>
    </header>
    <nav class="tabs">
      <button v-for="[k, label] in TABS" :key="k" :class="{ active: tab === k }" @click="tab = k">{{ label }}</button>
    </nav>
    <div class="body">
      <section v-if="tab === 'overview'">
        <p class="prose">{{ prose }}</p>
        <dl class="facts">
          <div><dt>The faithful</dt><dd>{{ cap(f.adherents) }}</dd></div>
          <div><dt>Shaped after</dt><dd>{{ cap(ARCHETYPE_LABEL[f.family]) }}</dd></div>
          <div><dt>Led by</dt><dd>{{ f.doctrines.head === 'none' ? 'No one; ' : `the ${f.head.title} (${f.head.native})` }}<template v-if="f.head.seatName && f.doctrines.head !== 'none'"> at {{ f.head.seatName }}</template><template v-if="f.doctrines.head === 'none'">its {{ f.clergy }} answer to {{ godly(f, 'the gods') }} alone</template></dd></div>
          <div><dt>Scripture</dt><dd>{{ cap(f.scripture) }} <i class="dim">({{ f.scriptureNative }})</i></dd></div>
          <div><dt>Clergy</dt><dd>{{ cap(f.clergy) }}</dd></div>
          <div><dt>Temples</dt><dd>{{ cap(f.temple) }}</dd></div>
        </dl>
        <template v-if="f.cultures.length">
          <h3>Peoples</h3>
          <p><template v-for="(k, i) in f.cultures" :key="k"><a href="#" @click.prevent="goCulture(k)">{{ CULTURES[k].name }}</a><span v-if="i < f.cultures.length - 1">, </span></template></p>
        </template>
        <template v-if="f.former.length">
          <h3>Once kept by</h3>
          <p><template v-for="(k, i) in f.former" :key="k"><a href="#" @click.prevent="goCulture(k)">{{ CULTURES[k].name }}</a><span v-if="i < f.former.length - 1">, </span></template></p>
        </template>
        <template v-if="realms.length">
          <h3>Realms of the faith</h3>
          <ul class="links">
            <li v-for="id in realms.slice(0, 12)" :key="id"><a href="#" @click.prevent="goRealm(id)"><img :src="arms(id)" alt="" />{{ cap(units[id].name) }}</a> <span class="dim">about {{ fmtPeople(units[id].people) }}</span></li>
          </ul>
          <p v-if="realms.length > 12" class="note">and {{ realms.length - 12 }} more.</p>
        </template>
        <h3>Holy places</h3>
        <ul class="plain"><li v-for="h in f.holySites" :key="h.name"><a href="#" @click.prevent="flyTo(h.lon, h.lat, h.name)">{{ h.name }}</a>, {{ h.what }}</li></ul>
      </section>

      <section v-else-if="tab === 'doctrine'">
        <h3>Doctrines</h3>
        <dl class="facts">
          <div v-for="(v, g) in f.doctrines" :key="g"><dt>{{ GROUP_LABEL[g] }}</dt><dd><em>{{ DOCTRINES[g][v]?.name }}</em> · {{ godly(f, DOCTRINES[g][v]?.text ?? '') }}</dd></div>
        </dl>
        <h3>Tenets</h3>
        <div v-for="t in f.tenets" :key="t" class="card">
          <h4>{{ TENETS[t]?.name }}</h4>
          <p>{{ godly(f, TENETS[t]?.text ?? '') }}</p>
          <p v-if="TENETS[t]?.effect" class="dim">{{ TENETS[t]?.effect }}</p>
        </div>
        <h3>Teachings</h3>
        <ul class="plain"><li v-for="b in f.beliefs" :key="b">{{ b }}</li></ul>
        <p class="note">Doctrines and tenets shape the world: zealous faiths fight more holy wars and keep colder relations with other faiths; missionary faiths spread further, and pluralist ones leave the old shrines standing when a people converts.</p>
      </section>

      <section v-else-if="tab === 'gods'">
        <h3>{{ f.deities.length > 2 && !f.missionary ? 'Gods and spirits' : 'Holy figures' }}</h3>
        <ul class="plain"><li v-for="g in f.deities" :key="g.name"><em>{{ g.name }}</em>, {{ g.domain }}</li></ul>
        <p class="note">Their names are in {{ f.tongue || 'the faith’s own tongue' }}.</p>
        <h3>Branches of the faith</h3>
        <ul class="plain">
          <li v-for="s in f.sects" :key="s.id">{{ cap(s.name) }} <span class="dim">({{ s.id === 0 ? s.note : `${s.note}, since ${yr(s.founded)}` }}<template v-if="s.originName">; from <a href="#" @click.prevent="flyTo(s.lon, s.lat, s.originName)">{{ s.originName }}</a></template><template v-if="CULTURES[s.culture]">; among the {{ CULTURES[s.culture].name }}</template>)</span></li>
        </ul>
      </section>

      <section v-else-if="tab === 'history'">
        <ol class="chron">
          <li v-for="(e, i) in history" :key="i"><span class="y">{{ yr(e.year) }}</span> {{ e.text }}</li>
        </ol>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.faith {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(520px, 46vw);
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
.title p {
  margin: 3px 0 0;
  font-size: 13.5px;
  opacity: 0.8;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
button:hover {
  background: #ebdfc2;
}
.close {
  background: #2b2420;
  color: #f3ead3;
}
.tabs {
  display: flex;
  gap: 3px;
  padding: 6px 12px 0;
  overflow-x: auto;
  border-bottom: 1px solid rgba(43, 36, 32, 0.25);
  flex: none;
}
.tabs button {
  border-radius: 4px 4px 0 0;
  border-bottom: none;
  white-space: nowrap;
}
.tabs button.active {
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
h4 {
  margin: 0 0 3px;
  font-weight: normal;
  font-style: italic;
  font-size: 16px;
}
p {
  margin: 4px 0;
}
a {
  color: #6e2a1e;
}
a img {
  width: 14px;
  vertical-align: -3px;
  margin-right: 4px;
}
.prose {
  font-size: 15.5px;
}
.dim,
.note {
  opacity: 0.75;
}
.note {
  font-style: italic;
  font-size: 13.5px;
}
.card {
  border: 1px solid rgba(43, 36, 32, 0.3);
  border-radius: 6px;
  padding: 8px 12px;
  margin: 6px 0;
  background: rgba(255, 255, 255, 0.25);
}
.facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 14px;
  margin: 8px 0;
}
dt {
  font-size: 12px;
  opacity: 0.7;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
dd {
  margin: 0;
}
ul.plain,
ul.links {
  margin: 4px 0;
  padding-left: 18px;
}
ul.links {
  list-style: none;
  padding-left: 0;
}
ol.chron {
  list-style: none;
  padding: 0;
  margin: 6px 0;
}
.chron li {
  margin: 5px 0;
  display: flex;
  gap: 10px;
}
.chron .y {
  flex: none;
  width: 64px;
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}
@media (max-width: 768px) {
  .faith {
    top: auto;
    left: 0;
    width: auto;
    height: 72vh;
    border-left: none;
    border-top: 1px solid #2b2420;
    border-radius: 12px 12px 0 0;
  }
  button {
    min-height: 44px;
  }
  .actions {
    flex-direction: row;
  }
  .facts {
    grid-template-columns: 1fr;
  }
}
</style>
