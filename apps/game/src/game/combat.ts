/**
 * The blow (docs/design/combat.md; stage 2, melee with beasts): one exchange at a time, in the
 * game's seconds, with aimed blows at named parts and a stance chosen for each.
 *
 * - **Weapons** have a skill, a reach, the seconds a blow takes and the harm of each blow they can
 *   make (cut, thrust, bash: actors/items/defs.ts, `melee`). With nothing in hand, fists and feet
 *   (Unarmed); a torch or a tool held, a clumsy club.
 * - **Striking** is a check of the weapon's skill against the target's dodging, shifted by the
 *   stance, the aim (a small part is harder to hit), its size, and whether it is asleep or unaware.
 *   The margin decides how hard the blow lands; the hide or armour on the part takes some of it; a
 *   cut makes a cut, a thrust a stab, a heavy bash a broken bone (actors/health.ts).
 * - **Defending** against a beast's blow is the best of dodging (Dodge), parrying with the weapon
 *   (hard against a great beast's weight) and blocking with a shield (Shield); the defender's
 *   stance shifts it. A beast's blow goes for the parts it goes for (a wolf's for the limbs and the
 *   throat, a boar's for the legs), and what is worn there takes some of it.
 * - **Stances:** aggressive (+10 to strike, -15 to defend), balanced, defensive (-15, +15).
 *
 * Every exchange is told in words; the numbers behind it (chance, roll, severity, armour) go in a
 * tip for the log, shown on hover (combat.md, Decisions: words, numbers on hover).
 *
 * Proposed numbers, to tune in play.
 */
import type { Actor } from '../actors/actor';
import { check, chanceFor, DC, type Mod } from '../actors/checks';
import { Skills, Traits, type BodyPartDef } from '../actors/components';
import { Health, outerPart, type HealthWound, type WoundKind } from '../actors/health';
import { Inventory } from '../actors/items/inventory';
import { defOf, itemName, type Item } from '../actors/items/item';
import type { MeleeDef } from '../actors/items/defs';
import type { AnimalSize } from '@worldforge/core/local/fauna';
import type { BeastFight, NaturalBlow } from '../world/beasts';
import { clamp } from '../util';

export type Stance = 'aggressive' | 'balanced' | 'defensive';
export const STANCES: Stance[] = ['aggressive', 'balanced', 'defensive'];
export const STANCE_MODS: Record<Stance, { strike: number; defend: number }> = {
  aggressive: { strike: 10, defend: -15 }, balanced: { strike: 0, defend: 0 }, defensive: { strike: -15, defend: 15 },
};

export type BlowId = 'cut' | 'thrust' | 'bash' | 'punch' | 'kick';

/** One kind of blow the wanderer can make with what they hold. */
export interface Blow {
  id: BlowId;
  /** "cut with your sword", "punch". */
  name: string;
  kind: WoundKind;
  sev: number;
  seconds: number;
  deep: number;
  reach: number;
  skill: string;
  /** What it is made with, for the words ("your sword", "your fist"). */
  with: string;
}

/** What the wanderer fights with: the blows they can make, how they can parry and block. */
export interface Arms {
  weapon: Item | null;
  shield: Item | null;
  blows: Blow[];
  /** The weapon's skill and its parrying (0: cannot parry), and the shield's blocking (0: none). */
  parrySkill: string | null;
  parry: number;
  block: number;
}

const BLOW_KIND: Record<'cut' | 'thrust' | 'bash', WoundKind> = { cut: 'cut', thrust: 'stab', bash: 'bruise' };
const BLOW_DEEP: Record<'cut' | 'thrust' | 'bash', number> = { cut: 0.15, thrust: 0.6, bash: 0.3 };
const BLOW_VERB: Record<BlowId, string> = { cut: 'cut', thrust: 'thrust', bash: 'strike', punch: 'punch', kick: 'kick' };

