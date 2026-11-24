/**
 * Health (docs/design/characters.md, Health: body parts and wounds; combat.md, stage 1): no hit
 * points. Harm is done to the parts of the body (actors/components/body.ts, HUMANOID), as wounds of
 * a kind and a severity, and what the person can still do is worked out from the state of the parts.
 *
 * - **Wounds** have a kind (cut, stab, bruise, fracture, crush, bite, burn, frostbite), a severity
 *   in points against the part's toughness (`hp`), a cause, and their treatment. A part whose
 *   wounds reach its toughness is ruined: lost, if it can be cut off (a finger, a hand), or
 *   destroyed (an eye, a lung). Destroying a vital part (the brain, the heart, the neck, the liver,
 *   the kidneys) kills.
 * - **Blood:** a volume from the body's weight. Open wounds bleed by their kind, severity and part;
 *   small ones clot in time, deep ones (and wounds of the neck and the organs) do not. A bandage
 *   slows the bleeding and lets it clot; stitches close it. Blood comes back slowly, faster when fed
 *   and watered. Losing it brings weakness, then fainting, then death.
 * - **Pain** from the wounds (Willpower bears it better) lowers consciousness; past bearing, the
 *   person faints.
 * - **Capacities** (as in RimWorld): consciousness, moving, manipulation, sight, hearing, breathing,
 *   blood pumping, blood filtering, talking and eating, each 0 to 1 from the parts that serve it.
 * - **Healing** takes time: faster at rest, fed and watered, and for wounds cleaned and stitched; a
 *   broken bone must be splinted or it knits crooked. Bad wounds leave scars (kept on the Body);
 *   lost parts stay lost.
 * - **Infection:** open wounds may fester in the first two days (less if cleaned, less again with a
 *   poultice). An infection then races the body's immunity: rest, food and a poultice help the
 *   body; if the infection wins, it kills.
 * - **Conditions** of the whole body: dehydration, starvation, hypothermia, heatstroke and drowning,
 *   each 0 to 1, growing from the needs (actors/needs.ts) and the water; at 1 they kill.
 * - **Death** comes from blood loss, a ruined vital part, a condition or an infection run its
 *   course: never from a number of hit points.
 *
 * Proposed numbers, to tune in play.
 */
import { Component } from './actor';
import type { Message } from '../engine/messages';
import { Body, HUMANOID, Identity, Mood, PART, PLANS, PLAN_PARTS, Skills, Traits, humanoidPlan, type Activity, type BodyPartDef, type PlanId, type Sex, type TimeCtx } from './components';
import { Needs } from './needs';
import { Inventory } from './items/inventory';
import { defOf } from './items/item';
import { clamp } from '../util';

export type WoundKind = 'cut' | 'stab' | 'bruise' | 'fracture' | 'crush' | 'bite' | 'burn' | 'frostbite';
export type Capacity = 'consciousness' | 'moving' | 'manipulation' | 'sight' | 'hearing' | 'breathing' | 'pumping' | 'filtering' | 'talking' | 'eating';
export const CAPACITIES: Capacity[] = ['consciousness', 'moving', 'manipulation', 'sight', 'hearing', 'breathing', 'pumping', 'filtering', 'talking', 'eating'];
export const CAPACITY_NAMES: Record<Capacity, string> = {
  consciousness: 'Consciousness', moving: 'Moving', manipulation: 'Manipulation', sight: 'Sight', hearing: 'Hearing', breathing: 'Breathing',
  pumping: 'Blood pumping', filtering: 'Blood filtering', talking: 'Talking', eating: 'Eating',
};

export type ConditionId = 'dehydration' | 'starvation' | 'hypothermia' | 'heatstroke' | 'drowning' | 'venom' | 'concussion';
export const CONDITION_NAMES: Record<ConditionId, string> = {
  dehydration: 'Dehydration', starvation: 'Starvation', hypothermia: 'Hypothermia', heatstroke: 'Heatstroke', drowning: 'Drowning', venom: 'Venom', concussion: 'Concussion',
};

export interface HealthWound {
  id: number;
  part: string;
  kind: WoundKind;
  /** Harm left (points against the part's toughness), and how much there was at first. */
  sev: number;
  start: number;
  /** When it was taken (game seconds), and what did it ("a fall", "thorns"). */
  at: number;
  cause: string;
  /** Treatment: how well each was done (0 to 1; none: not done), and when the poultice went on. */
  bandaged?: number;
  cleaned?: number;
  stitched?: number;
  splinted?: number;
  poultice?: number;
  /** An infection in it (0 to 1; at 1 it kills), and the body's immunity to it (0 to 1; at 1 it is beaten). */
  infection?: number;
  immunity?: number;
  /** A ruined part's wound (the stump of a finger, a burst eye). */
  ruin?: boolean;
}

/** Harm that stays: a bone that knit crooked, a stiff joint (efficiency of the part, 0 to 1). */
export interface Lasting {
  part: string;
  eff: number;
  text: string;
}

export interface HealthData {
  /** The body's plan (a person's, a beast's: actors/components/body.ts), and a beast's weight (kg); a person's comes from their Body. */
  plan?: PlanId;
  kg?: number;
  /** Blood (litres). */
  blood: number;
  wounds: HealthWound[];
  /** Parts lost or destroyed for good. */
  lost: string[];
  lasting: Lasting[];
  cond: Partial<Record<ConditionId, number>>;
  /** Pain eased by a remedy until this time (game seconds). */
  eased?: number;
  /** Venom still spreading from a bite (shares of the condition yet to come). */
  venomLeft?: number;
  nextId: number;
  /** Dead: of what, and when. */
  dead?: { cause: string; at: number };
  /** A beast's mortal wound (to the heart, the lungs, the liver, the brain, the neck): it dies at this time, wherever it has run. */
  mortal?: { at: number; part: string };
}

export interface HealthNote {
  text: string;
  /** Worth stopping for (a journey stops, as for a need growing worse). */
  bad: boolean;
}

const H = 3600;
/** A beast whose wounds tear this much of it (Health.trauma) dies of the shock at once. */
const TRAUMA_DEATH = 0.45;
/** Open wounds: these bleed and may fester. */
const OPEN = new Set<WoundKind>(['cut', 'stab', 'bite', 'crush', 'burn', 'frostbite']);
/** Millilitres an hour per point of severity, by kind (times the part's own bleeding). */
const BLEED: Record<WoundKind, number> = { cut: 20, stab: 26, bite: 20, crush: 10, fracture: 0, bruise: 0, burn: 0, frostbite: 0 };
/** Pain per point of severity, by kind. */
const PAIN: Record<WoundKind, number> = { cut: 1, stab: 1.2, bite: 1.2, bruise: 0.6, fracture: 2.5, crush: 1.6, burn: 2, frostbite: 1 };
/** Points healed an hour, by kind (before rest, food and treatment). */
const HEAL: Record<WoundKind, number> = { cut: 0.06, stab: 0.045, bite: 0.05, bruise: 0.15, crush: 0.05, fracture: 0.015, burn: 0.035, frostbite: 0.04 };
/** How readily each kind festers (a bite most of all). */
const DIRTY: Record<WoundKind, number> = { cut: 1, stab: 1.3, bite: 1.8, crush: 1, burn: 1.2, frostbite: 0.8, fracture: 0, bruise: 0 };
/** Wounds of a kind and this much at first leave a scar. */
const SCARS = new Set<WoundKind>(['cut', 'stab', 'bite', 'burn', 'frostbite', 'crush']);

