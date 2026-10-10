import { type Grid, distKm, neighbor } from './grid';
import { MinHeap } from './heap';
import { hashString, mulberry32 } from './rng';
import type { RiverCollection } from './rivers';
import type { Settlement } from './settlements';
import type { LabelFeature } from './features';
import { CULTURES } from '../names/cultures';
import type { NameBank } from '../names/names';
import { type Arms, cadetArms, newArms, vassalArms } from '../heraldry/arms';

/**
 * The political map, built from the bottom up. Every city and town seats a county over the land
 * nearest it by travel cost (mountains, big rivers and culture changes count as distance; the
 * sea cannot be crossed), so borders follow ranges and rivers. Counties gather into duchies
 * around the largest seats, duchies into kingdoms, and the strongest kingdoms (only where at
 * least three come together) into empires; at those levels short sea crossings are allowed, so
 * islands join their neighbours. Land far from any town is left unclaimed.
 */
export type PolLevel = 0 | 1 | 2 | 3;
export const LEVEL_NAME = ['County', 'Duchy', 'Kingdom', 'Empire'] as const;

export interface PolUnit {
  id: number;
  level: PolLevel;
  /** Full style, e.g. "Duchy of Anterina", "the Ragndal Empire". */
  name: string;
  /** The ruler's title ("Duke", "Sultan"). */
  ruler: string;
  /** Seat (capital) settlement. */
  seat: string;
  seatName: string;
  lon: number;
  lat: number;
  /** Liege unit id, or -1. */
  parent: number;
  culture: number;
  arms: Arms;
  /** People in its cities and towns. */
  pop: number;
  areaKm2: number;
  /** Direct vassals. */
  vassals: number;
}

export interface BorderFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: number[][] };
  properties: { level: PolLevel };
}

export interface Politics {
  /** Size of the grid `countyOf` is on (at most 1024 × 512, whatever the world's detail). */
  W: number;
  H: number;
  /** County id per grid cell, or -1. */
  countyOf: Int32Array;
  units: PolUnit[];
  borders: { type: 'FeatureCollection'; features: BorderFeature[] };
}

/** Ruler titles and realm styles by culture: [county, duchy, kingdom, empire]. */
const RULERS: Record<string, [string, string, string, string]> = {
  anglo: ['Earl', 'Duke', 'King', 'Emperor'], norse: ['Jarl', 'Duke', 'King', 'High King'], latin: ['Count', 'Duke', 'King', 'Emperor'],
  celtic: ['Chieftain', 'Lord', 'King', 'High King'], elvish: ['Lord', 'Prince', 'King', 'High King'], desert: ['Bey', 'Emir', 'Sultan', 'Caliph'],
  slavic: ['Boyar', 'Voivode', 'Tsar', 'Emperor'], dwarven: ['Thane', 'Lord', 'King', 'High King'], southern: ['Archon', 'Despot', 'King', 'Autokrator'],
  steppe: ['Bey', 'Khan', 'Khan', 'Khagan'], jungle: ['Lord', 'Prince', 'King', 'Emperor'],
};
const COUNTY_STYLE: Record<string, string[]> = {
  anglo: ['County of {S}', '{S}shire', 'Earldom of {S}', 'Barony of {S}'], norse: ['Jarldom of {S}', '{S} Herad', 'County of {S}'],
  latin: ['County of {S}', 'March of {S}', 'Barony of {S}'], celtic: ['Lordship of {S}', 'Cantref of {S}', 'Tuath of {S}'],
  elvish: ['Demesne of {S}', 'March of {S}'], desert: ['Beylik of {S}', 'Sanjak of {S}'], slavic: ['Volost of {S}', 'Boyardom of {S}', 'County of {S}'],
  dwarven: ['Thanedom of {S}', 'Hold of {S}'], southern: ['Archonate of {S}', 'Nome of {S}'], steppe: ['Beylik of {S}', 'Ulus of {S}'],
  jungle: ['Lordship of {S}', 'County of {S}'],
};
const DUCHY_STYLE: Record<string, string[]> = {
  anglo: ['Duchy of {N}', 'Dukedom of {N}'], norse: ['Duchy of {N}', '{N} Lands'], latin: ['Duchy of {N}', 'Principality of {N}'],
  celtic: ['Lordship of {N}', 'Province of {N}'], elvish: ['Principality of {N}', 'Duchy of {N}'], desert: ['Emirate of {N}'],
  slavic: ['Voivodeship of {N}', 'Principality of {N}'], dwarven: ['Lordship of {N}', 'Deep of {N}'], southern: ['Despotate of {N}', 'Duchy of {N}'],
  steppe: ['Khanate of {N}', 'Horde of {N}'], jungle: ['Principality of {N}', 'Duchy of {N}'],
};
const EMPIRE_STYLE: Record<string, string[]> = {
  anglo: ['Empire of {N}', 'the {N} Empire'], norse: ['High Kingdom of {N}', 'the {N} Empire'], latin: ['Imperium of {N}', 'the {N} Empire'],
  celtic: ['High Kingdom of {N}'], elvish: ['High Kingdom of {N}', 'the {N} Dominion'], desert: ['Caliphate of {N}', 'the {N} Caliphate'],
  slavic: ['Empire of {N}', 'the {N} Tsardom'], dwarven: ['High Kingdom under {N}', 'the {N} Throne'], southern: ['Empire of {N}', 'the {N} Basileia'],
  steppe: ['Khaganate of {N}', 'the Great {N} Horde'], jungle: ['Empire of {N}', 'the {N} Empire'],
};

