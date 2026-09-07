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
import { UNGROUPED_ID } from '../../../core/utils/group-stats.util';
import { ConfirmService } from '../../../core/state/confirm.service';
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
    return of({ name: 'Marcus', email: 'marcus@example.com', initials: 'MC', plan: 'free', role: 'Owner' });
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
    sectionId: '',
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
    fields: [],
    groups: [group('zeta'), group('beta')],
    sections: [],
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

  /** "Done" flushes the debounced save immediately, so nothing waits 400 ms. */
  const done = async () => {
    click(el.querySelector('.done-row ui-button button')!);
    await tick();
    fixture.detectChanges();
  };

  /** The tree on the left: one row per group, at any depth. */
  const rows = () => [...el.querySelectorAll('.pick')] as HTMLElement[];
  const rowNames = () => rows().map(row => (row.textContent ?? '').replace(/\d+$/, '').trim());
  /** The editor on the right, for whatever the tree has selected. */
  const detail = () => el.querySelector('.groups-split__detail') as HTMLElement;
  /** The deletion confirmation, when one is open. */
  const dialog = () => el.querySelector('app-group-delete-dialog');
  /** Its three dispositions, in the order they are offered. */
  const dispositions = () =>
    [...el.querySelectorAll('app-group-delete-dialog input[type="radio"]')] as HTMLInputElement[];
  const choose = (index: number) => {
    const radio = dispositions()[index];
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const dialogButtons = () =>
    [...el.querySelectorAll('app-group-delete-dialog .panel__actions button')] as HTMLElement[];
  /** The destructive action; the first button cancels. */
  const confirmButton = () => dialogButtons()[dialogButtons().length - 1] as HTMLButtonElement;
  /** The two-step move: the preview's confirm, and its escape hatch. */
  const moveButtons = () =>
    [...el.querySelectorAll('.move-preview__actions button')] as HTMLElement[];
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
    answerConfirm,
    rows,
    rowNames,
    detail,
    dialog,
    dispositions,
    choose,
    dialogButtons,
    confirmButton,
    moveButtons,
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

  // --- currency override (rule 8) ---

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
      g: 'zeta',
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

  // --- fields declared by the collection (rule 22) ---

  it('declares a field for the whole collection, not for a group', async () => {
    const page = await mount({ tab: 'groups' });
    const card = page.el.querySelector('.collection-fields')!;

    page.click(card.querySelector('ui-button button')!);
    page.fixture.detectChanges();
    const input = card.querySelector('.field-input') as HTMLInputElement;
    page.type(input, 'Prateleira');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    page.fixture.detectChanges();
    await page.done();

    expect(page.lastPut().fields).toEqual([
      { name: 'Prateleira', type: 'text', scope: 'item' },
    ]);
    // And no group grew a copy of it — that is the whole difference.
    expect(page.lastPut().groups.every(g => g.fields.length === 0)).toBe(true);
  });

  it('drops an ordering that pointed at a field being moved to copy scope', async () => {
    // Same reasoning as removing the field: `keyOf` reads only `item.custom`,
    // so the sort would not fail, it would rank every item as valueless and
    // re-sort the group alphabetically with nothing on screen to say why.
    const page = await mount({
      collection: collection({
        groups: [
          group('zeta', {
            fields: [{ name: 'Issue', type: 'number', scope: 'item' }],
            sort: { by: 'field:Issue', direction: 'asc' },
          }),
        ],
      }),
      tab: 'groups',
      g: 'zeta',
    });

    page.pick(page.byLabel('What field Issue describes'), 'copy');
    await page.done();

    expect(page.lastPut().groups[0].fields).toEqual([
      { name: 'Issue', type: 'number', scope: 'copy' },
    ]);
    expect(page.lastPut().groups[0].sort).toBeNull();
  });

  // --- ordering (rule 4) ---

  it('spells "inherit the ordering" as null', async () => {
    const page = await mount({
      collection: collection({ groups: [group('zeta', { sort: { by: 'name', direction: 'asc' } })] }),
      tab: 'groups',
      g: 'zeta',
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
            fields: [{ name: 'Issue', type: 'number', scope: 'item' }],
            sort: { by: 'field:Issue', direction: 'asc' },
          }),
        ],
      }),
      tab: 'groups',
      g: 'zeta',
    });

    page.click(page.el.querySelector('[aria-label="Remove field Issue"]')!);
    await page.answerConfirm();
    await page.done();

    expect(page.lastPut().groups[0].fields).toEqual([]);
    expect(page.lastPut().groups[0].sort).toBeNull();
  });

  // --- listing and renaming groups (rule 4) ---

  it('lists groups alphabetically rather than in the order they were created', async () => {
    const page = await mount({ tab: 'groups' });
    expect(page.rowNames()).toEqual(['beta', 'zeta']);
  });

  it('renames without the tree taking the focused field with it', async () => {
    // This used to need a frozen row order: the name lived inside the same
    // alphabetical list it sorted, so every keystroke moved the focused input
    // in the DOM and blurred it — renaming "zeta" to "alpha" ended after the
    // first letter. The split is what removed the need, so the field must
    // survive the tree re-sorting under it.
    const page = await mount({ tab: 'groups', g: 'zeta' });
    const name = page.detail().querySelector('.rename input') as HTMLInputElement;

    page.type(name, 'alpha');

    expect(page.rowNames()).toEqual(['alpha', 'beta']);
    expect(page.detail().querySelector('.rename input')).toBe(name);
    expect((page.detail().querySelector('.rename input') as HTMLInputElement).value).toBe('alpha');
  });

  // --- moving a group to another parent (a picker, never a drag) ---

  /** Revistas ▸ Marvel ▸ Ultimate, plus Bonecos as a foreign destination. */
  const shelf = () =>
    collection({
      groups: [
        group('revistas', { fields: [{ name: 'Editora', type: 'text', scope: 'item' }] }),
        group('marvel', { parentId: 'revistas' }),
        group('ultimate', { parentId: 'marvel' }),
        group('bonecos'),
      ],
      items: [
        { ...item('spidey', 'marvel'), custom: [{ key: 'Editora', value: 'Panini' }] },
        { ...item('xmen', 'ultimate'), custom: [{ key: 'Editora', value: 'Abril' }] },
      ],
    });

  it('never offers itself or its own descendants as a parent', async () => {
    // The decisive reason a move is a select and not a drop target: a list can
    // leave out what it cannot accept, so there is nothing to reject after the
    // gesture — and nothing to explain.
    const page = await mount({ collection: shelf(), tab: 'groups', g: 'marvel' });
    const picker = page.byLabel('Parent group of marvel');

    const values = [...picker.options].map(o => o.value);
    expect(values).not.toContain('marvel');
    expect(values).not.toContain('ultimate');
    expect(values).toContain('revistas');
    expect(values).toContain('bonecos');
    // The leading entry is "no parent", and a group id is never blank.
    expect(values[0]).toBe('');
  });

  it('says what the move changes before it changes anything', async () => {
    const page = await mount({ collection: shelf(), tab: 'groups', g: 'marvel' });
    page.pick(page.byLabel('Parent group of marvel'), 'bonecos');

    const preview = page.el.querySelector('.move-preview')!;
    // Both items in the subtree hold an Editora value, and Bonecos does not
    // declare that field.
    expect(preview.textContent).toContain('Editora');
    expect(preview.textContent).toContain('2');
    // Nothing has been saved yet.
    expect(page.api.puts).toHaveLength(0);
  });

  it('leaves the group where it is when the preview is declined', async () => {
    const page = await mount({ collection: shelf(), tab: 'groups', g: 'marvel' });
    page.pick(page.byLabel('Parent group of marvel'), 'bonecos');
    page.click(page.moveButtons()[0]);
    await page.done();

    expect(page.el.querySelector('.move-preview')).toBeNull();
    expect(page.lastPut().groups.find(g => g.id === 'marvel')!.parentId).toBe('revistas');
  });

  it('reparents through the ordinary debounced draft path once confirmed', async () => {
    const page = await mount({ collection: shelf(), tab: 'groups', g: 'marvel' });
    page.pick(page.byLabel('Parent group of marvel'), 'bonecos');
    page.click(page.moveButtons()[1]);
    await page.done();

    const saved = page.lastPut();
    expect(saved.groups.find(g => g.id === 'marvel')!.parentId).toBe('bonecos');
    // A move changes the parent, not the id — so the sub-group, its items and
    // their sections travel with it and need no migration.
    expect(saved.groups.find(g => g.id === 'ultimate')!.parentId).toBe('marvel');
    expect(saved.items.map(i => i.groupId)).toEqual(['marvel', 'ultimate']);
    expect(saved.items[0].custom).toEqual([{ key: 'Editora', value: 'Panini' }]);
  });

  it('can move a group out to the top level', async () => {
    const page = await mount({ collection: shelf(), tab: 'groups', g: 'marvel' });
    page.pick(page.byLabel('Parent group of marvel'), '');
    page.click(page.moveButtons()[1]);
    await page.done();

    // Null, never '': the model spells "no parent" as null on a group, and the
    // collection saves as a full-document PUT.
    expect(page.lastPut().groups.find(g => g.id === 'marvel')!.parentId).toBeNull();
  });

  it('warns about a sibling of the same name without blocking the move', async () => {
    // Sibling names are not keys — identity is the collection-wide id — and
    // blocking would refuse a legitimate intermediate state of a document PUT.
    const page = await mount({
      collection: collection({
        groups: [group('revistas'), group('marvel', { parentId: 'revistas' }), group('bonecos'), group('twin', { parentId: 'bonecos', name: 'marvel' })],
      }),
      tab: 'groups',
      g: 'marvel',
    });
    page.pick(page.byLabel('Parent group of marvel'), 'bonecos');

    expect(page.el.querySelector('.move-preview__clash')).not.toBeNull();
    page.click(page.moveButtons()[1]);
    await page.done();
    expect(page.lastPut().groups.find(g => g.id === 'marvel')!.parentId).toBe('bonecos');
  });

  // --- deleting a group asks what happens to its contents ---

  /** zeta ▸ child, one item in the child and one filed on zeta itself. */
  const branch = () =>
    collection({
      groups: [group('zeta'), group('child', { parentId: 'zeta' }), group('beta')],
      sections: [{ id: 's1', groupId: 'child', name: 'Bronze', target: null }],
      items: [{ ...item('deep', 'child'), sectionId: 's1' }, item('shallow', 'zeta')],
    });

  it('asks what happens to the contents instead of refusing outright', async () => {
    // The refusal it replaces was safe and a dead end: nothing in the app moved
    // items in bulk, so "move them first" was an instruction with no way to
    // follow it — while an EMPTY branch was deleted silently and unconfirmed.
    const page = await mount({ collection: branch(), tab: 'groups', g: 'zeta' });

    page.click(page.el.querySelector('[aria-label="Remove zeta"]')!);

    expect(page.dialog()).not.toBeNull();
    expect(page.api.puts).toHaveLength(0);
  });

  it('preselects no disposition, and will not confirm until one is chosen', async () => {
    // The rule the import dialog established: an irreversible choice is never
    // what a distracted Enter keypress answers.
    const page = await mount({ collection: branch(), tab: 'groups', g: 'zeta' });
    page.click(page.el.querySelector('[aria-label="Remove zeta"]')!);

    expect(page.dispositions().map(r => r.checked)).toEqual([false, false, false]);
    expect(page.confirmButton().disabled).toBe(true);
  });

  it('states the count in the button that destroys, not a bare "Delete"', async () => {
    const page = await mount({ collection: branch(), tab: 'groups', g: 'zeta' });
    page.click(page.el.querySelector('[aria-label="Remove zeta"]')!);

    page.choose(2);
    expect(page.confirmButton().textContent).toContain('2');
  });

  it('dismissal means nothing happened', async () => {
    const page = await mount({ collection: branch(), tab: 'groups', g: 'zeta' });
    page.click(page.el.querySelector('[aria-label="Remove zeta"]')!);
    page.choose(2);
    // The scrim, which `ui-dialog` treats exactly like Escape.
    page.click(page.el.querySelector('app-group-delete-dialog .scrim')!);
    await page.done();

    expect(page.dialog()).toBeNull();
    expect(page.lastPut().groups.map(g => g.id)).toEqual(['zeta', 'child', 'beta']);
    expect(page.lastPut().items).toHaveLength(2);
  });

  it('moves the contents up to the parent, losing nothing', async () => {
    const page = await mount({ collection: branch(), tab: 'groups', g: 'zeta' });
    page.click(page.el.querySelector('[aria-label="Remove zeta"]')!);
    page.choose(0);
    page.click(page.confirmButton());
    await page.done();

    const saved = page.lastPut();
    // zeta was a root, so its child becomes a root and its own item unfiled.
    expect(saved.groups.map(g => `${g.id}:${g.parentId}`)).toEqual(['child:null', 'beta:null']);
    expect(saved.items.find(i => i.id === 'shallow')!.groupId).toBe('');
    expect(saved.items.find(i => i.id === 'deep')!.groupId).toBe('child');
    // The surviving sub-group keeps its own divider.
    expect(saved.sections.map(s => s.id)).toEqual(['s1']);
    expect(saved.items.find(i => i.id === 'deep')!.sectionId).toBe('s1');
  });

  it('unfiles every item in the subtree, storing "" and never the bucket key', async () => {
    // UNGROUPED_ID is a key to read by. Storing it would put a group id on the
    // item that no group answers to.
    const page = await mount({ collection: branch(), tab: 'groups', g: 'zeta' });
    page.click(page.el.querySelector('[aria-label="Remove zeta"]')!);
    page.choose(1);
    page.click(page.confirmButton());
    await page.done();

    const saved = page.lastPut();
    expect(saved.groups.map(g => g.id)).toEqual(['beta']);
    expect(saved.items.map(i => i.groupId)).toEqual(['', '']);
    expect(saved.items.map(i => i.groupId)).not.toContain(UNGROUPED_ID);
    // The sections went with their groups, so no item is left pointing at one.
    expect(saved.sections).toEqual([]);
    expect(saved.items.map(i => i.sectionId)).toEqual(['', '']);
  });

  it('deletes the items too when that is what was chosen', async () => {
    const page = await mount({ collection: branch(), tab: 'groups', g: 'zeta' });
    page.click(page.el.querySelector('[aria-label="Remove zeta"]')!);
    page.choose(2);
    page.click(page.confirmButton());
    await page.done();

    const saved = page.lastPut();
    expect(saved.groups.map(g => g.id)).toEqual(['beta']);
    expect(saved.items).toEqual([]);
    expect(saved.sections).toEqual([]);
  });

  it('takes a deleted group’s sections with it', async () => {
    // A section belongs to exactly one group, so one whose group is gone can
    // never be reached again. Leaving it behind is not harmless: it rides every
    // PUT from here on, and `sectionsOf` would hand it back the day a new group
    // is created with the same id.
    const page = await mount({
      collection: collection({
        groups: [group('zeta'), group('child', { parentId: 'zeta' }), group('beta')],
        sections: [
          { id: 's1', groupId: 'zeta', name: 'Bronze', target: null },
          { id: 's2', groupId: 'child', name: 'Prata', target: null },
          { id: 's3', groupId: 'beta', name: 'Ouro', target: null },
        ],
        items: [],
      }),
      tab: 'groups',
      g: 'zeta',
    });

    page.click(page.el.querySelector('[aria-label="Remove zeta"]')!);
    // "Delete the items too" takes the whole branch; there are no items here.
    page.choose(2);
    page.click(page.confirmButton());
    await page.done();

    // The whole subtree went, so both its sections went — and only those.
    expect(page.lastPut().groups.map(g => g.id)).toEqual(['beta']);
    expect(page.lastPut().sections.map(s => s.id)).toEqual(['s3']);
  });

  // --- sections ---

  it('turns sub-groups into sections, moving their items up under them', async () => {
    // The migration for a tree that used sub-groups as separators. "Espanha" is
    // where the taxonomy actually ends; Bronze and Prata were only ever labels
    // for its items, and as groups they turned Espanha into a board of cards.
    const page = await mount({
      collection: collection({
        groups: [
          group('espanha'),
          group('bronze', { parentId: 'espanha', target: 10 }),
          group('prata', { parentId: 'espanha' }),
        ],
        sections: [],
        items: [item('seiya', 'bronze'), item('marin', 'prata')],
      }),
      tab: 'groups',
      g: 'espanha',
    });

    const convert = [...page.el.querySelectorAll('.detail__sections button')].find(b =>
      b.textContent?.includes('Turn sub-groups into sections'),
    )!;
    page.click(convert);
    await page.done();

    const saved = page.lastPut();
    expect(saved.groups.map(g => g.id)).toEqual(['espanha']);
    expect(saved.sections.map(s => s.name)).toEqual(['bronze', 'prata']);
    // The declared set size travels with the label it belonged to.
    expect(saved.sections[0].target).toBe(10);
    // Every item now belongs to the surviving group, under its divider.
    expect(saved.items.every(i => i.groupId === 'espanha')).toBe(true);
    expect(saved.items.map(i => i.sectionId)).toEqual([
      saved.sections[0].id,
      saved.sections[1].id,
    ]);
  });

  it('does not offer the conversion when a sub-group carries fields of its own', async () => {
    // A partial conversion would leave the group with children *and* sections,
    // so it would still open as a board of cards — the very thing being fixed.
    const page = await mount({
      collection: collection({
        groups: [
          group('espanha'),
          group('bronze', { parentId: 'espanha' }),
          group('prata', {
            parentId: 'espanha',
            fields: [{ name: 'Casta', type: 'text', scope: 'item' }],
          }),
        ],
        sections: [],
      }),
      tab: 'groups',
      g: 'espanha',
    });

    expect(page.detail().querySelectorAll('.detail__sections ui-button')).toHaveLength(1);
  });

  it('removing a section unfiles its items instead of refusing', async () => {
    // Unlike a group, a section holds nothing — it labels. So there is nothing
    // to orphan: the items fall into the unsectioned run of the same group.
    const page = await mount({
      collection: collection({
        groups: [group('espanha')],
        sections: [{ id: 'bronze', groupId: 'espanha', name: 'Bronze', target: null }],
        items: [{ ...item('seiya', 'espanha'), sectionId: 'bronze' }],
      }),
      tab: 'groups',
      g: 'espanha',
    });

    page.click(page.el.querySelector('[aria-label="Remove section Bronze"]')!);
    await page.answerConfirm();
    await page.done();

    expect(page.lastPut().sections).toEqual([]);
    expect(page.lastPut().items[0].sectionId).toBe('');
  });

  it('moves a section within its group, leaving other groups alone', async () => {
    const page = await mount({
      collection: collection({
        groups: [group('espanha'), group('brasil')],
        sections: [
          { id: 'bronze', groupId: 'espanha', name: 'Bronze', target: null },
          { id: 'outra', groupId: 'brasil', name: 'Outra', target: null },
          { id: 'prata', groupId: 'espanha', name: 'Prata', target: null },
        ],
      }),
      tab: 'groups',
      g: 'espanha',
    });

    page.click(page.el.querySelector('[aria-label="Move Prata earlier"]')!);
    await page.done();

    const saved = page.lastPut();
    expect(saved.sections.filter(s => s.groupId === 'espanha').map(s => s.id)).toEqual([
      'prata',
      'bronze',
    ]);
    expect(saved.sections.find(s => s.groupId === 'brasil')!.id).toBe('outra');
  });

  // --- master–detail (the tree on the left, one editor on the right) ---

  it('opens on the first group rather than on a pane whose content is an instruction', async () => {
    // Arriving with no ?g= used to show an invitation beside a tree. The first
    // group is the one the tree already puts under the cursor, and it replaces
    // rather than pushes, so back still means "the page I came from".
    const page = await mount({ tab: 'groups' });

    expect(page.rowNames()).toEqual(['beta', 'zeta']);
    expect(page.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: expect.objectContaining({ tab: 'groups', g: 'beta' }),
        replaceUrl: true,
      }),
    );
  });

  it('still renders an invitation for a collection with no groups at all', async () => {
    const page = await mount({ collection: collection({ groups: [] }), tab: 'groups' });

    expect(page.detail().querySelector('.detail__empty')).not.toBeNull();
    expect(page.detail().querySelector('.rename input')).toBeNull();
  });

  it('opens the editor for the group the URL names', async () => {
    const page = await mount({ tab: 'groups', g: 'zeta' });

    expect((page.detail().querySelector('.rename input') as HTMLInputElement).value).toBe('zeta');
    expect(page.detail().querySelector('.detail__empty')).toBeNull();
  });

  it('shows a branch by the items in its whole subtree, never just its own', async () => {
    // A parent shown as empty because everything sits in its children is a
    // lie, and this is the number you look at before deleting a branch.
    const page = await mount({
      collection: collection({
        groups: [group('zeta'), group('child', { parentId: 'zeta' })],
        items: [item('i1', 'child')],
      }),
      tab: 'groups',
      g: 'zeta',
    });

    const counts = [...page.el.querySelectorAll('.pick__count')].map(n => n.textContent);
    expect(counts).toContain('1');
  });

  it('lands on the editor of a group it just created', async () => {
    // You create a group in order to configure it, and a new row appearing
    // somewhere alphabetical is no answer to "where did it go?".
    const page = await mount({ tab: 'groups' });
    page.click(page.el.querySelector('.groups-card__head ui-button button')!);
    const input = page.el.querySelector('.new-group__input') as HTMLInputElement;
    page.type(input, 'Alpha');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    page.fixture.detectChanges();

    expect(page.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: expect.objectContaining({ tab: 'groups', g: expect.any(String) }),
      }),
    );
  });

  it('clears the selection when the selected group is deleted', async () => {
    // Leaving ?g= on a group that no longer exists renders the empty state
    // anyway, but the URL would go on claiming a selection that is gone.
    const page = await mount({ tab: 'groups', g: 'zeta' });

    page.click(page.el.querySelector('[aria-label="Remove zeta"]')!);
    page.choose(0);
    page.click(page.confirmButton());

    expect(page.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: expect.objectContaining({ g: null }) }),
    );
  });
});

