/** Ground tiles: natural ground, water (with shore joins), made ground and indoor floors. */
import { type RGB, Rng, Sprite, hashStr, hex, ramp, seamless, tone } from './paint';

/** Mottled base: two octaves of seamless noise mapped onto the middle shades of a ramp. */
function mottle(s: Sprite, rng: Rng, pal: RGB[], amt = 1, cell = 4): void {
  const a = seamless(rng, cell), b = seamless(rng, 8);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = 0.55 * a[y * 16 + x] + 0.45 * b[y * 16 + x] + (rng.next() - 0.5) * 0.24 * amt;
      s.set(x, y, pal[v < 0.36 ? 1 : v < 0.63 ? 2 : 3]);
    }
  }
}

const specks = (s: Sprite, rng: Rng, n: number, colors: RGB[]) => {
  for (let k = 0; k < n; k++) s.set(rng.int(16), rng.int(16), rng.pick(colors));
};

/** Short blades of grass: a light tip over a darker root. */
function blades(s: Sprite, rng: Rng, n: number, light: RGB, dark: RGB): void {
  for (let k = 0; k < n; k++) {
    const x = 1 + rng.int(14), y = 1 + rng.int(13), lean = rng.int(3) - 1;
    s.set(x, y + 1, dark);
    s.set(x + (rng.chance(0.4) ? lean : 0), y, light);
  }
}

/** A small stone with light on its top-left and shadow under it. */
function stone(s: Sprite, x: number, y: number, w: number, h: number, c: RGB): void {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const corner = (i === 0 || i === w - 1) && (j === 0 || j === h - 1) && w > 2 && h > 2;
      if (corner) continue;
      const f = i + j < 2 ? 0.22 : i === w - 1 || j === h - 1 ? -0.22 : 0;
      s.set(x + i, y + j, tone(c, f));
    }
  }
  s.blend(x + w, y + h - 1, [20, 16, 24], 0.35);
  s.blend(x + 1, y + h, [20, 16, 24], 0.35);
}

function pebbles(s: Sprite, rng: Rng, n: number, base: RGB, big = 2): void {
  for (let k = 0; k < n; k++) {
    const w = 1 + rng.int(big), h = 1 + rng.int(big);
    stone(s, 1 + rng.int(14 - w), 1 + rng.int(14 - h), w, h, tone(base, rng.range(-0.15, 0.2)));
  }
}

/** A wandering crack. */
function crack(s: Sprite, rng: Rng, c: RGB, len: number): void {
  let x = rng.int(16), y = rng.int(16);
  const dx = rng.pick([-1, 1]), dy = rng.pick([-1, 1]);
  for (let k = 0; k < len; k++) {
    s.wset(x, y, c);
    if (rng.chance(0.5)) x += dx;
    else y += dy;
    if (rng.chance(0.15)) x -= dx;
  }
}

/** Voronoi polygons (salt crust, cracked earth, flagstones): returns, per pixel, cell id and edge. */
function cells(rng: Rng, n: number): { id: Int32Array; edge: Uint8Array } {
  const pts: [number, number][] = [];
  for (let k = 0; k < n; k++) pts.push([rng.range(0, 16), rng.range(0, 16)]);
  const id = new Int32Array(256), d1 = new Float32Array(256), d2 = new Float32Array(256);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let a = Infinity, b = Infinity, best = 0;
      pts.forEach(([px, py], k) => {
        for (const ox of [-16, 0, 16]) {
          for (const oy of [-16, 0, 16]) {
            const d = Math.hypot(x + 0.5 - px - ox, y + 0.5 - py - oy);
            if (d < a) {
              b = a;
              a = d;
              best = k;
            } else if (d < b) b = d;
          }
        }
      });
      id[y * 16 + x] = best;
      d1[y * 16 + x] = a;
      d2[y * 16 + x] = b;
    }
  }
  const edge = new Uint8Array(256);
  for (let i = 0; i < 256; i++) edge[i] = d2[i] - d1[i] < 0.9 ? 1 : 0;
  return { id, edge };
}

