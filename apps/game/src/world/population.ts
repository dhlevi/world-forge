/**
 * The people in the bubble about the wanderer (docs/design/npcs.md, How much is simulated; Stage 1
 * step 2): the residents the worker places by their day plan (worker/people.ts), each made an Actor
 * (who they are, their looks, their belongings) when first placed, and kept while they stay near.
 *
 * They stand still for now. The bubble is asked for again when the wanderer has gone a quarter of
 * its reach, and every quarter of an hour of game time. Changes are never seen to happen: a person
 * in sight who should be elsewhere (or gone) stays until out of sight, and one who should appear
 * where the wanderer can see waits until that tile is out of sight.
 */
import { CULTURES } from '@worldforge/core/names/cultures';
import { WEAR_SHAPE, type FigureSpec } from '@worldforge/core/local/figures';
import type { Facing } from '@worldforge/core/local/tiles';
import { Actor } from '../actors/actor';
import { Body, Identity, type StandingId } from '../actors/components';
import { figureOf } from '../game/figure';
import type { PlacedPerson } from '../worker/protocol';
import { belongingsOf } from './belongings';

/** How often (game seconds) the day plans are looked at again. */
const EVERY_S = 15 * 60;

/** A resident in the bubble: as last placed, and (in sight) where they are still shown. */
export interface Resident {
  p: PlacedPerson;
  actor: Actor;
  x: number;
  y: number;
  z: number | null;
  where: PlacedPerson['where'];
  facing: Facing;
  /** Their figure for where they are (dressed for bed, the cloak left off indoors). */
  figure: FigureSpec;
  /** A new place to go to, or leaving the bubble, once out of sight. */
  next?: PlacedPerson | null;
}

/** What the population needs of the game. */
export interface PopulationView {
  px: number;
  py: number;
  z: number | null;
  time: number;
  isVisible(x: number, y: number): boolean;
}

/** Standing by means, for a resident's Identity. */
const STANDING: Record<PlacedPerson['means'], StandingId> = { destitute: 'peasant', poor: 'peasant', middling: 'townsfolk', comfortable: 'craftsman', rich: 'merchant' };

const tileKey = (x: number, y: number, z: number | null) => `${x},${y},${z ?? 'g'}`;

export class Population {
  private byId = new Map<string, Resident>();
  private byTile = new Map<string, Resident>();
  /** Those placed where the wanderer can see, waiting to appear. */
  private arriving = new Map<string, PlacedPerson>();
  /** The last asking: where and when, and the reach of the bubble given. */
  private asked: { x: number; y: number; slot: number; radius: number } | null = null;
  private busy = false;
  /** Called when the people shown may have changed. */
  onChange: () => void = () => {};

  constructor(
    private ask: (x: number, y: number, time: number) => Promise<{ people: PlacedPerson[]; radius: number }>,
    private seed: string,
  ) {}

  /** The resident on a tile and floor, if any. */
  at(x: number, y: number, z: number | null): Resident | null {
    return this.byTile.get(tileKey(x, y, z)) ?? null;
  }

  /** Everyone in the bubble, as shown. */
  all(): Iterable<Resident> {
    return this.byId.values();
  }

  get size(): number {
    return this.byId.size;
  }

  /** Forgets everyone (the wanderer has left the local map, or jumped far). */
  clear(): void {
    this.byId.clear();
    this.byTile.clear();
    this.arriving.clear();
    this.asked = null;
  }

  /**
   * After each action: those waiting out of sight are moved, and the worker is asked again when the
   * wanderer has gone far enough, or the clock has turned a quarter of an hour.
   */
  update(g: PopulationView): void {
    if (this.settle(g)) this.onChange();
    const slot = Math.floor(g.time / EVERY_S), a = this.asked;
    if (this.busy) return;
    if (a && a.slot === slot && Math.max(Math.abs(g.px - a.x), Math.abs(g.py - a.y)) < Math.max(8, a.radius / 4)) return;
    this.busy = true;
    const at = { x: g.px, y: g.py, slot };
    this.ask(g.px, g.py, slot * EVERY_S)
      .then((res) => {
        this.asked = { ...at, radius: res.radius };
        this.take(res.people, g);
        this.onChange();
      })
      .catch((err: unknown) => console.warn('people', err))
      .finally(() => {
        this.busy = false;
      });
  }

