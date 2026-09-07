import { describe, expect, it } from 'vitest';

import { Condition, CopyStatus, Item, ItemCopy } from '../models';
import {
  bestCondition,
  copyValue,
  copyValueIsPaid,
  isOwned,
  newCopy,
  ownedValue,
  paidTotal,
  sortValue,
  syncWantedTag,
  unitValue,
  valueIsPaid,
} from './copies.util';

function copy(id: string, condition: Condition, price: number, overrides: Partial<ItemCopy> = {}): ItemCopy {
  return {
    id,
    condition,
    price,
    value: null,
    acquiredOn: null,
    status: 'Keep',
    notes: '',
    custom: [],
    ...overrides,
  };
}

function item(copies: ItemCopy[], value = 100, tags: string[] = []): Item {
  return {
    id: 'i1',
    name: 'Chrono Trigger',
    description: '',
    year: 1995,
    value,
    groupId: 'g1',
    sectionId: '',
    tags,
    img: 'ct.jpg',
    custom: [],
    copies,
    photoIds: [],
  };
}

describe('copies.util', () => {
  it('derives ownership from the copies', () => {
    expect(isOwned(item([]))).toBe(false);
    expect(isOwned(item([copy('a', 'Good', 10)]))).toBe(true);
  });

  it('picks the best condition, Mint over Good over Fair', () => {
    expect(bestCondition(item([copy('a', 'Fair', 1), copy('b', 'Mint', 2)]))).toBe('Mint');
    expect(bestCondition(item([copy('a', 'Fair', 1), copy('b', 'Good', 2)]))).toBe('Good');
    expect(bestCondition(item([copy('a', 'Fair', 1)]))).toBe('Fair');
    expect(bestCondition(item([]))).toBeNull();
  });

  it('falls back to the item value when a copy has none', () => {
    const it1 = item([copy('a', 'Good', 10)], 80);
    expect(copyValue(it1, it1.copies[0])).toBe(80);

    const it2 = item([copy('a', 'Good', 10, { value: 55 })], 80);
    expect(copyValue(it2, it2.copies[0])).toBe(55);
  });

  it('falls back to what was paid when nothing was estimated', () => {
    const subject = item([copy('a', 'Good', 42)], 0);
    expect(copyValue(subject, subject.copies[0])).toBe(42);
    expect(copyValueIsPaid(subject, subject.copies[0])).toBe(true);
  });

  it('prefers any estimate over the price paid', () => {
    const itemLevel = item([copy('a', 'Good', 42)], 80);
    expect(copyValueIsPaid(itemLevel, itemLevel.copies[0])).toBe(false);

    const copyLevel = item([copy('a', 'Good', 42, { value: 55 })], 0);
    expect(copyValue(copyLevel, copyLevel.copies[0])).toBe(55);
    expect(copyValueIsPaid(copyLevel, copyLevel.copies[0])).toBe(false);
  });

  it('reports the per-unit figure, averaging the copies when unestimated', () => {
    expect(unitValue(item([copy('a', 'Good', 10)], 80))).toBe(80);
    expect(unitValue(item([copy('a', 'Good', 30), copy('b', 'Good', 50)], 0))).toBe(40);
    // Nothing declared and nothing held: there is no figure to invent.
    expect(unitValue(item([], 0))).toBe(0);
  });

  it('keeps the unit figure consistent with the owned total', () => {
    const subject = item([copy('a', 'Good', 30), copy('b', 'Good', 50)], 0);
    expect(unitValue(subject) * subject.copies.length).toBe(ownedValue(subject));
  });

  it('flags a value that leans on prices paid, even partly', () => {
    expect(valueIsPaid(item([copy('a', 'Good', 42)], 0))).toBe(true);
    expect(valueIsPaid(item([copy('a', 'Good', 42)], 80))).toBe(false);
    // One copy priced, one estimated — still not an estimate.
    expect(valueIsPaid(item([copy('a', 'Good', 42), copy('b', 'Good', 1, { value: 90 })], 0))).toBe(true);
    expect(valueIsPaid(item([copy('a', 'Good', 42, { value: 90 })], 0))).toBe(false);
    // A wantlist item has no price to lean on.
    expect(valueIsPaid(item([], 0))).toBe(false);
  });

  it('counts an unestimated item at what it cost, not at zero', () => {
    // The dashboard's value-vs-paid trend read −100% for these before.
    const subject = item([copy('a', 'Mint', 150), copy('b', 'Fair', 40)], 0);
    expect(ownedValue(subject)).toBe(190);
    expect(ownedValue(subject)).toBe(paidTotal(subject));
  });

  it('sums owned value across copies, mixing overrides and fallbacks', () => {
    const subject = item([copy('a', 'Mint', 10), copy('b', 'Fair', 5, { value: 30 })], 80);
    expect(ownedValue(subject)).toBe(110);
  });

  it('reports zero owned value for a wantlist item', () => {
    // The reference value still exists, but nothing is held.
    expect(ownedValue(item([], 900))).toBe(0);
  });

  it('adds up what was paid', () => {
    expect(paidTotal(item([copy('a', 'Mint', 150), copy('b', 'Fair', 40)]))).toBe(190);
    expect(paidTotal(item([]))).toBe(0);
  });

  it('keeps wanted items sortable by their reference value', () => {
    expect(sortValue(item([], 900))).toBe(900);
    expect(sortValue(item([copy('a', 'Good', 10, { value: 12 })], 900))).toBe(12);
  });

  it('mints unique copy ids within the same tick', () => {
    const ids = new Set([newCopy().id, newCopy().id, newCopy().id]);
    expect(ids.size).toBe(3);
  });

  it('defaults a new copy to a kept, unpriced Good copy', () => {
    expect(newCopy()).toMatchObject({
      condition: 'Good',
      price: 0,
      value: null,
      acquiredOn: null,
      status: 'Keep' satisfies CopyStatus,
      notes: '',
    });
  });

  it('adds the wanted tag when the last copy goes', () => {
    expect(syncWantedTag(item([], 100, ['boxed'])).tags).toEqual(['boxed', 'wanted']);
  });

  it('drops the wanted tag as soon as there is a copy', () => {
    const owned = item([copy('a', 'Good', 10)], 100, ['wanted', 'boxed']);
    expect(syncWantedTag(owned).tags).toEqual(['boxed']);
  });

  it('does not duplicate an existing wanted tag', () => {
    expect(syncWantedTag(item([], 100, ['wanted'])).tags).toEqual(['wanted']);
  });
});
