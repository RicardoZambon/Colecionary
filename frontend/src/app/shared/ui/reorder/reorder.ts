import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { UiButton } from '../button/button';

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
  imports: [UiButton],
  host: { '(click)': 'contain($event)' },
  template: `
    <ui-button
      variant="ghost"
      size="sm"
      [disabled]="first()"
      [ariaLabel]="'Move ' + label() + ' earlier'"
      (click)="moved.emit(-1)"
    >↑</ui-button>
    <ui-button
      variant="ghost"
      size="sm"
      [disabled]="last()"
      [ariaLabel]="'Move ' + label() + ' later'"
      (click)="moved.emit(1)"
    >↓</ui-button>
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

    ::ng-deep .btn {
      padding: 2px 7px;
      background: var(--panel);
    }
  `,
})
export class UiReorder {
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
