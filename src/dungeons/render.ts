import { mulberry32 } from '../gen/rng';
import { CHANNEL, type DDoor, type DLevel, type DLink, type DProp, type Dungeon, GROUND, KIND_NAME, PIT, RUBBLE, VOID, WATER, at } from './core';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const PAPER = '#f3ead3';
const INK = '#2b2420';
const FLOOR_C = '#fbf7ec';
const ROCK_C = '#ddd3bf';
const WATER_C = '#a8c4cc';
const WATER_INK = '#4b6b78';
const LAND = '#c9cf9a';
const SERIF = "'IM Fell English', Georgia, serif";

export interface DungeonDrawOpts {
  /** Pixels per cell and the level's top-left corner on the canvas. */
  scale: number;
  ox: number;
  oy: number;
  grid: boolean;
  labels: boolean;
}

const isOpen = (v: number) => v !== VOID && v !== GROUND;

/**
 * Draws one level in the manner of the One Page Dungeon: hatched rock, pale floors on a grid, thick
 * ink walls with a drop shadow, doors set in the walls, furniture, ways up and down, and room numbers.
 */
export function drawLevel(g: Ctx2D, d: Dungeon, L: DLevel, o: DungeonDrawOpts): void {
  const rnd = mulberry32(d.site.seed ^ (L.W * 131 + L.H));
  g.save();
  g.translate(o.ox, o.oy);
  g.scale(o.scale, o.scale);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  g.rect(0, 0, L.W, L.H);
  g.clip();
  const lw = (px: number) => px / o.scale;

  // Ground: rock (with hatching near the walls) or open land.
  g.fillStyle = L.outdoor ? LAND : PAPER;
  g.fillRect(0, 0, L.W, L.H);
  if (L.outdoor) {
    g.fillStyle = 'rgba(90,110,50,0.35)';
    for (let k = 0; k < L.W * L.H * 0.25; k++) {
      g.fillRect(rnd() * L.W, rnd() * L.H, 0.08, 0.22);
    }
  } else hatch(g, L, rnd, lw);

  // Floor (and its shadow), clipped to the tower's round wall where there is one.
  g.save();
  if (L.round) {
    g.beginPath();
    g.arc(L.round.cx, L.round.cy, L.round.r, 0, Math.PI * 2);
    g.clip();
  }
  if (L.round) {
    g.fillStyle = FLOOR_C;
    g.fillRect(0, 0, L.W, L.H);
  }
  if (!L.outdoor || L.round) {
    g.fillStyle = 'rgba(43,36,32,0.25)';
    cells(g, L, isOpen, 0.25, 0.3);
  }
  g.fillStyle = FLOOR_C;
  cells(g, L, isOpen);
  g.fillStyle = WATER_C;
  cells(g, L, (v) => v === WATER || v === CHANNEL);
  g.fillStyle = '#e4dccb';
  cells(g, L, (v) => v === RUBBLE);
  g.fillStyle = '#2b2420';
  cells(g, L, (v) => v === PIT);
  // Water ripples.
  g.strokeStyle = 'rgba(75,107,120,0.5)';
  g.lineWidth = lw(1);
  g.beginPath();
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
    const v = at(L, x, y);
    if ((v === WATER || v === CHANNEL) && (x + y * 3) % 4 === 0) {
      g.moveTo(x + 0.2, y + 0.55);
      g.quadraticCurveTo(x + 0.4, y + 0.4, x + 0.6, y + 0.55);
      g.quadraticCurveTo(x + 0.75, y + 0.7, x + 0.85, y + 0.55);
    }
  }
  g.stroke();
  // Rubble dots.
  g.fillStyle = '#8a7f6f';
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
    if (at(L, x, y) !== RUBBLE) continue;
    for (let q = 0; q < 4; q++) {
      g.beginPath();
      g.arc(x + 0.15 + rnd() * 0.7, y + 0.15 + rnd() * 0.7, 0.06 + rnd() * 0.08, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (o.grid) {
    g.strokeStyle = 'rgba(43,36,32,0.18)';
    g.lineWidth = lw(0.8);
    g.beginPath();
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
      if (!isOpen(at(L, x, y))) continue;
      g.moveTo(x, y);
      g.lineTo(x + 1, y);
      g.moveTo(x, y);
      g.lineTo(x, y + 1);
      if (!isOpen(at(L, x + 1, y))) {
        g.moveTo(x + 1, y);
        g.lineTo(x + 1, y + 1);
      }
      if (!isOpen(at(L, x, y + 1))) {
        g.moveTo(x, y + 1);
        g.lineTo(x + 1, y + 1);
      }
    }
    g.stroke();
  }
  g.restore();

  // Channels and rails.
  for (const line of L.rails) {
    if (d.site.kind === 'sewer') {
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.lineWidth = lw(1.2);
      g.setLineDash?.([0.5, 0.9]);
      poly(g, line);
      g.stroke();
      g.setLineDash?.([]);
      continue;
    }
    g.strokeStyle = '#7a6a55';
    g.lineWidth = 0.12;
    // Sleepers, then two rails.
    g.beginPath();
    for (let k = 1; k < line.length; k++) {
      const [x0, y0] = line[k - 1], [x1, y1] = line[k];
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
      g.moveTo(x0 - (dy / l) * 0.45, y0 + (dx / l) * 0.45);
      g.lineTo(x0 + (dy / l) * 0.45, y0 - (dx / l) * 0.45);
    }
    g.stroke();
    g.strokeStyle = INK;
    g.lineWidth = lw(1.1);
    for (const s of [-0.28, 0.28]) {
      g.beginPath();
      line.forEach(([x, y], k) => {
        const [ax, ay] = line[Math.max(0, k - 1)], [bx, by] = line[Math.min(line.length - 1, k + 1)];
        const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
        const px = x - (dy / l) * s, py = y + (dx / l) * s;
        if (k) g.lineTo(px, py);
        else g.moveTo(px, py);
      });
      g.stroke();
    }
  }

  for (const p of L.props) prop(g, p, rnd, lw);

  // Walls: every edge between open and solid cells (not for outdoor levels), the partitions, the round wall.
  g.strokeStyle = INK;
  g.lineWidth = 0.3;
  if (!L.outdoor && !L.round) {
    g.beginPath();
    for (let y = 0; y <= L.H; y++) for (let x = 0; x <= L.W; x++) {
      const v = isOpen(at(L, x, y));
      if (v !== isOpen(at(L, x - 1, y)) && y < L.H) {
        g.moveTo(x, y);
        g.lineTo(x, y + 1);
      }
      if (v !== isOpen(at(L, x, y - 1)) && x < L.W) {
        g.moveTo(x, y);
        g.lineTo(x + 1, y);
      }
    }
    g.stroke();
  }
  if (L.walls.length) {
    g.lineWidth = L.outdoor && !L.round ? 0.42 : 0.24;
    g.strokeStyle = L.outdoor && !L.round ? '#5d554b' : INK;
    g.beginPath();
    for (const [x0, y0, x1, y1] of L.walls) {
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
    }
    g.stroke();
  }
  if (L.round) {
    const { cx, cy, r } = L.round;
    g.lineWidth = 0.75;
    g.beginPath();
    g.arc(cx, cy, r + 0.3, 0, Math.PI * 2);
    g.stroke();
    if (L.outdoor) {
      // Crenellations: gaps (embrasures) in the parapet.
      g.fillStyle = '#d8cfbd';
      const n = Math.round(r * 3.2);
      for (let k = 0; k < n; k += 2) {
        const a = (k / n) * Math.PI * 2;
        g.save();
        g.translate(cx + Math.cos(a) * (r + 0.3), cy + Math.sin(a) * (r + 0.3));
        g.rotate(a);
        g.fillRect(-0.26, -0.3, 0.52, 0.6);
        g.restore();
      }
    }
    // The tower door: a gap in the wall with a door across it.
    for (const e of L.entrances) {
      const a = Math.atan2(e.y - cy, e.x - cx);
      g.save();
      g.translate(cx + Math.cos(a) * (r + 0.3), cy + Math.sin(a) * (r + 0.3));
      g.rotate(a + Math.PI / 2);
      g.fillStyle = FLOOR_C;
      g.fillRect(-0.55, -0.45, 1.1, 0.9);
      g.fillStyle = '#fff';
      g.lineWidth = 0.08;
      g.fillRect(-0.45, -0.15, 0.9, 0.3);
      g.strokeRect(-0.45, -0.15, 0.9, 0.3);
      g.restore();
    }
    // Arrow slits.
    g.fillStyle = FLOOR_C;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      g.save();
      g.translate(cx + Math.cos(a) * (r + 0.3), cy + Math.sin(a) * (r + 0.3));
      g.rotate(a);
      if (!L.outdoor) g.fillRect(-0.4, -0.07, 0.8, 0.14);
      g.restore();
    }
  }
  for (const dr of L.doors) door(g, L, dr);
  for (const e of L.entrances) {
    if (!L.round) entry(g, L, e);
    else {
      const a = Math.atan2(e.y - L.round.cy, e.x - L.round.cx), d = L.round.r + 1.5;
      entry(g, L, { x: L.round.cx + Math.cos(a) * d - 0.5, y: L.round.cy + Math.sin(a) * d - 0.5, dir: a + Math.PI });
    }
  }
  for (const l of L.links) link(g, l, lw);

  if (o.labels) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 0.95px ${SERIF}`;
    for (const r of L.rooms) {
      if (!r.n) continue;
      const t = String(r.n);
      const [lx, ly] = numberSpot(L, r);
      g.lineWidth = 0.32;
      g.strokeStyle = L.outdoor ? 'rgba(251,247,236,0.9)' : FLOOR_C;
      g.strokeText(t, lx, ly);
      g.fillStyle = INK;
      g.fillText(t, lx, ly);
    }
    g.font = `italic 0.6px ${SERIF}`;
    // One caption per stair, a line for each way it goes.
    const spots = new Map<string, string[]>();
    for (const l of L.links) {
      if (l.to < 0) continue;
      const k = `${l.x},${l.y}`;
      const lines = spots.get(k) ?? [];
      lines.push(`${l.dir === 'up' ? 'Up' : 'Down'}: ${d.levels[l.to]?.name ?? ''}`);
      spots.set(k, lines.sort((a, b) => (a < b ? 1 : -1)));
    }
    for (const [k, lines] of spots) {
      const [x, y] = k.split(',').map(Number);
      lines.forEach((t, q) => {
        g.lineWidth = 0.25;
        g.strokeStyle = 'rgba(251,247,236,0.95)';
        g.strokeText(t, x + 0.5, y + 1.55 + q * 0.7);
        g.fillStyle = INK;
        g.fillText(t, x + 0.5, y + 1.55 + q * 0.7);
      });
    }
  }
  g.restore();
}

/** Where a room's number goes: its middle, unless a stair or ladder stands there, then the clearest corner. */
function numberSpot(L: DLevel, r: DLevel['rooms'][number]): [number, number] {
  const marks = L.links.map((l) => [l.x + 0.5, l.y + 0.5]);
  const things = L.props.filter((p) => p.x >= r.x - 1 && p.x <= r.x + r.w + 1 && p.y >= r.y - 1 && p.y <= r.y + r.h + 1);
  // Clearance: from stairs (wanting 2.2 cells) and furniture (wanting 1), as one score.
  const clear = (x: number, y: number) => Math.min(
    99, ...marks.map(([a, b]) => Math.hypot(a - x, b - y)),
    ...things.map((p) => 2.2 * (Math.hypot(p.x - x, p.y - y) - Math.max(p.w ?? 0.6, p.h ?? 0.6) / 2)),
  );
  const cands: [number, number][] = [[r.lx, r.ly]];
  if (r.w >= 3 && r.h >= 3) {
    cands.push([r.x + 1, r.y + 1], [r.x + r.w - 1, r.y + 1], [r.x + 1, r.y + r.h - 1], [r.x + r.w - 1, r.y + r.h - 1]);
    cands.push([r.lx, r.y + 1], [r.lx, r.y + r.h - 1], [r.x + 1, r.ly], [r.x + r.w - 1, r.ly]);
  }
  if (L.round) {
    // Keep inside the round wall.
    const { cx, cy, r: R } = L.round;
    for (let k = cands.length - 1; k > 0; k--) if (Math.hypot(cands[k][0] - cx, cands[k][1] - cy) > R - 1) cands.splice(k, 1);
  }
  const ok = cands.filter(([x, y]) => at(L, Math.floor(x), Math.floor(y)) !== VOID || L.round || L.outdoor);
  const first = ok.find(([x, y]) => clear(x, y) >= 2.2);
  if (first) return first;
  return (ok.length ? ok : cands).reduce((a, b) => (clear(b[0], b[1]) > clear(a[0], a[1]) ? b : a));
}

function cells(g: Ctx2D, L: DLevel, test: (v: number) => boolean, dx = 0, dy = 0): void {
  g.beginPath();
  for (let y = 0; y < L.H; y++) {
    let x0 = -1;
    for (let x = 0; x <= L.W; x++) {
      const ok = x < L.W && test(at(L, x, y));
      if (ok && x0 < 0) x0 = x;
      if (!ok && x0 >= 0) {
        g.rect(x0 + dx, y + dy, x - x0 + 0.02, 1.02);
        x0 = -1;
      }
    }
  }
  g.fill();
}

function poly(g: Ctx2D, line: number[][]): void {
  g.beginPath();
  line.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
}

/** Short parallel strokes in the rock within two cells of open floor. */
function hatch(g: Ctx2D, L: DLevel, rnd: () => number, lw: (n: number) => number): void {
  g.fillStyle = ROCK_C;
  const near = (x: number, y: number) => {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (isOpen(at(L, x + i, y + j))) return true;
    return false;
  };
  g.beginPath();
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) if (!isOpen(at(L, x, y)) && near(x, y)) g.rect(x - 0.02, y - 0.02, 1.04, 1.04);
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = lw(0.9);
  g.beginPath();
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
    if (isOpen(at(L, x, y)) || !near(x, y)) continue;
    for (let q = 0; q < 2; q++) {
      const cx = x + 0.25 + rnd() * 0.5, cy = y + 0.25 + rnd() * 0.5;
      const a = rnd() * Math.PI, ca = Math.cos(a), sa = Math.sin(a), len = 0.22 + rnd() * 0.18;
      for (let s = -1; s <= 1; s++) {
        const sx = cx - sa * 0.11 * s, sy = cy + ca * 0.11 * s;
        g.moveTo(sx - ca * len, sy - sa * len);
        g.lineTo(sx + ca * len, sy + sa * len);
      }
    }
  }
  g.stroke();
}

function door(g: Ctx2D, L: DLevel, d: DDoor): void {
  g.save();
  // Centre of the edge, rotated so the wall runs along x.
  if (d.vertical) {
    g.translate(d.x, d.y + 0.5);
    g.rotate(Math.PI / 2);
  } else g.translate(d.x + 0.5, d.y);
  g.lineWidth = 0.08;
  g.strokeStyle = INK;
  // Clear the wall gap.
  g.fillStyle = FLOOR_C;
  g.fillRect(-0.5, -0.2, 1, 0.4);
  switch (d.kind) {
    case 'arch':
      g.fillStyle = INK;
      g.fillRect(-0.62, -0.2, 0.2, 0.4);
      g.fillRect(0.42, -0.2, 0.2, 0.4);
      break;
    case 'door':
    case 'locked':
      g.fillStyle = '#fff';
      g.fillRect(-0.42, -0.14, 0.84, 0.28);
      g.strokeRect(-0.42, -0.14, 0.84, 0.28);
      if (d.kind === 'locked') {
        g.fillStyle = INK;
        g.beginPath();
        g.arc(0, 0, 0.09, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'secret':
      // The wall stays drawn; an S marks the hidden door.
      g.strokeStyle = INK;
      g.lineWidth = 0.3;
      g.beginPath();
      g.moveTo(-0.5, 0);
      g.lineTo(0.5, 0);
      g.stroke();
      g.font = `bold 0.55px ${SERIF}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = FLOOR_C;
      g.fillText('S', 0, 0.02);
      break;
    case 'portcullis':
    case 'bars':
      g.fillStyle = INK;
      for (let k = -0.36; k <= 0.37; k += d.kind === 'bars' ? 0.18 : 0.24) {
        g.beginPath();
        g.arc(k, 0, 0.06, 0, Math.PI * 2);
        g.fill();
      }
      if (d.kind === 'portcullis') {
        g.beginPath();
        g.moveTo(-0.45, 0);
        g.lineTo(0.45, 0);
        g.lineWidth = 0.05;
        g.stroke();
      }
      break;
  }
  g.restore();
  void L;
}

