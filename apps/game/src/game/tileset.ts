/**
 * Tile pictures. Every tile in the registry (core local/tiles.ts), and every decoration, gets a
 * placeholder drawn here from its colour and glyph; a tileset in public/tileset/ (its index read by
 * game/tileset-format.ts; see TILESET.md) replaces them by name, tile by tile, so art can be added
 * a few tiles at a time. Tiles with no art of their own may borrow another's (stand-ins).
 */
import { Rectangle, Texture } from 'pixi.js';
import { DECOR, FACINGS, FIGURES, GROUND_TILES, OBJECT_TILES, TERRAINS, type DecorDef, type Facing, type TileDef } from '@worldforge/core/local/tiles';
import { edgeInside } from './terrain';
import { TREE_KINDS, type TreeKind } from '@worldforge/core/local/trees';
import { ROOF_MATERIALS, ROOF_PLANES, type RoofMaterial, type RoofPlane } from '@worldforge/core/local/roofs';

/** A tree kind's frames (trees across levels, game/trees.ts), and how many joins each has. */
export const TREE_FRAMES = ['trunk', 'trunk2', 'roots', 'branch', 'leaves'] as const;
export type TreeFrame = (typeof TREE_FRAMES)[number];
import { lookKeys, readTileset, type FrameLayer, type Picture } from './tileset-format';
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
  /** Drawn for a season or for snow (so not tinted for it). */
  seasonal?: boolean;
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
  ...TERRAINS.map((t) => [`edge_${t.name}`, 'edge'] as const),
  ...TREE_KINDS.flatMap((k) => TREE_FRAMES.map((f) => [`${f}_${k.name}`, 'tree'] as const)),
  ...FIGURES.flatMap((f) => FACINGS.flatMap((d) => [[`${f.name}_${d}`, 'figure'] as const, [`${f.name}_walk_${d}`, 'figure'] as const])),
  ...(Object.keys(ROOF_MATERIALS) as RoofMaterial[]).flatMap((m) => ROOF_PLANES.map((pl) => [`roof_${m}_${pl}`, 'roof'] as const)),
]);

/** A figure's placeholder colours: skin, hair and clothes. */
export interface FigureColours {
  skin: string;
  hair: string;
  clothes: string;
}
const DEFAULT_FIGURE: FigureColours = { skin: '#d8b090', hair: '#5a3a20', clothes: '#5f6f86' };

/** Variants of each edge frame made from a tile's art. */
const EDGE_VARIANTS = 3;
const GROUND_BY_NAME = new Map(GROUND_TILES.map((d) => [d.name, d]));

export class Tileset {
  /** Looks by key ("ground:grass", "object:wall_stone#5", "decor:pebbles"), one per variant. */
  private looks = new Map<string, Look[]>();
  /** Names whose art came from a loaded tileset (the rest are placeholders or stand-ins). */
  readonly drawn = new Set<string>();
  /** Names drawn with another's art. */
  readonly standIns = new Set<string>();
  /** Names drawn for a season or snow ("grass@winter"). */
  readonly seasons = new Set<string>();
  /** Edge frames made from each ground tile's own art, by its name: [mask 1 to 14][variant]. */
  private madeEdges = new Map<string, Look[][]>();
  /** Placeholder figures ("person_s", "person_walk_s"), drawn in the colours given. */
  private figures = new Map<string, Look>();

  constructor() {
    this.placeholders();
    this.setFigureColours(DEFAULT_FIGURE);
  }

  /**
   * Draws the placeholder figures again in these colours (the wanderer's own skin and hair), for
   * any figure without art in the tileset.
   */
  setFigureColours(c: Partial<FigureColours>): void {
    const col = { ...DEFAULT_FIGURE, ...c };
    const P = TILE_PX, cv = document.createElement('canvas');
    cv.width = 3 * P;
    cv.height = FIGURES.length * 4 * P;
    const g = cv.getContext('2d')!;
    FIGURES.forEach((_f, fi) => FACINGS.forEach((d, di) => {
      for (let fr = 0; fr < 3; fr++) drawFigure(g, fr * P, (fi * 4 + di) * P, d, fr, col);
    }));
    const sheet = Texture.from(cv);
    sheet.source.scaleMode = 'nearest';
    const tex = (fi: number, di: number, fr: number) => new Texture({ source: sheet.source, frame: new Rectangle(fr * P, (fi * 4 + di) * P, P, P) });
    this.figures.clear();
    FIGURES.forEach((f, fi) => FACINGS.forEach((d, di) => {
      this.figures.set(`${f.name}_${d}`, { tex: [tex(fi, di, 0)], ms: 0, dx: 0, dy: 0, tint: 0xffffff });
      this.figures.set(`${f.name}_walk_${d}`, { tex: [tex(fi, di, 1), tex(fi, di, 0), tex(fi, di, 2), tex(fi, di, 0)], ms: 70, dx: 0, dy: 0, tint: 0xffffff });
    }));
  }

