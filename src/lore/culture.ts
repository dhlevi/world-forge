import { NB_CULTURE } from '../gen/politics';
import { CULTURES, TEMPLATES, type WorldCulture } from '../names/cultures';
import { LANG_TEMPLATES } from '../lang/templates';
import type { Faith, Sect } from './faiths';
import type { Ctx } from './realm';

/**
 * What the culture window shows beyond the culture itself: how many people share it and where
 * (the realms its people rule, largest first), its faith, and its kin (cultures grown from the
 * same template).
 */
export interface CultureInfo {
  culture: WorldCulture;
  people: number;
  /** Independent realms ruled by this people, largest first. */
  realms: number[];
  /** Vassal realms ruled by this people inside others' realms. */
  vassals: number;
  faith: Faith | null;
  sect: Sect | null;
  kin: number[];
  templateName: string;
  after: string;
}

const peopleCache = new WeakMap<Ctx, Float64Array>();

/** People of each culture in the world (each barony's people split by its peoples' habitable land). */
function peopleByCulture(c: Ctx): Float64Array {
  let out = peopleCache.get(c);
  if (out) return out;
  out = new Float64Array(NB_CULTURE);
  const st = c.p.stats;
  for (let b = 0; b < st.nb; b++) {
    let tot = 0;
    for (let k = 0; k < NB_CULTURE; k++) tot += st.culture[b * NB_CULTURE + k];
    if (tot <= 0) continue;
    const ppl = c.units[b]?.people ?? 0;
    for (let k = 0; k < NB_CULTURE; k++) out[k] += (ppl * st.culture[b * NB_CULTURE + k]) / tot;
  }
  peopleCache.set(c, out);
  return out;
}

export function cultureInfo(c: Ctx, ci: number): CultureInfo {
  const culture = CULTURES[ci] ?? CULTURES[0];
  const tops = c.units.filter((u) => u.parent < 0 && u.gov !== 'league' && u.culture === ci).sort((a, b) => b.people - a.people).map((u) => u.id);
  const vassals = c.units.filter((u) => u.parent >= 0 && u.level >= 2 && u.culture === ci && c.units[c.L.topOf[u.id]].culture !== ci).length;
  const fs = c.L.faiths.ofCulture[ci] >= 0 ? c.L.faiths.sectOf(ci, culture.hearth[0], culture.hearth[1]) : null;
  return {
    culture, people: peopleByCulture(c)[ci] ?? 0, realms: tops, vassals, faith: fs?.faith ?? null, sect: fs?.sect ?? null,
    kin: CULTURES.filter((x) => x.template === culture.template && x.index !== ci).map((x) => x.index),
    templateName: TEMPLATES[culture.template]?.id ?? '', after: LANG_TEMPLATES[culture.id]?.after ?? '',
  };
}
