/**
 * Tile pictures. Every tile in the registry (core local/tiles.ts), and every decoration, gets a
 * placeholder drawn here from its colour and glyph; a tileset in public/tileset/ (its index read by
 * game/tileset-format.ts; see TILESET.md) replaces them by name, tile by tile, so art can be added
 * a few tiles at a time. Tiles with no art of their own may borrow another's (stand-ins).
 */
import { Rectangle, Texture } from 'pixi.js';
import { DECOR, GROUND_TILES, OBJECT_TILES, type DecorDef, type TileDef } from '@worldforge/core/local/tiles';
import { readTileset, type FrameLayer, type Picture } from './tileset-format';
import { hash2 } from '../util';

/** Art size of one tile, px. */
export const TILE_PX = 16;

/** Sides for a mask4 join: a neighbour of the same group to the north, east, south, west. */
export const N = 1, E = 2, S = 4, W = 8;

/** How one tile (or decoration) is drawn: its pictures (several when animated), where they sit, and a tint. */
export interface Look {
  tex: Texture[];
  /** Milliseconds each picture of an animation shows. */
  ms: number;
  /** Where the picture's top-left sits from the tile's (pixels; negative when it rises above). */
  dx: number;
  dy: number;
  /** A colour to multiply by (a stand-in's), 0xffffff for none. */
  tint: number;
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const hash = (x: number, y: number) => hash2(x, y);

/** The layer each name belongs to (tiles and decorations). */
const LAYERS = new Map<string, FrameLayer>([
  ...GROUND_TILES.map((d) => [d.name, 'ground'] as const),
  ...OBJECT_TILES.map((d) => [d.name, 'object'] as const),
  ...DECOR.map((d) => [d.name, 'decor'] as const),
]);

export class Tileset {
  /** Looks by key ("ground:grass", "object:wall_stone#5", "decor:pebbles"), one per variant. */
  private looks = new Map<string, Look[]>();
  /** Names whose art came from a loaded tileset (the rest are placeholders or stand-ins). */
  readonly drawn = new Set<string>();
  /** Names drawn with another's art. */
  readonly standIns = new Set<string>();

  constructor() {
    this.placeholders();
  }

