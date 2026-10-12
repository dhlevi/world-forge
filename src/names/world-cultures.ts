import { hashString, mulberry32 } from '../gen/rng';
import { GIVEN, JAPONIC_A, JAPONIC_B, KOREANIC_FAMILY, SINIC_FAMILY } from '../lang/given';
import { Language } from '../lang/language';
import { LANG_TEMPLATES } from '../lang/templates';
import { cap, join } from '../lang/text';
import { CULTURES, FAMILIES, type LangFamily, TEMPLATES, type WorldCulture, plainCulture } from './cultures';
import { type CultureEnv, cultureTraits } from './traits';

/**
 * The world's cultures, one per culture hearth: each grows from a template, with a language of
 * its own (drifting from the template's by the world's **Language drift**), a name in that
 * language, and traits from its lands. The culture map records a `CultureSpec` per hearth; every
 * thread (the world and town workers, the page) rebuilds the same cultures from those specs and
 * the seed with `setWorldCultures`, filling the shared `CULTURES` list.
 */

export interface CultureSpec {
  /** Index into TEMPLATES. */
  template: number;
  lon: number;
  lat: number;
  nw: boolean;
  env: CultureEnv;
}
export interface CultureSet {
  seed: string;
  drift: number;
  list: CultureSpec[];
}

let current = '';

/** Builds the world's cultures into `CULTURES` (cheap; languages fill their dictionaries on demand). */
export function setWorldCultures(set: CultureSet): void {
  const key = `${set.seed}|${set.drift}|${set.list.map((s) => `${s.template},${s.lon.toFixed(2)},${s.lat.toFixed(2)}`).join(';')}`;
  if (key === current) return;
  current = key;
  const out: WorldCulture[] = [];
  const names = new Set<string>();
  const tplOf = (k: number) => TEMPLATES[set.list[k].template] ?? TEMPLATES[0];
  const langTpl = (k: number) => LANG_TEMPLATES[tplOf(k).id] ?? LANG_TEMPLATES.anglo;
  const familyNames = (id: string) => (id === 'sinic' ? SINIC_FAMILY : id === 'koreanic' ? KOREANIC_FAMILY : id === 'japonic' ? JAPONIC_A.flatMap((a) => JAPONIC_B.map((b) => a + b)) : undefined);

  // Language families: peoples of one template are kin wherever they live; peoples of related
  // templates (one "stock") are kin where their homelands lie near each other.
  const fam = families(set);
  const protos = fam.map((members, f) => {
    const tpl = tplOf(members[0]);
    return new Language({ key: `${set.seed}#fam#${f}`, template: langTpl(members[0]), drift: set.drift * 0.5, legacy: tpl, given: GIVEN[tpl.id], families: familyNames(tpl.id) });
  });
  const familyOf = new Array<number>(set.list.length).fill(0);
  fam.forEach((members, f) => members.forEach((k) => (familyOf[k] = f)));

  set.list.forEach((spec, k) => {
    const tpl = tplOf(k);
    const lt = langTpl(k);
    const r = mulberry32(hashString(`${set.seed}#culture#${k}`));
    // Each culture drifts a little on its own, so two from one template differ.
    const drift = Math.max(0, Math.min(1, set.drift + (r() - 0.3) * 0.16));
    const f = familyOf[k];
    const parent = protos[f];
    // Kin of the same template keep most of the old words; kin from a related template, fewer.
    const retention = parent.t.id === lt.id ? 0.94 - 0.35 * set.drift : 0.5 - 0.2 * set.drift;
    const language = new Language({ key: `${set.seed}#${k}`, template: lt, drift, legacy: tpl, given: GIVEN[tpl.id], families: familyNames(tpl.id), parent, retention });
    // Their name for themselves: a root of their own tongue; in English, with a demonym ending.
    let root = '', name = '';
    for (let t = 0; t < 12; t++) {
      root = cap(language.gen(r, lt.roots[1] <= 1 ? 1 : r() < 0.6 ? 1 : 2).spell);
      if (root.length < 3 || root.length > 9) continue;
      const suf = lt.demonym[Math.floor(r() * lt.demonym.length)];
      name = cap(join(root.replace(/(?<=[^aeiou])[aeiou]$/i, (m) => (/^[aeiou]/.test(suf) ? '' : m)), suf));
      if (!names.has(name) && name.length <= 12) break;
    }
    names.add(name);
    const traits = cultureTraits(tpl.id, spec.env, r, set.drift);
    const festivals = traits.customs.festivals.map((fe) => ({ english: fe.en, native: cap(fe.words.map((w) => language.word(w).spell).join(' ')) }));
    out.push({
      ...plainCulture(tpl, k, spec.template), name, people: `the ${name}`, endonym: root, endonymIpa: language.toIpa(root),
      language, ethos: traits.ethos, traditions: traits.traditions, customs: { ...traits.customs, festivals }, mods: traits.mods, nw: spec.nw, hearth: [spec.lon, spec.lat], env: spec.env,
      family: f, substrate: -1,
    });
  });

  // Family names come from the founding (largest) people's own name.
  FAMILIES.length = 0;
  fam.forEach((members, f) => {
    const head = out[members[0]];
    const famName = members.length > 1 ? cap(join(head.endonym.replace(/[aeiouy]+$/i, ''), 'ic')) : head.name;
    const lf: LangFamily = { index: f, name: famName, protoName: members.length > 1 ? `Proto-${famName}` : `Old ${head.name}`, proto: protos[f], members };
    FAMILIES.push(lf);
  });
  // An older people's names linger in the lands of their nearest neighbour of another family.
  for (const c of out) {
    let best = -1, bestD = 2600;
    for (const o of out) {
      if (o.family === c.family || o.nw !== c.nw) continue;
      const d = km(c.hearth[0], c.hearth[1], o.hearth[0], o.hearth[1]);
      if (d < bestD) {
        bestD = d;
        best = o.family;
      }
    }
    c.substrate = best;
  }
  CULTURES.length = 0;
  CULTURES.push(...out);
}

/** Templates of one stock: their peoples' tongues are related where they live near each other. */
const STOCK: Record<string, string> = { anglo: 'north', norse: 'north', dwarven: 'north', latin: 'classic', southern: 'classic', celtic: 'fair', elvish: 'fair' };
const STOCK_KM = 3600;

function km(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The world's language families, as lists of culture indices (the largest people first). */
function families(set: CultureSet): number[][] {
  const n = set.list.length;
  const up = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i])));
  const id = (k: number) => TEMPLATES[set.list[k].template]?.id ?? '';
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = set.list[i], b = set.list[j];
      const same = a.template === b.template;
      const stock = !!STOCK[id(i)] && STOCK[id(i)] === STOCK[id(j)] && a.nw === b.nw && km(a.lon, a.lat, b.lon, b.lat) < STOCK_KM;
      if (same || stock) up[find(i)] = find(j);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const g = find(i);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(i);
  }
  const area = (k: number) => set.list[k].env?.areaKm2 ?? 0;
  return [...groups.values()].map((m) => m.sort((a, b) => area(b) - area(a) || a - b)).sort((a, b) => Math.min(...a) - Math.min(...b));
}

/** Back to one plain culture per template (no world). */
export function resetCultures(): void {
  current = '';
  CULTURES.length = 0;
  CULTURES.push(...TEMPLATES.map((t, k) => plainCulture(t, k, k)));
  FAMILIES.length = 0;
}
