/** The life before play: its story, the fate cards, ranks reached, and the people in it. */
import { Component } from '../actor';

// ---- History -------------------------------------------------------------------------------------

export interface Tie {
  kind: 'parent' | 'sibling' | 'contact' | 'rival' | 'debt' | 'feud' | 'friend' | 'master';
  name?: string;
  text: string;
  /** Still living (people). */
  alive?: boolean;
}

export interface HistoryData {
  /** The life before play, a line per event, oldest first. */
  lines: { age: number; text: string }[];
  /** The fate spread drawn at creation, kept for the storyteller. */
  spread: { position: string; card: string; reversed: boolean }[];
  /** Highest rank reached in each occupation track. */
  ranks: Record<string, number>;
  ties: Tie[];
  omen?: string;
}

export class History extends Component {
  static readonly key = 'history';
  constructor(public d: HistoryData) {
    super();
  }
  toJSON(): HistoryData {
    return JSON.parse(JSON.stringify(this.d));
  }
  static fromJSON(d: HistoryData): History {
    return new History(d);
  }
}
