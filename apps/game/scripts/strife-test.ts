/**
 * People in fights and the law (docs/design/combat.md, stage 4; world/folk-fight.ts,
 * world/strife.ts, world/law.ts): who fights how well; a cooper struck runs or fights back; the
 * watch call on the wanderer to yield, then fight to hold them, and make the arrest; a robber
 * demands the purse and takes it from one who yields; courage fails and people yield or run; the
 * fallen come round; the dead stay dead; a brawl, broken up by the watch; sentences by the law.
 * npx tsx apps/game/scripts/strife-test.ts (exits non-zero on a failure).
 */
import { CHUNK } from '@worldforge/core/local/chunk';
import { G, O } from '@worldforge/core/local/tiles';
import { GameMap } from '../src/game/map';
import { Population, type PopulationView, type Resident } from '../src/world/population';
import { Strife, type Wanderer } from '../src/world/strife';
import { callName, courage, folkFight, folkSkills, healthOf, isWatch } from '../src/world/folk-fight';
import { Law, harshness } from '../src/world/law';
import type { ChunkData, PlacedPerson } from '../src/worker/protocol';
import { mulberry32 } from '@worldforge/core/gen/rng';
import '../src/actors/cast';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

const N = CHUNK * CHUNK;
const map = new GameMap(() => {});
for (let cy = -1; cy <= 1; cy++) for (let cx = -1; cx <= 1; cx++) {
  map.add({ cx, cy, ground: new Uint8Array(N).fill(G('grass')), object: new Uint8Array(N), area: new Uint16Array(N), areas: [''], elev: new Int16Array(N).fill(30), sites: [], roofs: [], layers: [], ms: 0 } as ChunkData);
}
const H = 3600;
const view: PopulationView & { time: number; px: number; py: number } = { px: 10, py: 10, z: null, time: 12 * H, map, isVisible: (x, y) => Math.hypot(x - view.px, y - view.py) <= 30 };

const person = (id: string, trade: string, at: [number, number], o: Partial<PlacedPerson> = {}): PlacedPerson => ({
  id, name: `${id} Smith`, given: id, female: false, age: 30, culture: 0, people: 'the folk', trade, role: 'head', traits: [], means: 'middling',
  household: `the household of ${id}`, homeId: `h-${id}`, ties: [], template: trade === 'guard' ? 'guard' : 'craft', day: 0,
  plan: [{ from: 0, to: 24, act: 'work', place: 'out', at: { x: at[0], y: at[1], z: null } }], home: { x: at[0], y: at[1], z: null }, at: null, facing: 's',
  look: { kind: 'human', skin: '#d8b090', hair: '#5a3a20', hairStyle: 'short', beard: 'none', cloth: ['#7a6a50', '#6a5a46', '#4e5a3e'] }, ...o,
});

/** A bubble with these people placed (out of sight first, then looked at). */
function bubble(list: PlacedPerson[]) {
  const pop = new Population(() => Promise.resolve({ people: [], radius: 0 }), 'seed');
  view.px = 400;
  pop.take(list.map((p) => ({ ...p, at: p.plan[0].at })), view);
  view.px = 10;
  const strife = new Strife(pop);
  const log: string[] = [];
  strife.onSee = (t) => log.push(t);
  const byId = (id: string) => [...pop.everyone()].find((r) => r.p.id === id)!;
  return { pop, strife, log, byId };
}
const runFor = (s: Strife, secs: number, w: Wanderer = { helpless: false, yielded: false }, step = 1.2) => {
  for (const end = view.time + secs; view.time < end; view.time += step) s.run(view, w);
};

