import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { I18nService, MessageKey } from '../../../core/i18n';
import { ToastService } from '../../../core/state/toast.service';
import { VaultStore } from '../../../core/state/vault.store';
import {
  Collection,
  GROUP_FIELD_TYPES,
  GroupFieldType,
  GroupNode,
  MemberRole,
  SortDirection,
} from '../../../core/models';
import { fieldsFor, flattenTree, pathOf, sortFor, subtreeIds } from '../../../core/utils/groups.util';
import { SUPPORTED_CURRENCIES, currencyLabel, isCurrencyCode } from '../../../core/utils/money.util';
import { fieldSortKey, sortByOptions, sortLabel } from '../../../core/utils/sort.util';
import { TPipe } from '../../../shared/pipes/t.pipe';
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

const TAB_KEYS: { id: string; label: MessageKey }[] = [
  { id: 'general', label: 'collSettings.tab.general' },
  { id: 'groups', label: 'collSettings.tab.groups' },
  { id: 'sharing', label: 'collSettings.tab.sharing' },
];

const ROLE_KEYS: { value: MemberRole; label: MessageKey }[] = [
  { value: 'Owner', label: 'role.owner' },
  { value: 'Editor', label: 'role.editor' },
  { value: 'Viewer', label: 'role.viewer' },
];

const INVITE_ROLE_KEYS: { value: MemberRole; label: MessageKey }[] = [
  { value: 'Viewer', label: 'role.viewer' },
  { value: 'Editor', label: 'role.editor' },
];

const FIELD_TYPE_KEYS: Record<GroupFieldType, MessageKey> = {
  text: 'fieldType.text',
  number: 'fieldType.number',
  date: 'fieldType.date',
};

const DIRECTION_KEYS: { value: SortDirection; label: MessageKey }[] = [
  { value: 'asc', label: 'direction.asc' },
  { value: 'desc', label: 'direction.desc' },
];

/** Sentinel for "this group defines no ordering of its own". */
const INHERIT = 'inherit';

const PERSIST_DEBOUNCE_MS = 400;

/**
 * Edits a working copy of the collection; every mutation schedules a
 * debounced save through the store, and Done flushes immediately.
 */
@Component({
  selector: 'app-collection-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe, UiAvatar, UiButton, UiCard, UiField, UiSelect, UiTabs, UiTextInput, UiTextarea, UiToggle],
  templateUrl: './collection-settings-page.html',
  styleUrl: './collection-settings-page.scss',
})
export class CollectionSettingsPage {
  protected readonly store = inject(VaultStore);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly collectionId = input.required<string>();
  readonly tab = input<string>('general');
  /**
   * Narrows the groups tab to one branch. A collection with forty groups is
   * unreadable as one flat indented list, and you almost always arrive here
   * wanting to fix the part you were just looking at.
   */
  readonly g = input<string | undefined>(undefined);

  // Computed, not module constants: the language can change while this page is
  // open and every label here has to follow it.
  protected readonly tabs = computed<TabDef[]>(() =>
    TAB_KEYS.map(t => ({ id: t.id, label: this.i18n.t(t.label) })),
  );
  protected readonly roleOptions = computed<SelectOption[]>(() =>
    ROLE_KEYS.map(r => ({ value: r.value, label: this.i18n.t(r.label) })),
  );
  protected readonly inviteRoleOptions = computed<SelectOption[]>(() =>
    INVITE_ROLE_KEYS.map(r => ({ value: r.value, label: this.i18n.t(r.label) })),
  );
  protected readonly fieldTypeOptions = computed<SelectOption[]>(() =>
    GROUP_FIELD_TYPES.map(t => ({ value: t, label: this.i18n.t(FIELD_TYPE_KEYS[t]) })),
  );
  protected readonly directionOptions = computed<SelectOption[]>(() =>
    DIRECTION_KEYS.map(d => ({ value: d.value, label: this.i18n.t(d.label) })),
  );

  /**
   * The supported codes, led by an explicit "follow the account" entry carrying
   * the empty string. That entry is not decoration: without it there is no way
   * back to inheriting once an override has been set, and the collection would
   * be pinned to whatever code was picked the day it was picked.
   */
  protected readonly currencyOverrideOptions = computed<SelectOption[]>(() => {
    const locale = this.i18n.locale();
    return [
      { value: '', label: this.i18n.t('collSettings.general.currencyInherit') },
      ...SUPPORTED_CURRENCIES.map(code => ({ value: code, label: currencyLabel(code, locale) })).sort(
        (a, b) => a.label.localeCompare(b.label, locale),
      ),
    ];
  });

