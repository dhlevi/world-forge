import { hashString, mulberry32, type Rng } from '../gen/rng';
import { Simplex3, fbm } from '../gen/noise';
import { hookTail } from '../keys/flavour';
import { type DeepWay, Field, type LairMap, type LairSite, type Pt, annotate, blob, distSeg, empty, inLoops, lairSize, wander } from './lair';

/**
 * The heart of a cavern of the Underworld, drawn as a cave map on a larger scale: a great hall of
 * rock of several lobes, with tunnels running off the map toward the caverns it joins and shafts up
 * to the surface or down to the lower deep. What fills it follows its kind: a lake with an island,
 * the shore of a sunless sea, a river of lava under stone bridges, a forest of giant fungi, the
 * streets of a fallen city, a pillared dwarven hall, or a chasm or abyss crossed by a bridge.
 */

type Feat = [string, string[]];

const DEEP_KEY: Record<string, Feat[]> = {
  cavern: [
    ['The heart of the cavern', ['The roof is lost in darkness; a dropped stone takes a long time to find the floor. Columns as thick as towers hold up the dark.', 'A cavern so vast that a lantern lights only a small island of it; the echo of a footstep comes back long after.']],
    ['Stalagmite forest', ['A forest of stone teeth, some taller than a house, slick with dripping water.', 'Rows of pale stalagmites stand like an army frozen in place.']],
    ['Crystal grotto', ['Clusters of crystal as long as spears catch the lamplight and throw it back in a hundred colours.', 'The walls glitter with crystal; some of it hums faintly when touched.']],
  ],
  fungal: [
    ['Fungal forest', ['Mushrooms as tall as trees glow blue and violet in the dark; the air is warm and thick with spores.', 'A forest of pale fungi whose caps shed a soft light; things move between the stalks.']],
    ['Spore meadow', ['A meadow of small glowing caps; walking through it raises clouds of spores that taste of honey and rot.', 'Puffballs the size of barrels burst in clouds of yellow dust at the slightest touch.']],
    ['Glowing pool', ['A still pool lit from beneath by luminous moss; blind white fish circle in it.', 'Water seeps into a pool ringed with glowing caps, the only light for a long way.']],
  ],
  lake: [
    ['Lake shore', ['Black water stretches away beyond the light; the shore is a beach of fine grey sand.', 'The lake is so still that its surface seems solid; a coracle lies drawn up on the shore.']],
    ['The island', ['An island of rock in the middle of the lake, with a ring of carved stones on its top.', 'A low island where something has built a nest of bones and driftwood from the world above.']],
    ['The landing', ['A crude stone jetty where a ferryman once kept a boat; a bell hangs from a post to call him.', 'Steps cut into the rock lead down into the water and go on below it.']],
  ],
  sea: [
    ['The landing', ['A harbour of carved stone on the shore of the sunless sea; boats of hide and bone are tied up here.', 'A jetty of black stone runs out into the water; lanterns of glowing fungus mark its end.']],
    ['The sunless sea', ['Waves without wind lap the shore of a sea that goes on beyond any light; something large surfaces, far out, and is gone.', 'The water stretches away into the dark; the far shore is days away by boat, if it exists.']],
    ['Tidepools', ['Pools among the rocks where pale crabs and eyeless things scuttle.', 'The rocks at the water’s edge are crusted with glowing shells.']],
  ],
  rift: [
    ['The lava river', ['A river of molten rock crawls through the cavern, lighting it red; the heat is like a forge.', 'Lava wells up from a crack and runs in a slow, glowing channel; the air shimmers and stinks of sulphur.']],
    ['The stone bridge', ['A bridge of black stone arches over the lava, its rail long fallen; the stone is hot underfoot.', 'An ancient bridge, carved with figures worn smooth by the heat, crosses the burning river.']],
    ['The forge', ['Someone has built a forge where the lava runs close: anvils, tongs and half-finished blades.', 'A ring of fire-blackened stones where the deep folk work metal in the lava’s heat.']],
  ],
  ruins: [
    ['The broken street', ['A street of the fallen city, paved in black stone and lined with roofless houses.', 'Houses carved from the rock line the street, their doors staring like empty eyes.']],
    ['The temple', ['A stepped temple rises in the middle of the city; its top is lost in the dark.', 'The great temple of the fallen people, its altar still stained and its idols faceless.']],
    ['The palace', ['A palace of many columns, half collapsed; a throne of carved stone stands in its hall.', 'The palace of the city’s rulers, its walls painted with scenes of a people no one remembers.']],
  ],
  hall: [
    ['The great hall', ['A hall carved straight and true from the living rock, its roof held up by rows of square pillars as wide as houses.', 'The dwarven hall: pillars carved with the faces of kings, a floor of polished stone, and silence.']],
    ['The throne', ['A throne cut from a single block of stone, at the head of the hall, beneath a carved crown.', 'A high seat for the lord of the hall, flanked by statues of armoured guards.']],
    ['The deep gate', ['A gate of iron and stone where the deep road enters the hall, wide enough for two wagons.', 'The great doors of the hall stand half open; runes of warding are carved above them.']],
  ],
  chasm: [
    ['The edge', ['The floor ends at a chasm too deep for any light to reach the bottom; a cold wind rises from it.', 'A crack in the world splits the cavern in two; stones dropped into it are never heard to land.']],
    ['The bridge', ['A narrow bridge of rope and planks spans the chasm, swaying in the wind from below.', 'A natural arch of rock, no wider than a man, crosses the chasm.']],
  ],
  abyss: [
    ['The edge of the abyss', ['The floor falls away into an abyss whose far side cannot be seen; sounds rise from it, almost like voices.', 'A pit so wide and deep that the dark in it seems solid; ledges and stairs wind down its sides.']],
    ['The bridge', ['A long bridge of carved stone leaps across the abyss to a pillar of rock in its middle, and on beyond.', 'A bridge of chains and iron plates crosses the pit, groaning under any weight.']],
  ],
};

