/**
 * The city view (docs/design/navigation.md, Cities and towns): a town or city seen as its
 * illustrated plan with its places of note. The party goes from place to place (time passes by
 * the distance walked), does what each place offers in a short menu scene, walks in on the local
 * map anywhere, or leaves by a gate.
 */
import { reactive, shallowRef } from 'vue';
import { Screen } from '../engine/screens';
import { LocalFrame } from '@worldforge/core/towns/plan';
import type { PlanImage, SiteInfo, SitePlace } from '../worker/protocol';
import type { PlayScreen } from './play';
import { moneyText, type Moodlet } from '../actors/components';
import { Inventory } from '../actors/items/inventory';
import CityView from './views/CityView.vue';
import { ShopScreen } from './shop';

/** Walking pace in a town (m/s), and how much longer the streets make a straight line. */
const PACE = 1.25, WINDING = 1.3;

export interface SceneAction {
  id: string;
  label: string;
  disabled?: string;
}

export const KIND_NAMES: Record<SitePlace['kind'], string> = {
  gate: 'Gates and ways in', market: 'Markets', inn: 'Inns', tavern: 'Taverns', temple: 'Temples and shrines', keep: 'The keep',
  civic: 'Halls and buildings of the town', guild: 'Guilds and orders', shop: 'Workshops and shops', dock: 'The waterfront', district: 'Districts',
};
export const KIND_ORDER: SitePlace['kind'][] = ['gate', 'market', 'inn', 'tavern', 'temple', 'keep', 'guild', 'civic', 'shop', 'dock', 'district'];

export class CityScreen extends Screen {
  readonly view = CityView;
  readonly image = shallowRef<PlanImage | null>(null);
  readonly state = reactive({
    /** Where the party is now (a place id). */
    at: '',
    /** The place chosen on the map or in the list. */
    selected: '',
    /** The scene's lines, after arriving or acting. */
    scene: [] as string[],
    loading: true,
  });
  private frame: LocalFrame;

  constructor(readonly play: PlayScreen, readonly site: SiteInfo, at: { lon: number; lat: number }) {
    super();
    this.frame = new LocalFrame(site.lon, site.lat);
    this.state.at = this.nearest(at.lon, at.lat)?.id ?? '';
    this.state.selected = this.state.at;
  }

  enter(): void {
    const s = this.site;
    // Enough to take in every place of note, and the walls with some country about them.
    const far = Math.max(0, ...s.places.map((p) => this.metres(s.lon, s.lat, p.lon, p.lat)));
    const radius = Math.min(s.radiusM * 1.02, Math.max(300, s.coreM * 1.5 + 250, far + 300));
    const mpp = Math.max(0.8, Math.min(2.5, (radius * 2) / 2600));
    void this.play.app.worker.plan(s.id, { mpp, radius, illustrated: true, lon: s.lon, lat: s.lat }).then((img) => {
      this.image.value = img;
      this.state.loading = false;
    });
    const here = this.place(this.state.at);
    this.state.scene = here ? this.describe(here) : [];
  }

  place(id: string): SitePlace | undefined {
    return this.site.places.find((p) => p.id === id);
  }

