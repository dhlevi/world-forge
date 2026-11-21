/**
 * People in fights (docs/design/combat.md, stage 4): what residents and robbers do once a fight
 * has begun, with the wanderer or among themselves, acting in time order after each of the
 * wanderer's actions as the rest of the bubble does.
 *
 * - **Struck,** a person fights back (the watch to hold the wanderer for the law, a robber to kill,
 *   the brave and the angry with fists or a knife), or runs and calls for the watch.
 * - **In a fight** they close in, strike when beside the foe (at most twice for each of the
 *   wanderer's actions), and break off when their courage fails: the watch and the brave yield,
 *   the rest flee. Hurt enough, they fall senseless. A robber first demands the purse; the watch
 *   first calls on the wanderer to yield.
 * - **After:** the yielded and the fallen lie or kneel where they are until the wanderer deals
 *   with them (world/folk-fight.ts; the session's mercy: spare, rob, bind, tend, kill) or they come
 *   round and go home; those who fled go home once out of sight; the dead leave a body.
 * - **Brawls** between two people are fought the same way, with fists, until one yields or falls,
 *   and are broken up by the watch.
 *
 * The blows themselves, and what the wanderer does, are game/fights.ts's; the law
 * that follows a crime is world/law.ts's.
 */
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import { morale } from '../rules/combat';
import { Health } from '../actors/health';
import type { NaturalBlow } from '../rules/beasts';
import { callName, courage, folkFight, folkReady, folkSkills, healthOf, isWatch, type Intent } from './folk-fight';
import type { Population, PopulationView, Resident } from './population';
import { cap, cheb, clamp } from '../util';

/** The wanderer, as the people in a fight need them. */
export interface Wanderer {
  /** Asleep, senseless or bound: cannot fight back. */
  helpless: boolean;
  /** Has yielded (to robbers, or the law), and not fought on since. */
  yielded: boolean;
  /** When they last struck or shot at a person (game seconds). */
  struckAt?: number;
}


/** Minutes the yielded kneel before getting up and going home, if the wanderer leaves them be. */
const YIELD_S = 10 * 60;
/** Seconds a robber or the watch waits for an answer to their demand before striking. */
const ANSWER_S = 4;

export class Strife {
  /** A person's blow at the wanderer (the session works it out: game/combat.ts). */
  onStrike: (r: Resident, blow: NaturalBlow) => void = () => {};
  /** What is seen or heard to happen, for the log. */
  onSee: (text: string, at: Resident) => void = () => {};
  /** A person died (of their wounds, in a brawl): the session leaves the body and sees to the law. */
  onDied: (r: Resident) => void = () => {};
  /** A robber stands over the wanderer, helpless or yielded: they take what they want. */
  onRob: (r: Resident) => void = () => {};
  /** One of the watch stands over the wanderer, who has yielded or fallen: an arrest. */
  onArrest: (r: Resident) => void = () => {};
  /** Someone cries out for the watch (a victim, a witness): those of the watch near come. */
  onCallWatch: (r: Resident) => void = () => {};
  /** Blows struck this update, per person. */
  private blows = new Map<Resident, number>();

  /** Bands that have robbed the wanderer lately (their camp's id, and when): they let them pass for a day. */
  private robbedBy = new Map<string, number>();
  /** The last hour a tavern brawl was looked for. */
  private brawlHour = -1;
  /** A band lying in wait on the road (game/justice.ts): when its people come, they rise about the wanderer. */
  ambush: { band: string; until: number } | null = null;

  constructor(readonly pop: Population) {
    pop.onTemper = (r, g) => this.temper(r, g);
  }

  /** Shoved once too often: a hot-tempered or hardy person swings at the wanderer. Returns what is seen. */
  temper(r: Resident, g: PopulationView): string | null {
    if (r.p.age < 14 || r.fight || r.plight || isWatch(r)) return null;
    if (!(r.p.traits.includes('Wrathful') || courage(r) <= 0.5)) return null;
    this.start(r, 'brawl', 'player', g.time);
    r.fight!.began = true;
    return `"That is enough!" ${r.p.given} snarls, and swings at you.`;
  }

