import { Collection, GroupNode, Item } from '../models';
import { canReparent, childrenOf, groupById, subtreeIds } from './groups.util';

/**
 * What happens to a group's contents when the group goes.
 *
 * Deleting a branch used to be refused outright the moment any item existed
 * anywhere under it ("move them first"), which was safe and also a dead end:
 * nothing in the app moved items in bulk, so the instruction could not be
 * followed. Meanwhile an *empty* sub-tree was deleted silently, unconfirmed and
 * with no count shown — the genuinely dangerous half. So the refusal became a
 * question, and this file is the arithmetic behind it.
 *
 * The counts the dialog renders and the graph the page applies come out of the
 * same call, on purpose: two functions would eventually disagree, and the one
 * moment that must never happen is the one where a user reads "12 items" and
 * presses a button that deletes fourteen.
 */
export type GroupDisposition =
  /**
   * Nothing is lost: sub-groups are refiled under the deleted group's own
   * parent (or the root), and items filed directly on it move to that parent
   * (or become unfiled). Offered first for that reason.
   */
  | 'reparent'
  /** Sub-groups go; every item in the subtree becomes unfiled (`groupId: ''`). */
  | 'unfile'
  /** Sub-groups go and so do their items. The only irreversible one. */
  | 'delete';

export interface GroupDeletePlan {
  /** The group ids this disposition removes. */
  groupIds: string[];
  /**
   * Names of the sub-groups under the group, alphabetically — the survey the
   * dialog reads out. Independent of the disposition: it is what is at stake,
   * not what is destroyed.
   */
  subGroupNames: string[];
  /** Items anywhere in the subtree. Also disposition-independent. */
  itemCount: number;
  /** Items filed directly on the group itself, which is what moves up. */
  directItemCount: number;
  /** Sections this disposition removes, because their group goes. */
  sectionCount: number;
  /** The three lists to hand to a single `mutate()`, and so a single PUT. */
  result: Pick<Collection, 'groups' | 'sections' | 'items'>;
}

/**
 * Both halves of deleting `groupId`: the numbers to show, and the graph to save.
 *
 * A group that does not exist yields an empty plan whose result is the
 * collection unchanged, so a stale dialog can never delete something else.
 *
 * In **every** disposition the sections of every removed group go with it and
 * any surviving item pointing at one of them has its `sectionId` cleared. That
 * is the same rule `removeSection` already applies deliberately — a stored
 * reference to something deleted reads as "no section" either way, but it rides
 * every PUT from then on and would come back to life the day an id repeated.
 * Applying it here is what stops the two paths from disagreeing.
 *
 * Nothing here touches an item's or a section's *own* id, and a section keeps
 * pointing at the group it always pointed at. A move is a change of parent, not
 * of identity — which is why the reparenting cases need no migration of
 * sections or items at all.
 */
export function groupDeletePlan(
  collection: Pick<Collection, 'groups' | 'sections' | 'items'>,
  groupId: string,
  disposition: GroupDisposition,
): GroupDeletePlan {
  const { groups, sections, items } = collection;
  const node = groupById(groups, groupId);
  if (!node) {
    return {
      groupIds: [],
      subGroupNames: [],
      itemCount: 0,
      directItemCount: 0,
      sectionCount: 0,
      result: { groups, sections, items },
    };
  }

  const subtree = subtreeIds(groups, groupId);
  const inSubtree = new Set(subtree);
  const survey = {
    subGroupNames: descendantNames(groups, groupId),
    itemCount: items.filter(item => inSubtree.has(item.groupId)).length,
    directItemCount: items.filter(item => item.groupId === groupId).length,
  };

  // Only the group itself when its contents are being kept; the whole branch
  // otherwise. Everything below follows from this one set.
  const removedGroups = new Set(disposition === 'reparent' ? [groupId] : subtree);
  const nextGroups = reparentedGroups(groups, groupId, node.parentId, removedGroups, disposition);
  const removedSections = new Set(
    sections.filter(section => removedGroups.has(section.groupId)).map(section => section.id),
  );
  const nextSections = sections.filter(section => !removedSections.has(section.id));
  const nextItems = movedItems(items, {
    disposition,
    groupId,
    parentId: node.parentId,
    removedGroups,
    removedSections,
  });

  return {
    groupIds: [...removedGroups],
    ...survey,
    sectionCount: removedSections.size,
    result: { groups: nextGroups, sections: nextSections, items: nextItems },
  };
}

/** Every descendant's name, alphabetically, depth-first — the display order. */
function descendantNames(groups: GroupNode[], groupId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([groupId]);
  const walk = (parentId: string) => {
    for (const child of childrenOf(groups, parentId)) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      out.push(child.name);
      walk(child.id);
    }
  };
  walk(groupId);
  return out;
}

function reparentedGroups(
  groups: GroupNode[],
  groupId: string,
  parentId: string | null,
  removedGroups: ReadonlySet<string>,
  disposition: GroupDisposition,
): GroupNode[] {
  const kept = groups.filter(group => !removedGroups.has(group.id));
  if (disposition !== 'reparent') return kept;
  // The children of the group that just went now hang off its parent. It cannot
  // create a cycle — the new parent is an ancestor of the old one — but it goes
  // through the same guard the parent picker uses, so there is exactly one
  // answer in the app to "may this group live here?".
  return kept.map(group =>
    group.parentId === groupId && canReparent(groups, group.id, parentId)
      ? { ...group, parentId }
      : group,
  );
}

function movedItems(
  items: Item[],
  ctx: {
    disposition: GroupDisposition;
    groupId: string;
    parentId: string | null;
    removedGroups: ReadonlySet<string>;
    removedSections: ReadonlySet<string>;
  },
): Item[] {
  const { disposition, groupId, parentId, removedGroups, removedSections } = ctx;
  const kept =
    disposition === 'delete' ? items.filter(item => !removedGroups.has(item.groupId)) : items;

  return kept.map(item => {
    // `''`, never UNGROUPED_ID: the unfiled bucket's sentinel is a key to read
    // by, and storing it would put a group id no group answers to on the item.
    const groupIdNext =
      disposition === 'unfile' && removedGroups.has(item.groupId)
        ? ''
        : disposition === 'reparent' && item.groupId === groupId
          ? (parentId ?? '')
          : item.groupId;
    const sectionIdNext = removedSections.has(item.sectionId) ? '' : item.sectionId;
    return groupIdNext === item.groupId && sectionIdNext === item.sectionId
      ? item
      : { ...item, groupId: groupIdNext, sectionId: sectionIdNext };
  });
}
