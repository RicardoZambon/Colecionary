import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { VaultApi, VersionedCollection, VersionedItem } from '../../../core/api/vault-api';
import {
  Collection,
  GroupNode,
  Item,
  Member,
  StoreListing,
  TenantSettings,
  UserProfile,
} from '../../../core/models';
import { I18nService } from '../../../core/i18n';
import { VaultStore } from '../../../core/state/vault.store';
import { WANTED_TAG } from '../../../core/utils/tags.util';
import { ItemPage } from './item-page';

/**
 * The tags on an open item, as links.
 *
 * `browse-params.spec.ts` proves `?tag=` parses and `browse.util.spec.ts` proves
 * it filters; neither can answer the question that made the feature worth
 * building — whether a tag on the page is something a person can actually click,
 * and whether the URL it points at is the one the collection page will parse
 * back into the same filter.
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
    return of({
      name: 'Marcus',
      email: 'marcus@example.com',
      initials: 'MC',
      plan: 'free',
      role: 'Owner',
    });
  }
  updateProfile(profile: UserProfile): Observable<UserProfile> {
    return of(profile);
  }
}

/** Something for the test router to be *at*, so a merged link has a URL to merge with. */
@Component({ template: '' })
class Blank {}

function group(id: string): GroupNode {
  return { id, name: id, parentId: null, fields: [], sort: null, target: null };
}

function item(id: string, tags: string[], copies: Item['copies'] = []): Item {
  return {
    id,
    name: id,
    description: '',
    year: 1988,
    value: 10,
    groupId: 'retro',
    sectionId: '',
    tags,
    img: '',
    custom: [],
    copies,
    photoIds: [],
  };
}

const OWNED: Item['copies'] = [
  {
    id: 'cp1',
    condition: 'Good',
    price: 40,
    value: null,
    acquiredOn: null,
    status: 'Keep',
    notes: '',
    custom: [],
  },
];

function collection(items: Item[]): Collection {
  return {
    id: 'c1',
    name: 'Retro',
    description: '',
    fields: [],
    groups: [group('retro')],
    sections: [],
    items,
    members: [],
    linkShare: false,
    currency: null,
  };
}

async function mount(
  items: Item[],
  itemId: string,
  params: Record<string, string> = {},
  /** Query params to put on the router's current URL, for the merge to pick up. */
  url: Record<string, string> = {},
) {
  const api = new FakeVaultApi();
  api.collections = [collection(items)];

  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', component: Blank }]),
      { provide: VaultApi, useValue: api },
    ],
  });

  TestBed.inject(I18nService).apply('en');
  await TestBed.inject(VaultStore).load();
  if (Object.keys(url).length) {
    await TestBed.inject(Router).navigate(['/c', 'c1', 'items', itemId], { queryParams: url });
  }

  const fixture = TestBed.createComponent(ItemPage);
  fixture.componentRef.setInput('collectionId', 'c1');
  fixture.componentRef.setInput('itemId', itemId);
  for (const [name, value] of Object.entries(params)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const chips = () => [...el.querySelectorAll<HTMLAnchorElement>('.tags ui-chip a')];
  return {
    el,
    fixture,
    chips,
    labels: () => chips().map(a => (a.textContent ?? '').trim()),
    hrefs: () => chips().map(a => a.getAttribute('href')),
  };
}

describe('ItemPage — tags', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders one real link per tag, so middle-click and new-tab work', async () => {
    // Regression: these were mono text in a <div> and measured zero links.
    const page = await mount([item('contra', ['CIB', 'boxed'], OWNED)], 'contra');
    expect(page.labels()).toEqual(['#CIB', '#boxed']);
    expect(page.chips()).toHaveLength(2);
  });

  it('points each tag at the collection with ?tag= carrying that exact tag', async () => {
    const page = await mount([item('contra', ['CIB'], OWNED)], 'contra');
    // The tag travels as typed — the filter compares ignoring case, and
    // rewriting it here would make the URL disagree with the chip.
    expect(page.hrefs()).toEqual(['/c/c1?tag=CIB']);
  });

  it('carries the list the item was opened from into the filtered URL', async () => {
    // The chip merges the query string, so a tag click narrows *this* list
    // rather than restarting from the whole collection. The merge is against
    // the router's current URL, which is why the test navigates first.
    const page = await mount(
      [item('contra', ['boxed'], OWNED)],
      'contra',
      { g: 'retro', cond: 'Good' },
      { g: 'retro', cond: 'Good' },
    );
    const href = page.hrefs()[0] ?? '';
    expect(href.startsWith('/c/c1?')).toBe(true);
    const query = new URLSearchParams(href.slice(href.indexOf('?')));
    expect(query.get('tag')).toBe('boxed');
    expect(query.get('g')).toBe('retro');
    expect(query.get('cond')).toBe('Good');
  });

  it('offers no chip for the derived wanted tag', async () => {
    // Nobody applied it and nobody may remove it, and `readTag` refuses it — a
    // chip for it would navigate to no filter at all.
    const page = await mount([item('mother3', [WANTED_TAG, 'import'])], 'mother3');
    expect(page.labels()).toEqual(['#import']);
  });

  it('renders no tag row at all when there are no tags to show', async () => {
    const page = await mount([item('bare', [], OWNED)], 'bare');
    expect(page.el.querySelector('.tags')).toBeNull();
  });

  it('steps through the tag-filtered list, not the whole group', async () => {
    // `?tag=` is one of the params the arrows rebuild the list from, so the
    // neighbour of a tagged item is the next *tagged* item.
    const items = [
      item('a', ['rare'], OWNED),
      item('b', [], OWNED),
      item('c', ['rare'], OWNED),
    ];
    const filtered = await mount(items, 'a', { g: 'retro', sort: 'name', tag: 'rare' });
    const names = [...filtered.el.querySelectorAll('.browse__name')].map(n =>
      (n.textContent ?? '').trim(),
    );
    expect(names).toEqual(['Start', 'c']);

    // Without the tag, 'b' sits between them.
    TestBed.resetTestingModule();
    const all = await mount(items, 'a', { g: 'retro', sort: 'name' });
    const unfiltered = [...all.el.querySelectorAll('.browse__name')].map(n =>
      (n.textContent ?? '').trim(),
    );
    expect(unfiltered).toEqual(['Start', 'b']);
  });
});