  /**
   * Who starts a fight, before the rest act: robbers who see the wanderer come to rob them (all
   * the band together); one who hates the wanderer, close by, may come at them with fists; and at
   * night in a tavern, drink starts a brawl now and then.
   */
  private lookout(g: PopulationView, w: Wanderer): void {
    this.springAmbush(g);
    for (const r of this.pop.all()) {
      if (r.fight || r.plight || (r.where === 'asleep' && cheb(r, g.px, g.py) > 2)) continue;
      if (r.p.template === 'bandit') this.bandSees(r, g);
      else this.hatred(r, g, w);
    }
    this.tavernBrawl(g);
  }

  /** An ambush on the road (game/justice.ts sets it): once the band's people have come, they rise from cover about the wanderer. */
  private springAmbush(g: PopulationView): void {
    const am = this.ambush;
    if (!am) return;
    if (g.time >= am.until) {
      this.ambush = null;
      return;
    }
    const band = [...this.pop.everyone()].filter((o) => o.p.homeId === am.band && o.p.template === 'bandit' && !o.plight && !o.fight);
    if (!band.length) return;
    this.ambush = null;
    const roll = mulberry32(hashString(`${am.band}#ambush`));
    let n = 0;
    for (const o of band) {
      if (!this.pop.setNear(o, g, { x: g.px, y: g.py, z: g.z }, 3, 7, roll)) continue;
      this.start(o, 'rob', 'player', g.time);
      o.fight!.began = true;
      n++;
    }
    if (n) this.onSee(`Robbers! ${n > 1 ? `${n} of them rise` : 'One rises'} from the cover by the way, and close about you.`, band[0]);
  }

  /** A robber who sees the wanderer near brings the whole band to rob them (unless the band robbed them within the day). */
  private bandSees(r: Resident, g: PopulationView): void {
    const band = r.p.homeId;
    const was = this.robbedBy.get(band);
    if (was !== undefined && g.time - was < 86400) return;
    if (cheb(r, g.px, g.py) > 14 || g.z !== r.z || !g.isVisible(r.x, r.y)) return;
    let n = 0;
    for (const o of this.pop.all()) if (o.p.homeId === band && !o.fight && !o.plight && o.p.template === 'bandit') {
      this.start(o, 'rob', 'player', g.time);
      o.fight!.began = true;
      n++;
    }
    this.onSee(n > 1 ? `Robbers! ${n} of them come at you from about their camp.` : `${cap(callName(r, this.pop.opinions))} comes at you, a weapon in hand.`, r);
  }

  /** One who hates the wanderer (an opinion of -50 or worse), close by and with the nerve for it: now and then (a minute's chance), a fist. */
  private hatred(r: Resident, g: PopulationView, w: Wanderer): void {
    if (cheb(r, g.px, g.py) > 2 || w.helpless || r.p.age < 14 || isWatch(r) || r.where === 'asleep' || this.pop.opinions.of(r.p.id, g.time) > -50) return;
    const roll = mulberry32(hashString(`${r.p.id}#hate#${Math.floor(g.time / 60)}`))();
    if (roll >= 0.2 || !(courage(r) <= 0.5 || r.p.traits.includes('Wrathful'))) return;
    this.start(r, 'brawl', 'player', g.time);
    r.fight!.began = true;
    if (g.isVisible(r.x, r.y)) this.onSee(`${cap(callName(r, this.pop.opinions))} spits, and comes at you with fists.`, r);
  }

  /** A tavern brawl: looked for once an hour, from dusk to the small hours, among four or more drinking; the quarrelsome start it with whoever is nearest. */
  private tavernBrawl(g: PopulationView): void {
    const hour = Math.floor(g.time / 3600), h = hour % 24;
    if (hour === this.brawlHour || (h < 20 && h > 1)) return;
    this.brawlHour = hour;
    const drinking = [...this.pop.all()].filter((r) => r.stop?.place === 'tavern' && r.where === 'leisure' && !r.fight && !r.plight && r.p.age >= 16);
    if (drinking.length < 4) return;
    const rr = mulberry32(hashString(`brawl#${hour}#${drinking[0].p.homeId}`));
    if (rr() >= 0.12) return;
    const hot = drinking.filter((r) => r.p.traits.includes('Wrathful') || courage(r) <= 0.5);
    const a = (hot.length ? hot : drinking)[Math.floor(rr() * (hot.length || drinking.length))];
    const b = drinking.filter((o) => o !== a && o.z === a.z && cheb(o, a.x, a.y) <= 5).sort((p, q) => cheb(p, a.x, a.y) - cheb(q, a.x, a.y))[0];
    if (a && b) this.brawl(a, b, g);
  }


