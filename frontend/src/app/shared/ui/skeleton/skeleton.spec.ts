import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { SkeletonVariant, UiSkeleton } from './skeleton';

@Component({
  imports: [UiSkeleton],
  template: `
    <ui-skeleton
      [variant]="variant()"
      [lines]="lines()"
      [width]="width()"
      [height]="height()"
      [radius]="radius()"
    />
  `,
})
class HostComponent {
  readonly variant = signal<SkeletonVariant>('text');
  readonly lines = signal(1);
  readonly width = signal<string | null>(null);
  readonly height = signal<string | null>(null);
  readonly radius = signal<string | null>(null);
}

function mount(patch: Partial<Record<keyof HostComponent, unknown>> = {}) {
  const fixture = TestBed.createComponent(HostComponent);
  const host = fixture.componentInstance;
  for (const [key, value] of Object.entries(patch)) {
    (host[key as keyof HostComponent] as { set(v: unknown): void }).set(value);
  }
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    host,
    root: el.querySelector('ui-skeleton')!,
    bars: [...el.querySelectorAll('.bar')] as HTMLElement[],
  };
}

describe('UiSkeleton', () => {
  it('is invisible to assistive tech', () => {
    // A skeleton is a picture of a layout, not content. The loading *region*
    // owns aria-busy and the announcement; eleven unnamed graphics do not help.
    expect(mount().root.getAttribute('aria-hidden')).toBe('true');
    expect(mount().root.getAttribute('role')).toBeNull();
    expect(mount().root.getAttribute('aria-label')).toBeNull();
  });

  it('carries the variant on the host so the styles can key off it', () => {
    expect(mount().root.classList).toContain('v-text');
    expect(mount({ variant: 'block' }).root.classList).toContain('v-block');
    expect(mount({ variant: 'circle' }).root.classList).toContain('v-circle');
  });

  it('draws one bar by default', () => {
    expect(mount().bars).toHaveLength(1);
  });

  it('draws a bar per text line, ending short', () => {
    // Lines that all end flush read as a table rather than as prose.
    const { bars } = mount({ lines: 3 });
    expect(bars).toHaveLength(3);
    expect(bars[0].style.width).toBe('100%');
    expect(bars[1].style.width).toBe('100%');
    expect(bars[2].style.width).toBe('62%');
  });

  it('keeps an explicit width on every line but the last', () => {
    const { bars } = mount({ lines: 2, width: '180px' });
    expect(bars[0].style.width).toBe('180px');
    expect(bars[1].style.width).toBe('62%');
  });

  it('ignores lines on the non-text variants', () => {
    // A block or a circle repeated three times is three skeletons, which is the
    // caller's decision to make in their own layout.
    expect(mount({ variant: 'block', lines: 4 }).bars).toHaveLength(1);
    expect(mount({ variant: 'circle', lines: 4 }).bars).toHaveLength(1);
  });

  it('never draws zero or a fractional number of bars', () => {
    expect(mount({ lines: 0 }).bars).toHaveLength(1);
    expect(mount({ lines: -3 }).bars).toHaveLength(1);
    expect(mount({ lines: 2.7 }).bars).toHaveLength(2);
  });

  it('passes height and radius through untouched', () => {
    const { bars } = mount({ variant: 'block', height: '116px', radius: '0px' });
    expect(bars[0].style.height).toBe('116px');
    expect(bars[0].style.borderRadius).toBe('0px');
  });
});