console.log('who fights how well');
{
  const { byId } = bubble([person('Cob', 'cooper', [12, 10]), person('Gar', 'guard', [14, 10]), person('Rob', 'robber', [16, 10], { template: 'bandit' })]);
  const cooper = byId('Cob'), guard = byId('Gar'), robber = byId('Rob');
  ok(folkSkills(guard).weapon > folkSkills(cooper).weapon && folkSkills(robber).weapon > folkSkills(cooper).weapon, `the watch and robbers fight better than a cooper (${folkSkills(guard).weapon}, ${folkSkills(robber).weapon}, ${folkSkills(cooper).weapon})`);
  ok(courage(guard) < courage(cooper), 'and hold their ground longer');
  ok(isWatch(guard) && !isWatch(cooper), 'the guard is of the watch');
  ok(folkFight(cooper, 'brawl').blows.every((b) => b.kind === 'bruise'), 'a brawl is fists');
  ok(callName(cooper, { has: () => false } as never) === 'the man', 'a stranger is "the man" until he gives his name');
  ok(callName(cooper, { has: () => true } as never) === cooper.p.given, 'and by name once he has');
  const h = healthOf(cooper, view.time);
  ok(h.planId === 'humanoid' && h.capacities().moving > 0.99, 'people have bodies of their own');
}

console.log('\nstruck');
{
  // A craven cooper runs, crying for the watch.
  const { pop, strife, log, byId } = bubble([person('Cob', 'cooper', [12, 10], { traits: ['Craven'] })]);
  let called = 0;
  strife.onCallWatch = () => called++;
  const c = byId('Cob');
  strife.provoke(c, view, false);
  ok(c.plight === 'fleeing' && called === 1, `a craven cooper struck runs, crying for the watch (${log.join(' / ')})`);
  runFor(strife, 60);
  ok(!c.plight && !c.fight, 'and, out of sight, goes back to the day');
  void pop;
}
{
  // A brave one fights back with fists for fists.
  const { strife, byId } = bubble([person('Bran', 'smith', [11, 10], { traits: ['Brave'] })]);
  const s = byId('Bran');
  const blows: string[] = [];
  strife.onStrike = (_r, b) => blows.push(b.name);
  strife.provoke(s, view, false);
  ok(s.fight?.intent === 'brawl', 'a brave smith struck with fists answers with fists');
  runFor(strife, 6);
  ok(blows.length >= 2 && blows.every((b) => b === 'fist' || b === 'foot'), `and lands blows (${blows.join(', ')})`);
  strife.wandererYields(view);
  ok(!s.fight, 'and lets the wanderer be when they yield');
}

console.log('\nthe watch');
{
  const { strife, log, byId } = bubble([person('Gar', 'guard', [16, 10])]);
  const g = byId('Gar');
  let arrested = 0;
  const blows: string[] = [];
  strife.onArrest = () => arrested++;
  strife.onStrike = (_r, b) => blows.push(b.name);
  strife.start(g, 'arrest', 'player', view.time);
  runFor(strife, 8);
  ok(log.some((l) => /Yield, in the name of the law/.test(l)), 'the guard comes and calls on the wanderer to yield');
  runFor(strife, 10);
  ok(blows.length > 0 && folkFight(g, 'arrest').blows.every((b) => b.kind === 'bruise'), `then beats them down, with blunt blows (${blows.slice(0, 3).join(', ')})`);
  runFor(strife, 3, { helpless: false, yielded: true });
  ok(arrested === 1 && !g.fight, `and makes the arrest when they yield (${arrested})`);
}

console.log('\nrobbers');
{
  const { strife, log, byId } = bubble([person('Rob', 'robber', [14, 10], { template: 'bandit' })]);
  const r = byId('Rob');
  let robbed = 0;
  strife.onRob = () => robbed++;
  strife.start(r, 'rob', 'player', view.time);
  runFor(strife, 6);
  ok(log.some((l) => /Your purse/.test(l)), 'a robber demands the purse');
  runFor(strife, 3, { helpless: false, yielded: true });
  ok(robbed === 1 && r.plight === 'fleeing', 'takes it from one who yields, and makes off');
}

