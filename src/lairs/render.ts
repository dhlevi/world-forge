import { mulberry32 } from '../gen/rng';
import { LAIR_CELL, type LairMap, type Pt } from './lair';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const PAPER = '#f3ead3';
const INK = '#2b2420';
const FLOOR = '#f7f1e1';
const ROCK = '#d8cfbd';
const WATER = '#a8c4cc';
const WATER_INK = '#4b6b78';

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
  if (m.site.kind === 'cave') drawCave(g, m, o);
  else drawGlade(g, m, o);
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
  if (o.labels) {
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
}

function drawWater(g: Ctx2D, m: LairMap, o: LairDrawOpts): void {
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
  }
}

const CANOPY = ['#6f8a4a', '#7d9752', '#64803f', '#86a05a'];
const CANOPY_DRY = ['#8a8c4c', '#97934f', '#7f8242', '#a19c5a'];

function drawGlade(g: Ctx2D, m: LairMap, o: LairDrawOpts): void {
  const dry = m.site.tags.includes('dry');
  const rnd = mulberry32(m.site.seed ^ 0x61ade);
  // Forest floor, then the clearing.
  g.fillStyle = dry ? '#a9a76f' : '#93a86b';
  g.fillRect(0, 0, m.W, m.H);
  g.fillStyle = dry ? '#e4d9a6' : '#d6dfa3';
  path(g, m.outlines);
  g.fill('evenodd');
  g.strokeStyle = dry ? 'rgba(120,100,50,0.35)' : 'rgba(70,90,40,0.35)';
  g.lineWidth = 0.25;
  path(g, m.outlines);
  g.stroke();
  // Grass tufts.
  g.strokeStyle = dry ? 'rgba(125,105,55,0.7)' : 'rgba(80,105,50,0.7)';
  g.lineWidth = 0.08;
  g.beginPath();
  for (const p of m.tufts) {
    for (const dx of [-0.18, 0, 0.18]) {
      g.moveTo(p[0] + dx * 0.4, p[1]);
      g.lineTo(p[0] + dx, p[1] - 0.35 - Math.abs(dx));
    }
  }
  g.stroke();
  for (const f of m.flowers) {
    g.fillStyle = ['#c9534a', '#e2c84f', '#f4f0e6'][f.c];
    g.beginPath();
    g.arc(f.p[0], f.p[1], 0.14, 0, Math.PI * 2);
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
  const palette = dry ? CANOPY_DRY : CANOPY;
  g.fillStyle = 'rgba(30,40,20,0.28)';
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
  for (const t of crowns) {
    bumpy(t, t.r);
    g.stroke();
  }
  for (const t of crowns) {
    g.fillStyle = palette[Math.floor(t.shade * palette.length) % palette.length];
    bumpy(t, t.r);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,220,0.18)';
  for (const t of crowns) {
    g.beginPath();
    g.arc(t.p[0] - t.r * 0.25, t.p[1] - t.r * 0.3, t.r * 0.5, 0, Math.PI * 2);
    g.fill();
  }
  if (m.bigTree) {
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
