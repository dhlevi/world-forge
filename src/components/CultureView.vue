<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { flyTarget, openCulture, openRealm, world } from '../store';
import { CULTURES } from '../names/cultures';
import { ETHOS, TRADITIONS } from '../names/traits';
import { LEXICON } from '../lang/lexicon';
import { consonantChart, examples, grammarNotes, pronounTable, spellingNotes, vowelChart } from '../lang/describe';
import { translate } from '../lang/translate';
import { cultureInfo } from '../lore/culture';
import { fmtPeople } from '../lore/realm';
import { armsImage } from '../heraldry/draw';
import { currentLore } from './realm-lore';

/**
 * The culture window: a people of the world, their outlook, traditions and customs, where they
 * live and rule, and their language: its sounds (with IPA), syllables, spelling, grammar,
 * examples word by word, a dictionary and a box that translates English into it.
 */
type Tab = 'overview' | 'sounds' | 'grammar' | 'dictionary' | 'translate';
const tab = ref<Tab>('overview');
const query = ref('');
const phrase = ref('The old king rules the great city.');

const c = computed(() => (openCulture.value !== null && world.value ? CULTURES[openCulture.value] ?? null : null));
const L = computed(() => c.value?.language ?? null);
const info = computed(() => {
  const ctx = currentLore();
  return ctx && openCulture.value !== null ? cultureInfo(ctx, openCulture.value) : null;
});
watch(openCulture, () => {
  tab.value = 'overview';
  query.value = '';
});
watch(world, () => (openCulture.value = null));

const TABS: [Tab, string][] = [['overview', 'Overview'], ['sounds', 'Sounds'], ['grammar', 'Grammar'], ['dictionary', 'Dictionary'], ['translate', 'Translate']];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const units = computed(() => world.value?.politics.units ?? []);
const arms = (id: number) => armsImage(units.value[id].arms, 16, `u${id}`);

const cons = computed(() => (L.value ? consonantChart(L.value) : null));
const vows = computed(() => (L.value ? vowelChart(L.value) : null));
const notes = computed(() => (L.value ? grammarNotes(L.value) : []));
const prons = computed(() => (L.value ? pronounTable(L.value) : []));
const exs = computed(() => (L.value ? examples(L.value) : []));
const spells = computed(() => (L.value ? spellingNotes(L.value) : []));
const dict = computed(() => {
  const lang = L.value;
  if (!lang) return [];
  const q = query.value.trim().toLowerCase();
  const seen = new Set<string>();
  const rows = LEXICON.filter((x) => {
    if (seen.has(x.en)) return false;
    seen.add(x.en);
    return true;
  }).map((x) => ({ ...x, w: lang.word(x.en), g: lang.grammar.genders && x.pos === 'n' ? lang.grammar.genders[lang.genderOf(x.en)].slice(0, 1) : '' }));
  if (!q) return rows;
  const hit = rows.filter((x) => x.en.includes(q) || x.w.spell.includes(q));
  // Any other English word has a word too.
  if (/^[a-z]+$/.test(q) && !rows.some((x) => x.en === q)) hit.unshift({ en: q, pos: 'n', cat: '', w: lang.word(q), g: '' });
  return hit;
});
const translated = computed(() => (L.value && phrase.value.trim() ? translate(L.value, phrase.value) : []));

const description = computed(() => {
  const x = c.value, i = info.value;
  if (!x || !i) return '';
  const e = ETHOS[x.ethos];
  const tr = x.traditions.map((t) => TRADITIONS[t]?.name.toLowerCase()).filter(Boolean);
  const where = i.realms.length ? `They rule ${i.realms.length === 1 ? 'one realm' : `${i.realms.length} realms`}${i.vassals ? `, and hold ${i.vassals} lordships within others' realms` : ''}.` : 'They rule no realm of their own.';
  return `${cap(x.people)} (in their own tongue, the ${x.endonym}) number about ${fmtPeople(i.people)}${x.nw ? ', in the New World' : ''}. ${where} Their outlook is ${e?.name.toLowerCase() ?? 'their own'}: ${e?.text.charAt(0).toLowerCase()}${e?.text.slice(1)} They are known as ${tr.slice(0, -1).join(', ')}${tr.length > 1 ? ' and ' : ''}${tr[tr.length - 1] ?? ''}.`;
});

function close(): void {
  openCulture.value = null;
}
function goRealm(id: number): void {
  openCulture.value = null;
  openRealm.value = id;
}
function goCulture(k: number): void {
  openCulture.value = k;
}
function showHome(): void {
  const x = c.value;
  if (x) flyTarget.value = { lon: x.hearth[0], lat: x.hearth[1], zoom: 4.5, name: x.name, t: performance.now() };
}
</script>

