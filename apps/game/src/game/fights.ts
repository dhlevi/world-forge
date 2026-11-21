/**
 * The wanderer's fights (docs/design/combat.md, stages 2 to 4): blows struck at beasts and people
 * and taken from them, yielding, and shooting and throwing. The rules of a blow and a shot are
 * rules/combat.ts and rules/ranged.ts; what beasts and people do in a fight is world/fauna.ts and
 * world/strife.ts; what striking a person means before the law is game/justice.ts. Part of the
 * session (game/session.ts), which owns the state it works on.
 */
import { GROUND_TILES } from '@worldforge/core/local/tiles';
import { residentLines } from './person-card';
import { Inventory } from '../actors/items/inventory';
import { itemName, type Item } from '../actors/items/item';
import { Health } from '../actors/health';
import { animalLines } from '../world/fauna';
import { carcassOf } from '../world/hunting';
import { aimables, armsOf, beastStrikes, readyWeapon, strikeBeast, strikeChance, type Arms, type Blow, type BlowId, type Stance, type Target } from '../rules/combat';
import { fightOf, type BeastFight, type NaturalBlow } from '../rules/beasts';
import { foeId, foeXY, type Foe } from './foes';
import { callName, folkFight, folkTarget, healthOf } from '../world/folk-fight';
import type { Resident } from '../world/population';
import { fire, inTheWay, missilesOf, readyLauncher, shotChance, type FireWorld, type Missile } from '../rules/ranged';
import type { Animal } from '../world/fauna';
import type { Mod } from '../actors/checks';
import type { Species } from '@worldforge/core/local/fauna';
import { LOUD } from '../world/senses';
import { cap } from '../util';
import type { PlaySession } from './session';

export class Fights {
  constructor(private readonly s: PlaySession) {}

  // ---- Fighting (combat.md, stages 2 and 4; game/combat.ts, world/strife.ts) ------------------------

  /** A foe (a beast, or a person) as the blow sees it. */
  targetOf(f: Foe): Target {
    if (f.kind === 'beast') {
      const a = f.a;
      return {
        name: `the ${a.s.name}`, health: this.s.fauna.healthOf(a, this.s.game.time), fight: fightOf(a.s), size: a.s.size,
        asleep: a.state === 'sleep' || (a.health?.senseless() ?? false), unaware: !a.fight && this.s.game.time - a.noticed > 60,
      };
    }
    const r = f.r;
    const helpless = r.where === 'asleep' || r.plight === 'down' || r.plight === 'bound';
    return folkTarget(r, r.fight?.intent ?? 'defend', this.s.people.opinions, this.s.game.time, helpless, !r.fight && r.where === 'asleep');
  }

  /** A foe's name in the telling ("the wolf", "the guard", "Ana"). */
  foeName(f: Foe): string {
    return f.kind === 'beast' ? `the ${f.a.s.name}` : callName(f.r, this.s.people.opinions);
  }

  /** What is seen of a foe, in lines (for the menus). */
  foeLines(f: Foe): string[] {
    if (f.kind === 'beast') return animalLines(f.a, this.s.game.time);
    const r = f.r, h = r.actor.get(Health);
    const out = [...residentLines(r, this.s.people, this.s.game.time)];
    if (h && h.d.wounds.length) out.push(`${r.p.female ? 'She' : 'He'} is hurt${h.bleeding() > 40 ? ', and bleeding' : ''}.`);
    return out;
  }

  /** What makes a blow harder now, beyond the body: the dark, the water underfoot. */
  private fightMods(): Mod[] {
    const g = this.s.game, out: Mod[] = [];
    if (this.s.skyNow.light < 0.3 && !this.s.heldLight() && !this.s.indoors()) out.push({ why: 'the dark', value: -15 });
    if (g.z === null && GROUND_TILES[g.map.ground(g.px, g.py)]?.water) out.push({ why: 'in the water', value: -10 });
    return out;
  }

  /** The wanderer's arms now (what they hold), or null. */
  arms(): Arms | null {
    const inv = this.s.player?.get(Inventory);
    return inv ? armsOf(inv) : null;
  }

  /**
   * The arms the wanderer would fight with: those held, or, with no weapon in hand, the best
   * carried, as if drawn (`drawn`: its name; drawing it takes the next blow's turn).
   */
  armsReady(): { arms: Arms; drawn: string | null } | null {
    const inv = this.s.player?.get(Inventory);
    if (!inv) return null;
    const copy = new Inventory(JSON.parse(JSON.stringify(inv.d)));
    const r = readyWeapon(copy);
    return { arms: armsOf(copy), drawn: r ? itemName(r.item) : null };
  }

