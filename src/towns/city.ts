import { Delaunay } from 'd3-delaunay';
import { mulberry32 } from '../gen/rng';
import { chaikin } from '../gen/rivers';
import {
  type Poly, type Pt, area, ccw, centroid, distToLine, distToSeg, hatch, inset, pointInPoly, rect, rectIn, strips, subdivide,
} from './geom';
import { addDocks } from './harbour';
import type { PlanInput } from './plan';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const GATE_HALF = 6;
const key = (p: Pt) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const toward = (a: Pt, b: Pt, d: number): Pt => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const t = Math.min(0.4, d / Math.max(1e-6, len));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
};

interface Patch {
  poly: Poly;
  c: Pt;
  water: boolean;
  inside: boolean;
  kind: 'plaza' | 'temple' | 'citadel' | 'park' | 'harbour' | 'ward' | 'rich' | '';
}

/**
 * Walled city / town in the manner of Watabou's Medieval Fantasy City Generator: Voronoi
 * patches on a sunflower spiral, the inner ones forming wards inside a wall with towers and
 * gates, main streets from each gate to the central plaza, a temple and citadel, terraced
 * buildings by recursive lot splitting, and suburbs and fields outside. Terrain shapes it:
 * the town grows onto gentle ground, streets avoid steep grades, blocks terrace along the
 * contours, the citadel and temple take the high ground, and shores get docks.
 */
