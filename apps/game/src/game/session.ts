/**
 * A game being played: everything about it that is not drawing (components/PlayView.vue draws it
 * and maps keys to it). It holds the wanderer and the cast, the local map and the travel map,
 * the weather and the skills at work, and runs what happens as time passes: needs and the body,
 * the weather and the light, fires and torches, the log. It sleeps, drinks, reads the sky and
 * collapses; it remembers what the character knew of the world; it saves.
 *
 * It needs no browser to run: the world worker is reached through `SessionWorld`, and the
 * screens (the city view, the title) through `SessionHost`, so that scripts/session-test.ts can
 * play it in Node with stand-ins.
 */
import { reactive } from 'vue';
import { CHUNK, TILE_M } from '@worldforge/core/local/chunk';
import { GROUND_TILES, OBJECT_TILES, type Season } from '@worldforge/core/local/tiles';
import type { WorldSettings } from '@worldforge/core/settings';
import type { Weather } from '@worldforge/core/weather/weather';
import type { MessageDispatcher } from '../engine/messages';
import type { ChunkData, LocalSite, StartSite } from '../worker/protocol';
import type { RouteResult, WorkerClient } from '../app/worker-client';
import { background, onError } from '../app/errors';
import { desktop } from '../desktop';
import { Actor } from '../actors/actor';
import { Cast } from '../actors/cast';
import { check, DC } from '../actors/checks';
import { Identity, Knowledge, Skills, type Moodlet } from '../actors/components';
import { Inventory } from '../actors/items/inventory';
import { defOf, type Item } from '../actors/items/item';
import { Needs, type NeedId } from '../actors/needs';
import { airWord, seasonOf, type PlaceClimate } from './calendar';
import { SHELTERS } from './camp';
import { HOME_KNOWN_M } from './discovery';
import { Game, SIGHT, type Hud } from './game';
import { GameMap } from './map';
import { Practice } from './practice';
import { applySave, exportSave, makeSave, writeSave, type SaveFile } from './save';
import { Travel } from './travel';
import { WeatherService, type Sky } from './weather';
import { hash32 } from '../util';

/** What a game is begun or carried on from. */
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

/** The world worker, as far as a game in play needs it (app/worker-client.ts). */
export interface SessionWorld {
  bus: MessageDispatcher;
  requestChunk(cx: number, cy: number): void;
  climate(lon: number, lat: number): Promise<PlaceClimate>;
  requestRoute(from: [number, number], to: [number, number]): Promise<RouteResult>;
  site: WorkerClient['site'];
  /** The world's towns and cities that a game can begin in (for what the character knew). */
  starts(): StartSite[];
}

/** The screens about the game (screens/play.ts). */
export interface SessionHost {
  /** A town's or city's view, with the party at the place nearest `at` (or where it stands). */
  openCity(siteId: string, at?: { lon: number; lat: number }): Promise<void>;
  /** Back to the title. */
  toTitle(): void;
}

export interface SleepOptions {
  /** Wake early once rested. */
  untilRested?: boolean;
  /** Rest awake rather than sleep. */
  awake?: boolean;
  /** Runs after each hour (a camp's night events). */
  onHour?: (h: number) => void;
}

