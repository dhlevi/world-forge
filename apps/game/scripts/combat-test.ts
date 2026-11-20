/**
 * Melee with beasts (docs/design/combat.md, stage 2; game/combat.ts, world/beasts.ts, world/fauna.ts):
 * weapons and what they hold, beasts' bodies, the blow and its words, duels over many seeds (a
 * spear against a wolf, fists against a bear), beasts that fight back, stand at bay or flee, a pack
 * that hunts the wanderer, blood trails, death and the carcass, and the wounded found again later.
 * npx tsx apps/game/scripts/combat-test.ts (exits non-zero on a failure).
 */
import { CHUNK } from '@worldforge/core/local/chunk';
import { G } from '@worldforge/core/local/tiles';
import { SPECIES, SPECIES_BY_ID } from '@worldforge/core/local/fauna';
import { mulberry32 } from '@worldforge/core/gen/rng';
import { Actor } from '../src/actors/actor';
import { Body, Mood, Pools, Skills, Traits } from '../src/actors/components';
import { startingInventory } from '../src/actors/items/inventory';
import { ITEMS } from '../src/actors/items/defs';
import { makeItem } from '../src/actors/items/item';
import { Needs } from '../src/actors/needs';
import { Health } from '../src/actors/health';
import { MessageDispatcher } from '../src/engine/messages';
import { Cast } from '../src/actors/cast';
import { aimables, armsOf, beastStrikes, morale, readyWeapon, strikeBeast, type Target } from '../src/game/combat';
import { BEASTS, fightOf, planOf } from '../src/world/beasts';
import { GameMap } from '../src/game/map';
import { Fauna, animalLines, type FaunaView, type Presence } from '../src/world/fauna';
import { Tracks, readTracks } from '../src/world/senses';
import { carcassOf, butcher } from '../src/world/hunting';
import type { AnimalGroup, ChunkData } from '../src/worker/protocol';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

function person(seed: number, levels: Record<string, number>, gear: string[] = []) {
  const bus = new MessageDispatcher();
  const cast = new Cast(bus);
  const a = new Actor('person');
  const t = a.add(new Traits(Traits.average()));
  const b = a.add(new Body({ heightCm: 175, weightKg: 75, build: 'average', skin: '', skinHex: '', hair: '', hairHex: '', hairStyle: 'short', beard: 'none', wounds: [] }));
  a.add(new Pools(Pools.fromTraits(t, b)));
  a.add(new Mood([]));
  const inv = a.add(startingInventory([], 0, {}));
  for (const g of gear) inv.d.items.push(makeItem(g));
  a.add(new Needs(Needs.fresh()));
  a.add(new Skills({ ...Skills.empty(), levels, dice: seed } as never));
  const h = a.add(new Health(Health.fresh(75)));
  cast.setPlayer(a);
  cast.setClock(0);
  return { a, inv, h };
}

console.log('weapons');
const melee = ITEMS.filter((d) => d.melee);
ok(melee.length >= 10 && melee.every((d) => d.melee!.reach >= 1 && d.melee!.seconds > 0), `the weapons can fight (${melee.map((d) => d.id).join(', ')})`);
{
  const p = person(1, {}, ['sword', 'torch']);
  ok(armsOf(p.inv).blows.map((b) => b.id).join() === 'punch,kick', 'nothing in hand: fists and feet');
  const r = readyWeapon(p.inv);
  ok(!!r && /sword/.test(r.text), `a weapon is drawn when needed ("${r?.text}")`);
  const arms = armsOf(p.inv);
  ok(arms.blows.some((b) => b.id === 'cut') && arms.blows.some((b) => b.id === 'thrust') && arms.parry > 0, `a sword cuts, thrusts and parries (${arms.blows.map((b) => b.name).join(', ')})`);
  const q = person(1, {}, ['spear']);
  readyWeapon(q.inv);
  ok(armsOf(q.inv).blows[0].reach === 2, 'a spear reaches two tiles');
}