  /** Whether a tile two off can be reached with a long weapon: straight (or straight on the diagonal), over open ground. */
  private reachable(x: number, y: number, d: number): boolean {
    const g = this.s.game;
    if (d !== 2) return true;
    const dx = x - g.px, dy = y - g.py;
    if ((dx && dy && Math.abs(dx) !== Math.abs(dy)) || (Math.abs(dx) !== 2 && dx !== 0) || (Math.abs(dy) !== 2 && dy !== 0)) return false;
    const mx = g.px + Math.sign(dx), my = g.py + Math.sign(dy);
    return g.map.passableAt(mx, my, g.z) && !this.s.fauna.at(mx, my) && !this.s.people.at(mx, my, g.z);
  }

  /** The beasts and people the wanderer can strike from here with a blow's reach (beside; a spear's, two tiles off with nothing between). */
  inReach(reach = 2): Foe[] {
    const g = this.s.game, out: Foe[] = [];
    if (this.s.state.mode !== 'local') return out;
    const dist = (p: { x: number; y: number }) => Math.max(Math.abs(p.x - g.px), Math.abs(p.y - g.py));
    if (g.z === null) for (const a of this.s.fauna.all()) {
      const d = dist(a);
      // Out of reach in the air or up a tree, or not seen.
      if (a.alt > 0 || d < 1 || d > reach || !g.isVisible(a.x, a.y) || !this.reachable(a.x, a.y, d)) continue;
      out.push({ kind: 'beast', a });
    }
    for (const r of this.s.people.all()) {
      const d = dist(r);
      if (r.z !== g.z || d < 1 || d > reach || !g.isVisible(r.x, r.y) || !this.reachable(r.x, r.y, d)) continue;
      out.push({ kind: 'person', r });
    }
    // Those fighting the wanderer first, then the nearest.
    const fighting = (f: Foe) => (f.kind === 'beast' ? !!f.a.fight : f.r.fight?.foe === 'player');
    return out.sort((p, q) => Number(fighting(q)) - Number(fighting(p)) || dist(foeXY(p)) - dist(foeXY(q)));
  }

  /** The blow to use: the one asked for, the standing one, or the weapon's first (its best). */
  private pickBlow(arms: Arms, id?: BlowId | null): Blow {
    const want = id ?? this.s.state.fight.blow;
    return arms.blows.find((b) => b.id === want) ?? arms.blows[0];
  }

  /** The chance of each blow at a foe, at an aim (for the fight menu). */
  blowChances(f: Foe, aim: string | null, stance: Stance): { blow: Blow; chance: number; mods: Mod[]; reach: boolean }[] {
    const p = this.s.player, arms = this.armsReady()?.arms;
    if (!p || !arms) return [];
    const t = this.targetOf(f), g = this.s.game, at = foeXY(f);
    const d = Math.max(Math.abs(at.x - g.px), Math.abs(at.y - g.py));
    return arms.blows.map((b) => ({ blow: b, ...strikeChance(p, t, b, aim, stance, this.fightMods()), reach: d <= b.reach }));
  }

  /** The parts of a foe that can be aimed at, with how much harder each is to hit. */
  aimsAt(f: Foe): { id: string; name: string; mod: number }[] {
    return aimables(this.targetOf(f).health);
  }

