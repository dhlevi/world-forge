/**
 * People struck, dead and at the wanderer's mercy, and the law (docs/design/combat.md, stage 4):
 * crimes and their witnesses, the watch called and sent for, arrest and sentence, robbers who take
 * the purse, and robbers lying in wait on the road. The record itself is world/law.ts and the
 * people's part world/strife.ts. Part of the session (game/session.ts), which owns the state it
 * works on.
 */
import { usePortion } from '../rules/tasks';
import { makeItem, defOf, itemName, type Item } from '../actors/items/item';
import type { PlacedPerson, RouteStep } from '../worker/protocol';
import { background } from '../app/errors';
import { Body, Mood, Skills, Traits } from '../actors/components';
import { check, DC } from '../actors/checks';
import { Inventory } from '../actors/items/inventory';
import { Health } from '../actors/health';
import { treat, unsuited, type Treat } from '../rules/treatment';
import { bandCell, bandId, bandRoll } from '../rules/bands';
import { armsOf } from '../rules/combat';
import { callName, fullName, healthOf, isWatch, plunder, type Mercy } from '../world/folk-fight';
import { CRIME_WORDS, Law, harshness, type CrimeKind } from '../world/law';
import type { Resident } from '../world/population';
import { cap } from '../util';
import { hashString } from '@worldforge/core/gen/rng';
import type { PlaySession } from './session';

export class Justice {
  constructor(private readonly s: PlaySession) {}

  // ---- People struck, dead, and at the wanderer's mercy (world/strife.ts, world/law.ts) -------------

  /** When the wanderer last struck or shot at a person (for those who came to stop them: world/strife.ts). */
  struckAt = -1e9;

  /**
   * The wanderer strikes (or shoots at) a person. Unless they were already fighting the wanderer
   * (or are a robber), it is an assault: they remember it, and if it is seen, the law hears of it.
   */
  struckPerson(r: Resident): void {
    const g = this.s.game;
    this.struckAt = g.time;
    // A cutpurse caught at it, within the hour, may be struck without it being a crime.
    const caught = r.caughtAt !== undefined && g.time - r.caughtAt < 3600;
    const theirs = caught || (r.fight?.foe === 'player' && (r.fight.intent !== 'brawl' || !!r.fight.began));
    if (r.p.template !== 'bandit' && !theirs && r.harmedBy !== 'player') {
      this.s.people.opinions.add(r.p.id, r.p.name, 'attacked me', -60, g.time, 60, false);
      this.crime('assault', r);
    }
    r.harmedBy = 'player';
  }

  /** A person has died (by the wanderer's hand, or of their wounds): their body where they fell, with what they carried; murder, if it was the wanderer's doing. */
  personDied(r: Resident, text: string | null): void {
    const g = this.s.game, inv = r.actor.get(Inventory);
    const body = makeItem('corpse', { name: `body of ${fullName(r)}` });
    body.kg = r.actor.get(Body)?.d.weightKg ?? 70;
    const things: Item[] = [];
    for (const it of inv?.d.items ?? []) if (!it.loc || it.loc.at !== 'in') things.push({ ...it, loc: { at: 'in', parent: body.uid } });
    for (const it of inv?.d.items ?? []) if (it.loc?.at === 'in') things.push({ ...it });
    // Their coin, as coins on the body (taken up, they are counted into the purse).
    if (inv?.d.copper) things.push({ ...makeItem('coins', { qty: inv.d.copper }), loc: { at: 'in', parent: body.uid } });
    g.ground.put(r.x, r.y, [body, ...things]);
    const by = r.harmedBy === 'player';
    this.s.people.kill(r);
    if (text) g.say(text);
    if (by && r.p.template !== 'bandit') this.crime('murder', r);
    if (by && r.p.template === 'bandit') this.s.law.deed(this.settlement(), 'killed a robber', 5, g.time);
    this.s.redraw();
  }

