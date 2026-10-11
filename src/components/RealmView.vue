<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { flyTarget, openRealm, world } from '../store';
import { LEVEL_NAME, type PolUnit } from '../gen/politics';
import { blazon } from '../heraldry/arms';
import { armsImage } from '../heraldry/draw';
import { fmtPeople, realmDetails, type RealmDetails } from '../lore/realm';
import { currentLore } from './realm-lore';

/**
 * The realm details window: a panel beside the map (a sheet from the bottom on phones) for any
 * realm at any tier. Tabs cover its overview, rulers and houses, diplomacy, vassals, people,
 * trade and armies, faith and chronicle. Every realm named in it opens in turn (Back returns),
 * and while it is open the map tints its allies, rivals and enemies (see MapView).
 */
type Tab = 'overview' | 'rulers' | 'diplomacy' | 'vassals' | 'people' | 'economy' | 'faith' | 'chronicle';
const tab = ref<Tab>('overview');
const back = ref<number[]>([]);
const expanded = ref(new Set<number>());
const showPast = ref(false);

const units = computed<PolUnit[]>(() => world.value?.politics.units ?? []);
const d = computed<RealmDetails | null>(() => {
  const id = openRealm.value;
  const c = currentLore();
  if (id === null || !c || !units.value[id]) return null;
  return realmDetails(c, id);
});
const lore = computed(() => currentLore()?.L ?? null);

watch(openRealm, (id) => {
  if (id === null) {
    back.value = [];
    return;
  }
  expanded.value = new Set();
  showPast.value = false;
});
watch(world, () => (openRealm.value = null));

const TABS = computed<[Tab, string][]>(() => {
  const u = d.value?.unit;
  const t: [Tab, string][] = [['overview', 'Overview'], ['rulers', u?.gov === 'league' ? 'Council' : 'Rulers'], ['diplomacy', 'Diplomacy']];
  if (d.value?.vassals.length) t.push(['vassals', u?.gov === 'league' ? 'Members' : 'Vassals']);
  t.push(['people', 'People'], ['economy', 'Trade & arms'], ['faith', 'Faith'], ['chronicle', 'Chronicle']);
  return t;
});
watch(TABS, (t) => {
  if (!t.some(([k]) => k === tab.value)) tab.value = 'overview';
});

