import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
} from '@angular/core';

import { ConfirmService } from '../../../core/state/confirm.service';
import { I18nService } from '../../../core/i18n';
import { TPipe } from '../../pipes/t.pipe';
import { UiButton } from '../button/button';
import { UiDialog } from '../dialog/dialog';

/**
 * Global confirmation outlet — rendered once in the app shell, driven entirely
 * by {@link ConfirmService}.
 *
 * The same shape as `app-conflict-notice`: a service holds the one question
 * being asked, this renders it, and the page that asked knows nothing about
 * either. That is what keeps a confirmation a two-line `await` at the call site
 * instead of a modal every page has to declare, wire and remember to close.
 *
 * It is an `alertdialog`, not a `dialog`: the body is not decoration around a
 * choice, it *is* the message — "Delete Rubber Soul? Its copies and photos go
 * with it" — and `alertdialog` is what makes a screen reader read it out with
 * the name instead of leaving it to be discovered.
 *
 * **A destructive question opens with the focus on Cancel.** Everything that
 * reaches this dialog got here by a click, and a click is often the tail of a
 * keyboard reflex; if the confirming button had the focus, Enter would finish
 * the gesture that opened the dialog. Escape and the scrim already mean "no" —
 * this makes the default keypress mean "no" as well.
 */
@Component({
  selector: 'ui-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiButton, UiDialog],
  template: `
    @if (confirm.pending(); as request) {
      <!-- Bound rather than written as a literal attribute: a static
           role of alertdialog would ALSO land on this ui-dialog host element in
           the DOM, leaving two nested elements claiming to be the same dialog. -->
      <ui-dialog
        [role]="'alertdialog'"
        [title]="request.titleKey | t"
        [describedBy]="bodyId"
        (dismissed)="confirm.answer(false)"
      >
        <p class="confirm__body" [id]="bodyId">
          {{ request.bodyKey | t: request.bodyParams }}
        </p>
        <ng-container dlgActions>
          <ui-button
            class="confirm__cancel"
            variant="ghost"
            (click)="confirm.answer(false)"
          >{{ (request.cancelKey ?? 'common.cancel') | t }}</ui-button>
          <ui-button
            class="confirm__ok"
            [variant]="request.tone === 'danger' ? 'danger' : 'primary'"
            (click)="confirm.answer(true)"
          >{{ request.confirmKey | t }}</ui-button>
        </ng-container>
      </ui-dialog>
    }
  `,
  styles: `
    .confirm__body {
      margin: 0;
    }
  `,
})
export class UiConfirm {
  protected readonly confirm = inject(ConfirmService);
  private readonly host = inject(ElementRef<HTMLElement>);
  /** Not read here — injected so the outlet re-renders when the language does. */
  private readonly i18n = inject(I18nService);

  /** Ties the body to the dialog's `aria-describedby`. */
  protected readonly bodyId = `confirm-body-${Math.random().toString(36).slice(2, 9)}`;

  /** The question this outlet has already moved focus for. */
  private focused: unknown = null;

  constructor() {
    // The `read` phase runs after every `mixedReadWrite` callback, which is
    // where `ui-dialog` focuses its panel. Registering here rather than in the
    // default phase is what lets this override that focus instead of racing it.
    afterRenderEffect({
      read: () => {
        const request = this.confirm.pending();
        if (!request) {
          this.focused = null;
          return;
        }
        if (this.focused === request) return;
        this.focused = request;

        // Only the destructive ones move the focus off the panel. For an
        // ordinary confirmation the panel is still the right landing spot: it
        // reads the whole dialog and cannot be answered by a stray keypress.
        if (request.tone !== 'danger') return;
        (this.host.nativeElement as HTMLElement)
          .querySelector<HTMLElement>('.confirm__cancel button')
          ?.focus({ preventScroll: true });
      },
    });
  }
}
