import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ImageFocusService } from '../../core/state/image-focus.service';
import { LayoutService } from '../../core/state/layout.service';
import { VaultStore } from '../../core/state/vault.store';
import { TPipe } from '../../shared/pipes/t.pipe';
import { UiButton, UiConfirm, UiImageFocus, UiToast } from '../../shared/ui';
import { ConflictNotice } from '../conflict-notice/conflict-notice';
import { NAV_DRAWER_ID, focusNavToggle } from '../nav-focus';
import { Sidebar } from '../sidebar/sidebar';
import { Topbar } from '../topbar/topbar';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    TPipe,
    Topbar,
    Sidebar,
    ConflictNotice,
    UiButton,
    UiConfirm,
    UiToast,
    UiImageFocus,
  ],
  // Escape is caught on the shell rather than on the drawer: it has to work
  // while focus sits on the scrim, which is a sibling of the drawer, and the
  // guard inside `onEscape` is what stops it from stealing focus on a page
  // where no drawer is open.
  host: { '(keydown.escape)': 'onEscape()' },
  template: `
    <!--
      First focusable element in the document. ~20 tab stops of chrome sit
      between the address bar and the page content, which is a keyboard user
      pressing Tab twenty times on every single navigation.
    -->
    <a class="skip" href="#main-content" (click)="layout.closeNav()">{{ 'shell.skipToContent' | t }}</a>

    <app-topbar />
    <div class="body">
      <app-sidebar />

      <!--
        A real <button>, not a <div>: dismissing the drawer is an action, so it
        needs a name, a role and a keyboard path. Rendered only while the drawer
        is actually open, so it can never swallow a click on the page beneath.
      -->
      @if (layout.compact() && layout.navOpen()) {
        <button
          type="button"
          class="scrim"
          [attr.aria-label]="'nav.close' | t"
          [attr.aria-controls]="drawerId"
          (click)="dismissNav()"
        ></button>
      }

      <main class="main" id="main-content" tabindex="-1">
        @if (store.loadError(); as error) {
          <!--
            The state this used to have no way to render. load() was called
            with a catch that discarded the error, and the outlet was gated on
            loaded(), so any failure that was not a 401 — a 500, CORS, a
            timeout, the API simply being down — left the word "Loading…" on
            screen for ever, with nothing in the console.
          -->
          <div class="load-error" role="alert">
            <p class="load-error__title">{{ 'shell.loadFailed.title' | t }}</p>
            <p class="load-error__body">{{ error }}</p>
            <p class="load-error__hint">{{ 'shell.loadFailed.body' | t }}</p>
            <ui-button [disabled]="store.retrying()" (click)="store.retryLoad()">
              {{ (store.retrying() ? 'shell.loadFailed.retrying' : 'shell.loadFailed.retry') | t }}
            </ui-button>
          </div>
        } @else {
          <!--
            Rendered while the vault is still in flight, not after. This used to
            be gated on loaded(), which meant no page existed until the whole
            vault had landed — so every page's own loading state was
            unreachable, and the shell showed one centred line of text for all
            of them. Each routed page now orders a loading branch before its
            not-found branch, because "the store has no such collection yet" and
            "there is no such collection" are the same expression at two
            different moments.
          -->
          <router-outlet />
        }
      </main>
    </div>
    <ui-toast />
    <!-- Above the toast, and outlives it: a refused save is the one message
         that must not disappear on its own. -->
    <app-conflict-notice />
    <!-- Last, and modal: a question about a destructive act has to sit above
         both the toast and the conflict notice. -->
    <ui-confirm />
    <ui-image-focus />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    .body {
      display: flex;
      flex: 1;
      min-height: 0;
    }

    .main {
      flex: 1;
      min-width: 0;
      overflow-y: auto;
    }

    /* The target of the skip link. Never draw a ring around the whole page —
       the point is that focus *moved*, and the heading it lands on says so. */
    .main:focus {
      outline: none;
    }

    .load-error {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--sp-3);
      max-width: 46ch;
      padding: var(--sp-8) var(--sp-6);
    }

    .load-error__title {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--fs-lg);
      font-weight: 700;
      color: var(--text);
    }

    .load-error__body {
      margin: 0;
      color: var(--text);
      font-size: var(--fs-sm);
      line-height: 1.5;
    }

    .load-error__hint {
      margin: 0;
      color: var(--muted-strong);
      font-size: var(--fs-sm);
      line-height: 1.5;
    }

    .loading {
      padding: var(--sp-10);
      color: var(--muted-strong);
      font-size: var(--fs-md);
    }

    /*
     * Visually hidden until focused. Not display:none, which would take it out
     * of the tab order and leave nothing to skip with.
     */
    .skip {
      position: fixed;
      top: var(--sp-2);
      left: var(--sp-2);
      z-index: var(--z-notice);
      padding: var(--sp-2) var(--sp-4);
      min-height: var(--tap);
      display: inline-flex;
      align-items: center;
      background: var(--accent);
      color: var(--accent-contrast);
      border-radius: var(--radius);
      font-size: var(--fs-sm);
      font-weight: 700;
      box-shadow: var(--shadow);
      transform: translateY(calc(-100% - var(--sp-4)));

      @media (prefers-reduced-motion: no-preference) {
        transition: transform var(--dur-fast) var(--ease-out);
      }

      &:focus-visible {
        transform: translateY(0);
        text-decoration: none;
      }
    }

    .scrim {
      position: fixed;
      inset: 0;
      z-index: calc(var(--z-overlay) - 1);
      border: 0;
      padding: 0;
      /* Derived from a token rather than a literal black: the scrim has to
         dim towards the theme's own ground, or it reads as a hole in a dark
         theme and as soot in a light one. */
      background: color-mix(in srgb, var(--bg) 78%, transparent);
      cursor: pointer;

      @media (prefers-reduced-motion: no-preference) {
        animation: scrim-in var(--dur-mid) var(--ease-out);
      }
    }

    @keyframes scrim-in {
      from {
        opacity: 0;
      }
    }
  `,
})
export class Shell {
  protected readonly store = inject(VaultStore);
  protected readonly layout = inject(LayoutService);
  private readonly focus = inject(ImageFocusService);
  private readonly document = inject(DOCUMENT);

  protected readonly drawerId = NAV_DRAWER_ID;

  constructor() {
    // An expired token is the auth interceptor's business — it logs out and
    // redirects. Everything else is recorded in `store.loadError()` and
    // rendered above with a retry, so this catch only keeps the rejection from
    // going unhandled. It used to be the whole of the error handling.
    this.store.load().catch(() => undefined);
    // Framing is cosmetic: if it fails to load, every image just renders
    // centred, which is exactly the pre-framing behaviour. Never block the app.
    this.focus.load().catch(() => undefined);
  }

  protected dismissNav(): void {
    this.layout.closeNav();
    focusNavToggle(this.document);
  }

  protected onEscape(): void {
    if (!this.layout.navOpen()) return;
    this.dismissNav();
  }
}
