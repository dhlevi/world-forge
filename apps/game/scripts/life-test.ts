/**
 * A life brought into play (stage Q3; game/life.ts, worker/ties.ts, actors/creation/hooks.ts): the
 * starts offered at creation (from the ties and the Omen, and the quiet ones); the people of the life
 * placed as residents of their town, family under one roof, looking as remembered; and a new game's
 * first quest and obligations: a debt called in (interest, the creditor's men, the law), a favour
 * called in, a rival faced (by Persuasion, and failing), a dead parent's affairs, a lost love's fate,
 * a love who waits; a quiet start and a clean slate.
 * npx tsx apps/game/scripts/life-test.ts (exits non-zero on a failure).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHUNK, TILE_M, LocalWorld } from '@worldforge/core/local/chunk';
import { G } from '@worldforge/core/local/tiles';
import { generateWorld } from '@worldforge/core/gen/world';
import { MessageDispatcher } from '../src/engine/messages';
import '../src/actors/cast';
import { Inventory } from '../src/actors/items/inventory';
import { Skills } from '../src/actors/components';
import { History, type Tie } from '../src/actors/components/history';
import { startHooks, tieKey } from '../src/actors/creation/hooks';
import { readSave } from '../src/game/save';
import { PlaySession, type PlayOptions, type SessionHost, type SessionWorld } from '../src/game/session';
import { Conversation } from '../src/game/conversation';
import { placeTies } from '../src/worker/ties';
import { rememberSites } from '../src/worker/sites';
import { peopleIn } from '../src/worker/people';
import type { Resident } from '../src/world/population';
import type { ChunkData, LocalSite, PlacedPerson, StartSite, TieFolk, TiePlaced } from '../src/worker/protocol';

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
    // The people of the life: each placed at a house of the town (where it is does not matter here).
    ties: async (folk: TieFolk[]) => folk.map((f, i): TiePlaced => ({ key: f.key, name: f.name ?? `Hroth Feuder`, given: f.given ?? 'Hroth', trade: f.trade ?? 'farmer', siteId: 'c1', siteName: 'Onson', household: f.name ? `the household of ${f.name}` : 'the household of Hroth Feuder', lon: 10 + i * 0.001, lat: 50 })),
    // The country about: wolves and deer, a barrow 3 km to the north, and a town 10 km to the east.
    game: async () => [{ id: 'wolf', density: 1 }, { id: 'red_deer', density: 2 }],
    requestArea: async (box) => {
      const lon = (box.west + box.east) / 2, lat = (box.south + box.north) / 2;
      return { roads: [], places: [{ id: 'l1', name: 'the Old Barrow', tier: 'lair', lon, lat: lat + 0.027 }, { id: 'c2', name: 'Ashby', tier: 'town', lon: lon + 0.14, lat }] };
    },
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
const byGiven = (s: PlaySession, given: string) => [...s.people.everyone()].find((r) => r.p.given === given) as Resident;

const NO_CONTRACTIONS = /\b(\w+n't|\w+'(re|ve|ll|d|m)|(it|that|there|what|he|she|who|here|where)'s)\b|\u2014/i;

/** The ties of a life, as creation makes them. */
const LIFE: Tie[] = [
  { kind: 'parent', name: 'Orm Haldsson', text: 'Your father, Orm Haldsson, a cooper.', alive: true },
  { kind: 'parent', name: 'Asa Kolsdottir', text: 'Your mother, Asa Kolsdottir, is dead.', alive: false },
  { kind: 'sibling', name: 'Brand Ormsson', text: 'Your elder brother, Brand Ormsson.', alive: true },
  { kind: 'debt', name: 'Sigurd Alfsson', text: 'You owe Sigurd Alfsson 80 copper.', alive: true },
  { kind: 'contact', name: 'Thora Eiriksdottir', text: 'Thora Eiriksdottir, from your days as a carter, owes you a favour.', alive: true },
  { kind: 'rival', name: 'Ketil Grimsson', text: 'Ketil Grimsson has hated you since your days as a carter.', alive: true },
  { kind: 'friend', name: 'Gudrun Bjornsdottir', text: 'You loved Gudrun Bjornsdottir, and lost them.', alive: false },
  { kind: 'feud', text: 'A feud with another family of your home, over a death neither side forgives.' },
];

