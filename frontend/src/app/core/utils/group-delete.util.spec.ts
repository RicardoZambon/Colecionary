import { describe, expect, it } from 'vitest';

import { Collection, GroupNode, Item, Section } from '../models';
import { UNGROUPED_ID } from './group-stats.util';
import { groupDeletePlan } from './group-delete.util';

const group = (id: string, parentId: string | null = null, name = id): GroupNode => ({
  id,
  name,
  parentId,
  fields: [],
  sort: null,
  target: null,
});

const item = (id: string, groupId: string, sectionId = ''): Item => ({
  id,
  name: id,
  description: '',
  year: 1997,
  value: 0,
  groupId,
  sectionId,
  tags: [],
  img: '',
  custom: [],
  copies: [],
  photoIds: [],
});

const section = (id: string, groupId: string): Section => ({
  id,
  groupId,
  name: id,
  target: null,
});

/**
 * Espanha ▸ (Bronze, Prata), plus an unrelated Brasil branch that must come out
 * of every plan untouched.
 */
function vault(): Pick<Collection, 'groups' | 'sections' | 'items'> {
  return {
    groups: [
      group('espanha'),
      group('bronze', 'espanha'),
      group('prata', 'espanha'),
      group('brasil'),
    ],
    sections: [
      section('sBronze', 'bronze'),
      section('sEspanha', 'espanha'),
      section('sBrasil', 'brasil'),
    ],
    items: [
      { ...item('seiya', 'bronze', 'sBronze') },
      { ...item('shiryu', 'prata') },
      { ...item('marin', 'espanha', 'sEspanha') },
      { ...item('shun', 'brasil', 'sBrasil') },
    ],
  };
}

