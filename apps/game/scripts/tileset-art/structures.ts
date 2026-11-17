/** Joined structures (walls, doors, fences, hedges and the like) and roofs, seen from straight above. */
import { type RGB, Rng, Sprite, hashStr, hex, ramp, seamless, tone } from './paint';

const N = 1, E = 2, S = 4, W = 8;

/** Swaps x and y: a picture of something running east and west becomes one running north and south. */
function transpose(s: Sprite): Sprite {
  const t = new Sprite();
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const a = s.alpha(y, x);
      if (a) t.set(x, y, s.get(y, x), a);
    }
  }
  return t;
}

/** Whether a joining thing runs north and south here (otherwise east and west). */
const runsNS = (mask: number) => !!(mask & (N | S)) && !(mask & (E | W));

// ---- Wall materials: the top surface as a function of position, so joined tiles continue ----------

type Surface = (x: number, y: number, rng: Rng) => RGB;

function courses(base: string, mortar: string, rowH: number, blockW: number, jitter = 0.12): Surface {
  const p = ramp(base), m = hex(mortar);
  const shade = new Map<string, number>();
  return (x, y, rng) => {
    const row = Math.floor(y / rowH), off = row % 2 ? Math.floor(blockW / 2) : 0;
    const col = Math.floor((x + off) / blockW);
    if (y % rowH === rowH - 1 || (x + off) % blockW === blockW - 1) return m;
    const key = `${row},${col}`;
    if (!shade.has(key)) shade.set(key, rng.range(-jitter, jitter));
    const top = y % rowH === 0 ? 0.12 : 0;
    return tone(p[2], shade.get(key)! + top + (rng.chance(0.1) ? -0.06 : 0));
  };
}

function smooth(base: string, amt = 0.05): Surface {
  const p = hex(base);
  return (_x, _y, rng) => tone(p, rng.chance(0.25) ? rng.range(-amt, amt) : 0);
}

const SURFACES: Record<string, () => Surface> = {
  wall_timber: () => {
    const beam = ramp('#6a4a30'), daub = ramp('#d8c8a0', 0.4);
    return (x, y, rng) => {
      const cx = x % 8, cy = y % 8;
      if (cx === 0 || cy === 0) return beam[cx === 0 && cy === 0 ? 1 : 2];
      if (cx === cy) return beam[2];
      return daub[rng.chance(0.2) ? 1 : 2];
    };
  },
  wall_stone: () => courses('#8c8780', '#5e5a54', 4, 7),
  wall_plaster: () => smooth('#d9cbb0'),
  wall_whitewash: () => smooth('#efece4', 0.03),
  wall_adobe: () => courses('#c9a274', '#a88458', 5, 8, 0.06),
  wall_log: () => {
    const p = ramp('#8a6440');
    return (_x, y) => [p[3], p[2], p[2], p[1]][y % 4];
  },
  wall_plank: () => {
    const p = ramp('#9a7a56');
    return (x, _y, rng) => (x % 4 === 3 ? p[0] : rng.chance(0.12) ? p[1] : x % 4 === 0 ? p[3] : p[2]);
  },
  wall_turf: () => {
    const p = ramp('#7f9250');
    return (_x, _y, rng) => p[rng.chance(0.3) ? 3 : rng.chance(0.3) ? 1 : 2];
  },
  wall_brick: () => courses('#a65c45', '#d0b8a0', 3, 6, 0.1),
  town_wall: () => courses('#7a756c', '#4e4a44', 5, 8, 0.1),
  tower: () => courses('#6e6961', '#46423c', 4, 6, 0.1),
  ruin_wall: () => courses('#7a766c', '#58544c', 4, 7, 0.14),
  rock_wall: () => {
    const p = ramp('#4a443c', 1.2);
    return (_x, _y, rng) => p[rng.chance(0.15) ? 3 : rng.chance(0.3) ? 1 : 2];
  },
};

/** The wall's face, seen just past its top where nothing joins to the south. */
function faceOf(name: string): Surface {
  if (name === 'wall_turf') return courses('#6a5232', '#4e3c24', 2, 16, 0.05);
  const top = (SURFACES[name] ?? SURFACES.wall_stone)();
  return (x, y, rng) => tone(top(x, y + 2, rng), -0.28);
}

