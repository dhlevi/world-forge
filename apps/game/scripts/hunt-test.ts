/**
 * Hunting by tracking and skinning (docs/design/fieldcraft.md, stage 2): a beast's trail is laid back
 * from where it is, prints on soft ground and faint signs on firm; every wild herd placed has one;
 * the travel map's Hunt finds signs of the region's game; taking one up places the beasts some way
 * off with their trail past the hunter; following it reads it ahead, marks it and walks it until
 * the beasts are in sight; and a carcass is skinned (Hideworking) before it is butchered.
 * npx tsx apps/game/scripts/hunt-test.ts (exits non-zero on a failure).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHUNK } from '@worldforge/core/local/chunk';
import { G } from '@worldforge/core/local/tiles';
import { SPECIES_BY_ID } from '@worldforge/core/local/fauna';
import { mulberry32 } from '@worldforge/core/gen/rng';
import { MessageDispatcher } from '../src/engine/messages';
import '../src/actors/cast';
import { Inventory } from '../src/actors/items/inventory';
import { defOf, itemName, makeItem } from '../src/actors/items/item';
import { Skills } from '../src/actors/components';
import { readSave } from '../src/game/save';
import { PlaySession, type PlayOptions, type SessionWorld } from '../src/game/session';
import { Tracks, layTrail } from '../src/world/senses';
import { butcher, carcassOf, skin } from '../src/world/hunting';
import type { ChunkData, StartSite } from '../src/worker/protocol';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/save-v1-camps.json', import.meta.url)), 'utf8');
const restore = readSave(fixture);
const [X, Y] = [restore.player.x, restore.player.y];
const world: SessionWorld = {
  bus: new MessageDispatcher(),
  requestChunk: () => {},
  climate: async () => ({ warm: 18, cold: 2, precipSummer: 700, precipWinter: 700, windU: 0.6, windV: 0 }),
  requestRoute: async () => ({ steps: null, partial: false }),
  requestPeople: async () => ({ people: [], radius: 96 }),
  game: async () => [{ id: 'red_deer', density: 0.6 }, { id: 'boar', density: 0.4 }],
  site: async () => ({ site: null, gates: [] }),
  starts: () => [],
};

/** Open country: dry grass with a band of bare earth across it. */
function session(): PlaySession {
  const o: PlayOptions = { site: { id: 's12', name: 'Onson', tier: 'city', population: 40000, lon: 10, lat: 50 } as StartSite, tile: [X, Y], sites: [], gameId: restore.id, settings: restore.settings, restore, character: null };
  const s = new PlaySession(world, { openCity: async () => {}, toTitle() {} }, o);
  const N = CHUNK * CHUNK;
  const [cx0, cy0] = [Math.floor(X / CHUNK), Math.floor(Y / CHUNK)];
  for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
    const ground = new Uint8Array(N);
    for (let k = 0; k < N; k++) ground[k] = G(Math.abs(cx * CHUNK + (k % CHUNK) - X) < 3 ? 'dirt' : 'grass');
    s.map.add({ cx, cy, ground, object: new Uint8Array(N), area: new Uint16Array(N), areas: [''], elev: new Int16Array(N).fill(30), sites: [], roofs: [], layers: [], ms: 0 } as ChunkData);
  }
  s.game.z = null;
  s.field.stepMs = 0;
  s.game.px = X;
  s.game.py = Y;
  s.player!.need(Skills).d.levels.tracking = 50;
  return s;
}