const MOUTH_TEXT = [
  'A tunnel leaves the cavern here, toward {0}; its floor is worn smooth by long use.',
  'The way on to {0}: a passage of black rock, cold air blowing out of it.',
  'A tunnel toward {0}, marked by a cairn of stones and a scratched sign in an unknown script.',
];

const DEEP_HOOKS = [
  'The deep folk of the cavern have stopped coming up to trade at the delve gate, and the last party sent down to find out why has not returned.',
  'A map scratched on a flake of slate shows a way through this cavern to a city that the dwarves swear never existed.',
  'Something is coming up the shafts from the lower deep at night, and the cavern’s people are fleeing toward the surface.',
  'A prospector came back from the cavern with a sack of glowing crystal and a fever; he will lead anyone there for a share.',
  'An exiled prince of the deep folk hides in the cavern and seeks surface allies to win back his throne.',
  'The great shaft has begun to breathe: warm air rushes up it, then down, every hour, like something sleeping below.',
];

export function buildDeep(site: LairSite): LairMap {
  const rnd = mulberry32(site.seed);
  const noise = new Simplex3(mulberry32(hashString(`deep#${site.seed}`)));
  const [W, H] = lairSize(site);
  const info = site.deep ?? { kind: 'cavern', tier: 0 as const, exits: [] };
  const kind = info.kind;
  // Lobes: a great central hall and others round it.
  const C: Pt = [W / 2 + (rnd() - 0.5) * 10, H / 2 + (rnd() - 0.5) * 8];
  const lobes: { c: Pt; r: number }[] = [{ c: C, r: Math.min(W, H) * (0.3 + 0.05 * rnd()) }];
  for (let t = 0; t < 200 && lobes.length < 5 + Math.floor(rnd() * 3); t++) {
    const r = Math.min(W, H) * (0.12 + 0.1 * rnd());
    const a = rnd() * Math.PI * 2, d = lobes[0].r * (0.7 + 0.5 * rnd());
    const c: Pt = [C[0] + Math.cos(a) * d * 1.3, C[1] + Math.sin(a) * d];
    if (c[0] < r + 3 || c[1] < r + 3 || c[0] > W - r - 3 || c[1] > H - r - 3) continue;
    lobes.push({ c, r });
  }
  // Tunnels out to the edges, one for each place the cavern leads (at most five).
  const exits = info.exits.slice(0, 5);
  const mouths: { p: Pt; dir: number; to: DeepWay }[] = [];
  const tunnels: { pts: Pt[]; w: number }[] = [];
  const a0 = rnd() * Math.PI * 2;
  exits.forEach((to, k) => {
    const a = a0 + (k / Math.max(1, exits.length)) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
    const d: Pt = [Math.cos(a), Math.sin(a)];
    let t = Infinity;
    if (d[0] > 1e-6) t = Math.min(t, (W - C[0]) / d[0]);
    if (d[0] < -1e-6) t = Math.min(t, -C[0] / d[0]);
    if (d[1] > 1e-6) t = Math.min(t, (H - C[1]) / d[1]);
    if (d[1] < -1e-6) t = Math.min(t, -C[1] / d[1]);
    const out: Pt = [C[0] + d[0] * (t + 3), C[1] + d[1] * (t + 3)];
    tunnels.push({ pts: wander(C, out, rnd, 0.12, 3), w: 2.4 + 1.4 * rnd() });
    mouths.push({ p: [Math.max(0, Math.min(W, out[0])), Math.max(0, Math.min(H, out[1]))], dir: a + Math.PI, to });
  });
  const hall = kind === 'hall';
  const field = new Field(W, H, null);
  field.v.fill(-1);
  for (const l of lobes) field.stamp(l.c[0] - l.r, l.c[1] - l.r, l.c[0] + l.r, l.c[1] + l.r, (x, y) => 1 - Math.hypot(x - l.c[0], y - l.c[1]) / l.r);
  for (const t of tunnels) {
    for (let q = 1; q < t.pts.length; q++) {
      const a = t.pts[q - 1], b = t.pts[q];
      field.stamp(Math.min(a[0], b[0]) - t.w, Math.min(a[1], b[1]) - t.w, Math.max(a[0], b[0]) + t.w, Math.max(a[1], b[1]) + t.w, (x, y) => 1 - distSeg([x, y], a, b) / t.w);
    }
  }
  // A dwarven hall is cut square: a long pillared hall across the middle.
  const hallBox = hall ? { x0: W * 0.2, x1: W * 0.8, y0: C[1] - H * 0.17, y1: C[1] + H * 0.17 } : null;
  if (hallBox) field.stamp(hallBox.x0, hallBox.y0, hallBox.x1, hallBox.y1, () => 1);
  for (let j = 0; j < field.ny; j++) {
    for (let i = 0; i < field.nx; i++) {
      const n = j * field.nx + i;
      if (field.v[n] < -0.6) continue;
      const x = i * 0.75, y = j * 0.75;
      if (hallBox && x > hallBox.x0 + 1 && x < hallBox.x1 - 1 && y > hallBox.y0 + 1 && y < hallBox.y1 - 1) continue;
      field.v[n] += 0.32 * fbm(noise, x / 10, y / 10, 0.4, 3) + 0.08 * noise.noise(x / 1.8, y / 1.8, 4.1);
    }
  }
  field.clean(60, 20);
  const open = (p: Pt) => field.at(p) > 0;
  const onEdge = (p: Pt) => p[0] < 0.05 || p[1] < 0.05 || p[0] > W - 0.05 || p[1] > H - 0.05;
  const m: LairMap = {
    ...empty(site, W, H), outlines: field.contours(), open, onEdge, mouths: mouths.map(({ p, dir }) => ({ p, dir })),
    chasms: [], crystals: [], bridges: [], lava: kind === 'rift', blds: [], gotos: [],
  };
  for (const mo of mouths) m.gotos!.push({ p: [mo.p[0] + Math.cos(mo.dir) * 3, mo.p[1] + Math.sin(mo.dir) * 3], r: 4, to: mo.to });
  m.levels = [m];
  const deepIn = (p: Pt, v = 0.15) => field.at(p) > v;
  const free = (p: Pt, r: number) => deepIn(p, 0.12) && !m.rocks.some((q) => Math.hypot(q[0][0] - p[0], q[0][1] - p[1]) < r + 2)
    && !(m.water.length && inLoops(m.water, p)) && !(m.chasms!.length && inLoops(m.chasms!, p))
    && !m.blds!.some((b) => Math.abs(b.p[0] - p[0]) < b.w / 2 + r + 1 && Math.abs(b.p[1] - p[1]) < b.h / 2 + r + 1);
  const spot = (near: Pt, r: number, tries = 40): Pt => {
    for (let t = 0; t < tries; t++) {
      const p: Pt = [near[0] + (rnd() - 0.5) * r * 2, near[1] + (rnd() - 0.5) * r * 2];
      if (free(p, 1)) return p;
    }
    return near;
  };
  const places: { name: string; text: string; p: Pt }[] = [];
  const pick = (k: number) => {
    const list = DEEP_KEY[kind] ?? DEEP_KEY.cavern;
    const [name, texts] = list[k % list.length];
    return { name, text: texts[Math.floor(rnd() * texts.length)] };
  };

  // ---- What fills it, by kind ----
  const far = lobes.slice(1).sort((a, b) => b.r - a.r);
  if (kind === 'lake' || kind === 'sea') {
    // Water: most of the floor for a sea (all but a shore by the first tunnel), a broad lake otherwise.
    const shore = mouths[0]?.p ?? [W / 2, H];
    const reach = Math.hypot(W, H);
    const wf = new Field(W, H, (x, y) => {
      const f = field.at([x, y]);
      const d = Math.hypot(x - shore[0], y - shore[1]) / reach;
      return kind === 'sea' ? Math.min(f - 0.08, d - 0.32 + 0.08 * fbm(noise, x / 9, y / 9, 3.3, 2)) : Math.min(f - 0.2, 0.55 - Math.hypot(x - C[0], (y - C[1]) * 1.3) / (lobes[0].r * 1.15) + 0.12 * fbm(noise, x / 8, y / 8, 5.5, 2));
    });
    wf.clean(20, 30);
    m.water = wf.contours();
    if (kind === 'lake') {
      const isle: Pt = [C[0] + (rnd() - 0.5) * 8, C[1] + (rnd() - 0.5) * 6];
      m.rocks.push(blob(isle, 4 + 2 * rnd(), rnd, 10, 0.3));
      places.push({ ...pick(0), p: spot([C[0], C[1] + lobes[0].r * 0.75], 6) }, { ...pick(1), p: isle }, { ...pick(2), p: spot(shore, 14) });
    } else {
      places.push({ ...pick(0), p: spot(shore, 12) }, { ...pick(1), p: [C[0], C[1]] }, { ...pick(2), p: spot(far[0]?.c ?? C, 8) });
    }
  } else if (kind === 'rift') {
    // A river of lava across the cavern, with stone bridges where the ways cross it.
    const a = rnd() * Math.PI;
    const p0: Pt = [C[0] - Math.cos(a) * W, C[1] - Math.sin(a) * H], p1: Pt = [C[0] + Math.cos(a) * W, C[1] + Math.sin(a) * H];
    const lava = wander(p0, p1, rnd, 0.1, 4);
    m.stream = { pts: lava, w: 2.6 + 1.2 * rnd() };
    for (const t of tunnels.slice(0, 2)) {
      for (let q = 1; q < t.pts.length; q++) {
        const hit = lava.find((p, k) => k > 0 && distSeg(p, t.pts[q - 1], t.pts[q]) < 1.2);
        if (hit) {
          const d: Pt = [Math.cos(a + Math.PI / 2), Math.sin(a + Math.PI / 2)], half = m.stream.w + 2.2;
          m.bridges!.push({ a: [hit[0] - d[0] * half, hit[1] - d[1] * half], b: [hit[0] + d[0] * half, hit[1] + d[1] * half], rope: false });
          break;
        }
      }
    }
    if (!m.bridges!.length) {
      const d: Pt = [Math.cos(a + Math.PI / 2), Math.sin(a + Math.PI / 2)], half = m.stream.w + 2.2;
      m.bridges!.push({ a: [C[0] - d[0] * half, C[1] - d[1] * half], b: [C[0] + d[0] * half, C[1] + d[1] * half], rope: false });
    }
    const br = m.bridges![0];
    places.push({ ...pick(0), p: spot(lava[Math.floor(lava.length * 0.3)], 6) }, { ...pick(1), p: [(br.a[0] + br.b[0]) / 2 + 2, (br.a[1] + br.b[1]) / 2 + 2] }, { ...pick(2), p: spot(far[0]?.c ?? C, 8) });
    m.camp = { fire: spot(far[0]?.c ?? C, 6), tents: [] };
  } else if (kind === 'fungal') {
    // Groves of giant fungi through the cavern, thinning toward the middle.
    for (let t = 0; t < (W * H) / 12; t++) {
      const p: Pt = [rnd() * W, rnd() * H];
      if (!deepIn(p, 0.22) || rnd() < 0.45 + 0.45 * Math.exp(-Math.hypot(p[0] - C[0], p[1] - C[1]) / 14)) continue;
      const r = 0.9 + 2.2 * rnd() ** 2;
      if (m.trees.some((q) => Math.hypot(q.p[0] - p[0], q.p[1] - p[1]) < q.r + r + 0.6)) continue;
      m.trees.push({ p, r, shade: rnd() });
    }
    const pool: Pt = spot(far[0]?.c ?? C, 6);
    m.water.push(blob(pool, 3 + 1.5 * rnd(), rnd, 10, 0.3));
    m.trees = m.trees.filter((t) => !inLoops(m.water, t.p) && Math.hypot(t.p[0] - pool[0], t.p[1] - pool[1]) > 5);
    places.push({ ...pick(0), p: spot(far[1]?.c ?? C, 8) }, { ...pick(1), p: spot(C, 5) }, { ...pick(2), p: [pool[0] + 4.5, pool[1]] });
  } else if (kind === 'ruins') {
    // Streets of the fallen city on a grid, roofless houses along them, a temple in the middle.
    const s = 9 + 2 * rnd(), rot = (rnd() - 0.5) * 0.4;
    const T = (u: number, v: number): Pt => [C[0] + u * Math.cos(rot) - v * Math.sin(rot), C[1] + u * Math.sin(rot) + v * Math.cos(rot)];
    for (let u = -6; u <= 6; u++) {
      for (let v = -5; v <= 5; v++) {
        if (Math.abs(u) <= 1 && Math.abs(v) <= 1) continue;
        const c = T(u * s, v * s);
        if (!deepIn(c, 0.22) || rnd() < 0.25) continue;
        const w = s * (0.35 + 0.25 * rnd()), h = s * (0.35 + 0.25 * rnd());
        const q = [T(u * s - w / 2, v * s - h / 2), T(u * s + w / 2, v * s - h / 2), T(u * s + w / 2, v * s + h / 2), T(u * s - w / 2, v * s + h / 2)];
        for (let k = 0; k < 4; k++) if (rnd() > 0.25) m.ruins.push([q[k], q[(k + 1) % 4]]);
      }
    }
    // The temple: a stepped square.
    for (const k of [1, 0.66, 0.33]) {
      const h = s * 1.3 * k;
      const q = [T(-h, -h), T(h, -h), T(h, h), T(-h, h)];
      for (let e = 0; e < 4; e++) m.ruins.push([q[e], q[(e + 1) % 4]]);
    }
    m.things.push({ kind: 'altar', p: C, a: rot, w: 2.4, h: 1.6 });
    for (let u = -6; u <= 6; u += 3) m.paths.push([T(u * s + s / 2, -6 * s), T(u * s + s / 2, 6 * s)]);
    places.push({ ...pick(0), p: spot(T(3 * s, s / 2), 4) }, { ...pick(1), p: T(s * 1.6, -s * 1.6) }, { ...pick(2), p: spot(far[0]?.c ?? T(-3 * s, 0), 6) });
  } else if (hallBox) {
    // Rows of square pillars down the hall, a throne at its head, and the road through it.
    const rows = [hallBox.y0 + (hallBox.y1 - hallBox.y0) * 0.25, hallBox.y0 + (hallBox.y1 - hallBox.y0) * 0.75];
    for (const y of rows) {
      for (let x = hallBox.x0 + 6; x < hallBox.x1 - 4; x += 8) {
        const r = 1.6;
        m.rocks.push([[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]]);
      }
    }
    const throne: Pt = [hallBox.x1 - 4, C[1]];
    m.things.push({ kind: 'altar', p: throne, a: Math.PI / 2, w: 2.6, h: 2 });
    for (const sv of [-1, 1]) m.things.push({ kind: 'shrine', p: [throne[0] - 3, C[1] + sv * 4], a: 0, w: 1.6, h: 1.6 });
    m.paths.push([[hallBox.x0 - 20, C[1]], [hallBox.x1, C[1]]]);
    places.push({ ...pick(0), p: [W / 2, hallBox.y0 + 3] }, { ...pick(1), p: [throne[0] - 5, C[1] - 1.5] }, { ...pick(2), p: [hallBox.x0 + 3, C[1] + 3] });
  } else if (kind === 'chasm' || kind === 'abyss') {
    // A dark pit across (chasm) or in the middle of (abyss) the cavern, with a bridge over it.
    const a = rnd() * Math.PI;
    const cf = new Field(W, H, (x, y) => {
      const dx = x - C[0], dy = y - C[1];
      const u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a);
      const g = kind === 'chasm' ? 1 - Math.abs(v) / 6 - Math.max(0, Math.abs(u) - W) / 5 : 1 - Math.hypot(u, v) / (lobes[0].r * 0.75);
      return Math.min(field.at([x, y]) + 0.2, g + 0.25 * fbm(noise, x / 6, y / 6, 7.1, 2));
    });
    cf.clean(20, 20);
    m.chasms = cf.contours();
    const half = kind === 'chasm' ? 8 : lobes[0].r * 0.8;
    const d: Pt = [Math.cos(a + Math.PI / 2), Math.sin(a + Math.PI / 2)];
    m.bridges!.push({ a: [C[0] - d[0] * half, C[1] - d[1] * half], b: [C[0] + d[0] * half, C[1] + d[1] * half], rope: kind === 'chasm' });
    const edge: Pt = spot([C[0] + Math.cos(a) * 10 + d[0] * (half + 3), C[1] + Math.sin(a) * 10 + d[1] * (half + 3)], 4);
    places.push({ ...pick(0), p: edge }, { ...pick(1), p: [C[0] + d[0] * (half + 2.5) - Math.cos(a) * 3, C[1] + d[1] * (half + 2.5) - Math.sin(a) * 3] });
  } else {
    // A great cavern: columns, crystal and stalagmite forests, and a pool.
    for (const l of far.slice(0, 2)) for (let q = 0; q < 6; q++) m.crystals!.push(crystal(spot(l.c, l.r * 0.6), rnd));
    m.water.push(blob(spot(far[2]?.c ?? C, 6), 2.5 + 2 * rnd(), rnd, 10, 0.3));
    places.push({ ...pick(0), p: spot(C, 6) }, { ...pick(1), p: spot(far[2]?.c ?? C, 6) }, { ...pick(2), p: spot(far[0]?.c ?? C, 5) });
  }
  // Columns and stalagmites through the open floor, clear of what is there already.
  for (let t = 0; t < (W * H) / 26; t++) {
    const p: Pt = [rnd() * W, rnd() * H];
    if (!free(p, 1.5) || (hallBox && p[0] > hallBox.x0 && p[0] < hallBox.x1 && p[1] > hallBox.y0 && p[1] < hallBox.y1)) continue;
    if (m.paths.some((l) => distSeg(p, l[0], l[1]) < 2.5) || m.trees.some((q) => Math.hypot(q.p[0] - p[0], q.p[1] - p[1]) < q.r + 1)) continue;
    if (m.stream && m.stream.pts.some((q, k) => k > 0 && distSeg(p, m.stream!.pts[k - 1], q) < m.stream!.w + 2)) continue;
    const v = field.at(p);
    if (v < 0.35 && rnd() < 0.12) m.rocks.push(blob(p, 1 + 2.2 * rnd() ** 2, rnd, 7, 0.35));
    else if (rnd() < 0.18) for (let q = 0; q < 2 + Math.floor(rnd() * 5); q++) m.dots.push({ p: [p[0] + (rnd() - 0.5) * 2.4, p[1] + (rnd() - 0.5) * 2.4], r: 0.12 + 0.3 * rnd() });
  }
  // Shafts: up to the surface (or the upper deep) and down to the lower deep.
  const shaftAt = (near: Pt) => {
    for (let t = 0; t < 60; t++) {
      const p: Pt = [near[0] + (rnd() - 0.5) * 30, near[1] + (rnd() - 0.5) * 24];
      if (free(p, 3) && field.at(p) > 0.3 && !places.some((q) => Math.hypot(q.p[0] - p[0], q.p[1] - p[1]) < 5)) return p;
    }
    return null;
  };
  if (info.city) buildCity(m, info, C, rnd, free, places, mouths);
  if (info.horror) {
    const p = spot(far[0]?.c ?? C, 10);
    places.push({ name: `The lair of ${info.horror}`, text: pick2(rnd, [
      `Here dwells the thing the peoples of the deep call ${info.horror}. The stone is scored with marks no tool made, and the bones of whole war-bands lie in drifts against the walls.`,
      `The air grows thick and wrong. Something the deep folk name ${info.horror} lairs in the darkness beyond; those who have seen it cannot agree on its shape.`,
      `A sound like breathing fills the cavern. ${info.horror} sleeps here, the deep folk say, and it is better that it go on sleeping.`,
    ]), p });
  }
  if (info.up) {
    const p = shaftAt(far[1]?.c ?? C);
    if (p) {
      m.links.push({ p, dir: 'up', to: 0, style: 'shaft', caption: `Up to ${info.up.name}` });
      m.gotos!.push({ p, r: 2, to: info.up });
      places.push({ name: 'The way up', text: info.tier === 1 ? `The great shaft climbs from here toward ${info.up.name} in the upper deep; a stair is cut into its wall, spiralling up beyond sight.` : `A shaft climbs toward the surface at ${info.up.name}; a rope ladder hangs down it, and daylight is a pale coin far above.`, p: [p[0] + 3, p[1] - 2] });
    }
  }
  if (info.down) {
    const p = shaftAt(far[2]?.c ?? C);
    if (p) {
      m.links.push({ p, dir: 'down', to: 0, style: 'shaft', caption: `Down to ${info.down.name}` });
      m.gotos!.push({ p, r: 2, to: info.down });
      places.push({ name: 'The great shaft', text: `A shaft as wide as a tower drops toward ${info.down.name} in the lower deep; warm air rises from it, and a stair winds down its side.`, p: [p[0] + 3.5, p[1] - 2] });
    }
  }
  // The key: the ways out, then what is here.
  const keyPlaces: { name: string; text: string; p: Pt }[] = mouths.map((mo) => {
    const p: Pt = [mo.p[0] + Math.cos(mo.dir) * 6, mo.p[1] + Math.sin(mo.dir) * 6];
    return { name: `Tunnel to ${mo.to.name}`, text: MOUTH_TEXT[Math.floor(rnd() * MOUTH_TEXT.length)].replace('{0}', mo.to.name), p: spot(p, 2.5, 20) };
  });
  for (const q of [...places, ...keyPlaces]) m.rooms.push({ n: m.rooms.length + 1, ...q });
  m.hook = info.city ? cityHook(info, rnd) : info.horror ? `The peoples of the deep will not come here: they say ${info.horror} waits in this place, and that it is hungry.` : DEEP_HOOKS[Math.floor(rnd() * DEEP_HOOKS.length)];
  const frnd: Rng = mulberry32(site.seed ^ 0xf1a);
  m.hook = [m.hook, hookTail(frnd)].filter(Boolean).join(' ');
  annotate(m.levels, 'deep', frnd);
  return m;
}