describe('groupDeletePlan', () => {
  describe('the survey it reads out', () => {
    it('counts the whole subtree, not just what is filed directly on the group', () => {
      const plan = groupDeletePlan(vault(), 'espanha', 'reparent');
      expect(plan.subGroupNames).toEqual(['bronze', 'prata']);
      // seiya (bronze) + shiryu (prata) + marin (espanha) — never shun.
      expect(plan.itemCount).toBe(3);
      expect(plan.directItemCount).toBe(1);
    });

    it('reports the same survey whichever disposition is being weighed up', () => {
      const surveys = (['reparent', 'unfile', 'delete'] as const).map(d => {
        const { subGroupNames, itemCount, directItemCount } = groupDeletePlan(vault(), 'espanha', d);
        return { subGroupNames, itemCount, directItemCount };
      });
      expect(surveys[1]).toEqual(surveys[0]);
      expect(surveys[2]).toEqual(surveys[0]);
    });

    it('changes nothing for a group that no longer exists', () => {
      const before = vault();
      const plan = groupDeletePlan(before, 'gone', 'delete');
      expect(plan.groupIds).toEqual([]);
      expect(plan.result.groups).toEqual(before.groups);
      expect(plan.result.items).toEqual(before.items);
      expect(plan.result.sections).toEqual(before.sections);
    });
  });

  describe('moving the contents up to the parent', () => {
    it('refiles the sub-groups on the deleted group’s own parent', () => {
      const before = { ...vault(), groups: [...vault().groups, group('deep', 'bronze')] };
      const plan = groupDeletePlan(before, 'bronze', 'reparent');

      expect(plan.groupIds).toEqual(['bronze']);
      expect(plan.result.groups.map(g => `${g.id}:${g.parentId}`)).toEqual([
        'espanha:null',
        'prata:espanha',
        'brasil:null',
        // "deep" was under bronze; bronze's parent was espanha.
        'deep:espanha',
      ]);
    });

    it('moves the items filed on the group up, and leaves the deeper ones alone', () => {
      const plan = groupDeletePlan(vault(), 'espanha', 'reparent');
      const byId = new Map(plan.result.items.map(i => [i.id, i]));
      // espanha was a root, so "up" is no group at all — and that is '', never
      // the bucket sentinel.
      expect(byId.get('marin')!.groupId).toBe('');
      expect(byId.get('marin')!.groupId).not.toBe(UNGROUPED_ID);
      // The sub-groups travelled, so their items never moved.
      expect(byId.get('seiya')!.groupId).toBe('bronze');
      expect(byId.get('shiryu')!.groupId).toBe('prata');
    });

    it('keeps the surviving sub-groups’ sections and drops only the group’s own', () => {
      const plan = groupDeletePlan(vault(), 'espanha', 'reparent');
      expect(plan.sectionCount).toBe(1);
      expect(plan.result.sections.map(s => s.id)).toEqual(['sBronze', 'sBrasil']);
      // The item that pointed at the section that went is cleared, not left
      // dangling — the same rule `removeSection` applies.
      expect(plan.result.items.find(i => i.id === 'marin')!.sectionId).toBe('');
      expect(plan.result.items.find(i => i.id === 'seiya')!.sectionId).toBe('sBronze');
    });

    it('files a nested group’s contents on the real parent, not on the root', () => {
      const plan = groupDeletePlan(vault(), 'bronze', 'reparent');
      expect(plan.result.items.find(i => i.id === 'seiya')!.groupId).toBe('espanha');
    });
  });

  describe('unfiling the items', () => {
    it('deletes the whole branch and empties every groupId under it', () => {
      const plan = groupDeletePlan(vault(), 'espanha', 'unfile');

      expect([...plan.groupIds].sort()).toEqual(['bronze', 'espanha', 'prata']);
      expect(plan.result.groups.map(g => g.id)).toEqual(['brasil']);
      for (const id of ['seiya', 'shiryu', 'marin']) {
        const moved = plan.result.items.find(i => i.id === id)!;
        expect(moved.groupId).toBe('');
        expect(moved.groupId).not.toBe(UNGROUPED_ID);
        expect(moved.sectionId).toBe('');
      }
    });

    it('keeps every item, so nothing is destroyed by choosing this', () => {
      const plan = groupDeletePlan(vault(), 'espanha', 'unfile');
      expect(plan.result.items.map(i => i.id)).toEqual(['seiya', 'shiryu', 'marin', 'shun']);
    });

    it('takes the sections of every deleted group, and only those', () => {
      const plan = groupDeletePlan(vault(), 'espanha', 'unfile');
      expect(plan.sectionCount).toBe(2);
      expect(plan.result.sections.map(s => s.id)).toEqual(['sBrasil']);
      expect(plan.result.items.find(i => i.id === 'shun')!.sectionId).toBe('sBrasil');
    });
  });

  describe('deleting the items too', () => {
    it('removes the branch, its sections and every item in it', () => {
      const plan = groupDeletePlan(vault(), 'espanha', 'delete');

      expect(plan.result.groups.map(g => g.id)).toEqual(['brasil']);
      expect(plan.result.sections.map(s => s.id)).toEqual(['sBrasil']);
      expect(plan.result.items.map(i => i.id)).toEqual(['shun']);
      // What the confirm button promises to destroy is what the plan destroys.
      expect(plan.itemCount).toBe(3);
    });

    it('leaves an unrelated branch entirely alone', () => {
      const before = vault();
      const plan = groupDeletePlan(before, 'espanha', 'delete');
      expect(plan.result.items.find(i => i.id === 'shun')).toEqual(
        before.items.find(i => i.id === 'shun'),
      );
    });
  });

  it('never mutates the collection it was handed', () => {
    const before = vault();
    const snapshot = structuredClone(before);
    for (const d of ['reparent', 'unfile', 'delete'] as const) {
      groupDeletePlan(before, 'espanha', d);
    }
    expect(before).toEqual(snapshot);
  });

  it('terminates on a cyclic branch instead of hanging', () => {
    // parentId carries no foreign key, so a group inside its own subtree is
    // representable — and a dialog that hangs is worse than one that is wrong.
    const cyclic = {
      groups: [group('a', 'b'), group('b', 'a')],
      sections: [],
      items: [item('x', 'a')],
    };
    const plan = groupDeletePlan(cyclic, 'a', 'delete');
    expect([...plan.groupIds].sort()).toEqual(['a', 'b']);
    expect(plan.result.items).toEqual([]);
  });
});
