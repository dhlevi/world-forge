/**
 * The test bench for skill checks and learning (actors/checks.ts, the Skills component): the odds,
 * how fast skills grow by use, the daily limit, rust, and limits on lessons and books.
 * npx tsx apps/game/scripts/skills-test.ts
 */
import { Actor } from '../src/actors/actor';
import { Body, Identity, Mood, Pools, Skills, Traits, type IdentityData, type TimeCtx } from '../src/actors/components';
import { startingInventory } from '../src/actors/items/inventory';
import { Needs } from '../src/actors/needs';
import { MessageDispatcher } from '../src/engine/messages';
import { Cast } from '../src/actors/cast';
import { DC, GRADES, chanceOf, check, gradeOf, type Grade } from '../src/actors/checks';
import { lesson, readBook, teacherLevel } from '../src/actors/learning';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

function person(o: { int?: number; levels?: Record<string, number>; name?: string } = {}): { a: Actor; cast: Cast; s: Skills } {
  const bus = new MessageDispatcher();
  const cast = new Cast(bus);
  const a = new Actor('person');
  a.add(new Identity({ given: o.name ?? 'Test', full: o.name ?? 'Test', female: false, age: 25, year: 1000, folk: 'Human', culture: 0, cultureName: 'Test', people: 'Test', homeId: 'h', homeName: 'Home', standing: 'peasant' } as IdentityData));
  const tr = Traits.average();
  if (o.int) tr.traits.intelligence = o.int;
  const t = a.add(new Traits(tr));
  const b = a.add(new Body({ heightCm: 175, weightKg: 75, build: 'average', skin: '', skinHex: '', hair: '', hairHex: '', hairStyle: 'short', beard: 'none', wounds: [] }));
  a.add(new Pools(Pools.fromTraits(t, b)));
  a.add(new Mood([]));
  a.add(startingInventory([], 0, {}));
  a.add(new Needs(Needs.fresh()));
  const s = a.add(new Skills({ ...Skills.empty(), levels: { ...(o.levels ?? {}) }, languages: { 0: { name: 'Test', speak: 100, read: 60 } } }));
  cast.setPlayer(a);
  cast.setClock(0);
  return { a, cast, s };
}

// ---- The odds -------------------------------------------------------------------------------------
console.log('\n== Chance of success (%) by level (average traits) against difficulty');
const diffs = Object.entries(DC);
console.log(`level  ${diffs.map(([k]) => k.padStart(9)).join('')}`);
for (const lv of [0, 10, 20, 35, 50, 65, 80, 95]) console.log(`${String(lv).padStart(5)}  ${diffs.map(([, d]) => String(chanceOf(lv, d)).padStart(9)).join('')}`);

console.log('\n== Grades by roll at a 50% chance');
const tally: Record<Grade, number> = { fumble: 0, fail: 0, near: 0, success: 0, fine: 0 };
for (let r = 1; r <= 100; r++) tally[gradeOf(r, 50)]++;
console.log(GRADES.map((g) => `${g} ${tally[g]}%`).join(', '));
ok(tally.fine === 10 && tally.success === 40 && tally.near === 10 && tally.fumble === 5, 'a 50% chance: 10 fine, 40 success, 10 near, 35 fail, 5 fumble');

// Rolled odds match the stated chance.
{
  const { a } = person({ levels: { climbing: 40 } });
  let wins = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) if (check(a, 'climbing', { difficulty: DC.hard, now: 0, learn: 0, noBody: true }).ok) wins++;
  const want = chanceOf(40, DC.hard);
  ok(Math.abs((wins / N) * 100 - want) < 3, `rolled successes ${((wins / N) * 100).toFixed(1)}% against a chance of ${want}%`);
}

// The same person rolls the same way twice (the dice are saved with them).
{
  const A = person({ name: 'Same' }), B = person({ name: 'Same' });
  const ra = Array.from({ length: 20 }, () => A.s.d100()).join(), rb = Array.from({ length: 20 }, () => B.s.d100()).join();
  ok(ra === rb, 'the same person rolls the same dice');
  const saved = Skills.fromJSON(JSON.parse(JSON.stringify(A.s.toJSON())));
  ok(saved.d100() === A.s.d100(), 'the dice carry on after saving and loading');
}

// A trained skill cannot be tried untaught.
{
  const { a } = person();
  const r = check(a, 'lockpicking', { difficulty: DC.easy, now: 0 });
  ok(r.chance === 0 && !r.ok && r.gained === 0, 'lockpicking untaught: no chance and nothing learnt');
}