/** A wall tile: its top fills the tile, a dark rim where it stops, a face where nothing joins to the south. */
export function wall(name: string, mask: number): Sprite {
  const s = new Sprite(), rng = new Rng(hashStr(name) + mask);
  const top = (SURFACES[name] ?? SURFACES.wall_stone)(), face = faceOf(name);
  const lip = mask & S ? 0 : 4;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) s.set(x, y, y >= 16 - lip ? face(x, y, rng) : top(x, y, rng));
  if (name === 'wall_log') {
    // Notched log ends where the wall stops east or west.
    const p = ramp('#8a6440');
    for (const [side, x] of [[E, 13], [W, 2]] as const) {
      if (mask & side) continue;
      for (let r = 0; r < 3; r++) s.ring(x + 0.5, 2 + r * 4, 0, 1.5, p[3]);
    }
  }
  if (name === 'wall_turf' && !lip) for (let k = 0; k < 6; k++) s.set(rng.int(16), rng.int(16), hex('#9aaa60'));
  if (name === 'wall_turf') for (let k = 0; k < 8; k++) s.set(rng.int(16), rng.int(12 - lip + 4), hex('#a0b468'));
  if (name === 'town_wall') merlons(s, mask, lip);
  if (name === 'ruin_wall') {
    // Broken off: ragged gaps and fallen stones.
    const n = seamless(rng, 4);
    s.mask((x, y) => n[y * 16 + x] > 0.32 || y >= 16 - lip);
    for (let k = 0; k < 4; k++) s.set(rng.int(16), rng.int(16), hex('#8a8478'));
  }
  if (name === 'rock_wall') {
    for (let k = 0; k < 3; k++) {
      let x = rng.int(16), y = rng.int(12);
      for (let i = 0; i < 6; i++) {
        s.set(x, y, hex('#2e2a24'));
        x += rng.pick([-1, 0, 1]);
        y += 1;
      }
    }
    ragged(s, mask, rng, lip);
  }
  // Rims where the wall stops; light catches the north edge.
  if (!(mask & N)) for (let x = 0; x < 16; x++) {
    s.tone(x, 0, -0.35);
    s.tone(x, 1, 0.12);
  }
  if (!(mask & W)) for (let y = 0; y < 16; y++) s.tone(0, y, -0.3);
  if (!(mask & E)) for (let y = 0; y < 16; y++) s.tone(15, y, -0.38);
  if (lip) {
    for (let x = 0; x < 16; x++) {
      s.tone(x, 16 - lip, 0.18);
      s.tone(x, 15, -0.3);
    }
  }
  return s;
}

/** Crenellations on the sides of a town wall that face out (no join). */
function merlons(s: Sprite, mask: number, lip: number): void {
  const m = hex('#8e897e');
  const put = (x: number, y: number, w: number, h: number) => {
    s.rect(x, y, w, h, m);
    s.rect(x, y, w, 1, tone(m, 0.15));
    s.rect(x, y + h, w, 1, tone(m, -0.4));
  };
  if (!(mask & N)) for (let x = 1; x < 16; x += 5) put(x, 1, 3, 2);
  if (!lip && !(mask & S)) for (let x = 1; x < 16; x += 5) put(x, 12, 3, 2);
  if (lip) for (let x = 1; x < 16; x += 5) put(x, 16 - lip - 3, 3, 2);
  if (!(mask & W)) for (let y = 1; y < 12; y += 5) put(1, y, 2, 3);
  if (!(mask & E)) for (let y = 1; y < 12; y += 5) put(13, y, 2, 3);
  // The wall walk down the middle.
  for (let x = 0; x < 16; x++) for (let y = 5; y < 9; y++) if (s.alpha(x, y)) s.tone(x, y, 0.06);
}

/** Natural rock face: ragged where it stops. */
function ragged(s: Sprite, mask: number, rng: Rng, lip: number): void {
  const depth = (k: number) => (k % 5 === 0 ? 0 : rng.int(3));
  if (!(mask & N)) for (let x = 0; x < 16; x++) for (let y = 0; y < depth(x); y++) s.set(x, y, [0, 0, 0], 0);
  if (!(mask & W)) for (let y = 0; y < 16 - lip; y++) for (let x = 0; x < depth(y); x++) s.set(x, y, [0, 0, 0], 0);
  if (!(mask & E)) for (let y = 0; y < 16 - lip; y++) for (let x = 0; x < depth(y); x++) s.set(15 - x, y, [0, 0, 0], 0);
}

