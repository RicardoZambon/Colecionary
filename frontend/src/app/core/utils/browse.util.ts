import { Condition, GroupNode, GroupSort, Item, Section } from '../models';
import { isOwned } from './copies.util';
import { UNGROUPED_ID } from './group-stats.util';
import { fieldsFor, sortFor, subtreeIds } from './groups.util';
import { UNSECTIONED_ID, sectionRank } from './sections.util';
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
 * it lives in the URL (`?g=`, `?s=`, `?cond=`, `?own=`, `?sort=`/`?dir=`) except the
 * search, which is global to the app — so an open item can rebuild the exact
 * list the grid showed without the grid handing it anything.
 */
export interface BrowseCriteria {
  /** `?g=` — a group id, {@link UNGROUPED_ID}, or null for the whole collection. */
  groupId: string | null;
  /**
   * `?s=` — narrows to one divider of the open group, or {@link UNSECTIONED_ID}
   * for the leftovers. Null is "all of them", which is the normal case: a
   * section is a heading you read past, not a place you go, so this is a filter
   * alongside `condition` and `own` rather than a second kind of scope.
   */
  sectionId: string | null;
  condition: Condition | null;
  own: OwnFilter;
  /** The global search box. Blank means no search. */
  query: string;
  /** An explicit pick. Null falls back to the group's own declared order. */
  sort: GroupSort | null;
}

export const NO_FILTERS: Omit<BrowseCriteria, 'groupId'> = {
  sectionId: null,
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

/**
 * The list a screen shows: scoped, filtered, then ordered.
 *
 * `sections` is the whole collection's; only the open group's apply, and
 * `sectionRank` is what decides that — an item pointing at another group's
 * section, or at one deleted since, ranks as unsectioned instead of being an
 * error. At the collection root and in the unfiled bucket no group is open, so
 * no section applies and the list behaves exactly as it did before sections
 * existed.
 */
export function visibleItems(
  items: Item[],
  groups: GroupNode[],
  criteria: BrowseCriteria,
  sections: Section[] = [],
): Item[] {
  const query = criteria.query.trim().toLowerCase();
  const rank = sectionRank(sections, criteria.groupId);

  const filtered = scopeItems(items, groups, criteria.groupId).filter(
    item =>
      // An item matches a condition when any of its copies is in it.
      (!criteria.condition || item.copies.some(c => c.condition === criteria.condition)) &&
      (!criteria.own || (criteria.own === 'owned' ? isOwned(item) : !isOwned(item))) &&
      (!criteria.sectionId || inSection(item, criteria.sectionId, rank)) &&
      matchesQuery(item, query),
  );

  const sort = criteria.sort ?? sortFor(groups, criteria.groupId) ?? DEFAULT_SORT;
  return sortItems(filtered, sort, fieldsFor(groups, criteria.groupId), rank);
}

/**
 * Whether an item answers a search.
 *
 * Name, description, tags and every custom field value. Restricting this to the
 * name was the wrong default for the app's most frequent lookup: a cataloguer
 * types a catalogue number, and a catalogue number is precisely a custom
 * field — the one place the old search could not see. Description and tags come
 * along because they are the other two things already typed about an item, and
 * a search that finds fewer things than the data holds reads as broken rather
 * than as precise.
 *
 * Field *names* are not searched, only their values. A group that declares
 * "Número" would otherwise make every one of its items match "num".
 *
 * `query` must already be trimmed and lower-cased — this runs once per item per
 * keystroke, and folding the needle here instead of at the call site would fold
 * it once per item too.
 */
export function matchesQuery(item: Item, query: string): boolean {
  if (!query) return true;
  return (
    item.name.toLowerCase().includes(query) ||
    item.description.toLowerCase().includes(query) ||
    item.tags.some(tag => tag.toLowerCase().includes(query)) ||
    item.custom.some(field => field.value.toLowerCase().includes(query))
  );
}

/**
 * Whether an item belongs to the section being filtered on. Membership goes
 * through the rank map rather than comparing ids, so "this section" and "the
 * leftovers" agree with what the headings show: an item whose `sectionId`
 * names a section of some other group is unsectioned on this screen, and has
 * to answer the {@link UNSECTIONED_ID} filter rather than its own stale id.
 */
function inSection(item: Item, sectionId: string, rank: ReadonlyMap<string, number>): boolean {
  const applies = rank.has(item.sectionId);
  return sectionId === UNSECTIONED_ID ? !applies : applies && item.sectionId === sectionId;
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
