import { describe, expect, it } from 'vitest';

import { Condition, GroupNode, Item, ItemCopy, Section } from '../models';
import { NO_FILTERS, neighbours, scopeItems, visibleItems } from './browse.util';
import { UNGROUPED_ID } from './group-stats.util';
import { UNSECTIONED_ID } from './sections.util';

function group(id: string, parentId: string | null = null): GroupNode {
  return { id, name: id, parentId, fields: [], sort: null, target: null };
}

function copy(condition: Condition = 'Good'): ItemCopy {
  return {
    id: `c-${condition}`,
    condition,
    price: 5,
    value: null,
    acquiredOn: null,
    status: 'Keep',
    notes: '',
  };
}

function item(id: string, groupId: string, copies: ItemCopy[] = [], sectionId = ''): Item {
  return {
    id,
    name: id,
    description: '',
    year: 2000,
    value: 10,
    groupId,
    sectionId,
    tags: [],
    img: '',
    custom: [],
    copies,
    photoIds: [],
  };
}

// cards ▸ rare, and a games group beside it.
const GROUPS = [group('cards'), group('rare', 'cards'), group('games')];

const ITEMS = [
  item('charizard', 'rare', [copy('Mint')]),
  item('alakazam', 'rare'),
  item('blastoise', 'cards', [copy('Fair')]),
  item('tetris', 'games', [copy('Good')]),
  item('orphan', 'deleted-group', [copy('Good')]),
];

const ALL: Parameters<typeof visibleItems>[2] = { groupId: null, ...NO_FILTERS };

const ids = (items: Item[]) => items.map(i => i.id);

