<script setup lang="ts">
/**
 * The sky as a picture: the sun (by night the moon, in its phase) on its way across between rising
 * and setting, the cloud and what falls from it, fog and lightning, over ground in the season's
 * colour; beneath it the clock, the wind as an arrow and the air's temperature. The same in words
 * (game/weather.ts) is its tooltip.
 */
import { computed } from 'vue';
import type { SkyPicture } from '../game/weather';

const props = defineProps<{ sky: SkyPicture; clock: string; words: { when: string; wind: string; air: string; sun: string } | null }>();

type RGB = [number, number, number];
const W = 272, H = 78, HORIZON = 60;
/** The sun's way: from (X0, HORIZON) up by RISE and down to (X1, HORIZON). */
const X0 = 30, X1 = 242, RISE = 44;
const ARC = `M${X0},${HORIZON} Q${(X0 + X1) / 2},${HORIZON - 2 * RISE} ${X1},${HORIZON}`;
const GROUND = `M0,${HORIZON + 1} C50,${HORIZON - 4} 90,${HORIZON + 3} 136,${HORIZON} S230,${HORIZON - 4} ${W},${HORIZON + 1} V${H} H0 Z`;
const STARS = Array.from({ length: 18 }, (_, i) => [(i * 53 + 17) % 260 + 6, (i * 29 + 7) % 40 + 4, i % 4 === 0 ? 0.9 : 0.6]);
/** Where clouds go, the first few for a little cloud and all for an overcast sky: x, y, size. */
const CLOUDS = [[196, 18, 1.15], [78, 22, 1], [136, 13, 1.1], [238, 27, 0.85], [34, 15, 0.9], [168, 27, 0.95]];
const SEASON: Record<SkyPicture['season'], RGB> = { spring: [92, 128, 66], summer: [80, 116, 56], autumn: [132, 108, 58], winter: [106, 104, 84] };
/** The sky's colours, overhead and at the horizon, clear and under cloud. */
const AIR = {
  day: [[72, 134, 204], [170, 210, 238], [112, 121, 134], [168, 175, 184]],
  dusk: [[62, 66, 118], [238, 152, 96], [72, 74, 96], [150, 132, 130]],
  night: [[8, 12, 30], [28, 38, 72], [16, 18, 26], [36, 40, 52]],
} as Record<string, RGB[]>;
/** Streaks or flakes drawn, by what falls. */
const FALLS: Record<SkyPicture['kind'], number> = { none: 0, drizzle: 9, rain: 16, 'heavy rain': 26, sleet: 16, snow: 14, 'heavy snow': 26 };
const DASH: Partial<Record<SkyPicture['kind'], string>> = { drizzle: '2 12', 'heavy rain': '8 6' };

const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;
const css = (c: RGB) => `rgb(${c.join(',')})`;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
/** A point of the sun's way, 0 rising to 1 setting (below the horizon beyond those). */
const along = (f: number) => ({ x: X0 + (X1 - X0) * f, y: HORIZON - RISE * 4 * f * (1 - f) });

/** The lit part of a moon of radius r (0 new, 0.5 full), and whether it wanes (lit on the left). */
function moonShape(phase: number, r: number): { d: string; flip: boolean } {
  const q = phase > 0.5 ? 1 - phase : phase;
  const rx = Math.abs(Math.cos(2 * Math.PI * q)) * r;
  return { d: `M0,${-r} A${r},${r} 0 0,1 0,${r} A${rx.toFixed(2)},${r} 0 0,${q > 0.25 ? 1 : 0} 0,${-r} Z`, flip: phase > 0.5 };
}

