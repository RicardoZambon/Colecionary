import { describe, expect, it } from 'vitest';

import { currencyOf } from './currency.util';
import { Collection } from '../models';

const collection = (currency: Collection['currency']) => ({ currency }) as Collection;

describe('currencyOf', () => {
  it('takes the collection override when it declares one', () => {
    expect(currencyOf(collection('BRL'), 'USD')).toBe('BRL');
  });

  it('falls back to the account default when there is no override', () => {
    expect(currencyOf(collection(null), 'EUR')).toBe('EUR');
    expect(currencyOf(collection(undefined), 'EUR')).toBe('EUR');
  });

  it('follows the account default rather than pinning a copy of it', () => {
    // The same collection, read under two different account defaults. This is
    // what an override of null has to mean, and why the null is stored rather
    // than resolved away on write.
    const inherits = collection(null);
    expect(currencyOf(inherits, 'USD')).toBe('USD');
    expect(currencyOf(inherits, 'GBP')).toBe('GBP');
  });

  it('treats an unrenderable code as no override at all', () => {
    // Codes arrive from the database, so one saved before the supported list
    // moved would otherwise reach Intl.NumberFormat and throw, blanking the
    // page. A wrong symbol beats no page.
    expect(currencyOf({ currency: 'XYZ' } as unknown as Collection, 'USD')).toBe('USD');
    expect(currencyOf({ currency: '' } as unknown as Collection, 'USD')).toBe('USD');
  });

  it('handles a collection that is not there yet', () => {
    expect(currencyOf(null, 'BRL')).toBe('BRL');
    expect(currencyOf(undefined, 'BRL')).toBe('BRL');
  });

  it('defaults to USD when no account currency is supplied', () => {
    expect(currencyOf(collection(null))).toBe('USD');
  });
});
