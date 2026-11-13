/** The body: its parts, wounds, height, build and looks. */
import { Component } from '../actor';

// ---- Body ----------------------------------------------------------------------------------------

export interface BodyPartDef {
  id: string;
  name: string;
  parent?: string;
  /** Relative chance of being struck. */
  size: number;
  vital?: boolean;
}

/** The body plan of a person: a tree of parts (wounds come later). */
export const HUMANOID: BodyPartDef[] = [
  { id: 'torso', name: 'torso', size: 30 },
  { id: 'neck', name: 'neck', parent: 'torso', size: 3, vital: true },
  { id: 'head', name: 'head', parent: 'neck', size: 8 },
  { id: 'skull', name: 'skull', parent: 'head', size: 3 },
  { id: 'brain', name: 'brain', parent: 'skull', size: 1, vital: true },
  { id: 'eye.l', name: 'left eye', parent: 'head', size: 0.5 },
  { id: 'eye.r', name: 'right eye', parent: 'head', size: 0.5 },
  { id: 'ear.l', name: 'left ear', parent: 'head', size: 0.5 },
  { id: 'ear.r', name: 'right ear', parent: 'head', size: 0.5 },
  { id: 'nose', name: 'nose', parent: 'head', size: 0.5 },
  { id: 'jaw', name: 'jaw', parent: 'head', size: 1 },
  { id: 'heart', name: 'heart', parent: 'torso', size: 1, vital: true },
  { id: 'lung.l', name: 'left lung', parent: 'torso', size: 2 },
  { id: 'lung.r', name: 'right lung', parent: 'torso', size: 2 },
  { id: 'liver', name: 'liver', parent: 'torso', size: 1.5, vital: true },
  { id: 'stomach', name: 'stomach', parent: 'torso', size: 1.5 },
  { id: 'kidneys', name: 'kidneys', parent: 'torso', size: 1 },
  { id: 'spine', name: 'spine', parent: 'torso', size: 1.5 },
  ...(['l', 'r'] as const).flatMap((s) => {
    const side = s === 'l' ? 'left' : 'right';
    return [
      { id: `arm.${s}`, name: `${side} arm`, parent: 'torso', size: 7 },
      { id: `hand.${s}`, name: `${side} hand`, parent: `arm.${s}`, size: 2 },
      { id: `leg.${s}`, name: `${side} leg`, parent: 'torso', size: 9 },
      { id: `foot.${s}`, name: `${side} foot`, parent: `leg.${s}`, size: 2 },
    ];
  }),
];

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
