import { Delaunay } from 'd3-delaunay';
import { mulberry32 } from '../gen/rng';
import { chaikin } from '../gen/rivers';
import {
  type Poly, type Pt, area, ccw, centroid, compactness, distToLine, distToSeg, inset, pointInPoly, rect, rectIn, strips, subdivide,
} from './geom';
import { addDocks } from './harbour';
import type { PlanFeature, PlanInput } from './plan';
import { RIVER } from './terrain';
import { graves } from './kit';
import { type BuildingRef, type WardInfo, labelCity } from './naming';
import { BUILD_GROUND, contourStrips, plantField } from './ground';
import { type CityLayout, makeLayout } from './layout';
import { CULTURES } from '../names/cultures';

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
  kind: 'plaza' | 'temple' | 'citadel' | 'park' | 'harbour' | 'ward' | 'rich' | 'garrison' | 'graveyard' | '';
}

/**
 * Walled city / town in the manner of Watabou's Medieval Fantasy City Generator: Voronoi
 * patches on a sunflower spiral, the inner ones forming wards inside a wall with towers and
 * gates, main streets from each gate to the central plaza, a temple and citadel, terraced
 * buildings by recursive lot splitting, and suburbs and fields outside. Terrain shapes it:
 * the town grows onto gentle ground, streets avoid steep grades, blocks terrace along the
 * contours, the citadel and temple take the high ground, and shores get docks.
 */
