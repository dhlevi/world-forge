import type { Rng } from '../gen/rng';
import {
  type DLevel, type DRoom, type DungeonSite, FLOOR, PIT, type PropKind, type Rect, RUBBLE, VOID,
  at, carveCorridor, carveRect, centre, connectAll, doorsForRooms, newLevel, overlaps, pick, reach, roomOf, set,
} from './core';

/**
 * A prison: a city's prison keep or a remote prison fort. Three levels, each reached from the
 * one above at the same spot:
 *
 * - **Gatehouse and yard:** a walled court with a gate passage closed by two portcullises,
 *   ranges of rooms round the exercise yard (the warden's hall, chapel, kitchen, barracks,
 *   armoury, stores, the turnkeys' room, the debtors' ward and the infirmary) and a watchtower in
 *   each corner. The stair down is in the turnkeys' room.
 * - **The cell galleries:** two long galleries lined with barred cells, a common cell and the
 *   condemned cell, and a locked stair down to the pit. Most cells are unnumbered; the cells of
 *   the notable inmates are numbered and keyed (their names come from dungeons/inmates.ts).
 * - **The pit:** the question room, the oubliette, deep cells behind locked doors, forgotten
 *   cells no one has opened in years, the drain, and an escape tunnel someone is digging behind
 *   a loose stone.
 */
export function prison(site: DungeonSite, rnd: Rng): DLevel[] {
  const large = site.tags.includes('large');
  const W = large ? 46 : 40, H = large ? 36 : 32;
  const top = yardLevel(rnd, W, H, large);
  const down0 = top.links[0];
  const cells = galleryLevel(rnd, W, H, [down0.x, down0.y], large);
  const down1 = cells.links.find((l) => l.dir === 'down')!;
  const pit = pitLevel(rnd, W, H, [down1.x, down1.y]);
  void site;
  return [top, cells, pit];
}

type Put = (kind: PropKind, x: number, y: number, extra?: { a?: number; w?: number; h?: number }) => void;

/** Props for a room by what it is for. */
function furnish(L: DLevel, r: Rect, tag: string, rnd: Rng): void {
  const put: Put = (kind, x, y, extra = {}) => {
    if (at(L, Math.floor(x), Math.floor(y)) === FLOOR) L.props.push({ kind, x, y, ...extra });
  };
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  switch (tag) {
    case 'prison-warden': put('table', cx, cy, { w: Math.min(3, r.w - 2), h: 1 }); put('chest', r.x + r.w - 0.8, r.y + 0.8); put('bookcase', r.x + 1.5, r.y + 0.5, { w: 2, h: 0.5 }); break;
    case 'chapel': put('altar', cx, r.y + 0.9, { w: 1.6, h: 0.7 }); put('brazier', cx - 1.3, r.y + 0.9); put('brazier', cx + 1.3, r.y + 0.9); break;
    case 'prison-kitchen': put('table', cx, cy, { w: 2, h: 0.9 }); put('barrel', r.x + 0.8, r.y + 0.8); put('brazier', r.x + r.w - 1, r.y + 1); break;
    case 'prison-barracks': for (let x = r.x + 0.7; x < r.x + r.w - 0.5; x += 1.3) put('bed', x, r.y + 1.1, { w: 0.9, h: 1.8 }); put('chest', cx, r.y + r.h - 0.8); break;
    case 'armoury': put('crate', cx - 1, cy); put('crate', cx + 1, cy); put('barrel', cx, cy + 1.2); break;
    case 'prison-store': for (let q = 0; q < 5; q++) put(rnd() < 0.5 ? 'barrel' : 'crate', r.x + 0.8 + rnd() * (r.w - 1.6), r.y + 0.8 + rnd() * (r.h - 1.6)); break;
    case 'prison-turnkey': put('table', cx, cy, { w: 1.5, h: 0.9 }); put('chest', r.x + 0.8, r.y + r.h - 0.8); break;
    case 'prison-debtors': for (let x = r.x + 0.7; x < r.x + r.w - 0.5; x += 1.4) put('bed', x, r.y + r.h - 1.1, { w: 0.9, h: 1.8 }); put('table', cx, r.y + 1, { w: 1.4, h: 0.8 }); break;
    case 'prison-infirmary': put('bed', r.x + 0.8, cy, { w: 0.9, h: 1.8 }); put('bed', r.x + 2.2, cy, { w: 0.9, h: 1.8 }); put('table', r.x + r.w - 1.2, r.y + 1, { w: 1.2, h: 0.8 }); break;
    case 'guard': put('table', cx, cy, { w: 1.4, h: 0.8 }); put('barrel', r.x + 0.8, r.y + 0.8); break;
    case 'prison-watch': put('brazier', cx, cy); break;
    case 'prison-yard': put('well', cx, cy); break;
    case 'prison-landing': put('table', cx + 0.6, cy + 0.6, { w: 1.2, h: 0.7 }); break;
    case 'prison-held': case 'prison-condemned': case 'prison-deep': put('bed', r.x + 0.6, cy, { w: 0.8, h: 1.7 }); if (rnd() < 0.5) put('barrel', r.x + r.w - 0.6, r.y + 0.6); break;
    case 'prison-cell': if (rnd() < 0.6) put('bed', r.x + 0.6, cy, { w: 0.8, h: 1.7 }); break;
    case 'prison-common': for (let x = r.x + 0.7; x < r.x + r.w - 0.5; x += 1.2) put('bed', x, r.y + 0.9, { w: 0.8, h: 1.6 }); put('barrel', r.x + r.w - 0.8, r.y + r.h - 0.8); break;
    case 'prison-pitstair': put('table', cx, r.y + 1, { w: 1.2, h: 0.7 }); break;
    case 'prison-question': put('table', cx, cy, { w: 2, h: 0.9 }); put('brazier', r.x + 1, r.y + 1); put('chest', r.x + r.w - 0.8, r.y + r.h - 0.8); break;
    case 'prison-forgotten': put('bones', cx, cy); put('skull', cx + 0.6, cy - 0.4); break;
    case 'cistern': put('well', cx, cy); break;
  }
}

