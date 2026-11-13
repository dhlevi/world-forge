/** The context camping works in, the helpers every part shares, and the camp in words. */
import type { Actor } from '../../actors/actor';
import { Skills, type Moodlet } from '../../actors/components';
import { Inventory } from '../../actors/items/inventory';
import { type Item } from '../../actors/items/item';
import { BURN_KG_H, SHELTERS, type CampData } from '../camp';
import type { Game } from '../game';
import { TILE_M } from '@worldforge/core/local/chunk';

/** What camping needs of the game around it. */
export interface CampCtx {
  game: Game;
  actor: Actor;
  say(t: string): void;
  mood(m: Moodlet, hours: number): void;
  season(): string;
  /** Sleeps (game hours), with something to run after each hour; returns hours slept. */
  sleep(hours: number, quality: number, onHour: (h: number) => void): number;
}

export interface Result {
  ok: boolean;
  text: string;
}

export const inv = (c: CampCtx) => c.actor.need(Inventory);
export const has = (c: CampCtx, id: string) => inv(c).d.items.find((i) => i.def === id);
export const pass = (c: CampCtx, s: number) => {
  c.game.time += Math.round(s);
  c.game.activity = 'work';
  c.game.updateHud();
};
export const notes = (c: CampCtx) => {
  for (const n of c.actor.get(Skills)?.takeNotes() ?? []) c.say(n.text);
};
export const done = (c: CampCtx, ok: boolean, text: string): Result => {
  c.say(text);
  notes(c);
  return { ok, text };
};

/** Gives a thing to the wanderer (where it best fits), or lays it at the camp's bed if there is no room. */
export function give(c: CampCtx, camp: CampData, it: Item): void {
  if (inv(c).stow(it)) c.game.ground.put(camp.bedAt[0], camp.bedAt[1], [it]);
}

/** The camp in words, for the camp screen. */
export function campWords(camp: CampData): string[] {
  const out: string[] = [];
  const h = Math.max(1, Math.round(camp.fire.fuelH));
  out.push(camp.fire.lit ? `The fire is burning (${h === 1 ? 'about an hour' : `about ${h} hours`} left in it).` : 'The fire is out.');
  const w = Math.round(camp.wood / BURN_KG_H);
  out.push(camp.wood >= 0.5 ? `Wood stacked: ${w <= 1 ? 'about an hour' : `about ${w} hours`} of fire.` : 'No wood stacked.');
  out.push(camp.shelter ? `Shelter: ${SHELTERS[camp.shelter.kind].name}.` : 'No shelter.');
  if (camp.snares.length) out.push(`${camp.snares.length} ${camp.snares.length === 1 ? 'snare' : 'snares'} set about the camp.`);
  return out;
}

/** Metres from the wanderer to a camp. */
export const campDistance = (g: Game, camp: CampData) => Math.round(Math.hypot(camp.x - g.px, camp.y - g.py) * TILE_M);