const KIND_WORD: Record<WoundKind, string> = { cut: 'cut', stab: 'stab wound', bite: 'bite', bruise: 'bruise', fracture: 'broken bone', crush: 'crushing wound', burn: 'burn', frostbite: 'frostbite' };

/** "is" or "are", for a part named in the plural (the ribs, the teeth). */
const isAre = (name: string) => (name !== 'pelvis' && /(s|teeth)$/.test(name) ? 'are' : 'is');
/** Blood on the skin and clothes for each litre lost (actors/needs.ts, `stain`). */
const STAIN_PER_L = 150;

/** The wound's name in words, with how bad it is ("a deep cut", "a bruise"). */
export function woundWords(w: HealthWound, def: BodyPartDef | undefined = PART.get(w.part)): string {
  const hp = def?.hp ?? 20;
  const r = w.sev / hp;
  if (w.ruin) return w.kind === 'fracture' || w.kind === 'crush' ? 'crushed' : def?.sever ? 'stump' : 'destroyed';
  if (w.kind === 'fracture') return r >= 0.5 ? 'shattered bone' : r >= 0.25 ? 'broken bone' : 'cracked bone';
  if (w.kind === 'bruise') return r >= 0.4 ? 'heavy bruise' : r >= 0.15 ? 'bruise' : 'light bruise';
  if (w.kind === 'burn') return r >= 0.4 ? 'deep burn' : r >= 0.15 ? 'burn' : 'scald';
  if (w.kind === 'frostbite') return r >= 0.4 ? 'black frostbite' : 'frostbite';
  if (w.kind === 'cut') return r >= 0.4 ? 'deep gash' : r >= 0.15 ? 'cut' : 'scratch';
  return `${r >= 0.4 ? 'deep ' : r < 0.15 ? 'small ' : ''}${KIND_WORD[w.kind]}`;
}

/** A bone that can be splinted (a limb's, a finger's, the jaw); the rest knit at rest. */
export function splintable(id: string): boolean {
  const p = PART.get(id);
  return !!p && !p.inside && !['torso', 'neck', 'head', 'pelvis'].includes(id);
}

/** The parts within (and below) a part. */
function within(id: string, plan: BodyPartDef[] = HUMANOID): string[] {
  const out: string[] = [];
  for (const p of plan) if (p.parent === id) out.push(p.id, ...within(p.id, plan));
  return out;
}

/** A part's ancestors, nearest first. */
function ancestors(id: string, parts: Map<string, BodyPartDef> = PART): string[] {
  const out: string[] = [];
  let p = parts.get(id)?.parent;
  while (p) {
    out.push(p);
    p = parts.get(p)?.parent;
  }
  return out;
}

/** A part that does not lie inside another, picked by size (within a region, if one is given). */
export function outerPart(r: () => number, region?: BodyPartDef['region'] | BodyPartDef['region'][], plan: BodyPartDef[] = HUMANOID): BodyPartDef {
  const regions = region === undefined ? null : Array.isArray(region) ? region : [region];
  let list = plan.filter((p) => !p.inside && (!regions || regions.includes(p.region)));
  // A beast's parts have no clothing regions: any part outside.
  if (!list.length) list = plan.filter((p) => !p.inside);
  const total = list.reduce((s, p) => s + p.size, 0);
  let x = r() * total;
  for (const p of list) if ((x -= p.size) <= 0) return p;
  return list[list.length - 1];
}

/** A part inside a part (an organ in the torso, the brain in the skull), by size; none if nothing lies inside. */
function innerPart(r: () => number, id: string, plan: BodyPartDef[] = HUMANOID): BodyPartDef | null {
  const list = plan.filter((p) => p.parent === id && p.inside);
  if (!list.length) return null;
  const total = list.reduce((s, p) => s + p.size, 0);
  let x = r() * total;
  for (const p of list) if ((x -= p.size) <= 0) return p;
  return list[list.length - 1];
}

/** How harm is done: its kind, severity (points), cause, and where (a part; or a region to pick from). */
export interface Harm {
  kind: WoundKind;
  sev: number;
  cause: string;
  part?: string;
  region?: BodyPartDef['region'] | BodyPartDef['region'][];
  /** A blow or bite that may go deeper, into the organs or bones within the part struck (0 to 1). */
  deep?: number;
  /** The game time now (seconds), if time has moved on since the body was last told. */
  now?: number;
}

export class Health extends Component {
  static readonly key = 'health';
  private notes: HealthNote[] = [];
  private now = 0;

  constructor(public d: HealthData) {
    super();
  }

  static fresh(weightKg = 70): HealthData {
    return { blood: Health.bloodMaxFor(weightKg), wounds: [], lost: [], lasting: [], cond: {}, nextId: 1 };
  }

  /** A beast's health: its body plan and weight. */
  static beast(plan: PlanId, kg: number): HealthData {
    return { ...Health.fresh(kg), plan, kg };
  }

  /** The dice, for a body with no Skills of its own to roll them (a beast's); set by whoever keeps it. */
  rng: (() => number) | null = null;
  private scaled = new Map<string, BodyPartDef>();

  get planId(): PlanId {
    return this.d.plan ?? 'humanoid';
  }

  /** A person's sex, for the parts only a man's or a woman's body has (none, if there is no telling). */
  private get sex(): Sex | undefined {
    const id = this.actor?.get(Identity);
    return id ? (id.d.female ? 'f' : 'm') : undefined;
  }

  /** The parts of the body's plan (a person's, with those of their sex). */
  get plan(): BodyPartDef[] {
    return this.planId === 'humanoid' ? humanoidPlan(this.sex) : PLANS[this.planId];
  }

  /** How tough the parts are against a person's: a beast's by its weight (a hare's far less, a bear's more). */
  get scale(): number {
    return this.planId === 'humanoid' ? 1 : clamp(Math.cbrt((this.d.kg ?? 70) / 70), 0.2, 2.6);
  }

