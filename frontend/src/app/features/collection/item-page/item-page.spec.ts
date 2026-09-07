import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { ConfirmService } from '../../../core/state/confirm.service';
import { ImageFocusService } from '../../../core/state/image-focus.service';
import { PhotoUploadService } from '../../../core/state/photo-upload.service';
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

/**
 * Drives the file picker `addPhoto` builds on the fly.
 *
 * That element never enters the document — it is created, wired and clicked
 * inside one method — so `createElement` is the only seam there is. Call this
 * before the control is pressed, then call what it returns with the ids the
 * upload queue would have produced.
 */
function pickFile(fixture: ComponentFixture<ItemPage>) {
  const create = document.createElement.bind(document);
  let picker: HTMLInputElement | null = null;
  const spy = vi
    .spyOn(document, 'createElement')
    .mockImplementation(((tag: string, options?: ElementCreationOptions) => {
      const made = create(tag as 'input', options);
      if (tag === 'input') picker = made as HTMLInputElement;
      return made;
    }) as typeof document.createElement);

  return async (ids: string[]) => {
    spy.mockRestore();
    vi.spyOn(TestBed.inject(PhotoUploadService), 'add').mockResolvedValue(ids);
    Object.defineProperty(picker!, 'files', {
      value: [new File([new Uint8Array(2)], 'front.png', { type: 'image/png' })],
    });
    await picker!.onchange!(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
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
    // "Nothing earlier" rather than "Start": the back slot used to name a
    // destination that is not an item and does not exist.
    expect(names).toEqual([
      TestBed.inject(I18nService).t('item.browse.noEarlier'),
      'c',
    ]);

    // Without the tag, 'b' sits between them.
    TestBed.resetTestingModule();
    const all = await mount(items, 'a', { g: 'retro', sort: 'name' });
    const unfiltered = [...all.el.querySelectorAll('.browse__name')].map(n =>
      (n.textContent ?? '').trim(),
    );
    expect(unfiltered).toEqual([
      TestBed.inject(I18nService).t('item.browse.noEarlier'),
      'b',
    ]);
  });
});

describe('ItemPage — the arrows do not fire through an overlay', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  /**
   * Three failures with one cause, and no keyboard test in this file at all
   * until now.
   *
   * `ItemPage` binds a **document**-level keydown, and its only stand-downs
   * were form controls and the thumbnail strip. None of the three overlays
   * matches either: the framing editor and the confirmation are rendered from
   * the shell, and the photo viewer's own document listener is registered
   * *after* this one because it is a child of this template. So a nudge of the
   * focal point also stepped to the next item, → in the viewer advanced the
   * photo and the item together, and ← with the delete confirmation open
   * navigated away and then deleted an item nobody could see.
   */
  const arrow = (el: HTMLElement, key: 'ArrowLeft' | 'ArrowRight') =>
    el.querySelector('h1')!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

  const openPage = async () => {
    const items = [
      item('a', [], OWNED),
      item('b', [], OWNED),
      item('c', [], OWNED),
    ];
    items[1].photoIds = ['p1', 'p2'];
    const page = await mount(items, 'b', { g: 'retro', sort: 'name' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    return { ...page, navigate };
  };

  it('steps to the neighbour when nothing covers the page', async () => {
    const page = await openPage();
    arrow(page.el, 'ArrowRight');
    expect(page.navigate).toHaveBeenCalledWith(['/c', 'c1', 'items', 'c'], expect.anything());
  });

  it('stands down while the photo viewer is open', async () => {
    const page = await openPage();
    (page.el.querySelector('.gallery__main--photo') as HTMLElement).click();
    page.fixture.detectChanges();

    arrow(page.el, 'ArrowRight');
    expect(page.navigate).not.toHaveBeenCalled();
  });

  it('stands down while the framing editor is open', async () => {
    const page = await openPage();
    void TestBed.inject(ImageFocusService).frame('p1', 'item');
    page.fixture.detectChanges();

    arrow(page.el, 'ArrowLeft');
    expect(page.navigate).not.toHaveBeenCalled();
  });

  it('stands down while a confirmation is open', async () => {
    const page = await openPage();
    void TestBed.inject(ConfirmService).ask({
      titleKey: 'item.delete.confirm.title',
      bodyKey: 'item.delete.confirm.body',
      confirmKey: 'item.delete.confirm.ok',
    });
    page.fixture.detectChanges();

    arrow(page.el, 'ArrowLeft');
    expect(page.navigate).not.toHaveBeenCalled();
    TestBed.inject(ConfirmService).answer(false);
  });
});

describe('ItemPage — one copy is not a list', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('does not restate the hero four times over for a single copy', async () => {
    // On the overwhelmingly common case the same figure appeared four times and
    // the "1 copy · paid … · est. …" line restated the row directly above it
    // word for word, which reads as though something is wrong with the page.
    const page = await mount([item('contra', [], OWNED)], 'contra');
    expect(page.el.querySelector('.copies')).toBeNull();
    expect(page.el.querySelector('.copies__total')).toBeNull();
    // And "Est. value / copy" in DETAILS is the hero figure divided by one.
    const keys = [...page.el.querySelectorAll('.fields .field-row .key')].map(k =>
      (k.textContent ?? '').trim(),
    );
    const i18n = TestBed.inject(I18nService);
    expect(keys).not.toContain(i18n.t('item.valuePerCopy'));
    expect(keys).not.toContain(i18n.t('item.valuePaidPerCopy'));
  });

  it('still shows a single copy that carries something the hero cannot', async () => {
    const dated = item('contra', [], [{ ...OWNED[0], acquiredOn: '2024-03-11' }]);
    const page = await mount([dated], 'contra');
    expect(page.el.querySelector('.copies')).not.toBeNull();
    // The badge, the price paid and the estimate are the hero's job.
    expect(page.el.querySelector('.copy-row ui-badge')).toBeNull();
    expect(page.el.querySelector('.copy-row__date')).not.toBeNull();
    // A summary line over one row would say what the row says.
    expect(page.el.querySelector('.copies__total')).toBeNull();
  });

  it('keeps the card and the summary from two copies up', async () => {
    const two = item('contra', [], [OWNED[0], { ...OWNED[0], id: 'cp2' }]);
    const page = await mount([two], 'contra');
    expect(page.el.querySelectorAll('.copy-row')).toHaveLength(2);
    expect(page.el.querySelector('.copy-row ui-badge')).not.toBeNull();
    expect(page.el.querySelector('.copies__total')).not.toBeNull();
  });
});

