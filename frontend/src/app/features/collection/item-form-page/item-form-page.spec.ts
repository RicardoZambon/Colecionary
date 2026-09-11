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
import { ConfirmService } from '../../../core/state/confirm.service';
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

/**
 * The accessible name a form control would be announced by, or `''`.
 *
 * Deliberately not a full accname implementation — it resolves the four sources
 * a control in this app can take a name from, in the order the algorithm does:
 * `aria-label`, a resolving `aria-labelledby`, an associated `<label>` (by
 * `for=` or by wrapping the control), and `title`.
 */
function accessibleName(control: HTMLElement): string {
  const label = control.getAttribute('aria-label')?.trim();
  if (label) return label;

  const referenced = (control.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map(id => control.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ')
    .trim();
  if (referenced) return referenced;

  // A `ui-field` label is a *sibling* of the control it names, so `closest`
  // finding nothing is exactly the defect this guards: a styled span next to an
  // input is not a label.
  const wrapping = control.closest('label')?.textContent?.trim();
  if (wrapping) return wrapping;

  const id = control.getAttribute('id');
  const associated = id
    ? control.ownerDocument.querySelector('label[for="' + id + '"]')?.textContent?.trim()
    : '';
  if (associated) return associated;

  return control.getAttribute('title')?.trim() ?? '';
}

/** Every control on the page with no accessible name at all, named for the report. */
function unnamedControls(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>('input, select, textarea')]
    .filter(control => !accessibleName(control))
    .map(control => {
      const type = control.getAttribute('type');
      return control.tagName.toLowerCase() + (type ? `[type=${type}]` : '');
    });
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
  opts: { g?: string; itemId?: string; items?: Item[]; fields?: GroupField[] } = {},
) {
  const api = new FakeVaultApi();
  api.collections = [collection(opts.items ?? [], opts.fields ?? [])];

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

  /**
   * Lets the render hooks run.
   *
   * `detectChanges()` alone does not flush them, and the attributes this page
   * puts on the controls inside `ui-text-input`/`ui-textarea` — and the focus it
   * moves — live in an `afterRenderEffect`, exactly like `ui-confirm`'s.
   */
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const save = async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await tick();
    await settle();
  };

  const ownershipRadio = (value: 'owned' | 'wanted') =>
    el.querySelector(`.ownership input[value="${value}"]`) as HTMLInputElement;

  /** Picks an ownership option the way a user does — a real change event. */
  const pickOwnership = (value: 'owned' | 'wanted') => {
    const radio = ownershipRadio(value);
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
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
    copyFieldInput,
    answerConfirm,
    tagChips,
    tagField,
    addTag,
    removeTag,
    settle,
    save,
    ownershipRadio,
    pickOwnership,
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

  it('says why it refused at the field, and puts the caret there', async () => {
    // The refusal used to be a toast in the far corner: nothing marked the
    // field required, nothing pointed at it, and the focus stayed wherever it
    // was — so the reader had to find the one field the message was about.
    const page = await mount();
    await page.save();

    const error = page.el.querySelector('.named__error')!;
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent!.trim()).toBe('Give the item a name before saving.');

    const input = page.nameInput();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(error.id);
    expect(error.id).toBeTruthy();
    expect(document.activeElement).toBe(input);
  });

  it('marks the name required, and says so in the label', async () => {
    const page = await mount();
    // `aria-required`, not the native attribute: `required` hands the browser
    // the submit and its own bubble, which pre-empts the page's own message.
    expect(page.nameInput().getAttribute('aria-required')).toBe('true');
    expect(page.el.querySelector('.named ui-field .label')!.textContent).toContain('required');
  });

  it('validates on submit and not on every keystroke', async () => {
    const page = await mount();
    page.type(page.nameInput(), 'Revolv');
    page.type(page.nameInput(), '');
    // Emptying the field is not itself a failure — nothing has been asked yet.
    expect(page.el.querySelector('.named__error')).toBeNull();

    await page.save();
    expect(page.el.querySelector('.named__error')).not.toBeNull();

    // …and typing takes the message away rather than leaving it to contradict
    // the field it points at.
    page.type(page.nameInput(), 'Revolver');
    await page.settle();
    expect(page.el.querySelector('.named__error')).toBeNull();
    expect(page.nameInput().hasAttribute('aria-invalid')).toBe(false);
    expect(page.nameInput().hasAttribute('aria-describedby')).toBe(false);
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

  it('asks before a switch to the wantlist throws copies away, and obeys a no', async () => {
    // Switching to the wantlist *is* removing every copy, so it asks the same
    // question the copy's own ✕ asks — and a declined question has to put the
    // control back, or the form would show "wantlist" over an item that still
    // has copies and save the copies.
    const page = await mount({ itemId: 'i1', items: [item({ copies: [copy()] })] });
    expect(page.ownershipRadio('owned').checked).toBe(true);

    page.pickOwnership('wanted');
    await page.answerConfirm(false);

    expect(page.copyRows()).toHaveLength(1);
    expect(page.ownershipRadio('owned').checked).toBe(true);
    expect(page.ownershipRadio('wanted').checked).toBe(false);
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

describe('ItemFormPage — ownership is a control, not a side effect', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('reflects the copies rather than storing a flag of its own', async () => {
    // There is no `owned` field to bind to (rule 3): at least one copy means
    // owned, none means wanted. So the control has to move when the copies do.
    const page = await mount({ itemId: 'i1', items: [item({ copies: [copy()] })] });
    expect(page.ownershipRadio('owned').checked).toBe(true);

    page.click(page.copyRows()[0].querySelector('.copies__row-head ui-button button')!);
    await page.answerConfirm();

    expect(page.ownershipRadio('wanted').checked).toBe(true);

    page.click(page.el.querySelector('.copies__actions ui-button button')!);
    expect(page.ownershipRadio('owned').checked).toBe(true);
  });

  it('puts a blank copy back when the item returns to the vault', async () => {
    const page = await mount({ itemId: 'i1', items: [item({ tags: ['wanted'], copies: [] })] });
    expect(page.ownershipRadio('wanted').checked).toBe(true);
    expect(page.copyRows()).toHaveLength(0);

    page.pickOwnership('owned');
    expect(page.copyRows()).toHaveLength(1);

    page.type(page.nameInput(), 'Revolver');
    await page.save();
    expect(page.lastSaved().copies).toHaveLength(1);
    expect(page.lastSaved().tags).not.toContain('wanted');
  });

  it('empties the copies without a question when none of them holds anything', async () => {
    // A fresh item's single copy is blank, and a question in front of an act
    // that costs nothing is a question people learn to dismiss unread.
    const page = await mount();
    page.pickOwnership('wanted');

    expect(TestBed.inject(ConfirmService).pending()).toBeNull();
    expect(page.copyRows()).toHaveLength(0);

    page.type(page.nameInput(), 'Grail');
    await page.save();
    expect(page.lastSaved().copies).toHaveLength(0);
    expect(page.lastSaved().tags).toContain('wanted');
  });
});

describe('ItemFormPage — every control has a name', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('names every input, select, textarea and date field on the page', async () => {
    // Eight controls had no accessible name at all, because every visible label
    // here is a `ui-field` <label> with no `for` sitting *beside* its control —
    // a styled span, which names nothing. Measured, not assumed: the assertion
    // lists whatever is still unnamed.
    const page = await mount({
      g: 'starwars',
      itemId: 'i1',
      items: [item({ copies: [copy(), copy({ id: 'cp2' })] })],
      fields: [{ name: 'Lacre', type: 'text', scope: 'copy' }],
    });
    await page.settle();

    expect(unnamedControls(page.el)).toEqual([]);
    // And the count is not zero because there is nothing to count.
    expect(page.el.querySelectorAll('input, select, textarea').length).toBeGreaterThan(8);
  });

  it('leaves nothing unnamed on the add-item page either', async () => {
    // The page exactly as `/c/:id/items/new` renders it — one copy, no declared
    // fields — which is where the eight unnamed controls were measured in a
    // real browser: name, description, group, year, est. value, and the copy's
    // paid, est. value and notes.
    const page = await mount();
    await page.settle();

    expect(unnamedControls(page.el)).toEqual([]);
  });

  it('gives the page a document outline instead of one lonely h1', async () => {
    const page = await mount();
    const headings = [...page.el.querySelectorAll('h1, h2, h3')].map(h => h.tagName);

    expect(headings.filter(tag => tag === 'H1')).toHaveLength(1);
    // Summary, Copies, Group fields — each of which was a div that only looked
    // like a heading, so a screen reader's heading list was one entry long.
    expect(headings.filter(tag => tag === 'H2').length).toBeGreaterThanOrEqual(3);
  });

  it('states the value fallbacks as hints, where they survive being typed over', async () => {
    const page = await mount();
    const hints = [...page.el.querySelectorAll('.form ui-field .hint')].map(h =>
      h.textContent!.trim(),
    );

    expect(hints).toContain('Leave empty and the item is worth what you paid for it.');
    expect(hints).toContain(
      'Leave empty to follow the item estimate, or what this copy cost.',
    );
    // A placeholder disappears exactly when the reader starts typing, and the
    // copy one was cut off mid-word in its column.
    const placeholders = [...page.el.querySelectorAll('.form input')].map(
      input => input.getAttribute('placeholder') ?? '',
    );
    expect(placeholders.some(text => text.includes('uses what you paid'))).toBe(false);
    expect(placeholders.some(text => text.includes('uses item value'))).toBe(false);
  });

  it('draws the unsaved mark as an icon rather than a Unicode glyph', async () => {
    const page = await mount();
    page.type(page.nameInput(), 'Revolver');

    const state = page.el.querySelector('.actions__state')!;
    expect(state.querySelector('ui-icon svg')).not.toBeNull();
    expect(state.textContent).not.toContain('\u25CF');
  });

  it('prints the expected date order once — ui-date-input already owns it', async () => {
    // The component derives the order from Intl and wires it to its own
    // aria-describedby; a second copy in the form would be the same fact twice.
    const page = await mount({ itemId: 'i1', items: [item({ copies: [copy()] })] });
    const acquired = page.copyRows()[0].querySelector('ui-date-input')!;
    const dateInput = acquired.querySelector('input')!;

    expect(acquired.querySelectorAll('.hint')).toHaveLength(1);
    expect(dateInput.getAttribute('aria-describedby')).toBe(
      acquired.querySelector('.hint')!.id,
    );
    // Once in the whole copy row: the component's, and no second copy printed
    // by the form beside it.
    const printed = page.copyRows()[0].textContent!.match(/mm\/dd\/yyyy/g) ?? [];
    expect(printed).toHaveLength(1);
  });
});
