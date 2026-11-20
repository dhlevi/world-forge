/**
 * Runs needs and fatigue over game days, prints how they go, and checks the main rules
 * (npx tsx apps/game/scripts/needs-test.ts; exits non-zero on a failure).
 */
import { Actor } from '../src/actors/actor';
import { Body, Identity, Mood, Pools, Skills, Traits, beardText, bodyTypeOf, hairText, type BodyType, type TimeCtx } from '../src/actors/components';
import { Inventory, startingInventory } from '../src/actors/items/inventory';
import { makeItem } from '../src/actors/items/item';
import { ITEM } from '../src/actors/items/defs';
import { groom, groomOptions } from '../src/game/grooming';
import { paintPortrait, portraitOf, type PortraitSpec } from '../src/game/portrait';
import { Needs } from '../src/actors/needs';
import { Health } from '../src/actors/health';
import { bodyMods } from '../src/actors/checks';
import { MessageDispatcher } from '../src/engine/messages';
import { Cast } from '../src/actors/cast';
import { clearBrush, eatPortion } from '../src/game/tasks';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};
/** How many pixels differ between two portraits. */
const differ = (a: PortraitSpec, b: PortraitSpec) => {
  const p = paintPortrait(a), q = paintPortrait(b);
  let n = 0;
  for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) n++;
  return n;
};

function person(): { a: Actor; cast: Cast; n: Needs } {
  const bus = new MessageDispatcher();
  const cast = new Cast(bus);
  const a = new Actor('person');
  const t = a.add(new Traits(Traits.average()));
  const b = a.add(new Body({ heightCm: 175, weightKg: 75, build: 'average', skin: '', skinHex: '', hair: '', hairHex: '', hairStyle: 'short', beard: 'none', wounds: [] }));
  a.add(new Pools(Pools.fromTraits(t, b)));
  a.add(new Mood([]));
  a.add(startingInventory([], 0, {}));
  const n = a.add(new Needs(Needs.fresh()));
  cast.setPlayer(a);
  cast.setClock(0);
  return { a, cast, n };
}

interface RunResult {
  collapse: { why: string; at: number } | null;
  /** The needs' data after each hour. */
  hours: Needs['d'][];
}

function run(label: string, hours: number, ctx: (h: number) => TimeCtx, every = 6): RunResult {
  const res: RunResult = { collapse: null, hours: [] };
  const { cast, n } = person();
  console.log(`\n== ${label}`);
  for (let h = 1; h <= hours; h++) {
    cast.clock(h * 3600, ctx(h));
    res.hours.push(JSON.parse(JSON.stringify(n.d)));
    const notes = n.takeNotes().filter((x) => x.word);
    if (notes.length) console.log(`  ${h}h: ${notes.map((x) => x.word).join(', ')}`);
    if (h % every === 0) {
      const d = n.d;
      console.log(`  ${h}h  reserve ${d.reserveKcal.toFixed(0)} kcal, nourish ${d.nourish.toFixed(0)}, hydration ${d.hydrationL.toFixed(2)} L, hydrated ${d.hydrated.toFixed(0)}, fatigue ${d.fatigue.toFixed(0)}, debt ${d.debt.toFixed(1)}, heat ${d.heat.toFixed(0)}, slow ${n.slow().toFixed(2)}`);
    }
    if (n.collapse) {
      console.log(`  COLLAPSE (${n.collapse}) at ${h} h`);
      res.collapse = { why: n.collapse, at: h };
      break;
    }
  }
  return res;
}

const resting = run('Resting, nothing to eat or drink, mild air', 120, () => ({ activity: 'rest', ambientC: 15 }), 12);
const walking = run('Walking all day at 12 C, no food or water', 40, () => ({ activity: 'walk', ambientC: 12 }), 4);
const laden = run('Travelling laden (heavy), 30 C', 24, () => ({ activity: 'travel', ambientC: 30, loadSlow: 1.4 }), 3);
run('Awake for two days, resting, fed by nothing', 50, () => ({ activity: 'rest', ambientC: 15 }), 10);
const cold = run('Standing about in -5 C, dressed as a traveller', 6, () => ({ activity: 'rest', ambientC: -5 }), 1);
const slept = run('Asleep in a bed 8 h after 16 h awake', 24, (h) => (h <= 16 ? { activity: 'rest', ambientC: 16 } : { activity: 'sleep', ambientC: 16, sleepQuality: 1 }), 4);

