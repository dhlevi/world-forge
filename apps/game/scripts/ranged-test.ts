/**
 * Shooting and throwing (docs/design/combat.md, stage 3; game/ranged.ts): what can be loosed, the
 * line of fire (walls stop it, trees may take it, a beast in the way may be struck, a miss lands
 * beyond), the chance (range, size, an unaware beast, a long bow's pull), the wound and the missile
 * left in it, hunting a deer over many seeds, and making arrows.
 * npx tsx apps/game/scripts/ranged-test.ts (exits non-zero on a failure).
 */
import { O } from '@worldforge/core/local/tiles';
import { SPECIES_BY_ID } from '@worldforge/core/local/fauna';
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
import type { Target } from '../src/game/combat';
import { fire, fletch, inTheWay, lineOfFire, missilesOf, readyLauncher, shotChance, thrownOf, type FireWorld } from '../src/game/ranged';
import { fightOf, planOf } from '../src/world/beasts';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

function person(seed: number, levels: Record<string, number>, gear: string[] = [], strength = 10) {
  const bus = new MessageDispatcher();
  const cast = new Cast(bus);
  const a = new Actor('person');
  const tr = Traits.average();
  tr.traits.strength = strength;
  const t = a.add(new Traits(tr));
  const b = a.add(new Body({ heightCm: 175, weightKg: 75, build: 'average', skin: '', skinHex: '', hair: '', hairHex: '', hairStyle: 'short', beard: 'none', wounds: [] }));
  a.add(new Pools(Pools.fromTraits(t, b)));
  a.add(new Mood([]));
  const inv = a.add(startingInventory([], 0, {}));
  for (const g of gear) {
    const [id, n] = g.split('*');
    inv.d.items.push(makeItem(id, { qty: Number(n ?? 1) }));
  }
  a.add(new Needs(Needs.fresh()));
  a.add(new Skills({ ...Skills.empty(), levels, dice: seed } as never));
  a.add(new Health(Health.fresh(75)));
  cast.setPlayer(a);
  cast.setClock(0);
  return { a, inv };
}

const beast = (species: string, seed: number, o: Partial<Target> = {}): Target => {
  const s = SPECIES_BY_ID.get(species)!;
  const h = new Health(Health.beast(planOf(s.plan), fightOf(s).kg));
  h.rng = mulberry32(seed);
  return { name: `the ${s.name}`, health: h, fight: fightOf(s), size: s.size, asleep: false, unaware: false, ...o };
};

/** An open field with things placed on it: walls and trees by tile, beasts by tile. */
function field(o: { walls?: [number, number][]; trees?: [number, number][]; beasts?: Map<string, Target>; people?: [number, number][] } = {}): FireWorld {
  const key = (x: number, y: number) => `${x},${y}`;
  const walls = new Set((o.walls ?? []).map(([x, y]) => key(x, y))), trees = new Set((o.trees ?? []).map(([x, y]) => key(x, y))), people = new Set((o.people ?? []).map(([x, y]) => key(x, y)));
  return {
    objectAt: (x, y) => (walls.has(key(x, y)) ? O('wall_stone')! : trees.has(key(x, y)) ? O('tree_broadleaf')! : 0),
    passable: (x, y) => !walls.has(key(x, y)) && !trees.has(key(x, y)),
    beastAt: (x, y) => {
      const t = o.beasts?.get(key(x, y));
      return t ? { id: key(x, y), t } : null;
    },
    personAt: (x, y) => (people.has(key(x, y)) ? 'Ana' : null),
  };
}

