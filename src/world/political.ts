import { addProtocol } from 'maplibre-gl';
import type { Politics, PolUnit } from '../gen/politics';

/**
 * The political overlay: raster tiles (protocol `politics://gen/z/x/y`) washing each independent
 * realm in its own colour, with neighbouring realms always in different colours. Zoomed out the
 * wash is one flat colour per realm; from zoom 5 the duchies show as lighter and darker shades of
 * it, and from zoom 8 the counties. Edges between realms are washed more strongly, as on a
 * hand-coloured atlas. Colours are blended between grid cells, so the edges are soft rather than
 * stepped; the map fades the overlay out as you zoom in (see `POLITICAL_LAYERS`).
 *
 * Tiles are drawn on the main thread from the political grid (at most 1024 × 512), which is fast:
 * a few milliseconds a tile.
 */

/** Watercolour hues that stand out on parchment and on the map's greens and tans. */
const PALETTE: [number, number, number][] = [
  // No greens or yellows: they vanish into the map's own meadows and deserts.
  [204, 92, 100], [226, 136, 64], [140, 98, 186], [76, 120, 200], [52, 150, 164], [188, 86, 162],
  [172, 80, 52], [98, 96, 176], [234, 124, 108], [124, 66, 124], [86, 168, 212], [214, 146, 36],
];

interface Prepared {
  gen: number;
  W: number;
  H: number;
  /** Independent realm per cell, or -1. */
  realm: Int32Array;
  baronyOf: Int32Array;
  units: PolUnit[];
  /** Colour per cell for each detail band (realm, duchy, county): RGB, and edge strength 0..1. */
  bands: { rgb: Uint8Array; edge: Float32Array }[];
}

let current: Prepared | null = null;

/** The independent realm a barony belongs to (leagues aside). */
function realmOf(units: PolUnit[], b: number): PolUnit {
  let u = units[b];
  while (u.parent >= 0) u = units[u.parent];
  return u;
}

/** The unit of a given level in a barony's chain (or the deepest above it if the chain skips it). */
function unitAt(units: PolUnit[], b: number, level: number): PolUnit {
  let u = units[b];
  while (u.parent >= 0 && u.level < level) u = units[u.parent];
  return u;
}

const hash = (n: number) => {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

/** Assigns realm colours (neighbours differ) and precomputes the cell colours for the overlay. */
export function preparePolitical(gen: number, p: Politics): void {
  const { W, H, baronyOf, units } = p;
  const N = W * H;
  const realm = new Int32Array(N).fill(-1);
  const realmCache = new Map<number, number>();
  for (let c = 0; c < N; c++) {
    const b = baronyOf[c];
    if (b < 0) continue;
    let r = realmCache.get(b);
    if (r === undefined) realmCache.set(b, (r = realmOf(units, b).id));
    realm[c] = r;
  }
  // Realm adjacency (8 neighbours, wrapping east–west).
  const adj = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    if (a < 0 || b < 0 || a === b) return;
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
  };
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const c = j * W + i;
      link(realm[c], realm[j * W + ((i + 1) % W)]);
      if (j + 1 < H) {
        link(realm[c], realm[c + W]);
        link(realm[c], realm[(j + 1) * W + ((i + 1) % W)]);
      }
    }
  }
  // Greedy colouring, largest realms first; members of one league lean to neighbouring hues of one family.
  const colour = new Map<number, number>();
  const tops = units.filter((u) => u.parent < 0 && u.gov !== 'league').sort((a, b) => b.areaKm2 - a.areaKm2);
  const dist = (a: number, b: number) => Math.hypot(...PALETTE[a].map((v, q) => v - PALETTE[b][q]));
  for (const u of tops) {
    const near = [...(adj.get(u.id) ?? [])].map((v) => colour.get(v)).filter((v): v is number => v !== undefined);
    // The colour furthest from every neighbour's (league members start from their league's hue).
    const start = Math.floor(hash(u.league >= 0 ? u.league : u.id * 7 + 3) * PALETTE.length);
    let best = start, bd = -1;
    for (let k = 0; k < PALETTE.length; k++) {
      const c = (start + k) % PALETTE.length;
      const d = near.length ? Math.min(...near.map((n) => dist(c, n))) : 999;
      // League members prefer their league's hue while it stays clear of neighbours.
      const score = d + (u.league >= 0 && k === 0 && d > 90 ? 200 : 0);
      if (score > bd) {
        bd = score;
        best = c;
      }
    }
    colour.set(u.id, best);
  }
  const bands = [0, 2, 1].map((level) => {
    const rgb = new Uint8Array(N * 3);
    const edge = new Float32Array(N);
    const shadeOf = new Map<number, number>();
    const owner = new Int32Array(N).fill(-1);
    for (let c = 0; c < N; c++) {
      const b = baronyOf[c];
      if (b < 0) continue;
      const r = realm[c];
      const base = PALETTE[colour.get(r) ?? 0];
      let shade = 0;
      if (level > 0) {
        // Duchies (or counties) as lighter and darker shades of the realm's colour.
        const sub = unitAt(units, b, level);
        owner[c] = sub.id;
        let s = shadeOf.get(sub.id);
        if (s === undefined) shadeOf.set(sub.id, (s = sub.id === r ? 0 : (Math.floor(hash(sub.id) * 5) - 2) * (level === 2 ? 0.11 : 0.07)));
        shade = s;
      } else owner[c] = r;
      for (let q = 0; q < 3; q++) {
        const v = base[q];
        rgb[c * 3 + q] = Math.max(0, Math.min(255, shade >= 0 ? v + (255 - v) * shade : v * (1 + shade)));
      }
    }
    // Edges: cells next to another realm (strong) or, in the detailed bands, another subdivision (light).
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const c = j * W + i;
        if (realm[c] < 0) continue;
        let e = 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const jj = j + dj;
          if (jj < 0 || jj >= H) continue;
          const n = jj * W + ((i + di + W) % W);
          if (realm[n] >= 0 && realm[n] !== realm[c]) e = 1;
          else if (e < 0.45 && owner[n] >= 0 && owner[n] !== owner[c]) e = 0.45;
        }
        edge[c] = e;
      }
    }
    return { rgb, edge };
  });
  current = { gen, W, H, bands, realm, baronyOf, units };
}

