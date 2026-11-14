/**
 * Draws the map round the wanderer with PixiJS: a ground layer and an object layer of sprites,
 * one per screen tile, given new pictures each time the view changes. Tiles in sight are drawn
 * as they are; tiles seen before are dimmed; the rest is dark.
 *
 * Where kinds of ground meet on one level, the later terrain spreads a ragged edge over the other
 * (game/terrain.ts), drawn on a grid offset by half a tile. Over the ground, small decorations lie
 * on open ground (game/decor.ts). A tile's picture may be
 * larger than the tile (a tree rising above it) or animated (water, fire): sprites are placed by
 * the look's offset, drawn row by row from the top so that what stands lower on the screen is in
 * front, and animated pictures are turned over by the ticker.
 *
 * Height shows as levels (game/levels.ts). Normally the land is drawn as one surface: ground
 * lower than the wanderer's is darker, a level at a time, and a line marks each change of level
 * (a ramp) or a rock face (a cliff). Looking up or down (`view`) draws a slice at that level, as
 * in Dwarf Fortress: ground above the slice is solid earth, ground below it is seen through the
 * open air, darker the further down.
 *
 * Walls, doors and furniture are seen straight down (top-down, as in RimWorld): what stands tall
 * casts a short shadow on the ground to its south, the light being taken to fall from the north.
 *
 * The wanderer is a figure facing the way they last moved; a single step is shown as a short
 * walk from tile to tile, the view following (the map is drawn a tile wider all round for it).
 *
 * Roofs (core local/roofs.ts) cover buildings as an option: off, on, or (the default) on unless
 * the wanderer is inside, with a roof faded over whatever of the inside is in sight through a
 * door or window. Looking up and down, a roof shows in the slice at its own level, and slices
 * through a building's upper storeys show its outer walls round a dark, unexplored inside.
 *
 * Trees stand across levels (game/trees.ts): on the surface a tree is its trunk and roots, with
 * the ground under its leaves in shade; in a slice above the ground, its trunk, branches and
 * leaves at that level.
 *
 * The hour and the season show too (game/weather.ts): tiles are tinted by how lit they are and by
 * what (the sky's colour at dawn, by day, at dusk and by night, or the warm light of a fire), snow
 * lies over open ground, and the broadleaf trees and the grass turn with the seasons.
 */
import { Application, Container, Graphics, Sprite, Texture, type Ticker } from 'pixi.js';
// Pixi builds its shaders without eval with this; the desktop app's page allows no eval.
import 'pixi.js/unsafe-eval';
import { GROUND_TILES, OBJECT_TILES, joinsWith, objectId, standsTall, type Facing, type Season, type TileDef } from '@worldforge/core/local/tiles';
import { TREE_KINDS, TRUNK_PART } from '@worldforge/core/local/trees';
import { PART_NAMES, TreeView, treeAt, treeKindOf } from './trees';
import { TILE_PX, Tileset, N, E, S, W, type Look } from './tileset';
import { decorAt } from './decor';
import { levelOf, stepBetween } from './levels';
import { covers, roofPlane, type Roof } from '@worldforge/core/local/roofs';
import type { RoofMode } from './roofs-mode';
import { TERRAIN_OF, blendsAt } from './terrain';
import type { Game } from './game';

const REMEMBERED = 0x6a6e82;
/** How much of a roof shows over the inside of a building seen through a door or window. */
const ROOF_SEEN_THROUGH = 0.3;
/** The inside of a building's upper storeys, not yet explored. */
const UNEXPLORED = 0x16130f;

/** Snow this deep (cm) covers ground with no snow of its own drawn: the snow tile is drawn instead. */
const DEEP_SNOW_CM = 15;
const SNOW_ID = GROUND_TILES.findIndex((d) => d.name === 'snow');
const SNOW_TERRAIN = TERRAIN_OF[SNOW_ID];
/** How long a step takes to show (ms). */
const STEP_MS = 130;
/** Solid ground above a slice. */
const EARTH = 0x4a4034;
/** How much the leaves above darken the ground under them, on the surface. */
const CANOPY_SHADE = 0.8;
const TRUNK_ID = objectId(TRUNK_PART)!;
/** Tree kinds whose leaves turn with the seasons. */
const SEASON_KINDS = new Set(['broadleaf', 'birch']);
/** How much darker each level below is, on the surface and in a slice. */
const BELOW_SURFACE = 0.13, BELOW_SLICE = 0.72;
const FIRE = 0xffc890;
const SEASON_TREES = new Set(['tree_broadleaf', 'tree_birch', 'bush']);
const GRASSY = new Set(['grass', 'grass_lush', 'grass_dry']);

