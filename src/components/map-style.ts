import type { ExpressionSpecification, FilterSpecification, LayerSpecification } from 'maplibre-gl';
import { TOWN_PLAN_ZOOM, VILLAGE_ZOOM } from '../towns/manager';

const INK = '#3f3126';
const PAPER = '#f4ecd8';
const e = (x: unknown) => x as ExpressionSpecification;
const ppm = (metres: unknown) => ['*', metres, ['get', 'ppm20']];

/** Line width: `minPx` at zoom 12, growing into minPx + true width in metres (from `ppm20`) at high zoom. */
const physWidth = (minPx: unknown, metres: unknown) =>
  e(['interpolate', ['exponential', 2], ['zoom'], 12, minPx, 20, ['+', minPx, ppm(metres)]]);

const ROAD_PX = ['match', ['get', 'cls'], 'major', 2.2, 'minor', 1.5, 'street', 1, 1];
const ROAD_M = ['match', ['get', 'cls'], 'major', 7, 'minor', 5, 'street', 6, 3.5];
const roadWidth = (casingPx: number) => e([
  'interpolate', ['exponential', 2], ['zoom'],
  3, ['*', ROAD_PX, 0.35],
  7, ['*', ROAD_PX, 0.7],
  12, ROAD_PX,
  14, ['+', ROAD_PX, casingPx, ['/', ppm(ROAD_M), 64]],
  20, ['+', ROAD_PX, casingPx, ppm(ROAD_M)],
]);
const ROAD_OPACITY = e([
  'interpolate', ['linear'], ['zoom'],
  2.5, ['match', ['get', 'cls'], 'major', 0.85, 0],
  4.5, ['match', ['get', 'cls'], 'major', 0.85, 0],
  5.5, 0.85,
]);
const LINE_LAYOUT = { 'line-cap': 'round', 'line-join': 'round' } as const;
const fadeIn = (z0: number, z1: number) => e(['interpolate', ['linear'], ['zoom'], z0, 0, z1, 1]);
const fadeOut = (z0: number, z1: number) => e(['interpolate', ['linear'], ['zoom'], z0, 1, z1, 0]);
const kind = (...kinds: string[]) => e(['in', ['get', 'kind'], ['literal', kinds]]) as FilterSpecification;

const roadCasing = (id: string, source: string, filter?: FilterSpecification): LayerSpecification => ({
  id: `${id}-casing`, type: 'line', source, layout: LINE_LAYOUT, ...(filter ? { filter } : {}),
  paint: { 'line-color': '#6b4f36', 'line-width': roadWidth(1.6), 'line-opacity': ROAD_OPACITY },
});
const roadFill = (id: string, source: string, filter?: FilterSpecification): LayerSpecification => ({
  id: `${id}-fill`, type: 'line', source, minzoom: 12.5, layout: LINE_LAYOUT, ...(filter ? { filter } : {}),
  paint: { 'line-color': '#f1e7cd', 'line-width': roadWidth(0), 'line-opacity': fadeIn(12.5, 13.5) },
});

const EMPTY = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } as const;

export const SETTLEMENT_SOURCES = { roads: EMPTY, sites: EMPTY, regional: EMPTY, plans: EMPTY };

