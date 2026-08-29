import { describe, expect, it } from 'vitest';

import {
  EMPTY_SELECTION,
  SelectionState,
  allSelected,
  extendTo,
  noneSelected,
  selectedIn,
  setAll,
  someSelected,
  toggle,
} from './item-selection';

const VISIBLE = ['a', 'b', 'c', 'd', 'e'];

function state(ids: string[], anchor: string | null = null): SelectionState {
  return { ids: new Set(ids), anchor };
}

describe('item-selection', () => {
  describe('selectedIn', () => {
    it('reports the intersection, in the order the screen shows', () => {
      expect(selectedIn(state(['d', 'a']), VISIBLE)).toEqual(['a', 'd']);
    });

    it('hides — never destroys — a selected row a filter has taken away', () => {
      // Narrowing a filter must not throw the selection away, and no action may
      // ever reach a row the user cannot see. Both fall out of this one rule.
      const narrowed = ['a', 'b'];
      expect(selectedIn(state(['a', 'e']), narrowed)).toEqual(['a']);
      // Widen again and 'e' is still there.
      expect(selectedIn(state(['a', 'e']), VISIBLE)).toEqual(['a', 'e']);
    });
  });

  describe('the header tri-state', () => {
    it('is none, some, or all', () => {
      expect(noneSelected(EMPTY_SELECTION, VISIBLE)).toBe(true);
      expect(someSelected(state(['b']), VISIBLE)).toBe(true);
      expect(allSelected(state(VISIBLE), VISIBLE)).toBe(true);
      expect(someSelected(state(VISIBLE), VISIBLE)).toBe(false);
    });

    it('is not "all" when there is nothing on screen', () => {
      // An empty list with a ticked "select all" would be a lie.
      expect(allSelected(state([]), [])).toBe(false);
    });

    it('ignores selected rows the filter hid when judging "all"', () => {
      expect(allSelected(state(['a', 'b', 'zzz']), ['a', 'b'])).toBe(true);
    });
  });

  describe('toggle', () => {
    it('adds, removes, and moves the anchor', () => {
      const one = toggle(EMPTY_SELECTION, 'b', true);
      expect([...one.ids]).toEqual(['b']);
      expect(one.anchor).toBe('b');

      const none = toggle(one, 'b', false);
      expect([...none.ids]).toEqual([]);
      expect(none.anchor).toBe('b');
    });

    it('never mutates the state it was given', () => {
      const before = state(['a']);
      toggle(before, 'b', true);
      expect([...before.ids]).toEqual(['a']);
    });
  });

  describe('extendTo', () => {
    it('selects the run between the anchor and the row, inclusive', () => {
      const anchored = toggle(EMPTY_SELECTION, 'b', true);
      const ranged = extendTo(anchored, VISIBLE, 'd', true);
      expect(selectedIn(ranged, VISIBLE)).toEqual(['b', 'c', 'd']);
    });

    it('works backwards as well as forwards', () => {
      const anchored = toggle(EMPTY_SELECTION, 'd', true);
      expect(selectedIn(extendTo(anchored, VISIBLE, 'b', true), VISIBLE)).toEqual([
        'b',
        'c',
        'd',
      ]);
    });

    it('spans a section heading, because it spans the visible list', () => {
      // `visibleIds` is the flat, already-ordered list whose indices
      // `SectionEntry.index` carries — so a range crossing a heading is exactly
      // the rows the reader can see between the two.
      const anchored = toggle(EMPTY_SELECTION, 'a', true);
      expect(selectedIn(extendTo(anchored, VISIBLE, 'e', true), VISIBLE)).toEqual(VISIBLE);
    });

    it('leaves the anchor put, so dragging a range back shrinks it', () => {
      const anchored = toggle(EMPTY_SELECTION, 'b', true);
      const wide = extendTo(anchored, VISIBLE, 'e', true);
      expect(wide.anchor).toBe('b');
      const narrow = extendTo(wide, VISIBLE, 'c', false);
      // b..c deselected, d and e keep what the wide pass gave them.
      expect(selectedIn(narrow, VISIBLE)).toEqual(['d', 'e']);
    });

    it('degrades to a plain toggle with no anchor', () => {
      expect(selectedIn(extendTo(EMPTY_SELECTION, VISIBLE, 'c', true), VISIBLE)).toEqual(['c']);
    });

    it('degrades to a plain toggle when the anchor is no longer visible', () => {
      const stale = state(['zzz'], 'zzz');
      expect(selectedIn(extendTo(stale, VISIBLE, 'c', true), VISIBLE)).toEqual(['c']);
    });

    it('deselects a range too', () => {
      const anchored = { ids: new Set(VISIBLE), anchor: 'b' };
      expect(selectedIn(extendTo(anchored, VISIBLE, 'd', false), VISIBLE)).toEqual(['a', 'e']);
    });
  });

  describe('setAll', () => {
    it('selects exactly what is visible', () => {
      expect(selectedIn(setAll(EMPTY_SELECTION, ['a', 'c'], true), VISIBLE)).toEqual(['a', 'c']);
    });

    it('deselecting leaves the rows a filter hid alone', () => {
      // "Clear" is the affordance for throwing the whole thing away; the header
      // only speaks for the rows under it.
      const wide = state(['a', 'e']);
      const cleared = setAll(wide, ['a'], false);
      expect([...cleared.ids]).toEqual(['e']);
    });

    it('drops the anchor, since a bulk pick has no single origin', () => {
      expect(setAll(state(['a'], 'a'), VISIBLE, true).anchor).toBeNull();
    });
  });
});
