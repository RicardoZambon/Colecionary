import { signal } from '@angular/core';

/**
 * The drag half of a drag-to-reorder list. Both the grid and the table need
 * the same four handlers and the same `dataTransfer` fiddling, so it lives
 * here as a plain class each of them instantiates as a field — testable
 * without TestBed, and impossible to get subtly different in two places.
 *
 * It owns only the gesture. Where the item lands, and persisting that, stays
 * with whoever owns the collection.
 */
export class DragOrder {
  /** Index being dragged, for the visual "lifted" state. Null when idle. */
  readonly index = signal<number | null>(null);

  constructor(private readonly enabled: () => boolean) {}

  start(event: DragEvent, index: number): void {
    if (!this.enabled()) return;
    this.index.set(index);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  over(event: DragEvent): void {
    if (!this.enabled() || this.index() === null) return;
    // Without preventDefault the browser never fires a drop.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  /** The index the drag started from, or null when there is nothing to apply. */
  drop(event: DragEvent): number | null {
    if (!this.enabled()) return null;
    event.preventDefault();
    const from = this.index();
    this.index.set(null);
    return from;
  }

  end(): void {
    this.index.set(null);
  }
}
