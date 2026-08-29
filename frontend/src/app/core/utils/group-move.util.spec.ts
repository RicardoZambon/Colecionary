import { describe, expect, it } from 'vitest';

import { Collection, GroupNode, Item } from '../models';
import { groupMoveImpact } from './group-move.util';

const group = (id: string, parentId: string | null, patch: Partial<GroupNode> = {}): GroupNode => ({
  id,
  name: id,
  parentId,
  fields: [],
  sort: null,
  target: null,
  ...patch,
});

const item = (id: string, groupId: string, custom: [string, string][] = []): Item => ({
  id,
  name: id,
  description: '',
  year: 1997,
  value: 0,
  groupId,
  sectionId: '',
  tags: [],
  img: '',
  custom: custom.map(([key, value]) => ({ key, value })),
  copies: [],
  photoIds: [],
});

/**
 * Revistas declares «Editora» and orders by name; Bonecos declares «Escala»
 * and declares no order. "Marvel" sits under Revistas with a sub-group of its
 * own, and its items hold Editora values.
 */
function vault(): Pick<Collection, 'groups' | 'items'> {
  return {
    groups: [
      group('revistas', null, {
        fields: [{ name: 'Editora', type: 'text' }],
        sort: { by: 'name', direction: 'asc' },
      }),
      group('marvel', 'revistas'),
      group('ultimate', 'marvel'),
      group('bonecos', null, { fields: [{ name: 'Escala', type: 'text' }] }),
    ],
    items: [
      item('spidey', 'marvel', [['Editora', 'Panini']]),
      item('xmen', 'ultimate', [['Editora', 'Abril']]),
      item('blank', 'marvel', [['Editora', '   ']]),
    ],
  };
}

describe('groupMoveImpact', () => {
  it('says nothing at all when the parent is not actually changing', () => {
    const impact = groupMoveImpact(vault(), 'marvel', 'revistas');
    expect(impact).toEqual({
      gained: [],
      lost: [],
      order: null,
      inheritsOrder: false,
      orderChanges: false,
      siblingClash: null,
    });
  });

  it('names the fields gained and the fields lost', () => {
    const impact = groupMoveImpact(vault(), 'marvel', 'bonecos');
    expect(impact.gained).toEqual(['Escala']);
    expect(impact.lost.map(f => f.name)).toEqual(['Editora']);
  });

  it('counts the items in the whole subtree that hold a value for a lost field', () => {
    // spidey (marvel) and xmen (in the sub-group that travels with it) — never
    // the one whose value is blank, which has nothing to go dormant.
    const impact = groupMoveImpact(vault(), 'marvel', null);
    expect(impact.lost).toEqual([{ name: 'Editora', holders: 2 }]);
  });

  it('does not count items whose own group redeclares the lost field', () => {
    // "ultimate" declares Editora itself, so its items keep displaying it and
    // are not affected by the move at all.
    const before = vault();
    const groups = before.groups.map(g =>
      g.id === 'ultimate' ? { ...g, fields: [{ name: 'Editora', type: 'text' as const }] } : g,
    );
    const impact = groupMoveImpact({ ...before, groups }, 'marvel', null);
    expect(impact.lost).toEqual([{ name: 'Editora', holders: 1 }]);
  });

  it('reports the order the subtree will inherit, and that it changes', () => {
    const impact = groupMoveImpact(vault(), 'marvel', 'bonecos');
    expect(impact.inheritsOrder).toBe(true);
    // Revistas ordered by name; Bonecos declares nothing.
    expect(impact.order).toBeNull();
    expect(impact.orderChanges).toBe(true);
  });

  it('says a group that declares its own order inherits nothing', () => {
    const before = vault();
    const groups = before.groups.map(g =>
      g.id === 'marvel' ? { ...g, sort: { by: 'year', direction: 'asc' as const } } : g,
    );
    const impact = groupMoveImpact({ ...before, groups }, 'marvel', 'bonecos');
    expect(impact.inheritsOrder).toBe(false);
    expect(impact.orderChanges).toBe(false);
  });

  it('warns about a sibling of the same name without refusing the move', () => {
    // Names are not keys — identity is the collection-wide id — and refusing
    // one would refuse a legitimate intermediate state of a document PUT.
    const before = vault();
    const groups = [...before.groups, group('outro', 'bonecos', { name: 'MARVEL' })];
    const impact = groupMoveImpact({ ...before, groups }, 'marvel', 'bonecos');
    expect(impact.siblingClash).toBe('MARVEL');
  });

  it('has no opinion about a group that no longer exists', () => {
    expect(groupMoveImpact(vault(), 'gone', null).lost).toEqual([]);
  });
});
