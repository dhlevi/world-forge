import type { Figure, Look, Outfit } from './appearance';

/**
 * A tinted ink sketch of a people (people/appearance.ts): a commoner, a noble and a warrior side
 * by side, drawn front-on in ink lines over soft washes of their colours, shaded with hatching
 * on one side, on the window's parchment. Returns an SVG string.
 */

const INK = '#2b2420';
const PAPER = '#f3ead3';
const STEEL = '#b9bcc0';
const DARKSTEEL = '#8a8e94';
const GOLD = '#c9a43a';
const WOOD = '#7a5636';

/** A watercolour wash: the colour lightened toward the paper. */
function tint(hex: string, k = 0.2): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const a = parseInt(hex.slice(1), 16), b = parseInt(PAPER.slice(1), 16);
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - k) + ((b >> sh) & 255) * k);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
function darken(hex: string, k = 0.25): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const a = parseInt(hex.slice(1), 16);
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - k));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
const f1 = (n: number) => (Math.round(n * 10) / 10).toString();

/** A polygon path through points. */
const poly = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join('L')}Z`;
/** A limb: a band along a polyline with the given half-widths at each point. */
function limb(pts: [number, number][], w: number[]): string {
  const left: [number, number][] = [], right: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    left.push([pts[i][0] + nx * w[i], pts[i][1] + ny * w[i]]);
    right.push([pts[i][0] - nx * w[i], pts[i][1] - ny * w[i]]);
  }
  return poly([...left, ...right.reverse()]);
}
const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

interface Ctx {
  out: string[];
  /** Shapes that take the hatching. */
  shade: string[];
  id: string;
}
const fill = (c: Ctx, d: string, col: string, opts: { sw?: number; shade?: boolean; op?: number; stroke?: string } = {}) => {
  c.out.push(`<path d="${d}" fill="${col}"${opts.op !== undefined ? ` fill-opacity="${opts.op}"` : ''} stroke="${opts.stroke ?? INK}" stroke-width="${opts.sw ?? 1.1}" stroke-linejoin="round"/>`);
  if (opts.shade !== false) c.shade.push(d);
};
const line = (c: Ctx, d: string, w = 1, col = INK, op = 1) => c.out.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${op < 1 ? ` stroke-opacity="${op}"` : ''}/>`);
const circ = (c: Ctx, x: number, y: number, r: number, col: string, sw = 1.1, stroke = INK) => c.out.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${col}" stroke="${stroke}" stroke-width="${sw}"/>`);
const ell = (c: Ctx, x: number, y: number, rx: number, ry: number, col: string, sw = 1.1, stroke = INK) => c.out.push(`<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${col}" stroke="${stroke}" stroke-width="${sw}"/>`);

