/**
 * The screens of the way in: the title, loading a game, a new world's settings, the progress of
 * making one, and choosing where to begin.
 */
import { reactive } from 'vue';
import { Screen } from '../engine/screens';
import type { GameApp } from '../app/app';
import type { ViewLayer } from '../worker/protocol';
import TitleView from './views/TitleView.vue';
import LoadView from './views/LoadView.vue';
import SetupView from './views/SetupView.vue';
import ProgressView from './views/ProgressView.vue';
import StartView from './views/StartView.vue';

export class TitleScreen extends Screen {
  readonly view = TitleView;
  constructor(readonly app: GameApp) {
    super();
  }
  key(e: KeyboardEvent): boolean {
    if (e.code === 'KeyN') this.app.newGame();
    else if (e.code === 'KeyC' && this.app.state.saves.length) void this.app.continueGame(this.app.state.saves[0].id);
    else return false;
    return true;
  }
}

export class LoadScreen extends Screen {
  readonly view = LoadView;
  constructor(readonly app: GameApp) {
    super();
  }
  key(e: KeyboardEvent): boolean {
    if (e.code !== 'Escape') return false;
    this.close();
    return true;
  }
}

const WORDS = ['ash', 'brook', 'crown', 'dusk', 'ember', 'fern', 'gale', 'heath', 'iron', 'moor', 'oak', 'raven', 'salt', 'thorn', 'vale', 'wold'];

export class SetupScreen extends Screen {
  readonly view = SetupView;
  readonly state = reactive({ showMore: false });
  constructor(readonly app: GameApp) {
    super();
  }
  randomSeed(): void {
    const w = () => WORDS[Math.floor(Math.random() * WORDS.length)];
    this.app.state.settings.seed = `${w()}-${w()}-${Math.floor(Math.random() * 100)}`;
  }
  key(e: KeyboardEvent): boolean {
    if (e.code !== 'Escape') return false;
    this.app.toTitle();
    return true;
  }
}

/** Making a world, or laying out the place a game begins. */
export class ProgressScreen extends Screen {
  readonly view = ProgressView;
  readonly state = reactive({ stage: '', pct: 0 });
  private off: () => void = () => {};
  constructor(readonly app: GameApp, stage: string, pct = 0) {
    super();
    this.state.stage = stage;
    this.state.pct = pct;
  }
  enter(): void {
    this.off = this.app.bus.on('world.progress', (p) => {
      this.state.stage = p.stage;
      this.state.pct = p.pct;
    });
  }
  leave(): void {
    this.off();
  }
}

/** The world: where to begin. */
export class StartScreen extends Screen {
  readonly view = StartView;
  readonly state = reactive({ filter: '', chosen: '', layer: 'fantasy' as ViewLayer });
  constructor(readonly app: GameApp) {
    super();
    this.state.chosen = app.firstChoice();
  }
  begin(): void {
    if (this.state.chosen) this.app.createCharacter(this.state.chosen);
  }
  key(e: KeyboardEvent): boolean {
    if (e.code === 'Enter') this.begin();
    else return false;
    return true;
  }
}
