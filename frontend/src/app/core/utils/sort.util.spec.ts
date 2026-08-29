import { describe, expect, it } from 'vitest';

import { Translate } from '../i18n/messages/keys';
import { GroupField, GroupSort, Item } from '../models';
import {
  applyManualOrder,
  customFieldName,
  fieldSortKey,
  moveInList,
  sortChoices,
  sortItems,
  sortLabel,
} from './sort.util';

/**
 * Stands in for `I18nService.t`. Echoing the key (and its params) back means
 * these assertions pin down *which message* a sort resolves to, not how that
 * message happens to be worded in English — so retranslating never breaks them.
 */
const t: Translate = (key, params) =>
  params
    ? `${key}(${Object.entries(params)
        .map(([name, value]) => `${name}=${value}`)
        .join(',')})`
    : key;

function item(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id,
    name: id,
    description: '',
    year: 1995,
    value: 100,
    groupId: 'revistas',
    sectionId: '',
    tags: [],
    img: `${id}.jpg`,
    custom: [],
    copies: [],
    photoIds: [],
    ...overrides,
  };
}

/** An item carrying a single custom field value. */
function numbered(id: string, numero: string): Item {
  return item(id, { custom: [{ key: 'Número', value: numero }] });
}

const NUMERO_TEXT: GroupField[] = [{ name: 'Número', type: 'text' }];
const NUMERO_NUMBER: GroupField[] = [{ name: 'Número', type: 'number' }];

const byNumero = (direction: 'asc' | 'desc'): GroupSort => ({
  by: fieldSortKey('Número'),
  direction,
});

const ids = (items: Item[]) => items.map(i => i.id);