const NEED_LABEL: Record<NeedId, string> = { hunger: 'Food', thirst: 'Water', sleep: 'Rest', stamina: 'Stamina', heat: 'Warmth', wet: 'Dry' };
/** Real minutes between autosaves (when something has happened). */
const AUTOSAVE_MS = 3 * 60 * 1000;

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export class PlaySession {
  readonly cast: Cast;
  readonly map: GameMap;
  readonly game: Game;
  readonly travel: Travel;
  readonly weather: WeatherService;
  readonly practice: Practice;
  /** What the panel and log show of the map (game/game.ts writes it). */
  readonly hud = reactive<Hud>({ place: '', where: '', clock: '', log: [], look: [], mode: 'play', loading: 0 });
  /** What the panel shows otherwise (reactive). */
  readonly state = reactive({
    /** On foot (the local map) or travelling (the travel map). */
    mode: 'local' as 'local' | 'travel',
    /** How dark it is out of doors (the travel map dims). */
    darkness: 0,
    saving: false,
    /** The local map's zoom (kept in the save). */
    zoom: 2,
    name: '',
    line: '',
    /** The needs as bars and words (actors/needs.ts), and the air. */
    needs: [] as { id: NeedId; label: string; word: string; bar: number }[],
    air: '',
    /** The weather and the hour in words (game/weather.ts). */
    weather: null as { when: string; wind: string; air: string; sun: string } | null,
  });
  /** How the local map should look now: the sky's colour, snow lying, the season, the light (game/renderer.ts). */
  look: { sky: number; snowCm: number; season: Season; light: number } = { sky: 0xffffff, snowCm: 0, season: 'summer', light: 1 };
  /** Rain or snow falling where the wanderer can see it (null: none, or indoors). */
  falling: Weather | null = null;
  /** Called when something on screen has changed (set by the view). */
  onRedraw: () => void = () => {};

  private skyNow: Sky;
  private lastSky: Sky | null = null;
  private lastT: number;
  private climateAt: [number, number] | null = null;
  private torchS = 0;
  private lastReading: { hour: number; text: string } | null = null;
  private collapsing = false;
  /** After travelling, the wanderer is set on open ground once the chunks there have come. */
  private needFooting = false;
  /** Game time at the last save (-1: never), to know whether there is anything new to save. */
  private savedAt: number;
  private offs: (() => void)[] = [];

  constructor(readonly world: SessionWorld, readonly host: SessionHost, readonly o: PlayOptions) {
    this.cast = new Cast(world.bus);
    const data = o.restore?.character;
    const who = o.character ?? (data ? Actor.fromJSON(data) : null);
    if (who) this.cast.setPlayer(who);
    this.cast.setClock(o.restore?.time ?? 8 * 3600);

    this.map = new GameMap((cx, cy) => world.requestChunk(cx, cy));
    this.game = new Game(this.map, o.tile, o.sites, o.site.name, this.hud);
    const game = this.game;
    // The game's own chance, from its id (a save carries on the stream where it was).
    game.dice.state = hash32(`dice|${o.gameId}`);
    if (!o.restore || !o.restore.discovered) {
      // A new game knows the country about home (older saves: about where they stand).
      game.discovery.reveal(game.px, game.py, this.player?.get(Knowledge)?.d.homeRadiusM ?? HOME_KNOWN_M);
    }
    if (o.restore) {
      applySave(game, o.restore);
      if (o.restore.zoom) this.state.zoom = o.restore.zoom;
      game.say('You take up where you left off.');
    }
    this.savedAt = o.restore ? game.time : -1;
    this.lastT = game.time;

    this.weather = new WeatherService(o.settings.seed, o.site.lon, o.site.lat);
    this.skyNow = this.weather.sky(game.time);
    this.practice = new Practice(() => this.player, world.bus, game);
    this.travel = new Travel(game, [o.site.lon, o.site.lat], (from, to) => world.requestRoute(from, to));

    // The game's hooks: what slows the wanderer, what they carry for light, what happens as time passes.
    game.loadSlow = () => this.invSlow() * (this.needs()?.slow() ?? 1) * this.groundSlow();
    game.carriedLight = () => {
      const it = this.heldLight();
      return it ? (it.def === 'torch' ? 7 : 3) : 0;
    };
    game.onTime = (t) => this.tick(t);
    game.onChange = () => this.redraw();

    // The road: steps take skill (fords, steep ground), weather shortens sight, arriving opens the place.
    const travel = this.travel;
    travel.requestSite = world.site;
    travel.onStep = (st) => this.practice.travelStep(st, this.invSlow());
    travel.sightFactor = () => {
      const s = this.skyNow, w = s.w;
      return Math.max(0.1, Math.min(1, 0.15 + s.light)) * (1 - w.fog * 0.7) * (w.rainMm > 3 ? 0.5 : w.kind.includes('snow') ? 0.6 : 1);
    };
    // Arriving at a town or city opens its city view; a village opens straight onto the local map.
    travel.onArrive = (site) => {
      if (!site) return;
      const at = site.gate ? { lon: site.gate.lon, lat: site.gate.lat } : { lon: site.lon, lat: site.lat };
      if (site.tier === 'town' || site.tier === 'city') background(host.openCity(site.id, at), 'the game');
      else this.toLocal();
    };
    this.describe(game.time);
  }

  /**
   * Begins play: autosaving, the desktop's Save menu, errors told in the log, and for a new game
   * what the character knew of the world and a moodlet for setting out.
   */
  start(): void {
    const game = this.game;
    const autosave = setInterval(() => {
      if (game.time !== this.savedAt) background(this.save(true), 'the game');
    }, AUTOSAVE_MS);
    this.offs.push(() => clearInterval(autosave));
    const offMenu = desktop?.onMenu((what) => {
      if (what === 'save') background(this.save(), 'the game');
    });
    if (offMenu) this.offs.push(offMenu);
    // Errors that escape while playing are told in the log (app/errors.ts); the game carries on.
    this.offs.push(
      onError((msg) => {
        game.say(`Something went wrong: ${msg}. The game carries on; the details are in the developer console.`);
        this.redraw();
      }),
    );
    if (!this.o.restore) {
      background(this.applyKnowledge(), 'the game');
      // Setting out: a moodlet for the first day, sent through the messaging service.
      const p = this.player;
      if (p) this.world.bus.send('actor.moodlet', { id: 'setting-out', text: 'Setting out on the road', value: 3, until: game.time + 86400 } satisfies Moodlet, { to: p.id });
    }
    this.applySky(this.skyNow);
  }

  /** Ends play (the game is left): timers and listeners stopped, the cast dismissed. */
  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.travel.stop();
    this.cast.dispose();
  }

  get player(): Actor | null {
    return this.cast.player;
  }

  /** The sky where the wanderer is now (game/weather.ts). */
  get sky(): Sky {
    return this.skyNow;
  }

  redraw(): void {
    this.onRedraw();
  }

  // ---- Small things other screens ask -----------------------------------------------------------

  now(): number {
    return this.game.time;
  }

  advance(seconds: number): void {
    this.game.time += Math.max(0, Math.round(seconds));
    this.game.updateHud();
  }

  say(text: string): void {
    this.game.say(text);
  }

  /** The party's place (lon/lat). */
  party(): [number, number] {
    return this.travel.party();
  }

  private needs(): Needs | undefined {
    return this.player?.get(Needs);
  }

  private invSlow(): number {
    return this.player?.get(Inventory)?.loadInfo().slow ?? 1;
  }

  /** How the ground slows going: deep snow and mud. */
  private groundSlow(): number {
    const s = this.skyNow;
    return 1 + Math.min(1.2, Math.max(0, s.snowCm - 5) / 40) + s.mud * 0.2;
  }

  private indoors(): boolean {
    const g = this.game;
    return GROUND_TILES[g.map.ground(g.px, g.py)]?.name.startsWith('floor_') ?? false;
  }

  /** A torch or candle held, still burning. */
  private heldLight(): Item | undefined {
    const h = this.player?.get(Inventory)?.hands();
    return [h?.left, h?.right, h?.both].find((i) => i && (i.def === 'torch' || i.def === 'candle') && (i.uses ?? 1) > 0);
  }

  /** Name, age and needs for the panel, at a game time. */
  describe(time: number): void {
    const id = this.player?.get(Identity);
    this.state.name = id ? id.name : '';
    this.state.line = id ? `${id.d.people.replace(/^the /, '')} ${id.d.female ? 'woman' : 'man'}, ${id.ageAt(time)}` : '';
    const n = this.needs();
    if (n) {
      const w = n.words(), b = n.bars();
      this.state.needs = (Object.keys(NEED_LABEL) as NeedId[]).map((k) => ({ id: k, label: NEED_LABEL[k], word: w[k], bar: b[k] }));
      this.state.air = `${Math.round(n.d.airC)}°C, ${airWord(n.d.airC)}; ${seasonOf(time, this.o.site.lat)}`;
    }
  }

  // ---- The two maps ---------------------------------------------------------------------------

  toTravel(): void {
    this.hud.mode = 'play';
    this.game.cursor = null;
    this.state.mode = 'travel';
    this.game.say('You take to the road.');
    this.applySky(this.skyNow);
  }

  toLocal(): void {
    this.travel.stop();
    this.state.mode = 'local';
    this.needFooting = true;
    this.game.refresh();
    if (this.game.ensureFooting()) this.needFooting = false;
    this.applySky(this.skyNow);
    this.redraw();
  }

  /** Onto the local map at a place (lon/lat). */
  toLocalAt(lon: number, lat: number): void {
    this.travel.placeAt(lon, lat);
    this.toLocal();
  }

  /** Onto the travel map at a place (lon/lat). */
  toTravelAt(lon: number, lat: number): void {
    this.travel.placeAt(lon, lat);
    if (this.state.mode !== 'travel') this.toTravel();
  }

  /** A chunk of the local map has come from the worker. */
  onChunk(c: ChunkData): void {
    this.map.add(c);
    if (this.needFooting && this.game.ensureFooting()) this.needFooting = false;
    if (this.state.mode === 'local') this.game.refresh();
  }

  /** Asks for the local map about the wanderer and waits until it is made (at most half a minute). */
  async loadAround(r: number): Promise<boolean> {
    const g = this.game, map = this.map;
    map.want(g.px - r, g.py - r, g.px + r, g.py + r);
    const ready = () => [[-r, -r], [r, -r], [-r, r], [r, r], [0, 0]].every(([dx, dy]) => map.loaded(g.px + dx, g.py + dy));
    for (let i = 0; i < 300 && !ready(); i++) await new Promise((res) => setTimeout(res, 100));
    return ready();
  }

  // ---- As time passes -----------------------------------------------------------------------------

  /** The weather where the party is follows it (the climate is asked of the worker as it moves). */
  private updateClimate(): void {
    const [lon, lat] = this.travel.party();
    const at = this.climateAt;
    if (at && Math.abs(at[0] - lon) < 0.05 && Math.abs(at[1] - lat) < 0.05) return;
    this.climateAt = [lon, lat];
    background(
      this.world.climate(lon, lat).then((c) => {
        this.weather.setPlace(lon, lat, c);
        this.applySky(this.weather.sky(this.game.time));
      }),
      'the game',
    );
  }

  /** What happens as the clock moves on (game/game.ts calls it after every action and travel step). */
  tick(t: number): void {
    const game = this.game;
    this.updateClimate();
    const dt = Math.max(0, t - this.lastT);
    this.lastT = t;
    const s = this.weather.sky(t);
    const w = s.w;
    const inside = this.indoors();
    const camp = game.camps.at(game.px, game.py);
    // Camp fires burn down (game/camp.ts); heavy rain puts out an open fire.
    for (const c of game.camps.burn(game, dt)) if (camp === c) game.say('Your fire has burnt down to ashes.');
    if (!inside && w.rainMm > 2 && !w.kind.includes('snow')) {
      for (const c of game.camps.list) if (c.fire.lit && Math.hypot(c.x - game.px, c.y - game.py) < 400) {
        game.camps.setFire(game, c, false);
        c.fire.fuelH = 0;
        if (c === camp) game.say('The rain puts out your fire.');
      }
    }
    // The air, out of doors or in; a camp's fire and shelter warm it.
    const air = inside ? w.tempC + (16 - w.tempC) * 0.6 : w.tempC;
    const resting = game.activity === 'sleep' || game.activity === 'rest';
    const shelter = camp?.shelter && resting ? SHELTERS[camp.shelter.kind] : null;
    const cover = inside ? 1 : shelter?.rain ? 0.95 : 0;
    const windCover = inside ? 1 : shelter ? (shelter.rain ? 0.9 : 0.6) : camp ? camp.site.shelter * 0.5 : 0;
    const sun = !inside && s.sun.altitude > 0 ? (1 - w.cloud) * Math.min(1, s.sun.altitude / 40) : 0;
    const fireBy = !!camp?.fire.lit || (inside && !!game.besideObject(['hearth', 'forge', 'oven'], 2));
    this.cast.clock(t, {
      activity: game.activity, ambientC: air + game.camps.warmth(game.px, game.py, air), loadSlow: this.invSlow(), sleepQuality: game.sleepQuality,
      weather: inside ? undefined : { rainMm: w.rainMm, snow: w.kind.includes('snow'), windMs: w.windMs, sun }, cover, windCover, fire: fireBy,
    });
    // Weather in the log (not while asleep, but a season or snow noticed on waking).
    const changed = WeatherService.changes(this.lastSky, s);
    this.lastSky = s;
    if (game.activity !== 'sleep') for (const line of changed) game.say(line);
    // A storm stops a journey.
    const travel = this.travel;
    if (travel.running && (w.windMs >= 20 || (w.thunder && w.rainMm > 3) || w.kind === 'heavy snow')) {
      travel.stop();
      game.say(w.kind === 'heavy snow' ? 'The snow is too thick to go on in; you stop.' : 'The storm is too fierce to travel in; you stop and take what shelter you can.');
    }
    // A torch held by night burns down.
    const lamp = this.heldLight();
    if (lamp && s.light < 0.5) {
      this.torchS += dt;
      while (this.torchS >= 3600 && (lamp.uses ?? 0) > 0) {
        this.torchS -= 3600;
        lamp.uses = (lamp.uses ?? 1) - 1;
        if (lamp.uses <= 0) game.say(`Your ${lamp.def === 'torch' ? 'torch gutters out' : 'candle burns down'}.`);
      }
    }
    // Skills at work: swimming, hard going, wear on the feet (game/practice.ts).
    this.practice.time(dt, game.activity, this.invSlow());
    this.practice.flush();
    game.activity = 'rest';
    this.describe(t);
    this.applySky(s);
    const n = this.needs();
    if (!n) return;
    for (const note of n.takeNotes()) {
      game.say(note.text);
      // A need growing worse stops a journey, as dusk does.
      if (note.worse && travel.running && note.word !== 'Winded') {
        travel.stop();
        game.say('You stop.');
      }
    }
    if (n.collapse && !this.collapsing) {
      this.collapsing = true;
      setTimeout(() => this.collapse(), 0);
    }
  }

  /** The sky's colour on the map by the hour. */
  private static skyTint(s: Sky): number {
    if (s.sun.phase === 'night') return 0x7484bc;
    if (s.sun.phase === 'dawn' || s.sun.phase === 'dusk') return s.w.cloud > 0.8 ? 0xb0a8b8 : 0xffc29a;
    return s.w.fog > 0.4 ? 0xd8dce2 : s.w.cloud > 0.8 ? 0xdde2ea : 0xffffff;
  }

  /** Puts the sky on sight, the map's look and the panel. */
  private applySky(s: Sky): void {
    this.skyNow = s;
    this.state.darkness = Math.round((1 - s.light) * 20) / 20;
    const w = s.w;
    const inside = this.indoors();
    let range = s.light >= 0.9 ? SIGHT : Math.round(3 + 27 * Math.pow(s.light, 0.8));
    range = Math.round(range * (1 - w.fog * 0.75) * (w.rainMm > 3 ? 0.6 : w.kind.includes('snow') ? 0.7 : 1));
    this.game.ambient = inside ? { light: Math.max(0.15, s.light * 0.75), range: Math.max(4, range) } : { light: s.light, range: Math.max(2, range) };
    this.look = { sky: inside ? 0xffffff : PlaySession.skyTint(s), snowCm: s.snowCm, season: s.season, light: inside ? Math.max(0.4, s.light) : s.light };
    this.falling = this.state.mode === 'local' && !inside && w.kind !== 'none' ? w : null;
    const n = this.needs();
    const airC = n?.d.airC ?? w.tempC, felt = n?.d.feltC;
    const part = WeatherService.partOfDay(s);
    this.state.weather = {
      when: `${cap(part)}; ${WeatherService.skyWords(s)}`,
      wind: inside ? 'Indoors' : cap(WeatherService.windWords(w)),
      air: `${Math.round(airC)}°C${felt !== undefined && Math.abs(felt - airC) >= 3 ? ` (feels ${Math.round(felt)}°C)` : ''}, ${airWord(airC)}; ${s.season}${s.snowCm >= 2 ? `; snow ${s.snowCm} cm deep` : s.mud > 0.5 ? '; the ground is muddy' : ''}`,
      sun: this.weather.sunWords(s.t),
    };
    this.redraw();
  }

  // ---- What the wanderer does -------------------------------------------------------------------

  /** Reading the sky for what is coming (Survival): once an hour gives one reading. */
  readSky(): void {
    const a = this.player, game = this.game;
    if (!a) return;
    if (this.indoors()) {
      game.say('You cannot see the sky from in here.');
      return;
    }
    const hour = Math.floor(game.time / 3600);
    if (this.lastReading && this.lastReading.hour === hour) {
      game.say(this.lastReading.text);
      return;
    }
    game.time += 5 * 60;
    const r = check(a, 'survival', { difficulty: DC.routine - 10, now: game.time, mods: this.skyNow.light < 0.2 ? [{ why: 'the dark', value: -10 }] : [] });
    const text = this.weather.forecast(game.time, r.grade, () => a.need(Skills).random());
    this.lastReading = { hour, text };
    game.say(text);
    this.practice.flush();
    game.updateHud();
  }

  /** The body gives out: hours pass senseless, then the wanderer comes round, worse for it. */
  collapse(): void {
    const n = this.needs(), game = this.game;
    if (!n?.collapse) {
      this.collapsing = false;
      return;
    }
    const why = { thirst: 'Your legs give way: you have had nothing to drink for too long.', hunger: 'You faint from hunger.', sleep: 'You can stay awake no longer and drop where you stand.', heat: n.d.heat < 0 ? 'The cold takes you, and the world goes dark.' : 'The heat overcomes you, and you fall.', stamina: 'You collapse.', wet: 'You collapse.' }[n.collapse];
    this.travel.stop();
    game.say(why);
    game.sleepQuality = 0.3;
    for (let h = 0; h < 6; h++) {
      game.time += 3600;
      game.activity = 'sleep';
      game.updateHud();
    }
    game.sleepQuality = 0.6;
    n.recover();
    const p = this.player;
    if (p) this.world.bus.send('actor.moodlet', { id: 'collapsed', text: 'Collapsed', value: -8, until: game.time + 86400 } satisfies Moodlet, { to: p.id });
    game.say('You come round hours later, weak and shaken.');
    this.collapsing = false;
    this.redraw();
  }

  /** Sleeps or rests in hours, waking early when rested (or something needs seeing to). Returns the hours slept. */
  sleep(hours: number, quality: number, o: SleepOptions = {}): number {
    const n = this.needs(), game = this.game;
    this.travel.stop();
    game.say(o.awake ? 'You sit and rest.' : 'You lie down to sleep.');
    // Sleeping rough, Survival makes a better or worse bed of it.
    if (!o.awake && quality < 1) quality = this.practice.roughSleep(quality);
    game.sleepQuality = quality;
    let slept = 0;
    for (let h = 0; h < hours; h++) {
      game.time += 3600;
      game.activity = o.awake ? 'rest' : 'sleep';
      game.updateHud();
      slept++;
      o.onHour?.(h);
      if (o.untilRested && n && n.d.fatigue <= 2 && n.d.debt < 0.5) break;
      if (n?.collapse) break;
    }
    game.sleepQuality = 0.6;
    if (!o.awake && slept > 0) {
      const p = this.player;
      const cold = (n?.d.airC ?? 15) < 8;
      const mood: Moodlet = quality >= 1 ? { id: 'slept', text: 'Slept in a bed', value: 3, until: game.time + 12 * 3600 }
        : quality >= 0.8 ? { id: 'slept', text: 'Slept rough', value: 0, until: game.time + 12 * 3600 }
        : { id: 'slept', text: cold ? 'Slept on the cold ground' : 'Slept on the ground', value: cold ? -4 : -2, until: game.time + 12 * 3600 };
      if (p && mood.value) this.world.bus.send('actor.moodlet', mood, { to: p.id });
      game.say(`You wake after ${slept} hour${slept === 1 ? '' : 's'}${quality < 0.8 ? ', stiff from the ground' : ''}.`);
    } else if (o.awake) game.say(`You rest ${slept} hour${slept === 1 ? '' : 's'}.`);
    game.refresh();
    return slept;
  }

  /** Drinking from water beside (a river, a lake, a well, a fountain), and filling waterskins. */
  drinkHere(): void {
    const n = this.needs(), game = this.game;
    const inv = this.player?.get(Inventory);
    if (!n) return;
    // A well or fountain, or water, beside.
    const found = game.nearby(1, (x, y) => {
      const od = OBJECT_TILES[game.map.object(x, y)];
      if (od?.name === 'well' || od?.name === 'fountain') return od.look;
      return GROUND_TILES[game.map.ground(x, y)]?.water ? 'the water' : null;
    });
    if (!found) {
      game.say('There is no water here to drink.');
      // Search the land about for some (Survival).
      if (!this.indoors()) this.practice.findWater();
      return;
    }
    const took = n.drink(n.room().litres);
    let filled = 0;
    for (const it of inv?.d.items ?? []) {
      const d = defOf(it);
      if (d.id === 'waterskin' && d.uses && (it.uses ?? 0) < d.uses) {
        it.uses = d.uses;
        filled++;
      }
    }
    game.time += 30 + took * 60 + filled * 60;
    game.say(`${took > 0.05 ? `You drink from ${found}` : `You are not thirsty, but you wet your lips at ${found}`}${filled ? `, and fill ${filled === 1 ? 'your waterskin' : `${filled} waterskins`}` : ''}.`);
    game.updateHud();
  }

  /**
   * What the character knew of the world before setting out (their occupations and standing,
   * actors/creation/resolve.ts): the roads walked and the places seen, laid on the travel map once,
   * at the start of a new game.
   */
  private async applyKnowledge(): Promise<void> {
    const k = this.player?.get(Knowledge), game = this.game;
    if (!k || k.d.applied) return;
    k.d.applied = true;
    const from: [number, number] = [Math.floor(game.px / CHUNK), Math.floor(game.py / CHUNK)];
    const byId = new Map(this.world.starts().map((s) => [s.id, s]));
    for (const p of k.d.places) {
      const s = byId.get(p.id);
      if (!s) continue;
      const q = this.travel.frame.fromLL(s.lon, s.lat);
      game.discovery.reveal(Math.floor(q[0] / TILE_M), Math.floor(-q[1] / TILE_M), p.radiusM);
    }
    for (const id of k.d.roads) {
      const s = byId.get(id);
      if (!s) continue;
      const r = await this.world.requestRoute(from, [s.lon, s.lat]);
      for (const st of r.steps ?? []) game.discovery.reveal(st.cx * CHUNK + CHUNK / 2, st.cy * CHUNK + CHUNK / 2, 1200);
      const q = this.travel.frame.fromLL(s.lon, s.lat);
      game.discovery.reveal(Math.floor(q[0] / TILE_M), Math.floor(-q[1] / TILE_M), 2000);
    }
    if (k.d.roads.length || k.d.places.length) game.say('You know something of the country beyond: see the travel map (T).');
  }

  // ---- Saving ----------------------------------------------------------------------------------------

  /** The game as a save. */
  snapshot(): SaveFile {
    const o = this.o;
    return makeSave(this.game, { id: o.gameId, settings: o.settings, siteId: o.site.id, siteName: o.site.name, zoom: this.state.zoom, character: this.player?.toJSON() });
  }

  async save(quiet = false): Promise<void> {
    if (this.state.saving) return;
    this.state.saving = true;
    try {
      await writeSave(this.snapshot());
      this.savedAt = this.game.time;
      if (!quiet) this.game.say('Game saved.');
    } catch (err) {
      this.game.say(`Could not save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.state.saving = false;
      this.redraw();
    }
  }

  exportNow(): void {
    exportSave(this.snapshot());
    this.game.say('Saved game exported to a file.');
  }

  /** Saves if anything has happened since, and goes back to the title. */
  async leave(): Promise<void> {
    if (this.game.time !== this.savedAt) await this.save(true);
    this.host.toTitle();
  }
}
