<script setup lang="ts">
import { computed, ref } from 'vue';
import { store } from '../store';
import { FANTASY, keySymbol, type KeySymbol } from '../render/fantasy';
import { specialSwatch } from '../render/tiles';
import { SP } from '../gen/special';
import { KIND_NAME, type DungeonKind } from '../dungeons/core';
import { VILLAGE_ZOOM } from '../towns/manager';
import { LAIR_ZOOM, lairIcons, specialIcons } from './map-style';
import { DEEP_GLOW, DEEP_RGB, REALM_RGB, TUNNEL_STYLE } from './under-style';
import { DEEP_LABEL, type DeepKind } from '../gen/underworld';

/**
 * The map key: a button under the zoom controls that opens a list of the symbols the map is showing,
 * grouped and drawn as the map draws them. Entries hidden at the present zoom are faded, with the
 * zoom they show from.
 */
type Draw =
  | { t: 'sym'; k: KeySymbol }
  | { t: 'ground'; sp: number }
  | { t: 'icon'; id: string }
  | { t: 'paint'; f: (g: CanvasRenderingContext2D) => void };
interface Item { id: string; label: string; draw: Draw; z?: [number, number]; note?: string }
interface Section { title: string; items: Item[] }

const open = ref(false);
const W = 34, H = 24, PR = 2;
const INK = '#3f3126', PAPER = '#f4ecd8', BORDER_INK = '#7c2c20';

let icons: Map<string, ImageData> | null = null;
function iconData(id: string): ImageData | undefined {
  icons ??= new Map([...lairIcons(), ...specialIcons()].map((i) => [i.id, i.image]));
  return icons.get(id);
}

