import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ImagesApi } from '../../core/api/images-api';
import { I18nService } from '../../core/i18n';
import { Collection, Item } from '../../core/models';
import { ImageFocusService } from '../../core/state/image-focus.service';
import { VaultStore } from '../../core/state/vault.store';
import { isOwned, ownedValue, paidTotal } from '../../core/utils/copies.util';
import { currencyOf } from '../../core/utils/currency.util';
import { formatRelative } from '../../core/utils/date.util';
import { CurrencyCode, formatMoney } from '../../core/utils/money.util';
import { NewCollectionAction } from '../../layout/new-collection';
import { ItemValuePipe } from '../../shared/pipes/item-value.pipe';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { UiButton } from '../../shared/ui/button/button';
import { UiCard } from '../../shared/ui/card/card';
import { UiEmpty } from '../../shared/ui/empty/empty';
import { UiIcon } from '../../shared/ui/icon/icon';
import { UiImageSlot } from '../../shared/ui/image-slot/image-slot';
import { UiSectionLabel } from '../../shared/ui/section-label/section-label';
import { UiSkeleton } from '../../shared/ui/skeleton/skeleton';

interface RecentEntry {
  collectionId: string;
  itemId: string;
  name: string;
  sub: string;
  /**
   * The item itself, not a number.
   *
   * The row used to render `sortValue(item) | money`, and both halves were
   * wrong. `sortValue` is a *sort key*, so it discards the `valueIsPaid` flag
   * and the price-paid substitution went unmarked; and `money` prints
   * `R$ 0,00` for an item nobody has estimated, which reads as "worthless"
   * rather than "unknown" — the one thing the data does not say. `ItemValuePipe`
   * derives both from the item, so no view can pair the wrong number with the
   * wrong marker.
   */
  item: Item;
  /** The item's own collection decides the symbol, not the page. */
  currency: CurrencyCode;
}

