import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  input,
  output,
} from '@angular/core';

/**
 * The modal shell: a scrim, a panel, a heading, and whatever the caller puts
 * inside it.
 *
 * It owns only the things every modal has to get right and that are easy to get
 * wrong once per dialog — the `role`/`aria-modal` pair, the accessible name
 * wired to the visible heading, Escape, a click on the scrim, and moving focus
 * into the panel when it opens and not before. What the dialog *says* is the
 * caller's business.
 *
 * Content goes in through three slots so that the panel's own padding and the
 * separator above the actions live here rather than being re-derived by each
 * caller:
 *
 * ```html
 * <ui-dialog [title]="'x' | t" (dismissed)="close()">
 *   <p>Body copy.</p>
 *   <ng-container dlgActions>
 *     <ui-button variant="ghost" (click)="close()">Cancel</ui-button>
 *   </ng-container>
 * </ui-dialog>
 * ```
 *
 * **Dismissal is always safe.** `dismissed` fires for Escape and for the scrim,
 * and a caller must treat both as "nothing happened" — never as a confirmation.
 * That is the same rule the framing overlay follows, and for the same reason: a
 * dialog you cannot get out of by reflex is one people answer at random.
 */
@Component({
  selector: 'ui-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.escape)': 'dismissed.emit()',
    '[class.ui-dialog--wide]': "size() === 'wide'",
  },
  template: `
    <div class="scrim" (click)="dismissed.emit()"></div>
    <div
      class="panel"
      [attr.role]="role()"
      aria-modal="true"
      [attr.aria-labelledby]="titleId"
      [attr.aria-describedby]="describedBy() || null"
      tabindex="-1"
    >
      <h2 class="panel__title" [id]="titleId">{{ title() }}</h2>
      <div class="panel__body">
        <ng-content />
      </div>
      <div class="panel__actions">
        <ng-content select="[dlgActions]" />
      </div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--sp-4);
    }

    .scrim {
      position: absolute;
      inset: 0;
      /*
       * One scrim opacity for the whole app. Two overlays that dim the page by
       * different amounts read as two different depths of interruption, which
       * is a distinction nothing here is trying to make.
       */
      background: rgb(0 0 0 / 78%);
    }

    .panel {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
      width: min(460px, 100%);
      /*
       * Tall content scrolls inside the panel, never the page behind it. A
       * dialog listing forty affected items is a real case.
       */
      max-height: calc(100vh - var(--sp-12));
      padding: var(--sp-5) var(--sp-6);
      background: var(--panel);
      border: var(--bw) solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }

    /*
     * One step wider, for the dialogs whose body is a table rather than a
     * sentence. A width input rather than a page-side override: rule 2 puts
     * every visual decision in the component, and a page that reached in to
     * restyle .panel would be styling another component's private class.
     */
    :host(.ui-dialog--wide) .panel {
      width: min(780px, 100%);
    }

    .panel:focus-visible {
      outline: none;
    }

    .panel__title {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--fs-xl);
      font-weight: 700;
      letter-spacing: var(--ls-display);
      color: var(--text);
    }

    .panel__body {
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);
      overflow-y: auto;
      font-size: var(--fs-md);
      color: var(--text2);
      line-height: 1.5;

      /*
       * Room for a focus ring, given back to the layout.
       *
       * A tall dialog has to scroll its body, and asking for overflow-y: auto
       * silently makes overflow-x compute to auto too — the spec forbids one
       * axis being visible while the other is not. So this box clips
       * horizontally, and the ring a full-width control draws OUTSIDE itself
       * (outline-offset plus outline-width, then the halo box-shadow) is drawn
       * into that clipped strip. The result is a focused textarea or text input
       * whose ring is complete top and bottom and missing down both sides,
       * which reads as a rendering fault rather than as focus.
       *
       * The padding buys the ring its space; the equal negative margin spends
       * it back out of the panel's own padding, so the content stays aligned
       * with the title above it and nothing moves.
       */
      --ring-room: calc(var(--focus-width) + var(--focus-offset) * 2);
      padding-inline: var(--ring-room);
      margin-inline: calc(var(--ring-room) * -1);
    }

    .panel__actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--sp-2);
      padding-top: var(--sp-3);
      border-top: var(--bw) solid var(--border);
    }

    @media (max-width: 560px) {
      :host {
        /*
         * On a phone a centred card wastes the only dimension there is. Dock it
         * to the bottom, where a thumb already is.
         */
        align-items: flex-end;
        padding: 0;
      }

      .panel {
        width: 100%;
        max-height: 90vh;
        border-radius: var(--radius) var(--radius) 0 0;
        border-bottom: 0;
      }

      .panel__actions {
        /*
         * Stacked and reversed: the confirming action is the one a thumb
         * reaches first, and it is the one that was read last.
         */
        flex-direction: column-reverse;
      }
    }
  `,
})
export class UiDialog {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly title = input.required<string>();
  /** Id of the element inside the body that names the consequence, if any. */
  readonly describedBy = input('');
  /**
   * `alertdialog` for the ones that interrupt to ask about a consequence — a
   * destructive confirmation, chiefly. It makes assistive technology announce
   * the body along with the name, which for those is the whole message. Plain
   * `dialog` otherwise, and that stays the default.
   */
  readonly role = input<'dialog' | 'alertdialog'>('dialog');

  /**
   * `wide` for a dialog whose body is a table or a preview — content that reads
   * as a column of fragments at the default width. It changes nothing below
   * `560px`, where the panel is already docked to the full width of the screen.
   */
  readonly size = input<'default' | 'wide'>('default');

  /** Escape, or a click on the scrim. Always means "nothing happened". */
  readonly dismissed = output<void>();

  /** Unique per instance so two open dialogs cannot share an aria target. */
  protected readonly titleId = `dlg-${Math.random().toString(36).slice(2, 9)}`;

  constructor() {
    afterRenderEffect(() => {
      // Focus the panel, not the first control. Focusing a control would let a
      // held Enter key answer the dialog before it has been read — and these
      // dialogs are the ones where that matters.
      const panel = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>('.panel');
      panel?.focus({ preventScroll: true });
    });
  }
}
