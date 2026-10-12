import { type Rng } from '../gen/rng';

/**
 * Cultural traits, in the manner of Crusader Kings: an **ethos** (the culture's outlook), three
 * or four **traditions** (from where it lives and how it has lived) and **customs**. Traits are
 * not only flavour: they change what is generated. Their `mods` multiply the chances that the
 * political map, colonies, armies and trade use (see `CultureMods`).
 */

/** What a culture's lands are like (shares of its land), measured when the culture map is made. */
export interface CultureEnv {
  areaKm2: number;
  coast: number;
  high: number;
  forest: number;
  grass: number;
  desert: number;
  cold: number;
  hot: number;
  wet: number;
  jungle: number;
  river: number;
}

/** Multipliers traits apply (1 = no change). */
export interface CultureMods {
  cityState: number;
  republic: number;
  theocracy: number;
  empire: number;
  league: number;
  indepDuchy: number;
  seafaring: number;
  colonies: number;
  levy: number;
  cavalry: number;
  fleet: number;
  revenue: number;
  crafts: number;
}
export const NO_MODS: CultureMods = { cityState: 1, republic: 1, theocracy: 1, empire: 1, league: 1, indepDuchy: 1, seafaring: 1, colonies: 1, levy: 1, cavalry: 1, fleet: 1, revenue: 1, crafts: 1 };

interface TraitDef {
  name: string;
  text: string;
  /** What it does, for the culture window. */
  effect: string;
  mods: Partial<CultureMods>;
}

export const ETHOS: Record<string, TraitDef> = {
  bellicose: { name: 'Bellicose', text: 'Glory is won in war, and a ruler who keeps the peace too long is thought weak.', effect: 'Larger levies.', mods: { levy: 1.3 } },
  stoic: { name: 'Stoic', text: 'Hardship is borne without complaint; endurance is the first virtue.', effect: 'Somewhat larger levies; vassals rarely restless.', mods: { levy: 1.1 } },
  bureaucratic: { name: 'Bureaucratic', text: 'The realm runs on scribes, seals and examinations.', effect: 'Empires more likely; better revenue; fewer breakaway duchies.', mods: { empire: 1.5, revenue: 1.15, indepDuchy: 0.7 } },
  spiritual: { name: 'Spiritual', text: 'The gods are close at hand, and priests sit at every council.', effect: 'Theocracies far more likely.', mods: { theocracy: 2.4 } },
  courtly: { name: 'Courtly', text: 'Rank is won and lost at court, in manners, gifts and marriages.', effect: 'Better revenue; grand duchies a little more likely.', mods: { revenue: 1.1, indepDuchy: 1.25 } },
  communal: { name: 'Communal', text: 'Kin and community come before any lord.', effect: 'Leagues and confederacies more likely.', mods: { league: 1.7 } },
  egalitarian: { name: 'Egalitarian', text: 'No one is born above another; leaders are chosen, not crowned.', effect: 'Republics and city-states more likely.', mods: { republic: 1.9, cityState: 1.3 } },
  inventive: { name: 'Inventive', text: 'Craft and learning are honoured, and new ways are tried.', effect: 'More crafts to trade; better revenue.', mods: { crafts: 1.5, revenue: 1.1 } },
};

