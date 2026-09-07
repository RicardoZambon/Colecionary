import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    return of({ name: 'Marcus', email: 'm@example.com', initials: 'MC', plan: 'free', role: 'Owner' });
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
    fields: [],
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

async function mount(
  opts: {
    collection?: Collection;
    g?: string;
    v?: string;
    /** `?s=` — the divider the list is narrowed to. */
    s?: string;
    cond?: string;
    own?: string;
    tag?: string;
  } = {},
) {
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
  if (opts.s !== undefined) fixture.componentRef.setInput('s', opts.s);
  if (opts.cond !== undefined) fixture.componentRef.setInput('cond', opts.cond);
  if (opts.own !== undefined) fixture.componentRef.setInput('own', opts.own);
  if (opts.tag !== undefined) fixture.componentRef.setInput('tag', opts.tag);
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const headings = () =>
    [...el.querySelectorAll('app-section-header ui-section-label')].map(n =>
      (n.textContent ?? '').trim(),
    );

  // Scoped past the hero: the header has a compact note of its own when there
  // is nothing to measure, and this is about the list's empty state.
  const empty = () => el.querySelector('.layout__main ui-empty');
  const emptyTitle = () => (empty()?.querySelector('.title')?.textContent ?? '').trim();
  const emptyIcon = () => empty()?.querySelector('ui-icon')?.getAttribute('data-name') ?? null;

  const cardNames = () =>
    [...el.querySelectorAll('.item-card__name')].map(n => (n.textContent ?? '').trim());
  /** The filter row's chips, as [label, isSelected] pairs. */
  const filterChips = () =>
    [...el.querySelectorAll('app-collection-filters .chip')].map(c => ({
      label: (c.textContent ?? '').replace(/\s+/g, ' ').trim(),
      selected: c.classList.contains('chip--selected'),
    }));
  const tagChip = () =>
    [...el.querySelectorAll<HTMLElement>('app-collection-filters .chip')].find(c =>
      (c.textContent ?? '').trim().startsWith('#'),
    ) ?? null;

  const summary = () => el.querySelector('app-browse-summary');
  const summaryCount = () =>
    (summary()?.querySelector('.summary__count')?.textContent ?? '').trim();
  const summaryChips = () =>
    [...(summary()?.querySelectorAll('.summary__state .chip') ?? [])].map(c =>
      (c.textContent ?? '').replace(/\s+/g, ' ').replace('\u00d7', '').trim(),
    );
  const summaryClear = () => summary()?.querySelector<HTMLElement>('ui-button button') ?? null;
  const addTile = () => el.querySelector('.add-tile');

  return {
    el,
    fixture,
    headings,
    empty,
    emptyTitle,
    emptyIcon,
    cardNames,
    filterChips,
    tagChip,
    summary,
    summaryCount,
    summaryChips,
    summaryClear,
    addTile,
  };
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

describe('CollectionPage — the two empty states', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
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

  it('tells an untouched empty collection that it is empty, not that it is filtered', async () => {
    // The bug this pins: one message served both facts, so a collection nobody
    // had filtered was told to "clear search or filters" it had never set —
    // advice that cannot work, in front of a list that is empty for an entirely
    // different reason.
    const page = await mount({ collection: collection({ items: [], sections: [] }), v: 'grid' });

    expect(page.emptyTitle()).toBe('Nothing catalogued here yet');
  });

  it('tells a filtered-to-nothing list that it is the filters', async () => {
    const page = await mount({
      collection: collection({ items: [item('i1', '')], sections: [] }),
      v: 'grid',
      // Nothing in the collection is Mint, so the filter empties the list while
      // the collection itself plainly is not empty.
      cond: 'Mint',
    });

    expect(page.emptyTitle()).toBe('No items match');
  });

  it('offers a way out of the filtered state, and clearing it brings the list back', async () => {
    const page = await mount({
      collection: collection({ items: [item('i1', '')], sections: [] }),
      v: 'grid',
      cond: 'Mint',
    });

    const clear = page.empty()!.querySelector('ui-button button') as HTMLButtonElement;
    expect(clear.textContent!.trim()).toBe('Clear filters');

    // The button navigates rather than mutating a signal, so what this asserts
    // is that the affordance exists and is wired — the params it sends are
    // pinned in browse-params.spec.ts.
    expect(clear.disabled).toBe(false);
  });
});

