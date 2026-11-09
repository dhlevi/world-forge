import type { Rng } from '../gen/rng';
import type { Biome } from '../gen/biomes';
import type { Charge, EmblemStyle, Shield } from '../heraldry/arms';
import type { GrammarBias, LangTemplate } from '../lang/templates';
import type { FaithFamily } from '../lore/faiths';
import type { Culture } from './cultures';

/**
 * A culture template in one place: everything that makes a people of this kind what it is. Its
 * naming habits and the climate it likes, its language and names, its outlook and traditions,
 * customs, titles and realm styles, how it rules and fights, what it makes and trades, its
 * heraldry and faith, and how it spreads over the land. Each template is one file in
 * `names/bundles/`; every table keyed by template is built from the bundles (`table()` in
 * `names/bundles/index.ts`), so a new culture needs only a new file (and a line in the index).
 *
 * Most fields are optional: a template without one takes the shared default, noted on each.
 */

/** The peoples of the world. Without fantasy races, every people is human. Folk may have multiple cultures */
export type Folk = 'Humans' | 'Elves' | 'Dwarves' | 'Halflings' | 'Orcs' | 'Lizardfolk' | 'Shadow elves' | 'Deep gnomes' | 'Fungus folk' | 'Grey dwarves';

/** A house or lineage name made from a root (a proper name in the culture's tongue). */
export type HouseNamer = (root: string, rnd: Rng, o: { seatName: string; family: () => string }) => { name: string; short: string };

export interface TemplateBundle {
  // ---- Who they are -----------------------------------------------------------------------------
  /** Naming parts, feature terms, kingdom styles and the climate it prefers (`likes`). */
  culture: Culture;
  /** Shown as the template's name ("Nordic"). */
  label: string;
  folk: Folk;
  /** Where its homelands may lie: the Old World, the New World or either, or the Underworld (gen/deep-peoples.ts). */
  world: 'old' | 'new' | 'both' | 'deep';
  /** How readily it is chosen against other templates where both suit (default 1). */
  rarity?: number;
  /** A stock of related templates: their peoples' tongues are kin where their homelands lie near. */
  stock?: string;
  /**
   * How hard its people spread over a cell (a multiplier on the distance; default 1): dwarves
   * keep to the mountains, islanders cross the sea easily.
   */
  spread?: (height: number, biome: Biome, sea: boolean) => number;
  /** "Woodland peoples": how the land beyond the towns is described in the New World. */
  peoples?: string;

  // ---- Language and names -----------------------------------------------------------------------
  lang: LangTemplate;
  /** Given names: [male, female]. */
  given: [string[], string[]];
  /** Family (clan) names, for the cultures that use them. */
  familyNames?: string[];
  /** Family names made of two parts (Japonic: Taka + hashi). */
  familyParts?: [string[], string[]];
  /** The family name comes first, and rulers are known by their full name. */
  familyFirst?: boolean;
  /** Rulers take regnal numbers (default true). */
  numerals?: boolean;
  /** The full name from a given name and the father's (a patronymic); `say` respells old words. */
  personName?: (given: string, father: string, female: boolean, rnd: Rng, say: (s: string) => string) => string;
  /** House names: a pattern with {R} for the root ("the {R} clan"), or a function (default "House {R}"). */
  house?: string | HouseNamer;
  /** Epithets for rulers ("Bloodaxe"), besides the common ones. */
  epithets: string[];
  /** Rulers have no epithets. */
  noEpithets?: boolean;