  /** A part of the plan, with its toughness as this body has it. */
  partOf(id: string): BodyPartDef | undefined {
    let p = this.scaled.get(id);
    if (!p) {
      const b = PLAN_PARTS[this.planId].get(id);
      if (!b || (b.sex && b.sex !== this.sex)) return undefined;
      p = this.scale === 1 ? b : { ...b, hp: b.hp * this.scale };
      this.scaled.set(id, p);
    }
    return p;
  }

  /** A wound in words, as this body has it. */
  woundWords(w: HealthWound): string {
    return woundWords(w, this.partOf(w.part));
  }

  /** The time the body was last told of (game seconds). */
  get time(): number {
    return this.now;
  }

  static bloodMaxFor(kg: number): number {
    return Math.round(kg * 0.07 * 100) / 100;
  }

  bloodMax(): number {
    return Health.bloodMaxFor(this.d.kg ?? this.actor?.get(Body)?.d.weightKg ?? 70);
  }

  private random(): number {
    return this.rng?.() ?? this.actor?.get(Skills)?.random() ?? Math.random();
  }

  get dead(): boolean {
    return !!this.d.dead;
  }

  // ---- The parts ----------------------------------------------------------------------------

  /** Lost, or below a lost part. */
  isLost(id: string): boolean {
    return this.d.lost.includes(id) || ancestors(id, PLAN_PARTS[this.planId]).some((a) => this.d.lost.includes(a) && this.partOf(a)?.sever);
  }

  /** How well a part works now, 0 to 1: its wounds, broken bones, lasting harm, and whether it is there. */
  eff(id: string): number {
    const def = this.partOf(id);
    if (!def || this.isLost(id)) return 0;
    let harm = 0, broken = 1;
    for (const w of this.d.wounds) {
      if (w.part !== id) continue;
      harm += w.sev;
      // A broken bone fails the part until it knits; a splint lets it bear a little.
      if (w.kind === 'fracture' && w.sev >= def.hp * 0.15) broken = Math.min(broken, w.splinted ? 0.5 : 0.2);
    }
    let e = clamp(1 - harm / def.hp, 0, 1) * broken;
    for (const l of this.d.lasting) if (l.part === id) e *= l.eff;
    return e;
  }

  /**
   * A limb with what hangs from it (an arm, its hand and fingers), as the share each gives: what
   * is below works only as well as what holds it (a broken arm fails its hand too).
   */
  private limb(arm: string, hand: string, digits: string[], wArm: number, wHand: number): number {
    // A thumb or a big toe counts for more than the others.
    const weights = digits.map((d) => (d.startsWith('thumb') || d.startsWith('t1') ? 1.6 : 1));
    const k = (1 - wArm - wHand) / weights.reduce((s, x) => s + x, 0);
    const below = digits.reduce((s, d, i) => s + this.eff(d) * weights[i] * k, 0);
    return this.eff(arm) * (wArm + this.eff(hand) * (wHand + below));
  }

  /** The blood left as a share of the most, 0 to 1. */
  bloodShare(): number {
    return clamp(this.d.blood / this.bloodMax(), 0, 1);
  }

  /** Pain, 0 (none) to 1 (past bearing). */
  pain(): number {
    let sum = 0;
    for (const w of this.d.wounds) {
      const def = this.partOf(w.part);
      let p = Math.min(w.sev, def?.hp ?? w.sev) * PAIN[w.kind] * (def?.inside ? 1.2 : 1) * (def?.pain ?? 1);
      if (w.kind === 'fracture' && w.splinted) p *= 0.5;
      if (w.poultice !== undefined) p *= 0.85;
      if (w.infection) p += w.infection * 6;
      sum += p;
    }
    const will = this.actor?.get(Traits)?.get('willpower') ?? 10;
    let pain = (1 - Math.exp(-sum / 35)) * clamp(1.25 - will / 40, 0.6, 1.2);
    if (this.d.eased !== undefined && this.now < this.d.eased) pain *= 0.5;
    return clamp(pain, 0, 1);
  }

  /** The pain in words. */
  painWord(): string {
    const p = this.pain();
    return p >= 0.8 ? 'Unbearable pain' : p >= 0.55 ? 'Intense pain' : p >= 0.3 ? 'Serious pain' : p >= 0.1 ? 'Minor pain' : '';
  }

  /** The capacities, 0 to 1 each. */
  capacities(): Record<Capacity, number> {
    if (this.planId !== 'humanoid') return this.beastCapacities();
    const e = (id: string) => this.eff(id);
    const pair = (a: number, b: number, one: number) => Math.max(a, b) * one + Math.min(a, b) * (1 - one);
    const blood = this.bloodShare();
    const bloodC = blood >= 0.85 ? 1 : blood <= 0.5 ? 0.15 : 0.15 + ((blood - 0.5) / 0.35) * 0.85;
    const pumping = e('heart');
    const breathing = ((e('lung.l') + e('lung.r')) / 2 * 0.8 + e('ribs') * 0.2) * Math.min(1, 0.4 + e('neck')) * (1 - (this.d.cond.drowning ?? 0) * 0.9);
    const filtering = e('liver') * 0.5 + e('kidneys') * 0.5;
    const pain = this.pain();
    let cond = 0;
    for (const [k, v] of Object.entries(this.d.cond)) if (k !== 'concussion') cond += Math.max(0, (v ?? 0) - 0.35) * 1.3;
    for (const w of this.d.wounds) if (w.infection) cond += Math.max(0, w.infection - 0.4) * 1.2;
    const consciousness = clamp(
      e('brain') * (1 - (this.d.cond.concussion ?? 0)) * Math.min(1, 0.3 + 0.7 * pumping) * Math.min(1, 0.25 + 0.75 * breathing) * bloodC * (1 - Math.max(0, pain - 0.35) * 1.1) * (1 - Math.min(0.9, cond)) * Math.min(1, 0.6 + filtering * 0.4),
      0, 1,
    );
    const side = (s: 'l' | 'r') => this.limb(`leg.${s}`, `foot.${s}`, ['t1', 't2', 't3', 't4', 't5'].map((t) => `${t}.${s}`), 0.5, 0.35);
    const arm = (s: 'l' | 'r') => this.limb(`arm.${s}`, `hand.${s}`, ['thumb', 'f2', 'f3', 'f4', 'f5'].map((t) => `${t}.${s}`), 0.25, 0.35);
    const awake = Math.min(1, consciousness * 1.25);
    const moving = clamp(pair(side('l'), side('r'), 0.3) * e('spine') * Math.min(1, e('pelvis') * 1.5) * awake * Math.min(1, 0.4 + 0.6 * breathing) * Math.min(1, 0.4 + 0.6 * bloodC), 0, 1);
    const manipulation = clamp(pair(arm('l'), arm('r'), 0.5) * awake * Math.min(1, 0.5 + 0.5 * e('spine')), 0, 1);
    return {
      consciousness,
      moving,
      manipulation,
      sight: pair(e('eye.l'), e('eye.r'), 0.75) * Math.min(1, consciousness * 1.5),
      hearing: pair(e('ear.l'), e('ear.r'), 0.75) * Math.min(1, consciousness * 1.5),
      breathing: clamp(breathing, 0, 1),
      pumping,
      filtering,
      talking: clamp((e('jaw') * 0.7 + Math.min(1, e('neck') * 1.4) * 0.3) * awake, 0, 1),
      eating: clamp(e('jaw') * 0.6 + e('teeth') * 0.4, 0, 1),
    };
  }

