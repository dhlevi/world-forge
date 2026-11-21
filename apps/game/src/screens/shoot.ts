/**
 * Shooting and throwing (R; combat.md, stage 3): the beast to loose at (those in sight, nearest
 * first; Tab), what to loose (a bow and its arrows, a sling, or a thing to throw; Left, Right), the
 * part to aim at (Up, Down), with the chance, the range and what lies in the way. The target is
 * marked on the map while the menu is open.
 */
import { reactive } from 'vue';
import { Screen } from '../engine/screens';
import type { PlayScreen } from './play';
import type { Foe } from '../game/foes';
import { foeXY } from '../game/foes';
import type { Missile } from '../game/ranged';
import ShootView from './views/ShootView.vue';

export class ShootScreen extends Screen {
  readonly view = ShootView;
  popup = true;
  readonly state = reactive({ target: 0, missile: 0, aim: null as string | null, rev: 0 });
  readonly missiles: Missile[];

  constructor(readonly play: PlayScreen, readonly targets: Foe[]) {
    super();
    this.missiles = play.session.missiles();
    // The best way to shoot first: a bow with arrows before a thrown stone.
    this.state.missile = Math.max(0, this.missiles.findIndex((m) => m.how === 'shoot'));
  }

  get beast(): Foe | null {
    return this.targets[this.state.target] ?? null;
  }
  get missile(): Missile | null {
    return this.missiles[this.state.missile] ?? null;
  }

  enter(): void {
    this.mark();
  }
  leave(): void {
    const g = this.play.session.game;
    g.cursor = null;
    this.play.session.redraw();
  }

  /** Marks the target on the map. */
  private mark(): void {
    const b = this.beast, g = this.play.session.game;
    g.cursor = b ? [foeXY(b).x, foeXY(b).y] : null;
    this.play.session.redraw();
  }

  aims(): { id: string | null; name: string; mod: number }[] {
    const b = this.beast;
    return b ? [{ id: null, name: 'Anywhere', mod: 0 }, ...this.play.session.aimsAt(b).sort((x, y) => y.mod - x.mod)] : [];
  }

  /** The chance now, with the range and what is in the way. */
  shot() {
    const b = this.beast, m = this.missile;
    return b && m ? this.play.session.shotAt(b, m, this.state.aim) : null;
  }

  fire(): void {
    const b = this.beast, m = this.missile;
    if (!b || !m) return;
    this.close();
    this.play.session.shoot(b, m, this.state.aim);
  }

  key(e: KeyboardEvent): boolean {
    const step = (n: number, by: number, len: number) => (n + by + len) % Math.max(1, len);
    if (e.code === 'Escape') this.close();
    else if (e.code === 'Enter' || e.code === 'KeyR') this.fire();
    else if (e.code === 'Tab') {
      this.state.target = step(this.state.target, e.shiftKey ? -1 : 1, this.targets.length);
      this.state.aim = null;
      this.mark();
    } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') this.state.missile = step(this.state.missile, e.code === 'ArrowLeft' ? -1 : 1, this.missiles.length);
    else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      const list = this.aims();
      const i = Math.max(0, list.findIndex((x) => x.id === this.state.aim));
      this.state.aim = list[step(i, e.code === 'ArrowUp' ? -1 : 1, list.length)]?.id ?? null;
    } else return true;
    this.state.rev++;
    return true;
  }
}
