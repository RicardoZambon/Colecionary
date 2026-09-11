import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { VaultApi, VersionedCollection, VersionedItem } from '../../../core/api/vault-api';
import {
  Collection,
  GroupNode,
  Item,
  Member,
  MemberRole,
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

  /** What the server says this session may do — the only input `canEdit` has. */
  role: MemberRole = 'Owner';

  /**
   * Hold every item write open, so a test can look at the page *during* one.
   * A write that resolves before the assertion is a write no pending state was
   * ever visible for.
   */
  hold = false;
  private readonly held = new Subject<VersionedItem>();

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
    return this.hold ? this.held : of({ version: FakeVaultApi.VERSION, item });
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
      role: this.role,
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

function item(
  id: string,
  tags: string[],
  copies: Item['copies'] = [],
  /** A photograph is what makes the gallery's action row exist at all. */
  photoIds: string[] = [],
): Item {
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
    photoIds,
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
  /** The session: what the server would allow, and whether writes ever answer. */
  session: { role?: MemberRole; hold?: boolean } = {},
) {
  const api = new FakeVaultApi();
  api.collections = [collection(items)];
  if (session.role) api.role = session.role;
  if (session.hold) api.hold = true;

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
    /** "I own one — add a copy": the wantlist write. */
    markOwned: () => el.querySelector<HTMLButtonElement>('.wantlist button'),
    /** The gallery's ghost row, by label, so the gated one is named not counted. */
    galleryActions: () =>
      [...el.querySelectorAll('.gallery__actions ui-button')].map(b =>
        (b.textContent ?? '').trim(),
      ),
    addPhoto: () => el.querySelector<HTMLButtonElement>('.thumb--add'),
    /**
     * Every action pair in the details column — the count is the point, since
     * one home per action is the fix. Scoped to `.details` because `ui-empty`
     * ships an `.actions` slot of its own and renders in the gallery whenever
     * the item has no photograph.
     */
    actionRows: () => [...el.querySelectorAll('.details .actions')],
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

/**
 * What this page offers, to whom, and while what is in flight.
 *
 * Every write here was behind `canEdit()` except the two that actually write
 * the fastest: "I own one — add a copy" adds a copy, and "Adjust framing"
 * writes the image's focal point. Both were offered to a Viewer and both earned
 * a 403 — the read-only gate reads as broken to the one person it exists for.
 *
 * The role is the only input, and it arrives from `getProfile`, so these mount
 * the page against a session rather than reaching into the store.
 */
describe('ItemPage — write affordances', () => {
  /** A wantlist entry (no copies) with a photograph: both gated controls exist. */
  const WANTED = [item('mother3', [], [], ['img-1'])];

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('offers a Viewer neither of the two writes, and still shows the item', async () => {
    const page = await mount(WANTED, 'mother3', {}, {}, { role: 'Viewer' });

    // The sentence is a fact about the item and stays; only the write goes.
    expect(page.el.querySelector('.wantlist')).not.toBeNull();
    expect(page.markOwned()).toBeNull();

    // Viewing is not writing: "View large" survives on its own.
    expect(page.galleryActions()).toEqual(['View large']);

    expect(page.addPhoto()).toBeNull();
    expect(page.actionRows()).toHaveLength(0);
  });

  it('offers an Editor every one of them', async () => {
    // The other direction, and the one a gate gets wrong silently: refusing the
    // Viewer is worth nothing if it also refuses the Editor.
    const page = await mount(WANTED, 'mother3', {}, {}, { role: 'Editor' });

    expect(page.markOwned()).not.toBeNull();
    expect(page.galleryActions()).toEqual(['View large', 'Adjust framing']);
    expect(page.addPhoto()).not.toBeNull();
    expect(page.actionRows()).toHaveLength(1);
  });

  it('stops offering the wantlist write while its own save is in flight', async () => {
    // A 286-item collection takes ~500ms to PUT, so an undisabled button is a
    // double-click the store refuses with a 412 nobody can act on (rule 20).
    const page = await mount(WANTED, 'mother3', {}, {}, { hold: true });
    const button = page.markOwned()!;
    expect(button.disabled).toBe(false);
    expect(button.textContent?.trim()).toBe('I own one — add a copy');

    button.click();
    page.fixture.detectChanges();

    const during = page.markOwned()!;
    expect(during.disabled).toBe(true);
    expect(during.textContent?.trim()).toBe('Adding…');
  });

  it('stops offering the add-photo control while a write of the collection runs', async () => {
    // Same collection, same version token: the photo write would be refused for
    // the copy write's own change.
    const page = await mount(WANTED, 'mother3', {}, {}, { hold: true });
    expect(page.addPhoto()!.disabled).toBe(false);

    page.markOwned()!.click();
    page.fixture.detectChanges();

    expect(page.addPhoto()!.disabled).toBe(true);
  });

  it('gives the cards real headings and the actions one home, at the top', async () => {
    const page = await mount([item('contra', [], OWNED)], 'contra');
    // Three `ui-section-label`s painted like headings and announced as nothing
    // left a screen reader's heading list one entry long.
    expect([...page.el.querySelectorAll('h1, h2')].map(h => (h.textContent ?? '').trim())).toEqual([
      'contra',
      'Details',
      'Copies · 1',
    ]);

    // One pair, and in the head rather than under four cards.
    expect(page.actionRows()).toHaveLength(1);
    expect(page.el.querySelector('.head .actions')).not.toBeNull();
  });
});
