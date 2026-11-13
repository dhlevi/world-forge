/** Who a person is: name, sex, age, people, home, faith and standing. */
import { Component } from '../actor';

// ---- Identity ------------------------------------------------------------------------------------

export type StandingId = 'peasant' | 'townsfolk' | 'craftsman' | 'merchant' | 'clergy' | 'minor' | 'noble';

export interface IdentityData {
  given: string;
  /** Family or clan name, where the culture uses one. */
  family?: string;
  full: string;
  female: boolean;
  /** Age in years when the game began. */
  age: number;
  /** The world's year when the game began. */
  year: number;
  folk: string;
  culture: number;
  cultureName: string;
  people: string;
  realm?: string;
  homeId: string;
  homeName: string;
  faith?: string;
  standing: StandingId;
}

/** Who the person is: name, sex, age, people, home and standing. */
export class Identity extends Component {
  static readonly key = 'identity';
  constructor(public d: IdentityData) {
    super();
  }
  get name(): string {
    return this.d.full;
  }
  /** Age now, from the game clock (seconds since the start). */
  ageAt(time: number): number {
    return this.d.age + Math.floor(time / (365 * 86400));
  }
  toJSON(): IdentityData {
    return { ...this.d };
  }
  static fromJSON(d: IdentityData): Identity {
    return new Identity(d);
  }
}