/** The blows, parrying and blocking of what the wanderer holds now. */
export function armsOf(inv: Inventory): Arms {
  const held = inv.d.items.filter((i) => i.loc?.at === 'hand');
  const melee = (i: Item) => defOf(i).melee;
  const power = (m: MeleeDef) => Math.max(m.cut ?? 0, m.thrust ?? 0, m.bash ?? 0);
  const shield = held.find((i) => (melee(i)?.block ?? 0) > 0) ?? null;
  const weapon = held.filter((i) => melee(i) && i !== shield).sort((a, b) => power(melee(b)!) - power(melee(a)!))[0] ?? null;
  const blows: Blow[] = [];
  if (weapon) {
    const m = melee(weapon)!, w = `your ${itemName(weapon)}`;
    for (const k of ['cut', 'thrust', 'bash'] as const) {
      const sev = m[k];
      if (sev) blows.push({ id: k, name: `${k === 'cut' ? 'Cut' : k === 'thrust' ? 'Thrust' : 'Strike'} with ${w}`, kind: BLOW_KIND[k], sev, seconds: m.seconds, deep: BLOW_DEEP[k], reach: m.reach, skill: m.skill, with: w });
    }
  } else {
    // Something else in hand (a torch, a tool, a shield) serves as a club; otherwise fists.
    const other = held.find((i) => i !== shield);
    if (other) blows.push({ id: 'bash', name: `Strike with your ${itemName(other)}`, kind: 'bruise', sev: Math.min(4, 1 + defOf(other).weight * 1.5), seconds: 1.4, deep: 0.2, reach: 1, skill: 'clubs', with: `your ${itemName(other)}` });
    if (shield && !other) blows.push({ id: 'bash', name: `Strike with your ${itemName(shield)}`, kind: 'bruise', sev: melee(shield)?.bash ?? 2, seconds: melee(shield)?.seconds ?? 1.5, deep: 0.2, reach: 1, skill: 'shield', with: `your ${itemName(shield)}` });
    if (held.length < 2) blows.push({ id: 'punch', name: 'Punch', kind: 'bruise', sev: 1.5, seconds: 1, deep: 0.1, reach: 1, skill: 'unarmed', with: 'your fist' });
  }
  blows.push({ id: 'kick', name: 'Kick', kind: 'bruise', sev: 2.5, seconds: 1.4, deep: 0.2, reach: 1, skill: 'unarmed', with: 'your foot' });
  const wm = weapon ? melee(weapon)! : null;
  return { weapon, shield, blows, parrySkill: wm?.parry ? wm.skill : null, parry: wm?.parry ?? 0, block: shield ? melee(shield)?.block ?? 0 : 0 };
}

/**
 * Readies the best weapon carried but not held (a sword at the belt, a spear on the back), stowing
 * what is in the way. Returns what was done and the seconds it took; null if there is none, or
 * one is held already.
 */
export function readyWeapon(inv: Inventory): { item: Item; seconds: number; text: string } | null {
  const held = inv.d.items.filter((i) => i.loc?.at === 'hand');
  if (held.some((i) => defOf(i).melee && !defOf(i).melee?.block)) return null;
  const power = (i: Item) => {
    const m = defOf(i).melee!;
    return Math.max(m.cut ?? 0, m.thrust ?? 0, m.bash ?? 0);
  };
  const best = inv.d.items.filter((i) => defOf(i).melee && !defOf(i).melee?.block && i.loc?.at !== 'hand').sort((a, b) => power(b) - power(a))[0];
  if (!best) return null;
  let seconds = Math.max(1, inv.seconds(best, { at: 'hand', hand: 'right' }) * 0.6);
  // Hands full: what is held is put away (a torch into the off hand if there is room).
  const two = (defOf(best).hands ?? defOf(best).melee?.hands ?? 1) === 2;
  for (const h of held) {
    if (!two && held.length === 1 && h.loc?.at === 'hand' && h.loc.hand !== 'right') continue;
    if (!two && h.loc?.at === 'hand' && h.loc.hand === 'right' && !inv.held('left')) {
      inv.put(h, { at: 'hand', hand: 'left' });
      continue;
    }
    if (inv.stow(h)) return null;
    seconds += 2;
  }
  const why = inv.put(best, { at: 'hand', hand: 'right' });
  if (why) return null;
  return { item: best, seconds, text: `You draw your ${itemName(best)}.` };
}

