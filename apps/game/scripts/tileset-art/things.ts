/** Objects over the ground (trees, plants, stones, town things, stairs, furniture), tree parts and decorations. */
import { TREE_KINDS } from '@worldforge/core/local/trees';
import { type RGB, Rng, Sprite, hashStr, hex, ramp, tone } from './paint';

const N = 1, E = 2, S = 4, W = 8;

/** Outline and drop shadow: the finishing touch on every free-standing object. */
function finish(s: Sprite, shadow = 60): Sprite {
  s.outline(-0.45);
  if (shadow) s.shadow(shadow);
  return s;
}

function transpose(s: Sprite): Sprite {
  const t = new Sprite();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (s.alpha(y, x)) t.set(x, y, s.get(y, x), s.alpha(y, x));
  return t;
}

// ---- Crowns and trees ----------------------------------------------------------------------------

/** A leafy crown: overlapping clusters, lit from the top-left. */
function crown(s: Sprite, rng: Rng, cx: number, cy: number, r: number, leaves: string, density = 1): void {
  const p = ramp(leaves, 1.1);
  s.disc(cx, cy, r, p[1]);
  const n = Math.round(r * r * 0.9 * density);
  for (let k = 0; k < n; k++) {
    const a = rng.next() * Math.PI * 2, d = Math.sqrt(rng.next()) * (r - 1.3);
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, rr = rng.range(1.1, 2);
    const lit = -(Math.cos(a) + Math.sin(a)) * (d / r);
    const c = p[Math.max(1, Math.min(4, Math.round(2 + lit * 1.6 + rng.range(-0.6, 0.6))))];
    s.disc(x, y, rr, c);
    s.set(Math.floor(x - rr * 0.5), Math.floor(y - rr * 0.5), tone(c, 0.12));
  }
}

function trunkFoot(s: Sprite, bark: string, x = 8): void {
  const p = ramp(bark);
  s.rect(x - 1, 12, 3, 4, p[2]);
  s.rect(x - 1, 12, 1, 4, p[3]);
  s.rect(x + 1, 12, 1, 4, p[1]);
}

function conifer(s: Sprite, rng: Rng, cx: number, cy: number, r: number, leaves: string): void {
  const p = ramp(leaves, 1.1), spikes = 9 + rng.int(3), rot = rng.next() * 6;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const edge = r * (0.78 + 0.22 * Math.cos(spikes * a + rot));
      if (d > edge) continue;
      const band = Math.floor((d / r) * 4);
      const lit = -(dx + dy) / (r * 2.2);
      s.set(x, y, p[Math.max(0, Math.min(4, 3 - band + Math.round(lit * 2) + ((x + y) % 3 === 0 ? -1 : 0)))]);
    }
  }
  s.disc(cx - 0.5, cy - 0.5, 1, p[4]);
}

function bare(s: Sprite, rng: Rng, cx: number, cy: number, r: number, c: string): void {
  const p = ramp(c);
  const limb = (x: number, y: number, a: number, len: number, depth: number) => {
    const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
    s.line(x, y, x1, y1, p[depth > 1 ? 2 : 3]);
    if (depth > 0) for (const da of [-0.5, 0.45]) limb(x1, y1, a + da + rng.range(-0.2, 0.2), len * 0.62, depth - 1);
  };
  for (let k = 0; k < 5; k++) limb(cx, cy, (k / 5) * Math.PI * 2 + rng.next(), r * 0.55, 2);
  s.disc(cx, cy, 1.5, p[1]);
}

function palm(s: Sprite, rng: Rng, cx: number, cy: number, r: number, leaves: string): void {
  const p = ramp(leaves);
  const n = 7, rot = rng.next() * Math.PI;
  for (let k = 0; k < n; k++) {
    const a = rot + (k / n) * Math.PI * 2;
    for (let d = 1; d <= r; d += 0.5) {
      const x = cx + Math.cos(a) * d + Math.cos(a + 1.6) * (d / r) * 1.2, y = cy + Math.sin(a) * d + Math.sin(a + 1.6) * (d / r) * 1.2;
      s.set(x, y, p[d < r * 0.5 ? 3 : 2]);
      if (d > 2 && Math.round(d * 2) % 2 === 0) {
        s.set(x + Math.cos(a + 1.57) * 1.3, y + Math.sin(a + 1.57) * 1.3, p[1]);
        s.set(x + Math.cos(a - 1.57) * 1.3, y + Math.sin(a - 1.57) * 1.3, p[2]);
      }
    }
  }
  s.disc(cx, cy, 1.4, hex('#7a5a30'));
}

function tree(name: string, v: number): Sprite {
  const s = new Sprite(), rng = new Rng(hashStr(name) + v * 101);
  const j = () => rng.range(-0.6, 0.6);
  switch (name) {
    case 'tree_broadleaf':
      trunkFoot(s, '#6a4c30');
      crown(s, rng, 8 + j(), 7 + j(), 6.6 + rng.range(-0.4, 0.6), ['#3f7a32', '#467f30', '#3a7438', '#4a7a2c'][v % 4]);
      break;
    case 'tree_conifer':
      trunkFoot(s, '#5a4028');
      conifer(s, rng, 8, 7.5, 7, '#2f6a3a');
      break;
    case 'tree_palm':
      palm(s, rng, 8, 7.5, 7.5, '#5a8a3a');
      break;
    case 'tree_jungle': {
      const root = ramp('#5a4228');
      for (const [dx, dy] of [[-4, 6], [4, 6], [0, 7]]) s.line(8, 10, 8 + dx, 8 + dy, root[2]);
      crown(s, rng, 8 + j(), 7, 7.4, '#2c6a2a', 1.2);
      const vine = hex('#5a9a3a');
      for (let k = 0; k < 3; k++) {
        const x = 3 + rng.int(10);
        for (let y = 5 + rng.int(3); y < 12; y++) if (s.alpha(x, y)) s.set(x + (y % 2), y, vine);
      }
      break;
    }
    case 'tree_dead':
      bare(s, rng, 8, 8, 7.5, '#7a6a55');
      break;
    case 'tree_mangrove': {
      const root = ramp('#5a4a34');
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        s.line(8, 8, 8 + Math.cos(a) * 7, 8 + Math.sin(a) * 7, root[k % 2 ? 2 : 3]);
      }
      crown(s, rng, 8, 7, 5.2, '#3c6c3c');
      break;
    }
    case 'tree_birch': {
      const bark = hex('#e8e4d8');
      s.rect(7, 11, 2, 5, bark);
      s.set(7, 13, hex('#2a2a2a'));
      s.set(8, 15, hex('#2a2a2a'));
      crown(s, rng, 8 + j(), 6.5, 6, '#7fa050', 0.75);
      break;
    }
  }
  return finish(s, 70);
}

// ---- Tree parts across levels --------------------------------------------------------------------

function treeKind(name: string) {
  const k = TREE_KINDS.find((t) => t.name === name);
  if (!k) throw new Error(`Unknown tree kind ${name}`);
  return k;
}

