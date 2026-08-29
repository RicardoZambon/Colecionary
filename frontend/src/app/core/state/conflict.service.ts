import { Injectable, signal } from '@angular/core';

/** A save the server refused because the collection had moved on. */
export interface Conflict {
  /** Which collection, so the notice can name it. */
  collectionId: string;
  /** The server's own words, already in the user's language. */
  message: string;
}

/**
 * The one save conflict the app is currently asking the user about.
 *
 * Shared and global for the same reason {@link ToastService} is: only one of
 * these can be on screen at a time, and the outlet that renders it lives in the
 * app shell rather than in whichever page happened to be saving.
 *
 * It is deliberately **not** a toast. A toast disappears, and the whole point of
 * this message is that the user's typed work is still on screen and still
 * unsaved — that is not something to say for 1.8 seconds and take away. It also
 * carries actions, and a toast has nowhere to put them.
 *
 * Dependency-free on purpose, exactly like `ToastService`: reloading the vault
 * is `VaultStore`'s job, and having this service call it would put a cycle
 * between the store and the thing the store reports into.
 */
@Injectable({ providedIn: 'root' })
export class ConflictService {
  private readonly state = signal<Conflict | null>(null);

  readonly pending = this.state.asReadonly();

  /**
   * Raises the notice. Last one wins — a second refusal while the first is
   * still on screen is the same situation, not a queue to work through.
   */
  raise(conflict: Conflict): void {
    this.state.set(conflict);
  }

  dismiss(): void {
    this.state.set(null);
  }
}
