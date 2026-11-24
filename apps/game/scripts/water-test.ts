/**
 * Fresh and salt water (docs/backlog.md, W4): on a real world, the open sea is salt; rivers, and lakes
 * (even an enclosed basin whose bed lies below the sea's level), are fresh; and every lived-in place
 * has a well or a fountain (game/map.ts, waterAt, which drinking, the search
 * for water and choosing a camp all go by).
 * npx tsx apps/game/scripts/water-test.ts (exits non-zero on a failure).
 */
import { CHUNK, LocalWorld, TILE_M } from '@worldforge/core/local/chunk';
import { GROUND_TILES } from '@worldforge/core/local/tiles';
import { generateWorld } from '@worldforge/core/gen/world';
import { GameMap } from '../src/game/map';
import type { ChunkData } from '../src/worker/protocol';
import { seaCells, seaOf } from '../src/worker/water';
import { planOf } from '../src/worker/sites';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

const w = generateWorld({ seed: 'forge', landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 512 } as never, () => {});

/** The water about a settlement's start, by kind: how many tiles of each are fresh and salt. */
function waterAbout(name: string): Record<string, { fresh: number; salt: number }> {
  const s = w.settlements.find((x) => x.name === name)!;
  const local = new LocalWorld(w, s);
  const [x, y] = local.startTile();
  const map = new GameMap(() => {});
  const out: Record<string, { fresh: number; salt: number }> = {};
  for (let cy = Math.floor(y / CHUNK) - 3; cy <= Math.floor(y / CHUNK) + 3; cy++) for (let cx = Math.floor(x / CHUNK) - 3; cx <= Math.floor(x / CHUNK) + 3; cx++) {
    const c = local.chunk(cx, cy);
    map.add({ ...c, ms: 0, salt: seaOf(local, cx, cy, c.ground, c.elev) } as unknown as ChunkData);
    for (let k = 0; k < CHUNK * CHUNK; k++) {
      const g = GROUND_TILES[c.ground[k]];
      if (!g.water) continue;
      const tx = cx * CHUNK + (k % CHUNK), ty = cy * CHUNK + Math.floor(k / CHUNK);
      const kind = map.waterAt(tx, ty);
      const o = (out[g.name] ??= { fresh: 0, salt: 0 });
      if (kind) o[kind]++;
    }
  }
  return out;
}

console.log('the sea and the rivers');
const seaMap = seaCells(w.raster);
/** The water close in at a point of the world, by kind: how many tiles of each are fresh and salt. */
function waterAt(lon: number, lat: number): Record<string, { fresh: number; salt: number }> {
  const near = w.settlements.filter((x) => !x.delve).sort((a, b) => Math.hypot(a.lon - lon, a.lat - lat) - Math.hypot(b.lon - lon, b.lat - lat))[0];
  const local = new LocalWorld(w, near);
  const [mx, my] = local.frame.fromLL(lon, lat);
  const cx = Math.floor(mx / TILE_M / CHUNK), cy = Math.floor(-my / TILE_M / CHUNK);
  const map = new GameMap(() => {});
  const c = local.chunk(cx, cy);
  map.add({ ...c, ms: 0, salt: seaOf(local, cx, cy, c.ground, c.elev) } as unknown as ChunkData);
  const out: Record<string, { fresh: number; salt: number }> = {};
  for (let k = 0; k < CHUNK * CHUNK; k++) {
    const g = GROUND_TILES[c.ground[k]];
    if (!g.water) continue;
    const kind = map.waterAt(cx * CHUNK + (k % CHUNK), cy * CHUNK + Math.floor(k / CHUNK));
    const o = (out[g.name] ??= { fresh: 0, salt: 0 });
    if (kind) o[kind]++;
  }
  return out;
}
// The sea a little way off the shore: sea cells of the raster with land beside them.
const { W: RW, H: RH } = w.raster;
const shore: number[] = [];
for (let c = RW; c < RW * (RH - 1); c++) if (seaMap[c] === 1 && (seaMap[c - 1] === 0 || seaMap[c + 1] === 0 || seaMap[c - RW] === 0 || seaMap[c + RW] === 0)) shore.push(c);
const coast: Record<string, { fresh: number; salt: number }> = {};
for (const c of shore.filter((_, i) => i % Math.floor(shore.length / 4) === 0).slice(0, 4)) {
  const r = waterAt(((c % RW) + 0.5) / RW * 360 - 180, 90 - (Math.floor(c / RW) + 0.5) / RH * 180);
  for (const [k, v] of Object.entries(r)) {
    const o = (coast[k] ??= { fresh: 0, salt: 0 });
    o.fresh += v.fresh;
    o.salt += v.salt;
  }
}
ok((coast.water_deep?.salt ?? 0) > 1000 && !coast.water_deep?.fresh, `the open sea off the coasts is salt (${JSON.stringify(coast.water_deep)})`);
ok(!coast.water_shallow?.fresh, `and so are any shallows there (${JSON.stringify(coast.water_shallow ?? {})})`);
const lakeside = waterAbout('Aghbazk');
const lw = Object.values(lakeside).reduce((a, b) => ({ fresh: a.fresh + b.fresh, salt: a.salt + b.salt }), { fresh: 0, salt: 0 });
ok(lw.fresh > 1000 && lw.salt === 0, `the lake beside Aghbazk, inland though its bed lies below the sea's level, is fresh (${JSON.stringify(lw)})`);
const inland = waterAbout('Chuqtah');
ok((inland.river_deep?.fresh ?? 0) > 1000 && !inland.river_deep?.salt && !inland.river?.salt, `the river through an inland city is fresh (${JSON.stringify(inland.river_deep)})`);