/** A trunk cut across: bark rim round pale wood with rings. */
function crossSection(s: Sprite, cx: number, cy: number, r: number, bark: string, kind: string): void {
  const b = ramp(bark), wood = ramp(kind === 'dead' ? '#9a8a70' : '#c8a070');
  s.disc(cx, cy, r, b[1]);
  s.disc(cx, cy, r - 1.2, wood[2]);
  for (let rr = r - 2.6; rr > 0.8; rr -= 2) s.ring(cx, cy, rr - 0.5, rr, wood[1]);
  s.disc(cx, cy, 0.8, wood[0]);
  if (kind === 'birch') for (let a = 0; a < 6; a++) s.set(cx + Math.cos(a) * (r - 0.5), cy + Math.sin(a) * (r - 0.5), hex('#2a2a2a'));
  if (kind === 'palm') s.ring(cx, cy, r - 0.6, r, b[3]);
}

function treePart(part: string, kindName: string, mask: number): Sprite {
  const k = treeKind(kindName), s = new Sprite(), rng = new Rng(hashStr(part + kindName) + mask);
  const b = ramp(k.bark);
  switch (part) {
    case 'trunk':
      crossSection(s, 8, 8, k.wide ? 5.5 : 4.5, k.bark, kindName);
      return finish(s, 50);
    case 'trunk2': {
      // The trunk's middle is the corner this quarter shares with the other three.
      const corner: Record<number, [number, number]> = { 1: [16, 16], 2: [0, 16], 4: [0, 0], 8: [16, 0] };
      const [x, y] = corner[mask] ?? [16, 16];
      crossSection(s, x, y, 13, k.bark, kindName);
      s.outline(-0.4, `${y === 16 ? 's' : 'n'}${x === 16 ? 'e' : 'w'}`);
      return s;
    }
    case 'roots': {
      const from: Record<number, [number, number, number]> = { 1: [8, 0, Math.PI / 2], 2: [15, 8, Math.PI], 4: [8, 15, -Math.PI / 2], 8: [0, 8, 0] };
      const [x0, y0, a0] = from[mask] ?? from[1];
      for (let r = 0; r < 3; r++) {
        const a = a0 + (r - 1) * 0.55 + rng.range(-0.15, 0.15), len = rng.range(7, 11);
        let x = x0, y = y0;
        for (let d = 0; d < len; d += 1) {
          const w = 2.4 - (d / len) * 1.8;
          s.disc(x, y, w / 2 + 0.3, b[d < 3 ? 2 : 1]);
          x += Math.cos(a + Math.sin(d * 0.7) * 0.25);
          y += Math.sin(a + Math.sin(d * 0.7) * 0.25);
        }
      }
      return finish(s, 40);
    }
    case 'branch': {
      const ends: [number, number][] = [];
      if (mask & N) ends.push([8, -1]);
      if (mask & E) ends.push([16, 8]);
      if (mask & S) ends.push([8, 16]);
      if (mask & W) ends.push([-1, 8]);
      for (const [x, y] of ends) s.thick(8, 8, x, y, 3, b[2]);
      if (!ends.length) s.thick(6, 9, 10, 7, 2, b[2]);
      s.disc(8, 8, 2, b[2]);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (s.alpha(x, y) && (x * 3 + y * 5) % 7 === 0) s.set(x, y, b[1]);
      s.outline(-0.4, (mask & N ? 'n' : '') + (mask & E ? 'e' : '') + (mask & S ? 's' : '') + (mask & W ? 'w' : ''));
      return s;
    }
    case 'leaves':
      return leafMass(kindName, k.leaves, mask, rng);
  }
  throw new Error(`Unknown tree part ${part}`);
}

/** Foliage that joins foliage: fills to joined sides, ragged and shaded where it stops. */
function leafMass(kind: string, leaves: string, mask: number, rng: Rng): Sprite {
  const s = new Sprite(), p = ramp(leaves, 1.1);
  if (kind === 'dead') {
    for (let k = 0; k < 9; k++) {
      const x = rng.int(16), y = rng.int(16), a = rng.next() * 6;
      s.line(x, y, x + Math.cos(a) * 4, y + Math.sin(a) * 4, ramp('#7a6a55')[3]);
    }
    return finish(s, 0);
  }
  s.fill(p[1]);
  const clusters = kind === 'birch' ? 22 : 32;
  for (let k = 0; k < clusters; k++) {
    const x = rng.range(-1, 17), y = rng.range(-1, 17), r = kind === 'conifer' ? 1 : rng.range(1.2, 2.2);
    const c = p[2 + rng.int(3)];
    s.disc(x, y, r, c);
    if (kind === 'conifer') s.set(x + 1, y + 1, p[0]);
    else s.set(Math.floor(x - r * 0.4), Math.floor(y - r * 0.4), tone(c, 0.12));
  }
  if (kind === 'palm') for (let k = 0; k < 6; k++) {
    const x = rng.int(16), y = rng.int(16);
    s.line(x, y, x + rng.int(7) - 3, y + rng.int(7) - 3, p[3]);
  }
  // Ragged edge where nothing joins.
  const depth = () => 1 + rng.int(3);
  const cut = (x: number, y: number) => s.set(x, y, [0, 0, 0], 0);
  if (!(mask & N)) for (let x = 0; x < 16; x++) for (let y = 0, d = depth(); y < d; y++) cut(x, y);
  if (!(mask & S)) for (let x = 0; x < 16; x++) for (let y = 0, d = depth(); y < d; y++) cut(x, 15 - y);
  if (!(mask & W)) for (let y = 0; y < 16; y++) for (let x = 0, d = depth(); x < d; x++) cut(x, y);
  if (!(mask & E)) for (let y = 0; y < 16; y++) for (let x = 0, d = depth(); x < d; x++) cut(15 - x, y);
  const open = (mask & N ? 'n' : '') + (mask & E ? 'e' : '') + (mask & S ? 's' : '') + (mask & W ? 'w' : '');
  s.outline(-0.4, open);
  return s;
}

// ---- Plants and small growing things -------------------------------------------------------------

