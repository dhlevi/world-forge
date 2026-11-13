/**
 * Makes a whole world in Node with the core alone (no browser), and prints what it holds and its
 * fingerprint (diagnostics/fingerprint.ts): the check that the generator runs headless, as a game
 * or a server would run it, and comes out the same as in the atlas.
 *
 *   npm run test:core -- --seed=forge --res=512
 *
 * With --check, the fingerprint of the default world is compared with the one recorded in
 * scripts/fingerprint.txt, and a difference fails the run: the guard against changing what the
 * generator makes by accident. When a change is meant to alter the worlds, bump GENERATOR_VERSION
 * (src/version.ts) and record the new fingerprint with --record.
 */
import { generateWorld } from '../src/gen/world';
import { fingerprint } from '../src/diagnostics/fingerprint';
import { worldJson, rasterFiles } from '../src/export/gamedata';
import { type WorldSettings, readSettingsQuery } from '../src/settings';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? 'true'];
}));
const settings: WorldSettings = { seed: 'forge', landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 512 };
readSettingsQuery(settings, `?${new URLSearchParams(Object.entries(args).map(([k, v]) => [k, String(v)])).toString()}`);

const t0 = performance.now();
const w = generateWorld(settings, (stage, pct) => {
  if (args.verbose) console.log(`  ${(pct * 100).toFixed(0).padStart(3)}% ${stage}`);
});
const genMs = performance.now() - t0;
console.log(`World "${settings.seed}" ${w.raster.W}×${w.raster.H} in ${(genMs / 1000).toFixed(1)} s: ${w.summary.cities} cities, ${w.summary.towns} towns, ${w.politics.units.length} realm units, ${w.rivers.features.length} rivers`);

const fp = fingerprint(w, Number(args.households ?? 30));
console.log(`Largest city ${fp.city}: ${fp.buildings} buildings, ${fp.households} households in the first ${args.households ?? 30} buildings`);
console.log(`Timings (ms): ${Object.entries(fp.ms).map(([k, v]) => `${k} ${v}`).join(', ')}`);
for (const [k, v] of Object.entries(fp.parts)) console.log(`  ${k.padEnd(12)} ${v}`);
console.log(`Fingerprint ${fp.all}`);

// The recorded fingerprint of the default world (seed forge, 512, 30 households).
const RECORD = fileURLToPath(new URL('./fingerprint.txt', import.meta.url));
const defaults = !args.seed && !args.res && !args.resolution && !args.households;
if (args.record) {
  if (!defaults) throw new Error('Record the fingerprint of the default world only (no --seed, --res or --households).');
  writeFileSync(RECORD, `${fp.all}\n`);
  console.log(`Recorded ${fp.all} in scripts/fingerprint.txt.`);
} else if (args.check) {
  const want = readFileSync(RECORD, 'utf8').trim();
  if (!defaults) console.log('(--check compares the default world only; skipped.)');
  else if (want !== fp.all) {
    console.error(`The default world's fingerprint is ${fp.all}, but ${want} was recorded: the generator now makes different worlds.`);
    console.error('If that is meant, bump GENERATOR_VERSION (src/version.ts) and run with --record.');
    process.exitCode = 1;
  } else console.log('The fingerprint matches the recorded one.');
}

if (args.export) {
  const t1 = performance.now();
  const json = JSON.stringify(worldJson(w, settings));
  const rf = rasterFiles(w);
  console.log(`Game data: world.json ${(json.length / 1e6).toFixed(1)} MB, ${rf.files.length} grids, ${rf.images.length} images in ${Math.round(performance.now() - t1)} ms`);
}
