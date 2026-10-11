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
  current = { gen, W, H, bands };
}

let registered = false;

/** Registers the `politics://` tile protocol (once). */
export function registerPoliticalProtocol(): void {
  if (registered) return;
  registered = true;
  addProtocol('politics', async (params) => {
    const m = /^politics:\/\/(\d+)\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) throw new Error(`Bad politics tile URL: ${params.url}`);
    return { data: await renderTile(+m[1], +m[2], +m[3], +m[4]) };
  });
}

const SIZE = 256;

async function renderTile(gen: number, z: number, x: number, y: number): Promise<ImageBitmap> {
  const img = new ImageData(SIZE, SIZE);
  const P = current;
  if (P && P.gen === gen) {
    const band = P.bands[z < 5 ? 0 : z < 8 ? 1 : 2];
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