// ---- Learning by use ------------------------------------------------------------------------------
console.log('\n== Learning by use: a hard-ish task (level + 5) every hour of the day, 8 a day');
for (const int of [6, 10, 16]) {
  const { a, s } = person({ int, levels: { swimming: 15 } });
  const marks: string[] = [];
  for (let day = 0; day < 60; day++) {
    for (let k = 0; k < 8; k++) check(a, 'swimming', { difficulty: Math.min(95, s.level('swimming') + 5), now: day * 86400 + (8 + k) * 3600, noBody: true });
    if ([0, 6, 13, 29, 59].includes(day)) marks.push(`day ${day + 1}: ${s.level('swimming').toFixed(1)}`);
  }
  console.log(`  Intelligence ${int} (cap ${s.cap('swimming')}): ${marks.join(', ')}`);
}

{
  const { a, s } = person({ levels: { swimming: 30 } });
  const easy = Array.from({ length: 10 }, (_, i) => check(a, 'swimming', { difficulty: DC.trivial, now: 86400 * 3 + i * 600, noBody: true }).gained).reduce((x, y) => x + y, 0);
  const b = person({ levels: { swimming: 30 } });
  const hard = Array.from({ length: 10 }, (_, i) => check(b.a, 'swimming', { difficulty: 40, now: 86400 * 3 + i * 600, noBody: true }).gained).reduce((x, y) => x + y, 0);
  console.log(`\n  Ten trivial uses at 30 taught ${easy.toFixed(2)}; ten fair ones (difficulty 40) ${hard.toFixed(2)}.`);
  ok(easy < hard * 0.1, 'easy tasks teach almost nothing');
  void s;
}

{
  const { s } = person({ levels: { athletics: 20 } });
  const first = s.practise('athletics', 0.5, 1000);
  for (let i = 0; i < 12; i++) s.practise('athletics', 0.5, 1000 + i);
  const late = s.practise('athletics', 0.5, 2000);
  const next = s.practise('athletics', 0.5, 86400 + 1000);
  console.log(`\n  The daily limit: first use ${first.toFixed(3)}, the 14th that day ${late.toFixed(3)}, the next day ${next.toFixed(3)}.`);
  ok(late < first * 0.25 && next > late * 3, 'repeating a thing in a day teaches less and less, and the next day it is fresh');
}

// ---- Rust -----------------------------------------------------------------------------------------
console.log('\n== Rust on a skill of 60 left unused (checked every 10 days)');
{
  const { cast, s, a } = person({ levels: { archery: 60 } });
  const line: string[] = [];
  for (let d = 10; d <= 200; d += 10) {
    cast.clock(d * 86400, { activity: 'rest' } as TimeCtx);
    if (d % 30 === 0 || d === 200) line.push(`day ${d}: ${s.rust('archery').toFixed(1)}`);
  }
  console.log(`  ${line.join(', ')}`);
  console.log(`  Notes: ${s.takeNotes().map((n) => n.text).join(' / ')}`);
  ok(s.rust('archery') <= 20.01 && s.rust('archery') > 15, 'rust reaches a third of the level at most');
  ok(s.level('archery') === 60, 'rust does not touch the learnt level');
  let uses = 0;
  while (s.rust('archery') > 0 && uses < 50) {
    check(a, 'archery', { difficulty: 50, now: 201 * 86400 + uses * 1800, noBody: true });
    uses++;
  }
  console.log(`  Practice shook it off in ${uses} uses. ${s.takeNotes().map((n) => n.text).join(' / ')}`);
  ok(uses <= 12, 'practice shakes rust off quickly');
}

// ---- Lessons and books ----------------------------------------------------------------------------
console.log('\n== Lessons and books');
{
  const { a, s } = person({ levels: { smithing: 5 } });
  const t = teacherLevel('town', 'x/p1', 'smithing');
  for (let day = 0; day < 20; day++) for (let h = 0; h < 6; h++) lesson(a, 'smithing', t, day * 86400 + (9 + h) * 3600);
  console.log(`  A town smith (level ${t}) teaching 6 hours a day for 20 days: 5 to ${s.level('smithing').toFixed(1)}.`);
  ok(s.level('smithing') <= Math.min(t - 10, 50) + 0.01, 'lessons go no further than the teacher can take you (their level less 10, and 50 at most)');
}
{
  const { a, s } = person({ levels: {} });
  const r = lesson(a, 'lockpicking', 50, 0);
  ok(r.gained > 0 && s.level('lockpicking') > 0, 'a teacher can start a trained skill');
  const b = person();
  for (let d = 0; d < 40; d++) readBook(b.a, { skill: 'herbalism', upTo: 25 }, d * 86400);
  console.log(`  Forty days with a herbal: herbalism ${b.s.level('herbalism').toFixed(1)}.`);
  ok(b.s.level('herbalism') <= 25.01 && b.s.level('herbalism') > 15, 'a book teaches up to its limit');
  b.s.d.languages = {};
  ok(readBook(b.a, { skill: 'herbalism', upTo: 25 }, 50 * 86400).why === 'You cannot read.', 'one who cannot read gets nothing from a book');
}

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
if (failures) process.exitCode = 1;
