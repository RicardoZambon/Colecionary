import { describe, expect, it } from 'vitest';

import { Condition, GroupNode, Item, ItemCopy, Section } from '../models';
import { NO_FILTERS, hasTag, matchesQuery, neighbours, scopeItems, visibleItems } from './browse.util';
import { UNGROUPED_ID } from './group-stats.util';
import { UNSECTIONED_ID } from './sections.util';
import { WANTED_TAG } from './tags.util';

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
    custom: [],
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

// What declares fields, for the helpers that merge them: no collection-wide
// field, just the tree above.
const DECLS = { fields: [], groups: GROUPS };

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
      const list = visibleItems(ITEMS, DECLS, { ...ALL, condition: 'Fair' });
      expect(ids(list)).toEqual(['blastoise']);
    });

    it('splits owned from wanted by whether there is a copy at all', () => {
      expect(ids(visibleItems(ITEMS, DECLS, { ...ALL, groupId: 'rare', own: 'owned' }))).toEqual([
        'charizard',
      ]);
      expect(ids(visibleItems(ITEMS, DECLS, { ...ALL, groupId: 'rare', own: 'wanted' }))).toEqual([
        'alakazam',
      ]);
    });

    it('matches the search anywhere in the name, case-insensitively', () => {
      expect(ids(visibleItems(ITEMS, DECLS, { ...ALL, query: '  ZAM ' }))).toEqual(['alakazam']);
    });

    it('applies an explicit sort over the group default', () => {
      const list = visibleItems(ITEMS, DECLS, {
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
      const list = visibleItems(ITEMS, { fields: [], groups: sorted }, { ...ALL, groupId: 'rare' });
      expect(ids(list)).toEqual(['charizard', 'alakazam']);
    });

    it('finds an item by a custom field value, not only by its name', () => {
      // The cataloguer's most frequent lookup is a catalogue number, which is
      // precisely a custom field — the one place the old search could not see.
      const numbered = [
        { ...item('charizard', 'rare'), custom: [{ key: 'Número', value: '004-A' }] },
        item('alakazam', 'rare'),
      ];
      expect(ids(visibleItems(numbered, DECLS, { ...ALL, query: '004' }))).toEqual(['charizard']);
    });

    it('finds an item by a value only one of its copies carries', () => {
      // The reason copy-scoped fields exist: a slab number belongs to one
      // physical copy, and the item is still what comes back — there is no
      // screen that lists copies, so a narrower answer would be unshowable.
      const slabbed = {
        ...item('charizard', 'rare'),
        copies: [
          { ...copy('Mint'), id: 'c1', custom: [{ key: 'Slab no.', value: '82736411' }] },
          { ...copy('Good'), id: 'c2', custom: [{ key: 'Slab no.', value: '91002244' }] },
        ],
      };
      expect(matchesQuery(slabbed, '9100')).toBe(true);
      expect(matchesQuery(slabbed, '55555')).toBe(false);
      expect(ids(visibleItems([slabbed, item('alakazam', 'rare')], DECLS, { ...ALL, query: '8273' })))
        .toEqual(['charizard']);
    });

    it('leaves the array it was given untouched', () => {
      const original = ids(ITEMS);
      visibleItems(ITEMS, DECLS, { ...ALL, sort: { by: 'name', direction: 'asc' } });
      expect(ids(ITEMS)).toEqual(original);
    });
  });

  describe('hasTag', () => {
    const tagged = { ...item('x', 'rare'), tags: ['CIB', 'first print'] };

    it('matches a whole tag, ignoring case, the way the editor does', () => {
      expect(hasTag(tagged, 'cib')).toBe(true);
      expect(hasTag(tagged, 'CIB')).toBe(true);
      expect(hasTag(tagged, '  cib ')).toBe(true);
      expect(hasTag(tagged, 'first print')).toBe(true);
    });

    it('is exact, so it does not match the substrings a search would', () => {
      // This is the whole difference between a tag filter and the search box:
      // `matchesQuery` finds 'cib' inside 'cibernetico', and a filter must not.
      expect(hasTag(tagged, 'ci')).toBe(false);
      expect(hasTag(tagged, 'print')).toBe(false);
      expect(hasTag({ ...tagged, tags: ['unboxed'] }, 'boxed')).toBe(false);
    });

    it('carries nothing for a blank tag or the derived wanted one', () => {
      expect(hasTag(tagged, '')).toBe(false);
      expect(hasTag({ ...tagged, tags: [WANTED_TAG] }, WANTED_TAG)).toBe(false);
    });
  });

  describe('visibleItems — the tag filter', () => {
    const TAGGED = [
      { ...item('charizard', 'rare', [copy('Mint')]), tags: ['CIB', 'rare'] },
      { ...item('alakazam', 'rare'), tags: ['cib'] },
      { ...item('blastoise', 'cards', [copy('Mint')]), tags: ['loose'] },
      { ...item('tetris', 'games', [copy('Mint')]), tags: [] },
    ];

    it('keeps only the items carrying it, however either side spelled it', () => {
      // Order is the default sort's business, not the filter's — hence .sort().
      expect(ids(visibleItems(TAGGED, DECLS, { ...ALL, tag: 'cib' })).sort()).toEqual([
        'alakazam',
        'charizard',
      ]);
    });

    it('is one more predicate, so it composes with condition, status and search', () => {
      // Four filters at once, each removing something the others would keep:
      // 'alakazam' owns nothing, 'blastoise' is not tagged cib, 'tetris' is
      // neither — and the search still has to match.
      expect(
        ids(
          visibleItems(TAGGED, DECLS, {
            ...ALL,
            tag: 'cib',
            condition: 'Mint',
            own: 'owned',
            query: 'chari',
          }),
        ),
      ).toEqual(['charizard']);

      // Drop the tag and the same filters keep two more items.
      expect(
        ids(visibleItems(TAGGED, DECLS, { ...ALL, condition: 'Mint', own: 'owned' })).sort(),
      ).toEqual(['blastoise', 'charizard', 'tetris']);

      // Contradict it and nothing survives, rather than the tag quietly winning.
      expect(visibleItems(TAGGED, DECLS, { ...ALL, tag: 'loose', own: 'wanted' })).toEqual([]);
    });

    it('narrows within the group scope rather than escaping it', () => {
      expect(
        ids(visibleItems(TAGGED, DECLS, { ...ALL, groupId: 'games', tag: 'cib' })),
      ).toEqual([]);
    });

    it('does not narrow at all when no tag is asked for', () => {
      expect(ids(visibleItems(TAGGED, DECLS, { ...ALL, tag: null }))).toEqual(
        ids(visibleItems(TAGGED, DECLS, ALL)),
      );
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
        visibleItems(ITEMS, DECLS, criteria(), SECTIONS).map(i => i.id),
      ).toEqual(['b1', 'p1', 'loose', 'stray']);
    });

    it('narrows to one run without changing the scope', () => {
      expect(
        visibleItems(ITEMS, DECLS, criteria({ sectionId: 'bronze' }), SECTIONS).map(i => i.id),
      ).toEqual(['b1']);
    });

    it('answers the leftovers filter with everything no run claims', () => {
      // Including the item pointing at another group's section: on this screen
      // it is unsectioned, so it has to answer as such rather than by its id.
      expect(
        visibleItems(ITEMS, DECLS, criteria({ sectionId: UNSECTIONED_ID }), SECTIONS).map(
          i => i.id,
        ),
      ).toEqual(['loose', 'stray']);
    });

    it('ignores sections at the collection root, where no group is open', () => {
      // A section divides one group's list; at the root there is no group, so
      // the order has to be exactly what it was before sections existed.
      const root = { groupId: null, ...NO_FILTERS };
      expect(visibleItems(ITEMS, DECLS, root, SECTIONS).map(i => i.id)).toEqual(
        visibleItems(ITEMS, DECLS, root).map(i => i.id),
      );
    });

    it('leaves the list identical to before when a collection has none', () => {
      expect(visibleItems(ITEMS, DECLS, criteria(), []).map(i => i.id)).toEqual(
        visibleItems(ITEMS, DECLS, criteria()).map(i => i.id),
      );
    });
  });

  describe('matchesQuery', () => {
    const subject = {
      ...item('Charizard', 'rare'),
      description: 'Holo, first edition',
      tags: ['graded', 'holo'],
      custom: [
        { key: 'Número', value: '004-A' },
        { key: 'Set', value: 'Base' },
      ],
    };

    it('matches an empty query, so no search means no filter', () => {
      expect(matchesQuery(subject, '')).toBe(true);
    });

    it('matches the name, the description, a tag and a field value', () => {
      // The needle arrives already trimmed and lower-cased — folding it once at
      // the call site rather than once per item.
      expect(matchesQuery(subject, 'chariz')).toBe(true);
      expect(matchesQuery(subject, 'first edition')).toBe(true);
      expect(matchesQuery(subject, 'graded')).toBe(true);
      expect(matchesQuery(subject, '004-a')).toBe(true);
    });

    it('does not match a field name, only its value', () => {
      // A group declaring "Número" would otherwise make every item match "núm".
      expect(matchesQuery(subject, 'número')).toBe(false);
    });

    it('is false when nothing on the item holds it', () => {
      expect(matchesQuery(subject, 'blastoise')).toBe(false);
    });
  });
});
