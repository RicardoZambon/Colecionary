import { Injectable, computed, inject, signal } from '@angular/core';

import { SessionReset } from '../auth/session-reset';

import { MessageKey } from '../i18n/messages';

/**
 * How long a message that is only *information* stays on screen.
 *
 * 4 seconds, not the 2.6 it was: the toast lives in a corner the user is not
 * looking at, because they are looking at the thing they just did. 2.6 s is
 * the reading time for someone already watching — for everyone else it is the
 * time available to notice something happened at all, and the longest pt-BR
 * message is 45 characters.
 */
export const TOAST_DURATION_MS = 4000;

/**
 * What a toast is saying, in the only three registers this app has.
 *
 * `error` is not a colour choice: it changes the *lifetime*. Everything else
 * disappears on a timer; a failure waits to be dismissed, because a failure the
 * user did not see is a failure they believe succeeded.
 */
export type ToastTone = 'info' | 'success' | 'error';

/** One thing the user can do about the message, offered inside the toast. */
export interface ToastAction {
  labelKey: MessageKey;
  /** Runs on click. The toast closes first, so this may take as long as it likes. */
  run: () => void | Promise<void>;
}

export interface Toast {
  /** Monotonic, so the outlet can `track` it and re-animate per message. */
  readonly id: number;
  readonly message: string;
  readonly tone: ToastTone;
  readonly action?: ToastAction;
}

/**
 * The app's transient messages, one at a time, in the order they were said.
 *
 * **A queue, not a slot.** It used to be a single signal whose timer was
 * cleared by the next message, so two things happening in quick succession —
 * "photo added" then "couldn't save the item" — meant the second one silently
 * replaced the first, or the first replaced the second, depending on which won
 * the race. Whichever was lost was lost without trace. Now each message gets
 * its own turn.
 *
 * Identical text already showing or already waiting is dropped rather than
 * queued. That is what lets the global HTTP interceptor and a page's own
 * `catch` both report the same failure without the user reading it twice: the
 * two speak the same sentence, and the same sentence twice is noise, not
 * emphasis.
 *
 * Deliberately dependency-free — it takes finished strings, never keys, so
 * every caller does its own translating and this service never drags
 * `I18nService` into a TestBed. The one exception is {@link ToastAction},
 * whose label is a key: the button lives inside the outlet and can be
 * translated where it is rendered, which is also what keeps it correct when the
 * language changes while the toast is up.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly queueState = signal<readonly Toast[]>([]);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private nextId = 1;

  constructor() {
    /**
     * A message belongs to the session that produced it.
     *
     * An error does not expire, so without this the previous account's failure
     * outlived their session: a 500 naming Marcus's collection was still in the
     * corner of the next person's dashboard, and it named a collection they
     * cannot see. Registered here rather than cleared by `AuthService`, so the
     * auth layer keeps no import edge into the state layer.
     */
    inject(SessionReset).register(() => this.clear());
  }

  /** The toast on screen, or null. Everything else is waiting behind it. */
  readonly current = computed<Toast | null>(() => this.queueState()[0] ?? null);

  /** The visible message. Kept for the many callers that only ever read text. */
  readonly message = computed<string | null>(() => this.current()?.message ?? null);

  /** How many messages are still waiting, so the outlet can say so. */
  readonly waiting = computed(() => Math.max(this.queueState().length - 1, 0));

  /** Neutral news. The default tone, and what every existing caller gets. */
  flash(message: string, action?: ToastAction): void {
    this.show(message, 'info', action);
  }

  /** Something worked. Same lifetime as `flash`, different marker. */
  success(message: string, action?: ToastAction): void {
    this.show(message, 'success', action);
  }

  /** Something failed. Stays until dismissed — see {@link ToastTone}. */
  error(message: string, action?: ToastAction): void {
    this.show(message, 'error', action);
  }

  show(message: string, tone: ToastTone, action?: ToastAction): void {
    if (!message) return;
    // Same words, already said or about to be: emphasis is not what repeating
    // them achieves.
    if (this.queueState().some(t => t.message === message)) return;

    // A success retracts a failure that is still on screen.
    //
    // An error deliberately has no timer and deliberately holds the queue
    // behind it (see `arm`) — a consequence of a failure must not cover the
    // failure. But nothing retracted an error whose condition had *cleared*, so
    // after a retry succeeded the app showed "Could not reach the Vault server"
    // indefinitely, over a working page, with every later message stuck behind
    // it and counted as "+1 more".
    //
    // A success is evidence that the thing which failed now works, which is
    // exactly the fact the stale error contradicts. So it supersedes it. An
    // `info` message does not: it says nothing about whether the failure still
    // holds, and that is the case the queue-holding rule was written for.
    //
    // Which is why the tone a caller picks now carries weight. On an autosaving
    // page, "group added" is a change to the *draft* — it says nothing about
    // whether the last save reached the server, so it is `flash`. Reserve
    // `success` for a write that actually landed, or a local confirmation will
    // retract a save failure that still holds.
    if (tone === 'success') {
      this.queueState.update(queue => queue.filter(t => t.tone !== 'error'));
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    this.queueState.update(queue => [...queue, { id: this.nextId++, message, tone, action }]);
    this.arm();
  }

  /** Runs the current toast's action, if it has one, and closes it. */
  act(): void {
    const action = this.current()?.action;
    this.dismiss();
    void action?.run();
  }

  /** Drops the current message and lets the next one take its turn. */
  dismiss(): void {
    if (!this.queueState().length) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.queueState.update(queue => queue.slice(1));
    this.arm();
  }

  /** Empties the queue. For tests and for a hard navigation reset. */
  clear(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.queueState.set([]);
  }

  /**
   * Starts the head's timer, once.
   *
   * An error head is left without one on purpose, and that also holds the queue
   * behind it: the messages after a failure are almost always consequences of
   * it, and showing them over the top of the failure is how the failure gets
   * missed.
   *
   * That rule needs its one exception stated here too, or this comment reads as
   * "an error is forever": a **success** clears a pending error in
   * {@link show}, because a success is evidence the failed thing now works.
   * Without that exception the hold was unbounded — a cleared failure sat on
   * screen over a working page and everything behind it was never said.
   */
  private arm(): void {
    if (this.timer !== undefined) return;
    const head = this.current();
    if (!head || head.tone === 'error') return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.queueState.update(queue => queue.slice(1));
      this.arm();
    }, TOAST_DURATION_MS);
  }
}
