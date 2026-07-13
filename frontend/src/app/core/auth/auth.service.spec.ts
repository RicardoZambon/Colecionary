import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthService, AuthSession } from './auth.service';
import { environment } from '../../../environments/environment';

const SESSION: AuthSession = {
  token: 'jwt-token',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  profile: { name: 'Marcus Keller', email: 'marcus@airia.com', initials: 'MK', plan: 'free' },
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
    const pending = service.login('marcus@airia.com', 'vault-demo');
    const req = http.expectOne(`${environment.apiBaseUrl}/auth/login`);
    expect(req.request.method).toBe('POST');
    req.flush(SESSION);
    await pending;

    expect(service.isAuthenticated()).toBe(true);
    expect(service.token()).toBe('jwt-token');
    expect(localStorage.getItem('vault.auth')).toContain('jwt-token');

    service.logout();
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('vault.auth')).toBeNull();
  });

  it('treats an expired stored session as unauthenticated', async () => {
    const pending = service.login('marcus@airia.com', 'vault-demo');
    http.expectOne(`${environment.apiBaseUrl}/auth/login`).flush({
      ...SESSION,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    await pending;
    expect(service.isAuthenticated()).toBe(false);
  });
});
