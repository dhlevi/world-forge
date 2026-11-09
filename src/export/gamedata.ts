import type { GeneratedWorld } from '../gen/world';
import type { Settlement } from '../gen/settlements';
import { BIOME_COLORS, BIOME_NAMES, Biome } from '../gen/biomes';
import { KOPPEN_CLASSES } from '../gen/koppen';
import { SP_NAMES } from '../gen/special';
import { CULTURES, TEMPLATE_LABEL, type WorldCulture } from '../names/cultures';
import { templateFolk } from '../names/bundles';
import { LEXICON } from '../lang/lexicon';
import { loreFor } from '../lore/realm';
import { lookOf } from '../people/appearance';
import { LocalFrame, type PlanFeature } from '../towns/plan';
import type { Household } from '../people/residents';
import type { TownStats } from '../people/town';
import type { UrlParams } from '../url-params';

/**
 * The game-data export: the world as plain data for a game engine. `worldJson` gives the world
 * (its realms, settlements, roads, rivers, named places, peoples and faiths), `rasterFiles` the
 * grids (heights, biomes, climate, peoples, baronies) as raw binary files and PNG images, and
 * `townJson` one town of the region in full (every street, wall and building in local metres,
 * with the households living in each). export/zip.ts gathers them into one zip with a README.
 */
export const GAME_DATA_VERSION = 1;

const r1 = (v: number) => Math.round(v * 10) / 10;
const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
const ll = (c: number[]) => [r5(c[0]), r5(c[1])];

/** A line thinned to within `tol` degrees of itself (Ramer-Douglas-Peucker), ends kept. */
function thin(pts: number[][], tol: number): number[][] {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-12;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
      if (d > best) {
        best = d;
        bi = i;
      }
    }
    if (best > tol && bi > 0) {
      keep[bi] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

type World = Pick<GeneratedWorld, 'raster' | 'settlements' | 'roads' | 'rivers' | 'labels' | 'politics' | 'summary'> & { gen?: number };

function cellOf(W: number, H: number, lon: number, lat: number): number {
  const i = ((Math.floor(((lon + 180) / 360) * W) % W) + W) % W, j = Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H)));
  return j * W + i;
}

/** The barony (political unit id) a place lies in, or -1. */
export function baronyAt(w: World, lon: number, lat: number): number {
  const P = w.politics;
  return P.baronyOf[cellOf(P.W, P.H, lon, lat)] ?? -1;
}

