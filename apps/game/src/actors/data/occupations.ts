/**
 * Occupation tracks (docs/design/creation.md, Occupations): ranks, the skills each builds, who may
 * enter and rise, what a term pays and gives, and what it teaches of the world (the starting map).
 * The tracks and ranks are decided; the rest is proposed.
 */
import type { StandingId } from '../components';
import type { TraitId } from './traits';

export type TrackId =
  | 'military' | 'civil' | 'religion' | 'academia' | 'trades' | 'craft' | 'outlaw' | 'thief'
  | 'woodland' | 'seafaring' | 'performance' | 'healing' | 'farming' | 'magic';

/**
 * A skill a track builds: a skill id, or "know:history", "know:law", "know:theology",
 * "know:nature" (of home), "literacy" (the home language's script) or "craft" / "school" (the
 * craft or school of magic chosen for the track).
 */
export interface TrackSkill {
  id: string;
  /** Relative share of a term's learning. */
  w: number;
  /** From this rank on. */
  from?: number;
  /** Up to this rank. */
  to?: number;
}

/** What a track teaches of the world: the starting map (docs/design/navigation.md). */
export type TrackLands = 'roads' | 'coast' | 'wild' | 'realm' | 'maps' | 'none';

/** What decides whether a track or rank is open. */
export interface TrackCtx {
  standing: StandingId;
  traits: Record<TraitId, number>;
  literate: boolean;
  coastal: boolean;
  seafaringCulture: boolean;
  homeTier: string;
  ranks: Record<string, number>;
  parentTrades: string[];
}

export interface TrackDef {
  id: TrackId;
  name: string;
  about: string;
  ranks: string[];
  skills: TrackSkill[];
  /** Traits a term may build. */
  lean: TraitId[];
  /** Traits that help promotion. */
  promote: TraitId[];
  /** Savings from a term, copper, by rank. */
  pay: number[];
  /** Belongings by rank (the highest rank reached gives its set). */
  gear: string[][];
  lands: TrackLands;
  /** Why the track cannot be entered, or null. */
  open?: (c: TrackCtx) => string | null;
  /** Why a rank cannot be reached, or null. */
  gate?: (c: TrackCtx, rank: number) => string | null;
  /** A choice made on entering (a craft, a school). */
  choice?: { label: string; options: { id: string; name: string; skills: string[] }[] };
}

const noble = (s: StandingId) => s === 'minor' || s === 'noble';
const lettered = (c: TrackCtx) => c.literate || c.traits.intelligence >= 13;

export const CRAFTS = [
  { id: 'smith', name: 'Smith', skills: ['smithing', 'weaponsmith', 'armorsmith'] },
  { id: 'carpenter', name: 'Carpenter', skills: ['carpentry'] },
  { id: 'mason', name: 'Mason', skills: ['masonry'] },
  { id: 'tailor', name: 'Tailor and weaver', skills: ['tailoring'] },
  { id: 'tanner', name: 'Tanner and leatherworker', skills: ['hideworking'] },
  { id: 'jeweller', name: 'Jeweller', skills: ['jewelsmith'] },
  { id: 'brewer', name: 'Brewer and baker', skills: ['cooking'] },
  { id: 'potter', name: 'Potter and painter', skills: ['artistry'] },
];

export const SCHOOLS = ['abjuration', 'conjuration', 'divination', 'evocation', 'illusion', 'necromancy', 'transmutation', 'enchantment'].map((s) => ({
  id: s, name: s[0].toUpperCase() + s.slice(1), skills: [`spell.${s}`],
}));

