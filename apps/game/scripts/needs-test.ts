/** Runs needs and fatigue over game days and prints how they go (npx tsx apps/game/scripts/needs-test.ts). */
import { Actor } from '../src/actors/actor';
import { Body, Mood, Pools, Traits, type TimeCtx } from '../src/actors/components';
import { startingInventory } from '../src/actors/items/inventory';
import { Needs } from '../src/actors/needs';
import { MessageDispatcher } from '../src/engine/messages';
import { Cast } from '../src/actors/cast';

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

function run(label: string, hours: number, ctx: (h: number) => TimeCtx, every = 6): void {
  const { cast, n } = person();
  console.log(`\n== ${label}`);
  for (let h = 1; h <= hours; h++) {
    cast.clock(h * 3600, ctx(h));
    const notes = n.takeNotes().filter((x) => x.word);
    if (notes.length) console.log(`  ${h}h: ${notes.map((x) => x.word).join(', ')}`);
    if (h % every === 0) {
      const d = n.d;
      console.log(`  ${h}h  reserve ${d.reserveKcal.toFixed(0)} kcal, nourish ${d.nourish.toFixed(0)}, hydration ${d.hydrationL.toFixed(2)} L, hydrated ${d.hydrated.toFixed(0)}, fatigue ${d.fatigue.toFixed(0)}, debt ${d.debt.toFixed(1)}, heat ${d.heat.toFixed(0)}, slow ${n.slow().toFixed(2)}`);
    }
    if (n.collapse) {
      console.log(`  COLLAPSE (${n.collapse}) at ${h} h`);
      break;
    }
  }
}

run('Resting, nothing to eat or drink, mild air', 120, () => ({ activity: 'rest', ambientC: 15 }), 12);
run('Walking all day at 12 C, no food or water', 40, () => ({ activity: 'walk', ambientC: 12 }), 4);
run('Travelling laden (heavy), 30 C', 24, () => ({ activity: 'travel', ambientC: 30, loadSlow: 1.4 }), 3);
run('Awake for two days, resting, fed by nothing', 50, () => ({ activity: 'rest', ambientC: 15 }), 10);
run('Standing about in -5 C, dressed as a traveller', 6, () => ({ activity: 'rest', ambientC: -5 }), 1);
run('Asleep in a bed 8 h after 16 h awake', 24, (h) => (h <= 16 ? { activity: 'rest', ambientC: 16 } : { activity: 'sleep', ambientC: 16, sleepQuality: 1 }), 4);
