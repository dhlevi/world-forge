/**
 * Trapping on the local map (docs/design/fieldcraft.md, stage 3): the skill menu's digging,
 * covering and fencing (world/traps.ts; the poles and stakes come from game/woodcraft.ts), and what comes of the traps: beasts and
 * people falling into pits, catches waiting and taken by predators, and the law on a man-trap.
 *
 * Proposed numbers, to tune in play.
 */
import { SIZE_RANK, SPECIES_BY_ID } from '@worldforge/core/local/fauna';
import { GROUND_TILES, OBJECT_TILES, objectId } from '@worldforge/core/local/tiles';
import { Health } from '../actors/health';
import { itemName, makeItem, type Item } from '../actors/items/item';
import { usePortion } from '../rules/tasks';
import { Skills } from '../actors/components';
import { callName, healthOf } from '../world/folk-fight';
import type { Animal } from '../world/fauna';
import type { Resident } from '../world/population';
import { baitKind, baitWords, coverPit, digSeconds, diggingTool, drawnBy, fenceBoostOf, fresh, type BaitKind, FENCES, PIT_RANK, Pits, robbedWords, spotsPit, undiggable, type Pit } from '../world/traps';
import { blade } from '../world/woodcraft';
import type { TileAction } from './fieldcraft';
import { FieldWork } from './fieldwork';

const id = (name: string) => objectId(name)!;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** Who know a covered pit when they see one. */
const KEEN = /hunter|trapper|forester|woodcutter|poacher|gamekeeper/;
/** Stakes for a length of fence of stakes, and for a brush fence. */
const FENCE_STAKES = 3, BRUSH_STAKES = 1;
/** Stakes to spike a pit. */
const SPIKES = 4;
/** After this long in a pit (s), a beast fallen in out of sight is found dead. */
const DIES_IN_PIT_S = 2 * 86400;

export class Trapping extends FieldWork {
  private get pits(): Pits {
    return this.s.pits;
  }

  /** Whether anyone awake sees the wanderer at work (the law then knows whose a pit is). */
  private watched(): boolean {
    const g = this.g;
    return this.s.justice.witnesses({ x: g.px, y: g.py, z: g.z } as Resident).length > 0;
  }

  /** Connects the traps to the animals and the people about. */
  install(): void {
    this.s.fauna.onPit = (a, x, y) => this.beastFalls(a, x, y);
    this.s.fauna.lures = (x, y, r) => this.lures(x, y, r);
    this.s.fauna.baits = (x, y, r) => this.baits(x, y, r);
    this.s.people.onStep = (r, t) => {
      if (t.z === null && this.objName(t.x, t.y) === 'pit_covered') this.personSteps(r, t.x, t.y);
    };
  }

  /** The wanderer's traps near a place, for steering game along fences. */
  lures(x: number, y: number, r: number): { x: number; y: number; pit: boolean }[] {
    const out: { x: number; y: number; pit: boolean }[] = [];
    for (const p of this.pits.list) if (p.covered && Math.abs(p.x - x) <= r && Math.abs(p.y - y) <= r) out.push({ x: p.x, y: p.y, pit: true });
    for (const sn of this.s.snares.list) if (!sn.caught && Math.abs(sn.x - x) <= r && Math.abs(sn.y - y) <= r) out.push({ x: sn.x, y: sn.y, pit: false });
    return out;
  }

  /** The fresh bait in the wanderer's traps near a place: snares without a catch, and open or covered pits. */
  baits(x: number, y: number, r: number): { x: number; y: number; kind: BaitKind }[] {
    const now = this.g.time, out: { x: number; y: number; kind: BaitKind }[] = [];
    const near = (t: { x: number; y: number }) => Math.abs(t.x - x) <= r && Math.abs(t.y - y) <= r;
    for (const sn of this.s.snares.list) if (!sn.caught && fresh(sn.bait, now) && near(sn)) out.push({ x: sn.x, y: sn.y, kind: sn.bait.kind });
    for (const p of this.pits.list) if (!p.caught && fresh(p.bait, now) && near(p) && /^pit_(dug|covered)$/.test(this.objName(p.x, p.y))) out.push({ x: p.x, y: p.y, kind: p.bait.kind });
    return out;
  }

  /** The first food carried of a kind of bait, if any. */
  private baitCarried(kind: BaitKind): Item | undefined {
    return this.inv?.d.items.find((i) => baitKind(i.def) === kind);
  }

