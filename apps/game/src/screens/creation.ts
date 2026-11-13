/**
 * Character creation (docs/design/creation.md): origin, the fate cards, family, traits, the life
 * so far in occupation terms, and the finish (name and look), or the quick start that draws all
 * of it at once. The screen keeps the player's choices (actors/creation/resolve.ts `Choices`);
 * the view works the character out from them as they change.
 */
import { background } from '../app/errors';
import { reactive, shallowRef } from 'vue';
import { Screen } from '../engine/screens';
import type { GameApp } from '../app/app';
import type { Catalogue, PersonName } from '../worker/protocol';
import { newChoices, resolve, buildActor, type Choices, type CreationWorld, type Resolved } from '../actors/creation/resolve';
import { drawSpread, quickStart, rollStanding, withBirth } from '../actors/creation/random';
import { TRACK, type TrackId } from '../actors/data/occupations';
import type { TraitId } from '../actors/data/traits';
import { TRAIT_SPREAD } from '../actors/data/traits';
import CreationView from './views/CreationView.vue';
import { STEPS, type StepId } from './creation-steps';

export type { StepId };

const newSeed = () => Math.floor(Math.random() * 2 ** 31).toString(36);

export class CreationScreen extends Screen {
  readonly view = CreationView;
  readonly state = reactive({
    step: 'origin' as StepId,
    ready: false,
    error: '',
    /** The player's choices; everything else is worked out from them. */
    choices: null as Choices | null,
    /** A craft or school picked for the next term. */
    nextChoice: {} as Record<string, string>,
  });
  readonly catalogue = shallowRef<Catalogue | null>(null);
  readonly names = shallowRef<{ male: PersonName[]; female: PersonName[] } | null>(null);
  private namesKey = '';

  constructor(readonly app: GameApp, readonly siteId: string) {
    super();
  }

  enter(): void {
    background(this.load(), 'character creation');
  }

  private async load(): Promise<void> {
    try {
      const cat = await this.app.catalogue();
      this.catalogue.value = cat;
      const home = this.app.state.starts.find((s) => s.id === this.siteId) ?? this.app.state.starts[0];
      const culture = home.cultureIndex !== undefined && cat.cultures.some((c) => c.index === home.cultureIndex) ? home.cultureIndex : cat.cultures[0].index;
      const seed = newSeed();
      const r = Math.random;
      this.state.choices = newChoices(seed, culture, home.id, r() < 0.5, rollStanding(r, home.tier));
      await this.ensureNames();
      this.state.ready = true;
    } catch (err) {
      this.state.error = err instanceof Error ? err.message : String(err);
    }
  }

  /** The world as creation sees it. */
  world(): CreationWorld | null {
    const cat = this.catalogue.value;
    return cat ? { catalogue: cat, starts: this.app.state.starts, names: this.names.value } : null;
  }

  resolved(): Resolved | null {
    const w = this.world(), ch = this.state.choices;
    return w && ch ? resolve(ch, w) : null;
  }

  /** Names of the chosen culture, drawn from the character's seed. */
  private async ensureNames(): Promise<void> {
    const ch = this.state.choices;
    if (!ch) return;
    const key = `${ch.culture}|${ch.seed}`;
    if (key === this.namesKey) return;
    this.namesKey = key;
    let n: Awaited<ReturnType<typeof this.app.worker.names>>;
    try {
      n = await this.app.worker.names(ch.culture, `${this.app.state.worldSettings?.seed ?? ''}|${ch.seed}`, 48);
    } catch (err) {
      // Let the next change ask again.
      if (key === this.namesKey) this.namesKey = '';
      throw err;
    }
    if (key === this.namesKey) this.names.value = n;
  }

  private set(c: Partial<Choices>): void {
    if (!this.state.choices) return;
    this.state.choices = { ...this.state.choices, ...c };
  }

  // ---- Origin --------------------------------------------------------------------------------

  setCulture(ci: number): void {
    const ch = this.state.choices;
    if (!ch || ch.culture === ci) return;
    // Home moves to the nearest town of that people.
    const starts = this.app.state.starts;
    const cur = starts.find((s) => s.id === ch.homeId)!;
    const theirs = starts.filter((s) => s.cultureIndex === ci);
    const near = theirs.sort((a, b) => Math.hypot(a.lon - cur.lon, a.lat - cur.lat) - Math.hypot(b.lon - cur.lon, b.lat - cur.lat))[0];
    this.set({ culture: ci, homeId: near?.id ?? ch.homeId, name: 0, customName: undefined });
    background(this.ensureNames(), 'character creation');
  }