describe('ItemPage — the page is not a dead end', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('makes the group row a real link into the group', async () => {
    // "what else is in this group?" is the most natural next question from an
    // item, and it was plain text.
    const page = await mount([item('contra', [], OWNED)], 'contra', { g: 'retro' }, { g: 'retro' });
    const link = page.el.querySelector<HTMLAnchorElement>('.fields .field-row a');
    expect(link).not.toBeNull();
    const href = link!.getAttribute('href') ?? '';
    expect(new URLSearchParams(href.slice(href.indexOf('?'))).get('g')).toBe('retro');
  });

  it('offers a way out of an item that is not there', async () => {
    // A stale link used to land on one grey sentence with nothing else on it,
    // while the missing-*collection* branch fifteen lines below did offer a way
    // out.
    const page = await mount([item('contra', [], OWNED)], 'gone');
    const empty = page.el.querySelector('ui-empty');
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toContain(TestBed.inject(I18nService).t('item.notFound'));
    expect(empty!.querySelector('[emptyActions] button')).not.toBeNull();
  });
});

describe('ItemPage — the keyboard keeps its place across a photo edit', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  /**
   * Both halves of the photo flow destroy the button that was pressed.
   *
   * With no photo the frame *is* the add control, so the first upload replaces
   * it with the photograph; "Remove the photo" only renders while there is one,
   * so removing the last detaches it — and even with photos left it spends the
   * write disabled, which the browser treats the same way. In every case focus
   * fell to `<body>` and the next Tab restarted at the skip link. The
   * confirmation dialog does restore focus to its opener, correctly, but the
   * opener went away with the photo it belonged to.
   */
  const photographed = (ids: string[]) => {
    const it = item('contra', [], OWNED);
    it.photoIds = ids;
    return it;
  };

  it('lands on the mark it just added, not on the body', async () => {
    const page = await mount([photographed([])], 'contra');
    // The empty frame is the add control, and it is what focus starts on.
    const frame = page.el.querySelector<HTMLElement>('.gallery__main--empty')!;
    frame.focus();
    expect(document.activeElement).toBe(frame);

    // The picker is created and clicked programmatically, so the file arrives
    // by driving the element the component made rather than one in the DOM.
    const picked = pickFile(page.fixture);
    frame.click();
    await picked(['p-new']);

    expect(document.activeElement).not.toBe(document.body);
    expect((document.activeElement as HTMLElement).dataset['photoId']).toBe('p-new');
  });

  /**
   * Pins the branch rather than the fall to `<body>`: with a synchronous fake
   * API the dialog's own restore happens to land on a button that is still
   * connected, so what this can prove is that the successor chosen is "remove"
   * again and not the frame. In the browser the same press spends the write
   * `disabled`, which drops focus exactly as a detach does.
   */
  it('stays on "remove" while there is still something to remove', async () => {
    const page = await mount([photographed(['p1', 'p2'])], 'contra');
    const remove = page.el.querySelector<HTMLElement>('.gallery__remove button')!;
    remove.focus();
    remove.click();
    TestBed.inject(ConfirmService).answer(true);
    await page.fixture.whenStable();
    page.fixture.detectChanges();
    await page.fixture.whenStable();

    expect(document.activeElement).toBe(page.el.querySelector('.gallery__remove button'));
  });

  it('falls back to the frame when the last photo goes', async () => {
    const page = await mount([photographed(['p1'])], 'contra');
    page.el.querySelector<HTMLElement>('.gallery__remove button')!.click();
    TestBed.inject(ConfirmService).answer(true);
    await page.fixture.whenStable();
    page.fixture.detectChanges();
    await page.fixture.whenStable();

    // Which by then is the add control again, so the flow can be repeated
    // without a traversal of the page.
    const frame = page.el.querySelector('.gallery__main--empty');
    expect(frame).not.toBeNull();
    expect(document.activeElement).toBe(frame);
  });
});
