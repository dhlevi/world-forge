/**
 * The camp screen (Shift+C, or Camp on the travel map): choosing a site and making camp, then
 * everything done at it (wood, fire, shelter, food from the land, snares), the plan for the night,
 * and striking camp (game/camping.ts). From the travel map, the local map about the party is made
 * first, so that the camp is laid out on it as on foot.
 */
import { reactive } from 'vue';
import { Screen } from '../engine/screens';
import type { PlayScreen } from './play';
import type { Actor } from '../actors/actor';
import type { Moodlet } from '../actors/components';
import { seasonOf } from '../game/calendar';
import { findSites, type CampData, type ShelterKind, type SiteChoice } from '../game/camp';
import * as C from '../game/camping';
import { beddingAt } from './sleep';
import CampView from './views/CampView.vue';

/** Tiles searched for a site: on foot, and from the travel map. */
const SEARCH_FOOT = 40, SEARCH_TRAVEL = 80;
/** The hour from which the night can be settled. */
const EVENING = 18;
/** A camp this near (m) can be gone back to from here. */
const RETURN_M = 3000;

export interface CampAction {
  id: string;
  label: string;
  why?: string | null;
}

export class CampScreen extends Screen {
  readonly view = CampView;
  popup = true;
  readonly state = reactive({
    loading: false,
    choices: [] as SiteChoice[],
    message: '',
    version: 0,
    plan: { cook: true, mend: false, watch: 0, tend: true } as C.NightPlan,
    snares: 3,
  });
  readonly ctx: C.CampCtx;

  constructor(readonly play: PlayScreen, readonly actor: Actor) {
    super();
    const h = play.hooks!;
    this.ctx = {
      game: h.game(),
      actor,
      say: (t) => {
        h.say(t);
        this.state.message = t;
      },
      mood: (m: Moodlet, hours: number) => play.app.bus.send('actor.moodlet', { ...m, until: h.now() + hours * 3600 }, { to: actor.id }),
      season: () => seasonOf(h.now(), play.o.site.lat),
      sleep: (hours, quality, onHour) => h.sleep(hours, quality, { onHour }),
    };
  }

  get game() {
    return this.ctx.game;
  }

  /** The camp the wanderer is at, if any. */
  get camp(): CampData | undefined {
    void this.state.version;
    return this.game.camps.at(this.game.px, this.game.py);
  }

  /** A camp of theirs not far off, to go back to. */
  get away(): { camp: CampData; m: number } | null {
    void this.state.version;
    const n = this.game.camps.nearest(this.game.px, this.game.py);
    if (!n || this.camp) return null;
    const m = C.campDistance(this.game, n.camp);
    return m <= RETURN_M ? { camp: n.camp, m } : null;
  }

  enter(): void {
    if (!this.camp) void this.survey();
  }

  /** Looks about for sites (making the local map there first, from the travel map). */
  async survey(): Promise<void> {
    const h = this.play.hooks!;
    const travel = h.mode() === 'travel';
    const r = travel ? SEARCH_TRAVEL : SEARCH_FOOT;
    this.state.loading = true;
    const ok = await h.loadAround(r + 16);
    this.state.loading = false;
    if (!ok) {
      this.state.message = 'The land about is still taking shape; try again in a moment.';
      return;
    }
    this.state.choices = findSites(this.game, this.game.px, this.game.py, r, !travel);
    if (!this.state.choices.length) this.state.message = 'There is nowhere here to make camp: find open, dry ground out of doors.';
    this.bump();
  }

  private bump(): void {
    this.state.version++;
    this.play.hooks?.redraw();
  }

  choose(s: SiteChoice): void {
    C.makeCamp(this.ctx, s);
    this.state.choices = [];
    this.bump();
  }

  /** Walks back to a camp not far off. */
  goBack(): void {
    const a = this.away;
    if (!a) return;
    const g = this.game;
    g.time += Math.round(a.m / 1.25);
    g.activity = 'walk';
    g.px = a.camp.bedAt[0];
    g.py = a.camp.bedAt[1];
    g.updateHud();
    this.ctx.say(`You make your way back to your camp (${Math.max(1, Math.round(a.m / 75))} min).`);
    C.stackFirewood(this.ctx, a.camp);
    this.bump();
  }