/** A rounded mass that joins its own kind: corners round off where two open sides meet. */
function blob(mask: number, paint: (s: Sprite, rng: Rng) => void, seed: number, r = 6, rimF = -0.4): Sprite {
  const s = new Sprite(), rng = new Rng(seed + mask);
  paint(s, rng);
  const n = !(mask & N), e = !(mask & E), so = !(mask & S), w = !(mask & W);
  const m = 1;
  s.mask((x, y) => {
    if (n && y < m) return false;
    if (so && y > 15 - m) return false;
    if (w && x < m) return false;
    if (e && x > 15 - m) return false;
    const corner = (cx: number, cy: number) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;
    if (n && w && x < r && y < r && !corner(r, r)) return false;
    if (n && e && x > 15 - r && y < r && !corner(16 - r, r)) return false;
    if (so && w && x < r && y > 15 - r && !corner(r, 16 - r)) return false;
    if (so && e && x > 15 - r && y > 15 - r && !corner(16 - r, 16 - r)) return false;
    return true;
  });
  const open = (mask & N ? 'n' : '') + (mask & E ? 'e' : '') + (mask & S ? 's' : '') + (mask & W ? 'w' : '');
  s.outline(rimF, open);
  return s;
}

function hedge(mask: number): Sprite {
  const p = ramp('#3f6a30', 1.1);
  return blob(mask, (s, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) s.set(x, y, p[2]);
    for (let k = 0; k < 26; k++) {
      const x = rng.int(16), y = rng.int(16);
      s.set(x, y, p[3]);
      s.set(x + 1, y + 1, p[1]);
    }
    for (let k = 0; k < 10; k++) s.set(rng.int(16), rng.int(16), p[4]);
  }, 11, 5);
}

function greatTrunk(mask: number): Sprite {
  const p = ramp('#5d4a32', 1.1);
  return blob(mask, (s, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) s.set(x, y, p[2]);
    for (let k = 0; k < 7; k++) {
      let x = rng.int(16), y = rng.int(16);
      for (let i = 0; i < 7; i++) {
        s.set(x, y, p[0]);
        s.set(x + 1, y, p[3]);
        y += 1;
        x += rng.pick([-1, 0, 0, 1]);
      }
    }
  }, 23, 7, -0.5);
}

function pyramid(mask: number): Sprite {
  const s = new Sprite(), rng = new Rng(31 + mask);
  const top = courses('#c2b08a', '#9a8a66', 4, 8, 0.06);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) s.set(x, y, top(x, y, rng));
  // Steps: a light tread and a dark riser every few pixels in from each open side.
  const d = (x: number, y: number) => Math.min(mask & N ? 99 : y, mask & E ? 99 : 15 - x, mask & S ? 99 : 15 - y, mask & W ? 99 : x);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const k = d(x, y);
      if (k > 12) continue;
      if (k % 4 === 0) s.tone(x, y, 0.16);
      if (k % 4 === 3) s.tone(x, y, -0.22);
    }
  }
  return s;
}

/** Things that run along a line: drawn as arms from the middle to each joined side. */
function arms(mask: number, draw: (s: Sprite, x0: number, y0: number, x1: number, y1: number) => void, post: (s: Sprite) => void): Sprite {
  const s = new Sprite();
  const ends: [number, number][] = [];
  if (mask & N) ends.push([8, 0]);
  if (mask & E) ends.push([15, 8]);
  if (mask & S) ends.push([8, 15]);
  if (mask & W) ends.push([0, 8]);
  for (const [x, y] of ends) draw(s, 8, 8, x, y);
  post(s);
  return s;
}

function palisade(mask: number): Sprite {
  const p = ramp('#7d5c3a');
  const stake = (s: Sprite, x: number, y: number) => {
    s.disc(x, y, 2.1, p[1]);
    s.disc(x - 0.4, y - 0.4, 1.3, p[3]);
    s.set(Math.floor(x - 0.5), Math.floor(y - 0.5), p[4]);
  };
  const s = arms(mask, (sp, x0, y0, x1, y1) => {
    const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 4);
    for (let k = 0; k <= n; k++) stake(sp, x0 + ((x1 - x0) * k) / Math.max(1, n) + 0.5, y0 + ((y1 - y0) * k) / Math.max(1, n) + 0.5);
  }, (sp) => stake(sp, 8.5, 8.5));
  s.outline(-0.35);
  s.shadow(80);
  return s;
}

