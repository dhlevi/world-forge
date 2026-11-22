/**
 * The tileset template (`npm run tileset:template`, development only): every frame the game asks
 * for (TILESET.md) drawn into one sheet, a row to a tile, with the art of public/tileset where it
 * has some and the game's placeholder elsewhere; its index; and a key naming every row. Pictures
 * larger than a tile (the animals) take a block of cells each, their rows wrapping at the sheet's
 * edge. The dev server writes the three files beside the tileset (vite.config.ts), leaving the
 * tileset's own files as they are.
 */
import { DECOR, FACINGS, GROUND_TILES, OBJECT_TILES, TERRAINS, type TileDef } from '@worldforge/core/local/tiles';
import { figureLayers } from '@worldforge/core/local/figures';
import { SPECIES } from '@worldforge/core/local/fauna';
import { TREE_KINDS } from '@worldforge/core/local/trees';
import { ROOF_MATERIALS, ROOF_PLANES } from '@worldforge/core/local/roofs';
import { TILE_PX, TREE_FRAMES, Tileset, type Look } from '../game/tileset';
import type { FrameLayer } from '../game/tileset-format';

/** One row of the sheet: a tile (or part), its frames, and whether it is art yet. */
interface Row {
  label: string;
  art: boolean;
  frames: { name: string; look: Look | null | undefined }[];
  /** A walk cycle: its frames make one animation of this name. */
  anim?: { name: string; ms: number };
  /** Several animations in one row: frames `from` to `from + count - 1` make each. */
  anims?: { name: string; ms: number; from: number; count: number }[];
}
type Entry = Row | { title: string };

export interface Template {
  sheet: Blob;
  key: Blob;
  index: object;
  summary: string;
}

/** Every row of the template, in the order of TILESET.md, from what the tileset draws now. */
function rowsOf(ts: Tileset): Entry[] {
  const out: Entry[] = [];
  const art = (name: string) => ts.drawn.has(name);
  const look = (layer: FrameLayer, name: string, mask = -1, v = 0) => {
    const list = ts.variantsOf(layer, name, mask);
    return list.length ? list[v % list.length] : null;
  };
  // Tiles: variants in a row (as many as the registry suggests, or as the art has), joins 16 to a row.
  const tiles = (defs: readonly TileDef[], layer: FrameLayer) => {
    for (const d of defs) {
      if (d.name === 'void' || d.name === 'none') continue;
      if (d.join === 'mask4') {
        out.push({ label: d.name, art: art(d.name), frames: Array.from({ length: 16 }, (_, m) => ({ name: `${d.name}#${m}`, look: look(layer, d.name, m) })) });
      } else {
        const n = Math.max(d.variants ?? 1, art(d.name) ? ts.variantsOf(layer, d.name).length : 1);
        out.push({ label: d.name, art: art(d.name), frames: Array.from({ length: n }, (_, v) => ({ name: v ? `${d.name}.${v}` : d.name, look: look(layer, d.name, -1, v) })) });
      }
    }
  };
  out.push({ title: 'Ground' });
  tiles(GROUND_TILES, 'ground');
  out.push({ title: 'Objects' });
  tiles(OBJECT_TILES, 'object');
  out.push({ title: 'Ground edges' });
  TERRAINS.forEach((t, ti) => {
    const name = `edge_${t.name}`, drawn = art(name);
    out.push({ label: name, art: drawn, frames: Array.from({ length: 14 }, (_, i) => ({ name: `${name}#${i + 1}`, look: drawn ? look('edge', name, i + 1) : ts.edge(ti, i + 1, t.tiles[0], 0, 0) })) });
  });
  out.push({ title: 'Trees' });
  const masks: Record<(typeof TREE_FRAMES)[number], number[]> = { trunk: [-1], trunk2: [1, 2, 4, 8], roots: [1, 2, 4, 8], branch: [...Array(16).keys()], leaves: [...Array(16).keys()] };
  for (const k of TREE_KINDS) for (const f of TREE_FRAMES) {
    const name = `${f}_${k.name}`;
    out.push({ label: name, art: art(name), frames: masks[f].map((m) => ({ name: m < 0 ? name : `${name}#${m}`, look: look('tree', name, m) })) });
  }
  out.push({ title: 'Figures' });
  // A row to a layer: standing facing north, east, south and west, then three frames of the walk each way.
  for (const l of figureLayers()) {
    const frames: Row['frames'] = FACINGS.map((d) => ({ name: `${l.name}_${d}`, look: ts.figureLayer(l.name, d, false).look }));
    const anims: NonNullable<Row['anims']> = [];
    for (const d of FACINGS) {
      const walk = ts.figureLayer(l.name, d, true).look, name = `${l.name}_walk_${d}`;
      anims.push({ name, ms: walk.ms || 70, from: frames.length, count: 3 });
      for (let i = 0; i < 3; i++) frames.push({ name: `${name}~${i}`, look: { ...walk, tex: [walk.tex[i % walk.tex.length]] } });
    }
    out.push({ label: l.name, art: FACINGS.some((d) => art(`${l.name}_${d}`)), frames, anims });
  }
  out.push({ title: 'Animals' });
  // A row to a species: standing each way, then three frames of its walk each way, and (birds) of its flight.
  for (const s of SPECIES) {
    const frames: Row['frames'] = FACINGS.map((d) => ({ name: `animal_${s.id}_${d}`, look: ts.animalLook(s.id, d, false, false).look }));
    const anims: NonNullable<Row['anims']> = [];
    for (const kind of s.fly ? ['walk', 'fly'] : ['walk']) for (const d of FACINGS) {
      const mv = ts.animalLook(s.id, d, true, kind === 'fly').look, name = `animal_${s.id}_${kind}_${d}`;
      anims.push({ name, ms: mv.ms || 110, from: frames.length, count: 3 });
      for (let i = 0; i < 3; i++) frames.push({ name: `${name}~${i}`, look: { ...mv, tex: [mv.tex[i % mv.tex.length]] } });
    }
    out.push({ label: `animal_${s.id}`, art: FACINGS.some((d) => art(`animal_${s.id}_${d}`)), frames, anims });
  }
  out.push({ title: 'Roofs' });
  for (const mat of Object.keys(ROOF_MATERIALS)) for (const pl of ROOF_PLANES) {
    const name = `roof_${mat}_${pl}`;
    out.push({ label: name, art: art(name), frames: Array.from({ length: 16 }, (_, m) => ({ name: `${name}#${m}`, look: look('roof', name, m) })) });
  }
  out.push({ title: 'Decorations' });
  for (const d of DECOR) out.push({ label: d.name, art: art(d.name), frames: Array.from({ length: d.variants ?? 1 }, (_, v) => ({ name: v ? `${d.name}.${v}` : d.name, look: look('decor', d.name, -1, v) })) });
  return out;
}

