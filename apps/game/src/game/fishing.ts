/**
 * Fishing on the local map (docs/design/fieldcraft.md, stage 4; world/fishing.ts): the skill menu's
 * fishing with a rod or a spear for a chosen time, setting and lifting lines and nets, gutting the
 * catch, digging for worms, and sharpening a pole into a fish spear.
 */
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import { SPECIES_BY_ID } from '@worldforge/core/local/fauna';
import { GROUND_TILES } from '@worldforge/core/local/tiles';
import { FISH_BY_ID, type Fish } from '../actors/data/fish';
import { Health } from '../actors/health';
import { itemName, makeItem, type Item } from '../actors/items/item';
import { Skills } from '../actors/components';
import { biteChance, climateBand, fishItem, fishingWater, fishOf, fishWeight, gutAll, hookBait, land, LANDED, Lines, timeOfDay, useBait, whichFish, wormsIn, type BiteOdds, type FishingWater, type Gear } from '../world/fishing';
import { blade, fellingTool } from '../world/woodcraft';
import type { TileAction } from './fieldcraft';
import { FieldWork } from './fieldwork';

/** How long to fish: by the menu's choice. */
type Span = 'hour' | 'two' | 'light' | 'one';
/** The most a fishing goes on for (s), whatever was chosen. */
const MAX_S = 8 * 3600;
const Q = 900;

export class Fishing extends FieldWork {
  static readonly IDS = new Set(['fishhour', 'fishtwo', 'fishlight', 'fishone', 'spearhour', 'spearone', 'setline', 'setnet', 'liftline', 'gut', 'worms', 'fishspear']);

  private get lines(): Lines {
    return this.s.lines;
  }

  /** The water on a tile, for fishing, or null. */
  water(x: number, y: number): FishingWater | null {
    const g = this.g;
    if (!g.map.loaded(x, y)) return null;
    const gd = GROUND_TILES[g.map.groundAt(x, y, null)];
    if (!gd?.water) return null;
    let near = 0;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (g.map.loaded(x + dx, y + dy) && GROUND_TILES[g.map.groundAt(x + dx, y + dy, null)]?.water) near++;
    return fishingWater(gd.name, gd.water, g.map.waterAt(x, y) === 'salt', near);
  }

  /** Whether still water is frozen over (rivers run too fast to freeze but at their edges). */
  private frozen(w: FishingWater): boolean {
    return w.water !== 'shore' && this.s.skyNow.iceCm >= 3 && (w.water === 'lake' || this.s.skyNow.iceCm >= 15);
  }

  /** The odds of a bite at a water now (or at a time), with this gear and bait. */
  odds(w: FishingWater, gear: Gear, bait: BiteOdds['bait'], t = this.g.time): { o: BiteOdds; list: Fish[] } {
    const sky = this.s.weather.sky(t), sun = this.s.people.sun, c = this.s.weather.climate;
    const o: BiteOdds = {
      fishing: this.s.player?.get(Skills)?.effective('fishing') ?? 0, gear, hour: (t % 86400) / 3600, rise: sun.rise, set: sun.set,
      winter: sky.season === 'winter', raining: sky.w.rainMm > 0.5, bait, w,
    };
    return { o, list: fishOf(w.water, climateBand(c.warm, c.cold)) };
  }

  /** Connects the lines to the renderer. */
  install(): void {
    this.g.lineAt = (x, y) => {
      const l = this.lines.at(x, y);
      return l ? (l.catch.length ? 'caught' : l.kind) : null;
    };
  }

  /** Each hour: the lines and nets take fish, and herons take from them. */
  run(): void {
    const g = this.g;
    if (this.s.state.mode !== 'local') return;
    this.lines.run(g.time, (l, t) => {
      const w = this.water(l.x, l.y);
      return w && !this.frozen(w) ? this.odds(w, l.kind, l.bait ?? null, t) : null;
    }, (l) => {
      const h = [...this.s.fauna.all()].find((a) => (a.s.id === 'heron' || a.s.diet === 'predator') && Math.hypot(a.x - l.x, a.y - l.y) < 60);
      return h?.s.id ?? null;
    });
  }

