/**
 * Rain and snow falling over the local map: a canvas laid over the map, drawn only while something
 * is falling out of doors (game/weather.ts). Rain falls in streaks slanted by the wind; snow drifts
 * down in flakes; how many by how hard it comes down. It takes no part in the game.
 */
import type { Weather } from '@worldforge/core/weather/weather';

interface Drop {
  x: number;
  y: number;
  v: number;
  len: number;
}

export class RainLayer {
  readonly canvas = document.createElement('canvas');
  private drops: Drop[] = [];
  private w: Weather | null = null;
  private frame = 0;
  private last = 0;

  constructor() {
    const c = this.canvas;
    c.style.position = 'absolute';
    c.style.inset = '0';
    c.style.pointerEvents = 'none';
    c.style.width = '100%';
    c.style.height = '100%';
  }

  mount(el: HTMLElement): void {
    el.appendChild(this.canvas);
  }

  /** What is falling now (null: nothing, or indoors). */
  set(w: Weather | null): void {
    const falling = w && w.kind !== 'none' ? w : null;
    this.w = falling;
    if (falling && !this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame((t) => this.tick(t));
    }
    if (!falling) {
      this.drops = [];
      this.canvas.getContext('2d')?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  destroy(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.w = null;
    this.canvas.remove();
  }

  private tick(t: number): void {
    this.frame = 0;
    const w = this.w;
    if (!w) return;
    const c = this.canvas, g = c.getContext('2d');
    if (!g) return;
    const W = c.clientWidth, H = c.clientHeight;
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const snow = w.kind.includes('snow');
    // How many: by how hard it falls, and the size of the view.
    const want = Math.round(Math.min(900, (snow ? 60 : 40) + w.rainMm * (snow ? 90 : 70)) * ((W * H) / 900000));
    while (this.drops.length < want) this.drops.push({ x: Math.random() * W, y: Math.random() * H, v: snow ? 30 + Math.random() * 40 : 500 + Math.random() * 300, len: snow ? 1.5 + Math.random() * 1.5 : 8 + Math.random() * 10 });
    if (this.drops.length > want) this.drops.length = want;
    // The wind slants it (a rough sense of its strength and side).
    const slant = Math.max(-0.6, Math.min(0.6, (w.windMs / 20) * Math.sin((w.windFrom * Math.PI) / 180) * -1));
    g.clearRect(0, 0, W, H);
    g.strokeStyle = snow ? 'rgba(240,244,255,0.85)' : 'rgba(170,190,220,0.45)';
    g.fillStyle = 'rgba(240,244,255,0.9)';
    g.lineWidth = 1;
    g.beginPath();
    for (const d of this.drops) {
      d.y += d.v * dt;
      d.x += d.v * dt * slant + (snow ? Math.sin((t / 600 + d.len * 3) % 6.28) * 12 * dt : 0);
      if (d.y > H) {
        d.y = -d.len;
        d.x = Math.random() * W;
      }
      if (d.x < 0) d.x += W;
      else if (d.x > W) d.x -= W;
      if (snow) g.rect(d.x, d.y, d.len, d.len);
      else {
        g.moveTo(d.x, d.y);
        g.lineTo(d.x - slant * d.len, d.y - d.len);
      }
    }
    if (snow) g.fill();
    else g.stroke();
    this.frame = requestAnimationFrame((tt) => this.tick(tt));
  }
}