describe('CollectionSettingsPage — nothing is destroyed without a question', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('keeps the divider when the question is declined', async () => {
    const page = await mount({
      collection: collection({
        groups: [group('espanha')],
        sections: [{ id: 'bronze', groupId: 'espanha', name: 'Bronze', target: null }],
        items: [{ ...item('seiya', 'espanha'), sectionId: 'bronze' }],
      }),
      tab: 'groups',
      g: 'espanha',
    });

    page.click(page.el.querySelector('[aria-label="Remove section Bronze"]')!);
    await page.answerConfirm(false);
    await page.done();

    // "Done" always flushes a save, so the assertion is about the content, not
    // about whether a PUT happened: the divider survives, and so does the item's
    // place in it — the part that could not have been recovered.
    expect(page.lastPut().sections).toHaveLength(1);
    expect(page.lastPut().items[0].sectionId).toBe('bronze');
  });

  it('keeps the field when the question is declined', async () => {
    const page = await mount({
      collection: collection({
        groups: [group('zeta', { fields: [{ name: 'Issue', type: 'number', scope: 'item' }] })],
      }),
      tab: 'groups',
      g: 'zeta',
    });

    page.click(page.el.querySelector('[aria-label="Remove field Issue"]')!);
    await page.answerConfirm(false);
    await page.done();

    expect(page.lastPut().groups[0].fields).toEqual([
      { name: 'Issue', type: 'number', scope: 'item' },
    ]);
  });

  it('will not delete the collection until the question is answered yes', async () => {
    // The largest irreversible act in the app, and it used to happen on one
    // click with nothing in between.
    const page = await mount();
    const deleted: string[] = [];
    page.api.deleteCollection = ((id: string) => {
      deleted.push(id);
      return of(void 0);
    }) as typeof page.api.deleteCollection;

    page.click(page.el.querySelector('.danger-row ui-button button, .general ui-button[variant="danger"] button')!);
    await page.answerConfirm(false);
    expect(deleted).toEqual([]);

    page.click(page.el.querySelector('.danger-row ui-button button, .general ui-button[variant="danger"] button')!);
    await page.answerConfirm(true);
    expect(deleted).toEqual(['c1']);
  });
});