/** Draws one figure standing at (cx, gy) (the feet), `H` tall. */
function figure(c: Ctx, look: Look, f: Figure, cx: number, gy: number, H: number): void {
  const o = f.outfit;
  const P = (x: number, y: number): [number, number] => [cx + x, gy + y];
  const small = look.kind === 'dwarf' || look.kind === 'halfling' || look.kind === 'gnome';
  const hr = H * 0.066 * look.headK;
  const rx = hr * 0.86, ry = hr * 1.1;
  const hc = -H + ry;
  const chin = hc + ry;
  const ys = chin + hr * 0.42;
  const sw = H * 0.12 * look.broad * (f.female ? 0.9 : 1);
  const yHip = small ? -0.4 * H : -0.48 * H;
  const yWaist = yHip - H * 0.09;
  const ww = sw * (f.female ? 0.66 : 0.76), hw = sw * (f.female ? 0.95 : 0.86);
  const ankle = -H * 0.035;
  const skin = tint(f.skin[0], 0.12);
  const main = tint(o.main[0]);
  const trim = tint(o.trim[0]);
  const warrior = f.role === 'Warrior';
  const fungus = look.kind === 'fungus';

  // Arms: the left (viewer's left) hangs or bears the shield; the right holds the weapon.
  const armL: [number, number][] = [P(-sw * 0.98, ys + H * 0.02), P(-sw - H * 0.03, yWaist + H * 0.01), P(-sw - H * 0.045, yHip + H * 0.03)];
  const armR: [number, number][] = warrior
    ? [P(sw * 0.98, ys + H * 0.02), P(sw + H * 0.045, yWaist + H * 0.02), P(sw + H * 0.07, yWaist + H * 0.0)]
    : [P(sw * 0.98, ys + H * 0.02), P(sw + H * 0.03, yWaist + H * 0.01), P(sw + H * 0.045, yHip + H * 0.03)];
  const aw = [H * 0.045 * look.broad, H * 0.036 * look.broad, H * 0.028 * look.broad];

  // Ground shadow.
  c.out.push(`<ellipse cx="${f1(cx)}" cy="${f1(gy + 1)}" rx="${f1(sw * 1.5)}" ry="${f1(H * 0.025)}" fill="${INK}" fill-opacity="0.12"/>`);

  if (fungus) {
    fungusFigure(c, f, cx, gy, H, hr, sw, ys, yWaist);
    return;
  }

  // ---- Behind the body ----
  // A lizard's tail.
  if (look.kind === 'lizard') fill(c, limb([P(sw * 0.3, yHip + H * 0.05), P(sw * 1.4, -H * 0.1), P(sw * 2.3, -H * 0.02), P(sw * 2.9, -H * 0.05)], [H * 0.05, H * 0.04, H * 0.022, H * 0.006]), skin);
  // A quiver on the back.
  if (o.weapon === 'bow') {
    fill(c, limb([P(sw * 0.4, yWaist), P(sw * 1.05, ys - H * 0.06)], [H * 0.022, H * 0.026]), tint('#7a5a3a'));
    for (const k of [-1, 0, 1]) line(c, `M${f1(cx + sw * 1.05 + k * 2.5)},${f1(gy + ys - H * 0.06)}l${f1(1 + k)},${f1(-H * 0.05)}`, 1.2);
  }
  // The cloak, behind the body.
  if (o.cloak !== 'none' && o.cloak !== 'shawl') {
    const yc = o.cloak === 'cape' ? yWaist + H * 0.04 : o.cloak === 'fur' ? -H * 0.3 : o.cloak === 'mantle' ? -H * 0.07 : -H * 0.05;
    const wb = o.cloak === 'cape' ? sw * 1.35 : sw * 1.55 + (yc - ys) * 0.08;
    const col = o.cloak === 'fur' ? tint('#8a6a4a') : tint(o.cloakCol[0]);
    const d = `M${f1(cx - sw * 0.9)},${f1(gy + ys - 1)}C${f1(cx - sw * 1.2)},${f1(gy + ys + H * 0.15)} ${f1(cx - wb)},${f1(gy + yc - H * 0.1)} ${f1(cx - wb)},${f1(gy + yc)}Q${f1(cx)},${f1(gy + yc + H * 0.025)} ${f1(cx + wb)},${f1(gy + yc)}C${f1(cx + wb)},${f1(gy + yc - H * 0.1)} ${f1(cx + sw * 1.2)},${f1(gy + ys + H * 0.15)} ${f1(cx + sw * 0.9)},${f1(gy + ys - 1)}Z`;
    fill(c, d, col);
    // Folds.
    for (const k of [-0.55, 0.55]) line(c, `M${f1(cx + wb * k * 0.6)},${f1(gy + ys + H * 0.2)}Q${f1(cx + wb * k * 0.8)},${f1(gy + (ys + yc) / 2)} ${f1(cx + wb * k * 0.85)},${f1(gy + yc - 2)}`, 0.7, INK, 0.6);
  }
  // Long hair, behind the shoulders.
  const longHair = f.hairStyle === 'long' || f.hairStyle === 'loose' || (f.female && f.hairStyle === 'curly');
  const hairCol = tint(f.hair[0], 0.1);
  const hasHair = f.hair[1] !== 'none' && f.hairStyle !== 'bald' && f.hairStyle !== 'shaved';
  const helmed = warrior && o.helm !== 'none' && o.helm !== 'circlet' && o.helm !== 'feathered';
  if (hasHair && longHair && !fungus) {
    const yb = ys + H * (f.female ? 0.17 : 0.09);
    fill(c, poly([P(-rx * 1.02, hc - ry * 0.3), P(-rx * 1.25, ys), P(-rx * 1.2, yb), P(rx * 1.2, yb), P(rx * 1.25, ys), P(rx * 1.02, hc - ry * 0.3)]), hairCol, { shade: false });
  }
  if (hasHair && f.hairStyle === 'bun' && !helmed) circ(c, cx, gy + hc - ry * 1.05, hr * 0.42, hairCol);
  // A hood or veil, behind the head.
  const headwear = warrior ? (o.helm === 'hood' ? 'hood' : 'none') : o.head;
  if (headwear === 'hood' || headwear === 'veil') {
    const col = headwear === 'veil' ? tint('#e8e2d2', 0.1) : tint(o.cloak !== 'none' ? o.cloakCol[0] : o.main[0]);
    fill(c, `M${f1(cx - rx * 1.35)},${f1(gy + ys + H * (headwear === 'veil' ? 0.12 : 0.03))}C${f1(cx - rx * 1.6)},${f1(gy + hc - ry * 0.6)} ${f1(cx - rx * 0.8)},${f1(gy + hc - ry * 1.55)} ${f1(cx)},${f1(gy + hc - ry * 1.55)}C${f1(cx + rx * 0.8)},${f1(gy + hc - ry * 1.55)} ${f1(cx + rx * 1.6)},${f1(gy + hc - ry * 0.6)} ${f1(cx + rx * 1.35)},${f1(gy + ys + H * (headwear === 'veil' ? 0.12 : 0.03))}Z`, col);
  }

  // ---- Legs and feet ----
  const legCol = o.legs === 'bare' ? skin : o.legs === 'hose' ? tint(o.trim[0]) : tint(o.legCol[0]);
  for (const s of [-1, 1]) {
    const x0 = s * hw * 0.48;
    fill(c, limb([P(x0, yHip - H * 0.02), P(x0 * 0.92, yHip * 0.5), P(x0 * 0.85, ankle)], [H * 0.07 * look.broad * 0.85, H * 0.045 * look.broad, H * 0.03 * look.broad]), legCol);
    if (o.legs === 'leggings' || (o.feet === 'boots' && o.legs !== 'bare')) {
      // Cross-gartering or boot tops.
      if (o.feet === 'boots') fill(c, limb([P(x0 * 0.88, yHip * 0.3), P(x0 * 0.85, ankle)], [H * 0.04 * look.broad, H * 0.036 * look.broad]), tint('#5a4230'));
    }
    const fx = cx + x0 * 0.85 + s * H * 0.012, fy = gy - H * 0.012;
    const footCol = o.feet === 'bare' || o.feet === 'furry' || o.feet === 'sandals' ? skin : o.feet === 'boots' ? tint('#5a4230') : tint('#6b4a2e');
    const fr = o.feet === 'furry' ? H * 0.065 : H * 0.042;
    ell(c, fx + s * fr * 0.25, fy, fr, H * 0.022, footCol);
    if (o.feet === 'furry') for (const k of [-0.4, 0, 0.4]) line(c, `M${f1(fx + s * fr * 0.25 + k * fr)},${f1(fy - H * 0.015)}l${f1(k * 3)},${f1(-H * 0.02)}`, 0.8);
    if (o.feet === 'sandals') line(c, `M${f1(fx - fr * 0.7)},${f1(fy - 2)}L${f1(fx + fr * 0.9)},${f1(fy - 2)}`, 1.2, '#6b4a2e');
  }

  // ---- The body ----
  const torso = poly([
    P(-hr * 0.38, chin - 2), P(-hr * 0.38, ys), P(-sw, ys + H * 0.015), P(-sw * 0.92, ys + H * 0.09), P(-ww, yWaist), P(-hw, yHip), P(-hw * 0.7, yHip + H * 0.05),
    P(hw * 0.7, yHip + H * 0.05), P(hw, yHip), P(ww, yWaist), P(sw * 0.92, ys + H * 0.09), P(sw, ys + H * 0.015), P(hr * 0.38, ys), P(hr * 0.38, chin - 2),
  ]);
  fill(c, torso, skin);
  // Bare arms first (sleeves are drawn over them).
  for (const arm of [armL, armR]) fill(c, limb(arm, aw), skin);

  // The garment.
  const yHem = o.body === 'none' ? yHip : -Math.max(0.015, o.hem) * H;
  const spreadK = { tunic: 0.12, robe: 0.18, gown: 0.3, wrap: 0.16, coat: 0.15, kilt: 0.2, loin: 0, chiton: 0.12, none: 0 }[o.body];
  const hemX = hw * 1.06 + o.flare * H + Math.max(0, yHem - yHip) * spreadK;
  const hemCurve = (sx: number, ex: number) => `Q${f1(cx)},${f1(gy + yHem + H * 0.03)} ${f1(cx + ex)},${f1(gy + yHem)}`;
  let garment = '';
  if (o.body === 'kilt' || o.body === 'wrap') {
    garment = `M${f1(cx - ww * 1.06)},${f1(gy + yWaist)}L${f1(cx - hw * 1.06)},${f1(gy + yHip)}L${f1(cx - hemX)},${f1(gy + yHem)}${hemCurve(-hemX, hemX)}L${f1(cx + hw * 1.06)},${f1(gy + yHip)}L${f1(cx + ww * 1.06)},${f1(gy + yWaist)}Z`;
  } else if (o.body === 'loin') {
    garment = poly([P(-hw * 1.02, yHip - H * 0.035), P(hw * 1.02, yHip - H * 0.035), P(hw * 0.95, yHip + H * 0.01), P(hw * 0.35, yHip + H * 0.02), P(hw * 0.32, yHem), P(-hw * 0.32, yHem), P(-hw * 0.35, yHip + H * 0.02), P(-hw * 0.95, yHip + H * 0.01)]);
  } else if (o.body !== 'none') {
    const sh = o.body === 'chiton' ? 0.95 : 1.03;
    garment = `M${f1(cx - hr * 0.5)},${f1(gy + ys - 1)}L${f1(cx - sw * sh)},${f1(gy + ys + H * 0.012)}L${f1(cx - sw * 0.96)},${f1(gy + ys + H * 0.1)}L${f1(cx - ww * 1.05)},${f1(gy + yWaist)}L${f1(cx - hw * 1.06)},${f1(gy + yHip)}L${f1(cx - hemX)},${f1(gy + yHem)}${hemCurve(-hemX, hemX)}L${f1(cx + hw * 1.06)},${f1(gy + yHip)}L${f1(cx + ww * 1.05)},${f1(gy + yWaist)}L${f1(cx + sw * 0.96)},${f1(gy + ys + H * 0.1)}L${f1(cx + sw * sh)},${f1(gy + ys + H * 0.012)}L${f1(cx + hr * 0.5)},${f1(gy + ys - 1)}Q${f1(cx)},${f1(gy + ys + H * 0.03)} ${f1(cx - hr * 0.5)},${f1(gy + ys - 1)}Z`;
  }
  if (garment) {
    fill(c, garment, main);
    if (o.pattern !== 'none' && o.pattern !== 'border') c.out.push(`<path d="${garment}" fill="url(#${c.id}-${o.pattern})" stroke="none" style="color:${darken(o.trim[0], 0.1)}"/>`);
    // Folds down the skirt.
    if (yHem > yHip + H * 0.06) for (const k of [-0.45, 0.1, 0.55]) line(c, `M${f1(cx + hw * k)},${f1(gy + yHip + H * 0.03)}L${f1(cx + hemX * k * 1.1)},${f1(gy + yHem)}`, 0.7, INK, 0.5);
    // A border along the hem.
    if (o.pattern === 'border' || o.jewel === 'gold') {
      const b = H * 0.025;
      fill(c, `M${f1(cx - hemX)},${f1(gy + yHem)}${hemCurve(-hemX, hemX)}L${f1(cx + hemX - 1)},${f1(gy + yHem - b)}Q${f1(cx)},${f1(gy + yHem - b + H * 0.03)} ${f1(cx - hemX + 1)},${f1(gy + yHem - b)}Z`, trim, { shade: false, sw: 0.8 });
    }
    // A wrapped coat's crossing front, a chiton's fold or a wrap's drape over the shoulder.
    if (o.body === 'coat' || o.body === 'robe') line(c, `M${f1(cx - hr * 0.4)},${f1(gy + ys)}L${f1(cx + ww * 0.55)},${f1(gy + yWaist)}${o.body === 'coat' ? `L${f1(cx + ww * 0.45)},${f1(gy + yHem)}` : ''}`, 1.4, darken(o.trim[0], 0.1));
    if (o.body === 'wrap') fill(c, poly([P(-sw * 0.85, ys), P(-sw * 0.45, ys - 1), P(ww * 1.05, yWaist + H * 0.01), P(ww * 0.6, yWaist + H * 0.04)]), main);
    if (o.body === 'chiton') line(c, `M${f1(cx - sw * 0.6)},${f1(gy + ys + H * 0.04)}Q${f1(cx)},${f1(gy + ys + H * 0.1)} ${f1(cx + sw * 0.6)},${f1(gy + ys + H * 0.04)}`, 0.8, INK, 0.6);
  }

  // Armour over the body.
  if (warrior && o.armour !== 'none' && !fungus) {
    const yb = o.armour === 'mail' || o.armour === 'lamellar' || o.armour === 'scale' ? yHip + H * 0.09 : o.armour === 'plate' ? yWaist + H * 0.02 : yHip + H * 0.02;
    const xb = hw * 1.1 + (yb - yHip) * 0.12;
    const d = poly([P(-hr * 0.5, ys), P(-sw * 1.04, ys + H * 0.01), P(-sw * 0.97, ys + H * 0.1), P(-ww * 1.08, yWaist), P(-xb, yb), P(xb, yb), P(ww * 1.08, yWaist), P(sw * 0.97, ys + H * 0.1), P(sw * 1.04, ys + H * 0.01), P(hr * 0.5, ys)]);
    const base = { mail: STEEL, scale: '#a89a6a', lamellar: tint(o.main[0], 0.1), plate: '#c8ccd2', leather: '#8a6038', quilted: tint(o.main[0], 0.3), hide: '#9a7a52', cotton: '#e6dfcc' }[o.armour];
    fill(c, d, base);
    const pat = { mail: 'mail', scale: 'scale', lamellar: 'lamellar', quilted: 'quilt', cotton: 'quilt', hide: 'dots', leather: '', plate: '' }[o.armour];
    if (pat) c.out.push(`<path d="${d}" fill="url(#${c.id}-${pat})" stroke="none" style="color:${INK}"/>`);
    if (o.armour === 'plate') {
      line(c, `M${f1(cx)},${f1(gy + ys + 2)}L${f1(cx)},${f1(gy + yb - 2)}`, 0.9);
      for (const s of [-1, 1]) ell(c, cx + s * sw * 0.98, gy + ys + H * 0.025, sw * 0.42, H * 0.035, '#c8ccd2');
    }
    if (o.armour === 'leather') for (const k of [0.35, 0.65]) line(c, `M${f1(cx - ww)},${f1(gy + ys + (yb - ys) * k)}L${f1(cx + ww)},${f1(gy + ys + (yb - ys) * k)}`, 0.8, INK, 0.6);
  }
  // Belt or sash.
  if (o.belt && garment && o.body !== 'loin') {
    const bw = o.belt === 'sash' ? H * 0.028 : H * 0.016;
    fill(c, poly([P(-ww * 1.1, yWaist - bw / 2), P(ww * 1.1, yWaist - bw / 2), P(ww * 1.1, yWaist + bw / 2), P(-ww * 1.1, yWaist + bw / 2)]), o.belt === 'sash' ? trim : tint('#5a4230'), { shade: false, sw: 0.9 });
    if (o.belt === 'sash') fill(c, poly([P(ww * 0.4, yWaist), P(ww * 0.75, yWaist), P(ww * 0.8, yWaist + H * 0.13), P(ww * 0.5, yWaist + H * 0.12)]), trim, { shade: false, sw: 0.9 });
    else ell(c, cx, gy + yWaist, H * 0.012, H * 0.01, GOLD, 0.8);
  }
  // A shawl or fur over the shoulders.
  if (o.cloak === 'shawl' || o.cloak === 'fur') {
    const col = o.cloak === 'fur' ? tint('#b8a07a') : tint(o.cloakCol[0]);
    const yb = ys + H * (o.cloak === 'fur' ? 0.06 : 0.11);
    fill(c, `M${f1(cx - sw * 1.12)},${f1(gy + ys + H * 0.03)}Q${f1(cx - sw * 0.6)},${f1(gy + ys - H * 0.02)} ${f1(cx)},${f1(gy + ys - 1)}Q${f1(cx + sw * 0.6)},${f1(gy + ys - H * 0.02)} ${f1(cx + sw * 1.12)},${f1(gy + ys + H * 0.03)}Q${f1(cx + sw * 0.5)},${f1(gy + yb)} ${f1(cx)},${f1(gy + yb + H * 0.02)}Q${f1(cx - sw * 0.5)},${f1(gy + yb)} ${f1(cx - sw * 1.12)},${f1(gy + ys + H * 0.03)}Z`, col);
    if (o.cloak === 'fur') for (let k = -4; k <= 4; k++) line(c, `M${f1(cx + k * sw * 0.24)},${f1(gy + ys + H * 0.02)}l${f1(k * 0.4)},${f1(H * 0.025)}`, 0.7, INK, 0.6);
  }
  // A mantle's drape over the left shoulder.
  if (o.cloak === 'mantle') fill(c, `M${f1(cx - sw * 1.08)},${f1(gy + ys + H * 0.01)}Q${f1(cx - sw * 0.2)},${f1(gy + ys + H * 0.02)} ${f1(cx + ww * 0.5)},${f1(gy + yWaist + H * 0.06)}L${f1(cx - hw * 0.4)},${f1(gy + yHip + H * 0.06)}Q${f1(cx - sw * 1.1)},${f1(gy + yWaist)} ${f1(cx - sw * 1.08)},${f1(gy + ys + H * 0.01)}Z`, tint(o.cloakCol[0]));

  // Sleeves.
  if (!fungus) for (const arm of [armL, armR]) {
    if (o.body === 'none' || o.body === 'loin' || o.body === 'kilt' || o.sleeves === 'none') continue;
    if (o.body === 'wrap' && o.sleeves !== 'long') continue;
    const sleeveCol = warrior && (o.armour === 'mail' || o.armour === 'lamellar' || o.armour === 'scale') && o.sleeves !== 'wide' ? null : main;
    if (o.sleeves === 'wide') {
      const s = arm[0][0] < cx ? -1 : 1;
      const hand = arm[2];
      fill(c, poly([[arm[0][0] - s * aw[0] * 0.6, arm[0][1] - aw[0] * 0.3], [arm[0][0] + s * aw[0], arm[0][1] + aw[0] * 0.2], [hand[0] + s * H * 0.06, hand[1] + H * 0.06], [hand[0] - s * H * 0.04, hand[1] + H * 0.04], [arm[1][0] - s * aw[1] * 1.2, arm[1][1]]]), main);
      continue;
    }
    const upto = o.sleeves === 'short' ? 1 : 2;
    const pts = upto === 1 ? [arm[0], lerp(arm[0], arm[1], 0.75)] : [arm[0], arm[1], lerp(arm[1], arm[2], 0.88)];
    fill(c, limb(pts, (upto === 1 ? [aw[0], aw[1]] : aw).map((w) => w * 1.12)), sleeveCol ?? STEEL);
    if (!sleeveCol) c.out.push(`<path d="${limb(pts, aw.map((w) => w * 1.12))}" fill="url(#${c.id}-mail)" stroke="none" style="color:${INK}"/>`);
  }

  // ---- Shield and weapon ----
  const lh = armL[2], rh = armR[2];
  if (warrior && o.weapon === 'bow') {
    const bx = lh[0] - H * 0.01;
    line(c, `M${f1(bx)},${f1(lh[1] - H * 0.38)}Q${f1(bx - H * 0.12)},${f1(lh[1])} ${f1(bx)},${f1(lh[1] + H * 0.3)}`, 2.6, WOOD);
    line(c, `M${f1(bx)},${f1(lh[1] - H * 0.38)}L${f1(bx)},${f1(lh[1] + H * 0.3)}`, 0.6);
  } else if (warrior && o.shield !== 'none') {
    const sx = lh[0] - H * 0.035, sy = lh[1] - H * 0.06;
    const col = tint(o.shieldCol[0]);
    const k = Math.sqrt(look.broad);
    let d = '';
    if (o.shield === 'round' || o.shield === 'small') {
      const r = (o.shield === 'small' ? H * 0.075 : H * 0.14) * k;
      circ(c, sx, sy, r, col, 1.4);
      c.shade.push(`M${f1(sx - r)},${f1(sy)}a${f1(r)},${f1(r)} 0 1,0 ${f1(2 * r)},0a${f1(r)},${f1(r)} 0 1,0 ${f1(-2 * r)},0`);
      if (o.shield === 'round') {
        line(c, `M${f1(sx - r)},${f1(sy)}L${f1(sx + r)},${f1(sy)}M${f1(sx)},${f1(sy - r)}L${f1(sx)},${f1(sy + r)}`, 2.2, trim);
        circ(c, sx, sy, r * 0.82, 'none', 0.6);
      }
      circ(c, sx, sy, r * 0.22, STEEL);
    } else {
      const w = { kite: H * 0.11, heater: H * 0.11, oval: H * 0.1, tall: H * 0.1, hide: H * 0.11 }[o.shield] * k;
      const h = { kite: H * 0.24, heater: H * 0.16, oval: H * 0.21, tall: H * 0.23, hide: H * 0.25 }[o.shield];
      if (o.shield === 'kite') d = `M${f1(sx - w)},${f1(sy - h * 0.6)}Q${f1(sx)},${f1(sy - h * 0.85)} ${f1(sx + w)},${f1(sy - h * 0.6)}Q${f1(sx + w)},${f1(sy + h * 0.2)} ${f1(sx)},${f1(sy + h)}Q${f1(sx - w)},${f1(sy + h * 0.2)} ${f1(sx - w)},${f1(sy - h * 0.6)}Z`;
      else if (o.shield === 'heater') d = `M${f1(sx - w)},${f1(sy - h * 0.7)}L${f1(sx + w)},${f1(sy - h * 0.7)}Q${f1(sx + w)},${f1(sy + h * 0.5)} ${f1(sx)},${f1(sy + h)}Q${f1(sx - w)},${f1(sy + h * 0.5)} ${f1(sx - w)},${f1(sy - h * 0.7)}Z`;
      else if (o.shield === 'tall') d = `M${f1(sx - w)},${f1(sy - h)}Q${f1(sx)},${f1(sy - h * 1.08)} ${f1(sx + w)},${f1(sy - h)}L${f1(sx + w)},${f1(sy + h)}Q${f1(sx)},${f1(sy + h * 1.08)} ${f1(sx - w)},${f1(sy + h)}Z`;
      else d = `M${f1(sx)},${f1(sy - h)}C${f1(sx + w * 1.35)},${f1(sy - h)} ${f1(sx + w * 1.35)},${f1(sy + h)} ${f1(sx)},${f1(sy + h)}C${f1(sx - w * 1.35)},${f1(sy + h)} ${f1(sx - w * 1.35)},${f1(sy - h)} ${f1(sx)},${f1(sy - h)}Z`;
      fill(c, d, o.shield === 'hide' ? tint('#d8cbb0') : col, { sw: 1.4 });
      if (o.shield === 'hide') {
        for (const [dx, dy] of [[-0.4, -0.5], [0.3, -0.1], [-0.2, 0.4], [0.4, 0.55]]) ell(c, sx + dx * w, sy + dy * h, w * 0.28, h * 0.12, tint('#5a3a2a'), 0);
        line(c, `M${f1(sx)},${f1(sy - h)}L${f1(sx)},${f1(sy + h)}`, 1.6, WOOD);
      } else if (o.shield === 'tall' || o.shield === 'oval') {
        line(c, `M${f1(sx)},${f1(sy - h * 0.9)}L${f1(sx)},${f1(sy + h * 0.9)}`, 2.2, trim);
        circ(c, sx, sy, w * 0.3, STEEL);
      } else {
        line(c, `M${f1(sx - w * 0.85)},${f1(sy - h * 0.25)}L${f1(sx + w * 0.85)},${f1(sy - h * 0.25)}M${f1(sx)},${f1(sy - h * 0.62)}L${f1(sx)},${f1(sy + h * 0.8)}`, 2.6, trim);
      }
    }
  }
  if (warrior && o.weapon && o.weapon !== 'bow') weapon(c, o, rh[0], rh[1], H, gy);

  // Hands.
  for (const h of [lh, rh]) circ(c, h[0], h[1], H * 0.026 * look.broad, skin, 1);

  // ---- The head ----
  // Ears.
  if (look.kind === 'elf') for (const s of [-1, 1]) fill(c, poly([P(s * rx * 0.9, hc - ry * 0.05), P(s * rx * 1.65, hc - ry * 0.75), P(s * rx * 0.9, hc - ry * 0.35)]), skin, { shade: false, sw: 0.9 });
  else if (look.kind === 'gnome') for (const s of [-1, 1]) fill(c, poly([P(s * rx * 0.9, hc + ry * 0.1), P(s * rx * 1.7, hc - ry * 0.4), P(s * rx * 1.5, hc + ry * 0.05), P(s * rx * 0.9, hc - ry * 0.3)]), skin, { shade: false, sw: 0.9 });
  else if (look.kind !== 'lizard') for (const s of [-1, 1]) ell(c, cx + s * rx * 0.98, gy + hc + ry * 0.02, rx * 0.16, ry * 0.22, skin, 0.9);
  // The head itself.
  if (look.kind === 'lizard') {
    fill(c, `M${f1(cx - rx * 0.95)},${f1(gy + hc - ry * 0.5)}C${f1(cx - rx * 0.9)},${f1(gy + hc - ry * 1.15)} ${f1(cx + rx * 0.9)},${f1(gy + hc - ry * 1.15)} ${f1(cx + rx * 0.95)},${f1(gy + hc - ry * 0.5)}C${f1(cx + rx * 1.1)},${f1(gy + hc + ry * 0.3)} ${f1(cx + rx * 0.7)},${f1(gy + hc + ry * 1.1)} ${f1(cx)},${f1(gy + hc + ry * 1.15)}C${f1(cx - rx * 0.7)},${f1(gy + hc + ry * 1.1)} ${f1(cx - rx * 1.1)},${f1(gy + hc + ry * 0.3)} ${f1(cx - rx * 0.95)},${f1(gy + hc - ry * 0.5)}Z`, skin);
    // A crest of spines.
    const sp: [number, number][] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, x = -rx * 0.55 + t * rx * 1.1;
      sp.push(P(x, hc - ry * 0.95 + Math.abs(t - 0.5) * ry * 0.3), P(x + rx * 0.09, hc - ry * (k % 2 ? 1.6 : 1.4) + Math.abs(t - 0.5) * ry * 0.4));
    }
    fill(c, poly([P(-rx * 0.6, hc - ry * 0.85), ...sp, P(rx * 0.6, hc - ry * 0.85)]), tint(o.trim[0]), { shade: false, sw: 0.9 });
    for (const s of [-1, 1]) {
      ell(c, cx + s * rx * 0.62, gy + hc - ry * 0.25, rx * 0.2, ry * 0.15, tint('#d8b84a', 0), 0.9);
      line(c, `M${f1(cx + s * rx * 0.62)},${f1(gy + hc - ry * 0.37)}L${f1(cx + s * rx * 0.62)},${f1(gy + hc - ry * 0.13)}`, 1.2);
      circ(c, cx + s * rx * 0.15, gy + hc + ry * 0.7, 0.9, INK, 0);
    }
    line(c, `M${f1(cx - rx * 0.55)},${f1(gy + hc + ry * 0.92)}Q${f1(cx)},${f1(gy + hc + ry * 1.0)} ${f1(cx + rx * 0.55)},${f1(gy + hc + ry * 0.92)}`, 0.9);
    // Scales.
    c.out.push(`<path d="${poly([P(-rx * 0.8, hc - ry * 0.6), P(rx * 0.8, hc - ry * 0.6), P(rx * 0.8, hc + ry), P(-rx * 0.8, hc + ry)])}" fill="url(#${c.id}-scale)" stroke="none" style="color:${INK}" opacity="0.45"/>`);
  } else {
    ell(c, cx, gy + hc, rx, ry, skin);
    c.shade.push(`M${f1(cx - rx)},${f1(gy + hc)}a${f1(rx)},${f1(ry)} 0 1,0 ${f1(2 * rx)},0a${f1(rx)},${f1(ry)} 0 1,0 ${f1(-2 * rx)},0`);
    // The face.
    const ey = gy + hc - ry * 0.02;
    for (const s of [-1, 1]) {
      const r = look.kind === 'gnome' ? hr * 0.12 : hr * 0.065;
      circ(c, cx + s * rx * 0.36, ey, r, INK, 0);
      line(c, `M${f1(cx + s * rx * 0.18)},${f1(ey - ry * (look.kind === 'orc' ? 0.16 : 0.2))}L${f1(cx + s * rx * 0.55)},${f1(ey - ry * (look.kind === 'orc' ? 0.12 : 0.24))}`, look.kind === 'orc' ? 1.6 : 0.8);
    }
    if (look.kind === 'gnome') ell(c, cx, ey + ry * 0.32, rx * 0.22, ry * 0.26, darken(skin, 0.05), 0.9);
    else line(c, `M${f1(cx)},${f1(ey + ry * 0.05)}L${f1(cx - rx * 0.08)},${f1(ey + ry * 0.36)}L${f1(cx + rx * 0.06)},${f1(ey + ry * 0.4)}`, 0.8);
    line(c, `M${f1(cx - rx * 0.22)},${f1(gy + hc + ry * 0.6)}Q${f1(cx)},${f1(gy + hc + ry * 0.66)} ${f1(cx + rx * 0.22)},${f1(gy + hc + ry * 0.6)}`, 0.8);
    if (look.kind === 'orc') for (const s of [-1, 1]) fill(c, poly([P(s * rx * 0.3, hc + ry * 0.63), P(s * rx * 0.42, hc + ry * 0.3), P(s * rx * 0.46, hc + ry * 0.64)]), '#f2ead8', { shade: false, sw: 0.8 });
    // Face paint, tattoos and scars.
    if (look.paint === 'paint') line(c, `M${f1(cx - rx * 0.85)},${f1(ey)}L${f1(cx + rx * 0.85)},${f1(ey)}`, ry * 0.22, f.role === 'Warrior' ? '#9e2b25' : '#2b2b2b', 0.55);
    if (look.paint === 'tattoo') {
      line(c, `M${f1(cx - rx * 0.55)},${f1(ey + ry * 0.2)}q${f1(rx * 0.12)},${f1(ry * 0.25)} ${f1(rx * 0.05)},${f1(ry * 0.45)}M${f1(cx + rx * 0.55)},${f1(ey + ry * 0.2)}q${f1(-rx * 0.12)},${f1(ry * 0.25)} ${f1(-rx * 0.05)},${f1(ry * 0.45)}`, 0.9, '#2b4a7a', 0.8);
      for (const arm of [armL, armR]) line(c, `M${f1(arm[0][0])},${f1(arm[0][1] + 4)}L${f1(arm[1][0])},${f1(arm[1][1])}`, 1.4, '#2b4a7a', 0.5);
    }
    if (look.paint === 'scars') line(c, `M${f1(cx + rx * 0.35)},${f1(ey + ry * 0.12)}l${f1(rx * 0.25)},${f1(ry * 0.35)}M${f1(cx + rx * 0.45)},${f1(ey + ry * 0.1)}l${f1(rx * 0.25)},${f1(ry * 0.35)}`, 0.9, '#e6dccb');
  }
  // Beard.
  if (f.beard !== 'none' && f.hair[1] !== 'none' || (f.beard !== 'none' && look.kind === 'dwarf')) {
    const bc = f.hair[1] === 'none' ? tint('#9b9a96') : hairCol;
    const len = { short: 0.3, full: 0.65, long: 1.5, braided: 1.5, forked: 1.4, moustache: 0, none: 0 }[f.beard] * hr * (look.kind === 'dwarf' ? 1.8 : 1);
    if (f.beard === 'moustache') fill(c, `M${f1(cx - rx * 0.45)},${f1(gy + hc + ry * 0.62)}Q${f1(cx)},${f1(gy + hc + ry * 0.35)} ${f1(cx + rx * 0.45)},${f1(gy + hc + ry * 0.62)}Q${f1(cx)},${f1(gy + hc + ry * 0.5)} ${f1(cx - rx * 0.45)},${f1(gy + hc + ry * 0.62)}Z`, bc, { shade: false, sw: 0.8 });
    else {
      const by = gy + chin + len;
      const jy = gy + hc + ry * 0.05, my = by - len * 0.3;
      const bottom = f.beard === 'forked'
        ? `L${f1(cx - rx * 0.3)},${f1(by)}L${f1(cx)},${f1(my)}L${f1(cx + rx * 0.3)},${f1(by)}L${f1(cx + rx * 0.4)},${f1(my)}`
        : `Q${f1(cx)},${f1(by + len * 0.2)} ${f1(cx + rx * 0.4)},${f1(my)}`;
      fill(c, `M${f1(cx - rx * 0.92)},${f1(jy)}Q${f1(cx - rx * 0.95)},${f1(gy + chin)} ${f1(cx - rx * 0.4)},${f1(my)}${bottom}Q${f1(cx + rx * 0.95)},${f1(gy + chin)} ${f1(cx + rx * 0.92)},${f1(jy)}Q${f1(cx + rx * 0.5)},${f1(gy + hc + ry * 0.75)} ${f1(cx)},${f1(gy + hc + ry * 0.45)}Q${f1(cx - rx * 0.5)},${f1(gy + hc + ry * 0.75)} ${f1(cx - rx * 0.92)},${f1(jy)}Z`, bc, { shade: false, sw: 0.9 });
      for (const k of [-0.25, 0, 0.25]) line(c, `M${f1(cx + k * rx)},${f1(gy + chin)}L${f1(cx + k * rx * 0.8)},${f1(by - 3)}`, 0.6, INK, 0.5);
      if (f.beard === 'braided') for (const k of [0.3, 0.55, 0.8]) ell(c, cx, gy + chin + len * k, rx * 0.16, hr * 0.08, GOLD, 0.6);
    }
  }
  // Hair on top of the head.
  if (hasHair && !helmed && headwear !== 'hood' && headwear !== 'veil' && headwear !== 'turban' && headwear !== 'furhat' && headwear !== 'kerchief') {
    const top = gy + hc - ry;
    if (f.hairStyle === 'crest') fill(c, `M${f1(cx - rx * 0.18)},${f1(top + ry * 0.3)}Q${f1(cx - rx * 0.2)},${f1(top - ry * 0.45)} ${f1(cx)},${f1(top - ry * 0.5)}Q${f1(cx + rx * 0.2)},${f1(top - ry * 0.45)} ${f1(cx + rx * 0.18)},${f1(top + ry * 0.3)}Z`, hairCol, { shade: false, sw: 0.9 });
    else {
      const fringe = f.hairStyle === 'curly' ? 0.5 : 0.42;
      fill(c, `M${f1(cx - rx * 1.02)},${f1(gy + hc + ry * 0.05)}C${f1(cx - rx * 1.1)},${f1(top - ry * 0.35)} ${f1(cx + rx * 1.1)},${f1(top - ry * 0.35)} ${f1(cx + rx * 1.02)},${f1(gy + hc + ry * 0.05)}L${f1(cx + rx * 0.82)},${f1(gy + hc - ry * fringe)}Q${f1(cx)},${f1(gy + hc - ry * (fringe + 0.2))} ${f1(cx - rx * 0.82)},${f1(gy + hc - ry * fringe)}Z`, hairCol, { shade: false, sw: 0.9 });
      if (f.hairStyle === 'curly') for (let k = -2; k <= 2; k++) circ(c, cx + k * rx * 0.42, top + ry * 0.1 + Math.abs(k) * ry * 0.18, hr * 0.22, hairCol, 0.7);
      if (f.hairStyle === 'topknot') {
        circ(c, cx, top - hr * 0.15, hr * 0.3, hairCol, 0.9);
        line(c, `M${f1(cx - hr * 0.45)},${f1(top - hr * 0.15)}L${f1(cx + hr * 0.45)},${f1(top - hr * 0.15)}`, 1, GOLD);
      }
    }
    if (f.hairStyle === 'braids') for (const s of [-1, 1]) {
      fill(c, limb([P(s * rx * 0.95, hc + ry * 0.2), P(s * rx * 1.05, ys + H * 0.02), P(s * rx * 0.9, ys + H * (f.female ? 0.14 : 0.08))], [hr * 0.2, hr * 0.17, hr * 0.12]), hairCol, { shade: false, sw: 0.8 });
      for (const k of [0.3, 0.6]) line(c, `M${f1(cx + s * rx * 0.85)},${f1(gy + ys + H * 0.1 * k)}l${f1(s * hr * 0.3)},${f1(hr * 0.1)}`, 0.6, INK, 0.6);
    }
  }
  // Headgear or helm.
  if (warrior) helm(c, o, cx, gy, hc, rx, ry, hr);
  else hat(c, o, cx, gy, hc, rx, ry, hr, hairCol);
  // Jewellery at the neck.
  if (o.jewel === 'torc') line(c, `M${f1(cx - hr * 0.55)},${f1(gy + ys - 1)}Q${f1(cx)},${f1(gy + ys + hr * 0.5)} ${f1(cx + hr * 0.55)},${f1(gy + ys - 1)}`, 2.4, GOLD);
  if (o.jewel === 'chain' || o.jewel === 'gold' || o.jewel === 'pendant') {
    line(c, `M${f1(cx - hr * 0.7)},${f1(gy + ys + 1)}Q${f1(cx)},${f1(gy + ys + H * 0.1)} ${f1(cx + hr * 0.7)},${f1(gy + ys + 1)}`, 1.4, GOLD);
    circ(c, cx, gy + ys + H * 0.06, H * 0.012, GOLD, 0.8);
  }
  if (o.jewel === 'beads' || o.jewel === 'jade' || o.jewel === 'collar') {
    const col = o.jewel === 'jade' ? tint('#5a9a72', 0) : o.jewel === 'collar' ? '#f2ead8' : tint('#b8462e', 0);
    for (let k = -3; k <= 3; k++) circ(c, cx + k * hr * 0.22, gy + ys + H * 0.012 + (9 - k * k) * 0.0 + Math.abs(k) * -0.6 + 3, hr * 0.12, col, 0.6);
  }
}