  /**
   * How a figure facing a way is drawn, standing or walking: the tileset's frames if it has them
   * (a figure drawn facing east only is turned about for west), else the placeholder. `flip`:
   * draw it mirrored.
   */
  figure(name: string, facing: Facing, walking: boolean): { look: Look; flip: boolean } | null {
    const art = (n: string) => (this.drawn.has(n) ? this.get('figure', n, 0, 0) : null);
    for (const [d, flip] of [[facing, false], ...(facing === 'w' ? [['e', true] as const] : [])] as [Facing, boolean][]) {
      const look = (walking && art(`${name}_walk_${d}`)) || art(`${name}_${d}`);
      if (look) return { look, flip };
    }
    const look = this.figures.get(`${name}_${walking ? 'walk_' : ''}${facing}`);
    return look ? { look, flip: false } : null;
  }

  private placeholders(): void {
    type Cell = { key: string; draw: (g: CanvasRenderingContext2D, x: number, y: number) => void };
    const all: Cell[] = [];
    for (const def of [...GROUND_TILES, ...OBJECT_TILES]) {
      if (def.join === 'mask4') for (let m = 0; m < 16; m++) all.push({ key: `${def.layer}:${def.name}#${m}`, draw: (g, x, y) => this.drawPlaceholder(g, x, y, def, m, 0) });
      for (let v = 0; v < Math.min(3, def.variants ?? 1); v++) all.push({ key: `${def.layer}:${def.name}`, draw: (g, x, y) => this.drawPlaceholder(g, x, y, def, -1, v) });
    }
    for (const d of DECOR) for (let v = 0; v < Math.min(3, d.variants ?? 1); v++) all.push({ key: `decor:${d.name}`, draw: (g, x, y) => drawDecorPlaceholder(g, x, y, d, v) });
    for (const mat of Object.keys(ROOF_MATERIALS) as RoofMaterial[]) for (const pl of ROOF_PLANES) for (let m = 0; m < 16; m++) {
      all.push({ key: `roof:roof_${mat}_${pl}#${m}`, draw: (g, x, y) => drawRoof(g, x, y, mat, pl, m) });
    }
    for (const k of TREE_KINDS) {
      all.push({ key: `tree:trunk_${k.name}`, draw: (g, x, y) => drawTreePlaceholder(g, x, y, k, 'trunk', 0) });
      for (const m of [1, 2, 4, 8]) {
        all.push({ key: `tree:trunk2_${k.name}#${m}`, draw: (g, x, y) => drawTreePlaceholder(g, x, y, k, 'trunk2', m) });
        all.push({ key: `tree:roots_${k.name}#${m}`, draw: (g, x, y) => drawTreePlaceholder(g, x, y, k, 'roots', m) });
      }
      for (let m = 0; m < 16; m++) {
        all.push({ key: `tree:branch_${k.name}#${m}`, draw: (g, x, y) => drawTreePlaceholder(g, x, y, k, 'branch', m) });
        all.push({ key: `tree:leaves_${k.name}#${m}`, draw: (g, x, y) => drawTreePlaceholder(g, x, y, k, 'leaves', m) });
      }
    }
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
      drawJoined(g, x, y, d, mask);
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
      list[f.variant] = { tex: f.pictures.map(texOf), ms: f.ms, dx: f.pictures[0].dx, dy: f.pictures[0].dy, tint: 0xffffff, seasonal: f.key.includes('@') || undefined };
      lists.set(f.key, list);
      const name = f.key.slice(f.key.indexOf(':') + 1).replace(/#\d+$/, '');
      if (name.includes('@')) this.seasons.add(name);
      else this.drawn.add(name);
    }
    for (const [key, list] of lists) this.looks.set(key, list.filter(Boolean));
    // The ground's art has changed: edges made from it are made again.
    this.madeEdges.clear();
    // A join drawn as one picture only: used for every side.
    // (A season's frame of a joining tile, drawn as one picture, likewise.)
    for (const [key, list] of lists) {
      if (key.includes('#')) continue;
      const plain = key.replace(/@\w+$/, '');
      for (let m = 0; m < 16; m++) if (!lists.has(`${key}#${m}`) && (this.looks.has(`${plain}#${m}`) || lists.has(`${plain}#${m}`))) this.looks.set(`${key}#${m}`, list.filter(Boolean));
    }
    // Stand-ins: a tile with no art of its own borrows another's (every variant and join of it).
    for (const s of index.standIns) {
      if (this.drawn.has(s.name) || !this.drawn.has(s.as)) continue;
      const from = `${LAYERS.get(s.as)}:${s.as}`, to = `${LAYERS.get(s.name)}:${s.name}`;
      for (const [key, list] of this.looks) {
        if (key !== from && !key.startsWith(`${from}#`) && !key.startsWith(`${from}@`)) continue;
        const tinted = list.map((l) => ({ ...l, tint: s.tint }));
        this.looks.set(to + key.slice(from.length), tinted);
        // A borrowed join used by a tile that does not join: the plain look is the one used.
      }
      this.standIns.add(s.name);
    }
    return index.frames.length;
  }

