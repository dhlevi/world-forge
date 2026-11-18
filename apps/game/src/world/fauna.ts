/**
 * The animals of the bubble (docs/design/npcs.md, Animals; Stage 2): the groups the worker finds
 * (worker/fauna.ts), each animal an agent with a species (core local/fauna.ts) and a simple mind,
 * acting after each of the wanderer's actions as the people do (world/population.ts).
 *
 * - **Days.** Awake by their species' hours (asleep, lying still, the rest; bears through the
 *   winter), they graze, browse and wander their home range, the leader choosing where and the rest
 *   following; at dawn and dusk they go down to water where there is any.
 * - **Herds and flocks** keep together by simple rules on the tiles: keep near the leader, not on
 *   top of one another, the same way.
 * - **Fear.** They notice the wanderer by sight (less when sneaking, and in the dark), by noise
 *   (the wanderer's steps and doors, heard by their hearing) and by scent carried on the wind; a
 *   timid or skittish beast flees beyond its flight distance, a herd together, a startled flock
 *   rising all at once; the tame let people near.
 * - **Predators** hunt when hungry: they stalk their prey, chase it when close, give up when it
 *   outruns them, and eat what they catch. Toward the wanderer they are threats only (until combat):
 *   wary ones keep away; bold ones, and hungry packs in winter, shadow, growl and bluff-charge, then
 *   back off.
 * - **Birds** are on the ground, perched in trees, or flying a few levels up; startled, they rise and
 *   fly off, and land again farther on.
 *
 * Only those within ACTIVE tiles of the wanderer move tile by tile; the rest keep still out of sight.
 */
import { GROUND_TILES, OBJECT_TILES, type Facing } from '@worldforge/core/local/tiles';
import { SIZE_RANK, SPECIES_BY_ID, awake, type Species } from '@worldforge/core/local/fauna';
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import type { AnimalGroup, Spot } from '../worker/protocol';
import { heardLevel, takesTracks, type Noise, type Tracks } from './senses';

/** Within this many tiles of the wanderer, animals act. */
export const ANIMAL_ACTIVE = 40;
/** At most this many steps an animal takes per action (a long wait is acted in part). */
const MAX_STEPS = 60;
/** How long a fright lasts (seconds), and how far a flight takes them (tiles). */
const FRIGHT_S = 45, FLIGHT = 14;
/** Hours a predator goes between meals before it hunts again; steps it chases before giving up. */
const MEAL_H = 8, CHASE = 25;

/** What the animals need of the game. */
export interface FaunaView {
  px: number;
  py: number;
  z: number | null;
  time: number;
  isVisible(x: number, y: number): boolean;
  map: {
    loaded(x: number, y: number): boolean;
    passableAt(x: number, y: number, z: number | null): boolean;
    groundAt(x: number, y: number, z: number | null): number;
    objectAt(x: number, y: number, z: number | null): number;
    transparentAt(x: number, y: number, z: number | null): boolean;
    level(x: number, y: number): number;
  };
}

/** The wanderer as the animals sense them: sneaking (and how well), the light, the wind (whither it blows). */
export interface Presence {
  sneaking: boolean;
  /** Sneak skill (0 to 100). */
  sneak: number;
  /** Daylight, 0 (night) to 1. */
  light: number;
  /** The way the wind blows (a unit vector, x east, y south), and its strength (0 calm). */
  wind: { x: number; y: number; strength: number };
  /** The season is winter (hungry predators are bolder). */
  winter: boolean;
  rise: number;
  set: number;
}

type State = 'idle' | 'walk' | 'sleep' | 'flee' | 'stalk' | 'chase' | 'threaten' | 'eat' | 'drink';

export interface Animal {
  id: string;
  s: Species;
  g: Herd;
  x: number;
  y: number;
  /** Levels above the ground: flying, or perched in a tree (birds only). */
  alt: number;
  perched: boolean;
  facing: Facing;
  state: State;
  /** Where it is going. */
  to: Spot | null;
  nextAt: number;
  /** For a predator: when it last ate; whom it hunts, and how many steps of the chase are left. */
  ate: number;
  quarry: Animal | null;
  chase: number;
  /** When it last called, last threatened the wanderer. */
  calledAt: number;
  threatAt: number;
  /** Noticed the wanderer (game seconds), for "watching you". */
  noticed: number;
}

