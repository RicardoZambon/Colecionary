import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { MoneyPipe } from './money.pipe';
import { I18nService } from '../../core/i18n';
import { Lang } from '../../core/models';
import { CurrencyService } from '../../core/state/currency.service';

function setup(lang: Lang) {
  TestBed.configureTestingModule({ providers: [MoneyPipe] });
  const i18n = TestBed.inject(I18nService);
  i18n.apply(lang);
  return {
    pipe: TestBed.inject(MoneyPipe),
    i18n,
    currencies: TestBed.inject(CurrencyService),
  };
}

// Intl puts a non-breaking space between symbol and figure in pt-BR; asserting
// the literal would make these tests fail on a character nobody can see.
const normalize = (s: string) => s.replace(/\s/g, ' ');

describe('MoneyPipe', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('formats with thousands separators and always two decimals', () => {
    const { pipe } = setup('en');
    expect(pipe.transform(4200)).toBe('$4,200.00');
    expect(pipe.transform(95)).toBe('$95.00');
  });

  it('groups the Brazilian way in pt-BR', () => {
    const { pipe } = setup('pt-BR');
    expect(normalize(pipe.transform(4200))).toBe('US$ 4.200,00');
  });

  it('keeps the account currency in every language — the figure is not copy', () => {
    // The language moves the separators and the symbol's spelling; it never
    // turns dollars into reais.
    const { pipe, currencies } = setup('pt-BR');
    currencies.apply('USD');
    expect(normalize(pipe.transform(10))).toBe('US$ 10,00');
  });

  it('follows the account currency', () => {
    const { pipe, currencies } = setup('pt-BR');
    currencies.apply('BRL');
    expect(normalize(pipe.transform(4200))).toBe('R$ 4.200,00');
  });

  it('takes an explicit currency over the account default', () => {
    const { pipe, currencies } = setup('en');
    currencies.apply('BRL');
    expect(pipe.transform(4200, 'USD')).toBe('$4,200.00');
  });

  it('rounds up to the cent, never down', () => {
    const { pipe } = setup('en');
    expect(pipe.transform(1234.561)).toBe('$1,234.57');
    expect(pipe.transform(1234.001)).toBe('$1,234.01');
    // Half-up would have given 1,234.56 here; ceiling is the rule.
    expect(pipe.transform(1234.564)).toBe('$1,234.57');
  });

  it('leaves an exact amount exactly where it is', () => {
    // 0.07 * 100 is 7.000000000000001 in binary floating point. A naive ceiling
    // would bill 8 cents for a 7-cent figure.
    const { pipe } = setup('en');
    expect(pipe.transform(0.07)).toBe('$0.07');
    expect(pipe.transform(1234.56)).toBe('$1,234.56');
    expect(pipe.transform(29.29)).toBe('$29.29');
  });

  it('follows a language change without being re-created', () => {
    const { pipe, i18n } = setup('en');
    expect(pipe.transform(4200)).toBe('$4,200.00');
    i18n.apply('pt-BR');
    expect(normalize(pipe.transform(4200))).toBe('US$ 4.200,00');
  });

  it('treats null/undefined as zero', () => {
    const { pipe } = setup('en');
    expect(pipe.transform(null)).toBe('$0.00');
    expect(pipe.transform(undefined)).toBe('$0.00');
  });
});
