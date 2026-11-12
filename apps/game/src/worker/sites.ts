/**
 * Settlements as places to arrive at and visit (docs/design/navigation.md, Cities and towns):
 * their gates (where the roads come in), their places of note (the market, inns, temples,
 * guildhalls, the keep, shops, the docks), and their plans drawn as images for the travel map
 * and the city view. Runs in the world worker.
 */
import type { Settlement } from '@worldforge/core/gen/settlements';
import { LocalFrame, type PlanFeature } from '@worldforge/core/towns/plan';
import type { TownManager } from '@worldforge/core/towns/manager';
import type { PlanImage, SiteInfo, SitePlace, PlaceKind, Gate } from './protocol';

type Pt = [number, number];
const INK = '#3f3126';

// ---- Finding a settlement ------------------------------------------------------------------------

/** Settlements seen by id (cities and towns from the world; villages as the travel map meets them). */
const known = new Map<string, Settlement>();

export function rememberSites(list: Settlement[]): void {
  for (const s of list) known.set(s.id, s);
}

export function findSite(towns: TownManager, id: string, lon?: number, lat?: number): Settlement | undefined {
  const k = known.get(id);
  if (k) return k;
  if (lon === undefined || lat === undefined) return undefined;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const v = towns.blockAt(Math.floor(lon) + dx, Math.floor(lat) + dy).villages.find((x) => x.id === id);
    if (v) {
      known.set(id, v);
      return v;
    }
  }
  return undefined;
}

export function forgetSites(): void {
  known.clear();
  plans.clear();
}

/** Plans made lately (a city's takes a moment to make), the most recent last. */
const plans = new Map<string, PlanFeature[]>();

/** A settlement's plan, kept for a while. */
export function planOf(towns: TownManager, s: Settlement): PlanFeature[] {
  let f = plans.get(s.id);
  if (f) {
    plans.delete(s.id);
    plans.set(s.id, f);
    return f;
  }
  f = towns.planOf(s);
  plans.set(s.id, f);
  if (plans.size > 24) plans.delete(plans.keys().next().value!);
  return f;
}

// ---- Gates ---------------------------------------------------------------------------------------

function segX(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
}

const lineOf = (f: PlanFeature, fr: LocalFrame): Pt[] => (f.geometry.type === 'LineString' ? f.geometry.coordinates.map((c) => fr.fromLL(c[0], c[1]) as Pt) : []);

/**
 * Where the roads come in: each road's crossing of the outermost town wall (a gate), or, without
 * walls, where it meets the edge of the built-up core. Just outside, so the party stands clear.
 */
export function gatesOf(s: Settlement, feats: PlanFeature[]): Gate[] {
  const fr = new LocalFrame(s.lon, s.lat);
  const walls = feats.filter((f) => f.properties.kind === 'wall').map((f) => lineOf(f, fr));
  const roads = feats.filter((f) => f.properties.kind === 'road');
  const out: Gate[] = [];
  const R = Math.max(40, s.coreM ?? s.radiusM * 0.4);
  for (const rf of roads) {
    const line = lineOf(rf, fr);
    let best: Pt | null = null, bd = -1;
    for (let i = 1; i < line.length; i++) {
      for (const w of walls) for (let j = 1; j < w.length; j++) {
        const x = segX(line[i - 1], line[i], w[j - 1], w[j]);
        const d = x ? Math.hypot(x[0], x[1]) : -1;
        if (x && d > bd) {
          bd = d;
          best = x;
        }
      }
    }
    const walled = !!best;
    if (!best) {
      // The first point along the road (from outside) within the core.
      for (let i = line.length - 1; i > 0; i--) {
        const a = line[i], b = line[i - 1];
        const da = Math.hypot(a[0], a[1]), db = Math.hypot(b[0], b[1]);
        if (da >= R && db < R) {
          const t = (da - R) / (da - db);
          best = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          break;
        }
        if (da < R && db >= R) {
          const t = (R - da) / (db - da);
          best = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          break;
        }
      }
    }
    if (!best) continue;
    // Step a few metres outward.
    const d = Math.hypot(best[0], best[1]) || 1;
    const p: Pt = [best[0] * (1 + 8 / d), best[1] * (1 + 8 / d)];
    if (out.some((g) => Math.hypot(g.x - p[0], g.y - p[1]) < 40)) continue;
    const road = String(rf.properties.name ?? '');
    const name = walled ? (road ? `the ${/\bRoad\b/.test(road) ? road.replace(/\bRoad\b/, 'Gate') : `${road} Gate`}` : 'a gate') : road ? `the ${road}` : 'the edge of the settlement';
    // Two ways in under one name (a road through two walls): the outer one only.
    if (out.some((g) => g.name === name)) continue;
    const ll = fr.toLL(p);
    out.push({ name, road, lon: ll[0], lat: ll[1], x: p[0], y: p[1], walled });
  }
  if (!out.length) {
    // No roads: the south edge of the core.
    const ll = fr.toLL([0, -R - 8]);
    out.push({ name: 'the edge of the settlement', road: '', lon: ll[0], lat: ll[1], x: 0, y: -R - 8, walled: false });
  }
  return out;
}

