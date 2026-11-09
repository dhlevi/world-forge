import type { BuildingView } from '@worldforge/core/interiors/building';
import { type Ctx2D, drawPlan } from './render';

/**
 * The ground floor drawn into a canvas in the building's own frame, with the four lon/lat corners
 * (top-left, top-right, bottom-right, bottom-left) that place it on the map as an image source.
 */
export function previewImage(v: BuildingView): { url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]] } {
  const { d, frame } = v;
  const W = d.nx * d.cw, Hh = d.ny * d.ch;
  const marginM = 0.6;
  const scale = Math.min(48, 900 / Math.max(W, Hh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((W + 2 * marginM) * scale);
  canvas.height = Math.ceil((Hh + 2 * marginM) * scale);
  const g = canvas.getContext('2d') as Ctx2D;
  drawPlan(g, d, d.ground, { scale, ox: marginM * scale, oy: marginM * scale, labels: scale > 30, grid: true, overlay: true });
  const wM = canvas.width / scale, hM = canvas.height / scale;
  const at = (u: number, w: number): [number, number] => {
    const x = d.origin[0] + (u - marginM) * d.eu[0] + (w - marginM) * d.ev[0];
    const y = d.origin[1] + (u - marginM) * d.eu[1] + (w - marginM) * d.ev[1];
    const ll = frame.toLL([x, y]);
    return [ll[0], ll[1]];
  };
  return { url: canvas.toDataURL('image/png'), coordinates: [at(0, 0), at(wM, 0), at(wM, hM), at(0, hM)] };
}
