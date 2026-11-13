/**
 * Draws the map round the wanderer with PixiJS: a ground layer and an object layer of sprites,
 * one per screen tile, given new pictures each time the view changes. Tiles in sight are drawn
 * as they are; tiles seen before are dimmed; the rest is dark.
 *
 * The hour and the season show too (game/weather.ts): tiles are tinted by how lit they are and by
 * what (the sky's colour at dawn, by day, at dusk and by night, or the warm light of a fire), snow
 * lies over open ground, and the broadleaf trees and the grass turn with the seasons.
 */
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
// Pixi builds its shaders without eval with this; the desktop app's page allows no eval.
import 'pixi.js/unsafe-eval';
import { GROUND_TILES, OBJECT_TILES, type TileDef } from '@worldforge/core/local/tiles';
import { TILE_PX, Tileset, N, E, S, W } from './tileset';
import type { Game } from './game';

const REMEMBERED = 0x6a6e82;
const FIRE = 0xffc890;
const SEASON_TREES = new Set(['tree_broadleaf', 'tree_birch', 'bush']);
const GRASSY = new Set(['grass', 'grass_lush', 'grass_dry']);

/** A colour scaled toward black (level 1: as it is). */
function shade(c: number, level: number): number {
  const k = Math.max(0, Math.min(1, level));
  const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}
/** Two colours multiplied (tints combine so). */
function mul(a: number, b: number): number {
  const r = (((a >> 16) & 255) * ((b >> 16) & 255)) / 255, g = (((a >> 8) & 255) * ((b >> 8) & 255)) / 255, bl = ((a & 255) * (b & 255)) / 255;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

export class Renderer {
  readonly app = new Application();
  private ground = new Container();
  private objects = new Container();
  private gs: Sprite[] = [];
  private os: Sprite[] = [];
  private snow = new Container();
  private ss: Sprite[] = [];
  /** The look of the hour and season: the sky's colour, snow lying (cm), the season. */
  look = { sky: 0xffffff, snowCm: 0, season: 'summer', light: 1 };
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
    this.app.stage.addChild(this.ground, this.snow, this.objects, this.player, this.cursor);
    this.player.texture = this.playerTexture();
    this.itemTex = this.glyphTexture('*', '#f3d27a');
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on('pointermove', (e) => {
      const s = TILE_PX * this.zoom;
      this.onHover(Math.floor(e.global.x / s) - this.ox, Math.floor(e.global.y / s) - this.oy);
    });
  }

  private itemTex: Texture = Texture.EMPTY;

  /** A glyph as a texture (things lying on the ground). */
  private glyphTexture(ch: string, colour: string): Texture {
    const c = document.createElement('canvas');
    c.width = c.height = TILE_PX;
    const g = c.getContext('2d')!;
    g.font = `bold ${TILE_PX - 3}px monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.7)';
    g.fillText(ch, TILE_PX / 2 + 1, TILE_PX / 2 + 2);
    g.fillStyle = colour;
    g.fillText(ch, TILE_PX / 2, TILE_PX / 2 + 1);
    const t = Texture.from(c);
    t.source.scaleMode = 'nearest';
    return t;
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
    this.snow.removeChildren();
    this.gs = [];
    this.os = [];
    this.ss = [];
    for (let i = 0; i < cols * rows; i++) {
      const g = new Sprite(), o = new Sprite(), sn = new Sprite(Texture.WHITE);
      g.x = o.x = sn.x = (i % cols) * TILE_PX;
      g.y = o.y = sn.y = Math.floor(i / cols) * TILE_PX;
      sn.width = sn.height = TILE_PX;
      sn.visible = false;
      this.gs.push(g);
      this.os.push(o);
      this.ss.push(sn);
      this.ground.addChild(g);
      this.snow.addChild(sn);
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
    for (const c of [this.ground, this.snow, this.objects, this.player, this.cursor]) c.scale.set(z);
    const look = this.look;
    const snowA = look.snowCm >= 2 ? Math.min(0.8, 0.35 + look.snowCm / 40) : 0;
    const treeTint = look.season === 'autumn' ? 0xffa860 : look.season === 'winter' ? 0x9c8c7c : 0xffffff;
    const grassTint = look.season === 'winter' ? 0xc8c0a0 : look.season === 'autumn' ? 0xe8dca8 : 0xffffff;
    // Centre the wanderer.
    this.ox = Math.floor(this.cols / 2) - game.px;
    this.oy = Math.floor(this.rows / 2) - game.py;
    for (let i = 0; i < this.cols * this.rows; i++) {
      const tx = (i % this.cols) - this.ox, ty = Math.floor(i / this.cols) - this.oy;
      const g = this.gs[i], o = this.os[i];
      const vis = game.isVisible(tx, ty), seen = vis || game.map.wasSeen(tx, ty);
      const sn = this.ss[i];
      if (!seen || !game.map.loaded(tx, ty)) {
        g.visible = o.visible = sn.visible = false;
        continue;
      }
      // The light on it: the sky's (coloured by the hour), or a fire's.
      // Remembered ground dims with the dark, so that what is in sight stands out from it.
      let light = shade(REMEMBERED, 0.25 + 0.75 * look.light);
      if (vis) {
        const l = game.lightAt(tx, ty);
        light = l.fire ? shade(FIRE, 0.4 + 0.6 * l.level) : shade(look.sky, 0.45 + 0.55 * l.level);
      }
      const gd = GROUND_TILES[game.map.ground(tx, ty)];
      g.texture = this.tiles.get(gd, tx, ty, this.mask(gd, tx, ty, game, 'ground')) ?? Texture.EMPTY;
      g.tint = GRASSY.has(gd.name) && grassTint !== 0xffffff ? mul(light, grassTint) : light;
      g.visible = true;
      // Snow over open ground out of doors.
      const open = !gd.water && !gd.name.startsWith('floor_') && gd.pass;
      sn.visible = snowA > 0 && open;
      if (sn.visible) {
        sn.alpha = gd.name === 'road' || gd.name === 'street' ? snowA * 0.5 : snowA;
        sn.tint = mul(light, 0xf2f6ff);
      }
      const oid = game.map.object(tx, ty);
      if (oid) {
        const od = OBJECT_TILES[oid];
        o.texture = this.tiles.get(od, tx, ty, this.mask(od, tx, ty, game, 'object')) ?? Texture.EMPTY;
        o.tint = SEASON_TREES.has(od.name) && treeTint !== 0xffffff ? mul(light, treeTint) : light;
        o.visible = true;
      } else if (game.ground.has(tx, ty)) {
        // Things lying on the ground (not those put away in furniture, which stands over them).
        o.texture = this.itemTex;
        o.tint = light;
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
