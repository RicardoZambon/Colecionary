import { describe, expect, it } from 'vitest';

import { Item, ItemCopy } from '../models';
import { listTotals } from './list-totals.util';

function copy(patch: Partial<ItemCopy> = {}): ItemCopy {
  return {
    id: 'cp1',
    condition: 'Good',
    price: 5,
    value: null,
    acquiredOn: null,
    status: 'Keep',
    notes: '',
    ...patch,
  };
}

function item(id: string, value: number, copies: ItemCopy[]): Item {
  return {
    id,
    name: id,
    description: '',
    year: 2000,
    value,
    groupId: '',
    sectionId: '',
    tags: [],
    img: '',
    custom: [],
    copies,
    photoIds: [],
  };
}

describe('list-totals.util', () => {
  it('counts rows, owned rows and physical copies apart', () => {
    const totals = listTotals(
      [
        item('a', 10, [copy({ id: 'a1' }), copy({ id: 'a2' })]),
        item('b', 10, []),
        item('c', 10, [copy({ id: 'c1' })]),
      ],
      'USD',
    );

    expect(totals.count).toBe(3);
    expect(totals.owned).toBe(2);
    // Three copies across two owned items — copies can exceed owned.
    expect(totals.copies).toBe(3);
  });

  it('values what is held, through the price-paid fallback', () => {
    // `copyValue` resolves an un-estimated item to what its copy cost, so the
    // footer has to agree with every row above it: 10 + 7.
    const totals = listTotals(
      [item('estimated', 10, [copy({ id: 'e1', price: 99 })]), item('unpriced', 0, [copy({ id: 'u1', price: 7 })])],
      'USD',
    );
    expect(totals.totals).toEqual([{ currency: 'USD', total: 17 }]);
  });

  it('reports the currency with a zero rather than nothing at all', () => {
    // A footer that renders blank reads as broken; `0` reads as "nothing here".
    expect(listTotals([], 'BRL')).toEqual({
      count: 0,
      owned: 0,
      copies: 0,
      totals: [{ currency: 'BRL', total: 0 }],
    });
  });

  it('keys the total by currency rather than returning a bare number', () => {
    // The shape is what stops a future caller adding BRL to USD.
    const totals = listTotals([item('a', 4, [copy()])], 'JPY');
    expect(totals.totals).toHaveLength(1);
    expect(totals.totals[0].currency).toBe('JPY');
  });
});
