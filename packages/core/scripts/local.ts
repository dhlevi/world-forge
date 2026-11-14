/**
 * Makes the local map (local/chunk.ts) round a settlement in Node: times the chunks, prints a
 * hash of them (the same in a browser, for the same world) and writes a picture of the tiles in
 * their placeholder colours.
 *
 *   npm run test:local -- --seed=forge --res=512 --town=<name or id> --r=2 --png=local.png
 */
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/gen/world';
import { type WorldSettings, readSettingsQuery } from '../src/settings';
import { LocalWorld, CHUNK, LEVEL_M, chunkHash, type Chunk } from '../src/local/chunk';
import { GROUND_TILES, OBJECT_TILES } from '../src/local/tiles';
import { encodePng } from './png';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? 'true'];
}));
const settings: WorldSettings = { seed: 'forge', landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 512 };
readSettingsQuery(settings, `?${new URLSearchParams(Object.entries(args).map(([k, v]) => [k, String(v)])).toString()}`);

const t0 = performance.now();
const w = generateWorld(settings, () => {});
console.log(`World "${settings.seed}" in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

const want = String(args.town ?? '');
const pool = [...w.settlements].sort((a, b) => b.population - a.population);
const site = (want && pool.find((s) => s.id === want || s.name === want)) || pool.find((s) => s.tier === String(args.tier ?? 'city'))!;
console.log(`Start: ${site.name} (${site.tier}, ${site.population} people)`);

const lw = new LocalWorld(w, site);
const R = Number(args.r ?? 2);
const t1 = performance.now();
const start = lw.startTile();
console.log(`Start tile ${start} in ${Math.round(performance.now() - t1)} ms (first chunks include the town plan)`);
const chunks: Chunk[] = [];
const times: number[] = [];
let all = '';
for (let cy = -R; cy < R; cy++) for (let cx = -R; cx < R; cx++) {
  const c = lw.chunk(cx, cy);
  chunks.push(c);
  times.push(c.ms);
  all += chunkHash(c);
}
times.sort((a, b) => a - b);
let h = 0x811c9dc5;
for (let i = 0; i < all.length; i++) h = Math.imul(h ^ all.charCodeAt(i), 16777619);
console.log(`${chunks.length} chunks: median ${times[times.length >> 1].toFixed(1)} ms, max ${times[times.length - 1].toFixed(1)} ms`);
console.log(`Local hash ${(h >>> 0).toString(16).padStart(8, '0')}`);

// Reachability: walk out from the start (doors open) and see how much of the land, and of the
// edge of the area, can be reached.
{
  const S = 2 * R * CHUNK, o = R * CHUNK;
  const ok = new Uint8Array(S * S);
  for (const c of chunks) for (let k = 0; k < CHUNK * CHUNK; k++) {
    const x = (c.cx + R) * CHUNK + (k % CHUNK), y = (c.cy + R) * CHUNK + Math.floor(k / CHUNK);
    const ob = OBJECT_TILES[c.object[k]];
    ok[y * S + x] = GROUND_TILES[c.ground[k]].pass && (ob.pass || !!ob.toggle) ? 1 : 0;
  }
  const seen = new Uint8Array(S * S);
  const stack = [(start[1] + o) * S + start[0] + o];
  seen[stack[0]] = 1;
  while (stack.length) {
    const k = stack.pop()!;
    const x = k % S, y = Math.floor(k / S);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy, k2 = yy * S + xx;
      if (xx < 0 || yy < 0 || xx >= S || yy >= S || seen[k2] || !ok[k2]) continue;
      seen[k2] = 1;
      stack.push(k2);
    }
  }
  let land = 0, landR = 0, edge = 0, edgeR = 0;
  for (let k = 0; k < S * S; k++) {
    if (!ok[k]) continue;
    land++;
    if (seen[k]) landR++;
    const x = k % S, y = Math.floor(k / S);
    if (x === 0 || y === 0 || x === S - 1 || y === S - 1) {
      edge++;
      if (seen[k]) edgeR++;
    }
  }
  console.log(`Reachable from the start: ${((100 * landR) / land).toFixed(1)}% of open tiles, ${edgeR} of ${edge} open tiles on the area's edge`);
}

