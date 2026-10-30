import { Delaunay } from 'd3-delaunay';
import { mulberry32 } from '../gen/rng';
import { chaikin } from '../gen/rivers';
import {
  type Poly, type Pt, area, blob, ccw, centroid, compactness, distToLine, distToSeg, frontRect, inset, longestEdge, pointInPoly, rect, rectIn, rectangularity,
  strips, subdivide,
} from './geom';
import { addDocks } from './harbour';
import type { PlanFeature, PlanInput } from './plan';
import { RIVER } from './terrain';
import { graves } from './kit';
import { type BuildingRef, type WardInfo, type WardKind, labelCity } from './naming';
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
  kind: WardKind;
}

/**
 * Walled city / town in the manner of Watabou's Medieval Fantasy City Generator: Voronoi
 * patches on a sunflower spiral, the inner ones forming wards inside a wall with towers and
 * gates, main streets from each gate to the central plaza, a temple and citadel, terraced
 * buildings by recursive lot splitting, and suburbs and fields outside. Terrain shapes it:
 * the town grows onto gentle ground, streets avoid steep grades, blocks terrace along the
 * contours, the citadel and temple take the high ground, and shores get docks.
 */
export function buildCity({ s, exits, water, terrain, ground, out, names, culture, theme, holy }: PlanInput): void {
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

  // Canals: in a canal city, waterways take the place of some of the lesser streets, from water
  // gates in the wall where it meets the water to basins by the market, with bridges where the
  // main streets cross them.
  const canalEdges = new Set<string>();
  const CANAL_W = town ? 6 : 8;
  if (theme === 'canal') {
    const inEdge = (ek: string) => {
      const cells = edgeCells.get(ek)!;
      return cells.length === 2 && cells.every((i) => patches[i].inside);
    };
    const canalCost = (u: number, v: number, ek: string) =>
      mainEdges.has(ek) || !inEdge(ek) || isWaterEdge(u, v, ek) ? Infinity : len(u, v) * (canalEdges.has(ek) ? 0.3 : 1) * (1 + 0.4 * rnd());
    // Wall corners near the water, spread round the wall.
    const toWater = (p: Pt): Pt | null => {
      let best: Pt | null = null, bd = Infinity;
      for (let a = 0; a < 16; a++) {
        const ca = Math.cos((a / 16) * Math.PI * 2), sa = Math.sin((a / 16) * Math.PI * 2);
        for (let d = 8; d <= 200; d += 8) {
          const q: Pt = [p[0] + ca * d, p[1] + sa * d];
          if (!water(q)) continue;
          if (d < bd) {
            bd = d;
            best = q;
          }
          break;
        }
      }
      return best;
    };
    // Only corners where a lesser street runs in from the wall can start a canal.
    const opens = (k: number) => adj[nodeId.get(key(wall[k]))!].some((e) => inEdge(e.ek) && !mainEdges.has(e.ek));
    const starts = wall.map((p, k) => ({ k, w: water(p) || !opens(k) ? null : toWater(p) })).filter((x) => x.w && !gates.some((g) => g.k === x.k))
      .map((x) => ({ ...x, d: Math.hypot(x.w![0] - wall[x.k][0], x.w![1] - wall[x.k][1]) })).sort((a, b) => a.d - b.d);
    // Wall corners that open on the water: a water gate leads in from each.
    const gateOf = new Map<number, Pt>();
    for (const st of starts) gateOf.set(nodeId.get(key(wall[st.k]))!, st.w!);
    // Canals start at points spread through the city (by farthest-point sampling over the inner
    // street corners) and run to a water gate, to the river or shore, or to a canal already dug.
    const innerNodes = [...new Set(inner.filter((i) => patches[i].inside).flatMap((i) => patches[i].poly.map((p) => nodeId.get(key(p))!)))]
      .filter((n) => !wallNode.has(n) && adj[n].some((e) => inEdge(e.ek) && !mainEdges.has(e.ek)));
    const sources: number[] = [];
    if (innerNodes.length) sources.push(innerNodes.reduce((a, b) => (Math.hypot(...P[b]) < Math.hypot(...P[a]) ? b : a)));
    while (sources.length < (town ? 3 : 6) && sources.length < innerNodes.length) {
      let best = -1, bd = -1;
      for (const n of innerNodes) {
        const d = Math.min(...sources.map((q) => Math.hypot(P[n][0] - P[q][0], P[n][1] - P[q][1])));
        if (d > bd) {
          bd = d;
          best = n;
        }
      }
      if (best < 0 || bd < 60) break;
      sources.push(best);
    }
    const bridged = new Set<number>();
    const gated = new Set<number>();
    for (const n0 of sources) {
      const goal = (n: number) => n !== n0 && (gateOf.has(n) || adj[n].some((e) => canalEdges.has(e.ek) || isWaterEdge(n, e.to, e.ek)));
      const path = dijkstra(n0, goal, canalCost);
      if (!path || path.length < 3) continue;
      for (let k = 0; k + 1 < path.length; k++) canalEdges.add(ekey(path[k], path[k + 1]));
      const end = path[path.length - 1];
      const line: Pt[] = path.map((n) => P[n]);
      // Out through a water gate to the open water.
      const w = gateOf.get(end);
      if (w && !gated.has(end)) {
        gated.add(end);
        line.push(w);
        const a = P[end], b = P[path[path.length - 2]], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, off = CANAL_W / 2 + 2;
        out.point('tower', [a[0] + nx * off, a[1] + ny * off], { r: town ? 3 : 3.8 });
        out.point('tower', [a[0] - nx * off, a[1] - ny * off], { r: town ? 3 : 3.8 });
      }
      out.line('canal', line, { w: CANAL_W });
      for (const n of path) {
        const street = adj[n].find((e) => mainEdges.has(e.ek));
        if (!street || bridged.has(n)) continue;
        bridged.add(n);
        const d = [P[street.to][0] - P[n][0], P[street.to][1] - P[n][1]];
        out.poly('bridge', rect(P[n][0], P[n][1], Math.atan2(d[1], d[0]), CANAL_W + 6, 5.5));
      }
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
  // A fortress city has a citadel whether or not one was planned.
  if ((s.citadel || theme === 'fortress') && s.walls) {
    const c = inner.filter((i) => free(i) && touchesWall(i) && !nbrs(plaza).includes(i) && !patches[i].poly.some((q) => gateNodes.has(key(q))));
    if (c.length) patches[highest(c)].kind = 'citadel';
  }
  const nParks = inner.length >= 20 ? 2 : inner.length >= 10 ? 1 : 0;
  for (let k = 0; k < nParks; k++) {
    const c = inner.filter((i) => free(i) && !nbrs(plaza).includes(i));
    if (c.length) patches[pick(c)].kind = 'park';
  }
  const docks = addDocks(terrain, water, out, rnd, {
    maxR: Rin * 1.5, spacing: town ? 40 : theme === 'merchant' ? 18 : 26, pierW: town ? 5 : 7,
    seaLen: town ? [20, 45] : [30, 80], boatLen: [12, 24], boatProb: 0.6, lighthouse: !town, ships: town ? 1 : 4,
  });
  for (const d of docks) {
    const i = inner.find((j) => free(j) && pointInPoly(patches[j].poly, d.p[0], d.p[1]));
    if (i !== undefined) patches[i].kind = 'harbour';
  }
  /** A quarter: contiguous free wards grown from a seed, kept off the market's edge. */
  const grow = (seed: number, n: number) => {
    const got = [seed];
    for (let t = 0; t < 20 && got.length < n; t++) {
      const c = got.flatMap((g) => nbrs(g)).filter((j) => free(j) && !got.includes(j) && !nbrs(plaza).includes(j));
      if (!c.length) break;
      got.push(pick(c));
    }
    return got;
  };
  const waterside = (i: number) => patches[i].poly.some((v) => water(v)) || nbrs(i).length < Array.from(del.neighbors(i)).length;
  const offMarket = () => inner.filter((i) => free(i) && !plazas.some((pz) => nbrs(pz).includes(i)));
  /**
   * The wards a city theme sets aside: a second market and a counting-house quarter (merchant),
   * a rookery on the low ground by the water or the wall (thieves), a ruined quarter (rebuilt), a
   * forge quarter by a gate (forge), the mages' tower on the high ground (mages), and a pilgrims'
   * square beside the temple (pilgrim).
   */
  const themeWards = () => {
    switch (theme) {
      case 'merchant': {
        const m = nbrs(plaza).filter(free);
        if (m.length && !town) patches[pick(m)].kind = 'plaza';
        const cq = plazas.flatMap((pz) => nbrs(pz)).filter(free).sort(() => rnd() - 0.5);
        for (const i of cq.slice(0, town ? 1 : 3)) patches[i].kind = 'counting';
        break;
      }
      case 'thieves': {
        const c = offMarket();
        if (!c.length) break;
        const score = (i: number) => terrain.height(patches[i].c) - (waterside(i) ? 15 : 0) - (touchesWall(i) ? 8 : 0);
        const seed = c.reduce((a, b) => (score(b) < score(a) ? b : a));
        for (const i of grow(seed, town ? 1 : 2 + Math.floor(rnd() * 2))) patches[i].kind = 'slum';
        break;
      }
      case 'rebuilt': {
        const c = offMarket();
        if (c.length) for (const i of grow(pick(c), town ? 1 : 2 + Math.floor(rnd() * 2))) patches[i].kind = 'ruins';
        break;
      }
      case 'forge': {
        const g = offMarket().filter((i) => touchesWall(i) && patches[i].poly.some((q) => gateNodes.has(key(q))));
        const c = g.length ? g : offMarket();
        if (c.length) for (const i of grow(pick(c), town ? 1 : 2)) patches[i].kind = 'forge';
        break;
      }
      case 'mages': {
        const c = offMarket();
        if (c.length) patches[highest(c)].kind = 'tower';
        break;
      }
      case 'pilgrim': {
        const t = inner.find((i) => patches[i].kind === 'temple');
        const c = t !== undefined ? nbrs(t).filter(free) : [];
        if (c.length) patches[pick(c)].kind = 'pilgrims';
        break;
      }
    }
  };
  // A garrison beside the citadel (or by a gate), and a cemetery: an old park, or a ward on the wall.
  if (s.walls && (!town || s.population > 2500)) {
    const byCitadel = inner.filter((i) => free(i) && nbrs(i).some((j) => patches[j].kind === 'citadel'));
    const byGate = inner.filter((i) => free(i) && touchesWall(i) && patches[i].poly.some((q) => gateNodes.has(key(q))));
    const c = byCitadel.length ? byCitadel : byGate;
    if (c.length) patches[pick(c)].kind = 'garrison';
    // A fortress city keeps a larger garrison: more barracks wards by the gates.
    if (theme === 'fortress') {
      for (let k = 0; k < (town ? 1 : 2); k++) {
        const g = inner.filter((i) => free(i) && touchesWall(i) && patches[i].poly.some((q) => gateNodes.has(key(q))));
        if (g.length) patches[pick(g)].kind = 'garrison';
      }
    }
  }
  themeWards();
  // A mage's tower or a university's college of magic (gen/special.ts), on the high ground.
  if (s.tower && theme !== 'mages') {
    const c = offMarket();
    if (c.length) patches[highest(c)].kind = 'tower';
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
  // A prison keep (gen/prisons.ts): a ward on the wall away from the market, the last such in
  // the plan's order (chosen without the plan's random stream, so the rest of the plan keeps it).
  if (s.prison) {
    const cand = inner.filter((i) => patches[i].inside && (patches[i].kind === 'ward' || patches[i].kind === 'rich') && !plazas.some((pz) => nbrs(pz).includes(i)));
    const onWall = cand.filter((i) => touchesWall(i) && !patches[i].poly.some((q) => gateNodes.has(key(q))));
    const pickP = (onWall.length ? onWall : cand).at(-1);
    if (pickP !== undefined) patches[pickP].kind = 'prison';
  }

  const wallOff = s.walls ? 10 : 3;
  const offsets = (i: number, onWall: number, main: number, lane: number) => {
    const p = patches[i].poly;
    return p.map((q, e) => {
      const r = p[(e + 1) % p.length];
      if (wallEdges.has(`${key(q)}|${key(r)}`)) return onWall;
      const ek = ekey(nodeId.get(key(q))!, nodeId.get(key(r))!);
      if (canalEdges.has(ek)) return CANAL_W / 2 + 2.5;
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

  /**
   * A large rectangle (to `frac` of it) in a polygon, `margin` m inside it, as a local frame:
   * T(u, v) with u along the long side (|u| <= W/2). It tries centres about the middle, the
   * directions of the longer edges and a few proportions, and keeps the largest, so a ward with a
   * ragged shore still finds its open ground.
   */
  const frameIn = (q: Poly, margin: number, frac = 1) => {
    // A rectangle (grown by the margin) lies inside when its corners do and no vertex of the
    // polygon pokes into it (an inset of a ragged polygon is unreliable).
    const fits = (c: Pt, ang: number, w: number, h: number) => {
      const cs = Math.cos(ang), sn = Math.sin(ang), hw = w / 2 + margin, hh = h / 2 + margin;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = c[0] + su * hw * cs - sv * hh * sn, y = c[1] + su * hw * sn + sv * hh * cs;
        if (!pointInPoly(q, x, y)) return false;
      }
      for (const [x, y] of q) {
        const dx = x - c[0], dy = y - c[1];
        if (Math.abs(dx * cs + dy * sn) < hw && Math.abs(-dx * sn + dy * cs) < hh) return false;
      }
      return true;
    };
    const c0 = centroid(q);
    const lens = q.map((p, k) => Math.hypot(q[(k + 1) % q.length][0] - p[0], q[(k + 1) % q.length][1] - p[1]));
    const maxLen = Math.max(...lens);
    const angs = q.map((p, k) => ({ k, len: lens[k] })).filter((x) => x.len >= maxLen * 0.3).sort((x, y) => y.len - x.len).slice(0, 4)
      .map(({ k }) => Math.atan2(q[(k + 1) % q.length][1] - q[k][1], q[(k + 1) % q.length][0] - q[k][0]));
    const centres: Pt[] = [c0];
    // Up to eight directions out from the middle (a ragged shore has hundreds of vertices).
    const stepV = Math.max(1, Math.floor(q.length / 8));
    for (let k = 0; k < q.length; k += stepV) for (const t of [0.25, 0.45]) centres.push([c0[0] + (q[k][0] - c0[0]) * t, c0[1] + (q[k][1] - c0[1]) * t]);
    let best: { c: Pt; ang: number; W: number; H: number } | null = null;
    for (const c of centres) {
      if (!fits(c, 0, 0, 0)) continue;
      for (const ang of angs) {
        for (const asp of [1, 1.4, 2]) {
          let lo = 0, hi = maxLen * 1.5;
          for (let t = 0; t < 12; t++) {
            const m = (lo + hi) / 2;
            if (fits(c, ang, m * asp, m)) lo = m;
            else hi = m;
          }
          if (!best || lo * lo * asp > best.W * best.H) best = { c, ang, W: lo * asp, H: lo };
        }
      }
    }
    if (!best) return null;
    let { W, H, ang } = best;
    const c = best.c;
    W *= Math.sqrt(frac);
    H *= Math.sqrt(frac);
    if (W < 8 || H < 8) return null;
    if (H > W) {
      [W, H] = [H, W];
      ang += Math.PI / 2;
    }
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const T = (u: number, v: number): Pt => [c[0] + u * ca - v * sa, c[1] + u * sa + v * ca];
    const box = (u: number, v: number, w: number, h: number): Poly => [T(u - w / 2, v - h / 2), T(u + w / 2, v - h / 2), T(u + w / 2, v + h / 2), T(u - w / 2, v + h / 2)];
    return { T, box, W, H, ang };
  };

  /**
   * A market: double rows of stalls with aisles between, turned to the square's long side, a
   * fountain (in a city) or a well at the heart, and a few carts drawn up at the edges.
   */
  const market = (q: Poly, city: boolean, dense = false) => {
    const f = frameIn(q, 4);
    if (!f) return;
    const { T, box, W, H, ang } = f;
    const rC = city ? 3.4 : 1.6;
    out.point(city ? 'fountain' : 'well', T(0, 0), { r: rC });
    const clearC = rC + 6;
    // Back-to-back pairs of stalls in short runs of three to five, with lanes between the rows
    // and cross aisles between the runs; a run here and there is left out for an open pitch.
    // A merchant city's markets are fuller: closer rows and fewer gaps.
    for (let v = -H / 2 + 3; v + 4.6 <= H / 2 - 3; v += dense ? 9.4 : 11) {
      let u = -W / 2 + 2 + rnd() * 4;
      while (u + 3 <= W / 2 - 2) {
        const run = 3 + Math.floor(rnd() * 3), bare = rnd() < (dense ? 0.06 : 0.2);
        for (let k = 0; k < run && u + 3 <= W / 2 - 2; k++, u += 3.3) {
          if (bare) continue;
          for (const side of [0, 2.4]) {
            const cu = u + 1.5, cv = v + side + 1.1;
            if (Math.hypot(cu, cv) < clearC || rnd() < 0.12) continue;
            const st = box(cu, cv, 3, 2.2);
            if (!st.every((p) => pointInPoly(q, p[0], p[1]) && !water(p))) continue;
            out.poly('stall', st, { tone: Math.floor(rnd() * 4) });
          }
        }
        u += 5 + rnd() * 3;
      }
    }
    for (let k = 0, n = 2 + Math.floor(rnd() * 4); k < n; k++) {
      const p = T((rnd() - 0.5) * W, (rnd() < 0.5 ? -1 : 1) * (H / 2 + 1.5));
      if (pointInPoly(q, p[0], p[1]) && !water(p)) out.poly('wagon', rect(p[0], p[1], ang + (rnd() - 0.5) * 0.4, 4, 1.8));
    }
  };

  /**
   * A temple close: the temple itself along one side, church-proportioned rather than filling
   * the ward; on a large enough ward a cloister beside it (a garth with the priests' ranges on
   * three sides), and the graveyard with trees on the rest.
   */
  const templeClose = (q: Poly, holyMode: '' | 'shrine' | 'great' = '') => {
    const f = frameIn(q, 3);
    if (!f) {
      const t = rectIn(q, 0.3);
      if (t && ground.allOk(t, BUILD_GROUND)) out.poly('building', t, { use: 'temple' });
      return;
    }
    const { box, W, H } = f;
    // The temple: long and narrow, its front to the open side of the close.
    // A holy city's great temple is larger.
    const great = holyMode === 'great';
    const L = Math.min(W * (great ? 0.72 : 0.62), great ? 66 : 46), B = Math.min(H * (great ? 0.46 : 0.42), L / (great ? 2.2 : 2.3), great ? 26 : 18);
    const tu = -W / 2 + L / 2, tv = H / 2 - B / 2;
    const temple = box(tu, tv, L, B);
    if (ground.allOk(temple, BUILD_GROUND)) out.poly('building', temple, { use: 'temple', ...(great ? { great: 1 } : {}) });
    // What makes the place holy: a shrine or reliquary beyond the temple's end (a holy spring
    // rises beside it).
    let endU = -W / 2 + L;
    if (holyMode && holy) {
      const w = holy.what;
      const name = /tomb/.test(w) ? 'the Saint\'s Tomb' : /relic/.test(w) ? 'the Reliquary' : /spring/.test(w) ? 'the Holy Spring'
        : /miracle/.test(w) ? 'the Shrine of the Miracle' : /preached|born|birthplace/.test(w) ? 'the Holy Shrine' : 'the Shrine';
      const sh = box(endU + 8, tv, 9, Math.min(B, 7));
      if (endU + 14 < W / 2 && ground.allOk(sh, BUILD_GROUND)) {
        out.poly('building', sh, { role: 'shrine', label: name });
        out.point('blabel', box(endU + 8, tv, 0, 0)[0], { name, role: 'shrine' });
        if (/spring/.test(w)) out.point('well', box(endU + 8, tv - Math.min(B, 7) / 2 - 3, 0, 0)[0], { r: 1.6 });
        endU += 16;
      }
    }
    // The cloister under the temple's flank, if there is room for it.
    const C = Math.min(H - B - 4, W * 0.42, 34);
    let cloisterU = Infinity;
    if (C >= 18) {
      const cu = tu + L / 2 - C / 2, cv = tv - B / 2 - 1 - C / 2;
      cloisterU = cu - C / 2;
      const d = 6;
      const ranges: [Poly, string][] = [
        [box(cu - C / 2 + d / 2, cv, d, C), 'Chapter house'],
        [box(cu + C / 2 - d / 2, cv, d, C), 'Priests\' lodging'],
        [box(cu, cv - C / 2 + d / 2, C - 2 * d, d), 'Refectory'],
      ];
      out.poly('green', box(cu, cv, C - 2 * d - 2, C - d - 2));
      out.point('well', box(cu, cv, 0, 0)[0], { r: 1.2 });
      for (const [r] of ranges) if (ground.allOk(r, BUILD_GROUND)) out.poly('building', r, { ctx: 'monastery' });
    }
    // The graveyard on the open ground: beyond the temple's end if the close runs on past it,
    // or else beside the cloister.
    const plots: [number, number, number, number][] = [];
    const ew = W / 2 - 1 - (endU + 3);
    if (ew >= 10) plots.push([endU + 3 + Math.min(ew, 40) / 2, H / 2 - 1 - Math.min(H - 2, 50) / 2, Math.min(ew, 40), Math.min(H - 2, 50)]);
    const gw = Math.min(cloisterU + W / 2 - 3, W * 0.5), gh = H - B - 4;
    if (gw >= 10 && gh >= 8) plots.push([-W / 2 + gw / 2, tv - B / 2 - 2 - gh / 2, gw, gh]);
    const plot = plots.sort((a, b) => b[2] * b[3] - a[2] * a[3])[0];
    if (plot) {
      const yard = box(...plot);
      if (yard.every((p) => !water(p))) {
        out.poly('graveyard', yard);
        out.line('hedge', [...yard, yard[0]]);
        graves(yard, rnd, out, ground);
        trees(yard, Math.min(6, Math.round(area(yard) / 400)), 2.5, 4);
      }
    }
  };

  /**
   * A castle within the citadel wall. A small citadel is one ward: the keep in a corner, ranges
   * against the curtain (the great hall, a chapel, barracks, stables and storehouses), a well and
   * an open bailey. A large one holds an inner ward of that kind behind its own wall in the keep's
   * corner, and an outer bailey with a tiltyard, a garden or orchard, and the stables, smithy and
   * barracks along the outer wall.
   */
  type Role = Record<string, string | undefined>;
  const depthOf = (r: Role) => (r.use === 'hall' ? 10 : r.use === 'temple' ? 8 : 7);
  const lenOf = (r: Role) => (r.use === 'hall' ? 24 : r.use === 'temple' ? 14 : r.role === 'smithy' ? 10 : 18);
  /**
   * Ranges along the sides of a w×h court centred at (cu, cv) in a frame: each in turn goes to
   * the side with the most room left, clear of the corner (ku, kv) where a keep of side ks stands.
   * `open` names sides left bare (they face the rest of the bailey).
   */
  const ranges = (box: (u: number, v: number, w: number, h: number) => Poly, cu: number, cv: number, w: number, h: number,
    roles: Role[], ku: number, kv: number, ks: number, open: string[] = []) => {
    type Side = { id: string; along: 'u' | 'v'; at: number; inward: number; p: number; to: number };
    const kc = ks + 3;
    const sides: Side[] = [
      { id: 'v-', along: 'u', at: cv - h / 2, inward: 1, p: cu - w / 2 + (kv < 0 && ku < 0 ? kc : 2), to: cu + w / 2 - (kv < 0 && ku > 0 ? kc : 2) },
      { id: 'v+', along: 'u', at: cv + h / 2, inward: -1, p: cu - w / 2 + (kv > 0 && ku < 0 ? kc : 2), to: cu + w / 2 - (kv > 0 && ku > 0 ? kc : 2) },
      // The short sides start clear of the long sides' ranges (up to 10 m deep).
      { id: 'u-', along: 'v', at: cu - w / 2, inward: 1, p: cv - h / 2 + (ku < 0 && kv < 0 ? kc : 12), to: cv + h / 2 - (ku < 0 && kv > 0 ? kc : 12) },
      { id: 'u+', along: 'v', at: cu + w / 2, inward: -1, p: cv - h / 2 + (ku > 0 && kv < 0 ? kc : 12), to: cv + h / 2 - (ku > 0 && kv > 0 ? kc : 12) },
    ].filter((sd) => !open.includes(sd.id)) as Side[];
    for (const r of roles) {
      const want = lenOf(r);
      const sd = sides.reduce((a, b) => (b.to - b.p > a.to - a.p ? b : a));
      const len = Math.min(want, sd.to - sd.p);
      if (len < 9) break;
      const d = depthOf(r), mid = sd.p + len / 2;
      const b = sd.along === 'u' ? box(mid, sd.at + sd.inward * d / 2, len, d) : box(sd.at + sd.inward * d / 2, mid, d, len);
      if (ground.allOk(b, BUILD_GROUND)) out.poly('building', b, r);
      sd.p += len + 3 + rnd() * 3;
    }
  };
  const castle = (q: Poly) => {
    const f = frameIn(q, 3);
    if (!f) {
      const keep = rectIn(q, 0.18);
      if (keep && ground.allOk(keep, BUILD_GROUND)) out.poly('building', keep, { use: 'keep' });
      return;
    }
    const { T, box, W, H } = f;
    const su = rnd() < 0.5 ? 1 : -1, sv = rnd() < 0.5 ? 1 : -1;
    // The inner ward: the whole frame, or for a large citadel a court in the keep's corner.
    const big = W > 84 || H > 66;
    const Wi = big ? Math.min(W * 0.6, 84) : W, Hi = big ? Math.min(H * 0.64, 66) : H;
    const cu = (su * (W - Wi)) / 2, cv = (sv * (H - Hi)) / 2;
    const ks = Math.max(10, Math.min(big ? 20 : 18, Math.min(Wi, Hi) * 0.4));
    const keep = box(cu + su * (Wi / 2 - ks / 2), cv + sv * (Hi / 2 - ks / 2), ks, ks);
    if (ground.allOk(keep, BUILD_GROUND)) out.poly('building', keep, { use: 'keep' });
    out.point('well', T(cu - su * Wi * 0.12, cv - sv * Hi * 0.1), { r: 1.4 });
    if (Wi >= 30 && Hi >= 22) {
      const inner: Role[] = [{ use: 'hall' }, { use: 'temple', ctx: 'castle' }, { role: 'barracks', ctx: 'ward' }, { use: 'store' }, { use: 'store' }];
      if (!big) inner.push({ role: 'stables', ctx: 'ward' }, { role: 'smithy', ctx: 'ward' }, { use: 'store' }, { role: 'barracks', ctx: 'ward' });
      ranges(box, cu, cv, Wi, Hi, inner, su, sv, ks);
    }
    if (!big) return;
    // The inner curtain, with towers at its corners and a gate in the side facing the bailey.
    const c = box(cu, cv, Wi, Hi);
    out.line('wall', [...c, c[0]], { w: 2 });
    for (const v of c) out.point('tower', v, { r: 3 });
    // The outer bailey: an L of open ground round the inner ward.
    const stripW = W - Wi, stripH = H - Hi;
    const outer: Role[] = [{ role: 'stables', ctx: 'ward' }, { role: 'smithy', ctx: 'ward' }, { role: 'barracks', ctx: 'ward' }, { use: 'store' }, { role: 'stables', ctx: 'ward' }, { role: 'barracks', ctx: 'ward' }];
    if (stripW >= 24) {
      // The strip beside the inner ward, the whole height of the citadel: a tiltyard in the
      // middle, and the bailey's ranges against the outer wall.
      const us = -su * (W / 2) + su * (stripW / 2);
      const tw = Math.min(stripW - 18, 22), th = Math.min(H - 24, 80);
      if (tw >= 10 && th >= 24) {
        const tilt = box(us, 0, tw, th);
        if (tilt.every((p) => !water(p))) {
          out.poly('green', tilt);
          out.line('picket', [box(us, 0, 0, th - 6)[0], box(us, 0, 0, th - 6)[3]]);
        }
      }
      ranges(box, us, 0, stripW, H, outer.splice(0, 3), 0, 0, 0, [su > 0 ? 'u+' : 'u-']);
    }
    if (stripH >= 20) {
      // The strip under the inner ward: a garden or an orchard, and storehouses on the wall.
      const vs = -sv * (H / 2) + sv * (stripH / 2);
      const gw = Math.min(Wi - 8, 50), gh = Math.min(stripH - 10, 30);
      if (gw >= 12 && gh >= 8) {
        const g = box(cu, vs + sv * 3, gw, gh);
        if (g.every((p) => !water(p))) {
          if (rnd() < 0.5) {
            out.poly('garden', g);
          } else {
            out.poly('green', g);
            trees(g, Math.min(24, Math.round(area(g) / 60)), 2, 3);
          }
        }
      }
      ranges(box, cu, vs, Wi, stripH, outer, 0, 0, 0, [sv > 0 ? 'v+' : 'v-', 'u-', 'u+']);
    }
  };

  for (const i of inner) {
    const pt = patches[i];
    if (!pt.inside) continue;
    pave(pt.poly, pt.kind === 'slum' || pt.kind === 'ruins' ? 'dirt' : 'cobbles');
    switch (pt.kind) {
      case 'plaza':
      case 'pilgrims': {
        // A market square; beside a great temple, a pilgrims' square of stalls selling relics,
        // candles and tokens.
        const q0 = inset(pt.poly, offsets(i, wallOff, 3, 3));
        const q = q0 && ground.fit(q0, BUILD_GROUND, rnd, 0, 0.3);
        if (q) {
          out.poly('plaza', q);
          market(q, s.tier === 'city', theme === 'merchant' && pt.kind === 'plaza');
        }
        break;
      }
      case 'tower': {
        // The mages' tower: a tall octagon in a walled garden, with a lodge or two by the wall.
        const q0 = inset(pt.poly, offsets(i, wallOff, 4, 3));
        const q = q0 && ground.fit(q0, BUILD_GROUND, rnd, 0, 0.3);
        if (!q) break;
        out.poly('garden', q);
        out.line('wall', [...q, q[0]], { w: 1.2 });
        const f = frameIn(q, 4);
        const c = f ? f.T(0, 0) : centroid(q);
        const r = f ? Math.max(6, Math.min(11, Math.min(f.W, f.H) * 0.22)) : 7;
        const oct: Pt[] = [];
        for (let k = 0; k < 8; k++) oct.push([c[0] + r * Math.cos((k + 0.5) * Math.PI / 4), c[1] + r * Math.sin((k + 0.5) * Math.PI / 4)]);
        if (ground.allOk(oct, BUILD_GROUND)) {
          const picked = `the ${pick(['Violet', 'Silver', 'Azure', 'Grey', 'Star', 'Moon', 'High', 'Black', 'White', 'Crystal', 'Amber'])} Tower`;
          const name = s.tower?.name ?? picked;
          out.poly('building', oct, { role: 'magetower', label: name, ctx: 'rich' });
          out.point('blabel', c, { name, role: 'magetower' });
        }
        if (f) {
          for (const sv of [-1, 1]) {
            if (rnd() < 0.35) continue;
            const b = f.box(f.W * (rnd() - 0.5) * 0.5, sv * (f.H / 2 - 4), 10, 7);
            if (ground.allOk(b, BUILD_GROUND)) out.poly('building', b, { ctx: 'rich' });
          }
        }
        trees(q, Math.min(14, Math.round(area(q) / 500)), 2, 3.5);
        break;
      }
      case 'prison': {
        // The prison keep: a walled yard with towers along its wall, the prison block in the middle
        // and ranges of buildings along the walls (on a random stream of its own).
        const pr = mulberry32(s.seed ^ 0x9150);
        const q0 = inset(pt.poly, offsets(i, wallOff, 4, 3));
        const q = q0 && ground.fit(q0, BUILD_GROUND, pr, 0, 0.3);
        if (!q) break;
        out.poly('plaza', q);
        out.line('wall', [...q, q[0]], { w: 2.4 });
        let last: Pt | null = null;
        for (const v of q) {
          if (last && Math.hypot(v[0] - last[0], v[1] - last[1]) < 12) continue;
          out.point('tower', v, { r: 3.4 });
          last = v;
        }
        const name = s.prison?.name ?? 'the Gaol';
        const f = frameIn(q, 4);
        if (f) {
          const bw = Math.max(14, Math.min(f.W * 0.42, 48)), bh = Math.max(10, Math.min(f.H * 0.34, 26));
          const block = f.box(0, 0, bw, bh);
          if (ground.allOk(block, BUILD_GROUND)) {
            out.poly('building', block, { role: 'prison', label: name, ctx: 'ward' });
            out.point('blabel', f.T(0, 0), { name, role: 'prison' });
          }
          // Ranges along the long walls: the guards' barracks, stores, the chapel and the warden's
          // house, with gaps between them; the yard and a well between them and the prison block.
          const roles: Record<string, string>[] = [{ role: 'barracks', ctx: 'ward' }, { use: 'store' }, { use: 'temple', ctx: 'castle' }, { use: 'hall' }, { role: 'barracks', ctx: 'ward' }, { use: 'store' }];
          let k = 0;
          for (const sv of [-1, 1]) {
            const d = 11;
            if (f.H / 2 - d - 3 < bh / 2 + 4) continue;
            for (let u = -f.W / 2 + 4; u < f.W / 2 - 12; ) {
              const len = Math.min(f.W / 2 - 4 - u, 18 + pr() * 12);
              if (len < 10) break;
              const b = f.box(u + len / 2, sv * (f.H / 2 - d / 2 - 2), len, d);
              if (ground.allOk(b, BUILD_GROUND)) out.poly('building', b, roles[k++ % roles.length]);
              u += len + 2.5 + pr() * 2.5;
            }
          }
          out.point('well', f.T(bw / 2 + Math.min(10, (f.W - bw) / 4), 0), { r: 1.4 });
        } else {
          const block = rectIn(q, 0.3);
          if (block && ground.allOk(block, BUILD_GROUND)) {
            out.poly('building', block, { role: 'prison', label: name, ctx: 'ward' });
            out.point('blabel', centroid(block), { name, role: 'prison' });
          }
        }
        break;
      }
      case 'ruins': {
        // A quarter never rebuilt after the war: roofless shells, heaps of rubble, and trees
        // growing up through the old houses.
        const q = inset(pt.poly, offsets(i, wallOff, 4, lay.laneW));
        if (!q) break;
        for (const block of subdivide(q, 85 * 7, rnd, 3, 1, [], 0, 1, lay.skew)) {
          if (area(block) < 60) continue;
          for (const lot of subdivide(block, 85, rnd, 0, 0, [], 0, 0.7, lay.skew)) {
            if (!touchesEdge(lot, block) || !goodLot(lot, 85)) continue;
            const house = squareUp(lot, block);
            if (!house) continue;
            const r = rnd();
            if (r < 0.55) out.poly('ruin', house);
            else if (r < 0.8) {
              const hc = centroid(house);
              out.poly('spoil', blob(hc, 2 + rnd() * 2.5, rnd, 8));
            }
          }
        }
        trees(q, Math.min(30, Math.round(area(q) / 250)), 2, 4);
        break;
      }
      case 'temple': {
        const q0 = inset(pt.poly, offsets(i, wallOff, 4, 3));
        const q = q0 && ground.fit(q0, BUILD_GROUND, rnd, 0, 0.3);
        if (!q0 || !q) break;
        out.poly('plaza', q);
        templeClose(q0, holy ? (town ? 'shrine' : 'great') : '');
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
        castle(q);
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
        const rich = pt.kind === 'rich' || pt.kind === 'counting', harbour = pt.kind === 'harbour', garrison = pt.kind === 'garrison';
        // A rookery is crammed with small houses down narrow alleys.
        const slum = pt.kind === 'slum';
        const rr = shapeD(pt.c) / Rin;
        const minArea = (town ? 110 : 85) * (1 + 1.5 * rr * rr) * (rich ? 2.5 : harbour ? 3 : garrison ? 3.5 : slum ? 0.6 : 1);
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
        const alley = () => (slum ? 1.8 + 0.8 * rnd() : 2.8 + 1.4 * rnd());
        const blocks = sl > 0.08
          ? strips(q, [g[0] / sl, g[1] / sl], 22 + 8 * rnd(), 3.5).flatMap((st) => subdivide(st, blockArea, rnd, alley(), 1, [], 0, 1, lay.skew))
          : subdivide(q, blockArea, rnd, alley(), 1, [], 0, 1, lay.skew);
        for (const block of blocks) {
          if (area(block) < minArea * 0.6) continue;
          // Harbour wards are open quays: no yards, just cobbles between the warehouses.
          if (!harbour) yard(block);
          for (const lot of subdivide(block, minArea, rnd, 0, 0, [], 0, 0.7, lay.skew)) {
            if (!touchesEdge(lot, block)) continue;
            if (rnd() < (rich ? 0.2 : slum ? 0 : 0.04)) continue;
            if (!goodLot(lot, minArea)) continue;
            if (drill && lot.some((v) => pointInPoly(drill, v[0], v[1]))) continue;
            const house = squareUp(lot, block);
            if (house) addBuilding(house, i, { ctx: garrison || pt.kind === 'forge' ? 'ward' : pt.kind === 'counting' ? 'rich' : pt.kind, front: streetFront(house, block) ?? streetFront(lot, block) });
          }
        }
      }
    }
  }

  /**
   * A forge city's works outside the walls: heaps of slag beyond the gate nearest its forge
   * quarter, and mills on the river banks to drive the hammers and bellows.
   */
  const forgeWorks = () => {
    const fw = inner.filter((i) => patches[i].kind === 'forge');
    const at = fw.length ? patches[fw[0]].c : [0, 0] as Pt;
    const g = gates.length ? gates.reduce((a, b) => (Math.hypot(wall[b.k][0] - at[0], wall[b.k][1] - at[1]) < Math.hypot(wall[a.k][0] - at[0], wall[a.k][1] - at[1]) ? b : a)) : null;
    const clear = (c: Pt, r: number) => !water(c) && clearOfWalls(c) && !pointInPoly(wall, c[0], c[1])
      && buildingRefs.every((b) => Math.hypot(b.c[0] - c[0], b.c[1] - c[1]) > r + 10)
      && roadLines.every((l) => distToLine(l, c[0], c[1]) > r + 6);
    if (g) {
      const gp = wall[g.k], gl = Math.hypot(...gp) || 1, dir: Pt = [gp[0] / gl, gp[1] / gl], perp: Pt = [-dir[1], dir[0]];
      for (let t = 0, n = 0; t < 30 && n < (town ? 3 : 5); t++) {
        const d = 50 + rnd() * 90, side = (rnd() < 0.5 ? -1 : 1) * (20 + rnd() * 60), r = 6 + rnd() * 10;
        const c: Pt = [gp[0] + dir[0] * d + perp[0] * side, gp[1] + dir[1] * d + perp[1] * side];
        if (!clear(c, r)) continue;
        out.poly('spoil', blob(c, r, rnd));
        n++;
      }
    }
    const banks = terrain.shore(R * 0.9, 40, rnd).filter((b) => b.type === RIVER && !pointInPoly(wall, b.p[0], b.p[1]))
      .sort((a, b) => Math.hypot(...a.p) - Math.hypot(...b.p));
    let mills = 0;
    for (const bank of banks) {
      if (mills >= (town ? 1 : 3)) break;
      const c: Pt = [bank.p[0] - bank.n[0] * 9, bank.p[1] - bank.n[1] * 9];
      const ang = Math.atan2(bank.n[0], -bank.n[1]);
      const m = rect(c[0], c[1], ang, 12, 9);
      if (!clear(c, 8) || !ground.allOk(m, BUILD_GROUND)) continue;
      out.poly('building', m, { use: 'mill', mill: 'water' });
      const wc: Pt = [c[0] + bank.n[0] * 5.6, c[1] + bank.n[1] * 5.6];
      out.poly('millwheel', rect(wc[0], wc[1], ang, 5, 1.4));
      mills++;
    }
  };

  // A fortress city's outer wall: a second ring some 26 m beyond the first, gated where it is.
  let outerWall: Pt[] | null = null;
  if (theme === 'fortress' && s.walls) {
    const sgn = area(wall) > 0 ? 1 : -1;
    const nrm = (a: Pt, b: Pt): Pt => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [(sgn * (b[1] - a[1])) / L, (-sgn * (b[0] - a[0])) / L];
    };
    const off = town ? 20 : 26;
    outerWall = wall.map((p, k) => {
      const n1 = nrm(wall[(k + wall.length - 1) % wall.length], p), n2 = nrm(p, wall[(k + 1) % wall.length]);
      const bx = n1[0] + n2[0], by = n1[1] + n2[1], bl = Math.hypot(bx, by) || 1;
      const d = off / Math.max(0.5, (bx * n1[0] + by * n1[1]) / bl);
      return [p[0] + (bx / bl) * d, p[1] + (by / bl) * d];
    });
  }
  const outerLoop = outerWall ? [...outerWall, outerWall[0]] : null;
  const wallLoop = [...wall, wall[0]];
  /** Clear of the band between a fortress city's two walls. */
  const clearOfWalls = (c: Pt) => !outerLoop || (distToLine(outerLoop, c[0], c[1]) > 12 && !(pointInPoly(outerWall!, c[0], c[1]) && distToLine(wallLoop, c[0], c[1]) < 40));

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
          if (!touchesEdge(lot, block) || rnd() > 0.8 || !goodLot(lot, 140) || !clearOfWalls(centroid(lot))) continue;
          const house = squareUp(lot, block);
          if (house) addBuilding(house, i, { ctx: 'suburb', front: streetFront(house, block) ?? streetFront(lot, block) ?? roadFront(centroid(house), roadLines) });
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
      if (ground.allOk(farm, BUILD_GROUND) && clearOfWalls(hc)) addBuilding(farm, i, { ctx: 'farm' });
    }
  });

  if (s.walls) drawWall(wall, gates.map((g) => g.k), water, out, town);
  if (outerWall) drawWall(outerWall, gates.map((g) => g.k), water, out, town);
  if (theme === 'forge') forgeWorks();

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
    place: s.nameEn ?? s.name, university: !!s.university, noGuilds: s.kind === 'tribal', theme, holy: !!holy,
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

/**
 * The house on a lot: the lot itself when it is near enough rectangular (so terraces keep an
 * unbroken street front), otherwise the largest rectangle fronting the street on the lot's
 * street edge, the rest left as yard. Wedges and triangles at block corners would otherwise give
 * houses (and their floor plans and roofs) of strange shapes. Null if no house fits.
 */
function squareUp(lot: Poly, block: Poly): Poly | null {
  if (lot.length === 4 && rectangularity(lot) >= 0.72) return lot;
  // The street edge: the longest lot edge on the block's edge (else the longest edge).
  let e = -1, bestLen = 0;
  for (let k = 0; k < lot.length; k++) {
    const a = lot[k], b = lot[(k + 1) % lot.length];
    const m = mid(a, b);
    if (!block.some((p, j) => distToSeg(m[0], m[1], p, block[(j + 1) % block.length]) < 0.3)) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > bestLen) {
      bestLen = len;
      e = k;
    }
  }
  if (e < 0) e = longestEdge(lot);
  const r = frontRect(lot, e);
  return r && area(r) >= Math.max(24, area(lot) * 0.4) ? r : null;
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
