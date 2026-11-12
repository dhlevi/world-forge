/**
 * Character creation (docs/design/creation.md). The player's choices are kept small and plain
 * (`Choices`: origin, standing, the cards, trait points, the occupation terms, the name and
 * look), and everything else is worked out from them and the seed by `resolve`: the family, the
 * traits, every skill, the terms' promotions and events, age, money, belongings, the biography
 * and what the character knows of the world. Changing an earlier choice re-runs the later steps
 * with the same seeds, so the character stays the same wherever nothing changed.
 *
 * `buildActor` makes the finished Actor.
 */
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import { Actor } from '../actor';
import {
  Body, History, Identity, Inventory, Knowledge, Mood, Pools, Skills, Traits,
  type Item, type KnowledgeData, type StandingId, type Tie, type TraitsData, type Wound,
} from '../components';
import { SENSES, TRAITS, TRAIT_BUDGET, TRAIT_MAX, TRAIT_MIN, TRAIT_SPREAD, PHYSICAL, type SenseId, type TraitId } from '../data/traits';
import { folkOf, LETTERED, TRADITION_SKILLS, type FolkDef } from '../data/folk';
import { STANDING, type ParentTrade, type StandingDef } from '../data/standing';
import { GEAR, GEAR_QTY, TRACK, TRACKS, type TrackCtx, type TrackDef, type TrackId } from '../data/occupations';
import { CARD, type FateCard, type Position } from '../data/cards';
import { pickEvent, SCAR_PARTS, WOUND_ANY, WOUND_HOW, type TermEventKind } from './events';
import type { Catalogue, CultureInfo, PersonName, RealmInfo, StartSite, WarInfo } from '../../worker/protocol';

export interface CardDraw {
  position: Position;
  card: string;
  reversed: boolean;
}

export interface TermPlan {
  track: TrackId;
  /** The craft or school chosen on entering. */
  choice?: string;
}

/** Everything the player decides. */
export interface Choices {
  seed: string;
  culture: number;
  homeId: string;
  female: boolean;
  standing: StandingId;
  /** Rerolls of the family. */
  family: number;
  /** The parents' trades, if chosen rather than drawn. */
  trades?: [string, string];
  spread: CardDraw[] | null;
  /** Cards redrawn (each costs a little luck). */
  redraws: number;
  /** Trait points spent (plus) or taken back (minus). */
  spend: Partial<Record<TraitId, number>>;
  terms: TermPlan[];
  /** Index into the names drawn for the culture and sex, or a name typed in. */
  name: number;
  customName?: string;
  look: { skin: number; hair: number; hairStyle: number; beard: number; build: number };
}

export interface CreationWorld {
  catalogue: Catalogue;
  starts: StartSite[];
  names: { male: PersonName[]; female: PersonName[] } | null;
}

export interface TermResult {
  plan: TermPlan;
  track: TrackDef;
  /** Rank held in this term. */
  rank: number;
  promoted: boolean;
  /** Age at the start of the term, and the world's year. */
  age: number;
  year: number;
  event: TermEventKind;
  text: string[];
  /** Why it could not be served (the track has closed since it was chosen), or null. */
  blocked: string | null;
  traitChanges: string[];
}

export interface FamilyResult {
  standing: StandingDef;
  fallen: boolean;
  father: { name: string; trade: ParentTrade; alive: boolean };
  mother: { name: string; trade: ParentTrade | null; alive: boolean };
  siblings: { name: string; female: boolean; older: boolean }[];
  literate: boolean;
}

export interface Resolved {
  choices: Choices;
  culture: CultureInfo;
  folk: FolkDef;
  home: StartSite;
  realm: RealmInfo | undefined;
  year: number;
  family: FamilyResult;
  cards: { draw: CardDraw; card: FateCard }[];
  /** Traits before any points are spent, and the room to move each. */
  base: Record<TraitId, number>;
  budget: number;
  spent: number;
  /** Traits after points and cards, before the terms. */
  start: Record<TraitId, number>;
  traits: TraitsData;
  skills: Skills;
  terms: TermResult[];
  ranks: Record<string, number>;
  age: number;
  name: PersonName;
  copper: number;
  items: Item[];
  ties: Tie[];
  wounds: Wound[];
  knowledge: KnowledgeData;
  look: {
    skin: [string, string]; hair: [string, string]; hairStyle: string; beard: string; heightCm: number; weightKg: number; build: string;
    hairStyles: string[]; beards: string[];
  };
  biography: { age: number; text: string }[];
  omen?: string;
  /** The track a Path card leans toward. */
  path?: TrackId;
}