let registered = false;

/** Registers the `politics://` tile protocol (once). */
export function registerPoliticalProtocol(): void {
  if (registered) return;
  registered = true;
  addProtocol('politics', async (params) => {
    const m = /^politics:\/\/(\d+)\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) throw new Error(`Bad politics tile URL: ${params.url}`);
    return { data: await renderTile(current, +m[1], +m[2], +m[3], +m[4]) };
  });
}

const SIZE = 256;

async function renderTile(P: { gen: number; W: number; H: number; bands: { rgb: Uint8Array; edge: Float32Array }[] } | null, gen: number, z: number, x: number, y: number): Promise<ImageBitmap> {
  const img = new ImageData(SIZE, SIZE);
  if (P && P.gen === gen) {
    const band = P.bands[Math.min(P.bands.length - 1, z < 5 ? 0 : z < 8 ? 1 : 2)];
    const { W, H } = P;
    const n = 2 ** z;
    const d = img.data;
    const lonPx: number[] = [];
    for (let i = 0; i < SIZE; i++) lonPx.push((((x + (i + 0.5) / SIZE) / n) * 360 - 180 + 180) / 360 * W - 0.5);
    for (let j = 0; j < SIZE; j++) {
      // Web Mercator row to latitude.
      const yy = Math.PI * (1 - (2 * (y + (j + 0.5) / SIZE)) / n);
      const lat = (Math.atan(Math.sinh(yy)) * 180) / Math.PI;
      const fy = ((90 - lat) / 180) * H - 0.5;
      const j0 = Math.max(0, Math.min(H - 1, Math.floor(fy))), j1 = Math.min(H - 1, j0 + 1), ty = Math.max(0, Math.min(1, fy - j0));
      for (let i = 0; i < SIZE; i++) {
        const fx = lonPx[i];
        const i0f = Math.floor(fx), tx = fx - i0f;
        const i0 = ((i0f % W) + W) % W, i1 = (i0 + 1) % W;
        // Bilinear blend of the four cells, weighting out unclaimed ones (premultiplied by coverage).
        let r = 0, g = 0, b = 0, a = 0, e = 0;
        const cells = [j0 * W + i0, j0 * W + i1, j1 * W + i0, j1 * W + i1];
        const ws = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
        for (let k = 0; k < 4; k++) {
          const c = cells[k], w = ws[k];
          if (band.rgb[c * 3] === 0 && band.rgb[c * 3 + 1] === 0 && band.rgb[c * 3 + 2] === 0) continue;
          r += band.rgb[c * 3] * w;
          g += band.rgb[c * 3 + 1] * w;
          b += band.rgb[c * 3 + 2] * w;
          e += band.edge[c] * w;
          a += w;
        }
        if (a <= 0) continue;
        const o = (j * SIZE + i) * 4;
        d[o] = r / a;
        d[o + 1] = g / a;
        d[o + 2] = b / a;
        // Coverage fades the wash out at the edge of claimed land; realm edges are washed deeper.
        d[o + 3] = Math.round(255 * Math.min(1, a) * (0.62 + 0.38 * Math.min(1, e / a)));
      }
    }
  }
  return createImageBitmap(img);
}

