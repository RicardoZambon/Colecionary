import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { I18nService, MessageKey } from '../../../core/i18n';
import {
  VaultBusyError,
  VaultConflictError,
  isReportedWriteFailure,
} from '../../../core/api/vault-api';
import { ConfirmService } from '../../../core/state/confirm.service';
import { ToastService } from '../../../core/state/toast.service';
import { ArchiveApi } from '../../../core/api/archive-api';
import { saveFile } from '../../../core/utils/download.util';
import { VaultStore } from '../../../core/state/vault.store';
import {
  Collection,
  CustomFieldValue,
  FIELD_SCOPES,
  FieldScope,
  GROUP_FIELD_TYPES,
  GroupField,
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
  groupOptionLabel,
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
import { MovePreview } from './move-preview/move-preview';
import {
  SelectOption,
  TabDef,
  UiAvatar,
  UiButton,
  UiCard,
  UiField,
  UiIcon,
  UiInlineEdit,
  UiReorder,
  UiSelect,
  UiSkeleton,
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

/**
 * The owner id standing for the collection itself in every field handler.
 *
 * A literal rather than null so the handlers keep one signature and the
 * template one set of bindings; `@` is outside the id pattern the server
 * enforces (`^[A-Za-z0-9_.:-]{1,64}$`), so no group can ever answer to it.
 */
const COLLECTION_FIELDS = '@collection';

const FIELD_SCOPE_KEYS: Record<FieldScope, MessageKey> = {
  item: 'fieldScope.item',
  copy: 'fieldScope.copy',
};

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
 * The shape the server enforces, so the client refuses what the server would.
 *
 * Deliberately the *server's* rule and not a stricter guess: a client that
 * refuses an address the API would have accepted is a bug the user cannot work
 * around. `EmailAddress()` in `CollectionValidators` is what this mirrors, and
 * the two move together.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TPipe,
    GroupDeleteDialog,
    GroupPicker,
    MovePreview,
    UiAvatar,
    UiButton,
    UiCard,
    UiField,
    UiIcon,
    UiInlineEdit,
    UiReorder,
    UiSelect,
    UiSkeleton,
    UiTabs,
    UiTextInput,
    UiTextarea,
    UiToggle,
  ],
  templateUrl: './collection-settings-page.html',
  styleUrl: './collection-settings-page.scss',
})
export class CollectionSettingsPage {
  protected readonly store = inject(VaultStore);

  /** The vault is still in flight — not the same fact as 'no such collection'. */
  protected readonly loading = computed(() => !this.store.loaded());
  private readonly i18n = inject(I18nService);

