/**
 * Health (actors/health.ts; combat.md, stage 1): the body of parts, wounds and bleeding, pain,
 * capacities, healing and scars, infection, the conditions that kill (thirst, hunger, cold, heat,
 * drowning), lost parts, and treatment (game/treatment.ts). A save keeps it all.
 * npx tsx apps/game/scripts/health-test.ts (exits non-zero on a failure).
 */
import { Actor } from '../src/actors/actor';
import { Body, HUMANOID, Identity, Mood, PART, Pools, SEXED, Skills, Traits, type TimeCtx } from '../src/actors/components';
import { startingInventory } from '../src/actors/items/inventory';
import { makeItem } from '../src/actors/items/item';
import { Needs } from '../src/actors/needs';
import { Health, outerPart, woundWords } from '../src/actors/health';
import { bodyMods } from '../src/actors/checks';
import { MessageDispatcher } from '../src/engine/messages';
import { Cast } from '../src/actors/cast';
import { Inventory } from '../src/actors/items/inventory';
import { treat, takeRemedy, unsuited } from '../src/rules/treatment';
import { mulberry32 } from '@worldforge/core/gen/rng';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

function person(seed = 1, medicine = 30): { a: Actor; cast: Cast; h: Health; n: Needs; inv: Inventory } {
  const bus = new MessageDispatcher();
  const cast = new Cast(bus);
  const a = new Actor('person');
  const t = a.add(new Traits(Traits.average()));
  const b = a.add(new Body({ heightCm: 175, weightKg: 75, build: 'average', skin: '', skinHex: '', hair: '', hairHex: '', hairStyle: 'short', beard: 'none', wounds: [] }));
  a.add(new Pools(Pools.fromTraits(t, b)));
  a.add(new Mood([]));
  const inv = a.add(startingInventory([], 0, {}));
  const n = a.add(new Needs(Needs.fresh()));
  a.add(new Skills({ ...Skills.empty(), levels: { medicine }, dice: seed } as never));
  const h = a.add(new Health(Health.fresh(75)));
  cast.setPlayer(a);
  cast.setClock(0);
  return { a, cast, h, n, inv };
}

/** Passes hours, an hour at a time; stops at death. Returns the hours passed. */
function pass(cast: Cast, h: Health, from: number, hours: number, ctx: TimeCtx = { activity: 'rest' }, feed?: Needs): number {
  for (let i = 1; i <= hours; i++) {
    if (feed) {
      feed.d.reserveKcal = 1500;
      feed.d.hydrationL = 2;
    }
    cast.clock((from + i) * 3600, ctx);
    if (h.dead) return i;
  }
  return hours;
}

console.log('the body');
ok(HUMANOID.filter((p) => /^(thumb|f\d)\./.test(p.id)).length === 10, 'ten fingers');
ok(HUMANOID.filter((p) => /^t\d/.test(p.id)).length === 10, 'ten toes');
ok(['ribs', 'teeth', 'pelvis', 'brain', 'heart'].every((id) => PART.has(id)), 'ribs, teeth, the pelvis and the organs');
ok(HUMANOID.every((p) => !p.parent || PART.has(p.parent)), 'every part hangs from a part');
{
  const r = mulberry32(5), seen = new Map<string, number>();
  for (let i = 0; i < 5000; i++) {
    const p = outerPart(r);
    seen.set(p.id, (seen.get(p.id) ?? 0) + 1);
  }
  ok(!HUMANOID.some((p) => p.inside && seen.has(p.id)), 'a blow from outside never lands on an organ directly');
  ok((seen.get('torso') ?? 0) > (seen.get('f3.l') ?? 0) * 20, 'the torso is struck far more often than a finger');
}

console.log('\nwhole');
{
  const { h, a } = person();
  const c = h.capacities();
  ok(Object.values(c).every((v) => v > 0.99), `whole: every capacity full (${Object.entries(c).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')})`);
  ok(h.pain() === 0 && h.bleeding() === 0 && h.slow() === 1, 'no pain, no bleeding, not slowed');
  ok(bodyMods(a, 'medicine').every((m) => m.why !== 'pain'), 'no pain in the checks');
}

