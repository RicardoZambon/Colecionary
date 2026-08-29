import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';

import { I18nService } from '../../../core/i18n';
import { VaultConflictError } from '../../../core/api/vault-api';
import { ToastService } from '../../../core/state/toast.service';
import { VaultStore } from '../../../core/state/vault.store';
import { Condition, GroupNode, GroupSort, Item } from '../../../core/models';
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
  ownParams,
  readCondition,
  readOwn,
  readSection,
  readSort,
  sectionParams,
  sortParams,
} from '../browse-params';
import { CollectionHero } from './collection-hero/collection-hero';
import { CollectionFilters } from './collection-toolbar/collection-filters';
import { CollectionToolbar } from './collection-toolbar/collection-toolbar';
import { GroupBreadcrumb } from './group-breadcrumb/group-breadcrumb';
import { GroupDashboard } from './group-dashboard/group-dashboard';
import { GroupTree } from './group-tree/group-tree';
import { ItemGrid } from './item-grid/item-grid';
import { ItemList } from './item-list/item-list';
import { TPipe } from '../../../shared/pipes/t.pipe';
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

/** Below this the shell's own 226px sidebar leaves no room for a second column. */
const WIDE_ENOUGH = '(min-width: 1200px)';

@Component({
  selector: 'app-collection-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    TPipe,
    CollectionHero,
    CollectionFilters,
    CollectionToolbar,
    GroupBreadcrumb,
    GroupDashboard,
    GroupTree,
    ItemGrid,
    ItemList,
  ],
  templateUrl: './collection-page.html',
  styleUrl: './collection-page.scss',
})
export class CollectionPage {
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
  readonly sort = input<string | undefined>(undefined);
  readonly dir = input<string | undefined>(undefined);

  protected readonly condition = computed(() => readCondition(this.cond()));
  protected readonly sectionFilter = computed(() =>
    readSection(this.s(), this.sections(), this.g() ?? null),
  );
  protected readonly ownFilter = computed<OwnFilter>(() => readOwn(this.own()));
  /** Null means "use the selected group's configured order". */
  protected readonly sortOverride = computed(() => readSort(this.sort(), this.dir()));
  protected readonly pendingGroupParent = signal<{ parentId: string | null } | null>(null);
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

  constructor() {
    // Restore the tree once per collection, seeding it with the path to the
    // group in the URL so it opens showing where you are.
    effect(() => {
      const collection = this.collection();
      if (!collection || this.restoredFor === collection.id) return;
      this.restoredFor = collection.id;

      const known = new Set(collection.groups.map(group => group.id));
      const path = pathOf(collection.groups, this.g() ?? null).map(node => node.id);
      this.treeExpanded.set(initialExpanded(readExpanded(collection.id), path, known));
      this.treeCollapsed.set(readCollapsed() ?? !matchMedia(WIDE_ENOUGH).matches);
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

  protected readonly collection = computed(() => this.store.collection(this.collectionId()));
  protected readonly groups = computed(() => this.collection()?.groups ?? []);
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

  /** Custom fields available in the current group, own plus inherited. */
  protected readonly groupFields = computed(() => fieldsFor(this.groups(), this.g() ?? null));
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
    query: this.store.query(),
    sort: this.sortOverride(),
  }));

  protected readonly items = computed(() =>
    visibleItems(this.sourceItems(), this.groups(), this.criteria(), this.sections()),
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

  /** Whether anything is narrowing the list beyond the group itself. */
  private readonly filtering = computed(
    () =>
      !!this.condition() ||
      !!this.ownFilter() ||
      !!this.sectionFilter() ||
      this.searching(),
  );

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
      this.toast.flash(this.i18n.t('toast.order.saved'));
    } catch (err) {
      // A conflict already has the shell's notice, which says more and stays
      // put; a toast on top would say less and then take itself away.
      if (!(err instanceof VaultConflictError)) {
        this.toast.flash(
          err instanceof Error ? err.message : this.i18n.t('toast.order.failed'),
        );
      }
    } finally {
      // Either way the store is now the authority again.
      this.pendingOrder.set(null);
    }
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

  protected setOwn(next: OwnFilter): void {
    this.narrow(ownParams(next));
  }

  protected setSortOverride(next: GroupSort | null): void {
    this.narrow(sortParams(next));
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

  protected newGroupKeydown(event: KeyboardEvent): void {
    const input = event.target as HTMLInputElement;
    if (event.key === 'Enter') this.commitNewGroup(input.value);
    else if (event.key === 'Escape') {
      input.value = '';
      this.pendingGroupParent.set(null);
    }
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
      .then(() => this.toast.flash(this.i18n.t('toast.group.added', { name: trimmed })))
      // A refused save used to be an unhandled rejection here — nothing on
      // screen, nothing in the log, and a group the user believes they added.
      // The conflict notice explains a 412; this covers everything else.
      .catch((err: unknown) => {
        if (err instanceof VaultConflictError) return;
        this.toast.flash(
          err instanceof Error ? err.message : this.i18n.t('toast.group.addFailed'),
        );
      });
  }
}
