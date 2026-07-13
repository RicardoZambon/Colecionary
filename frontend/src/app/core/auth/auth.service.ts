import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { UserProfile } from '../models';

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

  logout(): void {
    this.session.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean.
    }
    void this.router.navigate(['/login']);
  }

  /** Called by the interceptor when the API answers 401 mid-session. */
  sessionExpired(): void {
    if (this.session()) {
      this.logout();
    }
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
