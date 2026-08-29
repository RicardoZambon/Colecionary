import { Injectable, signal } from '@angular/core';

import { MessageKey, MessageParams } from '../i18n/messages';

/** What to ask, in keys — the outlet does the translating. */
export interface ConfirmRequest {
  titleKey: MessageKey;
  /** The consequence, named. `{placeholders}` come from `params`. */
  bodyKey: MessageKey;
  /**
   * Substituted into **both** the title and the body.
   *
   * One bag rather than two, because a title and a body describing one act
   * share their facts — "Delete «{name}»?" and "…{items} items in it" are the
   * same question asked twice at different lengths. It was `bodyParams` and fed
   * only the body, so the first title to use a placeholder rendered a literal
   * `{name}` on screen.
   */
  params?: MessageParams;
  confirmKey: MessageKey;
  /** Defaults to the shared "Cancel". */
  cancelKey?: MessageKey;
  /**
   * `danger` paints the confirming button with `--danger` and puts the initial
   * focus on **Cancel**, so a reflex Enter or Space answers "no".
   */
  tone?: 'danger' | 'default';
}

/** A question on screen, and the promise waiting on its answer. */
interface PendingConfirm {
  readonly request: ConfirmRequest;
  readonly resolve: (answer: boolean) => void;
}

/**
 * Asks the user a yes/no question that has a consequence, and resolves to what
 * they said.
 *
 * Shaped exactly like {@link ConflictService}: a signal holding the one thing
 * being asked, a global outlet (`ui-confirm`) rendering it from the app shell,
 * and no dependencies of its own. A page calls `ask()` and awaits a boolean; it
 * never imports a component, never owns a modal, and never has to remember to
 * render one.
 *
 * `ask()` resolving `false` is the answer for *everything* that is not an
 * explicit yes — Cancel, Escape, the scrim, and a second question arriving
 * before this one was answered. There is no third state and no rejection: a
 * caller that has to distinguish "said no" from "went away" would be a caller
 * about to guess, and the guess destroys data.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly state = signal<PendingConfirm | null>(null);

  /** The question being asked, for the outlet to render. */
  readonly pending = signal<ConfirmRequest | null>(null);

  ask(request: ConfirmRequest): Promise<boolean> {
    // A question that never got an answer cannot be left hanging: its promise
    // is awaited by a caller that is about to do something. Answering it "no"
    // is the only safe way to make room for the new one.
    this.state()?.resolve(false);

    return new Promise<boolean>(resolve => {
      this.state.set({ request, resolve });
      this.pending.set(request);
    });
  }

  /** Answers the open question. Ignored when nothing is being asked. */
  answer(confirmed: boolean): void {
    const open = this.state();
    if (!open) return;
    this.state.set(null);
    this.pending.set(null);
    open.resolve(confirmed);
  }
}
