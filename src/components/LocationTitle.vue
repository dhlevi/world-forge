<script setup lang="ts">
import { computed, ref } from 'vue';
import { openRealm, store, world } from '../store';
import { LEVEL_NAME, type PolUnit, chainOf } from '../gen/politics';
import { type Arms, blazon, vassalArms } from '../heraldry/arms';
import { armsImage } from '../heraldry/draw';
import { LAYOUT_LABEL } from '../towns/layout';
import { CULTURES } from '../names/cultures';
import { BUNDLE } from '../names/bundles';
import { hashString, mulberry32 } from '../gen/rng';

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
}

/** A name and its other form, by the chosen lettering (local names, English, or both). */
function pair(native: string, en?: string): { name: string; alt?: string } {
  if (!en || en === native) return { name: native };
  return store.labelMode === 'english' ? { name: en, alt: native } : { name: native, alt: en };
}

const WATER = new Set(['ocean', 'sea', 'inlandSea', 'gulf', 'bay', 'bight', 'strait', 'channel', 'lake']);
const VILLAGE: Record<string, string> = { farming: 'Village', fishing: 'Fishing village', logging: 'Logging camp', mining: 'Mining camp', keep: 'Keep', monastery: 'Monastery', tribal: 'Tribal village' };
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
      const seatOf = chain.filter((u) => u.seat === s.id && u.gov !== 'league').pop();
      return {
        ...pair(s.name ?? '', s.nameEn), old: s.nameOld,
        sub: [`${s.kind === 'tribal' ? 'Tribal town' : s.colony ? cap(s.colony === 'post' ? 'trading post' : s.colony) : kind} of ${s.population.toLocaleString('en')}`, s.layout && s.kind !== 'tribal' ? LAYOUT_LABEL[s.layout] : '', s.university ? 'a university city' : '', seatOf ? `seat of the ${seatOf.title.toLowerCase()}` : ''].filter(Boolean).join(' · '),
        arms: a, armsKey: `t${s.id}`, crumbs: crumbs(chain, 0), chain,
      };
    }
    if (store.here) {
      // Keeps are baronial holdings, monasteries abbey lands, within the barony they stand in.
      const h = store.here;
      const tie = h.kind === 'keep' ? `a holding of the ${barony.name}` : h.kind === 'monastery' ? `abbey lands in the ${barony.name}` : '';
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
