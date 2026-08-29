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

  it('carries the other placeholders of a counted sentence, and owns {n}', () => {
    const i18n = freshService();
    i18n.apply('en');
    // `owned` and `target` agree with nothing; only `catalogued` chooses the key.
    expect(
      i18n.plural(1, 'progress.textTarget.one', 'progress.textTarget.other', {
        owned: 0,
        target: 120,
        // `n` is supplied from `count` and must not be overridable, or a caller
        // could print one number and inflect for another.
        n: 99,
      }),
    ).toBe('0 owned, 1 catalogued, of 120 in the set');
  });

  describe('count phrases', () => {
    it('agrees in English', () => {
      const i18n = freshService();
      i18n.apply('en');
      expect(i18n.count(1, 'item')).toBe('1 item');
      expect(i18n.count(324, 'item')).toBe('324 items');
      expect(i18n.count(1, 'subGroup')).toBe('1 sub-group');
      expect(i18n.count(3, 'subGroup')).toBe('3 sub-groups');
    });

    /**
     * The reason none of this can append an "s": every Portuguese plural here is
     * irregular, and one of them is not even a suffix change.
     */
    it('agrees in Portuguese, where the plurals are irregular', () => {
      const i18n = freshService();
      i18n.apply('pt-BR');
      expect(i18n.count(1, 'item')).toBe('1 item');
      expect(i18n.count(2, 'item')).toBe('2 itens');
      expect(i18n.count(1, 'collection')).toBe('1 coleção');
      expect(i18n.count(2, 'collection')).toBe('2 coleções');
      expect(i18n.count(1, 'section')).toBe('1 seção');
      expect(i18n.count(2, 'section')).toBe('2 seções');
      expect(i18n.count(1, 'copy')).toBe('1 exemplar');
      expect(i18n.count(2, 'copy')).toBe('2 exemplares');
      expect(i18n.count(1, 'subGroup')).toBe('1 subgrupo');
      expect(i18n.count(2, 'subGroup')).toBe('2 subgrupos');
      expect(i18n.count(1, 'group')).toBe('1 grupo');
      expect(i18n.count(2, 'group')).toBe('2 grupos');
    });

    it('treats zero as the plural, in both languages', () => {
      const i18n = freshService();
      i18n.apply('en');
      expect(i18n.count(0, 'item')).toBe('0 items');
      i18n.apply('pt-BR');
      expect(i18n.count(0, 'item')).toBe('0 itens');
    });

    it('follows a language change, like every other lookup', () => {
      const i18n = freshService();
      i18n.apply('en');
      expect(i18n.count(2, 'collection')).toBe('2 collections');
      i18n.apply('pt-BR');
      expect(i18n.count(2, 'collection')).toBe('2 coleções');
    });

    /**
     * The point of the helper: two independent counts in one sentence, neither
     * of which a single `.one`/`.other` pair could agree with — and the sentence
     * is still one dictionary entry, so the translator keeps the word order.
     */
    it('composes a sentence carrying two independent counts', () => {
      const i18n = freshService();
      i18n.apply('en');
      const sub = (items: number, collections: number): string =>
        i18n.t('dashboard.sub', {
          items: i18n.count(items, 'item'),
          collections: i18n.count(collections, 'collection'),
          name: 'Marcus',
        });
      expect(sub(1, 1)).toBe('1 item across 1 collection · welcome back, Marcus');
      expect(sub(324, 5)).toBe('324 items across 5 collections · welcome back, Marcus');

      i18n.apply('pt-BR');
      expect(sub(1, 1)).toBe('1 item em 1 coleção · bem-vindo de volta, Marcus');
      expect(sub(324, 5)).toBe('324 itens em 5 coleções · bem-vindo de volta, Marcus');
    });

    /**
     * The two strings that already caused one grammar bug on this branch. The
     * count is written into the sentence rather than passed in as a phrase,
     * because pt-BR inflects "catalogado" inside it.
     */
    it('inflects the progress sentence in Portuguese', () => {
      const i18n = freshService();
      i18n.apply('pt-BR');
      const text = (catalogued: number): string =>
        i18n.plural(catalogued, 'progress.textNoTarget.one', 'progress.textNoTarget.other', {
          owned: 1,
        });
      expect(text(1)).toBe('1 na coleção de 1 catalogado');
      expect(text(4)).toBe('1 na coleção de 4 catalogados');
    });

    /** pt-BR conjugates the verb where English has no agreement at all. */
    it('conjugates "falta"/"faltam" for the missing count', () => {
      const i18n = freshService();
      i18n.apply('pt-BR');
      expect(i18n.plural(1, 'progress.missing.one', 'progress.missing.other')).toBe('falta 1');
      expect(i18n.plural(3, 'progress.missing.one', 'progress.missing.other')).toBe('faltam 3');
      i18n.apply('en');
      expect(i18n.plural(1, 'progress.missing.one', 'progress.missing.other')).toBe('1 missing');
    });
  });
});