console.log('\nbeasts\' bodies');
ok(Object.keys(BEASTS).every((id) => SPECIES_BY_ID.has(id)), 'every beast fought is a species');
ok(SPECIES.every((s) => fightOf(s).blows.length > 0), 'every species can fight, if only with its teeth');
for (const s of ['red_deer', 'crow', 'viper']) {
  const sp = SPECIES_BY_ID.get(s)!;
  const h = new Health(Health.beast(planOf(sp.plan), fightOf(sp).kg));
  const c = h.capacities();
  ok(c.consciousness > 0.99 && c.moving > 0.99 && c.breathing > 0.99, `a ${sp.name} whole: every capacity full (${h.planId})`);
}
{
  const deer = new Health(Health.beast('quad', 120));
  deer.hurt({ kind: 'fracture', sev: 25, part: 'leg.hl', cause: 'x', now: 0 });
  ok(deer.capacities().moving < 0.75, `a deer with a broken hind leg is lame (moving ${deer.capacities().moving.toFixed(2)})`);
  const hare = new Health(Health.beast('quad', 4)), bear = new Health(Health.beast('quad', 300));
  ok(hare.partOf('torso')!.hp < 20 && bear.partOf('torso')!.hp > 60, `a hare's body is far less tough than a bear's (${hare.partOf('torso')!.hp.toFixed(0)} against ${bear.partOf('torso')!.hp.toFixed(0)})`);
  ok(aimables(deer).some((x) => x.id === 'neck') && !aimables(deer).some((x) => x.id === 'heart'), 'the neck can be aimed at; the heart only reached through the body');
}

console.log('\nthe blow');
{
  const p = person(4, { polearms: 40, dodge: 25 }, ['spear']);
  readyWeapon(p.inv);
  const wolf = SPECIES_BY_ID.get('wolf')!;
  const h = new Health(Health.beast('quad', 40));
  h.rng = mulberry32(3);
  const t: Target = { name: 'the wolf', health: h, fight: fightOf(wolf), size: wolf.size, asleep: false, unaware: false };
  const lines: string[] = [];
  for (let i = 0; i < 6; i++) lines.push(strikeBeast(p.a, t, armsOf(p.inv).blows[0], i % 2 ? 'neck' : null, 'balanced', i * 2).text);
  console.log(`  ${lines.join('\n  ')}`);
  ok(lines.every((l) => /^You (thrust|stumble)/.test(l) || /^You thrust/.test(l)), 'every blow is told in words');
  const ex = strikeBeast(p.a, t, armsOf(p.inv).blows[0], null, 'balanced', 20);
  ok(/chance \d+%/.test(ex.tip) && /rolled \d+/.test(ex.tip), `the numbers are in the tip ("${ex.tip}")`);
  const sleeping = { ...t, health: new Health(Health.beast('quad', 40)), asleep: true };
  sleeping.health.rng = mulberry32(5);
  let hits = 0;
  for (let i = 0; i < 20; i++) if (strikeBeast(p.a, sleeping, armsOf(p.inv).blows[0], null, 'balanced', 30 + i).hit) hits++;
  ok(hits >= 14, `a sleeping beast is easy to hit (${hits} of 20)`);
  const bx = beastStrikes({ name: 'the wolf', fight: fightOf(wolf), health: h }, p.a, fightOf(wolf).blows[0], 'defensive', 40);
  ok(bx.text.length > 0 && /attack \d+/.test(bx.tip), `a beast's blow is told ("${bx.text}")`);
  const q = person(6, {}, ['mail_shirt']);
  q.inv.d.items.find((i) => i.def === 'mail_shirt')!.loc = { at: 'worn' };
  let turned = 0;
  const viper = SPECIES_BY_ID.get('viper')!;
  for (let i = 0; i < 30; i++) {
    const r = beastStrikes({ name: 'the cat', fight: fightOf(SPECIES_BY_ID.get('cat')!), health: null }, q.a, { ...fightOf(SPECIES_BY_ID.get('cat')!).blows[0], goes: ['torso'] }, 'balanced', i, { helpless: true });
    if (!r.wounds.length) turned++;
  }
  ok(turned >= 20, `mail turns a cat's claws on the body (${turned} of 30)`);
  const v = person(7, {});
  beastStrikes({ name: 'the viper', fight: fightOf(viper), health: null }, v.a, fightOf(viper).blows[0], 'balanced', 0, { helpless: true });
  ok((v.h.d.cond.venom ?? 0) > 0 || (v.h.d.venomLeft ?? 0) > 0, 'a viper\'s bite brings venom');
}