  /**
   * The edge of a terrain spreading over a corner where four tiles meet (game/terrain.ts): the
   * tileset's frame for the terrain if it has one (`edge_grass#5`), else one made from the art of
   * the ground tile the edge comes from, its own pattern carried on and cut to a ragged line.
   */
  edge(terrain: number, mask: number, groundName: string, cx: number, cy: number, seasons: readonly string[] = []): Look | null {
    const name = `edge_${TERRAINS[terrain].name}`;
    const drawn = this.get('edge', name, cx, cy, mask, seasons);
    if (drawn && (this.drawn.has(name) || drawn.seasonal)) return drawn;
    // Made from the tile's art for the season, if it has some.
    const season = seasons.find((s) => this.seasons.has(`${groundName}@${s}`));
    const key = season ? `${groundName}@${season}` : groundName;
    let made = this.madeEdges.get(key);
    if (!made) {
      made = this.makeEdges(groundName, season ? [season] : []);
      this.madeEdges.set(key, made);
    }
    const list = made[mask];
    return list?.length ? list[hash(cx, cy) % list.length] : null;
  }

  /** Edge frames from a ground tile's art (every corner mask, a few ragged variants of each). */
  private makeEdges(name: string, seasons: readonly string[]): Look[][] {
    const def = GROUND_BY_NAME.get(name);
    const base = def && this.get('ground', name, 0, 0, def.join === 'mask4' ? 15 : -1, seasons);
    const tex = base?.tex[0];
    const src = tex?.source.resource as CanvasImageSource | undefined;
    if (!tex || !src) return [];
    const P = TILE_PX, fr = tex.frame;
    const cv = document.createElement('canvas');
    cv.width = 14 * P;
    cv.height = EDGE_VARIANTS * P;
    const g = cv.getContext('2d', { willReadFrequently: true })!;
    g.imageSmoothingEnabled = false;
    for (let v = 0; v < EDGE_VARIANTS; v++) for (let m = 1; m <= 14; m++) {
      const x0 = (m - 1) * P, y0 = v * P;
      // The tile's pattern carried on across the corner (the cell is offset half a tile).
      g.save();
      g.beginPath();
      g.rect(x0, y0, P, P);
      g.clip();
      for (const ox of [-P / 2, P / 2]) for (const oy of [-P / 2, P / 2]) g.drawImage(src, fr.x, fr.y, fr.width, fr.height, x0 + ox, y0 + oy, P, P);
      g.restore();
      // Cut to the ragged line, darkening a rim along it.
      const img = g.getImageData(x0, y0, P, P), d = img.data;
      for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
        const k = (y * P + x) * 4, inside = edgeInside(m, x, y, v);
        if (inside <= 0) d[k + 3] = 0;
        else if (inside < 0.07) {
          d[k] *= 0.72;
          d[k + 1] *= 0.72;
          d[k + 2] *= 0.72;
        }
      }
      g.putImageData(img, x0, y0);
    }
    const sheet = Texture.from(cv);
    sheet.source.scaleMode = 'nearest';
    const out: Look[][] = [[]];
    for (let m = 1; m <= 14; m++) {
      out[m] = [];
      for (let v = 0; v < EDGE_VARIANTS; v++) {
        const t = new Texture({ source: sheet.source, frame: new Rectangle((m - 1) * P, v * P, P, P) });
        out[m].push({ tex: [t], ms: 0, dx: 0, dy: 0, tint: 0xffffff, seasonal: base?.seasonal });
      }
    }
    return out;
  }

  /**
   * How a tile, decoration or part at (tx, ty) is drawn: its join frame, else a variant chosen by
   * position; for the first of `seasons` (such as snow lying, then the season) that has frames of
   * its own, those.
   */
  get(layer: FrameLayer, name: string, tx: number, ty: number, mask = -1, seasons: readonly string[] = []): Look | null {
    for (const key of lookKeys(layer, name, mask, seasons)) {
      const list = this.looks.get(key);
      if (list?.length) return list.length === 1 ? list[0] : list[hash(tx, ty) % list.length];
    }
    return null;
  }

}

