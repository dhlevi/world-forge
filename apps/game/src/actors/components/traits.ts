/** Traits, senses and luck. */
import { Component } from '../actor';
import { SENSES, TRAITS, type Attribute, type SenseId, type TraitId } from '../data/traits';

// ---- Traits, senses and luck ---------------------------------------------------------------------

export interface TraitsData {
  traits: Record<TraitId, number>;
  senses: Record<SenseId, number>;
  /** The luck gauge (0 to 100) and the level it drifts back to. */
  luck: number;
  luckRest: number;
}

export class Traits extends Component {
  static readonly key = 'traits';
  constructor(public d: TraitsData) {
    super();
  }
  /** A trait or sense. */
  get(a: Attribute): number {
    return (this.d.traits as Record<string, number>)[a] ?? (this.d.senses as Record<string, number>)[a] ?? 10;
  }
  /** The mean of several traits and senses. */
  mean(as: Attribute[]): number {
    return as.length ? as.reduce((s, a) => s + this.get(a), 0) / as.length : 10;
  }
  toJSON(): TraitsData {
    return { traits: { ...this.d.traits }, senses: { ...this.d.senses }, luck: this.d.luck, luckRest: this.d.luckRest };
  }
  static fromJSON(d: TraitsData): Traits {
    return new Traits(d);
  }
  static average(): TraitsData {
    return {
      traits: Object.fromEntries(TRAITS.map((t) => [t, 10])) as Record<TraitId, number>,
      senses: Object.fromEntries(SENSES.map((s) => [s, 10])) as Record<SenseId, number>,
      luck: 50,
      luckRest: 50,
    };
  }
}