const LESSER = new Set(['Thane', 'Lord', 'Baron', 'Count', 'Jarl', 'Earl', 'Bey', 'Margrave', 'Voivode', 'Despot']);
const STYLE_RULER: [RegExp, string][] = [
  [/Sultanate/i, 'Sultan'], [/Emirate/i, 'Emir'], [/Caliphate/i, 'Caliph'], [/Republic/i, 'Doge'], [/Principality/i, 'Prince'],
  [/Tsardom/i, 'Tsar'], [/Khaganate/i, 'Khagan'], [/Khanate|Horde/i, 'Khan'], [/Voivodeship/i, 'Voivode'], [/Despotate/i, 'Despot'],
  [/Jarldom/i, 'Jarl'], [/Earldom|shire$/i, 'Earl'], [/Barony/i, 'Baron'], [/^(the )?March/i, 'Margrave'], [/Beylik|Sanjak/i, 'Bey'],
  [/Thanedom/i, 'Thane'], [/Lordship/i, 'Lord'], [/Dukedom|Duchy/i, 'Duke'], [/^County/i, 'Count'], [/Archonate/i, 'Archon'],
  [/Imperium|Empire/i, 'Emperor'], [/High Kingdom/i, 'High King'], [/^(the )?Kingdom/i, 'King'],
];

export interface PoliticsFields {
  height: Float32Array;
  lakeDepth: Float32Array;
  culture: Uint8Array;
}

