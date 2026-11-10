import { hashString, mulberry32 } from '../gen/rng';
import type { Gov } from '../gen/politics';
import type { CityTheme } from '../lore/themes';
import { CULTURES } from '../names/cultures';
import { DMath } from '../dmath';
import { thousands } from '../format';

/**
 * A settlement's life as a roguelike would need it: who lives there (its people and its
 * minorities), and how clean, safe and prosperous it is, with the reasons why. Everything is
 * worked out from what the world already knows of the place (its size, site, walls, theme, realm
 * and wars), the same way every time.
 */

export interface TownCtx {
  seed: string;
  id: string;
  name: string;
  tier: string;
  /** A village's kind ('farming', 'fishing'...), or the town's ('tribal'). */
  kind?: string;
  population: number;
  coastal: boolean;
  river: boolean;
  walls: boolean;
  /** The people most of its folk belong to (index into CULTURES), and the others among them. */
  culture: number;
  minorities: { culture: number; share: number }[];
  theme?: CityTheme;
  holy?: boolean;
  atWar: boolean;
  gov: Gov | 'none';
  /** The seat of a duchy, kingdom or empire. */
  capital: boolean;
  /** Köppen class index at the site. */
  koppen: number;
  /** World roads that end here. */
  roads: number;
  university?: boolean;
  prison?: boolean;
  delve?: boolean;
  /** The realm's trade, where it has one. */
  economy?: { special: string[]; exports: string[]; imports: string[]; coin: string; word: string };
}

export type Grade = 0 | 1 | 2 | 3 | 4;
export interface Stat {
  /** 0 to 100. */
  value: number;
  grade: Grade;
  word: string;
  /** Why it stands where it does. */
  why: string[];
}