/** One of the fungus folk: a thick stalk with a ring, root-feet, tendril arms and a broad cap. */
function fungusFigure(c: Ctx, f: Figure, cx: number, gy: number, H: number, hr: number, sw: number, ys: number, yWaist: number): void {
  const o = f.outfit;
  const skin = tint(f.skin[0], 0.1);
  const capY = -H + hr * 2.2;
  const neck = hr * 0.75, base = sw * 1.05;
  // Root-feet.
  for (const k of [-1, -0.35, 0.35, 1]) fill(c, limb([[cx + k * base * 0.7, gy - H * 0.04], [cx + k * base * 1.15, gy - H * 0.005]], [H * 0.022, H * 0.01]), skin);
  // The stalk, swelling to a bulb at the foot.
  const stalk = `M${f1(cx - neck)},${f1(gy + capY)}C${f1(cx - neck * 1.1)},${f1(gy + yWaist)} ${f1(cx - base * 0.8)},${f1(gy - H * 0.3)} ${f1(cx - base)},${f1(gy - H * 0.1)}Q${f1(cx - base * 1.05)},${f1(gy - H * 0.01)} ${f1(cx)},${f1(gy - H * 0.01)}Q${f1(cx + base * 1.05)},${f1(gy - H * 0.01)} ${f1(cx + base)},${f1(gy - H * 0.1)}C${f1(cx + base * 0.8)},${f1(gy - H * 0.3)} ${f1(cx + neck * 1.1)},${f1(gy + yWaist)} ${f1(cx + neck)},${f1(gy + capY)}Z`;
  fill(c, stalk, skin);
  for (const k of [-0.4, 0, 0.4]) line(c, `M${f1(cx + k * neck)},${f1(gy + ys + H * 0.1)}Q${f1(cx + k * base * 0.8)},${f1(gy - H * 0.25)} ${f1(cx + k * base * 0.9)},${f1(gy - H * 0.05)}`, 0.6, INK, 0.45);
  // The ring, hanging like a short skirt.
  const ry0 = gy + ys + H * 0.06;
  fill(c, `M${f1(cx - neck * 1.05)},${f1(ry0)}Q${f1(cx)},${f1(ry0 - H * 0.02)} ${f1(cx + neck * 1.05)},${f1(ry0)}L${f1(cx + neck * 1.9)},${f1(ry0 + H * 0.08)}Q${f1(cx)},${f1(ry0 + H * 0.11)} ${f1(cx - neck * 1.9)},${f1(ry0 + H * 0.08)}Z`, tint('#f2ead8', 0.05));
  for (let k = -3; k <= 3; k++) line(c, `M${f1(cx + k * neck * 0.3)},${f1(ry0 + 2)}L${f1(cx + k * neck * 0.55)},${f1(ry0 + H * 0.09)}`, 0.5, INK, 0.5);
  // Tendril arms.
  const yA = ry0 + H * 0.05;
  const armL: [number, number][] = [[cx - neck * 0.9, yA], [cx - sw * 1.0, gy + yWaist + H * 0.02], [cx - sw * 1.15, gy + yWaist + H * 0.12]];
  const armR: [number, number][] = f.role === 'Warrior'
    ? [[cx + neck * 0.9, yA], [cx + sw * 1.05, gy + yWaist + H * 0.01], [cx + sw * 1.35, gy + yWaist - H * 0.02]]
    : [[cx + neck * 0.9, yA], [cx + sw * 1.0, gy + yWaist + H * 0.02], [cx + sw * 1.15, gy + yWaist + H * 0.12]];
  for (const arm of [armL, armR]) fill(c, limb(arm, [H * 0.02, H * 0.016, H * 0.008]), skin);
  if (f.role === 'Warrior' && o.weapon) weapon(c, o, armR[2][0], armR[2][1], H, gy);
  // The cap, with gills beneath and pale spots.
  const capW = hr * 2.4, capH = hr * 1.6;
  fill(c, `M${f1(cx - capW)},${f1(gy + capY)}C${f1(cx - capW)},${f1(gy + capY - capH * 1.3)} ${f1(cx + capW)},${f1(gy + capY - capH * 1.3)} ${f1(cx + capW)},${f1(gy + capY)}Q${f1(cx)},${f1(gy + capY + hr * 0.5)} ${f1(cx - capW)},${f1(gy + capY)}Z`, tint(o.main[0]));
  for (let k = -3; k <= 3; k++) line(c, `M${f1(cx + k * capW * 0.25)},${f1(gy + capY + hr * 0.15)}L${f1(cx + k * capW * 0.12)},${f1(gy + capY + hr * 0.35)}`, 0.6, INK, 0.6);
  for (const [dx, dy, r] of [[-0.5, -0.5, 0.18], [0.2, -0.8, 0.14], [0.55, -0.35, 0.16], [-0.1, -0.3, 0.1]]) circ(c, cx + dx * capW, gy + capY + dy * capH, r * hr * 1.6, '#f2ead8', 0.6);
  for (const s of [-1, 1]) circ(c, cx + s * hr * 0.3, gy + capY + hr * 0.75, hr * 0.09, INK, 0);
  if (o.jewel) {
    line(c, `M${f1(cx - neck)},${f1(gy + capY + hr * 1.1)}Q${f1(cx)},${f1(gy + capY + hr * 1.9)} ${f1(cx + neck)},${f1(gy + capY + hr * 1.1)}`, 1, GOLD);
    circ(c, cx, gy + capY + hr * 1.7, H * 0.016, tint('#7a9a6a'), 0.8);
  }
}

