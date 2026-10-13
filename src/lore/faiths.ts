import { hashString, mulberry32, type Rng } from '../gen/rng';
import type { PolUnit } from '../gen/politics';
import type { LabelFeature } from '../gen/features';
import { CULTURES, FAMILIES as LANG_FAMILIES } from '../names/cultures';
import type { NameBank } from '../names/names';
import type { Charge } from '../heraldry/arms';
import type { Language } from '../lang/language';
import { PROPER, nameCase, translate } from '../lang/translate';

/**
 * The world's faiths, generated from familiar **archetypes** (a church, the faith of the
 * prophets, a pantheon, the old gods, druids, the stars, the ancestors, the eternal sky, the way
 * of heaven, the spirits of place, the great spirit, the sun, the feathered serpent).
 *
 * The mix: every **language family** begins with a native faith of its own, made in its
 * proto-language (its gods, scripture and name in that tongue); sister peoples keep it as sects
 * of their own. Then two or three **missionary faiths**, founded by a prophet among one Old World
 * people, spread outward over the centuries and convert some peoples, nearer ones first. The old
 * faiths of converted peoples live on among holdouts. Each faith has **doctrines** (head of faith,
 * clergy, conversion, view of other faiths, death rites, marriage) and **tenets** in the manner of
 * Crusader Kings; these decide how readily it fights holy wars, how its realms treat other faiths,
 * and how it spreads. Holy places include the map's own peaks, lakes, groves and isles.
 *
 * A realm keeps the faith of its rulers' people, and the sect whose birthplace lies nearest.
 */

