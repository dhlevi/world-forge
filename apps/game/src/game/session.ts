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
import { BRUSH_TOOLS, clearBrush } from './tasks';
import { figureOf } from './figure';
import { makeItem } from '../actors/items/item';
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
import { Body, Identity, Knowledge, Mood, Skills, Traits, type Moodlet } from '../actors/components';
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
import { Population, doingWords, type Resident } from '../world/population';
import { Fauna, animalLines, type Presence } from '../world/fauna';
import { Snares, carcassOf } from '../world/hunting';
import { SPECIES_BY_ID } from '@worldforge/core/local/fauna';
import { LOUD, directionWords, heardLevel, hearingThreshold, readTracks, takesTracks, type Noise } from '../world/senses';
import { opinionWords } from '../world/opinions';
import { greeting, lineOf } from '../world/talk';
import { sunTimes } from '@worldforge/core/weather/weather';
import { WeatherService, type Sky, type SkyPicture } from './weather';
import type { RoofMode } from './roofs-mode';
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
  /** The residents about a tile at a time, placed by their day plan (none: nobody is placed). */
  requestPeople?: WorkerClient['requestPeople'];
  /** The animals about a tile (none: no animals). */
  requestAnimals?: WorkerClient['requestAnimals'];
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

/** How far each light held reaches (tiles). */
const LIGHT_REACH: Record<string, number> = { torch: 7, lantern: 6, candle: 3 };

