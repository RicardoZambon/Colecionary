import { describe, expect, it } from 'vitest';

import { GroupNode, Item, ItemCopy } from '../models';
import {
  COLLECTION_ID,
  UNGROUPED_ID,
  rootStats,
  scopeStats,
  statsIndex,
  ungroupedItems,
} from './group-stats.util';

function group(id: string, parentId: string | null = null, target: number | null = null): GroupNode {
  return { id, name: id, parentId, fields: [], sort: null, target };
}

function copy(value: number | null = null): ItemCopy {
  return {
    id: `${Math.random()}`,
    condition: 'Good',
    price: 5,
    value,
    acquiredOn: null,
    status: 'Keep',
    notes: '',
  };
}

interface ItemOptions {
  copies?: number;
  value?: number;
  photo?: string;
}

function item(id: string, groupId: string, options: ItemOptions = {}): Item {
  return {
    id,
    name: id,
    description: '',
    year: 2000,
    value: options.value ?? 10,
    groupId,
    tags: [],
    img: '',
    custom: [],
    copies: Array.from({ length: options.copies ?? 0 }, () => copy()),
    photoIds: options.photo ? [options.photo] : [],
  };
}

describe('group-stats.util', () => {
  describe('subtree rollup', () => {
    const GROUPS = [group('cards'), group('rare', 'cards'), group('regular', 'cards')];
    const ITEMS = [
      item('a', 'rare', { copies: 1, value: 100 }),
      item('b', 'rare'), // wantlist
      item('c', 'regular', { copies: 2, value: 50 }),
      item('d', 'cards', { copies: 1, value: 7 }),
    ];

    it('rolls descendants up into the parent', () => {
      const cards = statsIndex(GROUPS, ITEMS).get('cards')!;
      expect(cards.catalogued).toBe(4);
      expect(cards.owned).toBe(3);
      expect(cards.copies).toBe(4);
      expect(cards.value).toBe(207); // 100 + 50×2 + 7
      expect(cards.childCount).toBe(2);
    });

    it('keeps a leaf scoped to its own items', () => {
      const rare = statsIndex(GROUPS, ITEMS).get('rare')!;
      expect(rare.catalogued).toBe(2);
      expect(rare.owned).toBe(1);
      expect(rare.wanted).toBe(1);
      expect(rare.childCount).toBe(0);
    });

    it('totals the whole collection under COLLECTION_ID', () => {
      const total = rootStats(GROUPS, ITEMS);
      expect(total.groupId).toBeNull();
      expect(total.catalogued).toBe(4);
      expect(total.owned).toBe(3);
    });
  });

  describe('target rollup', () => {
    it('lets a declared target win over the sum of its children', () => {
      const groups = [group('mags', null, 120), group('mad', 'mags', 30), group('turma', 'mags', 20)];
      const stats = statsIndex(groups, []).get('mags')!;
      // 120 declared at the top, not 30 + 20 — otherwise a run declared once
      // would be double-counted against its sub-groups.
      expect(stats.target).toBe(120);
    });

    it('sums the children when the parent declares nothing', () => {
      const groups = [group('mags'), group('mad', 'mags', 30), group('turma', 'mags', 20)];
      expect(statsIndex(groups, []).get('mags')!.target).toBe(50);
    });

    it('sums only the topmost declaration on each branch', () => {
      const groups = [
        group('mags'),
        group('mad', 'mags', 30),
        // Nested below an already-declared branch: absorbed by mad's 30.
        group('mad-specials', 'mad', 5),
        group('turma', 'mags', 20),
      ];
      expect(statsIndex(groups, []).get('mags')!.target).toBe(50);
    });

    it('reports no target when nothing in the subtree declares one', () => {
      const groups = [group('mags'), group('mad', 'mags')];
      const stats = statsIndex(groups, [])!.get('mags')!;
      expect(stats.target).toBeNull();
      expect(stats.hasTarget).toBe(false);
    });

    it('rolls root targets up into the collection total', () => {
      const groups = [group('a', null, 10), group('b', null, 5), group('c')];
      expect(rootStats(groups, []).target).toBe(15);
    });
  });

  describe('denominator and the three kinds of missing', () => {
    it('measures against the catalogued count when no target is declared', () => {
      const groups = [group('g')];
      const items = [item('a', 'g', { copies: 1 }), item('b', 'g'), item('c', 'g')];
      const stats = statsIndex(groups, items).get('g')!;

      expect(stats.denominator).toBe(3);
      expect(stats.pct).toBe(33);
      expect(stats.wanted).toBe(2);
      expect(stats.uncatalogued).toBe(0);
      // With no target the two collapse into one number.
      expect(stats.missing).toBe(stats.wanted);
    });

    it('measures against the target and splits missing in two', () => {
      const groups = [group('g', null, 120)];
      const items = [
        item('a', 'g', { copies: 1 }),
        item('b', 'g', { copies: 1 }),
        item('c', 'g'),
        item('d', 'g'),
        item('e', 'g'),
      ];
      const stats = statsIndex(groups, items).get('g')!;

      expect(stats.denominator).toBe(120);
      expect(stats.owned).toBe(2);
      expect(stats.wanted).toBe(3); // listed, not held
      expect(stats.uncatalogued).toBe(115); // not even listed
      expect(stats.missing).toBe(118);
      expect(stats.pct).toBe(2);
      expect(stats.cataloguedPct).toBe(4);
    });

    it('keeps missing honest when a stale target sits below what is catalogued', () => {
      const groups = [group('g', null, 2)];
      const items = [item('a', 'g', { copies: 1 }), item('b', 'g'), item('c', 'g')];
      const stats = statsIndex(groups, items).get('g')!;

      // denominator − owned would say 1; the truth is that two listed items
      // are not held, and the target is simply out of date.
      expect(stats.wanted).toBe(2);
      expect(stats.uncatalogued).toBe(0);
      expect(stats.missing).toBe(2);
    });
  });

  describe('over-collecting', () => {
    it('clamps the bar and reports the overrun instead of rewriting the target', () => {
      const groups = [group('g', null, 2)];
      const items = [
        item('a', 'g', { copies: 1 }),
        item('b', 'g', { copies: 1 }),
        item('c', 'g', { copies: 1 }),
      ];
      const stats = statsIndex(groups, items).get('g')!;

      expect(stats.pct).toBe(100); // never overflows the track
      expect(stats.cataloguedPct).toBe(100);
      expect(stats.over).toBe(1);
      expect(stats.missing).toBe(0);
    });

    it('never reports an overrun without a target', () => {
      const groups = [group('g')];
      expect(statsIndex(groups, [item('a', 'g', { copies: 1 })]).get('g')!.over).toBe(0);
    });
  });

  describe('empty and degenerate inputs', () => {
    it('yields zeros rather than NaN for an empty group', () => {
      const stats = statsIndex([group('g')], []).get('g')!;
      expect(stats.pct).toBe(0);
      expect(stats.cataloguedPct).toBe(0);
      expect(stats.denominator).toBe(0);
      expect(stats.missing).toBe(0);
      expect(Number.isNaN(stats.pct)).toBe(false);
    });

    it('handles a collection with no groups at all', () => {
      const total = rootStats([], []);
      expect(total.catalogued).toBe(0);
      expect(total.pct).toBe(0);
      expect(total.target).toBeNull();
    });

    it('terminates on a parentId cycle instead of hanging', () => {
      // Reachable because parentId carries no foreign key.
      const groups = [group('a'), group('b', 'a'), { ...group('a'), parentId: 'b' }];
      expect(() => statsIndex(groups, [])).not.toThrow();
    });

    it('returns an empty scope for a group id that no longer exists', () => {
      const stats = scopeStats(statsIndex([group('g')], []), 'deleted');
      expect(stats.catalogued).toBe(0);
      expect(stats.groupId).toBe('deleted');
    });

    it('resolves a null scope to the collection total', () => {
      const index = statsIndex([group('g')], [item('a', 'g', { copies: 1 })]);
      expect(scopeStats(index, null)).toBe(index.get(COLLECTION_ID));
    });
  });

  describe('the ungrouped bucket', () => {
    const GROUPS = [group('g')];
    const ITEMS = [
      item('filed', 'g', { copies: 1 }),
      item('blank', ''), // no group chosen
      item('dangling', 'deleted-group', { copies: 1 }),
    ];

    it('collects items whose groupId is empty or dangling', () => {
      const stats = statsIndex(GROUPS, ITEMS).get(UNGROUPED_ID)!;
      expect(stats.catalogued).toBe(2);
      expect(stats.owned).toBe(1);
      expect(ungroupedItems(GROUPS, ITEMS).map(i => i.id)).toEqual(['blank', 'dangling']);
    });

    it('is absent when every item is filed', () => {
      expect(statsIndex(GROUPS, [item('filed', 'g')]).has(UNGROUPED_ID)).toBe(false);
    });

    it('makes the cards add up to the collection total', () => {
      const index = statsIndex(GROUPS, ITEMS);
      const cards = index.get('g')!.catalogued + index.get(UNGROUPED_ID)!.catalogued;
      expect(cards).toBe(index.get(COLLECTION_ID)!.catalogued);
    });
  });

  describe('mosaic covers', () => {
    it('prefers owned items and keeps collection order', () => {
      const groups = [group('g')];
      const items = [
        item('a', 'g', { photo: 'p1' }), // wantlist
        item('b', 'g', { copies: 1, photo: 'p2' }),
        item('c', 'g', { copies: 1, photo: 'p3' }),
      ];
      expect(statsIndex(groups, items).get('g')!.coverPhotoIds).toEqual(['p2', 'p3', 'p1']);
    });

    it('skips items with no photo and caps at four', () => {
      const groups = [group('g')];
      const items = [
        item('none', 'g', { copies: 1 }),
        ...['p1', 'p2', 'p3', 'p4', 'p5'].map((p, i) => item(`i${i}`, 'g', { copies: 1, photo: p })),
      ];
      expect(statsIndex(groups, items).get('g')!.coverPhotoIds).toEqual(['p1', 'p2', 'p3', 'p4']);
    });

    it('merges children in collection order, not group order', () => {
      const groups = [group('root'), group('left', 'root'), group('right', 'root')];
      const items = [
        item('a', 'right', { copies: 1, photo: 'p1' }),
        item('b', 'left', { copies: 1, photo: 'p2' }),
        item('c', 'right', { copies: 1, photo: 'p3' }),
      ];
      expect(statsIndex(groups, items).get('root')!.coverPhotoIds).toEqual(['p1', 'p2', 'p3']);
    });

    it('is deterministic across calls', () => {
      const groups = [group('g')];
      const items = ['p1', 'p2', 'p3'].map((p, i) => item(`i${i}`, 'g', { copies: 1, photo: p }));
      const first = statsIndex(groups, items).get('g')!.coverPhotoIds;
      const second = statsIndex(groups, items).get('g')!.coverPhotoIds;
      expect(first).toEqual(second);
    });
  });
});
