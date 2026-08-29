import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { I18nService } from '../../core/i18n';
import { ToastService } from '../../core/state/toast.service';
import { VaultStore } from '../../core/state/vault.store';
import { StoreListing } from '../../core/models';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { UiButton, UiCard, UiSkeleton } from '../../shared/ui';

@Component({
  selector: 'app-store-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyPipe, TPipe, UiButton, UiCard, UiSkeleton],
  templateUrl: './store-page.html',
  styleUrl: './store-page.scss',
})
export class StorePage {
  protected readonly store = inject(VaultStore);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /**
   * The catalogue has not arrived yet, so the grid draws its own shape rather
   * than appearing all at once under the heading. Three cards: enough to fill
   * the first row at any width the grid resolves to, and the count is not a
   * prediction — it is a reserved row.
   */
  protected readonly loading = computed(() => !this.store.loaded());

  /**
   * "by Panini · 300 items · 12 groups" — two independent counts, each rendered
   * as a count phrase so a one-group checklist stops saying "1 grupos".
   */
  protected listingMeta(listing: StoreListing): string {
    return this.i18n.t('store.listingMeta', {
      publisher: listing.publisher,
      items: this.i18n.count(listing.items.length, 'item'),
      groups: this.i18n.count(listing.groups.length, 'group'),
    });
  }
  protected readonly placeholders = [0, 1, 2];

  protected inVault(listing: StoreListing): boolean {
    return this.store.collections().some(c => c.id === listing.id);
  }

  protected totalValue(listing: StoreListing): number {
    return listing.items.reduce((acc, i) => acc + i.value, 0);
  }

  protected async add(listing: StoreListing): Promise<void> {
    const created = await this.store.importStoreListing(listing.id);
    if (!created) return;
    this.toast.flash(this.i18n.t('toast.collection.added'));
    void this.router.navigate(['/c', created.id]);
  }
}
