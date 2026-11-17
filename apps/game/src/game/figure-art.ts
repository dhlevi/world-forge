/**
 * Puts layered figures together for drawing (docs/design/npcs.md, Figures): a figure's layers
 * (the tileset's art, or placeholders) drawn one over another in order, each tinted by its colour,
 * into a picture per facing, standing and walking. Pictures are kept by the figure's key, so a
 * crowd in the same clothes shares them.
 */
import { Container, Rectangle, RenderTexture, Sprite, Texture, type Renderer as PixiRenderer } from 'pixi.js';
import { SHORTEN_ROWS, WEAR_SHAPES, YOUNG_SCALE, figureKey, type FigureSpec } from '@worldforge/core/local/figures';
import type { Facing } from '@worldforge/core/local/tiles';
import { TILE_PX, type Look, type Tileset } from './tileset';
import { kindScale } from './figure';

/** The picture's box: room above the tile for a tall figure, and to either side. */
const BOX_W = 2 * TILE_PX, BOX_H = 2 * TILE_PX, OX = TILE_PX / 2, OY = TILE_PX;
/** Pictures kept before the oldest are let go. */
const KEEP = 400;

const SLOT = new Map(WEAR_SHAPES.map((w) => [w.name, w.slot]));
const hex = (c: string) => parseInt(c.slice(1), 16) || 0xffffff;

export class FigureArt {
  private cache = new Map<string, Look>();

  constructor(private tiles: Tileset, private renderer: () => PixiRenderer) {}

  /** The layers of a figure, in drawing order, with their tints. */
  private layers(f: FigureSpec): { name: string; tint: number }[] {
    const out = [{ name: `body_${f.kind}_${f.female ? 'f' : 'm'}`, tint: hex(f.skin) }];
    const wear = (slots: string[]) => {
      for (const w of f.wear) if (slots.includes(this.slotOf(w.shape))) out.push({ name: `wear_${w.shape}`, tint: hex(w.colour) });
    };
    wear(['legs', 'feet', 'hands', 'body', 'armour', 'belt', 'outer', 'cloak']);
    if (f.hair.style !== 'none') out.push({ name: `hair_${f.hair.style}`, tint: hex(f.hair.colour) });
    if (f.beard.style !== 'none') out.push({ name: `beard_${f.beard.style}`, tint: hex(f.beard.colour) });
    wear(['face', 'head']);
    return out;
  }

  private slotOf(shape: string): string {
    return SLOT.get(shape) ?? 'body';
  }

  /** A figure facing a way, standing or walking, as one look (frames for a walk). */
  look(f: FigureSpec, facing: Facing, walking: boolean): Look {
    const key = `${figureKey(f)}|${facing}|${walking ? 1 : 0}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const layers = this.layers(f).map((l) => ({ ...l, ...this.tiles.figureLayer(l.name, facing, walking) }));
    // Every layer is drawn on a human frame (garments fit any body): a shorter kind loses rows toward the feet.
    const squash = kindScale(f.kind) * (f.young ? YOUNG_SCALE : 1);
    const drop = new Set(SHORTEN_ROWS.slice(0, Math.round(TILE_PX * (1 - squash))).map((r) => OY + r));
    const n = walking ? Math.max(...layers.map((l) => l.look.tex.length)) : 1;
    const frames: Texture[] = [];
    for (let i = 0; i < n; i++) {
      const c = new Container();
      for (const l of layers) {
        const sp = new Sprite(l.look.tex[i % l.look.tex.length]);
        sp.tint = l.tint;
        sp.x = OX + l.look.dx + (l.flip ? sp.texture.frame.width : 0);
        sp.y = OY + l.look.dy;
        if (l.flip) sp.scale.x = -1;
        c.addChild(sp);
      }
      const rt = RenderTexture.create({ width: BOX_W, height: BOX_H });
      rt.source.scaleMode = 'nearest';
      this.renderer().render({ container: c, target: rt, clear: true });
      c.destroy({ children: true });
      frames.push(drop.size ? this.shorten(rt, drop) : rt);
    }
    const look: Look = { tex: frames, ms: walking ? Math.max(...layers.map((l) => l.look.ms || 70)) : 0, dx: -OX, dy: -OY, tint: 0xffffff };
    if (this.cache.size >= KEEP) {
      const [old, v] = this.cache.entries().next().value!;
      this.cache.delete(old);
      for (const t of v.tex) t.destroy(true);
    }
    this.cache.set(key, look);
    return look;
  }

  /** The picture without the given rows, the rest closed up toward the feet. */
  private shorten(full: RenderTexture, drop: Set<number>): RenderTexture {
    const c = new Container();
    for (let y = BOX_H - 1, to = BOX_H - 1; y >= 0; y--) {
      if (drop.has(y)) continue;
      const sp = new Sprite(new Texture({ source: full.source, frame: new Rectangle(0, y, BOX_W, 1) }));
      sp.y = to--;
      c.addChild(sp);
    }
    const rt = RenderTexture.create({ width: BOX_W, height: BOX_H });
    rt.source.scaleMode = 'nearest';
    this.renderer().render({ container: c, target: rt, clear: true });
    c.destroy({ children: true });
    full.destroy(true);
    return rt;
  }
}