const pick = <T>(rnd: Rng, a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
function weighted<T>(rnd: Rng, a: [T, number][]): T {
  const tot = a.reduce((s, x) => s + x[1], 0);
  let r = rnd() * tot;
  for (const [v, w] of a) if ((r -= w) < 0) return v;
  return a[a.length - 1][0];
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type FaithFamily = 'church' | 'crescent' | 'pantheon' | 'oldgods' | 'druid' | 'stars' | 'ancestors' | 'sky' | 'heaven' | 'kami' | 'spirits' | 'sun' | 'serpent';

// ---- Doctrines and tenets --------------------------------------------------------------------

export type DoctrineGroup = 'head' | 'clergy' | 'conversion' | 'others' | 'death' | 'marriage';
export interface DoctrineDef {
  name: string;
  text: string;
}
/** Each group's choices, with a name and what it means. */
export const DOCTRINES: Record<DoctrineGroup, Record<string, DoctrineDef>> = {
  head: {
    pontiff: { name: 'A head of faith', text: 'One high priest leads the faith, above every king.' },
    ruler: { name: 'Sacred rulers', text: 'The ruler is the high priest, and speaks for the gods.' },
    none: { name: 'No head', text: 'No one leads the faith; each temple and its priests answer to the gods alone.' },
  },
  clergy: {
    celibate: { name: 'Celibate clergy', text: 'Priests take no spouse and leave no heirs.' },
    married: { name: 'Married clergy', text: 'Priests marry and raise families like other folk.' },
    hereditary: { name: 'Priestly houses', text: 'The priesthood passes from parent to child within holy houses.' },
    priestesses: { name: 'Priestesses', text: 'Only women may serve the gods as priests.' },
    open: { name: 'Open priesthood', text: 'Any man or woman called by the gods may serve.' },
  },
  conversion: {
    missionary: { name: 'Missionary', text: 'The faithful are bound to carry the faith to every people.' },
    closed: { name: 'Closed', text: 'The faith belongs to its people; outsiders are seldom taken in.' },
    sword: { name: 'By the sword', text: 'Unbelievers may be brought to the faith by conquest.' },
  },
  others: {
    pluralist: { name: 'Pluralist', text: 'Other faiths are other roads to the divine, and are left in peace.' },
    righteous: { name: 'Righteous', text: 'Other faiths are in error, though their followers may be tolerated for a tax.' },
    fundamentalist: { name: 'Fundamentalist', text: 'Other faiths are an abomination, and their shrines must fall.' },
  },
  death: {
    burial: { name: 'Burial', text: 'The dead are buried in holy ground.' },
    burning: { name: 'Burning', text: 'The dead are burned on pyres, so their souls rise with the smoke.' },
    barrows: { name: 'Barrows', text: 'The great dead are laid in mounds with their goods and weapons.' },
    tombs: { name: 'Tombs', text: 'The dead are kept in stone tombs, and the great are preserved and honoured.' },
    sky: { name: 'Sky burial', text: 'The dead are left on high places for the birds, and return to the sky.' },
    sea: { name: 'The sea', text: 'The dead are given to the water in boats, to sail beyond the world.' },
  },
  marriage: {
    monogamy: { name: 'Monogamy', text: 'One spouse for life.' },
    concubines: { name: 'Concubines', text: 'One spouse, and lords may keep concubines.' },
    polygamy: { name: 'Polygamy', text: 'A man may take as many wives as he can keep.' },
  },
};
const GROUPS = Object.keys(DOCTRINES) as DoctrineGroup[];

export interface TenetDef {
  name: string;
  text: string;
  /** What it does in the world, in plain words (empty for flavour). */
  effect: string;
  /** Holy-war zeal added (or taken away). */
  zeal?: number;
  /** Readiness to spread the faith. */
  spread?: number;
}
export const TENETS: Record<string, TenetDef> = {
  holyWar: { name: 'Holy War', text: 'War against the unbeliever is a sacred duty, and those who fall in it are saved.', effect: 'More holy wars.', zeal: 0.6 },
  pilgrimage: { name: 'Pilgrimage', text: 'Every believer should journey to the holy places once in a life.', effect: 'Pilgrims bring trade to holy cities.' },
  charity: { name: 'Alms', text: 'Giving to the poor is the first duty of the faithful.', effect: '' },
  monasticism: { name: 'Monastic Orders', text: 'Monks and nuns keep the learning of the age in their houses.', effect: 'Learning thrives.' },
  mendicants: { name: 'Mendicant Preachers', text: 'Wandering preachers carry the word from town to town.', effect: 'The faith spreads further.', spread: 0.3 },
  endTimes: { name: 'The End of Days', text: 'The world will end in fire, and the faithful must be ready.', effect: 'Zealous.', zeal: 0.2 },
  sacredLaw: { name: 'Sacred Law', text: 'All law comes from scripture, and its scholars are its judges.', effect: '' },
  aniconism: { name: 'Aniconism', text: 'Images of the living are forbidden in holy places.', effect: '' },
  purity: { name: 'Ritual Purity', text: 'Pollution is washed away before every rite; some foods and deeds are unclean.', effect: '' },
  ritualSacrifice: { name: 'Ritual Sacrifice', text: 'The gods are fed with offerings of beasts, and in dark times of men.', effect: 'Feared by its neighbours.', zeal: 0.15 },
  divination: { name: 'Divination', text: 'Seers read the gods’ will in entrails, birds and runes before every great deed.', effect: '' },
  feastDays: { name: 'Great Feasts', text: 'The year turns on great feasts in the gods’ honour, with games and offerings.', effect: '' },
  hospitality: { name: 'Sacred Hospitality', text: 'A guest under one’s roof is under the gods’ protection.', effect: 'Kinder to strangers.', zeal: -0.15 },
  astrology: { name: 'Astrology', text: 'The stars are read at every birth and before every war.', effect: '' },
  warriorCult: { name: 'Warrior Paradise', text: 'Those who die bravely in battle feast with the gods for ever.', effect: 'Warlike.', zeal: 0.3 },
  sacredGroves: { name: 'Sacred Groves', text: 'The gods dwell in groves, springs and stones; to fell a holy tree is death.', effect: '' },
  sacredWaters: { name: 'Sacred Waters', text: 'Springs, wells and rivers are holy, and must never be fouled.', effect: '' },
  nature: { name: 'Sanctity of Nature', text: 'All living things have spirit; nothing is taken without thanks.', effect: 'Slow to make war.', zeal: -0.2 },
  rebirth: { name: 'Rebirth', text: 'Souls are born again, higher or lower by the deeds of their past life.', effect: '' },
  ancestors: { name: 'Ancestor Veneration', text: 'The dead are fed and asked for counsel at the family shrine.', effect: '' },
  kingship: { name: 'Sacred Kingship', text: 'The ruler is chosen by heaven, and rules by its mandate.', effect: 'Rulers seldom face revolt in the faith’s name.' },
  asceticism: { name: 'Asceticism', text: 'Holiness lies in fasting, poverty and the denial of the flesh.', effect: '' },
  pacifism: { name: 'Pacifism', text: 'To shed blood is a sin; war is the last and darkest choice.', effect: 'Few holy wars.', zeal: -0.6 },
  craft: { name: 'Craft as Worship', text: 'Good work of hand is prayer; the masterwork is an offering.', effect: 'Fine crafts.' },
  dualism: { name: 'Dualism', text: 'The world is a war between light and darkness, and every soul must choose.', effect: 'Zealous.', zeal: 0.25 },
  carnalism: { name: 'Carnalism', text: 'The pleasures of the flesh are sacred and must be indulged in moderation.', effect: 'Pleasure is holy.' },
  communion: { name: 'Communion', text: 'The faithful partake in sacred meals to unite with the divine.', effect: 'Strengthens community bonds.' },
  ecclesiarchy: { name: 'Ecclesiarchy', text: 'The church governs all aspects of life, and its leaders are divinely appointed.', effect: 'Clerical authority is supreme.' },
  adorcism: { name: 'Adorcism', text: 'The faithful seek to embody the divine and the spirit world within themselves.', effect: '' },
  witchcraft: { name: 'Witchcraft', text: 'Magic and the manipulation of unseen forces are practiced by the faithful.', effect: '' },
  hedonism: { name: 'Hedonism', text: 'The pursuit of pleasure is the highest good and a sacred duty.', effect: '' },
  suicide: { name: 'Ritual Suicide', text: 'Taking one’s own life is considered a sacred act under certain circumstances.', effect: '' },
  filialPiety: { name: 'Filial Piety', text: 'Respect and care for one’s parents and ancestors is a sacred duty.', effect: '' },
  takamine: { name: 'Takamine', text: 'Reverence for the mountain spirits and the natural world.', effect: '' },
  sacredLearning: { name: 'Sacred Learning', text: 'The pursuit of knowledge and wisdom is a sacred duty. Science and religion ties together', effect: 'Learning is revered.' }
};
const CLASH: [string, string][] = [['pacifism', 'holyWar'], ['pacifism', 'warriorCult'], ['pacifism', 'ritualSacrifice'], ['nature', 'holyWar']];

// ---- Archetypes --------------------------------------------------------------------------------

interface Archetype {
  kind: string;
  /** English name patterns: {P} the prophet or founder (a proper name), {H} the founding people's name for themselves, {L} a word of light. */
  names: string[];
  adherents: string[];
  head: string[];
  clergy: string[];
  temple: string[];
  scripture: string[];
  symbols: [string, Charge][];
  /** Domains of the god or gods; the first is the chief one. */
  domains: string[];
  gods: [number, number];
  /** Flavour teachings. */
  beliefs: string[];
  /** Sect name patterns ({N} a proper name). */
  sect: string[];
  age: [number, number];
  doctrines: Partial<Record<DoctrineGroup, Record<string, number>>>;
  tenets: string[];
  /** Natural holy places it favours. */
  places: string[];
}
const LIGHT = ['Light', 'Flame', 'Dawn', 'Lamb', 'Burning Star', 'Morning Star', 'Holy Wheel', 'Seven Lamps', 'Eternal Fire', 'Open Hand', 'White Dove', 'Golden Key'];
const A: Record<FaithFamily, Archetype> = {
  church: {
    kind: 'monotheist church', names: ['the Church of the {L}', 'the Faith of the {L}', 'the {L} Church', 'the Church of {P}'], adherents: ['the Faithful', 'the Brethren'],
    head: ['Pontiff', 'Patriarch', 'Hierophant', 'Exarch'], clergy: ['priests', 'bishops and priests', 'friars and priests'], temple: ['cathedrals and chapels', 'basilicas and churches'],
    scripture: ['the Book of {P}', 'the Testament of {P}', 'the Holy Canon', 'the Gospels of {P}'],
    symbols: [['a radiant sun', 'sun'], ['a cross', 'cross'], ['a wheel', 'wheel'], ['a key', 'key'], ['a lamb', 'cross'], ['a dove', 'bird']],
    domains: ['the One God, creator of all', 'prophet and martyr', 'the first apostle', 'patron saint of sailors', 'patron saint of soldiers', 'patron saint of healers', 'patron saint of the poor', 'patron saint of scholars'],
    gods: [4, 6], age: [500, 1100],
    beliefs: ['One god, revealed through a prophet', 'Confession and penance', 'Saints intercede for the living', 'Tithes are owed to the church', 'The prophet will return at the end of days'],
    sect: ['the Reformed Church', 'the Old Rite', 'the Eastern Rite', 'the {N} Confession', 'the Church of {N}', 'the Free Church', 'the {N} Rite'],
    doctrines: { head: { pontiff: 6, none: 1 }, clergy: { celibate: 3, married: 1 }, conversion: { missionary: 5, sword: 1 }, others: { righteous: 3, fundamentalist: 1, pluralist: 1 }, death: { burial: 6 }, marriage: { monogamy: 6 } },
    tenets: ['pilgrimage', 'charity', 'monasticism', 'holyWar', 'endTimes', 'mendicants', 'asceticism', 'communion', 'ecclesiarchy', 'filialPiety'], places: ['island', 'peak'],
  },
  crescent: {
    kind: 'faith of the prophets', names: ['the Faith of the Prophet', 'the Way of {P}', 'the Submission', 'the Path of the Merciful'], adherents: ['the Believers', 'the Submitters'],
    head: ['Caliph', 'Grand Imam'], clergy: ['imams and scholars', 'imams and judges'], temple: ['mosques and schools', 'great mosques'],
    scripture: ['the Recitation', 'the Book of {P}', 'the Revealed Word'], symbols: [['a crescent', 'crescent'], ['a star', 'mullet'], ['a lamp', 'estoile']],
    domains: ['the one God, compassionate and just', 'the last prophet', 'the first caliph', 'the martyred imam', 'the hidden imam'], gods: [3, 5], age: [400, 900],
    beliefs: ['One god and his last prophet', 'Prayer five times a day', 'A fast in the holy month', 'The prophet’s sayings guide daily life'],
    sect: ['the Followers of the Imams', 'the People of the Tradition', 'the {N} School', 'the Seceders', 'the Mystic Brotherhood of {N}'],
    doctrines: { head: { pontiff: 3, none: 2 }, clergy: { married: 5 }, conversion: { missionary: 3, sword: 2 }, others: { righteous: 3, pluralist: 1.5, fundamentalist: 0.7 }, death: { burial: 6 }, marriage: { polygamy: 3, concubines: 1 } },
    tenets: ['pilgrimage', 'charity', 'sacredLaw', 'aniconism', 'holyWar', 'purity', 'communion', 'ecclesiarchy', 'filialPiety', 'sacredLearning'], places: ['peak'],
  },
  pantheon: {
    kind: 'pantheon of gods', names: ['the Gods of {H}', 'the Twelve', 'the Old Rites', 'the Mysteries of {P}', 'the Gods of the Mountain'], adherents: ['the Pious'],
    head: ['High Priest', 'Archpriestess', 'Oracle'], clergy: ['priests and oracles', 'priestesses'], temple: ['temples and sanctuaries', 'temples with colonnades'],
    scripture: ['the Sacred Hymns', 'the Birth of the Gods', 'the Oracles'], symbols: [['an owl', 'bird'], ['a thunderbolt', 'estoile'], ['a trident', 'anchor'], ['a laurel', 'tree']],
    domains: ['king of the gods and the sky', 'queen of the gods and marriage', 'god of the sea', 'goddess of wisdom and war', 'god of the sun and music', 'goddess of the hunt and the moon', 'god of the forge', 'goddess of the harvest', 'god of wine and revels', 'god of the dead'],
    gods: [6, 9], age: [1200, 2000],
    beliefs: ['Many gods, each with a temple and a feast', 'Oracles speak the gods’ will', 'The dead cross a river to the underworld'],
    sect: ['the Mysteries of {N}', 'the {N} Cult', 'the Philosophers of {N}'],
    doctrines: { head: { none: 3, pontiff: 1 }, clergy: { open: 3, priestesses: 1, hereditary: 1 }, conversion: { closed: 3, missionary: 0.5 }, others: { pluralist: 4, righteous: 0.6 }, death: { burning: 2, burial: 2 }, marriage: { monogamy: 2, concubines: 2 } },
    tenets: ['ritualSacrifice', 'divination', 'feastDays', 'hospitality', 'astrology', 'carnalism', 'ecclesiarchy', 'hedonism'], places: ['peak', 'island'],
  },
  oldgods: {
    kind: 'the old gods', names: ['the Old Gods', 'the Old Custom', 'the Faith of the High One', 'the Gods of the Hall'], adherents: ['the Heathen', 'the Sworn'],
    head: ['High Priest', 'High Seeress'], clergy: ['priests and seeresses', 'priests of the hall'], temple: ['halls of the gods and sacred groves', 'temples and stone circles'],
    scripture: ['the Sayings of the High One', 'the Old Songs'], symbols: [['a hammer', 'hammer'], ['a raven', 'bird'], ['an axe', 'axe'], ['a serpent', 'serpent']],
    domains: ['the All-father, god of wisdom and the slain', 'god of thunder', 'goddess of love and battle', 'god of the harvest', 'the trickster', 'goddess of the dead', 'god of the sea', 'god of the hunt'],
    gods: [5, 8], age: [1500, 2500],
    beliefs: ['Oaths are sacred', 'Seers read the runes', 'The world will end in fire and ice'],
    sect: ['the Cult of {N}', 'the Old Way'],
    doctrines: { head: { none: 3, ruler: 1 }, clergy: { hereditary: 2, open: 2 }, conversion: { closed: 2, sword: 1 }, others: { pluralist: 2, righteous: 1 }, death: { burning: 3, barrows: 3, sea: 1 }, marriage: { concubines: 2, monogamy: 1, polygamy: 1 } },
    tenets: ['warriorCult', 'ritualSacrifice', 'divination', 'feastDays', 'sacredGroves', 'carnalism', 'adorcism', 'witchcraft', 'suicide'], places: ['forest', 'peak', 'island'],
  },
  druid: {
    kind: 'druidic nature faith', names: ['the Old Faith', 'the Way of the Grove', 'the Oak and the Stone', 'the Mysteries of {P}'], adherents: ['the Children of the Oak'],
    head: ['Archdruid'], clergy: ['druids, bards and seers'], temple: ['sacred groves and stone circles'], scripture: ['the unwritten lore of the druids', 'the Songs of the Grove'],
    symbols: [['an oak', 'tree'], ['an acorn', 'acorn'], ['a crescent moon', 'crescent'], ['a stag', 'horn']],
    domains: ['the Mother, goddess of the land', 'the Horned One, lord of beasts', 'god of the sun and craft', 'goddess of rivers and wells', 'the queen of battle and fate', 'god of the sea'],
    gods: [4, 6], age: [1500, 2500],
    beliefs: ['Druids alone may judge', 'Feasts at the turning of the year', 'Heads of foes are kept as trophies'],
    sect: ['the {N} Brotherhood', 'the Grove of {N}'],
    doctrines: { head: { pontiff: 2, none: 1 }, clergy: { open: 2, hereditary: 1 }, conversion: { closed: 3 }, others: { pluralist: 2, righteous: 0.5 }, death: { barrows: 2, burning: 1 }, marriage: { monogamy: 1, concubines: 1 } },
    tenets: ['sacredGroves', 'rebirth', 'sacredWaters', 'divination', 'nature', 'witchcraft'], places: ['forest', 'lake', 'island'],
  },
  stars: {
    kind: 'worship of the stars', names: ['the Song of the Stars', 'the Starlit Way', 'the Light of {P}'], adherents: ['the Starborn'],
    head: ['High Priestess', 'Keeper of the Stars'], clergy: ['star-singers', 'priestesses of the moon'], temple: ['open-roofed star temples', 'moonlit shrines'],
    scripture: ['the Lay of {P}', 'the Song of First Light'], symbols: [['a star', 'estoile'], ['a crescent moon', 'crescent'], ['a tree', 'tree']],
    domains: ['the Lady of the Stars, who sang the world', 'lord of the moon', 'lady of the evening star', 'keeper of the forest', 'lord of the sea and the far west', 'lady of dreams'],
    gods: [4, 6], age: [3000, 6000],
    beliefs: ['The stars are the first light and the elves its children', 'Every forest has its guardian', 'Song is prayer'],
    sect: ['the Moon-sworn of {N}', 'the {N} Choir'],
    doctrines: { head: { pontiff: 1, none: 1 }, clergy: { priestesses: 3, open: 1 }, conversion: { closed: 3 }, others: { pluralist: 3, righteous: 0.5 }, death: { sea: 3, burial: 1 }, marriage: { monogamy: 4 } },
    tenets: ['astrology', 'nature', 'pacifism', 'rebirth', 'sacredGroves', 'witchcraft'], places: ['forest', 'island', 'lake'],
  },
  ancestors: {
    kind: 'worship of the ancestors', names: ['the Forge and the Fathers', 'the Way of the Ancestors', 'the Hall of the Fathers'], adherents: ['the Children of the Forge'],
    head: ['High Forgepriest', 'Keeper of the Runes'], clergy: ['forge-priests and rune-keepers'], temple: ['deep shrines and ancestor halls'], scripture: ['the Rune-tablets of the Fathers', 'the Book of Grudges'],
    symbols: [['a hammer', 'hammer'], ['an anvil', 'hammer'], ['a mountain', 'tower']],
    domains: ['the Forge-father, who carved the first folk from stone', 'the Mother of the Deeps', 'god of oaths and grudges', 'god of gold and the hoard', 'god of the halls and hearth'],
    gods: [3, 5], age: [3000, 5000],
    beliefs: ['The first folk were carved from stone', 'Grudges are written and never forgotten', 'The ancestors watch from the deep halls'],
    sect: ['the {N} Rune-lodge', 'the Deep Fathers'],
    doctrines: { head: { pontiff: 1, ruler: 1 }, clergy: { hereditary: 3, married: 1 }, conversion: { closed: 4 }, others: { righteous: 2, pluralist: 1 }, death: { tombs: 4 }, marriage: { monogamy: 3 } },
    tenets: ['ancestors', 'craft', 'sacredLaw', 'asceticism', 'adorcism', 'suicide', 'filialPiety'], places: ['peak'],
  },
  sky: {
    kind: 'cult of the eternal sky', names: ['the Eternal Sky', 'the Sky and the Earth', 'the Blue Heaven', 'the Way of {P}'], adherents: ['the Children of the Sky'],
    head: ['Chief Shaman'], clergy: ['shamans'], temple: ['cairns on the high passes'], scripture: ['the songs of the shamans'],
    symbols: [['a horse', 'horn'], ['the sun', 'sun'], ['an eagle', 'eagle']],
    domains: ['the Eternal Sky, father of all', 'the Earth Mother', 'spirit of the hearth', 'spirit of the horse herds', 'the wolf ancestor'], gods: [3, 5], age: [2000, 3000],
    beliefs: ['The Sky gives a ruler fortune to rule', 'Spirits dwell in fire, water and stone', 'Shamans walk between the worlds'],
    sect: ['the Black Shamans', 'the White Shamans'],
    doctrines: { head: { none: 2, ruler: 2 }, clergy: { open: 3 }, conversion: { closed: 2, sword: 1 }, others: { pluralist: 4 }, death: { sky: 4, barrows: 1 }, marriage: { polygamy: 2, concubines: 2 } },
    tenets: ['nature', 'sacredWaters', 'divination', 'warriorCult', 'adorcism', 'suicide', 'takamine'], places: ['peak', 'lake'],
  },
  heaven: {
    kind: 'way of heaven', names: ['the Way of Heaven', 'the Teachings of the Sages', 'the Way of {P}', 'the Middle Way'], adherents: ['the Followers of the Way'],
    head: ['Grand Master of Rites', 'Celestial Master'], clergy: ['monks, sages and ritualists'], temple: ['temples and ancestral halls', 'monasteries and shrines'],
    scripture: ['the Classics of the Sages', 'the Sayings of {P}', 'the Book of Changes'], symbols: [['a dragon', 'serpent'], ['clouds', 'cloud'], ['the sun', 'sun'], ['a lotus', 'blossom']],
    domains: ['Heaven, which grants the mandate to rule', 'the Jade Lord, ruler of the celestial court', 'the first sage', 'the god of the hearth', 'the queen mother of the west'],
    gods: [3, 5], age: [1500, 2600],
    beliefs: ['Filial duty', 'Harmony between Heaven, Earth and Man', 'Learning opens the road to office'],
    sect: ['the School of {N}', 'the Pure Land', 'the Sudden Way', 'the {N} Teaching', 'the Way of Rites'],
    doctrines: { head: { ruler: 3, pontiff: 1 }, clergy: { celibate: 2, married: 2 }, conversion: { missionary: 2, closed: 1 }, others: { pluralist: 4 }, death: { burial: 4, burning: 1 }, marriage: { concubines: 3, monogamy: 1 } },
    tenets: ['ancestors', 'monasticism', 'asceticism', 'kingship', 'pacifism', 'rebirth', 'filialPiety'], places: ['peak', 'lake'],
  },
  kami: {
    kind: 'way of the spirits', names: ['the Way of the Spirits', 'the Eight Thousand Spirits', 'the Way of {P}'], adherents: ['the Faithful'],
    head: ['High Priestess of the Sun'], clergy: ['shrine priests and shrine maidens', 'monks and shrine priests'], temple: ['shrines with gates and temples'],
    scripture: ['the Records of Ancient Matters'], symbols: [['the rising sun', 'sun'], ['a comma', 'tomoe'], ['a blossom', 'blossom']],
    domains: ['goddess of the sun, ancestor of the emperors', 'god of storms and the sea', 'god of the moon', 'god of rice and foxes', 'god of war and archery'], gods: [4, 6], age: [1500, 2500],
    beliefs: ['Spirits dwell in mountains, trees and rivers', 'The emperor descends from the sun', 'Festivals for each season'],
    sect: ['the {N} Sect', 'the Mountain Ascetics', 'the Pure Land'],
    doctrines: { head: { ruler: 3, none: 1 }, clergy: { hereditary: 2, open: 1 }, conversion: { closed: 3 }, others: { pluralist: 4 }, death: { burning: 2, burial: 2 }, marriage: { concubines: 2, monogamy: 2 } },
    tenets: ['purity', 'kingship', 'nature', 'feastDays', 'adorcism', 'takamine'], places: ['peak', 'forest', 'island'],
  },
  spirits: {
    kind: 'faith of the great spirit', names: ['the Great Spirit', 'the Way of the Grandfathers', 'the Sacred Circle'], adherents: ['the People'],
    head: ['Keeper of the Medicine'], clergy: ['medicine men and women'], temple: ['medicine lodges and sweat lodges'], scripture: ['the stories of the elders'],
    symbols: [['a feather', 'feather'], ['a bird', 'bird'], ['the sun', 'sun'], ['a serpent', 'serpent']],
    domains: ['the Great Spirit, in all things', 'Grandfather Sun', 'Grandmother Moon', 'the Thunderbird', 'the Trickster', 'Mother Earth'], gods: [3, 5], age: [3000, 6000],
    beliefs: ['Visions guide the young', 'Land belongs to no one', 'Decisions consider seven generations'],
    sect: ['the {N} Dance', 'the {N} Society'],
    doctrines: { head: { none: 4 }, clergy: { open: 3 }, conversion: { closed: 3 }, others: { pluralist: 4 }, death: { burial: 2, sky: 1, burning: 1 }, marriage: { monogamy: 2, polygamy: 1 } },
    tenets: ['nature', 'divination', 'ancestors', 'rebirth', 'hospitality', 'carnalism', 'adorcism', 'witchcraft', 'takamine'], places: ['lake', 'peak', 'forest'],
  },
  sun: {
    kind: 'cult of the sun', names: ['the Children of the Sun', 'the Sun and the Mountains', 'the Cult of the Sun'], adherents: ['the Children of the Sun'],
    head: ['High Priest of the Sun'], clergy: ['priests and chosen women'], temple: ['sun temples and mountain shrines'], scripture: ['the knotted records of the priests'],
    symbols: [['the sun', 'sun'], ['a condor', 'eagle'], ['a stepped cross', 'cross']],
    domains: ['the Sun, father of kings', 'the Moon, his sister-wife', 'the Creator, who rose from the lake', 'god of thunder and rain', 'the Earth Mother', 'the spirits of the mountains'],
    gods: [4, 6], age: [800, 1500],
    beliefs: ['Mountains and springs are holy', 'Labour is owed to the Sun and the state'],
    sect: ['the Lake Cult', 'the Mountain Cult of {N}'],
    doctrines: { head: { ruler: 4 }, clergy: { hereditary: 2, open: 1 }, conversion: { sword: 2, closed: 1 }, others: { righteous: 2, pluralist: 1 }, death: { tombs: 4 }, marriage: { polygamy: 2, concubines: 2 } },
    tenets: ['kingship', 'ancestors', 'ritualSacrifice', 'astrology', 'sacredWaters', 'hedonism', 'suicide'], places: ['peak', 'lake'],
  },
  serpent: {
    kind: 'cult of the feathered serpent', names: ['the Feathered Serpent', 'the Count of Days', 'the Gods of {H}'], adherents: ['the Faithful'],
    head: ['High Priest', 'Speaker of the Calendar'], clergy: ['priests and calendar-keepers'], temple: ['stepped pyramids', 'pyramid temples and ball-courts'],
    scripture: ['the folded books of days'], symbols: [['a feathered serpent', 'serpent'], ['a jaguar', 'roundel'], ['the sun', 'sun'], ['a bird', 'bird']],
    domains: ['the Feathered Serpent, bringer of learning', 'god of rain', 'god of maize', 'the Smoking Mirror, god of night and fate', 'the sun, who must be fed', 'god of death'],
    gods: [5, 7], age: [1500, 2500],
    beliefs: ['Time turns in great cycles', 'The ball-game re-enacts the struggle of the gods', 'Kings bleed to speak to their ancestors'],
    sect: ['the Cult of {N}', 'the Jaguar Brotherhood'],
    doctrines: { head: { pontiff: 2, ruler: 2 }, clergy: { hereditary: 2, open: 1 }, conversion: { sword: 2, closed: 1 }, others: { righteous: 2, pluralist: 1 }, death: { tombs: 2, burial: 2 }, marriage: { polygamy: 2, monogamy: 1 } },
    tenets: ['ritualSacrifice', 'astrology', 'kingship', 'feastDays', 'dualism', 'carnalism', 'witchcraft', 'suicide'], places: ['peak', 'lake'],
  },
};
export const ARCHETYPE_LABEL: Record<FaithFamily, string> = {
  church: 'a church', crescent: 'the faith of the prophets', pantheon: 'a pantheon', oldgods: 'the old gods', druid: 'a druid faith', stars: 'the stars', ancestors: 'the ancestors',
  sky: 'the eternal sky', heaven: 'the way of heaven', kami: 'the spirits of place', spirits: 'the great spirit', sun: 'the sun', serpent: 'the feathered serpent',
};

/** Each template's native faith, and the faith its people found when they found a missionary one. */
const NATIVE: Record<string, FaithFamily> = {
  anglo: 'oldgods', norse: 'oldgods', slavic: 'oldgods', latin: 'pantheon', southern: 'pantheon', desert: 'pantheon', celtic: 'druid', elvish: 'stars', dwarven: 'ancestors',
  steppe: 'sky', sinic: 'heaven', koreanic: 'heaven', japonic: 'kami', woodland: 'spirits', highland: 'sun', jungle: 'serpent',
};
const MISSIONARY: Record<string, FaithFamily> = {
  anglo: 'church', norse: 'church', slavic: 'church', latin: 'church', southern: 'church', celtic: 'church', desert: 'crescent', steppe: 'crescent', sinic: 'heaven', koreanic: 'heaven', japonic: 'heaven',
};
/** How likely a template's people are to found a missionary faith. */
const PROPHETIC: Record<string, number> = { latin: 2.2, southern: 2, desert: 2.4, anglo: 1.2, slavic: 1, celtic: 0.8, norse: 0.6, steppe: 0.8, sinic: 1.6, koreanic: 0.7, japonic: 0.6, elvish: 0.15, dwarven: 0.1 };
/** How readily a template's people take up a foreign faith. */
const OPEN: Record<string, number> = { elvish: 0.15, dwarven: 0.2, japonic: 0.6, steppe: 0.9 };

// ---- The world's faiths --------------------------------------------------------------------------

export interface Deity {
  name: string;
  domain: string;
}
export interface Sect {
  id: number;
  name: string;
  /** Birthplace (a city of the founding people). */
  originName: string;
  lon: number;
  lat: number;
  founded: number;
  culture: number;
  note: string;
}
export interface HolySite {
  name: string;
  lon: number;
  lat: number;
  what: string;
}
export interface Faith {
  id: number;
  family: FaithFamily;
  /** English name ("the Church of the Burning Star"). */
  name: string;
  /** The name in the faith's own tongue. */
  native: string;
  /** The tongue its holy words are in ("Proto-Varskic", "Varskish"). */
  tongue: string;
  lang: Language | null;
  kind: string;
  /** What the faithful call themselves. */
  adherents: string;
  /** Peoples who keep it now. */
  cultures: number[];
  /** Peoples who kept it once and were converted away (a few of them still do). */
  former: number[];
  /** A missionary faith, founded by a prophet; otherwise a people's native faith. */
  missionary: boolean;
  /** The language family whose native faith it is (or whose people founded it). */
  langFamily: number;
  /** The founder of a missionary faith. */
  prophet: string;
  deities: Deity[];
  head: { title: string; native: string; seatName: string; lon: number; lat: number };
  clergy: string;
  temple: string;
  scripture: string;
  scriptureNative: string;
  symbol: string;
  charge: Charge;
  /** Flavour teachings. */
  beliefs: string[];
  doctrines: Record<DoctrineGroup, string>;
  /** Keys into TENETS. */
  tenets: string[];
  holySites: HolySite[];
  sects: Sect[];
  founded: number;
  /** Hostility to other faiths, about 0 (none) to 2 (great). */
  zeal: number;
}

export interface FaithWorld {
  faiths: Faith[];
  /** Faith id for each culture index. */
  ofCulture: number[];
  /** Cultures converted from their own old faith: the year. */
  converted: Map<number, number>;
  /** The faith each converted culture kept before. */
  formerOf: Map<number, number>;
  /** Sect for a realm (by its culture and seat). */
  sectOf: (culture: number, lon: number, lat: number) => { faith: Faith; sect: Sect };
  /** A culture's faith in a given year (its old one before it converted). */
  faithAt: (culture: number, year: number) => Faith | undefined;
}

const distKm = (a: number, b: number, c: number, d: number) => {
  const dl = ((((c - a) % 360) + 540) % 360) - 180;
  return Math.hypot(dl * 111.32 * Math.cos((((b + d) / 2) * Math.PI) / 180), (d - b) * 110.57);
};

/** An English name said in a language: {P} and other proper names pass through unchanged. */
function say(L: Language | null, en: string, propers: Record<string, string> = {}): string {
  const plain = en.replace(/\{(\w)\}/g, (_, k: string) => propers[k] ?? '');
  if (!L) return plain;
  try {
    return nameCase(translate(L, en.replace(/\{(\w)\}/g, (_, k: string) => PROPER(propers[k] ?? ''))));
  } catch {
    return plain;
  }
}

const SECT_NOTES: [DoctrineGroup, string, string][] = [
  ['clergy', 'married', 'holds that priests may marry'], ['clergy', 'celibate', 'holds that priests must not marry'], ['clergy', 'open', 'lets women serve as priests'],
  ['head', 'none', 'rejects the authority of the head of the faith'], ['head', 'ruler', 'holds that the ruler is head of the faith in the realm'],
  ['others', 'pluralist', 'preaches peace with other faiths'], ['others', 'fundamentalist', 'calls for war on unbelievers and heretics'],
  ['conversion', 'closed', 'turned away from preaching to outsiders'], ['death', 'burning', 'burns its dead'], ['marriage', 'monogamy', 'allows but one spouse'],
];
const SECT_FLAVOUR = ['split over the nature of the prophet', 'keeps older rites in the old tongue', 'follows a mystic teacher', 'holds that the end of days is near', 'follows a reforming preacher', 'split over who should lead the faithful'];

/** The lore's present year for a seed (the same draws as `buildWorldLore`). */
export function loreYear(seed: string): number {
  const r = mulberry32(hashString(`${seed}#lore`));
  r();
  return 880 + Math.floor(r() * 560);
}

/** A faith's shape, before it has names: decided in world generation, where realms are made. */
export interface PlanFaith {
  key: string;
  family: FaithFamily;
  missionary: boolean;
  /** Language family (-1 for none). */
  langFamily: number;
  /** The people who founded it (for a native faith, its family's largest people). */
  founder: number;
  doctrines: Record<DoctrineGroup, string>;
  tenets: string[];
  zeal: number;
  founded: number;
}
export interface FaithPlan {
  year: number;
  faiths: PlanFaith[];
  /** Plan faith index for each culture now. */
  ofCulture: number[];
  converted: Map<number, number>;
  formerOf: Map<number, number>;
}

let planCache: { key: string; plan: FaithPlan } | null = null;

/**
 * Which faiths the world has and who keeps them: a native faith per language family, one to three
 * missionary faiths and their spread, each faith's doctrines and tenets. Depends only on the seed
 * and the world's cultures, so the world worker (for theocracies and their titles) and the lore
 * (for everything else) agree.
 */
export function faithPlan(seed: string): FaithPlan {
  const ckey = `${seed}|${CULTURES.length}|${CULTURES[0]?.name}|${CULTURES[CULTURES.length - 1]?.name}|${CULTURES[0]?.family}`;
  if (planCache?.key === ckey) return planCache.plan;
  const year = loreYear(seed);
  const rnd = mulberry32(hashString(`${seed}#faiths`));
  const faiths: PlanFaith[] = [];
  const ofCulture: number[] = CULTURES.map(() => -1);
  const converted = new Map<number, number>();
  const formerOf = new Map<number, number>();
  const cultures = CULTURES.map((c) => c.index);
  const famOf = (ci: number) => CULTURES[ci].family;

  const make = (fam: FaithFamily, founder: number, langFamily: number, missionary: boolean, key: string): number => {
    const def = A[fam];
    const r = mulberry32(hashString(`${seed}#faith#${key}#doctrine`));
    const doctrines = {} as Record<DoctrineGroup, string>;
    for (const g of GROUPS) {
      const bias = def.doctrines[g] ?? {};
      doctrines[g] = weighted(r, Object.keys(DOCTRINES[g]).map((o) => [o, (bias[o] ?? 0) + 0.15] as [string, number]));
    }
    if (missionary && doctrines.conversion === 'closed') doctrines.conversion = r() < 0.75 ? 'missionary' : 'sword';
    if (!missionary && doctrines.conversion === 'missionary') doctrines.conversion = 'closed';
    const tenets: string[] = [];
    for (let t = 0; t < 30 && tenets.length < 3; t++) {
      const k = weighted(r, Object.keys(TENETS).map((x) => [x, def.tenets.includes(x) ? 5 : 0.35] as [string, number]));
      if (k === 'kingship' && doctrines.head === 'none') continue;
      if (tenets.includes(k) || tenets.some((x) => CLASH.some(([a, b]) => (a === x && b === k) || (b === x && a === k)))) continue;
      tenets.push(k);
    }
    const zeal = Math.max(0, ({ pluralist: 0.25, righteous: 1, fundamentalist: 1.6 } as Record<string, number>)[doctrines.others] + (doctrines.conversion === 'sword' ? 0.3 : 0) + tenets.reduce((s, t) => s + (TENETS[t].zeal ?? 0), 0));
    const age = def.age[0] + Math.floor(r() * (def.age[1] - def.age[0]));
    faiths.push({ key, family: fam, missionary, langFamily, founder, doctrines, tenets, zeal, founded: missionary ? year - (450 + Math.floor(r() * 650)) : Math.max(-3000, year - age) });
    return faiths.length - 1;
  };

  // Native faiths: one per language family (one per culture without a family).
  const nativeOfFamily = new Map<number, number>();
  for (const ci of cultures) {
    const lf = famOf(ci);
    if (lf < 0) {
      ofCulture[ci] = make(NATIVE[CULTURES[ci].id] ?? 'spirits', ci, -1, false, `native#c${ci}`);
      continue;
    }
    if (!nativeOfFamily.has(lf)) {
      const head = LANG_FAMILIES[lf]?.members[0] ?? ci;
      nativeOfFamily.set(lf, make(NATIVE[CULTURES[head].id] ?? 'spirits', head, lf, false, `native#${lf}`));
    }
    ofCulture[ci] = nativeOfFamily.get(lf)!;
  }
  // Missionary faiths, born among Old World peoples well apart from each other.
  const oldWorld = cultures.filter((ci) => !CULTURES[ci].nw);
  const nMiss = oldWorld.length < 3 ? (oldWorld.length ? 1 : 0) : Math.max(1, Math.min(3, Math.round(oldWorld.length / 6)));
  const founders: number[] = [];
  for (let t = 0; t < 40 && founders.length < nMiss; t++) {
    const ci = weighted(rnd, oldWorld.map((k) => [k, (PROPHETIC[CULTURES[k].id] ?? 0.5) * Math.sqrt(1 + (CULTURES[k].env?.areaKm2 ?? 1e6) / 1e6)] as [number, number]));
    if (founders.includes(ci)) continue;
    if (founders.some((f) => distKm(CULTURES[f].hearth[0], CULTURES[f].hearth[1], CULTURES[ci].hearth[0], CULTURES[ci].hearth[1]) < 1800) && t < 30) continue;
    founders.push(ci);
  }
  const missions = founders.map((ci) => make(MISSIONARY[CULTURES[ci].id] ?? NATIVE[CULTURES[ci].id] ?? 'church', ci, famOf(ci), true, `mission#${ci}`));
  // Spread: each Old World people may take up the nearest missionary faith that reaches it.
  for (const ci of oldWorld) {
    const cul = CULTURES[ci];
    const r = mulberry32(hashString(`${seed}#convert#${ci}`));
    const near = missions.map((m, k) => ({ m, k, d: distKm(CULTURES[founders[k]].hearth[0], CULTURES[founders[k]].hearth[1], cul.hearth[0], cul.hearth[1]) })).sort((a, b) => a.d - b.d);
    for (const { m, k, d } of near) {
      const mf = faiths[m];
      const founder = founders[k] === ci;
      const spread = 1 + mf.tenets.reduce((s, t) => s + (TENETS[t].spread ?? 0), 0) + (mf.doctrines.conversion === 'sword' ? 0.15 : 0);
      const p = founder ? 1 : Math.min(0.92, 0.9 * Math.exp(-d / (2600 * spread)) * (OPEN[cul.id] ?? 1) * (famOf(ci) === mf.langFamily ? 1.25 : 1));
      if (r() >= p) continue;
      const old = ofCulture[ci];
      if (old !== m) {
        formerOf.set(ci, old);
        const span = Math.max(20, year - mf.founded - 30);
        converted.set(ci, founder ? mf.founded + 10 + Math.floor(r() * 40) : Math.min(year - 15, Math.round(mf.founded + 40 + span * Math.min(0.9, d / 4500 + r() * 0.35))));
        ofCulture[ci] = m;
      }
      break;
    }
  }
  const plan = { year, faiths, ofCulture, converted, formerOf };
  planCache = { key: ckey, plan };
  return plan;
}

/** The archetype of the faith a culture keeps now (for realm styles in world generation). */
export function faithOfCulture(seed: string, ci: number): PlanFaith | undefined {
  const p = faithPlan(seed);
  return p.faiths[p.ofCulture[ci]];
}
export { A as ARCHETYPES };

export function buildFaiths(seed: string, year: number, bank: NameBank, units: PolUnit[], _present: Set<number>, features: LabelFeature[] = []): FaithWorld {
  const plan = faithPlan(seed);
  const faiths: Faith[] = [];
  const ofCulture = [...plan.ofCulture];
  const converted = plan.converted;
  const formerOf = plan.formerOf;
  // Cultures' cities, from the realm seats of each culture (largest first).
  const seatsOf = new Map<number, { name: string; lon: number; lat: number; pop: number }[]>();
  for (const u of units) {
    if (u.level !== 0) continue;
    (seatsOf.get(u.culture) ?? seatsOf.set(u.culture, []).get(u.culture)!).push({ name: u.seatName, lon: u.lon, lat: u.lat, pop: u.pop });
  }
  for (const v of seatsOf.values()) v.sort((a, b) => b.pop - a.pop);
  const cultures = CULTURES.map((c) => c.index);
  const homeOf = (ci: number) => seatsOf.get(ci)?.[0] ?? { name: '', lon: CULTURES[ci].hearth[0], lat: CULTURES[ci].hearth[1], pop: 0 };
  const usedNames = new Set<string>();

  /** A faith of the plan given names: in its family's proto-language (native) or its founders' tongue. */
  const makeFaith = (pf: PlanFaith): Faith => {
    const fam = pf.family, missionary = pf.missionary;
    const lfam = LANG_FAMILIES[pf.langFamily];
    const L: Language | null = missionary ? CULTURES[pf.founder].language : lfam?.proto ?? CULTURES[pf.founder].language;
    const tongue = missionary ? CULTURES[pf.founder].name : lfam?.protoName ?? '';
    const def = A[fam];
    const r = mulberry32(hashString(`${seed}#faith#${pf.key}`));
    const cul = CULTURES[pf.founder];
    const name1 = (female: boolean, fresh = false) => cap(L ? L.givenName(r, female, fresh) : bank.proper(cul, r));
    const prophet = name1(r() < 0.15, true);
    const props = { P: prophet, L: pick(r, LIGHT), H: cap(cul.endonym) };
    // The English name, made unique where two faiths would share one.
    let en = '';
    for (let t = 0; t < 6; t++) {
      en = pick(r, def.names).replace('{L}', props.L);
      if (!missionary) en = en.replace('{P}', '{H}');
      if (!usedNames.has(en.replace('{P}', prophet).replace('{H}', props.H))) break;
    }
    const native = say(L, en, props);
    en = en.replace('{P}', prophet).replace('{H}', props.H);
    if (usedNames.has(en)) en = `${en} of the ${cul.name}`;
    usedNames.add(en);
    const sym = pick(r, def.symbols);
    const nGods = Math.min(def.domains.length, def.gods[0] + Math.floor(r() * (def.gods[1] - def.gods[0] + 1)));
    const deities: Deity[] = [];
    const godNames = new Set<string>();
    for (let k = 0; k < nGods; k++) {
      const dom = def.domains[k];
      const female = /goddess|queen|mother|lady|grandmother|priestess|sister/i.test(dom.split(',')[0]);
      let n = name1(female, true);
      for (let t = 0; t < 4 && godNames.has(n); t++) n = name1(female, true);
      godNames.add(n);
      if (fam === 'church' && k === 0) n = say(L, r() < 0.5 ? 'the One' : 'the Most High');
      else if (fam === 'crescent' && k === 0) n = say(L, 'the Merciful');
      else if ((fam === 'church' || fam === 'crescent') && k === 1) n = prophet;
      else if (fam === 'church' && k >= 2) n = `Saint ${n}`;
      else if (fam === 'spirits' && k > 0) n = say(L, cap(dom.replace(/^the /, '')));
      deities.push({ name: n, domain: dom });
    }
    const beliefs = [...def.beliefs].sort(() => r() - 0.5).slice(0, 3);
    const scrEn = pick(r, def.scripture);
    const headTitle = pick(r, def.head);
    return {
      id: faiths.length, family: fam, name: en, native, tongue, lang: L, kind: def.kind, adherents: pick(r, def.adherents), cultures: [], former: [], missionary, langFamily: pf.langFamily, prophet,
      deities, head: { title: headTitle, native: say(L, headTitle), seatName: '', lon: 0, lat: 0 }, clergy: pick(r, def.clergy), temple: pick(r, def.temple),
      scripture: scrEn.replace('{P}', prophet), scriptureNative: say(L, scrEn, props), symbol: sym[0], charge: sym[1], beliefs, doctrines: pf.doctrines, tenets: pf.tenets, holySites: [], sects: [],
      founded: pf.founded, zeal: pf.zeal,
    };
  };
  for (const pf of plan.faiths) faiths.push(makeFaith(pf));
  for (const [ci, old] of formerOf) faiths[old].former.push(ci);
  for (const ci of cultures) faiths[ofCulture[ci]].cultures.push(ci);

  // ---- Sects -----------------------------------------------------------------------------------
  for (const f of faiths) {
    const def = A[f.family];
    const pf = plan.faiths[f.id];
    const founder = f.missionary ? pf.founder : f.cultures.includes(pf.founder) ? pf.founder : f.cultures[0] ?? f.former[0];
    const order = founder !== undefined ? [founder, ...f.cultures.filter((c) => c !== founder)] : f.cultures;
    order.forEach((ci, i) => {
      const sr = mulberry32(hashString(`${seed}#sect#${f.id}#${ci}`));
      const seats = seatsOf.get(ci) ?? [];
      const origin = seats[Math.min(seats.length - 1, Math.floor(sr() * Math.min(4, seats.length)))] ?? homeOf(ci);
      if (i === 0) {
        f.sects.push({ id: 0, name: f.name, originName: origin.name, lon: origin.lon, lat: origin.lat, founded: f.founded, culture: ci, note: 'the mother faith' });
        return;
      }
      // A native faith splits as its peoples' tongues did; a missionary faith takes root in its own way here and there.
      if (f.missionary ? sr() > 0.45 : sr() > 0.8) return;
      const diff = SECT_NOTES.filter(([g, v]) => f.doctrines[g] !== v);
      const note = sr() < 0.7 && diff.length ? pick(sr, diff)[2] : pick(sr, SECT_FLAVOUR);
      const name = f.missionary ? pick(sr, def.sect).replace('{N}', bank.proper(CULTURES[ci], sr)) : `the ${CULTURES[ci].name} Rite`;
      const founded = Math.round(f.founded + (year - f.founded) * (0.35 + 0.55 * sr()));
      f.sects.push({ id: f.sects.length, name: name === f.name || f.sects.some((x) => x.name === name) ? `${name} of the ${CULTURES[ci].name}` : name, originName: origin.name, lon: origin.lon, lat: origin.lat, founded: Math.min(year - 5, Math.max((converted.get(ci) ?? -Infinity) + 15 + Math.floor(sr() * 80), founded)), culture: ci, note });
    });
    // Holdouts: a native faith all of whose peoples converted lives on among the hill folk of its homeland.
    if (!f.sects.length && f.former.length) {
      const h = homeOf(f.former[0]);
      f.sects.push({ id: 0, name: f.name, originName: h.name, lon: h.lon, lat: h.lat, founded: f.founded, culture: f.former[0], note: 'the old faith, kept in remote places' });
    }
  }

  // ---- Heads and holy places -------------------------------------------------------------------
  for (const f of faiths) {
    const holders = f.cultures.length ? f.cultures : f.former;
    const theo = units.filter((u) => u.gov === 'theocracy' && u.parent < 0 && holders.includes(u.culture)).sort((a, b) => b.people - a.people)[0];
    const origin = f.sects[0];
    if (theo) f.head = { ...f.head, seatName: theo.seatName, lon: theo.lon, lat: theo.lat };
    else if (origin) f.head = { ...f.head, seatName: origin.originName, lon: origin.lon, lat: origin.lat };
    const r = mulberry32(hashString(`${seed}#holy#${f.id}`));
    const sites: HolySite[] = [];
    const add = (s: HolySite) => {
      if (s.name && !sites.some((h) => h.name === s.name)) sites.push(s);
    };
    if (f.head.seatName && f.doctrines.head !== 'none') add({ name: f.head.seatName, lon: f.head.lon, lat: f.head.lat, what: `seat of the ${f.head.title}` });
    for (const s of f.sects) add({ name: s.originName, lon: s.lon, lat: s.lat, what: s.id === 0 ? (f.missionary ? `where ${f.prophet} first preached` : 'where the faith was born') : `birthplace of ${s.name}` });
    // The land's own holy places near the faith's home: a peak, a lake, a grove, an isle.
    const home = origin ?? { lon: 0, lat: 0 };
    const kinds = A[f.family].places;
    const near = features
      .filter((x) => kinds.includes(x.properties.kind) && x.properties.name)
      .map((x) => {
        const c = x.geometry.type === 'Point' ? x.geometry.coordinates : x.geometry.coordinates[Math.floor(x.geometry.coordinates.length / 2)];
        return { x, lon: c[0], lat: c[1], d: distKm(home.lon, home.lat, c[0], c[1]) };
      })
      .filter((x) => x.d < 1400)
      .sort((a, b) => a.d - b.d + (a.x.properties.rank - b.x.properties.rank) * 200);
    const WHAT: Record<string, string[]> = {
      peak: ['the holy mountain, where the gods dwell', 'a holy mountain, climbed by pilgrims', 'the mountain where the first priest spoke with the gods'],
      mountains: ['the holy mountains', 'mountains where the gods were born'],
      lake: ['a sacred lake, where offerings are sunk', 'the lake from which the world was made', 'a holy lake of healing'],
      forest: ['the sacred grove', 'a holy forest, where no tree may be cut', 'the forest where the gods walk'],
      island: ['the holy isle, where the honoured dead are laid', 'an island of hermits and monks', 'the isle of the dead'],
    };
    const mono = f.family === 'church' || f.family === 'crescent';
    if (mono) {
      WHAT.peak = ['the mountain where the prophet fasted', 'a mountain of hermits', 'where the prophet received the word'];
      WHAT.lake = ['a lake of healing, blessed by a saint'];
      WHAT.forest = ['a forest of hermits'];
    }
    let natural = 0;
    for (const n of near.slice(0, 6)) {
      if (sites.length >= 6 || natural >= 2 || r() < 0.45) continue;
      const k = n.x.properties.kind;
      const opts = (WHAT[k] ?? WHAT.peak).filter((w) => !sites.some((h) => h.what === w));
      if (!opts.length) continue;
      add({ name: cap(n.x.properties.name.replace(/\s*\(\d+ m\)$/, '')), lon: n.lon, lat: n.lat, what: pick(r, opts) });
      natural++;
    }
    const pool = holders.flatMap((c) => seatsOf.get(c)?.slice(0, 12) ?? []);
    const CITY = ['tomb of a great saint', 'shrine of a holy relic', 'site of a miracle', 'the great pilgrim temple', 'a holy spring', 'the oldest monastery', 'where the prophet preached'];
    for (let t = 0; t < 8 && sites.length < 5 && pool.length; t++) {
      const s = pick(r, pool);
      const opts = (f.missionary ? CITY : CITY.filter((x) => !x.includes('prophet') && !x.includes('saint'))).filter((w) => !sites.some((h) => h.what === w));
      if (opts.length) add({ name: s.name, lon: s.lon, lat: s.lat, what: pick(r, opts) });
    }
    f.holySites = sites;
  }

  const sectOf = (culture: number, lon: number, lat: number) => {
    const f = faiths[ofCulture[culture]] ?? faiths[0];
    // Prefer the sects of the realm's own people, then the nearest.
    const own = f.sects.filter((s) => s.culture === culture);
    const pool = own.length ? own : f.sects;
    let best = pool[0], bd = Infinity;
    for (const s of pool) {
      const d = distKm(lon, lat, s.lon, s.lat);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return { faith: f, sect: best };
  };
  const faithAt = (culture: number, y: number) => {
    const conv = converted.get(culture);
    const old = formerOf.get(culture);
    return faiths[conv !== undefined && old !== undefined && y < conv ? old : ofCulture[culture]];
  };
  return { faiths, ofCulture, converted, formerOf, sectOf, faithAt };
}

/** How a realm of this faith treats other faiths. */
export function toleranceOf(f: Faith, r: Rng): string {
  const o = f.doctrines.others;
  if (o === 'pluralist') return pick(r, ['tolerant of other faiths', 'lax in matters of faith', 'tolerant of other faiths']);
  if (o === 'righteous') return pick(r, ['wary of other faiths', 'willing to shelter other faiths for a tax', 'devout and strict']);
  return pick(r, ['harsh toward heretics', 'bent on stamping out other faiths', 'devout and strict']);
}

/** Two faiths' hostility to one another (0 none, about 2 great), for wars and relations. */
export function enmity(a: Faith | undefined, b: Faith | undefined): number {
  if (!a || !b || a.id === b.id) return 0;
  return Math.max(a.zeal, b.zeal) * (a.family === b.family ? 0.7 : 1);
}

/** Text about "the gods", said rightly for a faith with one god. */
export function godly(f: Faith, text: string): string {
  if (f.family !== 'church' && f.family !== 'crescent') return text;
  return text.replace(/the gods\u2019/g, 'God\u2019s').replace(/the gods/g, 'God').replace(/The gods/g, 'God');
}