console.log('\nduels (exchanges in time order; a beast breaks off when its courage fails)');
/**
 * A fight to its end: the wanderer's blows and the beast's in time order. A beast that means to kill
 * fights on until its courage fails; one that means only to drive the wanderer off, or to defend
 * itself, stops once it has landed two blows (world/fauna.ts).
 */
function duel(seed: number, levels: Record<string, number>, gear: string[], species: string, stance: 'aggressive' | 'balanced' | 'defensive' = 'balanced'): 'won' | 'broke' | 'lost' | 'drove you off' | 'draw' {
  const p = person(seed, levels, gear);
  readyWeapon(p.inv);
  for (const it of p.inv.d.items) if (it.def === 'mail_shirt' || it.def === 'padded_coat') it.loc = { at: 'worn' };
  const s = SPECIES_BY_ID.get(species)!, f = fightOf(s);
  const h = new Health(Health.beast(planOf(s.plan), f.kg));
  h.rng = mulberry32(seed * 7 + 1);
  const t: Target = { name: `the ${s.name}`, health: h, fight: f, size: s.size, asleep: false, unaware: false };
  let tp = 0, tb = 0.5, hits = 0;
  const kills = f.fights === 'back' && s.diet === 'predator';
  const r = mulberry32(seed);
  // About a minute of fighting: a beast fights no longer than that before one side gives way.
  for (let i = 0; i < 60; i++) {
    if (p.h.dead || p.h.senseless() || p.h.capacities().moving < 0.15) return 'lost';
    if (h.dead || h.capacities().moving < 0.15) return 'won';
    if (morale(h) < f.breaks || h.senseless()) return 'broke';
    if (tp <= tb) {
      const ex = strikeBeast(p.a, t, armsOf(p.inv).blows[0], null, stance, tp);
      tp += ex.seconds;
      h.advance(ex.seconds, {}, tp);
    } else {
      const blow = f.blows[Math.floor(r() * f.blows.length)];
      const ex = beastStrikes({ name: t.name, fight: f, health: h }, p.a, blow, stance, tb);
      tb += blow.seconds;
      if (ex.wounds.length) hits++;
      if (!kills && hits >= 2 && !p.h.dead && !p.h.senseless()) return 'drove you off';
    }
  }
  return 'draw';
}
const tally = (fn: (s: number) => string, n = 60) => {
  const out: Record<string, number> = {};
  for (let s = 1; s <= n; s++) {
    const r = fn(s);
    out[r] = (out[r] ?? 0) + 1;
  }
  return out;
};
const spearWolf = tally((s) => duel(s, { polearms: 40, dodge: 25 }, ['spear', 'padded_coat'], 'wolf'));
console.log(`  a fair spearman (Polearms 40, a padded coat) against a lone wolf: ${JSON.stringify(spearWolf)}`);
ok((spearWolf.won ?? 0) + (spearWolf.broke ?? 0) >= 40, 'a fair spearman mostly kills or drives off a lone wolf');
ok((spearWolf.lost ?? 0) >= 1, 'but not always');
const fistsBear = tally((s) => duel(s, { unarmed: 20 }, [], 'brown_bear'));
console.log(`  fists against a brown bear: ${JSON.stringify(fistsBear)}`);
ok((fistsBear.lost ?? 0) + (fistsBear['drove you off'] ?? 0) >= 55, 'fists against a bear: nearly always mauled, until it has had enough');
const axeBoar = tally((s) => duel(s, { axes: 35, dodge: 20 }, ['axe'], 'boar'));
console.log(`  an axe (Axes 35) against a wild boar: ${JSON.stringify(axeBoar)}`);
ok((axeBoar['drove you off'] ?? 0) + (axeBoar.lost ?? 0) >= 20 && (axeBoar.lost ?? 0) <= 15, 'a boar is a dangerous beast to face: it mostly wounds and drives you off, and sometimes cripples');
const swordFox = tally((s) => duel(s, { longblades: 30 }, ['sword'], 'fox'));
console.log(`  a sword against a fox: ${JSON.stringify(swordFox)}`);
ok((swordFox.lost ?? 0) <= 3, 'a fox is little danger to a swordsman');

