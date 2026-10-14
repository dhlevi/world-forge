import { type Arms, type Charge, type Division, type Shield, type Tincture, TINCTURE_HEX } from './arms';

const INK = '#2b2420';

/** Drawing of coats of arms (canvas): the shield, field, ordinary, charges and marks. */
// ---- Drawing ---------------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** The shield outline in a 100 × 120 box. */
function shieldPath(g: Ctx, s: Shield): void {
  g.beginPath();
  switch (s) {
    case 'round':
      g.arc(50, 60, 48, 0, Math.PI * 2);
      break;
    case 'kite':
      g.moveTo(8, 6);
      g.lineTo(92, 6);
      g.quadraticCurveTo(94, 60, 50, 118);
      g.quadraticCurveTo(6, 60, 8, 6);
      break;
    case 'french':
      g.moveTo(6, 6);
      g.lineTo(94, 6);
      g.lineTo(94, 88);
      g.quadraticCurveTo(94, 104, 62, 106);
      g.lineTo(50, 116);
      g.lineTo(38, 106);
      g.quadraticCurveTo(6, 104, 6, 88);
      g.closePath();
      break;
    case 'spanish':
      g.moveTo(6, 6);
      g.lineTo(94, 6);
      g.lineTo(94, 72);
      g.arc(50, 72, 44, 0, Math.PI);
      g.closePath();
      break;
    default:
      g.moveTo(6, 6);
      g.lineTo(94, 6);
      g.lineTo(94, 52);
      g.quadraticCurveTo(92, 96, 50, 116);
      g.quadraticCurveTo(8, 96, 6, 52);
      g.closePath();
  }
}

/** The second half of a divided field. */
function divisionPath(g: Ctx, d: Division): void {
  g.beginPath();
  switch (d) {
    case 'pale': g.rect(50, 0, 50, 120); break;
    case 'fess': g.rect(0, 58, 100, 62); break;
    case 'bend': g.moveTo(0, 0); g.lineTo(100, 120); g.lineTo(0, 120); g.closePath(); break;
    case 'quarterly': g.rect(50, 0, 50, 58); g.rect(0, 58, 50, 62); break;
    case 'saltire': g.moveTo(0, 0); g.lineTo(50, 60); g.lineTo(0, 120); g.closePath(); g.moveTo(100, 0); g.lineTo(50, 60); g.lineTo(100, 120); g.closePath(); break;
    case 'chevron': g.moveTo(0, 120); g.lineTo(50, 50); g.lineTo(100, 120); g.closePath(); break;
    case 'bendSinister': g.moveTo(100, 0); g.lineTo(0, 120); g.lineTo(100, 120); g.closePath(); break;
    case 'paly': for (let k = 1; k < 6; k += 2) g.rect((k * 100) / 6, 0, 100 / 6, 120); break;
    case 'barry': for (let k = 1; k < 8; k += 2) g.rect(0, (k * 120) / 8, 100, 120 / 8); break;
    case 'chequy':
      for (let j = 0; j < 7; j++) for (let i = 0; i < 6; i++) if ((i + j) % 2) g.rect((i * 100) / 6, (j * 120) / 7, 100 / 6, 120 / 7);
      break;
    case 'gyronny':
      // Eight wedges about the centre; every other one.
      for (let k = 0; k < 8; k += 2) {
        const a0 = (k * Math.PI) / 4, a1 = ((k + 1) * Math.PI) / 4;
        g.moveTo(50, 60);
        g.lineTo(50 + Math.cos(a0) * 120, 60 + Math.sin(a0) * 120);
        g.lineTo(50 + Math.cos(a1) * 120, 60 + Math.sin(a1) * 120);
        g.closePath();
      }
      break;
    default: break;
  }
}

/** Fur patterns over a filled area (already clipped): ermine spots on argent, or vair bells. */
function furPattern(g: Ctx, t: Tincture): void {
  if (t === 'ermine') {
    g.fillStyle = TINCTURE_HEX.sable;
    for (let j = 0; j < 6; j++) {
      for (let i = 0; i < 5; i++) {
        const x = 10 + i * 20 + (j % 2) * 10, y = 10 + j * 20;
        g.beginPath();
        // An ermine spot: three dots over a tail.
        g.arc(x, y - 3, 1.6, 0, Math.PI * 2);
        g.arc(x - 3, y, 1.6, 0, Math.PI * 2);
        g.arc(x + 3, y, 1.6, 0, Math.PI * 2);
        g.moveTo(x, y);
        g.lineTo(x + 3, y + 9);
        g.lineTo(x, y + 6);
        g.lineTo(x - 3, y + 9);
        g.closePath();
        g.fill();
      }
    }
  } else if (t === 'vair') {
    g.fillStyle = TINCTURE_HEX.azure;
    for (let j = 0; j < 6; j++) {
      for (let i = -1; i < 6; i++) {
        const x = i * 20 + (j % 2) * 10, y = j * 20;
        g.beginPath();
        // A vair bell: blue cups, alternate rows offset.
        g.moveTo(x + 2, y + 20);
        g.lineTo(x + 2, y + 10);
        g.lineTo(x + 6, y + 6);
        g.lineTo(x + 6, y);
        g.lineTo(x + 14, y);
        g.lineTo(x + 14, y + 6);
        g.lineTo(x + 18, y + 10);
        g.lineTo(x + 18, y + 20);
        g.closePath();
        g.fill();
      }
    }
  }
}

/** Adds a closed polygon, wound clockwise (filled) or, for a hole, anticlockwise (with the nonzero rule). */
function poly(g: Ctx, pts: [number, number][], hole = false): void {
  let area = 0;
  for (let k = 0; k < pts.length; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[(k + 1) % pts.length];
    area += x0 * y1 - x1 * y0;
  }
  const p = (area > 0) !== hole ? pts : [...pts].reverse();
  g.moveTo(p[0][0], p[0][1]);
  for (const [x, y] of p.slice(1)) g.lineTo(x, y);
  g.closePath();
}

/** A band of half-width `w` along a centreline (a bow limb, a spiral arm), filled. */
function band(g: Ctx, pts: [number, number][], w: (t: number) => number): void {
  const left: [number, number][] = [], right: [number, number][] = [];
  pts.forEach(([x, y], k) => {
    const [nx, ny] = pts[Math.min(pts.length - 1, k + 1)], [px, py] = pts[Math.max(0, k - 1)];
    const dx = nx - px, dy = ny - py, l = Math.hypot(dx, dy) || 1;
    const h = w(k / (pts.length - 1));
    left.push([x - (dy / l) * h, y + (dx / l) * h]);
    right.push([x + (dy / l) * h, y - (dx / l) * h]);
  });
  poly(g, [...left, ...right.reverse()]);
}

/** A closed outline drawn smoothly through the midpoints of `pts` (each point pulls the curve toward it). */
function smooth(g: Ctx, pts: [number, number][]): void {
  let area = 0;
  for (let k = 0; k < pts.length; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[(k + 1) % pts.length];
    area += x0 * y1 - x1 * y0;
  }
  const p = area > 0 ? pts : [...pts].reverse();
  const mid = (k: number): [number, number] => {
    const [ax, ay] = p[k % p.length], [bx, by] = p[(k + 1) % p.length];
    return [(ax + bx) / 2, (ay + by) / 2];
  };
  g.moveTo(...mid(0));
  for (let k = 1; k <= p.length; k++) g.quadraticCurveTo(p[k % p.length][0], p[k % p.length][1], ...mid(k));
  g.closePath();
}

/** A circle, filled or (as a hole) wound the other way. */
function disc(g: Ctx, x: number, y: number, r: number, hole = false): void {
  g.moveTo(x + r, y);
  g.arc(x, y, r, 0, Math.PI * 2, hole);
}

/** A finger or thumb: a bar with a rounded tip, from y0 up to y1. */
function finger(g: Ctx, x: number, y0: number, y1: number, w: number): void {
  const r = w / 2;
  g.moveTo(x, y0);
  g.lineTo(x, y1 + r);
  g.arc(x + r, y1 + r, r, Math.PI, 0);
  g.lineTo(x + w, y0);
  g.closePath();
}

