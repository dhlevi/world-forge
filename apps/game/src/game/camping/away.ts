/**
 * Camps left behind (docs/design/fieldcraft.md, stage 5): the hours away reckoned (food left on the
 * ground taken by animals, goods now and then by passers), told on coming back; camps unvisited for
 * a month falling into ruin; and the camps marked on the travel map, to go back to.
 *
 * Proposed numbers, to tune in play.
 */
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import { TILE_M } from '@worldforge/core/local/chunk';
import { defOf, itemName } from '../../actors/items/item';
import { CAMP_FADES_S, CAMP_R, type CampData } from '../camp';
import type { PlaySession } from '../session';

/** A camp's chance an hour, while the wanderer is away, of losing food to animals, and goods to passers. */
const FOOD_PER_HOUR = 0.04, GOODS_PER_HOUR = 0.004;
/** Near enough (m) to go straight onto the local map at a camp from the travel map. */
const NEAR_M = 400;

/** A camp as the travel map shows it. */
export interface CampSite {
  id: string;
  x: number;
  y: number;
  lon: number;
  lat: number;
  fire: 'burning' | 'banked' | 'cold';
  shelter: string | null;
  /** Days since the wanderer was last there. */
  days: number;
}

export class CampsAway {
  constructor(private readonly s: PlaySession) {}

  private get g() {
    return this.s.game;
  }

  /**
   * Each turn: the camp the wanderer is at is visited (and what happened while they were away is
   * told); the rest reckon their hours away, and those left a month fall into ruin.
   */
  run(): void {
    const g = this.g, here = this.s.state.mode === 'local' && g.z === null ? g.camps.at(g.px, g.py) : undefined;
    for (const c of [...g.camps.list]) {
      c.visited ??= c.made;
      c.reckoned ??= c.made;
      if (c === here) {
        c.visited = g.time;
        c.reckoned = g.time;
        if (c.news?.length) {
          for (const n of c.news) g.say(n);
          c.news = undefined;
        }
        continue;
      }
      this.reckon(c);
      if (g.time - c.visited > CAMP_FADES_S) this.ruin(c);
    }
  }

  /** The tiles of a camp, where things left lie. */
  private tiles(c: CampData): [number, number][] {
    const out: [number, number][] = [];
    for (let dy = -CAMP_R; dy <= CAMP_R; dy++) for (let dx = -CAMP_R; dx <= CAMP_R; dx++) out.push([c.x + dx, c.y + dy]);
    return out;
  }

  /** The hours away: now and then food is taken by animals, and goods by passers; less in a hidden camp or under a shelter. */
  private reckon(c: CampData): void {
    const g = this.g;
    const guard = (1 - 0.5 * c.site.hidden) * (c.shelter ? 0.6 : 1);
    const ground = g.ground, floor = ground.floor;
    ground.floor = null;
    try {
      while (g.time - c.reckoned! >= 3600) {
        c.reckoned! += 3600;
        const r = mulberry32(hashString(`camp-away#${c.id}#${c.reckoned}`));
        const left = this.tiles(c).flatMap(([x, y]) => ground.at(x, y).map((it) => ({ x, y, it })));
        if (!left.length) {
          c.reckoned = Math.max(c.reckoned!, g.time - 3600);
          break;
        }
        const food = left.filter((l) => defOf(l.it).kind === 'food');
        if (food.length && r() < FOOD_PER_HOUR * guard) {
          const l = food[Math.floor(r() * food.length)];
          ground.take(l.x, l.y, l.it.uid);
          (c.news ??= []).push(`Something has been at the food you left at your camp: the ${itemName({ ...l.it, qty: 1 })} is gone, and there are tracks about.`);
        }
        const goods = left.filter((l) => defOf(l.it).kind !== 'food' && l.it.def !== 'corpse');
        if (goods.length && r() < GOODS_PER_HOUR * (1 - c.site.hidden) * (c.shelter ? 0.8 : 1)) {
          const l = goods[Math.floor(r() * goods.length)];
          ground.take(l.x, l.y, l.it.uid);
          (c.news ??= []).push(`Someone has been through your camp while you were away: your ${itemName(l.it)} ${l.it.qty > 1 ? 'are' : 'is'} gone.`);
        }
        if ((c.news?.length ?? 0) > 6) c.news = c.news!.slice(-6);
      }
    } finally {
      ground.floor = floor;
    }
  }

  /** A camp left a month: its shelter falls in, its fire is long cold, and it is no longer the wanderer's. */
  private ruin(c: CampData): void {
    const g = this.g;
    g.camps.strike(g, c);
  }

  // ---- The travel map ------------------------------------------------------------------------------

  /** The wanderer's camps, for the travel map. */
  sites(): CampSite[] {
    const g = this.g;
    return g.camps.list.map((c) => {
      const [lon, lat] = this.s.travel.frame.toLL([(c.x + 0.5) * TILE_M, -(c.y + 0.5) * TILE_M]);
      return { id: `camp:${c.id}`, x: c.x, y: c.y, lon, lat, fire: g.camps.fireWord(c), shelter: c.shelter ? c.shelter.kind.replace('_', '-') : null, days: Math.floor((g.time - (c.visited ?? c.made)) / 86400) };
    });
  }

  metresTo(t: { x: number; y: number }): number {
    return Math.hypot(t.x - this.g.px, t.y - this.g.py) * TILE_M;
  }

  /** A camp in words, for the travel map. */
  words(t: CampSite): string {
    const fire = t.fire === 'burning' ? 'its fire burning' : t.fire === 'banked' ? 'its fire banked' : 'its fire cold';
    const when = t.days < 1 ? 'left today' : t.days === 1 ? 'left yesterday' : `left ${t.days} days ago`;
    return `Your camp${t.shelter ? `, with a ${t.shelter}` : ''}, ${fire}, ${when}`;
  }

  /** Goes to a camp: onto the local map at its fire when near enough, else the way there is planned. */
  goTo(t: CampSite): void {
    const c = this.g.camps.list.find((x) => `camp:${x.id}` === t.id);
    if (!c) return;
    if (this.metresTo(t) > NEAR_M) {
      void this.s.travel.setDest([t.lon, t.lat], 'your camp');
      return;
    }
    const [lon, lat] = this.s.travel.frame.toLL([(c.bedAt[0] + 0.5) * TILE_M, -(c.bedAt[1] + 0.5) * TILE_M]);
    this.s.toLocalAt(lon, lat);
    this.s.say('You come back to your camp.');
  }
}
