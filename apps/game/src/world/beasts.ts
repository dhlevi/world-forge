/**
 * Beasts as fighters (docs/design/combat.md, stage 2): each species' weight, body plan, natural
 * weapons, skill at attacking and dodging, hide, courage, and when it will set on a person
 * unprovoked. The rules of the fight are game/combat.ts's; when beasts decide to fight is
 * world/fauna.ts's. Species not listed take a default by their size.
 *
 * Realistic, as decided (combat.md, Decisions): most beasts avoid people. Wolf packs hunt a lone
 * wanderer when hungry (winter, or by night); bears attack when surprised close, or a mother with
 * young; the great cats stalk the lone and the weak; boar, bulls, aurochs and bison charge when
 * pressed; crocodiles take what comes to the water; vipers strike when trodden near; prey fights
 * only when cornered or hurt.
 *
 * Proposed numbers, to tune in play.
 */
import type { AnimalSize, BodyPlan, Species } from '@worldforge/core/local/fauna';
import type { PlanId } from '../actors/components';
import type { WoundKind } from '../actors/health';

/** A natural weapon: how it wounds, how badly (severity points), how long a blow takes, how deep it goes. */
export interface NaturalBlow {
  name: string;
  /** What it does, after the beast's name: "bites your {part}", "rakes your {part} with its claws". */
  verb: string;
  kind: WoundKind;
  sev: number;
  seconds: number;
  deep: number;
  /** Venom given with it (the condition's share, 0 to 1). */
  venom?: number;
  /** How far it reaches (tiles; 1 if not given): a person's spear reaches two. */
  reach?: number;
  /** Where on a person it goes for (clothing regions); any if none. */
  goes?: ('head' | 'face' | 'torso' | 'arms' | 'hands' | 'waist' | 'legs' | 'feet')[];
}

/** When a beast sets on a person unprovoked (world/fauna.ts weighs each). */
export type Attacks =
  /** A hungry pack, by night or in winter, on one alone. */
  | 'pack'
  /** Surprised close (within 3 tiles before it knew), or with young. */
  | 'surprised'
  /** Stalks the lone and the weak (hurt, slow, asleep), by dusk and dark. */
  | 'stalks'
  /** Takes what comes to the water's edge or into it. */
  | 'water'
  /** Strikes when trodden near. */
  | 'trodden'
  /** Charges when pressed (approached within its flight distance). */
  | 'pressed';

export interface BeastFight {
  kg: number;
  /** Attacking and dodging, as skill levels (0 to 100). */
  attack: number;
  dodge: number;
  /** Hide: protection against cuts and bites (points; half against bashing, a quarter against thrusts). */
  hide: number;
  blows: NaturalBlow[];
  /** Courage: the share of its strength it fights on to (0.2 brave, 0.7 quick to break). */
  breaks: number;
  /** When hurt or cornered: fights back (at bay, or on the attack), or only flees. */
  fights: 'back' | 'cornered' | 'never';
  attacks?: Attacks[];
}

const B = (name: string, verb: string, kind: WoundKind, sev: number, seconds: number, deep: number, o: Partial<NaturalBlow> = {}): NaturalBlow => ({ name, verb, kind, sev, seconds, deep, ...o });
const LEGS: NaturalBlow['goes'] = ['legs', 'feet', 'hands', 'arms'];
const THROAT: NaturalBlow['goes'] = ['arms', 'legs', 'hands', 'head', 'torso'];

