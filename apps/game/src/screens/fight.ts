/**
 * The fight menu (Shift+F; combat.md, stages 2 and 4): for one exchange, the beast or person to
 * strike (those in reach), the part to aim at, the blow and the stance, each with the chance it gives; the standing
 * choices (what walking into a beast in a fight strikes with) can be kept from it.
 */
import { reactive } from 'vue';
import { Screen } from '../engine/screens';
import type { PlayScreen } from './play';
import type { Foe } from '../game/foes';
import { STANCES, type BlowId, type Stance } from '../rules/combat';
import FightView from './views/FightView.vue';

export class FightScreen extends Screen {
  readonly view = FightView;
  popup = true;
  readonly state = reactive({
    /** Which of the beasts in reach; the aim (a part's id, or null for anywhere); the blow; the stance. */
    target: 0,
    aim: null as string | null,
    blow: null as BlowId | null,
    stance: 'balanced' as Stance,
    message: '',
    rev: 0,
  });

  constructor(readonly play: PlayScreen, readonly targets: Foe[]) {
    super();
    const f = play.session.state.fight;
    this.state.aim = f.aim;
    this.state.blow = f.blow;
    this.state.stance = f.stance;
  }

  get beast(): Foe | null {
    return this.targets[this.state.target] ?? null;
  }

  /** The aims: anywhere, then the parts, easiest first. */
  aims(): { id: string | null; name: string; mod: number }[] {
    const b = this.beast;
    if (!b) return [];
    return [{ id: null, name: 'Anywhere', mod: 0 }, ...this.play.session.fights.aimsAt(b).sort((x, y) => y.mod - x.mod)];
  }

  blows() {
    const b = this.beast;
    return b ? this.play.session.fights.blowChances(b, this.state.aim, this.state.stance) : [];
  }

  /** The blow chosen (or the first that reaches). */
  blowId(): BlowId | null {
    const list = this.blows();
    return (list.find((x) => x.blow.id === this.state.blow && x.reach) ?? list.find((x) => x.reach))?.blow.id ?? null;
  }

  /** The wanderer yields (to robbers, or the law). */
  yieldUp(): void {
    this.close();
    this.play.session.fights.yieldUp();
  }

  strike(): void {
    const b = this.beast;
    if (!b) return;
    this.close();
    this.play.session.fights.attack(b, { blow: this.blowId(), aim: this.state.aim, stance: this.state.stance });
  }

  /** Keeps these as the standing aim, blow and stance. */
  keep(): void {
    const f = this.play.session.state.fight;
    f.aim = this.state.aim;
    f.blow = this.blowId();
    f.stance = this.state.stance;
    this.state.message = 'Kept: walking into a beast in a fight strikes so.';
  }

  private moveAim(by: number): void {
    const list = this.aims();
    const i = Math.max(0, list.findIndex((x) => x.id === this.state.aim));
    this.state.aim = list[(i + by + list.length) % list.length]?.id ?? null;
  }

  private moveBlow(by: number): void {
    const list = this.blows().filter((x) => x.reach);
    if (!list.length) return;
    const i = Math.max(0, list.findIndex((x) => x.blow.id === this.blowId()));
    this.state.blow = list[(i + by + list.length) % list.length].blow.id;
  }

  key(e: KeyboardEvent): boolean {
    if (e.code === 'Escape') this.close();
    else if (e.code === 'Enter') this.strike();
    else if (e.code === 'ArrowUp') this.moveAim(-1);
    else if (e.code === 'ArrowDown') this.moveAim(1);
    else if (e.code === 'ArrowLeft') this.moveBlow(-1);
    else if (e.code === 'ArrowRight') this.moveBlow(1);
    else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') this.state.stance = STANCES[Number(e.code.slice(5)) - 1];
    else if (e.code === 'Tab') {
      this.state.target = (this.state.target + 1) % Math.max(1, this.targets.length);
      this.state.aim = null;
    } else if (e.code === 'KeyK') this.keep();
    else if (e.code === 'KeyY') this.yieldUp();
    else return true;
    return true;
  }
}