/** The value tile's second line, plus the direction its mark points. */
interface Appreciation {
  label: string;
  trend: 'trend-up' | 'trend-down' | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_COUNT = 4;

@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ItemValuePipe,
    MoneyPipe,
    TPipe,
    UiButton,
    UiCard,
    UiEmpty,
    UiIcon,
    UiImageSlot,
    UiSectionLabel,
    UiSkeleton,
  ],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  /**
   * Whether to offer the write affordances at all.
   *
   * A courtesy, not a control — see the doc comment on VaultStore.canEdit.
   */
  protected readonly canEdit = computed(() => this.store.canEdit());

  protected readonly store = inject(VaultStore);
  protected readonly images = inject(ImagesApi);
  protected readonly focus = inject(ImageFocusService);
  protected readonly i18n = inject(I18nService);
  private readonly create = inject(NewCollectionAction);

  /**
   * The vault has not arrived yet, so the page draws its own shape instead of
   * nothing. Four stat tiles and four cards, which is the modal case — the
   * point is to reserve the row, not to guess the count.
   */
  protected readonly loading = computed(() => !this.store.loaded());

  /**
   * "324 items across 5 collections · welcome back, Marcus".
   *
   * Two independent counts in one sentence: neither can be a `.one`/`.other`
   * pair on its own, so each arrives as a rendered count phrase and the sentence
   * stays a single translated unit whose word order the translator owns.
   */
  protected readonly sub = computed(() =>
    this.i18n.t('dashboard.sub', {
      items: this.i18n.count(this.store.totalItems(), 'item'),
      collections: this.i18n.count(this.store.collections().length, 'collection'),
      name: this.store.profile()?.name?.split(' ')?.[0] ?? '',
    }),
  );
  protected readonly placeholders = [0, 1, 2, 3];

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

  /**
   * What was paid and what it is worth now, **per currency**.
   *
   * Split for the same reason `VaultStore.ownedValueByCurrency` is: a
   * collection can override the account currency, and adding BRL to USD gives
   * a number that is not an amount of money in either. The percentage hid that
   * error rather than avoiding it — being dimensionless, `(value - paid) / paid`
   * looks like a real figure whatever incommensurable sums went into it, and
   * the tile printed it to one decimal place as though it were precise.
   */
  private readonly purchaseByCurrency = computed<
    { currency: CurrencyCode; paid: number; value: number }[]
  >(() => {
    const rows = new Map<CurrencyCode, { paid: number; value: number }>();
    for (const collection of this.store.collections()) {
      const currency = currencyOf(collection, this.store.defaultCurrency());
      const row = rows.get(currency) ?? { paid: 0, value: 0 };
      for (const item of collection.items) {
        if (!isOwned(item)) continue;
        row.paid += paidTotal(item);
        row.value += ownedValue(item);
      }
      rows.set(currency, row);
    }
    return [...rows].map(([currency, row]) => ({ currency, ...row }));
  });

  /**
   * Owned value vs what was actually paid — the only honest "trend" we have.
   *
   * One currency in play, which is the usual case: the line reads exactly as it
   * always did. More than one: the account's own currency is reported and the
   * line names it, because a figure covering only part of the vault has to say
   * so. If the account currency is not among the ones with purchase data there
   * is no single honest number to print, so the tile says why instead of
   * printing one anyway. See ADR-75.
   */
  protected readonly appreciation = computed<Appreciation>(() => {
    const rows = this.purchaseByCurrency().filter(r => r.paid > 0);
    if (!rows.length) return { label: this.i18n.t('dashboard.noPurchaseData'), trend: null };

    const account = this.store.defaultCurrency();
    const row = rows.length === 1 ? rows[0] : rows.find(r => r.currency === account);
    if (!row) return { label: this.i18n.t('dashboard.appreciationMixed'), trend: null };

    const pct = ((row.value - row.paid) / row.paid) * 100;
    // Through Intl so the decimal separator follows the language: 12,5% in pt-BR.
    const magnitude = new Intl.NumberFormat(this.i18n.locale(), {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(Math.abs(pct));
    return {
      label:
        rows.length === 1
          ? this.i18n.t('dashboard.appreciationPct', { pct: magnitude })
          : this.i18n.t('dashboard.appreciationIn', { pct: magnitude, currency: row.currency }),
      // The direction is an icon, not a glyph in the sentence: `▲` sits off the
      // text baseline, renders differently per platform and is announced as
      // "black up-pointing triangle" before the number.
      trend: pct >= 0 ? 'trend-up' : 'trend-down',
    };
  });

  /**
   * The value tile carries one line per currency in play, not a single sum.
   *
   * Collections can override the account currency, and adding BRL to USD gives
   * a number that is not an amount of money in either. With one currency — the
   * usual case — there is exactly one line and the tile reads as it always did.
   */
  protected readonly stats = computed<
    { label: string; values: string[]; sub: string; trend: Appreciation['trend'] }[]
  >(() => {
    const collections = this.store.collections().length;
    const locale = this.i18n.locale();
    return [
      {
        label: this.i18n.t('dashboard.stat.items'),
        values: [String(this.store.totalItems())],
        sub: this.i18n.plural(
          collections,
          'dashboard.stat.itemsSub.one',
          'dashboard.stat.itemsSub.other',
        ),
        trend: null,
      },
      {
        label: this.i18n.t('dashboard.stat.value'),
        values: this.store.ownedValueByCurrency().map(x => formatMoney(x.total, locale, x.currency)),
        sub: this.appreciation().label,
        trend: this.appreciation().trend,
      },
      {
        label: this.i18n.t('dashboard.stat.groups'),
        values: [String(this.store.totalGroups())],
        sub: this.i18n.plural(
          collections,
          'dashboard.stat.groupsSub.one',
          'dashboard.stat.groupsSub.other',
        ),
        trend: null,
      },
      {
        label: this.i18n.t('dashboard.stat.added'),
        values: [String(this.addedThisWeek())],
        sub: this.i18n.t('dashboard.stat.addedSub'),
        trend: null,
      },
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
        item: x.item,
        currency: this.store.currencyFor(x.collection.id),
      })),
  );

  protected ownedCount(collectionId: string): number {
    return this.store.collection(collectionId)?.items.filter(isOwned).length ?? 0;
  }

  /**
   * "9/34 owned · 3 groups" — the group half is a count phrase, so a collection
   * with one group no longer reads "1 groups".
   */
  protected collectionMeta(collection: Collection): string {
    return this.i18n.t('dashboard.collectionMeta', {
      owned: this.ownedCount(collection.id),
      total: collection.items.length,
      groups: this.i18n.count(collection.groups.length, 'group'),
    });
  }

  protected ownedValue(collectionId: string): number {
    return (
      this.store.collection(collectionId)?.items.reduce((acc, i) => acc + ownedValue(i), 0) ?? 0
    );
  }

  /** True while the create request is in flight, so every button can say so. */
  protected readonly creating = this.create.pending;

  /** One behaviour, three affordances — see NewCollectionAction. */
  protected newCollection(): void {
    void this.create.run();
  }
}