console.log('\nwounds, bleeding and clotting');
{
  const { h, cast } = person();
  const [w] = h.hurt({ kind: 'cut', sev: 2, part: 'leg.l', cause: 'thorns', now: 0 });
  ok(!!w && woundWords(w) === 'scratch', `a small cut on the leg is "${woundWords(w)}"`);
  const b0 = h.bleeding();
  pass(cast, h, 0, 2);
  ok(b0 > 0 && h.bleeding() === 0, `a scratch bleeds (${b0.toFixed(0)} ml/h) and clots within two hours`);
  ok(h.bloodShare() > 0.98, 'it costs little blood');
}
{
  const { h, cast } = person();
  h.hurt({ kind: 'cut', sev: 12, part: 'neck', cause: 'a blade', now: 0 });
  const b = h.bleeding();
  const hours = pass(cast, h, 0, 24);
  ok(h.dead && hours <= 6, `a deep gash in the neck (${b.toFixed(0)} ml/h) does not clot: dead in ${hours} h of ${h.d.dead?.cause}`);
}
{
  const { h, cast, inv, a } = person(3, 40);
  for (let i = 0; i < 3; i++) inv.d.items.push(makeItem('bandages', { qty: 5 }));
  const [w] = h.hurt({ kind: 'cut', sev: 10, part: 'arm.r', cause: 'a blade', now: 0 });
  const before = h.bleedOf(w);
  let r = treat(a, a, w, 'bandage', 0);
  for (let i = 0; i < 6 && !r.ok; i++) r = treat(a, a, w, 'bandage', 0);
  ok(r.ok && h.bleedOf(w) < before * 0.65, `a bandage slows a deep cut's bleeding (${before.toFixed(0)} to ${h.bleedOf(w).toFixed(0)} ml/h): "${r.text}"`);
  pass(cast, h, 0, 12);
  ok(!h.dead && h.bleeding() < 5, `bandaged, it clots in time (blood ${(h.bloodShare() * 100).toFixed(0)}%)`);
}

console.log('\npain and capacities');
{
  const { h, a } = person();
  h.hurt({ kind: 'fracture', sev: 12, part: 'leg.r', cause: 'a fall', now: 0 });
  const c = h.capacities();
  ok(c.moving < 0.55 && c.manipulation > 0.9, `a broken leg slows walking (moving ${c.moving.toFixed(2)}), not the hands`);
  ok(h.pain() > 0.3, `a broken leg hurts (pain ${h.pain().toFixed(2)}: ${h.painWord()})`);
  ok(h.slow() > 1.2, `steps are slower (×${h.slow().toFixed(2)})`);
  ok(bodyMods(a, 'athletics').some((m) => m.why === 'your legs'), 'and Athletics checks suffer');
}
{
  const { h } = person();
  h.hurt({ kind: 'cut', sev: 20, part: 'eye.l', cause: 'a blade', now: 0 });
  ok(h.d.lost.includes('eye.l'), 'an eye can be destroyed');
  const s = h.capacities().sight;
  ok(s > 0.6 && s < 0.85, `one eye still sees, less well (sight ${s.toFixed(2)})`);
}
{
  const { h } = person();
  h.hurt({ kind: 'cut', sev: 12, part: 'thumb.r', cause: 'an axe', now: 0 });
  const m1 = h.capacities().manipulation;
  ok(h.isLost('thumb.r') && m1 < 0.99 && m1 > 0.85, `a lost thumb lowers manipulation a little (${m1.toFixed(2)})`);
  h.hurt({ kind: 'cut', sev: 25, part: 'hand.r', cause: 'an axe', now: 0 });
  ok(h.isLost('hand.r') && h.isLost('f3.r'), 'a lost hand takes its fingers with it');
  ok(h.capacities().manipulation < 0.7, `one hand left (manipulation ${h.capacities().manipulation.toFixed(2)})`);
  ok(h.hurt({ kind: 'cut', sev: 3, part: 'f2.r', cause: 'x', now: 0 })[0]?.part !== 'f2.r', 'a lost finger cannot be hurt again; the blow falls above it');
}
{
  const { h } = person();
  h.hurt({ kind: 'stab', sev: 20, part: 'heart', cause: 'a spear', now: 0 });
  ok(h.dead && /heart/.test(h.d.dead?.cause ?? ''), `a ruined heart kills (${h.d.dead?.cause})`);
}
{
  // Deep blows reach inside.
  let inner = 0;
  for (let s = 1; s <= 40; s++) {
    const { h } = person(s);
    h.hurt({ kind: 'stab', sev: 8, part: 'torso', cause: 'a spear', deep: 0.8, now: 0 });
    if (h.d.wounds.some((w) => PART.get(w.part)?.inside)) inner++;
  }
  ok(inner > 20 && inner < 40, `a deep stab to the torso often reaches an organ (${inner} of 40)`);
}