export function buildPolitics(g: Grid, f: PoliticsFields, settlements: Settlement[], rivers: RiverCollection, bank: NameBank, seed: string): { politics: Politics; labels: LabelFeature[] } {
  const { W, H, N } = g;
  const rnd = mulberry32(hashString(`${seed}#politics`));
  const land = (c: number) => f.height[c] > 0 && f.lakeDepth[c] <= 0;
  const cellOf = (lon: number, lat: number) => {
    const i = ((Math.floor(((lon + 180) / 360) * W) % W) + W) % W;
    return Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H))) * W + i;
  };
  const lonOf = (c: number) => g.lonDeg[c % W], latOf = (c: number) => g.latDeg[(c / W) | 0];
  // Big rivers make borders: crossing one costs as much as ~120 km of road.
  const bigRiver = new Uint8Array(N);
  for (const rf of rivers.features) {
    if (rf.properties.order < 5) continue;
    for (const p of rf.geometry.coordinates) bigRiver[cellOf(p[0], p[1])] = 1;
  }
  const cul = (c: number) => CULTURES[f.culture[c]]?.id ?? 'anglo';

  /**
   * Multi-source Dijkstra: each source claims the cells it reaches first. `seaKm` > 0 lets a
   * source cross that much open sea (at a high price). `within` limits the cells that count.
   */
  const claim = (sources: { c: number; w: number; max: number }[], opts: { seaKm: number; cultureCost: number; within?: (c: number) => boolean }) => {
    const owner = new Int32Array(N).fill(-1);
    const cost = new Float64Array(N).fill(Infinity);
    const sea = new Float32Array(N);
    const heap = new MinHeap(8192);
    sources.forEach((s, k) => {
      if (cost[s.c] === 0) return;
      cost[s.c] = 0;
      owner[s.c] = k;
      heap.push(s.c, 0);
    });
    while (heap.size) {
      const c = heap.pop(), dc = heap.lastKey;
      if (dc > cost[c]) continue;
      const k = owner[c], src = sources[k];
      const i = c % W, j = (c / W) | 0;
      for (let d = 0; d < 8; d++) {
        const n = neighbor(g, i, j, d);
        if (n < 0) continue;
        const isLand = land(n);
        let seaRun = 0;
        if (!isLand) {
          if (opts.seaKm <= 0 || f.lakeDepth[n] > 0) continue;
          seaRun = sea[c] + g.nbDist[j * 8 + d];
          if (seaRun > opts.seaKm) continue;
        } else if (opts.within && !opts.within(n)) continue;
        const dist = g.nbDist[j * 8 + d];
        const h = Math.max(f.height[n], 0), dh = Math.abs(h - Math.max(f.height[c], 0));
        let step = dist * (1 + dh / 400 + (h > 1200 ? (h - 1200) / 600 : 0));
        if (!isLand) step = dist * 4;
        if (bigRiver[n] && !bigRiver[c]) step += 120;
        if (opts.cultureCost && f.culture[n] !== f.culture[c]) step += opts.cultureCost;
        const nd = dc + step / src.w;
        if (nd < cost[n] && nd <= src.max) {
          cost[n] = nd;
          owner[n] = k;
          sea[n] = isLand ? 0 : seaRun;
          heap.push(n, nd);
        }
      }
    }
    return owner;
  };

  // ---- Counties ------------------------------------------------------------------------------
  const seats = settlements.filter((s) => (s.tier === 'city' || s.tier === 'town') && land(cellOf(s.lon, s.lat)));
  const cOwner = claim(seats.map((s) => ({ c: cellOf(s.lon, s.lat), w: s.tier === 'city' ? 1.35 : 1, max: s.tier === 'city' ? 420 : 300 })), { seaKm: 0, cultureCost: 0 });
  const units: PolUnit[] = [];
  const countyOf = new Int32Array(N).fill(-1);
  const seatUnit: number[] = [];
  const area = new Float64Array(seats.length);
  for (let c = 0; c < N; c++) if (cOwner[c] >= 0) area[cOwner[c]] += g.areaKm2[(c / W) | 0];
  seats.forEach((s, k) => {
    if (area[k] <= 0) {
      seatUnit.push(-1);
      return;
    }
    seatUnit.push(units.length);
    const cc = cellOf(s.lon, s.lat);
    units.push({
      id: units.length, level: 0, name: '', ruler: '', seat: s.id, seatName: s.name ?? '', lon: s.lon, lat: s.lat, parent: -1,
      culture: f.culture[cc], arms: null as unknown as Arms, pop: s.population, areaKm2: area[k], vassals: 0,
    });
  });
  for (let c = 0; c < N; c++) if (cOwner[c] >= 0) countyOf[c] = seatUnit[cOwner[c]];
  // Other towns inside a county add to its people.
  const counties = units.slice();

  /** Groups units of one level into lieges around the strongest seats at least `minKm` apart. */
  const group = (level: PolLevel, members: PolUnit[], minKm: number, maxCost: number, seaKm: number, cultureCost: number, minVassals: number) => {
    const order = [...members].sort((a, b) => b.pop - a.pop);
    const heads: PolUnit[] = [];
    for (const u of order) if (heads.every((h) => distKm(h.lon, h.lat, u.lon, u.lat) > minKm)) heads.push(u);
    // Which member each cell belongs to (through its county).
    const memberOf = new Int32Array(units.length).fill(-1);
    const top = (u: PolUnit): PolUnit => (u.level === level - 1 ? u : top(units[u.parent]));
    members.forEach((m, k) => (memberOf[m.id] = k));
    const memberAt = (c: number) => {
      const cu = countyOf[c];
      if (cu < 0) return -1;
      return memberOf[top(units[cu]).id];
    };
    const owner = claim(heads.map((h) => ({ c: cellOf(h.lon, h.lat), w: 1, max: maxCost })), { seaKm, cultureCost, within: (c) => countyOf[c] >= 0 });
    // Each member goes wholly to the liege that reaches its seat.
    const lieges = heads.map((h) => ({ head: h, members: [] as PolUnit[] }));
    const orphans: PolUnit[] = [];
    for (const m of members) {
      const o = owner[cellOf(m.lon, m.lat)];
      if (o >= 0) lieges[o].members.push(m);
      else orphans.push(m);
    }
    void memberAt;
    const made: PolUnit[] = [];
    for (const l of lieges) {
      // Too small to stand as a realm of this level: leave its members independent.
      if (l.members.length < minVassals) continue;
      const u: PolUnit = {
        id: units.length, level, name: '', ruler: '', seat: l.head.seat, seatName: l.head.seatName, lon: l.head.lon, lat: l.head.lat, parent: -1,
        culture: l.head.culture, arms: null as unknown as Arms, pop: l.members.reduce((a, m) => a + m.pop, 0),
        areaKm2: l.members.reduce((a, m) => a + m.areaKm2, 0), vassals: l.members.length,
      };
      units.push(u);
      made.push(u);
      for (const m of l.members) m.parent = u.id;
    }
    // Members left over (unreached or in too small a group) become their own liege at this
    // level when they must (duchies and kingdoms); empires are optional.
    if (level < 3) {
      for (const m of members) {
        if (m.parent >= 0) continue;
        const u: PolUnit = { ...m, id: units.length, level, parent: -1, vassals: 1, name: '', ruler: '', arms: null as unknown as Arms };
        units.push(u);
        made.push(u);
        m.parent = u.id;
      }
    }
    void orphans;
    return made;
  };

  const duchies = group(1, counties, 380, 900, 220, 0, 1);
  const kingdoms = group(2, duchies, 1050, 2400, 450, 140, 1);
  group(3, kingdoms, 2600, 4200, 700, 260, 3);

  // ---- Names, rulers and arms (top down, so arms can descend) ---------------------------------
  const pickS = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const byLevel = (l: PolLevel) => units.filter((u) => u.level === l);
  for (const u of [...byLevel(3), ...byLevel(2), ...byLevel(1), ...byLevel(0)]) {
    const c = CULTURES[u.culture] ?? CULTURES[0];
    const id = c.id;
    u.ruler = (RULERS[id] ?? RULERS.anglo)[u.level];
    const r = bank.rng(`pol:${u.level}:${u.seat}`);
    const own = () => bank.proper(c, r);
    const fill = (tpl: string, n: string) => tpl.replace('{N}', n).replace('{S}', n);
    if (u.level === 0) u.name = fill(pickS(COUNTY_STYLE[id] ?? COUNTY_STYLE.anglo), u.seatName);
    else if (u.level === 1) u.name = fill(pickS(DUCHY_STYLE[id] ?? DUCHY_STYLE.anglo), r() < 0.55 ? u.seatName : own());
    else if (u.level === 2) u.name = fill(pickS(c.realm), r() < 0.35 ? u.seatName : own());
    else u.name = fill(pickS(EMPIRE_STYLE[id] ?? EMPIRE_STYLE.anglo), own());
    u.name = u.name.replace(/^The /, 'the ').replace(/^the (\w)/, (_, a) => `the ${a.toUpperCase()}`);
    // A realm's style names its ruler (a Sultanate has a Sultan, a March a Margrave).
    for (const [re, r] of STYLE_RULER) {
      if (!re.test(u.name)) continue;
      // A kingdom styled "Thanedom" still has a king; an empire of a Horde has a Khagan.
      if (!(u.level >= 2 && LESSER.has(r))) u.ruler = u.level === 3 && r === 'Khan' ? 'Khagan' : r;
      break;
    }
    const ar = mulberry32(hashString(`${seed}#arms#${u.level}#${u.seat}`));
    const liege = u.parent >= 0 ? units[u.parent] : null;
    if (!liege || !liege.arms) u.arms = newArms(ar, id, u.level === 3);
    else if (u.level === 0) u.arms = liege.seat === u.seat ? { ...liege.arms, crowned: false } : cadetArms(ar, liege.arms);
    else u.arms = liege.seat === u.seat ? { ...liege.arms, crowned: false } : vassalArms(ar, liege.arms, id);
    // A realm and the duchy or county at its seat share the same arms.
  }

  // ---- Labels ----------------------------------------------------------------------------------
  const labels: LabelFeature[] = [];
  const cellsOf = new Map<number, number[]>();
  const topOf = (u: PolUnit, level: PolLevel): PolUnit | null => {
    let x: PolUnit | null = u;
    while (x && x.level < level) x = x.parent >= 0 ? units[x.parent] : null;
    return x && x.level === level ? x : null;
  };
  for (let c = 0; c < N; c++) {
    const cu = countyOf[c];
    if (cu < 0) continue;
    for (let l = 0 as PolLevel; l <= 3; l = (l + 1) as PolLevel) {
      const u = topOf(units[cu], l);
      if (!u) continue;
      let a = cellsOf.get(u.id);
      if (!a) cellsOf.set(u.id, (a = []));
      a.push(c);
    }
  }
  const stamp = new Int32Array(N), depth = new Int32Array(N), queue = new Int32Array(N);
  let st = 0;
  const pole = (cells: number[]) => {
    st++;
    for (const c of cells) stamp[c] = st;
    let qn = 0;
    for (const c of cells) {
      const i = c % W, j = (c / W) | 0;
      depth[c] = -1;
      for (let k = 0; k < 8; k++) {
        const n = neighbor(g, i, j, k);
        if (n < 0 || stamp[n] !== st) {
          depth[c] = 0;
          queue[qn++] = c;
          break;
        }
      }
    }
    let best = qn ? queue[0] : cells[0], bd = 0;
    for (let q = 0; q < qn; q++) {
      const c = queue[q], i = c % W, j = (c / W) | 0;
      if (depth[c] > bd) {
        bd = depth[c];
        best = c;
      }
      for (let k = 0; k < 8; k++) {
        const n = neighbor(g, i, j, k);
        if (n >= 0 && stamp[n] === st && depth[n] < 0) {
          depth[n] = depth[c] + 1;
          queue[qn++] = n;
        }
      }
    }
    return best;
  };
  const KIND = ['county', 'duchy', 'realm', 'empire'] as const;
  for (const u of units) {
    const cells = cellsOf.get(u.id);
    if (!cells || (u.level === 0 && u.areaKm2 < 4000)) continue;
    // A realm that is only its seat duchy or county is lettered once, at its highest level.
    if (u.level < 3 && u.parent >= 0 && units[u.parent].vassals === 1) continue;
    const at = pole(cells);
    const rank = u.areaKm2 > 2e6 ? 0 : u.areaKm2 > 5e5 ? 1 : u.areaKm2 > 1e5 ? 2 : 3;
    labels.push({
      type: 'Feature', geometry: { type: 'Point', coordinates: [lonOf(at), latOf(at)] },
      properties: { kind: KIND[u.level] as LabelFeature['properties']['kind'], name: u.level >= 2 ? u.name.toUpperCase() : u.name, rank, minz: 0, maxz: 0, unit: u.id } as LabelFeature['properties'],
    });
  }

  return { politics: { W, H, countyOf, units, borders: borders(g, countyOf, units, land) }, labels };
}