function chargePath(g: Ctx, kind: Charge, x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.scale(s / 20, s / 20);
  g.beginPath();
  switch (kind) {
    case 'mullet':
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 4.2 : 10;
        if (k) g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      break;
    case 'crescent':
      // Outer circle (r 9) less an inner one (r 8, raised 3.5): horns up.
      g.arc(0, 1, 9, -0.483, Math.PI + 0.483, false);
      g.arc(0, -2.5, 8, Math.PI + 0.085, -0.085, true);
      g.closePath();
      break;
    case 'roundel':
      g.arc(0, 0, 8.5, 0, Math.PI * 2);
      break;
    case 'lozenge':
      g.moveTo(0, -10);
      g.lineTo(7, 0);
      g.lineTo(0, 10);
      g.lineTo(-7, 0);
      g.closePath();
      break;
    case 'tower':
      g.moveTo(-7, 10);
      g.lineTo(-7, -5);
      for (let k = 0; k < 4; k++) {
        const x0 = -7 + k * 4.66;
        g.lineTo(x0, -10);
        g.lineTo(x0 + 2.3, -10);
        g.lineTo(x0 + 2.3, -6.5);
        g.lineTo(x0 + 4.66, -6.5);
      }
      g.lineTo(7, -10);
      g.lineTo(7, 10);
      g.lineTo(2, 10);
      g.lineTo(2, 4);
      g.arc(0, 4, 2, 0, Math.PI, true);
      g.lineTo(-2, 10);
      g.closePath();
      break;
    case 'crown':
      g.moveTo(-10, 7);
      g.lineTo(-10, -6);
      g.lineTo(-5, 0);
      g.lineTo(0, -9);
      g.lineTo(5, 0);
      g.lineTo(10, -6);
      g.lineTo(10, 7);
      g.closePath();
      break;
    case 'fleur':
      g.moveTo(0, -11);
      g.quadraticCurveTo(5, -5, 1.6, 2);
      g.lineTo(-1.6, 2);
      g.quadraticCurveTo(-5, -5, 0, -11);
      g.moveTo(-1.5, 1);
      g.quadraticCurveTo(-10, -6, -9.5, 2);
      g.quadraticCurveTo(-8, 6, -3, 4);
      g.closePath();
      g.moveTo(1.5, 1);
      g.quadraticCurveTo(10, -6, 9.5, 2);
      g.quadraticCurveTo(8, 6, 3, 4);
      g.closePath();
      g.rect(-6, 3, 12, 2.2);
      g.moveTo(-1.6, 5);
      g.lineTo(1.6, 5);
      g.lineTo(0.8, 11);
      g.lineTo(-0.8, 11);
      g.closePath();
      break;
    case 'key':
      g.arc(0, -6, 4.2, 0, Math.PI * 2);
      g.moveTo(1.2, -2);
      g.rect(-1.2, -2.2, 2.4, 13);
      g.rect(1, 6, 4, 1.8);
      g.rect(1, 9, 3, 1.8);
      break;
    case 'tree':
      g.arc(0, -3, 7.5, 0, Math.PI * 2);
      g.rect(-1.5, 3, 3, 8);
      break;
    case 'sun':
      g.arc(0, 0, 5.5, 0, Math.PI * 2);
      for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI) / 6;
        g.moveTo(Math.cos(a - 0.12) * 6.2, Math.sin(a - 0.12) * 6.2);
        g.lineTo(Math.cos(a) * 10.5, Math.sin(a) * 10.5);
        g.lineTo(Math.cos(a + 0.12) * 6.2, Math.sin(a + 0.12) * 6.2);
        g.closePath();
      }
      break;
    case 'anchor':
      g.arc(0, -8.5, 2.4, 0, Math.PI * 2);
      g.arc(0, -8.5, 1.1, 0, Math.PI * 2, true);
      g.rect(-1.2, -6.2, 2.4, 15);
      g.rect(-5, -4.5, 10, 2);
      g.moveTo(-9, 2);
      g.quadraticCurveTo(-8, 10, 0, 10.5);
      g.quadraticCurveTo(8, 10, 9, 2);
      g.lineTo(10.5, 4.5);
      g.lineTo(9.5, 1);
      g.lineTo(6.5, 1.5);
      g.lineTo(7.4, 3.5);
      g.quadraticCurveTo(6, 8, 0, 8.3);
      g.quadraticCurveTo(-6, 8, -7.4, 3.5);
      g.lineTo(-6.5, 1.5);
      g.lineTo(-9.5, 1);
      g.lineTo(-10.5, 4.5);
      g.closePath();
      break;
    case 'ship':
      // A lymphad: a galley hull with a mast and a furled-out sail and pennon.
      g.moveTo(-11, 3);
      g.lineTo(11, 3);
      g.quadraticCurveTo(8, 10, 0, 10);
      g.quadraticCurveTo(-8, 10, -11, 3);
      g.closePath();
      g.rect(-0.8, -11, 1.6, 14);
      g.moveTo(-7, -8);
      g.quadraticCurveTo(0, -5, 7, -8);
      g.lineTo(7, 0.5);
      g.quadraticCurveTo(0, -1.5, -7, 0.5);
      g.closePath();
      g.moveTo(0.8, -11);
      g.lineTo(6, -9.8);
      g.lineTo(0.8, -8.6);
      g.closePath();
      break;
    case 'sword':
      g.moveTo(0, -11);
      g.lineTo(1.6, -8);
      g.lineTo(1.6, 4);
      g.lineTo(-1.6, 4);
      g.lineTo(-1.6, -8);
      g.closePath();
      g.rect(-6, 4, 12, 1.8);
      g.rect(-0.9, 5.8, 1.8, 3.8);
      g.moveTo(2, 10.6);
      g.arc(0, 10.6, 2, 0, Math.PI * 2);
      break;
    case 'hammer':
      g.rect(-7, -10, 14, 6);
      g.rect(-1.4, -4, 2.8, 15);
      break;
    case 'axe':
      g.rect(-1.2, -11, 2.4, 22);
      g.moveTo(1, -9);
      g.quadraticCurveTo(11, -8, 10, 1);
      g.quadraticCurveTo(6, -1, 1, -1);
      g.closePath();
      break;
    case 'eagle':
      // Displayed: wings spread and raised, head to the dexter.
      g.ellipse(0, 1, 3.2, 6, 0, 0, Math.PI * 2);
      g.moveTo(1.8, -5);
      g.arc(0, -6.5, 2.4, 0, Math.PI * 2);
      g.moveTo(-2, -6.8);
      g.lineTo(-4.6, -6);
      g.lineTo(-2, -5.4);
      for (const sx of [-1, 1]) {
        g.moveTo(2 * sx, -2);
        g.lineTo(11 * sx, -9);
        g.lineTo(10 * sx, -4);
        g.lineTo(11.5 * sx, -3.5);
        g.lineTo(9.6 * sx, 0);
        g.lineTo(10.8 * sx, 0.8);
        g.lineTo(8 * sx, 3.5);
        g.lineTo(2 * sx, 2);
        g.closePath();
        g.moveTo(1 * sx, 6);
        g.lineTo(4 * sx, 11);
        g.lineTo(1.5 * sx, 10);
        g.closePath();
      }
      g.moveTo(-2.5, 6);
      g.lineTo(0, 11);
      g.lineTo(2.5, 6);
      g.closePath();
      break;
    case 'wheel':
      g.arc(0, 0, 10, 0, Math.PI * 2);
      g.arc(0, 0, 7.6, 0, Math.PI * 2, true);
      g.moveTo(2.4, 0);
      g.arc(0, 0, 2.4, 0, Math.PI * 2);
      for (let k = 0; k < 4; k++) {
        g.save();
        g.rotate((k * Math.PI) / 4);
        g.rect(-0.8, -8, 1.6, 16);
        g.restore();
      }
      break;
    case 'bell':
      g.moveTo(-1.5, -9);
      g.arc(0, -9, 1.5, Math.PI, 0);
      g.lineTo(1.5, -8);
      g.quadraticCurveTo(6.5, -7.5, 6.5, 0);
      g.quadraticCurveTo(6.5, 5, 9, 7);
      g.lineTo(-9, 7);
      g.quadraticCurveTo(-6.5, 5, -6.5, 0);
      g.quadraticCurveTo(-6.5, -7.5, -1.5, -8);
      g.closePath();
      g.moveTo(2.2, 9);
      g.arc(0, 9, 2.2, 0, Math.PI * 2);
      break;
    case 'horn':
      // A hunting horn, mouth to the dexter, with its strap above.
      g.moveTo(-10, -2);
      g.quadraticCurveTo(-2, 9, 9, -1);
      g.lineTo(11, 3);
      g.lineTo(9.4, 4.4);
      g.quadraticCurveTo(-2, 12, -10, 1);
      g.closePath();
      g.moveTo(-6, 1.5);
      g.quadraticCurveTo(0, -11, 6, 1.5);
      g.lineTo(4.8, 2);
      g.quadraticCurveTo(0, -8.4, -4.8, 2.3);
      g.closePath();
      break;
    case 'estoile':
      // Six wavy rays.
      for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 3;
        const ca = Math.cos(a), sa = Math.sin(a), cp = Math.cos(a + Math.PI / 2), sp = Math.sin(a + Math.PI / 2);
        g.moveTo(cp * 1.8, sp * 1.8);
        g.quadraticCurveTo(ca * 5 + cp * 2.4, sa * 5 + sp * 2.4, ca * 11, sa * 11);
        g.quadraticCurveTo(ca * 5 - cp * 2.4, sa * 5 - sp * 2.4, -cp * 1.8, -sp * 1.8);
        g.closePath();
      }
      g.moveTo(2.6, 0);
      g.arc(0, 0, 2.6, 0, Math.PI * 2);
      break;
    case 'heart':
      g.moveTo(0, 9);
      g.bezierCurveTo(-12, 0, -8, -11, 0, -4);
      g.bezierCurveTo(8, -11, 12, 0, 0, 9);
      g.closePath();
      break;
    case 'blossom':
      // Five round petals about the centre.
      for (let k = 0; k < 5; k++) {
        const ang = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
        g.moveTo(Math.cos(ang) * 5.8 + 4.6, Math.sin(ang) * 5.8);
        g.arc(Math.cos(ang) * 5.8, Math.sin(ang) * 5.8, 4.6, 0, Math.PI * 2);
      }
      break;
    case 'acorn':
      g.ellipse(0, 3, 5, 6.5, 0, 0, Math.PI * 2);
      g.moveTo(-6.4, -1);
      g.quadraticCurveTo(-6, -7, 0, -7);
      g.quadraticCurveTo(6, -7, 6.4, -1);
      g.closePath();
      g.rect(-0.8, -10.5, 1.6, 4);
      break;
    case 'tomoe':
      // A comma: a round head with a tail sweeping round it.
      g.arc(-1, 2.5, 6.5, 0, Math.PI * 2);
      g.moveTo(5.5, 2.5);
      g.bezierCurveTo(6, -6, 1, -11, -8, -10);
      g.bezierCurveTo(-1, -7, 2, -4, -1, -4);
      g.closePath();
      break;
    case 'feather':
      // A long vane with a quill, tipped to the dexter.
      g.save();
      g.rotate(0.35);
      g.moveTo(0, -11);
      g.bezierCurveTo(5, -6, 5, 4, 0.8, 8);
      g.lineTo(-0.8, 8);
      g.bezierCurveTo(-5, 4, -5, -6, 0, -11);
      g.closePath();
      g.rect(-0.7, 7, 1.4, 4);
      g.restore();
      break;
    case 'bird':
      // A bird volant: wings spread, seen from above.
      g.ellipse(0, 1, 2.2, 5.5, 0, 0, Math.PI * 2);
      g.moveTo(1.8, -4.5);
      g.arc(0, -5.8, 2, 0, Math.PI * 2);
      for (const sx of [-1, 1]) {
        g.moveTo(1.5 * sx, -1);
        g.quadraticCurveTo(6 * sx, -7, 11 * sx, -4);
        g.lineTo(9 * sx, -2);
        g.lineTo(10.5 * sx, 0.5);
        g.lineTo(7.5 * sx, 1);
        g.quadraticCurveTo(4 * sx, 2, 1.5 * sx, 2.5);
        g.closePath();
      }
      g.moveTo(-2, 5.5);
      g.lineTo(0, 10);
      g.lineTo(2, 5.5);
      g.closePath();
      break;
    case 'serpent': {
      // A coiled serpent: an S of tapering body with a head at the top.
      const pts: [number, number][] = [];
      for (let k = 0; k <= 24; k++) {
        const t = k / 24;
        pts.push([Math.sin(t * Math.PI * 2.2) * 6, 9 - t * 18]);
      }
      const wAt = (t: number) => 0.8 + 2.2 * t;
      const left: [number, number][] = [], right: [number, number][] = [];
      pts.forEach(([x, y], k) => {
        const [nx, ny] = pts[Math.min(pts.length - 1, k + 1)], [px, py] = pts[Math.max(0, k - 1)];
        const dx = nx - px, dy = ny - py, l = Math.hypot(dx, dy) || 1;
        const w = wAt(k / 24);
        left.push([x - (dy / l) * w, y + (dx / l) * w]);
        right.push([x + (dy / l) * w, y - (dx / l) * w]);
      });
      g.moveTo(left[0][0], left[0][1]);
      for (const p of left) g.lineTo(p[0], p[1]);
      const [hx, hy] = pts[pts.length - 1];
      g.lineTo(hx - 3.5, hy - 1.5);
      g.quadraticCurveTo(hx, hy - 5, hx + 3.5, hy - 1.5);
      for (const p of right.reverse()) g.lineTo(p[0], p[1]);
      g.closePath();
      break;
    }
    case 'cloud':
      // A ruyi-like cloud: three lobes over a curl.
      g.arc(-5, 1, 4.6, 0, Math.PI * 2);
      g.moveTo(5, -3);
      g.arc(0, -3, 5, 0, Math.PI * 2);
      g.moveTo(10.6, 1);
      g.arc(6, 1, 4.6, 0, Math.PI * 2);
      g.rect(-7, 1, 14, 4.6);
      g.moveTo(-2, 7);
      g.quadraticCurveTo(0, 11, 4, 9);
      g.lineTo(3, 7.5);
      g.closePath();
      break;
    case 'lion':
      // Rampant, facing the dexter: maned head with open jaws, both forepaws raised, one hind leg
      // planted and the other striking forward, and the tail curled up behind with its tuft.
      poly(g, [
        [-4.2, -11.6], [-3, -10.2], [-1.4, -11], [-1.2, -9.2], [0.6, -9.4], [0, -7.6], [2, -7.4], [1, -5.8], [2.8, -5.2], [1.9, -4.1],
        [3, -3.2], [5, -0.8], [6.4, 1.2],
        [7.6, 0.4], [8.2, -2.6], [8, -5.6], [8.8, -7.8], [8.4, -10], [9.6, -9], [10.4, -11.2], [10.8, -8.8], [11.4, -8.4], [10, -6.8],
        [9.6, -5.4], [9.8, -2.4], [9, 0.8],
        [7.8, 3.2], [8.2, 6], [7.6, 8.2], [8.6, 10], [8.8, 11], [7.4, 10.6], [6.6, 11.2], [5.6, 10.6], [5.6, 9], [4.8, 7], [3.6, 6.2],
        [1.4, 7.6], [-1.4, 8.4], [-3.6, 9.6], [-5.2, 10.2], [-5, 9.2], [-5.8, 8.4], [-4, 7.8], [-1.8, 6.6], [0.2, 5.4], [0.4, 3.2], [-1.2, 1.2],
        [-3.4, 2], [-5.8, 1.6], [-7.6, 2.4], [-7.8, 1.4], [-8.6, 0.4], [-6.8, -0.2], [-4.6, -0.4], [-2.8, -1.2],
        [-3.6, -2.4], [-6, -2.8], [-8.4, -2.2], [-10, -1.4], [-10.2, -2.6], [-10.8, -3.6], [-9.4, -4.2], [-7, -4], [-5.6, -4.4],
        [-7.2, -4.8], [-9.2, -5.4], [-7.6, -6.2], [-9.8, -6.6], [-9.6, -7.6], [-7.6, -9.4], [-5.6, -10.6],
      ]);
      disc(g, -6.6, -8, 0.6, true);
      break;
    case 'castle': {
      // Three towers joined by curtain walls, the middle one tallest, with a gate.
      const merlons = (x0: number, x1: number, top: number, n: number) => {
        const w = (x1 - x0) / (2 * n - 1);
        for (let k = 0; k < 2 * n - 1; k++) {
          const yy = k % 2 ? top : top - 1.8;
          g.lineTo(x0 + k * w, yy);
          g.lineTo(x0 + (k + 1) * w, yy);
        }
      };
      g.moveTo(-10.5, 10);
      g.lineTo(-10.5, -4.5);
      merlons(-10.5, -5.5, -4.5, 3);
      g.lineTo(-5.5, 0);
      merlons(-5.5, -2.6, 0, 2);
      g.lineTo(-2.6, -8.6);
      merlons(-2.6, 2.6, -8.6, 3);
      g.lineTo(2.6, 0);
      merlons(2.6, 5.5, 0, 2);
      g.lineTo(5.5, -4.5);
      merlons(5.5, 10.5, -4.5, 3);
      g.lineTo(10.5, 10);
      g.lineTo(2.2, 10);
      g.lineTo(2.2, 6.4);
      g.arc(0, 6.4, 2.2, 0, Math.PI, true);
      g.lineTo(-2.2, 10);
      g.closePath();
      // Windows in the towers.
      for (const [wx, wy] of [[-8, -0.5], [8, -0.5], [0, -4.2]] as [number, number][]) poly(g, [[wx - 0.7, wy - 1.4], [wx + 0.7, wy - 1.4], [wx + 0.7, wy + 1.4], [wx - 0.7, wy + 1.4]], true);
      break;
    }
    case 'anvil':
      // The face with its horn to the dexter, a narrow waist and a spreading foot.
      g.moveTo(-11, -6.5);
      g.lineTo(9.5, -6.5);
      g.lineTo(9.5, -2.6);
      g.lineTo(5.6, -2.6);
      g.quadraticCurveTo(3.2, -2.4, 3.2, 0.4);
      g.lineTo(3.2, 3.6);
      g.quadraticCurveTo(3.6, 6.2, 7, 7.4);
      g.lineTo(7.4, 10);
      g.lineTo(-6.4, 10);
      g.lineTo(-6, 7.4);
      g.quadraticCurveTo(-2.6, 6.2, -2.2, 3.6);
      g.lineTo(-2.2, 0.4);
      g.quadraticCurveTo(-2.2, -2.4, -5, -2.8);
      g.quadraticCurveTo(-8.6, -3.4, -11, -6.5);
      g.closePath();
      break;
    case 'triskele':
      // Three spirals sweeping out from the centre.
      for (let k = 0; k < 3; k++) {
        const th = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
        const cx = Math.cos(th) * 5.6, cy = Math.sin(th) * 5.6;
        const pts: [number, number][] = [];
        for (let i = 0; i <= 30; i++) {
          const u = i / 30, rho = 5.6 * (1 - 0.72 * u), phi = th + Math.PI + u * 1.75 * Math.PI;
          pts.push([cx + Math.cos(phi) * rho, cy + Math.sin(phi) * rho]);
        }
        band(g, pts, (t) => 1.25 - 0.45 * t);
      }
      disc(g, 0, 0, 1.6);
      break;
    case 'hand': {
      // A dexter hand appaumé: palm, four fingers and the thumb spread, in one outline.
      const pts: [number, number][] = [[-3.6, 11], [-3.6, 6.4], [-4.6, 5.4], [-4.6, 3.4], [-9.6, -1.4], [-10, -2.6], [-9.3, -3.4], [-8.3, -3.2], [-4.6, -0.4]];
      const tips: [number, number][] = [[-4.6, -9], [-2.3, -11], [0, -10.4], [2.3, -8.2]];
      tips.forEach(([fx, top], k) => {
        const r = 1.05;
        if (k) pts.push([fx, -1.6]);
        for (let i = 0; i <= 6; i++) {
          const a = Math.PI + (i * Math.PI) / 6;
          pts.push([fx + r + Math.cos(a) * r, top + r + Math.sin(a) * r]);
        }
        pts.push([fx + 2.1, -1.6]);
      });
      pts.push([4.4, 5.4], [3.6, 6.4], [3.6, 11]);
      poly(g, pts);
      break;
    }
    case 'harp':
      // An Irish harp: a curved pillar, the neck above, the soundbox, and strings within.
      g.moveTo(-7.6, 10.4);
      g.quadraticCurveTo(-11, 0.5, -6.4, -9);
      g.quadraticCurveTo(0, -4.6, 7, -8.4);
      g.lineTo(8.4, -10.6);
      g.lineTo(10.4, -8.8);
      g.quadraticCurveTo(4.6, 1.4, -2.6, 10.6);
      g.closePath();
      poly(g, [[-5.2, 7.6], [7, -6.2], [-4.9, -5.4]], true);
      for (const sx of [-3.2, -1.4, 0.4, 2.2, 4]) {
        const top = -5.4 - ((sx + 4.9) * 0.8) / 11.9 - 0.2, bottom = 7.6 + ((sx + 5.2) * -13.8) / 12.2 + 0.2;
        g.rect(sx, top, 0.45, bottom - top);
      }
      break;
    case 'fan': {
      // A folding fan, open upward, with its ribs and pleats.
      const px = 0, py = 7.5, a0 = -Math.PI * 0.86, a1 = -Math.PI * 0.14;
      g.moveTo(px + Math.cos(a0) * 4.6, py + Math.sin(a0) * 4.6);
      g.lineTo(px + Math.cos(a0) * 11, py + Math.sin(a0) * 11);
      g.arc(px, py, 11, a0, a1, false);
      g.lineTo(px + Math.cos(a1) * 4.6, py + Math.sin(a1) * 4.6);
      g.arc(px, py, 4.6, a1, a0, true);
      g.closePath();
      for (let k = 0; k <= 6; k++) {
        const a = a0 + ((a1 - a0) * k) / 6, ca = Math.cos(a), sa = Math.sin(a), nx = -sa * 0.45, ny = ca * 0.45;
        poly(g, [[px + nx, py + ny], [px + ca * 4.8 + nx, py + sa * 4.8 + ny], [px + ca * 4.8 - nx, py + sa * 4.8 - ny], [px - nx, py - ny]]);
        if (k > 0 && k < 6) {
          const b = a0 + ((a1 - a0) * (k - 0.5)) / 6, cb = Math.cos(b), sb = Math.sin(b), mx = -sb * 0.2, my = cb * 0.2;
          poly(g, [[px + cb * 5.6 + mx, py + sb * 5.6 + my], [px + cb * 10.2 + mx, py + sb * 10.2 + my], [px + cb * 10.2 - mx, py + sb * 10.2 - my], [px + cb * 5.6 - mx, py + sb * 5.6 - my]], true);
        }
      }
      disc(g, px, py, 1.3);
      break;
    }
    case 'leaves':
      // Three hollyhock leaves in a ring, their points meeting at the centre.
      disc(g, 0, 0, 11);
      disc(g, 0, 0, 9.8, true);
      for (let k = 0; k < 3; k++) {
        const th = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
        g.save();
        g.translate(Math.cos(th) * 4.6, Math.sin(th) * 4.6);
        g.rotate(th + Math.PI / 2);
        g.scale(0.5, 0.5);
        g.moveTo(0, 9);
        g.bezierCurveTo(-12, 0, -8, -11, 0, -4);
        g.bezierCurveTo(8, -11, 12, 0, 0, 9);
        g.closePath();
        g.restore();
      }
      break;
    case 'wave':
      // Seigaiha: nested arcs of a wave, one over the next.
      for (const [r0, r1] of [[10.5, 8.7], [7, 5.2], [3.5, 1.7]]) {
        g.moveTo(-r0, 7);
        g.arc(0, 7, r0, Math.PI, 0, false);
        g.lineTo(r1, 7);
        g.arc(0, 7, r1, 0, Math.PI, true);
        g.closePath();
      }
      g.rect(-10.5, 7, 21, 1.6);
      break;
    case 'coin':
      // A cash coin: a rimmed disc with a square hole.
      disc(g, 0, 0, 10);
      disc(g, 0, 0, 8.6, true);
      disc(g, 0, 0, 7.6);
      poly(g, [[-3, -3], [3, -3], [3, 3], [-3, 3]], true);
      poly(g, [[-2.2, -2.2], [2.2, -2.2], [2.2, 2.2], [-2.2, 2.2]]);
      poly(g, [[-1.5, -1.5], [1.5, -1.5], [1.5, 1.5], [-1.5, 1.5]], true);
      for (const [mx, my] of [[0, -5.4], [0, 5.4], [-5.4, 0], [5.4, 0]] as [number, number][]) poly(g, [[mx - 0.9, my - 0.9], [mx + 0.9, my - 0.9], [mx + 0.9, my + 0.9], [mx - 0.9, my + 0.9]], true);
      break;
    case 'lotus': {
      // Pointed petals fanning up from a bowl.
      const petal = (rot: number, len: number, w: number) => {
        g.save();
        g.translate(0, 5);
        g.rotate(rot);
        g.moveTo(0, 0);
        g.quadraticCurveTo(-w, -len * 0.45, 0, -len);
        g.quadraticCurveTo(w, -len * 0.45, 0, 0);
        g.closePath();
        g.restore();
      };
      petal(-1.15, 10, 3.4);
      petal(1.15, 10, 3.4);
      petal(-0.55, 13.5, 4);
      petal(0.55, 13.5, 4);
      petal(0, 15.5, 4.4);
      g.moveTo(-8.6, 4.6);
      g.quadraticCurveTo(0, 7.2, 8.6, 4.6);
      g.lineTo(6.6, 9);
      g.quadraticCurveTo(0, 10.8, -6.6, 9);
      g.closePath();
      break;
    }
    case 'taiji': {
      // The great ultimate: a ring, and one of the two interlocking halves with its eye.
      const R = 8.8;
      disc(g, 0, 0, 10.4);
      disc(g, 0, 0, R, true);
      g.moveTo(0, -R);
      g.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, false);
      g.arc(0, R / 2, R / 2, Math.PI / 2, (3 * Math.PI) / 2, false);
      g.arc(0, -R / 2, R / 2, Math.PI / 2, -Math.PI / 2, true);
      g.closePath();
      disc(g, 0, R / 2, 1.5, true);
      disc(g, 0, -R / 2, 1.5);
      break;
    }
    case 'bow': {
      // A recurved horse-archer's bow, strung, with an arrow across it.
      const pts: [number, number][] = [];
      for (let i = 0; i <= 30; i++) {
        const yy = -10.5 + (21 * i) / 30, t = Math.abs(yy) / 10.5;
        pts.push([-3.6 * Math.cos((Math.PI * yy) / 21) + 2.2 * t ** 5, yy]);
      }
      band(g, pts, (t) => 1.1 - 0.5 * Math.abs(t - 0.5));
      g.rect(1.6, -9.6, 0.5, 19.2);
      g.rect(-9.5, -0.45, 17.5, 0.9);
      poly(g, [[7.4, -2.2], [11, 0], [7.4, 2.2]]);
      poly(g, [[-10.8, -2.4], [-7.6, -0.4], [-9, -0.4]]);
      poly(g, [[-10.8, 2.4], [-9, 0.4], [-7.6, 0.4]]);
      break;
    }
    case 'horse':
      // A horse's head couped, facing the dexter, with a mane down the neck.
      poly(g, [
        [1.6, 10.6], [-2.2, 4.8], [-5.8, 5.4], [-9.4, 5], [-10.8, 3], [-10.4, 0.8], [-7.4, -3.2], [-4.2, -7.4], [-3, -8.8],
        [-2.8, -11.6], [-1.4, -9], [0, -11.2], [0.8, -8.2], [2.8, -7.6], [3.4, -5.6], [5.2, -5], [5.4, -2.8], [7.2, -1.8],
        [7.2, 0.6], [8.8, 1.8], [8.6, 4], [10, 5.6], [10.2, 10.6],
      ]);
      disc(g, -4.4, -3.6, 0.9, true);
      poly(g, [[-9.6, 1.6], [-8.6, 1.2], [-8.8, 2.4]], true);
      break;
    case 'spears':
      // A hide shield over two spears in saltire.
      for (const rot of [-0.72, 0.72]) {
        g.save();
        g.rotate(rot);
        g.rect(-0.55, -9, 1.1, 20.5);
        g.moveTo(0, -13);
        g.quadraticCurveTo(2.2, -10.4, 0.6, -8.4);
        g.lineTo(-0.6, -8.4);
        g.quadraticCurveTo(-2.2, -10.4, 0, -13);
        g.closePath();
        g.restore();
      }
      g.ellipse(0, 0.5, 4.8, 8.4, 0, 0, Math.PI * 2);
      g.ellipse(0, 0.5, 0.9, 6.4, 0, 0, Math.PI * 2, true);
      break;
    case 'cross':
      for (let k = 0; k < 4; k++) {
        g.save();
        g.rotate((k * Math.PI) / 2);
        g.moveTo(-1.6, 0);
        g.lineTo(-5, -10);
        g.lineTo(5, -10);
        g.lineTo(1.6, 0);
        g.closePath();
        g.restore();
      }
      break;
  }
  g.restore();
}

