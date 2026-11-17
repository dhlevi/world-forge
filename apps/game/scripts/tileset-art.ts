/**
 * Paints the game's tileset in a top-down pixel-art style (after RimWorld and Dwarf Fortress
 * tilesets): every frame the tile registry asks for (TILESET.md), into public/tileset/tileset.png
 * and tileset.json. Deterministic, so running it again gives the same sheet.
 *
 *   npm run tileset:art            (add -- --preview for zoomed pages of the sheet in /tmp)
 *
 * Figures and ground edges are left out on purpose: the game draws the wanderer in their own skin
 * and hair, and cuts each ground's edges from its own art.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DECOR, GROUND_TILES, OBJECT_TILES } from '@worldforge/core/local/tiles';
import { TREE_KINDS } from '@worldforge/core/local/trees';
import { ROOF_MATERIALS, ROOF_PLANES } from '@worldforge/core/local/roofs';
import { Sprite, encodePng } from './tileset-art/paint';
import { paintGround } from './tileset-art/ground';
import { roof, structure } from './tileset-art/structures';
import { animated, paintDecor, paintObject, paintTreePart } from './tileset-art/things';

const COLS = 16;
const dir = fileURLToPath(new URL('../public/tileset/', import.meta.url));

/** A frame name and its pictures (more than one: an animation). */
interface Entry {
  key: string;
  pictures: Sprite[];
  ms?: number;
}

const rows: Entry[][] = [];
const missing: string[] = [];
const variantKey = (name: string, v: number) => (v === 0 ? name : `${name}.${v}`);
const masks = Array.from({ length: 16 }, (_, k) => k);

function family(entries: (Entry | null)[]): void {
  const row = entries.filter((e): e is Entry => !!e);
  if (row.length) rows.push(row);
}

function one(key: string, sprite: Sprite | null): Entry | null {
  if (!sprite) {
    missing.push(key);
    return null;
  }
  return { key, pictures: [sprite] };
}

for (const d of GROUND_TILES) {
  if (d.name === 'void') continue;
  if (d.join === 'mask4') family(masks.map((m) => one(`${d.name}#${m}`, paintGround(d.name, 0, m))));
  else family(Array.from({ length: d.variants ?? 1 }, (_, v) => one(variantKey(d.name, v), paintGround(d.name, v))));
}

for (const d of OBJECT_TILES) {
  if (d.name === 'none') continue;
  if (d.join === 'mask4') {
    family(masks.map((m) => one(`${d.name}#${m}`, structure(d.name, m) ?? paintObject(d.name, 0, m))));
    continue;
  }
  const anim = animated(d.name);
  if (anim) {
    family([{ key: d.name, pictures: anim, ms: 160 }]);
    continue;
  }
  family(Array.from({ length: d.variants ?? 1 }, (_, v) => one(variantKey(d.name, v), paintObject(d.name, v))));
}

for (const k of TREE_KINDS) {
  family([one(`trunk_${k.name}`, paintTreePart('trunk', k.name, 0))]);
  family([1, 2, 4, 8].map((q) => one(`trunk2_${k.name}#${q}`, paintTreePart('trunk2', k.name, q))));
  family([1, 2, 4, 8].map((q) => one(`roots_${k.name}#${q}`, paintTreePart('roots', k.name, q))));
  family(masks.map((m) => one(`branch_${k.name}#${m}`, paintTreePart('branch', k.name, m))));
  family(masks.map((m) => one(`leaves_${k.name}#${m}`, paintTreePart('leaves', k.name, m))));
}

for (const m of Object.keys(ROOF_MATERIALS)) {
  for (const pl of ROOF_PLANES) family(masks.map((j) => one(`roof_${m}_${pl}#${j}`, roof(m, pl, j))));
}

for (const d of DECOR) family(Array.from({ length: d.variants ?? 1 }, (_, v) => one(variantKey(d.name, v), paintDecor(d.name, v))));

// ---- Pack: one family to a row (animations along it), wrapping if a row is full -----------------

