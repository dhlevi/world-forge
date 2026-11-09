import { type Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { Arms } from '@worldforge/core/heraldry/arms';
import { armsImage } from '../heraldry/draw';

/**
 * Title cartouches for illustrated town plans, as old bird's-eye maps letter their towns: the
 * name in a blackletter hand on a framed scroll, its first letter a red initial, with the town's
 * arms above and a vine trailing either side. Each stands over the north edge of its plan and
 * grows and shrinks with the map, as if drawn on it.
 */
export interface CartoucheSite {
  id: string;
  name: string;
  /** The name in the other lettering, shown small beneath (or none). */
  alt?: string;
  lon: number;
  lat: number;
  /** Metres from the centre to the north edge of the plan. */
  northM: number;
  arms: Arms | null;
  /** Villages get a smaller scroll. */
  small: boolean;
}

/** Zoom at which a cartouche is drawn at its natural size. */
const BASE_ZOOM = 15.5;

const VINE = (flip: boolean) => `
<svg class="ct-vine" viewBox="0 0 120 70" width="120" height="70" aria-hidden="true" style="${flip ? 'transform:scaleX(-1)' : ''}">
  <path d="M118 40 C 96 40, 88 22, 70 26 C 54 30, 58 50, 42 50 C 28 50, 26 34, 14 36 C 6 37, 4 46, 10 48" fill="none" stroke="#5c4a2e" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M70 26 C 66 14, 76 8, 82 12" fill="none" stroke="#5c4a2e" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M42 50 C 40 60, 50 64, 54 58" fill="none" stroke="#5c4a2e" stroke-width="1.6" stroke-linecap="round"/>
  <g fill="#6f8a45" stroke="#3f5232" stroke-width="1">
    <path d="M96 36 c 4 -10, 14 -10, 16 -4 c -4 2, -10 8, -16 4 z"/>
    <path d="M82 12 c 8 -6, 16 0, 14 6 c -6 0, -12 0, -14 -6 z"/>
    <path d="M58 40 c -2 -10, 6 -16, 12 -12 c -2 6, -6 12, -12 12 z"/>
    <path d="M54 58 c 8 -2, 14 6, 10 10 c -6 -2, -10 -4, -10 -10 z"/>
    <path d="M26 38 c -2 -9, 6 -14, 11 -10 c -2 5, -5 10, -11 10 z"/>
    <path d="M10 48 c -8 2, -10 10, -4 12 c 2 -4, 6 -8, 4 -12 z"/>
  </g>
  <g fill="#b9b04a" stroke="#6f6a2a" stroke-width="0.8">
    <circle cx="74" cy="34" r="2.6"/><circle cx="78" cy="37" r="2.4"/><circle cx="73" cy="39" r="2.4"/>
    <circle cx="34" cy="44" r="2.4"/><circle cx="38" cy="47" r="2.2"/>
  </g>
</svg>`;

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function element(s: CartoucheSite): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ct-anchor';
  const first = [...s.name][0] ?? '';
  const rest = s.name.slice(first.length);
  const arms = s.arms ? `<img class="ct-arms" src="${armsImage(s.arms, 44, `ct${s.id}`)}" alt="" width="44" />` : '';
  el.innerHTML = `
<div class="ct${s.small ? ' ct-small' : ''}">
  ${arms}
  <div class="ct-row">
    ${VINE(false)}
    <div class="ct-scroll">
      <span class="ct-curl ct-curl-l"></span>
      <div class="ct-name"><span class="ct-initial">${escape(first)}</span>${escape(rest)}</div>
      ${s.alt ? `<div class="ct-alt">${escape(s.alt)}</div>` : ''}
      <span class="ct-curl ct-curl-r"></span>
    </div>
    ${VINE(true)}
  </div>
</div>`;
  return el;
}

/** The cartouches on a map: one per settlement given, kept until it leaves the list. */
export class Cartouches {
  private markers = new Map<string, { m: Marker; key: string }>();
  private shown = false;

  constructor(private map: MapLibreMap) {
    map.on('zoom', () => this.scale());
  }

  /** Shows these sites' cartouches (none hides them all). */
  set(sites: CartoucheSite[]): void {
    const keep = new Set<string>();
    for (const s of sites) {
      const key = `${s.name}|${s.alt ?? ''}|${s.arms ? 1 : 0}`;
      keep.add(s.id);
      const had = this.markers.get(s.id);
      if (had && had.key === key) continue;
      had?.m.remove();
      const lat = s.lat + s.northM / 110540;
      const m = new Marker({ element: element(s), anchor: 'bottom' }).setLngLat([s.lon, lat]).addTo(this.map);
      this.markers.set(s.id, { m, key });
    }
    for (const [id, v] of this.markers) {
      if (keep.has(id)) continue;
      v.m.remove();
      this.markers.delete(id);
    }
    this.shown = sites.length > 0;
    this.scale();
  }

  /** Scales every cartouche with the map's zoom, as if it were drawn on the map. */
  private scale(): void {
    if (!this.shown) return;
    const z = this.map.getZoom();
    const k = Math.min(1.7, Math.max(0.42, 2 ** (z - BASE_ZOOM)));
    for (const { m } of this.markers.values()) {
      const inner = m.getElement().firstElementChild as HTMLElement | null;
      if (inner) inner.style.transform = `scale(${k.toFixed(3)})`;
    }
  }

  clear(): void {
    this.set([]);
  }
}
