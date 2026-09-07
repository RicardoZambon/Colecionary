import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';

import { I18nService, MessageKey } from '../../../core/i18n';
import { VaultBusyError, isReportedWriteFailure } from '../../../core/api/vault-api';
import { ToastService } from '../../../core/state/toast.service';
import { VaultStore } from '../../../core/state/vault.store';
import { Collection, Condition, GroupNode, GroupSort, Item } from '../../../core/models';
import { BrowseCriteria, OwnFilter, visibleItems } from '../../../core/utils/browse.util';
import {
  UNGROUPED_ID,
  scopeStats,
  sectionStatsIndex,
  statsIndex,
} from '../../../core/utils/group-stats.util';
import {
  SectionChunk,
  UNSECTIONED_ID,
  chunkBySection,
  resolveSectionId,
  sectionsOf,
} from '../../../core/utils/sections.util';
import {
  childrenOf,
  fieldsFor,
  itemFields,
  groupById,
  pathOf,
  sortFor,
} from '../../../core/utils/groups.util';
import { ChildChip } from './group-breadcrumb/group-breadcrumb';
import {
  DEFAULT_SORT,
  applyManualOrder,
  customFieldName,
  moveInList,
} from '../../../core/utils/sort.util';
import {
  conditionParams,
  groupLinkParams,
  nextSortFor,
  ownParams,
  readCondition,
  readOwn,
  readSection,
  readSort,
  readTag,
  sectionParams,
  sortParams,
  tagParams,
} from '../browse-params';
import { BrowseFilterChip, BrowseFilterKind, BrowseSummary } from './browse-summary/browse-summary';
import { CollectionHero } from './collection-hero/collection-hero';
import { CollectionFilters } from './collection-toolbar/collection-filters';
import { CollectionToolbar } from './collection-toolbar/collection-toolbar';
import { GroupBreadcrumb } from './group-breadcrumb/group-breadcrumb';
import { GroupDashboard } from './group-dashboard/group-dashboard';
import { GroupTree } from './group-tree/group-tree';
import { ItemGrid } from './item-grid/item-grid';
import { ItemList, RowPick } from './item-list/item-list';
import { BulkBar } from './bulk-bar/bulk-bar';
import { BulkPatch, applyBulkPatch, removeItems } from './bulk-patch';
import { CsvImportDialog } from '../csv-import/csv-import-dialog';
import { CsvImportPlan, applyCsvImport } from '../csv-import/csv-import';
import {
  EMPTY_SELECTION,
  SelectionState,
  allSelected as isAllSelected,
  someSelected as isSomeSelected,
  extendTo,
  selectedIn,
  setAll,
  toggle as toggleSelection,
} from './item-selection';
import { readHidden, toggleHidden, visibleFields, writeHidden } from './column-prefs';
import { TPipe } from '../../../shared/pipes/t.pipe';
import { UiButton, UiDialog, UiEmpty, UiReadOnlyNotice, UiSkeleton } from '../../../shared/ui';
import { conditionLabelKey } from '../../../shared/ui/badge/badge';
import { ViewMode, resolveView, viewParam } from './view-mode';
import {
  initialExpanded,
  readCollapsed,
  readExpanded,
  writeCollapsed,
  writeExpanded,
} from './tree-prefs';

/** Reordering writes the whole collection back, so coalesce rapid drags. */
const ORDER_DEBOUNCE_MS = 400;

/**
 * Below this the shell's own 226px sidebar leaves no room for a second column,
 * so the tree panel is an accelerator that never displaces the item list.
 *
 * Keep it equal to `$bp-xl` in `styles/_mixins.scss`, which
 * `collection-page.scss` reads through `from($bp-xl)`. It is duplicated here for
 * the same reason `LayoutService.compact` duplicates `$bp-lg`: a media query
 * cannot be read from script, and this decides whether an element is rendered at
 * all rather than merely how it looks. The right home for it is
 * `LayoutService`, beside `compact` — that file belongs to the shell, so this
 * stays local for now.
 */
const WIDE_ENOUGH = '(min-width: 1200px)';

@Component({
  selector: 'app-collection-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrowseSummary, BulkBar, CollectionFilters, CollectionHero, CollectionToolbar, CsvImportDialog, GroupBreadcrumb, GroupDashboard, GroupTree, ItemGrid, ItemList, RouterLink, TPipe, UiButton, UiDialog, UiEmpty, UiReadOnlyNotice, UiSkeleton],
  templateUrl: './collection-page.html',
  styleUrl: './collection-page.scss',
})
export class CollectionPage {
  /**
   * Whether to offer the write affordances at all.
   *
   * A courtesy, not a control — see the doc comment on VaultStore.canEdit.
   */
  protected readonly canEdit = computed(() => this.store.canEdit());

