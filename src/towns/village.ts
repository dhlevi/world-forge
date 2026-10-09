import { type Pt, blob, rect } from './geom';
import { addDocks } from './harbour';
import { Kit } from './kit';
import type { PlanInput } from './plan';
import { RIVER } from './terrain';

const unit = (p: Pt): Pt => {
  const l = Math.hypot(...p) || 1;
  return [p[0] / l, p[1] / l];
};
const toward = (a: Pt, b: Pt, d: number): Pt => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [a[0] + ((b[0] - a[0]) * d) / l, a[1] + ((b[1] - a[1]) * d) / l];
};

/**
 * Village-scale plans in the manner of Watabou's Village Generator, varied by the kind of
 * settlement: farming and fishing villages, logging and mining camps, monasteries and keeps.
 */
export function buildVillage(inp: PlanInput): void {
  const k = new Kit(inp);
  switch (inp.s.kind) {
    case 'fishing': return fishing(k);
    case 'logging': return logging(k);
    case 'mining': return mining(k);
    case 'monastery': return monastery(k);
    case 'keep': return keep(k);
    default: return farming(k);
  }
}

function chapel(k: Kit): void {
  for (let t = 0; t < 12; t++) {
    if (k.house(k.polar(15 + k.rnd() * 25, k.rnd() * 2 * Math.PI), k.rnd() * Math.PI, 16, 9, 'temple')) return;
  }
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
  if (inp.s.population > 250) chapel(k);
  k.housesAlongLanes(0.95, [7, 12]);
  k.fieldRing(core * 0.5, R, 3500, 0.15);
  k.clumps(6 + Math.floor(rnd() * 6), core * 0.4, R * 1.1);
  k.gardenTrees(0.5);
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

