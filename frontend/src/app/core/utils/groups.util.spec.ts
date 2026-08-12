import { describe, expect, it } from 'vitest';

import { GroupField, GroupNode } from '../models';
import { childrenOf, fieldsFor, flattenTree, pathOf, sortFor, subtreeIds } from './groups.util';

const text = (name: string): GroupField => ({ name, type: 'text' });

const TREE: GroupNode[] = [
  {
    id: 'cards',
    name: 'Cards',
    parentId: null,
    fields: [text('Set no.'), text('Language')],
    sort: { by: 'field:Set no.', direction: 'asc' },
  },
  { id: 'rare', name: 'Rare & holo', parentId: 'cards', fields: [text('Grade')], sort: null },
  {
    id: 'regular',
    name: 'Regular cards',
    parentId: 'cards',
    // Redeclares an ancestor's field with a different type.
    fields: [{ name: 'Set no.', type: 'number' }],
    sort: { by: 'name', direction: 'asc' },
  },
  { id: 'games', name: 'Games', parentId: null, fields: [text('Completeness')], sort: null },
];

describe('groups.util', () => {
  it('lists direct children of a node', () => {
    expect(childrenOf(TREE, 'cards').map(g => g.id)).toEqual(['rare', 'regular']);
    expect(childrenOf(TREE, null).map(g => g.id)).toEqual(['cards', 'games']);
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
});