/** Splits a run of cells [a, b) into pieces about `want` long, with one-cell walls between them. */
function pieces(a: number, b: number, want: number): [number, number][] {
  const len = b - a;
  if (len < 3) return [];
  const n = Math.max(1, Math.round((len + 1) / (want + 1)));
  const each = (len - (n - 1)) / n;
  const out: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const s = Math.round(a + k * (each + 1)), e = Math.round(a + k * (each + 1) + each);
    if (e - s >= 2) out.push([s, e]);
  }
  return out;
}

function yardLevel(rnd: Rng, W: number, H: number, large: boolean): DLevel {
  const L = newLevel('Gatehouse and yard', W, H);
  const D = large ? 6 : 5;
  const X0 = 2, Y0 = 2, X1 = W - 2, Y1 = H - 2;
  const yx0 = X0 + D + 1, yx1 = X1 - D - 1, yy0 = Y0 + D + 1, yy1 = Y1 - D - 1;
  const cx = Math.floor(W / 2);
  const rooms: { r: Rect; tag: string }[] = [];
  const add = (r: Rect, tag: string, door: [number, number] | null) => {
    carveRect(L, r.x, r.y, r.w, r.h);
    if (door) set(L, door[0], door[1], FLOOR);
    rooms.push({ r, tag });
  };
  // The yard.
  const yard: Rect = { x: yx0, y: yy0, w: yx1 - yx0, h: yy1 - yy0 };
  carveRect(L, yard.x, yard.y, yard.w, yard.h);
  // The ranges round it: north, west, east, and the gate range to the south.
  const north = ['prison-warden', 'chapel', 'prison-kitchen', 'prison-store'];
  const west = ['prison-turnkey', 'prison-debtors', 'prison-infirmary'];
  const east = ['prison-barracks', 'armoury', 'prison-store'];
  pieces(yx0, yx1, large ? 7 : 6).forEach(([a, b], k) => add({ x: a, y: Y0, w: b - a, h: D }, north[k] ?? 'prison-store', [Math.floor((a + b) / 2), Y0 + D]));
  pieces(yy0, yy1, 5).forEach(([a, b], k) => add({ x: X0, y: a, w: D, h: b - a }, west[k] ?? 'prison-store', [X0 + D, Math.floor((a + b) / 2)]));
  pieces(yy0, yy1, 5).forEach(([a, b], k) => add({ x: X1 - D, y: a, w: D, h: b - a }, east[k] ?? 'prison-store', [X1 - D - 1, Math.floor((a + b) / 2)]));
  // The gate range: a guardroom either side of the passage, each with a door onto it.
  add({ x: yx0, y: Y1 - D, w: cx - 2 - yx0, h: D }, 'guard', [cx - 2, Y1 - Math.ceil(D / 2)]);
  add({ x: cx + 2, y: Y1 - D, w: yx1 - cx - 2, h: D }, 'guard', [cx + 1, Y1 - Math.ceil(D / 2)]);
  // Watchtowers at the corners, reached from the range beside them.
  const s = D - 1;
  add({ x: X0, y: Y0, w: s, h: s }, 'prison-watch', [X0 + s, Y0 + Math.floor(s / 2)]);
  set(L, X0 + s + 1, Y0 + Math.floor(s / 2), FLOOR);
  add({ x: X1 - s, y: Y0, w: s, h: s }, 'prison-watch', [X1 - s - 1, Y0 + Math.floor(s / 2)]);
  set(L, X1 - s - 2, Y0 + Math.floor(s / 2), FLOOR);
  // The gate passage, from the outer gate to the yard.
  for (let y = yy1; y < H; y++) for (const x of [cx - 1, cx]) set(L, x, y, FLOOR);
  L.entrances.push({ x: cx, y: H - 1, dir: -Math.PI / 2 });
  // Doors where the rooms open on the yard, the passage and each other (the yard itself adds none).
  doorsForRooms(L, rooms.map((q) => q.r), rnd, () => 'door');
  rooms.unshift({ r: yard, tag: 'prison-yard' });
  // Portcullises at both ends of the passage; the turnkeys keep their door locked.
  for (const x of [cx - 1, cx]) {
    L.doors.push({ x, y: Y1, vertical: false, kind: 'portcullis' });
    L.doors.push({ x, y: yy1, vertical: false, kind: 'portcullis' });
  }
  for (const q of rooms) {
    furnish(L, q.r, q.tag, rnd);
    L.rooms.push(roomOf(q.r, 1, [q.tag]));
  }
  // The stair down to the cells, in the turnkeys' room.
  const tk = rooms.find((q) => q.tag === 'prison-turnkey') ?? rooms[1];
  const p: [number, number] = [tk.r.x + 1, tk.r.y + 1];
  L.props = L.props.filter((q) => Math.hypot(q.x - p[0] - 0.5, q.y - p[1] - 0.5) > 1.2);
  L.links.push({ x: p[0], y: p[1], dir: 'down', to: 1, style: 'stairs' });
  L.rooms.find((q) => q.x === tk.r.x && q.y === tk.r.y)?.tags.push('down:stairs');
  return L;
}

