import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ToastService } from '../../../core/state/toast.service';
import { VaultStore } from '../../../core/state/vault.store';
import { Collection, Condition, GroupNode, Item } from '../../../core/models';
import { childrenOf, groupById, pathOf, subtreeIds } from '../../../core/utils/groups.util';
import { conditionLabel, conditionTone } from '../../../shared/ui/badge/badge';
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
} from '../../../shared/ui';

type SortKey = 'recent' | 'name' | 'valueDesc' | 'valueAsc' | 'yearAsc' | 'yearDesc';
type ViewMode = 'grid' | 'list';
type OwnFilter = 'owned' | 'wanted' | null;

interface GroupChip {
  id: string | null;
  label: string;
  count: string | null;
  selected: boolean;
  onPath: boolean;
}

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'recent', label: 'Recently added' },
  { id: 'name', label: 'Name A–Z' },
  { id: 'valueDesc', label: 'Value high → low' },
  { id: 'valueAsc', label: 'Value low → high' },
  { id: 'yearAsc', label: 'Year old → new' },
  { id: 'yearDesc', label: 'Year new → old' },
];

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
  ],
  templateUrl: './collection-page.html',
  styleUrl: './collection-page.scss',
})
export class CollectionPage {
  protected readonly store = inject(VaultStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Bound from the route by withComponentInputBinding(). */
  readonly collectionId = input.required<string>();
  /** Selected group id — lives in the URL so back/refresh keep context. */
  readonly g = input<string | undefined>(undefined);

  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly condition = signal<Condition | null>(null);
  protected readonly own = signal<OwnFilter>(null);
  protected readonly sort = signal<SortKey>('recent');
  protected readonly view = signal<ViewMode>('grid');
  protected readonly pendingGroupParent = signal<{ parentId: string | null } | null>(null);

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
    () => this.collection()?.items.filter(i => i.owned).length ?? 0,
  );
  protected readonly ownedPct = computed(() => {
    const total = this.collection()?.items.length ?? 0;
    return total ? Math.round((this.ownedCount() / total) * 100) : 0;
  });
  protected readonly totalValue = computed(
    () => this.collection()?.items.reduce((acc, i) => acc + i.value, 0) ?? 0,
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

  protected readonly items = computed(() => {
    const collection = this.collection();
    if (!collection) return [];
    const groupFilter = this.g()
      ? new Set(subtreeIds(this.groups(), this.g()!))
      : null;
    const query = this.store.query().toLowerCase();

    const filtered = collection.items.filter(
      item =>
        (!groupFilter || groupFilter.has(item.groupId)) &&
        (!this.condition() || item.condition === this.condition()) &&
        (!this.own() || (this.own() === 'owned' ? item.owned : !item.owned)) &&
        (!query || item.name.toLowerCase().includes(query)),
    );

    const sorted = [...filtered];
    switch (this.sort()) {
      case 'recent': sorted.reverse(); break;
      case 'name': sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'valueDesc': sorted.sort((a, b) => b.value - a.value); break;
      case 'valueAsc': sorted.sort((a, b) => a.value - b.value); break;
      case 'yearAsc': sorted.sort((a, b) => a.year - b.year); break;
      case 'yearDesc': sorted.sort((a, b) => b.year - a.year); break;
    }
    return sorted;
  });

  protected readonly sortLabel = computed(
    () => SORT_OPTIONS.find(o => o.id === this.sort())!.label,
  );

  // --- template helpers ---

  protected groupName(item: Item): string {
    return groupById(this.groups(), item.groupId)?.name ?? item.groupId;
  }

  protected badgeTone(item: Item) {
    return conditionTone(item.condition, item.owned);
  }

  protected badgeLabel(item: Item): string {
    return conditionLabel(item.condition, item.owned);
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
    };
    void this.store
      .updateCollection({ ...collection, groups: [...collection.groups, node] })
      .then(() => this.toast.flash(`Group "${trimmed}" added`));
  }
}
