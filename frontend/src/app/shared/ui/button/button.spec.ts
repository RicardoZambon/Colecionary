import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { UiButton } from './button';

/**
 * `pending` exists so that rule 20 has one implementation instead of three
 * spellings: a write affordance must stop offering itself while its own write
 * runs, and "in flight" must be announced rather than only dimmed.
 */
@Component({
  imports: [UiButton],
  template: `<ui-button [pending]="pending()" [disabled]="disabled()">Save item</ui-button>`,
})
class Host {
  readonly pending = signal(false);
  readonly disabled = signal(false);
}

describe('UiButton', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<Host>>;

  function button() {
    return fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  it('offers itself normally when nothing is in flight', () => {
    expect(button().disabled).toBe(false);
    expect(button().getAttribute('aria-busy')).toBe(null);
  });

  it('stops accepting the click while its own write runs', () => {
    fixture.componentInstance.pending.set(true);
    fixture.detectChanges();

    expect(button().disabled).toBe(true);
  });

  it('announces the wait rather than only dimming', () => {
    fixture.componentInstance.pending.set(true);
    fixture.detectChanges();

    expect(button().getAttribute('aria-busy')).toBe('true');
    expect(button().classList.contains('btn--pending')).toBe(true);
  });

  it('keeps its label, so a caller needs no second i18n key for the wait', () => {
    fixture.componentInstance.pending.set(true);
    fixture.detectChanges();

    expect(button().textContent?.trim()).toBe('Save item');
  });

  it('stays disabled for its own reasons too', () => {
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();

    expect(button().disabled).toBe(true);
    expect(button().getAttribute('aria-busy')).toBe(null);
  });
});