  /**
   * Strikes a foe: readies a weapon first if none is in hand (that takes its own time), then the
   * blow (the one asked for, else the standing one), at the aim and in the stance asked for (else the
   * standing ones). A beast fights back, stands at bay or flees (world/fauna.ts); a person fights
   * back, or runs crying for the watch (world/strife.ts), and the law hears of it (world/law.ts).
   * Returns whether time passed.
   */
  attack(f: Foe, o: { blow?: BlowId | null; aim?: string | null; stance?: Stance } = {}): boolean {
    const p = this.s.player, g = this.s.game, inv = p?.get(Inventory), h = this.s.health();
    if (!p || !inv || !h || this.s.state.dead) return false;
    if (h.senseless()) return false;
    this.s.state.yielded = false;
    // Hands empty of any weapon: draw the best carried (not when a blow without one was asked for).
    if (!o.blow || (o.blow !== 'punch' && o.blow !== 'kick')) {
      const drawn = readyWeapon(inv);
      if (drawn) {
        g.time += drawn.seconds;
        g.say(drawn.text);
        g.refresh();
        return true;
      }
    }
    const arms = armsOf(inv);
    const blow = this.pickBlow(arms, o.blow);
    const at = foeXY(f);
    const d = Math.max(Math.abs(at.x - g.px), Math.abs(at.y - g.py));
    if (d > blow.reach) {
      g.say(`${cap(this.foeName(f))} is out of reach.`);
      return false;
    }
    const aim = o.aim !== undefined ? o.aim : this.s.state.fight.aim;
    const stance = o.stance ?? this.s.state.fight.stance;
    const t = this.targetOf(f);
    const ex = strikeBeast(p, t, blow, aim && t.health.partOf(aim) ? aim : null, stance, g.time, this.fightMods());
    g.facing = at.x > g.px ? 'e' : at.x < g.px ? 'w' : at.y < g.py ? 'n' : 's';
    g.time += ex.seconds;
    g.activity = 'work';
    g.say(ex.text, ex.tip);
    // Striking someone who was not fighting you is a crime (and remembered), seen by those about.
    if (f.kind === 'person') this.s.justice.struckPerson(f.r);
    // Blood drawn close to gets on the one who drew it.
    const drawn = ex.wounds.filter((w) => w.kind !== 'bruise' && w.kind !== 'fracture').reduce((sum, w) => sum + w.start, 0);
    if (drawn && d <= 1) this.s.needs()?.stain(Math.min(25, 2 + drawn * 0.8));
    // Noise: a fight is loud.
    this.onNoiseOfFight(at.x, at.y);
    if (f.kind === 'beast') {
      if (t.health.dead) this.carcass(f.a.s, f.a.x, f.a.y, `The ${f.a.s.name} falls dead.`, f.a);
      else this.s.fauna.provoke(f.a, g);
    } else if (t.health.dead) this.s.justice.personDied(f.r, `${cap(this.foeName(f))} falls dead.`);
    else this.s.strife.provoke(f.r, g, blow.id !== 'punch' && blow.id !== 'kick');
    this.s.practice.flush();
    g.refresh();
    return true;
  }

  /** A fight is heard by those about (residents look round; beasts start). */
  private onNoiseOfFight(x: number, y: number): void {
    const n = { x, y, z: this.s.game.z, loud: LOUD.door + 15, kind: 'shout' as const, what: 'the noise of a fight' };
    this.s.people.hearPlayer(this.s.game, n);
  }

  /** A beast's blow at the wanderer (world/fauna.ts calls it). */
  beastBlow(a: Animal, blow: NaturalBlow): void {
    this.takeBlow(`the ${a.s.name}`, fightOf(a.s), a.health ?? null, a.fight?.stance, blow);
  }

  /** A person's blow at the wanderer (world/strife.ts calls it). */
  personBlow(r: Resident, blow: NaturalBlow): void {
    const f = r.fight;
    this.takeBlow(callName(r, this.s.people.opinions), folkFight(r, f?.intent ?? 'defend'), r.actor.get(Health) ?? null, f?.stance, blow, r.p.female ? 'her' : 'his');
  }

  /** A blow at the wanderer: their defence, the wound, waking them if asleep. */
  private takeBlow(name: string, fight: BeastFight, health: Health | null, stance: Stance | undefined, blow: NaturalBlow, its = 'its'): void {
    const p = this.s.player, g = this.s.game, h = this.s.health();
    if (!p || !h || this.s.state.dead) return;
    // Asleep, the first blow lands unopposed, and wakes them; senseless or bound, none is opposed.
    const asleep = g.activity === 'sleep' && !this.woken;
    const ex = beastStrikes({ name, fight, health, stance, its }, p, blow, this.s.state.fight.stance, g.time, { helpless: asleep || h.senseless() || this.s.state.bound, extra: this.fightMods() });
    if (asleep) {
      this.woken = true;
      g.say('You wake to an attack!');
    }
    g.say(ex.text, ex.tip);
    this.s.raiseAlarm();
    this.s.travel.stop();
    this.s.practice.flush();
  }

  /** Woken by an attack while sleeping (the rest of the night's blows are fought). */
  woken = false;

  /**
   * The wanderer yields (the fight menu, Y): robbers take what they want, the watch makes the
   * arrest, those fighting with fists let them be. Stays so until the wanderer strikes again.
   */
  yieldUp(): void {
    const g = this.s.game;
    if (this.s.state.dead) return;
    this.s.state.yielded = true;
    g.say('You throw up your hands and yield.');
    for (const line of this.s.strife.wandererYields(g)) g.say(line);
    g.time += 1;
    g.refresh();
  }

