import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { PLANS } from './plans';
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

const TABS: TabDef[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'plan', label: 'Plan' },
  { id: 'access', label: 'Sharing & access' },
  { id: 'account', label: 'Account & data' },
];

const ROLE_OPTIONS: SelectOption[] = [
  { value: 'Owner', label: 'Owner' },
  { value: 'Editor', label: 'Can edit' },
  { value: 'Viewer', label: 'Can view' },
];

interface PolicyDef {
  key: 'invites' | 'link' | 'external';
  label: string;
  description: string;
}

const POLICIES: PolicyDef[] = [
  { key: 'invites', label: 'Members can share collections', description: 'Editors may invite new people to collections they can edit' },
  { key: 'link', label: 'Link sharing', description: 'Allow view-only links for collections in this tenant' },
  { key: 'external', label: 'External sharing', description: 'Allow sharing with people outside @airia.com' },
];

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiAvatar, UiButton, UiCard, UiSelect, UiTabs, UiToggle],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  protected readonly store = inject(VaultStore);
  protected readonly theme = inject(ThemeService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly tab = input<string>('appearance');

  protected readonly tabs = TABS;
  protected readonly plans = PLANS;
  protected readonly policyDefs = POLICIES;
  protected readonly roleOptions = ROLE_OPTIONS;

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
    this.store.profile()?.plan === 'pro'
      ? 'You are on Pro — thanks for supporting Vault.'
      : 'You are on Free — upgrade to unlock custom fields, photos and backups.',
  );

  protected onTabChange(tab: string): void {
    this.activeTab.set(tab);
    void this.router.navigate([], { queryParams: { tab }, queryParamsHandling: 'merge' });
  }

  protected async choosePlan(plan: PlanId): Promise<void> {
    const profile = this.store.profile();
    if (!profile || profile.plan === plan) return;
    await this.store.updateProfile({ ...profile, plan });
    this.toast.flash(plan === 'pro' ? 'Welcome to Pro ✓' : 'Switched to Free');
  }

  protected togglePolicy(key: PolicyDef['key']): void {
    this.policies.update(all => ({ ...all, [key]: !all[key] }));
  }

  protected async setMemberRole(email: string, role: string): Promise<void> {
    await this.store.updateTenantMembers(
      this.store.tenantMembers().map(m => (m.email === email ? { ...m, role: role as MemberRole } : m)),
    );
    this.toast.flash('Role updated');
  }

  protected async removeMember(email: string): Promise<void> {
    const member = this.store.tenantMembers().find(m => m.email === email);
    if (!member || member.role === 'Owner') {
      this.toast.flash("The owner can't be removed");
      return;
    }
    await this.store.updateTenantMembers(this.store.tenantMembers().filter(m => m.email !== email));
    this.toast.flash('Access removed');
  }

  protected exportJson(): void {
    const blob = new Blob([JSON.stringify(this.store.collections(), null, 2)], {
      type: 'application/json',
    });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = 'vault-export.json';
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    this.toast.flash('Exported vault-export.json ✓');
  }
}
