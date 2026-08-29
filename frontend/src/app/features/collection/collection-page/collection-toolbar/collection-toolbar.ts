import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  output,
} from '@angular/core';

import { I18nService, MessageKey } from '../../../../core/i18n';
import { GroupField, GroupSort } from '../../../../core/models';
import { DEFAULT_SORT, sortChoices, sortLabel } from '../../../../core/utils/sort.util';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { IconName, UiCheckbox, UiDropdown, UiIcon } from '../../../../shared/ui';
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
  imports: [TPipe, UiCheckbox, UiDropdown, UiIcon],
  templateUrl: './collection-toolbar.html',
  styleUrl: './collection-toolbar.scss',
})
export class CollectionToolbar {
  private readonly i18n = inject(I18nService);

  /** Custom fields available in the current group, own plus inherited. */
  readonly fields = input.required<GroupField[]>();
  /** The order the current group configures, if any. */
  readonly groupSort = input<GroupSort | null>(null);
  /** True while a search is forcing the item grid, whatever the view says. */
  readonly searching = input(false);
  /**
   * Nothing catalogued in the open scope and no declared set, computed once by
   * the page and shared with the hero.
   *
   * Every control on this bar except the breadcrumb narrows or redraws a list of
   * items. With no items there is nothing to narrow and nothing to redraw, so an
   * order, a column picker and three view toggles are neither usable nor
   * guidance — they are five dead controls standing between a brand-new
   * collection and the one link that fixes it.
   */
  readonly blank = input(false);

  /**
   * Field columns the user has hidden in this group. A preference, not URL
   * state — see `column-prefs.ts`.
   */
  readonly hiddenColumns = input<ReadonlySet<string>>(new Set());

  /** Null means "use the selected group's configured order". */
  readonly sortOverride = model<GroupSort | null>(null);
  readonly view = model.required<ViewMode>();

  readonly columnToggled = output<{ name: string; visible: boolean }>();

  /** Nothing to order when the pane shows group cards rather than items. */
  protected readonly showSort = computed(() => !this.blank() && this.view() !== 'dashboard');

  /** The view toggles pick how a list is drawn; with no list, they pick nothing. */
  protected readonly showViews = computed(() => !this.blank());

  /**
   * Only the table has columns, and only a group that declares fields has any
   * to choose between — a picker offering nothing is worse than no picker.
   */
  protected readonly showColumns = computed(
    () => !this.blank() && this.view() === 'list' && this.fields().length > 0,
  );

  protected isColumnVisible(name: string): boolean {
    return !this.hiddenColumns().has(name);
  }

  protected readonly effectiveSort = computed<GroupSort>(
    () => this.sortOverride() ?? this.groupSort() ?? DEFAULT_SORT,
  );

  protected readonly sortLabel = computed(() => sortLabel(this.effectiveSort(), this.i18n.t));

  protected readonly sortOptions = computed<SortMenuOption[]>(() => {
    const groupSort = this.groupSort();
    const choices = sortChoices(this.fields(), this.i18n.t).map(choice => ({
      id: sortId(choice),
      label: choice.label,
      sort: { by: choice.by, direction: choice.direction },
    }));
    return groupSort
      ? [
          {
            id: GROUP_DEFAULT_ID,
            label: this.i18n.t('toolbar.groupDefault', {
              label: sortLabel(groupSort, this.i18n.t),
            }),
            sort: null,
          },
          ...choices,
        ]
      : choices;
  });

  protected readonly activeSortId = computed(() => {
    const override = this.sortOverride();
    if (override) return sortId(override);
    return this.groupSort() ? GROUP_DEFAULT_ID : sortId(this.effectiveSort());
  });

  protected readonly views: { id: ViewMode; icon: IconName; label: MessageKey }[] = [
    { id: 'dashboard', icon: 'rows', label: 'view.dashboard' },
    { id: 'grid', icon: 'grid', label: 'view.grid' },
    { id: 'list', icon: 'list', label: 'view.list' },
  ];

  protected pickSort(option: SortMenuOption): void {
    this.sortOverride.set(option.sort);
  }
}
