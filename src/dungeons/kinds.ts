import { mulberry32, type Rng } from '../gen/rng';
import {
  CHANNEL, CELL_M, type DLevel, type DoorKind, type DRoom, type Dungeon, type DungeonSite, FLOOR, GROUND, type LinkStyle, type Rect, RUBBLE, VOID, WATER,
  at, carveCircle, carveCorridor, carveRect, centre, connectAll, doorsForRooms, newLevel, open, overlaps, pick, pickW, roomOf, scatterRooms, set,
} from './core';
import { writeKey } from './key';

/** Number of levels from the tags ("3 levels"), else the kind's default. */
export function dungeonLevels(site: DungeonSite): number {
  for (const t of site.tags) {
    const m = /^(\d) (levels|floors)$/.exec(t);
    if (m) return Math.max(1, Math.min(6, +m[1]));
  }
  return 1;
}

const cache = new Map<string, Dungeon>();

export function dungeon(site: DungeonSite): Dungeon {
  const key = `${site.id}:${site.seed}`;
  let d = cache.get(key);
  if (!d) {
    d = build(site);
    cache.set(key, d);
    if (cache.size > 30) cache.delete(cache.keys().next().value!);
  }
  return d;
}

function build(site: DungeonSite): Dungeon {
  const rnd = mulberry32(site.seed ^ 0xd06e0);
  const n = dungeonLevels(site);
  let levels: DLevel[];
  switch (site.kind) {
    case 'tower': levels = tower(site, rnd, n); break;
    case 'mine': levels = stack(n, rnd, (k, anchors) => mineLevel(site, rnd, k, anchors), 'shaft'); break;
    case 'catacomb': levels = stack(n, rnd, (k, anchors) => catacombLevel(site, rnd, k, anchors), 'stairs'); break;
    case 'sewer': levels = stack(n, rnd, (k, anchors) => k === 0 ? sewerLevel(site, rnd) : vaultLevel(site, rnd, k, anchors, 'Cistern level', Math.round(64 * Math.max(1, Math.min(3, site.scale ?? 1))), Math.round(48 * Math.max(1, Math.min(3, site.scale ?? 1)))), 'ladder'); break;
    case 'ruin': levels = stack(n, rnd, (k, anchors) => k === 0 ? ruinLevel(site, rnd) : vaultLevel(site, rnd, k, anchors, 'Cellars', 40, 30), 'stairs'); break;
    default: levels = stack(n, rnd, (k, anchors) => cryptLevel(site, rnd, k, anchors), 'stairs'); break;
  }
  // Rooms are numbered through the whole dungeon, level by level.
  let num = 1;
  for (const L of levels) for (const r of L.rooms) if (r.n) r.n = num++;
  const d: Dungeon = { site, title: site.name, hook: '', levels };
  writeKey(d, mulberry32(site.seed ^ 0x6e7));
  return d;
}

/**
 * Builds levels top down; each level's ways down (in rooms far from the way in) become the
 * anchors the next level must open a room around, so the ways line up.
 */
function stack(n: number, rnd: Rng, level: (k: number, anchors: [number, number][]) => DLevel, style: LinkStyle): DLevel[] {
  const out: DLevel[] = [];
  let anchors: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const L = level(k, anchors);
    for (const [x, y] of anchors) L.links.push({ x, y, dir: 'up', to: k - 1, style });
    if (k + 1 < n) {
      const from = L.entrances[0] ?? (anchors[0] ? { x: anchors[0][0], y: anchors[0][1] } : { x: L.W / 2, y: L.H / 2 });
      const cands = L.rooms.filter((r) => r.n && r.w >= 3 && r.h >= 3 && r.x >= 3 && r.y >= 3 && r.x + r.w <= L.W - 3 && r.y + r.h <= L.H - 3 && !r.tags.includes('outfall') && !anchors.some(([x, y]) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h))
        .sort((a, b) => Math.hypot(b.lx - from.x, b.ly - from.y) - Math.hypot(a.lx - from.x, a.ly - from.y));
      const r = cands[0] ?? L.rooms[0];
      // An open, dry cell in the room near a random spot of its middle.
      const want: [number, number] = [r.x + 1 + Math.floor(rnd() * Math.max(1, r.w - 2)), r.y + 1 + Math.floor(rnd() * Math.max(1, r.h - 2))];
      let p: [number, number] = want, bd = Infinity;
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (at(L, x, y) !== FLOOR) continue;
          const d = Math.hypot(x - want[0], y - want[1]);
          if (d < bd) {
            bd = d;
            p = [x, y];
          }
        }
      }
      // Keep it clear of props.
      L.props = L.props.filter((q) => Math.hypot(q.x - (p[0] + 0.5), q.y - (p[1] + 0.5)) > 1.2);
      L.links.push({ x: p[0], y: p[1], dir: 'down', to: k + 1, style });
      r.tags.push(`down:${style}`);
      anchors = [p];
    }
    out.push(L);
  }
  return out;
}

/** Rooms scattered, joined by corridors, with anchor rooms opened around the ways from above. */
function roomsAndCorridors(
  L: DLevel, rnd: Rng, o: { n: number; size: [number, number]; anchors: [number, number][]; margin?: number; corridorW?: number; hFirst?: () => boolean },
): Rect[] {
  const rects: Rect[] = o.anchors.map(([x, y]) => {
    const w = 3 + Math.floor(rnd() * 3), h = 3 + Math.floor(rnd() * 3);
    return { x: Math.max(2, Math.min(L.W - w - 2, x - Math.floor(w / 2))), y: Math.max(2, Math.min(L.H - h - 2, y - Math.floor(h / 2))), w, h };
  });
  for (const r of scatterRooms(L.W, L.H, o.n * 3, rnd, o.size, o.margin ?? 2)) {
    if (rects.length >= o.n + o.anchors.length) break;
    if (rects.every((q) => !overlaps(q, r, o.margin ?? 2))) rects.push(r);
  }
  for (const r of rects) carveRect(L, r.x, r.y, r.w, r.h);
  // Anchors clamped away from the edge still open onto their room.
  o.anchors.forEach(([x, y], k) => carveCorridor(L, x, y, ...centre(rects[k]), rnd() < 0.5));
  const pts = rects.map(centre);
  for (const [a, b] of connectAll(pts, rnd, 0.25)) {
    carveCorridor(L, pts[a][0], pts[a][1], pts[b][0], pts[b][1], o.hFirst ? o.hFirst() : rnd() < 0.5, o.corridorW ?? 1);
  }
  return rects;
}