/** A warrior's weapon, held upright in the right hand at (hx, hy). */
function weapon(c: Ctx, o: Outfit, hx: number, hy: number, H: number, gy: number): void {
  const w = o.weapon!;
  if (w === 'spear' || w === 'glaive' || w === 'halberd' || w === 'trident' || w === 'staff') {
    const top = gy - H * (w === 'staff' ? 1.02 : 1.1);
    line(c, `M${f1(hx)},${f1(gy - 1)}L${f1(hx)},${f1(top)}`, 2.4, WOOD);
    if (w === 'spear') fill(c, `M${f1(hx)},${f1(top - H * 0.09)}Q${f1(hx + H * 0.025)},${f1(top - H * 0.03)} ${f1(hx)},${f1(top + 2)}Q${f1(hx - H * 0.025)},${f1(top - H * 0.03)} ${f1(hx)},${f1(top - H * 0.09)}Z`, STEEL, { shade: false });
    if (w === 'glaive') fill(c, `M${f1(hx - 1)},${f1(top + 4)}Q${f1(hx + H * 0.07)},${f1(top - H * 0.04)} ${f1(hx + H * 0.01)},${f1(top - H * 0.14)}Q${f1(hx + H * 0.025)},${f1(top - H * 0.04)} ${f1(hx - 1)},${f1(top - H * 0.02)}Z`, STEEL, { shade: false });
    if (w === 'halberd') {
      fill(c, `M${f1(hx)},${f1(top + H * 0.02)}L${f1(hx + H * 0.07)},${f1(top - H * 0.01)}Q${f1(hx + H * 0.08)},${f1(top + H * 0.05)} ${f1(hx + H * 0.06)},${f1(top + H * 0.09)}L${f1(hx)},${f1(top + H * 0.07)}Z`, STEEL, { shade: false });
      fill(c, poly([[hx - 1.5, top + 2], [hx, top - H * 0.08], [hx + 1.5, top + 2]]), STEEL, { shade: false });
      fill(c, poly([[hx, top + H * 0.035], [hx - H * 0.04, top + H * 0.045], [hx, top + H * 0.055]]), STEEL, { shade: false });
    }
    if (w === 'trident') {
      line(c, `M${f1(hx - H * 0.03)},${f1(top - H * 0.06)}L${f1(hx - H * 0.03)},${f1(top)}L${f1(hx + H * 0.03)},${f1(top)}L${f1(hx + H * 0.03)},${f1(top - H * 0.06)}M${f1(hx)},${f1(top)}L${f1(hx)},${f1(top - H * 0.08)}`, 1.8, DARKSTEEL);
    }
    if (w === 'staff') circ(c, hx, top, H * 0.02, tint('#7a9a6a'), 1);
    return;
  }
  if (w === 'sword' || w === 'scimitar' || w === 'katana') {
    line(c, `M${f1(hx)},${f1(hy + H * 0.04)}L${f1(hx)},${f1(hy - H * 0.02)}`, 2.6, '#5a3a2a');
    circ(c, hx, hy + H * 0.045, H * 0.01, GOLD, 0.8);
    if (w !== 'katana') line(c, `M${f1(hx - H * 0.035)},${f1(hy - H * 0.022)}L${f1(hx + H * 0.035)},${f1(hy - H * 0.022)}`, 2.2, GOLD);
    else ell(c, hx, hy - H * 0.022, H * 0.016, H * 0.006, GOLD, 0.8);
    const len = w === 'katana' ? H * 0.36 : H * 0.32;
    if (w === 'sword') fill(c, poly([[hx - H * 0.01, hy - H * 0.025], [hx + H * 0.01, hy - H * 0.025], [hx + H * 0.007, hy - len], [hx, hy - len - H * 0.025], [hx - H * 0.007, hy - len]]), STEEL, { shade: false });
    else {
      const bend = w === 'scimitar' ? H * 0.07 : H * 0.03;
      fill(c, `M${f1(hx - H * 0.009)},${f1(hy - H * 0.025)}Q${f1(hx - H * 0.01)},${f1(hy - len * 0.6)} ${f1(hx + bend)},${f1(hy - len)}Q${f1(hx + H * 0.025)},${f1(hy - len * 0.55)} ${f1(hx + H * 0.009)},${f1(hy - H * 0.025)}Z`, STEEL, { shade: false });
    }
    return;
  }
  // Hafted weapons: axe, hammer, pick, club and the obsidian-edged sword.
  const top = hy - H * 0.33, bottom = hy + H * 0.07;
  if (w === 'club' || w === 'macuahuitl') {
    const wd = w === 'macuahuitl' ? H * 0.028 : H * 0.022;
    fill(c, poly([[hx - H * 0.01, bottom], [hx + H * 0.01, bottom], [hx + wd, top + H * 0.03], [hx, top - H * 0.01], [hx - wd, top + H * 0.03]]), tint(WOOD, 0.1), { shade: false });
    if (w === 'macuahuitl') for (let k = 0; k < 6; k++) for (const s of [-1, 1]) {
      const y = top + H * 0.04 + k * H * 0.04;
      fill(c, poly([[hx + s * wd * 0.9, y], [hx + s * (wd + H * 0.018), y + H * 0.012], [hx + s * wd * 0.9, y + H * 0.024]]), '#2b2b30', { shade: false, sw: 0.5 });
    }
    return;
  }
  line(c, `M${f1(hx)},${f1(bottom)}L${f1(hx)},${f1(top)}`, 2.6, WOOD);
  if (w === 'axe') fill(c, `M${f1(hx)},${f1(top + H * 0.01)}L${f1(hx + H * 0.05)},${f1(top - H * 0.03)}Q${f1(hx + H * 0.085)},${f1(top + H * 0.035)} ${f1(hx + H * 0.05)},${f1(top + H * 0.1)}L${f1(hx)},${f1(top + H * 0.06)}Z`, STEEL, { shade: false });
  if (w === 'hammer') fill(c, poly([[hx - H * 0.045, top - H * 0.01], [hx + H * 0.045, top - H * 0.01], [hx + H * 0.045, top + H * 0.045], [hx - H * 0.045, top + H * 0.045]]), DARKSTEEL, { shade: false });
  if (w === 'pick') fill(c, `M${f1(hx - H * 0.07)},${f1(top + H * 0.04)}Q${f1(hx)},${f1(top - H * 0.02)} ${f1(hx + H * 0.07)},${f1(top + H * 0.04)}Q${f1(hx)},${f1(top + H * 0.015)} ${f1(hx - H * 0.07)},${f1(top + H * 0.04)}Z`, DARKSTEEL, { shade: false });
}