describe('CollectionPage — the toolbar with nothing to filter', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
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

  it('hides the order, the columns and the view toggles when the scope holds nothing', async () => {
    // Five controls that can only narrow or redraw a list of items, in front of
    // a collection that has none. They were rendered anyway, so a brand-new
    // collection opened onto a bar of dead affordances and no guidance.
    const page = await mount({ collection: collection({ items: [], sections: [] }), v: 'grid' });
    const bar = page.el.querySelector('app-collection-toolbar')!;

    expect(bar.querySelector('.view-toggle')).toBeNull();
    expect(bar.querySelector('.sort-trigger')).toBeNull();
    expect(page.el.querySelector('app-collection-filters')).toBeNull();
  });

  it('keeps the identity row, which is the only thing there that still works', async () => {
    const page = await mount({ collection: collection({ items: [], sections: [] }), v: 'grid' });
    const crumbs = page.el.querySelector('app-group-breadcrumb')!;

    expect(crumbs.querySelector('ui-chip')).not.toBeNull();
    expect(crumbs.querySelector('.manage')).not.toBeNull();
  });

  it('renders the whole bar again as soon as one item exists', async () => {
    const page = await mount({ g: 'espanha', v: 'grid' });
    const bar = page.el.querySelector('app-collection-toolbar')!;

    expect(bar.querySelector('.view-toggle')).not.toBeNull();
    expect(bar.querySelector('.sort-trigger')).not.toBeNull();
    expect(page.el.querySelector('app-collection-filters')).not.toBeNull();
  });
});


