import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ToastService } from '../../core/state/toast.service';
import { VaultStore } from '../../core/state/vault.store';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { UiCard, UiImageSlot, UiSectionLabel } from '../../shared/ui';

interface RecentEntry {
  collectionId: string;
  itemId: string;
  name: string;
  sub: string;
  value: number;
}

/** [collectionId, itemId, when] — demo "recently added" feed. */
const RECENT_SEED: [string, string, string][] = [
  ['retro', 'n64', '2h ago'],
  ['comics', 'saga', '1d ago'],
  ['vinyl', 'doomost', '2d ago'],
  ['cards', 'charizard', '4d ago'],
];

@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MoneyPipe, UiCard, UiImageSlot, UiSectionLabel],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  protected readonly store = inject(VaultStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly stats = computed(() => [
    { label: 'ITEMS', value: String(this.store.totalItems()), sub: `across ${this.store.collections().length} collections`, money: false },
    { label: 'EST. VALUE', value: this.store.totalOwnedValue(), sub: '▲ 4.2% this month', money: true },
    { label: 'GROUPS', value: String(this.store.totalGroups()), sub: `in ${this.store.collections().length} collections`, money: false },
    { label: 'ADDED', value: '4', sub: 'this week', money: false },
  ]);

  protected readonly recent = computed<RecentEntry[]>(() =>
    RECENT_SEED.flatMap(([collectionId, itemId, when]) => {
      const collection = this.store.collection(collectionId);
      const item = collection?.items.find(i => i.id === itemId);
      if (!collection || !item) return [];
      return [{ collectionId, itemId, name: item.name, sub: `${collection.name} · added ${when}`, value: item.value }];
    }),
  );

  protected ownedCount(collectionId: string): number {
    return this.store.collection(collectionId)?.items.filter(i => i.owned).length ?? 0;
  }

  protected ownedValue(collectionId: string): number {
    return (
      this.store
        .collection(collectionId)
        ?.items.filter(i => i.owned)
        .reduce((acc, i) => acc + i.value, 0) ?? 0
    );
  }

  protected async newCollection(): Promise<void> {
    const created = await this.store.createCollection('New collection', '');
    this.toast.flash('Collection created — name it here');
    void this.router.navigate(['/c', created.id, 'settings'], { queryParams: { tab: 'general' } });
  }
}
