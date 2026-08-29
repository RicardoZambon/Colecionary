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
} from '../../../core/api/vault-api';
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
import { CollectionSettingsPage } from './collection-settings-page';

class FakeVaultApi extends VaultApi {
  collections: Collection[] = [];
  /** Every full-document PUT the page issued, in order. */
  readonly puts: Collection[] = [];

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
    this.puts.push(structuredClone(collection));
    return of(this.versioned(collection));
  }
  deleteCollection(): Observable<void> {
    return of(void 0);
  }
  importStoreListing(): Observable<VersionedCollection> {
    return of(this.versioned(structuredClone(this.collections[0])));
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
}

function group(id: string, patch: Partial<GroupNode> = {}): GroupNode {
  return { id, name: id, parentId: null, fields: [], sort: null, target: null, ...patch };
}

function item(id: string, groupId: string): Item {
  return {
    id,
    name: id,
    description: '',
    year: 1997,
    value: 0,
    groupId,
    tags: [],
    img: `${id}.jpg`,
    custom: [],
    copies: [],
    photoIds: [],
  };
}

function collection(patch: Partial<Collection> = {}): Collection {
  return {
    id: 'c1',
    name: 'Vinyl',
    description: '',
    groups: [group('zeta'), group('beta')],
    items: [],
    members: [],
    linkShare: false,
    currency: null,
    ...patch,
  };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function mount(opts: { collection?: Collection; tab?: string; g?: string } = {}) {
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
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

  const fixture = TestBed.createComponent(CollectionSettingsPage);
  fixture.componentRef.setInput('collectionId', 'c1');
  fixture.componentRef.setInput('tab', opts.tab ?? 'general');
  if (opts.g !== undefined) fixture.componentRef.setInput('g', opts.g);
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;

  const pick = (select: HTMLSelectElement, value: string) => {
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const click = (target: Element) => {
    (target as HTMLElement).click();
    fixture.detectChanges();
  };

  /** "Done" flushes the debounced save immediately, so nothing waits 400 ms. */
  const done = async () => {
    click(el.querySelector('.done-row ui-button button')!);
    await tick();
    fixture.detectChanges();
  };

  const rows = () => [...el.querySelectorAll('.group-row')] as HTMLElement[];
  const rowNames = () =>
    rows().map(row => (row.querySelector('.rename input') as HTMLInputElement).value);
  const byLabel = (aria: string) =>
    el.querySelector(`[aria-label="${aria}"]`) as HTMLInputElement & HTMLSelectElement;

  return {
    api,
    el,
    fixture,
    navigate,
    pick,
    type,
    click,
    done,
    rows,
    rowNames,
    byLabel,
    /** The document the last save sent to the API. */
    lastPut: () => api.puts[api.puts.length - 1],
  };
}

describe('CollectionSettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  // --- currency override (rule 7) ---

  it('spells "follow the account" as null, and can get back to it', async () => {
    // Null is the only way the model says "no override", and the collection is
    // saved as a full-document PUT — so resolving it to a code on write would
    // pin the collection to whatever the account happened to read in that day.
    const page = await mount();
    const currency = page.el.querySelector('.general ui-select select') as HTMLSelectElement;
    expect(currency.value).toBe('');

    page.pick(currency, 'BRL');
    await page.done();
    expect(page.lastPut().currency).toBe('BRL');

    page.pick(currency, '');
    await page.done();
    expect(page.lastPut().currency).toBeNull();
  });

  // An unrecognised code reaching `setCurrency` is not reachable through the
  // picker — a `<select>` refuses a value no option carries — so that narrowing
  // is pinned where it lives, in `currency.util.spec.ts`.

  // --- group target (rule 4) ---

  it('keeps "no target declared" as null through every non-target input', async () => {
    const page = await mount({
      collection: collection({ groups: [group('zeta', { target: 120 })] }),
      tab: 'groups',
    });
    const target = page.byLabel('Target for zeta');
    expect(target.value).toBe('120');

    for (const raw of ['', '0', '-3', 'abc']) {
      page.type(target, raw);
      await page.done();
      // Null, never undefined: a field left undefined round-trips through the
      // full-document PUT as a deletion.
      expect(page.lastPut().groups[0].target).toBeNull();
      expect('target' in page.lastPut().groups[0]).toBe(true);
    }

    page.type(target, '24');
    await page.done();
    expect(page.lastPut().groups[0].target).toBe(24);
  });

  it('starts a new group with the nullable fields present and null', async () => {
    const page = await mount({ tab: 'groups' });
    page.click(page.el.querySelector('.groups-card__head ui-button button')!);
    page.type(page.el.querySelector('.new-group__input') as HTMLInputElement, 'Alpha');
    page.el
      .querySelector('.new-group__input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    page.fixture.detectChanges();
    await page.done();

    const added = page.lastPut().groups.find(g => g.name === 'Alpha')!;
    expect(added).toMatchObject({ parentId: null, fields: [], sort: null, target: null });
  });

  // --- ordering (rule 4) ---

  it('spells "inherit the ordering" as null', async () => {
    const page = await mount({
      collection: collection({ groups: [group('zeta', { sort: { by: 'name', direction: 'asc' } })] }),
      tab: 'groups',
    });
    const orderBy = page.byLabel('Order the items in zeta by');
    expect(orderBy.value).toBe('name');

    page.pick(orderBy, 'inherit');
    await page.done();
    expect(page.lastPut().groups[0].sort).toBeNull();
  });

  it('drops an ordering that pointed at a field being removed', async () => {
    // A sort naming a field nobody declares any more silently reads as
    // "everything missing" — it has to go with the field.
    const page = await mount({
      collection: collection({
        groups: [
          group('zeta', {
            fields: [{ name: 'Issue', type: 'number' }],
            sort: { by: 'field:Issue', direction: 'asc' },
          }),
        ],
      }),
      tab: 'groups',
    });

    page.click(page.el.querySelector('[aria-label="Remove field Issue"]')!);
    await page.done();

    expect(page.lastPut().groups[0].fields).toEqual([]);
    expect(page.lastPut().groups[0].sort).toBeNull();
  });

  // --- listing and renaming groups (rule 4) ---

  it('lists groups alphabetically rather than in the order they were created', async () => {
    const page = await mount({ tab: 'groups' });
    expect(page.rowNames()).toEqual(['beta', 'zeta']);
  });

  it('freezes the row order while a rename is being typed, and releases it on blur', async () => {
    // An alphabetical list re-sorts on every keystroke, and moving the focused
    // input in the DOM blurs it — renaming "zeta" to "alpha" would end after
    // the first letter.
    const page = await mount({ tab: 'groups' });
    const zeta = page.el.querySelectorAll('.rename input')[1] as HTMLInputElement;

    page.type(zeta, 'alpha');
    expect(page.rowNames()).toEqual(['beta', 'alpha']);

    zeta.dispatchEvent(new Event('blur'));
    page.fixture.detectChanges();
    expect(page.rowNames()).toEqual(['alpha', 'beta']);
  });

  it('will not remove a group that still holds items, anywhere in its subtree', async () => {
    const page = await mount({
      collection: collection({
        groups: [group('zeta'), group('child', { parentId: 'zeta' })],
        items: [item('i1', 'child')],
      }),
      tab: 'groups',
    });

    page.click(page.el.querySelector('[aria-label="Remove zeta"]')!);
    await page.done();

    expect(page.lastPut().groups.map(g => g.id)).toEqual(['zeta', 'child']);
  });
});