export interface Herd {
  id: string;
  s: Species;
  home: { x: number; y: number; r: number };
  water: Spot | null;
  members: Animal[];
  /** Frightened until, and of what (a tile to flee from). */
  fearUntil: number;
  fearFrom: Spot | null;
  /** When the leader next chooses where to go. */
  planAt: number;
  /** Gone from the bubble for good (dropped once out of sight). */
  gone: boolean;
}

const key = (x: number, y: number) => (x + 1048576) * 2097152 + (y + 1048576);
const DIRS8: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
const cheb = (a: { x: number; y: number }, x: number, y: number) => Math.max(Math.abs(a.x - x), Math.abs(a.y - y));
const facingOf = (dx: number, dy: number): Facing => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy < 0 ? 'n' : 's');

export class Fauna {
  private herds = new Map<string, Herd>();
  private byTile = new Map<number, Animal>();
  private asked: { x: number; y: number; week: number; radius: number } | null = null;
  private busy = false;
  /** Animals killed or taken this game (by group and member), so that they do not come back that week. */
  readonly gone = new Set<string>();
  /** Noises made (calls, growls), for the session to listen to (world/senses.ts). */
  noises: Noise[] = [];
  /** What is seen to happen (a fox catching a hen, a herd taking flight). */
  onSee: (text: string) => void = () => {};
  /** Whether a person stands on a tile (the animals keep off them). */
  personAt: (x: number, y: number) => boolean = () => false;
  /** Called when the animals shown may have changed. */
  onChange: () => void = () => {};
  /** Whether a herd has been told of as fleeing lately (by herd id). */
  private told = new Map<string, number>();

  constructor(
    private ask: (x: number, y: number, time: number, winter: boolean) => Promise<{ groups: AnimalGroup[]; radius: number }>,
    readonly tracks: Tracks,
  ) {}

  /** The animal on a tile (on the ground or a bird above it), if any. */
  at(x: number, y: number): Animal | null {
    return this.byTile.get(key(x, y)) ?? null;
  }

  /** Every animal. */
  *all(): Iterable<Animal> {
    for (const h of this.herds.values()) yield* h.members;
  }

  get size(): number {
    return this.byTile.size;
  }

  clear(): void {
    this.herds.clear();
    this.byTile.clear();
    this.asked = null;
  }

  /** After each action: everyone acts; the worker is asked again on moving far, or a new week. */
  update(g: FaunaView, who: Presence): void {
    if (g.z !== null) return;
    if (this.run(g, who)) this.onChange();
    const week = Math.floor(g.time / (7 * 86400)), a = this.asked;
    if (this.busy) return;
    if (a && a.week === week && Math.max(Math.abs(g.px - a.x), Math.abs(g.py - a.y)) < Math.max(8, a.radius / 4)) return;
    this.busy = true;
    const at = { x: g.px, y: g.py, week };
    this.ask(g.px, g.py, g.time, who.winter)
      .then((res) => {
        this.asked = { ...at, radius: res.radius };
        this.take(res.groups, g);
        this.onChange();
      })
      .catch((err: unknown) => console.warn('animals', err))
      .finally(() => {
        this.busy = false;
      });
  }

