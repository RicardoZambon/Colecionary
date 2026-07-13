import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ImagesApi } from '../../core/api/images-api';
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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_COUNT = 4;

@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MoneyPipe, UiCard, UiImageSlot, UiSectionLabel],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  protected readonly store = inject(VaultStore);
  protected readonly images = inject(ImagesApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  private readonly allItems = computed(() =>
    this.store.collections().flatMap(collection =>
      collection.items.map(item => ({ collection, item })),
    ),
  );

  protected readonly addedThisWeek = computed(() => {
    const cutoff = Date.now() - WEEK_MS;
    return this.allItems().filter(
      x => x.item.createdAt && new Date(x.item.createdAt).getTime() >= cutoff,
    ).length;
  });

  /** Owned value vs what was actually paid — the only honest "trend" we have. */
  protected readonly appreciationLabel = computed(() => {
    const owned = this.allItems()
      .map(x => x.item)
      .filter(i => i.owned && i.price > 0);
    const paid = owned.reduce((acc, i) => acc + i.price, 0);
    if (!paid) return 'no purchase data yet';
    const value = owned.reduce((acc, i) => acc + i.value, 0);
    const pct = ((value - paid) / paid) * 100;
    return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% vs purchase`;
  });

  protected readonly stats = computed(() => [
    { label: 'ITEMS', value: String(this.store.totalItems()), sub: `across ${this.store.collections().length} collections`, money: false },
    { label: 'EST. VALUE', value: this.store.totalOwnedValue(), sub: this.appreciationLabel(), money: true },
    { label: 'GROUPS', value: String(this.store.totalGroups()), sub: `in ${this.store.collections().length} collections`, money: false },
    { label: 'ADDED', value: String(this.addedThisWeek()), sub: 'this week', money: false },
  ]);

  protected readonly recent = computed<RecentEntry[]>(() =>
    this.allItems()
      .filter(x => x.item.createdAt)
      .sort(
        (a, b) =>
          new Date(b.item.createdAt!).getTime() - new Date(a.item.createdAt!).getTime(),
      )
      .slice(0, RECENT_COUNT)
      .map(x => ({
        collectionId: x.collection.id,
        itemId: x.item.id,
        name: x.item.name,
        sub: `${x.collection.name} · added ${timeAgo(x.item.createdAt!)}`,
        value: x.item.value,
      })),
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

function timeAgo(iso: string): string {
  const elapsedMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.floor(elapsedMs / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