  /** What harms the mind: pain, blood lost, the conditions and fevers (the share of consciousness left). */
  private mindFactors(breathing: number, pumping: number, filtering: number): number {
    const blood = this.bloodShare();
    const bloodC = blood >= 0.85 ? 1 : blood <= 0.5 ? 0.15 : 0.15 + ((blood - 0.5) / 0.35) * 0.85;
    const pain = this.pain();
    let cond = 0;
    for (const [k, v] of Object.entries(this.d.cond)) if (k !== 'concussion') cond += Math.max(0, (v ?? 0) - 0.35) * 1.3;
    for (const w of this.d.wounds) if (w.infection) cond += Math.max(0, w.infection - 0.4) * 1.2;
    return (1 - (this.d.cond.concussion ?? 0)) * Math.min(1, 0.3 + 0.7 * pumping) * Math.min(1, 0.25 + 0.75 * breathing) * bloodC * (1 - Math.max(0, pain - 0.35) * 1.1) * (1 - Math.min(0.9, cond)) * Math.min(1, 0.6 + filtering * 0.4);
  }

  /**
   * A beast's capacities (combat.md, stage 2): moving on four legs (three carry it, lamely), on two
   * (a bird's), or on its body (a serpent's); flying on both wings (a bird's `manipulation`, kept for
   * its wings); biting with its jaws (`eating`).
   */
  private beastCapacities(): Record<Capacity, number> {
    const e = (id: string) => (this.partOf(id) ? this.eff(id) : 0);
    const pair = (a: number, b: number, one: number) => Math.max(a, b) * one + Math.min(a, b) * (1 - one);
    const blood = this.bloodShare();
    const bloodC = blood >= 0.85 ? 1 : blood <= 0.5 ? 0.15 : 0.15 + ((blood - 0.5) / 0.35) * 0.85;
    const pumping = e('heart');
    const lungs = this.partOf('lung.r') ? (e('lung.l') + e('lung.r')) / 2 : e('lung.l');
    const breathing = clamp((lungs * 0.8 + e('ribs') * 0.2) * Math.min(1, 0.4 + e('neck')) * (1 - (this.d.cond.drowning ?? 0) * 0.9), 0, 1);
    const filtering = clamp(e('liver') * 0.7 + 0.3, 0, 1);
    const consciousness = clamp(e('brain') * this.mindFactors(breathing, pumping, filtering), 0, 1);
    const awake = Math.min(1, consciousness * 1.25), body = Math.min(1, 0.4 + 0.6 * breathing) * Math.min(1, 0.4 + 0.6 * bloodC) * e('spine');
    let moving: number, wings = 0;
    if (this.planId === 'quad') {
      const legs = (['fl', 'fr', 'hl', 'hr'] as const).map((s) => e(`leg.${s}`) * (0.75 + 0.25 * e(`foot.${s}`)));
      moving = Math.pow(legs.reduce((a, b) => a + b, 0) / 4, 1.6);
    } else if (this.planId === 'bird') {
      moving = pair(e('leg.l'), e('leg.r'), 0.4);
      wings = Math.min(e('wing.l'), e('wing.r'));
    } else moving = e('torso') * (0.7 + 0.3 * e('tail'));
    return {
      consciousness,
      moving: clamp(moving * body * awake, 0, 1),
      manipulation: clamp(wings * awake * body, 0, 1),
      sight: pair(e('eye.l'), e('eye.r'), 0.75) * Math.min(1, consciousness * 1.5),
      hearing: (this.partOf('ear.l') ? pair(e('ear.l'), e('ear.r'), 0.75) : 1) * Math.min(1, consciousness * 1.5),
      breathing,
      pumping,
      filtering,
      talking: 0,
      eating: clamp((e('jaw') * 0.7 + (this.partOf('teeth') ? e('teeth') * 0.3 : 0.3)) * awake, 0, 1),
    };
  }

  /** Senseless: consciousness too low to act (fainted, or out cold). */
  senseless(c = this.capacities()): boolean {
    return c.consciousness < 0.25;
  }

  /** Bleeding now (ml an hour), for one wound. */
  bleedOf(w: HealthWound): number {
    if (!OPEN.has(w.kind) && !(w.kind === 'fracture' && w.sev >= (this.partOf(w.part)?.hp ?? 20) * 0.5)) return 0;
    const def = this.partOf(w.part);
    const pb = def?.bleed ?? 1;
    // A ruined part bleeds as much as the part could, no more (a finger's stump, not a torso's worth).
    const sev = Math.min(w.sev, def?.hp ?? w.sev);
    let ml = sev * (w.kind === 'fracture' ? 6 : BLEED[w.kind]) * pb * (w.ruin && def?.sever ? 1.3 : 1) * this.smallBleed();
    if (w.stitched !== undefined) return ml * 0.04 * (1.5 - w.stitched);
    // Small wounds clot in time, and a bandage helps them; deep ones and those of the neck and the
    // organs do not clot on their own.
    const age = (this.now - w.at) / H;
    const deep = Math.min(w.start, def?.hp ?? w.start) * pb >= 9;
    // A bandage lets even a deep wound clot, in time (from when it went on, roughly).
    const clotH = (0.4 + w.start * 0.25) * (w.bandaged !== undefined ? (deep ? 1 : 0.5) : 1);
    if (w.bandaged !== undefined) ml *= 1 - 0.75 * w.bandaged;
    if (!deep || w.bandaged !== undefined) ml *= clamp(1 - age / clotH, 0, 1);
    return ml;
  }

  /**
   * A small beast bleeds out the faster for the same wound (its blood is so much less): twice as
   * fast at about 5 kg, more for the smallest; a person or a beast of a person's size, as it is.
   */
  private smallBleed(): number {
    const kg = this.d.kg;
    if (!this.d.plan || this.d.plan === 'humanoid' || !kg) return 1;
    return Math.min(4, Math.max(1, Math.pow(60 / kg, 0.3)));
  }

