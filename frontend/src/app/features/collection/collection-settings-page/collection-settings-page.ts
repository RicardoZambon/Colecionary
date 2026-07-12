import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ToastService } from '../../../core/state/toast.service';
import { VaultStore } from '../../../core/state/vault.store';
import { Collection, GroupNode, MemberRole } from '../../../core/models';
import { flattenTree, subtreeIds } from '../../../core/utils/groups.util';
import {
  SelectOption,
  TabDef,
  UiAvatar,
  UiButton,
  UiCard,
  UiField,
  UiSelect,
  UiTabs,
  UiTextInput,
  UiTextarea,
  UiToggle,
} from '../../../shared/ui';

const TABS: TabDef[] = [
  { id: 'general', label: 'General' },
  { id: 'groups', label: 'Groups & fields' },
  { id: 'sharing', label: 'Sharing' },
];

const ROLE_OPTIONS: SelectOption[] = [
  { value: 'Owner', label: 'Owner' },
  { value: 'Editor', label: 'Can edit' },
  { value: 'Viewer', label: 'Can view' },
];

const INVITE_ROLE_OPTIONS: SelectOption[] = [
  { value: 'Viewer', label: 'Can view' },
  { value: 'Editor', label: 'Can edit' },
];

const PERSIST_DEBOUNCE_MS = 400;

/**
 * Edits a working copy of the collection; every mutation schedules a
 * debounced save through the store, and Done flushes immediately.
 */
@Component({
  selector: 'app-collection-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, UiAvatar, UiButton, UiCard, UiField, UiSelect, UiTabs, UiTextInput, UiTextarea, UiToggle],
  templateUrl: './collection-settings-page.html',
  styleUrl: './collection-settings-page.scss',
})
export class CollectionSettingsPage {
  protected readonly store = inject(VaultStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly collectionId = input.required<string>();
  readonly tab = input<string>('general');

  protected readonly tabs = TABS;
  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly inviteRoleOptions = INVITE_ROLE_OPTIONS;

  protected readonly activeTab = signal('general');
  protected readonly draft = signal<Collection | null>(null);
  protected readonly pendingGroupParent = signal<{ parentId: string | null } | null>(null);
  protected readonly pendingFieldGroupId = signal<string | null>(null);
  protected readonly inviteEmail = signal('');
  protected readonly inviteRole = signal<string>('Viewer');

  private persistTimer: ReturnType<typeof setTimeout> | undefined;
  private draftFor: string | null = null;

  constructor() {
    effect(() => {
      const collection = this.store.collection(this.collectionId());
      if (collection && this.draftFor !== collection.id) {
        this.draftFor = collection.id;
        this.draft.set(structuredClone(collection));
      }
    });
    effect(() => this.activeTab.set(this.tab() || 'general'));
  }

  protected readonly groupRows = computed(() => {
    const draft = this.draft();
    if (!draft) return [];
    return flattenTree(draft.groups).map(({ node, depth }) => ({
      node,
      depth,
      count: draft.items.filter(i => new Set(subtreeIds(draft.groups, node.id)).has(i.groupId)).length,
    }));
  });

  protected readonly memberRows = computed(() => {
    const draft = this.draft();
    if (!draft) return [];
    const owner = this.store.tenantMembers().find(m => m.role === 'Owner');
    const rows = owner ? [owner, ...draft.members] : [...draft.members];
    return rows.map((member, index) => ({ member, fixed: index === 0 && !!owner }));
  });

  protected readonly newGroupContext = computed(() => {
    const pending = this.pendingGroupParent();
    const draft = this.draft();
    if (!pending || !draft) return '';
    if (!pending.parentId) return '● ROOT GROUP';
    const parent = draft.groups.find(g => g.id === pending.parentId);
    return `↳ IN ${(parent?.name ?? '').toUpperCase()}`;
  });

  // --- tab handling ---

  protected onTabChange(tab: string): void {
    this.activeTab.set(tab);
    void this.router.navigate([], { queryParams: { tab }, queryParamsHandling: 'merge' });
  }

  // --- draft mutation plumbing ---

  private mutate(fn: (draft: Collection) => Collection): void {
    const draft = this.draft();
    if (!draft) return;
    const next = fn(draft);
    this.draft.set(next);
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => void this.persist(), PERSIST_DEBOUNCE_MS);
  }

  private async persist(): Promise<void> {
    clearTimeout(this.persistTimer);
    const draft = this.draft();
    if (draft) await this.store.updateCollection(draft);
  }

