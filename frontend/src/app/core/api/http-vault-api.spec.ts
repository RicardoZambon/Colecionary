import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { HttpVaultApi } from './http-vault-api';
import { environment } from '../../../environments/environment';

describe('HttpVaultApi', () => {
  let api: HttpVaultApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpVaultApi],
    });
    api = TestBed.inject(HttpVaultApi);
    http = TestBed.inject(HttpTestingController);
  });

  it('lists collections from the API', async () => {
    const pending = firstValueFrom(api.listCollections());
    const req = http.expectOne(`${environment.apiBaseUrl}/collections`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
    await expect(pending).resolves.toEqual([]);
  });

  it('unwraps ProblemDetails into a plain Error message for toasts', async () => {
    const pending = firstValueFrom(api.importStoreListing('store_ps1'));
    const req = http.expectOne(`${environment.apiBaseUrl}/collections/import/store_ps1`);
    req.flush(
      { title: 'Conflict', detail: 'Already in your vault', status: 409 },
      { status: 409, statusText: 'Conflict' },
    );
    await expect(pending).rejects.toThrow('Already in your vault');
  });

  it('routes item upserts to the collection-scoped endpoint', async () => {
    const item = {
      id: 'i1', name: 'X', description: '', year: 2000,
      value: 1, groupId: 'g', tags: [], img: 'x.jpg', custom: [], photoIds: [],
      copies: [
        {
          id: 'i1_c1', condition: 'Good' as const, price: 1, value: null,
          acquiredOn: null, status: 'Keep' as const, notes: '',
        },
      ],
    };
    const pending = firstValueFrom(api.upsertItem('retro', item));
    const req = http.expectOne(`${environment.apiBaseUrl}/collections/retro/items/i1`);
    expect(req.request.method).toBe('PUT');
    req.flush(item);
    await expect(pending).resolves.toEqual(item);
  });
});
