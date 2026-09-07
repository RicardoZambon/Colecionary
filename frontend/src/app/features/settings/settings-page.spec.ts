import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ArchiveApi,
  ImportNeedsConfirmation,
  ImportPlan,
  ReplaceDecision,
} from '../../core/api/archive-api';
import {
  VaultApi,
  VersionedCollection,
  VersionedItem,
} from '../../core/api/vault-api';
import {
  Collection,
  Item,
  Member,
  StoreListing,
  TenantSettings,
  UserProfile,
} from '../../core/models';
import { I18nService } from '../../core/i18n';
import { ToastService } from '../../core/state/toast.service';
import { VaultStore } from '../../core/state/vault.store';
import { CurrencyCode } from '../../core/utils/money.util';
import { SettingsPage } from './settings-page';

const OWNER: Member = { name: 'Marcus', email: 'marcus@example.com', initials: 'MC', role: 'Owner' };
const EDITOR: Member = { name: 'Ana', email: 'ana@example.com', initials: 'AN', role: 'Editor' };

class FakeVaultApi extends VaultApi {
  settings: TenantSettings = { defaultCurrency: 'USD' };
  members: Member[] = [OWNER, EDITOR];
  /** Set to reject the next tenant-settings write, as the server does for a non-Owner. */
  rejectSettings = false;
  readonly settingsWrites: TenantSettings[] = [];
  readonly memberWrites: Member[][] = [];

  /**
   * The version every write quotes back. A constant here because these tests
   * are not about the guard — they only have to satisfy it, the way a client in
   * sync with the server always does.
   */
  private static readonly VERSION = '"1"';

  listCollections(): Observable<VersionedCollection[]> {
    return of([]);
  }
  createCollection(): Observable<VersionedCollection> {
    return throwError(() => new Error('unused'));
  }
  updateCollection(collection: Collection): Observable<VersionedCollection> {
    return of({ version: FakeVaultApi.VERSION, collection });
  }
  deleteCollection(): Observable<void> {
    return of(void 0);
  }
  importStoreListing(): Observable<VersionedCollection> {
    return throwError(() => new Error('unused'));
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
    return of(structuredClone(this.members));
  }
  updateTenantMembers(members: Member[]): Observable<Member[]> {
    this.memberWrites.push(structuredClone(members));
    this.members = structuredClone(members);
    return of(members);
  }
  getTenantSettings(): Observable<TenantSettings> {
    return of({ ...this.settings });
  }
  updateTenantSettings(settings: TenantSettings): Observable<TenantSettings> {
    this.settingsWrites.push({ ...settings });
    if (this.rejectSettings) return throwError(() => new Error('Forbidden'));
    this.settings = { ...settings };
    return of({ ...settings });
  }
  getProfile(): Observable<UserProfile> {
    return of({ name: OWNER.name, email: OWNER.email, initials: OWNER.initials, plan: 'free', role: 'Owner' });
  }
  updateProfile(profile: UserProfile): Observable<UserProfile> {
    return of(profile);
  }
}

/** Only the archive methods the page reaches; the real one wraps HttpClient. */
class FakeArchiveApi {
  /** One entry per attempt: `undefined` = "asked blind", an array = the answer. */
  readonly attempts: (readonly ReplaceDecision[] | undefined)[] = [];
  plan: ImportPlan | null = null;
  imported: Collection[] = [];
  /** When set, `downloadVault` rejects with it — a failed export. */
  downloadFails: Error | null = null;

  async downloadVault(): Promise<{ blob: Blob; filename: string }> {
    if (this.downloadFails) throw this.downloadFails;
    return { blob: new Blob([new Uint8Array(1)]), filename: 'vault-export.zip' };
  }