/** Draws the arms into a w-wide box at (x, y) (height 1.2 w, or 1.42 w when crowned). */
export function drawArms(g: Ctx, a: Arms, x: number, y: number, w: number): void {
  if (a.style && a.style !== 'shield') {
    drawEmblem(g, a, x, y + (a.crowned ? 11 * (w / 100) : 0), w);
    return;
  }
  const k = w / 100;
  g.save();
  g.translate(x, y + (a.crowned ? 22 * k : 0));
  g.scale(k, k);
  g.lineJoin = 'round';
  shieldPath(g, a.shield);
  g.save();
  g.clip();
  const fill = (t: Tincture) => (g.fillStyle = TINCTURE_HEX[t]);
  fill(a.field);
  g.fillRect(0, 0, 100, 120);
  furPattern(g, a.field);
  fill(a.field2);
  divisionPath(g, a.division);
  if (a.division !== 'plain') g.fill();
  if (a.ordinary) {
    fill(a.ordinary.t);
    g.beginPath();
    switch (a.ordinary.kind) {
      case 'fess': g.rect(0, 44, 100, 28); break;
      case 'pale': g.rect(36, 0, 28, 120); break;
      case 'chief': g.rect(0, 0, 100, 34); break;
      case 'cross': g.rect(40, 0, 20, 120); g.rect(0, 44, 100, 20); break;
      case 'bend': g.moveTo(-10, 12); g.lineTo(12, -10); g.lineTo(110, 98); g.lineTo(88, 120); g.closePath(); break;
      case 'saltire':
        g.moveTo(-8, 8); g.lineTo(8, -8); g.lineTo(108, 112); g.lineTo(92, 128); g.closePath();
        g.moveTo(108, 8); g.lineTo(92, -8); g.lineTo(-8, 112); g.lineTo(8, 128); g.closePath();
        break;
      case 'chevron': g.moveTo(0, 96); g.lineTo(50, 40); g.lineTo(100, 96); g.lineTo(100, 120); g.lineTo(50, 64); g.lineTo(0, 120); g.closePath(); break;
      case 'pile': g.moveTo(22, 0); g.lineTo(78, 0); g.lineTo(50, 100); g.closePath(); break;
      case 'pall':
        g.moveTo(-6, 6); g.lineTo(6, -6); g.lineTo(50, 44); g.lineTo(94, -6); g.lineTo(106, 6); g.lineTo(58, 54);
        g.lineTo(58, 130); g.lineTo(42, 130); g.lineTo(42, 54); g.closePath();
        break;
      case 'bordure': break;
    }
    if (a.ordinary.kind === 'bordure') {
      g.save();
      shieldPath(g, a.shield);
      g.strokeStyle = TINCTURE_HEX[a.ordinary.t];
      g.lineWidth = 22;
      g.stroke();
      g.restore();
    } else g.fill();
  }
  if (a.charge) {
    fill(a.charge.t);
    const chief = a.ordinary?.kind === 'chief';
    const inBordure = a.ordinary?.kind === 'bordure' ? 0.8 : 1;
    const cy = chief ? 74 : a.ordinary?.kind === 'fess' ? 58 : 56;
    // Three charges with a chief stand on the chief; one or two lie in the field below it.
    const spots: [number, number, number][] = a.charge.n === 3
      ? chief ? [[22, 17, 17], [50, 17, 17], [78, 17, 17]] : [[30, cy - 20, 24 * inBordure], [70, cy - 20, 24 * inBordure], [50, cy + 24, 24 * inBordure]]
      : a.charge.n === 2
        ? [[30, chief ? 70 : cy, (chief ? 26 : 30) * inBordure], [70, chief ? 70 : cy, (chief ? 26 : 30) * inBordure]]
        : [[50, chief ? 74 : cy, (chief ? 40 : 52) * inBordure]];
    for (const [cx, yy, s] of spots) {
      chargePath(g, a.charge.kind, cx, yy, s);
      g.fill('nonzero');
      if (a.charge.counter) {
        // The part over the second half takes the first half's tincture.
        g.save();
        divisionPath(g, a.division);
        g.clip();
        fill(a.field);
        chargePath(g, a.charge.kind, cx, yy, s);
        g.fill('nonzero');
        g.restore();
      }
      g.lineWidth = 1.2;
      g.strokeStyle = 'rgba(30,25,20,0.65)';
      chargePath(g, a.charge.kind, cx, yy, s);
      g.stroke();
    }
  }
  if (a.label) {
    fill(a.label);
    g.fillRect(16, 14, 68, 6);
    for (const px of [22, 46, 70]) g.fillRect(px, 18, 8, 12);
  }
  // Shading: light from the upper left, as on painted arms.
  const sh = g.createLinearGradient(0, 0, 100, 120);
  sh.addColorStop(0, 'rgba(255,255,255,0.22)');
  sh.addColorStop(0.5, 'rgba(255,255,255,0)');
  sh.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = sh;
  g.fillRect(0, 0, 100, 120);
  g.restore();
  if (a.bordure) {
    g.save();
    shieldPath(g, a.shield);
    g.clip();
    g.strokeStyle = TINCTURE_HEX[a.bordure];
    g.lineWidth = 18;
    shieldPath(g, a.shield);
    g.stroke();
    g.restore();
  }
  g.strokeStyle = '#2b2420';
  g.lineWidth = 3.2;
  shieldPath(g, a.shield);
  g.stroke();
  g.restore();
  if (a.crowned) drawCrown(g, x + w * 0.5, y + 12 * k, w * 0.5);
}

