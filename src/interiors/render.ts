import { type Dwelling, type Floor, type Item, type Opening, type Pt, type WallSide, outline, polyAnchor, roofHeight } from './dwelling';

/** Any 2D canvas context (DOM, OffscreenCanvas, or a Node canvas in scripts). */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const PAPER = '#f3ead3';
const INK = '#2b2420';
const INK_SOFT = 'rgba(43,36,32,0.55)';
const FLOOR: Record<Floor['surface'], string> = { flags: '#ece2c8', boards: '#e8d4ae', earth: '#e2d4b4' };
const FURN = '#f7efda';
const WOOD = '#d8bf93';

export interface PlanView {
  /** Pixels per metre. */
  scale: number;
  /** Pixel position of grid corner (0, 0). */
  ox: number;
  oy: number;
  labels?: boolean;
  grid?: boolean;
  /** Draw the plan semi-transparent over the map (no paper margin). */
  overlay?: boolean;
}

/** Pixel size of a plan at `scale`, plus a margin on every side. */
export function planSize(d: Dwelling, scale: number, margin: number): { w: number; h: number } {
  return { w: d.nx * d.cw * scale + 2 * margin, h: d.ny * d.ch * scale + 2 * margin };
}

/** Deterministic jitter in [-1, 1] for hand-drawn wobble. */
function jit(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/**
 * Hand-drawn floor plan: floors with surface texture and a 5 ft grid, inked walls with door
 * leaves and glazed windows, stairs, furniture symbols and italic room labels.
 */
export function drawPlan(g: Ctx2D, d: Dwelling, floorIdx: number, v: PlanView): void {
  const f = d.floors[floorIdx];
  const { nx, ny, cw, ch } = d;
  const s = v.scale;
  const X = (u: number) => v.ox + u * cw * s, Y = (w: number) => v.oy + w * ch * s;
  const roomAt = (i: number, j: number) => (i >= 0 && j >= 0 && i < nx && j < ny ? f.room[j * nx + i] : -1);
  const inBuilding = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && d.mask[j * nx + i] === 1;
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // A true (convex) footprint clips everything inside it; its edges are the outer walls.
  const poly = d.poly?.map((p): [number, number] => [X(p[0]), Y(p[1])]);
  if (poly) {
    g.save();
    g.beginPath();
    poly.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath();
    g.clip();
  }

  // In an attic, the rest of the storey below shows as the underside of the roof.
  if (f.level >= d.storeys) {
    g.fillStyle = 'rgba(120,100,80,0.18)';
    for (let k = 0; k < nx * ny; k++) if (d.mask[k] && f.room[k] < 0) g.fillRect(X(k % nx), Y((k / nx) | 0), cw * s + 0.5, ch * s + 0.5);
  }

  // Floors.
  for (let k = 0; k < nx * ny; k++) {
    if (f.room[k] < 0) continue;
    const i = k % nx, j = (k / nx) | 0;
    g.fillStyle = FLOOR[f.surface];
    g.fillRect(X(i) - 0.3, Y(j) - 0.3, cw * s + 0.6, ch * s + 0.6);
  }
  drawSurface(g, d, f, X, Y, s);
  if (v.grid !== false) {
    g.strokeStyle = 'rgba(60,45,30,0.13)';
    g.lineWidth = Math.max(0.5, s * 0.02);
    g.beginPath();
    for (let k = 0; k < nx * ny; k++) {
      if (f.room[k] < 0) continue;
      const i = k % nx, j = (k / nx) | 0;
      g.rect(X(i), Y(j), cw * s, ch * s);
    }
    g.stroke();
  }

  // Furniture under the walls so wall ink stays crisp.
  for (const it of f.items) drawItem(g, it, X, Y, s, d);
  for (const st of f.stairs) drawStair(g, d, st, X, Y, s);

  // Walls, with gaps for doors and windows.
  const open = new Map<string, Opening>();
  for (const o of f.openings) open.set(`${o.i},${o.j},${o.side}`, o);
  const ext = Math.max(1.5, 0.42 * s), int = Math.max(1, 0.2 * s);
  const segs: { x0: number; y0: number; x1: number; y1: number; w: number; o?: Opening; roof?: boolean; nx: number; ny: number; into: number }[] = [];
  for (let j = -1; j < ny; j++) {
    for (let i = -1; i < nx; i++) {
      for (const side of ['e', 's'] as const) {
        const a = roomAt(i, j), b = side === 'e' ? roomAt(i + 1, j) : roomAt(i, j + 1);
        if (a === b) continue;
        const bi = side === 'e' ? i + 1 : i, bj = side === 'e' ? j : j + 1;
        // Outside the building (not just outside this floor) is an exterior wall.
        const exterior = !inBuilding(i, j) || !inBuilding(bi, bj);
        const roof = !exterior && (a < 0 || b < 0);
        const seg = side === 'e'
          ? { x0: X(i + 1), y0: Y(j), x1: X(i + 1), y1: Y(j + 1), nx: 1, ny: 0 }
          : { x0: X(i), y0: Y(j + 1), x1: X(i + 1), y1: Y(j + 1), nx: 0, ny: 1 };
        // Doors swing into the room on the (i, j) side when there is one.
        if (exterior && poly) continue;
        segs.push({ ...seg, w: exterior ? ext : roof ? int * 0.6 : int, o: open.get(`${i},${j},${side}`), roof, into: a >= 0 ? -1 : 1 });
      }
    }
  }
  // Wall bodies first, then openings cut into them.
  g.lineCap = 'square';
  for (const sg of segs) {
    g.lineWidth = sg.w;
    g.strokeStyle = sg.roof ? INK_SOFT : INK;
    const L = Math.hypot(sg.x1 - sg.x0, sg.y1 - sg.y0);
    const ux = (sg.x1 - sg.x0) / L, uy = (sg.y1 - sg.y0) / L;
    if (sg.o && (sg.o.kind === 'door' || sg.o.kind === 'entrance')) {
      const gap = Math.min(L * 0.7, 0.95 * s);
      const a = (L - gap) / 2;
      line(g, sg.x0, sg.y0, sg.x0 + ux * a, sg.y0 + uy * a);
      line(g, sg.x1 - ux * a, sg.y1 - uy * a, sg.x1, sg.y1);
    } else {
      line(g, sg.x0, sg.y0, sg.x1, sg.y1);
    }
  }
  g.lineCap = 'butt';
  for (const sg of segs) {
    if (!sg.o) continue;
    const L = Math.hypot(sg.x1 - sg.x0, sg.y1 - sg.y0);
    const ux = (sg.x1 - sg.x0) / L, uy = (sg.y1 - sg.y0) / L;
    const mx = (sg.x0 + sg.x1) / 2, my = (sg.y0 + sg.y1) / 2;
    if (sg.o.kind === 'window' || sg.o.kind === 'slit') {
      const hw = sg.o.kind === 'slit' ? 0.18 * s : Math.min(L * 0.36, 0.6 * s);
      g.lineWidth = sg.w * 0.62;
      g.strokeStyle = '#f7f1e2';
      line(g, mx - ux * hw, my - uy * hw, mx + ux * hw, my + uy * hw);
      g.lineWidth = Math.max(0.6, s * 0.035);
      g.strokeStyle = INK;
      line(g, mx - ux * hw, my - uy * hw, mx + ux * hw, my + uy * hw);
      continue;
    }
    // Door leaf hinged at one jamb, swung open into the room, with its swing arc.
    const gap = Math.min(L * 0.7, 0.95 * s);
    const hx = mx - (ux * gap) / 2, hy = my - (uy * gap) / 2;
    const lx = hx + sg.nx * sg.into * gap, ly = hy + sg.ny * sg.into * gap;
    g.lineWidth = Math.max(0.8, s * 0.07);
    g.strokeStyle = INK;
    line(g, hx, hy, lx, ly);
    const a0 = Math.atan2(uy, ux), a1 = Math.atan2(ly - hy, lx - hx);
    let delta = a1 - a0;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    g.lineWidth = Math.max(0.5, s * 0.02);
    g.strokeStyle = INK_SOFT;
    g.beginPath();
    g.arc(hx, hy, gap, a0, a0 + delta, delta < 0);
    g.stroke();
    if (sg.o.kind === 'entrance') {
      // A doorstep outside.
      const ox = -sg.nx * sg.into, oy = -sg.ny * sg.into;
      const half = gap * 0.6, depth = 0.35 * s, off = sg.w / 2;
      g.fillStyle = '#d6c7a3';
      g.strokeStyle = INK;
      g.lineWidth = Math.max(0.6, s * 0.03);
      g.beginPath();
      const p0x = mx - ux * half + ox * off, p0y = my - uy * half + oy * off;
      g.moveTo(p0x, p0y);
      g.lineTo(p0x + ux * 2 * half, p0y + uy * 2 * half);
      g.lineTo(p0x + ux * 2 * half + ox * depth, p0y + uy * 2 * half + oy * depth);
      g.lineTo(p0x + ox * depth, p0y + oy * depth);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }

  if (poly) {
    g.restore();
    drawPolyWalls(g, d, f, poly, ext, s);
  }
  if (v.labels !== false) drawLabels(g, d, f, X, Y, s);
  g.restore();
}

/** Outer walls along the true footprint, with the floor's outside doors and windows set into them. */
function drawPolyWalls(g: Ctx2D, d: Dwelling, f: Floor, poly: [number, number][], ext: number, s: number): void {
  const attic = f.level >= d.storeys;
  g.lineJoin = 'miter';
  g.lineCap = 'butt';
  g.strokeStyle = attic ? INK_SOFT : INK;
  g.lineWidth = attic ? ext * 0.5 : ext;
  g.beginPath();
  poly.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath();
  g.stroke();
  for (const o of f.openings) {
    // Outside openings are the ones on the footprint mask's boundary.
    const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < d.nx && j < d.ny && d.mask[j * d.nx + i] === 1;
    const a = inside(o.i, o.j), b = o.side === 'e' ? inside(o.i + 1, o.j) : inside(o.i, o.j + 1);
    if (a && b) continue;
    const an = polyAnchor(d, o);
    if (!an) continue;
    const pa = poly[an.k], pb = poly[(an.k + 1) % poly.length];
    const L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    const ux = (pb[0] - pa[0]) / L, uy = (pb[1] - pa[1]) / L;
    const mx = pa[0] + (pb[0] - pa[0]) * an.t, my = pa[1] + (pb[1] - pa[1]) * an.t;
    // Inward normal (the polygon is counter-clockwise in local metres, which the plan's v-down flip mirrors).
    let nx = -uy, ny = ux;
    const cx = poly.reduce((acc, p) => acc + p[0], 0) / poly.length, cy = poly.reduce((acc, p) => acc + p[1], 0) / poly.length;
    if ((cx - mx) * nx + (cy - my) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    if (o.kind === 'window' || o.kind === 'slit') {
      const hw = o.kind === 'slit' ? 0.18 * s : Math.min(L * 0.3, 0.6 * s);
      g.lineWidth = ext * 0.62;
      g.strokeStyle = '#f7f1e2';
      line(g, mx - ux * hw, my - uy * hw, mx + ux * hw, my + uy * hw);
      g.lineWidth = Math.max(0.6, s * 0.035);
      g.strokeStyle = INK;
      line(g, mx - ux * hw, my - uy * hw, mx + ux * hw, my + uy * hw);
      continue;
    }
    const gap = Math.min(L * 0.6, 0.95 * s);
    // Cut the doorway out of the wall.
    g.lineWidth = ext + 1;
    g.strokeStyle = FLOOR[f.surface];
    line(g, mx - (ux * gap) / 2, my - (uy * gap) / 2, mx + (ux * gap) / 2, my + (uy * gap) / 2);
    const hx = mx - (ux * gap) / 2, hy = my - (uy * gap) / 2;
    const lx = hx + nx * gap, ly = hy + ny * gap;
    g.lineWidth = Math.max(0.8, s * 0.07);
    g.strokeStyle = INK;
    line(g, hx, hy, lx, ly);
    const a0 = Math.atan2(uy, ux), a1 = Math.atan2(ly - hy, lx - hx);
    let delta = a1 - a0;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    g.lineWidth = Math.max(0.5, s * 0.02);
    g.strokeStyle = INK_SOFT;
    g.beginPath();
    g.arc(hx, hy, gap, a0, a0 + delta, delta < 0);
    g.stroke();
    if (o.kind === 'entrance') {
      const half = gap * 0.6, depth = 0.35 * s, off = ext / 2;
      g.fillStyle = '#d6c7a3';
      g.strokeStyle = INK;
      g.lineWidth = Math.max(0.6, s * 0.03);
      const p0x = mx - ux * half - nx * off, p0y = my - uy * half - ny * off;
      g.beginPath();
      g.moveTo(p0x, p0y);
      g.lineTo(p0x + ux * 2 * half, p0y + uy * 2 * half);
      g.lineTo(p0x + ux * 2 * half - nx * depth, p0y + uy * 2 * half - ny * depth);
      g.lineTo(p0x - nx * depth, p0y - ny * depth);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
}

function line(g: Ctx2D, x0: number, y0: number, x1: number, y1: number): void {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

/** Flagstone joints, floorboards or a stippled earth floor. */
function drawSurface(g: Ctx2D, d: Dwelling, f: Floor, X: (u: number) => number, Y: (v: number) => number, s: number): void {
  const { nx, ny, cw, ch } = d;
  g.strokeStyle = 'rgba(90,70,45,0.22)';
  g.lineWidth = Math.max(0.4, s * 0.015);
  g.beginPath();
  for (let k = 0; k < nx * ny; k++) {
    if (f.room[k] < 0) continue;
    const i = k % nx, j = (k / nx) | 0;
    const x0 = X(i), y0 = Y(j), w = cw * s, h = ch * s;
    if (f.surface === 'boards') {
      // Boards run along the room's long axis.
      const n = Math.max(2, Math.round(ch / 0.3));
      for (let q = 1; q < n; q++) {
        const y = y0 + (q * h) / n;
        g.moveTo(x0, y);
        g.lineTo(x0 + w, y);
      }
      const bx = x0 + w * (0.3 + 0.4 * ((jit(i, j) + 1) / 2));
      g.moveTo(bx, y0);
      g.lineTo(bx, y0 + h / 2);
    } else if (f.surface === 'flags') {
      g.moveTo(x0, y0 + h / 2 + jit(i, j) * h * 0.08);
      g.lineTo(x0 + w, y0 + h / 2 + jit(j, i) * h * 0.08);
      g.moveTo(x0 + w * (0.5 + jit(i + 3, j) * 0.15), y0);
      g.lineTo(x0 + w * (0.5 + jit(i, j + 3) * 0.15), y0 + h / 2);
      g.moveTo(x0 + w * (0.35 + jit(i + 7, j) * 0.15), y0 + h / 2);
      g.lineTo(x0 + w * (0.35 + jit(i, j + 7) * 0.15), y0 + h);
    } else {
      for (let q = 0; q < 5; q++) {
        const px = x0 + w * (0.5 + 0.45 * jit(i * 5 + q, j)), py = y0 + h * (0.5 + 0.45 * jit(i, j * 5 + q));
        g.moveTo(px, py);
        g.arc(px, py, Math.max(0.3, s * 0.02), 0, 2 * Math.PI);
      }
    }
  }
  g.stroke();
}

function drawStair(g: Ctx2D, d: Dwelling, st: Dwelling['floors'][number]['stairs'][number], X: (u: number) => number, Y: (v: number) => number, s: number): void {
  const x0 = X(st.i) + 0.12 * s, y0 = Y(st.j) + 0.12 * s;
  const w = st.w * d.cw * s - 0.24 * s, h = st.h * d.ch * s - 0.24 * s;
  g.fillStyle = '#efe5cd';
  g.strokeStyle = INK;
  g.lineWidth = Math.max(0.8, s * 0.04);
  if (st.kind === 'spiral') {
    const cx = x0 + w / 2, cy = y0 + h / 2, r = Math.min(w, h) / 2;
    g.beginPath();
    g.arc(cx, cy, r, 0, 2 * Math.PI);
    g.fill();
    g.stroke();
    g.beginPath();
    for (let q = 0; q < 12; q++) {
      const a = (q / 12) * 2 * Math.PI;
      g.moveTo(cx + Math.cos(a) * r * 0.18, cy + Math.sin(a) * r * 0.18);
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, r * 0.18, 0, 2 * Math.PI);
    g.fillStyle = INK;
    g.fill();
    return;
  }
  g.fillRect(x0, y0, w, h);
  g.strokeRect(x0, y0, w, h);
  const along = st.dir[0] !== 0;
  g.beginPath();
  if (st.kind === 'ladder') {
    const r0 = along ? y0 + h * 0.25 : x0 + w * 0.25, r1 = along ? y0 + h * 0.75 : x0 + w * 0.75;
    if (along) {
      g.moveTo(x0, r0); g.lineTo(x0 + w, r0); g.moveTo(x0, r1); g.lineTo(x0 + w, r1);
      for (let q = 1; q < 5; q++) { g.moveTo(x0 + (q * w) / 5, r0); g.lineTo(x0 + (q * w) / 5, r1); }
    } else {
      g.moveTo(r0, y0); g.lineTo(r0, y0 + h); g.moveTo(r1, y0); g.lineTo(r1, y0 + h);
      for (let q = 1; q < 5; q++) { g.moveTo(r0, y0 + (q * h) / 5); g.lineTo(r1, y0 + (q * h) / 5); }
    }
    g.stroke();
    return;
  }
  const L = along ? w : h;
  const n = Math.max(4, Math.round(L / (0.28 * s)));
  for (let q = 1; q < n; q++) {
    if (along) { g.moveTo(x0 + (q * w) / n, y0); g.lineTo(x0 + (q * w) / n, y0 + h); }
    else { g.moveTo(x0, y0 + (q * h) / n); g.lineTo(x0 + w, y0 + (q * h) / n); }
  }
  g.stroke();
  // Arrow pointing up the flight; "dn" where it only goes down.
  g.lineWidth = Math.max(0.6, s * 0.03);
  const cx = x0 + w / 2, cy = y0 + h / 2;
  const ax = st.dir[0], ay = st.dir[1];
  const len = (along ? w : h) * 0.38;
  const sgn = st.up ? 1 : -1;
  g.beginPath();
  g.moveTo(cx - ax * len * sgn, cy - ay * len * sgn);
  g.lineTo(cx + ax * len * sgn, cy + ay * len * sgn);
  const hx = cx + ax * len * sgn, hy = cy + ay * len * sgn, hs = Math.min(w, h) * 0.22;
  g.moveTo(hx - ax * hs * sgn - ay * hs, hy - ay * hs * sgn + ax * hs);
  g.lineTo(hx, hy);
  g.lineTo(hx - ax * hs * sgn + ay * hs, hy - ay * hs * sgn - ax * hs);
  g.stroke();
}

/** Furniture symbols, outlined in ink. */
function drawItem(g: Ctx2D, it: Item, X: (u: number) => number, Y: (v: number) => number, s: number, d: Dwelling): void {
  const x0 = X(it.x0), y0 = Y(it.y0), x1 = X(it.x1), y1 = Y(it.y1);
  const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const lw = Math.max(0.6, s * 0.035);
  g.lineWidth = lw;
  g.strokeStyle = INK;
  g.fillStyle = FURN;
  const box = (fill = FURN) => {
    g.fillStyle = fill;
    g.fillRect(x0, y0, w, h);
    g.strokeRect(x0, y0, w, h);
  };
  // The wall the item backs onto, as a unit vector from its centre.
  const back: [number, number] = it.wall === 'n' ? [0, -1] : it.wall === 's' ? [0, 1] : it.wall === 'w' ? [-1, 0] : it.wall === 'e' ? [1, 0] : [0, -1];
  const horizWall = back[1] !== 0;
  g.beginPath();
  switch (it.type) {
    case 'rug': {
      g.fillStyle = 'rgba(176,112,86,0.32)';
      g.fillRect(x0, y0, w, h);
      g.strokeStyle = 'rgba(120,70,50,0.6)';
      g.strokeRect(x0 + lw * 2, y0 + lw * 2, w - lw * 4, h - lw * 4);
      break;
    }
    case 'bed':
    case 'bed2': {
      box('#f4ecd8');
      // Pillow(s) at the wall end, and the turned-down blanket.
      const pw = horizWall ? h * 0.18 : w * 0.18;
      const n = it.type === 'bed2' ? 2 : 1;
      for (let q = 0; q < n; q++) {
        if (horizWall) {
          const py = back[1] < 0 ? y0 + lw * 2 : y1 - lw * 2 - pw;
          const qw = (w - lw * 4) / n;
          g.strokeRect(x0 + lw * 2 + q * qw + lw, py, qw - lw * 2, pw);
        } else {
          const px = back[0] < 0 ? x0 + lw * 2 : x1 - lw * 2 - pw;
          const qh = (h - lw * 4) / n;
          g.strokeRect(px, y0 + lw * 2 + q * qh + lw, pw, qh - lw * 2);
        }
      }
      g.fillStyle = 'rgba(130,150,170,0.35)';
      if (horizWall) {
        const by = back[1] < 0 ? y0 + h * 0.35 : y0;
        g.fillRect(x0, by, w, h * 0.65);
        g.strokeRect(x0, by, w, h * 0.65);
      } else {
        const bx = back[0] < 0 ? x0 + w * 0.35 : x0;
        g.fillRect(bx, y0, w * 0.65, h);
        g.strokeRect(bx, y0, w * 0.65, h);
      }
      break;
    }
    case 'table':
    case 'desk':
    case 'counter':
    case 'sideboard':
    case 'workbench':
    case 'sawbench':
    case 'bench':
    case 'pew':
      box(WOOD);
      if (it.type === 'workbench' || it.type === 'sawbench') {
        g.beginPath();
        for (let q = 1; q < 4; q++) {
          const t = q / 4;
          if (horizWall) { g.moveTo(x0 + w * t, cy - h * 0.15); g.lineTo(x0 + w * t + w * 0.05, cy + h * 0.15); }
          else { g.moveTo(cx - w * 0.15, y0 + h * t); g.lineTo(cx + w * 0.15, y0 + h * t + h * 0.05); }
        }
        g.stroke();
      }
      break;
    case 'chair':
      box(WOOD);
      break;
    case 'chest':
      box(WOOD);
      g.beginPath();
      if (horizWall) { g.moveTo(x0, cy); g.lineTo(x1, cy); } else { g.moveTo(cx, y0); g.lineTo(cx, y1); }
      g.stroke();
      break;
    case 'wardrobe':
      box(WOOD);
      g.beginPath();
      if (horizWall) { g.moveTo(cx, y0); g.lineTo(cx, y1); } else { g.moveTo(x0, cy); g.lineTo(x1, cy); }
      g.stroke();
      break;
    case 'shelf':
    case 'bookcase':
    case 'rack': {
      box(WOOD);
      g.beginPath();
      const n = Math.max(3, Math.round((horizWall ? w : h) / (0.2 * s)));
      for (let q = 1; q < n; q++) {
        if (horizWall) { g.moveTo(x0 + (q * w) / n, y0); g.lineTo(x0 + (q * w) / n, y1); }
        else { g.moveTo(x0, y0 + (q * h) / n); g.lineTo(x1, y0 + (q * h) / n); }
      }
      g.stroke();
      break;
    }
    case 'barrel':
    case 'bucket':
    case 'candle': {
      const r = Math.min(w, h) / 2;
      g.fillStyle = it.type === 'candle' ? '#f3e4a6' : WOOD;
      g.arc(cx, cy, r, 0, 2 * Math.PI);
      g.fill();
      g.stroke();
      if (it.type === 'barrel') {
        g.beginPath();
        g.arc(cx, cy, r * 0.55, 0, 2 * Math.PI);
        g.stroke();
      }
      break;
    }
    case 'crate':
      box(WOOD);
      g.beginPath();
      g.moveTo(x0, y0); g.lineTo(x1, y1); g.moveTo(x1, y0); g.lineTo(x0, y1);
      g.stroke();
      break;
    case 'sack': {
      g.fillStyle = '#e4d3a8';
      g.ellipse(cx, cy, w / 2, h / 2, 0.3, 0, 2 * Math.PI);
      g.fill();
      g.stroke();
      break;
    }
    case 'logs': {
      const n = Math.max(3, Math.round((horizWall ? w : h) / (0.3 * s)));
      for (let q = 0; q < n; q++) {
        const t = (q + 0.5) / n;
        const r = Math.min(horizWall ? w / n : h / n, horizWall ? h : w) / 2;
        g.beginPath();
        g.fillStyle = WOOD;
        if (horizWall) g.arc(x0 + w * t, cy, r * 0.95, 0, 2 * Math.PI);
        else g.arc(cx, y0 + h * t, r * 0.95, 0, 2 * Math.PI);
        g.fill();
        g.stroke();
      }
      break;
    }
    case 'hearth':
    case 'oven':
    case 'forge':
    case 'furnace': {
      box('#bfb3a0');
      // The fire box opens away from the wall.
      const ix = x0 + w * 0.2, iy = y0 + h * 0.2, iw = w * 0.6, ih = h * 0.6;
      g.fillStyle = '#5a463a';
      g.fillRect(ix, iy, iw, ih);
      g.fillStyle = 'rgba(214,120,60,0.75)';
      g.beginPath();
      g.ellipse(ix + iw / 2 - back[0] * iw * 0.1, iy + ih / 2 - back[1] * ih * 0.1, iw * 0.25, ih * 0.25, 0, 0, 2 * Math.PI);
      g.fill();
      break;
    }
    case 'millstone': {
      // The runner stone, with its eye and dressing grooves.
      const r = Math.min(w, h) / 2;
      g.fillStyle = '#b2aa9c';
      g.arc(cx, cy, r, 0, 2 * Math.PI);
      g.fill();
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, r * 0.18, 0, 2 * Math.PI);
      for (let q = 0; q < 6; q++) {
        const a = (q / 6) * Math.PI * 2;
        g.moveTo(cx + Math.cos(a) * r * 0.25, cy + Math.sin(a) * r * 0.25);
        g.lineTo(cx + Math.cos(a + 0.4) * r * 0.9, cy + Math.sin(a + 0.4) * r * 0.9);
      }
      g.stroke();
      break;
    }
    case 'cauldron': {
      const r = Math.min(w, h) / 2;
      g.fillStyle = '#3a3532';
      g.arc(cx, cy, r * 0.85, 0, 2 * Math.PI);
      g.fill();
      g.stroke();
      g.beginPath();
      g.fillStyle = 'rgba(110,150,80,0.85)';
      g.arc(cx, cy, r * 0.6, 0, 2 * Math.PI);
      g.fill();
      break;
    }
    case 'anvil': {
      g.fillStyle = '#6c6560';
      g.fillRect(x0, y0, w, h);
      g.strokeRect(x0, y0, w, h);
      break;
    }
    case 'altar': {
      box('#efe3c4');
      g.fillStyle = 'rgba(150,60,50,0.55)';
      if (horizWall) g.fillRect(cx - w * 0.12, y0, w * 0.24, h);
      else g.fillRect(x0, cy - h * 0.12, w, h * 0.24);
      g.strokeRect(x0, y0, w, h);
      break;
    }
    case 'tomb': {
      box('#d9d1c2');
      g.beginPath();
      g.moveTo(cx, y0 + h * 0.2); g.lineTo(cx, y1 - h * 0.25);
      g.moveTo(cx - w * 0.22, y0 + h * 0.38); g.lineTo(cx + w * 0.22, y0 + h * 0.38);
      g.stroke();
      break;
    }
    case 'straw': {
      g.strokeStyle = 'rgba(160,130,60,0.9)';
      g.beginPath();
      for (let q = 0; q < 9; q++) {
        const px = x0 + w * (0.5 + 0.42 * jit(x0 + q, y0)), py = y0 + h * (0.5 + 0.42 * jit(y0, x0 + q));
        const a = jit(q, x0 * 0.1) * Math.PI;
        g.moveTo(px - Math.cos(a) * s * 0.18, py - Math.sin(a) * s * 0.18);
        g.lineTo(px + Math.cos(a) * s * 0.18, py + Math.sin(a) * s * 0.18);
      }
      g.stroke();
      break;
    }
    case 'bath': {
      g.fillStyle = '#c9d8dc';
      g.beginPath();
      g.ellipse(cx, cy, w / 2, h / 2, 0, 0, 2 * Math.PI);
      g.fill();
      g.stroke();
      g.beginPath();
      g.ellipse(cx, cy, w / 2 - lw * 2, h / 2 - lw * 2, 0, 0, 2 * Math.PI);
      g.stroke();
      break;
    }
    case 'privy':
      box(WOOD);
      g.beginPath();
      g.arc(cx, cy, Math.min(w, h) * 0.25, 0, 2 * Math.PI);
      g.stroke();
      break;
    default:
      box();
  }
  void d;
}

/** Italic room names at each room's most open cell, with a paper halo. */
function drawLabels(g: Ctx2D, d: Dwelling, f: Floor, X: (u: number) => number, Y: (v: number) => number, s: number): void {
  const { nx } = d;
  const size = Math.max(9, Math.min(15, s * 0.42));
  g.font = `italic ${size}px 'IM Fell English', Georgia, 'Times New Roman', serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  f.rooms.forEach((rm, r) => {
    if (!rm.cells.length) return;
    // Cell with the most same-room neighbours, nearest the room's centre.
    let mx = 0, my = 0;
    for (const k of rm.cells) {
      mx += (k % nx) + 0.5;
      my += ((k / nx) | 0) + 0.5;
    }
    mx /= rm.cells.length;
    my /= rm.cells.length;
    let best = rm.cells[0], bestS = -Infinity;
    for (const k of rm.cells) {
      const i = k % nx, j = (k / nx) | 0;
      let n = 0;
      for (const [di, dj] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (f.room[(j + dj) * nx + i + di] === r && i + di >= 0 && i + di < nx) n++;
      const sc = n - 0.3 * Math.hypot(i + 0.5 - mx, j + 0.5 - my);
      if (sc > bestS) {
        bestS = sc;
        best = k;
      }
    }
    const px = X((best % nx) + 0.5), py = Y(((best / nx) | 0) + 0.5);
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(243,234,211,0.9)';
    g.strokeText(rm.name, px, py);
    g.fillStyle = INK;
    g.fillText(rm.name, px, py);
  });
}

// ---------------------------------------------------------------------------------------------
// Exterior

export interface ExteriorView {
  width: number;
  height: number;
}

const ROOF_COLOURS: Record<string, [string, string]> = {
  thatch: ['#cdb07a', '#a88d5a'],
  tile: ['#b9735a', '#8f5442'],
  slate: ['#8b929a', '#666c74'],
  shingle: ['#9c7b5a', '#765b40'],
};

function roofMaterial(d: Dwelling): keyof typeof ROOF_COLOURS {
  switch (d.label) {
    case 'Cottage': case 'Farmhouse': case "Witch's hut": return 'thatch';
    case 'Cabin': case 'Miner\'s hut': case 'Mill': case 'Storehouse': return 'shingle';
    case 'Temple': case 'Mansion': case 'Monastic range': return 'slate';
    default: return 'tile';
  }
}

/**
 * Isometric view of the building from the street corner: walls (timber-framed or stone) with
 * the floor plans' windows and doors, then the roof as a height field drawn back to front,
 * with chimneys over the hearths. Fits the drawing to the given size.
 */
export function drawExterior(g: Ctx2D, d: Dwelling, view: ExteriorView): void {
  const { nx, ny, cw, ch, storeys, storeyH } = d;
  const H = storeys * storeyH;
  const C = Math.cos(Math.PI / 6), Sn = Math.sin(Math.PI / 6);
  const P = (u: number, v: number, z: number): [number, number] => {
    const um = u * cw, vm = v * ch;
    return [(um - vm) * C, (um + vm) * Sn - z];
  };
  let maxRoof = 0;
  for (let j = 0; j <= ny * 2; j++) for (let i = 0; i <= nx * 2; i++) maxRoof = Math.max(maxRoof, roofHeight(d, i / 2, j / 2));
  const pts: [number, number][] = [];
  for (const [u, v] of [[0, 0], [nx, 0], [0, ny], [nx, ny]]) pts.push(P(u, v, 0), P(u, v, H + maxRoof + 1.5));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const pad = 40;
  const sc = Math.min((view.width - 2 * pad) / (maxX - minX), (view.height - 2 * pad) / (maxY - minY));
  const ox = (view.width - (maxX - minX) * sc) / 2 - minX * sc, oy = (view.height - (maxY - minY) * sc) / 2 - minY * sc;
  const Q = (u: number, v: number, z: number): [number, number] => {
    const [x, y] = P(u, v, z);
    return [ox + x * sc, oy + y * sc];
  };
  const poly = (ps: [number, number][], fill: string, stroke = INK, lw = 1.2) => {
    g.beginPath();
    g.moveTo(ps[0][0], ps[0][1]);
    for (let k = 1; k < ps.length; k++) g.lineTo(ps[k][0], ps[k][1]);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = lw;
      g.stroke();
    }
  };
  g.save();
  g.lineJoin = 'round';

  // Outer wall edges [u0, v0, u1, v1] (cell units) with their outward normals (metres).
  const P0 = d.poly;
  let cu = 0, cv = 0;
  if (P0) for (const p of P0) { cu += p[0] / P0.length; cv += p[1] / P0.length; }
  const walls = (P0
    ? P0.map((a, k) => [a[0], a[1], P0[(k + 1) % P0.length][0], P0[(k + 1) % P0.length][1]])
    : outline(d)
  ).map((e, k) => {
    let nu = (e[3] - e[1]) * ch, nv = -(e[2] - e[0]) * cw;
    const l = Math.hypot(nu, nv) || 1;
    nu /= l;
    nv /= l;
    const mu = (e[0] + e[2]) / 2, mv = (e[1] + e[3]) / 2;
    if (P0) {
      if ((mu - cu) * cw * nu + (mv - cv) * ch * nv < 0) { nu = -nu; nv = -nv; }
    } else {
      // Grid outline: outward is where the neighbouring cell is outside.
      const ti = Math.floor(mu + nu * 0.5), tj = Math.floor(mv + nv * 0.5);
      if (inMask(d, ti, tj)) { nu = -nu; nv = -nv; }
    }
    return { e, nu, nv, k };
  });

  // Ground shadow, cast away from the light (to the upper right).
  g.fillStyle = 'rgba(80,60,40,0.1)';
  for (const { e } of walls) {
    const a = Q(e[0], e[1], 0), b = Q(e[2], e[3], 0);
    const a2 = Q(e[0] + 1.2, e[1] - 1.2, 0), b2 = Q(e[2] + 1.2, e[3] - 1.2, 0);
    g.beginPath();
    g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(b2[0], b2[1]); g.lineTo(a2[0], a2[1]);
    g.closePath();
    g.fill();
  }

  const stone = d.label === 'Keep' || d.label === 'Temple' || d.label === 'Warehouse' || d.label === 'Monastic range';
  const timber = d.label === 'Town house' || d.label === 'Mansion' || d.label === 'Farmhouse';
  const wallLit = stone ? '#d8d0bf' : '#efe4c8', wallShade = stone ? '#b7ad9a' : '#cfc0a0';
  const beam = '#5d4733';

  // Openings per wall: on the grid, keyed by cell edge; on a true footprint, anchored to an edge.
  const onWall = new Map<string, { kind: string; level: number; t: number }[]>();
  const push = (key: string, o: { kind: string; level: number; t: number }) => {
    const list = onWall.get(key) ?? [];
    list.push(o);
    onWall.set(key, list);
  };
  for (const f of d.floors) {
    if (f.level < 0) continue;
    for (const o of f.openings) {
      if (o.kind === 'door') continue;
      if (P0) {
        const a = inMask(d, o.i, o.j), b = o.side === 'e' ? inMask(d, o.i + 1, o.j) : inMask(d, o.i, o.j + 1);
        if (a && b) continue;
        const an = polyAnchor(d, o);
        if (an) push(`p${an.k}`, { kind: o.kind, level: f.level, t: an.t });
      } else {
        push(`${o.i},${o.j},${o.side}`, { kind: o.kind, level: f.level, t: 0.5 });
      }
    }
  }

  // Visible faces (facing the viewer at +u, +v), back to front.
  const faces = walls.filter((w) => w.nu * 0.7 + w.nv * 0.7 > 0.01);
  faces.sort((a, b) => a.e[0] * cw + a.e[1] * ch + a.e[2] * cw + a.e[3] * ch - (b.e[0] * cw + b.e[1] * ch + b.e[2] * cw + b.e[3] * ch));
  for (const { e, nu, nv, k } of faces) {
    const light = 0.5 + 0.5 * Math.max(0, Math.min(1, nv - nu * 0.4));
    // The top follows the roof, so gable ends rise to the ridge.
    const top: [number, number][] = [];
    for (let q = 4; q >= 0; q--) {
      const t = q / 4, u = e[0] + (e[2] - e[0]) * t, v = e[1] + (e[3] - e[1]) * t;
      top.push(Q(u, v, H + (d.roof.type === 'gable' ? roofHeight(d, u, v) : 0)));
    }
    poly([Q(e[0], e[1], 0), Q(e[2], e[3], 0), ...top], mixHex(wallShade, wallLit, light), INK, 1);
    const lenM = Math.hypot((e[2] - e[0]) * cw, (e[3] - e[1]) * ch);
    g.strokeStyle = timber ? beam : 'rgba(60,50,40,0.35)';
    g.lineWidth = timber ? Math.max(1.2, sc * 0.12) : 0.8;
    for (let l = 1; l < storeys; l++) {
      const a = Q(e[0], e[1], l * storeyH), b = Q(e[2], e[3], l * storeyH);
      line(g, a[0], a[1], b[0], b[1]);
    }
    const at = (t: number, z: number) => Q(e[0] + (e[2] - e[0]) * t, e[1] + (e[3] - e[1]) * t, z);
    if (timber) {
      // Posts about every 1.5 m, braces across alternate panels.
      const n = Math.max(1, Math.round(lenM / 1.5));
      for (let l = 0; l < storeys; l++) {
        for (let q = 0; q <= n; q++) {
          const a = at(q / n, l * storeyH), b = at(q / n, (l + 1) * storeyH);
          g.lineWidth = Math.max(1.2, sc * 0.12);
          line(g, a[0], a[1], b[0], b[1]);
          if (q < n && ((q + l) & 1) === 0) {
            const c2 = at((q + 1) / n, (l + 1) * storeyH);
            g.lineWidth = Math.max(0.8, sc * 0.08);
            line(g, a[0], a[1], c2[0], c2[1]);
          }
        }
      }
    } else if (stone) {
      g.lineWidth = 0.6;
      g.strokeStyle = 'rgba(80,70,60,0.3)';
      for (let z = 0.6; z < H; z += 0.6) {
        const a = at(0, z), b = at(1, z);
        line(g, a[0], a[1], b[0], b[1]);
      }
    }
    // Grid walls: the canonical edge is the east/south side of the cell to the west/north.
    const key = P0 ? `p${k}` : e[0] === e[2] ? `${e[0] - 1},${Math.min(e[1], e[3])},e` : `${Math.min(e[0], e[2])},${e[1] - 1},s`;
    for (const o of onWall.get(key) ?? []) {
      const z0 = o.level * storeyH;
      const door = o.kind === 'entrance';
      const half = (door ? 0.55 : o.kind === 'slit' ? 0.12 : 0.42) / lenM;
      const z1 = door ? 0 : storeyH * 0.32, z2 = door ? Math.min(storeyH * 0.75, 2.2) : storeyH * 0.75;
      if (o.level >= storeys && d.roof.type !== 'gable') continue;
      poly([at(o.t - half, z0 + z1), at(o.t + half, z0 + z1), at(o.t + half, z0 + z2), at(o.t - half, z0 + z2)], door ? '#6b5038' : '#4e5a63', INK, 1);
      if (!door && o.kind !== 'slit') {
        const m0 = at(o.t, z0 + z1), m1 = at(o.t, z0 + z2);
        g.strokeStyle = '#d9cdb1';
        g.lineWidth = 0.8;
        line(g, m0[0], m0[1], m1[0], m1[1]);
      }
    }
  }

  // Roof.
  const topZ = H;
  // Cells (split 2×2) clipped to the true footprint, if any.
  const pieces: [number, number][][] = [];
  const sub = 2;
  for (let j = 0; j < ny * sub; j++) {
    for (let i = 0; i < nx * sub; i++) {
      const ci = Math.floor(i / sub), cj = Math.floor(j / sub);
      const u0 = i / sub, v0 = j / sub, u1 = (i + 1) / sub, v1 = (j + 1) / sub;
      let q: [number, number][] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      if (P0) {
        for (const w of walls) q = clipOut(q, w.e, w.nu * cw, w.nv * ch);
        if (q.length < 3) continue;
      } else if (!d.mask[cj * nx + ci]) continue;
      pieces.push(q);
    }
  }
  if (d.roof.type === 'flat') {
    for (const q of pieces) poly(q.map(([u, v]) => Q(u, v, topZ)), '#c4baa6', 'rgba(60,50,40,0.25)', 0.6);
    const merlons = walls.slice().sort((a, b) => a.e[0] + a.e[1] - (b.e[0] + b.e[1]));
    for (const { e } of merlons) {
      const lenM = Math.hypot((e[2] - e[0]) * cw, (e[3] - e[1]) * ch);
      const n = Math.max(1, Math.round(lenM / 1.6));
      for (let q = 0; q < n; q++) {
        const t0 = (q + 0.2) / n, t1 = (q + 0.6) / n;
        const a0: [number, number] = [e[0] + (e[2] - e[0]) * t0, e[1] + (e[3] - e[1]) * t0];
        const a1: [number, number] = [e[0] + (e[2] - e[0]) * t1, e[1] + (e[3] - e[1]) * t1];
        poly([Q(a0[0], a0[1], topZ), Q(a1[0], a1[1], topZ), Q(a1[0], a1[1], topZ + 0.9), Q(a0[0], a0[1], topZ + 0.9)], wallLit, INK, 0.9);
      }
    }
  } else {
    const [lit, shade] = ROOF_COLOURS[roofMaterial(d)];
    const quads: { depth: number; draw: () => void }[] = [];
    // A hip roof on a convex footprint is planar facets, one per wall: the part of the roof
    // nearer that wall than any other (its straight skeleton). Drawn whole, so the hips and
    // ridge are crisp, with courses of tiles or thatch running parallel to the eaves.
    const facets = P0 && d.roof.type === 'hip';
    if (facets) {
      const pitch = d.roof.pitch;
      // Inward distance (m) from wall w's line.
      const dIn = (w: (typeof walls)[number], u: number, v: number) => -((u - w.e[0]) * cw * w.nu + (v - w.e[1]) * ch * w.nv);
      for (const w of walls) {
        let q: [number, number][] = P0!.map((p) => [p[0], p[1]]);
        for (const o of walls) {
          if (o === w || q.length < 3) continue;
          // Keep where this wall is the nearer: dIn(w) - dIn(o) <= 0.
          const f = (p: [number, number]) => dIn(w, p[0], p[1]) - dIn(o, p[0], p[1]);
          const next: [number, number][] = [];
          for (let k = 0; k < q.length; k++) {
            const a = q[k], b = q[(k + 1) % q.length], fa = f(a), fb = f(b);
            if (fa <= 1e-9) next.push(a);
            if ((fa <= 1e-9) !== (fb <= 1e-9)) {
              const t = fa / (fa - fb);
              next.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
            }
          }
          q = next;
        }
        if (q.length < 3) continue;
        const hs = q.map(([u, v]) => Math.max(0, dIn(w, u, v)) * pitch);
        const gu = -pitch * w.nu, gv = -pitch * w.nv;
        const l = Math.max(0, Math.min(1, 0.55 + 0.35 * gv - 0.3 * gu));
        const fill = mixHex(shade, lit, l);
        let su = 0, sv = 0;
        for (const [u, v] of q) { su += u / q.length; sv += v / q.length; }
        const maxH = Math.max(...hs);
        quads.push({
          depth: (su * cw + sv * ch) * 2,
          draw: () => {
            const pp = q.map(([u, v], k) => Q(u, v, topZ + hs[k]));
            poly(pp, fill, 'rgba(60,40,30,0.55)', 0.8);
            // Courses: lines of equal height across the facet, every half metre of rise.
            g.strokeStyle = 'rgba(60,40,30,0.22)';
            g.lineWidth = 0.6;
            for (let z = 0.5 * pitch; z < maxH - 0.05; z += 0.5 * pitch) {
              const cut: [number, number][] = [];
              for (let k = 0; k < q.length; k++) {
                const a = hs[k] - z, b = hs[(k + 1) % q.length] - z;
                if ((a < 0) !== (b < 0)) {
                  const t = a / (a - b), A = q[k], B = q[(k + 1) % q.length];
                  cut.push(Q(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, topZ + z));
                }
              }
              if (cut.length === 2) line(g, cut[0][0], cut[0][1], cut[1][0], cut[1][1]);
            }
          },
        });
      }
    }
    for (const q of facets ? [] : pieces) {
      const hs = q.map(([u, v]) => roofHeight(d, u, v));
      // Slope from the corner heights (least squares over the piece's vertices).
      let su = 0, sv = 0, sh = 0;
      for (let k = 0; k < q.length; k++) { su += q[k][0]; sv += q[k][1]; sh += hs[k]; }
      su /= q.length; sv /= q.length; sh /= q.length;
      let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
      for (let k = 0; k < q.length; k++) {
        const du = (q[k][0] - su) * cw, dv = (q[k][1] - sv) * ch, dh = hs[k] - sh;
        a11 += du * du; a12 += du * dv; a22 += dv * dv; b1 += du * dh; b2 += dv * dh;
      }
      const det = a11 * a22 - a12 * a12 || 1;
      const gu = (a22 * b1 - a12 * b2) / det, gv = (a11 * b2 - a12 * b1) / det;
      // Light from the front-left.
      const l = Math.max(0, Math.min(1, 0.55 + 0.35 * gv - 0.3 * gu));
      const fill = mixHex(shade, lit, l);
      quads.push({
        depth: (su * cw + sv * ch) * 2,
        draw: () => {
          const pp = q.map(([u, v], k) => Q(u, v, topZ + hs[k]));
          poly(pp, fill, fill, 0.6);
          // Courses of tiles or thatch run along the eaves.
          g.strokeStyle = 'rgba(60,40,30,0.28)';
          g.lineWidth = 0.7;
          line(g, pp[0][0], pp[0][1], pp[1][0], pp[1][1]);
        },
      });
    }
    for (const c of d.chimneys) {
      // The stack rises from the hearth's cell and pierces the roof slope above it.
      const u = c.i + 0.5, v = c.j + 0.5;
      const zt = topZ + roofHeight(d, u, v) + 1.3;
      const ru = 0.35 / cw, rv = 0.35 / ch;
      quads.push({
        depth: (u * cw + v * ch) * 2 + 0.6,
        draw: () => {
          poly([Q(u - ru, v + rv, topZ), Q(u + ru, v + rv, topZ), Q(u + ru, v + rv, zt), Q(u - ru, v + rv, zt)], '#a89a86', INK, 0.9);
          poly([Q(u + ru, v - rv, topZ), Q(u + ru, v + rv, topZ), Q(u + ru, v + rv, zt), Q(u + ru, v - rv, zt)], '#8c7f6c', INK, 0.9);
          poly([Q(u - ru, v - rv, zt), Q(u + ru, v - rv, zt), Q(u + ru, v + rv, zt), Q(u - ru, v + rv, zt)], '#4b4037', INK, 0.9);
        },
      });
    }
    quads.sort((a, b) => a.depth - b.depth);
    for (const q of quads) q.draw();
    // Ink the eaves along the walls facing the viewer (the others are hidden behind the roof).
    g.strokeStyle = INK;
    g.lineWidth = 1.3;
    for (const { e } of faces) {
      g.beginPath();
      for (let q = 0; q <= 4; q++) {
        const t = q / 4, u = e[0] + (e[2] - e[0]) * t, v = e[1] + (e[3] - e[1]) * t;
        const p = Q(u, v, topZ + roofHeight(d, u, v));
        if (q) g.lineTo(p[0], p[1]);
        else g.moveTo(p[0], p[1]);
      }
      g.stroke();
    }
  }
  g.restore();
}

/** Keeps the part of polygon q (cell units) inside wall edge e, whose outward normal (metres) is (nu, nv). */
function clipOut(q: [number, number][], e: number[], nu: number, nv: number): [number, number][] {
  const out: [number, number][] = [];
  const side = (p: [number, number]) => (p[0] - e[0]) * nu + (p[1] - e[1]) * nv; // <= 0 inside
  for (let k = 0; k < q.length; k++) {
    const a = q[k], b = q[(k + 1) % q.length];
    const da = side(a), db = side(b);
    if (da <= 0) out.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function inMask(d: Dwelling, i: number, j: number): boolean {
  return i >= 0 && j >= 0 && i < d.nx && j < d.ny && d.mask[j * d.nx + i] === 1;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((k) => parseInt(a.slice(k, k + 2), 16)), pb = [1, 3, 5].map((k) => parseInt(b.slice(k, k + 2), 16));
  return `rgb(${pa.map((v, k) => Math.round(v + (pb[k] - v) * t)).join(',')})`;
}

export type { WallSide };
