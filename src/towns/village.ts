import { type Pt, blob, pointInPoly, rect } from './geom';
import { addDocks } from './harbour';
import { Kit } from './kit';
import type { PlanInput } from './plan';
import { RIVER } from './terrain';
import { deityName, innName } from '../names/names';
import { graves } from './kit';
import { hash32 } from '../gen/rng';
import type { Settlement } from '../gen/settlements';

const unit = (p: Pt): Pt => {
  const l = Math.hypot(...p) || 1;
  return [p[0] / l, p[1] / l];
};
const toward = (a: Pt, b: Pt, d: number): Pt => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [a[0] + ((b[0] - a[0]) * d) / l, a[1] + ((b[1] - a[1]) * d) / l];
};

/** Villages with a green or market square and a well at its heart (settled farming and fishing villages). */
export const hasWell = (s: Pick<Settlement, 'kind' | 'newWorld'>): boolean => (!s.kind || s.kind === 'farming' || s.kind === 'fishing') && !s.newWorld;
/** About one well in nine leads down to something hidden (decided from the village alone, so search can list it). */
export const secretWell = (s: Pick<Settlement, 'kind' | 'newWorld' | 'seed'>): boolean => hasWell(s) && hash32(s.seed ^ 0x3e11) / 4294967296 < 0.11;

/**
 * Village-scale plans in the manner of Watabou's Village Generator, varied by the kind of
 * settlement: farming and fishing villages, logging and mining camps, monasteries and keeps.
 */
export function buildVillage(inp: PlanInput): void {
  const k = new Kit(inp);
  switch (inp.s.kind) {
    case 'fishing': fishing(k); break;
    case 'logging': logging(k); break;
    case 'mining': mining(k); break;
    case 'monastery': monastery(k); break;
    case 'keep': keep(k); break;
    case 'tribal': tribal(k); break;
    case 'camp': camp(k); break;
    default: farming(k);
  }
  villageLabels(k);
}

/** The village's name over the plan, and its notable buildings: chapel, inn, smithy, mill. */
function villageLabels(k: Kit): void {
  const { inp, rnd } = k;
  const { s, out, names, culture } = inp;
  if (s.name) out.point('qlabel', [0, k.core * 0.9 + 20], { name: s.name });
  const mark = (b: { f: { properties: Record<string, string | number> }; c: Pt }, role: string, label: string) => {
    b.f.properties.role = role;
    b.f.properties.label = label;
    out.point('blabel', b.c, { name: label, role });
  };
  const used = new Set<object>();
  for (const b of k.buildings) {
    if (b.use === 'temple' && s.kind === 'tribal') {
      mark(b, 'temple', 'Council House');
      used.add(b);
    } else if (b.use === 'temple') {
      mark(b, 'temple', deityName(names, culture, `${s.id}:chapel`).replace('Temple of', 'Chapel of'));
      used.add(b);
      // A churchyard beside the chapel.
      if (s.population > 150) {
        for (let t = 0; t < 8; t++) {
          const a = rnd() * 2 * Math.PI;
          const c: Pt = [b.c[0] + Math.cos(a) * 20, b.c[1] + Math.sin(a) * 20];
          const q = rect(c[0], c[1], a, 16, 12);
          if (q.some((v) => inp.water(v)) || k.houses.some((h) => Math.hypot(h.c[0] - c[0], h.c[1] - c[1]) < h.r + 10) || q.some((v) => k.nearLane(v, 1))) continue;
          out.poly('graveyard', q);
          out.line('hedge', [...q, q[0]]);
          graves(q, rnd, out, inp.ground);
          k.blocked.push(q);
          break;
        }
      }
    } else if (b.use === 'mill') {
      const how = b.f.properties.mill;
      mark(b, 'mill', s.kind === 'logging' ? 'Sawmill' : s.kind === 'mining' ? 'Smelter' : how === 'wind' ? 'Windmill' : how === 'water' ? 'Watermill' : 'Mill');
      used.add(b);
    } else if (b.use === 'witch') {
      mark(b, 'witch', witchLabel(rnd));
      used.add(b);
    }
  }
  const ordinary = k.buildings.filter((b) => !b.use && !used.has(b)).sort((a, b) => Math.hypot(...a.c) - Math.hypot(...b.c));
  const farmingLike = !s.kind || s.kind === 'farming' || s.kind === 'fishing';
  if (farmingLike && s.population > 120 && ordinary[0]) mark(ordinary.shift()!, 'inn', innName(names.rng(`${s.id}:inn`)));
  if (farmingLike && s.population > 220 && ordinary.length > 3) mark(ordinary.splice(2, 1)[0], 'smithy', 'Smithy');
  // A village apothecary: herbs, salves and simples for the villages round about.
  if (farmingLike && s.population > 260 && ordinary.length > 5) mark(ordinary.splice(3, 1)[0], 'apothecary', 'Apothecary');
}

