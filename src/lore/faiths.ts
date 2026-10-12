import { hashString, mulberry32, type Rng } from '../gen/rng';
import type { PolUnit } from '../gen/politics';
import { CULTURES } from '../names/cultures';
import type { NameBank } from '../names/names';
import type { Charge } from '../heraldry/arms';


/**
 * The world's faiths. Each culture keeps a faith of its own kind (a church, an old pantheon, a
 * cult of the sun, the way of heaven), and some kinds spread across several peoples as one faith
 * split into sects: the Church, the faith of the desert prophets, the way of heaven. Some peoples
 * are converts (the Northmen to the Church, the steppe to the desert faith), by the world's seed.
 * A realm keeps the faith of its rulers' people, and the sect whose birthplace lies nearest.
 */

const pick = <T>(rnd: Rng, a: readonly T[]): T => a[Math.floor(rnd() * a.length)];

export type FaithFamily = 'church' | 'crescent' | 'pantheon' | 'oldgods' | 'druid' | 'stars' | 'ancestors' | 'sky' | 'heaven' | 'kami' | 'spirits' | 'sun' | 'serpent';

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
  name: string;
  /** "monotheist church", "pantheon of the old gods". */
  kind: string;
  /** What the faithful call themselves. */
  adherents: string;
  cultures: number[];
  deities: Deity[];
  head: { title: string; seatName: string; lon: number; lat: number };
  clergy: string;
  temple: string;
  scripture: string;
  symbol: string;
  charge: Charge;
  tenets: string[];
  holySites: HolySite[];
  sects: Sect[];
  founded: number;
}

interface FamilyDef {
  kind: string;
  shared: boolean;
  name: (n: string, rnd: Rng) => string;
  adherents: (n: string, rnd: Rng) => string;
  head: string[];
  clergy: string[];
  temple: string[];
  scripture: (n: string, rnd: Rng) => string;
  symbols: [string, Charge][];
  /** Domains of the god or gods; the first is the chief one. */
  domains: string[];
  gods: [number, number];
  tenets: string[];
  sect: string[];
  age: [number, number];
}

