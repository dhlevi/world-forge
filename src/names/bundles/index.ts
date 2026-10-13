import type { Folk, TemplateBundle } from '../bundle';
import { HALFLING } from './halfling';
import { INDIC } from './indic';
import { ISLANDER } from './islander';
import { LIZARDFOLK } from './lizardfolk';
import { ORCISH } from './orcish';
import { SAHELIAN } from './sahelian';
import { ZANJI } from './zanji';

/** Templates added as bundles (see names/bundle.ts), after the original sixteen. */
export const BUNDLES: TemplateBundle[] = [INDIC, SAHELIAN, ZANJI, ISLANDER, HALFLING, ORCISH, LIZARDFOLK];
export const BUNDLE = new Map(BUNDLES.map((b) => [b.culture.id, b]));

/** Fills a table keyed by template id from the bundles, where it has no entry of its own. */
export function fillFrom<T>(table: Record<string, T>, get: (b: TemplateBundle) => T | undefined): void {
  for (const b of BUNDLES) {
    const v = get(b);
    if (v !== undefined && table[b.culture.id] === undefined) table[b.culture.id] = v;
  }
}

/** The folk a template's people are. */
export function templateFolk(id: string): Folk {
  if (id === 'elvish') return 'Elves';
  if (id === 'dwarven') return 'Dwarves';
  return BUNDLE.get(id)?.folk ?? 'Humans';
}
