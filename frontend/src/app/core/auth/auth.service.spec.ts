import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService, AuthSession } from './auth.service';
import { environment } from '../../../environments/environment';

const SESSION: AuthSession = {
  token: 'jwt-token',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  profile: { name: 'Marcus Keller', email: 'marcus@example.com', initials: 'MK', plan: 'free', role: 'Owner' },
};

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'login', children: [] }]),
      ],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  it('starts unauthenticated', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.token()).toBeNull();
  });

  it('stores the session on login and clears it on logout', async () => {
    const pending = service.login('marcus@example.com', 'vault-demo');
    const req = http.expectOne(`${environment.apiBaseUrl}/auth/login`);
    expect(req.request.method).toBe('POST');
    req.flush(SESSION);
    await pending;

    expect(service.isAuthenticated()).toBe(true);
    expect(service.token()).toBe('jwt-token');
    expect(localStorage.getItem('vault.auth')).toContain('jwt-token');

    // Awaited, because `logout` navigates *first* and only ends the session if
    // the navigation actually happened — see the method's own note.
    await service.logout();
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('vault.auth')).toBeNull();
  });

  /**
   * A page holding unsaved work protects it with a `canDeactivate`, and a guard
   * only runs on a navigation. Ending the session first meant the guard was
   * asked after the state it guards had already been destroyed, so signing out
   * mid-edit discarded the draft in silence.
   */
  it('stays signed in when a guard refuses the navigation away', async () => {
    const pending = service.login('marcus@example.com', 'vault-demo');
    http.expectOne(`${environment.apiBaseUrl}/auth/login`).flush(SESSION);
    await pending;

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(false);

    await service.logout();

    expect(navigate, 'it tries to leave before tearing anything down').toHaveBeenCalled();
    expect(service.isAuthenticated(), 'the user answered "stay"').toBe(true);
    expect(localStorage.getItem('vault.auth')).toContain('jwt-token');
  });

  it('treats an expired stored session as unauthenticated', async () => {
    const pending = service.login('marcus@example.com', 'vault-demo');
    http.expectOne(`${environment.apiBaseUrl}/auth/login`).flush({
      ...SESSION,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    await pending;
    expect(service.isAuthenticated()).toBe(false);
  });
});