console.log('\ncourage, the fallen, the dead');
{
  const { pop, strife, log, byId } = bubble([person('Cob', 'cooper', [11, 10]), person('Gar', 'guard', [14, 14])]);
  const c = byId('Cob');
  strife.start(c, 'defend', 'player', view.time);
  const h = healthOf(c, view.time);
  h.hurt({ kind: 'cut', sev: 22, part: 'leg.l', cause: 'test', now: view.time });
  runFor(strife, 3);
  ok(c.plight === 'yielded' || c.plight === 'fleeing', `badly hurt, a cooper gives up (${c.plight}: ${log.join(' / ')})`);
  const g = byId('Gar');
  strife.start(g, 'arrest', 'player', view.time);
  const hg = healthOf(g, view.time);
  hg.hurt({ kind: 'bruise', sev: 20, part: 'head', cause: 'test', now: view.time });
  runFor(strife, 2);
  ok(g.plight === 'down', `a blow to the head fells the guard (${g.plight})`);
  runFor(strife, 3 * H, undefined, 30);
  ok(log.some((l) => /comes round/.test(l)) && !g.fight, 'who comes round in time, the fight gone out of him');
  // Dead.
  let died = 0;
  strife.onDied = () => died++;
  h.hurt({ kind: 'stab', sev: 30, part: 'heart', cause: 'test', now: view.time });
  runFor(strife, 2);
  ok(died === 1 && pop.dead.has('Cob') && ![...pop.everyone()].some((x) => x.p.id === 'Cob'), 'the dead are taken from the bubble');
  view.px = 400;
  pop.take([person('Cob', 'cooper', [11, 10])], view);
  view.px = 10;
  ok(![...pop.everyone()].some((x) => x.p.id === 'Cob'), 'and never placed again');
}

console.log('\na brawl');
{
  const { strife, log, byId } = bubble([person('Ann', 'labourer', [11, 12], { traits: ['Wrathful'] }), person('Bo', 'porter', [12, 12])]);
  const a = byId('Ann'), b = byId('Bo');
  strife.brawl(a, b, view);
  ok(a.fight?.foe === 'Bo' && /come to blows/.test(log.join()), 'two come to blows');
  runFor(strife, 10 * 60);
  ok(!a.fight && !b.fight && (a.plight === 'yielded' || b.plight === 'yielded' || a.plight === 'down' || b.plight === 'down' || (!a.plight && !b.plight)), `until one gives up or falls (${a.plight ?? '-'} / ${b.plight ?? '-'})`);
  const { strife: s2, log: l2, byId: id2 } = bubble([person('Cy', 'labourer', [11, 12]), person('Di', 'porter', [12, 12]), person('Gar', 'guard', [13, 13])]);
  s2.brawl(id2('Cy'), id2('Di'), view);
  runFor(s2, 5);
  ok(!id2('Cy').fight && l2.some((l) => /pulls them apart/.test(l)), 'the watch near breaks it up');
}

console.log('\nrobber bands');
{
  const rob = (id: string, at: [number, number], band = 'band:1,1:0') => person(id, 'robber', at, { template: 'bandit', homeId: band, household: 'the band' });
  const { strife, log, byId, pop } = bubble([rob('R1', [20, 10]), rob('R2', [21, 11]), rob('R3', [22, 9]), rob('F1', [60, 60], 'band:9,9:0')]);
  runFor(strife, 1.2);
  ok(['R1', 'R2', 'R3'].every((id) => byId(id).fight?.intent === 'rob') && !byId('F1').fight && /Robbers! 3 of them/.test(log.join()), 'a band that sees the wanderer comes, all together, to rob them; one far off does not');
  let robbed = 0;
  strife.onRob = () => robbed++;
  runFor(strife, 20);
  runFor(strife, 4, { helpless: false, yielded: true });
  ok(robbed === 1 && ['R1', 'R2', 'R3'].every((id) => !byId(id).fight), 'robbed once, and all of them make off');
  for (const id of ['R1', 'R2', 'R3']) pop.release(byId(id));
  runFor(strife, 60);
  ok(['R1', 'R2', 'R3'].every((id) => !byId(id).fight), 'and let the wanderer pass for a day after');
  // An ambush on the road: the band, wherever its camp, rises about the wanderer.
  const am = bubble([rob('A1', [90, 90], 'band:5,5:0'), rob('A2', [91, 90], 'band:5,5:0')]);
  am.strife.ambush = { band: 'band:5,5:0', until: view.time + 600 };
  runFor(am.strife, 1.2);
  const a1 = am.byId('A1'), a2 = am.byId('A2');
  ok(!!a1.fight && !!a2.fight && Math.max(Math.abs(a1.x - view.px), Math.abs(a1.y - view.py)) <= 8 && /rise from the cover/.test(am.log.join()), `an ambush: they rise from cover about the wanderer (${a1.x},${a1.y})`);
}

