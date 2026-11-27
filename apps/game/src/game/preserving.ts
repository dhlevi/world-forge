/**
 * Preserving food (docs/design/survival.md, Food; from play, 27 November 2026; actors/items/spoil.ts):
 * smoking meat and fish over a fire (Cooking, some hours), salting them with salt from the market
 * (a bag salts four), and drying them on a rack at a camp in the wind (Survival, a day and a half of
 * dry weather). Each turns food that keeps for a day or two into food that keeps for weeks or months;
 * what has begun to spoil stays as far on.
 *
 * Proposed numbers, to tune in play.
 */
import { OBJECT_TILES, objectId } from '@worldforge/core/local/tiles';
import { check, DC, type Grade } from '../actors/checks';
import { defOf, itemName, makeItem, type Item } from '../actors/items/item';
import { carriedAge } from '../actors/items/spoil';
import { usePortion } from '../rules/tasks';
import type { TileAction } from './fieldcraft';
import { FieldWork } from './fieldwork';

/** Fires to smoke over (lit). */
const FIRES = new Set(['campfire', 'hearth', 'oven']);
/** Hours to smoke a batch, and the most pieces in one. */
const SMOKE_H = 6, BATCH = 10;
/** Hours of dry weather that dry meat or fish on a rack. */
export const DRY_H = 36;

/** What each raw food becomes, smoked, salted or dried (null: it cannot be). */
export function preserved(def: string, how: 'smoke' | 'salt' | 'dry'): string | null {
  const fish = /^(fish|gutted)_/.test(def) && def !== 'fish_guts' && def !== 'fish_spear';
  const meat = def === 'raw_meat' || def === 'rabbit';
  if (!fish && !meat) return null;
  return how === 'smoke' ? (fish ? 'smoked_fish' : 'smoked_meat') : how === 'salt' ? (fish ? 'salt_fish' : 'salt_meat') : fish ? 'dried_fish' : 'dried_meat';
}

const SMOKED: Record<Grade, { quality: Item['quality']; keep: number; text: string }> = {
  fine: { quality: 'fine', keep: 1, text: 'smoked through, dark and sweet' },
  success: { quality: 'common', keep: 1, text: 'smoked through' },
  near: { quality: 'poor', keep: 1, text: 'smoked, if too hot in places' },
  fail: { quality: 'poor', keep: 0.5, text: 'half of it cooked and spoilt by too hot a fire' },
  fumble: { quality: 'poor', keep: 0, text: 'the fire flares up and burns the lot' },
};

export class Preserving extends FieldWork {
  static readonly IDS = new Set(['smoke', 'salt', 'rack']);

  /** The raw meat and fish carried that can be preserved. */
  private raw(): Item[] {
    return (this.inv?.d.items ?? []).filter((i) => preserved(i.def, 'smoke'));
  }

