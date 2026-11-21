/**
 * The wanderer's health (actors/health.ts): blood, pain and the capacities, the wounds and what
 * has been done for them, and first aid (game/treatment.ts). Opened with D.
 */
import { reactive } from 'vue';
import { Screen } from '../engine/screens';
import type { PlayScreen } from './play';
import type { Actor } from '../actors/actor';
import { Health } from '../actors/health';
import { Inventory } from '../actors/items/inventory';
import { materials, TREATS, TREAT_NAMES, unsuited, type Treat } from '../rules/treatment';
import HealthView from './views/HealthView.vue';

export class HealthScreen extends Screen {
  readonly view = HealthView;
  popup = true;
  /** The last thing done, in words; and a count that changes when anything does (for the view). */
  readonly state = reactive({ message: '', rev: 0 });

  constructor(readonly play: PlayScreen, readonly actor: Actor) {
    super();
  }

  get health(): Health | undefined {
    return this.actor.get(Health);
  }

  /**
   * The treatments that suit a wound, each with what is missing to do it (null: it can be done).
   * Water to clean with may be beside the wanderer, which the session finds when it is tried.
   */
  options(woundId: number): { t: Treat; name: string; missing: string | null }[] {
    const w = this.health?.d.wounds.find((x) => x.id === woundId);
    const inv = this.actor.get(Inventory);
    if (!w || !inv) return [];
    return TREATS.filter((t) => !unsuited(w, t)).map((t) => {
      const m = materials(inv, t, t === 'clean');
      return { t, name: TREAT_NAMES[t], missing: 'missing' in m ? m.missing : null };
    });
  }

  treat(woundId: number, t: Treat): void {
    this.state.message = this.play.session.treatWound(woundId, t);
    this.state.rev++;
    if (this.play.session.state.dead) this.close();
  }

  remedy(): void {
    this.state.message = this.play.session.takeRemedy();
    this.state.rev++;
  }

  hasRemedy(): boolean {
    return !!this.actor.get(Inventory)?.d.items.some((i) => i.def === 'potion');
  }

  key(e: KeyboardEvent): boolean {
    if (e.code === 'Escape' || e.code === 'KeyD') this.close();
    else return false;
    return true;
  }
}