function entry(g: Ctx2D, L: DLevel, e: { x: number; y: number; dir: number }): void {
  if (L.links.some((l) => l.to < 0)) return;
  const x = Math.min(L.W - 0.6, Math.max(0.6, e.x + (Number.isInteger(e.x) ? 0.5 : 0)));
  const y = Math.min(L.H - 0.6, Math.max(0.6, e.y + (Number.isInteger(e.y) ? 0.5 : 0)));
  g.save();
  g.translate(x, y);
  g.rotate(e.dir);
  g.fillStyle = INK;
  g.beginPath();
  g.moveTo(0.55, 0);
  g.lineTo(-0.35, -0.42);
  g.lineTo(-0.15, 0);
  g.lineTo(-0.35, 0.42);
  g.closePath();
  g.fill();
  g.restore();
}

function link(g: Ctx2D, l: DLink, lw: (n: number) => number): void {
  const down = l.dir === 'down';
  g.save();
  g.translate(l.x + 0.5, l.y + 0.5);
  g.strokeStyle = INK;
  g.lineWidth = lw(1.2);
  if (l.style === 'spiral') {
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(0, 0, 0.85, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.moveTo(Math.cos(a) * 0.15, Math.sin(a) * 0.15);
      g.lineTo(Math.cos(a + 0.5) * 0.85, Math.sin(a + 0.5) * 0.85);
    }
    g.stroke();
    g.fillStyle = INK;
    g.beginPath();
    g.arc(0, 0, 0.15, 0, Math.PI * 2);
    g.fill();
    // A small arrow for the way this stair goes.
    g.font = `bold 0.5px ${SERIF}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(down ? '▼' : '▲', down ? 0.95 : -0.95, -0.85);
  } else if (l.style === 'stairs') {
    const gr = g.createLinearGradient(-0.5, 0, 0.5, 0);
    gr.addColorStop(0, '#fff');
    gr.addColorStop(1, down ? '#6a6055' : '#c9bfaa');
    g.fillStyle = gr;
    g.fillRect(-0.5, -0.5, 1, 1);
    g.beginPath();
    for (let k = 1; k < 5; k++) {
      g.moveTo(-0.5 + k * 0.2, -0.5);
      g.lineTo(-0.5 + k * 0.2, 0.5);
    }
    g.stroke();
    g.strokeRect(-0.5, -0.5, 1, 1);
  } else {
    // Ladder or shaft: an opening (dark going down), with rungs.
    if (l.style === 'shaft' || down) {
      g.fillStyle = down ? '#1f1a16' : '#e6dcc6';
      g.beginPath();
      g.arc(0, 0, l.style === 'shaft' ? 0.7 : 0.45, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.strokeStyle = down ? '#c9b48a' : INK;
    g.lineWidth = 0.07;
    g.beginPath();
    for (const s of [-0.18, 0.18]) {
      g.moveTo(s, -0.5);
      g.lineTo(s, 0.5);
    }
    for (let k = -0.35; k <= 0.36; k += 0.175) {
      g.moveTo(-0.18, k);
      g.lineTo(0.18, k);
    }
    g.stroke();
  }
  g.restore();
}

function prop(g: Ctx2D, p: DProp, rnd: () => number, lw: (n: number) => number): void {
  g.save();
  g.translate(p.x, p.y);
  if (p.a) g.rotate(p.a);
  g.strokeStyle = INK;
  g.lineWidth = lw(1.1);
  const box = (w: number, h: number, fill: string) => {
    g.fillStyle = fill;
    g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeRect(-w / 2, -h / 2, w, h);
  };
  const disc = (r: number, fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  };
  switch (p.kind) {
    case 'sarcophagus': {
      const w = p.w ?? 1.6, h = p.h ?? 0.8;
      box(w, h, '#e8e0cc');
      g.strokeRect(-w / 2 + 0.12, -h / 2 + 0.12, w - 0.24, h - 0.24);
      g.beginPath();
      g.moveTo(-w / 2 + 0.25, 0);
      g.lineTo(w / 2 - 0.25, 0);
      g.moveTo(w / 2 - 0.5, -0.15);
      g.lineTo(w / 2 - 0.5, 0.15);
      g.stroke();
      break;
    }
    case 'pillar': disc(0.32, '#d8cfbd'); break;
    case 'niche':
      g.fillStyle = '#5d554b';
      g.fillRect(-0.18, -0.35, 0.36, 0.7);
      break;
    case 'altar': box(p.w ?? 1.4, p.h ?? 0.7, '#d8cfbd'); break;
    case 'statue':
      disc(0.42, '#e8e0cc');
      g.fillStyle = INK;
      g.beginPath();
      g.arc(0, -0.05, 0.14, 0, Math.PI * 2);
      g.fill();
      break;
    case 'chest':
      box(0.7, 0.45, '#b98a54');
      g.beginPath();
      g.moveTo(-0.35, -0.05);
      g.lineTo(0.35, -0.05);
      g.stroke();
      break;
    case 'barrel':
      disc(0.3, '#c4a074');
      g.beginPath();
      g.arc(0, 0, 0.18, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'crate':
      box(0.62, 0.62, '#cfaa76');
      g.beginPath();
      g.moveTo(-0.31, -0.31);
      g.lineTo(0.31, 0.31);
      g.moveTo(0.31, -0.31);
      g.lineTo(-0.31, 0.31);
      g.stroke();
      break;
    case 'bones':
      g.strokeStyle = '#8a7f6f';
      g.lineWidth = 0.08;
      g.beginPath();
      for (let q = 0; q < 5; q++) {
        const a = rnd() * Math.PI, r = 0.15 + rnd() * 0.25, cx = (rnd() - 0.5) * 0.7, cy = (rnd() - 0.5) * 0.7;
        g.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r);
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.stroke();
      break;
    case 'skull':
      g.fillStyle = '#efe7d4';
      g.lineWidth = 0.04;
      g.beginPath();
      g.arc(0, 0, 0.13, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = INK;
      g.fillRect(-0.07, -0.02, 0.05, 0.05);
      g.fillRect(0.02, -0.02, 0.05, 0.05);
      break;
    case 'bed': box(p.w ?? 1, p.h ?? 2, '#e9d6b5'); g.strokeRect(-(p.w ?? 1) / 2 + 0.1, -(p.h ?? 2) / 2 + 0.1, (p.w ?? 1) - 0.2, 0.4); break;
    case 'table': box(p.w ?? 1.5, p.h ?? 0.9, '#d2b183'); break;
    case 'well':
      disc(0.55, '#c4bcab');
      g.fillStyle = '#2f4b55';
      g.beginPath();
      g.arc(0, 0, 0.32, 0, Math.PI * 2);
      g.fill();
      break;
    case 'grate':
      g.fillStyle = '#5d554b';
      g.fillRect(-0.45, -0.45, 0.9, 0.9);
      g.strokeStyle = '#d8cfbd';
      g.lineWidth = 0.06;
      g.beginPath();
      for (let k = -0.3; k <= 0.31; k += 0.15) {
        g.moveTo(k, -0.42);
        g.lineTo(k, 0.42);
      }
      g.stroke();
      break;
    case 'tree': {
      g.fillStyle = 'rgba(30,40,20,0.25)';
      g.beginPath();
      g.arc(0.2, 0.25, 1.1, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 0.15;
      disc(1.1, ['#6f8a4a', '#7d9752', '#64803f'][Math.floor(rnd() * 3)]);
      break;
    }
    case 'bush': g.lineWidth = 0.08; disc(0.45, '#86a05a'); break;
    case 'brazier':
      disc(0.3, '#8c8070');
      g.fillStyle = '#d4683a';
      g.beginPath();
      g.arc(0, 0, 0.16, 0, Math.PI * 2);
      g.fill();
      break;
    case 'throne':
      box(0.8, 0.7, '#b04a3f');
      g.fillStyle = '#d9b04a';
      g.fillRect(-0.4, -0.35, 0.8, 0.18);
      break;
    case 'bookcase': box(p.w ?? 1, p.h ?? 0.5, '#8b6a45'); break;
    case 'cart':
      box(1.1, 0.75, '#9b8a70');
      g.fillStyle = '#6d655a';
      g.fillRect(-0.4, -0.25, 0.8, 0.5);
      break;
    case 'support': {
      const w = p.w ?? 2;
      g.strokeStyle = '#7a5a35';
      g.lineWidth = 0.18;
      g.beginPath();
      g.moveTo(-w / 2, 0);
      g.lineTo(w / 2, 0);
      g.stroke();
      g.fillStyle = '#7a5a35';
      g.fillRect(-w / 2 - 0.1, -0.15, 0.25, 0.3);
      g.fillRect(w / 2 - 0.15, -0.15, 0.25, 0.3);
      break;
    }
    case 'ore':
      g.fillStyle = '#c9a73c';
      g.lineWidth = 0.04;
      for (let q = 0; q < 3; q++) {
        g.beginPath();
        g.arc((rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4, 0.08, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      break;
    case 'rubble':
      g.fillStyle = '#b8ae9c';
      g.lineWidth = 0.05;
      for (let q = 0; q < 3; q++) {
        g.beginPath();
        g.arc((rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.6, 0.1 + rnd() * 0.12, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      break;
    case 'urn': disc(0.25, '#b78f6b'); break;
  }
  g.restore();
}

// ---- Thumbnails and the printable page -------------------------------------------------------------

export function dungeonThumbnail(d: Dungeon, w: number, h: number): string {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, w, h);
  const L = d.levels.find((l) => l.entrances.length) ?? d.levels[0];
  const scale = Math.min(w / L.W, h / L.H);
  drawLevel(g, d, L, { scale, ox: (w - L.W * scale) / 2, oy: (h - L.H * scale) / 2, grid: false, labels: false });
  return canvas.toDataURL('image/png');
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

/**
 * The printable page for one level: title and hook above, the map, and the key for that level's
 * rooms beside it (or below, for tall maps).
 */
export function dungeonPage(d: Dungeon, level: number, opts: { grid: boolean; labels: boolean }): HTMLCanvasElement {
  const L = d.levels[level];
  const cell = 26, pad = 36;
  const mapW = L.W * cell, mapH = L.H * cell;
  const keyW = 420;
  const meas = document.createElement('canvas').getContext('2d')!;
  // Measure the key.
  const rooms = L.rooms.filter((r) => r.n);
  const lines: { text: string; font: string; gap: number }[] = [];
  for (const r of rooms) {
    meas.font = `bold 16px ${SERIF}`;
    lines.push({ text: `${r.n}. ${r.name}`, font: `bold 16px ${SERIF}`, gap: 6 });
    meas.font = `15px ${SERIF}`;
    for (const t of wrap(meas, r.text, keyW)) lines.push({ text: t, font: `15px ${SERIF}`, gap: 0 });
  }
  const keyH = lines.reduce((a, l) => a + 19 + l.gap, 0);
  meas.font = `italic 16px ${SERIF}`;
  const hook = wrap(meas, d.hook, mapW + keyW + pad - 20);
  const headH = 44 + 22 + hook.length * 20 + 14;
  const W = pad * 3 + mapW + keyW, H = pad * 2 + headH + Math.max(mapH, keyH);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  g.fillStyle = INK;
  g.textBaseline = 'top';
  g.font = `italic 36px ${SERIF}`;
  g.fillText(d.title, pad, pad);
  g.font = `16px ${SERIF}`;
  g.fillText(`${KIND_NAME[d.site.kind]} · ${L.name}${d.levels.length > 1 ? ` (level ${level + 1} of ${d.levels.length})` : ''} · 1 square = 5 ft`, pad, pad + 44);
  g.font = `italic 16px ${SERIF}`;
  hook.forEach((t, k) => g.fillText(t, pad, pad + 70 + k * 20));
  const top = pad + headH;
  drawLevel(g, d, L, { scale: cell, ox: pad, oy: top, grid: opts.grid, labels: opts.labels });
  g.strokeStyle = INK;
  g.lineWidth = 1.5;
  g.strokeRect(pad, top, mapW, mapH);
  let y = top;
  const x = pad * 2 + mapW;
  g.fillStyle = INK;
  for (const l of lines) {
    y += l.gap;
    g.font = l.font;
    g.fillText(l.text, x, y);
    y += 19;
  }
  return c;
}

export { WATER_INK };