  /** Takes the worker's groups: new ones placed (members out of sight only), the rest dropped out of sight. */
  take(groups: AnimalGroup[], g: FaunaView): void {
    const seen = new Set<string>();
    for (const gr of groups) {
      seen.add(gr.id);
      const known = this.herds.get(gr.id);
      if (known) {
        known.gone = false;
        continue;
      }
      const s = SPECIES_BY_ID.get(gr.species);
      if (!s) continue;
      const h: Herd = { id: gr.id, s, home: gr.home, water: gr.water, members: [], fearUntil: 0, fearFrom: null, planAt: g.time, gone: false };
      gr.members.forEach((m, i) => {
        const id = `${gr.id}#${i}`;
        if (this.gone.has(id) || g.isVisible(m.x, m.y) || this.byTile.has(key(m.x, m.y))) return;
        const a: Animal = { id, s, g: h, x: m.x, y: m.y, alt: 0, perched: false, facing: (['n', 'e', 's', 'w'] as Facing[])[(hashString(id) >>> 3) % 4], state: 'idle', to: null, nextAt: g.time, ate: g.time - (hashString(id) % (MEAL_H * 3600)), quarry: null, chase: 0, calledAt: g.time - 600, threatAt: 0, noticed: -1 };
        h.members.push(a);
        this.byTile.set(key(m.x, m.y), a);
      });
      if (h.members.length) this.herds.set(gr.id, h);
    }
    for (const [id, h] of this.herds) if (!seen.has(id)) {
      h.gone = true;
      this.dropUnseen(h, g);
    }
  }

  private dropUnseen(h: Herd, g: FaunaView): void {
    for (const a of [...h.members]) if (!g.isVisible(a.x, a.y)) this.remove(a);
    if (!h.members.length) this.herds.delete(h.id);
  }

  /** Takes an animal from the map for good (caught, killed). */
  remove(a: Animal): void {
    if (this.byTile.get(key(a.x, a.y)) === a) this.byTile.delete(key(a.x, a.y));
    a.g.members = a.g.members.filter((m) => m !== a);
    this.gone.add(a.id);
    if (!a.g.members.length) this.herds.delete(a.g.id);
  }

  private free(x: number, y: number, g: FaunaView, me: Animal): boolean {
    const o = this.byTile.get(key(x, y));
    return (!o || o === me) && !(x === g.px && y === g.py) && !this.personAt(x, y);
  }

  /** Whether an animal can stand on (or, flying, pass over) a tile. */
  private canStand(a: Animal, x: number, y: number, g: FaunaView): boolean {
    if (!g.map.loaded(x, y)) return false;
    if (a.alt > 0 && !a.perched) return true;
    const gd = GROUND_TILES[g.map.groundAt(x, y, null)];
    if (!gd) return false;
    if (gd.water) return !!a.s.swims || (gd.water === 'shallow' && SIZE_RANK[a.s.size] >= 2);
    if (gd.name.startsWith('floor_') && a.s.home === 'wild') return false;
    return g.map.passableAt(x, y, null);
  }

  private move(a: Animal, x: number, y: number): void {
    if (this.byTile.get(key(a.x, a.y)) === a) this.byTile.delete(key(a.x, a.y));
    a.facing = facingOf(x - a.x, y - a.y);
    a.x = x;
    a.y = y;
    this.byTile.set(key(x, y), a);
  }

  /** A step toward (or, `away`, from) a tile: the free neighbour that best closes (or opens) the distance. */
  private step(a: Animal, to: Spot, g: FaunaView, away = false): boolean {
    let best: [number, number] | null = null, bd = away ? -Infinity : Infinity;
    const jitter = (hashString(`${a.id}${Math.floor(g.time)}`) % 7) / 50;
    for (const [dx, dy] of DIRS8) {
      const x = a.x + dx, y = a.y + dy;
      if (!this.free(x, y, g, a) || !this.canStand(a, x, y, g)) continue;
      const d = Math.hypot(to.x - x, to.y - y) + (dx && dy ? 0.05 : 0) + jitter * ((dx + 2 * dy + 7) % 3);
      if (away ? d > bd : d < bd) {
        bd = d;
        best = [x, y];
      }
    }
    if (!best) return false;
    // Toward: only if it gets nearer.
    if (!away && bd >= Math.hypot(to.x - a.x, to.y - a.y)) return false;
    this.move(a, best[0], best[1]);
    return true;
  }