console.log('\nhealing, scars and crooked bones');
{
  const { h, cast, n, a } = person();
  h.hurt({ kind: 'cut', sev: 6, part: 'arm.l', cause: 'a slip of the knife', now: 0 });
  h.hurt({ kind: 'bruise', sev: 3, part: 'leg.l', cause: 'a fall', now: 0 });
  const w = h.d.wounds[0];
  w.cleaned = 1;
  let healed = 0;
  for (let i = 1; i <= 24 * 30 && h.d.wounds.length; i++) {
    n.d.reserveKcal = 1500;
    n.d.hydrationL = 2;
    cast.clock(i * 3600, { activity: i % 24 < 8 ? 'sleep' : 'walk' });
    healed = i;
  }
  ok(!h.d.wounds.length && healed < 24 * 8, `a cut and a bruise heal, fed and rested (in ${(healed / 24).toFixed(1)} days)`);
  ok(a.need(Body).scars.some((s) => /scar on the left arm/.test(s)), `the cut leaves a scar: "${a.need(Body).scars.join('; ')}"`);
}
{
  const { h, cast, n } = person();
  h.hurt({ kind: 'fracture', sev: 12, part: 'arm.r', cause: 'a fall', now: 0 });
  for (let i = 1; i <= 24 * 60 && h.d.wounds.length; i++) {
    n.d.reserveKcal = 1500;
    n.d.hydrationL = 2;
    cast.clock(i * 3600, { activity: 'rest' });
  }
  ok(!h.d.wounds.length && h.d.lasting.some((l) => l.part === 'arm.r'), `an unsplinted broken arm knits crooked: "${h.d.lasting.map((l) => l.text).join('; ')}"`);
  ok(h.eff('arm.r') < 0.8, 'and is weaker for good');
}

console.log('\ninfection');
{
  let infected = 0, cleanInfected = 0, died = 0;
  for (let s = 1; s <= 40; s++) {
    for (const clean of [false, true]) {
      const { h, cast, n } = person(s);
      const [w] = h.hurt({ kind: 'bite', sev: 8, part: 'leg.l', cause: 'a dog', now: 0 });
      w.bandaged = 1;
      if (clean) w.cleaned = 1;
      pass(cast, h, 0, 24 * 6, { activity: 'rest' }, n);
      const got = h.takeNotes().some((x) => /fester/.test(x.text));
      if (clean && got) cleanInfected++;
      if (!clean && got) infected++;
      if (h.dead) died++;
    }
  }
  console.log(`  of 40 bites: ${infected} festering uncleaned, ${cleanInfected} cleaned; ${died} deaths`);
  ok(infected > cleanInfected, 'cleaning makes festering less likely');
}
{
  // An infection: rest and food beat it; starved and working, it kills.
  const { h, cast, n } = person();
  const [w] = h.hurt({ kind: 'cut', sev: 5, part: 'leg.l', cause: 'x', now: 0 });
  w.infection = 0.05;
  w.immunity = 0;
  pass(cast, h, 0, 60, { activity: 'sleep' }, n);
  ok(!h.dead && w.infection === undefined, 'rested and fed, the body beats an infection');
  const p2 = person();
  const [w2] = p2.h.hurt({ kind: 'cut', sev: 5, part: 'leg.l', cause: 'x', now: 0 });
  w2.infection = 0.05;
  w2.immunity = 0;
  p2.n.d.nourish = 10;
  p2.n.d.hydrated = 30;
  pass(p2.cast, p2.h, 0, 60, { activity: 'work' });
  ok(p2.h.dead && /infect/.test(p2.h.d.dead?.cause ?? ''), `starved and working, it kills (${p2.h.d.dead?.cause})`);
}

