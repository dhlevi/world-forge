/**
 * A floor of a building laid out on the tile grid (1.5 m tiles, walls a whole tile thick),
 * from its floor plan (interiors/dwelling.ts), which is drawn with thin walls. The plan gives the
 * rooms, roughly where they lie, which rooms its doors join, and what each room is furnished
 * with; the layout here makes them fit:
 *
 * - **Rooms** too small to keep a floor once a wall is built round them join the neighbour they
 *   share most wall with (open plan).
 * - **Walls** between rooms are straight: the larger of two rooms gives up the row along their
 *   whole border.
 * - **Doors** stand only in a proper frame: wall on two opposite sides, floor (or the open air)
 *   on the other two; never two side by side. Every room can be reached from a way in.
 * - **Furniture** is placed room by room by tile rules: hearths, storage and beds against a wall,
 *   tables and workbenches in the open with seats beside them, a clear path kept between the
 *   room's doors and stairs, every piece with a free side to use it from, and no more than a
 *   share of the floor taken. A piece that does not fit is left out.
 *
 * - **Stairs** may be pinned to tiles (the same tiles on every floor they join): those tiles stay
 *   floor, the wall between two rooms moving to the other side. A floor above or below the
 *   ground (`upper`) has no way in from outside: its ways in are its stairs.
 *
 * Pure and deterministic: the same building always gives the same layout (local/chunk.ts).
 */

/** What a building puts on each tile of its box (as local/chunk.ts). */
export const T_OUT = 0, T_FLOOR = 1, T_WALL = 2, T_DOOR = 3, T_WINDOW = 4, T_DOORWAY = 5;

/** A door or window of the plan, at a tile position (fractional), joining rooms or the outside. */
export interface PlanOpening {
  x: number;
  y: number;
  door: boolean;
  /** The two rooms an inner door joins (plan room ids); none for a door or window to the outside. */
  rooms?: [number, number];
}

/** A piece of the plan's furniture: its kind, its room, where it stands (tile position) and its length (tiles). */
export interface PlanPiece {
  type: string;
  room: number;
  x: number;
  y: number;
  len: number;
}

export interface InteriorInput {
  w: number;
  h: number;
  /** The shell: T_OUT outside the building, T_WALL its outer walls, T_FLOOR inside. */
  kind: Uint8Array;
  /** Who stands beyond: 0 open ground, 1 this building, 2 or 3 another building (per tile of the box). */
  who: Uint8Array;
  /** The plan's room on each floor tile (-1: none). */
  room: Int16Array;
  openings: PlanOpening[];
  pieces: PlanPiece[];
  /** Stairs and ladders: where (tile position) and their object tile. */
  stairs: { x: number; y: number; id: number }[];
  /** Stairs on fixed tiles (by index in the box), placed first; those tiles are never walled. */
  pinned?: { k: number; id: number }[];
  /** A floor above or below the ground: no doors to the outside, its stairs are its ways in. */
  upper?: boolean;
  /** Whether open ground beyond the building is taken by something that would block a door (a town wall, a tree). */
  blocked?: (k: number) => boolean;
  /** How far a tile is from the nearest street (squared metres), for a way in when the plan has none. */
  streetD2: (k: number) => number;
  /** Object tile ids by name (0 if unknown), and whether one can be walked through. */
  idOf: (name: string) => number;
  passable: (id: number) => boolean;
}

export interface InteriorOutput {
  kind: Uint8Array;
  obj: Uint8Array;
  room: Int16Array;
  /** Pieces of the plan left out for want of room. */
  dropped: number;
}

/** A room smaller than this (tiles, before its walls) joins a neighbour. */
const MIN_ROOM = 6;
/** A room must keep at least this much floor once walled. */
const MIN_FLOOR = 3;
/** No more than this share of a room's floor is taken by furniture that blocks the way. */
const MAX_COVER = 0.4;

type Cat = 'hearth' | 'bed' | 'centre' | 'wall' | 'seat' | 'small' | 'flat';

