import type { ExpressionSpecification, FilterSpecification, LayerSpecification } from 'maplibre-gl';
import { CAPS, ITALIC } from './label-style';
import { DEEP_LABEL, type DeepKind, type Underworld } from '../gen/underworld';
import type { LairSite } from '../lairs/lair';

/**
 * The Underworld map layer's vector lettering and drawing (gen/underworld.ts): caverns as glowing
 * shapes coloured by kind, tunnels (natural, built deep roads, the lower deep's) and great shafts as
 * lines, ways in from the surface as rings, and names. Shown only with the Underworld map layer.
 */
const e = (x: unknown) => x as ExpressionSpecification;
const EMPTY = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } as const;
export const UNDER_SOURCES = { 'uw-areas': EMPTY, 'uw-lines': EMPTY, 'uw-points': EMPTY };

export const DEEP_RGB: Record<DeepKind, string> = {
  cavern: '#8a7458', fungal: '#7d5aa6', lake: '#2f7290', hall: '#b08a46', chasm: '#2a2320',
  sea: '#1f5878', rift: '#c2502a', ruins: '#8c8577', abyss: '#141010',
};
export const DEEP_GLOW: Record<DeepKind, string> = {
  cavern: '#c9a878', fungal: '#b48ee0', lake: '#6fc0e0', hall: '#f0c870', chasm: '#7a5aa0',
  sea: '#5aa8d8', rift: '#ff8040', ruins: '#d8d0b8', abyss: '#b0407a',
};
export const TUNNEL_STYLE = {
  road: { color: '#e0b86a', label: 'Deep road (built)' },
  upper: { color: '#b49a6c', label: 'Tunnel, upper deep' },
  lower: { color: '#8a76b8', label: 'Tunnel, lower deep' },
  shaft: { color: '#d9d2ec', label: 'Great shaft between the tiers' },
};

const byKind = (table: Record<string, string>) => e(['match', ['get', 'kind'], ...Object.entries(table).flat(), '#888']);
const vis = { visibility: 'none' as const };

