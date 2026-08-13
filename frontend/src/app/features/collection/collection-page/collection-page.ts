import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ImagesApi } from '../../../core/api/images-api';
import { ImageFocusService } from '../../../core/state/image-focus.service';
import { ToastService } from '../../../core/state/toast.service';
import { VaultStore } from '../../../core/state/vault.store';
import { CONDITIONS, Condition, GroupNode, GroupSort, Item } from '../../../core/models';
import { isOwned, ownedValue } from '../../../core/utils/copies.util';
import {
  childrenOf,
  fieldsFor,
  groupById,
  pathOf,
  sortFor,
  subtreeIds,
} from '../../../core/utils/groups.util';
import {
  DEFAULT_SORT,
  applyManualOrder,
  customFieldName,
  fieldValue,
  moveInList,
  sortChoices,
  sortItems,
  sortLabel,
} from '../../../core/utils/sort.util';
import { itemBadgeLabel, itemTone } from '../../../shared/ui/badge/badge';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import {
  UiAvatarStack,
  UiBadge,
  UiButton,
  UiCard,
  UiChip,
  UiDropdown,
  UiImageSlot,
  UiProgress,
  UiReorder,
} from '../../../shared/ui';

type ViewMode = 'grid' | 'list';
type OwnFilter = 'owned' | 'wanted' | null;

interface GroupChip {
  id: string | null;
  label: string;
  count: string | null;
  selected: boolean;
  onPath: boolean;
}

/** A row in the sort menu. A null `sort` means "follow the group's default". */
interface SortMenuOption {
  id: string;
  label: string;
  sort: GroupSort | null;
}

const GROUP_DEFAULT_ID = 'group';

function sortId(sort: GroupSort): string {
  return `${sort.by}|${sort.direction}`;
}

/** Reordering writes the whole collection back, so coalesce rapid drags. */
const ORDER_DEBOUNCE_MS = 400;

@Component({
  selector: 'app-collection-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MoneyPipe,
    UiAvatarStack,
    UiBadge,
    UiButton,
    UiCard,
    UiChip,
    UiDropdown,
    UiImageSlot,
    UiProgress,
    UiReorder,
  ],
  templateUrl: './collection-page.html',
  styleUrl: './collection-page.scss',
})
export class CollectionPage {
  protected readonly store = inject(VaultStore);
  protected readonly images = inject(ImagesApi);
  protected readonly focus = inject(ImageFocusService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Bound from the route by withComponentInputBinding(). */
  readonly collectionId = input.required<string>();
  /** Selected group id — lives in the URL so back/refresh keep context. */
  readonly g = input<string | undefined>(undefined);

  protected readonly conditions = CONDITIONS;
  protected readonly condition = signal<Condition | null>(null);
  protected readonly own = signal<OwnFilter>(null);
  /** Null means "use the selected group's configured order". */
  protected readonly sortOverride = signal<GroupSort | null>(null);
  protected readonly view = signal<ViewMode>('grid');
  protected readonly pendingGroupParent = signal<{ parentId: string | null } | null>(null);
  protected readonly dragIndex = signal<number | null>(null);

  /**
   * Item order held locally while a manual reorder is being saved, so a drag
   * lands instantly instead of waiting on the round-trip. Scoped to a
   * collection id so switching collections can't show a stale order.
   */
  private readonly pendingOrder = signal<{ id: string; items: Item[] } | null>(null);
  private orderTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Each group carries its own default; a pick made in one group shouldn't
    // leak into the next.
    effect(() => {
      this.g();
      this.sortOverride.set(null);
    });
  }

  protected readonly collection = computed(() => this.store.collection(this.collectionId()));
  protected readonly groups = computed(() => this.collection()?.groups ?? []);
  protected readonly selectedGroup = computed(() => groupById(this.groups(), this.g() ?? null));
  protected readonly selectedPath = computed(() =>
    this.g() ? pathOf(this.groups(), this.g()!) : [],
  );