const GROUND: Record<string, (s: Sprite, rng: Rng, v: number) => void> = {
  grass(s, rng) {
    const p = ramp('#6f9a4a');
    mottle(s, rng, p);
    blades(s, rng, 18, p[4], p[0]);
    specks(s, rng, 3, [hex('#8fae55')]);
  },
  grass_lush(s, rng) {
    const p = ramp('#5c9142', 1.1);
    mottle(s, rng, p, 1.2);
    blades(s, rng, 26, p[4], p[0]);
    blades(s, rng, 8, tone(p[4], 0.15), p[1]);
  },
  grass_dry(s, rng) {
    const p = ramp('#a8a25a'), earth = ramp('#9a8050');
    mottle(s, rng, p);
    const n = seamless(rng, 4);
    for (let i = 0; i < 256; i++) if (n[i] > 0.7) s.set(i % 16, i >> 4, earth[n[i] > 0.8 ? 1 : 2]);
    blades(s, rng, 14, p[4], p[0]);
  },
  forest_floor(s, rng) {
    const p = ramp('#5f5a36');
    mottle(s, rng, p, 1.3);
    const leaf = ['#8a5a2a', '#a06a2a', '#6e6a2e', '#7a4a24', '#8a7a3a'].map(hex);
    for (let k = 0; k < 14; k++) {
      const x = 1 + rng.int(14), y = 1 + rng.int(14), c = rng.pick(leaf);
      s.set(x, y, c);
      s.set(x + 1, y, tone(c, -0.15));
      if (rng.chance(0.5)) s.set(x, y + 1, tone(c, 0.1));
    }
    const moss = ramp('#55753a');
    for (let k = 0; k < 2; k++) s.disc(2 + rng.int(12), 2 + rng.int(12), 1.4, moss[2]);
    specks(s, rng, 6, [p[0]]);
  },
  needle_floor(s, rng) {
    const p = ramp('#5b5638');
    mottle(s, rng, p);
    const needle = ['#8a5a32', '#7a4a2a', '#9a6a3a', '#6a4a2a'].map(hex);
    for (let k = 0; k < 26; k++) {
      const x = 1 + rng.int(14), y = 1 + rng.int(14), c = rng.pick(needle), d = rng.pick([-1, 1]);
      s.set(x, y, c);
      s.set(x + d, y + 1, tone(c, -0.12));
    }
  },
  moss(s, rng) {
    const p = ramp('#4f7a45', 1.1);
    mottle(s, rng, p, 1.2);
    for (let k = 0; k < 7; k++) {
      const x = 2 + rng.int(12), y = 2 + rng.int(12), r = rng.range(1, 2);
      s.disc(x, y, r, p[3]);
      s.set(x - 1, y - 1, p[4]);
      s.set(x + 1, y + 1, p[1]);
    }
  },
  jungle_floor(s, rng) {
    const p = ramp('#4a6a34');
    mottle(s, rng, p, 1.4);
    const root = hex('#4a3a24');
    for (let k = 0; k < 2; k++) {
      let x = rng.int(16), y = rng.int(16);
      for (let i = 0; i < 10; i++) {
        s.wset(x, y, root);
        x += rng.int(3) - 1 || 1;
        y += rng.chance(0.4) ? rng.pick([-1, 1]) : 0;
      }
    }
    const leaf = ramp('#3e7a2e');
    for (let k = 0; k < 4; k++) {
      const x = 2 + rng.int(11), y = 2 + rng.int(12);
      s.ellipse(x + 1.5, y + 1, 1.8, 1.1, leaf[rng.int(2) + 2]);
      s.set(x + 1, y + 1, leaf[1]);
    }
  },
  tundra(s, rng) {
    const p = ramp('#8b9a72');
    mottle(s, rng, p, 1.3);
    specks(s, rng, 12, [hex('#c8c8a0'), hex('#b8c090'), hex('#a0a888')]);
    blades(s, rng, 8, hex('#9aa070'), hex('#6a7450'));
  },
  dirt(s, rng) {
    const p = ramp('#8a7350');
    mottle(s, rng, p);
    specks(s, rng, 10, [p[0], p[4]]);
    pebbles(s, rng, 2, hex('#9a8a70'));
  },
  dry_earth(s, rng) {
    const p = ramp('#b79a6a');
    mottle(s, rng, p, 0.8);
    const { edge } = cells(rng, 4);
    for (let i = 0; i < 256; i++) if (edge[i] && rng.chance(0.85)) s.set(i % 16, i >> 4, p[0]);
    pebbles(s, rng, 2, hex('#a89070'));
  },
  sand(s, rng) {
    const p = ramp('#d9c48a', 0.7);
    mottle(s, rng, p, 1.3, 2);
    specks(s, rng, 10, [p[4], p[0]]);
  },
  desert_sand(s, rng) {
    const p = ramp('#e0b878', 0.8);
    mottle(s, rng, p, 0.8);
    const ph = rng.int(16);
    for (let row = 2; row < 16; row += 5) {
      for (let x = 0; x < 16; x++) {
        const y = row + Math.round(Math.sin(((x + ph) / 16) * 2 * Math.PI) * 1.2);
        s.wset(x, y, p[1]);
        s.wset(x, y - 1, p[4]);
      }
    }
  },
  gravel(s, rng) {
    const p = ramp('#9a948a');
    mottle(s, rng, p, 1.2, 2);
    pebbles(s, rng, 14, hex('#a8a296'));
  },
  rock(s, rng) {
    const p = ramp('#80786e', 1.1);
    mottle(s, rng, p, 1.1, 8);
    for (let k = 0; k < 3; k++) crack(s, rng, p[0], 6 + rng.int(6));
    specks(s, rng, 6, [p[4]]);
  },
  scree(s, rng) {
    const p = ramp('#958c80');
    mottle(s, rng, p, 1.2);
    for (let k = 0; k < 7; k++) {
      const w = 2 + rng.int(3), h = 2 + rng.int(2);
      stone(s, rng.int(15 - w), rng.int(15 - h), w, h, tone(hex('#a0978a'), rng.range(-0.15, 0.15)));
    }
  },
  snow(s, rng) {
    const p = [hex('#c8d4e2'), hex('#d8e2ec'), hex('#e8eef4'), hex('#f2f6f8'), hex('#ffffff')];
    mottle(s, rng, p, 0.7, 8);
    specks(s, rng, 4, [p[4]]);
  },
  ice(s, rng) {
    const p = ramp('#cfe3ec', 0.6);
    mottle(s, rng, p, 0.6, 8);
    for (let k = 0; k < 3; k++) {
      const x = rng.int(16), y = rng.int(16);
      for (let i = 0; i < 5; i++) s.wset(x + i, y - i, p[4]);
    }
    crack(s, rng, hex('#9fc4d6'), 8);
  },
  mud(s, rng) {
    const p = ramp('#6b5a3e');
    mottle(s, rng, p, 1.2);
    const pool = hex('#4a3e2c');
    for (let k = 0; k < 2; k++) {
      const x = 3 + rng.int(10), y = 3 + rng.int(10), rx = rng.range(1.5, 2.6);
      s.ellipse(x, y, rx, rx * 0.7, pool);
      s.set(x - 1, y - 1, hex('#8a7a62'));
    }
    specks(s, rng, 6, [p[4]]);
  },
  marsh(s, rng) {
    const p = ramp('#5d7451');
    mottle(s, rng, p, 1.2);
    const w = ramp('#4f6a6a');
    const n = seamless(rng, 4);
    for (let i = 0; i < 256; i++) if (n[i] > 0.68) s.set(i % 16, i >> 4, n[i] > 0.8 ? w[1] : w[2]);
    specks(s, rng, 3, [w[4]]);
    blades(s, rng, 10, hex('#8a9a52'), hex('#4f5e34'));
  },
  salt(s, rng) {
    const p = ramp('#e8e4d8', 0.6);
    mottle(s, rng, p, 0.6);
    const { edge } = cells(rng, 5);
    for (let i = 0; i < 256; i++) if (edge[i]) s.set(i % 16, i >> 4, hex('#c8bea8'));
  },
  cave_floor(s, rng) {
    const p = ramp('#5e574c', 1.1);
    mottle(s, rng, p, 1.4);
    const n = seamless(rng, 8);
    for (let i = 0; i < 256; i++) if (n[i] < 0.34) s.set(i % 16, i >> 4, p[0]);
    specks(s, rng, 10, [p[4], hex('#7a7266')]);
    pebbles(s, rng, 2, hex('#6e665a'));
  },
  road(s, rng) {
    const p = ramp('#a08a62');
    mottle(s, rng, p);
    const n = seamless(rng, 4);
    for (let i = 0; i < 256; i++) if (n[i] < 0.36) s.set(i % 16, i >> 4, p[1]);
    pebbles(s, rng, 3, hex('#a89a7e'));
    specks(s, rng, 6, [p[4]]);
  },
  track(s, rng) {
    const p = ramp('#94845f');
    mottle(s, rng, p);
    blades(s, rng, 7, hex('#7f9a4a'), hex('#5c7234'));
    specks(s, rng, 5, [p[0]]);
  },
  path(s, rng) {
    const p = ramp('#9c8b66', 0.8);
    mottle(s, rng, p, 0.8);
    specks(s, rng, 6, [p[0], p[4]]);
    pebbles(s, rng, 1, hex('#a89a80'));
  },
  cobbles(s, rng) {
    const gap = hex('#6a6358');
    s.fill(gap);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 2 : 0;
      for (let col = -1; col < 4; col++) {
        const x = col * 4 + off, y = row * 4;
        stone(s, x, y, 3, 3, tone(hex('#a29d92'), rng.range(-0.18, 0.12)));
      }
    }
  },
  flagstones(s, rng) {
    const joint = hex('#7a7468');
    s.fill(joint);
    const sizes = [[0, 0, 8, 8], [8, 0, 8, 5], [8, 5, 8, 3], [0, 8, 5, 8], [5, 8, 11, 8]];
    for (const [x, y, w, h] of sizes) {
      const c = tone(hex('#b0a998'), rng.range(-0.12, 0.1));
      s.rect(x, y, w - 1, h - 1, c);
      s.rect(x, y, w - 1, 1, tone(c, 0.12));
      s.rect(x, y + h - 2, w - 1, 1, tone(c, -0.1));
      for (let k = 0; k < 3; k++) s.set(x + 1 + rng.int(w - 3), y + 1 + rng.int(h - 3), tone(c, rng.range(-0.15, 0.1)));
    }
    if (rng.chance(0.6)) crack(s, rng, hex('#8a8476'), 4);
  },
  lawn(s, rng) {
    const p = ramp('#7aa552', 0.7);
    mottle(s, rng, p, 0.6);
    blades(s, rng, 22, p[4], p[1]);
  },
  garden_bed(s, rng, v) {
    const p = ramp('#6f6036');
    mottle(s, rng, p);
    const plant = ramp(['#5a8a3a', '#6a9a3a', '#7a8a3a'][v % 3]);
    for (let row = 2; row < 16; row += 4) {
      for (let x = 0; x < 16; x++) s.set(x, row + 1, p[0]);
      for (let x = 1 + rng.int(2); x < 16; x += 3) {
        s.set(x, row, plant[3]);
        s.set(x - 1, row, plant[2]);
        s.set(x + 1, row, plant[2]);
        s.set(x, row - 1, plant[4]);
      }
    }
  },
  field(s, rng, v) {
    const earth = ramp('#7a6a3e');
    mottle(s, rng, earth, 0.8);
    const crop = ramp(['#c8b060', '#9ab050', '#d8c070', '#8a9a40'][v % 4]);
    for (let row = 0; row < 16; row += 3) {
      for (let x = 0; x < 16; x++) {
        s.set(x, row, crop[rng.int(3) + 2]);
        if (rng.chance(0.5)) s.set(x, row + 1, crop[1]);
        s.set(x, row + 2, earth[1]);
      }
    }
  },
  vineyard(s, rng) {
    const p = ramp('#7a7040');
    mottle(s, rng, p);
    for (let col = 2; col < 16; col += 5) for (let y = 0; y < 16; y++) s.set(col, y, p[0]);
    specks(s, rng, 6, [hex('#5a7a32')]);
  },
  yard(s, rng) {
    const p = ramp('#8f7c58');
    mottle(s, rng, p, 1.1);
    const straw = [hex('#d8c070'), hex('#c8a858'), hex('#b8984a')];
    for (let k = 0; k < 9; k++) {
      const x = 1 + rng.int(13), y = 1 + rng.int(14), c = rng.pick(straw);
      s.set(x, y, c);
      s.set(x + 1, y + rng.pick([-1, 0, 1]), c);
    }
  },
  grave_ground(s, rng) {
    const p = ramp('#6d8a4c');
    mottle(s, rng, p, 1.3);
    const n = seamless(rng, 4);
    for (let i = 0; i < 256; i++) if (n[i] < 0.3) s.set(i % 16, i >> 4, hex('#7a6a48'));
    blades(s, rng, 14, p[4], p[0]);
  },
  planks(s, rng) {
    const p = ramp('#8c6a43');
    for (let row = 0; row < 4; row++) {
      const c = tone(p[2], rng.range(-0.1, 0.1)), joint = rng.int(16);
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 16; x++) {
          const g = rng.chance(0.18) ? -0.08 : 0;
          s.set(x, row * 4 + y, y === 3 || x === joint ? p[0] : y === 0 ? tone(c, 0.12) : tone(c, g));
        }
      }
      s.set((joint + 2) % 16, row * 4 + 1, p[1]);
    }
  },
  bridge(s, rng) {
    // Variants are picked per cell, so both are plank decks (a stone variant would patch a bridge).
    GROUND.planks(s, rng, 0);
    const nail = hex('#3e3428');
    for (let row = 0; row < 4; row++) {
      s.set(2, row * 4 + 1, nail);
      s.set(13, row * 4 + 1, nail);
    }
  },
  ditch(s, rng) {
    GROUND.mud(s, rng, 0);
    const w = hex('#4a4a3e');
    s.ellipse(8, 8, 4, 3, w);
    s.set(6, 7, hex('#7a7a6a'));
  },
  mound(s, rng) {
    GROUND.grass(s, rng, 0);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) s.tone(x, y, ((16 - x - y) / 16) * 0.12);
  },
  spoil(s, rng) {
    const p = ramp('#7b7262');
    mottle(s, rng, p, 1.3);
    for (let k = 0; k < 9; k++) {
      const w = 2 + rng.int(2), h = 2 + rng.int(2);
      stone(s, rng.int(15 - w), rng.int(15 - h), w, h, tone(hex('#8a8272'), rng.range(-0.2, 0.15)));
    }
  },
  floor_flags(s, rng) {
    const joint = hex('#5e584e');
    s.fill(joint);
    for (let row = 0; row < 2; row++) for (let col = -1; col < 2; col++) {
      const x = col * 8 + (row ? 4 : 0), c = tone(hex('#a59f92'), rng.range(-0.12, 0.08));
      s.rect(x, row * 8, 7, 7, c);
      s.rect(x, row * 8, 7, 1, tone(c, 0.12));
      for (let k = 0; k < 4; k++) s.set(x + 1 + rng.int(5), row * 8 + 1 + rng.int(5), tone(c, rng.range(-0.12, 0.08)));
    }
  },
  floor_boards(s, rng) {
    const p = ramp('#9b7650');
    for (let row = 0; row < 5; row++) {
      const c = tone(p[2], rng.range(-0.1, 0.08)), joint = rng.int(16), y0 = Math.round(row * 3.2);
      const h = Math.round((row + 1) * 3.2) - y0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < 16; x++) {
          const edge = y === h - 1 || x === joint;
          s.set(x, y0 + y, edge ? p[0] : rng.chance(0.15) ? tone(c, -0.07) : c);
        }
      }
    }
  },
  floor_earth(s, rng) {
    const p = ramp('#7f6a4a');
    mottle(s, rng, p, 0.9);
    const rush = [hex('#b8a060'), hex('#a08a48'), hex('#c8b070')];
    for (let k = 0; k < 7; k++) {
      const x = 1 + rng.int(12), y = 1 + rng.int(14), c = rng.pick(rush);
      for (let i = 0; i < 3; i++) s.set(x + i, y + (i === 2 && rng.chance(0.5) ? 1 : 0), c);
    }
  },
};