export function buildCity({ s, exits, water, terrain, out }: PlanInput): void {
  const rnd = mulberry32(s.seed);
  const town = s.tier !== 'city';
  const nInner = town ? clamp(Math.round(s.population / 500) + 2, 4, 14) : clamp(Math.round(s.population / 900) + 3, 8, 40);
  const Rin = s.coreM, R = s.radiusM;
  const nTotal = Math.ceil(nInner * ((R * 1.2) / Rin) ** 2);
  const sc = Rin / Math.sqrt(nInner);
  const a0 = rnd() * 2 * Math.PI;
  const pts = new Float64Array(nTotal * 2);
  for (let i = 1; i < nTotal; i++) {
    const r = sc * Math.sqrt(i + 0.5) * (0.9 + 0.2 * rnd());
    const a = a0 + i * GOLDEN + (rnd() - 0.5) * 0.4;
    pts[2 * i] = r * Math.cos(a);
    pts[2 * i + 1] = r * Math.sin(a);
  }
  const B = R * 1.4;
  let del = new Delaunay(pts);
  let vor = del.voronoi([-B, -B, B, B]);
  // One Lloyd step on the inner patches evens out ward sizes.
  for (let i = 0; i < Math.min(nTotal, Math.round(nInner * 1.5)); i++) {
    const cp = vor.cellPolygon(i);
    if (!cp) continue;
    const c = centroid(cp.slice(0, -1) as Pt[]);
    pts[2 * i] = c[0];
    pts[2 * i + 1] = c[1];
  }
  del = new Delaunay(pts);
  vor = del.voronoi([-B, -B, B, B]);

  const patches: Patch[] = [];
  for (let i = 0; i < nTotal; i++) {
    const cp = vor.cellPolygon(i);
    const poly = cp ? ccw(cp.slice(0, -1).map(([x, y]) => [x, y] as Pt)) : [];
    const c: Pt = poly.length >= 3 ? centroid(poly) : [pts[2 * i], pts[2 * i + 1]];
    patches.push({ poly, c, water: poly.length < 3 || water(c), inside: false, kind: '' });
  }
  // The walled core takes the nearest patches, with steep ground counting as further away.
  const cost = (i: number) => (i === 0 ? -1 : Math.hypot(...patches[i].c) * (1 + 8 * terrain.slope(patches[i].c)));
  const inner = patches
    .map((_, i) => i)
    .filter((i) => i < Math.min(nTotal, Math.round(nInner * 2.5)) && !patches[i].water)
    .sort((a, b) => cost(a) - cost(b))
    .slice(0, nInner);
  if (inner.length === 0) return;

  // Outline of the inner patches: directed edges cancel against their reverses.
  const edgeMap = new Map<string, [Pt, Pt]>();
  for (const i of inner) {
    const p = patches[i].poly;
    for (let e = 0; e < p.length; e++) {
      const a = p[e], b = p[(e + 1) % p.length];
      const rev = `${key(b)}|${key(a)}`;
      if (edgeMap.has(rev)) edgeMap.delete(rev);
      else edgeMap.set(`${key(a)}|${key(b)}`, [a, b]);
    }
  }
  const nextEdge = new Map<string, [Pt, Pt]>();
  for (const [k, e] of edgeMap) nextEdge.set(k.split('|')[0], e);
  let wall: Pt[] = [];
  while (nextEdge.size > 0) {
    const [startKey, first] = nextEdge.entries().next().value!;
    const loop: Pt[] = [];
    let cur: [Pt, Pt] | undefined = first;
    let k = startKey;
    for (let guard = 0; cur && guard < 10000; guard++) {
      nextEdge.delete(k);
      loop.push(cur[0]);
      k = key(cur[1]);
      if (k === startKey) break;
      cur = nextEdge.get(k);
    }
    if (loop.length >= 3 && area(loop) > area(wall.length >= 3 ? wall : [[0, 0], [0, 0], [0, 0]])) wall = loop;
  }
  if (wall.length < 3) return;
  for (const i of inner) patches[i].inside = pointInPoly(wall, patches[i].c[0], patches[i].c[1]);
  const wallEdges = new Set<string>();
  for (let k = 0; k < wall.length; k++) wallEdges.add(`${key(wall[k])}|${key(wall[(k + 1) % wall.length])}`);

  // Street graph over all patch edges.
  const nodeId = new Map<string, number>();
  const P: Pt[] = [];
  const adj: { to: number; ek: string }[][] = [];
  const edgeCells = new Map<string, number[]>();
  const node = (p: Pt) => {
    const k = key(p);
    let id = nodeId.get(k);
    if (id === undefined) {
      id = P.length;
      nodeId.set(k, id);
      P.push(p);
      adj.push([]);
    }
    return id;
  };
  const ekey = (u: number, v: number) => (u < v ? `${u}|${v}` : `${v}|${u}`);
  patches.forEach((pt, i) => {
    const p = pt.poly;
    for (let e = 0; e < p.length; e++) {
      const u = node(p[e]), v = node(p[(e + 1) % p.length]);
      if (u === v) continue;
      const ek = ekey(u, v);
      const cells = edgeCells.get(ek);
      if (cells) cells.push(i);
      else {
        edgeCells.set(ek, [i]);
        adj[u].push({ to: v, ek });
        adj[v].push({ to: u, ek });
      }
    }
  });
  const edgeWater = new Map<string, boolean>();
  const isWaterEdge = (u: number, v: number, ek: string) => {
    let w = edgeWater.get(ek);
    if (w === undefined) edgeWater.set(ek, (w = water(mid(P[u], P[v]))));
    return w;
  };
  const wallNode = new Set(wall.map((p) => nodeId.get(key(p))!));
  const dijkstra = (src: number, isGoal: (n: number) => boolean, cost: (u: number, v: number, ek: string) => number): number[] | null => {
    const dist = new Float64Array(P.length).fill(Infinity), prev = new Int32Array(P.length).fill(-1);
    const done = new Uint8Array(P.length);
    dist[src] = 0;
    for (;;) {
      let u = -1;
      for (let n = 0; n < P.length; n++) if (!done[n] && dist[n] < Infinity && (u < 0 || dist[n] < dist[u])) u = n;
      if (u < 0) return null;
      if (isGoal(u)) {
        const path = [u];
        while (prev[path[path.length - 1]] >= 0) path.push(prev[path[path.length - 1]]);
        return path.reverse();
      }
      done[u] = 1;
      for (const { to, ek } of adj[u]) {
        if (done[to]) continue;
        const c = cost(u, to, ek);
        if (c === Infinity) continue;
        if (dist[u] + c < dist[to]) {
          dist[to] = dist[u] + c;
          prev[to] = u;
        }
      }
    }
  };
  const len = (u: number, v: number) => Math.hypot(P[u][0] - P[v][0], P[u][1] - P[v][1]);
  const nodeH = P.map((p) => terrain.height(p));
  // Streets avoid steep grades (cost doubles at ~6%).
  const grade = (u: number, v: number) => 1 + (Math.abs(nodeH[u] - nodeH[v]) / Math.max(1, len(u, v)) / 0.06) ** 2;

  // Gates: the wall vertex best facing each incoming road.
  const gates: { k: number; exit: (typeof exits)[number] | null }[] = [];
  const gateNear = (k: number) => gates.some((g) => {
    const d = Math.abs(g.k - k);
    return Math.min(d, wall.length - d) < 2 && g.k !== k;
  });
  for (const e of exits) {
    const ang = Math.atan2(e.p[1], e.p[0]);
    let best = -1, bestScore = -Infinity;
    for (let k = 0; k < wall.length; k++) {
      if (gateNear(k) || water(wall[k])) continue;
      const sc2 = Math.cos(Math.atan2(wall[k][1], wall[k][0]) - ang);
      if (sc2 > bestScore) {
        bestScore = sc2;
        best = k;
      }
    }
    if (best >= 0) gates.push({ k: best, exit: e });
  }
  if (gates.length === 0) {
    const k = Math.floor(rnd() * wall.length);
    gates.push({ k, exit: null });
    if (wall.length > 6) gates.push({ k: (k + (wall.length >> 1)) % wall.length, exit: null });
  }

  const plaza = inner.find((i) => patches[i].inside) ?? inner[0];
  patches[plaza].kind = 'plaza';
  const plazaNodes = new Set(patches[plaza].poly.map((p) => nodeId.get(key(p))!));
  const mainEdges = new Set<string>();
  const roadLines: Pt[][] = [];

  const insideCost = (u: number, v: number, ek: string) => {
    const cells = edgeCells.get(ek)!;
    if (!cells.some((i) => patches[i].inside)) return Infinity;
    const onWall = cells.length === 1 || cells.some((i) => !patches[i].inside);
    return len(u, v) * grade(u, v) * (isWaterEdge(u, v, ek) ? 8 : 1) * (onWall ? 3 : 1) * (mainEdges.has(ek) ? 0.6 : 1);
  };
  const outsideCost = (u: number, v: number, ek: string) => {
    const cells = edgeCells.get(ek)!;
    if (cells.length > 1 && cells.every((i) => patches[i].inside)) return Infinity;
    if (wallNode.has(u) && wallNode.has(v)) return len(u, v) * grade(u, v) * 4;
    return len(u, v) * grade(u, v) * (isWaterEdge(u, v, ek) ? 8 : 1);
  };

  for (const g of gates) {
    const gn = nodeId.get(key(wall[g.k]))!;
    const path = dijkstra(gn, (n) => plazaNodes.has(n), insideCost);
    if (path) {
      for (let k = 0; k + 1 < path.length; k++) mainEdges.add(ekey(path[k], path[k + 1]));
      out.line('street', path.map((n) => P[n]));
    }
    if (!g.exit) continue;
    const ex = g.exit.p;
    let target = -1, bestD = Infinity;
    for (let n = 0; n < P.length; n++) {
      if (Math.abs(P[n][0]) >= B * 0.99 || Math.abs(P[n][1]) >= B * 0.99) continue;
      const d = Math.hypot(P[n][0] - ex[0], P[n][1] - ex[1]);
      if (d < bestD) {
        bestD = d;
        target = n;
      }
    }
    const road = target >= 0 ? dijkstra(gn, (n) => n === target, outsideCost) : null;
    const line = road ? road.map((n) => P[n]) : [wall[g.k]];
    // Skip the last graph vertex if it lies beyond the exit so the road doesn't double back.
    if (line.length > 1 && Math.hypot(...line[line.length - 1]) > Math.hypot(...ex)) line.pop();
    line.push(ex);
    for (let k = 0; road && k + 1 < road.length; k++) mainEdges.add(ekey(road[k], road[k + 1]));
    const smooth = chaikin(line, 2) as Pt[];
    roadLines.push(smooth);
    out.line('road', smooth, { cls: g.exit.cls });
  }

  // Special wards.
  const nbrs = (i: number) => Array.from(del.neighbors(i)).filter((j) => patches[j].inside);
  const free = (i: number) => patches[i].inside && patches[i].kind === '';
  const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const highest = (arr: number[]) => arr.reduce((a, b) => (terrain.height(patches[b].c) > terrain.height(patches[a].c) ? b : a));
  // Ground too steep to build on is left as wooded slopes.
  for (const i of inner) if (free(i) && terrain.slope(patches[i].c) > 0.22) patches[i].kind = 'park';
  if (!town || s.population > 1500) {
    const c = nbrs(plaza).filter(free);
    if (c.length) patches[highest(c)].kind = 'temple';
  }
  const touchesWall = (i: number) => {
    const p = patches[i].poly;
    return p.some((q, e) => wallEdges.has(`${key(q)}|${key(p[(e + 1) % p.length])}`));
  };
  const gateNodes = new Set(gates.map((g) => key(wall[g.k])));
  if (s.citadel && s.walls) {
    const c = inner.filter((i) => free(i) && touchesWall(i) && !nbrs(plaza).includes(i) && !patches[i].poly.some((q) => gateNodes.has(key(q))));
    if (c.length) patches[highest(c)].kind = 'citadel';
  }
  const nParks = inner.length >= 20 ? 2 : inner.length >= 10 ? 1 : 0;
  for (let k = 0; k < nParks; k++) {
    const c = inner.filter((i) => free(i) && !nbrs(plaza).includes(i));
    if (c.length) patches[pick(c)].kind = 'park';
  }
  const docks = addDocks(terrain, water, out, rnd, {
    maxR: Rin * 1.5, spacing: town ? 40 : 26, pierW: town ? 5 : 7,
    seaLen: town ? [20, 45] : [30, 80], boatLen: [12, 24], boatProb: 0.6, lighthouse: !town, ships: town ? 1 : 4,
  });
  for (const d of docks) {
    const i = inner.find((j) => free(j) && pointInPoly(patches[j].poly, d.p[0], d.p[1]));
    if (i !== undefined) patches[i].kind = 'harbour';
  }
  for (const i of inner) if (free(i)) patches[i].kind = !town && rnd() < 0.15 ? 'rich' : 'ward';

  const wallOff = s.walls ? 10 : 3;
  const offsets = (i: number, onWall: number, main: number, lane: number) => {
    const p = patches[i].poly;
    return p.map((q, e) => {
      const r = p[(e + 1) % p.length];
      if (wallEdges.has(`${key(q)}|${key(r)}`)) return onWall;
      const ek = ekey(nodeId.get(key(q))!, nodeId.get(key(r))!);
      return mainEdges.has(ek) ? main : lane;
    });
  };
  const trees = (poly: Poly, n: number, r0: number, r1: number) => {
    const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    for (let t = 0; t < n * 3 && n > 0; t++) {
      const p: Pt = [x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0)];
      if (!pointInPoly(poly, p[0], p[1]) || water(p)) continue;
      out.point('tree', p, { r: r0 + rnd() * (r1 - r0) });
      n--;
    }
  };

  for (const i of inner) {
    const pt = patches[i];
    if (!pt.inside) continue;
    switch (pt.kind) {
      case 'plaza': {
        const q = inset(pt.poly, offsets(i, wallOff, 3, 3));
        if (q) out.poly('plaza', q);
        break;
      }
      case 'temple': {
        const q = inset(pt.poly, offsets(i, wallOff, 4, 3));
        if (!q) break;
        out.poly('plaza', q);
        const t = rectIn(q, 0.4);
        if (t) out.poly('building', t, { use: 'temple' });
        break;
      }
      case 'citadel': {
        const q = inset(pt.poly, offsets(i, 4, 6, 6));
        if (!q) break;
        out.poly('plaza', q);
        out.line('wall', [...q, q[0]], { w: 3 });
        let last: Pt | null = null;
        for (const v of q) {
          if (last && Math.hypot(v[0] - last[0], v[1] - last[1]) < 15) continue;
          out.point('tower', v, { r: 4 });
          last = v;
        }
        const keep = rectIn(q, 0.22);
        if (keep) out.poly('building', keep, { use: 'keep' });
        break;
      }
      case 'park': {
        const q = inset(pt.poly, offsets(i, wallOff, 4, 2));
        if (!q) break;
        out.poly('green', q);
        trees(q, Math.min(40, Math.round(area(q) / 300)), 2.5, 4.5);
        break;
      }
      default: {
        const q = inset(pt.poly, offsets(i, wallOff, 4, 2));
        if (!q) break;
        const rich = pt.kind === 'rich', harbour = pt.kind === 'harbour';
        const rr = Math.hypot(...pt.c) / Rin;
        const minArea = (town ? 110 : 85) * (1 + 1.5 * rr * rr) * (rich ? 2.5 : harbour ? 3 : 1);
        // Blocks separated by alleys (terraces along the contours on slopes), then lots; lots off
        // the block edge become courtyards. Harbour wards are warehouses.
        const g = terrain.grad(pt.c), sl = Math.hypot(...g);
        const blocks = sl > 0.08
          ? strips(q, [g[0] / sl, g[1] / sl], 24 + 10 * rnd(), 3)
          : subdivide(q, minArea * (rich || harbour ? 6 : 14), rnd, 3, 1);
        for (const block of blocks) {
          for (const lot of subdivide(block, minArea, rnd)) {
            const onStreet = lot.some((v, k) => {
              const m = mid(v, lot[(k + 1) % lot.length]);
              return block.some((b, j) => distToSeg(m[0], m[1], b, block[(j + 1) % block.length]) < 0.3);
            });
            if (!onStreet && rnd() > 0.15) continue;
            if (rnd() < (rich ? 0.2 : 0.03)) continue;
            if (water(centroid(lot))) continue;
            out.poly('building', lot);
          }
        }
      }
    }
  }

  // Outside the walls: suburbs along the roads, then farmland.
  patches.forEach((pt, i) => {
    if (pt.inside || pt.water || pt.poly.length < 3) return;
    const d = Math.hypot(...pt.c);
    if (d > R) return;
    const dRoad = roadLines.length ? Math.min(...roadLines.map((l) => distToLine(l, pt.c[0], pt.c[1]))) : Infinity;
    if (dRoad < Math.sqrt(area(pt.poly) / Math.PI) + 15 && d < Rin * 1.9) {
      const q = inset(pt.poly, offsets(i, 3, 4, 1.5));
      if (!q) return;
      for (const lot of subdivide(q, 140, rnd)) {
        const lc = centroid(lot);
        if (Math.min(...roadLines.map((l) => distToLine(l, lc[0], lc[1]))) > 32 || rnd() > 0.85 || water(lc)) continue;
        out.poly('building', lot);
      }
      return;
    }
    const r = rnd();
    const steep = terrain.slope(pt.c) > 0.2;
    if (r < 0.1 || (steep && r < 0.6)) {
      const q = inset(pt.poly, 4);
      if (q) trees(q, Math.round(area(q) / 90), 2, 3);
      return;
    }
    const q = inset(pt.poly, offsets(i, 3, 5, 2.5));
    if (!q) return;
    if (r < 0.18 || steep) {
      out.poly('green', q);
      return;
    }
    for (const f of subdivide(q, 5000 + 6000 * rnd(), rnd)) {
      const fi = inset(f, 1.5);
      if (!fi || water(centroid(fi))) continue;
      out.poly('field', fi, { tone: rnd() });
      for (const l of hatch(fi, 6)) out.line('furrow', l);
    }
    if (rnd() < 0.25) {
      const k = Math.floor(rnd() * q.length);
      const v = toward(q[k], centroid(q), 14);
      const n = q[(k + 1) % q.length];
      const hc: Pt = [v[0], v[1]];
      if (!water(hc)) out.poly('building', rect(hc[0], hc[1], Math.atan2(n[1] - q[k][1], n[0] - q[k][0]), 11, 7));
    }
  });

  if (s.walls) drawWall(wall, gates.map((g) => g.k), water, out, town);
}

