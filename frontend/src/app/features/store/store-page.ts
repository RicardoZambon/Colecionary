import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { I18nService } from '../../core/i18n';
import { ToastService } from '../../core/state/toast.service';
import { VaultStore } from '../../core/state/vault.store';
import { StoreListing } from '../../core/models';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { UiButton, UiCard } from '../../shared/ui';

@Component({
  selector: 'app-store-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyPipe, TPipe, UiButton, UiCard],
  templateUrl: './store-page.html',
  styleUrl: './store-page.scss',
})
export class StorePage {
  protected readonly store = inject(VaultStore);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

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
