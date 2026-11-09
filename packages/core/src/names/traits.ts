import { type Rng } from '../gen/rng';
import { BUNDLE, table } from './bundles';

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
  /** How many other peoples and folk live among them (minorities in their realms). */
  diversity: number;
}
export const NO_MODS: CultureMods = { cityState: 1, republic: 1, theocracy: 1, empire: 1, league: 1, indepDuchy: 1, seafaring: 1, colonies: 1, levy: 1, cavalry: 1, fleet: 1, revenue: 1, crafts: 1, diversity: 1 };

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

/** A template's own term in a tradition's score (its bundle's `affinity`). */
const aff = (t: string, k: string): number | undefined => BUNDLE.get(t)?.affinity?.[k];

export const TRADITIONS: Record<string, TraitDef & { score: (e: CultureEnv, t: string, ethos: string) => number }> = {
  seafarers: { name: 'Seafarers', text: 'At home on the sea; every boy can handle a boat.', effect: 'Found more colonies; larger fleets.', mods: { seafaring: 1.6, colonies: 1.8, fleet: 1.8 }, score: (e, t) => e.coast * 4 + (aff(t, 'seafarers') ?? 0) },
  horseLords: { name: 'Horse Lords', text: 'Born in the saddle; wealth is counted in horses.', effect: 'Most of their levies ride.', mods: { cavalry: 3, levy: 1.1 }, score: (e, t) => (e.grass > 0.35 ? e.grass * 1.4 : 0) + (aff(t, 'horseLords') ?? 0) },
  mountaineers: { name: 'Mountaineers', text: 'Sure-footed in the high passes, and hard to dislodge from them.', effect: 'Larger levies in defence.', mods: { levy: 1.15 }, score: (e, t) => e.high * 5 + (aff(t, 'mountaineers') ?? 0) },
  forestFolk: { name: 'Forest Folk', text: 'They know the ways of the deep woods, and the woods know them.', effect: 'At home in forests.', mods: {}, score: (e, t) => e.forest * 3 + (aff(t, 'forestFolk') ?? 0) },
  desertWanderers: { name: 'Desert Wanderers', text: 'Caravans cross the sands by the stars and the wells.', effect: 'More trade.', mods: { revenue: 1.1 }, score: (e, t) => e.desert * 4 + (aff(t, 'desertWanderers') ?? 0) },
  jungleDwellers: { name: 'Jungle Dwellers', text: 'They thrive where others sicken, under the green roof.', effect: 'At home in jungles.', mods: {}, score: (e) => e.jungle * 4 },
  winterHardened: { name: 'Winter-Hardened', text: 'Long winters taught them patience and thrift.', effect: 'Larger levies.', mods: { levy: 1.1 }, score: (e) => (e.cold > 0.15 ? e.cold * 3.5 : 0) },
  riverFolk: { name: 'River Folk', text: 'Their towns follow the rivers, and the rivers carry their trade.', effect: 'More trade.', mods: { revenue: 1.1 }, score: (e) => e.river * 6 },
  cityBuilders: { name: 'City Builders', text: 'Proud of their streets, walls and markets.', effect: 'City-states more likely.', mods: { cityState: 1.6 }, score: (_e, t) => aff(t, 'cityBuilders') ?? 0.3 },
  merchantPrinces: { name: 'Merchant Princes', text: 'Wealth, not birth, buys a seat at the table.', effect: 'Republics and city-states more likely; better revenue.', mods: { republic: 1.7, cityState: 1.5, revenue: 1.15 }, score: (e, t, eth) => (eth === 'egalitarian' ? 1.2 : 0) + (aff(t, 'merchantPrinces') ?? 0) + e.coast },
  legalists: { name: 'Legalists', text: 'Every right is written down, and every dispute goes to the courts.', effect: 'Empires more likely.', mods: { empire: 1.25 }, score: (_e, t, eth) => (eth === 'bureaucratic' ? 1.5 : 0.2) + (aff(t, 'legalists') ?? 0) },
  warriorCulture: { name: 'Warrior Culture', text: 'Every free man bears arms, and boys train from childhood.', effect: 'Larger levies.', mods: { levy: 1.25 }, score: (_e, t, eth) => (eth === 'bellicose' ? 1.4 : 0.2) + (aff(t, 'warriorCulture') ?? 0) },
  clanTies: { name: 'Clan Ties', text: 'A person is their clan first; feuds and loyalties last for generations.', effect: 'Leagues more likely; fewer great kingdoms.', mods: { league: 1.4, indepDuchy: 1.15 }, score: (_e, t, eth) => (eth === 'communal' ? 1.3 : 0.2) + (aff(t, 'clanTies') ?? 0) },
  monastic: { name: 'Monastic Learning', text: 'Monasteries keep the books, the schools and the old knowledge.', effect: 'Theocracies more likely.', mods: { theocracy: 1.4 }, score: (_e, t, eth) => (eth === 'spiritual' ? 1.1 : 0.2) + (aff(t, 'monastic') ?? 0) },
  masterCraftsmen: { name: 'Master Craftsmen', text: 'Their smiths, weavers and potters are famed far and wide.', effect: 'More crafts to trade.', mods: { crafts: 1.6 }, score: (_e, t, eth) => (eth === 'inventive' ? 1.2 : 0.2) + (aff(t, 'masterCraftsmen') ?? 0) },
  storytellers: { name: 'Storytellers', text: 'Bards and skalds keep the deeds of the ancestors alive.', effect: 'Flavour.', mods: {}, score: (_e, t) => aff(t, 'storytellers') ?? 0.3 },
  hospitality: { name: 'Sacred Hospitality', text: 'A guest under the roof is sacred; to harm one is the worst of crimes.', effect: 'Flavour.', mods: {}, score: (_e, t) => aff(t, 'hospitality') ?? 0.25 },
  stargazers: { name: 'Stargazers', text: 'They read the heavens for omens and keep careful calendars.', effect: 'Flavour.', mods: {}, score: (_e, t) => aff(t, 'stargazers') ?? 0.15 },
  deepDelvers: { name: 'Deep Delvers', text: 'Their halls go down into the roots of the mountains.', effect: 'More metals from their mountains.', mods: { crafts: 1.2 }, score: (e, t) => aff(t, 'deepDelvers') ?? e.high * 1.5 },
  pastoralists: { name: 'Pastoralists', text: 'Herds of cattle and sheep are the measure of a family.', effect: 'Flavour.', mods: {}, score: (e) => e.grass * 1.2 },
  xenophile: {
    name: 'Cosmopolitan', text: 'Strangers are welcome; foreign peoples, faiths and goods fill their towns.', effect: 'Many other peoples and folk live among them; warmer relations with other peoples; better trade.',
    mods: { diversity: 3, revenue: 1.05 },
    score: (e, t, eth) => e.coast * 1.2 + e.river * 2 + (eth === 'egalitarian' || eth === 'inventive' || eth === 'courtly' ? 0.5 : 0) + (BUNDLE.get(t)?.traditions?.xenophile ?? 0) + (aff(t, 'xenophile') ?? 0),
  },
  xenophobe: {
    name: 'Insular', text: 'Outsiders are distrusted; foreigners may trade at the borders but not settle.', effect: 'Few other peoples live among them; cooler relations with other peoples.',
    mods: { diversity: 0.15 },
    score: (e, t, eth) => (e.high + e.cold + e.desert + e.jungle) * 0.9 + (eth === 'bellicose' || eth === 'stoic' || eth === 'spiritual' ? 0.4 : 0) + (BUNDLE.get(t)?.traditions?.xenophobe ?? 0) + (aff(t, 'xenophobe') ?? 0),
  },
  raiders: { name: 'Raiders', text: 'Young men win their fortune raiding the neighbours, by land or sea.', effect: 'Larger levies.', mods: { levy: 1.15, seafaring: 1.2 }, score: (e, t, eth) => (eth === 'bellicose' ? 0.9 : 0) + (aff(t, 'raiders') ?? 0) + e.coast * 0.5 },
};