  /** A lit fire beside the wanderer (a camp's, or a hearth). */
  private fireBeside(): boolean {
    const g = this.g;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = g.px + dx, y = g.py + dy;
      if (FIRES.has(OBJECT_TILES[g.map.objectAt(x, y, g.z)]?.name ?? '')) return true;
    }
    return false;
  }

  actions(x: number, y: number): TileAction[] {
    const g = this.g, inv = this.inv, out: TileAction[] = [];
    if (!inv || this.s.state.mode !== 'local') return out;
    const raw = this.raw();
    const on = OBJECT_TILES[g.map.objectAt(x, y, g.z)]?.name ?? '';
    if (FIRES.has(on) && raw.length) out.push({ id: 'smoke', label: `Smoke the meat and fish you carry over the fire (Cooking, ${SMOKE_H} hours)` });
    if (x === g.px && y === g.py && raw.length) {
      out.push({ id: 'salt', label: 'Salt the meat and fish you carry', why: inv.d.items.some((i) => i.def === 'salt') ? null : 'You have no salt.' });
      const camp = g.z === null ? g.camps.at(x, y) : undefined;
      out.push({ id: 'rack', label: 'Hang the meat and fish you carry to dry on a rack here (Survival)', why: !camp ? 'Racks are put up at a camp.' : on !== 'none' && on !== 'drying_rack' ? 'There is no room for a rack here.' : !inv.d.items.some((i) => i.def === 'stick' || i.def === 'pole') && camp.site.wood < 0.05 ? 'You need sticks to make a rack.' : null });
    }
    return out;
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
      case 'smoke': {
        if (!this.fireBeside()) {
          this.s.say('You need to stay beside the fire to smoke it.');
          return;
        }
        if (!(await this.spend(SMOKE_H * 3600, 'Smoking meat and fish'))) return;
        const said: string[] = [];
        for (const it of this.raw().slice(0, BATCH)) {
          const r = check(a, 'cooking', { difficulty: DC.easy, now: g.time });
          const how = SMOKED[r.grade];
          said.push(`the ${itemName(it)}, ${how.text}`);
          inv.drop(it.uid);
          if (how.keep <= 0) continue;
          this.stow([this.make(it, preserved(it.def, 'smoke')!, how.quality, how.keep)]);
        }
        this.s.say(`You smoke ${said.join('; ')}.`);
        break;
      }
      case 'salt': {
        if (!(await this.spend(30 * 60, 'Salting meat and fish'))) return;
        // A use of salt for each cut or fish (a stack of three takes three).
        let n = 0;
        for (const it of this.raw()) {
          const saltLeft = inv.d.items.filter((i) => i.def === 'salt').reduce((k, i) => k + (i.uses ?? 1) + (i.qty - 1) * (defOf(i).uses ?? 1), 0);
          if (saltLeft < it.qty) break;
          for (let k = 0; k < it.qty; k++) usePortion(inv, inv.d.items.find((i) => i.def === 'salt')!);
          inv.drop(it.uid);
          this.stow([this.make(it, preserved(it.def, 'salt')!, it.quality, 1)]);
          n += it.qty;
        }
        const left = this.raw().length;
        this.s.say(`You pack ${n === 1 ? 'it' : `${n} of them`} in salt${left ? `; you have no salt left for the other ${left === 1 ? 'one' : left}` : ''}.`);
        break;
      }
      case 'rack': {
        if (!(await this.spend(30 * 60, 'Putting up a drying rack'))) return;
        const r = check(a, 'survival', { difficulty: DC.easy, now: g.time });
        if (OBJECT_TILES[g.map.objectAt(x, y, null)]?.name !== 'drying_rack') {
          const camp = g.camps.at(x, y);
          if (camp) g.camps.place(g, camp, x, y, 'drying_rack');
          else g.map.setObject(x, y, objectId('drying_rack')!);
        }
        const hung = this.raw();
        for (const it of hung) {
          inv.drop(it.uid);
          it.loc = undefined;
          // Split thin and hung: a poor job dries slower.
          it.drying = r.grade === 'fine' ? 6 : r.grade === 'fumble' ? -12 : 0;
          g.ground.put(x, y, [it]);
        }
        this.s.say(`You split ${hung.length === 1 ? 'it' : 'them'} thin and hang ${hung.length === 1 ? 'it' : 'them'} on a rack of green sticks to dry in the wind: a day and a half of dry weather will do it. Animals may come to it while you are away.`);
        break;
      }
    }
    this.s.player?.changed();
  }

  /** A preserved food made from a raw one: its portions (as far as kept), its age carried over, and a fish's kind in its name. */
  private make(it: Item, def: string, quality: Item['quality'], keep: number): Item {
    const out = makeItem(def, { qty: it.qty, quality });
    if (it.qty === 1) out.uses = Math.max(1, Math.round((it.uses ?? defOf(it).uses ?? 1) * keep));
    // "smoked trout", "salt trout".
    if (/^(fish|gutted)_/.test(it.def)) out.name = `${def.replace('_fish', '')} ${defOf(it).name.replace(/^gutted /, '')}`;
    const aged = carriedAge(it.def, it.aged, def);
    if (aged !== undefined) out.aged = aged;
    return out;
  }
}

/**
 * Drying on a rack, by the hour (session tick): the meat and fish hung on a rack dry in dry
 * weather, and are dried meat or fish after a day and a half; in rain they do not dry, and only age.
 */
export function dryRacks(items: Iterable<Item>, hours: number, wet: boolean): number {
  let done = 0;
  for (const it of items) {
    if (it.drying === undefined) continue;
    if (!wet) it.drying += hours;
    if (it.drying >= DRY_H) {
      const to = preserved(it.def, 'dry');
      it.drying = undefined;
      if (!to) continue;
      const aged = carriedAge(it.def, it.aged, to);
      const fishName = /^(fish|gutted)_/.test(it.def) ? `dried ${defOf(it).name.replace(/^gutted /, '')}` : undefined;
      it.def = to;
      it.aged = aged;
      if (fishName) it.name = fishName;
      if (it.kg !== undefined) it.kg = Math.round(it.kg * 0.4 * 100) / 100;
      done++;
    }
  }
  return done;
}