/**
 * A placeholder figure (16 × 16): a person from above and a little in front, facing a way; frame 0
 * standing, 1 and 2 a stride with one leg and then the other.
 */
function drawFigure(g: CanvasRenderingContext2D, x: number, y: number, d: Facing, fr: number, c: FigureColours): void {
  const rect = (rx: number, ry: number, w: number, h: number, fill: string) => {
    g.fillStyle = fill;
    g.fillRect(x + rx, y + ry, w, h);
  };
  const side = d === 'e' || d === 'w', flip = d === 'w';
  const X = (rx: number, w = 1) => (flip ? 16 - rx - w : rx);
  // A shadow at the feet.
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(x + 4, y + 14, 8, 2);
  // Legs: apart in a stride, together standing.
  const legs = shade(c.clothes, 0.6);
  if (side) {
    const a = fr === 1 ? -1 : fr === 2 ? 1 : 0;
    rect(X(7 + a), 12, 2, 3, legs);
    rect(X(7 - a), 12, 2, 3, shade(legs, 0.8));
  } else {
    rect(6, 12, 2, fr === 1 ? 2 : 3, legs);
    rect(9, 12, 2, fr === 2 ? 2 : 3, legs);
  }
  // Body and arms.
  rect(side ? 6 : 5, 7, side ? 5 : 7, 6, c.clothes);
  rect(side ? 6 : 5, 7, side ? 5 : 7, 1, shade(c.clothes, 1.2));
  if (side) rect(X(fr === 1 ? 10 : fr === 2 ? 7 : 8), 8, 2, 4, c.skin);
  else {
    rect(4, 8, 1, 4, c.skin);
    rect(12, 8, 1, 4, c.skin);
  }
  // Head, hair, and the face where it shows.
  rect(6, 2, 5, 5, c.skin);
  if (d === 'n') rect(6, 2, 5, 5, c.hair);
  else if (d === 's') {
    rect(6, 2, 5, 2, c.hair);
    rect(7, 4, 1, 1, '#2a2020');
    rect(9, 4, 1, 1, '#2a2020');
  } else {
    rect(X(6, 3), 2, 3, 5, c.hair);
    rect(6, 2, 5, 1, c.hair);
    rect(X(9), 4, 1, 1, '#2a2020');
  }
}

/**
 * A roof's placeholder: one tile of a plane of it seen from straight above, lit from the north
 * (slopes facing north lighter, south darker), with the courses of its material running across
 * the fall of the slope and a darker line along the eaves (the sides with no more roof).
 */
