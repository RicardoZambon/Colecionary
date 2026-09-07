import { Injectable, computed, signal } from '@angular/core';

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

  /**
   * The collection whose page is already saying this in its own words.
   *
   * See {@link claim}. Null means nobody has, which is the normal case: the
   * shell notice is the only voice for every write in the app except the
   * collection settings page's autosave.
   */
  private readonly claimed = signal<string | null>(null);

  /**
   * The conflict the shell should render, or null.
   *
   * Not the raw state: a refusal whose collection has been claimed is being
   * explained by the page itself, and two alerts for one event are two things
   * to answer — where answering either leaves the other on screen still
   * contradicting it.
   */
  readonly pending = computed(() => {
    const conflict = this.state();
    if (!conflict) return null;
    return conflict.collectionId === this.claimed() ? null : conflict;
  });

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

  /**
   * Says that one collection's own page is showing this refusal itself, so the
   * shell notice must stand down for it.
   *
   * A refused autosave on the collection settings page used to produce two
   * alerts at once — the page's `.moved-on` banner and the shell's notice —
   * with four buttons between them, both announced, and each unaware of the
   * other: answering the banner left the notice claiming "nothing was saved"
   * over a page that was saving normally again. The banner is the better of the
   * two (it sits with the work, and its buttons act on the draft), so it is the
   * one that speaks.
   *
   * Deliberately one claim and not a set. Only one page holds a draft at a
   * time, and `raise` already keeps only one conflict. Pass null to release —
   * the claimant must, on destroy as well as when it stops showing its banner,
   * or a later refusal of that collection from anywhere else would be silent.
   */
  claim(collectionId: string | null): void {
    this.claimed.set(collectionId);
  }
}
