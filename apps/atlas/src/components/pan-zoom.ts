import { type Ref, ref } from 'vue';

/**
 * Zoom and pan for the map viewers (dungeons, caves and caverns, building interiors): the mouse
 * wheel or a pinch zooms about the pointer, dragging pans once zoomed in, the − / Fit / + buttons
 * and the - / 0 / + keys zoom about the middle, and `focus` brings a spot of the map into view.
 *
 * Each viewer works out its fitted view (the whole map on the stage, zoom 1) as a scale and an
 * origin in stage pixels, and passes it to `view`, which gives the scale and origin to draw with.
 */
export interface Fit {
  scale: number;
  ox: number;
  oy: number;
}

export function usePanZoom(stage: Ref<HTMLElement | undefined>, maxZoom = 8) {
  /** Zoom over the fitted view (1 = the whole map), and the pan in stage pixels. */
  const zoom = ref(1);
  const pan = ref({ x: 0, y: 0 });
  let fit: Fit = { scale: 1, ox: 0, oy: 0 };
  const size = () => ({ W: stage.value?.clientWidth ?? 0, H: stage.value?.clientHeight ?? 0 });
  /** The origin at zoom z: zoomed about the middle of the stage, then panned. */
  const origin = (z: number, p = pan.value) => {
    const { W, H } = size();
    return { ox: W / 2 - (W / 2 - fit.ox) * z + p.x, oy: H / 2 - (H / 2 - fit.oy) * z + p.y };
  };

  /** Records the fitted view and returns the view to draw: its scale and origin at the zoom and pan. */
  function view(f: Fit): Fit {
    fit = f;
    return { scale: f.scale * zoom.value, ...origin(zoom.value) };
  }

  function reset(): void {
    zoom.value = 1;
    pan.value = { x: 0, y: 0 };
  }

  /** Zoom by `k` about a stage point (the middle by default), keeping that point of the map still. */
  function zoomAt(k: number, px?: number, py?: number): void {
    const { W, H } = size();
    if (!W || !H) return;
    const z0 = zoom.value, z1 = Math.max(1, Math.min(maxZoom, z0 * k));
    if (z1 === z0) return;
    const x = px ?? W / 2, y = py ?? H / 2;
    // The map point under (x, y) before and after must agree.
    const o0 = origin(z0);
    const mx = (x - o0.ox) / (fit.scale * z0), my = (y - o0.oy) / (fit.scale * z0);
    const o1 = origin(z1, { x: 0, y: 0 });
    zoom.value = z1;
    pan.value = z1 === 1 ? { x: 0, y: 0 } : { x: x - mx * fit.scale * z1 - o1.ox, y: y - my * fit.scale * z1 - o1.oy };
  }

  /** Brings a point of the map (in the units of the fitted scale) to the middle, zoomed in to at least `z`. */
  function focus(cx: number, cy: number, z = 2.5): void {
    const { W, H } = size();
    if (!W || !H) return;
    const z1 = Math.max(zoom.value, Math.min(maxZoom, z));
    const o = origin(z1, { x: 0, y: 0 });
    zoom.value = z1;
    pan.value = { x: W / 2 - (o.ox + cx * fit.scale * z1), y: H / 2 - (o.oy + cy * fit.scale * z1) };
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }

  // Dragging pans; two fingers pinch to zoom.
  const pointers = new Map<number, { x: number; y: number }>();
  let dragged = false;
  let pinch0 = 0;
  function onPointerDown(e: PointerEvent): void {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }
  function onPointerMove(e: PointerEvent): void {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      if (pinch0 > 0) zoomAt(d / pinch0, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch0 = d;
      dragged = true;
      return;
    }
    if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true;
    if (zoom.value > 1) {
      pan.value = { x: pan.value.x + dx, y: pan.value.y + dy };
      (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
    }
  }
  function onPointerUp(e: PointerEvent): void {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = 0;
  }

  /** The zoom keys: + (or =) in, - out, 0 to fit. True if the key was one of them. */
  function onZoomKey(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key === '+' || e.key === '=') zoomAt(1.5);
    else if (e.key === '-' || e.key === '_') zoomAt(1 / 1.5);
    else if (e.key === '0') reset();
    else return false;
    return true;
  }

  return {
    zoom, pan, maxZoom, view, reset, zoomAt, focus, onWheel, onPointerDown, onPointerMove, onPointerUp, onZoomKey,
    /** The last press was a drag or a pinch (so not a click). */
    wasDrag: () => dragged,
    /** A pointer is down (dragging or pinching). */
    busy: () => pointers.size > 0,
    /** The cursor for a stage point: a pointer over something to click, a hand once zoomed in. */
    cursor: (hot: boolean) => (hot ? 'pointer' : zoom.value > 1 ? 'grab' : ''),
  };
}