function drawRoof(g: CanvasRenderingContext2D, x: number, y: number, mat: RoofMaterial, pl: RoofPlane, m: number): void {
  const P = TILE_PX, base = ROOF_MATERIALS[mat];
  const lit = { n: 1.12, e: 0.94, s: 0.78, w: 1.02, ridge_ew: 1, ridge_ns: 1, flat: 0.98, peak: 1.15 }[pl];
  const c = shade(base, lit);
  const rect = (rx: number, ry: number, w: number, h: number, fill: string) => {
    g.fillStyle = fill;
    g.fillRect(x + rx, y + ry, w, h);
  };
  rect(0, 0, P, P, c);
  // Courses across the fall: rows for slopes falling north or south, columns for east or west.
  const across = pl === 'n' || pl === 's' || pl === 'ridge_ew' || pl === 'flat';
  const line = shade(base, lit * 0.82);
  if (mat === 'thatch' || mat === 'turf') {
    for (let i = 0; i < 14; i++) {
      const h = hash(i * 3 + m, mat.length * 5 + i);
      rect(h % P, (h >>> 8) % P, across ? 2 : 1, across ? 1 : 2, mat === 'turf' ? shade('#6a8a40', lit) : line);
    }
  } else if (mat !== 'flat') {
    for (let k = 2; k < P; k += 4) {
      if (across) rect(0, k, P, 1, line);
      else rect(k, 0, 1, P, line);
      // Joints between the tiles or slates, staggered course by course.
      for (let j = (k % 8 === 2 ? 1 : 4); j < P; j += 6) {
        if (across) rect(j, k - 2, 1, 2, line);
        else rect(k - 2, j, 2, 1, line);
      }
    }
  } else {
    rect(2, 2, P - 4, P - 4, shade(base, lit * 1.04));
  }
  if (pl === 'ridge_ew') rect(0, 7, P, 2, shade(base, 0.62));
  if (pl === 'ridge_ns') rect(7, 0, 2, P, shade(base, 0.62));
  if (pl === 'peak') rect(6, 6, 4, 4, shade(base, 0.62));
  // The eaves: a darker edge where the roof ends.
  const eave = shade(base, 0.55);
  if (!(m & N)) rect(0, 0, P, 1, eave);
  if (!(m & S)) rect(0, P - 1, P, 1, eave);
  if (!(m & W)) rect(0, 0, 1, P, eave);
  if (!(m & E)) rect(P - 1, 0, 1, P, eave);
}

/** Groups drawn as walls: the top seen from straight above, a darker face where open to the south. */
const WALL_GROUPS = new Set(['wall', 'townwall', 'palisade', 'hedge', 'trunk']);
/** Long furniture drawn as benches (narrow across their length). */
const NARROW = new Set(['bench', 'pew']);
/** A neutral wall for a window's frame (the wall it sits in is not known here). */
const WINDOW_WALL = '#8c8780';

/**
 * A joined piece's placeholder (top-down, as in RimWorld; mask: joined sides, north 1, east 2,
 * south 4, west 8): walls fill the tile with a face on the south where open; doors, gates and
 * windows lie across the wall the way it runs; long furniture runs on unbroken into its own kind.
 */