console.log('\ntempers');
{
  const { byId, pop } = bubble([person('Hot', 'labourer', [11, 10], { traits: ['Wrathful'] }), person('Mild', 'clerk', [10, 11])]);
  const hot = byId('Hot'), mild = byId('Mild');
  const shove = (r: Resident) => {
    const said: string[] = [];
    for (let i = 0; i < 5; i++) {
      // Held still, so they cannot step aside.
      r.path = [{ x: r.x, y: r.y, z: r.z }] as never;
      said.push(pop.bumped(view, r));
      view.time += 10;
    }
    return said.join(' / ');
  };
  const sh = shove(hot);
  ok(hot.fight?.intent === 'brawl' && !!hot.fight.began && /swings at you/.test(sh), 'a hot-tempered labourer shoved again and again swings at the wanderer');
  shove(mild);
  ok(!mild.fight, 'a mild clerk only grumbles');
  const hater = bubble([person('Hate', 'smith', [11, 10], { traits: ['Brave'] })]);
  hater.pop.opinions.add('Hate', 'Hate Smith', 'attacked me', -80, view.time, 60);
  runFor(hater.strife, 30 * 60, undefined, 30);
  ok(/spits, and comes at you/.test(hater.log.join()), 'one who hates the wanderer, close by, comes at them in time');
}

console.log('\na tavern at night');
{
  const night = Math.ceil(view.time / 86400) * 86400 + 21 * 3600;
  view.time = night;
  const drinker = (id: string, at: [number, number], o: Partial<PlacedPerson> = {}) => person(id, 'labourer', at, { homeId: id.slice(0, 2), plan: [{ from: 0, to: 24, act: 'leisure', place: 'tavern', at: { x: at[0], y: at[1], z: null } }], ...o });
  let brawls = 0;
  for (let n = 0; n < 8 && !brawls; n++) {
    view.time = night + n * 86400;
    const { strife, log } = bubble([drinker(`D${n}a`, [30, 30], { traits: ['Wrathful'] }), drinker(`D${n}b`, [31, 30]), drinker(`D${n}c`, [32, 31]), drinker(`D${n}d`, [30, 32]), drinker(`D${n}e`, [33, 33])]);
    for (let hr = 0; hr < 5 && !brawls; hr++) {
      runFor(strife, 3600, undefined, 60);
      if (log.some((l) => /come to blows/.test(l))) brawls++;
    }
  }
  ok(brawls > 0, 'drink starts a brawl now and then, at night in a tavern');
}