describe('CollectionPage — the tag filter', () => {
  /** Three items, two of them tagged `cib` — one of those spelled `CIB`. */
  function tagged(): Collection {
    return collection({
      sections: [],
      items: [
        { ...item('contra', 'espanha'), tags: ['CIB', 'rare'] },
        { ...item('gradius', 'espanha'), tags: ['cib'] },
        { ...item('lifeforce', 'espanha'), tags: ['loose'] },
      ],
    });
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
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

  it('narrows the grid to the items carrying the tag, however either spelled it', async () => {
    const all = await mount({ collection: tagged(), g: 'espanha', v: 'grid' });
    expect(all.cardNames()).toHaveLength(3);

    TestBed.resetTestingModule();
    const filtered = await mount({ collection: tagged(), g: 'espanha', v: 'grid', tag: 'cib' });
    expect(filtered.cardNames().sort()).toEqual(['contra', 'gradius']);
  });

  it('shows the active tag in the filter row, and only when one is set', async () => {
    // Off screen, a filter that narrows the list is indistinguishable from a
    // collection that has gone missing.
    const none = await mount({ collection: tagged(), g: 'espanha', v: 'grid' });
    expect(none.tagChip()).toBeNull();

    TestBed.resetTestingModule();
    const page = await mount({ collection: tagged(), g: 'espanha', v: 'grid', tag: 'cib' });
    const chip = page.tagChip();
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('#cib');
    // Not colour alone: the row is labelled, and the chip names the tag.
    expect(page.el.querySelector('app-collection-filters')!.textContent).toContain('Tag');
  });

  it('clears the tag from the URL when its chip is clicked', async () => {
    const page = await mount({ collection: tagged(), g: 'espanha', v: 'grid', tag: 'cib' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    page.tagChip()!.click();
    page.fixture.detectChanges();

    expect(navigate).toHaveBeenCalled();
    const [, options] = navigate.mock.calls[0] as [unknown[], Record<string, unknown>];
    expect(options['queryParams']).toEqual({ tag: null });
    // A filter replaces the history entry rather than stacking one per toggle.
    expect(options['replaceUrl']).toBe(true);
  });

  it('drops the tag along with the rest when the empty state offers a way out', async () => {
    // Regression guard: an empty state offering "clear filters" while the tag
    // survived would be a dead end wearing the clothes of a way out.
    const page = await mount({
      collection: tagged(),
      g: 'espanha',
      v: 'grid',
      tag: 'loose',
      own: 'owned',
    });
    expect(page.cardNames()).toEqual([]);
    expect(page.empty()).not.toBeNull();

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    page.el.querySelector<HTMLElement>('.layout__main ui-empty ui-button button')!.click();
    page.fixture.detectChanges();

    const [, options] = navigate.mock.calls[0] as [unknown[], Record<string, unknown>];
    expect(options['queryParams']).toMatchObject({ tag: null, cond: null, own: null, s: null });
  });

  it('reads a tag nothing carries as no filter, not as an empty list', async () => {
    // The same choice `readCondition` makes for `Bananas`: a stale or mistyped
    // URL shows the collection, it does not accuse it of being empty.
    const page = await mount({ collection: tagged(), g: 'espanha', v: 'grid', tag: 'bananas' });
    expect(page.cardNames()).toHaveLength(3);
    expect(page.tagChip()).toBeNull();
    expect(page.empty()).toBeNull();
  });
});


/**
 * The main screen's answer to "why am I looking at nine of two hundred?".
 *
 * Everything asserted here used to be absent: the grid never said how many rows
 * it was showing, the hero's ratio was the *unfiltered* total and so contradicted
 * the screen, the `?s=` section filter was represented by nothing but one
 * heading in a slightly different colour, and "Clear filters" existed only
 * inside the zero-result empty state — i.e. only once the filters had hidden
 * everything.
 */
describe('CollectionPage — what the list is showing', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
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

  it('counts the rows on screen against the scope, with no filters at all', async () => {
    const page = await mount({ g: 'espanha', v: 'grid' });
    expect(page.summaryCount()).toBe('3 of 3 items');
    expect(page.summaryChips()).toEqual([]);
    // Nothing to clear, so nothing offering to.
    expect(page.summaryClear()).toBeNull();
  });

  it('names every narrowing in force, the section included, and offers the way out', async () => {
    const page = await mount({ g: 'espanha', v: 'grid', own: 'owned' });

    expect(page.summaryChips()).toEqual(['Status: Owned']);
    expect(page.summaryCount()).toBe('0 of 3 items');
    expect(page.summaryClear()).not.toBeNull();
  });

  it('shows the section filter, which had no representation but a colour', async () => {
    const page = await mount({ g: 'espanha', v: 'grid', s: 'ouro' });
    expect(page.summaryChips()).toEqual(['Section: Cavaleiros de Ouro']);
  });

  it('offers the way out while results remain, not only once the list is empty', async () => {
    // The whole defect: `filtering()` already knew the answer for a non-empty
    // result and nothing consumed it.
    const page = await mount({ g: 'espanha', v: 'grid', s: 'ouro' });
    expect(page.cardNames()).toEqual(['aiolia']);
    expect(page.empty()).toBeNull();
    expect(page.summaryClear()).not.toBeNull();
  });

  it('drops one narrowing from its chip, leaving the others in force', async () => {
    const page = await mount({ g: 'espanha', v: 'grid', own: 'owned', s: 'ouro' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const sectionChip = [
      ...page.el.querySelectorAll<HTMLElement>('app-browse-summary .summary__state .chip'),
    ].find(c => (c.textContent ?? '').includes('Cavaleiros de Ouro'))!;
    sectionChip.click();
    page.fixture.detectChanges();

    const [, options] = navigate.mock.calls[0] as [unknown[], Record<string, unknown>];
    // Only the section, and nothing else nulled with it.
    expect(options['queryParams']).toEqual({ s: null });
  });

  it('announces the change rather than rebuilding the list in silence', async () => {
    // Neither view is inside a live region and ui-empty is deliberately not
    // role=status, which left the page owing an announcement nothing supplied.
    const page = await mount({ g: 'espanha', v: 'grid' });
    const live = page.el.querySelector('app-browse-summary [aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live!.textContent).toContain('3 of 3 items');
  });
});

describe('CollectionPage — one call to action, in the right place', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
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

  it('leaves an empty group one empty state, not a tile plus a panel', async () => {
    // It used to draw a dashed "+ Add item" tile and, directly under it, a
    // bordered panel headed "Nothing catalogued here yet" with its own Add item
    // and Import CSV buttons: the same instruction three times in two boxes.
    const page = await mount({ collection: collection({ items: [], sections: [] }), v: 'grid' });

    expect(page.addTile()).toBeNull();
    expect(page.emptyTitle()).toBe('Nothing catalogued here yet');
  });

  it('does not offer "add item" as the answer to a filtering mistake', async () => {
    const page = await mount({ g: 'espanha', v: 'grid', s: 'ouro' });
    expect(page.cardNames()).toEqual(['aiolia']);
    expect(page.addTile()).toBeNull();
  });

  it('still offers "add another" at the end of an unfiltered list', async () => {
    const page = await mount({ g: 'espanha', v: 'grid' });
    expect(page.addTile()).not.toBeNull();
  });
});

describe('CollectionPage — a condition and "wanted" cannot both be on', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
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

  it('drops the condition in the same navigation that picks Wanted', async () => {
    // A condition matches when some copy is in it; `wanted` matches when there
    // are none. The pair is empty by construction, and the empty state could
    // only say "nothing fits the filters" without saying which two fought.
    const page = await mount({ g: 'espanha', v: 'grid', cond: 'Mint' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const wanted = [
      ...page.el.querySelectorAll<HTMLElement>('app-collection-filters .chip'),
    ].find(c => (c.textContent ?? '').trim() === 'Wanted')!;
    wanted.click();
    page.fixture.detectChanges();

    const [, options] = navigate.mock.calls[0] as [unknown[], Record<string, unknown>];
    expect(options['queryParams']).toEqual({ own: 'wanted', cond: null });
  });

  it('withdraws the condition chips while Wanted is in force, and says why', async () => {
    const page = await mount({ g: 'espanha', v: 'grid', own: 'wanted' });
    const row = page.el.querySelector('app-collection-filters')!;

    expect(row.querySelector('.note')).not.toBeNull();
    // Status chips only — the five condition chips are gone.
    expect([...row.querySelectorAll('.chip')].map(c => c.textContent!.trim())).toEqual([
      'Owned',
      'Wanted',
    ]);
  });
});
