import type { Folk, TemplateBundle } from '../bundle';
import { ANGLO } from './anglo';
import { CELTIC } from './celtic';
import { DESERT } from './desert';
import { DWARVEN } from './dwarven';
import { ELVISH } from './elvish';
import { HALFLING } from './halfling';
import { HIGHLAND } from './highland';
import { INDIC } from './indic';
import { ISLANDER } from './islander';
import { JAPONIC } from './japonic';
import { JUNGLE } from './jungle';
import { KOREANIC } from './koreanic';
import { LATIN } from './latin';
import { LIZARDFOLK } from './lizardfolk';
import { NORSE } from './norse';
import { ORCISH } from './orcish';
import { SAHELIAN } from './sahelian';
import { SINIC } from './sinic';
import { SLAVIC } from './slavic';
import { SOUTHERN } from './southern';
import { STEPPE } from './steppe';
import { WOODLAND } from './woodland';
import { ZANJI } from './zanji';
import { GERMAN } from './germanic';
import { SHADOWELF } from './shadowelf';
import { DEEPGNOME } from './deepgnome';
import { FUNGUSFOLK } from './fungusfolk';
import { GREYDWARF } from './greydwarf';

/**
 * Every culture template (see names/bundle.ts), in a fixed order: a world's cultures refer to
 * their template by its index here, so new templates go at the end and none is ever reordered.
 */
export const BUNDLES: TemplateBundle[] = [
  ANGLO, NORSE, LATIN, CELTIC, ELVISH, DESERT, SLAVIC, DWARVEN, SOUTHERN, STEPPE, JUNGLE, SINIC, JAPONIC, KOREANIC, WOODLAND, HIGHLAND,
  INDIC, SAHELIAN, ZANJI, ISLANDER, HALFLING, ORCISH, LIZARDFOLK, GERMAN,
  // The peoples of the Underworld (never chosen for a hearth on the surface).
  SHADOWELF, DEEPGNOME, FUNGUSFOLK, GREYDWARF,
];
export const BUNDLE = new Map(BUNDLES.map((b) => [b.culture.id, b]));

/** A table keyed by template id, with an entry for each template that has a value for it. */
export function table<T>(get: (b: TemplateBundle) => T | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  for (const b of BUNDLES) {
    const v = get(b);
    if (v !== undefined) out[b.culture.id] = v;
  }
  return out;
}

/** The folk a template's people are. */
export const templateFolk = (id: string): Folk => BUNDLE.get(id)?.folk ?? 'Humans';
