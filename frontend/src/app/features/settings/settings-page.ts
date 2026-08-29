import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { PLANS } from './plans';
import {
  ArchiveApi,
  ImportNeedsConfirmation,
  ImportPlan,
  ReplaceDecision,
} from '../../core/api/archive-api';
import { I18nService, MessageKey } from '../../core/i18n';
import { ConfirmService } from '../../core/state/confirm.service';
import { ThemeService } from '../../core/state/theme.service';
import { ToastService } from '../../core/state/toast.service';
import { ImportDialog } from './import-dialog/import-dialog';
import { VaultStore } from '../../core/state/vault.store';
import { MemberRole } from '../../core/models';
import { saveFile } from '../../core/utils/download.util';
import { CurrencyCode, SUPPORTED_CURRENCIES, currencyLabel } from '../../core/utils/money.util';
import { SelectOption, TabDef, UiAvatar, UiButton, UiCard, UiFlag, UiIcon, UiReadOnlyNotice, UiSelect, UiTabs } from '../../shared/ui';
import { TPipe } from '../../shared/pipes/t.pipe';

const TAB_KEYS: { id: string; label: MessageKey }[] = [
  { id: 'appearance', label: 'settings.tab.appearance' },
  { id: 'plan', label: 'settings.tab.plan' },
  { id: 'access', label: 'settings.tab.access' },
  { id: 'account', label: 'settings.tab.account' },
];

/** The first tab, and what an unrecognised `?tab=` resolves to. */
const DEFAULT_TAB = TAB_KEYS[0].id;

/**
 * The tab a `?tab=` names, or the first one.
 *
 * The query string is untrusted input (rule 11) and this page used to take it
 * straight into a signal, so `?tab=sharing` rendered the default panel while
 * `aria-selected="true"` sat on nothing at all — the tablist claimed a
 * selection that did not exist, which is worse for a screen reader than for
 * anyone else. Same shape as `resolveGroupId` and `resolveSectionId`: anything
 * that does not resolve collapses to the one safe value, and the caller cannot
 * tell the difference between "absent" and "nonsense" because there is no
 * useful difference.
 */
export function resolveTabId(id: string | null | undefined): string {
  if (!id) return DEFAULT_TAB;
  return TAB_KEYS.some(t => t.id === id) ? id : DEFAULT_TAB;
}