// ---- Aim ----------------------------------------------------------------------------------------

/** How much harder a part is to hit than the body (a small part, much harder). */
export function aimMod(part: BodyPartDef): number {
  return -Math.round(clamp(5 * Math.log2(30 / Math.max(0.2, part.size)), 0, 30));
}

/** The parts of a body that can be aimed at (outside, not lost), with how much harder each is to hit. */
export function aimables(h: Health): { id: string; name: string; mod: number }[] {
  return h.plan.filter((p) => !p.inside && !h.isLost(p.id) && !/^(thumb|f\d|t\d)\./.test(p.id)).map((p) => ({ id: p.id, name: p.name, mod: aimMod(p) }));
}

// ---- Striking a beast ---------------------------------------------------------------------------

/** A beast in a fight, as the blow needs it. */
export interface Target {
  /** "the wolf". */
  name: string;
  health: Health;
  fight: BeastFight;
  size: AnimalSize;
  /** Asleep (or senseless), or not yet aware of the wanderer. */
  asleep: boolean;
  unaware: boolean;
  /** A person: the armour they wear over a region (points, with the things' names), in place of a hide (world/folk-fight.ts). */
  armour?: (region: string | undefined) => { points: number; names: string[] };
  /** How the telling names them after the first time ('it', 'its' for a beast; 'he', 'his' or 'she', 'her' for a person). */
  it?: string;
  its?: string;
}

export interface Exchange {
  text: string;
  /** The numbers behind it (shown on hover). */
  tip: string;
  hit: boolean;
  wounds: HealthWound[];
  seconds: number;
  /** The target was killed by it. */
  killed: boolean;
}

const SIZE_MOD: Record<AnimalSize, number> = { tiny: -15, small: -5, medium: 0, large: 5, huge: 10 };
const pct = (x: number) => `${Math.round(x)}%`;
const fmt = (x: number) => (Math.round(x * 10) / 10).toString();
const possessive = (name: string) => `${name}'s`;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** The wanderer's chance with a blow at a target now (for the menu), and the modifiers behind it. */
export function strikeChance(a: Actor, t: Target, blow: Blow, aim: string | null, stance: Stance, extra: Mod[] = []): { chance: number; mods: Mod[]; difficulty: number } {
  const { difficulty, mods } = strikeTerms(t, blow, aim, stance, extra);
  const c = chanceFor(a, blow.skill, { difficulty, mods });
  return { chance: c.chance, mods: c.mods, difficulty };
}

function strikeTerms(t: Target, blow: Blow, aim: string | null, stance: Stance, extra: Mod[]): { difficulty: number; mods: Mod[] } {
  const mods: Mod[] = [...extra];
  if (STANCE_MODS[stance].strike) mods.push({ why: `${stance} stance`, value: STANCE_MODS[stance].strike });
  const part = aim ? t.health.partOf(aim) : undefined;
  if (part && !t.health.isLost(part.id)) mods.push({ why: `aiming at the ${part.name}`, value: aimMod(part) });
  if (SIZE_MOD[t.size]) mods.push({ why: t.size === 'tiny' || t.size === 'small' ? 'a small target' : 'a big target', value: SIZE_MOD[t.size] });
  void blow;
  // Its dodging, less for its wounds; nothing at all asleep.
  const moving = t.health.capacities().moving;
  // (Skill against skill: a beast's dodging counts for 0.7 of a level, so that equals hit about two
  // times in three.)
  const dodge = t.asleep ? 0 : t.fight.dodge * 0.7 * (0.4 + 0.6 * moving) - (t.unaware ? 15 : 0);
  return { difficulty: Math.max(DC.trivial, Math.round(dodge)), mods };
}