function plant(name: string, v: number): Sprite {
  const s = new Sprite(), rng = new Rng(hashStr(name) + v * 37);
  switch (name) {
    case 'bush':
      crown(s, rng, 8, 8.5, 5 + v * 0.4, ['#4c7a38', '#557f3a', '#467034'][v % 3]);
      if (v === 2) for (let k = 0; k < 5; k++) s.set(4 + rng.int(8), 5 + rng.int(7), hex('#c03a3a'));
      return finish(s);
    case 'scrub': {
      const p = ramp('#8a8a4a');
      for (let k = 0; k < 5; k++) {
        const x = 3 + rng.int(10), y = 3 + rng.int(10);
        s.disc(x, y, rng.range(1.2, 2.2), p[1 + rng.int(3)]);
      }
      for (let k = 0; k < 8; k++) {
        const x = 2 + rng.int(12), y = 2 + rng.int(12);
        s.line(x, y, x + rng.int(5) - 2, y + rng.int(5) - 2, hex('#6a5a3a'));
      }
      return finish(s, 40);
    }
    case 'tall_grass': {
      const p = ramp('#8aa64e');
      for (let k = 0; k < 30; k++) {
        const x = 1 + rng.int(14), y = 3 + rng.int(12), h = 2 + rng.int(3), lean = rng.int(3) - 1;
        for (let i = 0; i < h; i++) s.set(x + (i === h - 1 ? lean : 0), y - i, p[i === h - 1 ? 4 : 1 + rng.int(2)]);
      }
      return finish(s, 0);
    }
    case 'ferns': {
      const p = ramp('#4a8a44');
      const n = 6, rot = rng.next() * 6;
      for (let k = 0; k < n; k++) {
        const a = rot + (k / n) * Math.PI * 2, len = rng.range(5, 7);
        for (let d = 1; d < len; d += 0.6) {
          const x = 8 + Math.cos(a) * d, y = 8 + Math.sin(a) * d;
          s.set(x, y, p[2]);
          if (d > 1.5) {
            s.set(x + Math.cos(a + 1.3) * 1.2, y + Math.sin(a + 1.3) * 1.2, p[3]);
            s.set(x + Math.cos(a - 1.3) * 1.2, y + Math.sin(a - 1.3) * 1.2, p[1]);
          }
        }
      }
      return finish(s, 30);
    }
    case 'reeds': {
      const p = ramp('#8a9a52');
      for (let k = 0; k < 14; k++) {
        const x = 2 + rng.int(12), y = 4 + rng.int(11);
        s.line(x, y, x + rng.int(3) - 1, y - 3, p[1 + rng.int(3)]);
        if (rng.chance(0.4)) s.rect(x, y - 5, 1, 2, hex('#6a4428'));
      }
      return finish(s, 0);
    }
    case 'flowers': {
      const leaf = ramp('#5a8a3a'), colours = [['#e8a0c8', '#f0e070'], ['#f4f0e0', '#e0c040'], ['#8aa0e8', '#e87070']][v % 3];
      for (let k = 0; k < 10; k++) s.set(2 + rng.int(12), 2 + rng.int(12), leaf[2 + rng.int(2)]);
      for (let k = 0; k < 7; k++) {
        const x = 2 + rng.int(12), y = 2 + rng.int(12), c = hex(rng.pick(colours));
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) s.set(x + dx, y + dy, c);
        s.set(x, y, hex('#f8e060'));
      }
      return finish(s, 0);
    }
    case 'cactus': {
      const p = ramp('#5a8a4a');
      s.disc(8, 8, 3.6, p[2]);
      if (v === 1) {
        s.disc(3.5, 8, 2, p[2]);
        s.disc(12.5, 8.5, 2, p[2]);
        s.rect(4, 7, 8, 2, p[2]);
      }
      for (let a = 0; a < 8; a++) s.line(8, 8, 8 + Math.cos(a * 0.785) * 3.4, 8 + Math.sin(a * 0.785) * 3.4, p[1]);
      s.dome(8, 8, 4, 0.4);
      for (let k = 0; k < 8; k++) s.set(4 + rng.int(9), 4 + rng.int(9), hex('#e8e0b0'));
      return finish(s, 80);
    }
    case 'mushrooms': {
      const cap = ramp('#c8b8a0');
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = 8 + Math.cos(a) * 5, y = 8 + Math.sin(a) * 5;
        s.disc(x, y, 1.4, cap[3]);
        s.set(x - 0.5, y - 0.5, cap[4]);
      }
      return finish(s, 40);
    }
    case 'crops': {
      const p = ramp(['#c8b060', '#b8c060', '#d8b860'][v % 3]);
      for (let row = 1; row < 16; row += 3) {
        for (let x = 0; x < 16; x++) {
          if (rng.chance(0.15)) continue;
          s.set(x, row, p[1 + rng.int(2)]);
          s.set(x, row - 1, p[3 + rng.int(2)]);
        }
      }
      return s;
    }
    case 'vines': {
      const wood = ramp('#6a4a30'), leaf = ramp('#6a8a3a');
      for (let x = 0; x < 16; x++) s.set(x, 8, wood[2]);
      for (const x of [2, 13]) s.rect(x, 7, 2, 2, wood[1]);
      for (let k = 0; k < 9; k++) s.disc(1 + rng.int(14), 8 + rng.range(-1.5, 1.5), rng.range(1.3, 2.2), leaf[1 + rng.int(3)]);
      if (v === 1) for (let k = 0; k < 6; k++) s.set(2 + rng.int(12), 7 + rng.int(3), hex('#5a2a5a'));
      return finish(s, 50);
    }
  }
  throw new Error(`Unknown plant ${name}`);
}

// ---- Stones, earthworks and town things ----------------------------------------------------------

function rockLump(s: Sprite, rng: Rng, cx: number, cy: number, rx: number, ry: number, c: string): void {
  const p = ramp(c);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
      const wob = 1 + 0.12 * Math.sin(a * 3 + rng.next() * 0.3) + 0.08 * Math.cos(a * 5);
      const dx = (x + 0.5 - cx) / (rx * wob), dy = (y + 0.5 - cy) / (ry * wob);
      if (dx * dx + dy * dy <= 1) s.set(x, y, p[2]);
    }
  }
  s.dome(cx, cy, Math.max(rx, ry), 0.45);
}

const FIRE = [hex('#a02810'), hex('#e0601a'), hex('#f8a830'), hex('#fff0a0')];

function flames(s: Sprite, rng: Rng, cx: number, cy: number, r: number): void {
  for (let k = 0; k < r * 6; k++) {
    const a = rng.next() * Math.PI * 2, d = Math.sqrt(rng.next()) * r;
    s.set(cx + Math.cos(a) * d, cy + Math.sin(a) * d - (r - d) * 0.4, FIRE[Math.min(3, Math.floor((1 - d / r) * 3.6))]);
  }
  s.set(cx, cy - 1, FIRE[3]);
}

function stoneRing(s: Sprite, rng: Rng, r: number): void {
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    s.disc(8 + Math.cos(a) * r, 8 + Math.sin(a) * r, 1.4, tone(hex('#8c8680'), rng.range(-0.15, 0.15)));
  }
}

/** Animated things: their frames. */
export function animated(name: string): Sprite[] | null {
  const frames = (paint: (s: Sprite, rng: Rng, f: number) => void) =>
    [0, 1, 2].map((f) => {
      const s = new Sprite(), rng = new Rng(hashStr(name) + f * 13);
      paint(s, rng, f);
      return s;
    });
  switch (name) {
    case 'campfire':
      return frames((s, rng, f) => {
        stoneRing(s, new Rng(5), 5.6);
        s.line(5, 10, 11, 6, hex('#5a3a20'));
        s.line(5, 6, 11, 10, hex('#4a3018'));
        s.outline(-0.4);
        flames(s, rng, 8, 8 - (f === 1 ? 1 : 0), 3.2 + (f === 2 ? 0.4 : 0));
      });
    case 'hearth':
      return frames((s, rng, f) => {
        const st = ramp('#8a7a6a');
        s.rect(1, 2, 14, 12, st[2]);
        s.rect(3, 4, 10, 10, hex('#2a201a'));
        s.rect(1, 2, 14, 1, st[3]);
        s.outline(-0.4);
        flames(s, rng, 8, 10 - (f % 2), 3 + f * 0.3);
      });
    case 'brazier':
      return frames((s, rng, f) => {
        const iron = ramp('#4a4644');
        for (const [x, y] of [[3, 12], [13, 12], [8, 3]]) s.rect(x - 1, y, 2, 2, iron[1]);
        s.disc(8, 8, 5, iron[2]);
        s.disc(8, 8, 3.8, hex('#5a2010'));
        s.outline(-0.4);
        flames(s, rng, 8, 8 - (f % 2), 3 + (f === 2 ? 0.5 : 0));
      });
    case 'forge':
      return frames((s, rng, f) => {
        const brick = ramp('#9a5a40');
        s.rect(1, 2, 14, 12, brick[2]);
        for (let y = 2; y < 14; y += 3) s.rect(1, y, 14, 1, brick[0]);
        s.rect(4, 5, 8, 6, hex('#2a1a14'));
        for (let k = 0; k < 18; k++) s.set(5 + rng.int(6), 6 + rng.int(4), FIRE[(rng.int(3) + f) % 4]);
        s.outline(-0.4);
        s.shadow(60);
      });
  }
  return null;
}

