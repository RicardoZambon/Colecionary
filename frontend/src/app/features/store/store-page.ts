import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { I18nService } from '../../core/i18n';
import { ToastService } from '../../core/state/toast.service';
import { VaultStore } from '../../core/state/vault.store';
import { StoreListing } from '../../core/models';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { UiButton } from '../../shared/ui/button/button';
import { UiCard } from '../../shared/ui/card/card';
import { UiEmpty } from '../../shared/ui/empty/empty';
import { UiSkeleton } from '../../shared/ui/skeleton/skeleton';

@Component({
  selector: 'app-store-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyPipe, TPipe, UiButton, UiCard, UiEmpty, UiSkeleton],
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
   * Whether to offer the write affordance at all.
   *
   * A courtesy, not a control — see the doc comment on `VaultStore.canEdit`.
   * `importStoreListing` is a write and a Viewer's is refused with a 403, so a
   * reader gets the catalogue as a catalogue.
   */
  protected readonly canEdit = computed(() => this.store.canEdit());

  /** Which listing is being added right now, so its button stops offering itself. */
  protected readonly adding = signal<string | null>(null);

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

  /**
   * Adds a catalogue listing to the vault and opens it.
   *
   * The `catch` is not decoration. `importStoreListing` reports and returns
   * `null` today, so this was the one call site in the area with no handler —
   * and the day it rethrows instead, an unhandled rejection from a click is
   * exactly the silence `DashboardPage.newCollection` documents having fixed.
   */
  protected async add(listing: StoreListing): Promise<void> {
    if (this.adding()) return;
    this.adding.set(listing.id);
    let created;
    try {
      created = await this.store.importStoreListing(listing.id);
    } catch {
      // The store already reported the failure in its own voice; nothing is
      // navigated to, because the collection it would open does not exist.
      this.toast.error(this.i18n.t('toast.collection.addFailed'));
      return;
    } finally {
      this.adding.set(null);
    }
    if (!created) return;
    this.toast.success(this.i18n.t('toast.collection.added'));
    void this.router.navigate(['/c', created.id]);
  }
}
