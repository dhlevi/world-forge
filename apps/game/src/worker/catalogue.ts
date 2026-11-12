/**
 * What character creation needs of the world (worker/protocol.ts Catalogue): the peoples with
 * their look and faith, and the realms' wars. Made once per world, in the worker.
 */
import type { GeneratedWorld } from '@worldforge/core/gen/world';
import { CULTURES } from '@worldforge/core/names/cultures';
import { worldLore } from '@worldforge/core/lore/current';
import { templateFolk } from '@worldforge/core/names/bundles/index';
import { ETHOS, TRADITIONS } from '@worldforge/core/names/traits';
import { LOOKS, lookOf } from '@worldforge/core/people/appearance';
import type { Catalogue, CultureInfo } from './protocol';

/** The named land region (range, forest, plain) at a place. */
export function regionAt(w: GeneratedWorld, lon: number, lat: number): string | undefined {
  const r = w.raster;
  const i = ((Math.floor(((lon + 180) / 360) * r.W) % r.W) + r.W) % r.W, j = Math.min(r.H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * r.H)));
  const k = w.regionOf[j * r.W + i];
  return k >= 0 ? w.labels.features[k]?.properties.name : undefined;
}

/** The culture of a settlement: its own (colonies), else the land's. */
export function cultureOf(w: GeneratedWorld, s: { lon: number; lat: number; culture?: number }): number | undefined {
  if (s.culture !== undefined) return s.culture;
  const r = w.raster;
  if (!r.culture) return undefined;
  const i = ((Math.floor(((s.lon + 180) / 360) * r.W) % r.W) + r.W) % r.W, j = Math.min(r.H - 1, Math.max(0, Math.floor(((90 - s.lat) / 180) * r.H)));
  const c = r.culture[j * r.W + i];
  return c >= 0 ? c : undefined;
}

let catalogueCache: Catalogue | null = null;

export function resetCatalogue(): void {
  catalogueCache = null;
}

/** What character creation needs: the peoples (with their look and faith), and the realms' wars. */
export function catalogue(w: GeneratedWorld): Catalogue {
  if (catalogueCache) return catalogueCache;
  const lore = worldLore(w);
  const L = lore.L;
  const faithName = (ci: number) => {
    const id = L.faiths.ofCulture[ci];
    return L.faiths.faiths.find((f) => f.id === id)?.name;
  };
  const used = new Set<number>();
  for (const s of w.settlements) {
    if (s.tier === 'village') continue;
    const c = cultureOf(w, s);
    if (c !== undefined) used.add(c);
  }
  const cultures: CultureInfo[] = [];
  for (const ci of [...used].sort((a, b) => a - b)) {
    const c = CULTURES[ci];
    if (!c) continue;
    const spec = LOOKS[c.id] ?? LOOKS.anglo;
    let look: CultureInfo['look'];
    try {
      const lk = lookOf(w.raster.seed, c);
      const uniq = (xs: [string, string][]) => [...new Map(xs.map((x) => [x[1], x])).values()];
      look = {
        h: lk.h, broad: lk.broad,
        skins: uniq(lk.figures.map((f) => f.skin)), hairs: uniq(lk.figures.map((f) => f.hair)).filter((x) => x[1] !== 'none'),
        hairM: [...spec.hairM], hairF: [...spec.hairF], beards: [...spec.beard], marks: spec.marks, text: lk.text,
      };
    } catch {
      look = { h: 1, broad: 1, skins: [['#d3a878', 'olive']], hairs: [['#45301f', 'dark brown']], hairM: ['short'], hairF: ['long'], beards: ['none'], text: [] };
    }
    if (!look.hairs.length) look.hairs = [['#45301f', 'dark brown']];
    cultures.push({
      index: ci, name: c.name, people: c.people, folk: templateFolk(c.id), newWorld: c.nw, deep: !!c.deep,
      ethos: c.ethos, traditions: [...c.traditions], ethosName: ETHOS[c.ethos]?.name ?? c.ethos, traditionNames: c.traditions.map((t) => TRADITIONS[t]?.name ?? t),
      faith: faithName(ci), seafaring: c.traditions.includes('seafarers') || (c.mods?.seafaring ?? 1) > 1.3, look,
    });
  }
  const tops = w.politics.units.filter((u) => u.parent < 0);
  const realms = tops.map((u) => ({
    id: u.id, name: u.name,
    wars: L.wars.filter((x) => x.attackers.includes(u.id) || x.defenders.includes(u.id)).map((x) => ({ name: x.name, start: x.start, end: x.end, cause: x.cause })),
  }));
  catalogueCache = { year: L.year, cultures, realms };
  return catalogueCache;
}

