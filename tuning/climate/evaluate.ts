/**
 * Earth-match check for the climate model. Runs the generator's climate pipeline on real Earth
 * elevation (WorldClim) and scores the simulated climate against observed WorldClim climatology:
 * Köppen class and group agreement, temperature error and precipitation error. Writes map images to
 * out/earth/ and compares the score with tuning/climate/baseline.json.
 *
 *   npm run earth:fetch                 # once, downloads ~46 MB
 *   npm run earth:eval                  # score current parameters
 *   npm run earth:eval -- --update-baseline
 *   npm run earth:eval -- --res=512 --seed=earth
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateWorld } from '../../src/gen/world';
import { KOPPEN_CLASSES } from '../../src/gen/koppen';
import { hexToRgb } from '../../src/render/palette';
import { encodePng } from '../../scripts/png';
import { loadEarth, type Earth } from './earth';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const RES = Number(args.res ?? 1024);
const SEED = args.seed ?? 'earth';
const OUT = join(import.meta.dirname, '..', '..', 'out', 'earth');
const BASELINE = join(import.meta.dirname, 'baseline.json');
const GROUPS = ['A', 'B', 'C', 'D', 'E'];

interface Score {
  objective: number;
  classAccuracy: number;
  groupAccuracy: number;
  groupKappa: number;
  tempBiasC: number;
  tempRmseC: number;
  warmRmseC: number;
  coldRmseC: number;
  precipLogRmse: number;
  precipBiasRatio: number;
  summerShareMae: number;
  groupShares: Record<string, [number, number]>;
}

function score(earth: Earth, sim: ReturnType<typeof generateWorld>['raster']): { s: Score; confusion: number[][] } {
  const { W, H } = earth;
  const confusion = GROUPS.map(() => GROUPS.map(() => 0));
  let wSum = 0, classHit = 0, groupHit = 0;
  let tBias = 0, tSq = 0, warmSq = 0, coldSq = 0, pLogSq = 0, pSim = 0, pRef = 0, shareErr = 0;
  for (let j = 0; j < H; j++) {
    const area = Math.cos(((90 - ((j + 0.5) * 180) / H) * Math.PI) / 180);
    for (let i = 0; i < W; i++) {
      const c = j * W + i;
      if (earth.koppen[c] === 255 || sim.height[c] <= 0) continue;
      const ref = KOPPEN_CLASSES[earth.koppen[c]].code, got = KOPPEN_CLASSES[sim.koppen[c]].code;
      wSum += area;
      if (ref === got) classHit += area;
      if (ref[0] === got[0]) groupHit += area;
      confusion[GROUPS.indexOf(ref[0])][GROUPS.indexOf(got[0])] += area;

      const st = sim.tempSea[c] - (6.5 * Math.max(0, sim.height[c])) / 1000;
      const dt = st - earth.tAnnual[c];
      tBias += area * dt;
      tSq += area * dt * dt;
      warmSq += area * (sim.tempWarm[c] - earth.tWarm[c]) ** 2;
      coldSq += area * (sim.tempCold[c] - earth.tCold[c]) ** 2;
      pLogSq += area * Math.log10((sim.precip[c] + 50) / (earth.pAnnual[c] + 50)) ** 2;
      pSim += area * sim.precip[c];
      pRef += area * earth.pAnnual[c];
      const simShare = sim.precipSummer[c] / Math.max(1e-6, sim.precipSummer[c] + sim.precipWinter[c]);
      const refShare = earth.pSummer[c] / Math.max(1e-6, earth.pSummer[c] + earth.pWinter[c]);
      shareErr += area * Math.abs(simShare - refShare);
    }
  }

  // Cohen's kappa on the five main groups: agreement beyond what matching shares alone would give.
  const rowTot = confusion.map((r) => r.reduce((a, b) => a + b, 0));
  const colTot = GROUPS.map((_, k) => confusion.reduce((a, r) => a + r[k], 0));
  const pe = rowTot.reduce((a, r, k) => a + (r / wSum) * (colTot[k] / wSum), 0);
  const po = groupHit / wSum;

  const s: Score = {
    objective: 0,
    classAccuracy: classHit / wSum,
    groupAccuracy: po,
    groupKappa: (po - pe) / (1 - pe),
    tempBiasC: tBias / wSum,
    tempRmseC: Math.sqrt(tSq / wSum),
    warmRmseC: Math.sqrt(warmSq / wSum),
    coldRmseC: Math.sqrt(coldSq / wSum),
    precipLogRmse: Math.sqrt(pLogSq / wSum),
    precipBiasRatio: pSim / pRef,
    summerShareMae: shareErr / wSum,
    groupShares: Object.fromEntries(GROUPS.map((g, k) => [g, [rowTot[k] / wSum, colTot[k] / wSum]])),
  };
  // Single number to maximise (0..1). Weights favour what users see: climate zones first.
  s.objective =
    0.3 * s.classAccuracy +
    0.3 * s.groupKappa +
    0.15 * Math.exp(-s.tempRmseC / 5) +
    0.1 * Math.exp(-((s.warmRmseC + s.coldRmseC) / 2) / 6) +
    0.1 * Math.exp(-s.precipLogRmse / 0.3) +
    0.05 * (1 - Math.min(1, s.summerShareMae / 0.3));
  return { s, confusion };
}

function writeMaps(earth: Earth, sim: ReturnType<typeof generateWorld>['raster']): void {
  const { W, H } = earth;
  const rgb = KOPPEN_CLASSES.map((k) => hexToRgb(k.color));
  const ocean = [24, 38, 58];
  const img = (pick: (c: number) => number[]) => {
    const px = new Uint8ClampedArray(W * H * 4);
    for (let c = 0; c < W * H; c++) {
      const col = pick(c);
      px.set([col[0], col[1], col[2], 255], c * 4);
    }
    return encodePng(px, W, H);
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'koppen-observed.png'), img((c) => (earth.koppen[c] === 255 ? ocean : rgb[earth.koppen[c]])));
  writeFileSync(join(OUT, 'koppen-simulated.png'), img((c) => (sim.height[c] <= 0 ? ocean : rgb[sim.koppen[c]])));
  // Green = same class, yellow = same main group, red = different group.
  writeFileSync(join(OUT, 'koppen-agreement.png'), img((c) => {
    if (earth.koppen[c] === 255 || sim.height[c] <= 0) return ocean;
    const a = KOPPEN_CLASSES[earth.koppen[c]].code, b = KOPPEN_CLASSES[sim.koppen[c]].code;
    return a === b ? [60, 170, 80] : a[0] === b[0] ? [230, 200, 60] : [210, 60, 50];
  }));
}

const pct = (v: number) => `${(100 * v).toFixed(1)}%`;

async function main(): Promise<void> {
  const t0 = performance.now();
  const earth = await loadEarth(RES);
  const tLoad = performance.now();
  const world = generateWorld({ seed: SEED, landFraction: 0.3, plates: 1, erosion: 0, resolution: RES, heightmap: earth.height });
  const { s, confusion } = score(earth, world.raster);
  writeMaps(earth, world.raster);

  console.log(`Earth match @ ${RES}×${RES / 2}  (load ${((tLoad - t0) / 1000).toFixed(1)}s, generate ${(world.summary.genMs / 1000).toFixed(1)}s)\n`);
  console.log(`  K\u00f6ppen class accuracy   ${pct(s.classAccuracy)}`);
  console.log(`  K\u00f6ppen group accuracy   ${pct(s.groupAccuracy)}   (kappa ${s.groupKappa.toFixed(3)})`);
  console.log(`  Annual temperature     bias ${s.tempBiasC >= 0 ? '+' : ''}${s.tempBiasC.toFixed(2)} \u00b0C, RMSE ${s.tempRmseC.toFixed(2)} \u00b0C`);
  console.log(`  Warmest / coldest month RMSE ${s.warmRmseC.toFixed(2)} / ${s.coldRmseC.toFixed(2)} \u00b0C`);
  console.log(`  Annual precipitation   sim/obs ${s.precipBiasRatio.toFixed(2)}, log10 RMSE ${s.precipLogRmse.toFixed(3)}`);
  console.log(`  Summer rain share MAE  ${pct(s.summerShareMae)}`);
  console.log('\n  Group shares (observed \u2192 simulated):');
  for (const g of GROUPS) console.log(`    ${g}  ${pct(s.groupShares[g][0]).padStart(6)} \u2192 ${pct(s.groupShares[g][1]).padStart(6)}`);
  console.log('\n  Confusion (rows observed, columns simulated, % of land):');
  console.log(`         ${GROUPS.map((g) => g.padStart(6)).join('')}`);
  const total = confusion.flat().reduce((a, b) => a + b, 0);
  confusion.forEach((row, k) => console.log(`    ${GROUPS[k]}    ${row.map((v) => (100 * v / total).toFixed(1).padStart(6)).join('')}`));

  console.log(`\n  OBJECTIVE ${s.objective.toFixed(4)}`);
  if (existsSync(BASELINE)) {
    const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Score & { res: number };
    if (base.res === RES) {
      const d = s.objective - base.objective;
      const verdict = d < -0.002 ? 'REGRESSED' : d > 0.002 ? 'improved' : 'unchanged';
      console.log(`  baseline  ${base.objective.toFixed(4)}  (${d >= 0 ? '+' : ''}${d.toFixed(4)}, ${verdict})`);
      if (verdict === 'REGRESSED' && !args['update-baseline']) process.exitCode = 1;
    } else {
      console.log(`  (baseline was recorded at res ${base.res}; run with --res=${base.res} to compare)`);
    }
  }
  if (args['update-baseline']) {
    writeFileSync(BASELINE, JSON.stringify({ res: RES, ...s }, null, 2) + '\n');
    console.log(`  baseline updated \u2192 ${BASELINE}`);
  }
  console.log(`\n  Maps: ${OUT}/koppen-{observed,simulated,agreement}.png`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
