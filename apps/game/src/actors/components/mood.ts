/** The mood meter and its moodlets. */
import { Component } from '../actor';
import type { Message } from '../../engine/messages';
import './time';

// ---- Mood ----------------------------------------------------------------------------------------

export interface Moodlet {
  id: string;
  text: string;
  /** Plus or minus. */
  value: number;
  /** Game time it ends (seconds), or none for as long as its cause lasts. */
  until?: number;
}

/** The mood meter: the sum of timed moodlets. */
export class Mood extends Component {
  static readonly key = 'mood';
  constructor(public moodlets: Moodlet[] = []) {
    super();
  }
  get value(): number {
    return this.moodlets.reduce((s, m) => s + m.value, 0);
  }
  add(m: Moodlet): void {
    // The same kind replaces itself rather than stacking.
    this.moodlets = [...this.moodlets.filter((x) => x.id !== m.id), m];
  }
  onMessage(m: Message): boolean {
    if (m.type === 'actor.moodlet') {
      this.add({ ...(m as Message<'actor.moodlet'>).payload });
      return true;
    }
    if (m.type === 'time.passed') {
      const now = (m as Message<'time.passed'>).payload.now;
      const before = this.moodlets.length;
      this.moodlets = this.moodlets.filter((x) => x.until === undefined || x.until > now);
      return this.moodlets.length !== before;
    }
    return false;
  }
  toJSON(): Moodlet[] {
    return this.moodlets.map((m) => ({ ...m }));
  }
  static fromJSON(d: Moodlet[]): Mood {
    return new Mood(d ?? []);
  }
}