console.log('');
ok(!!resting.collapse && resting.collapse.at >= 20 && resting.collapse.at <= 60, 'resting without food, water or sleep, the body gives out after a day or more');
ok(!!walking.collapse && !!resting.collapse && walking.collapse.at < resting.collapse.at, 'walking wears one out sooner than resting');
ok(laden.collapse?.why === 'thirst' && laden.collapse.at <= 24, 'laden in the heat, thirst comes first and within a day');
ok(cold.hours[cold.hours.length - 1].heat < 0, 'standing in the frost, the body chills');
ok(slept.hours[23].fatigue < slept.hours[15].fatigue - 40, 'a night in a bed takes off most of the day\'s fatigue');

// ---- Rain, wind and clothing (survival.md, Wetness; Clothing) ----
{
  console.log('\n== Three hours walking in rain (2 mm/h), wind 8 m/s, 6 C');
  const rainy = (h: number): TimeCtx => (h <= 3 ? { activity: 'walk', ambientC: 6, weather: { rainMm: 2, snow: false, windMs: 8, sun: 0 } } : { activity: 'rest', ambientC: 6, fire: true, cover: 1 });
  const rain: Record<string, { wet: number; felt: number; dried?: number }> = {};
  for (const label of ['in a wool cloak', 'in an oiled cloak', 'with no cloak']) {
    const { a, cast, n } = person();
    const inv = a.get(Inventory)!;
    const cloak = inv.worn().find((i) => i.def === 'cloak');
    if (label !== 'in a wool cloak' && cloak) inv.drop(cloak.uid);
    if (label === 'in an oiled cloak') inv.put(makeItem('oilskin_cloak'), { at: 'worn' });
    const line: string[] = [];
    for (let h = 1; h <= 6; h++) {
      cast.clock(h * 3600, rainy(h));
      if (h === 3) rain[label] = { wet: n.d.wet ?? 0, felt: n.d.feltC ?? 0 };
      if (h === 6) rain[label].dried = n.d.wet ?? 0;
      if (h === 3 || h === 6) line.push(`${h === 3 ? 'after the rain' : 'three hours by a fire indoors'}: wet ${Math.round(n.d.wet ?? 0)}, felt ${n.d.feltC} C, heat ${Math.round(n.d.heat)}`);
    }
    console.log(`  ${label}: ${line.join('; ')}`);
  }
  ok(rain['with no cloak'].wet > rain['in a wool cloak'].wet && rain['in a wool cloak'].wet > rain['in an oiled cloak'].wet, 'a cloak keeps off rain, an oiled one most of it');
  ok(rain['with no cloak'].felt < rain['in a wool cloak'].felt, 'soaked and in the wind, the cold bites harder');
  ok(Object.values(rain).every((r) => (r.dried ?? 100) < 10), 'a fire indoors dries one out');
}

// ---- Eating and drinking, as the screen says them --------------------------------------------------
{
  const { cast, n, a } = person();
  // Hungry, with an empty stomach: a handful of raw mushrooms (15 kcal) can be eaten.
  n.d.stomachKcal = 0;
  n.d.reserveKcal = 10;
  ok(n.words().hunger === 'Hungry' && n.room().kcal > 1000, `hungry with an empty stomach ("${n.words().hunger}", room for ${Math.round(n.room().kcal)} kcal)`);
  const inv = a.get(Inventory)!;
  const mush = makeItem('mushrooms', { qty: 3 });
  inv.stow(mush);
  const o = eatPortion(a, inv, mush);
  ok(o.ok, `a small raw food can be eaten when hungry ("${o.text}")`);
  // Eaten to the full while the reserve is empty: full, not ravenous, and the screen agrees with the refusal.
  n.d.reserveKcal = 0;
  n.eat(5000);
  const bread = makeItem('bread');
  inv.stow(bread);
  const o2 = eatPortion(a, inv, bread);
  ok(n.words().hunger === 'Full' && !o2.ok, `eaten to the full: "${n.words().hunger}", and more is refused ("${o2.text}")`);
  // Dehydrated, then drinking: slaked while the stomach is full, the dehydration gone within a few hours.
  n.d.hydrated = 60;
  n.d.hydrationL = 0.4;
  n.d.stomachL = 0;
  ok(n.words().thirst === 'Dehydrated' && n.room().litres > 1, 'dehydrated, with room to drink');
  n.drink(5);
  ok(n.words().thirst === 'Slaked', `having drunk its fill: "${n.words().thirst}", not dehydrated while unable to drink more`);
  for (let h = 1; h <= 3; h++) cast.clock(h * 3600, { activity: 'rest', ambientC: 15 });
  ok(n.d.hydrated >= 75 && n.words().thirst !== 'Dehydrated', `three hours after drinking its fill, no longer dehydrated (hydration ${Math.round(n.d.hydrated)})`);
}