  protected readonly store = inject(VaultStore);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Bound from the route by withComponentInputBinding(). */
  readonly collectionId = input.required<string>();
  /** Selected group id — lives in the URL so back/refresh keep context. */
  readonly g = input<string | undefined>(undefined);
  /** Chosen view. Absent means "derive it from whether this group has children". */
  readonly v = input<string | undefined>(undefined);
  /**
   * The item filters and the chosen order, straight off the URL — which is what
   * lets an open item walk the same list the grid showed, and what makes coming
   * back from one restore the filters instead of clearing them. Parsed in
   * `browse-params.ts`, never trusted raw.
   */
  /** `?s=` — the divider the list is narrowed to, if any. */
  readonly s = input<string | undefined>(undefined);
  readonly cond = input<string | undefined>(undefined);
  readonly own = input<string | undefined>(undefined);
  /** `?tag=` — one exact tag. Arrives by clicking a tag on an item. */
  readonly tag = input<string | undefined>(undefined);
  readonly sort = input<string | undefined>(undefined);
  readonly dir = input<string | undefined>(undefined);

  protected readonly condition = computed(() => readCondition(this.cond()));
  protected readonly sectionFilter = computed(() =>
    readSection(this.s(), this.sections(), this.g() ?? null),
  );
  protected readonly ownFilter = computed<OwnFilter>(() => readOwn(this.own()));
  /**
   * Null both when no tag was asked for and when the one asked for is carried by
   * nothing in this collection — see `readTag`. Resolved against the stored
   * items rather than `sourceItems()`, because a pending drag reorders the list
   * and never changes anybody's tags.
   */
  protected readonly tagFilter = computed(() =>
    readTag(this.tag(), this.collection()?.items ?? []),
  );
  /** Null means "use the selected group's configured order". */
  protected readonly sortOverride = computed(() => readSort(this.sort(), this.dir()));
  protected readonly pendingGroupParent = signal<{ parentId: string | null } | null>(null);

  /**
   * Whether the window is wide enough for a second permanent column.
   *
   * A live signal, not a one-shot read. It used to be asked exactly once, in the
   * run-once-per-collection effect, and only as the fallback when nothing was
   * stored — so a stored "open" won at every width and someone who browsed on a
   * laptop with the panel open opened the same collection on a phone to find the
   * group tree as a full-width block pushing the whole item list below the fold.
   * Resizing did not fix it; only collapsing the panel by hand did, and that
   * choice then followed them back to the laptop.
   */
  private readonly wide = signal(true);

  /**
   * The last reorder, for assistive technology.
   *
   * `ui-reorder` announces its own keyboard moves, but a *drag* has nothing to
   * announce it, and the only feedback was a toast 400ms later saying the order
   * was saved. One polite region on the page covers both paths.
   */
  protected readonly moveAnnouncement = signal('');

  /**
   * The vault is still in flight, so `collection()` being undefined does not
   * mean the collection is missing — it means nobody has looked yet. Telling
   * those two apart is the whole reason this exists: the not-found sentence used
   * to render for both.
   */
  protected readonly loading = computed(() => !this.store.loaded());

  /**
   * Whether this collection already has a write in flight.
   *
   * Bulk actions stop offering themselves while it is true. A bulk apply is one
   * full-document PUT and a large collection takes long enough for a second
   * click to arrive before the first answers — and that second PUT quotes the
   * version the first is about to move, so the server refuses it and the app
   * blames a writer who does not exist.
   */
  protected readonly saving = computed(() => this.store.saving(this.collectionId()));

  /** Item tiles the skeleton reserves. Six fills the first row at any width. */
  protected readonly placeholders = [0, 1, 2, 3, 4, 5];

  /**
   * Which rows a bulk action applies to. A signal and **not** URL state — the
   * whole argument is written down in `item-selection.ts`, and a future reader
   * who "fixes" this by moving it into `?sel=` will have shipped a shareable
   * link that arrives with forty rows ticked in front of a delete button.
   *
   * It survives a filter change because a query-param navigation does not
   * recreate this component, and every reader intersects it with what is
   * actually visible.
   */
  protected readonly selection = signal<SelectionState>(EMPTY_SELECTION);

  /** Field columns the user hid, per collection and group. localStorage. */
  protected readonly hiddenColumns = signal<ReadonlySet<string>>(new Set());

  /** True while the delete confirmation is up. */
  protected readonly confirmingDelete = signal(false);
  /**
   * Whether the CSV import dialog is open. Not URL state: it holds a paste
   * nobody else can reconstruct, so a link that reopened it would land on an
   * empty box claiming to be mid-import (rule 11's test — would a recipient
   * want this restored?).
   */
  protected readonly importOpen = signal(false);
  protected readonly treeExpanded = signal<ReadonlySet<string>>(new Set());
  protected readonly treeCollapsed = signal(false);

  /**
   * Item order held locally while a manual reorder is being saved, so a drag
   * lands instantly instead of waiting on the round-trip. Scoped to a
   * collection id so switching collections can't show a stale order.
   */
  private readonly pendingOrder = signal<{ id: string; items: Item[] } | null>(null);
  private orderTimer: ReturnType<typeof setTimeout> | undefined;
  private restoredFor: string | null = null;
  private selectionFor: string | null = null;
  private columnsFor: string | null = null;