/** Plan ground cover, drawn under the rivers. */
export const PLAN_GROUND_LAYERS: LayerSpecification[] = [
  {
    // Streets and alleys: cobbles inside the walls, beaten earth in the suburbs.
    id: 'plan-paving', type: 'fill', source: 'plans', minzoom: TOWN_PLAN_ZOOM, filter: kind('paving'),
    paint: {
      'fill-color': e(['match', ['get', 'surface'], 'dirt', '#d9c9a2', '#ddd3bb']),
      'fill-opacity': fadeIn(TOWN_PLAN_ZOOM, 12.3),
    },
  },
  {
    // Block interiors behind the houses: yards and gardens.
    id: 'plan-yards', type: 'fill', source: 'plans', minzoom: TOWN_PLAN_ZOOM, filter: kind('yard'),
    paint: {
      'fill-color': e(['match', ['get', 'surface'], 'garden', '#cfd3a2', '#d3cba6']),
      'fill-outline-color': '#b9ab86',
      'fill-opacity': fadeIn(TOWN_PLAN_ZOOM, 12.3),
    },
  },
  {
    id: 'plan-fields', type: 'fill', source: 'plans', minzoom: TOWN_PLAN_ZOOM, filter: kind('field'),
    paint: {
      'fill-color': e(['interpolate', ['linear'], ['get', 'tone'], 0, '#e2d8aa', 1, '#d0d49d']),
      'fill-outline-color': '#b8a77c',
      'fill-opacity': fadeIn(TOWN_PLAN_ZOOM, 12.3),
    },
  },
  {
    id: 'plan-furrows', type: 'line', source: 'plans', minzoom: 13.5, filter: kind('furrow'),
    paint: { 'line-color': '#c2b385', 'line-width': e(['interpolate', ['linear'], ['zoom'], 13.5, 0.4, 16, 0.8, 19, 1.4]) },
  },
  {
    id: 'plan-green', type: 'fill', source: 'plans', minzoom: TOWN_PLAN_ZOOM, filter: kind('green'),
    paint: { 'fill-color': '#cfd8a4', 'fill-opacity': fadeIn(TOWN_PLAN_ZOOM, 12.3) },
  },
  {
    id: 'plan-graveyard', type: 'fill', source: 'plans', minzoom: TOWN_PLAN_ZOOM, filter: kind('graveyard'),
    paint: { 'fill-color': '#c3c9a0', 'fill-outline-color': '#8d955f', 'fill-opacity': fadeIn(TOWN_PLAN_ZOOM, 12.3) },
  },
  {
    id: 'plan-plaza', type: 'fill', source: 'plans', minzoom: TOWN_PLAN_ZOOM, filter: kind('plaza'),
    paint: { 'fill-color': '#f4ecd9', 'fill-opacity': fadeIn(TOWN_PLAN_ZOOM, 12.3) },
  },
  {
    id: 'plan-garden', type: 'fill', source: 'plans', minzoom: 13, filter: kind('garden'),
    paint: { 'fill-color': '#bcc68a', 'fill-outline-color': '#8d955f', 'fill-opacity': fadeIn(13, 13.6) },
  },
  {
    // Hedgerows: a dotted line of bushes round some fields.
    id: 'plan-hedges', type: 'line', source: 'plans', minzoom: 13, filter: kind('hedge'),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#86a064',
      'line-width': physWidth(0.8, 2.2),
      'line-dasharray': [0.6, 0.9],
      'line-opacity': fadeIn(13, 13.6),
    },
  },
  {
    id: 'plan-spoil', type: 'fill', source: 'plans', minzoom: TOWN_PLAN_ZOOM, filter: kind('spoil'),
    paint: { 'fill-color': '#c0b9a8', 'fill-outline-color': '#6f675a', 'fill-opacity': fadeIn(TOWN_PLAN_ZOOM, 12.3) },
  },
  {
    id: 'plan-ditch', type: 'line', source: 'plans', minzoom: TOWN_PLAN_ZOOM, filter: kind('ditch'), layout: LINE_LAYOUT,
    paint: { 'line-color': '#a29d78', 'line-width': physWidth(1, ['get', 'w']), 'line-opacity': fadeIn(TOWN_PLAN_ZOOM, 12.3) },
  },
  {
    id: 'plan-contours', type: 'line', source: 'plans', minzoom: 12.5, filter: kind('contour'), layout: LINE_LAYOUT,
    paint: {
      'line-color': '#9c8462',
      'line-width': e(['interpolate', ['linear'], ['zoom'], 13, 0.5, 17, 0.9]),
      'line-opacity': e(['interpolate', ['linear'], ['zoom'], 12.5, 0, 13.3, 0.45]),
    },
  },
];

