import type { ExpressionSpecification, FilterSpecification, LayerSpecification } from 'maplibre-gl';

/**
 * Map lettering in the manner of an engraved atlas (IM Fell English): roman for places, italic
 * for water, small capitals for regions and realms. Fonts are bundled TTFs rendered by MapLibre
 * through the style's `font-faces`, so nothing is fetched from a server.
 */
export const ROMAN = 'IM Fell Roman', ITALIC = 'IM Fell Italic', CAPS = 'IM Fell SC';

export function fontFaces(base: string): Record<string, { url: string }[]> {
  const url = (f: string) => new URL(`fonts/${f}`, base).href;
  return {
    [ROMAN]: [{ url: url('IMFellEnglish-Regular.ttf') }],
    [ITALIC]: [{ url: url('IMFellEnglish-Italic.ttf') }],
    [CAPS]: [{ url: url('IMFellEnglishSC-Regular.ttf') }],
  };
}

const INK = '#3f3126';
const WATER_INK = '#35566a';
const HALO = 'rgba(241,233,208,0.85)';
/** Land, settlement and plan lettering sits on busier ground than water names: larger, on a firmer halo. */
const LAND_HALO = 'rgba(244,237,214,0.94)';
const LAND_SCALE = 1.2;
const e = (x: unknown) => x as ExpressionSpecification;

interface Spec {
  id: string;
  source: string;
  filter: unknown[];
  z: [number, number];
  size: [number, number];
  font: string;
  color?: string;
  spacing?: number;
  /** 'line' labels follow their LineString (long axes, rivers, roads, straits). */
  line?: 'center' | 'repeat';
  upper?: boolean;
  opacity?: number;
  sortKey?: number;
  anchor?: 'center' | 'top';
  offset?: [number, number];
  halo?: number;
  maxWidth?: number;
}

export type LabelMode = 'native' | 'english' | 'both';

/**
 * Lettering for a label in a mode: the local name (`name`), its English (`en`, where a feature
 * has one), or both (the English smaller beneath, or after it in brackets along a line).
 */
export function textField(mode: LabelMode, upper: boolean, line: boolean): ExpressionSpecification {
  const up = (x: unknown) => (upper ? ['upcase', x] : x);
  const nm = up(['get', 'name']);
  const en = up(['coalesce', ['get', 'en'], ['get', 'name']]);
  if (mode === 'native') return e(nm);
  if (mode === 'english') return e(en);
  return e(['case', ['all', ['has', 'en'], ['!=', ['get', 'en'], ['get', 'name']]],
    ['format', nm, {}, line ? '  (' : '\n', {}, en, { 'font-scale': 0.8 }, line ? ')' : '', {}],
    nm]);
}

const kindIs = (...k: string[]) => ['in', ['get', 'kind'], ['literal', k]];
const rankIn = (...r: number[]) => ['in', ['get', 'rank'], ['literal', r]];
const isLine = ['==', ['geometry-type'], 'LineString'];
const isPoint = ['==', ['geometry-type'], 'Point'];
/** Water anchors carry the whole-zoom band they belong to (filters see the integer tile zoom). */
const inBand = ['all', ['>=', ['zoom'], ['coalesce', ['get', 'zlo'], 0]], ['<', ['zoom'], ['coalesce', ['get', 'zhi'], 99]]];

function layer(s: Spec): LayerSpecification {
  const [z0, z1] = s.z;
  const water = s.color === WATER_INK;
  const k = water ? 1 : LAND_SCALE;
  // Faint lettering (realms, plains) is kept faint, but not too faint to read.
  const alpha = water ? (s.opacity ?? 1) : Math.min(1, (s.opacity ?? 1) + 0.12);
  const fade = Math.min(0.5, (z1 - z0) / 4);
  return {
    id: s.id,
    type: 'symbol',
    source: s.source,
    minzoom: z0,
    maxzoom: z1,
    filter: e(['all', ...s.filter]) as unknown as FilterSpecification,
    layout: {
      'text-field': textField('native', !!s.upper, !!s.line),
      'text-font': [s.font],
      'text-size': e(['interpolate', ['linear'], ['zoom'], z0, s.size[0] * k, z1, s.size[1] * k]),
      'text-letter-spacing': s.spacing ?? 0.05,
      'text-max-width': s.maxWidth ?? 9,
      'symbol-placement': s.line === 'repeat' ? 'line' : s.line === 'center' ? 'line-center' : 'point',
      ...(s.line === 'repeat' ? { 'symbol-spacing': 420 } : {}),
      ...(s.line ? { 'text-max-angle': 32, 'text-keep-upright': true, 'text-rotation-alignment': 'map', 'text-pitch-alignment': 'viewport' } : {}),
      'text-anchor': s.anchor ?? 'center',
      ...(s.offset ? { 'text-offset': s.offset } : {}),
      'text-padding': 3,
      ...(s.sortKey !== undefined ? { 'symbol-sort-key': s.sortKey } : {}),
    },
    paint: {
      'text-color': s.color ?? INK,
      'text-halo-color': water ? HALO : LAND_HALO,
      'text-halo-width': (s.halo ?? 1.3) + (water ? 0 : 0.7),
      'text-halo-blur': water ? 0.6 : 0.35,
      'text-opacity': e(['interpolate', ['linear'], ['zoom'], z0, 0, z0 + fade, alpha, z1 - fade, alpha, z1, 0]),
    },
  };
}