  /**
   * "1 item" / "12 itens" beside a group or a section — the shared count phrase
   * rather than a bespoke `{n} items` key, which rendered "1 itens".
   */
  protected readonly itemCount = (n: number): string => this.i18n.count(n, 'item');
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
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
  protected readonly fieldScopeOptions = computed<SelectOption[]>(() =>
    FIELD_SCOPES.map(scope => ({ value: scope, label: this.i18n.t(FIELD_SCOPE_KEYS[scope]) })),
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

  /**
   * A scope change whose question is on screen.
   *
   * The select has to keep showing what the user picked while they answer, and
   * has to snap back if they decline — and `[value]` bound straight to
   * `field.scope` would do neither: the binding never changes, so Angular never
   * rewrites the control, and a declined change left the dropdown reading
   * "per copy" over a field that is still per item.
   */
  protected readonly rescoping = signal<{ owner: string; name: string; scope: FieldScope } | null>(
    null,
  );

  /**
   * The document in the vault moved while this page held a draft, so autosave
   * is off and the banner above the tabs is the only way out.
   *
   * Two situations, one state: a save was refused (the version this page quotes
   * is dead, so every further save would be refused too), or the store reloaded
   * under an unsent edit (the next save would be a wholesale overwrite of work
   * this page never saw). Both end with "your work is on screen and nothing is
   * being written", which is exactly one decision to offer.
   */
  protected readonly stale = signal(false);

  /** The last save this page asked for landed, and nothing has changed since. */
  private readonly lastSaveOk = signal(false);

  /**
   * What the row above the Done button says about the save.
   *
   * The note beside it reads "every change here is saved as you make it", which
   * was the only thing on the page about saving at all — no indicator that a
   * write was running, had landed, or had been refused. Announced through
   * `role="status"` rather than drawn only, because "it did not save" is the
   * half a sighted user notices by the absence of a tick.
   */
  protected readonly saveState = computed(() => {
    if (this.store.saving(this.collectionId())) return this.i18n.t('collSettings.saving');
    if (this.stale()) return this.i18n.t('collSettings.notSaved');
    return this.lastSaveOk() ? this.i18n.t('collSettings.saved') : '';
  });

  /** Exposed so the shared field editor can be pointed at the collection. */
  protected readonly collectionOwner = COLLECTION_FIELDS;
  protected readonly inviteEmail = signal('');
  protected readonly inviteRole = signal<string>('Viewer');
  /** Why the last attempt was refused, shown on the field itself. */
  protected readonly inviteError = signal('');
  /**
   * Which branches of the picker are open. Seeded with the path to whatever
   * `?g=` names, so arriving on a group five levels down opens showing it.
   */
  protected readonly pickerExpanded = signal<ReadonlySet<string>>(new Set());
  private expandedFor: string | null = null;

  private persistTimer: ReturnType<typeof setTimeout> | undefined;
  private draftFor: string | null = null;
  /**
   * The exact store object this draft was cloned from, compared by reference.
   *
   * `collectionsState` is rebuilt wholesale by `load()` and per collection by a
   * successful write, so a new object *is* the signal that the document moved.
   * Without this the page cloned once per id and never again: after a reload
   * the draft was a pre-conflict document that the next keystroke happily PUT
   * over everybody else's work, with the fresh version token making the server
   * accept it.
   */
  private draftSource: Collection | null = null;
  /**
   * A write of ours is in flight, so the next document to arrive is our own
   * echo rather than somebody else's save.
   *
   * Causal rather than a content comparison: the draft may already hold
   * keystrokes made while the PUT was travelling, so "the incoming document
   * differs from mine" cannot tell the two apart.
   */
  private awaitingEcho = false;
  private autoSelectedFor: string | null = null;
  /** The preview panel, scrolled into view when a move is first weighed up. */
  private readonly movePreview = viewChild<ElementRef<HTMLElement>>('movePreview');

  constructor() {
    effect(() => {
      const collection = this.store.collection(this.collectionId());
      if (!collection) return;

      if (this.draftFor !== collection.id) {
        this.adopt(collection);
        return;
      }
      if (collection === this.draftSource) return;

      // Our own save came back. The draft is kept — it may hold keystrokes made
      // while the PUT was travelling — and only the document it is measured
      // against moves forward.
      if (this.awaitingEcho) {
        this.awaitingEcho = false;
        this.draftSource = collection;
        return;
      }

      // Somebody else's document. With nothing unsent and no question already
      // on screen there is nothing of the user's to lose, so the page simply
      // follows; otherwise the draft is the only copy of unsaved work and the
      // choice is theirs to make.
      if (this.persistTimer === undefined && !this.stale()) {
        this.adopt(collection);
        return;
      }
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
      this.draftSource = collection;
      this.stale.set(true);
    });

    // Narrowed against the whitelist, like every other query param in the app:
    // any non-empty value used to survive and left the strip highlighting
    // nothing while the switch fell through to General.
    effect(() => {
      const wanted = this.tab();
      this.activeTab.set(TAB_KEYS.some(t => t.id === wanted) ? wanted : 'general');
    });

    // A five-level branch renders the preview below the fold, where a panel
    // that appeared because of a dropdown two lines up is indistinguishable
    // from nothing having happened.
    afterRenderEffect(() => {
      this.movePreview()?.nativeElement.scrollIntoView({ block: 'nearest' });
    });

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
      if (!pending || pending.groupId === id) return;
      this.pendingParent.set(null);
      // Said out loud, because the select was showing the new parent: walking
      // away from a preview used to look exactly like having completed it.
      const name = this.draft()?.groups.find(g => g.id === pending.groupId)?.name ?? '';
      this.toast.flash(this.i18n.t('toast.group.moveDiscarded', { name }));
    });
  }

  /** Clones a fresh document and forgets everything the old draft was mid-way through. */
  private adopt(collection: Collection): void {
    this.draftFor = collection.id;
    this.draftSource = collection;
    this.awaitingEcho = false;
    this.stale.set(false);
    clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    this.draft.set(structuredClone(collection));
  }

  /**
   * Takes the version in the vault, losing whatever this page still held.
   *
   * The reload is the load-bearing half: a draft re-cloned from the cached
   * document would quote a version token the server has already moved past, so
   * the very next keystroke would be refused all over again.
   */
  protected async takeLatest(): Promise<void> {
    try {
      await this.store.load();
    } catch {
      this.toast.error(this.i18n.t('conflict.reloadFailed'));
      return;
    }
    const fresh = this.store.collection(this.collectionId());
    if (fresh) this.adopt(fresh);
  }

  /**
   * Keeps the draft and re-arms the save, which overwrites what was stored.
   *
   * Informed, and that is the whole difference from what this page used to do
   * on its own. `draftSource` moves to the document being written over so the
   * same banner does not fire again on the echo.
   */
  protected keepMine(): void {
    const current = this.store.collection(this.collectionId());
    if (current) this.draftSource = current;
    this.stale.set(false);
    this.schedulePersist();
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
    const fields = fieldsFor(draft, node.id);
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
            // The same indent the item form's group picker uses, from the one
            // helper, so one hierarchy reads the same way wherever it is
            // offered.
            label: groupOptionLabel(row.node.name, row.depth),
          })),
      ] satisfies SelectOption[],
      /**
       * The pending choice while one is being weighed up; otherwise the truth.
       *
       * It stays the pending one on purpose — a native select cannot be snapped
       * back to a value the binding never left, so pretending the control had
       * not been operated would only desynchronise it from what is on screen.
       * What it owes instead is a mark: `parentPending` draws the dashed border
       * and the "chosen, not moved yet" label, so the one control that shows an
       * unsaved value also says that it does.
       */
      parentValue:
        pending && pending.groupId === node.id
          ? (pending.parentId ?? ROOT_PARENT)
          : (node.parentId ?? ROOT_PARENT),
      parentPending: !!pending && pending.groupId === node.id,
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

  /**
   * Whether the composer belongs in this card — the tree, with `null`, or one
   * group's detail pane.
   *
   * A method rather than the template expression it replaces, and the reason is
   * a trap: Angular's safe navigation yields **null**, so
   * `pendingGroupParent()?.parentId === null` is true when nothing is pending
   * at all, and the tree card rendered a composer on arrival — unfocused, and
   * already mounted, so pressing "+ Add group" then did nothing visible.
   */
  protected composingUnder(parentId: string | null): boolean {
    const pending = this.pendingGroupParent();
    return !!pending && pending.parentId === parentId;
  }

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
    // Autosave is disarmed while the banner is up, and that is the point of the
    // banner: the document under this page has moved, so a save from here is a
    // wholesale overwrite of somebody else's work. The edit is kept — nothing
    // typed is ever thrown away — and goes out when the user answers.
    this.lastSaveOk.set(false);
    if (this.stale()) return;
    this.schedulePersist();
  }

  private schedulePersist(): void {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      // Cleared here rather than inside `persist`, so "is an edit still
      // waiting?" has a truthful answer for the whole of the debounce and none
      // of the write.
      this.persistTimer = undefined;
      void this.persist();
    }, PERSIST_DEBOUNCE_MS);
  }

  /**
   * Flushes the debounced save and says how it went.
   *
   * Never rethrows, and never clears the draft. This page is a long-lived
   * working copy of the collection, so a refused save has to leave it exactly
   * as it is — the shell's conflict notice explains what happened and the user
   * decides whether to reload. Before this, a rejection here was unhandled: the
   * user kept typing into a draft that had silently stopped being saved.
   *
   * The **return value** is why this is not `void` any more. `done()` used to
   * await it and then flash "Collection updated" unconditionally, so a refused
   * save was announced as a success while the user was being navigated away
   * from the only copy of their work.
   */
  private async persist(): Promise<'saved' | 'refused' | 'busy' | 'paused'> {
    clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    const draft = this.draft();
    if (!draft) return 'saved';
    // Nothing goes out while the banner is up. Silently writing here is the
    // exact failure the banner exists to stop.
    if (this.stale()) return 'paused';
    try {
      this.awaitingEcho = true;
      await this.store.updateCollection(draft);
      this.lastSaveOk.set(true);
      return 'saved';
    } catch (err) {
      this.awaitingEcho = false;
      this.lastSaveOk.set(false);
      // Refused here rather than sent, because another write of this collection
      // was still in flight. Nothing is lost and nothing is said: this page's
      // draft is the live working copy, so re-arming the debounce re-sends
      // whatever it holds *then* — which is the save the user was expecting all
      // along, one beat later. Dropping it would leave them typing into a draft
      // that had quietly stopped saving, which is the failure this method's own
      // docblock exists because of.
      if (err instanceof VaultBusyError) {
        this.schedulePersist();
        return 'busy';
      }
      // The version this page quotes is dead, so re-arming the debounce would
      // schedule a guaranteed 412 for every keystroke from now on — twenty
      // minutes of typing into a page that never saves again, with only a
      // corner notice to say so. The banner takes over instead.
      if (err instanceof VaultConflictError) {
        this.stale.set(true);
        return 'refused';
      }
      if (isReportedWriteFailure(err)) return 'refused';
      this.toast.error(
        err instanceof Error ? err.message : this.i18n.t('toast.collection.saveFailed'),
      );
      return 'refused';
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

  /**
   * Destroys the collection, and asks first — this is the largest irreversible
   * act in the app and it used to happen on one click.
   *
   * The question names the collection and states what goes with it, because
   * "are you sure?" is not information: the number of items is the fact that
   * changes somebody's mind. There is no undo, so the export sitting on this
   * same page is the only recovery there is and the body says so.
   */
  protected async deleteCollection(): Promise<void> {
    const draft = this.draft();
    if (!draft) return;

    const confirmed = await this.confirm.ask({
      titleKey: 'confirm.deleteCollection.title',
      bodyKey: 'confirm.deleteCollection.body',
      params: {
        name: draft.name,
        // Two independent counts in one sentence: each arrives already rendered
        // as a count phrase, so the sentence stays a single translated unit.
        items: this.i18n.count(draft.items.length, 'item'),
        groups: this.i18n.count(draft.groups.length, 'group'),
      },
      confirmKey: 'confirm.deleteCollection.confirm',
      tone: 'danger',
    });
    if (!confirmed) return;

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

  /**
   * Adds the group the composer names.
   *
   * The composer is `ui-inline-edit`, which focuses itself on reveal and owns
   * Enter, Escape and blur — the three behaviours this page hand-rolled three
   * times over, once per composer, and got wrong in the one that mattered most
   * (`+ Sub` opened a box in the other column with no caret in it).
   */
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

  /**
   * The declarations owned by one owner — a group's, or the collection's own.
   *
   * Every field handler below goes through this and {@link mutateFields}, so
   * declaring a field for the whole collection and declaring one for a group
   * are the same code path with a different owner. Two paths would have drifted
   * the first time one of them learned something — as they nearly did over the
   * scope selector, which the group editor needed and the collection editor
   * needed identically.
   */
  protected fieldsOf(owner: string): GroupField[] {
    const draft = this.draft();
    if (!draft) return [];
    return owner === COLLECTION_FIELDS
      ? draft.fields
      : (draft.groups.find(g => g.id === owner)?.fields ?? []);
  }

  private mutateFields(owner: string, fn: (fields: GroupField[]) => GroupField[]): void {
    if (owner === COLLECTION_FIELDS) this.mutate(d => ({ ...d, fields: fn(d.fields) }));
    else this.mutateGroup(owner, g => ({ ...g, fields: fn(g.fields) }));
  }

  /**
   * Clears any group ordering that points at a field name.
   *
   * A `field:` sort whose field is gone — removed, or moved to copy scope —
   * would not fail: `keyOf` would find no value on any item, rank them all as
   * absent and quietly shuffle the group into alphabetical order. Silence is
   * the whole problem, so the ordering is dropped where it can still be
   * explained. Applied across every group, because a group may order by a field
   * the collection declared.
   */
  private clearSortsFor(name: string): string[] {
    const key = fieldSortKey(name);
    const cleared = (this.draft()?.groups ?? []).filter(g => g.sort?.by === key).map(g => g.name);
    this.mutate(d => ({
      ...d,
      groups: d.groups.map(g => (g.sort?.by === key ? { ...g, sort: null } : g)),
    }));
    return cleared;
  }

  /**
   * Says which groups just lost their declared order, when any did.
   *
   * The docblock on {@link clearSortsFor} says the ordering "is dropped where
   * it can still be explained" — and then nothing explained it to anybody. A
   * group silently re-sorted alphabetically is not traceable back to the
   * dropdown two panes away that did it.
   */
  private reportClearedSorts(name: string, cleared: readonly string[]): void {
    if (!cleared.length) return;
    this.toast.flash(
      this.i18n.t('toast.field.orderCleared', { name, groups: cleared.join(', ') }),
    );
  }

  /**
   * Drops a field declaration, after asking.
   *
   * The values themselves survive — `custom` is keyed by field *name* on the
   * item or the copy, so they go dormant and come back if the field is declared
   * again. That is exactly why the question has to say so: refusing to explain
   * would make a reversible act look like a deletion, and a count of the items
   * holding a value is what tells somebody whether they are about to hide
   * anything at all.
   */
  protected async removeField(owner: string, name: string): Promise<void> {
    const holders = this.fieldHolderCount(owner, name);
    const confirmed = await this.confirm.ask({
      titleKey: 'confirm.removeField.title',
      bodyKey: holders
        ? holders === 1
          ? 'confirm.removeField.body.one'
          : 'confirm.removeField.body.other'
        : 'confirm.removeField.bodyEmpty',
      params: { name, n: holders },
      confirmKey: 'confirm.removeField.confirm',
      tone: 'danger',
    });
    if (!confirmed) return;

    this.mutateFields(owner, fields => fields.filter(f => f.name !== name));
    const cleared = this.clearSortsFor(name);
    this.toast.flash(this.i18n.t('toast.field.removed'));
    this.reportClearedSorts(name, cleared);
  }

  /**
   * How many items hold a value for a field — in the group's subtree, or in the
   * whole collection when the collection is the one declaring it.
   *
   * Counted the way `groupMoveImpact` counts it, and for the same reason: a
   * warning with a number in it is a warning somebody can act on, and one
   * without is noise they learn to click through. Copies are counted too: a
   * copy-scoped field's values live nowhere else, and reporting "no values
   * affected" for a field every copy carries is the one thing this number must
   * never do.
   */
  private fieldHolderCount(owner: string, name: string): number {
    const draft = this.draft();
    if (!draft) return 0;
    const ids =
      owner === COLLECTION_FIELDS ? null : new Set(subtreeIds(draft.groups, owner));
    const held = (values: readonly CustomFieldValue[]): boolean =>
      values.some(entry => entry.key === name && entry.value.trim() !== '');
    return draft.items.filter(
      item =>
        (ids === null || ids.has(item.groupId)) &&
        (held(item.custom) || item.copies.some(copy => held(copy.custom))),
    ).length;
  }

  /**
   * Retypes a field, and says so.
   *
   * Nothing visible changes on this screen when it happens — the values stay as
   * they are, keyed by name — so an unannounced retype is a change to how every
   * item in the branch sorts, made by a dropdown that gave no sign of having
   * done anything.
   */
  protected setFieldType(owner: string, name: string, type: string): void {
    this.mutateFields(owner, fields =>
      fields.map(f => (f.name === name ? { ...f, type: type as GroupFieldType } : f)),
    );
    this.toast.flash(
      this.i18n.t('toast.field.retyped', {
        name,
        type: this.i18n.t(FIELD_TYPE_KEYS[type as GroupFieldType]),
      }),
    );
  }

  /** The scope a chip's select shows: the answer being weighed up, or the truth. */
  protected fieldScopeValue(owner: string, field: GroupField): string {
    const pending = this.rescoping();
    return pending && pending.owner === owner && pending.name === field.name
      ? pending.scope
      : field.scope;
  }

  /**
   * Moves a field between describing the item and describing each copy.
   *
   * The values do not move with it, and nothing pretends they do. They stay
   * keyed by name on whichever record already held them, dormant exactly as
   * they are when a field is removed — so flipping the scope back brings them
   * into view again. Guessing which copy an item-level value belonged to is not
   * a guess the app is entitled to make, and spreading it to all of them would
   * invent data.
   */
  protected async setFieldScope(owner: string, name: string, scope: string): Promise<void> {
    const next = scope as FieldScope;
    this.rescoping.set({ owner, name, scope: next });

    // The same question the ✕ beside it has always asked, because the
    // consequence is the same one: N items hold a value, it stops being shown,
    // nothing is deleted. No `danger` tone — nothing is destroyed — and the
    // count is the fact that changes somebody's mind.
    const holders = next === 'copy' ? this.fieldHolderCount(owner, name) : 0;
    if (holders > 0) {
      const confirmed = await this.confirm.ask({
        titleKey: 'confirm.rescopeField.title',
        bodyKey: holders === 1 ? 'confirm.rescopeField.body.one' : 'confirm.rescopeField.body.other',
        params: { name, n: holders },
        confirmKey: 'confirm.rescopeField.confirm',
      });
      if (!confirmed) {
        // Clearing this is what puts the select back: the binding returns to the
        // stored scope, which is a *change* to it, so the control is rewritten.
        this.rescoping.set(null);
        return;
      }
    }

    this.rescoping.set(null);
    this.mutateFields(owner, fields =>
      fields.map(f => (f.name === name ? { ...f, scope: next } : f)),
    );
    const cleared = next === 'copy' ? this.clearSortsFor(name) : [];
    this.toast.flash(
      this.i18n.t('toast.field.rescoped', { name, scope: this.i18n.t(FIELD_SCOPE_KEYS[next]) }),
    );
    this.reportClearedSorts(name, cleared);
  }

  /**
   * Declares a field, as text describing the item.
   *
   * The composer offers a name and nothing else, deliberately. It used to carry
   * a type select and a scope select, and **neither could be operated at all**:
   * `ui-select` is a native control, so pressing one blurred the name box, the
   * blur committed the field, and the `@if` tore the selects out of the DOM
   * before the click could land — every attempt produced a text/per-item field
   * and a vanished row. Both answers are set on the committed chip, where they
   * work, so the composer asks the one question it can actually take an answer
   * to.
   */
  protected commitNewField(owner: string, name: string): void {
    if (this.pendingFieldGroupId() !== owner) return;
    const type: GroupFieldType = 'text';
    const scope: FieldScope = 'item';
    this.pendingFieldGroupId.set(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    if (this.fieldsOf(owner).some(f => f.name === trimmed)) {
      this.toast.flash(this.i18n.t('toast.field.duplicate', { name: trimmed }));
      return;
    }
    this.mutateFields(owner, fields => [...fields, { name: trimmed, type, scope }]);
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
  /**
   * Deletes a divider, after asking.
   *
   * Unlike a field, this one does destroy something: every item under the
   * section has its `sectionId` cleared, and which run each of them belonged to
   * is not recorded anywhere else. So the count in the question is the number of
   * items that lose their place, not a decoration.
   */
  protected async removeSection(id: string): Promise<void> {
    const draft = this.draft();
    if (!draft) return;
    const section = draft.sections.find(s => s.id === id);
    const affected = draft.items.filter(item => item.sectionId === id).length;

    const confirmed = await this.confirm.ask({
      titleKey: 'confirm.removeSection.title',
      bodyKey: affected
        ? affected === 1
          ? 'confirm.removeSection.body.one'
          : 'confirm.removeSection.body.other'
        : 'confirm.removeSection.bodyEmpty',
      params: { name: section?.name ?? '', n: affected },
      confirmKey: 'confirm.removeSection.confirm',
      tone: 'danger',
    });
    if (!confirmed) return;

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
  protected async convertChildrenToSections(groupId: string): Promise<void> {
    const draft = this.draft();
    if (!draft) return;
    const children = childrenOf(draft.groups, groupId);
    if (!children.length) return;

    // It deletes more groups than the delete button does, and it used to be the
    // only group-destroying path on this page that asked nothing — styled as a
    // peer of "+ Section", one click from a user finding out what it does.
    const confirmed = await this.confirm.ask({
      titleKey:
        children.length === 1
          ? 'confirm.convertSections.title.one'
          : 'confirm.convertSections.title.other',
      bodyKey: 'confirm.convertSections.body',
      params: {
        n: children.length,
        names: this.nameList(children.map(child => child.name)),
        parent: groupById(draft.groups, groupId)?.name ?? '',
      },
      confirmKey:
        children.length === 1
          ? 'confirm.convertSections.confirm.one'
          : 'confirm.convertSections.confirm.other',
      tone: 'danger',
    });
    if (!confirmed) return;

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
    this.toast.flash(
      this.i18n.plural(
        children.length,
        'toast.section.converted.one',
        'toast.section.converted.other',
      ),
    );
  }

  /**
   * "Bronze, Prata, Ouro and 2 more" — named the way the delete dialog names
   * them, because four names and a count is the length somebody reads.
   */
  private nameList(names: readonly string[]): string {
    const shown = names.slice(0, 4);
    if (names.length <= 4) return shown.join(', ');
    return this.i18n.t('collSettings.groups.delete.subGroupsMore', {
      names: shown.join(', '),
      n: names.length - shown.length,
    });
  }

  // --- sharing ---

  /**
   * Records somebody on the collection.
   *
   * Refused on the field rather than in a toast, and for a concrete reason:
   * an invalid address used to be accepted by `includes('@')`, appended to the
   * document, and then refused *by the server's whole-document validator* 400 ms
   * later — so the user's unrelated edits on this page did not save either, and
   * the red toast that arrived pointed at nothing.
   */
  protected invite(): void {
    const email = this.inviteEmail().trim();
    if (!EMAIL_PATTERN.test(email)) {
      this.inviteError.set(this.i18n.t('collSettings.sharing.inviteInvalid'));
      return;
    }
    // The list is tracked by email, so a duplicate broke the tab's own render
    // and wrote the same person into the document twice. Case-insensitive, and
    // against the owner row too, which `memberRows` prepends.
    const already = this.memberRows().find(
      row => row.member.email.toLowerCase() === email.toLowerCase(),
    );
    if (already) {
      this.inviteError.set(
        this.i18n.t('collSettings.sharing.inviteDuplicate', { name: already.member.name }),
      );
      return;
    }
    this.inviteError.set('');
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
    this.toast.success(this.i18n.t('toast.invite.sent'));
  }

  /** Typing is the retry, so the refusal clears with it. */
  protected onInviteEmail(email: string): void {
    this.inviteEmail.set(email);
    this.inviteError.set('');
  }

  protected setMemberRole(email: string, role: string): void {
    this.mutate(d => ({
      ...d,
      members: d.members.map(m => (m.email === email ? { ...m, role: role as MemberRole } : m)),
    }));
    this.toast.flash(this.i18n.t('toast.member.roleUpdated'));
  }

  protected async removeMember(email: string, fixed: boolean): Promise<void> {
    if (fixed) {
      this.toast.flash(this.i18n.t('toast.member.ownerImmutable'));
      return;
    }

    // Revoking access is recoverable — they can be added again — but not by
    // them, and not without somebody noticing they are gone. Worth a question.
    const member = this.draft()?.members.find(m => m.email === email);
    const confirmed = await this.confirm.ask({
      titleKey: 'confirm.removeMember.title',
      bodyKey: 'confirm.removeMember.body',
      params: { name: member?.name ?? email },
      confirmKey: 'confirm.removeMember.confirm',
      tone: 'danger',
    });
    if (!confirmed) return;

    this.mutate(d => ({ ...d, members: d.members.filter(m => m.email !== email) }));
    this.toast.flash(this.i18n.t('toast.member.removed'));
  }


  /** The empty option means "follow the account", which is stored as null. */
  protected setCurrency(code: string): void {
    this.mutate(d => ({ ...d, currency: isCurrencyCode(code) ? code : null }));
  }

  // --- done ---

  protected async done(): Promise<void> {
    // A chosen-but-unconfirmed move is the one edit on this page that leaving
    // discards, and the select was showing it as though it had happened.
    const pending = this.pendingParent();
    if (pending) {
      const name = groupById(this.draft()?.groups ?? [], pending.groupId)?.name ?? '';
      const leave = await this.confirm.ask({
        titleKey: 'confirm.pendingMove.title',
        bodyKey: 'confirm.pendingMove.body',
        params: { name },
        confirmKey: 'confirm.pendingMove.confirm',
      });
      if (!leave) return;
      this.pendingParent.set(null);
    }

    const outcome = await this.persist();
    if (outcome !== 'saved') {
      // Stay put. The work on screen is the only copy of itself, and telling
      // someone it saved while walking them off the page is how it gets lost.
      // A conflict already has the notice; the other two have nothing else.
      if (outcome !== 'refused') this.toast.error(this.i18n.t('collSettings.notSaved'));
      return;
    }

    this.toast.success(this.i18n.t('toast.collection.updated'));
    // Back to the group you came from, not to the collection root — arriving
    // here scoped and leaving unscoped loses your place.
    void this.router.navigate(['/c', this.collectionId()], {
      queryParams: this.g() ? { g: this.g() } : {},
    });
  }
}
