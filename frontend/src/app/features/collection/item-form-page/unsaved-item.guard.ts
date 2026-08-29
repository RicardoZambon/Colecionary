import { CanDeactivateFn } from '@angular/router';

/**
 * What the guard needs of the component, stated as a shape rather than as an
 * import.
 *
 * `app.routes.ts` has to reference the guard eagerly — the route table is built
 * at module load — so a guard that imported `ItemFormPage` would drag the whole
 * item form, its photo manager and its pipes into the initial bundle and quietly
 * undo `loadComponent`. A structural type costs nothing at runtime.
 */
interface HasUnsavedCheck {
  canLeave(): boolean;
}

/**
 * Refuses to leave the item form while it holds unsaved edits.
 *
 * The form is the only copy of what was typed: the drafts live in component
 * signals, so navigating away — a mistaken back button, a click on a sidebar
 * collection, the breadcrumb — destroyed them with no toast and no undo, on a
 * page reachable in one click from anywhere. It is wired onto **both**
 * item-form routes, `items/new` and `items/:itemId/edit`: they are the same
 * component, and an edit is at least as expensive to lose as a creation.
 */
export const unsavedItemGuard: CanDeactivateFn<HasUnsavedCheck> = component =>
  component.canLeave();