console.log('trails');
{
  const s = session();
  const t = new Tracks();
  const n = layTrail(t, s.map, { by: 'animal:test', kind: 'animal:red_deer', to: { x: X + 10, y: Y, z: null }, steps: 30, newest: 100000, perStep: 120, r: mulberry32(7) });
  const all = t.ofMaker('animal:test', X + 10, Y, 40, 100000);
  ok(n >= 25 && all.length === n, `a trail of ${n} tracks is laid back from the beast`);
  ok(all[all.length - 1].x === X + 10 && all[all.length - 1].t === 100000, 'the newest where the beast is, the older further back');
  const at = (x: number, y: number) => t.at(x, y, null, 100000)[0];
  ok(all.some((p) => at(p.x, p.y)?.faint) || all.every((p) => Math.abs(p.x - X) < 3), 'faint signs on dry grass');
  const toward = layTrail(t, s.map, { by: 'animal:t2', kind: 'animal:boar', to: { x: X + 30, y: Y + 10, z: null }, steps: 60, newest: 100000, perStep: 60, toward: { x: X, y: Y, z: null }, r: mulberry32(9) });
  const end = t.ofMaker('animal:t2', X, Y, 60, 100000)[0];
  ok(toward > 10 && Math.abs(end.x - X) <= 2 && Math.abs(end.y - Y) <= 2, `a trail can be laid to pass by a place (ends ${end.x - X}, ${end.y - Y} from it)`);
  // Every wild herd placed gets its trail.
  s.fauna.take([{ id: 'w:0,0:0:roe_deer:0', species: 'roe_deer', members: [{ x: X + 50, y: Y + 50, z: null }], home: { x: X + 50, y: Y + 50, r: 20 }, water: null }], s.game);
  ok(s.people.tracks.ofMaker('animal:w:0,0:0:roe_deer:0', X + 50, Y + 50, 60, s.game.time).length >= 10, 'every wild herd placed has its trail');
  s.dispose();
}

console.log('\nsigns on the travel map');
{
  const s = session();
  s.state.mode = 'travel';
  let found = 0;
  for (let i = 0; i < 6; i++) found += await s.hunt.lookForSigns('search');
  const signs = s.hunt.live();
  ok(found >= 2 && signs.length === found, `hunting the country about finds signs of game (${found} in six hours)`);
  ok(signs.every((g) => g.species === 'red_deer' || g.species === 'boar'), 'of the beasts the region holds');
  ok(signs.every((g) => s.hunt.metresTo(g) > 100 && s.hunt.metresTo(g) < 1000), `some way off (${signs.map((g) => Math.round(s.hunt.metresTo(g))).join(', ')} m)`);
  // Taking one up from close by: onto the local map, the beasts placed and their trail past the hunter.
  const sg = { ...signs[0], x: X + 2, y: Y };
  s.hunt.signs = [sg];
  s.hunt.takeUp(sg);
  const sp = SPECIES_BY_ID.get(sg.species)!;
  const herd = [...s.fauna.all()].filter((a) => a.g.id === `hunt:${sg.id}`);
  ok((s.state.mode as string) === 'local' && herd.length >= 1, `taking up the trail goes onto the local map, with the ${sp.plural} placed (${herd.length})`);
  const d = herd.length ? Math.hypot(herd[0].x - X, herd[0].y - Y) : 0;
  ok(d >= 20 && d <= 45, `some way off (${Math.round(d)} tiles)`);
  const near = s.people.tracks.ofMaker(`animal:hunt:${sg.id}`, X, Y, 4, s.game.time);
  ok(near.length >= 1 && near.some((t) => s.hunt.onTrail(t.x, t.y)), 'their trail passes by the hunter, marked');
  // Following it.
  const start = near[0];
  ok(s.field.actions(start.x, start.y).some((a) => a.id === 'follow'), 'a track on it offers following the trail');
  let seen = false;
  for (let i = 0; i < 6 && !seen; i++) {
    const tr = s.people.tracks.ofMaker(`animal:hunt:${sg.id}`, s.game.px, s.game.py, 2, s.game.time);
    const here = tr[tr.length - 1] ?? start;
    await s.hunt.follow(here.x, here.y);
    seen = [...s.fauna.all()].some((a) => a.g.id === `hunt:${sg.id}` && s.game.isVisible(a.x, a.y));
  }
  const left = herd.length ? Math.hypot(herd[0].x - s.game.px, herd[0].y - s.game.py) : 99;
  ok(seen || left < d, `following it brings the hunter on toward them (${Math.round(d)} tiles to ${Math.round(left)}${seen ? ', in sight' : ''})`);
  s.dispose();
}