/** The world as one JSON object (lon/lat in degrees; see the README for every field). */
export function worldJson(w: World, params: UrlParams): Record<string, unknown> {
  const r = w.raster;
  const lore = loreFor(String(w.gen ?? 'export'), r.seed, w.politics, w.settlements, w.labels.features);
  const L = lore?.L;
  const cultureOf = (s: Settlement) => s.culture ?? r.culture[cellOf(r.W, r.H, s.lon, s.lat)];

  const cultures = CULTURES.slice(0, r.cultures?.list.length ?? CULTURES.length).map((c: WorldCulture) => {
    let look: string[] | undefined;
    try {
      look = lookOf(r.seed, c).text;
    } catch {
      look = undefined;
    }
    const words: Record<string, string> = {};
    if (c.language) for (const k of LEXICON.slice(0, 240)) {
      try {
        words[k.en] = c.language.word(k.en).spell;
      } catch {
        // A word the language cannot make is left out.
      }
    }
    return {
      index: c.index, name: c.name, people: c.people, endonym: c.endonym, template: c.id, templateLabel: TEMPLATE_LABEL[c.id] ?? c.id, folk: templateFolk(c.id),
      ethos: c.ethos, traditions: c.traditions, customs: c.customs, hearth: ll(c.hearth), newWorld: c.nw, deep: !!c.deep, languageFamily: c.family,
      faith: L?.faiths.ofCulture[c.index], appearance: look, words,
    };
  });

  const realms = w.politics.units.map((u) => {
    let house: string | undefined;
    try {
      house = u.parent < 0 && L ? L.houseOf(u.id)?.name : undefined;
    } catch {
      house = undefined;
    }
    return {
      id: u.id, level: u.level, levelName: ['barony', 'county', 'duchy', 'kingdom', 'empire'][u.level] ?? String(u.level), title: u.title, name: u.name, gov: u.gov, ruler: u.ruler,
      seat: u.seat, seatName: u.seatName, lon: r5(u.lon), lat: r5(u.lat), parent: u.parent, league: u.league, culture: u.culture, townPeople: u.pop, people: u.people,
      areaKm2: Math.round(u.areaKm2), newWorld: u.nw, ...(u.level >= 1 ? { arms: u.arms } : {}), ...(house ? { house } : {}),
    };
  });

  const settlements = w.settlements.map((s) => ({
    id: s.id, name: s.name, nameEn: s.nameEn, tier: s.tier, kind: s.kind, population: s.population, lon: r5(s.lon), lat: r5(s.lat), radiusM: Math.round(s.radiusM),
    culture: cultureOf(s), barony: baronyAt(w, s.lon, s.lat), walls: s.walls, citadel: s.citadel, coastal: s.coastal, river: s.river, university: !!s.university,
    newWorld: !!s.newWorld, colony: s.colony, layout: s.layout, delve: !!s.delve, special: s.special,
  }));

  const roads = w.roads.features.map((f) => ({ cls: f.properties.cls, a: f.properties.a, b: f.properties.b, name: f.properties.name, nameEn: f.properties.en, line: thin(f.geometry.coordinates, 0.004).map(ll) }));
  const rivers = w.rivers.features.map((f) => ({ id: f.properties.rid, order: r1(f.properties.order), flow: Math.round(f.properties.flow), widthM: r1(f.properties.widthM), name: f.properties.name, nameEn: f.properties.en, line: thin(f.geometry.coordinates, 0.003).map(ll) }));
  // Named places: one entry per name (water bodies are lettered at many anchors on the map).
  const seen = new Set<string>();
  const places = w.labels.features.filter((f) => {
    const k = `${f.properties.kind}|${f.properties.name}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((f) => ({ kind: f.properties.kind, name: f.properties.name, nameEn: f.properties.en, rank: f.properties.rank, at: f.geometry.type === 'Point' ? ll(f.geometry.coordinates) : ll(f.geometry.coordinates[Math.floor(f.geometry.coordinates.length / 2)]), ...(f.geometry.type === 'LineString' ? { line: f.geometry.coordinates.map(ll) } : {}) }));

  const faiths = (L?.faiths.faiths ?? []).map((f) => ({
    id: f.id, name: f.name, native: f.native, kind: f.kind, family: f.family, adherents: f.adherents, cultures: f.cultures, former: f.former, missionary: f.missionary,
    prophet: f.prophet || undefined, deities: f.deities.map((d) => ({ name: d.name, domain: d.domain })), head: { ...f.head, lon: r5(f.head.lon), lat: r5(f.head.lat) },
    clergy: f.clergy, temple: f.temple, scripture: f.scripture, symbol: f.symbol, beliefs: f.beliefs, doctrines: f.doctrines, tenets: f.tenets,
    holySites: f.holySites.map((h) => JSON.parse(JSON.stringify(h))), sects: f.sects.map((x) => ({ id: x.id, name: x.name, origin: x.originName, lon: r5(x.lon), lat: r5(x.lat), founded: x.founded, culture: x.culture, note: x.note })),
    founded: f.founded, zeal: f.zeal,
  }));
  const wars = (L?.wars ?? []).map((x) => ({ id: x.id, name: x.name, attackers: x.attackers, defenders: x.defenders, start: x.start, end: x.end, cause: x.cause, winner: x.winner, status: x.status, peace: x.peace }));

  return {
    format: 'world-forge.gamedata', version: GAME_DATA_VERSION, exportedAt: new Date().toISOString(),
    settings: params,
    year: L?.year, era: L?.era,
    grid: {
      width: r.W, height: r.H, projection: 'equirectangular', rowOrder: 'north to south', colOrder: 'west to east',
      cell: 'cell (i, j) spans lon -180 + i * 360 / width to the next, and lat 90 - j * 180 / height down to the next; index = j * width + i',
      kmPerDegreeLat: 111.2,
    },
    summary: w.summary,
    biomes: Object.values(Biome).filter((v) => typeof v === 'number').map((b) => ({ id: b, name: BIOME_NAMES[b as Biome], colour: BIOME_COLORS[b as Biome] })),
    koppen: KOPPEN_CLASSES.map((k, id) => ({ id, ...k })),
    special: SP_NAMES.map((name, id) => ({ id, name: name || 'none' })),
    cultures, realms, settlements, roads, rivers, places, faiths, wars,
    cursedLands: (r.curses ?? []).map((h) => ({ ...h, lon: r5(h.lon), lat: r5(h.lat) })),
  };
}

// ---- Rasters -------------------------------------------------------------------------------

export interface RasterFile {
  name: string;
  data: Uint8Array;
}
/** A grid to be drawn as a PNG: its size and RGBA pixels. */
export interface RasterImage {
  name: string;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** A colour ramp through stops [t, hex]. */
function ramp(stops: [number, string][]) {
  const cs = stops.map(([t, h]) => [t, ...hex(h)] as [number, number, number, number]);
  return (t: number): [number, number, number] => {
    t = Math.max(0, Math.min(1, t));
    for (let i = 1; i < cs.length; i++) {
      if (t <= cs[i][0]) {
        const a = cs[i - 1], b = cs[i], k = (t - a[0]) / Math.max(1e-9, b[0] - a[0]);
        return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
      }
    }
    return [cs[cs.length - 1][1], cs[cs.length - 1][2], cs[cs.length - 1][3]];
  };
}

/** The world's grids as raw little-endian files and PNG images, with what the README says of them. */
export function rasterFiles(w: World): { files: RasterFile[]; images: RasterImage[]; meta: Record<string, unknown> } {
  const r = w.raster;
  const N = r.W * r.H;
  let lo = Infinity, hi = -Infinity;
  for (let c = 0; c < N; c++) {
    lo = Math.min(lo, r.height[c]);
    hi = Math.max(hi, r.height[c]);
  }
  const span = Math.max(1, hi - lo);
  const h16 = new Uint16Array(N), tMean = new Float32Array(N), pre = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    h16[c] = Math.round(((r.height[c] - lo) / span) * 65535);
    tMean[c] = (r.tempWarm[c] + r.tempCold[c]) / 2;
    pre[c] = r.precip[c];
  }
  const bytes = (a: ArrayBufferView) => new Uint8Array(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength));
  const P = w.politics;
  const files: RasterFile[] = [
    { name: 'grids/height.r16', data: bytes(h16) },
    { name: 'grids/temperature_c.f32', data: bytes(tMean) },
    { name: 'grids/precipitation_mm.f32', data: bytes(pre) },
    { name: 'grids/biome.u8', data: bytes(r.biome) },
    { name: 'grids/koppen.u8', data: bytes(r.koppen) },
    { name: 'grids/culture.u8', data: bytes(r.culture) },
    { name: 'grids/special.u8', data: bytes(r.special) },
    { name: 'grids/barony.i32', data: bytes(P.baronyOf) },
  ];
  // The images: heights (grey, sea darker), biomes, temperature and rainfall.
  const img = (name: string, f: (c: number) => [number, number, number]): RasterImage => {
    const rgba = new Uint8ClampedArray(N * 4);
    for (let c = 0; c < N; c++) {
      const [R, G, B] = f(c);
      rgba[c * 4] = R;
      rgba[c * 4 + 1] = G;
      rgba[c * 4 + 2] = B;
      rgba[c * 4 + 3] = 255;
    }
    return { name, width: r.W, height: r.H, rgba };
  };
  const biomeRGB = Object.fromEntries(Object.entries(BIOME_COLORS).map(([k, v]) => [k, hex(v)])) as Record<string, [number, number, number]>;
  const tempRamp = ramp([[0, '#2b3a8c'], [0.35, '#7fb3d5'], [0.55, '#f2e6a0'], [0.75, '#e08a3c'], [1, '#9e2b25']]);
  const rainRamp = ramp([[0, '#d9c49a'], [0.25, '#c7d18f'], [0.5, '#7fb36f'], [0.75, '#3f8a6b'], [1, '#1f4f7a']]);
  const images: RasterImage[] = [
    img('images/height.png', (c) => {
      const g = ((r.height[c] - lo) / span) * 255;
      return [g, g, g];
    }),
    img('images/biome.png', (c) => (r.height[c] <= 0 ? [70, 110, 150] : biomeRGB[r.biome[c]] ?? [128, 128, 128])),
    img('images/temperature.png', (c) => tempRamp((tMean[c] + 30) / 65)),
    img('images/precipitation.png', (c) => rainRamp(Math.sqrt(Math.max(0, pre[c]) / 4000))),
  ];
  return {
    files, images,
    meta: {
      width: r.W, height: r.H,
      height_r16: { minM: Math.round(lo), maxM: Math.round(hi), seaLevelM: 0, note: 'metres = minM + value / 65535 * (maxM - minM); sea level is 0 m' },
      barony_i32: { width: P.W, height: P.H, note: 'barony (realm unit id, see realms) per cell of its own grid, or -1 for sea and wild land' },
    },
  };
}

// ---- One town in full ------------------------------------------------------------------------

/** A plan feature's other properties (the drawing ones left out). */
function propsOf(p: PlanFeature['properties']): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(p)) if (!['kind', 'ppm20', 'sid', 'tier', 'cul'].includes(k)) out[k] = v;
  return out;
}

export interface TownExtras {
  stats?: TownStats;
  /** Households by building id. */
  households?: Map<string, Household[]>;
}

/**
 * One town of the region as plain data: everything in metres east (x) and north (y) of the town's
 * centre (lon, lat), buildings with their outline, area and kind, and the households in each.
 */
export function townJson(w: World, s: Settlement, features: PlanFeature[], extras: TownExtras = {}): Record<string, unknown> {
  const r = w.raster;
  const frame = new LocalFrame(s.lon, s.lat);
  const pt = (c: number[]) => {
    const q = frame.fromLL(c[0], c[1]);
    return [r1(q[0]), r1(q[1])];
  };
  const buildings: Record<string, unknown>[] = [];
  const other: Record<string, unknown>[] = [];
  for (const f of features) {
    const k = String(f.properties.kind);
    if (k === 'building' && f.geometry.type === 'Polygon') {
      const ring = f.geometry.coordinates[0].slice(0, -1).map(pt);
      let a = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      const bid = String(f.properties.bid);
      const hh = extras.households?.get(bid);
      buildings.push({ ...propsOf(f.properties), outline: ring, areaM2: r1(Math.abs(a) / 2), ...(hh ? { households: hh } : {}) });
    } else {
      const g = f.geometry;
      const geom = g.type === 'Point' ? { point: pt(g.coordinates) } : g.type === 'LineString' ? { line: g.coordinates.map(pt) } : { outline: g.coordinates[0].slice(0, -1).map(pt) };
      other.push({ kind: k, ...geom, ...propsOf(f.properties) });
    }
  }
  const people = buildings.reduce((n: number, b) => n + ((b.households as Household[] | undefined)?.reduce((m, h) => m + h.members.length + (h.more ?? 0), 0) ?? 0), 0);
  const stats = extras.stats;
  return {
    id: s.id, name: s.name, nameEn: s.nameEn, tier: s.tier, kind: s.kind, population: s.population, lon: r5(s.lon), lat: r5(s.lat),
    culture: s.culture ?? r.culture[cellOf(r.W, r.H, s.lon, s.lat)], barony: baronyAt(w, s.lon, s.lat), walls: s.walls, coastal: s.coastal, river: s.river,
    ...(stats ? { stats: { prosperity: stats.prosperity, sanitation: stats.sanitation, crime: stats.crime, watch: stats.watch, means: stats.means, peoples: stats.peoples, notes: stats.notes } } : {}),
    units: 'metres east (x) and north (y) of lon, lat',
    buildings, features: other, namedResidents: people,
  };
}
