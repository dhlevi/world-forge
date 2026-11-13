/**
 * Travelling on the travel map: a route of steps (one chunk each, core local/travel.ts) walked one
 * after another with the clock running, until the party arrives, the player stops, or something
 * happens on the way. Long journeys come in legs, each planned when the last is walked.
 */
import { LocalFrame } from '@worldforge/core/towns/plan';
import { CHUNK, TILE_M } from '@worldforge/core/local/chunk';
import { BIOME_NAMES } from '@worldforge/core/gen/biomes';
import type { Game } from './game';
import type { Gate, RouteStep, SiteInfo } from '../worker/protocol';
import { TRAVEL_SIGHT_M } from './discovery';

export type LL = [number, number];

/** A settlement travelled to: the party makes for one of its gates, not its middle. */
export interface DestSite {
  id: string;
  name: string;
  tier: string;
  lon: number;
  lat: number;
  gate?: Gate;
}

/** Real milliseconds per step at each speed. */
export const SPEEDS = [{ label: 'Slow', ms: 260 }, { label: 'Steady', ms: 90 }, { label: 'Fast', ms: 25 }];

/** Something that happened on the way, and whether it stops travel. */
export interface TravelEvent {
  text: string;
  stop: boolean;
  /** Worth a look on the local map. */
  zoom?: boolean;
}

/** Hours at which travel stops for the night, if the player wishes. */
export const DUSK_HOUR = 20;

/**
 * What happens on a step. A first, simple set (the storyteller and real encounters come later):
 * travellers on the roads, signs of animals in the wild, a river to ford, and nightfall.
 */
export function stepEvents(step: RouteStep, before: number, after: number, stopAtDusk: boolean, roll: () => number): TravelEvent[] {
  const out: TravelEvent[] = [];
  if (step.ford) out.push({ text: 'You wade across a river.', stop: false });
  const dayBefore = Math.floor(before / 86400), hourBefore = (before % 86400) / 3600, hourAfter = (after % 86400) / 3600;
  if (stopAtDusk && (hourBefore < DUSK_HOUR && (hourAfter >= DUSK_HOUR || Math.floor(after / 86400) > dayBefore))) {
    out.push({ text: 'The light is failing; you stop for the night.', stop: true });
  }
  const r = roll();
  if (step.way === 'road' || step.way === 'track') {
    if (r < 0.004) out.push({ text: 'Travellers are coming along the road toward you.', stop: true, zoom: true });
  } else if (step.way !== 'street' && r < 0.003) {
    out.push({ text: 'You come across fresh tracks.', stop: true, zoom: true });
  }
  return out;
}

export class Travel {
  /** Called on each step walked: extra seconds it took (skill checks, game/practice.ts). */
  onStep: (st: RouteStep) => number = () => 0;
  steps: RouteStep[] = [];
  i = 0;
  dest: LL | null = null;
  destName = '';
  partial = false;
  running = false;
  planning = false;
  speed = 1;
  stopAtDusk = true;
  /** How far the party sees where it stands now (m). */
  sightM = TRAVEL_SIGHT_M;
  /** The settlement being travelled to, if the destination is one. */
  destSite: DestSite | null = null;
  /** Where the route actually leads (a gate), if not the destination itself. */
  private goal: LL | null = null;
  /** Asks the worker for a settlement's gates (set by the play view). */
  requestSite: ((id: string, at: { lon: number; lat: number }) => Promise<{ site: SiteInfo | null; gates: Gate[] }>) | null = null;
  /** Called on arriving: at a settlement (its gate), or at a point. */
  onArrive: (site: DestSite | null) => void = () => {};
  private timer = 0;
  /** Called whenever something changed (for the view). */
  onChange: () => void = () => {};
  readonly frame: LocalFrame;

  constructor(
    readonly game: Game,
    origin: LL,
    private requestRoute: (from: [number, number], to: LL) => Promise<{ steps: RouteStep[] | null; partial: boolean }>,
  ) {
    this.frame = new LocalFrame(origin[0], origin[1]);
  }

  /** The party's place in lon/lat. */
  party(): LL {
    return this.frame.toLL([(this.game.px + 0.5) * TILE_M, -(this.game.py + 0.5) * TILE_M]) as LL;
  }

  chunkLL(cx: number, cy: number): LL {
    return this.frame.toLL([(cx * CHUNK + CHUNK / 2) * TILE_M, -(cy * CHUNK + CHUNK / 2) * TILE_M]) as LL;
  }

  /** The route still ahead, in lon/lat (from the party). */
  ahead(): LL[] {
    if (!this.steps.length) return [];
    return [this.party(), ...this.steps.slice(this.i).map((s) => this.chunkLL(s.cx, s.cy))];
  }

  /** Minutes still to walk on this leg. */
  minutesLeft(): number {
    let m = 0;
    for (let k = this.i; k < this.steps.length; k++) m += this.steps[k].min;
    return m;
  }

