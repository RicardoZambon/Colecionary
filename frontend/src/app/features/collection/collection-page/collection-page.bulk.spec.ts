import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { VaultApi, VaultConflictError, VersionedCollection, VersionedItem } from '../../../core/api/vault-api';
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
 * The page's bulk-editing and column behaviour.
 *
 * `item-selection.spec.ts` and `bulk-patch.spec.ts` already prove the
 * arithmetic; these are the questions they cannot answer — whether a checkbox
 * reaches the screen, whether a field becomes a column, and above all whether a
 * bulk operation is **one** write.
 */
class FakeVaultApi extends VaultApi {
  collections: Collection[] = [];
  /** Every full-document PUT this page made, in order. */
  updates: Collection[] = [];
  /** Per-item writes, which a bulk operation must never make. */
  itemWrites = 0;
  deletes = 0;
  /** Set to make the next collection PUT be refused. */
  conflict = false;

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
    if (this.conflict) {
      return throwError(() => new VaultConflictError(collection.id, 'someone else saved first'));
    }
    this.updates.push(structuredClone(collection));
    return of({ version: FakeVaultApi.VERSION, collection });
  }
  deleteCollection(): Observable<void> {
    return of(void 0);
  }
  importStoreListing(): Observable<VersionedCollection> {
    return of({ version: FakeVaultApi.VERSION, collection: this.collections[0] });
  }
  upsertItem(_collectionId: string, item: Item): Observable<VersionedItem> {
    this.itemWrites++;
    return of({ version: FakeVaultApi.VERSION, item });
  }
  deleteItem(): Observable<string> {
    this.deletes++;
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

function item(id: string, patch: Partial<Item> = {}): Item {
  return {
    id,
    name: id,
    description: '',
    year: 1975,
    value: 10,
    groupId: 'espanha',
    sectionId: '',
    tags: [],
    img: `${id}.jpg`,
    custom: [],
    copies: [],
    photoIds: [],
    ...patch,
  };
}

/** Espanha declares two fields; Bronze inherits them plus one of its own. */
const GROUPS = [
  group('espanha', {
    fields: [
      { name: 'Número', type: 'number' },
      { name: 'Set', type: 'text' },
    ],
  }),
  group('bronze', { parentId: 'espanha', fields: [{ name: 'Grade', type: 'text' }] }),
];

const SECTIONS: Section[] = [
  { id: 'sBronze', groupId: 'espanha', name: 'Cavaleiros de Bronze', target: null },
];

function collection(patch: Partial<Collection> = {}): Collection {
  return {
    id: 'c1',
    name: 'Saint Seiya',
    description: '',
    groups: GROUPS,
    sections: SECTIONS,
    items: [
      item('seiya', { custom: [{ key: 'Número', value: '1234' }] }),
      item('shiryu', { copies: [copy('s1')] }),
      item('hyoga'),
    ],
    members: [],
    linkShare: false,
    currency: null,
    ...patch,
  };
}

function copy(id: string): Item['copies'][number] {
  return {
    id,
    condition: 'Mint',
    price: 5,
    value: null,
    acquiredOn: null,
    status: 'Keep',
    notes: '',
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
  fixture.componentRef.setInput('g', opts.g ?? 'espanha');
  fixture.componentRef.setInput('v', opts.v ?? 'list');
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;

  const rowBoxes = () =>
    [...el.querySelectorAll<HTMLInputElement>('.list-line .pick input')];
  /**
   * Rows are addressed by name, never by index: the default order is
   * newest-first, every seeded item here has the same (absent) `createdAt`, and
   * the tie-break is alphabetical — so the array order and the screen order
   * deliberately disagree.
   */
  const rowFor = (name: string) =>
    [...el.querySelectorAll<HTMLElement>('.list-line')].find(
      row => (row.querySelector('.name')?.textContent ?? '').trim() === name,
    );
  const boxFor = (name: string) =>
    rowFor(name)?.querySelector<HTMLInputElement>('.pick input') ?? null;
  const fieldCellsFor = (name: string) =>
    [...(rowFor(name)?.querySelectorAll('.fieldcell') ?? [])].map(n =>
      (n.textContent ?? '').trim(),
    );
  const headBox = () => el.querySelector<HTMLInputElement>('.list-head .pick input')!;
  const bar = () => el.querySelector('app-bulk-bar');
  const barCount = () => (el.querySelector('.bar__count')?.textContent ?? '').trim();
  const headings = () =>
    [...el.querySelectorAll('.list-head .list-cells > *')].map(n =>
      (n.textContent ?? '').replace(/[↑↓]/g, '').trim(),
    );

  const click = (node: HTMLElement | null) => {
    node?.click();
    fixture.detectChanges();
  };

  /**
   * Lets a write settle. `whenStable()` is not enough on its own: these handlers
   * await plain promises, which a zoneless app knows nothing about, so the
   * assertions would run against the DOM as it was before the save returned.
   */
  const flush = async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
  };

  return {
    api,
    el,
    fixture,
    rowBoxes,
    rowFor,
    boxFor,
    fieldCellsFor,
    headBox,
    bar,
    barCount,
    headings,
    click,
    flush,
  };
}

describe('CollectionPage — bulk editing', () => {
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

  it('shows no bar until something is selected', async () => {
    const page = await mount();
    expect(page.bar()).toBeNull();
    expect(page.rowBoxes()).toHaveLength(3);
  });

  it('puts a checkbox beside every row and counts what is ticked', async () => {
    const page = await mount();
    page.click(page.boxFor('seiya'));
    expect(page.bar()).not.toBeNull();
    expect(page.barCount()).toBe('1 item selected');

    page.click(page.boxFor('hyoga'));
    expect(page.barCount()).toBe('2 items selected');
  });

  it('selects every visible row from the header, and clears from it', async () => {
    const page = await mount();
    page.click(page.headBox());
    expect(page.barCount()).toBe('3 items selected');
    page.click(page.headBox());
    expect(page.bar()).toBeNull();
  });

  it('keeps the selection through a filter change, counting only what shows', async () => {
    const page = await mount();
    page.click(page.headBox());
    expect(page.barCount()).toBe('3 items selected');

    // Only 'shiryu' has a copy, and it is Mint.
    page.fixture.componentRef.setInput('cond', 'Mint');
    page.fixture.detectChanges();
    expect(page.barCount()).toBe('1 item selected');

    // Widening restores the rest: the stored set was never pruned.
    page.fixture.componentRef.setInput('cond', undefined);
    page.fixture.detectChanges();
    expect(page.barCount()).toBe('3 items selected');
  });

  it('deletes the selection in ONE full-document write, never per item', async () => {
    const page = await mount();
    page.click(page.boxFor('seiya'));
    page.click(page.boxFor('hyoga'));

    // The bar asks; the dialog confirms, and says how many.
    page.click(page.el.querySelector<HTMLElement>('app-bulk-bar ui-button[variant="danger"] button'));
    const dialog = page.el.querySelector('ui-dialog');
    expect(dialog).not.toBeNull();
    expect((dialog!.querySelector('.panel__title')?.textContent ?? '').trim()).toBe(
      'Delete 2 items?',
    );
    const confirm = dialog!.querySelector<HTMLElement>(
      '.panel__actions ui-button[variant="danger"] button',
    );
    expect((confirm?.textContent ?? '').trim()).toBe('Delete 2 items');

    page.click(confirm);
    await page.flush();

    expect(page.api.updates).toHaveLength(1);
    expect(page.api.updates[0].items.map(i => i.id)).toEqual(['shiryu']);
    expect(page.api.deletes).toBe(0);
    expect(page.api.itemWrites).toBe(0);
    // Done means done: the bar goes away.
    expect(page.bar()).toBeNull();
  });

  it('dismissing the delete dialog means nothing happened', async () => {
    const page = await mount();
    page.click(page.boxFor('seiya'));
    page.click(page.el.querySelector<HTMLElement>('app-bulk-bar ui-button[variant="danger"] button'));
    page.click(page.el.querySelector<HTMLElement>('ui-dialog .scrim'));

    expect(page.el.querySelector('ui-dialog')).toBeNull();
    expect(page.api.updates).toHaveLength(0);
    // The selection is still there — the dialog was a question, not a step.
    expect(page.barCount()).toBe('1 item selected');
  });

  it('applies a field edit in one write, and keeps the selection on a conflict', async () => {
    const page = await mount();
    page.click(page.boxFor('seiya'));
    page.click(page.boxFor('shiryu'));

    page.api.conflict = true;
    // Reach past the UI for the patch itself; the draft plumbing is the bar's
    // own business, and what matters here is what the page does with it.
    const component = page.fixture.componentInstance as unknown as {
      applyBulk(patch: { year?: string }): Promise<void>;
    };
    await component.applyBulk({ year: '1986' });
    page.fixture.detectChanges();

    expect(page.api.updates).toHaveLength(0);
    // Nothing was written, so nothing may be forgotten either.
    expect(page.barCount()).toBe('2 items selected');

    page.api.conflict = false;
    await component.applyBulk({ year: '1986' });
    page.fixture.detectChanges();

    expect(page.api.updates).toHaveLength(1);
    // The array keeps its order — manual order *is* that order — so the two
    // edited items are the first and second entries, not the first two rows.
    expect(page.api.updates[0].items.map(i => `${i.id}:${i.year}`)).toEqual([
      'seiya:1986',
      'shiryu:1986',
      'hyoga:1975',
    ]);
    expect(page.api.itemWrites).toBe(0);
  });
});

describe('CollectionPage — field columns', () => {
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

  it('renders the declared fields as columns, between Cond and Value', async () => {
    const page = await mount();
    expect(page.headings()).toEqual([
      'Name',
      'Group',
      'Year',
      'Copies',
      'Cond',
      'Número',
      'Set',
      'Value',
    ]);
  });

  it('renders every inherited field, not only the nearest one', async () => {
    // Restricting the columns would make one vanish while the sort menu on the
    // same screen still offered its ordering.
    const page = await mount({ g: 'bronze' });
    expect(page.headings()).toEqual([
      'Name',
      'Group',
      'Year',
      'Copies',
      'Cond',
      'Número',
      'Set',
      'Grade',
      'Value',
    ]);
  });

  it('renders a value it has and an em-dash where it has none', async () => {
    const page = await mount();
    // 'seiya' carries Número 1234 (grouped for the locale) and no Set.
    expect(page.fieldCellsFor('seiya')).toEqual(['1,234', '—']);
    expect(page.fieldCellsFor('hyoga')).toEqual(['—', '—']);
    expect(page.el.querySelectorAll('.fieldcell--empty').length).toBeGreaterThan(0);
  });

  it('hides a column the user turned off, and remembers it', async () => {
    const page = await mount();
    const component = page.fixture.componentInstance as unknown as {
      toggleColumn(change: { name: string; visible: boolean }): void;
    };
    component.toggleColumn({ name: 'Set', visible: false });
    page.fixture.detectChanges();

    expect(page.headings()).not.toContain('Set');
    // Stored as *hidden* names, per collection and group, so a field declared
    // later is visible by default.
    expect(localStorage.getItem('vault.cols.c1.espanha')).toBe('["Set"]');
  });

  it('shows the row count and the list total in the footer', async () => {
    const page = await mount();
    expect((page.el.querySelector('.list-foot__count')?.textContent ?? '').trim()).toBe('3 rows');
    // One copy at $5 paid, standing in for an estimate nobody entered — the
    // whole footer goes through the same `ownedValue` the rows do.
    expect((page.el.querySelector('.list-foot__value')?.textContent ?? '').trim()).toBe('$10.00');
  });

  it('draws a no-photo state in the grid, never the filename', async () => {
    // `img` used to be printed raw on a striped tile for every photo-less
    // item — a debug line, in English, on the primary browsing surface.
    const page = await mount({ v: 'grid' });
    expect(page.el.textContent).not.toContain('seiya.jpg');
    expect(page.el.querySelectorAll('.item-card__nophoto')).toHaveLength(3);
    expect(page.el.querySelector('.item-card__nophoto')?.getAttribute('aria-label')).toBe(
      'No photo yet',
    );
  });

  it('offers the same selection in the grid as in the table', async () => {
    const page = await mount({ v: 'grid' });
    const box = page.el.querySelector<HTMLInputElement>('.item-card__pick input');
    page.click(box);
    expect((page.el.querySelector('.bar__count')?.textContent ?? '').trim()).toBe(
      '1 item selected',
    );
  });

  it('finds an item by a custom field value from the search box', async () => {
    const page = await mount();
    TestBed.inject(VaultStore).query.set('1234');
    page.fixture.detectChanges();
    const names = [...page.el.querySelectorAll('.list-row .name')].map(n =>
      (n.textContent ?? '').trim(),
    );
    expect(names).toEqual(['seiya']);
  });
});
