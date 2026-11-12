/**
 * The cast: the actors in play, registered with the messaging service so each can be sent
 * messages by id, and told when game time passes. Every component kind is registered here for
 * loading saved actors.
 */
import { Actor, registerComponent, type ActorData } from './actor';
import { Body, History, Identity, Knowledge, Mood, Pools, Skills, Traits } from './components';
import { Inventory } from './items/inventory';
import { Needs } from './needs';
import type { TimeCtx } from './components';
import type { MessageDispatcher } from '../engine/messages';

registerComponent(Identity);
registerComponent(Body);
registerComponent(Traits);
registerComponent(Skills);
registerComponent(Pools);
registerComponent(Mood);
registerComponent(Inventory);
registerComponent(History);
registerComponent(Knowledge);
registerComponent(Needs);

export class Cast {
  private actors = new Map<number, Actor>();
  private offs = new Map<number, () => void>();
  /** The player's character. */
  player: Actor | null = null;
  private lastTime: number | null = null;
  private offTime: () => void;

  constructor(readonly bus: MessageDispatcher) {
    // Game time passing reaches every actor (their pools recover, moodlets run out).
    this.offTime = bus.on('time.passed', (_p, m) => {
      for (const a of this.actors.values()) a.receive(m);
    });
  }

  add(a: Actor): Actor {
    this.actors.set(a.id, a);
    this.offs.set(a.id, this.bus.register(a));
    return a;
  }

  remove(a: Actor): void {
    this.actors.delete(a.id);
    this.offs.get(a.id)?.();
    this.offs.delete(a.id);
  }

  get(id: number): Actor | undefined {
    return this.actors.get(id);
  }

  get all(): Actor[] {
    return [...this.actors.values()];
  }

  /** Tells the cast the game clock now reads `now` (seconds), and what the player was doing. Called after every action. */
  clock(now: number, ctx: TimeCtx = {}): void {
    const dt = this.lastTime === null ? 0 : now - this.lastTime;
    this.lastTime = now;
    if (dt > 0) this.bus.send('time.passed', { now, dt, ctx });
    this.bus.update(now);
  }

  /** Starts the clock at a time without counting it as passing (a game begun or loaded). */
  setClock(now: number): void {
    this.lastTime = now;
    this.bus.reset(now);
  }

  setPlayer(a: Actor): void {
    if (this.player) this.remove(this.player);
    this.player = this.add(a);
  }

  loadPlayer(d: ActorData): Actor {
    const a = Actor.fromJSON(d);
    this.setPlayer(a);
    return a;
  }

  dispose(): void {
    for (const a of [...this.actors.values()]) this.remove(a);
    this.offTime();
    this.player = null;
  }
}
