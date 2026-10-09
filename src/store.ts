import { reactive, shallowRef } from 'vue';
import type { WorldParams, WorldSummary } from './gen/world';
import type { LayerId } from './render/tiles';
import { WorldClient, type ClientWorld } from './world/client';
import type { ProbeInfo } from './world/probe';

const SEED_WORDS = ['amber', 'ash', 'briar', 'cinder', 'dusk', 'ember', 'fen', 'frost', 'gale', 'hollow', 'iron', 'jade', 'moor', 'oak', 'raven', 'rune', 'sable', 'storm', 'thorn', 'vale', 'wyrm'];

export function randomSeed(): string {
  const pick = () => SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 1000)}`;
}

export const store = reactive({
  params: {
    seed: randomSeed(),
    landFraction: 0.35,
    plates: 14,
    erosion: 0.5,
    resolution: 1024,
  } as WorldParams,
  layer: 'fantasy' as LayerId,
  showRivers: true,
  showSettlements: true,
  showWind: false,
  showCurrents: false,
  generating: false,
  stage: '',
  progress: 0,
  error: '',
  summary: null as WorldSummary | null,
  probe: null as ProbeInfo | null,
});

export const world = shallowRef<ClientWorld | null>(null);
export const client = new WorldClient();
client.registerProtocol();

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