function thing(name: string, v: number): Sprite | null {
  const s = new Sprite(), rng = new Rng(hashStr(name) + v * 53);
  const wood = ramp('#8a6a48'), grey = ramp('#8c8680');
  switch (name) {
    case 'boulder':
      rockLump(s, rng, 8, 8.5, 6 + v * 0.3, 5 + v * 0.4, ['#8c8680', '#857f76', '#928a7e'][v % 3]);
      for (let k = 0; k < 4; k++) s.set(5 + rng.int(6), 5 + rng.int(6), hex('#b8c090'));
      return finish(s, 90);
    case 'stones':
      for (let k = 0; k < 4 + v; k++) {
        const x = 3 + rng.int(10), y = 3 + rng.int(10);
        rockLump(s, rng, x, y, rng.range(1.3, 2.2), rng.range(1, 1.8), '#9a948a');
      }
      return finish(s, 60);
    case 'menhir':
      rockLump(s, rng, 8, 8, 3.4, 5.5, '#8c8a84');
      for (let k = 0; k < 5; k++) s.set(6 + rng.int(4), 4 + rng.int(8), hex('#b8c090'));
      return finish(s, 110);
    case 'totem': {
      const bands = ['#a06a3a', '#c03a2a', '#e0c050', '#2a4a6a', '#a06a3a'].map(hex);
      for (let i = 0; i < bands.length; i++) s.disc(8, 8, 5 - i, bands[i]);
      s.rect(2, 7, 12, 2, hex('#7a4a2a'));
      s.dome(8, 8, 5);
      return finish(s, 90);
    }
    case 'rubble':
      for (let k = 0; k < 6 + v * 2; k++) {
        const w = 2 + rng.int(3), h = 2 + rng.int(2), x = 1 + rng.int(13 - w), y = 1 + rng.int(13 - h), c = tone(grey[2], rng.range(-0.15, 0.15));
        s.rect(x, y, w, h, c);
        s.rect(x, y, w, 1, tone(c, 0.15));
      }
      return finish(s, 50);
    case 'well':
      s.disc(8, 8, 6.5, grey[2]);
      for (let a = 0; a < 10; a++) s.line(8 + Math.cos(a * 0.628) * 4.5, 8 + Math.sin(a * 0.628) * 4.5, 8 + Math.cos(a * 0.628) * 6.5, 8 + Math.sin(a * 0.628) * 6.5, grey[0]);
      s.disc(8, 8, 4, hex('#1e2a34'));
      s.set(6, 7, hex('#4a6a80'));
      s.rect(1, 7, 14, 2, wood[2]);
      s.rect(1, 7, 14, 1, wood[3]);
      s.rect(8, 9, 1, 2, hex('#c8b890'));
      return finish(s, 70);
    case 'fountain': {
      s.disc(8, 8, 7, grey[3]);
      s.disc(8, 8, 5.6, hex('#5a8aa8'));
      s.ring(8, 8, 2.5, 3.2, hex('#9ac0d8'));
      s.disc(8, 8, 1.6, grey[2]);
      s.set(7, 7, hex('#ffffff'));
      s.set(11, 6, hex('#e0f0f8'));
      return finish(s, 60);
    }
    case 'grave': {
      const earth = ramp('#7a6a48');
      s.rect(4, 5, 8, 10, earth[2]);
      s.rect(4, 5, 8, 1, earth[3]);
      if (v === 1) {
        s.rect(7, 1, 2, 8, wood[2]);
        s.rect(4, 3, 8, 2, wood[2]);
      } else {
        s.rect(4, 1, 8, 4, grey[3]);
        s.rect(4, 1, 8, 1, grey[4]);
        if (v === 2) s.rect(5, 6, 6, 8, grey[2]);
      }
      return finish(s, 50);
    }
    case 'tomb':
      s.rect(2, 3, 12, 10, grey[2]);
      s.rect(3, 4, 10, 8, grey[3]);
      s.rect(2, 3, 12, 1, grey[4]);
      s.rect(7, 5, 2, 6, grey[1]);
      s.rect(5, 7, 6, 2, grey[1]);
      return finish(s, 80);
    case 'stall': {
      const stripes = [['#c8784a', '#f0e4c8'], ['#4a6aa8', '#f0e4c8'], ['#5a8a4a', '#e8d070']][v % 3].map(hex);
      for (let y = 1; y < 15; y++) for (let x = 0; x < 16; x++) s.set(x, y, stripes[Math.floor(x / 2) % 2]);
      for (let x = 0; x < 16; x++) {
        s.tone(x, 1, 0.15);
        s.set(x, 14, tone(stripes[Math.floor(x / 2) % 2], -0.3));
        if (x % 2) s.set(x, 15, tone(stripes[0], -0.2));
      }
      return finish(s, 50);
    }
    case 'tent': {
      const c = ramp('#c8b48a');
      if (v === 1) {
        s.disc(8, 8, 7, c[2]);
        for (let a = 0; a < 8; a++) s.line(8, 8, 8 + Math.cos(a * 0.785) * 7, 8 + Math.sin(a * 0.785) * 7, c[1]);
        s.dome(8, 8, 7, 0.4);
        s.disc(8, 8, 1, hex('#6a4a30'));
      } else {
        s.rect(1, 2, 14, 12, c[3]);
        s.rect(1, 8, 14, 6, c[1]);
        s.rect(1, 7, 14, 1, c[4]);
        s.rect(6, 12, 4, 2, hex('#3a2a1a'));
      }
      return finish(s, 80);
    }
    case 'wagon': {
      s.rect(3, 1, 10, 13, wood[2]);
      for (let y = 3; y < 14; y += 3) s.rect(3, y, 10, 1, wood[1]);
      s.rect(3, 1, 10, 1, wood[3]);
      for (const x of [1, 13]) for (const y of [2, 10]) s.rect(x, y, 2, 4, hex('#3a2a1a'));
      if (v === 1) s.line(8, 14, 8, 15, wood[1]);
      return finish(s, 70);
    }
    case 'boat': {
      const hull = ramp(v ? '#7a5a3a' : '#8a6a48');
      s.ellipse(8, 8, 3.6, 7.4, hull[1]);
      s.ellipse(8, 8, 2.6, 6.4, hull[3]);
      for (const y of [5, 9]) s.rect(5, y, 6, 1, hull[1]);
      return finish(s, 60);
    }
    case 'horse': {
      const h = ramp('#8a5a3a');
      s.ellipse(8, 9, 3, 5, h[2]);
      s.ellipse(8, 3.5, 1.5, 2.4, h[2]);
      s.rect(8, 2, 1, 6, hex('#3a2418'));
      s.line(8, 14, 9, 15, hex('#3a2418'));
      s.dome(8, 8, 6, 0.3);
      return finish(s, 70);
    }
    case 'woodpile':
    case 'logs':
      for (let row = 0; row < 3; row++) {
        for (let k = 0; k < 4; k++) {
          const x = 2 + k * 3.2 + (row % 2) * 1.5, y = 4 + row * 3;
          s.disc(x + 1, y + 1, 1.7, wood[1]);
          s.disc(x + 1, y + 1, 0.9, hex('#c8a070'));
        }
      }
      return finish(s, 60);
    case 'millwheel':
      s.rect(1, 5, 14, 6, wood[1]);
      for (let x = 1; x < 15; x += 2) s.rect(x, 4, 1, 8, wood[3]);
      s.rect(0, 7, 16, 2, hex('#4a3a2a'));
      return finish(s, 60);
    case 'signpost':
      s.rect(7, 7, 2, 2, wood[1]);
      s.rect(2, 4, 10, 2, wood[3]);
      s.set(12, 5, wood[3]);
      s.rect(5, 10, 9, 2, wood[2]);
      s.set(4, 11, wood[2]);
      return finish(s, 60);
    case 'tree_trunk':
      crossSection(s, 8, 8, 6, '#6a4c30', 'broadleaf');
      return finish(s, 50);
  }
  return null;
}

