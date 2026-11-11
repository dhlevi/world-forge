/**
 * Travelling on the travel map: a route of steps (one chunk each, core local/travel.ts) walked one
 * after another with the clock running, until the party arrives, the player stops, or something
 * happens on the way. Long journeys come in legs, each planned when the last is walked.
 */
import { LocalFrame } from '@worldforge/core/towns/plan';
import { CHUNK, TILE_M } from '@worldforge/core/local/chunk';
import { BIOME_NAMES } from '@worldforge/core/gen/biomes';
import type { Game } from './game';
import type { RouteStep } from '../worker/protocol';
import { TRAVEL_SIGHT_M } from './discovery';

export type LL = [number, number];

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

  async setDest(ll: LL, name = ''): Promise<void> {
    this.stop();
    this.dest = ll;
    this.destName = name;
    await this.plan();
  }

  private async plan(): Promise<void> {
    if (!this.dest) return;
    this.planning = true;
    this.onChange();
    const from: [number, number] = [Math.floor(this.game.px / CHUNK), Math.floor(this.game.py / CHUNK)];
    const r = await this.requestRoute(from, this.dest);
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
    g.time += st.min * 60;
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
    this.game.say(this.destName ? `You arrive at ${this.destName}.` : 'You reach the place you were making for.');
    this.steps = [];
    this.i = 0;
    this.dest = null;
    this.onChange();
  }
}