export interface TownStats {
  prosperity: Stat;
  sanitation: Stat;
  crime: Stat;
  /** The watch: how many keep order, and who they are. */
  watch: { men: number; text: string };
  /** Shares of the folk by means (destitute, poor, middling, comfortable, rich), summing to 1. */
  means: number[];
  /** The peoples of the place and their shares, the largest first. */
  peoples: { culture: number; people: string; share: number }[];
  /** A few things a visitor notices. */
  notes: string[];
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
const grade = (v: number): Grade => (v < 20 ? 0 : v < 40 ? 1 : v < 60 ? 2 : v < 80 ? 3 : 4);

const SAN_WORD = ['foul', 'squalid', 'middling', 'clean', 'spotless'];
const CRIME_WORD = ['law-abiding', 'quiet', 'middling', 'lawless', 'a den of thieves'];
const PROS_WORD = ['impoverished', 'struggling', 'getting by', 'thriving', 'wealthy'];

/** The share of minorities by size: cities draw folk from far and wide, villages hardly at all. */
export function minorityShare(tier: string, population: number, coastal: boolean): number {
  const base = tier === 'city' ? 0.18 + Math.min(0.14, population / 400000) : tier === 'town' ? 0.09 : 0.025;
  return base * (coastal ? 1.3 : 1);
}

export function townStats(t: TownCtx): TownStats {
  const r = mulberry32(hashString(`${t.seed}#town#${t.id}`));
  const lg = DMath.log10(Math.max(50, t.population));
  const hot = t.koppen <= 6 || (t.koppen >= 10 && t.koppen <= 13);
  const village = t.tier === 'village';

  // ---- Prosperity ------------------------------------------------------------------------------
  const pw: string[] = [];
  let p = 34 + lg * 5 + (r() - 0.5) * 12;
  if (t.coastal) { p += 8; pw.push('a harbour brings trade'); }
  else if (t.river) { p += 4; pw.push('river traffic brings trade'); }
  if (t.roads >= 3) { p += 6; pw.push(`${t.roads} roads meet here`); }
  else if (t.roads === 0 && !village) { p -= 6; pw.push('no great road reaches it'); }
  if (t.capital) { p += 8; pw.push('a seat of government'); }
  const th: Partial<Record<CityTheme, [number, string]>> = {
    merchant: [15, 'a merchant city of banks and trading houses'], forge: [8, 'its forges and foundries'], mages: [5, 'scholars and their patrons'],
    pilgrim: [8, 'pilgrims spend freely'], thieves: [-5, 'thieves bleed its trade'], rebuilt: [-8, 'still rebuilding after its ruin'], fortress: [-2, 'a garrison town'],
    canal: [6, 'canals carry goods to every door'],
  };
  if (t.theme && th[t.theme]) {
    p += th[t.theme]![0];
    pw.push(th[t.theme]![1]);
  }
  if (t.university) { p += 4; pw.push('a university'); }
  if (t.atWar) { p -= 10; pw.push('its realm is at war'); }
  if (t.economy?.word === 'very rich' || t.economy?.word === 'rich') { p += t.economy.word === 'rich' ? 4 : 7; pw.push(`a ${t.economy.word} realm`); }
  if (t.economy?.word === 'poor') { p -= 5; pw.push('a poor realm'); }
  if (t.kind === 'tribal') p -= 10;
  const prosperity = clamp(p);

  // ---- Sanitation ------------------------------------------------------------------------------
  const sw: string[] = [];
  let s = 74 - lg * 7 + (prosperity - 50) * 0.25 + (r() - 0.5) * 10;
  if (!village && t.kind !== 'tribal') { s += t.tier === 'city' ? 8 : 5; sw.push(t.tier === 'city' ? 'sewers under the main streets' : 'a sewer under the high street'); }
  else sw.push('cesspits and open ditches');
  if (t.walls && t.tier === 'city') { s -= 6; sw.push('crowded within its walls'); }
  if (hot) { s -= 7; sw.push('the heat breeds flies and fevers'); }
  if (t.theme === 'canal') { s -= 4; sw.push('the canals are its drains'); }
  if (t.theme === 'pilgrim' || t.holy) { s -= 5; sw.push('crowds of pilgrims'); }
  if (t.river || t.coastal) { s += 4; sw.push('waste goes to the water'); }
  if (t.population > 30000) sw.push('night-soil carts at dawn');
  if (t.delve) { s += 6; sw.push('dwarven drains cut through the rock'); }
  const sanitation = clamp(s);

  // ---- Crime -----------------------------------------------------------------------------------
  const cw: string[] = [];
  let c = 6 + lg * 8 + (55 - prosperity) * 0.3 + (r() - 0.5) * 12;
  if (t.theme === 'thieves') { c += 30; cw.push('a thieves\' guild rules its streets by night'); }
  if (t.coastal) { c += 6; cw.push('sailors and smugglers on the waterfront'); }
  if (t.atWar) { c += 8; cw.push('deserters and the hungry of war'); }
  if (t.theme === 'fortress') { c -= 12; cw.push('a strong garrison keeps order'); }
  if (t.gov === 'theocracy') { c -= 6; cw.push('the temple courts are harsh'); }
  if (t.gov === 'republic' || t.gov === 'city-state') { c -= 3; cw.push('a city watch answering to its council'); }
  if (t.prison) { c -= 4; cw.push('the gaol stands as a warning'); }
  if (t.theme === 'pilgrim') { c += 5; cw.push('cutpurses work the pilgrim crowds'); }
  if (prosperity < 35) cw.push('poverty drives men to theft');
  const crime = clamp(c);

  // ---- The watch, means and peoples ------------------------------------------------------------
  const men = village ? 0 : Math.max(2, Math.round((t.population / (t.theme === 'fortress' ? 180 : 320)) * (crime > 60 ? 1.2 : 1)));
  const watch = village
    ? { men: 0, text: 'No watch: the reeve and the neighbours keep the peace.' }
    : { men, text: `${thousands(men)} ${t.theme === 'fortress' ? 'soldiers of the garrison keep' : t.gov === 'theocracy' ? 'temple wardens keep' : 'watchmen keep'} the peace${crime > 70 ? ', and often look away' : ''}.` };
  // Means: a bell over the five classes, shifted by prosperity.
  const centre = (prosperity / 100) * 4;
  const raw = [0, 1, 2, 3, 4].map((k) => DMath.exp(-(DMath.pow(k - centre, 2)) / 1.6) * (k === 4 ? 0.35 : 1) * (k === 0 ? 0.8 : 1));
  const sum = raw.reduce((a, b) => a + b, 0);
  const means = raw.map((x) => x / sum);
  const peoples = [{ culture: t.culture, share: 1 - t.minorities.reduce((a, m) => a + m.share, 0) }, ...t.minorities]
    .map((x) => ({ ...x, people: CULTURES[x.culture]?.people ?? 'unknown folk' }))
    .sort((a, b) => b.share - a.share);

  const notes: string[] = [];
  if (sanitation < 30) notes.push('The stink reaches travellers before the gates do.');
  if (crime > 70) notes.push('Honest folk bar their doors at nightfall.');
  if (prosperity > 75) notes.push('Glazed windows and painted signs: money is made here.');
  if (prosperity < 30) notes.push('Empty shops and patched roofs.');
  return {
    prosperity: { value: prosperity, grade: grade(prosperity), word: PROS_WORD[grade(prosperity)], why: pw },
    sanitation: { value: sanitation, grade: grade(sanitation), word: SAN_WORD[grade(sanitation)], why: sw },
    crime: { value: crime, grade: grade(crime), word: CRIME_WORD[grade(crime)], why: cw },
    watch, means, peoples, notes,
  };
}