/** Adds a small icon (an image the map registers) above a point label. */
function withIcon(l: LayerSpecification, image: string): LayerSpecification {
  const ly = (l as { layout: Record<string, unknown> }).layout;
  ly['icon-image'] = image;
  ly['icon-size'] = e(['interpolate', ['linear'], ['zoom'], 5.6, 0.6, 10, 0.9]);
  ly['icon-anchor'] = 'bottom';
  ly['text-anchor'] = 'top';
  ly['text-offset'] = [0, 0.15];
  ly['text-optional'] = true;
  const pt = (l as { paint: Record<string, unknown> }).paint;
  pt['icon-opacity'] = pt['text-opacity'];
  return l;
}

/** Canyons (a rust wash along the river) and cliffs (a line with ticks on its face), drawn from the `labels` source under the lettering. */
export const SPECIAL_LINE_LAYERS: LayerSpecification[] = [
  {
    id: 'sp-canyon', type: 'line', source: 'labels', minzoom: 3.6, filter: ['all', ['==', ['get', 'kind'], 'canyon'], ['==', ['geometry-type'], 'LineString']] as unknown as FilterSpecification,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#8e4a26', 'line-width': e(['interpolate', ['linear'], ['zoom'], 3.6, 2, 6, 6, 9, 12]), 'line-blur': e(['interpolate', ['linear'], ['zoom'], 3.6, 1, 9, 5]), 'line-opacity': e(['interpolate', ['linear'], ['zoom'], 3.6, 0, 4.4, 0.5, 10, 0.4, 12, 0]) },
  },
  {
    id: 'sp-cliffs', type: 'line', source: 'labels', minzoom: 4.4, filter: ['all', ['==', ['get', 'kind'], 'cliffs'], ['==', ['geometry-type'], 'LineString']] as unknown as FilterSpecification,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-pattern': 'cliff-ticks', 'line-width': e(['interpolate', ['linear'], ['zoom'], 4.4, 4, 9, 8]), 'line-opacity': e(['interpolate', ['linear'], ['zoom'], 4.4, 0, 5, 0.75, 11, 0.6, 12.5, 0]) },
  },
];

/** Adds the realm's arms (image `arms-<unit>`, registered by the map) above a label. */
function withArms(l: LayerSpecification): LayerSpecification {
  const ly = (l as { layout: Record<string, unknown> }).layout;
  // Only labels flagged `arms` have an image registered (empires, kingdoms, leagues, independent realms).
  ly['icon-image'] = e(['case', ['to-boolean', ['get', 'arms']], ['concat', 'arms-', ['to-string', ['get', 'unit']]], '']);
  ly['icon-size'] = e(['interpolate', ['linear'], ['zoom'], 1.5, 0.5, 6, 0.85]);
  ly['icon-anchor'] = 'bottom';
  ly['text-anchor'] = 'top';
  ly['text-offset'] = [0, 0.15];
  ly['icon-optional'] = true;
  const pt = (l as { paint: Record<string, unknown> }).paint;
  pt['icon-opacity'] = pt['text-opacity'];
  return l;
}

