/**
 * Needs and fatigue (docs/design/characters.md: hunger, thirst and sleep; the two-bar pools;
 * survival.md: body heat, food and drink). Run as game time passes (the `time.passed` message,
 * with what the person was doing), in steps of at most ten minutes.
 *
 * - **Hunger, in three layers:** food in the stomach (kcal) digests into the day's reserve, which
 *   the body burns by the hour (more walking, travelling laden, swimming or working, and in the
 *   cold). With the reserve empty, the body lives on itself and nourishment falls over days;
 *   only regular meals bring it back.
 * - **Thirst, the same way:** water in the stomach is taken up into the day's hydration, lost
 *   faster with effort and heat; with it gone, the body dries out over a day or two.
 * - **Sleep:** fatigue builds while awake (faster with effort) and falls in sleep, faster in a
 *   good bed; staying up past exhaustion builds a sleep debt, paid back slowly over good nights.
 * - **Stamina:** the physical burst pool is spent by swimming and hard going under a load and
 *   refills from the day pool at rest; the day pool is spent by the day's effort and refilled by
 *   sleep. An empty day pool is exhaustion.
 * - **Body heat:** worn clothes keep warm (their warmth against the air's temperature), effort
 *   warms; too cold or too hot drifts the body toward chill or overheating.
 *
 * Each need has a state in words ("Hungry", "Parched", "Exhausted", "Shivering"); worse states
 * slow the person, bring moodlets, and at the end bring collapse (no death yet: the person comes
 * round hours later, worse off). Changes are kept as notes for the game to report.
 *
 * Proposed numbers, to tune in play.
 */
import { Component } from './actor';
import type { Message } from '../engine/messages';
import { Body, Mood, Pools, Skills, type Activity, type TimeCtx } from './components';
import { Inventory } from './items/inventory';
import { defOf } from './items/item';

export type NeedId = 'hunger' | 'thirst' | 'sleep' | 'stamina' | 'heat' | 'wet';

export interface NeedsData {
  /** Food waiting in the stomach (kcal), and the day's reserve (kcal). */
  stomachKcal: number;
  reserveKcal: number;
  /** Long-term nourishment, 0 to 100. */
  nourish: number;
  /** Water in the stomach and the day's hydration (litres). */
  stomachL: number;
  hydrationL: number;
  /** Long-term hydration, 0 to 100. */
  hydrated: number;
  /** Fatigue (0 rested; 100 must sleep), and sleep debt (hours). */
  fatigue: number;
  debt: number;
  /** Body heat: below 0 cold, above 0 hot (-100 to 100). */
  heat: number;
  /** The air about them when last told (°C). */
  airC: number;
  /** How wet they are, 0 dry to 100 soaked through (from rain, snow, wading and swimming; game/weather.ts). */
  wet?: number;
  /** What the cold felt like when last told, with wind and wet counted in (°C). */
  feltC?: number;
  /** The words last reported for each need. */
  said: Partial<Record<NeedId, string>>;
}

export interface NeedNote {
  need: NeedId;
  word: string;
  /** Worse than before (stop travelling, say it plainly), or better. */
  worse: boolean;
  text: string;
}

const H = 3600;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** How many times the resting rate each activity burns energy, loses water and tires. */
const BURN: Record<Activity, number> = { rest: 1, sleep: 0.85, walk: 2.2, travel: 2.6, swim: 5, work: 3 };
const SWEAT: Record<Activity, number> = { rest: 1, sleep: 0.7, walk: 2, travel: 2.3, swim: 1.5, work: 2.5 };
const TIRE: Record<Activity, number> = { rest: 1, sleep: 0, walk: 1.2, travel: 1.4, swim: 1.8, work: 1.4 };
/** Warmth effort makes (°C felt warmer). */
const EFFORT_HEAT: Record<Activity, number> = { rest: 0, sleep: -2, walk: 3, travel: 4, swim: -6, work: 5 };

export class Needs extends Component {
  static readonly key = 'needs';
  private notes: NeedNote[] = [];
  /** Game time when last told (for timed moodlets). */
  private now = 0;
  /** A collapse waiting to be dealt with by the game: why. */
  collapse: NeedId | null = null;

  constructor(public d: NeedsData) {
    super();
  }

  static fresh(): NeedsData {
    return { stomachKcal: 400, reserveKcal: 1400, nourish: 100, stomachL: 0.3, hydrationL: 1.8, hydrated: 100, fatigue: 10, debt: 0, heat: 0, airC: 15, said: {} };
  }

  private bodyKg(): number {
    return this.actor?.get(Body)?.d.weightKg ?? 70;
  }