console.log('\nconditions');
{
  const { h, cast, n } = person();
  let t = 0;
  for (; t < 24 * 10 && !h.dead; t++) cast.clock((t + 1) * 3600, { activity: 'rest' });
  console.log(`  no water at all: dead after ${(t / 24).toFixed(1)} days (${h.d.dead?.cause}); hydrated ${n.d.hydrated.toFixed(0)}`);
  ok(h.dead && h.d.dead?.cause === 'thirst' && t > 48 && t < 24 * 6, 'thirst kills in a few days');
}
{
  const { h, cast, n } = person();
  let t = 0;
  for (; t < 24 * 40 && !h.dead; t++) {
    n.d.hydrationL = 2;
    n.d.stomachKcal = 0;
    n.d.reserveKcal = 0;
    cast.clock((t + 1) * 3600, { activity: 'rest' });
  }
  console.log(`  water but no food: dead after ${(t / 24).toFixed(1)} days (${h.d.dead?.cause})`);
  ok(h.dead && h.d.dead?.cause === 'hunger' && t > 24 * 10, 'hunger kills, slowly');
}
{
  const { h, cast, n } = person();
  let t = 0;
  for (; t < 48 && !h.dead; t++) cast.clock((t + 1) * 3600, { activity: 'rest', ambientC: -25, weather: { rainMm: 0, snow: false, windMs: 6, sun: 0 } });
  console.log(`  -25 °C in the wind, dressed as they are: dead after ${t} h (${h.d.dead?.cause}); heat ${n.d.heat.toFixed(0)}; frostbite ${h.d.wounds.filter((w) => w.kind === 'frostbite').length}`);
  ok(h.dead && h.d.dead?.cause === 'the cold', 'bitter cold kills');
  ok(h.d.wounds.some((w) => w.kind === 'frostbite'), 'and bites the fingers, toes, ears or nose first');
}
{
  const { h } = person();
  for (let i = 0; i < 3; i++) h.choke(0.25);
  ok(!h.dead && h.capacities().consciousness < 0.5, `going under thrice: half drowned (consciousness ${h.capacities().consciousness.toFixed(2)})`);
}

console.log('\nfalls');
{
  let broke = 0, dead = 0, mid = 0;
  for (let s = 1; s <= 40; s++) {
    const q = person(s + 200);
    q.h.fall(5, 'a fall', 0);
    pass(q.cast, q.h, 0, 24);
    if (q.h.dead) mid++;
    const { h } = person(s);
    h.fall(2, 'a fall', 0);
    if (h.d.wounds.some((w) => w.kind === 'fracture')) broke++;
    const p = person(s + 100);
    p.h.fall(15, 'a fall', 0);
    pass(p.cast, p.h, 0, 24);
    if (p.h.dead || p.h.capacities().consciousness < 0.25) dead++;
  }
  console.log(`  2 m falls breaking a bone: ${broke} of 40; 15 m falls killing within a day, untreated, or leaving senseless: ${dead} of 40`);
  console.log(`  5 m falls killing within a day, untreated: ${mid} of 40`);
  ok(broke < 20, 'a short fall seldom breaks a bone');
  ok(mid < 20, 'most survive a 5 m fall');
  ok(dead > 10, 'a long fall is often deadly');
}

console.log('\ntreatment');
{
  const { h, a, inv } = person(7, 50);
  inv.d.items.push(makeItem('splint'), makeItem('herbs', { qty: 3 }), makeItem('sewing_kit'), makeItem('potion'));
  const [f] = h.hurt({ kind: 'fracture', sev: 10, part: 'leg.l', cause: 'a fall', now: 0 });
  ok(unsuited(f, 'stitch') !== null && unsuited(f, 'splint') === null, 'a broken bone is splinted, not stitched');
  const m0 = h.capacities().moving;
  let r = treat(a, a, f, 'splint', 0);
  for (let i = 0; i < 5 && !r.ok && inv.d.items.some((x) => x.def === 'splint'); i++) r = treat(a, a, f, 'splint', 0);
  console.log(`  ${r.text}`);
  if (r.ok) ok(h.capacities().moving > m0 && h.pain() > 0, `a splint lets the leg bear a little (moving ${m0.toFixed(2)} to ${h.capacities().moving.toFixed(2)})`);
  const [c] = h.hurt({ kind: 'cut', sev: 6, part: 'arm.l', cause: 'x', now: 0 });
  r = treat(a, a, c, 'stitch', 0);
  console.log(`  ${r.text}`);
  ok(r.seconds > 0, 'stitching takes time');
  const [sc] = h.hurt({ kind: 'cut', sev: 2, part: 'arm.r', cause: 'x', now: 0 });
  ok(unsuited(sc, 'stitch') !== null, 'a scratch needs no stitches');
  const p0 = h.pain();
  ok(takeRemedy(a, 0).ok && h.pain() < p0, `a remedy eases the pain (${p0.toFixed(2)} to ${h.pain().toFixed(2)})`);
  ok(!inv.d.items.some((x) => x.def === 'potion'), 'and is used up');
  ok(treat(a, a, c, 'splint', 0).text === 'There is no broken bone.', 'a treatment that does not suit is refused');
}

