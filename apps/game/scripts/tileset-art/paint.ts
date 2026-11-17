/** A tiny pixel-art toolkit for the tileset generator: colours, seeded randomness and a 16 × 16 sprite. */
import { deflateSync } from 'node:zlib';

export type RGB = [number, number, number];

export const hex = (h: string): RGB => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const lerp = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t),
];

// Highlights lean warm and shadows cool, as pixel artists ramp them.
const WARM: RGB = [255, 244, 210], COOL: RGB = [20, 18, 40];

/** Lighter (f > 0) or darker (f < 0) along a warm-to-cool ramp. */
export const tone = (c: RGB, f: number): RGB => (f >= 0 ? lerp(c, WARM, f) : lerp(c, COOL, -f));

/** Five shades of a colour, darkest first. */
export const ramp = (c: RGB | string, spread = 1): RGB[] => {
  const b = typeof c === 'string' ? hex(c) : c;
  return [-0.42, -0.2, 0, 0.16, 0.32].map((f) => tone(b, f * spread));
};

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export class Rng {
  private a: number;
  constructor(seed: number) {
    this.a = seed >>> 0;
  }
  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Smooth noise over a 16-pixel tile that wraps, with its lattice points on the tile's border fixed
 * at the middle value: any two tiles made with it meet without a seam, whatever their seeds.
 */
export function seamless(rng: Rng, cell = 4, size = 16): Float32Array {
  const n = size / cell;
  const lat = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) lat[j * (n + 1) + i] = i === 0 || j === 0 || i === n || j === n ? 0.5 : rng.next();
  const out = new Float32Array(size * size);
  const sm = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x / cell, fy = y / cell, i = Math.floor(fx), j = Math.floor(fy);
      const tx = sm(fx - i), ty = sm(fy - j);
      const v = (a: number, b: number) => lat[(j + b) * (n + 1) + i + a];
      out[y * size + x] = (v(0, 0) * (1 - tx) + v(1, 0) * tx) * (1 - ty) + (v(0, 1) * (1 - tx) + v(1, 1) * tx) * ty;
    }
  }
  return out;
}

export class Sprite {
  readonly px: Uint8ClampedArray;

  constructor(readonly w = 16, readonly h = 16) {
    this.px = new Uint8ClampedArray(w * h * 4);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  set(x: number, y: number, c: RGB, a = 255): void {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inside(x, y)) return;
    const o = (y * this.w + x) * 4;
    this.px[o] = c[0];
    this.px[o + 1] = c[1];
    this.px[o + 2] = c[2];
    this.px[o + 3] = a;
  }

  /** Set with wrap-around, for seamless ground. */
  wset(x: number, y: number, c: RGB, a = 255): void {
    this.set(((Math.round(x) % this.w) + this.w) % this.w, ((Math.round(y) % this.h) + this.h) % this.h, c, a);
  }

  get(x: number, y: number): RGB {
    const o = (y * this.w + x) * 4;
    return [this.px[o], this.px[o + 1], this.px[o + 2]];
  }

  alpha(x: number, y: number): number {
    return this.inside(x, y) ? this.px[(y * this.w + x) * 4 + 3] : 0;
  }

