import { Params } from '@angular/router';

import { CONDITIONS, Condition, GroupSort } from '../../core/models';
import { BrowseCriteria, OwnFilter } from '../../core/utils/browse.util';
import { BUILTIN_SORTS, customFieldName } from '../../core/utils/sort.util';

/**
 * The browse criteria as URL query params, and back.
 *
 * Which items are on screen and in what order is URL state (rule 9): `?g=` was
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
  cond?: string;
  own?: string;
  sort?: string;
  dir?: string;
}

export function readCondition(raw: string | undefined): Condition | null {
  return CONDITIONS.find(c => c === raw) ?? null;
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
 * outliving it. Every link that changes `?g=` goes through this, so the rule
 * lives in one place instead of in each of the tree, the cards and the
 * breadcrumb.
 */
export function groupLinkParams(groupId: string | null): Params {
  return { g: groupId, ...sortParams(null) };
}

/** The criteria a screen is browsing under, read straight off the URL. */
export function readCriteria(
  values: BrowseParamValues,
  groupId: string | null,
  query: string,
): BrowseCriteria {
  return {
    groupId,
    condition: readCondition(values.cond),
    own: readOwn(values.own),
    query,
    sort: readSort(values.sort, values.dir),
  };
}
