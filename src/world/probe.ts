import { BIOME_NAMES, Biome } from '../gen/biomes';
import { KOPPEN_CLASSES } from '../gen/koppen';
import { CLIMATE } from '../gen/config';
import type { RasterWorld } from '../gen/world';

export interface ProbeInfo {
  lon: number;
  lat: number;
  elevation: number;
  temperature: number;
  precipitation: number;
  terrain: string;
  plate: number;
  wind: string;
  /** Ocean cells only. */
  current: string;
  /** Land cells only. */
  climate: string;
  tempWarm: number;
  tempCold: number;
  /** Share of annual precipitation falling in the local summer half-year, 0..1. */
  summerRainShare: number;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function describeWind(u: number, v: number): string {
  const speed = Math.hypot(u, v);
  if (speed < 0.1) return 'Calm';
  // Winds are named for the direction they blow from.
  const from = (Math.atan2(-u, -v) * 180) / Math.PI;
  const dir = COMPASS[Math.round((((from % 360) + 360) % 360) / 45) % 8];
  return `${speed < 0.4 ? 'Light' : speed < 0.75 ? 'Moderate' : 'Steady'} from ${dir}`;
}

function describeCurrent(u: number, v: number, anomaly: number): string {
  const speed = Math.hypot(u, v);
  const temp = anomaly > 1 ? 'warm' : anomaly < -1 ? 'cold' : 'mild';
  const sign = anomaly >= 0 ? '+' : '';
  if (speed < 0.1) return `slack, ${temp} (${sign}${anomaly.toFixed(1)} °C)`;
  // Currents are named for the direction they flow toward.
  const to = (Math.atan2(u, v) * 180) / Math.PI;
  const dir = COMPASS[Math.round((((to % 360) + 360) % 360) / 45) % 8];
  return `${temp}, flowing ${dir} (${sign}${anomaly.toFixed(1)} °C)`;
}

export function probeWorld(w: RasterWorld, lon: number, lat: number): ProbeInfo | null {
  if (lat < -90 || lat > 90) return null;
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  const i = Math.min(w.W - 1, Math.floor(((wrapped + 180) / 360) * w.W));
  const j = Math.min(w.H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * w.H)));
  const c = j * w.W + i;
  const h = w.height[c];
  let terrain: string;
  if (h <= 0) terrain = h > -200 ? 'Shallow sea' : 'Ocean';
  else if (w.lakeDepth[c] > 0) terrain = 'Lake';
  else terrain = BIOME_NAMES[w.biome[c] as Biome];
  return {
    lon: wrapped,
    lat,
    elevation: h,
    temperature: w.tempSea[c] - (CLIMATE.lapseRateCPerKm * Math.max(0, h)) / 1000,
    precipitation: w.precip[c],
    terrain,
    plate: w.plate[c],
    wind: describeWind(w.windU[c], w.windV[c]),
    current: h <= 0 ? describeCurrent(w.currentU[c], w.currentV[c], w.tempAnomaly[c]) : '',
    climate: h > 0 ? `${KOPPEN_CLASSES[w.koppen[c]].code} · ${KOPPEN_CLASSES[w.koppen[c]].name}` : '',
    tempWarm: w.tempWarm[c],
    tempCold: w.tempCold[c],
    summerRainShare: w.precipSummer[c] / Math.max(1e-6, w.precipSummer[c] + w.precipWinter[c]),
  };
}
