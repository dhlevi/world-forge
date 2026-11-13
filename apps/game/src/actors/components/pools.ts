/** The stamina pools. */
import { Component } from '../actor';
import type { Attribute } from '../data/traits';
import { clamp } from '../../util';
import type { Body } from './body';
import type { Traits } from './traits';

// ---- The two-bar pools ---------------------------------------------------------------------------

export interface Pool {
  value: number;
  max: number;
}

export interface PoolsData {
  physBurst: Pool;
  physDay: Pool;
  mentBurst: Pool;
  mentDay: Pool;
}

/**
 * Physical and mental stamina, each a day pool and a burst pool (sizes from traits and body).
 * Spent and refilled by the needs (actors/needs.ts) as time passes.
 */
export class Pools extends Component {
  static readonly key = 'pools';
  constructor(public d: PoolsData) {
    super();
  }
  /** Sizes from the actor's traits and body; full. */
  static fromTraits(t: Traits, b?: Body): PoolsData {
    const g = (a: Attribute) => t.get(a);
    const bulk = b ? clamp(b.d.weightKg / 70, 0.6, 1.4) : 1;
    const full = (max: number): Pool => ({ value: Math.round(max), max: Math.round(max) });
    return {
      physBurst: full(30 + ((g('strength') + g('agility') + g('constitution')) * 4) / 3),
      physDay: full((60 + 2 * g('constitution') + g('willpower')) * (0.85 + 0.15 * bulk)),
      mentBurst: full(30 + 2 * (g('intelligence') + g('willpower'))),
      mentDay: full(60 + 2 * g('willpower') + g('wisdom')),
    };
  }
  toJSON(): PoolsData {
    return JSON.parse(JSON.stringify(this.d));
  }
  static fromJSON(d: PoolsData): Pools {
    return new Pools(d);
  }
}