console.log('\na man\'s and a woman\'s body');
{
  const sexed = (female: boolean, seed = 1) => {
    const p = person(seed);
    p.a.add(new Identity({ given: 'T', full: 'T', female, age: 30, year: 0, folk: '', culture: 0, cultureName: '', people: '', homeId: '', homeName: '', standing: 'peasant' }));
    return p;
  };
  const m = sexed(false), f = sexed(true), none = person();
  const ids = (h: Health) => new Set(h.plan.map((p) => p.id));
  ok(ids(m.h).has('testicles') && ids(m.h).has('penis') && !ids(m.h).has('womb'), 'a man\'s body has a man\'s parts, and not a woman\'s');
  ok(ids(f.h).has('womb') && ids(f.h).has('breast.l') && ids(f.h).has('ovaries') && !ids(f.h).has('penis'), 'a woman\'s body has a woman\'s parts, and not a man\'s');
  ok(none.h.plan.length === HUMANOID.length && SEXED.every((p) => !none.h.partOf(p.id)), 'a body of no known sex has neither');
  ok([m, f].every((p) => p.h.plan.every((x) => !x.parent || !!p.h.partOf(x.parent))), 'every part of each hangs from a part');
  ok(Object.values(m.h.capacities()).every((v) => v > 0.99) && Object.values(f.h.capacities()).every((v) => v > 0.99), 'whole, each has every capacity full');
  const [w] = m.h.hurt({ kind: 'bruise', sev: 4, part: 'testicles', cause: 'a kick', now: 0 });
  none.h.hurt({ kind: 'bruise', sev: 4, part: 'arm.l', cause: 'a kick', now: 0 });
  ok(!!w && m.h.pain() > none.h.pain() * 1.5, `a blow there hurts more than the same to an arm (pain ${m.h.pain().toFixed(2)} against ${none.h.pain().toFixed(2)})`);
  ok(f.h.hurt({ kind: 'bruise', sev: 4, part: 'testicles', cause: 'a kick', now: 0 }).length === 0, 'a part the body has not cannot be hurt');
  let reached = 0;
  for (let s = 1; s <= 20; s++) if (sexed(true, s).h.hurt({ kind: 'stab', sev: 8, part: 'pelvis', cause: 'a blade', deep: 1, now: 0 }).some((x) => x.part === 'womb' || x.part === 'ovaries')) reached++;
  ok(reached === 20 && m.h.hurt({ kind: 'stab', sev: 8, part: 'pelvis', cause: 'a blade', deep: 1, now: 0 }).length === 1, 'a deep wound to a woman\'s pelvis goes on within; a man\'s has nothing within');
  const back = Actor.fromJSON(JSON.parse(JSON.stringify(m.a.toJSON()))).need(Health);
  ok(back.d.wounds.some((x) => x.part === 'testicles') && !!back.partOf('testicles'), 'and they are saved with the rest');
}

console.log('\nsaving');
{
  const { h, a } = person();
  h.hurt({ kind: 'cut', sev: 6, part: 'arm.l', cause: 'x', now: 0 });
  h.hurt({ kind: 'cut', sev: 15, part: 'f5.r', cause: 'x', now: 0 });
  const b = Actor.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
  const h2 = b.need(Health);
  ok(h2.d.wounds.length === h.d.wounds.length && h2.d.lost.includes('f5.r') && Math.abs(h2.d.blood - h.d.blood) < 1e-9, 'wounds, lost parts and blood are saved');
}

console.log(failures ? `\n${failures} failed` : '\nall health tests passed');
if (failures) process.exit(1);
