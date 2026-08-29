import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { UiCheckbox } from './checkbox';

@Component({
  imports: [UiCheckbox],
  template: `
    <ui-checkbox
      [(checked)]="on"
      [indeterminate]="mixed()"
      ariaLabel="Select N64 Gold Edition"
      (picked)="picks.push($event)"
    />
  `,
})
class Host {
  readonly on = signal(false);
  readonly mixed = signal(false);
  readonly picks: { checked: boolean; shift: boolean }[] = [];
}

async function mount() {
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector('input') as HTMLInputElement;
  return { fixture, host: fixture.componentInstance, input };
}

describe('UiCheckbox', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('is a real checkbox, because only the platform draws the mixed state', async () => {
    const page = await mount();
    expect(page.input.type).toBe('checkbox');
    expect(page.input.getAttribute('aria-label')).toBe('Select N64 Gold Edition');
  });

  it('announces tri-state as "mixed", which is the ARIA spelling of the dash', async () => {
    const page = await mount();
    expect(page.input.getAttribute('aria-checked')).toBe('false');

    page.host.mixed.set(true);
    page.fixture.detectChanges();
    expect(page.input.getAttribute('aria-checked')).toBe('mixed');

    // Checked wins over indeterminate, exactly as the platform does.
    page.host.on.set(true);
    page.fixture.detectChanges();
    expect(page.input.getAttribute('aria-checked')).toBe('true');
  });

  it('reports the state the browser left the box in, on a click', async () => {
    const page = await mount();
    page.input.click();
    page.fixture.detectChanges();

    expect(page.host.on()).toBe(true);
    expect(page.host.picks).toEqual([{ checked: true, shift: false }]);
  });

  it('carries the shift key, so a list can build a range without reading the event', async () => {
    const page = await mount();
    page.input.dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    page.fixture.detectChanges();

    expect(page.host.picks).toEqual([{ checked: true, shift: true }]);
  });

  it('toggles on shift+Enter, where the browser has not toggled it for us', async () => {
    // Enter does not activate a checkbox, so this path has to flip the box
    // itself. Reading `input.checked` here — as the click path correctly does —
    // reported the state it was already in, so a caller comparing that against
    // its own record saw no change and the key looked dead.
    const page = await mount();

    page.input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
    );
    page.fixture.detectChanges();

    expect(page.host.on()).toBe(true);
    expect(page.input.checked).toBe(true);
    expect(page.host.picks).toEqual([{ checked: true, shift: true }]);
  });

  it('keeps the element and the model in step across a keyboard toggle', async () => {
    const page = await mount();
    const shiftEnter = () =>
      page.input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
      );

    shiftEnter();
    page.fixture.detectChanges();
    shiftEnter();
    page.fixture.detectChanges();

    expect(page.host.on()).toBe(false);
    expect(page.host.picks.map(p => p.checked)).toEqual([true, false]);
  });
});
