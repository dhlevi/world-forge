import { mulberry32 } from '../gen/rng';
import { LAIR_CELL, type LairLink, type LairMap, type Pt } from './lair';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const PAPER = '#f3ead3';
const INK = '#2b2420';
const FLOOR = '#f7f1e1';
const ROCK = '#d8cfbd';
const WATER_C = '#a8c4cc';
const WATER_INK_C = '#4b6b78';

export interface LairDrawOpts {
  /** Pixels per metre and the map's top-left corner on the canvas. */
  scale: number;
  ox: number;
  oy: number;
  grid: boolean;
  labels: boolean;
  /** Map overlay: no paper outside the map, soft edges. */
  overlay?: boolean;
}

/** Draws a cave or glade map: hatched rock and inked walls, or canopies round a clearing. */
export function drawLair(g: Ctx2D, m: LairMap, o: LairDrawOpts): void {
  g.save();
  g.translate(o.ox, o.oy);
  g.scale(o.scale, o.scale);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  g.rect(0, 0, m.W, m.H);
  g.clip();
  if (m.site.kind === 'deep') drawDeep(g, m, o);
  else if (m.site.kind === 'cave' || m.interior) drawCave(g, m, o);
  else if (m.site.kind === 'pass') drawPass(g, m, o);
  else drawGlade(g, m, o);
  if (o.labels) drawRooms(g, m);
  g.restore();
}

const px = (o: LairDrawOpts, n: number) => n / o.scale;

function path(g: Ctx2D, loops: Pt[][]): void {
  g.beginPath();
  for (const l of loops) {
    g.moveTo(l[0][0], l[0][1]);
    for (let k = 1; k < l.length; k++) g.lineTo(l[k][0], l[k][1]);
    g.closePath();
  }
}

function gridLines(g: Ctx2D, m: LairMap, o: LairDrawOpts, color: string): void {
  g.strokeStyle = color;
  g.lineWidth = px(o, 0.8);
  g.beginPath();
  for (let x = 0; x <= m.W + 1e-6; x += LAIR_CELL) {
    g.moveTo(x, 0);
    g.lineTo(x, m.H);
  }
  for (let y = 0; y <= m.H + 1e-6; y += LAIR_CELL) {
    g.moveTo(0, y);
    g.lineTo(m.W, y);
  }
  g.stroke();
}