const rngOf = (seed: string, tag: string) => mulberry32(hashString(`${seed}|${tag}`));
const pick = <T>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];
const between = (r: () => number, lo: number, hi: number) => Math.round(lo + r() * (hi - lo));
const clampT = (v: number) => Math.max(1, Math.min(20, v));
const a = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);
const kmBetween = (p: { lon: number; lat: number }, q: { lon: number; lat: number }) => {
  const dl = ((((q.lon - p.lon) % 360) + 540) % 360) - 180;
  return Math.hypot(dl * 111.32 * Math.cos((((p.lat + q.lat) / 2) * Math.PI) / 180), (q.lat - p.lat) * 110.57);
};

/** What a track is called when it is left ("leaving the army"). */
const LEAVING: Record<TrackId, string> = {
  military: 'the army', civil: 'service', religion: 'the cloister', academia: 'the schools', trades: 'trading', craft: 'the workshop', outlaw: 'the outlaw life',
  thief: 'the streets', woodland: 'the woods', seafaring: 'the sea', performance: 'the stage', healing: 'the healer\'s work', farming: 'the land', magic: 'the study of magic',
};

/** A fresh set of choices for a culture and home, with everything else left to the seed. */
export function newChoices(seed: string, culture: number, homeId: string, female: boolean, standing: StandingId = 'peasant'): Choices {
  return {
    seed, culture, homeId, female, standing, family: 0, spread: null, redraws: 0, spend: {}, terms: [], name: 0,
    look: { skin: 0, hair: 0, hairStyle: 0, beard: 0, build: 0 },
  };
}

/** Whether a track is open now, and the rank a term in it would be. */
export interface TrackOption {
  track: TrackDef;
  reason: string | null;
  rank: number;
}

export function trackOptions(r: Resolved): TrackOption[] {
  const ctx = ctxOf(r, r.traits.traits, r.ranks);
  return TRACKS.map((t) => {
    const cur = r.ranks[t.id];
    return { track: t, reason: t.open?.(ctx) ?? null, rank: cur === undefined ? 0 : cur };
  });
}

function ctxOf(r: Pick<Resolved, 'family' | 'home' | 'culture' | 'skills' | 'choices'>, traits: Record<TraitId, number>, ranks: Record<string, number>): TrackCtx {
  const native = r.skills.d.languages[String(r.culture.index)];
  return {
    standing: r.family.standing.id,
    traits,
    literate: (native?.read ?? 0) >= 20,
    coastal: !!r.home.coastal,
    seafaringCulture: r.culture.seafaring,
    homeTier: r.home.tier,
    ranks,
    parentTrades: [r.family.father.trade.name, r.family.mother.trade?.name ?? ''],
  };
}

