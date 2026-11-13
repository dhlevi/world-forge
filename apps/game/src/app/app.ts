/**
 * The game as a whole: the messaging service, the screen stack, the world worker, saved games
 * and the desktop app's remembered settings, and the way from one screen to the next (the title,
 * making a world, choosing where to begin, making a character, playing).
 */
import { reactive, shallowRef } from 'vue';
import { type WorldSettings } from '@worldforge/core/settings';
import { readWorldFile } from '@worldforge/core/export/worldfile';
import { GENERATOR_VERSION } from '@worldforge/core/version';
import { MessageDispatcher } from '../engine/messages';
import { ScreenManager } from '../engine/screens';
import { WorkerClient } from './worker-client';
import { loadMods, type ModReport } from './mods';
import { desktop, readJson, writeJson, type DesktopInfo } from '../desktop';
import { deleteSave, listSaves, loadSave, readSave, versionNote, writeSave, newGameId, type SaveFile, type SaveSummary } from '../game/save';
import type { Catalogue, StartSite, WorldSummary } from '../worker/protocol';
import type { Actor } from '../actors/actor';
import { TitleScreen, LoadScreen, SetupScreen, ProgressScreen, StartScreen } from '../screens/menus';
import { CreationScreen } from '../screens/creation';
import { PlayScreen } from '../screens/play';

/** The published atlas, to open the same world in for a closer look. */
export const ATLAS_URL = 'https://dhlevi.github.io/world-forge/';

interface Remembered {
  settings?: WorldSettings;
  start?: { seed: string; id: string };
}

export class GameApp {
  readonly bus = new MessageDispatcher();
  readonly screens = new ScreenManager();
  readonly worker = new WorkerClient(this.bus);

  /** What the menus show. */
  readonly state = reactive({
    settings: { seed: 'forge', landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 512 } as WorldSettings,
    /** The settings the current world was made with (the form may have changed since). */
    worldSettings: null as WorldSettings | null,
    starts: [] as StartSite[],
    summary: null as WorldSummary | null,
    saves: [] as SaveSummary[],
    info: null as DesktopInfo | null,
    error: '',
    note: '',
    /** Where the atlas was looking, from a world file. */
    viewCentre: null as [number, number] | null,
    remembered: {} as Remembered,
    /** Mods read at start (app/mods.ts). */
    mods: null as ModReport | null,
  });
  /** The world's peoples and realms, once asked for (character creation). */
  private catalogueP: Promise<Catalogue> | null = null;
  /** A saved game being loaded: the world is made from its settings, then it is restored. */
  private loading = shallowRef<SaveFile | null>(null);

  constructor() {
    this.bus.on('world.error', ({ message }) => {
      this.state.error = message;
      this.loading.value = null;
      if (this.screens.top instanceof ProgressScreen) {
        if (this.state.starts.length) this.screens.switchTo(new StartScreen(this));
        else this.screens.switchTo(new SetupScreen(this));
      }
    });
    this.bus.on('world.ready', (w) => this.worldReady(w.starts, w.summary));
    if (desktop) {
      void desktop.info().then((i) => (this.state.info = i));
      void readJson<Remembered>('settings.json', {}).then((r) => {
        this.state.remembered = r;
        if (r.settings) this.state.settings = { ...this.state.settings, ...r.settings };
      });
      desktop.onMenu((what) => {
        const top = this.screens.top;
        if (what !== 'open-world' || top instanceof PlayScreen || top instanceof ProgressScreen) return;
        this.newGame();
        void this.openWorldFile();
      });
    }
  }

  start(): void {
    void this.refreshSaves();
    this.screens.start();
    // Mods first (they are local files, and quick): saves and characters may use their items.
    void loadMods()
      .catch((e: Error): ModReport => ({ loaded: [], errors: [`The mods could not be read: ${e.message}`] }))
      .then((r) => {
        this.state.mods = r;
        this.screens.switchTo(new TitleScreen(this));
      });
  }

  async refreshSaves(): Promise<void> {
    this.state.saves = await listSaves();
  }

  // ---- The title and menus -------------------------------------------------------------------

  toTitle(): void {
    this.state.error = '';
    void this.refreshSaves();
    this.screens.switchTo(new TitleScreen(this));
  }

  newGame(): void {
    this.state.error = '';
    this.state.note = '';
    this.state.viewCentre = null;
    this.screens.switchTo(new SetupScreen(this));
  }

  showSaves(): void {
    this.screens.push(new LoadScreen(this));
  }

  quit(): void {
    void desktop?.quit();
  }

  // ---- Making a world ------------------------------------------------------------------------