const dot = (fill: string, r: number, stroke = PAPER, sw = 0.8) => (g: CanvasRenderingContext2D) => {
  g.beginPath();
  g.arc(W / 2, H / 2, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = sw;
  g.strokeStyle = stroke;
  g.stroke();
};
const line = (color: string, width: number, dash: number[] = [], wash?: [string, number], blur = 0) => (g: CanvasRenderingContext2D) => {
  g.lineCap = dash.length ? 'butt' : 'round';
  if (wash) {
    g.strokeStyle = wash[0];
    g.lineWidth = wash[1];
    g.beginPath();
    g.moveTo(2, H / 2 + 3);
    g.bezierCurveTo(12, H / 2 - 6, 22, H / 2 + 8, W - 2, H / 2 - 3);
    g.stroke();
  }
  if (blur) g.filter = `blur(${blur}px)`;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.setLineDash(dash.map((d) => d * width));
  g.beginPath();
  g.moveTo(2, H / 2 + 3);
  g.bezierCurveTo(12, H / 2 - 6, 22, H / 2 + 8, W - 2, H / 2 - 3);
  g.stroke();
  g.setLineDash([]);
  g.filter = 'none';
};
const cliffLine = (g: CanvasRenderingContext2D) => {
  const tick = iconData('cliff-ticks');
  if (!tick) return;
  const c = document.createElement('canvas');
  c.width = tick.width;
  c.height = tick.height;
  c.getContext('2d')!.putImageData(tick, 0, 0);
  for (let x = 2; x < W - 2; x += 6) g.drawImage(c, 0, 0, tick.width / 2, tick.height, x, H / 2 - 4, 6, 10);
};

const fantasy = computed(() => store.layer === 'fantasy');
const groundLayer = computed(() => (store.layer === 'fantasy' || store.layer === 'terrain' || store.layer === 'biomes' ? store.layer : null));

/** A cavern of the Underworld: a glowing shape in its kind's colour. */
const cave = (kind: DeepKind) => (g: CanvasRenderingContext2D) => {
  g.beginPath();
  for (let k = 0; k <= 24; k++) {
    const a = (k / 24) * Math.PI * 2, r = 7 + 1.6 * Math.sin(3 * a + 1) + Math.sin(5 * a);
    const x = W / 2 + Math.cos(a) * r * 1.5, y = H / 2 + Math.sin(a) * r * 0.85;
    k ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
  g.shadowColor = DEEP_GLOW[kind];
  g.shadowBlur = 6;
  g.fillStyle = DEEP_RGB[kind];
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = DEEP_GLOW[kind];
  g.lineWidth = 0.8;
  g.stroke();
};

const sections = computed<Section[]>(() => {
  const out: Section[] = [];
  const races = store.params.races !== false;
  if (store.layer === 'underworld') {
    const kinds = (tier: 0 | 1): DeepKind[] => (tier ? ['sea', 'rift', 'ruins', 'fungal', 'abyss'] : ['cavern', 'fungal', 'lake', 'hall', 'chasm']);
    out.push(
      { title: 'The upper deep', items: kinds(0).map((k) => ({ id: `u0${k}`, label: DEEP_LABEL[k], draw: { t: 'paint', f: cave(k) } }) as Item) },
      { title: 'The lower deep', items: kinds(1).map((k) => ({ id: `u1${k}`, label: DEEP_LABEL[k], draw: { t: 'paint', f: cave(k) } }) as Item) },
      {
        title: 'Ways through the deep',
        items: [
          { id: 'uw-road', label: TUNNEL_STYLE.road.label, draw: { t: 'paint', f: (g) => { line('#15110e', 4.4)(g); line(TUNNEL_STYLE.road.color, 2.4)(g); } }, note: 'from the delves and between the dwarven halls' },
          { id: 'uw-tun', label: TUNNEL_STYLE.upper.label, draw: { t: 'paint', f: line(TUNNEL_STYLE.upper.color, 2, [3, 1.6]) } },
          { id: 'uw-tun1', label: TUNNEL_STYLE.lower.label, draw: { t: 'paint', f: line(TUNNEL_STYLE.lower.color, 2, [2, 1]) } },
          { id: 'uw-shaft', label: TUNNEL_STYLE.shaft.label, draw: { t: 'paint', f: (g) => { line(TUNNEL_STYLE.shaft.color, 1.2, [1, 1.6])(g); for (const x of [3, W - 3]) { g.beginPath(); g.arc(x, x < W / 2 ? H / 2 + 3 : H / 2 - 3, 3, 0, Math.PI * 2); g.fillStyle = '#15110e'; g.fill(); g.strokeStyle = TUNNEL_STYLE.shaft.color; g.lineWidth = 1.3; g.stroke(); } } } },
          { id: 'uw-in', label: 'Way in from the surface', draw: { t: 'paint', f: dot('#f4ecd8', 4, '#e0a040', 2) }, note: 'a delve, a lava tube or a sinkhole' },
        ],
      },
      {
        title: 'Peoples and realms of the deep',
        items: [
          { id: 'uw-cap', label: 'Capital of a realm', draw: { t: 'paint', f: dot('#f4ecd8', 5, REALM_RGB[1], 3) }, note: 'click a city for its map' },
          { id: 'uw-city', label: 'City, warren, ring or hold', draw: { t: 'paint', f: dot('#f4ecd8', 3.6, REALM_RGB[2], 2) } },
          { id: 'uw-realm', label: 'A realm\u2019s caverns and tunnels', draw: { t: 'paint', f: (g) => { line(REALM_RGB[3], 8, [], undefined, 2)(g); } }, note: 'each realm in its own colour; click its name' },
          { id: 'uw-horror', label: 'Lair of a nameless horror', draw: { t: 'paint', f: dot('#1a0a0e', 4.5, '#c0304a', 2) }, note: 'in the lowest deep' },
        ],
      },
    );
    return out;
  }
  if (store.showSettlements) {
    const vil = (kind: string, label: string, fill: string, big = false, stroke = PAPER, sw = 0.8): Item =>
      ({ id: `v-${kind}`, label, draw: { t: 'paint', f: dot(fill, big ? 3.4 : 2.6, stroke, sw) }, z: [VILLAGE_ZOOM, 13.3] });
    out.push({
      title: 'Settlements and roads',
      items: [
        { id: 'city', label: 'City', draw: { t: 'paint', f: (g) => { dot(PAPER, 5.5, INK, 1.6)(g); dot(INK, 2.1, INK, 0)(g); } }, z: [0, 12.6], note: 'its plan from zoom 12' },
        { id: 'town', label: 'Town', draw: { t: 'paint', f: dot(PAPER, 4, INK, 1.2) }, z: [4.5, 12.6], note: 'its plan from zoom 12' },
        vil('farming', 'Farming village', INK),
        vil('fishing', 'Fishing village', '#3b6276'),
        vil('logging', 'Logging village', '#4f6b39'),
        vil('mining', 'Mining village', '#6e6a64'),
        vil('tribal', 'Tribal village', '#8a5a3a'),
        vil('keep', 'Keep', '#9b3b2e', true),
        vil('monastery', 'Monastery', PAPER, true, INK, 1.2),
        vil('shrine', 'Shrine', '#c9a227', true),
        vil('camp', 'War camp', '#b0402c', true),
        { id: 'road-major', label: 'Major road', draw: { t: 'paint', f: line('#6b4f36', 2.2) }, z: [2.5, 24] },
        { id: 'road-minor', label: 'Minor road or track', draw: { t: 'paint', f: line('#6b4f36', 1.3) }, z: [5, 24] },
      ],
    });
  }
  if (store.showRivers) {
    out.push({ title: 'Water', items: [{ id: 'river', label: 'River', draw: { t: 'paint', f: line(fantasy.value ? '#3f6f8f' : '#2f6e9e', 1.8) }, note: 'broader with more water' }] });
  }
  if (store.showBorders) {
    out.push({
      title: 'Borders',
      items: [
        { id: 'b4', label: 'Empire', draw: { t: 'paint', f: line(BORDER_INK, 2.2, [5, 1.5, 1, 1.5], ['rgba(160,52,36,0.2)', 9]) } },
        { id: 'b3', label: 'Kingdom', draw: { t: 'paint', f: line(BORDER_INK, 1.8, [4, 2], ['rgba(160,52,36,0.2)', 7]) } },
        { id: 'b2', label: 'Duchy', draw: { t: 'paint', f: line(BORDER_INK, 1.2, [3, 2.5]) }, z: [3.8, 24] },
        { id: 'b1', label: 'County', draw: { t: 'paint', f: line(BORDER_INK, 0.9, [2, 2]) }, z: [5.8, 12.5] },
        { id: 'b0', label: 'Barony', draw: { t: 'paint', f: line(BORDER_INK, 0.7, [1, 2]) }, z: [8, 13] },
        { id: 'b5', label: 'League or confederacy', draw: { t: 'paint', f: line('#2f5560', 1.5, [6, 3], ['rgba(47,85,96,0.22)', 8]) } },
      ],
    });
  }
  if (fantasy.value) {
    const sym = (k: KeySymbol, label: string, z: [number, number], note?: string): Item => ({ id: k, label, draw: { t: 'sym', k }, z, note });
    out.push({
      title: 'Land',
      items: [
        sym('mountain', 'Mountains', [0, FANTASY.maxIconZoom], 'larger for higher ground'),
        sym('snowMountain', 'Snow-capped mountains', [0, FANTASY.maxIconZoom]),
        sym('hill', 'Hills', [0, FANTASY.maxIconZoom]),
        sym('forest', 'Broadleaf forest', [0, FANTASY.maxTreeZoom]),
        sym('conifer', 'Conifer forest', [0, FANTASY.maxTreeZoom]),
        sym('marsh', 'Marsh', [0, FANTASY.maxTreeZoom]),
        ...(races ? [sym('mushroom', 'Giant mushrooms', [0, FANTASY.maxTreeZoom]), sym('deadTree', 'Dead trees', [0, FANTASY.maxTreeZoom], 'in cursed lands')] : []),
        sym('volcano2', 'Active volcano', [0, FANTASY.maxTreeZoom], 'smoking, with lava'),
        sym('volcano1', 'Dormant volcano', [0, FANTASY.maxTreeZoom], 'a thin plume'),
        sym('volcano0', 'Extinct volcano', [0, FANTASY.maxTreeZoom]),
      ],
    });
  }
  if (groundLayer.value) {
    const gr = (sp: number, label: string, note?: string): Item => ({ id: `sp${sp}`, label, draw: { t: 'ground', sp }, note });
    const items: Item[] = [
      gr(SP.ash, 'Ash land', 'downwind of active volcanoes'),
      gr(SP.lava, 'Lava field'),
      gr(SP.volcanic, 'Volcanic ground'),
      gr(SP.geothermal, 'Geothermal field'),
      gr(SP.glacier, 'Glacier'),
      ...(races ? [gr(SP.fungal, 'Mushroom forest'), gr(SP.cursed, 'Cursed land', 'blighted woods and mires')] : []),
      gr(SP.canyon, 'Canyon walls'),
    ];
    if (store.showLabels) {
      items.push(
        { id: 'geyser', label: 'Geysers', draw: { t: 'icon', id: 'poi-geyser' }, z: [5.6, 13] },
        { id: 'pool', label: 'Rainbow pools', draw: { t: 'icon', id: 'poi-pool' }, z: [5.6, 13], note: 'hot, mineral-coloured springs' },
        ...(races ? [{ id: 'sink', label: 'Sinkhole', draw: { t: 'icon', id: 'poi-sinkhole' }, z: [6.2, 13], note: 'a way down to the Underworld' } as Item] : []),
        { id: 'canyon', label: 'Canyon', draw: { t: 'paint', f: line('rgba(142,74,38,0.55)', 5, [], undefined, 1.5) }, z: [3.6, 12] },
        { id: 'cliffs', label: 'Cliffs or escarpment', draw: { t: 'paint', f: cliffLine }, z: [4.4, 12.5], note: 'ticks on the lower side' },
      );
    }
    out.push({ title: 'Special ground and features', items });
  }
  if (store.showSettlements) {
    const dun = (k: DungeonKind, z: [number, number]): Item => ({ id: `d-${k}`, label: KIND_NAME[k], draw: { t: 'icon', id: `dun-${k}` }, z });
    out.push({
      title: 'Caves and dungeons',
      items: [
        { id: 'cave', label: 'Cave', draw: { t: 'icon', id: 'lair-cave' }, z: [LAIR_ZOOM, 24] },
        { id: 'glade', label: 'Glade', draw: { t: 'icon', id: 'lair-glade' }, z: [LAIR_ZOOM, 24] },
        ...(races ? [
          { id: 'glade-f', label: 'Mushroom grove', draw: { t: 'icon', id: 'lair-glade-fungal' }, z: [LAIR_ZOOM, 24] } as Item,
          { id: 'glade-c', label: 'Cursed grove', draw: { t: 'icon', id: 'lair-glade-cursed' }, z: [LAIR_ZOOM, 24] } as Item,
        ] : []),
        { id: 'pass', label: 'Mountain pass', draw: { t: 'icon', id: 'lair-pass' }, z: [LAIR_ZOOM, 24], note: 'where a road crosses a range' },
        { id: 'abandoned', label: 'Abandoned village', draw: { t: 'icon', id: 'dun-abandoned' }, z: [LAIR_ZOOM, 24] },
        dun('mine', [LAIR_ZOOM, 24]), dun('tower', [LAIR_ZOOM, 24]), dun('crypt', [LAIR_ZOOM, 24]), dun('ruin', [LAIR_ZOOM, 24]),
        dun('catacomb', [13.6, 24]), dun('sewer', [13.6, 24]), dun('delve', [13.6, 24]), dun('well', [13.6, 24]),
      ],
    });
  }
  if (store.showFaiths) {
    out.push({
      title: 'Faith map',
      items: [
        { id: 'holy-major', label: 'Great holy place', draw: { t: 'paint', f: dot('#c9a227', 5.5, '#2b2420', 1.2) }, z: [1.5, 24], note: 'in the faith’s colour' },
        { id: 'holy', label: 'Holy place', draw: { t: 'paint', f: dot('#c9a227', 3.6, '#2b2420', 1.2) }, z: [1.5, 24] },
      ],
    });
  }
  return out;
});

const hidden = (it: Item) => !!it.z && (store.zoom < it.z[0] || store.zoom > it.z[1]);
const zoomNote = (it: Item) => {
  if (!it.z || !hidden(it)) return '';
  return store.zoom < it.z[0] ? `from zoom ${Math.ceil(it.z[0] * 10) / 10}` : `to zoom ${Math.floor(it.z[1] * 10) / 10}`;
};

/** Draws one entry's swatch (once per canvas and layer). */
function paint(el: unknown, it: Item): void {
  if (!(el instanceof HTMLCanvasElement)) return;
  const key = `${it.id}:${store.layer}`;
  if (el.dataset.k === key) return;
  el.dataset.k = key;
  const g = el.getContext('2d')!;
  const d = it.draw;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, el.width, el.height);
  if (d.t === 'sym') {
    g.putImageData(new ImageData(keySymbol(d.k, W * PR, H * PR, PR) as ImageDataArray, W * PR, H * PR), 0, 0);
    return;
  }
  if (d.t === 'ground') {
    // The textures run at the map's own scale, so the swatch is painted at 1:1 and then doubled.
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    c.getContext('2d')!.putImageData(new ImageData(specialSwatch(d.sp, W, H, groundLayer.value ?? 'fantasy') as ImageDataArray, W, H), 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(c, 0, 0, W * PR, H * PR);
    return;
  }
  g.fillStyle = store.layer === 'fantasy' ? '#e6dbb5' : store.layer === 'underworld' ? '#2b2622' : '#ece4cf';
  g.fillRect(0, 0, el.width, el.height);
  g.scale(PR, PR);
  if (d.t === 'icon') {
    const img = iconData(d.id);
    if (!img) return;
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d')!.putImageData(img, 0, 0);
    const s = Math.min((H - 2) / (img.height / 2), (W - 2) / (img.width / 2), 1);
    const w = (img.width / 2) * s, h = (img.height / 2) * s;
    g.drawImage(c, (W - w) / 2, (H - h) / 2, w, h);
  } else {
    d.f(g);
  }
}
</script>

<template>
  <div class="mapkey">
    <button class="toggle" :aria-expanded="open" :title="open ? 'Hide the map key' : 'Show what the map symbols mean'" @click="open = !open">
      Map key {{ open ? '▾' : '▸' }}
    </button>
    <div v-if="open" class="panel">
      <section v-for="s in sections" :key="s.title">
        <h4>{{ s.title }}</h4>
        <ul>
          <li v-for="it in s.items" :key="it.id" :class="{ off: hidden(it) }">
            <canvas :ref="(el) => paint(el, it)" :width="W * PR" :height="H * PR" class="sw" />
            <span class="lbl">{{ it.label }}<span v-if="zoomNote(it) || it.note" class="note">{{ zoomNote(it) || it.note }}</span></span>
          </li>
        </ul>
      </section>
      <p v-if="!sections.length" class="empty">This layer draws no map symbols. Turn on settlements, borders or rivers to see their key.</p>
    </div>
  </div>
</template>

<style scoped>
.mapkey {
  position: absolute;
  right: 10px;
  top: 146px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  font-family: 'IM Fell English', Georgia, serif;
  color: #2b2420;
}
.toggle {
  font: inherit;
  font-style: italic;
  font-size: 14.5px;
  padding: 3px 10px;
  background: rgba(243, 234, 211, 0.95);
  color: inherit;
  border: 1px solid #2b2420;
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}
.panel {
  width: 250px;
  /* Clear of the hover readout in the bottom-right corner. */
  max-height: max(200px, calc(100vh - 450px));
  overflow-y: auto;
  padding: 4px 10px 8px;
  background: rgba(243, 234, 211, 0.96);
  border: 1px solid #2b2420;
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  font-size: 13.5px;
}
h4 {
  margin: 8px 0 3px;
  font-size: 12px;
  font-weight: normal;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.75;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 1px 0;
}
li.off {
  opacity: 0.45;
}
.sw {
  flex: none;
  width: 34px;
  height: 24px;
  border: 1px solid rgba(43, 36, 32, 0.35);
  border-radius: 3px;
}
.lbl {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.note {
  font-size: 11.5px;
  font-style: italic;
  opacity: 0.7;
}
.empty {
  margin: 6px 0 0;
  font-size: 12.5px;
  font-style: italic;
}
@media (max-width: 700px) {
  .panel {
    width: min(250px, calc(100vw - 32px));
  }
}
</style>
