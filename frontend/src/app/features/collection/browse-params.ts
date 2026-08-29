import { Params } from '@angular/router';

import { CONDITIONS, Condition, GroupSort, Section, SortDirection } from '../../core/models';
import { BrowseCriteria, OwnFilter } from '../../core/utils/browse.util';
import { UNSECTIONED_ID, sectionsOf } from '../../core/utils/sections.util';
import { BUILTIN_SORTS, customFieldName } from '../../core/utils/sort.util';

/**
 * The browse criteria as URL query params, and back.
 *
 * Which items are on screen and in what order is URL state (rule 11): `?g=` was
 * always there, and `?cond=`, `?own=`, `?sort=` and `?dir=` join it so that
 * opening an item can rebuild the very same list — the arrows on the item page
 * are only honest if "next" means the next of the list you were looking at.
 * Coming back from an item now also restores the filters instead of clearing
 * them, and a shared link reproduces the list rather than something like it.
 *
 * Everything here is defensive: a query string is user input, and a `cond` of
 * `Bananas` or a `sort` naming a field nobody declared has to read as "no
 * filter" rather than filter everything out.
 */

/** `?sort=` splits from `?dir=` so a `field:` key can hold any character. */
export interface BrowseParamValues {
  s?: string;
  cond?: string;
  own?: string;
  sort?: string;
  dir?: string;
}

export function readCondition(raw: string | undefined): Condition | null {
  return CONDITIONS.find(c => c === raw) ?? null;
}

/**
 * `?s=` narrowed to a divider of the group actually open, the leftovers bucket,
 * or null for "all of them".
 *
 * Checked against the group, unlike `?sort=`: a section belongs to exactly one
 * group, so an id from a group you have since left does not fade quietly the
 * way a renamed sort field does — it would hide every item on screen. The
 * bucket sentinel needs no group of its own, since "no section" is meaningful
 * wherever sections are.
 */
export function readSection(
  raw: string | undefined,
  sections: Section[],
  groupId: string | null,
): string | null {
  if (!raw) return null;
  if (raw === UNSECTIONED_ID) return raw;
  return sectionsOf(sections, groupId).some(section => section.id === raw) ? raw : null;
}

export function sectionParams(sectionId: string | null): Params {
  return { s: sectionId };
}

export function readOwn(raw: string | undefined): OwnFilter {
  return raw === 'owned' || raw === 'wanted' ? raw : null;
}

/**
 * Null when nothing valid was asked for, which leaves the group's own declared
 * order in charge. A `by` is either a built-in key or `field:<name>`; the name
 * is not checked against the group's fields because `sortItems` already treats
 * an unknown field as "no value" — and a param outliving a renamed field should
 * fade, not throw.
 */
export function readSort(by: string | undefined, dir: string | undefined): GroupSort | null {
  if (!by) return null;
  const known = (BUILTIN_SORTS as readonly string[]).includes(by) || customFieldName(by) !== null;
  if (!known) return null;
  return { by, direction: dir === 'desc' ? 'desc' : 'asc' };
}

/** The params that carry a sort, or the nulls that clear one. */
export function sortParams(sort: GroupSort | null): Params {
  return sort ? { sort: sort.by, dir: sort.direction } : { sort: null, dir: null };
}

/**
 * Which direction a key opens in when it is picked fresh.
 *
 * Money reads highest-first — the question a value column answers is "what is
 * the expensive one" — and everything else reads lowest-first, which for a name
 * is A–Z and for a year or a catalogue number is the order the set was issued
 * in. `added` is the one built-in that is not a column header, and it keeps the
 * newest-first sense `DEFAULT_SORT` already gives it.
 */
function openingDirection(by: string): SortDirection {
  return by === 'value' || by === 'added' ? 'desc' : 'asc';
}

/**
 * The sort a click on a column header asks for.
 *
 * `effective` is the order the list is *actually* in — the URL override, or the
 * group's own declared order, or the default. Comparing against that rather
 * than against the override alone is what makes the first click on the column a
 * group already sorts by *reverse* it, instead of appearing to do nothing.
 *
 * Always returns a sort rather than ever returning null: a header is a direct
 * manipulation of the order, and "click the column you are sorted by to fall
 * back to the group's default" is not a gesture anyone would guess.
 */
export function nextSortFor(effective: GroupSort, by: string): GroupSort {
  if (effective.by !== by) return { by, direction: openingDirection(by) };
  return { by, direction: effective.direction === 'asc' ? 'desc' : 'asc' };
}

export function conditionParams(condition: Condition | null): Params {
  return { cond: condition };
}

export function ownParams(own: OwnFilter): Params {
  return { own };
}

/**
 * Query params for a link that opens a group.
 *
 * Merging is what keeps the item filters and the chosen view across a group
 * change, but the sort is deliberately dropped: every group declares its own
 * order, and a one-off pick made while browsing one group has no business
 * outliving it. The section goes with it, and for a stronger reason — a section
 * belongs to one group, so carrying `?s=` into another would name a divider
 * that group does not have and empty the screen. Every link that changes `?g=`
 * goes through this, so the rule lives in one place instead of in each of the
 * tree, the cards and the breadcrumb.
 */
export function groupLinkParams(groupId: string | null): Params {
  return { g: groupId, ...sortParams(null), ...sectionParams(null) };
}

/** The criteria a screen is browsing under, read straight off the URL. */
export function readCriteria(
  values: BrowseParamValues,
  groupId: string | null,
  query: string,
  sections: Section[] = [],
): BrowseCriteria {
  return {
    groupId,
    sectionId: readSection(values.s, sections, groupId),
    condition: readCondition(values.cond),
    own: readOwn(values.own),
    query,
    sort: readSort(values.sort, values.dir),
  };
}