  /** What the ground is like where the party is. */
  here(): string {
    const s = this.steps[this.i - 1];
    if (!s) return '';
    const way = s.way === 'road' ? 'on the road' : s.way === 'track' ? 'on a track' : s.way === 'street' ? 'in the streets' : '';
    const land = (BIOME_NAMES as Record<number, string>)[s.biome]?.toLowerCase() ?? '';
    return [way, land].filter(Boolean).join(', ');
  }

  async setDest(ll: LL, name = '', site?: DestSite): Promise<void> {
    this.stop();
    this.dest = ll;
    this.destName = name;
    this.destSite = site ? { ...site } : null;
    this.goal = null;
    if (site && this.requestSite) {
      // Make for the way in nearest the party.
      const r = await this.requestSite(site.id, site);
      const [plon, plat] = this.party();
      const k = Math.cos((plat * Math.PI) / 180);
      let best: Gate | undefined, bd = Infinity;
      for (const g of r.gates) {
        const d = Math.hypot((g.lon - plon) * k, g.lat - plat);
        if (d < bd) {
          bd = d;
          best = g;
        }
      }
      if (best && this.destSite) {
        this.destSite.gate = best;
        this.goal = [best.lon, best.lat];
      }
    }
    await this.plan();
  }

  private async plan(): Promise<void> {
    if (!this.dest) return;
    this.planning = true;
    this.onChange();
    const from: [number, number] = [Math.floor(this.game.px / CHUNK), Math.floor(this.game.py / CHUNK)];
    const r = await this.requestRoute(from, this.goal ?? this.dest);
    this.planning = false;
    if (!r.steps) {
      this.steps = [];
      this.i = 0;
      this.game.say(this.destName ? `You can find no way on foot to ${this.destName}.` : 'You can find no way on foot to there.');
    } else {
      this.steps = r.steps;
      this.i = 0;
      this.partial = r.partial;
    }
    this.onChange();
  }

  start(): void {
    if (this.running || !this.steps.length) return;
    this.running = true;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = 0;
    this.onChange();
  }

  clear(): void {
    this.stop();
    this.steps = [];
    this.i = 0;
    this.dest = null;
    this.destName = '';
    this.destSite = null;
    this.goal = null;
    this.onChange();
  }

  private tick(): void {
    if (!this.running) return;
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      void this.step();
    }, SPEEDS[this.speed].ms);
  }

  private async step(): Promise<void> {
    if (!this.running) return;
    if (this.i >= this.steps.length) {
      if (this.partial && this.dest) {
        await this.plan();
        if (this.steps.length) this.tick();
        else this.stop();
        return;
      }
      this.arrive();
      return;
    }
    const st = this.steps[this.i++];
    const g = this.game;
    const before = g.time;
    g.px = st.cx * CHUNK + CHUNK / 2;
    g.py = st.cy * CHUNK + CHUNK / 2;
    g.time += st.min * 60 * g.loadSlow();
    g.activity = 'travel';
    // Fords, steep ground and the like (game/practice.ts) may take longer.
    g.time += this.onStep(st);
    g.discovery.reveal(g.px, g.py, st.sight ?? TRAVEL_SIGHT_M);
    this.sightM = st.sight ?? TRAVEL_SIGHT_M;
    for (const ev of stepEvents(st, before, g.time, this.stopAtDusk, Math.random)) {
      g.say(ev.text);
      if (ev.stop) {
        this.running = false;
        if (ev.zoom) g.say('Press Z (or Zoom in) to see it close at hand.');
      }
    }
    g.updateHud();
    this.onChange();
    if (this.running) this.tick();
  }

  private arrive(): void {
    this.running = false;
    const site = this.destSite;
    if (site?.gate) {
      // Stand at the gate itself, not the middle of its chunk.
      const p = this.frame.fromLL(site.gate.lon, site.gate.lat);
      this.game.px = Math.floor(p[0] / TILE_M);
      this.game.py = Math.floor(-p[1] / TILE_M);
      const g = site.gate;
      this.game.say(g.walled ? `You arrive at ${site.name}, at ${g.name}.` : g.road ? `You come into ${site.name} by the ${g.road}.` : `You come to ${site.name}.`);
    } else this.game.say(this.destName ? `You arrive at ${this.destName}.` : 'You reach the place you were making for.');
    this.steps = [];
    this.i = 0;
    this.dest = null;
    this.destSite = null;
    this.goal = null;
    this.game.updateHud();
    this.onChange();
    this.onArrive(site);
  }

  /** Puts the party at a place (lon/lat), as when leaving a town by one of its gates. */
  placeAt(lon: number, lat: number): void {
    const p = this.frame.fromLL(lon, lat);
    this.game.px = Math.floor(p[0] / TILE_M);
    this.game.py = Math.floor(-p[1] / TILE_M);
    this.game.updateHud();
    this.onChange();
  }
}