function drawCave(g: Ctx2D, m: LairMap, o: LairDrawOpts): void {
  const rnd = mulberry32(m.site.seed ^ 0x5eed);
  if (!o.overlay) {
    g.fillStyle = PAPER;
    g.fillRect(0, 0, m.W, m.H);
  }
  // Rock band round the walls, then hatching in it (groups of short parallel strokes).
  g.strokeStyle = ROCK;
  g.lineWidth = 4.2;
  path(g, m.outlines);
  g.stroke();
  g.strokeStyle = INK;
  g.lineWidth = Math.max(px(o, 0.9), 0.07);
  g.beginPath();
  for (const l of m.outlines) {
    let acc = 0;
    for (let k = 0; k < l.length; k++) {
      const a = l[k], b = l[(k + 1) % l.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      acc += len;
      if (acc < 1.1) continue;
      acc = 0;
      if (m.onEdge(a)) continue;
      // Outward normal: the side that is not open floor.
      let nx = (b[1] - a[1]) / (len || 1), ny = -(b[0] - a[0]) / (len || 1);
      if (m.open([a[0] + nx * 0.6, a[1] + ny * 0.6])) {
        nx = -nx;
        ny = -ny;
      }
      const d = 0.4 + 1.6 * rnd();
      const c: Pt = [a[0] + nx * d, a[1] + ny * d];
      const ang = rnd() * Math.PI, ca = Math.cos(ang), sa = Math.sin(ang);
      const L = 0.5 + 0.6 * rnd(), gap = 0.28;
      for (let q = -1; q <= 1; q++) {
        const sx = c[0] - sa * gap * q, sy = c[1] + ca * gap * q;
        g.moveTo(sx - ca * L * 0.5, sy - sa * L * 0.5);
        g.lineTo(sx + ca * L * 0.5, sy + sa * L * 0.5);
      }
    }
  }
  g.stroke();
  // Floor.
  g.fillStyle = FLOOR;
  path(g, m.outlines);
  g.fill('evenodd');
  if (o.grid) {
    g.save();
    path(g, m.outlines);
    g.clip('evenodd');
    gridLines(g, m, o, 'rgba(43,36,32,0.16)');
    g.restore();
  }
  drawWater(g, m, o);
  // Boulders and stalagmites.
  g.fillStyle = '#b8ae9c';
  g.strokeStyle = INK;
  g.lineWidth = 0.09;
  for (const r of m.rocks) {
    path(g, [r]);
    g.fill();
    g.stroke();
  }
  g.fillStyle = '#6d655a';
  for (const d of m.dots) {
    g.beginPath();
    g.arc(d.p[0], d.p[1], d.r, 0, Math.PI * 2);
    g.fill();
  }
  // Walls, open where a passage runs off the map.
  g.strokeStyle = INK;
  g.lineWidth = 0.32;
  g.beginPath();
  for (const l of m.outlines) {
    for (let k = 0; k < l.length; k++) {
      const a = l[k], b = l[(k + 1) % l.length];
      if (m.onEdge(a) && m.onEdge(b)) continue;
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
    }
  }
  g.stroke();
  if (o.labels && !m.interior) {
    for (const mo of m.mouths) {
      const ix = Math.cos(mo.dir), iy = Math.sin(mo.dir);
      const p: Pt = [mo.p[0] + ix * 3.2, mo.p[1] + iy * 3.2];
      g.save();
      g.translate(p[0], p[1]);
      g.rotate(mo.dir);
      g.fillStyle = INK;
      g.beginPath();
      g.moveTo(1.1, 0);
      g.lineTo(-0.5, -0.7);
      g.lineTo(-0.5, 0.7);
      g.closePath();
      g.fill();
      g.restore();
    }
  }
  // Ways between levels are always drawn (they are part of the map); their captions are labels.
  for (const l of m.links) drawLink(g, l, o.labels, (m.site.seed % 628) / 100);
}

/**
 * A way to another level: carved stairs, a shaft with a ladder, or a steep slope of scree.
 * Down is drawn as an opening (dark), up as the foot of the way (light, with the opening above).
 */
function drawLink(g: Ctx2D, l: LairLink, caption: boolean, a0: number): void {
  const [x, y] = l.p;
  const down = l.dir === 'down';
  g.save();
  g.translate(x, y);
  g.lineWidth = 0.1;
  g.strokeStyle = INK;
  const ang = a0 + (l.p[0] * 0.37 + l.p[1] * 0.11);
  if (l.style === 'shaft') {
    g.beginPath();
    g.arc(0, 0, 1.15, 0, Math.PI * 2);
    g.fillStyle = down ? '#1f1a16' : '#e8e0cc';
    g.fill();
    g.lineWidth = 0.14;
    if (!down) g.setLineDash?.([0.35, 0.25]);
    g.stroke();
    g.setLineDash?.([]);
    // A rope ladder across it.
    g.rotate(ang);
    g.strokeStyle = down ? '#c9b48a' : INK;
    g.lineWidth = 0.07;
    g.beginPath();
    for (const s of [-0.28, 0.28]) {
      g.moveTo(s, -1.0);
      g.lineTo(s, 1.0);
    }
    for (let k = -0.75; k <= 0.76; k += 0.3) {
      g.moveTo(-0.28, k);
      g.lineTo(0.28, k);
    }
    g.stroke();
  } else {
    g.rotate(ang);
    const L = l.style === 'stairs' ? 3 : 3.4, Wd = l.style === 'stairs' ? 1.4 : 1.7;
    // Shade toward the low end.
    const gr = g.createLinearGradient(-L / 2, 0, L / 2, 0);
    gr.addColorStop(0, '#efe7d4');
    gr.addColorStop(1, down ? '#5a5046' : '#b7ab95');
    g.fillStyle = gr;
    if (l.style === 'stairs') {
      g.fillRect(-L / 2, -Wd / 2, L, Wd);
      g.strokeRect(-L / 2, -Wd / 2, L, Wd);
      g.beginPath();
      for (let k = 1; k < 6; k++) {
        const sx = -L / 2 + (k * L) / 6;
        g.moveTo(sx, -Wd / 2);
        g.lineTo(sx, Wd / 2);
      }
      g.stroke();
    } else {
      // Slope: a tapering scree run with hatching.
      g.beginPath();
      g.moveTo(-L / 2, -Wd / 2);
      g.lineTo(L / 2, -Wd * 0.3);
      g.lineTo(L / 2, Wd * 0.3);
      g.lineTo(-L / 2, Wd / 2);
      g.closePath();
      g.fill();
      g.stroke();
      g.beginPath();
      for (let k = 0; k < 5; k++) {
        const sx = -L / 2 + 0.35 + k * 0.62;
        g.moveTo(sx, -0.35);
        g.lineTo(sx + 0.35, 0);
        g.lineTo(sx, 0.35);
      }
      g.stroke();
    }
    // Arrow pointing down the way.
    g.fillStyle = down ? '#f3ead3' : INK;
    g.beginPath();
    g.moveTo(L / 2 - 0.25, 0);
    g.lineTo(L / 2 - 0.85, -0.38);
    g.lineTo(L / 2 - 0.85, 0.38);
    g.closePath();
    g.fill();
  }
  g.restore();
  if (caption) {
    const text = l.caption ?? `${down ? 'Down' : 'Up'} to level ${l.to + 1}`;
    g.save();
    g.font = "italic 1.15px 'IM Fell English', Georgia, serif";
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.lineWidth = 0.35;
    g.strokeStyle = 'rgba(247,241,225,0.95)';
    g.strokeText(text, x, y + 1.6);
    g.fillStyle = INK;
    g.fillText(text, x, y + 1.6);
    g.restore();
  }
}

function drawWater(g: Ctx2D, m: LairMap, o: LairDrawOpts): void {
  // In a volcanic cave (a lava tube) the pools are lava.
  const lava = m.site.tags.includes('volcanic') || !!m.lava;
  const WATER = lava ? '#e0662c' : WATER_C, WATER_INK = lava ? '#6b2a12' : WATER_INK_C;
  if (m.water.length) {
    g.fillStyle = WATER;
    path(g, m.water);
    g.fill('evenodd');
    // Ripples: the shore line again, a little inside.
    g.save();
    path(g, m.water);
    g.clip('evenodd');
    path(g, m.water);
    g.lineWidth = 1.1;
    g.strokeStyle = 'rgba(75,107,120,0.25)';
    g.stroke();
    g.restore();
    g.strokeStyle = WATER_INK;
    g.lineWidth = Math.max(0.14, px(o, 1.2));
    path(g, m.water);
    g.stroke();
  }
  if (m.stream) {
    const s = m.stream;
    // A cavern's river stays within the cavern.
    g.save();
    if (m.site.kind === 'deep') {
      path(g, m.outlines);
      g.clip('evenodd');
    }
    g.strokeStyle = WATER_INK;
    g.lineWidth = s.w * 2 + 0.3;
    g.beginPath();
    s.pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.stroke();
    g.strokeStyle = WATER;
    g.lineWidth = s.w * 2;
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 0.12;
    g.setLineDash?.([0.8, 1.4]);
    g.stroke();
    g.setLineDash?.([]);
    g.restore();
  }
}

/** Room numbers (groves and the hollow under a great tree). */
function drawRooms(g: Ctx2D, m: LairMap): void {
  g.save();
  const k = Math.max(1, m.W / 70);
  g.font = `bold ${1.5 * k}px 'IM Fell English', Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const r of m.rooms) {
    const t = String(r.n);
    g.fillStyle = 'rgba(251,247,236,0.92)';
    g.strokeStyle = INK;
    g.lineWidth = 0.1;
    g.beginPath();
    g.arc(r.p[0], r.p[1], 0.95 * k, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = INK;
    g.fillText(t, r.p[0], r.p[1] + 0.05 * k);
  }
  g.restore();
}

const CANOPY = ['#6f8a4a', '#7d9752', '#64803f', '#86a05a'];
const CANOPY_DRY = ['#8a8c4c', '#97934f', '#7f8242', '#a19c5a'];
/** Giant mushroom caps, for groves in a mushroom forest. */
const CAPS = ['#7d6a8c', '#6a7f86', '#86707c', '#72688c', '#64796f', '#7a6f86'];
/** Now and then a brighter cap among the muted ones. */
const CAPS_BRIGHT = ['#9a62ab', '#4c9a8c', '#c47c52', '#ad5a72'];
/** Dead and dying crowns, for groves in cursed land. */
const CANOPY_CURSED = ['#6d6a58', '#5f5c4c', '#77705a', '#585a4d'];

function drawGlade(g: Ctx2D, m: LairMap, o: LairDrawOpts): void {
  const dry = m.site.tags.includes('dry');
  const fungal = m.site.tags.includes('fungal') || m.site.tags.includes('mushrooms');
  const cursed = m.site.tags.includes('cursed');
  const rnd = mulberry32(m.site.seed ^ 0x61ade);
  // Forest floor, then the clearing: mossy violet under the fungi, grey and sickly in cursed woods.
  g.fillStyle = fungal ? '#6f6a7e' : cursed ? '#7c7a66' : dry ? '#a9a76f' : '#93a86b';
  g.fillRect(0, 0, m.W, m.H);
  g.fillStyle = fungal ? '#c9c6b4' : cursed ? '#bdb89a' : dry ? '#e4d9a6' : '#d6dfa3';
  path(g, m.outlines);
  g.fill('evenodd');
  g.strokeStyle = dry ? 'rgba(120,100,50,0.35)' : 'rgba(70,90,40,0.35)';
  g.lineWidth = 0.25;
  path(g, m.outlines);
  g.stroke();
  // Trodden paths: a worn strip of earth along each path's middle.
  g.strokeStyle = dry ? 'rgba(170,140,90,0.55)' : 'rgba(160,135,90,0.5)';
  g.lineWidth = 1.1;
  for (const l of m.paths) {
    g.beginPath();
    l.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.stroke();
  }
  // Grass tufts.
  g.strokeStyle = fungal ? 'rgba(95,80,110,0.6)' : cursed ? 'rgba(95,90,60,0.65)' : dry ? 'rgba(125,105,55,0.7)' : 'rgba(80,105,50,0.7)';
  g.lineWidth = 0.08;
  g.beginPath();
  for (const p of m.tufts) {
    for (const dx of [-0.18, 0, 0.18]) {
      g.moveTo(p[0] + dx * 0.4, p[1]);
      g.lineTo(p[0] + dx, p[1] - 0.35 - Math.abs(dx));
    }
  }
  g.stroke();
  // In a mushroom forest the meadow's flowers are toadstools.
  const shrooms = m.site.tags.includes('mushrooms');
  for (const f of m.flowers) {
    g.fillStyle = shrooms ? ['#8f5fa4', '#4c9a8c', '#c97d54'][f.c] : ['#c9534a', '#e2c84f', '#f4f0e6'][f.c];
    g.beginPath();
    g.arc(f.p[0], f.p[1], shrooms ? 0.26 : 0.14, 0, Math.PI * 2);
    g.fill();
  }
  drawWater(g, m, o);
  if (o.grid) {
    g.save();
    path(g, m.outlines);
    g.clip('evenodd');
    gridLines(g, m, o, 'rgba(43,36,32,0.14)');
    g.restore();
  }
  // Ruins, rocks, stones, camp.
  g.strokeStyle = '#7b7266';
  g.lineWidth = 0.55;
  for (const r of m.ruins) {
    g.beginPath();
    g.moveTo(r[0][0], r[0][1]);
    g.lineTo(r[1][0], r[1][1]);
    g.stroke();
  }
  g.strokeStyle = INK;
  g.lineWidth = 0.08;
  for (const r of m.ruins) {
    for (const s of [-0.28, 0.28]) {
      const dx = r[1][0] - r[0][0], dy = r[1][1] - r[0][1], l = Math.hypot(dx, dy) || 1;
      g.beginPath();
      g.moveTo(r[0][0] - (dy / l) * s, r[0][1] + (dx / l) * s);
      g.lineTo(r[1][0] - (dy / l) * s, r[1][1] + (dx / l) * s);
      g.stroke();
    }
  }
  g.fillStyle = '#b5ad9c';
  g.lineWidth = 0.09;
  for (const r of m.rocks) {
    path(g, [r]);
    g.fill();
    g.stroke();
  }
  for (const s of m.stones) {
    g.save();
    g.translate(s.p[0], s.p[1]);
    g.rotate(s.a);
    g.fillStyle = 'rgba(40,35,25,0.25)';
    g.fillRect(-s.w / 2 + 0.2, -s.h / 2 + 0.25, s.w, s.h);
    g.fillStyle = '#c4bcab';
    g.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
    g.strokeRect(-s.w / 2, -s.h / 2, s.w, s.h);
    g.restore();
  }
  for (const t of m.things) drawThing(g, t);
  if (m.camp) {
    const f = m.camp.fire;
    g.fillStyle = '#8c8070';
    for (let q = 0; q < 8; q++) {
      const a = (q / 8) * Math.PI * 2;
      g.beginPath();
      g.arc(f[0] + Math.cos(a) * 0.7, f[1] + Math.sin(a) * 0.7, 0.18, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#d4683a';
    g.beginPath();
    g.arc(f[0], f[1], 0.38, 0, Math.PI * 2);
    g.fill();
    for (const t of m.camp.tents) {
      g.save();
      g.translate(t.p[0], t.p[1]);
      g.rotate(t.a);
      g.fillStyle = '#e8dcc0';
      g.beginPath();
      g.moveTo(1.3, 0);
      g.lineTo(-1, -1.1);
      g.lineTo(-1, 1.1);
      g.closePath();
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(1.3, 0);
      g.lineTo(-1, 0);
      g.stroke();
      g.restore();
    }
  }
  // Canopies: shadows, then a merged ink outline (every crown stroked wide, then filled), then highlights.
  const crowns = [...m.trees.map((t) => ({ ...t, big: false })), ...(m.bigTree ? [{ p: m.bigTree.p, r: m.bigTree.r, shade: 0.5, big: true }] : [])];
  const palette = fungal ? CAPS : cursed ? CANOPY_CURSED : dry ? CANOPY_DRY : CANOPY;
  g.fillStyle = fungal ? 'rgba(30,20,40,0.32)' : 'rgba(30,40,20,0.28)';
  for (const t of crowns) {
    g.beginPath();
    g.arc(t.p[0] + t.r * 0.18, t.p[1] + t.r * 0.25, t.r, 0, Math.PI * 2);
    g.fill();
  }
  const bumpy = (t: { p: Pt; r: number }, r: number) => {
    // A crown with a scalloped edge.
    const n = Math.max(7, Math.round(t.r * 3));
    const a0 = rnd() * Math.PI;
    g.beginPath();
    for (let q = 0; q <= n; q++) {
      const a = a0 + (q / n) * Math.PI * 2;
      const rr = r * (0.92 + 0.08 * Math.cos(q * 2.3));
      const x = t.p[0] + Math.cos(a) * rr, y = t.p[1] + Math.sin(a) * rr;
      if (q === 0) g.moveTo(x, y);
      else g.quadraticCurveTo(t.p[0] + Math.cos(a - Math.PI / n) * rr * 1.12, t.p[1] + Math.sin(a - Math.PI / n) * rr * 1.12, x, y);
    }
    g.closePath();
  };
  g.strokeStyle = INK;
  g.lineWidth = 0.5;
  if (fungal) {
    // Mushroom caps seen from above: smooth rounds, a darker rim, pale spots and a sheen.
    const round = (t: { p: Pt }, r: number) => {
      g.beginPath();
      g.arc(t.p[0], t.p[1], r, 0, Math.PI * 2);
    };
    for (const t of crowns) {
      round(t, t.r);
      g.stroke();
    }
    for (const t of crowns) {
      const h = Math.floor(t.shade * 997);
      g.fillStyle = t.big || h % 9 === 0 ? CAPS_BRIGHT[h % CAPS_BRIGHT.length] : palette[h % palette.length];
      round(t, t.r);
      g.fill();
    }
    g.strokeStyle = 'rgba(40,25,45,0.35)';
    g.lineWidth = 0.18;
    for (const t of crowns) {
      round(t, t.r * 0.82);
      g.stroke();
    }
    g.fillStyle = 'rgba(244,238,222,0.55)';
    for (const t of crowns) {
      if (!t.big && Math.floor(t.shade * 997) % 3) continue;
      const n = 3 + Math.floor(t.shade * 3), a0 = t.shade * 40;
      for (let q = 0; q < n; q++) {
        const a = a0 + q * 2.4, d = t.r * (0.25 + 0.4 * ((q * 0.37 + t.shade) % 1));
        g.beginPath();
        g.arc(t.p[0] + Math.cos(a) * d, t.p[1] + Math.sin(a) * d, t.r * (0.09 + 0.05 * (q % 2)), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = 'rgba(255,255,240,0.16)';
    for (const t of crowns) {
      g.beginPath();
      g.arc(t.p[0] - t.r * 0.3, t.p[1] - t.r * 0.32, t.r * 0.42, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    for (const t of crowns) {
      bumpy(t, t.r * (cursed ? 0.92 : 1));
      g.stroke();
    }
    for (const t of crowns) {
      g.fillStyle = palette[Math.floor(t.shade * palette.length) % palette.length];
      bumpy(t, t.r * (cursed ? 0.92 : 1));
      g.fill();
    }
    if (cursed) {
      // Bare limbs showing through the thin, dying leaves.
      g.strokeStyle = 'rgba(45,38,30,0.65)';
      g.lineWidth = 0.16;
      for (const t of crowns) {
        const n = 4 + Math.floor(t.shade * 3);
        for (let q = 0; q < n; q++) {
          const a = t.shade * 20 + (q / n) * Math.PI * 2;
          g.beginPath();
          g.moveTo(t.p[0], t.p[1]);
          g.quadraticCurveTo(t.p[0] + Math.cos(a + 0.4) * t.r * 0.5, t.p[1] + Math.sin(a + 0.4) * t.r * 0.5, t.p[0] + Math.cos(a) * t.r * 0.95, t.p[1] + Math.sin(a) * t.r * 0.95);
          g.stroke();
        }
      }
    } else {
      g.fillStyle = 'rgba(255,255,220,0.18)';
      for (const t of crowns) {
        g.beginPath();
        g.arc(t.p[0] - t.r * 0.25, t.p[1] - t.r * 0.3, t.r * 0.5, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  if (m.bigTree && !m.links.length && !fungal) {
    // The great tree's limbs, seen through its crown.
    const t = m.bigTree;
    g.strokeStyle = 'rgba(60,45,25,0.55)';
    g.lineWidth = 0.22;
    for (let q = 0; q < 6; q++) {
      const a = (q / 6) * Math.PI * 2 + 0.4;
      g.beginPath();
      g.moveTo(t.p[0], t.p[1]);
      g.quadraticCurveTo(t.p[0] + Math.cos(a + 0.3) * t.r * 0.4, t.p[1] + Math.sin(a + 0.3) * t.r * 0.4, t.p[0] + Math.cos(a) * t.r * 0.75, t.p[1] + Math.sin(a) * t.r * 0.75);
      g.stroke();
    }
  }
  if (m.bigTree && m.links.length) {
    // The hollow trunk, open to the sky: a dark split with a rope down into it.
    const t = m.bigTree;
    g.fillStyle = '#5a4630';
    g.strokeStyle = INK;
    g.lineWidth = 0.15;
    g.beginPath();
    g.arc(t.p[0], t.p[1], Math.min(2.4, t.r * 0.45), 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  for (const l of m.links) drawLink(g, l, o.labels, 0.4);
  if (o.labels) {
    for (const mo of m.mouths) {
      const p: Pt = [mo.p[0] + Math.cos(mo.dir) * 2.5, mo.p[1] + Math.sin(mo.dir) * 2.5];
      g.save();
      g.translate(p[0], p[1]);
      g.rotate(mo.dir);
      g.fillStyle = INK;
      g.beginPath();
      g.moveTo(1.1, 0);
      g.lineTo(-0.5, -0.7);
      g.lineTo(-0.5, 0.7);
      g.closePath();
      g.fill();
      g.restore();
    }
  }
}

/**
 * A mountain pass: hatched mountainside, the trail's shelf of pale stony ground with ragged edges,
 * scree and boulders, snow fields, the stream in its gorge, the trail itself, a rope bridge or a
 * ford, a tunnel through a spur, the cairn, the waystation or shrine, and the lookout's walls.
 */
function drawPass(g: Ctx2D, m: LairMap, o: LairDrawOpts): void {
  const rnd = mulberry32(m.site.seed ^ 0x9a55);
  const MOUNT = '#d6cbb3', SHELF = '#efe7d3';
  if (!o.overlay) {
    g.fillStyle = MOUNT;
    g.fillRect(0, 0, m.W, m.H);
  }
  // The mountainside: hachures falling toward the shelf, thick and long by the cliffs at its edge,
  // thinning out up the slopes; and faint strata across the high rock.
  const tr0 = m.trail ?? [];
  const nearest = (p: Pt): [number, Pt] => {
    let bd = Infinity, bq: Pt = p;
    for (let k = 1; k < tr0.length; k++) {
      const a = tr0[k - 1], b = tr0[k], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
      const q: Pt = [a[0] + dx * t, a[1] + dy * t], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < bd) {
        bd = d;
        bq = q;
      }
    }
    return [bd, bq];
  };
  g.strokeStyle = 'rgba(70,58,44,0.6)';
  g.lineWidth = Math.max(px(o, 1), 0.13);
  g.beginPath();
  for (let t = 0; t < (m.W * m.H) / 1.6; t++) {
    const p: Pt = [rnd() * m.W, rnd() * m.H];
    if (m.open(p)) continue;
    const [d, q] = nearest(p);
    const edge = Math.max(0, d - 4);
    if (rnd() > Math.exp(-edge / 7) * 0.9 + 0.04) continue;
    const L = 0.5 + 1.6 * Math.exp(-edge / 4), ux = (q[0] - p[0]) / (d || 1), uy = (q[1] - p[1]) / (d || 1);
    g.moveTo(p[0], p[1]);
    g.lineTo(p[0] + ux * L, p[1] + uy * L);
  }
  g.stroke();
  g.strokeStyle = 'rgba(90,76,58,0.18)';
  g.lineWidth = Math.max(px(o, 0.8), 0.06);
  g.beginPath();
  for (let t = 0; t < (m.W * m.H) / 40; t++) {
    const p: Pt = [rnd() * m.W, rnd() * m.H];
    if (m.open(p) || nearest(p)[0] < 10) continue;
    const a = 0.4 * Math.sin(p[0] * 0.07 + p[1] * 0.05), L = 2 + 3 * rnd();
    g.moveTo(p[0], p[1]);
    g.lineTo(p[0] + Math.cos(a) * L, p[1] + Math.sin(a) * L);
  }
  g.stroke();
  // A wooded pass: the slopes under trees (conifers high up, round crowns lower down).
  if (m.site.tags.includes('wooded')) {
    const conifer = m.site.tags.includes('large') || m.site.tags.includes('medium');
    const crowns: { p: Pt; r: number; k: number }[] = [];
    for (let t = 0; t < (m.W * m.H) / 5; t++) {
      const p: Pt = [rnd() * m.W, rnd() * m.H];
      if (m.open(p) || nearest(p)[0] < 4.5 || rnd() < 0.35) continue;
      crowns.push({ p, r: 1.3 + 1.1 * rnd(), k: Math.floor(rnd() * 4) });
    }
    crowns.sort((a, b) => a.p[1] - b.p[1]);
    for (const c of crowns) {
      g.fillStyle = 'rgba(30,40,20,0.25)';
      g.beginPath();
      g.arc(c.p[0] + c.r * 0.2, c.p[1] + c.r * 0.3, c.r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = (conifer ? ['#5f7d56', '#56734d', '#6a8860', '#4f6b47'] : CANOPY)[c.k];
      g.strokeStyle = INK;
      g.lineWidth = 0.12;
      g.beginPath();
      if (conifer) {
        // A conifer seen from above: a star of needles.
        for (let q = 0; q < 14; q++) {
          const a = (q / 14) * Math.PI * 2, rr = q % 2 ? c.r * 0.6 : c.r;
          q ? g.lineTo(c.p[0] + Math.cos(a) * rr, c.p[1] + Math.sin(a) * rr) : g.moveTo(c.p[0] + rr, c.p[1]);
        }
        g.closePath();
      } else g.arc(c.p[0], c.p[1], c.r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }
  // A rock band along the shelf's edge, hatched as in the caves.
  g.strokeStyle = '#c4b89e';
  g.lineWidth = 3.4;
  path(g, m.outlines);
  g.stroke();
  g.fillStyle = SHELF;
  path(g, m.outlines);
  g.fill('evenodd');
  if (o.grid) {
    g.save();
    path(g, m.outlines);
    g.clip('evenodd');
    gridLines(g, m, o, 'rgba(43,36,32,0.14)');
    g.restore();
  }
  // Snow, over shelf and rock alike.
  if (m.snow?.length) {
    // Smooth drifts: each blob drawn through the midpoints of its corners.
    const soft = (s: Pt[]) => {
      g.beginPath();
      const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const m0 = mid(s[s.length - 1], s[0]);
      g.moveTo(m0[0], m0[1]);
      for (let k = 0; k < s.length; k++) {
        const c = s[k], n = mid(c, s[(k + 1) % s.length]);
        g.quadraticCurveTo(c[0], c[1], n[0], n[1]);
      }
      g.closePath();
    };
    g.fillStyle = 'rgba(250,252,255,0.72)';
    for (const s of m.snow) {
      soft(s);
      g.fill();
    }
    g.strokeStyle = 'rgba(120,150,175,0.45)';
    g.lineWidth = 0.1;
    for (const s of m.snow) {
      soft(s);
      g.stroke();
    }
  }
  // Scree and boulders.
  g.fillStyle = '#7a7062';
  for (const d of m.dots) {
    g.beginPath();
    g.arc(d.p[0], d.p[1], d.r, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#b8ae9c';
  g.strokeStyle = INK;
  g.lineWidth = 0.09;
  for (const r of m.rocks) {
    path(g, [r]);
    g.fill();
    g.stroke();
  }
  // The edge of the shelf: an inked line, broken where the trail runs off the map.
  g.strokeStyle = INK;
  g.lineWidth = 0.28;
  g.beginPath();
  for (const l of m.outlines) {
    for (let k = 0; k < l.length; k++) {
      const a = l[k], b = l[(k + 1) % l.length];
      if (m.onEdge(a) && m.onEdge(b)) continue;
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
    }
  }
  g.stroke();
  // The stream, cut into a gorge where it runs through the rock.
  if (m.stream) {
    const s = m.stream;
    g.strokeStyle = 'rgba(60,50,40,0.45)';
    g.lineWidth = s.w * 2 + 1.6;
    g.beginPath();
    s.pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.stroke();
  }
  drawWater(g, m, o);
  // The trail: a worn track along the shelf (dashed through the tunnel).
  const tr = tr0;
  const inTunnel = (p: Pt) => (m.tunnels ?? []).some((t) => {
    const dx = t[1][0] - t[0][0], dy = t[1][1] - t[0][1], l2 = dx * dx + dy * dy || 1;
    const u = ((p[0] - t[0][0]) * dx + (p[1] - t[0][1]) * dy) / l2;
    return u > 0.02 && u < 0.98 && Math.abs((p[0] - t[0][0]) * dy - (p[1] - t[0][1]) * dx) / Math.sqrt(l2) < 2;
  });
  g.strokeStyle = 'rgba(160,132,92,0.65)';
  g.lineWidth = 1.5;
  g.beginPath();
  let pen = false;
  for (const p of tr) {
    if (inTunnel(p)) {
      pen = false;
      continue;
    }
    if (pen) g.lineTo(p[0], p[1]);
    else g.moveTo(p[0], p[1]);
    pen = true;
  }
  g.stroke();
  for (const t of m.tunnels ?? []) {
    // Through the rock: two dashed walls, and the dark mouths at each end.
    const [a, b] = t, dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, w = 1.3;
    g.strokeStyle = INK;
    g.lineWidth = 0.14;
    g.setLineDash?.([0.6, 0.45]);
    g.beginPath();
    for (const s of [-w, w]) {
      g.moveTo(a[0] + nx * s, a[1] + ny * s);
      g.lineTo(b[0] + nx * s, b[1] + ny * s);
    }
    g.stroke();
    g.setLineDash?.([]);
    g.fillStyle = '#2b2420';
    for (const [p, sgn] of [[a, 1], [b, -1]] as [Pt, number][]) {
      g.beginPath();
      g.arc(p[0], p[1], w, Math.atan2(ny, nx) + (sgn > 0 ? 0 : Math.PI), Math.atan2(ny, nx) + (sgn > 0 ? Math.PI : 2 * Math.PI));
      g.closePath();
      g.fill();
    }
  }
  for (const br of m.bridges ?? []) {
    const dx = br.b[0] - br.a[0], dy = br.b[1] - br.a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, w = 0.9;
    g.fillStyle = '#b79a6a';
    g.strokeStyle = INK;
    g.lineWidth = 0.07;
    for (let s = 0.15; s < l; s += 0.42) {
      if (rnd() < 0.1) continue;
      const cx = br.a[0] + (dx / l) * s, cy = br.a[1] + (dy / l) * s;
      g.beginPath();
      g.moveTo(cx - nx * w, cy - ny * w);
      g.lineTo(cx + nx * w + (dx / l) * 0.3, cy + ny * w + (dy / l) * 0.3);
      g.lineTo(cx + nx * w + (dx / l) * 0.3, cy + ny * w + (dy / l) * 0.3);
      g.lineTo(cx - nx * w + (dx / l) * 0.3, cy - ny * w + (dy / l) * 0.3);
      g.closePath();
      g.fill();
      g.stroke();
    }
    g.strokeStyle = '#6b5233';
    g.lineWidth = 0.1;
    g.beginPath();
    for (const s of [-w - 0.1, w + 0.1]) {
      g.moveTo(br.a[0] + nx * s - (dx / l) * 0.6, br.a[1] + ny * s - (dy / l) * 0.6);
      g.lineTo(br.b[0] + nx * s + (dx / l) * 0.6, br.b[1] + ny * s + (dy / l) * 0.6);
    }
    g.stroke();
  }
  for (const f of m.fords ?? []) {
    g.fillStyle = '#c4bcab';
    g.strokeStyle = INK;
    g.lineWidth = 0.07;
    for (let q = -2; q <= 2; q++) {
      g.beginPath();
      g.arc(f[0] + q * 0.7 + (rnd() - 0.5) * 0.3, f[1] + q * 0.5 + (rnd() - 0.5) * 0.3, 0.32, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }
  // The lookout's broken walls.
  g.strokeStyle = '#7b7266';
  g.lineWidth = 0.7;
  for (const w of m.ruins) {
    g.beginPath();
    g.moveTo(w[0][0], w[0][1]);
    g.lineTo(w[1][0], w[1][1]);
    g.stroke();
  }
  // Cairns: a heap of stones.
  for (const c of m.cairns ?? []) {
    g.fillStyle = 'rgba(40,35,25,0.25)';
    g.beginPath();
    g.arc(c[0] + 0.3, c[1] + 0.35, 1.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#b5ad9c';
    g.strokeStyle = INK;
    g.lineWidth = 0.07;
    for (const [dx, dy, r] of [[-0.5, 0.3, 0.55], [0.5, 0.35, 0.5], [0, -0.2, 0.55], [0.1, 0.55, 0.4], [-0.1, -0.7, 0.35]]) {
      g.beginPath();
      g.arc(c[0] + dx, c[1] + dy, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }
  for (const t of m.things) drawThing(g, t);
  if (m.camp) {
    const f = m.camp.fire;
    g.fillStyle = '#8c8070';
    for (let q = 0; q < 8; q++) {
      const a = (q / 8) * Math.PI * 2;
      g.beginPath();
      g.arc(f[0] + Math.cos(a) * 0.7, f[1] + Math.sin(a) * 0.7, 0.18, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#d4683a';
    g.beginPath();
    g.arc(f[0], f[1], 0.38, 0, Math.PI * 2);
    g.fill();
  }
  if (o.labels) {
    for (const mo of m.mouths) {
      const p: Pt = [mo.p[0] + Math.cos(mo.dir) * 3, mo.p[1] + Math.sin(mo.dir) * 3];
      g.save();
      g.translate(p[0], p[1]);
      g.rotate(mo.dir);
      g.fillStyle = INK;
      g.beginPath();
      g.moveTo(1.1, 0);
      g.lineTo(-0.5, -0.7);
      g.lineTo(-0.5, 0.7);
      g.closePath();
      g.fill();
      g.restore();
    }
  }
}

/**
 * A cavern of the Underworld: drawn as a cave, then what fills it: chasms (dark, with hatched
 * lips), the streets and walls of a fallen city, crystal clusters, giant fungi, stone or rope
 * bridges, and the shafts' markers again on top.
 */
function drawDeep(g: Ctx2D, m: LairMap, o: LairDrawOpts): void {
  const rnd = mulberry32(m.site.seed ^ 0xdee9);
  drawCave(g, m, o);
  if (m.site.deep?.kind === 'fungal') {
    g.fillStyle = 'rgba(110,90,140,0.12)';
    path(g, m.outlines);
    g.fill('evenodd');
  }
  if (m.chasms?.length) {
    g.fillStyle = '#1b1714';
    path(g, m.chasms);
    g.fill('evenodd');
    g.save();
    path(g, m.chasms);
    g.clip('evenodd');
    // The lip falling away: shading just inside the edge.
    g.strokeStyle = 'rgba(120,105,90,0.55)';
    g.lineWidth = 1.6;
    path(g, m.chasms);
    g.stroke();
    g.restore();
    g.strokeStyle = INK;
    g.lineWidth = 0.3;
    path(g, m.chasms);
    g.stroke();
  }
  // What stands on the floor stays within the cavern's walls.
  g.save();
  path(g, m.outlines);
  g.clip('evenodd');
  // Streets: paved strips; then the city's broken walls.
  g.strokeStyle = 'rgba(150,135,110,0.55)';
  g.lineWidth = 2.2;
  for (const l of m.paths) {
    g.beginPath();
    l.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.stroke();
  }
  g.strokeStyle = '#6d6458';
  g.lineWidth = 0.55;
  for (const w of m.ruins) {
    g.beginPath();
    g.moveTo(w[0][0], w[0][1]);
    g.lineTo(w[1][0], w[1][1]);
    g.stroke();
  }
  // Crystals: pale blue points with an inked edge.
  g.fillStyle = 'rgba(170,205,230,0.9)';
  g.strokeStyle = '#38546a';
  g.lineWidth = 0.07;
  for (const c of m.crystals ?? []) {
    for (let k = 0; k + 2 < c.length; k += 3) {
      g.beginPath();
      g.moveTo(c[k][0], c[k][1]);
      g.lineTo(c[k + 1][0], c[k + 1][1]);
      g.lineTo(c[k + 2][0], c[k + 2][1]);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
  for (const b of m.blds ?? []) drawBuilding(g, b);
  for (const t of m.things) drawThing(g, t);
  if (m.camp) {
    const f = m.camp.fire;
    g.fillStyle = '#8c8070';
    for (let q = 0; q < 8; q++) {
      const a = (q / 8) * Math.PI * 2;
      g.beginPath();
      g.arc(f[0] + Math.cos(a) * 0.9, f[1] + Math.sin(a) * 0.9, 0.22, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#d4683a';
    g.beginPath();
    g.arc(f[0], f[1], 0.5, 0, Math.PI * 2);
    g.fill();
  }
  // Giant fungi: shadowed caps with a dark rim, pale spots and a soft glow.
  if (m.trees.length) {
    const CAP = ['#7d6a8c', '#6a7f86', '#86707c', '#72688c', '#64796f'], BRIGHT = ['#9a62ab', '#4c9a8c', '#5f8fb8', '#ad5a72'];
    for (const t of m.trees) {
      const glow = g.createRadialGradient(t.p[0], t.p[1], t.r * 0.5, t.p[0], t.p[1], t.r * 2);
      glow.addColorStop(0, 'rgba(140,200,210,0.25)');
      glow.addColorStop(1, 'rgba(140,200,210,0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(t.p[0], t.p[1], t.r * 2, 0, Math.PI * 2);
      g.fill();
    }
    for (const t of m.trees) {
      g.fillStyle = 'rgba(30,20,40,0.3)';
      g.beginPath();
      g.arc(t.p[0] + t.r * 0.2, t.p[1] + t.r * 0.28, t.r, 0, Math.PI * 2);
      g.fill();
      const h = Math.floor(t.shade * 997);
      g.fillStyle = h % 7 === 0 ? BRIGHT[h % BRIGHT.length] : CAP[h % CAP.length];
      g.strokeStyle = INK;
      g.lineWidth = 0.14;
      g.beginPath();
      g.arc(t.p[0], t.p[1], t.r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.strokeStyle = 'rgba(40,25,45,0.35)';
      g.beginPath();
      g.arc(t.p[0], t.p[1], t.r * 0.8, 0, Math.PI * 2);
      g.stroke();
      if (t.r > 1.6) {
        g.fillStyle = 'rgba(244,238,222,0.6)';
        for (let q = 0; q < 4; q++) {
          const a = t.shade * 30 + q * 2.4, d = t.r * (0.3 + 0.35 * ((q * 0.37 + t.shade) % 1));
          g.beginPath();
          g.arc(t.p[0] + Math.cos(a) * d, t.p[1] + Math.sin(a) * d, t.r * 0.1, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }
  g.restore();
  // Bridges: planks between ropes, or a span of stone.
  for (const br of m.bridges ?? []) {
    const dx = br.b[0] - br.a[0], dy = br.b[1] - br.a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    if (!br.rope) {
      const w = 1.4;
      g.fillStyle = '#bdb3a0';
      g.strokeStyle = INK;
      g.lineWidth = 0.14;
      g.beginPath();
      g.moveTo(br.a[0] + nx * w, br.a[1] + ny * w);
      g.lineTo(br.b[0] + nx * w, br.b[1] + ny * w);
      g.lineTo(br.b[0] - nx * w, br.b[1] - ny * w);
      g.lineTo(br.a[0] - nx * w, br.a[1] - ny * w);
      g.closePath();
      g.fill();
      g.stroke();
      g.strokeStyle = 'rgba(43,36,32,0.4)';
      g.lineWidth = 0.06;
      g.beginPath();
      for (let s = 0.8; s < l; s += 0.8) {
        g.moveTo(br.a[0] + (dx / l) * s + nx * w, br.a[1] + (dy / l) * s + ny * w);
        g.lineTo(br.a[0] + (dx / l) * s - nx * w, br.a[1] + (dy / l) * s - ny * w);
      }
      g.stroke();
      continue;
    }
    const w = 0.9;
    g.fillStyle = '#b79a6a';
    g.strokeStyle = INK;
    g.lineWidth = 0.07;
    for (let s = 0.15; s < l; s += 0.42) {
      if (rnd() < 0.1) continue;
      const cx = br.a[0] + (dx / l) * s, cy = br.a[1] + (dy / l) * s;
      g.beginPath();
      g.moveTo(cx - nx * w, cy - ny * w);
      g.lineTo(cx + nx * w, cy + ny * w);
      g.lineTo(cx + nx * w + (dx / l) * 0.3, cy + ny * w + (dy / l) * 0.3);
      g.lineTo(cx - nx * w + (dx / l) * 0.3, cy - ny * w + (dy / l) * 0.3);
      g.closePath();
      g.fill();
      g.stroke();
    }
    g.strokeStyle = '#6b5233';
    g.lineWidth = 0.1;
    g.beginPath();
    for (const s of [-w - 0.1, w + 0.1]) {
      g.moveTo(br.a[0] + nx * s - (dx / l) * 0.6, br.a[1] + ny * s - (dy / l) * 0.6);
      g.lineTo(br.b[0] + nx * s + (dx / l) * 0.6, br.b[1] + ny * s + (dy / l) * 0.6);
    }
    g.stroke();
  }
  for (const l of m.links) drawLink(g, l, o.labels, (m.site.seed % 628) / 100);
}

/** A building of a city of the deep, seen from above. */
function drawBuilding(g: Ctx2D, b: NonNullable<LairMap['blds']>[number]): void {
  const [x, y] = b.p;
  g.save();
  g.translate(x, y);
  g.rotate(b.a);
  g.strokeStyle = INK;
  g.lineWidth = 0.12;
  const shadow = (draw: () => void) => {
    g.save();
    g.translate(0.35, 0.45);
    g.fillStyle = 'rgba(30,25,20,0.3)';
    draw();
    g.fill();
    g.restore();
  };
  const circle = (r: number) => () => {
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
  };
  const rect = (w: number, h: number) => () => {
    g.beginPath();
    g.rect(-w / 2, -h / 2, w, h);
  };
  const poly = (n: number, r: number) => () => {
    g.beginPath();
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.PI / n;
      k ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
  };
  const r = b.w / 2;
  switch (b.kind) {
    case 'spire': {
      // A hollowed stalagmite: a dark round tower, ribbed, lit within.
      shadow(circle(r));
      circle(r)();
      g.fillStyle = '#5c5468';
      g.fill();
      g.stroke();
      g.strokeStyle = 'rgba(200,185,230,0.55)';
      g.lineWidth = 0.08;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
        g.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
      }
      g.stroke();
      g.fillStyle = '#b48ee0';
      circle(r * 0.22)();
      g.fill();
      break;
    }
    case 'compound': {
      // A noble house: a wall round a court, a tower at each corner, the house within.
      g.fillStyle = '#ddd3c0';
      rect(b.w, b.h)();
      g.fill();
      g.lineWidth = 0.45;
      g.strokeStyle = '#3b3440';
      g.stroke();
      g.lineWidth = 0.12;
      g.strokeStyle = INK;
      shadow(rect(b.w * 0.5, b.h * 0.5));
      g.fillStyle = '#5c5468';
      rect(b.w * 0.5, b.h * 0.5)();
      g.fill();
      g.stroke();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.beginPath();
        g.arc((sx * b.w) / 2, (sy * b.h) / 2, 0.9, 0, Math.PI * 2);
        g.fillStyle = '#5c5468';
        g.fill();
        g.stroke();
      }
      break;
    }
    case 'temple': {
      // The temple of the Veiled Mother: an octagon hung with a silver web.
      shadow(poly(8, r));
      poly(8, r)();
      g.fillStyle = '#3a3040';
      g.fill();
      g.stroke();
      g.strokeStyle = 'rgba(220,215,235,0.75)';
      g.lineWidth = 0.08;
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
      }
      g.stroke();
      for (const k of [0.3, 0.55, 0.8]) {
        poly(8, r * k)();
        g.stroke();
      }
      break;
    }
    case 'burrow': {
      // A gnome's round house cut into the rock, with its little door.
      shadow(circle(r));
      circle(r)();
      g.fillStyle = '#b9a98a';
      g.fill();
      g.stroke();
      g.fillStyle = '#3d3020';
      g.beginPath();
      g.arc(0, r * 0.55, r * 0.3, Math.PI, 0);
      g.fill();
      break;
    }
    case 'workshop': {
      shadow(rect(b.w, b.h));
      rect(b.w, b.h)();
      g.fillStyle = '#a89878';
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(170,205,230,0.9)';
      for (const dx of [-1, 0.2, 1.2]) {
        g.beginPath();
        g.arc(dx, 0, 0.25, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'farm': {
      g.fillStyle = '#c9c0a8';
      rect(b.w, b.h)();
      g.fill();
      g.strokeStyle = 'rgba(43,36,32,0.4)';
      g.stroke();
      g.fillStyle = '#86707c';
      for (let fx = -b.w / 2 + 0.6; fx < b.w / 2; fx += 0.9) {
        for (let fy = -b.h / 2 + 0.6; fy < b.h / 2; fy += 1.1) {
          g.beginPath();
          g.arc(fx, fy, 0.22, 0, Math.PI * 2);
          g.fill();
        }
      }
      break;
    }
    case 'tower':
    case 'ring': {
      // The fungus folk's living towers: great caps; the eldest's ring, caps round a pool.
      const caps: [number, number, number][] = b.kind === 'tower' ? [[0, 0, r]] : Array.from({ length: 9 }, (_, k) => [Math.cos((k / 9) * Math.PI * 2) * r * 0.75, Math.sin((k / 9) * Math.PI * 2) * r * 0.75, r * 0.24] as [number, number, number]);
      if (b.kind === 'ring') {
        g.fillStyle = WATER_C;
        circle(r * 0.35)();
        g.fill();
      }
      for (const [cx, cy, cr] of caps) {
        g.fillStyle = 'rgba(30,20,40,0.3)';
        g.beginPath();
        g.arc(cx + cr * 0.2, cy + cr * 0.25, cr, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = ['#8f5fa4', '#4c9a8c', '#7d6a8c', '#c47c52'][Math.abs(Math.round(cx * 7 + cy * 3)) % 4];
        g.beginPath();
        g.arc(cx, cy, cr, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = 'rgba(244,238,222,0.6)';
        for (let q = 0; q < 3; q++) {
          g.beginPath();
          g.arc(cx + Math.cos(q * 2.1) * cr * 0.45, cy + Math.sin(q * 2.1) * cr * 0.45, cr * 0.12, 0, Math.PI * 2);
          g.fill();
        }
      }
      break;
    }
    case 'hall':
    case 'forge':
    case 'pen': {
      shadow(rect(b.w, b.h));
      rect(b.w, b.h)();
      g.fillStyle = b.kind === 'forge' ? '#5a524c' : b.kind === 'pen' ? '#cfc6b4' : '#6d6a64';
      g.fill();
      g.lineWidth = 0.18;
      g.stroke();
      g.lineWidth = 0.08;
      if (b.kind === 'hall') {
        g.strokeStyle = 'rgba(230,225,215,0.4)';
        rect(b.w - 1.2, b.h - 1.2)();
        g.stroke();
      } else if (b.kind === 'forge') {
        const glow = g.createRadialGradient(0, 0, 0, 0, 0, b.w * 0.45);
        glow.addColorStop(0, 'rgba(255,140,60,0.95)');
        glow.addColorStop(1, 'rgba(255,90,30,0)');
        g.fillStyle = glow;
        circle(b.w * 0.45)();
        g.fill();
      } else {
        g.beginPath();
        for (let px = -b.w / 2 + 0.5; px < b.w / 2; px += 0.5) {
          g.moveTo(px, -b.h / 2);
          g.lineTo(px, b.h / 2);
        }
        g.stroke();
      }
      break;
    }
    case 'gate': {
      g.fillStyle = '#2b2622';
      rect(b.w, b.h)();
      g.fill();
      g.strokeStyle = '#8a8070';
      g.lineWidth = 0.1;
      g.beginPath();
      for (let px = -b.w / 2 + 0.4; px < b.w / 2; px += 0.6) {
        g.moveTo(px, -b.h / 2 - 0.4);
        g.lineTo(px, b.h / 2 + 0.4);
      }
      g.stroke();
      break;
    }
  }
  g.restore();
}

function drawThing(g: Ctx2D, t: LairMap['things'][number]): void {
  g.save();
  g.translate(t.p[0], t.p[1]);
  g.rotate(t.a);
  g.strokeStyle = INK;
  g.lineWidth = 0.1;
  if (t.kind === 'hut') {
    // A shadowed thatched roof with a ridge line and a smoke hole.
    g.fillStyle = 'rgba(40,35,25,0.28)';
    g.fillRect(-t.w / 2 + 0.3, -t.h / 2 + 0.4, t.w, t.h);
    g.fillStyle = '#c8a86a';
    g.fillRect(-t.w / 2, -t.h / 2, t.w, t.h);
    g.strokeRect(-t.w / 2, -t.h / 2, t.w, t.h);
    g.beginPath();
    g.moveTo(-t.w / 2, 0);
    g.lineTo(t.w / 2, 0);
    for (let x = -t.w / 2 + 0.5; x < t.w / 2; x += 0.6) {
      g.moveTo(x, -t.h / 2);
      g.lineTo(x, -0.15);
      g.moveTo(x, 0.15);
      g.lineTo(x, t.h / 2);
    }
    g.lineWidth = 0.05;
    g.stroke();
    g.fillStyle = '#3d3020';
    g.beginPath();
    g.arc(t.w * 0.2, 0, 0.3, 0, Math.PI * 2);
    g.fill();
  } else if (t.kind === 'shrine') {
    g.fillStyle = '#c4bcab';
    g.fillRect(-t.w / 2, -t.h / 2, t.w, t.h);
    g.strokeRect(-t.w / 2, -t.h / 2, t.w, t.h);
    g.fillStyle = '#efe7d4';
    g.beginPath();
    g.arc(0, -0.1, 0.45, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // Offerings.
    g.fillStyle = '#c9534a';
    for (const x of [-0.7, 0.7]) {
      g.beginPath();
      g.arc(x, t.h / 2 - 0.3, 0.12, 0, Math.PI * 2);
      g.fill();
    }
  } else if (t.kind === 'altar') {
    g.fillStyle = 'rgba(40,35,25,0.25)';
    g.fillRect(-t.w / 2 + 0.2, -t.h / 2 + 0.25, t.w, t.h);
    g.fillStyle = '#b5ad9c';
    g.fillRect(-t.w / 2, -t.h / 2, t.w, t.h);
    g.strokeRect(-t.w / 2, -t.h / 2, t.w, t.h);
  } else {
    g.fillStyle = '#b5ad9c';
    g.beginPath();
    g.arc(0, 0, t.w / 2, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#2f4b55';
    g.beginPath();
    g.arc(0, 0, t.w * 0.3, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** Lines of text wrapped to a width. */
function wrap(g: Ctx2D, text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > width && line) {
      out.push(line);
      line = w;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** The printable page for a map with a key (groves): title, hook, the map and its key beside it. */
export function lairPage(m: LairMap, opts: { grid: boolean; labels: boolean; subtitle: string }): HTMLCanvasElement {
  const scale = Math.min(18, 1500 / Math.max(m.W, m.H)), pad = 36, keyW = 420;
  const mapW = Math.round(m.W * scale), mapH = Math.round(m.H * scale);
  const meas = document.createElement('canvas').getContext('2d')!;
  const lines: { text: string; font: string; gap: number; indent?: number }[] = [];
  for (const r of m.rooms) {
    lines.push({ text: `${r.n}. ${r.name}`, font: "bold 16px 'IM Fell English', Georgia, serif", gap: 6 });
    meas.font = "15px 'IM Fell English', Georgia, serif";
    for (const t of wrap(meas, r.text, keyW)) lines.push({ text: t, font: "15px 'IM Fell English', Georgia, serif", gap: 0 });
    for (const nt of r.notes ?? []) {
      meas.font = "italic 14px 'IM Fell English', Georgia, serif";
      wrap(meas, `${nt.label}: ${nt.text}`, keyW - 14).forEach((t, k) => lines.push({ text: t, font: "italic 14px 'IM Fell English', Georgia, serif", gap: k ? 0 : 2, indent: 14 }));
    }
  }
  const top = m.levels[0];
  meas.font = "italic 16px 'IM Fell English', Georgia, serif";
  const hook = top.hook ? wrap(meas, top.hook, mapW + keyW + pad - 20) : [];
  const headH = 66 + hook.length * 20 + 14;
  const keyH = lines.reduce((a, l) => a + 19 + l.gap, 0);
  const W = pad * 3 + mapW + keyW, H = pad * 2 + headH + Math.max(mapH, keyH);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  g.fillStyle = INK;
  g.textBaseline = 'top';
  g.font = "italic 36px 'IM Fell English', Georgia, serif";
  const name = m.site.name;
  g.fillText(name.charAt(0).toUpperCase() + name.slice(1), pad, pad);
  g.font = "16px 'IM Fell English', Georgia, serif";
  g.fillText(opts.subtitle, pad, pad + 44);
  g.font = "italic 16px 'IM Fell English', Georgia, serif";
  hook.forEach((t, k) => g.fillText(t, pad, pad + 70 + k * 20));
  const y0 = pad + headH;
  drawLair(g, m, { scale, ox: pad, oy: y0, grid: opts.grid, labels: opts.labels });
  g.strokeStyle = INK;
  g.lineWidth = 1.5;
  g.strokeRect(pad, y0, mapW, mapH);
  let y = y0;
  const x = pad * 2 + mapW;
  g.fillStyle = INK;
  for (const l of lines) {
    y += l.gap;
    g.font = l.font;
    g.fillText(l.text, x + (l.indent ?? 0), y);
    y += 19;
  }
  return c;
}

/** A small rendering of the map (no grid) for hover cards. */
export function lairThumbnail(m: LairMap, w: number, h: number): string {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d') as Ctx2D;
  g.scale(dpr, dpr);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, w, h);
  const scale = Math.min(w / m.W, h / m.H);
  drawLair(g, m, { scale, ox: (w - m.W * scale) / 2, oy: (h - m.H * scale) / 2, grid: false, labels: false });
  return canvas.toDataURL('image/png');
}