export const TRADITIONS: Record<string, TraitDef & { score: (e: CultureEnv, t: string, ethos: string) => number }> = {
  seafarers: { name: 'Seafarers', text: 'At home on the sea; every boy can handle a boat.', effect: 'Found more colonies; larger fleets.', mods: { seafaring: 1.6, colonies: 1.8, fleet: 1.8 }, score: (e, t) => e.coast * 4 + (['norse', 'southern', 'latin', 'anglo', 'japonic'].includes(t) ? 0.8 : 0) },
  horseLords: { name: 'Horse Lords', text: 'Born in the saddle; wealth is counted in horses.', effect: 'Most of their levies ride.', mods: { cavalry: 3, levy: 1.1 }, score: (e, t) => (e.grass > 0.35 ? e.grass * 1.4 : 0) + (t === 'steppe' ? 2.5 : 0) + (t === 'desert' ? 0.4 : 0) },
  mountaineers: { name: 'Mountaineers', text: 'Sure-footed in the high passes, and hard to dislodge from them.', effect: 'Larger levies in defence.', mods: { levy: 1.15 }, score: (e, t) => e.high * 5 + (t === 'dwarven' || t === 'highland' ? 1.5 : 0) },
  forestFolk: { name: 'Forest Folk', text: 'They know the ways of the deep woods, and the woods know them.', effect: 'At home in forests.', mods: {}, score: (e, t) => e.forest * 3 + (t === 'elvish' || t === 'woodland' ? 1.2 : 0) },
  desertWanderers: { name: 'Desert Wanderers', text: 'Caravans cross the sands by the stars and the wells.', effect: 'More trade.', mods: { revenue: 1.1 }, score: (e, t) => e.desert * 4 + (t === 'desert' ? 0.8 : 0) },
  jungleDwellers: { name: 'Jungle Dwellers', text: 'They thrive where others sicken, under the green roof.', effect: 'At home in jungles.', mods: {}, score: (e) => e.jungle * 4 },
  winterHardened: { name: 'Winter-Hardened', text: 'Long winters taught them patience and thrift.', effect: 'Larger levies.', mods: { levy: 1.1 }, score: (e) => (e.cold > 0.15 ? e.cold * 3.5 : 0) },
  riverFolk: { name: 'River Folk', text: 'Their towns follow the rivers, and the rivers carry their trade.', effect: 'More trade.', mods: { revenue: 1.1 }, score: (e) => e.river * 6 },
  cityBuilders: { name: 'City Builders', text: 'Proud of their streets, walls and markets.', effect: 'City-states more likely.', mods: { cityState: 1.6 }, score: (_e, t) => (['latin', 'southern', 'desert', 'sinic'].includes(t) ? 1.6 : 0.3) },
  merchantPrinces: { name: 'Merchant Princes', text: 'Wealth, not birth, buys a seat at the table.', effect: 'Republics and city-states more likely; better revenue.', mods: { republic: 1.7, cityState: 1.5, revenue: 1.15 }, score: (e, t, eth) => (eth === 'egalitarian' ? 1.2 : 0) + (['southern', 'latin'].includes(t) ? 1 : 0) + e.coast },
  legalists: { name: 'Legalists', text: 'Every right is written down, and every dispute goes to the courts.', effect: 'Empires more likely.', mods: { empire: 1.25 }, score: (_e, t, eth) => (eth === 'bureaucratic' ? 1.5 : 0.2) + (['latin', 'sinic', 'koreanic'].includes(t) ? 0.8 : 0) },
  warriorCulture: { name: 'Warrior Culture', text: 'Every free man bears arms, and boys train from childhood.', effect: 'Larger levies.', mods: { levy: 1.25 }, score: (_e, t, eth) => (eth === 'bellicose' ? 1.4 : 0.2) + (['norse', 'steppe', 'japonic', 'celtic'].includes(t) ? 0.7 : 0) },
  clanTies: { name: 'Clan Ties', text: 'A person is their clan first; feuds and loyalties last for generations.', effect: 'Leagues more likely; fewer great kingdoms.', mods: { league: 1.4, indepDuchy: 1.15 }, score: (_e, t, eth) => (eth === 'communal' ? 1.3 : 0.2) + (['celtic', 'steppe', 'woodland', 'dwarven'].includes(t) ? 0.9 : 0) },
  monastic: { name: 'Monastic Learning', text: 'Monasteries keep the books, the schools and the old knowledge.', effect: 'Theocracies more likely.', mods: { theocracy: 1.4 }, score: (_e, t, eth) => (eth === 'spiritual' ? 1.1 : 0.2) + (['anglo', 'celtic', 'koreanic', 'sinic'].includes(t) ? 0.4 : 0) },
  masterCraftsmen: { name: 'Master Craftsmen', text: 'Their smiths, weavers and potters are famed far and wide.', effect: 'More crafts to trade.', mods: { crafts: 1.6 }, score: (_e, t, eth) => (eth === 'inventive' ? 1.2 : 0.2) + (['dwarven', 'sinic', 'japonic', 'desert'].includes(t) ? 0.8 : 0) },
  storytellers: { name: 'Storytellers', text: 'Bards and skalds keep the deeds of the ancestors alive.', effect: 'Flavour.', mods: {}, score: (_e, t) => (['celtic', 'norse', 'woodland', 'elvish'].includes(t) ? 0.9 : 0.3) },
  hospitality: { name: 'Sacred Hospitality', text: 'A guest under the roof is sacred; to harm one is the worst of crimes.', effect: 'Flavour.', mods: {}, score: (_e, t) => (['desert', 'steppe', 'southern', 'celtic'].includes(t) ? 0.8 : 0.25) },
  stargazers: { name: 'Stargazers', text: 'They read the heavens for omens and keep careful calendars.', effect: 'Flavour.', mods: {}, score: (_e, t) => (['elvish', 'jungle', 'sinic', 'highland', 'desert'].includes(t) ? 0.8 : 0.15) },
  deepDelvers: { name: 'Deep Delvers', text: 'Their halls go down into the roots of the mountains.', effect: 'More metals from their mountains.', mods: { crafts: 1.2 }, score: (e, t) => (t === 'dwarven' ? 2.5 : e.high * 1.5) },
  pastoralists: { name: 'Pastoralists', text: 'Herds of cattle and sheep are the measure of a family.', effect: 'Flavour.', mods: {}, score: (e) => e.grass * 1.2 },
  raiders: { name: 'Raiders', text: 'Young men win their fortune raiding the neighbours, by land or sea.', effect: 'Larger levies.', mods: { levy: 1.15, seafaring: 1.2 }, score: (e, t, eth) => (eth === 'bellicose' ? 0.9 : 0) + (['norse', 'steppe'].includes(t) ? 0.8 : 0) + e.coast * 0.5 },
};

