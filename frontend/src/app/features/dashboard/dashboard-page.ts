import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ImagesApi } from '../../core/api/images-api';
import { I18nService } from '../../core/i18n';
import { ImageFocusService } from '../../core/state/image-focus.service';
import { ToastService } from '../../core/state/toast.service';
import { VaultStore } from '../../core/state/vault.store';
import { isOwned, ownedValue, paidTotal, sortValue } from '../../core/utils/copies.util';
import { formatRelative } from '../../core/utils/date.util';
import { CurrencyCode, formatMoney } from '../../core/utils/money.util';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { UiCard, UiImageSlot, UiSectionLabel } from '../../shared/ui';

interface RecentEntry {
  collectionId: string;
  itemId: string;
  name: string;
  sub: string;
  value: number;
  /** The item's own collection decides the symbol, not the page. */
  currency: CurrencyCode;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_COUNT = 4;

@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MoneyPipe, TPipe, UiCard, UiImageSlot, UiSectionLabel],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  protected readonly store = inject(VaultStore);
  protected readonly images = inject(ImagesApi);
  protected readonly focus = inject(ImageFocusService);
  protected readonly i18n = inject(I18nService);
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
    const owned = this.allItems().map(x => x.item).filter(isOwned);
    const paid = owned.reduce((acc, i) => acc + paidTotal(i), 0);
    if (!paid) return this.i18n.t('dashboard.noPurchaseData');
    const value = owned.reduce((acc, i) => acc + ownedValue(i), 0);
    const pct = ((value - paid) / paid) * 100;
    // Through Intl so the decimal separator follows the language: 12,5% in pt-BR.
    const magnitude = new Intl.NumberFormat(this.i18n.locale(), {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(Math.abs(pct));
    return this.i18n.t('dashboard.appreciation', { arrow: pct >= 0 ? '▲' : '▼', pct: magnitude });
  });

  /**
   * The value tile carries one line per currency in play, not a single sum.
   *
   * Collections can override the account currency, and adding BRL to USD gives
   * a number that is not an amount of money in either. With one currency — the
   * usual case — there is exactly one line and the tile reads as it always did.
   */
  protected readonly stats = computed<{ label: string; values: string[]; sub: string }[]>(() => {
    const collections = this.store.collections().length;
    const locale = this.i18n.locale();
    return [
      { label: this.i18n.t('dashboard.stat.items'), values: [String(this.store.totalItems())], sub: this.i18n.t('dashboard.stat.itemsSub', { collections }) },
      {
        label: this.i18n.t('dashboard.stat.value'),
        values: this.store.ownedValueByCurrency().map(x => formatMoney(x.total, locale, x.currency)),
        sub: this.appreciationLabel(),
      },
      { label: this.i18n.t('dashboard.stat.groups'), values: [String(this.store.totalGroups())], sub: this.i18n.t('dashboard.stat.groupsSub', { collections }) },
      { label: this.i18n.t('dashboard.stat.added'), values: [String(this.addedThisWeek())], sub: this.i18n.t('dashboard.stat.addedSub') },
    ];
  });

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
        sub: this.i18n.t('dashboard.recentSub', {
          collection: x.collection.name,
          when: formatRelative(x.item.createdAt!, this.i18n.locale(), new Date()),
        }),
        value: sortValue(x.item),
        currency: this.store.currencyFor(x.collection.id),
      })),
  );

  protected ownedCount(collectionId: string): number {
    return this.store.collection(collectionId)?.items.filter(isOwned).length ?? 0;
  }

  protected ownedValue(collectionId: string): number {
    return (
      this.store.collection(collectionId)?.items.reduce((acc, i) => acc + ownedValue(i), 0) ?? 0
    );
  }

  protected async newCollection(): Promise<void> {
    const created = await this.store.createCollection(
      this.i18n.t('dashboard.newCollectionName'),
      '',
    );
    this.toast.flash(this.i18n.t('toast.collection.created'));
    void this.router.navigate(['/c', created.id, 'settings'], { queryParams: { tab: 'general' } });
  }
}