/** A commoner's or noble's headgear. */
function hat(c: Ctx, o: Outfit, cx: number, gy: number, hc: number, rx: number, ry: number, hr: number, hairCol: string): void {
  const top = gy + hc - ry;
  const y = (k: number) => f1(gy + hc + ry * k);
  const x = (k: number) => f1(cx + rx * k);
  const col = tint(o.trim[0]);
  switch (o.head) {
    case 'hood':
    case 'veil':
      // The front edge of the hood about the face.
      line(c, `M${x(-1.02)},${y(0.5)}C${x(-1.15)},${y(-1.25)} ${x(1.15)},${y(-1.25)} ${x(1.02)},${y(0.5)}`, 1.1);
      if (o.head === 'veil') line(c, `M${x(-1.0)},${y(-0.55)}Q${f1(cx)},${y(-0.75)} ${x(1.0)},${y(-0.55)}`, 1.6, GOLD);
      break;
    case 'cap':
      fill(c, `M${x(-1.0)},${y(-0.35)}C${x(-1.0)},${y(-1.5)} ${x(1.0)},${y(-1.5)} ${x(1.0)},${y(-0.35)}Q${f1(cx)},${y(-0.5)} ${x(-1.0)},${y(-0.35)}Z`, col, { shade: false });
      break;
    case 'kerchief':
      fill(c, `M${x(-1.08)},${y(0.1)}C${x(-1.2)},${y(-1.45)} ${x(1.2)},${y(-1.45)} ${x(1.08)},${y(0.1)}L${x(0.85)},${y(-0.4)}Q${f1(cx)},${y(-0.62)} ${x(-0.85)},${y(-0.4)}Z`, col, { shade: false });
      break;
    case 'turban':
      fill(c, `M${x(-1.15)},${y(-0.3)}C${x(-1.4)},${y(-1.75)} ${x(1.4)},${y(-1.75)} ${x(1.15)},${y(-0.3)}Q${f1(cx)},${y(-0.5)} ${x(-1.15)},${y(-0.3)}Z`, col, { shade: false });
      for (const k of [-0.65, -1.0]) line(c, `M${x(-1.05)},${y(k + 0.25)}Q${f1(cx)},${y(k - 0.45)} ${x(1.1)},${y(k)}`, 0.7, INK, 0.7);
      break;
    case 'furhat':
      fill(c, poly([[cx - rx * 1.1, gy + hc - ry * 0.35], [cx - rx * 1.0, top - ry * 0.7], [cx + rx * 1.0, top - ry * 0.7], [cx + rx * 1.1, gy + hc - ry * 0.35]]), tint('#8a6a4a'), { shade: false });
      fill(c, poly([[cx - rx * 1.18, gy + hc - ry * 0.25], [cx - rx * 1.18, gy + hc - ry * 0.65], [cx + rx * 1.18, gy + hc - ry * 0.65], [cx + rx * 1.18, gy + hc - ry * 0.25]]), tint('#c8b48a'), { shade: false, sw: 0.9 });
      break;
    case 'circlet':
    case 'diadem':
      line(c, `M${x(-1.0)},${y(-0.5)}Q${f1(cx)},${y(-0.68)} ${x(1.0)},${y(-0.5)}`, 1.6, GOLD);
      if (o.head === 'diadem') fill(c, poly([[cx - rx * 0.18, gy + hc - ry * 0.6], [cx, gy + hc - ry * 1.05], [cx + rx * 0.18, gy + hc - ry * 0.6]]), GOLD, { shade: false, sw: 0.7 });
      circ(c, cx, gy + hc - ry * 0.6, hr * 0.1, tint(o.main[0], 0), 0.6);
      break;
    case 'crown': {
      const pts: [number, number][] = [[cx - rx * 0.95, gy + hc - ry * 0.55]];
      for (let k = 0; k <= 4; k++) pts.push([cx - rx * 0.95 + k * rx * 0.475, gy + hc - ry * (k % 2 ? 1.05 : 1.35)]);
      pts.push([cx + rx * 0.95, gy + hc - ry * 0.55]);
      fill(c, poly(pts), GOLD, { shade: false });
      break;
    }
    case 'conical':
      fill(c, poly([[cx - rx * 1.25, gy + hc - ry * 0.45], [cx, top - ry * 1.2], [cx + rx * 1.25, gy + hc - ry * 0.45]]), col, { shade: false });
      fill(c, poly([[cx - rx * 1.3, gy + hc - ry * 0.35], [cx - rx * 1.3, gy + hc - ry * 0.6], [cx + rx * 1.3, gy + hc - ry * 0.6], [cx + rx * 1.3, gy + hc - ry * 0.35]]), tint('#c8b48a'), { shade: false, sw: 0.9 });
      break;
    case 'tallhat':
      ell(c, cx, gy + hc - ry * 0.55, rx * 1.9, ry * 0.18, tint('#2b2b30', 0.35), 0.9);
      fill(c, poly([[cx - rx * 0.62, gy + hc - ry * 0.6], [cx - rx * 0.55, top - ry * 0.85], [cx + rx * 0.55, top - ry * 0.85], [cx + rx * 0.62, gy + hc - ry * 0.6]]), tint('#2b2b30', 0.3), { shade: false });
      break;
    case 'wide':
      fill(c, `M${x(-2.1)},${y(-0.45)}Q${f1(cx)},${y(-1.9)} ${x(2.1)},${y(-0.45)}Q${f1(cx)},${y(-0.65)} ${x(-2.1)},${y(-0.45)}Z`, tint('#d8bf7a'), { shade: false });
      break;
    case 'fez':
      fill(c, poly([[cx - rx * 0.9, gy + hc - ry * 0.45], [cx - rx * 0.8, top - ry * 0.35], [cx + rx * 0.8, top - ry * 0.35], [cx + rx * 0.9, gy + hc - ry * 0.45]]), col, { shade: false });
      line(c, `M${x(-0.85)},${y(-0.8)}L${x(0.85)},${y(-0.8)}`, 1.2, GOLD);
      break;
    case 'feathers':
      for (const k of [-1, 1]) fill(c, `M${f1(cx + k * rx * 0.3)},${f1(top + ry * 0.2)}Q${f1(cx + k * rx * 0.9)},${f1(top - ry * 0.9)} ${f1(cx + k * rx * 0.55)},${f1(top - ry * 1.6)}Q${f1(cx + k * rx * 0.25)},${f1(top - ry * 0.8)} ${f1(cx + k * rx * 0.3)},${f1(top + ry * 0.2)}Z`, k < 0 ? tint('#e8e2d2', 0) : col, { shade: false, sw: 0.8 });
      line(c, `M${x(-1.0)},${y(-0.5)}Q${f1(cx)},${y(-0.68)} ${x(1.0)},${y(-0.5)}`, 1.8, col);
      break;
    case 'headdress': {
      const n = 9;
      for (let k = 0; k < n; k++) {
        const a = Math.PI * (0.12 + (0.76 * k) / (n - 1));
        const len = ry * 2.3;
        const bx = cx - Math.cos(a) * rx * 0.9, by = gy + hc - ry * 0.55 - Math.sin(a) * ry * 0.4;
        const ex = cx - Math.cos(a) * (rx + len), ey = gy + hc - ry * 0.55 - Math.sin(a) * len;
        const mx = (bx + ex) / 2, my = (by + ey) / 2, nx = -(ey - by) * 0.18, ny = (ex - bx) * 0.18;
        fill(c, `M${f1(bx)},${f1(by)}Q${f1(mx + nx)},${f1(my + ny)} ${f1(ex)},${f1(ey)}Q${f1(mx - nx)},${f1(my - ny)} ${f1(bx)},${f1(by)}Z`, k % 2 ? tint('#2e7a6b', 0.1) : col, { shade: false, sw: 0.7 });
      }
      fill(c, `M${x(-1.05)},${y(-0.4)}Q${f1(cx)},${y(-1.0)} ${x(1.05)},${y(-0.4)}L${x(1.0)},${y(-0.7)}Q${f1(cx)},${y(-1.25)} ${x(-1.0)},${y(-0.7)}Z`, GOLD, { shade: false, sw: 0.9 });
      break;
    }
    case 'wreath':
      for (let k = -4; k <= 4; k++) {
        const t = k / 4, px = cx + t * rx * 0.95, py = gy + hc - ry * (0.58 + (1 - t * t) * 0.12);
        ell(c, px, py, rx * 0.14, ry * 0.08, tint('#5a7a3a', 0.1), 0.6);
      }
      break;
    default:
      void hairCol;
  }
}