const ETHOS_W = table((b) => b.ethos as Partial<Record<keyof typeof ETHOS, number>>);

export interface Customs {
  martial: string;
  marriage: string;
  architecture: string;
  dress: string;
  food: string;
  festivals: { native: string; english: string }[];
}

const ARCH = table((b) => b.architecture);
const DRESS = table((b) => b.dress);
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
  const bonus = BUNDLE.get(t)?.traditions ?? {};
  const scored = Object.entries(TRADITIONS).map(([k, d]) => [k, (d.score(env, t, ethos) + (k === 'xenophile' || k === 'xenophobe' ? 0 : bonus[k] ?? 0)) * (0.6 + 0.8 * rnd())] as [string, number]).sort((a, b) => b[1] - a[1]);
  const n = 3 + (rnd() < 0.45 ? 1 : 0);
  // A people is open to strangers or wary of them, not both.
  const top = scored.slice(0, n + 1).filter(([, s]) => s > 0.25).map(([k]) => k);
  const xeno = top.filter((k) => k === 'xenophile' || k === 'xenophobe');
  const traditions = top.filter((k) => !(xeno.length > 1 && k === xeno[1])).slice(0, n);
  const mods: CultureMods = { ...NO_MODS };
  for (const k of [ethos, ...traditions]) {
    const m = (ETHOS[k] ?? TRADITIONS[k]).mods;
    for (const [key, v] of Object.entries(m)) mods[key as keyof CultureMods] *= v as number;
  }
  const b = BUNDLE.get(t);
  const equal = b?.equalArms ?? 0.08;
  const martial = rnd() < equal ? 'Men and women alike may bear arms and lead' : rnd() < 0.04 ? 'Only women bear arms; men keep the hearth' : 'Only men bear arms and lead armies';
  const marriage = b?.polygamy && rnd() < 0.6 ? 'Rulers may take several wives' : rnd() < 0.15 ? 'Marriages are arranged by the clan elders' : 'One spouse, for life';
  const food = b?.food ?? (env.desert > 0.3 ? 'dates, flatbread, goat and spiced lamb' : env.jungle > 0.3 ? 'maize, beans, chillies and cacao' : env.cold > 0.4 ? 'smoked fish, rye, dried meat and berries'
    : env.coast > 0.3 ? 'fish, bread, onions and ale' : env.hot > 0.3 ? 'bread, olives, wine and cheese' : 'bread, porridge, pork and ale');
  const fests = FESTIVALS.map((f) => [f, f.when(env, traditions) * (0.5 + rnd())] as const).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([f]) => ({ en: f.en, words: f.words }));
  void pick;
  return { ethos, traditions, customs: { martial, marriage, architecture: ARCH[t] ?? 'houses of wood and stone', dress: DRESS[t] ?? 'plain wool and linen', food, festivals: fests }, mods };
}