  /** The most the stomach holds (kcal, litres). */
  stomachCap(): { kcal: number; litres: number } {
    const k = this.bodyKg() / 70;
    return { kcal: 1300 * k, litres: 1.2 * k };
  }

  /** Warmth of what is worn: wet clothes keep less of it, except wool and fur. */
  insulation(): number {
    const inv = this.actor?.get(Inventory);
    if (!inv) return 6;
    const wet = (this.d.wet ?? 0) / 100;
    return inv.worn().reduce((s, i) => {
      const w = defOf(i).wear;
      return s + (w?.warmth ?? 0) * (1 - wet * (w?.wool ? 0.2 : 0.6));
    }, 0);
  }

  /** What the clothes keep off: rain (by the body and the head), wind, and a hot sun (0 to 1). */
  protection(): { rain: number; wind: number; sun: number } {
    const inv = this.actor?.get(Inventory);
    let body = 0, head = 0, wind = 0, sunB = 0, sunH = 0;
    for (const i of inv?.worn() ?? []) {
      const w = defOf(i).wear;
      if (!w?.regions) continue;
      if (w.regions.includes('torso')) {
        body = Math.max(body, w.rain ?? 0);
        wind = Math.max(wind, w.wind ?? 0);
        sunB = Math.max(sunB, w.sun ?? 0);
      }
      if (w.regions.includes('head') || w.regions.includes('face')) {
        head = Math.max(head, w.rain ?? 0);
        sunH = Math.max(sunH, w.sun ?? 0);
      }
    }
    return { rain: body * 0.75 + head * 0.25, wind, sun: sunH * 0.6 + sunB * 0.4 };
  }

  /** The range of air temperature this person is comfortable in, as dressed (°C). */
  comfort(): { low: number; high: number } {
    const w = this.insulation();
    return { low: 18 - 1.6 * w, high: 27 - 0.5 * w };
  }

  onMessage(m: Message): boolean {
    if (m.type !== 'time.passed') return false;
    const { dt, ctx, now } = (m as Message<'time.passed'>).payload;
    this.now = now;
    let left = dt;
    while (left > 0) {
      const step = Math.min(left, 600);
      this.step(step, ctx ?? {});
      left -= step;
    }
    this.review();
    return true;
  }