  // ---- The skill menu ----------------------------------------------------------------------------------

  actions(x: number, y: number): TileAction[] {
    const g = this.g, inv = this.inv, out: TileAction[] = [];
    if (g.z !== null || !inv || this.s.state.mode !== 'local') return out;
    const here = x === g.px && y === g.py;
    const w = this.water(x, y);
    const has = (d: string) => inv.d.items.some((i) => i.def === d);
    const line = this.lines.at(x, y);
    if (w) {
      const ice = this.frozen(w);
      const cut = ice && !(fellingTool(inv) || has('fish_spear') || has('spear')) ? 'The water is frozen over, and you have nothing to cut a hole with.' : null;
      if (has('fishing_rod')) {
        const dark = timeOfDay((g.time % 86400) / 3600, this.s.people.sun.rise, this.s.people.sun.set) === 'night';
        out.push({ id: 'fishhour', label: 'Fish here with your rod for an hour (Fishing)', why: cut });
        out.push({ id: 'fishtwo', label: 'Fish here with your rod for two hours', why: cut });
        out.push({ id: 'fishlight', label: `Fish here with your rod until ${dark ? 'dawn' : 'dusk'}`, why: cut });
        out.push({ id: 'fishone', label: 'Fish here with your rod until you catch one', why: cut });
      }
      const spear = has('fish_spear') || has('spear');
      if (spear) {
        const why = ice ? 'The water is frozen over.' : w.deep ? 'It is too deep to spear fish; try the shallows.' : null;
        out.push({ id: 'spearhour', label: 'Spear fish here for an hour (Fishing)', why });
        out.push({ id: 'spearone', label: 'Spear fish here until you take one', why });
      }
      if (!has('fishing_rod') && !spear) out.push({ id: 'fishhour', label: 'Fish here (Fishing)', why: 'You need a rod and line, or a spear in the shallows.' });
      if (line) out.push({ id: 'liftline', label: `Lift your ${line.kind === 'net' ? 'net' : 'line'}${line.catch.length ? ` (${line.catch.length} in it)` : ''}` });
      else {
        out.push({ id: 'setline', label: 'Set a line here (Fishing)', why: ice ? 'The water is frozen over.' : has('set_line') ? null : 'You have no set line.' });
        if (has('net')) out.push({ id: 'setnet', label: 'Set your net here (Fishing)', why: ice ? 'The water is frozen over.' : w.water !== 'shore' && w.plenty < 0.2 ? 'The water is too small for a net.' : null });
      }
    }
    if (here) {
      const raw = inv.d.items.some((i) => /^fish_/.test(i.def) && i.def !== 'fish_guts' && i.def !== 'fish_spear');
      if (raw) out.push({ id: 'gut', label: 'Gut the fish you carry (Survival)', why: blade(inv) ? null : 'You need a blade to gut fish.' });
      if (has('pole') || has('staff')) out.push({ id: 'fishspear', label: `Sharpen ${has('pole') ? 'a pole' : 'your staff'} into a fish spear`, why: blade(inv) ? null : 'You need a blade to sharpen it.' });
    }
    if (!w && g.map.passable(x, y)) {
      const gd = GROUND_TILES[g.map.groundAt(x, y, null)];
      if (gd && this.waterNear(x, y, 12) && wormsIn(gd.name, false, false, false) > 0) out.push({ id: 'worms', label: 'Dig for worms here', why: this.s.skyNow.frozen ? 'The ground is frozen hard.' : null });
    }
    return out;
  }

  private waterNear(x: number, y: number, r: number): boolean {
    const g = this.g;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (g.map.loaded(x + dx, y + dy) && GROUND_TILES[g.map.groundAt(x + dx, y + dy, null)]?.water) return true;
    return false;
  }