// ---- Places of note ------------------------------------------------------------------------------

const ROLE_KIND: Record<string, PlaceKind> = {
  inn: 'inn', tavern: 'tavern', temple: 'temple', shrine: 'temple', keep: 'keep', townhall: 'civic', hall: 'civic', library: 'civic', prison: 'civic', bathhouse: 'civic',
  barracks: 'civic', university: 'civic', college: 'civic', countinghouse: 'civic', guildhall: 'guild', magetower: 'guild',
  apothecary: 'shop', butcher: 'shop', bakery: 'shop', smithy: 'shop', tailor: 'shop', pawnshop: 'shop', store: 'shop', stables: 'shop', foundry: 'shop', winepress: 'shop', witch: 'shop',
};

const ABOUT: Partial<Record<PlaceKind, string>> = {
  gate: 'A way in and out of the town.', market: 'Stalls, traders and the crowd.', inn: 'Rooms, meals and travellers\' news.', tavern: 'Drink, talk and company.',
  temple: 'A house of the faith.', keep: 'The seat of the lord and the garrison.', civic: 'A building of the town.', guild: 'A guild or an order of the town.',
  shop: 'A workshop or a shop.', dock: 'Piers, boats and the waterfront.', district: 'A part of the town of its own.',
};

/** The places of note in a settlement's plan, and its quarters. */
export function siteInfo(s: Settlement, feats: PlanFeature[]): SiteInfo {
  const quarters = feats.filter((f) => f.properties.kind === 'qlabel' && f.geometry.type === 'Point').map((f) => {
    const c = (f.geometry as { coordinates: number[] }).coordinates;
    return { name: String(f.properties.name), lon: c[0], lat: c[1] };
  });
  const quarterOf = (lon: number, lat: number) => {
    let best = '', bd = Infinity;
    for (const q of quarters) {
      const d = Math.hypot(q.lon - lon, q.lat - lat);
      if (d < bd) {
        bd = d;
        best = q.name;
      }
    }
    return best;
  };
  const places: SitePlace[] = [];
  let n = 0;
  const add = (kind: PlaceKind, name: string, lon: number, lat: number, role?: string) => {
    name = name ? name[0].toUpperCase() + name.slice(1) : name;
    if (places.some((p) => p.name === name && Math.hypot(p.lon - lon, p.lat - lat) < 0.0005)) return;
    places.push({ id: `${s.id}/p${n++}`, kind, name, lon, lat, quarter: quarterOf(lon, lat), about: ABOUT[kind] ?? '', ...(role ? { role } : {}) });
  };
  for (const g of gatesOf(s, feats)) add('gate', g.walled ? g.name.replace(/^the /, 'The ') : `${g.name.replace(/^the /, 'The ')} (the way in)`, g.lon, g.lat);
  for (const f of feats) {
    if (f.geometry.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates;
    const k = f.properties.kind;
    if (k === 'dlabel') {
      const nm = String(f.properties.name);
      const kind: PlaceKind = /market/i.test(nm) ? 'market' : /keep|castle|citadel/i.test(nm) ? 'keep' : 'district';
      add(kind, nm[0].toUpperCase() + nm.slice(1), lon, lat);
    } else if (k === 'blabel') {
      const role = String(f.properties.role ?? '');
      const kind = ROLE_KIND[role] ?? (role.startsWith('guild:') || role.startsWith('order:') ? 'guild' : 'civic');
      add(kind, String(f.properties.name), lon, lat, role);
    }
  }
  // Buildings with a part to play but no label of their own (temples, the keep, shops).
  for (const f of feats) {
    if (f.properties.kind !== 'building' || f.geometry.type !== 'Polygon' || f.properties.label) continue;
    const role = String(f.properties.role ?? f.properties.use ?? '');
    const kind = ROLE_KIND[role];
    if (!kind || role === 'barracks') continue;
    const ring = f.geometry.coordinates[0];
    const lon = ring.reduce((a, c) => a + c[0], 0) / ring.length, lat = ring.reduce((a, c) => a + c[1], 0) / ring.length;
    const word = role === 'temple' ? 'Temple' : role === 'keep' ? 'The keep' : role[0].toUpperCase() + role.slice(1);
    add(kind, word, lon, lat, role);
  }
  // The waterfront.
  const piers = feats.filter((f) => f.properties.kind === 'pier' && f.geometry.type === 'Polygon');
  if (piers.length) {
    let lon = 0, lat = 0;
    for (const p of piers) {
      const c = (p.geometry as { coordinates: number[][][] }).coordinates[0][0];
      lon += c[0];
      lat += c[1];
    }
    add('dock', 'The docks', lon / piers.length, lat / piers.length);
  }
  return {
    id: s.id, name: s.name ?? s.id, tier: s.tier, population: s.population, lon: s.lon, lat: s.lat,
    coreM: s.coreM ?? 0, radiusM: s.radiusM, walls: !!s.walls, quarters, places,
  };
}

// ---- Drawing a plan ------------------------------------------------------------------------------

const FILL: Record<string, string> = {
  yard: '#d3cba6', field: '#dcd6a4', vineyard: '#d3d39c', plaza: '#f4ecd9', square: '#e2d5b4', green: '#cfd8a4', graveyard: '#c3c9a0',
  mound: '#bfca93', bridge: '#d8ccb0', ruin: '#d9cfba', trodden: '#d8caa4', garden: '#bcc68a', spoil: '#c0b9a8', pier: '#b39167',
  boat: '#8d6b47', logs: '#a57d52', mine: INK, wagon: '#9b7a52', tent: '#ece0c2', platform: '#b8956a', canopy: '#7f9a5c', trunk: '#7a5c40',
  horse: '#7a5c40', grave: '#a8a291', millwheel: '#8d6b47', pyramid: '#c9b58c',
};
const OUTLINED = new Set(['field', 'yard', 'square', 'graveyard', 'mound', 'bridge', 'pier', 'boat', 'logs', 'wagon', 'tent', 'platform', 'garden']);
const STALL = ['#d6b48a', '#c98f6b', '#b4b07a', '#9fb0bf'];
const ROLE_FILL: Record<string, string> = {
  inn: '#c9a283', tavern: '#c9a283', apothecary: '#bdb38a', witch: '#a7a07c', townhall: '#b8a689', guildhall: '#b8a689', library: '#b8a689', winepress: '#b89a8a',
  university: '#b29c86', college: '#b29c86', barracks: '#b3a38f', magetower: '#a99bb3', countinghouse: '#c2a978', foundry: '#a8978a', shrine: '#bba27c',
};
const USE_FILL: Record<string, string> = { temple: '#b6a383', keep: '#a8957a', mill: '#bfa986', witch: '#a7a07c' };
const ROAD_W: Record<string, number> = { major: 9, minor: 7, track: 4 };

const WATER = [169, 195, 204], SHORE = [143, 131, 112];

/** The sea, lakes and rivers about a settlement, laid down before its plan. */
function drawWater(g: OffscreenCanvasRenderingContext2D, towns: TownManager, fr: LocalFrame, radius: number, size: number, stepM: number): void {
  const n = Math.ceil((2 * radius) / stepM) + 1;
  const img = new ImageData(n, n);
  const S = towns.sampler;
  let any = false;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const [lon, lat] = fr.toLL([-radius + i * stepM, radius - j * stepM]);
    const hh = S.height(lon, lat, 0.004);
    let wet = hh <= 0;
    if (!wet) {
      const rb = S.riverBank(lon, lat, 60);
      wet = !!rb && rb.bankM < 0;
    }
    if (!wet && hh < 40) wet = S.isWater(lon, lat, hh);
    if (!wet) continue;
    any = true;
    const o = (j * n + i) * 4;
    img.data[o] = WATER[0];
    img.data[o + 1] = WATER[1];
    img.data[o + 2] = WATER[2];
    img.data[o + 3] = 255;
  }
  if (!any) return;
  const small = new OffscreenCanvas(n, n);
  small.getContext('2d')!.putImageData(img, 0, 0);
  const k = size / ((2 * radius) / stepM);
  g.save();
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  // A darker rim first, a little larger, for the shore.
  g.globalAlpha = 0.5;
  g.filter = `drop-shadow(0 0 ${Math.max(1, k * 0.4)}px rgb(${SHORE.join(',')}))`;
  g.drawImage(small, -k / 2, -k / 2, n * k, n * k);
  g.filter = 'none';
  g.globalAlpha = 1;
  g.drawImage(small, -k / 2, -k / 2, n * k, n * k);
  g.restore();
}