// Floors above and below the ground (buildings' storeys and cellars; caves, dungeons and delves):
// every way up meets a way down at the same tile on the nearest level above that has one there,
// however many levels between (and the other way about), and how much of the floors can be walked
// to from their ways. A way up leading nowhere fails the run (a way down may: a deep cave's way
// into the Underworld, not laid out yet).
{
  const S = 2 * R * CHUNK, M = 12;
  const UP = new Set(['stairs_up', 'ladder_up', 'stairs_spiral']);
  const DOWN = new Set(['stairs_down', 'ladder_down', 'stairs_spiral', 'dungeon_entrance', 'mine_entrance', 'cave_mouth', 'grate']);
  const surf = new Uint8Array(S * S), lev = new Int16Array(S * S);
  const floors = new Map<number, { g: Uint8Array; o: Uint8Array }>();
  for (const c of chunks) {
    for (let k = 0; k < CHUNK * CHUNK; k++) {
      const q = ((c.cy + R) * CHUNK + Math.floor(k / CHUNK)) * S + (c.cx + R) * CHUNK + (k % CHUNK);
      surf[q] = c.object[k];
      lev[q] = Math.floor(c.elev[k] / LEVEL_M);
    }
    for (const l of c.layers) {
      let f = floors.get(l.z);
      if (!f) floors.set(l.z, (f = { g: new Uint8Array(S * S), o: new Uint8Array(S * S) }));
      for (let k = 0; k < CHUNK * CHUNK; k++) {
        if (!l.ground[k]) continue;
        const q = ((c.cy + R) * CHUNK + Math.floor(k / CHUNK)) * S + (c.cx + R) * CHUNK + (k % CHUNK);
        f.g[q] = l.ground[k];
        f.o[q] = l.object[k];
      }
    }
  }
  /** The object on a tile of a level: its floor's, the ground's at its own level, or -1 (nothing there). */
  const objAt = (q: number, z: number) => {
    const f = floors.get(z);
    if (f && f.g[q]) return f.o[q];
    return lev[q] === z ? surf[q] : -1;
  };
  const nameAt = (q: number, z: number) => {
    const o = objAt(q, z);
    return o < 0 ? '' : OBJECT_TILES[o].name;
  };
  /** Whether a way at (q, z) leads up (or down) to its way back. */
  const meets = (q: number, z: number, up: boolean) => {
    for (let n = 1; n <= 48; n++) if ((up ? DOWN : UP).has(nameAt(q, up ? z + n : z - n))) return true;
    return false;
  };
  const inner = (q: number) => q % S >= M && Math.floor(q / S) >= M && q % S < S - M && Math.floor(q / S) < S - M;
  let ways = 0, lostUp = 0, lostDown = 0, tiles = 0, reached = 0;
  const zs = new Set([...floors.keys(), ...Array.from(lev)]);
  for (const z of zs) for (let q = 0; q < S * S; q++) {
    if (!inner(q)) continue;
    const n = nameAt(q, z);
    if (!UP.has(n) && !DOWN.has(n)) continue;
    ways++;
    // A spiral stair goes both ways: lost only if it meets nothing either way.
    if (n === 'stairs_spiral') {
      if (!meets(q, z, true) && !meets(q, z, false)) lostUp++;
    } else if (UP.has(n) && !meets(q, z, true)) lostUp++;
    else if (DOWN.has(n) && !meets(q, z, false)) lostDown++;
  }
  for (const f of floors.values()) {
    const pass = (q: number) => f.g[q] > 0 && (OBJECT_TILES[f.o[q]].pass || !!OBJECT_TILES[f.o[q]].toggle);
    const seen = new Uint8Array(S * S), st: number[] = [];
    for (let q = 0; q < S * S; q++) if (f.g[q] && (UP.has(OBJECT_TILES[f.o[q]].name) || DOWN.has(OBJECT_TILES[f.o[q]].name))) {
      seen[q] = 1;
      st.push(q);
    }
    while (st.length) {
      const q = st.pop()!;
      for (const n of [q - 1, q + 1, q - S, q + S]) if (n >= 0 && n < S * S && !seen[n] && pass(n)) {
        seen[n] = 1;
        st.push(n);
      }
    }
    for (let q = 0; q < S * S; q++) if (inner(q) && f.g[q] && OBJECT_TILES[f.o[q]].pass && !GROUND_TILES[f.g[q]].water) {
      tiles++;
      if (seen[q]) reached++;
    }
  }
  console.log(`Floors above and below the ground: ${floors.size} levels, ${tiles} open floor tiles, ${tiles ? ((100 * reached) / tiles).toFixed(1) : '100.0'}% reached from their ways up and down; ${ways} ways up and down, ${lostUp} up and ${lostDown} down leading nowhere`);
  if (lostUp) process.exitCode = 1;
}

const count = new Map<string, number>();
for (const c of chunks) for (let k = 0; k < c.object.length; k++) if (c.object[k]) count.set(OBJECT_TILES[c.object[k]].name, (count.get(OBJECT_TILES[c.object[k]].name) ?? 0) + 1);
console.log('Objects:', [...count].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${k} ${v}`).join(', '));

if (args.png) {
  const S = Number(args.px ?? 3), size = 2 * R * CHUNK;
  const img = new Uint8Array(size * S * size * S * 4);
  const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  for (const c of chunks) for (let k = 0; k < CHUNK * CHUNK; k++) {
    const x = (c.cx + R) * CHUNK + (k % CHUNK), y = (c.cy + R) * CHUNK + Math.floor(k / CHUNK);
    const gcol = rgb(GROUND_TILES[c.ground[k]].colour);
    const ob = OBJECT_TILES[c.object[k]];
    const ocol = c.object[k] ? rgb(ob.colour) : gcol;
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      // Objects fill the middle of the tile, the ground shows round the edge.
      const edge = dx === 0 || dy === 0 || dx === S - 1 || dy === S - 1;
      const col = c.object[k] && (!edge || ob.group === 'wall' || ob.join) ? ocol : gcol;
      const o = ((y * S + dy) * size * S + x * S + dx) * 4;
      img[o] = col[0];
      img[o + 1] = col[1];
      img[o + 2] = col[2];
      img[o + 3] = 255;
    }
    if (c.cx * CHUNK + (k % CHUNK) === start[0] && c.cy * CHUNK + Math.floor(k / CHUNK) === start[1]) {
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) img.set([255, 0, 255, 255], ((y * S + dy) * size * S + x * S + dx) * 4);
    }
  }
  writeFileSync(String(args.png), encodePng(img, size * S, size * S));
  console.log(`Wrote ${args.png}`);
}

if (args.dump) {
  writeFileSync(String(args.dump), JSON.stringify({
    start, R, chunks: chunks.map((c) => ({ cx: c.cx, cy: c.cy, g: [...c.ground], o: [...c.object], a: [...c.area], areas: c.areas })),
    ground: GROUND_TILES.map((t) => [t.name, t.colour, t.pass]), object: OBJECT_TILES.map((t) => [t.name, t.colour, t.glyph ?? '', t.pass || !!t.toggle]),
  }));
}
