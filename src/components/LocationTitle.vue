<script setup lang="ts">
import { computed, ref } from 'vue';
import { flyTarget, openLair, openOrder, openRealm, store, world } from '../store';
import { currentOrders } from './orders';
import { HOLD_LABEL } from '../lore/orders';
import { deepSite } from './under-style';
import { LEVEL_NAME, type PolUnit, chainOf } from '../gen/politics';
import { type Arms, blazon, vassalArms } from '../heraldry/arms';
import { armsImage } from '../heraldry/draw';
import { LAYOUT_LABEL } from '../towns/layout';
import { CULTURES } from '../names/cultures';
import { BUNDLE } from '../names/bundles';
import { hashString, mulberry32 } from '../gen/rng';
import { THEME_LABEL, worldThemes } from '../lore/themes';
import { currentLore } from './realm-lore';

/**
 * A cartouche at the top of the map naming where you are, at the scale you are looking at:
 * the empire or kingdom when zoomed out, then the duchy, the county, and finally the town or
 * village under the centre of the map, with the realm's arms and the hierarchy above it.
 * Over the sea it names the sea; in unclaimed land, the wild region.
 */
const open = ref(false);

interface Line {
  name: string;
  sub: string;
  arms: Arms | null;
  armsKey: string;
  crumbs: { name: string; arms: Arms; key: string; unit: PolUnit }[];
  chain: PolUnit[];
  /** The realm named, if any (clicking opens its details). */
  unit?: number;
  /** The name in the other language (English, or the local name when names are shown in English). */
  alt?: string;
  /** For an old name: where it came from. */
  old?: string;
  /** A delve's deep road: the hall below (clicking opens it on the Underworld layer), and its dealings with the realm beside it. */
  deep?: { label: string; node: number };
  /** Organisations seated here or keeping a chapter house here (each opens its window); secret ones are not shown. */
  orders?: { key: string; label: string }[];
}

/** The organisations a city is known for: those seated in it, then its chapter houses. */
function ordersIn(sid: string): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (const o of currentOrders()) {
    if (o.secret) continue;
    if (o.seat.kind === 'city' && o.seat.sid === sid) out.unshift({ key: o.key, label: `seat of ${o.en}` });
    else if (o.chapters.some((c) => c.sid === sid && !c.front)) out.push({ key: o.key, label: o.en });
  }
  return out.slice(0, 5);
}

/** A name and its other form, by the chosen lettering (local names, English, or both). */
function pair(native: string, en?: string): { name: string; alt?: string } {
  if (!en || en === native) return { name: native };
  return store.labelMode === 'english' ? { name: en, alt: native } : { name: native, alt: en };
}

const WATER = new Set(['ocean', 'sea', 'inlandSea', 'gulf', 'bay', 'bight', 'strait', 'channel', 'lake']);
const VILLAGE: Record<string, string> = { farming: 'Village', fishing: 'Fishing village', logging: 'Logging camp', mining: 'Mining camp', keep: 'Keep', monastery: 'Monastery', tribal: 'Tribal village', camp: 'Army camp', shrine: 'Shrine', prison: 'Prison fort', vineyard: 'Vineyard village' };
const townArms = new Map<string, Arms>();

