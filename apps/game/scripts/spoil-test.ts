/**
 * Food that spoils, and keeping it (docs/design/survival.md, Food; actors/items/spoil.ts,
 * game/preserving.ts): the stages by age and the warmth of the air; food carried ageing as time
 * passes; stale food less nourishing and rotten food warned of and likely to sicken; age carried
 * through roasting; smoking at a fire, salting, and drying on a rack at a camp. And two fixes from
 * play: one snare system (a camp's old snares made ordinary snares on loading), and gathering sticks
 * and stones as work that takes its time.
 * npx tsx apps/game/scripts/spoil-test.ts (exits non-zero on a failure).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHUNK, TILE_M } from '@worldforge/core/local/chunk';
import { G, O, OBJECT_TILES } from '@worldforge/core/local/tiles';
import { MessageDispatcher } from '../src/engine/messages';
import '../src/actors/cast';
import { readSave } from '../src/game/save';
import { PlaySession, type PlayOptions, type SessionHost, type SessionWorld } from '../src/game/session';
import type { ChunkData, LocalSite, StartSite } from '../src/worker/protocol';

import { Inventory } from '../src/actors/items/inventory';
import { itemName, makeItem } from '../src/actors/items/item';
import { ageFood, keepsDays, spoilStage } from '../src/actors/items/spoil';
import { Needs } from '../src/actors/needs';
import { Traits } from '../src/actors/components';
import { eatPortion } from '../src/rules/tasks';
import { dryRacks } from '../src/game/preserving';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/save-v1-camps.json', import.meta.url)), 'utf8');
const start = readSave(fixture);
const [X, Y] = [start.player.x, start.player.y];

function world(people: never[]): SessionWorld {
  return {
    bus: new MessageDispatcher(),
    requestChunk: () => {},
    climate: async () => ({ warm: 18, cold: 2, precipSummer: 700, precipWinter: 700, windU: 0.6, windV: 0 }),
    requestRoute: async () => ({ steps: null, partial: false }),
    requestPeople: async () => ({ people, radius: 96 }),
    site: async () => ({ site: null, gates: [] }),
    starts: () => [],
  };
}
const host = { openCity: async () => {}, toTitle() {}, mercy() {} } satisfies SessionHost;
const site = { id: 's12', name: 'Onson', tier: 'city', population: 40000, lon: 10, lat: 50 } as StartSite;

/** A session on open grass (in a town if `town`), with these people about. */
async function play(people: never[] = [], town = false, edit?: (r: ReturnType<typeof readSave>) => void): Promise<PlaySession> {
  const restore = readSave(fixture);
  edit?.(restore);
  const sites: LocalSite[] = town ? [{ id: 'c1', name: 'Onson', tier: 'town', x: (X + 0.5) * TILE_M, y: -(Y + 0.5) * TILE_M, radiusM: 400 }] : [];
  const o: PlayOptions = { site, tile: [restore.player.x, restore.player.y], sites, gameId: restore.id, settings: restore.settings, restore, character: null };
  const s = new PlaySession(world(people), host, o);
  const N = CHUNK * CHUNK;
  const [cx0, cy0] = [Math.floor(X / CHUNK), Math.floor(Y / CHUNK)];
  for (let cy = cy0 - 3; cy <= cy0 + 3; cy++) for (let cx = cx0 - 3; cx <= cx0 + 3; cx++) {
    s.map.add({ cx, cy, ground: new Uint8Array(N).fill(G('grass')), object: new Uint8Array(N), area: new Uint16Array(N), areas: [''], elev: new Int16Array(N).fill(30), sites: [], roofs: [], layers: [], ms: 0 } as ChunkData);
  }
  s.game.z = null;
  s.state.mode = 'local';
  s.game.ambient = { light: 1, range: 30 };
  s.field.stepMs = 0;
  s.advance(1);
  for (let i = 0; i < 20 && s.people.size < people.length; i++) await new Promise((r) => setTimeout(r, 5));
  s.advance(1);
  return s;
}
const objAt = (s: PlaySession, x: number, y: number) => OBJECT_TILES[s.map.objectAt(x, y, null)].name;
const ids = (s: PlaySession, x: number, y: number) => s.field.actions(x, y).map((a) => `${a.id}${a.why ? '!' : ''}`);
const last = (s: PlaySession) => s.hud.log[s.hud.log.length - 1]?.text ?? '';



