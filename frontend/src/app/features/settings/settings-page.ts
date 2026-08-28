import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { PLANS } from './plans';
import { ArchiveApi } from '../../core/api/archive-api';
import { I18nService, MessageKey } from '../../core/i18n';
import { ThemeService } from '../../core/state/theme.service';
import { ToastService } from '../../core/state/toast.service';
import { VaultStore } from '../../core/state/vault.store';
import { MemberRole, PlanId } from '../../core/models';
import { saveFile } from '../../core/utils/download.util';
import { CurrencyCode, SUPPORTED_CURRENCIES, currencyLabel } from '../../core/utils/money.util';
import {
  SelectOption,
  TabDef,
  UiAvatar,
  UiButton,
  UiCard,
  UiFlag,
  UiSelect,
  UiTabs,
  UiToggle,
} from '../../shared/ui';
import { TPipe } from '../../shared/pipes/t.pipe';

const TAB_KEYS: { id: string; label: MessageKey }[] = [
  { id: 'appearance', label: 'settings.tab.appearance' },
  { id: 'plan', label: 'settings.tab.plan' },
  { id: 'access', label: 'settings.tab.access' },
  { id: 'account', label: 'settings.tab.account' },
];

const ROLE_KEYS: { value: MemberRole; label: MessageKey }[] = [
  { value: 'Owner', label: 'role.owner' },
  { value: 'Editor', label: 'role.editor' },
  { value: 'Viewer', label: 'role.viewer' },
];

interface PolicyDef {
  key: 'invites' | 'link' | 'external';
  label: MessageKey;
  description: MessageKey;
}

const POLICIES: PolicyDef[] = [
  {
    key: 'invites',
    label: 'settings.access.policy.invites.label',
    description: 'settings.access.policy.invites.description',
  },
  {
    key: 'link',
    label: 'settings.access.policy.link.label',
    description: 'settings.access.policy.link.description',
  },
  {
    key: 'external',
    label: 'settings.access.policy.external.label',
    description: 'settings.access.policy.external.description',
  },
];

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiAvatar, UiButton, UiCard, UiFlag, UiSelect, UiTabs, UiToggle],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  protected readonly store = inject(VaultStore);
  protected readonly theme = inject(ThemeService);
  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly archives = inject(ArchiveApi);

  readonly tab = input<string>('appearance');

  protected readonly plans = PLANS;
  protected readonly policyDefs = POLICIES;

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

  protected readonly activeTab = signal('appearance');
  protected readonly policies = signal<Record<PolicyDef['key'], boolean>>({
    invites: true,
    link: true,
    external: false,
  });

  constructor() {
    effect(() => this.activeTab.set(this.tab() || 'appearance'));
  }

  protected readonly planSub = computed(() =>
    this.i18n.t(this.store.profile()?.plan === 'pro' ? 'settings.plan.onPro' : 'settings.plan.onFree'),
  );

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
      this.toast.flash(this.i18n.t('toast.currency.saved'));
    } catch {
      this.toast.flash(this.i18n.t('toast.currency.failed'));
    }
  }

  protected async choosePlan(plan: PlanId): Promise<void> {
    const profile = this.store.profile();
    if (!profile || profile.plan === plan) return;
    await this.store.updateProfile({ ...profile, plan });
    this.toast.flash(this.i18n.t(plan === 'pro' ? 'toast.plan.pro' : 'toast.plan.free'));
  }

  protected togglePolicy(key: PolicyDef['key']): void {
    this.policies.update(all => ({ ...all, [key]: !all[key] }));
  }

  protected async setMemberRole(email: string, role: string): Promise<void> {
    await this.store.updateTenantMembers(
      this.store.tenantMembers().map(m => (m.email === email ? { ...m, role: role as MemberRole } : m)),
    );
    this.toast.flash(this.i18n.t('toast.member.roleUpdated'));
  }

  protected async removeMember(email: string): Promise<void> {
    const member = this.store.tenantMembers().find(m => m.email === email);
    if (!member || member.role === 'Owner') {
      this.toast.flash(this.i18n.t('toast.member.ownerImmutable'));
      return;
    }
    await this.store.updateTenantMembers(this.store.tenantMembers().filter(m => m.email !== email));
    this.toast.flash(this.i18n.t('toast.member.removed'));
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

    this.importing.set(true);
    try {
      const imported = await this.store.importArchive(file);
      this.toast.flash(
        this.i18n.t(
          imported.length === 1 ? 'toast.import.done.one' : 'toast.import.done.other',
          { n: imported.length },
        ),
      );
    } catch (error) {
      // The server's own explanation when it gave one — it is localized, and it
      // is the only thing that can say *why* an archive was refused.
      const reason = error instanceof Error ? error.message : '';
      this.toast.flash(reason || this.i18n.t('toast.import.failed'));
    } finally {
      this.importing.set(false);
    }
  }
}
