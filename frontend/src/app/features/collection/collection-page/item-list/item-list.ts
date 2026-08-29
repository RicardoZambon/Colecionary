import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { I18nService } from '../../../../core/i18n';
import { GroupField, GroupSort, Item } from '../../../../core/models';
import { valueIsPaid } from '../../../../core/utils/copies.util';
import { formatFieldValue, isFieldRightAligned } from '../../../../core/utils/field-format.util';
import { GroupStats } from '../../../../core/utils/group-stats.util';
import { listTotals } from '../../../../core/utils/list-totals.util';
import { SectionChunk } from '../../../../core/utils/sections.util';
import { fieldSortKey, fieldValue } from '../../../../core/utils/sort.util';
import { ItemValuePipe } from '../../../../shared/pipes/item-value.pipe';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { UiCard, UiCheckbox, UiReorder } from '../../../../shared/ui';
import { itemBadgeLabel, itemTone } from '../../../../shared/ui/badge/badge';
import { DragOrder } from '../drag-order';
import { SectionHeader } from '../section-header/section-header';
import { VaultStore } from '../../../../core/state/vault.store';

/** What a click on a row's checkbox reports. `shift` asks for a range. */
export interface RowPick {
  id: string;
  checked: boolean;
  shift: boolean;
}

/** The dense table view of the same items {@link ItemGrid} renders as cards. */
@Component({
  selector: 'app-item-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ItemValuePipe,
    MoneyPipe,
    TPipe,
    SectionHeader,
    UiCard,
    UiCheckbox,
    UiReorder,
  ],
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
   * The custom-field columns to render, already filtered by the user's column
   * preference — the merged ancestor path, in `fieldsFor`'s order.
   *
   * All of them, not just the nearest group's: the sort menu on the same screen
   * offers every inherited field, so restricting the columns would make a
   * column vanish while its ordering stayed on offer.
   */
  readonly fields = input<GroupField[]>([]);

  /** The order the list is actually in, for `aria-sort` on the headers. */
  readonly sort = input.required<GroupSort>();

  /** Which visible rows are selected, and the header's tri-state. */
  readonly selectedIds = input<ReadonlySet<string>>(new Set());
  readonly allSelected = input(false);
  readonly someSelected = input(false);

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
  readonly picked = output<RowPick>();
  readonly allPicked = output<boolean>();
  /** A column header was clicked; the page turns the key into `?sort=`/`?dir=`. */
  readonly sortByPicked = output<string>();

  protected readonly drag = new DragOrder(() => this.manual());

  /** The row count and per-currency totals under the last row. */
  protected readonly totals = computed(() => listTotals(this.items(), this.currency()));

  protected readonly rowsLabel = computed(() =>
    this.i18n.plural(this.totals().count, 'itemList.rows.one', 'itemList.rows.other'),
  );

  protected readonly heldLabel = computed(() =>
    this.i18n.t('itemList.footHeld', {
      owned: this.totals().owned,
      copies: this.totals().copies,
    }),
  );

  protected isSelected(item: Item): boolean {
    return this.selectedIds().has(item.id);
  }

  protected selectLabel(item: Item): string {
    return this.i18n.t('select.item', { name: item.name });
  }

  /**
   * Shift-click, and its keyboard twin.
   *
   * Space on a focused checkbox dispatches a real `click` carrying the modifier
   * state, so shift+Space *is* the keyboard equivalent of shift-click and needs
   * no separate handler — which is what rule 12 asks for. Shift+Enter is handled
   * inside `ui-checkbox`, which reports the state it moved the box to.
   *
   * This used to correct the reported state, because the shift+Enter path
   * reported the box's *pre-toggle* value. That was a bug in `ui-checkbox` and
   * it has been fixed there, with a spec; a caller compensating for a shared
   * component is a workaround that outlives the reason for it.
   */
  protected pick(item: Item, event: { checked: boolean; shift: boolean }): void {
    this.picked.emit({ id: item.id, checked: event.checked, shift: event.shift });
  }

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

  /**
   * The sort field's value, shown beside the name — but only while that field
   * has no column of its own. With the column on screen the chip would print
   * the same value twice on the same row.
   */
  protected fieldChip(item: Item): string | null {
    const name = this.sortFieldName();
    if (!name || this.fields().some(field => field.name === name)) return null;
    return fieldValue(item, name) || null;
  }

  // --- custom field columns ------------------------------------------------

  /**
   * A field's value ready to render. Display only — ordering keeps going
   * through `sort.util.ts` on the raw string.
   */
  protected cell(item: Item, field: GroupField): string {
    return formatFieldValue(fieldValue(item, field.name), field.type, this.i18n.locale());
  }

  protected rightAligned(field: GroupField): boolean {
    return isFieldRightAligned(field.type);
  }

  protected fieldKey(field: GroupField): string {
    return fieldSortKey(field.name);
  }

  // --- sortable headers ---------------------------------------------------

  /** `ascending` / `descending` on the column in force, `none` on the rest. */
  protected ariaSort(by: string): string {
    if (this.sort().by !== by) return 'none';
    return this.sort().direction === 'asc' ? 'ascending' : 'descending';
  }

  /**
   * What the header announces. The direction is in the accessible name and not
   * only in `aria-sort`, because these are buttons rather than real
   * `columnheader` cells and a reader that ignores the attribute would
   * otherwise never say which way the column is pointing.
   */
  protected sortTitle(by: string, label: string): string {
    if (this.sort().by !== by) return this.i18n.t('itemList.sortBy', { label });
    return this.sort().direction === 'asc'
      ? this.i18n.t('itemList.sortedAsc', { label })
      : this.i18n.t('itemList.sortedDesc', { label });
  }

  /** The arrow next to an active header. Empty for the columns not in force. */
  protected sortArrow(by: string): string {
    if (this.sort().by !== by) return '';
    return this.sort().direction === 'asc' ? '↑' : '↓';
  }

  protected onDrop(event: DragEvent, to: number): void {
    const from = this.drag.drop(event);
    if (from !== null && from !== to) this.moved.emit({ from, to });
  }
}