  /** What the wanderer can do with a person yielded, fallen or bound (Shift+F on them, or walking into them). */
  mercyOptions(r: Resident): { act: Mercy; label: string; why: string | null }[] {
    const inv = this.s.player?.get(Inventory);
    const rope = inv?.d.items.some((i) => i.def === 'rope');
    const h = r.actor.get(Health);
    const out: { act: Mercy; label: string; why: string | null }[] = [
      { act: 'spare', label: r.plight === 'bound' ? 'Untie them and let them go' : 'Let them go', why: null },
      { act: 'rob', label: 'Take what they carry', why: null },
      { act: 'bind', label: 'Bind them (rope)', why: r.plight === 'bound' ? 'They are bound already.' : rope ? null : 'You have no rope.' },
      { act: 'tend', label: 'Tend their wounds (Medicine)', why: h && h.d.wounds.length ? null : 'They have no wounds to tend.' },
      { act: 'kill', label: 'Kill them', why: null },
    ];
    // A bound robber can be handed to the watch, if one is near.
    if (r.plight === 'bound' && r.p.template === 'bandit') out.push({ act: 'hand', label: 'Hand them over to the watch', why: this.watchNear(r) ? null : 'There is none of the watch near.' });
    return out;
  }

  /** Deals with a person at the wanderer's mercy. Returns what happened, in words. */
  mercy(r: Resident, act: Mercy): string {
    const g = this.s.game, p = this.s.player, inv = p?.get(Inventory);
    if (!p || !inv) return '';
    const name = callName(r, this.s.people.opinions);
    let text = '';
    switch (act) {
      case 'spare':
        this.s.people.opinions.add(r.p.id, r.p.name, 'spared me', 15, g.time, 30, false);
        this.s.strife.flee(r, g, false);
        text = `You let ${name} go, and ${r.p.female ? 'she' : 'he'} makes off.`;
        break;
      case 'rob': {
        const got = plunder(r);
        const theirs = r.actor.get(Inventory)!;
        let left = 0;
        for (const it of got.items) {
          theirs.drop(it.uid);
          it.loc = undefined;
          if (inv.stow(it)) {
            g.ground.put(g.px, g.py, [it]);
            left++;
          }
        }
        inv.earn(got.copper);
        theirs.d.copper = 0;
        g.time += 60;
        text = `You go through ${name}'s things, and take ${got.items.length ? `${got.items.length} thing${got.items.length === 1 ? '' : 's'}` : 'nothing much'}${got.copper ? ` and ${got.copper} copper` : ''}${left ? ' (what you cannot carry you leave on the ground)' : ''}.`;
        this.s.people.opinions.add(r.p.id, r.p.name, 'robbed me', -50, g.time, 90, false);
        if (r.p.template !== 'bandit') this.crime('theft', r, got.copper + got.items.length * 10);
        break;
      }
      case 'bind': {
        const rope = inv.d.items.find((i) => i.def === 'rope');
        if (!rope) return 'You have no rope.';
        usePortion(inv, rope);
        r.fight = null;
        r.plight = 'bound';
        r.plightAt = g.time;
        r.where = 'bound';
        g.time += 60;
        text = `You bind ${name} hand and foot.`;
        if (r.p.template !== 'bandit') this.crime('assault', r);
        break;
      }
      case 'tend': {
        const h = healthOf(r, g.time);
        const w = [...h.d.wounds].sort((x, y) => h.bleedOf(y) - h.bleedOf(x))[0];
        if (!w) return 'They have no wounds to tend.';
        const how = (['bandage', 'clean', 'splint', 'stitch'] as Treat[]).find((t) => !unsuited(w, t)) ?? 'bandage';
        const res = treat(p, r.actor, w, how, g.time, this.s.waterBeside());
        g.time += res.seconds;
        text = res.text.replace(/\byour\b/g, 'the').replace(/^You (\w+) the/, `You $1 ${name}'s`);
        if (res.ok) this.s.people.opinions.add(r.p.id, r.p.name, 'tended my wounds', 20, g.time, 30);
        break;
      }
      case 'kill':
        healthOf(r, g.time).die(`killed by the wanderer as ${r.p.female ? 'she' : 'he'} lay helpless`);
        r.harmedBy = 'player';
        g.time += 5;
        this.personDied(r, `You kill ${name} where ${r.p.female ? 'she' : 'he'} lies.`);
        if (r.p.template === 'bandit' && this.witnesses(r).length) this.s.law.deed(this.settlement(), 'killed a prisoner', -8, g.time);
        return `You kill ${name}.`;
      case 'hand': {
        this.s.people.kill(r);
        this.s.law.deed(this.settlement(), 'gave a robber to the watch', 10, g.time);
        const reward = 50;
        inv.earn(reward);
        text = `The watch take ${name} away, and pay you ${reward} copper for your trouble.`;
        break;
      }
    }
    g.say(text);
    this.s.practice.flush();
    g.refresh();
    return text;
  }