const ETHOS_W: Record<string, Partial<Record<keyof typeof ETHOS, number>>> = {
  anglo: { courtly: 3, bellicose: 2, stoic: 1, bureaucratic: 1 }, norse: { bellicose: 4, stoic: 2, communal: 1 }, latin: { bureaucratic: 3, courtly: 2, inventive: 1 },
  celtic: { communal: 3, bellicose: 2, spiritual: 1 }, elvish: { spiritual: 2, courtly: 2, inventive: 1 }, desert: { spiritual: 3, bureaucratic: 2, courtly: 1 },
  slavic: { stoic: 3, communal: 2, bellicose: 1 }, dwarven: { stoic: 3, inventive: 3 }, southern: { inventive: 3, egalitarian: 2, courtly: 1 },
  steppe: { bellicose: 3, communal: 2, egalitarian: 1 }, jungle: { spiritual: 3, bellicose: 2 }, sinic: { bureaucratic: 4, inventive: 2 },
  japonic: { courtly: 2, stoic: 2, bellicose: 2 }, koreanic: { bureaucratic: 3, inventive: 2, stoic: 1 }, woodland: { communal: 3, egalitarian: 2, spiritual: 1 },
  highland: { bureaucratic: 3, spiritual: 2 },
};

export interface Customs {
  martial: string;
  marriage: string;
  architecture: string;
  dress: string;
  food: string;
  festivals: { native: string; english: string }[];
}

const ARCH: Record<string, string> = {
  anglo: 'timber-framed halls, stone keeps and square church towers', norse: 'turf-roofed longhouses and carved stave temples', latin: 'colonnades, domes, arcaded squares and red-tiled roofs',
  celtic: 'roundhouses, hill forts and high stone crosses', elvish: 'pale towers and halls grown among living trees', desert: 'courtyard houses, domes, minarets and walled gardens',
  slavic: 'log houses, onion domes and timber stockades', dwarven: 'great halls cut into the living rock behind iron doors', southern: 'whitewashed houses, marble temples and theatres',
  steppe: 'felt tents, and a few mud-brick towns on the caravan roads', jungle: 'stepped pyramids, plazas and plastered palaces', sinic: 'tiled roofs with upturned eaves, walled compounds and pagodas',
  japonic: 'wooden halls with deep eaves, castles on stone bases and shrine gates', koreanic: 'tiled hanok houses with heated floors and mountain fortresses', woodland: 'bark longhouses inside palisades',
  highland: 'fitted stone walls without mortar, terraces and roads with rope bridges',
};
const DRESS: Record<string, string> = {
  anglo: 'wool tunics and hooded cloaks', norse: 'wool and fur, with brooches and arm-rings', latin: 'linen and draped wool, dyed bright for the rich', celtic: 'checked wool plaids and gold torcs',
  elvish: 'fine flowing silks in leaf and moon colours', desert: 'loose robes, turbans and veils against the sun', slavic: 'embroidered linen shirts and fur hats', dwarven: 'leather aprons, heavy boots and braided beards',
  southern: 'draped chitons and sandals', steppe: 'felt coats, boots and fur-lined hats', jungle: 'cotton mantles, feathered headdresses and jade', sinic: 'long silk robes with wide sleeves',
  japonic: 'layered robes tied with sashes', koreanic: 'flowing robes and tall horsehair hats', woodland: 'buckskin, beadwork and feathers', highland: 'woven tunics and alpaca cloaks in bright stripes',
};
const FESTIVALS: { en: string; words: string[]; when: (e: CultureEnv, traditions: string[]) => number }[] = [
  { en: 'the Feast of First Snow', words: ['snow', 'feast'], when: (e) => e.cold * 3 },
  { en: 'Midsummer Fires', words: ['summer', 'fire'], when: () => 0.6 },
  { en: 'the Night of Lanterns', words: ['night', 'light'], when: () => 0.5 },
  { en: 'the Harvest Moon', words: ['harvest', 'moon'], when: (e) => e.grass + 0.3 },
  { en: "the Ancestors' Night", words: ['ancestor', 'night'], when: () => 0.5 },
  { en: 'the Running of the Horses', words: ['horse', 'race'], when: (_e, t) => (t.includes('horseLords') ? 3 : 0.1) },
  { en: 'the Blessing of the Boats', words: ['boat', 'blessing'], when: (e, t) => (t.includes('seafarers') ? 3 : e.coast) },
  { en: 'Plough Day', words: ['plough', 'day'], when: (e) => e.grass },
  { en: 'the Return of the Sun', words: ['sun', 'return'], when: (e) => e.cold * 2 + 0.2 },
  { en: 'the Festival of Flowers', words: ['flower', 'feast'], when: (e) => (e.hot + e.forest) * 0.8 },
  { en: 'the Rain Dance', words: ['rain', 'dance'], when: (e) => e.desert * 2 + e.hot },
  { en: 'the Kings\' Games', words: ['king', 'game'], when: () => 0.4 },
];