/** A warrior's helm. */
function helm(c: Ctx, o: Outfit, cx: number, gy: number, hc: number, rx: number, ry: number, hr: number): void {
  const y = (k: number) => f1(gy + hc + ry * k);
  const x = (k: number) => f1(cx + rx * k);
  const dome = (h = 1.45, col = STEEL) => fill(c, `M${x(-1.08)},${y(-0.25)}C${x(-1.1)},${y(-h)} ${x(1.1)},${y(-h)} ${x(1.08)},${y(-0.25)}Q${f1(cx)},${y(-0.4)} ${x(-1.08)},${y(-0.25)}Z`, col, { shade: false });
  switch (o.helm) {
    case 'nasal':
      fill(c, `M${x(-1.08)},${y(-0.25)}C${x(-1.05)},${y(-1.1)} ${x(-0.2)},${y(-1.75)} ${f1(cx)},${y(-1.85)}C${x(0.2)},${y(-1.75)} ${x(1.05)},${y(-1.1)} ${x(1.08)},${y(-0.25)}Q${f1(cx)},${y(-0.4)} ${x(-1.08)},${y(-0.25)}Z`, STEEL, { shade: false });
      fill(c, poly([[cx - rx * 0.09, gy + hc - ry * 0.35], [cx + rx * 0.09, gy + hc - ry * 0.35], [cx + rx * 0.08, gy + hc + ry * 0.3], [cx - rx * 0.08, gy + hc + ry * 0.3]]), STEEL, { shade: false, sw: 0.8 });
      break;
    case 'domed':
    case 'spangen':
      dome();
      if (o.helm === 'spangen') {
        for (const s of [-1, 1]) ell(c, cx + s * rx * 0.36, gy + hc - ry * 0.05, rx * 0.3, ry * 0.2, 'none', 1.4, DARKSTEEL);
        line(c, `M${f1(cx)},${y(-0.3)}L${f1(cx)},${y(0.25)}`, 1.6, DARKSTEEL);
      }
      line(c, `M${f1(cx)},${y(-1.25)}L${f1(cx)},${y(-0.32)}`, 0.8);
      break;
    case 'spiked':
      dome(1.5);
      fill(c, poly([[cx - rx * 0.16, gy + hc - ry * 1.3], [cx, gy + hc - ry * 2.1], [cx + rx * 0.16, gy + hc - ry * 1.3]]), STEEL, { shade: false, sw: 0.9 });
      break;
    case 'kettle':
      dome(1.4);
      fill(c, `M${x(-1.8)},${y(-0.3)}Q${f1(cx)},${y(-0.6)} ${x(1.8)},${y(-0.3)}Q${f1(cx)},${y(-0.15)} ${x(-1.8)},${y(-0.3)}Z`, STEEL, { shade: false });
      break;
    case 'great':
      fill(c, poly([[cx - rx * 1.12, gy + hc + ry * 0.95], [cx - rx * 1.15, gy + hc - ry * 1.15], [cx + rx * 1.15, gy + hc - ry * 1.15], [cx + rx * 1.12, gy + hc + ry * 0.95]]), STEEL, { shade: false });
      line(c, `M${x(-0.9)},${y(-0.12)}L${x(0.9)},${y(-0.12)}`, 2.2, INK);
      line(c, `M${f1(cx)},${y(0.1)}L${f1(cx)},${y(0.85)}`, 0.9);
      for (const k of [0.3, 0.5, 0.7]) circ(c, cx + rx * 0.4, gy + hc + ry * k, 0.8, INK, 0);
      break;
    case 'crested':
    case 'plumed':
      dome(1.45);
      for (const s of [-1, 1]) fill(c, poly([[cx + s * rx * 1.05, gy + hc - ry * 0.3], [cx + s * rx * 1.08, gy + hc + ry * 0.55], [cx + s * rx * 0.75, gy + hc + ry * 0.4], [cx + s * rx * 0.7, gy + hc - ry * 0.3]]), STEEL, { shade: false, sw: 0.8 });
      if (o.helm === 'crested') fill(c, `M${x(-0.25)},${y(-1.2)}Q${x(-0.4)},${y(-2.3)} ${f1(cx)},${y(-2.35)}Q${x(0.4)},${y(-2.3)} ${x(0.25)},${y(-1.2)}Z`, tint('#9e2b25', 0.1), { shade: false });
      else fill(c, `M${f1(cx)},${y(-1.2)}Q${x(0.2)},${y(-2.3)} ${x(1.4)},${y(-2.0)}Q${x(0.6)},${y(-1.75)} ${x(0.2)},${y(-1.15)}Z`, tint(o.trim[0], 0.1), { shade: false });
      break;
    case 'kabuto':
      dome(1.4, tint('#3a3530', 0.2));
      fill(c, `M${x(-1.08)},${y(-0.35)}Q${x(-1.9)},${y(-0.1)} ${x(-2.0)},${y(0.45)}L${x(-1.0)},${y(0.25)}Z`, tint(o.main[0]), { shade: false, sw: 0.9 });
      fill(c, `M${x(1.08)},${y(-0.35)}Q${x(1.9)},${y(-0.1)} ${x(2.0)},${y(0.45)}L${x(1.0)},${y(0.25)}Z`, tint(o.main[0]), { shade: false, sw: 0.9 });
      line(c, `M${x(-0.9)},${y(-2.0)}Q${f1(cx)},${y(-0.9)} ${x(0.9)},${y(-2.0)}`, 2.2, GOLD);
      break;
    case 'turban':
      dome(1.5, STEEL);
      fill(c, `M${x(-1.15)},${y(-0.3)}Q${f1(cx)},${y(-0.55)} ${x(1.15)},${y(-0.3)}L${x(1.12)},${y(-0.75)}Q${f1(cx)},${y(-1.0)} ${x(-1.12)},${y(-0.75)}Z`, tint(o.trim[0]), { shade: false });
      fill(c, poly([[cx - rx * 0.1, gy + hc - ry * 1.3], [cx, gy + hc - ry * 1.85], [cx + rx * 0.1, gy + hc - ry * 1.3]]), STEEL, { shade: false, sw: 0.8 });
      break;
    case 'feathered': {
      for (let k = -3; k <= 3; k++) {
        const bx = cx + k * rx * 0.3, by = gy + hc - ry * 0.65;
        fill(c, `M${f1(bx - rx * 0.1)},${f1(by)}Q${f1(bx + k * rx * 0.12)},${f1(by - ry * 1.5)} ${f1(bx + k * rx * 0.22)},${f1(by - ry * 1.9)}Q${f1(bx + k * rx * 0.14 + rx * 0.12)},${f1(by - ry * 1.3)} ${f1(bx + rx * 0.1)},${f1(by)}Z`, k % 2 ? tint('#2b2b2b', 0.3) : tint('#e8e2d2', 0), { shade: false, sw: 0.7 });
      }
      line(c, `M${x(-1.0)},${y(-0.55)}Q${f1(cx)},${y(-0.75)} ${x(1.0)},${y(-0.55)}`, 2.2, tint(o.trim[0], 0));
      break;
    }
    case 'skull':
      fill(c, `M${x(-1.15)},${y(-0.2)}C${x(-1.25)},${y(-1.6)} ${x(1.25)},${y(-1.6)} ${x(1.15)},${y(-0.2)}Q${f1(cx)},${y(-0.05)} ${x(-1.15)},${y(-0.2)}Z`, '#e6dccb', { shade: false });
      for (const s of [-1, 1]) {
        ell(c, cx + s * rx * 0.38, gy + hc - ry * 0.75, rx * 0.2, ry * 0.15, INK, 0);
        fill(c, `M${f1(cx + s * rx * 0.9)},${y(-1.0)}Q${f1(cx + s * rx * 1.9)},${y(-1.3)} ${f1(cx + s * rx * 1.7)},${y(-2.3)}Q${f1(cx + s * rx * 1.45)},${y(-1.5)} ${f1(cx + s * rx * 0.75)},${y(-1.25)}Z`, '#e6dccb', { shade: false, sw: 0.9 });
      }
      break;
    case 'hood':
      line(c, `M${x(-1.02)},${y(0.5)}C${x(-1.15)},${y(-1.25)} ${x(1.15)},${y(-1.25)} ${x(1.02)},${y(0.5)}`, 1.1);
      line(c, `M${x(-0.85)},${y(0.45)}Q${f1(cx)},${y(0.75)} ${x(0.85)},${y(0.45)}`, ry * 0.5, tint(o.main[0]));
      break;
    case 'circlet':
      line(c, `M${x(-1.0)},${y(-0.5)}Q${f1(cx)},${y(-0.68)} ${x(1.0)},${y(-0.5)}`, 1.8, STEEL);
      break;
    default:
      void hr;
  }
}