  // ---- The law (world/law.ts) ---------------------------------------------------------------------

  /** The settlement the wanderer is in (any village, town or city), or null in the wilds. */
  settlement(): { id: string; name: string } | null {
    const s = this.s.game.hud.settlement;
    return s ? { id: s.id, name: s.name } : null;
  }

  /** How harsh the law is here: by the people most of the residents about belong to. */
  harshness(): number {
    return harshness(this.s.townCulture() ?? undefined);
  }


  /** Those who see a person (awake, on the same floor, near, with a clear line to them): witnesses to what is done to them. */
  witnesses(r: Resident): Resident[] {
    const out: Resident[] = [];
    for (const w of this.s.people.all()) {
      if (w === r || w.z !== r.z || w.where === 'asleep' || w.plight === 'down' || w.plight === 'bound' || w.p.template === 'bandit') continue;
      const d = Math.max(Math.abs(w.x - r.x), Math.abs(w.y - r.y));
      if (d > 14) continue;
      if (this.clearLine(w, r, r.z)) out.push(w);
    }
    return out;
  }

  /** Whether nothing that blocks sight lies between two tiles on a floor. */
  private clearLine(a: { x: number; y: number }, b: { x: number; y: number }, z: number | null): boolean {
    const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let i = 1; i < n; i++) {
      const x = Math.round(a.x + ((b.x - a.x) * i) / n), y = Math.round(a.y + ((b.y - a.y) * i) / n);
      if (!this.s.game.map.transparentAt(x, y, z)) return false;
    }
    return true;
  }

  /** One of the watch near a person (to hand a prisoner to, or to come at a cry). */
  private watchNear(r: Resident, d = 25): Resident | null {
    let best: Resident | null = null, bd = Infinity;
    for (const w of this.s.people.all()) {
      if (!isWatch(w) || w.fight || w.plight || w.where === 'asleep' || w.z !== r.z) continue;
      const dd = Math.max(Math.abs(w.x - r.x), Math.abs(w.y - r.y));
      if (dd <= d && dd < bd) {
        bd = dd;
        best = w;
      }
    }
    return best;
  }

  /**
   * A crime against a person (world/law.ts): those who see it (and the victim, if they live to tell
   * it) think the worse of the wanderer and cry out; the watch near come to arrest them; the
   * settlement records it, and the wanderer is wanted there.
   */
  crime(kind: CrimeKind, victim: Resident, value?: number): void {
    const g = this.s.game, place = this.settlement();
    const seen = this.witnesses(victim);
    const victimTells = !healthOf(victim, g.time).dead;
    for (const w of seen) this.s.people.opinions.add(w.p.id, w.p.name, `saw you commit ${CRIME_WORDS[kind]}`, kind === 'murder' ? -50 : -25, g.time, 60, false);
    // Those who saw it come to the victim's aid, or scatter crying for the watch (world/strife.ts).
    const inv = this.s.player?.get(Inventory);
    if (kind !== 'theft') this.s.strife.witnessed(seen, victim, g, !!(inv && armsOf(inv).weapon));
    const count = seen.length + (victimTells ? 1 : 0);
    if (!place) return;
    if (!this.s.law.crime(place, kind, victim.p.name, count, g.time, value)) return;
    if (seen.length || victimTells) this.callWatch(victim, kind === 'murder' ? 4 : 2);
  }

  /** The watch sent for from their post, on their way (none: none sent for). */
  private watchComing: { at: number; n: number; place: { id: string; name: string } } | null = null;
  private watchSent = 0;

  /**
   * The watch sent for arrive: set down out of sight, from the way they come, and make for the
   * wanderer. In a town or city a patrol of the watch (a sergeant leading); in a village, the
   * reeve's men. They are of the settlement's people, armed and dressed by their trade.
   */
  watchArrives(): void {
    const c = this.watchComing, g = this.s.game;
    if (!c || g.time < c.at || this.s.state.mode !== 'local') return;
    this.watchComing = null;
    const place = this.settlement();
    if (!place || place.id !== c.place.id || !this.s.law.wanted(place.id) || this.s.state.dead) return;
    const locals = [...this.s.people.all()].filter((r) => r.p.template !== 'bandit');
    const like = locals[Math.floor(g.dice.random() * locals.length)]?.p;
    if (!like) return;
    const village = this.s.game.hud.settlement?.tier === 'village';
    const go = (names: string[]) => {
      let came = 0;
      for (let i = 0; i < c.n; i++) {
        const nm = names[i] ?? `${like.given}`;
        const look = locals[Math.floor(g.dice.random() * locals.length)]?.p.look ?? like.look;
        const id = `watch:${place.id}:${++this.watchSent}:${Math.floor(g.time)}`;
        const trade = village ? (i ? 'bailiff' : 'reeve') : i ? 'guard' : 'sergeant';
        const p: PlacedPerson = {
          ...like, id, name: nm, given: nm.split(' ')[0], female: false, age: 22 + Math.floor(g.dice.random() * 20), trade, role: 'head', traits: [],
          means: 'middling', household: `the watch of ${place.name}`, homeId: `watch:${place.id}`, homeName: `the watch-house of ${place.name}`, ties: [], template: 'guard', day: 0,
          plan: [{ from: 0, to: 24, act: 'work', place: 'out', at: null }], home: { x: g.px, y: g.py, z: null }, at: null, facing: 's',
          look: { ...look, hairStyle: 'short', cloth: like.look.cloth },
        };
        const r = this.s.people.summon(p, g, { x: g.px, y: g.py, z: g.z }, 22, 40, () => g.dice.random());
        if (!r) continue;
        this.s.strife.start(r, 'arrest', 'player', g.time);
        came++;
      }
      if (came) g.say(village ? 'Shouts nearby: the reeve and his men are coming.' : 'A whistle shrills, and boots ring on the stones: the watch are coming.');
    };
    const ask = this.s.world.names;
    if (ask) background(ask(like.culture, `${place.id}#watch#${this.watchSent}`, c.n).then((n) => go(n.male.map((x) => x.full))).catch(() => go([])), 'the watch');
    else go([]);
  }

  /**
   * The watch come at a cry: up to so many of those about set out to arrest the wanderer; if there
   * are too few, more are sent for from their post, and come in a few minutes (a village's men take
   * longer). Those already fighting the wanderer count.
   */
  callWatch(at: Resident, n: number): void {
    const g = this.s.game;
    const already = [...this.s.people.all()].filter((w) => isWatch(w) && w.fight?.foe === 'player').length;
    // Those of the watch about who hear the cry (within a long street's reach); the rest are sent for.
    const watch = [...this.s.people.all()].filter((w) => isWatch(w) && !w.fight && !w.plight && w.where !== 'asleep' && w.z === g.z && Math.max(Math.abs(w.x - at.x), Math.abs(w.y - at.y)) <= 50);
    watch.sort((a, b) => Math.max(Math.abs(a.x - at.x), Math.abs(a.y - at.y)) - Math.max(Math.abs(b.x - at.x), Math.abs(b.y - at.y)));
    const go = watch.slice(0, Math.max(0, n - already));
    for (const w of go) this.s.strife.start(w, 'arrest', 'player', g.time);
    if (go.length && g.isVisible(go[0].x, go[0].y)) g.say(`${cap(callName(go[0], this.s.people.opinions))} shouts and comes running.`);
    // More are sent for only when none of the watch is yet at the wanderer.
    const short = already ? 0 : n - go.length, place = this.settlement();
    if (short > 0 && place && !this.watchComing) {
      const village = g.hud.settlement?.tier === 'village';
      this.watchComing = { at: g.time + (village ? 180 : 60) + g.dice.random() * (village ? 300 : 90), n: Math.min(short, village ? 2 : 3), place };
    }
  }

  /** The watch see a wanted wanderer: they may know them, and come to arrest them. */
  recognise(): void {
    const g = this.s.game, place = this.settlement();
    if (!place || !this.s.law.wanted(place.id) || this.s.state.dead) return;
    const slot = Math.floor(g.time / 30);
    if (slot === this.lastLook) return;
    this.lastLook = slot;
    for (const w of this.s.people.all()) {
      if (!isWatch(w) || w.fight || w.plight || w.where === 'asleep' || w.z !== g.z) continue;
      const d = Math.max(Math.abs(w.x - g.px), Math.abs(w.y - g.py));
      if (d > 10 || !g.isVisible(w.x, w.y)) continue;
      const roll = (hashString(`${w.p.id}#know#${slot}`) % 100) / 100;
      if (roll < 0.25) {
        g.say(`"That is the one!" ${callName(w, this.s.people.opinions)} cries, and comes for you.`);
        this.callWatch(w, 3);
        return;
      }
    }
  }
  private lastLook = -1;

  /**
   * Arrested (the wanderer has yielded to the watch, or been beaten down by them): taken before the
   * law and sentenced for every crime not yet answered for in this settlement (world/law.ts): the
   * fine from the purse (days in the cells for what cannot be paid), days in the cells, the stocks,
   * the brand, or the rope.
   */
  arrest(by: Resident): void {
    const g = this.s.game, p = this.s.player, place = this.settlement(), inv = p?.get(Inventory), n = this.s.needs(), h = this.s.health();
    if (!p || !inv || this.s.state.dead) return;
    // Every fight with the wanderer ends: they are in the hands of the law.
    for (const r of this.s.people.everyone()) if (r.fight?.foe === 'player') this.s.people.release(r);
    this.s.state.yielded = false;
    const name = callName(by, this.s.people.opinions);
    g.say(`${cap(name)} takes you by the arm. You are under arrest.`);
    if (!place) {
      g.say('There is no court here: you are let go with a warning.');
      return;
    }
    const harsh = this.harshness();
    const s = this.s.law.sentence(place.id, harsh);
    const lines: string[] = [];
    if (!s.for) lines.push(`Before the magistrate of ${place.name}, there is nothing on the record against you: you are let go.`);
    else lines.push(`You are brought before the magistrate of ${place.name}, charged with ${s.for}.`);
    if (s.hang) {
      g.say(lines[0]);
      g.say('You are found guilty, and sentenced to hang. At dawn, it is done.');
      g.time = Math.ceil(g.time / 86400) * 86400 + 6 * 3600;
      h?.die(`hanged for murder in ${place.name}`);
      g.updateHud();
      return;
    }
    let days = s.days;
    if (s.fine) {
      const paid = Law.pay(s.fine, inv.d.copper);
      inv.d.copper -= paid.paid;
      days += paid.days;
      lines.push(paid.days ? `You are fined ${s.fine} copper, and can pay only ${paid.paid}: ${paid.days} more day${paid.days === 1 ? '' : 's'} in the cells.` : `You are fined ${s.fine} copper, and pay it.`);
    }
    if (days) lines.push(`You are held ${days} day${days === 1 ? '' : 's'} in the cells, on bread and water.`);
    if (s.stocks) lines.push('You are put in the stocks for a day, to be jeered at and pelted with filth.');
    if (s.brand) lines.push('You are branded on the hand, a thief\'s mark for all to see.');
    for (const l of lines) g.say(l);
    // The days pass: fed on bread and water, rested on straw.
    this.s.travel.stop();
    for (let d = 0; d < days + (s.stocks ? 1 : 0); d++) {
      for (let hr = 0; hr < 24; hr++) {
        g.time += 3600;
        g.activity = hr < 9 ? 'sleep' : 'rest';
        if (hr === 8 || hr === 18) {
          n?.eat(600, 0.6);
        }
        g.updateHud();
        if (this.s.state.dead) return;
      }
    }
    if (s.stocks) {
      this.s.player?.get(Mood)?.add({ id: 'stocks', text: 'Shamed in the stocks', value: -10, until: g.time + 5 * 86400 });
      n?.stain(40);
      this.s.law.deed(place, 'put in the stocks', -5, g.time);
    }
    if (s.brand) {
      h?.hurt({ kind: 'burn', sev: 3, part: 'hand.r', cause: 'the branding iron', now: g.time });
      p.get(Body)?.d.wounds.push({ part: 'hand', kind: 'burn', severity: 3, scar: `a thief's brand on the hand, from ${place.name}` });
    }
    this.s.law.served(place.id);
    g.say(days ? 'At last you are let out, and told to mind yourself.' : 'You are let go, and told to mind yourself.');
    g.refresh();
  }

  /** A robber stands over the yielded or fallen wanderer: they take the purse and what is worth taking. */
  robbed(r: Resident): void {
    const g = this.s.game, inv = this.s.player?.get(Inventory);
    if (!inv) return;
    const theirs = r.actor.get(Inventory);
    const copper = inv.d.copper;
    inv.d.copper = 0;
    theirs?.earn(copper);
    // Rings and fine things, and the best weapon.
    const taken: Item[] = [];
    for (const it of [...inv.d.items]) {
      const d = defOf(it);
      if (d.wear?.jewel || (d.melee && !taken.some((x) => defOf(x).melee) && it.loc?.at === 'hand')) {
        const tree = inv.drop(it.uid);
        for (const t of tree) {
          t.loc = undefined;
          if (!theirs || theirs.stow(t)) g.ground.put(r.x, r.y, [t]);
        }
        taken.push(it);
      }
    }
    this.s.state.yielded = false;
    g.say(`${cap(callName(r, this.s.people.opinions))} takes ${copper ? `your purse (${copper} copper)` : 'your empty purse'}${taken.length ? ` and your ${taken.map((x) => itemName(x)).join(' and ')}` : ''}, and makes off.`);
    this.s.player?.get(Mood)?.add({ id: 'robbed', text: 'Robbed on the road', value: -8, until: g.time + 3 * 86400 });
    // One who fought them, or now and then anyone, gets a beating for it.
    const h = this.s.health();
    if (h && (r.harmedBy === 'player' || g.dice.random() < 0.25)) {
      for (let i = 0; i < 2 + Math.floor(g.dice.random() * 2); i++) h.hurt({ kind: 'bruise', sev: 1.5 + g.dice.random() * 2.5, part: g.dice.random() < 0.6 ? 'torso' : 'head', cause: 'a robber\'s boots', now: g.time });
      g.say(`${cap(callName(r, this.s.people.opinions))} puts the boot in before going, for good measure.`);
    }
  }

  // ---- Cutpurses (backlog N4) -----------------------------------------------------------------

  /** A purse lightened unseen: told when the wanderer next notices (game seconds, and how much). */
  private lightened: { at: number; copper: number } | null = null;

  /**
   * A cutpurse's hand at the purse: whether the wanderer feels it, by their eyes, their wits and
   * their own knowledge of the trick (Sleight of hand). Felt, the thief breaks away and runs (and
   * may be struck or chased without it being a crime); unfelt, a share of the coin is gone, and
   * the wanderer finds out a while later.
   */
  pickpocket(r: Resident): void {
    const g = this.s.game, a = this.s.player, inv = a?.get(Inventory);
    if (!a || !inv || this.s.state.dead || !inv.d.copper) return;
    const t = a.get(Traits), sk = a.get(Skills);
    const notice = Math.max(5, Math.min(90, 25 + ((t?.get('eyesight') ?? 10) - 10) * 3 + ((t?.get('wisdom') ?? 10) - 10) * 2 + (sk?.effective('sleight') ?? 0) / 2));
    const name = callName(r, this.s.people.opinions);
    if (g.dice.random() * 100 < notice) {
      r.harmedBy = undefined;
      r.caughtAt = g.time;
      this.s.strife.flee(r, g, false);
      g.say(`You feel a hand at your purse, and catch ${name} at it! ${r.p.female ? 'She' : 'He'} twists free and runs.`);
      return;
    }
    const took = Math.max(1, Math.round(inv.d.copper * (0.15 + g.dice.random() * 0.35)));
    inv.d.copper -= took;
    r.actor.get(Inventory)?.earn(took);
    this.lightened = { at: g.time + 600 + g.dice.random() * 1800, copper: (this.lightened?.copper ?? 0) + took };
  }

  /** The wanderer finds their purse lighter than it was (some while after it happened). */
  purseNotice(): void {
    const l = this.lightened, g = this.s.game;
    if (!l || g.time < l.at) return;
    this.lightened = null;
    g.say(`Your purse is lighter than it should be: ${l.copper} copper gone. A cutpurse, somewhere in the crowd.`);
    this.s.player?.get(Mood)?.add({ id: 'pickpocketed', text: 'Had my purse cut', value: -4, until: g.time + 2 * 86400 });
  }

  // ---- Robbers on the road --------------------------------------------------------------------

  /** Bands passed this week (once a band's cell is crossed, it is not met again that week). */
  private bandsPassed = new Set<string>();

  /**
   * A step of a journey through a band cell where robbers camp this week (worker/bandits.ts): they
   * may spring on the wanderer (more likely on a road, where they watch). The journey stops, and
   * the wanderer is set down on the local map with the band about them.
   */
  roadside(st: RouteStep): void {
    const p = st.banditry ?? 0;
    if (p <= 0 || this.s.state.dead) return;
    const g = this.s.game, [bx, by] = bandCell(st.cx, st.cy), week = Math.floor(g.time / (7 * 86400)), id = bandId(bx, by, week);
    if (this.bandsPassed.has(id)) return;
    this.bandsPassed.add(id);
    if (this.bandsPassed.size > 400) this.bandsPassed.clear();
    if (!bandRoll(this.s.o.settings.seed, bx, by, week, p).here) return;
    const meet = st.way === 'road' ? 0.15 : st.way === 'track' ? 0.1 : 0.06;
    if (g.dice.random() >= meet) return;
    // Seen first (backlog W9): Tracking reads their signs, Survival the lie of the land. The
    // journey stops short of them, and the wanderer can go round (the band is not met again this week).
    const a = this.s.player, sk = a?.get(Skills);
    if (a && sk) {
      const skill = sk.effective('tracking') >= sk.effective('survival') ? 'tracking' : 'survival';
      const dark = this.s.skyNow.light < 0.3;
      const r = check(a, skill, { difficulty: DC.hard, now: g.time, mods: dark ? [{ why: 'the dark', value: -15 }] : [] });
      if (r.ok) {
        this.s.travel.stop();
        g.say(skill === 'tracking'
          ? 'Fresh tracks of several men leave the way and come back to it, and you smell a hidden fire: robbers lie in wait ahead. You stop before they see you, and can go round them.'
          : 'The way ahead runs through a place made for an ambush, and something there is not right: you stop short, and can go round it.');
        this.s.practice.flush();
        return;
      }
    }
    this.s.travel.stop();
    setTimeout(() => this.ambushed(id, [bx, by]), 0);
  }

  private ambushed(id: string, cell: [number, number]): void {
    if (this.s.state.mode !== 'travel' || this.s.state.dead) return;
    this.s.game.say('Figures rise from the cover beside the way: you are set upon!');
    this.s.strife.ambush = { band: id, until: this.s.game.time + 600 };
    this.s.people.ambushAt = cell;
    this.s.toLocal();
    this.s.people.ambushAt = null;
  }
}
