import { afterEach, describe, expect, it, vi } from 'vitest';

import { GroupField } from '../../../core/models';
import { readHidden, toggleHidden, visibleFields, writeHidden } from './column-prefs';

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

const FIELDS: GroupField[] = [
  { name: 'Número', type: 'number' },
  { name: 'Set', type: 'text' },
  { name: 'Lançamento', type: 'date' },
];

describe('column-prefs', () => {
  it('round-trips per collection and per group', () => {
    writeHidden('c1', 'espanha', new Set(['Set']));
    expect(readHidden('c1', 'espanha')).toEqual(new Set(['Set']));
    // The field set is per group, so the preference is too.
    expect(readHidden('c1', 'brasil')).toEqual(new Set());
    expect(readHidden('c2', 'espanha')).toEqual(new Set());
  });

  it('uses "" as the key for the collection root and the unfiled bucket', () => {
    writeHidden('c1', '', new Set(['Número']));
    expect(readHidden('c1', '')).toEqual(new Set(['Número']));
    expect(localStorage.getItem('vault.cols.c1.')).toBe('["Número"]');
  });

  it('treats unreadable storage as no preference', () => {
    localStorage.setItem('vault.cols.c1.espanha', 'not json');
    expect(readHidden('c1', 'espanha')).toEqual(new Set());
  });

  it('ignores a stored value of the wrong shape', () => {
    localStorage.setItem('vault.cols.c1.espanha', '{"Set":true}');
    expect(readHidden('c1', 'espanha')).toEqual(new Set());
  });

  it('survives storage that throws instead of failing the page', () => {
    stubThrowingStorage();
    expect(readHidden('c1', 'espanha')).toEqual(new Set());
    expect(() => writeHidden('c1', 'espanha', new Set(['Set']))).not.toThrow();
  });

  describe('visibleFields', () => {
    it('drops the hidden ones and keeps the declared order', () => {
      // Order comes from `fieldsFor`, never from the stored set — a redeclared
      // field keeps its ancestor's position, and the picker must not disturb it.
      expect(visibleFields(FIELDS, new Set(['Set'])).map(f => f.name)).toEqual([
        'Número',
        'Lançamento',
      ]);
    });

    it('shows a field nobody has an opinion about', () => {
      // Storing *hidden* names is what makes a field declared next week visible
      // by default. Storing the visible set would hide it from everyone who had
      // ever opened the picker.
      expect(visibleFields(FIELDS, new Set(['Gone'])).map(f => f.name)).toEqual([
        'Número',
        'Set',
        'Lançamento',
      ]);
    });
  });

  describe('toggleHidden', () => {
    it('adds on hide and removes on show', () => {
      expect(toggleHidden(new Set(), 'Set', false)).toEqual(new Set(['Set']));
      expect(toggleHidden(new Set(['Set']), 'Set', true)).toEqual(new Set());
    });

    it('never mutates the set it was given', () => {
      const before = new Set(['Set']);
      toggleHidden(before, 'Número', false);
      expect(before).toEqual(new Set(['Set']));
    });
  });
});
