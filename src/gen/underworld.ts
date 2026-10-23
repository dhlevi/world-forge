import { type Grid, distKm } from './grid';
import { Biome } from './biomes';
import { hashString, mulberry32, type Rng } from './rng';
import type { Settlement } from './settlements';
import type { LabelFeature } from './features';
import type { Vent } from './special';
import type { NameBank, Named } from '../names/names';
import type { FeatureKind } from '../names/cultures';

/**
 * The Underworld (fantasy worlds only): a network of caverns and tunnels below the continents, on
 * two tiers, made after everything else on random streams of its own (so nothing above changes).
 *
 * - The **upper deep**: great caverns, fungal forests, lakes, dwarven halls and chasms, most of
 *   them under mountains and hills, joined by natural tunnels and, between the dwarven halls, by
 *   built deep roads. Every delve opens on one of them.
 * - The **lower deep**: sunless seas, burning rifts, the ruins of a fallen people, vast fungal
 *   forests and abysses, further apart, joined by long tunnels, and reached from the upper deep by
 *   great shafts.
 * - **Ways in** from the surface: the delves' deep roads, lava tubes from volcanoes, and sinkholes
 *   (new named places on the surface).
 */

export type DeepKind = 'cavern' | 'fungal' | 'lake' | 'hall' | 'chasm' | 'sea' | 'rift' | 'ruins' | 'abyss';

export const DEEP_LABEL: Record<DeepKind, string> = {
  cavern: 'Great cavern', fungal: 'Fungal forest', lake: 'Underground lake', hall: 'Dwarven hall', chasm: 'Chasm',
  sea: 'Sunless sea', rift: 'Burning rift', ruins: 'Fallen city', abyss: 'Abyss',
};

const FEATURE: Record<DeepKind, FeatureKind> = {
  cavern: 'deepCavern', fungal: 'deepFungal', lake: 'deepLake', hall: 'deepHall', chasm: 'deepChasm',
  sea: 'deepSea', rift: 'deepRift', ruins: 'deepRuins', abyss: 'deepAbyss',
};

export interface DeepNode {
  id: number;
  /** 0 the upper deep, 1 the lower deep. */
  tier: 0 | 1;
  kind: DeepKind;
  lon: number;
  lat: number;
  /** Size (km across, roughly its radius). */
  r: number;
  name: string;
  en: string;
  seed: number;
  culture: number;
  /** Its outline: a ring of lon/lat points. */
  ring: number[][];
}

export interface DeepTunnel {
  /** The nodes it joins (b is -1 for a way in from the surface, given by `entrance`). */
  a: number;
  b: number;
  /** 0 the upper deep, 1 the lower deep, 2 a great shaft between them. */
  tier: 0 | 1 | 2;
  /** A built deep road (dwarven), else a natural tunnel. */
  road: boolean;
  entrance?: number;
  name?: string;
  en?: string;
  km: number;
  pts: number[][];
}

export interface DeepEntrance {
  kind: 'delve' | 'vent' | 'sinkhole';
  lon: number;
  lat: number;
  node: number;
  name: string;
  en: string;
  /** The delve's settlement id. */
  sid?: string;
}

export interface Underworld {
  nodes: DeepNode[];
  tunnels: DeepTunnel[];
  entrances: DeepEntrance[];
}

export interface UnderInputs {
  height: Float32Array;
  lakeDepth: Float32Array;
  temp: Float32Array;
  precip: Float32Array;
  biome: Uint8Array;
  culture: Uint8Array;
  special: Uint8Array;
}

