import { signal } from '@angular/core';

/**
 * The drag half of a drag-to-reorder list. Both the grid and the table need
 * the same four handlers and the same `dataTransfer` fiddling, so it lives
 * here as a plain class each of them instantiates as a field — testable
 * without TestBed, and impossible to get subtly different in two places.
 *
 * It owns only the gesture. Where the item lands, and persisting that, stays
 * with whoever owns the collection.
 *
 * **Both halves of the gesture are visible.** `index` says what is being
 * carried and `overIndex` says where it would land, and a stylesheet has to
 * paint both: for a long time neither was painted at all — the class was bound
 * in both views and defined in no stylesheet — so pressing and dragging a card
 * changed nothing on screen until the list jumped into a new order the user had
 * to read back to check.
 */
export class DragOrder {
  /** Index being dragged, for the visual "lifted" state. Null when idle. */
  readonly index = signal<number | null>(null);
  /**
   * Index the pointer is currently over, for the insertion marker. Null when
   * idle, and also null while the pointer is over the dragged item itself —
   * marking the slot a thing already occupies as its destination says nothing.
   */
  readonly overIndex = signal<number | null>(null);

  constructor(private readonly enabled: () => boolean) {}

  start(event: DragEvent, index: number): void {
    if (!this.enabled()) return;
    this.index.set(index);
    this.overIndex.set(null);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  /**
   * `index` is where the pointer is, which is what the drop marker needs. It is
   * optional so a caller that only wants the browser to fire a drop keeps
   * working; without it the list simply shows nothing about the target.
   */
  over(event: DragEvent, index?: number): void {
    if (!this.enabled() || this.index() === null) return;
    // Without preventDefault the browser never fires a drop.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    if (index !== undefined) this.overIndex.set(index === this.index() ? null : index);
  }

  /** The index the drag started from, or null when there is nothing to apply. */
  drop(event: DragEvent): number | null {
    if (!this.enabled()) return null;
    event.preventDefault();
    const from = this.index();
    this.index.set(null);
    this.overIndex.set(null);
    return from;
  }

  end(): void {
    this.index.set(null);
    this.overIndex.set(null);
  }
}