function drawCrown(g: Ctx, cx: number, cy: number, w: number): void {
  g.save();
  g.translate(cx - w / 2, cy - w * 0.22);
  g.scale(w / 50, w / 50);
  g.beginPath();
  g.moveTo(2, 22);
  g.lineTo(0, 4);
  g.lineTo(12, 13);
  g.lineTo(25, 0);
  g.lineTo(38, 13);
  g.lineTo(50, 4);
  g.lineTo(48, 22);
  g.closePath();
  g.fillStyle = TINCTURE_HEX.or;
  g.fill();
  g.strokeStyle = '#2b2420';
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = TINCTURE_HEX.gules;
  for (const x of [12, 25, 38]) {
    g.beginPath();
    g.arc(x, 17, 2.4, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

const urls = new Map<string, string>();

/** The arms as a PNG data URL, `w` CSS pixels wide (cached by key). */
export function armsImage(a: Arms, w: number, key: string): string {
  const k = `${key}:${w}`;
  let u = urls.get(k);
  if (!u) {
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * dpr);
    c.height = Math.ceil(w * (a.crowned ? 1.44 : 1.22) * dpr);
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    drawArms(g, a, 0, 1, w);
    u = c.toDataURL('image/png');
    urls.set(k, u);
    if (urls.size > 400) urls.delete(urls.keys().next().value!);
  }
  return u;
}

/** Raw pixels for a map icon. */
export function armsImageData(a: Arms, w: number, pixelRatio = 2): ImageData {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * pixelRatio);
  c.height = Math.ceil(w * (a.crowned ? 1.44 : 1.22) * pixelRatio);
  const g = c.getContext('2d')!;
  g.scale(pixelRatio, pixelRatio);
  drawArms(g, a, 0, 1, w);
  return g.getImageData(0, 0, c.width, c.height);
}

// ---- Emblems of other cultures ---------------------------------------------------------------

/** Fills the current clip with the field: plain, or halved or quartered in the two tinctures. */
function emblemField(g: Ctx, a: Arms): void {
  g.fillStyle = TINCTURE_HEX[a.field];
  g.fillRect(0, 0, 100, 120);
  if (a.division !== 'plain') {
    g.fillStyle = TINCTURE_HEX[a.field2];
    divisionPath(g, a.division);
    g.fill();
  }
}

/** The charge (or three of them, round the centre) at (cx, cy), counterchanged over a divided field. */
function emblemCharge(g: Ctx, a: Arms, cx: number, cy: number, size: number, t?: Tincture, ring = false): void {
  if (!a.charge) return;
  const spots: [number, number, number, number][] = a.charge.n === 3
    ? [0, 1, 2].map((q) => {
      const ang = -Math.PI / 2 + (q * 2 * Math.PI) / 3;
      return [cx + Math.cos(ang) * size * 0.3, cy + Math.sin(ang) * size * 0.3, size * 0.5, ring ? ang + Math.PI / 2 : 0];
    })
    : [[cx, cy, size, 0]];
  for (const [x, y, sz, rot] of spots) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = TINCTURE_HEX[t ?? a.charge.t];
    chargePath(g, a.charge.kind, 0, 0, sz);
    g.fill('nonzero');
    if (a.charge.counter && !t) {
      g.restore();
      g.save();
      divisionPath(g, a.division);
      g.clip();
      g.translate(x, y);
      g.rotate(rot);
      g.fillStyle = TINCTURE_HEX[a.field];
      chargePath(g, a.charge.kind, 0, 0, sz);
      g.fill('nonzero');
    }
    g.restore();
  }
}

