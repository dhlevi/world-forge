/**
 * Makes a world and a few quick-start characters, prints them, and checks them: each is whole,
 * saves and loads the same, and the same seed makes the same character; and the messaging service
 * delivers in order (npx tsx apps/game/scripts/creation-test.ts; exits non-zero on a failure).
 */
import { generateWorld } from '@worldforge/core/gen/world';
import { CULTURES } from '@worldforge/core/names/cultures';
import { personName } from '@worldforge/core/lore/names';
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import { baronyAt } from '@worldforge/core/export/gamedata';
import { catalogue, cultureOf, regionAt } from '../src/worker/catalogue';
import { quickStart } from '../src/actors/creation/random';
import { resolve, buildActor, trackOptions } from '../src/actors/creation/resolve';
import { Actor } from '../src/actors/actor';
import { Identity, Skills, Traits, moneyText } from '../src/actors/components';
import { Inventory } from '../src/actors/items/inventory';
import { itemName } from '../src/actors/items/item';
import '../src/actors/cast';
import type { StartSite } from '../src/worker/protocol';
import { MessageDispatcher } from '../src/engine/messages';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  if (!cond) console.log(`FAIL ${what}`);
  else if (process.env.VERBOSE) console.log(`ok   ${what}`);
  if (!cond) failures++;
};
let checks = 0;
/** Equal once item ids (unique by design) are numbered in the order they appear. */
const sameBut = (x: unknown, y: unknown) => {
  const norm = (v: unknown) => {
    const ids = new Map<string, number>();
    return JSON.stringify(v).replace(/"(uid|parent)":"([^"]+)"/g, (_m, k: string, id: string) => {
      if (!ids.has(id)) ids.set(id, ids.size);
      return `"${k}":"#${ids.get(id)}"`;
    });
  };
  return norm(x) === norm(y);
};
const check = (cond: boolean, what: string) => {
  checks++;
  ok(cond, what);
};

const w = generateWorld({ seed: process.argv[2] ?? 'forge', landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 512 } as never, () => {});
const realmAt = (lon: number, lat: number) => {
  let u = w.politics.units[baronyAt(w, lon, lat)];
  for (let g = 0; u && u.parent >= 0 && g < 12; g++) u = w.politics.units[u.parent];
  return u;
};
const starts: StartSite[] = w.settlements.filter((s) => s.tier !== 'village').sort((a, b) => b.population - a.population).map((s) => {
  const r = realmAt(s.lon, s.lat);
  return { id: s.id, name: s.name ?? s.id, tier: s.tier, population: s.population, lon: s.lon, lat: s.lat, realm: r?.name, realmId: r?.id, culture: CULTURES[cultureOf(w, s) ?? 0]?.name, cultureIndex: cultureOf(w, s), coastal: !!s.coastal, university: !!s.university, region: regionAt(w, s.lon, s.lat) };
});
const t0 = performance.now();
const cat = catalogue(w);
console.log(`Catalogue: ${cat.cultures.length} cultures, ${cat.realms.length} realms, year ${cat.year}, ${(performance.now() - t0).toFixed(0)} ms`);
for (const n of [0, 5, 17, 40, 90]) {
  const home = starts[Math.min(n, starts.length - 1)];
  const ci = home.cultureIndex ?? cat.cultures[0].index;
  const r = mulberry32(hashString(`seed${n}#names#${ci}`));
  const names = { male: [] as ReturnType<typeof personName>[], female: [] as ReturnType<typeof personName>[] };
  for (let i = 0; i < 24; i++) { names.male.push(personName(ci, false, r)); names.female.push(personName(ci, true, r)); }
  const world = { catalogue: cat, starts, names };
  const ch = quickStart(`seed${n}`, ci, home.id, world);
  const res = resolve(ch, world);
  const a = buildActor(res);
  const back = Actor.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
  const id = back.need(Identity).d, T = back.need(Traits).d, S = back.need(Skills);
  console.log(`\n== ${id.full}, ${id.female ? 'woman' : 'man'} of ${id.people} (${id.folk}), ${id.age}, ${res.family.standing.name}, home ${id.homeName} (${res.home.tier}), faith ${id.faith}`);
  console.log('Cards:', res.cards.map((c) => `${c.draw.position}:${c.card.name}${c.draw.reversed ? ' (rev)' : ''}`).join(', '));
  console.log('Traits:', Object.entries(T.traits).map(([k, v]) => `${k.slice(0, 3)} ${v}`).join(' '), '| luck rest', T.luckRest);
  console.log('Skills:', S.known().slice(0, 8).map((s) => `${s.name} ${s.level.toFixed(0)}`).join(', '));
  console.log('Languages:', Object.values(S.d.languages).map((l) => `${l.name} ${l.speak}/${l.read}`).join(', '), '| knowledge', Object.values(S.d.knowledge).map((k) => `${k.kind}:${k.of} ${k.level.toFixed(0)}`).join(', '));
  const inv = back.need(Inventory);
  console.log('Money:', moneyText(res.copper), '| load', JSON.stringify(inv.loadInfo()));
  for (const it of inv.d.items) console.log('   ', itemName(it), '-', inv.where(it.loc), it.quality, it.make ?? '');
  if (res.leftBehind.length) console.log('   left behind:', res.leftBehind.map((i) => itemName(i)).join(', '));
  console.log('Look:', res.look.heightCm, 'cm', res.look.weightKg, 'kg', res.look.build, res.look.skin[1], 'skin,', res.look.hair[1], res.look.hairStyle, 'hair, beard', res.look.beard);
  console.log('Knows: home', res.knowledge.homeRadiusM, 'm; roads', res.knowledge.roads.length, '; places', res.knowledge.places.length);
  for (const b of res.biography) console.log(`  ${b.age}: ${b.text}`);
  console.log('Open next:', trackOptions(res).filter((o) => !o.reason).map((o) => o.track.name).join(', '));
  check(JSON.stringify(back.toJSON()) === JSON.stringify(a.toJSON()), `${id.full}: saves and loads the same`);
  check(id.full.trim().length > 0 && id.age >= 14, `${id.full}: has a name and an adult's age`);
  check(S.known().length > 0 && Object.keys(S.d.languages).length > 0, `${id.full}: has skills and a language`);
  check(inv.d.items.some((i) => i.loc?.at === 'worn') && inv.loadInfo().load !== 'overloaded', `${id.full}: is dressed, and can carry what they have`);
  // The same choices make the same person.
  const again = buildActor(resolve(quickStart(`seed${n}`, ci, home.id, world), world));
  check(sameBut(again.toJSON().components, a.toJSON().components), `${id.full}: the same seed makes the same character (item ids aside)`);
}
// Messaging: delayed delivery in order, direct and broadcast.
const bus = new MessageDispatcher();
const got: string[] = [];
const note = (id: string) => ({ id, text: '', value: 0 });
bus.on('actor.moodlet', (p) => got.push(`changed ${p.id}`));
bus.send('actor.moodlet', note('3'), { delay: 60 });
bus.send('actor.moodlet', note('1'));
bus.send('actor.moodlet', note('2'), { delay: 30 });
bus.update(29); bus.update(31); bus.update(100);
console.log('\nMessages:', got.join(', '), '| pending', bus.pending);
check(got.join(', ') === 'changed 1, changed 2, changed 3' && bus.pending === 0, 'messages are delivered at their time, in order');

console.log(failures ? `\n${failures} of ${checks} checks FAILED` : `\nAll ${checks} checks passed`);
if (failures) process.exitCode = 1;