  /**
   * Whether an animal notices the wanderer now: by sight (within its sight, as far as the light and
   * the wanderer's sneaking let it see, where the wanderer could see it), or by scent (downwind of
   * them, within its smell).
   */
  private senses(a: Animal, g: FaunaView, who: Presence): boolean {
    const d = Math.hypot(a.x - g.px, a.y - g.py);
    if (d > Math.max(a.s.sight, a.s.smell * 1.5) + 2) return false;
    const hide = who.sneaking ? Math.max(0.25, 0.55 - who.sneak / 250) : 1;
    const see = a.s.sight * hide * (0.35 + 0.65 * who.light);
    if (d <= see && g.isVisible(a.x, a.y)) return true;
    // Scent: the wind carries it from the wanderer to the animal.
    if (who.wind.strength > 0.5 && d > 0) {
      const ux = (a.x - g.px) / d, uy = (a.y - g.py) / d;
      if (ux * who.wind.x + uy * who.wind.y > 0.6 && d <= a.s.smell * Math.min(1.5, 0.5 + who.wind.strength / 6)) return true;
    }
    return d <= 1.5;
  }

  /** A noise the wanderer makes: those who hear it start (the skittish flee from it). */
  hearPlayer(g: FaunaView, n: Omit<Noise, 'by'>, who: Presence): void {
    for (const a of this.all()) {
      if (cheb(a, n.x, n.y) > 30 || a.state === 'sleep' && a.s.temper !== 'skittish') continue;
      const level = heardLevel(g.map, { ...n, by: 'player' }, { x: a.x, y: a.y, z: null });
      if (level < 40 - a.s.hearing) continue;
      a.noticed = g.time;
      if (a.s.temper === 'skittish' || (a.s.temper === 'timid' && level > 50 - a.s.hearing)) this.frighten(a.g, { x: n.x, y: n.y, z: null }, g);
      else if (a.state !== 'flee') a.facing = facingOf(n.x - a.x, n.y - a.y);
    }
    void who;
  }

  /** A herd takes fright from something: they flee together (a flock rises all at once). */
  private frighten(h: Herd, from: Spot, g: FaunaView): void {
    const was = h.fearUntil > g.time;
    h.fearUntil = g.time + FRIGHT_S;
    h.fearFrom = from;
    for (const m of h.members) {
      m.state = 'flee';
      if (m.s.fly && m.alt === 0) m.alt = 2;
      if (m.s.fly && m.perched) m.perched = false;
      m.nextAt = Math.max(m.nextAt, g.time - 1);
    }
    if (!was && h.members.some((m) => g.isVisible(m.x, m.y))) {
      const last = this.told.get(h.id) ?? -1e9;
      if (g.time - last > 300) {
        this.told.set(h.id, g.time);
        const n = h.members.length, s = h.s;
        this.onSee(s.fly ? `${n > 1 ? `The ${s.plural} take` : `The ${s.name} takes`} flight.` : `${n > 1 ? `The ${s.plural} bolt` : `The ${s.name} bolts`}.`);
      }
    }
  }

  private noise(a: Animal, kind: Noise['kind'], loud: number, what: string): void {
    this.noises.push({ x: a.x, y: a.y, z: null, loud, kind, by: `animal:${a.id}`, what });
    if (this.noises.length > 200) this.noises.splice(0, this.noises.length - 200);
  }

