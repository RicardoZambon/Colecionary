import { describe, expect, it } from 'vitest';

import { GroupField, GroupNode } from '../models';
import {
  childrenOf,
  fieldsFor,
  flattenTree,
  pathOf,
  sortFor,
  subtreeIds,
  visibleTree,
} from './groups.util';

const text = (name: string): GroupField => ({ name, type: 'text' });

const TREE: GroupNode[] = [
  {
    id: 'cards',
    name: 'Cards',
    parentId: null,
    fields: [text('Set no.'), text('Language')],
    sort: { by: 'field:Set no.', direction: 'asc' },
    target: null,
  },
  {
    id: 'rare',
    name: 'Rare & holo',
    parentId: 'cards',
    fields: [text('Grade')],
    sort: null,
    target: null,
  },
  {
    id: 'regular',
    name: 'Regular cards',
    parentId: 'cards',
    // Redeclares an ancestor's field with a different type.
    fields: [{ name: 'Set no.', type: 'number' }],
    sort: { by: 'name', direction: 'asc' },
    target: null,
  },
  {
    id: 'games',
    name: 'Games',
    parentId: null,
    fields: [text('Completeness')],
    sort: null,
    target: null,
  },
];

describe('groups.util', () => {
  it('lists direct children of a node', () => {
    expect(childrenOf(TREE, 'cards').map(g => g.id)).toEqual(['rare', 'regular']);
    expect(childrenOf(TREE, null).map(g => g.id)).toEqual(['cards', 'games']);
  });

  describe('alphabetical ordering', () => {
    const named = (...names: string[]): GroupNode[] =>
      names.map(name => ({ id: name, name, parentId: null, fields: [], sort: null, target: null }));

    it('lists children A–Z, not in the order they were created', () => {
      const created = named('Revistas', 'Filmes', 'Bonecos');
      expect(childrenOf(created, null).map(g => g.name)).toEqual(['Bonecos', 'Filmes', 'Revistas']);
    });

    it('leaves the array it was given untouched', () => {
      const created = named('Revistas', 'Filmes', 'Bonecos');
      childrenOf(created, null);
      expect(created.map(g => g.name)).toEqual(['Revistas', 'Filmes', 'Bonecos']);
    });

    it('orders numerically and ignores case and accents', () => {
      const created = named('volume 10', 'Álbuns', 'Volume 2', 'albuns raros');
      expect(childrenOf(created, null).map(g => g.name)).toEqual([
        'Álbuns',
        'albuns raros',
        'Volume 2',
        'volume 10',
      ]);
    });

    it('sorts every level of the tree, not just the roots', () => {
      const scrambled: GroupNode[] = [
        ...named('Revistas', 'Bonecos'),
        {
          id: 'super',
          name: 'Super-heróis',
          parentId: 'Revistas',
          fields: [],
          sort: null,
          target: null,
        },
        { id: 'humor', name: 'Humor', parentId: 'Revistas', fields: [], sort: null, target: null },
      ];
      const rows = ['0:Bonecos', '0:Revistas', '1:Humor', '1:Super-heróis'];
      expect(flattenTree(scrambled).map(r => `${r.depth}:${r.node.name}`)).toEqual(rows);
      expect(
        visibleTree(scrambled, new Set(['Revistas'])).map(r => `${r.depth}:${r.node.name}`),
      ).toEqual(rows);
    });
  });

  it('collects the full subtree including the root id', () => {
    expect(subtreeIds(TREE, 'cards')).toEqual(['cards', 'rare', 'regular']);
    expect(subtreeIds(TREE, 'games')).toEqual(['games']);
  });

  it('builds the root → leaf path', () => {
    expect(pathOf(TREE, 'rare').map(g => g.id)).toEqual(['cards', 'rare']);
    expect(pathOf(TREE, 'unknown')).toEqual([]);
  });

  it('inherits custom fields from ancestors', () => {
    expect(fieldsFor(TREE, 'rare')).toEqual([text('Set no.'), text('Language'), text('Grade')]);
    expect(fieldsFor(TREE, null)).toEqual([]);
  });

  it('lets a sub-group override an inherited field type without moving it', () => {
    expect(fieldsFor(TREE, 'regular')).toEqual([
      { name: 'Set no.', type: 'number' },
      text('Language'),
    ]);
  });

  it('takes the sort from the nearest ancestor that defines one', () => {
    expect(sortFor(TREE, 'regular')).toEqual({ by: 'name', direction: 'asc' });
    expect(sortFor(TREE, 'rare')).toEqual({ by: 'field:Set no.', direction: 'asc' });
    expect(sortFor(TREE, 'games')).toBeNull();
    expect(sortFor(TREE, null)).toBeNull();
  });

  it('flattens depth-first with depths', () => {
    expect(flattenTree(TREE).map(r => `${r.depth}:${r.node.id}`)).toEqual([
      '0:cards',
      '1:rare',
      '1:regular',
      '0:games',
    ]);
  });

  describe('visibleTree', () => {
    const ids = (expanded: string[]) =>
      visibleTree(TREE, new Set(expanded)).map(r => `${r.depth}:${r.node.id}`);

    it('shows only the roots when nothing is expanded', () => {
      expect(ids([])).toEqual(['0:cards', '0:games']);
    });

    it('descends into an expanded node only', () => {
      expect(ids(['cards'])).toEqual(['0:cards', '1:rare', '1:regular', '0:games']);
    });

    it('ignores expanded ids for groups that no longer exist', () => {
      expect(ids(['deleted'])).toEqual(['0:cards', '0:games']);
    });

    it('marks which rows can be drilled into', () => {
      const rows = visibleTree(TREE, new Set());
      expect(rows.map(r => r.hasChildren)).toEqual([true, false]);
    });

    it('terminates on a parentId cycle instead of hanging', () => {
      // parentId carries no foreign key, so this shape is representable.
      const cyclic: GroupNode[] = [
        { id: 'a', name: 'A', parentId: null, fields: [], sort: null, target: null },
        { id: 'b', name: 'B', parentId: 'a', fields: [], sort: null, target: null },
        { id: 'a', name: 'A again', parentId: 'b', fields: [], sort: null, target: null },
      ];
      expect(() => visibleTree(cyclic, new Set(['a', 'b']))).not.toThrow();
    });
  });
});
