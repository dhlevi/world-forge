/**
 * Playing: the game itself (game/session.ts), drawn by components/PlayView.vue, with the screens
 * laid over it (the character sheet, the inventory, sleep, camp, a town's view).
 */
import type { Grade } from '../actors/checks';
import { reactive } from 'vue';
import { Screen } from '../engine/screens';
import type { GameApp } from '../app/app';
import { Actor } from '../actors/actor';
import PlayView from '../components/PlayView.vue';
import SheetView from './views/SheetView.vue';
import { CityScreen } from './city';
import { SleepScreen } from './sleep';
import { CampScreen } from './camp';
import { InventoryScreen } from './inventory';
import { PlaySession, type PlayOptions } from '../game/session';

export type { PlayOptions };

export class PlayScreen extends Screen {
  readonly view = PlayView;
  /** The game being played. */
  readonly session: PlaySession;
  /** Set by the view: its key handler. */
  onKey: (e: KeyboardEvent) => boolean = () => false;
  /** Checks that hold for a while (haggling at a place, for the day), by "place|day|what". */
  readonly dealings = new Map<string, Grade>();
  private offChunk: () => void = () => {};

  constructor(readonly app: GameApp, readonly o: PlayOptions) {
    super();
    const w = app.worker;
    this.session = new PlaySession(
      { bus: app.bus, requestChunk: (cx, cy) => w.requestChunk(cx, cy), climate: w.climate, requestRoute: w.requestRoute, site: w.site, starts: () => app.state.starts },
      { openCity: (id, at) => this.openCity(id, at), toTitle: () => app.toTitle() },
      o,
    );
  }

  get player(): Actor | null {
    return this.session.player;
  }

  enter(): void {
    this.offChunk = this.app.bus.on('world.chunk', (c) => this.session.onChunk(c));
    this.session.start();
    // For poking at in the browser console while developing.
    if (import.meta.env.DEV) {
      const s = this.session;
      Object.assign(window, { __play: this, __session: s, __game: s.game, __travel: s.travel, __practice: s.practice });
    }
  }

  leave(): void {
    this.offChunk();
    this.session.dispose();
  }

  resume(): void {
    this.session.redraw();
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === '@' && this.player) {
      this.showSheet();
      return true;
    }
    if (e.code === 'KeyZ' && e.shiftKey && this.player) {
      this.showSleep();
      return true;
    }
    if (e.code === 'KeyW' && e.shiftKey && this.player) {
      this.session.readSky();
      return true;
    }
    if (e.code === 'KeyC' && e.shiftKey && this.player) {
      this.showCamp();
      return true;
    }
    if ((e.code === 'KeyI' || e.code === 'KeyG') && !e.ctrlKey && !e.metaKey && this.player) {
      this.showInventory();
      return true;
    }
    return this.onKey(e);
  }

  now(): number {
    return this.session.now();
  }
  advance(seconds: number): void {
    this.session.advance(seconds);
  }
  say(text: string): void {
    this.session.say(text);
  }
  toLocalAt(lon: number, lat: number): void {
    this.session.toLocalAt(lon, lat);
  }
  toTravelAt(lon: number, lat: number): void {
    this.session.toTravelAt(lon, lat);
  }

  /** Opens a town's or city's city view, with the party at the place nearest `at` (or where it stands). */
  async openCity(siteId: string, at?: { lon: number; lat: number }): Promise<void> {
    const where = at ?? (() => {
      const p = this.session.party();
      return { lon: p[0], lat: p[1] };
    })();
    const r = await this.app.worker.site(siteId, where);
    if (!r.site || !r.site.places.length) {
      this.say('There is nothing here to see from afar; walk in instead.');
      return;
    }
    if (this.active) this.manager?.push(new CityScreen(this, r.site, where ?? { lon: r.site.lon, lat: r.site.lat }));
  }

  showSleep(): void {
    if (this.player) this.manager?.push(new SleepScreen(this, this.player));
  }

  showCamp(): void {
    if (this.player) this.manager?.push(new CampScreen(this, this.player));
  }

  showInventory(): void {
    if (this.player) this.manager?.push(new InventoryScreen(this, this.player));
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