  /** Everyone acts up to the game's time. Returns whether anything shown changed. */
  run(g: FaunaView, who: Presence): boolean {
    let changed = false;
    const hour = (g.time % 86400) / 3600;
    for (const h of [...this.herds.values()]) {
      if (h.gone) {
        this.dropUnseen(h, g);
        continue;
      }
      const lead = h.members[0];
      if (!lead || cheb(lead, g.px, g.py) > ANIMAL_ACTIVE + 10) continue;
      const up = awake(h.s, hour, who.rise, who.set) && !(h.s.winters && who.winter);
      // The herd's plan: where the leader goes next (water at dawn and dusk, else about the range).
      if (g.time >= h.planAt && h.fearUntil <= g.time) {
        const r = mulberry32(hashString(`${h.id}#plan#${Math.floor(g.time / 60)}`));
        const drink = h.water && (Math.abs(hour - who.rise) < 1 || Math.abs(hour - who.set) < 1) && !h.s.fly;
        if (!up) {
          for (const m of h.members) if (m.state !== 'sleep') {
            m.state = 'sleep';
            m.to = null;
            if (m.s.fly && m.alt > 0 && !m.perched) m.alt = 0;
            changed = true;
          }
          h.planAt = g.time + 600;
        } else {
          const to = drink ? h.water! : { x: Math.round(h.home.x + (r() - 0.5) * 2 * h.home.r), y: Math.round(h.home.y + (r() - 0.5) * 2 * h.home.r), z: null };
          lead.to = to;
          lead.state = drink ? 'drink' : r() < 0.35 ? 'idle' : 'walk';
          if (lead.state === 'idle') lead.to = null;
          h.planAt = g.time + 60 + r() * 240;
          for (const m of h.members) if (m.state === 'sleep') m.state = 'idle';
        }
      }
      for (const a of [...h.members]) if (this.act(a, g, who, up)) changed = true;
    }
    return changed;
  }

  private act(a: Animal, g: FaunaView, who: Presence, up: boolean): boolean {
    const h = a.g;
    let moved = false;
    if (a.nextAt < g.time - 120) a.nextAt = g.time - 120;
    // Noticing the wanderer: fear, a threat, or (the tame) nothing much.
    if (up && a.state !== 'flee' && this.senses(a, g, who)) {
      a.noticed = g.time;
      const d = cheb(a, g.px, g.py);
      const bold = a.s.temper === 'aggressive' || (a.s.diet === 'predator' && who.winter && h.members.length >= 3 && g.time - a.ate > MEAL_H * 3600);
      if (bold && SIZE_RANK[a.s.size] >= 1 && !a.s.fly) {
        if (d <= 6 && g.time - a.threatAt > 30) this.threaten(a, g);
      } else if (a.s.temper !== 'tame' || d <= 1) {
        if (d <= a.s.flee * (who.sneaking ? 0.6 : 1)) this.frighten(h, { x: g.px, y: g.py, z: null }, g);
      }
    }
    for (let n = 0; n < MAX_STEPS && a.nextAt <= g.time; n++) {
      const pace = a.s.step;
      // Fleeing: away from the fright, fast; a bird flies off and lands farther on.
      if (h.fearUntil > g.time && h.fearFrom) {
        const from = h.fearFrom;
        if (Math.hypot(a.x - from.x, a.y - from.y) > Math.max(FLIGHT, a.s.flee + 8) + (a.s.fly ? 6 : 0)) {
          a.state = 'idle';
          a.nextAt += pace * 4;
          if (a.s.fly && a.alt > 0) this.land(a, g);
          continue;
        }
        a.state = 'flee';
        const ok = this.step(a, from, g, true);
        a.nextAt += a.s.fly ? 0.3 : pace / 2;
        if (ok) {
          moved = true;
          this.tracked(a, g);
        }
        continue;
      }
      if (a.state === 'flee') {
        a.state = 'idle';
        if (a.s.fly && a.alt > 0) this.land(a, g);
      }
      if (!up || a.state === 'sleep') {
        a.nextAt += 120;
        break;
      }
      // A predator hungry enough hunts.
      if (a.s.prey && g.time - a.ate > MEAL_H * 3600) {
        if (this.hunt(a, g)) {
          moved = true;
          continue;
        }
      }
      if (a.state === 'eat') {
        if (g.time - a.ate > 3600) a.state = 'idle';
        a.nextAt += 60;
        continue;
      }
      // Calls, now and then.
      if (a.s.call && g.time - a.calledAt > 600 + (hashString(a.id) % 900)) {
        a.calledAt = g.time;
        this.noise(a, 'work', 55, a.s.call);
      }
      // The leader goes where the herd's plan says; the others keep with it.
      const lead = h.members[0];
      let to: Spot | null = a === lead ? a.to : null;
      if (a !== lead && lead) {
        const d = cheb(a, lead.x, lead.y), keep = a.s.herd ? 2 + Math.min(3, Math.floor(h.members.length / 4)) : 6;
        if (d > keep) to = { x: lead.x + ((hashString(a.id) % 5) - 2), y: lead.y + ((hashString(a.id + 'y') % 5) - 2), z: null };
      }
      if (!to) {
        a.nextAt += pace * (4 + (hashString(`${a.id}${Math.floor(g.time / 30)}`) % 8));
        if (a.state !== 'drink') a.state = 'idle';
        break;
      }
      if (cheb(a, to.x, to.y) <= (a === lead ? 0 : 1)) {
        if (a === lead) a.to = null;
        a.nextAt += pace * 3;
        continue;
      }
      // Birds fly any distance over a few tiles; the rest walk.
      if (a.s.fly && cheb(a, to.x, to.y) > 6 && a.alt === 0) a.alt = 2;
      const ok = this.step(a, to, g);
      a.state = a === lead && a.state === 'drink' ? 'drink' : 'walk';
      a.nextAt += a.alt > 0 && !a.perched ? 0.35 : pace;
      if (ok) {
        moved = true;
        this.tracked(a, g);
      } else {
        if (a === lead) a.to = null;
        a.nextAt += pace * 2;
      }
      if (a.s.fly && a.alt > 0 && cheb(a, to.x, to.y) <= 1) this.land(a, g);
    }
    return moved;
  }