export class PlaySession {
  readonly cast: Cast;
  readonly map: GameMap;
  readonly game: Game;
  readonly travel: Travel;
  /** The residents about the wanderer (world/population.ts), the animals (world/fauna.ts), and the snares set (world/hunting.ts). */
  readonly people: Population;
  readonly fauna: Fauna;
  readonly snares = new Snares();
  /** When the wanderer last practised Sneak near animals (game seconds). */
  private sneakAt = -1;
  /** When the tracks were last weathered; when each kind of noise was last told of (game seconds). */
  private lastTracksAt = -1;
  private toldNoise = new Map<string, number>();
  /** How often the wanderer has talked to each person today (for varying their lines). */
  private talks = new Map<string, number>();
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
    /**
     * Levels looked up (more than 0) or down (less than 0) from the wanderer's own, with < and >:
     * the map is then drawn as a slice at that level (game/renderer.ts). 0: the surface.
     */
    view: 0,
    /** Roofs over buildings: never, always, or unless the wanderer is inside (kept in the save). */
    roofs: 'auto' as RoofMode,
    name: '',
    line: '',
    /** The needs as bars and words (actors/needs.ts), and the air. */
    needs: [] as { id: NeedId; label: string; word: string; bar: number }[],
    air: '',
    /** The weather and the hour in words (game/weather.ts), and as the panel's picture of the sky. */
    weather: null as { when: string; wind: string; air: string; sun: string } | null,
    sky: null as SkyPicture | null,
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
      if (o.restore.roofs) this.state.roofs = o.restore.roofs;
      game.say('You take up where you left off.');
    }
    this.savedAt = o.restore ? game.time : -1;
    this.lastT = game.time;

    this.weather = new WeatherService(o.settings.seed, o.site.lon, o.site.lat);
    this.skyNow = this.weather.sky(game.time);
    this.practice = new Practice(() => this.player, world.bus, game);
    this.travel = new Travel(game, [o.site.lon, o.site.lat], (from, to) => world.requestRoute(from, to));

    // The game's hooks: what slows the wanderer, what they carry for light, what happens as time passes.
    game.loadSlow = () => this.invSlow() * (this.needs()?.slow() ?? 1) * this.groundSlow() * (game.sneaking ? 1.6 : 1);
    game.carriedLight = () => {
      const it = this.heldLight();
      return it ? LIGHT_REACH[it.def] ?? 3 : 0;
    };
    game.onTime = (t) => this.tick(t);
    game.climb = (metres, up) => this.practice.climb(metres, up, this.invSlow());
    const plain = game.figure();
    game.figure = () => (this.player ? figureOf(this.player) : plain);
    game.onScratch = () => this.player?.get(Mood)?.add({ id: 'scratched', text: 'Scratched by thorns', value: -1, until: game.time + 2 * 3600 });
    game.onChange = () => this.redraw();

    // The residents about the wanderer (world/population.ts), placed by their day plans.
    const ask = world.requestPeople;
    this.people = new Population(ask ? (x, y, t, rise, set) => ask(x, y, t, rise, set) : () => Promise.resolve({ people: [], radius: 0 }), o.settings.seed);
    this.people.onChange = () => {
      if (this.state.mode === 'local') this.redraw();
    };
    game.people = () => (this.state.mode === 'local' ? this.people.all() : []);
    game.personAt = (x, y, z) => {
      const r = this.state.mode === 'local' ? this.people.at(x, y, z) : null;
      return r ? { name: r.p.name, lines: residentLines(r, this.people, game.time) } : null;
    };
    // The senses (world/senses.ts): the wanderer's noises heard by those about, their tracks, and walking into people.
    game.onBump = (x, y, z) => {
      const r = this.people.at(x, y, z);
      return r ? this.people.bumped(game, r) : null;
    };
    game.onNoise = (kind, x, y, z, dir) => {
      const gid = game.map.groundAt(x, y, z), gd = GROUND_TILES[gid];
      // Sneaking: much quieter (more so with skill).
      const hush = game.sneaking ? 10 + (this.player?.get(Skills)?.effective('sneak') ?? 0) / 8 : 0;
      const loud = (kind === 'door' ? LOUD.door : gd?.water ? LOUD.stepWater : takesTracks(gid, true) ? LOUD.stepSoft : LOUD.stepHard) - hush;
      const n = { x, y, z, loud, kind, what: kind === 'door' ? 'a door' : 'footsteps' };
      if (this.state.mode === 'local') {
        this.people.hearPlayer(game, n);
        if (z === null) this.fauna.hearPlayer(game, n, this.presence());
        if (kind === 'step') this.stepped(x, y, z);
      }
      if (kind === 'step' && takesTracks(gid, this.people.wet)) this.people.tracks.add(x, y, z, { t: game.time, by: 'player', kind: this.player?.get(Body)?.d.kind ?? 'human', dir });
    };
    game.tracksText = (x, y, z) => readTracks(this.people.tracks.at(x, y, z, game.time), game.time, this.player?.get(Skills)?.effective('tracking') ?? 0);
    game.tracksOn = (x, y, z) => this.people.tracks.at(x, y, z, game.time).length;
    this.people.onSee = (text) => game.say(text);
    // The animals about (world/fauna.ts), their noises and tracks, and the wanderer's snares (world/hunting.ts).
    const askA = world.requestAnimals;
    this.fauna = new Fauna(askA ? (x, y, t, w) => askA(x, y, t, w) : () => Promise.resolve({ groups: [], radius: 0 }), this.people.tracks);
    this.fauna.personAt = (x, y) => !!this.people.at(x, y, null);
    this.fauna.onSee = (text) => game.say(text);
    this.fauna.onChange = () => {
      if (this.state.mode === 'local') this.redraw();
    };
    this.people.animalAt = (x, y, z) => z === null && (this.fauna.at(x, y)?.alt ?? 1) === 0;
    this.people.shoo = (x, y) => this.fauna.shoo(x, y, game);
    game.animals = () => (this.state.mode === 'local' ? [...this.fauna.all()].map((a) => ({ x: a.x, y: a.y, alt: a.alt, perched: a.perched, facing: a.facing, species: a.s.id, moving: a.state === 'walk' || a.state === 'flee' || a.state === 'chase' || a.state === 'stalk' || a.state === 'drink', sleeping: a.state === 'sleep' })) : []);
    game.animalAt = (x, y) => {
      const a = this.state.mode === 'local' ? this.fauna.at(x, y) : null;
      return a ? animalLines(a, game.time) : null;
    };
    game.onBumpAnimal = (x, y) => {
      const a = this.state.mode === 'local' ? this.fauna.at(x, y) : null;
      return a && a.alt === 0 ? this.fauna.bumped(game, a) : null;
    };
    if (o.restore?.people) {
      this.people.opinions.import(o.restore.people.opinions);
      this.people.tracks.import(o.restore.people.tracks);
      this.snares.import(o.restore.people.snares);
      for (const id of o.restore.people.gone ?? []) this.fauna.gone.add(id);
    }

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
    if (this.state.mode === 'local') this.people.update(game);
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
    // On a floor above or below the ground (a storey, a cellar, a cave, a dungeon): under cover.
    if (g.z !== null) return true;
    return GROUND_TILES[g.map.ground(g.px, g.py)]?.name.startsWith('floor_') ?? false;
  }

  /**
   * Lights a lantern, a torch or a candle from what is carried (into a free hand), or puts out the
   * one held and puts it away (F).
   */
  toggleLight(): void {
    const g = this.game, inv = this.player?.get(Inventory);
    if (!inv) return;
    const held = this.heldLight();
    if (held) {
      const why = inv.stow(held);
      g.say(why ? `You cannot put the ${held.def} away: ${why}.` : `You put out the ${held.def} and put it away.`);
      g.refresh();
      return;
    }
    const best = ['lantern', 'torch', 'candle'].map((id) => inv.d.items.find((i) => i.def === id && (i.uses ?? 1) > 0 && i.loc?.at !== 'hand')).find(Boolean);
    if (!best) {
      g.say('You have nothing to light: no torch, lantern or candle that will burn.');
      return;
    }
    const h = inv.hands();
    const hand = h.both ? null : !h.right ? 'right' : !h.left ? 'left' : null;
    if (!hand) {
      g.say('Your hands are full.');
      return;
    }
    const it = best.qty > 1 ? inv.split(best.uid, 1) ?? best : best;
    const why = inv.put(it, { at: 'hand', hand });
    if (why) {
      g.say(`You cannot take the ${it.def} in hand: ${why}.`);
      return;
    }
    g.time += 10;
    g.say(`You light ${it.def === 'lantern' ? 'the lantern' : `a ${it.def}`}.`);
    g.refresh();
  }

  /** A torch, lantern or candle held, still burning. */
  private heldLight(): Item | undefined {
    const h = this.player?.get(Inventory)?.hands();
    return [h?.left, h?.right, h?.both].find((i) => i && i.def in LIGHT_REACH && (i.uses ?? 1) > 0);
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
    // The road begins out of doors, on the ground.
    if (this.game.z !== null) {
      this.game.say('You must go down to the ground first.');
      this.game.updateHud();
      return;
    }
    this.hud.mode = 'play';
    this.game.cursor = null;
    this.state.mode = 'travel';
    this.people.clear();
    this.fauna.clear();
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
    this.people.update(this.game);
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
    if (this.state.mode === 'local' && !this.travel.running) {
      // The people about: the day's light for their plans, and the rain that sends them indoors.
      const sky = this.weather.sky(t), st = sunTimes(this.o.site.lat, sky.doy);
      this.people.sun = 'polar' in st ? (st.polar === 'day' ? { rise: 4, set: 22 } : { rise: 9, set: 15 }) : { rise: st.rise, set: st.set };
      this.people.raining = sky.w.rainMm > 0.5;
      this.people.wet = this.people.raining || sky.mud > 0.2 || sky.snowCm > 0;
      this.people.update(game);
      // The animals, and the snares set for them.
      this.fauna.update(game, this.presence());
      for (const sn of this.snares.run(this.fauna, game, this.player?.get(Skills)?.effective('survival') ?? 0)) {
        if (game.isVisible(sn.x, sn.y) && game.z === null) game.say(`Your snare catches a ${SPECIES_BY_ID.get(sn.caught ?? '')?.name ?? 'beast'}.`);
      }
      this.listen();
      // Rain and falling snow wash out (or cover) the older tracks; the rest fade in time.
      if (Math.floor(t / 600) !== Math.floor(this.lastTracksAt / 600)) {
        this.lastTracksAt = t;
        this.people.tracks.weather(t, sky.w.rainMm > 1 || (sky.w.kind.includes('snow') && sky.w.rainMm > 0.2));
        this.people.opinions.prune(t);
      }
    }
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
    // A torch held by night, or below the land, burns down.
    const lamp = this.heldLight();
    if (lamp && (s.light < 0.5 || (game.z !== null && game.z < game.map.level(game.px, game.py)))) {
      this.torchS += dt;
      while (this.torchS >= 3600 && (lamp.uses ?? 0) > 0) {
        this.torchS -= 3600;
        lamp.uses = (lamp.uses ?? 1) - 1;
        if (lamp.uses <= 0) game.say(`Your ${lamp.def === 'torch' ? 'torch gutters out' : lamp.def === 'lantern' ? 'lantern burns dry' : 'candle burns down'}.`);
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
    this.state.sky = this.weather.picture(s, { inside, tempC: Math.round(airC), ...(felt !== undefined && Math.abs(felt - airC) >= 3 ? { feltC: Math.round(felt) } : {}) });
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
  /** Asks which way to cut brush (A), if there is a blade to cut with. */
  startCut(): void {
    const g = this.game, inv = this.player?.get(Inventory);
    if (!inv || !BRUSH_TOOLS.some(([id]) => inv.d.items.some((i) => i.def === id))) {
      g.say('You have no blade to cut brush with: a machete, an axe, a hatchet, a sword or a knife.');
      return;
    }
    this.hud.mode = 'cut';
    g.say('Cut brush in which direction?');
  }

  /**
   * What the wanderer hears of the people about that they cannot see (world/senses.ts): the noise
   * of work, doors, voices, footsteps close by in the quiet; each kind told of once in a while.
   */
  private listen(): void {
    const g = this.game, noises = [...this.people.noises.splice(0), ...this.fauna.noises.splice(0)];
    const hearing = this.player?.get(Traits)?.get('hearing') ?? 10;
    const thr = hearingThreshold(hearing);
    let best: { n: Noise; level: number } | null = null;
    for (const n of noises) {
      if (n.by === 'player' || (n.z === g.z && g.isVisible(n.x, n.y))) continue;
      const level = heardLevel(g.map, n, { x: g.px, y: g.py, z: g.z });
      // Footsteps only close by; the rest as far as they carry.
      if (level < thr || (n.kind === 'step' && Math.max(Math.abs(n.x - g.px), Math.abs(n.y - g.py)) > 8)) continue;
      if (!best || level - thr > best.level - thr) best = { n, level };
    }
    if (!best) return;
    const n = best.n, key = `${n.kind}:${n.what}`;
    const last = this.toldNoise.get(key);
    if (last !== undefined && g.time - last < (n.kind === 'work' ? 300 : 120)) return;
    this.toldNoise.set(key, g.time);
    const where = directionWords({ x: g.px, y: g.py }, n), far = Math.max(Math.abs(n.x - g.px), Math.abs(n.y - g.py)) > 25 ? ' in the distance' : '';
    g.say(`You hear ${n.what}${far} ${where}.`);
  }

  /** The wanderer as the animals sense them: sneaking and how well, the light, the wind, the season, the day's light. */
  presence(): Presence {
    const sky = this.skyNow, w = sky.w, toward = (((w.windFrom + 180) % 360) * Math.PI) / 180;
    return {
      sneaking: this.game.sneaking, sneak: this.player?.get(Skills)?.effective('sneak') ?? 0, light: sky.light,
      wind: { x: Math.sin(toward), y: -Math.cos(toward), strength: w.windMs }, winter: sky.season === 'winter', rise: this.people.sun.rise, set: this.people.sun.set,
    };
  }

  /** Sneaking, or not (Shift+S). */
  toggleSneak(): void {
    const g = this.game;
    g.sneaking = !g.sneaking;
    g.say(g.sneaking ? 'You move quietly, keeping low.' : 'You stop sneaking.');
  }

  /**
   * A step taken: a snare's catch taken from under foot; sneaking unnoticed near an animal practises
   * Sneak (once a minute at most).
   */
  private stepped(x: number, y: number, z: number | null): void {
    const g = this.game, inv = this.player?.get(Inventory);
    const sn = z === null ? this.snares.at(x, y) : undefined;
    if (sn?.caught && inv) {
      const s = SPECIES_BY_ID.get(sn.caught);
      if (s) {
        const it = carcassOf(s);
        const left = !!inv.stow(it);
        if (left) g.ground.put(x, y, [it]);
        g.say(`You take a dead ${s.name} from your snare${left ? ', and lay it down: you have no room for it' : ''}.`);
      }
      sn.caught = undefined;
      sn.tried = g.time;
    }
    if (g.sneaking && g.time - this.sneakAt > 60) {
      for (const a of this.fauna.all()) {
        if (Math.max(Math.abs(a.x - x), Math.abs(a.y - y)) > 12 || g.time - a.noticed < 120 || a.state === 'sleep') continue;
        this.sneakAt = g.time;
        this.player?.get(Skills)?.practise('sneak', 0.15, g.time);
        break;
      }
    }
  }

  /** Sets a snare where the wanderer stands, or lifts one (P). */
  snareHere(): void {
    const g = this.game, inv = this.player?.get(Inventory);
    if (!inv) return;
    if (g.z !== null || GROUND_TILES[g.map.ground(g.px, g.py)]?.name.startsWith('floor_')) {
      g.say('Snares are for setting out of doors, on the ground.');
      return;
    }
    const here = this.snares.at(g.px, g.py);
    if (here) {
      this.snares.lift(g.px, g.py);
      const wire = makeItem('snares');
      if (inv.stow(wire)) g.ground.put(g.px, g.py, [wire]);
      g.time += 30;
      g.say('You lift the snare and coil the wire.');
      this.player?.changed();
      return;
    }
    const wire = inv.d.items.find((i) => i.def === 'snares');
    if (!wire) {
      g.say('You have no snare wire.');
      return;
    }
    if (wire.qty > 1) wire.qty -= 1;
    else inv.drop(wire.uid);
    this.snares.set(g.px, g.py, g.time);
    g.time += 5 * 60;
    this.player?.get(Skills)?.practise('survival', 0.2, g.time);
    g.say(`You set a snare here${this.snares.list.length > 1 ? ` (${this.snares.list.length} set)` : ''}. Come back for it later.`);
    this.player?.changed();
  }

  /** Talks to the one beside the wanderer: at once if there is one, else asks which way. */
  startTalk(): void {
    const g = this.game;
    const beside: [number, number][] = [];
    for (const [dx, dy] of [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] as [number, number][]) if (this.people.at(g.px + dx, g.py + dy, g.z)) beside.push([dx, dy]);
    if (!beside.length) {
      g.say('There is nobody beside you to talk to.');
      return;
    }
    if (beside.length === 1) {
      this.talk(beside[0][0], beside[0][1]);
      return;
    }
    this.hud.mode = 'talk';
    g.say('Talk to whom? (a direction)');
  }

  /** Talks to the person beside the wanderer in a direction: a greeting, and a line. */
  talk(dx: number, dy: number): void {
    const g = this.game, r = this.people.at(g.px + dx, g.py + dy, g.z);
    if (!r) {
      g.say('There is nobody there.');
      return;
    }
    const ops = this.people.opinions, t = g.time;
    g.time += 6;
    if (r.where === 'asleep') {
      g.say(`${r.p.given} is asleep. You let them be.`);
      return;
    }
    const met = ops.knows(r.p.id);
    const opinion = ops.of(r.p.id, t);
    r.facing = dx > 0 ? 'w' : dx < 0 ? 'e' : dy > 0 ? 'n' : 's';
    const tk = `${r.p.id}#${Math.floor(t / 86400)}`, said = this.talks.get(tk) ?? 0;
    if (!said && this.talks.size > 500) this.talks.clear();
    this.talks.set(tk, said + 1);
    const me = this.player?.get(Identity)?.d.given ?? 'traveller';
    g.say(`${r.p.name}: "${greeting(r, opinion, met, (t % 86400) / 3600, me)} ${lineOf(r, Math.floor(t / 86400), said, this.people.raining)}"`);
    // A civil word warms a little (no more than once a day); being pestered cools.
    if (said >= 4) ops.add(r.p.id, r.p.name, 'pestered me', -1, t, 1);
    else if (!met || ops.recent(r.p.id, 'spoke civilly', t, 86400) === 0) ops.add(r.p.id, r.p.name, 'spoke civilly', 3, t, 5);
    this.people.noises.push({ x: g.px, y: g.py, z: g.z, loud: LOUD.speech, kind: 'speech', by: 'player', what: 'voices' });
    this.redraw();
  }

  /** Cuts away the bush or scrub beside the wanderer (game/tasks.ts, clearBrush). */
  cutBrush(dx: number, dy: number): void {
    const g = this.game, a = this.player, inv = a?.get(Inventory);
    if (!a || !inv) return;
    const x = g.px + dx, y = g.py + dy;
    const o = OBJECT_TILES[g.map.object(x, y)];
    if (o?.name !== 'bush' && o?.name !== 'scrub') {
      g.say(o && o.name !== 'none' && (o.name.startsWith('tree') || o.name === 'tree_trunk') ? 'A tree wants an axe and an afternoon, not a few strokes.' : 'There is no brush there to cut.');
      return;
    }
    const r = clearBrush(a, inv, o.name, g.time);
    if (!r) {
      g.say('You have no blade to cut brush with.');
      return;
    }
    g.map.setObject(x, y, 0);
    g.time += r.seconds;
    g.activity = 'work';
    g.say(r.text);
    if (r.mood) a.get(Mood)?.add(r.mood);
    if (r.wood) {
      const wood = makeItem('firewood');
      if (inv.stow(wood)) g.ground.put(g.px, g.py, [wood]);
    }
    this.practice.flush();
    g.refresh();
  }

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
    return makeSave(this.game, {
      id: o.gameId, settings: o.settings, siteId: o.site.id, siteName: o.site.name, zoom: this.state.zoom, roofs: this.state.roofs, character: this.player?.toJSON(),
      people: { opinions: this.people.opinions.export(), tracks: this.people.tracks.export(), snares: this.snares.export(), gone: [...this.fauna.gone].slice(-500) },
    });
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

/** What the wanderer sees of a resident: who they are, what they are about, and (if met) how they stand toward the wanderer. */
function residentLines(r: Resident, pop: Population, t: number): string[] {
  const p = r.p;
  const an = (w: string) => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);
  const trade = p.trade === 'child' ? (p.female ? 'a girl' : 'a boy') : p.trade === 'retired' || p.trade === 'helps at home' ? '' : an(p.trade);
  const out = [`${p.name}${trade ? `, ${trade}` : ''}.`];
  out.push(`One of ${p.people}${p.age >= 12 ? `, about ${Math.max(12, Math.round(p.age / 5) * 5)} years old` : ''}.`);
  const doing = doingWords(r);
  if (doing) out.push(doing);
  if (pop.opinions.knows(r.p.id)) out.push(`You have met; ${r.p.female ? 'she' : 'he'} is ${opinionWords(pop.opinions.of(r.p.id, t))}.`);
  return out;
}
