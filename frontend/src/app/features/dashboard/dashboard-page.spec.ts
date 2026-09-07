import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { VaultApi, VersionedCollection, VersionedItem } from '../../core/api/vault-api';
import { I18nService } from '../../core/i18n';
import {
  Collection,
  Item,
  ItemCopy,
  Lang,
  Member,
  MemberRole,
  StoreListing,
  TenantSettings,
  UserProfile,
} from '../../core/models';
import { VaultStore } from '../../core/state/vault.store';
import { CurrencyCode } from '../../core/utils/money.util';
import { DashboardPage } from './dashboard-page';

class FakeVaultApi extends VaultApi {
  collections: Collection[] = [];
  currency: CurrencyCode = 'BRL';
  role: MemberRole = 'Owner';

  private static readonly VERSION = '"1"';

  listCollections(): Observable<VersionedCollection[]> {
    return of(
      structuredClone(this.collections).map(collection => ({
        version: FakeVaultApi.VERSION,
        collection,
      })),
    );
  }
  createCollection(): Observable<VersionedCollection> {
    return of({ version: FakeVaultApi.VERSION, collection: this.collections[0] });
  }
  updateCollection(collection: Collection): Observable<VersionedCollection> {
    return of({ version: FakeVaultApi.VERSION, collection });
  }
  deleteCollection(): Observable<void> {
    return of(void 0);
  }
  importStoreListing(): Observable<VersionedCollection> {
    return of({ version: FakeVaultApi.VERSION, collection: this.collections[0] });
  }
  upsertItem(_collectionId: string, item: Item): Observable<VersionedItem> {
    return of({ version: FakeVaultApi.VERSION, item });
  }
  deleteItem(): Observable<string> {
    return of(FakeVaultApi.VERSION);
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
    return of({ defaultCurrency: this.currency });
  }
  updateTenantSettings(settings: TenantSettings): Observable<TenantSettings> {
    return of(settings);
  }
  getProfile(): Observable<UserProfile> {
    return of({
      name: 'Marcus Keller',
      email: 'marcus@example.com',
      initials: 'MK',
      plan: 'free',
      role: this.role,
    });
  }
  updateProfile(profile: UserProfile): Observable<UserProfile> {
    return of(profile);
  }
}

function copy(patch: Partial<ItemCopy> = {}): ItemCopy {
  return {
    id: `cp${Math.random().toString(36).slice(2, 8)}`,
    condition: 'Good',
    price: 0,
    value: null,
    acquiredOn: null,
    status: 'Keep',
    notes: '',
    custom: [],
    ...patch,
  };
}

function item(patch: Partial<Item> = {}): Item {
  return {
    id: `i${Math.random().toString(36).slice(2, 8)}`,
    name: 'Pegasus Seiya',
    description: '',
    year: 2019,
    value: 0,
    groupId: '',
    sectionId: '',
    tags: [],
    img: '',
    custom: [],
    copies: [],
    photoIds: [],
    createdAt: '2026-01-02T00:00:00Z',
    ...patch,
  };
}

function collection(patch: Partial<Collection> = {}): Collection {
  return {
    id: `c${Math.random().toString(36).slice(2, 8)}`,
    name: 'Saint Seiya',
    description: '',
    fields: [],
    groups: [],
    sections: [],
    items: [],
    members: [],
    linkShare: false,
    currency: null,
    ...patch,
  };
}

/** Intl separates symbol and figure with a non-breaking space in pt-BR. */
const normalize = (s: string) => s.replace(/\s/g, ' ').trim();

async function mount(
  opts: {
    collections?: Collection[];
    currency?: CurrencyCode;
    lang?: Lang;
    role?: MemberRole;
  } = {},
) {
  const api = new FakeVaultApi();
  api.collections = opts.collections ?? [];
  api.currency = opts.currency ?? 'BRL';
  api.role = opts.role ?? 'Owner';

  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: VaultApi, useValue: api },
    ],
  });

  TestBed.inject(I18nService).apply(opts.lang ?? 'en');
  await TestBed.inject(VaultStore).load();

  const fixture = TestBed.createComponent(DashboardPage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  return {
    el,
    fixture,
    i18n: TestBed.inject(I18nService),
    recentValues: () =>
      [...el.querySelectorAll('.recent__value')].map(n => normalize(n.textContent ?? '')),
    valueSub: () => normalize(el.querySelectorAll('.stat__sub')[1]?.textContent ?? ''),
    trendIcons: () => el.querySelectorAll('.stat__trend').length,
    empty: () => el.querySelector('.collections ui-empty'),
    emptyTitle: () => el.querySelector('.collections ui-empty .title')?.textContent?.trim(),
  };
}