<template>
  <aside v-if="c" class="culture">
    <header>
      <div class="title">
        <h2>{{ c.name }}</h2>
        <p>{{ c.endonym }} <span v-if="c.endonymIpa" class="ipa">/{{ c.endonymIpa }}/</span> · {{ ETHOS[c.ethos]?.name }} · {{ info ? `about ${fmtPeople(info.people)} people` : '' }}</p>
      </div>
      <div class="actions">
        <button title="Fly to their homeland" @click="showHome">Homeland</button>
        <button class="close" title="Close" @click="close">✕</button>
      </div>
    </header>
    <nav class="tabs">
      <button v-for="[k, label] in TABS" :key="k" :class="{ active: tab === k }" @click="tab = k">{{ label }}</button>
    </nav>
    <div class="body">
      <section v-if="tab === 'overview'">
        <p class="prose">{{ description }}</p>
        <h3>Outlook</h3>
        <div class="card">
          <h4>{{ ETHOS[c.ethos]?.name }}</h4>
          <p>{{ ETHOS[c.ethos]?.text }}</p>
          <p class="dim">{{ ETHOS[c.ethos]?.effect }}</p>
        </div>
        <h3>Traditions</h3>
        <div v-for="t in c.traditions" :key="t" class="trad">
          <em>{{ TRADITIONS[t]?.name }}</em> · {{ TRADITIONS[t]?.text }} <span v-if="TRADITIONS[t]?.effect !== 'Flavour.'" class="dim">{{ TRADITIONS[t]?.effect }}</span>
        </div>
        <template v-if="c.customs">
          <h3>Customs</h3>
          <dl class="facts">
            <div><dt>War</dt><dd>{{ c.customs.martial }}</dd></div>
            <div><dt>Marriage</dt><dd>{{ c.customs.marriage }}</dd></div>
            <div><dt>Building</dt><dd>{{ cap(c.customs.architecture) }}</dd></div>
            <div><dt>Dress</dt><dd>{{ cap(c.customs.dress) }}</dd></div>
            <div><dt>Food</dt><dd>{{ cap(c.customs.food) }}</dd></div>
            <div><dt>Festivals</dt><dd><span v-for="f in c.customs.festivals" :key="f.english" class="fest"><em>{{ f.native }}</em> ({{ f.english }})</span></dd></div>
          </dl>
        </template>
        <template v-if="info?.faith">
          <h3>Faith</h3>
          <p>{{ cap(info.sect && info.sect.id > 0 ? info.sect.name : info.faith.name) }}<span class="dim"> · {{ info.faith.kind }}</span></p>
        </template>
        <template v-if="info?.realms.length">
          <h3>Realms they rule</h3>
          <ul class="links">
            <li v-for="id in info.realms.slice(0, 12)" :key="id"><a href="#" @click.prevent="goRealm(id)"><img :src="arms(id)" alt="" />{{ cap(units[id].name) }}</a> <span class="dim">about {{ fmtPeople(units[id].people) }}</span></li>
          </ul>
          <p v-if="info.realms.length > 12" class="note">and {{ info.realms.length - 12 }} more.</p>
        </template>
        <template v-if="info?.kin.length">
          <h3>Kindred peoples</h3>
          <p><template v-for="(k, i) in info.kin" :key="k"><a href="#" @click.prevent="goCulture(k)">{{ CULTURES[k].name }}</a><span v-if="i < info.kin.length - 1">, </span></template></p>
        </template>
        <p class="note">Grown from the familiar {{ info?.templateName }} template (after {{ info?.after }}); its language has drifted {{ Math.round((L?.drift ?? 0) * 100) }}% from it.</p>
      </section>

      <section v-else-if="tab === 'sounds' && L">
        <p>Syllables: <b>{{ L.syllableStructure() }}</b> · stress: {{ L.stress === 'none' ? 'even (no fixed stress)' : `${L.stress} syllable` }}<template v-if="L.tones">, with {{ L.tones }} tones</template><template v-if="L.harmony">; vowel harmony (a word's vowels are all front or all back)</template>.</p>
        <h3>Consonants</h3>
        <div class="scroll">
          <table class="chart">
            <tr><th /><th v-for="p in cons!.places" :key="p">{{ p }}</th></tr>
            <tr v-for="row in cons!.rows" :key="row.manner">
              <th>{{ row.manner }}</th>
              <td v-for="(cell, i) in row.cells" :key="i"><span v-for="x in cell" :key="x.ipa" class="ph"><b>{{ x.ipa }}</b><small v-if="x.spell !== x.ipa">{{ x.spell || '–' }}</small></span></td>
            </tr>
          </table>
        </div>
        <h3>Vowels</h3>
        <table class="chart">
          <tr><th /><th v-for="b in vows!.backs" :key="b">{{ b }}</th></tr>
          <tr v-for="row in vows!.rows" :key="row.height">
            <th>{{ row.height }}</th>
            <td v-for="(cell, i) in row.cells" :key="i"><span v-for="x in cell" :key="x.ipa" class="ph"><b>{{ x.ipa }}</b><small v-if="x.spell !== x.ipa">{{ x.spell }}</small></span></td>
          </tr>
        </table>
        <p class="note">Each sound is shown in IPA, with its spelling beside it where that differs.</p>
        <template v-if="spells.length">
          <h3>Spelling</h3>
          <ul class="plain"><li v-for="n in spells" :key="n">{{ n }}</li></ul>
        </template>
        <template v-if="L.shifts.length">
          <h3>Sound changes</h3>
          <p class="note">Old names and words inherited from the template have changed:</p>
          <ul class="plain"><li v-for="s in L.shifts" :key="s.note">{{ s.note }}</li></ul>
        </template>
      </section>

      <section v-else-if="tab === 'grammar' && L">
        <ul class="plain"><li v-for="n in notes" :key="n">{{ n }}</li></ul>
        <h3>Pronouns</h3>
        <table class="dict">
          <tr v-for="p in prons" :key="p.en"><td>{{ p.en }}</td><td><b>{{ p.word }}</b></td><td class="ipa">/{{ p.ipa }}/</td></tr>
        </table>
        <h3>Examples</h3>
        <div v-for="e in exs" :key="e.en" class="ex">
          <div class="en">{{ e.en }}</div>
          <div class="gloss">
            <span v-for="(t, i) in e.tokens" :key="i" class="tok"><b>{{ t.form }}</b><small>{{ t.gloss }}</small></span>
          </div>
        </div>
      </section>

      <section v-else-if="tab === 'dictionary' && L">
        <input v-model="query" class="search" type="search" placeholder="Search English or the language…" />
        <table class="dict">
          <tr v-for="x in dict" :key="x.en"><td>{{ x.en }}</td><td><b>{{ x.w.spell }}</b><small v-if="x.g" class="dim"> ({{ x.g }})</small></td><td class="ipa">/{{ x.w.ipa }}/</td><td class="dim">{{ x.pos }}</td></tr>
        </table>
        <p class="note">Any English word can be looked up; words outside the core vocabulary are made on demand, the same way every time.</p>
      </section>

      <section v-else-if="tab === 'translate' && L">
        <textarea v-model="phrase" rows="3" placeholder="Type English: a name, a phrase or a simple sentence" />
        <div v-if="translated.length" class="ex big">
          <div class="native">{{ translated.map((t) => t.form).join(' ') }}</div>
          <div class="gloss">
            <span v-for="(t, i) in translated" :key="i" class="tok"><b>{{ t.form }}</b><small>{{ t.gloss }}</small></span>
          </div>
        </div>
        <p class="note">Handles names and noun phrases (“the black ford”, “the king’s sword”, “city of the river”) and simple sentences with one verb (“The warriors will not fight the giants.”), in the language's word order, with its articles, plurals, possession, tenses and agreement.</p>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.culture {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(540px, 48vw);
  z-index: 16;
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
.ipa {
  font-family: 'Charis SIL', 'Doulos SIL', 'Gentium Plus', 'Times New Roman', serif;
  opacity: 0.8;
}
.card {
  border: 1px solid rgba(43, 36, 32, 0.3);
  border-radius: 6px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.25);
}
.trad {
  margin: 4px 0;
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
.fest {
  display: block;
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
.scroll {
  overflow-x: auto;
}
table {
  border-collapse: collapse;
}
.chart th,
.chart td {
  border: 1px solid rgba(43, 36, 32, 0.2);
  padding: 3px 6px;
  font-size: 13px;
  text-align: center;
  vertical-align: middle;
}
.chart th {
  font-weight: normal;
  font-style: italic;
  font-size: 12px;
  opacity: 0.8;
}
.ph {
  display: inline-block;
  margin: 0 3px;
  font-family: 'Charis SIL', 'Doulos SIL', 'Gentium Plus', 'Times New Roman', serif;
}
.ph small,
.tok small {
  display: block;
  font-size: 11px;
  opacity: 0.7;
  font-family: 'IM Fell English', Georgia, serif;
}
.dict {
  width: 100%;
}
.dict td {
  padding: 3px 8px 3px 0;
  border-bottom: 1px solid rgba(43, 36, 32, 0.1);
}
.ex {
  margin: 8px 0;
  padding: 6px 10px;
  border-left: 3px solid rgba(43, 36, 32, 0.25);
}
.ex .en {
  font-style: italic;
  opacity: 0.8;
}
.ex .native {
  font-size: 19px;
  font-style: italic;
  margin-bottom: 4px;
}
.gloss {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 3px;
}
.tok b {
  font-weight: normal;
  font-size: 15.5px;
}
.search,
textarea {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  font-size: 15px;
  padding: 6px 8px;
  border: 1px solid rgba(43, 36, 32, 0.4);
  border-radius: 4px;
  background: #fbf6ea;
  color: inherit;
}
@media (max-width: 768px) {
  .culture {
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