const witchLabel = (rnd: () => number) => {
  const r = rnd();
  return r < 0.4 ? "the Witch's Hut" : r < 0.6 ? "the Hedge-witch's Cottage" : r < 0.8 ? "the Wise-woman's House" : "the Cunning-man's Cottage";
};

/**
 * The village green, or the market square of a larger village, where the lanes meet, with the
 * well at its heart; market stalls round the square of the larger ones.
 */
function square(k: Kit): void {
  const { rnd, inp } = k;
  const market = inp.s.population >= 300;
  const rS = market ? Math.min(26, 14 + inp.s.population / 60) : Math.min(14, 9 + inp.s.population / 80);
  const ring: Pt[] = [];
  for (let q = 0; q < 14; q++) {
    const a = (q / 14) * Math.PI * 2;
    ring.push([Math.cos(a) * rS * (0.88 + 0.24 * rnd()), Math.sin(a) * rS * (0.88 + 0.24 * rnd())]);
  }
  if (ring.filter((p) => inp.water(p)).length > 3) return;
  inp.out.poly(market ? 'square' : 'green', ring, { square: market ? 'market' : 'green' });
  k.blocked.push(ring);
  // The well, clear of the lanes (where the lanes allow).
  let well: Pt | null = null;
  for (let t = 0; t < 40 && !well; t++) {
    const p = k.polar(rS * 0.6 * Math.sqrt(t / 40), rnd() * Math.PI * 2);
    if (!inp.water(p) && !k.nearLane(p, 2.2)) well = p;
  }
  well ??= [0, 0];
  inp.out.point('well', well, { r: 1.5 });
  k.houses.push({ c: well, r: 3 });
  if (!market) return;
  for (let n = 4 + Math.floor(rnd() * 5), t = 0; n > 0 && t < 60; t++) {
    const p = k.polar(rS * (0.35 + 0.5 * rnd()), rnd() * Math.PI * 2);
    if (inp.water(p) || k.nearLane(p, 2.4) || k.houses.some((h) => Math.hypot(h.c[0] - p[0], h.c[1] - p[1]) < h.r + 2.4)) continue;
    inp.out.poly('stall', rect(p[0], p[1], Math.atan2(p[1], p[0]) + Math.PI / 2, 3.2, 2.2));
    k.houses.push({ c: p, r: 2.2 });
    n--;
  }
}

/**
 * The village mill: a watermill on the river bank where a river runs by, with its wheel in the
 * stream; otherwise a windmill on the highest open ground just outside the village.
 */