describe('DashboardPage — what a figure is allowed to claim', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('shows an un-estimated recent item as unknown, not as worthless', async () => {
    // It used to render `sortValue(item) | money`, so an item nobody has
    // estimated read `R$ 0,00` in the money colour — "worthless" rather than
    // "unknown", which is the one thing the data does not say.
    const page = await mount({ collections: [collection({ items: [item()] })] });
    expect(page.recentValues()).toEqual([page.i18n.t('value.none')]);
  });

  it('marks a figure that is really the price paid', async () => {
    // `sortValue` is a sort key and discards `valueIsPaid`, so the ≈ marker for
    // a price-paid substitution was lost as well as the — for an absence.
    const page = await mount({
      collections: [collection({ items: [item({ value: 0, copies: [copy({ price: 85 })] })] })],
    });
    expect(page.recentValues()).toEqual([
      page.i18n.t('value.fromPaid', { value: 'R$85.00' }),
    ]);
  });

  it('renders a real estimate plainly', async () => {
    const page = await mount({
      collections: [collection({ items: [item({ value: 610, copies: [copy({ price: 420 })] })] })],
    });
    expect(page.recentValues()).toEqual(['R$610.00']);
  });
});

describe('DashboardPage — appreciation and currency', () => {
  beforeEach(() => TestBed.resetTestingModule());

  const brl = () =>
    collection({
      currency: null,
      items: [item({ value: 200, copies: [copy({ price: 100 })] })],
    });
  const usd = () =>
    collection({
      name: 'Vinyl',
      currency: 'USD',
      items: [item({ value: 50, copies: [copy({ price: 200 })] })],
    });

  it('reads exactly as it always did with one currency in play', async () => {
    const page = await mount({ collections: [brl()], currency: 'BRL' });
    expect(page.valueSub()).toBe(page.i18n.t('dashboard.appreciationPct', { pct: '100.0' }));
    expect(page.trendIcons()).toBe(1);
  });

  it('never divides one currency by another', async () => {
    // The old reduction summed 100 BRL and 200 USD paid against 200 BRL and
    // 50 USD held and divided, printing `▲ 37.8%` to one decimal place as
    // though it were precise. Being dimensionless is what hid the error.
    const page = await mount({ collections: [brl(), usd()], currency: 'BRL' });

    // The account's own currency, and the line says so — 200/100 in BRL alone.
    expect(page.valueSub()).toBe(
      page.i18n.t('dashboard.appreciationIn', { pct: '100.0', currency: 'BRL' }),
    );
  });

  it('says why rather than printing a number it cannot stand behind', async () => {
    // Two currencies, neither of them the account's: there is no single honest
    // figure to report, so it reports none — and no trend mark either, because
    // there is no direction.
    const page = await mount({
      collections: [usd(), collection({ name: 'Coins', currency: 'EUR', items: [item({ value: 10, copies: [copy({ price: 5 })] })] })],
      currency: 'BRL',
    });
    expect(page.valueSub()).toBe(page.i18n.t('dashboard.appreciationMixed'));
    expect(page.trendIcons()).toBe(0);
  });

  it('says there is no purchase data rather than dividing by zero', async () => {
    const page = await mount({ collections: [collection({ items: [item()] })] });
    expect(page.valueSub()).toBe(page.i18n.t('dashboard.noPurchaseData'));
    expect(page.trendIcons()).toBe(0);
  });
});

describe('DashboardPage — an empty vault', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('tells an editor how to start', async () => {
    const page = await mount({ collections: [], role: 'Owner' });
    expect(page.emptyTitle()).toBe(page.i18n.t('dashboard.empty.title'));
  });

  it('tells a reader why the page is bare, which it used to leave blank', async () => {
    const page = await mount({ collections: [], role: 'Viewer' });
    expect(page.emptyTitle()).toBe(page.i18n.t('dashboard.empty.readOnly.title'));
    // And offers nothing it would be refused.
    expect(page.el.querySelector('.collections ui-empty ui-button')).toBeNull();
  });

  it('offers no empty state once there is a collection', async () => {
    const page = await mount({ collections: [collection()] });
    expect(page.empty()).toBeNull();
  });
});
