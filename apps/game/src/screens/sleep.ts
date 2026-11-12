/**
 * Sleeping and resting: how well one would sleep here (in a bed, rolled in a blanket, or on the
 * bare ground), and for how long. Sleep pays off fatigue and refills the day's stamina; a poor
 * night does so more slowly and leaves its mark on mood (docs/design/characters.md).
 */
import { reactive } from 'vue';
import { Screen } from '../engine/screens';
import { OBJECT_TILES } from '@worldforge/core/local/tiles';
import type { PlayScreen } from './play';
import type { Actor } from '../actors/actor';
import { Needs } from '../actors/needs';
import { Inventory } from '../actors/items/inventory';
import SleepView from './views/SleepView.vue';

export interface Bedding {
  quality: number;
  /** "in the bed", "rolled in your blanket", "on the bare ground". */
  where: string;
}

/** How well one sleeps where the wanderer stands: a bed beside, a blanket carried, or the ground. */
export function beddingAt(play: PlayScreen, actor: Actor): Bedding {
  const g = play.hooks!.game();
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (OBJECT_TILES[g.map.object(g.px + dx, g.py + dy)]?.name === 'bed') return { quality: 1, where: 'in the bed' };
  }
  const inv = actor.get(Inventory);
  if (inv?.d.items.some((i) => i.def === 'blanket')) return { quality: 0.8, where: 'rolled in your blanket' };
  return { quality: 0.6, where: 'on the bare ground' };
}

export class SleepScreen extends Screen {
  readonly view = SleepView;
  popup = true;
  readonly state = reactive({ message: '' });
  readonly bedding: Bedding;

  constructor(readonly play: PlayScreen, readonly actor: Actor) {
    super();
    this.bedding = beddingAt(play, actor);
  }

  get needs(): Needs | undefined {
    return this.actor.get(Needs);
  }

  /** Hours of sleep to be rested, here. */
  hoursToRest(): number {
    const n = this.needs;
    if (!n) return 8;
    return Math.max(1, Math.min(12, Math.ceil(n.tiredness() / (12.5 * this.bedding.quality))));
  }

  sleep(hours: number, untilRested = false): void {
    this.close();
    this.play.hooks?.sleep(hours, this.bedding.quality, { untilRested });
  }

  rest(hours: number): void {
    this.close();
    this.play.hooks?.sleep(hours, this.bedding.quality, { awake: true });
  }

  key(e: KeyboardEvent): boolean {
    if (e.code === 'Escape') this.close();
    else if (e.code === 'Enter') this.sleep(this.hoursToRest(), true);
    else return false;
    return true;
  }
}
