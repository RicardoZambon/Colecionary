import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VaultApi, VersionedCollection, VersionedItem } from '../../core/api/vault-api';
import {
  Collection,
  Item,
  Member,
  MemberRole,
  StoreListing,
  TenantSettings,
  UserProfile,
} from '../../core/models';
import { I18nService } from '../../core/i18n';
import { VaultStore } from '../../core/state/vault.store';
import { DashboardPage } from './dashboard-page';

class FakeVaultApi extends VaultApi {
  collections: Collection[] = [];
  role: MemberRole = 'Owner';
  /** Every name the page asked the server to create, in order. */
  readonly created: string[] = [];

  private static readonly VERSION = '"1"';

  listCollections(): Observable<VersionedCollection[]> {
    return of(structuredClone(this.collections).map(collection => this.versioned(collection)));
  }
  createCollection(input: { name: string; description: string }): Observable<VersionedCollection> {
    this.created.push(input.name);
    return of(this.versioned({ ...blank('made'), name: input.name }));
  }
  updateCollection(collection: Collection): Observable<VersionedCollection> {
    return of(this.versioned(collection));
  }
  deleteCollection(): Observable<void> {
    return of(void 0);
  }
  importStoreListing(): Observable<VersionedCollection> {
    return of(this.versioned(blank('imported')));
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
      name: 'Marcus Chen',
      email: 'marcus@example.com',
      initials: 'MC',
      plan: 'free',
      role: this.role,
    });
  }
  updateProfile(profile: UserProfile): Observable<UserProfile> {
    return of(profile);
  }

  private versioned(collection: Collection): VersionedCollection {
    return { version: FakeVaultApi.VERSION, collection };
  }
}

function blank(id: string): Collection {
  return {
    id,
    name: id,
    description: '',
    fields: [],
    groups: [],
    sections: [],
    items: [],
    members: [],
    linkShare: true,
    currency: null,
  };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function mount(opts: { collections?: Collection[]; role?: MemberRole } = {}) {
  const api = new FakeVaultApi();
  api.collections = opts.collections ?? [];
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
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

  const fixture = TestBed.createComponent(DashboardPage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  const render = () => fixture.detectChanges();
  // `[dlgActions]` is an <ng-container>, which leaves no element behind: the
  // projected buttons land in the dialog's own actions row.
  const dialogButtons = () =>
    Array.from(
      el.querySelectorAll<HTMLButtonElement>('ui-dialog .panel__actions ui-button button'),
    );

  return {
    api,
    el,
    fixture,
    navigate,
    render,
    dialog: () => el.querySelector('ui-dialog'),
    /** The confirm is the last action in the dialog's row. */
    confirm: () => dialogButtons()[dialogButtons().length - 1],
    newTile: () => el.querySelector<HTMLButtonElement>('.new-tile'),
    type(text: string) {
      const input = el.querySelector('ui-dialog input') as HTMLInputElement;
      input.value = text;
      input.dispatchEvent(new Event('input'));
      render();
    },
  };
}

describe('DashboardPage', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('opens a collection through a real link, not a click handler on a card', async () => {
    // `ui-card` is a plain custom element, so `[routerLink]` on it was a click
    // listener and nothing else: no href, no tab stop, no middle-click, and
    // nothing for a screen reader to announce or activate. These cards are the
    // only way into a collection from this page.
    const page = await mount({ collections: [{ ...blank('c1'), name: 'PS1 RPGs' }] });

    const link = page.el.querySelector<HTMLAnchorElement>('.grid a.card-link');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('/c/c1');
    expect(link!.getAttribute('aria-label')).toContain('PS1 RPGs');
    // The card is still inside it, painted as interactive.
    expect(link!.querySelector('ui-card')?.classList.contains('interactive')).toBe(true);
  });

  it('says so when there is nothing in the vault', async () => {
    const page = await mount();

    expect(page.el.querySelector('.grid ui-empty')).not.toBeNull();
    // The bare tile is not the empty state; the way out is projected into it.
    expect(page.newTile()).toBeNull();
    expect(page.el.querySelector('ui-empty .actions ui-button')).not.toBeNull();
  });

  it('offers no way to create anything to a Viewer', async () => {
    const page = await mount({ role: 'Viewer' });

    expect(page.newTile()).toBeNull();
    expect(page.el.querySelector('ui-empty .actions ui-button')).toBeNull();
  });

  it('writes nothing until the naming dialog is confirmed', async () => {
    // It used to create a collection called "New collection" on the click and
    // jump to its settings, so a misclick left a half-made row in the sidebar.
    const page = await mount({ collections: [blank('c1')] });

    page.newTile()!.click();
    page.render();

    expect(page.dialog()).not.toBeNull();
    expect(page.api.created).toEqual([]);
  });

  it('keeps the confirm inert until the name says something', async () => {
    const page = await mount({ collections: [blank('c1')] });
    page.newTile()!.click();
    page.render();

    expect(page.confirm().disabled).toBe(true);

    // Whitespace is not a name.
    page.type('   ');
    expect(page.confirm().disabled).toBe(true);

    page.type('Retro consoles');
    expect(page.confirm().disabled).toBe(false);
  });

  it('creates under the typed name and opens it for the rest of its settings', async () => {
    const page = await mount({ collections: [blank('c1')] });
    page.newTile()!.click();
    page.render();
    page.type('  Retro consoles  ');

    page.confirm().click();
    await tick();
    page.render();

    expect(page.api.created).toEqual(['Retro consoles']);
    expect(page.navigate).toHaveBeenCalledWith(['/c', 'made', 'settings'], {
      queryParams: { tab: 'general' },
    });
    // And the dialog is gone, rather than inviting a second identical write.
    expect(page.dialog()).toBeNull();
  });

  it('treats a dismissal as nothing happening', async () => {
    const page = await mount({ collections: [blank('c1')] });
    page.newTile()!.click();
    page.render();
    page.type('Retro consoles');

    page.el
      .querySelector('ui-dialog')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    page.render();

    expect(page.dialog()).toBeNull();
    expect(page.api.created).toEqual([]);
    // Reopening starts clean: a name left in the field is a name nobody meant.
    page.newTile()!.click();
    page.render();
    expect((page.el.querySelector('ui-dialog input') as HTMLInputElement).value).toBe('');
  });
});