export const UNDER_LAYERS: LayerSpecification[] = [
  // Far out, where the caverns are too small to see, a glowing dot marks each.
  {
    id: 'uw-dot', type: 'circle', source: 'uw-points', maxzoom: 5, filter: e(['==', ['get', 'pt'], 'node']) as FilterSpecification, layout: vis,
    paint: {
      'circle-color': byKind(DEEP_RGB), 'circle-stroke-color': byKind(DEEP_GLOW), 'circle-stroke-width': 1.2, 'circle-blur': 0.15,
      'circle-radius': e(['interpolate', ['linear'], ['zoom'], 1, ['case', ['==', ['get', 'tier'], 1], 5, 3.5], 4, ['case', ['==', ['get', 'tier'], 1], 8, 5.5]]),
      'circle-opacity': e(['interpolate', ['linear'], ['zoom'], 3.5, 0.95, 5, 0]), 'circle-stroke-opacity': e(['interpolate', ['linear'], ['zoom'], 3.5, 1, 5, 0]),
    },
  },
  {
    id: 'uw-glow', type: 'line', source: 'uw-areas', layout: { ...vis, 'line-join': 'round' },
    paint: { 'line-color': byKind(DEEP_GLOW), 'line-width': e(['interpolate', ['linear'], ['zoom'], 1, 4, 6, 16]), 'line-blur': e(['interpolate', ['linear'], ['zoom'], 1, 3, 6, 12]), 'line-opacity': e(['case', ['==', ['get', 'tier'], 1], 0.3, 0.45]) },
  },
  {
    id: 'uw-fill', type: 'fill', source: 'uw-areas', layout: vis,
    paint: { 'fill-color': byKind(DEEP_RGB), 'fill-opacity': e(['case', ['==', ['get', 'tier'], 1], 0.6, 0.85]) },
  },
  {
    id: 'uw-edge', type: 'line', source: 'uw-areas', layout: vis,
    paint: { 'line-color': byKind(DEEP_GLOW), 'line-width': 1, 'line-opacity': 0.8 },
  },
  {
    id: 'uw-shaft', type: 'line', source: 'uw-lines', filter: e(['==', ['get', 'tier'], 2]) as FilterSpecification, layout: { ...vis, 'line-cap': 'round' },
    paint: { 'line-color': TUNNEL_STYLE.shaft.color, 'line-width': 1.2, 'line-dasharray': [1, 1.6], 'line-opacity': 0.85 },
  },
  {
    id: 'uw-tunnel-lower', type: 'line', source: 'uw-lines', filter: e(['==', ['get', 'tier'], 1]) as FilterSpecification, layout: { ...vis, 'line-join': 'round' },
    paint: { 'line-color': TUNNEL_STYLE.lower.color, 'line-width': e(['interpolate', ['linear'], ['zoom'], 1, 1, 7, 3]), 'line-dasharray': [2, 1], 'line-opacity': 0.75 },
  },
  {
    id: 'uw-tunnel', type: 'line', source: 'uw-lines', filter: e(['all', ['==', ['get', 'tier'], 0], ['!', ['get', 'road']]]) as FilterSpecification, layout: { ...vis, 'line-join': 'round' },
    paint: { 'line-color': TUNNEL_STYLE.upper.color, 'line-width': e(['interpolate', ['linear'], ['zoom'], 1, 1, 7, 3]), 'line-dasharray': [3, 1.6], 'line-opacity': 0.9 },
  },
  {
    id: 'uw-road-casing', type: 'line', source: 'uw-lines', filter: e(['all', ['==', ['get', 'tier'], 0], ['get', 'road']]) as FilterSpecification, layout: { ...vis, 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#15110e', 'line-width': e(['interpolate', ['linear'], ['zoom'], 1, 2.4, 7, 5.5]) },
  },
  {
    id: 'uw-road', type: 'line', source: 'uw-lines', filter: e(['all', ['==', ['get', 'tier'], 0], ['get', 'road']]) as FilterSpecification, layout: { ...vis, 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': TUNNEL_STYLE.road.color, 'line-width': e(['interpolate', ['linear'], ['zoom'], 1, 1.2, 7, 3]) },
  },
  {
    id: 'uw-shaft-ends', type: 'circle', source: 'uw-points', filter: e(['==', ['get', 'pt'], 'shaft']) as FilterSpecification, layout: vis,
    paint: { 'circle-radius': e(['interpolate', ['linear'], ['zoom'], 1, 2.5, 7, 5]), 'circle-color': '#15110e', 'circle-stroke-color': TUNNEL_STYLE.shaft.color, 'circle-stroke-width': 1.5 },
  },
  {
    id: 'uw-entrance', type: 'circle', source: 'uw-points', filter: e(['==', ['get', 'pt'], 'entrance']) as FilterSpecification, layout: vis,
    paint: { 'circle-radius': e(['interpolate', ['linear'], ['zoom'], 1, 2.2, 7, 4.5]), 'circle-color': '#f4ecd8', 'circle-stroke-color': '#e0a040', 'circle-stroke-width': 2 },
  },
  {
    id: 'uw-label-road', type: 'symbol', source: 'uw-lines', minzoom: 4.5, filter: e(['has', 'name']) as FilterSpecification,
    layout: { ...vis, 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': [ITALIC], 'text-size': 11, 'symbol-spacing': 400 },
    paint: { 'text-color': '#e8cc90', 'text-halo-color': '#15110e', 'text-halo-width': 1.4 },
  },
  {
    id: 'uw-label-entrance', type: 'symbol', source: 'uw-points', minzoom: 4.2, filter: e(['==', ['get', 'pt'], 'entrance']) as FilterSpecification,
    layout: { ...vis, 'text-field': ['get', 'name'], 'text-font': [ITALIC], 'text-size': 10.5, 'text-offset': [0, 1], 'text-anchor': 'top', 'text-optional': true },
    paint: { 'text-color': '#f4ecd8', 'text-halo-color': '#15110e', 'text-halo-width': 1.3 },
  },
  {
    id: 'uw-label', type: 'symbol', source: 'uw-points', filter: e(['==', ['get', 'pt'], 'node']) as FilterSpecification,
    layout: {
      ...vis, 'text-field': ['get', 'name'], 'text-font': e(['case', ['==', ['get', 'tier'], 1], ['literal', [CAPS]], ['literal', [ITALIC]]]),
      'text-size': e(['interpolate', ['linear'], ['zoom'], 2, ['case', ['==', ['get', 'tier'], 1], 11, 9.5], 7, ['case', ['==', ['get', 'tier'], 1], 17, 14]]),
      'text-max-width': 8, 'symbol-sort-key': ['get', 'tier'],
    },
    paint: { 'text-color': e(['case', ['==', ['get', 'tier'], 1], '#d8c8f0', '#f0e2c0']), 'text-halo-color': '#15110e', 'text-halo-width': 1.5 },
  },
];

type Feat = { type: 'Feature'; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> };
const fc = (features: Feat[]) => ({ type: 'FeatureCollection' as const, features });

/** The GeoJSON for the layer's three sources. */
export function underFeatures(u: Underworld) {
  const areas: Feat[] = u.nodes.map((n) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [n.ring] }, properties: { id: n.id, kind: n.kind, tier: n.tier } }));
  // Lower tier first, so the upper deep lies over it.
  areas.sort((a, b) => Number(b.properties.tier) - Number(a.properties.tier));
  const lines: Feat[] = u.tunnels.map((t) => ({
    type: 'Feature', geometry: { type: 'LineString', coordinates: t.pts },
    properties: { tier: t.tier, road: t.road, ...(t.name ? { name: t.name, ...(t.en ? { en: t.en } : {}) } : {}) },
  }));
  const points: Feat[] = [
    ...u.nodes.map((n) => ({ type: 'Feature' as const, geometry: { type: 'Point', coordinates: [n.lon, n.lat] }, properties: { pt: 'node', id: n.id, kind: n.kind, tier: n.tier, name: n.name, ...(n.en !== n.name ? { en: n.en } : {}) } })),
    ...u.entrances.map((x) => ({ type: 'Feature' as const, geometry: { type: 'Point', coordinates: [x.lon, x.lat] }, properties: { pt: 'entrance', kind: x.kind, name: x.name, ...(x.en !== x.name ? { en: x.en } : {}) } })),
    ...u.tunnels.filter((t) => t.tier === 2).flatMap((t) => [t.pts[0], t.pts[t.pts.length - 1]].map((p) => ({ type: 'Feature' as const, geometry: { type: 'Point', coordinates: p }, properties: { pt: 'shaft' } }))),
  ];
  return { areas: fc(areas), lines: fc(lines), points: fc(points) };
}

/** A cavern as a map site: where its tunnels lead, and its shafts up and down. */
export function deepSite(u: Underworld, id: number): LairSite {
  const n = u.nodes[id];
  const exits: string[] = [];
  let up: string | undefined, down: string | undefined;
  for (const t of u.tunnels) {
    if (t.a !== id && t.b !== id) continue;
    if (t.b < 0) {
      const x = u.entrances[t.entrance ?? -1];
      if (x && !up) up = x.name;
      continue;
    }
    const other = u.nodes[t.a === id ? t.b : t.a];
    if (t.tier === 2) {
      if (n.tier === 0) down ??= other.name;
      else up ??= other.name;
    } else exits.push(other.name);
  }
  const size = n.r > 70 ? 'large' : n.r > 35 ? 'medium' : 'small';
  return {
    id: `deep${id}`, kind: 'deep', name: n.name, ...(n.en !== n.name ? { en: n.en } : {}), seed: n.seed, lon: n.lon, lat: n.lat,
    tags: [DEEP_LABEL[n.kind].toLowerCase(), n.tier === 0 ? 'upper deep' : 'lower deep', size],
    deep: { kind: n.kind, tier: n.tier, exits, ...(up ? { up } : {}), ...(down ? { down } : {}) },
  };
}