export function underworld(
  g: Grid, f: UnderInputs, settlements: Settlement[], vents: Vent[], bank: NameBank, seed: string,
): { world: Underworld; labels: LabelFeature[] } {
  const { W, H, N } = g;
  const rng = (k: string): Rng => mulberry32(hashString(`${seed}#under#${k}`));
  const lon = (c: number) => g.lonDeg[c % W], lat = (c: number) => g.latDeg[(c / W) | 0];
  const land = (c: number) => f.height[c] > 0 && f.lakeDepth[c] <= 0;
  const cellAt = (lo: number, la: number) => {
    const i = ((Math.floor(((lo + 180) / 360) * W) % W) + W) % W;
    return Math.min(H - 1, Math.max(0, Math.floor(((90 - la) / 180) * H))) * W + i;
  };
  let landArea = 0;
  for (let c = 0; c < N; c++) if (f.height[c] > 0) landArea += g.areaKm2[(c / W) | 0];
  const nodes: DeepNode[] = [];
  const tunnels: DeepTunnel[] = [];
  const entrances: DeepEntrance[] = [];
  const labels: LabelFeature[] = [];
  const far = (lo: number, la: number, tier: 0 | 1, km: number) => nodes.every((n) => n.tier !== tier || distKm(n.lon, n.lat, lo, la) >= km);
  const addNode = (tier: 0 | 1, kind: DeepKind, lo: number, la: number, r: number, rr: Rng, named?: Named): DeepNode => {
    const c = cellAt(lo, la);
    const id = nodes.length;
    // A hall with no delve above it is a lost hold of a people long gone.
    const n: Named = named ?? (kind === 'hall'
      ? bank.named(f.culture[c] ?? 0, rr() < 0.5 ? 'the Lost Hold of {0}' : 'the Sealed Halls of {0}', [bank.featureNamed('deepHall', f.culture[c] ?? 0, `deep${id}`)].map((q) => ({ name: q.name.replace(/^the /i, ''), en: q.en.replace(/^the /i, '') })))
      : bank.featureNamed(FEATURE[kind], f.culture[c] ?? 0, `deep${id}`));
    const node: DeepNode = { id, tier, kind, lon: lo, lat: la, r, name: n.name, en: n.en, seed: Math.floor(rr() * 2 ** 31), culture: f.culture[c] ?? 0, ring: [] };
    // An irregular outline: a few harmonics round a circle (a long, narrow shape for chasms and rifts).
    const ph = [rr() * 6.3, rr() * 6.3, rr() * 6.3], amp = [0.18 + 0.1 * rr(), 0.1 + 0.08 * rr(), 0.06];
    const long = kind === 'chasm' || kind === 'rift' ? 2.6 : kind === 'sea' ? 1.5 : 1.15 + 0.3 * rr();
    const rot = rr() * Math.PI;
    const kLat = 1 / 111.2, kLon = kLat / Math.max(0.1, Math.cos((la * Math.PI) / 180));
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const s = 1 + amp[0] * Math.sin(2 * a + ph[0]) + amp[1] * Math.sin(3 * a + ph[1]) + amp[2] * Math.sin(5 * a + ph[2]);
      const x0 = Math.cos(a) * r * s * Math.sqrt(long), y0 = (Math.sin(a) * r * s) / Math.sqrt(long);
      const x = x0 * Math.cos(rot) - y0 * Math.sin(rot), y = x0 * Math.sin(rot) + y0 * Math.cos(rot);
      node.ring.push([lo + x * kLon, la + y * kLat]);
    }
    node.ring.push(node.ring[0]);
    nodes.push(node);
    return node;
  };

  // ---- The upper deep ----------------------------------------------------------------------------
  const ru = rng('upper');
  // A dwarven hall beneath every delve.
  for (const s of settlements) {
    if (!s.delve || !far(s.lon, s.lat, 0, 300)) continue;
    const a = ru() * Math.PI * 2, d = 25 + 30 * ru();
    const c = cellAt(s.lon, s.lat), base = { name: s.name ?? '', en: s.nameEn ?? s.name ?? '' };
    const named = bank.named(s.culture ?? f.culture[c] ?? 0, ru() < 0.5 ? 'the Halls of {0}' : ru() < 0.5 ? '{0} Deephall' : 'the Deep Gate of {0}', [base]);
    addNode(0, 'hall', s.lon + (Math.cos(a) * d) / (111.2 * Math.max(0.1, Math.cos((s.lat * Math.PI) / 180))), s.lat + (Math.sin(a) * d) / 111.2, 22 + 18 * ru(), ru, named);
  }
  const nUpper = Math.max(30, Math.min(140, Math.round(landArea / 1.6e6)));
  const cand: { c: number; s: number }[] = [];
  for (let c = 0; c < N; c++) {
    if (!land(c)) continue;
    const mount = Math.min(1, Math.max(0, (f.height[c] - 200) / 2300));
    cand.push({ c, s: ru() + 0.9 * mount + (f.special[c] === 7 || f.special[c] === 1 ? 0.3 : 0) });
  }
  cand.sort((a, b) => b.s - a.s);
  for (const { c } of cand) {
    if (nodes.filter((n) => n.tier === 0).length >= nUpper) break;
    if (!far(lon(c), lat(c), 0, 330)) continue;
    const x = ru();
    const wet = f.precip[c] > 900 && f.temp[c] > 4;
    const kind: DeepKind = f.special[c] === 4 || (wet && x < 0.25) ? 'fungal'
      : f.height[c] > 1500 && x < 0.2 ? 'hall' : x < 0.42 ? 'lake' : x < 0.55 ? 'chasm' : x < 0.66 ? 'fungal' : 'cavern';
    addNode(0, kind, lon(c), lat(c), kind === 'hall' ? 22 + 18 * ru() : 30 + 45 * ru(), ru);
  }

  // ---- The lower deep ----------------------------------------------------------------------------
  const rl = rng('lower');
  const nLower = Math.max(8, Math.min(40, Math.round(landArea / 7e6)));
  const cand2 = cand.map((q) => ({ c: q.c, s: rl() + (f.special[q.c] === 7 || f.special[q.c] === 2 ? 0.4 : 0) })).sort((a, b) => b.s - a.s);
  for (const { c } of cand2) {
    if (nodes.filter((n) => n.tier === 1).length >= nLower) break;
    if (!far(lon(c), lat(c), 1, 700)) continue;
    const x = rl();
    const hot = f.special[c] === 7 || f.special[c] === 2 || f.special[c] === 1;
    const kind: DeepKind = hot && x < 0.5 ? 'rift' : x < 0.3 ? 'sea' : x < 0.45 ? 'rift' : x < 0.65 ? 'ruins' : x < 0.82 ? 'fungal' : 'abyss';
    addNode(1, kind, lon(c), lat(c), kind === 'sea' ? 110 + 140 * rl() : 55 + 60 * rl(), rl);
  }

  // ---- Tunnels: a relative-neighbourhood graph on each tier, then shafts between the tiers -------
  const rt = rng('tunnels');
  const meander = (a: number[], b: number[], amt: number) => {
    let pts = [a, b];
    for (let l = 0; l < 4; l++) {
      const out = [pts[0]];
      for (let k = 1; k < pts.length; k++) {
        const p = pts[k - 1], q = pts[k], dx = q[0] - p[0], dy = q[1] - p[1];
        const o = (rt() - 0.5) * 2 * amt;
        out.push([(p[0] + q[0]) / 2 - dy * o, (p[1] + q[1]) / 2 + dx * o], q);
      }
      pts = out;
      amt *= 0.6;
    }
    return pts;
  };
  const unwrap = (a: number[], b: number[]) => [b[0] + (b[0] - a[0] > 180 ? -360 : b[0] - a[0] < -180 ? 360 : 0), b[1]];
  const join = (a: DeepNode, b: DeepNode, tier: 0 | 1 | 2, road: boolean) => {
    const pa = [a.lon, a.lat], pb = unwrap(pa, [b.lon, b.lat]);
    tunnels.push({ a: a.id, b: b.id, tier, road, km: distKm(a.lon, a.lat, b.lon, b.lat), pts: meander(pa, pb, road ? 0.08 : 0.18) });
  };
  for (const tier of [0, 1] as const) {
    const list = nodes.filter((n) => n.tier === tier);
    const max = tier === 0 ? 700 : 1300;
    const d = (p: DeepNode, q: DeepNode) => distKm(p.lon, p.lat, q.lon, q.lat);
    const parent = new Map(list.map((n) => [n.id, n.id]));
    const root = (x: number): number => (parent.get(x) === x ? x : root(parent.get(x)!));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const dij = d(list[i], list[j]);
        if (dij > max) continue;
        // Relative neighbours: no third node closer to both.
        if (list.some((k) => k !== list[i] && k !== list[j] && Math.max(d(list[i], k), d(list[j], k)) < dij)) continue;
        join(list[i], list[j], tier, tier === 0 && list[i].kind === 'hall' && list[j].kind === 'hall');
        parent.set(root(list[i].id), root(list[j].id));
      }
    }
    // Join what is left apart, by the shortest links, if not too long.
    for (let pass = 0; pass < list.length; pass++) {
      let best: [DeepNode, DeepNode, number] | null = null;
      for (const p of list) {
        for (const q of list) {
          if (root(p.id) === root(q.id)) continue;
          const dd = d(p, q);
          if (dd < max * 1.8 && (!best || dd < best[2])) best = [p, q, dd];
        }
      }
      if (!best) break;
      join(best[0], best[1], tier, false);
      parent.set(root(best[0].id), root(best[1].id));
    }
  }
  // Each part of the lower deep is reached by a great shaft from the nearest cavern above.
  for (const lo of nodes.filter((n) => n.tier === 1)) {
    let best: DeepNode | null = null, bd = Infinity;
    for (const up of nodes) {
      if (up.tier !== 0) continue;
      const dd = distKm(lo.lon, lo.lat, up.lon, up.lat);
      if (dd < bd) {
        bd = dd;
        best = up;
      }
    }
    if (best && bd < 900) join(best, lo, 2, false);
  }

  // ---- Ways in from the surface -------------------------------------------------------------------
  const re = rng('entrances');
  const nearest = (lo: number, la: number, km: number) => {
    let best: DeepNode | null = null, bd = km;
    for (const n of nodes) {
      if (n.tier !== 0) continue;
      const dd = distKm(lo, la, n.lon, n.lat);
      if (dd < bd) {
        bd = dd;
        best = n;
      }
    }
    return best;
  };
  const inWay = (kind: DeepEntrance['kind'], lo: number, la: number, node: DeepNode, named: Named, road: boolean, sid?: string) => {
    const e = entrances.length;
    entrances.push({ kind, lon: lo, lat: la, node: node.id, name: named.name, en: named.en, ...(sid ? { sid } : {}) });
    const pa = [lo, la], pb = unwrap(pa, [node.lon, node.lat]);
    tunnels.push({ a: node.id, b: -1, tier: 0, road, entrance: e, km: distKm(lo, la, node.lon, node.lat), pts: meander(pa, pb, road ? 0.06 : 0.15) });
  };
  for (const s of settlements) {
    if (!s.delve) continue;
    const n = nearest(s.lon, s.lat, 450);
    if (!n) continue;
    s.deepTo = { name: n.name, en: n.en };
    inWay('delve', s.lon, s.lat, n, { name: s.name ?? '', en: s.nameEn ?? s.name ?? '' }, true, s.id);
  }
  for (const v of vents) {
    if (v.activity === 0 || re() > 0.6) continue;
    const n = nearest(v.lon, v.lat, 350);
    if (n) inWay('vent', v.lon, v.lat, n, { name: v.name, en: v.en ?? v.name }, false);
  }
  // Sinkholes: a way down near caverns that have none, on land away from the towns.
  const towns = settlements.filter((s) => s.tier !== 'village');
  let nSink = 0;
  for (const n of nodes) {
    if (n.tier !== 0 || entrances.some((e) => e.node === n.id) || re() > 0.55) continue;
    for (let t = 0; t < 12; t++) {
      const a = re() * Math.PI * 2, d = 30 + 110 * re();
      const lo = n.lon + (Math.cos(a) * d) / (111.2 * Math.max(0.1, Math.cos((n.lat * Math.PI) / 180))), la = n.lat + (Math.sin(a) * d) / 111.2;
      const c = cellAt(lo, la);
      if (!land(c) || (f.biome[c] as Biome) === Biome.IceSheet || f.special[c] === 3) continue;
      if (towns.some((s) => distKm(s.lon, s.lat, lo, la) < 20)) continue;
      const nm = bank.featureNamed('sinkhole', f.culture[c] ?? 0, `sink${nSink++}`);
      inWay('sinkhole', lo, la, n, nm, false);
      labels.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lo, la] }, properties: { kind: 'sinkhole', name: nm.name, ...(nm.en !== nm.name ? { en: nm.en } : {}), rank: 2, minz: 6.2, maxz: 13 } } as LabelFeature);
      break;
    }
  }
  // The deep roads take the name of a hall they serve.
  let nRoad = 0;
  for (const t of tunnels) {
    if (!t.road || t.tier !== 0) continue;
    const hall = nodes[t.a].kind === 'hall' ? nodes[t.a] : t.b >= 0 && nodes[t.b].kind === 'hall' ? nodes[t.b] : nodes[t.a];
    const nm = bank.featureNamed('deepRoad', hall.culture, `road${nRoad++}`);
    t.name = nm.name;
    if (nm.en !== nm.name) t.en = nm.en;
  }
  return { world: { nodes, tunnels, entrances }, labels };
}