console.log('what can be loosed');
ok(ITEMS.filter((d) => d.ranged).every((d) => ITEMS.some((x) => x.id === d.ranged!.ammo)), `every bow, crossbow and sling has its missile (${ITEMS.filter((d) => d.ranged).map((d) => d.id).join(', ')})`);
{
  const p = person(1, {}, ['hunting_bow', 'arrows*20', 'knife', 'stone*5', 'potion', 'sling']);
  const ms = missilesOf(p.inv);
  ok(ms.some((m) => m.how === 'shoot' && m.launcher?.def === 'hunting_bow' && m.item.def === 'arrows'), 'a bow with arrows can shoot');
  ok(ms.some((m) => m.how === 'shoot' && m.launcher?.def === 'sling' && m.item.def === 'stone'), 'a sling with stones can shoot');
  ok(ms.some((m) => m.how === 'throw' && m.item.def === 'knife') && ms.some((m) => m.how === 'throw' && m.item.def === 'stone'), 'a knife and a stone can be thrown');
  const potion = ms.find((m) => m.item.def === 'potion');
  ok(!!potion && potion.breaks >= 1, 'a potion can be thrown, and shatters');
  ok(!ms.some((m) => m.item.def === 'hunting_bow' && m.how === 'throw'), 'a bow is shot, not thrown');
  const q = person(1, {}, ['hunting_bow']);
  ok(!missilesOf(q.inv).some((m) => m.how === 'shoot'), 'a bow without arrows cannot shoot');
  ok(thrownOf(ITEMS.find((d) => d.id === 'sword')!)!.sev < 8 * 0.6, 'a sword thrown tumbles: little harm');
  ok(thrownOf(ITEMS.find((d) => d.id === 'heater_shield')!) !== null && (thrownOf(ITEMS.find((d) => d.id === 'heater_shield')!)!.range ?? 0) <= 8, 'a shield can be thrown, but not far');
  const bow = p.inv.d.items.find((i) => i.def === 'hunting_bow')!;
  const r = readyLauncher(p.inv, bow);
  ok(!!r && bow.loc?.at === 'hand', `the bow is taken up to shoot ("${r?.text}")`);
}

console.log('\nthe line of fire');
ok(JSON.stringify(lineOfFire(0, 0, 4, 2, 6)) === JSON.stringify([[1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3]]), 'the line runs through the target and on');
{
  const p = person(2, { archery: 50 }, ['hunting_bow', 'arrows*40']);
  readyLauncher(p.inv, p.inv.d.items.find((i) => i.def === 'hunting_bow')!);
  const m = missilesOf(p.inv).find((x) => x.how === 'shoot')!;
  const deer = beast('red_deer', 3, { unaware: true });
  const walled = field({ walls: [[4, 0]], beasts: new Map([['8,0', deer]]) });
  ok(inTheWay(walled, [0, 0], [8, 0]).blocked !== null, 'a wall in the way is seen before shooting');
  const s1 = fire(p.a, m, walled, [0, 0], [8, 0], '8,0', null, 0);
  ok(/strikes .*wall/.test(s1.text) && !s1.struck && (s1.broke || (s1.landed?.[0] ?? 99) <= 3), `a wall stops it ("${s1.text}")`);
  ok(inTheWay(field({ people: [[3, 0]], beasts: new Map([['8,0', deer]]) }), [0, 0], [8, 0]).person === 'Ana', 'a person in the way is seen, and the shot not taken');
  let tree = 0, through = 0;
  for (let i = 0; i < 60; i++) {
    const s = fire(p.a, m, field({ trees: [[4, 0]], beasts: new Map([['8,0', beast('red_deer', 10 + i, { unaware: true })]]) }), [0, 0], [8, 0], '8,0', null, i);
    if (/tree/.test(s.text)) tree++;
    else if (s.struck) through++;
  }
  ok(tree > 10 && through > 10, `a tree in the way takes some shots, and some get through (${tree} and ${through} of 60)`);
  let inWay = 0;
  for (let i = 0; i < 40; i++) {
    const s = fire(p.a, m, field({ beasts: new Map([['4,0', beast('wild_horse', 50 + i)], ['8,0', beast('red_deer', 90 + i, { unaware: true })]]) }), [0, 0], [8, 0], '8,0', null, i);
    if (s.struck?.id === '4,0') inWay++;
  }
  ok(inWay > 5 && inWay < 40, `a beast in the way is sometimes struck instead (${inWay} of 40)`);
  let beyond = 0, misses = 0;
  for (let i = 0; i < 80; i++) {
    const s = fire(p.a, m, field({ beasts: new Map([['20,0', beast('hare', 200 + i)]]) }), [0, 0], [20, 0], '20,0', null, i);
    if (!s.struck) {
      misses++;
      if (s.landed && s.landed[0] > 20) beyond++;
    }
  }
  ok(misses > 0 && beyond >= misses * 0.5, `a miss flies on and lands beyond (${beyond} of ${misses} misses)`);
}