const v = computed(() => {
  const s = props.sky, day = s.set - s.rise, dark = s.phase === 'night' ? 1 : s.phase === 'day' ? 0 : 0.5;
  const up = day > 0 && s.hod >= s.rise && s.hod < s.set;
  const grey = clamp01((s.cloud - 0.3) / 0.55), wet = s.kind !== 'none';
  // The sun, shown a little past the ends of its way (sinking behind the ground at dawn and dusk).
  const fs = day > 0 ? (s.hod - s.rise) / day : -1;
  const low = up ? clamp01(1 - Math.min(s.hod - s.rise, s.set - s.hod)) : 0;
  const sun = fs > -0.1 && fs < 1.1 ? { ...along(fs), colour: css(mix([255, 218, 96], [255, 150, 70], Math.max(low, up ? 0 : 1))), opacity: 1 - grey * 0.6 } : null;
  // The moon crosses by night as the sun does by day.
  const moon = !up && day < 24 ? { ...along(((((s.hod - s.set) % 24) + 24) % 24) / (24 - day)), ...moonShape(s.moon, 6), opacity: 1 - s.cloud * 0.8 } : null;

  const twilight = dark === 0.5 ? 1 : low * 0.6;
  const air = (i: number) => (dark === 1 ? mix(AIR.night[i], AIR.night[i + 2], grey) : mix(mix(AIR.day[i], AIR.day[i + 2], grey), mix(AIR.dusk[i], AIR.dusk[i + 2], grey), twilight));
  const earth = mix(s.snow ? [224, 231, 238] : SEASON[s.season], [10, 14, 26], dark * 0.66 + grey * 0.1);

  const lots = s.cloud < 0.15 ? 0 : s.cloud < 0.3 ? 1 : s.cloud < 0.45 ? 2 : s.cloud < 0.6 ? 3 : s.cloud < 0.8 ? 4 : 6;
  const heavy = s.kind.startsWith('heavy') || s.thunder;
  const cloud = css(mix(wet ? (heavy ? [104, 110, 122] : [150, 156, 168]) : mix([244, 246, 249], [196, 201, 210], grey), [20, 24, 38], dark * 0.62));

  // What falls leans with the wind (from the west: to the right).
  const lean = -Math.sin((s.windFrom * Math.PI) / 180) * Math.min(1, s.windMs / 12) * 12;
  const n = FALLS[s.kind];
  const drops = Array.from({ length: n }, (_, i) => {
    const snow = s.kind.includes('snow') || (s.kind === 'sleet' && i % 2 === 0);
    const x = 12 + ((i + 0.5) * 248) / n + ((i * 37) % 7) - 3;
    return { snow, x1: x, y1: 18 + ((i * 13) % 8), x2: x + lean * (snow ? 1.5 : 1), y2: HORIZON + 4, delay: `${(-((i * 0.37) % 1) * (snow ? 3 : 0.5)).toFixed(2)}s` };
  });

  return {
    top: css(air(0)), low: css(air(1)), ground: css(earth), label: earth[0] + earth[1] + earth[2] > 420 ? '#2a3140' : 'rgba(255,255,255,0.78)',
    stars: clamp01(dark === 1 ? 1 - s.cloud : dark * 0.5 - s.cloud), sun, moon,
    clouds: CLOUDS.slice(0, wet ? Math.max(4, lots) : lots), cloud, veil: s.cloud >= 0.8, drops, dash: DASH[s.kind] ?? '5 9',
    times: day > 0 && day < 24 ? [hhmm(s.rise), hhmm(s.set)] : null,
    // The arrow points where the wind blows to; a feather more as it strengthens.
    feathers: s.windMs < 0.5 ? 0 : s.windMs < 3.3 ? 1 : s.windMs < 8 ? 2 : s.windMs < 13.9 ? 3 : 4,
  };
});

const tip = computed(() => (props.words ? [props.words.when, props.words.wind, props.words.air, props.words.sun].join('\n') : ''));
</script>