// ---- Stairs and ways down ------------------------------------------------------------------------

function way(name: string): Sprite | null {
  const s = new Sprite();
  const wood = ramp('#b89060'), stone = ramp('#cfc4aa'), dark = hex('#140f0c');
  switch (name) {
    case 'stairs_up':
      for (let i = 0; i < 5; i++) {
        const y = 1 + i * 3, c = tone(wood[2], (4 - i) * 0.05 - 0.1);
        s.rect(2, y, 12, 3, c);
        s.rect(2, y, 12, 1, tone(c, 0.18));
      }
      return finish(s, 0);
    case 'stairs_down':
      for (let i = 0; i < 5; i++) {
        const y = 1 + i * 3, c = tone(wood[2], -i * 0.17);
        s.rect(2, y, 12, 3, c);
        s.rect(2, y, 12, 1, tone(c, 0.12));
      }
      s.rect(2, 13, 12, 3, dark);
      return finish(s, 0);
    case 'ladder_up':
    case 'ladder_down': {
      if (name === 'ladder_down') {
        s.rect(2, 2, 12, 12, ramp('#7a5a3a')[1]);
        s.rect(4, 4, 8, 8, dark);
      }
      for (const x of [5, 10]) s.rect(x, 1, 1, 14, wood[2]);
      for (let y = 2; y < 15; y += 3) s.rect(5, y, 6, 1, wood[3]);
      return finish(s, 40);
    }
    case 'stairs_spiral':
      s.disc(8, 8, 7, stone[2]);
      for (let a = 0; a < 8; a++) s.line(8, 8, 8 + Math.cos(a * 0.785) * 7, 8 + Math.sin(a * 0.785) * 7, stone[0]);
      for (let a = 0; a < 8; a++) s.set(8 + Math.cos(a * 0.785 + 0.3) * 5, 8 + Math.sin(a * 0.785 + 0.3) * 5, stone[4]);
      s.disc(8, 8, 1.6, stone[1]);
      return finish(s, 60);
    case 'mine_entrance':
      s.rect(2, 2, 12, 12, ramp('#6a4a30')[2]);
      s.rect(4, 4, 8, 10, dark);
      for (let y = 5; y < 14; y++) s.blend(4, y, hex('#3a3028'), 0.4);
      s.rect(2, 2, 12, 2, ramp('#6a4a30')[3]);
      return finish(s, 0);
    case 'cave_mouth': {
      const rng = new Rng(9);
      rockLump(s, rng, 8, 8, 7.5, 7, '#6a6058');
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const d = Math.hypot((x - 8) / 4.6, (y - 9) / 4);
        if (d < 1) s.set(x, y, tone(dark, (1 - d) * -0.2 + (d > 0.75 ? 0.15 : 0)));
      }
      return finish(s, 0);
    }
    case 'dungeon_entrance':
      s.rect(1, 1, 14, 14, ramp('#6a5a4a')[2]);
      for (let i = 0; i < 4; i++) s.rect(3, 3 + i * 3, 10, 3, tone(ramp('#8a7a6a')[2], -i * 0.22));
      s.rect(3, 13, 10, 1, dark);
      return finish(s, 0);
  }
  return null;
}

// ---- Furniture -----------------------------------------------------------------------------------