  constructor() {
    /*
     * The search text is emptied when this page goes.
     *
     * It is the one piece of view state that escapes the URL (rule 11), so
     * nothing else would ever clear it — and `VaultStore` outlives the page, so
     * a query left behind was still filtering the *next* collection opened. The
     * box used to be in the topbar and this used to be the topbar's job; it
     * moved here with the box, which is also the only place that can see the
     * page being left.
     */
    inject(DestroyRef).onDestroy(() => this.store.query.set(''));

    const media = matchMedia(WIDE_ENOUGH);
    this.wide.set(media.matches);
    // Crossing down into a narrow window folds the panel, and deliberately does
    // **not** persist that: the preference belongs to the wide layout, so
    // returning to it restores what the user chose. Mirrors what
    // LayoutService does with `navOpen` when the sidebar stops being a drawer.
    media.addEventListener?.('change', event => {
      this.wide.set(event.matches);
      if (!event.matches) this.treeCollapsed.set(true);
    });

    // A selection describes rows of one collection. Carrying it across would
    // point a destructive bar at ids that mean nothing here.
    effect(() => {
      const id = this.collectionId();
      if (this.selectionFor === id) return;
      this.selectionFor = id;
      this.selection.set(EMPTY_SELECTION);
      this.confirmingDelete.set(false);
    });

    // Column preferences are per collection *and* per group, because the field
    // set is (`fieldsFor` merges down the ancestor path).
    effect(() => {
      const key = `${this.collectionId()}.${this.groupKey()}`;
      if (this.columnsFor === key) return;
      this.columnsFor = key;
      this.hiddenColumns.set(readHidden(this.collectionId(), this.groupKey()));
    });

    // Restore the tree once per collection, seeding it with the path to the
    // group in the URL so it opens showing where you are.
    effect(() => {
      const collection = this.collection();
      if (!collection || this.restoredFor === collection.id) return;
      this.restoredFor = collection.id;

      const known = new Set(collection.groups.map(group => group.id));
      const path = pathOf(collection.groups, this.g() ?? null).map(node => node.id);
      this.treeExpanded.set(initialExpanded(readExpanded(collection.id), path, known));
      // A stored preference applies only where there is room for the column. It
      // used to win at every width, which is how a laptop's "panel open"
      // reached a phone as a full-width tree above the whole item list.
      this.treeCollapsed.set(this.wide() ? readCollapsed() ?? false : true);
    });

    // Opening a group unfolds it in the tree. With the panel on screen the
    // breadcrumb stops carrying the sub-groups, so a node that stayed folded
    // would leave no way down at all. The early return is what stops this
    // effect from re-triggering on the write it makes.
    effect(() => {
      const collection = this.collection();
      const id = this.g();
      if (!collection || !id || id === UNGROUPED_ID) return;

      const ids = pathOf(collection.groups, id).map(group => group.id);
      const current = this.treeExpanded();
      if (!ids.length || ids.every(each => current.has(each))) return;

      const next = new Set(current);
      for (const each of ids) next.add(each);
      this.setTreeExpanded(next);
    });
  }

  /**
   * Whether the panel is on screen. Below `$bp-xl` it is not a column but a
   * block above the list, so it stays folded unless the user opens it there on
   * purpose — the toggle keeps working at every width, it just no longer arrives
   * pre-opened from another device's preference.
   */
  protected readonly treeVisible = computed(() => !this.treeCollapsed());

  protected readonly collection = computed(() => this.store.collection(this.collectionId()));
  protected readonly groups = computed(() => this.collection()?.groups ?? []);
  /** The collection's own field declarations — the outermost ancestor of every group. */
  protected readonly collectionFields = computed(() => this.collection()?.fields ?? []);
  /** Everything `fieldsFor` needs, in one object, so no caller can pass half of it. */
  protected readonly declarations = computed(() => ({
    fields: this.collectionFields(),
    groups: this.groups(),
  }));
  protected readonly sections = computed(() => this.collection()?.sections ?? []);
  /** The dividers of the group actually open — the only ones that ever apply. */
  protected readonly groupSections = computed(() =>
    sectionsOf(this.sections(), this.g() === UNGROUPED_ID ? null : this.g() ?? null),
  );
  protected readonly selectedGroup = computed(() => groupById(this.groups(), this.g() ?? null));
  protected readonly selectedPath = computed(() =>
    this.g() ? pathOf(this.groups(), this.g()!) : [],
  );

  protected readonly headerMembers = computed(() => {
    const collection = this.collection();
    if (!collection) return [];
    const owner = this.store.tenantMembers().find(m => m.role === 'Owner');
    return owner ? [owner, ...collection.members] : collection.members;
  });

  /** The collection's items, preferring an unsaved manual reorder. */
  private readonly sourceItems = computed(() => {
    const collection = this.collection();
    if (!collection) return [];
    const pending = this.pendingOrder();
    return pending?.id === collection.id ? pending.items : collection.items;
  });

