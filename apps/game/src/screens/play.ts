/**
 * Playing: the game itself (game/session.ts), drawn by components/PlayView.vue, with the screens
 * laid over it (the character sheet, the inventory, sleep, camp, a town's view).
 */
import { background } from '../app/errors';
import { TalkScreen } from './talk';
import type { Grade } from '../actors/checks';
import { reactive } from 'vue';
import { Screen } from '../engine/screens';
import type { GameApp } from '../app/app';
import { Actor } from '../actors/actor';
import PlayView from '../components/PlayView.vue';
import SheetView from './views/SheetView.vue';
import KeysView from './views/KeysView.vue';
import { CityScreen } from './city';
import { SleepScreen } from './sleep';
import { CampScreen } from './camp';
import { InventoryScreen } from './inventory';
import { HealthScreen } from './health';
import { GroomScreen } from './groom';
import { PersonScreen } from './person';
import { JournalScreen } from './journal';
import { NoticesScreen } from './notices';
import type { PersonCard } from '../game/person-card';
import { Inventory } from '../actors/items/inventory';
import { defOf } from '../actors/items/item';
import { FightScreen } from './fight';
import { ShootScreen } from './shoot';
import { MercyScreen } from './mercy';
import type { Resident } from '../world/population';
import DeathView from './views/DeathView.vue';
import { Body } from '../actors/components';
import type { Dead } from '../game/save';
import { PlaySession, type PlayOptions } from '../game/session';
import type { Law } from '../world/law';

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
      { bus: app.bus, requestChunk: (cx, cy) => w.requestChunk(cx, cy), climate: w.climate, requestRoute: w.requestRoute, requestPeople: w.requestPeople, requestAnimals: w.requestAnimals, game: w.game, ties: w.ties, names: (c, s, n) => w.names(c, s, n), site: w.site, sitesNear: w.sitesNear, requestArea: w.requestArea, starts: () => app.state.starts },
      { openCity: (id, at, arrived) => this.openCity(id, at, arrived), toTitle: () => app.toTitle(), onDeath: () => this.showDeath(), mercy: (r) => this.showMercy(r), showCamp: () => this.showCamp(), converse: (c) => this.manager?.push(new TalkScreen(this, c)), notices: (site) => this.manager?.push(new NoticesScreen(this, site)) },
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
    // Dead: nothing more can be done but look, and go back to the title.
    if (this.session.state.dead) {
      if (e.code === 'Escape' || e.code === 'Enter') this.showDeath();
      return true;
    }
    if (e.key === '?') {
      this.showKeys();
      return true;
    }
    if (e.key === '@' && this.player) {
      this.showSheet();
      return true;
    }
    if (e.code === 'KeyZ' && e.shiftKey && this.player) {
      this.showSleep();
      return true;
    }
    if (e.code === 'KeyQ' && e.shiftKey && !e.ctrlKey && !e.metaKey && this.player) {
      this.manager?.push(new JournalScreen(this));
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
    // Shooting and throwing (combat.md, stage 3).
    if (e.code === 'KeyR' && !e.shiftKey && !e.ctrlKey && !e.metaKey && this.player && this.session.state.mode === 'local') {
      this.showShoot();
      return true;
    }
    // Gathering stones and sticks.
    if (e.code === 'KeyM' && !e.shiftKey && !e.ctrlKey && !e.metaKey && this.player && this.session.state.mode === 'local') {
      background(this.session.gather().then(() => this.session.redraw()), 'gathering');
      return true;
    }
    // The fight menu (combat.md, stage 2): a blow at a beast in reach, with its aim, blow and stance.
    if (e.code === 'KeyF' && e.shiftKey && !e.ctrlKey && !e.metaKey && this.player && this.session.state.mode === 'local') {
      this.showFight();
      return true;
    }
    // A light: a lantern, torch or candle lit from the pack, or the one held put out.
    if (e.code === 'KeyF' && !e.shiftKey && !e.ctrlKey && !e.metaKey && this.player && this.session.state.mode === 'local') {
      this.session.toggleLight();
      return true;
    }
    if (e.code === 'KeyD' && !e.shiftKey && !e.ctrlKey && !e.metaKey && this.player) {
      this.showHealth();
      return true;
    }
    // Looking a person over: the one under the look cursor, or the nearest in sight.
    if (e.code === 'KeyI' && e.shiftKey && !e.ctrlKey && !e.metaKey && this.session.state.mode === 'local') {
      this.inspect(this.session.hud.mode === 'look' ? this.session.game.cursor ?? undefined : undefined);
      return true;
    }
    if (e.code === 'KeyG' && e.shiftKey && !e.ctrlKey && !e.metaKey && this.player) {
      this.showGroom();
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

  /**
   * Opens a town's or city's city view, with the party at the place nearest `at` (or where it
   * stands); on arriving, with the account of the place (docs/backlog.md, I2).
   */
  async openCity(siteId: string, at?: { lon: number; lat: number }, arrived = false): Promise<void> {
    const where = at ?? (() => {
      const p = this.session.party();
      return { lon: p[0], lat: p[1] };
    })();
    const r = await this.app.worker.site(siteId, where);
    if (!r.site || !r.site.places.length) {
      this.say('There is nothing here to see from afar; walk in instead.');
      return;
    }
    if (this.active) this.manager?.push(new CityScreen(this, r.site, where ?? { lon: r.site.lon, lat: r.site.lat }, arrived));
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

  showMercy(r: Resident): void {
    if (this.active) this.manager?.push(new MercyScreen(this, r));
  }

  showShoot(): void {
    const s = this.session;
    const targets = s.fights.shootable(Math.max(4, ...s.fights.missiles().map((m) => m.max)));
    if (!targets.length) {
      s.say('There is no beast in sight to shoot at.');
      return;
    }
    this.manager?.push(new ShootScreen(this, targets));
  }

  showFight(): void {
    const s = this.session;
    // The reach of what is held, or of the best weapon carried (drawn when the blow is struck).
    const inv = this.player?.get(Inventory);
    const reach = Math.max(1, ...(s.fights.arms()?.blows.map((b) => b.reach) ?? [1]), ...(inv?.d.items.map((i) => defOf(i).melee?.reach ?? 1) ?? [1]));
    const targets = s.fights.inReach(reach);
    if (!targets.length) {
      s.say(reach > 1 ? 'There is no beast within reach of your weapon.' : 'There is no beast beside you to strike.');
      return;
    }
    this.manager?.push(new FightScreen(this, targets));
  }

  showHealth(): void {
    if (this.player) this.manager?.push(new HealthScreen(this, this.player));
  }

  /** Grooming: by the wanderer's own hand, or (in town) a barber's. */
  showGroom(barber = false): void {
    if (this.player) this.manager?.push(new GroomScreen(this, this.player, barber));
  }

  showPerson(card: PersonCard): void {
    this.manager?.push(new PersonScreen(card));
  }

  /**
   * Looks a person over (game/person-card.ts): the one on a tile (the wanderer's own: their sheet),
   * or, with none given, the nearest in sight. Returns whether there was someone to look at.
   */
  inspect(at?: [number, number]): boolean {
    const s = this.session, g = s.game;
    if (at && at[0] === g.px && at[1] === g.py) {
      this.showSheet();
      return !!this.player;
    }
    const spot = at ?? s.nearestPerson();
    const card = spot ? s.inspect(spot[0], spot[1]) : null;
    if (card) this.showPerson(card);
    else if (!at) s.say('There is no one in sight to look over.');
    return !!card;
  }

  showDeath(): void {
    const d = this.session.state.dead;
    if (d && this.active) this.manager?.push(new DeathScreen(this, d));
  }

  showSheet(): void {
    if (this.player) this.manager?.push(new SheetScreen(this.player, () => this.app.bus.now, (card) => this.showPerson(card), () => this.session.law.places(this.session.game.time)));
  }

  showKeys(): void {
    this.manager?.push(new KeysScreen());
  }
}

/** The wanderer is dead (combat.md, permadeath): of what, and back to the title. */
export class DeathScreen extends Screen {
  readonly view = DeathView;
  popup = true;
  readonly place: string;
  readonly scars: string[];
  constructor(readonly play: PlayScreen, readonly dead: Dead) {
    super();
    this.place = play.session.hud.place || 'the wilds';
    this.scars = play.player?.get(Body)?.scars ?? [];
  }
  toTitle(): void {
    this.close();
    this.play.app.toTitle();
  }
  key(e: KeyboardEvent): boolean {
    if (e.code === 'Enter') this.toTitle();
    else if (e.code === 'Escape') this.close();
    else return true;
    return true;
  }
}

/** The keys, over the map. */
export class KeysScreen extends Screen {
  readonly view = KeysView;
  popup = true;
  key(e: KeyboardEvent): boolean {
    if (e.code !== 'Escape' && e.key !== '?') return false;
    this.close();
    return true;
  }
}

/** The character sheet, over the map. */
export class SheetScreen extends Screen {
  readonly view = SheetView;
  popup = true;
  readonly state = reactive({ tab: 'life' as 'life' | 'skills' | 'gear' });
  /** `openPerson`: shows the card of one of the people of their life. */
  /** `places`: the settlements' regard for the wanderer, and where they are wanted (world/law.ts). */
  constructor(readonly actor: Actor, readonly now: () => number, readonly openPerson: (card: PersonCard) => void = () => {}, readonly places: () => ReturnType<Law['places']> = () => []) {
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