/** Political map: independent realms lettered large, with large arms (`parms-<unit>`), and leagues. */
function withBigArms(l: LayerSpecification): LayerSpecification {
  const ly = (l as { layout: Record<string, unknown> }).layout;
  ly['icon-image'] = e(['concat', 'parms-', ['to-string', ['get', 'unit']]]);
  ly['icon-size'] = e(['interpolate', ['linear'], ['zoom'], 1.2, ['match', ['get', 'rank'], 0, 0.75, 1, 0.65, 0.5], 6, ['match', ['get', 'rank'], 0, 1.1, 1, 1, 0.9]]);
  ly['icon-anchor'] = 'bottom';
  ly['text-anchor'] = 'top';
  ly['text-offset'] = [0, 0.2];
  ly['icon-optional'] = false;
  ly['text-optional'] = true;
  // Larger realms first, and larger type for them.
  ly['symbol-sort-key'] = e(['get', 'rank']);
  const k = ['match', ['get', 'rank'], 0, 1.35, 1, 1.15, 2, 1, 0.85];
  ly['text-size'] = e(['interpolate', ['linear'], ['zoom'], 1.2, ['*', 11, k], 7.5, ['*', 22, k]]);
  const pt = (l as { paint: Record<string, unknown> }).paint;
  pt['icon-opacity'] = pt['text-opacity'];
  pt['text-halo-width'] = 2;
  return l;
}
export const POLITICAL_LABEL_LAYERS: LayerSpecification[] = [
  withBigArms(layer({ id: 'pol-realm', source: 'labels', filter: [['==', ['get', 'top'], 1], ['!=', ['get', 'kind'], 'league']], z: [1.2, 7.6], size: [11, 22], font: CAPS, color: '#3b2418', spacing: 0.35, opacity: 0.95, sortKey: 0, maxWidth: 12 })),
  withBigArms(layer({ id: 'pol-league', source: 'labels', filter: [kindIs('league')], z: [1.6, 7], size: [11, 19], font: ITALIC, color: '#1f4650', spacing: 0.3, opacity: 0.95, sortKey: 0, maxWidth: 14 })),
];

