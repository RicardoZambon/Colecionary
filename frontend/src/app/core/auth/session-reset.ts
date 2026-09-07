import { Injectable } from '@angular/core';

/**
 * The list of things that have to be thrown away when a session ends.
 *
 * It exists because signing out used to clear the token and nothing else. Every
 * store in the app is `providedIn: 'root'`, so it outlives the session, and
 * logging in is a router navigation rather than a page load — so the next
 * person to sign in on the same tab was shown the *previous* account's vault:
 * `VaultStore.loaded` was still true, `ensureLoaded()` short-circuited on its
 * first line, `GET /api/collections` was never issued, and the dashboard,
 * the sidebar and the totals were all somebody else's. With two tenants that is
 * cross-account data on screen, and the roles came from the stale profile too.
 *
 * A registry rather than `AuthService` reaching for the stores directly, for
 * two reasons. `core/auth` stays free of any dependency on `core/state`, which
 * is the layering the rest of the app follows. And this service has no
 * dependencies at all, so injecting it costs the auth tests nothing — where
 * injecting `VaultStore` would drag `VaultApi` and `HttpClient` into the
 * TestBed of anything that touches sign-out, the same argument that put
 * `CurrencyService` beside the store instead of inside it.
 *
 * Registration happens in a store's constructor, so a store nobody has
 * constructed yet holds no session state to clear — and a store constructed
 * later starts empty by definition.
 *
 * {@link run} is **synchronous**: the caller navigates to `/login` straight
 * afterwards, and a reset scheduled for "later" could land after the next
 * account's load had already begun.
 */
@Injectable({ providedIn: 'root' })
export class SessionReset {
  private readonly handlers = new Set<() => void>();

  /** Adds a handler. Returns nothing to unregister with — root services live as long as the app. */
  register(handler: () => void): void {
    this.handlers.add(handler);
  }

  /**
   * Clears every registered holder of session state.
   *
   * One handler throwing must not stop the rest: a half-cleared app is the bug
   * this whole file exists to prevent, and the failure of a cosmetic reset is
   * not a reason to leave the collections on screen.
   */
  run(): void {
    for (const handler of this.handlers) {
      try {
        handler();
      } catch {
        // Nothing to say — the next handler is more important than this one.
      }
    }
  }
}
