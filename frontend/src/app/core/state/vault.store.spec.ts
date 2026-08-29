import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { VaultApi, VaultConflictError, VersionedCollection, VersionedItem } from '../api/vault-api';
import {
  Collection,
  Item,
  Member,
  StoreListing,
  TenantSettings,
  UserProfile,
} from '../models';
import { ConflictService } from './conflict.service';
import { VaultStore } from './vault.store';

/**
 * The version half of the backend contract, answered from memory.
 *
 * A real server, not a permissive one: it holds a version per collection, moves
 * it on every accepted write, and refuses anything that quotes a token it has
 * already replaced. A fake that accepted every write would let this whole file
 * pass against a store that sent no precondition at all.
 */
class FakeVaultApi extends VaultApi {
  collections: Collection[] = [];
  private readonly versions = new Map<string, number>();
  /** Every `If-Match` the store sent, in order. */
  readonly preconditions: string[] = [];

  /** Moves a collection on behind the store's back, as another tab would. */
  moveOn(id: string): void {
    this.versions.set(id, (this.versions.get(id) ?? 1) + 1);
  }

  listCollections(): Observable<VersionedCollection[]> {
    return of(
      structuredClone(this.collections).map(collection => {
        this.versions.set(collection.id, this.versions.get(collection.id) ?? 1);
        return { version: this.tag(collection.id), collection };
      }),
    );
  }

  createCollection(): Observable<VersionedCollection> {
    return throwError(() => new Error('unused'));
  }

  updateCollection(collection: Collection, version: string): Observable<VersionedCollection> {
    this.preconditions.push(version);
    if (version !== this.tag(collection.id)) {
      return throwError(
        () => new VaultConflictError(collection.id, 'Changed somewhere else.'),
      );
    }
    this.moveOn(collection.id);
    this.collections = this.collections.map(c => (c.id === collection.id ? collection : c));
    return of({ version: this.tag(collection.id), collection });
  }

  deleteCollection(): Observable<void> {
    return of(void 0);
  }

  importStoreListing(): Observable<VersionedCollection> {
    return throwError(() => new Error('unused'));
  }

  upsertItem(collectionId: string, item: Item, version: string): Observable<VersionedItem> {
    this.preconditions.push(version);
    if (version !== this.tag(collectionId)) {
      return throwError(() => new VaultConflictError(collectionId, 'Changed somewhere else.'));
    }
    this.moveOn(collectionId);
    return of({ version: this.tag(collectionId), item });
  }

  deleteItem(collectionId: string): Observable<string> {
    // Unguarded, but it still moves the version — exactly like the server.
    this.moveOn(collectionId);
    return of(this.tag(collectionId));
  }

  listStoreListings(): Observable<StoreListing[]> {
    return of([]);
  }
  listTenantMembers(): Observable<Member[]> {
    return of([]);
  }
  updateTenantMembers(members: Member[]): Observable<Member[]> {
    return of(members);
  }
  getTenantSettings(): Observable<TenantSettings> {
    return of({ defaultCurrency: 'USD' });
  }
  updateTenantSettings(settings: TenantSettings): Observable<TenantSettings> {
    return of(settings);
  }
  getProfile(): Observable<UserProfile> {
    return of({ name: 'Marcus', email: 'marcus@example.com', initials: 'MC', plan: 'free' });
  }
  updateProfile(profile: UserProfile): Observable<UserProfile> {
    return of(profile);
  }

  private tag(id: string): string {
    return `"${this.versions.get(id) ?? 1}"`;
  }
}

function collection(patch: Partial<Collection> = {}): Collection {
  return {
    id: 'c1',
    name: 'Vinyl',
    description: '',
    groups: [],
    sections: [],
    items: [],
    members: [],
    linkShare: false,
    currency: null,
    ...patch,
  };
}

