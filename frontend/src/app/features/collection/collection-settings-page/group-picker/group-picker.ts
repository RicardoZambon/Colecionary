import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  model,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { GroupNode } from '../../../../core/models';
import { visibleTree } from '../../../../core/utils/groups.util';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { UiIcon } from '../../../../shared/ui';
import { TreeKeyboard } from '../../tree-keyboard';

interface PickerRow {
  node: GroupNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  selected: boolean;
  count: number;
}

/**
 * The hierarchy, as something you pick from.
 *
 * The settings page used to render every group's whole editor — name, order,
 * fields, sections — one after another down a single card. At two levels that
 * was a long page; at the five a real shelf reaches ("Bonecos ▸ Diecast ▸
 * 1987–1991 ▸ Original Bandai ▸ Espanha"), each with its own dividers, it was
 * unreadable, and the branch you came to fix was somewhere in the middle of it.
 * So the tab is a master–detail now: this is the master.
 *
 * Deliberately not `app-group-tree`. That one is the *map of a collection* —
 * every row carries a progress bar and links into the collection — and giving
 * it a mode for "actually, counts, and link to settings instead" would make one
 * component serve two masters. What the two genuinely share is shared: the
 * `visibleTree` walk and {@link TreeKeyboard}.
 *
 * A row is a real anchor writing `?g=`, not a button holding local state, so
 * selection is URL state like everything else here: back works, and a link to
 * "the group I was fixing" is a link somebody can send.
 */
@Component({
  selector: 'app-group-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe, UiIcon],
  templateUrl: './group-picker.html',
  styleUrl: './group-picker.scss',
})
export class GroupPicker {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  readonly groups = input.required<GroupNode[]>();
  /** Items in each group's whole subtree, so a parent is never shown as empty. */
  readonly counts = input.required<ReadonlyMap<string, number>>();
  readonly selectedId = input<string | null>(null);
  readonly expanded = model<ReadonlySet<string>>(new Set());

  protected readonly rows = computed<PickerRow[]>(() => {
    const expanded = this.expanded();
    const selected = this.selectedId();
    const counts = this.counts();
    return visibleTree(this.groups(), expanded).map(row => ({
      ...row,
      expanded: expanded.has(row.node.id),
      selected: selected === row.node.id,
      count: counts.get(row.node.id) ?? 0,
    }));
  });

  private readonly keys = new TreeKeyboard(
    this.host,
    () => this.rows().map(row => ({ ...row, id: row.node.id })),
    (id, open) => this.setExpanded(id, open),
    '.pick__link',
  );

  protected readonly focusedId = computed(() => this.keys.tabbableId(this.selectedId()));

  protected onKeydown(event: KeyboardEvent, index: number): void {
    this.keys.handle(event, index);
  }

  protected toggle(event: Event, id: string): void {
    // The disclosure sits beside the anchor, never inside it: opening a branch
    // and selecting a group are two different intents.
    event.stopPropagation();
    event.preventDefault();
    const next = new Set(this.expanded());
    if (!next.delete(id)) next.add(id);
    this.expanded.set(next);
  }

  private setExpanded(id: string, open: boolean): void {
    const next = new Set(this.expanded());
    if (open) next.add(id);
    else next.delete(id);
    this.expanded.set(next);
  }
}