// ---- Relations of an open realm -----------------------------------------------------------------

/** Tints for a realm's relations: RGB and alpha. */
export const REL_TINT: Record<string, [number, number, number, number]> = {
  self: [214, 160, 30, 0.42], realm: [214, 160, 30, 0.16], league: [60, 120, 200, 0.34], alliance: [52, 104, 196, 0.38], friendly: [96, 150, 210, 0.2],
  truce: [130, 130, 130, 0.22], rival: [226, 128, 36, 0.36], war: [196, 36, 30, 0.46],
};

interface RelPrepared {
  gen: number;
  ver: number;
  rgba: Uint8Array;
  /** War hatching weight and edge strength per cell. */
  hatch: Uint8Array;
  edge: Uint8Array;
}
let rel: RelPrepared | null = null;
let relVer = 0;

/**
 * Colours the map for an open realm: its own lands gold (the rest of its realm, for a vassal,
 * paler gold), allies blue, friends pale blue, rivals orange, enemies at war red and hatched.
 * Returns the version for the tile URL, or -1 when nothing is to be shown.
 */
export function setRelations(gen: number, sel: { unit: number; top: number; rel: Map<number, string> } | null): number {
  const P = current;
  if (!P || P.gen !== gen || !sel) {
    rel = null;
    return -1;
  }
  const { W, H, realm, baronyOf, units } = P;
  const N = W * H;
  // Baronies within the selected unit.
  const inSel = new Map<number, boolean>();
  const within = (b: number) => {
    let v = inSel.get(b);
    if (v === undefined) {
      v = false;
      for (let u: PolUnit | null = units[b]; u; u = u.parent >= 0 ? units[u.parent] : null) {
        if (u.id === sel.unit || u.league === sel.unit) {
          v = true;
          break;
        }
      }
      inSel.set(b, v);
    }
    return v;
  };
  const kind = new Uint8Array(N);
  const KINDS = ['', 'self', 'realm', 'league', 'alliance', 'friendly', 'truce', 'rival', 'war'];
  const code = (k: string) => Math.max(0, KINDS.indexOf(k));
  for (let c = 0; c < N; c++) {
    const r = realm[c];
    if (r < 0) continue;
    if (within(baronyOf[c])) kind[c] = 1;
    else if (r === sel.top) kind[c] = 2;
    else {
      const k = sel.rel.get(r);
      if (k && k !== 'neutral') kind[c] = code(k);
    }
  }
  const rgba = new Uint8Array(N * 4), hatch = new Uint8Array(N), edge = new Uint8Array(N);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const c = j * W + i, k = kind[c];
      if (!k) continue;
      const t = REL_TINT[KINDS[k]];
      rgba.set([t[0], t[1], t[2], Math.round(t[3] * 255)], c * 4);
      if (k === 8) hatch[c] = 255;
      // Edge of the group (another kind next door).
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const jj = j + dj;
        if (jj < 0 || jj >= H) continue;
        const n = jj * W + ((i + di + W) % W);
        if (kind[n] !== k && (k === 1 || realm[n] !== realm[c])) {
          edge[c] = 255;
          break;
        }
      }
    }
  }
  rel = { gen, ver: ++relVer, rgba, hatch, edge };
  return rel.ver;
}