  /** Begins a person's fight (drawing a weapon if they mean to use one). */
  start(r: Resident, intent: Intent, foe: string, now: number): void {
    const was = r.fight;
    r.fight = { intent, foe, since: now, hits: was?.hits ?? 0, said: was?.said ?? -1e9, stance: intent === 'kill' || intent === 'rob' ? 'aggressive' : intent === 'defend' ? 'defensive' : 'balanced', warned: was?.warned };
    r.plight = undefined;
    r.where = 'fighting';
    r.path = null;
    r.nextAt = Math.max(r.nextAt, now) + folkReady(r, intent);
    healthOf(r, now);
  }

  /**
   * The wanderer has struck a person (who was not already fighting them): they fight back, or run
   * crying for the watch. `armed`: the blow was with a weapon (fists are answered with fists).
   */
  provoke(r: Resident, g: PopulationView, armed: boolean): void {
    const h = healthOf(r, g.time);
    r.harmedBy = 'player';
    if (h.dead || r.plight === 'down' || r.plight === 'bound') return;
    if (r.fight?.foe === 'player') return;
    if (r.where === 'asleep') r.where = 'home';
    const brave = courage(r) < 0.5 || r.p.traits.includes('Wrathful');
    if (isWatch(r)) this.start(r, 'arrest', 'player', g.time);
    else if (r.p.template === 'bandit') this.start(r, 'kill', 'player', g.time);
    else if (brave && morale(h) >= courage(r) && r.p.age >= 14) this.start(r, armed ? 'defend' : 'brawl', 'player', g.time);
    else {
      this.flee(r, g);
      this.onCallWatch(r);
    }
  }

  /**
   * Those who saw the wanderer set on someone (game/justice.ts, a crime): the watch among them
   * come to arrest; the bold (and the victim's household, kin and friends, who need less courage)
   * come to their aid, two at most, with fists against fists and whatever they have against a
   * blade; the rest scatter, crying for the watch; children run. Returns how many cried out.
   */
  witnessed(seen: Resident[], victim: Resident, g: PopulationView, armed: boolean): number {
    const close = (w: Resident) => w.p.homeId === victim.p.homeId || w.p.ties.some((t) => ['friend', 'kin', 'sweetheart', 'partner'].includes(t.kind) && t.text.includes(victim.p.name));
    let helpers = 0, criers = 0;
    const told: string[] = [];
    for (const w of [...seen].sort((a, b) => cheb(a, victim.x, victim.y) - cheb(b, victim.x, victim.y))) {
      if (w.fight || w.plight || w === victim) continue;
      // "A man", for one the wanderer does not know; the victim by name, or as the one struck.
      const d = cheb(w, victim.x, victim.y), known = callName(w, this.pop.opinions), name = /^the (man|woman|boy|girl)$/.test(known) ? `A ${known.slice(4)}` : cap(known);
      const vk = callName(victim, this.pop.opinions), vname = /^the (man|woman|boy|girl)$/.test(vk) ? `the ${vk.slice(4)} you struck` : vk;
      if (isWatch(w)) {
        this.start(w, 'arrest', 'player', g.time);
        continue;
      }
      if (w.p.age < 14) {
        this.flee(w, g, false);
        if (g.isVisible(w.x, w.y) && told.length < 2) told.push(`${name} runs off, wailing.`);
        continue;
      }
      const kin = close(w);
      const nerve = courage(w) - (kin ? 0.25 : 0) - (w.p.traits.includes('Wrathful') ? 0.1 : 0);
      // Against a blade it takes more nerve, and the hardy and the watch's kind first.
      const bold = nerve <= (armed ? 0.3 : 0.45) || (kin && nerve <= 0.5);
      if (bold && helpers < 2 && d <= 10 && morale(healthOf(w, g.time)) >= courage(w)) {
        this.start(w, armed ? 'defend' : 'brawl', 'player', g.time);
        w.fight!.began = true;
        w.fight!.rescue = victim.p.id;
        helpers++;
        if (told.length < 3) told.push(`${name} rushes to help ${vname}!`);
        continue;
      }
      if (d <= 12) {
        this.flee(w, g, false);
        criers++;
        if (criers === 1 && told.length < 3 && g.isVisible(w.x, w.y)) told.push(`${name} runs, crying for the watch.`);
      }
    }
    if (criers > 1) told.push(criers > 3 ? 'People scatter on every side, crying for the watch.' : 'Others scatter, crying for the watch.');
    for (const t of told) this.onSee(t, victim);
    return criers;
  }