  /** Paints c over a pixel with opacity t (keeps it opaque if it was). */
  blend(x: number, y: number, c: RGB, t: number, wrap = false): void {
    if (wrap) {
      x = ((Math.round(x) % this.w) + this.w) % this.w;
      y = ((Math.round(y) % this.h) + this.h) % this.h;
    }
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inside(x, y)) return;
    const a = this.alpha(x, y);
    if (a === 0) this.set(x, y, c, Math.round(255 * t));
    else this.set(x, y, lerp(this.get(x, y), c, t), Math.max(a, Math.round(255 * t)));
  }

  /** Shifts an opaque pixel lighter or darker. */
  tone(x: number, y: number, f: number, wrap = false): void {
    if (wrap) {
      x = ((Math.round(x) % this.w) + this.w) % this.w;
      y = ((Math.round(y) % this.h) + this.h) % this.h;
    }
    if (this.alpha(x, y) === 0) return;
    this.set(x, y, tone(this.get(x, y), f), this.alpha(x, y));
  }

  fill(c: RGB): void {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c);
  }

  rect(x: number, y: number, w: number, h: number, c: RGB, a = 255): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a);
  }

  frame(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let i = 0; i < w; i++) {
      this.set(x + i, y, c);
      this.set(x + i, y + h - 1, c);
    }
    for (let j = 0; j < h; j++) {
      this.set(x, y + j, c);
      this.set(x + w - 1, y + j, c);
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 255): void {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, a);
      }
    }
  }

  disc(cx: number, cy: number, r: number, c: RGB, a = 255): void {
    this.ellipse(cx, cy, r, r, c, a);
  }

  /** A ring between radii r0 and r1. */
  ring(cx: number, cy: number, r0: number, r1: number, c: RGB): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d >= r0 && d <= r1) this.set(x, y, c);
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 255, wrap = false): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (wrap) this.wset(x0, y0, c, a);
      else this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** A line w pixels thick. */
  thick(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
    const len = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
    const steps = Math.ceil(len * 2);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      this.disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, c);
    }
  }

  /** Light from the top-left over every opaque pixel within a disc, as if it were a dome. */
  dome(cx: number, cy: number, r: number, k = 0.35): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.alpha(x, y)) continue;
        const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r;
        if (dx * dx + dy * dy > 1.1) continue;
        this.tone(x, y, (-(dx + dy) / Math.SQRT2) * k);
      }
    }
  }

  /**
   * Darkens the opaque pixels on the shape's rim (a transparent neighbour). Sides of the sprite
   * listed in `open` (n, e, s, w) are treated as continuing, for tiles that join their neighbours.
   */
  outline(f = -0.45, open = ''): void {
    const rim: [number, number][] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.alpha(x, y)) continue;
        const empty = (nx: number, ny: number) => {
          if (ny < 0) return !open.includes('n');
          if (ny >= this.h) return !open.includes('s');
          if (nx < 0) return !open.includes('w');
          if (nx >= this.w) return !open.includes('e');
          return this.alpha(nx, ny) < 128;
        };
        if (empty(x - 1, y) || empty(x + 1, y) || empty(x, y - 1) || empty(x, y + 1)) rim.push([x, y]);
      }
    }
    for (const [x, y] of rim) this.tone(x, y, f);
  }

  /** A soft shadow cast to the bottom-right, under the shape. */
  shadow(a = 70, dx = 1, dy = 1): void {
    const src = Uint8ClampedArray.from(this.px);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y)) continue;
        const sx = x - dx, sy = y - dy;
        if (sx >= 0 && sy >= 0 && src[(sy * this.w + sx) * 4 + 3] > 128) this.set(x, y, [16, 12, 20], a);
      }
    }
  }

  /** Composites another sprite over this one. */
  draw(o: Sprite, ox = 0, oy = 0): void {
    for (let y = 0; y < o.h; y++) {
      for (let x = 0; x < o.w; x++) {
        const a = o.alpha(x, y);
        if (!a) continue;
        if (a === 255) this.set(x + ox, y + oy, o.get(x, y));
        else this.blend(x + ox, y + oy, o.get(x, y), a / 255);
      }
    }
  }

  /** Clears the pixels where keep(x, y) is false. */
  mask(keep: (x: number, y: number) => boolean): void {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (!keep(x, y)) this.set(x, y, [0, 0, 0], 0);
  }

  clone(): Sprite {
    const s = new Sprite(this.w, this.h);
    s.px.set(this.px);
    return s;
  }
}

/** Minimal RGBA PNG encoder. */
export function encodePng(rgba: Uint8ClampedArray, w: number, h: number): Buffer {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const chunk = (type: string, data: Uint8Array) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    Buffer.from(data).copy(out, 8);
    let c = 0xffffffff;
    for (let i = 4; i < 8 + data.length; i++) c = crcTable[(c ^ out[i]) & 255] ^ (c >>> 8);
    out.writeUInt32BE((c ^ 0xffffffff) >>> 0, 8 + data.length);
    return out;
  };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}
