import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { HttpVaultApi } from './http-vault-api';
import { VaultConflictError } from './vault-api';
import { Collection, Item } from '../models';
import { environment } from '../../../environments/environment';

const ITEM: Item = {
  id: 'i1',
  name: 'X',
  description: '',
  year: 2000,
  value: 1,
  groupId: 'g',
  sectionId: '',
  tags: [],
  img: 'x.jpg',
  custom: [],
  photoIds: [],
  copies: [
    {
      id: 'i1_c1',
      condition: 'Good' as const,
      price: 1,
      value: null,
      acquiredOn: null,
      status: 'Keep' as const,
      notes: '',
      custom: [],
    },
  ],
};

const COLLECTION: Collection = {
  id: 'retro',
  name: 'Retro',
  description: '',
  fields: [],
  groups: [],
  sections: [],
  items: [],
  members: [],
  linkShare: true,
  currency: null,
};

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
    const pending = firstValueFrom(api.upsertItem('retro', ITEM, '"3"'));
    const req = http.expectOne(`${environment.apiBaseUrl}/collections/retro/items/i1`);
    expect(req.request.method).toBe('PUT');
    req.flush(ITEM, { headers: { ETag: '"4"' } });
    await expect(pending).resolves.toEqual({ version: '"4"', item: ITEM });
  });

  // --- the precondition ---

  it('sends the version it was given as an If-Match precondition', async () => {
    const collection = firstValueFrom(api.updateCollection(COLLECTION, '"7"'));
    const put = http.expectOne(`${environment.apiBaseUrl}/collections/retro`);
    // The server refuses a write with no precondition (428), so a missing header
    // here is not a lenient client — it is a save that never lands.
    expect(put.request.headers.get('If-Match')).toBe('"7"');
    put.flush(COLLECTION, { headers: { ETag: '"8"' } });
    await expect(collection).resolves.toEqual({ version: '"8"', collection: COLLECTION });

    const item = firstValueFrom(api.upsertItem('retro', ITEM, '"8"'));
    const upsert = http.expectOne(`${environment.apiBaseUrl}/collections/retro/items/i1`);
    expect(upsert.request.headers.get('If-Match')).toBe('"8"');
    upsert.flush(ITEM, { headers: { ETag: '"9"' } });
    await item;
  });

  it('reads the new version off the ETag so the next save is not refused', async () => {
    const pending = firstValueFrom(api.updateCollection(COLLECTION, '"7"'));
    http.expectOne(`${environment.apiBaseUrl}/collections/retro`)
      .flush(COLLECTION, { headers: { ETag: '"8"' } });
    const saved = await pending;
    expect(saved.version).toBe('"8"');
  });

  it('fails loudly when a write comes back with no ETag', async () => {
    // The usual cause is CORS: the header has to be exposed, or the browser
    // hides it. Carrying on with the old version would look like an intermittent
    // "somebody else edited this" the user never caused.
    const pending = firstValueFrom(api.updateCollection(COLLECTION, '"7"'));
    http.expectOne(`${environment.apiBaseUrl}/collections/retro`).flush(COLLECTION);
    await expect(pending).rejects.toThrow(/ETag/);
  });

  it('deleting an item answers with the version the collection moved to', async () => {
    // The delete is unguarded but still moves the version, so a client that
    // ignored the answer would be refused on its very next save.
    const pending = firstValueFrom(api.deleteItem('retro', 'i1'));
    const req = http.expectOne(`${environment.apiBaseUrl}/collections/retro/items/i1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { headers: { ETag: '"5"' } });
    await expect(pending).resolves.toBe('"5"');
  });

  // --- refusals ---

  it('turns a 412 into a conflict naming the collection, with the server wording', async () => {
    const pending = firstValueFrom(api.updateCollection(COLLECTION, '"7"'));
    http.expectOne(`${environment.apiBaseUrl}/collections/retro`).flush(
      { title: 'This changed somewhere else', detail: 'Nothing was saved.', status: 412 },
      { status: 412, statusText: 'Precondition Failed' },
    );

    // A distinct type, because the right response differs: a conflict means
    // keep the form and explain, and every other failure means try again.
    const error = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VaultConflictError);
    expect((error as VaultConflictError).collectionId).toBe('retro');
    expect((error as Error).message).toBe('Nothing was saved.');
  });

  it('does not dress a 428 up as somebody else editing', async () => {
    // 428 means this client sent no precondition at all — a bug here, not a
    // race. Telling the user someone else got there first would be a lie.
    const pending = firstValueFrom(api.updateCollection(COLLECTION, '"7"'));
    http.expectOne(`${environment.apiBaseUrl}/collections/retro`).flush(
      { title: 'Precondition required', detail: 'Send an If-Match.', status: 428 },
      { status: 428, statusText: 'Precondition Required' },
    );

    const error = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(VaultConflictError);
  });
});