export const BEASTS: Record<string, BeastFight> = {
  hare: { kg: 4, attack: 10, dodge: 60, hide: 0, blows: [B('teeth', 'nips your {part}', 'bite', 0.6, 1, 0, { goes: ['hands'] })], breaks: 0.9, fights: 'never' },
  rabbit: { kg: 2, attack: 8, dodge: 60, hide: 0, blows: [B('teeth', 'nips your {part}', 'bite', 0.5, 1, 0, { goes: ['hands'] })], breaks: 0.9, fights: 'never' },
  squirrel: { kg: 0.4, attack: 15, dodge: 65, hide: 0, blows: [B('teeth', 'bites your {part}', 'bite', 0.6, 0.8, 0, { goes: ['hands'] })], breaks: 0.9, fights: 'cornered' },
  fox: { kg: 7, attack: 30, dodge: 50, hide: 0, blows: [B('teeth', 'bites your {part}', 'bite', 3, 1, 0.1, { goes: LEGS })], breaks: 0.6, fights: 'cornered' },
  badger: { kg: 12, attack: 35, dodge: 25, hide: 1, blows: [B('teeth', 'bites your {part}', 'bite', 4, 1.1, 0.15, { goes: LEGS }), B('claws', 'rakes your {part} with its claws', 'cut', 3, 1.1, 0, { goes: LEGS })], breaks: 0.3, fights: 'cornered' },
  roe_deer: { kg: 25, attack: 20, dodge: 50, hide: 0, blows: [B('hooves', 'kicks your {part}', 'bruise', 4, 1.3, 0.2), B('antlers', 'butts your {part} with its antlers', 'stab', 3, 1.5, 0.3)], breaks: 0.7, fights: 'cornered' },
  red_deer: { kg: 120, attack: 30, dodge: 40, hide: 1, blows: [B('antlers', 'drives its antlers into your {part}', 'stab', 8, 1.6, 0.5, { goes: ['torso', 'legs', 'arms'] }), B('hooves', 'strikes your {part} with its hooves', 'bruise', 6, 1.3, 0.3)], breaks: 0.6, fights: 'cornered' },
  elk: { kg: 450, attack: 35, dodge: 25, hide: 2, blows: [B('hooves', 'strikes your {part} with a forefoot', 'bruise', 11, 1.4, 0.5), B('antlers', 'swings its antlers into your {part}', 'stab', 9, 1.8, 0.4)], breaks: 0.5, fights: 'cornered', attacks: ['pressed'] },
  wild_horse: { kg: 350, attack: 30, dodge: 30, hide: 1, blows: [B('hooves', 'lashes out and catches your {part} with its hooves', 'bruise', 10, 1.4, 0.5), B('teeth', 'bites your {part}', 'bite', 4, 1.1, 0.1, { goes: ['arms', 'torso'] })], breaks: 0.6, fights: 'cornered' },
  bison: { kg: 700, attack: 35, dodge: 15, hide: 3, blows: [B('horns', 'hooks your {part} with its horns', 'stab', 12, 1.8, 0.6, { goes: ['legs', 'torso', 'waist'] }), B('weight', 'tramples your {part}', 'crush', 12, 2, 0.6)], breaks: 0.45, fights: 'back', attacks: ['pressed'] },
  aurochs: { kg: 800, attack: 40, dodge: 15, hide: 3, blows: [B('horns', 'gores your {part}', 'stab', 14, 1.8, 0.7, { goes: ['legs', 'torso', 'waist'] }), B('weight', 'tramples your {part}', 'crush', 13, 2, 0.6)], breaks: 0.35, fights: 'back', attacks: ['pressed'] },
  camel: { kg: 500, attack: 25, dodge: 20, hide: 1, blows: [B('teeth', 'bites your {part}', 'bite', 6, 1.4, 0.2, { goes: ['arms', 'head'] }), B('feet', 'kicks your {part}', 'bruise', 9, 1.5, 0.4)], breaks: 0.6, fights: 'cornered' },
  mountain_goat: { kg: 80, attack: 30, dodge: 45, hide: 1, blows: [B('horns', 'butts your {part}', 'stab', 5, 1.4, 0.3)], breaks: 0.6, fights: 'cornered' },
  boar: { kg: 100, attack: 45, dodge: 25, hide: 3, blows: [B('tusks', 'slashes your {part} with its tusks', 'cut', 9, 1.3, 0.4, { goes: ['legs', 'waist', 'feet'] })], breaks: 0.25, fights: 'back', attacks: ['pressed'] },
  beaver: { kg: 20, attack: 25, dodge: 20, hide: 1, blows: [B('teeth', 'bites your {part}', 'bite', 5, 1.3, 0.2, { goes: LEGS })], breaks: 0.6, fights: 'cornered' },
  wolverine: { kg: 15, attack: 45, dodge: 35, hide: 1, blows: [B('teeth', 'bites your {part}', 'bite', 5, 1, 0.2, { goes: LEGS }), B('claws', 'claws your {part}', 'cut', 4, 1, 0)], breaks: 0.2, fights: 'back' },
  wolf: { kg: 40, attack: 45, dodge: 40, hide: 1, blows: [B('teeth', 'bites your {part}', 'bite', 7, 1.2, 0.25, { goes: THROAT })], breaks: 0.5, fights: 'back', attacks: ['pack'] },
  lynx: { kg: 22, attack: 40, dodge: 45, hide: 0, blows: [B('claws', 'rakes your {part} with its claws', 'cut', 4, 0.9, 0), B('teeth', 'bites your {part}', 'bite', 4.5, 1.1, 0.2)], breaks: 0.55, fights: 'cornered' },
  mountain_lion: { kg: 65, attack: 50, dodge: 40, hide: 1, blows: [B('claws', 'rakes your {part} with its claws', 'cut', 7, 1, 0.1), B('teeth', 'bites your {part}', 'bite', 9, 1.3, 0.4, { goes: ['head', 'torso', 'arms'] })], breaks: 0.45, fights: 'back', attacks: ['stalks'] },
  brown_bear: { kg: 300, attack: 50, dodge: 20, hide: 3, blows: [B('claws', 'swipes your {part} with its claws', 'cut', 12, 1.3, 0.3), B('jaws', 'bites your {part}', 'bite', 13, 1.5, 0.5, { goes: ['head', 'arms', 'torso', 'legs'] })], breaks: 0.35, fights: 'back', attacks: ['surprised'] },
  lion: { kg: 190, attack: 55, dodge: 35, hide: 2, blows: [B('claws', 'rakes your {part} with its claws', 'cut', 10, 1.1, 0.2), B('jaws', 'bites your {part}', 'bite', 13, 1.4, 0.5, { goes: ['head', 'torso', 'arms'] })], breaks: 0.4, fights: 'back', attacks: ['stalks', 'pack'] },
  tiger: { kg: 220, attack: 60, dodge: 35, hide: 2, blows: [B('claws', 'rakes your {part} with its claws', 'cut', 11, 1.1, 0.2), B('jaws', 'bites your {part}', 'bite', 14, 1.4, 0.55, { goes: ['head', 'torso', 'arms'] })], breaks: 0.35, fights: 'back', attacks: ['stalks'] },
  hyena: { kg: 60, attack: 45, dodge: 35, hide: 1, blows: [B('jaws', 'bites your {part}', 'bite', 8, 1.2, 0.4, { goes: LEGS })], breaks: 0.55, fights: 'back', attacks: ['pack'] },
  elephant: { kg: 4000, attack: 40, dodge: 5, hide: 5, blows: [B('tusks', 'drives its tusks into your {part}', 'stab', 18, 2.2, 0.8), B('weight', 'tramples your {part}', 'crush', 20, 2.5, 0.8)], breaks: 0.4, fights: 'back', attacks: ['pressed'] },
  crocodile: { kg: 400, attack: 55, dodge: 15, hide: 5, blows: [B('jaws', 'seizes your {part} in its jaws', 'bite', 15, 1.6, 0.6, { goes: ['legs', 'arms', 'feet'] })], breaks: 0.3, fights: 'back', attacks: ['water'] },
  viper: { kg: 0.3, attack: 55, dodge: 50, hide: 0, blows: [B('fangs', 'strikes at your {part}', 'bite', 1, 0.6, 0, { venom: 0.45, goes: ['feet', 'legs', 'hands'] })], breaks: 0.6, fights: 'back', attacks: ['trodden'] },
  seal: { kg: 100, attack: 25, dodge: 20, hide: 1, blows: [B('teeth', 'bites your {part}', 'bite', 6, 1.3, 0.2, { goes: LEGS })], breaks: 0.6, fights: 'cornered' },
  heron: { kg: 2, attack: 35, dodge: 45, hide: 0, blows: [B('beak', 'stabs at your {part} with its beak', 'stab', 2.5, 0.8, 0.2, { goes: ['face', 'hands', 'arms'] })], breaks: 0.6, fights: 'cornered' },
  owl: { kg: 1.2, attack: 35, dodge: 45, hide: 0, blows: [B('talons', 'strikes your {part} with its talons', 'cut', 2, 0.8, 0.1, { goes: ['head', 'face', 'hands'] })], breaks: 0.6, fights: 'cornered' },
  hawk: { kg: 1, attack: 35, dodge: 50, hide: 0, blows: [B('talons', 'strikes your {part} with its talons', 'cut', 2, 0.8, 0.1, { goes: ['head', 'face', 'hands'] })], breaks: 0.6, fights: 'cornered' },
  cattle: { kg: 600, attack: 30, dodge: 15, hide: 2, blows: [B('horns', 'butts your {part} with its horns', 'stab', 9, 1.8, 0.4), B('hooves', 'kicks your {part}', 'bruise', 8, 1.5, 0.4)], breaks: 0.6, fights: 'cornered' },
  sheep: { kg: 60, attack: 20, dodge: 20, hide: 1, blows: [B('head', 'butts your {part}', 'bruise', 4, 1.5, 0.2)], breaks: 0.7, fights: 'cornered' },
  goat: { kg: 50, attack: 25, dodge: 30, hide: 1, blows: [B('horns', 'butts your {part}', 'bruise', 4, 1.4, 0.2)], breaks: 0.6, fights: 'cornered' },
  pig: { kg: 120, attack: 30, dodge: 15, hide: 2, blows: [B('teeth', 'bites your {part}', 'bite', 6, 1.4, 0.2, { goes: LEGS })], breaks: 0.6, fights: 'cornered' },
  hen: { kg: 2, attack: 15, dodge: 30, hide: 0, blows: [B('beak', 'pecks your {part}', 'stab', 0.4, 0.8, 0, { goes: ['hands', 'legs', 'feet'] })], breaks: 0.8, fights: 'never' },
  goose: { kg: 5, attack: 30, dodge: 30, hide: 0, blows: [B('beak', 'pecks hard at your {part}', 'bruise', 1.5, 0.9, 0, { goes: ['legs', 'hands', 'feet'] }), B('wings', 'beats at your {part} with its wings', 'bruise', 1.5, 1, 0)], breaks: 0.5, fights: 'back', attacks: ['pressed'] },
  horse: { kg: 450, attack: 25, dodge: 25, hide: 1, blows: [B('hooves', 'kicks your {part}', 'bruise', 10, 1.4, 0.5), B('teeth', 'bites your {part}', 'bite', 4, 1.1, 0.1, { goes: ['arms', 'torso'] })], breaks: 0.6, fights: 'cornered' },
  donkey: { kg: 200, attack: 25, dodge: 20, hide: 1, blows: [B('hooves', 'kicks your {part}', 'bruise', 8, 1.4, 0.4), B('teeth', 'bites your {part}', 'bite', 4, 1.1, 0.1)], breaks: 0.6, fights: 'cornered' },
  dog: { kg: 30, attack: 40, dodge: 40, hide: 0, blows: [B('teeth', 'bites your {part}', 'bite', 5, 1.1, 0.2, { goes: ['arms', 'hands', 'legs'] })], breaks: 0.5, fights: 'back' },
  cat: { kg: 4, attack: 35, dodge: 55, hide: 0, blows: [B('claws', 'scratches your {part}', 'cut', 1, 0.8, 0, { goes: ['hands', 'arms'] }), B('teeth', 'bites your {part}', 'bite', 1.2, 0.9, 0, { goes: ['hands'] })], breaks: 0.6, fights: 'cornered' },
  rat: { kg: 0.3, attack: 25, dodge: 50, hide: 0, blows: [B('teeth', 'bites your {part}', 'bite', 0.8, 0.8, 0, { goes: ['hands', 'feet', 'legs'] })], breaks: 0.7, fights: 'cornered' },
};

const SIZE_KG: Record<AnimalSize, number> = { tiny: 0.3, small: 3, medium: 40, large: 250, huge: 1500 };

/** A beast's fighting, by its species (or a default by its size and body plan). */
export function fightOf(s: Species): BeastFight {
  const known = BEASTS[s.id];
  if (known) return known;
  const kg = SIZE_KG[s.size];
  const bird = s.plan === 'bird';
  return {
    kg, attack: 20, dodge: bird ? 50 : 30, hide: 0,
    blows: [bird ? B('beak', 'pecks your {part}', 'stab', Math.max(0.3, kg / 4), 0.9, 0, { goes: ['hands', 'arms'] }) : B('teeth', 'bites your {part}', 'bite', Math.max(0.5, Math.cbrt(kg) * 1.2), 1.2, 0.1)],
    breaks: 0.6, fights: s.diet === 'predator' ? 'back' : 'cornered',
  };
}

/** The body plan a species fights with. */
export function planOf(plan: BodyPlan): PlanId {
  return plan === 'bird' ? 'bird' : plan === 'serpent' ? 'serpent' : 'quad';
}
