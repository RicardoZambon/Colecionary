import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { UserProfile } from '../models';
import { SessionReset } from './session-reset';

export interface AuthSession {
  token: string;
  expiresAt: string;
  profile: UserProfile;
}

const STORAGE_KEY = 'vault.auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly sessionReset = inject(SessionReset);

  private readonly session = signal<AuthSession | null>(restoreSession());

  readonly profile = computed(() => this.session()?.profile ?? null);
  readonly token = computed(() => this.session()?.token ?? null);
  readonly isAuthenticated = computed(() => {
    const session = this.session();
    return !!session && new Date(session.expiresAt).getTime() > Date.now();
  });

  async login(email: string, password: string): Promise<void> {
    const session = await firstValueFrom(
      this.http.post<AuthSession>(`${environment.apiBaseUrl}/auth/login`, { email, password }),
    );
    this.session.set(session);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Session just won't survive a reload.
    }
  }

  /**
   * Ends the session by choice. No message: the user asked for this.
   *
   * The reset is not optional and not cosmetic. Every store is
   * `providedIn: 'root'` and login is a navigation rather than a page load, so
   * without it the next person to sign in on this tab is shown the previous
   * account's collections, totals and role — see {@link SessionReset}.
   */
  logout(): void {
    this.endSession();
    void this.router.navigate(['/login']);
  }

  /**
   * Called by the interceptor when the API answers 401 mid-session.
   *
   * Distinct from {@link logout} in both directions. It carries `returnUrl`, so
   * signing in again lands back on the item or collection the user was on
   * rather than on the dashboard; and it carries `expired`, which is the only
   * thing that lets the sign-in card say what happened. A 401 is deliberately
   * not reported by `errorInterceptor` ("401 belongs to authInterceptor") — so
   * if this says nothing, a session timeout is the one HTTP failure in the app
   * with no reporter at all, and the screen simply becomes the login form for
   * no stated reason.
   */
  sessionExpired(): void {
    if (!this.session()) return;
    // Read before the session is torn down; the router url is still the page
    // the user was looking at when the request came back refused.
    const returnUrl = this.router.url;
    this.endSession();
    void this.router.navigate(['/login'], {
      // `/login` itself is never worth returning to, and neither is an empty
      // url — both would send the user in a circle.
      queryParams: {
        expired: 1,
        returnUrl: returnUrl && !returnUrl.startsWith('/login') ? returnUrl : null,
      },
    });
  }

  /** Everything both endings share, minus where to go next. */
  private endSession(): void {
    this.session.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean.
    }
    this.sessionReset.run();
  }
}

function restoreSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    return new Date(session.expiresAt).getTime() > Date.now() ? session : null;
  } catch {
    return null;
  }
}
