/** The body: its parts (those of each sex among them), wounds, height, build, body type and looks, and the hair and beard as they grow. */
import { Component } from '../actor';
import type { Message } from '../../engine/messages';
import { Identity } from './identity';
import './time';

// ---- Body ----------------------------------------------------------------------------------------

export interface BodyPartDef {
  id: string;
  name: string;
  parent?: string;
  /** Relative chance of being struck, among the parts outside (or, inside, among those within the same part). */
  size: number;
  /** Its destruction kills (the brain, the heart, the neck). */
  vital?: boolean;
  /** How much harm it takes before it is ruined (actors/health.ts). */
  hp: number;
  /** Lies within its parent: struck only through it (organs, bones). */
  inside?: boolean;
  /** How freely it bleeds (1 a limb's flesh). */
  bleed?: number;
  /** Can be cut or torn off (a finger, a hand, an ear). */
  sever?: boolean;
  /** The region clothing and armour cover it in (actors/items/defs.ts, REGIONS). */
  region?: 'head' | 'face' | 'torso' | 'arms' | 'hands' | 'waist' | 'legs' | 'feet';
  /** Only a man's (m) or a woman's (f) body has it. */
  sex?: Sex;
  /** How much more a wound in it hurts than one elsewhere (1 if not given). */
  pain?: number;
}

export type Sex = 'm' | 'f';

const FINGERS: [string, string, number][] = [['thumb', 'thumb', 10], ['f2', 'index finger', 8], ['f3', 'middle finger', 8], ['f4', 'ring finger', 8], ['f5', 'little finger', 7]];
const TOES: [string, string, number][] = [['t1', 'big toe', 9], ['t2', 'second toe', 6], ['t3', 'third toe', 6], ['t4', 'fourth toe', 6], ['t5', 'little toe', 6]];

/**
 * The body plan of a person: a tree of parts (docs/design/characters.md, Health), with the organs
 * and bones within the head and torso, and every finger and toe.
 */
export const HUMANOID: BodyPartDef[] = [
  { id: 'torso', name: 'torso', size: 30, hp: 40, bleed: 1.2, region: 'torso' },
  { id: 'neck', name: 'neck', parent: 'torso', size: 3, hp: 25, vital: true, bleed: 4, region: 'torso' },
  { id: 'head', name: 'head', parent: 'neck', size: 8, hp: 25, bleed: 1.5, region: 'head' },
  { id: 'skull', name: 'skull', parent: 'head', size: 3, hp: 25, inside: true },
  { id: 'brain', name: 'brain', parent: 'skull', size: 1, hp: 10, vital: true, inside: true, bleed: 2 },
  { id: 'eye.l', name: 'left eye', parent: 'head', size: 0.5, hp: 10, region: 'face', bleed: 0.5 },
  { id: 'eye.r', name: 'right eye', parent: 'head', size: 0.5, hp: 10, region: 'face', bleed: 0.5 },
  { id: 'ear.l', name: 'left ear', parent: 'head', size: 0.5, hp: 12, sever: true, region: 'head', bleed: 0.8 },
  { id: 'ear.r', name: 'right ear', parent: 'head', size: 0.5, hp: 12, sever: true, region: 'head', bleed: 0.8 },
  { id: 'nose', name: 'nose', parent: 'head', size: 0.5, hp: 10, sever: true, region: 'face', bleed: 1 },
  { id: 'jaw', name: 'jaw', parent: 'head', size: 1, hp: 15, region: 'face', bleed: 1 },
  { id: 'teeth', name: 'teeth', parent: 'jaw', size: 1, hp: 10, inside: true },
  { id: 'ribs', name: 'ribs', parent: 'torso', size: 6, hp: 20, inside: true },
  { id: 'heart', name: 'heart', parent: 'torso', size: 1, hp: 15, vital: true, inside: true, bleed: 6 },
  { id: 'lung.l', name: 'left lung', parent: 'torso', size: 2, hp: 15, inside: true, bleed: 2 },
  { id: 'lung.r', name: 'right lung', parent: 'torso', size: 2, hp: 15, inside: true, bleed: 2 },
  { id: 'liver', name: 'liver', parent: 'torso', size: 1.5, hp: 15, vital: true, inside: true, bleed: 3 },
  { id: 'stomach', name: 'stomach', parent: 'torso', size: 1.5, hp: 15, inside: true, bleed: 1.5 },
  { id: 'kidneys', name: 'kidneys', parent: 'torso', size: 1, hp: 15, vital: true, inside: true, bleed: 2 },
  { id: 'spine', name: 'spine', parent: 'torso', size: 1.5, hp: 20, inside: true, bleed: 1 },
  { id: 'pelvis', name: 'pelvis', parent: 'torso', size: 4, hp: 25, region: 'waist' },
  ...(['l', 'r'] as const).flatMap((s): BodyPartDef[] => {
    const side = s === 'l' ? 'left' : 'right';
    return [
      { id: `arm.${s}`, name: `${side} arm`, parent: 'torso', size: 7, hp: 30, sever: true, region: 'arms' },
      { id: `hand.${s}`, name: `${side} hand`, parent: `arm.${s}`, size: 2, hp: 20, sever: true, region: 'hands' },
      ...FINGERS.map(([id, name, hp]): BodyPartDef => ({ id: `${id}.${s}`, name: `${side} ${name}`, parent: `hand.${s}`, size: 0.3, hp, sever: true, region: 'hands', bleed: 0.6 })),
      { id: `leg.${s}`, name: `${side} leg`, parent: 'pelvis', size: 9, hp: 35, sever: true, region: 'legs' },
      { id: `foot.${s}`, name: `${side} foot`, parent: `leg.${s}`, size: 2, hp: 25, sever: true, region: 'feet' },
      ...TOES.map(([id, name, hp]): BodyPartDef => ({ id: `${id}.${s}`, name: `${side} ${name}`, parent: `foot.${s}`, size: 0.2, hp, sever: true, region: 'feet', bleed: 0.5 })),
    ];
  }),
];