let relRegistered = false;
/** Registers the `relations://` tile protocol (once). */
export function registerRelationsProtocol(): void {
  if (relRegistered) return;
  relRegistered = true;
  addProtocol('relations', async (params) => {
    const m = /^relations:\/\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) throw new Error(`Bad relations tile URL: ${params.url}`);
    return { data: await renderRelTile(+m[1], +m[2], +m[3], +m[4], +m[5]) };
  });
}

async function renderRelTile(gen: number, ver: number, z: number, x: number, y: number): Promise<ImageBitmap> {
  const img = new ImageData(SIZE, SIZE);
  const P = current, R = rel;
  if (P && R && P.gen === gen && R.gen === gen && R.ver === ver) {
    const { W, H } = P;
    const n = 2 ** z;
    const d = img.data;
    const lonPx: number[] = [];
    for (let i = 0; i < SIZE; i++) lonPx.push((((x + (i + 0.5) / SIZE) / n) * 360) / 360 * W - 0.5);
    for (let j = 0; j < SIZE; j++) {
      const yy = Math.PI * (1 - (2 * (y + (j + 0.5) / SIZE)) / n);
      const lat = (Math.atan(Math.sinh(yy)) * 180) / Math.PI;
      const fy = ((90 - lat) / 180) * H - 0.5;
      const j0 = Math.max(0, Math.min(H - 1, Math.floor(fy))), j1 = Math.min(H - 1, j0 + 1), ty = Math.max(0, Math.min(1, fy - j0));
      for (let i = 0; i < SIZE; i++) {
        const fx = lonPx[i];
        const i0f = Math.floor(fx), tx = fx - i0f;
        const i0 = ((i0f % W) + W) % W, i1 = (i0 + 1) % W;
        const cells = [j0 * W + i0, j0 * W + i1, j1 * W + i0, j1 * W + i1];
        const ws = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
        let r = 0, g = 0, b = 0, a = 0, cov = 0, h = 0, e = 0;
        for (let k = 0; k < 4; k++) {
          const c = cells[k], w = ws[k];
          const ca = R.rgba[c * 4 + 3];
          if (!ca) continue;
          r += R.rgba[c * 4] * w;
          g += R.rgba[c * 4 + 1] * w;
          b += R.rgba[c * 4 + 2] * w;
          a += ca * w;
          h += R.hatch[c] * w;
          e += R.edge[c] * w;
          cov += w;
        }
        if (cov <= 0) continue;
        const o = (j * SIZE + i) * 4;
        // Hatching in screen space for wars; edges drawn deeper.
        const hatchOn = h / cov > 128 && (i + j) % 9 < 3;
        const alpha = (a / cov) * Math.min(1, cov * 1.4) * (1 + 0.9 * (e / cov / 255)) + (hatchOn ? 70 : 0);
        d[o] = r / cov;
        d[o + 1] = g / cov;
        d[o + 2] = b / cov;
        d[o + 3] = Math.min(235, Math.round(alpha));
      }
    }
  }
  return createImageBitmap(img);
}

// ---- Faiths, cultures and races ----------------------------------------------------------------

type GroupMap = { gen: number; W: number; H: number; bands: { rgb: Uint8Array; edge: Float32Array }[] };
export type GroupKey = 'faiths' | 'cultures' | 'races';
const groupMaps: Record<GroupKey, GroupMap | null> = { faiths: null, cultures: null, races: null };

/**
 * A map of groups (faiths, cultures or races): each barony washed in the colour of its group
 * (neighbouring groups in different colours, or the colours `fixed` gives), from zoom 5 with
 * lighter and darker shades for sub-groups (sects, or the peoples of a race), and deeper edges
 * between groups. `of` gives a barony's group and sub-group (0 for none). Returns each group's colour.
 */
export function prepareGroupMap(key: GroupKey, gen: number, of: (barony: number) => [number, number] | null, fixed?: (id: number) => [number, number, number]): Map<number, [number, number, number]> {
  const out = prepareBands(gen, of, fixed, (m) => (groupMaps[key] = m));
  return out;
}
/** The faith map (see `prepareGroupMap`). */
export function prepareFaithMap(gen: number, of: (barony: number) => [number, number] | null): Map<number, [number, number, number]> {
  return prepareGroupMap('faiths', gen, of);
}