/** "2.3 million", "34,000", "870". */
function people(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} million`;
  if (n >= 1e4) return (Math.round(n / 1000) * 1000).toLocaleString('en');
  return (Math.round(n / 10) * 10).toLocaleString('en');
}

function km(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dl = ((((lon2 - lon1) % 360) + 540) % 360) - 180;
  return Math.hypot(dl * 111.32 * Math.cos((lat1 * Math.PI) / 180), (lat2 - lat1) * 110.57);
}

const info = computed<Line | null>(() => {
  const w = world.value;
  if (!w || store.zoom < 2) return null;
  const [lon, lat] = store.center;
  const { W, H, height } = w.raster;
  const at = (W2: number, H2: number) => {
    const i = ((Math.floor(((lon + 180) / 360) * W2) % W2) + W2) % W2, j = Math.min(H2 - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H2)));
    return j * W2 + i;
  };
  const c = at(W, H);
  const units = w.politics.units;
  const cu = w.politics.baronyOf[at(w.politics.W, w.politics.H)];
  // Barony up to the independent realm, then its league if any.
  const chain: PolUnit[] = chainOf(units, cu);
  const regionP = w.regionOf[c] >= 0 ? w.labels.features[w.regionOf[c]]?.properties : undefined;
  const region = regionP ? pair(regionP.name, regionP.en).name : undefined;

  if (height[c] <= 0 && cu < 0) {
    // At sea: the nearest named water (within reach).
    let best: { name: string; en?: string; old?: string; d: number; kind: string } | null = null;
    for (const f of w.labels.features) {
      const p = f.properties;
      if (!WATER.has(p.kind) || p.zlo || f.geometry.type !== 'Point') continue;
      const [x, y] = f.geometry.coordinates;
      const d = km(lon, lat, x, y);
      const reach = p.kind === 'ocean' ? 3500 : p.kind === 'sea' ? 1300 : 500;
      if (d < reach && (!best || d < best.d)) best = { name: p.name, en: p.en, old: p.old, d, kind: p.kind };
    }
    if (!best) return null;
    const nm = pair(cap(best.name), best.en ? cap(best.en) : undefined);
    return { name: nm.name, alt: nm.alt, old: best.old, sub: '', arms: null, armsKey: '', crumbs: [], chain: [] };
  }
  if (!chain.length) {
    // In the New World, land beyond the towns is the tribes' own.
    if (w.raster.newWorld?.[c]) {
      const people = CULTURES[w.raster.culture[c]]?.name ? `${CULTURES[w.raster.culture[c]].name} peoples` : BUNDLE.get(CULTURES[w.raster.culture[c]]?.id ?? '')?.peoples ?? 'scattered peoples';
      return { name: region ? cap(region) : 'Tribal lands', sub: `Lands of the ${people} · no settled realm`, arms: null, armsKey: '', crumbs: [], chain: [] };
    }
    return { name: region ? cap(region) : 'Unclaimed wilds', sub: region ? 'Unclaimed land' : 'No realm holds this land', arms: null, armsKey: '', crumbs: [], chain: [] };
  }

  // The settlement under the centre, at close zoom.
  const barony = chain[0];
  if (store.zoom >= 11) {
    for (const s of w.settlements) {
      if (s.tier === 'village' || km(lon, lat, s.lon, s.lat) * 1000 > s.radiusM * 1.1) continue;
      let a = townArms.get(s.id);
      if (!a) {
        a = s.id === barony.seat ? barony.arms : vassalArms(mulberry32(s.seed ^ 0x7a11), barony.arms, CULTURES[barony.culture]?.id ?? 'anglo');
        townArms.set(s.id, a);
      }
      const kind = s.tier === 'city' ? 'City' : 'Town';
      // Its theme and holiness, from the lore (built on first need).
      const lore = currentLore();
      const th = lore ? worldThemes(lore, w.raster.seed) : null;
      const theme = th?.themes.get(s.id);
      const holy = th?.holy.get(s.id);
      const seatOf = chain.filter((u) => u.seat === s.id && u.gov !== 'league').pop();
      return {
        ...pair(s.name ?? '', s.nameEn), old: s.nameOld,
        sub: [`${s.kind === 'tribal' ? 'Tribal town' : s.colony ? cap(s.colony === 'post' ? 'trading post' : s.colony) : kind} of ${s.population.toLocaleString('en')}`, s.layout && s.kind !== 'tribal' && !s.delve ? LAYOUT_LABEL[s.layout] : '', s.delve ? 'a delve: its halls lie under the mountain' : '', s.special === 'spa' ? `a spa town by ${s.specialNear ?? 'its hot springs'}` : s.special === 'mining' ? `a mining town by ${s.specialNear ?? 'the fire mountain'}` : s.special === 'ashen' ? `under the ash of ${s.specialNear ?? 'a volcano'}` : '', s.university && theme?.theme !== 'mages' ? 'a university city' : '', s.tower ? (s.tower.college ? `its college of magic, ${s.tower.en}` : `home of ${s.tower.en}`) : '', s.prison ? `its prison, ${s.prison.en}` : '', theme ? `${THEME_LABEL[theme.theme]} (${theme.why})` : '', holy && theme?.theme !== 'pilgrim' ? `holy to ${holy.faith}` : '', seatOf ? `seat of the ${seatOf.title.toLowerCase()}` : ''].filter(Boolean).join(' · '),
        arms: a, armsKey: `t${s.id}`, crumbs: crumbs(chain, 0), chain,
        ...(s.delve && s.deepTo ? { deep: deepLine(s.id, s.deepTo.name, s.deepTies) } : {}),
        orders: ordersIn(s.id),
      };
    }
    if (store.here) {
      // Keeps are baronial holdings, monasteries abbey lands, within the barony they stand in.
      const h = store.here;
      const tie = h.kind === 'keep' ? `a holding of the ${barony.name}` : h.kind === 'monastery' ? `abbey lands in the ${barony.name}` : '';
      // An army camp: whose host, and the war it is fighting.
      if (h.kind === 'shrine') {
        return {
          ...pair(h.name, h.en), sub: ['Shrine', h.what, h.faith ? `holy to ${h.faith}` : ''].filter(Boolean).join(' · '),
          arms: null, armsKey: '', crumbs: crumbs(chain, 0), chain,
        };
      }
      if (h.kind === 'vineyard') {
        return {
          ...pair(h.name, h.en), sub: [`Vineyard village of ${h.population.toLocaleString('en')}`, h.what ? `known for its wine, ${h.what}` : '', tie].filter(Boolean).join(' · '),
          arms: null, armsKey: '', crumbs: crumbs(chain, 0), chain,
        };
      }
      if (h.kind === 'order' && h.order) {
        const o = currentOrders().find((x) => x.key === h.order);
        return {
          ...pair(h.name, h.en), sub: [o?.seat.hold ? HOLD_LABEL[o.seat.hold] : 'Stronghold', o?.seat.where ?? ''].filter(Boolean).join(' · '),
          arms: null, armsKey: '', crumbs: crumbs(chain, 0), chain, ...(o ? { orders: [{ key: o.key, label: `seat of ${o.en}` }] } : {}),
        };
      }
      if (h.kind === 'prison') {
        return {
          ...pair(h.name, h.en), sub: ['Prison fort', h.what, h.realm ? `the prison of the ${h.realm.replace(/^the /, '')}` : '', `a garrison of ${h.population.toLocaleString('en')}`].filter(Boolean).join(' · '),
          arms: null, armsKey: '', crumbs: crumbs(chain, 0), chain,
        };
      }
      if (h.kind === 'abandoned') {
        const why: Record<string, string> = {
          plague: 'emptied by plague', war: 'burned in a war', famine: 'left in a famine', raiders: 'emptied by raiders', flood: 'drowned by a flood',
          ash: 'buried under ash', drought: 'left when its wells ran dry', dragon: 'laid waste by a dragon', curse: `emptied by the curse${h.curse ? ` on ${h.curse}` : ''}`,
        };
        return {
          ...pair(h.name, h.en), sub: ['Abandoned village', h.cause ? why[h.cause] : '', h.ago].filter(Boolean).join(' · '),
          arms: null, armsKey: '', crumbs: crumbs(chain, 0), chain,
        };
      }
      if (h.kind === 'camp') {
        return {
          ...pair(h.name, h.en), sub: [`Army camp of ${h.population.toLocaleString('en')} soldiers`, h.realm ? `the host of the ${h.realm}` : '', h.war].filter(Boolean).join(' · '),
          arms: null, armsKey: '', crumbs: crumbs(chain, 0), chain,
        };
      }
      return {
        ...pair(h.name, h.en), sub: [`${VILLAGE[h.kind] ?? 'Village'} of ${h.population.toLocaleString('en')}`, tie].filter(Boolean).join(' · '),
        arms: null, armsKey: '', crumbs: crumbs(chain, 0), chain,
      };
    }
  }
  // The level for this zoom (the nearest the chain has): empire, kingdom, duchy, county, barony.
  const want = store.zoom < 4.3 ? 4 : store.zoom < 6.3 ? 3 : store.zoom < 8.3 ? 2 : store.zoom < 10 ? 1 : 0;
  const realms = chain.filter((u) => u.gov !== 'league');
  let k = realms.findIndex((u) => u.level >= want);
  if (k < 0) k = realms.length - 1;
  const u = realms[k];
  const parts = [`${u.ruler} at ${u.seatName}`];
  if (u.parent < 0 || u.level >= 3) parts.push(u.title);
  parts.push(`about ${people(u.people)} people`);
  const held = holdings(u);
  if (held) parts.push(held);
  if (region && u.level <= 1) parts.push(cap(region));
  return { name: cap(u.name), sub: parts.join(' · '), arms: u.arms, armsKey: `u${u.id}`, crumbs: crumbs(chain, chain.indexOf(u) + 1), chain, unit: u.id };
});

/** "3 duchies, 2 counties" (the vassals by level), or "5 members" for a league. */
function holdings(u: PolUnit): string {
  const w = world.value;
  if (!w || u.level === 0) return '';
  const kids = w.politics.units.filter((v) => (u.gov === 'league' ? v.league === u.id : v.parent === u.id));
  if (u.gov === 'league') return `${kids.length} members`;
  const by = [0, 0, 0, 0, 0];
  for (const v of kids) by[v.level]++;
  return by.map((n, l) => (n ? `${n} ${n === 1 ? LEVEL_NAME[l].toLowerCase() : plural(LEVEL_NAME[l])}` : '')).filter(Boolean).reverse().join(', ');
}

function crumbs(chain: PolUnit[], from: number) {
  return chain.slice(from).filter((u, k, a) => !(k > 0 && a[k - 1].seat === u.seat && a[k - 1].name === u.name)).reverse()
    .map((u) => ({ name: cap(u.name), arms: u.arms, key: `u${u.id}`, unit: u }));
}
const plural = (s: string) => (s === 'County' ? 'counties' : s === 'Duchy' ? 'duchies' : s === 'Barony' ? 'baronies' : `${s.toLowerCase()}s`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const detail = computed(() => (info.value?.chain ?? []).slice().reverse());

function openUnit(id: number): void {
  openRealm.value = id;
}

/** Clicking the name or arms opens the realm's details (or, for a town, its barony's); the arrow shows the hierarchy. */
function onMain(): void {
  const i = info.value;
  if (!i) return;
  const id = i.unit ?? i.chain[0]?.id;
  if (id !== undefined) openRealm.value = id;
  else open.value = !open.value;
}

const STANCE_TEXT: Record<string, string> = { war: 'at war with', feud: 'in a feud with', truce: 'under a truce with', trade: 'trading with', alliance: 'allied with', raids: 'raided by', peace: 'at peace with' };
/** A delve's deep road line: where it leads, and the realm of the deep it deals with. */
function deepLine(sid: string, hall: string, ties?: { realm: string; stance: string }): { label: string; node: number } | undefined {
  const u = world.value?.raster.underworld;
  const e = u?.entrances.find((x) => x.sid === sid);
  if (!u || !e) return undefined;
  return { label: `Deep road down to ${hall}${ties ? `, ${STANCE_TEXT[ties.stance] ?? 'dealing with'} ${ties.realm}` : ''} ▸`, node: e.node };
}
function goDeep(node: number): void {
  const u = world.value?.raster.underworld;
  if (!u) return;
  store.layer = 'underworld';
  const n = u.nodes[node];
  flyTarget.value = { lon: n.lon, lat: n.lat, zoom: 6.5, name: n.name, t: performance.now() };
  openLair.value = deepSite(u, node);
}
</script>

<template>
  <div v-if="info" class="where" :class="{ open }">
    <div class="main" :title="info.chain.length ? 'Open the realm\'s details' : ''" @click="onMain">
      <img v-if="info.arms" class="arms" :src="armsImage(info.arms, 40, info.armsKey)" :title="blazon(info.arms)" alt="" />
      <div class="text">
        <div v-if="info.crumbs.length" class="crumbs">
          <span v-for="(c, k) in info.crumbs" :key="c.key" class="crumb" @click.stop="openUnit(c.unit.id)">
            <img :src="armsImage(c.arms, 14, c.key)" alt="" />{{ c.name }}<span v-if="k < info.crumbs.length - 1" class="sep">›</span>
          </span>
        </div>
        <div class="name">{{ info.name }}<span v-if="info.alt" class="alt">{{ info.alt }}</span></div>
        <div v-if="info.sub" class="sub">{{ info.sub }}</div>
        <div v-if="info.old" class="sub old">{{ info.old }}</div>
        <div v-if="info.orders?.length" class="sub deep">
          <template v-for="(q, i) in info.orders" :key="q.key"><template v-if="i"> · </template><a href="#" title="Open its window" @click.stop.prevent="openOrder = q.key">{{ q.label }}</a></template>
        </div>
        <div v-if="info.deep" class="sub deep"><a href="#" title="Open the hall below on the Underworld layer" @click.stop.prevent="goDeep(info.deep.node)">{{ info.deep.label }}</a></div>
      </div>
      <button v-if="detail.length" class="more" :title="open ? 'Hide the hierarchy' : 'Show the hierarchy'" @click.stop="open = !open">{{ open ? '▴' : '▾' }}</button>
    </div>
    <div v-if="open && detail.length" class="detail" @click.stop>
      <div v-for="u in detail" :key="u.id" class="row" title="Open the realm's details" @click="openUnit(u.id)">
        <img :src="armsImage(u.arms, 44, `u${u.id}`)" alt="" />
        <div>
          <div class="rname">{{ cap(u.name) }}</div>
          <div class="rsub">{{ u.title }} · {{ u.ruler }} at {{ u.seatName }} · {{ Math.round(u.areaKm2).toLocaleString('en') }} km² · about {{ people(u.people) }} people, {{ u.pop.toLocaleString('en') }} in its towns</div>
          <div v-if="holdings(u)" class="rsub">{{ holdings(u) }}</div>
          <div class="blazon">{{ blazon(u.arms) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.where {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  min-width: 220px;
  max-width: 460px;
  padding: 6px 14px 7px 10px;
  background: rgba(243, 234, 211, 0.95);
  color: #2b2420;
  border: 1px solid #2b2420;
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  font-family: 'IM Fell English', Georgia, serif;
  cursor: pointer;
  user-select: none;
}
.main {
  display: flex;
  align-items: center;
  gap: 10px;
}
.arms {
  width: 40px;
  flex: none;
}
.text {
  min-width: 0;
  flex: 1;
}
.crumb:hover,
.row:hover .rname {
  text-decoration: underline;
}
.row {
  cursor: pointer;
}
.more {
  flex: none;
  align-self: center;
  font: inherit;
  font-size: 14px;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(43, 36, 32, 0.4);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.crumbs {
  font-size: 12px;
  opacity: 0.75;
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
.name {
  font-size: 20px;
  font-style: italic;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.alt {
  margin-left: 8px;
  font-size: 14px;
  font-style: normal;
  opacity: 0.7;
}
.sub {
  font-size: 12.5px;
  opacity: 0.8;
}
.deep a {
  color: #6e2a1e;
}
.old {
  font-style: italic;
}
.detail {
  margin-top: 8px;
  border-top: 1px solid rgba(43, 36, 32, 0.25);
  padding-top: 6px;
  max-height: 60vh;
  overflow-y: auto;
  cursor: default;
}
.row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 5px 0;
}
.row img {
  width: 44px;
  flex: none;
}
.rname {
  font-style: italic;
  font-size: 16px;
}
.rsub,
.blazon {
  font-size: 12px;
  opacity: 0.8;
}
.blazon {
  font-style: italic;
}
/* Clear of the control panel and search box. */
@media (max-width: 1800px) {
  .where {
    /* Centred in the space right of the search box. */
    left: calc(674px + (100% - 674px - 56px) / 2);
    max-width: calc(100% - 674px - 70px);
  }
}
@media (max-width: 1000px) {
  .where {
    top: 58px;
    left: 302px;
    transform: none;
    max-width: 360px;
  }
}
@media (max-width: 768px) {
  .where {
    top: 10px;
    left: 62px;
    right: 56px;
    min-width: 0;
    max-width: none;
    padding: 4px 10px;
  }
  .arms {
    width: 30px;
  }
  .crumbs {
    display: none;
  }
  .more {
    width: 44px;
    height: 44px;
  }
  .name {
    font-size: 17px;
  }
  .sub {
    font-size: 11.5px;
  }
}
</style>
