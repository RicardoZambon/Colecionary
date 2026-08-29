import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { I18nService } from '../../../core/i18n';
import { UiDateInput } from './date-input';

@Component({
  imports: [UiDateInput],
  template: `<ui-date-input [(value)]="date" [ariaLabel]="'Acquired'" [min]="min()" />`,
})
class Host {
  readonly date = signal('2026-03-14');
  readonly min = signal('');
}

describe('UiDateInput', () => {
  let i18n: I18nService;

  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const hint = fixture.nativeElement.querySelector('.hint') as HTMLElement;
    return { fixture, input, hint };
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    i18n = TestBed.inject(I18nService);
    i18n.apply('en');
  });

  it('renders a native date control carrying the ISO value', () => {
    const { input } = render();
    expect(input.type).toBe('date');
    expect(input.value).toBe('2026-03-14');
  });

  it('writes the ISO value back to the model', () => {
    const { fixture, input } = render();
    input.value = '2026-12-01';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.date()).toBe('2026-12-01');
  });

  it('a cleared field round-trips as an empty string, not a bad date', () => {
    const { fixture, input } = render();
    input.value = '';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.date()).toBe('');
  });

  it('binds lang to the active language, so Chromium formats the field with it', () => {
    const { fixture, input } = render();
    expect(input.lang).toBe('en');
    i18n.apply('pt-BR');
    fixture.detectChanges();
    expect(input.lang).toBe('pt-BR');
  });

  it('prints the locale order, and switches it with the language', () => {
    const { fixture, hint } = render();
    expect(hint.textContent?.trim()).toBe('mm/dd/yyyy');
    i18n.apply('pt-BR');
    fixture.detectChanges();
    // Day first, and a Portuguese year is spelled `aaaa`.
    expect(hint.textContent?.trim()).toBe('dd/mm/aaaa');
  });

  it('describes the field by that hint rather than only drawing it', () => {
    const { input, hint } = render();
    expect(input.getAttribute('aria-describedby')).toBe(hint.id);
    expect(hint.id).toBeTruthy();
  });

  it('names itself for a field the page labels by proximity', () => {
    const { input } = render();
    expect(input.getAttribute('aria-label')).toBe('Acquired');
  });

  it('omits min/max entirely when unbounded', () => {
    const { fixture, input } = render();
    expect(input.getAttribute('min')).toBeNull();
    fixture.componentInstance.min.set('2000-01-01');
    fixture.detectChanges();
    expect(input.getAttribute('min')).toBe('2000-01-01');
  });
});
