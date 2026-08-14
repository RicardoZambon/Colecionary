import { describe, expect, it } from 'vitest';

import {
  groupLinkParams,
  readCondition,
  readCriteria,
  readOwn,
  readSort,
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

    it('drops the ad-hoc order when opening a group, keeping everything else', () => {
      // Each group declares its own order; a pick made in one must not outlive
      // it. The filters survive because the link merges.
      expect(groupLinkParams('cards')).toEqual({ g: 'cards', sort: null, dir: null });
      expect(groupLinkParams(null)).toEqual({ g: null, sort: null, dir: null });
    });
  });
});