const LIGHT = ['Light', 'Flame', 'Dawn', 'Lamb', 'Radiant Sun', 'Morning Star', 'Holy Wheel', 'Seven Lamps', 'Eternal Fire', 'Open Hand'];
const FAMILIES: Record<FaithFamily, FamilyDef> = {
  church: {
    kind: 'monotheist church', shared: true, name: (_n, r) => `the Church of the ${pick(r, LIGHT)}`, adherents: () => 'the Faithful',
    head: ['Pontiff', 'Patriarch', 'Hierophant', 'Exarch'], clergy: ['priests', 'bishops and priests', 'friars and priests'], temple: ['cathedrals and chapels', 'basilicas and churches'],
    scripture: (n, r) => pick(r, [`the Book of ${n}`, `the Testament of ${n}`, 'the Holy Canon', `the Gospels of ${n}`]),
    symbols: [['a radiant sun', 'sun'], ['a cross', 'cross'], ['a wheel', 'wheel'], ['a key', 'key'], ['a lamb', 'cross'], ['a dove', 'bird']],
    domains: ['the One God, creator of all', 'prophet and martyr', 'the first apostle', 'patron saint of sailors', 'patron saint of soldiers', 'patron saint of healers', 'patron saint of the poor', 'patron saint of scholars'],
    gods: [4, 6], age: [800, 1200],
    tenets: ['One god, revealed through a prophet', 'Charity to the poor', 'Confession and penance', 'Pilgrimage to holy cities', 'Monastic orders keep the learning of the age', 'Tithes owed to the church', 'Holy war against the unbeliever is lawful', 'Saints intercede for the living'],
    sect: ['the Orthodox Church', 'the Reformed Church', 'the Old Rite', 'the Eastern Rite', 'the {N} Confession', 'the Church of {N}', 'the Free Church', 'the {N} Rite'],
  },
  crescent: {
    kind: 'faith of the prophets', shared: true, name: (n, r) => pick(r, ['the Faith of the Prophet', `the Way of ${n}`, 'the Submission', 'the Path of the Merciful']), adherents: () => 'the Believers',
    head: ['Caliph', 'Grand Imam'], clergy: ['imams and scholars', 'imams and qadis'], temple: ['mosques and madrasas', 'great mosques'],
    scripture: (n, r) => pick(r, ['the Recitation', `the Book of ${n}`, 'the Revealed Word']), symbols: [['a crescent', 'crescent'], ['a star', 'mullet'], ['a lamp', 'estoile']],
    domains: ['the one God, compassionate and just', 'the last prophet', 'the first caliph', 'the martyred imam', 'the hidden imam'], gods: [3, 5], age: [600, 900],
    tenets: ['One god and his last prophet', 'Prayer five times a day', 'Alms for the poor', 'A fast in the holy month', 'Pilgrimage to the holy city once in a life', 'Law from the scholars', 'Images of the living are forbidden'],
    sect: ['the Followers of the Imams', 'the People of the Tradition', 'the {N} School', 'the Seceders', 'the Mystic Brotherhood of {N}'],
  },
  pantheon: {
    kind: 'pantheon of gods', shared: false, name: (n, r) => pick(r, [`the Gods of ${n}`, 'the Twelve', 'the Olympian Rites', `the Mysteries of ${n}`]), adherents: () => 'the Pious',
    head: ['High Priest', 'Archpriestess', 'Oracle'], clergy: ['priests and oracles', 'priestesses'], temple: ['temples and sanctuaries', 'temples with colonnades'],
    scripture: (n, r) => pick(r, ['the Sacred Hymns', `the Theogony of ${n}`, 'the Oracles']), symbols: [['an owl', 'bird'], ['a thunderbolt', 'estoile'], ['a trident', 'anchor'], ['a laurel', 'tree']],
    domains: ['king of the gods and the sky', 'queen of the gods and marriage', 'god of the sea', 'goddess of wisdom and war', 'god of the sun and music', 'goddess of the hunt and the moon', 'god of the forge', 'goddess of the harvest', 'god of wine and revels', 'god of the dead'],
    gods: [6, 9], age: [1200, 2000],
    tenets: ['Many gods, each with a temple and a feast', 'Sacrifice at the altar', 'Oracles speak the gods\' will', 'Games in the gods\' honour', 'The dead cross a river to the underworld', 'Hospitality to strangers is sacred'],
    sect: ['the Mysteries of {N}', 'the {N} Cult', 'the Philosophers of {N}'],
  },
  oldgods: {
    kind: 'the old gods', shared: false, name: (n, r) => pick(r, ['the Old Gods', `the Faith of ${n}`, 'the Ancient Custom']), adherents: () => 'the Heathen',
    head: ['High Godi', 'Volva'], clergy: ['godar and seeresses', 'godar'], temple: ['hofs and sacred groves', 'temples and stone circles'],
    scripture: () => 'the Sagas and the Sayings of the High One', symbols: [['a hammer', 'hammer'], ['a raven', 'bird'], ['an axe', 'axe'], ['a serpent', 'serpent']],
    domains: ['the All-father, god of wisdom and the slain', 'god of thunder', 'goddess of love and battle', 'god of the harvest', 'the trickster', 'goddess of the dead', 'god of the sea', 'god of the hunt'],
    gods: [5, 8], age: [1500, 2500],
    tenets: ['The brave who fall in battle feast with the gods', 'Sacrifice at the great feasts', 'Oaths are sacred', 'Seers read the runes', 'The world will end in fire and ice'],
    sect: ['the Cult of {N}', 'the Old Way'],
  },
  druid: {
    kind: 'druidic nature faith', shared: false, name: (n, r) => pick(r, ['the Old Faith', `the Way of the Grove`, `the Mysteries of ${n}`]), adherents: () => 'the Children of the Oak',
    head: ['Archdruid'], clergy: ['druids, bards and seers'], temple: ['sacred groves and stone circles'], scripture: () => 'the unwritten lore of the druids',
    symbols: [['an oak', 'tree'], ['an acorn', 'acorn'], ['a crescent moon', 'crescent'], ['a stag', 'horn']],
    domains: ['the Mother, goddess of the land', 'the Horned One, lord of beasts', 'god of the sun and craft', 'goddess of rivers and wells', 'the Morrow-queen, goddess of battle and fate', 'god of the sea'],
    gods: [4, 6], age: [1500, 2500],
    tenets: ['Gods dwell in groves, springs and stones', 'The soul is reborn', 'Druids alone may judge', 'Feasts at the turning of the year', 'Heads of foes are kept as trophies'],
    sect: ['the {N} Brotherhood', 'the Grove of {N}'],
  },
  stars: {
    kind: 'worship of the stars', shared: false, name: (n, r) => pick(r, ['the Song of the Stars', `the Light of ${n}`, 'the Starlit Way']), adherents: () => 'the Starborn',
    head: ['High Priestess', 'Keeper of the Stars'], clergy: ['star-singers', 'priestesses of the moon'], temple: ['open-roofed star temples', 'moonlit shrines'],
    scripture: (n) => `the Lay of ${n}`, symbols: [['a star', 'estoile'], ['a crescent moon', 'crescent'], ['a tree', 'tree']],
    domains: ['the Lady of the Stars, who sang the world', 'lord of the moon', 'lady of the evening star', 'keeper of the forest', 'lord of the sea and the far west', 'lady of dreams'],
    gods: [4, 6], age: [3000, 6000],
    tenets: ['The stars are the first light and the elves its children', 'Every forest has its guardian', 'Song is prayer', 'The dead sail west to the undying lands'],
    sect: ['the Moon-sworn of {N}', 'the {N} Choir'],
  },
  ancestors: {
    kind: 'worship of the ancestors', shared: false, name: (n, r) => pick(r, ['the Forge and the Fathers', `the Faith of ${n}`, 'the Way of the Ancestors']), adherents: () => 'the Children of the Forge',
    head: ['High Forgepriest', 'Keeper of the Runes'], clergy: ['forge-priests and rune-keepers'], temple: ['deep shrines and ancestor halls'], scripture: () => 'the Rune-tablets of the Fathers',
    symbols: [['a hammer', 'hammer'], ['an anvil', 'hammer'], ['a mountain', 'tower']],
    domains: ['the Forge-father, who carved the first folk from stone', 'the Mother of the Deeps', 'god of oaths and grudges', 'god of gold and the hoard', 'god of the halls and hearth'],
    gods: [3, 5], age: [3000, 5000],
    tenets: ['The first folk were carved from stone', 'Grudges are written and never forgotten', 'Craft is worship', 'The ancestors watch from the deep halls'],
    sect: ['the {N} Rune-lodge', 'the Deep Fathers'],
  },
  sky: {
    kind: 'cult of the eternal sky', shared: false, name: (n, r) => pick(r, ['the Eternal Blue Sky', `the Way of ${n}`, 'the Sky and the Earth']), adherents: () => 'the Children of the Sky',
    head: ['Chief Shaman'], clergy: ['shamans'], temple: ['cairns on the high passes'], scripture: () => 'the songs of the shamans',
    symbols: [['a horse', 'horn'], ['the sun', 'sun'], ['an eagle', 'eagle']],
    domains: ['the Eternal Sky, father of all', 'the Earth Mother', 'spirit of the hearth', 'spirit of the horse herds', 'the wolf ancestor'], gods: [3, 5], age: [2000, 3000],
    tenets: ['The Sky gives a ruler fortune to rule', 'Spirits dwell in fire, water and stone', 'Water must not be fouled', 'Shamans walk between the worlds'],
    sect: ['the Black Shamans', 'the White Shamans'],
  },
  heaven: {
    kind: 'way of heaven', shared: true, name: (n, r) => pick(r, ['the Way of Heaven', 'the Teachings of the Sages', `the Way of ${n}`]), adherents: () => 'the Followers of the Way',
    head: ['Grand Master of Rites', 'Celestial Master'], clergy: ['monks, sages and ritualists'], temple: ['temples and ancestral halls', 'monasteries and shrines'],
    scripture: (n, r) => pick(r, ['the Classics of the Sages', `the Analects of ${n}`, 'the Book of Changes']), symbols: [['a dragon', 'serpent'], ['clouds', 'cloud'], ['the sun', 'sun'], ['a lotus', 'blossom']],
    domains: ['Heaven, which grants the mandate to rule', 'the Jade Lord, ruler of the celestial court', 'the first sage', 'the god of the hearth', 'the queen mother of the west'],
    gods: [3, 5], age: [1800, 2600],
    tenets: ['Heaven grants the mandate to rule, and withdraws it from tyrants', 'Reverence for ancestors', 'Filial duty', 'Harmony between Heaven, Earth and Man', 'Learning opens the road to office'],
    sect: ['the School of {N}', 'the Pure Land', 'the Sudden Way', 'the {N} Teaching', 'the Way of Rites'],
  },
  kami: {
    kind: 'way of the spirits', shared: false, name: (n, r) => pick(r, ['the Way of the Kami', `the Way of ${n}`, 'the Eight Million Spirits']), adherents: () => 'the Faithful',
    head: ['High Priestess of the Sun'], clergy: ['shrine priests and shrine maidens', 'monks and shrine priests'], temple: ['shrines with gates and temples'],
    scripture: () => 'the Records of Ancient Matters', symbols: [['the rising sun', 'sun'], ['a comma', 'tomoe'], ['a blossom', 'blossom']],
    domains: ['goddess of the sun, ancestor of the emperors', 'god of storms and the sea', 'god of the moon', 'god of rice and foxes', 'god of war and archery'], gods: [4, 6], age: [1500, 2500],
    tenets: ['Spirits dwell in mountains, trees and rivers', 'Purity and the washing away of pollution', 'The emperor descends from the sun', 'Festivals for each season'],
    sect: ['the {N} Sect', 'the Mountain Ascetics', 'the Pure Land'],
  },
  spirits: {
    kind: 'faith of the great spirit', shared: false, name: () => 'the Great Spirit', adherents: () => 'the People',
    head: ['Keeper of the Medicine'], clergy: ['medicine men and women'], temple: ['medicine lodges and sweat lodges'], scripture: () => 'the stories of the elders',
    symbols: [['a feather', 'feather'], ['a bird', 'bird'], ['the sun', 'sun'], ['a serpent', 'serpent']],
    domains: ['the Great Spirit, in all things', 'Grandfather Sun', 'Grandmother Moon', 'the Thunderbird', 'the Trickster', 'Mother Earth'], gods: [3, 5], age: [3000, 6000],
    tenets: ['All things have spirit', 'Visions guide the young', 'Thanks are given for the hunt', 'Land belongs to no one', 'Decisions consider seven generations'],
    sect: ['the {N} Dance', 'the {N} Society'],
  },
  sun: {
    kind: 'cult of the sun', shared: false, name: (n, r) => pick(r, ['the Cult of the Sun', `the Children of ${n}`, 'the Sun and the Mountains']), adherents: () => 'the Children of the Sun',
    head: ['High Priest of the Sun'], clergy: ['priests and chosen women'], temple: ['sun temples and mountain shrines'], scripture: () => 'the knotted records of the priests',
    symbols: [['the sun', 'sun'], ['a condor', 'eagle'], ['a stepped cross', 'cross']],
    domains: ['the Sun, father of kings', 'the Moon, his sister-wife', 'the Creator, who rose from the lake', 'god of thunder and rain', 'the Earth Mother', 'the spirits of the mountains'],
    gods: [4, 6], age: [800, 1500],
    tenets: ['The ruler is the son of the Sun', 'Mountains and springs are holy', 'The dead are kept and honoured', 'Labour is owed to the Sun and the state'],
    sect: ['the Lake Cult', 'the Mountain Cult of {N}'],
  },
  serpent: {
    kind: 'cult of the feathered serpent', shared: false, name: (n, r) => pick(r, ['the Feathered Serpent', `the Gods of ${n}`, 'the Count of Days']), adherents: () => 'the Faithful',
    head: ['High Priest', 'Speaker of the Calendar'], clergy: ['priests and calendar-keepers'], temple: ['stepped pyramids', 'pyramid temples and ball-courts'],
    scripture: () => 'the folded books of days', symbols: [['a feathered serpent', 'serpent'], ['a jaguar', 'roundel'], ['the sun', 'sun'], ['a bird', 'bird']],
    domains: ['the Feathered Serpent, bringer of learning', 'god of rain', 'god of maize', 'the Smoking Mirror, god of night and fate', 'the sun, who must be fed', 'god of death'],
    gods: [5, 7], age: [1500, 2500],
    tenets: ['The gods gave their blood for the sun; men repay it', 'Time turns in great cycles', 'The ball-game re-enacts the struggle of the gods', 'Kings bleed to speak to their ancestors'],
    sect: ['the Cult of {N}', 'the Jaguar Brotherhood'],
  },
};

