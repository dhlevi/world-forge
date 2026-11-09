/**
 * Makes a whole world in Node with the core alone (no browser), and prints what it holds and its
 * fingerprint (diagnostics/fingerprint.ts): the check that the generator runs headless, as a game
 * or a server would run it, and comes out the same as in the atlas.
 *
 *   npm run test:core -- --seed=forge --res=512
 */
import { generateWorld } from '../src/gen/world';
import { fingerprint } from '../src/diagnostics/fingerprint';
import { worldJson, rasterFiles } from '../src/export/gamedata';
import { type WorldSettings, readSettingsQuery } from '../src/settings';

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

if (args.export) {
  const t1 = performance.now();
  const json = JSON.stringify(worldJson(w, settings));
  const rf = rasterFiles(w);
  console.log(`Game data: world.json ${(json.length / 1e6).toFixed(1)} MB, ${rf.files.length} grids, ${rf.images.length} images in ${Math.round(performance.now() - t1)} ms`);
}