  protected readonly title = computed(() => {
    const collection = this.collection();
    if (!collection) return '';
    const names = this.selectedPath().map(g => g.name);
    const shown = names.length > 2 ? ['…', ...names.slice(-2)] : names;
    return shown.length ? `${collection.name} / ${shown.join(' / ')}` : collection.name;
  });

  protected readonly ownedCount = computed(
    () => this.collection()?.items.filter(isOwned).length ?? 0,
  );
  protected readonly ownedPct = computed(() => {
    const total = this.collection()?.items.length ?? 0;
    return total ? Math.round((this.ownedCount() / total) * 100) : 0;
  });
  protected readonly totalCopies = computed(
    () => this.collection()?.items.reduce((acc, i) => acc + i.copies.length, 0) ?? 0,
  );
  /** Estimated value of the copies actually held — wanted items count for nothing. */
  protected readonly totalValue = computed(
    () => this.collection()?.items.reduce((acc, i) => acc + ownedValue(i), 0) ?? 0,
  );

  protected readonly headerMembers = computed(() => {
    const collection = this.collection();
    if (!collection) return [];
    const owner = this.store.tenantMembers().find(m => m.role === 'Owner');
    return owner ? [owner, ...collection.members] : collection.members;
  });

  protected readonly chips = computed<GroupChip[]>(() => {
    const collection = this.collection();
    if (!collection) return [];
    const groups = this.groups();
    const current = this.selectedGroup();
    const path = this.selectedPath();

    const chipFor = (node: GroupNode): GroupChip => {
      const selected = current?.id === node.id;
      const ids = new Set(subtreeIds(groups, node.id));
      return {
        id: node.id,
        label: node.name + (childrenOf(groups, node.id).length ? ' ▸' : ''),
        count: String(collection.items.filter(i => ids.has(i.groupId)).length),
        selected,
        onPath: !selected && path.some(p => p.id === node.id),
      };
    };

    if (!current) {
      return [
        { id: null, label: 'All items', count: String(collection.items.length), selected: true, onPath: false },
        ...childrenOf(groups, null).map(chipFor),
      ];
    }
    const parent = current.parentId ? groupById(groups, current.parentId) : undefined;
    return [
      { id: parent?.id ?? null, label: `‹ ${parent?.name ?? 'All items'}`, count: null, selected: false, onPath: false },
      chipFor(current),
      ...childrenOf(groups, current.id).map(chipFor),
    ];
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

  /** The collection's items, preferring an unsaved manual reorder. */
  private readonly sourceItems = computed(() => {
    const collection = this.collection();
    if (!collection) return [];
    const pending = this.pendingOrder();
    return pending?.id === collection.id ? pending.items : collection.items;
  });

  protected readonly items = computed(() => {
    const groupFilter = this.g() ? new Set(subtreeIds(this.groups(), this.g()!)) : null;
    const query = this.store.query().toLowerCase();

    const filtered = this.sourceItems().filter(
      item =>
        (!groupFilter || groupFilter.has(item.groupId)) &&
        // An item matches a condition when any of its copies is in it.
        (!this.condition() || item.copies.some(c => c.condition === this.condition())) &&
        (!this.own() || (this.own() === 'owned' ? isOwned(item) : !isOwned(item))) &&
        (!query || item.name.toLowerCase().includes(query)),
    );

    return sortItems(filtered, this.effectiveSort(), this.groupFields());
  });

  protected readonly sortOptions = computed<SortMenuOption[]>(() => {
    const groupSort = this.groupSort();
    const choices = sortChoices(this.groupFields()).map(choice => ({
      id: sortId(choice),
      label: choice.label,
      sort: { by: choice.by, direction: choice.direction },
    }));
    return groupSort
      ? [
          {
            id: GROUP_DEFAULT_ID,
            label: `Group default — ${sortLabel(groupSort)}`,
            sort: null,
          },
          ...choices,
        ]
      : choices;
  });

  protected readonly activeSortId = computed(() => {
    const override = this.sortOverride();
    if (override) return sortId(override);
    return this.groupSort() ? GROUP_DEFAULT_ID : sortId(this.effectiveSort());
  });

  protected readonly sortLabel = computed(() => sortLabel(this.effectiveSort()));

  // --- template helpers ---

  protected groupName(item: Item): string {
    return groupById(this.groups(), item.groupId)?.name ?? item.groupId;
  }

  protected badgeTone(item: Item) {
    return itemTone(item);
  }

  protected badgeLabel(item: Item): string {
    return itemBadgeLabel(item);
  }

  protected isOwned(item: Item): boolean {
    return isOwned(item);
  }

  /** The sort field's value for an item, or null when there is nothing to show. */
  protected fieldChip(item: Item): string | null {
    const name = this.sortFieldName();
    return name ? fieldValue(item, name) || null : null;
  }

  // --- ordering ---

  protected pickSort(option: SortMenuOption): void {
    this.sortOverride.set(option.sort);
  }

  /** Moves a visible item, leaving anything the filters hid where it is. */
  protected moveItem(from: number, to: number): void {
    const collection = this.collection();
    if (!collection) return;
    const visible = this.items();
    const reordered = moveInList(visible, from, to);
    if (reordered === visible) return;

    const next = applyManualOrder(
      this.sourceItems(),
      visible.map(i => i.id),
      reordered.map(i => i.id),
    );
    this.pendingOrder.set({ id: collection.id, items: next });
    clearTimeout(this.orderTimer);
    this.orderTimer = setTimeout(() => void this.persistOrder(), ORDER_DEBOUNCE_MS);
  }

  private async persistOrder(): Promise<void> {
    const pending = this.pendingOrder();
    const collection = this.collection();
    if (!pending || !collection || pending.id !== collection.id) return;
    try {
      await this.store.updateCollection({ ...collection, items: pending.items });
      this.toast.flash('Order saved ✓');
    } catch (err) {
      this.toast.flash(err instanceof Error ? err.message : 'Could not save the order');
    } finally {
      // Either way the store is now the authority again.
      this.pendingOrder.set(null);
    }
  }

  protected onDragStart(event: DragEvent, index: number): void {
    if (!this.manual()) return;
    this.dragIndex.set(index);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  protected onDragOver(event: DragEvent): void {
    if (!this.manual() || this.dragIndex() === null) return;
    // Without preventDefault the browser never fires a drop.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  protected onDrop(event: DragEvent, index: number): void {
    if (!this.manual()) return;
    event.preventDefault();
    const from = this.dragIndex();
    this.dragIndex.set(null);
    if (from !== null) this.moveItem(from, index);
  }

  protected onDragEnd(): void {
    this.dragIndex.set(null);
  }

  // --- actions ---

  protected selectChip(chip: GroupChip): void {
    const target = chip.selected ? this.selectedGroup()?.parentId ?? null : chip.id;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { g: target },
      queryParamsHandling: 'merge',
    });
  }

  protected toggleCondition(value: Condition): void {
    this.condition.update(current => (current === value ? null : value));
  }

  protected toggleOwn(value: Exclude<OwnFilter, null>): void {
    this.own.update(current => (current === value ? null : value));
  }

  protected async setCollectionImage(slot: 'banner' | 'icon', file: File): Promise<void> {
    const collection = this.collection();
    if (!collection) return;
    try {
      const imageId = await this.focus.uploadAndFrame(file, slot);
      await this.store.updateCollection({
        ...collection,
        bannerImageId: slot === 'banner' ? imageId : collection.bannerImageId,
        iconImageId: slot === 'icon' ? imageId : collection.iconImageId,
      });
      this.toast.flash('Image updated ✓');
    } catch (err) {
      this.toast.flash(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  /** Reopens the editor for an image that is already in place. */
  protected reframeCollectionImage(slot: 'banner' | 'icon'): void {
    const collection = this.collection();
    const imageId = slot === 'banner' ? collection?.bannerImageId : collection?.iconImageId;
    if (imageId) void this.focus.frame(imageId, slot);
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
    };
    void this.store
      .updateCollection({ ...collection, groups: [...collection.groups, node] })
      .then(() => this.toast.flash(`Group "${trimmed}" added`));
  }
}
