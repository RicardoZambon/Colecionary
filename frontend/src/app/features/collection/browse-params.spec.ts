import { describe, expect, it } from 'vitest';

import { Item } from '../../core/models';
import { UNSECTIONED_ID } from '../../core/utils/sections.util';
import { WANTED_TAG } from '../../core/utils/tags.util';
import {
  groupLinkParams,
  nextSortFor,
  readCondition,
  readCriteria,
  readOwn,
  readSection,
  readSort,
  readTag,
  sectionParams,
  sortParams,
  tagParams,
} from './browse-params';

function item(id: string, tags: string[]): Item {
  return {
    id,
    name: id,
    description: '',
    year: 2000,
    value: 0,
    groupId: '',
    sectionId: '',
    tags,
    img: '',
    custom: [],
    copies: [],
    photoIds: [],
  };
}

const TAGGED = [item('a', ['CIB', 'rare']), item('b', ['loose', WANTED_TAG])];

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

    describe('readTag', () => {
      it('takes a tag some item carries, spelled however the URL spelled it', () => {
        expect(readTag('CIB', TAGGED)).toBe('CIB');
        // The editor stores a tag as typed and compares ignoring case, so the
        // filter has to agree — otherwise one label would be two answers.
        expect(readTag('cib', TAGGED)).toBe('cib');
        expect(readTag('  rare  ', TAGGED)).toBe('rare');
      });

      it('reads a tag nobody carries as no filter, not as an empty list', () => {
        // Same choice as an unknown `?cond=`: a filter nothing can satisfy would
        // answer every screen "no matches" and never hint that the URL is what
        // is wrong.
        expect(readTag('bananas', TAGGED)).toBeNull();
        expect(readTag('cib', [])).toBeNull();
      });

      it('reads a blank tag as no filter', () => {
        expect(readTag('', TAGGED)).toBeNull();
        expect(readTag('   ', TAGGED)).toBeNull();
        expect(readTag(undefined, TAGGED)).toBeNull();
      });

      it('refuses the derived wanted tag however it is capitalised', () => {
        // Nobody applied it and nobody may remove it, so it is not a label to
        // browse by — and offering it would name a list no chip can produce.
        expect(readTag(WANTED_TAG, TAGGED)).toBeNull();
        expect(readTag('Wanted', TAGGED)).toBeNull();
      });

      it('is not a substring match, which is what the search box already is', () => {
        expect(readTag('ci', TAGGED)).toBeNull();
        expect(readTag('rarer', TAGGED)).toBeNull();
      });

      it('round-trips through the URL, and clears with a null', () => {
        expect(tagParams('rare')).toEqual({ tag: 'rare' });
        expect(tagParams(null)).toEqual({ tag: null });
        expect(readTag(tagParams('rare')['tag'], TAGGED)).toBe('rare');
      });
    });

    it('assembles the criteria a screen browses under', () => {
      expect(
        readCriteria({ cond: 'Good', own: 'owned', sort: 'year', dir: 'desc' }, 'cards', 'holo'),
      ).toEqual({
        groupId: 'cards',
        sectionId: null,
        condition: 'Good',
        own: 'owned',
        tag: null,
        query: 'holo',
        sort: { by: 'year', direction: 'desc' },
      });
    });

    it('resolves the tag against the collection it was handed', () => {
      expect(readCriteria({ tag: 'rare' }, null, '', { items: TAGGED }).tag).toBe('rare');
      // No collection in hand is not a licence to trust the param: with nothing
      // to check against, nothing is carried.
      expect(readCriteria({ tag: 'rare' }, null, '').tag).toBeNull();
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
  describe('nextSortFor', () => {
    it('opens a fresh column ascending, and money descending', () => {
      // A name column answers "where is X"; a value column answers "what is
      // the expensive one".
      expect(nextSortFor({ by: 'name', direction: 'asc' }, 'year')).toEqual({
        by: 'year',
        direction: 'asc',
      });
      expect(nextSortFor({ by: 'name', direction: 'asc' }, 'value')).toEqual({
        by: 'value',
        direction: 'desc',
      });
      expect(nextSortFor({ by: 'name', direction: 'asc' }, 'field:Número')).toEqual({
        by: 'field:Número',
        direction: 'asc',
      });
    });

    it('reverses the column already in force', () => {
      expect(nextSortFor({ by: 'year', direction: 'asc' }, 'year')).toEqual({
        by: 'year',
        direction: 'desc',
      });
      expect(nextSortFor({ by: 'year', direction: 'desc' }, 'year')).toEqual({
        by: 'year',
        direction: 'asc',
      });
    });

    it('reverses a group-declared order on the first click', () => {
      // The caller passes the *effective* sort, so clicking the column a group
      // already sorts by flips it instead of appearing to do nothing.
      expect(nextSortFor({ by: 'field:Número', direction: 'asc' }, 'field:Número')).toEqual({
        by: 'field:Número',
        direction: 'desc',
      });
    });
  });
});
