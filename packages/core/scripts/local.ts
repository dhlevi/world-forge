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
import { LocalWorld, CHUNK, chunkHash, type Chunk } from '../src/local/chunk';
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
