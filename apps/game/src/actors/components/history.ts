/** The life before play: its story, the fate cards, ranks reached, and the people in it. */
import { Component } from '../actor';
import type { BodyType } from './body';

// ---- History -------------------------------------------------------------------------------------

/** What is known of a person in the character's life (characters.md, People in your life): enough for a portrait and a few lines. */
export interface TieWho {
  female: boolean;
  /** Their age when the game began. */
  age: number;
  trade?: string;
  /** Their kind of people (core local/figures.ts), looks (colours as "#rrggbb"), and the colour of their clothes. */
  kind?: string;
  skin: string;
  hair: string;
  hairStyle: string;
  beard: string;
  type: BodyType;
  cloth: string;
  /** Where they were last known to live. */
  home?: string;
}

export interface Tie {
  kind: 'parent' | 'sibling' | 'contact' | 'rival' | 'debt' | 'feud' | 'friend' | 'master';
  name?: string;
  text: string;
  /** Still living (people). */
  alive?: boolean;
  /** The person, if the tie is to one (characters made before people were kept have none). */
  who?: TieWho;
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