function galleryLevel(rnd: Rng, W: number, H: number, up: [number, number], large: boolean): DLevel {
  const L = newLevel('The cell galleries', W, H);
  const rooms: { r: Rect; tag: string; n: boolean }[] = [];
  // The landing at the foot of the stair, and the spine passage from it to both galleries.
  const land: Rect = { x: Math.max(2, up[0] - 1), y: Math.max(2, up[1] - 1), w: 3, h: 3 };
  carveRect(L, land.x, land.y, land.w, land.h);
  rooms.push({ r: land, tag: 'prison-landing', n: true });
  const gy = [Math.round(H * 0.3), Math.round(H * 0.7)];
  const xs = Math.max(3, Math.min(W - 10, land.x + land.w + 1));
  carveCorridor(L, land.x + land.w - 1, centre(land)[1], xs, centre(land)[1], true);
  carveCorridor(L, xs, Math.min(gy[0], centre(land)[1]), xs, gy[1], false);
  // The galleries, and the end rooms: the common cell and the condemned cell.
  const xe = W - (large ? 10 : 9);
  for (const y of gy) carveCorridor(L, xs, y, xe, y, true);
  const endW = W - xe - 3;
  const common: Rect = { x: xe + 2, y: gy[0] - 3, w: endW, h: 7 };
  carveRect(L, common.x, common.y, common.w, common.h);
  set(L, xe + 1, gy[0], FLOOR);
  rooms.push({ r: common, tag: 'prison-common', n: true });
  const condemned: Rect = { x: xe + 2, y: gy[1] - 1, w: 3, h: 3 };
  carveRect(L, condemned.x, condemned.y, condemned.w, condemned.h);
  set(L, xe + 1, gy[1], FLOOR);
  rooms.push({ r: condemned, tag: 'prison-condemned', n: true });
  // The way down to the pit: a locked stair room between the galleries, off the second.
  const mid0 = gy[0] + 5, mid1 = gy[1] - 5;
  const pitW = 5;
  const pitStair: Rect = { x: xe - pitW, y: mid0 + 1, w: pitW, h: Math.max(3, mid1 - mid0 - 1) };
  carveRect(L, pitStair.x, pitStair.y, pitStair.w, pitStair.h);
  for (let y = pitStair.y + pitStair.h; y < gy[1]; y++) set(L, pitStair.x + 2, y, FLOOR);
  rooms.push({ r: pitStair, tag: 'prison-pitstair', n: true });
  // Cells above and below each gallery: three squares by three, a wall between them, a barred door.
  const cellRects: Rect[] = [];
  for (const y of gy) {
    for (let x = xs + 2; x + 3 <= xe; x += 4) {
      for (const side of [-1, 1]) {
        const r: Rect = side < 0 ? { x, y: y - 4, w: 3, h: 3 } : { x, y: y + 2, w: 3, h: 3 };
        if (r.y < 2 || r.y + r.h > H - 2) continue;
        // Keep clear of the stair room and of the landing.
        if (overlaps(r, pitStair, 1) || overlaps(r, land, 1)) continue;
        if ([...Array(r.h)].some((_, j) => [...Array(r.w)].some((__, i) => at(L, r.x + i, r.y + j) !== VOID))) continue;
        carveRect(L, r.x, r.y, r.w, r.h);
        set(L, x + 1, side < 0 ? y - 1 : y + 1, FLOOR);
        cellRects.push(r);
      }
    }
  }
  // The notable inmates' cells are numbered; the rest are not.
  const held = new Set<Rect>(cellRects.slice().sort(() => rnd() - 0.5).slice(0, large ? 7 : 5));
  for (const r of cellRects) rooms.push({ r, tag: held.has(r) ? 'prison-held' : 'prison-cell', n: held.has(r) });
  doorsForRooms(L, rooms.map((q) => q.r), rnd, () => 'bars');
  for (const d of L.doors) {
    const inStair = d.x >= pitStair.x - 1 && d.x <= pitStair.x + pitStair.w && d.y >= pitStair.y - 1 && d.y <= pitStair.y + pitStair.h + 1;
    const inLand = d.x >= land.x - 1 && d.x <= land.x + land.w && d.y >= land.y - 1 && d.y <= land.y + land.h;
    if (inStair) d.kind = 'locked';
    else if (inLand) d.kind = 'door';
  }
  for (const q of rooms) {
    furnish(L, q.r, q.tag, rnd);
    L.rooms.push(roomOf(q.r, q.n ? 1 : 0, [q.tag]));
  }
  L.links.push({ x: up[0], y: up[1], dir: 'up', to: 0, style: 'stairs' });
  const p: [number, number] = [pitStair.x + 1, pitStair.y + 1];
  L.links.push({ x: p[0], y: p[1], dir: 'down', to: 2, style: 'stairs' });
  L.rooms.find((q) => q.tags[0] === 'prison-pitstair')?.tags.push('down:stairs');
  L.props = L.props.filter((q) => !L.links.some((l) => Math.hypot(q.x - l.x - 0.5, q.y - l.y - 0.5) < 1.2));
  return L;
}