console.log('\nthe chance');
{
  const p = person(3, { archery: 40 }, ['hunting_bow', 'arrows*40']);
  const m = missilesOf(p.inv).find((x) => x.how === 'shoot')!;
  const near = shotChance(p.a, m, beast('red_deer', 1), 8, null).chance, far = shotChance(p.a, m, beast('red_deer', 1), 30, null).chance;
  ok(near > far + 20, `farther is harder (${near}% at 8 tiles, ${far}% at 30)`);
  const unaware = shotChance(p.a, m, beast('red_deer', 1, { unaware: true }), 12, null).chance, aware = shotChance(p.a, m, beast('red_deer', 1), 12, null).chance;
  ok(unaware >= aware + 15, `a deer that does not know you are there is far easier (${unaware}% against ${aware}%)`);
  const hare = shotChance(p.a, m, beast('hare', 1), 12, null).chance;
  ok(hare < aware, `a hare is harder than a deer (${hare}%)`);
  const weak = person(4, { archery: 40 }, ['long_bow', 'arrows*10'], 8), strong = person(4, { archery: 40 }, ['long_bow', 'arrows*10'], 15);
  const lw = shotChance(weak.a, missilesOf(weak.inv).find((x) => x.how === 'shoot')!, beast('red_deer', 1), 12, null).chance;
  const ls = shotChance(strong.a, missilesOf(strong.inv).find((x) => x.how === 'shoot')!, beast('red_deer', 1), 12, null).chance;
  ok(ls > lw + 10, `a long bow wants a strong arm (${ls}% strong, ${lw}% weak)`);
}

console.log('\nhunting');
{
  // A fair archer stalks within twelve tiles of an unaware red deer: how often does the first shot hit, and kill outright?
  let hit = 0, lodged = 0, killed = 0;
  for (let s = 1; s <= 60; s++) {
    const p = person(s, { archery: 40 }, ['hunting_bow', 'arrows*40']);
    readyLauncher(p.inv, p.inv.d.items.find((i) => i.def === 'hunting_bow')!);
    const m = missilesOf(p.inv).find((x) => x.how === 'shoot')!;
    const deer = beast('red_deer', s * 13, { unaware: true });
    const shot = fire(p.a, m, field({ beasts: new Map([['12,0', deer]]) }), [0, 0], [12, 0], '12,0', null, 0);
    if (shot.struck?.wounds.length) hit++;
    if (shot.lodged) lodged++;
    if (deer.health.dead) killed++;
  }
  console.log(`  a fair archer's first shot at an unaware red deer, twelve tiles off: ${hit} of 60 hit, ${lodged} arrows stay in, ${killed} kill outright`);
  ok(hit >= 30, 'stalked game is mostly hit');
  ok(lodged > 5, 'arrows often stay in the wound');
  ok(killed < hit, 'but a hit seldom kills outright: the deer runs, and is followed by its blood');
  const p = person(9, { throwing: 30 }, ['stone*5']);
  const stone = missilesOf(p.inv).find((m) => m.item.def === 'stone')!;
  let hares = 0;
  for (let s = 1; s <= 40; s++) {
    const hare = beast('hare', 300 + s, { unaware: true });
    fire(p.a, stone, field({ beasts: new Map([['5,0', hare]]) }), [0, 0], [5, 0], '5,0', 'head', s);
    if (hare.health.dead || hare.health.senseless()) hares++;
  }
  ok(hares >= 1, `a thrown stone at the head can down a hare (${hares} of 40)`);
}

console.log('\nmaking arrows');
{
  const p = person(5, { carpentry: 30 }, ['feathers*2', 'stick*2', 'knife']);
  const r = fletch(p.a, p.inv, 0);
  ok(typeof r !== 'string' && r.items[0]?.def === 'arrows' && r.seconds === 3600, `feathers, a stick and a knife make arrows in an hour (${typeof r === 'string' ? r : r.text})`);
  ok(p.inv.d.items.find((i) => i.def === 'feathers')?.qty === 1, 'using a bunch of feathers');
  const q = person(5, {}, ['feathers']);
  ok(typeof fletch(q.a, q.inv, 0) === 'string', 'without shafts and a blade, none');
}

console.log(failures ? `\n${failures} failed` : '\nall ranged tests passed');
if (failures) process.exit(1);