/** An entrance: a corridor from the nearest room out to the map edge on the given side. */
function entrance(L: DLevel, rects: Rect[], side: number, w = 1): void {
  const edgeD = (r: Rect) => [r.y, L.W - (r.x + r.w), L.H - (r.y + r.h), r.x][side];
  const r = rects.reduce((a, b) => (edgeD(b) < edgeD(a) ? b : a));
  const [cx, cy] = centre(r);
  const out: [number, number] = side === 0 ? [cx, 0] : side === 1 ? [L.W - 1, cy] : side === 2 ? [cx, L.H - 1] : [0, cy];
  carveCorridor(L, cx, cy, out[0], out[1], side % 2 === 1, w);
  L.entrances.push({ x: out[0], y: out[1], dir: [Math.PI / 2, Math.PI, -Math.PI / 2, 0][side] });
}

const doorPick = (rnd: Rng, w: [DoorKind, number][]) => () => pickW(rnd, w);

// ---- Crypts -------------------------------------------------------------------------------------

function cryptLevel(site: DungeonSite, rnd: Rng, k: number, anchors: [number, number][]): DLevel {
  const large = site.tags.includes('large');
  const W = large ? 40 : 32, H = large ? 30 : 26;
  const L = newLevel(k === 0 ? 'Upper crypt' : k === 1 ? 'Lower crypt' : `Lower crypt ${k}`, W, H);
  // Symmetric about the north–south axis: build the west half and mirror it.
  const half = Math.floor(W / 2);
  const rects: Rect[] = [];
  const n = (large ? 6 : 4) + Math.floor(rnd() * 2);
  // A central hall on the axis.
  const hall: Rect = { x: half - 2 - Math.floor(rnd() * 2), y: Math.floor(H / 2) - 3, w: 0, h: 5 + Math.floor(rnd() * 3) };
  hall.w = 2 * (half - hall.x);
  rects.push(hall);
  for (const r of scatterRooms(half - 1, H, n * 3, rnd, [3, 6], 2)) {
    if (rects.length > n) break;
    const m: Rect = { x: W - r.x - r.w, y: r.y, w: r.w, h: r.h };
    if (rects.every((q) => !overlaps(q, r, 2) && !overlaps(q, m, 2)) && !overlaps(r, m, 2)) rects.push(r, m);
  }
  // Anchor rooms (ways from above), unmirrored.
  for (const [x, y] of anchors) {
    const r: Rect = { x: Math.max(2, Math.min(W - 6, x - 2)), y: Math.max(2, Math.min(H - 6, y - 2)), w: 4, h: 4 };
    rects.push(r);
  }
  for (const r of rects) carveRect(L, r.x, r.y, r.w, r.h);
  const pts = rects.map(centre);
  for (const [a, b] of connectAll(pts, rnd, 0.15)) {
    const hf = rnd() < 0.5;
    carveCorridor(L, pts[a][0], pts[a][1], pts[b][0], pts[b][1], hf);
    // Mirror the corridor too, so the halves match.
    carveCorridor(L, W - 1 - pts[a][0], pts[a][1], W - 1 - pts[b][0], pts[b][1], hf);
  }
  if (k === 0) {
    // The way in: a straight passage from the south up the axis to the hall.
    carveCorridor(L, half, hall.y + hall.h, half, H - 1, false, 1);
    carveCorridor(L, half - 1, hall.y + hall.h, half - 1, H - 1, false, 1);
    L.entrances.push({ x: half, y: H - 1, dir: -Math.PI / 2 });
  }
  doorsForRooms(L, rects, rnd, doorPick(rnd, [['door', 4], ['arch', 3], ['locked', 1.2], ['secret', 0.5], ['portcullis', 0.5]]));
  // Rooms: the hall with pillars and an altar or statue, burial vaults with sarcophagi, ossuaries, chapels.
  rects.forEach((r, i) => {
    const room = roomOf(r, 1);
    if (i === 0) {
      room.tags.push('hall');
      for (let x = r.x + 1; x < r.x + r.w - 1; x += 2) {
        if (r.h >= 5) {
          L.props.push({ kind: 'pillar', x: x + 0.5, y: r.y + 1.5 }, { kind: 'pillar', x: x + 0.5, y: r.y + r.h - 1.5 });
        }
      }
      L.props.push({ kind: k === 0 ? 'statue' : 'altar', x: r.x + r.w / 2, y: r.y + 1, w: 2, h: 1 });
    } else {
      const kind = pickW(rnd, [['vault', 4], ['ossuary', 2], ['chapel', 1], ['treasury', 0.6], ['guard', 1]] as [string, number][]);
      room.tags.push(kind);
      if (kind === 'vault') {
        const vertical = r.h > r.w;
        const count = Math.max(1, Math.floor((vertical ? r.h : r.w) / 2));
        for (let q = 0; q < count; q++) {
          const t = (q + 0.5) / count;
          L.props.push(vertical
            ? { kind: 'sarcophagus', x: r.x + r.w / 2, y: r.y + t * r.h, a: 0, w: Math.min(1.6, r.w - 1), h: 0.8 }
            : { kind: 'sarcophagus', x: r.x + t * r.w, y: r.y + r.h / 2, a: Math.PI / 2, w: Math.min(1.6, r.h - 1), h: 0.8 });
        }
      } else if (kind === 'ossuary') {
        for (let x = r.x; x < r.x + r.w; x++) L.props.push({ kind: 'skull', x: x + 0.5, y: r.y + 0.35 }, { kind: 'skull', x: x + 0.5, y: r.y + r.h - 0.35 });
        L.props.push({ kind: 'bones', x: r.x + r.w / 2, y: r.y + r.h / 2 });
      } else if (kind === 'chapel') L.props.push({ kind: 'altar', x: r.x + r.w / 2, y: r.y + 0.8, w: 2, h: 1 }, { kind: 'brazier', x: r.x + 0.8, y: r.y + 0.8 }, { kind: 'brazier', x: r.x + r.w - 0.8, y: r.y + 0.8 });
      else if (kind === 'treasury') L.props.push({ kind: 'chest', x: r.x + r.w / 2, y: r.y + r.h / 2 }, { kind: 'urn', x: r.x + 0.6, y: r.y + 0.6 });
      else L.props.push({ kind: 'table', x: r.x + r.w / 2, y: r.y + r.h / 2, w: 1.6, h: 0.9 });
    }
    L.rooms.push(room);
  });
  // Burial niches along the corridors.
  niches(L, rnd, 0.25);
  return L;
}

/** Niches (loculi) cut into corridor walls: a prop on a wall cell beside a corridor cell. */
function niches(L: DLevel, rnd: Rng, chance: number): void {
  for (let y = 1; y < L.H - 1; y++) {
    for (let x = 1; x < L.W - 1; x++) {
      if (at(L, x, y) !== FLOOR || L.rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (at(L, x + dx, y + dy) !== VOID || rnd() > chance) continue;
        // Only where the corridor runs past (both cells along the wall are floor or wall alike).
        L.props.push({ kind: 'niche', x: x + 0.5 + dx * 0.7, y: y + 0.5 + dy * 0.7, a: Math.atan2(dy, dx) });
      }
    }
  }
}