/** Roads, tracks, streets, buildings, walls and trees, drawn above the rivers (so roads cross on bridges). */
export const SETTLEMENT_LAYERS: LayerSpecification[] = [
  roadCasing('roads', 'roads'),
  roadCasing('tracks', 'regional', e(['==', ['geometry-type'], 'LineString']) as FilterSpecification),
  roadCasing('plan-roads', 'plans', kind('road', 'street')),
  roadFill('roads', 'roads'),
  roadFill('tracks', 'regional', e(['==', ['geometry-type'], 'LineString']) as FilterSpecification),
  roadFill('plan-roads', 'plans', kind('road', 'street')),
  {
    id: 'plan-piers', type: 'fill', source: 'plans', minzoom: TOWN_PLAN_ZOOM, filter: kind('pier'),
    paint: { 'fill-color': '#b39167', 'fill-outline-color': INK, 'fill-opacity': fadeIn(TOWN_PLAN_ZOOM, 12.3) },
  },
  {
    id: 'plan-boats', type: 'fill', source: 'plans', minzoom: 12.5, filter: kind('boat'),
    paint: { 'fill-color': '#8d6b47', 'fill-outline-color': INK, 'fill-opacity': fadeIn(12.5, 13.2) },
  },
  {
    id: 'plan-logs', type: 'fill', source: 'plans', minzoom: 13, filter: kind('logs'),
    paint: { 'fill-color': '#a57d52', 'fill-outline-color': INK, 'fill-opacity': fadeIn(13, 13.6) },
  },
  {
    id: 'plan-mine', type: 'fill', source: 'plans', minzoom: 12.5, filter: kind('mine'),
    paint: { 'fill-color': INK, 'fill-opacity': fadeIn(12.5, 13.2) },
  },
  {
    id: 'plan-stumps', type: 'circle', source: 'plans', minzoom: 14, filter: kind('stump'),
    paint: {
      'circle-color': '#b48d5e',
      'circle-radius': physWidth(0.5, ['get', 'r']),
      'circle-stroke-color': INK,
      'circle-stroke-width': 0.4,
      'circle-opacity': fadeIn(14, 14.6),
      'circle-stroke-opacity': fadeIn(14, 14.6),
    },
  },
  {
    id: 'plan-graves', type: 'fill', source: 'plans', minzoom: 14.5, filter: kind('grave'),
    paint: { 'fill-color': '#a8a291', 'fill-outline-color': INK, 'fill-opacity': fadeIn(14.5, 15.2) },
  },
  {
    id: 'plan-buildings', type: 'fill', source: 'plans', minzoom: TOWN_PLAN_ZOOM, filter: kind('building'),
    paint: {
      // Notable buildings are washed a little warmer so they stand out from the terraces.
      'fill-color': e(['case', ['has', 'role'],
        ['match', ['get', 'role'], ['inn', 'tavern'], '#c9a283', ['townhall', 'guildhall', 'library'], '#b8a689', 'barracks', '#b3a38f', '#c6b08e'],
        ['match', ['get', 'use'], 'temple', '#b6a383', 'keep', '#a8957a', 'mill', '#bfa986', '#cdbd9c']]),
      'fill-outline-color': INK,
      'fill-opacity': fadeIn(TOWN_PLAN_ZOOM, 12.3),
    },
  },
  {
    id: 'plan-walls', type: 'line', source: 'plans', minzoom: TOWN_PLAN_ZOOM, filter: kind('wall'), layout: LINE_LAYOUT,
    paint: { 'line-color': INK, 'line-width': physWidth(1.2, ['get', 'w']), 'line-opacity': fadeIn(TOWN_PLAN_ZOOM, 12.3) },
  },
  {
    id: 'plan-towers', type: 'circle', source: 'plans', minzoom: 12.5, filter: kind('tower'),
    paint: { 'circle-color': INK, 'circle-radius': physWidth(1, ['get', 'r']), 'circle-opacity': fadeIn(12.5, 13.3) },
  },
  {
    id: 'plan-trees', type: 'circle', source: 'plans', minzoom: 13, filter: kind('tree'),
    paint: {
      'circle-color': '#97ad72',
      'circle-radius': physWidth(0.8, ['get', 'r']),
      'circle-stroke-color': INK,
      'circle-stroke-width': e(['interpolate', ['linear'], ['zoom'], 13, 0.3, 17, 0.8]),
      'circle-opacity': fadeIn(13, 13.8),
      'circle-stroke-opacity': fadeIn(13, 13.8),
    },
  },
];

