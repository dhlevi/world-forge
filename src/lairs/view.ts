import { LocalFrame } from '../towns/plan';
import { type LairKind, type LairMap, type LairSite, lairMap } from './lair';
import { type Ctx2D, drawLair, lairThumbnail } from './render';

/** A cave or glade from a map feature's properties (the `regional` source, tier 'lair'). */
export function lairFromFeature(p: Record<string, unknown>, coords: number[]): LairSite | null {
  if (p.tier !== 'lair' || typeof p.id !== 'string') return null;
  return {
    id: p.id, kind: p.kind as LairKind, name: String(p.name ?? ''), seed: Number(p.seed), lon: coords[0], lat: coords[1],
    tags: String(p.tags ?? '').split(',').filter(Boolean),
  };
}

export const KIND_LABEL: Record<LairKind, string> = { cave: 'Cave', glade: 'Glade' };

/** "large · sealed · wet": the tags in reading order (size first). */
export function lairTags(s: LairSite): string {
  return s.tags.join(' · ');
}

const thumbs = new Map<string, string>();

export function lairThumb(m: LairMap): string {
  const key = `${m.site.id}:${m.site.seed}`;
  let u = thumbs.get(key);
  if (!u) {
    u = lairThumbnail(m, 220, 160);
    thumbs.set(key, u);
    if (thumbs.size > 40) thumbs.delete(thumbs.keys().next().value!);
  }
  return u;
}

/** Map metres per side and lon/lat bounds of the map, centred on the site, north up. */
export function lairCorners(m: LairMap): [[number, number], [number, number], [number, number], [number, number]] {
  const f = new LocalFrame(m.site.lon, m.site.lat);
  const c = (x: number, y: number) => f.toLL([x, y]) as [number, number];
  return [c(-m.W / 2, m.H / 2), c(m.W / 2, m.H / 2), c(m.W / 2, -m.H / 2), c(-m.W / 2, -m.H / 2)];
}

/** Is a lon/lat point on the map's footprint? */
export function onLair(m: LairMap, lon: number, lat: number): boolean {
  const p = new LocalFrame(m.site.lon, m.site.lat).fromLL(lon, lat);
  return Math.abs(p[0]) <= m.W / 2 && Math.abs(p[1]) <= m.H / 2;
}

const overlays = new Map<string, string>();

/** The map drawn for laying over the ground at its true size, with softly faded edges. */
export function lairOverlay(m: LairMap): { url: string; coordinates: ReturnType<typeof lairCorners> } {
  const key = `${m.site.id}:${m.site.seed}`;
  let url = overlays.get(key);
  if (!url) {
    const scale = Math.min(40, 1600 / Math.max(m.W, m.H));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(m.W * scale);
    canvas.height = Math.ceil(m.H * scale);
    const g = canvas.getContext('2d') as Ctx2D;
    drawLair(g, m, { scale, ox: 0, oy: 0, grid: true, labels: true });
    // Fade the rim so the map sinks into the ground around it.
    const w = canvas.width, h = canvas.height, rim = Math.min(w, h) * 0.08;
    // destination-out only touches what it covers: each rim strip fades from clear at the edge.
    g.globalCompositeOperation = 'destination-out';
    const strip = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(rx, ry, rw, rh);
    };
    strip(0, 0, rim, 0, 0, 0, rim, h);
    strip(w, 0, w - rim, 0, w - rim, 0, rim, h);
    strip(0, 0, 0, rim, 0, 0, w, rim);
    strip(0, h, 0, h - rim, 0, h - rim, w, rim);
    g.globalCompositeOperation = 'source-over';
    url = canvas.toDataURL('image/png');
    overlays.set(key, url);
    if (overlays.size > 12) overlays.delete(overlays.keys().next().value!);
  }
  return { url, coordinates: lairCorners(m) };
}

export { lairMap };