// ---- Catacombs ----------------------------------------------------------------------------------

function catacombLevel(site: DungeonSite, rnd: Rng, k: number, anchors: [number, number][]): DLevel {
  const W = 42, H = 32;
  const L = newLevel(k === 0 ? 'Upper galleries' : k === 1 ? 'Deep galleries' : `Deep galleries ${k}`, W, H);
  // A maze of narrow galleries on a 4-cell lattice (randomised depth-first, with extra openings).
  const S = 4, nx = Math.floor((W - 2) / S), ny = Math.floor((H - 2) / S);
  const node = (i: number, j: number): [number, number] => [1 + i * S + 1, 1 + j * S + 1];
  const seen = new Uint8Array(nx * ny);
  const stackN = [Math.floor(rnd() * nx * ny)];
  seen[stackN[0]] = 1;
  while (stackN.length) {
    const c = stackN[stackN.length - 1], i = c % nx, j = (c / nx) | 0;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [i + a, j + b]).filter(([a, b]) => a >= 0 && b >= 0 && a < nx && b < ny && !seen[b * nx + a]);
    if (!nb.length) {
      stackN.pop();
      continue;
    }
    const [a, b] = pick(rnd, nb);
    seen[b * nx + a] = 1;
    const p = node(i, j), q = node(a, b);
    carveCorridor(L, p[0], p[1], q[0], q[1], true);
    stackN.push(b * nx + a);
  }
  for (let t = 0; t < nx * ny * 0.25; t++) {
    const i = Math.floor(rnd() * (nx - 1)), j = Math.floor(rnd() * (ny - 1));
    const p = node(i, j), q = rnd() < 0.5 ? node(i + 1, j) : node(i, j + 1);
    carveCorridor(L, p[0], p[1], q[0], q[1], true);
  }
  // Chambers at some nodes: ossuaries, burial chapels, a few dead-end crypts.
  const rects: Rect[] = [];
  const nCh = 5 + Math.floor(rnd() * 4);
  const nodes: [number, number][] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) nodes.push(node(i, j));
  for (const [x, y] of anchors) nodes.unshift([x, y]);
  for (const [x, y] of anchors) {
    // The way down from above always opens into a chamber, joined to the nearest gallery node.
    const r: Rect = { x: Math.max(1, Math.min(W - 4, x - 1)), y: Math.max(1, Math.min(H - 4, y - 1)), w: 3, h: 3 };
    carveRect(L, r.x, r.y, r.w, r.h);
    const nn = nodes.slice(anchors.length).reduce((a, b) => (Math.hypot(b[0] - x, b[1] - y) < Math.hypot(a[0] - x, a[1] - y) ? b : a));
    carveCorridor(L, x, y, nn[0], nn[1], rnd() < 0.5);
    rects.push(r);
  }
  for (const [x, y] of nodes.slice(anchors.length).sort(() => rnd() - 0.5)) {
    if (rects.length >= nCh + anchors.length) break;
    const big = rnd() < 0.35;
    const r: Rect = { x: x - (big ? 2 : 1), y: y - (big ? 2 : 1), w: big ? 5 : 3, h: big ? 5 : 3 };
    if (r.x < 1 || r.y < 1 || r.x + r.w > W - 1 || r.y + r.h > H - 1 || rects.some((q) => overlaps(q, r, 1))) continue;
    rects.push(r);
    carveRect(L, r.x, r.y, r.w, r.h);
  }
  if (k === 0) {
    const r = rects.reduce((a, b) => (b.y < a.y ? b : a));
    const [cx] = centre(r);
    carveCorridor(L, cx, r.y, cx, 0, false);
    L.entrances.push({ x: cx, y: 0, dir: Math.PI / 2 });
  }
  doorsForRooms(L, rects, rnd, doorPick(rnd, [['arch', 5], ['door', 2], ['bars', 1], ['secret', 0.3]]));
  for (const r of rects) {
    const room = roomOf(r, 1, [pickW(rnd, [['ossuary', 4], ['chapel', 1.5], ['vault', 2], ['shrine', 1]] as [string, number][])]);
    if (room.tags[0] === 'ossuary') {
      for (let x = r.x; x < r.x + r.w; x++) L.props.push({ kind: 'skull', x: x + 0.5, y: r.y + 0.35 }, { kind: 'skull', x: x + 0.5, y: r.y + r.h - 0.35 });
      L.props.push({ kind: 'bones', x: r.x + r.w / 2, y: r.y + r.h / 2 });
    } else if (room.tags[0] === 'vault') L.props.push({ kind: 'sarcophagus', x: r.x + r.w / 2, y: r.y + r.h / 2, a: rnd() < 0.5 ? 0 : Math.PI / 2, w: 1.6, h: 0.8 });
    else if (room.tags[0] === 'chapel') L.props.push({ kind: 'altar', x: r.x + r.w / 2, y: r.y + 0.8, w: 1.6, h: 0.8 }, { kind: 'brazier', x: r.x + 0.7, y: r.y + r.h - 0.7 });
    else L.props.push({ kind: 'statue', x: r.x + r.w / 2, y: r.y + r.h / 2 });
    L.rooms.push(room);
  }
  // Galleries lined with burial niches, many holding bones.
  niches(L, rnd, 0.55);
  for (const p of L.props) if (p.kind === 'niche' && rnd() < 0.15) L.props.push({ kind: 'skull', x: p.x, y: p.y });
  return L;
}

// ---- Mines ---------------------------------------------------------------------------------------