  /**
   * Every group's aggregates, computed once and passed down. The tree and the
   * dashboard both want per-node numbers; resolving a subtree per node instead
   * would make the whole page O(groups × items).
   */
  protected readonly stats = computed(() =>
    statsIndex(this.groups(), this.sourceItems(), this.sections()),
  );

  /**
   * Per-section aggregates for the open group only — the sections on screen are
   * the only ones anything asks about, so this stays one pass rather than a
   * whole second index.
   */
  protected readonly sectionStats = computed(() =>
    sectionStatsIndex(
      this.sections(),
      this.sourceItems(),
      this.g() === UNGROUPED_ID ? null : this.g() ?? null,
    ),
  );

  /** What the header describes: the open group, or the whole collection. */
  protected readonly scope = computed(() => scopeStats(this.stats(), this.g() ?? null));
  protected readonly total = computed(() => scopeStats(this.stats(), null));

  /**
   * Nothing catalogued in the open scope *and* no declared set — the one case
   * where the whole numeric apparatus, and every control that narrows or redraws
   * a list, is meaningless rather than merely low.
   *
   * With a target, "0 / 30 · 0%" is a real measurement of a real set and the
   * hero's bar earns its place. Without one the denominator is the catalogued
   * count, so the bar is 0 ÷ 0 and "est." claims the collection is worth zero
   * when it is worth *unknown*. The same predicate answers the toolbar: an
   * order, a column picker, three view toggles and two rows of filter chips all
   * act on items, and there are none.
   *
   * Computed here rather than in each consumer: the hero used to own it, and a
   * second copy in the toolbar is a second thing to keep in step.
   */
  protected readonly blank = computed(() => {
    const scope = this.scope();
    return scope.catalogued === 0 && !scope.hasTarget;
  });

  protected readonly scopeName = computed(() => {
    if (this.g() === UNGROUPED_ID) return this.i18n.t('group.none');
    return this.selectedGroup()?.name ?? '';
  });

  /**
   * The path the breadcrumb shows. The unfiled bucket is not a real group, so
   * `pathOf` knows nothing about it — without this the breadcrumb would sit on
   * the collection root while the page showed something else.
   */
  protected readonly crumbPath = computed<GroupNode[]>(() => {
    if (this.g() !== UNGROUPED_ID) return this.selectedPath();
    return [{ id: UNGROUPED_ID, name: this.i18n.t('group.none'), parentId: null, fields: [], sort: null, target: null }];
  });

  protected readonly groupNames = computed(
    () => new Map(this.groups().map(group => [group.id, group.name])),
  );

  /**
   * The groups one level below whatever is open. The tree is the full map, but
   * it is a panel the user can hide — and below 1200px it starts hidden — so
   * the one hop that matters most stays on the breadcrumb strip itself, where
   * the old chip row used to be.
   */
  protected readonly childChips = computed<ChildChip[]>(() => {
    const stats = this.stats();
    const parentId = this.g() === UNGROUPED_ID ? null : this.g() ?? null;
    return childrenOf(this.groups(), parentId).map(node => {
      const nodeStats = stats.get(node.id);
      return {
        id: node.id,
        name: node.name,
        count: nodeStats ? `${nodeStats.owned}/${nodeStats.denominator}` : '0/0',
      };
    });
  });

  /**
   * Custom fields in force for the current group: the collection's own, plus
   * every ancestor's, plus the group's.
   *
   * Narrowed to item scope, because every consumer of it is a view of *items* —
   * the table's columns, the sort picker, the CSV dialog's headings. A
   * copy-scoped field has no one value an item row could show, so a column for
   * it would be blank on every line. It is edited and read on the copy, on the
   * item form and the item page.
   */
  protected readonly groupFields = computed(() =>
    itemFields(fieldsFor(this.declarations(), this.g() ?? null)),
  );

  /** `''` for the collection root and the unfiled bucket — neither is a group. */
  protected readonly groupKey = computed(() =>
    this.g() === UNGROUPED_ID ? '' : this.g() ?? '',
  );

  /** The field columns the table renders: declared, minus the ones hidden. */
  protected readonly visibleColumns = computed(() =>
    visibleFields(this.groupFields(), this.hiddenColumns()),
  );
  protected readonly groupSort = computed(() => sortFor(this.groups(), this.g() ?? null));
  protected readonly effectiveSort = computed<GroupSort>(
    () => this.sortOverride() ?? this.groupSort() ?? DEFAULT_SORT,
  );
  protected readonly manual = computed(() => this.effectiveSort().by === 'manual');
  /** Set only while ordering by a custom field — drives the card chip. */
  protected readonly sortFieldName = computed(() => customFieldName(this.effectiveSort().by));

  protected readonly hasChildren = computed(() => {
    const id = this.g() ?? null;
    if (id === UNGROUPED_ID) return false;
    return this.groups().some(group => group.parentId === id);
  });

  protected readonly searching = computed(() => this.store.query().trim().length > 0);

