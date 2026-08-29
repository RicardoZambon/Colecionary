import { describe, expect, it } from 'vitest';

import { GroupNode, Item, ItemCopy, Section } from '../../../core/models';
import { UNGROUPED_ID } from '../../../core/utils/group-stats.util';
import { UNSECTIONED_ID } from '../../../core/utils/sections.util';
import {
  applyBulkPatch,
  distinctValues,
  isEmptyPatch,
  removeItems,
} from './bulk-patch';

function group(id: string, parentId: string | null = null): GroupNode {
  return { id, name: id, parentId, fields: [], sort: null, target: null };
}

function copy(id: string, status: ItemCopy['status'] = 'Keep'): ItemCopy {
  return {
    id,
    condition: 'Good',
    price: 5,
    value: null,
    acquiredOn: null,
    status,
    notes: '',
  };
}

function item(id: string, patch: Partial<Item> = {}): Item {
  return {
    id,
    name: id,
    description: '',
    year: 1999,
    value: 10,
    groupId: 'espanha',
    sectionId: '',
    tags: [],
    img: '',
    custom: [],
    copies: [],
    photoIds: [],
    ...patch,
  };
}

const GROUPS = [group('espanha'), group('bronze-group', 'espanha'), group('brasil')];

const SECTIONS: Section[] = [
  { id: 'bronze', groupId: 'espanha', name: 'Bronze', target: 10 },
  { id: 'ouro', groupId: 'espanha', name: 'Ouro', target: null },
  { id: 'outra', groupId: 'brasil', name: 'Outra', target: null },
];

const CTX = { groups: GROUPS, sections: SECTIONS };

const ids = (...v: string[]) => new Set(v);

