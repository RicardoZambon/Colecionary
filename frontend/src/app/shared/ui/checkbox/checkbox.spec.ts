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
      [disabled]="off()"
      ariaLabel="Select N64 Gold Edition"
      (picked)="picks.push($event)"
    />
  `,
})
class Host {
  readonly on = signal(false);
  readonly mixed = signal(false);
  readonly off = signal(false);
  readonly picks: { checked: boolean; shift: boolean }[] = [];
}

async function mount() {
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector('input') as HTMLInputElement;
  const hit = el.querySelector('label.hit') as HTMLLabelElement;
  return { fixture, host: fixture.componentInstance, input, hit };
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

  describe('the grown touch target', () => {
    it('acts on a press, which the pseudo-element on the host never could', async () => {
      // The 44px area used to belong to <ui-checkbox> itself, and a
      // pseudo-element's hit test resolves to the element that owns it: the host
      // is not a control and has no handler, so the area was hit-testable and
      // completely inert everywhere in the app. It is a label now.
      const page = await mount();

      page.hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      page.fixture.detectChanges();

      expect(page.input.checked).toBe(true);
      expect(page.host.on()).toBe(true);
      expect(page.host.picks).toEqual([{ checked: true, shift: false }]);
    });

    it('carries the shift key from the grown area, not only from the 15px box', async () => {
      // The label's own activation behaviour synthesises a click on the control
      // and the synthetic event drops the modifiers, so shift-click ranges would
      // work on the paint and silently stop working around it.
      const page = await mount();

      page.hit.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }),
      );
      page.fixture.detectChanges();

      expect(page.host.picks).toEqual([{ checked: true, shift: true }]);
    });

    it('answers once when the press lands on the box itself', async () => {
      // The click bubbles from the input to the label; the label must not treat
      // that as a second press and toggle it back.
      const page = await mount();

      page.input.click();
      page.fixture.detectChanges();

      expect(page.input.checked).toBe(true);
      expect(page.host.picks).toEqual([{ checked: true, shift: false }]);
    });

    it('is inert while disabled, in the grown area as well as on the box', async () => {
      const page = await mount();
      page.host.off.set(true);
      page.fixture.detectChanges();

      page.hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      page.fixture.detectChanges();

      expect(page.host.picks).toEqual([]);
    });
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