/**
 * The parts only a man's or a woman's body has (characters.md, Health). They are struck, bleed,
 * hurt and scar as any part does; no capacity rests on them yet.
 */
export const SEXED: BodyPartDef[] = [
  { id: 'breast.l', name: 'left breast', parent: 'torso', size: 1.5, hp: 14, region: 'torso', sex: 'f', pain: 1.4 },
  { id: 'breast.r', name: 'right breast', parent: 'torso', size: 1.5, hp: 14, region: 'torso', sex: 'f', pain: 1.4 },
  { id: 'vulva', name: 'vulva', parent: 'pelvis', size: 0.3, hp: 8, region: 'waist', bleed: 1.5, sex: 'f', pain: 2 },
  { id: 'womb', name: 'womb', parent: 'pelvis', size: 1, hp: 15, inside: true, bleed: 3, sex: 'f', pain: 1.3 },
  { id: 'ovaries', name: 'ovaries', parent: 'pelvis', size: 0.5, hp: 10, inside: true, bleed: 1.5, sex: 'f', pain: 1.5 },
  { id: 'penis', name: 'penis', parent: 'pelvis', size: 0.3, hp: 8, sever: true, region: 'waist', bleed: 2, sex: 'm', pain: 2 },
  { id: 'testicles', name: 'testicles', parent: 'pelvis', size: 0.4, hp: 8, sever: true, region: 'waist', bleed: 1.5, sex: 'm', pain: 2.5 },
];

const BY_SEX: Record<Sex, BodyPartDef[]> = { m: [...HUMANOID, ...SEXED.filter((p) => p.sex === 'm')], f: [...HUMANOID, ...SEXED.filter((p) => p.sex === 'f')] };

/** A person's body plan: the parts all have, and those of their sex (none of either, if it is not known). */
export function humanoidPlan(sex?: Sex): BodyPartDef[] {
  return sex ? BY_SEX[sex] : HUMANOID;
}

/** The parts of a person's body by id (those of either sex among them). */
export const PART = new Map([...HUMANOID, ...SEXED].map((p) => [p.id, p]));

/**
 * The bodies of beasts (combat.md, stage 2): a four-footed beast's, a bird's and a serpent's, with
 * the same organs within; sizes and toughness for a beast of about a person's weight (actors/
 * health.ts scales toughness by the beast's weight). The small, four-footed beasts use the
 * four-footed plan.
 */