/** A blow at a beast: the check, where it lands, the hide, the wound. */
export function strikeBeast(a: Actor, t: Target, blow: Blow, aim: string | null, stance: Stance, now: number, extra: Mod[] = []): Exchange {
  const { difficulty, mods } = strikeTerms(t, blow, aim, stance, extra);
  const r = check(a, blow.skill, { difficulty, mods, now });
  const verb = BLOW_VERB[blow.id];
  const tipHead = `${blow.name}: chance ${pct(r.chance)} (skill score ${Math.round(r.score)} against ${possessive(t.name.replace(/^the /, ''))} dodging ${difficulty}${r.mods.length ? `; ${r.mods.map((m) => `${m.why} ${m.value > 0 ? '+' : ''}${m.value}`).join(', ')}` : ''}); rolled ${r.roll}.`;
  if (!r.ok) {
    const miss = r.grade === 'fumble' ? `You ${verb} wildly at ${t.name} and stumble.` : t.asleep ? `You ${verb} at ${t.name}, and miss.` : r.grade === 'near' ? `You ${verb} at ${t.name}; ${t.it ?? 'it'} twists away, just.` : `You ${verb} at ${t.name}; ${t.it ?? 'it'} dodges.`;
    return { text: miss, tip: tipHead, hit: false, wounds: [], seconds: blow.seconds * (r.grade === 'fumble' ? 1.6 : 1), killed: false };
  }
  const h = t.health, rng = () => h.rng?.() ?? Math.random();
  // Where it lands: on the part aimed at, mostly; else wherever.
  let part = aim && h.partOf(aim) && !h.isLost(aim) && rng() < (r.grade === 'fine' ? 0.95 : 0.8) ? h.partOf(aim)! : h.partOf(outerPart(rng, undefined, h.plan).id)!;
  if (/^(thumb|f\d|t\d)\./.test(part.id)) part = h.partOf(part.parent ?? 'torso')!;
  const margin = clamp(r.chance - r.roll, 0, 60);
  const str = a.get(Traits)?.get('strength') ?? 10;
  let sev = blow.sev * Math.pow(str / 10, blow.skill === 'shortblades' ? 0.3 : 0.6) * (0.6 + margin / 60) * (r.grade === 'fine' ? 1.25 : 1) * (0.85 + rng() * 0.3);
  // The hide takes some (most against a cut; less against a thrust).
  const worn = t.armour?.(part.region);
  const hideF = blow.kind === 'cut' ? 1 : blow.kind === 'stab' ? 0.35 : 0.5;
  const prot = (worn ? worn.points * ARMOUR_F[blow.kind] : t.fight.hide * hideF) * (0.5 + rng() * 0.5);
  sev -= prot;
  const covering = worn?.names.length ? `${worn.names[0]}` : 'hide';
  const tip = `${tipHead} Hit by ${Math.round(margin)}: severity ${fmt(sev + prot)}${prot > 0.05 ? `, less ${fmt(prot)} for the ${covering}` : ''}, against the ${part.name}'s ${fmt(part.hp)}.`;
  if (sev <= 0.3) return { text: worn || !t.armour ? `You ${verb} ${t.name} on the ${part.name}, but the blow does not get through ${worn ? `the ${covering}` : `${t.its ?? 'its'} hide`}.` : `You ${verb} ${t.name} on the ${part.name}, but it does no harm.`, tip, hit: true, wounds: [], seconds: blow.seconds, killed: false };
  // A heavy blow breaks bone.
  let kind = blow.kind;
  if (kind === 'bruise' && sev >= part.hp * 0.3 && !/^(eye|ear|nose|tail)/.test(part.id)) kind = 'fracture';
  const wounds = h.hurt({ kind, sev, part: part.id, cause: blow.with.replace(/^your/, 'the wanderer\'s'), deep: blow.deep, now });
  const main = wounds[wounds.length - 1];
  const deeper = wounds.filter((w) => w !== main && h.partOf(w.part)?.inside);
  let text = `You ${verb} ${t.name} on the ${part.name}`;
  if (main) text += main.ruin ? (part.sever ? `, and cut it off.` : `: it is ruined.`) : `: ${/^[aeiou]/.test(h.woundWords(main)) ? 'an' : 'a'} ${h.woundWords(main)}.`;
  else text += '.';
  if (deeper.length) text += ` The blow goes deep, into ${t.its ?? 'its'} ${deeper.map((w) => h.partOf(w.part)?.name ?? w.part).join(' and ')}.`;
  return { text, tip, hit: true, wounds, seconds: blow.seconds, killed: h.dead };
}

