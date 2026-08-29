import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { I18nService, MessageKey } from '../../../core/i18n';
import { VaultConflictError } from '../../../core/api/vault-api';
import { ToastService } from '../../../core/state/toast.service';
import { ArchiveApi } from '../../../core/api/archive-api';
import { saveFile } from '../../../core/utils/download.util';
import { VaultStore } from '../../../core/state/vault.store';
import {
  Collection,
  GROUP_FIELD_TYPES,
  GroupFieldType,
  GroupNode,
  MemberRole,
  Section,
  SortDirection,
} from '../../../core/models';
import {
  canReparent,
  childrenOf,
  fieldsFor,
  flattenTree,
  groupById,
  pathOf,
  sortFor,
  subtreeIds,
} from '../../../core/utils/groups.util';
import {
  GroupDeletePlan,
  GroupDisposition,
  groupDeletePlan,
} from '../../../core/utils/group-delete.util';
import { groupMoveImpact } from '../../../core/utils/group-move.util';
import { sectionsOf } from '../../../core/utils/sections.util';
import { moveInList } from '../../../core/utils/sort.util';
import { SUPPORTED_CURRENCIES, currencyLabel, isCurrencyCode } from '../../../core/utils/money.util';
import { fieldSortKey, sortByOptions, sortLabel } from '../../../core/utils/sort.util';
import { TPipe } from '../../../shared/pipes/t.pipe';
import { GroupDeleteDialog } from './group-delete-dialog/group-delete-dialog';
import { GroupPicker } from './group-picker/group-picker';
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

/**
 * The parent picker's value for "no parent". A group id can never be empty, so
 * the empty string is unambiguous — and it is the same spelling an item uses for
 * "no group", which keeps one meaning for one character across the app.
 */
const ROOT_PARENT = '';

const PERSIST_DEBOUNCE_MS = 400;

/**
 * Edits a working copy of the collection; every mutation schedules a
 * debounced save through the store, and Done flushes immediately.
 */
@Component({
  selector: 'app-collection-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The page is a 720px column of forms — the right width for reading one
  // field per line. The groups tab is not that: it is a tree beside an editor,
  // and at 720px the editor gets 450 of them, which is where a section's name,
  // count, target and four buttons stop fitting on one line.
  host: { '[class.wide]': "activeTab() === 'groups'" },
  imports: [RouterLink, TPipe, GroupDeleteDialog, GroupPicker, UiAvatar, UiButton, UiCard, UiField, UiSelect, UiTabs, UiTextInput, UiTextarea, UiToggle],
  templateUrl: './collection-settings-page.html',
  styleUrl: './collection-settings-page.scss',
})
export class CollectionSettingsPage {
  protected readonly store = inject(VaultStore);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly archives = inject(ArchiveApi);

  readonly collectionId = input.required<string>();
  readonly tab = input<string>('general');
  /**
   * The group selected in the groups tab — the tree on the left, its editor on
   * the right. It is a route param rather than local state so that back works
   * and "the group I am fixing" is a link somebody can send; it is also what
   * `?g=` already carried when arriving here from a collection, so you land on
   * the branch you were just looking at.
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
  protected readonly pendingSectionGroupId = signal<string | null>(null);
  /**
   * A parent chosen in the picker but not yet applied, so the pane can say what
   * the move will change before it changes it. A move rewrites which fields
   * every item in the branch displays and which order they follow, and nothing
   * afterwards looks broken — so the preview is the feature, not decoration.
   */
  protected readonly pendingParent = signal<{ groupId: string; parentId: string | null } | null>(
    null,
  );
  /** The group whose deletion is being confirmed, if any. */
  protected readonly deletingGroupId = signal<string | null>(null);
  protected readonly pendingFieldType = signal<GroupFieldType>('text');
  protected readonly inviteEmail = signal('');
  protected readonly inviteRole = signal<string>('Viewer');
  /**
   * Which branches of the picker are open. Seeded with the path to whatever
   * `?g=` names, so arriving on a group five levels down opens showing it.
   */
  protected readonly pickerExpanded = signal<ReadonlySet<string>>(new Set());
  private expandedFor: string | null = null;

  private persistTimer: ReturnType<typeof setTimeout> | undefined;
  private draftFor: string | null = null;
  private autoSelectedFor: string | null = null;