  protected readonly activeTab = signal('general');
  protected readonly draft = signal<Collection | null>(null);
  protected readonly pendingGroupParent = signal<{ parentId: string | null } | null>(null);
  protected readonly pendingFieldGroupId = signal<string | null>(null);
  protected readonly pendingFieldType = signal<GroupFieldType>('text');
  protected readonly inviteEmail = signal('');
  protected readonly inviteRole = signal<string>('Viewer');
  /**
   * The row order frozen while a rename is being typed. Groups list
   * alphabetically, so without this the row would re-sort on every keystroke —
   * moving the focused input in the DOM, which blurs it, so renaming "Zeta" to
   * "Alpha" would end after the first letter. Captured on the first keystroke
   * and released on blur, when the list settles into its new order.
   */
  private readonly renameOrderPin = signal<string[] | null>(null);

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

  /** The branch the groups tab is scoped to, when `?g=` names a real group. */
  protected readonly scopeGroup = computed(() => {
    const draft = this.draft();
    const id = this.g();
    if (!draft || !id) return null;
    return draft.groups.find(group => group.id === id) ?? null;
  });

  protected readonly groupRows = computed(() => {
    const draft = this.draft();
    if (!draft) return [];
    const scope = this.scopeGroup();
    const scoped = scope ? new Set(subtreeIds(draft.groups, scope.id)) : null;
    // Indentation is relative to the branch, so a deeply nested group opens
    // flush left instead of pushed halfway across the card for no reason.
    const offset = scope ? pathOf(draft.groups, scope.id).length - 1 : 0;

    const pin = this.renameOrderPin();
    const pinned = pin ? new Map(pin.map((id, index) => [id, index])) : null;

    const rows = flattenTree(draft.groups).filter(({ node }) => !scoped || scoped.has(node.id));
    if (pinned) {
      // Stable sort, so a group the pin does not know about (there should be
      // none — the pin only outlives a keystroke) keeps its place at the end.
      rows.sort(
        (a, b) =>
          (pinned.get(a.node.id) ?? pinned.size) - (pinned.get(b.node.id) ?? pinned.size),
      );
    }

    return rows.map(({ node, depth }) => {
        // The picker offers inherited fields too — ordering by a field the
        // parent declared is exactly what a sub-group usually wants.
        const fields = fieldsFor(draft.groups, node.id);
        const parentSort = node.parentId ? sortFor(draft.groups, node.parentId) : null;
        return {
          node,
          depth: depth - offset,
          count: draft.items.filter(i => new Set(subtreeIds(draft.groups, node.id)).has(i.groupId))
            .length,
          sortBy: node.sort?.by ?? INHERIT,
          sortDirection: node.sort?.direction ?? 'asc',
          // Empty string, not '0': the input must read as blank when no target
          // is declared, and blank is what writes the null back.
          target: node.target === null ? '' : String(node.target),
          showDirection: !!node.sort && node.sort.by !== 'manual',
          sortByOptions: [
            {
              value: INHERIT,
              label: parentSort
                ? this.i18n.t('collSettings.groups.inherited', {
                    label: sortLabel(parentSort, this.i18n.t),
                  })
                : this.i18n.t('collSettings.groups.notSet'),
            },
            ...sortByOptions(fields, this.i18n.t),
          ] satisfies SelectOption[],
        };
      });
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
    if (!pending.parentId) return this.i18n.t('collSettings.groups.atRoot');
    const parent = draft.groups.find(g => g.id === pending.parentId);
    return this.i18n.t('collSettings.groups.inParent', { name: parent?.name ?? '' });
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
    this.toast.flash(this.i18n.t('toast.collection.deleted'));
    void this.router.navigate(['/dashboard']);
  }

  // --- groups & fields ---

  protected renameGroup(id: string, name: string): void {
    const draft = this.draft();
    if (draft && !this.renameOrderPin()) {
      this.renameOrderPin.set(flattenTree(draft.groups).map(row => row.node.id));
    }
    this.mutate(d => ({
      ...d,
      groups: d.groups.map(g => (g.id === id ? { ...g, name } : g)),
    }));
  }

  /** Leaving the rename field lets the list re-sort into the new alphabetical order. */
  protected endRename(): void {
    this.renameOrderPin.set(null);
  }

  protected removeGroup(id: string): void {
    const draft = this.draft();
    if (!draft) return;
    const ids = subtreeIds(draft.groups, id);
    if (draft.items.some(i => ids.includes(i.groupId))) {
      this.toast.flash(this.i18n.t('toast.group.hasItems'));
      return;
    }
    this.mutate(d => ({ ...d, groups: d.groups.filter(g => !ids.includes(g.id)) }));
    this.toast.flash(this.i18n.t('toast.group.removed'));
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
    const node: GroupNode = {
      id: `g${Date.now()}`,
      name: trimmed,
      parentId: pending.parentId,
      fields: [],
      sort: null,
      target: null,
    };
    this.mutate(d => ({ ...d, groups: [...d.groups, node] }));
    this.toast.flash(this.i18n.t('toast.group.added', { name: trimmed }));
  }

  private mutateGroup(groupId: string, fn: (group: GroupNode) => GroupNode): void {
    this.mutate(d => ({ ...d, groups: d.groups.map(g => (g.id === groupId ? fn(g) : g)) }));
  }

  protected removeField(groupId: string, name: string): void {
    this.mutateGroup(groupId, g => ({
      ...g,
      fields: g.fields.filter(f => f.name !== name),
      // A sort pointing at a field that no longer exists would silently fall
      // back to "everything missing" — drop it with the field.
      sort: g.sort?.by === fieldSortKey(name) ? null : g.sort,
    }));
    this.toast.flash(this.i18n.t('toast.field.removed'));
  }

  protected setFieldType(groupId: string, name: string, type: string): void {
    this.mutateGroup(groupId, g => ({
      ...g,
      fields: g.fields.map(f => (f.name === name ? { ...f, type: type as GroupFieldType } : f)),
    }));
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
    const type = this.pendingFieldType();
    this.pendingFieldGroupId.set(null);
    this.pendingFieldType.set('text');
    const trimmed = name.trim();
    if (!trimmed) return;
    if (this.draft()?.groups.find(g => g.id === groupId)?.fields.some(f => f.name === trimmed)) {
      this.toast.flash(this.i18n.t('toast.field.duplicate', { name: trimmed }));
      return;
    }
    this.mutateGroup(groupId, g => ({ ...g, fields: [...g.fields, { name: trimmed, type }] }));
    this.toast.flash(this.i18n.t('toast.field.added', { name: trimmed }));
  }

  // --- group ordering ---

  protected setGroupSortBy(groupId: string, by: string): void {
    this.mutateGroup(groupId, g => ({
      ...g,
      sort: by === INHERIT ? null : { by, direction: g.sort?.direction ?? 'asc' },
    }));
  }

  protected setGroupSortDirection(groupId: string, direction: string): void {
    this.mutateGroup(groupId, g =>
      g.sort ? { ...g, sort: { ...g.sort, direction: direction as SortDirection } } : g,
    );
  }

  // --- group target ---

  /**
   * Empty, non-numeric and non-positive all mean "no target". Keeping one
   * representation of unset is what lets every surface treat a null denominator
   * as "measure against what's catalogued" without a second special case.
   */
  protected setGroupTarget(groupId: string, raw: string): void {
    const parsed = Number.parseInt(raw.trim(), 10);
    const target = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    this.mutateGroup(groupId, g => ({ ...g, target }));
  }

  // --- sharing ---

  protected invite(): void {
    const email = this.inviteEmail().trim();
    if (!email || !email.includes('@')) {
      this.toast.flash(this.i18n.t('toast.invite.invalidEmail'));
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
    this.toast.flash(this.i18n.t('toast.invite.sent'));
  }

  protected setMemberRole(email: string, role: string): void {
    this.mutate(d => ({
      ...d,
      members: d.members.map(m => (m.email === email ? { ...m, role: role as MemberRole } : m)),
    }));
    this.toast.flash(this.i18n.t('toast.member.roleUpdated'));
  }

  protected removeMember(email: string, fixed: boolean): void {
    if (fixed) {
      this.toast.flash(this.i18n.t('toast.member.ownerImmutable'));
      return;
    }
    this.mutate(d => ({ ...d, members: d.members.filter(m => m.email !== email) }));
    this.toast.flash(this.i18n.t('toast.member.removed'));
  }

  protected setLinkShare(on: boolean): void {
    this.mutate(d => ({ ...d, linkShare: on }));
  }

  /** The empty option means "follow the account", which is stored as null. */
  protected setCurrency(code: string): void {
    this.mutate(d => ({ ...d, currency: isCurrencyCode(code) ? code : null }));
  }

  // --- done ---

  protected async done(): Promise<void> {
    await this.persist();
    this.toast.flash(this.i18n.t('toast.collection.updated'));
    // Back to the group you came from, not to the collection root — arriving
    // here scoped and leaving unscoped loses your place.
    void this.router.navigate(['/c', this.collectionId()], {
      queryParams: this.g() ? { g: this.g() } : {},
    });
  }
}
