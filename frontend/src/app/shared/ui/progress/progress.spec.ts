import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { UiProgress } from './progress';

@Component({
  imports: [UiProgress],
  template: `
    <ui-progress
      [pct]="pct"
      [secondaryPct]="secondaryPct"
      [label]="label"
      [valueText]="valueText"
    />
  `,
})
class HostComponent {
  pct = 0;
  secondaryPct: number | null = null;
  label: string | null = null;
  valueText: string | null = null;
}

function mount(patch: Partial<HostComponent> = {}) {
  const fixture = TestBed.createComponent(HostComponent);
  Object.assign(fixture.componentInstance, patch);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    track: el.querySelector('[role="progressbar"]')!,
    fill: el.querySelector('.fill') as HTMLElement,
    band: el.querySelector('.band') as HTMLElement | null,
  };
}

describe('UiProgress', () => {
  it('carries an accessible name and a spoken value', () => {
    // Dozens of these render in a group tree; a progressbar with no name is a
    // WCAG 4.1.2 failure, and "43 percent" is not what a reader should hear.
    const { track } = mount({ pct: 43, label: 'Marvel progress', valueText: '12 of 28 owned' });

    expect(track.getAttribute('aria-label')).toBe('Marvel progress');
    expect(track.getAttribute('aria-valuetext')).toBe('12 of 28 owned');
    expect(track.getAttribute('aria-valuenow')).toBe('43');
  });

  it('clamps a percentage instead of overflowing the track', () => {
    expect(mount({ pct: 140 }).fill.style.width).toBe('100%');
    expect(mount({ pct: -20 }).fill.style.width).toBe('0%');
  });

  it('treats a non-finite percentage as zero', () => {
    // 0 / 0 in a caller's arithmetic must not paint an invalid width.
    expect(mount({ pct: Number.NaN }).fill.style.width).toBe('0%');
  });

  it('draws no second band by default', () => {
    expect(mount({ pct: 50 }).band).toBeNull();
  });

  it('draws the second band behind the fill', () => {
    const { band, fill } = mount({ pct: 10, secondaryPct: 60 });
    expect(fill.style.width).toBe('10%');
    expect(band!.style.width).toBe('60%');
  });

  it('never lets the band fall behind the fill', () => {
    // A band shorter than what it sits behind would read as the collection
    // shrinking rather than as a second measure of it.
    const { band } = mount({ pct: 80, secondaryPct: 30 });
    expect(band!.style.width).toBe('80%');
  });
});