const WATER: Record<string, { c: string; bottom?: string; flow?: boolean; deep?: boolean }> = {
  water_shallow: { c: '#5b8fb0', bottom: '#8aa890' },
  water_deep: { c: '#2f5f86', deep: true },
  river: { c: '#4f86a8', bottom: '#7a9a88', flow: true },
  river_deep: { c: '#3a6f95', deep: true, flow: true },
};

/** Water with a light, foamy shore along each side that does not join more water. */
function water(name: string, mask: number): Sprite {
  const def = WATER[name], s = new Sprite(), rng = new Rng(hashStr(name) ^ (mask * 977));
  const p = ramp(def.c, 0.7);
  mottle(s, rng, p, 0.7, 8);
  if (def.bottom) {
    const b = hex(def.bottom);
    for (let k = 0; k < 14; k++) s.blend(1 + rng.int(14), 1 + rng.int(14), b, 0.35);
  }
  // Ripples: short bright dashes with a dark trough under them, longer where it flows.
  const len = def.flow ? [3, 6] : [2, 3];
  for (let k = 0; k < (def.deep ? 4 : 6); k++) {
    const x = rng.int(16), y = 1 + rng.int(14), l = Math.round(rng.range(len[0], len[1]));
    for (let i = 0; i < l; i++) {
      s.wset(x + i, y, p[def.deep ? 3 : 4]);
      s.wset(x + i + 1, y + 1, p[1]);
    }
  }
  if (def.deep) specks(s, rng, 2, [tone(p[4], 0.3)]);
  const foam = hex('#e4eef0');
  const open = [!(mask & 1), !(mask & 2), !(mask & 4), !(mask & 8)];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.min(open[0] ? y : 99, open[1] ? 15 - x : 99, open[2] ? 15 - y : 99, open[3] ? x : 99);
      if (d === 0) s.blend(x, y, foam, 0.6);
      else if (d === 1) s.blend(x, y, foam, rng.chance(0.5) ? 0.3 : 0.12);
      else if (d <= 3) s.tone(x, y, 0.1 - d * 0.025);
    }
  }
  return s;
}

export function paintGround(name: string, variant: number, mask?: number): Sprite | null {
  if (mask !== undefined && name in WATER) return water(name, mask);
  const paint = GROUND[name];
  if (!paint) return null;
  const s = new Sprite();
  paint(s, new Rng(hashStr(name) + variant * 7919), variant);
  return s;
}