  async importArchive(
    _file: File,
    replace?: readonly ReplaceDecision[],
  ): Promise<VersionedCollection[]> {
    this.attempts.push(replace);
    if (replace === undefined && this.plan) throw new ImportNeedsConfirmation(this.plan);
    // Versioned like the real one: an overwrite moves the version of a
    // collection already on screen, so the token has to come back with it.
    return structuredClone(this.imported).map(collection => ({ version: '"1"', collection }));
  }
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function mount(
  opts: { tab?: string; currency?: CurrencyCode; plan?: ImportPlan | null } = {},
) {
  const api = new FakeVaultApi();
  api.settings = { defaultCurrency: opts.currency ?? 'USD' };
  const archives = new FakeArchiveApi();
  archives.plan = opts.plan ?? null;

  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: VaultApi, useValue: api },
      { provide: ArchiveApi, useValue: archives },
    ],
  });

  TestBed.inject(I18nService).apply('en');
  const store = TestBed.inject(VaultStore);
  await store.load();
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

  const fixture = TestBed.createComponent(SettingsPage);
  fixture.componentRef.setInput('tab', opts.tab ?? 'appearance');
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  const click = async (target: Element) => {
    (target as HTMLElement).click();
    await tick();
    fixture.detectChanges();
  };

  const pick = async (select: HTMLSelectElement, value: string) => {
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await tick();
    fixture.detectChanges();
  };

  return {
    api,
    archives,
    store,
    el,
    fixture,
    navigate,
    click,
    pick,
    toast: () => TestBed.inject(ToastService).message(),
    tone: () => TestBed.inject(ToastService).current()?.tone ?? null,
    tabs: () => [...el.querySelectorAll('[role="tab"]')] as HTMLElement[],
    byLabel: (aria: string) => el.querySelector(`[aria-label="${aria}"]`) as HTMLSelectElement,
  };
}