  async act(what: string, x: number, y: number): Promise<void> {
    const g = this.g, a = this.s.player, inv = this.inv;
    if (!a || !inv) return;
    const why = this.actions(x, y).find((t) => t.id === what)?.why;
    if (why) {
      this.s.say(why);
      return;
    }
    switch (what) {
      case 'fishhour':
      case 'fishtwo':
      case 'fishlight':
      case 'fishone':
        await this.fish(x, y, 'rod', ({ fishhour: 'hour', fishtwo: 'two', fishlight: 'light', fishone: 'one' } as Record<string, Span>)[what]);
        break;
      case 'spearhour':
      case 'spearone':
        await this.fish(x, y, 'spear', what === 'spearhour' ? 'hour' : 'one');
        break;
      case 'setline':
      case 'setnet': {
        const net = what === 'setnet';
        if (!(await this.spend((net ? 20 : 10) * 60, net ? 'Setting your net' : 'Setting a line'))) return;
        const b = net ? null : hookBait(inv);
        if (b) useBait(inv, b.it);
        this.use(net ? 'net' : 'set_line', 1);
        this.lines.set(x, y, net ? 'net' : 'line', g.time, b?.kind);
        this.s.say(net ? 'You weight your net and set it across the water, its ends staked to the bank.' : `You ${b ? `bait the hooks with ${itemName({ ...b.it, qty: 1 })}, ` : ''}cast the line out and tie it to a stake on the bank${b ? '' : '; unbaited, it will take little'}.`);
        break;
      }
      case 'liftline': {
        if (!this.lines.at(x, y) || !(await this.spend(10 * 60, 'Lifting it'))) return;
        const l = this.lines.lift(x, y);
        if (!l) return;
        const fish = l.catch.map((c) => fishItem(FISH_BY_ID.get(c.fish)!, c.kg));
        const left = this.stow([makeItem(l.kind === 'net' ? 'net' : 'set_line'), ...fish]);
        const robbed = l.robbed ? ` Something has taken a fish from it${l.robbed.by ? `: ${SPECIES_BY_ID.get(l.robbed.by)?.name ?? 'a beast'} tracks on the bank` : ''}.` : '';
        this.s.say(`You lift your ${l.kind}${fish.length ? ` with ${this.list(fish)} in it` : ', empty'}.${robbed}${left.length ? ' What you cannot carry lies on the bank.' : ''}`);
        break;
      }
      case 'gut': {
        const n = inv.d.items.filter((i) => /^fish_/.test(i.def) && i.def !== 'fish_guts' && i.def !== 'fish_spear').reduce((k, i) => k + i.qty, 0);
        if (!(await this.spend(n * 5 * 60, 'Gutting fish'))) return;
        const r = gutAll(a, inv, g.time);
        if (!r) return;
        if (r.guts) this.stow([makeItem('fish_guts', { qty: r.guts })]);
        if (r.cut) a.get(Health)?.hurt({ kind: 'cut', sev: 0.6, cause: 'a gutting knife', part: 'hand.l', now: g.time });
        this.s.say(`${r.text}${r.guts ? ` You keep the guts for bait.` : ''}`);
        break;
      }
      case 'worms': {
        const gd = GROUND_TILES[g.map.groundAt(x, y, null)];
        const sky = this.s.skyNow;
        const tool = inv.d.items.some((i) => i.def === 'spade' || i.def === 'shovel');
        if (!(await this.spend(30 * 60, 'Digging for worms'))) return;
        const n = wormsIn(gd?.name ?? '', sky.frozen, sky.mud > 0.15 || sky.w.rainMm > 0.3, tool);
        if (n) this.stow([makeItem('worms', { qty: n })]);
        this.s.say(n ? `You turn the earth over and pick out ${n === 1 ? 'a handful of worms' : `${n} handfuls of worms`}.` : 'You dig for half an hour and find no worms worth the name.');
        break;
      }
      case 'fishspear': {
        if (!(await this.spend(20 * 60, 'Sharpening a fish spear'))) return;
        this.use(inv.d.items.some((i) => i.def === 'pole') ? 'pole' : 'staff', 1);
        this.stow([makeItem('fish_spear')]);
        this.s.say(`You split the end and sharpen it into prongs with your ${blade(inv)}: a fish spear.`);
        break;
      }
    }
    this.s.player?.changed();
  }

