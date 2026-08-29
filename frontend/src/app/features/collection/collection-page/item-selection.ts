/**
 * Which rows a bulk action applies to.
 *
 * ## Why this is not URL state
 *
 * Everything else the collection page shows is in the query string (rule 11),
 * and selection deliberately is not. Three reasons, and the third is the one
 * that decides it:
 *
 * 1. Forty ids in a query string is hostile — it is longer than the rest of the
 *    URL put together and nothing about it is readable.
 * 2. Every filter and order change navigates with `replaceUrl`, and each of
 *    those navigations would have to carry the set forward or silently drop it.
 * 3. A shared link is the problem. `?sel=` means a link can arrive with forty
 *    rows already ticked in front of a bar whose right-hand button deletes
 *    them. Selection is a gesture inside one session, not a description of what
 *    you are looking at, and the test rule 11 poses — "would the user want this
 *    restored from a shared link?" — answers no for exactly that reason.
 *
 * So it is a signal on `CollectionPage`. It survives filter changes because a
 * query-param navigation does not recreate the component, and it is cleared by
 * an effect when the collection id changes.
 *
 * ## Why the set is not pruned
 *
 * Stored ids are never removed when a filter hides them; instead every reader
 * intersects the set with what is visible (`selectedIn`). Narrowing to "Mint",
 * acting, and widening again therefore does not destroy the rest of the
 * selection — and, far more importantly, **no action can ever touch a row the
 * user cannot see**, because the intersection is the only list any of them get.
 *
 * Pure and page-local, like `drag-order.ts`: testable without a TestBed.
 */

/** The stored selection. `anchor` is where a shift-range measures from. */
export interface SelectionState {
  ids: ReadonlySet<string>;
  /**
   * The last row toggled on its own, as an id rather than an index. Indices
   * shift the moment a filter or an order changes; an id survives it, and a
   * range whose anchor has since been filtered out simply degrades to a single
   * toggle.
   */
  anchor: string | null;
}

export const EMPTY_SELECTION: SelectionState = { ids: new Set<string>(), anchor: null };

/**
 * The selected ids that are actually on screen, in the order the screen shows
 * them. This is what the bar counts and what every action operates on.
 */
export function selectedIn(
  state: SelectionState,
  visibleIds: readonly string[],
): string[] {
  return visibleIds.filter(id => state.ids.has(id));
}

/** Nothing visible is selected. */
export function noneSelected(state: SelectionState, visibleIds: readonly string[]): boolean {
  return !visibleIds.some(id => state.ids.has(id));
}

/** Every visible row is selected — and there is at least one. */
export function allSelected(state: SelectionState, visibleIds: readonly string[]): boolean {
  return visibleIds.length > 0 && visibleIds.every(id => state.ids.has(id));
}

/**
 * Some but not all: the state a tri-state header sits in. Reported separately
 * from `allSelected` because the platform's `indeterminate` is a third visual,
 * not a variation of "checked".
 */
export function someSelected(state: SelectionState, visibleIds: readonly string[]): boolean {
  return !noneSelected(state, visibleIds) && !allSelected(state, visibleIds);
}

/** Adds or removes one row, and moves the anchor there. */
export function toggle(state: SelectionState, id: string, checked: boolean): SelectionState {
  const ids = new Set(state.ids);
  if (checked) ids.add(id);
  else ids.delete(id);
  return { ids, anchor: id };
}

/**
 * A shift-click: applies `checked` to every row between the anchor and `id`,
 * inclusive, in the visible list.
 *
 * Keyed on position in `visibleIds` — the flat, already-ordered list whose
 * indices `SectionEntry.index` carries — so a range that crosses a section
 * heading is well defined: it is the run of rows the reader can see between the
 * two, which is the only thing they could have meant.
 *
 * With no anchor, or an anchor no longer visible, this is just a toggle. The
 * anchor deliberately does **not** move: dragging a range out and then back is
 * one gesture, and moving the anchor to its far end would make the second half
 * of it measure from the wrong place.
 */
export function extendTo(
  state: SelectionState,
  visibleIds: readonly string[],
  id: string,
  checked: boolean,
): SelectionState {
  const anchor = state.anchor;
  const from = anchor === null ? -1 : visibleIds.indexOf(anchor);
  const to = visibleIds.indexOf(id);
  if (from < 0 || to < 0) return toggle(state, id, checked);

  const ids = new Set(state.ids);
  for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
    if (checked) ids.add(visibleIds[i]);
    else ids.delete(visibleIds[i]);
  }
  return { ids, anchor };
}

/**
 * The header checkbox: selects or deselects exactly the visible rows.
 *
 * Deselecting removes only what is on screen, leaving anything a filter hid
 * alone — the same asymmetry `selectedIn` rests on. "Clear" is the affordance
 * for throwing the whole thing away.
 */
export function setAll(
  state: SelectionState,
  visibleIds: readonly string[],
  checked: boolean,
): SelectionState {
  const ids = new Set(state.ids);
  for (const id of visibleIds) {
    if (checked) ids.add(id);
    else ids.delete(id);
  }
  return { ids, anchor: null };
}
