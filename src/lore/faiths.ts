import { table } from '../names/bundles';
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
    kind: 'monotheist church',
    names: [
      'the Church of the {L}',
      'the Faith of the {L}',
      'the {L} Church',
      'the Church of {P}',
      'the Holy See of {H}',
      'the Universal Church of the Covenant',
      'the Faith of the Sacred Heart',
      'the Assembly of the High Light'
    ],
    adherents: [
      'the Faithful',
      'the Brethren',
      'the Flock of the Lord',
      'the Children of the Covenant',
      'the Servants of the Cross',
      'the Penitents'
    ],
    head: [
      'Pontiff',
      'Patriarch',
      'Hierophant',
      'Exarch',
      'High Inquisitor',
      'Primate of the Holy Realm'
    ],
    clergy: [
      'priests',
      'bishops and priests',
      'friars and priests',
      'abbots and monastic brothers',
      'canonesses and holy sisters',
      'inquisitors and confessors'
    ],
    temple: [
      'cathedrals and chapels',
      'basilicas and churches',
      'vaulted stone cathedrals with stained glass',
      'fortified abbeys and secluded monasteries',
      'wayside shrines and royal crypt-chapels'
    ],
    scripture: [
      'the Book of {P}',
      'the Testament of {P}',
      'the Holy Canon',
      'the Gospels of {P}',
      'the Book of Martyrs and Saints',
      'the High Liturgy of the Sacred Word'
    ],
    symbols: [
      ['a radiant sun', 'sun'],
      ['a cross', 'cross'],
      ['a wheel', 'wheel'],
      ['a key', 'key'],
      ['a lamb', 'cross'],
      ['a dove', 'bird'],
      //['a chalice dripping blood', 'ring'],
      ['a crown of thorns', 'roundel'],
      ['a burning sword', 'sword'],
      ['a reliquary box', 'tower']
    ],
    domains: [
      'the One God, creator of all',
      'prophet and martyr',
      'the first apostle',
      'patron saint of sailors',
      'patron saint of soldiers',
      'patron saint of healers',
      'patron saint of the poor',
      'patron saint of scholars',
      'patron saint of lost causes',
      'the archangel of judgment and wrath',
      'the mother of the prophet',
      'patron saint of stone-masons and builders'
    ],
    gods: [4, 6],
    age: [500, 1100],
    beliefs: [
      'One god, revealed through a prophet',
      'Confession and penance',
      'Saints intercede for the living',
      'Tithes are owed to the church',
      'The prophet will return at the end of days',
      'Sacred relics of martyrs hold divine power to heal and protect',
      'Heresy is a plague upon the soul that must be cleansed with fire and prayer',
      'The realm of the living is a trial before the final judgment of the righteous'
    ],
    sect: [
      'the Reformed Church',
      'the Old Rite',
      'the Eastern Rite',
      'the {N} Confession',
      'the Church of {N}',
      'the Free Church',
      'the {N} Rite',
      'the Order of the Sacred Flame',
      'the Inquisitorial Chapter of {N}'
    ],
    doctrines: { 
      head: { pontiff: 6, none: 1 }, 
      clergy: { celibate: 3, married: 1 }, 
      conversion: { missionary: 5, sword: 1 }, 
      others: { righteous: 3, fundamentalist: 1, pluralist: 1 }, 
      death: { burial: 6 }, 
      marriage: { monogamy: 6 } 
    },
    tenets: ['pilgrimage', 'charity', 'monasticism', 'holyWar', 'endTimes', 'mendicants', 'asceticism', 'communion', 'ecclesiarchy', 'filialPiety'], 
    places: ['island', 'peak'],
  },
  crescent: {
    kind: 'faith of the prophets',
    names: [
      'the Faith of the Prophet',
      'the Way of {P}',
      'the Submission',
      'the Path of the Merciful',
      'the Covenant of the Light',
      'the House of True Peace',
      'the Law of the Revealed Book',
      'the Community of the Faithful'
    ],
    adherents: [
      'the Believers',
      'the Submitters',
      'the People of the Book',
      'the Walkers of the Straight Path',
      'the Servants of the One',
      'the Flock of the Prophet'
    ],
    head: [
      'Caliph',
      'Grand Imam',
      'Supreme Mufti',
      'Custodian of the Holy Places',
      'First Scholar of the Realm',
      'Commander of the Faithful'
    ],
    clergy: [
      'imams and scholars',
      'imams and judges',
      'mullahs and jurists',
      'calligraphers and scripture-reciters',
      'sufi masters and ascetics'
    ],
    temple: [
      'mosques and schools',
      'great mosques',
      'domed sanctuaries with soaring minarets',
      'courtyard madrasas and shrine-complexes',
      'desert caravanserais and pilgrimage halls'
    ],
    scripture: [
      'the Recitation',
      'the Book of {P}',
      'the Revealed Word',
      'the Traditions of the Righteous',
      'the Heavenly Decrees',
      'the Book of Wisdom and Law'
    ],
    symbols: [
      ['a crescent', 'crescent'],
      ['a star', 'mullet'],
      ['a lamp', 'estoile'],
      ['a open book', 'cross'],
      ['a geometric star-tile', 'roundel'],
      ['a minaret spire', 'tower'],
      ['a palm bough', 'tree'],
      //['a water vessel', 'ring'],
      ['a scimitar', 'sword'],
      ['a calligraphic seal', 'sun']
    ],
    domains: [
      'the one God, compassionate and just',
      'the last prophet',
      'the first caliph',
      'the martyred imam',
      'the hidden imam',
      'the archangel of revelation',
      'the patron of scholars and jurists',
      'the guardian of travelers and pilgrims',
      'the judge of the last day',
      'the spirit of mercy and charity'
    ],
    gods: [3, 5],
    age: [400, 900],
    beliefs: [
      'One god and his last prophet',
      'Prayer five times a day',
      'A fast in the holy month',
      'The prophet’s sayings guide daily life',
      'Alms given to the poor purify wealth and soul',
      'Every believer should make the great pilgrimage at least once',
      'Graven images of living things are forbidden in places of worship',
      'Truth is revealed through scripture and reason, not magic or sorcery'
    ],
    sect: [
      'the Followers of the Imams',
      'the People of the Tradition',
      'the {N} School',
      'the Seceders',
      'the Mystic Brotherhood of {N}',
      'the Order of the Whirling Dervishes',
      'the College of Jurists at {N}'
    ],
    doctrines: { 
      head: { pontiff: 3, none: 2 }, 
      clergy: { married: 5 }, 
      conversion: { missionary: 3, sword: 2 }, 
      others: { righteous: 3, pluralist: 1.5, fundamentalist: 0.7 }, 
      death: { burial: 6 }, 
      marriage: { polygamy: 3, concubines: 1 } 
    },
    tenets: ['pilgrimage', 'charity', 'sacredLaw', 'aniconism', 'holyWar', 'purity', 'communion', 'ecclesiarchy', 'filialPiety', 'sacredLearning'], 
    places: ['peak'],
  },
  pantheon: {
    kind: 'pantheon of gods',
    names: [
      'the Gods of {H}',
      'the Twelve',
      'the Old Rites',
      'the Mysteries of {P}',
      'the Gods of the Mountain',
      'the Sacred Pantheon of the High Peak',
      'the Order of the Golden Laurel',
      'the Rites of the Sacred Spring'
    ],
    adherents: [
      'the Pious',
      'the Children of the City',
      'the Servants of the Olympus',
      'the Keepers of the Sacred Flame',
      'the Sworn of the Sanctuaries',
      'the Seekers of the Oracle'
    ],
    head: [
      'High Priest',
      'Archpriestess',
      'Oracle',
      'Hierophant of the Mysteries',
      'High Keeper of the Sacred Flame',
      'Grand Sacrificer of the Realm'
    ],
    clergy: [
      'priests and oracles',
      'priestesses',
      'hierophants and temple singers',
      'oracle maidens and sacrificial priests',
      'philosopher-priests and custodians of the sacred grounds'
    ],
    temple: [
      'temples and sanctuaries',
      'temples with colonnades',
      'marble shrines atop high acropolises',
      'oracular caverns and sacred springs',
      'open-air altars and hero-graves'
    ],
    scripture: [
      'the Sacred Hymns',
      'the Birth of the Gods',
      'the Oracles',
      'the Epics of the Heroic Age',
      'the Secret Tablets of the Mysteries'
    ],
    symbols: [
      ['an owl', 'bird'],
      ['a thunderbolt', 'estoile'],
      ['a trident', 'anchor'],
      ['a laurel', 'tree'],
      ['a lyre', 'roundel'],
      //['a golden cup', 'ring'],
      ['a serpent staff', 'sword'],
      ['a horned bull', 'horn'],
      ['a crescent moon', 'crescent'],
      ['a pomegranate', 'blossom']
    ],
    domains: [
      'king of the gods and the sky',
      'queen of the gods and marriage',
      'god of the sea',
      'goddess of wisdom and war',
      'god of the sun and music',
      'goddess of the hunt and the moon',
      'god of the forge',
      'goddess of the harvest',
      'god of wine and revels',
      'god of the dead',
      'god of travelers, thieves, and merchants',
      'goddess of love and beauty',
      'god of bloodshed and savage war',
      'goddess of the hearth and civic fire'
    ],
    gods: [6, 9],
    age: [1200, 2000],
    beliefs: [
      'Many gods, each with a temple and a feast',
      'Oracles speak the gods’ will',
      'The dead cross a river to the underworld',
      'Hubris against the gods brings swift and inescapable nemesis',
      'Guests and strangers are protected under the sacred law of hospitality',
      'Libations of wine and the aroma of burnt fat appease the immortals',
      'Great mortals may be elevated to heroes in death through glorious deeds',
      'Fate is spun by three sisters beyond the power of even the gods to alter'
    ],
    sect: [
      'the Mysteries of {N}',
      'the {N} Cult',
      'the Philosophers of {N}',
      'the Oracular Sisterhood',
      'the Brotherhood of the Trident',
      'the Cult of the Vine',
      'the Keepers of the Eternal Flame'
    ],
    doctrines: { 
      head: { none: 3, pontiff: 1 }, 
      clergy: { open: 3, priestesses: 1, hereditary: 1 }, 
      conversion: { closed: 3, missionary: 0.5 }, 
      others: { pluralist: 4, righteous: 0.6 }, 
      death: { burning: 2, burial: 2 }, 
      marriage: { monogamy: 2, concubines: 2 } 
    },
    tenets: ['ritualSacrifice', 'divination', 'feastDays', 'hospitality', 'astrology', 'carnalism', 'ecclesiarchy', 'hedonism'], 
    places: ['peak', 'island'],
  },
  oldgods: {
    kind: 'the old gods',
    names: [
      'the Old Gods',
      'the Old Custom',
      'the Faith of the High One',
      'the Gods of the Hall',
      'the Way of the Nine Worlds',
      'the Law of Blood and Iron',
      'the Path of the Raven Banner',
      'the Circle of the Sacred Tree'
    ],
    adherents: [
      'the Heathen',
      'the Sworn',
      'the Shield-Kin',
      'the People of the Hall',
      'the Oath-Bound',
      'the Riders of the Wild Hunt'
    ],
    head: [
      'High Priest',
      'High Seeress',
      'Keeper of the Sacred Ring',
      'Godi of the Great Hall',
      'Master of the Runes',
      'First Speaker of the Thing'
    ],
    clergy: [
      'priests and seeresses',
      'priests of the hall',
      'godar and völvas',
      'rune-masters and skalds',
      'blood-drawers and berserker-priests'
    ],
    temple: [
      'halls of the gods and sacred groves',
      'temples and stone circles',
      'timber hof shrines with carved pillars',
      'blood-stained groves near sacred wells',
      'coastal ship-setting stone monuments'
    ],
    scripture: [
      'the Sayings of the High One',
      'the Old Songs',
      'the Lay of the World-Tree',
      'the Runic Staves of the Ancients',
      'the Visions of the Seeress'
    ],
    symbols: [
      ['a hammer', 'hammer'],
      ['a raven', 'bird'],
      ['an axe', 'axe'],
      ['a serpent', 'serpent'],
      //['a wolf head', 'skull'],
      ['a horned helmet', 'horn'],
      //['a knot-ring', 'ring'],
      ['a longship', 'cross'],
      ['a Valknut of three triangles', 'roundel'],
      ['a spear bound with runes', 'sword']
    ],
    domains: [
      'the All-father, god of wisdom and the slain',
      'god of thunder',
      'goddess of love and battle',
      'god of the harvest',
      'the trickster',
      'goddess of the dead',
      'god of the sea',
      'god of the hunt',
      'the guardian of the rainbow bridge',
      'god of oaths and single combat',
      'goddess of the hearth and winter night'
    ],
    gods: [5, 8],
    age: [1500, 2500],
    beliefs: [
      'Oaths are sacred',
      'Seers read the runes',
      'The world will end in fire and ice',
      'A warrior who dies sword in hand goes to the High Hall',
      'Blood painted upon the temple posts binds the blessing of the gods',
      'To die of old age or sickness in bed is a death of shame',
      'Nine sacrifices hung from the sacred ash-tree appease the All-father',
      'Fate is woven by three maidens at the roots of the world and cannot be escaped'
    ],
    sect: [
      'the Cult of {N}',
      'the Old Way',
      'the Raven Brotherhood',
      'the Order of the Iron Spear',
      'the Wolf-Skins of {N}',
      'the Keepers of the Rune-Ring',
      'the Seeresses of the High Seat'
    ],
    doctrines: { 
      head: { none: 3, ruler: 1 }, 
      clergy: { hereditary: 2, open: 2 }, 
      conversion: { closed: 2, sword: 1 }, 
      others: { pluralist: 2, righteous: 1 }, 
      death: { burning: 3, barrows: 3, sea: 1 }, 
      marriage: { concubines: 2, monogamy: 1, polygamy: 1 } 
    },
    tenets: ['warriorCult', 'ritualSacrifice', 'divination', 'feastDays', 'sacredGroves', 'carnalism', 'adorcism', 'witchcraft', 'suicide'], 
    places: ['forest', 'peak', 'island'],
  },
  druid: {
    kind: 'druidic nature faith',
    names: [
      'the Old Faith',
      'the Way of the Grove',
      'the Oak and the Stone',
      'the Mysteries of {P}',
      'the Circle of the Sacred Mistletoe',
      'the Lore of the Standing Stones',
      'the Blood of the Heart-Oak',
      'the Law of the Green Veil'
    ],
    adherents: [
      'the Children of the Oak',
      'the Keepers of the Grove',
      'the Folk of the Standing Stones',
      'the Servants of the Horned One',
      'the Walkers of the Mist',
      'the Kin of the Sacred Forest'
    ],
    head: [
      'Archdruid',
      'First Voice of the Grove',
      'Grand Seer of the Oak',
      'High Keeper of the Sacred Fire',
      'Master of the Stone Circle'
    ],
    clergy: [
      'druids, bards and seers',
      'grove-keepers and mistletoe-cutters',
      'tree-singers and augurs',
      'sacrifice-masters and herbalists',
      'bards and keepers of the cauldron'
    ],
    temple: [
      'sacred groves and stone circles',
      'ancient oak groves and island shrines',
      'megalithic stone rings on high tors',
      'peat bog altars and sacred springs',
      'cauldron-halls carved into hillside barrows'
    ],
    scripture: [
      'the unwritten lore of the druids',
      'the Songs of the Grove',
      'the Ogham runes carved in yew',
      'the Canticles of the Four Feasts',
      'the Whispers of the Old Oaks'
    ],
    symbols: [
      ['an oak', 'tree'],
      ['an acorn', 'acorn'],
      ['a crescent moon', 'crescent'],
      ['a stag', 'horn'],
      ['a triskele spiral', 'roundel'],
      ['a golden sickle', 'sword'],
      //['a cauldron', 'ring'],
      //['a raven on a skull', 'skull'],
      ['a mistletoe branch', 'tree'],
      ['a salmon of wisdom', 'bird']
    ],
    domains: [
      'the Mother, goddess of the land',
      'the Horned One, lord of beasts',
      'god of the sun and craft',
      'goddess of rivers and wells',
      'the queen of battle and fate',
      'god of the sea',
      'the lord of the underworld and the dead',
      'the keeper of the magic cauldron',
      'god of the wild hunt',
      'goddess of the hearth and spring'
    ],
    gods: [4, 6],
    age: [1500, 2500],
    beliefs: [
      'Druids alone may judge',
      'Feasts at the turning of the year',
      'Heads of foes are kept as trophies',
      'The soul does not perish, but passes at death into another body',
      'Sacrifices drowned in bogs or hanged in groves appease the land',
      'Mist and oak moss hold the original magic of the earth',
      'Swearing an oath by the three elements—wind, fire, and water—binds until death',
      'To cut a sacred oak without blood offering brings a blight upon the tribe'
    ],
    sect: [
      'the {N} Brotherhood',
      'the Grove of {N}',
      'the Circle of the Wicker',
      'the Order of the Golden Sickle',
      'the Priesthood of the Horned Lord',
      'the Keepers of the Peat Altar'
    ],
    doctrines: { 
      head: { pontiff: 2, none: 1 }, 
      clergy: { open: 2, hereditary: 1 }, 
      conversion: { closed: 3 }, 
      others: { pluralist: 2, righteous: 0.5 }, 
      death: { barrows: 2, burning: 1 }, 
      marriage: { monogamy: 1, concubines: 1 } 
    },
    tenets: ['sacredGroves', 'rebirth', 'sacredWaters', 'divination', 'nature', 'witchcraft'], 
    places: ['forest', 'lake', 'island'],
  },
  stars: {
    kind: 'worship of the stars',
    names: [
      'the Song of the Stars',
      'the Starlit Way',
      'the Light of {P}',
      'the Eternal Choir of the Heavens',
      'the Path of the Silver Needle',
      'the Order of the Evening Star',
      'the Weavers of Starlight',
      'the Sanctum of the High Canopy'
    ],
    adherents: [
      'the Starborn',
      'the Children of First Light',
      'the Singers of the Canopy',
      'the Keepers of the Silver Glade',
      'the Moon-Bound',
      'the Kin of the Starlit Waters'
    ],
    head: [
      'High Priestess',
      'Keeper of the Stars',
      'First Voice of the Heavenly Song',
      'Lady of the Silver Canopy',
      'Grand Astronomer of the West',
      'Oracle of the Moonlit Pool'
    ],
    clergy: [
      'star-singers',
      'priestesses of the moon',
      'glade-keepers and starlight weavers',
      'canopy astrologers and silver bards',
      'dream-readers and keepers of the sacred grove'
    ],
    temple: [
      'open-roofed star temples',
      'moonlit shrines',
      'silver-spired marble bowers',
      'ancient living groves surrounded by starlit pools',
      'high mountain observatories of white stone'
    ],
    scripture: [
      'the Lay of {P}',
      'the Song of First Light',
      'the Scrolls of the Evening Canopy',
      'the Chronicle of the West-Sailing Ships',
      'the High Canticles of the Silver Moon'
    ],
    symbols: [
      ['a star', 'estoile'],
      ['a crescent moon', 'crescent'],
      ['a tree', 'tree'],
      ['a silver harp', 'roundel'],
      ['a swan in flight', 'bird'],
      ['a silver leaf', 'tree'],
      //['a pool reflecting eight stars', 'moon'],
      ['a crystal vial of starlight', 'cross'],
      //['a woven vine ring', 'ring'],
      ['a silver bow and arrow', 'sword']
    ],
    domains: [
      'the Lady of the Stars, who sang the world',
      'lord of the moon',
      'lady of the evening star',
      'keeper of the forest',
      'lord of the sea and the far west',
      'lady of dreams',
      'patron of memory and ancient lore',
      'lord of wind and autumn leaves',
      'weaver of fate and starlight',
      'guardian of sacred springs'
    ],
    gods: [4, 6],
    age: [3000, 6000],
    beliefs: [
      'The stars are the first light and the elves its children',
      'Every forest has its guardian',
      'Song is prayer',
      'The physical world is merely a reflection of the eternal starlit realm',
      'Memory never truly dies while the ancient trees still stand',
      'Starlight purified in sacred waters reveals secrets of what is to come',
      'To fell a heart-tree is to extinguish a divine melody in the song of the world',
      'Departed souls sail across the silver sea to the far western haven'
    ],
    sect: [
      'the Moon-sworn of {N}',
      'the {N} Choir',
      'the Order of the Silver Swan',
      'the Circle of the Evening Canopy',
      'the Keepers of the First Starlight',
      'the Weavers of the Sacred Grove',
      'the Guardians of the Haven'
    ],
    doctrines: { 
      head: { pontiff: 1, none: 1 }, 
      clergy: { priestesses: 3, open: 1 }, 
      conversion: { closed: 3 }, 
      others: { pluralist: 3, righteous: 0.5 }, 
      death: { sea: 3, burial: 1 }, 
      marriage: { monogamy: 4 } 
    },
    tenets: ['astrology', 'nature', 'pacifism', 'rebirth', 'sacredGroves', 'witchcraft'], 
    places: ['forest', 'island', 'lake'],
  },
  ancestors: {
    kind: 'worship of the ancestors',
    names: [
      'the Forge and the Fathers',
      'the Way of the Ancestors',
      'the Hall of the Fathers',
      'the Path of the Deep Anvil',
      'the Eternal Rune-Lodge',
      'the Priesthood of Cold Iron',
      'the Keepers of the Great Grudge',
      'the Sacred Clan-Loom'
    ],
    adherents: [
      'the Children of the Forge',
      'the Folk of the Anvil',
      'the Clan of the Mountain Roots',
      'the Keepers of the Rune-Stones',
      'the Oath-Bound',
      'the Sons and Daughters of Stone'
    ],
    head: [
      'High Forgepriest',
      'Keeper of the Runes',
      'Grand Master of the Anvil',
      'Supreme Grudgek keeper',
      'First Voice of the Fathers',
      'Arch-Mason of the Deep Halls'
    ],
    clergy: [
      'forge-priests and rune-keepers',
      'clan elders and grudge-reciters',
      'tomb-carvers and stone-singers',
      'anvil-masters and gold-weighers',
      'runic armorers and ancestral bards'
    ],
    temple: [
      'deep shrines and ancestor halls',
      'subterranean forge-cathedrals',
      'granite vaults beneath the roots',
      'rune-carved mountain fortresses',
      'pillar-lined halls of the ancient kings'
    ],
    scripture: [
      'the Rune-tablets of the Fathers',
      'the Book of Grudges',
      'the Great Anvil-Roll of Kings',
      'the Carved Code of Cold Iron',
      'the Saga of the First Shaping'
    ],
    symbols: [
      ['a hammer', 'hammer'],
      ['an anvil', 'hammer'],
      ['a mountain', 'tower'],
      ['a glowing rune', 'cross'],
      ['a dwarven battle-axe', 'sword'],
      //['a heavy iron lock', 'ring'],
      ['a gold horn', 'horn'],
      //['a stone beard', 'skull'],
      ['a pair of mason callipers', 'roundel'],
      //['a pickaxe over an ingot', 'star']
    ],
    domains: [
      'the Forge-father, who carved the first folk from stone',
      'the Mother of the Deeps',
      'god of oaths and grudges',
      'god of gold and the hoard',
      'god of the halls and hearth',
      'patron of smiths and armor-framers',
      'the Lord of Underground Streams and Veins',
      'the Guardian of the Deep Gates',
      'god of siege-craft and stone-hewing',
      'the Silent Watcher of the Royal Tombs'
    ],
    gods: [3, 5],
    age: [3000, 5000],
    beliefs: [
      'The first folk were carved from stone',
      'Grudges are written and never forgotten',
      'The ancestors watch from the deep halls',
      'An oath sworn on cold iron binds the soul beyond death',
      'Flawless craft honors the gods more than spoken prayers',
      'Wealth built by honest sweat and hammer-strikes is holy',
      'To abandon a fallen kin\'s tomb is to invite the mountain\'s wrath',
      'The deepest veins of the earth hold the original breath of the Forge-father'
    ],
    sect: [
      'the {N} Rune-lodge',
      'the Deep Fathers',
      'the Brotherhood of the Red Anvil',
      'the Order of the Iron Ledger',
      'the Keepers of the Great Vein',
      'the Guild of the Stone-Singers',
      'the Watchers of the Deep Gate'
    ],
    doctrines: { 
      head: { pontiff: 1, ruler: 1 }, 
      clergy: { hereditary: 3, married: 1 }, 
      conversion: { closed: 4 }, 
      others: { righteous: 2, pluralist: 1 }, 
      death: { tombs: 4 }, 
      marriage: { monogamy: 3 } 
    },
    tenets: ['ancestors', 'craft', 'sacredLaw', 'asceticism', 'adorcism', 'suicide', 'filialPiety'], 
    places: ['peak'],
  },
  sky: {
    kind: 'cult of the eternal sky',
    names: [
      'the Eternal Sky',
      'the Sky and the Earth',
      'the Blue Heaven',
      'the Way of {P}',
      'the Path of the Nine Heavens',
      'the Law of the Great Steppe',
      'the Breath of the High Wind',
      'the Circle of the Five Banners'
    ],
    adherents: [
      'the Children of the Sky',
      'the Riders of the Wind',
      'the People of the Felt Tents',
      'the Bearers of the Sky-Seal',
      'the Servants of the Eternal Blue',
      'the Kin of the Iron Wolf'
    ],
    head: [
      'Chief Shaman',
      'Supreme Sky Reader',
      'Voice of the Great Ancestors',
      'Keeper of the Eternal Fire',
      'High Shaman of the Nine Pines'
    ],
    clergy: [
      'shamans',
      'bone-diviners and drum-beaters',
      'spirit-riders and fire-priests',
      'horse-chanters and sky-singers',
      'herbalists and ancestral shamans'
    ],
    temple: [
      'cairns on the high passes',
      'stone ovoos draped in silk scarves',
      'sacred mountain groves and river headwaters',
      'earthen kurgan mounds',
      'open steppe circles around the clan hearth-fire'
    ],
    scripture: [
      'the songs of the shamans',
      'the secret history of the ancestors',
      'the epic tales of the grand horsemen',
      'the chants of the nine sky-spirits',
      'the sayings written on birch bark'
    ],
    symbols: [
      ['a horse', 'horn'],
      ['the sun', 'sun'],
      ['an eagle', 'eagle'],
      //['a blue wolf', 'skull'],
      //['a crescent moon and star', 'moon'],
      ['a shaman drum', 'roundel'],
      ['a sacred spear with horsehair tassels', 'sword'],
      //['a mountain peak under three clouds', 'peak'],
      ['a burning hearth-fire', 'sun'],
      ['a golden falcon', 'bird']
    ],
    domains: [
      'the Eternal Sky, father of all',
      'the Earth Mother',
      'spirit of the hearth',
      'spirit of the horse herds',
      'the wolf ancestor',
      'the god of war and iron weapons',
      'the lord of the underworld and cold spirits',
      'the goddess of fertility and young children',
      'spirit of the high mountain passes',
      'the guardian of water springs'
    ],
    gods: [3, 5],
    age: [2000, 3000],
    beliefs: [
      'The Sky gives a ruler fortune to rule',
      'Spirits dwell in fire, water and stone',
      'Shamans walk between the worlds',
      'Pouring milk or liquor upon the earth honors the spirits',
      'A warrior who falls in battle rides eternally across the starry sky',
      'Crossing a hearth-fire purifies both guests and weapons',
      'Defiling running water or burning garbage in a hearth invites terrible curses',
      'The bone of a sheep holds the outline of coming winters and battles'
    ],
    sect: [
      'the Black Shamans',
      'the White Shamans',
      'the Order of the Iron Wolf',
      'the Society of the Sky-Drum',
      'the Guardians of the Royal Kurgan',
      'the Priesthood of the Nine Pines'
    ],
    doctrines: { 
      head: { none: 2, ruler: 2 }, 
      clergy: { open: 3 }, 
      conversion: { closed: 2, sword: 1 }, 
      others: { pluralist: 4 }, 
      death: { sky: 4, barrows: 1 }, 
      marriage: { polygamy: 2, concubines: 2 } 
    },
    tenets: ['nature', 'sacredWaters', 'divination', 'warriorCult', 'adorcism', 'suicide', 'takamine'], 
    places: ['peak', 'lake'],
  },
  heaven: {
    kind: 'way of heaven',
    names: [
      'the Way of Heaven',
      'the Teachings of the Sages',
      'the Way of {P}',
      'the Middle Way',
      'the Great Harmony',
      'the Path of the Jade Emperor',
      'the Five Eternal Virtues',
      'the Celestial Order of {H}'
    ],
    adherents: [
      'the Followers of the Way',
      'the Scholars of the Sages',
      'the Seekers of Harmony',
      'the Servants of the Mandate',
      'the Children of the Middle Realm',
      'the Pure-Hearted'
    ],
    head: [
      'Grand Master of Rites',
      'Celestial Master',
      'Abbot of the White Cloud Temple',
      'Imperial Preceptor',
      'High Keeper of the Classics',
      'Grand Tutor of the Realm'
    ],
    clergy: [
      'monks, sages and ritualists',
      'scholars and shrine keepers',
      'hermits and astrology masters',
      'diviners and ancestral priests',
      'monks and court ritualists'
    ],
    temple: [
      'temples and ancestral halls',
      'monasteries and shrines',
      'pagoda complexes and scholar academies',
      'walled temple courts and mountain retreats',
      'halls of imperial ancestor-tablets'
    ],
    scripture: [
      'the Classics of the Sages',
      'the Sayings of {P}',
      'the Book of Changes',
      'the Sutras of the Lotus and Cloud',
      'the Annals of the Five Sages',
      'the Great Canon of Filial Duty'
    ],
    symbols: [
      ['a dragon', 'serpent'],
      ['clouds', 'cloud'],
      ['the sun', 'sun'],
      ['a lotus', 'blossom'],
      ['a twin fish circle', 'roundel'],
      ['a jade tablet', 'cross'],
      ['a crane in flight', 'bird'],
      //['a five-tiered pagoda', 'peak'],
      ['an ink brush and scroll', 'sword'],
      //['a tiger', 'skull']
    ],
    domains: [
      'Heaven, which grants the mandate to rule',
      'the Jade Lord, ruler of the celestial court',
      'the first sage',
      'the god of the hearth',
      'the queen mother of the west',
      'the god of examinations and literature',
      'the lord of the nine underworld courts',
      'goddess of mercy and compassion',
      'the dragon king of the waters',
      'the spirit of the five sacred mountains'
    ],
    gods: [3, 5],
    age: [1500, 2600],
    beliefs: [
      'Filial duty',
      'Harmony between Heaven, Earth and Man',
      'Learning opens the road to office',
      'Rulers lose the Mandate of Heaven through wickedness or incompetence',
      'Ancestors require offerings of incense and burnt paper gold',
      'All things exist in a delicate balance of light and shadow',
      'Cultivating the mind through study and meditation purifies the soul',
      'Actions in this life determine the rank of the soul in the next rebirth'
    ],
    sect: [
      'the School of {N}',
      'the Pure Land',
      'the Sudden Way',
      'the {N} Teaching',
      'the Way of Rites',
      'the Academy of the White Lotus',
      'the Celestial Bureaucracy Society',
      'the Hermits of the Bamboo Grove'
    ],
    doctrines: { 
      head: { ruler: 3, pontiff: 1 }, 
      clergy: { celibate: 2, married: 2 }, 
      conversion: { missionary: 2, closed: 1 }, 
      others: { pluralist: 4 }, 
      death: { burial: 4, burning: 1 }, 
      marriage: { concubines: 3, monogamy: 1 } 
    },
    tenets: ['ancestors', 'monasticism', 'asceticism', 'kingship', 'pacifism', 'rebirth', 'filialPiety'], 
    places: ['peak', 'lake'],
  },
  kami: {
    kind: 'way of the spirits',
    names: [
      'the Way of the Spirits',
      'the Eight Thousand Spirits',
      'the Way of {P}',
      'the Way of the Gods',
      'the Sacred Mirror',
      'the Path of the White Crane',
      'the Circle of the Five Elements',
      'the Heavenly Realm of {H}'
    ],
    adherents: [
      'the Faithful',
      'the People of the Isles',
      'the Servants of the {H}',
      'the Keepers of the Shrines',
      'the Pure-Hearted',
      'the Children of the Sun'
    ],
    head: [
      'High Priestess of the Sun',
      'Supreme Shrine Keeper',
      'Master of the Imperial Rites',
      'Oracle of the Sacred Mirror',
      'Grand Abbot of the Mountain Peaks'
    ],
    clergy: [
      'shrine priests and shrine maidens',
      'monks and shrine priests',
      'mountain ascetics and oracle maidens',
      'exorcists and ritual dancers',
      'hermits and diviners'
    ],
    temple: [
      'shrines with gates and temples',
      'vermilion shrines with torii gates',
      'mountain grottoes and sacred groves',
      'island shrines surrounded by water',
      'hillside pagoda complexes and paper-lantern halls'
    ],
    scripture: [
      'the Records of Ancient Matters',
      'the Chronicles of the Heavenly Gods',
      'the Scrolls of the Eight Million Souls',
      'the Secret Songs of the Oracle',
      'the Sutras of the Mountain Spirits'
    ],
    symbols: [
      ['the rising sun', 'sun'],
      ['a comma', 'tomoe'],
      ['a blossom', 'blossom'],
      ['a sacred gateway', 'cross'],
      ['a nine-tailed fox', 'roundel'],
      //['a sacred mirror', 'moon'],
      ['a folded paper talisman', 'sword'],
      ['a coiled dragon', 'serpent'],
      ['a pine bough bound with paper', 'tree'],
      //['a bronze ritual bell', 'ring']
    ],
    domains: [
      'goddess of the sun, ancestor of the emperors',
      'god of storms and the sea',
      'god of the moon',
      'god of rice and foxes',
      'god of war and archery',
      'god of the underworld and earth tremors',
      'goddess of the hearth and weavers',
      'spirit of the sacred mountain peak',
      'god of thunder and lightning',
      'patron spirit of craftsmen and sword-smiths'
    ],
    gods: [4, 6],
    age: [1500, 2500],
    beliefs: [
      'Spirits dwell in mountains, trees and rivers',
      'The emperor descends from the sun',
      'Festivals for each season',
      'Purity of body and spirit repels evil influences',
      'Blood and decay bring spiritual corruption',
      'Ancestor spirits watch over the family hearth',
      'Even old objects acquire a soul after a hundred years',
      'Impurities are washed away in running water and mountain streams'
    ],
    sect: [
      'the {N} Sect',
      'the Mountain Ascetics',
      'the Pure Land',
      'the Order of the Sacred Mirror',
      'the Fox-Spirit Brotherhood',
      'the Priesthood of the Storm-King',
      'the Shrine-Keepers of {N}'
    ],
    doctrines: { 
      head: { ruler: 3, none: 1 }, 
      clergy: { hereditary: 2, open: 1 }, 
      conversion: { closed: 3 }, 
      others: { pluralist: 4 }, 
      death: { burning: 2, burial: 2 }, 
      marriage: { concubines: 2, monogamy: 2 } 
    },
    tenets: ['purity', 'kingship', 'nature', 'feastDays', 'adorcism', 'takamine'], 
    places: ['peak', 'forest', 'island'],
  },
  spirits: {
    kind: 'faith of the great spirit',
    names: [
      'the Great Spirit',
      'the Way of the Grandfathers',
      'the Sacred Circle',
      'the Path of the Four Winds',
      'the Breath of All Things',
      'the Circle of the Medicine Wheel',
      'the Voice of the Elders',
      'the Way of the Tree of Peace'
    ],
    adherents: [
      'the People',
      'the Children of the Earth',
      'the Keepers of the Fire',
      'the People of the Sacred Pipe',
      'the Walkers of the Red Road',
      'the Kin of the Animal Spirits'
    ],
    head: [
      'Keeper of the Medicine',
      'Peace Chief',
      'Pipe Carrier',
      'Grand Medicine Singer',
      'Elder of the Four Directions',
      'Keeper of the Wampum'
    ],
    clergy: [
      'medicine men and women',
      'vision-seekers and storytellers',
      'pipe-carriers and dream-readers',
      'drum-keepers and herbalists',
      'ritual singers and fire-keepers'
    ],
    temple: [
      'medicine lodges and sweat lodges',
      'sacred council fires and sun-dance arbors',
      'vision pits and birch-bark lodges',
      'earthen mounds and sacred groves',
      'open-air dance circles and river-bend shrines'
    ],
    scripture: [
      'the stories of the elders',
      'the woven wampum belts',
      'the carved birch-bark scrolls',
      'the painted winter counts',
      'the songs handed down through generations'
    ],
    symbols: [
      ['a feather', 'feather'],
      ['a bird', 'bird'],
      ['the sun', 'sun'],
      ['a serpent', 'serpent'],
      ['a dreamcatcher', 'roundel'],
      //['a bear paw print', 'skull'],
      ['a medicine wheel', 'cross'],
      ['a sacred pipe', 'sword'],
      //['a howling wolf', 'moon'],
      ['a thunderbird', 'eagle']
    ],
    domains: [
      'the Great Spirit, in all things',
      'Grandfather Sun',
      'Grandmother Moon',
      'the Thunderbird',
      'the Trickster',
      'Mother Earth',
      'the Great Bear, spirit of healing',
      'the White Buffalo, bringer of peace',
      'the Four Winds, masters of the seasons',
      'the Horned Serpent of the deep waters',
      'the Cedar and Tobacco, sacred messengers',
      'the Ancestors who walk in the Milky Way'
    ],
    gods: [3, 5],
    age: [3000, 6000],
    beliefs: [
      'Visions guide the young',
      'Land belongs to no one',
      'Decisions consider seven generations',
      'All living creatures are our sacred kin',
      'Tobacco smoke carries prayers to the Sky Father',
      'Taking life from nature requires a gift of thanks and respect',
      'Dreams are messages from the grandfathers',
      'The sacred hoop of the world must remain unbroken'
    ],
    sect: [
      'the {N} Dance',
      'the {N} Society',
      'the False Face Society',
      'the Order of the Sacred Pipe',
      'the Medicine Lodge of {N}',
      'the Keepers of the Sun Dance',
      'the Clan of the Horned Serpent'
    ],
    doctrines: { 
      head: { none: 4 }, 
      clergy: { open: 3 }, 
      conversion: { closed: 3 }, 
      others: { pluralist: 4 }, 
      death: { burial: 2, sky: 1, burning: 1 }, 
      marriage: { monogamy: 2, polygamy: 1 } 
    },
    tenets: ['nature', 'divination', 'ancestors', 'rebirth', 'hospitality', 'carnalism', 'adorcism', 'witchcraft', 'takamine'], 
    places: ['lake', 'peak', 'forest'],
  },
  sun: {
    kind: 'cult of the sun',
    names: [
      'the Children of the Sun',
      'the Sun and the Mountains',
      'the Cult of the Sun',
      'the Way of the Golden Disk',
      'the Path of the Four Directions',
      'the Priesthood of the Sky-Father',
      'the Order of the Sacred Peak',
      'the Keepers of the Sun\'s Gold'
    ],
    adherents: [
      'the Children of the Sun',
      'the Sun\'s Servants',
      'the People of the Four Quarters',
      'the Sun-Born',
      'the Keepers of the Peaks',
      'the Servants of the Golden Disk'
    ],
    head: [
      'High Priest of the Sun',
      'Speaker for the Golden Sun',
      'Guardian of the Royal Mummies',
      'Supreme Solar Keeper',
      'First Voice of the High Peaks'
    ],
    clergy: [
      'priests and chosen women',
      'sun-priests and aclla maidens',
      'quipu-keepers and mountain shamans',
      'shrine-keepers and mummy-servants',
      'solar astrologers and terrace-priests'
    ],
    temple: [
      'sun temples and mountain shrines',
      'golden temples and high-altitude altars',
      'stepped stone shrines and sacred mountain caves',
      'polised granite sun-enclosures',
      'royal terraces and peak observatories'
    ],
    scripture: [
      'the knotted records of the priests',
      'the sacred quipu cords',
      'the golden tablets of the royal lineage',
      'the songs of the ancestral mummies',
      'the solar calendars of the High Sun'
    ],
    symbols: [
      ['the sun', 'sun'],
      ['a condor', 'eagle'],
      ['a stepped cross', 'cross'],
      ['a golden llama', 'roundel'],
      ['a puma', 'bird'],
      //['a mountain peak with a sunburst', 'peak'],
      //['a knot-cord seal', 'ring'],
      //['a golden mask', 'skull']
    ],
    domains: [
      'the Sun, father of kings',
      'the Moon, his sister-wife',
      'the Creator, who rose from the lake',
      'god of thunder and rain',
      'the Earth Mother',
      'the spirits of the mountains',
      'the Rainbow, messenger of the gods',
      'the Lord of Earthquakes and Subterranean Fire',
      'the Morning Star, herald of dawn',
      'the Divine Llama, guardian of herds'
    ],
    gods: [4, 6],
    age: [800, 1500],
    beliefs: [
      'Mountains and springs are holy',
      'Labour is owed to the Sun and the state',
      'Royal ancestors never die; their mummies must be fed and consulted',
      'All gold belongs to the Sun, and all silver to the Moon',
      'The king is the living son of the Sun on earth',
      'High mountain peaks are the thrones of the sacred guardian spirits',
      'The world was created from the deep waters of the holy lake',
      'Sacrifices on high snow-capped peaks bring seasonal rains and fertile crops'
    ],
    sect: [
      'the Lake Cult',
      'the Mountain Cult of {N}',
      'the Sisterhood of the Sun-Maidens',
      'the Order of the Golden Disk',
      'the Keeper-Priesthood of the Royal Ancestors',
      'the Guardians of the High Huacas'
    ],
    doctrines: { 
      head: { ruler: 4 }, 
      clergy: { hereditary: 2, open: 1 }, 
      conversion: { sword: 2, closed: 1 }, 
      others: { righteous: 2, pluralist: 1 }, 
      death: { tombs: 4 }, 
      marriage: { polygamy: 2, concubines: 2 } 
    },
    tenets: ['kingship', 'ancestors', 'ritualSacrifice', 'astrology', 'sacredWaters', 'hedonism', 'suicide'], 
    places: ['peak', 'lake'],
  },
  serpent: {
    kind: 'cult of the feathered serpent',
    names: [
      'the Feathered Serpent',
      'the Count of Days',
      'the Gods of {H}',
      'the Way of the Emerald Plume',
      'the Path of the Sun\'s Blood',
      'the Way of the Nine Underworlds',
      'the Circle of the Five Suns',
      'the Keepers of the Maize',
      'the Lords of the Night'
    ],
    adherents: [
      'the Faithful',
      'the Sun\'s Children',
      'the People of Maize',
      'the Bearers of the Blood-Debt',
      'the Blood-Givers',
      'the Servants of the Emerald Sky'
    ],
    head: [
      'High Priest',
      'Speaker of the Calendar',
      'First Voice of the Sun',
      'Grand Sacrificer',
      'High Keeper of the Codex',
      'Supreme Jaguar Speaker'
    ],
    clergy: [
      'priests and calendar-keepers',
      'blood-drawers and astrologers',
      'day-keepers and sky-watchers',
      'codex-scribes and sacrificers',
      'jaguar-shaman and night-priests'
    ],
    temple: [
      'stepped pyramids',
      'pyramid temples and ball-courts',
      'terraced pyramid-complexes',
      'temple-mounds and sacred cenotes',
      'carved stone plazas and sky-observatories'
    ],
    scripture: [
      'the folded books of days',
      'the bark-paper codices',
      'the painted screenfolds of the sky',
      'the carved stone stelae',
      'the songs of the five suns'
    ],
    symbols: [
      ['a feathered serpent', 'serpent'],
      ['a jaguar', 'roundel'],
      ['the sun', 'sun'],
      ['a bird', 'bird'],
      ['an obsidian blade', 'sword'],
      ['a ear of maize', 'tree'],
      //['a skull dripping blood', 'skull'],
      //['a smoking mirror', 'moon'],
      ['a quetzal feather', 'bird'],
      ['a coiled rattlesnake', 'serpent']
    ],
    domains: [
      'the Feathered Serpent, bringer of learning',
      'god of rain',
      'god of maize',
      'the Smoking Mirror, god of night and fate',
      'the sun, who must be fed',
      'god of death',
      'the Flayed Lord, god of rebirth and spring',
      'the Lord of the Underworld',
      'the Mother of Stars',
      'god of the sacred cenote',
      'god of the hunt and wild places',
      'goddess of childbearing and weaving'
    ],
    gods: [5, 7],
    age: [1500, 2500],
    beliefs: [
      'Time turns in great cycles',
      'The ball-game re-enacts the struggle of the gods',
      'Kings bleed to speak to their ancestors',
      'The sun will die unless fed with human blood',
      'Four worlds ended before this one, and ours shall end in fire and earthquake',
      'The dead must navigate nine treacherous layers of the underworld',
      'Human flesh is formed from sacred ground maize and water',
      'Every person possesses a wild animal spirit-twin',
      'The sky is held up by four great world-trees at the cardinal points'
    ],
    sect: [
      'the Cult of {N}',
      'the Jaguar Brotherhood',
      'the Order of the Obsidian Blade',
      'the Circle of the Smoking Mirror',
      'the Keepers of the Sun-Stone',
      'the Priesthood of the Flayed Skin',
      'the Eagle Warriors of {N}'
    ],
    doctrines: { 
      head: { pontiff: 2, ruler: 2 }, 
      clergy: { hereditary: 2, open: 1 }, 
      conversion: { sword: 2, closed: 1 }, 
      others: { righteous: 2, pluralist: 1 }, 
      death: { tombs: 2, burial: 2 }, 
      marriage: { polygamy: 2, monogamy: 1 } 
    },
    tenets: ['ritualSacrifice', 'astrology', 'kingship', 'feastDays', 'dualism', 'carnalism', 'witchcraft', 'suicide'], 
    places: ['peak', 'lake'],
} ,
};
export const ARCHETYPE_LABEL: Record<FaithFamily, string> = {
  church: 'a church', crescent: 'the faith of the prophets', pantheon: 'a pantheon', oldgods: 'the old gods', druid: 'a druid faith', stars: 'the stars', ancestors: 'the ancestors',
  sky: 'the eternal sky', heaven: 'the way of heaven', kami: 'the spirits of place', spirits: 'the great spirit', sun: 'the sun', serpent: 'the feathered serpent',
};

/** Each template's native faith, and the faith its people found when they found a missionary one. */
const NATIVE: Record<string, FaithFamily> = table((b) => b.faith.native);
const MISSIONARY: Record<string, FaithFamily> = table((b) => b.faith.missionary);
/** How likely a template's people are to found a missionary faith. */
const PROPHETIC = table((b) => b.faith.prophetic);
/** How readily a template's people take up a foreign faith. */
const OPEN = table((b) => b.faith.open);

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
