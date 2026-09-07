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
import { I18nService } from '../../../core/i18n';
import { ConfirmService } from '../../../core/state/confirm.service';
import { PhotoUploadService } from '../../../core/state/photo-upload.service';
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
    return of({ name: 'Marcus', email: 'marcus@example.com', initials: 'MC', plan: 'free', role: 'Owner' });
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
  group('bonecos', null, [{ name: 'Series', type: 'text', scope: 'item' }]),
  group('starwars', 'bonecos', [{ name: 'Issue', type: 'number', scope: 'item' }]),
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
    custom: [],
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

function collection(items: Item[], fields: GroupField[] = []): Collection {
  return {
    id: 'c1',
    name: 'Vinyl',
    description: '',
    fields,
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

async function mount(
  opts: {
    g?: string;
    itemId?: string;
    items?: Item[];
    fields?: GroupField[];
    /** Extra overrides, for the tests that need to stand in for a service. */
    providers?: unknown[];
  } = {},
) {
  const api = new FakeVaultApi();
  api.collections = [collection(opts.items ?? [], opts.fields ?? [])];

  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: VaultApi, useValue: api },
      ...((opts.providers ?? []) as never[]),
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
  const descriptionInput = () => el.querySelector('.form textarea') as HTMLTextAreaElement;
  const yearInput = () => el.querySelectorAll('.pair input')[0] as HTMLInputElement;
  const submitButton = () => el.querySelector('.actions ui-button[type=\'submit\'] button, .actions button[type=\'submit\']') as HTMLButtonElement;
  /**
   * The "Unsaved changes" line in the sticky bar — the visible face of
   * `dirty()`. The leading dot is `aria-hidden` decoration, so it is stripped.
   */
  const dirtyLine = () =>
    (el.querySelector('.actions__state')!.textContent ?? '').replace(/[\u25cf\s]+/g, ' ').trim();
  const nameInput = () => el.querySelector('.form ui-text-input input') as HTMLInputElement;
  const valueInput = () => el.querySelectorAll('.pair input')[1] as HTMLInputElement;
  const copyRows = () => [...el.querySelectorAll('.copies__row')] as HTMLElement[];
  const fieldRows = () => [...el.querySelectorAll('.group-fields__row')] as HTMLElement[];
  const fieldNames = () => fieldRows().map(row => row.querySelector('.key')!.textContent!.trim());
  const fieldInput = (name: string) =>
    fieldRows()
      .find(row => row.querySelector('.key')!.textContent!.trim() === name)!
      .querySelector('input') as HTMLInputElement;

  /** The per-copy field inputs of one copy, by the copy's position. */
  const copyFieldInput = (copyIndex: number, name: string) =>
    [
      ...[...el.querySelectorAll('.copies__row')][copyIndex].querySelectorAll<HTMLInputElement>(
        '.copies__custom input',
      ),
    ].find(input => input.getAttribute('aria-label')?.startsWith(name));

  const tagChips = () =>
    [...el.querySelectorAll('ui-tag-input .tag')].map(c => c.textContent!.trim());
  const tagField = () => el.querySelector('ui-tag-input .add__field') as HTMLInputElement;
  const addTag = (value: string) => {
    const field = tagField();
    field.value = value;
    field.dispatchEvent(new Event('input'));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
  };
  const removeTag = (tag: string) => {
    const chip = [...el.querySelectorAll('ui-tag-input .tag')].find(c =>
      (c.textContent ?? '').trim().startsWith(tag),
    )!;
    click(chip.querySelector('.tag__remove')!);
  };

  /**
   * Answers the confirmation a destructive action now raises.
   *
   * Every irreversible act on this page asks first, so a test that clicks one
   * and asserts the result has to say what the user said. Passing `false` is how
   * the cancel path is tested, and it is the more important of the two: a
   * confirmation that cannot be declined is a speed bump, not a safeguard.
   */
  const answerConfirm = async (answer = true) => {
    TestBed.inject(ConfirmService).answer(answer);
    await tick();
    fixture.detectChanges();
  };

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
    descriptionInput,
    yearInput,
    valueInput,
    submitButton,
    dirtyLine,
    copyRows,
    fieldNames,
    fieldInput,
    copyFieldInput,
    answerConfirm,
    tagChips,
    tagField,
    addTag,
    removeTag,
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
    // The copy has a price, so removing it asks — and removing the last copy is
    // exactly the act that moves the item to the wantlist.
    await owned.answerConfirm();
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

  it('edits a copy-scoped field on the copy, and saves it there', async () => {
    // The whole point: two copies of one item, two different values, neither
    // overwriting the other — which an item-level `custom` structurally cannot
    // hold.
    const page = await mount({
      g: 'starwars',
      fields: [{ name: 'Lacre', type: 'text', scope: 'copy' }],
    });
    page.type(page.nameInput(), 'Issue 3');
    page.click(page.el.querySelector('.copies__actions button')!);

    page.type(page.copyFieldInput(0, 'Lacre')!, '82736411');
    page.type(page.copyFieldInput(1, 'Lacre')!, '91002244');
    await page.save();

    expect(page.lastSaved().copies.map(c => c.custom)).toEqual([
      [{ key: 'Lacre', value: '82736411' }],
      [{ key: 'Lacre', value: '91002244' }],
    ]);
    // And it is not offered on the item, where there is only one of it.
    expect(page.fieldNames()).not.toContain('Lacre');
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

describe('ItemFormPage — tags', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('shows the item’s tags and saves one added to them', async () => {
    // The gap this closes: tags were reachable from the bulk bar and nowhere
    // else, so a tag could be applied to forty items at once and never
    // corrected on any one of them.
    const page = await mount({ items: [item({ id: 'i1', tags: ['boxed'], copies: [copy()] })], itemId: 'i1' });

    expect(page.tagChips()).toEqual(['boxed']);

    page.addTag('CIB');
    expect(page.tagChips()).toEqual(['boxed', 'CIB']);

    await page.save();
    expect(page.lastSaved().tags).toEqual(['boxed', 'CIB']);
  });

  it('saves a removal', async () => {
    const page = await mount({
      items: [item({ id: 'i1', tags: ['boxed', 'CIB'], copies: [copy()] })],
      itemId: 'i1',
    });

    page.removeTag('boxed');
    expect(page.tagChips()).toEqual(['CIB']);

    await page.save();
    expect(page.lastSaved().tags).toEqual(['CIB']);
  });

  it('clears the field after committing, so one tag is not added twice', async () => {
    const page = await mount({ items: [item({ id: 'i1', copies: [copy()] })], itemId: 'i1' });

    page.addTag('sealed');
    expect(page.tagField().value).toBe('');
    page.addTag('sealed');
    expect(page.tagChips()).toEqual(['sealed']);
  });

  it('never shows or touches the derived wanted tag', async () => {
    // `wanted` is the copies said twice, and `syncWantedTag` owns it. An item
    // with no copies carries the tag; the editor must not offer to remove it,
    // and the save must not drop it.
    const page = await mount({ items: [item({ id: 'i1', tags: ['wanted'], copies: [] })], itemId: 'i1' });

    expect(page.tagChips()).toEqual([]);

    page.addTag('rare');
    await page.save();

    const saved = page.lastSaved();
    expect(saved.tags).toContain('rare');
    expect(saved.tags).toContain('wanted');
  });

  it('offers the tags already used elsewhere in the collection', async () => {
    const page = await mount({
      items: [
        item({ id: 'i1', tags: [], copies: [copy()] }),
        item({ id: 'i2', tags: ['Boxed'], copies: [copy()] }),
        item({ id: 'i3', tags: ['sealed'], copies: [copy()] }),
      ],
      itemId: 'i1',
    });

    const options = [...page.el.querySelectorAll('ui-tag-input datalist option')].map(o =>
      o.getAttribute('value'),
    );
    expect(options).toEqual(['Boxed', 'sealed']);
  });
});

describe('ItemFormPage — nothing is destroyed without a question', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('keeps the copy when the question is declined', async () => {
    // The half that matters. A confirmation that cannot be declined is a speed
    // bump, not a safeguard.
    const page = await mount({ itemId: 'i1', items: [item({ copies: [copy(), copy({ id: 'cp2' })] })] });
    expect(page.copyRows()).toHaveLength(2);

    page.click(page.copyRows()[0].querySelector('.copies__row-head ui-button button')!);
    await page.answerConfirm(false);

    expect(page.copyRows()).toHaveLength(2);
  });

  it('does not ask about an untouched blank copy', async () => {
    // "Add copy" hands you an empty one. Asking about that would teach people to
    // dismiss the question without reading it, which is how a confirmation
    // stops working.
    const page = await mount({ itemId: 'i1', items: [item({ copies: [copy()] })] });
    page.click(page.el.querySelector('.copies__actions ui-button button')!);
    expect(page.copyRows()).toHaveLength(2);

    // The blank one is last; remove it and expect no question to be pending.
    page.click(page.copyRows()[1].querySelector('.copies__row-head ui-button button')!);
    await tick();
    page.fixture.detectChanges();

    expect(TestBed.inject(ConfirmService).pending()).toBeNull();
    expect(page.copyRows()).toHaveLength(1);
  });
});

describe('ItemFormPage — money the way people type it', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  /**
   * No spec in this file had ever typed a Brazilian decimal separator, which is
   * how the form shipped for a year parsing money with a page-local
   * `parseNumber` that *deleted* commas rather than reading them: `4.200,00`
   * saved as 4.2, `85,50` as 8550, `1.000` as 1. Errors in both directions,
   * silently, on every price and value field — while the CSV importer, reading
   * the same figures through `parseAmount`, got them all right.
   *
   * The pairs are the ones `parseAmount` documents: whichever separator comes
   * last is the decimal point when one or two digits follow it.
   */
  const AMOUNTS: [typed: string, saved: number][] = [
    ['4.200,00', 4200],
    ['4,200.00', 4200],
    ['4200,00', 4200],
    ['85,50', 85.5],
    ['12,5', 12.5],
    ['1.000', 1000],
    ['R$ 1.234,56', 1234.56],
  ];

  it('reads a typed amount the same way the CSV importer does', async () => {
    for (const [typed, saved] of AMOUNTS) {
      TestBed.resetTestingModule();
      const page = await mount({ itemId: 'i1', items: [item({ copies: [copy()] })] });
      page.type(page.nameInput(), 'Cavaleiro de Ouro');
      page.type(page.valueInput(), typed);

      const priceInput = page.copyRows()[0].querySelectorAll('.copies__fields input')[0];
      page.type(priceInput as HTMLInputElement, typed);
      const copyValueInput = page.copyRows()[0].querySelectorAll('.copies__fields input')[1];
      page.type(copyValueInput as HTMLInputElement, typed);

      await page.save();

      expect(page.lastSaved().value, `item value from "${typed}"`).toBe(saved);
      expect(page.lastSaved().copies[0].price, `price paid from "${typed}"`).toBe(saved);
      expect(page.lastSaved().copies[0].value, `copy value from "${typed}"`).toBe(saved);
    }
  });

  it('keeps the year an integer whichever way it is punctuated', async () => {
    const page = await mount();
    page.type(page.nameInput(), 'Cavaleiro de Ouro');
    page.type(page.yearInput(), '1.965');
    await page.save();
    expect(page.lastSaved().year).toBe(1965);
  });
});

describe('ItemFormPage — the leave guard sees every field', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  /**
   * A per-field walk rather than one composite case, and that is the whole
   * point: `snapshot()` is a hand-written list of the draft signals, and `tags`
   * was simply missing from it — so three tags typed into the field left
   * `dirty()` false, the sticky bar silent and the guard agreeing there was
   * nothing to lose. One test per field is what makes the eleventh field's
   * omission fail rather than hide behind the other ten.
   */
  const EDITS: Record<string, (page: Awaited<ReturnType<typeof mount>>) => void> = {
    name: page => page.type(page.nameInput(), 'Renamed'),
    description: page => {
      const box = page.descriptionInput();
      box.value = 'A note';
      box.dispatchEvent(new Event('input'));
      page.fixture.detectChanges();
    },
    tags: page => page.addTag('rare'),
    groupId: page => page.pick(page.groupSelect(), 'marvel'),
    year: page => page.type(page.yearInput(), '1971'),
    value: page => page.type(page.valueInput(), '90'),
    copies: page => page.click(page.el.querySelector('.copies__actions button')!),
    custom: page => page.type(page.fieldInput('Series'), 'Original trilogy'),
  };

  for (const [field, edit] of Object.entries(EDITS)) {
    it(`treats an edit to ${field} as unsaved work`, async () => {
      const page = await mount({
        itemId: 'i1',
        items: [item({ groupId: 'starwars', copies: [copy()] })],
      });
      expect(page.dirtyLine()).toBe('');

      edit(page);

      expect(page.dirtyLine()).toBe(TestBed.inject(I18nService).t('itemForm.unsaved'));
    });
  }

  it('asks through the app’s own dialog, whose buttons say what they do', async () => {
    // The old answer was `window.confirm`, justified on the grounds that a
    // CanDeactivate must answer synchronously — which is not true, and left the
    // reader working out whether "OK" kept their work or threw it away.
    const page = await mount({ itemId: 'i1', items: [item()] });
    expect(page.fixture.componentInstance.confirmLeave()).toBe(true);

    page.type(page.nameInput(), 'Renamed');
    const answer = page.fixture.componentInstance.confirmLeave();
    expect(answer).not.toBe(true);

    expect(TestBed.inject(ConfirmService).pending()).toMatchObject({
      titleKey: 'itemForm.leave.title',
      confirmKey: 'itemForm.leave.discard',
      cancelKey: 'itemForm.leave.keep',
    });

    TestBed.inject(ConfirmService).answer(false);
    await expect(answer).resolves.toBe(false);
  });
});