  private step(dt: number, ctx: TimeCtx): void {
    const d = this.d;
    const h = dt / H;
    const act: Activity = ctx.activity ?? 'rest';
    const load = ctx.loadSlow ?? 1;
    if (ctx.ambientC !== undefined) d.airC = ctx.ambientC;
    const kg = this.bodyKg();
    const asleep = act === 'sleep';

    // ---- Wet and dry (survival.md, Wetness).
    const wx = ctx.weather;
    const cover = clamp(ctx.cover ?? 0, 0, 1), windCover = clamp(ctx.windCover ?? cover, 0, 1);
    const prot = this.protection();
    let wet = d.wet ?? 0;
    if (act === 'swim') wet = 100;
    else {
      if (wx && wx.rainMm > 0) wet += wx.rainMm * (wx.snow ? 4 : 12) * (1 - prot.rain) * (1 - cover) * h;
      // Drying: faster in sun, wind, by a fire or indoors, and while working up a sweat (slower in the cold).
      const wind = wx ? wx.windMs * (1 - windCover) : 0;
      const dry = (5 + (wx?.sun ?? 0) * 15 * (1 - cover) + Math.min(20, wind * 1.2) + (ctx.fire ? 35 : 0) + cover * 8) * (d.airC < 0 ? 0.4 : d.airC < 8 ? 0.7 : 1);
      if (!wx || wx.rainMm <= 0 || cover >= 0.9) wet -= dry * h;
    }
    d.wet = clamp(wet, 0, 100);

    // ---- Body heat.
    const c = this.comfort();
    // The wind chills the unsheltered (less through windproof clothes), and so does being wet.
    const chill = wx && d.airC < 18 ? Math.max(0, wx.windMs - 1.5) * 0.7 * (1 - prot.wind * 0.8) * (1 - windCover) : 0;
    const sunHeat = wx ? wx.sun * 5 * (1 - prot.sun * 0.7) * (1 - cover) : 0;
    const felt = d.airC - chill - (d.wet / 100) * 4 + sunHeat + EFFORT_HEAT[act] * (act === 'travel' || act === 'walk' ? Math.min(1.5, load) : 1);
    d.feltC = Math.round(felt * 10) / 10;
    const target = felt < c.low ? -Math.min(100, (c.low - felt) * 4) : felt > c.high ? Math.min(100, (felt - c.high) * 4) : 0;
    d.heat += (target - d.heat) * Math.min(1, h * 1.2);

    // ---- Food.
    const cold = d.heat < -15 ? 1 + (-d.heat - 15) / 100 : 1;
    const burn = 0.9 * kg * BURN[act] * (act === 'travel' ? load : 1) * cold * h;
    const digest = Math.min(d.stomachKcal, 500 * h);
    d.stomachKcal -= digest;
    d.reserveKcal = Math.min(2600, d.reserveKcal + digest);
    if (d.reserveKcal >= burn) d.reserveKcal -= burn;
    else {
      const deficit = burn - d.reserveKcal;
      d.reserveKcal = 0;
      d.nourish = Math.max(0, d.nourish - deficit / 120);
    }
    if (d.reserveKcal > 1000 && d.nourish < 100) d.nourish = Math.min(100, d.nourish + 0.5 * h);

    // ---- Water.
    const hot = d.heat > 15 ? 1 + (d.heat - 15) / 40 : 1;
    const loss = 0.08 * SWEAT[act] * hot * h;
    const take = Math.min(d.stomachL, 1.0 * h);
    d.stomachL -= take;
    d.hydrationL = Math.min(2.5, d.hydrationL + take);
    if (d.hydrationL >= loss) d.hydrationL -= loss;
    else {
      const short = loss - d.hydrationL;
      d.hydrationL = 0;
      d.hydrated = Math.max(0, d.hydrated - short * 30);
    }
    if (d.hydrationL > 1.2 && d.hydrated < 100) d.hydrated = Math.min(100, d.hydrated + 4 * h);

    // ---- Sleep.
    if (asleep) {
      const q = ctx.sleepQuality ?? 0.6;
      d.fatigue = Math.max(0, d.fatigue - 12.5 * q * h);
      if (d.fatigue <= 5) d.debt = Math.max(0, d.debt - 0.5 * q * h);
    } else {
      d.fatigue = Math.min(140, d.fatigue + 4.2 * TIRE[act] * h);
      if (d.fatigue >= 100) d.debt = Math.min(48, d.debt + h);
    }

    // ---- Stamina.
    const P = this.actor?.get(Pools)?.d;
    if (P) {
      const day = P.physDay, burst = P.physBurst;
      const heavy = Math.max(0, load - 1);
      // Skill eases the work: a good swimmer tires less in the water, a hardy walker under a load.
      const sk = this.actor?.get(Skills);
      const swimEase = 1.4 - (sk?.effective('swimming') ?? 0) / 100, carryEase = 1.2 - (sk?.effective('athletics') ?? 0) / 200;
      const burstUse = (act === 'swim' ? 40 * swimEase : 0) + (act === 'walk' || act === 'travel' ? heavy * 40 * carryEase : 0);
      const burstBack = act === 'rest' || asleep ? 60 : act === 'walk' || act === 'travel' ? 20 : 0;
      const dayUse = asleep ? -15 * (ctx.sleepQuality ?? 0.6) : { rest: -0.5, sleep: 0, walk: 4, travel: 5 * (1 + heavy * carryEase), swim: 25 * swimEase, work: 8 }[act];
      day.value = clamp(day.value - dayUse * h, 0, day.max);
      // Burst comes back from the day pool (slowly when it is empty).
      burst.value = clamp(burst.value - burstUse * h + (day.value > 0 ? burstBack : 2) * h, 0, burst.max);
      const m = P.mentDay;
      m.value = clamp(m.value + (asleep ? 15 * (ctx.sleepQuality ?? 0.6) : -1.2) * h, 0, m.max);
      P.mentBurst.value = clamp(P.mentBurst.value + 30 * h, 0, P.mentBurst.max);
    }
  }

  // ---- States in words -----------------------------------------------------------------------

  /** The stamina pools, if the person has them. */
  pools() {
    return this.actor?.get(Pools)?.d;
  }

  /** Fatigue with the sleep debt counted in. */
  tiredness(): number {
    return this.d.fatigue + this.d.debt * 4;
  }