// ---- Cutting brush (game/tasks.ts) ------------------------------------------------------------------
{
  const { a } = person();
  a.add(new Skills(Skills.empty()));
  const inv = a.get(Inventory)!;
  for (const i of [...inv.d.items]) if (i.def === 'knife') inv.drop(i.uid);
  ok(clearBrush(a, inv, 'bush', 0) === null, 'with no blade, no cutting brush');
  inv.stow(makeItem('knife'));
  const knife = clearBrush(a, inv, 'bush', 0)!;
  inv.stow(makeItem('machete'));
  const times: number[] = [];
  let wood = 0;
  for (let k = 0; k < 40; k++) {
    const r = clearBrush(a, inv, 'bush', k * 60)!;
    times.push(r.seconds);
    if (r.wood) wood++;
  }
  const mean = times.reduce((s2, x) => s2 + x, 0) / times.length;
  console.log(`  a bush: with a knife ${knife.seconds} s; with a machete ${mean.toFixed(0)} s on average, firewood ${wood} times in 40`);
  ok(knife.tool === 'knife' && mean < knife.seconds * 0.6, 'a machete clears a bush far faster than a knife');
  ok(wood > 0, 'clearing well gives firewood');
}

// ---- Keeping clean (survival.md, Cleanliness and grooming): grime, blood, washing ------------------
{
  console.log('\n== Three days: on the road by day and sleeping rough, or resting indoors');
  const day = (road: boolean) => (h: number): TimeCtx => (h % 24 < 9 ? { activity: road ? 'travel' : 'rest', ambientC: 14, mud: 0 } : h % 24 < 16 ? { activity: 'rest', ambientC: 14 } : { activity: 'sleep', ambientC: 12, sleepQuality: road ? 0.6 : 1 });
  const three = (ctx: (h: number) => TimeCtx) => {
    const p = person();
    for (let h = 1; h <= 72; h++) {
      p.n.d.reserveKcal = 1500;
      p.n.d.hydrationL = 2;
      p.cast.clock(h * 3600, ctx(h));
    }
    return p;
  };
  const road = three(day(true)), home = three(day(false)), mud = three((h) => ({ ...day(true)(h), mud: 1 }));
  console.log(`  on the road: grime ${road.n.d.grime?.toFixed(0)} ("${road.n.words().clean}"); at home ${home.n.d.grime?.toFixed(0)}; on muddy roads ${mud.n.d.grime?.toFixed(0)} ("${mud.n.words().clean}")`);
  ok((road.n.d.grime ?? 0) >= 40 && ['Grubby', 'Dirty'].includes(road.n.words().clean), 'three days on the road leave one in want of a wash');
  ok((home.n.d.grime ?? 0) < 15 && home.n.words().clean === '', 'three days at home, hardly at all');
  ok((mud.n.d.grime ?? 0) > (road.n.d.grime ?? 0) * 1.5, 'mud makes it far worse');
  ok(road.n.takeNotes().some((x) => x.need === 'clean' && x.worse), 'and it is told as it comes');
  ok(bodyMods(mud.a, 'persuasion').some((m) => m.why === mud.n.words().clean.toLowerCase() && m.value < 0) && !bodyMods(mud.a, 'athletics').some((m) => m.why === mud.n.words().clean.toLowerCase()), 'the dirty are less persuasive (and no worse at running)');
  ok(mud.n.festering() > 1 && home.n.festering() === 1, 'and their wounds fester more readily');
  // A swim, rain, and a wash.
  road.cast.clock(72 * 3600 + 900, { activity: 'swim', ambientC: 14 });
  ok((road.n.d.grime ?? 0) <= 11, `a quarter of an hour's swim washes most of it off (grime ${road.n.d.grime?.toFixed(0)})`);
  mud.n.stain(60);
  ok(mud.n.words().clean === 'Bloodied' || mud.n.words().clean === 'Filthy', `blood shows ("${mud.n.words().clean}")`);
  mud.cast.clock(74 * 3600, { activity: 'rest', ambientC: 14, weather: { rainMm: 4, snow: false, windMs: 2, sun: 0 } });
  ok((mud.n.d.bloodied ?? 0) < 20 && (mud.n.d.grime ?? 0) >= 30, `two hours of rain rinse off the blood, and the worst of the dirt (blood ${mud.n.d.bloodied?.toFixed(0)}, grime ${mud.n.d.grime?.toFixed(0)})`);
  mud.n.takeNotes();
  ok(mud.n.wash(0) && mud.n.d.grime === 0 && mud.n.words().clean === '' && mud.n.takeNotes().some((x) => x.text === 'You are clean again.'), 'a bath takes off the rest');
  ok(!mud.n.wash(0), 'and there is nothing to wash off twice');
  // Blood from a wound gets on the skin and clothes.
  const hurt = person();
  const hh = hurt.a.add(new Health(Health.fresh(75)));
  hh.hurt({ kind: 'cut', sev: 8, part: 'arm.l', cause: 'a blade', now: 0 });
  hurt.cast.clock(3600, { activity: 'rest', ambientC: 14 });
  ok((hurt.n.d.bloodied ?? 0) > 8, `a bleeding wound bloodies one (${hurt.n.d.bloodied?.toFixed(0)} after an hour)`);
}