describe('ItemFormPage — a save never outruns the photos', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  /** Stands in for the shared queue; only `busy` is under test. */
  class BusyUploads {
    busy = () => true;
    queue = () => [];
    failures = () => [];
    add = async () => [];
    dismiss = () => undefined;
    clear = () => undefined;
  }

  it('refuses to save, and says why, while bytes are still going up', async () => {
    // `PhotoUploadService.busy` was documented as the thing pages disable Save
    // on and had no caller anywhere: drop six phone photos, fill in the name,
    // press Salvar item, and you got the item with one photo or none — the rest
    // finished into a component the navigation had destroyed.
    const page = await mount({
      providers: [{ provide: PhotoUploadService, useValue: new BusyUploads() }],
    });
    page.type(page.nameInput(), 'Cavaleiro de Ouro');

    const submit = page.submitButton();
    expect(submit.disabled).toBe(true);
    expect(submit.getAttribute('aria-busy')).toBe('true');
    expect(submit.textContent!.trim()).toBe(
      TestBed.inject(I18nService).t('itemForm.savingPhotos'),
    );

    await page.save();
    expect(page.api.saved).toHaveLength(0);
  });

  it('treats pending uploads as unsaved work, so leaving asks', async () => {
    const page = await mount({
      providers: [{ provide: PhotoUploadService, useValue: new BusyUploads() }],
    });
    // Nothing typed, so the snapshot still matches the baseline — without the
    // uploads in the sum, the guard would not even ask.
    expect(page.fixture.componentInstance.confirmLeave()).not.toBe(true);
    TestBed.inject(ConfirmService).answer(false);
  });
});

