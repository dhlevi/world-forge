/**
 * Placeholder pictures of animals (TILESET.md, Animals; core local/fauna.ts): drawn by body plan
 * (four-legged, small, bird, serpent) and size in the species' colour, facing each way, standing,
 * in a stride, and (birds) flying. A tileset's frames take their place where it has them.
 */
import type { Facing } from '@worldforge/core/local/tiles';
import type { Species } from '@worldforge/core/local/fauna';

const SCALE: Record<Species['size'], number> = { tiny: 0.5, small: 0.7, medium: 0.85, large: 1, huge: 1.25 };

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16) || 0x808080;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/**
 * Draws an animal at (x, y) in a 16 × 16 cell, facing `d`, frame `fr` (0 standing; 1 and 2 a
 * stride or a wingbeat), flying or not.
 */
export function drawAnimal(g: CanvasRenderingContext2D, x: number, y: number, s: Species, d: Facing, fr: number, flying: boolean): void {
  const k = SCALE[s.size], body = s.colour, dark = shade(s.colour, 0.6), light = shade(s.colour, 1.25);
  const side = d === 'e' || d === 'w', flip = d === 'w';
  const cx = x + 8, base = y + 14;
  const rect = (rx: number, ry: number, w: number, h: number, fill: string) => {
    g.fillStyle = fill;
    const X = side && flip ? -rx - w : rx;
    g.fillRect(Math.round(cx + X * k), Math.round(base + ry * k), Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
  };
  // A shadow on the ground (for a flying bird, the game draws its own below it).
  if (!flying) {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(Math.round(cx - 5 * k), base, Math.max(2, Math.round(10 * k)), 1);
  }
  switch (s.plan) {
    case 'quad': {
      const stride = fr === 1 ? 1 : fr === 2 ? -1 : 0;
      if (side) {
        rect(-6, -9, 11, 5, body); // body
        rect(4, -12, 4, 4, body); // head
        rect(7, -11, 2, 2, dark); // muzzle
        rect(-5 + stride, -4, 2, 4, dark); // legs
        rect(2 - stride, -4, 2, 4, dark);
        rect(-7, -9, 1, 3, dark); // tail
        if (s.id.includes('deer') || s.id === 'elk') rect(4, -15, 1, 3, light);
      } else {
        rect(-3, -11, 6, 9, body);
        rect(-2, d === 's' ? -13 : -12, 4, 3, d === 's' ? light : body);
        rect(-3, -2 + (stride > 0 ? 0 : 1), 2, 2, dark);
        rect(1, -2 + (stride < 0 ? 0 : 1), 2, 2, dark);
      }
      break;
    }
    case 'small': {
      const hop = fr === 1 ? -1 : 0;
      if (side) {
        rect(-4, -6 + hop, 7, 4, body);
        rect(2, -8 + hop, 3, 3, body);
        if (s.id === 'hare' || s.id === 'rabbit') rect(2, -11 + hop, 1, 3, dark);
        rect(-5, -6 + hop, 2, 2, s.id === 'squirrel' ? light : dark);
      } else {
        rect(-2, -7 + hop, 5, 6, body);
        rect(-1, -9 + hop, 3, 2, body);
        if (s.id === 'hare' || s.id === 'rabbit') rect(-1, -12 + hop, 1, 3, dark);
      }
      break;
    }
    case 'bird': {
      if (flying) {
        const up = fr === 1;
        rect(-2, -6, 4, 3, body);
        rect(-8, up ? -9 : -5, 6, 2, dark);
        rect(2, up ? -9 : -5, 6, 2, dark);
      } else if (side) {
        rect(-3, -6, 6, 4, body);
        rect(2, -8, 3, 3, body);
        rect(5, -7, 1, 1, '#d0a040');
        rect(-1, -2, 1, 2, dark);
        if (s.id === 'heron') rect(2, -12, 1, 4, body);
      } else {
        rect(-2, -7, 4, 5, body);
        rect(-1, -9, 3, 2, body);
        rect(-1, -2, 1, 2, dark);
      }
      break;
    }
    case 'serpent': {
      const w = fr === 1 ? 1 : 0;
      if (side) for (let i = 0; i < 6; i++) rect(-7 + i * 2, -2 - ((i + w) % 2), 2, 2, i % 2 ? body : dark);
      else for (let i = 0; i < 5; i++) rect(-1 + (((i + w) % 2) ? 1 : -1), -9 + i * 2, 2, 2, i % 2 ? body : dark);
      break;
    }
  }
}