console.log('\nshooting, shown');
{
  const s = session();
  const p = s.player!, inv = p.need(Inventory);
  p.need(Skills).d.levels.archery = 70;
  inv.d.items.push({ ...makeItem('hunting_bow'), loc: { at: 'hand', hand: 'both' } }, { ...makeItem('arrows', { qty: 20 }), loc: { at: 'back' } });
  for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) if (s.map.object(X + dx, Y + dy)) s.map.setObject(X + dx, Y + dy, 0);
  s.state.mode = 'local';
  s.game.ambient = { light: 1, range: 30 };
  s.fauna.pin({ id: 'hunt:shot', species: 'red_deer', members: [{ x: X + 8, y: Y, z: null }, { x: X + 8, y: Y + 2, z: null }], home: { x: X + 8, y: Y, r: 10 }, water: null }, s.game);
  s.game.refresh();
  let hits = 0, shots = 0;
  const kinds = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const f = s.fights.shootable()[0];
    if (!f) break;
    const m = s.fights.missiles().find((x) => x.how === 'shoot')!;
    s.game.fx = [];
    s.fights.shoot(f, m, null);
    const line = s.hud.log[s.hud.log.length - 1];
    if (line.tone === 'hit' || line.tone === 'kill') hits++;
    shots++;
    for (const e of s.game.fx) kinds.add(e.kind === 'float' ? `float:${e.text.split(':')[0]}` : e.kind);
  }
  ok(shots >= 3 && hits >= shots * 0.6, `a skilled archer hits a deer close by most times (${hits} of ${shots})`);
  ok(kinds.has('shot') && [...kinds].some((k) => k.startsWith('float:')), `each shot is shown: the arrow's flight and what came of it (${[...kinds].join(', ')})`);
  ok(s.hud.log.some((l) => l.tone), 'and the log marks the hits and misses');
  const targets = s.fights.shootable();
  ok(targets.length >= 2, 'with two deer in sight there are two to choose between');
  s.dispose();
}

console.log('\nskinning');
{
  const s = session();
  const a = s.player!, inv = a.need(Inventory);
  const deer = SPECIES_BY_ID.get('red_deer')!;
  const c1 = carcassOf(deer);
  const sk = skin(a, c1, inv, s.game.time)!;
  ok(!!sk && c1.skinned === true && sk.items.length <= 1 && (!sk.items.length || sk.items[0].def === 'hide_red_deer'), `skinning gives the red deer's own hide (${sk.items[0] ? `${itemName(sk.items[0])}, ${sk.items[0].quality}` : 'spoilt'}): "${sk.text}"`);
  ok(skin(a, c1, inv, s.game.time) === null, 'and a carcass is skinned once');
  const b1 = butcher(a, inv, c1, s.game.time)!;
  const isHide = (d: string) => /^(hide|pelt)_/.test(d);
  ok(b1.items.some((i) => i.def === 'raw_meat') && !b1.items.some((i) => isHide(i.def)), 'butchered after, it gives the meat, the hide taken already');
  const b2 = butcher(a, inv, carcassOf(deer), s.game.time)!;
  const hide = b2.items.find((i) => isHide(i.def));
  ok(!hide || hide.quality === 'poor', 'butchered unskinned, the hide is hacked off, poor at best');
  let fine = 0;
  for (let i = 0; i < 40; i++) {
    a.need(Skills).d.levels.hideworking = 70;
    const r = skin(a, carcassOf(deer), inv, s.game.time);
    if (r?.items[0]?.quality === 'fine' || r?.items[0]?.quality === 'common') fine++;
  }
  ok(fine >= 25, `a skilled hand skins well (${fine} of 40 sound or fine)`);
  const fox = skin(a, carcassOf(SPECIES_BY_ID.get('fox')!), inv, s.game.time), bear = butcher(a, inv, carcassOf(SPECIES_BY_ID.get('brown_bear')!), s.game.time);
  const bh = bear?.items.find((i) => isHide(i.def));
  ok(fox?.items[0]?.def === 'pelt_fox' && (!bh || bh.def === 'pelt_brown_bear'), `each beast its own: ${fox?.items[0] ? itemName(fox.items[0]) : '(spoilt)'}, ${bh ? itemName(bh) : '(spoilt)'}`);
  ok(defOf(makeItem('hide_red_deer')).weight > defOf(makeItem('pelt_fox')).weight, 'a deer hide weighing more than a fox pelt');
  s.dispose();
}

console.log(failures ? `\n${failures} failed` : '\nall hunting tests passed');
process.exit(failures ? 1 : 0);
