import { KOPPEN as K } from './config';

export interface KoppenClass {
  code: string;
  name: string;
  color: string;
}

/** Köppen–Geiger classes with the conventional (Peel et al. 2007) map colours. Index = stored id. */
export const KOPPEN_CLASSES: KoppenClass[] = [
  { code: 'Af', name: 'Tropical rainforest', color: '#0000ff' },
  { code: 'Am', name: 'Tropical monsoon', color: '#0078ff' },
  { code: 'Aw', name: 'Tropical savanna', color: '#46aafa' },
  { code: 'BWh', name: 'Hot desert', color: '#ff0000' },
  { code: 'BWk', name: 'Cold desert', color: '#ff9696' },
  { code: 'BSh', name: 'Hot semi-arid', color: '#f5a500' },
  { code: 'BSk', name: 'Cold semi-arid', color: '#ffdc64' },
  { code: 'Csa', name: 'Hot-summer Mediterranean', color: '#ffff00' },
  { code: 'Csb', name: 'Warm-summer Mediterranean', color: '#c8c800' },
  { code: 'Csc', name: 'Cold-summer Mediterranean', color: '#969600' },
  { code: 'Cwa', name: 'Monsoon-influenced humid subtropical', color: '#96ff96' },
  { code: 'Cwb', name: 'Subtropical highland', color: '#64c864' },
  { code: 'Cwc', name: 'Cold subtropical highland', color: '#329632' },
  { code: 'Cfa', name: 'Humid subtropical', color: '#c8ff50' },
  { code: 'Cfb', name: 'Temperate oceanic', color: '#64ff50' },
  { code: 'Cfc', name: 'Subpolar oceanic', color: '#32c800' },
  { code: 'Dsa', name: 'Mediterranean continental (hot summer)', color: '#ff00ff' },
  { code: 'Dsb', name: 'Mediterranean continental (warm summer)', color: '#c800c8' },
  { code: 'Dsc', name: 'Mediterranean subarctic', color: '#963296' },
  { code: 'Dsd', name: 'Mediterranean subarctic (severe winter)', color: '#966496' },
  { code: 'Dwa', name: 'Monsoon continental (hot summer)', color: '#aaafff' },
  { code: 'Dwb', name: 'Monsoon continental (warm summer)', color: '#5a78dc' },
  { code: 'Dwc', name: 'Monsoon subarctic', color: '#4b50b4' },
  { code: 'Dwd', name: 'Monsoon subarctic (severe winter)', color: '#320087' },
  { code: 'Dfa', name: 'Hot-summer humid continental', color: '#00ffff' },
  { code: 'Dfb', name: 'Warm-summer humid continental', color: '#37c8ff' },
  { code: 'Dfc', name: 'Subarctic', color: '#007d7d' },
  { code: 'Dfd', name: 'Subarctic (severe winter)', color: '#00465f' },
  { code: 'ET', name: 'Tundra', color: '#b2b2b2' },
  { code: 'EF', name: 'Ice cap', color: '#686868' },
];

const INDEX = new Map(KOPPEN_CLASSES.map((k, i) => [k.code, i]));

/** Months (0–12) with mean temperature ≥ 10 °C, assuming a sinusoidal annual cycle. */
function monthsAbove10(mean: number, warm: number, cold: number): number {
  const amp = (warm - cold) / 2;
  if (amp < 0.01) return mean >= 10 ? 12 : 0;
  const x = (10 - mean) / amp;
  if (x <= -1) return 12;
  if (x >= 1) return 0;
  return (12 * Math.acos(x)) / Math.PI;
}

/**
 * Köppen–Geiger class from annual mean, warmest- and coldest-month temperature (°C) and the
 * summer/winter half-year precipitation rates (mm/yr). Monthly extremes are approximated from
 * the half-year means.
 */
export function koppenCode(t: number, tWarm: number, tCold: number, pSummer: number, pWinter: number): string {
  if (tWarm < 10) return tWarm < 0 ? 'EF' : 'ET';

  const p = 0.5 * (pSummer + pWinter);
  const summerShare = pSummer / Math.max(1e-6, pSummer + pWinter);
  const threshold = 20 * t + (summerShare >= 0.7 ? 280 : summerShare <= 0.3 ? 0 : 140);
  if (p < threshold) return (p < threshold / 2 ? 'BW' : 'BS') + (t >= 18 ? 'h' : 'k');

  const mS = pSummer / 12, mW = pWinter / 12;
  const sDry = mS * (1 - K.monthlySpread), sWet = mS * (1 + K.monthlySpread);
  const wDry = mW * (1 - K.monthlySpread), wWet = mW * (1 + K.monthlySpread);

  if (tCold >= 18) {
    const driest = Math.min(sDry, wDry);
    if (driest >= 60) return 'Af';
    if (driest >= 100 - p / 25) return 'Am';
    return 'Aw';
  }

  const group = tCold > K.temperateMinColdC ? 'C' : 'D';
  const precipLetter = sDry < 40 && sDry < wWet / 3 ? 's' : wDry < sWet / 10 ? 'w' : 'f';
  let heat: string;
  if (tWarm >= 22) heat = 'a';
  else if (monthsAbove10(t, tWarm, tCold) >= 4) heat = 'b';
  else heat = group === 'D' && tCold < -38 ? 'd' : 'c';
  return group + precipLetter + heat;
}

export function classifyKoppen(
  temp: Float32Array, tempWarm: Float32Array, tempCold: Float32Array,
  precipSummer: Float32Array, precipWinter: Float32Array,
): Uint8Array {
  const out = new Uint8Array(temp.length);
  for (let c = 0; c < temp.length; c++) {
    out[c] = INDEX.get(koppenCode(temp[c], tempWarm[c], tempCold[c], precipSummer[c], precipWinter[c]))!;
  }
  return out;
}