console.log('\nthe worker\'s bands');
{
  const { generateWorld } = await import('@worldforge/core/gen/world');
  const { LocalWorld } = await import('@worldforge/core/local/chunk');
  const { banditsIn, banditry } = await import('../src/worker/bandits');
  const w = generateWorld({ seed: 'forge', landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 512 } as never, () => {});
  const town = w.settlements.filter((s) => s.tier === 'town').sort((a, b) => b.population - a.population)[0];
  const local = new LocalWorld(w, town);
  const [x, y] = local.startTile();
  const T = 86400 * 3 + 10 * 3600;
  ok(banditsIn(w, local, x, y, 96, T).length === 0, 'no robbers camp in a town');
  const S = 3 * CHUNK;
  ok(banditry(w, local, Math.floor(x / S), Math.floor(y / S)) === 0, 'and a town\'s country is kept clear');
  // Far out in the country, over a stretch of weeks, some bands.
  let found: PlacedPerson[] = [];
  for (let wk = 0; wk < 30 && !found.length; wk++) for (const [dx, dy] of [[3000, 0], [0, 3000], [-3000, 0], [0, -3000], [2000, 2000]]) {
    found = banditsIn(w, local, x + dx, y + dy, 128, T + wk * 7 * 86400, () => 'road');
    if (found.length) break;
  }
  ok(found.length >= 2 && found.every((p) => p.template === 'bandit' && p.homeId === found[0].homeId) && found.filter((p) => /chief/.test(p.trade)).length === 1, `in the wilds, now and then, a band with a chief (${found.map((p) => `${p.name}, ${p.trade}`).join('; ')})`);
  if (found.length) {
    const again = banditsIn(w, local, found[0].at!.x, found[0].at!.y, 128, T, () => 'road');
    void again;
    const [bx, by] = found[0].homeId.slice(5).split(':')[0].split(',').map(Number);
    const wk = Number(found[0].homeId.split(':')[2]);
    const lying = banditsIn(w, local, bx * S + 20, by * S + 20, 128, wk * 7 * 86400 + 3600, () => 'road', [bx, by]);
    const same = lying.filter((p) => p.homeId === found[0].homeId);
    ok(same.length === found.length && same.every((p, i) => p.name === found[i].name) && same.every((p) => Math.max(Math.abs(p.at!.x - bx * S - 20), Math.abs(p.at!.y - by * S - 20)) <= 14), 'lying in wait on the road, the same band waits beside the wanderer');
  }
}

