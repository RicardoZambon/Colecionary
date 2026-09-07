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

import { I18nService } from '../../../../core/i18n';
import { GroupNode } from '../../../../core/models';
import { GroupStats } from '../../../../core/utils/group-stats.util';
import { visibleTree } from '../../../../core/utils/groups.util';
import { groupLinkParams } from '../../browse-params';
import { TreeKeyboard } from '../../tree-keyboard';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { UiEmpty, UiIcon, UiProgress, UiSectionLabel, UiTruncate } from '../../../../shared/ui';

interface TreeRowView {
  node: GroupNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  selected: boolean;
  /** "1/2" — exact where the bar can only be approximate. */
  count: string;
  /** What progress would be measured against. 0 means nothing declares one. */
  denominator: number;
  /** "×6" when the group holds more physical copies than it has items. */
  copiesNote: string | null;
  pct: number;
  secondaryPct: number | null;
  valueText: string;
}

/**
 * The map of the collection: every group, its item count and how far along it
 * is, at any depth.
 *
 * Rendered as one flat `<ul role="tree">` with `aria-level` rather than as
 * recursive components — the legal ARIA pattern, and far easier to keep
 * correct under OnPush with signal inputs. Every node is a real anchor, so
 * middle-click, open-in-new-tab and the global focus ring all work without
 * this component doing anything about them. `role="treeitem"` is on that
 * anchor and not on the `<li>` around it: ARIA state is reported for the
 * element that takes focus, and a plain link nested inside a `treeitem`
 * announced none of the tree at all.
 *
 * **A pure navigator, with no controls of its own.** Hiding the panel is the
 * breadcrumb strip's disclosure and only its — the two used to swap places, so
 * pressing either destroyed the button that had just been pressed.
 */
@Component({
  selector: 'app-group-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe, UiEmpty, UiIcon, UiProgress, UiSectionLabel, UiTruncate],
  templateUrl: './group-tree.html',
  styleUrl: './group-tree.scss',
})
export class GroupTree {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly i18n = inject(I18nService);

  /** Opening a group keeps the filters and drops the ad-hoc order. */
  protected readonly linkParams = groupLinkParams;

  readonly collectionId = input.required<string>();
  readonly groups = input.required<GroupNode[]>();
  readonly stats = input.required<ReadonlyMap<string, GroupStats>>();
  readonly selectedId = input<string | null>(null);
  readonly expanded = model<ReadonlySet<string>>(new Set());

  protected readonly rows = computed<TreeRowView[]>(() => {
    const stats = this.stats();
    const selected = this.selectedId();
    return visibleTree(this.groups(), this.expanded()).map(row => {
      const nodeStats = stats.get(row.node.id);
      const owned = nodeStats?.owned ?? 0;
      const denominator = nodeStats?.denominator ?? 0;
      return {
        ...row,
        expanded: this.expanded().has(row.node.id),
        selected: selected === row.node.id,
        count: `${owned}/${denominator}`,
        denominator,
        copiesNote:
          nodeStats && nodeStats.copies > nodeStats.catalogued ? `×${nodeStats.copies}` : null,
        pct: nodeStats?.pct ?? 0,
        // The ghost band only says something once a target sets a bigger
        // denominator than the catalogue itself.
        secondaryPct: nodeStats?.hasTarget ? nodeStats.cataloguedPct : null,
        valueText: this.i18n.t('progress.owned', { ratio: `${owned}/${denominator}` }),
      };
    });
  });

  /**
   * Arrow keys, Home/End and the roving tabindex, shared with the settings
   * page's group picker so the two trees can never navigate differently.
   */
  private readonly keys = new TreeKeyboard(
    this.host,
    () => this.rows().map(row => ({ ...row, id: row.node.id })),
    (id, open) => this.setExpanded(id, open),
    '.row__link',
  );

  protected readonly focusedId = computed(() => this.keys.tabbableId(this.selectedId()));

  protected toggle(event: Event, id: string): void {
    // The disclosure sits beside the anchor, not inside it, but a click here
    // must still never reach the row's own navigation.
    event.stopPropagation();
    event.preventDefault();
    const next = new Set(this.expanded());
    if (!next.delete(id)) next.add(id);
    this.expanded.set(next);
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    this.keys.handle(event, index);
  }

  private setExpanded(id: string, open: boolean): void {
    const next = new Set(this.expanded());
    if (open) next.add(id);
    else next.delete(id);
    this.expanded.set(next);
  }
}
