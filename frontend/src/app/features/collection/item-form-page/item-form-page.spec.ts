import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  VaultApi,
  VaultConflictError,
  VersionedCollection,
  VersionedItem,
} from '../../../core/api/vault-api';
import {
  Collection,
  GroupField,
  GroupNode,
  Item,
  ItemCopy,
  Member,
  StoreListing,
  TenantSettings,
  UserProfile,
} from '../../../core/models';
import { ConflictService } from '../../../core/state/conflict.service';
import { VaultStore } from '../../../core/state/vault.store';
import { UNGROUPED_ID } from '../../../core/utils/group-stats.util';
import { ItemFormPage } from './item-form-page';

/**
 * The backend contract answered from memory. Only `listCollections` and
 * `upsertItem` carry the assertions; the rest exist because `VaultStore.load()`
 * asks for them at startup, and because the abstract class is the DI token —
 * there is no mock API in the app itself (rule 9).
 */
class FakeVaultApi extends VaultApi {
  collections: Collection[] = [];
  /** Every item the form asked the API to persist, in order. */
  readonly saved: { collectionId: string; item: Item }[] = [];
  /** Set to have the server refuse the next save the way a stale tab is refused. */
  refuseNextSave = false;

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
  importStoreListing(): Observable<VersionedCollection> {
    return of(this.versioned(structuredClone(this.collections[0])));
  }
  upsertItem(collectionId: string, item: Item): Observable<VersionedItem> {
    this.saved.push({ collectionId, item: structuredClone(item) });
    if (this.refuseNextSave) {
      this.refuseNextSave = false;
      return throwError(() => new VaultConflictError(collectionId, 'Someone saved first.'));
    }
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

function group(id: string, parentId: string | null = null, fields: GroupField[] = []): GroupNode {
  return { id, name: id, parentId, fields, sort: null, target: null };
}

/** `starwars` inherits `Series` from `bonecos` and declares `Issue` itself. */
const GROUPS = [
  group('bonecos', null, [{ name: 'Series', type: 'text' }]),
  group('starwars', 'bonecos', [{ name: 'Issue', type: 'number' }]),
  group('marvel', 'bonecos'),
];

function copy(patch: Partial<ItemCopy> = {}): ItemCopy {
  return {
    id: 'cp1',
    condition: 'Good',
    price: 40,
    value: null,
    acquiredOn: null,
    status: 'Keep',
    notes: '',
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

function collection(items: Item[]): Collection {
  return {
    id: 'c1',
    name: 'Vinyl',
    description: '',
    groups: structuredClone(GROUPS),
    sections: [],
    items,
    members: [],
    linkShare: false,
    currency: null,
  };
}

/** The fake resolves synchronously, so one macrotask drains a save. */
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function mount(opts: { g?: string; itemId?: string; items?: Item[] } = {}) {
  const api = new FakeVaultApi();
  api.collections = [collection(opts.items ?? [])];

  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: VaultApi, useValue: api },
    ],
  });

  await TestBed.inject(VaultStore).load();
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

  const fixture = TestBed.createComponent(ItemFormPage);
  fixture.componentRef.setInput('collectionId', 'c1');
  if (opts.itemId !== undefined) fixture.componentRef.setInput('itemId', opts.itemId);
  if (opts.g !== undefined) fixture.componentRef.setInput('g', opts.g);
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;

  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const pick = (select: HTMLSelectElement, value: string) => {
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  const click = (target: Element) => {
    (target as HTMLElement).click();
    fixture.detectChanges();
  };

  const groupSelect = () => el.querySelector('.pair select') as HTMLSelectElement;
  const nameInput = () => el.querySelector('.form ui-text-input input') as HTMLInputElement;
  const valueInput = () => el.querySelectorAll('.pair input')[1] as HTMLInputElement;
  const copyRows = () => [...el.querySelectorAll('.copies__row')] as HTMLElement[];
  const fieldRows = () => [...el.querySelectorAll('.group-fields__row')] as HTMLElement[];
  const fieldNames = () => fieldRows().map(row => row.querySelector('.key')!.textContent!.trim());
  const fieldInput = (name: string) =>
    fieldRows()
      .find(row => row.querySelector('.key')!.textContent!.trim() === name)!
      .querySelector('input') as HTMLInputElement;

  const save = async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await tick();
    fixture.detectChanges();
  };