function mill(k: Kit): void {
  const { rnd, core, inp } = k;
  if (inp.s.population < 120) return;
  // The nearest stretches of river bank within the plan; a mill out of the village gets a track.
  const banks = inp.terrain.shore(Math.max(core * 1.6, k.R * 0.95), 12, rnd).filter((s) => s.type === RIVER)
    .sort((p, q) => Math.hypot(...p.p) - Math.hypot(...q.p));
  for (const bank of banks.slice(0, 6)) {
    for (let t = 0; t < 4; t++) {
      const d = 9 + t * 2;
      const c: Pt = [bank.p[0] - bank.n[0] * d, bank.p[1] - bank.n[1] * d];
      const ang = Math.atan2(bank.n[0], -bank.n[1]);
      if (!k.house(c, ang, 12, 9, 'mill')) continue;
      k.buildings[k.buildings.length - 1].f.properties.mill = 'water';
      // The wheel against the wall that faces the stream.
      const wc: Pt = [c[0] + bank.n[0] * 5.6, c[1] + bank.n[1] * 5.6];
      inp.out.poly('millwheel', rect(wc[0], wc[1], ang, 5, 1.4));
      if (Math.hypot(...c) > core) {
        let near: Pt = [0, 0], bd = Infinity;
        for (const l of k.lanes) for (const p of l.pts) {
          const dd = Math.hypot(p[0] - c[0], p[1] - c[1]);
          if (dd < bd) {
            bd = dd;
            near = p;
          }
        }
        if (bd > 10) k.lane(k.curvy(near, [c[0] - bank.n[0] * 8, c[1] - bank.n[1] * 8], 0.1), 3);
      }
      return;
    }
  }
  // A windmill: the highest gentle, dry ground on a ring round the village.
  let best: Pt | null = null, bestH = -Infinity;
  for (let q = 0; q < 36; q++) {
    const p = k.polar(core * (0.75 + 0.7 * rnd()), (q / 36) * Math.PI * 2 + rnd() * 0.15);
    if (inp.water(p) || k.inBlocked(p) || k.nearLane(p, 7) || inp.terrain.slope(p) > 0.12) continue;
    if (k.houses.some((h) => Math.hypot(h.c[0] - p[0], h.c[1] - p[1]) < h.r + 8)) continue;
    const h = inp.terrain.height(p);
    if (h > bestH) {
      bestH = h;
      best = p;
    }
  }
  if (!best) return;
  const r = 3.6;
  const tower: Pt[] = [];
  for (let q = 0; q < 16; q++) tower.push([best[0] + Math.cos((q / 16) * Math.PI * 2) * r, best[1] + Math.sin((q / 16) * Math.PI * 2) * r]);
  if (!inp.ground.allOk(tower, { maxSlope: 0.2, marginM: 1 })) return;
  inp.out.poly('building', tower, { use: 'mill', mill: 'wind' });
  k.buildings.push({ f: inp.out.features[inp.out.features.length - 1], c: best, use: 'mill' });
  k.houses.push({ c: best, r: r + 6 });
  // The sails: two long arms crossing over the cap.
  const a = rnd() * Math.PI;
  for (const da of [0, Math.PI / 2]) {
    const ca = Math.cos(a + da), sa = Math.sin(a + da);
    inp.out.line('sails', [[best[0] - ca * 9, best[1] - sa * 9], [best[0] + ca * 9, best[1] + sa * 9]]);
  }
  k.blocked.push(rect(best[0], best[1], 0, 14, 14));
}

/**
 * Now and then a witch's hut (or a wise-woman's or cunning-man's cottage) beyond the fields,
 * among a stand of trees, with an herb garden and a footpath from the nearest lane.
 */
function witchHut(k: Kit): void {
  const { rnd, core, R, inp } = k;
  if (inp.s.newWorld || inp.names.rng(`${inp.s.id}:witch`)() > 0.22) return;
  for (let t = 0; t < 50; t++) {
    const c = k.polar(core * 1.5 + rnd() * Math.max(10, R * 0.9 - core * 1.5), rnd() * Math.PI * 2);
    if (k.fields.some((f) => pointInPoly(f, c[0], c[1]))) continue;
    if (!k.house(c, rnd() * Math.PI, 7, 6, 'witch')) continue;
    // An herb garden beside it, and the copse round about.
    const ga = rnd() * Math.PI * 2;
    const gc: Pt = [c[0] + Math.cos(ga) * 8, c[1] + Math.sin(ga) * 8];
    if (!inp.water(gc) && !k.fields.some((f) => pointInPoly(f, gc[0], gc[1]))) inp.out.poly('garden', rect(gc[0], gc[1], ga, 6, 4));
    for (let q = 0; q < 14; q++) {
      const a = rnd() * Math.PI * 2, d = 9 + rnd() * 14;
      k.tree([c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d], 2.5 + rnd() * 2);
    }
    // A footpath to the nearest lane.
    let near: Pt | null = null, bd = Infinity;
    for (const l of k.lanes) for (const p of l.pts) {
      const d = Math.hypot(p[0] - c[0], p[1] - c[1]);
      if (d < bd) {
        bd = d;
        near = p;
      }
    }
    if (near && bd < R) inp.out.line('road', k.curvy(near, c, 0.2), { cls: 'path' });
    return;
  }
}

/**
 * An army in the field, camped near the border of a realm at war: a rectangle of ditch and
 * palisade with a gate in each side, two camp streets crossing at the commander's pavilion,
 * rows of tents, horse lines and supply wagons, and trampled ground all round.
 */
