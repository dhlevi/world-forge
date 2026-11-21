/**
 * A person at the wanderer's mercy (combat.md, stage 4: yielded, fallen or bound; walking into
 * them): let them go, take what they carry, bind them, tend their wounds, kill them, or (a bound
 * robber) hand them over to the watch. Each is seen, remembered, and may be a crime (world/law.ts).
 */
import { reactive } from 'vue';
import { Screen } from '../engine/screens';
import type { PlayScreen } from './play';
import type { Resident } from '../world/population';
import type { Mercy } from '../world/folk-fight';
import MercyView from './views/MercyView.vue';

export class MercyScreen extends Screen {
  readonly view = MercyView;
  popup = true;
  readonly state = reactive({ message: '', rev: 0 });

  constructor(readonly play: PlayScreen, readonly r: Resident) {
    super();
  }

  options() {
    void this.state.rev;
    return this.play.session.justice.mercyOptions(this.r);
  }

  act(m: Mercy): void {
    this.state.message = this.play.session.justice.mercy(this.r, m);
    this.state.rev++;
    // Tending may be done again; the rest end it.
    if (m !== 'tend' || !this.r.present) this.close();
  }

  key(e: KeyboardEvent): boolean {
    if (e.code === 'Escape') this.close();
    else if (/^Digit[1-6]$/.test(e.code)) {
      const o = this.options()[Number(e.code.slice(5)) - 1];
      if (o && !o.why) this.act(o.act);
    } else return true;
    return true;
  }
}
