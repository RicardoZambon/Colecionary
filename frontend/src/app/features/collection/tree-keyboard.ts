import { ElementRef } from '@angular/core';

/**
 * The WAI-ARIA tree keyboard pattern, as a plain class two trees instantiate.
 *
 * The collection page's map of a collection and the settings page's group
 * picker draw completely different rows — one carries progress bars, the other
 * item counts — but they navigate identically, because that is what a tree is.
 * Sixty lines of arrow handling copied into both is sixty lines that drift the
 * first time one of them is fixed, so it lives here instead, testable without
 * TestBed. Same bargain as {@link DragOrder}, which the grid and the table
 * share for the drag gesture.
 *
 * It owns only the keys and where focus lands. What a row *is*, and what
 * activating one does, stays with whoever renders it.
 */
export interface TreeKeyRow {
  id: string;
  /** Nesting depth, 0 at the root. Used to find a row's parent. */
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

export class TreeKeyboard {
  /**
   * @param host The component's own element, searched for the focusable rows.
   * @param rows The rows currently rendered, in render order.
   * @param setExpanded Opens or closes one node.
   * @param rowSelector CSS for the focusable element inside each row.
   */
  constructor(
    private readonly host: ElementRef<HTMLElement>,
    private readonly rows: () => readonly TreeKeyRow[],
    private readonly setExpanded: (id: string, open: boolean) => void,
    private readonly rowSelector: string,
  ) {}

  /**
   * Exactly one row is tabbable, the rest are reached with the arrows. Without
   * a roving tabindex a hundred-group tree becomes a hundred tab stops.
   */
  tabbableId(selectedId: string | null): string | null {
    const rows = this.rows();
    if (selectedId && rows.some(row => row.id === selectedId)) return selectedId;
    return rows[0]?.id ?? null;
  }

  handle(event: KeyboardEvent, index: number): void {
    const rows = this.rows();
    const row = rows[index];
    if (!row) return;

    switch (event.key) {
      case 'ArrowDown':
        this.focus(index + 1);
        break;
      case 'ArrowUp':
        this.focus(index - 1);
        break;
      case 'ArrowRight':
        // Open first, then descend — two presses to reach a child, which is
        // what the WAI-ARIA tree pattern specifies.
        if (row.hasChildren && !row.expanded) this.setExpanded(row.id, true);
        else if (row.hasChildren) this.focus(index + 1);
        else return;
        break;
      case 'ArrowLeft':
        if (row.hasChildren && row.expanded) this.setExpanded(row.id, false);
        else this.focusParent(rows, index);
        break;
      case 'Home':
        this.focus(0);
        break;
      case 'End':
        this.focus(rows.length - 1);
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

  private focusParent(rows: readonly TreeKeyRow[], index: number): void {
    const depth = rows[index].depth;
    for (let i = index - 1; i >= 0; i--) {
      if (rows[i].depth < depth) {
        this.focus(i);
        return;
      }
    }
  }

  private focus(index: number): void {
    this.host.nativeElement.querySelectorAll<HTMLElement>(this.rowSelector).item(index)?.focus();
  }
}