/** How each kind of piece is placed. */
const CATEGORY: Record<string, Cat> = {
  hearth: 'hearth', oven: 'hearth', forge: 'hearth', furnace: 'hearth', cauldron: 'hearth',
  bed: 'bed', bed2: 'bed', straw: 'bed',
  table: 'centre', trestle: 'centre', workbench: 'wall', anvil: 'centre', millstone: 'centre', sawbench: 'centre', well: 'centre', font: 'centre', bath: 'centre', tomb: 'wall',
  chest: 'wall', wardrobe: 'wall', shelf: 'wall', bookcase: 'wall', sideboard: 'wall', barrel: 'wall', crate: 'wall', sack: 'wall', bin: 'wall', rack: 'wall',
  counter: 'wall', desk: 'wall', logs: 'wall', altar: 'wall', privy: 'wall', hatstand: 'wall',
  chair: 'seat', stool: 'seat', bench: 'seat', pew: 'centre',
  candle: 'small', bucket: 'small',
  rug: 'flat',
};
/** The plan's names for pieces drawn as another tile. */
const TILE_OF: Record<string, string> = { bed2: 'bed' };
/** Pieces that serve as a table (seats are placed beside them). */
const TABLES = new Set(['table', 'trestle', 'desk', 'workbench', 'counter']);
/** The order pieces are placed in: fixed things first, small things last. */
const ORDER: Record<Cat, number> = { hearth: 0, bed: 1, centre: 2, wall: 3, seat: 4, small: 5, flat: 6 };

const D4: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** A small deterministic hash of a position, in [0, 1). */
function jitter(x: number, y: number, salt: number): number {
  let h = Math.imul(x + 1, 0x27d4eb2d) ^ Math.imul(y + 7, 0x165667b1) ^ Math.imul(salt + 3, 0x1b873593);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 12)) >>> 0) / 4294967296;
}