/** Each culture's own faith, and the faith it may have been converted to (with the chance). */
const CULTURE_FAITH: Record<string, [FaithFamily, FaithFamily?, number?]> = {
  anglo: ['church'], latin: ['church'], slavic: ['church', 'oldgods', 0.3], celtic: ['druid', 'church', 0.45], norse: ['oldgods', 'church', 0.4],
  southern: ['pantheon', 'church', 0.4], desert: ['crescent'], steppe: ['sky', 'crescent', 0.3], elvish: ['stars'], dwarven: ['ancestors'],
  sinic: ['heaven'], koreanic: ['heaven'], japonic: ['kami', 'heaven', 0.2], woodland: ['spirits'], highland: ['sun'], jungle: ['serpent'],
};

export interface FaithWorld {
  faiths: Faith[];
  /** Faith id for each culture index. */
  ofCulture: number[];
  /** Cultures converted from their own old faith (to another people's). */
  converted: Map<number, number>;
  /** Sect for a realm (by its culture and seat). */
  sectOf: (culture: number, lon: number, lat: number) => { faith: Faith; sect: Sect };
}

const distKm = (a: number, b: number, c: number, d: number) => {
  const dl = ((((c - a) % 360) + 540) % 360) - 180;
  return Math.hypot(dl * 111.32 * Math.cos((((b + d) / 2) * Math.PI) / 180), (d - b) * 110.57);
};