  /**
   * A search is about items, so it forces the grid — but only in what is
   * rendered, never in the URL, so clearing the box restores the chosen view.
   */
  protected readonly view = computed<ViewMode>(() => {
    const resolved = resolveView(this.v(), this.hasChildren());
    return this.searching() && resolved === 'dashboard' ? 'grid' : resolved;
  });

  /**
   * Items filed on the open group itself rather than in one of its children,
   * so the dashboard can offer a way to see them. Empty at the collection
   * root: nothing is filed "on" the root, and items with a blank group already
   * have their own card, which this would otherwise double-count.
   */
  protected readonly directItems = computed(() => {
    const id = this.g();
    if (!id || id === UNGROUPED_ID) return [];
    return this.sourceItems().filter(item => item.groupId === id);
  });

  /**
   * Everything that decides the visible list, in one object. The item page
   * reads the same four params off the URL and builds the same thing, so the
   * arrows there can never step somewhere this grid wasn't showing.
   */
  protected readonly criteria = computed<BrowseCriteria>(() => ({
    groupId: this.g() ?? null,
    sectionId: this.sectionFilter(),
    condition: this.condition(),
    own: this.ownFilter(),
    tag: this.tagFilter(),
    query: this.store.query(),
    sort: this.sortOverride(),
  }));

  protected readonly items = computed(() =>
    visibleItems(this.sourceItems(), this.declarations(), this.criteria(), this.sections()),
  );

  /**
   * The visible list, cut into runs. Only a cut — `visibleItems` already put
   * the list in section order — so the grid, the table and an open item's
   * next/previous arrows are all walking the same sequence.
   *
   * A section nothing landed in keeps its heading while the list is unfiltered,
   * so one just created can be filled and a declared target can be read; under
   * any filter it does not, or narrowing to "wanted" answers with a page of
   * headings saying nothing matched.
   */
  protected readonly chunks = computed<SectionChunk[]>(() =>
    chunkBySection(this.items(), this.groupSections(), !this.filtering()),
  );

  // --- selection ----------------------------------------------------------

  /** The visible list's ids, in the order the screen shows them. */
  private readonly visibleIds = computed(() => this.items().map(item => item.id));

  /**
   * The selected ids **intersected with what is visible**. Every action and the
   * bar's own count read this and never the stored set, so a bulk edit cannot
   * reach a row the user cannot see — and narrowing a filter does not destroy
   * the selection, it only hides part of it.
   */
  protected readonly selectedIds = computed(
    () => new Set(selectedIn(this.selection(), this.visibleIds())),
  );

  protected readonly selectedItems = computed(() =>
    this.items().filter(item => this.selectedIds().has(item.id)),
  );

  protected readonly selectionCount = computed(() => this.selectedIds().size);
  protected readonly headerAllSelected = computed(() =>
    isAllSelected(this.selection(), this.visibleIds()),
  );
  protected readonly headerSomeSelected = computed(() =>
    isSomeSelected(this.selection(), this.visibleIds()),
  );

  protected readonly deleteTitle = computed(() =>
    this.i18n.plural(this.selectionCount(), 'bulk.confirm.title.one', 'bulk.confirm.title.other'),
  );
  protected readonly deleteConfirmLabel = computed(() =>
    this.i18n.plural(
      this.selectionCount(),
      'bulk.confirm.delete.one',
      'bulk.confirm.delete.other',
    ),
  );

  protected pickRow(pick: RowPick): void {
    this.selection.update(state =>
      pick.shift
        ? extendTo(state, this.visibleIds(), pick.id, pick.checked)
        : toggleSelection(state, pick.id, pick.checked),
    );
  }

  protected pickAll(checked: boolean): void {
    this.selection.update(state => setAll(state, this.visibleIds(), checked));
  }

  protected clearSelection(): void {
    this.selection.set(EMPTY_SELECTION);
  }

  protected toggleColumn(change: { name: string; visible: boolean }): void {
    const next = toggleHidden(this.hiddenColumns(), change.name, change.visible);
    this.hiddenColumns.set(next);
    writeHidden(this.collectionId(), this.groupKey(), next);
  }

  // --- bulk writes --------------------------------------------------------

  /**
   * One full-document PUT per bulk operation, never N item writes.
   *
   * `updateCollection` reads the version synchronously before its first await
   * and the server merges every item under that one `If-Match`, so this is
   * atomic: it all lands or none of it does. N `upsertItem` calls would each
   * bump the collection's version, making forty strictly-sequential
   * round-trips where a failure at item 7 is unrecoverable and a competing
   * writer refuses the rest with a 412 the user cannot map onto "which 22 got
   * through".
   */
  protected async applyBulk(patch: BulkPatch): Promise<void> {
    const collection = this.collection();
    const ids = this.selectedIds();
    if (!collection || !ids.size) return;

    const items = applyBulkPatch(this.sourceItems(), ids, patch, {
      groups: collection.groups,
      sections: collection.sections,
    });
    await this.writeItems(collection, items, ids.size, 'bulk.applied.one', 'bulk.applied.other', 'bulk.applyFailed');
  }