  private list(items: Item[]): string {
    const names = items.map((i) => `a ${itemName(i)}${i.kg ? ` (${i.kg} kg)` : ''}`);
    return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }

  /**
   * Fishes at a water with a rod or a spear for the span chosen, the world going on about the
   * wanderer (game/fieldcraft.ts, `work`): each quarter hour a bite by chance, landed or lost by the
   * check. The player can stop it at any time, and danger stops it.
   */
  async fish(x: number, y: number, gear: 'rod' | 'spear', span: Span): Promise<void> {
    const g = this.g, a = this.s.player, inv = this.inv;
    const w = this.water(x, y);
    if (!a || !inv || !w) return;
    // Through the ice: a hole cut first.
    if (this.frozen(w)) {
      if (!(await this.spend(20 * 60, 'Cutting a hole in the ice'))) return;
      this.s.say('You cut a hole through the ice.');
    }
    const sun = this.s.people.sun;
    const seconds = span === 'hour' ? 3600 : span === 'two' ? 7200 : span === 'one' ? 4 * 3600 : (() => {
      const h = (g.time % 86400) / 3600, day0 = g.time - (g.time % 86400);
      const to = timeOfDay(h, sun.rise, sun.set) === 'night' ? sun.rise : sun.set;
      const at = day0 + to * 3600 + (to * 3600 <= g.time % 86400 ? 86400 : 0);
      return Math.max(Q, Math.min(at - g.time, MAX_S));
    })();
    const caught: Item[] = [];
    let lost = 0, baitOut = false;
    // A quarter hour at a time a fish may bite; the world goes on, and it can be stopped.
    let quarters = 0;
    const res = await this.s.field.work(seconds, gear === 'spear' ? 'Spearing fish' : 'Fishing', {
      each: (done) => {
        // A roll for each quarter hour passed (or the last part of one, at the end).
        const q = done >= seconds ? Math.ceil(done / Q) : Math.floor(done / Q);
        if (q <= quarters) return;
        quarters = q;
        const b = gear === 'rod' ? hookBait(inv) : null;
        const { o, list } = this.odds(w, gear, b?.kind ?? null);
        const r = mulberry32(hashString(`fish#${x},${y}#${g.time}`));
        if (r() >= biteChance(o)) return;
        const f = whichFish(list, o, r);
        if (!f) return;
        const kg = fishWeight(f, r);
        const grade = land(a, f, kg, gear, g.time);
        const out = LANDED[grade];
        if (b && out.bait) useBait(inv, b.it);
        if (b && !hookBait(inv)) baitOut = true;
        if (out.landed) {
          const it = fishItem(f, kg);
          caught.push(it);
          this.stow([it]);
          this.s.say(`${gear === 'spear' ? 'You spear' : 'You land'} a ${f.name} (${kg} kg).`);
          if (span === 'one') return false;
        } else {
          lost++;
          this.s.say(grade === 'fumble' && gear === 'rod' ? 'Something big takes the hook and snaps the line; you tie on another.' : gear === 'spear' ? 'Your spear glances off a fish, and it is gone.' : 'A fish takes the bait and slips off the hook at the bank.');
        }
      },
    });
    const mins = Math.round(res.spent / 60);
    const span2 = mins >= 90 ? `${Math.round(mins / 30) / 2} hours` : `${mins} minutes`;
    const what = `${caught.length ? this.list(caught) : 'nothing'}${lost ? `, and ${lost === 1 ? 'one' : lost} lost` : ''}`;
    this.s.say(`${res.done ? `You stop fishing after ${span2}: ${what}` : `Your catch: ${what}`}.${baitOut ? ' You have no bait left.' : ''}`);
  }
}