  constructor() {
    effect(() => {
      const collection = this.store.collection(this.collectionId());
      if (collection && this.draftFor !== collection.id) {
        this.draftFor = collection.id;
        this.draft.set(structuredClone(collection));
      }
    });
    effect(() => this.activeTab.set(this.tab() || 'general'));

    // Opening on a group five levels down has to show it. Seeded once per
    // selection rather than continuously, so a branch the user folds by hand
    // stays folded.
    effect(() => {
      const draft = this.draft();
      const id = this.g();
      if (!draft || !id || this.expandedFor === id) return;
      this.expandedFor = id;
      const next = new Set(this.pickerExpanded());
      for (const node of pathOf(draft.groups, id)) next.add(node.id);
      this.pickerExpanded.set(next);
    });

    // Land on a group rather than on an empty pane. Arriving with no `?g=` used
    // to show an invitation beside a tree, which is a screen whose entire
    // content is an instruction — and the first group is the one the tree
    // already puts under the cursor. Once per collection, so clearing the
    // selection by hand (or by deleting the group) stays cleared.
    effect(() => {
      const draft = this.draft();
      if (!draft || this.activeTab() !== 'groups' || this.g()) return;
      if (this.autoSelectedFor === draft.id) return;
      const first = childrenOf(draft.groups, null)[0];
      if (!first) return;
      this.autoSelectedFor = draft.id;
      // Replaces, so back means "the page I came from" rather than "the same
      // page without a selection".
      this.select(first.id, true);
    });

    // A pending move belongs to the group that was on screen when it was
    // chosen. Selecting another group abandons it rather than carrying it over.
    effect(() => {
      const id = this.g() ?? null;
      const pending = this.pendingParent();
      if (pending && pending.groupId !== id) this.pendingParent.set(null);
    });
  }

  /** The group the tree has selected, or null when nothing is. */
  protected readonly selectedGroup = computed(() => {
    const draft = this.draft();
    const id = this.g();
    if (!draft || !id) return null;
    return draft.groups.find(group => group.id === id) ?? null;
  });

  /** Root → … → group, so the detail pane can say where you are. */
  protected readonly selectedPath = computed(() => {
    const draft = this.draft();
    const selected = this.selectedGroup();
    return draft && selected ? pathOf(draft.groups, selected.id) : [];
  });

  /**
   * Items in each group's whole subtree, for the tree's counts. A parent shown
   * as empty because everything under it sits in its children would be a lie,
   * and it is the number you look at when deciding whether a branch is safe to
   * delete.
   */
  protected readonly subtreeCounts = computed<ReadonlyMap<string, number>>(() => {
    const draft = this.draft();
    const out = new Map<string, number>();
    if (!draft) return out;
    for (const group of draft.groups) {
      const ids = new Set(subtreeIds(draft.groups, group.id));
      out.set(group.id, draft.items.filter(item => ids.has(item.groupId)).length);
    }
    return out;
  });

