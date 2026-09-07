import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { I18nService } from '../../core/i18n';
import { ConflictService } from '../../core/state/conflict.service';
import { ToastService } from '../../core/state/toast.service';
import { VaultStore } from '../../core/state/vault.store';
import { TPipe } from '../../shared/pipes/t.pipe';
import { UiButton } from '../../shared/ui/button/button';

/**
 * Tells the user that a save was refused because somebody else got there first,
 * and offers the two things they can actually do about it.
 *
 * Not a toast, and that is the whole design. A toast says something for 1.8
 * seconds and takes it away; what has to be said here is that the work on screen
 * was **not** saved and is now the only copy of it. Vanishing after a moment is
 * the one behaviour that would turn a refusal into the silent data loss this
 * feature exists to prevent.
 *
 * It is also not a modal. The user's next move is usually to copy something out
 * of the form behind it, and a dialog that blocks the page would make the safe
 * option the hard one. It sits at the bottom of the screen, above the toast
 * outlet, and stays until it is answered.
 *
 * Reloading is offered plainly and never done automatically: it replaces what is
 * on screen, so it is the user's decision and the copy says so before they make
 * it.
 */
@Component({
  selector: 'app-conflict-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiButton],
  template: `
    @if (conflicts.pending(); as conflict) {
      <div class="notice" role="alert" aria-live="assertive">
        <div class="notice__text">
          <p class="notice__title">{{ 'conflict.title' | t }}</p>
          <!-- Which collection. The id has always been on the conflict, with a
               docblock saying it is there "so the notice can name it", and the
               template never read it: somebody with two collections open in
               two tabs, or who has since navigated to the dashboard, had no
               way to tell what had been refused. Nothing when the id no longer
               resolves — a name is better than none, and a wrong one is not. -->
          @if (inCollection(); as where) {
            <p class="notice__where">{{ where }}</p>
          }
          <!-- The server's own words, already in the user's language: it is the
               only place that knows what actually happened. -->
          <p class="notice__body">{{ conflict.message }}</p>
          <p class="notice__hint">{{ 'conflict.keepsYourWork' | t }}</p>
        </div>
        <div class="notice__actions">
          <ui-button variant="ghost" (click)="conflicts.dismiss()">
            {{ 'conflict.keep' | t }}
          </ui-button>
          <ui-button [disabled]="reloading()" (click)="reload()">
            {{ (reloading() ? 'conflict.reloading' : 'conflict.reload') | t }}
          </ui-button>
        </div>
      </div>
    }
  `,
  styles: `
    .notice {
      position: fixed;
      /*
       * The token, not a guess. --z-notice exists for this element and this
       * element sat at a raw 60 — under every dialog, every dropdown, every
       * toast and the drawer — so the app's only statement that a save did NOT
       * happen rendered dimmed and unclickable under a modal scrim, which is
       * the exact moment a bulk delete or an import refuses one.
       */
      right: var(--sp-5);
      /* Clear of the toast outlet, which docks at var(--sp-5) and is about
         var(--sp-12) tall: a notice overlapping the toast that reports the same
         failure hides half of each. */
      bottom: calc(var(--sp-12) + var(--sp-6));
      z-index: var(--z-notice);
      display: flex;
      flex-direction: column;
      gap: 14px;
      max-width: min(420px, calc(100vw - var(--sp-10)));
      padding: 16px 18px;
      border: 1px solid var(--border);
      border-left: 3px solid var(--accent);
      border-radius: var(--radius);
      background: var(--panel);
      box-shadow: var(--btn-shadow);
    }

    .notice__text {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .notice__title {
      margin: 0;
      color: var(--text);
      font-size: 13.5px;
      font-weight: 700;
    }

    .notice__body {
      margin: 0;
      color: var(--text);
      font-size: 12.5px;
      line-height: 1.5;
    }

    .notice__where {
      margin: 0;
      color: var(--muted-strong);
      font-size: 12px;
      font-weight: 600;
    }

    .notice__hint {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }

    .notice__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }
  `,
})
export class ConflictNotice {
  protected readonly conflicts = inject(ConflictService);
  private readonly store = inject(VaultStore);

  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly reloading = signal(false);

  /** "In Cavaleiros do Zodíaco", or nothing when the id no longer resolves. */
  protected readonly inCollection = computed(() => {
    const id = this.conflicts.pending()?.collectionId;
    const name = this.store.collection(id)?.name;
    return name ? this.i18n.t('conflict.inCollection', { name }) : '';
  });

  protected async reload(): Promise<void> {
    if (this.reloading()) return;
    this.reloading.set(true);
    try {
      await this.store.load();
      this.conflicts.dismiss();
    } catch {
      // The notice stays: dismissing it after a failed reload would leave the
      // user believing they are back in sync when nothing has changed.
      // `error`, not `flash`: a failure reported in the neutral tone is
      // unmarked, unannounced and gone in four seconds — and the notice it
      // belongs to is the one that must not be mistaken for handled.
      this.toast.error(this.i18n.t('conflict.reloadFailed'));
    } finally {
      this.reloading.set(false);
    }
  }
}
