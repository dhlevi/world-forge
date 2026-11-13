/** Checks the inventory's rules (npx tsx apps/game/scripts/inventory-test.ts). */
import { Actor } from '../src/actors/actor';
import { Body, Traits } from '../src/actors/components';
import { Inventory, startingInventory } from '../src/actors/items/inventory';
import { makeItem, itemName } from '../src/actors/items/item';
import '../src/actors/cast';

let fails = 0;
const check = (what: string, got: unknown, want: unknown) => {
  const ok = want === 'reason' ? typeof got === 'string' : got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${typeof got === 'string' && got.length < 160 ? `: ${got}` : ''}`);
};

const a = new Actor('person');
a.add(new Traits(Traits.average()));
a.add(new Body({ heightCm: 175, weightKg: 75, build: 'average', skin: '', skinHex: '', hair: '', hairHex: '', hairStyle: 'short', beard: 'none', wounds: [] }));
const inv = a.add(startingInventory(['spear', 'padded coat', 'round shield'], 50, {}));
console.log('Start:', inv.d.items.map((i) => `${itemName(i)} (${inv.where(i.loc)})`).join('; '));
console.log('Load:', JSON.stringify(inv.loadInfo()));

const pack = inv.onBack()!;
const statue = makeItem('statue');
check('a statue will not go in a pack', inv.why(statue, { at: 'in', parent: pack.uid }), 'reason');
const sword = makeItem('sword');
check('a sword will not go in a pack (too long)', inv.why(sword, { at: 'in', parent: pack.uid }), 'reason');
const bag = makeItem('bag');
check('a bag goes in a pack', inv.put(bag, { at: 'in', parent: pack.uid }), null);
const potion = makeItem('potion');
check('a potion goes in a bag in the pack', inv.put(potion, { at: 'in', parent: bag.uid }), null);
const helm = makeItem('helm');
check('a helm will not go in a cloth bag (too big)', inv.why(helm, { at: 'in', parent: bag.uid }), 'reason');
check('a second pack cannot go on the back', inv.why(makeItem('pack'), { at: 'back' }), 'reason');
const shield = inv.d.items.find((i) => i.def === 'round_shield')!;
console.log('The shield starts', inv.where(shield.loc));
check('nothing more slings across the back beside the pack and shield', inv.why(makeItem('hunting_bow'), { at: 'back' }), 'reason');
check('the spear is slung and the shield strapped to the pack', `${inv.where(inv.d.items.find((i) => i.def === 'spear')!.loc)} / ${inv.where(shield.loc)}`, 'on your back / strapped to your small pack');
check('a staff will not strap to the small pack (its one strap holds the shield)', inv.why(makeItem('staff'), { at: 'strap', parent: pack.uid }), 'reason');
const big = makeItem('pack_large');
inv.d.items.find((i) => i.uid === pack.uid)!.loc = { at: 'hand', hand: 'right' };
check('a large pack goes on the back in place of the small one', inv.put(big, { at: 'back' }), null);
check('a spear straps to the large pack', inv.put(makeItem('spear'), { at: 'strap', parent: big.uid }), null);
check('a blanket straps on too', inv.put(makeItem('blanket'), { at: 'strap', parent: big.uid }), null);
check('a cloth bag will not strap on', inv.why(makeItem('bag'), { at: 'strap', parent: big.uid }), 'reason');
const quiver = makeItem('quiver');
check('a quiver hangs on the belt? (belt full: pouch, knife)', inv.why(quiver, { at: 'belt' }), null);
inv.put(quiver, { at: 'belt' });
check('arrows go in the quiver', inv.put(makeItem('arrows', { qty: 20 }), { at: 'in', parent: quiver.uid }), null);
check('bread does not', inv.why(makeItem('bread'), { at: 'in', parent: quiver.uid }), 'reason');
check('dropping the large pack takes what is strapped to it', inv.drop(big.uid).length, 3);
inv.drop(quiver.uid);
inv.d.items.find((i) => i.uid === pack.uid)!.loc = { at: 'back' };
check('a satchel hangs on the belt (third loop: pouch, knife)', inv.put(makeItem('satchel'), { at: 'belt' }), null);
check('a fourth thing will not hang on a belt of three', inv.why(makeItem('waterskin'), { at: 'belt' }), 'reason');
const tunic = inv.worn().find((i) => i.def === 'tunic')!;
check('the tunic will not come off under the padded coat and cloak', inv.whyRemove(tunic), 'reason');
check('a second shirt-layer will not go on', inv.why(makeItem('shirt'), { at: 'worn' }), 'reason');
const ring = makeItem('ring');
check('a ring goes on', inv.put(ring, { at: 'worn' }), null);
for (let i = 0; i < 3; i++) inv.put(makeItem('ring'), { at: 'worn' });
check('a fifth ring will not', inv.why(makeItem('ring'), { at: 'worn' }), 'reason');
const belt = inv.belt()!;
check('the belt will not come off with things on it', inv.whyRemove(belt), 'reason');
// Stacks join.
const arrows = makeItem('arrows', { qty: 10 });
inv.put(arrows, { at: 'in', parent: pack.uid });
inv.put(makeItem('arrows', { qty: 10 }), { at: 'in', parent: pack.uid });
check('two stacks of arrows join', inv.children(pack.uid).filter((i) => i.def === 'arrows').length, 1);
// Too much to bear.
const r = inv.why(makeItem('statue'), { at: 'hand', hand: 'both' });
console.log('Lifting a 60 kg statue with', inv.loadInfo().kg, 'kg carried:', r ?? 'allowed');
const sack = makeItem('sack');
const why = inv.put(sack, { at: 'hand', hand: 'left' });
console.log('Sack in hand:', why ?? 'ok', '| right hand:', inv.held('right') ? itemName(inv.held('right')!) : 'empty');
// Save and load.
const back = Inventory.fromJSON(JSON.parse(JSON.stringify(inv.toJSON())));
check('saves and loads the same', JSON.stringify(back.toJSON()), JSON.stringify(inv.toJSON()));

// Money, and the actor's watchers told of each change.
let told = 0;
const stop = a.watch(() => told++);
const purse = inv.d.copper;
check('paying more than is carried is refused', inv.pay(purse + 1), false);
check('and takes nothing', inv.d.copper, purse);
check('paying what is carried works', inv.pay(5), true);
inv.earn(3);
check('earning adds to the purse', inv.d.copper, purse - 2);
check('losing more than is carried loses only what there is', inv.lose(purse * 10), purse - 2);
inv.earn(purse);
check('watchers hear of each change to the money', told, 4);
inv.drop(potion.uid);
check('and of things taken out', told, 5);
stop();
inv.earn(1);
check('and stop hearing once they stop watching', told, 5);
// Older saves' belongings (a list of names) are brought up to date with the save: scripts/save-test.ts.
console.log(fails ? `${fails} failed` : 'All passed');
process.exit(fails ? 1 : 0);