const ORGANS = (torso: string, lungs: 2 | 1): BodyPartDef[] => [
  { id: 'ribs', name: 'ribs', parent: torso, size: 6, hp: 20, inside: true },
  { id: 'heart', name: 'heart', parent: torso, size: 1, hp: 15, vital: true, inside: true, bleed: 6 },
  ...(lungs === 2
    ? [{ id: 'lung.l', name: 'left lung', parent: torso, size: 2, hp: 15, inside: true, bleed: 2 }, { id: 'lung.r', name: 'right lung', parent: torso, size: 2, hp: 15, inside: true, bleed: 2 }]
    : [{ id: 'lung.l', name: 'lung', parent: torso, size: 3, hp: 18, inside: true, bleed: 2 }]),
  { id: 'liver', name: 'liver', parent: torso, size: 1.5, hp: 15, vital: true, inside: true, bleed: 3 },
  { id: 'stomach', name: 'stomach', parent: torso, size: 1.5, hp: 15, inside: true, bleed: 1.5 },
  { id: 'spine', name: 'spine', parent: torso, size: 1.5, hp: 20, inside: true, bleed: 1 },
];
const HEAD = (o: { ears: boolean; snout: string; jaw: string }): BodyPartDef[] => [
  { id: 'head', name: 'head', parent: 'neck', size: 8, hp: 25, bleed: 1.5 },
  { id: 'skull', name: 'skull', parent: 'head', size: 3, hp: 25, inside: true },
  { id: 'brain', name: 'brain', parent: 'skull', size: 1, hp: 10, vital: true, inside: true, bleed: 2 },
  { id: 'eye.l', name: 'left eye', parent: 'head', size: 0.5, hp: 10, bleed: 0.5 },
  { id: 'eye.r', name: 'right eye', parent: 'head', size: 0.5, hp: 10, bleed: 0.5 },
  ...(o.ears ? [{ id: 'ear.l', name: 'left ear', parent: 'head', size: 0.6, hp: 12, sever: true, bleed: 0.8 }, { id: 'ear.r', name: 'right ear', parent: 'head', size: 0.6, hp: 12, sever: true, bleed: 0.8 }] : []),
  { id: 'nose', name: o.snout, parent: 'head', size: 0.8, hp: 12, bleed: 1 },
  { id: 'jaw', name: o.jaw, parent: 'head', size: 1.5, hp: 15, bleed: 1 },
  { id: 'teeth', name: 'teeth', parent: 'jaw', size: 1, hp: 10, inside: true },
];

export const QUADRUPED: BodyPartDef[] = [
  { id: 'torso', name: 'body', size: 30, hp: 40, bleed: 1.2 },
  { id: 'neck', name: 'neck', parent: 'torso', size: 4, hp: 25, vital: true, bleed: 4 },
  ...HEAD({ ears: true, snout: 'muzzle', jaw: 'jaw' }),
  ...ORGANS('torso', 2),
  ...(['fl', 'fr', 'hl', 'hr'] as const).flatMap((s): BodyPartDef[] => {
    const name = { fl: 'left foreleg', fr: 'right foreleg', hl: 'left hind leg', hr: 'right hind leg' }[s];
    const foot = { fl: 'left forefoot', fr: 'right forefoot', hl: 'left hind foot', hr: 'right hind foot' }[s];
    return [
      { id: `leg.${s}`, name, parent: 'torso', size: 5, hp: 30, sever: true },
      { id: `foot.${s}`, name: foot, parent: `leg.${s}`, size: 1, hp: 15, sever: true, bleed: 0.8 },
    ];
  }),
  { id: 'tail', name: 'tail', parent: 'torso', size: 1.5, hp: 10, sever: true, bleed: 0.6 },
];

export const BIRD: BodyPartDef[] = [
  { id: 'torso', name: 'body', size: 30, hp: 40, bleed: 1.2 },
  { id: 'neck', name: 'neck', parent: 'torso', size: 5, hp: 20, vital: true, bleed: 3 },
  ...HEAD({ ears: false, snout: 'beak', jaw: 'bill' }).filter((p) => p.id !== 'teeth').map((p) => (p.id === 'head' ? { ...p, size: 10 } : p)),
  ...ORGANS('torso', 2),
  { id: 'wing.l', name: 'left wing', parent: 'torso', size: 12, hp: 20, sever: true },
  { id: 'wing.r', name: 'right wing', parent: 'torso', size: 12, hp: 20, sever: true },
  { id: 'leg.l', name: 'left leg', parent: 'torso', size: 4, hp: 15, sever: true, bleed: 0.6 },
  { id: 'leg.r', name: 'right leg', parent: 'torso', size: 4, hp: 15, sever: true, bleed: 0.6 },
  { id: 'tail', name: 'tail feathers', parent: 'torso', size: 3, hp: 8, sever: true, bleed: 0.2 },
];