export interface DrawOpts {
  /** Metres per pixel. */
  mpp: number;
  /** Radius drawn about the centre (m). */
  radius: number;
  illustrated: boolean;
}

/** A settlement's plan drawn as an image (the game keeps it, app/worker-client.ts). */
export function planImage(s: Settlement, towns: TownManager, o: DrawOpts): PlanImage {
  const feats = planOf(towns, s);
  const ill = o.illustrated ? towns.illustratedPlan(s, feats) : [];
  const fr = new LocalFrame(s.lon, s.lat);
  const size = Math.min(4096, Math.ceil((2 * o.radius) / o.mpp));
  const mpp = (2 * o.radius) / size;
  const cv = new OffscreenCanvas(size, size);
  const g = cv.getContext('2d')!;
  const px = (lon: number, lat: number): Pt => {
    const p = fr.fromLL(lon, lat);
    return [(p[0] + o.radius) / mpp, (o.radius - p[1]) / mpp];
  };
  const ring = (r: number[][]) => {
    for (let i = 0; i < r.length; i++) {
      const [x, y] = px(r[i][0], r[i][1]);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.closePath();
  };
  const poly = (f: PlanFeature, fill: string, stroke?: string) => {
    if (f.geometry.type !== 'Polygon') return;
    g.beginPath();
    for (const r of f.geometry.coordinates) ring(r);
    g.fillStyle = fill;
    g.fill('evenodd');
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = Math.max(0.5, 0.5 / mpp);
      g.stroke();
    }
  };
  const line = (f: PlanFeature, colour: string, widthM: number, dash?: number[]) => {
    if (f.geometry.type !== 'LineString') return;
    g.beginPath();
    f.geometry.coordinates.forEach((c, i) => {
      const [x, y] = px(c[0], c[1]);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.strokeStyle = colour;
    g.lineWidth = Math.max(0.8, widthM / mpp);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.setLineDash(dash ? dash.map((d) => d / mpp) : []);
    g.stroke();
    g.setLineDash([]);
  };
  const dot = (f: PlanFeature, fill: string, rM: number, stroke?: string) => {
    if (f.geometry.type !== 'Point') return;
    const [x, y] = px(f.geometry.coordinates[0], f.geometry.coordinates[1]);
    g.beginPath();
    g.arc(x, y, Math.max(0.8, rM / mpp), 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    if (stroke && rM / mpp > 1.5) {
      g.strokeStyle = stroke;
      g.lineWidth = 0.6;
      g.stroke();
    }
  };
  const by = (k: string) => feats.filter((f) => f.properties.kind === k);

  // Water first: the sea, lakes and rivers as the local map has them (the same detail sampler,
  // local/chunk.ts), sampled on a coarse grid and smoothed as it is drawn.
  drawWater(g, towns, fr, o.radius, size, Math.max(4, Math.min(12, mpp * 3)));

  // Ground: paving, yards, fields, squares and the rest, then the ways.
  for (const f of by('paving')) poly(f, f.properties.surface === 'dirt' ? '#d9c9a2' : '#ddd3bb');
  for (const k of ['yard', 'field', 'vineyard', 'plaza', 'square', 'green', 'graveyard', 'mound', 'ruin', 'trodden', 'garden', 'spoil']) {
    for (const f of by(k)) poly(f, k === 'yard' && f.properties.surface === 'garden' ? '#cfd3a2' : FILL[k], OUTLINED.has(k) ? '#b9ab86' : undefined);
  }
  if (mpp < 2.5) for (const f of by('furrow')) line(f, '#c2b385', 0.4);
  for (const f of by('hedge')) line(f, '#86a064', 2.2, [1.2, 1.6]);
  for (const f of by('canal')) line(f, '#8f8370', Number(f.properties.w ?? 6) + 1.2);
  for (const f of by('canal')) line(f, '#a9c3cc', Number(f.properties.w ?? 6));
  for (const f of by('ditch')) line(f, '#a29d78', Number(f.properties.w ?? 3));
  for (const f of by('bridge')) poly(f, FILL.bridge, INK);
  const ways = feats.filter((f) => f.properties.kind === 'road' || f.properties.kind === 'street');
  const wayW = (f: PlanFeature) => (f.properties.kind === 'street' ? Number(f.properties.w ?? 6) : ROAD_W[String(f.properties.cls)] ?? 6);
  for (const f of ways) line(f, '#b9a984', wayW(f) + 2);
  for (const f of ways) line(f, '#f1e7cd', wayW(f));
  for (const k of ['pier', 'boat', 'logs', 'mine', 'platform', 'canopy', 'trunk', 'millwheel', 'pyramid']) for (const f of by(k)) poly(f, FILL[k], OUTLINED.has(k) ? INK : undefined);
  for (const f of feats) {
    const k = String(f.properties.kind);
    if (k === 'stall') poly(f, STALL[Number(f.properties.tone ?? 0) % 4], INK);
    else if (k === 'tent' || k === 'wagon') poly(f, f.properties.big ? '#c9a46e' : FILL[k], INK);
  }
  if (mpp < 3) for (const k of ['horse', 'grave']) for (const f of by(k)) poly(f, FILL[k]);

  if (ill.length) {
    // The illustrated style: shadows, the footprints, then every face in the order given.
    g.globalAlpha = 0.15;
    for (const f of ill) if (f.properties.kind === 'ills') poly(f, INK);
    g.globalAlpha = 1;
    for (const f of by('building')) poly(f, '#cdbd9c');
    for (const f of ill) if (f.properties.kind === 'ill' && !(f.properties.fig && mpp > 0.6)) poly(f, String(f.properties.c));
  } else {
    for (const f of by('building')) {
      const role = String(f.properties.role ?? ''), use = String(f.properties.use ?? '');
      poly(f, ROLE_FILL[role] ?? (f.properties.burrow ? '#a5b47a' : USE_FILL[use] ?? (role ? '#c6b08e' : '#cdbd9c')), INK);
    }
    for (const f of by('wall')) line(f, INK, Math.max(2, Number(f.properties.w ?? 1.2) * 2));
    for (const f of by('tower')) dot(f, INK, Number(f.properties.r ?? 3));
    if (mpp < 4) for (const f of by('tree')) dot(f, '#97ad72', Number(f.properties.r ?? 2), INK);
  }
  for (const f of feats) if (f.properties.kind === 'well' || f.properties.kind === 'fountain') dot(f, '#9fbfcc', 1.5, INK);

  // Fade out toward the edge of the circle drawn, so the square's edge never shows (the sea
  // and the country simply give way to the map beneath).
  g.globalCompositeOperation = 'destination-in';
  const grad = g.createRadialGradient(size / 2, size / 2, size * 0.42, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'source-over';
  const bitmap = cv.transferToImageBitmap();
  const sw = fr.toLL([-o.radius, -o.radius]), ne = fr.toLL([o.radius, o.radius]);
  return { id: s.id, bitmap, west: sw[0], south: sw[1], east: ne[0], north: ne[1] };
}
