import { Injector, afterNextRender } from '@angular/core';

/**
 * Where focus goes when the nav drawer is dismissed.
 *
 * The hamburger lives in the topbar and the dismissals live in the sidebar (the
 * ✕) and the shell (the scrim, Escape), so the three cannot hand each other an
 * `ElementRef`. An id is the smallest contract that lets them agree, and it is
 * the same id `aria-controls` already needs to name.
 *
 * Focus has to come *back*: the drawer goes `inert` as it closes, so whatever
 * had focus inside it is dropped on `<body>`, and the next Tab restarts from the
 * top of the document — losing a keyboard user the place they were.
 */
export const NAV_TOGGLE_ID = 'app-nav-toggle';
export const NAV_DRAWER_ID = 'app-nav';

/**
 * Focus has to be moved **after** the render that closes the drawer, not during
 * the handler that asks for it.
 *
 * `.focus()` on an element inside an `inert` subtree is silently ignored, and
 * while the drawer is open the top bar — which is where this button lives — is
 * inert, precisely so Tab cannot walk out of the drawer into the dimmed page.
 * A handler that closes the drawer and focuses in the same turn therefore runs
 * before the binding that lifts that `inert`, and the focus call does nothing:
 * the keyboard user is left on `<body>`, the next Tab restarts at the skip link,
 * and — worse — Escape stops working, because the shell's own key handler never
 * sees a keydown that happened outside it.
 *
 * Hence the injector: `afterNextRender` is what puts the call on the far side of
 * the binding. See `Shell.dismissNav` and `Sidebar.dismiss`.
 */
export function focusNavToggle(doc: Document, injector: Injector): void {
  afterNextRender(() => doc.getElementById(NAV_TOGGLE_ID)?.focus(), { injector });
}