function fence(mask: number): Sprite {
  const wood = ramp('#9a7a52');
  const s = arms(mask, (sp, x0, y0, x1, y1) => {
    const horiz = y0 === y1;
    for (const off of [-2, 1]) sp.line(x0 + (horiz ? 0 : off), y0 + (horiz ? off : 0), x1 + (horiz ? 0 : off), y1 + (horiz ? off : 0), wood[3]);
    const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 5);
    for (let k = 1; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
      sp.rect(Math.min(15, Math.round(x)) - 1, Math.min(15, Math.round(y)) - 1, 2, 2, wood[2]);
    }
  }, (sp) => sp.rect(7, 7, 3, 3, wood[1]));
  s.outline(-0.35);
  s.shadow(60);
  return s;
}

function tower(mask: number): Sprite {
  if (mask === 0) {
    const s = new Sprite(), rng = new Rng(77);
    const top = SURFACES.tower();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) s.set(x, y, top(x, y, rng));
    s.mask((x, y) => Math.hypot(x - 7.5, y - 7.5) <= 7.6);
    for (let a = 0; a < 12; a += 2) {
      const ang = (a / 12) * Math.PI * 2;
      s.disc(7.5 + Math.cos(ang) * 6, 7.5 + Math.sin(ang) * 6, 1.3, hex('#8a857a'));
    }
    s.outline(-0.4);
    s.dome(8, 8, 8, 0.25);
    return s;
  }
  const s = blob(mask, (sp, rng) => {
    const top = SURFACES.tower();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) sp.set(x, y, top(x, y, rng));
  }, 77, 9);
  return s;
}

// ---- Doors, gates, windows and grilles ------------------------------------------------------------

/** Wall stubs (jambs) at each end of an opening running east and west. */
function jambs(s: Sprite, c: string, w = 2): void {
  const p = ramp(c);
  for (const x0 of [0, 16 - w]) {
    s.rect(x0, 4, w, 8, p[2]);
    s.rect(x0, 4, w, 1, p[3]);
    s.rect(x0, 11, w, 1, p[0]);
  }
}

function leaf(s: Sprite, x: number, y: number, w: number, h: number, c: string, bands: boolean): void {
  const p = ramp(c);
  s.rect(x, y, w, h, p[2]);
  for (let i = x + 2; i < x + w; i += 3) s.rect(i, y, 1, h, p[1]);
  s.rect(x, y, w, 1, p[3]);
  s.rect(x, y + h - 1, w, 1, p[0]);
  if (bands) for (const bx of [x + 2, x + w - 3]) s.rect(bx, y, 1, h, hex('#3a3634'));
}

function doorlike(name: string, mask: number): Sprite {
  if (name === 'door_secret') return wall('wall_stone', mask);
  if (name === 'window') return windowTile(mask);
  if (name === 'wall_torch') return torch(mask);
  let s = new Sprite();
  const stone = name.startsWith('gate') || name.startsWith('portcullis') || name.startsWith('bars') ? '#7a756c' : '#5a4028';
  jambs(s, stone, name.startsWith('gate') ? 3 : 2);
  const iron = ramp('#5a5550');
  switch (name) {
    case 'door':
      leaf(s, 2, 6, 12, 4, '#b0784a', false);
      s.set(10, 8, hex('#d8c070'));
      break;
    case 'door_locked':
      leaf(s, 2, 6, 12, 4, '#8a5a3a', true);
      s.rect(9, 7, 2, 2, hex('#a8a8a0'));
      break;
    case 'door_open':
      leaf(s, 2, 9, 3, 7, '#b0784a', false);
      break;
    case 'gate': {
      leaf(s, 3, 5, 5, 6, '#8a6a48', true);
      leaf(s, 8, 5, 5, 6, '#8a6a48', true);
      s.rect(8, 5, 1, 6, hex('#3a2a1a'));
      break;
    }
    case 'gate_open':
      leaf(s, 3, 10, 3, 6, '#8a6a48', false);
      leaf(s, 10, 10, 3, 6, '#8a6a48', false);
      break;
    case 'portcullis':
      for (let x = 2; x < 14; x += 2) s.rect(x, 5, 1, 6, iron[2]);
      for (const y of [6, 9]) s.rect(2, y, 12, 1, iron[1]);
      break;
    case 'portcullis_up':
      for (let x = 3; x < 14; x += 2) {
        s.set(x, 7, iron[3]);
        s.set(x, 8, iron[1]);
      }
      break;
    case 'bars':
      for (let x = 2; x < 14; x += 2) s.rect(x, 7, 1, 2, iron[3]);
      s.rect(2, 8, 12, 1, iron[1]);
      break;
    case 'bars_open':
      for (let y = 9; y < 16; y += 2) s.rect(2, y, 2, 1, iron[3]);
      s.rect(3, 9, 1, 7, iron[1]);
      break;
  }
  s.outline(-0.3);
  if (runsNS(mask)) s = transpose(s);
  return s;
}