  /**
   * Everything the right-hand pane needs about the selected group. Null when
   * nothing is selected, which the template renders as an invitation rather
   * than as an empty editor.
   */
  protected readonly detail = computed(() => {
    const draft = this.draft();
    const node = this.selectedGroup();
    if (!draft || !node) return null;

    // The picker offers inherited fields too — ordering by a field the
    // parent declared is exactly what a sub-group usually wants.
    const fields = fieldsFor(draft.groups, node.id);
    const parentSort = node.parentId ? sortFor(draft.groups, node.parentId) : null;
    const own = draft.items.filter(i => i.groupId === node.id);
    const children = childrenOf(draft.groups, node.id);

    const pending = this.pendingParent();
    return {
      node,
      count: this.subtreeCounts().get(node.id) ?? 0,
      childCount: children.length,
      /**
       * Where the group could sit. The illegal targets are omitted rather than
       * refused after the fact — itself and its own descendants, which
       * `canReparent` decides — because a `<select>` can leave out what it
       * cannot accept, and a drop target cannot.
       */
      parentOptions: [
        { value: ROOT_PARENT, label: this.i18n.t('collSettings.groups.parentRoot') },
        ...flattenTree(draft.groups)
          .filter(row => canReparent(draft.groups, node.id, row.node.id))
          .map(row => ({
            value: row.node.id,
            // The same indent the item form's group picker uses, so one
            // hierarchy reads the same way wherever it is offered.
            label: (row.depth ? '   '.repeat(row.depth) + '↳ ' : '') + row.node.name,
          })),
      ] satisfies SelectOption[],
      /** The pending choice while one is being weighed up; otherwise the truth. */
      parentValue:
        pending && pending.groupId === node.id
          ? (pending.parentId ?? ROOT_PARENT)
          : (node.parentId ?? ROOT_PARENT),
      sections: sectionsOf(draft.sections, node.id).map(section => ({
        section,
        count: own.filter(i => i.sectionId === section.id).length,
        // Blank, not '0', for the same reason a group's target is blank:
        // blank is what writes the null back.
        target: section.target === null ? '' : String(section.target),
      })),
      /**
       * Offered only when every sub-group could become a divider. A partial
       * conversion would leave the group with children *and* sections — it
       * would still open as a board of cards, which is the very thing the
       * user was trying to stop.
       */
      convertible:
        children.length > 0 &&
        children.every(
          child =>
            childrenOf(draft.groups, child.id).length === 0 &&
            child.fields.length === 0 &&
            child.sort === null,
        ),
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

  /**
   * What the pending move would change, in sentences.
   *
   * Null when nothing is pending. Everything here is a consequence of two
   * inheritance rules — `fieldsFor` merges the whole ancestor path, `sortFor`
   * takes the nearest ancestor that sets one — so a move that looks like
   * dragging a folder quietly re-declares what every item in the branch shows.
   * The values themselves survive: a `custom` entry is keyed by field name and
   * simply stops being displayed, which is why the move is reversible and why
   * the copy says so.
   */
  protected readonly moveImpact = computed(() => {
    const pending = this.pendingParent();
    const draft = this.draft();
    const node = this.selectedGroup();
    if (!pending || !draft || !node || pending.groupId !== node.id) return null;

    const impact = groupMoveImpact(draft, node.id, pending.parentId);
    const parent = pending.parentId ? groupById(draft.groups, pending.parentId) : undefined;
    const t = this.i18n.t;

    return {
      heading: parent
        ? t('collSettings.groups.moveTo', { name: node.name, parent: parent.name })
        : t('collSettings.groups.moveToRoot', { name: node.name }),
      gained: impact.gained.length
        ? t('collSettings.groups.moveGained', { names: impact.gained.join(', ') })
        : '',
      lost: impact.lost.map(field =>
        field.holders
          ? t(
              field.holders === 1
                ? 'collSettings.groups.moveLost.one'
                : 'collSettings.groups.moveLost.other',
              { n: field.holders, name: field.name },
            )
          : t('collSettings.groups.moveLostNone', { name: field.name }),
      ),
      dormant: impact.lost.some(field => field.holders > 0)
        ? t('collSettings.groups.moveDormant')
        : '',
      order: !impact.orderChanges
        ? ''
        : impact.order
          ? t('collSettings.groups.moveOrder', { label: sortLabel(impact.order, t) })
          : t('collSettings.groups.moveOrderNone'),
      clash: impact.siblingClash
        ? t('collSettings.groups.moveClash', { name: impact.siblingClash })
        : '',
      nothing:
        !impact.gained.length && !impact.lost.length && !impact.orderChanges
          ? t('collSettings.groups.moveNothing')
          : '',
    };
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

  /**
   * Flushes the debounced save.
   *
   * Never rethrows, and never clears the draft. This page is a long-lived
   * working copy of the collection, so a refused save has to leave it exactly
   * as it is — the shell's conflict notice explains what happened and the user
   * decides whether to reload. Before this, a rejection here was unhandled: the
   * user kept typing into a draft that had silently stopped being saved.
   */
  private async persist(): Promise<void> {
    clearTimeout(this.persistTimer);
    const draft = this.draft();
    if (!draft) return;
    try {
      await this.store.updateCollection(draft);
    } catch (err) {
      if (err instanceof VaultConflictError) return;
      this.toast.flash(
        err instanceof Error ? err.message : this.i18n.t('toast.collection.saveFailed'),
      );
    }
  }

  // --- general ---

  protected setName(name: string): void {
    this.mutate(d => ({ ...d, name }));
  }

  protected setDescription(description: string): void {
    this.mutate(d => ({ ...d, description }));
  }

  protected readonly exporting = signal(false);

  /**
   * Downloads this collection alone, with the photos it uses.
   *
   * Sits beside the collection's own name and currency rather than only in
   * account settings: it is a thing you do *to this collection*, usually while
   * looking at it, and hunting for it in a list of every collection you own is
   * the long way round to the one already on screen.
   */
  protected async exportCollection(): Promise<void> {
    const draft = this.draft();
    if (!draft || this.exporting()) {
      return;
    }

    this.exporting.set(true);
    try {
      saveFile(await this.archives.downloadCollection(draft.id));
      this.toast.flash(this.i18n.t('toast.export.collectionDone'));
    } catch {
      // Otherwise silent: a failed download just never starts.
      this.toast.flash(this.i18n.t('toast.export.failed'));
    } finally {
      this.exporting.set(false);
    }
  }

  protected async deleteCollection(): Promise<void> {
    const draft = this.draft();
    if (!draft) return;
    await this.store.deleteCollection(draft.id);
    this.toast.flash(this.i18n.t('toast.collection.deleted'));
    void this.router.navigate(['/dashboard']);
  }

  // --- groups & fields ---

  /**
   * No frozen row order here any more, and the split is what removed the need.
   * The name lived in the same alphabetical list it sorted, so every keystroke
   * moved the focused input in the DOM and blurred it — renaming "Zeta" to
   * "Alpha" ended after the first letter, and a pin held the order until blur.
   * Now the field is in the detail pane and only the tree re-sorts, which
   * cannot touch focus.
   */
  protected renameGroup(id: string, name: string): void {
    this.mutate(d => ({
      ...d,
      groups: d.groups.map(g => (g.id === id ? { ...g, name } : g)),
    }));
  }

  // --- moving a group ---

  /**
   * Records a candidate parent. It is not applied yet: the pane first says what
   * the move changes, because a move silently re-declares the fields and the
   * order of every item in the branch and nothing afterwards looks wrong.
   *
   * An illegal target cannot arrive here — the picker never offers one — but the
   * guard runs anyway: this is a query param away from being user input.
   */
  protected onParentPicked(groupId: string, raw: string): void {
    const draft = this.draft();
    if (!draft) return;
    const parentId = raw === ROOT_PARENT ? null : raw;
    if ((groupById(draft.groups, groupId)?.parentId ?? null) === parentId) {
      this.pendingParent.set(null);
      return;
    }
    if (!canReparent(draft.groups, groupId, parentId)) return;
    this.pendingParent.set({ groupId, parentId });
  }

  /**
   * Applies the pending move, through the same debounced draft path as every
   * other edit here — so it is one guarded full-document PUT, not a special
   * case.
   *
   * Sections and items need no migration: a move changes the group's parent, not
   * its id, so every section still points at the group it always pointed at and
   * every item still points at the same section. Nothing here should ever grow a
   * loop that "fixes" them.
   */
  protected commitParentMove(): void {
    const pending = this.pendingParent();
    const draft = this.draft();
    this.pendingParent.set(null);
    if (!pending || !draft) return;
    if (!canReparent(draft.groups, pending.groupId, pending.parentId)) return;
    const name = groupById(draft.groups, pending.groupId)?.name ?? '';
    this.mutateGroup(pending.groupId, g => ({ ...g, parentId: pending.parentId }));
    // Re-seed the picker: the branch the group just landed in is folded, so
    // without this the selected group is nowhere on screen.
    this.expandedFor = null;
    this.toast.flash(this.i18n.t('toast.group.moved', { name }));
  }

  protected cancelParentMove(): void {
    this.pendingParent.set(null);
  }

  // --- deleting a group ---

  /**
   * Opens the confirmation. It used to refuse outright whenever any item existed
   * in the subtree ("move them first"), which was safe and also a dead end —
   * nothing in the app moved items in bulk — while an empty branch was deleted
   * silently, unconfirmed, with no count shown.
   */
  protected removeGroup(id: string): void {
    this.deletingGroupId.set(id);
  }

  /**
   * Applies one disposition. Every count the dialog showed and the graph saved
   * here come out of the same `groupDeletePlan` call, so the number read and the
   * change made cannot disagree.
   */
  protected applyDeletion(disposition: GroupDisposition): void {
    const draft = this.draft();
    const id = this.deletingGroupId();
    this.deletingGroupId.set(null);
    if (!draft || !id) return;

    const plan = groupDeletePlan(draft, id, disposition);
    if (!plan.groupIds.length) return;
    this.mutate(d => ({ ...d, ...plan.result }));
    this.toast.flash(this.deletionToast(disposition, plan));
    // Leaving `?g=` on a group that no longer exists renders the empty state
    // anyway, but the URL would go on claiming a selection that is gone. Under
    // "keep the contents" a selected sub-group survives, so only the ids the
    // plan actually removed count.
    if (plan.groupIds.includes(this.g() ?? '')) this.select(null);
  }

  private deletionToast(disposition: GroupDisposition, plan: GroupDeletePlan): string {
    if (!plan.itemCount && !plan.subGroupNames.length) {
      return this.i18n.t('toast.group.removed');
    }
    if (disposition === 'reparent') return this.i18n.t('toast.group.removedKeeping');
    if (!plan.itemCount) return this.i18n.t('toast.group.removed');
    return disposition === 'unfile'
      ? this.i18n.plural(
          plan.itemCount,
          'toast.group.removedUnfiled.one',
          'toast.group.removedUnfiled.other',
        )
      : this.i18n.plural(
          plan.itemCount,
          'toast.group.removedWithItems.one',
          'toast.group.removedWithItems.other',
        );
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
    // Straight into its editor: you create a group in order to configure it,
    // and a new row appearing somewhere alphabetical in the tree is not an
    // answer to "where did it go?".
    this.select(node.id);
  }

  /** Moves the selection, which is a query param like every other bit of state. */
  private select(groupId: string | null, replaceUrl = false): void {
    void this.router.navigate([], {
      queryParams: { tab: 'groups', g: groupId },
      queryParamsHandling: 'merge',
      replaceUrl,
    });
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

  // --- sections ---

  /**
   * Sections are edited here and nowhere else, which is deliberate: unlike a
   * group there is no tree to drop one into, and the only thing that needs
   * arranging — their order — is a property of the group they belong to.
   */
  protected newSectionKeydown(event: KeyboardEvent, groupId: string): void {
    const input = event.target as HTMLInputElement;
    if (event.key === 'Enter') this.commitNewSection(groupId, input.value);
    else if (event.key === 'Escape') {
      input.value = '';
      this.pendingSectionGroupId.set(null);
    }
  }

  protected commitNewSection(groupId: string, name: string): void {
    if (this.pendingSectionGroupId() !== groupId) return;
    this.pendingSectionGroupId.set(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    this.mutate(d => ({
      ...d,
      sections: [...d.sections, { id: `s${Date.now()}`, groupId, name: trimmed, target: null }],
    }));
    this.toast.flash(this.i18n.t('toast.section.added', { name: trimmed }));
  }

  protected renameSection(id: string, name: string): void {
    // No rename pin here, unlike groups: sections keep the order they were
    // arranged in, so a row cannot move out from under the cursor.
    this.mutate(d => ({
      ...d,
      sections: d.sections.map(s => (s.id === id ? { ...s, name } : s)),
    }));
  }

  /** Same "blank means unset" rule as a group's target. */
  protected setSectionTarget(id: string, raw: string): void {
    const parsed = Number.parseInt(raw.trim(), 10);
    const target = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    this.mutate(d => ({
      ...d,
      sections: d.sections.map(s => (s.id === id ? { ...s, target } : s)),
    }));
  }

  /**
   * Removes a divider. Unlike a group this never refuses: a section holds
   * nothing, it only labels, so its items simply fall into the unsectioned run
   * of the same group. Their `sectionId` is cleared rather than left dangling —
   * it would resolve to "no section" either way, but a stored reference to
   * something deleted is a thing to explain later.
   */
  protected removeSection(id: string): void {
    this.mutate(d => ({
      ...d,
      sections: d.sections.filter(s => s.id !== id),
      items: d.items.map(item => (item.sectionId === id ? { ...item, sectionId: '' } : item)),
    }));
    this.toast.flash(this.i18n.t('toast.section.removed'));
  }

  /** Moves a section within its group; the array order is the display order. */
  protected moveSection(groupId: string, from: number, to: number): void {
    this.mutate(d => {
      const mine = sectionsOf(d.sections, groupId);
      const reordered = moveInList(mine, from, to);
      if (reordered === mine) return d;
      // Rebuilt by walking the original array and handing back the reordered
      // ones in place, so sections of other groups keep their positions.
      const queue = [...reordered];
      return {
        ...d,
        sections: d.sections.map(s => (s.groupId === groupId ? queue.shift()! : s)),
      };
    });
  }

  /**
   * Turns every sub-group of `groupId` into a divider of it.
   *
   * This is the migration for a tree that used sub-groups as separators, which
   * is what they were reached for before there was anything else. Each child
   * becomes a section carrying its name and its target, its items move up to
   * the parent under that section, and the child group is deleted. Order starts
   * alphabetical — the order those children were already displayed in — and is
   * then the user's to arrange, which is the whole point.
   */
  protected convertChildrenToSections(groupId: string): void {
    const draft = this.draft();
    if (!draft) return;
    const children = childrenOf(draft.groups, groupId);
    if (!children.length) return;

    const sections: Section[] = children.map((child, index) => ({
      id: `s${Date.now()}${index}`,
      groupId,
      name: child.name,
      target: child.target,
    }));
    const sectionByGroup = new Map(children.map((child, index) => [child.id, sections[index].id]));

    this.mutate(d => ({
      ...d,
      groups: d.groups.filter(g => !sectionByGroup.has(g.id)),
      sections: [...d.sections, ...sections],
      items: d.items.map(item => {
        const sectionId = sectionByGroup.get(item.groupId);
        return sectionId ? { ...item, groupId, sectionId } : item;
      }),
    }));
    this.toast.flash(this.i18n.t('toast.section.converted', { n: children.length }));
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
