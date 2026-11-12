/**
 * Family standing (docs/design/creation.md, Background and family): it sets which occupations
 * open, the starting money, literacy, the skills of home, and the parents' trades. Proposed values.
 */
import type { StandingId } from '../components';

export interface ParentTrade {
  name: string;
  /** The skill a child picks up at home. */
  skill: string;
  /** A trade only fathers ('m') or only mothers ('f') are given here. */
  who?: 'm' | 'f';
}

export interface StandingDef {
  id: StandingId;
  name: string;
  about: string;
  /** Starting money, copper. */
  money: [number, number];
  /** Chance of being taught to read the home language. */
  literacy: number;
  skills: Record<string, number>;
  /** Knowledge of the home realm's history and law. */
  history: number;
  law: number;
  trades: ParentTrade[];
  /** How often it is drawn, in a city, a town and the countryside. */
  weight: { city: number; town: number };
  /** Trait points beyond the budget (a hard upbringing builds, a soft one less). */
  budget: number;
}

const T = (name: string, skill: string, who?: 'm' | 'f'): ParentTrade => ({ name, skill, ...(who ? { who } : {}) });

export const STANDINGS: StandingDef[] = [
  {
    id: 'peasant', name: 'Peasant', about: 'A family that works a lord\'s land or a little of its own.',
    money: [10, 40], literacy: 0.03, skills: { agriculture: 10, animals: 5, athletics: 5 }, history: 0, law: 0, budget: 1,
    trades: [T('farmer', 'agriculture'), T('herder', 'animals'), T('woodcutter', 'survival'), T('fisher', 'fishing'), T('charcoal burner', 'survival'), T('midwife', 'herbalism', 'f'), T('miller', 'stewardship'), T('beekeeper', 'agriculture'), T('hunter', 'tracking'), T('trapper', 'trapping')],
    weight: { city: 0.5, town: 3 },
  },
  {
    id: 'townsfolk', name: 'Townsfolk', about: 'Labourers, carters and small traders of the streets.',
    money: [30, 120], literacy: 0.2, skills: { trading: 5, persuasion: 5, athletics: 3 }, history: 2, law: 3, budget: 0,
    trades: [T('carter', 'riding'), T('innkeeper', 'cooking'), T('labourer', 'athletics'), T('washerwoman', 'tailoring', 'f'), T('baker', 'cooking'), T('watchman', 'clubs', 'm'), T('porter', 'athletics'), T('stallholder', 'trading')],
    weight: { city: 3, town: 2 },
  },
  {
    id: 'craftsman', name: 'Craftsman\'s family', about: 'A workshop, a trade handed down, a place in a guild.',
    money: [60, 200], literacy: 0.3, skills: { trading: 3 }, history: 2, law: 3, budget: 0,
    trades: [T('smith', 'smithing'), T('carpenter', 'carpentry'), T('mason', 'masonry'), T('tanner', 'hideworking'), T('weaver', 'tailoring'), T('tailor', 'tailoring'), T('cooper', 'carpentry'), T('potter', 'artistry'), T('jeweller', 'jewelsmith')],
    weight: { city: 2, town: 1.5 },
  },
  {
    id: 'merchant', name: 'Merchant family', about: 'Trade, ledgers and goods coming and going.',
    money: [200, 800], literacy: 0.8, skills: { trading: 10, stewardship: 5, persuasion: 3 }, history: 3, law: 5, budget: 0,
    trades: [T('merchant', 'trading'), T('shopkeeper', 'trading'), T('moneylender', 'stewardship'), T('ship\'s master', 'sailing'), T('caravan master', 'riding')],
    weight: { city: 1, town: 0.4 },
  },
  {
    id: 'clergy', name: 'Clergy', about: 'A household of the faith: a priest\'s family, a sexton\'s, a temple\'s servants.',
    money: [50, 200], literacy: 0.9, skills: { storytelling: 3, persuasion: 3 }, history: 5, law: 3, budget: 0,
    trades: [T('priest', 'persuasion'), T('scribe', 'cartography'), T('healer', 'medicine'), T('sexton', 'masonry'), T('chorister', 'music')],
    weight: { city: 0.4, town: 0.3 },
  },
  {
    id: 'minor', name: 'Minor nobility', about: 'A knight\'s or a lesser lord\'s family: a manor, a horse, a name.',
    money: [600, 2000], literacy: 0.7, skills: { riding: 15, longblades: 10, leadership: 5, dance: 3 }, history: 10, law: 5, budget: -1,
    trades: [T('knight', 'longblades', 'm'), T('steward', 'stewardship'), T('lady of the manor', 'stewardship', 'f'), T('huntsman', 'tracking')],
    weight: { city: 0.25, town: 0.2 },
  },
  {
    id: 'noble', name: 'Nobility', about: 'A great house: lands, a court, and every eye upon you.',
    money: [2000, 6000], literacy: 0.9, skills: { riding: 20, longblades: 10, persuasion: 10, dance: 5, leadership: 5 }, history: 15, law: 8, budget: -1,
    trades: [T('lord', 'leadership', 'm'), T('lady', 'persuasion', 'f'), T('courtier', 'persuasion'), T('commander', 'leadership')],
    weight: { city: 0.08, town: 0.05 },
  },
];

export const STANDING = new Map(STANDINGS.map((s) => [s.id, s]));
export const STANDING_ORDER: StandingId[] = STANDINGS.map((s) => s.id);
