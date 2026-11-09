import { hashString, mulberry32, type Rng } from '../gen/rng';
import { Simplex3, fbm } from '../gen/noise';
import { hookTail } from '../keys/flavour';
import { Field, type LairMap, type LairSite, type Pt, annotate, blob, distSeg, empty, lairSize, wander } from './lair';

/**
 * A mountain pass where a road crosses a range: the trail climbs from one edge of the map by
 * switchbacks up a slope of scree to the saddle, then runs down the far side to the other edge,
 * between cliffs. A stream crosses it below the saddle on a rope bridge over a gorge or at a ford;
 * there is a waystation or a wayside shrine, a cairn on the saddle, and now and then a short tunnel
 * through a spur, a ruined watchtower on a knoll or a rockfall across the way. High passes lie
 * under snow. The trail runs the way the road runs on the map (`site.dir`), so the map lies true
 * over the ground.
 */

type PassFeat = 'up' | 'bends' | 'bridge' | 'ford' | 'waystation' | 'shrine' | 'saddle' | 'tunnel' | 'lookout' | 'rockfall' | 'down';

const PASS_KEY: Record<PassFeat, [string, string[], string[]?]> = {
  up: ['The way up', [
    'The road leaves the valley here and starts to climb; a worn milestone gives the distance to the far side in leagues.',
    'The track narrows to a mule path between boulders. Old horseshoes and a broken cartwheel lie by the way.',
  ], ['The road leaves the valley here and climbs into the snow; poles mark the line of the path where the drifts have buried it.']],
  bends: ['Switchbacks', [
    'The path doubles back on itself up a slope of loose scree, each bend shored up with a dry-stone wall.',
    'Tight bends climb the face of the slope; carts must be unloaded and their goods carried up by hand.',
  ], ['The bends climb an icy slope; steps have been hacked into the packed snow, and a rope is pegged along the worst of them.']],
  bridge: ['Rope bridge', [
    'A bridge of rope and planks hangs across a deep gorge; the river roars far below, and several planks are missing.',
    'The gorge is spanned by a swaying bridge of hide ropes, anchored to iron rings driven into the rock.',
  ]],
  ford: ['Ford', [
    'The stream runs fast and cold over the path; flat stones set in its bed make a ford, slippery with weed.',
    'A shallow ford of snowmelt, knee-deep in spring; a rope strung between two posts helps travellers across.',
  ]],
  waystation: ['Waystation', [
    'A low stone hut with a turf roof gives shelter to travellers; a fire pit, a woodpile and a bell to ring in fog.',
    'A walled waystation kept by an old couple who sell bread, beer and fodder at mountain prices.',
  ], ['A stone refuge half buried in snow, its door facing away from the wind; inside, dry wood and blankets left for the next traveller.']],
  shrine: ['Wayside shrine', [
    'A small shrine to the god of travellers, heaped with offerings of coins, ribbons and broken horseshoes.',
    'A carved stone shrine where travellers pray for a safe crossing; strings of prayer flags snap in the wind.',
  ]],
  saddle: ['The saddle', [
    'The top of the pass: a windy saddle between two peaks, marked by a great cairn to which every traveller adds a stone. The land beyond opens below.',
    'The highest point of the road, a narrow col between cliffs; on a clear day both valleys can be seen from here.',
  ], ['The saddle lies deep in snow, and the wind never stops; a cairn as tall as a man marks the top, crusted with ice.']],
  tunnel: ['Tunnel', [
    'Where a spur of rock blocks the way, the road runs through a tunnel cut by hand, dark and dripping, too low for a rider.',
    'An old tunnel bores through the spur, its walls marked with the chisels of those who cut it and the names of those who died doing so.',
  ]],
  lookout: ['Ruined watchtower', [
    'On a knoll above the road stand the walls of an old watchtower; from it a sentry could see anyone coming up the pass.',
    'A broken tower of grey stone guards the pass, its roof long gone; someone has been sheltering in its lower room.',
  ]],
  rockfall: ['Rockfall', [
    'A fall of boulders has swept across the road; a way has been picked through it, but the slope above still shifts.',
    'An avalanche chute crosses the path, a long scar of broken rock; travellers hurry across in silence.',
  ], ['An avalanche path crosses the road: a slope of piled snow and broken trees. Travellers cross one at a time, in silence.']],
  down: ['The way down', [
    'The road begins its long descent into the next valley; the air grows warmer with every bend.',
    'The path drops away toward the far valley, where smoke rises from a distant village.',
  ]],
};