// ---- Body types (actors/components/body.ts) ---------------------------------------------------------
{
  console.log('\n== Two days without food at 5 C, by body type');
  const of = (type: BodyType) => {
    const p = person();
    const b = p.a.need(Body);
    b.d.type = type;
    p.a.add(new Pools(Pools.fromTraits(p.a.need(Traits), b)));
    const pools = p.a.need(Pools).d, comfort = p.n.comfort();
    for (let h = 1; h <= 48; h++) {
      p.n.d.hydrationL = 2;
      p.cast.clock(h * 3600, { activity: 'rest', ambientC: 5 });
    }
    console.log(`  ${type}: burst ${pools.physBurst.max}, day ${pools.physDay.max}; comfortable from ${comfort.low.toFixed(1)} C; after two days nourishment ${p.n.d.nourish.toFixed(0)}`);
    return { pools, comfort, nourish: p.n.d.nourish };
  };
  const ecto = of('ectomorph'), meso = of('mesomorph'), endo = of('endomorph');
  ok(ecto.pools.physDay.max > meso.pools.physDay.max && meso.pools.physBurst.max > ecto.pools.physBurst.max, 'the lean last longer through a day; the muscular have more in a burst');
  ok(ecto.comfort.low > meso.comfort.low && meso.comfort.low > endo.comfort.low, 'the lean feel the cold first, the heavy last');
  ok(endo.nourish > meso.nourish && meso.nourish > ecto.nourish, 'and the heavy last longest without food');
  ok(bodyTypeOf({ heightCm: 175, weightKg: 58 }).id === 'ectomorph' && bodyTypeOf({ heightCm: 175, weightKg: 75 }).id === 'mesomorph' && bodyTypeOf({ heightCm: 175, weightKg: 92 }).id === 'endomorph', 'a body with no type given is taken by its height and weight');
}

