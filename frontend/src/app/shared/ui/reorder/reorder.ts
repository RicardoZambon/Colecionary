import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
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
    <!--
      [muted], not [disabled], at either end. See move() for why: the browser
      blows focus off an element the moment it becomes disabled, and the button
      that completes the last move is the button that is about to be it.
    -->
    <ui-button
      variant="ghost"
      size="sm"
      [muted]="first()"
      [ariaLabel]="moveLabel(-1)"
      (click)="move(-1)"
    ><ui-icon name="chevron-up" [size]="12" /></ui-button>
    <ui-button
      variant="ghost"
      size="sm"
      [muted]="last()"
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
     * At either end of the list one arrow is unavailable, and ui-button dims it
     * to say so — which over a photo dims the chip back towards transparent,
     * the very thing this fixes. The chip stays solid and only the mark fades,
     * so "can't move further" still reads as a button. --text2 rather than
     * ui-button's own muted colour, which is a border token and unreadable on
     * this chip; the state is announced through aria-disabled either way, so
     * this is not colour carrying it alone.
     */
    :host ::ng-deep .btn.btn[aria-disabled='true'] {
      opacity: 1;
      color: var(--text2);
      cursor: default;
    }
  `,
})
export class UiReorder {
  protected readonly i18n = inject(I18nService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

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
   * Moves, and stays under the finger that pressed it.
   *
   * **Why the arrows are not `disabled`.** The button that completes the last
   * move is the button that is about to be unavailable, and the browser blows
   * focus off an element the moment it becomes disabled — so the next Tab
   * restarted at the top of the document and the user could not tell "it
   * stopped moving" from "the control vanished". This used to answer that by
   * focusing the *sibling* arrow, pre-emptively, before the emit. Two things
   * were wrong with it: it moved the user off the control they were operating,
   * so pressing "move earlier" four times left them somewhere else; and it
   * focused a sibling that the caller's re-render could destroy along with the
   * pressed one, which is how focus still reached `<body>`. `muted` keeps both
   * arrows focusable and announces the boundary through `aria-disabled`, so
   * nothing has to be handed anywhere.
   *
   * **Why the re-focus is after the render.** Whether the caller's list moves
   * its rows (`track` by id) or rebuilds them, that is decided long after this
   * handler returns. If the view survived, this puts focus back on the arrow
   * that was pressed; if it was destroyed, this hook is discarded with it and
   * the shell's own navigation rescue is the floor. Never before the render:
   * that is what made the old attempt aim at an element that no longer existed.
   */
  protected move(direction: -1 | 1): void {
    const next = this.index() + direction;
    const total = this.count();
    // A boundary arrow is focusable and reads as unavailable, so it can be
    // pressed. Pressing it is a no-op — moving past the end is not a move.
    if (direction === -1 ? this.first() : this.last()) return;

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

    afterNextRender(
      () => {
        const active = this.document.activeElement as HTMLElement | null;
        if (active && active !== this.document.body && active.isConnected) return;
        this.buttons()[direction === -1 ? 0 : 1]?.focus();
      },
      { injector: this.injector },
    );
  }

  private buttons(): HTMLElement[] {
    return [...(this.host.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('button')];
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
