/**
 * Playing: the local and travel maps with the wanderer (components/PlayView.vue), and the
 * character sheet laid over it.
 */
import { reactive } from 'vue';
import { Screen } from '../engine/screens';
import type { GameApp } from '../app/app';
import type { WorldSettings } from '@worldforge/core/settings';
import type { ChunkData, LocalSite, StartSite } from '../worker/protocol';
import type { SaveFile } from '../game/save';
import { Actor } from '../actors/actor';
import { Cast } from '../actors/cast';
import { Identity } from '../actors/components';
import PlayView from '../components/PlayView.vue';
import SheetView from './views/SheetView.vue';

export interface PlayOptions {
  site: StartSite;
  tile: [number, number];
  sites: LocalSite[];
  gameId: string;
  settings: WorldSettings;
  /** A saved game to carry on from. */
  restore: SaveFile | null;
  /** The new character (for a new game). */
  character: Actor | null;
}

export class PlayScreen extends Screen {
  readonly view = PlayView;
  readonly cast: Cast;
  /** What the panel shows of the character (reactive). */
  readonly state = reactive({ name: '', line: '' });
  /** Set by the view: its key handler and its sink for chunks. */
  onKey: (e: KeyboardEvent) => boolean = () => false;
  onChunk: (c: ChunkData) => void = () => {};
  onResume: () => void = () => {};
  private offChunk: () => void = () => {};

  constructor(readonly app: GameApp, readonly o: PlayOptions) {
    super();
    this.cast = new Cast(app.bus);
    const data = o.restore?.character;
    const who = o.character ?? (data ? Actor.fromJSON(data) : null);
    if (who) this.cast.setPlayer(who);
    this.cast.setClock(o.restore?.time ?? 8 * 3600);
  }

  get player(): Actor | null {
    return this.cast.player;
  }

  /** Name and age for the panel, at a game time. */
  describe(time: number): void {
    const id = this.player?.get(Identity);
    this.state.name = id ? id.name : '';
    this.state.line = id ? `${id.d.people.replace(/^the /, '')} ${id.d.female ? 'woman' : 'man'}, ${id.ageAt(time)}` : '';
  }

  enter(): void {
    this.offChunk = this.app.bus.on('world.chunk', (c) => this.onChunk(c));
  }

  leave(): void {
    this.offChunk();
    this.cast.dispose();
  }

  resume(): void {
    this.onResume();
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === '@' && this.player) {
      this.showSheet();
      return true;
    }
    return this.onKey(e);
  }

  showSheet(): void {
    if (this.player) this.manager?.push(new SheetScreen(this.player, () => this.app.bus.now));
  }
}

/** The character sheet, over the map. */
export class SheetScreen extends Screen {
  readonly view = SheetView;
  popup = true;
  readonly state = reactive({ tab: 'life' as 'life' | 'skills' | 'gear' });
  constructor(readonly actor: Actor, readonly now: () => number) {
    super();
  }
  key(e: KeyboardEvent): boolean {
    if (e.code === 'Escape' || e.key === '@') this.close();
    else if (e.code === 'Digit1') this.state.tab = 'life';
    else if (e.code === 'Digit2') this.state.tab = 'skills';
    else if (e.code === 'Digit3') this.state.tab = 'gear';
    else return false;
    return true;
  }
}