const ROLE_KEYS: { value: MemberRole; label: MessageKey }[] = [
  { value: 'Owner', label: 'role.owner' },
  { value: 'Editor', label: 'role.editor' },
  { value: 'Viewer', label: 'role.viewer' },
];

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ImportDialog, TPipe, UiAvatar, UiButton, UiCard, UiFlag, UiIcon, UiReadOnlyNotice, UiSelect, UiTabs],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  protected readonly store = inject(VaultStore);
  protected readonly theme = inject(ThemeService);
  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly archives = inject(ArchiveApi);

  readonly tab = input<string>('appearance');

  protected readonly plans = PLANS;

  // Label tables are computed, not module constants: the language can change
  // while the page is open and these have to follow it.
  protected readonly tabs = computed<TabDef[]>(() =>
    TAB_KEYS.map(t => ({ id: t.id, label: this.i18n.t(t.label) })),
  );
  protected readonly roleOptions = computed<SelectOption[]>(() =>
    ROLE_KEYS.map(r => ({ value: r.value, label: this.i18n.t(r.label) })),
  );

  // Sorted by the label the user actually reads, which is locale-dependent —
  // "Real brasileiro" and "Brazilian real" do not fall in the same place.
  protected readonly currencyOptions = computed<SelectOption[]>(() => {
    const locale = this.i18n.locale();
    return SUPPORTED_CURRENCIES.map(code => ({ value: code, label: currencyLabel(code, locale) }))
      .sort((a, b) => a.label.localeCompare(b.label, locale));
  });

  protected readonly activeTab = signal(DEFAULT_TAB);

  /**
   * Bumped to force the member rows to be rebuilt from store state.
   *
   * A `<select>` the user has just changed holds their choice in the DOM, and
   * `[value]` is bound to the *store's* role — which a refused write leaves
   * untouched. Angular therefore has nothing to re-render and the select keeps
   * showing a role the server rejected: the screen and the server disagree, and
   * nothing says so. Changing the `track` key destroys the row and builds a
   * fresh one, which is the only thing that reliably puts a native control back
   * where the model says it should be.
   */
  protected readonly memberRev = signal(0);

  constructor() {
    effect(() => {
      const resolved = resolveTabId(this.tab());
      this.activeTab.set(resolved);
      // A `?tab=` nobody can honour is corrected in place rather than left in
      // the address bar describing a screen that is not showing: `replaceUrl`
      // so the bad value does not become a Back-button destination.
      if (this.tab() && this.tab() !== resolved) {
        void this.router.navigate([], {
          queryParams: { tab: resolved },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    });
  }

  protected readonly planSub = computed(() =>
    this.i18n.t(this.store.profile()?.plan === 'pro' ? 'settings.plan.onPro' : 'settings.plan.onFree'),
  );

  /**
   * A member's role as a message key, for the read-only rendering.
   *
   * The enum value is data and is never translated (rule 8); the label is copy.
   */
  protected roleLabel(role: MemberRole): MessageKey {
    return ROLE_KEYS.find(r => r.value === role)?.label ?? 'role.viewer';
  }

  protected onTabChange(tab: string): void {
    this.activeTab.set(tab);
    void this.router.navigate([], { queryParams: { tab }, queryParamsHandling: 'merge' });
  }

  /**
   * Saves the account currency. Owner-only on the server, and the client does
   * not duplicate that check: a role the browser believes in is a suggestion,
   * and the 403 is the real answer either way.
   */
  protected async chooseCurrency(code: string): Promise<void> {
    const current = this.store.tenantSettings();
    if (!current || current.defaultCurrency === code) return;
    try {
      await this.store.updateTenantSettings({ defaultCurrency: code as CurrencyCode });
      this.toast.success(this.i18n.t('toast.currency.saved'));
    } catch {
      this.toast.error(this.i18n.t('toast.currency.failed'));
    }
  }

  /*
   * `choosePlan` is gone, and nothing replaced it.
   *
   * It let the client PUT its own `plan` to `pro` — no payment, no entitlement,
   * no audit trail — and then toasted "Welcome to Pro ✓". Nothing in the app
   * gates a single feature on the plan, so the button changed one string in the
   * profile and told the user they had bought something. A button that lies
   * about a purchase is not a stub, it is a false receipt, and the honest
   * version of an unimplemented paywall is to say it is unimplemented: the plan
   * cards stay as a description of the tiers, the current one is marked, and the
   * other one carries a disabled control that says billing is not available yet.
   */

  protected async setMemberRole(email: string, role: string): Promise<void> {
    const previous = this.store.tenantMembers();
    try {
      await this.store.updateTenantMembers(
        previous.map(m => (m.email === email ? { ...m, role: role as MemberRole } : m)),
      );
    } catch {
      // The select is still showing the role the user picked and the server
      // kept the old one. Rebuild the row so the screen agrees with storage
      // again, and say so — the interceptor reported *why*, this says *what*.
      this.memberRev.update(n => n + 1);
      this.toast.error(this.i18n.t('toast.member.roleFailed'));
      return;
    }
    this.toast.success(this.i18n.t('toast.member.roleUpdated'));
  }

  protected async removeMember(email: string): Promise<void> {
    const member = this.store.tenantMembers().find(m => m.email === email);
    if (!member || member.role === 'Owner') {
      this.toast.flash(this.i18n.t('toast.member.ownerImmutable'));
      return;
    }

    const confirmed = await this.confirm.ask({
      titleKey: 'settings.access.remove.confirm.title',
      bodyKey: 'settings.access.remove.confirm.body',
      params: { name: member.name },
      confirmKey: 'settings.access.remove.confirm.ok',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await this.store.updateTenantMembers(
        this.store.tenantMembers().filter(m => m.email !== email),
      );
    } catch {
      this.toast.error(this.i18n.t('toast.member.removeFailed'));
      return;
    }
    this.toast.success(this.i18n.t('toast.member.removed'));
  }

  protected readonly exporting = signal(false);

  /**
   * Downloads collections *and* their images as one archive. The server builds
   * it: image bytes live on disk behind the API now, so a browser-side JSON blob
   * could only ever have exported the data without the pictures.
   */
  protected async exportArchive(): Promise<void> {
    if (this.exporting()) {
      return;
    }

    this.exporting.set(true);
    try {
      saveFile(await this.archives.downloadVault());
      this.toast.flash(this.i18n.t('toast.export.done'));
    } catch {
      // A failed download is otherwise silent — the anchor just never fires.
      this.toast.flash(this.i18n.t('toast.export.failed'));
    } finally {
      this.exporting.set(false);
    }
  }

  protected readonly importing = signal(false);
  protected readonly exportingCollection = signal<string | null>(null);

  /** One collection and the photos it uses, rather than the whole vault. */
  protected async exportCollection(collectionId: string): Promise<void> {
    if (this.exportingCollection()) {
      return;
    }

    this.exportingCollection.set(collectionId);
    try {
      saveFile(await this.archives.downloadCollection(collectionId));
      this.toast.flash(this.i18n.t('toast.export.collectionDone'));
    } catch {
      this.toast.flash(this.i18n.t('toast.export.failed'));
    } finally {
      this.exportingCollection.set(null);
    }
  }

  /**
   * Restores a `.zip` written by the export — one collection or a whole vault;
   * the server reads both through the same endpoint.
   *
   * An import only ever *adds*: a collection whose id is free comes back under
   * it, one whose id is taken lands beside it as a copy, and every photo is
   * re-uploaded under a fresh id. So there is nothing to confirm before running
   * it — no existing collection can be overwritten by it.
   */
  protected async importArchive(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared before anything can go wrong: without this, picking the very same
    // file after a failed attempt fires no `change` event and the button looks
    // dead.
    input.value = '';

    if (!file || this.importing()) {
      return;
    }

    await this.runImport(file);
  }

  /** The archive waiting on an answer, and the plan the dialog is showing. */
  private readonly pendingArchive = signal<File | null>(null);
  protected readonly importPlan = signal<ImportPlan | null>(null);

  /**
   * Answers the dialog: these ids get overwritten, everything else lands new.
   *
   * Each id travels with the version the plan reported for it. Without that the
   * server would be replacing a whole document on the strength of a read the
   * user made before a dialog and a second upload — and if the collection moved
   * in between, it asks again rather than overwriting work nobody chose to lose.
   */
  protected async applyImport(replace: string[]): Promise<void> {
    const file = this.pendingArchive();
    const plan = this.importPlan();
    if (!file || !plan) {
      return;
    }

    const chosen = new Set(replace);
    const decisions = plan.entries
      .filter(entry => entry.existingId && entry.existingVersion && chosen.has(entry.existingId))
      .map(entry => ({ id: entry.existingId!, version: entry.existingVersion! }));

    this.importPlan.set(null);
    this.pendingArchive.set(null);
    await this.runImport(file, decisions);
  }

  protected cancelImport(): void {
    this.importPlan.set(null);
    this.pendingArchive.set(null);
  }

  /**
   * One attempt at the import. Called twice at most: once blind, and again with
   * the user's answer if the server came back asking which collections to
   * overwrite.
   */
  private async runImport(file: File, replace?: ReplaceDecision[]): Promise<void> {
    this.importing.set(true);
    try {
      const imported = await this.store.importArchive(file, replace);
      this.toast.flash(
        this.i18n.t(
          imported.length === 1 ? 'toast.import.done.one' : 'toast.import.done.other',
          { n: imported.length },
        ),
      );
    } catch (error) {
      if (error instanceof ImportNeedsConfirmation) {
        // Nothing was written; the file is held so the answer can be sent with
        // it, and the dialog does the asking.
        this.pendingArchive.set(file);
        this.importPlan.set(error.plan);
        return;
      }

      // The server's own explanation when it gave one — it is localized, and it
      // is the only thing that can say *why* an archive was refused.
      const reason = error instanceof Error ? error.message : '';
      this.toast.flash(reason || this.i18n.t('toast.import.failed'));
    } finally {
      this.importing.set(false);
    }
  }
}