function furniture(name: string, v: number): Sprite | null {
  const s = new Sprite(), rng = new Rng(hashStr(name) + v * 17);
  const wood = ramp('#9a6a3a'), dark = ramp('#6a4020'), stone = ramp('#b0aca0'), iron = ramp('#4a4a4a');
  switch (name) {
    case 'altar':
      s.rect(1, 4, 14, 8, stone[2]);
      s.rect(1, 4, 14, 1, stone[4]);
      s.rect(5, 4, 6, 8, hex('#e8e0c8'));
      s.rect(5, 4, 6, 8, hex('#e8e0c8'));
      s.rect(7, 4, 2, 8, hex('#a03030'));
      for (const x of [2, 13]) s.rect(x, 6, 1, 2, hex('#f8f0d0'));
      return finish(s, 70);
    case 'anvil':
      s.disc(8, 9, 5, dark[2]);
      s.ring(8, 9, 2, 2.6, dark[1]);
      s.rect(4, 6, 8, 4, iron[2]);
      s.rect(1, 7, 4, 2, iron[2]);
      s.rect(4, 6, 8, 1, iron[4]);
      return finish(s, 60);
    case 'barrel': {
      const c = ramp(v ? '#8a5a30' : '#9a6a3a');
      s.disc(8, 8, 6, c[2]);
      for (let a = 0; a < 10; a++) s.line(8, 8, 8 + Math.cos(a * 0.628) * 6, 8 + Math.sin(a * 0.628) * 6, c[1]);
      s.disc(8, 8, 4, c[3]);
      s.ring(8, 8, 5.2, 6, iron[2]);
      s.ring(8, 8, 3.4, 4, iron[1]);
      s.dome(8, 8, 6, 0.25);
      return finish(s, 70);
    }
    case 'bath':
      s.ellipse(8, 8, 7, 5, wood[2]);
      s.ellipse(8, 8, 5.6, 3.8, hex('#7aa8c0'));
      s.set(6, 6, hex('#e0f0f8'));
      return finish(s, 60);
    case 'bin':
    case 'chest':
    case 'crate': {
      const c = ramp(name === 'chest' ? '#8a5a2a' : name === 'crate' ? (v ? '#b08a50' : '#a0804a') : '#8a6a48');
      const [x, y, w, h] = name === 'chest' ? [2, 4, 12, 9] : name === 'crate' ? [2, 2, 12, 12] : [2, 3, 12, 10];
      s.rect(x, y, w, h, c[2]);
      s.rect(x, y, w, 1, c[3]);
      if (name === 'crate') {
        for (let i = 2; i < w; i += 3) s.rect(x + i, y, 1, h, c[1]);
        s.line(x, y, x + w - 1, y + h - 1, c[3]);
      } else if (name === 'chest') {
        for (const bx of [x + 2, x + w - 3]) s.rect(bx, y, 1, h, iron[2]);
        s.rect(x, y + 3, w, 1, c[0]);
        s.rect(7, y + 3, 2, 2, hex('#c8a040'));
      } else {
        for (let i = y + 3; i < y + h; i += 3) s.rect(x, i, w, 1, c[1]);
      }
      return finish(s, 60);
    }
    case 'bucket':
      s.disc(8, 8, 4, wood[2]);
      s.disc(8, 8, 3, hex('#6a98b0'));
      s.ring(8, 8, 3.2, 4, iron[2]);
      s.line(4, 8, 12, 8, iron[3]);
      return finish(s, 50);
    case 'candle':
      s.disc(8, 9, 3, iron[2]);
      s.rect(7, 5, 2, 5, hex('#f0e8d0'));
      s.set(7, 3, FIRE[2]);
      s.set(8, 4, FIRE[3]);
      s.set(7, 4, FIRE[3]);
      return finish(s, 40);
    case 'cauldron':
      s.disc(8, 8, 6, iron[1]);
      s.disc(8, 8, 4.5, hex('#3a4a28'));
      s.ring(8, 8, 4.6, 5.4, iron[3]);
      s.set(6, 6, hex('#6a8a40'));
      return finish(s, 60);
    case 'chair':
      s.rect(4, 5, 8, 8, wood[2]);
      s.rect(4, 5, 8, 1, wood[3]);
      if (v) s.rect(4, 2, 8, 2, wood[1]);
      else for (const x of [4, 7, 10]) s.rect(x, 2, 2, 3, wood[1]);
      return finish(s, 50);
    case 'desk':
      s.rect(1, 3, 14, 10, dark[2]);
      s.rect(1, 3, 14, 1, dark[3]);
      s.rect(3, 5, 4, 5, hex('#ece4cc'));
      s.rect(8, 6, 3, 4, hex('#e0d8c0'));
      s.disc(12.5, 5.5, 1, iron[0]);
      return finish(s, 60);
    case 'font':
      s.disc(8, 8, 6, stone[2]);
      s.disc(8, 8, 4.4, hex('#7aa8c0'));
      s.set(6, 6, hex('#ffffff'));
      return finish(s, 60);
    case 'furnace':
      s.disc(8, 8, 6.5, hex('#a05a3a'));
      for (let a = 0; a < 6; a++) s.ring(8, 8, a + 0.5, a + 0.8, hex('#8a4a30'));
      s.rect(6, 11, 4, 3, hex('#e0601a'));
      s.dome(8, 8, 6.5, 0.35);
      return finish(s, 70);
    case 'hatstand':
      s.disc(8, 8, 1.5, dark[2]);
      s.line(4, 4, 12, 12, dark[2]);
      s.line(12, 4, 4, 12, dark[2]);
      s.disc(5, 5, 1.5, hex('#4a3a5a'));
      return finish(s, 50);
    case 'millstone':
      s.disc(8, 8, 7, stone[2]);
      for (let a = 0; a < 8; a++) s.line(8, 8, 8 + Math.cos(a * 0.785) * 6.5, 8 + Math.sin(a * 0.785) * 6.5, stone[1]);
      s.disc(8, 8, 1.5, hex('#3a3632'));
      s.dome(8, 8, 7, 0.25);
      return finish(s, 70);
    case 'oven':
      s.disc(8, 8, 6.5, hex('#b06a48'));
      s.dome(8, 8, 6.5, 0.45);
      s.rect(6, 12, 4, 3, hex('#2a1a14'));
      return finish(s, 70);
    case 'privy':
      s.rect(3, 3, 10, 10, wood[2]);
      s.rect(3, 3, 10, 1, wood[3]);
      s.ellipse(8, 8, 2, 2.6, hex('#1a1410'));
      return finish(s, 40);
    case 'rack':
      s.rect(1, 2, 14, 2, dark[2]);
      for (let x = 2; x < 14; x += 3) {
        s.rect(x, 4, 1, 9, iron[3]);
        s.rect(x - 1, 11, 3, 2, rng.chance(0.5) ? iron[2] : dark[3]);
      }
      return finish(s, 50);
    case 'sack':
      for (const [x, y] of [[5.5, 9], [10.5, 8], [8, 5]]) {
        s.disc(x, y, 3, hex('#c0a878'));
        s.set(x, y - 2, hex('#8a7048'));
      }
      s.dome(8, 8, 7, 0.3);
      return finish(s, 60);
    case 'sawbench':
      s.line(2, 3, 13, 12, dark[2]);
      s.line(13, 3, 2, 12, dark[2]);
      s.rect(1, 6, 14, 4, hex('#a0784a'));
      s.ring(1.5, 8, 0, 1.5, hex('#c8a070'));
      return finish(s, 60);
    case 'sideboard':
      s.rect(1, 2, 14, 7, dark[2]);
      s.rect(1, 2, 14, 1, dark[3]);
      for (const x of [3.5, 7.5, 11.5]) {
        s.disc(x, 5, 1.6, hex('#e8e4dc'));
        s.set(x - 0.5, 4.5, hex('#ffffff'));
      }
      return finish(s, 60);
    case 'straw':
      s.disc(8, 8, 6, hex('#d8c070'));
      for (let k = 0; k < 24; k++) {
        const x = 3 + rng.int(10), y = 3 + rng.int(10);
        s.line(x, y, x + rng.int(3) - 1, y + rng.int(3) - 1, rng.chance(0.5) ? hex('#b8984a') : hex('#f0dc90'));
      }
      return finish(s, 40);
    case 'stool':
      s.disc(8, 8, 4, wood[2]);
      s.ring(8, 8, 3, 4, wood[1]);
      s.dome(8, 8, 4, 0.3);
      return finish(s, 50);
    case 'wardrobe':
      s.rect(1, 2, 14, 11, dark[2]);
      s.rect(1, 2, 14, 1, dark[4]);
      s.rect(8, 3, 1, 10, dark[0]);
      s.rect(6, 7, 1, 2, hex('#c8a040'));
      s.rect(9, 7, 1, 2, hex('#c8a040'));
      return finish(s, 90);
    case 'bedroll':
      s.rect(3, 2, 10, 12, hex('#8a7a5a'));
      s.rect(3, 2, 10, 3, hex('#a89870'));
      s.rect(3, 5, 10, 1, hex('#6a5a40'));
      return finish(s, 40);
    case 'fire_out':
      stoneRing(s, rng, 5.6);
      s.disc(8, 8, 3.4, hex('#5a5450'));
      for (let k = 0; k < 8; k++) s.set(6 + rng.int(5), 6 + rng.int(5), rng.chance(0.5) ? hex('#2a2624') : hex('#8a847c'));
      return finish(s, 40);
    case 'windbreak':
      for (let y = 5; y < 11; y++) for (let x = 0; x < 16; x++) s.set(x, y, (x + (y % 2) * 2) % 4 < 2 ? hex('#7a6a45') : hex('#5e5034'));
      for (let x = 1; x < 16; x += 5) s.rect(x, 4, 1, 8, hex('#4a3a24'));
      return finish(s, 70);
    case 'lean_to':
      for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) s.set(x, y, tone(hex('#7a6a45'), (y / 15) * -0.3 + ((x * 3 + y) % 5 === 0 ? -0.12 : 0)));
      for (let x = 2; x < 15; x += 3) s.line(x, 1, x, 14, hex('#5a4a30'));
      return finish(s, 60);
    case 'snare':
      s.ring(8, 8, 2, 2.8, hex('#b0a080'));
      s.line(10, 9, 14, 13, hex('#7a5a3a'));
      return finish(s, 0);
    case 'grate':
      s.rect(2, 2, 12, 12, hex('#1a1816'));
      for (let i = 2; i < 14; i += 3) {
        s.rect(i, 2, 1, 12, iron[3]);
        s.rect(2, i, 12, 1, iron[2]);
      }
      s.frame(2, 2, 12, 12, iron[3]);
      return finish(s, 0);
    case 'pillar':
      s.disc(8, 8, 6, stone[2]);
      for (let a = 0; a < 12; a++) s.set(8 + Math.cos(a * 0.524) * 5.2, 8 + Math.sin(a * 0.524) * 5.2, stone[1]);
      s.dome(8, 8, 6, 0.4);
      return finish(s, 100);
    case 'statue':
      s.rect(2, 2, 12, 12, stone[1]);
      s.rect(2, 2, 12, 1, stone[3]);
      s.ellipse(8, 9, 4, 2.5, stone[3]);
      s.disc(8, 7, 2, stone[4]);
      s.dome(8, 8, 7, 0.3);
      return finish(s, 90);
    case 'bones': {
      const bone = hex('#e0d8c0');
      for (let k = 0; k < 4; k++) {
        const x = 2 + rng.int(10), y = 2 + rng.int(10), a = rng.next() * 3;
        s.line(x, y, x + Math.cos(a) * 4, y + Math.sin(a) * 4, bone);
        s.set(x, y, tone(bone, 0.15));
      }
      if (v === 0) {
        s.disc(10, 10, 2, bone);
        s.set(9, 10, hex('#3a3028'));
        s.set(11, 10, hex('#3a3028'));
      }
      return finish(s, 30);
    }
    case 'urn':
      s.disc(8, 8, 5, hex('#a08060'));
      s.disc(8, 8, 2.2, hex('#3a2a20'));
      s.ring(8, 8, 2.2, 3, hex('#c0a080'));
      s.dome(8, 8, 5, 0.35);
      return finish(s, 70);
    case 'throne': {
      const gold = hex('#c8a040');
      s.rect(2, 1, 12, 4, stone[1]);
      s.rect(3, 5, 10, 9, stone[2]);
      s.rect(2, 5, 2, 9, stone[1]);
      s.rect(12, 5, 2, 9, stone[1]);
      s.rect(5, 6, 6, 6, hex('#8a2a30'));
      s.rect(2, 1, 12, 1, gold);
      return finish(s, 80);
    }
    case 'cart':
      s.rect(3, 3, 10, 10, hex('#6a6460'));
      s.rect(4, 4, 8, 8, hex('#3a3634'));
      for (const y of [4, 10]) {
        s.rect(1, y, 2, 3, iron[1]);
        s.rect(13, y, 2, 3, iron[1]);
      }
      return finish(s, 60);
    case 'support':
      s.rect(5, 5, 6, 6, hex('#8a6a40'));
      s.rect(0, 7, 16, 2, hex('#7a5a34'));
      s.ring(8, 8, 1, 2, hex('#6a4a2a'));
      return finish(s, 50);
    case 'ore':
      rockLump(s, rng, 8, 8, 6, 5.5, '#5e574c');
      for (let k = 0; k < 7; k++) {
        const x = 4 + rng.int(8), y = 4 + rng.int(8);
        s.set(x, y, hex('#e8c050'));
        s.set(x + 1, y, hex('#a07a28'));
      }
      s.line(10, 4, 12, 7, hex('#2a2620'));
      return finish(s, 70);
    case 'pit':
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
        if (d < 6.5) s.set(x, y, tone(hex('#141210'), d > 5.5 ? 0.15 : 0));
      }
      return finish(s, 0);
  }
  return null;
}

