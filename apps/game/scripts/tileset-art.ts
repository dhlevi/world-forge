/**
 * Paints the game's tileset in a top-down pixel-art style (after RimWorld and Dwarf Fortress
 * tilesets): every frame the tile registry asks for (TILESET.md), into public/tileset/tileset.png
 * (the animals into animals.png beside it) and tileset.json. Deterministic, so running it again
 * gives the same sheets.
 *
 *   npm run tileset:art            (add -- --preview for zoomed pages of the sheet in /tmp)
 * Ground edges are left out on purpose: the game cuts each ground's edges from its own art.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DECOR, FACINGS, GROUND_TILES, OBJECT_TILES, type Facing } from '@worldforge/core/local/tiles';
import { TREE_KINDS } from '@worldforge/core/local/trees';
import { ROOF_MATERIALS, ROOF_PLANES } from '@worldforge/core/local/roofs';
import { SHORTEN_ROWS, figureLayers } from '@worldforge/core/local/figures';
import { SPECIES } from '@worldforge/core/local/fauna';
import { Sprite, encodePng } from './tileset-art/paint';
import { paintGround } from './tileset-art/ground';
import { roof, structure } from './tileset-art/structures';
import { animated, paintDecor, paintObject, paintTreePart } from './tileset-art/things';
import { paintFigure } from './tileset-art/figures';
import { animalCells, animalLies, paintAnimal } from './tileset-art/animals';

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

// A row to a layer: standing each way, then the walks (stride, stand, other stride, stand).
for (const l of figureLayers()) {
  const stand = FACINGS.map((d) => paintFigure(l.name, d, 0));
  family([
    ...FACINGS.map((d, i) => ({ key: `${l.name}_${d}`, pictures: [stand[i]] })),
    ...FACINGS.map((d, i) => ({ key: `${l.name}_walk_${d}`, pictures: [paintFigure(l.name, d, 1), stand[i], paintFigure(l.name, d, 2), stand[i]], ms: 70 })),
  ]);
}

for (const m of Object.keys(ROOF_MATERIALS)) {
  for (const pl of ROOF_PLANES) family(masks.map((j) => one(`roof_${m}_${pl}#${j}`, roof(m, pl, j))));
}

for (const d of DECOR) family(Array.from({ length: d.variants ?? 1 }, (_, v) => one(variantKey(d.name, v), paintDecor(d.name, v))));

// ---- Pack: one family to a row (animations along it), wrapping if a row is full -----------------

const sheet: { key: string; at: [number, number][]; ms?: number; sprites: Sprite[] }[] = [];
// A picture used twice (a walk's standing frame) takes one cell.
const placed = new Map<Sprite, [number, number]>();
let r = 0;
for (const row of rows) {
  let c = 0;
  for (const e of row) {
    const fresh = new Set(e.pictures.filter((sp) => !placed.has(sp)));
    if (c + fresh.size > COLS) {
      r++;
      c = 0;
    }
    for (const sp of fresh) placed.set(sp, [c++, r]);
    sheet.push({ key: e.key, at: e.pictures.map((sp) => placed.get(sp)!), ms: e.ms, sprites: e.pictures });
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

// ---- The animals: a sheet of their own, a species to a band, the large ones two cells square ----

const beasts: { sp: Sprite; x: number; y: number }[] = [];
let ar = 0;
for (const s of SPECIES) {
  if (!paintAnimal(s.id, 's', 0)) {
    missing.push(`animal_${s.id}`);
    continue;
  }
  const n = animalCells(s.id), rest = `${n > 1 ? `, "size": [${n}, ${n}]` : ''}${animalLies(s.id) ? `, "offset": [${8 - n * 8}, ${8 - n * 8}]` : ''}`;
  let c = 0;
  const put = (sp: Sprite): string => {
    if (c + n > COLS) {
      c = 0;
      ar += n;
    }
    beasts.push({ sp, x: c * 16, y: ar * 16 });
    c += n;
    return `[${c - n}, ${ar}]`;
  };
  const entry = (name: string, at: string[], ms?: number) => lines.push(`    "${name}": { "sheet": "animals", "at": ${at.length > 1 ? `[${at.join(', ')}]` : at[0]}${rest}${ms ? `, "ms": ${ms}` : ''} }`);
  for (const d of FACINGS) {
    const stand = put(paintAnimal(s.id, d, 0)!);
    entry(`animal_${s.id}_${d}`, [stand]);
    entry(`animal_${s.id}_walk_${d}`, [put(paintAnimal(s.id, d, 1)!), stand, put(paintAnimal(s.id, d, 2)!), stand], 110);
  }
  if (s.fly) for (const d of FACINGS) {
    const beat = [0, 1, 2].map((fr) => put(paintAnimal(s.id, d, fr, true)!));
    entry(`animal_${s.id}_fly_${d}`, [beat[0], beat[1], beat[2], beat[1]], 90);
  }
  ar += n;
}
const AH = ar * 16, animals = new Uint8ClampedArray(W * AH * 4);
for (const { sp, x, y } of beasts) for (let j = 0; j < sp.h; j++) animals.set(sp.px.subarray(j * sp.w * 4, (j + 1) * sp.w * 4), ((y + j) * W + x) * 4);
writeFileSync(dir + 'animals.png', encodePng(animals, W, AH));

writeFileSync(dir + 'tileset.json', `{
  "tileSize": 16,
  "image": "tileset.png",
  "sheets": { "animals": "animals.png" },
  "about": "Painted by npm run tileset:art (apps/game/scripts/tileset-art.ts): do not edit by hand.",
  "tiles": {
${lines.join(',\n')}
  }
}
`);

console.log(`tileset.png ${W} × ${H}: ${sheet.length} frames in ${r} rows; animals.png ${W} × ${AH}: ${beasts.length} pictures`);
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
  // Sample people put together as the game does: layers tinted, shorter kinds squashed to the feet.
  const people: [string, number, string[]][] = [
    ['human_m:d8b090', 1, ['wear_trousers:6a5a46', 'wear_boots:3e2c1e', 'wear_tunic:7a6a50', 'wear_belt:3e2a1a', 'hair_short:5a3a20', 'beard_full:5a3a20']],
    ['human_f:e8c0a0', 1, ['wear_dress:7a5060', 'wear_shoes:4a3626', 'hair_long:d8b860']],
    ['elf_f:f0d8c0', 1, ['wear_robe:5a5a70', 'wear_belt:a08040', 'hair_braids:e8e0c0']],
    ['dwarf_m:c89070', 0.78, ['wear_trousers:5a4a3a', 'wear_boots:3e2c1e', 'wear_mail:9a9a9a', 'wear_belt:3e2a1a', 'beard_braided:a04a20', 'wear_helm:8a8a8a']],
    ['halfling_m:e0b090', 0.68, ['wear_trousers:6a6a40', 'wear_tunic:a09060', 'wear_jacket:4a5a46', 'hair_curly:6a4020']],
    ['orc_m:7a9a5a', 1, ['wear_trousers:4a3a2a', 'wear_boots:2e2418', 'wear_jerkin:6a4a2e', 'hair_crest:202020']],
    ['lizard_m:6a9a6a', 1, ['wear_apron:a09078', 'wear_scarf:8a3a3a']],
    ['gnome_f:e8b8a0', 0.66, ['wear_dress:4a6a8a', 'wear_apron:d8d0c0', 'hair_bun:c0c0c0', 'wear_hat:5a4a30']],
    ['fungus_m:d8c8b0', 0.85, ['wear_tunic:6a7a4a']],
    ['human_m:a87050', 1, ['wear_hose:5a4a6a', 'wear_shoes:4a3626', 'wear_coat:4a4a5a', 'hair_tied:2a2a2a', 'beard_moustache:2a2a2a', 'wear_cap:6a5040']],
    ['human_f:c89878', 1, ['wear_skirt:7a5a4a', 'wear_sandals:8a6a44', 'wear_tunic:c0b090', 'wear_gloves:5a4630', 'wear_veil:d8d0c0']],
    ['orc_f:8aa060', 1, ['wear_trousers:6a5a46', 'wear_boots:3e2c1e', 'wear_tunic:7a6a50', 'wear_cloak:4e5a3e', 'wear_hood:4e5a3e']],
  ];
  const shots: [Facing, number][] = [['n', 0], ['e', 0], ['s', 0], ['w', 0], ['e', 1], ['e', 2], ['s', 1], ['s', 2], ['n', 1], ['n', 2]];
  const sc = 5, cell = 16 * sc + 6, fw = shots.length * cell, fh = people.length * cell;
  const fig = new Uint8ClampedArray(fw * fh * 4);
  for (let i = 0; i < fw * fh; i++) fig.set([150, 146, 132, 255], i * 4);
  people.forEach(([b, squash, wear], pi) => {
    shots.forEach(([d, fr], si) => {
      const pic = new Sprite();
      for (const spec of [`body_${b}`, ...wear]) {
        const [layer, col] = spec.split(':'), tint = [0, 2, 4].map((k) => parseInt(col.slice(k, k + 2), 16) / 255);
        const sp = paintFigure(layer, d, fr);
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const a = sp.alpha(x, y);
          if (a) pic.blend(x, y, sp.get(x, y).map((v, k) => v * tint[k]) as [number, number, number], a / 255);
        }
      }
      const drop = new Set(SHORTEN_ROWS.slice(0, Math.round(16 * (1 - squash))));
      const kept = Array.from({ length: 16 }, (_, y) => y).filter((y) => !drop.has(y));
      for (let y = 0; y < 16 * sc; y++) for (let x = 0; x < 16 * sc; x++) {
        const sy = kept[Math.floor(y / sc) - drop.size];
        if (sy === undefined) continue;
        const sx = Math.floor(x / sc), a = pic.alpha(sx, sy) / 255;
        if (!a) continue;
        const o = ((pi * cell + 3 + y) * fw + si * cell + 3 + x) * 4, c = pic.get(sx, sy);
        for (let k = 0; k < 3; k++) fig[o + k] = c[k] * a + fig[o + k] * (1 - a);
      }
    });
  });
  writeFileSync('/tmp/tileset-figures.png', encodePng(fig, fw, fh));
  // The animals on grass, a man beside each for scale: side, front and back, their strides, and flying.
  const man = new Sprite();
  for (const [layer, tint] of [['body_human_m', [216, 176, 144]], ['wear_trousers', [106, 90, 70]], ['wear_tunic', [122, 106, 80]], ['hair_short', [90, 58, 32]]] as [string, number[]][]) {
    const sp = paintFigure(layer, 's', 0);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (sp.alpha(x, y)) man.blend(x, y, sp.get(x, y).map((v, k) => (v * tint[k]) / 255) as [number, number, number], sp.alpha(x, y) / 255);
  }
  const views: [Facing, number, boolean][] = [['e', 0, false], ['e', 1, false], ['s', 0, false], ['n', 0, false], ['e', 0, true], ['n', 1, true]];
  const az = 4, cw = 32 * az, perCol = 7, perSheet = perCol * 2, band = (views.length + 1) * cw;
  for (let page = 0; page * perSheet < SPECIES.length; page++) {
    const list = SPECIES.slice(page * perSheet, (page + 1) * perSheet), pw = band * 2, ph = perCol * cw;
    const out = new Uint8ClampedArray(pw * ph * 4);
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      const tx = Math.floor(x / az) % 32, ty = Math.floor(y / az) % 32, onTile = tx >= 8 && tx < 24 && ty >= 16;
      out.set(onTile ? [96, 140, 68, 255] : [84, 128, 60, 255], (y * pw + x) * 4);
    }
    const stamp = (sp: Sprite, cx: number, cy: number) => {
      const ox = (32 - sp.w) / 2, oy = 32 - sp.h;
      for (let y = 0; y < sp.h * az; y++) for (let x = 0; x < sp.w * az; x++) {
        const sx = Math.floor(x / az), sy = Math.floor(y / az), a = sp.alpha(sx, sy) / 255;
        if (!a) continue;
        const o = ((cy + oy * az + y) * pw + cx + ox * az + x) * 4, c = sp.get(sx, sy);
        for (let k = 0; k < 3; k++) out[o + k] = c[k] * a + out[o + k] * (1 - a);
      }
    };
    list.forEach((s, i) => {
      const bx = Math.floor(i / perCol) * band, by = (i % perCol) * cw;
      stamp(man, bx, by);
      views.forEach(([d, fr, fly], vi) => {
        const sp = fly && !s.fly ? null : paintAnimal(s.id, d, fr, fly);
        if (sp) stamp(sp, bx + (vi + 1) * cw, by);
      });
    });
    writeFileSync(`/tmp/tileset-animals-${page}.png`, encodePng(out, pw, ph));
  }
  console.log('previews in /tmp/tileset-preview-*.png, /tmp/tileset-figures.png and /tmp/tileset-animals-*.png');
}
