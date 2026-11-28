/**
 * Talking with people (from play, 27 November 2026; game/conversation.ts): a greeting gives a name
 * to the well disposed; questions answered by regard (who, about themselves, where, what is near,
 * news); persuasion, intimidation, deception and coin; a seller's wares; names and details hidden
 * until told. And fixes from play: running a step at a time, the town known for its city view.
 * npx tsx apps/game/scripts/talk-test.ts (exits non-zero on a failure).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHUNK, TILE_M } from '@worldforge/core/local/chunk';
import { G, O } from '@worldforge/core/local/tiles';
import { MessageDispatcher } from '../src/engine/messages';
import '../src/actors/cast';
import { Inventory } from '../src/actors/items/inventory';
import { Skills } from '../src/actors/components';
import { readSave } from '../src/game/save';
import { PlaySession, type PlayOptions, type SessionHost, type SessionWorld } from '../src/game/session';
import type { Resident } from '../src/world/population';
import type { ChunkData, LocalSite, PlacedPerson, StartSite } from '../src/worker/protocol';

import { Conversation } from '../src/game/conversation';
import { residentCard } from '../src/game/person-card';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/save-v1-camps.json', import.meta.url)), 'utf8');
const start = readSave(fixture);
const [X, Y] = [start.player.x, start.player.y];

/** People of the street about the wanderer (the worker's stand-in places them). */
const person = (id: string, trade: string, dx: number, dy: number, o: Partial<PlacedPerson> = {}): PlacedPerson => {
  const at = { x: X + dx, y: Y + dy, z: null };
  return {
    id, name: `${id} Holt`, given: id, female: false, age: 30, culture: 0, people: 'the folk', trade, role: 'head', traits: [], means: 'middling',
    household: `the household of ${id}`, homeId: `h-${id}`, ties: [], template: /guard/.test(trade) ? 'guard' : 'craft', day: 0,
    plan: [{ from: 0, to: 24, act: 'work', place: 'out', at }], home: at, at, facing: 's',
    look: { kind: 'human', skin: '#d8b090', hair: '#5a3a20', hairStyle: 'short', beard: 'none', cloth: ['#7a6a50', '#6a5a46', '#4e5a3e'] }, ...o,
  };
};

function world(people: PlacedPerson[]): SessionWorld {
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
/** The town about the wanderer. */
const town: LocalSite = { id: 'c1', name: 'Onson', tier: 'town', x: (X + 0.5) * TILE_M, y: -(Y + 0.5) * TILE_M, radiusM: 400 };

/** A session in a grassy town square, with these people about. */
async function play(people: PlacedPerson[], text = fixture): Promise<PlaySession> {
  const restore = readSave(text);
  const o: PlayOptions = { site, tile: [restore.player.x, restore.player.y], sites: [town], gameId: restore.id, settings: restore.settings, restore, character: null };
  const s = new PlaySession(world(people), host, o);
  const N = CHUNK * CHUNK;
  const [cx0, cy0] = [Math.floor(X / CHUNK), Math.floor(Y / CHUNK)];
  for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
    s.map.add({ cx, cy, ground: new Uint8Array(N).fill(G('grass')), object: new Uint8Array(N), area: new Uint16Array(N), areas: [''], elev: new Int16Array(N).fill(30), sites: [], roofs: [], layers: [], ms: 0 } as ChunkData);
  }
  s.game.z = null;
  s.advance(1);
  // The people come from the worker's stand-in: wait for them, then let them be placed.
  for (let i = 0; i < 20 && s.people.size < people.length; i++) await new Promise((r) => setTimeout(r, 5));
  s.advance(1);
  return s;
}
const byId = (s: PlaySession, id: string) => [...s.people.everyone()].find((r) => r.p.id === id) as Resident;



const talkTo = (s: PlaySession, r: Resident) => {
  const c = new Conversation(s, r);
  c.begin(0);
  return c;
};
const said = (c: Conversation) => c.lines.map((l) => l.text).join(' / ');

