import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { I18nService } from '../../../core/i18n';
import { UiButton } from '../button/button';
import { UiIcon } from '../icon/icon';

/**
 * Keyboard-reachable move controls that sit on top of a draggable item. Drag
 * and drop alone is unusable without a pointer, so anything reorderable pairs
 * the drag with this.
 *
 * The host swallows clicks: these controls overlay things that are themselves
 * clickable (an item card carrying a routerLink), and reordering must never
 * double as "open it". Containing that here keeps every usage site from having
 * to remember it.
 */
@Component({
  selector: 'ui-reorder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiButton, UiIcon],
  host: { '(click)': 'contain($event)' },
  template: `
    <ui-button
      variant="ghost"
      size="sm"
      [disabled]="first()"
      [ariaLabel]="i18n.t('ui.reorder.earlier', { name: label() })"
      (click)="moved.emit(-1)"
    ><ui-icon name="chevron-up" [size]="12" /></ui-button>
    <ui-button
      variant="ghost"
      size="sm"
      [disabled]="last()"
      [ariaLabel]="i18n.t('ui.reorder.later', { name: label() })"
      (click)="moved.emit(1)"
    ><ui-icon name="chevron-down" [size]="12" /></ui-button>
  `,
  styles: `
    :host {
      position: absolute;
      top: 8px;
      right: 10px;
      display: flex;
      gap: 4px;
      z-index: 1;
    }

    /*
     * The doubled class is load-bearing, not a typo. These controls sit on top
     * of arbitrary photos, so they have to be opaque — but ui-button's own
     * .btn--ghost rule paints a transparent background at the same specificity
     * as a plain ::ng-deep .btn, and won on stylesheet order:
     * the panel this rule always meant to paint never appeared, leaving the
     * arrows invisible against a busy picture. Doubling the class outranks it
     * without reaching for !important, and without giving every other button in
     * the app a variant only this one place needs.
     *
     * The :host prefix is the other half, and just as load-bearing: ::ng-deep on
     * its own is not scoped to this component at all — it emits a plain global
     * rule, so these chip dimensions leaked onto every button on any page that
     * renders a reorder control, and "Save item" came out the size of an arrow.
     */
    :host ::ng-deep .btn.btn {
      padding: 2px 7px;
      background: var(--panel2);
      border-color: var(--border);
      color: var(--text);
    }

    /*
     * At either end of the list one arrow is disabled, and ui-button dims the
     * whole button to say so — which over a photo dims the chip back towards
     * transparent, the very thing this fixes. The chip stays solid and only the
     * mark fades, so "can't move further" still reads as a button.
     */
    :host ::ng-deep .btn.btn:disabled {
      opacity: 1;
      color: var(--text2);
    }
  `,
})
export class UiReorder {
  protected readonly i18n = inject(I18nService);

  /** Names the thing being moved, for the buttons' accessible labels. */
  readonly label = input('item');
  readonly first = input(false);
  readonly last = input(false);
  /** -1 to move earlier, +1 to move later. */
  readonly moved = output<-1 | 1>();

  /**
   * Stops the click reaching whatever this sits on. Covers the gap between the
   * buttons too, so a near-miss doesn't navigate either. preventDefault is here
   * for the case where the overlaid element is a real anchor — stopPropagation
   * alone would not hold there.
   */
  protected contain(event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
  }
}