/** Long furniture that joins its own kind: drawn running east and west (turned for north and south). */
function longPiece(name: string, mask: number): Sprite | null {
  const ns = !!(mask & (N | S)) && !(mask & (E | W));
  const joinedA = ns ? !!(mask & N) : !!(mask & W), joinedB = ns ? !!(mask & S) : !!(mask & E);
  // Paint as running east-west; "a" is the west end (north when turned).
  const s = new Sprite(), rng = new Rng(hashStr(name) + mask);
  const x0 = joinedA ? 0 : 1, x1 = joinedB ? 15 : 14;
  const band = (y0: number, y1: number, c: RGB) => s.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, c);
  const wood = ramp('#9a6a3a'), dark = ramp('#7a4a2a');
  switch (name) {
    case 'table': {
      band(2, 13, wood[2]);
      for (let y = 4; y < 14; y += 3) for (let x = x0; x <= x1; x++) s.set(x, y, wood[1]);
      for (let x = x0; x <= x1; x++) s.set(x, 2, wood[3]);
      break;
    }
    case 'trestle': {
      const c = ramp('#9a7a52');
      band(3, 12, c[2]);
      for (let y = 5; y < 12; y += 3) for (let x = x0; x <= x1; x++) s.set(x, y, c[1]);
      if (!joinedA) s.rect(2, 2, 2, 12, c[0]);
      if (!joinedB) s.rect(12, 2, 2, 12, c[0]);
      break;
    }
    case 'bench':
      band(6, 9, wood[2]);
      for (let x = x0; x <= x1; x++) s.set(x, 6, wood[3]);
      break;
    case 'pew':
      band(4, 6, dark[1]);
      band(7, 11, dark[2]);
      for (let x = x0; x <= x1; x++) s.set(x, 7, dark[3]);
      break;
    case 'counter':
      band(2, 11, ramp('#8a6038')[2]);
      for (let x = x0; x <= x1; x++) {
        s.set(x, 2, ramp('#8a6038')[4]);
        s.set(x, 11, ramp('#8a6038')[0]);
      }
      if (rng.chance(0.5)) s.disc(6 + rng.int(4), 6, 1.5, hex('#c8c0b0'));
      break;
    case 'workbench': {
      const c = ramp('#8a6a48');
      band(2, 12, c[2]);
      for (let x = x0; x <= x1; x++) s.set(x, 2, c[4]);
      s.line(4, 5, 9, 5, hex('#6a6a70'));
      s.rect(4, 4, 2, 3, hex('#4a3a2a'));
      for (let x = 7; x < 13; x++) s.set(x, 9, x % 2 ? hex('#a8a8b0') : hex('#808088'));
      break;
    }
    case 'bookcase': {
      band(1, 7, dark[1]);
      const books = ['#8a2a2a', '#2a4a6a', '#3a6a3a', '#8a7a3a', '#5a3a6a', '#a06a3a'].map(hex);
      for (let x = x0 + 1; x < x1; x++) {
        const c = rng.pick(books);
        for (let y = 2; y < 7; y++) s.set(x, y, y === 2 ? tone(c, 0.15) : c);
      }
      break;
    }
    case 'shelf': {
      band(1, 6, ramp('#8a6038')[2]);
      const jars = ['#c8b8a0', '#6a8aa0', '#a06a4a', '#e0d8c8'].map(hex);
      for (let x = x0 + 2; x < x1 - 1; x += 3) {
        s.disc(x, 3.5, 1.2, rng.pick(jars));
      }
      break;
    }
    case 'rug': {
      const red = ramp('#a04a4a'), gold = hex('#d8b060');
      band(1, 14, red[2]);
      for (let x = x0; x <= x1; x++) {
        s.set(x, 2, gold);
        s.set(x, 13, gold);
        if (x % 4 === 0) s.set(x, 8, gold);
      }
      for (let x = x0; x <= x1; x++) for (const y of [5, 11]) if ((x + y) % 3 === 0) s.set(x, y, red[4]);
      if (!joinedA) for (let y = 1; y < 15; y += 2) s.set(0, y, gold);
      if (!joinedB) for (let y = 1; y < 15; y += 2) s.set(15, y, gold);
      break;
    }
    case 'bed': {
      const frame = ramp('#7a5030'), blanket = ramp('#a04a4a');
      band(1, 14, frame[2]);
      s.rect(x0 + (joinedA ? 0 : 1), 2, x1 - x0 + 1 - (joinedA ? 0 : 1) - (joinedB ? 0 : 1), 12, blanket[2]);
      for (let x = x0; x <= x1; x++) if (x % 3 === 0) s.set(x, 8, blanket[1]);
      if (!joinedA) {
        s.rect(2, 3, 4, 10, hex('#ece6d8'));
        s.rect(2, 3, 4, 1, hex('#ffffff'));
        s.rect(6, 2, 1, 12, blanket[3]);
      }
      break;
    }
    default:
      return null;
  }
  const open = (joinedA ? 'w' : '') + (joinedB ? 'e' : '');
  s.outline(-0.45, open);
  s.shadow(50);
  return ns ? transpose(s) : s;
}

