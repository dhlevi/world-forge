import { generateWorld } from '../gen/world';
import { TileRenderer } from '../render/tiles';
import type { WorkerRequest, WorkerResponse } from './protocol';

const TILE_SIZE = 256;
const STALE = 'stale';
let renderer: TileRenderer | null = null;
let currentGen = -1;

function post(msg: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(msg, { transfer });
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'generate': {
        const world = generateWorld(msg.params, (stage, pct) => post({ type: 'progress', id: msg.id, stage, pct }));
        renderer = new TileRenderer(world.raster, world.rivers);
        currentGen = msg.gen;
        post({ type: 'generated', id: msg.id, gen: msg.gen, ...world });
        break;
      }
      case 'setWorld':
        renderer = new TileRenderer(msg.raster, msg.rivers);
        currentGen = msg.gen;
        break;
      case 'tile': {
        if (!renderer || msg.gen !== currentGen) throw new Error(STALE);
        const px = renderer.renderTile(msg.z, msg.x, msg.y, msg.layer, TILE_SIZE, { rivers: msg.rivers });
        const bitmap = await createImageBitmap(new ImageData(px, TILE_SIZE, TILE_SIZE));
        post({ type: 'tile', id: msg.id, bitmap }, [bitmap]);
        break;
      }
    }
  } catch (err) {
    if ('id' in msg) post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
};