export const TRACKS: TrackDef[] = [
  {
    id: 'military', name: 'Military', about: 'Levies, garrisons and companies of the realm.',
    ranks: ['Recruit', 'Soldier', 'Veteran', 'Captain', 'Knight'],
    skills: [{ id: 'polearms', w: 3 }, { id: 'shield', w: 2 }, { id: 'dodge', w: 2 }, { id: 'athletics', w: 2 }, { id: 'longblades', w: 2, from: 1 }, { id: 'crossbow', w: 1, from: 1 }, { id: 'riding', w: 1, from: 2 }, { id: 'leadership', w: 2, from: 3 }],
    lean: ['strength', 'constitution'], promote: ['strength', 'gravitas', 'willpower'],
    pay: [20, 40, 80, 200, 600],
    gear: [['spear', 'padded coat', 'knife'], ['spear', 'round shield', 'padded coat', 'knife'], ['spear', 'round shield', 'mail shirt', 'sword'], ['sword', 'heater shield', 'mail shirt', 'helm'], ['sword', 'heater shield', 'mail shirt', 'helm', 'horse']],
    lands: 'realm',
    gate: (c, r) => (r === 4 && !noble(c.standing) ? 'Knighthood needs noble birth or a deed of note.' : null),
  },
  {
    id: 'civil', name: 'Civil', about: 'Work for a lord or a town: labour, clerking, the court.',
    ranks: ['Peasant', 'Labourer', 'Clerk', 'Courtier', 'Manorial administrator'],
    skills: [{ id: 'athletics', w: 2, to: 1 }, { id: 'agriculture', w: 1, to: 1 }, { id: 'literacy', w: 2, from: 2 }, { id: 'persuasion', w: 2, from: 2 }, { id: 'stewardship', w: 2, from: 2 }, { id: 'know:law', w: 1, from: 2 }, { id: 'dance', w: 1, from: 3 }],
    lean: ['constitution', 'intelligence'], promote: ['intelligence', 'charm', 'aura'],
    pay: [10, 20, 60, 200, 500],
    gear: [['sickle'], ['tool roll'], ['writing kit'], ['writing kit', 'good clothes'], ['writing kit', 'good clothes', 'ledger']],
    lands: 'none',
    gate: (c, r) => (r === 2 && !lettered(c) ? 'A clerk must read, or be quick to learn.' : r === 3 && c.standing === 'peasant' ? 'The court does not take peasants.' : r === 4 && !noble(c.standing) && c.traits.intelligence < 14 ? 'Only the well-born or the very able run a manor.' : null),
  },
  {
    id: 'religion', name: 'Religion', about: 'The cloister and the parish.',
    ranks: ['Novice', 'Monk', 'Friar', 'Priest', 'Bishop'],
    skills: [{ id: 'know:theology', w: 3 }, { id: 'literacy', w: 2 }, { id: 'medicine', w: 1 }, { id: 'herbalism', w: 1 }, { id: 'persuasion', w: 1, from: 2 }, { id: 'storytelling', w: 1, from: 2 }],
    lean: ['wisdom', 'willpower'], promote: ['wisdom', 'willpower', 'charm'],
    pay: [5, 10, 20, 80, 400],
    gear: [['robe'], ['robe', 'prayer beads'], ['robe', 'staff', 'begging bowl'], ['vestments', 'holy book'], ['vestments', 'holy book', 'signet ring']],
    lands: 'roads',
    gate: (c, r) => (r === 4 && !noble(c.standing) && c.traits.charm + c.traits.gravitas < 28 ? 'A bishop needs patrons or a great presence.' : null),
  },
  {
    id: 'academia', name: 'Academia', about: 'Schools, colleges and universities.',
    ranks: ['Initiate', 'Student', 'Oblate', 'Clerk', 'Professor'],
    skills: [{ id: 'literacy', w: 3 }, { id: 'know:history', w: 2 }, { id: 'know:law', w: 2 }, { id: 'medicine', w: 1, from: 1 }, { id: 'alchemy', w: 1, from: 1 }, { id: 'cartography', w: 1 }],
    lean: ['intelligence'], promote: ['intelligence', 'willpower'],
    pay: [0, 0, 20, 80, 300],
    gear: [['writing kit'], ['writing kit', 'book'], ['writing kit', 'books'], ['writing kit', 'books', 'old map'], ['writing kit', 'books', 'old map', 'scholar\'s gown']],
    lands: 'maps',
    open: (c) => (lettered(c) || c.standing === 'clergy' || noble(c.standing) || c.standing === 'merchant' ? null : 'Schools take those who read, or who are clearly able.'),
  },
  {
    id: 'trades', name: 'Trades', about: 'Buying and selling, from a peddler\'s pack to a counting house.',
    ranks: ['Peddler', 'Trader', 'Merchant', 'Proprietor'],
    skills: [{ id: 'trading', w: 3 }, { id: 'persuasion', w: 2 }, { id: 'stewardship', w: 2, from: 1 }, { id: 'riding', w: 1 }, { id: 'cartography', w: 1 }],
    lean: ['charm', 'intelligence'], promote: ['charm', 'intelligence'],
    pay: [20, 80, 300, 900],
    gear: [['pack', 'trade goods'], ['pack', 'trade goods', 'scales'], ['mule', 'trade goods', 'scales', 'ledger'], ['ledger', 'good clothes', 'signet ring']],
    lands: 'roads',
  },
  {
    id: 'craft', name: 'Craft', about: 'A trade of the hands, from apprentice to master.',
    ranks: ['Apprentice', 'Journeyman', 'Master'],
    skills: [{ id: 'craft', w: 4 }, { id: 'trading', w: 1, from: 1 }, { id: 'artistry', w: 1 }],
    lean: ['strength', 'agility'], promote: ['agility', 'intelligence'],
    pay: [5, 40, 200],
    gear: [['apron'], ['tool roll', 'apron'], ['tool roll', 'apron', 'master\'s mark']],
    lands: 'none',
    choice: { label: 'Craft', options: CRAFTS },
    open: (c) => (c.standing === 'craftsman' || c.standing === 'townsfolk' || c.homeTier !== 'village' ? null : 'No master near enough to take an apprentice.'),
  },
  {
    id: 'outlaw', name: 'Underworld: outlaw', about: 'The roads and the woods, outside the law.',
    ranks: ['Vagabond', 'Bandit', 'Highwayman'],
    skills: [{ id: 'survival', w: 3 }, { id: 'sneak', w: 2 }, { id: 'shortblades', w: 2 }, { id: 'archery', w: 1 }, { id: 'tracking', w: 1 }, { id: 'riding', w: 1, from: 2 }],
    lean: ['agility', 'constitution'], promote: ['agility', 'gravitas'],
    pay: [5, 60, 200],
    gear: [['knife', 'blanket'], ['knife', 'short bow', 'arrows'], ['sword', 'short bow', 'arrows', 'horse']],
    lands: 'wild',
  },
  {
    id: 'thief', name: 'Underworld: city', about: 'Pockets, locks and confidence tricks.',
    ranks: ['Thief', 'Swindler', 'Guild member'],
    skills: [{ id: 'sleight', w: 3 }, { id: 'lockpicking', w: 2 }, { id: 'sneak', w: 2 }, { id: 'persuasion', w: 2, from: 1 }, { id: 'disguise', w: 1, from: 1 }],
    lean: ['agility'], promote: ['agility', 'aura'],
    pay: [20, 80, 250],
    gear: [['knife'], ['knife', 'lockpicks', 'good clothes'], ['knife', 'lockpicks', 'good clothes', 'guild token']],
    lands: 'none',
    open: (c) => (c.homeTier === 'village' ? 'There are no pockets worth picking in a village.' : null),
  },
  {
    id: 'woodland', name: 'Woodland', about: 'Foraging, trapping and hunting the wild.',
    ranks: ['Forager', 'Trapper', 'Hunter', 'Forester', 'Master of the hunt'],
    skills: [{ id: 'survival', w: 3 }, { id: 'tracking', w: 3 }, { id: 'trapping', w: 2 }, { id: 'know:nature', w: 2 }, { id: 'archery', w: 2, from: 2 }, { id: 'hideworking', w: 1 }, { id: 'herbalism', w: 1, to: 1 }],
    lean: ['constitution', 'agility'], promote: ['wisdom', 'agility'],
    pay: [5, 15, 30, 80, 300],
    gear: [['knife', 'basket'], ['knife', 'snares'], ['knife', 'hunting bow', 'arrows', 'snares'], ['hunting bow', 'arrows', 'axe', 'snares'], ['hunting bow', 'arrows', 'horse', 'hound']],
    lands: 'wild',
    gate: (c, r) => (r === 4 && !noble(c.standing) && c.traits.wisdom < 14 ? 'A lord\'s master of the hunt is chosen for birth or great skill.' : null),
  },
  {
    id: 'seafaring', name: 'Seafaring', about: 'Boats, ships and the sea.',
    ranks: ['Deckhand', 'Fisherman', 'Sailor', 'Boatswain', 'Captain'],
    skills: [{ id: 'sailing', w: 3 }, { id: 'swimming', w: 2 }, { id: 'fishing', w: 3, to: 1 }, { id: 'climbing', w: 1 }, { id: 'leadership', w: 1, from: 3 }, { id: 'cartography', w: 1, from: 3 }],
    lean: ['strength', 'constitution'], promote: ['agility', 'gravitas'],
    pay: [10, 30, 60, 150, 600],
    gear: [['knife', 'rope'], ['knife', 'net'], ['knife', 'rope', 'sea chest'], ['knife', 'sea chest', 'whistle'], ['sea chest', 'sea charts', 'good clothes']],
    lands: 'coast',
    open: (c) => (c.coastal || c.seafaringCulture ? null : 'Home is too far from the sea.'),
  },
  {
    id: 'performance', name: 'Performance', about: 'Music, tales and shows, for coin or a patron.',
    ranks: ['Busker', 'Minstrel', 'Player', 'Troubadour', 'Master bard'],
    skills: [{ id: 'music', w: 3 }, { id: 'storytelling', w: 2 }, { id: 'dance', w: 1 }, { id: 'persuasion', w: 1 }, { id: 'sleight', w: 1 }, { id: 'acrobatics', w: 1 }],
    lean: ['charm'], promote: ['charm', 'aura'],
    pay: [5, 20, 50, 150, 500],
    gear: [['pipe'], ['lute'], ['lute', 'costume'], ['fine lute', 'good clothes'], ['fine lute', 'good clothes', 'patron\'s letter']],
    lands: 'roads',
  },
  {
    id: 'healing', name: 'Healing', about: 'Herbs, births, wounds and physic.',
    ranks: ['Herb gatherer', 'Midwife', 'Barber-surgeon', 'Physician'],
    skills: [{ id: 'herbalism', w: 3 }, { id: 'medicine', w: 3, from: 1 }, { id: 'alchemy', w: 1, from: 2 }, { id: 'literacy', w: 1, from: 3 }],
    lean: ['wisdom'], promote: ['wisdom', 'intelligence'],
    pay: [5, 20, 60, 300],
    gear: [['knife', 'herb satchel'], ['herb satchel', 'bandages'], ['herb satchel', 'bandages', 'surgeon\'s kit'], ['surgeon\'s kit', 'bandages', 'medicine chest', 'books']],
    lands: 'none',
    gate: (c, r) => (r === 3 && !lettered(c) ? 'A physician must read the old texts.' : null),
  },
  {
    id: 'farming', name: 'Farming', about: 'Working and, in time, holding land.',
    ranks: ['Farmhand', 'Tenant', 'Freeholder', 'Reeve'],
    skills: [{ id: 'agriculture', w: 3 }, { id: 'animals', w: 2 }, { id: 'athletics', w: 2 }, { id: 'stewardship', w: 1, from: 2 }, { id: 'leadership', w: 1, from: 3 }],
    lean: ['strength', 'constitution'], promote: ['constitution', 'wisdom'],
    pay: [5, 20, 60, 150],
    gear: [['sickle'], ['sickle', 'hoe'], ['sickle', 'hoe', 'ox'], ['sickle', 'hoe', 'ox', 'ledger']],
    lands: 'none',
    open: (c) => (c.standing === 'noble' ? 'A great house does not put its children to the plough.' : null),
  },
  {
    id: 'magic', name: 'Magic', about: 'The study of spellcraft, under a master or a college.',
    ranks: ['Apprentice', 'Journeyman', 'Adept', 'Magister'],
    skills: [{ id: 'school', w: 3 }, { id: 'literacy', w: 2 }, { id: 'alchemy', w: 1 }, { id: 'artificing', w: 1, from: 1 }],
    lean: ['intelligence', 'willpower'], promote: ['intelligence', 'willpower'],
    pay: [0, 20, 100, 400],
    gear: [['writing kit', 'spell book'], ['writing kit', 'spell book', 'reagents'], ['spell book', 'reagents', 'staff'], ['spell book', 'reagents', 'staff', 'robes of the college']],
    lands: 'maps',
    choice: { label: 'School', options: SCHOOLS },
    open: (c) => {
      if (c.traits.intelligence < 14 || c.traits.willpower < 13) return 'Magic needs Intelligence 14 and Willpower 13 or more.';
      if (c.homeTier !== 'city' && !(c.ranks.academia >= 1)) return 'Masters of magic are found only in cities (or through study).';
      if (!c.literate && !(c.ranks.academia >= 0)) return 'A mage must read.';
      return null;
    },
  },
];

