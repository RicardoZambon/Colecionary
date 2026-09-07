import { DOCUMENT } from '@angular/common';
import { Injectable, Injector, afterNextRender, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

import { MAIN_LANDMARK_ID } from '../../shared/ui/focus-return';

/**
 * The width at which the sidebar stops being a column and becomes a drawer.
 *
 * This is the one place the value is duplicated outside `styles/_mixins.scss`,
 * and it is a duplication on purpose: a media query cannot be read from script,
 * and the drawer needs script for the part CSS cannot express — that a *hidden*
 * off-canvas nav must also leave the accessibility tree and the tab order. Keep
 * it equal to `$bp-lg`; the two moving apart gives you a drawer that is visible
 * and `aria-hidden` at the same time.
 */
const COMPACT_QUERY = '(max-width: 900px)';

/**
 * Owns the state the responsive shell needs: whether the layout is narrow
 * enough for the sidebar to be a drawer, and whether that drawer is open.
 *
 * Shaped like `ThemeService` — a signal plus the methods that move it — with
 * one deliberate difference: **nothing is persisted.** A theme is a preference;
 * an open drawer is a transient position in a navigation gesture, and restoring
 * it on the next cold load would greet the user with a menu covering the page
 * they asked for.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  readonly navOpen = signal(false);

  /** True while the sidebar is rendering as an off-canvas drawer. */
  readonly compact = signal(false);

  constructor() {
    // Following a link is the drawer's whole purpose, so the drawer closes when
    // one is followed. Without this the destination renders *behind* the menu
    // and the user has to dismiss it to see what they picked.
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        this.closeNav();
        this.rescueFocus();
      });

    const media = this.document.defaultView?.matchMedia?.(COMPACT_QUERY);
    if (media) {
      this.compact.set(media.matches);
      // Rotating a phone crosses the breakpoint. Leaving `navOpen` set would
      // then reopen the drawer the next time the viewport narrows again, which
      // reads as the menu opening itself.
      media.addEventListener('change', e => {
        this.compact.set(e.matches);
        if (!e.matches) this.closeNav();
      });
    }
  }

  toggleNav(): void {
    this.navOpen.update(open => !open);
  }

  closeNav(): void {
    this.navOpen.set(false);
  }

  /**
   * Puts focus back in the document when a navigation dropped it.
   *
   * Nothing focuses anything on a route change, so whenever the element that
   * had focus went with the outgoing page — a nav row in the drawer that is
   * about to close, a link inside the component being destroyed — focus fell to
   * `<body>` and the next Tab restarted at the skip link, ~20 stops of chrome
   * from the content. The shell's `<main>` is `tabindex="-1"` for exactly this.
   *
   * **Only when focus was actually lost.** Moving it on *every* navigation is
   * the more common pattern and it is the wrong one here: the item page's
   * previous/next links navigate in place, and a reader stepping through a
   * collection with them would be thrown to the top of the page after every
   * step. An element that survived the navigation still holds focus, and
   * nothing may take it away from there.
   *
   * `afterNextRender` because `<main>` is `inert` while the drawer is open, and
   * `closeNav()` above only lifts that on the next render — `.focus()` inside
   * an inert subtree is silently ignored. Same reason as `focusNavToggle`.
   */
  private rescueFocus(): void {
    const active = this.document.activeElement as HTMLElement | null;
    const lost = !active || active === this.document.body || !active.isConnected;
    if (!lost) return;

    afterNextRender(
      () => {
        // Re-checked on the far side of the render: the page that just rendered
        // may have focused something of its own (a fresh collection's name box
        // does), and that choice outranks this one.
        const now = this.document.activeElement as HTMLElement | null;
        if (now && now !== this.document.body) return;
        this.document.getElementById(MAIN_LANDMARK_ID)?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }
}