function mineLevel(site: DungeonSite, rnd: Rng, k: number, anchors: [number, number][]): DLevel {
  const W = 46, H = 34;
  const L = newLevel(k === 0 ? 'Adit level' : `Level ${k + 1}`, W, H);
  // Galleries: a main drift across the level, cross-cuts off it, and stopes (worked-out chambers).
  const y0 = 8 + Math.floor(rnd() * (H - 16));
  const start: [number, number] = k === 0 ? [0, y0] : anchors[0] ?? [Math.floor(W / 2), y0];
  const mainEnd: [number, number] = [W - 4 - Math.floor(rnd() * 6), Math.max(4, Math.min(H - 5, y0 + Math.floor((rnd() - 0.5) * 14)))];
  const drift = wanderPath(start, mainEnd, rnd);
  for (const [x, y] of drift) carveRect(L, x, y, 2, 2);
  L.rails.push(drift.map(([x, y]) => [x + 1, y + 1]));
  if (k === 0) L.entrances.push({ x: 0, y: y0, dir: 0 });
  const rects: Rect[] = [];
  const cuts = 4 + Math.floor(rnd() * 4);
  for (let c = 0; c < cuts; c++) {
    const from = drift[Math.floor((0.15 + 0.8 * rnd()) * drift.length)];
    const to: [number, number] = [Math.max(3, Math.min(W - 4, from[0] + Math.floor((rnd() - 0.5) * 18))), rnd() < 0.5 ? 3 + Math.floor(rnd() * 5) : H - 4 - Math.floor(rnd() * 5)];
    const path = wanderPath(from, to, rnd);
    for (const [x, y] of path) set(L, x, y, at(L, x, y) || FLOOR);
    // A stope at the end of most cross-cuts.
    if (rnd() < 0.8) {
      const r = 2 + rnd() * 2.2;
      carveCircle(L, to[0] + 0.5, to[1] + 0.5, r);
      carveCircle(L, to[0] + 0.5 + (rnd() - 0.5) * 3, to[1] + 0.5 + (rnd() - 0.5) * 3, r * 0.7);
      const box = { x: Math.floor(to[0] - r), y: Math.floor(to[1] - r), w: Math.ceil(2 * r), h: Math.ceil(2 * r) };
      // Stopes that run together are one chamber in the key.
      if (rects.every((q) => !overlaps(q, box, 0))) rects.push(box);
    }
  }
  for (const [x, y] of anchors) {
    carveCircle(L, x + 0.5, y + 0.5, 2.6);
    rects.push({ x: x - 2, y: y - 2, w: 5, h: 5 });
    const near = drift.reduce((a, b) => (Math.hypot(b[0] - x, b[1] - y) < Math.hypot(a[0] - x, a[1] - y) ? b : a));
    for (const [px, py] of wanderPath([x, y], near, rnd)) set(L, px, py, at(L, px, py) || FLOOR);
  }
  // Timber supports along the drift, ore showing in the stope walls, a cart or two on the rails.
  for (let q = 3; q < drift.length - 1; q += 4) {
    const [x, y] = drift[q], [x2, y2] = drift[q + 1];
    L.props.push({ kind: 'support', x: x + 1, y: y + 1, a: Math.atan2(y2 - y, x2 - x) + Math.PI / 2, w: 2.2 });
  }
  L.props.push({ kind: 'cart', x: drift[Math.floor(drift.length * (0.3 + 0.4 * rnd()))][0] + 1, y: drift[Math.floor(drift.length * 0.5)][1] + 1, a: 0 });
  for (const r of rects) {
    const room = roomOf(r, 1, [pickW(rnd, [['stope', 4], ['ore', 2], ['flooded', site.tags.includes('wet') ? 2 : 0.4], ['camp', 1], ['collapse', 1]] as [string, number][])]);
    if (room.tags[0] === 'ore' || room.tags[0] === 'stope') {
      for (let q = 0; q < 6; q++) {
        const a = rnd() * Math.PI * 2, d = Math.min(r.w, r.h) * 0.45;
        L.props.push({ kind: 'ore', x: r.x + r.w / 2 + Math.cos(a) * d, y: r.y + r.h / 2 + Math.sin(a) * d });
      }
    } else if (room.tags[0] === 'flooded') {
      for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) if (at(L, x, y) === FLOOR && rnd() < 0.7) set(L, x, y, WATER);
    } else if (room.tags[0] === 'camp') L.props.push({ kind: 'crate', x: r.x + r.w / 2, y: r.y + r.h / 2 }, { kind: 'barrel', x: r.x + r.w / 2 + 1, y: r.y + r.h / 2 });
    else for (let q = 0; q < 6; q++) L.props.push({ kind: 'rubble', x: r.x + rnd() * r.w, y: r.y + rnd() * r.h });
    room.lx = r.x + r.w / 2;
    room.ly = r.y + r.h / 2;
    L.rooms.push(room);
  }
  // The anchors' rooms keep their ways clear of water.
  for (const [x, y] of anchors) for (let j = y - 1; j <= y + 1; j++) for (let i = x - 1; i <= x + 1; i++) if (at(L, i, j) === WATER) set(L, i, j, FLOOR);
  return L;
}

/** A wandering 4-connected path of cells from a to b (one axis step at a time, with the odd sideways jog). */
function wanderPath(a: [number, number], b: [number, number], rnd: Rng): [number, number][] {
  const out: [number, number][] = [];
  let [x, y] = a;
  out.push([x, y]);
  for (let guard = 0; guard < 600 && (x !== b[0] || y !== b[1]); guard++) {
    const dx = Math.sign(b[0] - x), dy = Math.sign(b[1] - y);
    const r = rnd();
    if (r > 0.92) {
      // A jog across the line of travel.
      if (dx && !dy) y += rnd() < 0.5 ? 1 : -1;
      else if (dy && !dx) x += rnd() < 0.5 ? 1 : -1;
      else if (dx) x += dx;
    } else if (dx && (!dy || r < 0.55)) x += dx;
    else if (dy) y += dy;
    out.push([x, y]);
  }
  return out;
}

// ---- Towers ---------------------------------------------------------------------------------------