export const SERPENT: BodyPartDef[] = [
  { id: 'torso', name: 'body', size: 50, hp: 40, bleed: 1.2 },
  { id: 'neck', name: 'neck', parent: 'torso', size: 8, hp: 25, vital: true, bleed: 3 },
  ...HEAD({ ears: false, snout: 'snout', jaw: 'jaws' }).map((p) => (p.id === 'teeth' ? { ...p, name: 'fangs' } : p.id === 'head' ? { ...p, size: 10 } : p)),
  ...ORGANS('torso', 1),
  { id: 'tail', name: 'tail', parent: 'torso', size: 20, hp: 25, sever: true },
];

export type PlanId = 'humanoid' | 'quad' | 'bird' | 'serpent';
export const PLANS: Record<PlanId, BodyPartDef[]> = { humanoid: HUMANOID, quad: QUADRUPED, bird: BIRD, serpent: SERPENT };
export const PLAN_PARTS: Record<PlanId, Map<string, BodyPartDef>> = {
  humanoid: PART, quad: new Map(QUADRUPED.map((p) => [p.id, p])), bird: new Map(BIRD.map((p) => [p.id, p])), serpent: new Map(SERPENT.map((p) => [p.id, p])),
};

/**
 * A wound of the past, kept as a mark (a scar, a brand) or lasting harm: from the character's
 * life before play (actors/creation/resolve.ts) and from wounds healed in play (actors/health.ts).
 */
export interface Wound {
  part: string;
  kind: 'cut' | 'stab' | 'bruise' | 'fracture' | 'crush' | 'bite' | 'burn' | 'frostbite';
  severity: number;
  /** A healed wound that left a mark or lasting harm. */
  scar?: string;
}

/** The three body types (characters.md, Body and identity). */
export type BodyType = 'ectomorph' | 'mesomorph' | 'endomorph';

export interface BodyTypeDef {
  id: BodyType;
  name: string;
  about: string;
  /** Weight for a height, against the middling frame. */
  weight: number;
  /** How fast the body burns food (actors/needs.ts). */
  burn: number;
  /** How long it lasts on itself with nothing to eat. */
  reserve: number;
  /** Warmth of its own, as clothing's is counted (less: feels the cold; more: the heat). */
  warmth: number;
  /** The sizes of the physical burst and day pools (actors/components/pools.ts). */
  burst: number;
  day: number;
}

export const BODY_TYPES: BodyTypeDef[] = [
  { id: 'ectomorph', name: 'Ectomorph', about: 'Lean and light-boned. Lasts well over a long day, but burns through food, feels the cold, and has less to give in a burst.', weight: 0.9, burn: 1.08, reserve: 0.85, warmth: -1, burst: 0.94, day: 1.08 },
  { id: 'mesomorph', name: 'Mesomorph', about: 'Broad-shouldered and muscular. Strong in a burst of effort; otherwise the middle way.', weight: 1, burn: 1, reserve: 1, warmth: 0, burst: 1.06, day: 1 },
  { id: 'endomorph', name: 'Endomorph', about: 'Heavy-set and well padded. Keeps warm and lasts longer without food, but overheats and tires sooner.', weight: 1.15, burn: 0.94, reserve: 1.25, warmth: 1.5, burst: 1, day: 0.94 },
];
export const BODY_TYPE = new Map(BODY_TYPES.map((t) => [t.id, t]));

/** A body's type: the one given, or (for bodies from before types were kept) what its height and weight suggest. */
export function bodyTypeOf(d: Pick<BodyData, 'type' | 'heightCm' | 'weightKg'>): BodyTypeDef {
  const bmi = d.weightKg / Math.max(0.5, d.heightCm / 100) ** 2;
  return BODY_TYPE.get(d.type ?? (bmi < 20.5 ? 'ectomorph' : bmi < 26 ? 'mesomorph' : 'endomorph'))!;
}

/**
 * Hair and beards grow (survival.md, Cleanliness and grooming). Each way of wearing them needs a
 * least length (`min`, cm); a cut to it leaves at most `cut`; grown past `over`, or kept by shaving
 * and left `days` untended, it lapses into what its length makes it. `start`: its length when a
 * person is first seen with it.
 */