  setHome(id: string): void {
    this.set({ homeId: id });
  }

  setSex(female: boolean): void {
    this.set({ female, name: 0, look: { ...this.state.choices!.look, hairStyle: 0, beard: 0 } });
  }

  // ---- Family --------------------------------------------------------------------------------
  // The standing is the Birth card's (actors/creation/random.ts withBirth); the family itself can
  // be drawn again and the parents' trades chosen.

  rollFamily(): void {
    this.set({ family: this.state.choices!.family + 1, trades: undefined });
  }

  setTrades(father: string, mother: string): void {
    this.set({ trades: [father, mother] });
  }

  // ---- Fate ----------------------------------------------------------------------------------
  // The cards are drawn once, from the character's seed, and cannot be changed: fate is fate.

  drawCards(): void {
    const ch = this.state.choices!;
    if (ch.spread) return;
    this.set(withBirth({ ...ch, spread: drawSpread(ch.seed, 0), trades: undefined }));
  }

  get drawn(): boolean {
    return !!this.state.choices?.spread;
  }

  /** Whether a step can be visited yet: everything after Fate waits for the cards. */
  canGo(step: StepId): boolean {
    const fate = STEPS.findIndex((s) => s.id === 'fate');
    return this.drawn || STEPS.findIndex((s) => s.id === step) <= fate;
  }

  // ---- Traits --------------------------------------------------------------------------------

  /** Moves a trait one point up or down, within the budget and its range. */
  spend(t: TraitId, d: 1 | -1): void {
    const res = this.resolved();
    if (!res) return;
    const cur = this.state.choices!.spend[t] ?? 0;
    const next = cur + d;
    if (Math.abs(next) > TRAIT_SPREAD) return;
    if (d > 0 && res.spent >= res.budget) return;
    if (d < 0 && res.start[t] <= 3) return;
    this.set({ spend: { ...this.state.choices!.spend, [t]: next } });
  }

  resetTraits(): void {
    this.set({ spend: {} });
  }

  // ---- Life ----------------------------------------------------------------------------------

  addTerm(track: TrackId): void {
    const ch = this.state.choices!;
    const t = TRACK.get(track)!;
    const earlier = ch.terms.find((x) => x.track === track)?.choice;
    const choice = earlier ?? (t.choice ? this.state.nextChoice[track] ?? t.choice.options[0].id : undefined);
    this.set({ terms: [...ch.terms, { track, ...(choice ? { choice } : {}) }] });
  }

  removeTerm(): void {
    this.set({ terms: this.state.choices!.terms.slice(0, -1) });
  }

  // ---- Finish --------------------------------------------------------------------------------

  setName(i: number): void {
    this.set({ name: i, customName: undefined });
  }

  setCustomName(s: string): void {
    this.set({ customName: s });
  }

  cycleLook(k: keyof Choices['look'], d = 1): void {
    const l = this.state.choices!.look;
    this.set({ look: { ...l, [k]: Math.max(0, l[k] + d) } });
  }

  // ---- All at once ---------------------------------------------------------------------------

  /** The quick start: a whole new character at random, from a new seed, at the chosen home. */
  quick(): void {
    const w = this.world(), ch = this.state.choices;
    if (!w || !ch) return;
    const seed = newSeed();
    // Names first, so the character is named from the start.
    this.state.choices = { ...ch, seed };
    background(this.ensureNames().then(() => {
      const w2 = this.world()!;
      this.state.choices = quickStart(seed, ch.culture, ch.homeId, w2);
      this.state.step = 'finish';
    }), 'character creation');
  }

  go(step: StepId): void {
    if (this.canGo(step)) this.state.step = step;
  }

  next(d = 1): void {
    const i = STEPS.findIndex((s) => s.id === this.state.step);
    const j = Math.max(0, Math.min(STEPS.length - 1, i + d));
    this.go(STEPS[j].id);
  }

  begin(): void {
    const res = this.resolved();
    if (!res || !this.drawn) return;
    this.app.beginGame(buildActor(res), res.home.id);
  }

  key(e: KeyboardEvent): boolean {
    if (e.code === 'Escape') this.close();
    else return false;
    return true;
  }
}