  return {
    api,
    el,
    fixture,
    navigate,
    type,
    pick,
    click,
    groupSelect,
    nameInput,
    valueInput,
    copyRows,
    fieldNames,
    fieldInput,
    save,
    /** The item handed to the API by the last save. */
    lastSaved: () => api.saved[api.saved.length - 1].item,
  };
}

describe('ItemFormPage', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  // --- which group an item is filed in (rule 4) ---

  it('opens a new item on the group the ?g= carried in', async () => {
    const page = await mount({ g: 'starwars' });
    expect(page.groupSelect().value).toBe('starwars');
  });

  it('collapses a blank, the unfiled sentinel and a deleted group to no group', async () => {
    // `UNGROUPED_ID` is a key to read by, never a value to store — and a group
    // deleted since the link was built must not become a selection the picker
    // cannot show. The picker alone cannot prove this: a `<select>` with no
    // matching option reads back as '' whatever the component holds, so what
    // gets *saved* is the assertion that matters.
    for (const g of ['', UNGROUPED_ID, 'a-group-that-was-deleted']) {
      TestBed.resetTestingModule();
      const page = await mount({ g });
      expect(page.groupSelect().value).toBe('');

      page.type(page.nameInput(), 'Anything');
      await page.save();
      expect(page.lastSaved().groupId).toBe('');
    }
  });

  it('opens an edited item on its own group, and on none when that group is gone', async () => {
    const filed = await mount({ itemId: 'i1', items: [item({ groupId: 'marvel' })] });
    expect(filed.groupSelect().value).toBe('marvel');

    TestBed.resetTestingModule();
    const orphaned = await mount({ itemId: 'i1', items: [item({ groupId: 'gone' })] });
    expect(orphaned.groupSelect().value).toBe('');
    await orphaned.save();
    expect(orphaned.lastSaved().groupId).toBe('');
  });

  it('saves the group the form ended on, not the one it started from', async () => {
    const page = await mount({ g: 'starwars' });
    page.type(page.nameInput(), 'Boba Fett');
    page.pick(page.groupSelect(), 'marvel');
    await page.save();

    expect(page.lastSaved().groupId).toBe('marvel');
    // And it returns you to the group the item actually went into — `?g=` would
    // be the one view the new item is not in. The ad-hoc order is dropped
    // because every group declares its own.
    expect(page.navigate).toHaveBeenCalledWith(
      ['/c', 'c1'],
      expect.objectContaining({ queryParams: { g: 'marvel', sort: null, dir: null, s: null } }),
    );
  });

  it('drops ?g= entirely for an item left unfiled', async () => {
    const page = await mount({ g: 'starwars' });
    page.type(page.nameInput(), 'Loose figure');
    page.pick(page.groupSelect(), '');
    await page.save();

    expect(page.lastSaved().groupId).toBe('');
    expect(page.navigate).toHaveBeenCalledWith(
      ['/c', 'c1'],
      expect.objectContaining({ queryParams: { g: null, sort: null, dir: null, s: null } }),
    );
  });

  // --- copies, ownership and the value chain (rule 3) ---

  it('starts a new item with one copy, since adding what you own is the common case', async () => {
    const page = await mount();
    expect(page.copyRows()).toHaveLength(1);
  });

  it('keeps a copy value of null distinct from a copy valued at zero', async () => {
    // Null means "inherit the item's estimate"; 0 is a figure someone typed.
    // Collapsing them would silently overwrite the inherited value.
    const page = await mount({ itemId: 'i1', items: [item({ copies: [copy({ value: null })] })] });
    const copyValue = page.copyRows()[0].querySelectorAll('.copies__fields input')[1];

    expect((copyValue as HTMLInputElement).value).toBe('');
    await page.save();
    expect(page.lastSaved().copies[0].value).toBeNull();

    page.type(copyValue as HTMLInputElement, '0');
    await page.save();
    expect(page.lastSaved().copies[0].value).toBe(0);
  });

  it('shows an un-estimated item as blank rather than as a zero, and saves it back as 0', async () => {
    // `value === 0` is the model's only way to say "never estimated"; rendering
    // it as a figure invites keeping a number nobody entered.
    const page = await mount({ itemId: 'i1', items: [item({ value: 0 })] });
    expect(page.valueInput().value).toBe('');

    await page.save();
    expect(page.lastSaved().value).toBe(0);
  });

  it('syncs the wanted tag with the copies in both directions', async () => {
    const owned = await mount({ itemId: 'i1', items: [item({ copies: [copy()] })] });
    owned.click(owned.copyRows()[0].querySelector('.copies__row-head ui-button button')!);
    await owned.save();

    expect(owned.lastSaved().copies).toHaveLength(0);
    expect(owned.lastSaved().tags).toContain('wanted');

    TestBed.resetTestingModule();
    const wanted = await mount({ itemId: 'i1', items: [item({ tags: ['wanted'] })] });
    wanted.click(wanted.el.querySelector('.copies__actions ui-button button')!);
    await wanted.save();

    expect(wanted.lastSaved().copies).toHaveLength(1);
    expect(wanted.lastSaved().tags).not.toContain('wanted');
  });

  // --- custom fields (rule 4) ---

  it('offers every field on the ancestor path, and only those', async () => {
    const page = await mount({ g: 'starwars' });
    expect(page.fieldNames()).toEqual(['Series', 'Issue']);
    // The declared type reaches the input; the value itself stays a string.
    expect(page.fieldInput('Issue').type).toBe('number');

    page.pick(page.groupSelect(), 'marvel');
    expect(page.fieldNames()).toEqual(['Series']);
  });

  it('saves only the declared fields that were actually filled in', async () => {
    const page = await mount({ g: 'starwars' });
    page.type(page.nameInput(), 'Issue 3');
    page.type(page.fieldInput('Series'), 'Original trilogy');
    await page.save();

    expect(page.lastSaved().custom).toEqual([{ key: 'Series', value: 'Original trilogy' }]);
  });

  // --- photos (rule 7) ---

  it('persists the photo order, so the cover is whichever id ends up first', async () => {
    const page = await mount({ itemId: 'i1', items: [item({ photoIds: ['p1', 'p2'] })] });
    const secondPhotoUp = page.el
      .querySelectorAll('.photo')[1]
      .querySelectorAll('ui-reorder button')[0];

    page.click(secondPhotoUp);
    await page.save();

    expect(page.lastSaved().photoIds).toEqual(['p2', 'p1']);
  });

  // --- guard rails ---

  it('refuses to save an item with no name', async () => {
    const page = await mount();
    await page.save();
    expect(page.api.saved).toHaveLength(0);
  });

  it('keeps a refused save on screen instead of navigating away with it', async () => {
    const page = await mount();
    page.type(page.nameInput(), 'Revolver');
    page.api.refuseNextSave = true;

    await page.save();

    // The form is the only copy of what was typed. Navigating on a refusal
    // would carry the user off to a list that does not contain their item and
    // leave them no way back to it.
    expect(page.navigate).not.toHaveBeenCalled();
    expect(page.nameInput().value).toBe('Revolver');

    // And the conflict is surfaced rather than swallowed: it reaches the shell's
    // notice, which is what says "nothing was saved" and offers a way on.
    expect(TestBed.inject(ConflictService).pending()).toEqual({
      collectionId: 'c1',
      message: 'Someone saved first.',
    });

    // The same save works once the collection is back in sync.
    await page.save();
    expect(page.navigate).toHaveBeenCalled();
    expect(page.api.saved.at(-1)!.item.name).toBe('Revolver');
  });
});
