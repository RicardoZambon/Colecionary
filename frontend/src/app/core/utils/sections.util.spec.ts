import { describe, expect, it } from 'vitest';

import { Item, Section } from '../models';
import {
  UNSECTIONED_ID,
  chunkBySection,
  resolveSectionId,
  sectionRank,
  sectionsOf,
} from './sections.util';

function section(id: string, groupId: string, name = id, target: number | null = null): Section {
  return { id, groupId, name, target };
}

function item(id: string, groupId: string, sectionId = ''): Item {
  return {
    id,
    name: id,
    description: '',
    year: 2000,
    value: 10,
    groupId,
    sectionId,
    tags: [],
    img: '',
    custom: [],
    copies: [],
    photoIds: [],
  };
}

// The case sections exist for: a rank order the alphabet gets wrong.
const SECTIONS = [
  section('bronze', 'espanha', 'Cavaleiros de Bronze'),
  section('prata', 'espanha', 'Cavaleiros de Prata'),
  section('ouro', 'espanha', 'Cavaleiros de Ouro'),
  section('outros', 'brasil', 'Outros'),
];

describe('sections.util', () => {
  describe('sectionsOf', () => {
    it('keeps the arranged order rather than sorting by name', () => {
      // Alphabetically this would read Bronze, Ouro, Prata — which is the whole
      // reason a divider persists a position and a group does not.
      expect(sectionsOf(SECTIONS, 'espanha').map(s => s.id)).toEqual([
        'bronze',
        'prata',
        'ouro',
      ]);
    });

    it('is empty at the collection root, where no single group is open', () => {
      expect(sectionsOf(SECTIONS, null)).toEqual([]);
    });
  });

  describe('resolveSectionId', () => {
    it('narrows a remembered id to one this group actually has', () => {
      expect(resolveSectionId(SECTIONS, 'espanha', 'prata')).toBe('prata');
    });

    it('collapses blank, the bucket sentinel and a foreign section to ""', () => {
      expect(resolveSectionId(SECTIONS, 'espanha', '')).toBe('');
      expect(resolveSectionId(SECTIONS, 'espanha', UNSECTIONED_ID)).toBe('');
      // Belongs to another group — legal to store, meaningless here.
      expect(resolveSectionId(SECTIONS, 'espanha', 'outros')).toBe('');
      expect(resolveSectionId(SECTIONS, 'espanha', 'deleted')).toBe('');
    });
  });

  describe('sectionRank', () => {
    it('ranks only the open group, so a foreign reference reads as unsectioned', () => {
      const rank = sectionRank(SECTIONS, 'espanha');
      expect(rank.get('bronze')).toBe(0);
      expect(rank.get('ouro')).toBe(2);
      expect(rank.has('outros')).toBe(false);
    });
  });

  describe('chunkBySection', () => {
    it('renders a group with no dividers as one unnamed run', () => {
      const items = [item('a', 'espanha'), item('b', 'espanha')];
      const chunks = chunkBySection(items, []);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].section).toBeNull();
      expect(chunks[0].entries.map(e => e.item.id)).toEqual(['a', 'b']);
    });

    it('cuts an ordered list into runs and puts the leftovers last', () => {
      const items = [
        item('seiya', 'espanha', 'bronze'),
        item('marin', 'espanha', 'prata'),
        item('aiolia', 'espanha', 'ouro'),
        item('loose', 'espanha'),
      ];

      const chunks = chunkBySection(items, sectionsOf(SECTIONS, 'espanha'));

      expect(chunks.map(c => c.id)).toEqual(['bronze', 'prata', 'ouro', UNSECTIONED_ID]);
      expect(chunks[3].section).toBeNull();
    });

    it('numbers entries by their place in the list, not in the chunk', () => {
      // Reordering, the move buttons and "is this the last row?" all work in
      // list coordinates; renumbering per chunk would make a drag move the
      // wrong item.
      const items = [
        item('a', 'espanha', 'bronze'),
        item('b', 'espanha', 'prata'),
        item('c', 'espanha', 'prata'),
      ];

      const chunks = chunkBySection(items, sectionsOf(SECTIONS, 'espanha'));

      expect(chunks[1].entries.map(e => e.index)).toEqual([1, 2]);
    });

    it('files an item pointing at another group\'s section under the leftovers', () => {
      const items = [item('stray', 'espanha', 'outros')];
      const chunks = chunkBySection(items, sectionsOf(SECTIONS, 'espanha'));

      expect(chunks.at(-1)!.id).toBe(UNSECTIONED_ID);
      expect(chunks.at(-1)!.entries.map(e => e.item.id)).toEqual(['stray']);
    });

    it('keeps an empty section visible unfiltered, and hides it under a filter', () => {
      // A section created a moment ago has no items yet. Invisible, it could
      // never be filled — but under a filter a wall of empty headings saying
      // nothing matched is noise.
      const items = [item('seiya', 'espanha', 'bronze')];
      const mine = sectionsOf(SECTIONS, 'espanha');

      expect(chunkBySection(items, mine).map(c => c.id)).toEqual(['bronze', 'prata', 'ouro']);
      expect(chunkBySection(items, mine, false).map(c => c.id)).toEqual(['bronze']);
    });
  });
});
