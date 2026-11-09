/**
 * Downloads the WorldClim 2.1 (10 arc-minute) elevation and monthly mean temperature and
 * precipitation climatologies (1970–2000) used by evaluate.ts. ~46 MB total, extracted to
 * tuning/data/worldclim/. Data: Fick & Hijmans (2017), https://www.worldclim.org - CC BY 4.0.
 *
 *   npm run earth:fetch
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';

export const DATA_DIR = join(import.meta.dirname, '..', 'data', 'worldclim');
const BASE = 'https://geodata.ucdavis.edu/climate/worldclim/2_1/base';
const ARCHIVES = ['wc2.1_10m_elev.zip', 'wc2.1_10m_tavg.zip', 'wc2.1_10m_prec.zip'];

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });
  for (const name of ARCHIVES) {
    const marker = join(DATA_DIR, `${name}.done`);
    if (existsSync(marker)) {
      console.log(`  ${name}: already downloaded`);
      continue;
    }
    process.stdout.write(`  ${name}: downloading… `);
    const res = await fetch(`${BASE}/${name}`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const zip = new Uint8Array(await res.arrayBuffer());
    const files = unzipSync(zip, { filter: (f) => f.name.endsWith('.tif') });
    for (const [file, data] of Object.entries(files)) writeFileSync(join(DATA_DIR, file.split('/').pop()!), data);
    writeFileSync(marker, '');
    console.log(`${(zip.length / 1e6).toFixed(1)} MB, ${Object.keys(files).length} files`);
  }
  console.log(`WorldClim data ready in ${DATA_DIR}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
