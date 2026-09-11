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
import { ThemeService } from '../../core/state/theme.service';
import { ToastService } from '../../core/state/toast.service';
import { VaultStore } from '../../core/state/vault.store';
import { CurrencyCode } from '../../core/utils/money.util';
import { SettingsPage } from './settings-page';

const OWNER: Member = { name: 'Marcus', email: 'marcus@example.com', initials: 'MC', role: 'Owner' };
const EDITOR: Member = { name: 'Ana', email: 'ana@example.com', initials: 'AN', role: 'Editor' };

class FakeVaultApi extends VaultApi {
  settings: TenantSettings = { defaultCurrency: 'USD' };
  members: Member[] = [OWNER, EDITOR];
  /** The signed-in user's own role — what `canAdminister()` is derived from. */
  role: Member['role'] = 'Owner';
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
    return of({ name: OWNER.name, email: OWNER.email, initials: OWNER.initials, plan: 'free', role: this.role });
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
  opts: {
    tab?: string;
    currency?: CurrencyCode;
    plan?: ImportPlan | null;
    role?: Member['role'];
  } = {},
) {
  const api = new FakeVaultApi();
  api.settings = { defaultCurrency: opts.currency ?? 'USD' };
  api.role = opts.role ?? 'Owner';
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
    tabs: () => [...el.querySelectorAll('[role="tab"]')] as HTMLElement[],
    byLabel: (aria: string) => el.querySelector(`[aria-label="${aria}"]`) as HTMLSelectElement,
    /**
     * The theme or language picker buttons, in the order the page lists them.
     *
     * Deliberately `.themes > button` rather than the card inside it: what this
     * asks is whether the *control* is a real button, which is the whole of the
     * defect. Both grids share the class, so the language half is told apart by
     * the card it wraps.
     */
    picks: (kind: 'theme' | 'lang') =>
      ([...el.querySelectorAll('.themes > button')] as HTMLButtonElement[]).filter(
        button => !!button.querySelector('.lang-card') === (kind === 'lang'),
      ),
    /** The real `<button>` inside the `ui-button` whose label reads exactly this. */
    action: (label: string) =>
      ([...el.querySelectorAll('ui-button > button')] as HTMLButtonElement[]).find(
        button => button.textContent?.trim() === label,
      ),
    /** Hands the hidden file input an archive, as picking one from disk does. */
    pickArchive: async () => {
      const input = el.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', {
        value: [new File([new Uint8Array(2)], 'vault.zip', { type: 'application/zip' })],
      });
      input.dispatchEvent(new Event('change'));
      await tick();
      fixture.detectChanges();
    },
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

    // Nothing was written; the dialog is asking.
    expect(page.archives.attempts).toEqual([undefined]);
    expect(page.el.querySelector('app-import-dialog [role="dialog"]')).not.toBeNull();

    await page.click(page.el.querySelector('app-import-dialog .actions ui-button:last-of-type button')!);

    expect(page.archives.attempts).toEqual([undefined, []]);
    expect(page.el.querySelector('app-import-dialog [role="dialog"]')).toBeNull();
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

    await page.click(page.el.querySelector('app-import-dialog .actions ui-button:last-of-type button')!);

    expect(page.archives.attempts.at(-1)).toEqual([{ id: 'c1', version: '"4"' }]);
  });

  it('answers a collision with neither option preselected', async () => {
    // The last question asked before a request that can destroy a collection,
    // so a distracted Enter must not be able to answer it — and "create new"
    // used to be drawn checked because it was inferred from the absence of an
    // overwrite. Both options now bind one selection, which is also what stops
    // the pair disagreeing with the browser about which one is on.
    const plan: ImportPlan = {
      entries: [{ name: 'Vinyl', existingId: 'c1', existingVersion: '"1"' }],
    };
    const page = await mount({ tab: 'account', plan });
    await page.pickArchive();

    const radios = [
      ...page.el.querySelectorAll('app-import-dialog .choice input[type="radio"]'),
    ] as HTMLInputElement[];

    expect(radios).toHaveLength(2);
    expect(radios.some(radio => radio.checked)).toBe(false);
    // A real platform radio, so the role, the checked state and arrow-key
    // movement within the set come from the browser rather than from us.
    expect(radios[0].name).toBe(radios[1].name);
  });

  it('opens with focus on the first option', async () => {
    // Focus has to land inside for a screen reader to announce the dialog and
    // for Escape to be a sensible thing to press. It is also the one thing that
    // fails *silently* when a template ref resolves to the component rather
    // than to its host element — nothing throws, focus simply stays outside.
    const plan: ImportPlan = {
      entries: [{ name: 'Vinyl', existingId: 'c1', existingVersion: '"1"' }],
    };
    const page = await mount({ tab: 'account', plan });
    await page.pickArchive();
    await tick();

    const first = page.el.querySelector('app-import-dialog .choice input[type="radio"]');
    expect(document.activeElement).toBe(first);
  });

  // --- the archive import is account-scale, so it is Owner-only (rule 9) ---

  it('refuses the archive import to a non-admin, and leaves the export alone', async () => {
    // The element carried *two* [disabled] bindings and only one can take
    // effect, so the `canAdminister` half could simply never apply — on the one
    // control in the app whose single request can overwrite every collection in
    // the vault.
    const page = await mount({ tab: 'account', role: 'Viewer' });
    const i18n = TestBed.inject(I18nService);

    expect(page.action(i18n.t('settings.account.import'))?.disabled).toBe(true);
    // Export is a read of the account's own data by somebody already looking at
    // it, and is deliberately not gated. The asymmetry is the point.
    expect(page.action(i18n.t('settings.account.export'))?.disabled).toBe(false);
  });

  it('still offers the import to an owner, so the gate is the role and not a constant', async () => {
    const page = await mount({ tab: 'account' });
    const i18n = TestBed.inject(I18nService);

    expect(page.action(i18n.t('settings.account.import'))?.disabled).toBe(false);
  });

  // --- the theme and language pickers are controls, not painted cards ---

  it('wraps every theme card in a real button, so a keyboard can reach it', async () => {
    // `ui-card` is a plain custom element — no role, no tabindex, no href — so
    // the (click) that used to sit on it was mouse-only: there was no way to
    // change the theme from a keyboard at all. Nothing inside these cards is
    // interactive, so the whole card is wrapped rather than its title.
    const page = await mount();
    const theme = TestBed.inject(ThemeService);

    const picks = page.picks('theme');
    expect(picks).toHaveLength(theme.themes.length);
    for (const button of picks) {
      expect(button.tagName).toBe('BUTTON');
      // Not the UA default "submit": these act, they do not send a form.
      expect(button.type).toBe('button');
    }
    // No card left carrying the click itself.
    expect(
      [...page.el.querySelectorAll('.themes ui-card')].every(
        card => card.closest('button') !== null,
      ),
    ).toBe(true);
  });

  it('applies a theme from its button and announces which one is on', async () => {
    const page = await mount();
    const theme = TestBed.inject(ThemeService);
    const pressed = () => page.picks('theme').map(b => b.getAttribute('aria-pressed'));

    // Exactly one selection, and it is stated rather than only coloured: the
    // active theme used to be an accent border and an accent line of text.
    expect(pressed().filter(v => v === 'true')).toHaveLength(1);

    const target = pressed().indexOf('false');
    await page.click(page.picks('theme')[target]);

    expect(theme.current()).toBe(theme.themes[target].id);
    expect(pressed()[target]).toBe('true');
    expect(pressed().filter(v => v === 'true')).toHaveLength(1);
  });

  it('changes the language from its button too', async () => {
    const page = await mount();
    const i18n = TestBed.inject(I18nService);

    const picks = page.picks('lang');
    expect(picks).toHaveLength(i18n.langs.length);
    for (const button of picks) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.type).toBe('button');
    }

    const target = picks.map(b => b.getAttribute('aria-pressed')).indexOf('false');
    await page.click(picks[target]);

    expect(i18n.current()).toBe(i18n.langs[target].id);
    expect(page.picks('lang')[target].getAttribute('aria-pressed')).toBe('true');
  });

  // --- heading hierarchy ---

  it('renders its section titles as real headings under the one h1', async () => {
    // The page rendered exactly one <h1> and no other heading, so a screen
    // reader's heading list — the primary way a non-visual user skims a screen —
    // was one entry long, and reaching the currency picker meant walking the
    // whole document.
    const page = await mount();
    const i18n = TestBed.inject(I18nService);

    expect(page.el.querySelectorAll('h1')).toHaveLength(1);
    const headings = [...page.el.querySelectorAll('h2')].map(h => h.textContent?.trim());
    expect(headings).toContain(i18n.t('settings.theme.heading'));
    expect(headings).toContain(i18n.t('settings.language.heading'));
    expect(headings).toContain(i18n.t('settings.currency.heading'));
  });

  // --- the vault has not landed yet ---

  it('draws skeletons rather than blank member rows while the vault loads', async () => {
    const page = await mount({ tab: 'access' });
    page.store.loaded.set(false);
    page.fixture.detectChanges();

    const members = page.el.querySelector('.members')!;
    expect(members.getAttribute('aria-busy')).toBe('true');
    expect(members.querySelectorAll('ui-skeleton').length).toBeGreaterThan(0);
    // One announcement on the region, not one per unnamed graphic.
    expect(members.querySelectorAll('[role="status"]')).toHaveLength(1);
    // And no half-rendered identity: a nameless row is a statement about a
    // member, where a skeleton is a statement about the request.
    expect(members.textContent).not.toContain(OWNER.name);
  });

  it('does not claim an empty account while its collections are still arriving', async () => {
    const page = await mount({ tab: 'account' });
    const i18n = TestBed.inject(I18nService);
    page.store.loaded.set(false);
    page.fixture.detectChanges();

    expect(page.el.querySelector('.account')!.getAttribute('aria-busy')).toBe('true');
    expect(page.el.textContent).not.toContain(i18n.t('settings.account.noCollections'));
    expect(page.el.querySelectorAll('ui-skeleton').length).toBeGreaterThan(0);
  });
});
