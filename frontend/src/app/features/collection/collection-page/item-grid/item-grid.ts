import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ImagesApi } from '../../../../core/api/images-api';
import { I18nService } from '../../../../core/i18n';
import { Item } from '../../../../core/models';
import { ImageFocusService } from '../../../../core/state/image-focus.service';
import { isOwned, valueIsPaid } from '../../../../core/utils/copies.util';
import { GroupStats } from '../../../../core/utils/group-stats.util';
import { SectionChunk } from '../../../../core/utils/sections.util';
import { fieldValue } from '../../../../core/utils/sort.util';
import { ItemValuePipe } from '../../../../shared/pipes/item-value.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { UiBadge, UiCard, UiCheckbox, UiIcon, UiReorder } from '../../../../shared/ui';
import { itemBadgeLabel, itemTone } from '../../../../shared/ui/badge/badge';
import { DragOrder } from '../drag-order';
import { RowPick } from '../item-list/item-list';
import { SectionHeader } from '../section-header/section-header';
import { VaultStore } from '../../../../core/state/vault.store';

/**
 * The card grid. Purely a rendering of the items it is handed: filtering,
 * ordering and persistence all stay with the page, which is what lets the same
 * list be shown as a table instead without either view knowing about the other.
 */
@Component({
  selector: 'app-item-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ItemValuePipe,
    TPipe,
    SectionHeader,
    UiBadge,
    UiCard,
    UiCheckbox,
    UiIcon,
    UiReorder,
  ],
  templateUrl: './item-grid.html',
  styleUrl: './item-grid.scss',
})
export class ItemGrid {
  protected readonly images = inject(ImagesApi);
  protected readonly focus = inject(ImageFocusService);
  private readonly i18n = inject(I18nService);
  private readonly store = inject(VaultStore);

  readonly items = input.required<Item[]>();
  /**
   * The same items, cut into the runs their group's dividers describe. One
   * chunk with a null section is a group that declares none, which renders
   * exactly as the flat grid always did. Every entry carries its index in
   * `items`, so dragging and the keyboard move buttons keep working in list
   * coordinates rather than in chunk coordinates.
   */
  readonly chunks = input.required<SectionChunk[]>();
  readonly sectionStats = input<ReadonlyMap<string, GroupStats>>(new Map());
  /** The section the list is narrowed to, if any. */
  readonly activeSection = input<string | null>(null);
  readonly collectionId = input.required<string>();

  /**
   * Amounts here belong to this collection, so they follow its currency rather
   * than the account default — a collection may override it.
   */
  protected readonly currency = computed(() => this.store.currencyFor(this.collectionId()));
  /** Manual ordering is on, so the cards are draggable. */
  readonly manual = input(false);
  /** Set while ordering by a custom field — drives the chip on each cover. */
  readonly sortFieldName = input<string | null>(null);
  /** Group id → name. A Map rather than a function, so OnPush can memoise. */
  readonly groupNames = input.required<ReadonlyMap<string, string>>();

  /** Which visible cards are selected. Shared with the table, row for row. */
  readonly selectedIds = input<ReadonlySet<string>>(new Set());

  readonly moved = output<{ from: number; to: number }>();
  readonly sectionToggled = output<string>();
  readonly picked = output<RowPick>();

  protected readonly drag = new DragOrder(() => this.manual());

  protected isOwned(item: Item): boolean {
    return isOwned(item);
  }

  protected isSelected(item: Item): boolean {
    return this.selectedIds().has(item.id);
  }

  protected selectLabel(item: Item): string {
    return this.i18n.t('select.item', { name: item.name });
  }

  /**
   * The card itself carries the routerLink, so the checkbox has to swallow its
   * own click — otherwise ticking a card opens it. Exactly what `ui-reorder`
   * does with the buttons it overlays, and for the same reason.
   */
  protected contain(event: Event): void {
    event.stopPropagation();
  }

  /** Same contract as the table's; see `ItemList.pick` for the shift path. */
  protected pick(item: Item, event: { checked: boolean; shift: boolean }): void {
    const already = this.isSelected(item);
    const checked = event.checked === already ? !already : event.checked;
    this.picked.emit({ id: item.id, checked, shift: event.shift });
  }

  /** Explains the `≈` on a card whose value is a price paid, not an estimate. */
  protected valueHint(item: Item): string | null {
    return valueIsPaid(item) ? this.i18n.t('value.fromPaidHint') : null;
  }

  protected badgeTone(item: Item) {
    return itemTone(item);
  }

  protected badgeLabel(item: Item): string {
    return itemBadgeLabel(item, this.i18n.t);
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