describe('browse.util', () => {
  describe('scopeItems', () => {
    it('takes a group with its whole subtree', () => {
      expect(ids(scopeItems(ITEMS, GROUPS, 'cards')).sort()).toEqual([
        'alakazam',
        'blastoise',
        'charizard',
      ]);
    });

    it('takes only the group itself when it has no children', () => {
      expect(ids(scopeItems(ITEMS, GROUPS, 'games'))).toEqual(['tetris']);
    });

    it('collects items whose group no longer exists under the unfiled bucket', () => {
      expect(ids(scopeItems(ITEMS, GROUPS, UNGROUPED_ID))).toEqual(['orphan']);
    });

    it('takes everything at the collection root, unfiled included', () => {
      expect(scopeItems(ITEMS, GROUPS, null)).toHaveLength(ITEMS.length);
    });
  });

  describe('visibleItems', () => {
    it('narrows by condition on any copy', () => {
      const list = visibleItems(ITEMS, GROUPS, { ...ALL, condition: 'Fair' });
      expect(ids(list)).toEqual(['blastoise']);
    });

    it('splits owned from wanted by whether there is a copy at all', () => {
      expect(ids(visibleItems(ITEMS, GROUPS, { ...ALL, groupId: 'rare', own: 'owned' }))).toEqual([
        'charizard',
      ]);
      expect(ids(visibleItems(ITEMS, GROUPS, { ...ALL, groupId: 'rare', own: 'wanted' }))).toEqual([
        'alakazam',
      ]);
    });

    it('matches the search anywhere in the name, case-insensitively', () => {
      expect(ids(visibleItems(ITEMS, GROUPS, { ...ALL, query: '  ZAM ' }))).toEqual(['alakazam']);
    });

    it('applies an explicit sort over the group default', () => {
      const list = visibleItems(ITEMS, GROUPS, {
        ...ALL,
        groupId: 'cards',
        sort: { by: 'name', direction: 'asc' },
      });
      expect(ids(list)).toEqual(['alakazam', 'blastoise', 'charizard']);
    });

    it('falls back to the nearest ancestor that declares an order', () => {
      const sorted = [
        { ...group('cards'), sort: { by: 'name', direction: 'desc' as const } },
        group('rare', 'cards'),
      ];
      const list = visibleItems(ITEMS, sorted, { ...ALL, groupId: 'rare' });
      expect(ids(list)).toEqual(['charizard', 'alakazam']);
    });

    it('leaves the array it was given untouched', () => {
      const original = ids(ITEMS);
      visibleItems(ITEMS, GROUPS, { ...ALL, sort: { by: 'name', direction: 'asc' } });
      expect(ids(ITEMS)).toEqual(original);
    });
  });

  describe('neighbours', () => {
    const list = [item('a', 'g'), item('b', 'g'), item('c', 'g')];

    it('reports both sides and a 1-based position', () => {
      expect(neighbours(list, 'b')).toMatchObject({
        previous: list[0],
        next: list[2],
        position: 2,
        total: 3,
      });
    });

    it('has no previous at the start and no next at the end', () => {
      expect(neighbours(list, 'a').previous).toBeNull();
      expect(neighbours(list, 'a').next).toBe(list[1]);
      expect(neighbours(list, 'c').next).toBeNull();
    });

    it('reports position zero for an item the list does not hold', () => {
      // What an open item filtered out of its own list looks like: no honest
      // position to show, so the caller shows none.
      expect(neighbours(list, 'missing')).toMatchObject({
        previous: null,
        next: null,
        position: 0,
        total: 3,
      });
    });

    it('reports a lone item as 1 of 1 with nowhere to step', () => {
      expect(neighbours([list[0]], 'a')).toMatchObject({ position: 1, total: 1, next: null });
    });
  });

  // --- sections (rule: they order and filter, they never scope) ---

  describe('sections', () => {
    const SECTIONS: Section[] = [
      { id: 'bronze', groupId: 'cards', name: 'Bronze', target: null },
      { id: 'prata', groupId: 'cards', name: 'Prata', target: null },
      { id: 'outra', groupId: 'games', name: 'Outra', target: null },
    ];

    const ITEMS = [
      item('p1', 'cards', [], 'prata'),
      item('b1', 'cards', [], 'bronze'),
      item('loose', 'cards'),
      item('stray', 'cards', [], 'outra'),
    ];

    const criteria = (over: Partial<Parameters<typeof visibleItems>[2]> = {}) => ({
      groupId: 'cards',
      ...NO_FILTERS,
      ...over,
    });

    it('orders by the arranged runs, leftovers last', () => {
      expect(
        visibleItems(ITEMS, GROUPS, criteria(), SECTIONS).map(i => i.id),
      ).toEqual(['b1', 'p1', 'loose', 'stray']);
    });

    it('narrows to one run without changing the scope', () => {
      expect(
        visibleItems(ITEMS, GROUPS, criteria({ sectionId: 'bronze' }), SECTIONS).map(i => i.id),
      ).toEqual(['b1']);
    });

    it('answers the leftovers filter with everything no run claims', () => {
      // Including the item pointing at another group's section: on this screen
      // it is unsectioned, so it has to answer as such rather than by its id.
      expect(
        visibleItems(ITEMS, GROUPS, criteria({ sectionId: UNSECTIONED_ID }), SECTIONS).map(
          i => i.id,
        ),
      ).toEqual(['loose', 'stray']);
    });

    it('ignores sections at the collection root, where no group is open', () => {
      // A section divides one group's list; at the root there is no group, so
      // the order has to be exactly what it was before sections existed.
      const root = { groupId: null, ...NO_FILTERS };
      expect(visibleItems(ITEMS, GROUPS, root, SECTIONS).map(i => i.id)).toEqual(
        visibleItems(ITEMS, GROUPS, root).map(i => i.id),
      );
    });

    it('leaves the list identical to before when a collection has none', () => {
      expect(visibleItems(ITEMS, GROUPS, criteria(), []).map(i => i.id)).toEqual(
        visibleItems(ITEMS, GROUPS, criteria()).map(i => i.id),
      );
    });
  });
});