function tower(site: DungeonSite, rnd: Rng, n: number): DLevel[] {
  const r = site.tags.includes('large') ? 7 : site.tags.includes('small') ? 4.5 : 5.5;
  const S = Math.ceil(2 * r) + 6;
  const c = S / 2;
  const floors = Math.max(2, n);
  const cellar = rnd() < 0.5;
  const names: string[] = [...(cellar ? ['Cellar'] : []), 'Ground floor', ...Array.from({ length: floors - 1 }, (_, k) => (k === floors - 2 ? 'Top floor' : `Floor ${k + 2}`)), 'Roof'];
  // The spiral stair keeps its place through every floor.
  const sa = rnd() * Math.PI * 2;
  const sx = Math.floor(c + Math.cos(sa) * (r - 1.6)), sy = Math.floor(c + Math.sin(sa) * (r - 1.6));
  const uses = ['guard', 'store', 'hall', 'library', 'study', 'bedchamber', 'laboratory', 'armoury', 'chapel'];
  const out: DLevel[] = [];
  names.forEach((name, k) => {
    const roof = name === 'Roof';
    const L = newLevel(name, S, S, roof);
    L.round = { cx: c, cy: c, r };
    carveCircle(L, c, c, r);
    if (!roof) {
      // One or two partitions along grid lines, avoiding the stair; a door in each.
      const parts = r >= 5.5 && rnd() < 0.75 ? (rnd() < 0.5 ? 2 : 1) : rnd() < 0.5 ? 1 : 0;
      const vertical = rnd() < 0.5;
      const lines: number[] = [];
      for (let p = 0; p < parts; p++) {
        let g = Math.round(c + (p === 0 ? (parts === 2 ? -1 : 1) : 1) * (parts === 2 ? r * 0.35 : rnd() < 0.5 ? r * 0.25 : -r * 0.25));
        // Clear of the stair (centred on its cell) by a cell and a half.
        const sc = (vertical ? sx : sy) + 0.5;
        if (Math.abs(g - sc) < 1.6) g = Math.round(sc + Math.sign(g - sc || 1) * 2.5);
        if (!lines.includes(g)) lines.push(g);
      }
      for (const g of lines) {
        // The chord across the circle at this grid line.
        const d = Math.abs(g - c), half = Math.sqrt(Math.max(0, r * r - d * d));
        if (vertical) L.walls.push([g, c - half, g, c + half]);
        else L.walls.push([c - half, g, c + half, g]);
        let along = Math.floor(c - half + 1 + rnd() * Math.max(1, 2 * half - 3));
        for (let t = 0; t < 8 && Math.hypot((vertical ? g : along + 0.5) - sx - 0.5, (vertical ? along + 0.5 : g) - sy - 0.5) < 2.2; t++) {
          along = Math.floor(c - half + 1 + rnd() * Math.max(1, 2 * half - 3));
        }
        L.doors.push(vertical ? { x: g, y: along, vertical: true, kind: rnd() < 0.2 ? 'locked' : 'door' } : { x: along, y: g, vertical: false, kind: rnd() < 0.2 ? 'locked' : 'door' });
      }
      // Rooms: the spaces between partitions.
      const cuts = [Math.floor(c - r), ...lines.sort((a, b) => a - b), Math.ceil(c + r)];
      for (let q = 0; q + 1 < cuts.length; q++) {
        const a = cuts[q], b = cuts[q + 1];
        const rect: Rect = vertical ? { x: a, y: Math.floor(c - r), w: b - a, h: Math.ceil(2 * r) } : { x: Math.floor(c - r), y: a, w: Math.ceil(2 * r), h: b - a };
        const use = name === 'Cellar' ? pick(rnd, ['store', 'cistern', 'dungeon']) : name === 'Ground floor' ? pick(rnd, ['guard', 'store', 'hall']) : pick(rnd, uses);
        const room = roomOf(rect, 1, [use]);
        room.lx = vertical ? (a + b) / 2 : c;
        room.ly = vertical ? c : (a + b) / 2;
        L.rooms.push(room);
        furnish(L, rect, use, rnd, (x, y) => Math.hypot(x - c, y - c) < r - 0.9 && Math.hypot(x - sx - 0.5, y - sy - 0.5) > 1.3);
      }
      if (name === 'Ground floor') {
        // The door: through the wall on the side away from the stair.
        const a = sa + Math.PI;
        L.entrances.push({ x: c + Math.cos(a) * r, y: c + Math.sin(a) * r, dir: a + Math.PI });
      }
    } else {
      const room = roomOf({ x: Math.floor(c - r), y: Math.floor(c - r), w: Math.ceil(2 * r), h: Math.ceil(2 * r) }, 1, ['roof']);
      room.lx = c;
      room.ly = c;
      L.rooms.push(room);
      L.props.push({ kind: 'brazier', x: c, y: c });
    }
    if (k > 0) L.links.push({ x: sx, y: sy, dir: 'up', to: k - 1, style: 'spiral' });
    if (k + 1 < names.length) L.links.push({ x: sx, y: sy, dir: 'down', to: k + 1, style: 'spiral' });
    out.push(L);
  });
  // The ground floor comes first in the tabs (the cellar after it) for reading order: keep build order but
  // point "up"/"down" right: levels are listed top-down by index, so flip indices for the tower.
  for (const L of out) for (const l of L.links) l.dir = l.to < out.indexOf(L) ? 'down' : 'up';
  return out;
}

function furnish(L: DLevel, r: Rect, use: string, rnd: Rng, ok: (x: number, y: number) => boolean): void {
  const put = (kind: Parameters<typeof L.props.push>[0]['kind'], x: number, y: number, extra: object = {}) => {
    if (ok(x, y)) L.props.push({ kind, x, y, ...extra });
  };
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  switch (use) {
    case 'library': for (let x = r.x + 1; x < r.x + r.w - 1; x += 1) put('bookcase', x + 0.5, r.y + 1, { w: 1, h: 0.5 }); put('table', cx, cy, { w: 1.5, h: 0.9 }); break;
    case 'bedchamber': put('bed', cx - 1, cy, { w: 1, h: 2 }); put('chest', cx + 1, cy + 1); break;
    case 'laboratory': put('table', cx, cy, { w: 2, h: 0.9 }); put('brazier', cx + 1.5, cy - 1); put('barrel', cx - 1.5, cy + 1); break;
    case 'armoury': put('crate', cx - 1, cy); put('crate', cx + 1, cy); put('barrel', cx, cy + 1.2); break;
    case 'chapel': put('altar', cx, cy - 1, { w: 1.6, h: 0.8 }); put('brazier', cx - 1.2, cy - 1); put('brazier', cx + 1.2, cy - 1); break;
    case 'guard': put('table', cx, cy, { w: 1.5, h: 0.9 }); put('barrel', cx + 1.5, cy + 1); break;
    case 'store': case 'cistern': for (let q = 0; q < 5; q++) put(rnd() < 0.5 ? 'barrel' : 'crate', r.x + 1 + rnd() * (r.w - 2), r.y + 1 + rnd() * (r.h - 2)); break;
    case 'dungeon': put('bones', cx, cy); put('skull', cx + 0.6, cy - 0.4); break;
    case 'hall': put('table', cx, cy, { w: 2.5, h: 1 }); put('throne', cx, cy - 1.5); break;
    default: put('table', cx, cy, { w: 1.5, h: 0.9 }); put('chest', cx + 1, cy + 1);
  }
}

// ---- Ruins ---------------------------------------------------------------------------------------