console.log('names and greetings');
{
  const s = await play([person('Cob', 'cooper', 1, 0), person('Ada', 'baker', -1, 0, { traits: ['Kind'] })]);
  const cob = byId(s, 'Cob');
  ok(!/Cob/.test(residentCard(cob, s.people, s.now()).name), `before a word, a stranger is known by sight ("${residentCard(cob, s.people, s.now()).name}")`);
  const c = talkTo(s, cob);
  ok(s.people.opinions.has('Cob', 'name') && /Cob/.test(said(c)), `greeted, a neutral cooper gives his name: ${said(c)}`);
  ok(residentCard(cob, s.people, s.now()).name.startsWith('Cob'), 'and his card then has it');
  c.ask('self');
  ok(s.people.opinions.has('Cob', 'trade') && !s.people.opinions.has('Cob', 'family'), `asked about himself, a neutral man tells his trade but not his family: ${c.lines[c.lines.length - 1].text}`);
  // Well disposed: more.
  s.people.opinions.add('Ada', 'Ada Holt', 'a kindness', 45, s.now(), 30);
  const a = talkTo(s, byId(s, 'Ada'));
  a.ask('self');
  ok(['trade', 'family', 'traits', 'history'].every((w) => s.people.opinions.has('Ada', w as never)), `a warmly disposed baker tells of her family, her character and her past: ${said(a)}`);
  a.ask('where');
  ok(/Onson/.test(a.lines[a.lines.length - 1].text), `asked where this is: ${a.lines[a.lines.length - 1].text}`);
  a.ask('news');
  ok(a.lines.length >= 7, `and she has news (${a.lines.slice(-3).map((l) => l.text).join(' / ')})`);
  // Hostile: they turn away.
  s.people.opinions.add('Cob', 'Cob Holt', 'struck me', -60, s.now(), 30);
  const h = talkTo(s, cob);
  ok(h.over && /turns away/.test(said(h)), `one hostile turns away: ${said(h)}`);
}

console.log('\nthe social skills');
{
  const s = await play([person('Bea', 'weaver', 1, 0), person('Gar', 'guard', -1, 0), person('Tam', 'labourer', 0, 1, { means: 'poor' })]);
  const sk = s.player!.need(Skills);
  sk.d.levels.persuasion = 90;
  s.people.opinions.add('Bea', 'Bea Holt', 'a slight', -20, s.now(), 30);
  const b = talkTo(s, byId(s, 'Bea'));
  b.ask('self');
  ok(/Nothing you need/.test(b.lines[b.lines.length - 1].text), 'a cool weaver will not talk of herself');
  const before = b.regard();
  b.ask('persuade');
  ok(b.regard() > before && !!b.options().find((o) => o.id === 'persuade')?.why, `won over by a fine talker (regard ${Math.round(before)} to ${Math.round(b.regard())}), and only once a talk`);
  // A guard takes a small bribe amiss; a poor labourer takes it gladly.
  const purse = s.player!.need(Inventory).d.copper;
  s.player!.need(Inventory).d.copper = Math.max(purse, 50);
  const g = talkTo(s, byId(s, 'Gar'));
  const gr = g.regard();
  g.ask('bribe:2');
  ok(g.regard() < gr && /buy me/.test(g.lines[g.lines.length - 1].text), 'a guard takes two copper amiss');
  const t = talkTo(s, byId(s, 'Tam'));
  const tr = t.regard(), c0 = s.player!.need(Inventory).d.copper;
  t.ask('bribe:5');
  ok(t.regard() > tr + 10 && s.player!.need(Inventory).d.copper === c0 - 5, `a poor labourer takes five copper gladly (regard ${Math.round(tr)} to ${Math.round(t.regard())})`);
  // Leaning on the watch angers them.
  sk.d.levels.intimidation = 30;
  const g2 = talkTo(s, byId(s, 'Gar'));
  const o0 = s.people.opinions.of('Gar', s.now());
  g2.ask('intimidate');
  ok(s.people.opinions.of('Gar', s.now()) < o0 - 10, 'threatening a guard costs his regard');
}

console.log('\nwares');
{
  const s = await play([person('Ned', 'baker', 1, 0)]);
  const ned = byId(s, 'Ned');
  const c = talkTo(s, ned);
  ok(c.options().some((o) => o.id === 'trade'), `a baker at work offers his wares (${c.options().map((o) => o.id).join(', ')})`);
  const r = c.ask('trade');
  ok(!!r && r.open === 'shop' && r.place?.role === 'bakery', `asking opens his shop (${r && r.place?.name}, ${r && r.place?.role})`);
}

console.log('\nthe town, and running');
{
  const s = await play([]);
  ok(s.game.hud.town?.id === 'c1', 'in the town, it is known for its city view');
  // A step at a time: the run goes tile by tile until something stops it.
  s.field.stepMs = 0;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 20; dx++) if (s.map.object(X + dx, Y + dy)) s.map.setObject(X + dx, Y + dy, 0);
  s.map.setObject(X + 9, Y, O('wall_stone'));
  const x0 = s.game.px, steps0 = s.game.steps;
  await s.field.run(1, 0);
  ok(s.game.px === X + 8 && s.game.steps - steps0 === s.game.px - x0, `running east goes a tile at a time to the wall (${s.game.px - x0} tiles, ${s.game.steps - steps0} steps)`);
}

console.log(failures ? `\n${failures} failed` : '\nall talk tests passed');
process.exit(failures ? 1 : 0);