  /** Takes the worker's placing: new people placed, the moved and the gone put right out of sight. */
  private take(list: PlacedPerson[], g: PopulationView): void {
    const seen = new Set<string>();
    for (const p of list) {
      seen.add(p.id);
      const r = this.byId.get(p.id);
      if (r) {
        if (r.x !== p.x || r.y !== p.y || r.z !== p.z || r.where !== p.where) r.next = p;
        else {
          r.p = p;
          r.next = undefined;
        }
      } else this.arriving.set(p.id, p);
    }
    for (const [id, r] of this.byId) if (!seen.has(id)) r.next = null;
    for (const id of [...this.arriving.keys()]) if (!seen.has(id)) this.arriving.delete(id);
    this.settle(g);
  }

  /** Puts right those out of sight: moves, comings and goings. Returns whether anything changed. */
  private settle(g: PopulationView): boolean {
    const inSight = (x: number, y: number, z: number | null) => z === g.z && g.isVisible(x, y);
    const free = (x: number, y: number, z: number | null) => !this.byTile.has(tileKey(x, y, z)) && !(x === g.px && y === g.py && z === g.z);
    let changed = false;
    for (const r of [...this.byId.values()]) {
      if (r.next === undefined || inSight(r.x, r.y, r.z)) continue;
      const n = r.next;
      if (n === null) {
        this.byId.delete(r.p.id);
        this.byTile.delete(tileKey(r.x, r.y, r.z));
        changed = true;
        continue;
      }
      if (inSight(n.x, n.y, n.z) || !free(n.x, n.y, n.z)) continue;
      this.byTile.delete(tileKey(r.x, r.y, r.z));
      this.put(r, n);
      changed = true;
    }
    for (const [id, p] of this.arriving) {
      if (inSight(p.x, p.y, p.z) || !free(p.x, p.y, p.z)) continue;
      this.arriving.delete(id);
      const actor = this.actorOf(p);
      const r: Resident = { p, actor, x: p.x, y: p.y, z: p.z, where: p.where, facing: p.facing, figure: figureOf(actor) };
      this.byId.set(id, r);
      this.put(r, p);
      changed = true;
    }
    return changed;
  }

  private put(r: Resident, p: PlacedPerson): void {
    r.p = p;
    r.next = undefined;
    r.x = p.x;
    r.y = p.y;
    r.z = p.z;
    r.where = p.where;
    r.facing = p.facing;
    r.figure = dressFor(figureOf(r.actor), p.where);
    this.byTile.set(tileKey(p.x, p.y, p.z), r);
  }

  /** A resident as an Actor: who they are, their body and looks, their belongings. */
  private actorOf(p: PlacedPerson): Actor {
    const a = new Actor('person');
    const c = CULTURES[p.culture];
    const space = p.name.indexOf(' ');
    a.add(new Identity({
      given: p.given, family: space > 0 ? p.name.slice(space + 1) : undefined, full: p.name, female: p.female, age: p.age, year: 0,
      folk: '', culture: p.culture, cultureName: c?.name ?? '', people: p.people, homeId: p.homeId, homeName: p.homeName ?? p.household, standing: STANDING[p.means],
    }));
    a.add(new Body({
      heightCm: 0, weightKg: 0, build: '', skin: '', skinHex: p.look.skin, hair: '', hairHex: p.look.hair, hairStyle: p.look.hairStyle, beard: p.look.beard,
      kind: p.look.kind, wounds: [],
    }));
    a.add(belongingsOf(p, this.seed));
    return a;
  }
}

/** A figure dressed for where its person is: for bed (no more than the body garment), or indoors (no cloak). */
export function dressFor(f: FigureSpec, where: PlacedPerson['where']): FigureSpec {
  if (where === 'out') return f;
  const keep = where === 'asleep' ? new Set(['legs', 'body']) : null;
  return { ...f, wear: f.wear.filter((w) => {
    const slot = WEAR_SHAPE.get(w.shape)?.slot;
    return keep ? !!slot && keep.has(slot) : slot !== 'cloak';
  }) };
}
