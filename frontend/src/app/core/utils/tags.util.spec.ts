import { describe, expect, it } from 'vitest';

import { Item } from '../models';
import {
  WANTED_TAG,
  editableTags,
  isReservedTag,
  normalizeTag,
  tagsInUse,
  withTagAdded,
  withTagRemoved,
} from './tags.util';

function item(id: string, tags: string[]): Item {
  return {
    id,
    name: id,
    description: '',
    year: 1990,
    value: 0,
    groupId: '',
    sectionId: '',
    tags,
    img: `${id}.jpg`,
    custom: [],
    copies: [],
    photoIds: [],
  };
}

describe('tags.util', () => {
  it('trims but never rewrites the case somebody chose', () => {
    // A tag is user data. Lower-casing `Sealed` on the way in is the kind of
    // silent normalisation that makes a field feel broken.
    expect(normalizeTag('  Sealed  ')).toBe('Sealed');
    expect(normalizeTag('CIB')).toBe('CIB');
  });

  it('treats the wanted tag as the app’s, however it is typed', () => {
    expect(isReservedTag(WANTED_TAG)).toBe(true);
    expect(isReservedTag('Wanted')).toBe(true);
    expect(isReservedTag('  WANTED ')).toBe(true);
    expect(isReservedTag('wanted-badly')).toBe(false);
  });

  it('hides the derived tag from the editable set', () => {
    expect(editableTags(['boxed', 'wanted', 'cib'])).toEqual(['boxed', 'cib']);
  });

  it('refuses to add the reserved tag, in any casing', () => {
    const tags = ['boxed'];
    expect(withTagAdded(tags, 'wanted')).toBe(tags);
    expect(withTagAdded(tags, 'Wanted')).toBe(tags);
  });

  it('refuses to remove the reserved tag', () => {
    // It is derived from the copies, so a removal would be undone on save —
    // and a control whose effect is silently reverted is worse than no control.
    const tags = ['boxed', 'wanted'];
    expect(withTagRemoved(tags, 'wanted')).toBe(tags);
    expect(withTagRemoved(tags, 'WANTED')).toBe(tags);
  });

  it('will not hold the same tag twice in two casings', () => {
    // Two chips meaning one thing, and a filter by tag that would give two
    // different answers for it.
    const tags = withTagAdded(['Boxed'], 'boxed');
    expect(tags).toEqual(['Boxed']);
  });

  it('returns the identical array when nothing would change', () => {
    // The no-op signal: it is how a caller tells "added" from "already there",
    // and how a bulk apply avoids burning a version on a write that does nothing.
    const tags = ['boxed'];
    expect(withTagAdded(tags, 'boxed')).toBe(tags);
    expect(withTagAdded(tags, '   ')).toBe(tags);
    expect(withTagRemoved(tags, 'nope')).toBe(tags);
  });

  it('adds and removes ignoring case, keeping the stored spelling', () => {
    expect(withTagAdded(['boxed'], ' CIB ')).toEqual(['boxed', 'CIB']);
    expect(withTagRemoved(['boxed', 'CIB'], 'cib')).toEqual(['boxed']);
  });

  it('collects the vocabulary already in use, deduped and sorted', () => {
    const items = [
      item('a', ['Boxed', 'wanted']),
      item('b', ['boxed', 'CIB']),
      item('c', ['sealed', '  ']),
    ];

    // First spelling wins, the derived tag never appears, and blanks are not
    // tags. Sorted case-insensitively so it reads like every other name list.
    expect(tagsInUse(items)).toEqual(['Boxed', 'CIB', 'sealed']);
  });
});
