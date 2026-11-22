/**
 * The people of a delve (docs/backlog.md, D1; worker/delve.ts): on a real world, the halls under
 * the largest dwarven city have households in their clan homes and people at work in the forges,
 * the smelters, the market and the barracks, each placed on a floor tile of the halls; the same
 * place and time give the same people; and a town with no delve gets none.
 * npx tsx apps/game/scripts/delve-test.ts (exits non-zero on a failure).
 */
import { CHUNK, LocalWorld } from '@worldforge/core/local/chunk';
import { GROUND_TILES } from '@worldforge/core/local/tiles';
import { generateWorld } from '@worldforge/core/gen/world';
import { delveFolkIn } from '../src/worker/delve';
import { GameMap } from '../src/game/map';
import { Population, type PopulationView } from '../src/world/population';
import type { ChunkData } from '../src/worker/protocol';
import '../src/actors/cast';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

const w = generateWorld({ seed: 'forge', landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 512 } as never, () => {});
const delve = w.settlements.filter((s) => s.delve).sort((a, b) => b.population - a.population)[0];
const local = new LocalWorld(w, delve);
const [x, y] = local.startTile();
const T = 86400 * 2 + 10 * 3600;
const folk = delveFolkIn(w, local, x + 120, y, 128, T);
const trades = new Set(folk.map((p) => p.trade));
ok(folk.length >= 40, `the halls under ${delve.name} have their people (${folk.length})`);
ok(['smith', 'smelter', 'merchant', 'warden'].every((t) => trades.has(t)) && trades.has('child'), `smiths, smelters, merchants, wardens and children (${[...trades].join(', ')})`);
ok(folk.every((p) => p.template !== 'guard' || p.trade === 'warden'), 'the wardens keep the peace (and only they)');
const onFloor = folk.filter((p) => p.at).every((p) => {
  const c = local.chunk(Math.floor(p.at!.x / CHUNK), Math.floor(p.at!.y / CHUNK));
  const L = c.layers.find((l) => l.z === p.at!.z);
  const k = (p.at!.y - Math.floor(p.at!.y / CHUNK) * CHUNK) * CHUNK + (p.at!.x - Math.floor(p.at!.x / CHUNK) * CHUNK);
  return !!L && L.ground[k] > 0 && GROUND_TILES[L.ground[k]].pass;
});
ok(onFloor, 'each stands on a floor of the halls');
const keys = folk.filter((p) => p.at).map((p) => `${p.at!.x},${p.at!.y},${p.at!.z}`);
ok(new Set(keys).size === keys.length, 'no two on one tile');
const working = folk.filter((p) => p.at && p.plan.find((s) => s.from <= 10 && s.to > 10)?.act === 'work').length;
ok(working >= folk.length / 3, `at ten in the morning, most grown ones are at work (${working})`);
ok(JSON.stringify(delveFolkIn(w, local, x + 120, y, 128, T)) === JSON.stringify(folk), 'the same place and time give the same people');
// Played: in the halls, at noon they go to their meal, walking the halls' ways.
{
  const map = new GameMap(() => {});
  for (let cy = Math.floor(y / CHUNK) - 3; cy <= Math.floor(y / CHUNK) + 5; cy++) for (let cx = Math.floor(x / CHUNK) - 3; cx <= Math.floor(x / CHUNK) + 6; cx++) map.add({ ...local.chunk(cx, cy), ms: 0 } as unknown as ChunkData);
  const first = folk.find((p) => p.at)!;
  const view: PopulationView & { time: number; px: number; py: number } = { px: first.at!.x, py: first.at!.y, z: first.at!.z, time: 86400 * 2 + 11.5 * 3600, map, isVisible: () => false };
  const pop = new Population(() => Promise.resolve({ people: [], radius: 0 }), 'forge');
  const at1130 = delveFolkIn(w, local, x + 120, y, 128, view.time);
  pop.take(at1130, view);
  const before = new Map([...pop.everyone()].map((r) => [r.p.id, `${r.x},${r.y},${r.z}`]));
  // From half past eleven to half past twelve.
  for (let i = 0; i < 180; i++) {
    view.time += 20;
    pop.run(view);
  }
  const moved = [...pop.everyone()].filter((r) => r.present && before.get(r.p.id) !== `${r.x},${r.y},${r.z}`).length;
  ok(pop.size >= 40 && moved >= 10, `placed in the halls (${pop.size}), by half past noon many have gone to their meal (${moved} moved)`);
}

const town = w.settlements.find((s) => s.tier === 'town' && !s.delve)!;
const tl = new LocalWorld(w, town);
const [tx, ty] = tl.startTile();
ok(delveFolkIn(w, tl, tx, ty, 96, T).length === 0, 'a town with no delve has none');

console.log(failures ? `\n${failures} failed` : '\nall delve tests passed');
process.exit(failures ? 1 : 0);