describe('SettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  // --- the tab is URL state (rule 11) ---

  it('opens on the tab the query string names', async () => {
    const page = await mount({ tab: 'account' });
    expect(page.el.querySelector('.account')).not.toBeNull();
  });

  it('puts the chosen tab in the URL rather than in component state alone', async () => {
    const page = await mount();
    await page.click(page.tabs()[1]);

    expect(page.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { tab: 'plan' }, queryParamsHandling: 'merge' }),
    );
  });

  // --- the account currency (rule 8) ---

  it('applies a saved account currency to everything that renders an amount', async () => {
    // The picker writes through the store, which is the only writer of the
    // dependency-free signal every money pipe reads.
    const page = await mount({ tab: 'appearance' });
    expect(page.store.defaultCurrency()).toBe('USD');

    await page.pick(page.byLabel('Currency'), 'BRL');

    expect(page.api.settingsWrites).toEqual([{ defaultCurrency: 'BRL' }]);
    expect(page.store.defaultCurrency()).toBe('BRL');
  });

  it('leaves the currency alone when the server refuses the write', async () => {
    // Owner-only on the server, and the client deliberately does not duplicate
    // that check — so the rejection is the path that has to behave.
    const page = await mount({ tab: 'appearance' });
    page.api.rejectSettings = true;

    await page.pick(page.byLabel('Currency'), 'BRL');

    expect(page.store.defaultCurrency()).toBe('USD');
    expect(page.toast()).toBe(TestBed.inject(I18nService).t('toast.currency.failed'));
  });

  // --- tenant members ---

  it('refuses to remove the owner, and says why instead of going dead', async () => {
    const page = await mount({ tab: 'access' });
    await page.click(page.el.querySelector(`[aria-label="Remove ${OWNER.name}"]`)!);

    expect(page.api.memberWrites).toEqual([]);
    expect(page.toast()).toBe(TestBed.inject(I18nService).t('toast.member.ownerImmutable'));
  });

  it('changes a member role through the API, not just on screen', async () => {
    const page = await mount({ tab: 'access' });
    await page.pick(page.byLabel(`Role for ${EDITOR.name}`), 'Viewer');

    expect(page.api.memberWrites).toHaveLength(1);
    expect(page.api.memberWrites[0].find(m => m.email === EDITOR.email)!.role).toBe('Viewer');
    // The owner's own row is untouched by someone else's change.
    expect(page.api.memberWrites[0].find(m => m.email === OWNER.email)!.role).toBe('Owner');
  });

  // --- archive import ---

  it('asks before overwriting, and sends an empty answer rather than none', async () => {
    // `replace: []` means "create new ones" and is a real answer; omitting it
    // reads as "not asked yet" and would make the server ask all over again.
    const plan: ImportPlan = {
      entries: [{ name: 'Vinyl', existingId: 'c1', existingVersion: '"1"' }],
    };
    const page = await mount({ tab: 'account', plan });

    const input = page.el.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File([new Uint8Array(2)], 'vault.zip', { type: 'application/zip' })],
    });
    input.dispatchEvent(new Event('change'));
    await tick();
    page.fixture.detectChanges();

    // Nothing was written; the dialog is asking. `alertdialog`, since it
    // interrupts to ask about a consequence.
    expect(page.archives.attempts).toEqual([undefined]);
    expect(page.el.querySelector('app-import-dialog [role="alertdialog"]')).not.toBeNull();

    // And it cannot be answered by pressing the button: an unanswered
    // collision is a third state, not a synonym for "create a new one".
    const confirm = () =>
      page.el.querySelector(
        'app-import-dialog .panel__actions ui-button:last-of-type button',
      ) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);

    const createNew = page.el.querySelectorAll(
      'app-import-dialog .choice input[type="radio"]',
    )[0] as HTMLInputElement;
    createNew.checked = true;
    createNew.dispatchEvent(new Event('change'));
    page.fixture.detectChanges();

    await page.click(confirm());

    expect(page.archives.attempts).toEqual([undefined, []]);
    expect(page.el.querySelector('app-import-dialog [role="alertdialog"]')).toBeNull();
  });

  it('sends each overwrite with the version the plan reported for it', async () => {
    // An overwrite is the same wholesale replace the collection PUT is never
    // allowed to make blind — and here the read and the write are two requests
    // with a dialog and a second upload between them. The version is what binds
    // the plan the user answered to the document the server then replaces.
    const plan: ImportPlan = {
      entries: [{ name: 'Vinyl', existingId: 'c1', existingVersion: '"4"' }],
    };
    const page = await mount({ tab: 'account', plan });

    const input = page.el.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File([new Uint8Array(2)], 'vault.zip', { type: 'application/zip' })],
    });
    input.dispatchEvent(new Event('change'));
    await tick();
    page.fixture.detectChanges();

    // The second radio in the entry's fieldset is "overwrite the existing one".
    const overwrite = page.el.querySelectorAll(
      'app-import-dialog .choice input[type="radio"]',
    )[1] as HTMLInputElement;
    overwrite.checked = true;
    overwrite.dispatchEvent(new Event('change'));
    page.fixture.detectChanges();

    await page.click(
      page.el.querySelector('app-import-dialog .panel__actions ui-button:last-of-type button')!,
    );

    expect(page.archives.attempts.at(-1)).toEqual([{ id: 'c1', version: '"4"' }]);
  });
});

describe('SettingsPage failure reporting', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('reports a refused export as a failure, not as neutral news', async () => {
    // `flash` is the info tone: no --danger, no "Failed" marker, no
    // `role="alert"`, no dismiss — and a 2.6s timer, which is what took the
    // only evidence away before anyone watching their downloads folder saw it.
    const page = await mount({ tab: 'account' });
    page.archives.downloadFails = new Error('nope');

    const button = page.el.querySelector('.account-card ui-button button') as HTMLElement;
    await page.click(button);

    expect(page.tone()).toBe('error');
    expect(page.toast()).toBe(TestBed.inject(I18nService).t('toast.export.failed'));
  });

  it('marks a successful export as a success, so the Done marker is drawn', async () => {
    const page = await mount({ tab: 'account' });
    const button = page.el.querySelector('.account-card ui-button button') as HTMLElement;
    await page.click(button);
    expect(page.tone()).toBe('success');
  });
});
