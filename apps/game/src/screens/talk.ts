/**
 * Talking with someone (from play, 27 November 2026; game/conversation.ts): their portrait and
 * how they regard the wanderer, what has been said, and what can be asked or tried; a seller's
 * wares open over it.
 */
import { reactive } from 'vue';
import { Screen } from '../engine/screens';
import type { Conversation } from '../game/conversation';
import { residentCard } from '../game/person-card';
import type { PlayScreen } from './play';
import { ShopScreen } from './shop';
import TalkView from './views/TalkView.vue';

export class TalkScreen extends Screen {
  readonly view = TalkView;
  popup = true;
  readonly state = reactive({ version: 0 });

  constructor(readonly play: PlayScreen, readonly talk: Conversation) {
    super();
  }

  get card() {
    void this.state.version;
    return residentCard(this.talk.r, this.play.session.people, this.play.now());
  }

  ask(id: string): void {
    const r = this.talk.ask(id);
    this.state.version++;
    this.play.session.game.updateHud();
    this.play.session.redraw();
    if (r?.open === 'shop' && r.place) this.manager?.push(new ShopScreen(this.play, r.place, this.play.session.townMake()));
    if (id === 'bye') this.close();
  }

  key(e: KeyboardEvent): boolean {
    if (e.code === 'Escape') {
      this.ask('bye');
      return true;
    }
    // A number picks the option of that number.
    const n = /^Digit([1-9])$/.exec(e.code)?.[1];
    if (n) {
      const o = this.talk.options()[Number(n) - 1];
      if (o && !o.why) this.ask(o.id);
    }
    return true;
  }
}