  /**
   * How much of a beast's body its open wounds and broken bones have torn (the struck parts'
   * wounds against each part's toughness, the body's counting most, a limb taken off much): enough of it and the beast
   * dies of the shock in moments, as game shot through does.
   */
  trauma(): number {
    if (!this.d.plan || this.d.plan === 'humanoid') return 0;
    let t = 0;
    for (const w of this.d.wounds) {
      if (w.kind === 'bruise') continue;
      const def = this.partOf(w.part);
      if (!def) continue;
      const share = Math.min(1, w.sev / Math.max(0.5, def.hp));
      // A limb or wing taken off is a great shock to a beast (half enough to kill it, and more for the small).
      const lost = w.ruin ? Math.min(1, 0.3 + 0.15 * Math.max(0, 3 - Math.log10(Math.max(0.1, this.d.kg ?? 60)) * 1.5)) : 0;
      t += Math.max(lost, share * (def.id === 'torso' ? 1 : def.vital || def.inside ? 0.8 : 0.25));
    }
    // The smaller the beast, the less hurt it takes to kill it (a hare by a wound a deer would run off).
    return t * Math.min(2, Math.max(1, (60 / Math.max(0.1, this.d.kg ?? 60)) ** 0.15));
  }

  /** All the bleeding now (ml an hour). */
  bleeding(): number {
    return this.d.wounds.reduce((s, w) => s + this.bleedOf(w), 0);
  }

  bleedWord(): string {
    const b = this.bleeding();
    return b >= 600 ? 'Bleeding heavily' : b >= 200 ? 'Bleeding' : b >= 40 ? 'Bleeding a little' : '';
  }

  bloodWord(): string {
    const s = this.bloodShare();
    return s < 0.6 ? 'Faint from blood loss' : s < 0.75 ? 'Weak from blood loss' : s < 0.9 ? 'Pale' : '';
  }

  /** How much the body's state slows a step (1 not at all). */
  slow(): number {
    const m = this.capacities().moving;
    if (m <= 0.08) return 8;
    return Math.min(8, 1 / Math.pow(m, 0.8));
  }

  /** Check modifiers for the body's state (actors/checks.ts): pain, consciousness, and the capacities a kind of skill needs. */
  mods(group: string | undefined): { why: string; value: number }[] {
    const out: { why: string; value: number }[] = [];
    const c = this.capacities();
    const p = this.pain();
    if (p >= 0.1) out.push({ why: 'pain', value: -Math.round(p * 20) });
    // Dazed beyond what the pain already counts; the hands and legs as the limbs are (not the mind).
    const mind = Math.max(0.05, Math.min(1, c.consciousness * 1.25));
    if (c.consciousness < 0.8) out.push({ why: 'dazed', value: -Math.round((0.8 - c.consciousness) * 30) });
    const hands = Math.min(1, c.manipulation / mind), legs = Math.min(1, c.moving / mind);
    if ((group === 'Crafting' || group === 'Combat' || group === 'Subterfuge') && hands < 0.95) out.push({ why: 'your hands', value: -Math.round((1 - hands) * 25) });
    if ((group === 'Physical' || group === 'Combat') && legs < 0.95) out.push({ why: 'your legs', value: -Math.round((1 - legs) * 20) });
    return out;
  }

  // ---- Harm ---------------------------------------------------------------------------------

  /**
   * Does harm: a wound of a kind on a part (or one picked by size within the region), and, for a
   * deep blow, a share of it to an organ or bone within. Returns the wounds made (none if the
   * part is already lost).
   */
  hurt(h: Harm): HealthWound[] {
    if (this.d.dead || h.sev <= 0) return [];
    if (h.now !== undefined) this.now = h.now;
    const r = () => this.random();
    let part = h.part ? this.partOf(h.part) : this.partOf(outerPart(r, h.region, this.plan).id);
    if (!part) return [];
    // A lost part cannot be hurt; the blow falls on what is left above it.
    while (part && this.isLost(part.id)) part = part.parent ? this.partOf(part.parent) : undefined;
    if (!part) return [];
    const made: HealthWound[] = [];
    let sev = h.sev;
    // A deep blow: part of it goes on inside (a stab into the chest, a blow through the skull). A
    // beast's body is narrow to a point: a stab (an arrow, a spear) goes on inside more often.
    const beast = !!this.d.plan && this.d.plan !== 'humanoid';
    const deep = h.deep && beast && h.kind === 'stab' ? Math.min(0.9, h.deep * 1.6) : h.deep;
    if (deep && r() < deep) {
      const innerDef = innerPart(r, part.id, this.plan);
      const inner = innerDef ? this.partOf(innerDef.id) : undefined;
      if (inner && !this.isLost(inner.id)) {
        const share = sev * (0.4 + r() * 0.3);
        sev -= share;
        const deeperKind: WoundKind = h.kind === 'bruise' || h.kind === 'crush' ? (inner.id === 'ribs' || inner.id === 'skull' || inner.id === 'spine' || inner.id === 'teeth' ? 'fracture' : 'crush') : h.kind === 'fracture' ? 'crush' : h.kind;
        made.push(...this.wound(inner, deeperKind, share, h.cause));
        // Through the skull to the brain.
        const deeperDef = r() < deep * 0.5 ? innerPart(r, inner.id, this.plan) : null;
        const deeper = deeperDef ? this.partOf(deeperDef.id) : null;
        if (deeper) made.push(...this.wound(deeper, h.kind === 'stab' ? 'stab' : 'crush', share * 0.5, h.cause));
      }
    }
    made.push(...this.wound(part, h.kind, sev, h.cause));
    if (this.trauma() >= TRAUMA_DEATH) this.die('the shock of its wounds');
    this.touched();
    return made;
  }

  private wound(part: BodyPartDef, kind: WoundKind, sev: number, cause: string): HealthWound[] {
    sev = Math.round(sev * 10) / 10;
    if (sev <= 0) return [];
    const w: HealthWound = { id: this.d.nextId++, part: part.id, kind, sev, start: sev, at: this.now, cause };
    this.d.wounds.push(w);
    // A beast struck in the heart, the lungs, the liver, the brain or the neck, deeply enough, is
    // done for: the heart or the brain at once, the rest within minutes, as it runs (game falls to
    // a good shot; a person's wounds go by their bleeding, and treatment can save them).
    // A small beast's head is mostly brain: a stab through it is as quick.
    const small = (this.d.kg ?? 60) < 10;
    const MORTAL = small ? /^(heart|lung\.[lr]|liver|brain|neck|head|skull)$/ : /^(heart|lung\.[lr]|liver|brain|neck)$/;
    if (this.d.plan && this.d.plan !== 'humanoid' && MORTAL.test(part.id) && OPEN.has(kind)) {
      const share = sev / Math.max(0.5, part.hp);
      if (share >= 0.08) {
        const quick = part.id === 'heart' || part.id === 'brain' || (small && (part.id === 'head' || part.id === 'skull'));
        // The lungs and the neck within minutes, the liver within the hour or so.
        const secs = quick ? 20 : part.id === 'liver' ? Math.max(300, (1 - Math.min(1, share * 2)) * 2700) : Math.max(40, (1 - Math.min(1, share * 2)) * 600);
        const at = this.now + Math.round(secs);
        if (!this.d.mortal || at < this.d.mortal.at) this.d.mortal = { at, part: part.name };
      }
    }
    // A blow to the head stuns (combat.md, stage 3): a concussion that dims the mind, and passes.
    if ((part.id === 'head' || part.id === 'skull' || part.id === 'brain' || part.id === 'jaw') && (kind === 'bruise' || kind === 'fracture' || kind === 'crush')) {
      const was = this.d.cond.concussion ?? 0;
      this.d.cond.concussion = clamp(was + (sev / part.hp) * 1.6, 0, 0.95);
      if (this.d.cond.concussion >= 0.3 && was < 0.3) this.note('Your head rings from the blow.', true);
    }
    // Ruined: the part's wounds reach its toughness. Bruises alone never ruin a part, however many
    // (they hurt, and a hard enough blow breaks the bone beneath instead): at most 0.6 of it.
    const mine = this.d.wounds.filter((x) => x.part === part.id);
    const bruised = mine.filter((x) => x.kind === 'bruise').reduce((s, x) => s + x.sev, 0);
    const harm = mine.filter((x) => x.kind !== 'bruise').reduce((s, x) => s + x.sev, 0) + Math.min(bruised, part.hp * 0.6);
    if (harm >= part.hp && !this.d.lost.includes(part.id)) this.ruin(part, w);
    return [w];
  }

