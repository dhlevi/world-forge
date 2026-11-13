/**
 * The weather over a year for a few climates (packages/core/src/weather/weather.ts): rain against
 * the climate's figures, how often it rains, snow, fog, thunder, wind, and that weather moves
 * downwind. npx tsx apps/game/scripts/weather-test.ts
 */
import { groundAt, lightAt, moonAt, sunAt, sunTimes, weatherAt, dayOfYear, type ClimatePoint } from '@worldforge/core/weather/weather';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};
const clock = { startDoy: 110 };
const seed = 12345;

const PLACES: [string, ClimatePoint][] = [
  ['Temperate oceanic (800 mm, westerlies)', { lon: 5, lat: 50, warm: 17, cold: 3, precipSummer: 750, precipWinter: 850, windU: 0.8, windV: 0.1 }],
  ['Continental (500 mm, cold winters)', { lon: 40, lat: 55, warm: 19, cold: -12, precipSummer: 650, precipWinter: 350, windU: 0.5, windV: 0 }],
  ['Desert (100 mm)', { lon: 20, lat: 25, warm: 34, cold: 15, precipSummer: 60, precipWinter: 140, windU: -0.6, windV: 0.2 }],
  ['Monsoon (2000 mm, wet summers)', { lon: 80, lat: 20, warm: 30, cold: 20, precipSummer: 3600, precipWinter: 400, windU: -0.3, windV: 0.5 }],
  ['Rainforest (2500 mm)', { lon: -60, lat: -2, warm: 27, cold: 26, precipSummer: 2600, precipWinter: 2400, windU: -0.7, windV: 0 }],
  ['Subarctic (400 mm)', { lon: 100, lat: 64, warm: 14, cold: -25, precipSummer: 500, precipWinter: 300, windU: 0.4, windV: 0 }],
];

for (const [name, c] of PLACES) {
  let rain = 0, rainH = 0, snowH = 0, fogH = 0, thunderH = 0, gale = 0, wind = 0, cloud = 0, tmin = 99, tmax = -99;
  const months: number[] = Array(12).fill(0);
  let snowDays = 0, maxSnow = 0, mudDays = 0;
  for (let h = 0; h < 24 * 365; h++) {
    const w = weatherAt(seed, c, clock, h);
    rain += w.rainMm;
    if (w.rainMm > 0.1) rainH++;
    if (w.kind === 'snow' || w.kind === 'heavy snow') snowH++;
    if (w.fog > 0.3) fogH++;
    if (w.thunder) thunderH++;
    if (w.windMs > 17) gale++;
    wind += w.windMs;
    cloud += w.cloud;
    tmin = Math.min(tmin, w.tempC);
    tmax = Math.max(tmax, w.tempC);
    months[Math.floor(dayOfYear(clock, h) / 30.42) % 12] += w.rainMm;
    if (h % 24 === 12) {
      const g = groundAt(seed, c, clock, h);
      if (g.snowCm >= 2) snowDays++;
      maxSnow = Math.max(maxSnow, g.snowCm);
      if (g.mud > 0.5) mudDays++;
    }
  }
  const want = (c.precipSummer + c.precipWinter) / 2;
  console.log(`\n== ${name}`);
  console.log(`  rain ${Math.round(rain)} mm (climate ${Math.round(want)}); raining ${(rainH / 87.6).toFixed(0)}% of hours; snowing ${snowH} h; snow on the ground ${snowDays} days (deepest ${maxSnow} cm); muddy ${mudDays} days`);
  console.log(`  temp ${tmin.toFixed(0)} to ${tmax.toFixed(0)} C; cloud ${(cloud / 87.6).toFixed(0)}%; wind ${(wind / 8760).toFixed(1)} m/s, gales ${gale} h; fog ${fogH} h; thunder ${thunderH} h`);
  console.log(`  by month (from the game's start): ${months.map((m) => Math.round(m)).join(' ')}`);
  ok(rain > want * 0.5 && rain < want * 1.6, `${name}: a year's rain within reach of the climate's`);
}

// Weather comes from upwind: a place 150 km downwind sees the same systems later.
{
  const a = PLACES[0][1], b = { ...a, lon: a.lon + 150 / (111.32 * Math.cos((a.lat * Math.PI) / 180)) };
  const sa: number[] = [], sb: number[] = [];
  for (let h = 0; h < 24 * 120; h++) {
    sa.push(weatherAt(seed, a, clock, h).front);
    sb.push(weatherAt(seed, b, clock, h).front);
  }
  let best = 0, bestLag = 0;
  for (let lag = -12; lag <= 24; lag++) {
    let s = 0;
    for (let h = 30; h < sa.length - 30; h++) s += sa[h] * sb[h + lag];
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  console.log(`\n  Fronts reach a place 150 km downwind about ${bestLag} hours later.`);
  ok(bestLag >= 2 && bestLag <= 12, 'weather moves downwind');
}

// Deterministic.
ok(JSON.stringify(weatherAt(seed, PLACES[1][1], clock, 1234)) === JSON.stringify(weatherAt(seed, PLACES[1][1], clock, 1234)), 'the same place and hour give the same weather');

// The sun.
const t50s = sunTimes(50, 172), t50w = sunTimes(50, 355), t70 = sunTimes(70, 172), t70w = sunTimes(70, 355), t0 = sunTimes(0, 80);
const fmt = (t: ReturnType<typeof sunTimes>) => ('polar' in t ? `polar ${t.polar}` : `${t.rise.toFixed(1)} to ${t.set.toFixed(1)}`);
console.log(`\n  Sun at 50 N: midsummer ${fmt(t50s)}, midwinter ${fmt(t50w)}; at 70 N: ${fmt(t70)} / ${fmt(t70w)}; equator ${fmt(t0)}`);
ok('rise' in t50s && t50s.set - t50s.rise > 15.5 && 'rise' in t50w && t50w.set - t50w.rise < 8.5, 'long summer days and short winter days at 50 N');
ok('polar' in t70 && t70.polar === 'day' && 'polar' in t70w && t70w.polar === 'night', 'polar day and night at 70 N');
const noon = sunAt(50, 172, 12), midnight = sunAt(50, 172, 0);
const m = moonAt(seed, 0);
console.log(`  Noon light ${noon.light.toFixed(2)}, midnight ${midnight.light.toFixed(2)} (${midnight.phase}); the moon at the start: ${m.name}`);
const w0 = weatherAt(seed, PLACES[0][1], clock, 0);
console.log(`  Light at midnight under ${Math.round(w0.cloud * 100)}% cloud: ${lightAt(midnight, m, w0, 0).toFixed(2)}; on snow under a full moon, clear: ${lightAt(midnight, { phase: 0.5, lit: 1, name: '' }, { ...w0, cloud: 0, fog: 0, rainMm: 0 }, 20).toFixed(2)}`);

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
if (failures) process.exitCode = 1;