  // ---- Shooting and throwing (combat.md, stage 3; game/ranged.ts) --------------------------------

  /** The ways the wanderer can loose something now (a bow and its arrows, things to throw). */
  missiles(): Missile[] {
    const inv = this.s.player?.get(Inventory);
    return inv ? missilesOf(inv) : [];
  }

  /** The line of fire's view of the map, the beasts (a bird in flight only if it is the target) and the people (only the one aimed at is a target; the rest stop the shot). */
  private fireWorld(targetId: string | null): FireWorld {
    const g = this.s.game;
    const personTarget = (x: number, y: number) => {
      const r = this.s.people.at(x, y, g.z);
      return r && `p:${r.p.id}` === targetId ? r : null;
    };
    return {
      objectAt: (x, y) => g.map.objectAt(x, y, g.z),
      passable: (x, y) => g.map.passableAt(x, y, g.z),
      beastAt: (x, y) => {
        const r = personTarget(x, y);
        if (r) return { id: `p:${r.p.id}`, t: this.targetOf({ kind: 'person', r }) };
        const a = g.z === null ? this.s.fauna.at(x, y) : null;
        return a && (a.alt === 0 || a.id === targetId) ? { id: a.id, t: this.targetOf({ kind: 'beast', a }) } : null;
      },
      personAt: (x, y) => (personTarget(x, y) ? null : this.s.people.at(x, y, g.z)?.p.name ?? null),
    };
  }

  /** Beasts and people the wanderer can see to shoot at, nearest first, within a missile's reach (beasts on the ground, perched, or flying). */
  shootable(max = 60): Foe[] {
    const g = this.s.game, out: Foe[] = [];
    if (this.s.state.mode !== 'local') return out;
    const dist = (p: { x: number; y: number }) => Math.max(Math.abs(p.x - g.px), Math.abs(p.y - g.py));
    if (g.z === null) for (const a of this.s.fauna.all()) {
      const d = dist(a);
      if (d >= 1 && d <= max && g.isVisible(a.x, a.y)) out.push({ kind: 'beast', a });
    }
    for (const r of this.s.people.all()) {
      const d = dist(r);
      if (r.z === g.z && d >= 1 && d <= max && g.isVisible(r.x, r.y)) out.push({ kind: 'person', r });
    }
    const fighting = (f: Foe) => (f.kind === 'beast' ? !!f.a.fight : f.r.fight?.foe === 'player');
    return out.sort((p, q) => Number(fighting(q)) - Number(fighting(p)) || dist(foeXY(p)) - dist(foeXY(q)));
  }

  /** What makes a shot harder now: the dark, a cross wind, the target moving or flying. */
  private shotMods(f: Foe, m: Missile): Mod[] {
    const g = this.s.game, out = this.fightMods();
    const w = this.s.skyNow.w, at = foeXY(f);
    if (!this.s.indoors() && w.windMs > 2 && m.sev > 0) {
      // The wind across the line of fire carries the missile off (a heavy one less).
      const dx = at.x - g.px, dy = at.y - g.py, d = Math.hypot(dx, dy) || 1;
      const toward = (((w.windFrom + 180) % 360) * Math.PI) / 180, wx = Math.sin(toward), wy = -Math.cos(toward);
      const cross = Math.abs((dx / d) * wy - (dy / d) * wx);
      const pen = Math.round(Math.min(15, w.windMs * cross * (m.how === 'throw' ? 0.7 : 1.1) * Math.min(1, d / 8)));
      if (pen) out.push({ why: 'the wind', value: -pen });
    }
    if (f.kind === 'beast') {
      const a = f.a;
      if (a.alt > 0 && !a.perched) out.push({ why: 'in flight', value: -25 });
      else if (a.state === 'flee' || a.state === 'chase' || a.state === 'attack') out.push({ why: 'running', value: -18 });
      else if (a.state === 'walk' || a.state === 'stalk') out.push({ why: 'moving', value: -8 });
    } else {
      const r = f.r;
      if (r.plight === 'fleeing' || r.fight) out.push({ why: 'moving', value: -12 });
      else if (r.where === 'walking') out.push({ why: 'walking', value: -6 });
    }
    return out;
  }

