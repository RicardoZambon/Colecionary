import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ImagesApi } from '../../../../core/api/images-api';
import { Item } from '../../../../core/models';
import { ImageFocusService } from '../../../../core/state/image-focus.service';
import { isOwned } from '../../../../core/utils/copies.util';
import { fieldValue } from '../../../../core/utils/sort.util';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { UiBadge, UiCard, UiReorder } from '../../../../shared/ui';
import { itemBadgeLabel, itemTone } from '../../../../shared/ui/badge/badge';
import { DragOrder } from '../drag-order';

/**
 * The card grid. Purely a rendering of the items it is handed: filtering,
 * ordering and persistence all stay with the page, which is what lets the same
 * list be shown as a table instead without either view knowing about the other.
 */
@Component({
  selector: 'app-item-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MoneyPipe, UiBadge, UiCard, UiReorder],
  templateUrl: './item-grid.html',
  styleUrl: './item-grid.scss',
})
export class ItemGrid {
  protected readonly images = inject(ImagesApi);
  protected readonly focus = inject(ImageFocusService);

  readonly items = input.required<Item[]>();
  readonly collectionId = input.required<string>();
  /** Manual ordering is on, so the cards are draggable. */
  readonly manual = input(false);
  /** Set while ordering by a custom field — drives the chip on each cover. */
  readonly sortFieldName = input<string | null>(null);
  /** Group id → name. A Map rather than a function, so OnPush can memoise. */
  readonly groupNames = input.required<ReadonlyMap<string, string>>();

  readonly moved = output<{ from: number; to: number }>();

  protected readonly drag = new DragOrder(() => this.manual());

  protected isOwned(item: Item): boolean {
    return isOwned(item);
  }

  protected badgeTone(item: Item) {
    return itemTone(item);
  }

  protected badgeLabel(item: Item): string {
    return itemBadgeLabel(item);
  }

  protected groupName(item: Item): string {
    return this.groupNames().get(item.groupId) ?? item.groupId;
  }

  /** The sort field's value for an item, or null when there is nothing to show. */
  protected fieldChip(item: Item): string | null {
    const name = this.sortFieldName();
    return name ? fieldValue(item, name) || null : null;
  }

  protected onDrop(event: DragEvent, to: number): void {
    const from = this.drag.drop(event);
    if (from !== null && from !== to) this.moved.emit({ from, to });
  }
}
