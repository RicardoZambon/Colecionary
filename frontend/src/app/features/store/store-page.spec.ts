import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  VaultApi,
  VersionedCollection,
  VersionedItem,
} from '../../core/api/vault-api';
import {
  Collection,
  Item,
  Lang,
  Member,
  StoreListing,
  StoreListingItem,
  TenantSettings,
  UserProfile,
} from '../../core/models';
import { I18nService } from '../../core/i18n';
import { VaultStore } from '../../core/state/vault.store';
import { CurrencyCode } from '../../core/utils/money.util';
import { StorePage } from './store-page';

class FakeVaultApi extends VaultApi {
  collections: Collection[] = [];
  listings: StoreListing[] = [];
  currency: CurrencyCode = 'USD';
  readonly imported: string[] = [];

  /**
   * The version every write quotes back. A constant here because these tests
   * are not about the guard — they only have to satisfy it, the way a client in
   * sync with the server always does.
   */
  private static readonly VERSION = '"1"';

  listCollections(): Observable<VersionedCollection[]> {
    return of(structuredClone(this.collections).map(collection => this.versioned(collection)));
  }
  createCollection(): Observable<VersionedCollection> {
    return of(this.versioned(structuredClone(this.collections[0])));
  }
  updateCollection(collection: Collection): Observable<VersionedCollection> {
    return of(this.versioned(collection));
  }
  deleteCollection(): Observable<void> {
    return of(void 0);
  }
  /**
   * Mirrors the server: the created collection keeps the listing's own id, and
   * declares no currency of its own — so it reads in the account default, the
   * very currency the Store showed the estimate in.
   */
  importStoreListing(listingId: string): Observable<VersionedCollection> {
    this.imported.push(listingId);
    const listing = this.listings.find(l => l.id === listingId)!;
    return of(
      this.versioned({
        id: listing.id,
        name: listing.name,
        description: listing.description,
        groups: [],
        sections: [],
        items: [],
        members: [],
        linkShare: true,
        currency: null,
      }),
    );
  }
  upsertItem(_collectionId: string, item: Item): Observable<VersionedItem> {
    return of({ version: FakeVaultApi.VERSION, item });
  }
  deleteItem(): Observable<string> {
    return of(FakeVaultApi.VERSION);
  }

  private versioned(collection: Collection): VersionedCollection {
    return { version: FakeVaultApi.VERSION, collection };
  }
  listStoreListings(): Observable<StoreListing[]> {
    return of(structuredClone(this.listings));
  }
  listTenantMembers(): Observable<Member[]> {
    return of([]);
  }
  updateTenantMembers(members: Member[]): Observable<Member[]> {
    return of(members);
  }
  getTenantSettings(): Observable<TenantSettings> {
    return of({ defaultCurrency: this.currency });
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
}

function listingItem(id: string, value: number): StoreListingItem {
  return { id, name: id, year: 1997, value, group: 'RPG', img: `${id}.jpg` };
}

const PS1: StoreListing = {
  id: 'ps1-rpgs',
  name: 'PS1 RPGs',
  publisher: 'Retro Index',
  description: 'A curated run.',
  groups: ['RPG'],
  items: [listingItem('ff7', 180), listingItem('mgs', 90), listingItem('gt2', 35)],
};

/** Intl separates symbol and figure with a non-breaking space in pt-BR. */
const normalize = (s: string) => s.replace(/\s/g, ' ').trim();

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function mount(
  opts: { currency?: CurrencyCode; lang?: Lang; collections?: Collection[] } = {},
) {
  const api = new FakeVaultApi();
  api.listings = [PS1];
  api.currency = opts.currency ?? 'USD';
  api.collections = opts.collections ?? [];

  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: VaultApi, useValue: api },
    ],
  });

  const i18n = TestBed.inject(I18nService);
  i18n.apply(opts.lang ?? 'en');
  await TestBed.inject(VaultStore).load();
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

  const fixture = TestBed.createComponent(StorePage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  return {
    api,
    el,
    fixture,
    i18n,
    navigate,
    estimate: () => normalize(el.querySelector('.value')!.textContent!),
    action: () => el.querySelector('.foot ui-button button') as HTMLButtonElement,
  };
}

describe('StorePage', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('estimates a listing as the sum of its items', async () => {
    const page = await mount();
    expect(page.estimate()).toBe('est $305.00');
  });

  it('reads the estimate in the account currency', async () => {
    // A listing belongs to no collection, so there is nothing to override the
    // account default — and the collection the import creates declares no
    // currency either, so the figure keeps its meaning after adding it.
    // English separators around a Brazilian symbol: the currency is data, the
    // formatting is language.
    const page = await mount({ currency: 'BRL' });
    expect(page.estimate()).toBe('est R$305.00');
  });

  it('lets the language move the separators, never the currency', async () => {
    // Relabelling a USD figure R$ because the UI switched to Portuguese would
    // restate the same number as a different amount of money.
    const page = await mount({ currency: 'USD', lang: 'pt-BR' });
    expect(page.estimate()).toBe('est. US$ 305,00');

    page.i18n.apply('en');
    page.fixture.detectChanges();
    expect(page.estimate()).toBe('est $305.00');
  });

  it('recognises a listing already in the vault by id', async () => {
    // The importer reuses the listing's id for the collection it creates, which
    // is the only thing that makes this comparison meaningful.
    const page = await mount({
      collections: [
        {
          id: PS1.id,
          name: 'Renamed by the user',
          description: '',
          groups: [],
          sections: [],
          items: [],
          members: [],
          linkShare: true,
          currency: null,
        },
      ],
    });

    expect(page.action().disabled).toBe(true);
  });

  it('adds a listing and opens the collection it created', async () => {
    const page = await mount();
    expect(page.action().disabled).toBe(false);

    page.action().click();
    await tick();
    page.fixture.detectChanges();

    expect(page.api.imported).toEqual([PS1.id]);
    expect(page.navigate).toHaveBeenCalledWith(['/c', PS1.id]);
    // And the card flips over, because the new collection carries the listing id.
    expect(page.action().disabled).toBe(true);
  });
});