export const TRACK = new Map(TRACKS.map((t) => [t.id, t]));

/** Belongings: weight (kg) and bulk (litres) of the gear named above. */
export const GEAR: Record<string, [number, number]> = {
  spear: [2.2, 4], 'padded coat': [3, 8], knife: [0.2, 0.2], 'round shield': [4, 12], 'mail shirt': [11, 6], sword: [1.3, 2], 'heater shield': [3.5, 10], helm: [2, 4],
  horse: [0, 0], mule: [0, 0], ox: [0, 0], hound: [0, 0], sickle: [0.5, 1], 'tool roll': [2.5, 3], 'writing kit': [0.5, 1], 'good clothes': [2, 4], ledger: [1, 1.5],
  robe: [1.5, 3], 'prayer beads': [0.1, 0.1], staff: [1.5, 3], 'begging bowl': [0.3, 0.8], vestments: [2.5, 5], 'holy book': [1.5, 2], 'signet ring': [0.02, 0],
  book: [1, 1.5], books: [3, 4], 'old map': [0.1, 0.2], "scholar's gown": [1.5, 3], pack: [1, 2], 'trade goods': [8, 15], scales: [1, 1.5], apron: [0.5, 1],
  "master's mark": [0.1, 0.1], blanket: [2, 6], 'short bow': [0.8, 3], arrows: [0.04, 0.05], lockpicks: [0.1, 0.1], 'guild token': [0.02, 0], basket: [0.6, 12],
  snares: [0.5, 1], 'hunting bow': [1, 4], axe: [1.5, 2], rope: [3, 4], net: [2, 6], 'sea chest': [10, 60], whistle: [0.05, 0], 'sea charts': [0.3, 0.5],
  pipe: [0.2, 0.3], lute: [2, 12], costume: [1.5, 4], 'fine lute': [2, 12], "patron's letter": [0.01, 0], 'herb satchel': [1, 3], bandages: [0.3, 0.5],
  "surgeon's kit": [1.5, 2], 'medicine chest': [4, 8], hoe: [1.5, 3], 'spell book': [2, 2], reagents: [1, 1.5], 'robes of the college': [2, 4],
  clothes: [2, 4], boots: [1.5, 3], cloak: [1.5, 4], 'flint and steel': [0.1, 0.1], waterskin: [0.3, 1.5], bread: [0.5, 1],
};

/** How many of a thing make a set ("arrows" come in twenties). */
export const GEAR_QTY: Record<string, number> = { arrows: 20, bandages: 6, bread: 2 };