  /** A bird comes down: perched in a tree if there is one and it perches, else on the ground. */
  private land(a: Animal, g: FaunaView): void {
    const o = OBJECT_TILES[g.map.objectAt(a.x, a.y, null)];
    if (a.s.perch && o && (o.name.startsWith('tree') || o.name === 'tree_trunk')) {
      a.alt = 2;
      a.perched = true;
    } else if (this.canStand({ ...a, alt: 0, perched: false }, a.x, a.y, g)) {
      a.alt = 0;
      a.perched = false;
    }
  }

  /** Footprints in soft ground, for those near the wanderer. */
  private tracked(a: Animal, g: FaunaView): void {
    if (a.alt > 0 || cheb(a, g.px, g.py) > ANIMAL_ACTIVE) return;
    const gid = g.map.groundAt(a.x, a.y, null);
    if (takesTracks(gid, true) && SIZE_RANK[a.s.size] >= 1) this.tracks.add(a.x, a.y, null, { t: g.time, by: `animal:${a.g.id}`, kind: `animal:${a.s.id}`, dir: a.facing });
  }

  /** A bold beast threatens the wanderer: a growl, a short charge, then it backs off. */
  private threaten(a: Animal, g: FaunaView): void {
    a.threatAt = g.time;
    a.state = 'threaten';
    for (let i = 0; i < 2; i++) this.step(a, { x: g.px, y: g.py, z: null }, g);
    this.noise(a, 'shout', 65, `${a.s.call ?? `a ${a.s.name}`}, close and angry`);
    if (g.isVisible(a.x, a.y)) {
      const words: Record<string, string> = {
        predator: `The ${a.s.name} bares its teeth and lunges at you, then springs back.`,
        omnivore: `The ${a.s.name} snorts and charges, then wheels away.`, grazer: `The ${a.s.name} lowers its head and stamps at you.`,
      };
      this.onSee(a.s.plan === 'serpent' ? `The ${a.s.name} rears and hisses at you.` : a.s.plan === 'bird' ? `The ${a.s.name} hisses and flaps at you.` : words[a.s.diet] ?? `The ${a.s.name} threatens you.`);
    }
    // Back off a little after the bluff.
    for (let i = 0; i < 3; i++) this.step(a, { x: g.px, y: g.py, z: null }, g, true);
    a.nextAt = g.time + 10;
  }

