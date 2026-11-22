/**
 * Route choices (docs/backlog.md, T2; core local/travel.ts): on a real world, from a city to a place
 * some way off, the most direct route is shorter in steps than the quickest (and slower);
 * keeping to the roads walks more of its way on roads; going round rivers fords fewer of them; and
 * every route ends where it was asked to, with the minutes it takes to walk.
 * npx tsx apps/game/scripts/route-test.ts (exits non-zero on a failure).
 */
import { CHUNK, LocalWorld } from '@worldforge/core/local/chunk';
import { TravelGrid, type RouteOptions } from '@worldforge/core/local/travel';
import { generateWorld } from '@worldforge/core/gen/world';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

const w = generateWorld({ seed: 'forge', landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 512 } as never, () => {});
const city = w.settlements.filter((s) => s.tier === 'city').sort((a, b) => b.population - a.population)[0];
const local = new LocalWorld(w, city);
const grid = new TravelGrid(local);
const [sx, sy] = local.startTile();
const from: [number, number] = [Math.floor(sx / CHUNK), Math.floor(sy / CHUNK)];
// Points 8 to 20 km off in every direction, not on water, that can be reached.
const route = (to: [number, number], o: RouteOptions) => grid.route(from[0], from[1], to[0], to[1], 400000, o);
const targets: [number, number][] = [];
for (let k = 0; k < 24; k++) {
  const a = (k / 24) * Math.PI * 2, d = 85 + (k % 4) * 40;
  const to: [number, number] = [from[0] + Math.round(Math.cos(a) * d), from[1] + Math.round(Math.sin(a) * d)];
  if (!grid.cell(to[0], to[1]).blocked && route(to, {})) targets.push(to);
}
ok(targets.length >= 6, `places 8 to 20 km off to go to (${targets.length})`);
const onRoad = (r: { cells: [number, number][] }) => r.cells.filter(([x, y]) => ['road', 'track', 'street'].includes(grid.cell(x, y).way)).length;
const fords = (r: { cells: [number, number][] }) => r.cells.filter(([x, y]) => grid.cell(x, y).ford).length;
let all = true;
const steps = [0, 0], mins = [0, 0], road = [0, 0], ford = [0, 0];
for (const to of targets) {
  const fast = route(to, {})!, direct = route(to, { mode: 'direct' })!, roads = route(to, { mode: 'roads' })!, dry = route(to, { avoidFords: true })!;
  for (const r of [fast, direct, roads, dry]) if (!r || r.cells[r.cells.length - 1].join() !== to.join() || !(r.minutes > 0)) all = false;
  steps[0] += fast.cells.length;
  steps[1] += direct.cells.length;
  mins[0] += fast.minutes;
  mins[1] += direct.minutes;
  road[0] += onRoad(fast) / fast.cells.length;
  road[1] += onRoad(roads) / roads.cells.length;
  ford[0] += fords(fast);
  ford[1] += fords(dry);
}
ok(all, 'every choice gets there, with its minutes');
ok(steps[1] < steps[0] && mins[1] > mins[0], `the most direct takes fewer steps, and longer (${steps[1]} steps, ${Math.round(mins[1])} min; the quickest ${steps[0]}, ${Math.round(mins[0])} min)`);
ok(road[1] > road[0], `keeping to the roads walks more on them (${Math.round((road[1] / targets.length) * 100)}% against ${Math.round((road[0] / targets.length) * 100)}%)`);
ok(ford[1] <= ford[0], `going round rivers fords no more of them (${ford[1]} against ${ford[0]})`);

console.log(failures ? `\n${failures} failed` : '\nall route tests passed');
process.exit(failures ? 1 : 0);