  /** Runs from the wanderer (and, out of sight, goes home); `cry`: told, crying for the watch if they would (not when let go). */
  flee(r: Resident, g: PopulationView, cry = true): void {
    r.fight = null;
    r.plight = 'fleeing';
    r.plightAt = g.time;
    r.where = 'walking';
    if (cry && g.isVisible(r.x, r.y)) this.onSee(`${cap(callName(r, this.pop.opinions))} runs${r.p.age >= 14 && r.p.template !== 'bandit' ? ', crying for the watch' : ''}.`, r);
  }

  /** Gives up: kneels, hands up, and begs for mercy. */
  yieldUp(r: Resident, g: PopulationView): void {
    r.fight = null;
    r.plight = 'yielded';
    r.plightAt = g.time;
    r.where = 'yielded';
    if (g.isVisible(r.x, r.y)) this.onSee(`${cap(callName(r, this.pop.opinions))} throws up ${r.p.female ? 'her' : 'his'} hands and begs for mercy.`, r);
  }

  /** The wanderer yields: robbers take what they want, the watch makes the arrest, a brawl ends. */
  wandererYields(_g: PopulationView): string[] {
    const out: string[] = [];
    for (const r of this.pop.everyone()) {
      const f = r.fight;
      if (!f || f.foe !== 'player') continue;
      if (f.intent === 'brawl' || f.intent === 'defend') {
        this.pop.release(r);
        out.push(`${cap(callName(r, this.pop.opinions))} spits, and lets you be.`);
      } else if (f.intent === 'kill' && r.p.template === 'bandit') f.intent = 'rob';
    }
    return out;
  }

  /** Everyone out of the ordinary run of their day acts up to the game's time. Returns whether anyone shown changed. */
  run(g: PopulationView, w: Wanderer): boolean {
    this.blows.clear();
    this.lookout(g, w);
    let changed = false;
    for (const r of [...this.pop.everyone()]) {
      if (!r.present || (!r.fight && !r.plight)) continue;
      if (r.nextAt < g.time - 60) r.nextAt = g.time - 60;
      const h = r.actor.get(Health) ? healthOf(r, g.time) : null;
      if (h) {
        h.advance(g.time - h.time, {}, g.time);
        if (h.dead) {
          this.onDied(r);
          this.pop.kill(r);
          changed = true;
          continue;
        }
        if (h.senseless() && r.plight !== 'down' && r.plight !== 'bound') {
          r.fight = null;
          r.plight = 'down';
          r.plightAt = g.time;
          r.where = 'down';
          if (g.isVisible(r.x, r.y)) this.onSee(`${cap(callName(r, this.pop.opinions))} falls, and lies still.`, r);
          changed = true;
          continue;
        }
      }
      if (r.plight) {
        if (this.after(r, g, h)) changed = true;
        continue;
      }
      if (r.fight) {
        if (r.fight.foe === 'player' ? this.fightWanderer(r, g, w) : this.fightOther(r, g)) changed = true;
      }
    }
    return changed;
  }