  /**
   * A predator hunts: it picks the nearest prey it can see (of the sizes it takes), stalks it, chases
   * it when close, catches it when beside it, and gives up when it has run its chase out. Returns
   * whether it moved.
   */
  private hunt(a: Animal, g: FaunaView): boolean {
    let q = a.quarry;
    if (!q || !q.g.members.includes(q)) {
      q = null;
      let bd = Infinity;
      for (const h of this.herds.values()) {
        if (h === a.g || !a.s.prey!.includes(h.s.size) || h.s.diet === 'predator' && h.s.size !== 'tiny') continue;
        for (const m of h.members) {
          const d = Math.hypot(m.x - a.x, m.y - a.y);
          if (d < bd && d <= a.s.sight && m.alt === 0) {
            bd = d;
            q = m;
          }
        }
      }
      a.quarry = q;
      a.chase = CHASE;
      if (!q) return false;
    }
    const d = cheb(a, q.x, q.y);
    if (d <= 1) {
      // Caught.
      this.remove(q);
      a.quarry = null;
      a.ate = g.time;
      a.state = 'eat';
      a.nextAt += 60;
      if (g.isVisible(a.x, a.y)) this.onSee(`The ${a.s.name} catches ${q.s.size === 'tiny' ? 'a' : 'a'} ${q.s.name}.`);
      return true;
    }
    // The prey sees it coming when it is near.
    if (d <= Math.min(q.s.flee, q.s.sight) * 0.7 && q.g.fearUntil <= g.time) this.frighten(q.g, { x: a.x, y: a.y, z: null }, g);
    a.state = d <= 5 ? 'chase' : 'stalk';
    const ok = this.step(a, { x: q.x, y: q.y, z: null }, g);
    a.nextAt += a.state === 'chase' ? a.s.step / 2 : a.s.step * 1.5;
    if (a.state === 'chase' && --a.chase <= 0) {
      a.quarry = null;
      a.ate = g.time - (MEAL_H - 2) * 3600;
      a.state = 'idle';
    }
    if (ok) this.tracked(a, g);
    return ok;
  }

  /** The wanderer walks into an animal: the tame shy away, the rest flee (or threaten). Returns what happens. */
  bumped(g: FaunaView, a: Animal): string {
    if (a.s.temper === 'aggressive') {
      this.threaten(a, g);
      return `The ${a.s.name} will not give way.`;
    }
    this.frighten(a.g, { x: g.px, y: g.py, z: null }, g);
    for (let i = 0; i < 2; i++) this.step(a, { x: g.px, y: g.py, z: null }, g, true);
    return a.state === 'sleep' ? `The ${a.s.name} wakes with a start and runs.` : a.s.temper === 'tame' ? `The ${a.s.name} shies away.` : `The ${a.s.name} bolts.`;
  }

  /** A person walks into an animal's tile: it moves out of the way. */
  shoo(x: number, y: number, g: FaunaView): void {
    const a = this.at(x, y);
    if (a) this.step(a, { x, y, z: null }, g, true);
  }
}

/** What an animal is about, in words (for looking at it). */
export function animalLines(a: Animal, now: number): string[] {
  const s = a.s, n = a.g.members.length;
  const doing = a.state === 'sleep' ? 'asleep' : a.state === 'flee' ? (s.fly ? 'flying off' : 'running off') : a.state === 'eat' ? 'feeding on a kill'
    : a.state === 'stalk' ? 'stalking something' : a.state === 'chase' ? 'giving chase' : a.state === 'threaten' ? 'facing you, hackles up'
    : a.perched ? 'perched in a tree' : a.alt > 0 ? 'flying' : a.state === 'drink' ? 'drinking' : now - a.noticed < 60 ? 'watching you' : s.diet === 'grazer' ? 'grazing' : s.diet === 'browser' ? 'browsing' : s.diet === 'seeds' ? 'pecking about' : 'nosing about';
  const out = [`${/^[aeiou]/.test(s.name) ? 'An' : 'A'} ${s.name}, ${doing}.`];
  if (n > 1) out.push(`One of ${s.herd ? (s.fly ? 'a flock' : s.diet === 'predator' ? 'a pack' : 'a herd') : 'a group'} of ${n} ${s.plural}.`);
  if (s.home === 'kept') out.push('Someone\'s, by the look of it.');
  return out;
}