function go(id: number): void {
  if (openRealm.value === id) return;
  if (openRealm.value !== null) back.value.push(openRealm.value);
  openRealm.value = id;
}
function goBack(): void {
  const id = back.value.pop();
  if (id !== undefined) openRealm.value = id;
}
function close(): void {
  openRealm.value = null;
}
function showOnMap(u: PolUnit): void {
  flyTarget.value = { lon: u.lon, lat: u.lat, zoom: u.gov === 'league' ? 4.6 : u.parent < 0 ? Math.max(3.4, [7.5, 6.5, 5.2, 4.4, 3.4][u.level]) : [10.4, 9, 7, 5, 3.6][u.level], name: u.name, t: performance.now() };
}
function flyTo(lon: number, lat: number, name: string): void {
  flyTarget.value = { lon, lat, zoom: 9, name, t: performance.now() };
}
function toggle(id: number): void {
  const s = new Set(expanded.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  expanded.value = s;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const n = (v: number) => Math.round(v).toLocaleString('en');
const pct = (v: number) => (v >= 10 ? Math.round(v) : v.toFixed(1)) + '%';
const arms = (id: number, w: number) => armsImage(units.value[id].arms, w, `u${id}`);
const nm = (id: number) => cap(units.value[id]?.name ?? '');

/** The vassal tree, flattened: a row per open node, indented by depth. */
const tree = computed(() => {
  const L = lore.value, dd = d.value;
  if (!L || !dd) return [];
  const rows: { id: number; depth: number; node: RealmDetails['vassals'][number] }[] = [];
  const c = currentLore()!;
  const add = (list: RealmDetails['vassals'], depth: number) => {
    for (const v of list) {
      rows.push({ id: v.id, depth, node: v });
      if (expanded.value.has(v.id) && v.kids) add(realmDetails(c, v.id).vassals, depth + 1);
    }
  };
  add(dd.vassals, 0);
  return rows;
});

const relLists = computed(() => {
  const dd = d.value;
  if (!dd) return [];
  return [
    ['Allies', 'ally', dd.allies], ['Friends', 'friend', dd.friends], ['Rivals', 'rival', dd.rivals], ['At truce', 'truce', dd.truces],
  ] as const;
});
const foreignBy = computed(() => (d.value && d.value.unit.parent >= 0 && d.value.unit.gov !== 'league' ? d.value.top : null));
const KIND_MARK: Record<string, string> = {
  founding: '✦', succession: '♛', war: '⚔', peace: '⚖', marriage: '♥', alliance: '⊕', disaster: '☠', faith: '☸', building: '⌂', vassal: '⚑', wonder: '☄',
};
const sub = computed(() => {
  const dd = d.value;
  if (!dd) return '';
  const u = dd.unit;
  return [u.title || LEVEL_NAME[u.level], u.gov === 'league' ? `${u.ruler} at ${u.seatName}` : `${u.ruler} at ${u.seatName}`, `founded ${dd.founded}`].join(' · ');
});
</script>

<template>
  <aside v-if="d" class="realm" @keydown.esc="close">
    <header>
      <img class="big" :src="arms(d.id, 64)" :title="blazon(d.unit.arms)" alt="" />
      <div class="title">
        <div v-if="d.chain.length > 1" class="crumbs">
          <template v-for="(u, k) in d.chain.slice(1).reverse()" :key="u.id">
            <a href="#" @click.prevent="go(u.id)"><img :src="arms(u.id, 14)" alt="" />{{ cap(u.name) }}</a><span v-if="k < d.chain.length - 2" class="sep">›</span>
          </template>
        </div>
        <h2>{{ cap(d.unit.name) }}</h2>
        <p>{{ sub }}</p>
      </div>
      <div class="actions">
        <button v-if="back.length" title="Back" @click="goBack">‹ Back</button>
        <button title="Fly to this realm" @click="showOnMap(d.unit)">Show on map</button>
        <button class="close" title="Close" @click="close">✕</button>
      </div>
    </header>
    <nav class="tabs">
      <button v-for="[k, label] in TABS" :key="k" :class="{ active: tab === k }" @click="tab = k">{{ label }}</button>
    </nav>

    <div class="body">
      <!-- Overview -->
      <section v-if="tab === 'overview'">
        <p class="prose">{{ d.overview }}</p>
        <p class="gov">{{ d.government }}</p>
        <dl class="facts">
          <div><dt>Ruler</dt><dd>{{ d.ruler?.council ?? d.ruler?.styled ?? '—' }}</dd></div>
          <div><dt>Capital</dt><dd>{{ d.unit.seatName }}</dd></div>
          <div><dt>Founded</dt><dd>{{ d.founded }} ({{ d.year - d.founded }} years ago)</dd></div>
          <div><dt>Area</dt><dd>{{ n(d.people.area) }} km²</dd></div>
          <div><dt>People</dt><dd>about {{ fmtPeople(d.people.total) }}</dd></div>
          <div><dt>Settlements</dt><dd>{{ d.people.nCities }} cities, {{ d.people.nTowns }} towns, ~{{ n(d.people.nVillages) }} villages</dd></div>
          <div><dt>Wealth</dt><dd>{{ cap(d.economy.word) }} ({{ d.economy.rank }} of {{ d.economy.of }} realms)</dd></div>
          <div><dt>Revenue</dt><dd>~{{ n(d.economy.revenue) }} {{ d.economy.coin }} a year</dd></div>
          <div><dt>Armies</dt><dd>{{ n(d.military.levy) }} levies, {{ n(d.military.standing) }} standing</dd></div>
          <div><dt>Faith</dt><dd>{{ cap(d.faith.sect.id === 0 || d.faith.sect.name === 'the orthodox faith' ? d.faith.faith.name : d.faith.sect.name) }}</dd></div>
        </dl>
        <h3>Land</h3>
        <p>{{ d.land.climate }}. <span v-if="d.land.coastKm > 20">About {{ n(d.land.coastKm) }} km of coast. </span><span v-if="d.land.highPct > 5">{{ Math.round(d.land.highPct) }}% upland above 1,200 m.</span></p>
        <div v-for="t in d.land.terrain" :key="t.name" class="bar"><span class="lbl">{{ cap(t.name) }}</span><span class="track"><span :style="{ width: `${Math.min(100, t.pct)}%` }" /></span><span class="v">{{ pct(t.pct) }}</span></div>
        <p class="blazon"><em>Arms:</em> {{ blazon(d.unit.arms) }}</p>
        <p class="note">The year is {{ d.year }} {{ d.era }}.</p>
      </section>

      <!-- Rulers -->
      <section v-else-if="tab === 'rulers'">
        <div v-if="d.ruler" class="card">
          <template v-if="d.ruler.council">
            <h3>{{ d.ruler.council }}</h3>
            <p>{{ d.ruler.succession }}.</p>
            <p>Members:</p>
            <ul class="links"><li v-for="m in d.members" :key="m"><a href="#" @click.prevent="go(m)"><img :src="arms(m, 16)" alt="" />{{ nm(m) }}</a></li></ul>
          </template>
          <template v-else>
            <h3>{{ d.ruler.styled }}</h3>
            <p v-if="d.ruler.heldBy !== undefined">Held in person by the ruler of <a href="#" @click.prevent="go(d.ruler.heldBy!)">{{ nm(d.ruler.heldBy) }}</a>.</p>
            <p v-if="d.ruler.full && d.ruler.full !== d.ruler.styled" class="dim">{{ d.ruler.full }}<template v-if="d.ruler.house">, of {{ d.ruler.house.name }}</template></p>
            <p v-if="d.ruler.age">Aged {{ d.ruler.age }}, ruling since {{ d.ruler.since }}.</p>
            <p v-if="d.ruler.traits.length" class="chips"><span v-for="t in d.ruler.traits" :key="t" class="chip">{{ t }}</span></p>
            <p v-if="d.ruler.spouse"><em>Spouse:</em> {{ d.ruler.spouse }}</p>
            <p v-if="d.ruler.heir"><em>Heir:</em> {{ d.ruler.heir }}<template v-if="d.ruler.children > 1">; {{ d.ruler.children - 1 }} other {{ d.ruler.children === 2 ? 'child' : 'children' }}</template></p>
            <p v-if="d.ruler.regent"><em>Regent:</em> {{ d.ruler.regent }}</p>
            <p><em>Succession:</em> {{ d.ruler.succession }}.</p>
            <p v-if="d.ruler.house?.motto" class="dim">Motto of {{ d.ruler.house.name }}: “{{ d.ruler.house.motto }}”</p>
          </template>
        </div>
        <template v-if="d.ruler?.court.length">
          <h3>Court</h3>
          <ul class="plain"><li v-for="c in d.ruler.court" :key="c.office"><em>{{ c.office }}:</em> {{ c.name }} <span class="dim">({{ c.note }})</span></li></ul>
        </template>
        <template v-if="d.houses.length">
          <h3>Ruling houses</h3>
          <ul class="plain"><li v-for="h in d.houses" :key="h.house.id + ':' + h.from">{{ cap(h.house.name) }}: {{ h.from }}–{{ h.to === d.year ? 'now' : h.to }} <span class="dim">({{ h.how }})</span></li></ul>
        </template>
        <template v-if="d.cadets.length">
          <h3>Cadet branches</h3>
          <ul class="plain"><li v-for="c in d.cadets" :key="c.house.id">{{ cap(c.house.name) }}: {{ c.holds.slice(0, 4).map(cap).join(', ') }}<template v-if="c.holds.length > 4"> and {{ c.holds.length - 4 }} more</template></li></ul>
        </template>
        <template v-if="d.reigns.length">
          <h3>Line of {{ d.unit.gov === 'republic' || d.unit.gov === 'city-state' || d.unit.gov === 'colony' ? 'leaders' : 'rulers' }}</h3>
          <table class="reigns">
            <tr v-for="r in [...d.reigns].reverse()" :key="r.from + r.styled">
              <td class="yr">{{ r.from }}–{{ r.to ?? '' }}</td>
              <td>{{ r.styled }}<span class="dim"> · {{ r.how }}</span><div v-if="r.end" class="dim">{{ cap(r.end) }}</div></td>
            </tr>
          </table>
          <p v-if="d.earlier" class="note">{{ d.earlier }} earlier rulers not shown.</p>
        </template>
      </section>

      <!-- Diplomacy -->
      <section v-else-if="tab === 'diplomacy'">
        <p v-if="foreignBy" class="note">Foreign affairs are in the hands of <a href="#" @click.prevent="go(foreignBy.id)">{{ cap(foreignBy.name) }}</a>; these are its relations.</p>
        <template v-if="d.wars.length">
          <h3>At war</h3>
          <div v-for="w in d.wars" :key="w.war.id" class="card war">
            <h4>{{ cap(w.war.name) }} <span class="dim">since {{ w.war.start }}</span></h4>
            <p>{{ cap(w.war.cause) }}. <em>{{ cap(w.outcome) }}.</em></p>
            <p><em>Against:</em> <template v-for="(e, k) in w.enemies" :key="e"><a href="#" @click.prevent="go(e)"><img :src="arms(e, 14)" alt="" />{{ nm(e) }}</a><span v-if="k < w.enemies.length - 1">, </span></template></p>
            <p v-if="w.allies.length"><em>Beside:</em> <template v-for="(e, k) in w.allies" :key="e"><a href="#" @click.prevent="go(e)"><img :src="arms(e, 14)" alt="" />{{ nm(e) }}</a><span v-if="k < w.allies.length - 1">, </span></template></p>
          </div>
        </template>
        <template v-for="[label, cls, list] in relLists" :key="label">
          <template v-if="list.length">
            <h3>{{ label }}</h3>
            <ul class="links" :class="cls">
              <li v-for="x in list" :key="x.id"><a href="#" @click.prevent="go(x.id)"><img :src="arms(x.id, 16)" alt="" />{{ cap(x.name) }}</a> <span class="dim">{{ x.rel.note }}, since {{ x.rel.since }}</span></li>
            </ul>
          </template>
        </template>
        <template v-if="d.claims.length">
          <h3>Its claims</h3>
          <ul class="plain"><li v-for="c in d.claims" :key="c.text">{{ c.text }}</li></ul>
        </template>
        <template v-if="d.claimsOn.length">
          <h3>Claims against it</h3>
          <ul class="plain"><li v-for="c in d.claimsOn" :key="c.text">{{ c.text }}</li></ul>
        </template>
        <p v-if="!d.wars.length && !d.allies.length && !d.rivals.length && !d.friends.length && !d.claims.length && !d.claimsOn.length" class="note">No ties of note with other realms.</p>
        <template v-if="d.pastWars.length">
          <h3><a href="#" @click.prevent="showPast = !showPast">Past wars ({{ d.pastWars.length }}) {{ showPast ? '▾' : '▸' }}</a></h3>
          <ul v-if="showPast" class="plain">
            <li v-for="w in d.pastWars" :key="w.war.id"><em>{{ cap(w.war.name) }}</em> ({{ w.war.start }}–{{ w.war.end }}) against <template v-for="(e, k) in w.enemies" :key="e"><a href="#" @click.prevent="go(e)">{{ nm(e) }}</a><span v-if="k < w.enemies.length - 1">, </span></template>: {{ w.outcome }}.</li>
          </ul>
        </template>
      </section>

      <!-- Vassals -->
      <section v-else-if="tab === 'vassals'">
        <p class="note">{{ d.unit.gov === 'league' ? 'Member realms of the union.' : 'Direct vassals, largest first. Open a row to see its own vassals.' }}</p>
        <div v-for="row in tree" :key="row.id" class="vrow" :style="{ paddingLeft: `${row.depth * 18}px` }">
          <button v-if="row.node.kids" class="tog" @click="toggle(row.id)">{{ expanded.has(row.id) ? '▾' : '▸' }}</button><span v-else class="tog" />
          <img :src="arms(row.id, 22)" alt="" />
          <div class="vtext">
            <a href="#" @click.prevent="go(row.id)">{{ cap(row.node.name) }}</a>
            <div class="dim">{{ row.node.title }} · {{ row.node.ruler }} · about {{ fmtPeople(row.node.people) }} · {{ row.node.joined }}</div>
            <div v-if="row.node.unrest" class="unrest">Unrest: {{ row.node.unrest }}</div>
          </div>
        </div>
      </section>

      <!-- People -->
      <section v-else-if="tab === 'people'">
        <dl class="facts">
          <div><dt>People</dt><dd>{{ n(d.people.total) }}</dd></div>
          <div><dt>In towns</dt><dd>{{ n(d.people.towns) }} ({{ pct(d.people.urban) }})</dd></div>
          <div><dt>Density</dt><dd>{{ d.people.density.toFixed(1) }} per km²</dd></div>
          <div><dt>Settlements</dt><dd>{{ d.people.nCities }} cities, {{ d.people.nTowns }} towns, ~{{ n(d.people.nVillages) }} villages</dd></div>
        </dl>
        <h3>Peoples</h3>
        <div v-for="t in d.people.cultures" :key="t.name" class="bar"><span class="lbl">{{ t.name }}</span><span class="track"><span :style="{ width: `${t.pct}%` }" /></span><span class="v">{{ pct(t.pct) }}</span></div>
        <h3>Folk</h3>
        <div v-for="t in d.people.folk" :key="t.name" class="bar"><span class="lbl">{{ t.name }}</span><span class="track"><span :style="{ width: `${t.pct}%` }" /></span><span class="v">{{ pct(t.pct) }}</span></div>
        <h3>Faiths</h3>
        <div v-for="t in d.people.faiths" :key="t.name" class="bar"><span class="lbl">{{ t.name }}</span><span class="track faith"><span :style="{ width: `${t.pct}%` }" /></span><span class="v">{{ pct(t.pct) }}</span></div>
        <h3>Largest settlements</h3>
        <table class="towns">
          <tr v-for="s in d.people.settlements" :key="s.name"><td><a href="#" @click.prevent="flyTo(s.lon, s.lat, s.name)">{{ s.name }}</a><span v-if="s.seat" class="dim"> (seat)</span></td><td class="dim">{{ cap(s.tier) }}{{ s.walls ? ', walled' : '' }}{{ s.coastal ? ', port' : '' }}</td><td class="num">{{ n(s.pop) }}</td></tr>
        </table>
      </section>

      <!-- Economy -->
      <section v-else-if="tab === 'economy'">
        <p>A {{ d.economy.word }} realm, {{ d.economy.rank }} of {{ d.economy.of }} by wealth, with a revenue of about {{ n(d.economy.revenue) }} {{ d.economy.coin }} a year.</p>
        <h3>Known for</h3>
        <p class="chips"><span v-for="g in d.economy.special" :key="g" class="chip gold">{{ g }}</span></p>
        <h3>Exports</h3>
        <p class="chips"><span v-for="g in d.economy.exports" :key="g" class="chip">{{ g }}</span><span v-if="!d.economy.exports.length" class="dim">Little to spare.</span></p>
        <h3>Imports</h3>
        <p class="chips"><span v-for="g in d.economy.imports" :key="g" class="chip">{{ g }}</span><span v-if="!d.economy.imports.length" class="dim">Wants for little.</span></p>
        <template v-if="d.economy.partners.length">
          <h3>Trading partners</h3>
          <ul class="links">
            <li v-for="p in d.economy.partners" :key="p.id"><a href="#" @click.prevent="go(p.id)"><img :src="arms(p.id, 16)" alt="" />{{ cap(p.name) }}</a>
              <div class="dim"><template v-if="p.buys.length">buys {{ p.buys.join(', ') }} from it</template><template v-if="p.buys.length && p.sells.length">; </template><template v-if="p.sells.length">sells it {{ p.sells.join(', ') }}</template></div>
            </li>
          </ul>
        </template>
        <h3>Armies and fleets</h3>
        <dl class="facts">
          <div><dt>Levies</dt><dd>{{ n(d.military.levy) }}<template v-if="d.military.horse">, {{ n(d.military.horse) }} of them mounted</template></dd></div>
          <div><dt>Standing troops</dt><dd>{{ n(d.military.standing) }}</dd></div>
          <div v-if="d.military.ships"><dt>Ships of war</dt><dd>{{ n(d.military.ships) }}</dd></div>
          <div><dt>Walled towns</dt><dd>{{ d.military.fortresses }}</dd></div>
          <div><dt>Way of war</dt><dd>{{ cap(d.military.style) }}</dd></div>
          <div v-if="d.military.order"><dt>Knightly order</dt><dd>{{ cap(d.military.order) }}</dd></div>
        </dl>
      </section>

      <!-- Faith -->
      <section v-else-if="tab === 'faith'">
        <div class="card">
          <h3>{{ cap(d.faith.faith.name) }}</h3>
          <p class="dim">{{ cap(d.faith.faith.kind) }} · its faithful call themselves {{ d.faith.faith.adherents }} · symbol: {{ d.faith.faith.symbol }}</p>
          <p v-if="d.faith.faith.sects.length > 1">The realm keeps <em>{{ d.faith.sect.name }}</em><template v-if="d.faith.sect.id > 0">, which {{ d.faith.sect.note }} (from {{ d.faith.sect.originName }}, {{ d.faith.sect.founded }})</template>.</p>
          <p>The realm is {{ d.faith.tolerance }}.</p>
        </div>
        <h3>{{ d.faith.faith.deities.length > 2 ? 'Gods and holy figures' : 'Holy figures' }}</h3>
        <ul class="plain"><li v-for="g in d.faith.faith.deities" :key="g.name"><em>{{ cap(g.name) }}</em>, {{ g.domain }}</li></ul>
        <h3>Teachings</h3>
        <ul class="plain"><li v-for="t in d.faith.faith.tenets" :key="t">{{ t }}</li></ul>
        <h3>Church and clergy</h3>
        <p>Led by the {{ d.faith.faith.head.title }}<template v-if="d.faith.faith.head.seatName"> at {{ d.faith.faith.head.seatName }}</template>. Served by {{ d.faith.faith.clergy }}, in {{ d.faith.faith.temple }}. Its lore is kept in {{ d.faith.faith.scripture }}.</p>
        <template v-if="d.faith.faith.holySites.length">
          <h3>Holy places</h3>
          <ul class="plain"><li v-for="h in d.faith.faith.holySites" :key="h.name"><a href="#" @click.prevent="flyTo(h.lon, h.lat, h.name)">{{ h.name }}</a>, {{ h.what }}</li></ul>
        </template>
        <template v-if="d.faith.faith.sects.length > 1">
          <h3>Branches of the faith</h3>
          <ul class="plain"><li v-for="s in d.faith.faith.sects" :key="s.id">{{ cap(s.name === 'the orthodox faith' ? d.faith.faith.name : s.name) }} <span class="dim">({{ s.id === 0 ? 'the mother faith' : `${s.note}, ${s.founded}` }}{{ s.originName ? `; from ${s.originName}` : '' }})</span></li></ul>
        </template>
      </section>

      <!-- Chronicle -->
      <section v-else-if="tab === 'chronicle'">
        <ol class="chron">
          <li v-for="(e, k) in d.chronicle" :key="k" :class="e.kind"><span class="yr">{{ e.year }}</span><span class="mark" :title="e.kind">{{ KIND_MARK[e.kind] }}</span><span class="txt">{{ cap(e.text) }}.</span></li>
        </ol>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.realm {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(520px, 46vw);
  z-index: 15;
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
.big {
  width: 64px;
  flex: none;
}
.title {
  flex: 1;
  min-width: 0;
}
.crumbs {
  font-size: 12.5px;
  opacity: 0.8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.crumbs img {
  width: 11px;
  vertical-align: -2px;
  margin-right: 3px;
}
.sep {
  margin: 0 5px;
}
h2 {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: normal;
  font-style: italic;
  line-height: 1.15;
}
.title p {
  margin: 3px 0 0;
  font-size: 13px;
  opacity: 0.75;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: stretch;
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
h3 a {
  color: inherit;
  text-decoration: none;
}
.card h3 {
  margin-top: 2px;
  border: none;
  font-size: 18px;
}
h4 {
  margin: 0 0 4px;
  font-weight: normal;
  font-style: italic;
  font-size: 15.5px;
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
.gov,
.dim,
.note {
  opacity: 0.75;
}
.note {
  font-style: italic;
}
.facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 14px;
  margin: 10px 0;
}
.facts div {
  min-width: 0;
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
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  margin: 2px 0;
}
.bar .lbl {
  width: 40%;
  flex: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.track {
  flex: 1;
  height: 9px;
  background: rgba(43, 36, 32, 0.1);
  border-radius: 2px;
  overflow: hidden;
}
.track span {
  display: block;
  height: 100%;
  background: #8a5a3c;
}
.track.faith span {
  background: #5b5a8a;
}
.bar .v {
  width: 42px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.blazon {
  margin-top: 12px;
  font-size: 13.5px;
}
.card {
  border: 1px solid rgba(43, 36, 32, 0.3);
  border-radius: 6px;
  padding: 8px 12px;
  margin: 6px 0;
  background: rgba(255, 255, 255, 0.25);
}
.card.war {
  border-color: #a33a2a;
  background: rgba(163, 58, 42, 0.07);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.chip {
  border: 1px solid rgba(43, 36, 32, 0.35);
  border-radius: 10px;
  padding: 1px 9px;
  font-size: 13px;
}
.chip.gold {
  border-color: #a07a2a;
  background: rgba(196, 150, 50, 0.15);
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
ul li {
  margin: 3px 0;
}
ul.links.ally a {
  color: #2a4f8a;
}
ul.links.rival a {
  color: #a0521c;
}
table {
  border-collapse: collapse;
  width: 100%;
}
td {
  padding: 3px 6px 3px 0;
  vertical-align: top;
  border-bottom: 1px solid rgba(43, 36, 32, 0.1);
}
td.yr {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  width: 84px;
}
td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.vrow {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(43, 36, 32, 0.1);
}
.vrow img {
  width: 22px;
  flex: none;
}
.tog {
  width: 22px;
  min-width: 22px;
  padding: 0;
  border: none;
  background: none;
  display: inline-block;
}
.vtext {
  min-width: 0;
}
.unrest {
  color: #a0521c;
  font-size: 13px;
}
.chron {
  list-style: none;
  padding: 0;
  margin: 0;
}
.chron li {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(43, 36, 32, 0.08);
}
.chron .yr {
  width: 42px;
  flex: none;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}
.chron .mark {
  width: 18px;
  flex: none;
  text-align: center;
}
.chron .war .mark,
.chron .disaster .mark {
  color: #a33a2a;
}
.chron .peace .mark,
.chron .alliance .mark {
  color: #2a4f8a;
}
.chron .wonder .mark {
  color: #7a4a9a;
}
@media (max-width: 768px) {
  .realm {
    top: auto;
    left: 0;
    width: auto;
    height: 72vh;
    border-left: none;
    border-top: 1px solid #2b2420;
    border-radius: 12px 12px 0 0;
    box-shadow: 0 -4px 18px rgba(0, 0, 0, 0.25);
  }
  .big {
    width: 46px;
  }
  h2 {
    font-size: 18px;
  }
  .crumbs {
    display: none;
  }
  button {
    min-height: 44px;
  }
  .actions {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  header {
    flex-wrap: wrap;
  }
  .facts {
    grid-template-columns: 1fr;
  }
  .tog {
    min-height: 32px;
    width: 32px;
  }
}
</style>