/** A colour scaled toward black (level 1: as it is). */
function shade(c: number, level: number): number {
  const k = Math.max(0, Math.min(1, level));
  const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}
/** The one side roots are drawn reaching in from (frames are for one side; the first of several). */
function rootSide(sides: number): number {
  return sides & 1 ? 1 : sides & 2 ? 2 : sides & 4 ? 4 : 8;
}

/** Two colours multiplied (tints combine so). */
function mul(a: number, b: number): number {
  const r = (((a >> 16) & 255) * ((b >> 16) & 255)) / 255, g = (((a >> 8) & 255) * ((b >> 8) & 255)) / 255, bl = ((a & 255) * (b & 255)) / 255;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

export class Renderer {
  readonly app = new Application();
  private ground = new Container();
  /** Soft edges between kinds of ground, a pool of sprites used as needed. */
  private blends = new Container();
  private bs: Sprite[] = [];
  private decor = new Container();
  /** Objects, and the wanderer among them, sorted by row (zIndex) so that lower rows are in front. */
  private objects = new Container({ sortableChildren: true });
  private gs: Sprite[] = [];
  private ds: Sprite[] = [];
  private os: Sprite[] = [];
  /** Tree parts on the level of a slice, one sprite a tile, over everything else. */
  private canopy = new Container();
  private cs: Sprite[] = [];
  /** Sprites showing an animated look, and the look (turned over by the ticker). */
  private animated: { sprite: Sprite; look: Look }[] = [];
  private snow = new Container();
  private ss: Sprite[] = [];
  /** The look of the hour and season: the sky's colour, snow lying (cm), the season. */
  look: { sky: number; snowCm: number; season: Season; light: number } = { sky: 0xffffff, snowCm: 0, season: 'summer', light: 1 };
  private player = new Sprite();
  /** The step being shown: the way it went, and when it began (the map slides behind the wanderer). */
  private slide: { dx: number; dy: number; t0: number } | null = null;
  /** The game's step count and place at the last drawing (to tell a single step from a jump). */
  private lastStep = { steps: -1, x: 0, y: 0 };
  /** How the wanderer stands, and where (tile pixels), for the ticker. */
  private me = { x: 0, y: 0, facing: 's' as Facing, flip: false, standing: null as Look | null, walking: null as Look | null };
  private cursor = new Graphics();
  /** Lines where the level changes. */
  private edges = new Graphics();
  /** Shadows cast by walls and other tall things on the ground to their south. */
  private shadows = new Graphics();
  /** Levels looked up (positive) or down from the wanderer's (0: the surface). */
  view = 0;
  /** Roofs: never, always, or unless the wanderer is inside (fading over what is seen inside). */
  roofs: RoofMode = 'auto';
  /** One roof sprite a screen tile, among the objects (over the furniture, behind a figure in front). */
  private rs: Sprite[] = [];
  private solidTex: Texture = Texture.EMPTY;
  private cols = 0;
  private rows = 0;
  zoom = 2;
  /** Screen tile under the pointer, as a map tile. */
  onHover: (tx: number, ty: number) => void = () => {};

  constructor(private tiles: Tileset) {}

  async init(el: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: el, background: '#07080b', antialias: false, autoDensity: true, resolution: window.devicePixelRatio || 1 });
    el.appendChild(this.app.canvas);
    this.app.stage.addChild(this.ground, this.blends, this.decor, this.snow, this.shadows, this.edges, this.objects, this.canopy, this.cursor);
    this.solidTex = this.solidTexture();
    this.objects.addChild(this.player);
    this.app.ticker.add(this.animate);
    this.itemLook = { tex: [this.glyphTexture('*', '#f3d27a')], ms: 0, dx: 0, dy: 0, tint: 0xffffff };
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on('pointermove', (e) => {
      // The map is drawn from a tile above and to the left of the screen's corner.
      const s = TILE_PX * this.zoom;
      this.onHover(Math.floor(e.global.x / s) + 1 - this.ox, Math.floor(e.global.y / s) + 1 - this.oy);
    });
  }

  private itemLook: Look | null = null;

  /** Turns over the pictures of animated looks (all in step, by the clock). */
  private animate = (_t: Ticker): void => {
    const now = performance.now();
    for (const { sprite, look } of this.animated) {
      const tex = look.tex[Math.floor(now / look.ms) % look.tex.length];
      if (sprite.texture !== tex) sprite.texture = tex;
    }
    this.place(now);
  };

  /** The layers' place for the step being shown, and the wanderer walking (or standing) in it. */
  private place(now: number): void {
    const z = this.zoom, T = TILE_PX;
    let t = 1;
    if (this.slide) {
      t = Math.min(1, (now - this.slide.t0) / STEP_MS);
      if (t >= 1) this.slide = null;
    }
    // Behind by what is left of the step: the map seems to move under the wanderer.
    const left = this.slide ? 1 - t : 0, ox = (this.slide?.dx ?? 0) * left * T, oy = (this.slide?.dy ?? 0) * left * T;
    for (const c of [this.ground, this.blends, this.decor, this.snow, this.shadows, this.edges, this.objects, this.canopy, this.cursor]) {
      c.x = (ox - T) * z;
      c.y = (oy - T) * z;
    }
    const me = this.me, look = this.slide && me.walking ? me.walking : me.standing;
    if (!look) return;
    const tex = look.tex.length > 1 ? look.tex[Math.floor(now / look.ms) % look.tex.length] : look.tex[0];
    if (this.player.texture !== tex) this.player.texture = tex;
    this.player.scale.x = me.flip ? -1 : 1;
    this.player.x = me.x - ox + look.dx + (me.flip ? tex.frame.width : 0);
    this.player.y = me.y - oy + look.dy;
  }

  /** Gives a sprite a look (or hides it): its picture, its place over its tile, its tint. */
  private show(sp: Sprite, look: Look | null, i: number, tint: number): void {
    if (!look) {
      sp.visible = false;
      return;
    }
    sp.texture = look.tex[look.tex.length > 1 ? Math.floor(performance.now() / look.ms) % look.tex.length : 0];
    sp.x = (i % this.cols) * TILE_PX + look.dx;
    sp.y = Math.floor(i / this.cols) * TILE_PX + look.dy;
    sp.tint = look.tint === 0xffffff ? tint : mul(tint, look.tint);
    sp.visible = true;
    if (look.tex.length > 1) this.animated.push({ sprite: sp, look });
  }

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

  /** Solid earth or rock (tinted), with a little texture. */
  private solidTexture(): Texture {
    const c = document.createElement('canvas');
    c.width = c.height = TILE_PX;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, TILE_PX, TILE_PX);
    g.fillStyle = '#d8d8d8';
    for (let i = 0; i < 9; i++) g.fillRect((i * 7 + 3) % TILE_PX, (i * 11 + 5) % TILE_PX, 2, 1);
    const t = Texture.from(c);
    t.source.scaleMode = 'nearest';
    return t;
  }

  /** The map tile drawn first, a tile above and to the left of the screen's corner, is (-ox, -oy). */
  private ox = 0;
  private oy = 0;

  private layout(): void {
    const s = TILE_PX * this.zoom;
    // A tile more than the screen all round, so that a step's slide shows no edge.
    const cols = Math.ceil(this.app.screen.width / s) + 3, rows = Math.ceil(this.app.screen.height / s) + 3;
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    this.ground.removeChildren();
    this.decor.removeChildren();
    this.objects.removeChildren();
    this.snow.removeChildren();
    this.canopy.removeChildren();
    this.cs = [];
    this.rs = [];
    this.objects.addChild(this.player);
    this.gs = [];
    this.ds = [];
    this.os = [];
    this.ss = [];
    for (let i = 0; i < cols * rows; i++) {
      const g = new Sprite(), d = new Sprite(), o = new Sprite(), sn = new Sprite(Texture.WHITE);
      sn.x = (i % cols) * TILE_PX;
      sn.y = Math.floor(i / cols) * TILE_PX;
      sn.width = sn.height = TILE_PX;
      sn.visible = false;
      // Each row in front of the one above it; the wanderer goes between (draw()).
      o.zIndex = Math.floor(i / cols) * 2;
      this.gs.push(g);
      this.ds.push(d);
      this.os.push(o);
      this.ss.push(sn);
      this.ground.addChild(g);
      this.decor.addChild(d);
      this.snow.addChild(sn);
      this.objects.addChild(o);
      const r = new Sprite();
      r.visible = false;
      r.zIndex = Math.floor(i / cols) * 2 + 1.5;
      this.rs.push(r);
      this.objects.addChild(r);
      const c = new Sprite();
      c.visible = false;
      this.cs.push(c);
      this.canopy.addChild(c);
    }
  }

  private mask(def: TileDef, x: number, y: number, game: Game, layer: 'ground' | 'object'): number {
    if (def.join !== 'mask4') return -1;
    const same = (tx: number, ty: number) => {
      if (!game.map.loaded(tx, ty)) return true;
      const d = layer === 'ground' ? GROUND_TILES[game.map.ground(tx, ty)] : OBJECT_TILES[game.map.object(tx, ty)];
      return joinsWith(def, d);
    };
    return (same(x, y - 1) ? N : 0) | (same(x + 1, y) ? E : 0) | (same(x, y + 1) ? S : 0) | (same(x - 1, y) ? W : 0);
  }

  /**
   * A tree's trunk on the ground: the tileset's trunk frame (or a wide trunk's quarter); with
   * none, a tileset's picture of the whole tree as before; with neither, the placeholder trunk.
   */
  private trunkLook(game: Game, tx: number, ty: number, quarter: number, seasons: readonly string[]): { look: Look | null; whole: boolean } {
    const t = treeAt(game.map, tx, ty);
    if (!t) return { look: null, whole: false };
    const k = TREE_KINDS[t.kind];
    if (quarter) return { look: this.tiles.get('tree', `trunk2_${k.name}`, tx, ty, quarter, seasons), whole: false };
    if (!this.tiles.drawn.has(`trunk_${k.name}`) && this.tiles.drawn.has(k.object)) return { look: this.tiles.get('object', k.object, tx, ty, -1, seasons), whole: true };
    return { look: this.tiles.get('tree', `trunk_${k.name}`, tx, ty, -1, seasons), whole: false };
  }

  /** Tree parts on the level of a slice: trunks, branches and leaves, in the tile's own light. */
  private drawCanopy(trees: TreeView, levels: Float64Array, solid: Uint8Array, light0: Uint32Array, treeTint: number, seasons: readonly string[]): void {
    for (let i = 0; i < this.cs.length; i++) {
      const sp = this.cs[i], p = trees.part[i];
      if (!p || solid[i] || Number.isNaN(levels[i])) {
        sp.visible = false;
        continue;
      }
      const k = TREE_KINDS[trees.partKind[i]].name;
      const tx = (i % this.cols) - this.ox, ty = Math.floor(i / this.cols) - this.oy;
      const look = PART_NAMES[p] === 'trunk'
        ? trees.quarter[i] ? this.tiles.get('tree', `trunk2_${k}`, tx, ty, trees.quarter[i], seasons) : this.tiles.get('tree', `trunk_${k}`, tx, ty, -1, seasons)
        : this.tiles.get('tree', `${PART_NAMES[p]}_${k}`, tx, ty, trees.mask(i), seasons);
      this.show(sp, look, i, PART_NAMES[p] === 'leaves' && SEASON_KINDS.has(k) && treeTint !== 0xffffff && !look?.seasonal ? mul(light0[i], treeTint) : light0[i]);
    }
  }

  /**
   * Soft edges between kinds of ground (game/terrain.ts): on each corner where four drawn tiles of
   * one level meet, the edge of every terrain there above the lowest, tinted as the tile it comes
   * from. A screen tile's map position is its screen position less `(ox, oy)`.
   */
  private drawBlends(terr: Int8Array, gnd: Uint8Array, gTint: Uint32Array, levels: Float64Array, snowy: Uint8Array, ox: number, oy: number, withSnow: readonly string[], inSeason: readonly string[]): void {
    const cols = this.cols, rows = this.rows, T = TILE_PX;
    let used = 0;
    const tt = [0, 0, 0, 0], ll = [0, 0, 0, 0], idx = [0, 0, 0, 0];
    for (let cy = 1; cy < rows; cy++) for (let cx = 1; cx < cols; cx++) {
      idx[0] = (cy - 1) * cols + cx - 1;
      idx[1] = (cy - 1) * cols + cx;
      idx[2] = cy * cols + cx;
      idx[3] = cy * cols + cx - 1;
      let skip = false;
      for (let q = 0; q < 4; q++) {
        tt[q] = terr[idx[q]];
        ll[q] = levels[idx[q]];
        if (tt[q] < -1) skip = true;
      }
      if (skip || (tt[0] === tt[1] && tt[1] === tt[2] && tt[2] === tt[3])) continue;
      for (const b of blendsAt(tt, ll)) {
        const k = idx[b.from];
        const look = this.tiles.edge(b.terrain, b.mask, GROUND_TILES[gnd[k]].name, cx - ox, cy - oy, snowy[k] ? withSnow : inSeason);
        if (!look) continue;
        let sp = this.bs[used];
        if (!sp) {
          sp = this.bs[used] = new Sprite();
          this.blends.addChild(sp);
        }
        used++;
        sp.texture = look.tex[0];
        // The cell is centred on the corner: half a tile up and to the left of the tile below it.
        sp.x = cx * T - T / 2 + look.dx;
        sp.y = cy * T - T / 2 + look.dy;
        sp.tint = gTint[k];
        sp.visible = true;
      }
    }
    for (let k = used; k < this.bs.length; k++) this.bs[k].visible = false;
  }

  /**
   * Roofs over the buildings in view. On the surface, each roof over its building (by the option);
   * in a slice, a roof at its own level (darker the further below), and between a building's
   * ground floor and its roof, the outer walls round a dark inside.
   */
  private drawRoofs(game: Game, levels: Float64Array, solid: Uint8Array, vis: Uint8Array, light0: Uint32Array, me: number, at: number, seasons: readonly string[]): void {
    for (const r of this.rs) r.visible = false;
    if (this.roofs === 'off') return;
    const cols = this.cols, rows = this.rows, x0 = -this.ox, y0 = -this.oy;
    const inside = (r: Roof) => covers(r, game.px, game.py);
    for (const roof of game.map.roofsIn(x0, y0, x0 + cols - 1, y0 + rows - 1)) {
      const ground = levelOf(roof.floorM), top = levelOf(roof.floorM + roof.heightM);
      const hidden = this.view === 0 && this.roofs === 'auto' && inside(roof);
      for (let ty = Math.max(roof.y0, y0); ty < Math.min(roof.y0 + roof.h, y0 + rows); ty++) {
        for (let tx = Math.max(roof.x0, x0); tx < Math.min(roof.x0 + roof.w, x0 + cols); tx++) {
          const i = (ty - y0) * cols + (tx - x0);
          if (!covers(roof, tx, ty) || Number.isNaN(levels[i]) || solid[i]) continue;
          // Between the ground floor and the roof, in a slice: walls round a dark inside.
          if (this.view !== 0 && at > ground && at < top) {
            const oid = game.map.object(tx, ty), tallHere = oid && standsTall(OBJECT_TILES[oid]);
            const g = this.gs[i];
            g.texture = this.solidTex;
            g.x = (i % cols) * TILE_PX;
            g.y = Math.floor(i / cols) * TILE_PX;
            g.tint = UNEXPLORED;
            this.ds[i].visible = false;
            if (tallHere) this.os[i].tint = light0[i];
            else this.os[i].visible = false;
            continue;
          }
          if (hidden || (this.view !== 0 && at < top)) continue;
          const plane = roofPlane(roof, tx, ty);
          const m = (covers(roof, tx, ty - 1) ? N : 0) | (covers(roof, tx + 1, ty) ? E : 0) | (covers(roof, tx, ty + 1) ? S : 0) | (covers(roof, tx - 1, ty) ? W : 0);
          const look = this.tiles.get('roof', `roof_${roof.material}_${plane}`, tx, ty, m, seasons);
          // As dark as the ground beneath it is below the wanderer (or the slice).
          const below = this.view === 0 ? me - top : at - top;
          const tint = below > 0 ? shade(light0[i], this.view === 0 ? Math.max(0.45, 1 - BELOW_SURFACE * below) : Math.max(0.2, BELOW_SLICE ** below)) : light0[i];
          const sp = this.rs[i];
          this.show(sp, look, i, tint);
          // Faded over the inside where it is in sight (through a door or a window).
          sp.alpha = this.view === 0 && this.roofs === 'auto' && vis[i] && GROUND_TILES[game.map.ground(tx, ty)].name.startsWith('floor_') ? ROOF_SEEN_THROUGH : 1;
        }
      }
    }
  }

  /**
   * Shadows south of what stands tall (walls, hedges, wardrobes): a band across the top of the
   * ground below, darkest at the foot, on the same level only.
   */
  private drawShadows(tall: Uint8Array, levels: Float64Array): void {
    const s = this.shadows, T = TILE_PX, cols = this.cols;
    s.clear();
    const near: [number, number][] = [], far: [number, number][] = [];
    for (let i = 0; i + cols < tall.length; i++) {
      const b = i + cols;
      if (tall[i] !== 1 || tall[b] !== 2 || levels[i] !== levels[b]) continue;
      const x = (b % cols) * T, y = Math.floor(b / cols) * T;
      near.push([x, y]);
      far.push([x, y + 3]);
    }
    if (near.length) {
      for (const [x, y] of near) s.rect(x, y, T, 3);
      s.fill({ color: 0x000000, alpha: 0.3 });
      for (const [x, y] of far) s.rect(x, y, T, 2);
      s.fill({ color: 0x000000, alpha: 0.13 });
    }
  }

  /**
   * Lines where the level changes between neighbouring tiles: a shadow along the lower side and a
   * light rim along the higher, thin for a ramp and heavy for a rock face (dimmer where only
   * remembered).
   */
  private drawEdges(levels: Float64Array, solid: Uint8Array, vis: Uint8Array): void {
    const e = this.edges, T = TILE_PX, cols = this.cols, rows = this.rows;
    e.clear();
    type Rect = [number, number, number, number];
    const shadow: Rect[][] = [[], [], [], []], rim: Rect[][] = [[], [], [], []];
    /** The strip of a tile along its side shared with its neighbour (`a` left of or above `b`). */
    const strip = (k: number, isA: boolean, vertical: boolean, width: number): Rect => {
      const x = (k % cols) * T, y = Math.floor(k / cols) * T;
      if (vertical) return [isA ? x + T - width : x, y, width, T];
      return [x, isA ? y + T - width : y, T, width];
    };
    const edge = (a: number, b: number, vertical: boolean) => {
      const la = levels[a], lb = levels[b];
      if (Number.isNaN(la) || Number.isNaN(lb) || (la === lb && solid[a] === solid[b]) || (solid[a] && solid[b])) return;
      const cliff = solid[a] !== solid[b] || stepBetween(la, lb) === 'cliff';
      const kind = (cliff ? 2 : 0) + (vis[a] && vis[b] ? 0 : 1);
      const aLow = solid[a] !== solid[b] ? !solid[a] : la < lb;
      shadow[kind].push(strip(aLow ? a : b, aLow, vertical, cliff ? 2 : 1));
      rim[kind].push(strip(aLow ? b : a, !aLow, vertical, 1));
    };
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (x + 1 < cols) edge(i, i + 1, true);
      if (y + 1 < rows) edge(i, i + cols, false);
    }
    // By kind: a ramp in sight, a ramp remembered, a cliff in sight, a cliff remembered.
    const SH = [0.32, 0.18, 0.62, 0.35], RIM = [0.12, 0.06, 0.3, 0.15];
    for (let k = 0; k < 4; k++) {
      if (shadow[k].length) {
        for (const r of shadow[k]) e.rect(...r);
        e.fill({ color: 0x000000, alpha: SH[k] });
      }
      if (rim[k].length) {
        for (const r of rim[k]) e.rect(...r);
        e.fill({ color: 0xffffff, alpha: RIM[k] });
      }
    }
  }

  draw(game: Game): void {
    // Take up the element's size now (Pixi otherwise catches up a frame later).
    this.app.resize();
    this.layout();
    const z = this.zoom;
    for (const c of [this.ground, this.blends, this.decor, this.snow, this.shadows, this.edges, this.objects, this.canopy, this.cursor]) c.scale.set(z);
    /** Each screen tile: 1 if what stands on it casts a shadow, 2 if it is ground that can take one. */
    const tall = new Uint8Array(this.cols * this.rows);
    /** Each screen tile's terrain (-2 where not drawn as ground), ground and tint, for the edges between kinds of ground. */
    const terr = new Int8Array(this.cols * this.rows).fill(-2), gnd = new Uint8Array(this.cols * this.rows), gTint = new Uint32Array(this.cols * this.rows);
    const me = game.map.level(game.px, game.py), at = me + this.view;
    /** Each screen tile's level, if drawn (NaN if not), for the lines between levels. */
    const levels = new Float64Array(this.cols * this.rows).fill(NaN);
    const solid = new Uint8Array(this.cols * this.rows);
    const vis = new Uint8Array(this.cols * this.rows);
    this.animated = [];
    const look = this.look;
    const snowA = look.snowCm >= 2 ? Math.min(0.8, 0.35 + look.snowCm / 40) : 0;
    /** Seasons whose frames to look for: snow lying (out of doors), then the season. */
    const inSeason = [look.season] as const, withSnow = ['snow', look.season] as const;
    const deep = look.snowCm >= DEEP_SNOW_CM && this.tiles.drawn.has('snow');
    const snowy = new Uint8Array(this.cols * this.rows);
    const treeTint = look.season === 'autumn' ? 0xffa860 : look.season === 'winter' ? 0x9c8c7c : 0xffffff;
    const grassTint = look.season === 'winter' ? 0xc8c0a0 : look.season === 'autumn' ? 0xe8dca8 : 0xffffff;
    // Centre the wanderer.
    this.ox = Math.floor(this.cols / 2) - game.px;
    this.oy = Math.floor(this.rows / 2) - game.py;
    const trees = new TreeView(game.map, -this.ox, -this.oy, this.cols, this.rows, this.view === 0 ? null : at);
    /** Each tile's light before it is darkened for depth (the light tree parts are drawn in). */
    const light0 = new Uint32Array(this.cols * this.rows);
    for (let i = 0; i < this.cols * this.rows; i++) {
      const tx = (i % this.cols) - this.ox, ty = Math.floor(i / this.cols) - this.oy;
      const g = this.gs[i], d = this.ds[i], o = this.os[i];
      const vis0 = game.isVisible(tx, ty), seen = vis0 || game.map.wasSeen(tx, ty);
      const sn = this.ss[i];
      if (!seen || !game.map.loaded(tx, ty)) {
        g.visible = d.visible = o.visible = sn.visible = false;
        continue;
      }
      const lv = game.map.level(tx, ty);
      levels[i] = lv;
      vis[i] = vis0 ? 1 : 0;
      // The light on it: the sky's (coloured by the hour), or a fire's.
      // Remembered ground dims with the dark, so that what is in sight stands out from it.
      let light = shade(REMEMBERED, 0.25 + 0.75 * look.light);
      if (vis0) {
        const l = game.lightAt(tx, ty);
        light = l.fire ? shade(FIRE, 0.4 + 0.6 * l.level) : shade(look.sky, 0.45 + 0.55 * l.level);
      }
      light0[i] = light;
      // In the shade of leaves above, on the surface.
      if (this.view === 0 && trees.shade[i]) light = shade(light, CANOPY_SHADE);
      // Lower ground darker; in a slice, ground above it solid.
      if (this.view === 0 ? lv < me : lv < at) light = shade(light, this.view === 0 ? Math.max(0.45, 1 - BELOW_SURFACE * (me - lv)) : Math.max(0.2, BELOW_SLICE ** (at - lv)));
      if (this.view !== 0 && lv > at) {
        solid[i] = 1;
        g.texture = this.solidTex;
        g.x = (i % this.cols) * TILE_PX;
        g.y = Math.floor(i / this.cols) * TILE_PX;
        g.tint = mul(light, EARTH);
        g.visible = true;
        d.visible = o.visible = sn.visible = false;
        continue;
      }
      let gid = game.map.ground(tx, ty), gd = GROUND_TILES[gid];
      // The season's frames, and snow's where it lies out of doors (game/tileset-format.ts).
      const open = !gd.water && !gd.name.startsWith('floor_') && gd.pass;
      const seasons = open && snowA > 0 ? withSnow : inSeason;
      snowy[i] = seasons === withSnow ? 1 : 0;
      // Deep snow over ground with no snow of its own drawn: the snow tile itself, when it has art.
      const ownSnow = this.tiles.seasons.has(`${gd.name}@snow`);
      if (open && deep && !ownSnow && TERRAIN_OF[gid] !== SNOW_TERRAIN) {
        gid = SNOW_ID;
        gd = GROUND_TILES[gid];
      }
      const gl = this.tiles.get('ground', gd.name, tx, ty, this.mask(gd, tx, ty, game, 'ground'), seasons);
      this.show(g, gl, i, GRASSY.has(gd.name) && grassTint !== 0xffffff && !gl?.seasonal ? mul(light, grassTint) : light);
      terr[i] = TERRAIN_OF[gid];
      gnd[i] = gid;
      gTint[i] = g.tint;
      const oid = game.map.object(tx, ty);
      // Roots about a tree's foot, else decorations on open ground (none under an object, or where things lie, or under deep snow).
      if (trees.roots[i] && !oid) this.show(d, this.tiles.get('tree', `roots_${TREE_KINDS[trees.rootKind[i]].name}`, tx, ty, rootSide(trees.roots[i]), seasons), i, light);
      else {
        const dec = !oid && !game.ground.has(tx, ty) && gid !== SNOW_ID ? decorAt(gid, tx, ty, look.season) : null;
        this.show(d, dec && this.tiles.get('decor', dec.name, tx, ty, -1, seasons), i, light);
      }
      // Snow lying, drawn over open ground that has no snow of its own to show.
      sn.visible = snowA > 0 && open && !ownSnow && gid !== SNOW_ID;
      if (sn.visible) {
        sn.alpha = gd.name === 'road' || gd.name === 'street' ? snowA * 0.5 : snowA;
        sn.tint = mul(light, 0xf2f6ff);
      }
      tall[i] = oid && standsTall(OBJECT_TILES[oid]) ? 1 : 2;
      if (oid && (oid === TRUNK_ID || treeKindOf(oid) >= 0)) {
        // A tree: its trunk (a quarter of it, if wide).
        // (A tileset's picture of the whole tree, standing in for trunk art, turns with the season.)
        const tl = this.trunkLook(game, tx, ty, trees.quarter[i], seasons);
        this.show(o, tl.look, i, tl.whole && !tl.look?.seasonal && SEASON_TREES.has(OBJECT_TILES[oid].name) && treeTint !== 0xffffff ? mul(light, treeTint) : light);
      } else if (oid) {
        const od = OBJECT_TILES[oid];
        const ol = this.tiles.get('object', od.name, tx, ty, this.mask(od, tx, ty, game, 'object'), seasons);
        this.show(o, ol, i, SEASON_TREES.has(od.name) && treeTint !== 0xffffff && !ol?.seasonal ? mul(light, treeTint) : light);
      } else if (game.ground.has(tx, ty)) {
        // Things lying on the ground (not those put away in furniture, which stands over them).
        this.show(o, this.itemLook, i, light);
      } else o.visible = false;
    }
    this.drawCanopy(trees, levels, solid, light0, treeTint, snowA > 0 ? withSnow : inSeason);
    this.drawBlends(terr, gnd, gTint, levels, snowy, this.ox, this.oy, withSnow, inSeason);
    this.drawRoofs(game, levels, solid, vis, light0, me, at, snowA > 0 ? withSnow : inSeason);
    this.drawShadows(tall, levels);
    this.drawEdges(levels, solid, vis);
    // The wanderer, in front of the row it stands on and behind the rows below; a single step
    // since the last drawing is shown as a walk.
    const last = this.lastStep;
    if (game.steps === last.steps + 1 && Math.max(Math.abs(game.px - last.x), Math.abs(game.py - last.y)) === 1) this.slide = { dx: game.px - last.x, dy: game.py - last.y, t0: performance.now() };
    else if (game.steps !== last.steps) this.slide = null;
    this.lastStep = { steps: game.steps, x: game.px, y: game.py };
    const stand = this.tiles.figure('person', game.facing, false), walk = this.tiles.figure('person', game.facing, true);
    this.me = { x: (game.px + this.ox) * TILE_PX, y: (game.py + this.oy) * TILE_PX, facing: game.facing, flip: stand?.flip ?? false, standing: stand?.look ?? null, walking: walk && walk.flip === stand?.flip ? walk.look : null };
    this.player.zIndex = (game.py + this.oy) * 2 + 1;
    this.place(performance.now());
    this.cursor.clear();
    if (game.cursor) {
      this.cursor.rect((game.cursor[0] + this.ox) * TILE_PX, (game.cursor[1] + this.oy) * TILE_PX, TILE_PX, TILE_PX).stroke({ color: 0xffd060, width: 1 / z });
    }
  }
}