export function buildCity({ s, exits, water, terrain, ground, out, names, culture }: PlanInput): void {
  const rnd = mulberry32(s.seed);
  const town = s.tier !== 'city';
  const nInner = town ? clamp(Math.round(s.population / 500) + 2, 4, 14) : clamp(Math.round(s.population / 900) + 3, 8, 40);
  const Rin = s.coreM, R = s.radiusM;
  // Layout: chosen for the site when the world was named; the direction it follows comes from
  // the local ground (river, shore, valley or the roads through it).
  const style: CityLayout = s.layout ?? 'radial';
  const lay = makeLayout(style, { rnd, nInner, Rin, R, axis: siteAxis(style, terrain, water, exits, Rin, rnd) });
  const nTotal = lay.pts.length;
  const pts = new Float64Array(nTotal * 2);
  lay.pts.forEach((p, i) => {
    pts[2 * i] = p[0];
    pts[2 * i + 1] = p[1];
  });
  const B = R * 1.4;
  let del = new Delaunay(pts);
  let vor = del.voronoi([-B, -B, B, B]);
  if (lay.lloyd) {
    // One Lloyd step on the inner patches evens out ward sizes.
    for (let i = 0; i < nTotal; i++) {
      if (lay.metric([pts[2 * i], pts[2 * i + 1]]) > Rin * 1.6) continue;
      const cp = vor.cellPolygon(i);
      if (!cp) continue;
      const c = centroid(cp.slice(0, -1) as Pt[]);
      pts[2 * i] = c[0];
      pts[2 * i + 1] = c[1];
    }
    del = new Delaunay(pts);
    vor = del.voronoi([-B, -B, B, B]);
  }

  const patches: Patch[] = [];
  for (let i = 0; i < nTotal; i++) {
    const cp = vor.cellPolygon(i);
    const poly = cp ? ccw(cp.slice(0, -1).map(([x, y]) => [x, y] as Pt)) : [];
    const c: Pt = poly.length >= 3 ? centroid(poly) : [pts[2 * i], pts[2 * i + 1]];
    patches.push({ poly, c, water: poly.length < 3 || water(c), inside: false, kind: '' });
  }
  // The ward holding each market centre comes first; then the walled core takes the wards
  // nearest in the layout's own shape, with steep ground counting as further away.
  const nucleusPatch = lay.nuclei.map((n) => del.find(n[0], n[1]));
  const cost = (i: number) => (nucleusPatch.includes(i) ? -1 : lay.metric(patches[i].c) * (1 + lay.slopeW * terrain.slope(patches[i].c)));
  const inner = patches
    .map((_, i) => i)
    .filter((i) => !patches[i].water && patches[i].poly.length >= 3 && lay.metric(patches[i].c) < Rin * 3)
    .sort((a, b) => cost(a) - cost(b))
    .slice(0, nInner);
  if (inner.length === 0) return;
  const shapeD = (p: Pt) => lay.metric(p);

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
  const edgeWater = new Map<string, number>();
  /**
   * Cost multiplier for the water along an edge: rivers are bridged (×8), but sea and lake
   * water is open water: dear, and impassable beyond a 150 m causeway.
   */
  const waterFactor = (u: number, v: number, ek: string) => {
    let w = edgeWater.get(ek);
    if (w === undefined) {
      const a = P[u], b = P[v], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(2, Math.ceil(L / 8));
      let river = 0, sea = 0;
      for (let k = 0; k < n; k++) {
        const p: Pt = [a[0] + ((b[0] - a[0]) * (k + 0.5)) / n, a[1] + ((b[1] - a[1]) * (k + 0.5)) / n];
        if (!water(p)) continue;
        if (terrain.typeAt(p) === RIVER) river++;
        else sea++;
      }
      const seaM = (sea / n) * L;
      w = seaM > 150 ? Infinity : 1 + (river > 0 ? 7 : 0) + 60 * (sea / n);
      edgeWater.set(ek, w);
    }
    return w;
  };
  const isWaterEdge = (u: number, v: number, ek: string) => waterFactor(u, v, ek) > 1;
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
  const grade = (u: number, v: number) => 1 + (Math.abs(nodeH[u] - nodeH[v]) / Math.max(1, len(u, v)) / lay.gradeRef) ** 2;

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

  const plaza = nucleusPatch.find((i) => patches[i].inside) ?? inner.find((i) => patches[i].inside) ?? inner[0];
  patches[plaza].kind = 'plaza';
  // A twin town's second core has its own market.
  const plazas = [plaza, ...nucleusPatch.filter((i) => i !== plaza && patches[i].inside && !patches[i].water)];
  for (const i of plazas) patches[i].kind = 'plaza';
  const plazaNodes = new Set(plazas.flatMap((i) => patches[i].poly.map((p) => nodeId.get(key(p))!)));
  const mainEdges = new Set<string>();
  const roadLines: Pt[][] = [];
  // For lettering: main streets and roads by gate, and every building with its ward.
  const streetRefs: { f: PlanFeature; pts: Pt[]; gate: number }[] = [];
  const roadRefs: { f: PlanFeature; pts: Pt[]; gate: number }[] = [];
  const buildingRefs: BuildingRef[] = [];
  const last = () => out.features[out.features.length - 1];
  const addBuilding = (poly: Poly, ward: number, props: Record<string, string | number | undefined>) => {
    out.poly('building', poly, props);
    buildingRefs.push({ f: last(), c: centroid(poly), ward });
  };

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
    return len(u, v) * grade(u, v) * waterFactor(u, v, ek);
  };

  for (const g of gates) {
    const gn = nodeId.get(key(wall[g.k]))!;
    const path = dijkstra(gn, (n) => plazaNodes.has(n), insideCost);
    if (path) {
      for (let k = 0; k + 1 < path.length; k++) mainEdges.add(ekey(path[k], path[k + 1]));
      if (path.length >= 2) {
        out.line('street', path.map((n) => P[n]));
        streetRefs.push({ f: last(), pts: path.map((n) => P[n]), gate: gates.indexOf(g) });
      }
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
    // No way over land (or a short crossing) to this exit: leave the road unbuilt.
    if (target >= 0 && !road) continue;
    const line = road ? road.map((n) => P[n]) : [wall[g.k]];
    // Skip the last graph vertex if it lies beyond the exit so the road doesn't double back.
    if (line.length > 1 && Math.hypot(...line[line.length - 1]) > Math.hypot(...ex)) line.pop();
    line.push(ex);
    for (let k = 0; road && k + 1 < road.length; k++) mainEdges.add(ekey(road[k], road[k + 1]));
    const smooth = chaikin(line, 2) as Pt[];
    roadLines.push(smooth);
    if (smooth.length < 2) continue;
    out.line('road', smooth, { cls: g.exit.cls });
    roadRefs.push({ f: last(), pts: smooth, gate: gates.indexOf(g) });
  }

  // The street joining a twin town's two markets (over the bridge, if a river parts them).
  for (let k = 1; k < plazas.length; k++) {
    const goal = new Set(patches[plazas[0]].poly.map((p) => nodeId.get(key(p))!));
    const startN = nodeId.get(key(patches[plazas[k]].poly[0]))!;
    const path = dijkstra(startN, (n) => goal.has(n), insideCost);
    if (path && path.length > 1) {
      for (let q = 0; q + 1 < path.length; q++) mainEdges.add(ekey(path[q], path[q + 1]));
      out.line('street', path.map((n) => P[n]));
      streetRefs.push({ f: last(), pts: path.map((n) => P[n]), gate: -1 });
    }
  }

  // Special wards.
  const nbrs = (i: number) => Array.from(del.neighbors(i)).filter((j) => patches[j].inside);
  const free = (i: number) => patches[i].inside && patches[i].kind === '';
  const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const highest = (arr: number[]) => arr.reduce((a, b) => (terrain.height(patches[b].c) > terrain.height(patches[a].c) ? b : a));
  // Ground too steep to build on is left as wooded slopes.
  for (const i of inner) if (free(i) && terrain.slope(patches[i].c) > 0.22) patches[i].kind = 'park';
  if (!town || s.population > 1500) {
    const c = plazas.flatMap((p) => nbrs(p)).filter(free);
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
  // A garrison beside the citadel (or by a gate), and a cemetery: an old park, or a ward on the wall.
  if (s.walls && (!town || s.population > 2500)) {
    const byCitadel = inner.filter((i) => free(i) && nbrs(i).some((j) => patches[j].kind === 'citadel'));
    const byGate = inner.filter((i) => free(i) && touchesWall(i) && patches[i].poly.some((q) => gateNodes.has(key(q))));
    const c = byCitadel.length ? byCitadel : byGate;
    if (c.length) patches[pick(c)].kind = 'garrison';
  }
  if (!town || s.population > 2000) {
    const parks = inner.filter((i) => patches[i].kind === 'park');
    const pc = patches[plaza].c;
    if (parks.length && rnd() < 0.6) {
      patches[parks.reduce((a, b) => (Math.hypot(patches[b].c[0] - pc[0], patches[b].c[1] - pc[1]) > Math.hypot(patches[a].c[0] - pc[0], patches[a].c[1] - pc[1]) ? b : a))].kind = 'graveyard';
    } else if (rnd() < 0.5) {
      const c = inner.filter((i) => free(i) && touchesWall(i) && !patches[i].poly.some((q) => gateNodes.has(key(q))));
      if (c.length) patches[pick(c)].kind = 'graveyard';
    }
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

  /** Paved ground under a ward or suburb, clipped to dry land: the gaps between its blocks read as streets and alleys. */
  const pave = (poly: Poly, surface: 'cobbles' | 'dirt') => {
    const q = ground.fit(poly, { maxSlope: 9, marginM: 0.5 }, rnd, 0, 0.2);
    if (q) out.poly('paving', q, { surface });
  };
  /** A lot worth building on: not a sliver, not a scrap, not on water or a crag. */
  // Piers start at the shore; keep buildings and yards off their landward ends.
  const nearDock = (poly: Poly, r: number) =>
    docks.some((dk) => pointInPoly(poly, dk.p[0], dk.p[1]) || distToLine([...poly, poly[0]], dk.p[0], dk.p[1]) < r);
  const goodLot = (lot: Poly, minArea: number) =>
    area(lot) >= minArea * 0.45 && compactness(lot) >= (lot.length === 3 ? 0.5 : 0.42) && ground.allOk(lot, BUILD_GROUND) && !nearDock(lot, 8);
  /** Yard behind the houses, fitted to dry ground clear of the shore (none on a quay or by a pier). */
  const yard = (block: Poly, surface?: string) => {
    if (nearDock(block, 6)) return;
    const q = ground.fit(block, { maxSlope: 9, marginM: 3 }, rnd, 0.6, 0.25);
    if (q) out.poly('yard', q, surface ? { surface } : {});
  };
  const touchesEdge = (lot: Poly, block: Poly) => lot.some((v, k) => {
    const m = mid(v, lot[(k + 1) % lot.length]);
    return block.some((b, j) => distToSeg(m[0], m[1], b, block[(j + 1) % block.length]) < 0.3);
  });

  for (const i of inner) {
    const pt = patches[i];
    if (!pt.inside) continue;
    pave(pt.poly, 'cobbles');
    switch (pt.kind) {
      case 'plaza': {
        const q0 = inset(pt.poly, offsets(i, wallOff, 3, 3));
        const q = q0 && ground.fit(q0, BUILD_GROUND, rnd, 0, 0.3);
        if (q) out.poly('plaza', q);
        break;
      }
      case 'temple': {
        const q0 = inset(pt.poly, offsets(i, wallOff, 4, 3));
        const q = q0 && ground.fit(q0, BUILD_GROUND, rnd, 0, 0.3);
        if (!q0 || !q) break;
        out.poly('plaza', q);
        const t = rectIn(q0, 0.4);
        if (t && ground.allOk(t, BUILD_GROUND)) out.poly('building', t, { use: 'temple' });
        break;
      }
      case 'citadel': {
        // The citadel wall follows the shore rather than standing in the water.
        const q0 = inset(pt.poly, offsets(i, 4, 6, 6));
        const q = q0 && ground.fit(q0, BUILD_GROUND, rnd, 0, 0.3);
        if (!q0 || !q) break;
        out.poly('plaza', q);
        out.line('wall', [...q, q[0]], { w: 3 });
        let last: Pt | null = null;
        for (const v of q) {
          if (last && Math.hypot(v[0] - last[0], v[1] - last[1]) < 15) continue;
          out.point('tower', v, { r: 4 });
          last = v;
        }
        const keep = rectIn(q0, 0.22);
        if (keep && ground.allOk(keep, BUILD_GROUND)) out.poly('building', keep, { use: 'keep' });
        break;
      }
      case 'park': {
        const q0 = inset(pt.poly, offsets(i, wallOff, 4, 2));
        const q = q0 && ground.fit(q0, { maxSlope: 1, marginM: 3 }, rnd, 0.8, 0.3);
        if (!q) break;
        out.poly('green', q);
        trees(q, Math.min(40, Math.round(area(q) / 300)), 2.5, 4.5);
        break;
      }
      case 'graveyard': {
        const q0 = inset(pt.poly, offsets(i, wallOff, 4, 2));
        const q = q0 && ground.fit(q0, { maxSlope: 0.3, marginM: 3 }, rnd, 0.5, 0.3);
        if (!q) break;
        out.poly('graveyard', q);
        out.line('hedge', [...q, q[0]]);
        graves(q, rnd, out, ground);
        trees(q, Math.min(10, Math.round(area(q) / 1500)), 2.5, 4);
        break;
      }
      default: {
        const q = inset(pt.poly, offsets(i, wallOff, 4, lay.laneW));
        if (!q) break;
        const rich = pt.kind === 'rich', harbour = pt.kind === 'harbour', garrison = pt.kind === 'garrison';
        const rr = shapeD(pt.c) / Rin;
        const minArea = (town ? 110 : 85) * (1 + 1.5 * rr * rr) * (rich ? 2.5 : harbour ? 3 : garrison ? 3.5 : 1);
        // A garrison keeps an open drill yard in the middle.
        const drill = garrison ? rectIn(q, 0.3) : null;
        if (drill) out.poly('plaza', drill);
        // Blocks separated by alleys (terraces along the contours on slopes), then lots; lots off
        // the block edge become courtyards. Harbour wards are warehouses.
        const g = terrain.grad(pt.c), sl = Math.hypot(...g);
        // Blocks small enough that every house fronts a street or alley (about two lots deep),
        // always parted by alleys at the first cuts; every lot must reach the block edge.
        // Every cut between blocks leaves an alley, so no block is walled in by its neighbours;
        // contour terraces are crossed by alleys too, so they never run unbroken across a ward.
        const blockArea = minArea * (rich || harbour ? 5 : 7);
        const alley = () => 2.8 + 1.4 * rnd();
        const blocks = sl > 0.08
          ? strips(q, [g[0] / sl, g[1] / sl], 22 + 8 * rnd(), 3.5).flatMap((st) => subdivide(st, blockArea, rnd, alley(), 1, [], 0, 1, lay.skew))
          : subdivide(q, blockArea, rnd, alley(), 1, [], 0, 1, lay.skew);
        for (const block of blocks) {
          if (area(block) < minArea * 0.6) continue;
          // Harbour wards are open quays: no yards, just cobbles between the warehouses.
          if (!harbour) yard(block);
          for (const lot of subdivide(block, minArea, rnd, 0, 0, [], 0, 0.7, lay.skew)) {
            if (!touchesEdge(lot, block)) continue;
            if (rnd() < (rich ? 0.2 : 0.04)) continue;
            if (!goodLot(lot, minArea)) continue;
            if (drill && lot.some((v) => pointInPoly(drill, v[0], v[1]))) continue;
            addBuilding(lot, i, { ctx: garrison ? 'ward' : pt.kind, front: streetFront(lot, block) });
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
    if (dRoad < Math.sqrt(area(pt.poly) / Math.PI) + 15 && shapeD(pt.c) < Rin * 1.9 && d < R * 0.9) {
      const q = inset(pt.poly, offsets(i, 3, 4, 1.5));
      if (!q) return;
      pave(pt.poly, 'dirt');
      // Small blocks with lanes between them; houses front the lanes, gardens fill the backs.
      for (const block of subdivide(q, 900 + 700 * rnd(), rnd, 3, 1, [], 0, 1, lay.skew)) {
        const bc = centroid(block);
        if (Math.min(...roadLines.map((l) => distToLine(l, bc[0], bc[1]))) > 45) {
          plantField(block, 'green', ground, out, rnd, 0.4);
          continue;
        }
        yard(block, 'garden');
        for (const lot of subdivide(block, 140, rnd)) {
          if (!touchesEdge(lot, block) || rnd() > 0.8 || !goodLot(lot, 140)) continue;
          addBuilding(lot, i, { ctx: 'suburb', front: streetFront(lot, block) ?? roadFront(centroid(lot), roadLines) });
        }
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
      plantField(q, 'green', ground, out, rnd, 0.3);
      return;
    }
    for (const f of subdivide(q, 5000 + 6000 * rnd(), rnd)) {
      const fi = inset(f, 1.5);
      if (!fi) continue;
      for (const st of contourStrips(fi, terrain, rnd, 0.2)) plantField(st, 'field', ground, out, rnd, 0.3);
    }
    if (rnd() < 0.25) {
      const k = Math.floor(rnd() * q.length);
      const v = toward(q[k], centroid(q), 14);
      const n = q[(k + 1) % q.length];
      const hc: Pt = [v[0], v[1]];
      const farm = rect(hc[0], hc[1], Math.atan2(n[1] - q[k][1], n[0] - q[k][0]), 11, 7);
      if (ground.allOk(farm, BUILD_GROUND)) addBuilding(farm, i, { ctx: 'farm' });
    }
  });

  if (s.walls) drawWall(wall, gates.map((g) => g.k), water, out, town);

  // Names: quarters, districts, streets and notable buildings.
  const suburb = patches.map((pt, i) => i).filter((i) => !patches[i].inside && !patches[i].water && buildingRefs.some((b) => b.ward === i && b.f.properties.ctx === 'suburb'));
  const wardInfo: WardInfo[] = patches.map((pt, i) => ({
    poly: pt.poly, c: pt.c, kind: pt.kind, inside: pt.inside,
    nbrs: Array.from(del.neighbors(i)),
    waterside: pt.poly.some((v) => water(v)) || water(pt.c),
    high: terrain.height(pt.c) > terrain.height([0, 0]) + 8,
  }));
  labelCity({
    names, culture, key: s.id, town, population: s.population, wards: wardInfo, inner: inner.filter((i) => patches[i].inside),
    outer: suburb, gates: gates.map((g) => wall[g.k]), streets: streetRefs, roads: roadRefs, buildings: buildingRefs, out, rnd,
  });
}

/**
 * The direction a town follows: along the river through it, along the shore, along the valley
 * (across the slope), or along the road through it; otherwise at random. Twin towns take the
 * river direction too, so their two cores sit on opposite banks.
 */
function siteAxis(style: CityLayout, terrain: PlanInput['terrain'], water: (p: Pt) => boolean, exits: PlanInput['exits'], Rin: number, rnd: () => number): Pt {
  const r0 = rnd() * Math.PI;
  const fallback: Pt = [Math.cos(r0), Math.sin(r0)];
  // Principal axis of a set of points.
  const axisOf = (ps: Pt[]): Pt | null => {
    if (ps.length < 6) return null;
    let mx = 0, my = 0;
    for (const p of ps) { mx += p[0] / ps.length; my += p[1] / ps.length; }
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of ps) { const x = p[0] - mx, y = p[1] - my; sxx += x * x; syy += y * y; sxy += x * y; }
    const a = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    return [Math.cos(a), Math.sin(a)];
  };
  const river: Pt[] = [], sea: Pt[] = [];
  const reach = Rin * 1.6, step = Math.max(10, Rin / 12);
  for (let y = -reach; y <= reach; y += step) {
    for (let x = -reach; x <= reach; x += step) {
      if (x * x + y * y > reach * reach) continue;
      const p: Pt = [x, y];
      if (!water(p)) continue;
      (terrain.typeAt(p) === RIVER ? river : sea).push(p);
    }
  }
  const rv = axisOf(river);
  if (rv) return rv;
  // Shore: across the mean direction to the water.
  if (sea.length >= 6 && style !== 'grid') {
    let sx = 0, sy = 0;
    for (const p of sea) { const d = Math.hypot(p[0], p[1]) || 1; sx += p[0] / d; sy += p[1] / d; }
    const l = Math.hypot(sx, sy);
    if (l > 0.5) return [-sy / l, sx / l];
  }
  // Roads: two exits roughly opposite make a through road.
  const ang = exits.map((e) => Math.atan2(e.p[1], e.p[0]));
  for (let a = 0; a < ang.length; a++) {
    for (let b = a + 1; b < ang.length; b++) {
      if (Math.cos(ang[a] - ang[b]) < -0.7) {
        const dx = Math.cos(ang[a]) - Math.cos(ang[b]), dy = Math.sin(ang[a]) - Math.sin(ang[b]);
        const l = Math.hypot(dx, dy) || 1;
        return [dx / l, dy / l];
      }
    }
  }
  // Valley or hillside: along the contours.
  const g = terrain.grad([0, 0]), gl = Math.hypot(g[0], g[1]);
  if (gl > 0.03) return [-g[1] / gl, g[0] / gl];
  if (ang.length) return [Math.cos(ang[0]), Math.sin(ang[0])];
  return fallback;
}

/** Outward direction (radians, local frame) of the lot edge lying on its block's edge: the street front. */
function streetFront(lot: Poly, block: Poly): number | undefined {
  const c = centroid(lot);
  let best: number | undefined, bestLen = 0;
  for (let k = 0; k < lot.length; k++) {
    const a = lot[k], b = lot[(k + 1) % lot.length];
    const m = mid(a, b);
    if (!block.some((p, j) => distToSeg(m[0], m[1], p, block[(j + 1) % block.length]) < 0.3)) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len <= bestLen) continue;
    bestLen = len;
    best = Math.atan2(m[1] - c[1], m[0] - c[0]);
  }
  return best;
}

/** Direction (radians) from a point toward the nearest road. */
function roadFront(c: Pt, roads: Pt[][]): number | undefined {
  let best: Pt | null = null, bd = Infinity;
  for (const l of roads) {
    for (let k = 0; k + 1 < l.length; k++) {
      const a = l[k], b = l[k + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / l2)) : 0;
      const p: Pt = [a[0] + dx * t, a[1] + dy * t];
      const d = Math.hypot(p[0] - c[0], p[1] - c[1]);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
  }
  return best ? Math.atan2(best[1] - c[1], best[0] - c[0]) : undefined;
}

/**
 * Town wall with towers and gate gaps. The wall is walked in short pieces so it stops at the
 * shore (with a tower at each end) instead of striding across a bay between two corners.
 */
function drawWall(corners: Pt[], gateIdx: number[], water: (p: Pt) => boolean, out: PlanInput['out'], town: boolean): void {
  const wall: Pt[] = [];
  const corner: boolean[] = [];
  const gate = new Set<number>();
  const gateSet = new Set(gateIdx);
  corners.forEach((a, k) => {
    const b = corners[(k + 1) % corners.length];
    const m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 14));
    if (gateSet.has(k)) gate.add(wall.length);
    for (let t = 0; t < m; t++) {
      wall.push([a[0] + ((b[0] - a[0]) * t) / m, a[1] + ((b[1] - a[1]) * t) / m]);
      corner.push(t === 0);
    }
  });
  const n = wall.length;
  const segWater = wall.map((a, k) => water(mid(a, wall[(k + 1) % n])) || water(a));
  const start = gate.size ? [...gate][0] : Math.max(0, segWater.indexOf(true));
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
    // Towers at the corners, and where the wall meets the water.
    const shoreEnd = segWater[k] !== segWater[prev];
    if (!corner[k] && !shoreEnd) continue;
    if (!shoreEnd && last && Math.hypot(wall[k][0] - last[0], wall[k][1] - last[1]) < 22) continue;
    out.point('tower', wall[k], { r: towerR });
    last = wall[k];
  }
}
