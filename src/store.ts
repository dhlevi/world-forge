import { reactive, shallowRef } from 'vue';
import type { WorldParams, WorldSummary } from './gen/world';
import type { LayerId } from './render/tiles';
import { WorldClient, type ClientWorld } from './world/client';
import type { ProbeInfo } from './world/probe';
import type { BuildingView } from './interiors/building';
import type { LairSite } from './lairs/lair';
import type { DungeonSite } from './dungeons/core';
import { SearchIndex } from './search/index';
import { setWorldCultures } from './names/world-cultures';
import { registerFaithProtocol, registerPoliticalProtocol, registerRelationsProtocol } from './world/political';

const SEED_WORDS = ['amber', 'ash', 'briar', 'cinder', 'dusk', 'ember', 'fen', 'frost', 'gale', 'hollow', 'iron', 'jade', 'moor', 'oak', 'raven', 'rune', 'sable', 'storm', 'thorn', 'vale', 'wyrm'];

export function randomSeed(): string {
  const pick = () => SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 1000)}`;
}

export const store = reactive({
  params: {
    seed: randomSeed(),
    landFraction: 0.35,
    settled: 0.6,
    drift: 0.3,
    races: true,
    plates: 14,
    erosion: 0.5,
    resolution: 1024,
  } as WorldParams & { settled: number; drift: number; races: boolean },
  layer: 'fantasy' as LayerId,
  showRivers: true,
  showSettlements: true,
  showLabels: true,
  /** Place names in the local languages, in English, or both. */
  labelMode: 'native' as 'native' | 'english' | 'both',
  /** Political borders (empires, kingdoms, duchies, counties). */
  showBorders: true,
  /** Political map: realms washed in colour, with large titles and arms. */
  showPolitical: false,
  /** Faith map: each land washed in the colour of its people's faith (shaded by sect), with holy places. */
  showFaiths: false,
  showWind: false,
  showCurrents: false,
  generating: false,
  /** The settings the current world was made with (JSON of `params`), to tell when they have changed. */
  madeWith: '',
  stage: '',
  progress: 0,
  error: '',
  summary: null as WorldSummary | null,
  probe: null as ProbeInfo | null,
  /** Map centre (lon, lat), for distances in search results. */
  center: [0, 20] as [number, number],
  /** Map zoom (updated when the map settles). */
  zoom: 1.6,
  /** The village under the map centre at close zoom, if any (from the towns worker's data). */
  here: null as { name: string; en?: string; kind: string; population: number; realm?: string; war?: string; faith?: string; what?: string } | null,
});

export const world = shallowRef<ClientWorld | null>(null);
/** The building open in the Dwelling view, if any. */
export const openBuilding = shallowRef<BuildingView | null>(null);
/** Place-name search over the world, the background index and drawn plans. */
export const search = new SearchIndex();
/** Background index progress (blocks done of total) and a counter that bumps when the index grows. */
export const searchState = reactive({ done: 0, total: 0, version: 0 });
/** A place to fly to (set by the search box, handled by the map). */
export const flyTarget = shallowRef<{ lon: number; lat: number; zoom: number; name: string; t: number } | null>(null);
/** The cave or glade open in the lair view, if any. */
export const openLair = shallowRef<LairSite | null>(null);
/** The tower, crypt, ruin, mine, catacomb or sewer open in the dungeon view, if any. */
export const openDungeon = shallowRef<DungeonSite | null>(null);
/** The realm (political unit id) open in the realm details window, if any. */
export const openRealm = shallowRef<number | null>(null);
/** The culture (index into CULTURES) open in the culture window, if any. */
export const openCulture = shallowRef<number | null>(null);
/** The faith (id in the world lore's faiths) open in the faith window, if any. */
export const openFaith = shallowRef<number | null>(null);
/** The faith map's key: each faith shown, with its colour. */
export const faithLegend = shallowRef<{ id: number; name: string; rgb: [number, number, number] }[]>([]);
export const client = new WorldClient();
client.registerProtocol();
registerPoliticalProtocol();
registerRelationsProtocol();
registerFaithProtocol();

/** The world settings have changed since the current world was made (Generate applies them). */
export const settingsChanged = (): boolean => !!store.madeWith && JSON.stringify(store.params) !== store.madeWith;

export async function regenerate(): Promise<void> {
  store.madeWith = JSON.stringify(store.params);
  store.generating = true;
  store.error = '';
  store.progress = 0;
  try {
    const result = await client.generate({ ...store.params }, (stage, pct) => {
      store.stage = stage;
      store.progress = pct;
    });
    if (result.gen !== client.latestGen) return;
    // The world's cultures and languages, rebuilt on this thread for names and lore.
    setWorldCultures(result.raster.cultures);
    world.value = result;
    store.summary = result.summary;
    store.generating = false;
  } catch (err) {
    store.error = err instanceof Error ? err.message : String(err);
    store.generating = false;
  }
}
