import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ItemValuePipe } from './item-value.pipe';
import { I18nService } from '../../core/i18n';
import { Condition, Item, ItemCopy, Lang } from '../../core/models';

function setup(lang: Lang) {
  TestBed.configureTestingModule({ providers: [ItemValuePipe] });
  const i18n = TestBed.inject(I18nService);
  i18n.apply(lang);
  return { pipe: TestBed.inject(ItemValuePipe), i18n };
}

function copy(price: number, value: number | null = null): ItemCopy {
  return {
    id: 'c1',
    condition: 'Good' satisfies Condition,
    price,
    value,
    acquiredOn: null,
    status: 'Keep',
    notes: '',
  };
}

function item(copies: ItemCopy[], value: number): Item {
  return {
    id: 'i1',
    name: 'Chrono Trigger',
    description: '',
    year: 1995,
    value,
    groupId: 'g1',
    tags: [],
    img: '',
    custom: [],
    copies,
    photoIds: [],
  };
}

describe('ItemValuePipe', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('shows a real estimate as a plain amount', () => {
    const { pipe } = setup('en');
    expect(pipe.transform(item([copy(40)], 1200))).toBe('$1,200');
  });

  it('marks a figure that is really the price paid', () => {
    const { pipe } = setup('en');
    expect(pipe.transform(item([copy(85)], 0))).toBe('≈ $85');
  });

  it('shows a dash rather than $0 when nothing is known', () => {
    const { pipe } = setup('en');
    // A wantlist item nobody has priced — "unknown", not "worthless".
    expect(pipe.transform(item([], 0))).toBe('—');
  });

  it('takes a pre-summed total with its own marker', () => {
    const { pipe } = setup('en');
    expect(pipe.transform(190, true)).toBe('≈ $190');
    expect(pipe.transform(190)).toBe('$190');
  });

  it('follows a language change without being re-created', () => {
    const { pipe, i18n } = setup('en');
    expect(pipe.transform(item([copy(4200)], 0))).toBe('≈ $4,200');
    i18n.apply('pt-BR');
    expect(pipe.transform(item([copy(4200)], 0))).toBe('≈ $4.200');
  });
});
