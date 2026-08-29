import { describe, expect, it } from 'vitest';

import { UNSECTIONED_ID } from '../../core/utils/sections.util';
import {
  groupLinkParams,
  readCondition,
  readCriteria,
  readOwn,
  readSection,
  readSort,
  sectionParams,
  sortParams,
} from './browse-params';

describe('browse-params', () => {
  describe('reading', () => {
    it('accepts the wire values and rejects everything else', () => {
      expect(readCondition('Mint')).toBe('Mint');
      expect(readCondition('mint')).toBeNull();
      expect(readCondition('Bananas')).toBeNull();
      expect(readCondition(undefined)).toBeNull();

      expect(readOwn('owned')).toBe('owned');
      expect(readOwn('wanted')).toBe('wanted');
      expect(readOwn('both')).toBeNull();
    });

    it('takes a built-in sort key and defaults the direction to ascending', () => {
      expect(readSort('name', undefined)).toEqual({ by: 'name', direction: 'asc' });
      expect(readSort('value', 'desc')).toEqual({ by: 'value', direction: 'desc' });
      expect(readSort('value', 'sideways')).toEqual({ by: 'value', direction: 'asc' });
    });

    it('takes any custom field key, since a field can be named anything', () => {
      expect(readSort('field:Set no.: 2', 'desc')).toEqual({
        by: 'field:Set no.: 2',
        direction: 'desc',
      });
    });

    it('reads an unknown sort key as no sort at all, leaving the group in charge', () => {
      expect(readSort('whatever', 'asc')).toBeNull();
      expect(readSort('', 'asc')).toBeNull();
      expect(readSort(undefined, 'desc')).toBeNull();
    });

    it('assembles the criteria a screen browses under', () => {
      expect(
        readCriteria({ cond: 'Good', own: 'owned', sort: 'year', dir: 'desc' }, 'cards', 'holo'),
      ).toEqual({
        groupId: 'cards',
        sectionId: null,
        condition: 'Good',
        own: 'owned',
        query: 'holo',
        sort: { by: 'year', direction: 'desc' },
      });
    });
  });

  describe('writing', () => {
    it('carries a sort, and clears both params when there is none', () => {
      expect(sortParams({ by: 'name', direction: 'asc' })).toEqual({ sort: 'name', dir: 'asc' });
      expect(sortParams(null)).toEqual({ sort: null, dir: null });
    });

    it('round-trips a sort through the URL', () => {
      const sort = { by: 'field:Número', direction: 'desc' } as const;
      const params = sortParams(sort);
      expect(readSort(params['sort'], params['dir'])).toEqual(sort);
    });

    it('drops the ad-hoc order and the section when opening a group', () => {
      // Each group declares its own order; a pick made in one must not outlive
      // it. The section goes for a stronger reason — it belongs to exactly one
      // group, so carrying it across would name a divider the new group does
      // not have and empty the screen. The filters survive: the link merges.
      expect(groupLinkParams('cards')).toEqual({ g: 'cards', sort: null, dir: null, s: null });
      expect(groupLinkParams(null)).toEqual({ g: null, sort: null, dir: null, s: null });
    });
  });

  describe('sections', () => {
    const SECTIONS = [
      { id: 'bronze', groupId: 'cards', name: 'Bronze', target: null },
      { id: 'outra', groupId: 'games', name: 'Outra', target: null },
    ];

    it('accepts a divider the open group actually has', () => {
      expect(readSection('bronze', SECTIONS, 'cards')).toBe('bronze');
    });

    it('refuses one belonging to another group', () => {
      // Unlike a renamed sort field, this does not fade quietly: a section id
      // from a group you have left would match nothing and empty the screen.
      expect(readSection('outra', SECTIONS, 'cards')).toBeNull();
      expect(readSection('gone', SECTIONS, 'cards')).toBeNull();
      expect(readSection('bronze', SECTIONS, null)).toBeNull();
    });

    it('lets the leftovers bucket through without a group of its own', () => {
      expect(readSection(UNSECTIONED_ID, SECTIONS, 'cards')).toBe(UNSECTIONED_ID);
    });

    it('round-trips through the URL, and clears with null', () => {
      expect(sectionParams('bronze')).toEqual({ s: 'bronze' });
      expect(sectionParams(null)).toEqual({ s: null });
    });
  });
});
