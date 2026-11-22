/**
 * Fresh and salt water (docs/backlog.md, W4): on a real world, the sea about a coastal city is salt
 * and the rivers through an inland one are fresh (game/map.ts, waterAt, which drinking, the search
 * for water and choosing a camp all go by).
 * npx tsx apps/game/scripts/water-test.ts (exits non-zero on a failure).
 */
import { CHUNK, LocalWorld } from '@worldforge/core/local/chunk';
import { GROUND_TILES } from '@worldforge/core/local/tiles';
import { generateWorld } from '@worldforge/core/gen/world';
import { GameMap } from '../src/game/map';
import type { ChunkData } from '../src/worker/protocol';

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
    map.add({ ...c, ms: 0 } as unknown as ChunkData);
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
const coast = waterAbout('Aghbazk');
ok((coast.water_deep?.salt ?? 0) > 1000 && !coast.water_deep?.fresh, `the open sea off a coastal city is salt (${JSON.stringify(coast.water_deep)})`);
ok((coast.water_shallow?.salt ?? 0) > 1000, `and so are its shallows (${JSON.stringify(coast.water_shallow)})`);
const inland = waterAbout('Chuqtah');
ok((inland.river_deep?.fresh ?? 0) > 1000 && !inland.river_deep?.salt && !inland.river?.salt, `the river through an inland city is fresh (${JSON.stringify(inland.river_deep)})`);

console.log(failures ? `\n${failures} failed` : '\nall water tests passed');
process.exit(failures ? 1 : 0);