  // ---- Outlook, traditions and customs -------------------------------------------------------
  /** Ethos weights, as in names/traits.ts (bellicose, stoic, bureaucratic, spiritual, courtly, communal, egalitarian, inventive). */
  ethos: Partial<Record<string, number>>;
  /**
   * The template's own term in each tradition's score (names/traits.ts): added to it for most
   * traditions, or replacing its base value where the tradition says so.
   */
  affinity?: Partial<Record<string, number>>;
  /** Extra score for traditions, added after the rest (keys of TRADITIONS). */
  traditions?: Partial<Record<string, number>>;
  architecture?: string;
  dress?: string;
  /** Food (default: from the lands). */
  food?: string;
  /** Chance that women bear arms and lead (default 0.08). */
  equalArms?: number;
  polygamy?: boolean;
  /** Old naming words for caves and glades ("Delve", "Nemeton"). */
  caveNouns?: string[];
  gladeNouns?: string[];
  /** Temples may be named for saints ("St Aldo's"). */
  saints?: boolean;
  /** How planned their towns are (grids and axes, default 0.15), and whether they build on hills. */
  planned?: number;
  hilly?: boolean;
  /**
   * Its people build their great towns beneath the mountains: a city or town of theirs in high or
   * steep country is a delve, a gate in the mountainside with its halls below (towns/delve; the
   * halls are a dungeon map, dungeons/kinds.ts).
   */
  underground?: boolean;
  /** Its people live in burrows: houses dug into grassy mounds, with round doors and windows. */
  burrows?: boolean;

  // ---- Rule ----------------------------------------------------------------------------------
  /** Ruler titles from barony to empire (default the Anglic ones). */
  rulers?: [string, string, string, string, string];
  /** Styles of barony, county, duchy and empire ({S} the seat, {N} a name, {A} an adjective). */
  barony?: string[];
  county?: string[];
  duchy?: string[];
  empire?: string[];
  cityRuler?: string;
  republicRuler?: string;
  cityState?: string[];
  republic?: string[];
  league?: string[];
  leagueRuler?: string;
  thalasso?: [string, string][];
  /** Tribal styles by level (barony to empire): names and the ruler's title. */
  tribal?: [string[], string][];
  /** Charges favoured by tribal arms. */
  tribalCharges?: Charge[];
  /** Leanings (see gen/politics.ts): city-states, republics, breakaway duchies, empires, leagues. */
  cityStateP?: number;
  republicP?: number;
  indepDuchyP?: number;
  empireW?: number;
  leagueP?: number;
  /** How readily its people sail to found colonies. */
  seafaring?: number;
  succession?: string;
  /** Succession in its tribes, and how a tribe is described. */
  tribalSuccession?: string;
  tribalGov?: string;
  /** Its emperors are elected by the greatest vassals. */
  electiveEmpire?: boolean;
  /** Chance an heir is a daughter (default 0.15). */
  heirFemaleP?: number;
  /** Share of rulers who are women. */
  femaleP?: number;
  /** Court offices: chancellor, marshal, steward, spymaster, chief priest. */
  court: [string, string, string, string, string];
  army?: string;
  /** Share of levies that ride (default 0.12). */
  horseShare?: number;
  /** Small minorities of other folk among them. */
  minorFolk?: string[];

  // ---- Trade -----------------------------------------------------------------------------------
  crafts?: string[];
  coin?: string;
  /** What their lands yield beyond the usual: rice and tea, maize, horses, silk, honey, cacao, and more metals for delvers. */
  goods?: { riceAndTea?: boolean; maize?: boolean; horses?: number; silk?: boolean; honey?: number; cacao?: boolean; delvers?: boolean };

  // ---- Heraldry and faith ---------------------------------------------------------------------
  shield?: Shield;
  charges?: Charge[];
  emblem?: EmblemStyle;
  faith: { native: FaithFamily; missionary?: FaithFamily; prophetic?: number; open?: number };
}

/** A smooth preference for a value between lo and hi (1 inside, falling off over `soft`). */
export const near = (v: number, lo: number, hi: number, soft = 6) =>
  v < lo ? Math.max(0, 1 - (lo - v) / soft) : v > hi ? Math.max(0, 1 - (v - hi) / soft) : 1;

/** A grammar sketch: the given choices over the commonest ones (SVO, adjectives first, articles, "of"). */
export const grammar = (o: Partial<GrammarBias>): GrammarBias => ({
  order: 'SVO', adj: 'before', def: 'word', indef: 'word', plural: 'suffix', poss: 'of', gender: 0, agree: false, tense: 'suffix', adposition: 'pre', ...o,
});