function camp(k: Kit): void {
  const { rnd, core, R, inp } = k;
  const out = inp.out;
  const w = core * 2, h = core * 1.5;
  const e0 = inp.exits[0]?.p ?? k.polar(R, rnd() * 2 * Math.PI);
  const a = Math.atan2(e0[1], e0[0]);
  const T = (u: number, v: number): Pt => [u * Math.cos(a) - v * Math.sin(a), u * Math.sin(a) + v * Math.cos(a)];
  out.poly('trodden', rect(0, 0, a, w + 40, h + 40));
  // Ditch and palisade, each side broken by a gate at its middle.
  const sides = (hw: number, hh: number, kind: string, props: Record<string, number>, gap: number) => {
    const c: Pt[] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    for (let q = 0; q < 4; q++) {
      const [u0, v0] = c[q], [u1, v1] = c[(q + 1) % 4];
      const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2, l = Math.hypot(u1 - u0, v1 - v0);
      const du = (u1 - u0) / l, dv = (v1 - v0) / l;
      out.line(kind, [T(u0, v0), T(mu - du * gap, mv - dv * gap)], props);
      out.line(kind, [T(mu + du * gap, mv + dv * gap), T(u1, v1)], props);
    }
  };
  sides(w / 2 + 7, h / 2 + 7, 'ditch', { w: 4 }, 5);
  sides(w / 2 + 2, h / 2 + 2, 'wall', { w: 1.2 }, 4);
  k.blocked.push(rect(0, 0, a, w + 18, h + 18));
  // The camp streets, gate to gate, and the way in from the road.
  const streets: [Pt, Pt][] = [[T(-w / 2 - 10, 0), T(w / 2 + 10, 0)], [T(0, -h / 2 - 10), T(0, h / 2 + 10)]];
  for (const [p, q] of streets) k.lane([p, q], 6, 'street');
  const gates = [T(w / 2 + 12, 0), T(-w / 2 - 12, 0), T(0, h / 2 + 12), T(0, -h / 2 - 12)];
  const gate = gates.reduce((b, g) => (Math.hypot(g[0] - e0[0], g[1] - e0[1]) < Math.hypot(b[0] - e0[0], b[1] - e0[1]) ? g : b));
  k.exitLanes(gate);
  // The commander's pavilion where the streets cross, and its standard.
  const pav = T(9, 9);
  out.poly('tent', rect(pav[0], pav[1], a, 11, 7), { big: 1 });
  out.point('blabel', pav, { name: "Commander's pavilion", role: 'command' });
  // Rows of tents in the four quarters; horse lines and wagons in one of them.
  const horses = Math.floor(rnd() * 4);
  for (let qd = 0; qd < 4; qd++) {
    const su = qd % 2 ? 1 : -1, sv = qd < 2 ? 1 : -1;
    for (let v = 7; v < h / 2 - 2; v += 6.5) {
      if (qd === horses && v > h / 4) {
        // Horse lines: a picket rope with the horses along it.
        out.line('picket', [T(su * 8, sv * v), T(su * (w / 2 - 4), sv * v)]);
        for (let u = 10; u < w / 2 - 4; u += 2.4) out.poly('horse', rect(...T(su * u, sv * (v + 1.4)), a + Math.PI / 2, 2.2, 0.9));
        continue;
      }
      for (let u = 7; u < w / 2 - 2; u += 5) {
        if (Math.hypot(u - 9, v - 9) < 9 && su > 0 && sv > 0) continue;
        const c = T(su * u + (rnd() - 0.5) * 0.6, sv * v + (rnd() - 0.5) * 0.6);
        if (inp.water(c) || rnd() < 0.08 || !inp.ground.ok(c, { maxSlope: 0.3, marginM: 1 })) continue;
        out.poly('tent', rect(c[0], c[1], a + (rnd() - 0.5) * 0.08, 3.6, 2.6));
      }
    }
  }
  // Supply wagons drawn up outside the gate, and a few trees left standing round the camp.
  for (let q = 0; q < 6; q++) {
    const g = gates[(gates.indexOf(gate) + 1) % 4];
    const c: Pt = [g[0] + (rnd() - 0.5) * 24, g[1] + (rnd() - 0.5) * 24];
    if (!inp.water(c) && !k.inBlocked(c) && !k.nearLane(c, 2)) out.poly('wagon', rect(c[0], c[1], rnd() * Math.PI, 4, 1.8));
  }
  k.clumps(3, core * 1.6, R);
}

function chapel(k: Kit): void {
  for (let t = 0; t < 12; t++) {
    if (k.house(k.polar(15 + k.rnd() * 25, k.rnd() * 2 * Math.PI), k.rnd() * Math.PI, 16, 9, 'temple')) return;
  }
}

/**
 * A New World village or tribal town: an open dancing ground with a council house at its heart,
 * longhouses set round it in one or two rings facing the centre, round lodges and drying racks
 * between, a palisade round the larger ones, and garden plots and forest beyond.
 */