// ---- On a meadow, with the animals' minds (world/fauna.ts) -------------------------------------------
console.log('\nbeasts that fight');
const N = CHUNK * CHUNK;
const map = new GameMap(() => {});
for (let cy = -1; cy <= 2; cy++) for (let cx = -1; cx <= 2; cx++) {
  const ground = new Uint8Array(N).fill(G('grass')), object = new Uint8Array(N), area = new Uint16Array(N);
  map.add({ cx, cy, ground, object, area, areas: [''], elev: new Int16Array(N).fill(30), sites: [], roofs: [], layers: [], ms: 0 } as ChunkData);
}
let seenAll = true;
const view: FaunaView & { px: number; py: number; time: number } = { px: 30, py: 30, z: null, time: 86400 + 12 * 3600, map, isVisible: (x, y) => seenAll && Math.hypot(x - view.px, y - view.py) <= 40 };
/** Places groups out of sight (as the bubble does), then looks again. */
const place = (f: Fauna, groups: AnimalGroup[]) => {
  seenAll = false;
  f.take(groups, view);
  seenAll = true;
};
const who: Presence = { sneaking: false, sneak: 0, light: 1, wind: { x: 1, y: 0, strength: 0 }, winter: false, rise: 6, set: 18 };
const grp = (id: string, species: string, members: [number, number][], home: [number, number, number]): AnimalGroup => ({ id, species, members: members.map(([x, y]) => ({ x, y, z: null })), home: { x: home[0], y: home[1], r: home[2] }, water: null });
const fresh = () => new Fauna(() => Promise.resolve({ groups: [], radius: 64 }), new Tracks());
const runFor = (f: Fauna, secs: number, step = 1.2) => {
  for (const end = view.time + secs; view.time < end; view.time += step) f.run(view, who);
};
{
  // Struck, a boar fights back; it comes on, and its blows reach the wanderer.
  const f = fresh();
  place(f, [grp('b1', 'boar', [[33, 30]], [33, 30, 3])]);
  const boar = [...f.all()][0];
  const blows: string[] = [];
  f.onStrike = (a, blow) => blows.push(`${a.s.name}:${blow.name}`);
  f.healthOf(boar, view.time).hurt({ kind: 'cut', sev: 3, part: 'torso', cause: 'test', now: view.time });
  f.provoke(boar, view);
  ok(boar.fight?.intent === 'drive' && boar.state === 'attack', `struck, a boar fights back, to drive you off (${boar.fight?.intent})`);
  runFor(f, 8);
  ok(blows.length >= 1, `and comes on and strikes (${blows.join(', ')})`);
  ok(!boar.fight, 'and, having made its point, backs off');
  ok(animalLines(boar, view.time).some((l) => /wounded/.test(l)), `looking at it shows its wounds ("${animalLines(boar, view.time).join(' ')}")`);
}
{
  // Struck, a deer runs, bleeding: a trail of blood to follow.
  const f = fresh();
  place(f, [grp('d1', 'red_deer', [[32, 30], [36, 36], [37, 37]], [34, 34, 6])]);
  const deer = [...f.all()][0];
  f.healthOf(deer, view.time).hurt({ kind: 'stab', sev: 9, part: 'torso', cause: 'test', now: view.time });
  f.provoke(deer, view);
  ok(!deer.fight && deer.state === 'flee', 'struck, a red deer flees');
  runFor(f, 40);
  let blood = 0;
  for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) if (f.tracks.bloodAt(x, y, null, view.time)) blood++;
  ok(blood >= 3, `it leaves blood behind (${blood} tiles)`);
  const read = (() => {
    for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) if (f.tracks.bloodAt(x, y, null, view.time)) return readTracks(f.tracks.at(x, y, null, view.time), view.time, 40);
    return null;
  })();
  ok(!!read && /Blood on the ground \(a wounded red deer's\)/.test(read), `Tracking reads the blood ("${read}")`);
}
{
  // A deer hurt to death dies where it runs, and leaves its carcass.
  const f = fresh();
  place(f, [grp('d2', 'roe_deer', [[34, 30]], [34, 30, 4])]);
  const deer = [...f.all()][0];
  const died: string[] = [];
  f.onDied = (s, x, y) => died.push(`${s.name}@${x},${y}`);
  f.healthOf(deer, view.time).hurt({ kind: 'cut', sev: 12, part: 'neck', cause: 'test', now: view.time });
  f.provoke(deer, view);
  runFor(f, 4 * 3600, 30);
  ok(died.length === 1 && !f.size, `a roe deer with a deep gash in the neck runs, and dies of it (${died.join()})`);
  const c = carcassOf(SPECIES_BY_ID.get('roe_deer')!);
  ok((c.kg ?? 0) >= 20, `its carcass is as heavy as the beast (${c.kg} kg)`);
  const p = person(9, { survival: 30 }, ['knife']);
  const b = butcher(p.a, p.inv, c, 0)!;
  ok(b.items.some((i) => i.def === 'raw_meat') && b.seconds > 15 * 60, `butchered, slowly for its size (${Math.round(b.seconds / 60)} minutes)`);
}
{
  // A hungry pack hunts a lone wanderer on a winter night.
  const f = fresh();
  view.time = 86400 * 3 + 18.6 * 3600;
  place(f, [grp('w1', 'wolf', [[42, 30], [43, 31], [42, 32], [44, 30]], [43, 31, 6])]);
  const pack = [...f.all()];
  for (const w of pack) w.ate = view.time - 20 * 3600;
  // Dusk, in winter, and the wind carries the wanderer's scent to them.
  const night = { ...who, light: 0.1, winter: true, wind: { x: 1, y: 0, strength: 4 } };
  let n = 0;
  for (; n < 200 && !pack.some((w) => w.fight); n++) {
    view.time += 1.2;
    f.run(view, night);
  }
  ok(pack.every((w) => w.fight?.intent === 'kill'), `the pack sets on the wanderer together (after ${n} turns)`);
  // By day, sated, a pack keeps its distance.
  const f2 = fresh();
  view.time = 86400 * 5 + 12 * 3600;
  place(f2, [grp('w2', 'wolf', [[42, 30], [43, 31], [42, 32]], [43, 31, 6])]);
  for (const w of f2.all()) w.ate = view.time;
  runFor(f2, 120);
  ok(![...f2.all()].some((w) => w.fight), 'by day, sated, the pack does not attack');
}
{
  // A wounded beast that leaves the bubble is found again later, lying up or dead.
  seenAll = false;
  const f = fresh();
  view.time = 86400 * 7 + 12 * 3600;
  f.take([grp('e1', 'elk', [[34, 30]], [34, 30, 4])], view);
  const elk = [...f.all()][0];
  f.healthOf(elk, view.time).hurt({ kind: 'fracture', sev: 30, part: 'leg.fl', cause: 'test', now: view.time });
  view.px = 300;
  f.take([], view);
  ok(!f.size && f.wounded.length === 1, 'a wounded elk out of the bubble is kept');
  const saved = JSON.parse(JSON.stringify(f.exportWounded()));
  const f2 = fresh();
  f2.importWounded(saved);
  view.px = 10;
  view.time += 3 * 3600;
  f2.run(view, who);
  const back = [...f2.all()][0];
  ok(!!back && back.state === 'lying' && back.health!.d.wounds.length > 0, `saved, and found again lying up hours later ("${back ? animalLines(back, view.time).join(' ') : ''}")`);
}

console.log(failures ? `\n${failures} failed` : '\nall combat tests passed');
if (failures) process.exit(1);