/** Works out the whole character from the choices. */
export function resolve(ch: Choices, w: CreationWorld): Resolved {
  const culture = w.catalogue.cultures.find((c) => c.index === ch.culture) ?? w.catalogue.cultures[0];
  const home = w.starts.find((s) => s.id === ch.homeId) ?? w.starts[0];
  const realm = w.catalogue.realms.find((x) => x.id === home.realmId);
  const folk = folkOf(culture.folk);
  const year = w.catalogue.year;
  const realmName = home.realm ?? home.name;
  const faith = culture.faith ?? 'the old ways';
  const region = home.region ?? realmName;

  // ---- Names --------------------------------------------------------------------------------
  const pool = w.names ?? { male: [], female: [] };
  const nameAt = (female: boolean, i: number): PersonName => {
    const list = female ? pool.female : pool.male;
    return list.length ? list[i % list.length] : { given: female ? 'Anna' : 'Hal', full: female ? 'Anna' : 'Hal' };
  };
  // The player's name is chosen from the first eight; the family and the people of their life
  // are named from further on, never with the player's own given name.
  const playerGiven = (ch.customName?.trim() ? ch.customName.trim().split(/\s+/)[0] : nameAt(ch.female, ch.name).given);
  const given = (female: boolean, i: number) => {
    for (let k = 0; k < 4; k++) {
      const n = nameAt(female, i + k * 7).given;
      if (n !== playerGiven) return n;
    }
    return nameAt(female, i).given;
  };
  let nameNo = 16;
  const nextName = (female: boolean) => given(female, nameNo++);
  const own = ch.customName?.trim() ? { given: ch.customName.trim().split(/\s+/)[0], full: ch.customName.trim() } : nameAt(ch.female, ch.name);

  // ---- The cards ----------------------------------------------------------------------------
  const cards = (ch.spread ?? []).map((d) => ({ draw: d, card: CARD.get(d.card)! })).filter((c) => c.card);
  const cardAt = (p: Position) => cards.find((c) => c.draw.position === p);
  const birth = cardAt('birth'), hearth = cardAt('hearth'), path = cardAt('path'), omen = cardAt('omen');

  // ---- Family -------------------------------------------------------------------------------
  const fr = rngOf(ch.seed, `family${ch.family}`);
  const standing = STANDING.get(ch.standing)!;
  const fallen = !!birth?.draw.reversed;
  const tradeByName = (n: string) => standing.trades.find((t) => t.name === n);
  const fatherTrade = (ch.trades && tradeByName(ch.trades[0])) || pick(fr, standing.trades.filter((t) => t.who !== 'f'));
  const motherKeeps = fr() < 0.4;
  const motherPick = pick(fr, standing.trades.filter((t) => t.who !== 'm'));
  const motherTrade = ch.trades ? (tradeByName(ch.trades[1]) ?? null) : motherKeeps ? null : motherPick;
  let fatherAlive = fr() < 0.8, motherAlive = fr() < 0.82;
  if (hearth && !hearth.draw.reversed) fatherAlive = motherAlive = true;
  if (hearth?.draw.reversed) {
    if (fr() < 0.5) fatherAlive = false;
    else motherAlive = false;
  }
  const nSib = Math.floor(fr() * fr() * 6);
  const siblings = Array.from({ length: nSib }, (_, i) => {
    const female = fr() < 0.5;
    return { name: given(female, 10 + i), female, older: fr() < 0.5 };
  });
  const lettered = LETTERED.has(culture.ethos) || culture.traditions.some((t) => LETTERED.has(t));
  const literate = fr() < Math.min(0.97, standing.literacy + (lettered ? 0.2 : 0));
  const family: FamilyResult = {
    standing, fallen,
    father: { name: given(false, 8), trade: fatherTrade, alive: fatherAlive },
    mother: { name: given(true, 9), trade: motherTrade, alive: motherAlive },
    siblings, literate,
  };

  // ---- Traits -------------------------------------------------------------------------------
  const base = Object.fromEntries(TRAITS.map((t) => [t, clampT(10 + (folk.traits[t] ?? 0))])) as Record<TraitId, number>;
  const cardBump = Object.fromEntries(TRAITS.map((t) => [t, 0])) as Record<TraitId, number>;
  if (hearth) cardBump[hearth.draw.reversed ? 'willpower' : hearth.card.trait] += 1;
  if (omen && !omen.draw.reversed) cardBump[omen.card.trait] += 1;
  const budget = TRAIT_BUDGET + standing.budget;
  let spent = 0;
  const startTraits = { ...base };
  for (const t of TRAITS) {
    const s = Math.max(-TRAIT_SPREAD, Math.min(TRAIT_SPREAD, ch.spend[t] ?? 0));
    startTraits[t] = Math.max(TRAIT_MIN, Math.min(TRAIT_MAX, base[t] + s)) + cardBump[t];
    spent += s;
  }
  const senses = Object.fromEntries(SENSES.map((s) => [s, clampT(10 + (folk.traits[s] ?? 0))])) as Record<SenseId, number>;
  const luckRest = Math.max(20, Math.min(80, (omen ? (omen.draw.reversed ? 40 : 60) : 50) - ch.redraws * 3));
  const traitsData: TraitsData = { traits: { ...startTraits }, senses, luck: luckRest, luckRest };

  // ---- Skills from birth and upbringing -----------------------------------------------------
  const temp = new Actor('person', 0);
  const T = temp.add(new Traits(traitsData));
  const skills = temp.add(new Skills(Skills.empty()));
  const add = (rec: Record<string, number>) => {
    for (const [k, v] of Object.entries(rec)) skills.gain(k, v);
  };
  add(folk.skills);
  for (const t of [culture.ethos, ...culture.traditions]) add(TRADITION_SKILLS[t] ?? {});
  add(standing.skills);
  skills.gain(fatherTrade.skill, 8);
  if (motherTrade) skills.gain(motherTrade.skill, 8);
  skills.language(String(culture.index), culture.name, 100, literate ? 25 + Math.round(fr() * 15) : 0);
  skills.know('history', realmName, 5 + standing.history);
  skills.know('law', realmName, 3 + standing.law + (culture.traditions.includes('legalists') ? 10 : 0));
  skills.know('theology', faith, 8 + (standing.id === 'clergy' ? 12 : 0) + (culture.ethos === 'spiritual' ? 5 : 0));
  skills.know('nature', region, 12 + (standing.id === 'peasant' ? 5 : 0));

  // ---- The terms ----------------------------------------------------------------------------
  const ar = rngOf(ch.seed, 'age');
  const firstAge = folk.adult + Math.floor(ar() * 3);
  const age = firstAge + ch.terms.length * folk.termYears;
  const yearAtAge = (x: number) => year - (age - x);
  const ranks: Record<string, number> = {};
  const terms: TermResult[] = [];
  const ties: Tie[] = [];
  const wounds: Wound[] = [];
  let copper = between(fr, standing.money[0], standing.money[1]) * (fallen ? 0.4 : 1);
  if (fallen) ties.push({ kind: 'debt', text: 'The family\'s debts, which brought it low, are not yet paid.' });
  if (!fatherAlive) ties.push({ kind: 'parent', name: family.father.name, text: `Your father, ${family.father.name}, is dead.`, alive: false });
  else ties.push({ kind: 'parent', name: family.father.name, text: `Your father, ${family.father.name}, ${a(fatherTrade.name)}.`, alive: true });
  if (!motherAlive) ties.push({ kind: 'parent', name: family.mother.name, text: `Your mother, ${family.mother.name}, is dead.`, alive: false });
  else ties.push({ kind: 'parent', name: family.mother.name, text: `Your mother, ${family.mother.name}${motherTrade ? `, ${a(motherTrade.name)}` : ''}.`, alive: true });
  for (const s of siblings) ties.push({ kind: 'sibling', name: s.name, text: `Your ${s.older ? 'elder' : 'younger'} ${s.female ? 'sister' : 'brother'}, ${s.name}.`, alive: true });
  if (hearth?.draw.reversed) ties.push({ kind: 'feud', text: 'A feud with another family of your home, over a death neither side forgives.' });
  if (hearth && !hearth.draw.reversed && siblings.length) ties.push({ kind: 'friend', name: siblings[0].name, text: `${siblings[0].name} has always stood by you.` });

  const learnRate = () => 0.75 + T.d.traits.intelligence / 40;
  const nativeKey = String(culture.index);
  const choiceSkills = (t: TrackDef, plan: TermPlan) => t.choice?.options.find((o) => o.id === plan.choice)?.skills ?? t.choice?.options[0].skills ?? [];
  const parents = { father: fatherAlive, mother: motherAlive };

  ch.terms.forEach((plan, i) => {
    const t = TRACK.get(plan.track)!;
    const tr = rngOf(ch.seed, `term${i}:${plan.track}`);
    const startAge = firstAge + i * folk.termYears;
    const res: TermResult = { plan, track: t, rank: 0, promoted: false, age: startAge, year: yearAtAge(startAge), event: 'quiet', text: [], blocked: null, traitChanges: [] };
    terms.push(res);
    const ctx = ctxOf({ family, home, culture, skills, choices: ch }, T.d.traits, ranks);
    const closed = ranks[t.id] === undefined ? (t.open?.(ctx) ?? null) : null;
    if (closed) {
      res.blocked = closed;
      res.text.push(`The ${t.name.toLowerCase()} would not have you: ${closed}`);
      return;
    }
    // Entry, or a try for promotion.
    let rank = ranks[t.id];
    if (rank === undefined) rank = 0;
    else if (rank < t.ranks.length - 1 && !t.gate?.(ctx, rank + 1)) {
      const bonus = (t.promote.reduce((s, x) => s + T.d.traits[x], 0) / t.promote.length - 10) / 2 + (luckRest - 50) / 25;
      if (tr() * 20 + 1 + bonus >= 9 + 2 * rank) {
        rank++;
        res.promoted = true;
      }
    }
    ranks[t.id] = rank;
    res.rank = rank;

    // What the term teaches.
    const parts = t.skills.filter((s) => (s.from ?? 0) <= rank && (s.to ?? 99) >= rank);
    const wsum = parts.reduce((s, x) => s + x.w, 0) || 1;
    // A term teaches more the longer it is (the long-lived serve longer terms).
    const pts = 24 * learnRate() * Math.sqrt(folk.termYears / 4);
    for (const s of parts) {
      const amt = (pts * s.w) / wsum;
      if (s.id === 'craft' || s.id === 'school') {
        const cs = choiceSkills(t, plan);
        cs.forEach((id, k) => {
          if (k === 0) skills.gain(id, amt);
          else if (rank >= 1) skills.gain(id, amt * 0.5);
        });
      } else if (s.id === 'literacy') {
        const L = skills.d.languages[nativeKey];
        L.read = Math.min(100, Math.round(L.read + amt * 1.6));
      } else if (s.id.startsWith('know:')) {
        const kind = s.id.slice(5) as 'history' | 'law' | 'theology' | 'nature';
        skills.know(kind, kind === 'theology' ? faith : kind === 'nature' ? region : realmName, amt);
      } else skills.gain(s.id, amt);
    }

    // Training, and ageing past one's prime.
    if (tr() < 0.5) {
      const tt = pick(tr, t.lean);
      const youngEnough = !PHYSICAL.includes(tt) || startAge < folk.prime;
      if (youngEnough && T.d.traits[tt] < 18) {
        T.d.traits[tt]++;
        res.traitChanges.push(`+1 ${tt}`);
      }
    }
    if (startAge + folk.termYears > folk.prime && tr() < 0.5) {
      const tt = pick(tr, PHYSICAL);
      if (T.d.traits[tt] > 3) {
        T.d.traits[tt]--;
        res.traitChanges.push(`-1 ${tt} (age)`);
      }
    }

    // Savings.
    copper += Math.round(t.pay[rank] * (0.7 + tr() * 0.6));

    // The term's event.
    const termEnd = res.year + folk.termYears;
    const wars = (realm?.wars ?? []).filter((x) => x.start <= termEnd && (x.end ?? year) >= res.year);
    const badPath = path?.draw.reversed && path.card.track === t.id && !terms.slice(0, -1).some((x) => x.track.id === t.id);
    const allowed = (k: TermEventKind) =>
      (k !== 'war' || wars.length > 0) && (k !== 'loss' || parents.father || parents.mother) && (!badPath || k === 'wound' || k === 'debt' || k === 'rival' || k === 'illness');
    const ev = pickEvent(t.id, tr, allowed);
    res.event = ev;
    const rankName = t.ranks[rank].toLowerCase();
    switch (ev) {
      case 'quiet':
        res.text.push(pick(tr, ['The years passed quietly.', 'Little happened worth the telling.', 'You kept your head down and learnt your work.']));
        break;
      case 'wound': {
        const part = pick(tr, SCAR_PARTS);
        const how = pick(tr, [...(WOUND_HOW[t.id] ?? []), ...WOUND_ANY]);
        const w: Wound = { part, kind: 'cut', severity: 1, scar: `a scar on the ${part}, from ${how}` };
        res.text.push(`You were hurt by ${how}, and carry the scar on your ${part}.`);
        if (tr() < 0.25 && part.includes('leg') && T.d.traits.agility > 3) {
          T.d.traits.agility--;
          w.scar += ', and a limp';
          res.traitChanges.push('-1 agility (wound)');
        }
        wounds.push(w);
        break;
      }
      case 'war': {
        const war: WarInfo = pick(tr, wars);
        if (t.id === 'military' || t.id === 'outlaw') {
          res.text.push(`You fought in ${war.name}.`);
          skills.gain('polearms', 4);
          skills.gain('dodge', 3);
        } else {
          res.text.push(`${war.name} came to the country about ${home.name}, and took much of what you had.`);
          copper = Math.round(copper * 0.5);
        }
        break;
      }
      case 'windfall': {
        const gain = Math.round(t.pay[rank] * 2 + 20 + tr() * 40);
        copper += gain;
        res.text.push(pick(tr, ['A stroke of luck filled your purse.', 'A grateful patron rewarded you well.', 'You found a forgotten purse, and kept it.']));
        break;
      }
      case 'contact': {
        const n = nextName(tr() < 0.5);
        ties.push({ kind: 'contact', name: n, text: `${n}, from your days as ${a(rankName)}, owes you a favour.`, alive: true });
        res.text.push(`You did ${n} a good turn that will not be forgotten.`);
        break;
      }
      case 'rival': {
        const n = nextName(tr() < 0.4);
        ties.push({ kind: 'rival', name: n, text: `${n} has hated you since your days as ${a(rankName)}.`, alive: true });
        res.text.push(`You made an enemy of ${n}.`);
        break;
      }
      case 'debt': {
        const n = nextName(tr() < 0.4);
        const owe = 40 * (rank + 1) + Math.round(tr() * 60);
        ties.push({ kind: 'debt', name: n, text: `You owe ${n} ${owe} copper.`, alive: true });
        res.text.push(`Hard times put you in debt to ${n}.`);
        break;
      }
      case 'crime':
        if (t.id === 'outlaw' || t.id === 'thief') {
          res.text.push('You were caught and branded, and escaped before the hanging.');
          wounds.push({ part: 'hand', kind: 'burn', severity: 1, scar: 'a thief\'s brand on the hand' });
        } else res.text.push(`You were accused of a theft you did not commit, and left ${home.name} for a while.`);
        break;
      case 'illness':
        res.text.push('A fever nearly killed you.');
        if (tr() < 0.3 && T.d.traits.constitution > 3) {
          T.d.traits.constitution--;
          res.traitChanges.push('-1 constitution (fever)');
        }
        break;
      case 'mentor': {
        const n = nextName(tr() < 0.4);
        const main = parts[0];
        if (main) {
          if (main.id === 'craft' || main.id === 'school') skills.gain(choiceSkills(t, plan)[0], 8);
          else if (!main.id.startsWith('know:') && main.id !== 'literacy') skills.gain(main.id, 8);
        }
        ties.push({ kind: 'master', name: n, text: `${n} taught you much of what you know.`, alive: tr() < 0.7 });
        res.text.push(`${n} took you under their wing.`);
        break;
      }
      case 'love': {
        const n = nextName(!ch.female ? tr() < 0.85 : tr() < 0.15);
        const lost = tr() < 0.5;
        ties.push({ kind: 'friend', name: n, text: lost ? `You loved ${n}, and lost them.` : `${n}, whom you love, waits for word of you.`, alive: !lost || tr() < 0.5 });
        res.text.push(lost ? `You loved ${n}, and lost them.` : `You fell in love with ${n}.`);
        break;
      }
      case 'loss': {
        const which = parents.father && (!parents.mother || tr() < 0.5) ? 'father' : 'mother';
        parents[which] = false;
        const tie = ties.find((x) => x.kind === 'parent' && x.name === family[which].name);
        if (tie) {
          tie.alive = false;
          tie.text = `Your ${which}, ${family[which].name}, is dead.`;
        }
        family[which].alive = false;
        res.text.push(`Your ${which} died.`);
        break;
      }
      case 'calling': {
        const other = pick(tr, TRACKS.filter((x) => x.id !== t.id));
        res.text.push(`You felt the pull of another life: ${other.name.toLowerCase()}.`);
        break;
      }
    }
  });

  // ---- Belongings ---------------------------------------------------------------------------
  const items: Item[] = [];
  const give = (name: string, worn = false) => {
    const g = GEAR[name] ?? [1, 1];
    const animal = g[0] === 0 && g[1] === 0;
    const have = items.find((x) => x.name === name);
    if (have) return;
    items.push({ name, weight: g[0], bulk: g[1], qty: GEAR_QTY[name] ?? 1, ...(worn ? { worn } : {}), ...(animal ? { animal } : {}) });
  };
  for (const n of ['clothes', 'boots', 'cloak']) give(n, true);
  for (const n of ['knife', 'flint and steel', 'waterskin', 'bread']) give(n);
  for (const [tid, rk] of Object.entries(ranks)) for (const n of TRACK.get(tid as TrackId)!.gear[rk] ?? []) give(n);
  if (standing.id === 'minor' || standing.id === 'noble') {
    give('good clothes');
    give('horse');
  }

  // ---- What they know of the world ----------------------------------------------------------
  const knowledge = startingKnowledge(home, w.starts, ranks, standing.id);

  // ---- Looks --------------------------------------------------------------------------------
  const lr = rngOf(ch.seed, `look${ch.look.build}`);
  const L = culture.look;
  const skin = L.skins[ch.look.skin % L.skins.length] ?? ['#d3a878', 'olive'];
  let hair = L.hairs[ch.look.hair % L.hairs.length] ?? ['#45301f', 'dark brown'];
  if (age > folk.prime * 1.25) hair = ['#9b9a96', 'iron grey'];
  const hairStyles = ch.female ? L.hairF : L.hairM;
  const beards = ch.female ? ['none'] : L.beards.length ? L.beards : ['none'];
  const hBase = folk.height[ch.female ? 1 : 0] * (L.h || 1);
  const heightCm = Math.round(hBase * (1 + (lr() - 0.5) * 0.12));
  const weightKg = Math.round(folk.weight[ch.female ? 1 : 0] * (heightCm / folk.height[ch.female ? 1 : 0]) ** 2 * (L.broad || 1) * (0.88 + lr() * 0.24) * (1 + (T.d.traits.strength - 10) * 0.015));
  const bmi = weightKg / (heightCm / 100) ** 2;
  const build = bmi < 18.5 ? 'slight' : bmi < 21 ? 'lean' : bmi < 25 ? 'of middling build' : bmi < 28 ? 'stocky' : 'heavy';

  // ---- The biography ------------------------------------------------------------------------
  const bio: { age: number; text: string }[] = [];
  const parentsText = `your father ${a(fatherTrade.name)}${motherTrade ? `, your mother ${a(motherTrade.name)}` : ''}`;
  const FAMILY_WORDS: Record<StandingId, string> = {
    peasant: 'a peasant family', townsfolk: 'a family of townsfolk', craftsman: 'a craftsman\'s family', merchant: 'a merchant family',
    clergy: 'a household of the faith', minor: 'a family of the lesser nobility', noble: 'a noble house',
  };
  bio.push({
    age: 0,
    text: `Born in ${year - age}, in ${home.name}, ${a(home.tier)} of ${realmName}, to ${FAMILY_WORDS[standing.id]} of ${culture.people}${fallen ? ', fallen on hard times' : ''}: ${parentsText}.`,
  });
  if (siblings.length) bio.push({ age: 0, text: `You grew up with ${siblings.length === 1 ? 'one' : siblings.length} ${siblings.length === 1 ? (siblings[0].female ? 'sister' : 'brother') : 'brothers and sisters'}.` });
  if (literate) bio.push({ age: 8, text: `You were taught to read ${culture.name}.` });
  let lastTrack = '';
  for (const t of terms) {
    if (t.blocked) {
      bio.push({ age: t.age, text: t.text.join(' ') });
      continue;
    }
    const rk = t.track.ranks[t.rank];
    const choice = t.track.choice?.options.find((o) => o.id === t.plan.choice)?.name;
    const head = t.track.id !== lastTrack
      ? `At ${t.age} (${t.year}), you became ${a(rk.toLowerCase())}${choice ? ` (${choice.toLowerCase()})` : ''}${lastTrack ? `, leaving ${LEAVING[lastTrack as TrackId]}` : ''}.`
      : t.promoted ? `At ${t.age}, you rose to ${rk.toLowerCase()}.` : `At ${t.age}, you served on as ${a(rk.toLowerCase())}.`;
    bio.push({ age: t.age, text: `${head} ${t.text.join(' ')}`.trim() });
    lastTrack = t.track.id;
  }
  if (omen) bio.push({ age, text: `The cards said: ${omen.draw.reversed ? omen.card.omenDown : omen.card.omenUp}` });

  return {
    choices: ch, culture, folk, home, realm, year, family, cards,
    base, budget, spent, start: startTraits, traits: T.toJSON(), skills, terms, ranks, age,
    name: own, copper: Math.max(0, Math.round(copper)), items, ties, wounds, knowledge,
    look: { skin, hair, hairStyle: hairStyles[ch.look.hairStyle % Math.max(1, hairStyles.length)] ?? 'short', beard: beards[ch.look.beard % beards.length], heightCm, weightKg, build, hairStyles, beards },
    biography: bio,
    omen: omen ? (omen.draw.reversed ? omen.card.omenDown : omen.card.omenUp) : undefined,
    path: path && !path.draw.reversed ? path.card.track : path?.card.track,
  };
}

