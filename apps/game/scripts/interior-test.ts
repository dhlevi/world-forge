/**
 * Building interiors on the tile grid (core local/interior.ts): doors in straight walls, every room
 * reached from a way in, furniture that leaves a way through and can be used, and the same layout
 * every time.
 * npx tsx apps/game/scripts/interior-test.ts (exits non-zero on a failure).
 */
import { OBJECT_TILES, objectId } from '@worldforge/core/local/tiles';
import { layInterior, T_DOOR, T_DOORWAY, T_FLOOR, T_WALL, type InteriorInput, type InteriorOutput, type PlanPiece } from '@worldforge/core/local/interior';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

/**
 * A house of `w` × `h` tiles (walls included) in a box with a tile of ground round it; `split` puts
 * the plan's line between two rooms at that column (none: one room).
 */
function house(w: number, h: number, split: number | null, more: Partial<InteriorInput> = {}): InteriorInput {
  const W = w + 2, H = h + 2, N = W * H;
  const kind = new Uint8Array(N), who = new Uint8Array(N), room = new Int16Array(N).fill(-1);
  for (let y = 1; y <= h; y++) for (let x = 1; x <= w; x++) {
    const k = y * W + x;
    who[k] = 1;
    kind[k] = x === 1 || y === 1 || x === w || y === h ? T_WALL : T_FLOOR;
    if (kind[k] === T_FLOOR) room[k] = split !== null && x >= split ? 1 : 0;
  }
  return {
    w: W, h: H, kind, who, room, openings: [], pieces: [], stairs: [],
    streetD2: (k) => {
      // A street along the south side.
      const d = H - Math.floor(k / W);
      return d * d;
    },
    idOf: (name) => objectId(name) ?? 0,
    passable: (id) => OBJECT_TILES[id]?.pass ?? true,
    ...more,
  };
}

/** What a layout gets right and wrong. */
function check(inp: InteriorInput, out: InteriorOutput) {
  const { w, h } = inp, N = w * h;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x);
  const nbs = (k: number) => [at(k % w, Math.floor(k / w) - 1), at((k % w) + 1, Math.floor(k / w)), at(k % w, Math.floor(k / w) + 1), at((k % w) - 1, Math.floor(k / w))];
  const wall = (k: number) => k >= 0 && out.kind[k] === T_WALL;
  const blocks = (k: number) => !!out.obj[k] && !inp.passable(out.obj[k]);
  const free = (k: number) => k >= 0 && ((out.kind[k] === T_FLOOR && !blocks(k)) || out.kind[k] === T_DOOR || out.kind[k] === T_DOORWAY);
  const out0 = (k: number) => k < 0 || (inp.who[k] === 0 && !inp.blocked?.(k));
  let doors = 0, crooked = 0, ways = 0;
  for (let k = 0; k < N; k++) {
    if (out.kind[k] !== T_DOOR) continue;
    doors++;
    const [n, e, s, wst] = nbs(k);
    if (!((wall(n) && wall(s)) || (wall(e) && wall(wst)))) crooked++;
    if (nbs(k).some(out0)) ways++;
  }
  // Reached from a way in.
  const seen = new Uint8Array(N), st: number[] = [];
  for (let k = 0; k < N; k++) if ((out.kind[k] === T_DOOR || out.kind[k] === T_DOORWAY) && nbs(k).some(out0)) {
    seen[k] = 1;
    st.push(k);
  }
  while (st.length) {
    const k = st.pop()!;
    for (const n of nbs(k)) if (free(n) && !seen[n]) {
      seen[n] = 1;
      st.push(n);
    }
  }
  let floor = 0, unreached = 0, covered = 0, stuck = 0;
  for (let k = 0; k < N; k++) {
    if (out.kind[k] !== T_FLOOR) continue;
    floor++;
    if (blocks(k)) {
      covered++;
      if (!nbs(k).some((n) => free(n) && seen[n])) {
        // A long piece may be used from its other end.
        const same = nbs(k).filter((n) => n >= 0 && out.obj[n] === out.obj[k]);
        if (!same.some((q) => nbs(q).some((n) => free(n) && seen[n]))) stuck++;
      }
    } else if (!seen[k]) unreached++;
  }
  return { doors, crooked, ways, floor, unreached, covered, stuck };
}

const furnish = (room: number, x: number, y: number): PlanPiece[] => [
  { type: 'bed', room, x, y, len: 1 }, { type: 'table', room, x: x + 2, y: y + 1, len: 2 },
  { type: 'chair', room, x: x + 2, y: y + 2, len: 1 }, { type: 'chair', room, x: x + 3, y: y + 2, len: 1 },
  { type: 'chest', room, x: x + 1, y, len: 1 }, { type: 'shelf', room, x: x + 3, y, len: 2 },
  { type: 'hearth', room, x, y: y + 3, len: 1 }, { type: 'barrel', room, x: x + 4, y: y + 3, len: 1 },
  { type: 'rug', room, x: x + 1, y: y + 2, len: 1 },
];