/** A cluster of crystals: a few long thin points from a common root. */
function crystal(c: Pt, rnd: Rng): Pt[] {
  const out: Pt[] = [];
  const n = 3 + Math.floor(rnd() * 3), a0 = rnd() * Math.PI * 2;
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * Math.PI * 2, L = 0.8 + 1.4 * rnd();
    out.push([c[0] + Math.cos(a - 0.18) * 0.3, c[1] + Math.sin(a - 0.18) * 0.3], [c[0] + Math.cos(a) * L, c[1] + Math.sin(a) * L], [c[0] + Math.cos(a + 0.18) * 0.3, c[1] + Math.sin(a + 0.18) * 0.3]);
  }
  return out;
}

const pick2 = <T,>(rnd: Rng, a: T[]): T => a[Math.floor(rnd() * a.length) % a.length];

/** A city's places for the key, by its people: [heading, texts, the building kind it sits by]. */
const CITY_KEY: Record<string, [string, string[], string][]> = {
  shadowelf: [
    ['The Temple of the Veiled Mother', ['A temple of black stone hung with webs of real spider-silk; priestesses in silver masks keep its doors, and the altar is never dry.', 'The great temple, its spire cut from a single stalactite; giant spiders tend the webs that veil its windows.'], 'temple'],
    ['The house of the Matron', ['The walled compound of the ruling house, its towers carved from the living rock; here {ruler}, {title} of {realm}, holds court.', 'The fortress-house of {ruler}, {title}: a ring of spires behind a wall, its gate guarded by house soldiers in black mail.'], 'compound'],
    ['The spire district', ['Lesser houses rise in hollowed stalagmites, lit from within by violet fungus; rope bridges link their upper windows.', 'A forest of carved spires, each the home of a minor house, every one of them plotting against the others.'], 'spire'],
    ['The slave market', ['Captives of every people above and below are sold here in chains; gnomes, dwarves and surface folk wait in silence.', 'A square of cages and auction blocks, busiest after the raiding season.'], 'spire'],
  ],
  deepgnome: [
    ['The hidden gate', ['The warren’s gate is a slab of false rock that swings at a touch; watchers behind spy-holes see all who come.', 'A narrow way between boulders that looks like nothing; the gnomes know which stone to press.'], 'gate'],
    ['The gem-cutters’ row', ['Tiny workshops cut into the wall glitter with lamplight on cut stones; the best gems in the deep come from here.', 'A lane of workshops where gnomes cut and polish gems under glow-lamps, never looking up.'], 'workshop'],
    ['The warden’s burrow', ['The largest burrow, no grander than the rest; {ruler}, {title} of {realm}, hears petitions at a stone table.', 'Here {ruler} keeps the warren’s records, its maps of the deep and its secret ways.'], 'burrow'],
    ['The mushroom farms', ['Terraces of edible fungus, tended by gnomes with long spoons and buckets of dung.', 'Beds of grey mushrooms in neat rows, watered from a seep in the rock.'], 'farm'],
  ],
  fungusfolk: [
    ['The ring of the eldest', ['A ring of the oldest caps, taller than towers; in its heart {ruler}, the {title}, sleeps and dreams for all the {realm}.', 'The eldest caps stand in a circle round a pool of still water; visitors must sleep among them to be heard.'], 'ring'],
    ['The spore gardens', ['Fields of drifting spores where the young are grown; walking through them brings strange, shared dreams.', 'Beds of small glowing caps, carefully kept; each will one day be a fungus-person.'], 'tower'],
    ['The sleeping pools', ['Dark pools where the fungus folk lie half-submerged to rest and listen to the threads.', 'Still water edged with pale moss; the folk come here to share news through the mycelium.'], 'tower'],
  ],
  greydwarf: [
    ['The iron gate', ['A gate of black iron as high as three dwarves, studded with spikes; crossbows cover every approach.', 'The hold’s gate, chained and barred; the heads of enemies rot on spikes above it.'], 'gate'],
    ['The forges', ['Forges that never go out, worked by slaves under the lash; the hammering never stops.', 'Rows of furnaces lit red, where black steel is made for the hold’s wars.'], 'forge'],
    ['The slave pens', ['Pens of iron bars where captives sleep in chains between shifts at the forges and the mines.', 'Cages cut into the rock, crowded with slaves of every people.'], 'pen'],
    ['The hall of the {title}', ['A square hall of black stone where {ruler}, {title} of {realm}, sits on a throne of iron among his clan chiefs.', 'The grim throne-hall of {ruler}; the grudges of the clan are carved in its walls, line after line.'], 'hall'],
  ],
};

