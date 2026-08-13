import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  initialExpanded,
  readCollapsed,
  readExpanded,
  writeCollapsed,
  writeExpanded,
} from './tree-prefs';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** Safari in private mode: every access throws rather than returning null. */
function stubThrowingStorage(): void {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
  });
}

describe('tree-prefs', () => {
  it('round-trips the expanded set per collection', () => {
    writeExpanded('comics', new Set(['Marvel', 'DC']));
    expect(readExpanded('comics')).toEqual(new Set(['Marvel', 'DC']));
    expect(readExpanded('pokemon')).toBeNull();
  });

  it('round-trips the collapsed flag', () => {
    expect(readCollapsed()).toBeNull();
    writeCollapsed(true);
    expect(readCollapsed()).toBe(true);
    writeCollapsed(false);
    expect(readCollapsed()).toBe(false);
  });

  it('treats unreadable storage as no preference', () => {
    localStorage.setItem('vault.tree.expanded.comics', 'not json');
    expect(readExpanded('comics')).toBeNull();
  });

  it('ignores a stored value of the wrong shape', () => {
    localStorage.setItem('vault.tree.expanded.comics', '{"Marvel":true}');
    expect(readExpanded('comics')).toBeNull();
  });

  it('survives storage that throws instead of failing the page', () => {
    stubThrowingStorage();
    expect(readExpanded('comics')).toBeNull();
    expect(readCollapsed()).toBeNull();
    expect(() => writeExpanded('comics', new Set(['a']))).not.toThrow();
    expect(() => writeCollapsed(true)).not.toThrow();
  });

  describe('initialExpanded', () => {
    const known = new Set(['a', 'b', 'c']);

    it('opens the path to the selected group when nothing is stored', () => {
      expect(initialExpanded(null, ['a', 'b'], known)).toEqual(new Set(['a', 'b']));
    });

    it('prefers what was stored', () => {
      expect(initialExpanded(new Set(['c']), ['a', 'b'], known)).toEqual(new Set(['c']));
    });

    it('drops ids for groups that no longer exist', () => {
      expect(initialExpanded(new Set(['a', 'deleted']), [], known)).toEqual(new Set(['a']));
    });
  });
});
