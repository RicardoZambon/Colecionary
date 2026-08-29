import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { VaultApi, VaultConflictError, VersionedCollection, VersionedItem } from '../api/vault-api';
import { Collection, Item, Member, MemberRole, StoreListing, TenantSettings, UserProfile } from '../models';
import { ConflictService } from './conflict.service';
import { I18nService } from '../i18n';
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
  /**
   * When set, every read fails with it — an outage, a 500, a CORS refusal. The
   * one condition the shell used to render as "Loading…" for ever.
   */
  failReadsWith: Error | null = null;
  /** How many times the store has asked for the collection list. */
  reads = 0;

  /** Moves a collection on behind the store's back, as another tab would. */
  moveOn(id: string): void {
    this.versions.set(id, (this.versions.get(id) ?? 1) + 1);
  }

  listCollections(): Observable<VersionedCollection[]> {
    this.reads++;
    if (this.failReadsWith) return throwError(() => this.failReadsWith);
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
  /** Whatever role the test wants this session to have. */
  role: MemberRole = 'Owner';

  getProfile(): Observable<UserProfile> {
    return of({
      name: 'Marcus',
      email: 'marcus@example.com',
      initials: 'MC',
      plan: 'free',
      role: this.role,
    });
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

async function mount(collections: Collection[] = [collection()], role: MemberRole = 'Owner') {
  const api = new FakeVaultApi();
  api.collections = collections;
  api.role = role;

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

describe('VaultStore load failures', () => {
  beforeEach(() => TestBed.resetTestingModule());

  /** Mounted without loading, so the failing first load is the subject. */
  function bare() {
    const api = new FakeVaultApi();
    api.collections = [collection()];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: VaultApi, useValue: api },
      ],
    });
    return { api, store: TestBed.inject(VaultStore) };
  }

  it('records the failure instead of leaving the app loading for ever', async () => {
    const { api, store } = bare();
    api.failReadsWith = new Error('Can’t reach the Vault server.');

    // Still rejects: the conflict notice's "reload" button has to be able to
    // tell whether it worked.
    await expect(store.load()).rejects.toThrow();

    // And now it is a *state*, which is the whole point — `loaded` stays false,
    // so the shell must have something else to render, and this is it.
    expect(store.loaded()).toBe(false);
    expect(store.loadError()).toBe('Can’t reach the Vault server.');
  });

  it('falls back to its own words when the failure had none', async () => {
    const { api, store } = bare();
    api.failReadsWith = new Error('');

    await expect(store.load()).rejects.toThrow();
    expect(store.loadError()).toBe(TestBed.inject(I18nService).t('shell.loadFailed.body'));
  });

  it('retries, and reports success by clearing the failure', async () => {
    const { api, store } = bare();
    api.failReadsWith = new Error('offline');
    await expect(store.load()).rejects.toThrow();

    api.failReadsWith = null;
    await expect(store.retryLoad()).resolves.toBe(true);

    expect(store.loadError()).toBeNull();
    expect(store.loaded()).toBe(true);
    expect(store.collection('c1')).toBeDefined();
  });

  it('never rejects out of a retry, and puts the failure back when it fails again', async () => {
    const { api, store } = bare();
    api.failReadsWith = new Error('still offline');
    await expect(store.load()).rejects.toThrow();

    // Called straight from a click: a rejection here would be exactly the
    // silence this whole change is about.
    await expect(store.retryLoad()).resolves.toBe(false);
    expect(store.loadError()).toBe('still offline');
    expect(store.retrying()).toBe(false);
  });

  it('will not run two retries at once', async () => {
    const { api, store } = bare();
    api.failReadsWith = new Error('offline');
    await expect(store.load()).rejects.toThrow();
    const before = api.reads;

    const first = store.retryLoad();
    const second = store.retryLoad();
    await Promise.all([first, second]);

    // A second click while the first attempt is in flight is not a second
    // attempt.
    expect(api.reads).toBe(before + 1);
  });

  it('tells the status line what is actually going on', async () => {
    const { api, store } = bare();
    expect(store.syncState()).toBe('synced');

    api.failReadsWith = new Error('offline');
    await expect(store.load()).rejects.toThrow();
    expect(store.syncState()).toBe('offline');
    expect(store.syncStatusKey()).toBe('nav.sync.offline');

    api.failReadsWith = null;
    await store.retryLoad();
    expect(store.syncState()).toBe('synced');

    // A refused save outranks everything else: it is the one the user has to
    // answer.
    TestBed.inject(ConflictService).raise({ collectionId: 'c1', message: 'Changed elsewhere.' });
    expect(store.syncStatusKey()).toBe('nav.sync.conflict');
  });

  it('never leaves the status line stuck on "saving" after a refused write', async () => {
    const { api, store } = bare();
    await store.load();
    expect(store.syncState()).toBe('synced');

    api.moveOn('c1');
    // A refused write must not leave the status line stuck on "Saving…".
    await expect(store.updateCollection(collection({ name: 'Stale' }))).rejects.toThrow();
    expect(store.syncState()).toBe('conflict');
  });
});

describe('VaultStore permissions', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('lets an Owner and an Editor write, and refuses a Viewer', async () => {
    for (const role of ['Owner', 'Editor'] as const) {
      TestBed.resetTestingModule();
      const page = await mount([collection()], role);
      expect(page.store.canEdit(), role).toBe(true);
    }

    TestBed.resetTestingModule();
    const viewer = await mount([collection()], 'Viewer');
    expect(viewer.store.canEdit()).toBe(false);
  });

  it('reserves account administration for the Owner', async () => {
    const owner = await mount([collection()], 'Owner');
    expect(owner.store.canAdminister()).toBe(true);

    TestBed.resetTestingModule();
    const editor = await mount([collection()], 'Editor');
    // An Editor writes catalogue content and does not touch membership, tenant
    // settings or an archive restore — `CanAdminister` on the server.
    expect(editor.store.canEdit()).toBe(true);
    expect(editor.store.canAdminister()).toBe(false);
  });

  it('fails open before the profile has arrived', async () => {
    // Deliberate, and the direction matters: hiding every control from an Owner
    // during a slow load is a worse wrong than briefly offering a button that
    // turns out to be refused. The 403 is the real answer either way.
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: VaultApi, useValue: new FakeVaultApi() },
      ],
    });
    const store = TestBed.inject(VaultStore);

    expect(store.profile()).toBeNull();
    expect(store.canEdit()).toBe(true);
    expect(store.canAdminister()).toBe(true);
  });
});
