import { describe, expect, it } from 'vitest';

import { GroupNode } from '../models';
import { childrenOf, fieldsFor, flattenTree, pathOf, subtreeIds } from './groups.util';

const TREE: GroupNode[] = [
  { id: 'cards', name: 'Cards', parentId: null, fields: ['Set no.', 'Language'] },
  { id: 'rare', name: 'Rare & holo', parentId: 'cards', fields: ['Grade'] },
  { id: 'regular', name: 'Regular cards', parentId: 'cards', fields: [] },
  { id: 'games', name: 'Games', parentId: null, fields: ['Completeness'] },
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
    expect(fieldsFor(TREE, 'rare')).toEqual(['Set no.', 'Language', 'Grade']);
    expect(fieldsFor(TREE, 'regular')).toEqual(['Set no.', 'Language']);
    expect(fieldsFor(TREE, null)).toEqual([]);
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