describe('ItemFormPage — what refused the save, and where', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('marks the Name field, explains itself there, and puts the caret in it', async () => {
    // The refusal used to be a toast that named no field and moved no focus, on
    // a page where Name can be 900px above the button that refused.
    const page = await mount();
    await page.save();

    const field = page.el.querySelector('.form ui-field')!;
    expect((field.querySelector('.error')!.textContent ?? '').trim()).toBe(
      TestBed.inject(I18nService).t('itemForm.error.nameRequired'),
    );
    expect(page.nameInput().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(page.nameInput());

    // And it clears as soon as the reason is gone, rather than outliving the fix.
    page.type(page.nameInput(), 'Cavaleiro de Ouro');
    expect(page.el.querySelector('.form ui-field .error')).toBeNull();
  });

  it('names the copy it is about to remove, and what is in it', async () => {
    // Six copies of one card are six identical blocks, and the list you would
    // check against is behind the dialog.
    const page = await mount({
      itemId: 'i1',
      items: [item({ copies: [copy(), copy({ id: 'cp2', price: 40 })] })],
    });
    page.click(page.copyRows()[1].querySelector('.copies__row-head ui-button button')!);
    await tick();

    expect(TestBed.inject(ConfirmService).pending()).toMatchObject({
      titleKey: 'confirm.removeCopy.titleAt',
      bodyKey: 'confirm.removeCopy.bodyAt',
      params: { n: 2 },
    });
  });
});