export interface GrowthDef {
  min: number;
  start: number;
  cut?: number;
  over?: number;
  days?: number;
}
export const HAIR_GROWTH: Record<string, GrowthDef> = {
  bald: { min: 0, start: 0 }, shaved: { min: 0, start: 0.2, cut: 0.2, over: 1.2 }, short: { min: 1.2, start: 4, cut: 4, over: 16 },
  crest: { min: 3, start: 8, cut: 8, days: 30 }, curly: { min: 3, start: 8 }, topknot: { min: 12, start: 20, days: 30 },
  tied: { min: 15, start: 25 }, bun: { min: 15, start: 30 }, long: { min: 16, start: 35 }, braids: { min: 20, start: 40 }, loose: { min: 25, start: 45 },
};
export const BEARD_GROWTH: Record<string, GrowthDef> = {
  none: { min: 0, start: 0, cut: 0, over: 0.6 }, moustache: { min: 0.6, start: 0, cut: 0, over: 0.6 }, short: { min: 0.6, start: 1.2, cut: 1.2, over: 2.5 },
  full: { min: 2.5, start: 4, cut: 4, over: 9 }, forked: { min: 6, start: 10, cut: 10 }, long: { min: 9, start: 12, cut: 12 }, braided: { min: 9, start: 14 },
};
/** Centimetres a day, the longest they grow, the stubble that shows, and the days untended that leave one unkempt, then ragged. */
const GROW_CM = 0.045, HAIR_MAX = 80, BEARD_MAX = 40, STUBBLE_CM = 0.1, UNKEMPT_DAYS = 14, RAGGED_DAYS = 45;
const hairAt = (cm: number) => (cm < 1.2 ? 'shaved' : cm < 16 ? 'short' : 'long');
const beardAt = (cm: number) => (cm < 0.6 ? 'none' : cm < 2.5 ? 'short' : cm < 9 ? 'full' : 'long');

export type Kempt = '' | 'Unkempt' | 'Ragged';

export interface BodyData {
  heightCm: number;
  weightKg: number;
  build: string;
  type?: BodyType;
  skin: string;
  skinHex: string;
  hair: string;
  hairHex: string;
  hairStyle: string;
  beard: string;
  /** How long the hair and the beard have grown (cm; for a moustache, the chin's), and when they were last put in order (game seconds). */
  hairCm?: number;
  beardCm?: number;
  groomedAt?: number;
  /** Grows no beard (women, and the men of beardless peoples). */
  beardless?: boolean;
  marks?: string;
  /** The kind of people, for drawing the figure (core local/figures.ts: human, elf, dwarf...); human if none. */
  kind?: string;
  wounds: Wound[];
}

export class Body extends Component {
  static readonly key = 'body';
  readonly plan = HUMANOID;
  private notes: string[] = [];
  private now = 0;
  private said: Kempt | null = null;
  constructor(public d: BodyData) {
    super();
  }
  /** Scars and lasting harm, in words. */
  get scars(): string[] {
    return this.d.wounds.filter((w) => w.scar).map((w) => w.scar!);
  }
  get type(): BodyTypeDef {
    return bodyTypeOf(this.d);
  }

  // ---- Hair and beard --------------------------------------------------------------------------

  get hairCm(): number {
    return this.d.hairCm ?? HAIR_GROWTH[this.d.hairStyle]?.start ?? 4;
  }
  get beardCm(): number {
    return this.d.beardCm ?? BEARD_GROWTH[this.d.beard]?.start ?? 0;
  }
  /** Grows no beard: a woman, or one of a beardless people (older bodies: by their sex). */
  get beardless(): boolean {
    return this.d.beardless ?? this.actor?.get(Identity)?.d.female ?? false;
  }
  /** Scales or a mushroom's cap: nothing to grow or to groom. */
  private get hairless(): boolean {
    return this.d.kind === 'lizard' || this.d.kind === 'fungus';
  }
  /** The beard as it shows: the one kept, or stubble on a shaven chin. */
  beardShown(): string {
    return this.d.beard === 'none' && !this.beardless && this.beardCm >= STUBBLE_CM ? 'stubble' : this.d.beard;
  }
  /** How well kept the hair and beard are, by the days since they were put in order. */
  kempt(): Kempt {
    if (this.hairless || this.d.groomedAt === undefined) return '';
    const days = (this.now - this.d.groomedAt) / 86400;
    return days >= RAGGED_DAYS ? 'Ragged' : days >= UNKEMPT_DAYS ? 'Unkempt' : '';
  }
  /** The ways the hair can be worn at its length now (a cut only shortens it), and the beard. */
  hairChoices(): string[] {
    return this.d.hairStyle === 'bald' || this.hairless ? [] : Object.keys(HAIR_GROWTH).filter((s) => s !== 'bald' && HAIR_GROWTH[s].min <= this.hairCm);
  }
  beardChoices(): string[] {
    return this.beardless || this.hairless ? [] : Object.keys(BEARD_GROWTH).filter((s) => BEARD_GROWTH[s].min <= this.beardCm);
  }
  /** Cuts or dresses the hair a way (one of `hairChoices`), or the beard; either puts both in order. */
  setHair(style: string, now: number): void {
    this.d.hairCm = Math.min(this.hairCm, HAIR_GROWTH[style]?.cut ?? this.hairCm);
    this.d.hairStyle = style;
    this.tidy(now);
  }
  setBeard(style: string, now: number): void {
    this.d.beardCm = Math.min(this.beardCm, BEARD_GROWTH[style]?.cut ?? this.beardCm);
    this.d.beard = style;
    this.tidy(now);
  }
  /** Combed and trimmed as they are worn. */
  tidy(now: number): void {
    this.now = Math.max(this.now, now);
    this.d.groomedAt = now;
    this.said = '';
    this.touched();
  }