const inv = (s: PlaySession) => s.player!.need(Inventory);
const give = (s: PlaySession, def: string, qty = 1, o: { aged?: number } = {}) => {
  const it = { ...makeItem(def, { qty }), ...o, loc: { at: 'pack' } } as never;
  inv(s).d.items.push(it);
  return it as ReturnType<typeof makeItem>;
};
const has = (s: PlaySession, def: string) => inv(s).d.items.filter((i) => i.def === def).reduce((n, i) => n + i.qty, 0);
const fed = (s: PlaySession) => Object.assign(s.player!.need(Needs).d, { hydrated: 100, hydrationL: 2, stomachL: 0.2, nourish: 80, stomachKcal: 0, reserveKcal: 1500, fatigue: 0, debt: 0, heat: 0 });

console.log('how food spoils');
{
  const meat = { def: 'raw_meat', aged: 0 };
  ageFood([meat], 24, 15);
  ok(spoilStage('raw_meat', meat.aged) === 'stale', `raw meat a day in mild air is stale (${meat.aged} days)`);
  ageFood([meat], 24, 15);
  ok(spoilStage('raw_meat', meat.aged) === 'spoiling', 'two days, spoiling');
  ageFood([meat], 24, 15);
  ok(spoilStage('raw_meat', meat.aged) === 'rotten', 'three, rotten');
  const frozen = { def: 'raw_meat', aged: 0 };
  ageFood([frozen], 24 * 20, -10);
  ok(spoilStage('raw_meat', frozen.aged) === 'fresh', 'frozen, it keeps for weeks');
  const hot = { def: 'raw_meat', aged: 0 };
  ageFood([hot], 12, 32);
  ok(spoilStage('raw_meat', hot.aged) !== 'fresh', 'in summer heat it is stale in half a day');
  ok(keepsDays('dried_meat')! > 100 && keepsDays('salt_fish')! > 200 && keepsDays('stone') === null, 'dried and salted food keeps for months; a stone does not spoil');
}
{
  const s = await play();
  give(s, 'raw_meat');
  give(s, 'nuts');
  s.game.time += 2 * 86400;
  s.advance(1);
  const meat = inv(s).d.items.find((i) => i.def === 'raw_meat')!;
  ok(spoilStage('raw_meat', meat.aged) !== 'fresh' && /^(stale|spoiling|rotten) raw meat/.test(itemName(meat)), `carried two days, it is "${itemName(meat)}"`);
  ok(spoilStage('nuts', inv(s).d.items.find((i) => i.def === 'nuts')!.aged) === 'fresh', 'and the nuts still fresh');
  s.dispose();
}

console.log('\neating it');
{
  const s = await play();
  fed(s);
  const fresh = give(s, 'bread'), stale = give(s, 'bread', 1, { aged: 4 });
  const n = s.player!.need(Needs);
  let k0 = n.d.stomachKcal;
  eatPortion(s.player!, inv(s), fresh);
  const kFresh = n.d.stomachKcal - k0;
  k0 = n.d.stomachKcal;
  const o = eatPortion(s.player!, inv(s), stale);
  ok(n.d.stomachKcal - k0 < kFresh && /stale/.test(o.text), `stale bread is less nourishing (${Math.round(n.d.stomachKcal - k0)} kcal to ${Math.round(kFresh)}): "${o.text}"`);
  // Rotten: warned first, eaten if chosen again, and likely sickening.
  (s.player!.need(Traits).d.traits as Record<string, number>).constitution = 8;
  let sick = 0;
  for (let i = 0; i < 8; i++) {
    fed(s);
    const bad = give(s, 'roast_meat', 1, { aged: 20 });
    const w = eatPortion(s.player!, inv(s), bad);
    if (i === 0) ok(!w.ok && /stinks/.test(w.text), `rotten meat is warned of first: "${w.text}"`);
    const e = eatPortion(s.player!, inv(s), bad);
    if (e.mood?.id === 'food-sick') sick++;
    if (i === 0) ok(e.ok, `and eaten when chosen again: "${e.text}"`);
  }
  ok(sick >= 4, `rotten meat makes one sick more often than not (${sick} of 8)`);
  s.dispose();
}

