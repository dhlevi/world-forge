/**
 * Portraits (game/portrait.ts): the picture is the same for the same person, changes with their
 * looks and dress, and shows wounds, bandages, lost parts, pallor, dirt and blood.
 * npx tsx apps/game/scripts/portrait-test.ts (exits non-zero on a failure).
 */
import { FIGURE_KINDS, HAIR_STYLES, BEARD_STYLES, WEAR_SHAPES } from '@worldforge/core/local/figures';
import { Actor } from '../src/actors/actor';
import { Body, Identity } from '../src/actors/components';
import { startingInventory } from '../src/actors/items/inventory';
import { Needs } from '../src/actors/needs';
import { Health } from '../src/actors/health';
import { PORTRAIT_PX, paintPortrait, portraitOf, type PortraitSpec } from '../src/game/portrait';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

const base: PortraitSpec = {
  kind: 'human', female: false, type: 'mesomorph', skin: '#d8b090', hair: { style: 'short', colour: '#5a3a20' }, beard: { style: 'none', colour: '#5a3a20' },
  wear: [{ shape: 'tunic', colour: '#7a6a50' }], grime: 0, blood: 0, pallor: 0, marks: [], lost: [], seed: 7,
};
const paint = (o: Partial<PortraitSpec> = {}) => paintPortrait({ ...base, ...o });
/** How many pixels differ between two pictures. */
const differ = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
  return n;
};
/** How many pixels are mostly red (blood). */
const red = (a: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i] > 80 && a[i] > a[i + 1] * 2.2 && a[i] > a[i + 2] * 2.2) n++;
  return n;
};

console.log('the picture');
const plain = paint();
ok(plain.length === PORTRAIT_PX * PORTRAIT_PX * 4 && plain.every((_, i) => i % 4 !== 3 || plain[i] === 255), 'a square of opaque pixels');
ok(differ(plain, paint()) === 0, 'the same person is painted the same');

console.log('\nlooks');
ok(differ(plain, paint({ female: true })) > 0 && differ(plain, paint({ skin: '#6a4630' })) > 100, 'sex and skin show');
ok(differ(paint({ type: 'ectomorph' }), plain) > 20 && differ(paint({ type: 'endomorph' }), plain) > 20 && differ(paint({ type: 'ectomorph' }), paint({ type: 'endomorph' })) > 40, 'the three body types differ');
{
  const kinds = FIGURE_KINDS.map((k) => paint({ kind: k.name }));
  ok(kinds.every((p, i) => kinds.every((q, j) => i === j || differ(p, q) > 0)), `each of the ${kinds.length} kinds of people has a face of its own`);
  const hairs = HAIR_STYLES.map((h) => paint({ hair: { style: h.name === 'bald' ? 'none' : h.name, colour: '#5a3a20' } }));
  ok(hairs.every((p, i) => hairs.every((q, j) => i === j || differ(p, q) > 0)), `each of the ${hairs.length} ways of wearing hair shows`);
  const beards = BEARD_STYLES.map((b) => paint({ beard: { style: b.name, colour: '#5a3a20' } }));
  ok(beards.every((p, i) => differ(p, plain) > 0 && beards.every((q, j) => i === j || differ(p, q) > 0)), `and each of the ${beards.length} beards`);
  // What is worn at the shoulders, the neck and the head shows; what is worn below does not.
  const shown = new Set(['body', 'armour', 'outer', 'cloak', 'face', 'head']), bare = paint({ wear: [] });
  const wrong = WEAR_SHAPES.filter((w) => {
    const it = { shape: w.name, colour: '#a03030' };
    const changed = w.slot === 'body' ? differ(paint({ wear: [it] }), bare) : differ(paint({ wear: [...base.wear, it] }), plain);
    return changed > 0 !== shown.has(w.slot);
  }).map((w) => w.name);
  ok(wrong.length === 0, `garments show where they are worn${wrong.length ? ` (not so: ${wrong.join(', ')})` : ''}`);
}

