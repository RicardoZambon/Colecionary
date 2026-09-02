import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  VaultApi,
  VaultConflictError,
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
import { ToastService } from '../../../core/state/toast.service';
import { VaultStore } from '../../../core/state/vault.store';
import { CollectionPage } from './collection-page';

/**
 * The page's half of the CSV import.
 *
 * `csv-import.spec.ts` proves the reading and `csv-import-dialog.spec.ts`
 * proves that what is drawn is what is emitted. This file answers the one thing
 * neither can: whether importing four hundred rows is **one** write.
 *
 * That is rule 14, and it matters more here than anywhere else in the app. An
 * import is the only write that adds groups and items in the same breath, so N
 * calls would not merely be slow — a failure partway would leave a group
 * created, some of its contents in, and no way to say which.
 */
class FakeVaultApi extends VaultApi {
  collections: Collection[] = [];
  /** Every full-document PUT the page made, in order. */
  updates: Collection[] = [];
  /** Per-item writes, which an import must never make. */
  itemWrites = 0;
  /** Set to make the next collection PUT be refused. */
  conflict = false;
  role: UserProfile['role'] = 'Owner';

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
      email: 'm@example.com',
      initials: 'MC',
      plan: 'free',
      role: this.role,
    });
  }
  updateProfile(profile: UserProfile): Observable<UserProfile> {
    return of(profile);
  }
}

function group(id: string, name: string): GroupNode {
  return { id, name, parentId: null, fields: [], sort: null, target: null };
}

function item(id: string, name: string, groupId: string): Item {
  return {
    id,
    name,
    description: '',
    year: 2006,
    value: 0,
    groupId,
    sectionId: '',
    tags: [],
    img: '',
    custom: [],
    copies: [],
    photoIds: [],
  };
}

function collection(): Collection {
  return {
    id: 'c1',
    name: 'Saint Seiya',
    description: '',
    groups: [group('ouro', 'Cavaleiros de Ouro')],
    sections: [],
    items: [item('mu', 'Mu Aries', 'ouro')],
    members: [],
    linkShare: false,
    currency: null,
  };
}

/** The file from the ask, trimmed to what these assertions need. */
const CSV = [
  'Nome;Grupo;Ano;Exemp.;Estado;Valor',
  'Seiya Pegaso;Cavaleiros de Bronze (V1);2006;0;Quero;—',
  'Shiryu Dragon;Cavaleiros de Bronze (V1);2006;0;Quero;—',
  'Aldebaran Tauro;Cavaleiros de Ouro;2006;1;Perfeito;120',
].join('\n');

async function mount(opts: { g?: string; role?: UserProfile['role'] } = {}) {
  const api = new FakeVaultApi();
  api.collections = [collection()];
  api.role = opts.role ?? 'Owner';

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
  fixture.componentRef.setInput('g', opts.g);
  fixture.componentRef.setInput('v', 'list');
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const dialog = () => el.querySelector('app-csv-import-dialog');
  const buttonNamed = (label: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find(
      button => (button.textContent ?? '').trim() === label,
    ) ?? null;

  const open = () => {
    buttonNamed('Import')!.click();
    fixture.detectChanges();
  };

  const paste = (csv: string) => {
    const box = el.querySelector('app-csv-import-dialog textarea')!;
    (box as HTMLTextAreaElement).value = csv;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const submit = () => {
    [...el.querySelectorAll<HTMLButtonElement>('app-csv-import-dialog button')]
      .find(button => /^Import \d/.test((button.textContent ?? '').trim()))!
      .click();
    fixture.detectChanges();
  };

  /**
   * Lets the write settle. `whenStable()` is not enough on its own: the handler
   * awaits a plain promise, which a zoneless app knows nothing about.
   */
  const flush = async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
  };

  // Read from the service, not the DOM: `ui-toast` is mounted by the shell, and
  // this fixture is the page on its own.
  const toast = () => TestBed.inject(ToastService).message();

  return { api, el, fixture, dialog, buttonNamed, open, paste, submit, flush, toast };
}

describe('CollectionPage — CSV import', () => {
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

  it('opens from the header and closes on Escape without writing', async () => {
    const page = await mount();
    expect(page.dialog()).toBeNull();
    page.open();
    expect(page.dialog()).not.toBeNull();

    page
      .el.querySelector('app-csv-import-dialog .panel')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    page.fixture.detectChanges();
    expect(page.dialog()).toBeNull();
    expect(page.api.updates).toHaveLength(0);
  });

  it('writes the whole import as one full-document PUT, never per item', async () => {
    const page = await mount();
    page.open();
    page.paste(CSV);
    page.submit();
    await page.flush();

    expect(page.api.updates).toHaveLength(1);
    expect(page.api.itemWrites).toBe(0);

    const written = page.api.updates[0];
    expect(written.items.map(i => i.name)).toEqual([
      'Mu Aries',
      'Seiya Pegaso',
      'Shiryu Dragon',
      'Aldebaran Tauro',
    ]);
    expect(written.groups.map(g => g.name)).toEqual([
      'Cavaleiros de Ouro',
      'Cavaleiros de Bronze (V1)',
    ]);
  });

  it('closes and says how many landed', async () => {
    const page = await mount();
    page.open();
    page.paste(CSV);
    page.submit();
    await page.flush();

    expect(page.dialog()).toBeNull();
    expect(page.toast()).toContain('Imported 3 items');
  });

  it('keeps the dialog and the paste when the save is refused', async () => {
    const page = await mount();
    page.api.conflict = true;
    page.open();
    page.paste(CSV);
    page.submit();
    await page.flush();

    expect(page.api.updates).toHaveLength(0);
    expect(page.dialog()).not.toBeNull();
    const box = page.el.querySelector<HTMLTextAreaElement>('app-csv-import-dialog textarea')!;
    expect(box.value).toBe(CSV);
  });

  it('files a blank Group cell into the open group', async () => {
    const page = await mount({ g: 'ouro' });
    page.open();
    page.paste('Nome\nShaka Virgo');
    page.submit();
    await page.flush();

    const written = page.api.updates[0];
    expect(written.items.find(i => i.name === 'Shaka Virgo')!.groupId).toBe('ouro');
    expect(written.groups).toHaveLength(1);
  });

  it('never offers the import to a reader', async () => {
    const page = await mount({ role: 'Viewer' });
    expect(page.buttonNamed('Import')).toBeNull();
  });
});
