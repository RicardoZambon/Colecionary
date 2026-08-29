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
    detail,
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
            fields: [{ name: 'Issue', type: 'number' }],
            sort: { by: 'field:Issue', direction: 'asc' },
          }),
        ],
      }),
      tab: 'groups',
      g: 'zeta',
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

  it('will not remove a group that still holds items, anywhere in its subtree', async () => {
    const page = await mount({
      collection: collection({
        groups: [group('zeta'), group('child', { parentId: 'zeta' })],
        sections: [],
        items: [item('i1', 'child')],
      }),
      tab: 'groups',
      g: 'zeta',
    });

    page.click(page.el.querySelector('[aria-label="Remove zeta"]')!);
    await page.done();

    expect(page.lastPut().groups.map(g => g.id)).toEqual(['zeta', 'child']);
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
          group('prata', { parentId: 'espanha', fields: [{ name: 'Casta', type: 'text' }] }),
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

  it('edits nothing until a group is picked', async () => {
    // The whole point of the split: no editor is open, so a deep collection
    // opens as a map rather than as a column of forms.
    const page = await mount({ tab: 'groups' });

    expect(page.detail().querySelector('.detail__empty')).not.toBeNull();
    expect(page.detail().querySelector('.rename input')).toBeNull();
    expect(page.rowNames()).toEqual(['beta', 'zeta']);
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

    expect(page.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: expect.objectContaining({ g: null }) }),
    );
  });
});
