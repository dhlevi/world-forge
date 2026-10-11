import { reactive, shallowRef } from 'vue';
import type { WorldParams, WorldSummary } from './gen/world';
import type { LayerId } from './render/tiles';
import { WorldClient, type ClientWorld } from './world/client';
import type { ProbeInfo } from './world/probe';
import type { BuildingView } from './interiors/building';
import type { LairSite } from './lairs/lair';
import type { DungeonSite } from './dungeons/core';
import { SearchIndex } from './search/index';
import { registerPoliticalProtocol, registerRelationsProtocol } from './world/political';

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
    plates: 14,
    erosion: 0.5,
    resolution: 1024,
  } as WorldParams & { settled: number },
  layer: 'fantasy' as LayerId,
  showRivers: true,
  showSettlements: true,
  showLabels: true,
  /** Political borders (empires, kingdoms, duchies, counties). */
  showBorders: true,
  /** Political map: realms washed in colour, with large titles and arms. */
  showPolitical: false,
  showWind: false,
  showCurrents: false,
  generating: false,
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
  here: null as { name: string; kind: string; population: number } | null,
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
export const client = new WorldClient();
client.registerProtocol();
registerPoliticalProtocol();
registerRelationsProtocol();

export async function regenerate(): Promise<void> {
  store.generating = true;
  store.error = '';
  store.progress = 0;
  try {
    const result = await client.generate({ ...store.params }, (stage, pct) => {
      store.stage = stage;
      store.progress = pct;
    });
    if (result.gen !== client.latestGen) return;
    world.value = result;
    store.summary = result.summary;
    store.generating = false;
  } catch (err) {
    store.error = err instanceof Error ? err.message : String(err);
    store.generating = false;
  }
}