/** Pattern fills (in `currentColor`, set on each use). */
function defs(id: string): string {
  return `<defs>
<pattern id="${id}-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><path d="M0,0L0,4" stroke="${INK}" stroke-width="0.7"/></pattern>
<pattern id="${id}-mail" width="3.2" height="2.6" patternUnits="userSpaceOnUse"><path d="M0.3,1.6a1.3,1.1 0 0,1 2.6,0" fill="none" stroke="currentColor" stroke-width="0.45" opacity="0.7"/></pattern>
<pattern id="${id}-scale" width="5" height="4" patternUnits="userSpaceOnUse"><path d="M0,0a2.5,2.6 0 0,0 5,0M-2.5,2a2.5,2.6 0 0,0 5,0M2.5,2a2.5,2.6 0 0,0 5,0" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.7"/></pattern>
<pattern id="${id}-lamellar" width="3" height="5" patternUnits="userSpaceOnUse"><rect x="0.3" y="0.3" width="2.4" height="4.4" fill="none" stroke="currentColor" stroke-width="0.45" opacity="0.7"/></pattern>
<pattern id="${id}-quilt" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M2,0L2,4" stroke="currentColor" stroke-width="0.45" stroke-dasharray="1 0.8" opacity="0.6"/></pattern>
<pattern id="${id}-dots" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="0.9" fill="currentColor" opacity="0.6"/><circle cx="5" cy="5" r="0.9" fill="currentColor" opacity="0.6"/></pattern>
<pattern id="${id}-plaid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0,3h10M0,4.4h10M3,0v10M4.4,0v10" stroke="currentColor" stroke-width="0.9" opacity="0.65"/><path d="M0,8h10M8,0v10" stroke="currentColor" stroke-width="0.4" opacity="0.5"/></pattern>
<pattern id="${id}-checks" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="currentColor" opacity="0.38"/><rect x="4" y="4" width="4" height="4" fill="currentColor" opacity="0.38"/></pattern>
<pattern id="${id}-stripes" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="2.4" height="6" fill="currentColor" opacity="0.45"/></pattern>
<pattern id="${id}-zigzag" width="8" height="6" patternUnits="userSpaceOnUse"><path d="M0,4L2,1L4,4L6,1L8,4" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.6"/></pattern>
</defs>`;
}

