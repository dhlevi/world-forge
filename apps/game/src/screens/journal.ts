/**
 * The journal (Shift+Q; docs/design/quests.md; game/quests.ts): the work taken up and what is left
 * to do for it, and what has been done, given up or lost, told from the facts kept.
 */
import { reactive } from 'vue';
import { Screen } from '../engine/screens';
import type { Quest } from '../game/quests';
import type { PlayScreen } from './play';
import JournalView from './views/JournalView.vue';

export class JournalScreen extends Screen {
  readonly view = JournalView;
  popup = true;
  readonly state = reactive({ version: 0, selected: '' });

  constructor(readonly play: PlayScreen) {
    super();
    this.state.selected = this.inHand[0]?.id ?? this.past[0]?.id ?? '';
  }

  get inHand(): Quest[] {
    void this.state.version;
    return [...this.play.session.quests.active()].sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
  }

  get past(): Quest[] {
    void this.state.version;
    return this.play.session.quests.list.filter((q) => q.state !== 'active' && q.state !== 'offered').reverse();
  }

  get chosen(): Quest | undefined {
    void this.state.version;
    return this.play.session.quests.list.find((q) => q.id === this.state.selected);
  }

  todo(q: Quest): string[] {
    void this.state.version;
    return this.play.session.quests.todo(q);
  }

  leads(q: Quest): { text: string; where: string; found?: string }[] {
    void this.state.version;
    return this.play.session.quests.leads(q);
  }

  tell(q: Quest): string[] {
    return this.play.session.quests.tell(q);
  }

  giveUp(q: Quest): void {
    this.play.session.quests.giveUp(q);
    this.play.say(`You give up the work: ${q.title}.`);
    this.state.version++;
  }

  key(e: KeyboardEvent): boolean {
    if (e.code === 'Escape' || e.code === 'Enter' || (e.code === 'KeyQ' && e.shiftKey)) this.close();
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      const all = [...this.inHand, ...this.past], i = all.findIndex((q) => q.id === this.state.selected);
      const next = all[Math.max(0, Math.min(all.length - 1, i + (e.code === 'ArrowDown' ? 1 : -1)))];
      if (next) this.state.selected = next.id;
    }
    return true;
  }
}