/** City, town and village markers; they fade out as the plans fade in. */
export const MARKER_LAYERS: LayerSpecification[] = [
  {
    id: 'village-markers', type: 'circle', source: 'regional', minzoom: VILLAGE_ZOOM, maxzoom: 13.5,
    filter: e(['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'tier'], 'village']]) as FilterSpecification,
    paint: {
      // Colour by kind: fishing blue, logging green, mining grey, keep red, monastery hollow.
      'circle-color': e(['match', ['get', 'kind'],
        'fishing', '#3b6276', 'logging', '#4f6b39', 'mining', '#6e6a64', 'keep', '#9b3b2e', 'monastery', PAPER, 'tribal', '#8a5a3a', INK]),
      'circle-radius': e(['interpolate', ['linear'], ['zoom'],
        8, ['match', ['get', 'kind'], ['keep', 'monastery'], 2, 1.5],
        12, ['match', ['get', 'kind'], ['keep', 'monastery'], 4, 3]]),
      'circle-stroke-color': e(['match', ['get', 'kind'], 'monastery', INK, PAPER]),
      'circle-stroke-width': e(['match', ['get', 'kind'], 'monastery', 1.2, 0.8]),
      'circle-opacity': e(['interpolate', ['linear'], ['zoom'], VILLAGE_ZOOM, 0, 8.2, 1, 12.6, 1, 13.3, 0]),
      'circle-stroke-opacity': e(['interpolate', ['linear'], ['zoom'], VILLAGE_ZOOM, 0, 8.2, 1, 12.6, 1, 13.3, 0]),
    },
  },
  {
    id: 'town-markers', type: 'circle', source: 'sites', minzoom: 4.5, maxzoom: 13,
    filter: e(['==', ['get', 'tier'], 'town']) as FilterSpecification,
    paint: {
      'circle-color': PAPER,
      'circle-radius': e(['interpolate', ['linear'], ['zoom'], 5, 2, 9, 4, 12, 5]),
      'circle-stroke-color': INK,
      'circle-stroke-width': e(['interpolate', ['linear'], ['zoom'], 5, 0.8, 9, 1.3]),
      'circle-opacity': e(['interpolate', ['linear'], ['zoom'], 4.5, 0, 5.2, 1, 11.8, 1, 12.6, 0]),
      'circle-stroke-opacity': e(['interpolate', ['linear'], ['zoom'], 4.5, 0, 5.2, 1, 11.8, 1, 12.6, 0]),
    },
  },
  {
    id: 'city-markers', type: 'circle', source: 'sites', maxzoom: 13,
    filter: e(['==', ['get', 'tier'], 'city']) as FilterSpecification,
    paint: {
      'circle-color': PAPER,
      'circle-radius': e(['interpolate', ['linear'], ['zoom'], 2, 2.5, 6, 4.5, 10, 6.5]),
      'circle-stroke-color': INK,
      'circle-stroke-width': e(['interpolate', ['linear'], ['zoom'], 2, 1, 8, 1.8]),
      'circle-opacity': fadeOut(11.8, 12.6),
      'circle-stroke-opacity': fadeOut(11.8, 12.6),
    },
  },
  {
    id: 'city-dots', type: 'circle', source: 'sites', maxzoom: 13,
    filter: e(['==', ['get', 'tier'], 'city']) as FilterSpecification,
    paint: {
      'circle-color': INK,
      'circle-radius': e(['interpolate', ['linear'], ['zoom'], 2, 0.9, 6, 1.8, 10, 2.6]),
      'circle-opacity': fadeOut(11.8, 12.6),
    },
  },
];

export const RIVER_WIDTH = e([
  'interpolate', ['exponential', 2], ['zoom'],
  2, ['+', 0.4, ['*', 0.15, ['get', 'order']]],
  7, ['+', 1, ['*', 0.6, ['get', 'order']]],
  11, ['+', 2, ['get', 'order']],
  20, ['+', 2, ['get', 'order'], ppm(['get', 'widthM'])],
]);

/** Zoom from which cave and glade icons show. */
export const LAIR_ZOOM = 8.6;

/** Cave and glade icons (symbols drawn by `lairIcons`), from the `regional` source. */
export const LAIR_LAYERS: LayerSpecification[] = [
  {
    id: 'lair-icons', type: 'symbol', source: 'regional', minzoom: LAIR_ZOOM,
    filter: e(['==', ['get', 'tier'], 'lair']) as FilterSpecification,
    layout: {
      'icon-image': e(['match', ['get', 'kind'], 'cave', 'lair-cave', 'glade', 'lair-glade', ['concat', 'dun-', ['get', 'kind']]]),
      'icon-size': e(['interpolate', ['linear'], ['zoom'], LAIR_ZOOM, 0.45, 12, 0.75, 16, 1]),
      'icon-allow-overlap': true,
      'icon-padding': 2,
    },
    // Fainter close in, where the map itself is laid over the ground on hover.
    paint: { 'icon-opacity': e(['interpolate', ['linear'], ['zoom'], LAIR_ZOOM, 0, LAIR_ZOOM + 0.6, 1, 16, 1, 17.5, 0.6]) },
  },
  // Sewer grates and catacomb stairs drawn on town plans.
  {
    id: 'dentry-icons', type: 'symbol', source: 'plans', minzoom: 13.6,
    filter: e(['==', ['get', 'kind'], 'dentry']) as FilterSpecification,
    layout: {
      'icon-image': e(['concat', 'dun-', ['get', 'dkind']]),
      'icon-size': e(['interpolate', ['linear'], ['zoom'], 13.6, 0.5, 16, 0.75, 18, 0.9]),
      'icon-allow-overlap': true,
    },
    paint: { 'icon-opacity': e(['interpolate', ['linear'], ['zoom'], 13.6, 0, 14.2, 1]) },
  },
];

/**
 * Map icons for caves and glades, in the hand-drawn style of the fantasy map: a dark cave
 * mouth under a hatched hillock, and a ring of little trees round a clearing.
 */
export function lairIcons(): { id: string; image: ImageData; pixelRatio: number }[] {
  const pr = 2, S = 30 * pr;
  const make = (draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    g.scale(pr, pr);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    draw(g);
    return g.getImageData(0, 0, S, S);
  };
  const cave = make((g) => {
    // Paper disc so the icon reads over any ground.
    g.fillStyle = 'rgba(244,236,216,0.9)';
    g.beginPath();
    g.arc(15, 16, 13, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(3.5, 23);
    g.quadraticCurveTo(7, 9, 15, 7);
    g.quadraticCurveTo(23, 9, 26.5, 23);
    g.stroke();
    g.lineWidth = 0.9;
    for (const [x, y] of [[7, 15], [9.5, 11.5], [21, 12], [23, 16]]) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 1.6, y + 2.6);
      g.stroke();
    }
    g.fillStyle = '#1f1a16';
    g.beginPath();
    g.moveTo(10, 23);
    g.quadraticCurveTo(10.5, 14.5, 15, 14);
    g.quadraticCurveTo(19.5, 14.5, 20, 23);
    g.closePath();
    g.fill();
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(3, 23);
    g.lineTo(27, 23);
    g.stroke();
  });
  const glade = make((g) => {
    g.fillStyle = 'rgba(244,236,216,0.9)';
    g.beginPath();
    g.arc(15, 15, 13.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e3e5b2';
    g.beginPath();
    g.arc(15, 15, 6, 0, Math.PI * 2);
    g.fill();
    for (let q = 0; q < 7; q++) {
      const a = (q / 7) * Math.PI * 2 - Math.PI / 2;
      const x = 15 + Math.cos(a) * 8.6, y = 15 + Math.sin(a) * 8.6;
      g.fillStyle = q % 2 ? '#6f8a4a' : '#5f7a3c';
      g.strokeStyle = INK;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, 3.6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  });
  const disc = (g: CanvasRenderingContext2D) => {
    g.fillStyle = 'rgba(244,236,216,0.92)';
    g.strokeStyle = INK;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(15, 15, 13.5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.lineWidth = 1.4;
  };
  const tower = make((g) => {
    disc(g);
    g.fillStyle = '#d8cfbd';
    g.beginPath();
    g.moveTo(10, 25);
    g.lineTo(11, 11);
    g.lineTo(19, 11);
    g.lineTo(20, 25);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = INK;
    for (const x of [10, 13.5, 17]) g.fillRect(x, 7.5, 3, 3.5);
    g.fillRect(14, 15, 2, 4);
  });
  const crypt = make((g) => {
    disc(g);
    g.fillStyle = '#d8cfbd';
    g.beginPath();
    g.moveTo(7, 24);
    g.lineTo(7, 14);
    g.lineTo(15, 8);
    g.lineTo(23, 14);
    g.lineTo(23, 24);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#1f1a16';
    g.beginPath();
    g.moveTo(12, 24);
    g.lineTo(12, 18);
    g.arc(15, 18, 3, Math.PI, 0);
    g.lineTo(18, 24);
    g.closePath();
    g.fill();
  });
  const ruin = make((g) => {
    disc(g);
    g.fillStyle = '#d8cfbd';
    g.beginPath();
    g.moveTo(6, 24);
    g.lineTo(6, 12);
    g.lineTo(9, 10);
    g.lineTo(10, 15);
    g.lineTo(13, 13);
    g.lineTo(14, 24);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(17, 24);
    g.lineTo(17, 16);
    g.lineTo(21, 14);
    g.lineTo(24, 17);
    g.lineTo(24, 24);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(4.5, 24);
    g.lineTo(25.5, 24);
    g.stroke();
  });
  const mine = make((g) => {
    disc(g);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(9, 22);
    g.lineTo(21, 10);
    g.moveTo(21, 22);
    g.lineTo(9, 10);
    g.stroke();
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(5.5, 13);
    g.quadraticCurveTo(9, 7, 13, 8);
    g.moveTo(24.5, 13);
    g.quadraticCurveTo(21, 7, 17, 8);
    g.stroke();
  });
  const sewer = make((g) => {
    disc(g);
    g.fillStyle = '#5d554b';
    g.beginPath();
    g.arc(15, 15, 8, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.strokeStyle = '#e8e0cc';
    g.lineWidth = 1.3;
    g.beginPath();
    for (const x of [11, 15, 19]) {
      g.moveTo(x, 9);
      g.lineTo(x, 21);
    }
    g.stroke();
  });
  const catacomb = make((g) => {
    disc(g);
    g.fillStyle = '#efe7d4';
    g.beginPath();
    g.arc(15, 13.5, 6.5, Math.PI, 0);
    g.lineTo(21.5, 17);
    g.lineTo(18.5, 17);
    g.lineTo(18.5, 21);
    g.lineTo(11.5, 21);
    g.lineTo(11.5, 17);
    g.lineTo(8.5, 17);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = INK;
    g.beginPath();
    g.arc(12.3, 14, 1.6, 0, Math.PI * 2);
    g.arc(17.7, 14, 1.6, 0, Math.PI * 2);
    g.fill();
  });
  return [
    { id: 'lair-cave', image: cave, pixelRatio: pr }, { id: 'lair-glade', image: glade, pixelRatio: pr },
    { id: 'dun-tower', image: tower, pixelRatio: pr }, { id: 'dun-crypt', image: crypt, pixelRatio: pr }, { id: 'dun-ruin', image: ruin, pixelRatio: pr },
    { id: 'dun-mine', image: mine, pixelRatio: pr }, { id: 'dun-sewer', image: sewer, pixelRatio: pr }, { id: 'dun-catacomb', image: catacomb, pixelRatio: pr },
  ];
}

/** Political borders (`borders` source): a soft wash along realm borders, then inked lines by level. */
const lvl = (l: number) => e(['==', ['get', 'level'], l]) as FilterSpecification;
const BORDER_INK = '#7c2c20';
export const BORDER_LAYERS: LayerSpecification[] = [
  {
    id: 'border-wash', type: 'line', source: 'borders', filter: e(['all', ['>=', ['get', 'level'], 3], ['<=', ['get', 'level'], 4]]) as FilterSpecification, maxzoom: 10,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': 'rgba(160,52,36,0.2)',
      'line-width': e(['interpolate', ['linear'], ['zoom'], 1.5, ['match', ['get', 'level'], 4, 5, 3.5], 7, ['match', ['get', 'level'], 4, 12, 9]]),
      'line-blur': 2,
      'line-opacity': e(['interpolate', ['linear'], ['zoom'], 8, 1, 10, 0]),
    },
  },
  // Leagues and confederacies: a blue-green wash and a long-dashed line round the union.
  {
    id: 'border-league-wash', type: 'line', source: 'borders', filter: lvl(5), maxzoom: 9,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': 'rgba(47,85,96,0.22)', 'line-width': e(['interpolate', ['linear'], ['zoom'], 1.5, 4, 7, 10]), 'line-blur': 2 },
  },
  {
    id: 'border-league', type: 'line', source: 'borders', filter: lvl(5),
    layout: { 'line-join': 'round' },
    paint: { 'line-color': '#2f5560', 'line-width': e(['interpolate', ['linear'], ['zoom'], 1.5, 0.9, 8, 1.8]), 'line-dasharray': [6, 3], 'line-offset': 1.5 },
  },
  {
    id: 'border-4', type: 'line', source: 'borders', filter: lvl(4),
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': BORDER_INK, 'line-width': e(['interpolate', ['linear'], ['zoom'], 1.5, 1.2, 8, 2.6]), 'line-dasharray': [5, 1.5, 1, 1.5] },
  },
  {
    id: 'border-3', type: 'line', source: 'borders', filter: lvl(3),
    layout: { 'line-join': 'round' },
    paint: { 'line-color': BORDER_INK, 'line-width': e(['interpolate', ['linear'], ['zoom'], 1.5, 0.9, 8, 2]), 'line-dasharray': [4, 2] },
  },
  {
    id: 'border-2', type: 'line', source: 'borders', filter: lvl(2), minzoom: 3.8,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': BORDER_INK, 'line-width': e(['interpolate', ['linear'], ['zoom'], 4, 0.7, 9, 1.4]), 'line-dasharray': [3, 2.5],
      'line-opacity': e(['interpolate', ['linear'], ['zoom'], 3.8, 0, 4.6, 0.75]),
    },
  },
  {
    id: 'border-1', type: 'line', source: 'borders', filter: lvl(1), minzoom: 5.8, maxzoom: 12.5,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': BORDER_INK, 'line-width': e(['interpolate', ['linear'], ['zoom'], 6, 0.6, 10, 1.1]), 'line-dasharray': [0.2, 2.6],
      'line-opacity': e(['interpolate', ['linear'], ['zoom'], 5.8, 0, 6.6, 0.6, 11.5, 0.6, 12.5, 0]),
    },
  },
  {
    id: 'border-0', type: 'line', source: 'borders', filter: lvl(0), minzoom: 8, maxzoom: 13,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': BORDER_INK, 'line-width': e(['interpolate', ['linear'], ['zoom'], 8, 0.5, 11, 0.9]), 'line-dasharray': [0.1, 3.2],
      'line-opacity': e(['interpolate', ['linear'], ['zoom'], 8, 0, 8.8, 0.45, 12, 0.45, 13, 0]),
    },
  },
];