console.log('\nkeeping it');
{
  const s = await play();
  give(s, 'flint');
  give(s, 'firewood', 3);
  give(s, 'raw_meat', 1, { aged: 1 });
  give(s, 'fish_trout');
  await s.field.act('fire', X + 14, Y);
  for (let i = 0; i < 6 && OBJECT_TILES[s.map.objectAt(X + 14, Y, null)].name !== 'campfire'; i++) await s.field.act('relight', X + 14, Y);
  const fire = OBJECT_TILES[s.map.objectAt(X + 14, Y, null)].name;
  ok(fire === 'campfire' && ids(s, X + 14, Y).includes('smoke'), `beside a fire, meat and fish can be smoked (${ids(s, X + 14, Y).join(', ')})`);
  const t0 = s.game.time;
  fed(s);
  await s.field.act('smoke', X + 14, Y);
  const smoked = inv(s).d.items.find((i) => i.def === 'smoked_meat');
  ok((s.game.time - t0) / 3600 >= 5.9 && (!!smoked || /burns the lot/.test(last(s))), `six hours over the fire: ${smoked ? itemName(smoked) : 'nothing'}, and ${inv(s).d.items.filter((i) => i.def === 'smoked_fish').map((i) => itemName(i)).join(', ') || 'no fish'}`);
  ok(!smoked || (smoked.aged ?? 0) > 1, `the smoked meat is as far on as the meat was, by its keeping (${smoked?.aged})`);
  // Salting.
  give(s, 'raw_meat', 2);
  give(s, 'salt');
  fed(s);
  await s.field.act('salt', s.game.px, s.game.py);
  ok(has(s, 'salt_meat') === 2 && has(s, 'raw_meat') === 0, `salt packs the raw meat to keep (${has(s, 'salt_meat')}; ${inv(s).d.items.find((i) => i.def === 'salt')?.uses ?? 0} saltings left)`);
  s.dispose();
}
{
  // A drying rack at a camp.
  const s = await play();
  const g = s.game;
  g.camps.make(g, X + 3, Y + 3, { shelter: 0.5, wood: 0.5, waterM: 50, hidden: 0.3, score: 0.5 });
  g.px = X + 4;
  g.py = Y + 4;
  give(s, 'raw_meat', 2);
  give(s, 'stick', 2);
  fed(s);
  await s.field.act('rack', g.px, g.py);
  const hung = g.ground.at(g.px, g.py).filter((i) => i.drying !== undefined);
  ok(objAt(s, g.px, g.py) === 'drying_rack' && hung.length === 1 && has(s, 'raw_meat') === 0, 'meat is hung to dry on a rack at the camp');
  dryRacks(g.ground.everything(), 20, true);
  ok(g.ground.at(g.px, g.py)[0].def === 'raw_meat', 'rain does not dry it');
  dryRacks(g.ground.everything(), 48, false);
  ok(g.ground.at(g.px, g.py)[0].def === 'dried_meat', `a day and a half of dry weather does ("${itemName(g.ground.at(g.px, g.py)[0])}")`);
  s.dispose();
}

console.log('\none snare system, and gathering');
{
  // An old save with a camp's own snares: on loading they are ordinary snares.
  const s = await play([], false, (r) => {
    const c = (r.camps ?? [])[0] as unknown as { snares?: unknown[]; x: number; y: number } | undefined;
    if (c) c.snares = [{ x: c.x + 6, y: c.y, set: r.time - 3600, grade: 'success', checked: r.time - 3600, caught: 'rabbit' }];
  });
  const c = s.game.camps.list[0];
  ok(!!c && !c.snares && s.snares.at(c.x + 6, c.y)?.caught === 'rabbit', 'an old camp snare, with its rabbit, is now an ordinary snare');
  s.dispose();
}
{
  const s = await play();
  const t0 = s.game.time;
  s.map.setObject(X + 1, Y, O('tree_birch'));
  await s.gather();
  ok(s.game.time - t0 >= 14 * 60 && has(s, 'stick') > 0, `gathering sticks takes its quarter hour (${Math.round((s.game.time - t0) / 60)} minutes), as work that can be stopped`);
  s.dispose();
}

console.log(failures ? `\n${failures} failed` : '\nall spoilage tests passed');
process.exit(failures ? 1 : 0);
