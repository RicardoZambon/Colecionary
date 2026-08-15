import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { MoneyPipe } from './money.pipe';
import { I18nService } from '../../core/i18n';
import { Lang } from '../../core/models';

function setup(lang: Lang) {
  TestBed.configureTestingModule({ providers: [MoneyPipe] });
  const i18n = TestBed.inject(I18nService);
  i18n.apply(lang);
  return { pipe: TestBed.inject(MoneyPipe), i18n };
}

describe('MoneyPipe', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('formats with thousands separators', () => {
    const { pipe } = setup('en');
    expect(pipe.transform(4200)).toBe('$4,200');
    expect(pipe.transform(95)).toBe('$95');
  });

  it('groups the Brazilian way in pt-BR', () => {
    const { pipe } = setup('pt-BR');
    expect(pipe.transform(4200)).toBe('$4.200');
  });

  it('keeps the dollar sign in every language — the figure is USD, not copy', () => {
    expect(setup('pt-BR').pipe.transform(10)).toBe('$10');
  });

  it('follows a language change without being re-created', () => {
    const { pipe, i18n } = setup('en');
    expect(pipe.transform(4200)).toBe('$4,200');
    i18n.apply('pt-BR');
    expect(pipe.transform(4200)).toBe('$4.200');
  });

  it('treats null/undefined as zero', () => {
    const { pipe } = setup('en');
    expect(pipe.transform(null)).toBe('$0');
    expect(pipe.transform(undefined)).toBe('$0');
  });
});