const PASS_HOOKS = [
  'Merchants will not cross the pass since a caravan vanished on it; only their mules came down, without their loads.',
  'A toll-keeper has set himself up at the waystation, and claims the right of a lord who died a hundred years ago.',
  'Bandits hold the saddle and stop everyone who crosses; the lord of the valley will pay for their heads.',
  'Something large has been taking sheep from the high pastures, and its tracks lead up to the pass.',
  'The first snows have closed the pass early, and a messenger must cross before the road is shut for the winter.',
  'A courier carrying a sealed letter fell from the rope bridge; the letter, and whatever else he carried, lies in the gorge below.',
  'The monks of the shrine say the pass is haunted by a lost army that marched into a blizzard and never came out.',
  'Pilgrims climb to the saddle each year to add a stone to the cairn, but this year the cairn has been scattered.',
];

export function buildPass(site: LairSite): LairMap {
  const rnd = mulberry32(site.seed);
  const noise = new Simplex3(mulberry32(hashString(`pass#${site.seed}`)));
  const [W, H] = lairSize(site);
  const has = (t: string) => site.tags.includes(t);
  const snowy = has('snow');
  // The road's way across the map, through a saddle near the middle.
  const th = site.dir ?? rnd() * Math.PI * 2;
  const u: Pt = [Math.cos(th), Math.sin(th)], v: Pt = [-u[1], u[0]];
  const C: Pt = [W / 2 + (rnd() - 0.5) * W * 0.08, H / 2 + (rnd() - 0.5) * H * 0.08];
  const toEdge = (p: Pt, d: Pt): Pt => {
    // Where a ray from p leaves the map (3 m past the edge).
    let t = Infinity;
    if (d[0] > 1e-6) t = Math.min(t, (W - p[0]) / d[0]);
    if (d[0] < -1e-6) t = Math.min(t, -p[0] / d[0]);
    if (d[1] > 1e-6) t = Math.min(t, (H - p[1]) / d[1]);
    if (d[1] < -1e-6) t = Math.min(t, -p[1] / d[1]);
    return [p[0] + d[0] * (t + 3), p[1] + d[1] * (t + 3)];
  };
  const along = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const S: Pt = [C[0] + u[0] * W * 0.06, C[1] + u[1] * H * 0.06];
  const A = toEdge(S, [-u[0], -u[1]]), B = toEdge(S, u);
  // The climb: switchbacks across the slope, wider on bigger maps.
  const nz = has('small') ? 2 : has('large') ? 4 : 3;
  const amp = Math.min(W, H) * (0.16 + 0.06 * rnd());
  const climb: Pt[] = [A];
  const corners: Pt[] = [];
  const side = rnd() < 0.5 ? 1 : -1;
  for (let k = 1; k <= nz; k++) {
    const t = 0.12 + (0.8 * k) / (nz + 0.6);
    const s = (k % 2 ? 1 : -1) * side * amp * (0.8 + 0.35 * rnd());
    const p = along(A, S, t);
    const c: Pt = [p[0] + v[0] * s, p[1] + v[1] * s];
    climb.push(c);
    corners.push(c);
  }
  climb.push(S);
  const path: Pt[] = [];
  for (let k = 1; k < climb.length; k++) {
    const seg = wander(climb[k - 1], climb[k], rnd, 0.08, 2);
    path.push(...(k > 1 ? seg.slice(1) : seg));
  }
  // The descent: gentler, with a tunnel through a spur now and then.
  const tunnel = rnd() < 0.35;
  const descent = wander(S, B, rnd, tunnel ? 0.05 : 0.14, 3);
  const trail = [...path, ...descent.slice(1)];
  const tunnelSeg: Pt[] | null = tunnel ? [along(S, B, 0.3), along(S, B, 0.58)] : null;

  // Open ground: the trail's shelf, wider at the bends, a hollow at the saddle and a few ledges.
  const field = new Field(W, H, null);
  field.v.fill(-1);
  const corridor = (pts: Pt[], w: number, skip?: Pt[]) => {
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k];
      if (skip) {
        const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (distSeg(mid, skip[0], skip[1]) < 1.5) continue;
      }
      field.stamp(Math.min(a[0], b[0]) - w, Math.min(a[1], b[1]) - w, Math.max(a[0], b[0]) + w, Math.max(a[1], b[1]) + w, (x, y) => 1 - distSeg([x, y], a, b) / w);
    }
  };
  const round = (c: Pt, r: number) => field.stamp(c[0] - r, c[1] - r, c[0] + r, c[1] + r, (x, y) => 1 - Math.hypot(x - c[0], y - c[1]) / r);
  corridor(path, 3.4 + rnd());
  corridor(descent, 3.6 + rnd(), tunnelSeg ?? undefined);
  for (const c of corners) round(c, 5.5 + 2 * rnd());
  round(S, 9 + 4 * rnd());
  // The waystation's ledge beside a bend (or the saddle), and a knoll for the lookout.
  // On the outside of the middle bend (bends lie alternately either side of the line).
  const mi = Math.floor(corners.length / 2);
  const hutAt = corners.length > 1 ? corners[mi] : S;
  const out = corners.length > 1 ? ((mi + 1) % 2 ? 1 : -1) * side : side;
  const ledge: Pt = [hutAt[0] + v[0] * out * 7, hutAt[1] + v[1] * out * 7];
  round(ledge, 7.5 + 2 * rnd());
  const lookout = rnd() < 0.3;
  const knoll: Pt = [S[0] - v[0] * side * 15, S[1] - v[1] * side * 15];
  if (lookout) {
    round(knoll, 6.5);
    corridor(wander(S, knoll, rnd, 0.15, 2), 1.6);
  }
  // Rough the edges: broken rock and scree make the shelf's edge ragged.
  for (let j = 0; j < field.ny; j++) {
    for (let i = 0; i < field.nx; i++) {
      const n = j * field.nx + i;
      if (field.v[n] < -0.6) continue;
      const x = i * 0.75, y = j * 0.75;
      field.v[n] += 0.34 * fbm(noise, x / 7, y / 7, 0.3, 3) + 0.08 * noise.noise(x / 1.4, y / 1.4, 2.1);
    }
  }
  field.clean(40, 10);
  const open = (p: Pt) => field.at(p) > 0;
  const onEdge = (p: Pt) => p[0] < 0.05 || p[1] < 0.05 || p[0] > W - 0.05 || p[1] > H - 0.05;
  const m: LairMap = { ...empty(site, W, H), outlines: field.contours(), open, onEdge, trail, tunnels: tunnelSeg ? [tunnelSeg] : [], bridges: [], fords: [], snow: [], cairns: [] };
  m.levels = [m];
  const inward = (p: Pt, q: Pt) => Math.atan2(q[1] - p[1], q[0] - p[0]);
  m.mouths = [
    { p: [Math.max(0, Math.min(W, A[0])), Math.max(0, Math.min(H, A[1]))], dir: inward(A, path[Math.min(3, path.length - 1)]) },
    { p: [Math.max(0, Math.min(W, B[0])), Math.max(0, Math.min(H, B[1]))], dir: inward(B, descent[Math.max(0, descent.length - 4)]) },
  ];

  // The stream: off the heights across the climb, crossing the trail once below the saddle.
  const cross = along(A, S, 0.3 + 0.15 * rnd());
  const s0 = toEdge(cross, v), s1 = toEdge(cross, [-v[0], -v[1]]);
  const stream = wander(s0, s1, rnd, 0.12, 3);
  m.stream = { pts: stream, w: 0.9 + 0.5 * rnd() };
  // Where it meets the trail: a rope bridge over a gorge, or a ford.
  let hit: Pt | null = null, hk = 0;
  for (let k = 1; k < path.length && !hit; k++) {
    for (let q = 1; q < stream.length; q++) {
      const x = segX(path[k - 1], path[k], stream[q - 1], stream[q]);
      if (x) {
        hit = x;
        hk = k;
        break;
      }
    }
  }
  const gorge = rnd() < 0.55;
  if (hit) {
    const a = path[hk - 1], b = path[hk], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const d: Pt = [(b[0] - a[0]) / l, (b[1] - a[1]) / l], half = gorge ? 4.2 : 1.6;
    if (gorge) m.bridges!.push({ a: [hit[0] - d[0] * half, hit[1] - d[1] * half], b: [hit[0] + d[0] * half, hit[1] + d[1] * half], rope: true });
    else m.fords!.push(hit);
  }

  // Scree at the foot of the cliffs, boulders, and snow on high passes.
  const busy = (p: Pt, r: number) => trail.some((q, k) => k > 0 && distSeg(p, trail[k - 1], q) < r);
  for (let t = 0; t < (W * H) / 14; t++) {
    const p: Pt = [rnd() * W, rnd() * H];
    const f = field.at(p);
    if (f <= 0.04 || busy(p, 2.2)) continue;
    if (f < 0.3 && rnd() < 0.5) {
      for (let q = 0; q < 2 + Math.floor(rnd() * 4); q++) m.dots.push({ p: [p[0] + (rnd() - 0.5) * 2, p[1] + (rnd() - 0.5) * 2], r: 0.1 + 0.2 * rnd() });
    } else if (rnd() < 0.05) m.rocks.push(blob(p, 0.5 + 1.1 * rnd() ** 2, rnd, 6 + Math.floor(rnd() * 3)));
  }
  m.dots = m.dots.filter((d) => field.at(d.p) > 0.03 && !busy(d.p, 1.6));
  if (snowy) {
    for (let t = 0; t < 10 + Math.floor(rnd() * 8); t++) {
      const p: Pt = [rnd() * W, rnd() * H];
      m.snow!.push(blob(p, 5 + 10 * rnd(), rnd, 11, 0.45));
    }
  }
  // A rockfall across the way, on the climb.
  const rockfall = rnd() < 0.4 && corners.length > 1;
  let fallAt: Pt | null = null;
  if (rockfall) {
    fallAt = along(corners[0], corners[1], 0.5);
    for (let q = 0; q < 26; q++) {
      const p: Pt = [fallAt[0] + (rnd() - 0.5) * 9, fallAt[1] + (rnd() - 0.5) * 9];
      if (busy(p, 1.1)) continue;
      if (q % 3 === 0) m.rocks.push(blob(p, 0.4 + 0.7 * rnd(), rnd, 6));
      else m.dots.push({ p, r: 0.12 + 0.2 * rnd() });
    }
  }
  // The cairn on the saddle, the waystation or shrine, and the lookout's walls.
  const cairn: Pt = [S[0] + v[0] * side * 3.5, S[1] + v[1] * side * 3.5];
  m.cairns!.push(cairn);
  const shrine = rnd() < 0.4;
  if (shrine) m.things.push({ kind: 'shrine', p: ledge, a: th, w: 2.4, h: 1.8 });
  else {
    m.things.push({ kind: 'hut', p: ledge, a: th + Math.PI / 2, w: 6, h: 4.5 });
    if (rnd() < 0.6) m.camp = { fire: [ledge[0] + u[0] * 4.5, ledge[1] + u[1] * 4.5], tents: [] };
  }
  if (lookout) {
    const s = 2.6, c = knoll;
    const q: Pt[] = [[c[0] - s, c[1] - s], [c[0] + s, c[1] - s], [c[0] + s, c[1] + s], [c[0] - s, c[1] + s]];
    for (let k = 0; k < 4; k++) if (k !== 2 || rnd() < 0.4) m.ruins.push([q[k], q[(k + 1) % 4]]);
  }

  // The key, from the way up to the way down.
  const pick = (f: PassFeat) => {
    const [name, texts, snowTexts] = PASS_KEY[f];
    const list = snowy && snowTexts ? snowTexts : texts;
    return { name, text: list[Math.floor(rnd() * list.length)] };
  };
  const place = (f: PassFeat, p: Pt) => {
    // The number sits on open ground beside the place, off the trail where it can.
    let lp = p;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, r = 2.5 + (k % 2) * 1.5;
      const c: Pt = [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r];
      if (field.at(c) > 0.15 && !busy(c, 1.2) && c[0] > 2 && c[1] > 2 && c[0] < W - 2 && c[1] < H - 2) {
        lp = c;
        break;
      }
    }
    m.rooms.push({ n: m.rooms.length + 1, p: lp, ...pick(f) });
  };
  place('up', along(A, path[Math.min(4, path.length - 1)], 0.5));
  if (corners.length) place('bends', corners[0]);
  if (hit) place(gorge ? 'bridge' : 'ford', hit);
  if (fallAt) place('rockfall', fallAt);
  place(shrine ? 'shrine' : 'waystation', ledge);
  place('saddle', S);
  if (lookout) place('lookout', knoll);
  if (tunnelSeg) place('tunnel', along(tunnelSeg[0], tunnelSeg[1], 0.5));
  place('down', along(B, descent[Math.max(0, descent.length - 4)], 0.5));
  m.hook = PASS_HOOKS[Math.floor(rnd() * PASS_HOOKS.length)];
  const frnd: Rng = mulberry32(site.seed ^ 0xf1a);
  m.hook = [m.hook, hookTail(frnd)].filter(Boolean).join(' ');
  annotate(m.levels, 'pass', frnd);
  return m;
}

/** Where segments ab and cd cross, if they do. */
function segX(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r: Pt = [b[0] - a[0], b[1] - a[1]], s: Pt = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, w = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && w >= 0 && w <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
}
