import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { I18nService } from './i18n.service';

/** jsdom exposes `language` on the prototype, so redefine rather than spy. */
function browserLanguage(value: string): void {
  Object.defineProperty(navigator, 'language', { value, configurable: true });
}

function freshService(): I18nService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(I18nService);
}

describe('I18nService', () => {
  const original = navigator.language;

  beforeEach(() => localStorage.clear());
  afterEach(() => browserLanguage(original));

  it('follows the browser on a first visit', () => {
    browserLanguage('pt-BR');
    expect(freshService().current()).toBe('pt-BR');
  });

  it('treats any Portuguese as Brazilian Portuguese', () => {
    browserLanguage('pt-PT');
    expect(freshService().current()).toBe('pt-BR');
  });

  it('falls back to English for a language it does not ship', () => {
    browserLanguage('de-DE');
    expect(freshService().current()).toBe('en');
  });

  it('prefers a saved choice over the browser', () => {
    browserLanguage('en-US');
    localStorage.setItem('vault.lang', 'pt-BR');
    expect(freshService().current()).toBe('pt-BR');
  });

  it('ignores a stored value that is not a language it knows', () => {
    browserLanguage('en-US');
    localStorage.setItem('vault.lang', 'klingon');
    expect(freshService().current()).toBe('en');
  });

  it('persists the choice', () => {
    const i18n = freshService();
    i18n.apply('pt-BR');
    expect(localStorage.getItem('vault.lang')).toBe('pt-BR');
  });

  it('translates, and follows a language change', () => {
    const i18n = freshService();
    i18n.apply('en');
    expect(i18n.t('topbar.signOut')).toBe('Sign out');
    i18n.apply('pt-BR');
    expect(i18n.t('topbar.signOut')).toBe('Sair');
  });

  it('interpolates placeholders', () => {
    const i18n = freshService();
    i18n.apply('en');
    expect(i18n.t('settings.access.removeMember', { name: 'Ana' })).toBe('Remove Ana');
  });

  it('leaves an unsupplied placeholder visible rather than blanking it', () => {
    const i18n = freshService();
    i18n.apply('en');
    expect(i18n.t('settings.access.removeMember')).toContain('{name}');
  });

  it('exposes the locale and the Accept-Language header separately', () => {
    const i18n = freshService();
    i18n.apply('pt-BR');
    expect(i18n.locale()).toBe('pt-BR');
    expect(i18n.header()).toBe('pt-BR');
    i18n.apply('en');
    expect(i18n.locale()).toBe('en-US');
    expect(i18n.header()).toBe('en');
  });

  it('picks the singular only for exactly one', () => {
    const i18n = freshService();
    i18n.apply('en');
    expect(i18n.plural(1, 'common.active', 'common.clickToApply')).toBe('● Active');
    expect(i18n.plural(0, 'common.active', 'common.clickToApply')).toBe('Click to apply');
    expect(i18n.plural(2, 'common.active', 'common.clickToApply')).toBe('Click to apply');
  });
});
