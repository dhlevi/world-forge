/**
 * The in-town view (docs/backlog.md, I1 to I4): arriving from the travel map anywhere in a town
 * or city opens its city view, with an account of the place; the account tells of the town by its
 * figures; and a walk across the town goes a minute at a time, the marker on the line between.
 * npx tsx apps/game/scripts/city-test.ts (exits non-zero on a failure).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TILE_M } from '@worldforge/core/local/chunk';
import { generateWorld } from '@worldforge/core/gen/world';
import { MessageDispatcher } from '../src/engine/messages';
import '../src/actors/cast';
import { readSave } from '../src/game/save';
import { PlaySession, type PlayOptions, type SessionHost, type SessionWorld } from '../src/game/session';
import { boardsOf, townAccount } from '../src/worker/sites';
import { TownManager } from '@worldforge/core/towns/manager';
import { LocalWorld, CHUNK } from '@worldforge/core/local/chunk';
import { OBJECT_TILES } from '@worldforge/core/local/tiles';
import { Stroll, perSecond } from '../src/screens/stroll';
import type { LocalSite, StartSite } from '../src/worker/protocol';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

console.log('the account of a town');
{
  const w = generateWorld({ seed: 'forge', landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 512 } as never, () => {});
  const towns = w.settlements.filter((s) => (s.tier === 'city' || s.tier === 'town') && !s.delve).slice(0, 12);
  const accounts = towns.map((s) => townAccount(w, s));
  ok(accounts.every((a) => a.length >= 3), `every town has an account of three lines or more (${accounts.map((a) => a.length).join(', ')})`);
  ok(towns.every((s, i) => accounts[i].join(' ').includes(s.population.toLocaleString('en')) || accounts[i].join(' ').includes(s.name ?? '-')), 'naming the place or its people');
  ok(accounts.every((a) => a.every((l) => !/—|\bcan't\b|\bdon't\b|\bisn't\b/.test(l))), 'in plain formal words');
  console.log(`  e.g. ${accounts[0].join(' ')}`);
}

console.log('\na walk across a town');
{
  const st = new Stroll({ lon: 0, lat: 0 }, { lon: 1, lat: 2 }, 10);
  let walked = 0;
  for (let i = 0; i < 1000 && !st.finished; i++) walked += st.step(0.05 * perSecond('steady'));
  ok(Math.abs(walked - 10) < 1e-9 && st.finished, `ten minutes walked, and no more (${walked.toFixed(2)})`);
  const half = new Stroll({ lon: 0, lat: 0 }, { lon: 1, lat: 2 }, 10);
  half.step(5);
  ok(Math.abs(half.at.lon - 0.5) < 1e-9 && Math.abs(half.at.lat - 1) < 1e-9, 'half way, the marker is half way along');
  ok(half.finish() === 5 && half.finished, 'hurrying on walks the rest');
  ok(new Stroll({ lon: 3, lat: 4 }, { lon: 3, lat: 4 }, 0).finished, 'a walk of nothing is done at once');
  ok(perSecond('slow') < perSecond('steady') && perSecond('steady') < perSecond('brisk'), 'the paces run slow to brisk');
}

console.log('\narriving from the travel map');
{
  const fixture = readFileSync(fileURLToPath(new URL('./fixtures/save-v1-camps.json', import.meta.url)), 'utf8');
  const restore = readSave(fixture);
  const [X, Y] = [restore.player.x, restore.player.y];
  const world: SessionWorld = {
    bus: new MessageDispatcher(),
    requestChunk: () => {},
    climate: async () => ({ warm: 18, cold: 2, precipSummer: 700, precipWinter: 700, windU: 0.6, windV: 0 }),
    requestRoute: async () => ({ steps: null, partial: false }),
    requestPeople: async () => ({ people: [], radius: 96 }),
    site: async () => ({ site: null, gates: [] }),
    starts: () => [],
  };
  const opened: { id: string; arrived?: boolean }[] = [];
  const host: SessionHost = { openCity: async (id, _at, arrived) => void opened.push({ id, arrived }), toTitle() {} };
  const site = { id: 's12', name: 'Onson', tier: 'city', population: 40000, lon: 10, lat: 50 } as StartSite;
  const at = (dx: number, tier: LocalSite['tier'], id: string): LocalSite => ({ id, name: id, tier, x: (X + dx + 0.5) * TILE_M, y: -(Y + 0.5) * TILE_M, radiusM: 400 });
  const session = (sites: LocalSite[]) => {
    const o: PlayOptions = { site, tile: [X, Y], sites, gameId: restore.id, settings: restore.settings, restore, character: null };
    const s = new PlaySession(world, host, o);
    s.game.updateHud();
    return s;
  };
  const inTown = session([at(0, 'town', 'c1')]);
  inTown.travel.onArrive(null);
  await new Promise((r) => setTimeout(r, 5));
  ok(opened.length === 1 && opened[0].id === 'c1' && opened[0].arrived === true, 'arriving at a spot within a town opens its city view, with the account');
  opened.length = 0;
  const inVillage = session([at(0, 'village', 'v1')]);
  inVillage.travel.onArrive(null);
  await new Promise((r) => setTimeout(r, 5));
  ok(opened.length === 0, 'but not in a village');
  const wilds = session([at(5000, 'city', 'c2')]);
  wilds.travel.onArrive(null);
  await new Promise((r) => setTimeout(r, 5));
  ok(opened.length === 0 && wilds.state.mode !== undefined, 'nor in the wilds');
  for (const s of [inTown, inVillage, wilds]) s.dispose();
}

console.log('notice boards in the square');
{
  const w = generateWorld({ seed: 'forge', landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 512 } as never, () => {});
  type S = (typeof w.settlements)[number];
  const tm = new TownManager(w as never);
  const towns = [...w.settlements.filter((s) => s.tier === 'city' && !s.delve && s.kind !== 'abandoned').slice(0, 4), ...w.settlements.filter((s) => s.tier === 'town' && !s.delve && s.kind !== 'abandoned').slice(0, 4)];
  const counts = towns.map((s) => boardsOf(tm.planOf(s) as never).length);
  ok(counts.every((n) => n >= 1 && n <= 3), `every town and city has one to three notice boards (${counts.join(', ')})`);
  const t = w.settlements.find((s) => s.tier === 'town' && !s.delve && s.kind !== 'abandoned')!;
  const box = { west: t.lon - 0.3, east: t.lon + 0.3, south: t.lat - 0.2, north: t.lat + 0.2 };
  tm.update(box, 9, 1e6);
  const villages = tm.regionSites(box, 400).filter((s) => s.tier === 'village' && !s.delve && s.kind !== 'abandoned').slice(0, 6) as S[];
  const vc = villages.map((s) => boardsOf(tm.planOf(s) as never).length);
  ok(villages.length > 0 && vc.every((n) => n === 1), `every village has one, by its well (${vc.join(', ')})`);
  // On the local map: a board stands on its tile.
  const city = towns[0];
  const lw = new LocalWorld(w, city);
  const standing = boardsOf(tm.planOf(city) as never).map((b) => {
    const [x, y] = lw.tileAt(b.lon, b.lat);
    const c = lw.chunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    return OBJECT_TILES[c.object[(y - Math.floor(y / CHUNK) * CHUNK) * CHUNK + (x - Math.floor(x / CHUNK) * CHUNK)]]?.name;
  });
  ok(standing.every((n) => n === 'notice_board'), `on the local map each stands where the plan puts it (${standing.join(', ')})`);
}

console.log(failures ? `\n${failures} failed` : '\nall city tests passed');
process.exit(failures ? 1 : 0);