  private ruin(part: BodyPartDef, w: HealthWound): void {
    this.d.lost.push(part.id);
    w.ruin = true;
    // The wounds below a lost part go with it.
    if (part.sever) {
      const gone = new Set(within(part.id, this.plan));
      this.d.wounds = this.d.wounds.filter((x) => !gone.has(x.part));
      this.note(`Your ${part.name} ${isAre(part.name)} ${w.kind === 'crush' || w.kind === 'fracture' ? 'crushed beyond saving' : w.kind === 'frostbite' ? 'black with frostbite, and lost' : 'torn away'}.`, true);
    } else this.note(`Your ${part.name} ${isAre(part.name)} ${part.id.startsWith('eye') ? 'blinded' : 'ruined'}.`, true);
    // A vital part, or the body itself, ruined: death.
    if (part.vital || part.id === 'torso') this.die(`a ruined ${part.name}${w.cause ? `, from ${w.cause}` : ''}`);
  }

  /** Dies (once). */
  die(cause: string): void {
    if (this.d.dead) return;
    this.d.dead = { cause, at: this.now };
    this.note('You die.', true);
    this.touched();
  }

  /** A fall of so many metres: bruises, and broken bones in a hard one (falls on the legs, the arms put out, the head). */
  fall(metres: number, cause = 'a fall', now?: number): HealthWound[] {
    if (now !== undefined) this.now = now;
    const r = () => this.random();
    const out: HealthWound[] = [];
    const hits = 1 + (metres >= 3 ? 1 : 0) + (metres >= 6 ? 1 : 0);
    for (let i = 0; i < hits; i++) {
      const region = (['legs', 'feet', 'legs', 'arms', 'hands', 'torso', 'waist', 'head'] as const)[Math.floor(r() * (metres >= 4 ? 8 : 7))];
      const sev = metres * (1.2 + r() * 1.4) / (i ? 1.6 : 1);
      const broke = r() < Math.min(0.85, metres / 9);
      out.push(...this.hurt({ kind: broke ? 'fracture' : 'bruise', sev, cause, region, deep: region === 'head' || region === 'torso' ? Math.min(1, metres / 8) : 0 }));
    }
    // A long fall jars the whole body: the organs within the chest and belly, or the skull.
    if (metres >= 5) out.push(...this.hurt({ kind: 'crush', sev: metres * (0.6 + r() * 0.8), cause, part: r() < 0.25 ? 'head' : 'torso', deep: 1 }));
    return out;
  }

  /**
   * Venom from a bite (a viper's): it spreads for an hour or so, then the body throws it off, slowly.
   * Enough of it kills; a small body takes it worse.
   */
  envenom(amount: number): void {
    const kg = this.d.kg ?? this.actor?.get(Body)?.d.weightKg ?? 70;
    const dose = amount * clamp(Math.pow(70 / kg, 0.5), 0.5, 4);
    this.d.cond.venom = clamp((this.d.cond.venom ?? 0) + dose * 0.4, 0, 1);
    this.d.venomLeft = (this.d.venomLeft ?? 0) + dose * 0.6;
    this.note('Burning pain spreads from the bite: venom.', true);
  }

  /** Swallowing water, going under (to 1: drowned). */
  choke(amount: number): void {
    this.d.cond.drowning = clamp((this.d.cond.drowning ?? 0) + amount, 0, 1);
    if ((this.d.cond.drowning ?? 0) >= 0.5) this.note('You are drowning.', true);
  }

  // ---- Time ---------------------------------------------------------------------------------

  onMessage(m: Message): boolean {
    if (m.type !== 'time.passed') return false;
    const { dt, ctx, now } = (m as Message<'time.passed'>).payload;
    this.advance(dt, ctx ?? {}, now);
    return true;
  }

  /** Lets time pass for the body (a beast's is told by whoever keeps it, a person's by the cast's clock). */
  advance(dt: number, ctx: TimeCtx, now: number): void {
    if (dt <= 0) {
      this.now = Math.max(this.now, now);
      return;
    }
    let left = dt;
    let t = now - dt;
    while (left > 0 && !this.d.dead) {
      const step = Math.min(left, 600);
      t += step;
      this.now = t;
      this.step(step, ctx ?? {});
      left -= step;
    }
    this.now = now;
    this.review();
  }

  /** Sets the time without passing any (a game begun or loaded). */
  setNow(t: number): void {
    this.now = t;
  }