  /**
   * The same PUT with the rows filtered out. Deliberately not N `deleteItem`
   * calls: that endpoint carries no precondition at all, which is right for one
   * deliberate deletion and wrong for a forty-item sweep.
   */
  protected async deleteSelected(): Promise<void> {
    const collection = this.collection();
    const ids = this.selectedIds();
    this.confirmingDelete.set(false);
    if (!collection || !ids.size) return;

    const items = removeItems(this.sourceItems(), ids);
    await this.writeItems(collection, items, ids.size, 'bulk.deleted.one', 'bulk.deleted.other', 'bulk.deleteFailed');
  }

  private async writeItems(
    collection: Collection,
    items: Item[],
    count: number,
    one: MessageKey,
    other: MessageKey,
    failed: MessageKey,
  ): Promise<void> {
    // The payload was built from `sourceItems`, which already includes any
    // unsaved manual reorder — so the debounced write is redundant, and letting
    // it fire afterwards would put the pre-edit items back and undo this.
    clearTimeout(this.orderTimer);
    this.pendingOrder.set(null);

    try {
      await this.store.updateCollection({ ...collection, items });
    } catch (err) {
      // A conflict keeps the selection *and* the draft: the bar is still
      // mounted, so nothing the user typed is lost, and the shell's notice says
      // more about a 412 than a toast could. Everything else gets a toast.
      if (!isReportedWriteFailure(err)) {
        // A refused write of forty items is an error, not news. `flash` is the
        // neutral tone and, unlike `error`, it also takes itself away.
        this.toast.error(err instanceof Error ? err.message : this.i18n.t(failed));
      }
      return;
    }
    this.clearSelection();
    this.toast.flash(this.i18n.plural(count, one, other));
  }

  /**
   * The import, as one full-document PUT — the same unit as a bulk edit, and
   * for the same reasons (rule 14). It is also the only write in the app that
   * moves items *and* groups in one request, which is precisely why it cannot
   * be N calls: a run that created the group and then failed on item 12 would
   * leave a half-filled group nobody asked for and no way to name what got in.
   *
   * The plan is applied to `sourceItems`, not to `collection.items`: a manual
   * drag may be sitting in the debounce, and applying to the stale array would
   * publish the pre-drag order as though the user had undone it.
   */
  protected async runCsvImport(plan: CsvImportPlan): Promise<void> {
    const collection = this.collection();
    const count = plan.created + plan.updated;
    if (!collection || !count) return;

    clearTimeout(this.orderTimer);
    this.pendingOrder.set(null);

    try {
      await this.store.updateCollection(
        applyCsvImport({ ...collection, items: this.sourceItems() }, plan),
      );
    } catch (err) {
      // The dialog stays open on a failure, holding the paste: retyping four
      // hundred rows because a save was refused is not a recovery.
      if (!isReportedWriteFailure(err)) {
        this.toast.flash(
          err instanceof Error ? err.message : this.i18n.t('toast.csvImport.failed'),
        );
      }
      return;
    }
    this.importOpen.set(false);
    this.toast.flash(
      this.i18n.plural(count, 'toast.csvImport.done.one', 'toast.csvImport.done.other'),
    );
  }

  /** Whether anything is narrowing the list beyond the group itself. */
  protected readonly filtering = computed(
    () =>
      !!this.condition() ||
      !!this.ownFilter() ||
      !!this.sectionFilter() ||
      !!this.tagFilter() ||
      this.searching(),
  );

  /**
   * How many rows are on screen, against the scope's own total.
   *
   * Deliberately *not* the hero's ratio: that measures the group against its
   * declared set and is computed before any filter, so with filters on it
   * contradicted what the screen showed. `scope().catalogued` is the honest
   * denominator here — how many the group holds, filtered or not.
   */
  protected readonly countLabel = computed(() =>
    this.i18n.plural(this.items().length, 'browse.showing.one', 'browse.showing.other', {
      total: this.scope().catalogued,
    }),
  );

  /**
   * One chip per narrowing in force, worded here so the summary component stays
   * presentational.
   *
   * The section is in the list, which is the point: `?s=` had no representation
   * anywhere except one heading turning a slightly different colour — status by
   * colour alone — and the empty state's "clear filters" was the only thing that
   * ever mentioned it. The search text is in the list too, because the box lives
   * in the top bar, far from the list it is emptying.
   */
  protected readonly activeFilters = computed<BrowseFilterChip[]>(() => {
    const chips: BrowseFilterChip[] = [];
    const condition = this.condition();
    if (condition) {
      chips.push({
        kind: 'condition',
        label: this.i18n.t('browse.filter.condition', {
          name: this.i18n.t(conditionLabelKey(condition)),
        }),
      });
    }
    const own = this.ownFilter();
    if (own) {
      chips.push({
        kind: 'own',
        label: this.i18n.t('browse.filter.own', {
          name: this.i18n.t(own === 'owned' ? 'filters.owned' : 'filters.wanted'),
        }),
      });
    }
    const section = this.sectionFilter();
    if (section) {
      chips.push({
        kind: 'section',
        label: this.i18n.t('browse.filter.section', { name: this.sectionFilterName() }),
      });
    }
    const tag = this.tagFilter();
    if (tag) chips.push({ kind: 'tag', label: this.i18n.t('browse.filter.tag', { tag }) });
    const query = this.store.query().trim();
    if (query) {
      chips.push({ kind: 'search', label: this.i18n.t('browse.filter.search', { q: query }) });
    }
    return chips;
  });