// ---- A two-room house with a door to the street and one between the rooms -----------------------------
{
  const inp = house(12, 8, 6);
  inp.openings.push({ x: 4, y: 8, door: true }, { x: 6, y: 4, door: true, rooms: [0, 1] }, { x: 9, y: 1, door: false });
  inp.pieces.push(...furnish(0, 2.5, 2.5), ...furnish(1, 7.5, 2.5));
  const out = layInterior(inp), c = check(inp, out);
  console.log(`  ${JSON.stringify(c)}, ${out.dropped} pieces left out`);
  ok(c.doors >= 2 && c.ways >= 1, 'a way in, and a door between the rooms');
  ok(c.crooked === 0, 'every door in a straight wall');
  ok(c.unreached === 0, 'all free floor reached from the way in');
  ok(c.stuck === 0, 'every blocking piece has a free side that can be reached');
  ok(c.covered <= Math.ceil(c.floor * 0.4), 'no more than two fifths of the floor blocked');
  ok(JSON.stringify(Array.from(layInterior(house(12, 8, 6, { openings: inp.openings, pieces: inp.pieces })).obj)) === JSON.stringify(Array.from(out.obj)), 'the same plan, the same layout');
}

// ---- A plan door that falls on no wall still leaves a way in, on the side nearest the street ----------
{
  const inp = house(9, 7, null);
  inp.openings.push({ x: 5, y: 4, door: true });
  const out = layInterior(inp), c = check(inp, out);
  ok(c.ways === 1 && c.unreached === 0, 'a way in made where the plan has none in a wall');
  const door = out.kind.findIndex((t) => t === T_DOOR);
  ok(Math.floor(door / inp.w) === 7, 'made on the street side');
}

// ---- Hemmed in by a neighbour, no street near: the door opens onto the open air, not into a wall ------
{
  const inp = house(9, 7, null, { streetD2: () => Infinity });
  // An older house against the west and south walls.
  for (let k = 0; k < inp.w * inp.h; k++) if (inp.who[k] === 0 && (k % inp.w === 0 || Math.floor(k / inp.w) === inp.h - 1)) inp.who[k] = 2;
  const out = layInterior(inp), c = check(inp, out);
  ok(c.ways >= 1 && c.unreached === 0, 'with no street near, a way in onto the open air');
}

// ---- A town wall (or tree) outside the street side: the door goes elsewhere -----------------------------
{
  const inp = house(9, 7, null);
  inp.blocked = (k) => Math.floor(k / inp.w) === inp.h - 1;
  inp.openings.push({ x: 5, y: 7, door: true });
  const out = layInterior(inp), c = check(inp, out);
  const door = out.kind.findIndex((t) => t === T_DOOR);
  ok(c.ways >= 1 && Math.floor(door / inp.w) !== 7, 'no door opening onto a town wall');
}

// ---- A room too small to stand alone joins its neighbour --------------------------------------------
{
  const inp = house(10, 6, 9);
  inp.openings.push({ x: 4, y: 6, door: true });
  const out = layInterior(inp), c = check(inp, out);
  const rooms = new Set(Array.from(out.room).filter((r, k) => r >= 0 && out.kind[k] === T_FLOOR));
  ok(rooms.size === 1 && c.unreached === 0, 'a closet of a few tiles made part of the room beside it');
}

// ---- A crowded room: what does not fit is left out, and the way through stays open ----------------------
{
  const inp = house(7, 6, null);
  inp.openings.push({ x: 3, y: 6, door: true });
  for (let i = 0; i < 12; i++) inp.pieces.push({ type: i % 2 ? 'wardrobe' : 'table', room: 0, x: 2 + (i % 4), y: 2 + Math.floor(i / 4), len: 1 });
  const out = layInterior(inp), c = check(inp, out);
  ok(out.dropped > 0 && c.unreached === 0 && c.stuck === 0, `a crowded plan thinned (${out.dropped} left out), the way through kept`);
}

// ---- A floor above the ground: its stairs pinned, never walled, and its only ways in ------------------
{
  const inp = house(12, 8, 6, { upper: true });
  // The stairwell on the line between the two rooms of the plan: the wall moves aside for it.
  const up = 4 * inp.w + 6, down = 4 * inp.w + 7;
  inp.pinned = [{ k: up, id: objectId('stairs_up')! }, { k: down, id: objectId('stairs_down')! }];
  inp.openings.push({ x: 4, y: 8, door: true }, { x: 6, y: 3, door: true, rooms: [0, 1] }, { x: 9, y: 1, door: false });
  inp.pieces.push(...furnish(0, 2.5, 2.5), ...furnish(1, 7.5, 2.5));
  const out = layInterior(inp);
  ok(out.kind[up] === T_FLOOR && out.kind[down] === T_FLOOR && out.obj[up] === objectId('stairs_up') && out.obj[down] === objectId('stairs_down'), 'the stairs on their own tiles, never walled');
  ok(!Array.from(out.kind).some((t, k) => t === T_DOOR && [k - 1, k + 1, k - inp.w, k + inp.w].some((n) => inp.who[n] === 0)), 'no door out of a floor above the ground');
  // Reached from the stairs.
  const seen = new Uint8Array(out.kind.length), st = [up, down];
  for (const k of st) seen[k] = 1;
  const pass = (k: number) => (out.kind[k] === T_FLOOR && (!out.obj[k] || inp.passable(out.obj[k]))) || out.kind[k] === T_DOOR || out.kind[k] === T_DOORWAY;
  while (st.length) {
    const k = st.pop()!;
    for (const n of [k - 1, k + 1, k - inp.w, k + inp.w]) if (n >= 0 && !seen[n] && pass(n)) {
      seen[n] = 1;
      st.push(n);
    }
  }
  ok(Array.from(out.kind).every((t, k) => t !== T_FLOOR || !pass(k) || seen[k] === 1), 'every room of the floor reached from its stairs');
}

if (failures) {
  console.log(`${failures} failed`);
  process.exit(1);
}
console.log('all interior tests passed');
