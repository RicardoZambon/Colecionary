import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { I18nService } from '../../../../core/i18n';
import { GroupNode } from '../../../../core/models';
import { GroupStats } from '../../../../core/utils/group-stats.util';
import { visibleTree } from '../../../../core/utils/groups.util';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { UiProgress, UiSectionLabel } from '../../../../shared/ui';

interface TreeRowView {
  node: GroupNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  selected: boolean;
  /** "1/2" — exact where the bar can only be approximate. */
  count: string;
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
 * this component doing anything about them.
 */
@Component({
  selector: 'app-group-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe, UiProgress, UiSectionLabel],
  templateUrl: './group-tree.html',
  styleUrl: './group-tree.scss',
})
export class GroupTree {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly i18n = inject(I18nService);

  readonly collectionId = input.required<string>();
  readonly groups = input.required<GroupNode[]>();
  readonly stats = input.required<ReadonlyMap<string, GroupStats>>();
  readonly selectedId = input<string | null>(null);
  readonly expanded = model<ReadonlySet<string>>(new Set());

  /** Asked to hide itself. The page owns whether the panel is shown. */
  readonly collapse = output<void>();

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
   * Exactly one row is tabbable, the rest are reachable by arrow keys. Without
   * a roving tabindex a hundred-group tree becomes a hundred tab stops.
   */
  protected readonly focusedId = computed(() => {
    const rows = this.rows();
    const selected = this.selectedId();
    if (selected && rows.some(r => r.node.id === selected)) return selected;
    return rows[0]?.node.id ?? null;
  });

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
    const rows = this.rows();
    const row = rows[index];
    if (!row) return;

    switch (event.key) {
      case 'ArrowDown':
        this.focusRow(index + 1);
        break;
      case 'ArrowUp':
        this.focusRow(index - 1);
        break;
      case 'ArrowRight':
        // Open first, then descend — two presses to reach a child, which is
        // what the WAI-ARIA tree pattern specifies.
        if (row.hasChildren && !row.expanded) this.setExpanded(row.node.id, true);
        else if (row.hasChildren) this.focusRow(index + 1);
        else return;
        break;
      case 'ArrowLeft':
        if (row.hasChildren && row.expanded) this.setExpanded(row.node.id, false);
        else this.focusParent(rows, index);
        break;
      case 'Home':
        this.focusRow(0);
        break;
      case 'End':
        this.focusRow(rows.length - 1);
        break;
      case ' ':
        // Anchors ignore Space; the tree pattern expects it to activate.
        (event.target as HTMLElement).click();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  private setExpanded(id: string, open: boolean): void {
    const next = new Set(this.expanded());
    if (open) next.add(id);
    else next.delete(id);
    this.expanded.set(next);
  }

  private focusParent(rows: TreeRowView[], index: number): void {
    const depth = rows[index].depth;
    for (let i = index - 1; i >= 0; i--) {
      if (rows[i].depth < depth) {
        this.focusRow(i);
        return;
      }
    }
  }

  private focusRow(index: number): void {
    const links = this.host.nativeElement.querySelectorAll<HTMLElement>('.row__link');
    links.item(index)?.focus();
  }
}