  makeWorld(): void {
    const s = this.state;
    if (desktop) {
      s.remembered = { ...s.remembered, settings: { ...s.settings } };
      void writeJson('settings.json', s.remembered);
    }
    s.error = '';
    s.worldSettings = { ...s.settings };
    this.catalogueP = null;
    this.screens.switchTo(new ProgressScreen(this, 'Starting'));
    this.worker.makeWorld(s.settings);
  }

  async openWorldFile(): Promise<void> {
    try {
      const f = await desktop!.openWorldFile();
      if (f) this.useWorldText(f.text);
    } catch (err) {
      this.state.error = err instanceof Error ? err.message : String(err);
    }
  }

  useWorldText(text: string): void {
    const st = this.state;
    st.error = '';
    try {
      const s = { ...st.settings };
      const r = readWorldFile(text, s);
      st.settings = s;
      st.viewCentre = r.view?.center ?? null;
      st.note = r.generator !== GENERATOR_VERSION ? `This file was saved by generator version ${r.generator}; this game makes version ${GENERATOR_VERSION}, so the world may differ slightly.` : '';
      this.makeWorld();
    } catch (err) {
      st.error = err instanceof Error ? err.message : String(err);
    }
  }

  private worldReady(starts: StartSite[], summary: WorldSummary): void {
    const st = this.state;
    st.starts = starts;
    st.summary = summary;
    const ld = this.loading.value;
    if (ld) {
      // Carrying on a saved game: straight back to where it began.
      if (!starts.some((s) => s.id === ld.start.siteId)) {
        st.error = `The saved game began in ${ld.start.siteName}, which this world no longer has.`;
        this.loading.value = null;
        this.toTitle();
        return;
      }
      this.launch(ld.start.siteId, `Returning to ${ld.place}`, null, ld);
      return;
    }
    this.screens.switchTo(new StartScreen(this));
  }

  /** The start site the world view should choose first. */
  firstChoice(): string {
    const st = this.state;
    const vc = st.viewCentre;
    const near = vc ? [...st.starts].sort((a, b) => Math.hypot(a.lon - vc[0], a.lat - vc[1]) - Math.hypot(b.lon - vc[0], b.lat - vc[1]))[0] : st.starts[0];
    const last = st.remembered.start;
    const again = !vc && last && last.seed === st.settings.seed ? st.starts.find((s) => s.id === last.id) : undefined;
    return (again ?? near)?.id ?? '';
  }

  // ---- Character creation and the start of a game --------------------------------------------

  /** What character creation needs of the world (asked for once per world). */
  catalogue(): Promise<Catalogue> {
    this.catalogueP ??= this.worker.catalogue();
    return this.catalogueP;
  }

  createCharacter(siteId: string): void {
    const st = this.state;
    if (desktop) {
      st.remembered = { ...st.remembered, start: { seed: st.settings.seed, id: siteId } };
      void writeJson('settings.json', st.remembered);
    }
    this.screens.push(new CreationScreen(this, siteId));
  }

  /** Starts a game: the home town is laid out, then play begins with this character. */
  beginGame(character: Actor, homeId: string): void {
    const site = this.state.starts.find((s) => s.id === homeId);
    this.launch(homeId, `Laying out ${site?.name ?? 'the town'}`, character, null);
  }

  private launch(siteId: string, stage: string, character: Actor | null, restore: SaveFile | null): void {
    this.screens.switchTo(new ProgressScreen(this, stage, 0.5));
    this.bus.once('world.started', (m) => {
      this.loading.value = null;
      const play = new PlayScreen(this, {
        site: m.site, tile: m.tile, sites: m.sites, gameId: restore?.id ?? newGameId(),
        settings: { ...(this.state.worldSettings ?? this.state.settings) }, restore, character,
      });
      this.screens.switchTo(play);
    });
    this.worker.start(siteId);
  }

  // ---- Saved games ---------------------------------------------------------------------------

  async continueGame(id: string): Promise<void> {
    this.state.error = '';
    try {
      const s = await loadSave(id);
      if (!s) throw new Error('That saved game could not be read.');
      this.startFromSave(s);
    } catch (err) {
      this.state.error = err instanceof Error ? err.message : String(err);
    }
  }

  startFromSave(s: SaveFile): void {
    this.loading.value = s;
    this.state.settings = { ...this.state.settings, ...s.settings };
    this.state.viewCentre = null;
    this.state.note = versionNote(s);
    this.makeWorld();
  }

  async importSave(text: string): Promise<void> {
    this.state.error = '';
    try {
      const s = readSave(text);
      await writeSave(s);
      await this.refreshSaves();
      this.startFromSave(s);
    } catch (err) {
      this.state.error = err instanceof Error ? err.message : String(err);
    }
  }

  async removeSave(s: SaveSummary): Promise<void> {
    if (!window.confirm(`Delete the saved game "${s.place}" (${s.title})? This cannot be undone.`)) return;
    await deleteSave(s.id);
    await this.refreshSaves();
  }
}