  onMessage(m: Message): boolean {
    if (m.type !== 'time.passed') return false;
    const { dt, now } = (m as Message<'time.passed'>).payload;
    this.grow(dt, now);
    return true;
  }

  /** Lets the hair and beard grow; a way of wearing them outgrown, or left untended, lapses. */
  private grow(dt: number, now: number): void {
    const d = this.d, by = (dt / 86400) * GROW_CM;
    this.now = now;
    if (this.hairless) return;
    // A body from before growth was kept begins in order.
    d.groomedAt ??= now - dt;
    const untended = (now - d.groomedAt) / 86400;
    if (d.hairStyle !== 'bald') {
      d.hairCm = Math.min(HAIR_MAX, this.hairCm + by);
      const g = HAIR_GROWTH[d.hairStyle];
      if (g?.over !== undefined && d.hairCm >= g.over) {
        this.notes.push(d.hairStyle === 'shaved' ? 'Your hair has grown back in.' : 'Your hair has grown long.');
        d.hairStyle = hairAt(d.hairCm);
      } else if (g?.days !== undefined && untended >= g.days) {
        this.notes.push('The shaved sides of your head have grown in.');
        d.hairStyle = hairAt(d.hairCm);
      }
    }
    if (!this.beardless) {
      const before = this.beardCm;
      d.beardCm = Math.min(BEARD_MAX, before + by);
      const g = BEARD_GROWTH[d.beard];
      if (g?.over !== undefined && d.beardCm >= g.over) {
        d.beard = beardAt(d.beardCm);
        this.notes.push(d.beard === 'short' ? 'Your beard has grown in.' : d.beard === 'full' ? 'Your beard has grown full.' : 'Your beard has grown long.');
      } else if (d.beard === 'none' && before < STUBBLE_CM && d.beardCm >= STUBBLE_CM) this.notes.push('Stubble darkens your jaw.');
    }
    const k = this.kempt();
    if (this.said !== null && k !== this.said && k) this.notes.push(k === 'Ragged' ? 'Your hair and beard have run wild: you look ragged.' : 'Your hair wants putting in order: you look unkempt.');
    this.said = k;
  }

  /** What has changed in the hair and beard since last asked (cleared). */
  takeNotes(): string[] {
    const n = this.notes;
    this.notes = [];
    return n;
  }

  toJSON(): BodyData {
    return { ...this.d, wounds: this.d.wounds.map((w) => ({ ...w })) };
  }
  static fromJSON(d: BodyData): Body {
    return new Body({ ...d, wounds: d.wounds ?? [] });
  }
}

/** How hair is worn, in words: "flaxen hair in braids", "a shaved head". */
const WORN: Record<string, string> = {
  short: 'cut short', long: 'worn long', braids: 'in braids', topknot: 'in a topknot', bun: 'pinned up', curly: 'in curls', tied: 'tied back',
  loose: 'worn long and loose', crest: 'shaved but for a crest',
};
export function hairText(colour: string, style: string): string {
  if (style === 'bald') return 'a bald head';
  if (style === 'shaved') return 'a shaved head';
  return `${colour} hair ${WORN[style] ?? style}`;
}

/** A beard in words. */
export function beardText(beard: string): string {
  return beard === 'none' ? 'clean-shaven' : beard === 'stubble' ? 'unshaven' : beard === 'moustache' ? 'a moustache' : `a ${beard} beard`;
}