  private step(dt: number, ctx: TimeCtx): void {
    const d = this.d, h = dt / H;
    const act: Activity = ctx.activity ?? 'rest';
    const needs = this.actor?.get(Needs), n = needs?.d;

    // ---- Blood: lost to the wounds (and onto the skin and clothes), made again (faster fed and watered).
    const lost = this.bleeding() / 1000;
    if (lost > 0) needs?.stain(lost * h * STAIN_PER_L);
    const max = this.bloodMax();
    const fed = n ? clamp(Math.min(n.nourish, n.hydrated) / 60, 0.2, 1) : 1;
    d.blood = clamp(d.blood - lost * h + (lost < 0.02 ? 0.02 * fed * h : 0), 0, max);
    if (d.blood / max < 0.45) return this.die(this.bleedCause());
    // A beast torn through: it drops (fieldcraft.md; a shot through the body kills game quickly).
    if (this.trauma() >= TRAUMA_DEATH) return this.die('the shock of its wounds');
    if (this.d.mortal && this.now >= this.d.mortal.at) return this.die(`a mortal wound to the ${this.d.mortal.part}`);

    // ---- A concussion passes in an hour or two.
    if (d.cond.concussion) {
      d.cond.concussion = Math.max(0, d.cond.concussion - 0.5 * h);
      if (!d.cond.concussion) delete d.cond.concussion;
    }

    // ---- Venom: still spreading for a while, then thrown off.
    if (d.venomLeft) {
      const take = Math.min(d.venomLeft, 0.5 * h);
      d.venomLeft -= take;
      d.cond.venom = clamp((d.cond.venom ?? 0) + take, 0, 1);
      if (d.venomLeft <= 1e-4) delete d.venomLeft;
    } else if (d.cond.venom) {
      d.cond.venom = Math.max(0, d.cond.venom - 0.04 * h);
      if (!d.cond.venom) delete d.cond.venom;
    }
    if ((d.cond.venom ?? 0) >= 1) return this.die('venom');

    // ---- Conditions from the needs and the water.
    if (n) {
      const c = d.cond;
      const grow = (id: ConditionId, by: number) => {
        c[id] = clamp((c[id] ?? 0) + by * h, 0, 1);
        if (!c[id]) delete c[id];
      };
      if (n.hydrated < 15) grow('dehydration', ((15 - n.hydrated) / 15) * 0.05 + 0.005);
      else if (n.hydrated > 50) grow('dehydration', -0.1);
      if (n.nourish < 10) grow('starvation', ((10 - n.nourish) / 10) * 0.006 + 0.0005);
      else if (n.nourish > 30) grow('starvation', -0.02);
      if (n.heat <= -70) grow('hypothermia', ((-n.heat - 70) / 25) * 0.15 + 0.05);
      else if (n.heat > -40) grow('hypothermia', -0.25);
      if (n.heat >= 70) grow('heatstroke', ((n.heat - 70) / 25) * 0.15 + 0.04);
      else if (n.heat < 40) grow('heatstroke', -0.2);
      if (act !== 'swim') grow('drowning', -3);
      for (const [id, v] of Object.entries(c) as [ConditionId, number][]) if (v >= 1) return this.die(CONDITION_DEATH[id]);
      // Frostbite on what is bare in a bitter cold.
      if (n.heat <= -40 && (n.feltC ?? n.airC) < -5) this.frost(h, -(n.feltC ?? n.airC) - 5, n.heat <= -70);
    }

    // ---- Healing and infection.
    const rest = act === 'sleep' ? 1.6 : act === 'rest' ? 1.3 : act === 'work' || act === 'swim' ? 0.7 : 1;
    const food = n ? (n.nourish < 25 ? 0.3 : n.nourish < 50 ? 0.6 : 1) * (n.hydrated < 40 ? 0.5 : 1) : 1;
    const con = this.actor?.get(Traits)?.get('constitution') ?? 10;
    const body = Math.sqrt(con / 10);
    // A filthy skin festers the more (actors/needs.ts, Keeping clean).
    const filth = needs?.festering() ?? 1;
    const healed: HealthWound[] = [];
    for (const w of d.wounds) {
      const age = (this.now - w.at) / H;
      // Festering, in the first two days of an open wound not yet closed by healing.
      if (OPEN.has(w.kind) && w.infection === undefined && age >= 4 && age <= 52) {
        const risk = Math.min(0.6, 0.035 * w.start) * DIRTY[w.kind] * filth * (w.cleaned !== undefined ? 0.25 * (1.4 - w.cleaned) : 1) * (w.poultice !== undefined ? 0.5 : 1) * (w.stitched !== undefined && w.cleaned === undefined ? 1.5 : 1);
        if (this.random() < (risk / 48) * h) {
          w.infection = 0.02;
          w.immunity = 0;
          this.note(`Your ${this.woundWords(w)} on the ${this.partOf(w.part)?.name ?? w.part} has begun to fester.`, true);
        }
      }
      if (w.infection !== undefined) {
        const herb = w.poultice !== undefined && this.now - w.poultice < 12 * H ? 1.4 : 1;
        w.infection = clamp(w.infection + 0.03 * h, 0, 1);
        w.immunity = clamp((w.immunity ?? 0) + 0.035 * body * rest * food * herb * h, 0, 1);
        if (w.immunity >= 1) {
          delete w.infection;
          delete w.immunity;
          this.note(`The festering in your ${this.partOf(w.part)?.name ?? w.part} has gone.`, false);
        } else if (w.infection >= 1) return this.die('an infected wound');
        continue;
      }
      let rate = HEAL[w.kind] * rest * food * body;
      if (w.stitched !== undefined && (w.kind === 'cut' || w.kind === 'stab' || w.kind === 'bite')) rate *= 1.3 + w.stitched * 0.4;
      if (w.bandaged !== undefined) rate *= 1.15;
      if (w.kind === 'fracture' && w.splinted !== undefined) rate *= 1.2;
      if (w.ruin) rate *= 0.6;
      w.sev = Math.max(0, w.sev - rate * h);
      if (w.sev <= 0) healed.push(w);
    }
    for (const w of healed) this.healed(w);
  }

  /** What bled the person dry, in words. */
  private bleedCause(): string {
    const w = [...this.d.wounds].sort((a, b) => this.bleedOf(b) - this.bleedOf(a))[0];
    return w ? `loss of blood (${this.woundWords(w)} to the ${this.partOf(w.part)?.name ?? w.part}, from ${w.cause})` : 'loss of blood';
  }

  /** A wound healed: gone, leaving a scar if it was bad, or lasting harm if a bone knit crooked. */
  private healed(w: HealthWound): void {
    this.d.wounds = this.d.wounds.filter((x) => x !== w);
    const def = this.partOf(w.part);
    const name = def?.name ?? w.part;
    const body = this.actor?.get(Body);
    if (w.kind === 'fracture' && w.start >= (def?.hp ?? 20) * 0.15 && w.splinted === undefined && splintable(w.part)) {
      const eff = 0.75;
      this.d.lasting.push({ part: w.part, eff, text: `a ${name} that knit crooked` });
      body?.d.wounds.push({ part: w.part, kind: 'fracture', severity: Math.round(w.start), scar: `a ${name} that knit crooked, from ${w.cause}` });
      this.note(`The bone in your ${name} has knit, but crooked: it will never be quite right.`, false);
      return;
    }
    if (w.ruin) {
      body?.d.wounds.push({ part: w.part, kind: w.kind, severity: Math.round(w.start), scar: def?.sever ? `a lost ${name}, from ${w.cause}` : `a ruined ${name}, from ${w.cause}` });
      this.note(`What is left of your ${name} has healed.`, false);
      return;
    }
    if (SCARS.has(w.kind) && w.start >= Math.max(3, (def?.hp ?? 20) * 0.15)) {
      body?.d.wounds.push({ part: w.part, kind: w.kind, severity: Math.round(w.start), scar: `a scar on the ${name}, from ${w.cause}` });
      this.note(`The ${this.woundWords({ ...w, sev: w.start })} on your ${name} has healed, leaving a scar.`, false);
    } else if (w.start >= 2) this.note(`The ${KIND_WORD[w.kind]} on your ${name} has healed.`, false);
  }