  /** The yielded, the fallen, the bound and the fleeing. */
  private after(r: Resident, g: PopulationView, h: ReturnType<typeof healthOf> | null): boolean {
    const since = g.time - (r.plightAt ?? g.time);
    switch (r.plight) {
      case 'fleeing': {
        let moved = false;
        for (let n = 0; n < 40 && r.nextAt <= g.time; n++) {
          if (cheb(r, g.px, g.py) > 25 || (!g.isVisible(r.x, r.y) && since > 20)) {
            this.pop.release(r);
            return true;
          }
          if (this.pop.stepToward(r, g, { x: g.px, y: g.py }, true)) moved = true;
          r.nextAt += 0.8 / Math.max(0.2, h?.capacities().moving ?? 1);
        }
        return moved;
      }
      case 'yielded':
        // Left be, they get up and go home (and say nothing of it, mostly).
        if (since > YIELD_S && cheb(r, g.px, g.py) > 2) {
          this.pop.release(r);
          return true;
        }
        return false;
      case 'down':
        // Come round: kneel, yielded (the fight is out of them).
        if (h && !h.senseless() && h.capacities().consciousness > 0.4) {
          r.plight = 'yielded';
          r.plightAt = g.time;
          r.where = 'yielded';
          if (g.isVisible(r.x, r.y)) this.onSee(`${cap(callName(r, this.pop.opinions))} comes round, groaning.`, r);
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  /** A person in a fight with the wanderer: breaks, yields, demands, closes in, strikes. */
  private fightWanderer(r: Resident, g: PopulationView, w: Wanderer): boolean {
    const f = r.fight!, h = healthOf(r, g.time), fight = folkFight(r, f.intent);
    let moved = false;
    for (let n = 0; n < 60 && r.nextAt <= g.time; n++) {
      const d = cheb(r, g.px, g.py);
      // Courage gone: the watch and the brave yield (when close), the rest flee.
      const m = morale(h);
      if (m < fight.breaks * (isWatch(r) ? 0.6 : 1)) {
        if ((isWatch(r) || d <= 1) && r.p.template !== 'bandit') this.yieldUp(r, g);
        else this.flee(r, g);
        return true;
      }
      // Those who came to another's aid, and brawlers who have had their say, stop once the
      // wanderer stops: the rescuers hold them at bay, then leave them to the watch.
      if (f.rescue || (f.intent === 'brawl' && f.began)) {
        const calm = g.time - (w.struckAt ?? -1e9);
        const watch = f.rescue && [...this.pop.all()].some((o) => isWatch(o) && o.fight?.foe === 'player' && cheb(o, g.px, g.py) <= 6);
        if (watch || (calm > 8 && !f.rescue && f.hits >= 3) || (calm > 150 && f.rescue)) {
          this.pop.release(r);
          if (g.isVisible(r.x, r.y)) this.onSee(f.rescue ? `${cap(callName(r, this.pop.opinions))} ${watch ? 'leaves you to the watch' : 'backs away, watching you'}.` : `${cap(callName(r, this.pop.opinions))} spits, and lets you be.`, r);
          return true;
        }
        if (f.rescue && calm > 8) {
          // Ready, between the wanderer and the one they came to help, but no blow while the wanderer keeps still.
          r.nextAt = g.time + 1;
          break;
        }
      }
      // The watch, called, come from farther off; the rest give up a foe gone out of reach.
      if (g.z !== r.z || d > (f.intent === 'arrest' ? 80 : 30)) {
        this.pop.release(r);
        return true;
      }
      // The wanderer has yielded or fallen: the robber robs, the watch arrests, the rest are done.
      if ((w.yielded || w.helpless) && (d <= 1 || (w.helpless && d <= 2 && this.pop.reachable(g, r, { x: g.px, y: g.py })))) {
        if (f.intent === 'rob' || (f.intent === 'kill' && r.p.template === 'bandit')) {
          this.onRob(r);
          this.robbedBy.set(r.p.homeId, g.time);
          // The rest of the band go with them.
          for (const o of this.pop.everyone()) if (o !== r && o.p.homeId === r.p.homeId && o.fight?.foe === 'player') this.flee(o, g, false);
          this.flee(r, g, false);
          return true;
        }
        if (f.intent === 'arrest') {
          this.pop.release(r);
          this.onArrest(r);
          return true;
        }
        if (f.intent === 'brawl' || f.intent === 'defend') {
          this.pop.release(r);
          if (g.isVisible(r.x, r.y)) this.onSee(`${cap(callName(r, this.pop.opinions))} stands over you, then turns away.`, r);
          return true;
        }
      }
      // Within reach of a blow (a spear's two tiles, past one between, if the way is not walled);
      // but to take a purse or a prisoner, they come close.
      const taking = (w.yielded || w.helpless) && (f.intent === 'rob' || f.intent === 'arrest' || f.intent === 'kill');
      const reach = taking ? 1 : Math.max(...fight.blows.map((b) => b.reach ?? 1));
      if (d <= 1 || (d <= reach && this.pop.reachable(g, r, { x: g.px, y: g.py }))) {
        // A demand first: the purse, or to yield to the law.
        if (!f.warned && (f.intent === 'rob' || f.intent === 'arrest')) {
          f.warned = true;
          f.said = g.time;
          // One of a band (or of the watch) speaks for them all.
          const spoken = [...this.pop.everyone()].some((o) => o !== r && o.fight?.foe === 'player' && o.fight.intent === f.intent && o.fight.warned && (f.intent === 'arrest' || o.p.homeId === r.p.homeId));
          if (spoken) {
            r.nextAt = g.time + ANSWER_S;
            return true;
          }
          this.onSee(f.intent === 'rob' ? `"Your purse, and be quick about it!" says ${callName(r, this.pop.opinions)}. (Yield to hand it over.)` : `"Yield, in the name of the law!" cries ${callName(r, this.pop.opinions)}. (Yield to go quietly.)`, r);
          r.nextAt = g.time + ANSWER_S;
          return true;
        }
        const used = this.blows.get(r) ?? 0;
        if (used >= 2) {
          r.nextAt = g.time + 0.5;
          break;
        }
        this.blows.set(r, used + 1);
        const rr = mulberry32(hashString(`${r.p.id}#blow#${Math.floor(g.time * 10)}`))();
        const can = fight.blows.filter((b) => (b.reach ?? 1) >= d);
        const blow = can[Math.floor(rr * can.length)] ?? fight.blows[0];
        r.facing = Math.abs(g.px - r.x) >= Math.abs(g.py - r.y) ? (g.px > r.x ? 'e' : 'w') : g.py > r.y ? 's' : 'n';
        const before = r.fight;
        this.onStrike(r, blow);
        if (r.fight === before && r.fight) r.fight.hits++;
        r.nextAt += blow.seconds / Math.max(0.4, Math.min(1, h.capacities().moving + 0.3));
        continue;
      }
      if (this.pop.chase(r, g, { x: g.px, y: g.py, z: g.z })) moved = true;
      else r.nextAt += 0.6;
      r.nextAt += 0.9 / Math.max(0.2, h.capacities().moving);
    }
    return moved;
  }

  /**
   * Starts a brawl between two people (a tavern quarrel): fists, until one yields or falls. Told if
   * seen.
   */
  brawl(a: Resident, b: Resident, g: PopulationView): void {
    this.start(a, 'brawl', b.p.id, g.time);
    this.start(b, 'brawl', a.p.id, g.time);
    if (g.isVisible(a.x, a.y) || g.isVisible(b.x, b.y)) this.onSee(`${cap(callName(a, this.pop.opinions))} and ${callName(b, this.pop.opinions)} come to blows!`, a);
  }

  /** A person fighting another: fists, in time order; the one whose courage fails yields. */
  private fightOther(r: Resident, g: PopulationView): boolean {
    const f = r.fight!;
    const o = [...this.pop.everyone()].find((x) => x.p.id === f.foe);
    if (!o || !o.present || !o.fight || o.plight) {
      this.pop.release(r);
      return true;
    }
    // The watch near breaks it up.
    for (const w of this.pop.all()) {
      if (w !== r && w !== o && isWatch(w) && !w.fight && cheb(w, r.x, r.y) <= 3 && w.where !== 'asleep') {
        this.pop.release(r);
        this.pop.release(o);
        if (g.isVisible(r.x, r.y)) this.onSee(`${cap(callName(w, this.pop.opinions))} pulls them apart.`, w);
        return true;
      }
    }
    const h = healthOf(r, g.time), ho = healthOf(o, g.time);
    let moved = false;
    for (let n = 0; n < 20 && r.nextAt <= g.time; n++) {
      if (morale(h) < courage(r)) {
        this.yieldUp(r, g);
        this.pop.release(o);
        return true;
      }
      if (cheb(r, o.x, o.y) > 1) {
        if (this.pop.chase(r, g, o)) moved = true;
        r.nextAt += 1.2;
        continue;
      }
      // A punch: skill against their dodging; a bruise where it lands.
      const rr = mulberry32(hashString(`${r.p.id}#brawl#${Math.floor(g.time * 10)}`));
      const s = folkSkills(r), so = folkSkills(o);
      const chance = clamp(50 + 1.5 * (s.unarmed - so.dodge * 0.7), 10, 90);
      if (rr() * 100 < chance) {
        const part = rr() < 0.4 ? 'head' : rr() < 0.5 ? 'torso' : rr() < 0.5 ? 'arm.l' : 'arm.r';
        ho.hurt({ kind: 'bruise', sev: 1 + rr() * 2.5, part, cause: `${r.p.name}'s fist`, now: g.time });
      }
      r.nextAt += 1.1;
    }
    return moved;
  }
}

