/**
 * People as fighters (docs/design/combat.md, stage 4): what a resident (or a bandit) fights with
 * and how well, by their trade, their traits and what they carry; their body (actors/health.ts, a
 * person's plan, by sex); their armour; what they are called in the telling; and what they want
 * of a fight.
 *
 * The blow itself is game/combat.ts's, as for beasts: a person is a Target with armour in place of
 * a hide, and strikes with a weapon's blows as a beast does with its teeth.
 *
 * Proposed numbers, to tune in play.
 */
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import { Health } from '../actors/health';
import { Body, Identity } from '../actors/components';
import { Inventory } from '../actors/items/inventory';
import { defOf, itemName, type Item } from '../actors/items/item';
import { armourOn, armsOf, readyWeapon, type Target } from '../game/combat';
import type { BeastFight, NaturalBlow } from './beasts';
import type { Resident } from './population';
import type { Opinions } from './opinions';

/** What a person wants of a fight with the wanderer. */
export type Intent =
  /** To kill (a robber at bay, a murderer's kin). */
  | 'kill'
  /** To knock down and take what the wanderer carries (a robber). */
  | 'rob'
  /** To beat down and hold for the law (the watch). */
  | 'arrest'
  /** To give as good as they got with fists (a brawl). */
  | 'brawl'
  /** To fend off an attack and get away. */
  | 'defend';

/** A person's fight: with the wanderer or another person, to what end, since when, and how it goes. */
export interface FolkFight {
  intent: Intent;
  /** 'player', or a resident's id (a brawl between two). */
  foe: string;
  since: number;
  /** Blows landed, and the time of the last word said (a demand, a call to yield). */
  hits: number;
  said: number;
  stance: 'aggressive' | 'balanced' | 'defensive';
  /** For robbers and the watch: told the wanderer what they want (to hand over the purse, to yield). */
  warned?: boolean;
  /** They began it (a robber, a brawler who took offence): the wanderer's blows back are no crime. */
  began?: boolean;
  /** Come to the aid of another (a resident's id): they mean only to stop the wanderer, and leave them to the watch. */
  rescue?: string;
}

/** What the wanderer can do with a person at their mercy (game/session.ts). */
export type Mercy = 'spare' | 'rob' | 'bind' | 'tend' | 'kill' | 'hand';

/** How a person stands now, out of the ordinary run of their day. */
export type Plight = 'yielded' | 'down' | 'bound' | 'fleeing';

const WATCH = /soldier|guard|man-at-arms|woman-at-arms|sergeant|captain|turnkey|warden|bailiff|beadle|watchman|watchwoman/;
const LEADS = /sergeant|captain|warden/;
const HARD = /smith|mason|labourer|porter|stevedore|woodcutter|miner|butcher|carter|dock|ploughman|ploughwoman|drover|sawyer|quarry/;
const HUNTS = /hunter|trapper|forester/;

/** A person's skills at fighting, by their trade and age (0 to 100). */
export function folkSkills(r: Resident): { weapon: number; unarmed: number; dodge: number; archery: number } {
  const t = r.p.trade.toLowerCase(), age = r.p.age;
  const young = age < 12 ? 0.25 : age < 16 ? 0.6 : age > 60 ? 0.6 : 1;
  const bandit = r.p.template === 'bandit';
  const base = bandit ? (LEADS.test(t) || /chief|leader/.test(t) ? 50 : 40) : LEADS.test(t) ? 55 : WATCH.test(t) ? 45 : HUNTS.test(t) ? 25 : HARD.test(t) ? 20 : 10;
  return {
    weapon: Math.round(base * young),
    unarmed: Math.round((bandit || WATCH.test(t) ? 35 : HARD.test(t) ? 30 : 15) * young),
    dodge: Math.round((bandit || WATCH.test(t) ? 30 : 15) * young),
    archery: Math.round((HUNTS.test(t) ? 45 : bandit ? 30 : 5) * young),
  };
}

/** A person's courage: the share of their strength they fight on to (0.2 brave, 0.8 quick to give up). */
export function courage(r: Resident): number {
  const t = r.p.trade.toLowerCase(), tr = r.p.traits;
  let c = r.p.template === 'bandit' ? 0.35 : WATCH.test(t) ? 0.3 : HARD.test(t) ? 0.5 : 0.6;
  if (r.p.age < 14) c = 0.85;
  if (tr.includes('Brave')) c -= 0.15;
  if (tr.includes('Craven')) c += 0.2;
  if (tr.includes('Wrathful')) c -= 0.05;
  return Math.max(0.1, Math.min(0.9, c));
}

/** Whether a person is of the watch (or a garrison): they keep the peace and make arrests. */
export const isWatch = (r: Resident) => (WATCH.test(r.p.trade.toLowerCase()) && !/retired|former|old soldier/.test(r.p.trade.toLowerCase())) || r.p.template === 'guard';

/** A person's body (made when first needed): a person's plan, by their sex, as heavy as they are. */
export function healthOf(r: Resident, now: number): Health {
  let h = r.actor.get(Health);
  if (!h) {
    h = r.actor.add(new Health(Health.fresh(r.actor.get(Body)?.d.weightKg ?? 70)));
    h.setNow(now);
  }
  if (!h.rng) h.rng = mulberry32(hashString(`${r.p.id}#body`));
  return h;
}

/** What a person is called in the telling: by name if the wanderer knows them, else by what they seem. */
export function callName(r: Resident, opinions: Opinions): string {
  if (opinions.knows(r.p.id)) return r.p.given;
  if (r.p.template === 'bandit') return 'the robber';
  if (isWatch(r)) return /soldier|man-at-arms|woman-at-arms/.test(r.p.trade) ? 'the soldier' : 'the guard';
  if (r.p.age < 13) return r.p.female ? 'the girl' : 'the boy';
  return r.p.female ? 'the woman' : 'the man';
}

