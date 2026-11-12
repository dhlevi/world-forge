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
import { CityScreen } from './city';
import { InventoryScreen } from './inventory';
import type { Game } from '../game/game';

/** What the play view lets other screens do with the game (set by components/PlayView.vue). */
export interface PlayHooks {
  /** Game time (s), and letting it pass. */
  now(): number;
  advance(seconds: number): void;
  say(text: string): void;
  /** The party's place (lon/lat). */
  party(): [number, number];
  /** Onto the local map at a place, or the travel map. */
  toLocalAt(lon: number, lat: number): void;
  toTravelAt(lon: number, lat: number): void;
  /** The game itself (the map, the ground, where the wanderer stands). */
  game(): Game;
  /** Redraws the map. */
  redraw(): void;
}

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
  hooks: PlayHooks | null = null;
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
    if ((e.code === 'KeyI' || e.code === 'KeyG') && !e.ctrlKey && !e.metaKey && this.player && this.hooks) {
      this.showInventory();
      return true;
    }
    return this.onKey(e);
  }

  now(): number {
    return this.hooks?.now() ?? 0;
  }
  advance(seconds: number): void {
    this.hooks?.advance(seconds);
  }
  say(text: string): void {
    this.hooks?.say(text);
  }
  toLocalAt(lon: number, lat: number): void {
    this.hooks?.toLocalAt(lon, lat);
  }
  toTravelAt(lon: number, lat: number): void {
    this.hooks?.toTravelAt(lon, lat);
  }

  /** Opens a town's or city's city view, with the party at the place nearest `at` (or where it stands). */
  async openCity(siteId: string, at?: { lon: number; lat: number }): Promise<void> {
    const where = at ?? (() => {
      const p = this.hooks?.party();
      return p ? { lon: p[0], lat: p[1] } : undefined;
    })();
    const r = await this.app.worker.site(siteId, where);
    if (!r.site || !r.site.places.length) {
      this.say('There is nothing here to see from afar; walk in instead.');
      return;
    }
    if (this.active) this.manager?.push(new CityScreen(this, r.site, where ?? { lon: r.site.lon, lat: r.site.lat }));
  }

  showInventory(): void {
    if (this.player && this.hooks) this.manager?.push(new InventoryScreen(this, this.player));
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
