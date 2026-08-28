import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { MoneyPipe } from './money.pipe';
import { TPipe } from './t.pipe';
import { I18nService } from '../../core/i18n';

@Component({
  // OnPush, like every component in the app — this is the configuration the
  // pipe actually has to work under.
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyPipe, TPipe],
  template: `
    <span class="plain">{{ 'topbar.signOut' | t }}</span>
    <span class="params">{{ 'settings.access.removeMember' | t: { name: 'Ana' } }}</span>
    <span class="money">{{ 4200 | money }}</span>
  `,
})
class HostComponent {}

function mount() {
  const fixture = TestBed.createComponent(HostComponent);
  const el = fixture.nativeElement as HTMLElement;
  const read = (selector: string) => el.querySelector(selector)!.textContent!.trim();
  return { fixture, read };
}

describe('TPipe', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders the message for the active language', () => {
    TestBed.inject(I18nService).apply('en');
    const { fixture, read } = mount();
    fixture.detectChanges();

    expect(read('.plain')).toBe('Sign out');
    expect(read('.params')).toBe('Remove Ana');
  });

  /**
   * The reason both pipes are `pure: false`. A pure pipe is memoized by its
   * arguments: the language change marks the view dirty and the template
   * re-runs, but `transform` is handed the same key and Angular hands back the
   * cached string — so every label on screen would stay frozen in the old
   * language. If someone "optimizes" the pipes back to pure, this fails.
   */
  it('re-renders when the language changes', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.apply('en');
    const { fixture, read } = mount();
    fixture.detectChanges();
    expect(read('.plain')).toBe('Sign out');

    i18n.apply('pt-BR');
    fixture.detectChanges();

    expect(read('.plain')).toBe('Sair');
    expect(read('.params')).toBe('Remover Ana');
  });

  it('re-renders money with the new locale separators, keeping the currency', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.apply('en');
    const { fixture, read } = mount();
    fixture.detectChanges();
    expect(read('.money')).toBe('$4,200.00');

    i18n.apply('pt-BR');
    fixture.detectChanges();
    // The separators follow the language; USD stays USD.
    expect(read('.money').replace(/\s/g, ' ')).toBe('US$ 4.200,00');
  });
});