// ---- A beast's blow at the wanderer -------------------------------------------------------------

/** The ways the wanderer can defend against a blow, with the skill and modifiers of each. */
function defences(arms: Arms | null, beastKg: number): { how: 'dodge' | 'parry' | 'block'; skill: string; mods: Mod[] }[] {
  const out: { how: 'dodge' | 'parry' | 'block'; skill: string; mods: Mod[] }[] = [{ how: 'dodge', skill: 'dodge', mods: [] }];
  // A great beast's weight cannot be parried with a blade, only turned.
  const heavy = beastKg >= 150 ? -15 : beastKg >= 60 ? -5 : 0;
  if (arms?.parrySkill) out.push({ how: 'parry', skill: arms.parrySkill, mods: [{ why: 'parrying', value: Math.round(arms.parry * 10) - 10 }, ...(heavy ? [{ why: 'its weight', value: heavy }] : [])] });
  if (arms?.block) out.push({ how: 'block', skill: 'shield', mods: [{ why: 'your shield', value: Math.round(arms.block * 15) }, ...(heavy ? [{ why: 'its weight', value: Math.round(heavy / 2) }] : [])] });
  return out;
}

/** Armour worn over a clothing region (points), by what each thing worn gives. */
export function armourOn(inv: Inventory | undefined, region: string | undefined): { points: number; names: string[] } {
  let points = 0;
  const names: string[] = [];
  if (!inv || !region) return { points, names };
  for (const it of inv.worn()) {
    const w = defOf(it).wear;
    if (!w?.armour || !w.regions?.includes(region as never)) continue;
    points += w.armour * (it.condition !== undefined ? 0.5 + it.condition / 200 : 1);
    names.push(itemName(it));
  }
  return { points, names };
}

const ARMOUR_F: Record<WoundKind, number> = { cut: 1, bite: 0.8, stab: 0.6, bruise: 0.5, crush: 0.4, fracture: 0.5, burn: 0.3, frostbite: 0 };

/**
 * A beast's blow at the wanderer: the wanderer's best defence (Dodge, a parry, the shield) checked
 * against its attack; if it lands, where (where it goes for), what is worn there, the wound, and
 * any venom.
 */