/** World labels from the `labels` source, plus rivers, roads and settlements. Order = draw order (last on top). */
export const WORLD_LABEL_LAYERS: LayerSpecification[] = [
  // Realms: faint red small capitals behind everything else.
  // Realms, from the political map: empires and kingdoms carry their arms above the name.
  withArms(layer({ id: 'lbl-empire', source: 'labels', filter: [kindIs('empire')], z: [1.4, 4.8], size: [12, 20], font: CAPS, color: '#6e2a1e', spacing: 0.5, opacity: 0.8, sortKey: 48, maxWidth: 14 })),
  withArms(layer({ id: 'lbl-realm', source: 'labels', filter: [kindIs('realm')], z: [2.9, 6.8], size: [11, 18], font: CAPS, color: '#7a3d2a', spacing: 0.45, opacity: 0.7, sortKey: 50, maxWidth: 12 })),
  withArms(layer({ id: 'lbl-league', source: 'labels', filter: [kindIs('league')], z: [2.6, 6.4], size: [11, 16], font: ITALIC, color: '#2f5560', spacing: 0.35, opacity: 0.75, sortKey: 49, maxWidth: 14 })),
  withArms(layer({ id: 'lbl-duchy', source: 'labels', filter: [kindIs('duchy')], z: [5.2, 8.6], size: [10, 14], font: CAPS, color: '#7a3d2a', spacing: 0.3, opacity: 0.65, sortKey: 52, maxWidth: 10 })),
  layer({ id: 'lbl-county', source: 'labels', filter: [kindIs('county')], z: [7.2, 10.4], size: [10, 13], font: ITALIC, color: '#7a3d2a', spacing: 0.1, opacity: 0.6, sortKey: 54, maxWidth: 10 }),
  layer({ id: 'lbl-barony', source: 'labels', filter: [kindIs('barony')], z: [9.4, 12.4], size: [10, 12.5], font: ITALIC, color: '#7a3d2a', spacing: 0.05, opacity: 0.55, sortKey: 56, maxWidth: 9 }),
  layer({ id: 'lbl-continent', source: 'labels', filter: [kindIs('continent'), isPoint], z: [0.5, 3.3], size: [18, 32], font: CAPS, color: '#5b4632', spacing: 0.6, opacity: 0.85, upper: true }),
  layer({ id: 'lbl-continent-l', source: 'labels', filter: [kindIs('continent'), isLine], z: [0.5, 3.3], size: [18, 32], font: CAPS, color: '#5b4632', spacing: 0.6, opacity: 0.85, upper: true, line: 'center' }),
  // Water. Each body keeps its main label until it fills the screen, then a lattice of anchors (one
  // set per whole zoom band, selected by `inBand`) letters it, so a lake or bay stays named while it is on screen.
  layer({ id: 'lbl-ocean', source: 'labels', filter: [kindIs('ocean'), inBand], z: [1, 8], size: [15, 24], font: ITALIC, color: WATER_INK, spacing: 0.35, sortKey: 1 }),
  layer({ id: 'lbl-sea', source: 'labels', filter: [kindIs('sea'), isPoint, inBand], z: [2.4, 10], size: [12, 19], font: ITALIC, color: WATER_INK, spacing: 0.2, sortKey: 2 }),
  layer({ id: 'lbl-sea-l', source: 'labels', filter: [kindIs('sea', 'inlandSea'), isLine, inBand], z: [2.6, 10], size: [12, 20], font: ITALIC, color: WATER_INK, spacing: 0.2, line: 'center', sortKey: 2 }),
  layer({ id: 'lbl-inlandsea', source: 'labels', filter: [kindIs('inlandSea'), isPoint, inBand], z: [3, 11], size: [12, 18], font: ITALIC, color: WATER_INK, spacing: 0.15, sortKey: 3 }),
  layer({ id: 'lbl-gulf', source: 'labels', filter: [kindIs('gulf'), inBand], z: [3.2, 11], size: [12, 17], font: ITALIC, color: WATER_INK, spacing: 0.12, sortKey: 4 }),
  layer({ id: 'lbl-bay', source: 'labels', filter: [kindIs('bay', 'bight'), isPoint, inBand], z: [4.4, 12], size: [11, 15], font: ITALIC, color: WATER_INK, spacing: 0.08, sortKey: 6 }),
  layer({ id: 'lbl-strait', source: 'labels', filter: [kindIs('strait', 'channel'), isLine, inBand], z: [4, 12], size: [11, 15], font: ITALIC, color: WATER_INK, spacing: 0.1, line: 'center', sortKey: 6 }),
  layer({ id: 'lbl-strait-p', source: 'labels', filter: [kindIs('strait', 'channel'), isPoint, inBand], z: [4, 12], size: [11, 15], font: ITALIC, color: WATER_INK, spacing: 0.1, sortKey: 6 }),
  layer({ id: 'lbl-lake-big', source: 'labels', filter: [kindIs('lake'), rankIn(0, 1, 2), inBand], z: [4.5, 13], size: [11, 15], font: ITALIC, color: WATER_INK, sortKey: 7 }),
  layer({ id: 'lbl-lake', source: 'labels', filter: [kindIs('lake'), rankIn(3), inBand], z: [6.3, 13], size: [10, 14], font: ITALIC, color: WATER_INK, sortKey: 9 }),
  // Rivers: italic lettering repeated along the course, the largest first.
  layer({ id: 'lbl-river-6', source: 'rivers', filter: [['has', 'name'], ['>=', ['get', 'order'], 6]], z: [3.6, 12.2], size: [10, 14], font: ITALIC, color: WATER_INK, line: 'repeat', spacing: 0.12, sortKey: 8 }),
  layer({ id: 'lbl-river-4', source: 'rivers', filter: [['has', 'name'], ['>=', ['get', 'order'], 4], ['<', ['get', 'order'], 6]], z: [5, 12.2], size: [10, 13.5], font: ITALIC, color: WATER_INK, line: 'repeat', spacing: 0.1, sortKey: 10 }),
  layer({ id: 'lbl-river-2', source: 'rivers', filter: [['has', 'name'], ['<', ['get', 'order'], 4]], z: [6.6, 12.2], size: [10, 13], font: ITALIC, color: WATER_INK, line: 'repeat', spacing: 0.08, sortKey: 12 }),
  // Land regions.
  layer({ id: 'lbl-desert', source: 'labels', filter: [kindIs('desert', 'plains'), isPoint], z: [3.4, 8.8], size: [11, 17], font: CAPS, color: '#694d2f', spacing: 0.45, opacity: 0.85, sortKey: 20 }),
  layer({ id: 'lbl-desert-l', source: 'labels', filter: [kindIs('desert', 'plains'), isLine], z: [3.4, 8.8], size: [11, 17], font: CAPS, color: '#694d2f', spacing: 0.45, opacity: 0.85, line: 'center', sortKey: 20 }),
  layer({ id: 'lbl-mtn', source: 'labels', filter: [kindIs('mountains'), isPoint], z: [3.6, 9.6], size: [11, 16], font: CAPS, color: '#5a4632', spacing: 0.35, sortKey: 14 }),
  layer({ id: 'lbl-mtn-l', source: 'labels', filter: [kindIs('mountains'), isLine], z: [3.6, 9.6], size: [11, 16], font: CAPS, color: '#5a4632', spacing: 0.35, line: 'center', sortKey: 14 }),
  layer({ id: 'lbl-hills', source: 'labels', filter: [kindIs('hills'), isPoint], z: [4.8, 10.2], size: [10, 14], font: CAPS, color: '#5b452e', spacing: 0.3, sortKey: 18 }),
  layer({ id: 'lbl-hills-l', source: 'labels', filter: [kindIs('hills'), isLine], z: [4.8, 10.2], size: [10, 14], font: CAPS, color: '#5b452e', spacing: 0.3, line: 'center', sortKey: 18 }),
  layer({ id: 'lbl-forest', source: 'labels', filter: [kindIs('forest'), isPoint], z: [4.4, 10.2], size: [10, 15], font: CAPS, color: '#3e4f27', spacing: 0.3, sortKey: 16 }),
  layer({ id: 'lbl-forest-l', source: 'labels', filter: [kindIs('forest'), isLine], z: [4.4, 10.2], size: [10, 15], font: CAPS, color: '#3e4f27', spacing: 0.3, line: 'center', sortKey: 16 }),
  layer({ id: 'lbl-marsh', source: 'labels', filter: [kindIs('marsh'), isPoint], z: [5.2, 10.6], size: [10, 14], font: ITALIC, color: '#4a6150', spacing: 0.12, sortKey: 19 }),
  layer({ id: 'lbl-marsh-l', source: 'labels', filter: [kindIs('marsh'), isLine], z: [5.2, 10.6], size: [10, 14], font: ITALIC, color: '#4a6150', spacing: 0.12, line: 'center', sortKey: 19 }),
  layer({ id: 'lbl-peak', source: 'labels', filter: [kindIs('peak')], z: [6.2, 12.5], size: [10, 12.5], font: ITALIC, color: '#4f3d2c', sortKey: 22, maxWidth: 7 }),
  // Special features (gen/special.ts): volcanoes (their icons are drawn in the tiles), ash lands,
  // mushroom forests and glaciers, canyons and cliffs along their lines, geysers and pools with icons.
  layer({ id: 'lbl-volcano', source: 'labels', filter: [kindIs('volcano')], z: [4.2, 12.5], size: [10, 12.5], font: ITALIC, color: '#6b2a17', sortKey: 21, maxWidth: 8, anchor: 'top', offset: [0, 0.4] }),
  layer({ id: 'lbl-ashland', source: 'labels', filter: [kindIs('ashland')], z: [4.4, 10], size: [10, 15], font: CAPS, color: '#3e3934', spacing: 0.35, sortKey: 17 }),
  layer({ id: 'lbl-fungal', source: 'labels', filter: [kindIs('fungalForest')], z: [4.6, 10.5], size: [10, 15], font: CAPS, color: '#5d3a6e', spacing: 0.3, sortKey: 16 }),
  layer({ id: 'lbl-cursed', source: 'labels', filter: [kindIs('cursedWood', 'cursedMire')], z: [4.8, 11], size: [10, 15], font: CAPS, color: '#3f4330', spacing: 0.3, sortKey: 16 }),
  layer({ id: 'lbl-glacier', source: 'labels', filter: [kindIs('glacier')], z: [4.8, 11], size: [10, 13.5], font: ITALIC, color: '#3e6178', sortKey: 19, maxWidth: 8 }),
  layer({ id: 'lbl-canyon', source: 'labels', filter: [kindIs('canyon'), isLine], z: [4.8, 12], size: [10, 14], font: CAPS, color: '#7c3a1c', spacing: 0.25, line: 'repeat', sortKey: 18 }),
  layer({ id: 'lbl-cliffs', source: 'labels', filter: [kindIs('cliffs'), isLine], z: [5.2, 12], size: [10, 13], font: ITALIC, color: '#4d3a2b', line: 'repeat', sortKey: 20 }),
  withIcon(layer({ id: 'lbl-geysers', source: 'labels', filter: [kindIs('geysers')], z: [5.6, 13], size: [10, 12.5], font: ITALIC, color: '#2f5468', sortKey: 23, maxWidth: 8 }), 'poi-geyser'),
  withIcon(layer({ id: 'lbl-hotlake', source: 'labels', filter: [kindIs('hotLake')], z: [5.6, 13], size: [10, 12.5], font: ITALIC, color: '#6a4a1f', sortKey: 23, maxWidth: 8 }), 'poi-pool'),
  // Islands.
  layer({ id: 'lbl-island-big', source: 'labels', filter: [kindIs('island'), rankIn(0, 1)], z: [3, 10.2], size: [11, 16], font: ROMAN, spacing: 0.1, sortKey: 13 }),
  layer({ id: 'lbl-island', source: 'labels', filter: [kindIs('island'), rankIn(2, 3)], z: [5, 11.2], size: [10, 14], font: ROMAN, sortKey: 21 }),
  layer({ id: 'lbl-isles', source: 'labels', filter: [kindIs('isles')], z: [4, 9.5], size: [11, 15], font: ITALIC, spacing: 0.15, sortKey: 15 }),
  // Roads.
  layer({ id: 'lbl-road', source: 'roads', filter: [['has', 'name']], z: [8.2, 12.6], size: [10, 12], font: ITALIC, color: '#5d4630', line: 'repeat', sortKey: 30 }),
];

