import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { I18nService } from '../core/i18n';
import { ToastService } from '../core/state/toast.service';
import { VaultStore } from '../core/state/vault.store';

/**
 * "New collection", as one behaviour rather than as one button.
 *
 * There are now three affordances for it — the dashboard's header action, the
 * dashboard's empty state and the sidebar's collections heading — because the
 * single one that existed was a dashed tile at the *end* of the collections
 * grid, below the fold past about a dozen collections, and the sidebar's own
 * Collections section (where a user goes to manage collections) had none at
 * all. Three copies of a *write*, each with its own catch and its own toast,
 * would be three chances to get the failure handling wrong; this is the one
 * copy they share.
 *
 * {@link pending} is why it is a service and not a function: two of those
 * affordances can be on screen together, and without a shared flag a click on
 * each makes two collections nobody asked for.
 */
@Injectable({ providedIn: 'root' })
export class NewCollectionAction {
  private readonly store = inject(VaultStore);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /** True while the create request is in flight, so every button can say so. */
  readonly pending = signal(false);

  /**
   * Creates an empty collection and opens it for naming.
   *
   * The `catch` is the point: this is called straight from a click, so a
   * refused create used to reject into nothing — an unhandled promise, no
   * message, and a button that looked broken. Nothing is navigated to on a
   * failure either, since the collection it would open does not exist.
   */
  async run(): Promise<void> {
    if (this.pending()) return;
    this.pending.set(true);
    let created;
    try {
      created = await this.store.createCollection(this.i18n.t('dashboard.newCollectionName'), '');
    } catch {
      // `errorInterceptor` has already said *why*; this says what it was for.
      this.toast.error(this.i18n.t('toast.collection.createFailed'));
      return;
    } finally {
      this.pending.set(false);
    }
    this.toast.success(this.i18n.t('toast.collection.created'));
    // `new` marks the arrival as "just created", so the settings page can put
    // the caret in the Name box and select the placeholder name it was given —
    // the toast says "name it here", and the page has to keep that promise.
    void this.router.navigate(['/c', created.id, 'settings'], {
      queryParams: { tab: 'general', new: 1 },
    });
  }
}