// ---- Decorations ---------------------------------------------------------------------------------

function decor(name: string, v: number): Sprite {
  const s = new Sprite(), rng = new Rng(hashStr(name) + v * 211);
  const cx = 5 + rng.int(6), cy = 5 + rng.int(6);
  switch (name) {
    case 'grass_tuft': {
      const p = ramp('#4f7a34');
      for (let k = 0; k < 5 + v; k++) s.line(cx, cy + 2, cx + rng.int(5) - 2, cy - 1 - rng.int(2), p[1 + rng.int(4)]);
      break;
    }
    case 'wildflowers': {
      const c = hex(['#f4f0e0', '#f0d040', '#7a9ae8'][v % 3]);
      for (let k = 0; k < 3; k++) {
        const x = cx + rng.int(7) - 3, y = cy + rng.int(7) - 3;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) s.set(x + dx, y + dy, c);
        s.set(x, y, hex('#e8b030'));
      }
      break;
    }
    case 'pebbles':
      for (let k = 0; k < 3; k++) {
        const x = cx + rng.int(6) - 3, y = cy + rng.int(6) - 3, c = tone(hex('#8a8478'), rng.range(-0.1, 0.2));
        s.rect(x, y, 2, 1 + rng.int(2), c);
        s.set(x, y, tone(c, 0.2));
      }
      s.shadow(60);
      break;
    case 'twigs':
      for (let k = 0; k < 3; k++) {
        const x = cx + rng.int(5) - 2, y = cy + rng.int(5) - 2, a = rng.next() * 3;
        s.line(x, y, x + Math.cos(a) * (3 + rng.int(3)), y + Math.sin(a) * 3, hex('#6a5232'));
      }
      break;
    case 'toadstools':
      for (let k = 0; k < 3; k++) {
        const x = cx + rng.int(5) - 2, y = cy + rng.int(5) - 2;
        s.disc(x, y, 1.3, hex(v ? '#c03a2a' : '#d8a050'));
        s.set(x - 0.5, y - 0.5, hex('#f8f0e0'));
      }
      s.shadow(60);
      break;
    case 'fronds': {
      const p = ramp('#4a8a3a');
      for (let k = 0; k < 4; k++) {
        const a = rng.next() * Math.PI * 2;
        s.line(cx, cy, cx + Math.cos(a) * 4, cy + Math.sin(a) * 4, p[2 + (k % 2)]);
      }
      break;
    }
    case 'shells':
      for (let k = 0; k < 3; k++) {
        const x = cx + rng.int(6) - 3, y = cy + rng.int(6) - 3;
        s.disc(x, y, 1, hex('#f0e8d8'));
        s.set(x + 1, y, hex('#d8b8a8'));
      }
      break;
    case 'sedge': {
      const p = ramp('#6a7a3a');
      for (let k = 0; k < 6; k++) {
        const x = cx + rng.int(5) - 2;
        s.line(x, cy + 2, x + rng.int(3) - 1, cy - 2 - rng.int(2), p[1 + rng.int(3)]);
      }
      break;
    }
    case 'lichen':
      for (let k = 0; k < 2; k++) {
        const x = cx + rng.int(5) - 2, y = cy + rng.int(5) - 2;
        s.disc(x, y, rng.range(1, 1.8), hex(rng.pick(['#b8c090', '#c8c8a0', '#d0b060'])));
      }
      break;
    case 'cracks': {
      let x = cx - 3, y = cy;
      for (let k = 0; k < 8; k++) {
        s.set(x, y, hex('#6a5a40'));
        x++;
        y += rng.pick([-1, 0, 0, 1]);
        if (k === 4) s.line(x, y, x + 1, y + 2, hex('#6a5a40'));
      }
      break;
    }
    case 'fallen_leaves':
      for (let k = 0; k < 4; k++) {
        const x = cx + rng.int(7) - 3, y = cy + rng.int(7) - 3, c = hex(rng.pick(['#d07a30', '#c04a28', '#e0b040', '#a8602a']));
        s.set(x, y, c);
        s.set(x + 1, y, tone(c, -0.15));
        s.set(x, y + 1, tone(c, 0.1));
      }
      break;
    default:
      throw new Error(`Unknown decoration ${name}`);
  }
  return s;
}

export function paintObject(name: string, variant: number, mask?: number): Sprite | null {
  if (mask !== undefined) {
    const piece = longPiece(name, mask);
    if (piece) return piece;
  }
  if (name.startsWith('tree_') && name !== 'tree_trunk') return tree(name, variant);
  return plantOrNull(name, variant) ?? thing(name, variant) ?? way(name) ?? furniture(name, variant);
}

function plantOrNull(name: string, v: number): Sprite | null {
  return ['bush', 'scrub', 'tall_grass', 'ferns', 'reeds', 'flowers', 'cactus', 'mushrooms', 'crops', 'vines'].includes(name) ? plant(name, v) : null;
}

export { decor as paintDecor, treePart as paintTreePart };
