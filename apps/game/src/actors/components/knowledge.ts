/** What the person knows of the world before setting out. */
import { Component } from '../actor';

// ---- What the person knows of the world ----------------------------------------------------------

export interface KnowledgeData {
  /** The country about home that is known at the start (m). */
  homeRadiusM: number;
  /** Places whose roads from home are known (start site ids). */
  roads: string[];
  /** Places known around themselves without the way there (start site ids, with a radius in m). */
  places: { id: string; radiusM: number }[];
  /** Whether this has been laid on the travel map yet (done once, at the start of a new game). */
  applied: boolean;
  /** Why they know it, for the sheet. */
  notes: string[];
}

export class Knowledge extends Component {
  static readonly key = 'knowledge';
  constructor(public d: KnowledgeData) {
    super();
  }
  toJSON(): KnowledgeData {
    return JSON.parse(JSON.stringify(this.d));
  }
  static fromJSON(d: KnowledgeData): Knowledge {
    return new Knowledge(d);
  }
}