export function buildFaiths(seed: string, year: number, bank: NameBank, units: PolUnit[], present: Set<number>): FaithWorld {
  const rnd = mulberry32(hashString(`${seed}#faiths`));
  const faiths: Faith[] = [];
  const famOf = new Map<FaithFamily, Faith>();
  const ofCulture: number[] = CULTURES.map(() => -1);
  const converted = new Map<number, number>();
  const uniqueName = (n: string, ci: number) => (faiths.some((f) => f.name === n) ? `${n} of the ${CULTURES[ci]?.name ?? ''}` : n);
  // Cultures' cities, from the realm seats of each culture (the settlement's culture is set for colonies only).
  const seatsOf = new Map<number, { name: string; lon: number; lat: number; pop: number }[]>();
  for (const u of units) {
    if (u.level !== 0) continue;
    (seatsOf.get(u.culture) ?? seatsOf.set(u.culture, []).get(u.culture)!).push({ name: u.seatName, lon: u.lon, lat: u.lat, pop: u.pop });
  }
  for (const v of seatsOf.values()) v.sort((a, b) => b.pop - a.pop);

  for (let ci = 0; ci < CULTURES.length; ci++) {
    if (!present.has(ci)) continue;
    const id = CULTURES[ci].id;
    const [own, conv, p] = CULTURE_FAITH[id] ?? ['spirits'];
    const fam: FaithFamily = conv && rnd() < (p ?? 0) ? conv : own;
    if (fam !== own) converted.set(ci, year - 60 - Math.floor(rnd() * 500));
    const def = FAMILIES[fam];
    const seats = seatsOf.get(ci) ?? [];
    const r = mulberry32(hashString(`${seed}#faith#${fam}#${def.shared ? '' : ci}`));
    let f = def.shared ? famOf.get(fam) : undefined;
    if (!f) {
      const cul = CULTURES[ci];
      const prophet = bank.proper(cul, r);
      const sym = pick(r, def.symbols);
      const nGods = def.gods[0] + Math.floor(r() * (def.gods[1] - def.gods[0] + 1));
      const deities: Deity[] = [];
      const used = new Set<string>();
      for (let k = 0; k < Math.min(nGods, def.domains.length); k++) {
        let n = bank.proper(cul, r);
        for (let t = 0; t < 4 && used.has(n); t++) n = bank.proper(cul, r);
        used.add(n);
        if (fam === 'church' && k === 0) n = r() < 0.5 ? 'the One' : 'the Most High';
        if (fam === 'crescent' && k === 0) n = 'the Merciful';
        if (fam === 'church' && k >= 2) n = `Saint ${n}`;
        if (fam === 'spirits' && k > 0) n = def.domains[k].replace(/^the /, '').replace(/^./, (c) => c.toUpperCase());
        deities.push({ name: k === 1 && (fam === 'church' || fam === 'crescent') ? prophet : n, domain: def.domains[k] });
      }
      const tenets = [...def.tenets].sort(() => r() - 0.5).slice(0, 4);
      const age = def.age[0] + Math.floor(r() * (def.age[1] - def.age[0]));
      const home = seats[0] ?? { name: '', lon: 0, lat: 0 };
      f = {
        id: faiths.length, family: fam, name: uniqueName(def.name(prophet, r), ci), kind: def.kind, adherents: def.adherents(prophet, r), cultures: [],
        deities, head: { title: pick(r, def.head), seatName: home.name, lon: home.lon, lat: home.lat }, clergy: pick(r, def.clergy), temple: pick(r, def.temple),
        scripture: def.scripture(prophet, r), symbol: sym[0], charge: sym[1], tenets, holySites: [], sects: [], founded: Math.max(-2000, year - age),
      };
      faiths.push(f);
      if (def.shared) famOf.set(fam, f);
    }
    f.cultures.push(ci);
    ofCulture[ci] = f.id;
    // Each people of a shared faith has its own sect (the first is the mother church); others one or two.
    const sr = mulberry32(hashString(`${seed}#sect#${f.id}#${ci}`));
    const nSects = def.shared ? (f.sects.length === 0 ? 1 + (sr() < 0.4 ? 1 : 0) : 1) : (sr() < 0.35 ? 2 : 1);
    for (let k = 0; k < nSects; k++) {
      const origin = seats[Math.min(seats.length - 1, Math.floor(sr() * Math.min(4, seats.length)))] ?? { name: '', lon: 0, lat: 0 };
      const first = f.sects.length === 0;
      const tpl = first ? (def.shared ? pick(sr, def.sect.slice(0, 1)) : f.name) : pick(sr, def.sect.filter((t, i) => i > 0 || !def.shared));
      const name = first && !def.shared ? 'the orthodox faith' : tpl.replace('{N}', bank.proper(CULTURES[ci], sr));
      const founded = first ? f.founded : Math.round(f.founded + (year - f.founded) * (0.35 + 0.55 * sr()));
      f.sects.push({
        id: f.sects.length, name, originName: origin.name, lon: origin.lon, lat: origin.lat, founded, culture: ci,
        note: first ? 'the mother faith' : pick(sr, ['split over the nature of the prophet', 'broke away over the sale of pardons', 'follows a reforming preacher', 'rejects the authority of the head of the faith', 'keeps older rites in the old tongue', 'follows a mystic teacher', 'split over who should lead the faithful', 'holds that the end of days is near']),
      });
    }
  }
  // Theocracies seat the head of their faith; otherwise the largest city of the founding people does.
  for (const f of faiths) {
    const theo = units.filter((u) => u.gov === 'theocracy' && u.parent < 0 && f.cultures.includes(u.culture)).sort((a, b) => b.people - a.people)[0];
    if (theo) f.head = { ...f.head, seatName: theo.seatName, lon: theo.lon, lat: theo.lat };
    const r = mulberry32(hashString(`${seed}#holy#${f.id}`));
    const sites: HolySite[] = [];
    if (f.head.seatName) sites.push({ name: f.head.seatName, lon: f.head.lon, lat: f.head.lat, what: `seat of the ${f.head.title}` });
    for (const s of f.sects) if (s.originName && !sites.some((h) => h.name === s.originName)) sites.push({ name: s.originName, lon: s.lon, lat: s.lat, what: s.id === 0 ? 'where the faith was born' : `birthplace of ${s.name}` });
    const pool = f.cultures.flatMap((c) => seatsOf.get(c)?.slice(0, 12) ?? []);
    const WHAT = ['tomb of a great saint', 'shrine of a holy relic', 'site of a miracle', 'the great pilgrim temple', 'a holy spring', 'the oldest monastery', 'where the prophet preached'];
    for (let t = 0; t < 8 && sites.length < 4 && pool.length; t++) {
      const s = pick(r, pool);
      if (!sites.some((h) => h.name === s.name)) sites.push({ name: s.name, lon: s.lon, lat: s.lat, what: pick(r, WHAT) });
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
  return { faiths, ofCulture, converted, sectOf };
}
