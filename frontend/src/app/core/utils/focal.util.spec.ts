import { describe, expect, it } from 'vitest';

import { CENTERED, clampFocal, focalFromPoint, focalToPosition } from './focal.util';

describe('focalToPosition', () => {
  it('centres an image that was never framed', () => {
    expect(focalToPosition(null)).toBe(CENTERED);
    expect(focalToPosition(undefined)).toBe(CENTERED);
  });

  it('renders a focal point as a background-position', () => {
    expect(focalToPosition({ x: 0.25, y: 0.8 })).toBe('25% 80%');
  });

  it('keeps the top-left corner distinct from "unframed"', () => {
    // 0 is a real choice. Anything treating the coordinate as falsy would
    // silently snap the image back to centre.
    expect(focalToPosition({ x: 0, y: 0 })).toBe('0% 0%');
  });

  it('rounds to a tenth of a percent rather than emitting float noise', () => {
    expect(focalToPosition({ x: 1 / 3, y: 2 / 3 })).toBe('33.3% 66.7%');
  });

  it('never emits a position off the picture', () => {
    expect(focalToPosition({ x: -2, y: 5 })).toBe('0% 100%');
  });

  it('falls back to centre for a coordinate that is not a number', () => {
    // NaN survives Math.min/max, so without an explicit guard this would reach
    // the DOM as `NaN%` and the browser would drop the rule entirely.
    expect(focalToPosition({ x: NaN, y: 0.5 })).toBe('50% 50%');
  });
});

describe('clampFocal', () => {
  it('leaves a point that is already on the picture alone', () => {
    expect(clampFocal({ x: 0.4, y: 0.6 })).toEqual({ x: 0.4, y: 0.6 });
  });

  it('pulls a point back onto the picture', () => {
    expect(clampFocal({ x: 1.4, y: -0.2 })).toEqual({ x: 1, y: 0 });
  });
});

describe('focalFromPoint', () => {
  const box = { left: 100, top: 50, width: 200, height: 100 };

  it('maps a pointer position to a fraction of the box', () => {
    expect(focalFromPoint({ clientX: 150, clientY: 100 }, box)).toEqual({ x: 0.25, y: 0.5 });
  });

  it('clamps a pointer that has been dragged outside the box', () => {
    // Pointer capture keeps sending moves past the edges; without clamping the
    // focal point would run off the image.
    expect(focalFromPoint({ clientX: 400, clientY: 0 }, box)).toEqual({ x: 1, y: 0 });
  });

  it('answers centre for a box that has not been laid out yet', () => {
    expect(
      focalFromPoint({ clientX: 10, clientY: 10 }, { left: 0, top: 0, width: 0, height: 0 }),
    ).toEqual({ x: 0.5, y: 0.5 });
  });
});
