import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ItemValuePipe } from './item-value.pipe';
import { I18nService } from '../../core/i18n';
import { Condition, Item, ItemCopy, Lang } from '../../core/models';
import { CurrencyService } from '../../core/state/currency.service';

function setup(lang: Lang) {
  TestBed.configureTestingModule({ providers: [ItemValuePipe] });
  const i18n = TestBed.inject(I18nService);
  i18n.apply(lang);
  return { pipe: TestBed.inject(ItemValuePipe), i18n, currencies: TestBed.inject(CurrencyService) };
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
    sectionId: '',
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
    expect(pipe.transform(item([copy(40)], 1200))).toBe('$1,200.00');
  });

  it('marks a figure that is really the price paid', () => {
    const { pipe } = setup('en');
    expect(pipe.transform(item([copy(85)], 0))).toBe('≈ $85.00');
  });

  it('shows a dash rather than $0 when nothing is known', () => {
    const { pipe } = setup('en');
    // A wantlist item nobody has priced — "unknown", not "worthless".
    expect(pipe.transform(item([], 0))).toBe('—');
  });

  it('takes a pre-summed total with its own marker', () => {
    const { pipe } = setup('en');
    // Currency comes first: every call site has one, only the number form has
    // a marker to declare.
    expect(pipe.transform(190, 'USD', true)).toBe('≈ $190.00');
    expect(pipe.transform(190)).toBe('$190.00');
  });

  it('renders in the collection currency it is handed', () => {
    // en-US spells BRL "R$" and groups it the American way — the currency and
    // the locale are genuinely independent.
    const { pipe } = setup('en');
    expect(pipe.transform(item([copy(40)], 1200), 'BRL')).toBe('R$1,200.00');
  });

  it('rounds an estimate up to the cent', () => {
    const { pipe } = setup('en');
    expect(pipe.transform(item([copy(40)], 1200.001))).toBe('$1,200.01');
  });

  it('still shows a dash rather than a rounded-up zero', () => {
    // Ceiling must not turn "nothing known" into a penny.
    const { pipe } = setup('en');
    expect(pipe.transform(item([], 0))).toBe('—');
  });

  it('follows a language change without being re-created', () => {
    const { pipe, i18n } = setup('en');
    expect(pipe.transform(item([copy(4200)], 0))).toBe('≈ $4,200.00');
    i18n.apply('pt-BR');
    // Separators follow the language; the currency does not.
    expect(pipe.transform(item([copy(4200)], 0)).replace(/\s/g, ' ')).toBe('≈ US$ 4.200,00');
  });
});