  /** What can be done at the camp now, with why not where not. */
  actions(): CampAction[] {
    const c = this.camp;
    if (!c) return [];
    void this.state.version;
    const ctx = this.ctx;
    const out: CampAction[] = [{ id: 'wood', label: 'Gather firewood (an hour)', why: c.site.wood < 0.05 ? 'There is nothing here to burn.' : null }];
    if (c.fire.lit) {
      out.push({ id: 'feed', label: 'Build up the fire', why: c.wood < 0.5 ? 'There is no wood stacked.' : null });
      out.push({ id: 'douse', label: 'Put out the fire' });
    } else out.push({ id: 'light', label: 'Light the fire', why: C.whyNoFire(ctx, c) });
    const kinds: [ShelterKind, string][] = [['tent', 'Pitch your tent'], ['windbreak', 'Build a windbreak (40 min)'], ['lean_to', 'Build a lean-to (2 hours)']];
    for (const [k, label] of kinds) if (c.shelter?.kind !== k) out.push({ id: `shelter:${k}`, label, why: C.whyNoShelter(ctx, c, k) });
    if (c.shelter) out.push({ id: 'unshelter', label: c.shelter.kind === 'tent' ? 'Strike the tent' : 'Pull down the shelter' });
    out.push({ id: 'forage', label: 'Forage for food (an hour)', why: c.site.wood < 0.05 && ctx.season() === 'winter' ? 'Nothing grows here.' : null });
    const wire = C.wires(ctx);
    out.push({ id: 'snares', label: `Set snares (${Math.min(this.state.snares, wire) || 'none'}, a quarter hour each)`, why: wire ? (c.snares.length >= 6 ? 'You have set as many as you can watch over.' : null) : 'You have no snare wire.' });
    if (c.snares.length) {
      out.push({ id: 'check', label: 'Check the snares' });
      out.push({ id: 'unsnare', label: 'Take up the snares' });
    }
    if (this.tooEarly()) out.push({ id: 'evening', label: 'Wait until evening' });
    out.push({ id: 'strike', label: 'Strike camp' });
    return out;
  }

  act(id: string): void {
    const c = this.camp;
    if (!c) return;
    const ctx = this.ctx;
    let r: C.Result | null = null;
    if (id === 'wood') r = C.gatherWood(ctx, c);
    else if (id === 'light') r = C.lightFire(ctx, c);
    else if (id === 'feed') r = C.feedFire(ctx, c);
    else if (id === 'douse') r = C.putOutFire(ctx, c);
    else if (id.startsWith('shelter:')) r = C.putUpShelter(ctx, c, id.slice(8) as ShelterKind);
    else if (id === 'unshelter') C.takeDownShelter(ctx, c);
    else if (id === 'forage') r = C.forage(ctx, c);
    else if (id === 'snares') r = C.setSnares(ctx, c, this.state.snares);
    else if (id === 'check') r = C.checkSnares(ctx, c);
    else if (id === 'unsnare') C.takeUpSnares(ctx, c);
    else if (id === 'evening') {
      const g = this.game, day = 86400, at = Math.floor(g.time / day) * day + EVENING * 3600;
      const hours = Math.ceil((at - g.time) / 3600);
      // Sitting about the camp, one keeps the fire fed.
      c.fire.tend = c.fire.lit;
      if (hours > 0) this.play.hooks?.sleep(hours, 0.6, { awake: true });
      c.fire.tend = false;
    }
    else if (id === 'strike') {
      C.strikeCamp(ctx, c);
      this.bump();
      this.close();
      return;
    }
    if (r && !r.ok) this.state.message = r.text;
    this.bump();
  }

  /** What the night plan can include now. */
  nightOptions(): { cook: string | null; mend: string | null; tend: string | null } {
    const c = this.camp;
    void this.state.version;
    if (!c) return { cook: 'No camp.', mend: 'No camp.', tend: 'No camp.' };
    return {
      cook: !c.fire.lit ? 'The fire is out.' : !C.cookable(this.ctx).length ? 'You have nothing to cook.' : null,
      mend: C.mendable(this.ctx) ? null : 'Nothing you carry needs mending that you can mend.',
      tend: !c.fire.lit ? 'The fire is out.' : c.wood < 1 ? 'There is no wood stacked to keep it going.' : null,
    };
  }

  /** Why it is too early to settle for the night (or null). */
  tooEarly(): string | null {
    void this.state.version;
    const hour = (this.game.time % 86400) / 3600;
    if (hour >= EVENING || hour < 4) return null;
    const hh = String(Math.floor(hour)).padStart(2, '0'), mm = String(Math.floor((hour % 1) * 60)).padStart(2, '0');
    return `It is only ${hh}:${mm}; the night's camp is settled from ${EVENING}:00.`;
  }

  /** Settles for the night: the evening's tasks, the watch, sleep, and what comes. */
  night(): void {
    const c = this.camp;
    if (!c || this.tooEarly()) return;
    const opts = this.nightOptions();
    const plan = { ...this.state.plan, cook: this.state.plan.cook && !opts.cook, mend: this.state.plan.mend && !opts.mend, tend: this.state.plan.tend && !opts.tend };
    const bed = beddingAt(this.play, this.actor).quality;
    this.close();
    C.spendNight(this.ctx, c, plan, Math.min(0.85, bed));
    this.play.hooks?.redraw();
  }

  key(e: KeyboardEvent): boolean {
    if (e.code === 'Escape' || (e.code === 'KeyC' && e.shiftKey)) {
      this.close();
      return true;
    }
    return false;
  }
}