function ruinLevel(site: DungeonSite, rnd: Rng): DLevel {
  const W = 40, H = 30;
  const L = newLevel('The ruins', W, H, true);
  L.t.fill(GROUND);
  // A building of a main hall and one or two wings, cut into rooms.
  const fw = 14 + Math.floor(rnd() * 8), fh = 10 + Math.floor(rnd() * 5);
  const fx = Math.floor((W - fw) / 2), fy = Math.floor((H - fh) / 2);
  const parts: Rect[] = [{ x: fx, y: fy, w: fw, h: fh }];
  if (rnd() < 0.7) parts.push({ x: fx + fw - 1, y: fy + 2 + Math.floor(rnd() * 3), w: 5 + Math.floor(rnd() * 4), h: 5 + Math.floor(rnd() * 3) });
  if (rnd() < 0.5) parts.push({ x: fx - 5, y: fy + fh - 7, w: 6, h: 6 });
  const rooms: Rect[] = [];
  const split = (r: Rect) => {
    if ((r.w < 8 && r.h < 8) || rooms.length > 8) {
      rooms.push(r);
      return;
    }
    if (r.w >= r.h) {
      const s = 3 + Math.floor(rnd() * (r.w - 6));
      split({ x: r.x, y: r.y, w: s, h: r.h });
      split({ x: r.x + s, y: r.y, w: r.w - s, h: r.h });
    } else {
      const s = 3 + Math.floor(rnd() * (r.h - 6));
      split({ x: r.x, y: r.y, w: r.w, h: s });
      split({ x: r.x, y: r.y + s, w: r.w, h: r.h - s });
    }
  };
  for (const p of parts) {
    split(p);
    carveRect(L, p.x, p.y, p.w, p.h, FLOOR);
  }
  // Walls along every room edge, then broken: gaps for doorways and collapse, rubble where they fell.
  const segs = new Map<string, [number, number, number, number]>();
  for (const r of rooms) {
    for (const s of [[r.x, r.y, r.x + r.w, r.y], [r.x, r.y + r.h, r.x + r.w, r.y + r.h], [r.x, r.y, r.x, r.y + r.h], [r.x + r.w, r.y, r.x + r.w, r.y + r.h]] as [number, number, number, number][]) {
      // Unit pieces, so shared walls are drawn once and can break piece by piece.
      const horiz = s[1] === s[3];
      const len = horiz ? s[2] - s[0] : s[3] - s[1];
      for (let q = 0; q < len; q++) {
        const piece: [number, number, number, number] = horiz ? [s[0] + q, s[1], s[0] + q + 1, s[1]] : [s[0], s[1] + q, s[0], s[1] + q + 1];
        segs.set(piece.join(','), piece);
      }
    }
  }
  const decay = 0.25 + 0.3 * rnd();
  let run = 0;
  for (const [, s] of [...segs.entries()].sort()) {
    const broken = rnd() < (run > 0 ? 0.65 : decay * 0.35);
    run = broken ? run + 1 : 0;
    if (broken) {
      if (rnd() < 0.5) L.props.push({ kind: 'rubble', x: (s[0] + s[2]) / 2 + (rnd() - 0.5), y: (s[1] + s[3]) / 2 + (rnd() - 0.5) });
      continue;
    }
    L.walls.push(s);
  }
  // Collapsed floor and rubble inside; trees and bushes outside (and a few within).
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inside = at(L, x, y) === FLOOR;
      if (inside && rnd() < 0.06) set(L, x, y, RUBBLE);
      if (!inside && rnd() < 0.035) L.props.push({ kind: rnd() < 0.5 ? 'tree' : 'bush', x: x + 0.5, y: y + 0.5 });
      if (inside && rnd() < 0.008) L.props.push({ kind: 'bush', x: x + 0.5, y: y + 0.5 });
    }
  }
  rooms.forEach((r) => {
    const room = roomOf(r, 1, [pickW(rnd, [['hall', 1], ['chamber', 3], ['kitchen', 1], ['chapel', 0.8], ['store', 1], ['court', 0.6]] as [string, number][])]);
    if (room.tags[0] === 'chapel') L.props.push({ kind: 'altar', x: r.x + r.w / 2, y: r.y + 0.8, w: 1.4, h: 0.7 });
    if (room.tags[0] === 'kitchen') L.props.push({ kind: 'well', x: r.x + r.w / 2, y: r.y + r.h / 2 });
    if (room.tags[0] === 'hall' && r.w >= 5) for (let x = r.x + 1; x < r.x + r.w - 1; x += 2) L.props.push({ kind: 'pillar', x: x + 0.5, y: r.y + 1.5 });
    L.rooms.push(room);
  });
  L.props = L.props.filter((p) => p.kind !== 'tree' || !L.rooms.some((r) => p.x > r.x - 0.5 && p.x < r.x + r.w + 0.5 && p.y > r.y - 0.5 && p.y < r.y + r.h + 0.5));
  L.entrances.push({ x: fx + Math.floor(fw / 2), y: fy + fh, dir: -Math.PI / 2 });
  void site;
  return L;
}

/** A plain vaulted level (cellars under ruins, cisterns under sewers). */
function vaultLevel(site: DungeonSite, rnd: Rng, k: number, anchors: [number, number][], name: string, W: number, H: number): DLevel {
  const L = newLevel(k > 1 ? `${name} ${k}` : name, W, H);
  const rects = roomsAndCorridors(L, rnd, { n: Math.round((4 + Math.floor(rnd() * 3)) * Math.sqrt((W * H) / 900)), size: [3, 7], anchors });
  doorsForRooms(L, rects, rnd, doorPick(rnd, [['door', 3], ['arch', 2], ['locked', 1], ['secret', 0.4]]));
  const cistern = site.kind === 'sewer';
  for (const r of rects) {
    const tag = cistern && rnd() < 0.5 ? 'cistern' : pick(rnd, ['store', 'cell', 'vault', 'den']);
    if (tag === 'cistern') {
      for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) set(L, x, y, WATER);
      for (const [x, y] of anchors) for (let j = y - 1; j <= y + 1; j++) for (let i = x - 1; i <= x + 1; i++) if (at(L, i, j) === WATER) set(L, i, j, FLOOR);
    } else furnish(L, r, tag === 'cell' ? 'dungeon' : tag === 'den' ? 'guard' : 'store', rnd, () => true);
    L.rooms.push(roomOf(r, 1, [tag]));
  }
  return L;
}