function drawJoined(g: CanvasRenderingContext2D, x: number, y: number, d: TileDef, m: number): void {
  const P = TILE_PX, c = d.colour;
  // Which way the line runs: east-west, unless it joins only to the north or south.
  const across = !!(m & (E | W)) || !(m & (N | S));
  const rect = (rx: number, ry: number, w: number, h: number, fill: string) => {
    g.fillStyle = fill;
    g.fillRect(x + rx, y + ry, w, h);
  };
  /** A wall's top with its face to the south where nothing joins there. */
  const wall = (colour: string) => {
    rect(0, 0, P, P, colour);
    // Coursing: a few darker joints.
    for (let r = 3; r < P - 4; r += 4) rect(r % 8 === 3 ? 2 : 6, r, 5, 1, shade(colour, 0.88));
    if (!(m & N)) rect(0, 0, P, 1, shade(colour, 1.15));
    if (!(m & W)) rect(0, 0, 1, P, shade(colour, 0.8));
    if (!(m & E)) rect(P - 1, 0, 1, P, shade(colour, 0.8));
    if (!(m & S)) {
      rect(0, P - 4, P, 4, shade(colour, 0.62));
      rect(0, P - 1, P, 1, shade(colour, 0.45));
    }
  };
  if (d.name === 'window') {
    wall(WINDOW_WALL);
    if (across) rect(1, 6, P - 2, 3, c);
    else rect(6, 1, 3, P - 2, c);
    return;
  }
  if (/^(door|gate)/.test(d.name)) {
    const post = shade(c, 0.55), open = d.name.endsWith('_open'), leaf = shade(c, d.name.startsWith('gate') ? 0.85 : 1);
    if (across) {
      rect(0, 4, 2, 8, post);
      rect(P - 2, 4, 2, 8, post);
      if (open) {
        rect(2, 6, 2, 9, leaf);
        if (d.name.startsWith('gate')) rect(P - 4, 6, 2, 9, leaf);
      } else {
        rect(2, 6, P - 4, 4, leaf);
        rect(2, 9, P - 4, 1, shade(c, 0.6));
        for (let px = 5; px < P - 2; px += 3) rect(px, 6, 1, 3, shade(c, 0.8));
        if (d.name.startsWith('gate')) rect(P / 2, 6, 1, 4, post);
      }
    } else {
      rect(4, 0, 8, 2, post);
      rect(4, P - 2, 8, 2, post);
      if (open) {
        rect(6, 2, 9, 2, leaf);
        if (d.name.startsWith('gate')) rect(6, P - 4, 9, 2, leaf);
      } else {
        rect(6, 2, 4, P - 4, leaf);
        rect(9, 2, 1, P - 4, shade(c, 0.6));
        for (let py = 5; py < P - 2; py += 3) rect(6, py, 3, 1, shade(c, 0.8));
        if (d.name.startsWith('gate')) rect(6, P / 2, 4, 1, post);
      }
    }
    return;
  }
  if (d.group && WALL_GROUPS.has(d.group)) {
    wall(c);
    if (d.group === 'palisade') for (let px = 1; px < P; px += 3) rect(px, 0, 1, P - 4, shade(c, 0.75));
    return;
  }
  if (d.group === 'fence') {
    // A light fence: a rail toward each joined side, posts at the middle.
    const rail = shade(c, 0.9);
    if (m & N) rect(7, 0, 2, 8, rail);
    if (m & S) rect(7, 8, 2, 8, rail);
    if (m & W) rect(0, 7, 8, 2, rail);
    if (m & E) rect(8, 7, 8, 2, rail);
    rect(6, 6, 4, 4, c);
    return;
  }
  // Long furniture: a top that runs on into its own kind, rimmed on the open sides, a little
  // face to the south for its height (not rugs, which lie flat).
  const narrow = NARROW.has(d.name), flat = d.name === 'rug';
  const inset = (side: number, n: number) => (m & side ? 0 : n);
  let x0 = inset(W, 1), y0 = inset(N, 1), x1 = P - inset(E, 1), y1 = P - inset(S, flat ? 1 : 3);
  if (narrow && across) {
    y0 = 5;
    y1 = 10;
  } else if (narrow) {
    x0 = 5;
    x1 = 11;
  }
  if (flat) {
    x0 = inset(W, 2);
    y0 = inset(N, 2);
    x1 = P - inset(E, 2);
    y1 = P - inset(S, 2);
  }
  rect(x0, y0, x1 - x0, y1 - y0, c);
  if (!flat) {
    if (!(m & S) || narrow) rect(x0, y1, x1 - x0, 2, shade(c, 0.6));
    if (!(m & N) && !narrow) rect(x0, y0, x1 - x0, 1, shade(c, 1.15));
  } else {
    // A rug's border along its open sides.
    const b = shade(c, 1.35);
    if (!(m & N)) rect(x0, y0 + 1, x1 - x0, 1, b);
    if (!(m & S)) rect(x0, y1 - 2, x1 - x0, 1, b);
    if (!(m & W)) rect(x0 + 1, y0, 1, y1 - y0, b);
    if (!(m & E)) rect(x1 - 2, y0, 1, y1 - y0, b);
  }
  if (d.name === 'bed') {
    // The frame, and the pillow at the head: the end with nothing joined (north, else west).
    const frame = '#7a5030';
    if (!(m & W)) rect(x0, y0, 1, y1 - y0, frame);
    if (!(m & E)) rect(x1 - 1, y0, 1, y1 - y0, frame);
    if (!(m & N)) rect(x0, y0, x1 - x0, 1, frame);
    const vertical = !!(m & (N | S)) || !(m & (E | W));
    if (vertical && !(m & N)) rect(x0 + 2, y0 + 1, x1 - x0 - 4, 4, '#ece6da');
    else if (!vertical && !(m & W)) rect(x0 + 1, y0 + 2, 4, y1 - y0 - 4, '#ece6da');
  } else if (d.name === 'shelf' || d.name === 'bookcase') {
    const books = ['#a04030', '#305a8a', '#c0a040', '#4a7a40'];
    for (let i = 0; i < 6; i++) rect(x0 + 1 + ((i * 5) % Math.max(1, x1 - x0 - 2)), y0 + 2 + (i % 2) * 5, 2, 3, books[i % 4]);
  } else if (!narrow && !flat) {
    // Boards along the piece.
    if (across) for (let py = y0 + 3; py < y1 - 1; py += 4) rect(x0, py, x1 - x0, 1, shade(c, 0.85));
    else for (let px = x0 + 3; px < x1 - 1; px += 4) rect(px, y0, 1, y1 - y0, shade(c, 0.85));
  }
}