function windowTile(mask: number): Sprite {
  let s = wall('wall_plaster', runsNS(mask) ? mask : mask);
  const glass = ramp('#9fc3d6', 0.8), frame = hex('#6a4a30');
  const horiz = !runsNS(mask);
  for (let i = 0; i < 16; i++) {
    for (let d = -2; d <= 1; d++) {
      const [x, y] = horiz ? [i, 7 + d] : [7 + d, i];
      const edge = d === -2 || d === 1;
      s.set(x, y, edge ? frame : (i + d) % 5 === 0 ? glass[4] : glass[2]);
    }
    if (i % 5 === 2) {
      const [x, y] = horiz ? [i, 6] : [6, i];
      s.set(x, y + (horiz ? 1 : 0), frame);
      if (horiz) s.set(i, 8, frame);
      else s.set(8, i, frame);
    }
  }
  return s;
}

function torch(mask: number): Sprite {
  const s = wall('wall_stone', mask);
  const y = mask & S ? 9 : 12;
  s.rect(7, y, 2, 2, hex('#2e2a28'));
  s.rect(7, y - 2, 2, 2, hex('#6a4a30'));
  const flame = [hex('#c03a10'), hex('#f07a20'), hex('#ffd060'), hex('#fff4c0')];
  s.rect(6, y - 5, 4, 3, flame[1]);
  s.set(6, y - 6, flame[0]);
  s.set(9, y - 6, flame[0]);
  s.rect(7, y - 6, 2, 3, flame[2]);
  s.set(7, y - 5, flame[3]);
  s.set(8, y - 7, flame[2]);
  for (let k = 0; k < 16; k++) for (let j = 0; j < 16; j++) {
    const d = Math.hypot(k - 7.5, j - (y - 4));
    if (d < 6 && s.alpha(k, j)) s.tone(k, j, (6 - d) / 6 * 0.12);
  }
  return s;
}

const JOINED: Record<string, (mask: number) => Sprite> = {
  hedge, great_trunk: greatTrunk, pyramid, palisade, fence, tower,
};

const DOORS = new Set(['door', 'door_open', 'door_locked', 'door_secret', 'window', 'gate', 'gate_open', 'portcullis', 'portcullis_up', 'bars', 'bars_open', 'wall_torch']);

/** Every joined wall-like object; null for things painted elsewhere (furniture). */
export function structure(name: string, mask: number): Sprite | null {
  if (DOORS.has(name)) return doorlike(name, mask);
  if (JOINED[name]) return JOINED[name](mask);
  if (name in SURFACES) return wall(name, mask);
  return null;
}

// ---- Roofs ----------------------------------------------------------------------------------------

type RoofTex = (u: number, v: number, rng: Rng) => RGB;