  /** Frostbite on bare fingers, toes, ears and nose in a bitter cold (`bite` degrees below -5 °C felt). */
  private frost(h: number, bite: number, hypothermic: boolean): void {
    const covered = new Set<string>();
    for (const it of this.actor?.get(Inventory)?.worn() ?? []) for (const r of defOf(it).wear?.regions ?? []) covered.add(r);
    const spots: [string, string][] = [['hands', 'hands'], ['feet', 'feet'], ['head', 'ear'], ['face', 'nose']];
    for (const [region, kind] of spots) {
      const p = (bite / 120) * (hypothermic ? 2 : 1) * (covered.has(region) ? 0.12 : 1) * h;
      if (this.random() >= p) continue;
      const parts = this.plan.filter((x) => x.region === region && !x.inside && (kind === 'hands' ? /^(thumb|f\d)/.test(x.id) : kind === 'feet' ? /^t\d/.test(x.id) : x.id.startsWith(kind)) && !this.isLost(x.id));
      if (!parts.length) continue;
      const part = parts[Math.floor(this.random() * parts.length)];
      const w = this.hurt({ kind: 'frostbite', sev: 1.5 + this.random() * 3, part: part.id, cause: 'the cold' })[0];
      if (w && !w.ruin) this.note(`Your ${part.name} ${part.name.endsWith('s') ? 'are' : 'is'} white and numb: frostbite.`, true);
    }
  }

  // ---- Words, notes, moodlets ---------------------------------------------------------------

  private note(text: string, bad: boolean): void {
    // A beast's body says nothing of itself (the fight tells what is seen of it).
    if (this.planId !== 'humanoid') return;
    this.notes.push({ text, bad });
  }

  private said: Record<string, string> = {};

  /** Notes of changes in pain, bleeding and blood (and moodlets for the pain). */
  private review(): void {
    if (this.planId !== 'humanoid') return;
    const checks: [string, string, Record<string, string>][] = [
      ['pain', this.painWord(), { 'Minor pain': 'You are in some pain.', 'Serious pain': 'You are in serious pain.', 'Intense pain': 'The pain is intense.', 'Unbearable pain': 'The pain is past bearing.' }],
      ['bleed', this.bleedWord(), { 'Bleeding a little': 'You are bleeding a little.', Bleeding: 'You are bleeding.', 'Bleeding heavily': 'You are bleeding heavily!' }],
      ['blood', this.bloodWord(), { Pale: 'You have lost some blood; you feel light-headed.', 'Weak from blood loss': 'You are weak from loss of blood.', 'Faint from blood loss': 'You are close to fainting from loss of blood.' }],
    ];
    const ORDER: Record<string, string[]> = {
      pain: ['', 'Minor pain', 'Serious pain', 'Intense pain', 'Unbearable pain'],
      bleed: ['', 'Bleeding a little', 'Bleeding', 'Bleeding heavily'],
      blood: ['', 'Pale', 'Weak from blood loss', 'Faint from blood loss'],
    };
    const mood = this.actor?.get(Mood);
    for (const [k, now, text] of checks) {
      const before = this.said[k] ?? '';
      if (now === before) continue;
      this.said[k] = now;
      const worse = ORDER[k].indexOf(now) > ORDER[k].indexOf(before);
      if (now) this.note(text[now], worse && (k !== 'pain' || ORDER.pain.indexOf(now) >= 2));
      else this.note(k === 'pain' ? 'The pain has eased.' : k === 'bleed' ? 'Your bleeding has stopped.' : 'Your strength is coming back.', false);
      if (k === 'pain' && mood) {
        mood.moodlets = mood.moodlets.filter((x) => x.id !== 'health.pain');
        const v = { 'Minor pain': -2, 'Serious pain': -6, 'Intense pain': -12, 'Unbearable pain': -20 }[now];
        if (v) mood.add({ id: 'health.pain', text: now, value: v });
      }
    }
  }

  /** Notes since last asked (cleared). */
  takeNotes(): HealthNote[] {
    const n = this.notes;
    this.notes = [];
    return n;
  }

  /** The state in a few words for the panel ("Bleeding", "Serious pain", "Wounded"), and a bar (0 bad, 1 whole). */
  summary(): { word: string; bar: number } {
    const c = this.capacities();
    const word = this.bleedWord() || this.bloodWord() || this.painWord() || (this.d.wounds.some((w) => w.infection) ? 'Festering wound' : '') || (Object.keys(this.d.cond).length ? CONDITION_NAMES[Object.keys(this.d.cond)[0] as ConditionId] : '') || (this.d.wounds.length ? 'Wounded' : '');
    const worst = Math.min(c.consciousness, c.moving, c.manipulation, c.breathing, this.bloodShare() >= 0.85 ? 1 : (this.bloodShare() - 0.45) / 0.4);
    return { word, bar: clamp(worst, 0, 1) };
  }

  /**
   * The developer's escape from death (game/save.ts, `reviveSave`): alive again, with the vital
   * parts whole, enough blood, no condition or infection near its end. Not part of play.
   */
  static revive(d: HealthData, weightKg = 70): void {
    delete d.dead;
    const vital = new Set(HUMANOID.filter((p) => p.vital).map((p) => p.id));
    d.lost = d.lost.filter((id) => !vital.has(id));
    d.wounds = d.wounds.filter((w) => !vital.has(w.part));
    for (const w of d.wounds) {
      if (w.infection !== undefined) w.infection = Math.min(w.infection, 0.3);
      if (!w.bandaged) w.bandaged = 1;
    }
    for (const k of Object.keys(d.cond) as ConditionId[]) d.cond[k] = Math.min(d.cond[k] ?? 0, 0.3);
    d.blood = Math.max(d.blood, Health.bloodMaxFor(weightKg) * 0.8);
  }

  toJSON(): HealthData {
    return JSON.parse(JSON.stringify(this.d));
  }

  static fromJSON(d: HealthData): Health {
    const f = Health.fresh();
    return new Health({ ...f, ...d, wounds: d.wounds ?? [], lost: d.lost ?? [], lasting: d.lasting ?? [], cond: d.cond ?? {}, nextId: d.nextId ?? 1 });
  }
}

/** The death each condition brings, in words. */
const CONDITION_DEATH: Record<ConditionId, string> = {
  dehydration: 'thirst', starvation: 'hunger', hypothermia: 'the cold', heatstroke: 'heatstroke', drowning: 'drowning', venom: 'venom', concussion: 'a blow to the head',
};
