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

export function focusNavToggle(doc: Document): void {
  doc.getElementById(NAV_TOGGLE_ID)?.focus();
}