describe('sort.util', () => {
  it('round-trips the field sort key', () => {
    expect(fieldSortKey('Número')).toBe('field:Número');
    expect(customFieldName('field:Número')).toBe('Número');
    expect(customFieldName('name')).toBeNull();
  });

  it('orders a free-text field naturally, not alphabetically', () => {
    const items = [numbered('c', '10'), numbered('a', '2'), numbered('b', '1'), numbered('d', '12A')];
    expect(ids(sortItems(items, byNumero('asc'), NUMERO_TEXT))).toEqual(['b', 'a', 'c', 'd']);
  });

  it('orders a number field numerically', () => {
    const items = [numbered('c', '10'), numbered('a', '2'), numbered('b', '1')];
    expect(ids(sortItems(items, byNumero('asc'), NUMERO_NUMBER))).toEqual(['b', 'a', 'c']);
    expect(ids(sortItems(items, byNumero('desc'), NUMERO_NUMBER))).toEqual(['c', 'a', 'b']);
  });

  it('reads a decimal comma as a decimal point', () => {
    const items = [numbered('b', '1,5'), numbered('a', '1,25')];
    expect(ids(sortItems(items, byNumero('asc'), NUMERO_NUMBER))).toEqual(['a', 'b']);
  });

  it('orders ISO dates', () => {
    const fields: GroupField[] = [{ name: 'Lançamento', type: 'date' }];
    const dated = (id: string, value: string) => item(id, { custom: [{ key: 'Lançamento', value }] });
    const items = [dated('c', '2001-12-01'), dated('a', '1999-01-05'), dated('b', '2001-02-28')];
    const sort: GroupSort = { by: fieldSortKey('Lançamento'), direction: 'asc' };
    expect(ids(sortItems(items, sort, fields))).toEqual(['a', 'b', 'c']);
  });

  it('sinks items with no value to the end in both directions', () => {
    const items = [item('empty'), numbered('b', '2'), numbered('a', '1')];
    expect(ids(sortItems(items, byNumero('asc'), NUMERO_TEXT))).toEqual(['a', 'b', 'empty']);
    expect(ids(sortItems(items, byNumero('desc'), NUMERO_TEXT))).toEqual(['b', 'a', 'empty']);
  });

  it('treats a non-numeric value in a number field as missing', () => {
    const items = [numbered('junk', 'especial'), numbered('a', '3')];
    expect(ids(sortItems(items, byNumero('asc'), NUMERO_NUMBER))).toEqual(['a', 'junk']);
  });

  it('breaks ties by name so the list never shuffles', () => {
    const items = [numbered('zeta', '1'), numbered('alpha', '1')];
    expect(ids(sortItems(items, byNumero('asc'), NUMERO_TEXT))).toEqual(['alpha', 'zeta']);
  });

  it('sorts by the built-in keys', () => {
    const items = [
      item('cheap', { value: 10, year: 2000, name: 'B', createdAt: '2024-01-01T00:00:00Z' }),
      item('rich', { value: 900, year: 1990, name: 'A', createdAt: '2024-06-01T00:00:00Z' }),
    ];
    expect(ids(sortItems(items, { by: 'value', direction: 'desc' }, []))).toEqual(['rich', 'cheap']);
    expect(ids(sortItems(items, { by: 'year', direction: 'asc' }, []))).toEqual(['rich', 'cheap']);
    expect(ids(sortItems(items, { by: 'name', direction: 'asc' }, []))).toEqual(['rich', 'cheap']);
    expect(ids(sortItems(items, { by: 'added', direction: 'desc' }, []))).toEqual(['rich', 'cheap']);
  });

  it('leaves the array untouched in manual mode', () => {
    const items = [item('c'), item('a'), item('b')];
    expect(ids(sortItems(items, { by: 'manual', direction: 'asc' }, []))).toEqual(['c', 'a', 'b']);
  });

  it('labels sorts for the menu', () => {
    // A custom field's name is user data, so it is interpolated, not looked up.
    expect(sortLabel(byNumero('asc'), t)).toBe('sort.field(name=Número,arrow=↑)');
    expect(sortLabel(byNumero('desc'), t)).toBe('sort.field(name=Número,arrow=↓)');
    expect(sortLabel({ by: 'manual', direction: 'asc' }, t)).toBe('sort.manual');
    expect(sortLabel({ by: 'added', direction: 'desc' }, t)).toBe('sort.added.desc');
  });

  it('falls back to the default sort label for a key it does not know', () => {
    expect(sortLabel({ by: 'nonsense', direction: 'asc' }, t)).toBe('sort.added.desc');
  });

  it('offers both directions for every custom field', () => {
    const choices = sortChoices(NUMERO_TEXT, t);
    expect(choices.filter(c => c.by === 'field:Número').map(c => c.direction)).toEqual([
      'asc',
      'desc',
    ]);
  });

  it('moves an entry within a list', () => {
    expect(moveInList(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveInList(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveInList(['a', 'b', 'c'], 0, 9)).toEqual(['a', 'b', 'c']);
  });

  it('reorders only the visible slots, leaving filtered-out items in place', () => {
    // 'hidden' sits between the two visible items and must not move.
    const all = [item('a'), item('hidden'), item('b'), item('c')];
    const reordered = applyManualOrder(all, ['a', 'b', 'c'], ['c', 'a', 'b']);
    expect(ids(reordered)).toEqual(['c', 'hidden', 'a', 'b']);
  });

  // --- sections as the primary key (rule: a section orders, it does not scope) ---

  describe('section ordering', () => {
    // Bronze → Prata → Ouro: the arranged order, which the alphabet gets wrong.
    const RANK = new Map([
      ['bronze', 0],
      ['prata', 1],
      ['ouro', 2],
    ]);

    const sectioned = (id: string, sectionId: string, name = id) =>
      item(id, { sectionId, name });

    it('groups the runs before applying the chosen order inside them', () => {
      const items = [
        sectioned('z', 'bronze', 'Zeta'),
        sectioned('m', 'ouro', 'Mu'),
        sectioned('a', 'bronze', 'Alpha'),
        sectioned('b', 'prata', 'Beta'),
      ];

      expect(
        ids(sortItems(items, { by: 'name', direction: 'asc' }, [], RANK)),
      ).toEqual(['a', 'z', 'b', 'm']);
    });

    it('reverses the items inside each run, never the runs themselves', () => {
      // The order of the sections is something the user arranged by hand, so a
      // sort direction has no business flipping it.
      const items = [
        sectioned('a', 'bronze', 'Alpha'),
        sectioned('z', 'bronze', 'Zeta'),
        sectioned('b', 'prata', 'Beta'),
      ];

      expect(
        ids(sortItems(items, { by: 'name', direction: 'desc' }, [], RANK)),
      ).toEqual(['z', 'a', 'b']);
    });

    it('keeps manual order inside a run while still grouping the runs', () => {
      const items = [
        sectioned('b1', 'bronze'),
        sectioned('o1', 'ouro'),
        sectioned('b2', 'bronze'),
      ];

      expect(ids(sortItems(items, { by: 'manual', direction: 'asc' }, [], RANK))).toEqual([
        'b1',
        'b2',
        'o1',
      ]);
    });

    it('sinks an item with no applicable section to the end', () => {
      const items = [
        sectioned('loose', ''),
        sectioned('stray', 'a-section-of-another-group'),
        sectioned('b1', 'bronze'),
      ];

      expect(ids(sortItems(items, { by: 'manual', direction: 'asc' }, [], RANK))).toEqual([
        'b1',
        'loose',
        'stray',
      ]);
    });

    it('is a no-op without a rank, so nothing changes where no section applies', () => {
      const items = [item('b'), item('a')];
      expect(ids(sortItems(items, { by: 'manual', direction: 'asc' }, [], new Map()))).toEqual([
        'b',
        'a',
      ]);
    });
  });
});