function drawWall(wall: Pt[], gateIdx: number[], water: (p: Pt) => boolean, out: PlanInput['out'], town: boolean): void {
  const n = wall.length;
  const gate = new Set(gateIdx);
  const segWater = wall.map((a, k) => water(mid(a, wall[(k + 1) % n])));
  const start = gateIdx.length ? gateIdx[0] : Math.max(0, segWater.indexOf(true));
  const w = town ? 3 : 4;
  let run: Pt[] = [];
  const flush = () => {
    if (run.length >= 2) out.line('wall', run, { w });
    run = [];
  };
  for (let t = 0; t < n; t++) {
    const k = (start + t) % n, k1 = (k + 1) % n;
    if (segWater[k]) {
      flush();
      continue;
    }
    const a = gate.has(k) ? toward(wall[k], wall[k1], GATE_HALF) : wall[k];
    const b = gate.has(k1) ? toward(wall[k1], wall[k], GATE_HALF) : wall[k1];
    if (run.length === 0 || gate.has(k)) {
      flush();
      run = [a];
    }
    run.push(b);
    if (gate.has(k1)) flush();
  }
  flush();

  let last: Pt | null = null;
  const towerR = town ? 3.5 : 4.5;
  for (let k = 0; k < n; k++) {
    const prev = (k + n - 1) % n;
    if (segWater[k] && segWater[prev]) continue;
    if (gate.has(k)) {
      out.point('tower', toward(wall[k], wall[prev], GATE_HALF + 1), { r: towerR });
      out.point('tower', toward(wall[k], wall[(k + 1) % n], GATE_HALF + 1), { r: towerR });
      last = wall[k];
      continue;
    }
    if (last && Math.hypot(wall[k][0] - last[0], wall[k][1] - last[1]) < 22) continue;
    out.point('tower', wall[k], { r: towerR });
    last = wall[k];
  }
}
