import { describe, expect, it } from 'vitest';

import { ceilToCents, parseAmount } from './money.util';

// `formatMoney` and `currencyLabel` are exercised through `MoneyPipe` and the
// currency picker; what needs its own table is the parse, because its whole
// job is the inputs no screen produces on purpose.
describe('parseAmount', () => {
  it('reads a plain number', () => {
    expect(parseAmount('4200')).toBe(4200);
  });

  it('reads both locales without being told which wrote it', () => {
    expect(parseAmount('4.200,00')).toBe(4200);
    expect(parseAmount('4,200.00')).toBe(4200);
    expect(parseAmount('12,5')).toBe(12.5);
    expect(parseAmount('12.5')).toBe(12.5);
  });

  it('reads a lone separator with three digits after it as thousands', () => {
    expect(parseAmount('4.200')).toBe(4200);
    expect(parseAmount('1.234.567')).toBe(1234567);
  });

  it('ignores a currency symbol and the spaces around it', () => {
    expect(parseAmount('R$ 1.234,57')).toBe(1234.57);
    expect(parseAmount('US$ 4.200,00')).toBe(4200);
    expect(parseAmount('$1,234.57')).toBe(1234.57);
  });

  it('reads the table’s own "nothing here" as nothing', () => {
    expect(parseAmount('—')).toBe(0);
    expect(parseAmount('-')).toBe(0);
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('   ')).toBe(0);
    expect(parseAmount('n/a')).toBe(0);
  });

  it('keeps a negative sign', () => {
    expect(parseAmount('-12,50')).toBe(-12.5);
  });
});

describe('ceilToCents', () => {
  it('rounds up rather than half-up', () => {
    expect(ceilToCents(1234.561)).toBe(1234.57);
    expect(ceilToCents(1234.001)).toBe(1234.01);
  });

  it('leaves an exact amount exact', () => {
    expect(ceilToCents(0.07)).toBe(0.07);
  });
});
