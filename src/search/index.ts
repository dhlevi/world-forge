import type { LabelCollection } from '../gen/features';
import type { RiverCollection } from '../gen/rivers';
import type { RoadCollection, Settlement } from '../gen/settlements';
import { LAYOUT_LABEL } from '../towns/layout';

/**
 * Place-name search. Entries come from the world (settlements, named features, rivers, roads),
 * from the towns worker's background index (villages, caves and glades, block by block) and
 * from town plans as they are drawn (quarters, districts, notable buildings). Matching is by
 * name, with the kind ("cave", "inn", "river") as a weaker match, so a type can be searched too.
 */
export type SearchCat = 'settlement' | 'water' | 'region' | 'lair' | 'road' | 'place';

export const CAT_LABEL: Record<SearchCat, string> = {
  settlement: 'Settlements', water: 'Water', region: 'Regions', lair: 'Caves & glades', road: 'Roads', place: 'In towns',
};

export interface SearchEntry {
  id: string;
  name: string;
  /** Display kind, e.g. "City", "Cave", "Inn". */
  type: string;
  cat: SearchCat;
  lon: number;
  lat: number;
  /** Zoom to fly to. */
  zoom: number;
  /** Importance 0..1 (ties are broken by it, then by distance). */
  rank: number;
  /** Extra detail, e.g. "12,400 people · planned grid" or "large · sealed". */
  info?: string;
  /** Settlement id, for things in a town ("in Anterina"). */
  sid?: string;
}

export interface SearchHit {
  e: SearchEntry;
  score: number;
  km: number;
}

/** Lower case, accents off, leading article dropped. */
export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^the\s+/, '').replace(/[’']/g, "'").trim();
}

const LABEL_TYPE: Record<string, [string, SearchCat]> = {
  realm: ['Realm', 'region'], continent: ['Continent', 'region'], island: ['Island', 'region'], isles: ['Isles', 'region'],
  mountains: ['Mountain range', 'region'], hills: ['Hills', 'region'], peak: ['Peak', 'region'], forest: ['Forest', 'region'],
  desert: ['Desert', 'region'], marsh: ['Marsh', 'region'], plains: ['Plains', 'region'],
  ocean: ['Ocean', 'water'], sea: ['Sea', 'water'], inlandSea: ['Inland sea', 'water'], gulf: ['Gulf', 'water'], bay: ['Bay', 'water'],
  bight: ['Bight', 'water'], strait: ['Strait', 'water'], channel: ['Channel', 'water'], lake: ['Lake', 'water'],
};

const VILLAGE_TYPE: Record<string, string> = {
  farming: 'Village', fishing: 'Fishing village', logging: 'Logging camp', mining: 'Mining camp', keep: 'Keep', monastery: 'Monastery',
};

const mid = (c: number[][]) => c[c.length >> 1];
const SMALL = new Set(['of', 'the', 'under', 'and', 'in']);
const titleCase = (s: string) => s.toLowerCase().split(' ').map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Entries for everything the world generator named. */
export function worldEntries(w: { settlements: Settlement[]; labels: LabelCollection; rivers: RiverCollection; roads: RoadCollection }): SearchEntry[] {
  const out: SearchEntry[] = [];
  const maxPop = Math.max(1, ...w.settlements.map((s) => s.population));
  for (const s of w.settlements) {
    if (s.tier === 'village' || !s.name) continue;
    out.push({
      id: s.id, name: s.name, type: s.tier === 'city' ? 'City' : 'Town', cat: 'settlement', lon: s.lon, lat: s.lat,
      zoom: s.tier === 'city' ? 12.4 : 13, rank: 0.5 + 0.5 * Math.sqrt(s.population / maxPop),
      info: `${s.population.toLocaleString('en')} people${s.layout ? ` · ${LAYOUT_LABEL[s.layout]}` : ''}`,
    });
  }
  w.labels.features.forEach((f, k) => {
    const p = f.properties;
    // Water lettering anchors repeat the name; only the main label counts.
    if (p.zlo || !p.name) return;
    const t = LABEL_TYPE[p.kind];
    if (!t) return;
    const c = f.geometry.type === 'Point' ? f.geometry.coordinates : mid(f.geometry.coordinates);
    // Realms are lettered in capitals on the map; search lists them in title case.
    const name = p.kind === 'peak' ? p.name.replace(/\s*\(\d+ m\)$/, '') : p.kind === 'realm' ? titleCase(p.name) : p.name;
    out.push({
      id: `f${k}`, name: name.charAt(0) === name.charAt(0).toUpperCase() ? name : cap(name), type: t[0], cat: t[1], lon: c[0], lat: c[1],
      zoom: Math.min(12, Math.max(2.5, (p.minz ?? 4) + 1.4)), rank: 0.9 - 0.15 * (p.rank ?? 2),
      info: p.kind === 'peak' ? p.name.match(/\((\d+ m)\)/)?.[1] : undefined,
    });
  });
  // Rivers: one entry per name, at the middle of its largest stretch.
  const rivers = new Map<string, { c: number[]; order: number }>();
  for (const f of w.rivers.features) {
    const n = f.properties.name;
    if (!n) continue;
    const r = rivers.get(n);
    if (!r || f.properties.order > r.order) rivers.set(n, { c: mid(f.geometry.coordinates), order: f.properties.order });
  }
  for (const [n, r] of rivers) {
    out.push({ id: `r:${n}`, name: cap(n), type: 'River', cat: 'water', lon: r.c[0], lat: r.c[1], zoom: r.order >= 5 ? 7.5 : 9, rank: Math.min(0.8, 0.3 + r.order / 12) });
  }
  w.roads.features.forEach((f, k) => {
    const n = f.properties.name;
    if (!n) return;
    const c = mid(f.geometry.coordinates);
    out.push({ id: `rd${k}`, name: cap(n), type: 'Road', cat: 'road', lon: c[0], lat: c[1], zoom: 9.5, rank: 0.3 });
  });
  return out;
}

/** Compact entries the towns worker sends for villages, caves and glades. */
export function blockEntry(o: { id: string; name: string; tier: string; kind: string; lon: number; lat: number; info?: string }): SearchEntry {
  if (o.tier === 'lair') {
    return { id: o.id, name: o.name, type: o.kind === 'cave' ? 'Cave' : 'Glade', cat: 'lair', lon: o.lon, lat: o.lat, zoom: 15.6, rank: 0.25, info: o.info };
  }
  return { id: o.id, name: o.name, type: VILLAGE_TYPE[o.kind] ?? 'Village', cat: 'settlement', lon: o.lon, lat: o.lat, zoom: 14.2, rank: 0.35, info: o.info };
}

const PLAN_TYPE: Record<string, string> = { qlabel: 'Quarter', dlabel: 'District', blabel: 'Building' };

/** Entries for the lettering of a drawn town or village plan. */
export function planEntries(features: { geometry: { type: string; coordinates: unknown }; properties: Record<string, string | number> }[]): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const f of features) {
    const p = f.properties;
    const t = PLAN_TYPE[String(p.kind)];
    if (!t || f.geometry.type !== 'Point' || !p.name) continue;
    const [lon, lat] = f.geometry.coordinates as number[];
    const role = typeof p.role === 'string' ? p.role : '';
    out.push({
      id: `p:${p.sid}:${p.kind}:${p.name}:${lon.toFixed(5)}`, name: String(p.name), type: role ? cap(role === 'townhall' ? 'town hall' : role) : t,
      cat: 'place', lon, lat, zoom: p.kind === 'blabel' ? 18 : p.kind === 'dlabel' ? 16.2 : 14.6, rank: p.kind === 'qlabel' ? 0.2 : 0.15,
      sid: p.sid ? String(p.sid) : undefined,
    });
  }
  return out;
}

function distKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Compass direction from a to b ("NE"). */
export function bearing(lon1: number, lat1: number, lon2: number, lat2: number): string {
  const r = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  const deg = ((Math.atan2(y, x) / r) + 360) % 360;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
}

export class SearchIndex {
  private entries = new Map<string, SearchEntry & { key: string; words: string[]; tkey: string }>();
  /** Settlement names by id, for "in Anterina". */
  readonly places = new Map<string, string>();
  version = 0;

  clear(): void {
    this.entries.clear();
    this.places.clear();
    this.version++;
  }

  get size(): number {
    return this.entries.size;
  }

  add(list: SearchEntry[]): void {
    for (const e of list) {
      if (this.entries.has(e.id)) continue;
      const key = norm(e.name);
      this.entries.set(e.id, { ...e, key, words: key.split(/[\s-]+/), tkey: norm(e.type) });
      if (e.cat === 'settlement') this.places.set(e.id, e.name);
    }
    this.version++;
  }

  /**
   * Best matches for a query: exact names, then names starting with it, then words starting
   * with it, then names containing it; the kind matches more weakly. Ties go to the more
   * important and then the nearer place.
   */
  search(q: string, cats: Set<SearchCat> | null, center: [number, number] | null, limit = 40): SearchHit[] {
    const nq = norm(q);
    if (!nq) return [];
    const hits: SearchHit[] = [];
    for (const e of this.entries.values()) {
      if (cats && !cats.has(e.cat)) continue;
      let s = 0;
      // A search for a kind ("cave", "inns") lists that kind nearest first, whatever the names say.
      if (e.tkey === nq || `${e.tkey}s` === nq || (nq.length >= 3 && e.tkey.startsWith(nq) && e.key !== nq && !e.key.startsWith(nq))) s = 70;
      else if (e.key === nq) s = 100;
      else if (e.key.startsWith(nq)) s = 80;
      else if (e.words.some((w) => w.startsWith(nq))) s = 72;
      else if (nq.length >= 4 && e.key.includes(nq)) s = 40;
      else continue;
      const km = center ? distKm(center[0], center[1], e.lon, e.lat) : 0;
      // Nearer and more important places first among equals (a type search lists the nearest).
      hits.push({ e, km, score: s + 8 * e.rank - (center ? Math.min(12, Math.log10(1 + km) * (s === 70 ? 6 : 3)) : 0) });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }
}