/** Settlement names: cities and towns from the `sites` source, villages from `regional`. */
export const SETTLEMENT_LABEL_LAYERS: LayerSpecification[] = [
  layer({ id: 'lbl-city', source: 'sites', filter: [['==', ['get', 'tier'], 'city']], z: [2.6, 13.2], size: [11, 18], font: CAPS, spacing: 0.08, anchor: 'top', offset: [0, 0.75], sortKey: 0, halo: 1.6 }),
  layer({ id: 'lbl-town', source: 'sites', filter: [['==', ['get', 'tier'], 'town']], z: [5.6, 13.2], size: [10, 15], font: ROMAN, anchor: 'top', offset: [0, 0.7], sortKey: 5, halo: 1.5 }),
  layer({ id: 'lbl-lair', source: 'regional', filter: [isPoint, ['==', ['get', 'tier'], 'lair']], z: [10.4, 18], size: [10, 13], font: ITALIC, color: '#4f3d2c', anchor: 'top', offset: [0, 1.1], sortKey: 28, halo: 1.5 }),
  layer({ id: 'lbl-dentry', source: 'plans', filter: [isPoint, ['==', ['get', 'kind'], 'dentry']], z: [15.2, 19], size: [10, 13], font: ITALIC, color: '#4f3d2c', anchor: 'top', offset: [0, 1.1], sortKey: 27, halo: 1.5 }),
  layer({ id: 'lbl-village', source: 'regional', filter: [isPoint, ['has', 'name'], ['==', ['get', 'tier'], 'village']], z: [9.2, 13.6], size: [10, 13], font: ITALIC, anchor: 'top', offset: [0, 0.6], sortKey: 25, halo: 1.5 }),
];

/** Town-plan lettering: quarters, districts, streets and notable buildings (kinds in the `plans` source). */
export const PLAN_LABEL_LAYERS: LayerSpecification[] = [
  layer({ id: 'lbl-quarter', source: 'plans', filter: [kindIs('qlabel')], z: [13.2, 15.9], size: [12, 17], font: CAPS, color: '#5b4030', spacing: 0.35, sortKey: 1, upper: true, maxWidth: 8 }),
  layer({ id: 'lbl-district', source: 'plans', filter: [kindIs('dlabel')], z: [15, 17.8], size: [11, 15], font: ITALIC, color: '#4a3826', spacing: 0.08, sortKey: 2, maxWidth: 8 }),
  layer({ id: 'lbl-street', source: 'plans', filter: [kindIs('street', 'road'), ['has', 'name']], z: [15.6, 20.5], size: [11, 16], font: ITALIC, color: '#5d4630', line: 'repeat', sortKey: 3 }),
  layer({ id: 'lbl-building', source: 'plans', filter: [kindIs('blabel')], z: [17, 20.5], size: [11, 17], font: ITALIC, color: '#3a2a1c', sortKey: 4, maxWidth: 7, halo: 1.6 }),
];