async function main(): Promise<void> {
  // ---- The starts offered ----
  const hooks = startHooks(LIFE, 'Home will call you back, and it will not be as you left it.', 'Onson');
  const kinds = hooks.map((h) => h.kind);
  ok(hooks.length === 5 && kinds.slice(0, 3).join(',') === 'debt,lost,rival' && kinds.slice(3).join(',') === 'quiet,clean', `three starts from the life, then a quiet start and a clean slate (${kinds.join(', ')})`);
  ok(hooks.every((h) => !NO_CONTRACTIONS.test(h.about) && !NO_CONTRACTIONS.test(h.label)), 'in plain words');
  const plain = startHooks([], undefined, 'Onson').map((h) => h.kind).join(',');
  ok(plain === 'work,quiet,clean', `with no ties and no omen: work, or the quiet starts (${plain})`);
  const omened = startHooks([LIFE[0]], 'A long road lies ahead.', 'Onson').map((h) => h.kind).join(',');
  ok(omened === 'family,omen,work,quiet,clean', `with only a father living, and the Omen (${omened})`);

  // ---- The people of a life in the world ----
  const w = generateWorld({ seed: 'forge', landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 512 } as never, () => {});
  const town = w.settlements.find((s) => s.tier === 'town' && !s.delve && s.kind !== 'abandoned')!;
  rememberSites(w.settlements);
  const local = new LocalWorld(w, town);
  const look = { skin: '#123456', hair: '#654321', hairStyle: 'braids', beard: 'none', cloth: '#abcdef' };
  const folk: TieFolk[] = [
    { key: tieKey(LIFE[0]), kind: 'parent', siteId: town.id, name: 'Orm Haldsson', given: 'Orm', female: false, age: 58, trade: 'cooper', family: true, look },
    { key: tieKey(LIFE[2]), kind: 'sibling', siteId: town.id, name: 'Brand Ormsson', given: 'Brand', female: false, age: 30, family: true, look },
    { key: tieKey(LIFE[3]), kind: 'debt', siteId: town.id, name: 'Sigurd Alfsson', given: 'Sigurd', female: false, age: 44, trade: 'moneylender', look },
    { key: tieKey(LIFE[7]), kind: 'feud', siteId: town.id },
  ];
  const placed = placeTies(w, local, folk);
  const at = (k: string) => placed.find((p) => p.key === k)!;
  ok(placed.length === 4, `every living tie is given a home in ${town.name} (${placed.map((p) => `${p.given}: ${p.household}`).join('; ')})`);
  ok(at(folk[0].key).household === at(folk[1].key).household && at(folk[0].key).lon === at(folk[1].key).lon, 'the family live under one roof');
  ok(at(folk[2].key).lon !== at(folk[0].key).lon && at(folk[3].key).lon !== at(folk[2].key).lon, 'the creditor and the feuding family each have a house of their own');
  ok(!!at(folk[3].key).name && at(folk[3].key).name !== 'undefined', `the feud is with a household of the town: ${at(folk[3].key).household}`);
  ok(JSON.stringify(placeTies(w, local, folk)) === JSON.stringify(placed), 'the same life finds the same doors');
  const [hx, hy] = local.tileAt(at(folk[0].key).lon, at(folk[0].key).lat);
  const about = peopleIn(w, local, hx, hy, 40, 12 * 3600);
  const orm = about.find((p) => p.id === folk[0].key), brand = about.find((p) => p.id === folk[1].key);
  ok(!!orm && !!brand && orm.homeId === brand.homeId && orm.name === 'Orm Haldsson' && orm.trade === 'cooper' && orm.tie === 'parent', `about the house, the father and brother are residents with their own day (${orm?.name}, ${orm?.trade}; ${brand?.name})`);
  ok(orm?.look.skin === '#123456' && orm?.look.hairStyle === 'braids' && orm?.look.cloth[0] === '#abcdef', 'and look as remembered');
  const [cx, cy] = local.tileAt(at(folk[2].key).lon, at(folk[2].key).lat);
  ok(peopleIn(w, local, cx, cy, 40, 12 * 3600).some((p) => p.id === folk[2].key && p.household === 'the household of Sigurd Alfsson'), 'the creditor lives in the household of their own name');
  void CHUNK;

  // ---- A new game: the first quest, and the obligations of the life ----
  const people = [
    person('Orm', 'cooper', 2, 0, { id: tieKey(LIFE[0]), name: 'Orm Haldsson' }),
    person('Brand', 'cooper', 3, 0, { id: tieKey(LIFE[2]), name: 'Brand Ormsson' }),
    person('Sigurd', 'moneylender', -2, 0, { id: tieKey(LIFE[3]), name: 'Sigurd Alfsson' }),
    person('Thora', 'carter', 0, 2, { id: tieKey(LIFE[4]), name: 'Thora Eiriksdottir', female: true }),
    person('Ketil', 'carter', 0, -2, { id: tieKey(LIFE[5]), name: 'Ketil Grimsson' }),
    person('Hroth', 'farmer', 2, 2, { id: tieKey(LIFE[7]), name: 'Hroth Feuder' }),
  ];
  const begin = async (start: string, ties = LIFE) => {
    const s = await play(people);
    s.field.stepMs = 0;
    const h = s.player!.get(History)!;
    h.d.ties = ties.map((t) => ({ ...t }));
    h.d.omen = 'Home will call you back.';
    h.d.start = startHooks(ties, h.d.omen, 'Onson').find((x) => x.kind === start) ?? { id: start, kind: start as never, label: '', about: '' };
    await s.life.begin(true);
    return s;
  };
  const s = await begin('debt');
  const Q = s.quests;
  const tpl = Q.list.map((q) => `${q.template}${q.featured ? '*' : ''}`);
  ok(Q.list.length >= 2 && Q.list.length <= 4 && tpl[0] === 'tpl_creditor_terms*' && tpl.filter((x) => x.endsWith('*')).length === 1, `the debt called in first, and two to four in all (${tpl.join(', ')})`);
  const debt = Q.list[0];
  ok(!!debt.due && Math.round((debt.due - (debt.took ?? 0)) / 86400) === 7, 'called in, it is due in seven days');
  ok(s.people.opinions.knows(tieKey(LIFE[3])) && s.people.opinions.has(tieKey(LIFE[3]), 'name'), 'the creditor is known by name from the start');
  ok(s.people.opinions.of(tieKey(LIFE[0]), s.game.time) > 30 && s.people.opinions.of(tieKey(LIFE[5]), s.game.time) < -20, 'family think well of the wanderer, and the rival ill');
  // Left unpaid: interest, the creditor's men, the law.
  const inv = s.player!.get(Inventory)!;
  s.game.time = debt.due! + 60;
  Q.run();
  ok(debt.roles.debt!.count === 88 && /88|8 silver and 8 copper/.test(debt.words.amount), `when it falls due, a tenth more is owed (${debt.words.amount})`);
  s.game.time = debt.due! + 7 * 86400 + 60;
  Q.run();
  ok(debt.flags.includes('dunned') && s.people.opinions.of(tieKey(LIFE[3]), s.game.time) < -10, 'a week later the creditor sends men, and thinks the worse of the wanderer');
  s.game.time = debt.due! + 21 * 86400 + 60;
  Q.run();
  const wanted = s.law.places(s.game.time).find((p) => p.id === 'c1');
  ok(!!wanted?.wanted && /debt/.test(String(wanted.wanted)), `three weeks on, the creditor goes to the law: wanted in Onson for ${wanted?.wanted}`);
  const owe = debt.roles.debt!.count!;
  inv.d.copper = owe + 5;
  const sigurd = new Conversation(s, byGiven(s, 'Sigurd'));
  sigurd.begin(1);
  const pay = sigurd.options().find((o) => o.id.endsWith(':payInFull'))!;
  ok(!pay.why && pay.label.includes(debt.words.amount), `paying is offered at what is owed now: "${pay.label}"`);
  sigurd.ask(pay.id);
  ok(debt.state === 'done' && inv.d.copper === 5, 'paid in full, the debt is settled');

  // A favour called in: coin.
  const fav = Q.list.find((q) => q.template === 'tpl_favour')!;
  ok(!!fav, 'a favour owed is an obligation');
  const c0 = inv.d.copper;
  const thora = new Conversation(s, byGiven(s, 'Thora'));
  thora.begin(1);
  thora.ask(thora.options().find((o) => o.id.endsWith(':coin'))!.id);
  ok(fav.state === 'done' && inv.d.copper > c0, `called in, the favour gives coin (${inv.d.copper - c0} copper)`);

  // A rival faced: by Persuasion, failing, and then succeeding.
  const rival = Q.list.find((q) => q.template === 'tpl_rival');
  const feud = Q.list.find((q) => q.template === 'tpl_feud');
  const facing = rival ?? feud!;
  ok(!!facing, `a rival or a feud is an obligation (${facing?.title})`);
  const skills = s.player!.get(Skills)!;
  skills.d.levels.persuasion = 0;
  const foe = byGiven(s, rival ? 'Ketil' : 'Hroth');
  const talk = new Conversation(s, foe);
  talk.begin(1);
  talk.ask(talk.options().find((o) => o.id.endsWith(':peace'))!.id);
  ok(facing.state === 'done' && facing.parts.map((p) => p.beat).includes('standing') && /no peace/.test(Q.tell(facing).slice(-1)[0]), `persuasion failing, the enmity stands: ${Q.tell(facing).slice(-1)[0]}`);

  // ---- Another life: the rival made peace with, a dead parent's affairs, a lost love's grave ----
  const s2 = await begin('rival');
  const r2 = s2.quests.list[0];
  ok(r2.template === 'tpl_rival' && r2.featured === true && /must be answered/.test(r2.text), `the rival's move first: ${r2.text}`);
  s2.player!.get(Skills)!.d.levels.persuasion = 100;
  const t2 = new Conversation(s2, byGiven(s2, 'Ketil'));
  t2.begin(1);
  t2.ask(t2.options().find((o) => o.id.endsWith(':peace'))!.id);
  ok(r2.state === 'done' && s2.people.opinions.of(tieKey(LIFE[5]), s2.game.time) > 0, 'with Persuasion, peace is made, and Ketil thinks better of the wanderer');
  const affairs = s2.quests.list.find((q) => q.template === 'tpl_parent_affairs');
  const lost = s2.quests.list.find((q) => q.template === 'tpl_lost_love');
  ok(!!affairs || !!lost, `the family among the obligations (${s2.quests.list.map((q) => q.template).join(', ')})`);
  if (affairs) {
    const c1 = s2.player!.get(Inventory)!.d.copper;
    const orm2 = new Conversation(s2, byGiven(s2, affairs.giver.given ?? 'Orm'));
    orm2.begin(1);
    orm2.ask(orm2.options().find((o) => o.id.endsWith(':inherit'))!.id);
    ok(affairs.state === 'done' && s2.player!.get(Inventory)!.d.copper > c1, `the affairs of ${affairs.words.parent} settled, with what was left (${affairs.title})`);
  }
  if (lost) {
    const kin = new Conversation(s2, byGiven(s2, lost.roles.kin!.given!));
    kin.begin(1);
    kin.ask(kin.options().find((o) => o.id.startsWith(`q:${lost.id}`))!.id);
    ok(lost.state === 'done' && lost.parts.some((p) => p.beat === 'grief'), `asking after Gudrun, the wanderer learns she is dead (${lost.parts.map((p) => p.title).join(', ')})`);
  }

  // A love lost: asking her kin, the wanderer learns her fate.
  const s6 = await begin('lost');
  const lostQ = s6.quests.list[0];
  ok(lostQ?.template === 'tpl_lost_love' && lostQ.featured === true, `what became of a love lost, first: ${lostQ?.text}`);
  const kinTalk = new Conversation(s6, byGiven(s6, lostQ.roles.kin!.given!));
  kinTalk.begin(1);
  kinTalk.ask(kinTalk.options().find((o) => o.id.startsWith(`q:${lostQ.id}`))!.id);
  ok(lostQ.state === 'done' && lostQ.parts.some((p) => p.beat === 'grief'), `asking ${lostQ.roles.kin!.given}, the wanderer learns Gudrun is dead (${lostQ.parts.map((p) => p.title).join(', ')})`);

  // ---- A quiet start, and a clean slate ----
  const s3 = await begin('quiet');
  ok(s3.quests.list.length >= 2 && !s3.quests.list.some((q) => q.featured), `a quiet start: the obligations, and no first quest (${s3.quests.list.length})`);
  const s4 = await begin('clean');
  ok(s4.quests.list.length === 0 && s4.people.opinions.knows(tieKey(LIFE[0])), 'a clean slate: nothing pressing, but the people of the life are known');

  // ---- A love who waits ----
  const LOVE: Tie[] = [{ kind: 'friend', name: 'Sigrid Tovesdottir', text: 'Sigrid Tovesdottir, whom you love, waits for word of you.', alive: true }];
  const s5 = await play([...people, person('Sigrid', 'weaver', 1, 1, { id: tieKey(LOVE[0]), name: 'Sigrid Tovesdottir', female: true })]);
  const h5 = s5.player!.get(History)!;
  h5.d.ties = LOVE;
  h5.d.start = startHooks(LOVE, undefined, 'Onson')[0];
  await s5.life.begin(true);
  const love = s5.quests.list[0];
  ok(love?.template === 'tpl_love_waits' && love.featured === true && /has written asking me to come back/.test(love.text), `a letter from a love: ${love?.text}`);
  const sig = new Conversation(s5, byGiven(s5, 'Sigrid'));
  sig.begin(1);
  sig.ask(sig.options().find((o) => o.id.startsWith(`q:${love.id}`))!.id);
  ok(love.state === 'done', 'gone back to her, it is done');

  const texts = [...Q.list, ...s2.quests.list, ...s5.quests.list].flatMap((q) => [q.title, q.text, ...Q.tell(q)]);
  const bad = texts.filter((t) => NO_CONTRACTIONS.test(t) || /\{|\}/.test(t));
  ok(bad.length === 0, `every text in plain words, with nothing left unfilled${bad.length ? `: ${bad.slice(0, 3).join(' | ')}` : ''}`);

  console.log(failures ? `\n${failures} failure(s)` : '\nall ok');
  process.exit(failures ? 1 : 0);
}

void main();
