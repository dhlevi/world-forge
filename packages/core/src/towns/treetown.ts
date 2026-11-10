import { hashString, mulberry32 } from '../gen/rng';
import { type Pt, area, roundPoly } from './geom';
import type { LocalFrame, PlanFeature } from './plan';
import { DMath } from '../dmath';

/**
 * Elven tree towns: an elvish town or village in the forest builds its houses among great trees.
 * In a `grove` most houses are tree homes, built against the trunk of a great tree whose crown
 * spreads over them; in a `canopy` (the oldest and densest forest) many houses stand on
 * platforms high in the trees instead, joined by walkways from tree to tree.
 *
 * This works on the finished plan, house by house, from each building's own id: the plan, its
 * random streams and every building id stay as they are. A house keeps its id and takes a
 * `tree` property (`home` or `top`, with the platform's height `z` for a treetop house); the
 * great trees (`canopy`, `trunk`), the platforms and the walkways are features of their own,
 * after all the rest.
 */
export type TreeMode = 'grove' | 'canopy';

/** The houses (not halls, temples, shops of note or mills). */
const HOUSE_CTX = new Set(['ward', 'rich', 'suburb', 'farm', 'farming', 'fishing', 'slum', 'counting', 'logging', 'hunting', 'herding', 'tribal']);

const centroid = (p: Pt[]): Pt => [p.reduce((s, v) => s + v[0], 0) / p.length, p.reduce((s, v) => s + v[1], 0) / p.length];

/** A lumpy round crown about `c`. */
function crown(c: Pt, r: number, seed: number): Pt[] {
  const out: Pt[] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const wob = 1 + 0.1 * DMath.sin(t * 3 + seed) + 0.06 * DMath.cos(t * 5 + seed * 1.7);
    out.push([c[0] + DMath.cos(t) * r * wob, c[1] + DMath.sin(t) * r * wob]);
  }
  return out;
}
const ring = (c: Pt, r: number, n = 12): Pt[] => Array.from({ length: n }, (_, i) => [c[0] + DMath.cos((i / n) * Math.PI * 2) * r, c[1] + DMath.sin((i / n) * Math.PI * 2) * r] as Pt);

/** Turns the houses of a finished plan into tree homes and treetop houses (in place). */
export function treeTown(features: PlanFeature[], frame: LocalFrame, mode: TreeMode, tier: string, ppm20: number): void {
  const local = (f: PlanFeature): Pt[] => (f.geometry.type === 'Polygon' ? f.geometry.coordinates[0].slice(0, -1).map((c) => frame.fromLL(c[0], c[1])) : []);
  const toRing = (p: Pt[]) => {
    const r = p.map((q) => frame.toLL(q));
    r.push(r[0]);
    return r;
  };
  const add: PlanFeature[] = [];
  const poly = (kind: string, p: Pt[], props: Record<string, string | number> = {}) => add.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [toRing(p)] }, properties: { kind, ppm20, ...props } });
  const tops: { c: Pt; r: number; z: number }[] = [];
  const topShare = mode === 'canopy' ? (tier === 'city' ? 0.45 : tier === 'town' ? 0.55 : 0.65) : 0;
  const homeShare = tier === 'city' ? 0.5 : 0.8;

  for (const f of features) {
    const pr = f.properties;
    if (pr.kind !== 'building' || pr.use || pr.role || pr.label || pr.burrow || f.geometry.type !== 'Polygon') continue;
    if (!HOUSE_CTX.has(String(pr.ctx ?? ''))) continue;
    const bid = String(pr.bid ?? '');
    const r = mulberry32(hashString(`tree#${bid}`));
    const roll = r();
    const p = local(f);
    if (p.length < 3) continue;
    const a = Math.abs(area(p));
    if (a < 12) continue;
    const c = centroid(p);
    const rad = Math.sqrt(a / Math.PI);
    const seed = r() * 10;
    if (roll < topShare) {
      // A house on a platform in the crown of a great tree: round, a little smaller than on the ground.
      const hr = Math.max(2.6, Math.min(6, rad * 0.85));
      const z = Math.round((9 + r() * 6) * 10) / 10;
      const crR = hr + 4 + r() * 3;
      poly('canopy', crown(c, crR, seed), { tree: 'top' });
      poly('platform', ring(c, hr + 1.4, 10), { z });
      f.geometry.coordinates = [toRing(ring(c, hr, 8))];
      pr.tree = 'top';
      pr.z = z;
      tops.push({ c, r: hr + 1.4, z });
    } else if (roll < topShare + (1 - topShare) * homeShare) {
      // A tree home: the house rounded off and built against the trunk on its north side.
      const q = p.length <= 6 ? roundPoly(p, 1) : p;
      f.geometry.coordinates = [toRing(q)];
      pr.tree = 'home';
      const tc: Pt = [c[0] + (r() - 0.5) * rad * 0.5, c[1] + rad * 0.75];
      const trunk = Math.max(1.1, Math.min(2.4, rad * 0.32));
      poly('canopy', crown(tc, rad + 4 + r() * 4, seed), { tree: 'home' });
      poly('trunk', ring(tc, trunk, 10));
    }
  }

  // Walkways from each treetop house to its nearest neighbours in the canopy.
  const seen = new Set<string>();
  const reach = 38;
  tops.forEach((t, i) => {
    const near = tops.map((u, j) => ({ j, d: DMath.hypot2(u.c[0] - t.c[0], u.c[1] - t.c[1]) })).filter((x) => x.j !== i && x.d < reach).sort((a, b) => a.d - b.d).slice(0, 2);
    for (const { j } of near) {
      const key = i < j ? `${i},${j}` : `${j},${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const u = tops[j];
      const dx = u.c[0] - t.c[0], dy = u.c[1] - t.c[1], L = DMath.hypot2(dx, dy) || 1;
      const a: Pt = [t.c[0] + (dx / L) * t.r * 0.9, t.c[1] + (dy / L) * t.r * 0.9];
      const b: Pt = [u.c[0] - (dx / L) * u.r * 0.9, u.c[1] - (dy / L) * u.r * 0.9];
      if (DMath.hypot2(b[0] - a[0], b[1] - a[1]) < 1) continue;
      add.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [frame.toLL(a), frame.toLL(b)] }, properties: { kind: 'walkway', ppm20, za: t.z, zb: u.z } });
    }
  });
  // The plan's other trees grow as tall as the forest about the town.
  for (const f of features) if (f.properties.kind === 'tree') f.properties.r = Math.round(Number(f.properties.r ?? 2) * 1.7 * 10) / 10;
  features.push(...add);
}