describe('ItemFormPage — a declared field is edited by its declared type', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('gives a date field ui-date-input on the item and inside every copy', async () => {
    // A bare type="date" follows the *browser's* locale and shows mm/dd/yyyy
    // inside a Portuguese UI, which does not fail — it records the wrong date,
    // and the item page then prints it back in the document locale, so the two
    // screens disagree about the same field.
    const page = await mount({
      fields: [
        { name: 'Data do slab', type: 'date', scope: 'item' },
        { name: 'Nota', type: 'text', scope: 'item' },
        { name: 'Data da compra', type: 'date', scope: 'copy' },
      ],
    });

    const row = (name: string) =>
      [...page.el.querySelectorAll('.group-fields__row')].find(
        r => (r.querySelector('.key')!.textContent ?? '').trim() === name,
      )!;

    expect(row('Data do slab').querySelector('ui-date-input')).not.toBeNull();
    expect(row('Data do slab').querySelector('ui-text-input')).toBeNull();
    // The other types still take a text box, which is the honest control for
    // them — this is a branch on the declaration, not a blanket change.
    expect(row('Nota').querySelector('ui-text-input')).not.toBeNull();
    expect(page.copyRows()[0].querySelector('.copies__custom ui-date-input')).not.toBeNull();
  });

  it('says the fields are per copy rather than that there are none', async () => {
    // The card headed "Group fields" used to answer "this group has no custom
    // fields yet" while the field was on screen twelve lines above, inside every
    // copy — which sends the user back to settings to check a declaration that
    // saved perfectly.
    const page = await mount({
      fields: [{ name: 'Nº de série', type: 'text', scope: 'copy' }],
    });
    const i18n = TestBed.inject(I18nService);

    expect((page.el.querySelector('.group-fields__empty')!.textContent ?? '').trim()).toBe(
      i18n.t('itemForm.onlyCopyFields'),
    );
    // And the copy's own fields are headed, so a per-copy value is identifiable
    // without inferring it from position.
    expect(page.copyRows()[0].querySelector('.copies__custom-heading')).not.toBeNull();
  });

  it('names the fields card after the collection when no group declares one', async () => {
    // The collection is the outermost ancestor in `fieldsFor`, so calling the
    // card "Group fields · NO GROUP" told the reader their declaration had
    // landed somewhere it had not.
    const collectionOnly = await mount({
      fields: [{ name: 'Aquisição', type: 'text', scope: 'item' }],
    });
    const i18n = TestBed.inject(I18nService);
    expect(collectionOnly.el.querySelector('.group-fields__heading')!.textContent).toContain(
      i18n.t('itemForm.collectionFieldsName').toUpperCase(),
    );

    TestBed.resetTestingModule();
    const grouped = await mount({ g: 'starwars' });
    expect(grouped.el.querySelector('.group-fields__heading')!.textContent).toContain('starwars'.toUpperCase());
  });
});
