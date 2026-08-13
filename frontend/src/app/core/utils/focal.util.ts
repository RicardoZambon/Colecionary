import { FocalPoint } from '../models';

/** What an unframed image renders as: dead centre, the browser's own default. */
export const CENTERED = '50% 50%';

/**
 * Renders a focal point as a CSS `background-position`.
 *
 * Paired with `background-size: cover` this is the whole cropping mechanism:
 * a percentage position aligns that same relative point of the image with the
 * container, so whatever overflows is trimmed from the far side and the subject
 * stays put — at any aspect ratio, without touching the bytes.
 *
 * Null means never framed, which is centred.
 */
export function focalToPosition(focal: FocalPoint | null | undefined): string {
  if (!focal) return CENTERED;
  return `${pct(focal.x)}% ${pct(focal.y)}%`;
}

/** Keeps a point on the picture; anything outside 0–1 names no pixel. */
export function clampFocal(focal: FocalPoint): FocalPoint {
  return { x: clamp01(focal.x), y: clamp01(focal.y) };
}

/**
 * Turns a pointer position over an element's box into a focal point.
 * Shared by the drag and the click-to-place paths so they can't drift apart.
 */
export function focalFromPoint(
  point: { clientX: number; clientY: number },
  box: { left: number; top: number; width: number; height: number },
): FocalPoint {
  // A zero-sized box would divide by zero — it happens if the image hasn't been
  // laid out yet, and centre is the honest answer until it has.
  if (box.width <= 0 || box.height <= 0) return { x: 0.5, y: 0.5 };
  return clampFocal({
    x: (point.clientX - box.left) / box.width,
    y: (point.clientY - box.top) / box.height,
  });
}

function clamp01(value: number): number {
  // NaN survives Math.min/max, so it needs catching on its own — an unparsed
  // coordinate must not reach the DOM as `NaN%`.
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/** Rounded to a tenth of a percent: finer than any screen, and keeps URLs short. */
function pct(value: number): number {
  return Math.round(clamp01(value) * 1000) / 10;
}