export function layInterior(inp: InteriorInput): InteriorOutput {
  const { w, h, who } = inp;
  const N = w * h;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x);
  const nbs = (k: number) => D4.map(([dx, dy]) => at((k % w) + dx, Math.floor(k / w) + dy));
  /** Open ground beyond the building (or beyond the box). */
  const outside = (k: number) => k < 0 || who[k] === 0;
  /** Open ground a door may open onto: outside, and not taken by a wall or a tree. */
  const blockedAt = new Int8Array(N).fill(-1);
  const clear = (k: number) => {
    if (k < 0) return true;
    if (who[k] !== 0) return false;
    if (blockedAt[k] < 0) blockedAt[k] = inp.blocked?.(k) ? 1 : 0;
    return blockedAt[k] === 0;
  };

  // ---- Rooms: every floor tile in one, and none too small -------------------------------------------
  const shell = inp.kind;
  const pin = new Uint8Array(N);
  for (const p of inp.pinned ?? []) if (shell[p.k] === T_FLOOR) pin[p.k] = 1;
  const room = Int16Array.from(inp.room);
  // Floor the plan leaves in no room: the nearest room's.
  for (let pass = 0; pass < 64; pass++) {
    let changed = false;
    for (let k = 0; k < N; k++) {
      if (shell[k] !== T_FLOOR || room[k] >= 0) continue;
      for (const n of nbs(k)) if (n >= 0 && shell[n] === T_FLOOR && room[n] >= 0) {
        room[k] = room[n];
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  for (let k = 0; k < N; k++) if (shell[k] === T_FLOOR && room[k] < 0) room[k] = 0;
  /** Which room a plan room is now (after merging). */
  const merged = new Map<number, number>();
  const now = (r: number) => {
    while (merged.has(r)) r = merged.get(r)!;
    return r;
  };
  /** Joins room `a` into `b`. */
  const join = (a: number, b: number) => {
    merged.set(a, b);
    for (let k = 0; k < N; k++) if (room[k] === a) room[k] = b;
  };
  /** The neighbour a room shares most border with. */
  const bestNeighbour = (r: number) => {
    const shared = new Map<number, number>();
    for (let k = 0; k < N; k++) {
      if (room[k] !== r || shell[k] !== T_FLOOR) continue;
      for (const n of nbs(k)) if (n >= 0 && shell[n] === T_FLOOR && room[n] !== r) shared.set(room[n], (shared.get(room[n]) ?? 0) + 1);
    }
    let best = -1, bn = 0;
    for (const [o, c] of shared) if (c > bn || (c === bn && o < best)) {
      best = o;
      bn = c;
    }
    return best;
  };
  const areas = () => {
    const a = new Map<number, number>();
    for (let k = 0; k < N; k++) if (shell[k] === T_FLOOR) a.set(room[k], (a.get(room[k]) ?? 0) + 1);
    return a;
  };
  for (let guard = 0; guard < 64; guard++) {
    const a = areas();
    let small = -1, sa = Infinity;
    for (const [r, n] of a) if (n < MIN_ROOM && n < sa && a.size > 1) {
      small = r;
      sa = n;
    }
    if (small < 0) break;
    const into = bestNeighbour(small);
    if (into < 0) break;
    join(small, into);
  }

  // ---- Walls between rooms: straight, the larger room giving up its row --------------------------------
  let kind = new Uint8Array(N);
  const build = () => {
    kind = Uint8Array.from(shell);
    const a = areas();
    for (let k = 0; k < N; k++) {
      if (shell[k] !== T_FLOOR || pin[k]) continue;
      const r = room[k];
      for (const n of nbs(k)) {
        if (n < 0 || shell[n] !== T_FLOOR || room[n] === r) continue;
        const o = room[n], ar = a.get(r)!, ao = a.get(o)!;
        // This tile gives up its floor if its room is the larger (or, as large, the higher id),
        // or if the tile across is a stair's, which is never walled.
        if (pin[n] || ar > ao || (ar === ao && r > o)) kind[k] = T_WALL;
      }
    }
  };
  // A room left with too little floor, or cut in two, joins its neighbour, and the walls are built again.
  for (let guard = 0; guard < 32; guard++) {
    build();
    let bad = -1;
    const floorOf = new Map<number, number[]>();
    for (let k = 0; k < N; k++) if (kind[k] === T_FLOOR) {
      const list = floorOf.get(room[k]) ?? [];
      list.push(k);
      floorOf.set(room[k], list);
    }
    for (const r of new Set(Array.from(room).filter((_, k) => shell[k] === T_FLOOR))) {
      const tiles = floorOf.get(r) ?? [];
      if (tiles.length < MIN_FLOOR || !connected(tiles)) {
        bad = r;
        break;
      }
    }
    if (bad < 0 || areas().size <= 1) break;
    const into = bestNeighbour(bad);
    if (into < 0) break;
    join(bad, into);
  }
  function connected(tiles: number[]): boolean {
    const set = new Set(tiles), seen = new Set([tiles[0]]), st = [tiles[0]];
    while (st.length) {
      const k = st.pop()!;
      for (const n of nbs(k)) if (n >= 0 && set.has(n) && !seen.has(n)) {
        seen.add(n);
        st.push(n);
      }
    }
    return seen.size === tiles.length;
  }

  // ---- Doors and windows: only in proper frames ------------------------------------------------------
  const isWall = (k: number) => k >= 0 && kind[k] === T_WALL;
  const floorOfRoom = (k: number, r?: number) => k >= 0 && kind[k] === T_FLOOR && (r === undefined || room[k] === r);
  const openingNear = (k: number) => nbs(k).some((n) => n >= 0 && (kind[n] === T_DOOR || kind[n] === T_WINDOW || kind[n] === T_DOORWAY))
    || [[1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dy]) => {
      const n = at((k % w) + dx, Math.floor(k / w) + dy);
      return n >= 0 && kind[n] === T_DOOR;
    });
  /** An opening on a tile's own sides (not its corners). */
  const openingBeside = (k: number) => nbs(k).some((n) => n >= 0 && (kind[n] === T_DOOR || kind[n] === T_WINDOW || kind[n] === T_DOORWAY));
  /** A frame in the wall: walls on two opposite sides, and the two sides across it pass `a` and `b`. */
  const frame = (k: number, a: (n: number) => boolean, b: (n: number) => boolean) => {
    if (!isWall(k)) return false;
    const [n, e, s, wst] = nbs(k);
    return (isWall(e) && isWall(wst) && ((a(n) && b(s)) || (a(s) && b(n)))) || (isWall(n) && isWall(s) && ((a(e) && b(wst)) || (a(wst) && b(e))));
  };
  const outerFrame = (k: number) => frame(k, (n) => floorOfRoom(n), clear);
  const innerFrame = (k: number, ra: number, rb: number) => frame(k, (n) => floorOfRoom(n, ra), (n) => floorOfRoom(n, rb));
  const nearestTo = (x: number, y: number, ok: (k: number) => boolean, maxD: number) => {
    let best = -1, bd = maxD * maxD;
    for (let ty = Math.max(0, Math.floor(y - maxD)); ty <= Math.min(h - 1, Math.ceil(y + maxD)); ty++) {
      for (let tx = Math.max(0, Math.floor(x - maxD)); tx <= Math.min(w - 1, Math.ceil(x + maxD)); tx++) {
        const dd = (tx - x) * (tx - x) + (ty - y) * (ty - y), k = ty * w + tx;
        if (dd < bd && ok(k)) {
          bd = dd;
          best = k;
        }
      }
    }
    return best;
  };
  /** A way in: a door to the outside or, on a floor above or below, a stair. */
  const wayIn = (k: number) => ((kind[k] === T_DOOR || kind[k] === T_DOORWAY) && nbs(k).some(outside)) || (!!inp.upper && pin[k] === 1);
  // Doors first (outer, then inner), then windows.
  let outerDoors = 0;
  for (const op of inp.openings) {
    if (!op.door || op.rooms || inp.upper) continue;
    const k = nearestTo(op.x, op.y, (k) => outerFrame(k) && !openingNear(k), 3);
    if (k >= 0) {
      kind[k] = T_DOOR;
      outerDoors++;
    }
  }
  if (!outerDoors && !inp.upper) {
    // No way in where the plan has one (its front faces a neighbour): the frame nearest a street.
    let best = -1, bd = Infinity;
    // (With no street near, any frame onto the open air will do: the distance is then unbounded.)
    for (let k = 0; k < N; k++) if (outerFrame(k) && (best < 0 || inp.streetD2(k) < bd)) {
      bd = inp.streetD2(k);
      best = k;
    }
    // No frame onto the open air: any wall between the floor and the open air, else through the
    // wall of the house next door.
    if (best < 0) for (let k = 0; k < N && best < 0; k++) if (isWall(k) && nbs(k).some((n) => floorOfRoom(n)) && nbs(k).some(clear)) best = k;
    if (best < 0) for (let k = 0; k < N && best < 0; k++) if (frame(k, (n) => floorOfRoom(n), (n) => n >= 0 && who[n] >= 2)) best = k;
    if (best >= 0) kind[best] = T_DOOR;
  }
  for (const op of inp.openings) {
    if (!op.door || !op.rooms) continue;
    const ra = now(op.rooms[0]), rb = now(op.rooms[1]);
    if (ra === rb) continue;
    const k = nearestTo(op.x, op.y, (k) => innerFrame(k, ra, rb) && !openingNear(k), 3);
    if (k >= 0) kind[k] = T_DOOR;
  }
  // Every room reachable from a way in: a door (or, failing a frame, an opening) into each that is not.
  const reached = new Uint8Array(N);
  const flood = () => {
    reached.fill(0);
    const st: number[] = [];
    for (let k = 0; k < N; k++) if (wayIn(k)) {
      reached[k] = 1;
      st.push(k);
    }
    while (st.length) {
      const k = st.pop()!;
      for (const n of nbs(k)) {
        if (n < 0 || reached[n] || (kind[n] !== T_FLOOR && kind[n] !== T_DOOR && kind[n] !== T_DOORWAY)) continue;
        reached[n] = 1;
        st.push(n);
      }
    }
  };
  for (let guard = 0; guard < 32; guard++) {
    flood();
    let open = -1, opening = -1;
    const fromIn = (n: number) => floorOfRoom(n) && reached[n] === 1, fromOut = (n: number) => floorOfRoom(n) && !reached[n];
    // Best a frame clear of other openings; failing that, one with a door only at a corner; failing that, a plain opening.
    for (let pass = 0; pass < 2 && open < 0; pass++) {
      for (let k = 0; k < N && open < 0; k++) {
        if (!isWall(k) || (pass === 0 ? openingNear(k) : openingBeside(k))) continue;
        if (frame(k, fromIn, fromOut)) open = k;
        else if (opening < 0 && nbs(k).some(fromIn) && nbs(k).some(fromOut)) opening = k;
      }
    }
    if (open >= 0) kind[open] = T_DOOR;
    else if (opening >= 0) kind[opening] = T_DOORWAY;
    else break;
  }
  flood();
  for (const op of inp.openings) {
    if (op.door) continue;
    const k = nearestTo(op.x, op.y, (k) => outerFrame(k) && !openingNear(k), 1.6);
    if (k >= 0) kind[k] = T_WINDOW;
  }

  // ---- Furniture ---------------------------------------------------------------------------------------
  const obj = new Uint8Array(N);
  /** Tiles kept clear: inside every door, and the paths joining a room's doors and stairs. */
  const keep = new Uint8Array(N);
  /** Which piece (by number) stands on a tile, for checking each has a free side. */
  const piece = new Int32Array(N).fill(-1);
  const floorTile = (k: number) => k >= 0 && kind[k] === T_FLOOR;
  // Stairs first: those pinned to their tiles, then where the plan has them (on floor, not in a doorway).
  for (const p of inp.pinned ?? []) if (pin[p.k]) obj[p.k] = p.id;
  for (const s of inp.stairs) {
    const k = nearestTo(s.x, s.y, (k) => floorTile(k) && !obj[k] && !nbs(k).some((n) => n >= 0 && (kind[n] === T_DOOR || kind[n] === T_DOORWAY)), 4);
    if (k >= 0) obj[k] = s.id;
  }
  for (let k = 0; k < N; k++) if (kind[k] === T_DOOR || kind[k] === T_DOORWAY) for (const n of nbs(k)) if (floorTile(n)) keep[n] = 1;
  // Paths within each room from its first way in to every other way in and stair.
  const rooms = new Set<number>();
  for (let k = 0; k < N; k++) if (floorTile(k)) rooms.add(room[k]);
  for (const r of rooms) {
    const anchors: number[] = [];
    for (let k = 0; k < N; k++) if (floorTile(k) && room[k] === r && (keep[k] || obj[k])) anchors.push(k);
    for (let i = 1; i < anchors.length; i++) for (const k of pathIn(anchors[0], anchors[i], r)) keep[k] = 1;
  }
  function pathIn(from: number, to: number, r: number): number[] {
    const prev = new Int32Array(N).fill(-2);
    prev[from] = -1;
    const q = [from];
    for (let qi = 0; qi < q.length; qi++) {
      const k = q[qi];
      if (k === to) break;
      for (const n of nbs(k)) if (n >= 0 && prev[n] === -2 && floorTile(n) && room[n] === r) {
        prev[n] = k;
        q.push(n);
      }
    }
    const out: number[] = [];
    if (prev[to] === -2) return out;
    for (let k = to; k >= 0; k = prev[k]) out.push(k);
    return out;
  }
  const blocks = (k: number) => !!obj[k] && !inp.passable(obj[k]);
  const free = (k: number) => k >= 0 && ((kind[k] === T_FLOOR && !blocks(k)) || kind[k] === T_DOOR || kind[k] === T_DOORWAY);
  /** Every free floor tile reachable from a way in, and every piece with a reachable free side. */
  const sound = () => {
    const seen = new Uint8Array(N), st: number[] = [];
    for (let k = 0; k < N; k++) if (wayIn(k)) {
      seen[k] = 1;
      st.push(k);
    }
    while (st.length) {
      const k = st.pop()!;
      for (const n of nbs(k)) if (n >= 0 && !seen[n] && free(n)) {
        seen[n] = 1;
        st.push(n);
      }
    }
    const usable = new Set<number>();
    for (let k = 0; k < N; k++) {
      if (kind[k] !== T_FLOOR) continue;
      if (free(k) && !seen[k]) return false;
      if (piece[k] >= 0 && nbs(k).some((n) => n >= 0 && seen[n] && free(n))) usable.add(piece[k]);
    }
    for (let k = 0; k < N; k++) if (piece[k] >= 0 && !usable.has(piece[k])) return false;
    return true;
  };
  const roomFloor = new Map<number, number>(), roomCover = new Map<number, number>();
  for (let k = 0; k < N; k++) if (floorTile(k)) roomFloor.set(room[k], (roomFloor.get(room[k]) ?? 0) + 1);
  /** Whether a tile has a wall (not a door or a window) on a side. */
  const wallAt = (k: number, side: number) => {
    const n = nbs(k)[side];
    return n >= 0 && kind[n] === T_WALL;
  };
  const pieces = inp.pieces
    .map((p, i) => ({ ...p, room: now(p.room), cat: CATEGORY[p.type] ?? 'wall', i }))
    .filter((p) => inp.idOf(TILE_OF[p.type] ?? p.type) > 0)
    .sort((a, b) => ORDER[a.cat] - ORDER[b.cat] || a.i - b.i);
  let dropped = 0, pieceNo = 0;
  for (const p of pieces) {
    const id = inp.idOf(TILE_OF[p.type] ?? p.type), blocking = !inp.passable(id);
    const floorN = roomFloor.get(p.room) ?? 0;
    // Lengths: as the plan has it (up to three), a bed two long (a double bed two wide too).
    const lengths = p.cat === 'bed' && p.type !== 'straw' ? [2, 1] : [Math.max(1, Math.min(3, p.len)), 1].filter((v, i, a) => a.indexOf(v) === i);
    const wide = p.type === 'bed2' ? 2 : 1;
    type Cand = { tiles: number[]; score: number };
    const cands: Cand[] = [];
    for (const len of lengths) for (const vertical of [false, true]) {
      const sx = vertical ? wide : len, sy = vertical ? len : wide;
      for (let y = 0; y + sy <= h; y++) for (let x = 0; x + sx <= w; x++) {
        const tiles: number[] = [];
        let ok = true;
        for (let dy = 0; dy < sy && ok; dy++) for (let dx = 0; dx < sx && ok; dx++) {
          const k = (y + dy) * w + x + dx;
          if (!floorTile(k) || room[k] !== p.room || obj[k] || keep[k]) ok = false;
          else tiles.push(k);
        }
        if (!ok) continue;
        // Against a wall: every tile backing onto it on one side (across the piece's length).
        const sides = vertical ? [1, 3] : [0, 2];
        const against = sides.some((s) => tiles.every((k) => wallAt(k, s)));
        const touches = tiles.some((k) => [0, 1, 2, 3].some((s) => wallAt(k, s)));
        const ddx = x + sx / 2 - 0.5 - p.x, ddy = y + sy / 2 - 0.5 - p.y;
        let score = Math.sqrt(ddx * ddx + ddy * ddy) + jitter(x, y, p.i) * 0.5 - len * 0.6;
        if (p.cat === 'hearth' || p.cat === 'wall') {
          if (!against) continue;
        } else if (p.cat === 'bed') {
          if (!touches) continue;
        } else if (p.cat === 'centre') {
          if (touches && floorN > 8) score += 3;
        } else if (p.cat === 'seat') {
          const byTable = tiles.some((k) => nbs(k).some((n) => n >= 0 && obj[n] && TABLES.has(nameOf(obj[n]))));
          if (byTable) score -= 4;
          else if (!touches) score += 2;
        } else if (p.cat === 'flat') {
          if (touches) score += 1;
        }
        cands.push({ tiles, score });
      }
    }
    cands.sort((a, b) => a.score - b.score);
    let placed = false;
    for (const c of cands.slice(0, 16)) {
      if (blocking && (roomCover.get(p.room) ?? 0) + c.tiles.length > MAX_COVER * floorN) break;
      for (const k of c.tiles) {
        obj[k] = id;
        if (blocking) piece[k] = pieceNo;
      }
      if (!blocking || sound()) {
        placed = true;
        if (blocking) roomCover.set(p.room, (roomCover.get(p.room) ?? 0) + c.tiles.length);
        pieceNo++;
        break;
      }
      for (const k of c.tiles) {
        obj[k] = 0;
        piece[k] = -1;
      }
    }
    if (!placed) dropped++;
  }
  function nameOf(id: number): string {
    for (const n of TABLES) if (inp.idOf(n) === id) return n;
    return '';
  }
  return { kind, obj, room, dropped };
}