  /** How much the drive fences about a trap raise its chance. */
  fenceBoost(x: number, y: number): number {
    return fenceBoostOf(this.g.map, (n) => OBJECT_TILES[n]?.name ?? '', x, y);
  }

  // ---- What falls in ---------------------------------------------------------------------------------

  /** The fall into a pit, and its stakes: two metres, and a stake or two for a beast or a person. */
  private hurtByPit(h: Health, p: Pit | undefined, beast: boolean, now: number): void {
    if (beast) h.hurt({ kind: 'bruise', sev: 2 + h.random() * 3, cause: 'a fall into a pit', now });
    else h.fall(2, 'a fall into a pit', now);
    if (p?.spiked) {
      const n = beast ? 1 + Math.floor(h.random() * 2) : 1;
      for (let i = 0; i < n && !h.dead; i++) h.hurt({ kind: 'stab', sev: 5 + h.random() * 7, cause: 'the stakes in a pit', deep: 0.6, now });
    }
  }

  /** A beast steps onto a covered pit and falls in: the cover breaks, and it is held there. */
  beastFalls(a: Animal, x: number, y: number): void {
    const g = this.g, p = this.pits.at(x, y);
    g.map.setObject(x, y, id('pit_sprung'));
    if (p) {
      p.covered = false;
      p.hide = undefined;
      p.tried = g.time;
    }
    const h = this.s.fauna.healthOf(a, g.time);
    this.hurtByPit(h, p, true, g.time);
    a.state = 'idle';
    a.to = null;
    // Its herd takes fright at the crash.
    this.s.fauna.alarm(a, g);
    if (a.g.members.length > 1) for (const m of a.g.members) if (m !== a) m.noticed = g.time;
    if (g.isVisible(x, y)) g.say(`The ${a.s.name} crashes through the cover of your pitfall${p?.spiked ? ' onto the stakes' : ''}!`, undefined, 'hit');
    if (h.dead) this.s.fights.carcass(a.s, x, y, g.isVisible(x, y) ? `The ${a.s.name} dies in the pit.` : null, a);
    this.s.redraw();
  }

  /**
   * A person steps onto a covered pit: one who sees it in time (hunters and trappers more often)
   * drags its cover off; the rest fall in, are hurt and held a while. In a settlement, or by a road,
   * a man-trap is an assault in law, if it is known whose it is.
   */
  personSteps(r: Resident, x: number, y: number): void {
    const g = this.g, p = this.pits.at(x, y);
    if (!p) return;
    const name = cap(callName(r, this.s.people.opinions));
    const roll = (healthOf(r, g.time).random?.() ?? Math.random());
    if (spotsPit(p, KEEN.test(r.p.trade), roll)) {
      g.map.setObject(x, y, id('pit_dug'));
      p.covered = false;
      p.hide = undefined;
      if (g.isVisible(x, y)) g.say(`${name} stops short at the edge of your pitfall, and drags its cover off.`);
      this.s.redraw();
      return;
    }
    g.map.setObject(x, y, id('pit_sprung'));
    p.covered = false;
    p.hide = undefined;
    const h = healthOf(r, g.time);
    this.hurtByPit(h, p, false, g.time);
    if (g.isVisible(x, y)) g.say(`${name} falls into your pitfall with a cry${p.spiked ? ', onto the stakes' : ''}!`, undefined, 'hit');
    if (!h.dead && !h.senseless()) {
      r.fight = null;
      r.plight = 'yielded';
      r.plightAt = g.time;
      r.where = 'in a pit';
    }
    // The law: a man-trap where people go, if it is known to be the wanderer's.
    const known = p.seen || (g.isVisible(r.x, r.y) && Math.hypot(r.x - g.px, r.y - g.py) <= 14);
    if (known && (this.s.justice.settlement() || this.nearRoad(x, y))) {
      this.s.people.opinions.add(r.p.id, r.p.name, 'fell into your man-trap', -30, g.time, 90, false);
      this.s.justice.crime('assault', r);
      if (g.isVisible(x, y)) g.say('A pit where people walk is a man-trap in the eyes of the law.');
    }
    this.s.redraw();
  }