  words(): Record<NeedId, string> {
    const d = this.d;
    const cap = this.stomachCap();
    const hunger = d.nourish <= 0 ? 'Starving' : d.nourish < 25 ? 'Starving' : d.nourish < 50 ? 'Malnourished' : d.nourish < 75 ? 'Underfed'
      : d.reserveKcal <= 0 ? 'Ravenous' : d.reserveKcal < 300 ? 'Hungry' : d.stomachKcal > cap.kcal * 0.8 ? 'Full' : '';
    const thirst = d.hydrated < 40 ? 'Badly dehydrated' : d.hydrated < 75 ? 'Dehydrated' : d.hydrationL <= 0 ? 'Parched' : d.hydrationL < 0.5 ? 'Thirsty' : '';
    const t = this.tiredness();
    const sleep = t >= 125 ? 'Collapsing' : t >= 100 ? 'Exhausted' : t >= 85 ? 'Very tired' : t >= 65 ? 'Tired' : '';
    const P = this.actor?.get(Pools)?.d;
    const stamina = !P ? '' : P.physDay.value <= 0 ? 'Spent' : P.physDay.value < P.physDay.max * 0.2 ? 'Weary' : P.physBurst.value < P.physBurst.max * 0.15 ? 'Winded' : '';
    const x = d.heat;
    const heat = x <= -70 ? 'Hypothermic' : x <= -40 ? 'Shivering' : x <= -15 ? 'Chilly' : x >= 70 ? 'Overheating' : x >= 40 ? 'Hot' : x >= 15 ? 'Warm' : '';
    const wv = d.wet ?? 0;
    const wet = wv >= 60 ? 'Soaked' : wv >= 20 ? 'Damp' : '';
    return { hunger, thirst, sleep, stamina, heat, wet };
  }

  /** How much these states slow the person (1 not at all). */
  slow(): number {
    const w = this.words();
    const f: Record<string, number> = {
      Ravenous: 1.05, Underfed: 1.05, Malnourished: 1.15, Starving: 1.3, Parched: 1.1, Dehydrated: 1.15, 'Badly dehydrated': 1.35,
      'Very tired': 1.1, Exhausted: 1.3, Collapsing: 1.5, Weary: 1.1, Spent: 1.5, Shivering: 1.1, Hypothermic: 1.35, Hot: 1.05, Overheating: 1.3,
    };
    return Object.values(w).reduce((s, x) => s * (f[x] ?? 1), 1);
  }

  /** Bars for the screen: 0 (bad) to 1 (good), for each need. */
  bars(): Record<NeedId, number> {
    const d = this.d;
    const P = this.actor?.get(Pools)?.d;
    return {
      hunger: Math.min(1, (d.nourish / 100) * 0.5 + Math.min(1, (d.reserveKcal + d.stomachKcal) / 1600) * 0.5),
      thirst: Math.min(1, (d.hydrated / 100) * 0.5 + Math.min(1, (d.hydrationL + d.stomachL) / 2) * 0.5),
      sleep: clamp(1 - this.tiredness() / 140, 0, 1),
      stamina: P ? clamp((P.physDay.value / P.physDay.max) * 0.7 + (P.physBurst.value / P.physBurst.max) * 0.3, 0, 1) : 1,
      heat: clamp(1 - Math.abs(d.heat) / 100, 0, 1),
      wet: clamp(1 - (d.wet ?? 0) / 100, 0, 1),
    };
  }

  private static readonly ORDER: Record<NeedId, string[]> = {
    hunger: ['', 'Full', 'Hungry', 'Ravenous', 'Underfed', 'Malnourished', 'Starving'],
    thirst: ['', 'Thirsty', 'Parched', 'Dehydrated', 'Badly dehydrated'],
    sleep: ['', 'Tired', 'Very tired', 'Exhausted', 'Collapsing'],
    stamina: ['', 'Winded', 'Weary', 'Spent'],
    heat: ['', 'Warm', 'Chilly', 'Hot', 'Shivering', 'Overheating', 'Hypothermic'],
    wet: ['', 'Damp', 'Soaked'],
  };

  private static readonly TEXT: Record<string, string> = {
    Full: 'You are full.', Hungry: 'You are hungry.', Ravenous: 'You are ravenous; your stomach aches.', Underfed: 'You are growing thin from too little food.',
    Malnourished: 'You are weak from hunger.', Starving: 'You are starving.', Thirsty: 'You are thirsty.', Parched: 'Your mouth is parched.',
    Dehydrated: 'Your head aches with thirst.', 'Badly dehydrated': 'You are dizzy and confused with thirst.', Tired: 'You are tired.', 'Very tired': 'You are very tired.',
    Exhausted: 'You are exhausted; you need sleep.', Collapsing: 'You can barely stay on your feet.', Winded: 'You are out of breath.', Weary: 'Your legs are heavy.',
    Spent: 'You are spent: every step is an effort.', Warm: 'You are warm.', Chilly: 'You feel the chill.', Hot: 'You are hot and sweating.',
    Shivering: 'You are shivering.', Damp: 'You are damp.', Soaked: 'You are soaked through.', Overheating: 'You are overheating; your head pounds.', Hypothermic: 'You are shaking with cold; your fingers have gone numb.',
  };