function pitLevel(rnd: Rng, W: number, H: number, up: [number, number]): DLevel {
  const L = newLevel('The pit', W, H);
  // One passage through the pit, level with the stair foot, with rooms on both sides of it.
  const cy = Math.max(9, Math.min(H - 10, up[1]));
  const land: Rect = { x: Math.max(2, Math.min(W - 5, up[0] - 1)), y: Math.max(2, Math.min(H - 5, up[1] - 1)), w: 3, h: 3 };
  carveRect(L, land.x, land.y, land.w, land.h);
  const want: [string, number, number][] = [
    ['prison-question', 6, 5], ['prison-oubliette', 5, 5], ['prison-held', 3, 3], ['prison-deep', 3, 3], ['prison-forgotten', 4, 3],
    ['prison-deep', 3, 3], ['prison-held', 3, 3], ['cistern', 5, 4], ['prison-deep', 3, 3], ['prison-forgotten', 3, 3],
  ].sort(() => rnd() - 0.5) as [string, number, number][];
  const placed: { r: Rect; tag: string; side: number }[] = [{ r: land, tag: 'prison-landing', side: 0 }];
  const next = [3, 3];
  want.forEach(([tag, w, h], k) => {
    for (const side of k % 2 ? [1, -1] : [-1, 1]) {
      const q = side < 0 ? 0 : 1;
      let x = next[q];
      const y = side < 0 ? cy - 1 - h : cy + 2;
      // Step past the landing.
      while (x + w > land.x - 1 && x < land.x + land.w + 1) x++;
      if (x + w > W - 3 || y < 2 || y + h > H - 2) continue;
      const r: Rect = { x, y, w, h };
      if (placed.some((p) => overlaps(p.r, r, 1))) continue;
      carveRect(L, r.x, r.y, r.w, r.h);
      set(L, x + Math.floor(w / 2), side < 0 ? cy - 1 : cy + 1, FLOOR);
      placed.push({ r, tag, side });
      next[q] = x + w + 1;
      return;
    }
  });
  // The passage, as long as the rooms along it need, and the way to it from the stair foot.
  const xs0 = Math.min(...placed.map((p) => p.r.x)), xs1 = Math.max(...placed.map((p) => p.r.x + p.r.w - 1));
  carveCorridor(L, Math.max(2, xs0), cy, Math.min(W - 3, xs1), cy, true);
  carveCorridor(L, up[0], up[1], up[0], cy, false);
  // The oubliette: a shaft in the floor with a grate over it.
  const ob = placed.find((q) => q.tag === 'prison-oubliette');
  if (ob) {
    const [ox, oy] = centre(ob.r);
    for (const [i, j] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) set(L, ox + i, oy + j, PIT);
  }
  // The forgotten cells: rubble on the floor.
  for (const q of placed) {
    if (q.tag !== 'prison-forgotten') continue;
    for (let k = 0; k < 2; k++) set(L, q.r.x + Math.floor(rnd() * q.r.w), q.r.y + Math.floor(rnd() * q.r.h), RUBBLE);
  }
  doorsForRooms(L, placed.map((q) => q.r), rnd, () => 'door');
  for (const d of L.doors) {
    const q = placed.find((p) => d.x >= p.r.x - 1 && d.x <= p.r.x + p.r.w && d.y >= p.r.y - 1 && d.y <= p.r.y + p.r.h);
    if (!q) continue;
    d.kind = q.tag === 'prison-deep' || q.tag === 'prison-held' || q.tag === 'prison-forgotten' ? 'locked' : q.tag === 'prison-oubliette' ? 'bars' : 'door';
  }
  for (const q of placed) {
    furnish(L, q.r, q.tag, rnd);
    L.rooms.push(roomOf(q.r, 1, [q.tag]));
  }
  // An escape tunnel: from one of the held cells, behind a loose stone, away from the passage.
  const from = placed.filter((q) => q.tag === 'prison-held').sort(() => rnd() - 0.5)[0];
  if (from) {
    const dir = from.side;
    let x = from.r.x + 1, y = dir < 0 ? from.r.y - 1 : from.r.y + from.r.h;
    const tunnel: [number, number][] = [];
    for (let k = 0; k < 9; k++) {
      if (y < 1 || y > H - 2 || at(L, x, y) !== VOID) break;
      tunnel.push([x, y]);
      if (rnd() < 0.3 && at(L, x + (k % 2 ? 1 : -1), y) === VOID && tunnel.length > 1) {
        x += k % 2 ? 1 : -1;
        tunnel.push([x, y]);
      }
      y += dir;
    }
    if (tunnel.length >= 3) {
      for (const [a, b] of tunnel) set(L, a, b, FLOOR);
      const [a0, b0] = tunnel[0];
      L.doors.push({ x: a0, y: dir < 0 ? b0 + 1 : b0, vertical: false, kind: 'secret' });
      const end = tunnel[tunnel.length - 1];
      L.props.push({ kind: 'rubble', x: end[0] + 0.5, y: end[1] + 0.5 });
      const xs = tunnel.map((t) => t[0]), ys = tunnel.map((t) => t[1]);
      const tr: Rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
      const room = roomOf(tr, 1, ['prison-tunnel']);
      room.lx = end[0] + 1.6;
      room.ly = end[1] + 0.5;
      L.rooms.push(room);
    }
  }
  L.links.push({ x: up[0], y: up[1], dir: 'up', to: 1, style: 'stairs' });
  L.props = L.props.filter((q) => Math.hypot(q.x - up[0] - 0.5, q.y - up[1] - 0.5) > 1.2);
  void reach;
  void connectAll;
  return L;
}

/** The rooms whose occupants the roster names: the numbered cells, the condemned cell and the oubliette. */
export const HELD_TAGS = new Set(['prison-held', 'prison-condemned', 'prison-oubliette']);
export const isHeld = (r: DRoom) => HELD_TAGS.has(r.tags[0]);