function tribal(k: Kit): void {
  const { rnd, core, R, inp } = k;
  const big = inp.s.population > 400;
  const ends = k.exitLanes();
  // The dancing ground and council house.
  const plaza: Pt[] = [];
  const rG = Math.max(10, core * 0.22);
  for (let q = 0; q < 16; q++) {
    const a = (q / 16) * Math.PI * 2;
    plaza.push([Math.cos(a) * rG * (0.9 + 0.2 * rnd()), Math.sin(a) * rG * (0.9 + 0.2 * rnd())]);
  }
  inp.out.poly('green', plaza);
  k.blocked.push(plaza);
  const hall = k.house(k.polar(rG + 8, rnd() * Math.PI * 2), rnd() * Math.PI, 22, 9, 'temple');
  void hall;
  // Longhouses in rings round the ground, their long sides facing the centre.
  const nHouses = Math.max(4, Math.round(inp.s.population / 22));
  let placed = 0;
  for (let ring = 0; ring < 4 && placed < nHouses; ring++) {
    const r = rG + 18 + ring * 20;
    if (r > core * 1.0) break;
    const n = Math.floor((2 * Math.PI * r) / 24);
    const a0 = rnd() * Math.PI;
    for (let q = 0; q < n && placed < nHouses; q++) {
      const a = a0 + (q / n) * Math.PI * 2 + (rnd() - 0.5) * 0.12;
      const c = k.polar(r + (rnd() - 0.5) * 5, a);
      const long = 16 + rnd() * 10;
      if (k.house(c, a + Math.PI / 2, long, 6.5)) placed++;
    }
  }
  // Round lodges and drying racks scattered between.
  for (let t = 0; t < nHouses * 2; t++) {
    const rMax = Math.min(core, rG + 82);
    const c = k.polar(rG + 10 + rnd() * (rMax - rG - 10), rnd() * Math.PI * 2);
    if (inp.water(c) || k.inBlocked(c) || k.nearLane(c, 3) || k.houses.some((h) => Math.hypot(h.c[0] - c[0], h.c[1] - c[1]) < h.r + 5)) continue;
    if (rnd() < 0.6) {
      const r = 3 + rnd() * 2;
      const ring: Pt[] = [];
      for (let q = 0; q < 12; q++) ring.push([c[0] + Math.cos((q / 12) * Math.PI * 2) * r, c[1] + Math.sin((q / 12) * Math.PI * 2) * r]);
      if (!inp.ground.allOk(ring, { maxSlope: 0.3, marginM: 1 })) continue;
      inp.out.poly('building', ring, { use: 'lodge' });
      k.houses.push({ c, r: r + 1 });
    } else {
      inp.out.poly('logs', rect(c[0], c[1], rnd() * Math.PI, 6, 1.4));
      k.houses.push({ c, r: 4 });
    }
  }
  // The palisade round the larger villages, open where the trails come in.
  if (big) {
    const ring: Pt[] = [];
    // Just outside the houses.
    const rP = Math.max(rG + 30, ...k.houses.map((h) => Math.hypot(...h.c) + h.r)) + 8;
    for (let q = 0; q <= 48; q++) {
      const a = (q / 48) * Math.PI * 2;
      const wob = 1 + 0.05 * Math.sin(a * 3 + rnd()) + 0.03 * Math.sin(a * 7);
      ring.push([Math.cos(a) * rP * wob, Math.sin(a) * rP * wob]);
    }
    // Gaps for the gates.
    const gates = ends.map((e) => Math.atan2(e[1], e[0]));
    let run: Pt[] = [];
    for (const p of ring) {
      const a = Math.atan2(p[1], p[0]);
      const atGate = gates.some((g) => Math.abs(((a - g + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < 0.09);
      if (atGate || inp.water(p)) {
        if (run.length > 1) inp.out.line('wall', run, { w: 1.4 });
        run = [];
      } else run.push(p);
    }
    if (run.length > 1) inp.out.line('wall', run, { w: 1.4 });
  }
  // Garden plots (maize, beans and squash) close in, then the forest.
  k.fieldRing(core * 1.15, Math.min(R, core * 2.1), 2500, 0.45);
  k.forest(core * 1.6, Math.min(R, core * 2.6), 12, 0.55);
  k.clumps(4, core * 0.6, R);
}

/** Lanes from each track to a common centre, houses along them, fields with furrows around. */
function farming(k: Kit): void {
  const { rnd, core, R, inp } = k;
  const ends = k.exitLanes();
  if (ends.length === 1) {
    const a = Math.atan2(-ends[0][1], -ends[0][0]) + (rnd() - 0.5) * 1.2;
    k.lane(k.curvy([0, 0], k.polar(core * (1 + 0.6 * rnd()), a), 0.15), 3);
  }
  k.branches(Math.min(4, Math.round((inp.s.population / 150) * (0.5 + rnd()))), core, core);
  if (hasWell(inp.s)) square(k);
  if (inp.s.population > 250) chapel(k);
  k.housesAlongLanes(0.95, [7, 12]);
  mill(k);
  k.fieldRing(core * 0.5, R, 3500, 0.15);
  k.clumps(6 + Math.floor(rnd() * 6), core * 0.4, R * 1.1);
  k.gardenTrees(0.5);
  witchHut(k);
}

/** Houses crowding down to the shore, jetties with boats, paths to the water, a few fields inland. */
function fishing(k: Kit): void {
  const { rnd, core, R, inp } = k;
  k.exitLanes();
  const docks = addDocks(inp.terrain, inp.water, inp.out, rnd, {
    maxR: core + 150, spacing: 22, pierW: 3, seaLen: [10, 28], boatLen: [6, 11], boatProb: 0.85,
  });
  docks.sort((a, b) => Math.hypot(...a.p) - Math.hypot(...b.p));
  for (const d of docks.slice(0, 3)) k.lane(k.curvy([0, 0], d.p, 0.1), 3);
  k.branches(Math.min(3, Math.round((inp.s.population / 200) * (0.5 + rnd()))), core, core * 0.8);
  if (hasWell(inp.s)) square(k);
  if (inp.s.population > 300) chapel(k);
  k.housesAlongLanes(1, [6, 10], 1.1);
  // Boats drawn up on the beach beside the jetties.
  for (const d of docks) {
    if (rnd() > 0.5) continue;
    const side = rnd() < 0.5 ? 1 : -1;
    const c: Pt = [d.p[0] - d.n[1] * side * 7 - d.n[0] * 3, d.p[1] + d.n[0] * side * 7 - d.n[1] * 3];
    if (!inp.water(c) && !k.nearLane(c, 2)) inp.out.poly('boat', rect(c[0], c[1], Math.atan2(d.n[1], d.n[0]), 7, 2.4));
  }
  k.fieldRing(core * 0.7, R, 4500, 0.3);
  k.clumps(3, core * 0.5, R);
  k.gardenTrees(0.3);
  witchHut(k);
}

/** A clearing in the forest: sawmill, stacked logs, stumps and a few cabins. */
function logging(k: Kit): void {
  const { rnd, core, R, inp } = k;
  k.exitLanes();
  // The mill goes on the river bank if there is one.
  const bank = inp.terrain.shore(core * 1.2, 10, rnd).find((s) => s.type === RIVER);
  let mill: Pt | null = null;
  for (let t = 0; t < 20 && !mill; t++) {
    const c: Pt = bank && t < 5 ? [bank.p[0] - bank.n[0] * (10 + t * 3), bank.p[1] - bank.n[1] * (10 + t * 3)] : k.polar(10 + rnd() * 20, rnd() * 2 * Math.PI);
    const ang = bank ? Math.atan2(bank.n[0], -bank.n[1]) : rnd() * Math.PI;
    if (k.house(c, ang, 24, 12, 'mill')) mill = c;
  }
  const base = mill ?? [0, 0];
  for (let n = 6 + Math.floor(rnd() * 8), t = 0; n > 0 && t < 60; t++) {
    const p = k.polar(18 + rnd() * 25, rnd() * 2 * Math.PI);
    const c: Pt = [base[0] + p[0], base[1] + p[1]];
    const ang = rnd() * Math.PI;
    if (inp.water(c) || k.nearLane(c, 4) || k.houses.some((h) => Math.hypot(h.c[0] - c[0], h.c[1] - c[1]) < h.r + 7)) continue;
    // A stack is two or three rows of logs.
    const rows = 2 + Math.floor(rnd() * 2);
    for (let r = 0; r < rows; r++) {
      const off = (r - (rows - 1) / 2) * 2.6;
      inp.out.poly('logs', rect(c[0] - Math.sin(ang) * off, c[1] + Math.cos(ang) * off, ang, 9 + rnd() * 3, 2.2));
    }
    k.houses.push({ c, r: 6 });
    n--;
  }
  k.housesAlongLanes(0.7, [5, 8], 0.7);
  for (let t = 0; t < 70; t++) k.tree(k.polar(core * (0.3 + rnd()), rnd() * 2 * Math.PI), 0.8 + rnd() * 0.5, 'stump');
  witchHut(k);
  k.forest(core * 1.3, R * 1.15, 9, 0.85);
}

/** Adits in the hillside above the camp, spoil heaps, a smelter, cart tracks and huts. */
function mining(k: Kit): void {
  const { rnd, core, R, inp } = k;
  const g = inp.terrain.grad([0, 0]);
  const up: Pt = Math.hypot(...g) > 0.005 ? unit(g) : k.polar(1, rnd() * 2 * Math.PI);
  k.exitLanes();
  const adits = 1 + (rnd() < 0.5 ? 1 : 0) + (rnd() < 0.2 ? 1 : 0);
  for (let a = 0; a < adits; a++) {
    const turn = a === 0 ? 0 : (a % 2 ? 1 : -1) * (0.5 + rnd() * 0.5);
    const dir: Pt = [up[0] * Math.cos(turn) - up[1] * Math.sin(turn), up[0] * Math.sin(turn) + up[1] * Math.cos(turn)];
    const reach = Math.max(core * 1.2, 80) + rnd() * 60;
    const e: Pt = [dir[0] * reach, dir[1] * reach];
    if (inp.water(e)) continue;
    const ang = Math.atan2(dir[1], dir[0]);
    inp.out.poly('mine', rect(e[0], e[1], ang, 6, 6));
    k.blocked.push(rect(e[0], e[1], ang, 14, 14));
    k.lane(k.curvy([0, 0], [e[0] - dir[0] * 5, e[1] - dir[1] * 5], 0.08), 3);
    const perp: Pt = [-dir[1], dir[0]];
    for (let s = 0, n = 2 + Math.floor(rnd() * 3); s < n; s++) {
      const side = s % 2 ? 1 : -1, back = 12 + rnd() * 30, out = 14 + rnd() * 16;
      const c: Pt = [e[0] - dir[0] * back + perp[0] * side * out, e[1] - dir[1] * back + perp[1] * side * out];
      if (inp.water(c)) continue;
      const heap = blob(c, 8 + rnd() * 12, rnd);
      inp.out.poly('spoil', heap);
      k.blocked.push(heap);
    }
  }
  for (let t = 0; t < 20; t++) if (k.house(k.polar(12 + rnd() * 20, rnd() * 2 * Math.PI), rnd() * Math.PI, 16, 10, 'mill')) break;
  k.housesAlongLanes(0.6, [5, 8], 0.7);
  k.clumps(2 + Math.floor(rnd() * 3), core * 0.8, R);
}

/** A walled compound: church, cloister, ranges, vegetable beds and orchard; fields beyond. */
function monastery(k: Kit): void {
  const { rnd, core, R, inp } = k;
  const out = inp.out;
  const w = 60 + rnd() * 30, h = 75 + rnd() * 35;
  // Local frame with the gate at -v, facing the first incoming track.
  const d = unit(inp.exits[0]?.p ?? k.polar(R, rnd() * 2 * Math.PI));
  const a = Math.atan2(d[0], -d[1]);
  const T = (u: number, v: number): Pt => [u * Math.cos(a) - v * Math.sin(a), u * Math.sin(a) + v * Math.cos(a)];
  const box = (u: number, v: number, lw: number, lh: number, kind = 'building', props: Record<string, string> = {}) => {
    const c = T(u, v);
    out.poly(kind, rect(c[0], c[1], a, lw, lh), props);
  };
  const compound = rect(0, 0, a, w, h);
  out.poly('plaza', compound);
  out.line('wall', [T(-4, -h / 2), T(-w / 2, -h / 2), T(-w / 2, h / 2), T(w / 2, h / 2), T(w / 2, -h / 2), T(4, -h / 2)], { w: 1.5 });
  k.blocked.push(rect(0, 0, a, w + 6, h + 6));
  k.exitLanes(T(0, -h / 2 - 6), Math.hypot(w, h) * 0.75);
  inp.out.line('road', [T(0, -h / 2 - 6), T(0, -h / 2 + 4)], { cls: 'track' });

  const cx = -w * 0.12;
  box(cx, h / 2 - 11, w * 0.62, 12, 'building', { use: 'temple' });
  const sq = Math.min(w * 0.5, h * 0.42), cy = h / 2 - 17 - sq / 2;
  box(cx, cy + 3, sq - 16, sq - 14, 'green');
  box(cx - sq / 2 + 4, cy, 8, sq);
  box(cx + sq / 2 - 4, cy, 8, sq);
  box(cx, cy - sq / 2 + 4, sq, 8);
  const eu0 = cx + sq / 2 + 4, eu1 = w / 2 - 3;
  if (eu1 - eu0 > 8) box((eu0 + eu1) / 2, h / 2 - 27, eu1 - eu0, 10);
  const v0 = -h / 2 + 8, v1 = cy - sq / 2 - 3;
  for (let v = v0; v + 3 <= v1; v += 4.5) box(-w / 4 - 2, v + 1.5, w * 0.4, 3, 'garden');
  for (let u = 6; u < w / 2 - 4; u += 7) {
    for (let v = v0 + 12; v < Math.min(v1, h / 2 - 34); v += 7) out.point('tree', T(u + (rnd() - 0.5) * 2, v), { r: 2.4 });
  }
  box(w / 2 - 10, -h / 2 + 6, 14, 8);
  k.fieldRing(Math.max(w, h) * 0.75, R, 4000, 0.3);
  k.clumps(4, core, R);
}

/** A ringwork on the hilltop: ditch, wall with towers and gate, keep and hall; a hamlet below. */
function keep(k: Kit): void {
  const { rnd, core, R, inp } = k;
  const out = inp.out;
  const rk = Math.max(28, Math.min(60, core * 0.45));
  const ring = blob([0, 0], rk, rnd, 14);
  const e0 = inp.exits[0]?.p ?? k.polar(R, rnd() * 2 * Math.PI);
  const ga = Math.atan2(e0[1], e0[0]);
  let g = 0;
  ring.forEach((p, i) => {
    if (Math.cos(Math.atan2(p[1], p[0]) - ga) > Math.cos(Math.atan2(ring[g][1], ring[g][0]) - ga)) g = i;
  });
  const n = ring.length, at = (i: number) => ring[((i % n) + n) % n];
  const gate = ring[g];
  out.poly('plaza', ring);
  const ditch: Pt[] = [];
  for (let i = 1; i < n; i++) ditch.push([at(g + i)[0] * 1.25, at(g + i)[1] * 1.25]);
  out.line('ditch', ditch, { w: 5 });
  const g1 = toward(gate, at(g + 1), 4), g2 = toward(gate, at(g - 1), 4);
  const wall: Pt[] = [g1];
  for (let i = 1; i < n; i++) wall.push(at(g + i));
  wall.push(g2);
  out.line('wall', wall, { w: 2.5 });
  out.point('tower', g1, { r: 3.2 });
  out.point('tower', g2, { r: 3.2 });
  for (let i = 2; i < n - 1; i += 2) out.point('tower', at(g + i), { r: 2.8 });
  k.blocked.push(ring.map((p) => [p[0] * 1.4, p[1] * 1.4] as Pt));

  const ks = 12 + rnd() * 5;
  const kc = k.polar(rk * 0.25, ga + Math.PI + (rnd() - 0.5));
  out.poly('building', rect(kc[0], kc[1], rnd() * Math.PI, ks, ks), { use: 'keep' });
  const hc = k.polar(rk * 0.45, ga + Math.PI / 2 * (rnd() < 0.5 ? 1 : -1));
  out.poly('building', rect(hc[0], hc[1], Math.atan2(hc[1], hc[0]) + Math.PI / 2, 18, 8), { use: 'hall' });
  for (let i = 2; i < n - 1; i++) {
    if (rnd() > 0.35) continue;
    const p = at(g + i), q = at(g + i + 1);
    const m: Pt = [((p[0] + q[0]) / 2) * 0.82, ((p[1] + q[1]) / 2) * 0.82];
    if (Math.hypot(m[0] - kc[0], m[1] - kc[1]) < ks || Math.hypot(m[0] - hc[0], m[1] - hc[1]) < 12) continue;
    out.poly('building', rect(m[0], m[1], Math.atan2(q[1] - p[1], q[0] - p[0]), 8, 5), { use: 'store' });
  }
  const outside: Pt = [gate[0] * 1.5, gate[1] * 1.5];
  out.line('road', [outside, gate], { cls: 'track' });
  k.exitLanes(outside, rk * 1.8);
  k.housesAlongLanes(0.8, [6, 10], 1.3);
  k.fieldRing(rk * 1.7, R, 4000, 0.2);
  k.clumps(4, rk * 1.6, R);
}

