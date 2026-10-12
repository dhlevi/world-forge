import { hashString, mulberry32 } from '../gen/rng';
import { GIVEN, JAPONIC_A, JAPONIC_B, KOREANIC_FAMILY, SINIC_FAMILY } from '../lang/given';
import { Language } from '../lang/language';
import { LANG_TEMPLATES } from '../lang/templates';
import { cap, join } from '../lang/text';
import { CULTURES, TEMPLATES, type WorldCulture, plainCulture } from './cultures';
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
  set.list.forEach((spec, k) => {
    const tpl = TEMPLATES[spec.template] ?? TEMPLATES[0];
    const lt = LANG_TEMPLATES[tpl.id] ?? LANG_TEMPLATES.anglo;
    const r = mulberry32(hashString(`${set.seed}#culture#${k}`));
    // Each culture drifts a little on its own, so two from one template differ.
    const drift = Math.max(0, Math.min(1, set.drift + (r() - 0.3) * 0.16));
    const families = tpl.id === 'sinic' ? SINIC_FAMILY : tpl.id === 'koreanic' ? KOREANIC_FAMILY : tpl.id === 'japonic' ? JAPONIC_A.flatMap((a) => JAPONIC_B.map((b) => a + b)) : undefined;
    const language = new Language({ key: `${set.seed}#${k}`, template: lt, drift, legacy: tpl, given: GIVEN[tpl.id], families });
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
    const festivals = traits.customs.festivals.map((f) => ({ english: f.en, native: cap(f.words.map((w) => language.word(w).spell).join(' ')) }));
    out.push({
      ...plainCulture(tpl, k, spec.template), name, people: `the ${name}`, endonym: root, endonymIpa: language.toIpa(root),
      language, ethos: traits.ethos, traditions: traits.traditions, customs: { ...traits.customs, festivals }, mods: traits.mods, nw: spec.nw, hearth: [spec.lon, spec.lat], env: spec.env,
    });
  });
  CULTURES.length = 0;
  CULTURES.push(...out);
}

/** Back to one plain culture per template (no world). */
export function resetCultures(): void {
  current = '';
  CULTURES.length = 0;
  CULTURES.push(...TEMPLATES.map((t, k) => plainCulture(t, k, k)));
}
