import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

import { GroupField, GroupSort } from '../../../../core/models';
import { DEFAULT_SORT, sortChoices, sortLabel } from '../../../../core/utils/sort.util';
import { UiDropdown } from '../../../../shared/ui';
import { ViewMode } from '../view-mode';

/** A row in the sort menu. A null `sort` means "follow the group's default". */
interface SortMenuOption {
  id: string;
  label: string;
  sort: GroupSort | null;
}

const GROUP_DEFAULT_ID = 'group';

function sortId(sort: GroupSort): string {
  return `${sort.by}|${sort.direction}`;
}

/**
 * What the content pane is: how it is ordered and how it is drawn. Shares one
 * bar with the breadcrumb — where you are on the left, what you are looking at
 * on the right. The item filters live a line below, in `app-collection-filters`.
 */
@Component({
  selector: 'app-collection-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiDropdown],
  templateUrl: './collection-toolbar.html',
  styleUrl: './collection-toolbar.scss',
})
export class CollectionToolbar {
  /** Custom fields available in the current group, own plus inherited. */
  readonly fields = input.required<GroupField[]>();
  /** The order the current group configures, if any. */
  readonly groupSort = input<GroupSort | null>(null);
  /** True while a search is forcing the item grid, whatever the view says. */
  readonly searching = input(false);

  /** Null means "use the selected group's configured order". */
  readonly sortOverride = model<GroupSort | null>(null);
  readonly view = model.required<ViewMode>();

  /** Nothing to order when the pane shows group cards rather than items. */
  protected readonly showSort = computed(() => this.view() !== 'dashboard');

  protected readonly effectiveSort = computed<GroupSort>(
    () => this.sortOverride() ?? this.groupSort() ?? DEFAULT_SORT,
  );

  protected readonly sortLabel = computed(() => sortLabel(this.effectiveSort()));

  protected readonly sortOptions = computed<SortMenuOption[]>(() => {
    const groupSort = this.groupSort();
    const choices = sortChoices(this.fields()).map(choice => ({
      id: sortId(choice),
      label: choice.label,
      sort: { by: choice.by, direction: choice.direction },
    }));
    return groupSort
      ? [
          { id: GROUP_DEFAULT_ID, label: `Group default — ${sortLabel(groupSort)}`, sort: null },
          ...choices,
        ]
      : choices;
  });

  protected readonly activeSortId = computed(() => {
    const override = this.sortOverride();
    if (override) return sortId(override);
    return this.groupSort() ? GROUP_DEFAULT_ID : sortId(this.effectiveSort());
  });

  protected readonly views: { id: ViewMode; glyph: string; label: string }[] = [
    { id: 'dashboard', glyph: '▤', label: 'Group dashboard' },
    { id: 'grid', glyph: '▦', label: 'Item grid' },
    { id: 'list', glyph: '☰', label: 'Item list' },
  ];

  protected pickSort(option: SortMenuOption): void {
    this.sortOverride.set(option.sort);
  }
}