/** Textures in roof space: v runs down the slope (eave at the bottom), u along the courses. */
const ROOF_TEX: Record<string, () => RoofTex> = {
  tile: () => {
    const p = ramp('#a35f45');
    return (u, v) => {
      const off = Math.floor(v / 4) % 2 ? 2 : 0, cu = (u + off) % 4, cv = v % 4;
      if (cv === 3) return cu === 0 || cu === 3 ? p[0] : p[1];
      if (cu === 0) return p[1];
      return cv === 0 ? p[3] : p[2];
    };
  },
  slate: () => {
    const p = ramp('#77746f', 0.9);
    const shade = new Map<string, number>();
    return (u, v, rng) => {
      const row = Math.floor(v / 3), off = row % 2 ? 2 : 0, col = Math.floor((u + off) / 4);
      if (v % 3 === 2) return p[0];
      if ((u + off) % 4 === 3) return p[1];
      const k = `${row},${col}`;
      if (!shade.has(k)) shade.set(k, rng.range(-0.08, 0.08));
      return tone(p[2], shade.get(k)!);
    };
  },
  shingle: () => {
    const p = ramp('#7d6550');
    return (u, v, rng) => {
      const row = Math.floor(v / 4), off = row % 2 ? 1 : 0;
      if (v % 4 === 3) return p[0];
      if ((u + off) % 3 === 2) return p[1];
      return rng.chance(0.2) ? p[3] : p[2];
    };
  },
  thatch: () => {
    const p = ramp('#bba070', 0.9);
    return (u, v, rng) => {
      if (v % 5 === 4) return p[1];
      const k = (u * 7 + Math.floor(v / 5) * 3) % 4;
      return rng.chance(0.15) ? p[4] : [p[2], p[3], p[2], p[1]][k];
    };
  },
  flat: () => {
    const p = ramp('#d9c7a0', 0.5);
    return (_u, _v, rng) => (rng.chance(0.08) ? p[1] : rng.chance(0.08) ? p[3] : p[2]);
  },
  turf: () => {
    const p = ramp('#7f8f5a');
    return (_u, _v, rng) => p[rng.chance(0.25) ? 3 : rng.chance(0.25) ? 1 : 2];
  },
};

const PLANE_LIGHT: Record<string, number> = { n: 0.14, e: -0.02, s: -0.2, w: -0.08, flat: 0, peak: 0 };

export function roof(material: string, plane: string, mask: number): Sprite {
  const s = new Sprite(), rng = new Rng(hashStr(`${material}_${plane}`) + mask);
  const tex = ROOF_TEX[material]();
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let c: RGB, light: number;
      switch (plane) {
        case 'n': c = tex(x, 15 - y, rng); light = PLANE_LIGHT.n; break;
        case 's': c = tex(x, y, rng); light = PLANE_LIGHT.s; break;
        case 'e': c = tex(y, x, rng); light = PLANE_LIGHT.e; break;
        case 'w': c = tex(y, 15 - x, rng); light = PLANE_LIGHT.w; break;
        case 'ridge_ew': c = y < 8 ? tex(x, 7 - y, rng) : tex(x, y - 8, rng); light = y < 8 ? PLANE_LIGHT.n : PLANE_LIGHT.s; break;
        case 'ridge_ns': c = x < 8 ? tex(y, 7 - x, rng) : tex(y, x - 8, rng); light = x < 8 ? PLANE_LIGHT.w : PLANE_LIGHT.e; break;
        case 'peak': {
          const a = Math.atan2(y - 7.5, x - 7.5), r = Math.hypot(x - 7.5, y - 7.5);
          c = tex(Math.floor(((a + Math.PI) / (2 * Math.PI)) * 32), Math.floor(r), rng);
          light = -Math.sin(a) * 0.14 - Math.cos(a) * 0.04;
          break;
        }
        default: c = tex(x, y, rng); light = 0;
      }
      s.set(x, y, tone(c, light));
    }
  }
  const cap = (x: number, y: number) => s.set(x, y, tone(s.get(x, y), 0.25));
  if (plane === 'ridge_ew') for (let x = 0; x < 16; x++) {
    cap(x, 7);
    s.tone(x, 8, -0.2);
  }
  if (plane === 'ridge_ns') for (let y = 0; y < 16; y++) {
    cap(7, y);
    s.tone(8, y, -0.15);
  }
  if (plane === 'peak') {
    s.disc(7.5, 7.5, 1.6, tone(hex(material === 'thatch' ? '#8a7048' : '#5a4a40'), 0.1));
    s.mask((x, y) => mask !== 0 || Math.hypot(x - 7.5, y - 7.5) <= 7.8);
  }
  // Eaves: a dark overhang along each open side.
  const open = [!(mask & N), !(mask & E), !(mask & S), !(mask & W)];
  for (let i = 0; i < 16; i++) {
    if (open[0]) { s.tone(i, 0, -0.4); s.tone(i, 1, -0.12); }
    if (open[2]) { s.tone(i, 15, -0.45); s.tone(i, 14, -0.15); }
    if (open[3]) { s.tone(0, i, -0.4); s.tone(1, i, -0.12); }
    if (open[1]) { s.tone(15, i, -0.45); s.tone(14, i, -0.15); }
  }
  return s;
}
