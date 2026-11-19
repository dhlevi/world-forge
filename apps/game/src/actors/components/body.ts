/** The body: its parts, wounds, height, build and looks. */
import { Component } from '../actor';

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
}

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

/** The parts of the body plan by id. */
export const PART = new Map(HUMANOID.map((p) => [p.id, p]));

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

export interface BodyData {
  heightCm: number;
  weightKg: number;
  build: string;
  skin: string;
  skinHex: string;
  hair: string;
  hairHex: string;
  hairStyle: string;
  beard: string;
  marks?: string;
  /** The kind of people, for drawing the figure (core local/figures.ts: human, elf, dwarf...); human if none. */
  kind?: string;
  wounds: Wound[];
}

export class Body extends Component {
  static readonly key = 'body';
  readonly plan = HUMANOID;
  constructor(public d: BodyData) {
    super();
  }
  /** Scars and lasting harm, in words. */
  get scars(): string[] {
    return this.d.wounds.filter((w) => w.scar).map((w) => w.scar!);
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
  return beard === 'none' ? 'clean-shaven' : beard === 'moustache' ? 'a moustache' : `a ${beard} beard`;
}