  nearest(lon: number, lat: number): SitePlace | undefined {
    let best: SitePlace | undefined, bd = Infinity;
    for (const p of this.site.places) {
      const d = this.metres(p.lon, p.lat, lon, lat);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  metres(alon: number, alat: number, blon: number, blat: number): number {
    const a = this.frame.fromLL(alon, alat), b = this.frame.fromLL(blon, blat);
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  /** Minutes on foot from where the party is to a place. */
  minutesTo(p: SitePlace): number {
    const here = this.place(this.state.at);
    if (!here) return 0;
    return Math.round((this.metres(here.lon, here.lat, p.lon, p.lat) * WINDING) / PACE / 60);
  }

  select(id: string): void {
    this.state.selected = id;
  }

  /** Walks to a place: time passes, and its scene opens. */
  go(id: string): void {
    const p = this.place(id);
    if (!p || id === this.state.at) return;
    const min = this.minutesTo(p);
    this.play.advance(min * 60);
    this.state.at = id;
    this.state.selected = id;
    this.play.say(`You make your way to ${p.name}${min ? ` (${min} min)` : ''}.`);
    this.state.scene = this.describe(p);
  }

  private describe(p: SitePlace): string[] {
    const where = p.quarter ? ` in ${p.quarter}` : '';
    const lines = [`${p.name}${where}.`, p.about];
    if (p.kind === 'market') lines.push('Stallholders cry their wares; the crowd presses close.');
    if (p.kind === 'gate') lines.push(this.site.walls ? 'Guards watch who comes and goes.' : 'The road runs on into the country.');
    return lines.filter(Boolean);
  }

  // ---- What a place offers -------------------------------------------------------------------

  private copper(): number {
    return this.play.player?.get(Inventory)?.d.copper ?? 0;
  }

  private pay(c: number): boolean {
    const inv = this.play.player?.get(Inventory);
    if (!inv || inv.d.copper < c) return false;
    inv.d.copper -= c;
    return true;
  }

  private mood(m: Moodlet): void {
    const p = this.play.player;
    if (p) this.play.app.bus.send('actor.moodlet', m, { to: p.id });
  }

  actions(): SceneAction[] {
    const p = this.place(this.state.at);
    if (!p) return [];
    const broke = (c: number) => (this.copper() < c ? `You have ${moneyText(this.copper())}.` : undefined);
    const out: SceneAction[] = [];
    if (p.kind === 'inn') {
      out.push({ id: 'meal', label: 'Take a hot meal (4 copper)', disabled: broke(4) });
      out.push({ id: 'room', label: 'Take a room for the night (1 silver)', disabled: broke(10) });
      out.push({ id: 'news', label: 'Ask the travellers for news' });
    } else if (p.kind === 'tavern') {
      out.push({ id: 'drink', label: 'Buy a drink (2 copper)', disabled: broke(2) });
      out.push({ id: 'news', label: 'Listen to the talk' });
    } else if (p.kind === 'temple') {
      out.push({ id: 'pray', label: 'Pray a while' });
    } else if (p.kind === 'market' || p.kind === 'shop') {
      out.push({ id: 'trade', label: 'Look over the goods (buy)' });
    } else if (p.kind === 'gate') {
      out.push({ id: 'leave', label: 'Leave the town by this way' });
    }
    out.push({ id: 'look', label: 'Look around' });
    out.push({ id: 'walk', label: 'Walk in (the local map)' });
    return out;
  }

  act(id: string): void {
    const p = this.place(this.state.at);
    if (!p) return;
    const now = this.play.now();
    const say = (t: string) => {
      this.state.scene = [...this.describe(p), t];
      this.play.say(t);
    };
    switch (id) {
      case 'meal':
        if (!this.pay(4)) return;
        this.play.advance(45 * 60);
        this.mood({ id: 'hot-meal', text: 'Had a hot meal', value: 2, until: now + 6 * 3600 });
        say('A bowl of stew, bread and small beer, eaten by the fire.');
        break;
      case 'room': {
        if (!this.pay(10)) return;
        // Sleep until seven in the morning (at least six hours).
        const day = 86400, seven = 7 * 3600;
        let wake = Math.floor(now / day) * day + seven;
        while (wake < now + 6 * 3600) wake += day;
        this.play.advance(wake - now);
        this.mood({ id: 'slept-bed', text: 'Slept in a bed', value: 3, until: wake + 12 * 3600 });
        say('You sleep in a narrow bed under the eaves, and wake rested.');
        break;
      }
      case 'drink':
        if (!this.pay(2)) return;
        this.play.advance(30 * 60);
        this.mood({ id: 'drink', text: 'A drink in good company', value: 1, until: now + 3 * 3600 });
        say('The ale is thin but welcome.');
        break;
      case 'news':
        this.play.advance(30 * 60);
        say('People talk of prices, weather and their neighbours. (Rumours of places and troubles are still to come.)');
        break;
      case 'pray':
        this.play.advance(20 * 60);
        this.mood({ id: 'prayed', text: 'Prayed', value: 1, until: now + 86400 });
        say('You kneel a while in the quiet.');
        break;
      case 'trade':
        this.play.advance(5 * 60);
        this.manager?.push(new ShopScreen(this.play, p, this.site.culture));
        break;
      case 'look':
        this.play.advance(5 * 60);
        say(this.lookAround(p));
        break;
      case 'walk':
        // After this input event is done with (the map underneath takes over the screen).
        setTimeout(() => {
          this.play.toLocalAt(p.lon, p.lat);
          this.close();
        }, 0);
        break;
      case 'leave':
        this.leaveTown();
        break;
    }
  }

  private lookAround(p: SitePlace): string {
    const near = this.site.places.filter((q) => q.id !== p.id && this.metres(p.lon, p.lat, q.lon, q.lat) < 250).slice(0, 4).map((q) => q.name);
    return near.length ? `Nearby: ${near.join(', ')}.` : 'Nothing else of note stands close by.';
  }

  /** Leaves the town by the way in nearest the party, onto the travel map. */
  leaveTown(): void {
    // After the click that asked for it (the map underneath takes over the screen).
    setTimeout(() => this.doLeave(), 0);
  }

  private doLeave(): void {
    const here = this.place(this.state.at);
    const gates = this.site.places.filter((q) => q.kind === 'gate');
    let g = here?.kind === 'gate' ? here : undefined;
    if (!g && here) {
      let bd = Infinity;
      for (const q of gates) {
        const d = this.metres(here.lon, here.lat, q.lon, q.lat);
        if (d < bd) {
          bd = d;
          g = q;
        }
      }
      if (g) this.play.advance(this.minutesTo(g) * 60);
    }
    const at = g ?? { lon: this.site.lon, lat: this.site.lat };
    this.play.say(`You leave ${this.site.name}.`);
    this.play.toTravelAt(at.lon, at.lat);
    this.close();
  }
}
