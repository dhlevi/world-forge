/** What actors are told as game time passes, and the messages about them (engine/messages.ts). */
import type { Moodlet } from './mood';

declare module '../../engine/messages' {
  interface MessageTypes {
    /** Game time has passed (broadcast to every actor by the cast), and what the player was doing. */
    'time.passed': { now: number; dt: number; ctx?: TimeCtx };
    /** A moodlet for one actor (sent to it). */
    'actor.moodlet': Moodlet;
  }
}

/** What a person was doing while time passed (for needs and fatigue, actors/needs.ts). */
export type Activity = 'rest' | 'walk' | 'swim' | 'travel' | 'sleep' | 'work';

export interface TimeCtx {
  activity?: Activity;
  /** The air about them (°C). */
  ambientC?: number;
  /** How much the load slows them (1 unladen). */
  loadSlow?: number;
  /** How well they sleep (1 a bed, less rough). */
  sleepQuality?: number;
  /** The weather out of doors (game/weather.ts): rain or snow (mm an hour), wind (m/s), and direct sun (0 to 1). */
  weather?: { rainMm: number; snow: boolean; windMs: number; sun: number };
  /** How much a roof or shelter keeps the weather off (0 none, 1 indoors or in a tent). */
  cover?: number;
  /** How much shelter there is from the wind (0 none, 1 indoors). */
  windCover?: number;
  /** Beside a fire (drying out). */
  fire?: boolean;
}
