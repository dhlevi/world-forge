/**
 * Generates a world in Node and writes equirectangular previews (and optional XYZ tiles) to out/.
 *
 *   npm run preview -- --seed=foo --land=0.35 --plates=14 --erosion=0.5 --res=1024 \
 *     --layers=terrain,biomes --tile=5/10/12
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/gen/world';
import { TileRenderer, LAYERS, type LayerId } from '../src/render/tiles';
import { BIOME_NAMES } from '../src/gen/biomes';
import { encodePng } from './png';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);

const params = {
  seed: args.seed ?? 'forge',
  landFraction: Number(args.land ?? 0.35),
  plates: Number(args.plates ?? 14),
  erosion: Number(args.erosion ?? 0.5),
  resolution: Number(args.res ?? 1024),
};
const outDir = args.out ?? 'out';
const layers = (args.layers ?? LAYERS.map((l) => l.id).join(',')).split(',') as LayerId[];
const imgWidth = Number(args.width ?? 1024);

mkdirSync(outDir, { recursive: true });
let last = performance.now();
const world = generateWorld(params, (stage) => {
  const now = performance.now();
  process.stdout.write(`  ${stage.padEnd(18)} (+${(now - last).toFixed(0)} ms)\n`);
  last = now;
});
const { summary, raster } = world;
console.log(`Generated ${summary.W}x${summary.H} in ${summary.genMs.toFixed(0)} ms`);
console.log(
  `  land ${summary.landPercent.toFixed(1)}%  elev ${summary.minElevation.toFixed(0)}..${summary.maxElevation.toFixed(0)} m  rivers ${summary.riverSegments}`,
);

const counts = new Map<number, number>();
let pSum = 0, pN = 0, pMax = 0;
for (let c = 0; c < raster.height.length; c++) {
  if (raster.height[c] <= 0) continue;
  const area = Math.cos((90 - ((Math.floor(c / raster.W) + 0.5) * 180) / raster.H) * (Math.PI / 180));
  counts.set(raster.biome[c], (counts.get(raster.biome[c]) ?? 0) + area);
  pSum += raster.precip[c] * area;
  pN += area;
  pMax = Math.max(pMax, raster.precip[c]);
}
console.log(`  land precip mean ${(pSum / pN).toFixed(0)} mm/yr, max ${pMax.toFixed(0)}`);
for (const [b, n] of [...counts].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${BIOME_NAMES[b as keyof typeof BIOME_NAMES].padEnd(24)} ${((100 * n) / pN).toFixed(1)}%`);
}

const renderer = new TileRenderer(raster);
for (const layer of layers) {
  const t = performance.now();
  const px = renderer.renderEquirect(imgWidth, imgWidth / 2, layer);
  writeFileSync(`${outDir}/${layer}.png`, encodePng(px, imgWidth, imgWidth / 2));
  console.log(`  wrote ${outDir}/${layer}.png (${(performance.now() - t).toFixed(0)} ms)`);
}
const tiles = (args.tile ?? '').split(',').filter(Boolean);
for (const spec of (args.at ?? '').split(';').filter(Boolean)) {
  const [lon, lat, z] = spec.split(',').map(Number);
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
  tiles.push(`${z}/${x}/${y}`);
}
for (const spec of tiles) {
  const [z, x, y] = spec.split('/').map(Number);
  const t = performance.now();
  const px = renderer.renderTile(z, x, y, layers[0], 512);
  writeFileSync(`${outDir}/tile-${z}-${x}-${y}.png`, encodePng(px, 512, 512));
  console.log(`  wrote tile ${spec} (${(performance.now() - t).toFixed(0)} ms @512px)`);
}