/**
 * A tree part's placeholder: a trunk's cut (or a quarter of a wide one), roots reaching in from a
 * side, branches toward the joined sides, leaves filling the tile and rounded where not joined.
 */
function drawTreePlaceholder(g: CanvasRenderingContext2D, x: number, y: number, k: TreeKind, f: TreeFrame, m: number): void {
  const P = TILE_PX, bark = k.bark, dark = shade(k.bark, 0.6);
  const disc = (cx: number, cy: number, r: number, fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  };
  g.save();
  g.beginPath();
  g.rect(x, y, P, P);
  g.clip();
  if (f === 'trunk') {
    disc(x + 8, y + 8, 5.5, dark);
    disc(x + 8, y + 8, 4.5, bark);
    disc(x + 8, y + 8, 1.5, dark);
  } else if (f === 'trunk2') {
    // The middle of a wide trunk is the corner the four tiles share.
    const cx = m === 1 || m === 8 ? x + P : x, cy = m === 1 || m === 2 ? y + P : y;
    disc(cx, cy, 13, dark);
    disc(cx, cy, 11.5, bark);
    disc(cx, cy, 6, shade(k.bark, 0.85));
    disc(cx, cy, 2, dark);
  } else if (f === 'roots') {
    g.fillStyle = dark;
    // Three roots from the side toward the trunk, tapering out.
    for (const o of [3, 8, 12]) {
      for (let t = 0; t < 7; t++) {
        const w = t < 3 ? 2 : 1;
        const [px, py] = m === 1 ? [o, t] : m === 4 ? [o, P - 1 - t] : m === 2 ? [P - 1 - t, o] : [t, o];
        g.fillRect(x + px, y + py, w, w);
      }
    }
  } else if (f === 'branch') {
    g.fillStyle = bark;
    g.fillRect(x + 6, y + 6, 4, 4);
    if (m & 1) g.fillRect(x + 7, y, 2, 7);
    if (m & 2) g.fillRect(x + 9, y + 7, 7, 2);
    if (m & 4) g.fillRect(x + 7, y + 9, 2, 7);
    if (m & 8) g.fillRect(x, y + 7, 7, 2);
    if (!m) for (let t = 0; t < 6; t++) g.fillRect(x + 3 + t * 2, y + 3 + t * 2, 2, 2);
  } else {
    const inset = (side: number) => (m & side ? 0 : 2);
    const x0 = x + inset(8), y0 = y + inset(1), x1 = x + P - inset(2), y1 = y + P - inset(4);
    g.fillStyle = k.leaves;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    // A darker rim along the open sides only, so that joined leaves run on unbroken.
    g.fillStyle = shade(k.leaves, 0.75);
    if (!(m & 1)) g.fillRect(x0, y0, x1 - x0, 1);
    if (!(m & 2)) g.fillRect(x1 - 1, y0, 1, y1 - y0);
    if (!(m & 4)) g.fillRect(x0, y1 - 1, x1 - x0, 1);
    if (!(m & 8)) g.fillRect(x0, y0, 1, y1 - y0);
    g.fillStyle = shade(k.leaves, 1.25);
    for (let i = 0; i < 9; i++) {
      const h = hash(i * 5 + m, k.name.length + i);
      g.fillRect(x0 + 1 + (h % Math.max(1, x1 - x0 - 3)), y0 + 1 + ((h >>> 8) % Math.max(1, y1 - y0 - 3)), 2, 1);
    }
    // Rounded corners where two open sides meet.
    if (!(m & 1) && !(m & 8)) g.clearRect(x0, y0, 1, 1);
    if (!(m & 1) && !(m & 2)) g.clearRect(x1 - 1, y0, 1, 1);
    if (!(m & 4) && !(m & 2)) g.clearRect(x1 - 1, y1 - 1, 1, 1);
    if (!(m & 4) && !(m & 8)) g.clearRect(x0, y1 - 1, 1, 1);
  }
  g.restore();
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
