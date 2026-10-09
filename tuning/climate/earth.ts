import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromArrayBuffer } from 'geotiff';
import { koppenCode, KOPPEN_CLASSES } from '../../src/gen/koppen';
import { DATA_DIR } from './fetch-data';

/** Real Earth resampled onto the generator's W×H equirectangular grid. */
export interface Earth {
  W: number;
  H: number;
  /** Elevation (m); ocean cells are set to a constant depth. */
  height: Float32Array;
  land: Uint8Array;
  /** Observed climate (land cells only; NaN elsewhere). */
  tAnnual: Float32Array;
  tWarm: Float32Array;
  tCold: Float32Array;
  pAnnual: Float32Array;
  pSummer: Float32Array;
  pWinter: Float32Array;
  /** Reference Köppen class index (255 = none), classified with the same code as the simulation. */
  koppen: Uint8Array;
}

const OCEAN_DEPTH_M = -2000;

async function readTiff(file: string): Promise<{ data: Float32Array; w: number; h: number; nodata: number }> {
  const path = join(DATA_DIR, file);
  if (!existsSync(path)) throw new Error(`Missing ${path} - run \`npm run earth:fetch\` first.`);
  const buf = readFileSync(path);
  const tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const img = await tiff.getImage();
  const [band] = (await img.readRasters()) as unknown as ArrayLike<number>[];
  return { data: Float32Array.from(band), w: img.getWidth(), h: img.getHeight(), nodata: Number(img.getGDALNoData() ?? -3.4e38) };
}

/** Area-average valid source pixels into W×H cells; returns mean and the valid fraction per cell. */
function resample(src: { data: Float32Array; w: number; h: number; nodata: number }, W: number, H: number) {
  const sum = new Float64Array(W * H), valid = new Float64Array(W * H), total = new Float64Array(W * H);
  for (let y = 0; y < src.h; y++) {
    const j = Math.min(H - 1, Math.floor((y * H) / src.h));
    for (let x = 0; x < src.w; x++) {
      const c = j * W + Math.min(W - 1, Math.floor((x * W) / src.w));
      const v = src.data[y * src.w + x];
      total[c]++;
      if (Number.isFinite(v) && v > -1e30 && v !== src.nodata) {
        sum[c] += v;
        valid[c]++;
      }
    }
  }
  const mean = new Float32Array(W * H), frac = new Float32Array(W * H);
  for (let c = 0; c < W * H; c++) {
    mean[c] = valid[c] > 0 ? sum[c] / valid[c] : NaN;
    frac[c] = total[c] > 0 ? valid[c] / total[c] : 0;
  }
  return { mean, frac };
}

export async function loadEarth(W: number): Promise<Earth> {
  const cache = join(DATA_DIR, `earth-${W}.bin`);
  if (existsSync(cache)) return readCache(cache, W);
  const earth = await buildEarth(W);
  writeCache(cache, earth);
  return earth;
}

const FLOAT_FIELDS = ['height', 'tAnnual', 'tWarm', 'tCold', 'pAnnual', 'pSummer', 'pWinter'] as const;

function writeCache(path: string, e: Earth): void {
  const parts = [...FLOAT_FIELDS.map((f) => new Uint8Array(e[f].buffer)), e.land, e.koppen];
  writeFileSync(path, Buffer.concat(parts));
}

function readCache(path: string, W: number): Earth {
  const H = W / 2, N = W * H;
  const buf = readFileSync(path);
  let off = 0;
  const floats = Object.fromEntries(FLOAT_FIELDS.map((f) => {
    const arr = new Float32Array(N);
    new Uint8Array(arr.buffer).set(buf.subarray(off, off + N * 4));
    off += N * 4;
    return [f, arr];
  })) as Record<(typeof FLOAT_FIELDS)[number], Float32Array>;
  const land = Uint8Array.from(buf.subarray(off, off + N));
  const koppen = Uint8Array.from(buf.subarray(off + N, off + 2 * N));
  return { W, H, ...floats, land, koppen };
}

async function buildEarth(W: number): Promise<Earth> {
  const H = W / 2, N = W * H;
  const elev = resample(await readTiff('wc2.1_10m_elev.tif'), W, H);
  const land = new Uint8Array(N);
  const height = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    land[c] = elev.frac[c] >= 0.5 ? 1 : 0;
    height[c] = land[c] ? Math.max(1, elev.mean[c]) : OCEAN_DEPTH_M;
  }

  const tMonths: Float32Array[] = [], pMonths: Float32Array[] = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    tMonths.push(resample(await readTiff(`wc2.1_10m_tavg_${mm}.tif`), W, H).mean);
    pMonths.push(resample(await readTiff(`wc2.1_10m_prec_${mm}.tif`), W, H).mean);
  }

  const tAnnual = new Float32Array(N).fill(NaN), tWarm = new Float32Array(N).fill(NaN), tCold = new Float32Array(N).fill(NaN);
  const pAnnual = new Float32Array(N).fill(NaN), pSummer = new Float32Array(N).fill(NaN), pWinter = new Float32Array(N).fill(NaN);
  const koppen = new Uint8Array(N).fill(255);
  const index = new Map(KOPPEN_CLASSES.map((k, i) => [k.code, i]));
  for (let j = 0, c = 0; j < H; j++) {
    const north = (j + 0.5) / H < 0.5;
    for (let i = 0; i < W; i++, c++) {
      if (!land[c] || Number.isNaN(tMonths[0][c]) || Number.isNaN(pMonths[0][c])) continue;
      let tSum = 0, tMax = -Infinity, tMin = Infinity, pAll = 0, pAprSep = 0;
      for (let m = 0; m < 12; m++) {
        const t = tMonths[m][c], p = pMonths[m][c];
        tSum += t;
        tMax = Math.max(tMax, t);
        tMin = Math.min(tMin, t);
        pAll += p;
        if (m >= 3 && m <= 8) pAprSep += p;
      }
      // Half-year totals ×2 = annualised rates, matching the simulation's units.
      const pSum = 2 * (north ? pAprSep : pAll - pAprSep), pWin = 2 * (north ? pAll - pAprSep : pAprSep);
      tAnnual[c] = tSum / 12;
      tWarm[c] = tMax;
      tCold[c] = tMin;
      pAnnual[c] = pAll;
      pSummer[c] = pSum;
      pWinter[c] = pWin;
      koppen[c] = index.get(koppenCode(tSum / 12, tMax, tMin, pSum, pWin))!;
    }
  }
  return { W, H, height, land, tAnnual, tWarm, tCold, pAnnual, pSummer, pWinter, koppen };
}
