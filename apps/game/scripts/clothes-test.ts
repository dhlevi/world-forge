/**
 * Dirty and stained clothes (docs/backlog.md, C4; actors/items/soil.ts): what is worn takes the
 * dirt and blood the wearer takes, the outer layers most; blood left sets into stains for good;
 * washing takes out the dirt and fresh blood (all of it with soap); dirty clothes sell for less,
 * and stained ones less for good; and dirty or bloodied clothes put people off. In play, clothes
 * are washed at water, and put back on wet.
 * npx tsx apps/game/scripts/clothes-test.ts (exits non-zero on a failure).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHUNK } from '@worldforge/core/local/chunk';
import { G } from '@worldforge/core/local/tiles';
import { MessageDispatcher } from '../src/engine/messages';
import { Actor } from '../src/actors/actor';
import { Body, Mood, Pools, Traits } from '../src/actors/components';
import { Inventory, startingInventory } from '../src/actors/items/inventory';
import { itemValue, makeItem, type Item } from '../src/actors/items/item';
import { Needs } from '../src/actors/needs';
import { bodyMods } from '../src/actors/checks';
import { Cast } from '../src/actors/cast';
import { clothesLook, soilWords, washGarment } from '../src/actors/items/soil';
import { readSave } from '../src/game/save';
import { PlaySession, type PlayOptions, type SessionWorld } from '../src/game/session';
import type { ChunkData, StartSite } from '../src/worker/protocol';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

function person() {
  const cast = new Cast(new MessageDispatcher());
  const a = new Actor('person');
  const t = a.add(new Traits(Traits.average()));
  const b = a.add(new Body({ heightCm: 175, weightKg: 75, build: 'average', skin: '', skinHex: '', hair: '', hairHex: '', hairStyle: 'short', beard: 'none', wounds: [] }));
  a.add(new Pools(Pools.fromTraits(t, b)));
  a.add(new Mood([]));
  a.add(startingInventory([], 0, {}));
  const n = a.add(new Needs(Needs.fresh()));
  cast.setPlayer(a);
  cast.setClock(0);
  return { a, cast, n, inv: a.need(Inventory) };
}
const worn = (inv: Inventory, id: string) => inv.worn().find((i) => i.def === id) as Item;

console.log('wearing them');
{
  const { cast, inv } = person();
  for (let h = 1; h <= 30; h++) cast.clock(h * 3600, { activity: 'walk', ambientC: 15 });
  const tunic = worn(inv, 'tunic'), under = worn(inv, 'undershirt');
  ok((tunic.dirt ?? 0) >= 25, `a day and more on the road dirties the tunic (${tunic.dirt}: ${soilWords(tunic)})`);
  ok((under.dirt ?? 0) < (tunic.dirt ?? 0), `the undershirt beneath less (${under.dirt})`);
  ok(inv.worn().every((i) => !i.stain), 'and no stain without blood');
}
{
  const { cast, n, inv } = person();
  n.stain(40);
  const tunic = worn(inv, 'tunic');
  ok((tunic.blood ?? 0) >= 25, `blood gets on the clothes (${tunic.blood})`);
  ok(clothesLook(inv) === 'bloodied', 'and they look it');
  ok(bodyMods(n.actor!, 'persuasion').some((m) => m.why === 'bloodied clothes'), 'which puts people off');
  const fresh = { ...tunic }, later = { ...tunic };
  washGarment(fresh, true);
  ok(!fresh.blood && !fresh.stain, 'washed at once with soap, it all comes out');
  for (let h = 1; h <= 48; h++) cast.clock(h * 3600, { activity: 'rest', ambientC: 15 });
  ok((tunic.stain ?? 0) >= 10 && (tunic.blood ?? 0) < 5, `left two days, it sets into a stain (${tunic.stain}: ${soilWords(tunic)})`);
  const stained = { ...tunic };
  washGarment(stained, true);
  ok((stained.stain ?? 0) === (tunic.stain ?? 0), 'which no washing takes out');
  void later;
}

console.log('\nwhat they are worth');
{
  const clean = makeItem('tunic'), dirty = { ...makeItem('tunic'), dirt: 80 }, stained = { ...makeItem('tunic'), stain: 60 };
  ok(itemValue(dirty) < itemValue(clean) && itemValue(stained) < itemValue(dirty), `clean ${itemValue(clean)}, dirty ${itemValue(dirty)}, badly stained ${itemValue(stained)} copper`);
  washGarment(dirty, false);
  ok(itemValue(dirty) > itemValue({ ...makeItem('tunic'), dirt: 80 }) && (dirty.dirt ?? 0) > 0, `washed without soap it is worth more again (${itemValue(dirty)}), with a little dirt left`);
}

console.log('\nwashing them in play');
{
  const fixture = readFileSync(fileURLToPath(new URL('./fixtures/save-v1-camps.json', import.meta.url)), 'utf8');
  const restore = readSave(fixture);
  const [X, Y] = [restore.player.x, restore.player.y];
  const world: SessionWorld = {
    bus: new MessageDispatcher(),
    requestChunk: () => {},
    climate: async () => ({ warm: 18, cold: 2, precipSummer: 700, precipWinter: 700, windU: 0.6, windV: 0 }),
    requestRoute: async () => ({ steps: null, partial: false }),
    requestPeople: async () => ({ people: [], radius: 96 }),
    site: async () => ({ site: null, gates: [] }),
    starts: () => [],
  };
  const session = (water: boolean) => {
    const o: PlayOptions = { site: { id: 's12', name: 'Onson', tier: 'city', population: 40000, lon: 10, lat: 50 } as StartSite, tile: [X, Y], sites: [], gameId: restore.id, settings: restore.settings, restore, character: null };
    const s = new PlaySession(world, { openCity: async () => {}, toTitle() {} }, o);
    const N = CHUNK * CHUNK;
    const [cx0, cy0] = [Math.floor(X / CHUNK), Math.floor(Y / CHUNK)];
    for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
      const ground = new Uint8Array(N);
      for (let k = 0; k < N; k++) ground[k] = G(water && cx * CHUNK + (k % CHUNK) === X + 1 && cy * CHUNK + Math.floor(k / CHUNK) === Y ? 'water_shallow' : 'grass');
      s.map.add({ cx, cy, ground, object: new Uint8Array(N), area: new Uint16Array(N), areas: [''], elev: new Int16Array(N).fill(30), sites: [], roofs: [], layers: [], ms: 0 } as ChunkData);
    }
    s.game.z = null;
    for (const i of s.player!.need(Inventory).worn()) i.dirt = 70;
    s.player!.need(Needs).d.wet = 0;
    return s;
  };
  const dry = session(false);
  ok(/no water/.test(dry.washClothes()), 'no washing without water to hand');
  const wet = session(true);
  const t0 = wet.game.time;
  const said = wet.washClothes();
  const inv = wet.player!.need(Inventory);
  ok(inv.worn().every((i) => (i.dirt ?? 0) < 30), `at the water they come clean: "${said}"`);
  ok(wet.game.time - t0 >= 15 * 60 && (wet.player!.need(Needs).d.wet ?? 0) >= 40, `it takes a while (${Math.round((wet.game.time - t0) / 60)} min), and the wanderer is wet for it (${Math.round(wet.player!.need(Needs).d.wet ?? 0)})`);
  ok(/clean enough/.test(wet.washClothes()), 'and clean clothes need no washing');
  dry.dispose();
  wet.dispose();
}

console.log(failures ? `\n${failures} failed` : '\nall clothes tests passed');
process.exit(failures ? 1 : 0);