/** The words for a weapon's blow at a part of the wanderer ("cuts your {part} with a sword"). */
function verbOf(kind: 'cut' | 'stab' | 'bruise', weapon: string | null): string {
  if (!weapon) return kind === 'bruise' ? 'punches your {part}' : 'strikes your {part}';
  const a = /^[aeiou]/.test(weapon) ? 'an' : 'a';
  if (kind === 'cut') return `cuts your {part} with ${a} ${weapon}`;
  if (kind === 'stab') return `stabs your {part} with ${a} ${weapon}`;
  // A blunt blow with a blade or a polearm: the flat of it, or the shaft.
  if (/sword|knife|dagger|machete|axe|hatchet|sickle/.test(weapon)) return `strikes your {part} with the flat of ${a} ${weapon}`;
  if (/spear|pike|halberd|glaive|polearm/.test(weapon)) return `strikes your {part} with the shaft of ${a} ${weapon}`;
  return `clubs your {part} with ${a} ${weapon}`;
}

/**
 * A person's fighting as the blow sees it (a BeastFight in form): their skill, dodging, the blows
 * of what they hold (or fists and feet), and their courage. In a brawl, or holding for the law,
 * they keep to blunt blows (fists, a staff's or a spear's shaft, the flat of a blade).
 */
export function folkFight(r: Resident, intent: Intent): BeastFight {
  const s = folkSkills(r), inv = r.actor.get(Inventory);
  const arms = inv ? armsOf(inv) : null;
  const kg = r.actor.get(Body)?.d.weightKg ?? 70;
  const blows: NaturalBlow[] = [];
  const blunt = intent === 'brawl' || intent === 'arrest';
  if (arms?.weapon && intent !== 'brawl') {
    const w = itemName({ ...arms.weapon, qty: 1 });
    for (const b of arms.blows) {
      if (b.id === 'punch' || b.id === 'kick') continue;
      if (blunt && b.kind !== 'bruise') continue;
      const kind = b.kind === 'cut' ? 'cut' : b.kind === 'stab' ? 'stab' : 'bruise';
      blows.push({ name: w, verb: verbOf(kind, w), kind: b.kind, sev: b.sev, seconds: b.seconds, deep: b.deep, reach: b.reach, goes: ['head', 'torso', 'arms', 'legs', 'waist'] });
    }
    // Holding for the law with a blade: the flat of it.
    if (blunt && !blows.length) blows.push({ name: w, verb: verbOf('bruise', w), kind: 'bruise', sev: 3, seconds: arms.blows[0]?.seconds ?? 1.5, deep: 0.2, goes: ['head', 'torso', 'arms', 'legs', 'waist'] });
  }
  if (!blows.length) {
    blows.push({ name: 'fist', verb: 'punches your {part}', kind: 'bruise', sev: 1.5 * Math.sqrt(kg / 70), seconds: 1, deep: 0.1, goes: ['head', 'face', 'torso', 'arms'] });
    blows.push({ name: 'foot', verb: 'kicks your {part}', kind: 'bruise', sev: 2.5 * Math.sqrt(kg / 70), seconds: 1.4, deep: 0.2, goes: ['legs', 'torso', 'waist'] });
  }
  const skill = blows[0]?.name === 'fist' ? s.unarmed : s.weapon;
  return { kg, attack: skill, dodge: Math.max(s.dodge, arms?.parry ? Math.round(s.weapon * 0.5 + arms.parry * 10) : 0), hide: 0, blows, breaks: courage(r), fights: 'back' };
}

/** A person as the wanderer's blow sees them. */
export function folkTarget(r: Resident, intent: Intent, opinions: Opinions, now: number, asleep: boolean, unaware: boolean): Target {
  const inv = r.actor.get(Inventory);
  return {
    name: callName(r, opinions), health: healthOf(r, now), fight: folkFight(r, intent), size: r.p.age < 12 ? 'small' : 'medium', asleep, unaware,
    armour: (region) => armourOn(inv, region),
    it: r.p.female ? 'she' : 'he', its: r.p.female ? 'her' : 'his',
  };
}

/**
 * A person in a fight readies a weapon if they mean to use one (not in a brawl): drawn from the
 * belt (a guard's sword, anyone's knife when it comes to killing). Returns the seconds it took.
 */
export function folkReady(r: Resident, intent: Intent): number {
  if (intent === 'brawl' || intent === 'arrest' && !isWatch(r)) return 0;
  const inv = r.actor.get(Inventory);
  if (!inv) return 0;
  // A townsman draws his knife only to save his life; the watch and robbers draw at once.
  if (intent === 'defend' && !isWatch(r) && r.p.template !== 'bandit') return 0;
  const done = readyWeapon(inv);
  return done ? done.seconds : 0;
}

/** What a person carries that can be taken: their coin, and what is not worn (a purse's contents counted in), and what they wear of worth. */
export function plunder(r: Resident): { copper: number; items: Item[] } {
  const inv = r.actor.get(Inventory);
  if (!inv) return { copper: 0, items: [] };
  const items = inv.d.items.filter((i) => i.loc?.at !== 'worn' || defOf(i).wear?.jewel || defOf(i).wear?.armour);
  return { copper: inv.d.copper, items };
}

/** A person's name in full, for the record (the law, a corpse). */
export function fullName(r: Resident): string {
  return r.actor.get(Identity)?.d.full ?? r.p.name;
}