  /** Compares the states with those last reported; keeps notes, moodlets, and a collapse. */
  private review(): void {
    const w = this.words();
    const mood = this.actor?.get(Mood);
    for (const k of Object.keys(w) as NeedId[]) {
      const now = w[k], before = this.d.said[k] ?? '';
      if (now === before) continue;
      // Waking a little less tired is not yet rested: say so only when it is true.
      if (k === 'sleep' && !now && this.d.fatigue > 20) continue;
      const order = Needs.ORDER[k];
      const worse = order.indexOf(now) > order.indexOf(before) && now !== 'Full' && now !== 'Warm';
      this.d.said[k] = now;
      this.notes.push({ need: k, word: now, worse, text: now ? Needs.TEXT[now] ?? now : k === 'heat' ? 'You are comfortable again.' : k === 'sleep' ? 'You feel rested.' : k === 'stamina' ? 'You have your strength back.' : k === 'hunger' ? 'Your hunger is gone.' : k === 'wet' ? 'You are dry again.' : 'Your thirst is gone.' });
      // Warm and dry after a soaking: a small relief.
      if (k === 'wet' && !now && before && mood && Math.abs(this.d.heat) < 15) mood.add({ id: 'dry-again', text: 'Warm and dry again', value: 1, until: this.now + 4 * 3600 });
      // A moodlet for the state while it lasts.
      if (mood) {
        mood.moodlets = mood.moodlets.filter((x) => x.id !== `need.${k}`);
        const v = MOOD[now];
        if (v) mood.add({ id: `need.${k}`, text: now, value: v });
      }
    }
    const d = this.d;
    if (!this.collapse) {
      if (d.hydrated <= 0) this.collapse = 'thirst';
      else if (d.nourish <= 0) this.collapse = 'hunger';
      else if (this.tiredness() >= 140) this.collapse = 'sleep';
      else if (Math.abs(d.heat) >= 95) this.collapse = 'heat';
    }
  }

  /** Notes since last asked (cleared). */
  takeNotes(): NeedNote[] {
    const n = this.notes;
    this.notes = [];
    return n;
  }

  // ---- Eating, drinking, coming round --------------------------------------------------------

  /** Eats food (kcal); returns how much there was room for. */
  eat(kcal: number, waterL = 0): number {
    const cap = this.stomachCap();
    const room = Math.max(0, cap.kcal - this.d.stomachKcal);
    const took = Math.min(room, kcal);
    this.d.stomachKcal += took;
    this.drink(waterL);
    this.review();
    return took;
  }

  /** Drinks (litres); returns how much there was room for. */
  drink(litres: number): number {
    const cap = this.stomachCap();
    const took = Math.min(Math.max(0, cap.litres - this.d.stomachL), litres);
    this.d.stomachL += took;
    if (took > 0) this.review();
    return took;
  }

  /** Room for food (kcal) and drink (litres) now. */
  room(): { kcal: number; litres: number } {
    const cap = this.stomachCap();
    return { kcal: Math.max(0, cap.kcal - this.d.stomachKcal), litres: Math.max(0, cap.litres - this.d.stomachL) };
  }

  /** Coming round after a collapse: the worst need is set just above the edge. */
  recover(): void {
    const d = this.d;
    if (this.collapse === 'thirst') d.hydrated = Math.max(d.hydrated, 12);
    if (this.collapse === 'hunger') d.nourish = Math.max(d.nourish, 8);
    if (this.collapse === 'heat') d.heat = d.heat * 0.6;
    this.collapse = null;
    this.review();
  }

  toJSON(): NeedsData {
    return JSON.parse(JSON.stringify(this.d));
  }

  static fromJSON(d: NeedsData): Needs {
    return new Needs({ ...Needs.fresh(), ...d, said: d.said ?? {} });
  }
}

/** Moodlets for the states (while they last). */
const MOOD: Record<string, number> = {
  Hungry: -2, Ravenous: -5, Underfed: -4, Malnourished: -8, Starving: -15, Thirsty: -2, Parched: -6, Dehydrated: -8, 'Badly dehydrated': -15,
  Tired: -2, 'Very tired': -4, Exhausted: -8, Collapsing: -12, Spent: -4, Chilly: -2, Shivering: -6, Hypothermic: -15, Hot: -2, Overheating: -10, Full: 1, Damp: -1, Soaked: -3,
};