describe('bulk-patch', () => {
  describe('applyBulkPatch', () => {
    it('touches only the selected items, and keeps the array order', () => {
      // Manual order *is* the array order, so a bulk edit that reordered it
      // would silently rewrite an ordering arranged by hand.
      const items = [item('a'), item('b'), item('c')];
      const out = applyBulkPatch(items, ids('b'), { year: '2001' }, CTX);
      expect(out.map(i => i.id)).toEqual(['a', 'b', 'c']);
      expect(out.map(i => i.year)).toEqual([1999, 2001, 1999]);
      // Untouched entries come back by reference: nothing was rewritten.
      expect(out[0]).toBe(items[0]);
    });

    it('resolves the destination group, collapsing the bucket sentinel to ""', () => {
      const out = applyBulkPatch([item('a')], ids('a'), { groupId: UNGROUPED_ID }, CTX);
      expect(out[0].groupId).toBe('');
    });

    it('resolves a group that no longer exists to "no group"', () => {
      const out = applyBulkPatch([item('a')], ids('a'), { groupId: 'deleted' }, CTX);
      expect(out[0].groupId).toBe('');
    });

    it('re-resolves the section when the group moves', () => {
      // A section belongs to exactly one group. Skipping this leaves items
      // pointing at a divider of a group they are no longer in.
      const out = applyBulkPatch(
        [item('a', { sectionId: 'bronze' })],
        ids('a'),
        { groupId: 'brasil' },
        CTX,
      );
      expect(out[0].groupId).toBe('brasil');
      expect(out[0].sectionId).toBe('');
    });

    it('leaves a dangling section alone when the group is not moving', () => {
      // Normalising every write would turn a merely dangling reference —
      // legal, and something an intermediate edit state produces — into a
      // persisted clear nobody asked for.
      const out = applyBulkPatch(
        [item('a', { sectionId: 'gone' })],
        ids('a'),
        { year: '2001' },
        CTX,
      );
      expect(out[0].sectionId).toBe('gone');
    });

    it('sets a section against the destination group, not the old one', () => {
      const out = applyBulkPatch(
        [item('a', { groupId: 'espanha' })],
        ids('a'),
        { groupId: 'brasil', sectionId: 'outra' },
        CTX,
      );
      expect(out[0].sectionId).toBe('outra');
    });

    it('refuses a section belonging to a different group', () => {
      const out = applyBulkPatch([item('a')], ids('a'), { sectionId: 'outra' }, CTX);
      expect(out[0].sectionId).toBe('');
    });

    it('treats the leftovers sentinel as "no section"', () => {
      const out = applyBulkPatch(
        [item('a', { sectionId: 'bronze' })],
        ids('a'),
        { sectionId: UNSECTIONED_ID },
        CTX,
      );
      expect(out[0].sectionId).toBe('');
    });

    it('clears a value to 0, which is exactly "not estimated"', () => {
      const out = applyBulkPatch([item('a', { value: 42 })], ids('a'), { value: '' }, CTX);
      expect(out[0].value).toBe(0);
    });

    it('ignores a blank year, because the model cannot spell "unknown"', () => {
      const out = applyBulkPatch([item('a', { year: 1975 })], ids('a'), { year: '  ' }, CTX);
      expect(out[0].year).toBe(1975);
    });

    it('reads a decimal comma in a value', () => {
      const out = applyBulkPatch([item('a')], ids('a'), { value: '12,50' }, CTX);
      expect(out[0].value).toBe(12.5);
    });

    describe('custom fields', () => {
      const withFields = item('a', {
        custom: [
          { key: 'Número', value: '004' },
          { key: 'Set', value: 'Base' },
        ],
      });

      it('sets a mentioned field and keeps the rest', () => {
        const out = applyBulkPatch([withFields], ids('a'), { fields: { Set: 'Jungle' } }, CTX);
        expect(out[0].custom).toEqual([
          { key: 'Número', value: '004' },
          { key: 'Set', value: 'Jungle' },
        ]);
      });

      it('keeps a field the destination group does not declare', () => {
        // `item-form-page` drops undeclared fields for one item, in front of a
        // user looking at that item's whole field set. Doing it across forty
        // would destroy data nobody was shown.
        const out = applyBulkPatch(
          [withFields],
          ids('a'),
          { groupId: 'brasil', fields: { Número: '005' } },
          CTX,
        );
        expect(out[0].custom).toEqual([
          { key: 'Número', value: '005' },
          { key: 'Set', value: 'Base' },
        ]);
      });

      it('removes a field mentioned with a blank value — that is the clear', () => {
        const out = applyBulkPatch([withFields], ids('a'), { fields: { Set: '  ' } }, CTX);
        expect(out[0].custom).toEqual([{ key: 'Número', value: '004' }]);
      });

      it('adds a field the item did not carry', () => {
        const out = applyBulkPatch([item('a')], ids('a'), { fields: { Grade: 'PSA 9' } }, CTX);
        expect(out[0].custom).toEqual([{ key: 'Grade', value: 'PSA 9' }]);
      });

      it('does not add a field whose patched value is blank', () => {
        const out = applyBulkPatch([item('a')], ids('a'), { fields: { Grade: '' } }, CTX);
        expect(out[0].custom).toEqual([]);
      });
    });

    describe('tags', () => {
      it('adds and removes one tag', () => {
        const out = applyBulkPatch(
          [item('a', { tags: ['holo'] })],
          ids('a'),
          { addTag: 'graded', removeTag: 'holo' },
          CTX,
        );
        expect(out[0].tags).toEqual(['graded']);
      });

      it('does not duplicate a tag the item already has', () => {
        const out = applyBulkPatch(
          [item('a', { tags: ['holo'] })],
          ids('a'),
          { addTag: 'holo' },
          CTX,
        );
        expect(out[0].tags).toEqual(['holo']);
      });

      it('never touches `wanted`, which is derived from the copies', () => {
        // Adding it would claim an item with copies is on the wantlist;
        // removing it would strip the marker off one that is. `syncWantedTag`
        // owns that tag.
        const wanted = item('a', { tags: ['wanted'] });
        expect(applyBulkPatch([wanted], ids('a'), { removeTag: 'wanted' }, CTX)[0].tags).toEqual([
          'wanted',
        ]);
        const owned = item('b', { tags: [], copies: [copy('c1')] });
        expect(applyBulkPatch([owned], ids('b'), { addTag: 'wanted' }, CTX)[0].tags).toEqual([]);
      });
    });

    it('sets the status of every copy, and only the status', () => {
      const held = item('a', { copies: [copy('c1', 'Keep'), copy('c2', 'ForTrade')] });
      const out = applyBulkPatch([held], ids('a'), { copyStatus: 'ForSale' }, CTX);
      expect(out[0].copies.map(c => c.status)).toEqual(['ForSale', 'ForSale']);
      expect(out[0].copies.map(c => c.condition)).toEqual(['Good', 'Good']);
      expect(out[0].copies.map(c => c.price)).toEqual([5, 5]);
    });

    it('leaves a wantlist item without copies rather than inventing one', () => {
      const out = applyBulkPatch([item('a')], ids('a'), { copyStatus: 'ForSale' }, CTX);
      expect(out[0].copies).toEqual([]);
    });
  });

  describe('removeItems', () => {
    it('drops exactly the selected ids', () => {
      const items = [item('a'), item('b'), item('c')];
      expect(removeItems(items, ids('a', 'c')).map(i => i.id)).toEqual(['b']);
    });
  });

  describe('isEmptyPatch', () => {
    it('is true for an untouched draft', () => {
      expect(isEmptyPatch({})).toBe(true);
      expect(isEmptyPatch({ fields: {} })).toBe(true);
      expect(isEmptyPatch({ addTag: '  ', removeTag: '' })).toBe(true);
      // A year touched and left blank changes nothing, by design.
      expect(isEmptyPatch({ year: '' })).toBe(true);
    });

    it('is false as soon as one field would land', () => {
      expect(isEmptyPatch({ groupId: '' })).toBe(false);
      expect(isEmptyPatch({ sectionId: '' })).toBe(false);
      expect(isEmptyPatch({ value: '' })).toBe(false);
      expect(isEmptyPatch({ fields: { Set: '' } })).toBe(false);
      expect(isEmptyPatch({ copyStatus: 'Keep' })).toBe(false);
    });
  });

  describe('distinctValues', () => {
    it('counts the different values present, ignoring absences', () => {
      const items = [item('a', { year: 1999 }), item('b', { year: 2001 }), item('c', { year: 1999 })];
      expect(distinctValues(items, i => String(i.year))).toEqual(['1999', '2001']);
    });

    it('reports nothing when no item holds a value', () => {
      expect(distinctValues([item('a'), item('b')], i => i.sectionId)).toEqual([]);
    });
  });
});
