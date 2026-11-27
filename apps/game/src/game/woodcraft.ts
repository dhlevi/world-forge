/**
 * Woodcraft on the local map (docs/design/fieldcraft.md, stage 3; world/woodcraft.ts): the skill
 * menu's felling of trees and cutting of stakes, the wood that traps, fences, shelters and fires
 * are made from.
 */
import { objectId } from '@worldforge/core/local/tiles';
import { treeKind, treeShape, TRUNK_PART } from '@worldforge/core/local/trees';
import { Health } from '../actors/health';
import { itemName, makeItem } from '../actors/items/item';
import { blade, fell, fellingTool, POLE_MIN, STAKES_PER_POLE, STICK_MIN } from '../world/woodcraft';
import type { TileAction } from './fieldcraft';
import { FieldWork } from './fieldwork';

/** The tiles about a tree's trunk (a wide old trunk's second tile is beside it). */
const AROUND = [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, -1], [1, -1], [-1, 1]];

export class Woodcraft extends FieldWork {
  /** The ids this module does. */
  static readonly IDS = new Set(['fell', 'stakes']);

  /** What can be done with wood at a tile, for the skill menu (out of doors, on the ground). */
  actions(x: number, y: number): TileAction[] {
    const g = this.g, inv = this.inv, out: TileAction[] = [];
    if (g.z !== null || !inv || this.s.state.mode !== 'local') return out;
    const on = this.objName(x, y);
    const k = treeKind(on);
    if (k) {
      const sh = treeShape(k, x, y);
      const wide = sh.wide && AROUND.some(([dx, dy]) => this.objName(x + dx, y + dy) === TRUNK_PART);
      out.push({ id: 'fell', label: `Fell the ${sh.ageWord === 'grown' ? '' : `${sh.ageWord} `}${k.name === 'broadleaf' ? 'tree' : k.name} (Survival)`, why: wide ? 'It is too great a tree to fell.' : fellingTool(inv) ? null : 'You need an axe or a hatchet to fell a tree.' });
    }
    if (on === TRUNK_PART) out.push({ id: 'fell', label: 'Fell the tree (Survival)', why: 'It is too great a tree to fell.' });
    if (x === g.px && y === g.py && (this.count('pole') || this.count('stick'))) {
      out.push({ id: 'stakes', label: this.count('pole') ? 'Cut stakes from your poles' : 'Cut stakes from your stout sticks', why: blade(inv) ? null : 'You need a blade to point stakes.' });
    }
    return out;
  }

  /** Does a thing with wood at a tile (beside a tree; on the wanderer's own tile for stakes). */
  async act(what: string, x: number, y: number): Promise<void> {
    const g = this.g, a = this.s.player, inv = this.inv;
    if (!a || !inv) return;
    const why = this.actions(x, y).find((t) => t.id === what)?.why;
    if (why) {
      this.s.say(why);
      return;
    }
    switch (what) {
      case 'fell': {
        const tool = fellingTool(inv)!;
        const r = fell(a, this.objName(x, y), x, y, tool[1], g.time);
        if (!r || !(await this.spend(r.seconds, `Felling the ${r.name}`, `fell:${x},${y}`))) return;
        g.map.setObject(x, y, objectId('stump')!);
        const left = this.stow(r.items);
        if (r.hurt) a.get(Health)?.hurt({ kind: 'bruise', sev: 3, cause: 'a falling tree', now: g.time });
        this.s.say(`You fell the ${r.name} with your ${tool[0]}. ${r.text} It gives ${r.items.map((i) => itemName(i)).join(', ')}${left.length ? '; what you cannot carry lies at your feet' : ''}.`);
        break;
      }
      case 'stakes': {
        const poles = this.count('pole');
        const n = poles ? poles * STAKES_PER_POLE : this.count('stick');
        if (!(await this.spend((poles ? POLE_MIN * poles : STICK_MIN * n) * 60, 'Cutting stakes'))) return;
        this.use(poles ? 'pole' : 'stick', poles || n);
        this.stow([makeItem('stake', { qty: n })]);
        this.s.say(`You cut and point ${n} stake${n > 1 ? 's' : ''} with your ${blade(inv)}.`);
        break;
      }
    }
    this.s.player?.changed();
  }
}