/**
 * What the character knows of the world at the start (docs/design/navigation.md): the country
 * about home, the roads a trader, soldier or player has walked, the coasts a sailor knows, and the
 * places a scholar has seen on maps.
 */
function startingKnowledge(home: StartSite, starts: StartSite[], ranks: Record<string, number>, standing: StandingId): KnowledgeData {
  const others = starts.filter((s) => s.id !== home.id).map((s) => ({ s, km: kmBetween(home, s) })).sort((p, q) => p.km - q.km);
  const near = (km: number, n: number, f: (s: StartSite) => boolean = () => true) => others.filter((o) => o.km <= km && f(o.s)).slice(0, n).map((o) => o.s.id);
  const roads = new Set<string>();
  const places = new Map<string, number>();
  const notes: string[] = [];
  let homeRadiusM = 8000;
  const rk = (t: string) => ranks[t];

  // Everyone knows the way to the nearest market.
  for (const id of near(40, 1)) roads.add(id);
  if (standing === 'peasant' && !Object.keys(ranks).length) homeRadiusM = 6000;
  if (standing === 'minor' || standing === 'noble') {
    homeRadiusM = 10000;
    const seats = near(220, 3, (s) => s.tier === 'city' && s.realmId === home.realmId);
    for (const id of seats) places.set(id, 2000);
    if (seats.length) notes.push('As one of the well-born, you know the great towns of your realm by name and sight.');
  }
  if (standing === 'merchant') for (const id of near(80, 1)) roads.add(id);

  const r = (t: string) => (rk(t) ?? -1) + 1;
  const addRoads = (ids: string[]) => {
    for (const id of ids) roads.add(id);
    return ids.length > 0;
  };
  if (rk('trades') !== undefined) {
    if (addRoads(near(90, 2 + 2 * r('trades')))) notes.push('Trading taught you the roads between the market towns.');
  }
  if (rk('military') !== undefined) {
    if (addRoads(near(120, 1 + r('military'), (s) => s.realmId === home.realmId))) notes.push('Soldiering took you along the roads of your realm.');
  }
  if (rk('performance') !== undefined) {
    if (addRoads(near(90, 2 + r('performance')))) notes.push('You played your way along the roads from town to town.');
  }
  if ((rk('religion') ?? -1) >= 2) {
    if (addRoads(near(90, 2))) notes.push('As a friar you walked the roads between the parishes.');
  }
  if (rk('outlaw') !== undefined) {
    for (const id of near(60, 2)) roads.add(id);
    homeRadiusM = Math.max(homeRadiusM, 12000);
    notes.push('As an outlaw you learnt the roads, and the woods beside them.');
  }
  if (rk('woodland') !== undefined) {
    homeRadiusM = Math.max(homeRadiusM, 8000 + 3000 * r('woodland'));
    notes.push('The wild country about your home is well known to you.');
  }
  if (rk('seafaring') !== undefined) {
    const ports = near(220, 1 + 2 * r('seafaring'), (s) => !!s.coastal);
    for (const id of ports) places.set(id, 4000);
    if (ports.length) notes.push('You know the ports and coasts you sailed.');
  }
  if (rk('academia') !== undefined || rk('magic') !== undefined) {
    const cities = near(320, 2 + Math.max(r('academia'), r('magic')), (s) => s.tier === 'city');
    for (const id of cities) if (!places.has(id)) places.set(id, 1500);
    if (cities.length) notes.push('You have seen the great cities on the maps of your masters (old maps, not all of them right).');
  }
  return { homeRadiusM, roads: [...roads], places: [...places].map(([id, radiusM]) => ({ id, radiusM })), applied: false, notes };
}