  /** The chance of a missile at a foe now, and what lies in the way. */
  shotAt(f: Foe, m: Missile, aim: string | null): { chance: number; mods: Mod[]; dist: number; inRange: boolean; cover: string[]; person: string | null; blocked: string | null } {
    const p = this.s.player, g = this.s.game, at = foeXY(f);
    const dist = Math.max(Math.abs(at.x - g.px), Math.abs(at.y - g.py));
    const way = inTheWay(this.fireWorld(foeId(f)), [g.px, g.py], [at.x, at.y]);
    if (!p) return { chance: 0, mods: [], dist, inRange: false, ...way };
    const c = shotChance(p, m, this.targetOf(f), dist, aim, this.shotMods(f, m));
    return { chance: c.chance, mods: c.mods, dist, inRange: dist <= m.max, ...way };
  }

  /**
   * Shoots (or throws) at a foe: takes up the bow first if it is not in hand (that takes this turn),
   * then looses one missile along the line of fire (game/ranged.ts). The missile lands where it
   * falls, stays in the one struck, or breaks; a beast struck bolts, turns at bay or comes on
   * (world/fauna.ts), a person fights or runs (world/strife.ts), and those near a miss start.
   * Returns whether time passed.
   */
  shoot(f: Foe, m: Missile, aim: string | null = null): boolean {
    const p = this.s.player, g = this.s.game, inv = p?.get(Inventory), h = this.s.health();
    if (!p || !inv || !h || this.s.state.dead || h.senseless()) return false;
    this.s.state.yielded = false;
    if (m.launcher) {
      const ready = readyLauncher(inv, m.launcher);
      if (ready) {
        g.time += ready.seconds;
        g.say(ready.text);
        g.refresh();
        return true;
      }
    }
    const shot = this.shotAt(f, m, aim);
    if (!shot.inRange) {
      g.say(`${cap(this.foeName(f))} is beyond the reach of your ${m.launcher ? itemName(m.launcher) : 'arm'}.`);
      return false;
    }
    if (shot.person) {
      g.say(`${shot.person} is in the way.`);
      return false;
    }
    // The missile leaves the pack: one arrow from the stack, or the thing thrown.
    let missile: Item;
    if (m.item.qty > 1) missile = inv.split(m.item.uid, 1) ?? m.item;
    else missile = m.item;
    if (inv.get(missile.uid)) inv.drop(missile.uid);
    missile.loc = undefined;
    const at = foeXY(f);
    const res = fire(p, m, this.fireWorld(foeId(f)), [g.px, g.py], [at.x, at.y], foeId(f), aim, g.time, this.shotMods(f, m));
    g.facing = at.x > g.px ? 'e' : at.x < g.px ? 'w' : at.y < g.py ? 'n' : 's';
    g.time += res.seconds;
    g.activity = 'work';
    g.say(res.text, res.tip);
    // Shooting at someone who was not fighting you is a crime, seen by those about.
    if (f.kind === 'person') this.s.justice.struckPerson(f.r);
    if (res.landed) g.ground.put(res.landed[0], res.landed[1], [missile]);
    const sid = res.struck?.id;
    if (sid?.startsWith('p:')) {
      const r = [...this.s.people.all()].find((x) => `p:${x.p.id}` === sid);
      if (r) {
        if (res.lodged && r.actor.get(Inventory)?.stow(missile)) g.ground.put(r.x, r.y, [missile]);
        if (healthOf(r, g.time).dead) this.s.justice.personDied(r, `${cap(callName(r, this.s.people.opinions))} falls dead.`);
        else this.s.strife.provoke(r, g, true);
      }
    } else if (sid) {
      const hit = [...this.s.fauna.all()].find((x) => x.id === sid) ?? null;
      if (hit) {
        if (res.lodged) (hit.lodged ??= []).push(missile);
        if (this.s.fauna.healthOf(hit, g.time).dead) this.carcass(hit.s, hit.x, hit.y, `The ${hit.s.name} falls dead.`, hit);
        else this.s.fauna.provoke(hit, g);
      }
    }
    // A miss lands near others, and they start.
    if (res.landed && g.z === null) this.s.fauna.startle(res.landed[0], res.landed[1], g);
    this.s.practice.flush();
    g.refresh();
    return true;
  }

  /** A dead beast: its carcass left where it fell (world/hunting.ts), with what was still in its wounds, told if seen. */
  carcass(s: Species, x: number, y: number, text: string | null, a?: Animal, lodged: Item[] = a?.lodged ?? []): void {
    if (a) this.s.fauna.kill(a);
    this.s.game.ground.put(x, y, [carcassOf(s), ...lodged.map((it) => ({ ...it, loc: undefined }))]);
    if (text) this.s.game.say(text);
    this.s.redraw();
  }
}
