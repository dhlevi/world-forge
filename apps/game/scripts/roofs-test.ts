/**
 * Roofs (core local/roofs.ts): each building's roof by its climate and use, and the plane of the
 * roof each tile is on, seen from straight above.
 * npx tsx apps/game/scripts/roofs-test.ts (exits non-zero on a failure).
 */
import { KOPPEN_CLASSES } from '@worldforge/core/gen/koppen';
import { covers, roofKind, roofPlane, type Roof, type RoofInput } from '@worldforge/core/local/roofs';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};
const kp = (code: string) => KOPPEN_CLASSES.findIndex((c) => c.code === code);
const house = (id: string, more: Partial<RoofInput> = {}): RoofInput => ({ id, koppen: kp('Cfb'), storeys: 2, storeyH: 3, ctx: 'ward', tier: 'town', ...more });

// ---- Shape and material ------------------------------------------------------------------------------
ok(JSON.stringify(roofKind(house('h1'))) === JSON.stringify(roofKind(house('h1'))), 'a house always has the same roof');
const count = (more: Partial<RoofInput>) => {
  const n: Record<string, number> = {};
  for (let i = 0; i < 400; i++) {
    const k = roofKind(house(`b${i}`, more));
    n[k.material] = (n[k.material] ?? 0) + 1;
    n[k.shape] = (n[k.shape] ?? 0) + 1;
  }
  return n;
};
const desert = count({ koppen: kp('BWh') }), med = count({ koppen: kp('Csa') }), cold = count({ koppen: kp('Dfc') }), village = count({ tier: 'village' });
console.log(`  desert ${JSON.stringify(desert)}\n  mediterranean ${JSON.stringify(med)}\n  cold ${JSON.stringify(cold)}\n  temperate village ${JSON.stringify(village)}`);
ok(desert.flat > 300, 'in the desert, flat roofs');
ok(med.tile > 300, 'round the Mediterranean, tiles');
ok((cold.shingle ?? 0) > 150 && !cold.flat, 'in the cold, shingles and no flat roofs');
ok((village.thatch ?? 0) > 120, 'in a village, much thatch');
ok(roofKind(house('t', { use: 'temple' })).material === 'slate' && roofKind(house('k', { use: 'keep' })).shape === 'flat', 'temples slated, keeps flat');
ok(roofKind(house('m', { role: 'magetower' })).shape === 'cone' && roofKind(house('b', { burrow: true })).material === 'turf', 'a mage\'s tower coned, a burrow turfed');

// ---- Planes ------------------------------------------------------------------------------------------
const box = (w: number, h: number, shape: Roof['shape']): Roof => ({ id: 'r', x0: 10, y0: 20, w, h, cover: new Uint8Array(w * h).fill(1), floorM: 30, heightM: 6, storeys: 2, shape, material: 'tile', ridge: w >= h ? 'ew' : 'ns' });
const planes = (r: Roof) => Array.from({ length: r.h }, (_, y) => Array.from({ length: r.w }, (_, x) => roofPlane(r, r.x0 + x, r.y0 + y).replace('ridge_', 'R').slice(0, 2).padEnd(2)).join(' '));
const gable = box(8, 5, 'gable');
console.log(`  a gable roof, 8 × 5:\n    ${planes(gable).join('\n    ')}`);
ok(planes(gable)[0].startsWith('n ') && planes(gable)[2].startsWith('Re') && planes(gable)[4].startsWith('s '), 'a gable: north slope, ridge along the middle, south slope');
const hip = box(8, 5, 'hip');
console.log(`  a hipped roof, 8 × 5:\n    ${planes(hip).join('\n    ')}`);
ok(roofPlane(hip, 10, 22) === 'w' && roofPlane(hip, 17, 22) === 'e' && roofPlane(hip, 13, 20) === 'n', 'a hip: the ends slope east and west');
const tall = box(4, 9, 'gable');
ok(tall.ridge === 'ns' && roofPlane(tall, 10, 24) === 'w' && roofPlane(tall, 13, 24) === 'e', 'a narrow building\'s ridge runs north and south');
const cone = box(5, 5, 'cone');
ok(roofPlane(cone, 12, 22) === 'peak' && roofPlane(cone, 10, 22) === 'w' && roofPlane(cone, 12, 24) === 's', 'a cone: a peak in the middle, falling every way');
ok(roofPlane(box(6, 4, 'flat'), 12, 21) === 'flat', 'a flat roof is flat');
const l = box(4, 4, 'gable');
l.cover[3] = 0;
ok(covers(l, 10, 20) && !covers(l, 13, 20) && !covers(l, 9, 20), 'a roof covers its building\'s tiles only');

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
if (failures) process.exitCode = 1;
