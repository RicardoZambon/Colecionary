import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { VaultApi, VersionedCollection, VersionedItem } from '../../../core/api/vault-api';
import {
  Collection,
  GroupNode,
  Item,
  Member,
  Section,
  StoreListing,
  TenantSettings,
  UserProfile,
} from '../../../core/models';
import { I18nService } from '../../../core/i18n';
import { VaultStore } from '../../../core/state/vault.store';
import { CollectionPage } from './collection-page';

/**
 * The page, not the pure helpers.
 *
 * `sections.util.spec.ts` already proves the list is cut into the right runs;
 * this is the question that spec cannot answer — whether a heading actually
 * reaches the screen, and whether a collection with no sections still renders
 * exactly the flat grid it always did.
 */
class FakeVaultApi extends VaultApi {
  collections: Collection[] = [];

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
    return of({ defaultCurrency: 'USD' });
  }
  updateTenantSettings(settings: TenantSettings): Observable<TenantSettings> {
    return of(settings);
  }
  getProfile(): Observable<UserProfile> {
    return of({ name: 'Marcus', email: 'm@example.com', initials: 'MC', plan: 'free' });
  }
  updateProfile(profile: UserProfile): Observable<UserProfile> {
    return of(profile);
  }
}

function group(id: string, patch: Partial<GroupNode> = {}): GroupNode {
  return { id, name: id, parentId: null, fields: [], sort: null, target: null, ...patch };
}

function item(id: string, groupId: string, sectionId = ''): Item {
  return {
    id,
    name: id,
    description: '',
    year: 1975,
    value: 10,
    groupId,
    sectionId,
    tags: [],
    img: `${id}.jpg`,
    custom: [],
    copies: [],
    photoIds: [],
  };
}

/** Bronze → Prata → Ouro: the order the alphabet gets wrong. */
const SECTIONS: Section[] = [
  { id: 'bronze', groupId: 'espanha', name: 'Cavaleiros de Bronze', target: 10 },
  { id: 'prata', groupId: 'espanha', name: 'Cavaleiros de Prata', target: null },
  { id: 'ouro', groupId: 'espanha', name: 'Cavaleiros de Ouro', target: null },
];

function collection(patch: Partial<Collection> = {}): Collection {
  return {
    id: 'c1',
    name: 'Saint Seiya',
    description: '',
    groups: [group('espanha')],
    sections: SECTIONS,
    items: [
      item('aiolia', 'espanha', 'ouro'),
      item('seiya', 'espanha', 'bronze'),
      item('loose', 'espanha'),
    ],
    members: [],
    linkShare: false,
    currency: null,
    ...patch,
  };
}

async function mount(opts: { collection?: Collection; g?: string; v?: string } = {}) {
  const api = new FakeVaultApi();
  api.collections = [opts.collection ?? collection()];

  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: VaultApi, useValue: api },
    ],
  });

  TestBed.inject(I18nService).apply('en');
  await TestBed.inject(VaultStore).load();

  const fixture = TestBed.createComponent(CollectionPage);
  fixture.componentRef.setInput('collectionId', 'c1');
  if (opts.g !== undefined) fixture.componentRef.setInput('g', opts.g);
  if (opts.v !== undefined) fixture.componentRef.setInput('v', opts.v);
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const headings = () =>
    [...el.querySelectorAll('app-section-header ui-section-label')].map(n =>
      (n.textContent ?? '').trim(),
    );

  return { el, fixture, headings };
}

describe('CollectionPage — sections', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    // jsdom implements no media queries, and the page asks one on first render
    // to decide whether the tree panel starts open. Reporting "wide" keeps the
    // layout deterministic; nothing here depends on the answer.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: true,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
  });

  it('renders a heading per section, in the arranged order, with the leftovers last', async () => {
    const page = await mount({ g: 'espanha' });

    expect(page.headings()).toEqual([
      'Cavaleiros de Bronze',
      'Cavaleiros de Prata',
      'Cavaleiros de Ouro',
      'No section',
    ]);
  });

  it('keeps a section nobody filled visible, so it can be filled', async () => {
    // "Cavaleiros de Prata" holds nothing. Invisible, it could never be used.
    const page = await mount({ g: 'espanha' });
    expect(page.headings()).toContain('Cavaleiros de Prata');
  });

  it('shows each run against its own declared size', async () => {
    const page = await mount({ g: 'espanha' });
    const bronze = page.el.querySelector('app-section-header .sec__ratio');
    expect((bronze?.textContent ?? '').trim()).toBe('0 / 10');
  });

  it('puts the items under the right headings, in section order', async () => {
    const page = await mount({ g: 'espanha' });
    const names = [...page.el.querySelectorAll('.item-card__name')].map(n =>
      (n.textContent ?? '').trim(),
    );
    // 'aiolia' is first in the array but sits in the last run.
    expect(names).toEqual(['seiya', 'aiolia', 'loose']);
  });

  it('renders no heading at all for a group that declares none', async () => {
    // The flat grid, exactly as before sections existed.
    const page = await mount({
      collection: collection({ sections: [], items: [item('seiya', 'espanha')] }),
      g: 'espanha',
    });
    expect(page.headings()).toEqual([]);
    expect(page.el.querySelectorAll('.item-card')).toHaveLength(1);
  });

  it('renders headings in the table view too', async () => {
    const page = await mount({ g: 'espanha', v: 'list' });
    expect(page.headings()).toContain('Cavaleiros de Bronze');
  });

  it('shows no heading at the collection root, where no group is open', async () => {
    // A section divides one group's list; at the root there is no group.
    const page = await mount({ v: 'grid' });
    expect(page.headings()).toEqual([]);
  });
});
