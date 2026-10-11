import { type Arms, type Charge, type Division, type Shield, type Tincture, TINCTURE_HEX } from './arms';

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
    case 'acorn':
      g.ellipse(0, 3, 5, 6.5, 0, 0, Math.PI * 2);
      g.moveTo(-6.4, -1);
      g.quadraticCurveTo(-6, -7, 0, -7);
      g.quadraticCurveTo(6, -7, 6.4, -1);
      g.closePath();
      g.rect(-0.8, -10.5, 1.6, 4);
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
