import { Injectable, computed, signal } from '@angular/core';

import { MessageKey } from '../i18n/messages';

/** How long a message that is only *information* stays on screen. */
const TOAST_DURATION_MS = 2600;

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