console.log('\nlakes');
{
  // Inland water below the sea's level, enclosed and away from the sea, is a lake: fresh. A few of
  // the world's enclosed basins, looked at close.
  const sea = seaCells(w.raster);
  const { W, H } = w.raster;
  const basins: number[] = [];
  for (let c = 0; c < W * H; c++) if (sea[c] === 2) basins.push(c);
  let lake = 0, salty = 0;
  for (const c of basins.filter((_, i) => i % Math.max(1, Math.floor(basins.length / 5)) === 0).slice(0, 5)) {
    const lon = (((c % W) + 0.5) / W) * 360 - 180, lat = 90 - ((Math.floor(c / W) + 0.5) / H) * 180;
    const near = w.settlements.filter((x) => !x.delve).sort((a, b) => Math.hypot(a.lon - lon, a.lat - lat) - Math.hypot(b.lon - lon, b.lat - lat))[0];
    const local = new LocalWorld(w, near);
    const [mx, my] = local.frame.fromLL(lon, lat);
    const tx = Math.floor(mx / TILE_M), ty = Math.floor(-my / TILE_M);
    const ch = local.chunk(Math.floor(tx / CHUNK), Math.floor(ty / CHUNK));
    const salt = seaOf(local, Math.floor(tx / CHUNK), Math.floor(ty / CHUNK), ch.ground, ch.elev);
    for (let k = 0; k < CHUNK * CHUNK; k++) {
      const g = GROUND_TILES[ch.ground[k]];
      if (!g.water || g.name.startsWith('river')) continue;
      lake++;
      if (salt[k]) salty++;
    }
  }
  ok(basins.length > 0 && lake > 0 && salty === 0, `water in the basins inland, below the sea's level and cut off from it, is fresh (${lake} tiles looked at, ${salty} salt)`);

}

console.log('\nwater in every village');
{
  const places = w.settlements.filter((s) => s.kind !== 'abandoned' && !s.delve);
  const sample = places.filter((_, i) => i % Math.max(1, Math.floor(places.length / 40)) === 0).slice(0, 40);
  const local = new LocalWorld(w, sample[0]);
  const dry = sample.filter((s) => !planOf(local.towns, s).some((f) => /^(well|fountain|pump)$/.test(String(f.properties.kind))));
  ok(dry.length === 0, `every lived-in place has a well or a fountain (${sample.length - dry.length} of ${sample.length}${dry.length ? `; none in ${dry.map((s) => `${s.name} (${s.tier}, ${s.kind})`).join(', ')}` : ''})`);
}

console.log(failures ? `\n${failures} failed` : '\nall water tests passed');
process.exit(failures ? 1 : 0);