const blob = (c: HTMLCanvasElement) => new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('The picture could not be made.'))), 'image/png'));

/** Makes the template from the tileset in public/tileset (and the placeholders). */
export async function makeTemplate(baseUrl: string): Promise<Template> {
  const ts = new Tileset();
  await ts.load(baseUrl);
  const P = TILE_PX, entries = rowsOf(ts);
  const rows = entries.filter((r): r is Row => 'frames' in r);

  // The sheet: 16 cells wide, a row to a tile (more where its pictures are larger than a cell).
  const layout = rows.map((r) => {
    const cells = Math.max(1, ...r.frames.map((f) => Math.ceil(Math.max(f.look?.tex[0]?.frame.width ?? P, f.look?.tex[0]?.frame.height ?? P) / P)));
    const per = Math.floor(16 / cells);
    return { cells, per, tall: Math.ceil(r.frames.length / per) * cells, top: 0 };
  });
  let total = 0;
  for (const l of layout) {
    l.top = total;
    total += l.tall;
  }
  const sheet = document.createElement('canvas');
  sheet.width = 16 * P;
  sheet.height = total * P;
  const g = sheet.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const tiles: Record<string, unknown> = {}, placeholders: string[] = [];
  rows.forEach((r, ri) => {
    const { cells: n, per, top } = layout[ri], S = n * P;
    const cells: [number, number][] = [], animCells: Record<string, [number, number][]> = {};
    // How a picture is indexed: where it is, its size if larger than a cell, and its offset if it does not stand on its tile.
    let extra: { size?: [number, number]; offset?: [number, number] } = {};
    r.frames.forEach((f, i) => {
      const tex = f.look?.tex[0];
      if (!tex || !f.look) return;
      const fr = tex.frame, col = (i % per) * n, row = top + Math.floor(i / per) * n;
      // Standing on its tile (centred across the block, its foot on the block's foot) if it fits so.
      const sx = (S - P) / 2 + f.look.dx, sy = S - P + f.look.dy;
      const stands = sx >= 0 && sy >= 0 && sx + fr.width <= S && sy + fr.height <= S;
      extra = { ...(n > 1 || !stands ? { size: [n, n] } : {}), ...(stands ? {} : { offset: [f.look.dx, f.look.dy] }) };
      g.save();
      g.beginPath();
      g.rect(col * P, row * P, S, S);
      g.clip();
      g.drawImage(tex.source.resource as CanvasImageSource, fr.x, fr.y, fr.width, fr.height, col * P + (stands ? sx : 0), row * P + (stands ? sy : 0), fr.width, fr.height);
      g.restore();
      const an = r.anims?.find((a) => i >= a.from && i < a.from + a.count);
      if (r.anim) cells.push([col, row]);
      else if (an) (animCells[an.name] ??= []).push([col, row]);
      else {
        tiles[f.name] = extra.size || extra.offset ? { at: [col, row], ...extra } : [col, row];
        if (!r.art) placeholders.push(f.name);
      }
    });
    for (const a of r.anims ?? []) if (animCells[a.name]?.length) {
      tiles[a.name] = { at: animCells[a.name], ...extra, ms: a.ms };
      if (!r.art) placeholders.push(a.name);
    }
    if (r.anim && cells.length) {
      tiles[r.anim.name] = { at: cells, ...extra, ms: r.anim.ms };
      if (!r.art) placeholders.push(r.anim.name);
    }
  });

  // The key: the sheet at twice the size, each row named, placeholders in grey.
  const Z = 2, LW = 270, HEAD = 22, TOP = 30;
  const key = document.createElement('canvas');
  key.width = LW + 16 * P * Z + 8;
  key.height = TOP + total * P * Z + rows.length * 2 + (entries.length - rows.length) * HEAD;
  const k = key.getContext('2d')!;
  k.imageSmoothingEnabled = false;
  k.fillStyle = '#1b1c22';
  k.fillRect(0, 0, key.width, key.height);
  k.textBaseline = 'middle';
  k.font = '12px sans-serif';
  k.fillStyle = '#e8e4d8';
  k.fillText('tileset-template.png, a row to a tile, at twice the size. Light names: art. Grey: placeholders.', 8, TOP / 2);
  let y = TOP, sheetRow = 0;
  for (const e of entries) {
    if ('title' in e) {
      k.fillStyle = '#3a3d4a';
      k.fillRect(0, y, key.width, HEAD);
      k.fillStyle = '#ffffff';
      k.font = 'bold 13px sans-serif';
      k.fillText(e.title, 8, y + HEAD / 2);
      y += HEAD;
      continue;
    }
    const { top, tall } = layout[sheetRow], h = tall * P * Z;
    k.fillStyle = e.art ? '#e8e4d8' : '#8a8c96';
    k.font = '11px monospace';
    k.fillText(`${e.label}${e.art ? '' : '  (placeholder)'}`, 6, y + Math.min(h, P * Z * 2) / 2);
    k.fillStyle = '#2a2b33';
    k.fillRect(LW, y, 16 * P * Z, h);
    k.drawImage(sheet, 0, top * P, 16 * P, tall * P, LW, y, 16 * P * Z, h);
    y += h + 2;
    sheetRow++;
  }

  const index = {
    tileSize: P,
    image: 'tileset-template.png',
    about: 'Every frame the game asks for (TILESET.md), laid out a tile to a row: the tileset\'s art where it has some, and the game\'s placeholder elsewhere. Frames listed in "placeholders" are not art yet. To use a painted frame, copy its picture and entry into the tileset\'s sheets and tileset.json (or point tileset.json at this sheet). Made again by npm run tileset:template.',
    tiles,
    placeholders,
  };
  const artRows = rows.filter((r) => r.art).length;
  return {
    sheet: await blob(sheet), key: await blob(key), index,
    summary: `${rows.length} rows, ${Object.keys(tiles).length} frames; ${artRows} rows of art, ${placeholders.length} placeholder frames.`,
  };
}

/** The template page: makes the files and has the dev server write them beside the tileset. */
export async function runTemplatePage(el: HTMLElement, baseUrl: string): Promise<void> {
  const say = (text: string) => {
    const p = document.createElement('p');
    p.textContent = text;
    el.appendChild(p);
  };
  el.style.cssText = 'font: 14px sans-serif; color: #e8e4d8; padding: 16px';
  say('Making the tileset template...');
  const t = await makeTemplate(baseUrl);
  const put = async (name: string, body: Blob | string) => {
    const r = await fetch(`/__tileset-template/${name}`, { method: 'POST', body });
    if (!r.ok) throw new Error(`The dev server could not write ${name}: ${await r.text()}`);
  };
  await put('tileset-template.png', t.sheet);
  await put('tileset-template-key.png', t.key);
  await put('tileset-template.json', JSON.stringify(t.index, null, 1));
  say(`Written to public/tileset: tileset-template.png, tileset-template.json and tileset-template-key.png (${t.summary})`);
  say('You can close this page and stop the dev server.');
  el.dataset.done = 'true';
}