function prepareBands(gen: number, of: (barony: number) => [number, number] | null, fixed: ((id: number) => [number, number, number]) | undefined, store: (m: GroupMap) => void): Map<number, [number, number, number]> {
  const P = current;
  const out = new Map<number, [number, number, number]>();
  if (!P || P.gen !== gen) return out;
  const { W, H, baronyOf } = P;
  const N = W * H;
  const faith = new Int32Array(N).fill(-1), sect = new Int32Array(N).fill(-1);
  const cache = new Map<number, [number, number] | null>();
  for (let c = 0; c < N; c++) {
    const b = baronyOf[c];
    if (b < 0) continue;
    let v = cache.get(b);
    if (v === undefined) cache.set(b, (v = of(b)));
    if (!v) continue;
    faith[c] = v[0];
    sect[c] = v[0] * 1000 + v[1];
  }
  // Faith adjacency and size, for colouring.
  const adj = new Map<number, Set<number>>();
  const size = new Map<number, number>();
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const c = j * W + i, a = faith[c];
      if (a < 0) continue;
      size.set(a, (size.get(a) ?? 0) + 1);
      for (const n of [j * W + ((i + 1) % W), j + 1 < H ? c + W : -1]) {
        const b = n >= 0 ? faith[n] : -1;
        if (b < 0 || b === a) continue;
        (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
        (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
      }
    }
  }
  const dist = (a: number, b: number) => Math.hypot(...PALETTE[a].map((v, q) => v - PALETTE[b][q]));
  const colour = new Map<number, number>();
  const used = new Map<number, number>();
  const pal: [number, number, number][] = [...PALETTE];
  for (const f of [...size.keys()].sort((a, b) => size.get(b)! - size.get(a)!)) {
    if (fixed) {
      colour.set(f, pal.length);
      pal.push(fixed(f));
      out.set(f, fixed(f));
      continue;
    }
    const near = [...(adj.get(f) ?? [])].map((v) => colour.get(v)).filter((v): v is number => v !== undefined);
    let best = 0, bd = -Infinity;
    for (let k = 0; k < PALETTE.length; k++) {
      const d = (near.length ? Math.min(...near.map((n) => dist(k, n))) : 999) - 60 * (used.get(k) ?? 0);
      if (d > bd) {
        bd = d;
        best = k;
      }
    }
    colour.set(f, best);
    used.set(best, (used.get(best) ?? 0) + 1);
    out.set(f, PALETTE[best]);
  }
  const bands = [false, true].map((sects) => {
    const rgb = new Uint8Array(N * 3), edge = new Float32Array(N);
    const shade = new Map<number, number>();
    for (let c = 0; c < N; c++) {
      if (faith[c] < 0) continue;
      const base = pal[colour.get(faith[c]) ?? 0];
      let sh = 0;
      if (sects && sect[c] % 1000 > 0) {
        let v = shade.get(sect[c]);
        if (v === undefined) shade.set(sect[c], (v = ((sect[c] % 1000) % 2 ? 1 : -1) * (0.14 + 0.08 * hash(sect[c]))));
        sh = v;
      }
      for (let q = 0; q < 3; q++) rgb[c * 3 + q] = Math.max(1, Math.min(255, sh >= 0 ? base[q] + (255 - base[q]) * sh : base[q] * (1 + sh)));
    }
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const c = j * W + i;
        if (faith[c] < 0) continue;
        let e = 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const jj = j + dj;
          if (jj < 0 || jj >= H) continue;
          const n = jj * W + ((i + di + W) % W);
          if (faith[n] >= 0 && faith[n] !== faith[c]) e = 1;
          else if (sects && e < 0.45 && sect[n] >= 0 && sect[n] !== sect[c]) e = 0.45;
        }
        edge[c] = e;
      }
    }
    return { rgb, edge };
  });
  store({ gen, W, H, bands });
  return out;
}

let faithRegistered = false;
/** Registers the `faiths://`, `cultures://` and `races://` tile protocols (once). */
export function registerFaithProtocol(): void {
  if (faithRegistered) return;
  faithRegistered = true;
  for (const key of Object.keys(groupMaps) as GroupKey[]) {
    addProtocol(key, async (params) => {
      const m = new RegExp(`^${key}://(\\d+)/(\\d+)/(\\d+)/(\\d+)`).exec(params.url);
      if (!m) throw new Error(`Bad ${key} tile URL: ${params.url}`);
      return { data: await renderTile(groupMaps[key], +m[1], +m[2], +m[3], +m[4]) };
    });
  }
}