/** The three figures as an SVG string `w` wide. */
export function sketchSvg(look: Look, key: string, w = 420): string {
  const id = `sk${key.replace(/[^a-z0-9]/gi, '')}`;
  const W = 420, Hh = 300, gy = 262;
  const H = 198 * Math.max(0.8, Math.min(1, look.h));
  const parts: string[] = [];
  look.figures.forEach((f, i) => {
    const c: Ctx = { out: [], shade: [], id };
    const cx = 70 + i * 140;
    figure(c, look, f, cx, gy, H);
    // Hatching on the right of the figure, over its washes.
    const clip = `${id}-c${i}`;
    parts.push(`<g>${c.out.join('')}<clipPath id="${clip}">${c.shade.map((d) => `<path d="${d}"/>`).join('')}</clipPath><rect x="${f1(cx + H * 0.03)}" y="0" width="${f1(H * 0.5)}" height="${gy}" fill="url(#${id}-hatch)" opacity="0.3" clip-path="url(#${clip})"/></g>`);
    parts.push(`<path d="M${cx - 48},${gy + 3}q24,-2 48,0t48,0" fill="none" stroke="${INK}" stroke-width="0.8" stroke-opacity="0.55"/>`);
    const label = f.role === 'Noble' ? (f.female ? 'Noblewoman' : 'Nobleman') : f.role === 'Warrior' && f.female ? 'Warrior (woman)' : f.role;
    parts.push(`<text x="${cx}" y="${gy + 26}" text-anchor="middle" font-family="'IM Fell English', Georgia, serif" font-style="italic" font-size="14" fill="${INK}">${label}</text>`);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" width="${w}" height="${f1((w * Hh) / W)}" role="img">${defs(id)}${parts.join('')}</svg>`;
}