  /** The narrowed run's own name, or the leftovers bucket's label. */
  private readonly sectionFilterName = computed(() => {
    const id = this.sectionFilter();
    if (!id || id === UNSECTIONED_ID) return this.i18n.t('section.none');
    return this.sections().find(section => section.id === id)?.name ?? '';
  });

  /** Drops exactly one narrowing, leaving the rest of them in force. */
  protected removeFilter(kind: BrowseFilterKind): void {
    switch (kind) {
      case 'condition':
        return this.narrow(conditionParams(null));
      case 'own':
        return this.narrow(ownParams(null));
      case 'section':
        return this.narrow(sectionParams(null));
      case 'tag':
        return this.narrow(tagParams(null));
      case 'search':
        // The search box is in the top bar and is not a query param, so it is
        // cleared through the store — exactly as `clearFilters` has to.
        this.store.query.set('');
        return;
    }
  }

  // --- ordering ---

  /** Moves a visible item, leaving anything the filters hid where it is. */
  protected moveItem(from: number, to: number): void {
    const collection = this.collection();
    if (!collection) return;
    const visible = this.items();
    const reordered = moveInList(visible, from, to);
    if (reordered === visible) return;

    const next = this.withSectionOfDrop(
      applyManualOrder(
        this.sourceItems(),
        visible.map(i => i.id),
        reordered.map(i => i.id),
      ),
      visible[from],
      visible[to],
    );
    this.pendingOrder.set({ id: collection.id, items: next });
    this.moveAnnouncement.set(
      this.i18n.t('browse.moved', {
        name: visible[from].name,
        position: to + 1,
        total: visible.length,
      }),
    );
    clearTimeout(this.orderTimer);
    this.orderTimer = setTimeout(() => void this.persistOrder(), ORDER_DEBOUNCE_MS);
  }

  /**
   * The reordered list with the dragged item's section set to the one it was
   * dropped into.
   *
   * Dragging past a heading *is* how an item changes section — there is no
   * separate gesture, and inventing one would leave the obvious one silently
   * doing nothing. Which section it lands in is read from the item it displaced
   * rather than from a neighbour, because a slot unambiguously belongs to
   * whatever was sitting in it; asking "who is above me now?" cannot express
   * joining a run at its top.
   *
   * A no-op wherever no section applies — the collection root, the unfiled
   * bucket, a group that declares none. Without that guard a plain reorder at
   * the root would resolve every id to "" and quietly unfile the item from a
   * section belonging to a group not even on screen.
   */
  private withSectionOfDrop(items: Item[], moved: Item, displaced: Item | undefined): Item[] {
    const sections = this.groupSections();
    if (!sections.length || !moved || !displaced) return items;

    const groupId = this.g() ?? '';
    const target = resolveSectionId(this.sections(), groupId, displaced.sectionId);
    if (target === moved.sectionId) return items;
    return items.map(item => (item.id === moved.id ? { ...item, sectionId: target } : item));
  }

  private async persistOrder(): Promise<void> {
    const pending = this.pendingOrder();
    const collection = this.collection();
    if (!pending || !collection || pending.id !== collection.id) return;
    try {
      await this.store.updateCollection({ ...collection, items: pending.items });
      this.toast.success(this.i18n.t('toast.order.saved'));
    } catch (err) {
      // Refused here, not sent: another write of this collection was still in
      // flight. The order is still only in `pendingOrder`, so it is kept and
      // re-armed rather than dropped — the drag has to reach storage, and the
      // debounce is exactly the mechanism for "later".
      if (err instanceof VaultBusyError) {
        clearTimeout(this.orderTimer);
        this.orderTimer = setTimeout(() => void this.persistOrder(), ORDER_DEBOUNCE_MS);
        return;
      }
      // A conflict already has the shell's notice, which says more and stays
      // put; a toast on top would say less and then take itself away.
      if (!isReportedWriteFailure(err)) {
        this.toast.error(
          err instanceof Error ? err.message : this.i18n.t('toast.order.failed'),
        );
      }
    }

    // Clear the pending order only if it is still the one we just wrote.
    //
    // Two things conspired here, and each hid the other.
    //
    // This used to be a `finally`, and a `finally` runs on the way out of a
    // `return` as well — including the early return above, whose entire purpose
    // is to *keep* the pending order for the re-arm. (The comment that lived
    // there claimed the return prevented that. It does not, which is why the
    // bug survived review.)
    //
    // Moving it out of the `finally` is necessary and not sufficient: this
    // request was awaited, so a move made *while it was in flight* has already
    // replaced `pendingOrder`, and clearing unconditionally on our own success
    // discards that newer move instead. The identity check is what makes the
    // re-armed run find something to write.
    //
    // Either way the symptom was the same and silent: a second reorder made
    // before the first had saved was thrown away, and the item jumped back to
    // where it started with no toast and no conflict notice.
    if (this.pendingOrder() === pending) this.pendingOrder.set(null);
  }

