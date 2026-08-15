import { Condition, GroupNode, GroupSort, Item } from '../models';
import { isOwned } from './copies.util';
import { UNGROUPED_ID } from './group-stats.util';
import { fieldsFor, sortFor, subtreeIds } from './groups.util';
import { DEFAULT_SORT, sortItems } from './sort.util';

/**
 * Which items a screen is looking at, and who sits either side of one.
 *
 * The grid and an open item have to agree on this to the letter: the whole
 * point of the arrows on the item page is that "next" is the next of *the list
 * you were just looking at*. Two screens deriving that from the same criteria
 * through the same function can't drift; two screens each filtering inline
 * would, the first time a filter changed. This is the same bargain
 * `sort.util.ts` makes for comparison and `group-stats.util.ts` for counting.
 */

/** Narrows to what you own or only want. Null is "both". */
export type OwnFilter = 'owned' | 'wanted' | null;

/**
 * Everything that decides which items are on screen, and in what order. All of
 * it lives in the URL (`?g=`, `?cond=`, `?own=`, `?sort=`/`?dir=`) except the
 * search, which is global to the app — so an open item can rebuild the exact
 * list the grid showed without the grid handing it anything.
 */
export interface BrowseCriteria {
  /** `?g=` — a group id, {@link UNGROUPED_ID}, or null for the whole collection. */
  groupId: string | null;
  condition: Condition | null;
  own: OwnFilter;
  /** The global search box. Blank means no search. */
  query: string;
  /** An explicit pick. Null falls back to the group's own declared order. */
  sort: GroupSort | null;
}

export const NO_FILTERS: Omit<BrowseCriteria, 'groupId'> = {
  condition: null,
  own: null,
  query: '',
  sort: null,
};

/**
 * The items in scope, before the item-level filters narrow them: a group's
 * whole subtree, the unfiled bucket, or everything at the collection root.
 */
export function scopeItems(items: Item[], groups: GroupNode[], groupId: string | null): Item[] {
  if (!groupId) return items;
  if (groupId === UNGROUPED_ID) {
    const known = new Set(groups.map(group => group.id));
    return items.filter(item => !known.has(item.groupId));
  }
  const subtree = new Set(subtreeIds(groups, groupId));
  return items.filter(item => subtree.has(item.groupId));
}

/** The list a screen shows: scoped, filtered, then ordered. */
export function visibleItems(
  items: Item[],
  groups: GroupNode[],
  criteria: BrowseCriteria,
): Item[] {
  const query = criteria.query.trim().toLowerCase();

  const filtered = scopeItems(items, groups, criteria.groupId).filter(
    item =>
      // An item matches a condition when any of its copies is in it.
      (!criteria.condition || item.copies.some(c => c.condition === criteria.condition)) &&
      (!criteria.own || (criteria.own === 'owned' ? isOwned(item) : !isOwned(item))) &&
      (!query || item.name.toLowerCase().includes(query)),
  );

  const sort = criteria.sort ?? sortFor(groups, criteria.groupId) ?? DEFAULT_SORT;
  return sortItems(filtered, sort, fieldsFor(groups, criteria.groupId));
}

/** Where an item sits in a list and what it can step to. */
export interface Neighbours {
  previous: Item | null;
  next: Item | null;
  /** 1-based, for display. Zero when the item is not in this list at all. */
  position: number;
  total: number;
}

/**
 * An item's neighbours in an already-ordered list.
 *
 * A `position` of zero says the item is not in the list — a deep link, or a
 * filter that excludes the very item you have open. That is not an error, it
 * just means no honest position can be shown, and the caller decides what to
 * step through instead.
 */
export function neighbours(list: Item[], itemId: string): Neighbours {
  const index = list.findIndex(item => item.id === itemId);
  if (index < 0) return { previous: null, next: null, position: 0, total: list.length };
  return {
    previous: list[index - 1] ?? null,
    next: list[index + 1] ?? null,
    position: index + 1,
    total: list.length,
  };
}