<template>
  <div class="sky" :title="tip">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="tip" :style="{ background: `linear-gradient(${v.top}, ${v.low} 78%)` }">
      <defs>
        <g id="sky-cloud">
          <ellipse cx="0" cy="4" rx="22" ry="6" />
          <circle cx="-9" cy="0" r="7" />
          <circle cx="2" cy="-4" r="9" />
          <circle cx="12" cy="1" r="6" />
        </g>
      </defs>
      <g v-if="v.stars > 0" :opacity="v.stars" fill="#fff">
        <circle v-for="(p, i) in STARS" :key="i" :cx="p[0]" :cy="p[1]" :r="p[2]" />
      </g>
      <path class="way" :d="ARC" />
      <g v-if="v.moon" :transform="`translate(${v.moon.x} ${v.moon.y})`" :opacity="v.moon.opacity">
        <circle r="6" fill="#3a4360" />
        <path :d="v.moon.d" fill="#f1ecd2" :transform="v.moon.flip ? 'scale(-1 1)' : undefined" />
      </g>
      <g v-if="v.sun" :transform="`translate(${v.sun.x} ${v.sun.y})`" :fill="v.sun.colour" :opacity="v.sun.opacity">
        <circle r="13" opacity="0.22" />
        <circle r="7" />
      </g>
      <polygon v-if="sky.thunder" class="bolt" points="152,22 144,38 150,38 143,56 158,34 151,34 157,22" />
      <use v-for="(c, i) in v.clouds" :key="i" href="#sky-cloud" :transform="`translate(${c[0]} ${c[1]}) scale(${c[2]})`" :fill="v.cloud" />
      <rect v-if="v.veil" :width="W" height="20" :fill="v.cloud" opacity="0.45" />
      <line
        v-for="(d, i) in v.drops"
        :key="i"
        :class="d.snow ? 'flake' : 'drop'"
        :x1="d.x1"
        :y1="d.y1"
        :x2="d.x2"
        :y2="d.y2"
        :stroke-dasharray="d.snow ? '0.1 11.9' : v.dash"
        :style="{ animationDelay: d.delay }"
      />
      <path :d="GROUND" :fill="v.ground" />
      <g v-if="sky.fog > 0.2" class="fog" :opacity="Math.min(0.8, sky.fog)">
        <rect :width="W" :height="H" opacity="0.35" />
        <ellipse cx="80" cy="46" rx="110" ry="6" />
        <ellipse cx="200" cy="54" rx="120" ry="7" />
        <ellipse cx="60" cy="60" rx="90" ry="5" />
      </g>
      <template v-if="v.times">
        <text class="hour" :x="X0" :y="H - 5" :fill="v.label">{{ v.times[0] }}</text>
        <text class="hour" :x="X1" :y="H - 5" :fill="v.label">{{ v.times[1] }}</text>
      </template>
      <!-- Indoors: the sky through a window. -->
      <g v-if="sky.inside" class="window">
        <rect x="2" y="2" :width="W - 4" :height="H - 4" />
        <line :x1="W / 2" y1="0" :x2="W / 2" :y2="H" />
        <line x1="0" :y1="H / 2" :x2="W" :y2="H / 2" />
      </g>
    </svg>
    <div class="readout">
      <span>{{ clock }}</span>
      <span class="grow" />
      <svg v-if="!sky.inside" class="wind" viewBox="-10 -10 20 20" aria-hidden="true">
        <circle v-if="!v.feathers" r="2.5" />
        <g v-else :transform="`rotate(${sky.windFrom + 90})`">
          <path d="M-7,0 H4 M7,0 L2,-3 V3 Z" />
          <path v-for="n in v.feathers - 1" :key="n" :d="`M${-9.5 + n * 2.5},0 l-2.5,-3.5`" />
        </g>
      </svg>
      <span>{{ sky.tempC }}°C</span>
      <span v-if="sky.feltC !== undefined" class="dim">feels {{ sky.feltC }}°</span>
    </div>
  </div>
</template>

<style scoped>
.sky { display: flex; flex-direction: column; gap: 6px; }
.sky > svg { display: block; width: 100%; border: 1px solid var(--line); border-radius: 6px; }
.way { fill: none; stroke: rgba(255, 255, 255, 0.4); stroke-dasharray: 0.1 5; stroke-linecap: round; stroke-width: 1.2; }
.drop { stroke: rgba(196, 220, 244, 0.85); stroke-width: 1; animation: fall 0.5s linear infinite; }
.flake { stroke: #fff; stroke-width: 2; stroke-linecap: round; animation: drift 3s linear infinite; }
.bolt { fill: #ffe37a; animation: flash 4s steps(1) infinite; }
.fog { fill: #e6e9ee; }
.fog ellipse { filter: blur(3px); }
.hour { font-size: 9px; text-anchor: middle; font-variant-numeric: tabular-nums; }
.window { fill: none; stroke: #3b2c1f; stroke-width: 4; }
.window line { stroke-width: 3; }
.readout { display: flex; align-items: center; gap: 6px; font-size: 0.92em; font-variant-numeric: tabular-nums; }
.wind { width: 22px; height: 22px; fill: none; stroke: var(--text); stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
/* Each streak is one line, dashed; the dashes run down it. */
@keyframes fall { to { stroke-dashoffset: -14; } }
@keyframes drift { to { stroke-dashoffset: -12; } }
@keyframes flash { 0%, 100% { opacity: 0; } 90% { opacity: 1; } 92% { opacity: 0.15; } 94% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .drop, .flake { animation: none; }
  .bolt { animation: none; }
}
</style>