  private placeholders(): void {
    type Cell = { key: string; draw: (g: CanvasRenderingContext2D, x: number, y: number) => void };
    const all: Cell[] = [];
    for (const def of [...GROUND_TILES, ...OBJECT_TILES]) {
      if (def.join === 'mask4') for (let m = 0; m < 16; m++) all.push({ key: `${def.layer}:${def.name}#${m}`, draw: (g, x, y) => this.drawPlaceholder(g, x, y, def, m, 0) });
      for (let v = 0; v < Math.min(3, def.variants ?? 1); v++) all.push({ key: `${def.layer}:${def.name}`, draw: (g, x, y) => this.drawPlaceholder(g, x, y, def, -1, v) });
    }
    for (const d of DECOR) for (let v = 0; v < Math.min(3, d.variants ?? 1); v++) all.push({ key: `decor:${d.name}`, draw: (g, x, y) => drawDecorPlaceholder(g, x, y, d, v) });
    const cols = 32, rows = Math.ceil(all.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * TILE_PX;
    cv.height = rows * TILE_PX;
    const g = cv.getContext('2d')!;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    all.forEach((t, i) => t.draw(g, (i % cols) * TILE_PX, Math.floor(i / cols) * TILE_PX));
    const base = Texture.from(cv);
    base.source.scaleMode = 'nearest';
    all.forEach((t, i) => {
      const tex = new Texture({ source: base.source, frame: new Rectangle((i % cols) * TILE_PX, Math.floor(i / cols) * TILE_PX, TILE_PX, TILE_PX) });
      const list = this.looks.get(t.key) ?? [];
      list.push({ tex: [tex], ms: 0, dx: 0, dy: 0, tint: 0xffffff });
      this.looks.set(t.key, list);
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

  /**
   * Loads public/tileset/tileset.json if there is one: its frames replace the placeholders, and its
   * stand-ins lend art to tiles that have none. Returns how many frames were read.
   */
  async load(baseUrl: string): Promise<number> {
    let raw: unknown;
    try {
      const r = await fetch(`${baseUrl}tileset/tileset.json`);
      if (!r.ok) return 0;
      raw = await r.json();
    } catch {
      return 0;
    }
    const index = readTileset(raw, (n) => LAYERS.get(n));
    for (const w of index.warnings) console.warn(`tileset.json: ${w}`);
    // The sheets used, loaded side by side.
    const used = new Set(index.frames.flatMap((f) => f.pictures.map((p) => p.sheet)));
    const sources = new Map<string, Texture>();
    await Promise.all([...used].map(async (sheet) => {
      const img = new Image();
      img.src = `${baseUrl}tileset/${index.sheets[sheet]}`;
      try {
        await img.decode();
      } catch {
        console.warn(`tileset.json: could not load the sheet ${index.sheets[sheet]}`);
        return;
      }
      const t = Texture.from(img);
      t.source.scaleMode = 'nearest';
      sources.set(sheet, t);
    }));
    const texOf = (p: Picture) => new Texture({ source: sources.get(p.sheet)!.source, frame: new Rectangle(p.x, p.y, p.w, p.h) });
    const lists = new Map<string, Look[]>();
    for (const f of index.frames) {
      if (!f.pictures.every((p) => sources.has(p.sheet))) continue;
      const list = lists.get(f.key) ?? [];
      list[f.variant] = { tex: f.pictures.map(texOf), ms: f.ms, dx: f.pictures[0].dx, dy: f.pictures[0].dy, tint: 0xffffff };
      lists.set(f.key, list);
      this.drawn.add(f.key.slice(f.key.indexOf(':') + 1).replace(/#\d+$/, ''));
    }
    for (const [key, list] of lists) this.looks.set(key, list.filter(Boolean));
    // A join drawn as one picture only: used for every side.
    for (const [key, list] of lists) {
      if (key.includes('#')) continue;
      for (let m = 0; m < 16; m++) if (!lists.has(`${key}#${m}`) && this.looks.has(`${key}#${m}`)) this.looks.set(`${key}#${m}`, list.filter(Boolean));
    }
    // Stand-ins: a tile with no art of its own borrows another's (every variant and join of it).
    for (const s of index.standIns) {
      if (this.drawn.has(s.name) || !this.drawn.has(s.as)) continue;
      const from = `${LAYERS.get(s.as)}:${s.as}`, to = `${LAYERS.get(s.name)}:${s.name}`;
      for (const [key, list] of this.looks) {
        if (key !== from && !key.startsWith(`${from}#`)) continue;
        const tinted = list.map((l) => ({ ...l, tint: s.tint }));
        this.looks.set(to + key.slice(from.length), tinted);
        // A borrowed join used by a tile that does not join: the plain look is the one used.
      }
      this.standIns.add(s.name);
    }
    return index.frames.length;
  }

  /** How a tile or decoration at (tx, ty) is drawn: its join frame, else a variant chosen by position. */
  get(layer: FrameLayer, name: string, tx: number, ty: number, mask = -1): Look | null {
    const list = (mask >= 0 && this.looks.get(`${layer}:${name}#${mask}`)) || this.looks.get(`${layer}:${name}`);
    if (!list || !list.length) return null;
    return list.length === 1 ? list[0] : list[hash(tx, ty) % list.length];
  }
}

/** A decoration's placeholder: a few small marks of its kind, placed by variant. */
function drawDecorPlaceholder(g: CanvasRenderingContext2D, x: number, y: number, d: DecorDef, v: number): void {
  const P = TILE_PX;
  const at = (i: number) => {
    const h = hash(i * 7 + v * 131, d.name.length * 13 + v);
    return [x + 3 + (h % (P - 6)), y + 3 + ((h >>> 8) % (P - 6))] as const;
  };
  g.fillStyle = d.colour;
  switch (d.mark) {
    case 'tuft': {
      const [px, py] = at(0);
      g.fillRect(px, py, 1, 3);
      g.fillRect(px - 2, py + 1, 1, 2);
      g.fillRect(px + 2, py + 1, 1, 2);
      break;
    }
    case 'dots':
      for (let i = 0; i < 3; i++) {
        const [px, py] = at(i);
        g.fillRect(px, py, 1, 1);
      }
      break;
    case 'stones':
      for (let i = 0; i < 2; i++) {
        const [px, py] = at(i);
        g.fillRect(px, py, 2, 1);
        g.fillStyle = shade(d.colour, 0.7);
        g.fillRect(px, py + 1, 2, 1);
        g.fillStyle = d.colour;
      }
      break;
    case 'sticks': {
      const [px, py] = at(0);
      for (let i = 0; i < 4; i++) g.fillRect(px + i, py + (i >> 1), 1, 1);
      break;
    }
    case 'caps':
      for (let i = 0; i < 2; i++) {
        const [px, py] = at(i);
        g.fillRect(px - 1, py, 3, 1);
        g.fillStyle = '#e8dcc0';
        g.fillRect(px, py + 1, 1, 1);
        g.fillStyle = d.colour;
      }
      break;
    case 'stalks':
      for (let i = 0; i < 3; i++) {
        const [px, py] = at(i);
        g.fillRect(px, py, 1, 4);
      }
      break;
    case 'crack': {
      const [px, py] = at(0);
      for (let i = 0; i < 5; i++) g.fillRect(px + i, py + (i % 2), 1, 1);
      break;
    }
  }
}
