import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { PLANS } from './plans';
import { ExportApi } from '../../core/api/export-api';
import { I18nService, MessageKey } from '../../core/i18n';
import { ThemeService } from '../../core/state/theme.service';
import { ToastService } from '../../core/state/toast.service';
import { VaultStore } from '../../core/state/vault.store';
import { MemberRole, PlanId } from '../../core/models';
import {
  SelectOption,
  TabDef,
  UiAvatar,
  UiButton,
  UiCard,
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
  imports: [TPipe, UiAvatar, UiButton, UiCard, UiSelect, UiTabs, UiToggle],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  protected readonly store = inject(VaultStore);
  protected readonly theme = inject(ThemeService);
  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly exportApi = inject(ExportApi);

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
      const blob = await this.exportApi.downloadArchive();
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob);
      anchor.download = 'vault-export.zip';
      anchor.click();
      URL.revokeObjectURL(anchor.href);
      this.toast.flash(this.i18n.t('toast.export.done'));
    } catch {
      // A failed download is otherwise silent — the anchor just never fires.
      this.toast.flash(this.i18n.t('toast.export.failed'));
    } finally {
      this.exporting.set(false);
    }
  }
}