/**
 * Border lines between cells of different realms, each drawn once at the highest level that
 * differs (empire, kingdom, duchy, county), stitched into lines along the cell edges and
 * smoothed. Coasts are not borders; the edge of claimed land is.
 */
function borders(g: Grid, countyOf: Int32Array, units: PolUnit[], land: (c: number) => boolean): Politics['borders'] {
  const { W, H } = g;
  const chain = (cu: number) => {
    const out = [-1, -1, -1, -1];
    let u: PolUnit | null = cu >= 0 ? units[cu] : null;
    while (u) {
      out[u.level] = u.id;
      u = u.parent >= 0 ? units[u.parent] : null;
    }
    // Independent kingdoms are their own top level.
    if (out[3] < 0) out[3] = out[2] >= 0 ? -2 - out[2] : -1;
    return out;
  };
  const chains = new Map<number, number[]>();
  const ch = (cu: number) => {
    let c = chains.get(cu);
    if (!c) chains.set(cu, (c = chain(cu)));
    return c;
  };
  const levelBetween = (a: number, b: number): number => {
    if (a === b) return -1;
    if (a < 0 || b < 0) return 3;
    const x = ch(a), y = ch(b);
    for (let l = 3; l >= 0; l--) if (x[l] !== y[l]) return l;
    return 0;
  };
  // Edges between grid corners (i, j) .. on a W × (H+1) corner lattice (i wraps).
  const edges: Map<string, number>[] = [new Map(), new Map(), new Map(), new Map()];
  const vkey = (i: number, j: number) => `${((i % W) + W) % W},${j}`;
  const addEdge = (l: number, a: string, b: string) => {
    edges[l].set(a < b ? `${a}|${b}` : `${b}|${a}`, 1);
  };
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const c = j * W + i;
      // East neighbour: shared vertical edge at x = i + 1.
      const e = j * W + ((i + 1) % W);
      if (land(c) && land(e) && (countyOf[c] >= 0 || countyOf[e] >= 0)) {
        const l = levelBetween(countyOf[c], countyOf[e]);
        if (l >= 0) addEdge(l, vkey(i + 1, j), vkey(i + 1, j + 1));
      }
      if (j + 1 < H) {
        const s = c + W;
        if (land(c) && land(s) && (countyOf[c] >= 0 || countyOf[s] >= 0)) {
          const l = levelBetween(countyOf[c], countyOf[s]);
          if (l >= 0) addEdge(l, vkey(i, j + 1), vkey(i + 1, j + 1));
        }
      }
    }
  }
  const features: BorderFeature[] = [];
  const toLL = (k: string): number[] => {
    const [i, j] = k.split(',').map(Number);
    return [-180 + (i * 360) / W, 90 - (j * 180) / H];
  };
  edges.forEach((set, level) => {
    const adj = new Map<string, string[]>();
    for (const e of set.keys()) {
      const [a, b] = e.split('|');
      (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
      (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
    }
    const used = new Set<string>();
    const walk = (start: string, next: string) => {
      const pts = [start, next];
      used.add(start < next ? `${start}|${next}` : `${next}|${start}`);
      let prev = start, cur = next;
      while ((adj.get(cur)?.length ?? 0) === 2) {
        const nx = adj.get(cur)!.find((v) => v !== prev)!;
        const ek = cur < nx ? `${cur}|${nx}` : `${nx}|${cur}`;
        if (used.has(ek)) break;
        used.add(ek);
        pts.push(nx);
        prev = cur;
        cur = nx;
        if (cur === start) break;
      }
      return pts;
    };
    // Start at line ends and junctions first, then whatever loops remain.
    const starts = [...adj.keys()].sort((a, b) => Number((adj.get(a)!.length === 2)) - Number((adj.get(b)!.length === 2)));
    for (const s of starts) {
      for (const n of adj.get(s)!) {
        const ek = s < n ? `${s}|${n}` : `${n}|${s}`;
        if (used.has(ek)) continue;
        let line = walk(s, n).map(toLL);
        // Unwrap across the antimeridian, then smooth (ends stay put so lines still meet).
        for (let k = 1; k < line.length; k++) {
          while (line[k][0] - line[k - 1][0] > 180) line[k][0] -= 360;
          while (line[k][0] - line[k - 1][0] < -180) line[k][0] += 360;
        }
        // The cell edges make a staircase; relax it into the diagonal it stands for (a closed
        // loop relaxes all round, an open line keeps its ends so it still meets the others).
        const closed = line.length > 3 && line[0][0] === line[line.length - 1][0] && line[0][1] === line[line.length - 1][1];
        for (let it = 0; it < 10 && line.length > 2; it++) {
          const n = line.length, m = closed ? n - 1 : n;
          const next = line.map((p) => [p[0], p[1]]);
          for (let k = closed ? 0 : 1; k < (closed ? m : n - 1); k++) {
            const pa = line[(k - 1 + m) % m], pb = line[(k + 1) % m];
            next[k] = [0.5 * line[k][0] + 0.25 * (pa[0] + pb[0]), 0.5 * line[k][1] + 0.25 * (pa[1] + pb[1])];
          }
          if (closed) next[n - 1] = next[0];
          line = next;
        }
        for (let pass = 0; pass < 2 && line.length > 2; pass++) {
          const out = [line[0]];
          for (let k = 0; k + 1 < line.length; k++) {
            const a = line[k], b = line[k + 1];
            out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
          }
          out.push(line[line.length - 1]);
          line = out;
        }
        line = simplify(line, 0.03);
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: line.map((p) => [Math.round(p[0] * 1e3) / 1e3, Math.round(p[1] * 1e3) / 1e3]) }, properties: { level: level as PolLevel } });
      }
    }
  });
  return { type: 'FeatureCollection', features };
}

/** Douglas–Peucker (degrees), keeping the end points. */
function simplify(line: number[][], tol: number): number[][] {
  if (line.length < 3) return line;
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = line[a], [bx, by] = line[b];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let best = -1, bd = tol * tol;
    for (let k = a + 1; k < b; k++) {
      const px = line[k][0] - ax, py = line[k][1] - ay;
      const t = l2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / l2)) : 0;
      const d = (px - t * dx) ** 2 + (py - t * dy) ** 2;
      if (d > bd) {
        bd = d;
        best = k;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return line.filter((_, k) => keep[k]);
}
