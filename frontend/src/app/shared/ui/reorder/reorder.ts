import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

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
 *
 * **A move says where the thing landed.** Pass `index` and `count` and the
 * buttons name the position in their own labels and announce the new one after
 * each move — without them a keyboard user pressed "move later" and heard
 * nothing at all, while the list silently re-ordered around them. They are
 * optional so that a call site which has not been updated keeps working; the
 * labels then read as they did before.
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
      [ariaLabel]="moveLabel(-1)"
      (click)="move(-1)"
    ><ui-icon name="chevron-up" [size]="12" /></ui-button>
    <ui-button
      variant="ghost"
      size="sm"
      [disabled]="last()"
      [ariaLabel]="moveLabel(1)"
      (click)="move(1)"
    ><ui-icon name="chevron-down" [size]="12" /></ui-button>
    <!--
      Present from the start and empty, because a live region only announces
      what changes inside one already being observed. This is the only statement
      that the move happened: the list re-orders somewhere else on the page.
    -->
    <span class="sr-only" role="status">{{ announcement() }}</span>
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
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Names the thing being moved, for the buttons' accessible labels. */
  readonly label = input('item');
  readonly first = input(false);
  readonly last = input(false);
  /** Zero-based position in the list, for the labels and the announcement. */
  readonly index = input(0);
  /** How many things are in the list. `0` means "not told", not "empty". */
  readonly count = input(0);
  /** -1 to move earlier, +1 to move later. */
  readonly moved = output<-1 | 1>();

  protected readonly announcement = signal('');

  /** "Move Zelda later (now 3 of 12)" — position without having to move. */
  protected moveLabel(direction: -1 | 1): string {
    const name = this.label();
    if (!this.count()) {
      return this.i18n.t(direction === -1 ? 'ui.reorder.earlier' : 'ui.reorder.later', { name });
    }
    return this.i18n.t(direction === -1 ? 'ui.reorder.earlierAt' : 'ui.reorder.laterAt', {
      name,
      position: this.index() + 1,
      total: this.count(),
    });
  }

  /**
   * Moves, and keeps focus somewhere.
   *
   * The button that completes the last move is the button that is about to be
   * `disabled`, and the browser blows focus off a disabled element — so the
   * next Tab restarts at the top of the document and the user cannot tell "it
   * stopped moving" from "the control vanished". Focus goes to the sibling
   * first, which stays live.
   */
  protected move(direction: -1 | 1): void {
    const next = this.index() + direction;
    const total = this.count();
    const willDisable = total ? next <= 0 || next >= total - 1 : false;
    if (willDisable) {
      const buttons = (this.host.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
        'button',
      );
      buttons[direction === -1 ? 1 : 0]?.focus();
    }

    this.moved.emit(direction);
    this.announcement.set(
      total
        ? this.i18n.t('ui.reorder.moved', {
            name: this.label(),
            position: next + 1,
            total,
          })
        : this.i18n.t('ui.reorder.movedPlain', { name: this.label() }),
    );
  }

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