// ---- Hair and beard: growth and grooming (actors/components/body.ts, game/grooming.ts) ----------------
{
  console.log('\n== Hair and beard over half a year, untended');
  const man = () => {
    const p = person();
    p.a.add(new Identity({ given: 'T', full: 'T', female: false, age: 30, year: 0, folk: '', culture: 0, cultureName: '', people: '', homeId: '', homeName: '', standing: 'peasant' }));
    p.a.add(new Health(Health.fresh(75)));
    return { ...p, b: p.a.need(Body), inv: p.a.need(Inventory) };
  };
  const days = (p: { cast: Cast; n: Needs }, from: number, to: number) => {
    for (let d = from + 1; d <= to; d++) {
      p.n.d.reserveKcal = 1500;
      p.n.d.hydrationL = 2;
      p.n.d.fatigue = 0;
      p.cast.clock(d * 86400, { activity: 'rest', ambientC: 15 });
    }
  };
  const p = man(), b = p.b, told: string[] = [];
  b.d.hairStyle = 'shaved';
  const seen: string[] = [];
  for (const d of [3, 14, 30, 60, 180]) {
    days(p, seen.length ? [3, 14, 30, 60][seen.length - 1] : 0, d);
    told.push(...b.takeNotes());
    seen.push(`day ${d}: ${hairText('', b.d.hairStyle).trim()} (${b.hairCm.toFixed(1)} cm), ${beardText(b.beardShown())} (${b.beardCm.toFixed(1)} cm)${b.kempt() ? `, ${b.kempt().toLowerCase()}` : ''}`);
  }
  for (const s of seen) console.log(`  ${s}`);
  console.log(`  told: ${told.join(' ')}`);
  ok(/unshaven/.test(seen[0]) && /a short beard/.test(seen[1]) && /a full beard/.test(seen[3]), 'a shaven chin shows stubble in days, a short beard in a fortnight, a full one in two months');
  ok(/a shaved head/.test(seen[1]) && /cut short/.test(seen[2]) && b.hairCm > 7, 'a shaved head grows back in a month');
  ok(/unkempt/.test(seen[1]) && /ragged/.test(seen[3]) && told.some((t) => /unkempt/.test(t)) && told.some((t) => /Stubble/.test(t)), 'untended, one is unkempt in a fortnight and ragged in a month and a half, and is told');
  ok(bodyMods(p.a, 'persuasion').some((m) => m.why === 'ragged' && m.value < 0), 'and the worse received for it');
  ok(portraitOf(p.a).unkempt === 2 && differ(portraitOf(p.a), { ...portraitOf(p.a), unkempt: 0 }) > 0, 'the portrait shows it');
  // Grooming: a cut only shortens; a knife is needed; a barber needs none.
  for (const i of [...p.inv.d.items]) if (i.def === 'knife') p.inv.drop(i.uid);
  const hairWays = groomOptions(p.a, 'hair').map((o) => o.style), beardWays = groomOptions(p.a, 'beard');
  ok(hairWays.includes('short') && hairWays.includes('shaved') && !hairWays.includes('long'), `hair of ${b.hairCm.toFixed(0)} cm can be cropped or shaved, not worn long (${hairWays.join(', ')})`);
  ok(beardWays.find((o) => o.style === 'none')?.why !== null && !groom(p.a, 'beard', 'none', { now: 180 * 86400, random: () => 0.9 }).ok, 'with no knife there is no shaving');
  ok(groom(p.a, 'beard', 'short', { now: 180 * 86400, barber: true, random: () => 0.9 }).ok && b.d.beard === 'short' && b.beardCm < 2 && b.kempt() === '', 'a barber trims it short, and one is in order again');
  p.inv.stow(makeItem('knife'));
  const dry = groom(p.a, 'beard', 'none', { now: 180 * 86400, random: () => 0.2 });
  const cuts = p.a.need(Health).d.wounds.length;
  ok(dry.ok && b.beardShown() === 'none' && b.beardCm === 0 && cuts === 1 && /nicks/.test(dry.text), `a dry shave with a knife may nick ("${dry.text}")`);
  days(p, 180, 184);
  p.inv.stow(makeItem('soap'));
  const soaped = groom(p.a, 'beard', 'none', { now: 184 * 86400, water: true, random: () => 0.2 });
  ok(soaped.ok && p.a.need(Health).d.wounds.length <= cuts && /soap/.test(soaped.text) && (p.inv.d.items.find((i) => i.def === 'soap')?.uses ?? 8) === 7, `soap and water spare the skin, and a little soap is used ("${soaped.text}")`);
  // A woman grows no beard; her hair grows.
  const w = person();
  w.a.add(new Identity({ given: 'T', full: 'T', female: true, age: 30, year: 0, folk: '', culture: 0, cultureName: '', people: '', homeId: '', homeName: '', standing: 'peasant' }));
  days(w, 0, 120);
  const wb = w.a.need(Body);
  ok(wb.beardCm === 0 && wb.beardShown() === 'none' && groomOptions(w.a, 'beard').length === 0 && wb.hairCm > 9, 'a woman grows no beard; her hair grows');
  ok(ITEM.get('soap')?.sold?.includes('market') === true && (ITEM.get('soap')?.value ?? 0) > 0, 'soap is sold at market');
}

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
if (failures) process.exitCode = 1;