console.log('\ndirt, blood and wounds');
{
  const g = [0.3, 0.6, 1].map((grime) => differ(plain, paint({ grime })));
  ok(g[0] > 5 && g[1] > g[0] && g[2] > g[1], `dirt gathers as it grows (${g.join(', ')} pixels changed)`);
  const b = [0.3, 1].map((blood) => red(paint({ blood })));
  ok(red(plain) === 0 && b[0] > 3 && b[1] > b[0] * 2, `and blood (${b.join(', ')} red pixels)`);
  ok(differ(plain, paint({ pallor: 1 })) > 100 && differ(plain, paint({ shut: true })) >= 4, 'pallor and shut eyes show');
  const cut = paint({ marks: [{ at: 'cheek.r', kind: 'cut', size: 0.6, id: 1, bleeding: true }] });
  const bound = paint({ marks: [{ at: 'cheek.r', kind: 'cut', size: 0.6, id: 1, bandaged: true }] });
  ok(red(cut) > 3 && red(bound) === 0 && differ(bound, plain) > 10, 'a bleeding cut shows red; bandaged, it shows linen instead');
  ok(differ(plain, paint({ lost: ['eye.l'] })) >= 3 && differ(plain, paint({ lost: ['ear.r'] })) >= 2, 'a lost eye or ear shows');
  ok(differ(plain, paint({ marks: [{ at: 'cheek.l', kind: 'scar', size: 0.5, id: 3 }] })) >= 2, 'and an old scar');
  const stubble = differ(plain, paint({ beard: { style: 'stubble', colour: '#5a3a20' } })), short = differ(plain, paint({ beard: { style: 'short', colour: '#5a3a20' } }));
  ok(stubble > 5 && short > stubble, 'stubble shows on a shaven chin, less than a beard');
  const long = (cm: number) => paint({ hair: { style: 'long', colour: '#5a3a20', cm } });
  ok(differ(long(16), long(40)) > 6 && differ(paint({ hair: { style: 'short', colour: '#5a3a20', cm: 4 } }), paint({ hair: { style: 'short', colour: '#5a3a20', cm: 12 } })) > 6, 'hair shows its length');
  const u = [1, 2].map((unkempt) => differ(plain, paint({ unkempt })));
  ok(u[0] > 2 && u[1] > u[0], `untended hair strays, the more the longer (${u.join(', ')} pixels)`);
}

console.log('\na person\'s portrait');
{
  const a = new Actor('person');
  a.add(new Identity({ given: 'Asta', full: 'Asta Ormsdottir', female: true, age: 30, year: 0, folk: '', culture: 0, cultureName: '', people: '', homeId: '', homeName: '', standing: 'peasant' }));
  a.add(new Body({ heightCm: 165, weightKg: 52, build: 'lean', skin: 'fair', skinHex: '#e8c0a0', hair: 'red', hairHex: '#a04a20', hairStyle: 'braids', beard: 'none', wounds: [{ part: 'face', kind: 'cut', severity: 3, scar: 'a scar on the face' }] }));
  a.add(startingInventory([], 0, { female: true }));
  const n = a.add(new Needs(Needs.fresh())), h = a.add(new Health(Health.fresh(52)));
  const clean = portraitOf(a);
  ok(clean.female && clean.type === 'ectomorph' && clean.hair.style === 'braids' && clean.wear.length > 0, `their looks, body type and dress (${clean.type}; ${clean.wear.map((w) => w.shape).join(', ')})`);
  ok(clean.marks.length === 1 && clean.marks[0].kind === 'scar' && clean.grime === 0 && clean.pallor === 0, 'an old scar on the face shows; clean and whole otherwise');
  n.d.grime = 80;
  n.stain(40);
  h.hurt({ kind: 'cut', sev: 6, part: 'head', cause: 'a blade', now: 0 });
  h.hurt({ kind: 'cut', sev: 6, part: 'leg.l', cause: 'a blade', now: 0 });
  h.hurt({ kind: 'stab', sev: 12, part: 'eye.r', cause: 'a blade', now: 0 });
  h.d.blood = h.bloodMax() * 0.7;
  const hurt = portraitOf(a);
  ok(hurt.grime === 0.8 && hurt.blood === 0.4 && hurt.pallor > 0.4, 'dirt, blood and pallor');
  ok(hurt.marks.some((m) => m.kind === 'cut' && m.bleeding) && !hurt.marks.some((m) => m.at === 'chest') && hurt.marks.length === 3, 'the wound to the head shows, bleeding; the one to the leg is out of the picture');
  ok(hurt.lost.join() === 'eye.r', 'and the lost eye');
  ok(differ(paintPortrait(clean), paintPortrait(hurt)) > 60, 'the picture changes with them');
  ok(portraitOf(a).seed === clean.seed, 'the same person keeps the same seed (dirt gathers where it fell)');
}

console.log(failures ? `\n${failures} failed` : '\nall portrait tests passed');
if (failures) process.exit(1);