function item(patch: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    name: 'Rubber Soul',
    description: '',
    year: 1965,
    value: 0,
    groupId: '',
    sectionId: '',
    tags: [],
    img: 'rubber_soul.jpg',
    custom: [],
    copies: [],
    photoIds: [],
    ...patch,
  };
}

async function mount(collections: Collection[] = [collection()]) {
  const api = new FakeVaultApi();
  api.collections = collections;

  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: VaultApi, useValue: api },
    ],
  });

  const store = TestBed.inject(VaultStore);
  await store.load();
  return { api, store, conflicts: TestBed.inject(ConflictService) };
}

describe('VaultStore versions', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('sends the version it loaded with, and the one each save answers with', async () => {
    const { api, store } = await mount();

    await store.updateCollection(collection({ name: 'First' }));
    await store.updateCollection(collection({ name: 'Second' }));

    // The second save must not reuse the token the first one consumed —
    // saving twice in a row is the single commonest thing this page does.
    expect(api.preconditions).toEqual(['"1"', '"2"']);
    expect(store.collection('c1')!.name).toBe('Second');
  });

  it('refuses a save built on a version somebody else has replaced', async () => {
    const { api, store, conflicts } = await mount();

    // Another tab saves. This store hears nothing about it.
    api.moveOn('c1');

    await expect(store.updateCollection(collection({ name: 'Stale' }))).rejects.toBeInstanceOf(
      VaultConflictError,
    );

    // Nothing local pretends the save happened: the store still holds what it
    // last synchronised with, so the page can safely keep its own draft.
    expect(store.collection('c1')!.name).toBe('Vinyl');
    expect(conflicts.pending()).toEqual({
      collectionId: 'c1',
      message: 'Changed somewhere else.',
    });
  });

  it('guards item writes with the same version, and keeps it fresh afterwards', async () => {
    const { api, store } = await mount();

    await store.upsertItem('c1', item());
    // An item write moves the aggregate's version on the server, so a full save
    // straight afterwards has to quote the new one or it would be refused for a
    // change this app made itself.
    await store.updateCollection(collection({ items: [item()] }));

    expect(api.preconditions).toEqual(['"1"', '"2"']);
  });

  it('keeps the version an item delete answers with', async () => {
    const { api, store } = await mount([collection({ items: [item()] })]);

    await store.deleteItem('c1', 'i1');
    await store.updateCollection(collection());

    // The delete takes no precondition but still moves the version. Ignoring
    // what it answered would refuse the very next save.
    expect(api.preconditions).toEqual(['"2"']);
    expect(store.collection('c1')!.items).toEqual([]);
  });

  it('reports a conflict on an item write too', async () => {
    const { api, store, conflicts } = await mount();
    api.moveOn('c1');

    await expect(store.upsertItem('c1', item())).rejects.toBeInstanceOf(VaultConflictError);
    expect(conflicts.pending()?.collectionId).toBe('c1');
    // The refused item is not folded into local state — the store must never
    // show something storage does not have.
    expect(store.collection('c1')!.items).toEqual([]);
  });

  it('refuses to save a collection it never synchronised with', async () => {
    const { api, store, conflicts } = await mount();

    await expect(store.updateCollection(collection({ id: 'never-loaded' }))).rejects.toBeInstanceOf(
      VaultConflictError,
    );

    // No precondition to send means no honest write to make. Inventing one
    // would ask the server to accept a document derived from nothing.
    expect(api.preconditions).toEqual([]);
    expect(conflicts.pending()?.collectionId).toBe('never-loaded');
  });

  it('rebuilds its versions on reload rather than merging them', async () => {
    const { api, store } = await mount();
    api.moveOn('c1');

    // Reloading is the way out of a conflict, so it has to actually restore the
    // ability to save. A version left over from the previous load would make the
    // notice's own remedy fail.
    await store.load();
    await store.updateCollection(collection({ name: 'After reloading' }));
    expect(store.collection('c1')!.name).toBe('After reloading');
  });
});
