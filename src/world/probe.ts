import { BIOME_NAMES, Biome } from '../gen/biomes';
import { SP_NAMES } from '../gen/special';
import { DEEP_LABEL } from '../gen/underworld';
import { KOPPEN_CLASSES } from '../gen/koppen';
import { CLIMATE } from '../gen/config';
import type { RasterWorld } from '../gen/world';

export interface ProbeInfo {
  /** The town or city under the cursor, with its layout (set by the map view). */
  place?: string;
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
  /** Land only: Old or New World, and when the Old World's spread reached it (shown with the Old & New World layer). */
  settledWorld: string;
  /** Fantasy worlds: the cavern of the Underworld below, if any (shown with the Underworld layer). */
  under?: string;
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

function settledWorld(w: RasterWorld, c: number): string {
  const r = w.spread.reach[c];
  const at = r > 0 ? `reached at ${Math.round(((r - 1) / 253) * 100)}% of the spread` : '';
  if (w.newWorld[c]) return r > 0 ? `New World (${at}, but its landmass went New)` : 'New World';
  if (w.spread.heartland < 0) return 'Old World';
  return r > 0 ? `Old World, ${at}` : 'Old World (not reached; its landmass went Old)';
}

/** The caverns of the Underworld under a point: their names, kinds and tiers. */
function underAt(w: RasterWorld, lon: number, lat: number): string {
  const out: string[] = [];
  for (const n of w.underworld?.nodes ?? []) {
    if (Math.abs(n.lat - lat) > 4) continue;
    // Point in the cavern's outline (longitudes unwrapped about the point).
    let inside = false;
    const ring = n.ring.map((p) => [p[0] + (p[0] - lon > 180 ? -360 : p[0] - lon < -180 ? 360 : 0), p[1]]);
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      if (ring[a][1] > lat !== ring[b][1] > lat && lon < ((ring[b][0] - ring[a][0]) * (lat - ring[a][1])) / (ring[b][1] - ring[a][1]) + ring[a][0]) inside = !inside;
    }
    if (inside) {
      const realm = n.realm !== undefined ? w.underworld?.realms?.[n.realm] : undefined;
      out.push(`${n.name} (${DEEP_LABEL[n.kind].toLowerCase()}, ${n.tier ? 'lower' : 'upper'} deep)${n.city ? `, the ${n.city.kind} of ${n.city.name}${realm ? ` in ${realm.name}` : ''}` : ''}${n.horror ? `, where ${n.horror} lurks` : ''}`);
    }
  }
  return out.join(' · ');
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
  // Special ground (gen/special.ts): ash, lava, glacier, mushroom forest, canyon, cliffs...
  const spv = w.special?.[c] ?? 0;
  if (spv && h > 0 && w.lakeDepth[c] <= 0) terrain = `${SP_NAMES[spv]} (${terrain.charAt(0).toLowerCase()}${terrain.slice(1)})`;
  // The nearest volcano within about 150 km.
  const v = w.vents;
  if (v && h > 0) {
    for (let k = 0; k < v.length; k += 4) {
      const dlo = ((((v[k] - wrapped) % 360) + 540) % 360) - 180;
      const d = Math.hypot(dlo * 111.2 * Math.cos((lat * Math.PI) / 180), (v[k + 1] - lat) * 111.2);
      if (d < 150) {
        terrain += ` · ${['extinct', 'dormant', 'active'][v[k + 3]]} volcano ${Math.round(d)} km away`;
        break;
      }
    }
  }
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
    settledWorld: h > 0 ? settledWorld(w, c) : '',
    ...(w.underworld ? { under: underAt(w, wrapped, lat) } : {}),
  };
}
