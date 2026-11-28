/**
 * A notice board (docs/design/quests.md; game/quests.ts): the town's own troubles posted for anyone
 * to take up, the same through a week, standing in the square by the well or fountain. Each notice
 * is written in the town's language and script (game/writing.ts): one who reads it well reads it
 * all, one who reads a little makes out some words, and others see only the letters. A notice must
 * be read (at least in part) to be taken up; one who cannot read at all makes nothing of the board.
 */
import { reactive } from 'vue';
import { Screen } from '../engine/screens';
import { Skills } from '../actors/components';
import type { Quest } from '../game/quests';
import { readIn, written, type Written } from '../game/writing';
import type { SiteInfo, SitePlace } from '../worker/protocol';
import type { PlayScreen } from './play';
import NoticesView from './views/NoticesView.vue';

export class NoticesScreen extends Screen {
  readonly view = NoticesView;
  popup = true;
  readonly state = reactive({ version: 0, said: '', shown: {} as Record<string, boolean> });
  private cache = new Map<string, { text: Written; title: Written }>();

  constructor(readonly play: PlayScreen, readonly site: SiteInfo, readonly place?: SitePlace) {
    super();
  }

  private get skills(): Skills | undefined {
    return this.play.player?.get(Skills);
  }

  /** Whether the wanderer can read at all. */
  get literate(): boolean {
    return !!this.skills?.literate();
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

  /** A notice as written, and what the wanderer makes of it. */
  writing(q: Quest): { text: Written; title: Written } {
    let w = this.cache.get(q.id);
    if (!w) {
      w = { text: written(q.text, this.site.cultureIndex, this.skills), title: written(q.title, this.site.cultureIndex, this.skills, { size: 26 }) };
      this.cache.set(q.id, w);
    }
    return w;
  }

  /** Why a notice cannot be read, if it cannot. */
  why(q: Quest): string | null {
    if (!this.literate) return 'You cannot read.';
    const w = this.writing(q).text;
    return w.reading === 'none' ? `It is written in ${w.tongue ?? 'a tongue you do not know'}, which you cannot read.` : null;
  }

  enter(): void {
    const q = this.play.session.quests;
    if (!q.countryOf(this.site.id)) void q.prepare(this.site.id, this.site.lon, this.site.lat).then(() => this.state.version++);
  }

  /** Reads a notice (a minute; reading teaches a little of the language). */
  read(q: Quest): void {
    if (this.why(q) || this.state.shown[q.id]) return;
    this.state.shown[q.id] = true;
    this.play.advance(60);
    readIn(this.skills, this.site.cultureIndex);
  }

  take(q: Quest): void {
    if (!this.state.shown[q.id] || this.why(q)) return;
    this.state.said = this.play.session.quests.take(q);
    this.play.say(this.state.said);
    this.state.version++;
  }

  key(e: KeyboardEvent): boolean {
    if (e.code === 'Escape' || e.code === 'Enter') this.close();
    const n = /^Digit([1-9])$/.exec(e.code)?.[1];
    if (n) {
      const q = this.notices[Number(n) - 1];
      if (!q) return true;
      if (!this.state.shown[q.id]) this.read(q);
      else if (q.state === 'offered') this.take(q);
    }
    return true;
  }
}