const CITY_HOOKS: Record<string, string[]> = {
  shadowelf: [
    'A noble house of {city} will pay well for surface agents to ruin a rival house, and will betray them afterwards if it can.',
    'A captured surface envoy is to be sacrificed in the Temple of the Veiled Mother at the next dark festival.',
    'A disgraced daughter of {ruler}’s house has fled toward the surface and asks for protection.',
  ],
  deepgnome: [
    'The gnomes of {city} will trade a map of the deep roads for help against raiders who have been taking their miners.',
    'A gem the size of a fist has been stolen from {city}, and the thief has gone toward the shadow elves.',
    'The hidden gate of {city} has been found by enemies, and the warren must move or fight.',
  ],
  fungusfolk: [
    'The eldest of {city} has dreamed of a fire that will burn the forest, and asks strangers to prevent it.',
    'Something is eating the spore gardens of {city}, and the fungus folk do not know how to fight it.',
    'The fungus folk of {city} have taken in a lost surface child and will not give it back until it has finished dreaming.',
  ],
  greydwarf: [
    'A slave in {city} claims to be the lost heir of a surface delve, and begs to be freed.',
    'The {title} of {city} is gathering an army to march up the deep road against the dwarves above.',
    'Slaves in the pens of {city} are planning a revolt and need weapons smuggled in.',
  ],
};