  // --- actions ---

  protected setView(next: ViewMode): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { v: viewParam(next, this.hasChildren()) },
      queryParamsHandling: 'merge',
    });
  }

  protected setCondition(next: Condition | null): void {
    this.narrow(conditionParams(next));
  }

  /**
   * Status, and the condition it invalidates.
   *
   * A condition matches when *some copy* is in it; `own: 'wanted'` matches when
   * the item has *no copies*. The intersection is empty by construction, so
   * "Mint" then "Wanted" — a perfectly sensible question — emptied the list and
   * the empty state blamed the filters without saying which two contradicted.
   * Picking "Wanted" drops the condition, in one navigation so the URL never
   * holds the pair, the same way `groupLinkParams` drops `?s=` on a group change.
   */
  protected setOwn(next: OwnFilter): void {
    this.narrow(
      next === 'wanted' ? { ...ownParams(next), ...conditionParams(null) } : ownParams(next),
    );
  }

  protected setTag(next: string | null): void {
    this.narrow(tagParams(next));
  }

  protected setSortOverride(next: GroupSort | null): void {
    this.narrow(sortParams(next));
  }

  /**
   * A column header. Compared against the *effective* order, not the override,
   * so the first click on the column a group already sorts by reverses it
   * instead of appearing to do nothing.
   */
  protected sortByColumn(by: string): void {
    this.narrow(sortParams(nextSortFor(this.effectiveSort(), by)));
  }

  /**
   * Clicking a heading narrows to that run; clicking the active one widens
   * back. A toggle rather than a link, because a section is a filter and not a
   * destination — and because the heading is the only affordance there is.
   */
  protected toggleSection(sectionId: string): void {
    this.narrow(sectionParams(this.sectionFilter() === sectionId ? null : sectionId));
  }

  /**
   * Filters and order replace the current history entry rather than stacking
   * one per chip: back should return to where you came from, not undo six
   * toggles. The URL still holds them, so leaving for an item and coming back
   * lands on the same list.
   */
  /**
   * Drops every filter at once, leaving the group and the order alone.
   *
   * The global search box lives in the top bar and is not a query param, so it
   * has to be cleared through the store — an empty state offering to clear the
   * filters while a stale search kept the list empty would be a dead end
   * wearing the clothes of a way out.
   */
  protected clearFilters(): void {
    this.store.query.set('');
    this.narrow({
      ...conditionParams(null),
      ...ownParams(null),
      ...sectionParams(null),
      ...tagParams(null),
    });
  }

  private narrow(queryParams: Params): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setTreeExpanded(expanded: ReadonlySet<string>): void {
    this.treeExpanded.set(expanded);
    const collection = this.collection();
    if (collection) writeExpanded(collection.id, expanded);
  }

  protected toggleTree(): void {
    const collapsed = !this.treeCollapsed();
    this.treeCollapsed.set(collapsed);
    writeCollapsed(collapsed);
  }

  /** Escape, or a commit with nothing typed. `ui-inline-edit` owns both keys. */
  protected cancelNewGroup(): void {
    this.pendingGroupParent.set(null);
  }

  protected startNewGroup(): void {
    // A group created from inside the unfiled bucket belongs at the root:
    // "no group" is not a parent anything can nest under.
    const parentId = this.g() === UNGROUPED_ID ? null : this.selectedGroup()?.id ?? null;
    this.pendingGroupParent.set({ parentId });
  }

  protected commitNewGroup(name: string): void {
    const pending = this.pendingGroupParent();
    const collection = this.collection();
    this.pendingGroupParent.set(null);
    const trimmed = name.trim();
    if (!pending || !collection || !trimmed) return;
    const node: GroupNode = {
      id: `g${Date.now()}`,
      name: trimmed,
      parentId: pending.parentId,
      fields: [],
      sort: null,
      target: null,
    };
    void this.store
      .updateCollection({ ...collection, groups: [...collection.groups, node] })
      .then(() => {
        this.toast.flash(this.i18n.t('toast.group.added', { name: trimmed }));
        // The group files itself alphabetically somewhere in the tree, so
        // without this the toast was the only evidence it existed at all.
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: groupLinkParams(node.id),
          queryParamsHandling: 'merge',
        });
      })
      // A refused save used to be an unhandled rejection here — nothing on
      // screen, nothing in the log, and a group the user believes they added.
      // The conflict notice explains a 412; this covers everything else.
      .catch((err: unknown) => {
        if (isReportedWriteFailure(err)) return;
        this.toast.flash(
          err instanceof Error ? err.message : this.i18n.t('toast.group.addFailed'),
        );
      });
  }
}