console.log('\nbystanders');
{
  const { strife, log, byId } = bubble([
    person('Vic', 'cooper', [11, 10], { homeId: 'h1' }), person('Bram', 'smith', [13, 12], { traits: ['Brave'] }), person('Kin', 'weaver', [9, 13], { homeId: 'h1' }),
    person('Clem', 'clerk', [14, 8]), person('Tib', 'clerk', [8, 7]), person('Kit', 'clerk', [12, 14], { age: 9 }), person('Gar', 'guard', [20, 14]),
  ]);
  const seen = ['Bram', 'Kin', 'Clem', 'Tib', 'Kit', 'Gar'].map(byId);
  const cried = strife.witnessed(seen, byId('Vic'), view, false);
  ok(byId('Bram').fight?.intent === 'brawl' && !!byId('Bram').fight?.began, 'a brave smith comes to the aid of one struck with fists');
  ok(byId('Kin').fight?.foe === 'player', 'and so does one of the victim\'s household, with less courage');
  ok(byId('Clem').plight === 'fleeing' && byId('Tib').plight === 'fleeing' && cried >= 2, 'the timid scatter, crying for the watch');
  ok(byId('Kit').plight === 'fleeing' && byId('Gar').fight?.intent === 'arrest', 'a child runs; the watch come to arrest');
  ok(/rushes to help/.test(log.join()) && /crying for the watch/.test(log.join()), `and it is told (${log.join(' / ')})`);
  // Bram came to help: while the wanderer keeps striking he fights; when they stop, he holds off, then backs away.
  const one = bubble([person('Vic3', 'cooper', [11, 10]), person('Bram', 'smith', [12, 11], { traits: ['Brave'] })]);
  one.strife.witnessed([one.byId('Bram')], one.byId('Vic3'), view, false);
  const bram = one.byId('Bram');
  const blows: string[] = [];
  one.strife.onStrike = (_r, b) => blows.push(b.name);
  runFor(one.strife, 6, { helpless: false, yielded: false, struckAt: view.time });
  const fought = blows.length;
  const quiet = view.time;
  runFor(one.strife, 60, { helpless: false, yielded: false, struckAt: quiet - 10 });
  ok(fought > 0 && blows.length - fought <= 2 && !!bram.fight, `one who came to help fights while the wanderer strikes (${fought} blows), and holds off when they stop (${blows.length - fought} after; ${bram.fight?.intent} ${bram.plight})`);
  runFor(one.strife, 200, { helpless: false, yielded: false, struckAt: quiet - 10 }, 5);
  ok(!bram.fight && /backs away/.test(one.log.join()), 'and in time backs away');
  const armed = bubble([person('Vic2', 'cooper', [11, 10]), person('Hal', 'porter', [13, 12])]);
  armed.strife.witnessed([armed.byId('Hal')], armed.byId('Vic2'), view, true);
  ok(armed.byId('Hal').plight === 'fleeing', 'against a blade, a porter of middling nerve runs instead');
}
{
  // The watch come round a wall to the wanderer, and from beyond the bubble.
  for (let y = 4; y <= 16; y++) map.setObjectAt(15, y, null, O('wall_stone')!);
  const { strife, byId, pop } = bubble([person('Gar', 'guard', [20, 10])]);
  const g = byId('Gar');
  strife.start(g, 'arrest', 'player', view.time);
  runFor(strife, 40);
  ok(Math.max(Math.abs(g.x - view.px), Math.abs(g.y - view.py)) <= 2, `the watch go round a wall to reach the wanderer (${g.x},${g.y})`);
  const sent = pop.summon({ ...person('Sgt', 'sergeant', [0, 0]), at: null }, view, { x: view.px, y: view.py, z: null }, 22, 45, mulberry32(7));
  ok(!!sent && sent.present && !view.isVisible(sent.x, sent.y), 'one sent for is set down out of sight');
  for (let y = 4; y <= 16; y++) map.setObjectAt(15, y, null, 0);
}

console.log('\nthe law');
{
  const law = new Law();
  const town = { id: 't1', name: 'Onson' };
  ok(!law.crime(town, 'assault', 'Cob', 0, 0), 'an unseen crime is not on the record');
  ok(law.crime(town, 'assault', 'Cob', 2, 0) && law.wanted('t1'), 'a seen one is, and the wanderer is wanted');
  let s = law.sentence('t1', 1);
  ok(s.fine === 40 && !s.days && !s.hang, `assault: a fine (${s.fine} copper)`);
  ok(Law.pay(40, 10).days === 2, 'what cannot be paid is served in the cells');
  law.served('t1');
  ok(!law.wanted('t1'), 'served, no longer wanted');
  law.crime(town, 'theft', 'Bo', 1, 10, 30);
  law.served('t1');
  law.crime(town, 'theft', 'Cy', 1, 20, 5);
  s = law.sentence('t1', 1);
  ok(s.brand, 'a thief taken again is branded');
  law.served('t1');
  law.crime(town, 'murder', 'Di', 1, 30);
  ok(law.sentence('t1', 1).hang && !law.sentence('t1', 0.7).hang, 'murder hangs, but for the mildest laws');
  ok(law.standing('t1', 40) < -40 && law.standing('t1', 40 + 400 * 86400) > -5, `the town's regard falls, and recovers in time (${law.standing('t1', 40).toFixed(0)})`);
  const again = new Law();
  again.import(JSON.parse(JSON.stringify(law.export())));
  ok(again.wanted('t1') && again.sentence('t1', 1).hang, 'the record is saved');
  ok(harshness(undefined) === 1, 'the usual harshness, for a people with no word on it');
}

console.log(failures ? `\n${failures} failed` : '\nall strife tests passed');
if (failures) process.exit(1);