export function beastStrikes(beast: { name: string; fight: BeastFight; health: Health | null; stance?: Stance; its?: string }, a: Actor, blow: NaturalBlow, stance: Stance, now: number, o: { helpless?: boolean; extra?: Mod[] } = {}): Exchange {
  const h = a.need(Health), inv = a.get(Inventory), arms = inv ? armsOf(inv) : null;
  const caps = beast.health?.capacities();
  const attack = Math.round(beast.fight.attack * 0.7 * (caps ? 0.4 + 0.6 * Math.min(caps.moving + 0.3, caps.consciousness, 1) : 1) + (beast.stance ? STANCE_MODS[beast.stance].strike : 0));
  const rng = () => a.get(Skills)?.random() ?? Math.random();
  const its = beast.its ?? 'its';
  let tip = `${cap(beast.name)}: ${its} ${blow.name}, attack ${attack}.`;
  let glance = 1;
  if (!o.helpless) {
    const opts = defences(arms, beast.fight.kg).map((d) => {
      const mods = [...d.mods, ...(STANCE_MODS[stance].defend ? [{ why: `${stance} stance`, value: STANCE_MODS[stance].defend }] : []), ...(o.extra ?? [])];
      return { ...d, mods, chance: chanceFor(a, d.skill, { difficulty: attack, mods }).chance };
    }).sort((x, y) => y.chance - x.chance);
    const best = opts[0];
    const r = check(a, best.skill, { difficulty: attack, mods: best.mods, now });
    tip += ` Your best defence, ${best.how === 'dodge' ? 'dodging' : best.how === 'parry' ? 'a parry' : 'your shield'}: chance ${pct(r.chance)}${r.mods.length ? ` (${r.mods.map((m) => `${m.why} ${m.value > 0 ? '+' : ''}${m.value}`).join(', ')})` : ''}; rolled ${r.roll}.`;
    if (r.ok) {
      const how = best.how === 'dodge' ? `${cap(beast.name)} goes for you with ${its} ${blow.name}; you leap aside.`
        : best.how === 'parry' ? `You turn ${possessive(beast.name)} ${blow.name} aside with your ${arms?.weapon ? itemName(arms.weapon) : 'weapon'}.`
        : `You catch ${possessive(beast.name)} ${blow.name} on your ${arms?.shield ? itemName(arms.shield) : 'shield'}.`;
      return { text: how, tip, hit: false, wounds: [], seconds: blow.seconds, killed: false };
    }
    // A near miss on a shield or a parry takes the worst of it.
    if (r.grade === 'near' && best.how !== 'dodge') glance = 0.5;
  } else tip += ' You cannot defend yourself.';
  const part = outerPart(rng, blow.goes, h.plan);
  let sev = blow.sev * (0.7 + rng() * 0.6) * glance;
  const arm = armourOn(inv, part.region);
  const prot = arm.points * ARMOUR_F[blow.kind] * (0.5 + rng() * 0.5);
  sev -= prot;
  tip += ` Severity ${fmt(sev + prot)}${prot > 0.05 ? `, less ${fmt(prot)} for your ${arm.names.join(' and ')}` : ''}, against your ${part.name}'s ${fmt(part.hp)}.`;
  const who = cap(beast.name), does = blow.verb.replace('{part}', part.name);
  if (sev <= 0.3) return { text: `${who} ${does}, but ${arm.names[0] ? `your ${arm.names[0]} turns it` : 'it does no harm'}.`, tip, hit: true, wounds: [], seconds: blow.seconds, killed: false };
  const cause = `${possessive(beast.name.replace(/^the /, 'a '))} ${blow.name}`;
  const wounds = h.hurt({ kind: blow.kind, sev, part: part.id, cause, deep: blow.deep, now });
  if (blow.venom && wounds.length) h.envenom(blow.venom);
  const main = wounds[wounds.length - 1];
  const glanced = glance < 1 ? ' It gets past your guard.' : '';
  const words = main ? (main.ruin ? (h.partOf(main.part)?.sever ? `, tearing it away` : `, ruining it`) : `: ${/^[aeiou]/.test(h.woundWords(main)) ? 'an' : 'a'} ${h.woundWords(main)}`) : '';
  return { text: `${who} ${does}${words}.${glanced}`, tip, hit: true, wounds, seconds: blow.seconds, killed: h.dead };
}

/**
 * How much fight a beast has left (0 broken to 1 fresh): pain, blood lost, legs failing. It breaks
 * off when this falls below its courage (BeastFight `breaks`).
 */
export function morale(h: Health): number {
  const c = h.capacities();
  return clamp(1 - h.pain() * 0.8 - (1 - h.bloodShare()) * 1.6 - (1 - c.moving) * 0.4, 0, 1);
}