/** The finished character as an Actor. */
export function buildActor(r: Resolved): Actor {
  const actor = new Actor('person');
  actor.add(new Identity({
    given: r.name.given, family: r.name.family, full: r.name.full, female: r.choices.female, age: r.age, year: r.year,
    folk: r.culture.folk, culture: r.culture.index, cultureName: r.culture.name, people: r.culture.people,
    realm: r.home.realm, homeId: r.home.id, homeName: r.home.name, faith: r.culture.faith, standing: r.family.standing.id,
  }));
  const traits = actor.add(new Traits(JSON.parse(JSON.stringify(r.traits))));
  const body = actor.add(new Body({
    heightCm: r.look.heightCm, weightKg: r.look.weightKg, build: r.look.build, skin: r.look.skin[1], skinHex: r.look.skin[0],
    hair: r.look.hair[1], hairHex: r.look.hair[0], hairStyle: r.look.hairStyle, beard: r.look.beard, marks: r.culture.look.marks, wounds: r.wounds.map((w) => ({ ...w })),
  }));
  actor.add(new Skills(r.skills.toJSON()));
  actor.add(new Pools(Pools.fromTraits(traits, body)));
  actor.add(new Mood([]));
  actor.add(new Inventory({ copper: r.copper, items: r.items.map((i) => ({ ...i })) }));
  actor.add(new History({
    lines: r.biography.map((b) => ({ ...b })),
    spread: r.cards.map((c) => ({ position: c.draw.position, card: c.card.name, reversed: c.draw.reversed })),
    ranks: { ...r.ranks }, ties: r.ties.map((t) => ({ ...t })), omen: r.omen,
  }));
  actor.add(new Knowledge(JSON.parse(JSON.stringify(r.knowledge))));
  return actor;
}