/** Douglas–Peucker on a cell polyline (tolerance in cells), rounding to whole cells. */
function simplifyCells(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1, bd = tol;
    for (let k = a + 1; k < b; k++) {
      const [x, y] = pts[k], [x0, y0] = pts[a], [x1, y1] = pts[b];
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
      const d = Math.abs((x - x0) * dy - (y - y0) * dx) / l;
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
  return pts.filter((_, k) => keep[k]);
}

// ---- Sewers --------------------------------------------------------------------------------------

function sewerLevel(site: DungeonSite, rnd: Rng): DLevel {
  // Larger under larger towns: a great city's sewers run on for hundreds of metres.
  const k = Math.max(1, Math.min(3, site.scale ?? 1));
  const W = Math.round(64 * k), H = Math.round(48 * k);
  const L = newLevel('Main sewer', W, H);
  const toCell = (p: number[]): [number, number] => [Math.round(W / 2 + p[0] / CELL_M), Math.round(H / 2 - p[1] / CELL_M)];
  // Tunnels under the streets: a water channel with a walkway either side. Each street is
  // simplified and followed in straight runs along the grid, as sewers are built.
  const seen = new Set<string>();
  const lines = (site.streets ?? []).filter((l) => {
    const k = l.map((p) => p.join(',')).join(' ');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((l) => simplifyCells(l.map(toCell), 2.5));
  const channel: [number, number][] = [];
  const isCh = new Set<string>();
  const inside = (x: number, y: number) => x >= 1 && y >= 1 && x < W - 1 && y < H - 1;
  const lay = (pts: [number, number][]) => {
    const rail: number[][] = [];
    for (const [x, y] of pts) {
      if (!inside(x, y)) {
        if (rail.length > 1) L.rails.push(rail.splice(0));
        else rail.length = 0;
        continue;
      }
      rail.push([x + 0.5, y + 0.5]);
      if (isCh.has(`${x},${y}`)) continue;
      isCh.add(`${x},${y}`);
      channel.push([x, y]);
    }
    if (rail.length > 1) L.rails.push(rail);
  };
  /** Cells of a straight-run path through the vertices (the longer leg first at each bend). */
  const runs = (line: [number, number][]) => {
    const out: [number, number][] = [];
    for (let q = 1; q < line.length; q++) {
      let [x, y] = line[q - 1];
      const [x1, y1] = line[q];
      const hFirst = Math.abs(x1 - x) >= Math.abs(y1 - y);
      const stepX = () => { while (x !== x1) { out.push([x, y]); x += Math.sign(x1 - x); } };
      const stepY = () => { while (y !== y1) { out.push([x, y]); y += Math.sign(y1 - y); } };
      if (hFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
      out.push([x, y]);
    }
    return out;
  };
  for (const line of lines) if (line.length > 1) lay(runs(line));
  if (!channel.length) {
    // No street plan to follow: a cross of tunnels.
    lay(runs([[2, Math.floor(H / 2)], [W - 3, Math.floor(H / 2)]]));
    lay(runs([[Math.floor(W / 2), 2], [Math.floor(W / 2), H - 3]]));
  }
  // Branches under the lanes: straight drains off the main tunnels, to the edge or the next tunnel.
  const nb = Math.round((3 + Math.floor(rnd() * 4)) * k * k);
  for (let t = 0; t < 60 * k * k && L.rails.length < lines.length + nb + 2; t++) {
    const [x, y] = pick(rnd, channel);
    const horiz = isCh.has(`${x - 1},${y}`) || isCh.has(`${x + 1},${y}`);
    const [dx, dy] = horiz ? [0, rnd() < 0.5 ? 1 : -1] : [rnd() < 0.5 ? 1 : -1, 0];
    if (isCh.has(`${x + dx * 2},${y + dy * 2}`) || channel.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) < 6 && (horiz ? a === x : b === y) && (a !== x || b !== y) && !isCh.has(`${a + dx},${b + dy}`) && false)) continue;
    const len = Math.round((8 + Math.floor(rnd() * 16)) * Math.sqrt(k));
    const pts: [number, number][] = [];
    let cx = x, cy = y, joined = false;
    for (let k = 0; k < len; k++) {
      cx += dx;
      cy += dy;
      if (!inside(cx, cy)) break;
      // Keep two cells of rock from parallel tunnels.
      if (k > 1 && (isCh.has(`${cx},${cy}`))) {
        joined = true;
        break;
      }
      if (k > 1 && (isCh.has(`${cx + dy},${cy + dx}`) || isCh.has(`${cx - dy},${cy - dx}`) || isCh.has(`${cx + 2 * dy},${cy + 2 * dx}`) || isCh.has(`${cx - 2 * dy},${cy - 2 * dx}`))) break;
      pts.push([cx, cy]);
    }
    if (pts.length < 5 && !joined) continue;
    lay([[x, y], ...pts]);
  }
  // The outfall: the main tunnel runs on toward the river or the sea and leaves the map there.
  let outEnd: [number, number] | null = null;
  if (site.outfall) {
    const o = toCell(site.outfall);
    const from = channel.reduce((a, b) => (Math.hypot(b[0] - o[0], b[1] - o[1]) < Math.hypot(a[0] - o[0], a[1] - o[1]) ? b : a));
    const ax = Math.abs(o[0] - from[0]) >= Math.abs(o[1] - from[1]);
    const d: [number, number] = ax ? [Math.sign(o[0] - from[0]) || 1, 0] : [0, Math.sign(o[1] - from[1]) || 1];
    const pts: [number, number][] = [from];
    let [cx, cy] = from;
    while (inside(cx + d[0], cy + d[1])) {
      cx += d[0];
      cy += d[1];
      pts.push([cx, cy]);
    }
    if (pts.length > 2) {
      lay(pts);
      outEnd = [cx, cy];
    }
  }
  for (const [x, y] of channel) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (at(L, x + i, y + j) === VOID) set(L, x + i, y + j, FLOOR);
  for (const [x, y] of channel) set(L, x, y, CHANNEL);
  // The grate (and the ladder up to the street) at the centre.
  const g = toCell([0, 0]);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (at(L, g[0] + i, g[1] + j) === VOID) set(L, g[0] + i, g[1] + j, FLOOR);
  if (at(L, g[0], g[1]) === CHANNEL) {
    // Step the ladder off the channel onto the walkway.
    for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(L, g[0] + i, g[1] + j) === FLOOR) {
      g[0] += i;
      g[1] += j;
      break;
    }
  }
  L.props.push({ kind: 'grate', x: g[0] + 0.5, y: g[1] + 0.5 });
  L.entrances.push({ x: g[0], y: g[1], dir: 0 });
  L.links.push({ x: g[0], y: g[1], dir: 'up', to: -1, style: 'ladder' });
  // The other grates from the streets, each with its ladder.
  for (const p of site.grates ?? []) {
    const q = toCell(p);
    if (q[0] < 2 || q[1] < 2 || q[0] > W - 3 || q[1] > H - 3) continue;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (at(L, q[0] + i, q[1] + j) === VOID) set(L, q[0] + i, q[1] + j, FLOOR);
    if (at(L, q[0], q[1]) === CHANNEL) {
      for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(L, q[0] + i, q[1] + j) === FLOOR) {
        q[0] += i;
        q[1] += j;
        break;
      }
    }
    L.props.push({ kind: 'grate', x: q[0] + 0.5, y: q[1] + 0.5 });
    L.links.push({ x: q[0], y: q[1], dir: 'up', to: -1, style: 'ladder' });
  }
  // Junction chambers where tunnels cross; side rooms off the walkways.
  const rects: Rect[] = [];
  const counts = new Map<string, number>();
  for (const [x, y] of channel) counts.set(`${x},${y}`, (counts.get(`${x},${y}`) ?? 0) + 1);
  for (const [x, y] of channel) {
    let n = 0;
    for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(L, x + i, y + j) === CHANNEL) n++;
    if (n >= 3 && rects.every((r) => Math.hypot(r.x + 2 - x, r.y + 2 - y) > 8)) {
      const r = { x: x - 2, y: y - 2, w: 5, h: 5 };
      rects.push(r);
      for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) if (at(L, i, j) === VOID) set(L, i, j, FLOOR);
      L.rooms.push(roomOf(r, 1, ['junction']));
    }
  }
  const side = Math.round((3 + Math.floor(rnd() * 4)) * k * k);
  const nJunction = rects.length;
  for (let t = 0; t < 200 * k * k && rects.length < side + nJunction; t++) {
    const [x, y] = pick(rnd, channel);
    const dir = pick(rnd, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
    const w = 3 + Math.floor(rnd() * 4), h = 3 + Math.floor(rnd() * 3);
    const r: Rect = { x: x + dir[0] * 4 - (dir[0] < 0 ? w : dir[0] > 0 ? 0 : Math.floor(w / 2)), y: y + dir[1] * 4 - (dir[1] < 0 ? h : dir[1] > 0 ? 0 : Math.floor(h / 2)), w, h };
    if (r.x < 1 || r.y < 1 || r.x + r.w > W - 1 || r.y + r.h > H - 1) continue;
    let clear = true;
    for (let j = r.y - 1; j <= r.y + r.h && clear; j++) for (let i = r.x - 1; i <= r.x + r.w && clear; i++) if (at(L, i, j) !== VOID) clear = false;
    if (!clear) continue;
    carveRect(L, r.x, r.y, r.w, r.h);
    const c = centre(r);
    carveCorridor(L, c[0], c[1], x + dir[0] * 2, y + dir[1] * 2, dir[0] !== 0);
    rects.push(r);
    const tag = pickW(rnd, [['cistern', 2], ['store', 1], ['den', 1.5], ['collapsed', 1], ['shrine', 0.5]] as [string, number][]);
    if (tag === 'cistern') carveRect(L, r.x + 1, r.y + 1, Math.max(1, r.w - 2), Math.max(1, r.h - 2), WATER);
    else if (tag === 'collapsed') for (let q = 0; q < 6; q++) L.props.push({ kind: 'rubble', x: r.x + rnd() * r.w, y: r.y + rnd() * r.h });
    else furnish(L, r, tag === 'den' ? 'guard' : tag === 'shrine' ? 'chapel' : 'store', rnd, () => true);
    L.rooms.push(roomOf(r, 1, [tag]));
  }
  doorsForRooms(L, rects.slice(L.rooms.filter((r) => r.tags[0] === 'junction').length), rnd, doorPick(rnd, [['door', 2], ['bars', 1.5], ['locked', 1], ['arch', 1]]));
  // The thieves' guild: hidden rooms off a quiet tunnel, behind a secret door (under most cities).
  if (rnd() < (k >= 1.5 ? 0.8 : k > 1 ? 0.35 : 0.1)) thievesDen(L, channel, g, rnd);
  // The outfall: bars where the main channel leaves the map toward the river or sea.
  if (outEnd) {
    L.rooms.push(roomOf({ x: outEnd[0] - 1, y: outEnd[1] - 1, w: 3, h: 3 }, 1, ['outfall']));
    // Bars across the tunnel just inside the edge.
    const [x, y] = outEnd;
    const horiz = isCh.has(`${x - 1},${y}`) || isCh.has(`${x + 1},${y}`);
    for (let k = -1; k <= 1; k++) L.doors.push(horiz ? { x: x === W - 2 ? x : x + 1, y: y + k, vertical: true, kind: 'bars' } : { x: x + k, y: y === H - 2 ? y : y + 1, vertical: false, kind: 'bars' });
  }
  // Number the junctions too (they are landmarks), but after the rooms.
  L.rooms.sort((a, b) => (a.tags[0] === 'junction' ? 1 : 0) - (b.tags[0] === 'junction' ? 1 : 0));
  return L;
}

