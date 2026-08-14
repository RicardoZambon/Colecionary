import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { I18nService } from '../../../../core/i18n';
import { Item } from '../../../../core/models';
import { fieldValue } from '../../../../core/utils/sort.util';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { UiCard, UiReorder } from '../../../../shared/ui';
import { itemBadgeLabel, itemTone } from '../../../../shared/ui/badge/badge';
import { DragOrder } from '../drag-order';

/** The dense table view of the same items {@link ItemGrid} renders as cards. */
@Component({
  selector: 'app-item-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MoneyPipe, TPipe, UiCard, UiReorder],
  templateUrl: './item-list.html',
  styleUrl: './item-list.scss',
})
export class ItemList {
  private readonly i18n = inject(I18nService);

  readonly items = input.required<Item[]>();
  readonly collectionId = input.required<string>();
  readonly manual = input(false);
  readonly sortFieldName = input<string | null>(null);
  readonly groupNames = input.required<ReadonlyMap<string, string>>();

  readonly moved = output<{ from: number; to: number }>();

  protected readonly drag = new DragOrder(() => this.manual());

  protected badgeTone(item: Item) {
    return itemTone(item);
  }

  protected badgeLabel(item: Item): string {
    return itemBadgeLabel(item, this.i18n.t);
  }

  protected groupName(item: Item): string {
    return this.groupNames().get(item.groupId) ?? item.groupId;
  }

  protected fieldChip(item: Item): string | null {
    const name = this.sortFieldName();
    return name ? fieldValue(item, name) || null : null;
  }

  protected onDrop(event: DragEvent, to: number): void {
    const from = this.drag.drop(event);
    if (from !== null && from !== to) this.moved.emit({ from, to });
  }
}
