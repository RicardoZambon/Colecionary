import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { I18nService } from '../../core/i18n';
import { ToastService } from '../../core/state/toast.service';
import { VaultStore } from '../../core/state/vault.store';
import { StoreListing } from '../../core/models';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { UiButton, UiCard, UiEmpty, UiIcon, UiSkeleton } from '../../shared/ui';

@Component({
  selector: 'app-store-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyPipe, TPipe, UiButton, UiCard, UiEmpty, UiIcon, UiSkeleton],
  templateUrl: './store-page.html',
  styleUrl: './store-page.scss',
})
export class StorePage {
  protected readonly store = inject(VaultStore);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /**
   * Whether to offer Add at all.
   *
   * Adding a listing writes a whole collection, so it is a write and the server
   * answers a Viewer with a 403 — which the page never asked about, so a Viewer
   * was offered a button that could only fail. A courtesy, not a control: see
   * the doc comment on VaultStore.canEdit.
   */
  protected readonly canEdit = computed(() => this.store.canEdit());

  /**
   * Which listing's add is in flight, if any.
   *
   * Per listing rather than global: adding one checklist is no reason to freeze
   * the button on another. Without it the button neither disabled itself nor
   * said anything for the whole round trip, so a slow add read as a dead
   * control and a double-click sent the import twice.
   */
  private readonly addingId = signal<string | null>(null);

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

  /** Whether this listing's own add is running. */
  protected isAdding(listing: StoreListing): boolean {
    return this.addingId() === listing.id;
  }

  /**
   * Imports a listing as a collection and opens it.
   *
   * Every path out reports or navigates, and none of them stays silent. A
   * refused import used to resolve to `null` and return here without a word, so
   * the only feedback was the button coming back to life — indistinguishable
   * from a click that never registered. The `catch` covers the same ground from
   * the other side: this is `await`ed straight from a click, so a rejection had
   * nowhere to go but an unhandled promise. `errorInterceptor` has already said
   * *why*; this says what it was for.
   */
  protected async add(listing: StoreListing): Promise<void> {
    if (this.isAdding(listing)) return;

    let created;
    this.addingId.set(listing.id);
    try {
      created = await this.store.importStoreListing(listing.id);
    } catch {
      created = null;
    } finally {
      this.addingId.set(null);
    }

    if (!created) {
      this.toast.error(this.i18n.t('toast.store.addFailed'));
      return;
    }
    this.toast.flash(this.i18n.t('toast.collection.added'));
    void this.router.navigate(['/c', created.id]);
  }
}
