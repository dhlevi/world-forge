import type { Charge, EmblemStyle, Shield } from '../heraldry/arms';
import type { LangTemplate } from '../lang/templates';
import type { FaithFamily } from '../lore/faiths';
import type { Culture } from './cultures';

/**
 * A culture template in one place: its naming habits, language, names, traits, titles, realm
 * styles, crafts, heraldry and faith. The original sixteen templates keep their data spread over
 * the tables where it is used; templates added later come as bundles (`names/bundles/`), and each
 * table falls back to a bundle's entry for its template.
 */

/** The peoples of the world. Without fantasy races, every people is human. */
export type Folk = 'Humans' | 'Elves' | 'Dwarves' | 'Halflings' | 'Orcs' | 'Lizardfolk';

export interface TemplateBundle {
  /** Naming parts, feature terms, kingdom styles and the climate it prefers (`likes`). */
  culture: Culture;
  /** Shown as the template's name ("Indic"). */
  label: string;
  folk: Folk;
  /** Where its homelands may lie: the Old World, the New World or either. */
  world: 'old' | 'new' | 'both';
  /** How readily it is chosen against other templates where both suit (1 = as readily). */
  rarity?: number;
  lang: LangTemplate;
  /** Given names: [male, female]. */
  given: [string[], string[]];
  /** Ethos weights, as in names/traits.ts (bellicose, stoic, bureaucratic, spiritual, courtly, communal, egalitarian, inventive). */
  ethos: Partial<Record<string, number>>;
  /** Extra score for traditions (keys of TRADITIONS in names/traits.ts). */
  traditions?: Partial<Record<string, number>>;
  architecture: string;
  dress: string;
  food: string;
  /** Chance that women bear arms and lead (default 0.08). */
  equalArms?: number;
  polygamy?: boolean;
  /** Ruler titles from barony to empire. */
  rulers: [string, string, string, string, string];
  /** Styles of barony, county, duchy and empire ({S} the seat, {N} a name, {A} an adjective). */
  barony: string[];
  county: string[];
  duchy: string[];
  empire: string[];
  cityRuler?: string;
  /** Weights for empires, leagues and republics against the default (see gen/politics.ts). */
  empireW?: number;
  leagueP?: number;
  republicP?: number;
  /** A house or lineage name from a root: "House {R}", "the {R} clan". */
  house?: string;
  epithets: string[];
  /** Court offices: chancellor, marshal, steward, spymaster, chief priest. */
  court: [string, string, string, string, string];
  succession: string;
  army: string;
  /** Share of rulers who are women. */
  femaleP: number;
  /** Small minorities of other folk among them. */
  minorFolk: string[];
  crafts: string[];
  coin: string;
  shield: Shield;
  charges: Charge[];
  emblem?: EmblemStyle;
  faith: { native: FaithFamily; missionary?: FaithFamily; prophetic?: number; open?: number };
}

/** A smooth preference for a value between lo and hi (1 inside, falling off over `soft`). */
export const near = (v: number, lo: number, hi: number, soft = 6) =>
  v < lo ? Math.max(0, 1 - (lo - v) / soft) : v > hi ? Math.max(0, 1 - (v - hi) / soft) : 1;
