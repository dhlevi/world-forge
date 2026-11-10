/**
 * Draws the map round the wanderer with PixiJS: a ground layer and an object layer of sprites,
 * one per screen tile, given new pictures each time the view changes. Tiles in sight are drawn
 * as they are; tiles seen before are dimmed; the rest is dark.
 */
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
// Pixi builds its shaders without eval with this; the desktop app's page allows no eval.
import 'pixi.js/unsafe-eval';
import { GROUND_TILES, OBJECT_TILES, type TileDef } from '@worldforge/core/local/tiles';
import { TILE_PX, Tileset, N, E, S, W } from './tileset';
import type { Game } from './game';

const REMEMBERED = 0x6a6e82;

export class Renderer {
  readonly app = new Application();
  private ground = new Container();
  private objects = new Container();
  private gs: Sprite[] = [];
  private os: Sprite[] = [];
  private player = new Sprite();
  private cursor = new Graphics();
  private cols = 0;
  private rows = 0;
  zoom = 2;
  /** Screen tile under the pointer, as a map tile. */
  onHover: (tx: number, ty: number) => void = () => {};

  constructor(private tiles: Tileset) {}

  async init(el: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: el, background: '#07080b', antialias: false, autoDensity: true, resolution: window.devicePixelRatio || 1 });
    el.appendChild(this.app.canvas);
    this.app.stage.addChild(this.ground, this.objects, this.player, this.cursor);
    this.player.texture = this.playerTexture();
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on('pointermove', (e) => {
      const s = TILE_PX * this.zoom;
      this.onHover(Math.floor(e.global.x / s) - this.ox, Math.floor(e.global.y / s) - this.oy);
    });
  }

  private playerTexture(): Texture {
    const c = document.createElement('canvas');
    c.width = c.height = TILE_PX;
    const g = c.getContext('2d')!;
    g.font = `bold ${TILE_PX - 1}px monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillText('@', TILE_PX / 2 + 1, TILE_PX / 2 + 2);
    g.fillStyle = '#ffe9a8';
    g.fillText('@', TILE_PX / 2, TILE_PX / 2 + 1);
    const t = Texture.from(c);
    t.source.scaleMode = 'nearest';
    return t;
  }

  /** Map tile at the top-left of the screen is (-ox, -oy). */
  private ox = 0;
  private oy = 0;

  private layout(): void {
    const s = TILE_PX * this.zoom;
    const cols = Math.ceil(this.app.screen.width / s) + 1, rows = Math.ceil(this.app.screen.height / s) + 1;
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    this.ground.removeChildren();
    this.objects.removeChildren();
    this.gs = [];
    this.os = [];
    for (let i = 0; i < cols * rows; i++) {
      const g = new Sprite(), o = new Sprite();
      g.x = o.x = (i % cols) * TILE_PX;
      g.y = o.y = Math.floor(i / cols) * TILE_PX;
      this.gs.push(g);
      this.os.push(o);
      this.ground.addChild(g);
      this.objects.addChild(o);
    }
  }

  private mask(def: TileDef, x: number, y: number, game: Game, layer: 'ground' | 'object'): number {
    if (def.join !== 'mask4') return -1;
    const same = (tx: number, ty: number) => {
      if (!game.map.loaded(tx, ty)) return true;
      const d = layer === 'ground' ? GROUND_TILES[game.map.ground(tx, ty)] : OBJECT_TILES[game.map.object(tx, ty)];
      return d.group === def.group;
    };
    return (same(x, y - 1) ? N : 0) | (same(x + 1, y) ? E : 0) | (same(x, y + 1) ? S : 0) | (same(x - 1, y) ? W : 0);
  }

  draw(game: Game): void {
    // Take up the element's size now (Pixi otherwise catches up a frame later).
    this.app.resize();
    this.layout();
    const z = this.zoom;
    for (const c of [this.ground, this.objects, this.player, this.cursor]) c.scale.set(z);
    // Centre the wanderer.
    this.ox = Math.floor(this.cols / 2) - game.px;
    this.oy = Math.floor(this.rows / 2) - game.py;
    for (let i = 0; i < this.cols * this.rows; i++) {
      const tx = (i % this.cols) - this.ox, ty = Math.floor(i / this.cols) - this.oy;
      const g = this.gs[i], o = this.os[i];
      const vis = game.isVisible(tx, ty), seen = vis || game.map.wasSeen(tx, ty);
      if (!seen || !game.map.loaded(tx, ty)) {
        g.visible = o.visible = false;
        continue;
      }
      const gd = GROUND_TILES[game.map.ground(tx, ty)];
      g.texture = this.tiles.get(gd, tx, ty, this.mask(gd, tx, ty, game, 'ground')) ?? Texture.EMPTY;
      g.tint = vis ? 0xffffff : REMEMBERED;
      g.visible = true;
      const oid = game.map.object(tx, ty);
      if (oid) {
        const od = OBJECT_TILES[oid];
        o.texture = this.tiles.get(od, tx, ty, this.mask(od, tx, ty, game, 'object')) ?? Texture.EMPTY;
        o.tint = vis ? 0xffffff : REMEMBERED;
        o.visible = true;
      } else o.visible = false;
    }
    // The player sprite sits on the stage itself: its place is in screen pixels.
    this.player.x = (game.px + this.ox) * TILE_PX * z;
    this.player.y = (game.py + this.oy) * TILE_PX * z;
    this.cursor.clear();
    if (game.cursor) {
      this.cursor.rect((game.cursor[0] + this.ox) * TILE_PX, (game.cursor[1] + this.oy) * TILE_PX, TILE_PX, TILE_PX).stroke({ color: 0xffd060, width: 1 / z });
    }
  }
}
