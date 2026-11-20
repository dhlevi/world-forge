/**
 * Grooming (game/grooming.ts), over the map (Shift+G) or at a barber's in town: how the hair and
 * the beard are worn now, and the ways their length allows.
 */
import { reactive } from 'vue';
import { Screen } from '../engine/screens';
import type { Actor } from '../actors/actor';
import { Inventory } from '../actors/items/inventory';
import { groom, groomOptions, tidy, type GroomOption, type GroomResult, type GroomWhat } from '../game/grooming';
import { portraitOf, type PortraitSpec } from '../game/portrait';
import type { PlayScreen } from './play';
import GroomView from './views/GroomView.vue';

export class GroomScreen extends Screen {
  readonly view = GroomView;
  popup = true;
  readonly state = reactive({ message: '', version: 0 });

  constructor(readonly play: PlayScreen, readonly actor: Actor, readonly barber = false) {
    super();
  }

  /** The view follows the wanderer: it is drawn again after each change to them. */
  enter(): void {
    this.whileOpen(this.actor.watch(() => this.state.version++));
  }

  options(what: GroomWhat): GroomOption[] {
    return groomOptions(this.actor, what, this.barber);
  }

  portrait(): PortraitSpec {
    return portraitOf(this.actor);
  }

  /** Water to hand for a shave: beside the wanderer, or in a waterskin. */
  private water(): boolean {
    return this.play.session.waterBeside() || !!this.actor.get(Inventory)?.d.items.some((i) => i.def === 'waterskin' && (i.uses ?? 1) > 0);
  }

  private done(r: GroomResult): void {
    this.state.message = r.text;
    if (r.ok) this.play.say(r.text);
    if (r.seconds) this.play.advance(r.seconds);
    this.state.version++;
  }

  wear(what: GroomWhat, style: string): void {
    const g = this.play.session.game;
    this.done(groom(this.actor, what, style, { now: this.play.now(), barber: this.barber, water: this.water(), random: () => g.dice.random() }));
  }

  tidy(): void {
    this.done(tidy(this.actor, this.play.now(), this.barber));
  }

  key(e: KeyboardEvent): boolean {
    if (e.code === 'Escape') this.close();
    return true;
  }
}