  private nearRoad(x: number, y: number): boolean {
    const g = this.g;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (g.map.loaded(x + dx, y + dy) && /road|path|track|cobble|street/.test(GROUND_TILES[g.map.groundAt(x + dx, y + dy, null)]?.name ?? '')) return true;
    }
    return false;
  }

  /**
   * Each turn on the local map: pits out of sight catch and are robbed by the hour, and a catch that
   * fell in out of sight is put in its pit when the map about it is made (dead, if it has been long).
   */
  run(): void {
    const g = this.g, s = this.s;
    if (s.state.mode !== 'local' || g.z !== null) return;
    const trapping = s.player?.get(Skills)?.effective('trapping') ?? 0;
    for (const p of this.pits.run(s.fauna, g, trapping, (x, y) => this.fenceBoost(x, y))) {
      if (g.map.loaded(p.x, p.y)) g.map.setObject(p.x, p.y, id('pit_sprung'));
    }
    for (const p of this.pits.list) {
      if (!g.map.loaded(p.x, p.y)) continue;
      // A beast too small to fall in eats the bait off the cover.
      const eater = s.fauna.at(p.x, p.y);
      if (eater && fresh(p.bait, g.time) && drawnBy(eater.s.diet, p.bait.kind) && !s.fauna.inPit(eater, g)) {
        if (g.isVisible(p.x, p.y)) g.say(`The ${eater.s.name} takes the bait from the cover of your pit and goes on its way.`);
        else p.baitTaken = { by: eater.s.id, at: g.time };
        p.bait = undefined;
      }
      if (p.robbed && this.objName(p.x, p.y) !== 'pit_sprung') g.map.setObject(p.x, p.y, id('pit_sprung'));
      if (!p.caught) continue;
      if (this.objName(p.x, p.y) !== 'pit_sprung') g.map.setObject(p.x, p.y, id('pit_sprung'));
      const sp = SPECIES_BY_ID.get(p.caught.species);
      const at = p.caught.at;
      p.caught = undefined;
      if (!sp) continue;
      if (g.time - at > DIES_IN_PIT_S) {
        s.fights.carcass(sp, p.x, p.y, null);
        continue;
      }
      s.fauna.pin({ id: `pit:${p.x},${p.y}:${at}`, species: sp.id, members: [{ x: p.x, y: p.y, z: null }], home: { x: p.x, y: p.y, r: 2 }, water: null }, g);
      const a = s.fauna.at(p.x, p.y);
      if (a) {
        const h = s.fauna.healthOf(a, at);
        this.hurtByPit(h, p, true, at);
        if (h.dead) s.fights.carcass(sp, p.x, p.y, null, a);
      }
    }
  }

  /** Coming to a pit robbed out of sight, or its bait taken: what is left to see. */
  looked(x: number, y: number): void {
    const p = this.pits.at(x, y);
    if (p?.robbed) {
      this.g.say(robbedWords(p.robbed.by, 'catch from your pit'));
      p.robbed = undefined;
    }
    if (p?.baitTaken) {
      this.g.say(baitWords(p.baitTaken.by, 'pit'));
      p.baitTaken = undefined;
    }
  }

  // ---- The skill menu ----------------------------------------------------------------------------------

  /** What can be done at a tile with traps, for the skill menu (out of doors, on the ground). */
  actions(x: number, y: number): TileAction[] {
    const g = this.g, inv = this.inv, out: TileAction[] = [];
    if (g.z !== null || !inv || this.s.state.mode !== 'local') return out;
    const gd = GROUND_TILES[g.map.groundAt(x, y, null)];
    if (!gd || gd.name.startsWith('floor_')) return out;
    const on = this.objName(x, y), here = x === g.px && y === g.py;
    const bare = on === 'none' && g.map.passable(x, y) && !gd.water && !this.s.snares.at(x, y) && !g.camps.list.some((c) => c.x === x && c.y === y) && !g.ground.at(x, y).length;
    if (bare) {
      const dig = diggingTool(inv);
      out.push({ id: 'dig', label: 'Dig a pit here (Athletics)', why: here ? 'Step off the spot first.' : undiggable(gd.name, !!gd.water) ?? (dig ? null : 'You need a spade, a shovel or at least a stout stick to dig with.') });
      out.push({ id: 'fence', label: 'Drive in a fence of stakes here (Trapping)', why: here ? 'Step off the spot first.' : this.count('stake') >= FENCE_STAKES ? null : `You need ${FENCE_STAKES} sharpened stakes.` });
      out.push({ id: 'brush', label: 'Build a brush fence here (Trapping)', why: here ? 'Step off the spot first.' : this.whyNoBrush() });
    }
    if (FENCES.has(on)) out.push({ id: 'unfence', label: 'Take down the fence' });
    // Bait (stage 3): food in a snare or a pit, to draw the beasts that eat it.
    const sn = this.s.snares.at(x, y), pit = this.pits.at(x, y);
    const baitable = (sn && !sn.caught && !fresh(sn.bait, g.time)) || (pit && /^pit_(dug|covered)$/.test(on) && !fresh(pit.bait, g.time));
    if (baitable) {
      const where = sn ? 'snare' : 'pit';
      for (const kind of ['meat', 'plant'] as BaitKind[]) {
        const it = this.baitCarried(kind);
        if (it) out.push({ id: kind === 'meat' ? 'baitmeat' : 'baitplant', label: `Bait the ${where} with your ${itemName({ ...it, qty: 1 })} (${kind === 'meat' ? 'draws hunters and scavengers' : 'draws grazers and browsers'})` });
      }
      if (!this.baitCarried('meat') && !this.baitCarried('plant')) out.push({ id: 'baitmeat', label: `Bait the ${where}`, why: 'You carry no meat, fish or plant food to bait it with.' });
    }
    const p = this.pits.at(x, y);
    if (on === 'pit_dug') {
      if (!p?.spiked) out.push({ id: 'spike', label: 'Set stakes in the pit', why: this.count('stake') >= SPIKES ? null : `You need ${SPIKES} sharpened stakes.` });
      out.push({ id: 'cover', label: 'Cover the pit (Trapping)', why: this.count('pole') || this.count('stick') >= 2 ? null : 'You need a pole or two stout sticks to cover it.' });
    }
    if (on === 'pit_covered') out.push({ id: 'uncover', label: 'Take the cover off the pit' });
    if (on === 'pit_sprung') {
      const beast = this.s.fauna.at(x, y);
      if (g.ground.at(x, y).length) out.push({ id: 'takepit', label: 'Take what is in the pit' });
      else if (!beast) out.push({ id: 'reset', label: 'Clear the broken cover, to set it again' });
    }
    if (on === 'pit_dug' || (on === 'pit_sprung' && !this.s.fauna.at(x, y) && !g.ground.at(x, y).length)) {
      out.push({ id: 'fill', label: 'Fill in the pit', why: diggingTool(inv) ? null : 'You need something to dig with.' });
    }
    return out;
  }

  /** Why a brush fence cannot be built, or null: a stake, and brush carried (sticks, firewood) or cut about with a blade. */
  private whyNoBrush(): string | null {
    if (this.count('stake') < BRUSH_STAKES) return 'You need a sharpened stake.';
    if (this.count('stick') >= 2 || this.count('firewood')) return null;
    if (this.inv && blade(this.inv) && this.brushNear()) return null;
    return 'You need brush: stout sticks or firewood carried, or a blade and bushes close by.';
  }

  private brushNear(): boolean {
    const g = this.g;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (/^(bush|scrub)$/.test(this.objName(g.px + dx, g.py + dy))) return true;
    return false;
  }

  /** The ids this module does. */
  static readonly IDS = new Set(['baitmeat', 'baitplant', 'dig', 'fence', 'brush', 'unfence', 'spike', 'cover', 'uncover', 'takepit', 'reset', 'fill']);

  /** Does a thing with traps at a tile (the wanderer is beside it, or on it for stakes). */
  async act(what: string, x: number, y: number): Promise<void> {
    const g = this.g, a = this.s.player, inv = this.inv;
    if (!a || !inv) return;
    const why = this.actions(x, y).find((t) => t.id === what)?.why;
    if (why) {
      this.s.say(why);
      return;
    }
    const p = this.pits.at(x, y);
    // The time first, a minute at a time: stopped part way, nothing is done (a pit dug or filled
    // part way is kept, to go on with).
    switch (what) {
      case 'baitmeat':
      case 'baitplant': {
        const kind: BaitKind = what === 'baitmeat' ? 'meat' : 'plant';
        const sn = this.s.snares.at(x, y), trap = sn ?? p;
        if (!trap || !(await this.spend(2 * 60, 'Baiting the trap'))) return;
        const it = this.baitCarried(kind);
        if (!it) return;
        const name = itemName({ ...it, qty: 1 });
        usePortion(inv, it);
        this.looked(x, y);
        trap.bait = { def: it.def, kind, at: g.time };
        trap.baitTaken = undefined;
        this.s.say(`You lay some of your ${name} in the ${sn ? 'snare' : 'pit'}: ${kind === 'meat' ? 'meat draws hunters and scavengers' : 'it will draw grazers and browsers'} for some days, until it goes off.`);
        break;
      }
      case 'dig': {
        const tool = diggingTool(inv)!;
        const d = digSeconds(a, tool[1], g.time);
        if (!(await this.spend(d.seconds, 'Digging a pit', `dig:${x},${y}`))) return;
        g.map.setObject(x, y, id('pit_dug'));
        const pit = this.pits.dig(x, y, g.time);
        pit.seen = this.watched();
        this.s.say(`You dig a pit${tool[0] === 'stick' ? ' with a stout stick and your hands' : ` with your ${tool[0]}`}, deep enough to hold a deer.${d.grade === 'fumble' ? ' Your back aches from it.' : ''}`);
        break;
      }
      case 'spike':
        if (!(await this.spend(15 * 60, 'Setting stakes in the pit'))) return;
        this.use('stake', SPIKES);
        if (p) p.spiked = true;
        this.s.say('You drive sharpened stakes into the floor of the pit, points up.');
        break;
      case 'cover': {
        if (!(await this.spend(20 * 60, 'Covering the pit'))) return;
        if (this.count('pole')) this.use('pole', 1);
        else this.use('stick', 2);
        const c = coverPit(a, g.time);
        g.map.setObject(x, y, id('pit_covered'));
        const pit = p ?? this.pits.dig(x, y, g.time);
        pit.covered = true;
        pit.hide = c.hide;
        pit.tried = g.time;
        pit.seen = pit.seen || this.watched();
        this.s.say(`You lay thin sticks across the pit and scatter litter over them: ${c.hide >= 0.85 ? 'it cannot be told from the ground about it' : c.hide >= 0.7 ? 'it is well hidden' : c.hide >= 0.5 ? 'it would not fool a careful eye' : 'it looks like what it is'}.`);
        break;
      }
      case 'uncover':
        if (!(await this.spend(5 * 60, 'Taking the cover off'))) return;
        g.map.setObject(x, y, id('pit_dug'));
        if (p) {
          p.covered = false;
          p.hide = undefined;
        }
        this.stow([makeItem('stick', { qty: 2 })]);
        this.s.say('You lift the cover off the pit.');
        break;
      case 'takepit': {
        if (!(await this.spend(5 * 60, 'Climbing down into the pit'))) return;
        this.looked(x, y);
        const items = g.ground.at(x, y);
        for (const it of [...items]) g.ground.take(x, y, it.uid);
        const left = this.stow(items);
        this.s.say(`You climb down into the pit and lift out ${items.map((i) => itemName(i)).join(', ')}${left.length ? ', and lay down what you cannot carry' : ''}.`);
        break;
      }
      case 'reset':
        if (!(await this.spend(10 * 60, 'Clearing the pit'))) return;
        this.looked(x, y);
        g.map.setObject(x, y, id('pit_dug'));
        this.s.say('You clear the broken sticks out of the pit; it can be covered again.');
        break;
      case 'fill': {
        const tool = diggingTool(inv)!;
        if (!(await this.spend(Math.round(tool[1] * 0.4 * 3600), 'Filling in the pit', `fill:${x},${y}`))) return;
        g.map.setObject(x, y, id('none'));
        this.pits.remove(x, y);
        this.s.say('You fill the pit in and tread the earth down.');
        break;
      }
      case 'fence':
        if (!(await this.spend(20 * 60, 'Driving in a fence'))) return;
        this.use('stake', FENCE_STAKES);
        g.map.setObject(x, y, id('stake_fence'));
        this.s.say('You drive in a length of fence, stakes close set.');
        break;
      case 'brush': {
        const carried = this.count('stick') >= 2 || this.count('firewood') > 0;
        if (!(await this.spend((carried ? 15 : 35) * 60, 'Building a brush fence'))) return;
        this.use('stake', BRUSH_STAKES);
        if (this.count('stick') >= 2) this.use('stick', 2);
        else if (this.count('firewood')) this.use('firewood', 1);
        g.map.setObject(x, y, id('brush_fence'));
        this.s.say(carried ? 'You pile brush between stakes: a length of drive fence.' : 'You cut brush about and pile it between stakes: a length of drive fence.');
        break;
      }
      case 'unfence': {
        if (!(await this.spend(10 * 60, 'Pulling up the fence'))) return;
        const stakes = this.objName(x, y) === 'stake_fence' ? FENCE_STAKES : BRUSH_STAKES;
        g.map.setObject(x, y, id('none'));
        this.stow([makeItem('stake', { qty: stakes })]);
        this.s.say('You pull the fence up and keep the stakes.');
        break;
      }
    }
    this.s.player?.changed();
  }

  /** Whether a tile holds a beast big enough to be held in a pit (for tests and the menu). */
  static holds(a: Animal): boolean {
    return SIZE_RANK[a.s.size] >= PIT_RANK;
  }
}
