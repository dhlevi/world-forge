/**
 * Tile pictures. Every tile in the registry (core local/tiles.ts) gets a placeholder drawn here
 * from its colour and glyph; a tileset in public/tileset/ (see TILESET.md) replaces them by
 * name, tile by tile, so art can be added a few tiles at a time.
 */
import { Rectangle, Texture } from 'pixi.js';
import { GROUND_TILES, OBJECT_TILES, type TileDef } from '@worldforge/core/local/tiles';

/** Art size of one tile, px. */
export const TILE_PX = 16;

/** Sides for a mask4 join: a neighbour of the same group to the north, east, south, west. */
export const N = 1, E = 2, S = 4, W = 8;

interface TilesetJson {
  tileSize?: number;
  image?: string;
  /** Frame name to [column, row] in the image. Names: "grass", variants "grass.1", joins "wall_stone#5". */
  tiles: Record<string, [number, number]>;
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function hash(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return (h ^ (h >>> 12)) >>> 0;
}

export class Tileset {
  /** Frames by name: plain names hold the variants list. */
  private frames = new Map<string, Texture[]>();
  /** Names whose art came from a loaded tileset (the rest are placeholders). */
  readonly drawn = new Set<string>();

  constructor() {
    this.placeholders();
  }

  private placeholders(): void {
    const all: { def: TileDef; mask: number; variant: number }[] = [];
    for (const def of [...GROUND_TILES, ...OBJECT_TILES]) {
      if (def.join === 'mask4') for (let m = 0; m < 16; m++) all.push({ def, mask: m, variant: 0 });
      else for (let v = 0; v < Math.min(3, def.variants ?? 1); v++) all.push({ def, mask: -1, variant: v });
    }
    const cols = 32, rows = Math.ceil(all.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * TILE_PX;
    cv.height = rows * TILE_PX;
    const g = cv.getContext('2d')!;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    all.forEach((t, i) => {
      const x = (i % cols) * TILE_PX, y = Math.floor(i / cols) * TILE_PX;
      this.drawPlaceholder(g, x, y, t.def, t.mask, t.variant);
    });
    const base = Texture.from(cv);
    base.source.scaleMode = 'nearest';
    all.forEach((t, i) => {
      const tex = new Texture({ source: base.source, frame: new Rectangle((i % cols) * TILE_PX, Math.floor(i / cols) * TILE_PX, TILE_PX, TILE_PX) });
      const name = t.mask >= 0 ? `${t.def.layer}:${t.def.name}#${t.mask}` : `${t.def.layer}:${t.def.name}`;
      const list = this.frames.get(name) ?? [];
      list.push(tex);
      this.frames.set(name, list);
    });
  }

  private drawPlaceholder(g: CanvasRenderingContext2D, x: number, y: number, d: TileDef, mask: number, variant: number): void {
    const P = TILE_PX;
    if (d.layer === 'ground') {
      g.fillStyle = d.colour;
      g.fillRect(x, y, P, P);
      // A few specks, different per variant.
      for (let i = 0; i < 7; i++) {
        const h = hash(i + variant * 31, d.name.length * 7 + variant);
        g.fillStyle = shade(d.colour, h & 1 ? 1.12 : 0.88);
        g.fillRect(x + (h % P), y + ((h >>> 8) % P), 1 + ((h >>> 16) & 1), 1);
      }
      if (mask >= 0) {
        // Water: a lighter rim where it meets the shore.
        g.fillStyle = shade(d.colour, 1.35);
        if (!(mask & N)) g.fillRect(x, y, P, 2);
        if (!(mask & S)) g.fillRect(x, y + P - 2, P, 2);
        if (!(mask & W)) g.fillRect(x, y, 2, P);
        if (!(mask & E)) g.fillRect(x + P - 2, y, 2, P);
      }
      return;
    }
    if (!d.glyph || d.name === 'none') return;
    if (mask >= 0) {
      // Joined pieces (walls, fences): a band toward each joined side, so lines read as lines.
      const solid = d.opaque || d.group === 'wall';
      const t = solid ? 4 : 6;
      g.fillStyle = d.colour;
      g.fillRect(x + t, y + t, P - 2 * t, P - 2 * t);
      if (mask & N) g.fillRect(x + t, y, P - 2 * t, t);
      if (mask & S) g.fillRect(x + t, y + P - t, P - 2 * t, t);
      if (mask & W) g.fillRect(x, y + t, t, P - 2 * t);
      if (mask & E) g.fillRect(x + P - t, y + t, t, P - 2 * t);
      if (solid) {
        g.fillRect(x + 2, y + 2, P - 4, P - 4);
        g.fillStyle = shade(d.colour, 0.7);
        g.fillRect(x + 2, y + P - 3, P - 4, 1);
      }
      if (d.glyph !== '#') {
        g.font = `bold ${P - 3}px monospace`;
        g.fillStyle = d.name.startsWith('window') ? '#e8f4ff' : '#1a1410';
        g.fillText(d.glyph, x + P / 2, y + P / 2 + 1);
      }
      return;
    }
    g.font = `bold ${P - 2}px monospace`;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillText(d.glyph, x + P / 2 + 1, y + P / 2 + 2);
    g.fillStyle = variant ? shade(d.colour, 1 - variant * 0.12) : d.colour;
    g.fillText(d.glyph, x + P / 2, y + P / 2 + 1);
  }

  /** Loads public/tileset/tileset.json if there is one; its frames replace the placeholders. */
  async load(baseUrl: string): Promise<number> {
    let json: TilesetJson;
    try {
      const r = await fetch(`${baseUrl}tileset/tileset.json`);
      if (!r.ok) return 0;
      json = await r.json();
    } catch {
      return 0;
    }
    const size = json.tileSize ?? TILE_PX;
    const img = new Image();
    img.src = `${baseUrl}tileset/${json.image ?? 'tileset.png'}`;
    try {
      await img.decode();
    } catch {
      return 0;
    }
    const base = Texture.from(img);
    base.source.scaleMode = 'nearest';
    const byName = new Map<string, TileDef>();
    for (const d of GROUND_TILES) byName.set(d.name, d);
    for (const d of OBJECT_TILES) if (!byName.has(d.name)) byName.set(d.name, d);
    // Plain names and their numbered variants ("grass", "grass.1") become one list.
    const lists = new Map<string, Texture[]>();
    for (const [frame, pos] of Object.entries(json.tiles ?? {})) {
      const m = /^([a-z0-9_]+)(?:\.(\d+))?(?:#(\d+))?$/.exec(frame);
      if (!m || !byName.has(m[1]) || !Array.isArray(pos)) continue;
      const d = byName.get(m[1])!;
      const tex = new Texture({ source: base.source, frame: new Rectangle(pos[0] * size, pos[1] * size, size, size) });
      const name = m[3] !== undefined ? `${d.layer}:${d.name}#${m[3]}` : `${d.layer}:${d.name}`;
      const list = lists.get(name) ?? [];
      list[m[2] ? Number(m[2]) : 0] = tex;
      lists.set(name, list);
      this.drawn.add(d.name);
    }
    for (const [name, list] of lists) this.frames.set(name, list.filter(Boolean));
    // A join drawn as one picture only: use it for every mask.
    for (const n of this.drawn) {
      for (const layer of ['ground', 'object']) {
        const plain = lists.get(`${layer}:${n}`);
        if (!plain) continue;
        for (let mk = 0; mk < 16; mk++) if (!lists.has(`${layer}:${n}#${mk}`) && this.frames.has(`${layer}:${n}#${mk}`)) this.frames.set(`${layer}:${n}#${mk}`, plain);
      }
    }
    return lists.size;
  }

  /** The picture for a tile at (tx, ty): its join frame, else a variant chosen by position. */
  get(def: TileDef, tx: number, ty: number, mask: number): Texture | null {
    const list = (mask >= 0 && this.frames.get(`${def.layer}:${def.name}#${mask}`)) || this.frames.get(`${def.layer}:${def.name}`);
    if (!list || !list.length) return null;
    return list.length === 1 ? list[0] : list[hash(tx, ty) % list.length];
  }
}
