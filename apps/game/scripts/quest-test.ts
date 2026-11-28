/**
 * Quests (docs/design/quests.md; stages Q2 and Q2b; game/quests.ts, game/quests/templates.ts): the
 * templates checked against the fixed lists and themselves; the country about and a notice board;
 * the jobs (a bounty claimed, game handed over, a letter carried, a ruin looked into); the missing
 * herd as a Job (a false lead ruled out, the beasts found and driven home), grown to a Chapter (the
 * deeper cause found, investigated and put down), and gone wrong (left too long, the fetching turns
 * to telling: Pivot); a giver dead (Reassign to the household, or Overtaken); the creditor's terms
 * by each branch (paid, an errand, defiance lived through) and waived; the marks and their pay; the
 * journal; and all of it kept in a save, with a quest of the old shape brought forward.
 * npx tsx apps/game/scripts/quest-test.ts (exits non-zero on a failure).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHUNK, TILE_M } from '@worldforge/core/local/chunk';
import { G } from '@worldforge/core/local/tiles';
import { SPECIES_BY_ID } from '@worldforge/core/local/fauna';
import { MessageDispatcher } from '../src/engine/messages';
import '../src/actors/cast';
import { Inventory } from '../src/actors/items/inventory';
import { Skills } from '../src/actors/components';
import { makeItem } from '../src/actors/items/item';
import { Needs } from '../src/actors/needs';
import { Health } from '../src/actors/health';
import { readSave } from '../src/game/save';
import { PlaySession, type PlayOptions, type SessionHost, type SessionWorld } from '../src/game/session';
import { Conversation } from '../src/game/conversation';
import { Quests, type Country, type Quest, type RoleRef } from '../src/game/quests';
import { checkTemplates, TEMPLATE_BY_ID, TEMPLATES, type Template } from '../src/game/quests/templates';
import type { Resident } from '../src/world/population';
import type { ChunkData, LocalSite, PlacedPerson, SiteInfo, StartSite } from '../src/worker/protocol';

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
const byId = (s: PlaySession, id: string) => [...s.people.everyone()].find((r) => r.p.id === id) as Resident;

/** Contractions and em dashes (a possessive is allowed). */
const NO_CONTRACTIONS = /\b(\w+n't|\w+'(re|ve|ll|d|m)|(it|that|there|what|he|she|who|here|where)'s)\b|\u2014/i;

async function main(): Promise<void> {
  const s = await play([person('Ewan', 'shepherd', 2, 0, { homeId: 'h-ewan' }), person('Ailsa', 'shepherd', 3, 0, { homeId: 'h-ewan', role: 'wife' }), person('Mora', 'moneylender', -2, 0), person('Brec', 'shepherd', 0, 2)]);
  s.field.stepMs = 0;
  const inv = s.player!.get(Inventory)!;
  const skills = s.player!.get(Skills)!;
  const [lon, lat] = s.travel.party();
  const Q = s.quests;
  /** Brings a lead, a place or beasts to where the wanderer stands (in place of walking there). */
  const here = (p: { lon?: number; lat?: number }) => {
    p.lon = lon;
    p.lat = lat;
  };
  const tick = (secs = 60) => {
    s.game.time += secs;
    rested();
    Q.run();
  };
  /** Fed, watered, rested and warm again (after the clock is moved on). */
  const rested = (): void => refresh();
  const refresh = () => {
    Object.assign(s.player!.need(Needs).d, { hydrated: 100, hydrationL: 2, stomachL: 0.5, nourish: 100, stomachKcal: 800, reserveKcal: 2000, fatigue: 0, debt: 0, heat: 0 });
    const h = s.health();
    if (h) {
      Object.assign(h.d, { wounds: [], cond: {}, blood: Math.max(h.d.blood, Health.fresh(75).blood) });
      delete h.d.dead;
      h.setNow(s.game.time);
    }
  };
  const texts: string[] = [];

  // ---- The templates checked ----
  ok(checkTemplates().length === 0, `every template passes the load-time check${checkTemplates().length ? `: ${checkTemplates().join('; ')}` : ''}`);
  const broken: Template = JSON.parse(JSON.stringify(TEMPLATE_BY_ID.get('tpl_missing_herd')));
  broken.beats[0].tasks[0].type = 'explor' as never;
  broken.beats[1].next = 'nowhere';
  broken.beats.push({ id: 'lost', kind: 'hook', title: 'Lost', tasks: [], next: null });
  broken.roles.obstacle.onMissing = 'abort';
  broken.beats[3].tasks[0].type = 'escort';
  const faults = checkTemplates([broken]);
  ok(faults.some((f) => /unknown task type "explor"/.test(f)) && faults.some((f) => /"nowhere" that does not exist/.test(f)) && faults.some((f) => /beat lost cannot be reached/.test(f)) && faults.some((f) => /lost: the quest ends here, but it is not an aftermath/.test(f)) && faults.some((f) => /optional, so it must be skipped/.test(f)) && faults.some((f) => /"escort" is not checked by the engine yet/.test(f)), `a broken template is caught (${faults.length} faults)`);

  // ---- The country about, and a notice board ----
  await Q.prepareHere();
  const c = Q.countryOf('c1')!;
  ok(!!c && c.beasts.length === 2 && c.lairs.length === 1 && c.towns.length === 1, 'the country about holds its beasts, its barrow and its neighbouring town');
  const P = (id: string, kind: SiteInfo['places'][number]['kind'], role?: string) => ({ id, kind, name: `the ${id}`, lon, lat, quarter: '', about: '', role });
  const townSite = { id: 'c1', name: 'Onson', tier: 'town', population: 3000, lon, lat, coreM: 200, radiusM: 400, walls: false, culture: 'the folk', quarters: [],
    places: [P('Golden Goose', 'inn'), P('shambles', 'shop', 'butcher'), P('barracks', 'civic', 'barracks'), P('temple', 'temple'), P('counting-house', 'civic', 'countinghouse'), P('apothecary', 'shop', 'apothecary'), P('market', 'market')] } as unknown as SiteInfo;
  const board = Q.notices(townSite);
  ok(board.length >= 3 && board.length <= 5 && board.every((q) => q.state === 'offered' && TEMPLATE_BY_ID.has(q.template)), `the board has three to five notices from the templates (${board.map((q) => q.template).join(', ')})`);
  ok(JSON.stringify(Q.notices(townSite).map((q) => q.id)) === JSON.stringify(board.map((q) => q.id)), 'the same notices are up through the week');
  texts.push(...board.map((q) => q.text));
  console.log(board.map((q) => `     ${q.title}: ${q.text}`).join('\n'));

  const place = (id: string): RoleRef => ({ kind: 'place', id, placeId: id, name: `the ${id}`, siteId: 'c1', siteName: 'Onson', lon, lat });
  let seedN = 1;
  const make = (tpl: string, giver: RoleRef, test: (q: Quest) => boolean = () => true, o = {}) => {
    for (let i = 0; i < 400; i++) {
      const q = Q.make(TEMPLATE_BY_ID.get(tpl)!, giver, c, seedN++, { lon, lat }, o);
      if (q && test(q)) return q;
    }
    throw new Error(`no ${tpl} quest made`);
  };

  // ---- A bounty: the hunt, then the claim at the barracks ----
  const bounty = make('job_bounty', place('barracks'), (q) => q.roles.prey?.species === 'wolf');
  texts.push(bounty.text);
  Q.take(bounty);
  ok(bounty.parts.length === 1 && Q.current(bounty)!.tasks[0].type === 'defeat', `a bounty begins with the hunt: ${bounty.text}`);
  Q.onKill('red_deer');
  ok((Q.current(bounty)!.tasks[0].got ?? 0) === 0, 'a deer killed does not count toward a bounty on wolves');
  const wolves = Q.current(bounty)!.tasks[0].count ?? 1;
  for (let i = 0; i < wolves; i++) s.fights.carcass(SPECIES_BY_ID.get('wolf')!, s.game.px + 3, s.game.py, null);
  ok(bounty.parts.length === 2 && Q.current(bounty)!.tasks[0].type === 'talk', `the wolves killed (${wolves}), the next part is to claim it`);
  const claim = Q.optionsFor({ placeId: 'barracks', siteId: 'c1' });
  ok(claim.length === 1 && Q.optionsFor({ placeId: 'temple', siteId: 'c1' }).length === 0, `it is claimed at the barracks, not elsewhere: "${claim[0]?.label}"`);
  const before = inv.d.copper;
  const said = Q.choose(claim[0].id);
  ok(bounty.state === 'done' && inv.d.copper > before, `claimed, the bounty is paid: ${said}`);
  ok(!!bounty.marks?.includes('fast') && !!bounty.marks?.includes('clean') && inv.d.copper - before > bounty.reward.copper, `done quickly and cleanly, it pays more than promised (${inv.d.copper - before} for ${bounty.reward.copper})`);

  // ---- Game handed over; a crime spoils the Clean mark ----
  const game = make('job_game', place('shambles'));
  Q.take(game);
  const hand = () => Q.optionsFor({ placeId: 'shambles', siteId: 'c1' })[0];
  ok(/You have 0 of the/.test(hand()?.why ?? ''), `game not yet brought cannot be handed over: ${hand()?.why}`);
  inv.stow(makeItem('raw_meat', { qty: 3 }));
  inv.stow(makeItem('raw_meat', { qty: 3 }));
  inv.stow(makeItem('raw_meat', { qty: 3 }));
  const meat = () => inv.d.items.filter((i) => i.def === 'raw_meat').reduce((k, i) => k + i.qty, 0);
  const had = meat();
  s.law.crime({ id: 'c1', name: 'Onson' }, 'theft', 'a stall', 0, s.game.time);
  Q.choose(hand().id);
  ok(game.state === 'done' && meat() === had - game.n, `the game wanted is taken, the rest kept (${had} less ${game.n} leaves ${meat()})`);
  ok(!game.marks?.includes('clean'), 'a theft, even unseen, spoils the Clean mark');

  // ---- A letter carried, and handed over at an inn of its town ----
  const letter = make('job_letter', place('counting-house'));
  Q.take(letter);
  const note = inv.d.items.find((i) => i.quest === letter.id);
  ok(!!note && /Ashby, 10 km to the east/.test(letter.text), `the letter is in hand: ${note?.name}; ${letter.text}`);
  ok(Q.optionsFor({ placeId: 'Golden Goose', siteId: 'c1', handover: true }).length === 0, 'it cannot be handed over in the wrong town');
  const there = Q.optionsFor({ placeId: 'inn', siteId: 'c2', handover: true });
  ok(there.length === 1 && Q.optionsFor({ placeId: 'smithy', siteId: 'c2', handover: false }).length === 0, `in Ashby, at an inn: "${there[0]?.label}"`);
  Q.choose(there[0].id);
  ok(letter.state === 'done' && !inv.d.items.some((i) => i.quest === letter.id), 'handed over, the letter is paid for, and gone from the pack');

  // ---- A ruin looked into, and told of ----
  const scout = make('job_scout', place('temple'));
  Q.take(scout);
  tick();
  ok(scout.parts.length === 1, 'not reached from the town');
  here(Q.current(scout)!.tasks[0]);
  tick();
  ok(scout.parts.length === 2, 'reached, the next part is to tell of it');
  Q.choose(Q.optionsFor({ placeId: 'temple', siteId: 'c1' })[0].id);
  ok(scout.state === 'done', 'and told of, it is done');

  // ---- Time run out; work given up ----
  const fish = make('job_fish', place('Golden Goose'));
  Q.take(fish);
  fish.deadline = s.game.time - 1;
  Q.run();
  ok(fish.state === 'expired', 'work not done in time runs out');
  const herbs = make('job_herbs', place('apothecary'));
  Q.take(herbs);
  Q.giveUp(herbs);
  ok(herbs.state === 'failed' && !Q.active().includes(herbs), 'work given up is no longer in hand');

  // ---- The missing herd: a Job ----
  const ewan = byId(s, 'Ewan'), ailsa = byId(s, 'Ailsa');
  const shepherd = (r: Resident): RoleRef => ({ kind: 'person', id: r.p.id, name: 'shepherd', given: r.p.given, means: 'middling', siteId: 'c1', siteName: 'Onson', lon, lat });
  const heirs = [{ id: ailsa.p.id, name: 'shepherd', given: ailsa.p.given }];
  const herd = make('tpl_missing_herd', shepherd(ewan), (q) => !q.deep && !!q.roles.obstacle, { heirs });
  texts.push(herd.text);
  Q.take(herd);
  const trail = Q.current(herd)!.tasks[0];
  ok(herd.level === 'job' && trail.type === 'explore' && trail.leads?.length === 2 && trail.leads.filter((l) => l.sure).length === 1, `the herd begins as a Job: a trail with two leads (${trail.leads?.map((l) => l.text).join('; ')})`);
  const wrong = trail.leads!.find((l) => !l.sure)!, right = trail.leads!.find((l) => l.sure)!;
  here(wrong);
  tick();
  ok(wrong.followed === true && !!wrong.found && !trail.done && herd.facts.some((f) => f.act === 'false-lead'), `a false lead is ruled out by what is there: ${wrong.found}`);
  wrong.lon! += 1;
  here(right);
  tick();
  ok(trail.done === true && herd.roles.prize!.state === 'found' && herd.parts.length === 2, `the sure lead finds them: ${right.found}`);
  const recover = Q.current(herd)!;
  ok(recover.tasks.length === 2 && recover.tasks[0].type === 'defeat' && recover.tasks[0].optional === true && recover.tasks[1].type === 'retrieve', `the next part: ${recover.tasks.map((k) => k.label).join('; ')}`);
  ok(Q.optionsFor({ personId: ewan.p.id })[0]?.why === 'They are not with you: you must round them up first.', 'found is not yet brought home');
  here(herd.roles.prize!);
  rested();
    for (let i = 0; i < 6 && herd.roles.prize!.state !== 'driven'; i++) await Q.fieldAct(Q.fieldActions()[0].id);
  ok(herd.roles.prize!.state === 'driven', 'rounded up (Animal handling), they are driven along');
  const home = Q.optionsFor({ personId: ewan.p.id });
  Q.choose(home[0].id);
  ok(herd.state === 'done' && herd.level === 'job' && !herd.marks?.includes('thorough'), `brought home, the Job is done (marks: ${herd.marks?.join(', ') || 'none'}; the culprit not killed, so not Thorough)`);

  // ---- The missing herd grown to a Chapter ----
  skills.d.levels.tracking = 95;
  skills.d.levels.survival = 95;
  const deep = make('tpl_missing_herd', shepherd(ewan), (q) => q.deep && !!q.roles.deeperCause && !!q.roles.obstacle, { heirs });
  Q.take(deep);
  const t2 = Q.current(deep)!.tasks[0];
  here(t2.leads!.find((l) => l.sure)!);
  for (let i = 0; i < 20 && deep.parts.length < 2; i++) tick(1800);
  ok(deep.flags.includes('foundDeeperSign') && deep.level === 'chapter' && Q.current(deep)?.beat === 'delve', `a sign of something worse grows the Job to a Chapter: ${deep.facts.find((f) => f.act === 'clue')?.what}`);
  const delve = Q.current(deep)!.tasks[0];
  ok(delve.type === 'investigate' && !!delve.leads?.[0]?.text.startsWith('The Old Barrow'), `the next Job is to find out what lairs there: ${delve.label}`);
  here(delve.leads![0]);
  for (let i = 0; i < 20 && deep.parts.length < 3; i++) tick(1800);
  const reck = Q.current(deep)!;
  ok(reck?.beat === 'reckoning' && reck.tasks[0].type === 'defeat' && reck.tasks[0].count === 2, `clues found, the reckoning: ${reck?.tasks.map((k) => k.label).join('; ')}`);
  const obstacle = deep.roles.obstacle!.species!;
  Q.onKill(obstacle);
  Q.onKill(obstacle);
  here(deep.roles.prize!);
  rested();
  for (let i = 0; i < 6 && deep.roles.prize!.state !== 'driven'; i++) await Q.fieldAct(Q.fieldActions()[0].id);
  Q.choose(Q.optionsFor({ personId: ewan.p.id })[0].id);
  ok(deep.state === 'done' && deep.level === 'chapter' && deep.parts.map((p) => p.beat).join(',') === 'trail,delve,reckoning,aftermath', `the Chapter is done, part by part (${deep.parts.map((p) => `${p.title} (${p.level})`).join(', ')})`);

  // ---- Left too long: the beasts are dead, and the fetching becomes the telling (Pivot) ----
  const late = make('tpl_missing_herd', shepherd(ewan), (q) => !q.deep && !!q.roles.obstacle, { heirs });
  Q.take(late);
  tick(5 * 86400);
  ok(late.roles.prize!.state === 'dead' && late.flags.includes('herdLost'), 'four days on, whatever took them has killed them (a clock)');
  here(Q.current(late)!.tasks[0].leads!.find((l) => l.sure)!);
  tick();
  const told = Q.current(late)!.tasks.find((k) => k.id.startsWith('recover.1'))!;
  ok(told.type === 'talk' && /what became of/.test(told.label), `found dead, the fetching turns to telling: "${told.label}"`);
  const c0 = inv.d.copper;
  Q.choose(Q.optionsFor({ personId: ewan.p.id })[0].id);
  ok(late.state === 'done' && inv.d.copper - c0 < late.reward.copper, `told, it is done, for less (${inv.d.copper - c0} of ${late.reward.copper})`);

  // ---- A giver dead: the household takes it up (Reassign), or it is no more (Overtaken) ----
  const ward = make('tpl_missing_herd', shepherd(ewan), () => true, { heirs });
  Q.take(ward);
  s.people.dead.add(ewan.p.id);
  tick();
  ok(ward.state === 'active' && ward.giver.id === ailsa.p.id && ward.giver.was === 'Ewan' && ward.facts.some((f) => f.act === 'reassigned'), `Ewan dead, Ailsa takes the matter up (${Q.tell(ward).slice(-1)[0]})`);
  const brec = byId(s, 'Brec');
  const lone = make('tpl_missing_herd', shepherd(brec));
  Q.take(lone);
  s.people.dead.add(brec.p.id);
  tick();
  ok(lone.state === 'overtaken', 'with no one to take it up, it is overtaken');

  // ---- The creditor's terms ----
  const mora = byId(s, 'Mora');
  const party: RoleRef = { kind: 'person', id: mora.p.id, name: 'moneylender', given: 'Mora', siteId: 'c1', siteName: 'Onson', lon, lat };
  const debt = (id: string, amount: number, p = party) => Q.fromObligation({ id, template: 'tpl_creditor_terms', party: p, amount, what: `${amount} copper lent` })!;
  const d1 = debt('debt-1', 500);
  ok(d1.state === 'active' && Q.current(d1)?.beat === 'demand', `an obligation is a quest of its own: ${d1.text}`);
  const opts = new Conversation(s, mora);
  opts.begin(1);
  const said1 = opts.options().filter((o) => o.id.startsWith('q:'));
  ok(said1.length === 3 && !!said1[0].why && !said1[1].why, `three ways to settle with Mora (paying needs the coin: ${said1[0].why})`);
  opts.ask(said1[1].id);
  ok(Q.current(d1)?.beat === 'errand' && inv.d.items.some((i) => i.quest === d1.id), `asked what else would do: an errand, a sealed note to carry (${Q.current(d1)?.tasks.map((k) => k.label).join('; ')})`);
  Q.choose(Q.optionsFor({ placeId: 'inn', siteId: 'c2', handover: true })[0].id);
  Q.choose(Q.optionsFor({ personId: mora.p.id })[0].id);
  ok(d1.state === 'done' && /cleared by the errand/.test(Q.tell(d1).slice(-1)[0]), `the note delivered, the debt is cleared: ${Q.tell(d1).slice(-1)[0]}`);

  inv.d.copper += 100;
  const d2 = debt('debt-2', 60);
  const c1 = inv.d.copper;
  Q.choose(Q.optionsFor({ personId: mora.p.id }).find((o) => o.id.endsWith('payInFull'))!.id);
  ok(d2.state === 'done' && c1 - inv.d.copper === 60, 'paid in full, the debt is settled and the coin gone');

  const d3 = debt('debt-3', 60);
  Q.choose(Q.optionsFor({ personId: mora.p.id }).find((o) => o.id.endsWith('refuseAndDefy'))!.id);
  ok(Q.current(d3)?.beat === 'defiance' && Q.current(d3)?.tasks[0].type === 'survive', `refused: ${Q.current(d3)?.tasks[0].label}`);
  tick(73 * 3600);
  ok(d3.state === 'done', 'three days lived through, it is settled (for now)');

  const d4 = debt('debt-4', 60, { ...party, id: 'gone-lender', given: 'Odo' });
  s.people.dead.add('gone-lender');
  tick();
  ok(d4.state === 'waived', `a creditor dead with no one to claim it: ${Q.tell(d4).slice(-1)[0]}`);

  // ---- Asked of a person ----
  let asked: Quest | null = null;
  for (let w = 0; w < 20 && !asked; w++) {
    s.game.time += 7 * 86400;
    asked = Q.askOf(byId(s, 'Ailsa'));
  }
  ok(!!asked && asked.giver.kind === 'person' && /^(job_bounty|tpl_missing_herd)$/.test(asked.template), `a shepherd asks in her own words: ${asked?.text}`);
  ok(!!asked && / I /.test(` ${asked.text}`) && !asked.text.includes('Ailsa'), 'and in the first person');

  // ---- The journal; and plain words throughout ----
  for (const q of Q.list) texts.push(q.title, ...Q.tell(q), ...q.parts.flatMap((p) => p.tasks.map((k) => k.label)));
  const bad = texts.filter((t) => NO_CONTRACTIONS.test(t) || /\{|\}/.test(t));
  ok(bad.length === 0, `every text in plain words, with nothing left unfilled${bad.length ? `: ${bad.slice(0, 3).join(' | ')}` : ''}`);
  console.log(Q.tell(deep).map((l) => `     ${l}`).join('\n'));

  // ---- Kept in a save, and an old quest brought forward ----
  const saved = s.snapshot();
  const q2 = new Quests(s);
  q2.import(JSON.parse(JSON.stringify(saved.people!.quests)));
  ok(q2.list.length === Q.list.length && q2.list.find((q) => q.id === deep.id)?.level === 'chapter', `the quests are kept in a save, and come back as they were (${q2.list.length})`);
  const old = { id: 'qold', kind: 'game', title: 'Game for the table', text: 'The shambles will pay for game.', giver: { kind: 'place', siteId: 'c1', siteName: 'Onson', placeId: 'shambles', name: 'the shambles', lon, lat },
    tasks: [{ type: 'bring', what: 'three cuts of raw meat', match: '^(raw_meat|carcass)$', count: 3 }], reward: { copper: 12, regard: 5 }, state: 'active', posted: 0, took: 0, deadline: s.game.time + 86400,
    facts: [{ t: 0, act: 'took', what: 'three cuts of raw meat', where: 'the shambles', pay: 12 }] };
  q2.import({ list: [old as unknown as Quest] });
  const back = q2.list[0];
  ok(!!back && back.template === 'job_game' && back.parts[0].tasks[0].type === 'collect' && q2.optionsFor({ placeId: 'shambles', siteId: 'c1' }).length === 1, 'a quest saved before the templates is brought forward and can be finished');
  void TEMPLATES;
  void (null as unknown as Country);

  console.log(failures ? `\n${failures} failure(s)` : '\nall ok');
  process.exit(failures ? 1 : 0);
}

void main();