const sheet: { key: string; at: [number, number][]; ms?: number; sprites: Sprite[] }[] = [];
let r = 0;
for (const row of rows) {
  let c = 0;
  for (const e of row) {
    if (c + e.pictures.length > COLS) {
      r++;
      c = 0;
    }
    sheet.push({ key: e.key, at: e.pictures.map((_, i) => [c + i, r] as [number, number]), ms: e.ms, sprites: e.pictures });
    c += e.pictures.length;
  }
  r++;
}

const W = COLS * 16, H = r * 16;
const png = new Uint8ClampedArray(W * H * 4);
for (const f of sheet) {
  f.sprites.forEach((sp, i) => {
    const [cx, cy] = f.at[i];
    for (let y = 0; y < 16; y++) png.set(sp.px.subarray(y * 64, y * 64 + 64), ((cy * 16 + y) * W + cx * 16) * 4);
  });
}
writeFileSync(dir + 'tileset.png', encodePng(png, W, H));

const lines = sheet.map((f) => {
  const v = f.at.length > 1 ? `{ "at": ${JSON.stringify(f.at)}, "ms": ${f.ms ?? 200} }` : JSON.stringify(f.at[0]);
  return `    ${JSON.stringify(f.key)}: ${v.replace(/,(?=\d)/g, ', ')}`;
});
writeFileSync(dir + 'tileset.json', `{
  "tileSize": 16,
  "image": "tileset.png",
  "about": "Painted by npm run tileset:art (apps/game/scripts/tileset-art.ts): do not edit by hand.",
  "tiles": {
${lines.join(',\n')}
  }
}
`);

console.log(`tileset.png ${W} × ${H}: ${sheet.length} frames in ${r} rows`);
if (missing.length) console.log(`not painted (left to the game's placeholders): ${missing.join(', ')}`);

if (process.argv.includes('--preview')) {
  // Pages of 40 rows at 3×, over a mid grey so transparent frames show.
  const scale = 3, perPage = 40;
  for (let page = 0; page * perPage < r; page++) {
    const rowsHere = Math.min(perPage, r - page * perPage), pw = W * scale, ph = rowsHere * 16 * scale;
    const out = new Uint8ClampedArray(pw * ph * 4);
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const sx = Math.floor(x / scale), sy = page * perPage * 16 + Math.floor(y / scale);
        const o = (sy * W + sx) * 4, a = png[o + 3] / 255, bg = ((sx >> 3) + (sy >> 3)) % 2 ? 150 : 135;
        const d = (y * pw + x) * 4;
        for (let k = 0; k < 3; k++) out[d + k] = png[o + k] * a + bg * (1 - a);
        out[d + 3] = 255;
      }
    }
    writeFileSync(`/tmp/tileset-preview-${page}.png`, encodePng(out, pw, ph));
  }
  // Each ground laid 4 × 4 from its variants at random, to show the seams (or that there are none).
  const grounds = GROUND_TILES.filter((d) => d.name !== 'void' && d.join !== 'mask4');
  const per = 8, tile = 4 * 16 * 2, mw = per * (tile + 4), mh = Math.ceil(grounds.length / per) * (tile + 4);
  const mos = new Uint8ClampedArray(mw * mh * 4);
  let seed = 1;
  grounds.forEach((d, i) => {
    const ox = (i % per) * (tile + 4), oy = Math.floor(i / per) * (tile + 4);
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const v = (seed >>> 16) % (d.variants ?? 1);
      const sp = paintGround(d.name, v)!;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const c = sp.get(x >> 1, y >> 1), o = ((oy + ty * 32 + y) * mw + ox + tx * 32 + x) * 4;
        mos[o] = c[0];
        mos[o + 1] = c[1];
        mos[o + 2] = c[2];
        mos[o + 3] = 255;
      }
    }
  });
  writeFileSync('/tmp/tileset-ground-mosaic.png', encodePng(mos, mw, mh));
  console.log('previews in /tmp/tileset-preview-*.png');
}