const pick = <T>(rnd: Rng, a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const weighted = (rnd: Rng, a: [string, number][]): string => {
  const tot = a.reduce((s, x) => s + x[1], 0);
  let r = rnd() * tot;
  for (const [v, w] of a) if ((r -= w) < 0) return v;
  return a[a.length - 1][0];
};

export interface CultureTraits {
  ethos: string;
  traditions: string[];
  customs: Omit<Customs, 'festivals'> & { festivals: { en: string; words: string[] }[] };
  mods: CultureMods;
}

/** A culture's traits, from its template, its lands and chance. */
export function cultureTraits(t: string, env: CultureEnv, rnd: Rng, drift: number): CultureTraits {
  const ew = Object.entries(ETHOS_W[t] ?? { stoic: 1 }) as [string, number][];
  // A drifting world strays further from the template's outlook.
  const all = Object.keys(ETHOS).map((k) => [k, (ew.find((x) => x[0] === k)?.[1] ?? 0) + 0.25 + drift * 1.5] as [string, number]);
  const ethos = weighted(rnd, all);
  const scored = Object.entries(TRADITIONS).map(([k, d]) => [k, d.score(env, t, ethos) * (0.6 + 0.8 * rnd())] as [string, number]).sort((a, b) => b[1] - a[1]);
  const n = 3 + (rnd() < 0.45 ? 1 : 0);
  const traditions = scored.slice(0, n).filter(([, s]) => s > 0.25).map(([k]) => k);
  const mods: CultureMods = { ...NO_MODS };
  for (const k of [ethos, ...traditions]) {
    const m = (ETHOS[k] ?? TRADITIONS[k]).mods;
    for (const [key, v] of Object.entries(m)) mods[key as keyof CultureMods] *= v as number;
  }
  const equal = { elvish: 0.7, dwarven: 0.4, woodland: 0.5, steppe: 0.25, celtic: 0.3, norse: 0.2 }[t] ?? 0.08;
  const martial = rnd() < equal ? 'Men and women alike may bear arms and lead' : rnd() < 0.04 ? 'Only women bear arms; men keep the hearth' : 'Only men bear arms and lead armies';
  const marriage = ['desert', 'steppe', 'jungle', 'highland', 'sinic'].includes(t) && rnd() < 0.6 ? 'Rulers may take several wives' : rnd() < 0.15 ? 'Marriages are arranged by the clan elders' : 'One spouse, for life';
  const FOOD: Record<string, string> = {
    desert: 'flatbread, lamb, rice, dates and spiced coffee', steppe: "mutton, mare's milk, curds and tea", sinic: 'rice, noodles, pork, greens and tea', japonic: 'rice, fish, pickles, miso and tea',
    koreanic: 'rice, pickled cabbage, fish and barley tea', jungle: 'maize, beans, squash, chillies and cacao', highland: 'potatoes, maize, quinoa and llama meat', woodland: 'maize, beans, squash, venison and fish',
    southern: 'bread, olives, fish, wine and cheese', latin: 'bread, olives, wine, cheese and pork', elvish: 'fruit, nuts, honeyed bread and wine', dwarven: 'roast meat, dark bread, mushrooms and ale',
  };
  const food = FOOD[t] ? FOOD[t] : env.desert > 0.3 ? 'dates, flatbread, goat and spiced lamb' : env.jungle > 0.3 ? 'maize, beans, chillies and cacao' : env.cold > 0.4 ? 'smoked fish, rye, dried meat and berries'
    : env.grass > 0.4 && t === 'steppe' ? 'mutton, mare\'s milk and curds' : ['sinic', 'japonic', 'koreanic'].includes(t) ? 'rice, fish, pickled vegetables and tea'
    : env.coast > 0.3 ? 'fish, bread, onions and ale' : env.hot > 0.3 ? 'bread, olives, wine and cheese' : 'bread, porridge, pork and ale';
  const fests = FESTIVALS.map((f) => [f, f.when(env, traditions) * (0.5 + rnd())] as const).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([f]) => ({ en: f.en, words: f.words }));
  void pick;
  return { ethos, traditions, customs: { martial, marriage, architecture: ARCH[t] ?? 'houses of wood and stone', dress: DRESS[t] ?? 'plain wool and linen', food, festivals: fests }, mods };
}