/** Light from the upper left over the current clip. */
function emblemShade(g: Ctx): void {
  const sh = g.createLinearGradient(0, 0, 100, 120);
  sh.addColorStop(0, 'rgba(255,255,255,0.2)');
  sh.addColorStop(0.5, 'rgba(255,255,255,0)');
  sh.addColorStop(1, 'rgba(0,0,0,0.2)');
  g.fillStyle = sh;
  g.fillRect(0, 0, 100, 120);
}

function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Draws a non-European emblem into the same 100 × 120 box a shield uses. */
function drawEmblem(g: Ctx, a: Arms, x: number, y: number, w: number): void {
  const k = w / 100;
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const gold = TINCTURE_HEX.or;
  const outline = (width = 3) => {
    g.strokeStyle = INK;
    g.lineWidth = width;
    g.stroke();
  };
  switch (a.style) {
    case 'hide': {
      // Hanging feathers first, so the shield covers their quills.
      for (let q = 0; q < 5; q++) {
        const ang = Math.PI / 2 + (q - 2) * 0.32;
        const fx = 50 + Math.cos(ang) * 36, fy = 48 + Math.sin(ang) * 36;
        g.save();
        g.translate(fx, fy);
        g.rotate((q - 2) * 0.12);
        g.beginPath();
        g.ellipse(0, 18, 4.2, 16, 0, 0, Math.PI * 2);
        g.fillStyle = '#f2efe6';
        g.fill();
        outline(1.2);
        g.beginPath();
        g.ellipse(0, 29, 3.4, 5.5, 0, 0, Math.PI * 2);
        g.fillStyle = q % 2 ? INK : TINCTURE_HEX[a.label ?? a.field2];
        g.fill();
        g.beginPath();
        g.moveTo(0, 2);
        g.lineTo(0, 32);
        g.strokeStyle = 'rgba(43,36,32,0.7)';
        g.lineWidth = 0.8;
        g.stroke();
        g.restore();
      }
      g.beginPath();
      g.arc(50, 48, 40, 0, Math.PI * 2);
      g.save();
      g.clip();
      emblemField(g, a);
      emblemCharge(g, a, 50, 48, 46);
      emblemShade(g);
      g.restore();
      // The hide rim, laced to its hoop.
      g.beginPath();
      g.arc(50, 48, 38, 0, Math.PI * 2);
      g.strokeStyle = TINCTURE_HEX[a.bordure ?? 'tenne'];
      g.lineWidth = 5;
      g.stroke();
      g.strokeStyle = INK;
      g.lineWidth = 1.2;
      for (let q = 0; q < 24; q++) {
        const ang = (q / 24) * Math.PI * 2;
        g.beginPath();
        g.moveTo(50 + Math.cos(ang) * 36, 48 + Math.sin(ang) * 36);
        g.lineTo(50 + Math.cos(ang) * 40.5, 48 + Math.sin(ang) * 40.5);
        g.stroke();
      }
      g.beginPath();
      g.arc(50, 48, 40.5, 0, Math.PI * 2);
      if (a.crowned) {
        g.strokeStyle = gold;
        g.lineWidth = 5;
        g.stroke();
      }
      outline(2.6);
      break;
    }
    case 'chakana': {
      // A square with a tocapu border of small squares, a stepped cross, and the charge in its heart.
      g.beginPath();
      g.rect(8, 14, 84, 84);
      g.save();
      g.clip();
      emblemField(g, a);
      g.fillStyle = TINCTURE_HEX[a.field2];
      for (let q = 0; q < 12; q++) {
        if (q % 2) continue;
        const t = 8 + q * 7;
        g.fillRect(t, 14, 7, 7);
        g.fillRect(t, 91, 7, 7);
        g.fillRect(8, 14 + q * 7, 7, 7);
        g.fillRect(85, 14 + q * 7, 7, 7);
      }
      // The stepped cross (a chakana): three overlapping bars make its steps.
      const c = 50, cy = 56, s1 = 9, s2 = 18, s3 = 27;
      g.beginPath();
      g.rect(c - s1, cy - s3, 2 * s1, 2 * s3);
      g.rect(c - s3, cy - s1, 2 * s3, 2 * s1);
      g.rect(c - s2, cy - s2, 2 * s2, 2 * s2);
      g.fillStyle = TINCTURE_HEX[a.field2];
      g.fill();
      g.beginPath();
      g.arc(c, cy, 9.5, 0, Math.PI * 2);
      g.fillStyle = TINCTURE_HEX[a.field];
      g.fill();
      emblemCharge(g, a, c, cy, 16, a.field2);
      emblemShade(g);
      g.restore();
      g.beginPath();
      g.rect(8, 14, 84, 84);
      if (a.bordure || a.crowned) {
        g.strokeStyle = a.crowned ? gold : TINCTURE_HEX[a.bordure!];
        g.lineWidth = 6;
        g.stroke();
      }
      outline(3);
      break;
    }
    case 'glyph': {
      // A rounded glyph block: the charge above, a band of stepped fret below, and dots for the count.
      roundRect(g, 10, 10, 80, 86, 16);
      g.save();
      g.clip();
      emblemField(g, a);
      emblemCharge(g, a, 50, 42, 44);
      g.fillStyle = TINCTURE_HEX[a.field2];
      g.fillRect(10, 74, 80, 22);
      // Stepped fret (a hook and step, repeated).
      g.fillStyle = TINCTURE_HEX[a.field];
      for (let q = 0; q < 5; q++) {
        const fx = 12 + q * 16;
        g.beginPath();
        g.moveTo(fx, 94);
        g.lineTo(fx, 86);
        g.lineTo(fx + 4, 86);
        g.lineTo(fx + 4, 82);
        g.lineTo(fx + 8, 82);
        g.lineTo(fx + 8, 78);
        g.lineTo(fx + 13, 78);
        g.lineTo(fx + 13, 84);
        g.lineTo(fx + 10, 84);
        g.lineTo(fx + 10, 88);
        g.lineTo(fx + 6, 88);
        g.lineTo(fx + 6, 94);
        g.closePath();
        g.fill();
      }
      emblemShade(g);
      g.restore();
      roundRect(g, 10, 10, 80, 86, 16);
      g.strokeStyle = TINCTURE_HEX[a.bordure ?? 'sable'];
      g.lineWidth = a.bordure ? 6 : 4;
      g.stroke();
      if (a.crowned) {
        roundRect(g, 5, 5, 90, 96, 19);
        g.strokeStyle = gold;
        g.lineWidth = 4;
        g.stroke();
      }
      roundRect(g, 10, 10, 80, 86, 16);
      outline(2);
      // Bar-and-dot count beneath the block: one dot per charge.
      g.fillStyle = INK;
      const nDots = a.charge?.n ?? 1;
      for (let q = 0; q < nDots; q++) {
        g.beginPath();
        g.arc(50 + (q - (nDots - 1) / 2) * 9, 106, 3, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'mon': {
      // A round crest: one colour on another, within a ring; three charges wheel about the centre.
      g.beginPath();
      g.arc(50, 58, 44, 0, Math.PI * 2);
      g.fillStyle = TINCTURE_HEX[a.field];
      g.fill();
      g.beginPath();
      g.arc(50, 58, 37, 0, Math.PI * 2);
      g.strokeStyle = TINCTURE_HEX[a.field2];
      g.lineWidth = 6;
      g.stroke();
      emblemCharge(g, a, 50, 58, a.charge?.n === 3 ? 58 : 46, a.field2, true);
      if (a.label) {
        g.beginPath();
        g.arc(50, 58, 8, 0, Math.PI * 2);
        g.fillStyle = TINCTURE_HEX[a.label];
        g.fill();
      }
      g.beginPath();
      g.arc(50, 58, 44, 0, Math.PI * 2);
      if (a.bordure || a.crowned) {
        g.strokeStyle = a.crowned ? gold : TINCTURE_HEX[a.bordure!];
        g.lineWidth = 5;
        g.stroke();
      }
      outline(2.2);
      break;
    }
    case 'seal': {
      // A square seal: a double frame with key-fret corners, the device in the middle.
      roundRect(g, 12, 18, 76, 76, 5);
      g.save();
      g.clip();
      g.fillStyle = TINCTURE_HEX[a.field];
      g.fillRect(0, 0, 100, 120);
      g.strokeStyle = TINCTURE_HEX[a.field2];
      g.lineWidth = 3;
      g.strokeRect(18, 24, 64, 64);
      g.lineWidth = 1.5;
      g.strokeRect(22, 28, 56, 56);
      // Key-fret hooks in the corners.
      for (const [cx, cy, sx, sy] of [[22, 28, 1, 1], [78, 28, -1, 1], [22, 84, 1, -1], [78, 84, -1, -1]] as [number, number, number, number][]) {
        g.beginPath();
        g.moveTo(cx, cy + 10 * sy);
        g.lineTo(cx + 10 * sx, cy + 10 * sy);
        g.lineTo(cx + 10 * sx, cy + 4 * sy);
        g.lineTo(cx + 5 * sx, cy + 4 * sy);
        g.stroke();
      }
      emblemCharge(g, a, 50, 56, 40, a.field2);
      if (a.label) {
        g.fillStyle = TINCTURE_HEX[a.label];
        g.fillRect(44, 78, 12, 4);
      }
      // A little worn, as a stamped seal is.
      g.fillStyle = 'rgba(255,255,255,0.12)';
      for (let q = 0; q < 14; q++) g.fillRect(14 + ((q * 37) % 70), 20 + ((q * 53) % 70), 2.5, 1.5);
      g.restore();
      roundRect(g, 12, 18, 76, 76, 5);
      if (a.bordure || a.crowned) {
        g.strokeStyle = a.crowned ? gold : TINCTURE_HEX[a.bordure!];
        g.lineWidth = 5;
        g.stroke();
      }
      outline(2);
      break;
    }
    case 'banner': {
      // A banner on a pole with a spear finial, fringed with flame points on the fly and foot.
      g.fillStyle = '#7a5230';
      g.fillRect(9, 6, 4.5, 112);
      g.beginPath();
      g.moveTo(11.25, -2);
      g.lineTo(15.5, 8);
      g.lineTo(7, 8);
      g.closePath();
      g.fillStyle = gold;
      g.fill();
      outline(1);
      const flag = () => {
        g.beginPath();
        g.moveTo(14, 12);
        g.lineTo(86, 12);
        g.lineTo(86, 88);
        g.lineTo(14, 88);
        g.closePath();
      };
      // Flame points.
      g.beginPath();
      for (let q = 0; q < 7; q++) {
        const py = 14 + q * 11;
        g.moveTo(86, py);
        g.lineTo(95, py + 5.5);
        g.lineTo(86, py + 11);
      }
      for (let q = 0; q < 6; q++) {
        const px = 16 + q * 12;
        g.moveTo(px, 88);
        g.lineTo(px + 6, 98);
        g.lineTo(px + 12, 88);
      }
      g.fillStyle = TINCTURE_HEX[a.bordure ?? a.field2];
      g.fill();
      outline(1);
      flag();
      g.save();
      g.clip();
      emblemField(g, a);
      emblemCharge(g, a, 50, 50, 42);
      emblemShade(g);
      g.restore();
      flag();
      if (a.crowned) {
        g.strokeStyle = gold;
        g.lineWidth = 4;
        g.stroke();
      }
      outline(2.4);
      break;
    }
    case 'blazon': {
      // A round blazon of three bands, the charge on the broad middle band.
      g.beginPath();
      g.arc(50, 58, 44, 0, Math.PI * 2);
      g.save();
      g.clip();
      g.fillStyle = TINCTURE_HEX[a.field];
      g.fillRect(0, 0, 100, 120);
      g.fillStyle = TINCTURE_HEX[a.field2];
      g.fillRect(0, 40, 100, 36);
      if (a.charge) {
        const n = a.charge.n;
        for (let q = 0; q < n; q++) emblemChargeAt(g, a.charge.kind, 50 + (q - (n - 1) / 2) * 24, 58, n === 3 ? 20 : 30, a.field);
      }
      emblemShade(g);
      g.restore();
      g.beginPath();
      g.arc(50, 58, 44, 0, Math.PI * 2);
      if (a.bordure || a.crowned) {
        g.strokeStyle = a.crowned ? gold : TINCTURE_HEX[a.bordure!];
        g.lineWidth = 6;
        g.stroke();
      }
      outline(2.6);
      break;
    }
    case 'tamga': {
      // Horsetails hanging from a disc, and the brand mark on it.
      for (let q = 0; q < 3; q++) {
        const tx = 32 + q * 18;
        g.beginPath();
        g.moveTo(tx - 4, 74);
        g.quadraticCurveTo(tx - 6, 100, tx - 1 + (q - 1) * 3, 118);
        g.lineTo(tx + 3 + (q - 1) * 3, 118);
        g.quadraticCurveTo(tx + 4, 98, tx + 4, 74);
        g.closePath();
        g.fillStyle = q === 1 ? TINCTURE_HEX[a.label ?? 'sable'] : '#5a4632';
        g.fill();
        outline(1);
      }
      g.beginPath();
      g.arc(50, 44, 36, 0, Math.PI * 2);
      g.fillStyle = TINCTURE_HEX[a.field];
      g.fill();
      emblemShadeIn(g, 50, 44, 36);
      drawTamga(g, a.mark ?? 0, 50, 44, TINCTURE_HEX[a.field2]);
      g.beginPath();
      g.arc(50, 44, 36, 0, Math.PI * 2);
      if (a.bordure || a.crowned) {
        g.strokeStyle = a.crowned ? gold : TINCTURE_HEX[a.bordure!];
        g.lineWidth = 5;
        g.stroke();
      }
      outline(2.4);
      break;
    }
  }
  g.restore();
}

function emblemChargeAt(g: Ctx, kind: Charge, x: number, y: number, size: number, t: Tincture): void {
  g.fillStyle = TINCTURE_HEX[t];
  chargePath(g, kind, x, y, size);
  g.fill('nonzero');
}

function emblemShadeIn(g: Ctx, cx: number, cy: number, r: number): void {
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.clip();
  emblemShade(g);
  g.restore();
}

/**
 * A tamga built from the bits of `mark`: a base form (a stem, a ring on a stem, an arch with a
 * stem, or a zigzag), a fork or a crescent on top, a ring or a foot below, and at most two side
 * strokes (a crossbar, hooks, a tick or a small ring); a vassal's mark (bits 12 and up) adds a
 * stroke of its own, so it still reads as its liege's brand.
 */
function drawTamga(g: Ctx, mark: number, cx: number, cy: number, colour: string): void {
  const b = (i: number) => ((mark >> i) & 1) === 1;
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = colour;
  g.lineWidth = 5.5;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  // The base form (bits 8 and 9): a stem, a ring on a stem, an arch with a stem, or a zigzag.
  const form = (mark >> 8) & 3;
  if (form === 0) {
    g.moveTo(0, -20);
    g.lineTo(0, 18);
  } else if (form === 1) {
    g.moveTo(9, -8);
    g.arc(0, -8, 9, 0, Math.PI * 2);
    g.moveTo(0, 1);
    g.lineTo(0, 20);
  } else if (form === 2) {
    g.moveTo(-14, 20);
    g.lineTo(-14, 6);
    g.arc(0, 6, 14, Math.PI, 0);
    g.lineTo(14, 20);
    g.moveTo(0, -8);
    g.lineTo(0, -22);
  } else {
    g.moveTo(-7, -20);
    g.lineTo(7, -7);
    g.lineTo(-7, 6);
    g.lineTo(7, 19);
  }
  // The head and the foot.
  if (b(0)) {
    g.moveTo(-11, -24);
    g.lineTo(0, -12);
    g.lineTo(11, -24);
  } else if (b(1)) {
    g.moveTo(-12, -24);
    g.quadraticCurveTo(0, -10, 12, -24);
  }
  if (b(2)) {
    g.moveTo(7, 22);
    g.arc(0, 22, 7, 0, Math.PI * 2);
  } else if (b(3)) {
    g.moveTo(-10, 20);
    g.lineTo(10, 20);
  }
  // At most two side strokes (bits 4 to 7, chosen by bits 10 and 11), so the mark stays simple.
  const side = (mark >> 10) & 3;
  if (side === 1 && b(4)) {
    g.moveTo(-13, 0);
    g.lineTo(13, 0);
  }
  if (side === 1 && b(5)) {
    g.moveTo(-2, -4);
    g.quadraticCurveTo(-16, -6, -16, 8);
  }
  if (side === 2 && b(6)) {
    g.moveTo(2, 6);
    g.quadraticCurveTo(16, 4, 16, -10);
  }
  if (side === 2 && b(7)) {
    g.moveTo(-6, -14);
    g.lineTo(-16, -9);
  }
  if (side === 3) {
    g.moveTo(b(4) ? 21 : -9, 2);
    g.arc(b(4) ? 17 : -13, 2, 4, 0, Math.PI * 2);
  }
  // The vassal's difference.
  const v = mark >> 12;
  if (v) {
    const ang = (v / 16) * Math.PI * 2;
    g.moveTo(Math.cos(ang) * 10, Math.sin(ang) * 10);
    g.lineTo(Math.cos(ang) * 22, Math.sin(ang) * 22);
  }
  g.stroke();
  g.restore();
}
