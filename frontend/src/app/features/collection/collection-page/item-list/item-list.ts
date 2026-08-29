import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { I18nService } from '../../../../core/i18n';
import { Item } from '../../../../core/models';
import { valueIsPaid } from '../../../../core/utils/copies.util';
import { GroupStats } from '../../../../core/utils/group-stats.util';
import { SectionChunk } from '../../../../core/utils/sections.util';
import { fieldValue } from '../../../../core/utils/sort.util';
import { ItemValuePipe } from '../../../../shared/pipes/item-value.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { UiCard, UiReorder } from '../../../../shared/ui';
import { itemBadgeLabel, itemTone } from '../../../../shared/ui/badge/badge';
import { DragOrder } from '../drag-order';
import { SectionHeader } from '../section-header/section-header';
import { VaultStore } from '../../../../core/state/vault.store';

/** The dense table view of the same items {@link ItemGrid} renders as cards. */
@Component({
  selector: 'app-item-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ItemValuePipe, TPipe, SectionHeader, UiCard, UiReorder],
  templateUrl: './item-list.html',
  styleUrl: './item-list.scss',
})
export class ItemList {
  private readonly i18n = inject(I18nService);
  private readonly store = inject(VaultStore);

  readonly items = input.required<Item[]>();
  /** Same contract as {@link ItemGrid.chunks}: runs over a flat, ordered list. */
  readonly chunks = input.required<SectionChunk[]>();
  readonly sectionStats = input<ReadonlyMap<string, GroupStats>>(new Map());
  readonly activeSection = input<string | null>(null);
  readonly collectionId = input.required<string>();

  /**
   * Amounts here belong to this collection, so they follow its currency rather
   * than the account default — a collection may override it.
   */
  protected readonly currency = computed(() => this.store.currencyFor(this.collectionId()));
  readonly manual = input(false);
  readonly sortFieldName = input<string | null>(null);
  readonly groupNames = input.required<ReadonlyMap<string, string>>();

  readonly moved = output<{ from: number; to: number }>();
  readonly sectionToggled = output<string>();

  protected readonly drag = new DragOrder(() => this.manual());

  protected badgeTone(item: Item) {
    return itemTone(item);
  }

  /** Explains the `≈` on a row whose value is a price paid, not an estimate. */
  protected valueHint(item: Item): string | null {
    return valueIsPaid(item) ? this.i18n.t('value.fromPaidHint') : null;
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