  // --- general ---

  protected setName(name: string): void {
    this.mutate(d => ({ ...d, name }));
  }

  protected setDescription(description: string): void {
    this.mutate(d => ({ ...d, description }));
  }

  protected async deleteCollection(): Promise<void> {
    const draft = this.draft();
    if (!draft) return;
    await this.store.deleteCollection(draft.id);
    this.toast.flash('Collection deleted');
    void this.router.navigate(['/dashboard']);
  }

  // --- groups & fields ---

  protected renameGroup(id: string, name: string): void {
    this.mutate(d => ({
      ...d,
      groups: d.groups.map(g => (g.id === id ? { ...g, name } : g)),
    }));
  }

  protected removeGroup(id: string): void {
    const draft = this.draft();
    if (!draft) return;
    const ids = subtreeIds(draft.groups, id);
    if (draft.items.some(i => ids.includes(i.groupId))) {
      this.toast.flash('Group has items — move them first');
      return;
    }
    this.mutate(d => ({ ...d, groups: d.groups.filter(g => !ids.includes(g.id)) }));
    this.toast.flash('Group removed');
  }

  protected newGroupKeydown(event: KeyboardEvent): void {
    const input = event.target as HTMLInputElement;
    if (event.key === 'Enter') this.commitNewGroup(input.value);
    else if (event.key === 'Escape') {
      input.value = '';
      this.pendingGroupParent.set(null);
    }
  }

  protected commitNewGroup(name: string): void {
    const pending = this.pendingGroupParent();
    this.pendingGroupParent.set(null);
    const trimmed = name.trim();
    if (!pending || !trimmed) return;
    const node: GroupNode = { id: `g${Date.now()}`, name: trimmed, parentId: pending.parentId, fields: [] };
    this.mutate(d => ({ ...d, groups: [...d.groups, node] }));
    this.toast.flash(`Group "${trimmed}" added`);
  }

  protected removeField(groupId: string, field: string): void {
    this.mutate(d => ({
      ...d,
      groups: d.groups.map(g =>
        g.id === groupId ? { ...g, fields: g.fields.filter(f => f !== field) } : g,
      ),
    }));
    this.toast.flash('Field removed');
  }

  protected newFieldKeydown(event: KeyboardEvent, groupId: string): void {
    const input = event.target as HTMLInputElement;
    if (event.key === 'Enter') this.commitNewField(groupId, input.value);
    else if (event.key === 'Escape') {
      input.value = '';
      this.pendingFieldGroupId.set(null);
    }
  }

  protected commitNewField(groupId: string, name: string): void {
    if (this.pendingFieldGroupId() !== groupId) return;
    this.pendingFieldGroupId.set(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    this.mutate(d => ({
      ...d,
      groups: d.groups.map(g =>
        g.id === groupId ? { ...g, fields: [...g.fields, trimmed] } : g,
      ),
    }));
    this.toast.flash(`Field "${trimmed}" added`);
  }

  // --- sharing ---

  protected invite(): void {
    const email = this.inviteEmail().trim();
    if (!email || !email.includes('@')) {
      this.toast.flash('Enter a valid email');
      return;
    }
    const name = email
      .split('@')[0]
      .replace(/[._-]/g, ' ')
      .replace(/\b\w/g, ch => ch.toUpperCase());
    const initials = name
      .split(' ')
      .map(w => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    this.mutate(d => ({
      ...d,
      members: [...d.members, { name, email, initials, role: this.inviteRole() as MemberRole }],
    }));
    this.inviteEmail.set('');
    this.toast.flash('Invite sent ✓');
  }

  protected setMemberRole(email: string, role: string): void {
    this.mutate(d => ({
      ...d,
      members: d.members.map(m => (m.email === email ? { ...m, role: role as MemberRole } : m)),
    }));
    this.toast.flash('Role updated');
  }

  protected removeMember(email: string, fixed: boolean): void {
    if (fixed) {
      this.toast.flash("The owner can't be removed");
      return;
    }
    this.mutate(d => ({ ...d, members: d.members.filter(m => m.email !== email) }));
    this.toast.flash('Access removed');
  }

  protected setLinkShare(on: boolean): void {
    this.mutate(d => ({ ...d, linkShare: on }));
  }

  // --- done ---

  protected async done(): Promise<void> {
    await this.persist();
    this.toast.flash('Collection updated ✓');
    void this.router.navigate(['/c', this.collectionId()]);
  }
}