/**
 * The thieves' guild's hideout: a hall, a vault and a dormitory in a row, set back from a tunnel
 * far from the main grate and reached by a short passage that ends at a secret door.
 */
function thievesDen(L: DLevel, channel: [number, number][], grate: [number, number], rnd: Rng): void {
  const far = channel.filter(([x, y]) => Math.hypot(x - grate[0], y - grate[1]) > 12);
  const hall = { w: 7, h: 5 }, vault = { w: 4, h: 5 }, dorm = { w: 5, h: 5 };
  const span = hall.w + 1 + vault.w + 1 + dorm.w;
  for (let t = 0; t < 300 && far.length; t++) {
    const [cx, cy] = pick(rnd, far);
    const east = rnd() < 0.5;
    // The hall nearest the tunnel; the passage runs 3 cells from the walkway.
    const x0 = east ? cx + 5 : cx - 4 - span;
    const y0 = cy - Math.floor(hall.h / 2);
    if (x0 < 2 || y0 < 2 || x0 + span > L.W - 2 || y0 + hall.h > L.H - 2) continue;
    let clear = true;
    for (let j = y0 - 1; j <= y0 + hall.h && clear; j++) for (let i = x0 - 1; i <= x0 + span && clear; i++) if (at(L, i, j) !== VOID) clear = false;
    if (!clear) continue;
    const order = east ? [hall, vault, dorm] : [dorm, vault, hall];
    const rects: Rect[] = [];
    let x = x0;
    for (const r of order) {
      rects.push({ x, y: y0, w: r.w, h: r.h });
      x += r.w + 1;
    }
    const [rh, rv, rd] = east ? rects : [rects[2], rects[1], rects[0]];
    for (const r of rects) carveRect(L, r.x, r.y, r.w, r.h);
    // Doors between the rooms (a lock on the vault).
    const between = (a: Rect, b: Rect, kind: 'door' | 'locked') => {
      const wx = Math.min(a.x + a.w, b.x + b.w) === a.x + a.w ? a.x + a.w : b.x + b.w;
      const y = y0 + 2;
      set(L, wx, y, FLOOR);
      L.doors.push({ x: wx + 1, y, vertical: true, kind });
    };
    between(east ? rh : rv, east ? rv : rh, 'locked');
    between(east ? rv : rd, east ? rd : rv, 'door');
    // The passage from the walkway to the hall, ending at a secret door in the hall's wall.
    const doorX = east ? rh.x : rh.x + rh.w;
    const from = east ? cx + 2 : cx - 2;
    carveCorridor(L, from, cy, east ? doorX - 1 : doorX, cy, true);
    L.doors.push({ x: doorX, y: cy, vertical: true, kind: 'secret' });
    furnish(L, rh, 'hall', rnd, () => true);
    furnish(L, rv, 'store', rnd, () => true);
    furnish(L, rd, 'bedchamber', rnd, () => true);
    for (let q = 0; q < 3; q++) L.props.push({ kind: 'chest', x: rv.x + 0.6 + rnd() * (rv.w - 1.2), y: rv.y + 0.6 + rnd() * (rv.h - 1.2) });
    L.rooms.push(roomOf(rh, 1, ['thieves-hall']), roomOf(rv, 1, ['thieves-vault']), roomOf(rd, 1, ['thieves-dorm']));
    return;
  }
}

export type { DRoom };
void open;
void WATER;