function fill(s: string, info: { city?: { name: string; realm?: string; ruler?: string; title?: string } }): string {
  const c = info.city;
  return s.replace(/\{city\}/g, c?.name ?? 'the city').replace(/\{realm\}/g, c?.realm ?? c?.name ?? 'the realm').replace(/\{ruler\}/g, c?.ruler ?? 'its ruler').replace(/\{title\}/g, c?.title ?? 'lord');
}

function cityHook(info: NonNullable<LairSite['deep']>, rnd: Rng): string {
  return fill(pick2(rnd, CITY_HOOKS[info.city!.template] ?? CITY_HOOKS.deepgnome), info);
}

/**
 * A city of the deep in the cavern: buildings on the open floor round the middle, by its people
 * (the shadow elves' carved spires, walled noble houses and temple; the gnomes' small round burrows,
 * workshops, farms and hidden gate; the fungus folk's living towers round the eldest's ring; the
 * grey dwarves' square halls, forges, slave pens and iron gate), and its places in the key.
 */
function buildCity(
  m: LairMap, info: NonNullable<LairSite['deep']>, C: Pt, rnd: Rng, free: (p: Pt, r: number) => boolean,
  places: { name: string; text: string; p: Pt }[], mouths: { p: Pt; dir: number }[],
): void {
  const t = info.city!.template;
  const blds = m.blds!;
  const ways = mouths.map((mo) => mo.p);
  const clearOfWays = (p: Pt, r: number) => ways.every((w) => distSeg(p, C, w) > r + 2.5);
  const put = (kind: string, p: Pt, w: number, h: number, a = 0) => {
    if (!free(p, Math.max(w, h) / 2) || !clearOfWays(p, Math.max(w, h) / 2)) return false;
    blds.push({ kind, p, w, h, a });
    return true;
  };
  const near = (p: Pt, r: number, f: (q: Pt) => boolean, tries = 60) => {
    for (let k = 0; k < tries; k++) {
      const a = rnd() * Math.PI * 2, d = r * Math.sqrt(rnd());
      if (f([p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d])) return true;
    }
    return false;
  };
  // The first, central building of each people, then the rest outward from the middle.
  const centre: Record<string, [string, number, number]> = { shadowelf: ['temple', 12, 12], deepgnome: ['burrow', 4.5, 4.5], fungusfolk: ['ring', 15, 15], greydwarf: ['hall', 11, 9] };
  const [ck, cw, chh] = centre[t] ?? centre.deepgnome;
  near(C, 12, (q) => put(ck, q, cw, chh));
  const n = Math.max(10, Math.min(t === 'deepgnome' ? 60 : 40, Math.round(info.city!.pop / (t === 'fungusfolk' ? 60 : 250))));
  const step = t === 'deepgnome' ? 4.6 : t === 'greydwarf' ? 8 : 7;
  const rot = (rnd() - 0.5) * 0.3;
  for (let ring = 1; ring < 12 && blds.length < n; ring++) {
    const k = Math.max(6, Math.round((ring * step * Math.PI * 2) / step));
    for (let q = 0; q < k && blds.length < n; q++) {
      const a = (q / k) * Math.PI * 2 + rnd() * 0.4;
      const p: Pt = [C[0] + Math.cos(a) * ring * step + (rnd() - 0.5) * 2, C[1] + Math.sin(a) * ring * step * 0.8 + (rnd() - 0.5) * 2];
      const x = rnd();
      if (t === 'shadowelf') {
        if (x < 0.18) put('compound', p, 9 + 3 * rnd(), 7 + 2 * rnd(), rot + (rnd() - 0.5) * 0.4);
        else put('spire', p, 2.8 + 2 * rnd(), 0, 0);
      } else if (t === 'deepgnome') {
        if (x < 0.15) put('workshop', p, 4, 3, rot);
        else if (x < 0.25 && ring > 3) put('farm', p, 6, 4, rot);
        else put('burrow', p, 2.4 + 1.1 * rnd(), 0, 0);
      } else if (t === 'fungusfolk') {
        put('tower', p, 3.5 + 3.5 * rnd(), 0, 0);
      } else {
        if (x < 0.2) put('forge', p, 5, 5, rot);
        else if (x < 0.32) put('pen', p, 7, 5, rot);
        else put('hall', p, 6 + 2 * rnd(), 5.5 + 2 * rnd(), rot);
      }
    }
  }
  // A gate where the first tunnel comes in (gnomes and grey dwarves).
  if ((t === 'deepgnome' || t === 'greydwarf') && mouths[0]) {
    const mo = mouths[0], p: Pt = [mo.p[0] + Math.cos(mo.dir) * 9, mo.p[1] + Math.sin(mo.dir) * 9];
    blds.push({ kind: 'gate', p, w: 6, h: 2, a: mo.dir + Math.PI / 2 });
  }
  for (const [name, texts, by] of CITY_KEY[t] ?? []) {
    const b = blds.find((q) => q.kind === by && !places.some((pl) => Math.hypot(pl.p[0] - q.p[0], pl.p[1] - q.p[1]) < 3)) ?? blds[0];
    if (!b) continue;
    places.push({ name: fill(name, info), text: fill(pick2(rnd, texts), info), p: [b.p[0] + Math.max(b.w, b.h) / 2 + 1.2, b.p[1] - 1] });
  }
}
