import { CanDeactivateFn } from '@angular/router';

/**
 * What the guard needs of the component, stated as a shape rather than as an
 * import — for the same reason `unsavedItemGuard` does it: `app.routes.ts`
 * builds the route table at module load, so a guard that imported
 * `CollectionSettingsPage` would drag the whole settings page, its three tabs,
 * its dialogs and its pipes into the initial bundle and quietly undo
 * `loadComponent`.
 */
interface HasUnsavedCheck {
  confirmLeave(): boolean | Promise<boolean>;
}

/**
 * Refuses to leave the collection settings page while it holds edits that are
 * known not to be saved.
 *
 * This page autosaves, so for most of its life there is nothing to guard: the
 * worst case is the debounce window, and `confirmLeave` simply flushes it. What
 * changed is the `.moved-on` banner — when the document moves under the draft,
 * autosave is **disarmed on purpose**, and from that moment the page holds work
 * that nothing is going to write. Clicking a collection in the sidebar
 * destroyed all of it with no question, no toast and no undo, on a page one
 * click from anywhere.
 *
 * The question is asked only when there is genuinely something to lose. A guard
 * that asks on every exit is a guard people learn to click through, which is
 * worse than not having one — so a clean page leaves silently and a pending
 * debounce is saved rather than queried.
 *
 * The answer may be a `Promise<boolean>`: `CanDeactivateFn` returns
 * `MaybeAsync<GuardResult>`, so the page can flush its save and then put a real
 * `ui-dialog` in front of the user, whose buttons say what they do.
 */
export const unsavedCollectionGuard: CanDeactivateFn<HasUnsavedCheck> = component =>
  component.confirmLeave();
