<script setup lang="ts">
import { computed, ref } from 'vue';
import { store, world } from '../store';
import { LEVEL_NAME, type PolUnit } from '../gen/politics';
import { type Arms, blazon, vassalArms } from '../heraldry/arms';
import { armsImage } from '../heraldry/draw';
import { LAYOUT_LABEL } from '../towns/layout';
import { CULTURES } from '../names/cultures';
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
}

const WATER = new Set(['ocean', 'sea', 'inlandSea', 'gulf', 'bay', 'bight', 'strait', 'channel', 'lake']);
const VILLAGE: Record<string, string> = { farming: 'Village', fishing: 'Fishing village', logging: 'Logging camp', mining: 'Mining camp', keep: 'Keep', monastery: 'Monastery' };
const townArms = new Map<string, Arms>();

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
  const cu = w.politics.countyOf[at(w.politics.W, w.politics.H)];
  const chain: PolUnit[] = [];
  for (let u: PolUnit | null = cu >= 0 ? units[cu] : null; u; u = u.parent >= 0 ? units[u.parent] : null) chain.push(u);
  const region = w.regionOf[c] >= 0 ? w.labels.features[w.regionOf[c]]?.properties.name : undefined;

  if (height[c] <= 0 && cu < 0) {
    // At sea: the nearest named water (within reach).
    let best: { name: string; d: number; kind: string } | null = null;
    for (const f of w.labels.features) {
      const p = f.properties;
      if (!WATER.has(p.kind) || p.zlo || f.geometry.type !== 'Point') continue;
      const [x, y] = f.geometry.coordinates;
      const d = km(lon, lat, x, y);
      const reach = p.kind === 'ocean' ? 3500 : p.kind === 'sea' ? 1300 : 500;
      if (d < reach && (!best || d < best.d)) best = { name: p.name, d, kind: p.kind };
    }
    if (!best) return null;
    return { name: cap(best.name), sub: '', arms: null, armsKey: '', crumbs: [], chain: [] };
  }
  if (!chain.length) {
    return { name: region ? cap(region) : 'Unclaimed wilds', sub: region ? 'Unclaimed land' : 'No realm holds this land', arms: null, armsKey: '', crumbs: [], chain: [] };
  }

  // The settlement under the centre, at close zoom.
  if (store.zoom >= 11) {
    const county = chain[0];
    for (const s of w.settlements) {
      if (s.tier === 'village' || km(lon, lat, s.lon, s.lat) * 1000 > s.radiusM * 1.1) continue;
      let a = townArms.get(s.id);
      if (!a) {
        a = vassalArms(mulberry32(s.seed ^ 0x7a11), county.arms, CULTURES[county.culture]?.id ?? 'anglo');
        if (s.id === county.seat) a = county.arms;
        townArms.set(s.id, a);
      }
      const kind = s.tier === 'city' ? 'City' : 'Town';
      return {
        name: s.name ?? '', sub: `${kind} of ${s.population.toLocaleString('en')}${s.layout ? ` · ${LAYOUT_LABEL[s.layout]}` : ''}`,
        arms: a, armsKey: `t${s.id}`, crumbs: crumbs(chain, 0), chain,
      };
    }
    if (store.here) {
      return {
        name: store.here.name, sub: `${VILLAGE[store.here.kind] ?? 'Village'} of ${store.here.population.toLocaleString('en')}`,
        arms: null, armsKey: '', crumbs: crumbs(chain, 0), chain,
      };
    }
  }
  // The realm level for this zoom (the highest the chain has, if it stops short).
  const want = store.zoom < 4.3 ? 3 : store.zoom < 6.3 ? 2 : store.zoom < 8.3 ? 1 : 0;
  let k = chain.findIndex((u) => u.level >= want);
  if (k < 0) k = chain.length - 1;
  const u = chain[k];
  const parts = [`${u.ruler} at ${u.seatName}`];
  if (u.level > 0) parts.push(`${u.vassals} ${u.vassals === 1 ? LEVEL_NAME[u.level - 1].toLowerCase() : plural(LEVEL_NAME[u.level - 1])}`);
  if (region && u.level <= 1) parts.push(cap(region));
  return { name: cap(u.name), sub: parts.join(' · '), arms: u.arms, armsKey: `u${u.id}`, crumbs: crumbs(chain, k + 1), chain };
});

function crumbs(chain: PolUnit[], from: number) {
  return chain.slice(from).filter((u, k, a) => !(k > 0 && a[k - 1].seat === u.seat && a[k - 1].name === u.name)).reverse()
    .map((u) => ({ name: cap(u.name), arms: u.arms, key: `u${u.id}`, unit: u }));
}
const plural = (s: string) => (s === 'County' ? 'counties' : s === 'Duchy' ? 'duchies' : `${s.toLowerCase()}s`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const detail = computed(() => (info.value?.chain ?? []).slice().reverse());
</script>

<template>
  <div v-if="info" class="where" :class="{ open }" @click="open = !open">
    <div class="main">
      <img v-if="info.arms" class="arms" :src="armsImage(info.arms, 40, info.armsKey)" :title="blazon(info.arms)" alt="" />
      <div class="text">
        <div v-if="info.crumbs.length" class="crumbs">
          <span v-for="(c, k) in info.crumbs" :key="c.key">
            <img :src="armsImage(c.arms, 14, c.key)" alt="" />{{ c.name }}<span v-if="k < info.crumbs.length - 1" class="sep">›</span>
          </span>
        </div>
        <div class="name">{{ info.name }}</div>
        <div v-if="info.sub" class="sub">{{ info.sub }}</div>
      </div>
    </div>
    <div v-if="open && detail.length" class="detail" @click.stop>
      <div v-for="u in detail" :key="u.id" class="row">
        <img :src="armsImage(u.arms, 44, `u${u.id}`)" alt="" />
        <div>
          <div class="rname">{{ cap(u.name) }}</div>
          <div class="rsub">{{ u.ruler }} at {{ u.seatName }} · {{ Math.round(u.areaKm2).toLocaleString('en') }} km² · {{ u.pop.toLocaleString('en') }} in towns</div>
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
.sub {
  font-size: 12.5px;
  opacity: 0.8;
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
  .name {
    font-size: 17px;
  }
  .sub {
    font-size: 11.5px;
  }
}
</style>
