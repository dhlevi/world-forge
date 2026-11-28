/**
 * A town's notice board (docs/design/quests.md; game/quests.ts): the town's own troubles posted
 * for anyone to take up, the same through a week. Taken, a notice is the wanderer's work.
 */
import { reactive } from 'vue';
import { Screen } from '../engine/screens';
import type { Quest } from '../game/quests';
import type { SiteInfo, SitePlace } from '../worker/protocol';
import type { PlayScreen } from './play';
import NoticesView from './views/NoticesView.vue';

export class NoticesScreen extends Screen {
  readonly view = NoticesView;
  popup = true;
  readonly state = reactive({ version: 0, said: '' });

  constructor(readonly play: PlayScreen, readonly site: SiteInfo, readonly place: SitePlace) {
    super();
  }

  /** The notices up this week (empty until the country about is known). */
  get notices(): Quest[] {
    void this.state.version;
    return this.play.session.quests.notices(this.site, this.place);
  }

  /** Whether the board is still being read (the country about not yet known). */
  get reading(): boolean {
    void this.state.version;
    return !this.play.session.quests.countryOf(this.site.id);
  }

  enter(): void {
    const q = this.play.session.quests;
    if (!q.countryOf(this.site.id)) void q.prepare(this.site.id, this.site.lon, this.site.lat).then(() => this.state.version++);
  }

  take(q: Quest): void {
    this.state.said = this.play.session.quests.take(q);
    this.play.say(this.state.said);
    this.state.version++;
  }

  key(e: KeyboardEvent): boolean {
    if (e.code === 'Escape' || e.code === 'Enter') this.close();
    const n = /^Digit([1-9])$/.exec(e.code)?.[1];
    if (n) {
      const q = this.notices[Number(n) - 1];
      if (q && q.state === 'offered') this.take(q);
    }
    return true;
  }
}
